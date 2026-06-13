# 챗봇 로컬 LLM(Ollama) 연결 가이드

챗봇은 **RAG** 방식이다: 매뉴얼(FAQ)을 검색해 근거를 찾고, LLM은 **그 근거 안에서만** 답을 표현한다(매뉴얼 밖 사실은 지어내지 않음). LLM이 없으면 검색 결과를 그대로 사람형 문장으로 보여주는 폴백으로 동작한다(절대 끊기지 않음).

## 1. Ollama 설치 + 모델 받기

```bash
# 설치 (macOS)
brew install ollama
ollama serve            # 백그라운드 데몬

# 모델 받기 — VRAM 예산에 맞춰 하나 선택
ollama pull gemma2:2b   # ~1.6GB, 가장 빠름(맥미니 테스트용)
ollama pull gemma3:4b   # ~3GB, 8GB VRAM에 여유 있게 fit
ollama pull gemma2:9b   # ~5.5GB, 16GB GPU 권장(품질↑)
```

VRAM 가이드(Q4_K_M 기준, 권장은 KV캐시 헤드룸 포함): 4B≈최소4GB, 12B≈최소8GB(권장12GB), 27B≈16GB+.

## 2. 서버를 LLM 모드로 실행

```bash
ERP_CHAT_PROVIDER=ollama \
ERP_CHAT_MODEL=gemma2:2b \
node server.mjs
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `ERP_CHAT_PROVIDER` | `stub` | `ollama`로 설정 시 로컬 LLM 표현 활성화 |
| `ERP_CHAT_MODEL` | `gemma2:2b` | 받아 둔 Ollama 모델 태그 |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama 데몬 주소. **다른 PC에서 돌리면** 그 PC IP로(예: `http://192.168.0.20:11434`) |
| `ERP_CHAT_TIMEOUT_MS` | `20000` | 응답 대기 한도(초과 시 검색 폴백) |
| `ERP_CHAT_MAX_TOKENS` | `320` | 응답 최대 토큰 — 줄이면 더 빠름 |

## 속도 팁

- 모델 크기가 속도를 가장 크게 좌우: **2B≫4B>9B**. 빠른 체감엔 `gemma2:2b`/`gemma3:4b`.
- `keep_alive`로 모델을 메모리에 상주시켜 첫 응답 콜드스타트를 없앤다(기본 30분).
- `ERP_CHAT_MAX_TOKENS`를 160~240으로 낮추면 응답이 더 빨라진다(답이 짧아짐).
- 프롬프트엔 검색된 매뉴얼 상위 3조각만 넣어 토큰을 최소화한다.
- GPU PC와 ERP 서버가 **다른 머신**이면 `OLLAMA_HOST`를 GPU PC 주소로 지정(같은 LAN 권장 — 지연↓).

## 동작 규칙(가드레일)

- LLM 호출은 `src/llm.mjs` 어댑터 한 곳에서만. Ollama는 **localhost**(이 PC) 호출이라 인터넷 외부전송이 아니다.
- 모델이 안 떠 있거나 타임아웃이면 → 검색 기반 답변으로 자동 폴백(끊기지 않음).
- LLM은 검색된 매뉴얼 조각만 근거로 답한다. 매뉴얼이 비면 "정리 안 됨"으로 안내하고 질문을 미응답 큐에 기록(야간 고급 LLM 갱신 입력).
- 작은 모델(2B 등)은 표현을 다듬는 수준. 품질이 아쉬우면 4B~9B로 키운다.
