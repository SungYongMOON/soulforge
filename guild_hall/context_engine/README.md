# Context Engine

자동 정리본 지식 층의 명시 호출·개발 평가는 [KNOWLEDGE_LAYER.md](KNOWLEDGE_LAYER.md)를 따른다.

이력 작성기의 일·주·월·최근 있었던 일 증분 실행은 같은 문서의 `이력 CLI` 절을 따른다.
호출자가 제공한 원천만 읽는 별도 명시 실행면이며 기존 맥락이에는 연결하지 않는다. 밤 사슬에는 아래 야간 이력 단계로만 붙인다.

원천 준비는 `src/history_prepare_cli.mjs --prepare`로 고정한다. 이력은 `src/history_cli.mjs`의
`--prepare` → 외부 초안 JSON → `--finalize`로 작성하며 모델을 호출하지 않는다.
고정 초안 계약은 [HISTORY_DRAFT_FORMAT.md](HISTORY_DRAFT_FORMAT.md)를 따른다. 봇과 예약은 외부 담당 범위다.

**야간 이력 단계** `harness/history_night.mjs`(2026-09-26)는 위 순서를 밤 사슬 한 단계로 묶는다: 과제마다
원천 준비 → 층별(일 → 주 → 월 → 최근 현황) prepare(`layers` 한 층씩)와 finalize. 위층 packet이 실패해도 일별 칸은
마감된다. 일별 묶음·위층 packet 하나당 외부 작성자 호출 최대 2회(두 번째는 "JSON으로만 답하라." 추가).
작성자가 0으로 끝났고 답을 읽었지만 두 번 거부되면 일별은 `unprocessed_batches`로 마감·캐시하고 위층은 다음 밤으로 둔다.
전송 실패(0 아닌 종료·시간 초과·실행 실패)는 캐시도 미처리 마감도 하지 않고 그 층을 다음 밤에 다시 준비한다.
질의 한도(`max_query_characters`, 기본 8000)는 일별 묶음 예산에서 prompt 머리말을 먼저 빼서 지킨다. 한도를 넘는 위층
packet은 카드 순서대로 한도 안의 부분으로 나눠(각 부분은 자기 카드 번호만 인용) 부르고, 부분이 모두 받아지면 합치기 호출
1회로 압축한다. 합치기가 거부되거나 여전히 한도를 넘으면 부분 문장을 그대로 써서 층을 마감하고, 그 칸에 `merge_fallback: true`를 남겨
보는 판에 `주간 요약 합치기 실패 — 부분 요약을 그대로 사용` 한 줄을 보인다. 한 카드가 혼자 한도를
넘으면 질의에서만 잘라 싣고 `truncated_cards`로 센다(카드 번호·근거는 그대로). 질의 판본 `history-night-query v2`,
기대 규칙 판본 `history-writer-rules v3`(영수증 `rules_version_matches`에 기록만 하고 막지 않는다). 작성자는 주입 함수이며 기본값은 `<command> -p <profile> chat -Q --query-file …`
외부 프로세스(시간 초과 시 프로세스 나무 전체 종료)다. 같은 입력은 호출 0회이고, 끝난 결과는 private `work_root`에
(규칙 지문·작성자 식별(`writer_id` 또는 profile 설정 지문)·내용) 키로 캐시한다. 플래그: `--config`(필수,
`soulforge.history_night_config.v1`, 경로는 전부 config에) `[--config-sha256]` `--receipts`(필수) `[--projects]`
`[--date]` `[--from-date]` `[--deadline HH:MM [--scheduled-start HH:MM]] [--no-start-within 분(기본 20, 호출 시간 한도보다 짧으면 늘림)]`
`[--profile] [--writer-id] [--run-budget 초(기본 1200)]`. 호출 시간 한도는 마감까지 남은 시간을 넘지 않는다.
lock `history-night.lock`은 소유 pid가 죽었거나 3시간(마감이 있으면 8시간 이상) 지났을 때만 옆으로 옮긴 뒤 새로 잡는다.
영수증 `history-night-*.json`(`soulforge.history_night_receipt.v1`, 수·상태·시도 시간·응답 지문만, 본문 없음).
종료 코드 0 OK · 2 FAILED · 3 LOCK_HELD · 4 SKIPPED_PAST_DEADLINE · 5 CONFIG_INVALID · 6 PARTIAL(다음 밤으로 남긴 일 있음).
lane spec `guild_hall/deployment_pack/lanes/history_night_lane.spec.json`(`history-night-v1`, 폐포 24파일, node 내장만).
시험 `tests/knowledge_layer/history_night.test.mjs`(합성 자료·가짜 작성자 20건, 큰 주 분할·합치기 실패 포함). 예약·lane 설치·밤 사슬 설정 변경은 하지 않는다.
과제별 `output_root`는 과제 저장소의 `<data_root>/20_PROJECTS/<project-ref>/30_프로젝트맥락/이력`이다(Owner 결정 2026-09-26, 레이아웃 `project-context-template-v2`). 이 단계가 그 폴더의 유일한 writer이며 첫 쓰기에서 `<YYYY-MM>/`을 만든다. `work_root`(원문이 든 질의 캐시)는 과제 저장소 밖 private 자리에 둔다.

## K3 첫 실자료 위키 하네스 — 모델 응답은 out-of-band (`harness/knowledge_layer_real_wiki.mjs`, 2026-09-22, fresh review 반영)

지금까지 K3는 합성 자료(`knowledge_layer_demo.mjs`)와 결정적 가짜 모델로만 배선을 확인했다.
이 하네스는 coordinator가 **실제 회사 메일 한 과제분**으로 K3를 한 번 돌리게 하되, 모델
자체는 이 파일이 절대 부르지 않는다 — 사람이 프롬프트를 채팅 모델에 붙여넣거나 agent가
답하는 out-of-band 응답을 `generate`가 재생(REPLAY)할 뿐이다. 소켓을 열지 않는다.
초판(2026-09-22 오전) 커밋의 fresh review에서 7건 필수 지적을 받아 같은 날 오후 모두
고쳤다 — 아래는 고친 뒤의 계약이다.

- `prepare --project <code> --attribution-index <file> --hiworks-events <dir>...
  [--gmail-sent-events <dir>...] [--org-config <addr>] [--owner-tables <addr>]
  --strength confirmed|all --max-units N [--allow-uncovered N] [--allow-record-fallback]
  --out <dir> --now <ISO> --offhost-approval <file> --model-roles <config>` —
  두 개의 **독립된** off-host 관문을 모두 통과해야 프롬프트를 쓴다: (1) canon의
  `model_roles.v1` 표(`resolveModelRole`)가 이 과제+`wiki_draft`에 loopback이 아닌
  명시적 전송 허가를 줘야 하고, (2) `--offhost-approval`(사람 서명, 내용은 안 읽고
  존재·sha256만 확인)이 있어야 한다. 통과하면 `mail_routes.mjs`의 귀속 색인으로 그
  과제의 메일만 고르고, custody에서 직접 읽어 `linkApprovedUnits`(K1) 계약 그대로
  `request.json`(단위·grant), `manifest.json`(개수·해시만, 원문·host 경로 없음 —
  경로는 `{kind,basename,dir_sha256}`로만), `model_prompt.md`(WIKI_SCHEMA.md 원문 +
  실제 wire payload JSON 그대로 + 정확한 답 JSON 스키마)를 쓴다.
- **custody 판본 일치 검사(R6)**: 같은 mail id·기존 제목/수신시각/발신자 기준에서 원본 해시가 같으면 재수집으로 합친다.
  해시가 다르면 caller가 `--source-custody-root <approved_root>`를 명시해야 한다. 해당 root의 content-addressed
  `.eml` 전체 해시를 확인하고 첫 빈 줄 아래 본문 바이트가 모든 부에서 같을 때만 머리글 차이로 합친다.
  본문은 공백·줄바꿈·Unicode를 정규화하지 않는다. 한 부라도 다르면 기존 `mail_id_ambiguous_in_custody` 거부를 유지한다.
  `ingested_at`이 가장 이른 부의 원본 해시를 근거로 쓰고, 나머지 메일함 소유자·sha256을 manifest의
  `unit_materials`와 `coverage.header_only_variants`에 보존한다. K1 unit 구조는 바꾸지 않는다.
  최초 저장본 선택은 **sha가 같은 재수집과 sha가 다른 배달본 모두**에 적용한다.
  이 규칙은 본문 바이트가 동일한 부들 사이에서만 작동한다 — 고를 대상이 같은 것들이라 잃는 게 없고, 나중에 새 부가 더 들어와도 이미 쓴 위키의 근거 포인터가 흔들리지 않는다.
  내용이 바뀐 것은 이 규칙의 대상이 아니다(본문이 다르면 거부; 사람 정정은 정정 단위·철회 경로로).
  ingested_at이 없거나 파싱 불가인 부는 제외하고 개수를 남기며, 해당 id의 남은 부가 없으면 mail_no_valid_ingested_at으로 거부한다.
  원본 비교에서 0바이트 본문은 동등성 근거로 쓰지 않고 custody_eml_body_empty로 거부한다.
  `custody_sha_differed_across_records`는 해시가 달랐던 id 수이며 허용된 머리글 차이도 포함한다.
  `raw.source_custody`가 아예 없는 레코드는 기본 거부이며 `--allow-record-fallback`을
  줘야 canonical hash로 대체한다.
- **커버리지(S7)**: 귀속됐지만 custody에 없는 메일은 기본(0건) 전체 거부다.
  `--allow-uncovered N`을 주면 N건까지는 진행하고, `manifest.coverage`/
  `generation_receipt.coverage`에 `{attributed_confirmed, wanted_at_strength,
  units_supplied, dropped_for_bounds, uncovered_by_custody}`로 남기며, 프롬프트에
  그 사실을 `review.gaps`로 적으라는 안내를 덧붙인다(과제 위키의 빈틈 절까지 도달).
- `dump-model-input --work <dir> [--write]` — 같은 request.json에서 실제 K1 +
  `buildWikiModelInput`(wiki.mjs에서 이번에 추가로 export, K3 내부가 전에는
  인라인으로만 만들던 것)으로 model_input.json을 다시 만들어 prepare가 쓴 파일과
  같은지 보고한다. `--write` 없이는 읽기 전용이다(S8).
- 모델 답의 `text`는 원문 복사가 아니라 자기 말로 정리한 문장이고 `quote`는 이를 뒷받침하는 원문 구절이다.
  기계는 quote의 원문 포함만 확인하며 text의 의미 지지는 모델 책임으로 남긴다. candidate에 topic을 붙이면
  과제 전체+주제별 페이지를 만들고 원천별 정보는 재료 목록으로 보존한다. topic 없는 기존 응답은 원천별 페이지 호환을 유지한다.
  인용 실패로 제외된 문장의 예외·모순도 확인 필요에서 보존한다. topic 제목은 색인에 표시하며 topic 이름 변경은 새 page_id다.
  WIKI_SCHEMA가 바뀐 기존 준비물은 generate가 거부하므로 새 빈 폴더에서 prepare부터 다시 한다.
- `generate --work <dir> --answer <file> --archive-root <dir> --model-id <alias>
  --now <ISO> --offhost-approval <file> --model-roles <config> [--expected-previous
  <hash|null>] [--neo4j-config <file>]` — 실제 `createWikiKnowledgeLayer`를
  `createBoundedGenerator` REPLAY generator(파싱된 답 파일을 그대로 반환, 거친 모양
  검사 후 `checkWikiOutput`이 권위 있게 재검사)로 돌린다. **manifest.json의 어떤
  값도 그대로 믿지 않는다(R2/R3)**: grant는 이 호출 자신의 `--now`로
  `linkApprovedUnits`를 다시 돌려 만료를 재검사하고(고정된 request.now가 아니라),
  request 원문·off-host 승인 파일·`WIKI_SCHEMA.md`·model-roles 바인딩을 각각 다시
  해시/재계산해 manifest 기록과 대조한 뒤 다르면 거부한다 — 편집된 request.json(짝이
  맞는 grant 편집 포함)이나 바꿔치기한 승인 파일을 receipt가 그대로 베껴 적던 결함을
  막는다. graph는 기본 memory 가짜(주지 않으면 `--expected-previous`는 그 과제의
  graph 현재 세대로 기본 설정), archive는 `createFileArchive`. 잘못된 답은 아무것도
  archive되지 않고 거부된다.

**프롬프트 경계(R5)**: `model_prompt.md`의 USER PAYLOAD 절은 실제 wire payload인
`JSON.stringify({project_ref,role,units,human_correction_unit_ids})` 그대로이며(더
이상 사람이 손으로 고른 필드 요약이 아니다), 메일 본문이 백틱 펜스(```)를 담고 있어도
빠져나갈 수 없도록 본문 속 최장 백틱 연속보다 긴 펜스를 계산해 감싼다.

**실측(2026-09-22 오후, R6 수정 뒤)**: P26-014 확정 귀속 359건 중 hiworks custody로
92건 부재, 나머지 267건 중 90건이 "제목/시각/발신자는 같지만 custody sha가 다른" 모호
사례(R6 새 검사로만 드러남) — `prepare`는 이 과제 전체를 거부한다. 같은 검사를 16개
과제 전부에 걸어 보니 부재·모호 둘 다 실측됐다: 부재는 P26-014(92)·P24-049(55) 등
8개 과제에서, 모호(custody sha 불일치)는 P26-014(90)·P24-049(33) 등 10개 과제에서
나왔다(부재·모호 0인 과제도 6개 있다, 예: P20-056 7건). 부재도 모호도 없는 실제
과제(P20-056, 확정 7건)로 `prepare`→`dump-model-input`→`generate` 세 단계를 전부
실행해 pages 8(과제 1 + 원천 7), statements_included 6, excluded/exceptions/
conflicts/gaps 0, `collapsed_from_multiple_records` 3(재수집 중복이 실제로 합쳐짐)을
확인했다 — `--max-units`로 7건 전부를 골랐을 뿐 그 과제 메일이 7통뿐이라는 뜻은
아니다. 검증에 쓴 실자료 산출물(off-host 승인·model-roles 설정 포함)은 repo 밖
scratchpad에서만 만들고 끝난 뒤 지웠다 — repo에는 절대 복사하지 않는다.
- 시험은 합성 custody/색인/model-roles(`tests/knowledge_layer/knowledge_layer_real_wiki.test.mjs`,
  `os.tmpdir()`뿐)만 쓴다. `npm run validate:knowledge-layer`에 자동 편입(glob).
  같은 파일이 `guild_hall/deployment_pack/lanes/{context_read,graph_sync}_lane.spec.json`이
  실제로 담는 파일만으로 만든 임시 트리 안에서도 import되는지(워크스페이스 원장
  cross-module import 없음, R1) 검사한다.

## 밤 사슬(night chain) — 시계 대신 영수증으로 이어지는 야간 작업 (night-chain-v1)

밤에 도는 예약작업 셋(`SoulforgeVoiceConversationList` 00:00, `SoulforgeWorkspaceLedgers` 05:30,
`SoulforgeGraphSync` 30분마다)은 서로를 모르는 고정 시계였다. 앞 작업이 끝났는지와 무관하게 다음 시각이
오면 돈다. 그 틈에 아무 사슬에도 안 들어가 있던 것이 하나 있었다 — 메일 귀속 색인 빌더
(`guild_hall/workspace_ledgers/ops/mail_attribution_index.mjs`). 소비 쪽(`estate_graph_sync.mjs`의
`--mail-attribution`)은 색인이 36시간 넘게 낡으면 닫히는데, 색인을 다시 만드는 사람이 없었다.
`ops/night_chain.mjs`는 그 대신, Owner가 고른 **순서 있는 부분집합**을 **한 사슬**로 돈다: 각 단계는 앞
단계의 **자기 종료코드와(설정했으면) 자기 영수증**이 성공이라 말한 뒤에만 시작한다.

**무엇을 하는가.** 각 단계는 이미 만들어진 다른 lane의 진입점을 **자식 프로세스**로 돈다
(`node <lane_root>/<entry> <args...>`). 이 파일은 그 lane들의 코드를 import 하지도 다시 구현하지도
않으며 — 파일 하나가 `node:` 내장 모듈만 import 한다(`voice_conversation_list_nightly.mjs`의 마감 계산
`nextDeadlineInstant`, 그 lane의 lock 모양, `workspace_ledgers`의 `redactHostPaths`와 같은 것은 **가져오지
않고 이 파일 안에 다시 적었다**. 이유는 `answer_eval`이 `safe_pattern.mjs`를 따로 둔 것과 같다: 이 파일을
싣는 lane(`night-chain-v1`)의 폐포에 다른 모듈이 들어오면 빌드된 lane 안에서만 `ERR_MODULE_NOT_FOUND`로
죽는다. `spec_closure_lib.mjs`의 `moduleClosure()`로 확인한 폐포는 이 파일 하나다).

**사슬 정의는 외부 JSON**이다 — 코드에 박지 않고, Owner가 쓰고, `--chain-config <파일>
--chain-config-sha256 sha256:<hex>`로 넘기며, **digest가 맞기 전에는 내용을 한 바이트도 믿지 않는다**.
모양은 `{ "schema_version": "soulforge.night_chain_config.v1", "steps": [...] }` **객체만**(맨 위 배열은
받지 않는다 — 이 모듈의 다른 스키마와 같은 모양으로 골랐다). 단계 하나:

```json
{ "id": "mail_ledgers",
  "lane_root": "<LANE_ROOT>/workspace-ledgers-v3",
  "entry": "guild_hall/workspace_ledgers/ops/daily_refresh.mjs",
  "args": ["--workspaces-root", "...", "--receipts", "<STATE_ROOT>/receipts/workspace-ledgers"],
  "receipts_dir": "<STATE_ROOT>/receipts/workspace-ledgers",
  "success_rule": { "receipt_glob": "daily-*.json", "json_path": "status", "allowed_values": ["ok"] },
  "on_failure": "stop", "timeout_minutes": 60, "enabled": true,
  "lane_manifest_sha256": "sha256:<그 lane의 LANE_MANIFEST.sha256 파일 자체의 digest>" }
```

- **`lane_manifest_sha256`** — 그 lane의 `LANE_MANIFEST.sha256` **파일 바이트**의 digest(등록기들이
  `Get-Sha256File`로 pin 하는 바로 그 값; `build_source_lane.mjs`의 `verifyLane`처럼 항목별 재해시는 아니다).
  **켜진(enabled) 모든 단계**를 **1단계를 돌기 전에** 대조하며(`--only`/`--from`이어도), 하나라도 어긋나면
  사슬 전체를 거부한다 — exit 5, 아무것도(1단계도) 안 돈다. 꺼진 단계는 대조에서 뺀다: 아직 없는 lane의
  자리를 잡아 두는 placeholder(예시의 `voice_cards_to_index`)가 사슬을 막으면 안 되기 때문이다.
- **`success_rule`**(선택) — 없으면 종료코드 0이 성공. 있으면 그 단계 **자기** `receipts_dir`를 (하위
  폴더까지 — `estate_graph_sync.mjs`는 과제별 폴더에 쓰므로 `*/*.json`) glob 해서, **mtime이 이 단계의
  시작 시각보다 엄격히 뒤인(mtime ≥ 시작 + 1 ms) 파일만** 남기고, 그중 최신 하나의 `json_path` 값이
  `allowed_values`에 있는지 본다.
  **지난 회차가 남긴 옛 영수증은 절대 이번 단계의 성공 신호가 아니다** — 시험이 옛 영수증을 미리 심어 두고
  실패로 판정됨을 확인한다. mtime을 쓰는 이유: 영수증마다 시각 필드 이름이 다르다(`ran_at`, `built_at`…).
- **`on_failure`** — `stop`은 그 단계에서 멈추고 뒤의 단계를 `not_started`에 적는다; `continue`는 실패를
  적고 다음으로 간다.
- **`timeout_minutes`** — 넘기면 SIGTERM, 5초 뒤 SIGKILL, `timed_out: true`(항상 실패). 소수 허용.
- **`enabled: false`** — `--dry` 계획과 실제 영수증에 `SKIPPED_DISABLED`로 남고 절대 돌지 않는다
  (`stop`으로 멈춘 뒤의 꺼진 단계도 `not_started`가 아니라 `SKIPPED_DISABLED`로 남는다 — 어차피 돌 일이
  없던 단계다). `--only`든 `--from`이든 꺼진 단계를 **직접 지명하면 거부**한다(몰래 돌리지도, 몰래 아무것도
  안 하지도 않는다). 범위 안의 단계가 **전부** 꺼져 있어 아무것도 시도하지 않은 회차는 `OK`가 아니라
  `NOTHING_TO_RUN`(exit 7)이다 — 감시자가 "오늘 밤 사슬이 일을 했다"로 읽으면 안 되므로.
- **`deadline`·`note`(단계 필드, 선택)** — 그 단계의 영수증 행에 **그대로 복사**된다(없으면 `null`).
  `deadline`은 **이 판본이 해석하지 않는다** — 마감은 아래 사슬 수준 `--deadline`만 본다(장래 단계별
  override 자리를 스키마 변경 없이 잡아 두는 것).

**사슬 수준.** `--receipts <dir>`은 **사슬 자신의** 영수증 폴더다(어느 단계의 `receipts_dir`도 아니다 —
겹치면 거부). 거기에 lock(`night_chain.lock`, 모든 단계 `timeout_minutes` 합 + 30분이 지나면 버려진
것으로 보고 `wx`로 회수, 영수증에 `lock.reclaimed_stale`)과 밤마다 영수증 하나
(`soulforge.night_chain_receipt.v1`: 단계별 `{id, started_at, ended_at, exit_code, timed_out, receipt_found,
receipt_path, status, reason, deadline, note}` + `not_started` + `stopped_at_step` + 전체 `status`; 설정 파일은
`config_file`에 **basename만** — 어느 파일이었는지는 옆의 `config_sha256`이 이미 묶는다)만 쓴다. 단계의
stdout/stderr는 영수증에 넣지 않고 줄 단위로 호스트 경로를 가려 relay 만 한다(영수증에는 원문 출력이 없다).
영수증 신선도 비교는 `mtime >= 시작 ms + 1` — `Date.now()`는 정수 ms이고 mtime은 소수가 붙을 수 있어, 같은
ms 안에서 시작 직전에 쓰인 파일이 통과하는 반올림 구멍을 막는다.
`--deadline HH:MM [--scheduled-start HH:MM]`은 대화 목록 야간 lane과 **같은 계산**(Asia/Seoul, 시작 이후
다음 그 시각, `--scheduled-start`는 트리거 시각에 고정)이며 **새 단계를 시작하기 직전에만** 본다.
첫 검사에서 이미 지났으면 `SKIPPED_PAST_DEADLINE`, 단계 사이에서 지났으면 `PARTIAL`(남은 단계는
`not_started`에 id로). `--dry`는 계획만 찍고 **아무것도**(lock도) 안 쓴다. `--only <id>` / `--from <id>`는
서로 배타적이다. **모르는 플래그·맨 인자는 거부**한다(`--dry-run` 오타가 실제 실행이 되면 안 되므로).

**종료코드** — `0 OK · 2 FAILED · 3 LOCK_HELD · 4 SKIPPED_PAST_DEADLINE`은 `voice_conversation_list_
nightly.mjs`의 `main()`에서 읽은 값 그대로(짐작 아님). 그 파일에 없는 셋은 새로 붙였다:
`5 CONFIG_INVALID`(설정 digest·모양·켜진 단계의 lane digest 어긋남, 모르는 플래그, `--only`/`--from` 동시
지정이나 모르는/꺼진 단계 지명 같은 시작 전 거부 전부 — 아무것도 안 돌았다), `6 PARTIAL`, `7 NOTHING_TO_RUN`
(0~4는 이미 재사용한 매핑이 차지; 7을 4와 나눈 것은 마감 정지와 헷갈리지 않게 하려는 것이다).
`tests/register_night_chain_task.test.mjs`가 Windows에서 실제 숨김 런처(wscript → powershell → node)를 통해
일곱 값 모두 그대로 도착함을 실측한다(다른 OS에서는 skip).

**등록기** `ops/register-night-chain-task.ps1`(`SoulforgeNightChain`, 기본 `-DailyAt 00:30` — 00:00/
03:00/05:30 세 독립 예약과 다른 분으로 골라 전환 기간에 겹치지 않게; Owner가 `-DailyAt`으로 바꾼다)은 대화
목록 등록기와 같은 뼈대다: 경로 정규화·reparse 거부, lane 매니페스트·Node·**사슬 설정**(`-ChainConfigPath`/
`-ChainConfigSha256`) sha 대조, `--dry` 프리플라이트(exit code를 먼저 변수에 받은 뒤 판정; 그 한 호출 동안만
`$ErrorActionPreference`를 `Continue`로 내려 runner의 stderr 한 줄이 NativeCommandError로 진짜 이유를 가리지
않게 — 작업 장부 등록기와 같은 수리), plan digest 게이트
(`-Register -ExpectedDryRunDigest`), 등록 뒤 XML 대조와 실패 시 이전 정의 복구/제거, wscript 꼬리
`if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE`. `--node-path`로 자기 검증한 Node를 사슬에
넘겨 모든 단계가 같은 바이너리로 돈다. 실행 시간 한도는 PT8H. 숨김 런처 `ops/run-night-chain-hidden.vbs`는
다른 둘과 같은 파일이다(작업 이름을 따라 따로 둔다).

**예시 설정** `docs/architecture/workspace/examples/night_chain/night_chain.example.json` — 의도한 순서
`voice_cards → mail_ledgers → mail_attribution_index → graph_sync_once → voice_cards_to_index(꺼짐,
K5 전까지 존재하지 않음)`. 경로는 전부 `<LANE_ROOT>`·`<STATE_ROOT>` 같은 자리표시자, `lane_manifest_sha256`은
전부 가짜 0이다 — 실제 배포는 실제 digest를 pin 하며 안 맞으면 exit 5다.

**lane** `guild_hall/deployment_pack/lanes/night_chain_lane.spec.json`(`night-chain-v1`): tracked_paths는
파일 셋(runner·등록기·런처)뿐. 시험 `tests/night_chain.test.mjs`(39건, 전부 `os.tmpdir()` 아래 합성 lane을
**실제 자식 프로세스**로 돌림)와 `tests/register_night_chain_task.test.mjs`(9건, 등록기·런처 원문 구조 검사 +
Windows 실측)가 `npm run validate:night-chain`이고 `run_root_acceptance.mjs` 두 모드에 `context-engine` 바로
뒤로 배선됐다. 이 조각은 예약작업을 등록하지도 lane을 빌드하지도 않는다. 예시 설정의 `mail_attribution_index`
단계는 **자기 영수증을 쓰지 않는다**(`--out` 색인 파일 하나뿐) — 그래서 `success_rule: null`이고, 스키마상
필수인 `receipts_dir`는 state root 아래 예약된(아직 아무도 쓰지 않는) 폴더를 가리키며 `note`에 그렇게 적혀 있다.

### 시작조차 못 한 회차도 영수증을 남긴다 (`harness/estate_graph_sync.mjs`, lane graph-sync-v4)

밤 사슬도, 감시자도 **영수증을 읽는다**. 그런데 `estate_graph_sync.mjs`는 과제 루프에
들어가기 전에 멈추면 — 메일 귀속 색인이 36시간을 넘겨 낡았을 때(`mail_attribution_index_stale`),
색인을 아예 못 읽을 때, root table이 자기 pin과 안 맞을 때 — `[estate-graph-sync] <코드>`
한 줄을 stderr에 찍고 exit 2로 끝났고 **영수증은 한 장도 쓰지 않았다**. 예약작업의 콘솔은
남지 않으므로 그 이유는 그 자리에서 사라졌고, 밤 사슬이 보기에 "거절한 회차"와 "아예 안 돈
회차"가 같은 모양이었다.

이제 그 경로들은 `<receipts>/_preflight/<instant>.json`
(`soulforge.context_graph_sync_preflight_receipt.v1`: `status: "FAILED"`, `stage: "preflight"`,
`reason: <코드>`, `projects: []`, `started_at`/`ended_at`) 한 장을 쓴다. `_preflight`를 한 단
아래 둔 이유는 두 가지다 — 이 파일의 `PROJECT_CODE`는 밑줄로 시작하는 이름을 과제코드로
받지 않으므로 과제 폴더와 절대 겹치지 않고, 한 단 깊이라 밤 사슬 예시의 `*/*.json` 글롭이
**이 영수증을 찾아낸다**(그래서 사슬 영수증에 "영수증 없음"이 아니라 `receipt_found: true` +
`receipt_path: "_preflight/..."`로 남는다).

경계: 성공한 회차의 **과제별 영수증은 모양도 내용도 그대로**고(합성 회차 전후 바이트 동일),
종료코드도 그대로 2이며, `--dry`는 여전히 아무것도 쓰지 않는다(등록기의 프리플라이트가 실제
receipts 폴더를 향해 `--dry`로 돌기 때문에, 예약되지도 않은 회차의 FAILED 영수증을 거기
떨어뜨리면 안 된다). 영수증 폴더를 못 쓰는 경우에는 기록자 자신이 `graph_sync_preflight_
receipt_unwritable` 한 줄을 더 찍고 원래 이유와 exit 2는 그대로 둔다 — 기록을 잃는 것이
종료코드까지 잃는 일이 되어서는 안 된다. 시험 6건은 `tests/estate_graph_sync.test.mjs`
(`npm run validate:context-engine`)에 있고 전부 합성 root를 실제 자식 프로세스로 돌린다.

## 대화 목록 파이프라인 — 미검증으로 굳은 세 이유 정리 (2026-09-26)

미검증으로 남은 PLAUD 세션 11건을 읽기 전용으로 진단한 결과, 다시 물어도 달라지지 않는 세 이유가 `remaining_work`로 남아 run을 영구 미검증으로 묶고 있었다.

- **과제 코드 판정**: 제목·안건 이름·최종 검사의 과제 코드 판정이 대문자+하이픈 토큰 전부였다. `DC-DC`·`RS-422`·`J-FET`·`J-TAG` 같은 부품 용어가 거부됐고 캐시된 답이 매번 다시 거부됐다. 이제 실제 과제 코드 형식 두 가지(`P00-000`, `D1-00-000`)와 그 run이 연 과제 코드만 본다(`namesAProject`). 거부되는 문자열은 전부 옛 규칙에서도 거부되던 것이다.
- **경계 규칙 대체**: 경계 답이 재질문 2회까지 모두 의미 규칙에 거부되고 규칙 경계가 그 창의 발화를 정확히 한 번씩 덮으면, 남은 일 대신 `marks`(`boundary_rules_fallback`, 거부 이유 포함)로 남긴다. 해당 구간 경계 이유에는 `rules_fallback`이 붙는다. 호출 실패와 아직 해 보지 않은 재질문은 전처럼 남은 일로 둔다.
- **Q/A 재확인 한도**: `limits.qa_rechecks`를 넘은 의심 경계는 건수와 한도를 `marks`(`qa_recheck_budget`)에 남긴다. 해당 경계는 카드에 `suspect`로 남는다.
- **호출 수 분리**: 예산이 다 된 뒤 거절된 호출은 `calls.total`에 넣지 않고 `calls.calls_refused_over_budget`로 따로 센다.

`marks`는 `conversation_list.v0.json`과 `run_manifest.json`에 새로 생긴 필드다. 프롬프트·설정·`runIdFor` 입력은 바꾸지 않았다. 운영 카드 592건(검증됨)의 run id를 이 브랜치와 origin/main으로 다시 계산해 모두 같게 나왔다.

## 대화 목록 파이프라인 — 거부된 캐시 답 영구 정지 수리: 유계 재질문(re-ask) (0.22.9)

실제 backlog 실행에서 관찰: `remaining_work`가 비지 않는 세션이 있었다. 구조 검사 6개는 전부
통과하는데(`checks`), `nature`/`boundary`의 **의미 규칙**이 모델 답을 거부한 경우다. 답은
JSON Schema를 통과했으므로 `makeAsk`가 이미 캐시에 썼고, 모델은 온도 0이라 같은 요청 바이트는
같은(틀린) 답을 낸다 — 그래서 재실행마다 **호출 0회로** 같은 거부를 그대로 재생하며 영원히
`verified: false`로 남았고, 밤마다 그 세션 하나가 그날 receipt 전체를 FAILED로 만들었다.
2026-09-22 야간 backlog에서 실측한 원인 셋:

- **`nature_title_names_a_project`**(`src/runtime/voice_conversation_list.mjs:677`) — 제목이 과제
  코드를 담아 거부. 구조상 완전히 유효한 답이 그대로 캐시돼 매번 재생됐다.
- **`boundary_not_monotonic`**(`src/runtime/voice_conversation_list.mjs:450`) — 구간이 시간 순서를
  벗어나 거부. 마찬가지로 캐시된 채 재생.
- **`nature_llm_failed`** — 두 갈래였다. **(a)** 새 긴 녹음(28·66분)은 `nature` 창이 커서
  실패마다 실호출을 태웠다(회차당 8·31회) — `ask()`의 재시도(`limits.retries`, 기본 2)는 같은
  요청을 그대로 반복할 뿐이라 truncation처럼 결정적인 실패에는 무력했다. **(b)** 오래된 세션
  하나는 호출 0회로 재생됐는데, 원인은 실패가 아니라 **`nature` 배치 답이 구간 하나를 그냥
  빠뜨린 것**이었다(`harness/voice_conversation_list_cli.mjs`의 옛 `askNature`: `if (answer.status
  !== 'ok') return null;` 뒤 `found?.get(entry.segment_id) ?? null` — 나머지 구간은 정상 답한
  스키마 유효한 응답이라 `makeAsk`가 **성공으로 캐시**했고, 빠진 구간만 `checked.code ?? 'nature_
  llm_failed'`의 `??`로 뭉뚱그려져 진짜 실패처럼 보였다. 실제로는 아무것도 재시도된 적이 없었다).

셋 다 `harness/voice_conversation_list_cli.mjs` 하나만 고쳤다(런타임 `src/runtime/voice_
conversation_list.mjs`, 다섯 프롬프트 파일, 기존 CLI·야간 lane의 동작은 전부 그대로). 다섯
프롬프트 파일을 고치지 않은 이유: 그 다이제스트가 이미 만들어진 모든 카드의 `run_manifest.json`에
박혀 있어, 고치면 기존 카드가 전부 stale이 된다.

- **유계 재질문**: `SEMANTIC_REASK_SENTENCES`(고정 테이블, 이유별 한 문장, 코드에만 존재)와
  `MAX_SEMANTIC_REASKS`(2)를 새로 냈다. `boundary`/`nature` 둘 다, 답이 스키마는 통과했는데
  의미 규칙에 거부되면(`answer.status === 'ok'`인 경우만 — 실제 호출 실패는 애초에 캐시되지
  않아 다음 회차가 그냥 다시 묻는다) 그 이유의 문장을 `user` 끝에 붙여 다시 묻는다. 요청 바이트가
  달라지므로 캐시 키도 달라지고, 실제로 새 호출이 나간다. 최대 2회, 넘으면 기존 그대로
  `remaining_work`에 남고 `verified: false`. `nature`의 배치-누락은 새 코드
  `nature_missing_from_batch_answer`로 따로 잡고(더는 `nature_llm_failed`로 뭉개지 않음), 재질문은
  그 구간 하나만 다시 묻는다(원래 배치보다 작아 누락될 가능성이 낮다).
- **긴 구간 창 절반 분할**: `nature`의 긴 구간 창이 `ask()`의 재시도까지 다 쓰고도 실패하면
  (`found === null`, 의미 거부가 아니라 진짜 호출 실패), 발화 2개 이상이면 창을 절반으로 나눠
  각각 다시 묻는다(`MAX_WINDOW_SPLITS = 1`, 한 단계만 — 더 잘라도 안 되는 창은 크기가 문제가
  아니다). config 파일은 건드리지 않는다(설정은 sha256으로 모든 카드에 박혀 있어, 한 줄만 바꿔도
  전부 재생성돼야 한다).
- **정직한 근거만 기록**: `run_manifest.json`에 `reasks: { total, by_reason, accepted, entries }`가
  늘었다. `entries`는 `{step, item, reason, attempt, accepted}`뿐 — 발화 원문·모델 답 텍스트는
  절대 없다.
- **run id 입력 불변**: 재질문 테이블은 코드에 있고 `runIdFor`가 보는 값(전사·의미 run·프롬프트
  다이제스트·모델 pin·설정 sha256) 중 어느 것도 건드리지 않는다 — 기존 검증된 run은 전혀 stale이
  되지 않는다.
- **agent-step harness는 공짜로 같은 수리를 받는다**: `harness/voice_conversation_list_agent_step.mjs`는
  같은 `runConversationList`를 부르므로, 외부 agent가 스키마는 맞지만 의미상 거부되는 답을 내면
  다음 `step`이 재질문용 새 `pending` 요청(다른 key, `user`에 같은 고정 문장)을 낸다 — 이 harness
  자체는 한 줄도 고치지 않았다.

신선한 눈 검토 후 정정(같은 슬라이스, 병합 전), 필수 2건·should 4건:
- (필수, C2-1) 재질문 문장을 `${user}\n\n${문장}`으로만 붙이면, 모델이 **같은 실수를 반복**할 때
  2번째 재질문(attempt 2)이 1번째와 바이트까지 똑같아져 캐시를 그대로 맞고(새 호출이 아님) —
  한 단계 더 깊은 같은 버그였다(측정: 계속 거부하는 모델 = 실호출 2회인데
  `reasks.total: 2`(영수증이 거짓말), 2회차 = 호출 0회, 3회차(이제 맞게 답할 모델) = 여전히
  호출 0회·미검증). 고정 줄 `재요청 N/2`(`reaskAttemptLine`)를 붙여 시도마다 바이트를 다르게
  만들고, **신선한(캐시 아닌) 호출이 직전과 같은 이유로 또 거부되면 이번 회차는 거기서 멈춘다**
  (`answer.cached !== true`로 판별). 다음 밤(다음 회차)엔 이미 캐시된 시도는 그대로 재생되고
  아직 한 번도 못 물은 다음 시도가 새로 나간다 — "모델이 실수를 두 번 반복한 뒤 2회차에 낫는다"
  시험으로 확인(정확히 신선한 호출 1회로 낫는다). **양쪽 재질문이 모두 신선한 호출로 실패하면
  그 항목은 모델·설정·프롬프트 중 하나가 바뀌어 새 run id를 열기 전까지 `remaining_work`에
  그대로 남는다** — 시간이 지난다고 저절로 없어지지 않는다.
- (필수, C2-2 -- 2차 검토로 R2-1이 세부 규칙을 다시 좁혔다, 아래 참고) 옛 `askNature`의
  `new Map(rows.map(r => [String(r.segment_id), r]))`는 배치 밖 id를 조용히 버리고 중복 id는
  마지막 것으로 덮어썼다. "이 Map에 없음"이 이제 `nature_missing_from_batch_answer`로 의미를
  갖게 됐으므로, 배치 답의 id가 요청과 어긋나면(중복이거나, 배치 밖 id가 있으면서 원래 물은
  id 중 하나가 빠졌으면) 그 자체로 새 코드 `nature_batch_answer_ids_invalid`로 거부하고(의미
  거부와 같은 자격으로 재질문 대상), 그 구간 하나만 다시 묻는다.
- (should, C2-3) `reasks`/`splits`의 `item`은 구간 id뿐 아니라 창 범위까지 담는다
  (`<segment_id>:<첫 발화>-<끝 발화>`) — **재질문 상한(`MAX_SEMANTIC_REASKS`)은 (step, 구간)이 아니라
  (step, 창) 단위**다: 긴 구간 하나가 여러 창으로 나뉘면 창마다 독립된 재질문 예산을 갖는다.
- (should, C2-4) 긴 구간 창 분할은 `!counters.budget_exhausted`로도 막는다 — 이미 예산을 다 쓴
  run이 못 쓸 호출 두 번을 더 시도하거나 실패를 두 번 더 기록하지 않는다.
- (should, C2-6) `run_manifest.json`에 `splits: {total, accepted, entries}`를 `reasks`와 별도로
  냈다 — 분할은 답을 아예 못 받은 호출의 재시도지, 모델이 준 답의 의미 거부가 아니므로 합성
  이유(`nature_llm_failed_window_split`)로 `reasks`에 섞지 않는다.
- (should, C2-7) `reasks`/`splits`는 `soulforge.voice_conversation_run.v0`(`RUN_MANIFEST_SCHEMA`)의
  **추가(additive) 필드**일 뿐이다 — 스키마 id는 이 변경으로 올리지 않았다. `SEMANTIC_REASK_SENTENCES`가
  `checkBoundaryProposal`/`checkNature`의 모든 거부 코드를 실제로 덮는지는 시험이 직접 대조한다
  (`src/runtime/voice_conversation_list.mjs`가 이제 내보내는 `BOUNDARY_PROPOSAL_REJECTION_CODES`/
  `NATURE_REJECTION_CODES`와 대조).

2차 신선한 눈 검토 후 정정(같은 슬라이스, 병합 전), 필수 없음(merge-ready)·should 2건·nit 3건:
- (should, R2-1) `checkedFrom`이 배치 답에 **배치 밖 id가 하나라도 있으면** 통째로 거부했다 --
  물은 구간 전부가 정확히 한 번씩 답해졌어도, 모델이 여분의 행 하나만 더 냈다는 이유로 구간마다
  자기 재질문을 태웠다(`nature_segments_per_call`개 구간 배치라면 1회 호출이 최대 `+1`회로
  불어나 `llm_calls` 예산을 갉아먹을 수 있었다). 이제 **거부는 중복 id, 또는 "배치 밖 id가 있으면서
  물은 id 중 하나가 빠짐" 두 경우로만** 좁혔다 -- 물은 id가 전부 정확히 한 번씩 나왔으면(여분의
  행이 섞여 있어도) 그 행들은 그대로 받아들이고, 여분의 id는 재질문 없이 표시(`nature_marks`에
  `nature_batch_answer_extra_ids`, 건수만)로만 남긴다.
