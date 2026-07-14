# five_field_session_capture_v0

어떤 AI 세션(Codex CLI, Claude Code, 기타)이든 **bounded 작업이 끝날 때 자동화 자산
5필드 — 입력/판단/출력/검증/중단조건 — 와 집계키(request_kind)를 `_workmeta` 레저에
남기는** 세션 종료 캡처 워크플로우다. owner 의 request-to-automation ladder(2026-07-04)
계단 1단("이 5개가 안 남으면 자동화로 자라지 않는다")의 개발 세션 레인 구현이다.

## 현재 상태

- location: `.workflow/five_field_session_capture_v0/`
- package status: `draft` (index.yaml 미등록 — workflow-check 통과 후 owner 결정)
- CLI smoke check: append/duplicate-skip/check-hit(0)/check-miss(2)/slug-guard 통과 (2026-07-04)
- blocking hook status: **disabled** (2026-07-14 owner 요청). 운영 장애와 자동화 효용 재검토를 위해 Codex/Claude Code의 PostToolUse 마킹과 Stop 차단 배선을 함께 중지했다.
- historical Codex hook smoke check: commit sentinel/no-record block, record-after pass, no-commit no-op 통과 (2026-07-05, 현재 비활성)

## 두 레인 분담 (이중 기록 금지)

| 레인 | 캡처 주체 | 착지면 |
|---|---|---|
| ERP 업무 (완료버튼/Codex 과제 스레드) | dev-erp 완료 훅 (FIVE-FIELD-CAPTURE 슬라이스) | `completion_log` (runtime DB) |
| 개발/일반 세션 (평소 Codex·Claude 대화) | **이 워크플로우** — 세션의 AI 가 종료 시 CLI 실행 | `_workmeta/<project>/reports/procedure_capture/five_field_log.jsonl` |

같은 스키마 계열(`soulforge.five_field_capture.v0`)이라 승격 감지기(request_kind 반복
집계 — 2회=packet 후보, 3회=helper 후보)가 두 레인을 함께 읽는다.

## 사용법 (세션 종료 시 1회)

```
node .workflow/five_field_session_capture_v0/tools/five_field_capture.mjs \
  --project P26-014 --session-ref codex_20260704_p26014a --worker codex_gpt-5.3 \
  --request-kind review/mail \
  --json '{"input_refs":["mail:P26-014:abc123","_workmeta/P26-014/..."],
           "judgment":"어떤 기준으로 분류/결정했나",
           "output":"무엇을 만들었나(경로/커밋 ref)",
           "verification":"성공/실패를 어떻게 확인했나(테스트 N건 등)",
           "stop_conditions":["다음부터 자동으로 하면 안 되는 경우"]}'
```

- `--json -` 로 stdin 입력 가능. 재실행 멱등(동일 내용 → duplicate skip).
- worktree 세션은 `_workmeta` 가 안 보이므로 `--repo-root C:/Soulforge` 또는 `SOULFORGE_ROOT` 지정.
- 원문 복사 금지: input_refs 는 포인터만(항목 300자·12개 제한), 전체 12KB 초과 시 거부.

## 차단형 하네스 훅 상태

2026-07-14부터 `five_field_session_capture_v0` 전용 차단형 훅은 모든 하네스에서
**비활성**이다. Codex와 Claude Code 모두 `PostToolUse` 마킹 훅과 `Stop` 차단 훅을
한 쌍으로 제거해야 하며, 어느 한쪽만 남기지 않는다.

- 프로젝트 `.codex/config.toml`에는 5필드 `PostToolUse`/`Stop` 등록을 두지 않는다.
- Claude Code의 프로젝트·사용자 `settings.json`/`hooks.json`에도 5필드 마킹·차단 등록을 두지 않는다.
- `tools/codex_hook_guard.mjs`와 `tools/claude_stop_guard.mjs`는 후속 검토를 위해 삭제하지 않고 비활성 상태로 보존한다.
- 기존 `_workmeta/**/five_field_log.jsonl`, `five_field_capture.mjs` CLI, dev-ERP `completion_log` 캡처는 보존한다.
- 재활성화하려면 현행 Codex/Claude Code 훅 스키마와 설정 로드를 다시 검증하고, 운영 장애·자동화 가치 재평가 후 owner 결정을 받아야 한다.

