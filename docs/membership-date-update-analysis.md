# Üyelik Tarihleri Güncelleme Analizi

> **Tarih:** 14 Nisan 2026  
> **Kapsam:** Backend üyelik başlangıç/bitiş tarihi akışı  
> **Amaç:** `membershipStartDate` güncellendiğinde `membershipEndDate`'in neden otomatik yeniden hesaplanmadığını tespit etmek

---

## 1. Mevcut Akış Özeti

### Üye Oluşturma (Create)

```
POST /api/v1/members → MembersController.create() → MembersService.create()
```

1. DTO'dan gelen `membershipPlanId` ile plan fetch edilir
2. `membershipStartDate` belirlenir: DTO'da varsa o değer, yoksa `new Date()` (şu an)
3. `membershipEndDate` otomatik hesaplanır: `calculateMembershipEndDate(startDate, plan.durationType, plan.durationValue)`
4. `membershipPriceAtPurchase` belirlenir: DTO'da varsa o, yoksa `plan.price`
5. Üye `status: ACTIVE` ile oluşturulur

### Üye Güncelleme (Update)

```
PATCH /api/v1/members/:id → MembersController.update() → MembersService.update()
```

1. DTO'dan gelen `membershipStartDate` ve/veya `membershipEndDate` okunur
2. Verilmemişse mevcut değer korunur (fallback)
3. `endDate > startDate` validasyonu yapılır
4. **Bitiş tarihi ASLA yeniden hesaplanmaz** — sadece gönderilen ham değerler yazılır
5. Plan bilgisine hiç bakılmaz

### Üyelik Yenileme (Renew)

```
POST /api/v1/members/:id/renew-membership → MembersService.renewMembership()
```

- Süresi dolmuş üye: `startDate = bugün`, `endDate = bugün + plan süresi`
- Aktif üye (erken yenileme): `startDate = mevcut start`, `endDate = mevcut endDate + plan süresi`
- `calculateMembershipEndDate()` kullanılır

### Plan Değişikliği Zamanlama (Schedule Plan Change)

```
POST /api/v1/members/:id/schedule-membership-plan-change → MembersService.schedulePlanChange()
```

- `pendingStartDate = membershipEndDate + 1 gün`
- `pendingEndDate = calculateMembershipEndDate(pendingStartDate, plan.durationType, plan.durationValue)`
- Cron job ile uygulanır

---

## 2. İlgili Endpointler

| Method  | Endpoint                                              | Açıklama                   | Tarih Davranışı                                         |
| ------- | ----------------------------------------------------- | -------------------------- | ------------------------------------------------------- |
| `POST`  | `/api/v1/members`                                     | Üye oluşturma              | `endDate` otomatik hesaplanır                           |
| `PATCH` | `/api/v1/members/:id`                                 | Üye güncelleme             | `startDate`/`endDate` ham olarak yazılır, hesaplama yok |
| `POST`  | `/api/v1/members/:id/renew-membership`                | Üyelik yenileme            | `endDate` plan süresine göre hesaplanır                 |
| `POST`  | `/api/v1/members/:id/schedule-membership-plan-change` | Plan değişikliği zamanlama | Pending tarihler hesaplanır                             |
| `POST`  | `/api/v1/members/:id/status`                          | Durum değiştirme           | Freeze/resume durumunda `endDate` uzatılır              |

---

## 3. İlgili Dosyalar ve Sorumlulukları

### Controller Katmanı

| Dosya                                      | Sorumluluk                                      |
| ------------------------------------------ | ----------------------------------------------- |
| `src/members/members.controller.ts`        | REST endpoint tanımları, Guard'lar, DTO bağlama |
| `src/members/mobile-members.controller.ts` | Mobil-optimize endpointler                      |

### Service Katmanı

| Dosya                                                              | Sorumluluk                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `src/members/members.service.ts`                                   | Create, update, renew, schedulePlanChange, changeStatus, archive |
| `src/members/member-status-sync.service.ts`                        | Günlük cron: expired üyeleri `INACTIVE` yap                      |
| `src/members/services/membership-plan-change-scheduler.service.ts` | Planlı değişiklikleri uygulama cron'u                            |

