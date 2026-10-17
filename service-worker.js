/* ============================================================
   GreenDay — Service Worker v8b (v8 + deteksi server via /api/ping)
   v8: cache baru "greenday-v8" untuk Mode Jarak Jauh — sahabat
   beda HP lewat GreenDay Online. Pembaruan penting: semua /api/*
   TIDAK pernah di-cache (selalu ke jaringan) agar data sahabat,
   kado, dan sapaan selalu segar; sisanya tetap siap offline.
   ============================================================ */
const CACHE = "greenday-v8b";
const CORE = ["./", "./index.html", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png"];

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
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!/^https?:/.test(url.protocol)) return;

  /* 0) v8: API GreenDay Online — SELALU jaringan, jangan pernah cache.
        (Saat offline panggilan ini memang gagal — aplikasi menanganinya.) */
  if (url.origin === location.origin && url.pathname.indexOf("/api/") === 0) return;

  /* 1) Navigasi halaman: jaringan dulu, offline pakai cache */
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  /* 2) PENGUMUMAN: jaringan dulu (konten terbaru), offline pakai terakhir diketahui */
  if (url.origin === location.origin && url.pathname.endsWith("/pengumuman.json")) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  /* 3) Sumber luar (font Google): simpan saat online, pakai saat offline */
  if (url.origin !== location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const fresh = await fetch(req);
        if (fresh && (fresh.ok || fresh.type === "opaque")) cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        return hit || Response.error();
      }
    })());
    return;
  }

  /* 4) Aset lokal: pakai cache, perbarui di belakang layar */
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) {
      fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); }).catch(() => {});
      return hit;
    }
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return Response.error();
    }
  })());
});
