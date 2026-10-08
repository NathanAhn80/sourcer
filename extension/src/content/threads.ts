import { collectItem } from "../shared/api";
import {
  computePerformanceMultiple,
  engagementRate,
  extractKeywords,
  formatCompact,
  gradeDescription,
  gradeFromMultiple,
  parseCount,
  spreadScore,
} from "../shared/grades";
import { mountThreadsOverlay, pruneThreadsOverlays, showToast } from "../shared/overlay";
import {
  findMp4NearElement,
  listenForVideoCache,
  recentVideos,
  rememberVideos,
  videosForPost,
} from "../shared/videoCache";
import {
  followersForUser,
  listenForMetricsCache,
  metricsForCode,
  onMetricsUpdated,
  rememberPostMetrics,
} from "../shared/metricsCache";
import { scrapeCardFiber } from "../shared/fiberScrape";
import { helloHook, postToHook, requestEnrich } from "../shared/bridge";

const KEY_ATTR = "data-sourcer-key";
/** HypeDuck parity: home feed checks up to 50 posts per session. */
const HOME_FEED_LIMIT = 50;

listenForVideoCache();
listenForMetricsCache();
helloHook();
window.setTimeout(helloHook, 500);
window.setTimeout(helloHook, 2000);

function downloadUrls(urls: string[], prefix: string) {
  return new Promise<{ ok: boolean; count?: number }>((resolve) => {
    chrome.runtime.sendMessage({ type: "DOWNLOAD_URLS", urls, prefix }, (res) => {
      resolve({ ok: Boolean(res?.ok), count: res?.count });
    });
  });
}

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function downloadBlobOrHttpVideos(urls: string[], prefix: string): Promise<boolean> {
  const httpUrls = urls.filter((u) => /^https?:\/\//i.test(u));
  if (httpUrls.length) {
    const res = await downloadUrls(httpUrls, prefix);
    if (res.ok) return true;
  }

  for (const url of urls) {
    if (!url.startsWith("blob:") && !/^https?:\/\//i.test(url)) continue;
    try {
      const resp = await fetch(url);
      if (!resp.ok) continue;
      const buf = await resp.arrayBuffer();
      // Guard oversized payloads for extension messaging (~40MB)
      if (buf.byteLength > 40 * 1024 * 1024) {
        showToast("영상이 너무 커서 blob 저장 실패 — 재생 후 다시 시도");
        continue;
      }
      const base64 = await arrayBufferToBase64(buf);
      const mime = resp.headers.get("content-type") || "video/mp4";
      const ok = await new Promise<boolean>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "DOWNLOAD_DATA",
            base64,
            mime,
            filename: `sourcer/${prefix}.mp4`,
          },
          (res) => resolve(Boolean(res?.ok)),
        );
      });
      if (ok) return true;
    } catch (e) {
      console.warn("[Sourcer] video fetch failed", url, e);
    }
  }
  return false;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast("복사됨");
  } catch {
    showToast("복사 실패");
  }
}

