# dev-ERP 모델 비활성 및 과거 RAG 로컬 LLM 기록

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

## 과거 RAG 전용 모델 후보 (현재 비활성)

2026-07-23 실험에서는 별도 RAG 생성 세션 후보로 다음 값을 사용했다.

| 항목 | 정책 |
| --- | --- |
| 모델 | `qwen3.5:9b` |
| Ollama endpoint | `http://127.0.0.1:11434` (loopback only) |
| GPU 적재 | 첫 RAG 생성 요청 시 on-demand |
| 요청 `keep_alive` | `5m` |
| 세션 종료 | `ollama stop qwen3.5:9b` |
| background prewarm | 금지 |
| ERP가 RAG 생성을 호출 | 금지 |

이 표는 현재 M2 모델 선택이 아니다. M2-0~M2-2는 모델 호출 없이 진행하며,
generated-answer runner와 모델은 아직 선택·활성화되지 않았다. 이후 선택적 LLM은
source-bound 품질 비교, 데이터 반출, 수명주기, Owner 승인 계약을 별도로 통과해야 한다.

역사적 운영 참고로, Ollama 데몬이 실행 중인 것과 모델이 GPU에 올라가 있는 것은 다르다. 데몬은
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

현재는 RAG 생성 세션을 시작하지 않는다. 아래 명령은 과거 후보 모델이 이미 수동으로
적재된 경우 이를 내리는 정리 참고일 뿐, 모델을 적재하거나 활성화하는 절차가 아니다.

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
runner는 활성화되지 않았다. 향후 생성 runner를 선택할 때는 이 과거 후보값을 자동
재사용하지 말고 새 비교·결정과 코드/테스트를 먼저 닫아야 한다.