### DTO / Validation Katmanı

| Dosya                                                     | Sorumluluk                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `src/members/dto/create-member.dto.ts`                    | Create validasyonu, `membershipStartDate` opsiyonel                             |
| `src/members/dto/update-member.dto.ts`                    | Update validasyonu, `membershipPlanId` ve `membershipPriceAtPurchase` forbidden |
| `src/members/dto/renew-membership.dto.ts`                 | Yenileme validasyonu                                                            |
| `src/members/dto/validators/forbidden-field.validator.ts` | `@IsForbidden` custom decorator                                                 |

### Util / Helper Katmanı

| Dosya                                               | Sorumluluk                                       |
| --------------------------------------------------- | ------------------------------------------------ |
| `src/membership-plans/utils/duration-calculator.ts` | `calculateMembershipEndDate()` — tek kaynak      |
| `src/common/utils/membership-status.util.ts`        | `calculateMembershipStatus()`, `getTodayStart()` |

### Prisma / Model Katmanı

| Dosya                  | Sorumluluk                                                                       |
| ---------------------- | -------------------------------------------------------------------------------- |
| `prisma/schema.prisma` | `Member` modeli: `membershipStartDate`, `membershipEndDate` (DateTime, NOT NULL) |

### Frontend (Referans)

| Dosya                                            | Sorumluluk                                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `frontend/src/components/members/MemberForm.tsx` | Hem create hem edit formunda `membershipStartDate` gönderir                                    |
| `frontend/src/types/member.ts`                   | Type tanımları (`UpdateMemberPayload` içinde `membershipStartDate` ve `membershipEndDate` var) |

---

## 4. Start/End Date Bugün Nasıl Üretiliyor?

### Oluşturma (Create) Sırasında

**Dosya:** `src/members/members.service.ts` — `create()` metodu, satır ~141-149

```typescript
// Determine membership start date
const now = new Date();
const membershipStartDate = dto.membershipStartDate
  ? new Date(dto.membershipStartDate)
  : now;

// Calculate membership end date using duration calculator
const membershipEndDate = calculateMembershipEndDate(
  membershipStartDate,
  plan.durationType,
  plan.durationValue,
);
```

### Hesaplama Fonksiyonu

**Dosya:** `src/membership-plans/utils/duration-calculator.ts` — `calculateMembershipEndDate()`

```typescript
export function calculateMembershipEndDate(
  startDate: Date,
  durationType: DurationType, // 'DAYS' | 'MONTHS'
  durationValue: number, // DAYS: 1-730, MONTHS: 1-24
): Date {
  if (durationType === "DAYS") {
    return addDays(startDate, durationValue); // date-fns
  } else if (durationType === "MONTHS") {
    return addMonths(startDate, durationValue); // month-end clamping
  }
}
```

### Plan Süresi Nereden Geliyor?

**Model:** `MembershipPlan` → `durationType` (DAYS|MONTHS) + `durationValue` (1-730 / 1-24)

Plan süresi, `MembershipPlansService.getPlanByIdForTenant()` ile fetch edilir. Create ve renew akışlarında plan verisi alınır; update akışında ise **plan hiç sorgulanmaz**.

---

## 5. Start Date Neden Update Edilemiyor? (ASIL SORUN)

### Kısa Cevap

`membershipStartDate` aslında **DTO'da var ve backend tarafından kabul ediliyor**. Teknik olarak güncellenebilir. Ancak **güncelleme sırasında `membershipEndDate` otomatik olarak yeniden hesaplanmıyor**. Bu, kullanıcı açısından "başlangıç tarihini değiştirsem bile bitiş tarihi eski kalıyor" sorunu yaratıyor.

### Detaylı Analiz

#### DTO Katmanı — `UpdateMemberDto`

