# membershipStartDate Update — Final Implementation

**Tarih:** 2026-04-15
**Kapsam:** `PATCH /api/v1/members/:id` — `membershipStartDate` + `membershipEndDate` birlikte gönderildiğinde sessiz override davranışının düzeltilmesi
**Sonuç:** ✅ Tamamlandı

---

## 1. Değişiklik Özeti

Önceki davranışta, kullanıcı hem `membershipStartDate` hem `membershipEndDate` gönderdiğinde, backend `membershipEndDate`'i sessizce plan süresinden hesaplıyordu ve kullanıcının gönderdiği değeri yok sayıyordu. Bu belirsiz davranış kaldırıldı.

**Yeni davranış:** Bu kombinasyon artık açık bir **400 BadRequestException** ile reddediliyor.

---

## 2. Yapılan Kod Değişiklikleri

### 2.1 `members.service.ts` — Validation eklendi

**Konum:** `MembersService.update()`, `isStartDateChanging` tespitinden hemen sonra, PAUSED kontrolünden önce.

```typescript
// EDGE CASE: Block sending both start and end dates together.
// When start date changes, end date is auto-recalculated from the plan duration.
const hasEndDate =
  dto.membershipEndDate !== undefined || dto.membershipEndAt !== undefined;
if (isStartDateChanging && hasEndDate) {
  throw new BadRequestException(
    "Başlangıç tarihi güncellendiğinde bitiş tarihi sistem tarafından otomatik hesaplanır.",
  );
}
```

**Neden bu sırada?**

- `isStartDateChanging` hesaplandıktan sonra → hangi durumda olduğumuzu biliyoruz
- PAUSED kontrolünden önce → gereksiz DB çağrısı yapılmaz
- Plan fetch'inden önce → erken başarısızlık (fail fast)

---

## 3. Eklenen Validation

| Koşul                                                | Sonuç                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `membershipStartDate` + `membershipEndDate` birlikte | 400 — "Başlangıç tarihi güncellendiğinde bitiş tarihi sistem tarafından otomatik hesaplanır." |
| `membershipStartAt` + `membershipEndAt` birlikte     | 400 — aynı mesaj                                                                              |
| `membershipStartDate` + `membershipEndAt` birlikte   | 400 — aynı mesaj                                                                              |
| `membershipStartAt` + `membershipEndDate` birlikte   | 400 — aynı mesaj                                                                              |

Tüm legacy alias kombinasyonları kapsanıyor.

---

## 4. Eklenen Test

### T-SD-10: Start + End birlikte gönderildiğinde 400 hatası

**Dosya:** `backend/test/member-start-date-update.e2e-spec.ts`

İki alt test:

| Test     | Senaryo                                                                | Beklenen               |
| -------- | ---------------------------------------------------------------------- | ---------------------- |
| T-SD-10a | `membershipStartDate` + `membershipEndDate` birlikte gönder            | 400, doğru hata mesajı |
| T-SD-10b | `membershipStartAt` + `membershipEndAt` (legacy alias) birlikte gönder | 400, doğru hata mesajı |

---

## 5. Davranış Tablosu (Güncel — Tüm Senaryolar)

| Request İçeriği                             | Davranış                                        |
| ------------------------------------------- | ----------------------------------------------- |
| Sadece `membershipStartDate`                | ✅ End date plan süresinden otomatik hesaplanır |
| Sadece `membershipEndDate`                  | ✅ Manuel update çalışır                        |
| `membershipStartDate` + `membershipEndDate` | ❌ **400 hatası** (yeni davranış)               |
| Hiçbiri gönderilmez                         | ✅ Mevcut tarihler korunur                      |
| Aynı start date gönderilir                  | ✅ İdempotent — recalculation yapılmaz          |
| PAUSED üye + start date                     | ❌ 400 hatası                                   |
| Start date + pending plan var               | ✅ Pending dates de recalculate edilir          |

---

## 6. Mobile Integration Needs

### 6.1 Request Payload

**Başlangıç tarihi güncellerken:**

```json
PATCH /api/v1/members/:id

{
  "membershipStartDate": "2026-05-01T00:00:00.000Z"
}
```

**Kurallar:**

- Sadece `membershipStartDate` gönderin
- `membershipEndDate` ASLA birlikte göndermeyin — 400 hatası alırsınız
- `membershipStartAt` legacy alias olarak çalışır, ancak yeni kodda `membershipStartDate` tercih edin

**Bitiş tarihini manuel güncellemek için (start date değişmeden):**

```json
{
  "membershipEndDate": "2026-08-01T00:00:00.000Z"
}
```

### 6.2 Response Handling

Başarılı bir start date güncellemesinin response'u:

