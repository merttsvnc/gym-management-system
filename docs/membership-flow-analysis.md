# Üyelik Akışı Analiz Raporu

> **Tarih:** 13 Nisan 2026  
> **Analiz Kapsamı:** Üyelik durumu, başlangıç/bitiş tarihi, ödeme kaydı ve üyelik geçerliliği ilişkisi  
> **Yöntem:** Backend kaynak kodu incelemesi (NestJS + Prisma + PostgreSQL)

---

## 1. Executive Summary

Sistem, üyelik yönetimini **tek tablo (Member)** üzerinden yürüten monolitik bir yapıya sahiptir. Ayrı bir `Membership` veya `Subscription` tablosu yoktur — üyelik bilgileri doğrudan `Member` tablosunda `membershipStartDate`, `membershipEndDate`, `membershipPlanId` ve `status` alanları olarak tutulur.

**Kritik bulgu:** Ödeme kaydı (`Payment`) ile üyelik tarihleri arasında **hiçbir otomatik bağlantı yoktur**. Payment tablosu tamamen finansal kayıt amaçlıdır ve oluşturulduğunda üyelik tarihlerini veya durumunu güncellemez. Benzer şekilde, `status` alanını değiştirmek de üyelik tarihlerini etkilemez. "Üyelik geçerliliği" (`membershipState`, `daysRemaining`) gibi türetilmiş alanlar tamamen `membershipEndDate` üzerinden hesaplanır ve `status` alanından bağımsızdır.

Bu tasarım, süresi dolmuş bir üyenin sadece status'unu ACTIVE yapmakla veya ödeme eklemekle tekrar geçerli hale gelmemesine neden olur — bu **beklenen davranıştır**, ancak mobilde bu işlemi kolaylaştıracak bir "üyelik yenileme" akışı eksiktir.

---

## 2. Data Model Analysis

### 2.1 İlgili Tablolar

#### Member Tablosu (Ana tablo)

`prisma/schema.prisma` — `Member` modeli

| Alan                               | Tip               | Açıklama                              |
| ---------------------------------- | ----------------- | ------------------------------------- |
| `id`                               | String (cuid)     | Üye ID                                |
| `tenantId`                         | String            | Kiracı izolasyonu                     |
| `branchId`                         | String            | Şube                                  |
| `membershipPlanId`                 | String            | Aktif üyelik planı FK                 |
| `membershipStartDate`              | DateTime          | Üyelik başlangıcı                     |
| `membershipEndDate`                | DateTime          | Üyelik bitişi                         |
| `membershipPriceAtPurchase`        | Decimal           | Plan alındığındaki fiyat snapshot'ı   |
| `status`                           | MemberStatus enum | ACTIVE / PAUSED / INACTIVE / ARCHIVED |
| `pausedAt`                         | DateTime?         | Dondurma başlangıcı                   |
| `resumedAt`                        | DateTime?         | Dondurma bitişi                       |
| `pendingMembershipPlanId`          | String?           | Bekleyen plan değişikliği             |
| `pendingMembershipStartDate`       | DateTime?         | Bekleyen plan başlangıcı              |
| `pendingMembershipEndDate`         | DateTime?         | Bekleyen plan bitişi                  |
| `pendingMembershipPriceAtPurchase` | Decimal?          | Bekleyen plan fiyatı                  |

#### MembershipPlan Tablosu

| Alan            | Tip               | Açıklama                                              |
| --------------- | ----------------- | ----------------------------------------------------- |
| `durationType`  | DurationType enum | DAYS veya MONTHS                                      |
| `durationValue` | Int               | Süre değeri                                           |
| `price`         | Decimal           | Plan fiyatı                                           |
| `status`        | PlanStatus        | ACTIVE / ARCHIVED                                     |
| `scope`         | PlanScope         | TENANT / BRANCH                                       |
| `autoRenew`     | Boolean           | Otomatik yenileme flag'i (henüz implemente edilmemiş) |

#### Payment Tablosu

| Alan                 | Tip                | Açıklama                                           |
| -------------------- | ------------------ | -------------------------------------------------- |
| `memberId`           | String             | Üye FK                                             |
| `amount`             | Decimal            | Ödeme tutarı                                       |
| `paidOn`             | DateTime           | Ödeme tarihi (DATE-ONLY, start-of-day UTC)         |
| `paymentMethod`      | PaymentMethod enum | CASH / CREDIT_CARD / BANK_TRANSFER / CHECK / OTHER |
| `isCorrection`       | Boolean            | Düzeltme kaydı mı?                                 |
| `correctedPaymentId` | String?            | Düzeltilen orijinal ödeme FK                       |
| `isCorrected`        | Boolean            | Bu ödeme düzeltilmiş mi?                           |