- (should, R2-2) `run_manifest.json`은 매 회차 덮어써서 `reasks`/`splits`가 그 회차만 보여준다 --
  이미 끝난(더 부를 호출이 없는) 미검증 run은 재질문이 시도되긴 했는지조차 나중에 알 수 없었다.
  append-only인 `run_passes.jsonl`의 `thisPass`에 `reasks`/`reasks_accepted`/`splits`(건수만)를
  더했다.
- (nit, R2-3) `reaskTrace` 항목에 `outcome: checked.code`를 더했다 -- 재질문의 실제 호출이 실패로
  끝나면(`boundary_llm_failed`/`llm_budget_exhausted` 등) 그 결과가 `reason`(이 시도를 촉발한
  의미 거부 이유)과 다를 수 있는데, 예전엔 그 구분이 안 보였다.
- (nit, R2-5) 이 문단과 lane spec의 해당 문단 모두 런타임 파일(`src/runtime/voice_conversation_
  list.mjs`, 새 export 2개)을 명시하고 "런타임 불변" 서술을 걷어냈다 -- 그 export들은 동작을
  바꾸지 않지만 그 파일 자체가 바뀐 것은 사실이다.
- (nit, R2-6) 이 절의 시험 건수·`tests/voice_conversation_list_agent_step.test.mjs` 추가 건수
  서술이 실제 시험 파일과 어긋나 있었다 -- 아래 문단에서 바로잡았다.

시험: `tests/voice_conversation_list_reask.test.mjs`(신규 17건, 2차 검토분 2건 포함) — 거부 없는
세션의 요청 바이트가 그대로임, `boundary_not_monotonic` 재질문 성공(1회)·같은 실수 반복 시 신선한
호출 뒤 조기 정지·**그 중단된 run이 다음 회차에 신선한 호출 정확히 1회로 낫는 시험**,
`nature_title_names_a_project`가 다음 회차에 낫는 시험, 배치 누락 재질문 시험과 영원히 안 낫는
경우 실제 원인 기록 시험, 배치 답의 id가 물은 것과 정확히 하나씩 맞으면서 여분이 있는 경우는
**호출 1회로 그대로 받아들이고 마크만 남기는** 시험, 중복 id·"누락+미지 id 동시"인 두 시험은
그대로 `nature_batch_answer_ids_invalid`로 거부·재질문, 진짜 호출 실패가 다음 회차에 새로
재시도됨(호출 0회 재생 아님) 시험, 긴 구간 창 분할 시험(`splits` 필드로 확인)과 예산 소진 시
분할이 실제로 막히는 시험, `classifySession`이 미검증 run을 계속 `run`으로 다시 계획함을 보이는
시험, `SEMANTIC_REASK_SENTENCES` 전수 대조 시험, `run_passes.jsonl`의 `reasks`/`reasks_accepted`/
`splits` 시험, 재질문 `outcome`이 `reason`과 다를 수 있음을 보이는 시험.
`tests/voice_conversation_list_agent_step.test.mjs`에 3건 추가(거부된 agent 답의 새 pending 1건,
짝 없는 surrogate 거부 1건, 깊이 중첩된(그러나 200KB 미만) 답이 스키마 검사에서 먼저 막혀 스택
오버플로 대신 exit 5로 깨끗이 거부됨을 보이는 1건 — 순서를 스키마 검사 먼저로 바꾼 결과, 실측:
`answer`가 `findControlCharacter`를 스키마 검사보다 먼저 부르던 옛 순서로 깊이 4000단계 구조체를
넣으면 그 함수 혼자서 "Maximum call stack size exceeded"로 죽지만 `JSON.parse`는 그 깊이에서
멀쩡함을 직접 확인; `number` 타입 사례는 새 시험이 아니라 기존 스키마 검사기 시험에 추가한
대조문이다). 기존 `tests/voice_conversation_list.test.mjs`(51건)·`tests/voice_conversation_list_
nightly.test.mjs`(97건)는 무수정으로 전부 그대로 통과(바이트 동일성의 또 다른 증거).
`npm run validate:context-engine`에 새/갱신 시험 파일이 들어갔다.

## 대화 목록 외부 agent-step 하네스 — backlog 전용 (0.22.8)

Owner가 기록한 일회성 예외: 오래된 backlog 세션은 로컬 모델 대신 **외부 agent**(코디네이터가 운영하는
Claude Opus sub-agent)가 답한다. `harness/voice_conversation_list_cli.mjs`의 `runConversationList`는
평소대로 그대로다 — 이 harness는 그 함수에 새 `chatFor`/`pinFor`를 주입해 부르는 **새 파일**
(`harness/voice_conversation_list_agent_step.mjs`)이며, 기존 CLI·야간 lane·파이프라인 runtime 코드는
한 글자도 바뀌지 않았다. 기존 CLI·야간 lane은 원래도 `agent_step` transport를 거부한다
(`src/adapters/local_model/ollama_chat.mjs`의 `validateChatBinding`이 `ollama`/`openai_chat`만 안다) —
이 조각은 그 위에 우회로를 뚫은 게 아니라, `createLocalChat`을 아예 부르지 않는 별도 경로를 하나 더 낸
것이고, 그 거부가 실제로 일어남을 시험으로 확인했다(`tests/voice_conversation_list_agent_step.test.mjs`).

장수명 프로세스도 폴링도 없다. 매 호출은 디스크의 캐시를 그대로 재생하고, 아직 아무도 답하지 않은 첫
질문에서 멈춰 그 질문 하나를 `<run dir>/pending/<key>.request.json`에 쓴 뒤 파이프라인이 이미 아는
"예산 소진" 상태를 돌려준다 — 그래서 이번 pass는 실패로 표시되지 않고 깨끗이 끝난다. 외부 agent는
`answer`로 모델의 JSON을 파이프라인 자신의 답 캐시(`makeAsk`가 읽는 바로 그 자리·모양)에 직접 써 넣을
뿐이라, 캐싱·예산·검증 어느 것도 이 harness가 다시 구현하지 않는다.

- **`plan --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--order oldest|newest] [--limit N] [--json]`** — 그
  날짜 범위의 세션마다 분류를 매긴다(읽기 전용, 아무것도 쓰지 않는다): `skipped_short`(30초 미만),
  `transcript_absent`, `skipped_existing`(**어느 모델·설정으로 만들었든** 검증된 run이 이미 있으면),
  `failed`(세션 manifest를 못 읽음), 나머지는 `todo`. 세션 발견·분류는 야간 lane의
  `classifySession`을 그대로 재사용하되 `configSha256`/`promptDigests`를 둘 다 `null`로 넘긴다 — 그러면
  `staleReasonFor`의 모델/설정/프롬프트 대조가 전혀 걸리지 않아 "어느 pin으로 만들었든 검증된 run이면
  skip"이 된다. 이것은 야간 lane 자신의 기본 동작(pin이 바뀌면 `existing_run_stale:<field>`로 다시
  돎)과 **의도적으로 다르다** — backlog의 목적은 오래된 세션마다 검증된 카드 하나를 한 번 만드는
  것이지, 어떤 설정으로 다음에 답하든 최신으로 유지하는 것이 아니다.
- **`step --session <id> [--with-system]`** — 캐시 hit는 그대로 재생하고, 첫 miss에서 pending 요청
  하나만 쓴다(`asked` 플래그로, 같은 pass의 이후 모든 호출은 다시 쓰지 않고 `budget_exhausted`만
  돌려준다 — 로컬 모델이 예산 소진 뒤에 하는 것과 정확히 같은 모양). stdout:
  `STATUS=need_answer KEY=<key> STEP=<step> PROMPT=<prompt_name> PROMPT_SHA256=<hex>
  SCHEMA_FILE=<path> REQUEST_FILE=<path>` 다음 줄에 `user` 본문만(`--with-system`을 주면 `system`도
  같이). 끝났으면 `STATUS=done RUN_ID=<id> VERIFIED=<true|false> CONVERSATIONS=<n>
  LLM_ANSWERS=<n>`. exit: `10` 답 필요, `0` 완료+검증됨, `2` 완료+미검증 또는 그 밖의 실패, `3` lock
  보유 중, `4` 인자/설정 오류. 세션당 lock 파일(`<derived_root>/voice/<session>/agent_step.lock`)이
  같은 세션을 두 agent가 동시에 stepping하는 것을 막는다 — 30분 넘은 lock은 버려진 것으로 보고
  회수한다.
- **`answer --session <id> --key <key> (--file <json file> | --stdin)`** — 그 pending 요청이 실어온
  JSON Schema(subset: object/required/additionalProperties:false/properties, array/items, string,
  integer, boolean, enum, `["string","null"]` 같은 type 배열)로 직접 짠 작은 엄격 검사기로 대조한다.
  통과하면 `makeAsk`가 읽는 바로 그 형식·자리(`<run dir>/cache/<step>/<key>.json`)에 쓰고 pending 요청을
  지운 뒤 `STATUS=accepted` exit 0. 실패하면(모르는 키·이미 답한 키·`\n`/`\t` 밖의 제어문자·200KB
  초과·스키마 불일치 전부) `STATUS=rejected REASON=<...>` exit 5이며 pending 요청은 그대로 남는다 —
  답 내용을 절대 실행·해석하지 않는다(구조 검사뿐).
- **`status --session <id>`** — 대기 중인 요청과 현재 run의 완료 상태를 보여준다.

**정직한 출처**: 파이프라인 설정은 이 경로에서 `model: { model: "<별칭>", transport: "agent_step" }`을
호스트 없이 준다(전송할 host가 없으므로). 자체 `pinFor`는 `{ digest: null,
pin_kind: 'external_agent_unpinned', alias }`만 돌려준다 — 갖지 않은 가중치 다이제스트를 주장하지
않는다. `run_manifest.json`/`conversation_list.v0.json`은 그래서 로컬 모델이 만든 run과 매니페스트만
보고 구분할 수 있다. 설정은 `model.transport !== 'agent_step'`이거나 명시적 Owner 예외 블록
(`offhost_transcripts: { allowed: true, decided_by, decided_at: "YYYY-MM-DD", scope }`)이 없거나
`allowed`가 `true`가 아니면 그 자리에서 exit 4로 거부한다 — 로컬 파이프라인은 원래 전사 원문의 host
밖 반출을 금지하며, 이 harness는 그 기록된 예외 아래에서만 존재한다. `prompts_dir`가 상대경로면 이
harness 자신의 파일 위치에서 3단계 위(dev checkout이든 빌드된 lane이든 둘 다 그 지점이 저장소/lane
루트다)를 기준으로 푼다 — 절대경로는 그대로 쓴다.

시험: `tests/voice_conversation_list_agent_step.test.mjs`(16건, 전부 통과) — 한 답씩 몰아가는 전 과정
(boundary·nature·correction 세 질문, 정확히), 재실행 시 같은 pending key로의 결정성, 거부된 답 뒤
재개, 중복·모르는 키 거부, 스키마 검사기의 다섯 규칙, 제어문자 거부, 200KB 초과 거부, lock 보유·stale
회수, transport/예외 블록 거부 두 가지, 상대 `prompts_dir` 해석, **기존 CLI와 야간 lane 경로 둘 다
`agent_step`을 실제로 거부함**(코드 변경 없이), `plan`의 `skipped_existing`(다른 설정으로 만든 run도
포함)·`transcript_absent`/`skipped_short` 분리·정렬·상한, 그리고 실 subprocess로 몬 `answer --stdin`을
통한 따옴표·줄바꿈 섞인 한글 답의 바이트 그대로 왕복. `npm run validate:context-engine`에 들어 있다.
lane spec `context_read_lane.spec.json`은 `context-read-v6`로 올렸다 — 새 harness가 이미 통째로 추적되는
`guild_hall/context_engine/` 아래에 있고 그 import closure가 기존 tracked_paths만으로 이미 덮이므로
(`spec_closure_lib.mjs`의 `moduleClosure()`로 직접 확인) tracked_paths 추가는 없고, entry_points에만
한 줄이 늘었다. 이 lane 전용 `emit_*_spec.mjs` 생성기는 애초에 없어(hpp/team-client/backup-recovery와
달리) v2~v5와 같은 방식으로 손으로 유지했다.

## 답변 평가 하네스 v0

2026-09-20에 황금 질문 3개를 두 모델에 손으로 돌려 하루를 쓰고, 답을 산문으로 비교하고, 점수 칸은
끝내 못 채웠다. 카드 대조·메일 요약·메일 귀속을 고칠 때마다 필요한 것은 "지난번보다 나은가 나쁜가"를
몇 분 안에 말해 주는 물건이다. `harness/answer_eval.mjs`(+ 순수 규칙은 `src/runtime/answer_eval.mjs`,
정규식 안전 검사는 `src/runtime/safe_pattern.mjs`)가 그 물건이다. **v0에는 LLM 심판이 없다** — 심판
자신이 드리프트하는 물건이고 그러면 그 심판을 또 평가해야 하기 때문이다. 손으로 쓴 정답 열쇠와 문자열
대조뿐이다.

### 무엇을 재고 무엇을 못 재는가

재는 것은 셋뿐이고 **하나로 합친 점수는 일부러 없다**(찾음이 오르면서 오답이 같이 늘어난 변경이
비긴 것으로 보이면 안 되므로):

- **found** — `must_find` 열쇠 중 답에 들어 있는 것의 가중 비율. "이 사실/날짜/사람/항목번호를 말했는가".
- **cited** — `must_cite` 열쇠의 같은 비율. 근거를 사람 말로(날짜 + 보낸이·제목 조각) 또는 id로 가리켰는가.
- **errors** — `must_not` 열쇠 적중 수. 이미 틀린 줄 아는 주장을 했는가.

곁들이는 것: `minutes`(경과), `over_time`(`max_minutes` 초과), `answer_chars`(답 길이),
`clarification`(답 대신 되물었는가), `truncated`, `absent`, `nonzero-exit`, `pattern_timeout`(그 열쇠의
정규식이 예산을 넘겨 확인 자체를 못 했음), 그리고 못 맞힌 열쇠 이름들.

못 재는 것 — 문서에 같이 적지 않으면 숫자가 위험해지므로 분명히 적는다:

- **추론의 질도 말투도 못 잰다.** 열쇠 문자열이 있는지 없는지만 본다.
- **열쇠를 쓴 사람만큼만 좋다.** 정답 열쇠가 틀리면 점수도 같이 틀린다. 열쇠는 코드가 아니라 자료다.
- **많이 인용하면 열쇠는 맞는다.** 그래서 `answer_chars`를 항상 같이 낸다 — found 100%에 4,000자면
  답한 게 아니라 퍼온 것이다.
- **되물음 판정은 보수적인 표시일 뿐 점수가 아니다.** 세 조건이 모두 맞을 때만 붙는다: (1) `must_find`·
  `must_cite` 열쇠를 **하나도** 못 맞혔고, (2) 짧고(기본 400자), (3) 물음표로 끝나거나 질문 세트가
  명시한 짧은 패턴에 걸릴 때. (1)이 없던 첫 판본은 "…입니다. 더 필요하신 것 있으실까요?"처럼 제대로
  답하고 끝인사를 붙인 한국어 답을 되물음으로 찍었다. `expect_clarification: true`인 질문에는 안 붙는다.

### 대조 규칙

대조는 NFKC 정규화 + 소문자화 + 공백 축약된 문자열 위에서 한다(답이 줄바꿈으로 끊어 쓴 구절도 걸리고,
전각 `ＥＸ－１`은 `ex-1`이 된다).

- **한글은 경계 없이 포함 대조**다. 조사가 바로 붙으므로 `납기`는 `납기일`에, `홍길동`은 `홍길동이`·
  `홍길동과`에 걸린다.
