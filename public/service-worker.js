/* ============================================================
   GreenDay — Service Worker v5.4.2
   v5.4 "Ruang Cici": perbaikan besar bug + fitur kustomisasi Cici —
     - Ruang Cici: atur gaya & warna mata, warna daun, aksesori,
       suasana wajah, nama panggilan, dan nada sapaan (manja/lembut/
       semangat) + interaksi elusan dengan hitungan tersimpan.
     - Bug fatal diperbaiki: snapshot notifikasi service-worker kini
       disegarkan setiap kali tugas berubah (dulu hanya saat halaman
       dimuat), flag notifikasi tidak lagi bocor antar profil keluarga,
       XP tidak bisa di-farm lewat centang-batal-centang, konfirmasi
       hapus tidak lagi muncul dua kali, XSS lewat nama profil ditutup.
     - Chip timer fokus "hantu" yang tampil permanen dihilangkan;
       hover kartu yang mati oleh animasi masuk diperbaiki.
     - Responsif: safe-area notch (kiri/kanan/atas), tombol melayang
       tidak lagi menutupi sidebar di desktop, kontras teks kecil
       dinaikkan (WCAG), indikator fokus keyboard terlihat.
     - Cache dinaikkan agar semua pengguna langsung mendapat versi ini.
   v5.3.2 "Sinkron Tema": perbaikan total bug mode terang/gelap —
     - Warna bilah status/navigasi browser kini benar-benar ikut tema
       aplikasi: 3 meta theme-color (tanpa-media, light, dark)
       disinkronkan JS ke warna tema aktif + warna per aksen.
       Dulu: mode gelap dapat bilah hijau TERANG (terbalik), dan mode
       terang saat HP gelap dapat bilah ABU-ABU bawaan Chrome.
     - Anti-kedip: tema tersimpan diterapkan SEBELUM halaman dirender
       (skrip awal di <head>) — pengguna mode gelap tidak lagi melihat
       layar terang sesaat saat membuka aplikasi.
     - Deklarasi color-scheme: scrollbar & elemen bawaan browser ikut
       tema; Chrome tidak lagi memaksa-gelapkan halaman (auto-dark).
     - Cache dinaikkan agar semua pengguna langsung mendapat versi ini.
   v5.3.1 "Makin Rapi & Gaul": perbaikan bug tata letak & bahasa —
     - Konten bawah tidak lagi ketutup tombol melayang Cici
       (padding bawah halaman dinaikkan 152 → 236px).
     - Cuplikan jurnal/teks dipotong di batas kata, bukan di tengah
       huruf; ekor huruf (g/y/p) tidak terpotong di judul linimasa
       & target (line-height dinaikkan).
     - Spasi tombol aksi tugas, strip mingguan kebiasaan, dan label
       statistik dirapikan; strip chip/tab kini pakai scroll-snap;
       gelembung Cici tidak menyentuh tepi kanan di layar sempit.
     - Seluruh dialog Cici ditulis ulang dengan bahasa lebih gaul
       (tips, reaksi, sapaan pembuka, Tur Fitur, onboarding).
     - Baru: perayaan "hari sempurna" — semua tugas hari ini selesai
       memicu confetti + sapaan spesial dari Cici.
     Cache dinaikkan agar semua pengguna langsung mendapat versi ini.
   v5.3 "Gaul & Rapi": bahasa Cici lebih santai/gaul, chip timer
     tidak lagi menggantung saat sesi tak pernah dijalankan, pil
     instal presisi di tengah, tombol aksi tugas selalu jelas di
     layar sentuh, label format tanggal rapi di layar kecil, dan
     warna bilah status ikut mode gelap.
   v5.2.1 "Rapi": perbaikan bug tata letak & teks — judul halaman
     tidak lagi tergencet tombol aksi, judul tugas/target/linimasa
     tampil utuh (2 baris), baris Pengaturan rapi di layar kecil,
     tombol instal tidak menabrak chip timer.
   v5.2 "Lite Engine": notifikasi di luar web diperkuat —
     - SW dibangunkan di banyak jalur: activate, message
       (GD_SYNC dari halaman saat aplikasi ditutup/disembunyikan),
       Background Sync "gd-overdue-sync", dan periodicsync.
     - Satu daftar "sudah dikirim" (IndexedDB "sent") dipakai bersama
       halaman & SW -> tidak ada notifikasi dobel.
     - "sent" hanya disimpan SETELAH notifikasi benar-benar tampil.
   v5.1: notificationclick + periodic sync, perbaikan bug Tur,
         kerapian teks, penringan performa.
   v5 "Fresh Glass": tampilan kaca + maskot Cici, XP & level,
     confetti, Ctrl+K, 5 aksen warna, perbaikan total bug v4.
   ============================================================ */