#### MemberPlanChangeHistory Tablosu

| Alan                           | Tip       | Açıklama                              |
| ------------------------------ | --------- | ------------------------------------- |
| `changeType`                   | String    | "SCHEDULED" / "APPLIED" / "CANCELLED" |
| `oldPlanId`, `newPlanId`       | String?   | Eski ve yeni plan                     |
| `oldStartDate`, `newStartDate` | DateTime? | Eski ve yeni başlangıç                |
| `oldEndDate`, `newEndDate`     | DateTime? | Eski ve yeni bitiş                    |

### 2.2 Kritik İlişkiler

```
Member ──────► MembershipPlan      (membershipPlanId)
Member ──────► MembershipPlan?     (pendingMembershipPlanId)
Member ──────► Payment[]           (one-to-many)
Member ──────► Branch              (branchId)
Payment ──────► Member             (memberId)
Payment ──────► Payment?           (correctedPaymentId — düzeltme zinciri)
```

**ÖNEMLİ:** `Payment` ile `MembershipPlan` arasında **doğrudan ilişki yoktur**. Payment hangi plan için yapıldığını bilmez.

### 2.3 Enum'lar

```typescript
enum MemberStatus {
  ACTIVE,
  PAUSED,
  INACTIVE,
  ARCHIVED,
}
enum DurationType {
  DAYS,
  MONTHS,
}
enum PlanStatus {
  ACTIVE,
  ARCHIVED,
}
```

### 2.4 Derived (Türetilmiş) Alanlar

Bu alanlar veritabanında saklanmaz, API response'unda hesaplanarak eklenir:

| Alan                 | Kaynak                                                      | Hesaplama mantığı                                   |
| -------------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| `remainingDays`      | `members.service.ts` → `calculateRemainingDays()`           | `membershipEndDate - now` (duraklatma hesabı dahil) |
| `isMembershipActive` | `membership-status.util.ts` → `calculateMembershipStatus()` | `membershipEndDate >= today`                        |
| `membershipState`    | Aynı util                                                   | `'ACTIVE'` veya `'EXPIRED'`                         |
| `daysRemaining`      | Aynı util                                                   | Gün farkı (expired ise 0)                           |
| `isExpiringSoon`     | Aynı util                                                   | active && daysRemaining ≤ 7                         |

**Kritik:** `membershipState` (ACTIVE/EXPIRED) ile `status` (ACTIVE/PAUSED/INACTIVE/ARCHIVED) **farklı kavramlardır**. `membershipState` tarih bazlı otomatik hesaplanır; `status` ise admin tarafından yönetilen üyelik durumudur.

---

## 3. Business Flow Analysis

### 3.1 Yeni Üye Oluşturma Akışı

**Endpoint:** `POST /api/v1/members`  
**Controller:** `members.controller.ts` → `create()`  
**Service:** `members.service.ts` → `create()`

**Adımlar:**

