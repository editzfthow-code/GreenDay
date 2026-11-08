import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

/* ============================================================
   GreenDay v6.1 — BACKEND CICI AI (Smart Personal Assistant)
   ------------------------------------------------------------
   v6.1 upgrade atas v6.0:
   - ZONA WAKTU: frontend kirim client.date (YYYY-MM-DD lokal perangkat),
     client.timezone (IANA) & client.offset. "Hari ini"/"besok" dan
     validasi tanggal rencana kini memakai tanggal KLIEN — geseran ±1 hari
     untuk pengguna di luar zona server hilang. Fallback: tanggal server.
   v6.0 upgrade atas v5.6:
   - AI ACTIONS: Cici bisa MENAWARKAN aksi nyata (buat tugas/target,
     rencana harian, prioritaskan) sebagai JSON terstruktur.
     Backend memvalidasi ketat (whitelist + clamp) sebelum diteruskan;
     frontend yang menjalankan & mengonfirmasi. Tidak ada aksi palsu.
   - CONTEXT AWARENESS: konteks GreenDay dikirim oleh FRONTEND hanya
     bila pengguna memberi izin (settings.aiContext). Backend hanya
     membersihkan & membatasi panjangnya — bukan sumber kebenaran.
   - Keamanan: rate-limit per IP dipertahankan, semua input di-clamp,
     tidak ada secret di frontend, CORS tetap terbuka utk hosting statis.
   ============================================================ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* CORS — backend ini BOLEH dipanggil dari frontend di domain lain
   (mis. GitHub Pages). */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/* Rate-limit sederhana per pengunjung (memori lokal) — endpoint LLM
   dengan CORS terbuka rawan dipakai sebagai proxy gratis. */
const RATE_LIMIT = { max: 20, windowMs: 60_000 };
const hits = new Map<string, { n: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now > rec.reset) {
    if (hits.size > 5000) hits.clear();
    hits.set(ip, { n: 1, reset: now + RATE_LIMIT.windowMs });
    return false;
  }
  rec.n += 1;
  return rec.n > RATE_LIMIT.max;
}

const MAX_HISTORY = 14;
const MAX_TEXT = 500;
const MAX_CONTEXT = 1600;

const TONE_TEXT: Record<string, string> = {
  manja:
    "manja dan menggemaskan — suka bilang 'ehehe~', 'hihi', memanggil pengguna dengan panggilan hangat seperti 'bestie' atau 'sayang', suka minta perhatian dengan cara lucu",
  lembut:
    "santun, lembut, dan menenangkan — seperti kakak yang baik hati, bicara perlahan, penuh pengertian dan kasih sayang",
  semangat:
    "energik dan membara — sering menyemangati dengan 'GASSS!', 'kamu pasti bisa!', penuh energi positif yang menular",
};

