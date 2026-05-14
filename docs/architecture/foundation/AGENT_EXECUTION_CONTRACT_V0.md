# Agent Execution Contract v0

## 목적

- 이 문서는 Soulforge에서 AI agent가 코딩, 문서, 구조 검토, 적용성 판단, 변경 계획을 수행할 때 따르는 실행 계약이다.
- root `AGENTS.md` 는 짧은 라우팅 표면으로 두고, 구현 전 가정 노출, 최소 변경, scoped edit, 검증 기준은 이 문서가 상세히 소유한다.
- 외부 Karpathy-style `CLAUDE.md` 원칙을 그대로 복사하지 않고, Soulforge의 canon/public/private/secret 경계에 맞게 흡수한다.

## 우선순위

1. 사용자 최신 요청과 명시적 중단선
2. secret 취급 규칙과 public/private 저장 경계
3. Soulforge 정본 owner 경계와 roadmap
4. 이 문서의 실행 원칙
5. 일반 구현 선호

이 문서는 `AGENTS.md`, README 동기화 규칙, CHANGELOG 규칙, `_workmeta` 기록 규칙을 대체하지 않는다.

## 1. Think Before Coding

- 구현 전에 불명확한 요구, 가정, 선택지, tradeoff 를 숨기지 않는다.
- 여러 해석이 가능하고 결과가 달라질 때는 조용히 하나를 고르지 않는다.
- 더 단순한 접근이 있으면 먼저 말한다.
- 이해가 부족한 부분이 있으면 멈추고 무엇이 불명확한지 묻는다.

Soulforge 보정:

- 큰 개발 방향, active slice, 우선순위 판단은 `DEVELOPMENT_ROADMAP_V0.md` 를 먼저 읽고 판단한다.
- 저장 위치가 불분명하면 public 이 아니라 private 쪽으로 해석하고, 공개 가능 여부가 확인되기 전에는 public commit 범위에 넣지 않는다.
- secret 파일은 값이나 내용을 읽지 않는다. 필요한 경우 경로와 사용자가 직접 처리할 단계만 안내한다.

## 2. Simplicity First

- 요청한 문제를 해결하는 최소 변경을 우선한다.
- 요청 범위 밖 기능, 추상화, 설정 가능성은 추가하지 않는다.
- 단일 사용처를 위한 abstraction 을 만들지 않는다.
- 기존 패턴, owner-local README, repo의 canonical command surface 를 우선한다.
- 구현이 과해 보이면 줄인다.

Soulforge 보정:

- 새 top-level root, 새 schema, 새 workflow, 새 mission, 새 class/species canon 은 사용자가 요청했거나 owner 계약상 필요한 경우에만 만든다.
- README, architecture 문서, CHANGELOG 동기화는 주변 정리가 아니라 Soulforge 구조 변경의 필수 범위로 본다.
- public-safe sample 은 `docs/architecture/workspace/examples/` 아래에 두고, `_workspaces/<project_code>/` 실자료는 public tracked tree 로 올리지 않는다.

## 3. Surgical Changes

- 모든 변경 줄은 사용자 요청, owner 계약, 또는 명시된 성공 기준에 직접 연결되어야 한다.
- 인접 코드, 주석, formatting, 문서 문체를 임의로 개선하지 않는다.
- 관련 없는 refactor, archive 정리, dead code 삭제는 하지 않는다.
- 기존 스타일이 마음에 들지 않아도 같은 파일과 owner의 현행 패턴을 따른다.
- 내 변경으로 새롭게 생긴 unused import, 변수, 파일은 내 변경 범위 안에서 정리한다.

Soulforge 보정:

- 기존 사용자 변경이나 다른 agent 변경을 되돌리지 않는다.
- public repo, `_workmeta`, `private-state`, `guild_hall/state/**` 경계를 넘는 변경은 임의로 섞지 않는다.
- 관련 없는 보호 대상 업무 데이터, 메일 원문, monster history, battle log, outbound log 는 public repo 변경에 포함하지 않는다.

## 4. Goal-Driven Execution

- 작업을 검증 가능한 성공 기준으로 바꾼다.
- 버그 수정은 가능한 경우 재현 또는 실패 케이스를 먼저 잡고 통과시킨다.
- 다단계 작업은 각 단계마다 확인 방법을 붙인다.
- 검증을 실행했으면 무엇을 실행했는지 말한다.
- 검증을 실행하지 못했으면 실행하지 못했다고 말한다.

