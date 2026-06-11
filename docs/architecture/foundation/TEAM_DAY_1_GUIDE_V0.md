# Team Day-1 Guide v0

## 누구를 위한 문서인가

- Soulforge 를 처음 여는 팀 합류자, 또는 새 PC 에서 다시 시작하는 운영자가
  첫날 길을 잃지 않게 하는 한 장짜리 안내다.
- 이 문서는 지도다. 각 영역의 규칙은 해당 owner 문서가 소유한다.

## 1. 이 저장소가 하는 일 (30초)

Soulforge 는 현실 업무(메일, 프로젝트 산출물, 일일 기록)를 게임식 운영
루프로 바꾸는 시스템이다. 핵심 루프는 하나다:

```text
처리 대기 업무(monster) -> 분류(triage) -> 실행 계획(mission)
  -> 작업 실행 기록(battle log) -> 절차 승격(promotion)
```

게임 용어가 낯설면 먼저
[`SHARED_GLOSSARY_V0.md`](SHARED_GLOSSARY_V0.md) 의
"게임 용어 ↔ 업무 용어 대조표" 를 읽는다.

## 2. 첫날 읽는 순서

1. 루트 [`README.md`](../../../README.md) — 상위 지도
2. [`AGENTS.md`](../../../AGENTS.md) — 작업 규칙 목차 (AI/사람 공통 경계)
3. [`PROJECT_MAP_V0.md`](PROJECT_MAP_V0.md) — owner/root 한 장 지도
4. [`DEVELOPMENT_ROADMAP_V0.md`](DEVELOPMENT_ROADMAP_V0.md) — 지금 무엇을
   왜 개발 중인지
5. [`SHARED_GLOSSARY_V0.md`](SHARED_GLOSSARY_V0.md) — 용어

## 3. 구조 한 장 (정본 7축)

| 루트 | 한 줄 |
| --- | --- |
| `.registry` | 종족/직업/스킬/지식 같은 외부 정본 store |
| `.unit` | 활성 실행 단위 owner |
| `.workflow` | 재사용 절차(워크플로) 정본 |
| `.party` | 워크플로 체인 템플릿 |
| `.mission` | 실행 계획과 준비 상태 |
| `guild_hall` | 메일 수집, 알림, 점검 같은 공용 운영 |
| `_workspaces` | 프로젝트 실파일 (local-only, public 추적 안 함) |

추가로 `_workmeta/` (프로젝트별 비공개 메타데이터) 와 `private-state/`
(continuity 데이터) 는 별도 private repo 다. public repo 에 섞지 않는다.

## 4. 첫날 실행해 보는 명령

```bash
npm run validate          # 구조/계약 검증 (가장 자주 씀)
npm run guild-hall:snapshot   # read-only 상태 snapshot 생성
npm run guild-hall:snapshot:json  # 작전판이 읽는 JSON 확인
npm run done:check        # 마감 전 넓은 검증
```

- 현황 보기는 snapshot/작전판(operation board)을 통해서 한다. private 원본
  폴더를 직접 훑지 않는다.
- 검색/rollup 은 [`SQLITE_PROJECTION_V0.md`](../guild_hall/SQLITE_PROJECTION_V0.md)
  의 local projection 이 담당한다 (구현 진행 중).

## 5. 반드시 지키는 경계 5가지

1. secret (`.env`, token, credential) 은 열지 않는다. 필요하면 경로만
   안내하고 사람이 직접 다룬다.
2. 메일 원문, 첨부, 회사 산출물 같은 raw payload 는 public repo 와
   `_workmeta` 에 넣지 않는다. 실파일은 `_workspaces` 쪽이다.
3. 저장 위치가 애매하면 public 이 아니라 private 으로 해석한다.
4. AI 작업자는 도구+모델 표기(`codex_gpt-5.3`, `claude_fable-5`)를 기록에
   남기고, Codex 외 도구는 `claude/<task-slug>` 같은 전용 branch 에서만
   작업한다 (main 직접 push 금지).
5. 완료 보고에는 무엇을 검증했는지(또는 못 했는지)를 함께 적는다.

## 6. 일은 어디서 시작하나

- 처리 대기 업무: 작전판의 monster gate / triage 카운트에서 본다.
- 실행 계획: `.mission/index.yaml` 과 Mission Board.
- 개발 후보: `DEVELOPMENT_ROADMAP_V0.md` 의 다음 후보 표 →
  `_workmeta/**/dev_worker_candidate_queue` (owner 승인 후 실행 큐).
- 막히면: 추측으로 채우지 말고 owner 질문/blocker 로 남긴다. `보류` 는
  실패가 아니라 다음 결정을 드러내는 상태다.

## 7. 첫 기여 체크리스트

- [ ] 변경 전: 관련 owner README 와 이 가이드의 경계 5가지 확인
- [ ] 변경: 최소 범위, 같은 변경 안에서 README/CHANGELOG 동기화
- [ ] 검증: 변경 범위에 맞는 `npm run validate:*` 실행 결과 기록
- [ ] 기록: worklog 또는 `_workmeta` procedure capture 에 근거 남기기
- [ ] 커밋: 한글 우선 메시지 + 작업자 표기

## 상태

- 2026-06-12: 초안 작성 (`claude_fable-5`, 2026-06-11 보안 슬라이스 패킷의
  DB/검색 슬라이스 Day-1 가이드 산출물). 팀 onboarding 피드백 후 갱신한다.
