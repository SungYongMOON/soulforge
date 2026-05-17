# Workflow Naming Contract v0

Status: `draft`
Owner: `.workflow`
Claim ceiling: `canon_candidate`

`canon_candidate` 는 이 문서가 public-safe authoring contract 후보라는 뜻이다. 아직 `canon_entry` 나 validator enforcement 를 주장하지 않으며, 상태는 계속 `draft` 로 둔다.

## 목적

이 문서는 Soulforge workflow 이름을 설명용 한국어 표시 이름, 호출용 한글 전역 호출명, 기계가 참조하는 canonical `workflow_id` 로 나누어 작성하기 위한 초안 규격이다.

Soulforge 에서 workflow 는 `.workflow/` 가 소유하는 재사용 가능한 orchestration canon 이다. 이름은 단순 라벨이 아니라, 어떤 대상에 대해 어떤 행위를 하며, 실행 루프의 어느 단계에 있고, 어디까지 권한을 갖지 않는지를 드러내야 한다. 그래야 `.registry`, `.unit`, `.mission`, `_workmeta`, `guild_hall` 사이의 owner 경계가 이름만 보아도 흐려지지 않는다.

2026-05-18 현재 `.workflow/index.yaml` 에서 관찰한 canon workflow 는 44개다. 기존 이름에는 `frontline_assault` 처럼 짧지만 의미 범위가 약한 이름, `verification_plan_from_page_contracts_v0` 처럼 의미는 강하지만 길고 부담이 큰 이름, `_v0` 접미사가 있는 이름과 없는 이름이 섞여 있다. 이 문서는 그 시점의 현실을 전제로 한 authoring 초안이며, 기존 workflow 를 즉시 rename 하거나 validator 로 강제하지 않는다.

## 적용 범위

- 새 workflow 초안 작성 시 설명용 표시 이름, 호출용 `global_name_ko`, canonical `workflow_id` 를 정할 때 사용한다.
- 기존 workflow 를 설명하거나 migration 후보를 검토할 때 참고한다.
- `.workflow/authoring/workflow_draft.template.yaml` 의 `global_name_ko`, `display_name_ko` 같은 draft authoring field 를 적을 때 참고한다.
- `.workflow/index.yaml` 에 등록된 canon workflow, `.workflow/authoring/` draft, workflow 요청 템플릿이 1차 적용 대상이다.
- 이 문서는 초안이므로 validator, runner, UI schema, 기존 package folder 이름을 직접 변경하지 않는다.

## Codex 공식 제약과 Soulforge 호출 정책

OpenAI Codex 공식 문서는 Codex 가 repository 를 읽고 수정하고 명령을 실행하는 coding agent 라는 점, `AGENTS.md`, rules, skills, sandbox, network/environment 같은 Codex 기능 제약과 운영 표면을 설명한다. 그러나 Soulforge 의 `workflow_id`, `allowed_workflows`, `.workflow/index.yaml` catalog, 또는 Soulforge-style workflow global name 표준을 직접 정의하지 않는다.

따라서 이 문서의 `global_name_ko` 와 `workflow_id` 규칙은 Codex 공식 제약이 아니라 Soulforge 내부 workflow 호출 정책 초안이다. Soulforge 에서 현재 workflow 의 내부 안정 참조 기준점은 `.workflow/index.yaml` 의 `workflow_id -> path` catalog 이며, 한글 전역 호출명은 최종 실행 전에 canonical `workflow_id` 로 resolve 되어야 한다.

전역 호출 명령 surface 는 현재 `guild-hall:*` 원칙 아래에 있어야 한다. `guild-hall:workflow:<id>` 같은 구체 표면은 아직 문서상 확정된 명령이 아니므로, 이 문서는 그런 명령을 신설하거나 runner 권한을 부여하지 않는다.

## 이름 3계층 구조

| 계층 | 용도 | 권장 형태 | 저장 후보 |
| --- | --- | --- | --- |
| 표시 이름 `display_name_ko` | 사람이 작전판, authoring note, README 에서 빠르게 이해하는 설명용 이름 | 한국어 설명문 또는 `분류/루프단계/행위` 같은 문서용 표기 | README, authoring note, 추후 UI 표시 필드 |
| 한글 전역 호출명 `global_name_ko` | 사람이 호출 표면에서 사용할 수 있도록 규격화한 한국어 workflow 이름 | `/` 없는 한국어 `underscore` key | authoring draft, 추후 index alias/catalog 후보 |
| canonical `workflow_id` | 파일 경로, index, runner, downstream ref, `.party`, `.mission` 이 참조하는 내부 안정 id | 영문 `snake_case`, 대상 + 행위 + 루프 단계 + 권한 한계 | `.workflow/index.yaml`, `.workflow/<workflow_id>/workflow.yaml` |

