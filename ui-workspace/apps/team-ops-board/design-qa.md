# Soulforge Workspace Board — Design QA

## 비교 기준

- 원본 시안
  - `C:/Users/user/.codex/generated_images/019fc80b-487e-7182-9fb0-27ab6c269518/exec-96a78023-51fa-4c7d-9a89-075b5b2c44e4.png` — 실시간 현황
  - `C:/Users/user/.codex/generated_images/019fc80b-487e-7182-9fb0-27ab6c269518/exec-927ecfca-9358-493e-a1a0-4eaad58948d1.png` — 조직 트리
  - `C:/Users/user/.codex/generated_images/019fc80b-487e-7182-9fb0-27ab6c269518/exec-99d6e363-af02-4e8a-ba5f-1868fd75d847.png` — 책임 흐름
- 저장된 브라우저 증거
  - `evidence/realtime-desktop-1487x1058.png`
  - `evidence/organization-tree-desktop-1487x1058.png`
  - `evidence/organization-flow-desktop-1487x1058.png`
  - `evidence/realtime-mobile-390x844.png`
  - `evidence/organization-tree-mobile-390x844.png`
  - `evidence/organization-flow-mobile-390x844.png`
- 최신 브라우저 대조: 2026-08-04, 로컬 `http://127.0.0.1:4192/`, 실제 exact-ID 등록부와 lifecycle 투영

조직도와 실시간 현황은 각각 원본 시안과 최신 구현을 같은 1487 × 1058 viewport에서 한 번에 나란히 열어 비교했다. 최신 조직도는 `Soulforge → 회사 → CEO → 직속 팀장·조직`을 왼쪽에서 오른쪽으로 읽는 전용 가로 캔버스로 바꿨고, 현재 작업 패널은 별도 영역으로 유지했다.

시안의 정보 구조와 밀도는 유지하되, 예시 인물·예시 수치·더미 TASK는 사용하지 않는다. 화면 값은 로컬 등록부의 정확한 `thread_id`, 명시적 `parent_thread_id`, 실제 lifecycle/결과 게이트, AI Usage Meter의 metadata-only 집계만 사용한다.

## 최신 화면 검증

### 데스크톱

- 관측 viewport: 960 × 1272
- 문서 가로 overflow: 0
- 조직도 전용 가로 canvas: client 888px / content 1240px / `overflow-x: auto`
- 회사 외곽 프레임: 2
- 두 회사 외곽 프레임: 각각 958 × 378px
- 정확한 CEO 노드: 2
- 개발1팀 동급 프로젝트 팀장: 10
- 중복 `development1_kvds`·`development1_projects` 그룹 카드: 0
- 선택 KVDS 팀장의 정확한 직속 하위: 16
  - fresh 책임자 15
  - 정확한 TASK 1
- 실시간 상세 열은 `실행 중 → 입력·승인 대기 → 종료·결과 확인` 순서로 같은 행에 배치된다.
  - 시작 x 좌표: 21 / 322 / 623px
  - 공통 y 좌표: 444px
- 실행 중인 카드만 녹색 테두리·좌측 강조선으로 표시된다.
- 조직도는 회사 외곽 안에서 CEO 다음 오른쪽 직속 계층으로 프로젝트 팀장·개별 조직이 이어진다.
- 책임 흐름 표는 회사 / 조직 / 팀장·책임 thread / 실행·결과 상태의 4열이며 내부·문서 가로 overflow가 없다.

### 모바일

- 관측 viewport: 390 × 844
- 문서 가로 overflow: 0
- 회사 프레임: 1열
- 프로젝트 팀장: 1열
- 선택 팀장의 책임자·TASK: 1열
- 실시간 세 상태 상세: 1열 순차 배치
- 임시 viewport override는 검증 직후 해제했다.

### 상호작용과 문구

- 기본 화면, 조직도, 업무 현황·이력 전환이 동작한다.
- 조직도 안의 조직 트리와 책임 흐름 전환이 동작한다.
- KVDS 팀장을 선택하면 `parent_thread_id`가 정확히 일치하는 하위 항목만 나타난다.
- `읽었음 · 현황에서 숨기기`는 Owner 대상 결과 카드에만 나타난다.
- 보조 문구는 이 동작이 현재 브라우저의 `localStorage`만 바꾸고 Codex TASK의 완료·보관·상태를 바꾸지 않는다고 명시한다.
- 브라우저 console warning/error: 없음.