기본 검증 매핑:

| 변경 범위 | 우선 검증 |
| --- | --- |
| root/canon 구조 | `npm run validate` |
| snapshot producer/contract | `npm run validate:snapshot` |
| UI workspace | `npm run ui:done:check` |
| gateway index/mail fetch | `npm run validate:gateway` |
| 마감 전 넓은 확인 | `npm run done:check` |

### Skill first-build verification gate

Soulforge에서 agent 가 skill 을 새로 만들거나 수정하는 요청을 받은 경우, 해당 요청은 기본적으로 1차 제작 검증까지 포함한다.
즉 agent 는 skill 파일을 만든 것만으로 `완료` 라고 보고하지 않는다.

적용 범위:

- local Codex skill (`$CODEX_HOME/skills/**`, `~/.codex/skills/**`)
- Soulforge canonical skill 후보 (`.registry/skills/**`)
- Codex bridge (`.registry/skills/<skill_id>/codex/SKILL.md`)
- skill 제작, 최적화, scale-up 을 돕는 meta skill

1차 완료 보고 전 검증 게이트:

1. skill 구조 validator 를 실행한다. Codex skill folder 는 사용 가능한 경우 `skill-creator` 의 validator 를 우선 사용하고, 없으면 repo-local validator 또는 구조 checklist 로 대체한 뒤 한계를 보고한다.
2. script 를 만들거나 수정했으면 `--help`, dry-run, synthetic fixture 같은 안전한 방식으로 최소 1회 실행 검증한다. 안전 실행 경로가 없으면 production-ready 로 보고하지 않는다.
3. fresh-context evaluator review 를 수행한다. 현재 실행 환경에서 subagent 사용이 허용되고 사용 가능한 경우에는 subagent 를 쓴다. 그렇지 않으면 별도 새 컨텍스트 evaluator session 또는 수동 evaluator checklist 로 대체하고, 대체 방식과 한계를 보고한다.
4. evaluator 에게는 실제 사용자 작업 형태의 prompt 와 skill 경로만 준다. 의도한 정답, 의심한 결함, 수정 방향, private 판단 메모를 넘기지 않는다.
5. evaluator 결과를 사용자의 acceptance criteria 또는 agent 가 작성한 acceptance contract 와 비교한다.

보고 규칙:

- 위 게이트를 통과하기 전에는 `production-ready`, `완료`, `검증 완료` 라고 말하지 않는다.
- subagent 사용이 불가능하거나 사용자가 금지한 경우에는 사용한 대체 평가 방식과 잔여 리스크를 보고한다. 대체 평가가 acceptance 기준을 충분히 검증하지 못하면 `draft` 또는 `usable-pending-fresh-eval` 로 보고하고, 실행해야 할 evaluator prompt 를 함께 남긴다.
- 검증 결과에는 validator 명령, evaluator 방식, acceptance 기준 대비 pass/fail, 남은 gap, 다음 조치를 포함한다.
- project-specific skill 근거와 반복 개선 기록은 공개 가능성이 확인되기 전까지 `_workmeta/<project_code>/reports/procedure_capture/` 쪽으로 해석한다.
- 특정 project owner 가 없는 reusable workflow lab 근거와 반복 개선 기록은 `_workmeta/system/reports/procedure_capture/` 쪽으로 해석한다.
- project-specific evidence 인데 `project_code` 가 명시되지 않았으면 임의 project 를 선택하지 않고 사용자에게 확인한다.

Soulforge 보정:

- 검증 명령이 secret, private runtime truth, 외부 계정 상태를 요구하면 먼저 경계를 확인한다.
- canon 훼손, secret 노출, public/private 혼입 방지는 speculative error handling 이 아니라 필수 방어로 본다.
- 검증 실패가 unrelated dirty worktree 때문이라면 되돌리지 말고, 실패 범위와 관련성을 분리해 보고한다.

## 완료 기준

이 계약이 작동하면 다음 변화가 보여야 한다.

- diff 에 요청 밖 변경이 줄어든다.
- agent 가 구현 전에 가정과 모호성을 더 일찍 드러낸다.
- 새 abstraction, 새 root, 새 workflow 생성이 줄어든다.
- 작업마다 검증 기준과 실행 여부가 명확해진다.
- private/raw/secret 경계가 final answer 와 로그에 분명히 남는다.
