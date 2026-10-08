/** Cross-world bridge: MAIN hook ↔ isolated content script via postMessage */

export const SOURCER_MSG = "sourcer-hook-v1";
export const SOURCER_CONTENT = "sourcer-content-v1";

export function listenHookMessages(handler: (data: {
  kind: "metrics" | "videos";
  posts?: unknown[];
  followers?: { username: string; count: number }[];
  urls?: string[];
  postCode?: string | null;
}) => void) {
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== SOURCER_MSG) return;
    handler(data);
  });
}

export function postToHook(payload: Record<string, unknown>) {
  window.postMessage({ source: SOURCER_CONTENT, ...payload }, "*");
}

/** Ask MAIN hook to re-broadcast its cache (fixes document_start race). */
export function helloHook() {
  postToHook({ kind: "hello" });
}

/** Ask MAIN hook to fetch permalink / GraphQL for missing views/followers. */
export function requestEnrich(code: string, username?: string | null, prioritize = false) {
  postToHook({ kind: "enrich", code, username: username ?? null, prioritize });
}

export function postHookMessage(payload: Record<string, unknown>) {
  window.postMessage({ source: SOURCER_MSG, ...payload }, "*");
}
