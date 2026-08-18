# 12. MCP 문 — 밖에서 엔진을 부르는 자리

`guild_hall/engineering_engine/mcp/`의 서버 하나와 도구 13개가 하는 일을 처음 보는 사람이
읽고 고칠 수 있게 적는다. 코드가 정본이고 이 장은 그 지도다.

**지금 상태: 만들어졌고 꺼져 있다.** 어디에도 등록하지 않았고 어떤 클라이언트 설정에도 넣지 않았다.
켜는 것은 Owner 결정이다(9.0.5).

## 12.1 목적 — 문은 하나

Owner 결정(9.1A): **밖에서 엔진을 부르는 정문은 MCP 하나다.** 팀원·AI 비서·Owner 모두 이 문으로 묻고,
답과 관측도 이 문으로 넣는다. 터미널 CLI 제품은 만들지 않는다. 지금 있는 runner·드라이버는 내부용이며
개발·검증·야간 예약 실행이 치는 것이다.

문은 **로직을 갖지 않는다.** 도구 하나하나가 하는 일은 프로필이 지정한 파일을 읽고, 이미 있는 순수 함수나
runner를 그대로 부르고, 그 결과를 사람이 읽는 마크다운과 기계가 읽는 JSON 두 벌로 내는 것뿐이다.
규칙도 판정도 이 층에 없다 — 있으면 같은 질문에 두 답이 생긴다.

```text
사람/AI 비서 ──MCP(stdio JSON-RPC)──▶ 도구 13 ──▶ compileStageRules · orderStageWork · buildGuideCards
                                          │          buildInstructionPackets · renderNextStepsAnswer
                                          │          applyConfirmationSheet · generatePilotPacket…
                                          └──spawn──▶ 관측 runner · 판단 runner (1회 zero-write)
                                          └──append─▶ `_workmeta` 영수증 한 줄(메타데이터만)
```

## 12.2 켜고 끄기 — 스위치 두 개

```text
node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --profile <abs project_profile.json> [--repo-root <abs>]
```

| 환경변수 | 없으면 | 있으면(`on`) |
| --- | --- | --- |
| `SOULFORGE_ENGINE_MCP` | 한 줄 거절 출력 후 **exit 3**. 아무것도 열리지 않는다 | 서버가 뜨고 읽기 도구가 열린다 |
| `SOULFORGE_ENGINE_MCP_WRITE` | 쓰기 도구는 `tools/list`에 **보이되** `tools/call`이 `WRITE_TOOLS_DISABLED`로 거절 | 쓰기 도구도 실행된다 |

스위치가 둘인 이유: "비서가 규칙을 읽게 한다"와 "비서가 과제 자료면에 쓰게 한다"는 서로 다른 결정이고,
Owner가 따로 내린다. 꺼진 쓰기 도구를 목록에서 **숨기지 않는** 이유도 같다 — 숨기면 "꺼짐"이 "없음"처럼
보이고, 없다고 들은 것을 사람이 요청할 수는 없다.

프로필을 못 읽거나 계약에 안 맞으면 서버는 뜨지 않고 **exit 4**로 이유를 한 줄 남긴다. 반쯤 묶인 문을
여는 것보다 안 여는 편이 낫다.

## 12.3 프로필 — 과제 하나당 파일 하나

문은 과제 지식을 갖지 않는다. 어느 규칙 층 위에 서는지, 관측이 어디 있는지, 영수증이 어디로 가는지는
전부 **private 프로필 JSON 한 장**이고, `mcp/project_profile.mjs`가 그 장을 통과시키는 문지기다.
계약은 `soulforge.engine_project_profile.v0`, 두는 자리는 과제 자료면(`_workspaces/<project>/…/06_validation/project_profile.json`)이다.