`display_name_ko` 는 설명용이고 global invocation key 가 아니다. 한글 전역 호출명은 `global_name_ko` 로 분리하며, `/`, 공백, dash, colon, path-like 기호를 쓰지 않는다. `workflow_id` 는 현재 repo 구조와 runner 가 참조하는 내부 안정 키다. `global_name_ko` 는 사람이 호출할 때 쓰는 규격화된 한국어 alias 이지만, 실행과 저장 경계에서는 반드시 canonical `workflow_id` 로 resolve 되어야 한다.

## 분류 체계

한글 전역 호출명의 첫 token 은 workflow 가 어떤 운영 lane 에 속하는지 보여준다. 아래 분류는 초안이며, 2026-05-18 기준 기존 44개 workflow 를 모두 완벽하게 덮는 확정 taxonomy 가 아니다.

| 분류 prefix | 의미 | 예시 한글 전역 호출명 |
| --- | --- | --- |
| `지식` | knowledge, sourcebound packet, wiki, NotebookLM, access ledger 계열 | `지식_후보선별` |
| `소스` | 공식 source, owner-approved source, source gap 수집/검토 | `소스_공식패킷수집` |
| `자산` | XML, page module, component material, asset package 계열 | `자산_XML라이브러리수집` |
| `시뮬레이션` | simulator policy, deck, stimulus, run/verify 계열 | `시뮬레이션_덱구성` |
| `검증` | verification plan, result packet, audit, review gate 계열 | `검증_계획작성` |
| `리뷰` | review evidence, action closure, post-development gate 계열 | `리뷰_개발검사_v0` |
| `운영` | project readiness, SE stage scan, mission/control reporting 계열 | `운영_단계갭스캔` |
| `작성` | workflow/skill/document/diagram authoring 계열 | `작성_스킬패키지생성` |

분류가 겹치면 owner 경계가 더 중요한 쪽을 고른다. 예를 들어 `sourcebound_knowledge_packet_operating_loop_v0` 는 source 를 쓰지만 최종 owner 관심이 knowledge packet loop 이므로 `지식` 으로 분류하는 것을 권장한다.

## 작명 규칙

### 표시 이름

- `display_name_ko` 는 설명용 이름이며 전역 호출명으로 쓰지 않는다.
- 문서에서 사람에게 구조를 보여줄 때만 `분류/루프단계/행위` 같은 slash 표기를 허용한다.
- 필요하면 네 번째 segment 에 권한 한계를 붙인다. 예: `검증/실행/결과수집/승인아님`.
- `분류` 는 위 분류 체계에서 고른다.
- `루프단계` 는 `검사`, `수집`, `준비`, `실행`, `기록`, `검토`, `종료`, `유지` 같은 짧은 명사를 쓴다.
- `행위` 는 workflow 가 실제로 만드는 출력이나 판단을 드러낸다. 예: `후보선별`, `공식패킷`, `덱구성`, `개발검사`.
- 표시 이름만으로 대상, 행위, 루프 단계, 권한 한계 중 최소 3개가 읽혀야 한다.

### 한글 전역 호출명 `global_name_ko`

- 한글, 숫자, underscore 만 사용한다. 단, 버전 접미사 `_v0`, `_v1` 같은 끝자리 표기는 예외적으로 허용한다.
- slash `/`, 공백, dash `-`, colon `:`, backslash, dot path, `..`, URL/path-like 기호는 금지한다.
- 시작은 가능한 한 한글 분류어로 한다. 예: `지식`, `소스`, `자산`, `시뮬레이션`, `검증`, `리뷰`, `운영`, `작성`.
- 기본 구조는 `분류_행위` 또는 `분류_대상행위_v0` 를 권장한다.
- 권장 regex 는 `^[가-힣][가-힣0-9_]*(?:_v[0-9]+)?$` 이다.
- 예시 패턴: `지식_후보선별`, `검증_계획작성`, `리뷰_개발검사_v0`.
- `global_name_ko` 는 사람이 호출하기 위한 이름이며, title, README 문장, `display_name_ko` 와 섞지 않는다.
- 같은 `global_name_ko` 는 한 저장소 안에서 하나의 `workflow_id` 에만 resolve 되어야 한다.

### canonical `workflow_id`

