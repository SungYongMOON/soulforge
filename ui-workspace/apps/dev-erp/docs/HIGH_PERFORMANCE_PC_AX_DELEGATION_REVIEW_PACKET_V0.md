# 고성능 PC AX AI 위임 범위 검토 패킷 V0

| 항목 | 내용 |
| --- | --- |
| 목적 | 실제 고성능 PC의 구현·gate·runtime evidence를 기준으로 AX 업무의 AI 위임 범위를 검토 |
| 상태 | `READY_FOR_HPP_REVIEW` |
| 기준 문서 | [`TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`](TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md) |
| 검토 성격 | owner 결정을 돕는 public-safe review input |
| 주장 한계 | 출처로 뒷받침된 검토 후보(`source_supported`) |
| 이번 패킷의 비권한 | 구현, DB·업무 데이터 변경, live writer, scheduler, 검토 결과의 scoped Git publish 외 외부 전송, 운영 활성화, 공식 task·기술 truth 판정 |
| 검토 결과 파일 | `ui-workspace/apps/dev-erp/docs/HIGH_PERFORMANCE_PC_AX_DELEGATION_REVIEW_RESULT_V0.md` |

이 패킷은 AX 마스터플랜을 수정하거나 승인하지 않는다. 실제 구축 중인 고성능 PC에서 현재
구현 상태와 실행 가능한 검증을 읽기 전용으로 대조하여, 아래 위임 제안의 채택·수정·기각·보류
중 무엇이 맞는지 판단하기 위한 입력이다.

## 고성능 PC에서 입력할 짧은 지시

```text
$soulforge-github-down 을 사용해 Soulforge를 안전하게 최신화하고, 이 PC의 실제 role/profile과
worktree 상태를 진단해줘. 그다음 ui-workspace/apps/dev-erp/docs/
HIGH_PERFORMANCE_PC_AX_DELEGATION_REVIEW_PACKET_V0.md 를 처음부터 끝까지 읽고 검토만 수행해줘.
실제 구현·테스트·gate receipt를 근거로 제안을 ACCEPT, REVISE, REJECT, BLOCKED 중 하나로 판정하고,
결과는 지정된 HIGH_PERFORMANCE_PC_AX_DELEGATION_REVIEW_RESULT_V0.md 에 public-safe하게 저장해.
이번 단계에서는 코드·DB·업무 데이터·writer·scheduler·운영을 변경하거나 활성화하지 말고,
검증·독립 리뷰 후 scoped commit/push까지 수행해줘. 확인하지 못한 상태는 추정하지 마.
```

## 1. 검토할 결론

현재 자료가 강하게 지지하는 가설은 다음과 같다.

> AX 업무에서는 사람의 검토를 없애는 것이 아니라, 검토 단위를 매 단계·파일·명령에서
> 만료 가능한 조건부 권한 묶음으로 올린다. AI는 묶음 안의 가역적 실행을 끝까지 수행하고,
> 사람은 목표·truth·data boundary·비가역 행동·live activation과 예외만 검토한다.

이는 아직 실제 owner 승인이나 운영 정책이 아니다. 현재 owner 검토가 실제로 과도한지,
권한 묶음이 검토 시간을 줄이면서 품질과 경계를 지키는지는 고성능 PC의 evidence와 bounded
Shadow 결과로 검증해야 한다.

## 2. 근거와 권한 순위

다음 순서로 근거를 읽고, 낮은 권한의 조언이 높은 권한의 저장소 계약을 덮어쓰지 않게 한다.

1. root [`AGENTS.md`](../../../../AGENTS.md)와
   [`AGENT_EXECUTION_CONTRACT_V0.md`](../../../../docs/architecture/foundation/AGENT_EXECUTION_CONTRACT_V0.md)
