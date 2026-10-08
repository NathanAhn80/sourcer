import { rememberFollowers, rememberPostMetrics } from "./metricsCache";

function asNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function viewsFrom(obj: Record<string, unknown>): number | null {
  const textPost = obj.text_post_app_info as Record<string, unknown> | undefined;
  const media = (obj.media || textPost?.media) as Record<string, unknown> | undefined;
  let nested: number | null = null;
  for (const list of [obj.carousel_media, media?.carousel_media]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const v =
        asNum(it.view_counts) ??
        asNum(it.view_count) ??
        asNum(it.play_count) ??
        asNum(it.ig_play_count);
      if (v != null) nested = Math.max(nested ?? 0, v);
    }
  }
  return (
    asNum(obj.view_counts) ??
    asNum(obj.view_count) ??
    asNum(obj.play_count) ??
    asNum(obj.ig_play_count) ??
    asNum(obj.video_view_count) ??
    asNum(obj.organic_view_count) ??
    asNum(obj.impression_count) ??
    asNum(textPost?.view_counts) ??
    asNum(textPost?.view_count) ??
    asNum(textPost?.impression_count) ??
    asNum(media?.view_counts) ??
    asNum(media?.view_count) ??
    asNum(media?.play_count) ??
    nested
  );
}

function walkFiber(fiber: unknown, seen: Set<unknown>, hits: number) {
  if (!fiber || typeof fiber !== "object" || seen.has(fiber) || hits > 80) return hits;
  seen.add(fiber);
  const f = fiber as Record<string, unknown>;
  const props = (f.memoizedProps || f.pendingProps || f) as Record<string, unknown>;
  hits = absorb(props, hits);
  if (hits > 80) return hits;
  for (const key of ["child", "sibling", "return", "stateNode", "alternate"]) {
    hits = walkFiber(f[key], seen, hits);
    if (hits > 80) return hits;
  }
  return hits;
}

function absorb(obj: unknown, hits: number): number {
  if (!obj || typeof obj !== "object" || hits > 80) return hits;
  if (Array.isArray(obj)) {
    for (const item of obj) hits = absorb(item, hits);
    return hits;
  }
  const rec = obj as Record<string, unknown>;
  const code = typeof rec.code === "string" ? rec.code : null;
  const user = (rec.user || rec.owner) as Record<string, unknown> | undefined;
  const username =
    (typeof rec.username === "string" && rec.username) ||
    (typeof user?.username === "string" && user.username) ||
    null;
  const followers =
    asNum(rec.follower_count) ??
    asNum((rec.edge_followed_by as { count?: unknown } | undefined)?.count) ??
    asNum(user?.follower_count) ??
    asNum((user?.edge_followed_by as { count?: unknown } | undefined)?.count);
  const views = viewsFrom(rec);
  const textPost = rec.text_post_app_info as Record<string, unknown> | undefined;

  if (username && followers != null) {
    rememberFollowers(username, followers);
    hits += 1;
  }
  if (code && (views != null || followers != null || asNum(rec.like_count) != null)) {
    rememberPostMetrics({
      code,
      views,
      likes: asNum(rec.like_count),
      replies:
        asNum(rec.direct_reply_count) ??
        asNum(textPost?.direct_reply_count) ??
        asNum(rec.reply_count),
      reposts: asNum(rec.repost_count) ?? asNum(textPost?.repost_count) ?? asNum(rec.reshare_count),
      shares: asNum(rec.share_count) ?? asNum(textPost?.quote_count) ?? asNum(rec.quote_count),
      followers,
      username,
      takenAt: asNum(rec.taken_at) ?? asNum(rec.taken_at_timestamp),
    });
    hits += 1;
  }

  // Shallow dive common media containers
  for (const key of ["media", "post", "thread_items", "items", "node", "data", "edges"]) {
    if (rec[key]) hits = absorb(rec[key], hits);
  }
  return hits;
}

/** Scrape React fiber props from a post card for view_counts / follower_count. */
export function scrapeCardFiber(card: Element): void {
  const seen = new Set<unknown>();
  let hits = 0;
  const nodes = [card, ...Array.from(card.querySelectorAll("a, div, time")).slice(0, 40)];
  for (const el of nodes) {
    for (const key of Object.keys(el)) {
      if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactInternalInstance$")) continue;
      try {
        hits = walkFiber((el as unknown as Record<string, unknown>)[key], seen, hits);
      } catch {
        /* ignore */
      }
      if (hits > 80) return;
    }
  }
}