- ✅ `membershipStartDate` expose ediliyor (`@IsOptional() @IsDateString()`)
- ✅ `membershipStartAt` (legacy alias) de destekleniyor
- ✅ `membershipEndDate` ve `membershipEndAt` de expose ediliyor
- ❌ `membershipPlanId` → `@IsForbidden` ile engellendi (v1 kısıtı)
- ❌ `membershipPriceAtPurchase` → `@IsForbidden` ile engellendi (v1 kısıtı)

#### Service Katmanı — `MembersService.update()` (satır ~460-548)

```typescript
// Mevcut davranış:
const membershipStartDate = dto.membershipStartDate
  ? new Date(dto.membershipStartDate)
  : existingMember.membershipStartDate;

const membershipEndDate = dto.membershipEndDate
  ? new Date(dto.membershipEndDate)
  : existingMember.membershipEndDate;

// Sadece validasyon yapılıyor:
if (membershipEndDate <= membershipStartDate) {
  throw new BadRequestException(
    "Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır",
  );
}
```

**Kritik Sorun:** `startDate` gönderilip `endDate` gönderilmezse:

- Service mevcut `endDate`'i korur
- `calculateMembershipEndDate()` **çağrılmaz**
- Plan bilgisi **sorgulanmaz** (`membershipPlanId` forbidden olduğu için plan referansına erişim de yok)
- Sonuç: başlangıç tarihi değişir ama bitiş tarihi tutarsız kalır

#### Frontend Katmanı — `MemberForm.tsx`

- `membershipStartDate` **hem create hem edit modunda** payload'a dahil ediliyor (satır 205-207)
- Edit modunda `membershipEndDate` gönderilmiyor
- Bu da backend'de end date'in değişmemesine neden oluyor

### Engelleme Nedenleri Tablosu

| Katman             | `membershipStartDate` | `membershipEndDate`           | `membershipPlanId` |
| ------------------ | --------------------- | ----------------------------- | ------------------ |
| DTO                | ✅ Kabul edilir       | ✅ Kabul edilir               | ❌ `@IsForbidden`  |
| Service            | ✅ DB'ye yazılır      | ✅ DB'ye yazılır (verilmişse) | N/A                |
| Otomatik hesaplama | ❌ Tetiklenmez        | ❌ Tetiklenmez                | ❌ Erişilemez      |
| Frontend (edit)    | ✅ Gönderir           | ❌ Göndermez                  | ❌ Göndermez       |

---

## 6. Backend'de Muhtemel Etki Alanı (Değişiklik Gerektirecek Dosyalar)

Eğer "start date güncellendiğinde end date otomatik hesaplansın" isteniyorsa:

### Kesin Dokunulacak Dosyalar

| #   | Dosya                                         | Değişiklik                                                                           |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | `src/members/members.service.ts` → `update()` | Start date değiştiğinde planı fetch et, `calculateMembershipEndDate()` çağır         |
| 2   | `src/members/dto/update-member.dto.ts`        | Gerekirse yeni alan ekle (ör. `recalculateEndDate: boolean`) veya mevcut yapıyı koru |

### Muhtemelen Dokunulacak Dosyalar

| #   | Dosya                                         | Neden                                                                                  |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------- |
| 3   | `src/members/members.service.ts` → `update()` | `membershipPlanId`'ye read-only erişim gerekebilir (mevcut üyenin planını okumak için) |
| 4   | Mevcut e2e testler (`test/*.e2e-spec.ts`)     | Update senaryoları için test eklenmeli                                                 |

### Dokunulmaması Gereken Dosyalar

- `duration-calculator.ts` — zaten çalışıyor, yeniden kullanılacak
- `membership-status.util.ts` — hesaplama doğru
- `create-member.dto.ts` — create akışı doğru çalışıyor
- `renew-membership.dto.ts` — renew akışı ayrı, dokunmaya gerek yok

---

## 7. Mevcut Yeniden Kullanılabilir Altyapı

### `calculateMembershipEndDate()` (duration-calculator.ts)

