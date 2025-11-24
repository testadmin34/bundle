# Deployment Guide - Ücretsiz Hosting

Bu projeyi ücretsiz olarak canlıya almak için birkaç seçenek var:

## 🚀 Seçenek 1: Vercel (ÖNERİLEN - En Kolay)

### Avantajlar:
- ✅ Tamamen ücretsiz
- ✅ Otomatik HTTPS
- ✅ Hızlı deployment (1 dakika)
- ✅ Git ile otomatik deploy

### Adımlar:

1. **Vercel hesabı oluştur**: https://vercel.com/signup

2. **Projeyi hazırla**:
   ```bash
   # package.json'a ekle:
   "scripts": {
     "build": "tsc",
     "start": "node dist/server.js"
   }
   ```

3. **vercel.json oluştur**:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "dist/server.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/(.*)",
         "dest": "dist/server.js"
       }
     ]
   }
   ```

4. **Deploy et**:
   ```bash
   npm install -g vercel
   vercel login
   vercel --prod
   ```

5. **Environment Variables ekle**:
   - Vercel dashboard'a git
   - Settings > Environment Variables
   - `GEMINI_API_KEY` ekle

---

## 🚀 Seçenek 2: Railway (Kolay + Güçlü)

### Avantajlar:
- ✅ Ücretsiz $5/ay kredi
- ✅ Daha fazla kaynak
- ✅ Database desteği

### Adımlar:

1. **Railway hesabı**: https://railway.app/

2. **GitHub'a push et**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin YOUR_GITHUB_REPO
   git push -u origin main
   ```

3. **Railway'de deploy**:
   - New Project > Deploy from GitHub
   - Repository seç
   - Environment Variables ekle: `GEMINI_API_KEY`
   - Deploy!

---

## 🚀 Seçenek 3: Render (Basit)

### Avantajlar:
- ✅ Tamamen ücretsiz
- ✅ Otomatik deploy

### Adımlar:

1. **Render hesabı**: https://render.com/

2. **GitHub'a push et** (yukarıdaki gibi)

3. **Render'da**:
   - New > Web Service
   - GitHub repo bağla
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment Variables: `GEMINI_API_KEY`

---

## 📝 Önemli Notlar

### XML Dosyası Sorunu
100MB XML dosyası deployment'ta sorun çıkarabilir. Çözümler:

**Çözüm 1: XML'i Cloud'da tut**
```typescript
// server.ts'de
const XML_URL = 'https://cf6ad7.s3.amazonaws.com/insider.xml';
const response = await fetch(XML_URL);
const xmlData = await response.text();
```

**Çözüm 2: .gitignore'a ekle, deployment'ta indir**
```bash
# .gitignore
insider.xml

# Deployment'ta:
curl -o insider.xml https://cf6ad7.s3.amazonaws.com/insider.xml
```

---

## 🎯 Hızlı Başlangıç (Vercel ile)

1. Projeyi GitHub'a push et
2. Vercel'e git: https://vercel.com/new
3. GitHub repo'yu seç
4. Environment Variables ekle
5. Deploy!

**5 dakikada canlıda!** 🚀