- **ASCII 토큰(항목번호 등)은 경계 대조**다. 경계를 막는 것은 ASCII 낱말문자(`[0-9a-z_]`)와, **뒤에
  낱말문자가 따라오는** `.`·`-`뿐이다. 유리한 쪽만 적지 않기 위해 양쪽을 다 적는다:
  - 걸리지 **않는다**: `EX-1` ↛ `EX-15`, `EX-1-2`, `EX-1.5`, `EX-1_2`; `P00-014` ↛ `P00-014A`.
  - 걸린다: `EX-1` → `EX-1은`, `EX-1(마감)`, `ex-1`, `ＥＸ－１`, 그리고 문장 끝의 `EX-1.`
    (마침표 뒤에 낱말문자가 없으므로 토큰의 일부가 아니다).
- **날짜 모양(`YYYY-MM-DD`) 열쇠는 예외로 포함 대조**다. 날짜는 다른 글자에 바로 붙어 사는 것이 정상
  이므로 `2026-02-13`은 `2026-02-13T09:00`과 `2026-02-13(금)` 안에서도 걸린다. 경계를 강제하고 싶으면
  `"match": "token"`을 준다.
- **열쇠별 `match`로 무를 수 있다.** `"substring"`은 경계를 끄고, `"token"`은 강제하며 ASCII 토큰이
  아닌 값은 거부한다(조용히 다른 일을 하지 않는다).
- **정규식 항목**은 `"/ex-\\d{1,4}/"`처럼 `/…/플래그` 모양으로 쓴다. 안전 장치는 `src/runtime/
  safe_pattern.mjs`에 있고 **두 층이며, 실제로 버티는 것은 두 번째다.**
  - *컴파일 시점(거르개)*: 길이 상한 200자, 중첩 수량자·역참조·lookbehind 거부, 교대 분기 상한, 그리고
    정적 검사로는 못 잡는 모양을 잡는 ReDoS 타이밍 canary(`node:vm` 타임아웃, 예산 1초, 한 번 재시도).
    canary 문자열은 그 패턴 자신의 알파벳에서 만든다 — **여러 글자짜리 리터럴 토막까지** 포함한다
    (`(ab|a|b)+z`의 `ab`), 길이는 씨앗 120회 반복이다.
  - *실행 시점(진짜 울타리)*: 모든 대조를 `node:vm` 타임아웃(1초) 안에서 돌린다. 거르개를 통과한
    패턴이라도 답 하나당 예산 1초를 쓰고 그 열쇠에 `pattern_timeout`으로 보고될 뿐, 회차가 멈추지 않는다.
    그 열쇠는 "못 맞힘"으로 세되 `pattern_timeout_keys`에 따로 이름을 남긴다 — "답에 없다"와 "확인을 못
    했다"는 다른 사실이고, 뒤쪽은 봇이 아니라 질문 세트의 결함이다.
  - **거르개는 보증이 아니다.** 임의의 정규식이 파국적으로 되짚는지는 모양 검사와 몇 개의 탐침으로
    결정할 수 없다. 첫 판본이 그것을 증명했다: `(ab|a|b)+z`를 받아들였고, 그 `test()`는
    `'ab'.repeat(30) + '!'`에 대해 25초 안에 끝나지 않았다(canary가 한 글자 반복만 써서 놓쳤다). 지금은
    거르러 잡히지만, **거르개가 좋아졌다고 실행 시점 울타리를 걷으면 안 된다.**
  - 플래그는 `i`/`u`만 받고 `i`는 자동으로 붙는다(본문이 이미 소문자라 대문자 패턴이 조용히 안 맞는
    함정을 막는다).
  - 같은 모양의 검사가 `guild_hall/workspace_ledgers/src/classifier.mjs`에도 있지만 **import하지 않고
    여기에 따로 둔다**: 이 디렉터리를 통째로 싣는 두 배포 lane(`guild_hall/deployment_pack/lanes/
    context_read_lane.spec.json`, `graph_sync_lane.spec.json`)이 `workspace_ledgers`는 안 실어서,
    cross-module import는 repo의 모든 시험을 통과하면서 **빌드된 lane 안에서만**
    `ERR_MODULE_NOT_FOUND`로 죽는다. `tests/answer_eval.test.mjs`가 각 lane spec의 `tracked_paths`만으로
    임시 트리를 만들어 거기서 하네스를 실제로 import해 보는 시험을 갖고 있다.

### 질문 세트 쓰는 법

스키마 `soulforge.context_answer_eval_questions.v1`. **실제 세트는 private이며 repo 밖에 둔다.** repo에
들어 있는 것은 완전히 합성된 예시 하나뿐이다: `harness/fixtures/answer_eval_questions.example.json`
(가공 과제코드 P00-001, 가공 인명, example.com). 형태:

```json
{
  "schema": "soulforge.context_answer_eval_questions.v1",
  "set_id": "example-v1",
  "created_at": "2026-01-02T00:00:00.000Z",
  "clarification": { "max_chars": 400, "patterns": ["어느 과제"] },
  "questions": [{
    "id": "q1-deadline",
    "prompt": "봇에게 그대로 주는 질문 텍스트",
    "must_find": [{ "key": "deadline_date", "any_of": ["2026-02-13", "2026년 2월 13일"],
                    "weight": 2, "note": "사람이 보는 메모(영수증엔 안 들어감)" }],
    "must_cite": [{ "key": "kickoff_mail", "any_of": ["1월 9일"] }],
    "must_not":  [{ "key": "wrong_project", "any_of": ["P00-002"] }],
    "max_minutes": 4,
    "expect_clarification": false
  }]
}
```

- `any_of`는 "이 중 하나라도 있으면 맞음"이다. 같은 사실을 여러 표기로 적어 둔다.
- `weight`(기본 1)로 핵심 열쇠를 무겁게 준다. 빈 그룹은 0%가 아니라 `null`("안 쟀음")이고 평균을 안 끌어내린다.
- 모르는 필드 이름은 조용히 무시하지 않고 거부한다(`answer_eval_question_field_unknown`) — 오타 난 열쇠는
  "재고 있다고 믿는데 안 재는" 상태를 만들고, 이 하네스는 바로 그걸 막으려고 있다.
- 열쇠가 하나도 없는 질문도 거부한다(공짜 100%가 되므로).

### 두 가지 모드

**(1) `--answers-dir` — 이미 있는 답 파일 채점.** 모델도 명령도 필요 없다. 그래서 **지난 회차 답을 오늘
소급 채점**해 지금 회차와 비교할 수 있다. 기본 규약은 `<질문 id>.md`이고, 폴더에 `answers.json`이 있으면
그 대응표를 쓴다(`{"q1": {"path": "run-5b/first.txt", "elapsed_seconds": 200, "tool_calls": 4}}` — 경로는
답 폴더 기준 상대경로이며 폴더 밖을 가리키면 거부한다). 답 파일 하나가 없으면 그 질문은 `absent`로
전부 못 맞힌 것으로 세고, **전부** 없으면 결과가 아니라 배선 실수이므로 거부한다(exit 2).

**(2) `--ask-command` — 답을 먼저 만든다.** argv 배열 템플릿(JSON, 스키마
`soulforge.context_answer_eval_ask_command.v1`)을 주면 질문마다 한 번씩 실행한다. **셸을 안 쓴다**:
`spawn`에 argv 배열을 그대로 넘기고 문자열을 이어 붙이지 않으며, 질문 텍스트는 argv에 아예 안 들어간다
(임시 파일에 써서 `{prompt_file}` 자리에 그 경로만 들어간다). 답은 `{answer_file}`에서 읽는다.
`env`는 변수 **이름** 허용목록이고 값은 읽지도 기록하지도 않는다. 자식의 stdio는 `ignore`다 — 봇의 콘솔
출력은 답이 아니고(답은 파일이다), 그걸 여기서 버퍼링하면 하네스가 쓰러질 길만 하나 는다.
**순차 실행만 한다** — 로컬 모델 서버는 슬롯이 하나라 둘을 동시에 돌리면 둘 다 기다릴 뿐이다.

끝나는 방식 네 가지를 구분한다:

- **정상 종료(0) + 답 파일** → 채점.
- **0 아닌 종료 + 답 파일** → 답을 버리지 않고 채점하되 `nonzero-exit`/`exit:<코드>` 표시와
  `exit_code`를 남긴다. 답이 없으면 그때가 실패(`ask_command_exit:<코드>`)다.
- **타임아웃** → 답 파일을 **안 읽는다**(죽인 봇이 반쯤 쓴 파일을 답으로 채점하는 것이 답이 없는 것보다
  나쁘다). 죽일 때는 **프로세스 나무 전체**를 죽인다: POSIX는 `detached`로 띄워 프로세스 그룹째
  (`kill(-pid)`), Windows는 `taskkill /T /F`(`SystemRoot`에서 찾고, 없으면 PATH, 그래도 안 되면 직계
  자식). 이유는 슬롯이 하나이기 때문이다 — 직계 자식만 죽이면 그 봇이 띄운 모델 클라이언트가 살아남아
  **그 회차의 남은 질문을 전부 막는다**. 죽인 뒤에는 유예 타이머(5초)가 돌아
  자식의 `close`가 끝내 안 와도 그 질문을 `ask_command_timeout`으로 닫는다 — 죽이기 함수가 돌려주는
  것은 "어떤 방법을 썼는가"이지 "정말 죽었는가"가 아니며, 안 죽는 자식 하나가 회차 전체(그리고 CI)를
  멈춰 세우면 안 된다.
- **다른 누군가가 보낸 시그널** → `ask_command_signal`. "이 봇이 느리다"와는 다른 사실이다.

하네스는 특정 봇에 대해 아무것도 모른다. 아는 순간이 버그다 — 템플릿이 그 이음매다.
예시: `harness/fixtures/answer_eval_ask_command.example.json`.

### 비교하는 법

회차마다 `--label`(`5b`, `after-card-reconcile` 같은 것)을 주고 `--receipts` 폴더에 영수증을 쌓는다.
`--compare latest`나 `--compare <영수증 경로>`를 주면 나란히 놓은 증감표와 **새로 놓친 열쇠·새로 맞힌
열쇠** 목록을 같이 찍는다. `--fail-on-regression`을 주면 질문 하나라도 found/cited가 내려가거나 errors가
올라갔을 때 exit 3이다. 양쪽 중 한쪽에만 있는 질문은 added/removed이지 퇴행이 아니다.

- **같은 질문 세트로 채점한 두 회차만 비교한다.** `questions_sha256`이 다르면
  `answer_eval_compare_question_set_differs`로 거부한다(exit 2). 열쇠의 `any_of`에 표기 하나를 더한 것만
  으로도 그 질문에서 "맞음"의 뜻이 달라지는데, 질문 id로만 이어 붙이면 그 변화를 봇이 나빠진 것(또는
  좋아진 것)으로 읽는다.
- **`--allow-set-change`**를 주면 큰 경고 배너를 찍고, **양쪽 `key_digest`가 바이트 단위로 같은 질문만**
  증감을 낸다. 나머지는 `key_changed`로 표시되고 총계는 `-`이며, 이 비교는 **어떤 경우에도 퇴행을
  보고하지 않는다**(부분적으로만 보이는 것은 판정이 아니다). `key_digest`는 점수를 정하는 것 전부를
  해시한 값이다 — 질문 id·열쇠 이름·가중치·`match`·`any_of` 원문에 더해 **질문 본문(prompt)의 해시**와
  **세트 단위 `clarification` 블록의 해시**까지 들어간다(문구만 바꿔도 봇이 받은 질문이 달라지므로 같은
  열쇠라도 같은 측정이 아니고, `clarification`은 표시 하나를 정하며 모든 질문이 공유한다). prompt와
  패턴은 해시로만 들어가므로 영수증에는 여전히 질문 원문이 없다.
- **`latest`는 `status`가 `OK`가 아닌 영수증을 건너뛴다.** 전부 타임아웃 난 회차는 0으로 가득한 영수증
  이고, 그것이 기준선이 되면 다음 회차가 가짜 개선이 되고 그 다음 진짜 퇴행이 가려진다. 무엇을 고르고
  무엇을 건너뛰었는지 `compare: baseline …` / `compare: skipped … (status_ask_failed)`로 찍는다.
  순서는 파일 이름이 아니라 영수증의 `started_at` → 이름 접미사 순이다(이름의 시각은 초 단위라서).
- 비교가 거부돼도 **그 회차의 영수증은 남는다**. 회차는 실제로 돌았고 거부된 것은 비교뿐이다.

영수증(`soulforge.context_answer_eval_receipt.v1`)은 `<시각>-NNN.json`으로 항상 접미사를 달고
(충돌 때만 붙이는 접미사는 원본 이름보다 **앞서** 정렬돼 "최신"을 뒤집는다) `wx`로 연 pid 포함 임시
파일 + rename으로 원자적으로 쓰이며, **열쇠 이름과 숫자만** 담는다 — 질문 텍스트도, 답 텍스트도, 맞은
문자열도, `note`도, 답 폴더 경로도, argv도 안 들어간다(argv는 digest와 길이만). 공개 로그에 그대로
붙여도 되도록 만든 것이고, 답 자체는 sha256과 길이로만 가리킨다.

### 실행

```
node guild_hall/context_engine/harness/answer_eval.mjs \
  --questions <private>/answer_eval/questions.v1.json \
  --answers-dir <private>/answer_eval/runs/5b \
  --label 5b --receipts <private>/answer_eval/receipts \
  --compare latest --fail-on-regression

node guild_hall/context_engine/harness/answer_eval.mjs \
  --questions <private>/answer_eval/questions.v1.json \
  --ask-command <private>/answer_eval/ask_bot.v1.json \
  --label after-card-reconcile --receipts <private>/answer_eval/receipts \
  --only q1-deadline,q3-open-items --compare latest
```

`--dry`는 질문 세트를 검사하고 무엇이 돌 것인지만 찍는다(영수증도 안 쓰고 명령도 안 부른다).
exit code: `0` 돌았음 · `2` 사용법/검증 거부 · `3` 비교 대상 대비 퇴행(`--fail-on-regression`일 때) ·
`4` ask-command 실패·타임아웃. 4가 3보다 우선한다(답을 못 만든 회차의 숫자는 비교할 값이 아니므로).

시험: `tests/answer_eval.test.mjs`(질문 세트 거부 규칙, 한글·혼합 문자 대조, ASCII 경계 16칸 표, 정규식
안전 거부, 두 모드 — ask-command는 테스트가 직접 써서 `process.execPath`로 띄우는 작은 가짜 봇으로만
돌린다, 프로세스 나무 kill, 비교·퇴행 exit code, 질문 세트 변경 거부, `latest`의 순서·건너뛰기, 영수증에
원문이 없음, 원자적 쓰기, lane tracked_paths만으로 만든 트리에서의 import, 저장된 예시 세트 자체 검증).
`npm run validate:context-engine`에 들어 있고, 그 suite는 `guild_hall/validate/run_root_acceptance.mjs`의
`validate`·`done-check` 두 모드에 배선돼 있어 `npm run done:check`와 CI(`.github/workflows/validate.yml`,
ubuntu-latest)에서 같이 돈다. **여기 시험들은 Linux에서 돈다** — 이 하네스를 고칠 때 Windows에서만 되는
것을 넣으면 CI가 적색이 된다.

## 대화 목록 야간 lane — 마감(deadline)과 대조·질문 연쇄(chain) (0.22.7)

`13_SCHEDULE_AND_RAG_COVERAGE_PLAN_2026-09-21.md` A안의 코드 조각. `harness/voice_conversation_list_nightly.mjs`가
벽시계 마감과, 카드 생성이 끝난 뒤 2단계 대조·아침 질문 제시를 같은 프로세스에서 잇는 연쇄를 얻었다. 예약작업
재등록이나 실제 시각 전환은 이 조각에 없다 — Owner 실행 몫으로 남긴다. 2026-09-21 Owner 정정: 계획한 야간
시작은 22:00이 아니라 **00:00**(22:00은 Owner 자신의 근무 시간)이므로, 아래 예시는 00:00 시작·04:00 마감을 쓴다.

- **마감(`--deadline HH:MM`)**: Asia/Seoul 기준 시작 이후 다음 그 시각(`nextDeadlineInstant`) — 00:00 시작 +
  04:00 마감이면 같은 날 아침 04:00에서 멈추고, 23:30 시작 + 01:00 마감이면 자정을 넘겨 다음날 01:00에서
  멈춘다(하루 전 01:00이 아니라). 세션 하나의 카드 생성을 실제로 *시작하기 직전*에만 검사한다(분류 자체는
  값싼 파일 읽기라 검사하지 않음, 모델을 부르는 단계만). 넘겼으면 그 세션과 이후 계획 항목 전부를 이번 밤
  영수증에서 빼고 깨끗이 멈춘다 — exit 0, 실패가 아니다. 남은 세션은 별도 장치 없이 기존 backlog 메커니즘이
  다음 밤에 그대로 다시 집는다(그 세션은 여전히 verified run이 없으므로) — 시험이 실제로 두 번째 `runNightly`
  호출로 그 픽업을 확인한다(가정이 아니라 관찰). 영수증에
  `deadline.{configured,scheduled_start,at,stopped,sessions_done,sessions_left}`.
- **`--scheduled-start HH:MM`(선택)**: 마감을 "실제 프로세스가 시작한 시각"이 아니라 "예약된 시작 시각"에
  고정한다. 컴퓨터가 잠들어 있다가 00:00 트리거를 04:10에야 깨워 실행했다면, 안 주면(기존 동작) 마감이
  "04:10 다음에 오는 04:00" 즉 **내일**로 계산돼 이 회차가 있지도 않던 여유 시간을 얻는다. 주면(등록기가
  `-DailyAt`에서 항상 자동으로 넘긴다) 마감은 예약된 00:00 트리거 기준 그날 04:00에 고정되고, 04:10은 이미 그
  마감을 10분 넘겼으므로 **세션을 단 하나도 돌리지 않고 즉시 멈춘다** — 계획 전체가 다음 밤으로 남는다.
- **연쇄(`--chain-reconcile`)**: 카드 생성이 끝난 뒤(정상 종료든 마감 정지든) `--reconcile-receipts <dir>`에
  대해 `estate_voice_card_reconcile.mjs`를 `--nightly-receipts <이 밤의 --receipts>`로 부르고, 이어서
  `voice_question_cli.mjs present`를 **같은** reconcile receipts 디렉터리로 부른다(present가 예외 풀을 읽는
  자리가 그곳이라). 두 호출 다 동적 `import()`로 같은 node 프로세스 안에서, 상대경로만 써서 부른다 — lane
  폐포에 새 파일이 늘지 않는다(둘 다 이미 v4에 named entry point). reconcile은 이 밤의 영수증이 디스크에 실제로
  쓰인 **뒤에** 돌아 자기 backlog 모드가 방금 끝낸 세션을 볼 수 있고, 그 결과는 같은 영수증 파일에 두 번째
  쓰기로 접힌다(새 파일이 아니다). `--linear-root`는 준 것만 넘기고 안 주면 reconcile 자신의 기본값
  (`data_root/ingress/linear`)을 그대로 쓴다(기본값을 이 파일이 다시 적어 드리프트를 만들지 않는다). 실패는
  (reconcile·present가 실패로 돌아오든, 연쇄 함수 자체가 예외를 던지든 방어적으로 잡는다) 영수증
  `chain.{status,stage,reason}`에 남고 이 밤 전체를 FAILED·비영 종료코드로 만들되 카드 생성 결과는 절대 다시
  돌거나 되돌려지지 않는다. `--dry`는 두 하위 호출에도 그대로 전파된다(둘 다 자기 `--dry`로 미리보기 — 등록기
  preflight가 검사하는 그 모양).
- **등록기**: `ops/register-voice-conversation-list-task.ps1`에 `-DailyAt`(기본 03:00, 안 주면 이전과 완전히
  같은 모양으로 등록. Owner 정정으로 실제 새 예약값은 `00:00` 예정이나 이 파라미터의 기본값 자체는 바꾸지
  않았다 — 안 주면 여전히 이전 task를 등록), `-Deadline`, `-ChainReconcile`(+ `-ReconcileReceiptsRoot`/
  `-LinearRoot`/`-MailRoot`/`-QuestionsCap`)를 더했다. `-Deadline`을 주면 harness의 `--scheduled-start`를
  항상 `-DailyAt` 그 값으로 자동으로 함께 넘긴다(호출자가 둘을 따로 입력해 서로 어긋날 길을 아예 없앤다). 기존
  pin(레인 매니페스트·Node·root table·tools config·pipeline config sha256·dry-run plan digest·기존 task
  sha256)은 전부 그대로 유지되고, 새 값은 plan hashtable과 `-Register` 뒤 XML 대조(action 인자 줄 전체
  비교이므로 자동으로 포함)에 함께 들어간다. `-Register` 없이 부르면 새 값을 포함한 전체 plan을 찍는다. lane
  spec `context_read_lane.spec.json`은 `context-read-v5`로 올렸다 — 새 tracked_paths·entry_points는 없다(두
  harness/registrar 파일이 이미 v4에 이름 올라 있었다).

신선한 눈 검토 후 정정(같은 슬라이스, 병합 전), 필수 1건(3부분)·should 6건·nit 4건:
- (R1, 필수) **"마감 이후 시작"이 조용한 성공으로 보였다.** Task Scheduler는 `-StartWhenAvailable`이 걸린
  로그온 종속 트리거라 재부팅·로그오프 밤이면 00:00 트리거가 04:00 넘어 로그온 때야 겨우 실행될 수 있는데,
  그런 회차가 세션을 하나도 못 돌려도 기존엔 `OK`/exit 0였다 — 7일 backlog·40 cap과 겹치면 매번 밀리는
  세션이 조용히 사라질 수 있었다. 세 부분으로 고쳤다. **(a)** 이번 밤이 세션을 단 하나도 시도하기 전에 이미
  마감이 지났으면(마감 자체가 mid-run에 지난 것과 구분) `SKIPPED_PAST_DEADLINE`이라는 별도 영수증 상태와
  별도 종료코드(4 — 0/OK, 2/FAILED, 3/LOCK_HELD와 구분, `main`의 주석에 문서화)를 낸다. 진짜 실패(계획을
  못 읽음·분류 실패·검증 안 된 run)가 있으면 여전히 `FAILED`가 우선한다. **(b)** 매 밤 영수증에
  `backlog.{aging_out_soon, aged_out_unprocessed}`를 낸다 — `aging_out_soon`은 `AGING_SOON_NIGHTS`(2)일
  안에 window를 벗어날 아직 미완 후보 수(`--max-sessions` cap과 무관하게 정확히 다시 분류해서 셈),
  `aged_out_unprocessed`는 **어젯밤엔 window 안이었는데 오늘 밤엔 아닌 바로 그 하루**(과거 영수증을 읽지
  않는 무상태 검사, 그 하루의 존재 자체가 충분한 신호이므로)에 여전히 verified run이 없는 세션의 날짜·수·id
  목록이다 — 절대 조용히 넘어가지 않는다. **(c)** `buildSessionPlan`이 aging-soon 후보를 새 날의 자기 세션
  보다 앞에 놓도록 순서를 바꿨다(`agingOutSoonThreshold`) — backlog는 이미 오래된 순 정렬이라 urgent
  부분은 그 배열 자신의 앞부분일 뿐이다. `--max-sessions` 아래에서도 이제 urgent 후보가 cap에 먼저 밀려나지
  않는다.
- (S1) 연쇄 첫 쓰기가 `chain: null`이라 연쇄 도중 죽으면 연쇄 안 한 깨끗한 밤과 구분이 안 됐다. 이제 첫 쓰기가
  `chain: {status: 'RUNNING', started_at}`이고 연쇄가 끝나면 실제 결과로 덮어쓴다. 두 쓰기 다
  `atomicWriteFileSync`(같은 디렉터리에 임시 파일 쓰고 rename)라 죽어도 반쯤 쓰인 영수증이 실경로에 남지 않는다.
- (S2) `--deadline`이 `--scheduled-start`와 같으면 "그 시각의 다음 발생"이 하루 뒤가 돼 24시간 여유를 조용히
  준다 — `nextDeadlineInstant`와 등록기(`-Deadline`/`-DailyAt`) 둘 다 이제 거부한다.
- (S3) `--deadline`/`--scheduled-start`/`--no-start-within`을 값 없이 주거나 반복하면(`options()`가 `true`나
  배열을 돌려줌) `--questions-cap`처럼 조용히 무시하지 않고 큰 소리로 거부한다(`*_usage_invalid`).
- (S4) 세션 하나의 벽시계 예산이 없어 03:59에 시작한 세션이 기본 한도로 ~10시간 돌 수 있었고, 늦은 시작은
  실제 시작 시각부터 세는 6시간 task 한도로만 막혀 06:40 브리핑까지 넘어갈 수 있었다. `--no-start-within
  MINUTES`(마감이 있으면 기본 30, `DEFAULT_NO_START_WITHIN_MINUTES`)를 더해 마감 그만큼 전부터는 **새
  세션을 시작하지 않는다**. 실제 mid-flight 중단(`abandoned_at_hard_stop`)은 만들지 않았다 —
  `runConversationList`(파이프라인)를 직접 확인한 결과 호출 루프 어디에도 abort 신호·벽시계 예산이 없어
  깨끗하게 끊을 수 없으므로, 리뷰가 명시적으로 허용한 대안(시작 여유 + 영수증 경고)만 구현했다: 세션이
  `HARD_STOP_GRACE_MINUTES`(60, 고정값·아직 플래그 아님)를 넘겨 끝나면 그 행에 `overran_hard_stop: true`와
  `receipt.warnings`에 한 줄을 남길 뿐, 자르지도 다시 올리지도 않는다 — 만든 카드가 진짜 카드다.
- (S5) 연쇄 전에 이 밤의 lock을 풀어서, 다른 수동 회차가 연쇄 도중 진짜 카드 생성을 새로 시작할 수 있었고
  reconcile 자신의(별도) lock이 동시에 잡히면 이 밤 전체가 가짜 FAILED로 보였다. 이제 이 밤의 lock은 연쇄가
  끝날 때까지 쥔 채로 두고(reconcile의 독립 lock은 그대로 별개), reconcile의 `LOCK_HELD`는
  실패가 아닌 별도 chain 상태(present는 건너뜀)로 처리한다.
- (S6) `-StartWhenAvailable` + `-DailyAt 00:00`이면 오늘 이미 지난 StartBoundary로 인해
  등록 직후 바로 발동할 수 있었다(그러면 연쇄의 `present`가 그날 아침 질문 슬롯을 낮에 미리 써버린다).
  StartBoundary를 다음 **미래** 발생 시각으로 미루도록 고쳤다 — 사후 XML 대조는 원래도 시각만(날짜 무시)
  비교해 그대로 검증 가능하다.
- (N1) `deadline.sessions_left`가 멈춘 뒤 남은 계획 항목 전부를 셌다(skip/existing까지) — 이제 그 나머지 중
  실제로 `run`으로 분류된 것만 센다.
- (N2) 프로그래밍 호출자가 `rootTableSha256`를 안 주면(`null`) 연쇄 argv에 문자 그대로 `null`이 들어갈 뻔했다
  — 이제 없으면 그 인자 자체를 아예 안 넣어 reconcile 자신의 파일 해시 기본값을 쓰게 둔다.
  실 reconcile/present CLI로 end-to-end 확인.
- (N3) PowerShell 5.1의 `ConvertTo-Json`이 mail-root 배열을 0개/1개일 때 각각 `{}`/맨 원소로 잘못 펼쳤다
  (그리고 `if/else`의 빈 배열 가지가 쉼표로 감싸지 않으면 아예 `$null`로 무너지는 별도 함정도 있었다) —
  `[object[]]$(if (...) {...} else { , @() })`로 0/1/2개 다 정확히 `[]`/`["x"]`/`["x","y"]`로 찍힌다.
  검증: 실제 PS 5.1 세션에서 세 경우 모두 직접 확인.

등록기 운영 참고(리뷰가 확인한 실제 상태): **현재 운영 중인 예약작업은 이 등록기를 거치지 않고 트리거를 직접
편집해 00:00로 이미 재시각됐다.** 이 등록기로 다시 등록하려면: (1) `-ExpectedExistingTaskSha256`에
`%WINDIR%\System32\Tasks\SoulforgeVoiceConversationList` 파일의 SHA-256(접두사 없는 64자 16진수 그대로)을
준다, (2) `-Register` 없이 한 번 불러 plan digest를 얻는다, (3) 그 digest를 `-ExpectedDryRunDigest`로 얹고
`-Register`를 더해 똑같은 명령을 다시 부른다. **경고**: `-DailyAt`을 빼면 sha 대조는 걸리지 않은 채로 조용히
03:00로 되돌아간다 — 재등록 전 찍히는 `daily_at=` 줄이 그걸 미리 보여주는 유일한 자리다.