| 필드 | 뜻 | 뿌리 |
| --- | --- | --- |
| `project_code` | 과제 코드(폴더·영수증 이름에 쓰이므로 엄격한 토큰) | — |
| `business_type` · `prime` · `quality_grade` | 사람이 읽는 표시 라벨(한국어 가능) | — |
| `compiled_variant` | 사업유형 compiled 스펙 | 규칙 자산 또는 과제면 |
| `overlays[]` | ③ 발주처 · ④ 과제 덧씌움(op를 순서대로 이어 붙인다) | 규칙 자산 또는 과제면 |
| `overlay_conditions[]` | 켜진 조건 토큰 | — |
| `project_binding` | 과제 결속(인라인 객체 또는 파일 경로) | 과제면 |
| `base_packet` · `base_launch` | 직전 accepted 실행의 packet·launch(판단 실행이 쓰는 틀) | 과제면 / 메타면 |
| `alias_patterns` | 과제가 등록한 이름 모양(없으면 `null`) | 과제면 |
| `project_root` · `outputs_root` · `observations_dir` | 과제 폴더 · 실행 산출 뿌리 · 이번 관측 실행 | 과제면 |
| `receipts_dir` · `runs_root` | 도구 호출 영수증 · 판단 실행 뿌리 | 메타면 |
| `known_at_policy` | `caller_supplied` 하나만 | — |

**경로 규칙 두 줄.** (1) 모든 경로는 절대경로이고 `..`을 담지 않는다 — 원문 그대로 검사한다(정규화는 `..`을
지워 버려서, 안에 있는 것처럼 읽히는 경로가 밖으로 풀리는 바로 그 길이다). (2) 모든 경로는 이 저장소가
이미 가진 세 뿌리 안에 있어야 한다.

| 뿌리 | 어디 | 무엇 |
| --- | --- | --- |
| 과제면 | `_workspaces/**` | 과제가 소유한 것 |
| 메타면 | `_workmeta/**` | 실행을 기록하는 것 |
| 규칙 자산 | `.registry/skills/se_foldertree_generate/codex/assets/**` | compiled 스펙·발주처 overlay(과제는 가리키기만 하고 복사하지 않는다) |

키 집합은 **정확히** 이 목록이다. 모르는 키는 무시하지 않고 거절한다 — 무시된 키는 쓴 사람이 켜져 있다고
믿는 설정이다. `observations_dir`는 `outputs_root` 아래, `outputs_root`는 `project_root` 아래여야 한다.
이 불변식이 있어서 확인표 경로를 호출자에게서 받아도 "관측 폴더 아래냐"가 답이 정해진 검사가 된다.

public 예시는 `docs/architecture/workspace/examples/se_stage_rules/project_profile_synthetic_v0.json`이며
경로는 전부 `<abs>` 자리표시자다(실제 경로는 private이라 public 파일에 넣지 않는다). 시험이 이 예시의 키
집합을 검증기의 필수 키와 대조하므로 문서와 코드가 따로 놀 수 없다.

## 12.4 도구 13종

읽기 9 · 쓰기 4. "부르는 것" 칸이 이 층에 로직이 없다는 증거다.

| # | 이름 | 사람이 묻는 말 | 부르는 것 | 쓰기 |
| --- | --- | --- | --- | --- |
| 1 | `rules_layers` | "이 과제엔 무슨 규칙이 붙어?" | compiled 스펙·overlay 신원(컴파일 안 함) | 읽기 |
| 2 | `rules_stage` | "CDR에 뭐가 있어야 해? 순서는?" | `compileStageRules` + `orderStageWork` | 읽기 |
| 3 | `rules_card` | "SEMP는 왜·언제·어떻게 만들어?" | `buildGuideCards` 중 한 장 | 읽기 |
| 4 | `rules_version` | "이 규칙은 어느 판이야?" | `topology/engine_release.json` 그대로 | 읽기 |
| 5 | `observe_scan` | "폴더 한번 훑어봐" | `artifact_observation_inventory_runner` spawn | **쓰기** |
| 6 | `observe_register` | "이 파일이 HDD 최종본이야" | 후보 한 줄 append(관측 아님) | **쓰기** |
| 7 | `observe_confirm` | "이 폴더는 맞아 / 이건 아니야" | `applyConfirmationSheet` + `buildArtifactObservationsFromConfirmed` | **쓰기** |
| 8 | `observe_status` | "지금 관측된 게 뭐야?" | 관측 실행 파일 수치 | 읽기 |
| 9 | `judge_run` | "지금 판단해줘" | 컴파일 → `generatePilotPacketFromStageRules` → 판단 runner 1회 | **쓰기** |
| 10 | `judge_result` | "그때 그 판단 다시 보여줘" | 저장된 영수증 요약 | 읽기 |
| 11 | `judge_diff` | "지난번이랑 뭐 달라졌어?" | 영수증 둘 비교 | 읽기 |
| 12 | `next_steps` | **"이제 뭐 해야 해?"** | `orderStageWork`→`buildGuideCards`→`buildInstructionPackets`→`renderNextStepsAnswer` | 읽기 |
| 13 | `project_status` | "이 과제 지금 어디쯤이야?" | 전 단계 최근 판정 + 막힌 수 + 청소 총계 | 읽기 |