- ✅ Halihazırda `create()`, `renewMembership()`, `schedulePlanChange()` tarafından kullanılıyor
- ✅ DAYS ve MONTHS destekliyor
- ✅ Month-end clamping doğru çalışıyor (date-fns `addMonths`)
- ✅ Update akışında da doğrudan kullanılabilir

### `MembershipPlansService.getPlanByIdForTenant()`

- ✅ Plan verisi (durationType, durationValue) almak için mevcut
- ✅ Tenant isolation dahil
- ✅ Update service'te üyenin `membershipPlanId`'si üzerinden çağrılabilir

---

## 8. Riskler ve Dikkat Edilmesi Gereken Noktalar

### 1. Freeze/Resume Etkileşimi

- Eğer üye **PAUSED** durumdayken start date değiştirilirse, `remainingDays` hesaplaması bozulabilir
- `calculateRemainingDays()` metodu `pausedAt` ve `membershipStartDate` farkına dayalı çalışıyor
- **Öneri:** PAUSED veya ARCHIVED üyelerde start date değişikliğini engelle

### 2. Pending Plan Change Çakışması

- Üyenin `pendingMembershipPlanId` varsa ve start date değişirse, pending tarihler tutarsız kalabilir
- `pendingMembershipStartDate = membershipEndDate + 1 gün` mantığı bozulur
- **Öneri:** Start date değiştiğinde pending plan change varsa iptal et veya yeniden hesapla

### 3. Timezone / Date Normalization

- `getTodayStart()` server local time kullanıyor (`setHours(0,0,0,0)`)
- Create akışında `new Date()` kullanılıyor (UTC-aware değil)
- `schedulePlanChange` ise `setUTCHours(0,0,0,0)` kullanıyor — **tutarsızlık var**
- Payment `paidOn` truncation da start-of-day UTC
- **Öneri:** Tüm date-only işlemlerde tutarlı bir normalization kullan

### 4. Concurrent Update (Race Condition)

- `update()` metodu `renewMembership()` gibi row-level locking (`FOR UPDATE`) kullanmıyor
- İki eşzamanlı update isteği tutarsız tarihler yazabilir
- **Öneri:** Start/end date güncellemelerinde optimistic locking veya row-level locking ekle

### 5. Audit Trail Eksikliği

- `update()` ile yapılan tarih değişiklikleri `MemberPlanChangeHistory` tablosuna yazılmıyor
- `renewMembership()` ve `schedulePlanChange()` history kaydı oluşturuyor
- **Öneri:** Tarih değişikliklerinde de history kaydı oluştur

### 6. Frontend Uyumu

- Frontend şu an edit modunda `membershipEndDate` göndermediği için, backend'de otomatik hesaplama eklenmesi frontend'i kırmaz
- Ancak frontend'de end date'in kullanıcıya gösterilmesi/preview edilmesi gerekebilir (`DurationPreview` component'i sadece create modunda aktif)

### 7. `membershipPriceAtPurchase` Tutarlılığı

- Start date değiştiğinde fiyat değişmeli mi? Plan fiyatı zaman içinde değişmiş olabilir
- Mevcut sistemde `membershipPriceAtPurchase` update'te `@IsForbidden` — snapshot olarak korunuyor

---

## 8. Özet Karar Tablosu

| Soru                                     | Cevap                                                                |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Start date DTO'da var mı?                | ✅ Evet, `UpdateMemberDto` içinde `@IsOptional()` olarak mevcut      |
| Start date DB'ye yazılıyor mu?           | ✅ Evet, service `updateData.membershipStartDate` set ediyor         |
| End date otomatik hesaplanıyor mu?       | ❌ Hayır, update akışında `calculateMembershipEndDate()` çağrılmıyor |
| Plan bilgisi update'te sorgulanıyor mu?  | ❌ Hayır, plan fetch edilmiyor                                       |
| Mevcut helper yeniden kullanılabilir mi? | ✅ Evet, `calculateMembershipEndDate()` direkt kullanılabilir        |
| Bu değişiklik breaking change mi?        | ⚠️ Hayır, ama davranış değişikliği — test gerektirir                 |