## 시각 판단

P0/P1/P2 시각 결함은 남아 있지 않다.

- 회사가 바깥 테두리이며 CEO가 그 안의 첫 노드다.
- 회사·CEO·직속 팀장/조직은 왼쪽에서 오른쪽으로 이어지고, 폭이 부족할 때는 조직도 전용 영역만 가로 스크롤된다.
- 두 회사는 데스크톱에서 같은 폭과 높이로 정렬된다.
- KVDS와 다른 프로젝트 팀장은 같은 높이의 동급 계층이다.
- `KVDS 개발 조직`과 `개발1팀 프로젝트`를 별도 하위 그룹 카드로 다시 그리지 않아 프로젝트 팀장 계층과의 중복을 없앴다. 등록 데이터와 상세 drill-down은 유지한다.
- 긴 프로젝트 목록은 compact grid와 말줄임을 사용하고, 모바일에서는 1열로 바뀐다.
- 실시간 상세는 데스크톱 3열, 모바일 1열이며 세 상태 의미를 섞지 않는다.
- 실제 실행 중인 조직만 녹색으로 강조되어 정지·관측 불가와 즉시 구분된다.
- 상태 색은 실행 중=녹색, 입력·승인 대기=주황, Owner 결과=파랑, 정지·관측 불가=회색으로 일관된다.
- 아이콘은 기존 Lucide 라이브러리를 사용하며 임의 SVG·이모지·가짜 자산을 추가하지 않았다.

## 의도된 운영 경계

- 제목, 파란 점, idle, 경과 시간, 비슷한 이름으로 실행·완료·상하 관계를 추정하지 않는다.
- exact 현재 등록 ID에 명시적 active lifecycle이 있을 때만 `실행 중`이다.
- Stop/idle은 결과나 Owner 확인을 만들지 않는다.
- Owner에게 직접 전달된 명시 result gate만 기본 결과 확인 영역에 나타난다. 책임자와 TASK 결과는 상위 thread가 받으며 Owner 기본 현황을 늘리지 않는다.
- 등록은 Board 가시성만 부여한다. route authority, 실행 권한, ERP 상태 writer를 만들지 않는다.
- Codex 앱 재시작 뒤 공식 app-server의 한 응답 줄이 128 KiB를 넘는 실제 상황을 재현했고, 유한한 줄 제한을 256 KiB로 조정했다. 150 KiB 응답 회귀 테스트를 추가했으며 raw 필드는 여전히 투영 전에 제거된다.

## 자동 검증

- Board deterministic tests: 109/109 PASS
- Board typecheck: PASS
- Board production build: PASS
- AI Usage Meter deterministic tests: 70/70 PASS
- 전체 UI workspace done-check: PASS
- canon validation: 137 checked, 0 errors, 0 warnings
- `git diff --check`: PASS
- enrollment registry validate: valid, 75 entries, current 59, emergency disable off

## 2026-08-05 compact organization and detail overlay follow-up

- 1222 × 730 회사 제목줄 후속 검증
  - 회사 설명 header는 회사 외곽 상단 전체 폭 `906 × 36px`로 이동했다.
  - CEO node는 회사 외곽 왼쪽에서 `13px` 안쪽(`188 × 76px`)부터 시작한다.
  - CEO 직속 tier는 CEO 오른쪽에서 시작하며 두 회사 외곽 높이는 각각 `358px`로 동일하다.
  - 문서 가로 overflow: 0 (`clientWidth 1207px`, `scrollWidth 1207px`)
- 검증 viewport: 792 × 882
  - 문서 가로 overflow: 0 (`clientWidth 777px`, `scrollWidth 777px`)
  - 조직도 전용 가로 canvas: `clientWidth 720px`, `scrollWidth 940px`
  - `Soulforge 조직` root node: 0
  - 회사 외곽 frame: 2개, 각각 `908 × 374px`
  - 회사명 node: 각각 `158 × 72px`
  - CEO node: 각각 `188 × 76px`
  - active highlight node: 2
  - 중복 `development1_kvds` / `development1_projects` group card: 각각 0
