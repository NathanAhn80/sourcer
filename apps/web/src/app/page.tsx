"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Item = {
  id: string;
  platform: string;
  url: string;
  authorHandle: string | null;
  authorName: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  mediaUrls: string[];
  views: number | null;
  likes: number | null;
  replies: number | null;
  performanceMultiple: number | null;
  grade: string | null;
  collectedAt: string;
};

const STORAGE_KEY = "sourcer_api_key";

function formatNum(n: number | null | undefined) {
  if (n == null) return "—";
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
  return String(n);
}

export default function HomePage() {
  const [apiKey, setApiKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [platform, setPlatform] = useState<"all" | "threads" | "xiaohongshu">("all");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? "";
    setApiKey(saved);
    setDraftKey(saved);
  }, []);

  const load = useCallback(async () => {
    if (!apiKey) {
      setItems([]);
      setEmail(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!meRes.ok) throw new Error("API 키가 유효하지 않습니다.");
      const me = await meRes.json();
      setEmail(me.data.email);

      const qs = platform === "all" ? "" : `?platform=${platform}`;
      const res = await fetch(`/api/items${qs}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) throw new Error("라이브러리를 불러오지 못했습니다.");
      const json = await res.json();
      setItems(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiKey, platform]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveKey = () => {
    localStorage.setItem(STORAGE_KEY, draftKey.trim());
    setApiKey(draftKey.trim());
  };

  const stats = useMemo(() => {
    const views = items.reduce((s, i) => s + (i.views ?? 0), 0);
    const likes = items.reduce((s, i) => s + (i.likes ?? 0), 0);
    return { count: items.length, views, likes };
  }, [items]);

  return (
    <main>
      <header className="header">
        <div>
          <h1 className="brand">Sourcer</h1>
          <p className="sub">
            Threads · 샤오홍슈 수집 라이브러리
            {email ? ` · ${email}` : ""}
          </p>
        </div>
        <div className="auth-box">
          <label htmlFor="apiKey">API Key (extension popup과 동일)</label>
          <input
            id="apiKey"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            placeholder="sk_..."
            spellCheck={false}
          />
          <button type="button" onClick={saveKey}>
            저장 후 불러오기
          </button>
          {error ? <p className="error">{error}</p> : null}
        </div>
      </header>

      <div className="filters">
        {(
          [
            ["all", "전체"],
            ["threads", "Threads"],
            ["xiaohongshu", "샤오홍슈"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={platform === id ? "active" : ""}
            onClick={() => setPlatform(id)}
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => void load()}>
          새로고침
        </button>
        <span className="stats" style={{ alignSelf: "center", marginLeft: 8 }}>
          {stats.count}건 · 조회 {formatNum(stats.views)} · 좋아요 {formatNum(stats.likes)}
          {loading ? " · 로딩…" : ""}
        </span>
      </div>

      {!apiKey ? (
        <div className="empty">
          API 키를 저장하세요. <code>npm run db:seed -w apps/web</code> 로 데모 키를 발급할 수
          있습니다.
        </div>
      ) : items.length === 0 ? (
        <div className="empty">
          아직 수집된 콘텐츠가 없습니다. Chrome 확장으로 Threads/샤오홍슈에서 수집 버튼을
          눌러보세요.
        </div>
      ) : (
        <div className="grid">
          {items.map((item) => (
            <article key={item.id} className="card">
              {item.thumbnailUrl || item.mediaUrls[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="thumb"
                  src={item.thumbnailUrl || item.mediaUrls[0]}
                  alt=""
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="thumb-fallback">{item.platform}</div>
              )}
              <div className="card-body">
                <div className="meta-row">
                  <span>
                    {item.platform} · @{item.authorHandle || "unknown"}
                  </span>
                  {item.grade ? <span className={`grade ${item.grade}`}>{item.grade}</span> : null}
                </div>
                <p className="caption">{item.caption || "(텍스트 없음)"}</p>
                <div className="stats">
                  {item.views != null ? <span>조회 {formatNum(item.views)}</span> : null}
                  {item.likes != null ? <span>좋아요 {formatNum(item.likes)}</span> : null}
                  {item.performanceMultiple != null ? (
                    <span>×{item.performanceMultiple}</span>
                  ) : null}
                </div>
                <a href={item.url} target="_blank" rel="noreferrer">
                  원문 열기 →
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
