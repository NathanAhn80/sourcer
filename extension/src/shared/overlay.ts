const STYLE_ID = "sourcer-overlay-style";

export function ensureOverlayStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .sourcer-dl {
      position: absolute; top: 8px; left: calc(100% + 8px); z-index: 2147483646;
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
      font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif;
    }
    .sourcer-dl[data-place="inside"] { left: auto; right: 8px; flex-direction: row; }
    .sourcer-dl button {
      cursor: pointer; border: 1px solid #374151; border-radius: 999px;
      padding: 5px 10px; background: rgba(17, 24, 39, 0.92); color: #f3f4f6;
      box-shadow: 0 1px 4px rgba(0,0,0,.3); font: inherit; white-space: nowrap;
    }
    .sourcer-dl button:hover { background: #1f2937; }
    .sourcer-toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; background: #111827; color: #f9fafb;
      padding: 10px 16px; border-radius: 10px; font: 500 13px system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,.4);
    }
  `;
  document.documentElement.appendChild(style);
}

export type DownloadActions = {
  videoCount: number;
  photoCount: number;
  onDownloadVideo?: () => void | Promise<void>;
  onDownloadPhotos?: () => void | Promise<void>;
  /** "outside" (default) sits right of the card; "inside" overlays its top-right corner. */
  placement?: "outside" | "inside";
};

/** Mounts (or refreshes) a small download button row on a post/note card. */
export function mountDownloadButtons(host: HTMLElement, actions: DownloadActions) {
  ensureOverlayStyles();
  if (getComputedStyle(host).position === "static") host.style.position = "relative";

  let box = host.querySelector<HTMLElement>(":scope > .sourcer-dl");
  if (!actions.videoCount && !actions.photoCount) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.className = "sourcer-dl";
    host.appendChild(box);
  }
  box.dataset.place = actions.placement ?? "outside";
  box.replaceChildren();
  const add = (label: string, fn?: () => void | Promise<void>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await fn?.();
    };
    box!.appendChild(b);
  };
  if (actions.videoCount) add("⬇ 영상", actions.onDownloadVideo);
  if (actions.photoCount) add(`⬇ 사진 ${actions.photoCount}장`, actions.onDownloadPhotos);
}

export function removeDownloadButtons(keep: Set<HTMLElement>) {
  document.querySelectorAll<HTMLElement>(".sourcer-dl").forEach((box) => {
    const host = box.parentElement;
    if (!host || !keep.has(host)) box.remove();
  });
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