- 실시간 세 열 header는 같은 `y=568px`, 같은 `height=46px`에서 시작한다.
  - Owner result 설명은 `sr-only` 의미 정보로 유지하며 화면 레이아웃에는 1 × 1px만 차지한다.
- thread 상세는 `position: fixed`, `360px` 우측 overlay로 열리며 Board 본문 폭 `749px`를 줄이지 않는다.
- 390 × 844 모바일에서 문서와 조직도 canvas 가로 overflow는 0이다.
  - 회사명 header는 전체 폭 `296 × 48px`, CEO node는 `276 × 68px`로 쌓인다.
  - 상세는 backdrop이 있는 `role=dialog`, `aria-modal=true`이며 `354 × 675px`로 열린다.
  - 조직도에서 KVDS manager를 선택하면 선택 강조만 적용되고 backdrop/detail은 각각 0개라 화면을 막지 않는다.
- Board deterministic tests: 110/110 PASS
- Board typecheck: PASS
- Board production build: PASS

## 판정

구현 및 Design QA: PASS. 가로 조직도·중복 그룹 제거·실시간 3열 delta는 구현자와 분리된 fresh MAX independent reviewer가 ACCEPT했다. live enrollment는 75개 등록, current 59개, 실제 관측 55개, adapter `ready`이며 관측되지 않은 4개는 fail-safe로 추정하지 않는다.

## 2026-08-05 프로젝트별 팀장·책임자 구조 후속 검증

### 비교 증거

- source visual truth: 이 turn의 548 × 882 Browser Comment 1 스크린샷과 “프로젝트별 분리, 작은 팀장 카드, 오른쪽 책임자” Owner 주석
- rendered implementation:
  - `evidence/organization-project-hierarchy-desktop-1280x900.png`
  - `evidence/organization-project-hierarchy-mobile-548x882.png`
- theme/state: dark, 조직도 → 조직 트리, exact local enrollment
- density normalization: source 548 × 882px / implementation 548 × 882px, CSS viewport 548 × 882, device scale 1
- full-view comparison: 회사·CEO·프로젝트 lane과 오른쪽 현재 작업 패널의 전체 비율을 같은 조직 트리 상태로 대조했다.
- focused comparison: source에서 선택된 `프로젝트` lane과 구현의 프로젝트별 team-lead/responsibility row를 같은 548px 폭으로 대조했다.

### 비교 이력

1. P1: 9개 프로젝트 팀장을 하나의 큰 lane 안에서 동일 카드로 나열해 프로젝트 경계와 직속 책임자 열이 보이지 않았다.
   - 수정: exact root manager마다 독립 `organization-project-card`를 만들고, 왼쪽 팀장과 오른쪽 직속 책임자 영역을 분리했다.
2. P2: 첫 반응형 구현에서 548px 팀장 카드의 상태 문구가 세로로 눌렸다.
   - 수정: 좁은 화면의 팀장·책임자 카드에 명시적 grid area를 적용하고 chevron을 숨겨 두 영역의 가로 흐름을 유지했다.
3. post-fix evidence:
   - 1280 × 900: 프로젝트 카드 660 × 80px, 팀장 220 × 64px, 책임자 영역 416 × 64px, 문서·회사 가로 overflow 0.
   - 548 × 882: 프로젝트 카드 412 × 80px, 팀장 175 × 64px, 책임자 영역 220 × 64px, 문서·카드 가로 overflow 0.
   - CEO는 첫 회사에서 188 × 76px로 프로젝트 lane 상단과 함께 보이며, 긴 프로젝트 목록의 세로 중앙으로 밀리지 않는다.
   - 실제 등록 데이터에서 `development1_projects`의 9개 root manager는 모두 exact 직속 책임자 0건이다. UI는 이를 추정해 채우지 않고 각 프로젝트에 `정확한 parent_thread_id로 연결된 직속 책임자가 없습니다.`라고 표시한다.
   - 같은 동적 projection으로 KVDS의 exact 직속 책임자 15개와 AX의 exact 직속 책임자 5개가 책임자 카드로 표시된다.

