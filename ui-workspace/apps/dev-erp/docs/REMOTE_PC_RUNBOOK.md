# dev-erp 원격 PC 런북 (다른 PC의 Codex 수행용)

이 문서는 **다른 PC**(로컬 LLM/GPU가 있는 머신)에서 작업할 에이전트(Codex)가 그대로 따라 실행하는 절차서다.
작성: claude_fable-5 (hybrid lane), 2026-06-13. 이 PC에서는 실행하지 않는다.

## 0. 맥락 / 목표

- dev-erp = 무의존 Node(node:http + node:sqlite, Node≥22.5) + 바닐라 JS ERP 앱. 위치: `ui-workspace/apps/dev-erp/`.
- 챗봇은 **RAG**: 매뉴얼(FAQ)을 검색 → LLM은 그 근거 안에서만 표현(추론·매뉴얼 밖 사실 금지). LLM 없으면 검색 폴백(끊기지 않음).
- **1순위**: 이 PC에 ERP 서버를 띄우고 **로컬 챗봇(Ollama/Gemma) 동작 실험**.
- **2순위**: 내부 폴더를 분석해 **실데이터를 어디에 어떻게 적재할지** 설계(읽기·제안만, 스키마 확정 금지).

## 0.1 가드레일 (반드시 준수)

- `git push`는 **owner만**. 에이전트는 커밋까지만.
- 외부 인터넷 전송 0. 예외는 **로컬/LAN LLM 호출 한 곳**(`src/llm.mjs` 어댑터, localhost 또는 사내 GPU PC IP)뿐.
- secret/credential/세션 값 열람·기록 금지. `_workspaces` 원문, `_workmeta` private payload는 본문 복제 금지(메타/경로/카운트 수준만).
- 역할 경계: dev-erp **앱 파일**(server/app/src/docs/test)은 이 작업 범위. canon `.workflow`/`.party`/RAG 워크플로·구조지도(SOULFORGE_ERP_BOM_HIERARCHY)는 별도 도메인 — 합의 없이 수정 금지.
- 계정 생성·비밀번호 입력·권한 강제·삭제는 owner 몫.

---

## 1순위 — ERP 서버 기동 + 로컬 챗봇 실험

### 1-1. 사전 준비

```bash
# 저장소 최신화 (owner가 push 한 main 기준)
cd <repo>/Soulforge && git pull --ff-only
node --version            # >=22.5 필요(node:sqlite)
cd ui-workspace/apps/dev-erp

# 코어 검증 (외부 의존 0이라 install 불필요)
npm test                  # = node --test test/core.test.mjs  → pass 전건 확인
node tools/verify_gate.mjs --packet ../../../_workmeta/system/dev_worker_queue/dev_erp_p2b_widgets_autoloop_v0.yaml
#   → [verify_gate] Level 1 — PASS, no_server_egress 0 확인
```

### 1-2. 서버 띄우기 (먼저 검색 모드 = LLM 없이)

```bash
node server.mjs --port 4310
#   → [dev-erp] http://127.0.0.1:4310 (db: data/dev-erp.db)
#   data/real_meta.json 없으면 합성 fixture 자동 적재(챗봇 FAQ 시드 4건 포함).
```

`4300`은 runtime 운영 checkout 전용이다. 개발 checkout에서
4300으로 띄우려 하면 기본적으로 거부되므로, 원격 개발/실험 PC는 `4310`을 쓴다.

> **영속 실행(데이터가 재시작에도 살아남음)** = `node server.mjs --db data/dev-erp.db`(상대경로).
> `--db` 기본값이 이미 `data/dev-erp.db`(상대)라 `node server.mjs`만으로도 파일DB로 영속된다.
> 절대경로(`/Volumes`·`/Users`·OneDrive)를 `--db`에 넣지 말 것 — 다른 PC 이식을 위해 항상 상대.
> 휘발(테스트·미리보기) 실행만 `--db :memory:`. WAL 모드라 같은 폴더에 `-wal`/`-shm` 동반 파일이 생긴다.

브라우저로 `http://127.0.0.1:4310` → 우하단 💬 챗봇 → "게이트 통과 어떻게 해?" 입력.
이 단계는 **검색 답변**(matched FAQ 원문)이 나오면 정상. `/new`로 대화 리셋도 확인.

### 1-3. Ollama + Gemma 연결 (LLM 표현 켜기)

이 PC = **Windows + NVIDIA 16GB**. OllamaSetup.exe 설치(서비스 자동 기동, CUDA 자동) 후:

```powershell
ollama pull gemma3:4b          # 공통 기본값(맥미니와 동일 태그). 품질 원하면 gemma2:9b

# 서버를 LLM 모드로 재기동 (PowerShell)
$env:ERP_CHAT_PROVIDER="ollama"; $env:ERP_CHAT_MODEL="gemma3:4b"; node server.mjs --port 4310
```

