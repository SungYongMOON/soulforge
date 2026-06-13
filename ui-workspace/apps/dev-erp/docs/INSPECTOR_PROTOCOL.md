# Inspector 프로토콜 (도구 비종속 — Codex/사람/어느 에이전트든)

목적: AGENT_EXECUTION_CONTRACT_V0 의 post-development review gate Level 2
("만든 agent 의 자기검증만으로 경계/가치 판단을 닫지 않는다")를 실행 가능한
절차로 고정한다. verify_gate `--level 2` 이상은 이 프로토콜의 증거 없이
PASS 하지 않는다.

## 누가

작업을 만든 에이전트가 **아닌** 신선한 컨텍스트: Codex 별도 스레드, 사람
(owner), 또는 fresh subagent. 작성자가 자신의 작업에 verdict 를 다는 것은
무효 (자기검증은 Level 0).

## 입력

1. 대상 packet yaml (task_id/scope/run_results/가드레일 주장)
2. 변경 커밋 또는 diff (`git show <commit>` / `git diff <base>..<head>`)
3. 이 저장소의 경계 규칙 (AGENTS.md §저장 경계·작업 규약, 또는 boot digest)

## 절차 (체크리스트)

1. **경계**: 변경 파일이 packet 의 scope/allowed 경로 안인가. public repo 에
   secret/원문/보호 데이터가 들어가지 않았는가 (`git show --stat` 훑기).
2. **가드레일 주장 대조**: packet 의 guardrails/validation 주장을 명령
   재실행으로 검증 — 최소: 해당 테스트(`node --test ...`), verify_gate,
   주장된 산출물 존재.
3. **내용 검토**: 코드/문서가 주장한 일을 실제로 하는가. 과장된 claim
   (계약의 claim ceiling 위반) 이 없는가.
4. **judge**: 기존 패턴/대안과 비교해 이 접근이 합리적인가. 효과 대비
   복잡도, 후속 위험.

## 출력 (packet 에 기록)

대상 packet yaml 끝에 추가:

```yaml
inspector_verdict: accept | revise | hold | reject
inspector_by: <도구_모델 또는 사람>   # 예: claude_fable-5_subagent, codex_gpt-5.3, owner
inspector_at: "YYYY-MM-DD"
inspector_note: 한 줄 근거 (revise/hold/reject 면 필요한 조치)
```

긴 보고가 필요하면 `_workmeta/system/reports/post_development_review/` 에
보고 파일을 만들고 packet 에는 `inspector_report: <경로>` 로 참조한다.

## verify_gate 연동

`node tools/verify_gate.mjs --level 2 --packet <yaml>` 은
`inspector_verdict:` 또는 `inspector_report:` 가 packet 에 있어야 PASS.
revise 판정을 받으면 조치 후 재패스를 받고 나서 닫는다.

## 운용 메모

- 페이즈/슬라이스 단위로 묶음 패스 허용 (예: 하네스 B1~B6 통합 패스 1회 —
  단 각 packet 에 verdict 는 개별 기록).
- inspector 가 subagent 로 불가능한 환경이면 대체 방식(사람 검토)과 잔여
  리스크를 packet 에 적고, Level 3 주장(production-ready)은 닫지 않는다.
