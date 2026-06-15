# dev-erp 보조용 로컬 LLM — 다중 사용자 기초설계 (2026-06-16)

> 목적: 다른 PC 에서 ERP 보조용 로컬 LLM 을 운영할 때, **여러 명이 동시에 질문해도**
> 끊김·과부하 없이 동작하는 구조의 기초설계. owner 지시(2026-06-16) 반영.
> 작업자: claude_opus-4-8 (hybrid lane). 장부/표준 소유권은 Codex.

## 0. 전수조사 — 현재 로컬 LLM 뼈대 (있는 것)

ERP 보조 LLM 자산은 이미 상당 부분 존재한다(파일럿=단일 사용자 전제).

| 자산 | 경로 | 역할 |
|---|---|---|
| LLM 어댑터 | `src/llm.mjs` | provider 3종: `stub`(외부0·기본) / `ollama`(로컬·LAN) / `codex_cli`(tool_pc 예약). RAG: 매뉴얼 검색→그 근거 안에서만 표현, 실패 시 검색 폴백(끊기지 않음). |
| 챗 엔드포인트 | `server.mjs /api/chat` | 단일 핸들러. `answerFromManual()` 호출. |
| 매뉴얼/지식 | `core_faq`, `core_knowledge`, `chat_query_log` | 검색 대상 + 미응답 질문 로그(야간 갱신 큐). |
| 설치/운영 문서 | `docs/CHATBOT_LLM_SETUP.md`, `docs/REMOTE_PC_RUNBOOK.md` | Ollama+Gemma 설치, 공통 기본 모델 `gemma3:4b`, `OLLAMA_HOST` 원격 지정, keep_alive/num_predict 튜닝. |
| 데이터 경계 | `src/llm.mjs buildMetaContext` | 컨텍스트는 **메타/요약만**(제목·카운트·이벤트 종류). 본문/첨부 0. |

**부재(이번 설계 대상)**: 동시 요청 처리·큐·공정성·다중 클라이언트 조율이 전혀 없었다.
단일 Ollama 에 동시 요청이 몰리면 모델이 과부하·지연되고 일부 사용자가 무한 대기/타임아웃을 겪는다.

## 1. 토폴로지 (다른 PC 운영)

```
  [팀원 브라우저들]  ──HTTP/LAN──▶  [ERP 서버 1프로세스]  ──HTTP/LAN──▶  [GPU PC: Ollama 1인스턴스]
   사용자1..N (동시)                  node:http (단일 진입)               단일 모델 상주(keep_alive)
```

- **ERP 서버는 단일 프로세스**(node:http, libuv 이벤트 루프) — 여러 사용자의 HTTP 요청을 자연히 다중 수용.
- **로컬 LLM 은 단일 Ollama 인스턴스**(같은 PC 또는 LAN 의 GPU PC). 모델은 1개 상주.
- 따라서 **병목은 LLM 1개**. 동시성 제어는 ERP 서버가 LLM 앞단에서 책임진다(아래 §2).
- 인터넷 egress 0(로컬/LAN 만). `codex_cli`(외부) 경로는 owner 승인분 한정·이 설계 범위 밖.

## 2. 동시성 게이트 (구현됨 — 기초)

`src/llm.mjs` 에 인프로세스 세마포어 추가. LLM 호출만 직렬화하고, 검색·매뉴얼은 그대로 병렬.

- `ERP_LLM_CONCURRENCY`(기본 1): 동시 LLM 호출 수 상한. GPU 여력이 크면 2~3 으로 상향.
- `ERP_LLM_QUEUE_WAIT_MS`(기본 8000): 슬롯 대기 한도. 초과하면 **검색 폴백**(`queued_timeout`)으로 즉시 답—무한 대기·끊김 없음.
- `runQueued(fn)`: 슬롯 확보 시 실행, 초과 시 미실행+폴백 신호. `llmQueueStats()`: active/waiting/concurrency 관측.
- 슬롯 인계는 FIFO(먼저 대기한 요청 우선) — 단순 공정성.

동작 원칙: **느려도 끊기지 않는다.** LLM 이 바쁘거나 죽어도 모든 사용자는 검색 기반 답을 받는다.

### 검증
- `LLM-QUEUE: 동시 질문 직렬화 — peak ≤ concurrency` (4동시 → peak 1)
- `LLM-QUEUE: 대기 초과 → queued_timeout(폴백)`

## 3. 사이징 가이드 (운영 판단)

| 동시 사용자 | 모델 | 권장 |
|---|---|---|
| 1~3 | gemma3:4b | 단일 PC localhost 도 가능. concurrency 1. |
| 3~8 | gemma3:4b / 9b | GPU PC 분리(`OLLAMA_HOST`), keep_alive 상주, concurrency 1~2. |
| 8+ | 상위 모델 | concurrency 2~3 + 응답 길이 축소(`ERP_CHAT_MAX_TOKENS`). 그 이상은 §5 후속. |

- 첫 응답 지연의 최대 원인은 **콜드스타트** → `keep_alive: 30m` 으로 모델 상주(이미 적용).
- 응답 길이(`num_predict`)가 지연을 좌우 → 짧은 답이 동시성에 유리.

## 4. 데이터·보안 경계 (불변)

- 컨텍스트는 메타/요약만(본문/첨부 0). 다중 사용자라도 LLM 에 보내는 내용은 동일하게 메타.
- 로컬/LAN 만(인터넷 egress 0). LAN 노출 시 ERP 서버 접근은 §RBAC(계정/관리자)로 통제.
- 질문 로그(`chat_query_log`)는 소프트웨어 저장(야간 매뉴얼 갱신 입력) — 개인 점수화·감시 아님.

## 5. 후속(이 기초 위에) — Codex/owner

- 사용자별 동시요청 상한(1인 폭주 방지)·우선순위(관리자/긴급) — 현재는 전역 FIFO.
- 스트리밍 응답(`stream:true`)으로 체감 지연 개선 + 취소 전파.
- 다중 Ollama 인스턴스 분산(요청 라우팅) — 8+ 동시 지속 시.
- 영속 큐/관측 UI: `llmQueueStats` 를 `/api/chat/queue` + 대시보드 배지로 노출.
- 팀 RBAC 와 결합: 챗 권한·메타 노출 범위(과제 가시성)와 일치.

## 6. 환경변수 요약

| 변수 | 기본 | 의미 |
|---|---|---|
| `ERP_CHAT_PROVIDER` | `stub` | `stub`/`ollama`/`codex_cli` |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | 로컬 또는 LAN GPU PC |
| `ERP_CHAT_MODEL` | `gemma3:4b` | 공통 기본 모델 |
| `ERP_LLM_CONCURRENCY` | `1` | 동시 LLM 호출 상한 |
| `ERP_LLM_QUEUE_WAIT_MS` | `8000` | 슬롯 대기 한도(초과=검색 폴백) |
| `ERP_CHAT_TIMEOUT_MS` | `20000` | 1회 호출 타임아웃 |
| `ERP_CHAT_MAX_TOKENS` | `320` | 응답 길이 상한 |

---
관련: [CHATBOT_LLM_SETUP.md](CHATBOT_LLM_SETUP.md) · [REMOTE_PC_RUNBOOK.md](REMOTE_PC_RUNBOOK.md) · [MULTI_USER_TEAM_MODEL_20260616.md](MULTI_USER_TEAM_MODEL_20260616.md)
