# 부록 B. 다과제(N개 과제) 구조 검토 (2026-08-19, 읽기 전용 검토)

Owner 질문("엔진이 무한대로 과제를 등록해도 되는 구조인가?")에 대한 서브 에이전트(Opus, 읽기 전용) 검토 결과. 결론과 최소 변경은 09장 9.0/9.1E에 옮겨 적는다. 파일 인용은 저장소 상대경로.

## 결론 한 줄

엔진의 **판단** 부분은 과제 수에 상관없이 깨끗하다(규칙은 공유 자산, 프로필은 과제별). 그러나 판단을 밖에 내주는 **문(MCP 서버)은 "한 프로세스 = 한 과제"로 못 박혀 있고 과제 목록이라는 개념 자체가 코드에 없다** — P26-014를 가정하진 않지만 "동시에 한 과제만"을 가정한다. 디스크에는 이미 과제 폴더가 14개 있는데 엔진이 다뤄 본 것은 1개다.

## 1. 지금 구조 — 무엇이 과제별이고 무엇이 전역인가

| 항목 | 과제별? 전역? | 문제 |
| --- | --- | --- |
| MCP 서버 프로세스 | 과제별(강제) | `mcp/engine_mcp_server.mjs`는 `--profile` 하나를 필수로 받고 그 외 플래그는 `--repo-root`뿐. 과제를 바꾸려면 프로세스를 새로 띄워야 함 |
| 도구 13종의 인자 | 과제별(암묵) | `mcp/tools/*.mjs` 어느 것도 `project_code`를 받지 않고 전부 `ctx.profile.*`을 읽음. 과제 지정 수단이 도구 층에 없음 |
| 프로필 파일 | 과제별(설계대로 좋음) | `mcp/project_profile.mjs` — 키 정확 일치, 절대경로·`..` 금지·세 뿌리 안 |
| 영수증 파일 | 과제별이지만 강제 아님 | `receipts_dir`는 `_workmeta` 아래이기만 하면 됨 → 두 과제가 같은 폴더를 적어도 막지 않음(`mcp_tool_calls.jsonl` 섞임) |
| 실행 뿌리 `runs_root` | 위와 동일 | `<project_code>` 포함 규칙 없음 |
| 규칙 스펙(compiled variant·발주처 overlay) | 전역 공유 — 좋음 | `.registry/skills/se_foldertree_generate/codex/assets/**`. 과제는 가리키기만 함(12장 §12.3). 100개 과제여도 규칙 사본 1벌 |
| 순수 계산층 | 전역 공유 — 좋음 | `stage_rules/`·`observation/`·`guidance/`는 파일·시계·네트워크를 안 쓰고 과제 상태를 들고 있지 않음 |
| 경로·`_workmeta` 정책 | 전역 공유 — 좋음 | `guild_hall/validate/path_length_policy.mjs`, `workmeta_payload_policy.mjs`; 문이 같은 함수를 부름(`mcp/engine_context.mjs`) |
| 엔진 버전 | 전역 | `topology/ENGINE_VERSION`(0.0.0) |
| 메모리 캐시 | 프로세스별, 비우지 않음 | `mcp/engine_context.mjs`의 `cache` Map. 특히 `loadObservations`가 캐시되어 **같은 세션에서 `observe_confirm`으로 새 관측을 확정해도 뒤이은 `judge_run`은 옛 관측을 씀** — 과제 수와 무관한 현재 버그 |
| 동시성 계약 | 설계만 있고 연결 안 됨 | `contracts/lane_1d_mcp_concurrency_v0.md`·`kernel/mcp_contract.mjs`는 과제별 캐시 격리·CAS·직렬 lane을 규정하지만 문(`mcp/engine_context.mjs`·`engine_mcp_server.mjs`)은 import 하지 않음 |
| 잠금(lock) | 없음 | MCP 쓰기 도구에 잠금 없음. 충돌 방지는 create-only 쓰기에만 의존 |
| 과제 목록(레지스트리) | 아예 없음 | "엔진이 서빙할 수 있는 과제"를 적어 둔 파일이 없음. `WORKSPACE_PROJECT_MODEL.md`는 `_workmeta/<project_code>/`가 분리된 registry가 아니라고 명시 |

특별히 확인한 세 가지:
1. **훑기 비용이 크다.** `tools/artifact_observation_inventory_runner.mjs`는 과제 폴더 전체를 걸으며 모든 파일을 sha256 해시한다. 실측 P26-014: 파일 10,038개 / 약 8.7 GB. 증분 모드 없음(09장 9.1D에 만들 것으로 적힘).
2. **과제 폴더는 OneDrive로 가는 junction이다.** 경로 예산은 저장소 상대경로+13자 접두어로 계산하는데 실제 Windows 프로그램이 여는 경로는 OneDrive 쪽이라 더 길다 — 예산이 실제보다 낙관적.
3. **과제면 쓰기는 경로 예산 검사를 안 받는다.** `ctx.assertWritableTarget`가 부르는 `validateWorkmetaWriteTarget`는 대상이 `_workmeta` 밖이면 `{ok:true, applies:false}`로 통과. `judge_run`은 `outputs_root/<run_id>/<stage>/`에 파일 6개를 쓰고 `run_id`는 60자까지 허용 → 200자 초과가 조용히 통과.

## 2. 규모별 병목

