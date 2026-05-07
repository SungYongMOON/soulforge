# Soulforge 2D Dungeon UI Direction v0

## 목적

Soulforge UI 의 시각 방향은 3D 탐험 게임이 아니라 2D 또는 2.5D 판타지 작전판이다.

따뜻한 판타지 톤을 참고하되, 업무 판단과 검증을 방해하지 않는 운영 도구로 유지한다.

## ASSUMPTIONS

- UI 의 기능 중심은 `Guild Hall / Dungeon Map / Mission Board` 다.
- visual theme 는 canonical owner 나 snapshot contract 를 대체하지 않는다.
- `달빛조각사` 같은 따뜻한 판타지 감각은 톤 참고일 뿐, IP/asset 직접 재현 대상이 아니다.

## Direction Statement

Soulforge 는 "업무용 작전판 위에 판타지 던전 언어를 얹은 2D tactical board" 로 보이게 한다.

- 3D world navigation 을 만들지 않는다.
- full-screen canvas adventure 가 아니라 dense-but-readable operation board 로 만든다.
- fantasy 는 icon, map tile, stage badge, material texture, naming, illustration accent 에서만 쓴다.
- 업무 판단에 필요한 status, blocker, freshness, provenance 는 항상 장식보다 우선한다.

## Tone

| 축 | 방향 |
| --- | --- |
| Mood | 따뜻한 판타지, 야간 길드홀, 종이 지도, 목재 책상, 은은한 달빛 |
| Product feel | 업무용 작전판, 반복 사용 가능한 운영 도구 |
| Avoid | 과한 3D, 게임 로비식 과장, hero marketing layout, 장식용 gradient blob |
| Density | dashboard 수준의 밀도, card 남발보다 지도/board/grid 중심 |
| Motion | hover, selected state, freshness pulse 정도의 절제된 feedback |

## 2D / 2.5D Surfaces

| Surface | 표현 |
| --- | --- |
| `Guild Hall` | 오늘의 운영 현황을 보여주는 2D command desk |
| `Dungeon Map` | project dungeon 을 node, path, region, stage marker 로 보여주는 2D map |
| `Dungeon Detail` | stage/floor 를 vertical stack 또는 side-scrolling floor strip 으로 표시 |
| `Mission Board` | quest board / task board 혼합. readiness 와 blocker 가 먼저 보임 |
| `Monster Gate` | intake queue 를 gate lane 으로 표현 |
| `Battle Log` | event timeline / ledger |
| `Bestiary` | monster family cards, taxonomy table |
| `Workshop` | promotion candidate material shelf |
| `Codex` | document shelf + file editor support tool |
| `Diagnostics` | health console. fantasy tone 은 최소화 |

## Visual Grammar

### Map

- dungeon 은 project code 를 가진 map node 다.
- stage/floor 는 dungeon node 내부의 progress ring, floor stack, or lane marker 로 표현한다.
- boss clear 는 stage/floor 끝의 gate badge 로 표현한다.
- blocker 는 붉은 경고 장식이 아니라 작은 status marker 와 clear text 로 표현한다.
- stale snapshot 은 지도 전체를 흐리게 만들기보다 action gate 와 status chip 으로 명확히 표시한다.

### Board

- mission 과 monster 는 같은 카드로 섞지 않는다.
- mission card 는 readiness, workflow/party binding, next action 을 먼저 보여준다.
- monster card 는 source, assignment status, encounter role 을 먼저 보여준다.
- artifact/loot 는 output evidence pointer 로 표현하고 decorative item inventory 로 만들지 않는다.

### Codex

- 파일 브라우저와 editor 는 parchment fantasy editor 가 아니라 readable developer tool 로 유지한다.
- Codex 안에서만 monospace editor, file path, raw tracked document 를 크게 보여준다.
- main board 에서는 file path 를 근거 link 수준으로만 보여준다.

## Palette and Materials

- dominant palette 는 warm moonlit neutral + subdued green/blue accent + amber status 로 둔다.
- 단일 purple/blue gradient, beige-only parchment, dark slate-only dashboard 로 흐르지 않게 한다.
- surface 는 paper, desk, ink, subtle metal border 정도로 제한한다.
- status color 는 semantic 을 우선한다.
  - `fresh/ready` = calm green
  - `stale/warn` = amber
  - `blocked/error` = red
  - `missing/unavailable` = muted gray

## Typography and Icons

- heading 은 판타지 톤을 줄 수 있지만, body/status 는 업무용 가독성을 우선한다.
- icon 은 가능한 한 established icon library 를 사용한다.
- stage, boss, monster 같은 개념은 icon + text label 을 함께 써서 처음 보는 사용자도 해석 가능하게 한다.
- 큰 hero-scale typography 는 landing page 가 아니라면 쓰지 않는다.

## Snapshot Freshness Visual Rule

freshness 는 배경 장식이 아니라 interaction gate 다.

- 모든 main surface 상단에 snapshot status 를 둔다.
- `fresh` 가 아니면 action button 은 disabled 또는 warning-confirm 상태가 된다.
- stale reason 은 `Diagnostics` link 로 이동한다.
- `Dungeon Map`, `Mission Board`, `Monster Gate` 는 freshness 상태가 없으면 "data unavailable" empty state 로 둔다.

## v0에서 만들 것

- 2D command board layout
- `Guild Hall` 첫 화면
- `Dungeon Map` node/card hybrid
- `Dungeon Detail` stage/floor read-only strip
- `Mission Board` readiness cards
- `Monster Gate` intake/assignment summary
- `Codex` 로 file browser/editor 격리
- `Diagnostics` 로 freshness/validate 결과 통합

## v1 이후로 미룰 것

- 3D scene, Three.js dungeon, camera movement
- animated combat scene
- avatar customization
- inventory economy
- rare loot system
- deep bestiary art pack
- realtime collaboration presence
- fully automated battle execution UI

## Existing renderer-web 적용 방향

현재 `renderer-web` 의 CSS 와 React 구조는 "control center shell" 로 남길 수 있다.

적용 순서:

1. `map` pane 전용 styling 을 main layout 기준으로 끌어올린다.
2. file column 은 default visible area 에서 빼고 `Codex` route 에서만 표시한다.
3. `cc-map-*` class 를 `Dungeon Map` 전용 board primitive 로 정리한다.
4. `Preview` 와 `Diagnostics` 는 support screen 으로 유지한다.
5. theme token 은 `theme-adventurers-desk` 를 확장하되, 새 visual direction 이 snapshot gate 를 가리지 않게 한다.

## Guardrails

- fantasy naming 은 업무 판단을 흐리면 안 된다.
- private/raw data 를 "immersive detail" 이라는 이유로 보여주지 않는다.
- map 이 비어 있거나 stale 일 때 장식으로 정상처럼 보이게 하지 않는다.
- file editor 를 첫 화면으로 되돌리지 않는다.
