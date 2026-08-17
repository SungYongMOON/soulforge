# guild_hall/requirement_trace

## 목적

- `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` §5.3의 커버리지 계산을 소유하는
  결정론 순수 함수 owner다. 요구·Needs·관측·위험·단계와 두 질의 cutoff를 받아 커버리지 셀, 요구 단위 상태,
  고아 관측, 게이트 준비도, 그리고 payload 없는 영수증 하나를 낸다.
- 설계 문서 §8의 R1 조각과, 그 입력을 요구 ID 색인·Needs 정책·산출물 관측에서 결정론적으로 조립하는 R2 준비
  조각을 담는다. 이 폴더는 계약과 순수 함수만 담고, 원장 writer와 투영 materialization은 R2/R3가 가져간다.

## 구성

- `requirement_coverage.mjs`: `computeRequirementCoverage(input)` 한 개의 export 표면과 그 보조 export
  (`requirementKeyFromRef`, `RequirementCoverageError`, `ERROR_CODES`, `ASSESSMENT`,
  `REQUIREMENT_COVERAGE_SCHEMA_VERSION`).
- `requirement_coverage.test.mjs`: 결정론, 양시간축 재생, fail-closed, outdated, 고아, 게이트 3분기,
  입력 불변·출력 deep-freeze, 소스 정적 pin 회귀.
- `coverage_input_builder.mjs`(R2 준비, 2026-08-18): 요구 ID 색인 1건 + Needs 정책 1건 + 산출물 단위 관측을
  R1 입력으로 조립하는 순수 함수. `buildRequirementCoverageInput(request)`는
  `{ input, manifest, receipt }`를, `projectRequirementCoverageFromIndex(request)`는 거기에 R1 결과와
  `coverage_receipt`를 더해 낸다. 보조 export는 `CoverageInputBuilderError`, `BUILDER_ERROR_CODES`,
  `HOLD_REASONS`, `PRESENCE_SEMANTICS`, `COVERAGE_INPUT_BUILDER_SCHEMA_VERSION`,
  `REQUIREMENT_NEEDS_POLICY_SCHEMA_VERSION`.
- `coverage_input_builder.test.mjs`: fixture 일치, 결정론·행 순서 무관, 중복 ID 전건 hold, 4종 hold 사유,
  Needs 미선언, presence 의미 2종, unbound 관측, binding·정책 거부, R1 수락, 채굴 식별자 독립 재유도,
  구분자 변형 보존, 입력 불변·deep-freeze, 영수증, 정적 pin.
- 합성 fixture는 public-safe example owner인
  `docs/architecture/workspace/examples/project_requirement_trace/`에 둔다
  (`requirement_coverage_synthetic_v0.json`, `coverage_input_builder_synthetic_v0.json`).

## 경계

- **순수 함수다.** 파일, 시계, 네트워크, 모델, 프로세스 접근이 0이다. `Date` 계열을 읽지 않으므로 `valid_at`과
  `known_at`은 반드시 caller가 입력으로 준다. 이 경계는 `requirement_coverage.test.mjs`의 정적 pin이 이 모듈과
  이 모듈이 import하는 kernel 파일 전체에 대해 지킨다.
- **원장 writer가 아니다.** 어떤 경로에서도 원장 행을 append·수정·삭제하지 않는다. 정정은 caller가 새 record와
  `supersedes_ref`로 넣고, 이 함수는 cutoff 안에서 supersession 말단만 살려 읽는다.
- **판정 authority가 아니다.** `cleared`와 `boss_clear_candidate`를 만들지 않는다. 낼 수 있는 값은
  `UNKNOWN` / `HOLD` / `READY_FOR_OWNER_REVIEW`와 `blocked` / `active`뿐이며, 그 위는 owner decision packet,
  terminal provenance, fresh snapshot이 있어야 한다(설계 §2.4).
- **fail-closed다.** 미관측은 `gap_unknown`, 개정을 지정하지 않은 ref는 `AX_SE_REFERENCE_INVALID` 거부,
  상충은 부재나 충족으로 접히지 않고 `gap_conflict`, Needs 미선언은 `gap_unknown`이다. 구 개정을 덮는 관측은
  `coverage_revision_stale` 사유와 함께 `gap_unknown`으로 남는다(설계 §5.2).