2. [`DEVELOPMENT_ROADMAP_V0.md`](../../../../docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md)
3. [`TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md`](TASK_ENGINE_AX_WORKSPACE_BUILD_MASTER_PLAN_V0.md)
4. [`HIGH_PERFORMANCE_PC_TASK_ENGINE_BUILD_MASTER_PLAN_PROMPT_V0.md`](HIGH_PERFORMANCE_PC_TASK_ENGINE_BUILD_MASTER_PLAN_PROMPT_V0.md)의 HPP inspection 경계
5. 실제 고성능 PC의 current public code·test·gate receipt와 허용된 metadata-only evidence
6. advisory input인 Codex 스레드 `AX 작업 진행 현황 검토`, `영상 기반 행동 가능성 검토`
7. advisory input인 [공유 GPT Pro 검토](https://chatgpt.com/share/6a5c49c6-4c14-83e8-bcd0-334608dc3f07)

Codex 스레드의 raw 대화나 private payload는 public 문서에 복사하지 않는다. advisory input은
가설과 질문을 제시할 수 있지만 구현 상태, source truth, owner approval 또는 runtime authority의
증거가 아니다.

## 3. 현재 제안하는 위임 경계

### 3.1 AI가 조건 안에서 자율 수행할 영역

- public code 작성, refactor, fixture, synthetic test와 deterministic validator
- feature-OFF 구현, replay·idempotency·rollback 검증
- 승인된 범위의 read/search/compare, exact source-ref 연결, 누락·충돌·중복 탐지
- owner·schema·path가 고정된 read-only coverage receipt·pulse projection과 Shadow candidate 생성;
  `Source Coverage Ledger`·`Project Pulse`는 검토용 임시 명칭이며 owner mapping 전 생성 금지
- 근거 패킷, 검증 receipt, 변경 요약, exception queue 작성
- later evidence에 따른 재검증과 provisional candidate 수정

### 3.2 AI가 구현하되 활성화 전에 사람이 확인할 영역

- additive schema·adapter·connector 중 source/data boundary가 넓어지는 변경
- provisional internal writer, scheduler, background worker
- 새 project·source·field·artifact kind 또는 device scope
- owner가 아직 승인하지 않은 threshold·readiness 기준·공식 상태 mapping

### 3.3 계속 사전 승인을 유지할 영역

- 공식 ERP task 생성·상태 변경·완료 처리와 공식 현재 단계 판정
- 외부 메일·메시지·공유·업로드·구매·재무 약정
- secret·identity·ACL·device trust·권한 확대
- destructive migration, 원문 이동·삭제, live writer·cutover·failover
- 설계 요구·수치·기술 truth, source truth, knowledge·Wiki·canon·ontology 승격
- 사람·돈·안전·법적 영향이 있거나 되돌릴 수 없는 행동

## 4. 조건부 3단계 제안

### Stage A — 첫 번째 개발 자율화 후보

AI가 public/synthetic/pathless fixture와 feature-OFF 조건에서 구현·테스트·평가 하네스·문서·검증을
끝까지 수행하게 하는 첫 위임 후보이다. **이 패킷 자체는 코드 write를 승인하지 않으며** P0~P10,
AX-G1~G3 또는 다른 child gate를 열지 않는다. 실제 실행 전에는 해당 slice의 owner gate와 선행
receipt, literal allowed path, output, validator, stop·rollback, expiry와 applicable review level이 적힌
별도 child packet이 필요하다.
실제 source 접근, private binding, HPP live writer 또는 운영 활성화는 포함하지 않는다. 물리 고성능
PC나 HPP binding은 public/synthetic 개발 후보의 선행조건으로 추정하지 않는다.

### Stage B — 승인 receipt 뒤의 read-only Shadow

formal P0(`C00A→C00Q→C00B`)와 P1(`H00→H01~H05→H06`) gate를 우회하지 않는다. 그러나
gate receipt만으로 project data read
authority가 생기지는 않는다. owner가 선택한 opaque pilot project에 대해 exact source·field·time
window·output owner·output path·start·expiry·revocation·zero-mutation proof를 적은 **별도 private
narrow packet**이 승인된 경우에만 owner-selected readiness criterion을 제안상 10영업일 동안
Shadow 분석한다. 실제 project ref와 gate/source ref는 private packet에만 둔다. 공식 현재 단계나
readiness 판정은 사람이 소유하며, AI는 `확정`, `규칙 계산`, `추정`, `확인 필요`, `관찰 불가`를
구분한다.

Stage B 기본 경계:

- approved source·field·time window만 읽기
- owner·schema·path가 확정된 metadata-only coverage receipt와 read-only pulse projection만 생성;
  `Source Coverage Ledger`·`Project Pulse` 임시 명칭을 새 owner나 schema로 간주하지 않음
- raw/private body 복사·공개 `0`
- 공식 system write·외부 전송 `0`
- 시작일·만료일·revocation·stop condition 명시
- source authority, project/readiness criteria 또는 zero-writer 보증이 불명확하면 자동 중단

### Stage C — 검증된 좁은 provisional write

Stage B threshold 통과는 write authority가 아니다. write 후보마다 canonical phase mapping,
accepted dependency receipt, literal path·operation·owner·expiry·rollback을 적은 exact owner packet과
state-mutation에 맞는 Level 3 review를 별도로 통과해야 한다. AX one-seat write 후보라면 최소한 core
C10 pilot pass, D01~D09·D12·D28·D29 결정, AX-G1 design acceptance, AX-G2 feature-OFF acceptance,
AX-G3 one-seat·one-project owner 승인을 각각 증명한다. 공식 task/status/completion, live cutover와
truth 승격은 Stage C에 자동 포함하지 않고 각각 별도 owner gate에 둔다.

## 5. 고성능 PC가 반드시 답할 질문

1. Stage A의 각 항목은 현재 어떤 file·symbol·test·feature flag로 구현 또는 미구현되어 있는가?
2. P0(`C00A→C00Q→C00B`)와 P1(`H00→H01~H05→H06`) gate 및 metadata-only receipt는 실제로
   무엇이 PASS, BLOCKED, UNKNOWN인가? 별도 private narrow packet이 있다면 exact authority ref와
   expiry는 무엇인가?
3. Stage B를 열기 전에 필요한 project scope, readiness 기준 source, allowed field, output
   owner·schema·path는 정확히 무엇인가? 임시 coverage/pulse 명칭을 어떤 기존 receipt·projection에
   mapping할 것인가?
4. 기존 master plan의 D01~D29, P0~P10, AX-G1~G3 중 이 제안과 충돌하거나 누락된 gate가 있는가?
5. public/synthetic 개발-write 레인과 approved-source read 레인을 분리해 보증할 수 있는가?
6. official writer, scheduler, external action, raw/private copy가 `0`임을 어떤 deterministic test와
   receipt로 증명할 것인가?
7. owner가 매 단계 대신 receipt와 예외만 보도록 만들 때 실제 검토 시간이 얼마나 줄어드는가?
8. 더 단순한 대안이 있다면 무엇이며, 같은 효용을 더 적은 권한과 변경으로 달성하는가?

## 6. 파일럿 측정 기준 초안

수치는 고성능 PC가 current baseline을 확인한 뒤 제안한다. baseline 없는 임의 pass threshold를
확정값으로 쓰지 않는다. 최소 측정 필드는 다음과 같다.

| 측정 항목 | 요구되는 기록 |
| --- | --- |
| unsupported claim | 건수와 해당 claim의 근거 상태 |
| source-ref coverage | exact revision/ref가 연결된 결과 비율 |
| blind spot visibility | `관찰 불가`·누락 source가 숨겨지지 않은 비율 |
| duplicate/conflict | 중복 후보와 상충 후보 건수 |
| owner correction | 사람이 수정한 분류·판정·candidate 건수와 사유 |
| owner review time | 기존 방식과 receipt/exception 방식의 실제 검토 시간 |
| unauthorized mutation | `0`이어야 함 |
| raw/private leak | `0`이어야 함 |
| rollback/replay | 동일 input에서 deterministic 결과와 복구 성공 여부 |

## 7. 검토 허용 범위와 중단조건

### 허용

- `$soulforge-github-down`을 통한 안전한 Git 동기화와 profile-scoped 진단
- public 문서·code·test·remote ref의 읽기 전용 inspection
- 기존 유효 profile과 별도의 exact task/source/evidence authority가 모두 허용하는 범위의
  metadata-only private inventory; authority에는 expiry·revocation과 output allowlist가 있어야 함
- migration을 일으키지 않는 기존 검증 surface 실행
- public-safe 결과 문서 한 파일 작성, post-development review, scoped commit/push
- 유효한 private write authority가 있을 때만 metadata-only review packet·upload receipt·5필드 기록
- 결과 채택 판단은 `soulforge-post-development-review-gate` Level 2 inspector+judge로 수행
- publish는 `$soulforge-github-up`을 사용하고, commit 전후 fetch로 remote base 불변과 exact allowed
  path만 포함됨을 확인한다. remote-ahead·divergence·unexpected path가 `0`일 때만 fast-forward
  non-force push하고, 아니면 merge·rebase 없이 중단

유효한 local identity와 profile이 확인되지 않으면 `public-only`로 계속한다. 이 경우 `_workmeta`,
`private-state`, 실제 runtime·source 상태를 읽거나 쓰지 않는다. private packet·upload receipt·5필드
capture는 `not_authorized` 또는 skipped reason으로만 보고하고, 해당 질문은 `BLOCKED` 또는
`UNKNOWN`으로 남긴다. 폴더 존재나 PC 성능으로 role·profile을 추정하지 않는다.

### 금지

- branch checkout·merge·rebase·force-push, schema/migration apply, DB·업무 row 변경
- writer·collector·scanner·scheduler·watchdog·alert·network service 활성화
- 실제 project name, mail/transcript body, filename/path, account·device ID 공개
- raw 업무 원문을 public 문서나 `_workmeta`에 복사
- secret·token·cookie·session·credential·`.env` 내용 열람
- 공식 task/status/completion, project gate·stage, 기술 truth를 AI가 승인된 사실로 확정

다음 중 하나면 `BLOCKED` 또는 `REVISE`로 중단한다.

- role/profile 또는 allowed source가 없는데 private/HPP readiness나 source-read 가능 상태를
  판단하려 함; public-only 문서·code 검토는 계속 가능
- `main`, `origin/main`, worktree, immutable input 또는 허용 변경 경계가 불안정함
- P0/P1을 PASS로 판단하려면 허용되지 않은 raw/private 내용이나 mutation이 필요함
- Stage A와 Stage B의 권한·path·output owner를 분리할 수 없음
- zero-writer, no-external-action, no-raw-copy를 검증할 방법이 없음
- official current stage·readiness criteria·truth owner가 불명확함
- UNKNOWN을 추정해야 채택 판정을 내릴 수 있음

## 8. 검토 결과 계약

결과 문서는 아래 순서로 작성한다.

1. `verdict`: `ACCEPT | REVISE | REJECT | BLOCKED`
2. `claim_ceiling`: 가장 약하게 뒷받침되는 상태
3. public 결과에는 redacted Git ref·aggregate gate 상태·관찰 시각만 기록하고, 실제 PC/profile,
   private project/source/gate evidence는 `_workmeta/system` 또는 `_workmeta/<project_code>`의
   metadata-only packet에 기록
4. 질문 1~8의 evidence-backed 답변
5. Stage A/B/C별 `ready | conditional | blocked` 판정
6. 최소 조건부 capability bundle의 public-safe abstraction
   - opaque project/scope ref
   - allowed operation·source/field class·logical output-owner/path class
   - start·expiry·revocation
   - exception·stop·rollback
   - deterministic validators와 zero-mutation 보증
   - exact project·source·field·physical path는 authorized private packet에만 기록
7. 측정 baseline, 제안 threshold와 threshold 근거
8. owner가 결정해야 할 최소 항목
9. 실행한 validator와 independent review 결과
10. public/private/secret boundary 확인

`ACCEPT`는 이 제안이 다음 owner 결정 후보로 충분하다는 뜻일 뿐, implementation, P0/P1 통과,
Shadow 시작, live writer 또는 production activation을 승인하지 않는다.

## 9. 이번 검토에서 기대하는 가장 단순한 결과

새 권한 체계나 별도 플랫폼을 만드는 대신, 기존 packet과 gate 형태를 재사용한 **만료형 조건부
capability bundle 한 개**를 제안한다. 사람은 묶음의 범위·만료·중단조건을 승인하고, 이후에는
각 구현 세부가 아니라 validator receipt와 exception만 검토한다.

고성능 PC의 실제 evidence가 이보다 더 좁은 범위를 요구하면 축소한다. 반대로 현재 구현과 receipt가
더 넓은 자율화를 뒷받침하더라도 공식·외부·비가역 권한은 자동 확대하지 않는다.