몇 가지 판단이 도구 정의에 박혀 있다.

- **`observe_register`는 관측을 만들지 않는다.** 자동 확정 3조건(10장 §10.3 +1) 중 어느 것도 "채팅에서
  누가 그랬다"가 아니다. 등록된 줄은 `decision: null`로 `registered_candidates.jsonl`에 남아 사람 확인을
  기다린다. 여기서 바로 관측으로 넣으면 문이 D37이 안 지켜지는 유일한 자리가 된다.
- **`next_steps`는 파일을 쓰지 않는다.** CLI(`engine_next_steps_runner`)의 create-only 출력은 답을 **기록**으로
  남기기 위한 것이고, 호출로 돌려주는 답은 기록이 아니다. 같은 함수 넷을 같은 순서로 부르되 저장하지 않는다.
- **판정은 복사한다.** `next_steps`가 쓰는 판정은 저장된 실행 영수증(`run_id` 생략 시 그 단계를 판단한 가장
  최근 실행)이며 다시 계산하지 않는다(11장 §11.4).
- **`judge_run`의 산출물 자리는 둘로 갈린다.** packet과 컴파일 결과는 과제면으로 간다 — 판단 runner가 packet
  위치를 **과제 폴더 기준 상대경로**로 풀기 때문에 다른 곳에 둘 수 없다. launch와 판정 stdout은 메타면
  `runs_root/<run_id>/` 아래로 간다. 전부 create-only다.
- **자유 경로를 받지 않는다.** 호출자가 경로를 대는 자리는 `observe_confirm`의 확인표 하나뿐이고, 그것도
  프로필이 지정한 관측 폴더 아래여야 한다. `observe_scan`이 받는 것은 폴더 **이름**이지 경로가 아니다.

## 12.5 영수증 — 호출마다 한 줄, 메타데이터만

`tools/call`이 도구에 닿을 때마다 `receipts_dir/mcp_tool_calls.jsonl`에 한 줄이 붙는다
(`soulforge.engine_mcp_tool_call_receipt.v0`).

| 칸 | 내용 |
| --- | --- |
| `logged_at` · `duration_ms` | 언제, 얼마나 걸렸나(이 시각은 문의 시계다 — 엔진 입력의 `known_at`은 언제나 호출자가 댄다) |
| `tool` · `write` · `write_enabled` | 어느 도구, 쓰기인가, 그때 쓰기 스위치가 켜져 있었나 |
| `status` · `error_code` | `OK` 또는 `REFUSED` + 거절 코드 |
| `args_digest` · `result_digest` | 인자와 결과의 sha256 앞 32자 |
| `engine_version` · `project_code` | 어느 판, 어느 과제 |

**원문은 한 글자도 들어가지 않는다.** 인자도 결과도 파일 이름도 경로도 아닌 digest만 남는다. 시험이
`arguments`·`result`·`content`·`file_ref`·`path` 같은 키가 줄에 나타나지 않는지 확인한다.
거절도 한 줄을 남긴다. 존재하지 않는 도구 이름은 도구에 닿지 못했으므로 프로토콜 오류만 남고 도구 영수증은 없다.