const CACHE = "greenday-v5.5.0";
const CORE = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png", "./pengumuman.json"];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(a => cache.add(a)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("greenday-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
    /* v5.2: cek tugas terlambat begitu SW aktif (mis. setelah update) */
    try { await gdOverdueSync(); } catch (err) {}
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!/^https?:/.test(url.protocol)) return;

  /* 1) Navigasi halaman: jaringan dulu, offline pakai cache */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match("./index.html");
        return cached || new Response("Offline", { status: 503 });
      }
    })());
    return;
  }

  /* 2) pengumuman.json: selalu coba jaringan (data segar), gagal -> cache */
  if (url.pathname.endsWith("pengumuman.json")) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || new Response(JSON.stringify({ meta: { app: "greenday", type: "announcements", total: 0, aktif: 0 }, items: [] }), { headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  /* 3) Aset lain: cache dulu, lalu perbarui di latar belakang */
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const refresh = fetch(req).then(res => {
      if (res && res.ok) {
        caches.open(CACHE).then(c => c.put(req, res.clone()));
      }
      return res;
    }).catch(() => undefined);
    return cached || (await refresh) || new Response("Offline", { status: 503 });
  }));
});

/* ============================================================
   NOTIFIKASI DI LUAR WEB (v5.2)
   - notificationclick: menyalakan/memfokuskan GreenDay
   - Jalur wake: activate, message GD_SYNC (halaman ditutup/
     disembunyikan), sync "gd-overdue-sync", periodicsync
     "gd-overdue" (PWA terpasang; tetap mengecek walau aplikasi
     benar-benar ditutup)
   ============================================================ */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if ("focus" in c) { c.focus(); return; }
    }
    try { await clients.openWindow("./"); } catch (err) {}
  })());
});

function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open("greenday-push", 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore("kv"); } catch (e) {} };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function idbGet(db, key) {
  return new Promise((res) => {
    try {
      const r = db.transaction("kv", "readonly").objectStore("kv").get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(undefined);
    } catch (e) { res(undefined); }
  });
}
function idbPut(db, key, val) {
  return new Promise((res) => {
    try {
      const t = db.transaction("kv", "readwrite");
      t.objectStore("kv").put(val, key);
      t.oncomplete = () => res(true);
      t.onerror = () => res(false);
    } catch (e) { res(false); }
  });
}

async function gdOverdueSync() {
  try {
    if (self.Notification && self.Notification.permission === "denied") return;
    const db = await idbOpen();
    const snap = await idbGet(db, "tasks");
    if (!snap || !Array.isArray(snap.items)) return;
    const sent = (await idbGet(db, "sent")) || {};
    const now = Date.now();
    const list = [];
    for (const t of snap.items) {
      if (!t || t.done || !t.date || !t.time) continue;
      const due = new Date(t.date + "T" + String(t.time).slice(0, 5) + ":00");
      if (isNaN(due.getTime())) continue;
      const menit = (now - due.getTime()) / 60000;
      if (menit < 1 || menit > 20160) continue; /* 1 menit .. 14 hari */
      const key = t.id + "|" + t.date + "|" + t.time;
      if (sent[key]) continue;
      sent[key] = now;
      list.push(t);
    }
    if (!list.length) return;
    const banyak = list.length > 1;
    let tampil = false;
    try {
      await self.registration.showNotification(
        banyak ? "Ada " + list.length + " tugas terlambat" : "Tugas terlambat: " + list[0].title,
        {
          body: banyak
            ? list.slice(0, 3).map(t => t.title).join(" · ") + (list.length > 3 ? " +" + (list.length - 3) + " lainnya" : "")
            : "Sudah lewat jadwal dan belum selesai. Ketuk untuk membuka GreenDay.",
          icon: "icon-192.png",
          badge: "icon-192.png",
          tag: "gd-overdue-batch",
          data: { page: "tasks" }
        }
      );
      tampil = true;
    } catch (err) { /* izin belum ada / ditolak: jangan tandai terkirim */ }
    /* "sent" hanya disimpan kalau notifikasi benar-benar tampil —
       kalau gagal, dicoba lagi di wake berikutnya (tidak hilang). */
    if (tampil) await idbPut(db, "sent", sent);
  } catch (e) { /* diam saja: best-effort */ }
}

/* Wake 1: halaman menyuruh SW memeriksa (aplikasi ditutup/disembunyikan) */
self.addEventListener("message", (e) => {
  try {
    if (e.data && e.data.type === "GD_SYNC") e.waitUntil(gdOverdueSync());
  } catch (err) {}
});

/* Wake 2: Background Sync (terpicu saat online, mis. setelah aplikasi ditutup) */
self.addEventListener("sync", (e) => {
  if (e.tag === "gd-overdue-sync") e.waitUntil(gdOverdueSync());
});

/* Wake 3: Periodic Background Sync — PWA terpasang di Chrome/Android;
   tetap mengecek walau aplikasi benar-benar ditutup. */
self.addEventListener("periodicsync", (e) => {
  if (e.tag !== "gd-overdue") return;
  e.waitUntil(gdOverdueSync());
});
