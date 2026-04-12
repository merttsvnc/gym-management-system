# Membership Renewal Implementation

## Eklenen Endpoint

**`POST /api/v1/members/:id/renew-membership`**

Bir üyenin üyeliğini resmi iş akışı ile yeniler veya uzatır.

## Request / Response Örneği

### Minimal Request (mevcut plan ile yenileme)

```json
POST /api/v1/members/abc123/renew-membership
Authorization: Bearer <jwt>

{}
```

### Farklı plan + ödeme ile yenileme

```json
POST /api/v1/members/abc123/renew-membership
Authorization: Bearer <jwt>

{
  "membershipPlanId": "plan_xyz",
  "createPayment": true,
  "paymentAmount": 250,
  "paymentMethod": "CREDIT_CARD",
  "paidOn": "2026-04-13",
  "note": "3 aylık yenileme"
}
```

### Response (200 OK)

```json
{
  "id": "abc123",
  "tenantId": "tenant_1",
  "branchId": "branch_1",
  "firstName": "Ali",
  "lastName": "Yılmaz",
  "membershipPlanId": "plan_xyz",
  "membershipStartDate": "2026-03-01T00:00:00.000Z",
  "membershipEndDate": "2026-07-13T00:00:00.000Z",
  "membershipPriceAtPurchase": "250",
  "status": "ACTIVE",
  "isMembershipActive": true,
  "membershipState": "ACTIVE",
  "daysRemaining": 91,
  "isExpiringSoon": false,
  "remainingDays": 91,
  "renewal": {
    "previousStartDate": "2026-01-01T00:00:00.000Z",
    "previousEndDate": "2026-04-13T00:00:00.000Z",
    "newStartDate": "2026-03-01T00:00:00.000Z",
    "newEndDate": "2026-07-13T00:00:00.000Z",
    "planId": "plan_xyz",
    "planName": "3 Aylık Plan",
    "wasExpired": false
  },
  "payment": {
    "id": "pay_456",
    "amount": "250",
    "paidOn": "2026-04-13T00:00:00.000Z",
    "paymentMethod": "CREDIT_CARD"
  }
}
```

## DTO Alanları

| Alan               | Tip               | Zorunlu                          | Açıklama                                                           |
| ------------------ | ----------------- | -------------------------------- | ------------------------------------------------------------------ |
| `membershipPlanId` | string            | Hayır                            | Yenileme için kullanılacak plan. Verilmezse mevcut plan kullanılır |
| `createPayment`    | boolean           | Hayır                            | Ödeme kaydı oluşturulsun mu (varsayılan: false)                    |
| `paymentAmount`    | number            | createPayment=true ise opsiyonel | Ödeme tutarı (0.01-999999.99). Verilmezse plan fiyatı              |
| `paymentMethod`    | enum              | createPayment=true ise evet      | CASH, CREDIT_CARD, BANK_TRANSFER, CHECK, OTHER                     |
| `paidOn`           | string (ISO 8601) | Hayır                            | Ödeme tarihi. Verilmezse bugün                                     |
| `note`             | string            | Hayır                            | Not (max 500 karakter)                                             |

## Business Rule Özeti

### 1. Membership, Status ve Payment Ayrımı

- Payment oluşturmak tek başına membership'i değiştirmez
- Status değiştirmek tek başına membership tarihlerini değiştirmez
- **Renewal flow**, membership'i değiştiren tek resmi akıştır

### 2. Expired Member Renewal

- `membershipEndDate < bugün` → **Süresi dolmuş**
- Yeni `membershipStartDate = bugün`
- Yeni `membershipEndDate = bugün + plan süresi`
- Status otomatik olarak `ACTIVE` yapılır

### 3. Early Renewal (Aktif Üye)

- `membershipEndDate >= bugün` → **Aktif**
- Mevcut `membershipStartDate` korunur
- Yeni `membershipEndDate = mevcut bitiş + plan süresi`
- Kalan süre yanmaz, üstüne eklenir

### 4. Plan Seçimi

- Request'te `membershipPlanId` varsa o plan kullanılır
- Yoksa üyenin mevcut `membershipPlanId`'si kullanılır
- Plan `ACTIVE` olmalı, tenant/branch erişimi uygun olmalı

### 5. Payment Entegrasyonu

- `createPayment=true` ile opsiyonel ödeme kaydı oluşturulur
- Payment, renewal transaction'ının parçasıdır ama bağımsız side effect üretmez
- Mevcut payment endpoint davranışı değişmez

### 6. Atomik Transaction

- Member read + güncellemesi + history kaydı + opsiyonel payment aynı transaction içinde
- Member, transaction içinde okunur — concurrent renewal'larda stale-read riski engellenir
- Rate limiting: Endpoint `@Throttle` ile korunur (100 req/15 dk)

## Handled Edge Cases

| Senaryo                                     | Davranış                                                 |
| ------------------------------------------- | -------------------------------------------------------- |
| ARCHIVED member                             | 400: Arşivlenmiş üyelerin üyeliği yenilenemez            |
| PAUSED member                               | 400: Önce üyeliği devam ettirin                          |
| INACTIVE member (future end date)           | Early renewal uygulanır, status ACTIVE yapılır           |
| INACTIVE member (expired)                   | Expired renewal (bugünden başlar), status ACTIVE yapılır |
| Member'ın planı yok, request'te de plan yok | 400: Plan belirtilmedi                                   |
| Archived plan ile renewal                   | 400: Arşivlenmiş plan kullanılamaz                       |
| Branch-scoped plan, farklı branch           | 400: Plan bu şube için geçerli değil                     |
| createPayment=true ama paymentMethod yok    | 400: Ödeme yöntemi zorunlu                               |
| paidOn gelecek tarih                        | 400: Ödeme tarihi gelecekte olamaz                       |
| Aynı gün çoklu renewal                      | Her biri geçerli; end date üstüne eklenir                |
| Pending plan change mevcut                  | Renewal ile pending temizlenir                           |
| pausedAt/resumedAt var                      | Renewal ile temizlenir                                   |

## Dikkat Edilmesi Gereken Noktalar

1. **Tarih normalizasyonu**: Tüm tarihler UTC midnight'a normalize edilir (date-only semantics)
2. **Derived fields**: Mevcut `enrichMemberWithComputedFields` mantığı kullanılır, ek hack gerekmez
3. **Mevcut endpoint'ler etkilenmez**: Payment ve status endpoint'leri aynen çalışmaya devam eder
4. **Audit trail**: Her renewal `MemberPlanChangeHistory` tablosuna `RENEWAL` changeType ile kaydedilir
5. **Backward compatibility**: Mevcut tüm API response'ları korunur, yeni `renewal` objesi ekstra bilgi olarak döner

## Dosya Değişiklikleri

| Dosya                                         | İşlem                                              |
| --------------------------------------------- | -------------------------------------------------- |
| `src/members/dto/renew-membership.dto.ts`     | Yeni (DTO)                                         |
| `src/members/members.service.ts`              | Güncellendi (renewMembership — TOCTOU fixli)       |
| `src/members/members.controller.ts`           | Güncellendi (POST endpoint + rate limiting)        |
| `test/members/membership-renewal.e2e-spec.ts` | Yeni (21 test senaryosu)                           |
| `prisma/schema.prisma`                        | Güncellendi (changeType comment "RENEWAL" eklendi) |
| `docs/membership-renewal-implementation.md`   | Yeni (bu dosya)                                    |
