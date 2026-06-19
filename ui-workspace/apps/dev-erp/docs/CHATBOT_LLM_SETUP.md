# 챗봇 로컬 LLM(Ollama) 연결 가이드

챗봇은 **RAG** 방식이다: 매뉴얼(FAQ)을 검색해 근거를 찾고, LLM은 **그 근거 안에서만** 답을 표현한다(매뉴얼 밖 사실은 지어내지 않음). LLM이 없으면 검색 결과를 그대로 사람형 문장으로 보여주는 폴백으로 동작한다(절대 끊기지 않음).

매뉴얼은 실제 ERP 기능·화면·운영 지식을 담는 곳이지, 사용자의 모든 말투를 FAQ로 끼워 맞추는 곳이 아니다. "너 살아있어?", "답이 너무 빠른데", "그건 내가 설정 못 하는데" 같은 자유 발화는 FAQ 항목으로 증식시키지 않고, 로컬 LLM이 챗봇 런타임 원칙을 보고 해석한다.

## 패치 적용 확인

운영자가 실제로 보는 포트는 `4300`이다. `4301`/`4302` 같은 확인용 서버가
떠 있어도 운영 반영으로 보지 않는다.

- ERP 상단 제목 옆에 `UI ui-2026.06.18-release-visible.6`와
  `브라우저 Chrome ...` 또는 접속 브라우저 버전이 보여야 한다.
- 챗봇을 열면 헤더에 `챗봇 chatbot-2026.06.18-release-visible.6`이 보여야 한다.
- 화면이 의심스러우면 `http://127.0.0.1:4300/app.js` 또는
  `http://<회사PC-IP>:4300/app.js`에서 `ERP_UI_VERSION`을 검색한다.
  이 문자열이 없으면 아직 운영 포트가 최신 checkout을 서빙하지 않는 상태다.

## 0. Karpathy LLM 설치 판단

ERP 지식/RAG 목적에서는 Andrej Karpathy 계열 런타임(`llm.c`, `nanoGPT`, `minGPT`, `micrograd`, `makemore`)을 설치하지 않는다. 여기서 가져오는 것은 **Karpathy-style sourcebound wiki 운영 방식**뿐이다: 작은 wiki page, source card, provenance, claim ceiling, review 후 승격.

실제 답변 표현 런타임은 이 문서의 Ollama 또는 승인된 LLM 어댑터를 사용한다. ERP는 원문을 직접 읽는 LLM이 아니라 `knowledge_shell` metadata endpoint를 읽는 껍데기다. 운영 계약은 `docs/architecture/guild_hall/KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md`에 둔다.

## 1. Ollama 설치 + 모델 받기 (PC별)

ERP 코드는 두 PC가 동일하다. **다른 건 설치 방법(OS)과 모델 크기(하드웨어)뿐.**
두 PC에서 **같은 모델 태그**를 쓰면 맥미니에서 고치고 회사 PC에서 같은 결과로 검증할 수 있다.
**공통 권장 기본값: `gemma3:4b`** (M4 32GB·회사 NVIDIA 16GB 둘 다 빠름). 회사 PC에서 품질을 더 원하면 `gemma2:9b`/`gemma3:12b`를 먼저 보고, 이미 받아 둔 thinking 계열 모델(`gemma4:e4b` 등)을 쓸 수도 있다.

### 맥미니 (Mac mini 4 / M4, 32GB · 24h 개발·테스트기)

```bash
brew install ollama          # 또는 ollama.com/download 의 .dmg
ollama serve &               # 백그라운드 데몬 (Metal GPU 자동)
ollama pull gemma3:4b        # 메모리는 넉넉(9b/12b도 가능). 단 M4 기본칩은 메모리 대역폭이 느린 편 → 빠른 반복엔 4b 권장
```

### 회사 고성능 PC (Windows, NVIDIA 16GB · 배포 대상)

1. `https://ollama.com/download/windows`에서 **OllamaSetup.exe** 설치 → 백그라운드 서비스로 `127.0.0.1:11434` 자동 기동.
2. 최신 GeForce 드라이버면 **CUDA 자동 사용**(별도 설정 불필요). `ollama ps`로 GPU 점유 확인.
3. 모델 받기 (PowerShell 또는 CMD):

