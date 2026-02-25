# Prisma Migration Rebaseline Planı

## A. Root Cause Summary (Türkçe)

1. **Migration 20251211024003** (`add_membership_plan_initial_structure`) bir **"big bang" snapshot** migration'dır; tüm şemayı sıfırdan oluşturuyor gibi davranıyor.

2. **Migration 1–3 (prod'da uygulanmış):**
   - `20251205053130`: Role enum, Tenant, Branch, User tabloları
   - `20251206141044`: PlanKey enum, Tenant.planKey, User.isActive
   - `20251209034725`: MemberStatus, MemberGender enum'ları, Member tablosu (membershipType ile)

3. **20251211024003 tekrar oluşturmaya çalışıyor:**
   - `PlanKey` (zaten m2'de var) → `ERROR: type "PlanKey" already exists`
   - `MemberStatus`, `MemberGender` (zaten m3'te var)
   - `Tenant`, `Branch`, `User`, `Member` tabloları (CREATE TABLE → tablolar zaten var)

4. **20251211024003 aynı zamanda sonraki migration'ların işini yapıyor:**
   - Payment, IdempotencyKey (m12: 20251224234257)
   - BillingStatus, trial alanları (m11, m14)
   - MemberPlanChangeHistory (m17: 20260130013852)
   - EmailOtp, PasswordResetOtp (m18, m19)
   - Product, ProductSale, ProductSaleItem, RevenueMonthLock (m19: 20260213132924)
   - timezone (m20: 20260214042523)
   - Branch/Member/MembershipPlan/Payment/Product/ProductSale için composite unique'ler (m21)

5. **Sıralama problemi:** 20251211024003, migration 4 olarak eklenmiş ama Prisma'nın `prisma migrate dev` ile tam şema dump'ı üretilmiş; incremental değil.

6. **Prod durumu:** Migration 1–3 uygulanmış, migration 4 çalıştırıldığında `PlanKey already exists` hatası alınıyor.

7. **Sonuç:** Migration zinciri tutarsız; 20251211024003 hem önceki migration'larla hem sonrakilerle çakışıyor.

---

## B. Önerilen Strateji: Rebaseline (Türkçe)

**Temel fikir:** Tüm geçmiş migration'ları tek bir "baseline" migration ile değiştir. Yeni ortamlar sıfırdan baseline ile başlasın; prod ise baseline'ı "zaten uygulanmış" olarak işaretlensin.

**Avantajlar:**
- Yeni ortamlar: Tek migration ile temiz kurulum
- Prod: Veri kaybı yok, sadece `_prisma_migrations` güncellenir
- Gelecek: Tüm yeni migration'lar baseline üzerine incremental olarak eklenecek
- `prisma migrate deploy` tekrar tekrar hatasız çalışır

**20251211024003'e ne olacak?** Silinecek. Baseline, mevcut `schema.prisma`'dan üretilecek ve tüm objeleri tek seferde içerecek.

---

## C. Step-by-Step Implementation Plan

### Ön Hazırlık (Yedek + Doğrulama)

```bash
# 1. Prod DB yedeği (opsiyonel ama önerilir)
pg_dump -h <PROD_HOST> -U gym_api -d gym_api -F c -f backup_$(date +%Y%m%d).dump

# 2. Mevcut migration durumunu kontrol et
cd backend
npx prisma migrate status
```

### Adım 1: Baseline Migration Oluşturma

```bash
cd backend

# 3. Mevcut migrations klasörünü yedekle (silmeden önce)
mv prisma/migrations prisma/migrations_backup_$(date +%Y%m%d)

# 4. Boş migrations klasörü oluştur
mkdir -p prisma/migrations

# 5. Baseline migration klasörü oluştur (timestamp: önceki ilk migration'dan önce)
mkdir -p prisma/migrations/20251205000000_baseline

# 6. Mevcut şemadan SQL üret (prisma migrate diff kullan)
npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/20251205000000_baseline/migration.sql
```

**Önemli:** `prisma migrate diff` çıktısı `MemberPlanChangeHistory` için partial unique index içermez (Prisma schema'da tanımlı değil). Bu index migration 20260214134256'da raw SQL ile eklenmiş. Baseline'a **manuel ekleme** yapın:

```bash
# migration.sql dosyasının sonuna ekleyin (MemberPlanChangeHistory CREATE TABLE'dan sonra):
cat >> prisma/migrations/20251205000000_baseline/migration.sql << 'EOF'

-- Partial unique index: prevent duplicate APPLIED history for same member and effective date (from 20260214134256)
CREATE UNIQUE INDEX "MemberPlanChangeHistory_memberId_effectiveDateDay_APPLIED_key"
ON "MemberPlanChangeHistory" ("memberId", "effectiveDateDay")
WHERE "changeType" = 'APPLIED';
EOF
```

**Not:** Eski Prisma sürümlerinde `--to-schema-datamodel` kullanılıyordu; güncel sürümde `--to-schema` kullanın.

```bash
# Alternatif: prisma db execute ile mevcut DB'den introspect edip diff al
# Veya: schema.prisma'dan manuel SQL üretmek için prisma migrate dev --create-only
# Sonra migration.sql dosyasını kopyala
```

**Alternatif yöntem (prisma migrate diff yoksa):**

```bash
# Geçici bir DB'de tüm migration'ları uygula, sonra schema'dan diff al
# 1. Docker ile boş Postgres başlat
docker run -d --name prisma_baseline_db -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=test -p 5433:5432 postgres:15

# 2. DATABASE_URL ile migrate diff çalıştır (boş DB'ye karşı)
DATABASE_URL="postgresql://test:test@localhost:5433/test" npx prisma migrate diff \
  --from-empty \
  --to-schema prisma/schema.prisma \
  --script > prisma/migrations/20251205000000_baseline/migration.sql

# 3. Geçici container'ı sil
docker rm -f prisma_baseline_db
```

### Adım 2: Baseline SQL Dosyasını Kontrol Et

```bash
# migration.sql dosyasının geçerli SQL olduğunu doğrula
head -100 prisma/migrations/20251205000000_baseline/migration.sql
```

- Tüm enum'lar, tablolar, index'ler, FK'lar olmalı
- `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX`, `ALTER TABLE ... ADD CONSTRAINT` ifadeleri olmalı

### Adım 3: Production DB İçin Baseline'ı "Uygulanmış" Olarak İşaretle

**ÖNEMLİ:** Production DB'de migration'lar zaten uygulanmış. Baseline'ı çalıştırmayacağız; sadece `_prisma_migrations` tablosuna kayıt ekleyeceğiz.

```sql
-- Production DB'de çalıştır (psql veya pgAdmin ile)
-- Bu, baseline migration'ı "başarıyla uygulanmış" olarak işaretler

INSERT INTO "_prisma_migrations" (
  id,
  checksum,
  finished_at,
  migration_name,
  logs,
  rolled_back_at,
  started_at,
  applied_steps_count
) VALUES (
  gen_random_uuid()::text,
  '',  -- checksum boş bırakılabilir veya migration.sql'in hash'i
  NOW(),
  '20251205000000_baseline',
  NULL,
  NULL,
  NOW(),
  1
);
```

**Checksum hesaplama (opsiyonel, Prisma uyumluluğu için):**

```bash
# Baseline migration.sql dosyasının checksum'ını al
# Prisma SHA256 kullanıyor; aşağıdaki gibi hesaplanabilir:
cat prisma/migrations/20251205000000_baseline/migration.sql | shasum -a 256 | cut -d' ' -f1
```

Daha doğru checksum için Prisma'nın beklediği formatı kullanmak gerekebilir. Prisma `_prisma_migrations` için checksum'ı migration.sql içeriğinden hesaplar. Eğer `prisma migrate deploy` çalıştığında "checksum mismatch" uyarısı alırsanız, aşağıdaki gibi güncelleyebilirsiniz:

```bash
# Prisma'nın checksum hesaplaması için: migration.sql dosyasına göre
# Prisma deploy çalıştığında eğer "already applied" diyorsa sorun yok
```

**Pratik yaklaşım:** Önce `INSERT` ile migration_name ve applied_steps_count=1 ekleyin. `prisma migrate deploy` çalıştırdığınızda Prisma bu migration'ı "zaten uygulanmış" görecek ve atlayacak.

### Adım 4: Staging / Dev DB İçin

**Seçenek A – Reset (veri silinir, sadece dev/staging için):**

```bash
cd backend
npx prisma migrate reset --force
# Bu: DB'yi siler, baseline'ı uygular
```

**Seçenek B – Migrate deploy (veri korunur, migration geçmişi temizlenmişse):**

Eğer staging'de de eski migration'lar uygulanmışsa ve veri korunacaksa:

1. Staging DB'de `_prisma_migrations` tablosundaki tüm kayıtları sil
2. Yukarıdaki `INSERT` ile sadece baseline kaydını ekle
3. `npx prisma migrate deploy` çalıştır (bu durumda zaten uygulanmış objeler olduğu için baseline SQL'i hata verebilir)

**Staging için öneri:** Veri önemsizse `migrate reset` kullanın. Veri önemliyse, staging'i de prod gibi "baseline applied" olarak işaretleyin ve manuel SQL ile `_prisma_migrations`'ı güncelleyin.

### Adım 5: Eski Migrations Klasörünü Kaldır

```bash
# migrations_backup_* artık kullanılmayacak; silinebilir veya arşivlenebilir
# Git'te artık sadece baseline kalacak
rm -rf prisma/migrations_backup_*
# veya arşivle: tar -czvf migrations_backup.tar.gz prisma/migrations_backup_*
```

### Adım 6: Git Branch Stratejisi ve PR

```bash
# 1. Yeni branch
git checkout -b fix/prisma-migration-rebaseline

# 2. Değişiklikler
# - prisma/migrations/ eski içeriği silindi
# - prisma/migrations/20251205000000_baseline/ eklendi

# 3. Commit
git add backend/prisma/migrations/
git add backend/prisma/MIGRATION_REBASELINE_PLAN.md
git commit -m "fix(prisma): rebaseline migrations - remove big bang 20251211024003"

# 4. PR checklist
# - [ ] Baseline migration.sql mevcut schema ile uyumlu
# - [ ] Prod'da _prisma_migrations INSERT manuel yapıldı
# - [ ] Staging'de migrate reset veya manuel INSERT yapıldı
# - [ ] prisma migrate deploy prod'da test edildi
# - [ ] Yeni ortamda migrate deploy test edildi
```

### Adım 7: Gelecek Migration'lar

Bundan sonra yeni migration'lar **baseline üzerine** incremental olarak eklenecek:

```bash
# Schema değişikliği yap
# Sonra:
npx prisma migrate dev --name add_new_feature
```

Yeni migration'lar `20251205000000_baseline` sonrasına eklenir; çakışma olmaz.

---

## D. Verification Gate

### 1. Prisma Komutları

```bash
cd backend

# Generate
npx prisma generate
# Beklenen: Hata yok

# Validate
npx prisma validate
# Beklenen: Environment variables loaded... The schema is valid

# Migrate status (prod DB'ye bağlıyken)
DATABASE_URL="postgresql://..." npx prisma migrate status
# Beklenen: Database schema is up to date!
```

### 2. SQL Doğrulama Sorguları (Prod/Staging)

```sql
-- Enum'lar
SELECT typname FROM pg_type WHERE typname IN ('Role','PlanKey','MemberStatus','MemberGender','MaritalStatus','BloodType','DurationType','PlanStatus','PlanScope','BillingStatus','PaymentMethod');
-- Beklenen: 11 satır

-- Kritik tablolar
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Tenant','Branch','User','Member','MembershipPlan','Payment','IdempotencyKey','MemberPlanChangeHistory','EmailOtp','PasswordResetOtp','Product','ProductSale','ProductSaleItem','RevenueMonthLock');
-- Beklenen: 14 satır

-- Tenant timezone kolonu
SELECT column_name FROM information_schema.columns WHERE table_name = 'Tenant' AND column_name = 'timezone';
-- Beklenen: 1 satır

-- MembershipPlan composite unique
SELECT indexname FROM pg_indexes WHERE tablename = 'MembershipPlan' AND indexname LIKE '%tenantId%scope%';
-- Beklenen: En az 1 satır

-- _prisma_migrations
SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at;
-- Beklenen: 20251205000000_baseline görünmeli
```

### 3. Docker / Deploy Kontrolü

```bash
# Backend dizininde
cd backend

# Docker compose ile DB + API başlat
docker compose -f docker-compose.prod.yml up -d

# Migrate deploy (container içinde)
docker exec -i gym-api sh -lc "npx prisma migrate deploy --schema=prisma/schema.prisma"
# Beklenen: No pending migrations / All migrations have been applied

# Health check
curl -sk https://gym-api.quuilo.com/health
# Beklenen: 200
```

### 4. Yeni Ortam Testi (Sıfırdan)

```bash
# Boş Postgres
docker run -d --name test_db -e POSTGRES_USER=gym -e POSTGRES_PASSWORD=gym -e POSTGRES_DB=gym -p 5434:5432 postgres:15

# .env.test ile
DATABASE_URL="postgresql://gym:gym@localhost:5434/gym" npx prisma migrate deploy
# Beklenen: 1 migration applied (20251205000000_baseline)

# Doğrulama
DATABASE_URL="postgresql://gym:gym@localhost:5434/gym" npx prisma migrate status
# Beklenen: Database schema is up to date!

docker rm -f test_db
```

---

## E. Risks & Rollback Plan

### Riskler

| Risk | Olasılık | Etki | Azaltma |
|------|----------|------|---------|
| Baseline SQL hatalı | Orta | Yeni ortamda migrate fail | Adım 2'de SQL kontrolü, yeni ortam testi |
| Prod'da INSERT yanlış | Düşük | migrate deploy beklenmedik davranır | INSERT öncesi `_prisma_migrations` yedekle |
| Checksum uyarısı | Orta | Prisma "modified" uyarısı | Checksum'ı doğru hesapla veya Prisma dokümantasyonuna bak |
| Staging veri kaybı | Yüksek (reset kullanılırsa) | Staging verisi silinir | Sadece dev/staging'de reset; prod'da asla reset yok |

### Rollback Plan

**Prod'da sorun çıkarsa:**

1. `_prisma_migrations` tablosundan baseline kaydını sil:
   ```sql
   DELETE FROM "_prisma_migrations" WHERE migration_name = '20251205000000_baseline';
   ```

2. Eski migrations klasörünü geri yükle:
   ```bash
   rm -rf prisma/migrations
   mv prisma/migrations_backup_YYYYMMDD prisma/migrations
   ```

3. Eski kod branch'ine dön:
   ```bash
   git checkout main
   ```

4. `prisma migrate deploy` artık eski migration'larla çalışır (migration 4 hâlâ fail edecek; kalıcı çözüm için rebaseline gerekli).

**Veri kaybı:** Bu plan prod verisini silmez. Sadece migration geçmişi değişir.

---

## Özet Komutlar (Hızlı Referans)

```bash
# 1. Yedekle
mv backend/prisma/migrations backend/prisma/migrations_backup

# 2. Baseline oluştur
mkdir -p backend/prisma/migrations/20251205000000_baseline
cd backend && npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > prisma/migrations/20251205000000_baseline/migration.sql

# 3. Prod'da (psql ile)
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '', NOW(), '20251205000000_baseline', NULL, NULL, NOW(), 1);

# 4. Deploy test
npx prisma migrate deploy
```