function extractPostId(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, location.origin);
    const m = u.pathname.match(/\/(?:t|post)\/([A-Za-z0-9_-]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function findPostLink(root: Element): HTMLAnchorElement | null {
  const anchors = Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"], a[href*="/t/"]'),
  );
  return anchors.find((a) => extractPostId(a.getAttribute("href"))) ?? null;
}

function extractHandle(root: Element): string | null {
  // Prefer author from /@user/post/CODE (communities also use /@… links)
  for (const a of Array.from(
    root.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"], a[href*="/t/"]'),
  )) {
    const href = a.getAttribute("href") || "";
    const m = href.match(/\/@([^/?#]+)\/(?:post|t)\//) || href.match(/^\/@([^/?#]+)\//);
    if (m && extractPostId(href)) return decodeURIComponent(m[1]);
  }
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'))) {
    const href = a.getAttribute("href") || "";
    // Skip obvious non-profile paths
    if (/\/(post|t)\//.test(href)) {
      const m = href.match(/^\/@([^/?#]+)/);
      if (m) return decodeURIComponent(m[1]);
      continue;
    }
    const m = href.match(/^\/@([^/?#]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

function extractCaption(root: Element): string {
  const longest = Array.from(root.querySelectorAll("div, span"))
    .map((el) => el.textContent?.trim() ?? "")
    .filter((t) => t.length >= 8 && t.length <= 1200)
    .filter((t) => !/^(Follow|Following|좋아요|답글|Log in)/i.test(t))
    .sort((a, b) => b.length - a.length)[0];
  return longest || "";
}

function extractMedia(root: Element, postCode?: string | null) {
  const images: string[] = [];
  const videos: string[] = [];

  root.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:")) return;
    if (src.includes("profile") || (img.naturalWidth > 0 && img.naturalWidth < 48)) return;
    // Skip obvious video posters counted as images when a video exists nearby
    images.push(src);
  });

  root.querySelectorAll("video").forEach((video) => {
    const src = video.currentSrc || video.src || video.querySelector("source")?.src || "";
    if (src) videos.push(src);
    // Some builds stash URL on dataset
    for (const attr of Array.from(video.attributes)) {
      if (/^https?:\/\/.+\.mp4/i.test(attr.value)) videos.push(attr.value);
    }
  });

  for (const mp4 of findMp4NearElement(root)) videos.push(mp4);
  for (const mp4 of videosForPost(postCode)) videos.push(mp4);

  // Prefer https mp4 over blob when both exist
  const httpsMp4 = videos.filter((u) => /^https?:\/\//i.test(u) && /\.mp4/i.test(u));
  const blobs = videos.filter((u) => u.startsWith("blob:"));
  const ordered = [...new Set([...httpsMp4, ...blobs, ...videos])];

  if (httpsMp4.length) rememberVideos(httpsMp4, postCode);

  // Detect video post even if URL not yet resolved (poster-only)
  const hasVideoEl = root.querySelector("video") != null;

  return {
    images: Array.from(new Set(images)),
    videos: ordered,
    hasVideoEl,
  };
}

async function resolveVideosForCard(card: HTMLElement, postCode: string): Promise<string[]> {
  let media = extractMedia(card, postCode);
  if (media.videos.some((u) => /^https?:\/\//i.test(u) && /\.mp4/i.test(u))) {
    return media.videos;
  }

  // Try playing briefly to materialize blob/src
  const video = card.querySelector("video");
  if (video) {
    try {
      video.muted = true;
      const p = video.play();
      if (p) await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 800))]);
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      /* autoplay blocked */
    }
  }

  media = extractMedia(card, postCode);
  if (media.videos.length) return media.videos;

  // Last resort: most recent network-captured mp4s
  return recentVideos(3);
}

function buttonCount(root: Element, labels: RegExp): number | null {
  for (const el of Array.from(root.querySelectorAll("div[role='button'], button, a"))) {
    const label = `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`;
    if (!labels.test(label)) continue;
    const m = label.match(labels);
    const n = parseCount(m?.[1] ?? label.replace(labels, "").trim());
    if (n != null) return n;
  }
  return null;
}

function extractMetrics(root: Element, postCode?: string | null, handle?: string | null) {
  const text = root.textContent ?? "";
  const aria = Array.from(root.querySelectorAll("[aria-label]"))
    .map((el) => el.getAttribute("aria-label") ?? "")
    .join(" ");
  const blob = `${text}\n${aria}`;
  const cached = metricsForCode(postCode);

  const views =
    cached?.views ??
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:views?|조회)/i)?.[1]) ??
    parseCount(blob.match(/(?:views?|조회)\s*([\d.,]+[kmb만천]?)/i)?.[1]);

  const likes =
    cached?.likes ??
    buttonCount(root, /(?:like|좋아요)\s*([\d.,]+[kmb만천KMB]?)/i) ??
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:likes?|좋아요)/i)?.[1]) ??
    parseCount(blob.match(/(?:likes?|좋아요)\s*([\d.,]+[kmb만천]?)/i)?.[1]);

  const replies =
    cached?.replies ??
    buttonCount(root, /(?:comment|reply|replies|답글|댓글)\s*([\d.,]+[kmb만천KMB]?)/i) ??
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:replies?|답글|댓글)/i)?.[1]) ??
    parseCount(blob.match(/(?:replies?|답글|댓글)\s*([\d.,]+[kmb만천]?)/i)?.[1]);

  const reposts =
    cached?.reposts ??
    buttonCount(root, /(?:repost|리포스트)\s*([\d.,]+[kmb만천KMB]?)/i) ??
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:reposts?|리포스트)/i)?.[1]) ??
    null;

  const shares =
    cached?.shares ??
    buttonCount(root, /(?:share|공유|보내기)\s*([\d.,]+[kmb만천KMB]?)/i) ??
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:shares?|공유)/i)?.[1]) ??
    null;

  const followers =
    cached?.followers ??
    followersForUser(handle) ??
    followersForUser(cached?.username) ??
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:followers?|팔로워)/i)?.[1]) ??
    null;

  const timeEl = root.querySelector("time");
  let velocity: number | null = null;
  if (views != null) {
    let ts: number | null = null;
    if (timeEl?.dateTime) ts = Date.parse(timeEl.dateTime);
    else if (cached?.takenAt) ts = cached.takenAt * (cached.takenAt < 1e12 ? 1000 : 1);
    if (ts != null && Number.isFinite(ts)) {
      const hours = Math.max((Date.now() - ts) / 3_600_000, 1 / 60);
      velocity = Math.round(views / hours);
    }
  }

  return { views, likes, replies, reposts, shares, followers, velocity };
}

