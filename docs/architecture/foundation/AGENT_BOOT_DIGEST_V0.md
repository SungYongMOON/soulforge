# Agent Boot Digest v0 (companion)

세션 시작용 압축 요약 — **정본 아님.** 정본은 AGENTS.md 와 아래 4문서.
충돌 시 원본이 이긴다. 드리프트 가드: `node guild_hall/validate/boot_digest_guard.mjs`
(원본 변경 시 이 파일 재검토 후 `--update`). AGENTS.md 라우팅은 owner 결정
전까지 변경하지 않는다 (companion 모드).

## 1. 연속성 제약 (영구)

주 개발 환경 = Codex. 모든 산출물은 Codex 가 이어받아 유지보수 가능해야:
지침 정본 AGENTS.md 하나 / 하네스·스크립트는 표준 Node·CLI(환경 전용 기능
금지) / 페이즈·윈도우 끝 NIGHT_WORK_HANDOFF(_workmeta/system/handoff/) /
결정·맥락은 PLAN·DESIGN·packet 문서화.

## 2. 정본 구조 (7축 + 보조)

`.registry`(canon store) `.unit`(subject) `.workflow`(orchestration)
`.party`(template) `.mission`(mission plan) `guild_hall`(cross-project ops)
`_workspaces`(local-only worksite) + `docs/architecture/`(canon docs),
`ui-workspace/`(derived UI consumer).

## 3. 저장 경계 (어기면 안 됨)

- public repo: 기능 코드/구조 문서/public-safe example 만.
- `_workmeta/<project>/`(nested private): **메타데이터만** — 포인터/크기/
  해시/출처/사용 상태. HWP·Office·PDF·압축·메일 원문/첨부 저장 금지.
- `_workspaces/`: 실자료(local-only, tracked 금지). `private-state/`:
  cross-project 보호 데이터. 애매하면 private 쪽으로 해석.
- secret(.env/token/세션): 열어 읽지 않는다. 경로 안내만, 값 출력 금지.

## 4. AI 작업 규약

- (2026-06-13 갱신) AI 도구도 main 직접 작업 허용. 매 슬라이스 후
  commit(작업자·모델 표기)+push, self-verify(node:test 전건+verify_gate ≥1)
  와 handoff. 작업 전 트리 안정성(HEAD 고정·index.lock 부재·외부 worktree
  분리) 확인, 동시편집 징후 시 중단·보고. sandbox push 막힌 프로필은 commit 까지만.
- 작업자 표기: 도구+모델 (예 `codex_gpt-5.3`, `claude_fable-5`) — commit,
  worklog, packet 공통. 커밋: status/diff 점검, 한글 우선 메시지.
- 구조/기능/운영 변경 시 CHANGELOG.md, 폴더 책임 변경 시 해당 README 동기.
- 기록 surface: `_workmeta/<project>/reports/...` worklog + promotion 근거.

## 5. 실행 계약 핵심 (AGENT_EXECUTION_CONTRACT_V0)

- 우선순위: ①최신 요청·중단선 ②secret·경계 ③owner 경계·roadmap ④계약 ⑤선호.
- post-development review gate: L0 self-check / L1 inspector(경계·packet·
  evidence) / L2 +judge(workflow·adoption·dev_worker packet — accept/revise/
  hold/reject) / L3 full B/V(skill·production-ready·canon 승격·자동화 권한).
- bounded task 완료 보고 전 knowledge trigger check closeout 필수
  (`지식 트리거 확인: 없음` 또는 후보 기록).
- bounded task 완료 보고 전 conversation-rule-hardening 설치 여부/결과를
  `규칙 강화 체크:` 로 닫는다.
- claim ceiling: 관찰됨/출처로 뒷받침됨/비공개 검증됨/정본 후보/정본 등록됨/
  막힘·보류 — 근거 없이 위 단계 주장 금지. LLM 출력은 authority 아님.

## 6. 개발 예정 저장 규칙 (DEVELOPMENT_ROADMAP_V0)

아이디어 계단: 불명확 → 로드맵 한 줄 / 개발 후보·실행 항목 →
단일 개발 작업 장부 `_workmeta/<project>/dev_worker_queue/*.yaml`
(`system` 공통은 `_workmeta/system/dev_worker_queue/*.yaml`). 후보/실행은
폴더가 아니라 `status: proposed/approved/queued/completed/...` 로 구분한다.
public-safe 실행 계획은 `.mission/` 으로 둘 수 있다. 실행 packet 최소 필드:
task_id, status, project_code, summary, allowed_write_paths,
acceptance_checks, stop_conditions, origin.evidence_refs.
`owner_approval.required && !approved` 면 새 명시 승인 없이 `approved/queued`
승격 금지(무해한 하위 slice 만). 기존 `dev_worker_candidate_queue` 는 legacy
migration input 이며 새 항목 금지. 닫힌 항목은 `dev_worker_queue/archive/<year>/`.
금지: 임시 TODO·임의 plan.md·backlog 중복 복제·transcript/raw 저장.

## 7. 처음 잡을 때 읽는 순서 (원본)

PROJECT_MAP_V0 → README → DEVELOPMENT_ROADMAP_V0(현재 active slice) →
VISION_AND_GOALS → WorldBible → guild_hall/README → ui-workspace/README →
_workspaces/README → _workmeta/README. 큰 방향 판단은 항상 로드맵 먼저.

## 8. 하지 말 것 (PROJECT_MAP)

- `_workspaces`/`_workmeta`/`private-state` 원본을 외부 계정·UI 에 노출 금지.
- UI 가 canonical owner 를 대체하게 만들지 않는다 (read-only snapshot 먼저).
- 업무 원문을 public 으로 승격하지 않는다. 최소 플레이 루프보다 세계관
  디테일을 먼저 늘리지 않는다.

## 9. 자주 쓰는 명령

`npm run guild-hall:doctor` (환경 진단) /
`node ui-workspace/apps/dev-erp/tools/verify_gate.mjs --level <0-3>` /
`node ui-workspace/apps/dev-erp/tools/doctor.mjs [--live]` /
dev-erp 기동: `node --watch ui-workspace/apps/dev-erp/server.mjs`.
