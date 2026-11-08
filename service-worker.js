/* ============================================================
   GreenDay — Service Worker v6.1.0 "Calm Grove"
   v6.1: cache dinaikkan ke greenday-v6.1.0 agar semua pengguna langsung
   mendapat v6.1 (cache lama dihapus otomatis saat activate) + font Google
   (CSS & berkas woff2) dihangatkan saat install agar tampilan offline
   tidak berubah. Logika strategi cache tidak berubah.
   v6.0 upgrade atas v5.6/v5.7:
     - Cache dinaikkan ke greenday-v6.0.0 agar semua pengguna langsung
       mendapat versi baru (cache lama dihapus otomatis saat activate).
     - Handler message GD_SKIP_WAITING: halaman memicu aktivasi segera
       setelah pengguna menyetujui pembaruan (notifikasi v6).
     - Strategi cache lama dipertahankan: navigasi = network-first
       (anti racun cache), pengumuman = network-first, aset =
       stale-while-revalidate. Notifikasi tugas terlambat tetap hidup
       via IndexedDB + Background/Periodic Sync.
   ============================================================ */
const CACHE = "greenday-v6.2.0";
/* Riwayat perbaikan versi lama (v5.0–v5.7) dipertahankan di README. */
const CORE = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png", "./pengumuman.json"];
/* v6.1: font Google dihangatkan saat install (runtime stale-while-revalidate
   sudah meng-cache-nya setelah pemakaian pertama; pemanasan ini memastikan
   kunjungan offline PERTAMA pun sudah menampilkan font yang sama). Gagal
   memuat font tidak boleh menggagalkan install — makanya allSettled. */
const FONTS = [
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(CORE.map(a => cache.add(a)));
    /* v6.1: hangatkan CSS font; berkas .woff2 mengikutinya otomatis lewat
       strategi aset (stale-while-revalidate) saat halaman pertama memakai. */
    try {
      const cssRes = await fetch(FONTS[0], { cache: "no-store" });
      if (cssRes && cssRes.ok) {
        await cache.put(FONTS[0], cssRes.clone());
        const css = await cssRes.text();
        const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map(m => m[1]);
        await Promise.allSettled(urls.map(u => cache.add(u)));
      }
    } catch (err) { /* offline saat install: font menyusul di kunjungan online */ }
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
        /* v5.6: hanya index.html yang VALID yang boleh mengisi kunci
           fallback — dulu membuka admin/404 ikut menimpa cache offline */
        if (fresh && fresh.ok && new URL(req.url).pathname.endsWith("index.html")) {
          const cache = await caches.open(CACHE);
          cache.put("./index.html", fresh.clone());
        }
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
        /* v5.6: hanya respons valid yang di-cache */
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
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
    /* v5.6: hormati halaman tujuan dari data.page — dulu semua notifikasi
       selalu membuka beranda meski isinya soal tugas */
    const page = (e.notification && e.notification.data && e.notification.data.page) || "";
    const target = "./index.html" + (page ? "#" + page : "");
    const list = await clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if ("focus" in c) {
        try { if (c.navigate) await c.navigate(target); } catch (err2) {}
        c.focus();
        return;
      }
    }
    try { await clients.openWindow(target); } catch (err) {}
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

/* Wake 1: halaman menyuruh SW memeriksa (aplikasi ditutup/disembunyikan)
   + v6.0: perintah aktivasi segera dari tombol "Muat ulang" pembaruan */
self.addEventListener("message", (e) => {
  try {
    if (!e.data) return;
    if (e.data.type === "GD_SYNC") e.waitUntil(gdOverdueSync());
    else if (e.data.type === "GD_SKIP_WAITING" && self.skipWaiting) e.waitUntil(self.skipWaiting());
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