/** Post detail URL: /@user/post/CODE or /t/CODE */
function pagePostId(): string | null {
  return extractPostId(location.pathname) ?? extractPostId(location.href);
}

function pageUsername(): string | null {
  const m = location.pathname.match(/^\/@([^/?#]+)/);
  return m?.[1] ?? null;
}

function isTimestampPermalink(a: HTMLAnchorElement): boolean {
  if (a.querySelector("time")) return true;
  const href = a.getAttribute("href") || "";
  if (!/\/(?:post|t)\//.test(href)) return false;
  // time as sibling under same parent (common on For You feed)
  const parent = a.parentElement;
  if (parent?.querySelector("time")) return true;
  if (a.closest("time")) return true;
  return false;
}

function postIdsIn(el: Element, timestampOnly: boolean): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  el.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"], a[href*="/t/"]').forEach((a) => {
    if (timestampOnly && !isTimestampPermalink(a)) return;
    const id = extractPostId(a.getAttribute("href"));
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
}

function hasEngagementControls(el: Element): boolean {
  if (
    el.querySelector(
      '[aria-label*="Like"], [aria-label*="like"], [aria-label*="좋아요"], [aria-label*="Reply"], [aria-label*="답글"], [aria-label*="Comment"], [aria-label*="Repost"], [aria-label*="리포스트"], [aria-label*="Share"], [aria-label*="공유"]',
    )
  ) {
    return true;
  }
  // Feed often uses icon-only rows without matching Korean word boundaries
  const buttons = el.querySelectorAll('[role="button"], button');
  if (buttons.length >= 3 && /Like|좋아요|Reply|답글|Repost|리포스트/i.test(el.textContent ?? "")) {
    return true;
  }
  return /Like|좋아요|Reply|Replies|답글|Comment|댓글|Repost|리포스트/i.test(el.textContent ?? "");
}

function cardFromPostLink(a: HTMLAnchorElement, opts?: { detail?: boolean }): HTMLElement | null {
  const myId = extractPostId(a.getAttribute("href"));
  if (!myId) return null;
  const detail = Boolean(opts?.detail);

  let el: HTMLElement | null = a.parentElement;
  let fallback: HTMLElement | null = null;

  while (el && el !== document.body) {
    const r = el.getBoundingClientRect();
    const tallEnough = r.height >= 90 && r.width >= 180;
    if (tallEnough && hasEngagementControls(el)) {
      const stampIds = postIdsIn(el, true);
      const allIds = postIdsIn(el, false);

      // Best: only this post's timestamp permalink
      if (stampIds.length === 1 && stampIds[0] === myId) return el;
      // Feed: only this post id in the block
      if (!detail && allIds.length === 1 && allIds[0] === myId) return el;
      // Detail: first timestamp is this post, modest height
      if (detail && stampIds[0] === myId && r.height < 1100) return el;
      // Feed fallback: first post link is mine and block isn't a whole column
      if (!detail && allIds[0] === myId && r.height < 1400) {
        if (!fallback) fallback = el;
      }
    }

    if (
      !fallback &&
      (el.getAttribute("data-pressable-container") === "true" ||
        el.getAttribute("role") === "article" ||
        el.tagName === "ARTICLE")
    ) {
      const allIds = postIdsIn(el, false);
      if (allIds.length === 1 && allIds[0] === myId) fallback = el;
    }
    el = el.parentElement;
  }
  return fallback;
}

/** Detail pages show "조회 25만회" in the chrome — map it to the URL post. */
function absorbDetailHeaderViews() {
  const id = pagePostId();
  if (!id) return;
  if (metricsForCode(id)?.views != null) return;

  // Prefer header-ish nodes; fall back to body text near top
  const headerBits = Array.from(
    document.querySelectorAll("header, [role='banner'], h1, h2"),
  )
    .map((el) => el.textContent ?? "")
    .join("\n");
  const blob = `${headerBits}\n${document.body?.innerText?.slice(0, 2500) ?? ""}`;
  const m =
    blob.match(/조회\s*([\d.,]+[kmb만천KMB]?)\s*회/) ||
    blob.match(/([\d.,]+[kmb만천KMB]?)\s*회\s*조회/) ||
    blob.match(/([\d.,]+[kmb만천KMB]?)\s*views?/i);
  const views = m ? parseCount(m[1]) : null;
  if (views == null) return;
  rememberPostMetrics({
    code: id,
    views,
    username: pageUsername(),
    followers: followersForUser(pageUsername()),
  });
}

function candidateCards(): Array<{ card: HTMLElement; id: string }> {
  const byId = new Map<string, HTMLElement>();
  const detailId = pagePostId();
  const onDetail = Boolean(detailId);

  const allLinks = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/"], a[href*="/t/"]'),
  ).filter((a) => extractPostId(a.getAttribute("href")));

  // Detail: prefer timestamp permalinks. Feed: use all /post/ links (For You often has no <time> in <a>).
  let anchors = onDetail ? allLinks.filter(isTimestampPermalink) : allLinks;
  if (!anchors.length) anchors = allLinks;

  // Prefer /@user/post/CODE over bare /t/ when both exist
  anchors.sort((a, b) => {
    const ap = (a.getAttribute("href") || "").includes("/post/") ? 0 : 1;
    const bp = (b.getAttribute("href") || "").includes("/post/") ? 0 : 1;
    const at = isTimestampPermalink(a) ? 0 : 1;
    const bt = isTimestampPermalink(b) ? 0 : 1;
    return at - bt || ap - bp;
  });

  for (const a of anchors) {
    const id = extractPostId(a.getAttribute("href"));
    if (!id) continue;
    const host = cardFromPostLink(a, { detail: onDetail });
    if (!host) continue;
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, host);
      continue;
    }
    const prevArea = prev.offsetWidth * prev.offsetHeight;
    const nextArea = host.offsetWidth * host.offsetHeight;
    if (nextArea > 0 && nextArea < prevArea) byId.set(id, host);
  }

  // Guarantee the opened post has a card even if reply tree confused detection
  if (detailId && !byId.has(detailId)) {
    const link =
      document.querySelector<HTMLAnchorElement>(
        `a[href*="/post/${detailId}"] time, a[href*="/t/${detailId}"] time`,
      )?.closest("a") ??
      document.querySelector<HTMLAnchorElement>(
        `a[href*="/post/${detailId}"], a[href*="/t/${detailId}"]`,
      );
    if (link instanceof HTMLAnchorElement) {
      const host = cardFromPostLink(link, { detail: true });
      if (host) byId.set(detailId, host);
      else {
        let el: HTMLElement | null = link.parentElement;
        while (el && el !== document.body) {
          if (el.offsetHeight >= 140 && el.offsetWidth >= 220 && hasEngagementControls(el)) {
            byId.set(detailId, el);
            break;
          }
          el = el.parentElement;
        }
      }
    }
  }

  return Array.from(byId, ([id, card]) => ({ id, card }));
}

