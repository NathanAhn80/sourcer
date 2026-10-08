export type Grade = "약함" | "보통" | "우수" | "강력" | "폭발";

/** Threads: 약함 <1 · 보통 1~3 · 우수 3~10 · 강력 10~30 · 폭발 ≥30 */
export function gradeFromMultiple(multiple: number | null | undefined): Grade | null {
  if (multiple == null || !Number.isFinite(multiple)) return null;
  if (multiple >= 30) return "폭발";
  if (multiple >= 10) return "강력";
  if (multiple >= 3) return "우수";
  if (multiple >= 1) return "보통";
  return "약함";
}

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
