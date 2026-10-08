import { listenHookMessages } from "./bridge";

export type PostMetrics = {
  code: string;
  views?: number | null;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  shares?: number | null;
  followers?: number | null;
  username?: string | null;
  takenAt?: number | null;
};

const byCode = new Map<string, PostMetrics>();
const followersByUser = new Map<string, number>();
const listeners = new Set<() => void>();

export function rememberPostMetrics(partial: PostMetrics) {
  if (!partial.code) return;
  const prev = byCode.get(partial.code) ?? { code: partial.code };
  const next: PostMetrics = {
    ...prev,
    ...Object.fromEntries(
      Object.entries(partial).filter(([, v]) => v != null && v !== ""),
    ),
    code: partial.code,
  };
  const changed = JSON.stringify(prev) !== JSON.stringify(next);
  byCode.set(partial.code, next);
  if (next.username && next.followers != null) {
    followersByUser.set(next.username.toLowerCase(), next.followers);
  }
  if (changed) for (const fn of listeners) fn();
}

export function rememberFollowers(username: string, count: number) {
  if (!username || !Number.isFinite(count)) return;
  const key = username.toLowerCase();
  if (followersByUser.get(key) === count) return;
  followersByUser.set(key, count);
  for (const fn of listeners) fn();
}

export function metricsForCode(code: string | null | undefined): PostMetrics | null {
  if (!code) return null;
  return byCode.get(code) ?? null;
}

export function followersForUser(username: string | null | undefined): number | null {
  if (!username) return null;
  return followersByUser.get(username.toLowerCase()) ?? null;
}

export function onMetricsUpdated(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function listenForMetricsCache() {
  // postMessage bridge from MAIN-world hook
  listenHookMessages((data) => {
    if (data.kind !== "metrics") return;
    for (const p of (data.posts as PostMetrics[]) ?? []) rememberPostMetrics(p);
    for (const f of data.followers ?? []) rememberFollowers(f.username, f.count);
  });

  // legacy CustomEvent (may not cross worlds)
  window.addEventListener("sourcer-metrics-cache", ((ev: CustomEvent) => {
    const detail = ev.detail as {
      posts?: PostMetrics[];
      followers?: { username: string; count: number }[];
    };
    for (const p of detail.posts ?? []) rememberPostMetrics(p);
    for (const f of detail.followers ?? []) rememberFollowers(f.username, f.count);
  }) as EventListener);
}
