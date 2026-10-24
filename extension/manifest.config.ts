import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Sourcer — Threads & Xiaohongshu",
  description: "Image and video download buttons for Threads and Xiaohongshu.",
  version: "0.2.0",
  action: {
    default_popup: "src/popup/index.html",
    default_title: "Sourcer",
  },
  background: {
    service_worker: "src/background.ts",
    type: "module",
  },
  permissions: ["storage", "downloads", "activeTab"],
  host_permissions: [
    "https://www.threads.net/*",
    "https://threads.net/*",
    "https://www.threads.com/*",
    "https://threads.com/*",
    "https://www.xiaohongshu.com/*",
    "https://xiaohongshu.com/*",
    "https://*.xhscdn.com/*",
    "https://*.fbcdn.net/*",
    "https://*.cdninstagram.com/*",
  ],
  content_scripts: [
    {
      matches: [
        "https://www.threads.net/*",
        "https://threads.net/*",
        "https://www.threads.com/*",
        "https://threads.com/*",
      ],
      js: ["src/content/media-hook.ts"],
      run_at: "document_start",
      world: "MAIN",
    },
    {
      matches: [
        "https://www.threads.net/*",
        "https://threads.net/*",
        "https://www.threads.com/*",
        "https://threads.com/*",
      ],
      js: ["src/content/threads.ts"],
      run_at: "document_idle",
    },
    {
      matches: ["https://www.xiaohongshu.com/*", "https://xiaohongshu.com/*"],
      js: ["src/content/xhs.ts"],
      run_at: "document_idle",
    },
  ],
});
