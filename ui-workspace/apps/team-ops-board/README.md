# 팀 운영 보드 (Team Ops Board MVP 1)

작은 팀의 하루 운영을 위한 로컬 실동작 보드다.
설계 출처는 `_workmeta/system/reports/procedure_capture/team_ops_board_fresh_design_20260602.md` 의
MVP 1 범위이며, `team-ops-board-mockup` (MVP 0, 검증용 목업)의 후속 앱이다.
목업은 동결된 검증 산출물로 그대로 두고, 이 앱이 실사용 후보를 맡는다.

## 확정된 운영 입장 (2026-06-12 owner 결정)

- 진실 저장소: 하이브리드 (Option C). Smartsheet 가 공식 프로젝트 장부로 남고,
  이 보드는 일일 액션, 차단, 회의 결정을 담당한다. 주간 CSV 내보내기로 대조한다.
- 편집 권한: 팀원 직접 수정 + 전 변경 감사 로그 기록.
- 언어: 한국어 우선. 파일/스키마 식별자만 영문 유지.

## MVP 1 범위 (설계서 계약)

- 로컬 영속 저장: 브라우저 localStorage (`team_ops_board_v1`)
- CSV 내보내기/가져오기: UTF-8 BOM, 안정 헤더(영문 식별자), 행 단위 오류 보고
- 필터: 담당자 / 프로젝트 / 상태 / 기간 / 검색
- 감사 추적: 모든 생성·변경·메모가 누가/언제/무엇을(이전→이후)으로 남음
- 일일 기준선: 아침 회의에서 "기준선 고정" 후 하루 동안 기준선 대비 변경 표시
- 백업 파일: 전체 상태 JSON 내려받기/복원

차단(Blocked) 상태는 차단 사유, 대기(Waiting) 상태는 대기 대상 입력이 강제된다.

## 한계 (의도된 것)

- 다중 사용자 동시 편집 아님. 데이터는 각 브라우저에 저장된다.
  공유는 CSV/백업 파일로 하고, 실시간 공유 저장소는 MVP 2 결정 사항이다.
- Smartsheet API 연동 없음 (MVP 2, owner 결정 후).
- 실제 회사 프로젝트 데이터를 repo 에 넣지 않는다. 시드는 공개 안전 표본이다.

## 실행

```bash
npm run ui:team-ops-app:dev       # 개발 서버 (127.0.0.1:4192)
npm run ui:team-ops-app:build     # 빌드
npm run ui:team-ops-app:preview   # 빌드 미리보기 (127.0.0.1:4193)
```

## 검증

```bash
npm run test --workspace @soulforge/team-ops-board   # 코어 로직 node:test (9건)
npm run ui:build                                     # 전체 UI 빌드에 포함됨
```

코어 로직(저장/CSV/기준선/감사)은 의존성 없는 `src/core/*.mjs` 로 분리되어
브라우저 없이도 node 만으로 검증된다.
