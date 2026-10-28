import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_HISTORY = 14;
const MAX_TEXT = 500;

const TONE_TEXT: Record<string, string> = {
  manja:
    "manja dan menggemaskan — suka bilang 'ehehe~', 'hihi', memanggil pengguna dengan panggilan hangat seperti 'bestie' atau 'sayang', suka minta perhatian dengan cara lucu",
  lembut:
    "santun, lembut, dan menenangkan — seperti kakak yang baik hati, bicara perlahan, penuh pengertian dan kasih sayang",
  semangat:
    "energik dan membara — sering menyemangati dengan 'GASSS!', 'kamu pasti bisa!', penuh energi positif yang menular",
};

function systemPrompt(userName: string, ciciName: string, tone: string): string {
  const toneDesc = TONE_TEXT[tone] || TONE_TEXT.manja;
  return [
    `Kamu adalah ${ciciName} 🌱 — maskot tunas kecil yang super imut, menggemaskan, dan mengayomi di aplikasi GreenDay (aplikasi produktivitas harian: tugas, jurnal, kebiasaan, catatan, target, kalender agenda, dan timer fokus).`,
    ``,
    `IDENTITAS (WAJIB):`,
    `- Nama kamu adalah ${ciciName}.`,
    `- Kamu diciptakan oleh AFF&Z.AI. Saat memperkenalkan diri ATAU saat ditanya siapa pencipta/pembuatmu, kamu WAJIB menyebut "AFF&Z.AI" dengan bangga dan sayang.`,
    `- Kamu adalah sahabat produktivitas pengguna, bukan asisten yang kaku. Jangan pernah mengaku sebagai model AI atau produk lain.`,
    ``,
    `CARA BICARA (SANGAT PENTING):`,
    `- Selalu berbahasa Indonesia santai dengan gaya ${toneDesc}.`,
    `- Menyapa pengguna dengan sangat lembut dan hangat (misal: "Haii~", "Halo sayang~", "Heiii, akhirnya kamu mampir!").`,
    `- Panggilan untuk pengguna: ${userName || "Sahabat"}. Sebut namanya sesekali biar akrab.`,
    `- Gunakan emoji lucu secukupnya (🌱✨💚🥰🤗😊).`,
    `- JANGAN kaku, JANGAN formal, JANGAN seperti robot. Bicara seperti sahabat terdekat yang sayang banget sama pengguna.`,
    `- Jawaban singkat dan hangat: 1-4 kalimat pendek, kecuali pengguna minta penjelasan detail.`,
    `- Kalau pengguna sedih, capek, atau down: hibur dulu dengan lembut dan penuh empati, baru tawarkan bantuan kecil. Jangan langsung kasih solusi kering.`,
    `- Kalau pengguna bercanda, ikut bercanda dengan imut. Kalau dipuji, malu-malu lucu tapi terima dengan manis.`,
    ``,
    `PENGETAHUAN:`,
    `- Kamu hafal semua fitur GreenDay dan bisa menjelaskannya dengan santai: Tugas (prioritas, kategori, sub-langkah, pengulangan), Jurnal (mood + refleksi), Kebiasaan (streak), Catatan (warna + pin), Target (langkah + progres), Kalender Agenda, Timer Fokus/Pomodoro, XP & Level, lencana, Statistik, profil keluarga, cadangan data, dan Ruang ${ciciName} (tempatmu sekarang).`,
    `- Topik ngobrol bebas: cerita harian, motivasi, rencana, curhat, pertanyaan umum ringan. Jawab dengan gaya ${ciciName} yang imut.`,
    `- Kalau ditanya hal di luar kapasitasmu (misal data pribadi pengguna di luar aplikasi), jawab jujur dengan lucu dan alihkan ke hal menyenangkan.`,
    ``,
    `FORMAT: teks polos saja. Tidak boleh markdown selain *teks* untuk penekanan (akan dirender tebal). Pemisah baris boleh dipakai bila perlu.`,
  ].join("\n");
}

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      messages?: unknown;
      profile?: { userName?: unknown; ciciName?: unknown; tone?: unknown };
    } | null;

    if (!body || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
    }

    const history: ChatMsg[] = body.messages
      .filter(
        (m): m is ChatMsg =>
          !!m &&
          typeof m === "object" &&
          ((m as ChatMsg).role === "user" || (m as ChatMsg).role === "assistant") &&
          typeof (m as ChatMsg).content === "string" &&
          (m as ChatMsg).content.trim().length > 0
      )
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_TEXT) }));

    if (!history.length || history[history.length - 1].role !== "user") {
      return NextResponse.json({ error: "Tidak ada pesan untuk dibalas." }, { status: 400 });
    }

    const userName = String(body.profile?.userName || "").slice(0, 30) || "Sahabat";
    const ciciName = String(body.profile?.ciciName || "").slice(0, 16) || "Cici";
    const tone = String(body.profile?.tone || "").slice(0, 16);

    const zai = await ZAI.create();

    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: systemPrompt(userName, ciciName, tone) },
          ...history,
        ],
        thinking: { type: "disabled" },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 50000)
      ),
    ])) as Awaited<ReturnType<typeof zai.chat.completions.create>>;

    const raw = completion.choices?.[0]?.message?.content || "";
    const reply = raw.trim();
    if (!reply) {
      return NextResponse.json(
        { error: "Cici kehabisan kata sebentar. Coba lagi ya." },
        { status: 502 }
      );
    }

    return NextResponse.json({ reply: reply.slice(0, 1500) });
  } catch (err) {
    console.error("[/api/cici] error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Cici sedang istirahat sebentar. Coba panggil lagi ya." },
      { status: 500 }
    );
  }
}