- **고아 관측을 지우지 않는다.** 기준선 밖 요구를 덮는다고 주장하는 관측은 `unexpected_observed`로 계수해 남긴다.
- 통제 어휘(`GAP_TYPE`, `PRESENCE`, `RESOLUTION`, `AUTHORITY_FAMILIES`, `APPLICABILITY`, canonical 직렬화,
  exact ref identity key)는 재선언하지 않고 `guild_hall/engineering_engine/kernel/`에서 import한다. stage 코드
  통제값은 engine subject가 소유하므로 여기서 다시 열거하지 않고 입력의 `stages[]` 선언에 대해서만 검증한다.
- **builder도 같은 경계 안에 있다.** `coverage_input_builder.mjs`는 색인을 만들지도, 파일을 열지도, 원장에
  쓰지도 않는다. 색인·정책·관측을 caller에게서 데이터로 받고 시계 대신 요청의 instant만 쓴다. 식별자는
  domain별 sha256 채굴이라 같은 요청이면 항상 같은 값이며, 요구 entity는 문서 개정을 건너 유지되고 revision은
  블록 해시가 바뀌면 함께 바뀐다. 정적 pin은 이 모듈의 import graph 전체(R1과 kernel 포함)에 걸린다.
- **builder는 무엇도 조용히 버리지 않는다.** 모든 색인 행은 admitted이거나 사유 있는 hold이며 그 합은 항상
  `row_count`다. 정책이 Needs를 선언하지 않은 요구는 R1에서 `needs_undeclared`로 남고, 어떤 Needs와도 묶이지
  않는 산출물 관측은 emit하지 않고 manifest의 `unbound_artifact_observations`에 사유와 함께 남긴다. 색인이
  스스로 신고한 `duplicate_ids`는 판단 근거로 쓰지 않고 행에서 다시 계산한다.
- **builder는 manifest와 input을 섞지 않는다.** R1이 거부하는 provenance(절·쪽·span·TBC/TBD·기기/기능 코드·
  hold 사유·정책 상태)는 manifest 사이드카에만 있고, `input`은 R1 계약 그대로다. 문서 본문·요구 원문·bracket
  title은 어느 쪽에도 들어가지 않는다. `title`은 값이 있었는지만 색인 digest에 반영하고 내용은 읽지 않는다.

## Owner 결정 (설계 §8.1, §8.2)

D37과 D38은 2026-08-17에 결정됐고 D39~D41은 열려 있다. 이 폴더는 결정된 둘을 **구조로** 표현하고, 열린 셋은
**입력 계약으로만** 표현한다. 어느 것도 여기서 새로 확정하지 않는다.

| ID | 상태 | 이 폴더에서의 표현 |
| --- | --- | --- |
| D37 요구 ID 확정 authority | **decided 2026-08-17** — 자동 추출은 `observed` candidate만, 확정은 사람 | R1은 requirement record를 caller에게서만 받는다. builder는 색인 행을 admit하되 모든 행에 `confirmation_state: 'observed_candidate'`를 붙이고 영수증 `claim_ceiling`을 `observed`로 고정한다. candidate를 confirmed로 올리는 경로가 없다 |
| D38 Needs 선언 정본 owner | **decided 2026-08-17** — 기존 `stage_expected_artifact_policy` 확장, 새 정책 store 없음 | builder가 읽는 `soulforge.requirement_needs_policy.v0`는 확장 정책이며 `extends.policy_ref`로 base 정책 개정을 exact ref로 지목해야 한다. 이 필드가 없거나 다른 schema를 가리키면 `POLICY_INVALID`다. 미선언은 R1에서 `gap_unknown`으로 남는다 |
| D39 `outdated` 처리 | open | 투영층 사유 코드 `coverage_revision_stale` + `gap_unknown`으로만 낸다. builder는 다른 문서 개정을 덮은 관측의 개정 id를 그대로 넘겨 R1이 stale로 읽게 하고, 신선도를 대신 주장하지 않는다 |
| D40 중복·상위판 판정 | open | 자동 병합·자동 dedupe가 없다. 중복 requirement_id는 승자 없이 **모든 행**을 hold하고, 구분자 변형은 서로 다른 식별자로 남기며 `separator_variant`로 기록만 한다 |
| D41 Graph DB·백업 분류 | open | 저장 표면을 만들지 않으므로 해당 없음. R4 이후 판단이다 |

## 검증

```bash
npm run validate:requirement-trace
```

- `node --check` 네 건과 `requirement_coverage.test.mjs`(18건) + `coverage_input_builder.test.mjs`(22건)
  `node --test`를 실행한다.
- root canon 검사는 `npm run validate`를 함께 본다.

## 관련 문서

- [`../../docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`](../../docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md)
- [`../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
- [`../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md`](../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md)
- [`../engineering_engine/README.md`](../engineering_engine/README.md)
