# dev-ERP 모델 비활성 및 RAG 전용 로컬 LLM 정책

## 현재 결정

2026-07-23 owner 결정으로 dev-ERP는 생성 모델을 사용하지 않는다.

- ERP 채팅: `stub` 고정. 매뉴얼/FAQ 검색과 결정적 폴백만 사용한다.
- ERP 메일 자동분류: `none` 고정. 모델 후보 생성 없이 기존 격리·결정적 경로만 사용한다.
- ERP 완료 요약·업무 분할 제안: 모델 호출 없음.
- ERP 시작 배치, 백그라운드 런처, watchdog, NSSM 기본값: 모델 비활성.
- `ERP_CHAT_PROVIDER=ollama` 또는 `DEV_ERP_INTAKE_LLM=ollama` 환경변수만으로는
  모델을 켤 수 없다.

Ollama 어댑터 코드는 격리된 호환성 테스트를 위해 남겨 두지만, 운영 ERP 진입점은
`src/llm.mjs`의 fail-closed 정책 함수를 거쳐 `stub`/`none`만 선택한다. 다시
활성화하려면 새 owner 결정, 코드 변경, 테스트와 review가 모두 필요하다.

정본 계약은
`docs/architecture/guild_hall/KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md`다.

## RAG 전용 모델

별도 RAG 생성 세션에서만 다음 모델을 사용한다.

| 항목 | 정책 |
| --- | --- |
| 모델 | `qwen3.5:9b` |
| Ollama endpoint | `http://127.0.0.1:11434` (loopback only) |
| GPU 적재 | 첫 RAG 생성 요청 시 on-demand |
| 요청 `keep_alive` | `5m` |
| 세션 종료 | `ollama stop qwen3.5:9b` |
| background prewarm | 금지 |
| ERP가 RAG 생성을 호출 | 금지 |

Ollama 데몬이 실행 중인 것과 모델이 GPU에 올라가 있는 것은 다르다. 데몬은
localhost에서 대기할 수 있지만 `ollama ps`가 비어 있으면 모델은 GPU 메모리를
점유하지 않는다. 첫 RAG 생성 요청이 모델을 올리고, 세션 종료 명령이 즉시
내린다. 종료 명령이 누락되었을 때는 `keep_alive: 5m`가 보조 해제 장치다.

`keep_alive: 0`으로 매 요청 직후 내릴 수도 있지만 매 질문마다 콜드스타트가
발생한다. 문서 질의가 연속되는 짧은 세션에는 5분 idle lease가 속도와 VRAM
회수의 균형이 좋다.

## 운영 확인

ERP 실행 중:

```powershell
ollama ps
```

모델 목록이 비어 있어야 한다. `/api/version`의 `runtime.llm`은
`provider: "stub"`, `model: null`, `thinking: false`를 보고해야 한다.

RAG 생성 세션 중에는 `ollama ps`에 `qwen3.5:9b`와 GPU processor가 보여야 한다.
세션 종료 후:

```powershell
ollama stop qwen3.5:9b
ollama ps
```

다시 빈 목록이어야 한다. Ollama를 `0.0.0.0`에 바인딩하거나 ERP에서 다른 GPU
PC의 Ollama endpoint를 지정하는 과거 LAN 운영안은 현재 정책에서 사용하지 않는다.

## 검증

```powershell
npm.cmd --prefix ui-workspace/apps/dev-erp test
npm.cmd run validate:rag
npm.cmd run validate:knowledge-access
```

현재 `guild_hall/rag`의 결정적·extractive 경로는 모델 없이도 동작한다. 생성 답변
runner가 모든 RAG 명령에 이미 연결되었다고 주장하지 않는다. 향후 생성 runner를
활성화할 때 이 문서의 load/idle/stop 수명주기를 코드와 테스트로 먼저 닫아야 한다.
