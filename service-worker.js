/* ============================================================
   GreenDay — Service Worker v5.1
   v5.1: notifikasi di luar web (notificationclick + periodic sync),
         perbaikan bug Tur, kerapian teks, dan penringan performa.
   v5 "Fresh Glass": tampilan kaca + maskot Cici, sistem XP &
   level, confetti, command palette (Ctrl+K), 5 aksen warna,
   dan perbaikan total bug v4.
   ============================================================ */
const CACHE = "greenday-v5.1";
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
   NOTIFIKASI DI LUAR WEB (v5.1)
   - notificationclick: menyalakan/memfokuskan GreenDay
   - periodicsync "gd-overdue": cek tugas terlambat dari snapshot
     IndexedDB walau aplikasi ditutup (PWA terinstal, best-effort)
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
    if (list.length) await idbPut(db, "sent", sent);
    if (!list.length) return;
    const banyak = list.length > 1;
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
  } catch (e) { /* diam saja: best-effort */ }
}

self.addEventListener("periodicsync", (e) => {
  if (e.tag !== "gd-overdue") return;
  e.waitUntil(gdOverdueSync());
});
