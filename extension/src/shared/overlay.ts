import { formatCompact, type Grade } from "./grades";

const STYLE_ID = "sourcer-overlay-style";

export function ensureOverlayStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .sourcer-stack {
      position: absolute;
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
      pointer-events: auto;
      font: 600 11px/1.2 "Segoe UI", system-ui, sans-serif;
    }
    .sourcer-stack[data-pos="left"] { top: 8px; left: -118px; width: 110px; }
    .sourcer-stack[data-pos="card-tl"] { top: 8px; left: 8px; }
    .sourcer-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(32, 35, 39, 0.92);
      color: #f3f4f6;
      white-space: nowrap;
      box-shadow: 0 1px 4px rgba(0,0,0,.25);
    }
    .sourcer-pill.grade-폭발 { background: #6d28d9; }
    .sourcer-pill.grade-강력 { background: #ea580c; }
    .sourcer-pill.grade-우수 { background: #ca8a04; color: #111; }
    .sourcer-pill.grade-보통 { background: #4b5563; }
    .sourcer-pill.grade-약함 { background: #1f2937; color: #9ca3af; }
    .sourcer-pill.action { cursor: pointer; background: #111827; border: 1px solid #374151; }
    .sourcer-keywords {
      position: absolute;
      z-index: 2147483646;
      top: 8px; right: -150px;
      width: 140px;
      background: #fff;
      color: #111;
      border-radius: 10px;
      padding: 8px;
      box-shadow: 0 4px 16px rgba(0,0,0,.18);
      font: 500 11px/1.35 "Segoe UI", system-ui, sans-serif;
      display: none;
    }
    .sourcer-keywords.show { display: grid; gap: 4px; }
    .sourcer-keywords button {
      display: flex; align-items: center; gap: 4px;
      border: 0; background: #f3f4f6; border-radius: 6px;
      padding: 4px 6px; cursor: pointer; text-align: left; font: inherit;
    }
    .sourcer-keywords button:hover { background: #e5e7eb; }
    .sourcer-menu {
      position: absolute;
      z-index: 2147483647;
      top: 36px; left: 8px;
      width: 220px;
      background: #1c1c1e;
      color: #f5f5f7;
      border-radius: 14px;
      padding: 10px;
      box-shadow: 0 12px 32px rgba(0,0,0,.45);
      font: 500 12px/1.3 "Segoe UI", system-ui, sans-serif;
      display: none;
    }
    .sourcer-menu.open { display: grid; gap: 6px; }
    .sourcer-menu .hint { color: #a1a1aa; font-size: 11px; margin-bottom: 4px; }
    .sourcer-menu button {
      width: 100%; border: 0; border-radius: 10px; padding: 10px 12px;
      cursor: pointer; font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif;
      background: #2c2c2e; color: #f5f5f7; text-align: left;
    }
    .sourcer-menu button.primary { background: #7c3aed; }
    .sourcer-menu button:hover { filter: brightness(1.08); }
    .sourcer-menu .row { display: flex; gap: 6px; }
    .sourcer-menu .row button { flex: 1; text-align: center; padding: 8px; }
    .sourcer-toast {
      position: fixed; z-index: 2147483647; left: 50%; bottom: 24px;
      transform: translateX(-50%); background: #1a222c; color: #eef2f6;
      border: 1px solid #2a3541; border-radius: 10px; padding: 10px 14px;
      font: 500 13px/1.3 "Segoe UI", system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
    }
    .sourcer-xhs-panel {
      position: sticky; top: 8px; z-index: 2147483645;
      margin: 8px 12px 16px; padding: 14px 16px; border-radius: 16px;
      background: #fff; color: #111; border: 1px solid #e5e7eb;
      box-shadow: 0 8px 24px rgba(0,0,0,.08);
      font: 500 12px/1.4 "Segoe UI", system-ui, sans-serif;
    }
    .sourcer-xhs-panel h3 { margin: 0 0 10px; font-size: 15px; }
    .sourcer-xhs-metrics {
      display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px;
      margin-bottom: 10px;
    }
    .sourcer-xhs-metrics div {
      background: #f8fafc; border-radius: 10px; padding: 8px 10px;
    }
    .sourcer-xhs-metrics .label { color: #64748b; font-size: 11px; }
    .sourcer-xhs-metrics .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
    .sourcer-xhs-filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .sourcer-xhs-filters button {
      border: 1px solid #e5e7eb; background: #fff; border-radius: 999px;
      padding: 5px 10px; cursor: pointer; font: 600 11px/1 "Segoe UI", system-ui, sans-serif;
    }
    .sourcer-xhs-filters button.active { border-color: #7c3aed; background: #f3e8ff; }
    .sourcer-xhs-filters .g-폭발 { color: #6d28d9; }
    .sourcer-xhs-filters .g-강력 { color: #ea580c; }
    .sourcer-xhs-filters .g-우수 { color: #ca8a04; }
    .sourcer-xhs-top { display: grid; gap: 4px; max-height: 180px; overflow: auto; }
    .sourcer-xhs-top .row {
      display: grid; grid-template-columns: 24px 1fr auto auto; gap: 8px;
      align-items: center; padding: 4px 0; border-bottom: 1px solid #f1f5f9;
    }
    .sourcer-xhs-top .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sourcer-card-likes {
      position: absolute; z-index: 2147483645; left: 8px; bottom: 8px;
      background: rgba(0,0,0,.75); color: #fff; border-radius: 999px;
      padding: 4px 8px; font: 600 11px/1 "Segoe UI", system-ui, sans-serif;
    }
    .sourcer-video-tag {
      position: absolute; z-index: 2147483645; right: 8px; top: 8px;
      background: rgba(0,0,0,.7); color: #fff; border-radius: 6px;
      padding: 3px 6px; font: 600 10px/1 "Segoe UI", system-ui, sans-serif;
    }
    .sourcer-hidden-card { opacity: 0.18 !important; filter: grayscale(1); }
  `;
  document.documentElement.appendChild(style);
}

export type ThreadsStackMetrics = {
  grade?: Grade | null;
  multiple?: number | null;
  views?: number | null;
  followers?: number | null;
  engagementRate?: number | null;
  velocity?: number | null;
  spread?: number | null;
};

export type ThreadsMenuActions = {
  onDownloadVideo?: () => void | Promise<void>;
  onDownloadPhotos?: () => void | Promise<void>;
  onCopyLink?: () => void | Promise<void>;
  onCopyText?: () => void | Promise<void>;
  onCollect?: () => void | Promise<void>;
  onExportCsv?: () => void | Promise<void>;
  videoCount?: number;
  photoCount?: number;
};

export function mountThreadsOverlay(
  host: HTMLElement,
  metrics: ThreadsStackMetrics,
  keywords: string[],
  actions: ThreadsMenuActions,
  opts?: { showKeywords?: boolean },
) {
  ensureOverlayStyles();
  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }

  let stack = host.querySelector<HTMLElement>(":scope > .sourcer-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "sourcer-stack";
    stack.dataset.pos = "left";
    host.appendChild(stack);
  }

  const pills: string[] = [];
  if (metrics.grade != null && metrics.multiple != null) {
    pills.push(
      `<span class="sourcer-pill grade-${metrics.grade}">${metrics.grade} ${metrics.multiple}배</span>`,
    );
  } else if (metrics.grade) {
    pills.push(`<span class="sourcer-pill grade-${metrics.grade}">${metrics.grade}</span>`);
  }
  if (metrics.views != null) {
    pills.push(`<span class="sourcer-pill">조회 ${formatCompact(metrics.views)}</span>`);
  }
  if (metrics.followers != null) {
    pills.push(`<span class="sourcer-pill">팔로워 ${formatCompact(metrics.followers)}</span>`);
  }
  if (metrics.engagementRate != null) {
    pills.push(`<span class="sourcer-pill">참여율 ${metrics.engagementRate}%</span>`);
  }
  if (metrics.velocity != null) {
    pills.push(`<span class="sourcer-pill">시간당 조회 ${formatCompact(metrics.velocity)}</span>`);
  }
  if (metrics.spread != null) {
    pills.push(`<span class="sourcer-pill">확산 ${metrics.spread}</span>`);
  }
  pills.push(`<button type="button" class="sourcer-pill action" data-act="menu">다운로드 ▾</button>`);
  pills.push(`<button type="button" class="sourcer-pill action" data-act="collect">수집</button>`);
  stack.innerHTML = pills.join("");

  // Keywords box
  let kw = host.querySelector<HTMLElement>(":scope > .sourcer-keywords");
  if (!kw) {
    kw = document.createElement("div");
    kw.className = "sourcer-keywords";
    host.appendChild(kw);
  }
  if (opts?.showKeywords !== false && keywords.length) {
    kw.classList.add("show");
    kw.innerHTML = keywords
      .map(
        (k) =>
          `<button type="button" data-kw="${escapeAttr(k)}">🔍 ${escapeHtml(k)}</button>`,
      )
      .join("");
    kw.querySelectorAll<HTMLButtonElement>("[data-kw]").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const q = btn.dataset.kw ?? "";
        window.open(`https://www.threads.net/search?q=${encodeURIComponent(q)}`, "_blank");
      };
    });
  } else {
    kw.classList.remove("show");
    kw.innerHTML = "";
  }

  // Action menu
  let menu = host.querySelector<HTMLElement>(":scope > .sourcer-menu");
  if (!menu) {
    menu = document.createElement("div");
    menu.className = "sourcer-menu";
    host.appendChild(menu);
  }
  const photoLabel =
    (actions.photoCount ?? 0) > 0 ? `사진 ${actions.photoCount}장 다운로드` : "사진 다운로드";
  const videoLabel = (actions.videoCount ?? 0) > 0 ? "영상 다운로드" : "영상 다운로드";
  menu.innerHTML = `
    <div class="hint">미디어 · 텍스트 · 수집</div>
    <button type="button" class="primary" data-m="video">${videoLabel}</button>
    <button type="button" data-m="photos">${photoLabel}</button>
    <button type="button" data-m="link">링크 복사</button>
    <button type="button" data-m="text">텍스트 복사</button>
    <button type="button" data-m="collect">스레드 텍스트 저장</button>
    <div class="row">
      <button type="button" data-m="csv">CSV</button>
      <button type="button" data-m="toggle-kw">해시 표시</button>
    </div>
  `;

  const menuBtn = stack.querySelector<HTMLButtonElement>('[data-act="menu"]');
  const collectBtn = stack.querySelector<HTMLButtonElement>('[data-act="collect"]');
  if (menuBtn) {
    menuBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      menu!.classList.toggle("open");
    };
  }
  if (collectBtn && actions.onCollect) {
    collectBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await actions.onCollect?.();
    };
  }

  const bind = (key: string, fn?: () => void | Promise<void>) => {
    const btn = menu!.querySelector<HTMLButtonElement>(`[data-m="${key}"]`);
    if (!btn) return;
    btn.onclick = async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (key === "toggle-kw") {
        kw!.classList.toggle("show");
        return;
      }
      if (fn) await fn();
      menu!.classList.remove("open");
    };
  };
  bind("video", actions.onDownloadVideo);
  bind("photos", actions.onDownloadPhotos);
  bind("link", actions.onCopyLink);
  bind("text", actions.onCopyText);
  bind("collect", actions.onCollect);
  bind("csv", actions.onExportCsv);
  bind("toggle-kw");
}

export function mountXhsCardOverlay(
  host: HTMLElement,
  opts: {
    grade?: Grade | null;
    multiple?: number | null;
    likes?: number | null;
    hasVideo?: boolean;
    onDownload?: () => void | Promise<void>;
    onCollect?: () => void | Promise<void>;
  },
) {
  ensureOverlayStyles();
  if (getComputedStyle(host).position === "static") {
    host.style.position = "relative";
  }

  let stack = host.querySelector<HTMLElement>(":scope > .sourcer-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "sourcer-stack";
    stack.dataset.pos = "card-tl";
    host.appendChild(stack);
  }
  const parts: string[] = [];
  if (opts.grade != null && opts.multiple != null) {
    parts.push(
      `<span class="sourcer-pill grade-${opts.grade}">${opts.grade} ${opts.multiple}배</span>`,
    );
  }
  parts.push(`<button type="button" class="sourcer-pill action" data-act="dl">⬇</button>`);
  if (opts.onCollect) {
    parts.push(`<button type="button" class="sourcer-pill action" data-act="collect">수집</button>`);
  }
  stack.innerHTML = parts.join("");

  let likesEl = host.querySelector<HTMLElement>(":scope > .sourcer-card-likes");
  if (opts.likes != null) {
    if (!likesEl) {
      likesEl = document.createElement("div");
      likesEl.className = "sourcer-card-likes";
      host.appendChild(likesEl);
    }
    likesEl.textContent = `좋아요 ${formatCompact(opts.likes)}`;
  }

  let videoTag = host.querySelector<HTMLElement>(":scope > .sourcer-video-tag");
  if (opts.hasVideo) {
    if (!videoTag) {
      videoTag = document.createElement("div");
      videoTag.className = "sourcer-video-tag";
      host.appendChild(videoTag);
    }
    videoTag.textContent = "영상";
  } else {
    videoTag?.remove();
  }

  const dl = stack.querySelector<HTMLButtonElement>('[data-act="dl"]');
  if (dl && opts.onDownload) {
    dl.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await opts.onDownload?.();
    };
  }
  const collect = stack.querySelector<HTMLButtonElement>('[data-act="collect"]');
  if (collect && opts.onCollect) {
    collect.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await opts.onCollect?.();
    };
  }
}

export type XhsReportItem = {
  title: string;
  likes: number;
  multiple: number;
  grade: Grade;
  url?: string;
};

export function mountXhsExplorePanel(
  container: HTMLElement,
  stats: {
    noteCount: number;
    typicalLikes: number;
    avgLikes: number;
    maxMultiple: number;
    gradeCounts: Record<Grade | "all", number>;
    top10: XhsReportItem[];
  },
  onFilter: (grade: Grade | "all") => void,
) {
  ensureOverlayStyles();
  let panel = document.getElementById("sourcer-xhs-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "sourcer-xhs-panel";
    panel.className = "sourcer-xhs-panel";
    container.prepend(panel);
  }

  const grades: Array<Grade | "all"> = ["all", "폭발", "강력", "우수", "보통", "약함"];
  panel.innerHTML = `
    <h3>샤오홍슈 탐색 분석 ${stats.noteCount}개</h3>
    <div class="sourcer-xhs-metrics">
      <div><div class="label">노트 수</div><div class="value">${stats.noteCount}</div></div>
      <div><div class="label">팬 로열티</div><div class="value">—</div></div>
      <div><div class="label">평소 좋아요</div><div class="value">${formatCompact(stats.typicalLikes)}</div></div>
      <div><div class="label">평균 좋아요</div><div class="value">${formatCompact(stats.avgLikes)}</div></div>
      <div><div class="label">최고 성과배수</div><div class="value">${stats.maxMultiple}배</div></div>
    </div>
    <div class="sourcer-xhs-filters">
      ${grades
        .map((g) => {
          const label = g === "all" ? "전체" : g;
          const count = stats.gradeCounts[g] ?? 0;
          const cls = g === "all" ? "" : `g-${g}`;
          return `<button type="button" class="${cls}" data-filter="${g}">${label} ${count}</button>`;
        })
        .join("")}
    </div>
    <div class="sourcer-xhs-top">
      ${stats.top10
        .map(
          (item, i) => `
        <div class="row">
          <span>${i + 1}</span>
          <span class="title">${escapeHtml(item.title || "(제목 없음)")}</span>
          <span>${formatCompact(item.likes)}</span>
          <span class="sourcer-pill grade-${item.grade}" style="position:static">${item.grade} ${item.multiple}배</span>
        </div>`,
        )
        .join("")}
    </div>
  `;

  const buttons = panel.querySelectorAll<HTMLButtonElement>("[data-filter]");
  buttons.forEach((btn) => {
    btn.onclick = () => {
      buttons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onFilter(btn.dataset.filter as Grade | "all");
    };
  });
  buttons[0]?.classList.add("active");
}

export function showToast(message: string) {
  ensureOverlayStyles();
  document.querySelector(".sourcer-toast")?.remove();
  const el = document.createElement("div");
  el.className = "sourcer-toast";
  el.textContent = message;
  document.documentElement.appendChild(el);
  window.setTimeout(() => el.remove(), 2400);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string) {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
