# UI Theme Adventurer's Desk

## 목표

- renderer v1 의 시각 언어를 `Adventurer's Desk` 로 고정한다.
- "절제된 판타지 게임 UI + 구조 검증용 전문 viewer" 톤을 유지한다.

## Phase 구분

### Phase UI-1

- neutral wireframe 우선
- placeholder silhouette 사용
- 4탭 root surface 고정
- info dock 고정
- installed / equipped / required / preferred 상태 표현
- text contrast 우선

### Phase UI-2

- desk wood / paper / brass / leather / frosted orb / bookshelf / combo card 재질 강화
- hover micro interaction 확장
- finer hierarchy 와 decorative edge treatment 추가

## 레이아웃 기준

- 기준 화면비: `16:10`
- left panel: `25`
- right surface: `70`
- gutter/outer margin budget: `5`
- 탭 전환 시 레이아웃 위치 고정
- diagnostics 는 별도 5번째 탭이 아니라 summary strip 과 info dock 으로 통합

## 색상 토큰

| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--sf-text-primary` | theme-specific | 본문 텍스트 |
| `--sf-surface-frame` | theme-specific | desk frame / chrome surface |
| `--sf-surface-panel` | theme-specific | panel / parchment base |
| `--sf-surface-chip-active` | theme-specific | active chip / tab accent |
| `--sf-state-required-surface` | theme-specific | required 강조 |
| `--sf-state-preferred-surface` | theme-specific | preferred 강조 |
| `--sf-state-invalid-surface` | theme-specific | invalid dependency 강조 |
| `--sf-material-frosted-orb-surface` | theme-specific | skills row accent |
| `--sf-material-bookshelf-spine-surface` | theme-specific | knowledge row accent |
| `--sf-material-leather-folio-surface` | theme-specific | info dock 재질 |

따뜻한 톤 70%, 차가운 톤 30% 비율을 유지한다.

현재 package 는 아래 theme id 를 제공한다.

- `adventurers_desk`
- `adventurers_archive`

## material mapping

- `skills` = frosted glass orbs
- `tools` = belt / attachment slots
- `knowledge` = bookshelf spines
- `workflows` = combo cards
- `diagnostics` = telegram / warning paper
- `info_dock` = leather folio
- `character_panel` = parchment + silhouette plate

Phase UI-1 에서는 shape-first placeholder 로만 표현해도 된다.

## typography

- heading = serif display 계열
- body = humanist sans 계열
- monospace = source ref / code / path 표시 전용
- headline 은 짧고 무게감 있게, 본문은 높은 대비와 촘촘한 정보 밀도 유지

## row 표현 규칙

### skills row

- orb chip / capsule
- `required` 는 brass ring
- `preferred` 는 cool rim

### tools row

- slot plate / attachment rail
- family badge 를 같이 표시

### knowledge row

- spine card / shelf strip
- source ref 와 summary 를 함께 보여준다

### workflows row

- combo card
- dependency_status 를 명확히 표시한다

## info dock 규칙

- 항상 하단에 고정한다.
- selected item detail, preview candidate, diagnostics telegram 을 같은 dock 안에서 섹션으로 전환한다.
- 저장/편집 CTA 는 넣지 않는다.

## diagnostics 배치

- 상단 summary strip 에 warning/error count
- info dock 에 상세 목록
- overview 와 workspace 탭에서 더 강하게 노출

## wireframe 규칙

- 나무 질감은 배경에만 쓴다.
- 서로 다른 재질을 한 카드 안에서 과하게 섞지 않는다.
- 장식은 테두리와 모서리에만 둔다.
- 애니메이션은 미세 hover / focus / reveal 정도로 제한한다.
- icon 보다 텍스트 대비와 상태 레이블을 우선한다.

## placeholder 정책

- character art 는 silhouette / sigil / placeholder plate 로 시작한다.
- tool attachment 은 body 주변에 직접 배치하지 않는다.
- empty family 는 장식적 더미 대신 "available later" 또는 "no installed asset" 으로 드러낸다.

## package split 메모

- theme token 정본은 `packages/theme-adventurers-desk/` 에 둔다.
- renderer structural CSS 는 `packages/renderer-react/` 에 둔다.
- swap mechanism 과 hook contract 는 [THEME_PACKAGE_MODEL.md](./THEME_PACKAGE_MODEL.md) 를 따른다.
