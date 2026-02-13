# İnternete Açma ve "Matrix" İsimlendirme Rehberi

Uygulamayı yerel makinenizden çıkarıp profesyonel bir şekilde internete açmak ve "matrix" ismini (Örn: matrix.alaniniz.com veya nostr identity) kullanmak için en sağlıklı yöntemler aşağıdadır.

## 1. Uygulamayı Yayınlama (Deployment)

`loca.lt` veya `ngrok` gibi geçici tüneller yerine, modern web uygulamaları için en iyi ücretsiz ve kalıcı seçenekler **Vercel** veya **Cloudflare Pages**'dir.

### Vercel ile Yayına Alma (Önerilen)
1. Projenizi GitHub'a yükleyin.
2. [Vercel](https://vercel.com) üzerinde yeni bir proje oluşturun ve GitHub deponuzu bağlayın.
3. Vercel otomatik olarak `npm run build` komutunu çalıştıracak ve uygulamayı yayına alacaktır.
4. Vercel size `proje-adı.vercel.app` şeklinde bir adres verecektir.

## 2. "Matrix" İsmi ile Adresleme

Eğer bir alan adınız (domain) varsa, iki şekilde "matrix" adını kullanabilirsiniz:

### A. Subdomain Olarak (HTTP Adresi)
Alan adınızın DNS ayarlarından bir `CNAME` kaydı ekleyerek uygulamayı `matrix.alaniniz.com` adresine yönlendirebilirsiniz.
- **Type**: `CNAME`
- **Name**: `matrix`
- **Value**: `cname.vercel-dns.com` (Vercel kullanıyorsanız)

### B. Nostr Kimliği Olarak (NIP-05)
Nostr dünyasında `isim@alanadi.com` şeklinde bulunabilmek için NIP-05 protokolü kullanılır.
1. Proje içindeki `public/.well-known/nostr.json` dosyasını açın.
2. `"matrix": "..."` kısmına kendi **Public Key (Hex)** değerinizi yazın.
3. Bu dosya yayına girdiğinde, insanlar sizi Nostr üzerinde `matrix@alaniniz.com` yazarak bulabilirler.

## 3. Maliyet ve Ücretlendirme

**Hayır, Cloudflare ve Vercel bu proje için tamamen ücretsizdir.**

- **Cloudflare Pages**: Sınırsız bant genişliği ve aylık 500 build (derleme) hakkı ücretsizdir. Kişisel projeler için ömür boyu ücretsiz kalabilir.
- **Vercel**: "Hobby" planı kapsamında ücretsizdir. Nostr projeleri için fazlasıyla yeterlidir.
- **DNS**: Eğer bir alan adınız (`.com`, `.net` vb.) varsa, bunu yıllık ~10-15$ gibi bir ücrete domain kayıt firmasından alırsınız. Ancak Cloudflare'in **hizmetlerini** (koruma, DNS yönetimi) kullanmak ücretsizdir.

## 4. Güvenlik ve Çevre Değişkenleri (.env)

Hassas verilerin (API Key, Private Key vb.) internete sızmaması için şu kurallara dikkat edilmelidir:

- **.env Dosyası**: `.env` dosyaları asla GitHub/GitLab'a yüklenmemelidir. Projenizdeki `.gitignore` dosyası bunu engelleyecek şekilde güncellenmiştir.
- **Nostr Private Key**: Uygulamanızda kullandığınız Nostr Private Key'i asla koda hardcoded (sabit) şekilde yazmayın. Logic gereği bu anahtar sadece tarayıcınızın `localStorage` alanında saklanır ve sunucuya gönderilmez.
- **Cloudflare Environment Variables**: Eğer gelecekte gizli bir API Key kullanmanız gerekirse, bunu Cloudflare dashboard üzerinden **Settings -> Variables** kısmından ekleyin.

## 5. Neden Tünel Kullanmamalıyız?
- **Güvenlik**: Tüneller yerel makinenizi dış dünyaya doğrudan açar, bu da risklidir.
- **Performans**: Vercel/Cloudflare gibi servisler içeriklerinizi global CDN üzerinden dağıtır (çok daha hızlıdır).
- **Süreklilik**: Tüneller bilgisayarınızı kapattığınızda ölür, hosting servisleri 7/24 çalışır.

---
> [!TIP]
> Eğer bir alan adınız yoksa, `matrix-chat-clone.vercel.app` gibi bir ismi ücretsiz olarak alabilirsiniz. Alan adınız varsa, DNS üzerinden tam kontrol sağlayabilirsiniz.