```json
{
  "id": "member-uuid",
  "membershipStartDate": "2026-05-01T00:00:00.000Z",
  "membershipEndDate": "2026-08-01T00:00:00.000Z",   // ← sistem tarafından hesaplandı
  "membershipPlanId": "plan-uuid",
  ...
}
```

- Response'taki `membershipEndDate` her zaman güncel ve doğru değeri içerir
- Bu değeri alıp local cache/state'i güncelleyin
- UI'da bu değeri bitiş tarihi olarak gösterin

### 6.3 UI / UX Davranışı

**Önerilen akış:**

1. Kullanıcı "Başlangıç Tarihi Düzenle" ekranını açar
2. Sadece başlangıç tarihi seçici (date picker) gösterilir
3. Bitiş tarihi **readonly** olarak gösterilir — "Otomatik hesaplanır" notu ile
4. Kullanıcı yeni başlangıç tarihini seçer ve "Kaydet" der
5. Backend response'undan dönen yeni `membershipEndDate` UI'da güncellenir
6. Kullanıcıya kısa bir bilgi mesajı gösterilir: _"Başlangıç tarihi güncellendi. Bitiş tarihi otomatik olarak yeniden hesaplandı."_

**Bitiş tarihi ayrı bir akışta düzenlenebilir** — bu durumda sadece `membershipEndDate` gönderilir.

### 6.4 Error Handling

**Yeni 400 hatası:**

```json
{
  "statusCode": 400,
  "message": "Başlangıç tarihi güncellendiğinde bitiş tarihi sistem tarafından otomatik hesaplanır."
}
```

**Mobile'da nasıl handle edilmeli:**

- Bu hata normalde oluşmamalı — UI doğru tasarlandıysa kullanıcı ikisini birlikte gönderemez
- Eğer alınırsa: bir alert ile kullanıcıya _"Başlangıç tarihi değiştirildiğinde bitiş tarihi otomatik hesaplanır. Lütfen sadece başlangıç tarihini güncelleyin."_ mesajı gösterin
- Bu bir programlama hatasına işaret eder — loglayın

**Diğer olası 400 hataları (değişmedi):**

- PAUSED üye: `"Dondurulmuş üyelerin başlangıç tarihi değiştirilemez..."`
- End < Start: `"Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır"`

### 6.5 Validation

- **Mobile tarafında ek validation gerekli mi?** Hayır, backend yeterli.
- Ancak UI seviyesinde şu kontrolleri yapmak UX'i iyileştirir:
  - Başlangıç tarihi düzenleniyorsa, bitiş tarihi alanını gizleyin veya disabled yapın
  - Bitiş tarihi düzenleniyorsa, başlangıç tarihi alanını gizleyin veya disabled yapın
  - İkisini aynı anda düzenlemeye izin vermeyin
- Backend'e güvenmek yeterli — validation backend'de enforce ediliyor

### 6.6 Developer Notes

- **Tek kural:** Bir PATCH request'inde `membershipStartDate` ve `membershipEndDate` birlikte göndermeyin
- Başlangıç tarihi değiştiğinde bitiş tarihi DAİMA plan süresinden yeniden hesaplanır — bu kontrol sizde değil
- Response'taki tarihleri her zaman tek kaynak (source of truth) olarak kabul edin
- Legacy alias'lar (`membershipStartAt`, `membershipEndAt`) hâlâ çalışıyor ama yeni kodda kullanmayın
- PAUSED üyelerin başlangıç tarihini güncelleyemezsiniz — UI'da bu butonu disable edin
- Idempotent: Aynı başlangıç tarihini tekrar gönderirseniz bitiş tarihi değişmez

---

## 7. Riskler / Dikkat Edilmesi Gerekenler

| Risk                       | Seviye   | Açıklama                                                                     |
| -------------------------- | -------- | ---------------------------------------------------------------------------- |
| Mevcut frontend uyumluluğu | 🟢 Düşük | Frontend zaten ikisini birlikte göndermiyor olmalı — aksi halde bug          |
| Legacy API consumer'lar    | 🟡 Orta  | Dış API consumer'lar varsa bu breaking change olabilir — changelog'a ekleyin |
| Timezone hassasiyeti       | 🟡 Düşük | Hâlâ mevcut — ana start/end dates'te UTC normalizasyonu yok (pending'de var) |
| Race condition             | 🟢 Düşük | Genel pattern, bu değişikliğe özgü değil                                     |

### Breaking Change Notu

Bu değişiklik, daha önce sessizce kabul edilen bir request pattern'i artık reddediyor:

```
ÖNCE: { membershipStartDate: "...", membershipEndDate: "..." } → 200 (end date sessizce ezilir)
SONRA: { membershipStartDate: "...", membershipEndDate: "..." } → 400 (açık hata)
```

Bu bir **iyileştirme**'dir çünkü belirsiz davranış kaldırılmıştır, ancak API consumer'lara bildirilmelidir.
