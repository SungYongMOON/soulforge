# 12. MCP 문 — 밖에서 엔진을 부르는 자리

`guild_hall/engineering_engine/mcp/`의 서버 하나와 도구 23개가 하는 일을 처음 보는 사람이
읽고 고칠 수 있게 적는다. 코드가 정본이고 이 장은 그 지도다.

**지금 상태: 만들어졌고 꺼져 있다.** 어디에도 등록하지 않았고 어떤 클라이언트 설정에도 넣지 않았다.
켜는 것은 Owner 결정이다(9.0.5). 사람이 등록·사용하는 절차는 이 장 맨 뒤 [§12.A](#12a-등록사용-안내-사람용)에 있다.

**2026-08-19 2차 착지(부록 B 최소 변경 1~6 + 9.1F 최소 접근 모델).** 문은 이제 과제 하나가 아니라
**과제 명부**를 읽고, 호출마다 **누가 부르는지(principal)**를 받아 **접근표**대로 걸러 답한다. 바뀐 다섯 줄:

| 무엇 | 전 | 후 |
| --- | --- | --- |
| 과제 | 프로세스 하나 = 과제 하나 | 명부 하나 = 과제 N개, 도구마다 `project_code`(생략하면 기본 과제) |
| 신원 | 없음 | `--principal {principal_ref, role}`. 없으면 공개 규칙 등급만, 나머지는 `SE_MCP_PRINCIPAL_REQUIRED` |
| 잠금 | 없음 | 과제·도구별 create-only 잠금. 잡혀 있으면 대기가 아니라 `SE_MCP_LANE_BUSY` 거절 |
| 캐시 | 안 비움(확정해도 옛 관측으로 판단) | 쓰기 성공마다 세대 증가 + 비움 |
| 경로 예산 | `_workmeta`만 | 모든 평면. **새로 만드는** 실행 이름(`revision_label`)은 24자 |

## 12.1 목적 — 문은 하나

Owner 결정(9.1A): **밖에서 엔진을 부르는 정문은 MCP 하나다.** 팀원·AI 비서·Owner 모두 이 문으로 묻고,
답과 관측도 이 문으로 넣는다. 터미널 CLI 제품은 만들지 않는다. 지금 있는 runner·드라이버는 내부용이며
개발·검증·야간 예약 실행이 치는 것이다.

문은 **로직을 갖지 않는다.** 도구 하나하나가 하는 일은 프로필이 지정한 파일을 읽고, 이미 있는 순수 함수나
runner를 그대로 부르고, 그 결과를 사람이 읽는 마크다운과 기계가 읽는 JSON 두 벌로 내는 것뿐이다.
규칙도 판정도 이 층에 없다 — 있으면 같은 질문에 두 답이 생긴다.

```text
사람/AI 비서 ──MCP(stdio JSON-RPC)──▶ 도구 23 ──▶ compileStageRules · orderStageWork · buildGuideCards
   (principal 첨부)                      │          buildInstructionPackets · renderNextStepsAnswer
                                          │          applyConfirmationSheet · generatePilotPacket…
                                          ├──명부──▶ 과제별 컨텍스트(LRU 8) · 과제별 잠금 · 과제별 캐시
                                          ├──접근표▶ 역할 × 자료 등급 × 도구 (거절 또는 필드 가림)
                                          └──spawn──▶ 관측 runner · 판단 runner (1회 zero-write)
                                          └──append─▶ `_workmeta` 영수증 한 줄(메타데이터만 + 누가)
```

## 12.2 켜고 끄기 — 스위치 두 개, 그리고 무엇을 서빙하는지

```text
node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --registry <abs project_registry.json>
node guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --profile  <abs project_profile.json>
  [--repo-root <abs>] [--principal '{"principal_ref":"…","role":"…"}'] [--access-table <abs>]
```

| 환경변수 | 없으면 | 있으면(`on`) |
| --- | --- | --- |
| `SOULFORGE_ENGINE_MCP` | 한 줄 거절 출력 후 **exit 3**. 아무것도 열리지 않는다 | 서버가 뜨고 읽기 도구가 열린다 |
| `SOULFORGE_ENGINE_MCP_WRITE` | 쓰기 도구가 `tools/list`에서 **숨겨지고** 직접 호출은 `WRITE_TOOLS_DISABLED` | 쓰기 도구도 목록에 나오고 실행된다 |

스위치가 둘인 이유: "비서가 규칙을 읽게 한다"와 "비서가 과제 자료면에 쓰게 한다"는 서로 다른 결정이고,
Owner가 따로 내린다. **꺼진 쓰기 도구를 숨기는 쪽으로 바꿨다**(2026-08-19, 9.1E 벤치마크 ⑪): 목록에
있는데 부르면 거절당하는 도구는 비서가 계속 다시 시도하고, 도구 23개 중 쓸 수 없는 8개를 매번 후보로
저울질한다. 대신 목록 응답이 `tools_total`·`tools_hidden`을 같이 실어 "없음"이 아니라 "지금 안 보임"임을
말한다. 스위치는 프로세스가 뜰 때 한 번 읽고 도중에 바뀌지 않으므로 `listChanged`는 `false`로 정직하게
둔다(바뀔 수 없는 알림을 약속하지 않는다).

플래그 둘(`--registry`·`--profile`)은 **양자택일**이고 둘 다 없거나 둘 다 있으면 **exit 64**다.
`--profile`은 없어진 게 아니라 "명부가 한 줄인 경우"로 남았다. 명부·프로필·접근표 중 하나라도 못 읽거나
계약에 안 맞으면 서버는 뜨지 않고 **exit 4**로 이유를 한 줄 남긴다. 반쯤 묶인 문을 여는 것보다 안 여는
편이 낫다.

## 12.2A 과제 명부 — 이 문이 서빙할 수 있는 과제

계약은 `soulforge.engine_project_registry.v0`(`mcp/project_registry.mjs`), 자리는 private
`_workmeta/system/engine/project_registry.json`(만들기 전 `npm run guard:workmeta-write --
--assert-write-target "<target>"`로 확인), public에는 모양만 있는 합성 예시
`docs/architecture/workspace/examples/se_stage_rules/project_registry_synthetic_v0.json`.

| 칸 | 뜻 |
| --- | --- |
| `project_code` | 과제 코드(엄격한 토큰). 명부 안에서 유일해야 한다 |
| `profile` | 그 과제 프로필의 절대경로(`_workspaces/**` 또는 `_workmeta/**`) |
| `display_label` | 사람이 읽는 이름(선택) |
| `status` | `active`(읽기·쓰기) · `paused`(읽기만) · `closed`(전부 거절) |
| `added_at` | 등록 시각(선택) |
| `default_project` | `project_code` 없이 부를 때 쓰는 과제. 여러 과제인데 기본이 없으면 **거절**한다(첫 줄을 고르지 않는다) |

명부는 **가리키기만 한다.** 격리는 여전히 프로필 한 장이 하고(§12.3), 명부는 어떤 프로필이 판에 올라와
있는지만 말한다. 시작할 때 모든 프로필을 읽어 검증하며, 한 과제라도 거절되면 **전부 안 연다** —
다섯 중 넷만 서빙하고 다섯째를 조용히 빼면 사람은 그 과제가 "비었다"고 읽는다.

과제별 컨텍스트는 **LRU 8개**까지 들고 있는다(`mcp/engine_contexts.mjs`). 밀려난 컨텍스트는 같은
프로필에서 다시 만들어지고, 캐시 키에 과제 코드가 들어 있어 과제 A의 조회가 과제 B의 항목에 닿을 수
없다(계약 `contracts/lane_1d_mcp_concurrency_v0.md` §6, `kernel/mcp_contract.mjs`의 `cacheKey`·
`assertCacheEntryServesRequest`를 그대로 부른다).

## 12.2B 누가 부르나 — principal과 접근표 (9.1F 최소형)

엔진 문은 **인증하지 않는다.** 로그인은 위층(비서·게이트웨이)의 일이고, 문은 그 층이 대는 신원을 믿되
**영수증에 적고 접근표대로 거른다.**

- `--principal '{"principal_ref":"…","role":"…"}'` — 역할은 `owner·pm·systems·hw·sw·quality·external` 일곱.
- **신원이 없으면**(플래그 없음) 공개 규칙 등급 ⓐ 읽기 도구(`whoami`·`engine_status`·`rules_*`)만 열리고
  나머지는 `SE_MCP_PRINCIPAL_REQUIRED`로 거절된다. "익명은 읽기 전부 허용"이 아니다 — 이름을 댈 수 없는
  호출자는 영수증에 남길 수 없다.
- 접근표는 명부 옆 `_workmeta/system/engine/access_table.json`
  (`soulforge.engine_access_table.v0`, public 합성 예시 `…/access_table_synthetic_v0.json`).
  파일이 없으면 코드에 박힌 기본표(`DEFAULT_ACCESS_TABLE_V0`)를 쓰며, 그 기본표는 9.1F를 그대로 좁게 읽은 것이다.
- **표에 없는 역할은 아무 권한도 없다**(빠뜨린 줄과 "권한 없음"이 같게 읽혀야 하고, 둘 중 안전한 쪽이 거절이다).
- 자료 등급 넷: ⓐ `public_rules` · ⓑ `team_judgment` · ⓒ `confidential_contract` · ⓓ `personal`.
  **등급이 안 붙은 것은 ⓒ로 다룬다**(fail-closed). 과제 경로·파일 이름은 ⓒ다.
- 과제별 덮어쓰기는 그 역할의 행을 **통째로 대신한다**(합치지 않는다).

거절 사유 코드는 넷이고 순서가 있다: `PRINCIPAL_REQUIRED` → `PERMISSION_DENIED` → `CLASS_EXCEEDED` →
`WRITE_DISABLED`. 순서가 있는 이유는, 도구 자체가 허용되지 않은 사람이 거절문에서 "쓰기 스위치가 꺼져
있구나"를 배우면 안 되기 때문이다. 같은 이유로 `SE_MCP_PROJECT_UNKNOWN`은 명부를 **세기만** 하고
나열하지 않는다 — 과제 결정은 접근 판정보다 먼저 일어나므로(그 과제의 view로 판정해야 하니까), 목록을
실어 보내면 신원 없는 호출자가 찍어 보며 명부를 훑을 수 있다.

**권한을 바꾸는 도구는 없다.** 접근표는 파일이고 고치는 사람은 Owner다(9.1F). `access_table` 도구는 읽기
전용이며 Owner·PM만 볼 수 있다.

**등급은 도구 단위이자 칸 단위다.** 도구 하나가 통째로 한 등급인 것이 아니라 **답 안의 칸이 도구보다
좁을 수 있다.** `engine_status`는 ⓐ지만 그 안의 과제 코드·사업유형·발주처·등급과 명부 과제 수는 ⓑ이고,
영수증 경로·접근표 경로는 ⓒ다. `rules_layers`도 ⓐ지만 과제 신원과 **규칙 파일 이름**은 ⓑ다(덧씌움 파일
이름에는 발주처와 과제가 들어 있다). 반대로 `judge_run`·`observe_scan`은 ⓑ이고 그 답이 가리키는
**쓴 자리**만 ⓒ다. 그래서 "규칙 판은 누구나, 어느 과제인지는 팀만, 어디에 있는지는 Owner·PM만"이 한
도구 안에서 동시에 성립한다.

**엔진이 실제로 거르는 자리 넷**
1. 도구 자체 — 허용 목록 밖이면 호출이 안 된다(그리고 `tools/list`에도 안 나온다).
2. 칸 — 볼 수 없는 등급의 칸은 `null`로 가리고 `_redacted`에 **무엇을·어느 등급을** 가렸는지 남긴다.
   판정 수치(ⓑ)는 그대로 간다 — 가리는 것은 이름이지 판단이 아니다. 답 봉투에 붙는 `project_code`도 ⓑ라서
   신원 없는 호출자에게는 `null`로 나간다.
3. 마크다운 — 사람이 읽는 표도 JSON과 같은 칸을 가린다(둘이 다르면 가린 의미가 없다).
4. 지시서 — `next_steps`는 Owner·PM이 아니면 자기 역할 역량(capability)의 지시서만 내고,
   `instructions_withheld_by_role`로 몇 장을 뺐는지 말한다(조용히 짧아진 목록은 "할 일 없음"으로 읽힌다).

**기본표의 쓰기 권한(Owner 결정 2026-08-19)**: 등록 `observe_register`는 팀 역할 전부, 훑기
`observe_scan`과 판단 실행 `judge_run`은 거기에 더해 **체계·품질**까지. 확정 `observe_confirm`과 권한표
`access_table`은 Owner·PM만. 셋 다 쓰기 도구라 쓰기 스위치가 꺼져 있으면 목록에도 안 보인다.

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

**문 앞 칸을 여는 과제만 쓰는 칸 다섯(2026-08-19).** 이 다섯은 유일한 선택 키다 — 없으면 파일 도구가
전부 `ENGINE_MCP_FILE_DOOR_DISABLED`로 거절하고, 문을 열기 전에 쓰인 프로필은 그대로 유효하다.
모르는 키를 무시하지 않고 거절하는 규칙은 그대로다.

| 필드 | 뜻 | 뿌리 |
| --- | --- | --- |
| `intake_dir` | 문 앞 칸(올리기) 뿌리 — 표마다 `intake_dir/<사람>/<표>/` | 과제면, `project_root` 아래 |
| `outbox_dir` | 내려받기 칸 뿌리 | 과제면, `project_root` 아래 |
| `trash_dir` | 정리한 칸을 옮겨 두는 곳(지우지 않는다) | 과제면, `project_root` 아래 |
| `ticket_policy` | `{upload_ttl_hours, download_ttl_hours, cleanup_after_days, allowed_extensions?, max_file_bytes?}` (기본 72·24·30·32종·25MB) | — |
| `confidential_dirs[]` | ⓒ로 다룰 폴더(계약·단가·발주처 원문). 이 칸만 따로 써도 된다 | 과제면, `project_root` 아래 |
| `link_issuer` | 문 옆 링크 발급기(§12.C). `{kind:'synology', env_prefix:'SOULFORGE_NAS'}` **두 칸뿐**이고 호스트·계정·비밀은 들어갈 자리가 없다. 문 앞 칸을 연 과제만 쓸 수 있다 | — |

앞 넷은 **통째로 쓰거나 아예 안 쓴다**: 넣는 칸만 있고 휴지통이 없는 문은 사람이 필요한 순간에 거절하는
문이다. 그리고 넷은 서로 겹칠 수 없고(넣기·받기·휴지통은 세 자리), 과제 폴더 자체일 수 없으며,
`confidential_dirs` 안에 있을 수 없다 — 계약 폴더 안에 문 앞 칸을 두면 그 칸을 받은 사람이 계약 폴더를
열어 보게 된다.

**경로 규칙 네 줄.** (1) 모든 경로는 절대경로이고 `..`을 담지 않는다 — 원문 그대로 검사한다(정규화는 `..`을
지워 버려서, 안에 있는 것처럼 읽히는 경로가 밖으로 풀리는 바로 그 길이다). (2) 모든 경로는 이 저장소가
이미 가진 세 뿌리 안에 있어야 한다. (3) **`receipts_dir`·`runs_root`는 `_workmeta/<project_code>/` 아래여야
한다**(2026-08-19, 부록 B 2번; 어기면 `ENGINE_MCP_PROFILE_PLANE_MISMATCH`). "그냥 `_workmeta` 아래"로는
두 과제가 같은 폴더를 적어 영수증이 섞이는 것을 못 막는다 — 섞이면 되돌릴 수 없다. (4) `observations_dir`는
`outputs_root` 아래, `outputs_root`는 `project_root` 아래여야 한다.

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

## 12.4 도구 23종

읽기 13 · 쓰기 4. "부르는 것" 칸이 이 층에 로직이 없다는 증거다. **모든 도구가 `project_code`를 선택 인자로
받는다**(생략하면 명부의 기본 과제) — 도구 하나하나가 기억해야 하는 게 아니라 `tools/index.mjs`가 모든
스키마에 붙인다. 등급 칸은 그 도구가 내는 자료의 등급이고, 등급을 볼 수 없는 역할에게는 도구가 아예 안 보인다.

| # | 이름 | 사람이 묻는 말 | 부르는 것 | 쓰기 | 등급 |
| --- | --- | --- | --- | --- | --- |
| 0a | `whoami` | "나는 뭘 할 수 있어?" | 접근표 + 도구 목록 대조 | 읽기 | ⓐ |
| 0b | `engine_status` | "엔진 지금 어떤 상태야?" | 판·규칙 지문·스위치·명부·영수증 위치 | 읽기 | ⓐ(과제 신원·명부 수 ⓑ, 경로 ⓒ) |
| 0c | `access_table` | "누가 무엇을 볼 수 있게 되어 있어?" | 접근표 그대로(Owner·PM 전용, 읽기만) | 읽기 | ⓒ |
| 0d | `projects_list` | "어떤 과제를 물어볼 수 있어?" | 명부 + 각 프로필의 표시 라벨 | 읽기 | ⓑ |
| 1 | `rules_layers` | "이 과제엔 무슨 규칙이 붙어?" | compiled 스펙·overlay 신원(컴파일 안 함) | 읽기 | ⓐ(과제 신원·파일 이름 ⓑ) |
| 2 | `rules_stage` | "CDR에 뭐가 있어야 해? 순서는?" | `compileStageRules` + `orderStageWork` | 읽기 | ⓐ |
| 3 | `rules_card` | "SEMP는 왜·언제·어떻게 만들어?" | `buildGuideCards` 중 한 장 | 읽기 | ⓐ |
| 4 | `rules_version` | "이 규칙은 어느 판이야?" | `topology/engine_release.json` 그대로 | 읽기 | ⓐ |
| 5 | `observe_scan` | "폴더 한번 훑어봐" | `artifact_observation_inventory_runner` spawn | **쓰기** | ⓑ(쓴 자리 ⓒ) |
| 6 | `observe_register` | "이 파일이 HDD 최종본이야" | 후보 한 줄 append(관측 아님) | **쓰기** | ⓑ |
| 7 | `observe_confirm` | "이 폴더는 맞아 / 이건 아니야" | `applyConfirmationSheet` + `buildArtifactObservationsFromConfirmed` | **쓰기** | ⓒ |
| 8 | `observe_status` | "지금 관측된 게 뭐야?" | 관측 실행 파일 수치 | 읽기 | ⓑ |
| 8a | `file_ticket` | "파일 어디에 올려요?" / "그거 좀 받을 수 있어요?" | 표 발급 + 칸 폴더 create-only(내려받기는 복사까지) | **쓰기** | ⓑ(자리 ⓒ) |
| 8b | `file_put` | "이 작은 파일 넣어줘" | 칸에 바이트 저장(해시 확인, 25MB) | **쓰기** | ⓑ |
| 8c | `file_register` | "이거 CDR BOM 최종본이야" | 규칙이 정한 업무폴더 `03_Out`으로 이동 + `buildArtifactObservationCandidates` → 관측/확인 대기 | **쓰기** | ⓑ(자리 ⓒ) |
| 8d | `file_get` | "그 파일 내용 줘" | 등록된 작은 파일 base64(기밀 폴더는 등급 확인) | 읽기 | ⓑ |
| 8e | `file_tickets_list` | "내 표 뭐 있더라?" | 표 대장 접기(팀 역할은 자기 것만) | 읽기 | ⓑ |
| 8f | `file_tickets_gc` | "칸 정리해줘" | 끝난 표의 폴더를 휴지통으로 이동(기본 보고만) | **쓰기** | ⓒ |
| 9 | `judge_run` | "지금 판단해줘" | 컴파일 → `generatePilotPacketFromStageRules` → 판단 runner 1회 | **쓰기** | ⓑ(쓴 자리 ⓒ) |
| 10 | `judge_result` | "그때 그 판단 다시 보여줘" | 저장된 영수증 요약 | 읽기 | ⓑ |
| 11 | `judge_diff` | "지난번이랑 뭐 달라졌어?" | 영수증 둘 비교 | 읽기 | ⓑ |
| 12 | `next_steps` | **"이제 뭐 해야 해?"** | `orderStageWork`→`buildGuideCards`→`buildInstructionPackets`→`renderNextStepsAnswer` | 읽기 | ⓑ |
| 13 | `project_status` | "이 과제 지금 어디쯤이야?" | 전 단계 최근 판정 + 막힌 수 + 청소 총계 | 읽기 | ⓑ |

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
- **자유 경로를 받지 않는다.** 호출자가 경로를 대는 자리는 `observe_confirm`의 확인표와 파일 도구의
  `artifact_ref` 둘뿐이고, 확인표는 프로필이 지정한 관측 폴더 아래, `artifact_ref`는 **과제 폴더 기준
  상대 포인터**로만 받아 과제 폴더 안으로 풀린다(드라이브 문자·선행 구분자·`..` 전부 거절).
  `observe_scan`이 받는 것은 폴더 **이름**이지 경로가 아니다.
- **`file_register`는 폴더를 만들지 않는다.** 옮길 자리는 규칙이 정하고(§12.B), 규칙과 폴더트리가
  다르면 거절한다. 없는 업무폴더를 만드는 문은 없는 업무를 만드는 문이다.
- **긴 목록은 쪽으로 나눈다.** `rules_layers`·`observe_status`·`judge_result`는 `limit`·`cursor`를 받고
  `page: {offset, limit, total, returned, next_cursor}`를 같이 낸다(9.1E ⑪). 커서는 앞 쪽이 돌려준 불투명한
  문자열이고, 남은 게 없으면 `next_cursor`는 `null`이다 — 길이로 짐작하게 두지 않는다.
- **인자 오류는 `isError` 결과다.** 모르는 단계 코드처럼 호출자가 고칠 수 있는 것은 프로토콜 오류가 아니라
  도구 결과로 돌아온다(비서가 읽고 고칠 수 있게). `-32000`은 권한·잠금·스위치 같은 **프로토콜 층 거절**에만
  남는다(§12.6).

## 12.5 영수증 — 호출마다 한 줄, 메타데이터만

`tools/call`이 도구에 닿을 때마다 `receipts_dir/mcp_tool_calls.jsonl`에 한 줄이 붙는다
(`soulforge.engine_mcp_tool_call_receipt.v0`).

| 칸 | 내용 |
| --- | --- |
| `logged_at` · `duration_ms` | 언제, 얼마나 걸렸나(이 시각은 문의 시계다 — 엔진 입력의 `known_at`은 언제나 호출자가 댄다) |
| `tool` · `write` · `write_enabled` | 어느 도구, 쓰기인가, 그때 쓰기 스위치가 켜져 있었나 |
| `status` · `error_code` | `OK` 또는 `REFUSED` + 거절 코드 |
| `principal_ref` · `role` | 누가 불렀나(위층이 댄 신원 그대로). 신원 없으면 둘 다 `null` |
| `access_decision` · `access_reason` | `allowed`/`refused`, 그리고 거절이면 사유 코드 넷 중 하나 — 이 두 칸이 9.1F가 말한 **접근 로그**다 |
| `data_class` | 그 도구가 내는 자료 등급 |
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
- **거절이 둘로 갈린다**(2026-08-19). 호출자가 고칠 수 있는 것(모르는 단계, 잘못된 커서, 이미 있는 산출,
  runner 거절)은 `isError: true` **도구 결과**로 돌아오고 `structuredContent.error_code`에 코드가 들어간다.
  프로토콜 층 거절 — `WRITE_TOOLS_DISABLED` · `SE_MCP_PRINCIPAL_REQUIRED` · `SE_MCP_PERMISSION_DENIED` ·
  `SE_MCP_CLASS_EXCEEDED` · `SE_MCP_PROJECT_UNKNOWN` · `SE_MCP_LANE_BUSY` ·
  `ENGINE_MCP_WORKMETA_POLICY_REFUSED` — 만 `-32000`으로 남는다. 모르는 도구는 `-32602`, 모르는 메서드는
  `-32601`, 깨진 줄은 `-32700`이며 세션은 계속된다.
- `engine_version`은 `topology/ENGINE_VERSION`에서 읽어 `initialize.serverInfo`와 모든 결과에 싣는다
  (현재 `0.0.0` = 만드는 중). 결과에는 `project_code`도 같이 실린다.
- 주석(annotations)은 정직하다: `readOnlyHint`는 쓰기 여부, `destructiveHint`는 **전부 false**(모든 쓰기가
  create-only라 지우거나 덮지 않는다), `idempotentHint`는 도구가 스스로 말한다 — `observe_scan`은 부를
  때마다 새 실행 폴더가 생기므로 `false`, `judge_run`·`observe_confirm`은 같은 이름으로 두 번 부르면
  거절되므로 `true`.

## 12.7 잠금 — 과제별 lane 하나, 그리고 문이 못 하는 것

9.1A의 잠금은 그대로고, 2026-08-19에 **과제·도구별 쓰기 잠금** 하나가 늘었다(부록 B 4번).

- 자리: `runs_root/locks/<tool>.lock.json`, create-only. `.lock` 확장자를 쓰지 않은 이유는 `_workmeta`
  메타데이터 확장자 정책이 그 확장자를 받지 않기 때문이다.
- 이미 잡혀 있으면 **대기가 아니라 거절**이다(`SE_MCP_LANE_BUSY`, 계약 `lane_1d` §4.3). "바쁘다"는 답을
  받은 호출자는 다음 행동을 정할 수 있지만 조용히 줄 서 있는 호출자는 못 한다.
- 30분보다 오래된 잠금은 거절문에 `stale: true`로 **알려주고 그래도 거절한다.** 남의 잠금을 오래돼
  보인다는 이유로 지우는 것이 반쪽 실행 폴더 둘이 생기는 길이다. 지우는 것은 사람이 한다.
- 자기가 잡은 잠금만 푼다(`lock_id` 대조). 다른 lane과 다른 과제는 막지 않는다.
- 판단 실행은 launch 파일 + sha 핀으로만 시작하고 Owner 동결 grant 아래서 1회 돌며 엔진 effect는 전부 0이다.
- 엔진은 Task를 만들지 않고 승인하지 않고 canon을 올리지 않고 ERP에 쓰지 않는다.
- 문이 쓰는 곳은 프로필이 지정한 네 자리(관측 폴더 · 실행 산출 폴더 · 실행 뿌리 · 영수증 폴더)와 잠금
  폴더뿐이고 전부 create-only다. **모든 평면에서 경로 예산을 검사한다**(200/60/60, 부록 B 3번): 예산을
  넘으면 `ENGINE_MCP_PATH_BUDGET_EXCEEDED`로 거절하고 어느 **칸**이 문제인지만 말한다(경로는 답에 안 싣는다).
  **새로 만드는** 실행 이름(`revision_label`)은 24자까지다 — 그 폴더 밑에 폴더가 또 생기기 때문이다.
  이미 디스크에 있는 실행 이름은 60자까지 그대로 **읽는다**(상한이 생기기 전에 만들어진 실행을 못 읽게
  만드는 것은 기록을 지키는 게 아니라 잃는 것이다).
- 규칙을 바꾸는 도구는 없다. 권한을 바꾸는 도구도 없다. 규칙이 틀리면 스펙(정본)을 고치고 export한다(9.2의 3번).

## 12.7A 캐시 — 쓰기 뒤에는 버린다

컨텍스트의 캐시 키는 `kernel/mcp_contract.mjs`의 `cacheKey`가 만든다: 과제 코드 · 세대(generation) ·
엔진 판 · 문 모듈 판 · 연산 이름 · 질의 지문. 그래서 과제 A의 조회가 과제 B의 항목에 **닿을 수 없고**,
쓰기가 성공할 때마다 세대를 올리면 그 이전 항목은 전부 **찾을 수 없게 된다**(사후 필터가 아니다).

이것이 부록 B가 지적한 현재 버그를 닫는다: 같은 세션에서 `observe_confirm`으로 관측을 확정한 뒤
`judge_run`이 옛 관측으로 판단하던 것. 영수증 append는 세대를 올리지 않는다 — 호출 기록 한 줄은 과제
자료의 변경이 아니다.

## 12.8 시험과 실측

`npm run validate:se-mcp` — 2026-08-19(3차, 링크 발급기 연결): **117**
(같은 날 2차: 104 · 1차: 70 · 2026-08-18: 28). 늘어난 13은 프로필의 `link_issuer` 5와 문 옆 발급기 8이다.
발급기 자체는 별도로 `npm run validate:nas-link-issuer` — **59**(게이트웨이 owner, §12.C).
프로필 검증 15 · 명부·라우팅 10 · 접근 모델 16 · 표 대장 11(순수: 기한·소유·이름·판 붙이기) ·
도구 22(합성 fixture 대조·결정론·쓰기 거절·경로 예산·잠금·캐시 무효화·쪽 나누기) ·
파일 문 24(표·이동 등록·폴더 불일치 거절·덮어쓰기 거절·판 붙이기·해시·등급 거절·정리 ·
링크 없음/키 없음/모의 발급/자식 실패의 네 갈래) ·
프로토콜 17(자식 프로세스로 실제 stdio 왕복 — 파일 문 한 바퀴 포함: 표 → 등록 → 목록 → 정리 보고).
fixture는 `project_profile_synthetic_v0.json`(프로필 모양 + 합성 관측 실행), `next_steps_synthetic_v0.json`
(규칙 + 합성 판정), `project_registry_synthetic_v0.json`(명부 모양), `access_table_synthetic_v0.json`
(접근표 실물)이며, `fixtures/engine_mcp_synthetic_project.mjs`가 그것들을 임시 폴더에 과제 하나 또는
여러 개 모양으로 깔아 준다. 실제 과제 자료는 시험에 들어가지 않는다.

핵심 시험 셋: (1) 읽기 도구가 낸 JSON이 **같은 순수 함수를 직접 부른 결과와 바이트로 같다**(로직이 새지
않았다는 뜻). (2) 서버를 껐을 때 exit 3, 명부·프로필이 나쁠 때 exit 4, 플래그가 둘 다이거나 없을 때 exit 64,
쓰기 스위치가 꺼졌을 때 `WRITE_TOOLS_DISABLED`. (3) 호출마다 영수증 한 줄이 붙고 그 줄에 원문 키가 없다.
(4) 신원 없이 부르면 ⓐ 여섯 개만 열리고 나머지는 `SE_MCP_PRINCIPAL_REQUIRED`. (5) `hw` 역할에게
`observe_status`의 경로·파일 이름이 `null`로 가려지고 `observe_confirm`·`access_table`이 거절된다.

**P26-014 첫 실측(2026-08-18, 두 스위치 다 켠 자식 프로세스, 읽기 3회):**

| 부른 것 | 답 |
| --- | --- |
| `rules_stage 030_SRR` | 요구 22 · 순서 목록 22(안 막힘 19 · 막힘 3) · 게이트 역할 core 3 / entry 2 / supporting 17 · 첫 5개는 체계요구사항명세서부터 |
| `next_steps 120_CDR` | 실행 04 인용 · 카드 28 · 지시서 3 · 요구 27(충족 5 · 결손 4 · 불명 18) |
| `project_status` | 8게이트 중 7 컴파일, 합계 충족 5 · 결손 4 · 불명 95 · 청소 알림 19 · 240_LL은 정본 필수 항목이 없어 컴파일 거절을 그대로 표시 |

수치가 07장 run 04와 같다 — **문이 판정을 바꾸지 않았다**는 것이 이 실측의 요점이다.
영수증은 6줄(같은 3회를 두 번 돌렸다), 전부 `write: false`.

**2차 실측(2026-08-19, 명부 1과제 · 읽기 스위치만 켬 · 쓰기 꺼짐, 자식 프로세스 2회):**

| 세션 | 부른 것 | 답 |
| --- | --- | --- |
| principal `owner` | `tools/list` | 보이는 도구 13 · 숨긴 도구 4(쓰기 꺼짐) |
| | `whoami` | 역할 owner · 허용 도구 13 · 볼 수 있는 등급 4 |
| | `engine_status` | 판 0.0.0(`under_construction`) · 규칙 층 6 · 명부 과제 1 · 접근표는 코드 기본표 |
| | `projects_list` | 과제 1건, 마지막 판단 시각은 `null`(실행 색인 없음) |
| | `project_status` | 8게이트 중 7 컴파일 · 합계 충족 5 · 결손 4 · 불명 95 · 청소 알림 19 |
| principal `hw` | `tools/list` | 보이는 도구 12 |
| | `observe_status` | 관측 수치는 그대로(합친 관측 4), 경로·파일 이름 2칸은 `null`로 가려짐 |
| | `observe_confirm` · `access_table` | 둘 다 `SE_MCP_PERMISSION_DENIED` |

`project_status` 수치가 1차 실측과 **같다** — 명부·신원·잠금·캐시가 붙었어도 판정은 그대로다.
`hw` 세션에서 가려진 것은 이름이지 판단이 아니다(수치는 같은 값을 본다).

## 12.9 한계 — 지금 못 하는 것

| 한계 | 뜻 | 어디서 풀리나 |
| --- | --- | --- |
| 답을 넣는 도구가 없다 | "그건 우리 과제엔 해당 없어"를 받는 자리가 아직 없다 | 답변 우편함(B2) |
| 기한·담당자가 빈다 | `context_fill` 공급 경로가 없어 지시서의 그 두 칸이 비어 나온다 | 맥락 채우기(B2) |
| 과제 착수 도구가 없다 | 5입력으로 새 과제를 세우는 자리 | C1 |
| 문서 내용 검사가 없다 | "있다"까지만 답한다 | D1(합의됨, 없음) |
| `observe_scan` 뒤 프로필을 사람이 고쳐야 한다 | 새 관측 폴더를 쓰려면 `observations_dir`를 Owner가 옮겨 적는다. 도구가 자기 프로필을 고치게 두지 않았다 | 프로필 갱신 도구(미정) |
| 예약 실행이 없다 | 엔진 안에 시계가 없다. 밤에 도는 것은 운영 스케줄러의 몫이다(9.1C) | B3(엔진 밖) |
| 명부를 고치는 도구가 없다 | 과제를 더하고 빼는 것은 파일을 Owner가 고치는 일이다 | C1(과제 착수)에서 다시 본다 |
| 신원은 프로세스마다 하나다 | `--principal`은 서버가 뜰 때 한 번 정해진다. 한 프로세스로 여러 사람을 서빙하지 못한다 | 비서·게이트웨이 층(원격 로그인) |
| 실행 색인이 없다 | `projects_list`의 "마지막 판단"이 `null`로 나온다(폴더를 다시 걷지 않는다) | 부록 B 8번 |
| 훑기가 증분이 아니다 | 과제 하나를 통째로 걸으며 전부 해시한다 | 부록 B 7번 |
| 켜져 있지 않다 | 어떤 클라이언트에도 등록하지 않았다 | Owner 결정(§12.A) |

## 12.10 다음 (계획 순서)

1. **B2 답변 우편함** — 답 도구(누가·언제·무엇에·근거) + 맥락 채우기(기한·담당). 지금 손으로 관측 파일에
   적는 그 답이 도구로 들어오면 같은 질문이 반복되지 않는다.
2. **B3 야간 예약 실행** — 엔진 밖 스케줄러가 `judge_run`에 해당하는 runner를 부른다.
3. **C1 과제 착수** — 5입력 → 폴더트리 · 전 단계 컴파일 · 프로필 생성 · 첫 판단.

## 12.11 이 부품을 고칠 때 순서

1. **도구를 더할 때**: `mcp/tools/<name>.mjs`에 `{name, title_ko, description_ko, inputSchema, write,
   data_class, handler}`를 내보내고(선택: `confidential_fields`·`idempotent`) `tools/index.mjs`에 한 줄
   더한다. 모양이 안 맞으면 호출 때가 아니라 import 때 깨진다. `project_code`와 기본 등급은 index가 붙인다 —
   **등급을 안 적으면 ⓒ가 된다**(fail-closed). **핸들러에 로직을 넣지 않는다** — 필요한 계산이 없으면 그
   계산을 순수 층에 먼저 만든다.
2. **프로필을 바꿀 때**: `project_profile.mjs`의 필수 키와 뿌리 표, `project_profile_synthetic_v0.json`,
   이 장 §12.3을 같은 변경에서 고친다(시험이 셋을 묶어 놓았다). 명부·접근표도 같은 방식이다
   (`project_registry.mjs`/`access_table.mjs` ↔ 합성 예시 ↔ §12.2A·§12.2B).
3. **권한을 바꿀 때**: 코드가 아니라 **접근표 파일**을 고친다. 코드에 박힌 기본표는 파일이 없을 때의
   fallback이며 그것을 넓히는 것은 설계 변경(9.1F)이다.
4. **시험**: fixture 먼저, 그다음 시험, 그다음 코드. 읽기 도구를 고쳤으면 "순수 함수 직접 호출과 같은 JSON"
   시험이 자동으로 잡는다.
5. **검증**: `npm run validate:se-mcp` → `validate:se-stage-rules` · `validate:se-guidance` ·
   `validate:se-observation` → `validate:canon` · `validate:path-length` · `validate:path-policy` →
   `emit_manifest --verify`(시험이 `tests/`에 있으면 매니페스트가 바뀐다) → `validate:engine-release`.
6. **문서**: 이 장(§12.A 포함), README의 합의 목록, 엔진 `README.md`, `mcp/README.md`, `CHANGELOG.md`.
7. **켜지 않는다.** 활성화와 클라이언트 등록은 Owner 결정이며 코드 변경으로 하지 않는다.

## 12.A 등록·사용 안내 (사람용)

개발자가 아닌 사람이 이 문을 자기 PC에 등록하고 쓰는 절차다. **아직 아무 데도 등록되어 있지 않다.**
아래를 실제로 하는 것은 Owner의 결정이며, 이 문서는 결정한 뒤 따라 하는 순서다.
경로는 전부 `<abs>` 자리표시자로 적는다 — 실제 경로는 private이라 이 파일에 적지 않는다.

### 1. 무엇을 준비하나

| 준비물 | 무엇 | 확인하는 법 |
| --- | --- | --- |
| 최신 운영 체크아웃 | 이 저장소를 최신으로 받아 둔 폴더 | `git log -1`이 최신 커밋을 보여준다 |
| Node | 서버가 도는 런타임(이 저장소가 쓰는 판) | `node --version` |
| 과제 프로필 | 과제 하나당 JSON 한 장(§12.3) | 과제면 `06_validation/project_profile.json` 자리 |
| 과제 명부 | 어떤 과제를 서빙할지 적은 파일(§12.2A) | private `_workmeta/system/engine/project_registry.json` |
| 접근표 | 역할별 허용 도구·등급(§12.2B) | 명부 옆 `access_table.json`, 또는 `--access-table <abs>`로 직접 지정. 둘 다 없으면 코드 기본표 |
| 접근표 (`--profile`로 띄울 때) | 명부가 없으니 "옆에 둘 자리"도 없다 | `--access-table <abs>`를 주지 않으면 **무조건 코드 기본표**다 |
| 스위치 둘 | `SOULFORGE_ENGINE_MCP=on`(문 열기) · `SOULFORGE_ENGINE_MCP_WRITE=on`(쓰기 열기) | 클라이언트 설정의 `env`에 적는다 |
| 신원 | `--principal '{"principal_ref":"<사람 표시>","role":"<역할>"}'` | 역할은 owner·pm·systems·hw·sw·quality·external |

**`principal_ref` 모양 규칙**: `^[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}$` — 영문·숫자로 시작하고 그 뒤는
영문·숫자와 `_` `.` `@` `-`만 쓴다. **한글·공백·따옴표는 안 된다**(어긋나면 서버가 뜨지 않고 exit 64).
쓸 만한 모양: `owner_msy` · `pm_01` · `hong.gd@example.com`. 이 값은 엔진이 해석하지 않는 **표식**이고
권한은 오직 `role`과 접근표에서 나온다. 영수증에 남는 것이 이 값이므로 사람을 알아볼 수 있게 짓는다.

명부와 접근표를 `_workmeta` 아래에 만들기 전에는 반드시
`npm run guard:workmeta-write -- --assert-write-target "<target>"`를 먼저 돌린다(거부되면 만들지 않는다).

### 2. 클라이언트별 등록 예시 (자리표시자)

**Codex CLI** — `~/.codex/config.toml`

```toml
[mcp_servers.soulforge_engine]
command = "node"
args = [
  "<abs>/guild_hall/engineering_engine/mcp/engine_mcp_server.mjs",
  "--registry", "<abs>/_workmeta/system/engine/project_registry.json",
  "--repo-root", "<abs>",
  "--principal", "{\"principal_ref\":\"owner_msy\",\"role\":\"owner\"}",
]
env = { SOULFORGE_ENGINE_MCP = "on" }
```

**Claude Code** — 명령 한 줄, 또는 프로젝트의 `.mcp.json`

```text
claude mcp add soulforge-engine --env SOULFORGE_ENGINE_MCP=on -- node <abs>/guild_hall/engineering_engine/mcp/engine_mcp_server.mjs --registry <abs>/_workmeta/system/engine/project_registry.json --repo-root <abs> --principal '{"principal_ref":"owner_msy","role":"owner"}'
```

```json
{
  "mcpServers": {
    "soulforge-engine": {
      "command": "node",
      "args": [
        "<abs>/guild_hall/engineering_engine/mcp/engine_mcp_server.mjs",
        "--registry", "<abs>/_workmeta/system/engine/project_registry.json",
        "--repo-root", "<abs>",
        "--principal", "{\"principal_ref\":\"owner_msy\",\"role\":\"owner\"}"
      ],
      "env": { "SOULFORGE_ENGINE_MCP": "on" }
    }
  }
}
```

**Claude Desktop** — `claude_desktop_config.json` (자리는 OS마다 다르다; 앱 설정에서 연다)

```json
{
  "mcpServers": {
    "soulforge-engine": {
      "command": "node",
      "args": [
        "<abs>/guild_hall/engineering_engine/mcp/engine_mcp_server.mjs",
        "--profile", "<abs>/_workspaces/<과제>/…/06_validation/project_profile.json",
        "--repo-root", "<abs>",
        "--principal", "{\"principal_ref\":\"owner_msy\",\"role\":\"owner\"}",
        "--access-table", "<abs>/_workmeta/system/engine/access_table.json"
      ],
      "env": { "SOULFORGE_ENGINE_MCP": "on" }
    }
  }
}
```

쓰기까지 열려면 `env`에 `"SOULFORGE_ENGINE_MCP_WRITE": "on"`을 **한 줄 더** 넣는다. 넣지 않으면 쓰기 도구는
목록에 아예 안 보인다(그게 정상이다).

**따옴표와 역슬래시 세 줄.**
1. `--principal`의 값은 JSON 한 덩어리이고 **공백이 없어야** 한 인자로 들어간다.
2. 설정 파일(JSON·TOML) 안에서는 안쪽 큰따옴표를 `\"`로 이스케이프한다(위 예시 그대로). 셸에서 직접
   칠 때는 바깥을 작은따옴표로 감싸는 편이 쉽다: `--principal '{"principal_ref":"owner_msy","role":"owner"}'`.
3. Windows 경로를 JSON에 적을 때는 역슬래시를 **두 번** 쓴다. 슬래시로 적으면 그럴 일이 없으니 위 예시처럼
   슬래시를 권한다.

### 3. 첫 호출 순서

1. `whoami` — 내가 누구로 인식되는지, 무엇이 열려 있는지. 여기서 `anonymous: true`가 나오면 `--principal`이
   빠진 것이다.
2. `engine_status` — 엔진 판·규칙 판·스위치·명부가 맞게 물렸는지.
3. `projects_list` — 어떤 과제를 물어볼 수 있는지.
4. `project_status` — 그 과제가 지금 어디쯤인지.
5. `next_steps` — 이제 뭘 해야 하는지.

### 4. 역할별로 보이는 것과 안 보이는 것

| 역할 | 보이는 것 | 안 보이는 것 |
| --- | --- | --- |
| owner · pm | 전부(도구 23, 등급 ⓐ~ⓓ) | — |
| systems · quality | 아래 팀 역할이 보는 것 전부 + **훑기 `observe_scan`\* · 판단 실행 `judge_run`\***(Owner 결정 2026-08-19) | 과제 경로·파일 이름(ⓒ) · 확정 `observe_confirm` · 권한표 · 칸 정리 `file_tickets_gc` |
| hw · sw | 규칙·카드·순서(ⓐ), 과제 신원·판단 수치·현황(ⓑ), 자기 역할 지시서, 등록 `observe_register`\*, **파일 넣기·받기 다섯**(`file_ticket`\*·`file_put`\*·`file_register`\*·`file_get`·`file_tickets_list`) | 위 + 훑기·판단 실행 · 기밀 폴더의 파일(항목 단위 `SE_MCP_CLASS_EXCEEDED`) · 남의 표 |
| external(발주처·협력) | 규칙·카드·순서(ⓐ)와 엔진 상태만. **어느 과제인지도, 규칙 파일 이름도 안 보인다**(ⓑ) | 나머지 전부 |
| 신원 없음 | ⓐ 읽기 여섯(`whoami`·`engine_status`·`rules_*`), 그것도 **과제 신원 없이** — 엔진 판·프로토콜·스위치·규칙 판까지만 | 나머지 전부 |

표의 **\*** 표시는 **쓰기 도구**라는 뜻이다: 쓰기 스위치가 꺼져 있으면 허용된 역할에게도 목록에 안 보이고,
불러도 `WRITE_TOOLS_DISABLED`로 거절된다.

거절 코드 뜻: `SE_MCP_PRINCIPAL_REQUIRED`(누가 부르는지 안 붙었다) · `SE_MCP_PERMISSION_DENIED`(그 역할에
그 도구가 없다, 또는 과제가 paused/closed) · `SE_MCP_CLASS_EXCEEDED`(도구가 내는 등급이 역할 밖) ·
`WRITE_TOOLS_DISABLED`(쓰기 스위치가 꺼져 있다) · `SE_MCP_LANE_BUSY`(다른 사람이 그 과제에 쓰는 중) ·
`SE_MCP_PROJECT_UNKNOWN`(명부에 없는 과제).

### 5. 켜고 끄기 · 잠금 풀기 · 영수증 · 자주 나는 거절 다섯

- **끄기**: 클라이언트 설정에서 `SOULFORGE_ENGINE_MCP`를 지우거나 서버 등록을 지운다. 코드는 안 고친다.
- **쓰기만 끄기**: `SOULFORGE_ENGINE_MCP_WRITE`만 지운다. 읽기는 그대로 열린다.
- **잠금이 안 풀릴 때**: `runs_root/locks/<도구>.lock.json`을 열어 `acquired_at`을 보고, 그 실행이 정말
  끝났다고 확인한 뒤 **사람이** 파일을 지운다. 엔진은 지우지 않는다.
- **영수증**: 프로필의 `receipts_dir/mcp_tool_calls.jsonl`. 누가·언제·어느 도구·허용/거절과 사유가
  한 줄씩 쌓인다(원문·경로는 없다).

| 자주 나는 거절 | 원인 | 할 일 |
| --- | --- | --- |
| 서버가 바로 죽고 exit 3 | `SOULFORGE_ENGINE_MCP=on`이 없다 | 클라이언트 설정의 `env`를 본다 |
| exit 4 | 명부·프로필·접근표 중 하나가 계약에 안 맞는다 | 오류 한 줄이 어느 파일·어느 칸인지 말해 준다 |
| exit 64 | `--registry`와 `--profile`을 둘 다 줬거나 둘 다 안 줬다 | 하나만 남긴다 |
| `SE_MCP_PRINCIPAL_REQUIRED` | `--principal`이 없다 | 설정에 신원을 넣는다 |
| `WRITE_TOOLS_DISABLED` / 쓰기 도구가 목록에 없음 | 쓰기 스위치가 꺼져 있다 | Owner가 결정해서 켠다 |

### 6. 하지 말 것

- 이 문을 **원격으로 열지 않는다.** 엔진 문은 로컬·비공개이고, 밖에서 여러 사람이 붙는 자리는 위층
  (비서·게이트웨이)이다(9.1F).
- 프로필·명부·접근표를 **공유하거나 public에 올리지 않는다.** 그 안에는 과제 경로가 들어 있다.
- 스위치 둘을 **상시 on으로 두지 않는다.** 특히 쓰기는 할 일이 있을 때만 켠다.
- 남의 잠금 파일을 습관적으로 지우지 않는다.
- 접근표를 넓혀서 문제를 푸는 대신 **왜 거절됐는지**를 먼저 읽는다. 사유 코드가 넷뿐인 이유가 그것이다.

## 12.B 파일 넣기·받기 (문 앞 칸) — 사람용

Owner 결정 2026-08-19(09장 §9.1D): **등록 = 저장.** 사람은 과제 폴더를 직접 만지지 않는다. 파일을 넣을
자리를 표로 받고, 그 자리에 넣고, "이건 무슨 산출물이다"라고 등록하면 **엔진이** 규칙이 정한 업무폴더로
옮기고 관측까지 만든다. 잘못 저장은 잘못 등록이므로 폴더가 아니라 등록을 고친다.

```text
① 표 받기            file_ticket(purpose:'upload')
   └▶ 020_MGMT/…/tickets/<내 이름>/<표 번호>/   (엔진이 만든 빈 폴더 하나, 기한 3일)
② 링크 만들기(엔진 밖) OneDrive에서 그 폴더에 대해 "링크 만들기" → 사람에게 전달
   └▶ 작은 파일이면 링크 없이  file_put(표, 이름, 내용, 해시)   (25MB까지)
③ 넣기                사람이 링크로 올리거나 폴더에 끌어다 놓는다
④ 등록                file_register(표, 산출물, 단계)
   └▶ 엔진: 규칙에서 업무폴더 찾기 → 03_Out으로 이동(덮어쓰기 없음) → 관측 또는 확인 대기
⑤ 받기                file_ticket(purpose:'download', artifact_ref) → outbox 칸에 복사본 + 기한 1일
   └▶ 작은 파일이면    file_get(artifact_ref) 로 바로
⑥ 정리                file_tickets_gc()  끝난 칸을 휴지통으로(지우지 않는다). 기본은 보고만
```

**큰 파일은 링크로, 작은 파일은 문으로.** 문으로 들어오는 한 파일의 상한은 25MB다. 메일 첨부가 대개
30MB에서 막히므로 그보다 큰 것은 어차피 링크·공유함이 정답이고, 엔진은 그 링크를 만들지 않는다(아래).

**표(ticket)는 주소표다.** 표 하나 = 폴더 하나 = 사람 하나 = 한 번의 주고받기. 표에는 누가·무엇을 위해·
언제까지가 적히고 링크나 비밀번호는 적히지 않는다. 기한이 지나면 그 표로는 등록할 수 없고, 폴더는
남아 있다가 정리 때 휴지통으로 간다.

**등록하면 어디로 가나.** 엔진은 두 가지가 **같은 말을 할 때만** 파일을 옮긴다.

| 확인 | 뜻 | 안 맞으면 |
| --- | --- | --- |
| 규칙 | compiled 스펙이 그 단계에 그 산출물의 업무 **하나**를 선언하고 있나 | `artifact_not_declared_at_this_stage` / `…_twice_…` |
| 폴더트리 | 그 업무 번호를 단 폴더가 실제로 있고, **이름도 그 업무의 이름**인가 | `task_folder_missing` / `task_folder_names_a_different_task` |

번호만 맞으면 옮기는 방식은 위험하다. 폴더트리를 옛 규칙판으로 만들었으면 같은 번호가 다른 업무를
가리킬 수 있고, 그러면 발표자료가 성숙도평가 자리에 들어간다. **없는 폴더는 만들지 않는다** — 폴더트리는
폴더트리 스킬이 만드는 것이고, 자리가 없다는 것은 그 자리를 사람이 정할 일이 남았다는 뜻이다.
(같은 이유로 **task id는 재사용하지 않는다.** 스펙에서 행이 빠져도 그 번호는 은퇴시킨다 — 폴더트리
스펙의 사람용 절에 은퇴 목록이 있다.)

**덧씌움이 더한 산출물**(스펙에 없고 overlay `add`로 들어온 것)은 overlay가 `task_id`와 `folder_name`을
같이 적었을 때만 자리가 풀린다. 확인 방식은 스펙 행과 똑같다 — 번호와 이름이 둘 다 맞아야 한다.
둘을 안 적었으면 `artifact_not_declared_at_this_stage`로 거부한다. 규칙은 그 산출물을 요구하지만
어느 폴더에 넣을지는 아무도 말한 적이 없다는 뜻이고, 그때 폴더를 지어내는 것이 바로 위 문단이 막는 일이다.
`folder_name`은 디스크에서 복사한 그대로(`144_CDR_발표자료_F`) 적어도 되고 번호를 뺀 이름만 적어도 된다.

**관측이 되는 조건은 훑기와 똑같다**(10장 §10.3 +1): `03_Out`에 있고, 업무폴더가 산출물 하나로 풀리고,
**파일 이름 자체가 무엇인지 말할 때**. 셋 다면 그 자리에서 관측이 되어 다음 판단에 들어간다
(`registered_observations.jsonl`). 이름 단서가 없으면 옮기기는 하되 **확인 대기**로 남는다(`registered_candidates.jsonl`,
D37). 그래서 파일 이름에 `BOM`·`HDD` 같은 표준어를 넣는 습관이 그대로 이득이 된다.

**덮어쓰지 않는다.** 같은 이름이 이미 `03_Out`에 있으면 기본은 거절이고, `allow_new_version: true`를
붙였을 때만 `이름 (v2).확장자`로 들어간다. 제출한 문서가 조용히 바뀌는 일을 막는 것이 이 통로의 존재
이유다. 지우는 도구는 없다 — 정리도 휴지통으로 **옮기는** 것뿐이다.

**등급.** 파일 도구는 팀 역할 전부에게 열려 있지만, `confidential_dirs`에 있는 파일은 내려받기·읽기에서
항목 단위로 막힌다(`SE_MCP_CLASS_EXCEEDED`). 표·경로·파일 이름은 ⓒ라서 Owner·PM이 아니면 결과에서
가려지고(`_redacted`), 남의 표는 목록에도 안 나온다.

**남는 기록 셋.** `receipts_dir/file_tickets.jsonl`(표의 일생: 열림→사용됨→치워짐, 붙이기만 한다) ·
`receipts_dir/file_operations.jsonl`(누가 어떤 해시를 어디로 옮겼나) · 
`observations_dir/registered_observations.jsonl`(등록으로 생긴 관측). 앞 둘은 메타면이라 포인터·해시·상태만 담고 원문은 담지 않는다.

**여기 없는 것(엔진 밖).**

- **링크 발급.** 엔진은 링크를 **만들지** 않는다. 네트워크를 부르지 않기 때문이다. 프로필에
  `link_issuer`가 없으면 `file_ticket`이 돌려주는 것은 폴더 위치와 표 번호뿐이고
  (`link: null` + `link_note: link_issuer_not_configured`), Owner·PM이 그 폴더에 대해 공유 UI에서
  링크를 한 번 만들어 전달한다. `link_issuer`가 있고 그 PC에 자격 키가 있으면 문이 게이트웨이 명령을
  **자식 프로세스로 띄워** 링크를 받아 표에 붙인다 — 엔진 프로세스는 그때도 소켓을 열지 않는다(§12.C).
- **원격 문·로그인.** 팀원이 자기 PC에서 붙는 자리는 비서/게이트웨이 층이다(9.1F).
- **등록 정정·취소(`observe_amend`).** 잘못 등록한 것을 고치는 도구는 아직 없다(9.1E). 지금은 Owner가
  등록 대장 줄과 파일을 보고 판단한다.

## 12.C 외부 업로드 통로 — 시놀로지 NAS 문 앞 칸과 링크 발급 (Owner 결정 2026-08-19, 전산팀 회신 대기)

### 결정
- 외부 작업자(동기화 없는 PC, 계정 없는 협력사)도 올릴 수 있게 **링크 방식**으로 간다. 폴더를 몰라도 링크만 열면 올린다.
- 저장소: **문 앞 칸(INBOX/티켓·내려받기 칸)은 회사 시놀로지 NAS의 새 공유폴더 `soulforge_intake`** 에, **정식 자리(과제 폴더트리)는 지금처럼 Owner의 OneDrive**에 둔다. 기존 NAS 백업 폴더(`개발1팀/Soulforge_Project_Backup`, `ERP_DB_DEVTEAM1`)와 분리한다.
- 등록 = 엔진이 NAS 칸 → OneDrive 정식 자리로 **해시 확인 복사**(드라이브가 달라 이동 대신 복사), NAS 사본은 정리 규칙(사용됨/만료 뒤 N일 → 휴지통 폴더)으로 치운다. 다운로드·수동 삭제 없음.
- 링크는 엔진이 만들지 않는다(엔진은 네트워크 0). **링크 발급기**(게이트웨이 층의 첫 부품, `guild_hall/gateway/` 아래 또는 엔진 옆 sidecar)가 시놀로지 File Station API로 표 폴더에 **"파일 요청" 링크**(업로드 전용·만료·암호)를 만들어 표 장부에 붙인다. DSM 판에서 파일 요청이 API로 안 되면 "빈 전용 폴더 + 편집 공유 링크"로 대체(노출 내용 없음).
- 운영 PC의 NAS 접근은 드라이브 문자(Z:, RaiDrive·로그인 세션 종속)가 아니라 **UNC 경로 + 전용 계정**으로 잡는다(백업 컨트롤러와 같은 이유).
- M365(Graph) 링크 발급은 차선으로 남긴다(앱 등록·동의 필요, 개인 365 계정이면 기기 코드 로그인).

### 전산팀 요청 내용(2026-08-19 발송 예정, 비밀 없음)
1. 공유폴더 `soulforge_intake` (하위 `tickets`·`outbox`·`_trash`, 휴지통 30일) — 새 공유폴더가 어려우면 `개발1팀` 하위폴더에 별도 권한
2. 전용 계정 `soulforge_engine`: 그 폴더만 읽기/쓰기, 관리자 아님, File Station 사용 + 공유 링크·파일 요청 링크 생성 권한, 2FA 제외 또는 앱 비밀번호, 아이디·비밀번호는 Owner에게만
3. 회신: 외부 접속(QuickConnect ID 또는 DDNS/HTTPS), DSM·File Station 버전, UNC `\\NAS\soulforge_intake` SMB 접근 가능 여부
4. (선택) 공유 링크 기본 정책(만료 3일, 용량 상한), 로그 센터에 링크 사용 기록

### Owner가 할 것(회신 뒤)
- 운영 PC `.env`(런타임 전용)에 넣기 — 키 이름(값은 AI에게 보이지 않게): `SOULFORGE_NAS_HOST`, `SOULFORGE_NAS_PORT`, `SOULFORGE_NAS_USER`, `SOULFORGE_NAS_PASSWORD`(또는 `SOULFORGE_NAS_TOKEN`), `SOULFORGE_NAS_SHARE=soulforge_intake`, `SOULFORGE_NAS_UNC=\\NAS\soulforge_intake`
- AI에게는 DSM 버전·접속 주소 형태만 알려준다.

### 만든 것 (2026-08-19, 모의 DSM으로만 검증 — 실계정 없음)

**발급기**: `guild_hall/gateway/nas_link_issuer/`(게이트웨이 owner, 새 npm 의존성 0).
`synology_api.mjs`(DSM 최소 클라이언트) · `issue_link.mjs`(표 하나 → 폴더 하나 → 링크 하나) ·
`mock_transport.mjs`(통조림 DSM) · `tools/nas_issue_link.mjs`(명령) · fixture 3벌 · 시험 59
(`npm run validate:nas-link-issuer`). 자세히는 그 폴더의 README.

```text
node …/nas_link_issuer/tools/nas_issue_link.mjs --ticket <표> --folder <공유폴더 기준 상대경로>
  --purpose upload|download --expires <UTC ISO> [--password-from-env NAME] [--dry-run] [--mock <fixture>]
```
stdout은 JSON 한 덩어리, 거절은 stderr JSON + 종료코드(`64` 인자 · `3` 설정 · `4` DSM · `5` fixture).

**문에 붙인 자리**: 프로필의 선택 칸 `link_issuer: {kind:'synology', env_prefix:'SOULFORGE_NAS'}`
(§12.3). 그 칸이 있고 **그 PC에 자격 키가 있으면** `file_ticket`이 폴더를 만든 **뒤** 위 명령을
자식 프로세스로 띄우고 `link_url`·`link_kind`·`link_expires_at`을 답과 표 장부에 붙인다.
링크 실패는 **표를 실패시키지 않는다** — 폴더는 이미 있고 표가 주고받기의 기록이므로 표는 그대로 쓰고
`link_note`만 남긴다(`link_issuer_not_configured` · `…_env_missing` · `…_refused` · `…_unreadable`).

| 어디에 | 무엇이 | 무엇이 아닌 |
| --- | --- | --- |
| 표 장부 `file_tickets.jsonl` | `link.link_url`·`link_kind`·`link_expires_at`·`dsm_link_id` | 링크 **암호**가 들어갈 칸 자체가 없다 |
| 파일 영수증 `file_operations.jsonl` | `link_kind`·`link_expires_at`·`link_note` | URL은 안 적는다(한 자격은 한 자리) |
| 답 | 위 넷 + `link_note` | — |

**링크는 ⓑ, 자리는 ⓒ다.** 폴더 경로는 과제 폴더트리의 한 조각이라 가리지만, 링크는 그 반대로 **빈 칸
하나에 대한 권한**이고 어디에 있는지 말하지 않는다. 표를 낼 수 있는 역할에게 링크를 가리면 기다리는
사람에게 건네줄 것이 없는 표가 된다.

**자격은 `.env` 런타임 전용**이고 프로필·저장소·영수증·로그에는 키 **이름**만 남는다. 필수 키는
`SOULFORGE_NAS_HOST`·`_USER`·`_SHARE` + `_PASSWORD` 또는 `_TOKEN`(선택 `_PORT`·`_UNC`).
`SOULFORGE_NAS_MOCK`에 fixture 경로를 넣으면 자격 없이 모의로 돈다 — 시연·시험용이고, 그때 문의
답은 실제와 같은 모양이되 링크는 `nas.invalid` 자리표시자다.

**대체 경로**: 파일 요청 기능은 `SYNO.API.Info`에서 찾아본다(전용 API → 없으면 `SYNO.FileStation.Sharing`
3판 이상의 create 매개변수 → 둘 다 아니면 대체). DSM이 시도를 거절해도 대체로 내려가되 왜 내려갔는지를
`fallback_reason`에 남기고, 대체 링크에는 `sharing_edit_permission_unverified`를 붙인다(업로드 권한이
실제로 붙었는지는 DSM UI에서 사람이 한 번 확인한다 — 관측 안 한 것을 관측했다고 적지 않는다).

### 아직 아닌 것

- 표 폴더는 NAS에서 `tickets|outbox/<사람>/<표>`로 **표를 그대로 비춘다.** 프로필의 `intake_dir`은
  아직 과제면(`_workspaces/**`) 아래여야 하므로, **링크로 올라온 파일은 NAS에 있고 문 앞 칸에는 없다.**
  `file_register`가 그것을 집으려면 프로필이 NAS UNC를 문 앞 칸으로 지목할 수 있어야 하고
  `file_register`가 교차 드라이브 복사(해시 재확인)를 해야 한다 — 둘 다 다음 조각이다.
- 링크 **암호**는 발급기가 `--password-from-env`로 받을 수 있지만 문은 아직 쓰지 않는다(표에 암호 칸이 없다).
- `date_expired` 인코딩(`YYYY-MM-DD HH:MM:SS` 기본 / `YYYY-MM-DD`)과 파일 요청 API의 실제 이름·매개변수는
  실계정 회신 뒤 확인한다. DSM은 만료를 NAS 지역시간으로 읽으므로 표의 기한(UTC)과 최대 하루 어긋날 수
  있고, 그래서 결과에 호출자가 준 `expires_at`과 보낸 `dsm_date_expired`를 둘 다 싣는다. 기한의 정본은 표다.

### 실계정이 생긴 뒤 시험 순서

1. `--dry-run`으로 계획 확인(호출 0) → 2. `--mock`으로 한 바퀴 → 3. 실키로 `--purpose upload` 1회 →
4. 다른 PC 브라우저로 그 링크에 업로드 → 5. "올렸어" → 등록 → 정식 자리 → 관측 → 판단 반영 →
6. 만료 뒤 링크가 닫히는지 → 7. 정리 미리보기.

### 오늘(2026-08-19) 실제 상태
- 파일 문(표·등록·넣기/받기·정리) 병합됨. 그 위에 링크 발급기와 문 hook이 올라갔다
  (`validate:se-mcp` 117 · `validate:nas-link-issuer` 59, 전부 모의 DSM). 실계정·실호출은 **없다**.
  KVDS 프로필에는 아직 `link_issuer`를 넣지 않았다(Owner가 넣을 두 줄은 §12.C "만든 것" 참조).
- 파일 문(표·등록·넣기/받기·정리) 병합 시점 상태: KVDS 프로필 v2(문 앞·내려받기·휴지통·기밀 폴더·정책)와 과제 명부 갱신, KVDS 덧씌움 v2(스펙 핀 재고정, `prime_cdr_presentation_final` → 144 폴더).
- OneDrive 쪽 문 앞 칸으로 표 1장 발급됨(owner_msy, 3일 만료). 가짜 파일로 등록 시험은 하지 않음(실제 과제 증거 오염 방지). Owner의 실제 PPT가 들어오면 등록→이동→관측→판단까지 돌린다.
- 규칙표 정정: 폴더 번호 144 재사용 발견 → MRA 148로, "task id append-only" 규칙 신설; 덧씌움 `add`에 `task_id`/`folder_name` 허용.