```powershell
ollama pull gemma3:4b        # 공통 기본값
# 품질 원하면: ollama pull gemma2:9b   (~5.5GB, 16GB VRAM 여유)
# 이미 설치돼 있다면: ollama pull gemma4:e4b  # thinking 계열. 품질 모드는 ERP_CHAT_THINK=1 로 켠다
```

VRAM 가이드(Q4_K_M, 권장은 KV캐시 헤드룸 포함): 4B≈최소4GB, 12B≈최소8GB(권장12GB), 27B≈16GB+.

## 2. 서버를 LLM 모드로 실행 (환경변수 문법이 OS별로 다름)

**macOS / Linux:**
```bash
ERP_CHAT_PROVIDER=ollama ERP_CHAT_MODEL=gemma3:4b node server.mjs
```

**Windows PowerShell:**
```powershell
$env:ERP_CHAT_PROVIDER="ollama"; $env:ERP_CHAT_MODEL="gemma3:4b"; node server.mjs
```

**Windows CMD:**
```cmd
set ERP_CHAT_PROVIDER=ollama && set ERP_CHAT_MODEL=gemma3:4b && node server.mjs
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `ERP_CHAT_PROVIDER` | `stub` | `ollama`로 설정 시 로컬 LLM 표현 활성화 |
| `ERP_CHAT_MODEL` | `gemma3:4b` | 받아 둔 Ollama 모델 태그 |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama 데몬 주소. **다른 PC에서 돌리면** 그 PC IP로(예: `http://192.168.0.20:11434`) |
| `ERP_CHAT_THINK` | `0` | `1`이면 thinking 지원 모델의 추론을 켠다. 더 느리지만 자유 발화·애매한 질문 품질이 좋아질 수 있음 |
| `ERP_CHAT_TIMEOUT_MS` | `20000` | 응답 대기 한도(초과 시 검색 폴백). `ERP_CHAT_THINK=1`이고 직접 지정하지 않으면 기본 45000 |
| `ERP_CHAT_MAX_TOKENS` | `320` | 응답 최대 토큰. `ERP_CHAT_THINK=1`이고 직접 지정하지 않으면 기본 1536 |
| `ERP_CHAT_TEMPERATURE` | `0.2` | 답변 표현 온도. `ERP_CHAT_THINK=1`이고 직접 지정하지 않으면 기본 0.15 |
| `ERP_CHAT_CONTEXT_TURNS` | `5` | 같은 로그인 사용자 + 같은 `thread_id`에서 이어묻기 해석에 쓸 최근 질문 수. `0`이면 문맥 OFF, 최대 10 |
| `ERP_CHAT_RETRIEVAL_LIMIT` | `3` | 매뉴얼 검색 후보 수. 기본 3, 최대 10. `ERP_CHAT_THINK=1`이고 직접 지정하지 않으면 기본 5 |
| `ERP_CHAT_LLM_ASSIST_WEAK` | `1` | 강한 매뉴얼 매칭이 없어도 로컬 LLM이 챗봇 자유 발화/질문 의도를 런타임 원칙으로 해석할지 여부 |

thinking 지원 모델(`gemma4:e4b` 등)은 Ollama가 내부 사고 토큰을 먼저 생성할 수 있다. 기본 안정 모드는 `/api/generate` 호출에 `think:false`를 넣어 빠르게 답한다. 답변이 너무 빠르고 품질이 낮게 느껴지는 운영 환경에서는 `ERP_CHAT_THINK=1`로 품질 모드를 켠다. 이때 내부 추론 텍스트는 사용자에게 노출하지 않고 답변 본문만 보여주며, 모델이 빈 답을 주거나 타임아웃되면 검색 기반 답변으로 폴백한다.

### 품질 모드 예시

**Windows PowerShell:**
```powershell
$env:ERP_CHAT_PROVIDER="ollama"
$env:ERP_CHAT_MODEL="gemma4:e4b"
$env:ERP_CHAT_THINK="1"
$env:ERP_CHAT_TIMEOUT_MS="45000"
$env:ERP_LLM_QUEUE_WAIT_MS="45000"
node server.mjs
```

