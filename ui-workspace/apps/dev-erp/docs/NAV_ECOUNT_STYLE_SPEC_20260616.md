# 왼쪽 네비 — 사내 ERP(ecount) 스타일 비교 스펙 (2026-06-16)

> owner 지시로 ecount 좌측 메뉴 트리의 실제 CSS를 브라우저에서 직접 조회(computed style)해
> 전 요소를 우리 dev-erp 네비와 나란히 비교한 정본 스펙. 어긋나면 이 표를 기준으로 맞춘다.
> 측정 방법: claude-in-chrome `javascript_tool` 로 ecount 페이지 `getComputedStyle` 조회.
> (메뉴명·업무 데이터는 보지 않고, 좌측 트리 CSS만.)

## 비교표 (ecount 실측 ↔ dev-erp)

| 요소 | 속성 | ecount(실측) | dev-erp | 상태 |
|---|---|---|---|---|
| **분류(L3) 비활성** | font-size | 12px | 14px | ⚠ 결정 |
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

## 미결정 1건 (owner 판단 필요)

- **분류(L3) 글자 크기**: ecount는 분류·항목이 **둘 다 12px**(위계는 들여쓰기+굵기+바탕색으로).
  현재 dev-erp 분류는 14px(전에 owner가 "대제목 더 크게" 요청). 
  → ecount처럼 **12px 통일**할지, **14px 유지**할지 owner 결정.

## 메모

- 색상: 네이비 **#19358c**(rgb 25,53,140) = ecount 선택색. 이전 #1d5fc4(밝은 파랑)·#195a8e(틸)는 오류였음.
- 프로젝트 나비는 과제번호+과제명 2행이라 ecount 단일행과 구조가 다름(owner 설계). 색·굵기·점·레일은 공통 적용.
- 이 스펙은 공유 클래스(.nav-sub-head/.nav-items)에 적용돼 프로젝트·업무·자원·지식 전 섹션 동일.
