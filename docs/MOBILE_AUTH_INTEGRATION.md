# Mobil Uygulama - Backend Auth & Billing Entegrasyonu

**Tarih**: 28 Ocak 2026  
**Backend API**: v1  
**Hedef**: iOS ve Android geliştiricileri için kapsamlı entegrasyon rehberi

---

## 📋 İçindekiler

1. [API Temel Bilgiler](#api-temel-bilgiler)
2. [Kimlik Doğrulama (Auth) Mekanizması](#kimlik-doğrulama-auth-mekanizması)
3. [Endpoint Envanteri](#endpoint-envanteri)
4. [Billing & Trial Mantığı](#billing--trial-mantığı)
5. [Önerilen Mobil Akışlar](#önerilen-mobil-akışlar)
6. [Branch & Tenant Context](#branch--tenant-context)
7. [Örnek Client-Side Kod Parçaları](#örnek-client-side-kod-parçaları)
8. [QA Test Checklist](#qa-test-checklist)

---

## API Temel Bilgiler

### Base URL

```
Development:  http://localhost:3000
Production:   TBD (production URL will be provided)
```

### API Prefix

Tüm API endpoint'leri `/api/v1` prefix'i ile başlar.

**Örnek**:
```
POST http://localhost:3000/api/v1/auth/register
GET  http://localhost:3000/api/v1/auth/me
```

### API Versiyonu

- **v1**: Mevcut kararlı versiyon
- Breaking change'ler için v2'ye geçilecek (mobil uygulamaya bildirilecek)

### CORS

Backend CORS desteklidir. Mobil uygulama için herhangi bir kısıtlama yoktur.

**Kaynak**: [backend/src/main.ts](../backend/src/main.ts#L8-L11)

---

## Kimlik Doğrulama (Auth) Mekanizması

### JWT Token Tabanlı Auth

Backend **JWT (JSON Web Token)** tabanlı kimlik doğrulama kullanır.

#### Token Tipleri

| Token Tipi      | Geçerlilik Süresi | Kullanım                                    |
| --------------- | ----------------- | ------------------------------------------- |
| **Access Token**  | 15 dakika (900s)  | API çağrıları için Authorization header'da |
| **Refresh Token** | 30 gün            | Access token yenilemek için (gelecekte)     |

**Not**: Şu anda backend'de refresh token endpoint'i **YOK**. Access token süresi dolduğunda kullanıcının tekrar login olması gerekir. Refresh token implementasyonu gelecekte eklenecek.

**Kaynak**: [backend/.env](../backend/.env#L5-L6)

#### JWT Payload (Token İçeriği)

Access token decode edildiğinde aşağıdaki bilgileri içerir:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "tenantId": "tenant-uuid",
  "role": "ADMIN",
  "iat": 1643284800,
  "exp": 1643285700
}
```

| Alan       | Tip     | Açıklama                               |
| ---------- | ------- | -------------------------------------- |
| `sub`      | string  | User ID (JWT standard)                 |
| `email`    | string  | Kullanıcı email adresi                 |
| `tenantId` | string  | Tenant (organizasyon) ID               |
| `role`     | string  | Kullanıcı rolü (`ADMIN`)               |
| `iat`      | number  | Token oluşturma zamanı (Unix epoch)    |
| `exp`      | number  | Token son kullanım zamanı (Unix epoch) |

**Kaynak**: [backend/src/auth/strategies/jwt.strategy.ts](../backend/src/auth/strategies/jwt.strategy.ts#L6-L11)

#### Token Gönderimi

Tüm korumalı endpoint'ler için `Authorization` header'da **Bearer token** gönderilmelidir:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Kaynak**: [backend/src/auth/strategies/jwt.strategy.ts](../backend/src/auth/strategies/jwt.strategy.ts#L18)

#### Token Saklama (Mobil)

**iOS**:
- Keychain Services kullanın
- `kSecAttrAccessible = kSecAttrAccessibleWhenUnlockedThisDeviceOnly`

**Android**:
- EncryptedSharedPreferences (AndroidX Security library)
- Veya Keystore ile şifrelenmiş SharedPreferences

**❌ YAPMAYIN**:
- UserDefaults / SharedPreferences (şifresiz) kullanmayın
- Token'ları log'a yazdırmayın
- Token'ları clipboard'a kopyalamayın

---

## Endpoint Envanteri

### 1. Kayıt (Register)

#### `POST /api/v1/auth/register`

Yeni tenant (işletme) + admin kullanıcı + default branch oluşturur. **7 günlük trial başlar**.

**Auth Gerekli**: ❌ Hayır  
**Rate Limit**: 3 istek / saat (aynı IP'den)

**Headers**:
```http
Content-Type: application/json
```

**Request Body**:

```json
{
  "tenantName": "Mert Fitness Club",
  "email": "mert@example.com",
  "password": "SecurePass123",
  "firstName": "Mert",
  "lastName": "Sevinç",
  "branchName": "Kadıköy Şubesi",
  "branchAddress": "Kadıköy, İstanbul"
}
```

**Validasyon Kuralları**:

| Alan            | Tip     | Zorunlu | Validasyon                                                       |
| --------------- | ------- | ------- | ---------------------------------------------------------------- |
| `tenantName`    | string  | ✅ Evet | Min 2, Max 100 karakter                                          |
| `email`         | string  | ✅ Evet | Geçerli email formatı (otomatik lowercase + trim)                |
| `password`      | string  | ✅ Evet | Min 10 karakter, en az 1 harf + 1 rakam                          |
| `firstName`     | string  | ✅ Evet | Min 2, Max 50 karakter                                           |
| `lastName`      | string  | ✅ Evet | Min 2, Max 50 karakter                                           |
| `branchName`    | string  | ❌ Hayır | Min 2, Max 100 karakter (varsayılan: "Ana Şube")                 |
| `branchAddress` | string  | ❌ Hayır | Boş string kabul edilir (varsayılan: "")                         |

**Kaynak**: [backend/src/auth/dto/register.dto.ts](../backend/src/auth/dto/register.dto.ts#L8-L42)

**Başarılı Yanıt (201 Created)**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "mert@example.com",
    "role": "ADMIN",
    "tenantId": "660e8400-e29b-41d4-a716-446655440001"
  },
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Mert Fitness Club",
    "billingStatus": "TRIAL"
  },
  "branch": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Kadıköy Şubesi",
    "isDefault": true
  }
}
```

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L330-L345)

**Hata Yanıtları**:

| HTTP Status | Code     | Durum                           | Örnek Body                                                                                              |
| ----------- | -------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **409**     | -        | Email zaten kayıtlı             | `{"statusCode": 409, "message": "Email already registered", "timestamp": "...", "path": "..."}`        |
| **400**     | -        | Validasyon hatası (eksik/hatalı field) | `{"statusCode": 400, "message": "password must be longer than or equal to 10 characters", "errors": [...], "timestamp": "...", "path": "..."}` |
| **429**     | -        | Rate limit aşıldı (3 istek/saat) | `{"statusCode": 429, "message": "Çok fazla istek gönderildi. Lütfen bir süre sonra tekrar deneyin."}` |

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L237-L239)  
**Kaynak**: [backend/src/common/filters/http-exception.filter.ts](../backend/src/common/filters/http-exception.filter.ts#L50-L62)

---

### 2. Giriş (Login)

#### `POST /api/v1/auth/login`

Var olan kullanıcı için giriş yapar. **SUSPENDED tenant'lar giriş yapamaz**, diğerleri (TRIAL/ACTIVE/PAST_DUE) giriş yapabilir.

**Auth Gerekli**: ❌ Hayır  
**Rate Limit**: 5 istek / 15 dakika (aynı email için)

**Headers**:
```http
Content-Type: application/json
```

**Request Body**:

```json
{
  "email": "mert@example.com",
  "password": "SecurePass123"
}
```

**Validasyon Kuralları**:

| Alan       | Tip    | Zorunlu | Validasyon           |
| ---------- | ------ | ------- | -------------------- |
| `email`    | string | ✅ Evet | Geçerli email formatı |
| `password` | string | ✅ Evet | -                    |

**Kaynak**: [backend/src/auth/dto/login.dto.ts](../backend/src/auth/dto/login.dto.ts#L3-L9)

**Başarılı Yanıt (200 OK)**:

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "mert@example.com",
    "role": "ADMIN",
    "tenantId": "660e8400-e29b-41d4-a716-446655440001"
  },
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Mert Fitness Club",
    "billingStatus": "TRIAL"
  }
}
```

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L94-L107)

**Hata Yanıtları**:

| HTTP Status | Code                          | Durum                                  | Örnek Body                                                                                                                                  |
| ----------- | ----------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **401**     | -                             | Geçersiz email veya şifre              | `{"statusCode": 401, "message": "Invalid email or password", "timestamp": "...", "path": "..."}`                                           |
| **403**     | `TENANT_BILLING_LOCKED`       | SUSPENDED tenant (giriş engellendi)    | `{"statusCode": 403, "code": "TENANT_BILLING_LOCKED", "message": "Hesabınız askıya alınmıştır. Lütfen destek ekibi ile iletişime geçin."}` |
| **429**     | -                             | Rate limit aşıldı (5 istek/15 dakika) | `{"statusCode": 429, "message": "Çok fazla giriş denemesi. Lütfen bir süre sonra tekrar deneyin."}`                                       |

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L63-L67)  
**Kaynak**: [backend/src/common/constants/billing-messages.ts](../backend/src/common/constants/billing-messages.ts#L27-L29)

**ÖNEMLİ**: Trial süresi dolmuş (TRIAL expired) veya PAST_DUE tenant'lar **giriş yapabilir**, ancak yazma işlemlerinde kısıtlanırlar (bkz. [Billing & Trial Mantığı](#billing--trial-mantığı)).

---

### 3. Mevcut Kullanıcı Bilgisi

#### `GET /api/v1/auth/me`

Mevcut kullanıcının detaylı bilgilerini + tenant billing durumu + default branch + plan limitleri döner.

**Auth Gerekli**: ✅ Evet (Bearer token)  
**Rate Limit**: Yok

**Headers**:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Request Body**: Yok (GET request)

**Başarılı Yanıt (200 OK)**:

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "mert@example.com",
    "firstName": "Mert",
    "lastName": "Sevinç",
    "role": "ADMIN",
    "tenantId": "660e8400-e29b-41d4-a716-446655440001"
  },
  "tenant": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "name": "Mert Fitness Club",
    "billingStatus": "TRIAL",
    "billingStatusUpdatedAt": "2026-01-21T10:00:00.000Z",
    "planKey": "SINGLE"
  },
  "branch": {
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Kadıköy Şubesi",
    "isDefault": true
  },
  "planLimits": {
    "maxBranches": 3,
    "hasClasses": true,
    "hasPayments": false
  }
}
```

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L113-L170)

**Not**: `branch` null olabilir (eğer default branch yoksa).

**Hata Yanıtları**:

| HTTP Status | Code                    | Durum                                      | Örnek Body                                                                                                                                  |
| ----------- | ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **401**     | -                       | Token yok veya geçersiz                    | `{"statusCode": 401, "message": "Unauthorized"}`                                                                                           |
| **403**     | `TENANT_BILLING_LOCKED` | SUSPENDED tenant                           | `{"statusCode": 403, "code": "TENANT_BILLING_LOCKED", "message": "Hesabınız askıya alınmıştır. Lütfen destek ekibi ile iletişime geçin."}` |

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L135-L141)

---

### 4. Billing Status Bilgisi

#### Ayrı `/api/v1/billing/status` endpoint'i **YOK**.

Billing durumu şu endpoint'lerde döner:
- `POST /api/v1/auth/register` → `tenant.billingStatus` alanında
- `POST /api/v1/auth/login` → `tenant.billingStatus` alanında
- `GET /api/v1/auth/me` → `tenant.billingStatus` + `tenant.billingStatusUpdatedAt` alanlarında

**Trial bilgileri** (`trialStartedAt`, `trialEndsAt`) şu anda **client'a dönmüyor**. Backend bu bilgileri tutar ve otomatik olarak trial süresini kontrol eder (bkz. BillingStatusGuard).

**Kaynak**: [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts#L115-L147)

---

## Billing & Trial Mantığı

### Trial Süresi

| Parametre       | Değer                  |
| --------------- | ---------------------- |
| **Trial Süresi**  | 7 gün                  |
| **Başlangıç**     | Kayıt anı (register)   |
| **Bitiş**         | Kayıt + 7 gün          |

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L249-L252)

### Billing Status Değerleri

| Billing Status | Açıklama                                | Giriş Yapabilir mi? | Yazma İşlemleri | Okuma İşlemleri |
| -------------- | --------------------------------------- | ------------------- | --------------- | --------------- |
| **TRIAL**        | Trial süresi aktif veya dolmamış        | ✅ Evet             | ✅ Evet (1)     | ✅ Evet         |
| **TRIAL** (expired) | Trial süresi doldu                   | ✅ Evet             | ❌ **402** (2)  | ✅ Evet         |
| **ACTIVE**       | Ödeme yapılmış, aktif kullanım          | ✅ Evet             | ✅ Evet         | ✅ Evet         |
| **PAST_DUE**     | Ödeme gecikmiş (read-only mode)         | ✅ Evet             | ❌ **403** (3)  | ✅ Evet         |
| **SUSPENDED**    | Hesap askıya alınmış (admin müdahalesi) | ❌ **403** (4)      | ❌ **403**      | ❌ **403**      |

**Notlar**:
1. TRIAL aktifken (trialEndsAt > now): Tüm işlemler normal çalışır
2. TRIAL dolduğunda (trialEndsAt < now): POST/PATCH/PUT/DELETE istekler **402 Payment Required** döner
3. PAST_DUE: GET/HEAD/OPTIONS hariç tüm istekler **403 Forbidden** döner
4. SUSPENDED: Tüm istekler (login dahil) **403 Forbidden** döner

**Kaynak**: [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts#L115-L147)

### Trial Dolduğunda Davranış

#### Backend Kontrolü

Backend, her korumalı endpoint çağrısında **otomatik olarak** şunu kontrol eder:
- Tenant'ın `billingStatus` değeri `TRIAL` mi?
- `trialEndsAt` tarihi geçmiş mi? (`new Date() > tenant.trialEndsAt`)

Eğer ikisi de doğruysa ve istek yazma işlemi ise (POST/PATCH/PUT/DELETE), **402 Payment Required** hatası döner.

**Kaynak**: [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts#L115-L147)

#### 402 Payment Required Hatası

**HTTP Status**: 402  
**Response Body**:

```json
{
  "code": "TRIAL_EXPIRED",
  "message": "Deneme süreniz dolmuştur. Devam etmek için lütfen ödeme yapın.",
  "trialEndsAt": "2026-01-21T10:00:00.000Z"
}
```

**Not**: Standard error response format'ından (statusCode + timestamp + path) farklıdır çünkü BillingStatusGuard özel hata fırlatır.

**Kaynak**: [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts#L135-L143)

#### Mobil App Davranışı

1. **Giriş (login) hala çalışır**: Trial dolsa bile kullanıcı giriş yapabilir
2. **GET istekler çalışır**: Kullanıcı verilerini okuyabilir (dashboard, üye listesi, raporlar)
3. **Yazma istekler (POST/PATCH/DELETE) bloklanır**: 402 hatası döner
4. **Mobil app 402 aldığında**:
   - Paywall ekranı göster
   - "Trial süreniz doldu. Ödeme yaparak devam edin." mesajı
   - Kullanıcıyı ödeme sayfasına yönlendir (future: in-app purchase veya web checkout)
   - **READ-ONLY mode**: Dashboard ve raporlar görüntülenebilir, yeni üye/ödeme eklenemez

---

## Önerilen Mobil Akışlar

### A) İlk Kayıt (First-Time Signup) Akışı

```
┌─────────────┐
│ 1. Register │
│   Screen    │
└──────┬──────┘
       │
       │ POST /api/v1/auth/register
       │ (tenantName, email, password, firstName, lastName, branchName)
       ▼
┌──────────────────────────┐
│ 2. Backend Response:     │
│    - accessToken         │
│    - refreshToken        │
│    - user {}             │
│    - tenant {}           │
│    - branch {}           │
└──────┬───────────────────┘
       │
       │ Store tokens securely (Keychain/EncryptedSharedPreferences)
       ▼
┌──────────────────────────┐
│ 3. Optional: GET /me     │ (Eğer user/tenant detayları güncel değilse)
│    (To fetch full user   │
│     + billing info)      │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 4. Navigate to Home/     │
│    Dashboard Screen      │
└──────────────────────────┘
```

**Not**: Register sonrası `/auth/me` çağırmak **opsiyoneldir** çünkü register zaten gerekli bilgileri döner (user, tenant, branch). Ek bilgi gerekiyorsa (örn. planLimits) çağrılabilir.

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L227-L354)

---

### B) Giriş (Login) Akışı

```
┌─────────────┐
│ 1. Login    │
│   Screen    │
└──────┬──────┘
       │
       │ POST /api/v1/auth/login
       │ (email, password)
       ▼
┌──────────────────────────┐
│ 2. Backend Response:     │
│    - accessToken         │
│    - refreshToken        │
│    - user {}             │
│    - tenant {}           │
└──────┬───────────────────┘
       │
       │ Store tokens securely
       ▼
┌──────────────────────────┐
│ 3. GET /api/v1/auth/me   │ (Billing status + branch info için)
│    (To check billing     │
│     status & trial)      │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 4. Check billingStatus:  │
│    - TRIAL (active) ✅   │
│    - TRIAL (expired) ⚠️  │ → Show "Trial Expired" banner + read-only mode
│    - ACTIVE ✅           │
│    - PAST_DUE ⚠️         │ → Show "Payment Overdue" banner + read-only mode
│    - SUSPENDED ❌        │ → Show "Account Suspended" error (shouldn't happen if login succeeded)
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│ 5. Navigate to Home/     │
│    Dashboard Screen      │
│    (Show banner if trial │
│     expired/past_due)    │
└──────────────────────────┘
```

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L48-L108)  
**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L113-L170)

---

### C) App Cold Start Akışı

```
┌─────────────────────┐
│ App Launch          │
└──────┬──────────────┘
       │
       │ Read stored tokens from secure storage
       ▼
┌────────────────────────┐
│ Tokens exist?          │
└──┬──────────────┬──────┘
   │ NO           │ YES
   │              │
   │              │ GET /api/v1/auth/me (with stored accessToken)
   │              ▼
   │       ┌────────────────────────────┐
   │       │ Response status:           │
   │       │  - 200 OK ✅               │ → Continue to Home Screen
   │       │  - 401 Unauthorized ❌     │ → Clear tokens, navigate to Login
   │       │  - 402 Payment Required ⚠️ │ → Show Paywall + read-only mode (unlikely on /me)
   │       │  - 403 SUSPENDED ❌        │ → Show "Account Suspended" error + logout
   │       │  - Network error 🔌        │ → Show "Offline" message + retry or offline mode
   │       └────────┬───────────────────┘
   │                │
   ▼                ▼
┌──────────────┐  ┌──────────────────────┐
│ Navigate to  │  │ Navigate to Home     │
│ Login Screen │  │ (Check billing       │
└──────────────┘  │  status for banners) │
                  └──────────────────────┘
```

**Önemli**: Network hatası durumunda kullanıcıyı hemen logout **ETMEYİN**. Offline cache'den veri gösterin veya retry seçeneği sunun.

---

### D) Token Refresh Akışı (Gelecekte)

**⚠️ ŞU ANDA REFRESH TOKEN ENDPOINT'İ YOK**

Gelecekte `/api/v1/auth/refresh` endpoint'i eklendiğinde akış şöyle olacak:

```
┌─────────────────────────────┐
│ API call returns 401         │
│ (Access token expired)       │
└──────┬──────────────────────┘
       │
       │ POST /api/v1/auth/refresh
       │ (refreshToken in body or header)
       ▼
┌────────────────────────────────┐
│ Success?                       │
└──┬──────────────┬──────────────┘
   │ YES (200)    │ NO (401)
   │              │
   │              │ (Refresh token invalid/expired)
   │              ▼
   │        ┌──────────────────┐
   │        │ Clear tokens     │
   │        │ Navigate to Login│
   │        └──────────────────┘
   │
   ▼
┌────────────────────────────────┐
│ Store new accessToken          │
│ (and optionally new            │
│  refreshToken if rotated)      │
└──────┬─────────────────────────┘
       │
       │ Retry original API call with new token
       ▼
┌────────────────────────────────┐
│ Continue app flow              │
└────────────────────────────────┘
```

**Şu anki davranış**: Access token süresi dolduğunda (15 dakika sonra) kullanıcı **tekrar login olmalı**.

---

## Branch & Tenant Context

### TenantId Nereden Gelir?

**JWT Token içindeki `tenantId` claim'den** gelir. Backend her istekte token'dan `tenantId`'yi okur ve otomatik olarak ilgili tenant'a ait verileri filtreler.

**Mobil app'in yapması gerekenler**:
- ❌ TenantId'yi request body veya header'da **GÖNDERMEYİN**
- ✅ Sadece valid Bearer token gönderin, backend otomatik halleder

**Kaynak**: [backend/src/auth/guards/tenant.guard.ts](../backend/src/auth/guards/tenant.guard.ts#L22-L30)

---

### BranchId Context

Şu anda backend'de **branch-aware** filtering yok. Tüm veriler tenant seviyesinde filtrelenir.

**Gelecek implementasyon**: Bazı endpoint'lere branch filter'ı eklenecek (örn. `GET /api/v1/members?branchId=xxx`).

**Mobil app'in yapması gerekenler**:
- Register/login sonrası `branch.id` bilgisini saklayın (default branch)
- Kullanıcıya branch seçimi yaptırın (eğer multi-branch kullanıyorsa)
- İlgili endpoint'lerde `branchId` query parameter olarak gönderin (gelecekte)

**Not**: Şu anda **tüm veriler tenant-wide** döner (tüm branch'lar dahil).

**Kaynak**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts#L146-L156)

---

## Örnek Client-Side Kod Parçaları

### 1. Register Function (Pseudo-code)

```swift
// iOS (Swift) - Örnek
func register(
    tenantName: String,
    email: String,
    password: String,
    firstName: String,
    lastName: String,
    branchName: String?,
    branchAddress: String?
) async throws -> AuthResponse {
    let url = URL(string: "\(baseURL)/api/v1/auth/register")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    let body: [String: Any] = [
        "tenantName": tenantName,
        "email": email,
        "password": password,
        "firstName": firstName,
        "lastName": lastName,
        "branchName": branchName ?? "Ana Şube",
        "branchAddress": branchAddress ?? ""
    ]
    request.httpBody = try JSONSerialization.data(withJSONObject: body)
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw AuthError.invalidResponse
    }
    
    // Handle status codes
    switch httpResponse.statusCode {
    case 201:
        let authResponse = try JSONDecoder().decode(AuthResponse.self, from: data)
        // Store tokens securely
        try await KeychainHelper.save(token: authResponse.accessToken, forKey: "accessToken")
        try await KeychainHelper.save(token: authResponse.refreshToken, forKey: "refreshToken")
        return authResponse
        
    case 400:
        let errorResponse = try JSONDecoder().decode(ErrorResponse.self, from: data)
        throw AuthError.validationError(errorResponse.message)
        
    case 409:
        throw AuthError.emailAlreadyExists
        
    case 429:
        throw AuthError.rateLimitExceeded
        
    default:
        throw AuthError.unknownError(httpResponse.statusCode)
    }
}
```

---

### 2. Login Function (Pseudo-code)

```kotlin
// Android (Kotlin) - Örnek
suspend fun login(email: String, password: String): AuthResponse {
    val client = OkHttpClient()
    val url = "$baseURL/api/v1/auth/login"
    
    val json = JSONObject().apply {
        put("email", email)
        put("password", password)
    }
    
    val requestBody = json.toString().toRequestBody("application/json".toMediaType())
    val request = Request.Builder()
        .url(url)
        .post(requestBody)
        .build()
    
    val response = client.newCall(request).execute()
    
    when (response.code) {
        200 -> {
            val authResponse = Gson().fromJson(response.body?.string(), AuthResponse::class.java)
            // Store tokens securely
            EncryptedPrefsHelper.saveToken("accessToken", authResponse.accessToken)
            EncryptedPrefsHelper.saveToken("refreshToken", authResponse.refreshToken)
            return authResponse
        }
        401 -> throw AuthException.InvalidCredentials()
        403 -> {
            val errorBody = Gson().fromJson(response.body?.string(), ErrorResponse::class.java)
            if (errorBody.code == "TENANT_BILLING_LOCKED") {
                throw AuthException.AccountSuspended(errorBody.message)
            }
            throw AuthException.Forbidden()
        }
        429 -> throw AuthException.RateLimitExceeded()
        else -> throw AuthException.UnknownError(response.code)
    }
}
```

---

### 3. Authenticated Fetch (Pseudo-code)

```swift
// iOS (Swift) - Örnek: Bearer token ile API çağrısı
func authenticatedRequest<T: Decodable>(
    path: String,
    method: String = "GET",
    body: [String: Any]? = nil
) async throws -> T {
    guard let accessToken = try? await KeychainHelper.get(forKey: "accessToken") else {
        throw AuthError.notAuthenticated
    }
    
    let url = URL(string: "\(baseURL)\(path)")!
    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    if let body = body {
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
    }
    
    let (data, response) = try await URLSession.shared.data(for: request)
    
    guard let httpResponse = response as? HTTPURLResponse else {
        throw NetworkError.invalidResponse
    }
    
    switch httpResponse.statusCode {
    case 200...299:
        return try JSONDecoder().decode(T.self, from: data)
        
    case 401:
        // Token expired or invalid
        try? await KeychainHelper.delete(forKey: "accessToken")
        try? await KeychainHelper.delete(forKey: "refreshToken")
        throw AuthError.tokenExpired
        
    case 402:
        // Trial expired - allow reads, block writes
        let errorResponse = try? JSONDecoder().decode(BillingErrorResponse.self, from: data)
        throw BillingError.trialExpired(message: errorResponse?.message ?? "Trial expired")
        
    case 403:
        let errorResponse = try? JSONDecoder().decode(ErrorResponse.self, from: data)
        if errorResponse?.code == "TENANT_BILLING_LOCKED" {
            throw BillingError.accountSuspended
        }
        throw NetworkError.forbidden
        
    default:
        throw NetworkError.httpError(httpResponse.statusCode)
    }
}
```

---

### 4. Handling 401 vs 402 (Pseudo-code)

```kotlin
// Android (Kotlin) - Örnek: 401 vs 402 handling
fun handleApiError(statusCode: Int, errorBody: String?) {
    when (statusCode) {
        401 -> {
            // Token expired or invalid → Logout
            clearTokens()
            navigateToLogin()
        }
        
        402 -> {
            // Trial expired → Show paywall + enable read-only mode
            val billingError = Gson().fromJson(errorBody, BillingErrorResponse::class.java)
            
            // Show banner/dialog
            showBillingDialog(
                title = "Deneme Süresi Doldu",
                message = billingError.message,
                trialEndsAt = billingError.trialEndsAt
            )
            
            // Enable read-only mode (hide "Add" buttons, disable write actions)
            enableReadOnlyMode()
        }
        
        403 -> {
            val errorResponse = Gson().fromJson(errorBody, ErrorResponse::class.java)
            if (errorResponse.code == "TENANT_BILLING_LOCKED") {
                // Account suspended → Show error + logout
                showSuspendedAccountDialog()
                clearTokens()
                navigateToLogin()
            } else {
                // Other 403 (PAST_DUE write blocked)
                showBillingDialog(
                    title = "Ödeme Gecikmesi",
                    message = "Hesabınız salt okunur modda. Lütfen ödemenizi tamamlayın."
                )
                enableReadOnlyMode()
            }
        }
    }
}
```

---

## QA Test Checklist

### ✅ Register Tests

- [ ] **Başarılı kayıt**: Valid data ile 201 + accessToken + user + tenant + branch döner
- [ ] **Duplicate email**: Aynı email ile 2. kayıt 409 döner
- [ ] **Password validasyonu**: 10 karakterden kısa şifre 400 döner
- [ ] **Password validasyonu**: En az 1 harf + 1 rakam içermeyen şifre 400 döner
- [ ] **Email validasyonu**: Geçersiz email formatı 400 döner
- [ ] **TenantName validasyonu**: 2 karakterden kısa tenant adı 400 döner
- [ ] **Rate limit**: 3 kayıt denemesinden sonra (aynı IP) 429 döner
- [ ] **Trial başlatma**: Yeni tenant `billingStatus: TRIAL`, `trialEndsAt` yaklaşık 7 gün sonra
- [ ] **Branch oluşturma**: Kayıt sonrası `branch.isDefault: true` döner

---

### ✅ Login Tests

- [ ] **Başarılı login**: Valid credentials ile 200 + accessToken + user + tenant döner
- [ ] **Geçersiz credentials**: Yanlış email/password 401 döner
- [ ] **SUSPENDED tenant**: SUSPENDED tenant ile login 403 + `code: TENANT_BILLING_LOCKED` döner
- [ ] **TRIAL tenant (active)**: Trial aktif tenant ile login 200 döner
- [ ] **TRIAL tenant (expired)**: Trial dolmuş tenant ile login 200 döner (giriş başarılı)
- [ ] **PAST_DUE tenant**: PAST_DUE tenant ile login 200 döner (giriş başarılı)
- [ ] **Rate limit**: 5 başarısız login denemesinden sonra (aynı email) 429 döner

---

### ✅ /auth/me Tests

- [ ] **Valid token**: Valid token ile 200 + user + tenant + branch + planLimits döner
- [ ] **Expired token**: Süresi dolmuş token ile 401 döner
- [ ] **Invalid token**: Geçersiz token ile 401 döner
- [ ] **No token**: Token olmadan 401 döner
- [ ] **SUSPENDED tenant**: SUSPENDED tenant ile 403 döner

---

### ✅ Trial Active Behavior

- [ ] **GET request**: Trial aktifken GET istekler 200 döner
- [ ] **POST request**: Trial aktifken POST istekler başarılı (201/200)
- [ ] **PATCH request**: Trial aktifken PATCH istekler başarılı (200)
- [ ] **DELETE request**: Trial aktifken DELETE istekler başarılı (200/204)

---

### ✅ Trial Expired Behavior (CRITICAL)

- [ ] **GET request**: Trial dolduğunda GET istekler **200 döner** (okuma serbest)
- [ ] **HEAD request**: Trial dolduğunda HEAD istekler **200 döner**
- [ ] **OPTIONS request**: Trial dolduğunda OPTIONS istekler **200/204 döner**
- [ ] **POST request**: Trial dolduğunda POST istekler **402 döner** + `code: TRIAL_EXPIRED`
- [ ] **PATCH request**: Trial dolduğunda PATCH istekler **402 döner** + `code: TRIAL_EXPIRED`
- [ ] **PUT request**: Trial dolduğunda PUT istekler **402 döner** + `code: TRIAL_EXPIRED`
- [ ] **DELETE request**: Trial dolduğunda DELETE istekler **402 döner** + `code: TRIAL_EXPIRED`
- [ ] **402 body format**: `{ code: "TRIAL_EXPIRED", message: "...", trialEndsAt: "ISO8601" }`
- [ ] **Login hala çalışır**: Trial dolsa bile login 200 döner

---

### ✅ PAST_DUE Behavior

- [ ] **GET request**: PAST_DUE tenant GET istekler 200 döner
- [ ] **POST request**: PAST_DUE tenant POST istekler **403 döner** + `code: TENANT_BILLING_LOCKED`
- [ ] **PATCH request**: PAST_DUE tenant PATCH istekler **403 döner**
- [ ] **DELETE request**: PAST_DUE tenant DELETE istekler **403 döner**
- [ ] **Login başarılı**: PAST_DUE tenant ile login 200 döner

---

### ✅ SUSPENDED Behavior

- [ ] **Login blocked**: SUSPENDED tenant ile login **403 döner** + `code: TENANT_BILLING_LOCKED`
- [ ] **GET blocked**: SUSPENDED tenant GET istekler **403 döner**
- [ ] **POST blocked**: SUSPENDED tenant POST istekler **403 döner**

---

### ✅ Token Expiration/Refresh

- [ ] **15 dakika sonra token expire**: Access token süresi dolduğunda 401 döner
- [ ] **Refresh token yok**: Şu anda refresh endpoint yok, kullanıcı tekrar login olmalı
- [ ] **(Gelecek) Refresh endpoint**: Refresh token ile yeni access token alınabilir

---

### ✅ Network & Edge Cases

- [ ] **Network timeout**: Timeout durumunda retry veya offline mode
- [ ] **Server error (500)**: 500 hatası durumunda kullanıcıya anlamlı mesaj göster
- [ ] **Concurrent registrations**: Aynı tenant adı ile eş zamanlı kayıt (unique slug kontrolü)
- [ ] **Empty branchName**: `branchName` gönderilmezse default "Ana Şube" kullanılır
- [ ] **Empty branchAddress**: `branchAddress` gönderilmezse empty string kabul edilir

---

## Ek Kaynaklar

- **Backend Code**: [backend/src/auth/](../backend/src/auth/)
- **Auth Service**: [backend/src/auth/auth.service.ts](../backend/src/auth/auth.service.ts)
- **BillingStatusGuard**: [backend/src/auth/guards/billing-status.guard.ts](../backend/src/auth/guards/billing-status.guard.ts)
- **Register DTO**: [backend/src/auth/dto/register.dto.ts](../backend/src/auth/dto/register.dto.ts)
- **Login DTO**: [backend/src/auth/dto/login.dto.ts](../backend/src/auth/dto/login.dto.ts)
- **Billing Messages**: [backend/src/common/constants/billing-messages.ts](../backend/src/common/constants/billing-messages.ts)
- **Error Filter**: [backend/src/common/filters/http-exception.filter.ts](../backend/src/common/filters/http-exception.filter.ts)
- **E2E Tests**: [backend/test/billing-status.e2e-spec.ts](../backend/test/billing-status.e2e-spec.ts)
- **Verification Report**: [docs/REGISTER_TRIAL_VERIFICATION_REPORT.md](../docs/REGISTER_TRIAL_VERIFICATION_REPORT.md)

---

## Sık Sorulan Sorular (FAQ)

### Q1: Trial süresi dolduğunda kullanıcı giriş yapabilir mi?

**Evet**. Trial süresi dolsa bile `POST /api/v1/auth/login` başarılı olur (200 döner). Ancak login sonrası yazma işlemleri (POST/PATCH/DELETE) 402 hatası döner. Okuma işlemleri (GET) serbest.

---

### Q2: 402 vs 403 hatası arasındaki fark nedir?

- **402 Payment Required**: Trial süresi dolmuş, yazma işlemleri bloklanmış (read-only mode). Ödeme yapılırsa düzelir.
- **403 Forbidden**: Hesap SUSPENDED (admin müdahalesi gerekli) veya PAST_DUE (ödeme gecikmiş). Ödeme yapılırsa veya admin aktif ederse düzelir.

---

### Q3: Refresh token nasıl kullanılır?

**Şu anda refresh token endpoint'i YOK**. Backend refresh token üretir ancak kullanımı henüz implement edilmemiş. Access token (15 dakika) süresi dolduğunda kullanıcı tekrar login olmalı.

**Gelecek**: `/api/v1/auth/refresh` endpoint'i eklenecek.

---

### Q4: BranchId client'dan gönderilmeli mi?

**Hayır**. Şu anda backend otomatik olarak default branch'ı döner (`GET /auth/me`). Kullanıcı multi-branch kullanıyorsa gelecekte endpoint'lere `?branchId=xxx` query parameter eklenecek.

---

### Q5: Billing durumu ne sıklıkla kontrol edilmeli?

- **App cold start**: `GET /auth/me` çağır
- **Login sonrası**: `GET /auth/me` çağır (billing status için)
- **402/403 hatası aldığında**: Billing durumu güncel değil, kullanıcıya paywall göster

**Periyodik polling gerekli değil**, backend her istekte otomatik kontrol eder.

---

### Q6: Trial süresini client-side gösterebilir miyiz?

**Hayır**. Şu anda backend `trialEndsAt` bilgisini client'a **dönmüyor**. Client sadece billing status (`TRIAL`) ve trial dolduğunda 402 hatası alır.

**Gelecek**: `GET /auth/me` response'una `trialEndsAt` alanı eklenebilir.

---

## Son Notlar

Bu dokümantasyon backend kod bazlı hazırlanmıştır. Backend implementasyonunda değişiklik olduğunda bu doküman güncellenmeli.

**Backend Version**: v1 (28 Ocak 2026)  
**Doküman Hazırlayan**: GitHub Copilot (Senior Mobile-Backend Integration Engineer)

---

**Sorularınız için**: Backend geliştirme ekibi ile iletişime geçin.
