# five_field_session_capture_v0

어떤 AI 세션(Codex CLI, Claude Code, 기타)이든 **bounded 작업이 끝날 때 자동화 자산
5필드 — 입력/판단/출력/검증/중단조건 — 와 집계키(request_kind)를 `_workmeta` 레저에
남기는** 세션 종료 캡처 워크플로우다. owner 의 request-to-automation ladder(2026-07-04)
계단 1단("이 5개가 안 남으면 자동화로 자라지 않는다")의 개발 세션 레인 구현이다.

## 현재 상태

- location: `.workflow/five_field_session_capture_v0/`
- package status: `draft` (index.yaml 미등록 — workflow-check 통과 후 owner 결정)
- CLI smoke check: append/duplicate-skip/check-hit(0)/check-miss(2)/slug-guard 통과 (2026-07-04)

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

## 하네스 훅 배선 (guard — 기록 누락 검사)

셸 훅은 판단/검증 **내용을 쓸 수 없다**(모델만 안다). 그러므로 기록은 AI 가 세션 끝에
직접 남기고, 훅은 **남겼는지 검사**만 한다(계단 3단 — validator 먼저):

```
node .workflow/five_field_session_capture_v0/tools/five_field_capture.mjs --check --session-ref <ref>
# exit 0 = 기록 있음, exit 2 = 누락(경고 표면화용, 차단 아님)
```

- **Claude Code** (2026-07-04 배선 완료, 어댑터 `tools/claude_stop_guard.mjs`): Stop 훅은
  매 턴 발화하므로 무조건 차단하지 않는다 — ① PostToolUse(Bash)가 git commit 을 감지해
  "bounded 작업" 센티널을 마킹(`--mark`, 체인 명령도 내용 검사로 포착) ② Stop(`--guard`)이
  센티널+기록없음일 때만 **1회 차단**하고 기록 명령을 모델에 되돌림. 기록되면 자동 통과,
  `stop_hook_active` 로 재차단 루프 방지(2회째는 경고만). 로컬 `.claude/settings.json`:

  ```json
  { "hooks": {
      "PostToolUse": [{ "matcher": "Bash", "hooks": [{ "type": "command",
        "command": "node C:/Soulforge/.workflow/five_field_session_capture_v0/tools/claude_stop_guard.mjs --mark", "timeout": 10 }] }],
      "Stop": [{ "hooks": [{ "type": "command",
        "command": "node C:/Soulforge/.workflow/five_field_session_capture_v0/tools/claude_stop_guard.mjs --guard", "timeout": 20 }] }] } }
  ```

- **Codex CLI**: 차단형 훅이 없으므로 세션 종료 지시에 land_record 실행을 편입 —
  `AGENTS.md` end-of-task 체크 1줄 편입 또는 `post_development_review_gate_v0` 마지막
  스텝 바인딩(둘 다 **owner 결정 대기**, workflow.yaml `owner_decision_needed` 참고).
  결정적 안전망(주간 sweeper: 세션 흔적 대비 레저 갭 스캔→결정적 절반 자동 착지)은
  ladder packet S4 와 함께 후속.

## 경계

- 원문(메일/첨부/문서 본문)·secret 값 기록 금지 — CLI 크기/슬러그 가드.
- 레저는 `_workmeta`(private) 전용. public tree 에 5필드 내용 커밋 금지.
- ERP 업무 레인과 이중 기록 금지(위 분담표).

## 다음 (owner 결정 대기)

1. AGENTS.md end-of-task 체크리스트 1줄 편입 여부
2. post_development_review_gate_v0 바인딩 여부
3. workflow-check 후 index.yaml 정식 등록
