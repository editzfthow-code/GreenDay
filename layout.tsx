import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/* GreenDay v6.1 — Root layout shell.
   Aplikasi utama (SPA satu file) berada di /greenday/index.html dan
   ditampilkan lewat iframe oleh page.tsx; layout ini hanya membungkusnya.
   viewportFit=cover agar env(safe-area-inset-*) hidup di dalam iframe pada
   konteks full-bleed; themeColor disinkronkan oleh JS GreenDay sendiri. */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#4a7460",
};

export const metadata: Metadata = {
  title: "GreenDay — Daily List & Personal Productivity",
  description:
    "GreenDay v6.1: tugas bertag, jurnal syukur, kebiasaan terjadwal, catatan arsip, target, kalender, fokus bebas gangguan, statistik, XP, dan Cici — asisten AI produktivitas dari AFF&Z.AI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body style={{ margin: 0, background: "#f2f5f0" }}>{children}</body>
    </html>
  );
}