1. `branchId` validasyonu — şube tenant'a ait mi?
2. `phone` unique kontrolü (tenant scope'unda)
3. `membershipPlanId` validasyonu — plan var mı, ACTIVE mi, tenant'a ait mi?
4. **Başlangıç tarihi:** DTO'da `membershipStartDate` varsa o kullanılır, yoksa `new Date()` (şu anki zaman)
5. **Bitiş tarihi:** `calculateMembershipEndDate(startDate, plan.durationType, plan.durationValue)` ile hesaplanır
6. **Fiyat:** DTO'da `membershipPriceAtPurchase` varsa o, yoksa `plan.price` kullanılır
7. `status` her zaman `'ACTIVE'` olarak set edilir
8. `Member` kaydı oluşturulur
9. Response'a derived fields (remainingDays, membershipState, vb.) eklenir

**Etkilenen tablolar:** Sadece `Member` tablosu. Otomatik payment veya membership kaydı **oluşturulmaz**.

### 3.2 Üyelik Başlangıç/Bitiş Hesaplama Akışı

**Kaynak:** `membership-plans/utils/duration-calculator.ts` → `calculateMembershipEndDate()`

**Hesaplama Mantığı:**

- `DurationType.DAYS`: `date-fns/addDays(startDate, durationValue)` — basit gün ekleme
- `DurationType.MONTHS`: `date-fns/addMonths(startDate, durationValue)` — takvim ayı ekleme (ay sonu clamping)

**Örnekler:**

- 1 Ocak + 30 gün (DAYS) = 31 Ocak
- 1 Ocak + 1 ay (MONTHS) = 1 Şubat
- 31 Ocak + 1 ay (MONTHS) = 28/29 Şubat (date-fns ay sonu clamping)

**Timezone:** Başlangıç tarihi sunucu local time'ında `new Date()` ile alınır. `calculateMembershipEndDate` fonksiyonu timezone dönüşümü yapmaz — gelen tarihi olduğu gibi kullanır.

**Inclusive/Exclusive:** Bitiş tarihi **inclusive** mantıkla çalışır. Örneğin 1 Ocak + 30 gün = 31 Ocak. `membershipEndDate >= today` kontrolü yapıldığı için 31 Ocak günü hâlâ aktif sayılır; 1 Şubat'ta expired olur.

### 3.3 Süresi Dolan Üyeyi Tekrar Aktif Etme

#### 3.3.1 Mevcut Durum: Otomatik Mekanizma Yok

Sistemde süresi dolmuş bir üyeyi **otomatik olarak tekrar aktif etme** mekanizması **yoktur**. Yani:

- Ödeme eklemek üyelik tarihlerini güncellemez
- Status'u ACTIVE yapmak üyelik tarihlerini güncellemez
- Ayrı bir "renew" veya "extend" endpoint'i yoktur

#### 3.3.2 Mevcut Workaround: Manuel Tarih Güncelleme

Süresi dolmuş bir üyeyi tekrar aktif etmek için mevcut sistemdeki **tek yol:**

1. `PATCH /api/v1/members/:id` ile `membershipStartDate` ve `membershipEndDate` alanlarını **manuel olarak** güncellemek
2. Gerekirse `POST /api/v1/members/:id/status` ile `status`'u ACTIVE yapmak (eğer cron tarafından INACTIVE yapılmışsa)

**ÖNEMLİ:** Status değişikliği (`changeStatus`) sadece `status` alanını günceller; `membershipStartDate` / `membershipEndDate` alanlarını **etkilemez** (PAUSED→ACTIVE geçişi hariç — bu durumda dondurma süresince membershipEndDate uzatılır).

#### 3.3.3 Planlanmış Plan Değişikliği (Schedule)

`POST /api/v1/members/:id/schedule-membership-plan-change` endpoint'i ile:

- Mevcut üyelik bittiğinde yeni plan devreye girmek üzere zamanlanabilir
- `pendingMembershipStartDate = membershipEndDate + 1 gün`
- Cron job (`MembershipPlanChangeSchedulerService`, her gün 02:00 UTC) bekleyen değişiklikleri uygular

Ancak bu akış **süresi zaten dolmuş** üyeler için değil, **süresi dolmak üzere olan** üyeler için tasarlanmıştır. Süresi dolmuş bir üyeye de uygulanabilir ama sonuç olarak `pendingMembershipStartDate` eskimiş bir tarih olabilir.

#### 3.3.4 Cron: Status Senkronizasyonu

`MemberStatusSyncService` (`member-status-sync.service.ts`):

- Her gün 03:00 UTC'de çalışır
- `status = ACTIVE` VE `membershipEndDate < today` olan üyeleri bulur
- `status`'u `INACTIVE` olarak günceller
- **Tek yönlü:** Süresi dolan aktif üyelerin status'u INACTIVE yapılır, tersi yapılmaz

Bu cron, expired üyelerin status'unu otomatik olarak INACTIVE yapar. Ancak tersine bir mekanizma (INACTIVE → ACTIVE) yoktur.

### 3.4 Ödeme Ekleme Sonrası Çalışan Akış

**Endpoint:** `POST /api/v1/payments`  
**Controller:** `payments.controller.ts` → `create()`  
**Service:** `payments.service.ts` → `createPayment()`

**Adımlar:**

1. Idempotency key kontrolü (varsa)
2. `memberId` validasyonu — üye tenant'a ait mi?
3. Amount validasyonu (pozitif, max 999999.99, max 2 ondalık)
4. `paidOn` tarihi validasyonu (gelecekte olamaz) ve start-of-day UTC'ye truncate
5. `branchId` üyenin mevcut branch'inden otomatik alınır
6. `Payment` kaydı oluşturulur
7. Structured event log yazılır

**Side Effect'ler: HİÇBİRİ**

Payment oluşturulduktan sonra:

- ❌ `Member.status` güncellenmez
- ❌ `Member.membershipStartDate` güncellenmez
- ❌ `Member.membershipEndDate` güncellenmez
- ❌ `Member.membershipPlanId` güncellenmez
- ❌ Yeni Membership kaydı oluşturulmaz (zaten Membership tablosu yok)

**Payment tamamen finansal bir kayıt olarak tasarlanmıştır.** Üyelik yönetimi ile doğrudan entegrasyonu yoktur.

---

## 4. Scenario Investigation

### 4.1 Test Edilen Senaryo

> Süresi dolmuş bir üyenin durumunu manuel olarak ACTIVE yaptım, ancak üyelik başlangıç veya bitiş tarihi değişmedi. Ödeme kaydı da ekledim, buna rağmen üyelik geçerliliğini değiştiremedim.

### 4.2 Beklenen vs Gerçekleşen Davranış

| Adım                        | Beklenen (kullanıcı beklentisi) | Gerçekleşen (sistem davranışı)                                    | Neden?                                                                                                     |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Status → ACTIVE yapma       | Üyelik tekrar aktif olur        | Sadece `status` alanı ACTIVE olur; `membershipEndDate` aynı kalır | `changeStatus()` metodu tarih alanlarını güncellemez (PAUSED→ACTIVE hariç)                                 |
| Ödeme ekleme                | Üyelik uzar/yenilenir           | Sadece Payment kaydı oluşur                                       | `createPayment()` hiçbir member alanını güncellemez                                                        |
| Mobilde geçerlilik kontrolü | "Aktif" görünür                 | "Süresi Doldu / 0 Gün" görünür                                    | `membershipState` ve `daysRemaining` tamamen `membershipEndDate`'den türetilir; `status` alanını kullanmaz |

### 4.3 Detaylı Analiz

**Status alanı vs Membership geçerliliği birbirinden bağımsızdır:**

`enrichMemberWithComputedFields()` fonksiyonu (`members.service.ts`):

```typescript
const derivedStatus = calculateMembershipStatus(member.membershipEndDate);
// membershipState = endDate >= today ? 'ACTIVE' : 'EXPIRED'
```

Bu hesaplamada `member.status` kullanılmaz. Sadece `membershipEndDate` kullanılır. Yani:

- `status = ACTIVE` + `membershipEndDate = geçmişte` → **membershipState = EXPIRED, daysRemaining = 0**
- `status = INACTIVE` + `membershipEndDate = gelecekte` → **membershipState = ACTIVE, daysRemaining > 0**

Bu iki alan kasıtlı olarak ayrı tutulmuştur.

**Status değişikliğinin tarih alanlarını güncellememe nedeni:**

`changeStatus()` fonksiyonunda (`members.service.ts`), sadece şu durumlarda tarih güncellenir:

- `ACTIVE → PAUSED`: `pausedAt` set edilir, tarihler değişmez
- `PAUSED → ACTIVE`: `membershipEndDate` dondurma süresi kadar uzatılır

`INACTIVE → ACTIVE` geçişinde tarih güncellenmez — bu bilinçli tasarımdır, çünkü INACTIVE → ACTIVE geçişi "üyeliği yenileme" anlamına gelmez, sadece üye kaydının durumunu değiştirmektir.

---

## 5. Findings

### 5.1 Tasarımsal Davranışlar (Bug Değil)

1. **Payment → Member side effect yokluğu:** Payment tablosu bilinçli olarak sadece finansal kayıt tutar. Üyelik yönetimi ayrı bir konsept olarak ele alınmıştır.

2. **Status ve membershipState ayrımı:** `status` admin kontrolünde bir alan; `membershipState` tarih bazlı otomatik hesaplanan bir türetilmiş alan. Bu ayrım bilinçlidir.

3. **INACTIVE → ACTIVE geçişinde tarih güncellenmemesi:** Status değişikliği sadece admin durumunu yönetir, üyelik süresini uzatmaz.

4. **Cron ile expired üyelerin INACTIVE yapılması:** `MemberStatusSyncService` tek yönlü çalışır (ACTIVE → INACTIVE).

### 5.2 Eksik İmplementasyonlar

1. **Üyelik yenileme (renewal) endpoint'i eksik:** Süresi dolmuş bir üyenin üyeliğini yenilemek için ayrı bir endpoint/akış yoktur. Mevcut workaround PATCH ile manuel tarih güncellemedir ama bu iş kurallarını atlar.

2. **autoRenew flag'i implemente edilmemiş:** `MembershipPlan.autoRenew` alanı şemada var ancak hiçbir cron/job bu flag'i kontrol edip otomatik yenileme yapmaz. Tamamen pasif bir metadata alanıdır.

3. **Payment-Membership bağlantısı eksik:** Payment kaydı hangi plan için yapıldığını bilmez (`MembershipPlan` FK yok). Bu, ödeme-üyelik takibini zorlaştırır.

4. **Ödeme sonrası otomatik üyelik uzatma yok:** Bir "ödeme yapıldı → üyelik uzat" akışı mevcut değildir.

### 5.3 Tutarsızlıklar

1. **Status=ACTIVE ancak membershipState=EXPIRED:** Cron 03:00'te çalıştığı için gün içinde süresi dolan bir üye, ertesi gün gece 03:00'e kadar `status=ACTIVE` ama `membershipState=EXPIRED` kalabilir. Bu, API list sorgularında karışıklığa yol açabilir.

2. **findAll ACTIVE filtresi:** List API'de `status=ACTIVE` filtresi kullanıldığında `membershipEndDate >= today` koşulu da eklenir (`members.service.ts` ~satır 321-325). Bu, status=ACTIVE olup süresi dolmuş üyelerin listede görünmemesini sağlar — doğru davranıştır ama mobilde "aktif üyeler" listesinde görememe kafa karıştırıcı olabilir.

3. **UpdateMemberDto'da hem `membershipStartAt` hem `membershipStartDate` var:** Legacy ve yeni alan isimleri paralel kabul edilir (`members.service.ts` ~satır 511-520). Bu durum temizlenmemiş bir migration göstergesidir.

### 5.4 Edge Case'ler

1. **Manuel tarih güncellemesi plan süresini atlayabilir:** PATCH endpoint'i ile üyelik tarihleri serbestçe değiştirilebilir, plan süresiyle uyumlu olma zorunluluğu yoktur. Örneğin 1 aylık plan alınmış bir üyeye 1 yıllık tarih verilebilir.

2. **membershipPlanId değiştirilemiyor (v1 kısıtı):** `UpdateMemberDto`'da `@IsForbidden()` ile engellenmiş. Plan değişikliği sadece `schedulePlanChange()` ile yapılabilir ama bu mevcut dönem sonunu bekler.

3. **Status INACTIVE → ACTIVE yapıldığında:** Eğer `membershipEndDate` hâlâ geçmişteyse, bir sonraki cron çalışmasında (03:00) üye tekrar `INACTIVE` yapılacaktır.

---

## 6. Concrete Answers

### Soru 1: Üye kaydı sistemi nasıl çalışıyor?

Yeni üye `POST /api/v1/members` endpoint'i ile oluşturulur. Sadece `Member` tablosu etkilenir. Otomatik membership, subscription veya payment kaydı oluşturulmaz.

- `branchId` ve `membershipPlanId` zorunludur
- `membershipStartDate` opsiyoneldir (verilmezse `new Date()`)
- `membershipEndDate` plana göre otomatik hesaplanır (`calculateMembershipEndDate`)
- `membershipPriceAtPurchase` opsiyoneldir (verilmezse plan fiyatı)
- `status` her zaman `ACTIVE` olarak başlar
- Phone tenant içinde unique olmalıdır

Manuel kayıt ile ödeme üzerinden kayıt arasında fark yoktur çünkü ikisi arasında bağlantı yoktur. Üye oluşturma ve ödeme kaydetme tamamen ayrı işlemlerdir.

### Soru 2: Başlangıç ve bitiş nasıl hesaplanıyor?

**Başlangıç:** DTO'da `membershipStartDate` verilmişse o tarih kullanılır; verilmemişse `new Date()` (üye oluşturulma anı).

**Bitiş:** `calculateMembershipEndDate(startDate, durationType, durationValue)` fonksiyonu ile:

- `DAYS`: `date-fns/addDays(startDate, value)` — örn. 30 gün
- `MONTHS`: `date-fns/addMonths(startDate, value)` — örn. 1 ay (takvim ayı, ay sonu clamping'li)

**Süre uzatma:**

- PAUSED → ACTIVE geçişinde dondurma süresi kadar uzatılır (`changeStatus()`)
- Zamanlanmış plan değişikliğinde yeni tarihler hesaplanır (`schedulePlanChange()`)
- Bunlar dışında otomatik uzatma mekanizması yoktur

**Timezone:** Sunucu local time kullanılır. Derived status hesaplarında `getTodayStart()` sunucu local timezone'unda `setHours(0,0,0,0)` yapar.

**Inclusive/Exclusive:** Bitiş günü inclusive'dir. `membershipEndDate >= today` kontrolü nedeniyle, bitiş tarihi olan gün hâlâ aktif sayılır.

### Soru 3: Süresi dolmuş kullanıcı nasıl aktif hale gelir?

**Mevcut sistemde resmi bir "üyelik yenileme" akışı yoktur.**

- Sadece status'u ACTIVE yapmak **yeterli değildir** — `membershipEndDate` hâlâ geçmişteyse `membershipState` EXPIRED kalır ve 0 gün gösterir
- Yeni payment eklemek de **yeterli değildir** — payment hiçbir member alanını güncellemez
- **Mevcut tek yol:** `PATCH /api/v1/members/:id` ile `membershipStartDate` ve `membershipEndDate`'i **manuel olarak** yeni tarihlerle güncellemek ve ardından gerekirse status'u ACTIVE yapmak

**Doğru olması gereken akış (ama henüz implemente edilmemiş):**

1. Üyelik yenileme endpoint'i (renew) çağrılır
2. Payment oluşturulur
3. `membershipStartDate` ve `membershipEndDate` yeni dönem için hesaplanır
4. `status` ACTIVE yapılır
5. Tüm bunlar atomik bir transaction'da gerçekleşir

### Soru 4: Ödeme kaydı eklenince ne olur?

Sadece `Payment` tablosuna yeni bir kayıt eklenir. Başka **hiçbir side effect yoktur:**

- `Member.status` → değişmez
- `Member.membershipStartDate` → değişmez
- `Member.membershipEndDate` → değişmez
- `Member.membershipPlanId` → değişmez

Payment tamamen finansal bir kayıttır. Hangi plan için yapıldığını bilmez (MembershipPlan FK yok). Üyelik uzatma veya yenileme işlevi yoktur.

Payment'ın `memberId` üzerinden üyeyle ilişkisi vardır ancak bu sadece "bu ödeme kime ait" bilgisini tutar, üyelik yönetimine etki etmez.

### Soru 5: Neden status değiştiği halde üyelik geçerliliği değişmemiş olabilir?

Çünkü **`status` ve `membershipState` farklı kavramlardır:**

| Kavram               | Kaynak                            | Ne tarafından kontrol edilir                                    |
| -------------------- | --------------------------------- | --------------------------------------------------------------- |
| `status`             | `Member.status` DB alanı          | Admin (changeStatus endpoint) ve Cron (MemberStatusSyncService) |
| `membershipState`    | Türetilmiş alan (API response'ta) | Otomatik: `membershipEndDate >= today` kontrolü                 |
| `daysRemaining`      | Türetilmiş alan                   | Otomatik: `membershipEndDate - today` hesabı                    |
| `isMembershipActive` | Türetilmiş alan                   | Otomatik: `membershipEndDate >= today`                          |

`status`'u ACTIVE yapmak sadece DB'deki `status` alanını değiştirir. `membershipState`, `daysRemaining`, `isMembershipActive` gibi türetilmiş alanlar **yalnızca** `membershipEndDate` üzerinden hesaplanır ve `status` alanını hiç kullanmaz.

Dolayısıyla:

- `status = ACTIVE` + `membershipEndDate = 2025-01-15` (geçmişte) → **membershipState = EXPIRED, daysRemaining = 0**

Bu, **bilinçli tasarım kararıdır** — status ile tarih bazlı geçerlilik birbirinden bağımsız yönetilir.

---

## 7. Recommendations

### 7.1 Backend Önerileri

#### Yüksek Öncelik

1. **Üyelik Yenileme Endpoint'i Oluşturulmalı:**
   - Önerilen endpoint: `POST /api/v1/members/:id/renew`
   - Kabul edecek parametre: `membershipPlanId` (opsiyonel, verilmezse mevcut plan)
   - İşlev: Yeni dönem başlangıç/bitiş tarihlerini hesapla, payment oluştur (opsiyonel), status'u ACTIVE yap — hepsi tek transaction'da
   - Bu, mobilde "üyelik yenile" butonu için gerekli endpoint olacaktır

2. **Payment → Membership Bağlantısı Eklenmeli:**
   - Payment tablosuna `membershipPlanId` FK eklenebilir
   - Ya da ödeme oluşturma sırasında membership uzatma opsiyonu (flag) eklenebilir
   - Örnek: `createPayment({ ..., extendMembership: true })` parametresi

#### Orta Öncelik

3. **autoRenew İmplementasyonu:**
   - `MembershipPlan.autoRenew = true` olan planlar için cron job eklenebilir
   - Süresi dolmadan önce (veya dolduktan sonra) otomatik yenileme yapılabilir
   - Bu, tekrar eden üyelikler için kullanıcı deneyimini iyileştirir

4. **Status-Date Tutarlılık Kontrolü:**
   - `INACTIVE → ACTIVE` geçişinde `membershipEndDate < today` ise uyarı dönülebilir
   - Veya geçiş reddedilip "Önce üyeliği yenileyin" mesajı verilebilir

### 7.2 Mobile Önerileri

1. **"Üyelik Yenile" butonu eklenmelidir** — süresi dolmuş üyeler için
2. **Status değiştirme UI'ında uyarı gösterilmelidir:** "Status'u ACTIVE yapmak üyelik tarihlerini değiştirmez" şeklinde
3. Ödeme ekleme ekranında "Bu ödeme üyeliği uzatsın mı?" seçeneği sunulabilir (backend desteği gerekir)

### 7.3 Manuel Değiştirilebilir vs Değiştirilmemesi Gereken Alanlar

| Alan                        | Manuel Değiştirilebilir mi?     | Açıklama                                                |
| --------------------------- | ------------------------------- | ------------------------------------------------------- |
| `status`                    | ✅ Evet (changeStatus endpoint) | Geçiş kurallarına tabi (ARCHIVED terminal)              |
| `membershipStartDate`       | ✅ Evet (PATCH endpoint)        | Dikkatli kullanılmalı — plan süresiyle uyumsuz olabilir |
| `membershipEndDate`         | ✅ Evet (PATCH endpoint)        | Dikkatli kullanılmalı — plan süresiyle uyumsuz olabilir |
| `membershipPlanId`          | ❌ Hayır (v1 kısıtı)            | Sadece schedulePlanChange ile değiştirilebilir          |
| `membershipPriceAtPurchase` | ❌ Hayır (v1 kısıtı)            | Plan değişikliğinde otomatik snapshot alınır            |
| `membershipState`           | ❌ Manuel değiştirilemez        | Türetilmiş alan — membershipEndDate'den hesaplanır      |
| `daysRemaining`             | ❌ Manuel değiştirilemez        | Türetilmiş alan — otomatik hesaplanır                   |
| `remainingDays`             | ❌ Manuel değiştirilemez        | Türetilmiş alan — legacy, geriye uyumluluk için         |

### 7.4 İş Kuralı Önerileri

1. Süresi dolmuş üyeyi tekrar aktif etmek için **standart bir akış tanımlanmalıdır** (renewal endpoint)
2. Bu akış hem admin panelinden hem mobilden erişilebilir olmalıdır
3. Payment ve membership uzatma opsiyonel olarak bağlanmalı ama zorunlu olmamalıdır (bazen indirimli veya ücretsiz yenileme gerekebilir)

---

## 8. Appendix

### 8.1 İncelenen Dosyalar

| Dosya                                                              | Amaç                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `prisma/schema.prisma`                                             | Veri modeli ve ilişkiler                                                |
| `src/members/members.service.ts`                                   | Üye CRUD, status değişikliği, plan değişikliği, derived field hesaplama |
| `src/members/members.controller.ts`                                | Üye endpoint'leri                                                       |
| `src/members/mobile-members.controller.ts`                         | Mobil üye listeleme endpoint'i                                          |
| `src/members/member-status-sync.service.ts`                        | Günlük cron: expired üyeleri INACTIVE yap                               |
| `src/members/services/membership-plan-change-scheduler.service.ts` | Günlük cron: zamanlanmış plan değişikliklerini uygula                   |
| `src/members/dto/create-member.dto.ts`                             | Üye oluşturma DTO                                                       |
| `src/members/dto/update-member.dto.ts`                             | Üye güncelleme DTO                                                      |
| `src/members/dto/change-member-status.dto.ts`                      | Status değişikliği DTO                                                  |
| `src/payments/payments.service.ts`                                 | Ödeme CRUD, revenue raporu                                              |
| `src/payments/payments.controller.ts`                              | Ödeme endpoint'leri                                                     |
| `src/membership-plans/membership-plans.service.ts`                 | Plan CRUD                                                               |
| `src/membership-plans/utils/duration-calculator.ts`                | Üyelik bitiş tarihi hesaplama                                           |
| `src/common/utils/membership-status.util.ts`                       | Türetilmiş üyelik durumu hesaplama                                      |

### 8.2 Kritik Fonksiyonlar

| Fonksiyon                          | Dosya                                         | İşlev                                          |
| ---------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `create()`                         | `members.service.ts`                          | Yeni üye oluşturma                             |
| `update()`                         | `members.service.ts`                          | Üye güncelleme (tarih dahil)                   |
| `changeStatus()`                   | `members.service.ts`                          | Status geçişi (freeze logic dahil)             |
| `enrichMemberWithComputedFields()` | `members.service.ts`                          | Derived field'ları API response'a ekle         |
| `calculateRemainingDays()`         | `members.service.ts`                          | Kalan gün hesaplama (legacy)                   |
| `calculateMembershipStatus()`      | `membership-status.util.ts`                   | membershipState, daysRemaining, isExpiringSoon |
| `calculateMembershipEndDate()`     | `duration-calculator.ts`                      | Plan süresinden bitiş tarihi hesapla           |
| `createPayment()`                  | `payments.service.ts`                         | Ödeme kaydı oluşturma (member etkilemez)       |
| `syncExpiredMemberStatuses()`      | `member-status-sync.service.ts`               | Cron: ACTIVE+expired → INACTIVE                |
| `applyPendingChangeWithTx()`       | `membership-plan-change-scheduler.service.ts` | Cron: plan değişikliğini uygula                |
| `schedulePlanChange()`             | `members.service.ts`                          | Dönem sonu plan değişikliği zamanla            |

### 8.3 Önemli Endpoint'ler

| Method   | Path                                                  | İşlev                                     |
| -------- | ----------------------------------------------------- | ----------------------------------------- |
| `POST`   | `/api/v1/members`                                     | Yeni üye oluştur                          |
| `PATCH`  | `/api/v1/members/:id`                                 | Üye güncelle (tarihler dahil)             |
| `POST`   | `/api/v1/members/:id/status`                          | Status değiştir                           |
| `POST`   | `/api/v1/members/:id/archive`                         | Arşivle                                   |
| `POST`   | `/api/v1/members/:id/schedule-membership-plan-change` | Plan değişikliği zamanla                  |
| `DELETE` | `/api/v1/members/:id/schedule-membership-plan-change` | Bekleyen plan değişikliğini iptal et      |
| `GET`    | `/api/v1/members`                                     | Üye listele (filtreleme + derived fields) |
| `GET`    | `/api/v1/members/:id`                                 | Üye detay                                 |
| `GET`    | `/api/mobile/members`                                 | Mobil üye listele                         |
| `POST`   | `/api/v1/payments`                                    | Ödeme oluştur                             |
| `POST`   | `/api/v1/payments/:id/correct`                        | Ödeme düzelt                              |
| `GET`    | `/api/v1/payments`                                    | Ödemeleri listele                         |

---

## Sonuç

**Mobilde gördüğün durum bir bug değildir — eksik iş akışıdır.**

Sistem, status değişikliği ve ödeme kaydını üyelik tarihlerinden bilinçli olarak ayırmıştır. Ancak süresi dolmuş bir üyeyi tekrar aktif etmek için gerekli olan "üyelik yenileme" (renewal) endpoint'i ve bunu tetikleyen mobil akış henüz implemente edilmemiştir.

Özetle:

- `status` değiştirmek → sadece admin durumunu yönetir, üyelik süresini etkilemez ✅ (tasarım gereği)
- Ödeme eklemek → sadece finansal kayıt oluşturur, üyelik süresini etkilemez ✅ (tasarım gereği)
- Süresi dolan üyeyi tekrar aktif etmek → `membershipStartDate` ve `membershipEndDate`'in manuel güncellenmesi gerekir ⚠️ (eksik "renew" endpoint)

**Emin olunmayan noktalar:**

- `autoRenew` flag'ının gelecekte nasıl implemente edileceği belirsiz (şemada var, mantık yok)
- Timezone davranışı: `getTodayStart()` sunucu local time kullanıyor — çok bölgeli deployment'ta sorun olabilir
- `UpdateMemberDto`'daki `membershipStartAt` / `membershipEndAt` legacy alanlarının temizlenip temizlenmeyeceği belirsiz
