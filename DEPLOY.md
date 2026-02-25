# VPS Deploy Kılavuzu

## İlk Kurulum (Production'a ilk kez deploy)

VPS'te projeyi ilk kez kurarken migration geçmişi bozuk olabilir. Aşağıdaki adımları izleyin:

### 1. Kod çek ve deploy başlat

```bash
git pull origin main
./deploy.sh force
```

Bu adımda `prisma migrate deploy` **P3009** hatası verecektir (failed migrations). Bu beklenen bir durumdur. Container'lar ayağa kalkmış olacak.

### 2. Veritabanını sıfırla ve migrate uygula

```bash
./deploy.sh reset-db
```

Bu komut:
- Veritabanı şemasını tamamen sıfırlar (tüm tablolar silinir)
- Baseline migration'ı temiz şekilde uygular
- Health check yapar

**Uyarı:** `reset-db` tüm veriyi siler. Sadece ilk kurulumda kullanın.

### 3. Tamamlandı

API `https://gym-api.quuilo.com/health` adresinde çalışıyor olmalıdır.

---

## Sonraki Deploy'lar (Normal güncelleme)

```bash
./deploy.sh force
```

veya otomatik güncelleme için:

```bash
./deploy.sh watch
```

---

## Komutlar

| Komut | Açıklama |
|-------|----------|
| `./deploy.sh once` | Sadece uzakta yeni commit varsa deploy |
| `./deploy.sh force` | Her zaman deploy |
| `./deploy.sh reset-db` | İlk kurulum: DB sıfırla + migrate (veri silinir) |
| `./deploy.sh fix-migrations` | Var olan prod DB'de migration geçmişini düzelt (veri korunur) |
| `./deploy.sh watch` | 20 sn'de bir kontrol, güncelleme varsa deploy |

---

## Ön Gereksinimler

- `backend/.env` dosyası production değerleriyle dolu olmalı
- Traefik network (`traefik_web`) mevcut olmalı
- Domain DNS'i VPS IP'sine yönlendirilmiş olmalı
