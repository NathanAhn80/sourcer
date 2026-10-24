import { mountDownloadButtons, removeDownloadButtons, showToast } from "../shared/overlay";
import {
  findMp4NearElement,
  listenForVideoCache,
  recentVideos,
  rememberVideos,
  videosForPost,
} from "../shared/videoCache";

listenForVideoCache();

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


function enhanceCard(card: HTMLElement) {
  const detailId = pagePostId();
  const link =
    (detailId &&
      card.querySelector<HTMLAnchorElement>(
        `a[href*="/post/${detailId}"], a[href*="/t/${detailId}"]`,
      )) ||
    findPostLink(card);
  const externalId = extractPostId(link?.getAttribute("href") ?? null) ?? detailId;
  if (!externalId || !link) return;

  const media = extractMedia(card, externalId);
  const videoCount =
    media.videos.length || media.hasVideoEl || recentVideos(1).length
      ? Math.max(media.videos.length, 1)
      : 0;

  mountDownloadButtons(card, {
    videoCount: media.hasVideoEl || media.videos.length ? videoCount : 0,
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
      const fresh = extractMedia(card, externalId).images;
      if (!fresh.length) {
        showToast("사진이 없습니다");
        return;
      }
      await downloadUrls(fresh, `threads-${externalId}-img`);
      showToast(`사진 ${fresh.length}장 다운로드 시작`);
    },
  });
}

let scanTimer = 0;
let lastPath = location.pathname;

function scan() {
  const detailId = pagePostId();
  let cards = candidateCards();
  if (detailId) {
    // Post detail: only the opened root post (reply stacks cause clutter)
    cards = cards.filter((c) => c.id === detailId);
  } else {
    cards = cards.filter((c) => isNearViewport(c.card));
  }
  removeDownloadButtons(new Set(cards.map((c) => c.card)));
  for (const { card } of cards) enhanceCard(card);
}

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = 0;
    scan();
  }, 150);
}

new MutationObserver(() => {
  lastPath = location.pathname;
  scheduleScan();
}).observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("popstate", scheduleScan);

scan();
window.setTimeout(scan, 1000);
console.info("[Sourcer] Threads download helper active on", location.host);
