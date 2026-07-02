# ENGINE-3-CAPABILITY-ASSIGN — 역량 기반 담당 제안

- status: proposed / parallel_group: G-intake-cycle (E1 과 같은 파일 — 직렬) / depends_on: 없음
- 규모 추정: 코드 ~90줄 + 테스트 ~60줄 (반나절 미만)

## 목적 (1줄)

owner 가 이미 큐레이션해 둔 브랜치 규칙의 역할/역량/담당 필드를 할일 후보에 **결정적으로**
얹어, "메일함 수신자 제안"뿐인 담당 배정을 업무 성격 기반 제안으로 올린다.

## 검증된 사실 (2026-07-02 실측)

1. 규칙 파일 `_workmeta/<code>/rules/haengbogwan_context_hint_rules.json` 의 rule 항목에
   `required_role`, `required_capability`, `suggested_assignee_ref`(일부), `work_types`,
   `event_keywords`, `priority` 필드가 실존 (P26-014 파일 실측 — 예: p26_014_kvds_towbody 에
   suggested_assignee_ref: dev_team_4).
2. `tools/mail_to_task_ledger.mjs` 는 candidates 의 `required_role`/`required_capability`/
   `suggested_assignee_ref`/`assignee_confidence`/`assignee_reason` 을 그대로 할일_장부
   자동화 컬럼(필요역할/필요역량/제안담당자/담당신뢰도/담당사유)에 기록한다(258~269행).
   **즉 소비 측은 완성 — 생산 측 배선만 없다.**
3. 확정 담당(`assignee_ref`)은 candidates 가 주지 않는 한 비며, `--assign-mailbox-owner`
   opt-in 없이는 제안만 남는다(235~248행) — 이 패킷도 **제안만** 한다(확정은 사람).
4. `tools/haengbogwan_run.mjs` loadContextHintRules 는 현재 branch/priority/keywords 만
   추출한다(E-옵티마이즈 2차에서 작성) — 역할 필드는 버려지고 있음.
5. 분류 어댑터(src/llm.mjs classifyMailForTasks)는 work_type 허용목록 8종을 검증한다.

## 구현 전 확인

- [ ] person_skill / core_person.capability_label 실데이터 유무 (있으면 v2 에서 개인 매칭,
      이 패킷 v1 은 규칙 파일의 role/capability/suggested_assignee_ref 만 사용 — 개인 점수화 금지).
- [ ] ERP UI 가 제안담당자/필요역할 컬럼을 표시하는지 (미표시면 별도 UI 슬라이스 후보로만 기록).

## 설계

### 알고리즘 (결정적 후처리 — LLM 출력을 덮지 않고 보강)

```
1. loadContextHintRules 확장: 반환 항목에 work_types, required_role, required_capability,
   suggested_assignee_ref 포함 (기존 소비자는 branch/keywords 만 쓰므로 호환).
2. 새 순수 함수 enrichCandidateWithRules(cand, subjectText, rules):
   - rules 를 priority 순으로 스캔, event_keywords 가 제목에 포함되는 첫 규칙 채택
   - 채택 규칙에서:
     a. cand.required_role/required_capability 가 비어 있으면 채움
     b. cand.suggested_assignee_ref 가 비어 있고 규칙에 있으면 채움 +
        assignee_confidence="medium", assignee_reason="브랜치 규칙(<rule id>) 기반 제안"
     c. cand.work_type 이 "review"(기본 폴백)이고 규칙 work_types[0] 가 허용목록에 있으면 교체 +
        review_reason 에 "+rule_work_type" 추가  ← LLM 이 명시한 비-review 타입은 존중(덮지 않음)
   - 어떤 필드도 확정(assignee_ref) 으로 승격하지 않는다
3. 배선: tools/auto_intake_cycle.mjs 분류 결과 candidates 에 프로젝트별 규칙으로 enrich
   (buildProjectContextLines 가 이미 규칙을 로드하므로 같은 로드 결과 재사용).
```

### 파일 변경

| 파일 | 변경 |
| --- | --- |
| tools/haengbogwan_run.mjs | loadContextHintRules 반환 필드 확장(호환 유지) |
| tools/auto_intake_cycle.mjs | enrichCandidateWithRules export + 분류 후 적용, summary 에 enriched 카운트 |
| test/auto_intake_cycle.test.mjs | 아래 케이스 |

## 경계 가드

- 개인 numeric 점수/등급 저장 금지(기존 감시경계 유지). 제안 필드만.
- 규칙 파일이 없거나 깨지면 no-op (기존 loadContextHintRules 의 빈 배열 폴백 그대로).

## 검사 방법

### node:test

1. `역량 제안: 규칙 키워드 매칭 시 required_role/제안담당자 채움 + medium 신뢰`
   (fixture 규칙: towbody→dev_team_4 패턴)
2. `역량 제안: LLM 이 채운 필드는 덮지 않음` (cand.required_role 기존값 유지)
3. `역량 제안: work_type 은 review 폴백일 때만 규칙 값으로 교체, 허용목록 검증`
4. `역량 제안: 확정 담당(assignee_ref)은 절대 채우지 않음`
5. loadContextHintRules 확장 필드 반환 + 기존 branch 매칭 회귀 없음

### 수동 verify

```
node tools/auto_intake_cycle.mjs --workmeta <fixture> --json   # dry-run 에 enriched 카운트
# ledger 산출 확인: 할일_장부.csv 의 필요역할/제안담당자/담당사유 컬럼 채움
```

### 공통 검사 총칙 수행

## 완료 기준

- towbody 류 제목의 메일 후보에 dev_team_4 가 "제안담당자"로(확정 아님) 기록된다(합성 fixture).
- LLM 출력 존중·확정 미승격·개인 점수 부재가 테스트로 고정된다.
- 직렬 전체 테스트 green + verify_gate L1 PASS.
