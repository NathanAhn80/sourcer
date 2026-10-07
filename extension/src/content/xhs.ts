import { collectItem } from "../shared/api";
import {
  computePerformanceMultiple,
  gradeFromMultipleXhs,
  parseCount,
  type Grade,
} from "../shared/grades";
import { mountXhsCardOverlay, mountXhsExplorePanel, showToast } from "../shared/overlay";

const PROCESSED = "data-sourcer-xhs";

type CardData = {
  card: HTMLElement;
  title: string;
  likes: number | null;
  multiple: number | null;
  grade: Grade | null;
  url: string;
  mediaUrls: string[];
  hasVideo: boolean;
};

const cardRegistry = new Map<HTMLElement, CardData>();

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

function extractLikes(root: Element): number | null {
  const likeCandidates = Array.from(root.querySelectorAll("span, div")).filter((el) => {
    const t = el.textContent?.trim() ?? "";
    return /^[\d.,]+[kmb万萬만+]?$/.test(t) && t.length <= 10;
  });
  for (const el of likeCandidates.reverse()) {
    const n = parseCount(el.textContent);
    if (n != null) return n;
  }
  return parseCount((root.textContent ?? "").match(/([\d.,]+[kmb万萬만]?)\s*(?:赞|喜欢|likes?)/i)?.[1]);
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

function extractCaption(root: Element): string {
  return (
    root.querySelector(".title, .footer .title, [class*='title']")?.textContent?.trim() ||
    root.querySelector("img")?.getAttribute("alt") ||
    ""
  ).slice(0, 500);
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

function likesList(): number[] {
  return Array.from(cardRegistry.values())
    .map((c) => c.likes)
    .filter((n): n is number => n != null && n > 0);
}

function typicalLikes(): number {
  const likes = likesList().sort((a, b) => a - b);
  if (!likes.length) return 0;
  return likes[Math.floor(likes.length / 2)] ?? 0;
}

function avgLikes(): number {
  const likes = likesList();
  if (!likes.length) return 0;
  return likes.reduce((a, b) => a + b, 0) / likes.length;
}

function updateReport() {
  const cards = Array.from(cardRegistry.values());
  if (!cards.length) return;

  const typical = typicalLikes();
  const avg = avgLikes();
  const maxMultiple = Math.max(0, ...cards.map((c) => c.multiple ?? 0));

  const gradeCounts: Record<Grade | "all", number> = {
    all: cards.length,
    폭발: 0,
    강력: 0,
    우수: 0,
    보통: 0,
    약함: 0,
  };
  for (const c of cards) {
    if (c.grade) gradeCounts[c.grade] += 1;
  }

  const top10 = [...cards]
    .filter((c) => c.multiple != null && c.grade)
    .sort((a, b) => (b.multiple ?? 0) - (a.multiple ?? 0))
    .slice(0, 10)
    .map((c) => ({
      title: c.title,
      likes: c.likes ?? 0,
      multiple: c.multiple ?? 0,
      grade: c.grade!,
      url: c.url,
    }));

  const mountPoint =
    (document.querySelector("#search-input, .search-layout, .feeds-page, main") as HTMLElement | null) ||
    document.body;

  mountXhsExplorePanel(
    mountPoint,
    {
      noteCount: cards.length,
      typicalLikes: typical,
      avgLikes: avg,
      maxMultiple,
      gradeCounts,
      top10,
    },
    (filter) => {
      for (const { card, grade } of cardRegistry.values()) {
        if (filter === "all") card.classList.remove("sourcer-hidden-card");
        else card.classList.toggle("sourcer-hidden-card", grade !== filter);
      }
    },
  );
}

async function enhanceCard(card: HTMLElement) {
  const link = findNoteLink(card);
  const externalId = extractNoteId(link?.getAttribute("href") ?? null);
  if (!externalId || !link) return;

  const likes = extractLikes(card);
  const baseline = typicalLikes() || avgLikes() || likes || 1;
  const multiple = computePerformanceMultiple({
    likes,
    avgLikes: baseline,
  });
  const grade = gradeFromMultipleXhs(multiple);
  const media = extractMedia(card);
  const title = extractCaption(card);
  const url = new URL(link.getAttribute("href")!, location.origin).toString();

  cardRegistry.set(card, {
    card,
    title,
    likes,
    multiple,
    grade,
    url,
    mediaUrls: media.mediaUrls,
    hasVideo: media.hasVideo,
  });

  if (card.getAttribute(PROCESSED) !== "1") {
    card.setAttribute(PROCESSED, "1");
  }

  mountXhsCardOverlay(card, {
    grade,
    multiple,
    likes,
    hasVideo: media.hasVideo,
    onDownload: async () => {
      if (!media.mediaUrls.length) {
        showToast("다운로드할 미디어가 없습니다");
        return;
      }
      await downloadUrls(media.mediaUrls, `xhs-${externalId}`);
      showToast(`${media.mediaUrls.length}개 다운로드 시작`);
    },
    onCollect: async () => {
      const result = await collectItem({
        platform: "xiaohongshu",
        externalId,
        url,
        caption: title,
        thumbnailUrl: media.mediaUrls[0] ?? null,
        mediaUrls: media.mediaUrls,
        likes,
        avgLikes: typicalLikes() || null,
        metrics: { hasVideo: media.hasVideo, multiple, grade },
      });
      showToast(result.message);
    },
  });
}

function scan() {
  for (const card of candidateCards()) {
    void enhanceCard(card);
  }
  // second pass stabilizes median baseline
  for (const card of candidateCards()) {
    void enhanceCard(card);
  }
  updateReport();
}

const observer = new MutationObserver(() => {
  window.requestAnimationFrame(scan);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();
