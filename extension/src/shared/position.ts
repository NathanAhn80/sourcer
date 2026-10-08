/** Keep overlay stacks parked outside the post (HypeDuck-style) via fixed coords.
 *  Short posts: clamp stack to the band before the next post; drop empty/low pills first.
 */

const stacks = new Map<HTMLElement, HTMLElement>();
const GAP = 10;
const MIN_STACK_H = 24;

export function registerFixedStack(anchor: HTMLElement, stack: HTMLElement) {
  stacks.set(anchor, stack);
  stack.dataset.pos = "fixed-left";
  stack.style.position = "fixed";
  stack.style.width = "112px";
  stack.style.zIndex = "2147483646";
  stack.style.pointerEvents = "auto";
  stack.style.overflow = "hidden";
  stack.style.boxSizing = "border-box";
  if (stack.parentElement !== document.documentElement) {
    document.documentElement.appendChild(stack);
  }
  requestSync();
}

export function unregisterFixedStack(anchor: HTMLElement) {
  const stack = stacks.get(anchor);
  if (stack) {
    stack.remove();
    stacks.delete(anchor);
  }
}

/** Drop stacks whose anchors are gone or no longer in the live set. */
export function pruneFixedStacks(liveAnchors: Set<HTMLElement>) {
  for (const [anchor] of stacks) {
    if (!anchor.isConnected || !liveAnchors.has(anchor)) {
      unregisterFixedStack(anchor);
    }
  }
}

function isEmptyMetricPill(el: HTMLElement): boolean {
  const t = (el.textContent || "").replace(/\s+/g, " ").trim();
  return /^(조회|팔로워|참여율|시간당 조회|확산)\s*[—\-–]/i.test(t);
}

function placeStack(anchor: HTMLElement, stack: HTMLElement, maxHeight: number, z: number) {
  if (!anchor.isConnected) {
    unregisterFixedStack(anchor);
    return;
  }
  const r = anchor.getBoundingClientRect();
  if (
    r.height < 48 ||
    r.width < 140 ||
    r.bottom < -80 ||
    r.top > window.innerHeight + 80 ||
    r.left > window.innerWidth * 0.75
  ) {
    stack.style.visibility = "hidden";
    return;
  }

  stack.style.visibility = "visible";
  stack.style.zIndex = String(2147483600 + z);
  // Park further left of the feed column (HypeDuck gutter)
  let left = r.left - 156;
  if (left < 8) left = Math.max(8, r.left - 128);
  if (left + 112 > r.left - 6) left = Math.max(8, r.left - 120);
  stack.style.left = `${Math.round(left)}px`;
  stack.style.top = `${Math.round(Math.max(4, r.top))}px`;

  const budget = Math.max(MIN_STACK_H, Math.floor(maxHeight));
  stack.style.maxHeight = `${budget}px`;
  stack.style.gap = budget < 110 ? "2px" : "4px";
  fitPillsToHeight(stack, budget);
}

/**
 * Hide pills so the stack stays inside the post band (no bleed into next post).
 * Priority: drop empty "—" metrics first, then secondary metrics, then actions.
 */
function fitPillsToHeight(stack: HTMLElement, maxHeight: number) {
  const pills = Array.from(stack.querySelectorAll<HTMLElement>(":scope > .sourcer-pill"));
  const menu = stack.querySelector<HTMLElement>(":scope > .sourcer-menu");
  if (menu) menu.style.display = menu.classList.contains("open") ? "" : "none";

  for (const p of pills) {
    p.style.display = "";
    p.style.visibility = "visible";
  }

  const fits = () => {
    // Force layout; ignore open menu
    return stack.scrollHeight <= maxHeight + 2;
  };

  if (fits()) return;

  const isAction = (el: HTMLElement) => el.matches("[data-act]");
  const empty = pills.filter((p) => !isAction(p) && isEmptyMetricPill(p));
  const metrics = pills.filter((p) => !isAction(p) && !isEmptyMetricPill(p));
  const actions = pills.filter(isAction);

  for (const p of empty) {
    p.style.display = "none";
    if (fits()) return;
  }

  // Hide secondary filled metrics from the bottom (확산 → 시간당 → 참여율 …)
  for (let i = metrics.length - 1; i >= 1; i--) {
    metrics[i]!.style.display = "none";
    if (fits()) return;
  }

  // Keep grade/views if possible; then trim actions
  if (metrics[0] && !fits()) {
    // still too tall with one metric — keep actions only if they fit alone
  }

  for (let i = actions.length - 1; i >= 0; i--) {
    actions[i]!.style.display = "none";
    if (fits()) return;
  }

  // Absolute last: keep a single top pill
  for (let i = 1; i < pills.length; i++) pills[i]!.style.display = "none";
  if (pills[0]) pills[0].style.display = "";
}

let ticking = false;
function syncAll() {
  ticking = false;
  const entries = Array.from(stacks.entries())
    .filter(([anchor]) => anchor.isConnected)
    .map(([anchor, stack]) => ({
      anchor,
      stack,
      rect: anchor.getBoundingClientRect(),
    }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  for (let i = 0; i < entries.length; i++) {
    const cur = entries[i]!;
    const next = entries[i + 1];
    // Band until next card top (HypeDuck). Also never exceed this card's box by much.
    const toNext = next
      ? next.rect.top - cur.rect.top - GAP
      : Math.min(cur.rect.bottom, window.innerHeight - 4) - cur.rect.top - GAP;
    // Prefer gap-to-next; if card is shorter, don't let stack run past card bottom + small slack
    const toCardEnd = cur.rect.height + 6;
    const maxHeight = Math.max(MIN_STACK_H, Math.min(toNext, toCardEnd));
    placeStack(cur.anchor, cur.stack, maxHeight, entries.length - i);
  }
}

function requestSync() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(syncAll);
}

let listening = false;
export function ensurePositionListeners() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", requestSync, true);
  window.addEventListener("resize", requestSync);
}

/** Call after overlay DOM rewrite so pill fit re-runs. */
export function refreshStackLayout() {
  requestSync();
}
