import { SpeedInsights } from '@vercel/speed-insights/next';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'GreenDay — Daily List & Personal Productivity',
  description: 'GreenDay v5: tugas, jurnal, kebiasaan, kalender, catatan, target, timer fokus, XP & lencana, Pusat Notifikasi, dan Cici — pendamping imut produktivitasmu.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
