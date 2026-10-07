# Feature Inventory (MVP Spec)

Sources: HypeDuck public guide/store listing + **live screenshots** (Threads feed + download menu, Xiaohongshu explore analysis).

## Platform matrix (MVP)

| Platform | Analysis overlay | Collect to library | Media download |
| --- | --- | --- | --- |
| Threads | Yes | Yes | Yes |
| Xiaohongshu | Yes | Optional single save | Yes |

## Threads — confirmed UI (screenshots)

### Left metric stack (beside each post)
| Field | Example | Formula (MVP) |
| --- | --- | --- |
| Grade + multiple | `폭발 166.5배` | grade from `views / followers` |
| 조회 | `9.4만` | page views |
| 팔로워 | `567` | author followers when visible |
| 참여율 | `1.1%` | `(likes+replies+reposts) / views * 100` |
| 시간당 조회 | `1,978` | `views / hours_since_post` |
| 확산 | `4.9` | `log10(views)` (proxy score) |

### Right keyword chips
- Extract tokens from caption (KO/ZH/EN), show as searchable chips (opens Threads search).

### Download / action menu
| Action | MVP |
| --- | --- |
| 영상 다운로드 | Include |
| 사진 N장 다운로드 | Include |
| 링크 복사 | Include |
| 텍스트 복사 | Include |
| 스레드 텍스트 저장 (라이브러리 수집) | Include |
| 댓글 CSV / Excel | Stub / best-effort if comments in DOM |
| 해시(키워드) 표시 토글 | Include |

### Sidebar
- Extension popup/settings for API key (Chrome side panel later).

## Xiaohongshu — confirmed UI (screenshots)

### Explore analysis panel (top)
| Field | Example |
| --- | --- |
| 노트 수 | 35 |
| 팬 로열티 | — (defer) |
| 평소 좋아요 | session baseline / median proxy |
| 평균 좋아요 | mean of visible likes |
| 최고 성과배수 | max likes/baseline |
| Grade filters | 전체 / 폭발 / 강력 / 우수 / 보통 / 약함 (+ counts) |
| Sort | 성과배수 높은순 |
| Top 10 list | title, likes, multiple, grade |

### Card overlays
| Field | Example |
| --- | --- |
| Grade + multiple | `폭발 16.3배` |
| 좋아요 | `좋아요 6.8만` |
| 영상 badge | when video present |
| Download | media download button |

### XHS grade thresholds (likes / baseline)
- 폭발 ≥10 · 강력 ≥5 · 우수 ≥2 · 보통 ≥1 · 약함 &lt;1

## Deferred
- Auto-scan, AI rewrite, comment deep export, TSS publish, Instagram/TikTok
