/**
 * MAIN-world hook (passive): reads Threads API responses and reports mp4 URLs
 * to the content script. Never modifies requests.
 */
(() => {
  const HOOK = "sourcer-hook-v1";

  function emitVideos(urls: string[], postCode: string | null) {
    const cleaned = urls
      .map((u) => u.replace(/\\\//g, "/").replace(/\\u0026/g, "&"))
      .filter((u) => /^https?:\/\//i.test(u) && /\.mp4(\?|$)/i.test(u));
    if (!cleaned.length) return;
    window.postMessage({ source: HOOK, kind: "videos", urls: cleaned, postCode }, "*");
  }

  function harvest(text: string) {
    if (!/video_versions|\.mp4/i.test(text)) return;
    const codes = Array.from(text.matchAll(/"code"\s*:\s*"([A-Za-z0-9_-]+)"/g)).map((m) => m[1]);
    const mp4s = [
      ...Array.from(text.matchAll(/https:\\\/\\\/[^"\\]+?\.mp4[^"\\]*/gi)).map((m) => m[0]),
      ...Array.from(text.matchAll(/https:\/\/[^"'\s]+?\.mp4[^"'\s]*/gi)).map((m) => m[0]),
    ];
    if (!mp4s.length) return;
    emitVideos(mp4s, codes[0] ?? null);
    for (const code of codes.slice(0, 8)) emitVideos(mp4s, code);
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const res = await origFetch(...args);
    try {
      const ct = res.headers.get("content-type") || "";
      if (/json|javascript|text|html/i.test(ct)) {
        res.clone().text().then(harvest).catch(() => {});
      }
    } catch {
      /* ignore */
    }
    return res;
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args: unknown[]) {
    this.addEventListener("load", function () {
      try {
        if (typeof this.responseText === "string") harvest(this.responseText);
      } catch {
        /* ignore */
      }
    });
    return origSend.apply(this, args as never);
  };

  const boot = () => {
    try {
      harvest(document.documentElement?.innerHTML ?? "");
    } catch {
      /* ignore */
    }
  };
  if (document.documentElement) boot();
  else document.addEventListener("DOMContentLoaded", boot, { once: true });
  window.setTimeout(boot, 1500);
})();
