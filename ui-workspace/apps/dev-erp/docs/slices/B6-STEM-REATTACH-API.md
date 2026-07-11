# B6-STEM-REATTACH-API — 줄기 조작(드래그 재부착) 서버 계약 + API

- status: done (구현·테스트 완료, B8 소비 중 — 2026-07-11 'ready' stale 정정)
- execution_owner: **erp_surface_thread_claude** (server.mjs·src/store.mjs — API/store 만)
- UI 소비자: 줄기 그래프 렌더 레인(현재 마인드맵식 확장 진행 중인 세션) — 이 문서의 계약을 소비.
  **그래프 UI 자체(app.js 줄기 렌더러)는 이 패킷 범위 밖** — 동시편집 방지 분업(2026-07-05).
- 정본: `STEM-V2-ONTOLOGY.md` "조작면 원칙" — 드래그 = 사람 확정 = 링크 1개 변경 + 이벤트.

## 목적 (1줄)

owner 가 그래프에서 노드를 끌어 옮기면 데이터(링크)가 그대로 바뀌는 것 — 그 서버측 절반
(API·store·이벤트·장부 write-through·교정 피드백)을 제공한다.

## API 계약 (드래그 → 호출 매핑)

| 드래그 | API | 동작 |
| --- | --- | --- |
| 할일 → 다른 골격 가지 | `POST /api/items/reanchor` `{id, anchor_stage_code?|stage_id?|link_kind?+link_ref?}` | anchor 교체 + `item_reanchor` 이벤트(used_refs=[stem_drag]) + autosync write-through |
| 할일 → 이력줄기 회차 | `POST /api/items/set-origin-occurrence` `{id, series_key, occurrence_key}` | `core_item.origin_occurrence_ref` 기록(ALTER 1종, `series:<key>#<occurrence>`) + 이벤트 |
| 메일 → 다른 작업줄기 | `POST /api/mail/reattach` `{mail_id, item_id}` | 교정 이벤트 `mail_reattach`(from=기존 귀속, to=item) + 교정 영수증 행(엔진 학습 피드백) — 스레드 키 자체는 불변(원본 보존), 귀속 오버라이드로 기록 |
| 되돌리기 | 각 이벤트의 from/to 로 역호출 | append-only — UPDATE 삭제 없음 |

- 권한: 로그인 member 이상(자기 교정 허용), 계정 0 파일럿은 종전 규칙. actor 는 세션 강제(B-1 준수).
- 멱등: 같은 대상·같은 목적지 재호출 = no-op(200, unchanged:true).
- 반환: 변경 후 행 전체(SELECT *) — UI 가 재조회 없이 반영.

## 검증된 사실

- anchor 필드·검증은 confirmItem 에 기존재(store.mjs — WORK_TYPES/LINK_KINDS/stage 존재 검증 재사용).
- 유사 선례: `setMailProject`(메일 이동 시 연결 할일 동행), reassign(`/api/items/assign`).
- 교정 영수증 착지면: `_workmeta/<code>/reports/haengbogwan_mail_receipts/` appendMailReceipts
  (reason=`human_reattach:<item>` 신설 — 멱등 receipt_key).
- B-1 로 POST 이벤트 actor 위조 차단 기존재 — 이 API 들도 같은 강제 경로.

## 검사 방법

- node:test: reanchor 유효/무효 anchor, set-origin-occurrence ALTER 멱등, mail_reattach
  교정 이벤트 from/to + 영수증 행 + 멱등 no-op, member 권한, 파일럿 모드 보존.
- 전건 직렬 green + verify_gate ≥1.

## 완료 기준 (1문장)

그래프 UI 가 이 3개 API 만으로 "끌어서 옮기면 데이터가 바뀌고 이벤트가 남는" 것을
구현할 수 있으면(계약 문서 + 동작 API + 테스트) 완료.