- 영문 소문자, 숫자, underscore 만 사용한다.
- 시작 문자는 영문 소문자여야 한다.
- 공백, slash, dash, 한글은 금지한다.
- 권장 regex 는 `^[a-z][a-z0-9_]*$` 이다.
- 기본 구조는 `target_action_loopstage_boundary_v0` 를 권장한다.
- 모든 단어를 억지로 넣어 과도하게 길게 만들지 말고, summary 와 README 로 보완한다.
- 권한 한계가 workflow 정체성의 핵심이면 id 에 포함한다. 예: `accepted_verification_result_packet_v0`, `source_packet_sufficiency_review_v0`.
- `v0` 접미사는 새 public-safe contract, packet shape, 또는 migration 부담이 큰 초기 규격에 붙이는 것을 권장한다.
- 기존 id 에 `_v0` 가 없다는 이유만으로 즉시 rename 하지 않는다.

## 전역 호출 안정 조건

`global_name_ko` 가 한글 전역 호출명으로 안정되려면 최소한 다음 조건을 동시에 만족해야 한다.

- `.workflow/index.yaml` 에 `workflow_id -> path` 로 등록되어 있어야 한다.
- folder basename, `.workflow/<workflow_id>/workflow.yaml` 의 `workflow_id`, `.workflow/index.yaml` 의 ref path 가 같은 id 를 가리켜야 한다.
- `global_name_ko` 는 저장소 안에서 유일해야 하며, 한 alias 는 하나의 `workflow_id` 에만 매핑되어야 한다.
- `.party`, `.mission`, runner, authoring handoff 는 최종 실행 전에 `global_name_ko -> workflow_id -> path` 로 resolve 해야 한다.
- 현재 `.workflow/index.yaml` 는 `workflow_id -> path` catalog 이므로, `global_name_ko` 는 alias/catalog 저장 위치가 확정되기 전까지 draft authoring field 이며 runner 권한을 만들지 않는다.
- `display_name_ko` 는 분류와 가독성을 위한 사람용 보조 필드이며 global invocation key 가 아니다.

## 금지 패턴

- 세계관 은유만 있고 실제 대상/행위가 없는 이름. 예: `assault`, `hunt`, `forge` 만으로 끝나는 이름.
- owner 경계를 흐리는 이름. 예: planning workflow 가 `approve`, `certify`, `accept` 를 id 에 쓰면서 실제 owner approval 근거가 없는 경우.
- 실행하지 않는 workflow 가 `run`, `verify`, `execute` 를 claim 처럼 쓰는 이름.
- private/raw/source payload 를 public canon 으로 끌어오는 듯한 이름.
- downstream ref 가 많은 기존 `workflow_id` 를 단순 미관 때문에 바꾸는 rename.
- slash, 공백, dash, colon, path-like 기호가 들어간 값을 한글 전역 호출명으로 쓰는 패턴.
- `global_name_ko`, 표시 이름, `workflow_id` 가 서로 다른 owner 나 다른 권한 한계를 암시하는 조합.

## 길이와 형태 가이드

| 항목 | 권장 | 비고 |
| --- | --- | --- |
| 표시 이름 | 3~4 segment 또는 짧은 설명문 | 설명용이므로 slash 표기를 허용하지만 호출용으로 쓰지 않는다. |
| 한글 전역 호출명 | 2~4 token, underscore 구분 | `/`, 공백, dash, colon 없는 호출용 한국어 key 다. |
| `workflow_id` | 대략 3~7 token | `snake_case` token 기준이며, 필요하면 더 길어질 수 있다. |
| summary | 한 문장 | 이름에 담기 어려운 권한 한계와 non-claim 을 summary 에서 보완한다. |
| `_v0` | 새 contract/draft/packet 계열에 권장 | 기존 혼재는 관찰된 현실로 유지한다. |

짧은 이름은 기억하기 쉽지만 owner 경계를 잃기 쉽다. 긴 이름은 안전하지만 authoring 부담과 UI 노이즈가 커진다. 초안 단계에서는 `global_name_ko` 로 호출용 한국어 압축을 제공하고, `workflow_id` 는 downstream 안정성을 우선한다.

## 기존 이름에 대한 migration posture

- 이번 문서는 2026-05-18 기준 기존 44개 canon workflow 를 rename 하지 않는다.
- 기존 id 는 `observed legacy/current id` 로 다룬다.
- `workflow_id` 는 내부 안정 키이므로 미관, 길이, 한글 표시 선호만으로 rename 하지 않는다.
- rename 이 필요하면 downstream refs, history, private evidence, package path, changelog, README, `.party`/`.mission` 참조를 포함한 migration packet 이 먼저 필요하다.
- 한글 전역 호출명은 먼저 `global_name_ko` alias 후보로 붙이는 방식부터 검토한다.
- slash 를 포함한 설명용 표시 이름을 전역 호출명으로 승격하지 않는다.
- `_v0` 접미사 혼재는 즉시 정리 대상이 아니라 후속 검증 필요 항목이다.
- 짧은 legacy 이름은 우선 summary 와 표시 이름으로 보완하고, folder/id rename 은 마지막 선택지로 둔다.

