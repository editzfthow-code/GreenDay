import type { Viewport } from "next";

/* v5.6: viewport-fit=cover agar env(safe-area-inset-*) hidup di dalam iframe
   pada konteks full-bleed, + tema warna bilah status mengikuti GreenDay */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#0d7148",
};

export default function Home() {
  return (
    <iframe
      src="/greenday/index.html"
      title="GreenDay — Daily List & Personal Productivity"
      allow="notifications; clipboard-write"
      className="fixed inset-0 h-full w-full border-0 bg-background"
    />
  );
}