`_workmeta`에 쓰기 전 저장소의 `guard:workmeta-write`와 **같은 정책 함수**(`validateWorkmetaWriteTarget`)를
문이 직접 부른다. 정책이 하나라서 문이 예외가 되지 않는다.

## 12.6 프로토콜 — 손으로 짠 JSON-RPC 2.0

새 npm 의존성을 더하지 않았다. 메서드가 다섯이면 직접 짜는 편이 읽기 쉽다.

- 전송: stdio, 줄 단위 JSON(줄 안에 개행 없음). `protocolVersion`은 `2025-06-18`.
- 메서드: `initialize` · `notifications/initialized`(알림, 응답 없음) · `ping` · `tools/list` · `tools/call`.
- 결과: `content: [{type:'text', text: <마크다운>}]` + `structuredContent`(같은 내용의 JSON) + `_meta.engine_version`.
- 도구 거절은 JSON-RPC 오류 `-32000`이고 `data.code`에 엔진 코드가 들어간다(`WRITE_TOOLS_DISABLED`,
  `ENGINE_MCP_STAGE_UNKNOWN` 등). 모르는 도구는 `-32602`, 모르는 메서드는 `-32601`, 깨진 줄은 `-32700`이며
  세션은 계속된다.
- `engine_version`은 `topology/ENGINE_VERSION`에서 읽어 `initialize.serverInfo`와 모든 결과에 싣는다
  (현재 `0.0.0` = 만드는 중).

## 12.7 잠금 — 문이 못 하는 것

9.1A의 잠금 그대로이고 문이 새로 만든 잠금은 없다.

- 판단 실행은 launch 파일 + sha 핀으로만 시작하고 Owner 동결 grant 아래서 1회 돌며 엔진 effect는 전부 0이다.
- 엔진은 Task를 만들지 않고 승인하지 않고 canon을 올리지 않고 ERP에 쓰지 않는다.
- 문이 쓰는 곳은 프로필이 지정한 네 자리(관측 폴더 · 실행 산출 폴더 · 실행 뿌리 · 영수증 폴더)뿐이고 전부 create-only다.
- 규칙을 바꾸는 도구는 없다. 규칙이 틀리면 스펙(정본)을 고치고 export한다(9.2의 3번).

## 12.8 시험과 실측

`npm run validate:se-mcp` — 2026-08-18: **28**.
프로필 검증 6 · 도구 16(합성 fixture 대조·결정론·쓰기 거절) · 프로토콜 6(자식 프로세스로 실제 stdio 왕복).
fixture는 `project_profile_synthetic_v0.json`(프로필 모양 + 합성 관측 실행)과 기존
`next_steps_synthetic_v0.json`(규칙 + 합성 판정)이며, `fixtures/engine_mcp_synthetic_project.mjs`가
그 둘을 임시 폴더에 과제 모양으로 깔아 준다. 실제 과제 자료는 시험에 들어가지 않는다.

핵심 시험 셋: (1) 읽기 도구가 낸 JSON이 **같은 순수 함수를 직접 부른 결과와 바이트로 같다**(로직이 새지
않았다는 뜻). (2) 서버를 껐을 때 exit 3, 프로필이 나쁠 때 exit 4, 쓰기 스위치가 꺼졌을 때
`WRITE_TOOLS_DISABLED`. (3) 호출마다 영수증 한 줄이 붙고 그 줄에 원문 키가 없다.

**P26-014 첫 실측(2026-08-18, 두 스위치 다 켠 자식 프로세스, 읽기 3회):**

