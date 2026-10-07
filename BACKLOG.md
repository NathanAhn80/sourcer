# Post-MVP Backlog

Priorities after Threads + Xiaohongshu overlay / collect / download land. Re-rank after real usage + optional live screenshots.

## P1 — Core polish
- [x] Align overlay UX to live HypeDuck screenshots (Threads stack + XHS explore panel)
- [ ] DOM selectors hardened against Threads/XHS layout changes (views/followers often in GraphQL, not DOM)
- [ ] Intercept page GraphQL/XHR for reliable views + follower counts (session-only)
- [ ] Follower count fetch on Threads profile hover/detail for accurate multiples
- [ ] Xiaohongshu video URL resolution (CDN playable mp4, not just poster)
- [ ] Comment export with real reply scraping (CSV/Excel currently post meta only)
- [ ] Chrome side panel (login/status) matching HypeDuck right rail
- [ ] Export library CSV / JSON from dashboard
- [ ] Local-only collect queue when API offline

## P2 — Product features (HypeDuck-adjacent)
- [ ] Threads auto-scan (batch feed walk + threshold filter)
- [ ] AI analysis + script/caption rewrite (credit model optional)
- [ ] Persona / tone profiles
- [ ] Scheduled publish — integrate with existing TSS desktop app
- [ ] Search report persistence (keyword → snapshot history)

## P3 — More platforms
- [ ] Instagram Reels overlays + download
- [ ] TikTok / Douyin / YouTube Shorts
- [ ] Coupang / shopping affiliate helpers

## P4 — Ops
- [ ] Postgres for production
- [ ] Proper auth (magic link / OAuth) instead of long-lived API keys
- [ ] Chrome Web Store packaging + privacy policy
- [ ] Rate limits and audit log for collect API

## Explicitly out of scope forever (unless product decision changes)
- Reverse-engineering HypeDuck extension binaries
- Unattended server-side crawling of Threads/XHS without a user session