> 맥미니(개발기)는 같은 태그를 `brew` + bash 문법으로 실행. 설치/문법 차이만 있고 ERP 코드·동작은 동일.
> 상세 옵션(타임아웃·출력토큰 상한·원격 GPU PC 지정 등)은 **`docs/CHATBOT_LLM_SETUP.md`** 참고.
- ERP 서버와 GPU PC가 다르면: GPU PC에서 `OLLAMA_HOST=0.0.0.0 ollama serve`, ERP 쪽 `OLLAMA_HOST=http://<GPU_PC_IP>:11434`.
- 모델 미기동/타임아웃이면 자동으로 검색 폴백 → 멈추지 않음.

### 1-4. 챗봇 실험 체크리스트(자기검증)

- [ ] 매칭 질문 → 매뉴얼 근거로 **사람처럼 다듬어진** 답(LLM on). 응답 속도 측정(목표: 체감 수초 내).
- [ ] 매뉴얼에 없는 질문 → "정리 안 됨" 안내 + 후보 제시(끊기지 않음). `/api/chat/unanswered`에 적재되는지 확인.
- [ ] 매뉴얼/FAQ 관리 화면(좌측 메뉴 지식 → mod:knowledge)에서 FAQ 몇 건 추가 → 같은 질문이 이제 매칭되는지.
- [ ] 속도 튜닝: 느리면 `ERP_CHAT_MAX_TOKENS` 160~240, 모델 2B/4B로.
- [ ] 이벤트 로그에 `llm_call provider=ollama delivered=true` 기록 확인(외부 인터넷 전송 없음 = LAN/localhost).
- [ ] `npm test` + verify_gate L1 재확인.

산출: 실험 결과(어떤 모델, 응답 속도, 품질 체감, 권장 모델)를 **핸드오프 체크포인트**에 기록.

---

## 2순위 — 내부 폴더 분석 → 실데이터 적재 위치 설계

> 읽기·제안만. 실제 스키마 확정·대량 적재는 owner 승인 후.

### 2-1. 현재 적재 구조(관찰된 사실)

- DB: `ui-workspace/apps/dev-erp/data/dev-erp.db` (gitignored, 로컬). WAL 모드.
- 실데이터 ingest 진입: `data/real_meta.json` 존재 시 자동 적재(`src/adapter.mjs`의 `ingestFromFile`).
  - 현재 real_meta.json 최상위 키: **`projects`, `items`, `mail`** (메타만 — 메일 원문/첨부 없음).
- 그 외 도메인(거래처/구매/연락처/부품·BOM·재고/FAQ)은 아직 fixture 시드뿐 → 실데이터 소스 매핑 필요.

### 2-2. 분석 대상 폴더 (Soulforge 루트)

- `_workspaces/` — 작업 산출물 원문 plane(원문 복제 금지, 경로·종류·카운트만).
- `_workmeta/` — private payload/핸드오프/워커 큐(메타만).
- `private-state/` — 개인/런타임 상태(열람 주의).
- `guild_hall/`, `docs/architecture/` — 운영·아키텍처 문서(공개 가능 추상).
- `ui-workspace/apps/dev-erp/data/` — 현 적재 위치.

### 2-3. 산출물(제안서, 커밋)

데이터 소스 → ERP 적재 위치 **매핑 제안표**를 만든다. 각 행:
`도메인(과제/할일/메일/산출물/거래처/구매/연락처/부품·BOM·재고/회의/FAQ)` ×
`원천 폴더·파일` × `적재 대상(real_meta.json 키 또는 신규 ingest 채널 / 테이블)` × `메타-only 여부` × `갱신 주기(수동/야간)` × `미해결 질문`.

- 메일 원문·첨부 본문은 적재하지 않는다(메타 포인터만 — 기존 가드 유지).
- 신규 도메인 적재가 필요하면 `real_meta.json` 키 확장 또는 별도 ingest 입력 형식을 **제안**(코드 변경 전 owner 확인).
- 결과는 `ui-workspace/apps/dev-erp/docs/DATA_SOURCING_PLAN.md`(신규)로 저장 + 핸드오프 체크포인트 기록.

---

## 3. 종료 게이트(매 단계)

1. `npm test` 전건 통과.
2. `node tools/verify_gate.mjs --packet <packet>` → Level 1 PASS, `no_server_egress` 0.
3. `docs/checklist_phase1.json`에 run_note 추가.
4. 핸드오프 체크포인트(연속성 앵커) 갱신: 목표·현재상태·변경/조사 파일·결정·기각안·검증결과·남은 리스크·다음 행동.
5. 커밋(작성자 표기). **push는 owner**.

## 참고 문서

- `docs/CHATBOT_LLM_SETUP.md` — Ollama/Gemma 설정·VRAM·속도 옵션.
- `docs/checklist_phase1.json` — run_notes 이력 + verify_gate 검증항목.
- `AGENTS.md` — 워크플로(메인 직접 작업 허용 등).
