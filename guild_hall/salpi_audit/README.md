# salpi_audit — 살피미 v2 Safe Projection 감사

살피미(상용 모델 운영 감사자)가 **raw 업무 데이터를 읽지 않고**, 로컬 결정론 코드가 만든
Safe Projection만 읽어 누락·불일치·stale·회귀·HOLD를 감사하도록 경계를 코드로 고정한다.

```
[민감 원본]  메일 raw/events JSONL · run summary · dedupe · cursor
      ↓  src/mail_pipeline_projector.mjs   (로컬, 결정론, LLM 없음)
[Safe Projection]  count · status · timestamp · digest · coverage · hold_code · safe locator
      ↓  src/safe_projection.mjs           (validateSafeProjection, fail closed)
살피미  ── 기준 판정: src/salpi_audit.mjs auditMailProjection
      ↓  모델 보고서 검사: validateSalpiAuditReport
누락 / mismatch / stale / regression / HOLD 후보
```

## 구성

- `salpi_role_contract.v2.json` — SALPIMI_ROLE_CONTRACT_V2. 허용·금지 capability와 작업,
  상태 5종(`OK`·`WARN`·`UNKNOWN`·`CONFLICT`·`HOLD`), escalation 대상, 역할 경계.
- `src/safe_projection.mjs` — SAFE_PROJECTION_SCHEMA_V1 validator(`soulforge.salpi.safe_projection.v1`,
  `projection_type: mail_pipeline_audit`).
- `src/mail_pipeline_projector.mjs` — 메일 수집기 상태 → projection. raw는 바이트로 줄 수만 세고,
  event 행은 dedupe 키 재구성에만 쓰며, 밖으로는 숫자·digest·고정 locator·코드만 나간다.
- `src/salpi_audit.mjs` — checklist `salpi.mail_pipeline_audit.v1`의 결정론 기준 판정과
  모델 보고서 검사기.
- `cli.mjs` — `project-mail` · `validate` · `audit` · `check-report`. 로컬 전용이며 어디에도 보내지 않는다.

## 보안 경계

- **구조로 막는다.** projection 스키마에는 자유 텍스트 칸이 없다. 문자열은 enum·UTC 시각·sha256·
  safe code·safe ref뿐이다. 알 수 없는 키는 `SALPI_PROJECTION_UNKNOWN_FIELD`,
  내용처럼 보이는 키(body·raw·payload·source_text·chunk·transcript·attachment·subject·email·secret·credential…)는
  `SALPI_PROJECTION_RAW_FIELD_FORBIDDEN`으로 거부한다. 거부 사유에 키 이름이나 값을 되돌려 쓰지 않는다.
- 공용 입력 guard(`guild_hall/agent_observation/guard_primitives.mjs`의 snapshot·accessor 거부·
  secret·로컬 절대경로 검사)를 **수정 없이 import해 재사용**한다.
- 거부된 projection은 감사기로 넘어가지 않는다(`overall: HOLD`, findings 없음).
- 모델 보고서는 닫힌 스키마다. 원인·요약 같은 서술 칸이 없고, catalog에 없는 finding·기준 판정에 없는
  finding·빠뜨린 finding·낮춘 overall·HOLD 해제·UNKNOWN 채우기·권한 주장은 모두 `HOLD`다.

## 살피미 역할(요약)

- 한다: count mismatch, coverage 비교, stale/backlog, 필수 필드 누락, HOLD/FAIL 코드 분류,
  safe locator 존재 확인, 직전 projection 대비 회귀, 정해진 checklist 감사.
- 하지 않는다: 원인 추론·수정 방법 결정·HOLD 해제·source truth 확정·우선순위 결정·아키텍처 판단·
  다른 봇에게 배정·수치 재계산.
- escalation은 **표시만** 한다: `context_investigator`(맥락이, 원인 조사 — 기존 권한 그대로),
  `producer_owner`(생산자 결함), `owner`(HOLD 해제·우선순위).

## 현재 적용 범위와 한계

- dry-run 영수증(소스 행 `skipped_reason: dry_run`)은 쓰기 증거로 쓰지 않는다. 쓰기 수치를 빼고 `flags.receipt_dry_run`만 남기므로
  그 수치가 필요한 검사는 CONFLICT가 아니라 UNKNOWN이 된다.
- 메일 골든 케이스 하나(`MAIL_PIPELINE_AUDIT_GOLDEN_CASE_V1`)만 다룬다. Slack·RAG·file projection은 없다.
- 이 모듈은 코드와 테스트다. 실제 살피미 봇의 도구 권한·입력 통로 연결은 이 변경에 포함되지 않는다.
  연결 전까지 봇 쪽 경계는 봇 지침 문장뿐이다.
- 맥락이·강도담·다른 봇, scheduler/launcher, 메일 수집 순서, 공용 tool policy는 바꾸지 않는다.

## 검증

```
npm run validate:salpi-audit
```