두 번째 신선한 눈 검토 후 정정(같은 슬라이스, 병합 전) — merge-ready 판정, 필수 없음, should 4건·저렴한 nit
5건:
- (S1-1) `renameSync`가 대상 파일이 이미 열려 있으면 Windows에서 `EPERM`으로 실패하는 것을 실측했다 — 고치기
  전에는 그 throw가 `runNightly` 밖으로 그대로 빠져나가 `chain: RUNNING`을 영원히 남기고 임시 파일을 고아로
  만들고 깨끗한 밤을 FAILED로 보고했다. `atomicWriteFileSync`가 이제 `EPERM`/`EACCES`/`EBUSY`를 몇 번(기본
  4회) 짧은 지연(50ms, `Atomics.wait` 동기 슬립)을 두고 재시도하고, 그래도 안 되면 대상에 직접 덮어쓰기로
  물러난다. 임시 파일은 어느 경로든 `finally`에서 항상 지운다. 재시도 대상이 아닌 오류(예: `ENOSPC`)는 즉시
  그대로 던진다 — 조용한 대체 쓰기로 감추지 않는다.
- (S5-1) `STALE_LOCK_MS`(3시간)는 00:00 시작+04:00 마감+60분 grace+연쇄가 이 lock을 약 5.5시간 쥘 수 있는
  실제 구성보다 짧다 — 수동 회차가 살아있는 lock을 stale로 오판해 가로채고, 첫 회차가 자기 `releaseLock`으로
  그 두 번째 회차의 새 lock을 지워버릴 수 있었다. 이제 stale 문턱은 이 밤의 구성(예약된 시작→마감 스팬 +
  hard-stop grace + 연쇄면 `CHAIN_ALLOWANCE_MS`, 최저 `MIN_DEADLINE_STALE_LOCK_MS`=8시간)에서 유도한다
  (`staleLockMsFor`). `releaseLock`은 이제 디스크의 lock이 정확히 이 회차가 쓴 pid·started_at과 같을 때만
  지운다 — 다른 회차가 이미 가로챈 살아있는 lock은 그대로 둔다.
- (R1b-1) `aged_out_unprocessed`가 정확히 하루(window 밖으로 막 떨어진 날)만 봐서, 이 필드가 존재하는 바로 그
  경우(하룻밤을 통째로 걸러 뜀)에 하루를 조용히 잃었다. 이제 가장 최근 이전 영수증의 `ran_at`부터 오늘까지의
  간격만큼(없으면 `MAX_AGED_OUT_LOOKBACK_DAYS`=7로 대체, 항상 7일 상한) 여러 날을 되돌아보고, 찾은 모든
  미완 세션을 날짜별로 묶어(`by_date`) 보고한다.
- (R1a-1) exit code 4가 Task Scheduler까지 절대 닿지 않았다 — `powershell.exe -Command "& node ..."`는
  네이티브 명령의 종료 코드를 그대로 물려주지 않는다(실측: 숨은 `.vbs` 런처까지 전체 경로로 확인, 모든
  비영 코드가 맨 1로 뭉개짐). 생성된 명령 스크립트 끝에 `; exit $LASTEXITCODE`를 더했다(실측: 이 문구가
  있으면 4가 그대로 전달됨). 이 문구는 `$CommandScript`/`$HiddenActionArgumentLine`의 일부라 기존
  `action_sha256` plan digest와 사후 XML 대조(인자 줄 전체 비교)에 별도 배선 없이 자동으로 포함된다.
  exit code가 실제로 보이는지 이 파일 스스로는 검증할 수 없다는 점을 `main`의 주석에 정직하게 남겼다.
- 저렴한 nit 5건: (1) harness가 `--deadline` 없이 준 `--no-start-within`/`--scheduled-start`를 거부하고,
  단독 `--scheduled-start`도 형식 검사한다. (2) `--no-start-within`이 `/^\d+$/`만 받는다(빈 문자열이
  `Number('')`=0으로 조용히 통과하던 것을 막음). (3) 마감 여유(margin)가 예약된 시작→마감 스팬 이상이면
  거부한다(`deadlineSpanMs` 공유). (4) 파이프라인 설정의 `limits.llm_calls × model.timeout_ms`를
  `worst_case_session_minutes`로 영수증 `deadline` 블록에 남기고, `no_start_within + hard-stop grace`를
  넘으면 경고를 남긴다(브리핑까지의 여유는 계산하지 않는다, 요청대로). (5) 영수증 `schema_version`을
  v2로 올렸다(`status`가 값을 얻고 `chain`/`backlog`/`warnings` 블록이 늘었으므로) —
  `estate_voice_card_reconcile.mjs`의 배경 스캔은 `NIGHTLY_RECEIPT_SCHEMA_V1`도 같이 받아들이도록 고쳤다
  (읽는 `sessions` 배열 자체는 안 바뀌었으므로).

등록기가 실제로 만드는 마지막 명령줄(자리표시자, exit code 전달 확인용):
```
wscript.exe //B //NoLogo "<lane>\ops\run-voice-conversation-list-hidden.vbs" "<System32>\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "& '<node.exe>' '<lane>\...\voice_conversation_list_nightly.mjs' '--root-table' '<root_table.json>' '--root-table-sha256' 'sha256:<...>' '--tools-config' '<tools.json>' '--pipeline-config' '<pipeline.json>' '--receipts' '<receipts_dir>' '--max-sessions' '40' '--deadline' '04:00' '--scheduled-start' '00:00' ; if ($null -eq $LASTEXITCODE) { exit 1 }; exit $LASTEXITCODE"
```

세 번째 신선한 눈 검토 후 정정(같은 슬라이스, 병합 전) — 필수 1건, should 4건·저렴한 nit 5건:
- (R1, 필수) round 2의 `; exit $LASTEXITCODE`는 node.exe 자체가 뜨지 못하는 경우(예: 경로가 틀림)를 놓쳤다
  — `&`(호출 연산자)는 네이티브 프로세스가 실제로 실행돼 끝났을 때만 `$LASTEXITCODE`를 채우므로, 실행 자체가
  실패하면 그 변수는 세션 시작 값인 `$null`로 남고 `exit $null`은 종료코드 0이다(round 1의 무조건 1보다
  나쁘다 — 실패가 성공으로 보고된다). 생성된 명령 끝을 `; if ($null -eq $LASTEXITCODE) { exit 1 }; exit
  $LASTEXITCODE`로 고쳤다. 실측(직접 PowerShell `Start-Process -Wait -PassThru` + 숨은 `.vbs` 런처 그대로를
  부르는 새 hermetic 시험 둘 다로): node exit 4→4, node exit 0→0, node exit 2→2, node.exe 경로 없음→1.
- (S1) `atomicWriteFileSync`의 옛 `finally`가 대체 쓰기(overwrite)가 도중에 실패해도 임시 파일을 무조건
  지웠다 — 대상이 잘렸는데 유일하게 온전한 사본까지 같이 사라지는 경우였다. 이제 성공한 경로(rename 성공·
  overwrite 성공·recovery 쓰기 성공)에서만 지우고, 실패 경로는 전부 `tmp_path`를 오류에 실어 보존한다.
- (S2) 두 대체 경로(rename·직접 덮어쓰기)가 모두 막히는 경우(대상을 쥔 reader가 rename도 overwrite도 거부)를
  다루지 못했다 — 이제 형제 경로 `<파일명>.recovered.json`에 마지막으로 써서 그 밤의 기록을 살린다. 대조기의
  `.json` 글롭이 `.recovered.json`도 이미 그대로 집으므로(확장자가 같은 패턴이라 우연이 아니라 그대로
  두기로 결정) 읽기 쪽은 손대지 않았다 — README의 "영수증" 절에 그 한계를 좁혀 적었다(원래 경로는 갱신되지
  않는다).
- (S3) `worst_case_session_minutes`는 정상 설정에서 죽어 있었다 — `config.model.timeout_ms`가 `readPipelineConfig`
  기본값에 없어서다. 실제 런타임 기본값은 `src/adapters/local_model/ollama_chat.mjs`의
  `binding.timeout_ms ?? 600000`뿐이었다. 그 상수를 `DEFAULT_CHAT_TIMEOUT_MS`로 내보내 두 자리에서 공유한다
  (숫자를 복제하지 않는다).
- (S4) `agedOutLookback`(구 `agedOutLookbackNights`)이 `now`보다 미래인 `ran_at`을 가진 영수증도 "가장 최근
  실행"으로 셀 수 있었다 — 미래 timestamp는 이제 무시한다.
- 저렴한 nit 5건: (1) `uncapped_gap_days`를 `lookback_nights`와 나란히 기록한다(둘 다 캡 전/후를 보여준다).
  (2) 이전 영수증이 전혀 없는 첫 회차는 7일 lookback 대신 `first_run: true` + `nights: 1`로 보고한다(이
  lane이 한 번도 못 본 세션을 "이 lane 밑에서 aged out"이라 말하지 않는다). (3) aging 스캔이 `error`를
  안고 있으면 `count`를 `null`로 비운다(오류 옆에 반쪽짜리 숫자를 두지 않는다). (4) `staleLockMsFor`는
  `--deadline` 없이 `--chain-reconcile`만 줘도 `CHAIN_ALLOWANCE_MS`를 더한다. (5)
  `context_read_lane.spec.json` v5 설명의 "두 파일"을 "세 파일"로 고쳤다(이 회차가
  `voice_conversation_list_nightly.mjs`·`register-voice-conversation-list-task.ps1`·
  `estate_voice_card_reconcile.mjs` 셋을 건드리므로).

시험: `tests/voice_conversation_list_nightly.test.mjs` — `nextDeadlineInstant` 자체 8건, 마감 정지·다음 밤
픽업·마감 미도달·지각 시작 즉시 정지 4건, 연쇄 순서·인자 전달·실패 기록·throw 방어·`--dry` 전파 5건, 실
reconcile/present 종단 시험 2건, 등록기 구조 시험 3건(-DailyAt/-Deadline/-ChainReconcile·S2/S4/S6/N3·
R1a-1, 전부 PowerShell 실행 없이 소스 텍스트 대조) + R1 hermetic 실측 1건(Windows에서만 돎), R1(필수) 5건,
S1 1건, S2 2건, S3 1건, S4 3건, S5 2건, N1 1건, S1-1(재시도·대체 쓰기·정리) 3건, S5-1(`staleLockMsFor` 3건
+ 통합 1건 + `releaseLock` 소유권 3건), R1b-1(다중일 lookback) 1건, nit1/2(CLI 엄격 검사) 2건, nit3
(margin≥span 거부) 1건, nit4(worst-case 경고) 2건, round 3 R1(exit-code 실측) 2건, S1/S2(원자적 쓰기
3단 대체) 3건, S3(timeout 기본값 공유) 1건, S4(미래 ran_at 무시) 1건, nit(uncapped gap) 1건, nit(첫 회차
first_run) 1건, nit(chain allowance without deadline) 1건 — 총 93건, 전부 통과. `tests/estate_voice_card_reconcile.test.mjs`에
nit5(schema v1/v2 겸용 수용) 1건 추가, 47건 전부 통과(round 3에서 새 실패 없음).

## 카드 대조 4단계 — N≤10 질문 선택기 + 빠른 고리 (0.22.6)

`VOICE_RECORDING_LIBRARY_V0.md` "2026-09-20 운영 방침"의 네 번째 조각(외부 회신 09·10의 EXT-70·72·73·74).
예외함과 아침 브리핑 사이의 "질문 집계·선택" 단계와, 사람 답을 즉시 재사용하는 빠른 고리
(색인·검색 없이 원장만). 느린 고리(수락 사례→색인 세대)는 여기 없다(Step 5).

- **선택기(S4-1)**: `src/runtime/voice_morning_questions.mjs`의 `selectQuestions`는 순수 함수다(I/O·모델
  없음, 같은 입력→같은 출력). 입력은 대조 영수증들의 `exception_review` 전체(**절대 안 자름**, 몇 회차든)와
  질문 원장. 묶음(질문 하나) 기준은 같은 `session_id` AND 같은 판정 종류(`kind`) AND 같은 과제 후보
  집합뿐 — 제목·날짜만으로는 절대 안 묶는다. 판정 종류는 이유(reason)의 네 갈래: 귀속
  (`strong_conflict`/`important_and_unresolved`/`missing_context`/`new_project_candidate`), 내용확인
  (`content_mismatch`), 분할(`needs_split`), 조건확인(`conditional_or_reported`). 질문 id는
  (종류, 정렬된 대상 목록(`session_id+run_id+segment_id`)) 안정 해시 — 같은 날 다시 돌려도 같은 id,
  새 질문 0건. 우선순위: (1) 납기·마감·기한·계약·발주·금액 표지가 있거나 `content_mismatch`인 것(긴급)
  먼저, (2) 그 다음 `first_seen`이 오래된 순. 상한(`cap`, 기본 10)을 넘는 것은 조용히 늘리지 않고 긴급이면
  `urgent_overflow`, 아니면 `carried_over`로 보존한다. **빠른 고리(재사용)**: 원장에 이미 `answered`이고
  대상이 그대로인 질문은 `resolved_by_reuse`로 다시 안 묻는다 — 색인도 검색도 없다. run_id가 바뀌거나
  같은 구간에 새 판정 이유가 생기면(모순) 새 id로 다시 열리며 `reopened_from`에 옛 id를 남긴다.
- **질문 원장(S4-2)**: `harness/voice_question_cli.mjs`가 `control_root/voice-questions/questions.v0.json`
  하나에 쓴다(스키마 `soulforge.voice_question_ledger.v0`, 상한·락 파일·staging+rename은 다른 ledger들과
  같은 방식). 행: `question_id`, `kind`, `targets[{session_id, run_id, segment_id, receipt_ran_at}]`,
  `options`, `representative{time, title}`(제목·설명 텍스트뿐, 전사 원문 없음), `status`
  (proposed|presented|answered|withdrawn), `first_seen`, `presented_on[]`(재노출한 날짜들, 지우지 않고
  누적), `answered{by, at, choice}`, `reopened_from`.
- **CLI(S4-3)**: `present`가 선택기를 돌려 markdown을 찍는다 — `어제 애매한 것 N건 (이월 M, 긴급 초과 K)`
  머리글, 줄마다 `n. HH:MM 제목 — 질문 종류 — 선택지: ...`(사람이 읽는 줄엔 id 없음, 제목은 줄바꿈·`|`·
  선행 "N. "을 지운 한 줄·80자 상한이라 제목 텍스트가 가짜 줄이나 가짜 포인터를 만들 수 없다), 끝에
  포인터 줄 `[q:<id> ...]`. 0건이면 `없음`. `answer --question <id> --choice <code|other:<code>|none|
  not_work|split|keep|confirm_content> --by <actor>`가 먼저 그 질문의 종류·선택지에 맞는 답인지 검사하고
  (귀속은 그 질문이 내건 코드/`other:<code>`/`none`/`not_work`, 내용확인·조건확인은 `confirm_content`/
  `none`, 분할은 `split`/`keep`뿐 — 다른 모양은 어떤 쓰기도 하기 전에 `question_choice_invalid`이며
  `other:<code>`는 이번에 읽은 대조 영수증들이 실제로 후보로 제안한 과제 코드일 때만 받는다), CE-34대로
  대상의 run_id가 최신 대조 영수증과 같은지 확인한다(다르면 `question_targets_stale`로 거부하고 질문을
  `withdrawn`으로 남김 — 같은 run_id에 더 최신 영수증이 있는 것만으로는 정지가 아니다, 그 영수증의
  `ran_at`까지 더 최신이어야 정지). 귀속 질문의 과제 코드 답은 기존 `voice_route_cli.mjs confirm
  --project`만 부르며, confirm이 실제로 거부하는 세 값(제목 null·성격 undetermined·품질 unknown)이 현재
  구간 행에 이미 없을 때만 채운다(제목은 질문의 대표 제목, 성격은 `project_work`, 품질은
  `independent_fast`) — 행이 이미 가진 값을 이 CLI가 덮어쓰는 일은 없다. `not_work`는 그 구간이 이미
  `confirmed`면 `question_target_confirmed`로 거부하고 "withdraw 먼저"를 안내하며, 확정되지 않았다면
  *현재* ledger 행의 후보 중 기계가 쓴 것(`reconcile:`/`voice_conversation_list:` basis)만
  `set --drop-project`로 지우고 사람이 손으로 남긴 후보는 건드리지 않는다 — 이 파일 자신은 voice route
  ledger를 절대 안 쓴다. 내용확인·분할·조건확인 질문은 어떤 선택지든 원장에만 기록하고 route는 안
  건드린다(카드 값 확인이지 과제 배정이 아니므로). 같은 답을 다시 보내면 아무것도 다시 안 쓴다(멱등, 상태
  먼저 확인). 대상 하나가 실패하면(예: 그 구간 ledger 행이 아직 없음) 그 대상만 실패로 기록하고 질문은
  `presented`에 `partial`(고른 선택지도 함께) 메모를 남긴 채 `answered`로 넘어가지 않으며, `present`는
  그 메모를 다음 노출에서 지우지 않고, 재시도는 그 메모의 이미 성공한 대상을 다시 쓰지 않고 실패했던
  대상만 다시 부른다. `--by`는 대조기 자신의 actor나 `actor:context-engine:`/`actor:bot:`/
  `actor:machine:` 모양이면 거부한다(신원 증명이 아니라 CLI 단 형식 검사, 문서화된 그대로). `--dry`는
  실제로 쓰지 않고 대상마다 `would_apply`(실제로 라우트 쓰기를 시도할지)와 미리 알 수 있는 거부 사유를
  보고한다 — 가짜 `ok:true`를 찍지 않는다. 명령마다 `--receipts` 아래에 스키마 v1 영수증을 남긴다(밀리초
  단위 파일명 + 충돌 시 번호 접미사라 같은 초 안 두 번 호출이 서로 덮어쓰지 않음). **markdown을 어딘가로
  보내는 것(Step 4b)과 예약작업 등록은 이 조각에 없다.**
- **원장 잠금·상한(S4-4 정정)**: `questions.lock`은 `estate_voice_card_reconcile.mjs`의 자기 잠금
  회수(`harness/estate_voice_card_reconcile.mjs:141-160`)를 거울로 옮겨, 3시간(`QUESTION_LEDGER_STALE_
  LOCK_MS`) 넘은 잠금은 버려진 것으로 보고 회수하며 받아간 쪽을 영수증의 `lock.reclaimed_stale`/
  `previous_lock`에 남긴다. 원장이 `MAX_LEDGER_BYTES`/`MAX_QUESTIONS`를 넘기며 쓰일 때는 답변/철회 후
  90일 지난 행을 같은 폴더의 `questions.archive.<date>.json`(append-only)로 옮기고 나서 쓴다 — 살아있는
  원장 파일이 다음 읽기에서 "너무 큼"으로 거부될 상태로 남는 일은 없다.

시험: `tests/voice_morning_questions.test.mjs`(선택기 전체 규칙, CE-30~34 반례별 1개씩, 후보 집합이
다르면 id도 다름, tz-aware "오늘"), `tests/voice_question_cli.test.mjs`(원장·CLI 연결, 재사용·재전사·
부분실패·기계 actor 거부, 종류별 선택지 검사, 잠금 회수, 원장 archive, 제목 위조 방지, not_work 정련).

## 카드 대조 3단계 — 판정 규칙 v1 + 답변 소비 최소 경계 (0.22.5)

`VOICE_RECORDING_LIBRARY_V0.md` "2026-09-20 운영 방침"의 세 번째 조각(외부 회신 09·10). 여전히 네 분류
(`provisional`/`candidate`/`exception`/`skip`) 뿐이고 다섯 번째는 없다. "stale"(입력 유효성)은 분류가 아니라
별도 축으로 `result.input`에 얹힌다.

- **판정 모듈 v1(S3-1)**: `src/runtime/voice_attribution_policy.mjs`의 `classifyAttribution`이 새 검사 순서로
  바뀌었다(머리말에 전체 서술). 굵직한 것만: 판독 불가 나 품질이 나쁘면 `skip`이 아니라
  `candidate`/`needs_recovery`(CE-26 — 판독 불가는 다시 검토할 일이지 조용히 사라질 일이 아니다);
  `mixed`는 위험 표지나 후보 2개 이상이면 `exception`/`needs_split`, 아니면 `candidate`/`mixed_unsplit`;
  idea·daily 등은 원칙 `skip`이나 요청·기한·발주·계약 같은 표지가 있으면
  `candidate`/`work_signal_outside_project_nature`로 보존한다(마찬가지로 CE-26); 후보가 전혀 없는데
  `estate_shared_terms.mjs`의 `IDENTIFIER` 모양(글자+숫자+하이픈)이면서 등록된 과제 코드가 아닌 토큰이
  있으면 `exception`/`new_project_candidate`; 후보 없이 위험 표지만 있고 그 표지 말고는 아무것도 구체적
  으로 안 적혔으면 `exception`/`missing_context`; **유일한 strong 후보여도** 카드가 적은 날짜·금액이 그
  구간의 전사 창 텍스트에 없으면(정규화 문자열 대조, 오디오도 다른 프로젝트 기록도 아님)
  `exception`/`content_mismatch` — 전사 창을 못 구했으면 `provisional`은 유지하되 `content_check:
  'unverified'`로 정직하게 표시한다(확인했다는 거짓 주장 아님). 메일/Linear 대조(corroboration)는 이제
  `cues`로만 남고 `provisional` 승격에 전혀 관여하지 않는다(v0에서는 승격시켰다). 남는 weak/미분류에
  위험 표지가 있으면 `exception`이되, 표지가 조건문("만약 …면")·인용/전언("…다고 말했다")·부정/금지
  ("하지 마", "하지 않")·미완("아직 …") 안에 있으면 `reason: 'conditional_or_reported'`와 `modality`
  필드로 구분한다(같은 예외지만 "결정"이 아니라 "조건부/인용"임을 안다) — 그 외에는
  `important_and_unresolved`(구 `risk_marker_without_corroboration`). `RISK_MARKERS`에 '미완료'·'완료되지
  않'을, 새 `DEADLINE_PATTERN`으로 "내일까지"류 상대날짜 마감을 더했다(둘 다 CE-26 known miss).
- **대조기 연결**: `estate_voice_card_reconcile.mjs`가 세그먼트마다 `staleReason`(오늘은 S2-2
  `identity_changed`뿐 — 그 값이 있으면 판정은 그대로 계산하되 `result.input.valid === false`가 되고
  대조기는 쓰지 않는다, 기존 identity_changed 전용 검사를 이 한 검사로 일반화), `registeredProjectCodes`
  (이미 읽은 Linear 프로젝트 이름의 앞 코드 집합), `transcriptText`(유일 strong 구간만,
  `voice_session_read.mjs`의 같은 읽기 경로로 그 구간 창만 읽음, read-only)를 넘긴다. 영수증에
  `modality`/`content_check`/`content_mismatches`/`new_project_signal`/`input`을 구간마다 남기고,
  `content_check: 'unverified'`는 `totals.content_unverified`로 센다.
- **답변 소비 최소 경계(S3-4)**: `attachment_derivation.mjs`의 tools config에 선택 필드
  `reconcile_receipts_path`(대조기 `--receipts`와 같은 평범한 파일시스템 경로, io 별칭 아님)를 더했다.
  주어지면 `voice_session_read.mjs`의 대화 목록 읽기가 그 세션을 마지막으로 언급한 대조 영수증에서 각
  구간의 최신 판정을 찾아 행에 얹고(`row.reconcile`), `estate_original_read.mjs`의 `renderVoice`가
  `판정: <분류> (<이유>) · 내용확인: 확인됨|미확인|불일치` 줄과 철회 후보의 `[철회]` 표시로 사람이 읽는
  표에도 낸다. 답 합성도 모델 호출도 없다 — 맥락이가 "이 카드는 예외·미확인"임을 인용 전에 보게 하는
  것까지다.

신선한 눈 검토 후 정정(같은 슬라이스, 병합 전), 필수 4건·should 7건·nit 2건:
- (R1) 카드에 날짜·금액이 아예 없으면 `content_check`가 `'confirmed'`였다(아무것도 안 봤는데 "확인했다"는
  거짓). 네 번째 값 `'nothing_to_check'`을 더하고 영수증 `totals.content_nothing_to_check`로 따로 센다.
- (R2) 날짜·금액 대조가 원문 부분일치였다(`M월 D일`/`YYYY-MM-DD`/"다음 주"만, 공백·쉼표만 정규화). 이제
  `(month, day)`/won 정수로 정규화해 `M/D`·`YYYY.M.D`·`M.D`·문맥 있는 `D일`까지 같은 값으로 비교한다(연도는
  뽑되 비교엔 안 씀). 파싱 못 하는 카드 토큰은 `'unverified'`(불일치 아님). "다음 주"류는 여전히 검사
  대상이 아님을 문서화만 한다. 한글 숫자("오천만 원")는 파싱하지 않는다 — 전사 창에 숫자로 쓴 금액이
  하나도 없으면 카드 금액은 `'unverified'`로 남는다(한글 숫자 파서는 만들지 않기로 결정).
- (R3) 전사 창이 `max_characters_per_call`(12000자)에서 잘리는데 `next_window`를 안 따라갔다.
  `MAX_TRANSCRIPT_WINDOW_CHARS`(200,000자)까지 페이지를 넘기고, 그래도 잘림이 남으면 `content_check`를
  강제로 `'unverified'`로 만들고 `totals.content_window_truncated`로 센다. 세션 하나의 전사는 이 회차 안에서
  세션당 한 번만 읽어(`readSessionTranscriptCached`) 구간마다 다시 열지 않는다(S11).
- (R4) 빈 문자열/공백만 있는 전사 텍스트는 `null`과 같이 `'unverified'`로 다룬다(빈 문자열과 실제 대조하지
  않음).
- (S5) `voice_session_read.mjs`의 `row.reconcile`이 `modality`·`input`도 옮긴다. `input.valid === false`면
  살아있는 판정 대신 `입력무효(<이유>)`를 낸다; 아니면 `판정: ... · 조건부/인용/부정/보류`를 붙인다.
- (S6) 원장 basis 텍스트와 영수증 필드가 `corroborated=true`/`corroboration_refs` 대신 `cues=<n>`/`cue_refs`로
  말한다 — v1은 대조를 승격에 안 쓰므로 "확인됐다"는 낱말이 남으면 안 됐다. refs 자체는 그대로 남는다.
- (S7) `mixed` 구간에서 표지가 `DEADLINE_PATTERN` 마감이나 맨 '약속'뿐이고 후보가 0개면 `needs_split` 대신
  `candidate`/`mixed_unsplit`로 낮춘다. 결정·금액·계약류 표지나 후보 2개 이상은 그대로 `needs_split`. 실제
  9/18 "휴식 및 이동 관련 잡담"(c004) 행을 다시 확인했다 — 매칭 표지는 '결정'(결정형, deadline/약속 아님)
  하나뿐이라 이 정정으로도 그대로 `needs_split`이다(바뀌지 않음, 확인함).
- (S8) `registeredProjectCodes`가 비어 있으면(대개 레지스트리를 못 불러온 것이지 과제가 0개인 게 아님)
  `new_project_candidate` 검사 자체를 끄고 영수증에 `new_project_check: 'disabled_no_registry'`와
  `totals.registered_project_codes_count`를 남긴다. 코드 추출 경계도 `mailCodesIn`과 같은 규칙(뒤에 식별자
  글자가 안 이어지면 됨, 공백 필수 아님)으로 넓혔다.
- (S9) `voice_session_read.mjs`의 영수증 읽기에 이 파일의 다른 모든 읽기와 같은 `MAX_RECONCILE_RECEIPT_BYTES`
  상한을 적용했다(선언만 되고 안 쓰이고 있었음).
- (N12) 대조 영수증의 `ran_at`을 판정 줄에 같이 낸다(`· <ran_at> 기준`).
- (N13) `estate_voice_card_reconcile.mjs` 머리말의 낡은 영수증 스키마 표기(v1)를 실제 값(v2)으로 고쳤다.

시험: `tests/voice_attribution_policy.test.mjs`(판정 규칙 전체 분기 + S3-3 CE-22/CE-30 반례 10여 개),
`tests/estate_voice_card_reconcile.test.mjs`(대조기 연결), `tests/voice_session_read.test.mjs`(S3-4 읽기
경로·렌더).

## 카드 대조 2단계 — 구간·판본·철회·backlog 결속 (0.22.4)

`VOICE_RECORDING_LIBRARY_V0.md` "2026-09-20 운영 방침"의 두 번째 조각. 판정 규칙(`voice_attribution_policy.mjs`)의
분기 순서는 이 조각에서 바꾸지 않았다(그건 3단계).

