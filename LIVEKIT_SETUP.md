# LiveKit SFU Setup (Self-Hosted)

Bu proje artık `VITE_VOICE_MODE=sfu` ile LiveKit kullanacak şekilde hazırlandı.

## 1. Anahtarlar

Gerçek `LIVEKIT_API_KEY` ve `LIVEKIT_API_SECRET` değerlerini kendi ortamında üretip kullan.

Projede güvenlik için placeholder bırakıldı:
- `.env` (lokal/private)
- `livekit/livekit.yaml` (`LIVEKIT_API_KEY_PLACEHOLDER`)

## 2. DNS

Alan adında aşağıdaki kayıt olmalı:
- `A livekit.fiskos.xyz -> <sunucu_public_ip>`

Not: Cloudflare kullanıyorsan `DNS only` (gri bulut) önerilir.

## 3. Firewall / Portlar

Sunucuda şu portlar açık olmalı:
- `7880/tcp` (LiveKit signaling)
- `7881/tcp` (ICE TCP fallback)
- `50000-50100/udp` (WebRTC medya)

## 4. Çalıştırma

Kök dizinde:

```bash
docker compose up -d --build
```

Bu compose dosyasında şu servisler hazır:
- `api`
- `tunnel`
- `redis`
- `livekit`

## 5. Backend entegrasyonu

API tarafı LiveKit token endpoint:
- `POST /api/voice/sfu-token`

Gerekli server env:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

## 6. Reverse proxy (opsiyonel)

`Caddyfile` içine şu host eklendi:

- `livekit.fiskos.xyz -> livekit:7880`

Eğer Caddy çalıştırmıyorsan, mevcut reverse proxy katmanında aynı yönlendirmeyi yap.

## 7. Önemli not

Cloudflare Tunnel UDP medya portlarını taşımaz. Sadece HTTP/WebSocket tüneliyle ses kalitesi ve bağlantı başarısı düşebilir. Kararlı SFU için LiveKit trafiğini doğrudan sunucu IP/domain üzerinden servis et.
