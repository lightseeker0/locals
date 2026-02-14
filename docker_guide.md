# Docker + Cloudflare Tunnel Kurulum Rehberi

Port açmaya gerek kalmadan, Cloudflare Tunnel kullanarak sunucunu güvenli bir şekilde dış dünyaya açacağız.

## 1. Cloudflare Tunnel Oluşturma

1.  **Cloudflare Zero Trust** paneline gir: [one.dash.cloudflare.com](https://one.dash.cloudflare.com/)
2.  **Networks -> Tunnels** yolunu izle ve **Add a Tunnel** butonuna tıkla.
3.  **Cloudflared** seçeneğini seç ve tünele bir isim ver (örn: `locals-server`).
4.  **Install connector** sayfasında **Docker**'ı seç. 
5.  Orada sana bir komut verecek, o komutun içindeki **Token** kısmını (uzun bir karakter dizisi) kopyala.
6.  Proje ana dizinindeki `.env` dosyasını aç ve `TUNNEL_TOKEN=` kısmına bu token'ı yapıştır.
7.  **Public Hostname** sekmesine git:
    - **Subdomain:** Boş bırakabilirsin veya `api` yazabilirsin.
    - **Domain:** `fiskos.xyz` seç.
    - **Service Type:** `HTTP`
    - **URL:** `api:3000` (Docker içindeki servis adı)

## 2. Sunucuyu Başlatma

Terminalde (ana dizinde) şu komutu çalıştır:

```bash
docker-compose up -d --build
```

Bu komut hem API'yi hem de Cloudflare Tunnel'ı aynı anda başlatacaktır.

## 3. Uygulama Ayarı

`.env` dosyasındaki `VITE_API_URL` adresinin, Cloudflare'de belirlediğin adresle aynı olduğundan emin ol:
```env
VITE_API_URL=https://fiskos.xyz/api
```

## 4. Avantajlar
- **Güvenlik:** Modemde hiçbir port açmana gerek yok.
- **SSL:** HTTPS sertifikası Cloudflare tarafından otomatik sağlanır.
- **Gizlilik:** Bilgisayarının gerçek IP adresi gizli kalır.

