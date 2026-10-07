export type CollectPayload = {
  platform: "threads" | "xiaohongshu";
  externalId: string;
  url: string;
  authorHandle?: string | null;
  authorName?: string | null;
  caption?: string | null;
  thumbnailUrl?: string | null;
  mediaUrls?: string[];
  views?: number | null;
  likes?: number | null;
  replies?: number | null;
  reposts?: number | null;
  followers?: number | null;
  avgLikes?: number | null;
  metrics?: Record<string, unknown>;
};

export type Settings = {
  apiBase: string;
  apiKey: string;
};

const DEFAULTS: Settings = {
  apiBase: "http://localhost:3456",
  apiKey: "",
};

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(["apiBase", "apiKey"]);
  return {
    apiBase: (stored.apiBase as string) || DEFAULTS.apiBase,
    apiKey: (stored.apiKey as string) || DEFAULTS.apiKey,
  };
}

export async function saveSettings(partial: Partial<Settings>): Promise<void> {
  await chrome.storage.sync.set(partial);
}

export async function collectItem(payload: CollectPayload): Promise<{ ok: boolean; message: string }> {
  const { apiBase, apiKey } = await getSettings();
  if (!apiKey) {
    return { ok: false, message: "확장 팝업에 API 키를 먼저 저장하세요." };
  }
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, message: `수집 실패 (${res.status}): ${text.slice(0, 120)}` };
    }
    return { ok: true, message: "라이브러리에 저장됨" };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "네트워크 오류",
    };
  }
}