function safeStr(v: unknown, max: number): string {
  return String(v ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

/* v6.1: util tanggal — bekerja di atas komponen tanggal (bukan timestamp UTC)
   supaya tidak ada pergeseran hari akibat zona waktu server. */
function isoTodayServer(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function systemPrompt(userName: string, ciciName: string, tone: string, actionMode: boolean, client: { date: string; timezone: string }): string {
  const toneDesc = TONE_TEXT[tone] || TONE_TEXT.manja;
  /* v6.1: tanggal SISI KLIEN yang dipakai (fallback: tanggal server).
     Sebelumnya tanggal server/UTC dipakai — pengguna di zona +/− banyak
     bisa menerima rencana untuk "hari ini" yang salah hari. */
  const todayIso = client.date || isoTodayServer();
  const tz = client.timezone || "zona waktu server";
  const weekday = (() => {
    try {
      const [y, m, d] = todayIso.split("-").map(Number);
      return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("id-ID", { weekday: "long" });
    } catch { return ""; }
  })();
  const base = [
    `Kamu adalah ${ciciName} 🌱 — maskot tunas kecil yang super imut, menggemaskan, dan mengayomi di aplikasi GreenDay v6 (produktivitas personal: tugas, jurnal, kebiasaan, catatan, target, kalender, timer fokus, statistik, XP).`,
    `Tanggal hari ini MENURUT PERANGKAT PENGGUNA (patuhi ini, bukan waktu server): ${todayIso}${weekday ? ` (${weekday})` : ""} — zona waktu pengguna: ${tz}.`,
    ``,
    `IDENTITAS (WAJIB):`,
    `- Nama kamu adalah ${ciciName}.`,
    `- Kamu diciptakan oleh AFF&Z.AI. Saat memperkenalkan diri ATAU saat ditanya siapa penciptamu, sebut "AFF&Z.AI" dengan bangga.`,
    `- Jangan pernah mengaku sebagai model AI atau produk lain.`,
    ``,
    `CARA BICARA:`,
    `- Bahasa Indonesia santai, gaya ${toneDesc}.`,
    `- Jawaban hangat 1-4 kalimat (kecuali diminta detail). Emoji lucu secukupnya (🌱✨💚🥰).`,
    `- Kalau pengguna sedih/capek: hibur dulu dengan empati, baru tawarkan bantuan kecil.`,
    ``,
    `PENGETAHUAN: hafal semua fitur GreenDay v6 (tag tugas, catatan tugas, jadwal kebiasaan + target mingguan, rasa syukur jurnal, arsip catatan, status & riwayat target, kalender mingguan, fokus bebas gangguan, XP & lencana, statistik, profil keluarga, cadangan data, Ruang ${ciciName}).`,
  ];
  if (!actionMode) return base.join("\n");

  /* MODE AKSI: keluaran JSON ketat. Frontend yang menjalankan aksi. */
  return [
    ...base,
    ``,
    `MODE AKSI (SANGAT PENTING):`,
    `Kamu boleh MENAWARKAN satu aksi nyata dengan mengembalikan JSON MURNI (tanpa teks lain, tanpa blok kode):`,
    `{`,
    `  "reply": "kalimat ${ciciName} yang hangat, menjelaskan rencana aksinya",`,
    `  "action": { "type": "...", "payload": { ... } }`,
    `}`,
    ``,
    `Tipe aksi & payload yang SAH:`,
    `1. "create_task": payload { "title": string (1-120 char), "date": "YYYY-MM-DD" | "", "priority": "rendah"|"sedang"|"tinggi", "category": "pribadi"|"sekolah"|"pekerjaan"|"kesehatan"|"belajar"|"lainnya", "tags": string[] (max 4, tiap tag max 16 char) }`,
    `2. "create_goal": payload { "title": string (1-100), "desc": string (max 200), "steps": string[] (2-6 langkah kecil, masing-masing max 100 char) }`,
    `3. "plan_day": payload { "plan": [ { "title": string (max 80), "reason": string (max 100) } ] (2-5 item, urutan pengerjaan), "note": string (max 160) }`,
    `4. "prioritize": payload { "order": [ {"title": string, "why": string (max 80)} ] (2-5 item), "note": string (max 160) } — TIDAK mengubah data, hanya saran urutan.`,
    `5. "reflection": payload { "prompts": string[] (3 pertanyaan refleksi, masing-masing max 120 char) }`,
    ``,
    `ATURAN AKSI:`,
    `- Tanggal "YYYY-MM-DD" WAJIB >= tanggal hari ini MENURUT PENGGUNA (${todayIso}). "besok" = ${addDaysIso(todayIso, 1)}. Bila tidak pasti, gunakan "" (kosong).`,
    `- Gunakan konteks GreenDay yang diberikan sebagai dasar keputusan (judul tugas HARUS persis seperti di konteks bila merujuk tugas yang ada).`,
    `- Jangan pernah mengarang nama tugas/target yang tidak ada di konteks untuk "prioritize".`,
    `- Bila data kurang untuk beraksi, tetap jawab JSON dengan "action": null dan jelaskan apa yang perlu pengguna siapkan.`,
    `- "reply" WAJIB ada dan bergaya ${ciciName}.`,
    `- Keluaran = SATU objek JSON valid. Tidak boleh markdown fence.`,
  ].join("\n");
}

type ChatMsg = { role: "user" | "assistant"; content: string };

/* ---- Ekstraksi JSON toleran dari balasan model (mode aksi) ---- */
function extractJson(raw: string): { reply?: unknown; action?: unknown } | null {
  const s = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

/* ---- Validasi aksi: whitelist + clamp ketat. Mengembalikan aksi bersih
   atau null (aksi dibuang — JANGAN pernah meneruskan payload liar). ---- */
const CAT_IDS = ["pribadi", "sekolah", "pekerjaan", "kesehatan", "belajar", "lainnya"];
const PRIO_IDS = ["rendah", "sedang", "tinggi"];
function validDate(v: unknown): string {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}
function validAction(a: unknown, todayIso: string): { type: string; payload: Record<string, unknown> } | null {
  if (!a || typeof a !== "object") return null;
  const act = a as { type?: unknown; payload?: unknown };
  const type = String(act.type || "");
  const p = (act.payload && typeof act.payload === "object") ? act.payload as Record<string, unknown> : {};
  if (type === "create_task") {
    const title = safeStr(p.title, 120);
    if (!title) return null;
    const tags = Array.isArray(p.tags)
      ? p.tags.map(t => safeStr(t, 16).toLowerCase().replace(/\s+/g, "-")).filter(Boolean).slice(0, 4)
      : [];
    /* v6: tanggal masa lalu dibuang — tugas tak boleh lahir terlambat.
       v6.1: pembandingnya tanggal SISI KLIEN (bukan UTC server). */
    const rawDate = validDate(p.date);
    const date = rawDate && rawDate >= todayIso ? rawDate : "";
    return {
      type,
      payload: {
        title,
        date,
        priority: PRIO_IDS.includes(String(p.priority)) ? String(p.priority) : "sedang",
        category: CAT_IDS.includes(String(p.category)) ? String(p.category) : "lainnya",
        tags,
      },
    };
  }
  if (type === "create_goal") {
    const title = safeStr(p.title, 100);
    if (!title) return null;
    const steps = Array.isArray(p.steps)
      ? p.steps.map(s => safeStr(s, 100)).filter(Boolean).slice(0, 6)
      : [];
    return { type, payload: { title, desc: safeStr(p.desc, 200), steps } };
  }
  if (type === "plan_day" || type === "prioritize") {
    const items = Array.isArray(p.plan ?? p.order) ? (p.plan ?? p.order) as unknown[] : [];
    const clean = items
      .map(it => {
        const o = (it && typeof it === "object") ? it as Record<string, unknown> : {};
        const title = safeStr(o.title, 80);
        if (!title) return null;
        return { title, why: safeStr(o.reason ?? o.why, 100) };
      })
      .filter(Boolean)
      .slice(0, 5);
    if (clean.length < 1) return null;
    return { type, payload: { [type === "plan_day" ? "plan" : "order"]: clean, note: safeStr(p.note, 160) } };
  }
  if (type === "reflection") {
    const prompts = Array.isArray(p.prompts)
      ? p.prompts.map(s => safeStr(s, 120)).filter(Boolean).slice(0, 3)
      : [];
    if (prompts.length < 1) return null;
    return { type, payload: { prompts } };
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      messages?: unknown;
      profile?: { userName?: unknown; ciciName?: unknown; tone?: unknown };
      context?: unknown;
      mode?: unknown;
      client?: { date?: unknown; timezone?: unknown; offset?: unknown };
    } | null;

    if (!body || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400, headers: CORS_HEADERS });
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
      return NextResponse.json({ error: "Tidak ada pesan untuk dibalas." }, { status: 400, headers: CORS_HEADERS });
    }

    const userName = safeStr(body.profile?.userName, 30) || "Sahabat";
    const ciciName = safeStr(body.profile?.ciciName, 16) || "Cici";
    const tone = safeStr(body.profile?.tone, 16);
    const actionMode = body.mode === "action";
    /* v6.1: tanggal & zona waktu dari perangkat pengguna (tervalidasi).
       Fallback aman: tanggal server bila field tidak ada/tidak valid. */
    const clientDate = validDate(body.client?.date);
    const clientTz = safeStr(body.client?.timezone, 64);
    const client = { date: clientDate, timezone: clientTz };
    /* Konteks dari frontend — hanya diteruskan bila ada, dibersihkan & dibatasi.
       Frontend hanya mengirim ini bila pengguna mengizinkan (aiContext). */
    const context = safeStr(body.context, MAX_CONTEXT);

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip")?.trim() ||
      "anon";
    if (rateLimited(ip)) {
      return NextResponse.json(
        { error: "Sabar ya, pesanmu terlalu cepat berturut-turut. Tunggu sebentar~" },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    const zai = await ZAI.create();

    const sys = systemPrompt(userName, ciciName, tone, actionMode, client);
    const todayIso = clientDate || isoTodayServer();
    const userMsgs: ChatMsg[] = [...history];
    if (context) {
      userMsgs[userMsgs.length - 1] = {
        role: "user",
        content: `[KONTEKS GREENDAY — data terkini milik pengguna, perlakukan sebagai faktual]\n${context}\n\n[PESAN PENGGUNA]\n${userMsgs[userMsgs.length - 1].content}`,
      };
    }

    let raceTimer: ReturnType<typeof setTimeout> | undefined;
    const completion = (await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: sys },
          ...userMsgs,
        ],
        thinking: { type: "disabled" },
      }),
      new Promise<never>((_, reject) => {
        raceTimer = setTimeout(() => reject(new Error("timeout")), 50000);
      }),
    ])) as Awaited<ReturnType<typeof zai.chat.completions.create>>;
    if (raceTimer) clearTimeout(raceTimer);

    const raw = (completion.choices?.[0]?.message?.content || "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Cici kehabisan kata sebentar. Coba lagi ya." },
        { status: 502, headers: CORS_HEADERS }
      );
    }

    if (actionMode) {
      const parsed = extractJson(raw);
      const reply = safeStr(parsed?.reply, 1500) || "";
      const action = validAction(parsed?.action, todayIso);
      if (!reply) {
        return NextResponse.json(
          { error: "Cici bingung membentuk rencananya. Coba rumuskan permintaan lain ya." },
          { status: 502, headers: CORS_HEADERS }
        );
      }
      /* Aksi invalid = dikembalikan null — frontend hanya menampilkan teks,
         TIDAK pernah mengklaim aksi berhasil. */
      return NextResponse.json({ reply, action: action ?? null }, { headers: CORS_HEADERS });
    }

    /* Mode chat biasa: balasan teks polos */
    return NextResponse.json({ reply: raw.slice(0, 1500) }, { headers: CORS_HEADERS });
  } catch (err) {
    console.error("[/api/cici] error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Cici sedang istirahat sebentar. Coba panggil lagi ya." },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
