const byPost = new Map<string, string[]>();
const recent: string[] = [];

export function rememberVideos(urls: string[], postCode?: string | null) {
  const unique = Array.from(new Set(urls.filter(Boolean)));
  if (!unique.length) return;
  for (const u of unique) {
    if (!recent.includes(u)) {
      recent.unshift(u);
      if (recent.length > 80) recent.pop();
    }
  }
  if (postCode) {
    const prev = byPost.get(postCode) ?? [];
    byPost.set(postCode, Array.from(new Set([...unique, ...prev])));
  }
}

export function videosForPost(postCode: string | null | undefined): string[] {
  if (postCode && byPost.has(postCode)) return byPost.get(postCode) ?? [];
  return [];
}

export function recentVideos(limit = 5): string[] {
  return recent.slice(0, limit);
}

export function listenForVideoCache() {
  window.addEventListener("message", (ev) => {
    if (ev.source !== window) return;
    const data = ev.data;
    if (!data || data.source !== "sourcer-hook-v1" || data.kind !== "videos") return;
    rememberVideos((data.urls as string[]) ?? [], data.postCode as string | null);
  });
  window.addEventListener("sourcer-video-cache", ((ev: CustomEvent) => {
    const detail = ev.detail as { urls?: string[]; postCode?: string | null };
    rememberVideos(detail.urls ?? [], detail.postCode);
  }) as EventListener);
}

/** Pull mp4 urls from React fiber / props near a node. */
export function findMp4NearElement(root: Element): string[] {
  const found = new Set<string>();
  const walk = (node: Element | null, depth: number) => {
    if (!node || depth > 8) return;
    for (const key of Object.keys(node)) {
      if (!key.startsWith("__reactFiber$") && !key.startsWith("__reactProps$")) continue;
      try {
        const raw = JSON.stringify((node as unknown as Record<string, unknown>)[key]);
        for (const m of raw.matchAll(/https:\\\/\\\/[^"\\]+?\.mp4[^"\\]*/gi)) {
          found.add(m[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&"));
        }
        for (const m of raw.matchAll(/https:\/\/[^"\\]+?\.mp4[^"\\]*/gi)) {
          found.add(m[0].replace(/\\u0026/g, "&"));
        }
      } catch {
        /* circular */
      }
    }
    walk(node.parentElement, depth + 1);
  };
  walk(root, 0);

  // Also scan local HTML snippet
  const html = root.innerHTML || "";
  for (const m of html.matchAll(/https:\\\/\\\/[^"\\]+?\.mp4[^"\\]*/gi)) {
    found.add(m[0].replace(/\\\//g, "/").replace(/\\u0026/g, "&"));
  }
  for (const m of html.matchAll(/https:\/\/[^"'&\s]+?\.mp4[^"'&\s]*/gi)) {
    found.add(m[0]);
  }
  return Array.from(found);
}
