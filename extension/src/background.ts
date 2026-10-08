chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "DOWNLOAD_URLS") {
    const urls = (message.urls as string[]) ?? [];
    const prefix = (message.prefix as string) || "sourcer";
    void (async () => {
      let ok = 0;
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        if (!url || url.startsWith("blob:")) continue;
        const ext = guessExt(url);
        try {
          await chrome.downloads.download({
            url,
            filename: `sourcer/${prefix}-${i + 1}.${ext}`,
            saveAs: false,
            conflictAction: "uniquify",
          });
          ok += 1;
        } catch (e) {
          console.warn("download failed", url, e);
        }
      }
      sendResponse({ ok: ok > 0, count: ok });
    })();
    return true;
  }

  if (message?.type === "DOWNLOAD_DATA") {
    const { base64, mime, filename } = message as {
      base64: string;
      mime?: string;
      filename?: string;
    };
    void (async () => {
      try {
        const dataUrl = `data:${mime || "video/mp4"};base64,${base64}`;
        await chrome.downloads.download({
          url: dataUrl,
          filename: filename || `sourcer/video-${Date.now()}.mp4`,
          saveAs: false,
          conflictAction: "uniquify",
        });
        sendResponse({ ok: true });
      } catch (e) {
        console.warn("data download failed", e);
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true;
  }

  return false;
});

function guessExt(url: string): string {
  try {
    if (url.startsWith("data:video")) return "mp4";
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