CLI의 비차단 확인 표면은 보존한다:

```
node .workflow/five_field_session_capture_v0/tools/five_field_capture.mjs --check --session-ref <ref>
# exit 0 = 기록 있음, exit 2 = 누락
```

- **Codex daily sweep**: Codex automation `soulforge-five-field-sweep`(일일 07:35, 설치본
  `~/.codex/automations/`, 추적 사본 `codex/automation.soulforge-five-field-sweep.toml`)은
  hook 누락·미신뢰·다른 PC 지연 push 의 결정적 안전망이다. 최근 24시간 커밋 대비 레저 갭을
  커밋 메시지·stat 만으로 소급 기록(`ai_backfill`)하고 승격 스캔 리포트와 드레인 지표 3종을
  갱신한다. gate(`post_development_review_gate_v0`) 스텝 바인딩은 후속(owner 결정 대기).

## 다른 PC 설정 (멀티 PC 수집)

수집 버스는 **git** 이다: 레저(five_field_log.jsonl)는 `_workmeta`(private repo)에 쌓이고,
각 PC 의 기록이 commit+push 로 origin 에 모인다. PC 별 체크리스트:

| 단계 | 무엇 | 어느 PC | 방법 |
|---|---|---|---|
| 1 | Codex 5필드 훅 비활성 확인 | Codex 로 Soulforge 작업하는 전 PC | repo 최신화(`github-down`/git pull) 후 `.codex/config.toml`에 5필드 `PostToolUse`/`Stop` 등록이 없는지 확인한다. 사용자 `~/.codex/config.toml`과 `hooks.json`의 중복 등록도 제거하고 Codex 앱 재시작 또는 새 thread에서 Hooks 화면에 두 훅이 없는지 확인한다. |
| 2 | `_workmeta` push 규율 | 전 PC | 각 PC 의 `_workmeta` 클론이 origin push 가능해야 레저가 모임(작업 후 commit+push — AGENTS 기존 규칙 그대로) |
| 3 | Claude Code 5필드 훅 비활성 확인 | Claude 쓰는 PC 만 | 프로젝트·사용자 `settings.json`/`hooks.json`에서 5필드 `PostToolUse` 마킹과 `Stop` 차단 등록을 함께 제거하고 Claude Code를 재시작한다. |
| 4 | 일일 sweep 자동화 | **메인 PC 1대만** (중복 설치 금지) | `codex/automation.soulforge-five-field-sweep.toml` 을 `~/.codex/automations/soulforge-five-field-sweep/automation.toml` 로 복사 후 Codex 앱 재시작 → Automations 패널에서 ACTIVE 확인 |

sweep 은 시작 시 두 저장소를 pull 하므로(프롬프트 0단계) **다른 PC 에서 push 된 커밋도
소급 대상에 포함**된다 — 즉 다른 PC 는 "커밋을 push 하는 것"만 지키면 수집이 완성된다.
sweep 을 여러 PC 에 중복 설치하지 말 것(멱등이라 해는 없지만 이중 소급 시도·불필요 부하).

## 경계

- 원문(메일/첨부/문서 본문)·secret 값 기록 금지 — CLI 크기/슬러그 가드.
- 레저는 `_workmeta`(private) 전용. public tree 에 5필드 내용 커밋 금지.
- ERP 업무 레인과 이중 기록 금지(위 분담표).

## 다음 (owner 결정 대기)

1. AGENTS.md end-of-task 체크리스트 1줄 편입 여부
2. post_development_review_gate_v0 바인딩 여부
3. workflow-check 후 index.yaml 정식 등록