### 필수 fidelity surface

- fonts/typography: 기존 Board 글꼴·크기·말줄임을 유지하고 좁은 화면 세로 눌림을 제거했다.
- spacing/layout rhythm: 프로젝트별 7px border container, 8px row gap, 220px team-lead column과 유동 responsibility column을 사용한다.
- colors/tokens: 기존 teal border, green active, gray unavailable 상태 토큰을 그대로 재사용한다.
- image/icon quality: 신규 raster/CSS/SVG 자산은 없고 기존 Lucide `CircleDot`, `UsersRound`, `ChevronRight`만 사용한다.
- copy/content: 팀장과 책임자를 서로 다른 label로 표시하고, 미등록 관계는 exact `parent_thread_id` 부재로 명시한다.

### 상호작용·회귀

- 조직도 탭 전환과 프로젝트 manager 버튼은 실제 브라우저에서 동작했다.
- project/responsibility 버튼은 기존 exact thread 선택·상세 범위를 재사용한다.
- 브라우저 console warning/error: 0.
- focused live-thread tests: 90/90 PASS.
- typecheck: PASS.
- production build: PASS.

P0/P1/P2 잔여 결함: 없음.

final result: passed

## 2026-08-06 operational topology follow-up

### Visual target and evidence

- Reference: `C:/Users/user/AppData/Local/Temp/codex-clipboard-f840a618-92ec-40ac-a0c8-42aaa3b7a957.png`
- Reference intent: dark topology canvas, compact nodes, visible parent/child connectors, and state-first scanning. The Owner explicitly rejected a free-form radial graph; the accepted layout is a fixed small manager anchor with its first exact responsibility immediately to the right, later responsibilities stacked below, and exact TASK descendants one column farther right.
- Rendered desktop: `evidence/organization-operational-topology-desktop-1280x900.png`
- Rendered narrow viewport: `evidence/organization-operational-topology-mobile-548x882.png`
- Combined comparison: `evidence/organization-operational-topology-comparison.png`

### Browser verification

- Desktop viewport: 1280 x 900. Current exact projection rendered 17 topology nodes and 15 connector edges.
- Root manager nodes measured 165 x 64 px. The first six observed manager anchors shared x=234 and y positions 311, 397, 482, 568, 654, and 739, confirming fixed size and vertical stacking.
- Narrow viewport: 548 x 882. Document `clientWidth` and `scrollWidth` both measured 533 px; no document-level horizontal overflow was introduced. The topology remained available inside its fixed-height pan surface.
- Keyboard traversal retained a visible 2 px outline and the existing inset focus treatment on the organization navigation control.
- Console errors: 0. One React Flow node-type identity warning was observed after hot reload; the node type map is module-scoped and deterministic build/test output is clean.
- The current live enrollment had no eligible transient child responsibility/TASK nodes during capture. No dummy production data was added. Deterministic tests cover exact active, waiting, parent-result, Owner-result, acknowledged, stopped, unknown-context, duplicate, cross-group, and cycle boundaries.

### Layout and state acceptance

- Company/CEO and exact root-manager anchors remain compact and stable.
- Exact transient responsibility nodes occupy the column immediately right of their manager. The first child aligns to the manager row; additional children stack below and increase only that manager lane height, pushing the following manager lane down.
- Exact TASK descendants use the next right-hand column and the same vertical stacking rule.
- Connector edges are smooth orthogonal branches (`smoothstep`) rather than a radial or free-form curve graph.
- Active, waiting/parent-result, and Owner-result states use green, amber, and blue respectively. Acknowledged or closed transient nodes are omitted from the live topology while retained history remains outside the topology projection.
- Unknown or stopped nodes do not appear as live work. An exact unobserved ancestor is shown neutrally only when it is required to connect an eligible visible descendant.

P0/P1/P2 visual defects: none observed in the captured current state.

- Final Board deterministic suite: 156/156 PASS.
- Typecheck: PASS.
- Production build: PASS (1759 modules transformed).
- Fresh independent re-review after the terminal/acknowledgement ancestor fix: focused 96/96 PASS, ACCEPT.

final result: passed
