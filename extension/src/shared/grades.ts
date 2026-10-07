export type Grade = "약함" | "보통" | "우수" | "강력" | "폭발";

/** Threads-scale multiples (views/followers often >> 10). */
export function gradeFromMultiple(multiple: number | null | undefined): Grade | null {
  if (multiple == null || !Number.isFinite(multiple)) return null;
  if (multiple >= 50) return "폭발";
  if (multiple >= 20) return "강력";
  if (multiple >= 5) return "우수";
  if (multiple >= 1) return "보통";
  return "약함";
}

/** Xiaohongshu-scale multiples (likes / typical likes). */
export function gradeFromMultipleXhs(multiple: number | null | undefined): Grade | null {
  if (multiple == null || !Number.isFinite(multiple)) return null;
  if (multiple >= 10) return "폭발";
  if (multiple >= 5) return "강력";
  if (multiple >= 2) return "우수";
  if (multiple >= 1) return "보통";
  return "약함";
}

export function computePerformanceMultiple(opts: {
  views?: number | null;
  likes?: number | null;
  followers?: number | null;
  avgLikes?: number | null;
}): number | null {
  const { views, likes, followers, avgLikes } = opts;
  if (views != null && followers != null && followers > 0) {
    return Math.round((views / followers) * 10) / 10;
  }
  if (likes != null && avgLikes != null && avgLikes > 0) {
    return Math.round((likes / avgLikes) * 10) / 10;
  }
  if (likes != null && followers != null && followers > 0) {
    return Math.round((likes / followers) * 10) / 10;
  }
  return null;
}

export function engagementRate(opts: {
  views?: number | null;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
}): number | null {
  const views = opts.views;
  if (views == null || views <= 0) return null;
  const eng = (opts.likes ?? 0) + (opts.replies ?? 0) + (opts.reposts ?? 0);
  return Math.round((eng / views) * 1000) / 10;
}

export function spreadScore(views: number | null | undefined): number | null {
  if (views == null || views <= 0) return null;
  return Math.round(Math.log10(views) * 10) / 10;
}

export function formatCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1_000) return n.toLocaleString("en-US");
  return String(Math.round(n));
}

export function parseCount(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const s = raw.replace(/,/g, "").trim().toLowerCase();
  const m = s.match(/([\d.]+)\s*([kmb만천억万萬]?)/i);
  if (!m) {
    const digits = s.replace(/[^\d]/g, "");
    return digits ? Number(digits) : null;
  }
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  const unit = m[2];
  if (unit === "k") return Math.round(num * 1_000);
  if (unit === "m") return Math.round(num * 1_000_000);
  if (unit === "b") return Math.round(num * 1_000_000_000);
  if (unit === "만" || unit === "万" || unit === "萬") return Math.round(num * 10_000);
  if (unit === "천") return Math.round(num * 1_000);
  if (unit === "억") return Math.round(num * 100_000_000);
  return Math.round(num);
}

const STOP = new Set([
  "the", "and", "for", "with", "this", "that", "from", "your", "have", "just",
  "이", "그", "저", "것", "수", "등", "및", "더", "또", "좀", "진짜", "너무", "오늘",
  "的", "了", "是", "我", "你", "在", "和", "就", "都", "也",
]);

/** Lightweight keyword chips from caption text. */
export function extractKeywords(caption: string, limit = 6): string[] {
  const parts = caption
    .replace(/https?:\/\/\S+/g, " ")
    .split(/[\s,./|!?？！。、·•#@\[\]()（）「」『』"'“”‘’…~]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && t.length <= 16 && !STOP.has(t.toLowerCase()) && !/^\d+$/.test(t));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
