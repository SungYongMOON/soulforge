# 09. 다음 작업과 인수인계

## 9.1 다음 조각 (우선순위 순, 각각 하나의 bounded slice)

| # | 조각 | 입력 | 출력 | 완료 기준 |
| --- | --- | --- | --- | --- |
| 1 | **①↔② 토큰 별칭 정합** | ① `generic_se_base.json`, ② `system_dev_common_no_grade.json`, 어휘 | 어휘에 canonical+aliases(또는 ② 토큰 정규화 + 반복 행), 비교 드라이버 재실행 | 같은 게이트에서 ①∩② 토큰 수가 사람이 검토한 대응표와 일치, 시험 추가, D44 표시명 표와 함께 Owner 확인 |
| 2 | **표준 항목 관측 확대 + runner 재실행(27 정책)** | run 03 packet, 120_CDR 정책 27, 과제 폴더·색인 관측 | run 04(zero-write) | 불명 16~18 중 관측 가능한 것이 present/absence_confirmed로 바뀌고 mission 후보가 담당 capability로 나옴 |
| 3 | **NASA SE Handbook 반영(① 보강)** | `src_NASA_SE_HANDBOOK_*.json`, ① 스펙 | 행 인용 보강 또는 행 추가, 도출 기록 §6-1 닫기 | 3-출처 바닥 규칙 재확인, `--check`·시험 통과 |
| 4 | **R2 원장 writer** | R1/R2 준비 조각, Owner 승인 소량 pin(rtm 25 + contract_sow 18, 한 stage) | JSONL 원장 4종 writer + 재생 parity | 설계 §8 R2 완료 기준 4개, `guard:workmeta-write` 전건 |
| 5 | **커버리지 generation 생성기(R3 후반)** | R2 원장 | `projections/rtm/generations/<id>/` + packet | 같은 cutoff 두 번 → digest 동일 |
| 6 | **탐색·선행·운용·응용 variant 재기준(D43)** | 대조표 §10 초안, 정본 881호·974호 | draft variant 스펙 | 실제 과제 1건 검증 전 승격 금지 |
| 7 | **문서 내용 검사기(설계 §2.1A)** | 산출물 원문(private) | 산출물 안 필수 절·표 존재 판정 | zero-write, 정본 기준 |
| 8 | R4 카드·ERP read model·MCP 뷰 | R2/R3 | 얇은 카드, SQLite read model, MCP 뷰 4종 | 7조건 게이트 리포트 |
| 9 | **답변 우편함(Context Response 수신 경로)** — MCP·P5 시점 | 독립검토 스레드(V1.2, 2026-08-11) 지적: 엔진은 질문+답변 영수증 둘 다 있어야 판정을 바꾸는데 답변을 실제로 받는 경로가 없음. `kernel/context_receipt.mjs`(Phase 3, 합성 전용·전송 없음)에 영수증 **검증**만 있고 runner는 질문을 내지도 답을 읽지도 않음 | 우편함 writer(답 → 답변 영수증+후보, private) + runner의 질문 발행/답변 읽기 + P5 승인자 등록 | Owner 판단(2026-08-18): **MCP 구현 단계에서** 함. 그때까지 답은 `artifact_observations`(누가·언제·근거)로 수동 공급하고 엔진 코드는 바꾸지 않는다 |

정리 잔여(엔진 밖): ai_usage_meter 상태 폴더 해시 64→16(수집기 정지 창), `_workspaces/system` 실험·git_push 잔재, P23-037/RAW 뿌리 축약, 지식 intake 파일 61개 슬러그 반복, 휴지통 삭제(09-17 이후).

## 9.2 새 작업자(LLM 포함) 시작 체크리스트

1. `AGENTS.md` → `docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md` → 이 매뉴얼 README·01·02·03 순으로 읽는다. 관련 없는 문서를 선적재하지 않는다.
2. HEAD·`.git/index.lock`·dirty change ownership 확인. 다른 스레드(예: Codex 엔진 스레드)가 실행 중이면 repo 무접촉.
3. 바꾸려는 것이 규칙이면 **스펙 md**를 고친다(코드 아님). exporter → `--check` → `validate:se-stage-rules` → `validate:se-foldertree-compiled` → 실제 과제 1건 재컴파일.
4. 새 파일·폴더는 `npm run validate:path-length`(예산 200/60/60/해시 16). `_workmeta` 아래에 쓰기 전 `npm run guard:workmeta-write -- --assert-write-target "<target>"`.
5. private 원문·사업명 세부·개인명·절대경로·secret은 public 파일에 넣지 않는다. 실행 결과는 수치와 상대 포인터만.
6. 병렬 코더를 쓰면: 패킷(설계 authority·baseline HEAD·입력·산출물·검증 명령·commit 메시지)을 문서로 주고, 격리 worktree, ff-merge 전 HEAD 검증. 결과 통합 시 계약 불일치는 컴파일러가 수용하고 시험으로 고정. 신선한 컨텍스트로 적대적 검토 1회.
7. 끝낼 때: 시험·validator 실제 결과 기록, `CHANGELOG.md`, 로드맵 delta log, 마스터플랜 CURRENT, 이 매뉴얼의 해당 장, five-field capture, commit+push, `규칙 강화 체크:`.

## 9.3 하지 말 것

- 규칙을 엔진 코드에 하드코딩하거나 컴파일러가 규칙을 "보완"하게 만들기.
- overlay로 evidence level 올리기·바꾸기(D45), 표준이 이미 요구하는 항목에 `add`.
- 어휘 밖 토큰을 스펙에 두고 넘어가기(unmapped context로 조용히 빠진다 — 시험이 잡는지 확인).
- 관측을 이웃 requirement로 추정해 붙이기, 미관측을 결손으로 접기.
- 실제 과제 실행 결과·원문을 public 문서·fixture에 넣기. Task 생성·승인·canon 승격·ERP write를 엔진이 하게 만들기.
- 새 top-level root·schema·workflow·정책 store를 Owner 계약 없이 만들기.

## 9.4 Owner에게 보고하는 법(이 프로젝트의 관행)

- 짧게, 한국어로, 비유 한 줄 + 표 하나. 다음 액션은 **하나**만 제시한다(긴 목록은 결정을 어렵게 한다).
- 매핑표·영수증 나열 대신 "무엇이 바뀌었고 무엇이 남았나"를 수치로. 확인 못 한 것은 UNKNOWN/HOLD로 정직하게.
