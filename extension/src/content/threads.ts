import { collectItem } from "../shared/api";
import {
  computePerformanceMultiple,
  engagementRate,
  extractKeywords,
  gradeFromMultiple,
  parseCount,
  spreadScore,
} from "../shared/grades";
import { mountThreadsOverlay, showToast } from "../shared/overlay";

const PROCESSED = "data-sourcer-threads";

function downloadUrls(urls: string[], prefix: string) {
  return new Promise<{ ok: boolean }>((resolve) => {
    chrome.runtime.sendMessage({ type: "DOWNLOAD_URLS", urls, prefix }, (res) => {
      resolve({ ok: Boolean(res?.ok) });
    });
  });
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
  for (const a of Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="/@"]'))) {
    const m = a.getAttribute("href")?.match(/^\/@([^/?#]+)/);
    if (m) return m[1];
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

function extractMedia(root: Element) {
  const images: string[] = [];
  const videos: string[] = [];
  root.querySelectorAll("img").forEach((img) => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith("data:")) return;
    if (src.includes("profile") || (img.naturalWidth > 0 && img.naturalWidth < 48)) return;
    images.push(src);
  });
  root.querySelectorAll("video").forEach((video) => {
    const src = video.currentSrc || video.src || video.querySelector("source")?.src;
    if (src) videos.push(src);
  });
  return { images: Array.from(new Set(images)), videos: Array.from(new Set(videos)) };
}

function extractMetrics(root: Element) {
  const text = root.textContent ?? "";
  const aria = Array.from(root.querySelectorAll("[aria-label]"))
    .map((el) => el.getAttribute("aria-label") ?? "")
    .join(" ");
  const blob = `${text}\n${aria}`;

  const views =
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:views?|조회)/i)?.[1]) ??
    parseCount(blob.match(/(?:views?|조회)\s*([\d.,]+[kmb만천]?)/i)?.[1]);

  const likes =
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:likes?|좋아요)/i)?.[1]) ??
    parseCount(blob.match(/(?:likes?|좋아요)\s*([\d.,]+[kmb만천]?)/i)?.[1]);

  const replies =
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:replies?|답글|댓글)/i)?.[1]) ??
    parseCount(blob.match(/(?:replies?|답글|댓글)\s*([\d.,]+[kmb만천]?)/i)?.[1]);

  const reposts =
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:reposts?|리포스트)/i)?.[1]) ?? null;

  const followers =
    parseCount(blob.match(/([\d.,]+[kmb만천]?)\s*(?:followers?|팔로워)/i)?.[1]) ?? null;

  const timeEl = root.querySelector("time");
  let velocity: number | null = null;
  if (views != null && timeEl?.dateTime) {
    const ts = Date.parse(timeEl.dateTime);
    if (Number.isFinite(ts)) {
      const hours = Math.max((Date.now() - ts) / 3_600_000, 1 / 60);
      velocity = Math.round(views / hours);
    }
  }

  return { views, likes, replies, reposts, followers, velocity };
}

function candidateCards(): HTMLElement[] {
  const set = new Set<HTMLElement>();
  document
    .querySelectorAll('[data-pressable-container="true"], article, div[role="article"]')
    .forEach((el) => {
      if (el instanceof HTMLElement && findPostLink(el)) set.add(el);
    });
  if (set.size === 0) {
    document.querySelectorAll('a[href*="/post/"]').forEach((a) => {
      const host = a.closest("div");
      if (host instanceof HTMLElement && host.offsetHeight > 80) set.add(host);
    });
  }
  return Array.from(set);
}

async function enhanceCard(card: HTMLElement) {
  if (card.getAttribute(PROCESSED) === "1") return;
  const link = findPostLink(card);
  const externalId = extractPostId(link?.getAttribute("href") ?? null);
  if (!externalId || !link) return;
  card.setAttribute(PROCESSED, "1");

  const metrics = extractMetrics(card);
  const multiple = computePerformanceMultiple({
    views: metrics.views,
    likes: metrics.likes,
    followers: metrics.followers,
  });
  const grade = gradeFromMultiple(multiple);
  const rate = engagementRate(metrics);
  const spread = spreadScore(metrics.views);
  const media = extractMedia(card);
  const authorHandle = extractHandle(card);
  const caption = extractCaption(card);
  const keywords = extractKeywords(caption);
  const url = new URL(link.getAttribute("href")!, location.origin).toString();

  const doCollect = async () => {
    const result = await collectItem({
      platform: "threads",
      externalId,
      url,
      authorHandle,
      caption,
      thumbnailUrl: media.images[0] ?? media.videos[0] ?? null,
      mediaUrls: [...media.videos, ...media.images],
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
    },
    keywords,
    {
      videoCount: media.videos.length,
      photoCount: media.images.length,
      onDownloadVideo: async () => {
        if (!media.videos.length) {
          showToast("영상이 없습니다");
          return;
        }
        await downloadUrls(media.videos, `threads-${externalId}-video`);
        showToast("영상 다운로드 시작");
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
  );
}

function scan() {
  for (const card of candidateCards()) {
    void enhanceCard(card);
  }
}

const observer = new MutationObserver(() => {
  window.requestAnimationFrame(scan);
});
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();
