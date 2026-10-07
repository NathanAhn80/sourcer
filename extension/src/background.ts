chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DOWNLOAD_URLS") {
    const urls = (message.urls as string[]) ?? [];
    const prefix = (message.prefix as string) || "sourcer";
    void (async () => {
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (!url) continue;
        const ext = guessExt(url);
        try {
          await chrome.downloads.download({
            url,
            filename: `sourcer/${prefix}-${i + 1}.${ext}`,
            saveAs: false,
            conflictAction: "uniquify",
          });
        } catch (e) {
          console.warn("download failed", url, e);
        }
      }
      sendResponse({ ok: true, count: urls.length });
    })();
    return true;
  }
  return false;
});

function guessExt(url: string): string {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.includes(".mp4") || url.includes("video")) return "mp4";
    if (path.includes(".webp")) return "webp";
    if (path.includes(".png")) return "png";
    if (path.includes(".gif")) return "gif";
    return "jpg";
  } catch {
    return "bin";
  }
}