**macOS / Linux:**
```bash
ERP_CHAT_PROVIDER=ollama ERP_CHAT_MODEL=gemma4:e4b ERP_CHAT_THINK=1 ERP_CHAT_TIMEOUT_MS=45000 ERP_LLM_QUEUE_WAIT_MS=45000 node server.mjs
```

품질 모드는 응답 시간이 길어지는 것이 정상이다. 팀원이 “멈춘 것 같다”고 느끼지 않게 프런트는 답변 준비중/처리중 표시를 보여주며, 운영자는 동시 사용자가 많은 시간대에는 `ERP_LLM_CONCURRENCY=1`을 유지하고 queue wait을 충분히 길게 잡는다. 품질 모드에서는 매뉴얼 후보 기본값도 5개로 늘어나 더 많은 근거를 보고 답한다. thinking 모델이 내부 사고만 만들고 최종 본문을 비워 보내면, 어댑터가 내부 사고를 노출하지 않고 `think:false` 최종 답변 재시도를 한 번 수행한다.

사용자가 “답변이 너무 빠르고 질이 떨어진다”, “추론 켜면 안 되냐”처럼 챗봇 자체 품질을 말하면, 이 질문은 ERP 기능 매뉴얼 FAQ로 끼워 맞추지 않는다. 런타임 원칙에서 바로 “운영자가 품질 모드를 켤 수 있고, 대신 느려질 수 있다”는 식으로 답한다.

## 속도 팁

아래 항목은 **운영자용**이다. 일반 팀원은 `ERP_CHAT_*`, `OLLAMA_HOST` 같은 서버 설정을 직접 바꾸지 않는다. 팀원은 답이 느리거나 멈춘 것처럼 보이면 같은 질문을 여러 번 연속으로 보내지 말고 잠시 기다린 뒤 한 번만 다시 보내며, 반복되면 질문 내용과 발생 시간을 관리자에게 전달한다.

- 모델 크기가 속도를 가장 크게 좌우: **2B≫4B>9B**. 빠른 체감엔 `gemma2:2b`/`gemma3:4b`.
- 품질이 더 중요하면 thinking 모델 + `ERP_CHAT_THINK=1`을 쓴다. 대신 첫 토큰과 전체 답변이 늦어질 수 있다.
- `keep_alive`로 모델을 메모리에 상주시켜 첫 응답 콜드스타트를 없앤다(기본 30분).
- `ERP_CHAT_MAX_TOKENS`를 160~240으로 낮추면 응답이 더 빨라진다(답이 짧아짐).
- 프롬프트엔 검색된 매뉴얼 상위 3조각만 넣어 토큰을 최소화한다.
- GPU PC와 ERP 서버가 **다른 머신**이면 `OLLAMA_HOST`를 GPU PC 주소로 지정(같은 LAN 권장 — 지연↓).

## 패치 적용 확인

브라우저가 예전 JS/CSS를 캐시하면 패치가 안 된 것처럼 보일 수 있다. 현재 패치가 실제로 로드됐는지는 화면에서 바로 확인한다.

- 로그인 전 화면 또는 상단 앱 제목 옆에 `UI ui-2026.06.18-quality.7`와 `브라우저 Chrome ...` 또는 `브라우저 Edge ...`가 보이면 최신 UI 파일이 로드된 것이다.
- 로그인 전 화면 또는 챗봇 창 헤더에 `챗봇 chatbot-2026.06.18-quality.7`가 보이면 최신 챗봇 UI 파일이 로드된 것이다.
- 값이 안 보이거나 예전 값이면 브라우저에서 강력 새로고침(`Ctrl+F5`)을 먼저 하고, 그래도 같으면 서버가 다른 checkout/포트를 보고 있는지 확인한다.

## 동작 규칙(가드레일)

