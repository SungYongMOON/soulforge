# 08. 결정 기록

결정의 정본 위치: 요구 추적 D36~D41은 `PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` §8.2, 단계 규칙 D42~D45는 `SE_STAGE_RULE_SOURCE_MODEL_V0.md` §8, 마스터플랜 결정 등록부(D36까지 기존). 여기는 요약과 현재 상태만.

## 8.1 Owner 결정 (번호 있는 것)

| ID | 질문 | 제안 기본값 | 상태 |
| --- | --- | --- | --- |
| D36(기존) | project-context 지속 계층·writer·ERP read-model owner | RTM 원장 4종은 `project_context/` 하위 sibling, writer 공유, 새 root 없음 | 기존 확정 |
| D37 | 계약 요구사양서에서 요구 ID를 확정할 authority | 자동 추출은 `observed` candidate만, 확정은 사람 | **decided 2026-08-17** |
| D38 | Needs 선언의 정본 owner | 기존 `stage_expected_artifact_policy` 확장, 새 store 없음, 미선언은 `gap_unknown` | **decided 2026-08-17** |
| D39 | `outdated` 처리(엔진 `gap_outdated` enum 추가 여부) | 투영층 사유 코드 + `gap_unknown`, enum 추가는 별도 승인 | open |
| D40 | 중복·상위판 판정 authority(색인 중복 ID 4쌍 포함) | 동일 content_id는 observation만 추가, 상위판 불확실은 자동 병합 금지·conflict 보존 | open |
| D41 | Graph DB 도입 트리거·backup 분류 | §4.4 트리거 전 미도입 | open |
| D42 | L1 기계 필드를 스펙 md에 직접 넣을지 vs 사이드카 | 직접(단일 원천), 생성기는 모르는 키 무시 | open(구현은 기본값대로 진행됨) |
| D43 | 탐색개발·선행연구 재기준 스펙 승격 시점 | draft variant 먼저, 실제 과제 1건 검증 후 승격 | open |
| D44 | 표준어(artifact_type_id) 소유자·표시명 | 컴파일러 `artifact_vocabulary.v0` + 글로서리 표시명(신규 56 토큰 표시명 포함) | open |
| D45 | overlay가 evidence_level을 낮추는 것 허용 여부 | 금지(N/A는 가능, 등급 변경 불가) | open(구현은 기본값대로) |
| D46 | 규칙 행에 활동·결정 노드 포함 + depends_on(파이프라인) | 확장(node_kind, 증거=기록, 판정 어휘 그대로) | 제안(2026-08-18, A2 전제) |
| D47 | 서브 에이전트용 지시서 계약 owner | 엔진 owner 별도 계약, zero-write, 판단 불변 | 제안(2026-08-18, A3 전제) |

번호 없는 대기 항목: Needs 정책 후보 확인, ① 스펙 principles의 완화 판단(HSI 계획·보안계획), 휴지통 `_workspaces/_trash_260818` 삭제(2026-09-17 이후), ai_usage_meter 상태 폴더 해시 64→16 정비 창, workmeta launch-file 경로 정책(run 영수증 미커밋 상태), MCP 활성화.

## 8.2 작업 중 확정한 판단 규칙 (Owner 지시 또는 실측 근거)

| 규칙 | 근거 |
| --- | --- |
| 규칙은 KVDS 맞춤이 아니라 공용 층에, 과제는 얇은 overlay | Owner 2026-08-18 |
| 발주처(주계약사) 계약 항목은 스펙 본문이 아니라 overlay로 물리 분리 | Owner: "계약별로 다를 텐데 나중에 못 쓰지 않아?" |
| ① 일반 SE 층은 0행이 아니라 실제 체크리스트 행을 가진다 | Owner: "적어도 체계공학 기반이면 이 정도는 만들어 놔야" |
| 근거 등급은 올리지 않는다; `unstated/unverified/unsupported/contradicted`는 약화, `partially_supported`는 유지; `prime_contract`는 `contradicted`만 약화 | 계층=통합 등가 실측(25→27) |
| 단일 출처 항목은 must_have 금지 | ① critic R1 |
| 인용은 위치만, 조번호·페이지는 본문 재독으로 확정 | ② 스팟체크 조번호 오인 1건 |
| 병렬 코더 계약 불일치는 컴파일러가 수용하고 시험으로 고정 | 코더 A/B 통합 |
| 긴 경로 허용 안 함(OneDrive 공유); 파일은 삭제 대신 이동; 매핑표 대신 참조를 직접 확인 | Owner 2026-08-18 |
| 미관측은 UNKNOWN, 부재 확인만 MISSING(fail-closed) | 설계 R1 |
