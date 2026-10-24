const STYLE_ID = "sourcer-overlay-style";

export function ensureOverlayStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .sourcer-dl {
      position: fixed; top: 0; left: 0; z-index: 2147483646;
      display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
      font: 600 12px/1.2 "Segoe UI", system-ui, sans-serif;
    }
    .sourcer-dl[data-place="inside"] { flex-direction: row; }
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

const boxes = new Map<HTMLElement, HTMLElement>();
let tracking = 0;

/** Buttons live on <html> (fixed) so ancestor overflow clipping can't hide them. */
function placeBoxes() {
  tracking = 0;
  for (const [host, box] of boxes) {
    if (!host.isConnected) {
      box.remove();
      boxes.delete(host);
      continue;
    }
    const r = host.getBoundingClientRect();
    const visible = r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    box.style.display = visible ? "flex" : "none";
    if (!visible) continue;
    const w = box.offsetWidth || 90;
    const inside = box.dataset.place === "inside";
    const left = inside ? r.right - w - 8 : Math.min(r.right + 8, window.innerWidth - w - 4);
    box.style.left = `${Math.max(4, left)}px`;
    box.style.top = `${Math.max(8, r.top + 8)}px`;
  }
  if (boxes.size) tracking = window.requestAnimationFrame(placeBoxes);
}

/** Mounts (or refreshes) a small download button row for a post/note card. */
export function mountDownloadButtons(host: HTMLElement, actions: DownloadActions) {
  ensureOverlayStyles();
  let box = boxes.get(host);
  if (!actions.videoCount && !actions.photoCount) {
    box?.remove();
    boxes.delete(host);
    return;
  }
  if (!box) {
    box = document.createElement("div");
    box.className = "sourcer-dl";
    document.documentElement.appendChild(box);
    boxes.set(host, box);
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
  if (!tracking) tracking = window.requestAnimationFrame(placeBoxes);
}

export function removeDownloadButtons(keep: Set<HTMLElement>) {
  for (const [host, box] of boxes) {
    if (keep.has(host)) continue;
    box.remove();
    boxes.delete(host);
  }
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
