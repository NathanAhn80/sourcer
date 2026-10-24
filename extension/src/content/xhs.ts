import { mountDownloadButtons, removeDownloadButtons, showToast } from "../shared/overlay";


function downloadUrls(urls: string[], prefix: string) {
  return new Promise<{ ok: boolean }>((resolve) => {
    chrome.runtime.sendMessage({ type: "DOWNLOAD_URLS", urls, prefix }, (res) => {
      resolve({ ok: Boolean(res?.ok) });
    });
  });
}

function extractNoteId(href: string | null): string | null {
  if (!href) return null;
  try {
    const u = new URL(href, location.origin);
    const m =
      u.pathname.match(/\/explore\/([a-zA-Z0-9]+)/) ||
      u.pathname.match(/\/discovery\/item\/([a-zA-Z0-9]+)/) ||
      u.pathname.match(/\/search_result\/([a-zA-Z0-9]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function findNoteLink(root: Element): HTMLAnchorElement | null {
  const anchors = Array.from(
    root.querySelectorAll<HTMLAnchorElement>(
      'a[href*="/explore/"], a[href*="/discovery/item/"], a[href*="/search_result/"]',
    ),
  );
  return anchors.find((a) => extractNoteId(a.getAttribute("href"))) ?? null;
}

function extractMedia(root: Element) {
  const urls = new Set<string>();
  let hasVideo = false;
  root.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src || img.getAttribute("data-src");
    if (!src || src.startsWith("data:")) return;
    if (src.includes("avatar") || (img.width > 0 && img.width < 40)) return;
    urls.add(src);
  });
  root.querySelectorAll("video").forEach((video) => {
    hasVideo = true;
    const src = video.currentSrc || video.src || video.querySelector("source")?.src;
    if (src) urls.add(src);
  });
  if (root.querySelector('[class*="play"], .play-icon, svg')) {
    // play affordance often means video cover
    hasVideo = hasVideo || Boolean(root.querySelector(".play-icon, [class*='play-icon']"));
  }
  return { mediaUrls: Array.from(urls), hasVideo };
}

function candidateCards(): HTMLElement[] {
  const set = new Set<HTMLElement>();
  document.querySelectorAll("section.note-item, .note-item, .cover").forEach((el) => {
    const host =
      (el.closest("section.note-item, .note-item") as HTMLElement | null) ||
      (el instanceof HTMLElement && findNoteLink(el) ? el : null);
    if (host) set.add(host);
  });
  if (set.size === 0) {
    document.querySelectorAll('a[href*="/explore/"]').forEach((a) => {
      const host = a.closest("section, .note-item, div") as HTMLElement | null;
      if (host && host.offsetHeight > 80) set.add(host);
    });
  }
  return Array.from(set);
}


function enhanceCard(card: HTMLElement) {
  const link = findNoteLink(card);
  const externalId = extractNoteId(link?.getAttribute("href") ?? null);
  if (!externalId) return;

  const media = extractMedia(card);
  mountDownloadButtons(card, {
    placement: "inside",
    videoCount: media.hasVideo ? 1 : 0,
    photoCount: media.hasVideo ? 0 : media.mediaUrls.length,
    onDownloadVideo: () => download(card, externalId),
    onDownloadPhotos: () => download(card, externalId),
  });
}

async function download(card: HTMLElement, externalId: string) {
  const { mediaUrls } = extractMedia(card);
  if (!mediaUrls.length) {
    showToast("다운로드할 미디어가 없습니다");
    return;
  }
  await downloadUrls(mediaUrls, `xhs-${externalId}`);
  showToast(`${mediaUrls.length}개 다운로드 시작`);
}

let scanTimer = 0;
function scan() {
  scanTimer = 0;
  const cards = candidateCards();
  removeDownloadButtons(new Set(cards));
  for (const card of cards) enhanceCard(card);
}

new MutationObserver(() => {
  if (!scanTimer) scanTimer = window.setTimeout(scan, 150);
}).observe(document.documentElement, { childList: true, subtree: true });
scan();