- **재생성 시 규정 밖 재사용 감지(S2-1)**: `harness/voice_conversation_list_nightly.mjs`의 `classifySession`이
  기존 검증 run을 스킵(`skipped_existing`)하기 전에 새 `staleReasonFor`로 그 run의 `run_manifest.json`이 기록한
  전사 run id·설정 sha256·프롬프트 다이제스트를 이번 세션의 선언값과 대조한다. 하나라도 다르면
  `run`/`existing_run_stale:<필드>`로 재실행 대상이 되고, 옛 run은 지우지 않는다. manifest를 못 읽으면
  `existing_run_stale:manifest_unreadable`. 모델 pin 자체는 비교하지 않는다(분류는 모델을 부르기 전에 끝난다는
  `classifySession`의 기존 설계를 그대로 따름).
- **재생성판 구간 정체성(S2-2)**: `harness/voice_route_cli.mjs`의 `import`(`mergeConversationList`)가 기존
  (미확정) ledger 행과 간격(`start_seconds`/`end_seconds`) **또는** `source_segment_ids` 둘 중 하나라도 다른
  segment_id 재사용을 거부한다(`sameScope`가 둘 다 비교하고, 하나라도 어긋나면 거부 — 둘 다 같아야만 "같은
  구간"이다). 거부는 `identity_changed`로 보고된다. 대조기는 이 목록을 받아 그 구간을
  `skipped_segment_identity_changed`로 건너뛰고 사람이 풀 때까지 기다린다 — 확정된 행은 이 경로로 자동으로
  대체되지 않는다("가장 단순하고 안전한 규칙": 새 슈퍼시드 필드를 schema에 더하지 않음). **사람이 푸는
  절차(자동 명령 없음, 의도적으로 추가하지 않았다)**: 그 구간이 새 run에서 실제로 어디를 가리키는지 확인한
  뒤 `voice_route_cli.mjs set --session <id> --segment <segment_id> --source-segments <새 발화 id들>
  --from <새 시작초> --to <새 끝초> --by <actor> --status candidate`로 같은 segment_id를 새 범위로 다시
  씌우거나(source_segment_ids와 간격을 함께 갱신해야 `identity_changed`가 다음 밤부터 그치는데, 그러면
  다음 `import`가 이 행을 같은 것으로 다시 인식한다), 또는 `remove --session <id> --segment <segment_id>
  --by <actor>`로 옛 행을 지우고 다음 `import`가 새 행으로 다시 들이게 한다. 어느 쪽도 자동화하지 않았다.
- **사라진 기계 후보 정리(S2-3)**: 대조기가 매 구간마다, 카드가 더는 나열하지 않는 기계 작성 후보
  (`basis`가 `reconcile:` 또는 `voice_conversation_list:`로 시작)를 기존 `dropProject` 경로로 회수한다
  (`retired_candidates`). 사람이 직접 쓴 후보는 카드가 빠뜨려도 절대 회수하지 않는다.
- **철회 = 즉시 차단(S2-4)**: ledger 구간에 부가 필드 `withdrawn: [{project_code, withdrawn_by, withdrawn_at}]`
  (bounded 16개, `voice_routes.mjs`가 검증하되 **없어도 유효** — 읽는 쪽에서 `[]`로 채워 넣는다, R1 참고)를
  더했다. `voice_route_cli withdraw`(이제 `--by` 필수)가 쓰고, 다른 과제로의 재확정(A→B 정정)도 A를 자동으로
  철회 기록한다. 세 소비처: (a) 대조기는 철회된 과제에 `set --project`를 쓰지 않고 `skipped_withdrawn_project`로
  남긴다; (b) `classifyAttribution`은 철회를 모른다 — 대조기가 호출 전에 철회된 과제의 카드 `strength:
  'strong'`을 weak로 낮춰서 넘긴다(체크 순서 변경 아님, 근거는 `src/runtime/voice_attribution_policy.mjs`
  머리말); (c) `voice_session_read.mjs`의 읽기 경로가 후보마다 `withdrawn: true/false`를 표시한다. 무엇이
  철회를 지우는지: 같은 과제를 다시 `confirm`하면 그 항목이 지워지고, **사람이 직접**(기계 basis가 아닌)
  `set --project`로 같은 과제를 다시 올려도 지워진다(그래야 대조기가 계속 막지 않는다) — 그러나 대조기 자신의
  `set`(basis가 `reconcile:`)은 지우지 않는다, 그러면 철회가 기계에 의해 스스로 풀리는 구멍이 된다. 16개
  상한을 넘는 추가 철회는 가장 오래된 것을 조용히 밀어내지 않고 **거부한다**
  (`voice_route_withdrawn_limit_reached`) — 밀어내면 그 항목이 막던 과제가 조용히 다시 열린다. grant·색인
  제거는 여전히 비동기(L2, 나중) — 이 조각은 ledger와 읽기 경로까지다.
- **backlog이 2단계에 닿기(S2-5)**: `estate_voice_card_reconcile.mjs`에 `--nightly-receipts <dir>`을 더했다.
  주면 이 대조기는 `--date` 하루치 대신, 그 디렉터리에 있는 모든 야간 lane 영수증
  (`soulforge.voice_conversation_list_nightly_receipt.v2`, 구 `.v1`도 하위호환으로 읽는다)이 `ran` 또는
  `skipped_existing`이면서
  `verified: true`로 보고한 세션 전체를 대상으로 삼는다. 각 세션의 메일/Linear ±1일 창은 그 세션 자신의
  날짜(receipt 행의 `date` 필드, R2 — 야간 lane이 03-04 사이 며칠 지난 backlog 세션을 함께 처리하므로 receipt
  자체의 `target_date`가 아니다)로 계산하고, 여러 날짜에 걸치면 그 합집합이다. `date`가 없는 옛 receipt 행은
  session_id의 `YYYYMMDD_` 접두부에서 날짜를 끌어온다(`plan.date_derivation`에 어느 쪽으로 몇 건 골랐는지
  남는다). 자기 자신의 과거 영수증에서 이미 끝낸 `(session_id, run_id)` 쌍은 다시 하지 않고
  (`already_reconciled_run`으로 건너뜀) — 읽기는 이 harness가 매 회차 갱신하는 압축 색인
  `reconciled_runs.index.json`(최신 5000쌍만 유지, 넘치면 오래된 것부터 제거하고 누적 제거 수를 기록)로
  하고, 색인이 없으면 (첫 회차거나 못 읽으면) 한 번 영수증 전체를 훑어 만든다 — 세션이 재전사되어 run_id가
  바뀌면 다시 대조한다. 정산되지 못한 채 남은 야간 lane 행(전사 없음·짧음·실패·미검증)은 영수증의
  `not_considered`에 이유와 함께 남는다(다른 receipt에서 그 세션이 정산됐으면 빠진다). `--date`는 그대로
  수동/기본 모드로 남는다.

시험: `tests/voice_conversation_list_nightly.test.mjs`(S2-1·R2), `tests/voice_grant.test.mjs`(S2-2/S2-4/N8,
`voice_route_cli`/`voice_routes` 쪽), `tests/estate_voice_card_reconcile.test.mjs`(S2-2~S2-5·R1·R2·S3·S4·N7
통합), `tests/voice_session_read.test.mjs`(S2-4 읽기 경로).

## 카드 대조(2단계 첫 조각) (0.22.3)

`VOICE_RECORDING_LIBRARY_V0.md`의 "2026-09-20 운영 방침"이 정한 방식 1(기본은 해 놓기)·2(예외만 모아 묻기)의 첫
조각이다. 세 조각으로 나뉜다.

- 규칙: `src/runtime/voice_attribution_policy.mjs`. 모델도 I/O도 없는 순수 함수뿐이고, 카드 구간(`nature`,
  `title`/`description`, `project_candidates`)과 caller가 이미 계산한 corroboration 결과만 받아
  `provisional`/`candidate`/`exception`/`skip` 중 하나로 분류한다. `RISK_MARKERS`·`MIN_CORROBORATION`이
  임계값이고, `distinctiveTerms`/`projectAliasTerms`/`mailCorroborates`/`linearCorroborates`가 "뒷받침됐다"의
  정의다. 판정 규칙을 바꿀 때는 이 파일과 위 문서 절만 바뀐다(DOCUMENT_OWNERSHIP의 "교체 알고리즘" 소유 범위).
- 대조: `harness/estate_voice_card_reconcile.mjs`. 하루치(대상 날짜) verified 카드마다 당일±1일 메일·Linear
  자료를 직접 읽어(수집 admission grant가 아니라 `harness/estate_inventory.mjs`와 같은 alias-address 방식으로,
  `--mail-root`는 반복 가능, `--linear-root` 기본값은 `data_root/ingress/linear`) 위 규칙을 적용한다.
  mail 이벤트는 `subject`/`from`/`received_at`만 읽고 `body_text`는 어떤 출력에도 옮기지 않는다.
- 기록: 이 harness는 ledger를 직접 쓰지 않고 `harness/voice_route_cli.mjs`의 `import`/`set` 명령을 그대로 부른다.
  `skip`이 아닌 모든 구간은 ledger에 `candidate` 상태로 남는다(카드가 이미 `unclassified`였어도). 이미 사람이
  `confirmed`로 확정한 구간은 읽기만 하고 절대 건드리지 않는다. `provisional`/`exception` 구분은 ledger schema에
  필드를 더하지 않고 `basis` 자유텍스트와 영수증에만 남는다 — 스키마를 더 넓히는 판단은 이 슬라이스의 범위 밖이다.
  `--receipts`에 회차마다 `soulforge.voice_card_reconcile_receipt.v1` 하나를 쓰며, `exception` 구간은
  `exception_review` 배열(아침 브리핑 "어제 애매한 것 N건"의 입력 후보)에 모인다. `--dry`는 계산과 로그만 하고
  잠금·영수증·ledger 어디에도 쓰지 않는다.

확정(`confirmed`)은 여전히 사람의 말이며 `voice_route_cli.mjs confirm`으로만 만들어진다 — 이 대조는 후보를
늘릴 뿐 아무것도 확정하지 않는다. 아침 브리핑에 `exception_review`를 잇는 것, DM 정정 한 줄을
`voice_route_cli confirm`으로 반영하는 고리, `ai_provisional_project_route` 상태 자체의 activation은 계획이며 이
슬라이스에 없다. 예약작업 등록도 없다.

시험: `tests/voice_attribution_policy.test.mjs`(규칙의 모든 분기), `tests/estate_voice_card_reconcile.test.mjs`
(합성 estate, 실제 상태 root나 모델 호출 없음).

## Slack 처리 범위의 단일·실제 상태 표시 (0.22.2)

맥락 꾸러미의 Slack coverage는 실제 준비 기록과 검색·본문 사용 수에서 한 행으로
작성한다. 준비 실패는 실패 수로, 범위에 자료가 없으면 `none_in_scope`로 표시한다.
Slack을 미연결 종류로 다시 추가해 중복된 0건 행을 만들지 않는다. 아직 어댑터가
없는 Buzz는 `not_connected`로 유지한다. 이 표시는 출처 전체의 완전성·최신성을
증명하지 않으며 수집·판본·실제 호출의 검증은 별개다.

## 문서 준비 경로 일치와 원문 위치 반환 (0.22.1)

문서 도구 설정은 host binding의 `document_tools`에만 둔다. 준비 flow, 동기화의
선행 준비, 색인 갱신과 원문 재읽기가 같은 설정을 사용하며, 허용하지 않은 형식
키나 잘못된 도구 값은 파서를 실행하기 전에 거부한다. 도구를 선언하지 않은 기존
binding은 유지되지만 PDF/DOCX에는 해당 형식의 명시 설정이 필요하다.

원문 읽기는 각 단위의 `locator`를 반환한다. PDF는 실제 페이지·문단·표/셀 위치,
DOCX는 XML part·블록·문단·표/행/열이며 DOCX 렌더링 페이지 번호는 만들지 않는다.
도구 미설정으로 재읽지 못한 경우는 `tool_configuration_missing`으로 구분하고
저장된 단위를 제공하면 `units_from: generation_document`로 표시한다. 그 밖의 재읽기
실패는 상세 오류와 함께 `reread_unavailable`로 알린다. `revision_mismatch`는 실제로
새로 읽은 결과의 판본이 다를 때만 사용한다. 비교를 못 한 상태를 변경 확인으로 읽지 않는다.

이 연결은 일반 문서 자동 발견, 독립 내용 충실도, 실제 업무 A/B/C 또는 운영 배포의
완료를 뜻하지 않는다. 파서 시험은 명시한 Python 환경에서 실행해야 하며 로컬 실행
로그와 CI의 실행·skip 여부를 구분한다.

실제 파서의 로컬 실행 로그·도구 판본·검증 한계는
[PR18 검증 기록](docs/evidence/DOCUMENT_PREPARATION_PR18.md)에 남긴다.

## 제한형 DOCX 본문·표 준비 (0.22.0)

`documentTools.docx`는 기존 PDF 설정과 나란히 놓이는 별도 host 도구 설정이다.
`interpreterPath`, `extractionProfile: 'python-docx-structure-v1'`,
`disableSiteStartup`으로 고정 worker를 호출한다. grant와 원문은 실행 파일을
선택하지 않으며 원본 bytes만 stdin으로 전달한다. DOCX도 준비·비활성 저장·검색
준비에서 같은 source-document 계약을 사용한다.

이 profile은 **본문 문단과 단순 직사각형 표의 텍스트**만 처리한다. XML 블록과
표·행·열 위치를 보존하며 렌더링하지 않았으므로 페이지 번호를 만들지 않는다.
ZIP의 멤버·크기·실제 압축 해제량·CRC와 XML·관계·본문 구조를 먼저 검사한다.
인식하지 못하는 내용 wrapper, 추적 변경, 수식·그림·필드·외부 관계, 숨김·목록
스타일, 병합·중첩 표 등은 명시적으로 거부한다. 일부만 읽고 완전한 문서로 내지 않는다.
worker·parser 판본과 추출 결과는 문서 신원에 포함되며 실행 전후 worker 변경을 거부한다.

`SOULFORGE_TEST_DOCX_PYTHON`에 `python-docx`가 설치된 해석기를 명시하고
`npm run validate:context-docx-preparation`으로 공개 합성 문서를 검증한다.
독립 문서 원문 내용 검사는 여전히 `not_run`이다. 이 변경은 모든 Word 형식, `.doc`,
HWPX, OCR, Office 표시 충실도, 일반 문서 자동 편입 또는 운영 배포를 보장하지 않는다.
뒤의 0.21.0·기존 설명은 해당 시점 이력이며 이 절이 제한형 DOCX 연결을 보완한다.

## 명시적으로 연결한 PDF 문서 준비 (0.21.0)

일반 문서 어댑터는 기존 TXT/Markdown 경로를 유지하고, 신뢰된 host 설정의
`documentTools.pdf`가 있을 때만 고정 `pdfplumber-tables-v1` 추출기를 호출한다.
설정은 `prepareSourceDocuments`의 별도 인자이며 grant·자료 본문·요청이 실행 경로를
선택하지 않는다. 저장 준비 하니스와 그래프 색인 갱신은 해시로 고정한 binding의
`document_tools`에서 같은 설정을 전달한다. 기존 설정에는 새 실행이 생기지 않는다.
검색한 항목의 원문을 되읽는 reader도 같은 고정 binding에서 도구 설정을 받아
PDF/DOCX가 색인에는 있지만 원문 재읽기는 미연결인 상태를 만들지 않는다.
원문 읽기 응답과 조사 영수증의 `parser_calls`는 기존 첨부 파생 계수이며,
`parser_calls_scope: attachment_derivation_only`로 범위를 명시한다. 원본 문서
재추출을 포함한 총 parser 호출 수로 해석하지 않는다.

```js
documentTools: {
  pdf: {
    interpreterPath: '<approved-absolute-python-path>',
    extractionProfile: 'pdfplumber-tables-v1',
    disableSiteStartup: true // Windows; false on other platforms
  }
}
```

원본 bytes는 경로·크기·읽기 전후 동일성을 검사한 reader로 읽고 exact grant hash를
대조한다. 문단과 표 셀은 원본 상대 위치, 페이지·문단 또는 표·행·열·좌표를 보존한다.
고정 Python worker와 추출 profile/version은 파생 문서의 판본에 결속하며 준비 실행
기록의 code closure에도 worker를 포함한다. 원본·운영 설정·수락 기록은 쓰지 않는다.

실제 parser를 사용하는 공개 합성 PDF로 준비→비활성 저장→되읽기→무결성 검증,
준비→canned graph worker→어휘 검색→재실행 경로를 검사한다. 후자는 실제 모델·Neo4j
품질 시험이 아니며 문서의 독립 원문 내용 검사는 여전히 `not_run`으로 남긴다.
`SOULFORGE_TEST_PDF_PYTHON`을 명시하고 `npm run validate:context-document-preparation`을
실행한다. 해석기가 없으면 실제 PDF 시험은 SKIP이며 완료 근거가 아니다.

미연결·읽기 실패·내용 상한 초과를 성공한 준비로 바꾸지 않는다. OCR, DOCX/HWPX,
일반 문서 자동 발견, 운영 배포·활성화, 실제 업무 A/B/C 평가는 이 변경의 완료 범위가
아니다. 다음 기존 버전별 설명은 구현 이력이며 이 절이 PDF 연결 부분을 보완한다.

프로젝트의 승인된 입력·수락 기록을 검사하고, 허용된 근거·기억·충돌·부족을
한정된 Context Pack으로 반환하는 APP이다. 독립 APP home은 Owner 계획 v0.7
§19.18의 고정 구조를 따른다. 운영 서비스나 새로운 수락 권한을 만들지 않는다.

현재 범위는 T0–T5 구현 집중, 명시적 전체 입력 snapshot의
새 파생 세대 생성과 고정된 code/data 선택이다. 후보 브랜치에서 승인된 공개 합성 범위의
독립 설치·두 전략 전환·구판 복구와 하니스 재평가를 독립 검토했다(설치 영수증은 private).
일반 자동 의미 축적·실자료·운영·전략 품질 채택은 별도이며 현재 HOLD다.

## main 통합 상태 (2026-09-12)

운영 미리보기의 연결 탐색에는 `inspectGraphSubgraph` / `inspect_subgraph` 읽기 경로를
사용한다. 호출자가 고른 과제·현재 DB 처리 버전을 대조한 뒤 최대 80개 노드·160개 관계의
식별자·이름·종류·문서 참조만 반환한다. 원문·임베딩 배열·임의 속성·Cypher는 받거나
반환하지 않으며 모델 호출과 쓰기가 없다. 고정 쿼리는 read routing과 쿼리당 5초 한도를
사용하고 전후 처리 버전이 달라지면 결과를 거부한다. 관계의 양끝을 현재 과제·버전으로
한정하므로 버전 속성이 없던 기존 관계도 조회하며, 명시적으로 다른 범위인 관계는 제외한다.
그래프 표본은 질문이 실제로 따라간 검색 경로나 전체 DB 검사 결과가 아니다.

- 들어온 것: `src`·`algorithms`·`profiles`·`release`·`harness`·`tests`와 T0–T5 증거
  ([docs/evidence](docs/evidence/)). 합성 시험 184건 중 146 PASS·3 SKIP(0.5.0 기준)이다. T5 35건은
  `SOULFORGE_TEST_PDF_PYTHON`(pdfplumber pin 해석기)이 없어 fixture 준비에서 멈추므로 **main에서는 아직 실행되지
  않았다(NOT_RUN)**. 통과 여부는 해석기를 준비해 실제로 돌린 뒤에만 말할 수 있다.
- 검증 명령: `npm run validate:context-engine`(T5 밖 시험 + `verify_module`), `npm run validate:context-engine-t5`
  (`SOULFORGE_TEST_PDF_PYTHON` 필요). 둘 다 아직 `done:check`·CI에 연결하지 않았다. CI가 도는 Linux에서의 실행을
  확인한 뒤 연결한다.
- 보류한 것: dev-ERP caller 연결(`accepted_context_*` shim, `server.mjs`·`work_intake_context.mjs`
  import 교체, 행보관 `--accepted-context` 분기). dev-ERP 파일은 HPP 팩 명세의 import 폐포에
  들어가므로 연결하면 이 APP runtime 전체가 운영 팩에 실린다. release gate 전에는 싣지 않으며,
  dev-ERP는 기존 사본을 유지한다. 이전 T3–T5 시험은 같은 요청을 이 APP CLI로 실행한다.
- `observed_context_query`(0.3.2/0.3.3)는 KVDS 관찰 사례 전용 adapter다. gap 코드가 고정된
  단어 포함 점수기라 일반 맥락 경로로 쓰지 않는다. 대체 전까지 격리 상태로 둔다.
- 도구 분담(2026-09-12): D41(`PROJECT_REQUIREMENT_TRACE_MODEL_V0.md` §8.2)이 Neo4j Community와
  Neo4j GraphRAG(벡터·키워드 결합 검색 포함)를 맥락 검색에 채택했다. 색인은 과제별로 분리한 제안층이며,
  색인 안의 같은 대상 합치기는 허용하지만 정본 ID는 자동으로 합치지 않는다. 같은 날 Owner는 제작 채팅에서
  "도구로 되는 기능은 중복이니 개발하지 말고 도구를 쓰라"고 지시했다. 그래서 그래프 저장·대상/관계 추출·색인 안
  합치기·벡터/키워드/그래프 확장 검색은 따로 만들지 않고 연결한다(아직 미연결). 현재 `bm25_v1`과 typed relations
  1-hop을 비교 기준판 A로만 두는 것은 이 제작 트랙의 판단이다. 과제 격리·권한·판본·시점·원문 대조·예산은 이
  APP의 고정 계약으로 남는다.

| 경계 | 소유 |
| --- | --- |
| `src/app.mjs` | 공개 호출·CLI 진입점 |
| `src/runtime`, `src/guards`, `src/adapters` | 요청 조립·공통 권한/현재성/상한 검사·외부 reader 연결 |
| `algorithms/preparation` | 승인 pin을 받는 공유 PDF parser 호출. 자동 의미 생성 아님 |
| `algorithms/representation`, `retrieval`, `memory`, `assembly` | 검사된 입력의 투영·검색·선택·조립 방법 |
| `profiles` | 고정 기본 조합. source/ACL/상한을 override하지 않음 |
| `harness`, `tests` | 개발 실험·합성 준비·회귀. 설치 runtime에 포함하지 않음 |
| `docs`, `release` | 호출/소유 경계와 기존 source-lane builder를 위한 명시 closure·검사 |

최초 구현 집중 이력은 [첫 APP slice](docs/APP_FIRST_SLICE.md), 현재 생성·전환 계약은
[세대 전환](docs/GENERATION_TRANSITION.md), 설치 방법과
증명 범위는 [release 안내](release/README.md)를 따른다.
프로젝트 데이터·state/output/cache·gold·credentials는 APP 설치 경로 밖에 둔다.

0.3.2의 `createObservedContextQuery`는 Owner가 해당 작업에 허용한 실제 자료
읽기·후보 판단을 위한 별도 read-only API다. task authority/corpus pin,
exact actor/project/purpose와 fresh authority를 검사한다. 결과는 출처가
결속된 observed/review_pending 상황·결정후보·약속후보·기존업무와 gap이며
accepted generation은 null이다. 기존 수락 query/생성/선택 guard나
syntheticOnly 계약을 완화하지 않는다. 자료의 문장이 실행 지시나 수락
권한이 되지 않으며 후보 판단을 실제 업무 생성·canon 수락으로 승격하지 않는다.

0.3.3은 digest를 포함한 최종 관찰 응답의 12,000자 상한과 실제 source
read의 maxBytes+1 sentinel 상한을 강제한다. 커지는 원본을 전부 읽은 뒤
거부하지 않으며 기존 관찰 Pack의 의미·수락 상태는 변경하지 않는다.

`createExactSourceReadback`은 기존 accepted reader의 `readSourceRevision`
provider에 연결하는 명시적 로컬 파일 reader다. Caller가 exact binding·원본
root/path·data class와 매번 새로 검사하는 권한 판정을 제공해야 한다. 읽기
전후 권한 판본, 파일 identity와 byte hash를 확인하며 root 밖 경로·링크·
초과 크기·판본 변경을 거부한다. 자료 탐색, 원본 변경, 수락, 모델 호출이나
새 Context store를 만들지 않는다. 기존 generation/수락 receipt/ACL 검사는
그대로 남으며 실제 actor·source grant가 없으면 실제 연결 완료가 아니다.

## 승인 구간 안의 인용 검증기 (0.22.5)

`src/app.mjs`의 `createCitationVerifier({ approvedSpans })`는 호출자가 승인해 공급한
원문 구간 **안에** 인용문이 포함되는지 메모리 안에서 대조한다. 새 저장소나 정본을
만들지 않으며 기존 query/수락 경로에 자동 삽입되지 않는다.

- `approvedSpans`: `{ binding, text, span_sha256 }` 배열(최대 100개).
  `binding`은 기존 accepted reader/readback의 `source_revision_ref`, `source_span_ref`,
  `locator` 세 필드를 옮긴다. source ref는 기존 Rune exact-ref 계약의
  `entity_id`, `revision_id`, `content_id`, `content_hash_alg` 네 필드만 받는다.
  `content_id`는 원본 전체 bytes의 해시이며 `span_sha256`는 공급된 `text`의 UTF-8
  SHA-256(`sha256:<64 lowercase hex>`)이다. 부분 구간만으로 전체 원본 해시를
  재검증했다고 주장하지 않는다. 원본 판본/ACL/과제/시점 확인과 locator에 맞는 구간
  선택은 호출자 책임이다. 기존 `createExactSourceReadback` 검사를 마친 호출자가 연결할 수 있다.
- `verify({ binding, quote })`는 먼저 글자 그대로의 포함을 찾고, 없을 때만 양쪽의
  **NFC + Unicode White_Space** 정규화 후 포함을 찾는다. Unicode 속성 `White_Space`의
  연속(전각 공백·NBSP·CR/LF·탭 포함)을 ASCII 공백 하나로 바꾸고 양끝 공백을 제거한다.
  ZWSP/BOM은 이 속성에 포함되지 않는다. NFKC·대소문자·숫자/단위 변환·문장부호/따옴표
  제거·근사 일치는 없다. 원문·인용문은 수정하지 않고 비교용 사본만 정규화한다.
- 최소 인용 길이는 NFC 처리 후 Unicode 공백을 제외한 **코드 포인트 8개**다.
  그보다 짧으면 `mismatch / quote_too_short`다. 문자열 상한은 20,000 UTF-16 code unit.
- `status`: `exact_match` / `normalized_match` / `mismatch` / `source_missing`.
  `reason`은 판본/해시 불일치와 중복 binding 등을 구분한다. 허용 목록에 없는
  출처/구간/위치는 `source_missing`이다(실제 존재 여부 판정 아님).
  잘못된 입력·빈 인용·폐기된 matcher/normalization 옵션은 `TypeError`로 거부한다.
- 성공 결과의 `start`, `end`는 **공급된 원문 구간**에 대한 0-based UTF-16 인덱스
  `[start, end)`다. `offset_unit: 'utf16_code_unit'`, `end_exclusive: true`를 명시한다.
  정규화 후 일치도 원래 구간의 위치를 반환한다. `count`는 성공한 단계의 출현 횟수이며
  겹치는 출현도 센다. 정확 일치가 있으면 정규화 단계의 변형 출현은 합산하지 않는다.
  여러 번이면 원문의 첫 위치를 반환한다. 실패는 `start/end: null, count: 0`이다.
  NFC 합성/재정렬/일대다 분해의 위치는 일치에 기여한 원문 문자를 모두 포함하는 최소
  구간이다. 원문의 한 문자가 여러 정규화 문자로 분해되면 그 원문 문자를 쪼개지 않으므로
  반환한 구간을 정규화한 문자열에는 일치 경계 밖의 결합문자가 함께 포함될 수 있다.
- 출력은 요청 binding, 원래 인용/구간 해시, 적용 정규화와 위치를 보존한다. 본문이나
  수정 제안은 반환하지 않는다. `semantic_fact_verified`와 `knowledge_accepted`는
  항상 false다. 문자열 포함은 의미적 사실 검증이나 사람 수락이 아니다.
- 별도 비교 엔진 교체 자리는 제거했다. 비교는 모듈 내부 함수이며 외부 엔진/자료형
  의존성이 없다. 승인 목록은 생성 시 snapshot이므로 권한/판본이 바뀌면 새로 생성한다.
  원문 읽기·저장·외부 검색·자동 수정·위키·기억 관리·사람/조직 노드는 제공하지 않는다.

공개 참고: [GBrain d13aa742의 synthesize-verify.ts](https://github.com/garrytan/gbrain/blob/d13aa742fd68b71bfd6c98be3dda5813791f1d6c/src/core/cycle/synthesize-verify.ts).
정확/정규화 대조의 단계 구분을 참고한 독립 구현이다. GBrain의 case/punctuation folding,
near-match, 자동 치환, 따옴표 제거, 페이지 writer와 `BrainEngine` 타입은 도입하지 않았다.
GBrain 패키지 실행이나 호환성 검증을 했다는 의미는 아니다.

시험: `node --test guild_hall/context_engine/tests/citation_verifier.test.mjs`.
공개 합성 자료로 위치·반복·겹침·Unicode 공백·NFC·최소 길이·변조/범위 거부를 확인한다.


## 대화 목록 야간 lane (2026-09-20)

`harness/voice_conversation_list_nightly.mjs`는 `voice_conversation_list_cli.mjs`의 `run` 명령이 한 세션에 하는 일
(`runConversationList`)을 하룻밤치 세션에 대해 순서대로 돌린다. 로컬 모델 하나가 뒤에 있으므로 절대 동시에 두 세션을
돌리지 않는다.

- 계획: 대상 날짜(기본은 Asia/Seoul 기준 어제)의 세션 전부, 그리고 뒤이어 `BACKLOG_WINDOW_DAYS`(7일) 안에서 아직
  끝내지 못한 세션을 날짜가 오래된 쪽부터. 세션 판별은 `data_root/ingress/plaud/sessions/<날짜>/<세션>/`의
  `session_manifest.json`만 읽는다 — 전사나 그래프 색인을 열지 않는다.
- 건너뛰기: `independent_transcription.status`가 `completed`가 아니면 `transcript_absent`, `duration_seconds`가
  30초 미만이면 `duration_below_30s`(둘 다 `skipped_short`). 이미 검증된(`verified: true`) run이 있으면
  `skipped_existing` — 판별은 `voice_conversation_list_cli.mjs`의 `show`가 읽는 것과 같은 `readRun`(최신
  `generated_at`)이다. 검증 전 run만 있으면 다시 돈다.
- 잠금: `--receipts` 아래 `nightly.lock`(확장자 없음) 하나가 같은 밤 두 회차가 겹치는 것을 막는다. stale
  문턱은 고정 3시간이 아니라 `staleLockMsFor`가 그 밤의 구성에서 유도한다 — `--deadline`이 없으면
  `STALE_LOCK_MS`(기본 3시간, `--chain-reconcile`이면 `CHAIN_ALLOWANCE_MS` 추가), 있으면 예약된 시작→마감
  스팬 + hard-stop grace(+ 연쇄면 `CHAIN_ALLOWANCE_MS`)를 최저 `MIN_DEADLINE_STALE_LOCK_MS`(8시간)로 내림
  제한한 값이다(S5-1). 넘은 잠금은 버려진 것으로 보고 이전 값을 receipt에 남긴 뒤 회수하되, 그 회수는 디스크의
  pid·started_at이 이 회차가 실제로 쥔 값과 같을 때만 지운다(`releaseLock`). 잠금을 잡지 못하면 아무 것도
  부르지 않고 종료코드 3이다.
- 영수증: 밤마다 receipts에 `soulforge.voice_conversation_list_nightly_receipt.v2`(구 `.v1`도 읽기 쪽에서
  하위호환) 파일 하나. 세션마다 id·제목·길이·`outcome`(`ran`·`skipped_existing`·`skipped_short`·`failed`)·
  이유·모델 호출 수·걸린 초를 담는다. 실패가 하나라도 있으면 종료코드 2, 전부 끝나면 0. 쓰기는 임시 파일 +
  rename이 기본이며, rename이 재시도 끝에도 막히면 대상에 직접 덮어쓰기로, 그마저 막히면(예: 읽는 쪽이 대상을
  쥐고 있어 둘 다 거부) 형제 경로 `<파일명>.recovered.json`에 마지막으로 써서 그 밤의 기록 자체는 남긴다 —
  이 경우 원래 경로는 갱신되지 않으므로 `chain` 등 그 receipt를 참조하는 상태는 다음 판단 전까지 낡아 있을 수
  있다(좁힌 주장, S2 round 3). 대조기(`estate_voice_card_reconcile.mjs`)의 `--nightly-receipts` 글롭은
  `.recovered.json`도 `.json`로 그대로 집어 읽는다(무시하지 않고 명시적으로 처리) — 스키마·모양이 원본과
  같기 때문이다.
- `--dry`는 계획과 판별만 보여주고 모델을 부르지 않으며 잠금·영수증·`derived_root` 어디에도 쓰지 않는다. 등록기의
  preflight가 이 모드다.
- 등록: `ops/register-voice-conversation-list-task.ps1` (+ 숨은 실행기 `ops/run-voice-conversation-list-hidden.vbs`)이
  `SoulforgeGraphSync` 등록기와 같은 모양으로 `SoulforgeVoiceConversationList`를 매일 03:00 로컬, 숨김,
  `--max-sessions 40`으로 등록한다. lane manifest·Node·root table·tools config·pipeline config 다섯 다 digest
  대조 후에만 `--dry` preflight를 돌리고, `-Register`는 그 preflight의 plan digest를 그대로 돌려받아야 진행하며
  등록 뒤 내보낸 XML을 계획과 다시 대조해 다르면 이전 정의로 되돌린다. 이 스크립트는 절대 task를 시작하지 않는다.
- 소비: `estate_original_read.mjs --voice-session <세션> --conversation-list`가 이 lane이 만든
  `<derived_root>/voice/<세션>/<run>/conversation_list.v0.json`을 읽는다(hermes-skill `SKILL.md` §7-a). 이 야간
  lane은 그 파일을 채우는 쪽이고, 읽는 쪽 계약은 바꾸지 않는다.
- 시험: `tests/voice_conversation_list_nightly.test.mjs`. 모든 "run" 경로는 `runSession`을 주입해 실제 모델을
  부르지 않는다.

### PLAUD 전사 우선 (2026-09-26 Owner 결정)

- pipeline config의 선택 필드 `transcript_source`(`"whisper"` | `"plaud"`). 필드가 없으면 `whisper`로 읽고
  카드에 새 필드를 쓰지 않으므로, 기존 config로 만든 run id와 카드 바이트는 그대로다(실측: 라이브 config로 검증된
  run 557개 전부 이 판 코드로 같은 run id 재계산).
- `plaud`: 세션 루트의 PLAUD 전사(`transcript.jsonl`, 화자·시각 구간)를 1차 입력으로 읽고, 규칙 단위는
  `guild_hall/voice_capture/semantic_labeling.mjs`의 `buildVoiceSemanticLabelRun`으로 메모리에서 만든다
  (custody에 쓰지 않음, provider evidence role로 표시). 로컬 whisper 전사는 `run_manifest.json`의
  `transcript.secondary`로 남는다. PLAUD 전사가 없거나 형식이 맞지 않으면 whisper 입력으로 되돌아가고
  `transcript.fallback`에 이유를 적는다. 경계 단계 요청에만 화자 표시가 붙는다.
- 기존 카드 보호: 밤은 **다른 전사로 만든 검증된 카드**를 `skipped_existing`(`verified_other_source`)로 두고
  다시 만들지 않는다. 선언이 없는 밤은 `whisper`로 보므로 검증된 PLAUD 카드도 건드리지 않으며, whisper 카드의
  판별은 예전과 같다. 예외: `plaud` 밤에 whisper로 대체되었던 카드는 PLAUD 전사가 생기면 다시 만든다
  (`existing_run_stale:plaud_available`).
- PLAUD 카드의 낡음은 PLAUD 전사 바이트 지문으로 본다(`existing_run_stale:transcript_sha256`). `plaud` 밤은
  완료된 whisper run이 없어도 쓸 수 있는 PLAUD 전사가 있으면 후보로 삼고 행에 `whisper_secondary: "absent"`를 적는다.
- `--sessions-file <csv|txt>`: 날짜 창 대신 파일에 적힌 세션만(첫 열, 따옴표·머리행 허용) 순서대로 처리한다.
  노화(backlog) 보고는 계산하지 않는다.
- lane: `plaud` 모드는 `voice_capture` 모듈과 `ajv`를 동적으로 불러온다. context-read-v6 이하 설치본에는
  없어서 `voice_plaud_semantic_labeler_unavailable`로 멈추고, context-read-v7 spec이 이 폐포를 싣는다
  (설치·등록은 별도 Owner 작업).
- 이력: 원천 준비는 PLAUD 카드의 세션 루트 전사를 읽고, 이력 근거 줄에 `PLAUD 전사`·`자체 전사`·
  `자체 전사(PLAUD 없음)`를 표시 전용으로 적는다([KNOWLEDGE_LAYER.md](KNOWLEDGE_LAYER.md) `이력 CLI`).
- 시험: `tests/voice_conversation_list_plaud_source.test.mjs`(고정 whisper run id·plaud run id·대체·
  sessions-file·다른 전사 카드 보호).

## 메일의 과제를 누가 정하는가 (`harness/mail_routes.mjs`, lane graph-sync-v3, 2026-09-22)

메일은 사서함으로 오지 과제로 오지 않는다. 제목에 과제코드가 있는 메일은 여러 신호 중
하나일 뿐이고, 이 estate에는 코드를 전혀 달지 않은 채 분명히 어딘가에 속하는 메일이
수천 통 있다 — 2026-09-21 회차 기준 4,145통을 훑어 4,102통이 "어느 과제도 아님"으로
남았다. 정하는 쪽은 `guild_hall/workspace_ledgers`다: Owner가 저장한 과제별 제목규칙,
묶음_확정표, 판독_결정표, 거래처_대응표. 그 모듈이 판단을 **색인 파일 하나**로 내보내고
이쪽은 그것을 주소로 읽는다.

음성이 이미 같은 모양이다. 녹음이 받은함에 있다는 사실은 아무것도 귀속하지 않고, 사람이
확정한 구간만 귀속하며, `voice_routes.mjs`는 그것을 세션 폴더가 아니라 경로 원장에서
읽는다. 메일도 이제 메일 본문이 아니라 이 색인에서 자기 과제를 읽는다. 한 질문, 한
주인, 한 답 — 그리고 답이 데이터로 오기 때문에 이쪽은 그것을 만든 분류기를 import 하지도,
다시 구현하지도 않는다(모듈 간 import 없음, 순환 없음).

- 주소: `control_root/mail-routes/mail_attribution_index.json`
  (`MAIL_ATTRIBUTION_INDEX_ADDRESS`), 스키마 `soulforge.mail_attribution_index.v1`
  (N4: 읽는 쪽이 `content_sha256`과 `inputs.org_config_sha256`을 **요구**하므로 v0에서
  올렸다. v0 산출물은 아직 어디에도 없다 — 실평면 실행은 `--dry`뿐이었다).
- 결정점은 하나다: `estate_inventory.mjs`의 `grantCandidates` mail 갈래.
  `mailAttribution`이 주어지면 원장이 정하고, 없으면 예전의 좁은 규칙(과제코드가 본문·
  제목에 단독 토큰으로 나오는가)이 그대로 남는다. 둘은 절대 섞이지 않으며, 영수증은 항상
  어느 규칙이 돌았는지 말한다(`scope.mail_attribution`이 `null`이면 좁은 규칙).
- 읽지 못하면 멈춘다. `main()`이 색인을 **회차 시작 전에 한 번** 읽고, 없거나 깨졌거나
  digest가 다르면 어느 과제도 시작하지 않는다. 좁은 규칙으로 되돌아가는 조용한 fallback은
  없다 — 그랬다면 원장이 붙인 메일이 전부, 아무도 내리지 않은 결정으로 색인을 떠난다.
- **낡은 색인도 거부한다**(R3, 2026-09-22 검토). 깨끗하게 parse 되는 파일이 최신 판단이라는
  뜻은 아니다. 빌더가 아직 어떤 자동화 사슬에도 없으므로, 나이 상한이 없으면 어느 아침의
  판단을 무한히 다시 적용하면서 그 뒤 수집된 메일은 전부 미귀속으로 읽히고 영수증은
  `SYNCED`라고 적는다. `--mail-attribution-max-age <시간>`(기본 36 = 하루치 빌드 + 한 번
  놓친 분)을 넘으면 `mail_attribution_index_stale`로 닫는다. 시계 오차를 넘어 미래로 찍힌
  파일은 영원히 만료되지 않으므로 `..._built_in_future`로 따로 거부한다.
- 입력 검사 두 가지는 **각각 다른 것을 묶는다**(S4). 정확히 적으면:
  - `--mail-attribution-org-config <주소>`: 그 org config **파일 하나**를 매 회차 다시
    해시해 색인의 `inputs.org_config_sha256`과 대조한다(`..._org_config_changed`).
    org config는 표가 **어디 있는지**만 말하므로, 이것만으로는 표 내용이 묶이지 않는다.
  - `--mail-attribution-owner-tables <폴더 주소>`: 색인이 `inputs.owner_tables`에 적은
    표 하나하나를 그 폴더 안에서 **basename으로 찾아 다시 해시**해 대조한다
    (`..._owner_tables_changed` / 폴더·파일이 없으면 `..._owner_tables_unavailable`).
    **판단이 들어 있는 곳은 표다.** 이 인자가 없으면 색인이 어디에도 없는 판독표 digest를
    적고 있어도 그대로 수락되며, Owner의 라우팅 판단은 max-age 말고는 아무것도 묶지 않는다.
  - 둘 중 하나가 다른 하나를 대신하지 못한다(Owner는 둘을 따로 고친다). 둘 다 없으면 양쪽의
    신선도는 오직 max-age로만 제한된다.
  등록기에서 두 인자를 함께 주는 것을 권장한다.
- 고정(`--mail-attribution-sha256`)은 파일 digest와 색인의 `content_sha256`(= `built_at`을
  뺀 본문 digest) 둘 다 받는다. 색인은 메일이 들어올 때마다 다시 만들어지므로 **등록 시점의
  파일 digest를 기본으로 박으면 다음 빌드부터 매일 fail-closed가 된다** — 그래서 등록기는
  이 값을 기본으로 넣지 않는다. 신선도는 max-age가, 정합성은 org-config 대조가 맡고, 고정은
  특정 색인 하나를 얼려 둘 때(조사·재현)만 쓴다.
- 색인이 Owner 표를 하나라도 읽지 못한 채 만들어졌으면 그 사실(`owner_tables_missing`)이
  회차 영수증의 `scope.mail_attribution`까지 따라온다.
- 귀속 강도는 그대로 실려 온다. `confirmed`(제목규칙·묶음표·Owner확인된 판독)와
  `unconfirmed`(Owner확인 없는 판독, `include_with_review`, 공급사 본문 tie-break) 둘 다
  grant에 들어가되, 하류가 구분해 보여줄 수 있도록 강도가 따라간다.
- 귀속하지 않는 것: 제목 두 과제 겹침, `hold_owner_review`, `vendor_only`, Owner가 확정한
  제외. 색인에 줄이 없고, 줄이 없는 것이 다음 회차에서 그 메일을 과제에서 **회수**한다.

회수가 어떻게 일어나는가(이 저장소의 원래 교정 규칙 그대로, 새 writer 없음): 색인이 더
이상 그 메일을 말하지 않으면 다음 grant에서 빠지고 → `grantDifference`가 `removed`로 세고
→ 다음 세대의 documents에 없고 → `materializeGraphIndex`가 이전 세대를 supersede 하면서
그 노드를 내린다. `--dry`와 실제 회차 둘 다 `grant.by_kind.mail`로 `add`/`retire`/
`unchanged`를 과제별 수로 보고하므로 조용히 남는 것은 없다.

**아직 writer가 없는 곳(Owner 판단 필요).** `10_입력자료/<KIND>/references/*.json`은
`preparation_store.mjs`가 create-only로만 쓰고 이 저장소는 파일을 지우지 않는다. 그
디렉터리는 graph-sync lane이 쓰는 곳이 아니라 `preparation_flow.mjs`가 쓰는 곳이며,
스키마 `soulforge.context_source_reference.v1`에는 candidate/observed 표식이 **없다**
(`scope`는 음성 구간이고 doc_key identity의 일부라 쓸 수 없다). 그래서 (a) 재귀속된 메일의
옛 reference 파일은 남고, (b) `unconfirmed` 표식은 reference 본문이 아니라 색인과
graph-sync 영수증으로만 흐른다. 고정된 스키마에 필드를 더하는 것은 이 조각의 범위 밖이며,
회수 수는 영수증에 세어 남긴다.

```
node guild_hall/context_engine/harness/estate_graph_sync.mjs \
  --root-table <file> --projects P26-014,... --receipts <dir> \
  --mail-attribution [<alias address>] \
  [--mail-attribution-max-age <시간, 기본 36>] \
  [--mail-attribution-org-config <alias address>] \
  [--mail-attribution-owner-tables <표 폴더의 alias address>] \
  [--mail-attribution-sha256 sha256:...] [--dry]
```

**재등록 시 주의(N7).** `ops/register-graph-sync-task.ps1`에 인자 네 개
(`-MailAttribution`, `-MailAttributionMaxAge`, `-MailAttributionOrgConfig`,
`-MailAttributionOwnerTables`)가 늘면서 **plan digest가 바뀐다**. 등록기는 dry-run이
찍은 plan digest를 `-ExpectedDryRunDigest`로 그대로 돌려받아야 진행하므로, 예전에 받아
둔 digest는 더 이상 맞지 않는다. `-Register` 전에 **dry-run을 다시 돌려** 새 plan
digest를 받고, 그 값으로 등록한다. 등록은 Owner의 비패키지 창에서 한다.

색인을 만드는 쪽은 `guild_hall/workspace_ledgers/ops/mail_attribution_index.mjs`다.
시험은 `tests/mail_attribution_routes.test.mjs`.

## 과제를 넘나드는 공통 용어 등록부

여러 과제가 같은 일을 하니 같은 말을 쓴다. CDR·수신부·앰프·해상시험이 그렇고, 그런 말 하나로는 어떤 기록이
어느 과제 것인지 정할 수 없다. 이 등록부는 그 규칙을 **고정된 낱말 두 개가 아니라 자료에서 파생되는 파일**로
만든 것이다. 파생물이라 언제든 다시 만들 수 있고, 원본이 아니다.

- 입력은 둘뿐이다. ① 통합 그래프 DB가 **지금 서비스 중인 세대**의 엔티티 이름 — 두 과제의 세대가 같은 이름을
  들고 있으면 그것은 관측된 공통 용어다. ② Owner가 두는 seed(`<control_root>/context-read/shared_terms.seed.v0.json`)
  — 그래프가 아직 두 과제에서 보여주지 않았지만 온 estate가 쓰는 말을 선언한다. 항목마다 근거 과제 코드를 적으며,
  근거 없는 seed 항목은 거부한다. 저장소에는 예시(`ops/context-read/shared_terms.seed.example.json`)만 둔다.
- 출력은 `<control_root>/context-read/shared_terms.v0.json` 한 파일이다(`tools.v0.json`의 `shared_terms_path`).
  `{schema, generated_at, generation_refs[], terms[{term, normalized, projects[], mention_count, source}], counts}`이며
  `source`는 `graph`·`seed`·`both`다. 매번 덮어쓰되 직전 판은 `.prev`로 한 벌 남는다. 본문·문서·경로는 담기지 않는다.
- DB에 묻는 것은 읽기 명령 `entity_projects`(워커) 하나다. `listEntityProjects({binding, runWorker})`가 그것을
  `inspectGraphDatabase`와 같은 규약으로 부른다. Cypher는 워커 안에만 있고, 답은 이름·과제·언급 수이며 청크 본문은
  돌아오지 않는다. 쓰기는 없다. 추출 규칙 해시(`rules_sha256`)가 가리키는 함수는 건드리지 않으므로 저장된
  fragment는 그대로 재사용된다.
- **용어의 모양**은 규칙으로 적는다. 식별자(`P24-049`·`SON-1421`처럼 숫자를 낀 하이픈 토큰)는 공통 용어의 반대이므로
  등록하지 않고, `--max-term-characters`(기본 24)를 넘는 이름과 3낱말을 넘는 제목은 기록의 제목이지 용어가 아니다.
  걸러낸 수는 이유별로 `counts`에 남는다. 등록 최소 과제 수는 `--min-projects`(기본 2)이며, seed 항목은 그 아래여도
  남는다(그때 `source`가 `both`가 된다). 바인딩을 열지 못한 과제의 행은 세지 않고 `unknown_project_rows`로 적는다.
- 판독은 `src/runtime/shared_terms.mjs`다. `loadSharedTerms(path)`는 파일이 없으면 `null`(등록부 없음은 실패가 아니다),
  등록부가 아닌 파일은 거부한다. `classifyTerms(text, registry)`는 `shared`(2과제 이상)·`distinctive`(1과제)·
  `unregistered`(등록부가 모르는 약어형 토큰)를 과제 목록과 함께 돌려주고, 등록부가 없으면 빈 배열이다. 형태소 분석은
  없다: 대소문자 무시 부분 문자열이라 `수신부의`·`수신부에서`가 걸리고, 전부 ASCII인 용어는 양옆이 영숫자가 아닐
  때만 걸려 `CDR`이 `CDROM` 안에서 걸리지 않는다.
- 재생성: `node guild_hall/context_engine/harness/estate_shared_terms.mjs --root-table <표> --tools-config <설정>
  [--seed <파일>] [--min-projects 2] [--out <파일>]`. 읽기 전용이며 DB·색인·원본을 바꾸지 않는다.
- 시험: `tests/shared_terms.test.mjs`(합성 등록부의 세 판정, 조사·대소문자·경계, 등록부 없음, 합성 워커 응답의 집계,
  식별자·제목 제외, seed 병합, `.prev` 보존).

## 원본 문서 준비 (0.4.0~0.5.0)

`prepareSourceDocuments({ grant, roots, now, previousCoverage })`는 수집 lane이 이미 보관한 항목 중
exact grant(`soulforge.context_source_grant.v1`)에 적힌 항목만 읽어 `soulforge.context_source_document.v1`
문서(제목·본문 단위·출처 locator·발생 시각·말한 사람·사실 항목)로 바꾼다. 항목 탐색, 과제 귀속 추측,
원문 이동·복제, 쓰기는 하지 않는다. 과제 귀속은 grant만 정한다.

- grant: 정확한 과제 ref, 목적 `context_preparation`, 허용 자료 등급, 유효기간, source별 root 이름과 항목.
  항목 판본 정책은 `exact`(고정 판본) 또는 `latest_in_custody`(그 항목에 대해 보관된 최신 판본)다.
  root 이름을 실제 경로로 잇는 표는 신뢰된 설정(`roots`)이 주며 grant에는 경로가 없다.
- 연결됨(합성 원본으로만 검증):
  - Linear(`linear-custody-v1`): 이슈·댓글·변경 이력을 create-only 원본에서 읽고 파일마다 해시를 다시 계산해 대조한다.
  - 음성(`voice-session-v1`): `sessions/<날짜>/<세션>/`의 manifest와 `transcript.jsonl`을 발언 단위로 바꾼다. 발언 시각은
    녹음 시작+오프셋, 알게 된 시각은 가져온 시각이다. 화자 라벨은 검증되지 않은 제공자 표시라 해시 ref로만 쓴다.
    grant `scope`로 여러 과제가 섞인 녹음의 해당 구간만 받는다.
  - 메일(`mail-event-v1`): 수집기 이벤트 싱크의 행을 머리글·새 본문·인용 이력으로 나눈다. 본문 정규화는 gateway의
    `mailBodyTextFromRecord`를 재사용하고, 같은 달 파일의 다른 메일은 이 메일의 판본에 영향을 주지 않는다.
  - 문서(`document-file-v1`): UTF-8 텍스트·Markdown을 문단·제목 절 단위로 바꾼다. 파일 시각은 신뢰하지 않아 `valid_at`은
    null이다. PDF는 고정 PDF 준비와 해석기 binding 연결 전이라 `pdf_preparation_not_connected`, HWP/HWPX·Office는
    `unsupported_document_format`으로 보고한다.
- 경로 조각은 실제 파일 이름(한글·공백)을 받되 구분자·제어문자·`.`/`..`·Windows 예약 문자·끝 점/공백과
  비밀 파일 이름은 거부한다.
- 실자료 등급은 거부한다(`real_source_preparation_not_admitted`). P1 비유출 증거와 source별 grant 검증 gate가
  생기기 전에는 `public_synthetic`만 받는다.
- `doc_key`는 과제·종류·root·항목·합성 판본·adapter profile의 해시다. 같은 입력은 같은 키(재실행 no-op)가 되고,
  댓글처럼 딸린 판본이 바뀌면 새 키(변경 무효화)가 된다. coverage 기록과 `detectSourceChanges`가 추가·변경·삭제·
  불변·사용불가를 나눈다.

## 준비 실행 기록과 독립 검증 (0.10.0)

준비 결과는 무엇이 만들었는지 말할 수 있어야 증거가 된다. `prepareSourceDocuments`에 `runId`를 주면 그 호출이
자기 실행을 `soulforge.context_preparation_run.v1` 기록으로 함께 낸다. `validatePreparationRun({ run, preparation,
grant, validationRunId, checkedAt })`은 그 기록이 주장한 값을 `soulforge.context_preparation_validation.v1`
보고서로 다시 계산한다. 둘 다 값만 만들며 저장 배치는 아직 없다.

- 기록은 **준비 행위에 묶인다.** 기록을 만드는 함수는 공개 표면(`src/app.mjs`)에 없고, 실제 어댑터 작업을 감싸는
  준비기 안에서만 만들어진다. `runId`를 주지 않으면 기록이 아예 나오지 않으므로, 결과를 가졌다는 것만으로 기록이
  있는 것처럼 되지도 않는다. 다만 이 보증은 **공개 표면의 export 목록에 대한 것**이고, `runtime/preparation_run.mjs`를
  직접 import할 수 있는 코드에까지 미치지는 않는다(아래 "기록은 서명이 아니다" 참고).

- 준비기(`context-engine/source-preparer`)와 검증기(`context-engine/preparation-validator`)는 module_version과
  따로 판올림한다. 준비기가 바뀌면 기존 준비 bytes가 무효가 되지만 검증기가 바뀌는 것은 그렇지 않기 때문이다.
- 문서를 통째로 해시할 때 소수는 정확한 십진 표기로 묶는다. `sha256Canonical`이 안전정수 아닌 수를 거부하는데,
  ASR은 밀리초 offset을, ffprobe는 소수 `duration_seconds`를 쓰므로 정상 voice 자료가 소수를 담는다. 그대로 두면
  기록을 요청한 준비가 통째로 죽는다(항목별 `failed`로 강등되지도 않는다).
- `preparer_code_digest`는 손으로 적은 목록이 아니라 **계산한 폐포**다. 준비 진입점에서 상대 import를 따라가
  닿는 파일을 전부 해시하며, 시작점은 호출자가 준 root가 아니라 이 모듈 자신의 위치다. 그래서 모듈 밖이라도
  준비 바이트를 실제로 만드는 것(예: 메일 unit 본문을 쓰는 `gateway/mail_body_excerpt.mjs`)이 함께 덮이고,
  어댑터나 헬퍼가 늘어도 목록을 고쳐 적을 일이 없다. 현재 폐포는 14개 파일이다(시험이 정확한 수를 고정한다).
- `preparer_code_refs`는 장식이 아니다. 기록의 digest는 그 목록 자체의 digest여야 하며(`codeInventoryConsistent`),
  검증기가 이를 다시 확인한다. 진짜 digest 옆에 가짜 파일 목록을 붙일 수 없고, 아무것도 준비하지 않았다고
  주장하는 빈 목록도 거부된다. 어느 트리의 코드인지를 이 트리와 맞춰 보는 것은 재현 가능성 검사의 몫이다.
- `preparation_rules_digest`는 살아 있는 상수(스키마·종류·판본 정책·한계·adapter profile)에서 나오므로 규칙이
  바뀌면 같이 움직인다.
- 검증기도 같은 방식으로 자기 바이트를 고정한다(`validator_code_digest`). 손으로 관리하는 버전 문자열만으로는
  "어느 검증기가 PASS라고 했는지"를 확인할 수 없기 때문이다.
- `started_at`·`ended_at`은 준비 호출을 감싼 `clock`이 준 값이다. 독립적으로 관측한 시각이 아니며 grant 유효기간
  밖일 때만 걸린다. 기록은 서명이 아니다 — 바이트를 만들 수 있는 쪽은 기록도 만들 수 있고, 기록의 진위 보증은
  기록을 낳는 쪽을 한정하는 저장 배치가 생길 때 따라온다.
- `changes`도 결속한다. 읽는 쪽이 `changes.unavailable`로 불완전한 원본 묶음을 HOLD하기 때문에, 묶이지 않은
  변경집합은 불완전을 완전으로 바꿔 놓을 수 있다. `changes`는 이전 coverage의 함수이기도 해서 기록이
  `previous_coverage_sha256`도 함께 적는다.
- 검사 정책 `preparation-integrity-v1`은 7개 검사를 돌린다: 기록 자기일관성, 문서 신원 재계산(변조), coverage
  무결성, 기록과 산출물의 결속, grant 조건(등급·과제·판본 정책·유효기간·미승인 항목), unit locator, 그리고 이
  트리에서의 재현 가능성. 결과 어휘는 `pass`/`fail`/`partial`/`not_run`이며 검사마다 검사 범위와 한계를 함께 적는다.
- locator 검사는 "인용한 것 중 문서가 안 쥔 게 있나"만 보지 않는다. 그러면 locator를 통째로 비운 unit이 그냥
  통과한다. 판본에 닻을 내리는 종류(`linear`·`mail`·`voice`)는 unit마다 이 문서가 쥔 판본을 **최소 하나는**
  인용해야 하고, 경로가 필요한 종류(`document`·`mail`)는 granted 경로를 가리켜야 한다. 어느 판본인지는 어댑터가
  정한다 — Linear 댓글은 이슈 스냅샷이 아니라 자기 행을 가리키고 그것도 이 문서가 쥔 component다. primary를
  콕 집어 요구하면 댓글 달린 이슈가 전부 오탐으로 걸린다.
- `document`는 경로와 줄 범위로만 위치를 잡으므로 **판본** 규칙의 대상이 아니다. 경로 규칙은 적용되므로 그 unit들도
  `checked`에 들어가고, 적용되지 않은 규칙 쪽을 한계로 적는다.
- 문서는 **통째로** 결속한다. `documents_sha256`의 각 행이 `[doc_key, totalDigest(document)]`라서 제목·사실·
  시각·components·locator처럼 `doc_key`와 `text_sha256`이 덮지 않는 자리를 준비 뒤에 고쳐도 기록과 어긋난다.
- 신원 검사는 `composite_revision_sha256`을 primary와 components에서 다시 계산한다. 이게 없으면 가짜 component를
  덧붙여 locator가 인용해도 되는 판본 집합을 넓히면서도 `doc_key`와 `text_sha256`은 그대로 둘 수 있다.
- 잘못된 모양의 문서는 예외가 아니라 finding(`document_malformed`)이다. 값이 이상해서 보고서 자체가 안 나오는
  길도 막았는데, **거부 목록을 더 길게 적는 방식이 아니다.** 세 판본이 그 목록을 열거하려다 매번 짧았다(소수 →
  NFC 아닌 문자열 → 짝 없는 서로게이트·`-0`·NFC 아닌 **키**). 그래서 규칙을 둘로 줄였다:
  - 이 모듈이 쥔 두 값을 비교할 때는 `totalDigest`를 쓴다. 어떤 값이든 ASCII 한 줄로 인코딩해 넘기므로 거부 목록을
    아예 만나지 않고, 직렬화된 자료가 담을 수 있는 차이는 전부 digest를 가른다(`Date`와 `{}`, `-0`과 `0`, NFD와 NFC).
    모든 JavaScript 값에 대해 단사는 아니다 — 희소 배열의 구멍 위치, 배열의 비색인 속성, symbol 키, 열거 불가 속성,
    null 프로토타입, 같은 이름의 다른 생성자, 이름만 적고 호출하지 않는 접근자는 쌍둥이와 같은 encoding이 된다.
    전부 JSON을 통과하지 못하는 모양이고, 이 모듈이 읽는 것은 언제나 JSON을 거친 자료다. canonical 해시는 그중
    일부를 모호하다는 이유로 거부하는데, 이쪽은 받아들여 직렬화된 모양으로 취급한다.
  - `source_documents.mjs`가 `sha256Canonical`로 쓴 digest를 검사할 때는 `matchesCanonical`로 **"이 값이 이 digest가
    되느냐"만** 묻는다. 거부되는 값은 "아니오"가 되고 그게 변조에 대한 정답이다.
  둘 다 목록을 참조하지 않으므로 목록보다 뒤처질 수 없다. `totalDigest`는 `sha256Canonical`과 일부러 다른 값을 낸다 —
  한쪽으로 해시한 값을 다른 쪽으로 해시한 값과 비교하는 자리는 없다.
- 검증기는 준비 결과를 고치지 않는다. 같은 bytes를 새 검증기로 다시 보면 보고서만 늘고 준비 기록은 그대로라,
  옛 PASS와 새 FAIL이 함께 남는다. 보고서는 대상(`validated_run_sha256`)과 관측값(`observed_*`)을 나눠 싣는다.
  기록 해시가 coverage·documents·grant digest를 이미 덮으므로 대상 고정에는 그것 하나면 되고, 관측값이 어긋나는
  것은 finding이지 보고서가 그 run을 못 가리키게 되는 사유가 아니다(FAIL 보고서도 자기 대상을 가리켜야 한다).
  자료나 허용 범위가 달라지면 run이 달라져 `reportCovers`가 거짓이 되므로 예전 PASS를 새 대상 증거로 쓸 수 없다. 다만
  `reportCovers`는 **같은 run에 대한 두 보고서의 선후를 정하지 않는다**. 그 판단은 읽는 쪽 몫이며 보고서가
  `validator_code_digest`와 `checked_at`을 실어 한계로 명시한다.
- 보고서에는 원문이 들어가지 않는다. finding은 코드와 ref(`doc_key`·`unit_id`, coverage 행은 `item`=종류/root/항목)만
  담고 검사별 20건에서 자른 뒤 그 사실을
  한계로 적는다. 보고서에는 한계가 항상 붙으며 현재 일곱 줄이다 — 재계산이 준비기와 같은 canonical 해시 함수를
  쓰므로 그 함수 자체는 시험하지 않는다는 것, 원본을 다시 열지 않는다는 것, 같은 run에 대한 두 보고서의 선후를
  정하지 않는다는 것, `previous_coverage_sha256`·`changes_sha256`은 재도출이 아니라 넘겨받은 결과와의 대조라는 것,
  **문서 순서는 결속되지 않는다**는 것(digest가 doc_key로 정렬하므로 같은 구성원·같은 바이트의 재배열은 finding이
  아니다), 기록은 서명이 아니라는 것, 그리고 **PASS는 완결성이 아니라 충실성**이라는 것 — 기록이 결과를 정확히
  기술하는지를 말할 뿐, granted 항목이 다 준비됐는지를 말하지 않는다(빠진 것은 coverage의 `missing`과 `changes`의
  `unavailable`에 있고 둘 다 결속돼 있다).

## 실제 자산 주소 (0.13.0)

`data_root/20_PROJECTS/<과제>/...`의 첫 조각은 폴더 이름이 아니라 Path Registry의 **root class 별칭**이다. 선언된 어떤
배치에도 `data_root`라는 폴더는 없다. 이 주소가 manifest와 참조에 저장되는 **이식 가능한 주소**이고(`safeStoreRel`이
절대경로를 거부한다), 별칭을 이 host의 자리로 바꾸는 것은 root 표다.

- `createAliasedStoreIo(rootTable)`는 `rootedStore`와 **같은 `{ path, read }` 계약**을 주되 첫 조각을 별칭으로 푼다.
  세그먼트마다 링크를 거부하는 가드도 그대로다. 그래서 두 io 중 무엇으로 써도 manifest 바이트가 같고 저장된 참조의
  뜻이 변하지 않는다. 합성 저장소는 절대 root 하나 아래 같은 상대 트리를 갖는 것이고, 그게 `rootedStore`다.
- 표는 자산의 위치를 알려주므로 **자산 안에 있을 수 없다.** 프로세스에 들어가는 절대경로는 표 파일 경로 하나뿐이고
  그 뒤 모든 주소는 별칭이다. 표의 값(실제 root)은 코드·문서·manifest·영수증에 넣지 않는다 — 영수증에는 별칭과
  표 digest만 남는다.
- 과제 binding 주소도 같은 언어로 말한다(`bindingAddress`). 합성 저장소는 과제 트리 옆에 두는 것이 기본이고,
  실제 자산에서는 절대 source root를 담은 과제별 binding이 `control_root` 아래에 있다 — 그 절대경로는 사적 사실이라
  과제 트리가 사는 자료 평면에 두지 않는다.
- 정션·symlink로 `data_root` 폴더를 흉내 내는 방법은 쓰지 않는다. root가 링크면 표가 거부하고, 그 아래 어느 조각이
  링크여도 io가 거부한다.

## 저장 입구와 읽기 출구의 검사 (0.13.1)

2026-09-12 외부 검토(1e594af2)가 지적한 저장·읽기·무결성 계약의 빈틈을 닫았다. 새 기능이 아니라 이미 둔 검사를 실제로
하게 만든 것이고, 폴더 구조·준비/검증 분리·비활성 세대·별칭 주소는 그대로다.

- 자료등급과 과제 경계: `writePreparationGeneration`·`readPreparationGeneration`이 문서마다 `data_class`가 현재 actor의
  `allowed_data_classes`에 있는지, `project_key`가 이 과제인지 대조한다(목록이 배열이라는 사실은 권한이 아니다). 읽기는
  지금의 ACL로 판정하므로 등급을 좁히면 본문이 즉시 닿지 않고, 세대 자체는 제자리에 남는다.
- 읽기 범위: manifest가 가리키는 문서 경로는 그 세대의 `documents/` 아래, 참조 경로는 이 과제의 `10_입력자료/` 아래여야
  읽는다. 자기 일관적인 manifest라도 다른 과제의 파일을 가리키면 한 바이트도 읽기 전에 거부한다(`preparation_store_generation_scope_refused`).
- 기록 자체의 digest: 저장 입구에서 run의 `run_sha256`, 보고서 append에서 `report_sha256`을 본문에서 다시 계산해 대조한다.
  outcome만 고친 보고서, preparer_version만 고친 run은 정상 receipt로 들어가지 않는다. 온전한 옛 PASS와 새 FAIL은 둘 다 남는다.
- 해시와 JSON 보관의 정합: 준비기 0.2.0·검증기 0.2.0. canonical hash는 JSON이 보관하는 값을 따른다 — `-0`은 `0`으로,
  비유한 수는 null로, 홀로 선 surrogate 문자열은 JSON 텍스트로 별도 태그 아래 해시한다. 보통 값의 digest는 바뀌지 않는다.
- 시험: `tests/preparation_store_review.test.mjs`(REV-A1~A3, B1~B2, C1~C2, D). 검토자가 보낸 probe를 그대로 들여왔고,
  수정 전 1e594af2에서는 8건 중 7건이 실패(REV-D만 통과)했다.
- 여전히 아님: 서명. manifest·run·report digest는 자기 일관성 검사이지 생산자 인증이 아니다.
## 원문 대조 v2 — 정확한 판본, 값 대조, NOT_RUN은 PASS가 아니다 (0.17.0)

- 판정: 문서·전체 rollup은 fail > partial(부분 보존 또는 검사 미실행이 하나라도 있음) > not_run(아무것도 안 돌음) > pass. 검사기 없는 kind나 안 돈 검사는 절대 pass에 묻히지 않는다.
- 정확한 판본: 댓글·이력·Slack 답글은 단위 locator가 기록한 그 판본(revision_sha256 / raw_sha256)과 대조한다. custody가 준비 시각(`prepared_at`, run의 ended_at) 뒤에 얻은 항목은
  "later input change"로 exclusions에 적고 결함으로 세지 않는다. 준비 시각을 모르면 모두 누락으로 본다(더 엄격한 쪽).
- Linear 이력 값: history id·시각뿐 아니라 raw 항목에서 독립 도출한 변경값 조각(state 이름/id, title, assignee, due_date, priority, estimate, project, parent, team, cycle, labels, relations, flags)이
  렌더된 텍스트에 있는지 본다(`history_values_preserved`). 보고서 `scope.compared`·`scope.not_compared`에 비교한 것과 안 한 것을 적는다.
- 메일 본문 분할(mail-event-v2): 단위 상한(20,000자)을 넘는 본문·인용은 줄 경계에서 순서 있는 chunk로 나눠 담는다(locator chunk/chunks). 검사기는 chunk를 순서대로 이어 원문과 대조하고
  `order_preserved`로 순서·본문/인용 구분을 본다.
- Slack 파일 공유(slack-custody-v3): 본문 없는 메시지는 본문을 만들지 않고 저장된 파일 메타(id·type·size·digest)를 `file_share` 단위로 담는다. 모든 Slack 문서에
  `slack.attachment_bodies_processed=false`를 적는다. 본문도 포인터도 없는 메시지만 `refused / slack_message_without_content`.
- 실행기 `recheckGeneration`·CLI `--recheck <세대>`: 저장된 세대를 그대로 두고 새 검사 보고서만 옆에 추가한다(검증만 바뀐 경우). 준비 결과가 바뀌는 항목은 새 세대.
- 준비기 0.4.0, 검사기 0.2.0(정책 source-original-check-v2). 시험 3건 추가.
## 파생 세대(임베더 교체)와 번호 없는 근거 연결 (0.19.0)

추출은 그대로 두고 **검색 벡터만** 바꾸는 길, 그리고 공통 번호·직접 링크가 없는 두 기록을 **추론 관계**로 잇는 길.
둘 다 파생이다. 원문도, 원래 세대도, 포인터도 바뀌지 않는다.

- **`reembedGraphIndex`**: 선택된 세대의 조각을 해시로 되읽어 청크 본문만 임베더에 보내고, Chunk의 `embedding`·
  `embedding_ref`와 노드·관계의 `sf_embedder`·`sf_embedder_digest`·`sf_revision_sha256`만 바꿔 **새 세대**를 create-only로
  쓴다. `sf_model`·`sf_model_digest`·대상·관계·`stats`는 추출이 남긴 그대로다. 조각에 `extraction_reused_from`
  (원래 세대 id와 그 조각의 digest), manifest에 `derived_from`·`llm.calls: 0`·`embedding`(모델·digest·차원·호출 수·소요·
  worker digest)이 남는다. 문서 바이트는 새로 쓰지 않고 원래 세대의 `(path, sha256)`을 그대로 잇는다.
  **포인터는 쓰지 않는다** — 세대를 고르는 것은 `selectGraphIndexGeneration`의 별개 행위다.
  `updateGraphIndex`로 임베더만 바꾸면 모델 판본이 달라져 모든 문서가 재추출 대상이 되는데, 조각의 대상·관계는
  임베더의 함수가 아니므로 그 재추출은 값을 만들지 않고 비용만 만든다.
- 워커 연산 `embed`: 문서 임베딩과 **같은 호출**(`OllamaEmbeddings.embed_query(청크 본문)`)을 쓴다. 지시문을 덧붙이지
  않고 이쪽에서 정규화하지 않으며, `truncate=False`로 모델 문맥을 넘는 청크를 조용히 자르는 대신 크기와 함께
  거부로 돌려준다(그 실행은 HOLD, 세대는 쓰이지 않는다). LLM은 호출되지 않는다.
- **`openGraphIndex({ generationRef })`**: 포인터 대신 이름으로 세대를 연다. 검사는 그대로다 — ref는 이 과제의
  검색_색인 영역이어야 하고, 파일은 digest로 되읽으며, grant와 자료등급이 지금도 이 actor를 허용해야 한다.
  뷰의 `selected`가 이것이 선택된 세대인지 아닌지를 말한다.
- **규칙 R1(`RELATED_EVIDENCE`)**: 같은 번호를 공유하지 않는 두 청크를 잇는다. 로컬 모델이 **한 쌍씩** 읽고
  `profiles/relation_judgement_v1.mjs`의 다섯 종류 중 하나로 답하며, 그중 `same_test_context`·`condition_material_for`만
  간선이 된다(`similar_topic`·`insufficient`·`different_event`는 보고로만 남는다). 모델의 답은 그 자체로 간선이
  되지 않는다: 코드가 ① 양쪽 (문서, 단위)를 이 세대의 manifest에서 찾고 ② 인용 구절이 그 단위 본문에 실제로
  있는지(공백 차이까지만 허용) 확인한 뒤에야 워커에 넘긴다. 간선은 `sf_claim_state: 'inferred'`,
  `sf_review_state: 'unreviewed'`, 규칙·프롬프트 digest·모델·모델 pin·양쪽 근거 단위를 달고 **투영에만** 들어간다.
  `sf_judgement_id`는 그 판단의 내용 해시라서 같은 판단을 다시 적용해도 간선이 늘지 않는다.
- **확장 예산**: graph 검색이 따라가는 것은 씨앗의 추출 관계 1홉, 규칙 L1(명시적 참조가 가리킨 문서의 청크),
  규칙 R1(관계가 지목한 청크)이다. 요청의 `expansion.enabled_rules`로 규칙을 끄고 같은 질문을 다시 물을 수 있다
  (A/B 조건). 상한은 이 APP의 것이고 요청은 낮출 수만 있다: 문서당 유입 3, 유입 합계 8, 최종 16, 깊이 1,
  `(doc_key, unit_id)` 중복 제거. 씨앗은 자기 벡터 점수와 순서를 지키고 유입만 씨앗 점수를 상속한다. 유입 순서는
  ① 관계가 직접 지목한 청크 ② 그 청크의 질문에 대한 근접도(`vector.similarity.cosine`, 질의 벡터는 씨앗을 찾은
  바로 그 벡터)다 — 근접도는 **고르는 데만** 쓰고 보고하는 점수로 쓰지 않는다. 상한이 덜어낸 수는 receipt의
  `expansion.truncated`에 이유별로 남는다.
- 실행기: `harness/estate_graph_link.mjs --generation <id>`(L1을 이름 있는 세대에 다시 적용),
  `harness/estate_graph_relate.mjs`(후보 검색 → 관계 판단 → 검사 → `--apply`). 후보가 **검색으로 발견된 것**인지
  **검토자가 지목한 것**인지는 receipt에서 갈라 적는다.
- 시험: 재임베딩이 추출을 그대로 두는지·거부된 청크가 세대를 만들지 않는지·이름으로 연 세대가 같은 grant/ACL/영역
  검사를 받는지, 판단된 관계가 양쪽 단위와 인용까지 확인된 뒤에만 DB에 가는지, 다른 사건·없는 인용이 간선이 되지
  않는지, 확장 예산이 좁혀져 전달되고 행이 재정렬되지 않는지.
- 실행 결과와 남은 것은 handoff 보고(2026-09-13 8B 재임베딩·번호 없는 연결)가 소유한다. 이 문서는 계약만 적는다.

## 실제 estate 위의 그래프 색인 (0.18.0)

PV-4 이음새. 그래프 색인기(`updateGraphIndex`·`selectGraphIndexGeneration`·`openGraphIndex`)가 준비 store와 같은 방식으로
별칭 io를 받는다: `io`(`createAliasedStoreIo`)와 `bindingAddress`(예: `control_root/project-bindings/<과제>/graph_index_binding.json`).
`storeRoot` 하나로 여는 합성 저장소는 그대로다. 계약·manifest 바이트·주소 언어는 바뀌지 않았다.

- source root 경계: 합성 저장소는 root 전체가 store라 source root가 그 안이면 거부한다(그대로). estate에서는 수집 custody가
  같은 `data_root` 아래 과제 트리 **옆**에 있으므로 경계는 이 과제의 트리(`data_root/20_PROJECTS/<키>`)다. 그 안이면 거부.
- 실자료 admission: index binding이 `admission: { path, sha256 }`로 admission 기록을 가리키면 digest 대조 뒤 준비기에 넘긴다
  (`graph_index_admission_mismatch`). 없으면 준비기 게이트가 종전대로 public_synthetic 외 등급을 거부한다. manifest에
  `admission`(id·canonical digest·등급·승인자·참조)이 남고 합성 grant면 null이다.
- 쓰기 전후 재검사(`assertUnchanged`)도 같은 binding 주소를 다시 읽는다.
- admission의 모델 호출 정책(`model_calls`)이 셋이 됐다: `none`(모델 호출 없음) · `loopback_only`(이 host만) · `owner_hosts_only`
  (이 host + 기록이 `model_hosts`로 이름한 Owner 보유 기기, https origin 정확히). 기기를 여기 적는 것은 그 기기로의 호출이
  외부 전송이 아니라는 Owner의 선언이다. 색인 갱신은 admission 아래서 binding의 `allowed_model_hosts`가 그 목록 안인지
  본다(`assertModelHostsAdmitted`): `none`이면 추출 자체를 거부(`real_data_admission_model_calls_refused`), 목록 밖 origin은
  `real_data_admission_model_host_refused`. 2026-09-13 실행에서 실자료 admission이 `loopback_only`뿐이라 확정된 배치(추출 LLM은
  맥미니, 이 PC GPU는 Hermes 전용)를 실자료에 적용하지 못하고 GPU를 점유한 뒤 정정한 것이 계기다.
- 시험: 별칭 estate 위 갱신·읽기, 잘못 고정된 admission은 아무것도 쓰기 전에 HOLD, 모델 호출 정책 3종·origin 형식 판정.
- 실행 결과와 남은 것은 handoff 보고(2026-09-13 그래프 검색 연결)가 소유한다. 이 문서는 계약만 적는다.
## Slack 채널 custody 어댑터 (0.16.0)

`src/adapters/sources/slack_custody_source.mjs`(`slack-custody-v1`): Slack history lane의 채널 custody(`state/slack-continuous.json`의 revisions·custody_receipts,
`raw/sha256/<xx>/<digest>.json`, attachments 포인터)를 읽는다. 한 항목은 루트 메시지 하나(Slack ts)이고 문서는 그 메시지와 custody가 가진 답글을
단위로 담는다(revision ref·raw digest로 위치). raw 파일은 custody receipt의 digest로 검증한다. 정책 보류(hold) 이벤트는 raw가 없으므로 문서가 되지 않고
채널 보류 건수를 fact로 남긴다. 원문 대조 검사기는 raw 텍스트·답글 전수·첨부 포인터·시각·채널을 대조한다. 준비기 0.3.0(kind 추가). 시험 1건 추가.
## 실자료 admission과 원문 대조 검사 (0.15.0)

실자료 처리는 두 가지를 더 요구한다. 읽어도 되는가(admission), 그리고 읽은 것이 원문을 보존했는가(원문 대조).

- `src/runtime/real_data_admission.mjs`: public_synthetic 밖의 자료등급을 담은 grant는 admission 없이는 전처럼 거부된다
  (`real_source_preparation_not_admitted`). admission은 Owner가 승인한 기록(`soulforge.context_real_data_admission.v1`)으로 과제·자료등급·source root를
  이름하고 경계(local_only, 외부 전송 없음, 모델 호출 none/loopback_only)를 적는다. 준비기는 이 기록을 정확한 grant에 대조한다: 과제 키 일치, grant의
  모든 실자료 등급이 admission에 있음, 모든 source root_ref가 admission에 있음, 유효기간 안. 자료 평면이 아니라 control_root에서 주소+digest로 읽는다.
  admission은 ACL을 넓히지 않는다(저장소는 여전히 문서마다 actor 등급을 대조한다). 회사 자료를 synthetic으로 바꾸거나 검사를 빼는 우회를 대신하는 문이다.
- `src/runtime/source_original_check.mjs`: 저장된 문서를 수집 원문과 대조한다. 원문은 수집 owner의 reader(`guarded_files`, 메일 본문은 gateway reader)로
  다시 읽고, 준비기를 재실행하지 않는다. 메일: 원문 행 존재(canonical digest), 헤더 필드, 본문(+인용 이력)=원문 텍스트(공백 정규화), 첨부 digest·개수,
  시각, thread/message id·수신자 수. Linear: custody 스냅샷 존재·digest, 제목·설명, 댓글 전수(본문·시각·parent), 이력 전수(id·시각), 시각, project·identifier.
  의도적 제외(첨부 본문 없음, HTML→텍스트, 이력의 텍스트 렌더, 빈 댓글 미보존, 중복 행)는 exclusions로 적는다. 검사기 없는 kind는 not_run이며 pass가 아니다.
  결과는 `soulforge.context_source_original_check.v1`(검사기 id·버전·code digest, documents digest 결속, report_sha256).
- `preparation_store.appendSourceCheckReport`: 보고서를 세대 밖 `20_문서검색/원문위치·추출품질/source_checks/<세대>/`에 append-only로 둔다.
  자체 digest 재계산, 세대의 documents digest와 결속, 과제 키 일치를 요구한다.
- 실행기 6단계: 준비 → 비활성 안착 → 되읽기 → 저장된 run 검증 → 보고서 추가 → **원문 대조 → 대조 보고서 추가**. `--admission-address/--admission-sha256`,
  `--grant-address/--grant-sha256`(binding이 고정한 grant 대신 묶음 grant) 인자. 영수증에 admission id·digest와 미처리 항목 목록이 실린다.
- 시험 `tests/source_original_check.test.mjs`(6건): 게이트 거부/허용, admission 판정 11경우, 메일 3종(첨부·HTML·중복)·Linear 2건 대조 통과, 본문 드리프트·댓글 누락·
  없는 판본 FAIL, 검사기 없는 kind not_run.
## 작은 합성 실행기 — 준비에서 보고서까지 한 바퀴 (0.14.0)

`harness/preparation_flow.mjs`는 기존 export만 써서 다섯 걸음을 순서대로 한다: 준비 → 비활성 세대로 안착 → 저장된 것을
되읽기 → **저장된** run을 정확한 grant로 검증 → 세대 밖에 보고서 추가. 메모리 안에서는 맞았다가 저장 뒤 달라지는 문제를 잡기
위해 판정 대상은 언제나 되읽은 것이다. 현재 pointer·그래프 색인·Neo4j·실자료는 하지 않는다(준비기 게이트 유지).

- `node guild_hall/context_engine/harness/preparation_flow.mjs --synthetic`: 임시 estate(fixture 과제 트리를 `data`에, binding을
  `control/project-bindings/synthetic/`에, 별칭 표를 옆에)를 만들어 별칭 io로 한 바퀴 돌고 영수증 한 줄을 찍은 뒤 지운다.
- 이름 있는 estate: `--root-table <절대경로> --root-table-sha256 --binding-address --binding-sha256 --request-json`. 절대경로는 표 하나뿐이고
  나머지는 별칭 주소다. 실제 estate 실행은 그 과제의 binding·actor·grant가 승인된 뒤의 일이며 이 문서가 그것을 대신하지 않는다.
- 영수증(`soulforge.context_preparation_flow_receipt.v1`)은 refs·digest·상태만 담는다. host 경로도 문서 본문도 없다.
- 시험 `tests/preparation_flow.test.mjs`: cold 별칭 estate 한 바퀴·재실행 REPLAYED·거부(핀 불일치, 같은 id, 권한 없는 actor)·rooted store·CLI.
- 같은 판에 canonical hash의 잔여 경계 하나를 닫았다: 객체 **키**도 값과 같은 규칙으로(홀로 선 surrogate 키는 JSON 텍스트를 `S` 태그로).
  정상 키의 digest는 그대로다. 회귀시험 REV-C3.

7 SKIP의 정체(2026-09-12, 시험별): PDF 해석기 `SOULFORGE_TEST_PDF_PYTHON` 미설정 3건(generation_producer #4, pair_transition #10·#11),
GraphRAG 실환경 opt-in 3건(graph_extraction #4, graph_index_generation #8, graph_database #10 — `SOULFORGE_TEST_GRAPHRAG_PYTHON/LLM(/NEO4J)`),
로컬 모델 opt-in 1건(context_planner #4 — `SOULFORGE_TEST_CONTEXT_PLANNER_LLM`). 이 문서의 앞선 "전부 PDF 해석기" 설명은 틀렸다.

PV-2 상태 표기(사실): 실행 기록·준비 결과·grant의 **일관성 검증은 구현**, **원문 대조는 미구현**(검증기는 source root를 열지 않는다).
원문 대조 요구는 후속으로 남아 있고, 이 표기가 PV-2 전체 완료를 뜻하지 않는다.
## 준비 결과와 검증 보고서의 과제 저장소 배치 (0.12.0)

`writePreparationGeneration`이 한 번의 준비를 과제 저장소에 앉히고, `appendValidationReport`가 그 세대 옆에
보고서를 더하며, `readPreparationGeneration`이 세대를 통째로 다시 읽어 파일마다 해시를 대조한다. 자리는 셋 다
Plan 17이 이미 이름 붙인 곳이고 새 저장 체계를 만들지 않는다.

- `10_입력자료/<종류>/references/` — 원본 참조·판본·locator. 수집 원본은 수집 owner에 그대로 있고 복사하지 않는다.
  본문은 여기 없다(세대에 있다). 다만 locator가 위치를 잡는 방식 자체가 텍스트일 때는 그 조각이 함께 간다 —
  문서 어댑터는 제목으로 절을 가리키므로 제목은 locator의 일부다.
- `20_문서검색/본문·표_추출/generations/<준비 run id>/` — 준비된 문서와 manifest. create-only이고 **비활성이다**:
  여기서는 현재 세대 pointer를 쓰지 않으므로 준비를 앉히는 것이 읽는 쪽을 바꾸지 않는다.
- `20_문서검색/원문위치·추출품질/validations/<준비 run id>/` — 검증 보고서. 세대 **안이 아니라 옆**이라 보고서를
  더해도 그 세대의 digest가 움직이지 않는다. 같은 run에 대한 옛 PASS와 새 FAIL이 둘 다 남는다.
- 판본 넷을 갈라 적는다: 준비기(id·버전·code digest), 규칙(rules digest), 폴더구조(`template_version`), 그리고
  보고서가 생기면 검증기(id·버전·code digest).
- 다시 앉히기: 문서와 참조는 내용으로 이름이 정해지므로 같은 입력이면 다시 쓰이지 않는다. 세대 자체는 준비 run id로
  이름이 정해지고 기록에는 관측한 시작·종료가 들어가므로, **같은 run id로 `REPLAYED`가 나오려면 그 시각까지 같아야
  한다** — 실제 호출자는 보통 run id를 새로 주고, 그러면 새 세대가 생기되 문서·참조 바이트는 재사용된다.
  같은 run id에 다른 기록이 이미 있으면 **아무것도 쓰기 전에** 거부한다.
- **"기록은 서명이 아니다"가 여기서 좁아지는데, 어디까지인지 정확히 말해야 한다.** 쓰기 경로는 binding이
  `prepare`로 허용하지 않은 actor를 거부하고, 준비가 아닌 목적을 거부하며, 어느 actor가 어느 binding·ACL
  digest로 승인받았는지 manifest에 적는다. 여기까지다. 저장소 **안에서 발견된** 기록이 그렇게 들어왔다는 증명은
  아니다 — 파일 시스템에 쓸 수 있는 것이 이 모듈만이 아니고, manifest의 digest는 자기일관성 검사이지 서명이 아니다.
  다른 곳에서 통째로 복사해 넣은 세대는 깨끗하게 읽힌다. 더 좁히려면 서명이나 writer가 하나뿐인 저장소가 필요하고
  둘 다 아직 없다.
- 옛 레이아웃(v0) 저장소에도 앉는다. 모든 판본이 요구하는 영역이 빠졌으면 그대로 거부한다.

## Neo4j GraphRAG 추출 (0.6.0, 적재·검색은 Neo4j 설치 뒤)

`extractGraphFragments({ documents, projectKey, profile, binding })`는 준비된 원본 문서를 neo4j-graphrag 부품으로
넘겨 대상·관계 후보를 뽑는다. 청크 임베딩(`TextChunkEmbedder`), LLM 추출(`LLMEntityRelationExtractor`), 어휘 그래프,
schema 가지치기(`GraphPruning`)는 도구가 하고, APP은 그 둘레의 고정 계약만 맡는다.

- worker(`src/workers/graphrag_worker.py`)는 신뢰된 binding이 준 해석기(neo4j-graphrag venv)로 `-I -B -X utf8`
  실행한다. PATH에서 찾지 않고 proxy 변수를 지우며, LLM·임베딩 주소는 loopback만 받는다. 모델 이름·주소·호출
  예산은 요청이 아니라 binding이 정한다(맥락이 endpoint·예산은 Owner 결정 §7-6 몫이라 코드에 박지 않는다).
  결과는 ASCII JSON 바이트로 낸다. 한국어 Windows pipe는 Python 출력을 cp949로 바꿔 청크 본문이 원본과 어긋났다
  (`-I`는 `PYTHON*` 환경변수를 무시하므로 UTF-8 모드는 플래그로 켠다).
- 설치된 1.19.0의 `OllamaLLM`은 비동기 경로에서 모든 인자를 `options` 안에 넣어 JSON 형식과 keep-alive가
  서버에 가지 않고, 고정된 ollama client(0.4.9)에는 생각 끄기 인자가 없다. 로컬 생각 모델(qwen3.5)은 기본으로
  생각만 하다 끝나 JSON을 내지 않았다(생각 4,116자, 본문 0자, `done_reason: length`). 그래서 worker는 도구의 LLM
  인터페이스에 맞춘 얇은 연결부로 로컬 chat API를 직접 부르고 JSON 형식, binding의 `think`(기본 `false`, `null`은
  모델 기본값), 호출 예산(넘으면 빈 결과로 부분 처리), 호출별 기록(입출력 해시·크기·생각 길이·중단 사유·시간·
  토큰)을 남긴다. APP은 이름이 정해진 기록 필드만 받는다.
- 모델 판본: worker가 설치된 모델의 manifest digest를 읽어 돌려주고, 조각의 모든 행에 모델 이름과 digest, 판본 전체의
  해시(`sf_revision_sha256`)를 붙인다. 태그만으로는 판본이 아니다. 판본에는 worker 파일 해시와 neo4j-graphrag·neo4j·
  ollama·pydantic 판도 들어간다(도구의 기본 추출 prompt와 가지치기는 도구 판을 따라 바뀐다). 모델이 설치돼 있지 않으면
  `llm_model_not_installed`/`embedder_model_not_installed`다. 이름이 `-cloud`로 끝나는 모델은 로컬 서버를 거쳐
  제공자 서비스에서 돌므로(Ollama 공식 문서) loopback이어도 `graph_model_not_local`/`model_not_local`로 거부한다.
- 도구가 대화 이력이나 system 지시를 붙여 부르면 prompt가 판본 밖에서 바뀌므로 worker가 `llm_prompt_path_not_supported`로
  멈춘다. 요청은 64 MiB(worker 읽기 상한) 안이어야 하며 넘으면 실행 전에 거부하고, worker가 먼저 죽어 입력 pipe가
  끊겨도 호출한 쪽이 죽지 않고 `graphrag_worker_stdin_failed`로 끝난다.
- 추출 결과가 온전하지 않으면 `ok`가 아니다. 호출 오류, 도구가 읽지 못한 답(도구의 JSON 수선·그래프 검증을 worker가
  같은 순서로 다시 해 셈), 잘린 답(`done_reason: length`), 원본 단위와 어긋나거나 빠진 청크가 하나라도 있으면
  `degraded`(예산 초과는 `partial`)와 원인 개수를 돌려준다. 도구는 이런 답을 빈 그래프로 조용히 바꾸기 때문이다.
- 모델이 값을 모르는 속성을 `null`로 채우면 설치본의 `PropertyValue`에 null 자리가 없어 그 청크 답 전체가 그래프
  검증에서 떨어지고 도구가 조용히 빈 그래프로 바꾼다(P24-049 실자료 50건 시험에서 호출 100회에 1~2회, 온도와
  무관하게 되풀이됐다). 그래서 worker는 답을 도구에 넘기기 전에 `nodes`·`relationships`의 `properties`에서 값이
  null인 키만 떨어뜨리고 그 개수를 기록 필드 `dropped_null_properties`에 남긴다(0.18.2). Neo4j에 null 속성은 없고
  APP의 속성 정리도 undefined를 버리므로 의미는 잃지 않는다. 읽히지 않는 답과 null이 없는 답은 모델이 쓴 그대로
  도구에 가고 판정은 계속 도구가 한다. 도구 판본 고정을 깨지 않도록 prompt는 건드리지 않는다.
- schema 강제는 도구의 `GraphPruning`이 한다. 선언하지 않은 유형·관계·패턴·속성과 이름 없는 대상(EXISTENCE 제약)을
  지우며, APP은 사유별 가지치기 개수만 조각에 남긴다.
- 문서·청크 ID는 `doc_key`와 단위 ID로 정해져 추출 결과가 원문 단위로 이어진다. 조각 수용 규칙은 두 단계다.
  (1) 어휘 그래프: 문서 노드는 하나이고, 청크 본문은 원본 단위와 같아야 한다. 속성은 준비된 문서에서 다시 만든다
  (도구가 찍는 `createdAt` 시계값을 빼서 같은 입력은 같은 조각 해시가 된다). (2) 대상: profile 유형이어야 하고
  도구 어휘 라벨(`Document`/`Chunk`)을 쓰면 안 되며, 받아들여진 청크를 가리켜야 한다. 관계는 조각 안에서만 잇는다.
  어긋난 것은 버리고 개수를 남긴다(같은 id가 두 번 나오면 뒤의 것을 버리고 센다). 남은 모든 행에 과제·문서·profile
  판본·모델 판본과 `claim_state: observed`를 붙이고, 조각에는 받아들일 때의 원문 해시(`source_text_sha256`)를 남긴다.
- 추출 profile(`profiles/graph_extraction_v1.mjs` 0.2.0: 요청·산출물·결정·변경·약속·제약·장비·참조 문서·사건과
  관계)은 시험에서 바꿀 실험 설정이다. 참조 문서 유형은 도구의 `Document` 라벨과 겹치지 않게 `ReferencedDocument`다.
- 시험: 단위 시험은 이름을 밝힌 가짜 worker 출력으로 binding 거부와 수용 규칙을 본다. 실제 추출은 opt-in
  (`SOULFORGE_TEST_GRAPHRAG_PYTHON`, `SOULFORGE_TEST_GRAPHRAG_LLM`, 선택 `SOULFORGE_TEST_GRAPHRAG_EMBEDDER`)이며
  합성 메모로만 돈다.
- 적재와 검색은 아래 `그래프 데이터베이스 적재·검색`에서 연결됐다(0.9.0). 그래프 데이터베이스 binding이 없는
  색인은 여기까지만 돌고 적재·검색만 `graph_database_not_connected`로 답한다.

## 과제별 그래프 색인 세대 (0.7.0)

D41은 GraphRAG 색인을 과제별 제안층으로 두고, 이 색인은 원문에서 다시 만들 수 있지만 모델 출력이라 결정론적
재생물이 아니라고 적었다. 그래서 받아들인 조각을 과제 project store에 세대로 보존하고, 그래프 DB는 여기서 적재한다.
이 조각은 검색 자산일 뿐이다. FABLE A6가 말한 `30_프로젝트맥락`의 관찰·검토 후보 기록은 별도 writer가 만든다.
세대는 byte 동일하게 다시 만들 수 없으므로 복구에는 백업이 필요하다. project store의 실제 백업 분류는 그 계약 owner가
정한다(미정).

- 위치(Plan 17 `20_문서검색`, 사람이 검토한 관계가 아니라서 `30_프로젝트맥락`에는 쓰지 않는다):
  `본문·표_추출/generations/<id>/<문서>.json`(준비 문서), `검색_색인/generations/<id>/fragments/<문서>.json`(조각)과
  `generation.json`(세대 manifest), `원문위치·추출품질/generations/<id>/coverage.json`(coverage·변경·추출 기록).
  현재 세대 포인터는 `00_프로젝트_안내/graph_index_current.json`이다.
- binding: store root의 `graph_index_binding.json`(호출자가 sha256으로 고정; estate에서는 `bindingAddress`, 0.18.0). 과제 ref·파일시스템 키·ACL·쓰기 권한·
  exact grant(경로+해시)·선택적 admission(경로+해시)·source root 표(store 밖만)·그래프 binding·profile pin(id·판·schema 해시)을 담는다. 요청은
  actor·과제·목적·세대 ID·expected prior만 준다.
- 갱신 `updateGraphIndex`: 잠금 → expected prior → grant·ACL 재검증 → 원본 준비와 이전 coverage 대조 → 모델·도구
  판본 probe → 추가·변경 문서만 추출. 불변 문서는 profile·모델·도구 판본이 같고, 조각의 원문 해시가 새로 준비한
  문서와 같으며, 조각이 온전할 때만 이전 세대 파일을 (경로, 해시)로 참조한다. 추출은 한 번에 문서 50개·단위 2,000개·
  8백만 글자까지 묶어 나눠 부르고, binding의 `max_calls`는 한 갱신 전체의 상한이다. binding `graph.extraction_batch`
  `{ documents?, units?, characters? }`는 이 상한을 **낮추기만** 한다(0.18.1): worker 호출 하나가 timeout 하나를 지므로
  느린 모델 host에는 더 긴 대기가 아니라 더 작은 호출을 준다(상한을 넘긴 호출은 그때까지 뽑은 청크를 전부 잃는다.
  2026-09-13 실자료 1단계가 153단위 한 호출로 1시간 상한에 걸려 HOLD된 것이 계기). 이어서 create-only 쓰기 → 전 파일
  해시 재확인 → 포인터를 옆에 쓰고 동기화한 뒤 이름 바꾸기 순서다. 결과는 COMMITTED, UNCHANGED(재실행, 추출 0),
  HOLD(원본 누락·예산 초과·추출 degraded·prior 불일치·잠금·권한·무결성·실자료 등급)이다. HOLD는 현재 세대를 바꾸지
  않고, 모델·도구 판본이 바뀌면 이전 조각을 섞지 않고 전부 다시 추출한다. manifest에는 grant·ACL 해시·writer 차수가 남는다.
- 잠금: `00_프로젝트_안내/graph_index.lock`에 잡은 쪽(프로세스 번호·시작 시각·작업·actor)을 적는다. 잠금을 쥔 프로세스가
  죽으면 파일이 남아 다음 갱신이 `graph_index_locked`로 멈춘다. 그 프로세스가 더 없는지 확인한 뒤 운영자가 파일을
  지운다. 자동으로 빼앗지 않는다. 남의 잠금은 절대 지우지 않고, 풀기에 실패하면 `graph_index_lock_lost`로 알린다.
- 복구 `selectGraphIndexGeneration`: 검증된 이전 세대를 같은 잠금·prior 규칙으로 다시 고른다. 지금 binding의 grant로
  만든 세대만 고를 수 있다.
- 읽기 `openGraphIndex`: 현재 세대의 문서·조각을 해시로 다시 읽는 read view다(검색·그래프 적재용). 세대를 만든 grant가
  지금 binding의 grant와 다르면 `graph_index_grant_changed`로 거부해, 좁혀지거나 철회된 grant 아래서 예전의 넓은 세대가
  읽히지 않는다(새 grant로 갱신하면 남은 문서는 참조로 이어진다). 읽는 actor의 ACL이 세대의 모든 자료 등급을 허용해야
  한다. `assertCurrent`는 포인터·binding·권한이 바뀐 view를 거부한다.
- 아직 없는 것: 그래프 DB 적재·검색(설치 뒤), 참조 중인 파일을 지키는 오래된 세대 정리 규칙.

## 그래프 데이터베이스 적재·검색 (0.9.0)

`materializeGraphIndex({ view, binding })`가 선택된 세대를 그래프 데이터베이스에 적재하고,
`createGraphSearch({ view, binding })`가 그 세대를 vector·hybrid·graph 확장으로 검색한다. 둘 다 worker 안에서
neo4j-graphrag의 writer와 retriever를 쓰고, 이 APP은 그 둘레의 계약만 소유한다.

- binding: 색인 binding의 `graph.neo4j = { uri, user, password_file, database? }`. 주소는 loopback `bolt:`/`neo4j:`만
  받고, 비밀번호는 신뢰된 설정이 지정한 **파일 경로**로만 온다(절대경로·실파일·심링크 아님·실경로 일치). 요청은
  주소도 비밀번호도 줄 수 없다. `neo4j`가 없으면(`null`) 색인은 그대로 만들어지고 적재·검색만 연결 없음을 알린다.
- 한 데이터베이스 = **과제마다 한 세대**(0.20.0). 같은 세대를 다시 적재하면 아무것도 바뀌지 않고
  `generation_already_loaded`로 답한다. 같은 과제의 다른 세대는 **그 과제의** 이전 세대를 대체한다(두 세대가 함께
  있으면 모든 청크가 두 벌이 된다). 다른 과제의 노드는 읽지도 지우지도 않는다 — 적재는 `(sf_project, sf_generation)`
  짝만 지우고 쓴다.
- 과제 격리가 서는 자리가 컨테이너 경계에서 **연산이 선언한 범위**로 옮겨졌고, 검사는 그대로 남았다.
  - `graph_project_mismatch`: 다른 과제가 이미 쓰고 있는 세대 이름을 요청하면 거부한다(적재·검색·연결 세 경로 모두).
    "없는 세대"로 답하면 이름이 남의 것이라는 사실이 "거기 아무것도 없다"로 읽히기 때문이다.
  - `graph_other_project_changed`: 적재는 자기 것이 아닌 노드 수를 적재 전후로 세고, 그 수가 움직이면 성공으로
    보고하지 않는다. 도구 writer가 남기는 임시 표식은 데이터베이스 전체에 걸리므로, 새긴 결과가 받은 범위와 같은지를
    가정하지 않고 확인한다.
  - `__SfMaterializeLock__`: 적재 한 번이 DB 안 잠금 노드 하나를 쥔다. 두 과제가 동시에 적재하면 서로의 갓 쓴 노드에
    자기 과제를 새길 수 있기 때문이다.
  - 벡터 색인 `sf_chunk_vector`는 `WITH [n.sf_project, n.sf_generation]`으로 **필터 속성을 선언**하고, 검색은
    Cypher 25 `SEARCH n IN (VECTOR INDEX … WHERE n.sf_project = $p AND n.sf_generation = $g LIMIT $k)`로 범위를
    색인 안에서 건다(2026.02.3 실측: 등식 두 개를 AND로 묶는 것까지. `IN`은 2026.06 필요). 필터 속성이 없는 옛 색인은
    과잉 조회 뒤 걸러내며, 어느 쪽이었는지와 무엇이 빠졌는지가 receipt `retrieval`에 남는다(`filter_stage`,
    `fulltext_starved`). 전문검색 색인에는 필터 속성이 없으므로 그쪽은 언제나 과잉 조회 뒤 걸러낸다.
  - 차원이 다른 벡터 색인이 이미 있으면 `graph_vector_index_dimension_mismatch`로 거부한다. 드롭하면 그 DB에 있는
    **다른 과제들의** 검색 벡터까지 함께 사라지기 때문이다.
- 설치된 writer는 노드를 `CREATE`로 쓰고 관계에 APOC(`apoc.merge.relationship`·`apoc.create.addLabels`)이 필요하므로
  **APOC core가 있어야 한다**. writer는 자신이 만든 노드를 임시 식별자(`__tmp_internal_id`)로 표시하므로, 적재 전에 그
  잔여를 먼저 확인하고(있으면 거부), 적재 직후 그 표시가 살아 있는 동안 과제·세대를 새기고 표시를 지운다.
- 그래프는 과제 store 세대에서 다시 만들 수 있는 파생 투영이다(`runtime_local`). 내구 자산은 세대이고, 복구는
  "세대 → 재적재 → 같은 그래프"다. 살아 있는 DB 파일은 컨테이너의 named volume에만 둔다.
- 검색이 돌려주는 것은 (문서, 단위) 쌍과 점수뿐이다. 그 쌍이 이 view의 해시 검증된 manifest에 있을 때만 hit이 되고,
  없는 행은 버리고 센다(`receipt.not_in_generation`). 색인은 데이터베이스 전체에 걸리므로 세대 밖 행도 같은 자리에서
  걸러진다. graph 확장은 씨앗 청크에서 그 청크의 대상이 어휘 관계가 아닌 관계로 닿는 청크까지, 그리고 그 대상이
  명시적으로 가리키는 문서(`REFERS_TO`)의 청크까지 넓힌다. 유입 청크는 `seed=false`로 표시되고 **자기에게 닿은 씨앗들 중
  가장 높은 점수**를 물려받아 씨앗 뒤에 온다. **씨앗은 자기 vector 점수를 그대로 쓴다** — 다른 씨앗이 유입 경로로 같은 청크에
  닿아도 올리지 않으므로 씨앗끼리의 순위는 vector 순위와 같다. 넓힐 간선이 하나도 없으면 graph 모드는 vector와 같은 결과를 돌려준다.
- `hybrid`의 전문검색 쪽은 질의 문자열을 Lucene 질의로 파싱하므로 예약문자(`+ - ! ( ) : ^ [ ] " { } ~ * ? | & \ /`)를
  이스케이프한 뒤 넘긴다. 사용자 질문은 검색 문법이 아니어서, 이스케이프 전에는 `10/30` 하나로 모드 전체가 실패했다
  (Lucene 파스 오류). **의미 변화**: 이 문자들은 연산자가 아니라 문자 그대로 검색된다. vector 쪽은 질문 원문을 그대로 임베딩한다.
- **명시적 참조 연결 (0.18.3)**: `linkExplicitReferences({ view, binding, identifiers, rule, apply })`가 규칙
  하나(`L1-linear-identifier`: 대상 노드 `name`이 `^SON-\d+$`이고 같은 세대·과제 문서의 식별자와 같을 때)로
  `(대상)-[:REFERS_TO {sf_rule, sf_token, sf_source_unit_id, sf_source_doc_key, sf_generation, sf_project,
  sf_claim_state:'observed'}]->(:Document)` 간선을 **더한다**. `apply:false`면 후보만 돌려주고 아무것도 쓰지 않는다.
  MERGE라 재실행해도 같은 간선이 하나이고, 노드는 병합·재라벨·수정되지 않는다(청크별 출처가 인용의 근거이므로
  이름이 같다는 이유로 노드를 합치지 않는다). 자기 문서 참조는 제외하고, 대상은 이 view의 manifest가 가진 문서여야
  한다. 식별자 지도는 문서 `facts`에서 APP이 읽어 넘긴다(데이터베이스가 사실을 해석하지 않는다). 간선은 파생 투영에만
  있으므로 세대를 다시 적재하면 사라지고 같은 호출로 다시 만들 수 있다.
- 텔레메트리: Python driver는 `telemetry_disabled=True`로 연결한다. 서버 쪽은 판본의 설정으로 끄고 `SHOW SETTINGS`로
  되읽어 확인한다(실제 설정 이름과 관측값은 런타임 영수증에 있다).
- 시험: 단위 시험은 이름을 밝힌 가짜 데이터베이스로 binding 거부·세대 경계·중복 적재를 본다. 실제 시험은 opt-in
  (`SOULFORGE_TEST_GRAPHRAG_PYTHON`, `SOULFORGE_TEST_GRAPHRAG_LLM`, `SOULFORGE_TEST_GRAPHRAG_EMBEDDER`,
  `SOULFORGE_TEST_NEO4J_URI`, `SOULFORGE_TEST_NEO4J_PASSWORD_FILE`)이며 합성 메모로만 돈다.

## 맥락이 작업 맥락 조립 (0.8.0~0.9.0)

`composeWorkingContext({ view, request, binding })`는 선택된 그래프 색인 세대(`openGraphIndex` view) 위에서 v0.9 §4 B
흐름을 돈다. 요청은 요청 원문·작업 목적(선택: 더 낮은 예산)만 준다. 과제·권한·세대는 view가, 모델 주소는 신뢰된
binding이 정한다. 예산 상한은 프로그램 상수(`PLANNER_BUDGET_CEILING`)이고 profile 값은 그 아래 기본값이다.

- 맥락이(로컬 모델)가 하는 일: 요청의 산출물·대상 파악, 확인 질문, 질문별 검색 방식 선택
  (lexical·exact·vector·hybrid·graph), 근거 충분성 판단과 추가 검색 요청, 절별 문장 작성. 검색과 읽기만 도구로
  열려 있고 검색은 프로그램이 실행한다.
- 프로그램이 하는 일: 검색 실행(lexical = 공유 BM25 `bm25-v1` 기준판 A, exact = 목록의 item id,
  vector·hybrid·graph = 그래프 데이터베이스 몫이라 binding이 없으면 `not_connected`이고 다른 방식으로 대체하지
  않는다), 근거는 해시 검증된 색인의 원본 단위에서만 가져온다(출처 종류·항목·단위·
  locator·시각·판본). 인용 강제는 근거 id가 없거나 없는 id만 단 fact·claim을 해석으로 낮추고 개수를 남긴다.
  나머지는 source 종류별 coverage(`connected`·`not_connected`·`none_in_scope`, 검색 여부·hit·본문 사용 수),
  Rune 절(Rune이 아직 연결되지 않아 `not_run`, 사유 `rune_not_connected`), 추가 검색 검토 결과(`review`: ok·skipped·
  failed·not_run), 예산·trace(해시·크기·중단 사유·시간·토큰만)다. `unknown`(미확인) 문장은 근거가 없다는 것 자체를 말하는
  종류라 해석으로 낮추지 않는다. 산출물·질문·부족 사유·남은 질문은 모델이 쓴 계획 문장이라 인용 강제 밖이며
  `uncited_model_text`에 그 필드를 적는다.
- 로컬 모델은 `node:http` 기반 loopback 전용 client로 부른다. proxy 변수를 쓰지 않고, 되돌림(3xx)은 prompt를 다른
  곳으로 다시 보내므로 따라가지 않고 `chat_redirect_refused`로 끝낸다. `-cloud` 모델은 `chat_model_not_local`로 거부한다.
- 말하는 방식은 binding의 `transport`가 정한다(기본 `ollama`, 0.18.2). `openai_chat`은 llama.cpp·vLLM 같은 OpenAI
  호환 서버에 붙어 `/v1/chat/completions`를 부른다. 출력 schema는 `response_format: json_schema`, 생각 스위치는
  `chat_template_kwargs.enable_thinking`, 표본 설정은 최상위 `temperature`·`seed`·`max_tokens`로 가며 `keep_alive`는
  이 경로에 자리가 없다. 답은 `choices[0].message.content`이고 `reasoning_content`는 본문에 섞이지 않아 길이만 센다.
- 이 경로에는 가중치 digest가 없다. 판본은 `/v1/models`의 제공 id와 `/props`(`model_path`·`model_ftype`·`build_info`·
  `n_ctx`)를 함께 해시한 값이고 종류를 `llm_pin_kind: server_props`로 적는다. `/props`가 없으면 제공 id만으로
  `served_id`다. 어느 쪽도 가중치 digest가 아니므로 그렇게 읽히지 않게 종류를 판본과 같이 남긴다(같은 경로에 다른
  가중치를 두면 잡지 못한다). 해시에 들어간 모델 경로는 host-local 절대경로라 결과에는 나오지 않는다. 규칙은
  worker의 `openai_model_pin`과 같고, 두 해시의 표준형이 달라 서로 비교하지는 않는다.
- 출력 `soulforge.context_pack.v2`: 9항목 중 1~5는 절(배경·업무 이력·결정 변화·재사용 자료·영향과 먼저 확인할 것),
  6은 문장 kind(확인 사실·자료의 주장·해석·미확인), 7은 근거 목록, 8은 검색 기록·coverage·남은 질문, 9는 Rune 절이다.
  `content_sha256`은 시간·trace를 뺀 내용 digest라 같은 입력을 비교할 수 있다. 조회는 아무것도 쓰지 않는다.
- 예산: 모델 호출·검색 회차·회차당 검색·근거 수·근거 글자 수. profile은 프로그램 상한 아래 기본값이고, binding과
  요청은 그 값을 낮추기만 한다.
  마지막 호출은 조립용으로 남기고, 예산이 다하면 `partial`과 답하지 못한 질문을 돌려준다. `as_of`는 현재
  세대만 있어 거부한다(`as_of_not_supported_by_graph_index`). 조회 중 색인 포인터가 바뀌면 거부한다.
- profile(`profiles/context_planner_v1.mjs`)은 prompt·출력 schema·기본 예산을 담은 실험 설정이다. 인용 강제·coverage·
  claim ceiling은 profile이 바꿀 수 없다.
- 시험: 단위 시험은 이름을 밝힌 가짜 로컬 모델 응답으로 프로그램 쪽 규칙을 본다. 실제 모델은 opt-in
  (`SOULFORGE_TEST_CONTEXT_PLANNER_LLM`)이며 합성 색인으로만 돈다.

## 작업 맥락 보조 역할 — 구현 계획

Owner가 정의한 최종 역할은 새 요청과 작업 목적을 받아 관련 과거 기록을
찾고 확인하여 배경·진행·제출 이력·자료·방법·미확인 사항을 근거와 함께
반환하는 것이다. 상위 업무 agent가 전체 작업을 수행하고, 맥락 보조는
그 판단에 필요한 정보를 준비한다. 같은 로컬 모델 서버를 사용할 수
있지만 요청 문맥·도구·한도는 분리하고 상위 대화를 복제하지 않는다.

현재의 observed query는 제한된 문구 선택이며 위 의미 기반 조사 과정의
완료 증거가 아니다. 권한·출처·판본·수락 조회와 설치·복구 기반을 유지하고,
의미 추출·현재 자료 연결·검색 계획·추가 조회·정보 종합을 별도로 연결하고
실제 업무 결과로 검증해야 한다. 관련 계획과 현재/미완료 상태는
`docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`가 소유한다.
프로필·호스트·Bot Chat 등 실제 신원은 private 계획/설정에만 둔다.

## 공개 호출

```text
node guild_hall/context_engine/src/app.mjs --root <approved-synthetic-root> --binding-sha256 <exact-pin> --request-json '<request-json>' --synthetic-only
```

`createContextEngineRuntime({root,bindingSha256,syntheticOnly})`를 사용하며 기본은 off다.
일반 query가 parser 준비·수락·persistent writer·복구를 자동 호출하지 않는다.
`--operation update`는 승인된 source snapshot과 별도 수락 기록 snapshot에서
새 파생 세대를 만들고, `--operation select`는 예상 이전 pin과 배타 lock 아래
code/data를 하나의 current로 선택한다. 모든 실행은 명시적 synthetic binding만 받는다.
두 전략의 기계적 차이와 실제 소비 응답의 품질 평가는 별도로 판정한다.