| 규모 | 병목 |
| --- | --- |
| 10개 | 서버 프로세스 10개(클라이언트 설정 10줄, 도구 130개로 비서가 도구를 못 고름 — 부록 A의 40개 한계 초과); 훑기 한 바퀴 ≈ 87 GB; 목록 없음; 프로필 실수 한 번이면 영수증 섞임(감지 없음) |
| 100개 | 프로세스-per-과제 사실상 불가 → 한 서버+과제 지정으로 바꿔야 함; 훑기 ≈ 870 GB(증분 없이는 불가); `project_status`가 `listRuns()`를 단계마다 다시 부름(단계 8×실행 1,000 = 디렉터리 읽기 9,000회); `guard:workmeta-write` 인자 없이 부르면 `_workmeta` 전체를 다시 걸음; 과제면 쓰기 경로 초과가 실제로 터짐 |
| 1000개 | 목록·실행 응답이 한 응답에 안 들어감(페이지 필요); `run_id`는 과제 안에서만 고유 → 과제 가로지르는 장부는 `<project_code>+<run_id>` 복합키 필수; 잠금이 없어 같은 이름 `judge_run` 둘이 경합하면 반쪽 실행 폴더가 남고 치우는 코드 없음; 한 서버로 합치면 캐시가 절대 안 비워져 메모리가 과제 수에 비례해 커짐(LRU 필요); `_workmeta` 가드가 `tmp`·`temp`·`renders`·`screenshots` 조각을 거부하는데 `run_id` 규칙은 `tmp`를 허용 → 언젠가 부딪힘 |

## 3. 최소 변경 목록 (우선순위, 크기 S/M/L)

| # | 변경 | 크기 | 왜 지금 |
| --- | --- | --- | --- |
| 1 | **과제 레지스트리 파일 하나** — 실체는 private `_workmeta/system/` 아래(`WORKMETA_MINIMUM_SCHEMA.md`가 공용 lane으로 예약), 내용은 `project_code` → 프로필 경로. public에는 계약 문서 + 합성 예시만(`examples/se_stage_rules/project_profile_synthetic_v0.json` 방식) | S | 목록이 없으면 나머지를 걸 자리가 없음 |
| 2 | **프로필 검증 두 줄** — `receipts_dir`·`runs_root`는 `_workmeta/<project_code>/` 아래여야 함 | S | 두 과제 영수증 섞임을 구조적으로 차단 |
| 3 | **과제면 쓰기에도 경로 예산** — `ctx.writeCreateOnly`가 평면 무관하게 `classifyPath`를 부르고 `revision_label` 상한을 60→24자쯤 | S | 지금도 조용히 새는 구멍 |
| 4 | **과제별 쓰기 잠금** — `judge_run`·`observe_scan`·`observe_confirm` 진입 시 create-only 잠금, 잡혀 있으면 대기가 아니라 거절(계약 `lane_1d` §4.3) | S | 반쪽 실행 폴더 방지 |
| 5 | **캐시 무효화** — 쓰기 도구 성공 시 `observations`·`compile:*` 캐시 버림 | M | 과제 수와 무관한 현재 버그 |
| 6 | **도구가 `project_code`를 받게 + `projects_list` 1개** — 서버 하나, 레지스트리를 읽어 과제별 컨텍스트를 만들고 캐시 키에 `project_code`; `kernel/mcp_contract.mjs`의 `cacheKey`·`assertCacheEntryServesRequest`를 문에 연결 | M | 20~30개에서 반드시 필요 |
| 7 | **훑기 증분화 + 스케줄링** — 크기·수정시각 그대로면 해시 생략, `03_Out`만 모드, 동시 훑기 2~3개 제한 | M | 100개에서 유일한 물리적 한계 |
| 8 | **실행 색인 파일** — `judge_run` 끝에 `runs_index.jsonl` append → `project_status`가 폴더를 다시 안 걸음 | M | 실행 수백 개 뒤엔 되돌리기 어려움 |
| 9 | 한 서버 + 레지스트리로 완전 전환, 목록 응답 페이지 나누기 | L | 100개 이상 |

## 4. 하지 말 것

- 한 프로필에 두 과제 경로를 섞지 말 것(프로필 = 과제 하나가 유일한 격리 장치).
- `receipts_dir`·`runs_root`·`observations_dir`를 과제끼리 공유하지 말 것(섞이면 되돌릴 수 없음).
- `run_id`를 전역 유일하게 하려고 전역 카운터 파일을 두지 말 것(새 병목). `<project_code>+<run_id>` 복합키로 충분.
- 규칙 스펙을 과제별로 복사하지 말 것(지금처럼 가리키기만).
- 바쁜 lane에서 조용히 대기시키지 말고 거절할 것(계약).
- 과제 코드·발주처명·OneDrive 절대경로를 public 파일에 넣지 말 것(레지스트리 public 사본은 모양만).
- 이 작업으로 문을 켜지 말 것(활성화·클라이언트 등록은 Owner 결정).
- 새 top-level 폴더나 새 스키마를 Owner 계약 없이 만들지 말 것(1~8번은 기존 뿌리 안에서 끝남).

## 비유

규칙 창고와 계산기는 과제 1000개를 감당하도록 지어졌다. 문제는 **창구가 하나뿐이고, 아침에 어느 과제 서류철을 집어 들면 하루 종일 그 과제만 본다**는 것. 다음 한 걸음은 **과제 명부 한 장**(1번, S)이다.