| 부른 것 | 답 |
| --- | --- |
| `rules_stage 030_SRR` | 요구 22 · 순서 목록 22(안 막힘 19 · 막힘 3) · 게이트 역할 core 3 / entry 2 / supporting 17 · 첫 5개는 체계요구사항명세서부터 |
| `next_steps 120_CDR` | 실행 04 인용 · 카드 28 · 지시서 3 · 요구 27(충족 5 · 결손 4 · 불명 18) |
| `project_status` | 8게이트 중 7 컴파일, 합계 충족 5 · 결손 4 · 불명 95 · 청소 알림 19 · 240_LL은 정본 필수 항목이 없어 컴파일 거절을 그대로 표시 |

수치가 07장 run 04와 같다 — **문이 판정을 바꾸지 않았다**는 것이 이 실측의 요점이다.
영수증은 6줄(같은 3회를 두 번 돌렸다), 전부 `write: false`.

## 12.9 한계 — 지금 못 하는 것

| 한계 | 뜻 | 어디서 풀리나 |
| --- | --- | --- |
| 답을 넣는 도구가 없다 | "그건 우리 과제엔 해당 없어"를 받는 자리가 아직 없다 | 답변 우편함(B2) |
| 기한·담당자가 빈다 | `context_fill` 공급 경로가 없어 지시서의 그 두 칸이 비어 나온다 | 맥락 채우기(B2) |
| 과제 착수 도구가 없다 | 5입력으로 새 과제를 세우는 자리 | C1 |
| 문서 내용 검사가 없다 | "있다"까지만 답한다 | D1(합의됨, 없음) |
| `observe_scan` 뒤 프로필을 사람이 고쳐야 한다 | 새 관측 폴더를 쓰려면 `observations_dir`를 Owner가 옮겨 적는다. 도구가 자기 프로필을 고치게 두지 않았다 | 프로필 갱신 도구(미정) |
| 예약 실행이 없다 | 엔진 안에 시계가 없다. 밤에 도는 것은 운영 스케줄러의 몫이다(9.1C) | B3(엔진 밖) |
| 켜져 있지 않다 | 어떤 클라이언트에도 등록하지 않았다 | Owner 결정 |

## 12.10 다음 (계획 순서)

1. **B2 답변 우편함** — 답 도구(누가·언제·무엇에·근거) + 맥락 채우기(기한·담당). 지금 손으로 관측 파일에
   적는 그 답이 도구로 들어오면 같은 질문이 반복되지 않는다.
2. **B3 야간 예약 실행** — 엔진 밖 스케줄러가 `judge_run`에 해당하는 runner를 부른다.
3. **C1 과제 착수** — 5입력 → 폴더트리 · 전 단계 컴파일 · 프로필 생성 · 첫 판단.

## 12.11 이 부품을 고칠 때 순서

1. **도구를 더할 때**: `mcp/tools/<name>.mjs`에 `{name, title_ko, description_ko, inputSchema, write, handler}`를
   내보내고 `tools/index.mjs`에 한 줄 더한다. 모양이 안 맞으면 호출 때가 아니라 import 때 깨진다.
   **핸들러에 로직을 넣지 않는다** — 필요한 계산이 없으면 그 계산을 순수 층에 먼저 만든다.
2. **프로필을 바꿀 때**: `project_profile.mjs`의 필수 키와 뿌리 표, `project_profile_synthetic_v0.json`,
   이 장 §12.3을 같은 변경에서 고친다(시험이 셋을 묶어 놓았다).
3. **시험**: fixture 먼저, 그다음 시험, 그다음 코드. 읽기 도구를 고쳤으면 "순수 함수 직접 호출과 같은 JSON"
   시험이 자동으로 잡는다.
4. **검증**: `npm run validate:se-mcp` → `validate:se-stage-rules` · `validate:se-guidance` ·
   `validate:se-observation` → `validate:canon` · `validate:path-length` · `validate:path-policy` →
   `emit_manifest --verify`(시험이 `tests/`에 있으면 매니페스트가 바뀐다) → `validate:engine-release`.
5. **문서**: 이 장, README의 합의 목록, 엔진 `README.md`, `CHANGELOG.md`.
6. **켜지 않는다.** 활성화와 클라이언트 등록은 Owner 결정이며 코드 변경으로 하지 않는다.