## authoring 절차에서의 사용법

1. raw task memo 에서 대상, 행위, 루프 단계, 권한 한계를 각각 한 줄로 쓴다.
2. 먼저 slash 없는 한글 전역 호출명을 만들고, draft template 에서는 `global_name_ko` 에 기록한다. 예: `지식_후보선별`.
3. 필요하면 설명용 표시 이름을 `display_name_ko` 에 따로 기록한다. 이 값은 호출용이 아니다.
4. 그 다음 canonical `workflow_id` 를 영문 `snake_case` 로 만든다.
5. id 가 너무 길면 권한 한계 일부를 summary 또는 `notes` 로 내려도 되는지 확인한다.
6. `approve`, `accept`, `verify`, `run`, `canon` 같은 강한 claim 단어가 실제 권한과 검증 근거를 갖는지 확인한다.
7. `.workflow/index.yaml` 등록 전에는 기존 id 와 충돌하지 않는지 확인하고, `global_name_ko` 도 중복되지 않는지 확인한다.
8. 초안 단계에서는 validator 강제보다 authoring note 에 이 naming contract 를 참조하는 것을 우선한다.

## 예시 테이블

아래 예시는 현재 저장소의 workflow 를 바탕으로 한 권장 한글 전역 호출명 초안이다. 기존 id 변경안이 아니며, 후속 검증 없이 canonical rename 근거로 쓰지 않는다.

| 기존 id | 권장 한글 전역 호출명 | 분류 | 비고 |
| --- | --- | --- | --- |
| `knowledge_candidate_triage_v0` | `지식_후보선별` | 지식 | 후보 material 을 CANON, packet, owner-review, hold, reject 로 나누는 흐름이 드러난다. |
| `monster_knowledge_preflight_v0` | `지식_몬스터사전확인` | 지식 | main workflow 전 query-first gate 임을 표시한다. |
| `sourcebound_knowledge_packet_operating_loop_v0` | `지식_소스기반패킷운영` | 지식 | source 를 쓰지만 최종 관심은 knowledge packet loop 이다. |
| `official_source_packet_collect_v0` | `소스_공식패킷수집` | 소스 | owner-approved source 수집/색인 목적이 명확하다. |
| `simulation_deck_prepare_v0` | `시뮬레이션_덱구성` | 시뮬레이션 | 실행 전 준비이며 결과 검증을 claim 하지 않는다. |
| `simulation_run_verify_v0` | `시뮬레이션_측정검사` | 시뮬레이션 | run 또는 blocked-run packaging 이며 owner acceptance 는 아니다. |
| `verification_plan_from_page_contracts_v0` | `검증_페이지계획작성` | 검증 | plan 생성이며 verification execution 은 아니다. |
| `accepted_verification_result_packet_v0` | `검증_수락결과패킷기록` | 검증 | accepted result row 를 기록하지만 acceptance provenance 범위가 필요하다. |
| `review_gate_evidence_pack_v0` | `리뷰_근거패킷준비` | 리뷰 | gate 승인 자체가 아니라 readiness evidence pack 이다. |
| `post_development_review_gate_v0` | `리뷰_개발검사_v0` | 리뷰 | bounded development closeout gate 임을 드러낸다. |
| `se_stage_artifact_gap_scan_v0` | `운영_단계갭스캔` | 운영 | stage readiness 승인 대신 gap scan controller 로 제한한다. |
| `author_skill_package` | `작성_스킬패키지생성` | 작성 | legacy id 에 `_v0` 는 없지만 현재 sample/default 성격을 유지한다. |
| `frontline_assault` | `운영_전방작업조율` | 운영 | 짧은 legacy id 이므로 한글 전역 호출명으로 의미를 보강하는 후보다. |
| `device_system_diagram_generation` | `작성_시스템도식생성` | 작성 | diagram artifact 생성 workflow 로 읽힌다. |

## 후속 검증 필요

- `global_name_ko` alias 를 `.workflow/index.yaml`, `workflow.yaml`, README/UI derived layer 중 어디에 둘지 결정이 필요하다.
- 2026-05-18 기준 기존 44개 workflow 전체에 대한 한글 전역 호출명 inventory 는 별도 review 에서 작성한다.
- `_v0` 접미사 사용 기준은 package maturity, schema version, migration cost 를 함께 보고 다시 정리해야 한다.
- validator 강제 여부는 authoring practice 가 안정된 뒤 별도 변경으로 검토한다.