- LLM 호출은 `src/llm.mjs` 어댑터 한 곳에서만. Ollama는 **localhost**(이 PC) 호출이라 인터넷 외부전송이 아니다.
- 모델이 안 떠 있거나 타임아웃이면 → 검색 기반 답변으로 자동 폴백(끊기지 않음).
- LLM은 ERP 기능 사실은 검색된 매뉴얼 조각만 근거로 답한다. 단, 챗봇 자체의 상태 확인·답변 품질 불만·오류·설정 불가·질문 방법 같은 자유 발화는 별도 FAQ로 끼워 맞추지 않고 `src/llm.mjs`의 챗봇 런타임 원칙으로 답한다.
- 매뉴얼이 비거나 약하면 "정리 안 됨" 또는 "화면/업무를 한 단어 더 알려 달라"로 안내하고 질문을 미응답 큐에 기록(야간 고급 LLM 갱신 입력).
- 질문 로그는 `actor_ref`와 `thread_id`를 함께 저장한다. 야간 매뉴얼 갱신은 어떤 팀원이 어느 대화에서 막혔는지 볼 수 있지만, 실제 업무 원문/첨부 본문은 저장하지 않는다.
- 이어묻기 문맥은 같은 로그인 사용자 + 같은 `thread_id`의 최근 질문 5개를 기본으로 사용한다. 새 대화(`/new`) 또는 다른 팀원의 대화는 답변 문맥에 섞지 않는다.
- 브라우저는 현재 `thread_id`와 최근 화면 로그를 저장하므로, 새 대화 버튼이나 `/new`를 누르기 전까지는 새로고침해도 같은 대화로 이어진다. 명시적으로 새 대화를 시작하면 이전 문맥을 일부러 끊는다.
- 이전 질문은 "그거/아까/그러면" 같은 짧은 질문을 해석하는 보조 신호일 뿐이며, 답변 근거는 항상 검색된 매뉴얼 조각이다.
- 챗봇 답변은 `manual_chat_pipeline_v1` 단계로 돈다: 질문 정규화 → 같은 대화 문맥 조회 → 매뉴얼 검색 → 질문 로그 저장 → 검색 답변 구성 → 필요 시 로컬 LLM 표현. API 응답에는 raw 이전 질문이 아니라 안전한 pipeline 단계 요약만 노출한다.
- LLM은 매뉴얼 안의 운영자용 설정을 일반 팀원의 직접 행동처럼 말하지 않는다. 팀원 질문에는 "지금 할 수 있는 재질문/기록/관리자 전달"로 바꿔 안내하고, 설정값은 운영자에게 전달할 항목으로만 표현한다.
- 챗봇 답변은 한 문단으로 길게 붙여 쓰지 않는다. 로컬 LLM 프롬프트는 짧은 문단 2~3개, 전체 250자 안팎, 절차는 최대 3줄 목록으로 제한한다. 프런트는 그래도 길게 들어온 AI 답변을 문장 단위로 나눠 보여준다.
- `ERP_CHAT_LLM_ASSIST_WEAK` 기본값은 ON이다. 강한 FAQ 매칭이 없어도 로컬 LLM이 자유 발화를 런타임 원칙으로 처리할 수 있게 하기 위함이다. OFF로 두면 약매칭/미매칭은 예전처럼 후보 또는 미정리 안내만 보여준다.
- 프런트 채팅창은 보낸 직후 AI 말풍선에 `전송됨 · 답변 대기중` 자리표시와 상태 줄을 보여준다. `.....`, `~~~`처럼 즉시 폴백될 수 있는 짧은 입력도 사용자가 볼 수 있도록 대기 말풍선은 최소 약 0.7초 유지한다. 곧이어 `답변 준비중`, 매뉴얼/로컬 모델 확인 중으로 바뀌고, 약 8초가 지나면 `조금 오래 걸리고 있어요`로 바꿔 멈춘 것이 아니라 처리 중임을 알려준다. 상태 줄은 `role="status"` live region 으로 노출하고, 실패 시에도 재시도 안내를 상태 줄에 남긴다.
- 응답 중에는 `보내기`를 잠시 비활성화해 같은 사용자의 연속 중복 요청이 한꺼번에 쌓이지 않게 한다. 여러 팀원이 동시에 질문하는 경우에는 서버 큐(`ERP_LLM_CONCURRENCY`, `ERP_LLM_QUEUE_WAIT_MS`)가 처리하고, 오래 걸리면 검색 기반 폴백으로 응답한다.
- 작은 모델(2B 등)은 표현을 다듬는 수준. 품질이 아쉬우면 4B~9B로 키운다.
