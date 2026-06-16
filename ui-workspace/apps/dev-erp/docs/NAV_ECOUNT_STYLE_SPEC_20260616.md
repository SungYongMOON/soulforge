# 왼쪽 네비 — 사내 ERP(ecount) 스타일 비교 스펙 (2026-06-16)

> owner 지시로 ecount 좌측 메뉴 트리의 실제 CSS를 브라우저에서 직접 조회(computed style)해
> 전 요소를 우리 dev-erp 네비와 나란히 비교한 정본 스펙. 어긋나면 이 표를 기준으로 맞춘다.
> 측정 방법: claude-in-chrome `javascript_tool` 로 ecount 페이지 `getComputedStyle` 조회.
> (메뉴명·업무 데이터는 보지 않고, 좌측 트리 CSS만.)

## 비교표 (ecount 실측 ↔ dev-erp)

| 요소 | 속성 | ecount(실측) | dev-erp | 상태 |
|---|---|---|---|---|
| **분류(L3) 비활성** | font-size | 12px | 12px(확정) | ✓ |
| | font-weight | 400 | 400(수정) | ✓ |
| | color | #142444 | var(--text) | ~ |
| | row height | 26px | ~26px | ✓ |
| **분류(L3) 활성** | font-weight | 700 | 700(수정) | ✓ |
| | color | #19358c | #19358c(수정) | ✓ |
| | background | rgba(31,72,212,.13) | rgba(31,72,212,.13) | ✓ |
| | padding-left(쉐브론칸) | 22px | ~22px | ✓ |
| **쉐브론** | 모양 | › 접힘 / ⌄ 펼침(회전) | › / ⌄(회전) | ✓ |
| | color | 회색 | var(--muted) | ✓ |
| **항목(L4) 비활성** | font-size | 12px | 12px | ✓ |
| | font-weight | 400 | 400 | ✓ |
| | color | #6c757d(회색) | #6c757d(수정) | ✓ |
| **항목(L4) 활성** | font-size | 12px | 12px | ✓ |
| | font-weight | 700 | 700 | ✓ |
| | color | #19358c | #19358c | ✓ |
| **선택 점(dot)** | size | 5px | 5px | ✓ |
| | color | #19358c | #19358c | ✓ |
| | position | left:-3px(레일 위 중앙) | left:-3px | ✓ |
| **레일(줄)** | 구현 | 리프 ul `border-left` | nav-items `::before` | 동등 |
| | width | 1px | 1px | ✓ |
| | color | #e9ecef | #e9ecef | ✓ |
| **항목-텍스트 들여쓰기** | 점→텍스트 간격 | ~9px | 9px | ✓ |
| | 전 섹션 동일 | — | 동일(측정 완전일치) | ✓ |

## 결정 완료

- **분류(L3) 글자 크기**: owner 2026-06-16 결정 → **ecount처럼 12px 통일**. 분류·항목 모두 12px,
  위계는 굵기(비활성 400/활성 700)+바탕색+들여쓰기로. → 전 요소 ecount 일치 완료.

## 상단바 구조 비교 (Row 0/1/2) — 2026-06-16 추가

owner 지적: 우리는 1분류와 바로가기가 같은 행이라 바로가기를 많이 못 넣음. ecount는 3행 분리.

| 행 | ecount | dev-erp(수정 전) | dev-erp(수정 후) |
|---|---|---|---|
| **Row 0 (최상단)** | 메뉴검색 + SITE MAP + 바로가기 단축메뉴(전폭) | (없음) | `.util-bar`: 검색 + ⌘K + 바로가기(favBar 전폭) + ☆등록 + 수집시각 |
| **Row 1** | 로고 + 1분류(재고/회계/관리…) + 우측 유틸 아이콘 | `.brand-bar`: 로고 + 1분류 + **바로가기·검색·아이콘 전부**(혼잡) | `.brand-bar`: 로고 + 1분류 + 우측 아이콘(검색·바로가기 분리됨) |
| **Row 2** | 2분류 밑줄 탭(선택=파란 밑줄+굵게) | `.sub-bar`: 튀어나온 박스 탭 | `.sub-bar`: ECount식 밑줄 탭(선택=#19358c 밑줄 2px+700) |

- 핵심 변경: 바로가기·검색을 1분류 행에서 떼어 **별도 최상단 행(Row 0)** 으로 → 바로가기 공간 전폭 확보.
- grid: `"util" "brand" "subbar" "side main"` 4행으로 변경(홈/모바일 포함).

## 메모

- 색상: 네이비 **#19358c**(rgb 25,53,140) = ecount 선택색. 이전 #1d5fc4(밝은 파랑)·#195a8e(틸)는 오류였음.
- 프로젝트 나비는 과제번호+과제명 2행이라 ecount 단일행과 구조가 다름(owner 설계). 색·굵기·점·레일은 공통 적용.
- 이 스펙은 공유 클래스(.nav-sub-head/.nav-items)에 적용돼 프로젝트·업무·자원·지식 전 섹션 동일.
