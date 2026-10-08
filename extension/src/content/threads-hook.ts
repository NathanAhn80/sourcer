/**
 * MAIN-world hook: capture Threads GraphQL metrics + mp4 URLs,
 * force view-count relay flag on, and enrich via BarcelonaPostPageQuery.
 */
(() => {
  const VIDEO_EVENT = "sourcer-video-cache";
  const METRICS_EVENT = "sourcer-metrics-cache";
  const HOOK = "sourcer-hook-v1";
  const CONTENT = "sourcer-content-v1";
  const IG_APP_ID = "238260118697367";
  const FALLBACK_POST_DOC_IDS = [
    "6992290264212558",
    "5587632691339264",
    "25468200788865557",
  ];

  const postCache = new Map<string, Record<string, unknown>>();
  const followerCache = new Map<string, number>();
  const enrichQueued = new Set<string>();
  const enrichAttempts = new Map<string, number>();
  /** Per-code cooldown so scan loops don't re-hammer misses. */
  const enrichCooldownUntil = new Map<string, number>();
  let enrichActive = 0;
  const enrichQueue: Array<{ code: string; username: string | null; prioritize: boolean }> = [];
  /** Threads rate-limits hard — never fan out GraphQL. */
  const ENRICH_CONCURRENCY = 1;
  const ENRICH_GAP_MS = 3000;
  const ENRICH_QUEUE_MAX = 4;
  const ENRICH_MAX_ATTEMPTS = 1;
  const ENRICH_CODE_COOLDOWN_MS = 90_000;
  const GQL_BUDGET_WINDOW_MS = 60_000;
  const GQL_BUDGET_MAX = 8;
  const gqlCallTimes: number[] = [];
  let lastEnrichAt = 0;
  let rateLimitedUntil = 0;
  let rateLimitBackoffMs = 45_000;
  const DEBUG = (() => {
    try {
      return localStorage.getItem("sourcer:debug") === "1";
    } catch {
      return false;
    }
  })();
  const stats = {
    gqlHit: 0,
    gqlMiss: 0,
    gqlErr: 0,
    gql429: 0,
    htmlHit: 0,
    htmlMiss: 0,
    noLsd: 0,
    budgetSkip: 0,
  };
  (window as unknown as { __sourcerStats: typeof stats }).__sourcerStats = stats;
  function dbg(...args: unknown[]) {
    if (DEBUG) console.info("[Sourcer]", ...args);
  }

  let capturedLsd: string | null = null;
  let capturedPostDocId: string | null = null;
  let capturedRelayVars: Record<string, unknown> = {
    __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
    __relay_internal__pv__BarcelonaIsViewCountEnabledrelayprovider: true,
  };
  /** Last real GraphQL request shape — used to replay post lookups safely. */
  let lastGraphql: {
    url: string;
    headers: Record<string, string>;
    body: string;
  } | null = null;

  function asNum(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
    return null;
  }

  function post(payload: Record<string, unknown>) {
    window.postMessage({ source: HOOK, ...payload }, "*");
  }

  function shortcodeToId(code: string): string | null {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let n = 0n;
    for (const ch of code) {
      const i = alphabet.indexOf(ch);
      if (i < 0) return null;
      n = n * 64n + BigInt(i);
    }
    return n > 0n ? n.toString() : null;
  }

  /** Threads/IG ids are often "mediaId_userId" — GraphQL postID wants mediaId only. */
  function normalizePostId(raw: unknown): string | null {
    if (raw == null) return null;
    const s = String(raw);
    if (/^\d+_\d+$/.test(s)) return s.split("_")[0] ?? null;
    if (/^\d+$/.test(s)) return s;
    return null;
  }

  function forceViewCountVars(vars: Record<string, unknown>): Record<string, unknown> {
    const next = { ...vars };
    for (const key of Object.keys(next)) {
      if (/viewcount|ViewCount/i.test(key)) next[key] = true;
    }
    next.__relay_internal__pv__BarcelonaIsViewCountEnabledrelayprovider = true;
    return next;
  }

  /**
   * Flip view-count flag in-place. Do NOT re-serialize the whole body via
   * URLSearchParams — that breaks Threads feed requests (encoding/order/dtsg).
   */
  function enableViewCountInBody(body: string): string {
    let out = body
      .replace(
        /(__relay_internal__pv__BarcelonaIsViewCountEnabledrelayprovider%22%3A)(?:false|0)/g,
        "$1true",
      )
      .replace(
        /(__relay_internal__pv__BarcelonaIsViewCountEnabledrelayprovider\\?"\s*:\s*)(?:false|0)/g,
        "$1true",
      )
      .replace(
        /(BarcelonaIsViewCountEnabledrelayprovider%22%3A)(?:false|0)/g,
        "$1true",
      )
      .replace(
        /(BarcelonaIsViewCountEnabledrelayprovider\\?"\s*:\s*)(?:false|0)/g,
        "$1true",
      );

    // Inject flag into variables=… only when missing (leave other form fields untouched)
    if (!/BarcelonaIsViewCountEnabledrelayprovider/.test(out) && /(?:^|&)variables=/.test(out)) {
      try {
        const m = out.match(/(^|&)(variables=)([^&]*)/);
        if (m && m.index != null) {
          const decoded = decodeURIComponent(m[3]);
          const vars = forceViewCountVars(JSON.parse(decoded) as Record<string, unknown>);
          const encoded = encodeURIComponent(JSON.stringify(vars));
          out =
            out.slice(0, m.index) + m[1] + m[2] + encoded + out.slice(m.index + m[0].length);
        }
      } catch {
        /* ignore */
      }
    }
    return out;
  }

  function patchGraphqlBody(body: unknown): unknown {
    if (typeof body === "string") return enableViewCountInBody(body);
    if (body instanceof URLSearchParams) {
      // Mutate variables key only — keep other entries as-is
      const vars = body.get("variables");
      if (vars) {
        try {
          body.set(
            "variables",
            JSON.stringify(forceViewCountVars(JSON.parse(vars) as Record<string, unknown>)),
          );
        } catch {
          /* ignore */
        }
      }
      return body;
    }
    if (typeof FormData !== "undefined" && body instanceof FormData) {
      const vars = body.get("variables");
      if (typeof vars === "string") {
        try {
          body.set(
            "variables",
            JSON.stringify(forceViewCountVars(JSON.parse(vars) as Record<string, unknown>)),
          );
        } catch {
          /* ignore */
        }
      }
      return body;
    }
    return body;
  }

  function headersToObject(h: HeadersInit | Headers | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    if (!h) return out;
    try {
      new Headers(h).forEach((v, k) => {
        out[k] = v;
      });
    } catch {
      /* ignore */
    }
    return out;
  }

  function extractLsdFromPage(): string | null {
    if (capturedLsd) return capturedLsd;
    const html = document.documentElement?.innerHTML ?? "";
    const m =
      html.match(/"LSD",\[\],\{"token":"([^"]+)"\}/) ||
      html.match(/\["LSD",\[\],\{"token":"([^"]+)"\}/) ||
      html.match(/"lsd"\s*:\s*"([^"]+)"/) ||
      html.match(/name="lsd"[^>]*value="([^"]+)"/);
    if (m?.[1]) capturedLsd = m[1];
    return capturedLsd;
  }

  function captureAuthFromBody(body: string, friendlyName?: string | null) {
    try {
      const lsd =
        body.match(/(?:^|&)lsd=([^&]+)/)?.[1] ||
        body.match(/"lsd"\s*:\s*"([^"]+)"/)?.[1];
      if (lsd) capturedLsd = decodeURIComponent(lsd);

      const docId = body.match(/(?:^|&)doc_id=(\d+)/)?.[1];
      const varsRaw = body.match(/(?:^|&)variables=([^&]+)/)?.[1];
      if (varsRaw) {
        try {
          let decoded = varsRaw;
          try {
            decoded = decodeURIComponent(varsRaw);
          } catch {
            decoded = varsRaw;
          }
          const vars = JSON.parse(decoded) as Record<string, unknown>;
          for (const [k, v] of Object.entries(vars)) {
            if (k.includes("relayprovider")) capturedRelayVars[k] = v;
          }
          capturedRelayVars = forceViewCountVars(capturedRelayVars);
          if (
            vars.postID != null ||
            /PostPage|PostView|Permalink|Thread/i.test(friendlyName || "")
          ) {
            if (docId) capturedPostDocId = docId;
          }
        } catch {
          /* ignore */
        }
      }
      if (docId && /PostPage/i.test(friendlyName || "")) capturedPostDocId = docId;
    } catch {
      /* ignore */
    }
  }

  function emitVideos(urls: string[], postCode?: string | null) {
    const cleaned = urls
      .map((u) =>
        u
          .replace(/\\\//g, "/")
          .replace(/\\u0026/g, "&")
          .replace(/\\\u0026/g, "&"),
      )
      .filter((u) => /^https?:\/\//i.test(u) && /\.mp4(\?|$)/i.test(u));
    if (!cleaned.length) return;
    post({ kind: "videos", urls: cleaned, postCode: postCode ?? null });
    window.dispatchEvent(
      new CustomEvent(VIDEO_EVENT, {
        detail: { urls: cleaned, postCode: postCode ?? null, ts: Date.now() },
      }),
    );
  }

  function emitMetricsSnapshot() {
    const posts = Array.from(postCache.values());
    const followers = Array.from(followerCache.entries()).map(([username, count]) => ({
      username,
      count,
    }));
    if (!posts.length && !followers.length) return;
    post({ kind: "metrics", posts, followers });
    window.dispatchEvent(new CustomEvent(METRICS_EVENT, { detail: { posts, followers } }));
  }

  function mergePost(partial: Record<string, unknown>) {
    const code = typeof partial.code === "string" ? partial.code : null;
    if (!code) return;
    const prev = postCache.get(code) ?? { code };
    const next: Record<string, unknown> = { ...prev, code };
    for (const [k, v] of Object.entries(partial)) {
      if (v != null && v !== "") next[k] = v;
    }
    postCache.set(code, next);
    const username = typeof next.username === "string" ? next.username : null;
    const followers = asNum(next.followers);
    if (username && followers != null) followerCache.set(username, followers);
  }

  function harvestVideos(text: string) {
    if (!/video_versions|\.mp4/i.test(text)) return;
    const codes = Array.from(text.matchAll(/"code"\s*:\s*"([A-Za-z0-9_-]+)"/g)).map((m) => m[1]);
    const mp4s = [
      ...Array.from(text.matchAll(/https:\\\/\\\/[^"\\]+?\.mp4[^"\\]*/gi)).map((m) => m[0]),
      ...Array.from(text.matchAll(/https:\/\/[^"'\s]+?\.mp4[^"'\s]*/gi)).map((m) => m[0]),
    ];
    if (!mp4s.length) return;
    emitVideos(mp4s, codes[0] ?? null);
    for (const code of codes.slice(0, 8)) emitVideos(mp4s, code);
  }

  function walk(
    node: unknown,
    out: {
      posts: Map<string, Record<string, unknown>>;
      followers: Map<string, number>;
    },
    depth = 0,
  ) {
    if (!node || typeof node !== "object" || depth > 40) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, out, depth + 1);
      return;
    }

    const obj = node as Record<string, unknown>;
    const user = (obj.user || obj.owner) as Record<string, unknown> | undefined;
    const username =
      (typeof obj.username === "string" && obj.username) ||
      (typeof user?.username === "string" && user.username) ||
      null;

    const followerCount =
      asNum(obj.follower_count) ??
      asNum((obj.edge_followed_by as { count?: unknown } | undefined)?.count) ??
      asNum(user?.follower_count) ??
      asNum((user?.edge_followed_by as { count?: unknown } | undefined)?.count);

    if (username && followerCount != null) out.followers.set(username, followerCount);

    const code = typeof obj.code === "string" ? obj.code : null;
    const textPost = obj.text_post_app_info as Record<string, unknown> | undefined;
    const media = (obj.media || textPost?.media) as Record<string, unknown> | undefined;
    // Media ids exceed 2^53 — keep as strings, never Number()
    const pk = normalizePostId(obj.pk) ?? normalizePostId(obj.id) ?? normalizePostId(obj.post_id);

    // Image/carousel/video posts often stash counts on nested media items
    let nestedMediaViews: number | null = null;
    const carousels = [obj.carousel_media, media?.carousel_media, textPost?.carousel_media];
    for (const list of carousels) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const it = item as Record<string, unknown>;
        const v =
          asNum(it.view_counts) ??
          asNum(it.view_count) ??
          asNum(it.play_count) ??
          asNum(it.ig_play_count) ??
          asNum(it.video_view_count);
        if (v != null) nestedMediaViews = Math.max(nestedMediaViews ?? 0, v);
      }
    }

    const views =
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
      asNum(media?.view_count) ??
      asNum(media?.view_counts) ??
      asNum(media?.play_count) ??
      asNum(media?.ig_play_count) ??
      asNum(media?.video_view_count) ??
      nestedMediaViews;

    const likes = asNum(obj.like_count);
    const replies =
      asNum(obj.direct_reply_count) ??
      asNum(textPost?.direct_reply_count) ??
      asNum(obj.reply_count) ??
      asNum(obj.comment_count);
    const reposts =
      asNum(obj.repost_count) ?? asNum(textPost?.repost_count) ?? asNum(obj.reshare_count);
    const shares =
      asNum(obj.share_count) ??
      asNum(textPost?.share_count) ??
      asNum(obj.quote_count) ??
      asNum(textPost?.quote_count);
    const takenAt = asNum(obj.taken_at) ?? asNum(obj.taken_at_timestamp);

    if (code && (views != null || likes != null || followerCount != null || replies != null || pk != null)) {
      const prev = out.posts.get(code) ?? { code };
      out.posts.set(code, {
        ...prev,
        code,
        pk: pk ?? (prev.pk as number | null) ?? null,
        views: views ?? (prev.views as number | null) ?? null,
        likes: likes ?? (prev.likes as number | null) ?? null,
        replies: replies ?? (prev.replies as number | null) ?? null,
        reposts: reposts ?? (prev.reposts as number | null) ?? null,
        shares: shares ?? (prev.shares as number | null) ?? null,
        followers: followerCount ?? (prev.followers as number | null) ?? null,
        username: username ?? (prev.username as string | null) ?? null,
        takenAt: takenAt ?? (prev.takenAt as number | null) ?? null,
      });
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walk(value, out, depth + 1);
    }
  }

  function normalizePayload(text: string): string {
    let t = text.trim();
    if (t.startsWith("for (;;);")) t = t.slice("for (;;);".length);
    if (t.startsWith("while(1);")) t = t.slice("while(1);".length);
    if (t.startsWith("for(;;);")) t = t.slice("for(;;);".length);
    return t.trim();
  }

  function regexHarvest(
    text: string,
    out: {
      posts: Map<string, Record<string, unknown>>;
      followers: Map<string, number>;
    },
  ) {
    const blocks = text.split(/"code"\s*:\s*"/).slice(1);
    for (const block of blocks.slice(0, 80)) {
      const code = block.slice(0, 40).match(/^([A-Za-z0-9_-]+)"/)?.[1];
      if (!code) continue;
      const chunk = block.slice(0, 8000);
      const views =
        asNum(chunk.match(/"view_counts"\s*:\s*(\d+)/)?.[1]) ??
        asNum(chunk.match(/"view_count"\s*:\s*(\d+)/)?.[1]) ??
        asNum(chunk.match(/"impression_count"\s*:\s*(\d+)/)?.[1]) ??
        asNum(chunk.match(/"play_count"\s*:\s*(\d+)/)?.[1]);
      const likes = asNum(chunk.match(/"like_count"\s*:\s*(\d+)/)?.[1]);
      const followers = asNum(chunk.match(/"follower_count"\s*:\s*(\d+)/)?.[1]);
      const username = chunk.match(/"username"\s*:\s*"([^"]+)"/)?.[1] ?? null;
      const pk =
        chunk.match(/"pk"\s*:\s*"?(\d+)"?/)?.[1] ??
        chunk.match(/"id"\s*:\s*"(\d+)(?:_\d+)?"/)?.[1] ??
        null;
      const replies =
        asNum(chunk.match(/"direct_reply_count"\s*:\s*(\d+)/)?.[1]) ??
        asNum(chunk.match(/"reply_count"\s*:\s*(\d+)/)?.[1]);
      const reposts = asNum(chunk.match(/"repost_count"\s*:\s*(\d+)/)?.[1]);
      const shares =
        asNum(chunk.match(/"quote_count"\s*:\s*(\d+)/)?.[1]) ??
        asNum(chunk.match(/"share_count"\s*:\s*(\d+)/)?.[1]);
      const takenAt = asNum(chunk.match(/"taken_at"\s*:\s*(\d+)/)?.[1]);
      if (views != null || followers != null || likes != null || replies != null || pk != null) {
        out.posts.set(code, {
          code,
          pk,
          views,
          likes,
          replies,
          reposts,
          shares,
          followers,
          username,
          takenAt,
        });
      }
      if (username && followers != null) out.followers.set(username, followers);
    }

    for (const m of text.matchAll(
      /"username"\s*:\s*"([^"]+)"[^]{0,320}?"follower_count"\s*:\s*(\d+)|"follower_count"\s*:\s*(\d+)[^]{0,320}?"username"\s*:\s*"([^"]+)"/g,
    )) {
      const username = m[1] || m[4];
      const count = asNum(m[2] || m[3]);
      if (username && count != null) out.followers.set(username, count);
    }
  }

  function harvestMetrics(text: string) {
    if (!text || text.length < 40) return;
    const normalized = normalizePayload(text);
    if (
      !/"code"\s*:/.test(normalized) &&
      !/follower_count|view_count|text_post_app_info|view_counts/.test(normalized)
    ) {
      return;
    }

    const out = {
      posts: new Map<string, Record<string, unknown>>(),
      followers: new Map<string, number>(),
    };

    try {
      walk(JSON.parse(normalized), out);
    } catch {
      /* regex fallback */
    }
    regexHarvest(normalized, out);

    let changed = false;
    for (const p of out.posts.values()) {
      const before = JSON.stringify(postCache.get(String(p.code)) ?? null);
      mergePost(p);
      if (JSON.stringify(postCache.get(String(p.code))) !== before) changed = true;
    }
    for (const [username, count] of out.followers) {
      if (followerCache.get(username) !== count) {
        followerCache.set(username, count);
        changed = true;
      }
    }
    if (changed) emitMetricsSnapshot();
  }

  function harvest(text: string) {
    harvestVideos(text);
    harvestMetrics(text);
  }

  function clearEnrichQueue(keepPriority = false) {
    if (!keepPriority) {
      for (const job of enrichQueue) enrichQueued.delete(job.code);
      enrichQueue.length = 0;
      return;
    }
    const kept = enrichQueue.filter((j) => j.prioritize);
    const dropped = enrichQueue.filter((j) => !j.prioritize);
    for (const job of dropped) enrichQueued.delete(job.code);
    enrichQueue.length = 0;
    enrichQueue.push(...kept.slice(0, 1));
  }

  function markRateLimited(status?: number) {
    if (status === 429) stats.gql429 += 1;
    rateLimitedUntil = Date.now() + rateLimitBackoffMs;
    dbg("rate-limited", status ?? "?", `backoff ${rateLimitBackoffMs}ms — clearing queue`);
    // Stop the storm: drop pending feed enrich; keep at most one detail job
    clearEnrichQueue(true);
    rateLimitBackoffMs = Math.min(rateLimitBackoffMs * 2, 180_000);
    window.setTimeout(() => void pumpEnrich(), rateLimitedUntil - Date.now() + 50);
  }

  function gqlBudgetAvailable(): boolean {
    const now = Date.now();
    while (gqlCallTimes.length && now - gqlCallTimes[0]! > GQL_BUDGET_WINDOW_MS) {
      gqlCallTimes.shift();
    }
    return gqlCallTimes.length < GQL_BUDGET_MAX;
  }

  async function pumpEnrich() {
    while (enrichActive < ENRICH_CONCURRENCY && enrichQueue.length) {
      const waitRl = rateLimitedUntil - Date.now();
      if (waitRl > 0) {
        window.setTimeout(() => void pumpEnrich(), waitRl + 50);
        return;
      }
      if (!gqlBudgetAvailable()) {
        stats.budgetSkip += 1;
        window.setTimeout(() => void pumpEnrich(), 5000);
        return;
      }
      const gap = ENRICH_GAP_MS - (Date.now() - lastEnrichAt);
      if (gap > 0) {
        window.setTimeout(() => void pumpEnrich(), gap);
        return;
      }
      const job = enrichQueue.shift();
      if (!job) break;
      enrichActive += 1;
      lastEnrichAt = Date.now();
      void (async () => {
        try {
          await enrichOne(job.code, job.username, job.prioritize);
        } finally {
          enrichActive -= 1;
          enrichQueued.delete(job.code);
          enrichCooldownUntil.set(job.code, Date.now() + ENRICH_CODE_COOLDOWN_MS);
          void pumpEnrich();
        }
      })();
    }
  }

  function requestEnrich(code: string, username: string | null, prioritize = false) {
    if (!code || enrichQueued.has(code)) return;
    const cached = postCache.get(code);
    if (cached && asNum(cached.views) != null) return;
    const attempts = enrichAttempts.get(code) ?? 0;
    if (attempts >= ENRICH_MAX_ATTEMPTS) return;
    const cool = enrichCooldownUntil.get(code) ?? 0;
    if (!prioritize && cool > Date.now()) return;
    // While rate-limited, only accept detail (priority) lookups
    if (!prioritize && Date.now() < rateLimitedUntil) return;
    if (!prioritize && enrichQueue.length >= ENRICH_QUEUE_MAX) return;
    if (prioritize && enrichQueue.length >= ENRICH_QUEUE_MAX) {
      const dropped = enrichQueue.pop();
      if (dropped) enrichQueued.delete(dropped.code);
    }
    enrichQueued.add(code);
    const job = { code, username, prioritize };
    if (prioritize) enrichQueue.unshift(job);
    else enrichQueue.push(job);
    void pumpEnrich();
  }

  type GqlResult = "hit" | "miss" | "rate_limited" | "error";

  /** One doc_id per call — never fan out on 429. */
  async function graphqlPostQuery(postID: string, code: string, attempt: number): Promise<GqlResult> {
    const lsd = extractLsdFromPage();
    if (!lsd) {
      stats.noLsd += 1;
      return "error";
    }

    const docIds = [
      ...(capturedPostDocId ? [capturedPostDocId] : []),
      ...FALLBACK_POST_DOC_IDS,
    ].filter((v, i, a) => a.indexOf(v) === i);
    const docId = docIds[Math.min(attempt - 1, docIds.length - 1)] ?? docIds[0];
    if (!docId) return "error";

    const variables = {
      ...capturedRelayVars,
      postID: String(postID),
      __relay_internal__pv__BarcelonaIsViewCountEnabledrelayprovider: true,
      __relay_internal__pv__BarcelonaIsLoggedInrelayprovider: true,
    };

    try {
      let body: string;
      const headers: Record<string, string> = {
        "content-type": "application/x-www-form-urlencoded",
        "x-fb-friendly-name": "BarcelonaPostPageQuery",
        "x-fb-lsd": lsd,
        "x-ig-app-id": IG_APP_ID,
        "x-asbd-id": "129477",
        accept: "*/*",
      };

      if (lastGraphql?.body && /(?:^|&)variables=/.test(lastGraphql.body)) {
        body = lastGraphql.body;
        if (/(?:^|&)doc_id=\d+/.test(body)) {
          body = body.replace(/(^|&)doc_id=\d+/, `$1doc_id=${docId}`);
        } else {
          body += `&doc_id=${docId}`;
        }
        const varsEncoded = encodeURIComponent(JSON.stringify(variables));
        body = body.replace(/(^|&)(variables=)([^&]*)/, `$1$2${varsEncoded}`);
        body = body.replace(/(^|&)(lsd=)([^&]*)/, `$1$2${encodeURIComponent(lsd)}`);
        body = body.replace(
          /(^|&)(fb_api_req_friendly_name=)([^&]*)/,
          "$1$2BarcelonaPostPageQuery",
        );
        body = enableViewCountInBody(body);
        Object.assign(headers, lastGraphql.headers);
        headers["x-fb-friendly-name"] = "BarcelonaPostPageQuery";
        headers["x-fb-lsd"] = lsd;
        headers["content-type"] = "application/x-www-form-urlencoded";
      } else {
        body = new URLSearchParams({
          lsd,
          variables: JSON.stringify(variables),
          doc_id: docId,
          fb_api_req_friendly_name: "BarcelonaPostPageQuery",
          server_timestamps: "true",
        }).toString();
      }

      // Prefer replaying a real browser GraphQL shape; skip if not ready (avoids bad bursts)
      if (!lastGraphql?.body) {
        dbg("gql wait replay", code);
        return "miss";
      }
      const url = lastGraphql.url || new URL("/api/graphql", location.origin).toString();
      gqlCallTimes.push(Date.now());
      // origFetch: our own lookups must not be patched or overwrite lastGraphql
      const res = await origFetch(url, {
        method: "POST",
        credentials: "include",
        headers,
        body,
      });
      if (res.status === 429) {
        markRateLimited(429);
        return "rate_limited";
      }
      if (!res.ok) {
        stats.gqlErr += 1;
        dbg("gql http", res.status, code, docId);
        if (res.status === 401 || res.status === 403) markRateLimited(res.status);
        return "error";
      }
      // Success — ease backoff for next time
      rateLimitBackoffMs = 45_000;
      harvest(await res.text());
      if (asNum(postCache.get(code)?.views) != null) {
        stats.gqlHit += 1;
        return "hit";
      }
      stats.gqlMiss += 1;
      dbg("gql miss", code, docId);
      return "miss";
    } catch (e) {
      stats.gqlErr += 1;
      dbg("gql error", code, e);
      return "error";
    }
  }

  async function htmlPostQuery(code: string, username: string | null): Promise<"hit" | "miss" | "rate_limited"> {
    // Skip HTML storm while GraphQL is rate-limited
    if (Date.now() < rateLimitedUntil) return "rate_limited";
    const paths = username
      ? [`/@${encodeURIComponent(username)}/post/${code}`]
      : [`/t/${code}`];
    for (const path of paths) {
      try {
        const res = await origFetch(new URL(path, location.origin).toString(), {
          credentials: "include",
          headers: { Accept: "text/html" },
        });
        if (res.status === 429) {
          markRateLimited(429);
          return "rate_limited";
        }
        if (!res.ok) continue;
        const text = await res.text();
        harvest(text);
        if (asNum(postCache.get(code)?.views) == null) {
          const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const vm = text.match(
            new RegExp(`"code"\\s*:\\s*"${esc}"[\\s\\S]{0,8000}?"view_counts"\\s*:\\s*(\\d+)`),
          );
          if (vm?.[1]) {
            mergePost({ code, views: Number(vm[1]), username });
            emitMetricsSnapshot();
          }
        }
        if (asNum(postCache.get(code)?.views) != null) {
          stats.htmlHit += 1;
          return "hit";
        }
      } catch {
        /* next path */
      }
    }
    stats.htmlMiss += 1;
    dbg("html miss", code);
    return "miss";
  }

  async function enrichOne(code: string, username: string | null, prioritize: boolean) {
    // Wait for a real browser GraphQL capture before inventing requests
    if (!lastGraphql?.body) {
      enrichCooldownUntil.set(code, Date.now() + 4000);
      window.setTimeout(() => requestEnrich(code, username, prioritize), 4000);
      return;
    }

    const attempt = (enrichAttempts.get(code) ?? 0) + 1;
    enrichAttempts.set(code, attempt);

    // Shortcode → exact media id via BigInt (cached pk may be lossy from older parses)
    const postID = shortcodeToId(code) || normalizePostId(postCache.get(code)?.pk);

    if (postID) {
      const gql = await graphqlPostQuery(postID, code, attempt);
      if (gql === "hit") return;
      if (gql === "rate_limited") {
        // Don't burn attempt; viewport scan will ask again after cooldown
        enrichAttempts.set(code, Math.max(0, attempt - 1));
        return;
      }
    }

    // HTML fallback only for detail/priority posts (feed HTML storms cause 429 too)
    if (prioritize) {
      await htmlPostQuery(code, username);
    }
  }

  type FetchArgs = Parameters<typeof fetch>;

  async function prepareFetchArgs(args: FetchArgs): Promise<FetchArgs> {
    try {
      const input = args[0];
      const init = args[1] ? { ...args[1] } : undefined;
      const url = String(typeof input === "string" ? input : (input as Request)?.url || "");
      if (!/graphql|\/api\//i.test(url)) return args;

      const friendly =
        (init?.headers &&
          (new Headers(init.headers as HeadersInit).get("x-fb-friendly-name") ||
            new Headers(init.headers as HeadersInit).get("X-FB-Friendly-Name"))) ||
        (input instanceof Request
          ? input.headers.get("x-fb-friendly-name") || input.headers.get("X-FB-Friendly-Name")
          : null);

      if (init && init.body != null) {
        const patched = patchGraphqlBody(init.body);
        if (typeof patched === "string") {
          captureAuthFromBody(patched, friendly);
          lastGraphql = {
            url,
            headers: {
              ...headersToObject(init.headers),
              ...(input instanceof Request ? headersToObject(input.headers) : {}),
            },
            body: patched,
          };
        } else if (patched instanceof URLSearchParams) {
          const s = patched.toString();
          captureAuthFromBody(s, friendly);
          lastGraphql = { url, headers: headersToObject(init.headers), body: s };
        }
        init.body = patched as BodyInit;
        return [input, init];
      }

      if (input instanceof Request) {
        const text = await input.clone().text();
        if (text) {
          captureAuthFromBody(text, friendly);
          const patched = enableViewCountInBody(text);
          lastGraphql = {
            url,
            headers: headersToObject(input.headers),
            body: patched,
          };
          if (patched !== text) {
            return [new Request(input, { body: patched, method: input.method }), init];
          }
        }
      }
    } catch {
      /* ignore */
    }
    return args;
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: FetchArgs) => {
    const prepared = await prepareFetchArgs(args);
    const res = await origFetch(...prepared);
    try {
      const url = String(
        typeof prepared[0] === "string" ? prepared[0] : (prepared[0] as Request)?.url || "",
      );
      const ct = res.headers.get("content-type") || "";
      const interesting =
        /graphql|\/api\/|text_feed|barcelona|threads/i.test(url) ||
        /json|javascript|text|html/i.test(ct);
      if (interesting) {
        const clone = res.clone();
        clone.text().then(harvest).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: unknown[]) {
    (this as XMLHttpRequest & { __sourcerUrl?: string }).__sourcerUrl = String(url);
    return origOpen.apply(this, [method, url, ...rest] as never);
  };
  XMLHttpRequest.prototype.send = function (...args: unknown[]) {
    try {
      if (typeof args[0] === "string") {
        captureAuthFromBody(args[0]);
        args[0] = enableViewCountInBody(args[0]);
      } else if (args[0] instanceof URLSearchParams) {
        const patched = enableViewCountInBody(args[0].toString());
        captureAuthFromBody(patched);
        args[0] = patched;
      }
    } catch {
      /* ignore */
    }
    this.addEventListener("load", function () {
      try {
        if (typeof this.responseText === "string") harvest(this.responseText);
      } catch {
        /* ignore */
      }
    });
    return origSend.apply(this, args as never);
  };

  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== CONTENT) return;
    if (data.kind === "hello") {
      emitMetricsSnapshot();
      return;
    }
    if (data.kind === "reharvest") {
      boot();
      return;
    }
    if (data.kind === "enrich" && typeof data.code === "string") {
      requestEnrich(
        data.code,
        typeof data.username === "string" ? data.username : null,
        Boolean(data.prioritize),
      );
    }
  });

  const boot = () => {
    try {
      extractLsdFromPage();
      harvest(document.documentElement?.innerHTML ?? "");
      document.querySelectorAll("script").forEach((s) => {
        const t = s.textContent || "";
        if (
          t.length > 80 &&
          (t.includes("view_count") ||
            t.includes("view_counts") ||
            t.includes("follower_count") ||
            t.includes('"code"'))
        ) {
          harvest(t);
        }
      });
    } catch {
      /* ignore */
    }
  };

  if (document.documentElement) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
  window.setTimeout(boot, 800);
  window.setTimeout(boot, 2500);
  window.setTimeout(boot, 6000);
  if (DEBUG) {
    window.setInterval(() => {
      console.info("[Sourcer] stats", {
        ...stats,
        queue: enrichQueue.length,
        active: enrichActive,
        gql429: stats.gql429,
        rateLimitedForMs: Math.max(0, rateLimitedUntil - Date.now()),
        cachedPosts: postCache.size,
        withViews: Array.from(postCache.values()).filter((p) => asNum(p.views) != null).length,
        lsd: Boolean(capturedLsd),
        liveDocId: capturedPostDocId,
        replayReady: Boolean(lastGraphql),
      });
    }, 5000);
  }
  console.info("[Sourcer] MAIN hook active (0.1.21)");
})();