function isInViewport(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < window.innerHeight && r.height >= 80;
}

/** Include tall media posts that only partially intersect the screen. */
function isNearViewport(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  const pad = window.innerHeight * 1.25;
  return r.bottom > -pad && r.top < window.innerHeight + pad && r.height >= 60;
}

function cardHasMedia(el: HTMLElement) {
  return Boolean(el.querySelector("img:not([src*='profile']), video"));
}

async function enhanceCard(card: HTMLElement) {
  const detailId = pagePostId();
  const link =
    (detailId &&
      card.querySelector<HTMLAnchorElement>(
        `a[href*="/post/${detailId}"], a[href*="/t/${detailId}"]`,
      )) ||
    findPostLink(card);
  const externalId = extractPostId(link?.getAttribute("href") ?? null) ?? detailId;
  if (!externalId || !link) return;

  const authorHandle = extractHandle(card) || (externalId === detailId ? pageUsername() : null);
  // Scrape React fiber on the card (works in isolated world; doesn't need MAIN bridge)
  scrapeCardFiber(card);
  const metrics = extractMetrics(card, externalId, authorHandle);
  // Views often omitted in feed — enrich only in-viewport (followers come from fiber/DOM)
  if (metrics.views == null && (externalId === detailId || isInViewport(card))) {
    requestEnrich(externalId, authorHandle, externalId === detailId);
  }
  const signature = [
    externalId,
    metrics.views ?? "",
    metrics.followers ?? "",
    metrics.likes ?? "",
    metrics.replies ?? "",
    metrics.reposts ?? "",
    metrics.shares ?? "",
  ].join("|");
  if (card.getAttribute(KEY_ATTR) === signature) return;
  card.setAttribute(KEY_ATTR, signature);

  const multiple = computePerformanceMultiple({
    views: metrics.views,
    likes: metrics.likes,
    followers: metrics.followers,
  });
  const grade = gradeFromMultiple(multiple);
  const rate = engagementRate(metrics);
  const spread = spreadScore(metrics);
  const gradeTip =
    metrics.views != null && metrics.followers != null && metrics.followers > 0
      ? `성과배수 = 조회 ÷ 팔로워\n${formatCompact(metrics.views)} ÷ ${formatCompact(metrics.followers)} = ${multiple ?? "—"}배\n${gradeDescription(grade)}`
      : gradeDescription(grade);
  const engagementTip =
    metrics.views != null
      ? `참여율 = (좋아요+댓글+리포스트+공유) ÷ 조회\n(${metrics.likes ?? 0}+${metrics.replies ?? 0}+${metrics.reposts ?? 0}+${metrics.shares ?? 0}) ÷ ${formatCompact(metrics.views)} = ${rate ?? "—"}%`
      : undefined;
  const spreadTip =
    metrics.views != null
      ? `확산 = (리포스트+공유) ÷ 조회 × 1000\n(${metrics.reposts ?? 0}+${metrics.shares ?? 0}) ÷ ${formatCompact(metrics.views)} × 1000 = ${spread ?? "—"}`
      : undefined;
  // Skip heavy caption/keyword work on metric-only refreshes
  const media = extractMedia(card, externalId);
  const caption = card.getAttribute("data-sourcer-caption") || extractCaption(card);
  card.setAttribute("data-sourcer-caption", caption.slice(0, 500));
  const keywords: string[] = [];
  const url = new URL(link.getAttribute("href")!, location.origin).toString();
  const videoCountHint =
    media.videos.length || media.hasVideoEl || recentVideos(1).length ? Math.max(media.videos.length, 1) : 0;

  const doCollect = async () => {
    const vids = await resolveVideosForCard(card, externalId);
    const result = await collectItem({
      platform: "threads",
      externalId,
      url,
      authorHandle,
      caption,
      thumbnailUrl: media.images[0] ?? vids[0] ?? null,
      mediaUrls: [...vids, ...media.images],
      views: metrics.views,
      likes: metrics.likes,
      replies: metrics.replies,
      reposts: metrics.reposts,
      followers: metrics.followers,
      metrics: {
        velocity: metrics.velocity,
        engagementRate: rate,
        spread,
        keywords,
      },
    });
    showToast(result.message);
  };

  mountThreadsOverlay(
    card,
    {
      grade,
      multiple,
      views: metrics.views,
      followers: metrics.followers,
      engagementRate: rate,
      velocity: metrics.velocity,
      spread,
      tips: {
        grade: gradeTip || undefined,
        multiple: gradeTip || undefined,
        engagement: engagementTip,
        spread: spreadTip,
      },
    },
    keywords,
    {
      videoCount: videoCountHint,
      photoCount: media.images.length,
      onDownloadVideo: async () => {
        showToast("영상 URL 찾는 중…");
        const vids = await resolveVideosForCard(card, externalId);
        if (!vids.length) {
          showToast("영상 URL을 못 찾았습니다. 영상을 한번 재생한 뒤 다시 눌러보세요");
          return;
        }
        const ok = await downloadBlobOrHttpVideos(vids, `threads-${externalId}-video`);
        showToast(ok ? "영상 다운로드 시작" : "영상 다운로드 실패");
      },
      onDownloadPhotos: async () => {
        if (!media.images.length) {
          showToast("사진이 없습니다");
          return;
        }
        await downloadUrls(media.images, `threads-${externalId}-img`);
        showToast(`사진 ${media.images.length}장 다운로드 시작`);
      },
      onCopyLink: () => copyText(url),
      onCopyText: () => copyText(caption || url),
      onCollect: doCollect,
      onExportCsv: async () => {
        const row = [
          url,
          authorHandle ?? "",
          caption.replaceAll('"', '""'),
          metrics.views ?? "",
          metrics.likes ?? "",
          metrics.followers ?? "",
          multiple ?? "",
          grade ?? "",
        ]
          .map((v) => `"${v}"`)
          .join(",");
        const csv = `url,author,caption,views,likes,followers,multiple,grade\n${row}`;
        const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`;
        await downloadUrls([dataUrl], `threads-${externalId}-meta`);
        showToast("CSV 저장 시작");
      },
    },
    { showKeywords: false, postId: externalId },
  );
}

let scanTimer = 0;
let metricsTimer = 0;
let lastPath = location.pathname;
let detailBootstrappedFor = "";
/** Home-feed post codes seen this session (max HOME_FEED_LIMIT). */
const homeFeedTracked = new Map<string, string | null>();
let homeFeedLimitToastShown = false;

function isHomeFeedPath(): boolean {
  if (pagePostId()) return false;
  const p = location.pathname.replace(/\/+$/, "") || "/";
  if (p === "/") return true;
  if (/^\/(for[_-]?you|following|home)$/i.test(p)) return true;
  // Not profile/search/post/settings
  if (p.startsWith("/@") || p.startsWith("/search") || p.startsWith("/t/")) return false;
  if (p.includes("/post/")) return false;
  return p.split("/").filter(Boolean).length <= 1;
}

function trackHomeFeedCards(cards: Array<{ card: HTMLElement; id: string }>) {
  const visible = cards.filter((c) => isInViewport(c.card));
  const rest = cards.filter((c) => !isInViewport(c.card));
  for (const { card, id } of [...visible, ...rest]) {
    if (homeFeedTracked.has(id)) continue;
    if (homeFeedTracked.size >= HOME_FEED_LIMIT) break;
    homeFeedTracked.set(id, extractHandle(card));
  }
  if (homeFeedTracked.size >= HOME_FEED_LIMIT && !homeFeedLimitToastShown) {
    homeFeedLimitToastShown = true;
    showToast(`홈 피드 ${HOME_FEED_LIMIT}개까지 확인 (HypeDuck과 동일)`);
  }
}

function scan() {
  absorbDetailHeaderViews();
  const detailId = pagePostId();
  let cards = candidateCards();

  // Post detail: ONLY the opened root post (reply stacks cause left-margin piles)
  if (detailId) {
    const root = cards.find((c) => c.id === detailId);
    cards = root ? [root] : [];
    if (detailBootstrappedFor !== location.pathname) {
      detailBootstrappedFor = location.pathname;
      postToHook({ kind: "reharvest" });
      requestEnrich(detailId, pageUsername(), true);
    }
  } else if (isHomeFeedPath()) {
    // HypeDuck: confirm up to 50 posts on home feed as you scroll
    trackHomeFeedCards(cards);
    // Mount overlays for near-viewport cards (tall image/video posts often only partially on screen)
    const mountable = cards.filter((c) => homeFeedTracked.has(c.id) && isNearViewport(c.card));
    const extras = cards.filter(
      (c) =>
        !homeFeedTracked.has(c.id) &&
        isNearViewport(c.card) &&
        homeFeedTracked.size < HOME_FEED_LIMIT,
    );
    for (const c of extras) homeFeedTracked.set(c.id, extractHandle(c.card));
    cards = [...mountable, ...extras.filter((c) => homeFeedTracked.has(c.id))];
    // Extra enrich pass: at most a few in-viewport posts missing views
    const enrichOrder = [...homeFeedTracked.entries()]
      .map(([id, username]) => {
        const el = cards.find((c) => c.id === id)?.card;
        return { id, username, el };
      })
      .filter((x) => x.el && isInViewport(x.el))
      .slice(0, 3);
    for (const { id, username } of enrichOrder) {
      const m = metricsForCode(id);
      if (m?.views != null) continue;
      requestEnrich(id, username, false);
    }
  } else {
    // Profile / other feeds: visible cards, soft cap 50
    cards = cards.filter((c) => isInViewport(c.card)).slice(0, HOME_FEED_LIMIT);
  }

  pruneThreadsOverlays(new Set(cards.map((c) => c.id)));

  const ordered = detailId
    ? [
        ...cards.filter((c) => c.id === detailId),
        ...cards.filter((c) => c.id !== detailId && isInViewport(c.card)),
        ...cards.filter((c) => c.id !== detailId && !isInViewport(c.card)),
      ]
    : [
        ...cards.filter((c) => isInViewport(c.card)),
        ...cards.filter((c) => !isInViewport(c.card)),
      ];
  for (const { card } of ordered) {
    void enhanceCard(card);
  }
}

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    scan();
  }, 100);
}

/** Metrics cache updates should repaint badges ASAP (don't wait on DOM mutations). */
function scheduleMetricsRefresh() {
  if (metricsTimer) return;
  metricsTimer = window.setTimeout(() => {
    metricsTimer = 0;
    scan();
  }, 32);
}

function onSpaNavigate() {
  if (location.pathname === lastPath) return;
  lastPath = location.pathname;
  pruneThreadsOverlays(new Set());
  // New home-feed session when leaving a post back to /
  if (isHomeFeedPath()) {
    /* keep homeFeedTracked across post↔home so the 50 budget persists */
  } else if (pagePostId()) {
    /* detail: keep tracked */
  } else {
    homeFeedTracked.clear();
    homeFeedLimitToastShown = false;
  }
  helloHook();
  scheduleScan();
}

const observer = new MutationObserver(() => {
  onSpaNavigate();
  scheduleScan();
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", onSpaNavigate);
const origPush = history.pushState.bind(history);
const origReplace = history.replaceState.bind(history);
history.pushState = (...args) => {
  origPush(...args);
  onSpaNavigate();
};
history.replaceState = (...args) => {
  origReplace(...args);
  onSpaNavigate();
};

onMetricsUpdated(() => scheduleMetricsRefresh());
scan();
// Pull cache + kick enrich right after load (no scroll required)
window.setTimeout(() => {
  helloHook();
  scan();
}, 300);
window.setTimeout(scan, 1000);
console.info("[Sourcer] Threads content script active on", location.host);
