import { getSettings, saveSettings } from "../shared/api";

const apiBaseEl = document.getElementById("apiBase") as HTMLInputElement;
const apiKeyEl = document.getElementById("apiKey") as HTMLInputElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;

void getSettings().then((s) => {
  apiBaseEl.value = s.apiBase;
  apiKeyEl.value = s.apiKey;
});

document.getElementById("save")!.addEventListener("click", async () => {
  await saveSettings({
    apiBase: apiBaseEl.value.trim() || "http://localhost:3456",
    apiKey: apiKeyEl.value.trim(),
  });
  statusEl.textContent = "저장됨";
});

document.getElementById("openDash")!.addEventListener("click", async () => {
  const s = await getSettings();
  await chrome.tabs.create({ url: s.apiBase.replace(/\/$/, "") + "/" });
});
