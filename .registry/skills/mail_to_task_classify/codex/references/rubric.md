# 메일→할일 분류 계약 (LLM candidates 규약)

`mail_to_task_ledger.mjs --candidates <json>` 가 받는 후보 JSON 의 작성 규약. LLM(Codex 등)이 채운다.
**코어는 LLM 0%** — "어떤 메일이 할일인가 + 필드"는 전적으로 이 계약에 따른 LLM 판단이 결정한다.

## 입력 (결정적, 메타데이터만)

```
node ui-workspace/apps/dev-erp/tools/mail_to_task_pending.mjs --workmeta <repo>/_workmeta [--project P26-014] --json
```
→ 프로젝트별 **아직 할일로 변환 안 된 메일**만 반환:
`{ history_key, subject, from, received_at, mailbox, source_id, due_hint }`.
**본문·첨부·secret 은 입력에 없다.** 제목/발신자/메일함/시각만으로 판단한다. 추가 본문 열람 금지.

## 출력 candidates.json

`{ "<history_key>": <후보> | [<후보>, ...] }`. 배열이면 한 메일이 여러 할일로 split(`mailtask:<key>:1`, `:2`).

### 포함 규칙 (가장 중요)
- **사람/팀의 액션이 필요한 메일만 포함**한다. 견적요청·검토요청·작성요청·결정요청·일정조율·발주 등.
- 순수 참고(FYI)·뉴스레터·자동알림·광고·"수신확인"처럼 **할 일이 없는 메일은 candidates 에서 생략**한다(키 자체를 넣지 않음).
- **애매하면 버리지 말고** 보수적으로 `work_type: "review"` 할일로 포함하고 `route_confidence: "review"` 로 둔다. 진짜 일을 놓치는 것보다 검토 1건이 낫다.

### 후보 필드
| 필드 | 필수 | 값 |
|------|------|-----|
| `work_type` | open 되려면 필수 | `answer`·`review`·`author`·`revise`·`purchase`·`verify`·`decide`·`schedule` 중 하나(아래 매핑) |
| `completion_criteria` | open 되려면 필수 | "무엇을 하면 끝인가" 한 문장(구체적으로) |
| `title` | 권장 | 짧은 할일명. 비우면 메일 제목 사용 |
| `due` | 선택 | `YYYY-MM-DD`. 비우면 엔진이 제목/메일에서 기한 추출 시도 |
| `suggested_assignee_ref` | 선택 | 제안 담당(확정 아님) + `assignee_confidence`(low/medium/high) + `assignee_reason` |
| `assignee_ref` | 선택 | **확정** 담당. 명백할 때만. 보통은 suggested 로 두고 owner 가 확정 |
| `route_candidate` | 선택 | 프로젝트 코드(기본=현재 프로젝트) |
| `route_confidence` | 선택 | `exact`(확실)·`review`(검토필요)·`none`. 기본 review |
| `route_reason`,`next_action`,`required_role`,`required_capability` | 선택 | 근거/후속/필요역할 |

### work_type 매핑
- `answer` 질문·회신·견적요청에 답해야 함 · `review` 검토·확인·피드백 요청 · `author` 문서/산출물 작성
- `revise` 수정·보완 요청 · `purchase` 구매·발주·견적 진행 · `verify` 시험·검증 · `decide` 의사결정 · `schedule` 일정·미팅

### open vs 검토대기(unclassified)
`mail_to_task_ledger --auto-open` + (SE단계[`--db`/`--stage`] + `work_type` + `completion_criteria` 셋 다 있음) → **status=open(즉시 할일)**.
하나라도 없으면 `unclassified`(검토함에 격리, 할일 목록 미표시). **→ 진짜 할일이면 work_type·completion_criteria 를 반드시 채워라.**

## 적용 + 검증

```
# 1) 변환(프로젝트별, SE단계는 --db 로 프로젝트 현재상태에서 읽음)
node ui-workspace/apps/dev-erp/tools/mail_to_task_ledger.mjs \
  --project P26-014 --candidates cand.json --db ui-workspace/apps/dev-erp/data/dev-erp.db --auto-open --apply
# 2) ERP 반영: DEV_ERP_AUTOSYNC=1 이면 할일_장부 변경을 ERP 가 자동 import. 아니면 tools/task_ledger.mjs --apply.
# 3) 검증: pending 재스캔 → 변환된 메일은 빠짐(멱등). ERP 할일 목록에 OPEN 신규 표시.
```

## 한계 / 주의 (V1)
- **재판단**: 할일로 안 만든(생략한) 메일은 다음 스캔에서 다시 pending 으로 뜬다 → 매 실행 재판단됨. 파일럿 규모에선 무해. (V2: 판정로그로 "할일 아님" 기억 → 재판단 스킵.)
- **멱등**: 같은 메일을 다시 candidates 에 넣으면 `mailtask:<key>` 행이 통째 교체된다(중복 생성 안 됨).
- **보안**: 본문/첨부/secret 미열람. 절대경로 금지(엔진이 상대 포인터만 허용). 메일 행을 public tracked 파일에 쓰지 않는다.
- **담당 확정**: owner 정책(`--assign-mailbox-owner`) 없이 메일함 수신자를 확정 담당으로 강제하지 않는다. 기본은 제안만.
