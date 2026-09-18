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
- `src/salpi_launcher.mjs` — 살피미 실행 1회용 dry-run launcher. 기존 `dev-assist` 프로필을 그대로 쓰되
  그 실행에서만 `<hermes root>/bin/hermes.exe -p dev-assist chat --cli --query-file <f> -t todo --ignore-rules -Q`로 도구를 `todo` 하나로 줄인다.
  모델 호출 경로는 이 모듈에 없다.
- `hermes_probe/prompt_closure_probe.py` — Hermes venv에서 Hermes 자신의 코드로 시스템 프롬프트와 도구 schema를
  렌더링해(모델 호출 없음, loopback 닫힌 포트, 로깅 꺼짐) 메타데이터만 돌려준다. 프롬프트 본문은 출력하지 않는다.
- `cli.mjs` — `project-mail` · `validate` · `audit` · `check-report` · `launch-plan`. 로컬 전용이며 어디에도 보내지 않는다.

## launcher dry-run 조건 (모두 PASS여야 `status: OK`)

| 조건 | 내용 | 실패 코드 |
|---|---|---|
| C1 | 고정 실행 파일(`<root>/bin/hermes.exe`)과 독립 리터럴 argv(`-p dev-assist chat --cli --query-file … -t todo --ignore-rules -Q`), `all`/`*` 금지, 프로필 경로는 `<root>/profiles/dev-assist`만 | `SALPI_LAUNCH_COMMAND_NOT_FIXED`, `…_EXECUTABLE_UNEXPECTED`, `…_PROFILE_UNEXPECTED` |
| C2 | 렌더링된 도구가 정확히 `["todo"]`, raw 가능 도구·MCP·미지 plugin·`model.openai_runtime`(Codex app-server) 없음 | `SALPI_LAUNCH_TOOLSET_NOT_MINIMAL` 외 |
| C3 | `HERMES_KANBAN_TASK` 등 도구·모델·surface·cwd·hook·프롬프트를 바꾸는 환경변수 제거, 프로필 `.env`가 되살리면 HOLD | `SALPI_LAUNCH_ENV_REINTRODUCED` |
| C4 | 프로필 `hooks/` 항목이나 config `hooks`가 하나라도 있으면 HOLD | `SALPI_LAUNCH_HOOK_PRESENT` |
| C5 | 살피미 전용 run 폴더 사용, dev-assist 작업 폴더·프로필·Hermes root 안이면 HOLD | `SALPI_LAUNCH_WORKDIR_UNSAFE` |
| C6 | 자동 주입 context에 SOUL·USER.md·MEMORY.md·HERMES.common·작업 폴더 AGENTS/CLAUDE/GEMINI 본문 0줄, memory 미로드·기본 identity 사용, 설정 프롬프트 추가분(personality·system_prompt·prefill·coding_instructions·environment_hint·platform_hints) 없음, 이메일·secret·UNC 0, 허용 밖 절대경로 0, context cwd가 git 저장소가 아님 | `SALPI_LAUNCH_CONTEXT_*`, `…_PROFILE_PROMPT_ADDITION` |

알려진 잔여(C5의 범위): C5가 보장하는 것은 **프로세스 cwd·쿼리 파일·probe 요청이 살피미 전용 run 폴더에 있다**는 것뿐이다.
Hermes가 모델에게 알려 주는 context 폴더는 여전히 기존 작업 폴더다. dev-assist `config.yaml`의 `terminal.cwd`가 Hermes 시작 시 `TERMINAL_CWD`를 덮어써서 context cwd가
`DEV_ASSIST` 폴더로 고정된다(프로필 변경 없이는 못 바꿈). `--ignore-rules`로 그 폴더의 파일 본문은 들어가지 않지만,
환경 힌트(사용자 홈·작업 폴더 경로)와 코딩 작업공간 스냅샷(폴더 경로·표식 파일 이름)은 들어간다. dry-run 출력의
`closure.context_cwd_forced_by_profile`과 `injected_sources`가 이를 그대로 보고한다.

그 밖의 알려진 한계(코드로 아직 닫지 않음):

- probe는 `AIAgent`를 직접 만들므로 `hermes chat` 경로와의 동등성은 코드 대조로만 확인됐다. 실제 실행은 모델 이름에 따른
  정적 문구가 더해져 `closure.probe_prompt_sha256`은 실제 프롬프트 digest가 아니다.
- 고정 실행 파일(`<root>/bin/hermes.exe`)은 존재만 확인한다. probe python이 같은 Hermes root 안에 있어야 한다는 것까지만
  강제하며, 실행 파일이 그 hermes-agent를 띄우는지는 확인하지 않는다.
- plugin은 이름 허용 목록(`soulforge-buzz-media`, 플랫폼 등록만)으로만 믿는다. plugin의 `pre_llm_call` 주입은 렌더링하지 않는다.
- 경로 검사는 공백에서 끊겨 공백이 든 하위 경로를 허용 접두사로 오인할 수 있고, junction·symlink는 풀지 않는다.
- 실제 실행의 세션은 dev-assist `state.db`에 남는다(내용은 projection뿐).

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
- 이 모듈은 코드와 테스트다. launcher는 dry-run뿐이며 상용 모델 호출·실데이터 pilot은 아직 없다.
  평소 dev-assist(Buzz·cli) 실행의 도구와 지침은 그대로이고 바뀌지 않는다.
- 맥락이·강도담·다른 봇, scheduler/launcher, 메일 수집 순서, 공용 tool policy는 바꾸지 않는다.

## 검증

```
npm run validate:salpi-audit
```
