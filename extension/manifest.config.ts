import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "Sourcer — Threads & Xiaohongshu",
  description: "Performance overlays, collect, and media download for Threads and Xiaohongshu.",
  version: "0.1.0",
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
    "http://localhost:3456/*",
    "https://www.threads.net/*",
    "https://threads.net/*",
    "https://www.xiaohongshu.com/*",
    "https://xiaohongshu.com/*",
    "https://*.xhscdn.com/*",
    "https://*.fbcdn.net/*",
    "https://*.cdninstagram.com/*",
  ],
  content_scripts: [
    {
      matches: ["https://www.threads.net/*", "https://threads.net/*"],
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
