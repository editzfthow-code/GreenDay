# GreenDay v5.5.0 — Source Code (dengan Ruang Cici 💚)

Paket kode sumber lengkap aplikasi **GreenDay** versi v5.5.0, termasuk
**Ruang Cici** — halaman khusus maskot Cici yang imut + chatbot AI.

## Isi Paket

```
greenday-source/
├── public/greenday/
│   ├── index.html          ← Aplikasi utama GreenDay v5.5.0 (SPA 1 file)
│   │                          • Halaman "Ruang Cici" (hero panggung Cici,
│   │                            kustomisasi: nama, suasana, mata, daun,
│   │                            aksesori, nada sapaan — pratinjau live)
│   │                          • Chat AI "Ngobrol sama Cici" (perkenalan
│   │                            otomatis + selalu menyebut pencipta
│   │                            AFF&Z.AI), riwayat chat tersimpan
│   ├── manifest.json        ← PWA manifest (v5.5.0 + shortcut Ruang Cici)
│   ├── service-worker.js    ← PWA service worker (cache v5.5.0)
│   ├── pengumuman.json      ← Feed pengumuman (ada entri rilis v5.5.0)
│   └── icon.svg / icon-192.png / icon-512.png
├── src/app/
│   ├── page.tsx            ← Route "/" Next.js → menampilkan GreenDay (iframe)
│   └── api/cici/route.ts   ← BACKEND chatbot Cici (POST /api/cici)
└── README-CICI.md          ← File ini
```

## Cara Menjalankan

### 1) Jalankan penuh (Next.js + chat AI aktif) — disarankan
Letakkan folder `src/` dan `public/` ke project Next.js (App Router) yang
sudah ada `z-ai-web-dev-sdk`, lalu:

```bash
npm install          # atau: bun install
npm run dev          # buka http://localhost:3000
```

Endpoint chatbot: `POST /api/cici` dengan body:

```json
{
  "messages": [{ "role": "user", "content": "halo cici!" }],
  "profile": { "userName": "NamaKamu", "ciciName": "Cici", "tone": "manja" }
}
```

Respons: `{ "reply": "..." }`

### 2) Jalankan statis saja (tanpa chat AI)
Buka langsung `public/greenday/index.html` di browser.
Semua fitur GreenDay jalan (tugas, jurnal, kebiasaan, dll). Hanya chat AI
Cici yang butuh backend `/api/cici`.

## Kepribadian Cici (dari src/app/api/cici/route.ts)

- Imut, lembut, TIDAK kaku — bicara seperti sahabat terdekat.
- Memperkenalkan diri otomatis di awal percakapan.
- WAJIB menyebut penciptanya: **AFF&Z.AI**.
- 3 gaya sapaan bisa dipilih user: `manja` / `lembut` / `semangat`.
- Riwayat 14 pesan terakhir dikirim ulang agar konteks tidak hilang.

## Catatan Versi

- `APP_VERSION = "v5.5.0"` di index.html.
- PWA (manifest + service worker + pengumuman) sudah disinkronkan ke v5.5.0.
- Dibuat dengan sayang oleh AFF&Z.AI 💚
