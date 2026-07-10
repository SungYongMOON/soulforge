# Custom Asset Usage and Lifecycle Measurement v0

## 목적

- Soulforge custom `workflow`, `skill`, `party`, `automation` 이 실제로 호출되었는지와 그 실행 결과를 동일한 metadata-only 장부에서 측정한다.
- 일반 agent 또는 수동 baseline, 성공 근거, 유지보수 owner, fallback, lifecycle 정책 포인터의 누락을 드러낸다.
- 측정 결과만으로 자산의 품질, ROI, 승급, 기본 route, 폐기 또는 archive 를 자동 판정하지 않는다.

## owner와 저장 위치

- event owner: local-only `guild_hall/state/operations/soulforge_activity/events/**/*.jsonl`
- recent-context projection: `guild_hall/state/operations/soulforge_activity/latest_context.json`
- public schema/reader: `guild_hall/activity/asset_usage.mjs`
- private 실행 상세: 기존 project/run owner surface. activity event 에 원문이나 상세 payload 를 복사하지 않는다.

새 독립 ledger를 만들지 않고 기존 activity event의 선택 필드 `asset_usage`를 재사용한다.

## event 계약

`asset_usage.schema_version`은 `soulforge.custom_asset_usage.v0`이다. 최소 식별 필드는 다음과 같다.

- `asset_type`: `workflow | skill | party | automation`
- `asset_id`
- `asset_ref`: repo-relative canonical ref

측정 가능성을 높이는 선택 필드는 다음과 같다.

- `maintenance_owner`
- `baseline_ref`: 동일 입력에 대한 general-agent 또는 manual baseline pointer
- `outcome_evidence_ref`: 성공/실패 판단 근거 pointer
- `fallback_ref`
- `lifecycle_policy_ref`
- `duration_ms`

`result`는 상위 activity event의 `success`, `failed`, `blocked` 또는 다른 결과값을 사용한다. ref는 repo-relative metadata pointer만 허용하며 absolute path, path traversal, secret-like path를 거부한다.

## 명령

```bash
npm run guild-hall:activity:log -- --scope asset_usage --action workflow_run --result success --summary "public-safe summary" --asset-type workflow --asset-id <id> --asset-ref .workflow/<id>/workflow.yaml --maintenance-owner .workflow --baseline-ref <repo-ref> --outcome-evidence-ref <repo-ref> --fallback-ref <repo-ref> --lifecycle-policy-ref docs/architecture/guild_hall/CUSTOM_ASSET_USAGE_LIFECYCLE_V0.md --duration-ms <n>
npm run guild-hall:activity:asset-usage-report -- --json
```

report는 명시된 measurement window(기본/최대 최근 5,000 activity event) 안에서
자산별 실행 수, 성공/실패/blocked 수, 최근 30일 실행 수, 마지막 실행/성공
시각과 아래 measurement gap을 반환한다. `measurement_window`는 실제 scan 수,
가장 오래된/최신 event 시각, 한 건 lookahead로 확인한 실제 truncation 여부를
함께 공개한다. 따라서 window가 잘렸으면 `total_runs`를 장부 전체 lifetime
total로 해석하지 않는다.

- `usage_evidence_missing`
- `maintenance_owner_missing`
- `general_agent_or_manual_baseline_ref_missing`
- `fallback_ref_missing`
- `lifecycle_policy_ref_missing`
- `successful_outcome_evidence_missing`

## catalog discovery

- workflow: `.workflow/index.yaml`과 각 `workflow.yaml`
- party: `.party/index.yaml`과 각 `party.yaml`
- skill: `.registry/skills/*/skill.yaml`
- automation: local Codex app 또는 외부 scheduler가 runtime truth를 소유하므로 public catalog를 추측하지 않는다. 실제 automation 실행 event가 들어온 경우에만 report에 나타난다.

catalog YAML을 읽을 수 없으면 자산을 `unparseable`로 남기고 parse error를 별도 출력한다. 조용히 제외하지 않는다.

## 해석 경계

이 surface가 직접 증명하는 것은 기록된 activity metadata뿐이다.

- 실행 event가 없음은 "사용되지 않았다"가 아니라 "이 장부에 사용 근거가 없다"는 뜻이다.
- `success`는 해당 event writer가 기록한 결과이며 독립 품질 평가나 사업 효과를 뜻하지 않는다.
- baseline pointer가 있어도 비교가 수행되었다는 뜻은 아니다. 비교 결과는 `outcome_evidence_ref`가 별도로 가리켜야 한다.
- duration만으로 비용, 사람 시간 절감, ROI를 계산하지 않는다.
- owner/baseline/fallback/lifecycle metadata는 해당 필드를 가진 가장 최신 timestamp
  event를 사용한다. `outcome_evidence_ref`는 성공으로 분류된 event의 근거만 성공
  evidence로 인정한다. timestamp가 없거나 엄격한 ISO 달력 시각으로 검증되지 않는
  event의 metadata는 completeness gap을 채우지 않는다.
- retire/archive/supersede/default-route 변경은 usage report가 수행하지 않는다. owner-approved lifecycle 정책과 별도 review가 필요하다.

## lifecycle 후속 조건

1. 실제 writer가 호출 성공/실패를 구조화해 남긴다.
2. 비교가 필요한 자산은 동일 fixture 또는 같은 goal의 baseline pointer와 판단 근거를 남긴다.
3. 일정 기간 evidence가 쌓인 뒤 owner가 active/deprecated/retired 기준과 fallback 의무를 결정한다.
4. 그 전에는 report를 measurement-gap register로만 사용한다.

이 v0는 roadmap 후보 11의 첫 measurement slice다. calibration의 public/private 저장 위치는 이미 `.workflow/README.md`가 소유하며, roadmap 후보 15에는 lifecycle 상태 전이 정책만 남는다.

## 중단 조건

- raw/private payload를 activity event에 복사해야만 측정할 수 있는 경우
- ref가 absolute/private host path이거나 secret-like 경로인 경우
- metadata label/ref가 string scalar가 아니거나 secret-like value, raw HTML,
  encoded traversal, absolute/traversal fragment를 포함한 경우
- success/ROI/retire 판단을 뒷받침할 owner-approved 기준 또는 evidence pointer가 없는 경우
- local automation 목록을 public repo에서 추측해야 하는 경우
