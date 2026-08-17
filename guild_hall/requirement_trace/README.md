# guild_hall/requirement_trace

## 목적

- `docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` §5.3의 커버리지 계산을 소유하는
  결정론 순수 함수 owner다. 요구·Needs·관측·위험·단계와 두 질의 cutoff를 받아 커버리지 셀, 요구 단위 상태,
  고아 관측, 게이트 준비도, 그리고 payload 없는 영수증 하나를 낸다.
- 설계 문서 §8의 R1 조각이다. 이 폴더는 계약과 순수 함수만 담고, 원장 writer와 투영 materialization은 R2/R3가
  가져간다.

## 구성

- `requirement_coverage.mjs`: `computeRequirementCoverage(input)` 한 개의 export 표면과 그 보조 export
  (`requirementKeyFromRef`, `RequirementCoverageError`, `ERROR_CODES`, `ASSESSMENT`,
  `REQUIREMENT_COVERAGE_SCHEMA_VERSION`).
- `requirement_coverage.test.mjs`: 결정론, 양시간축 재생, fail-closed, outdated, 고아, 게이트 3분기,
  입력 불변·출력 deep-freeze, 소스 정적 pin 회귀.
- 합성 fixture는 public-safe example owner인
  `docs/architecture/workspace/examples/project_requirement_trace/requirement_coverage_synthetic_v0.json`에 둔다.

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

## 미결 Owner 결정 (설계 §8.1)

D37~D41은 아직 열려 있고, 이 모듈은 그 결정을 **입력 계약으로만** 표현한다. 어느 것도 여기서 확정하지 않는다.

| ID | 이 모듈에서의 표현 |
| --- | --- |
| D37 요구 ID 확정 authority | requirement record는 caller가 준다. 이 함수는 요구를 추출·확정하지 않는다 |
| D38 Needs 선언 정본 owner | Needs는 exact requirement revision 단위 입력이다. `requirement_kind` x stage 정책 해석은 하지 않고, 미선언은 `gap_unknown`으로 남긴다 |
| D39 `outdated` 처리 | 투영층 사유 코드 `coverage_revision_stale` + `gap_unknown`으로만 낸다. engine enum 추가에 의존하지 않는다 |
| D40 중복·상위판 판정 | 자동 병합·자동 dedupe가 없다. 상충은 보존한다 |
| D41 Graph DB·백업 분류 | 저장 표면을 만들지 않으므로 해당 없음. R4 이후 판단이다 |

## 검증

```bash
npm run validate:requirement-trace
```

- `node --check` 두 건과 `node --test guild_hall/requirement_trace/requirement_coverage.test.mjs`를 실행한다.
- root canon 검사는 `npm run validate`를 함께 본다.

## 관련 문서

- [`../../docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md`](../../docs/architecture/workspace/PROJECT_REQUIREMENT_TRACE_MODEL_V0.md)
- [`../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md`](../../docs/architecture/workspace/PROJECT_CONTEXT_GRAPH_MODEL_V0.md)
- [`../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md`](../../docs/architecture/foundation/ONTOLOGY_RELATION_MATRIX_V1.md)
- [`../engineering_engine/README.md`](../engineering_engine/README.md)
