# 자동 정리본 지식 층

Owner 방향에 따라 Neo4j와 주입식 보존 파일을 사용하는 자동 정리본 모듈을 단계적으로 만든다.
기존 처리 경로에 자동 연결하지 않는다. Rune와 정본 승격은 후속 별도 소비 경로다.

현재 K0: 공개 합성 2과제·3원천·6질문을 기존 answer_eval로 평가한다.
`node guild_hall/context_engine/harness/knowledge_layer_eval.mjs`는 제목 baseline과 원문 reference의
배선 점수를 출력한다. 실제 모델 품질·그래프 기여·운영 완료를 뜻하지 않는다.
검사: `npm run validate:knowledge-layer`. 새 시험은 done:check 양쪽 목록에 포함된다.

## 이력 CLI

이력 작성은 파일 인계로만 실행한다. 고정 초안 형식과 사용법은 [HISTORY_DRAFT_FORMAT.md](HISTORY_DRAFT_FORMAT.md)가 소유한다.

- `history_cli.mjs --prepare`: 다시 쓸 칸을 선택하고 자료·맥락 packet과 manifest를 저장한다.
- `history_cli.mjs --finalize`: 외부 초안 JSON 전체를 검사한 뒤 출처 줄·새 판·현행 head를 저장하고 위층 갱신 대상을 반환한다.
- 직접 모델 호출, HTTP 연결, subprocess, Hermes 호출, 프로필·예약 등록은 하지 않는다. 이전 `--run`, `--binding`, `--retry-days` 등 모델 실행 인자는 거부한다.

입력은 기존 `{project,month,as_of?,records}`와 표시 metadata다. 원천은 호출자가 승인한 목록만 사용하며
originrefs의 경로를 자동으로 열지 않는다. 저장 폴더는 한 과제·한 달 전용이고 주입받는다.
AI 업무메모 종류/역할은 기존 정규화 경계에서 거부한다. 외부 초안은 문장과 허용 근거 번호만 제공하며,
코드가 원자료와 하위 문장의 근거를 연결한다. 번호 연결은 의미 검증이나 사람 수락이 아니다.

기존 입력 정규화·지문·불변 cell/head 보관·화면 렌더러를 재사용한다. source/하위 판/규칙이 그대로면
다시 쓰지 않으며, 준비 단계의 head 지문과 입력·규칙을 finalize에서 재대조한다. 같은 준비 묶음의
초안을 모두 검사한 뒤 head를 한 번 갱신한다. 오래된 초안·다른 근거·일부 누락은 거부한다.
변경된 일별 칸의 위층은 현재 판에서 제외하고 과거 불변 판은 보관한다. 작성 전 위층은 `작성 대기`로 보인다.
동일 초안 재제출은 무변경이다. 미사용 근거 개수는 내용 완전성 검토에 남긴다.

PLAUD 원제목·녹음 시각·발화 번호/구간·녹음/전사 링크는 표시 metadata와 보존된 source refs에서 붙인다.
작성자는 이 값을 새로 만들지 않는다. 후보 귀속·미확인 발화자·없는 정보는 표시한다.
음성 근거 줄은 카드가 읽은 전사를 `PLAUD 전사`·`자체 전사`·`자체 전사(PLAUD 없음)`·`자체 전사(PLAUD 사용 불가)`(PLAUD 모드에서 whisper로 대체)로
적는다. whisper·plaud 밖의 출처 값은 `전사 출처 미상`이다. 값은 표시 metadata(`voice_sources.transcript_source`·`transcript_fallback`)에만 있고 입력 record·지문에는 넣지 않는다.
선언이 없는 옛 카드는 `자체 전사`다. PLAUD 카드(`transcript.source: "plaud"`)는 세션 루트 `transcript.jsonl`을 읽는다.
보는 판은 같은 칸 안에서 근거 번호 집합(원천·하위 기록)이 똑같은 문장을 첫 문장 자리의 한 문단으로 묶고
근거 줄을 한 번만 보인다. 한 문단은 6문장·600자를 넘지 않으며 넘치면 다음 같은 근거 문장부터 새 문단이다. 근거가 다르거나 없거나 검토 표시가 있는 문장은 따로 둔다. 저장 cell·초안·지문은 그대로다.
메일 사본의 표시상 근거 합치기와 첨부/Slack 이름 표도 기존 렌더 규칙을 사용한다.

### 원천 준비

`src/history_prepare_cli.mjs --prepare --project <CODE> --date YYYY-MM-DD
--sources <absolute JSON> --output-root <existing private directory>`로 수집 보관본을 고정한다.
날짜 기본값은 KST 어제, `--from-date` 기본값은 대상 월 첫날이다. 과거 월은 별도 출력 폴더를 쓴다.
메일은 귀속 색인, Slack은 지정 채널, Linear는 정확한 과제 ID, 음성은 지정 카드의 발화 연결과 철회 규칙을 따른다.
음성 `first_candidate` 정책은 카드 구간의 첫 과제 후보가 이 과제인 것(약·강 모두)과 사람 확정분을 넣는다.
후보가 없는 구간은 같은 날 규칙(`history_voice_attribution.mjs`, `same_day_context.v1`)으로만 들어온다:
검증된 카드·다른 과제 언급 없음·사람 확정/후보 없음이고, 그날 이 과제의 서면 자료가 1건 이상이며,
발화 원문이나 녹음 원제목이 과제 코드·`same_day_context.project_terms` 또는 그날 서면 자료 참여자 이름
(메일 표시 이름·Slack 이름의 앞 한글 3~4자, `exclude_participants` 제외)과 글자로 일치할 때다.
귀속은 `weak_same_day_context`이고 이유는 source ref `attribution_reason`에 남는다. 그 구간의 같은 날 발화만 넣는다.
규칙은 `same_day_context.peers`(다른 과제의 mail/slack/linear 설정 목록, 비어 있어도 됨)가 있을 때만 켜진다.
같은 창의 peer 서면 자료로 같은 판정을 해 한 과제라도 더 일치하면 모호(`ambiguous`)로 넣지 않고, peer lane을
읽지 못하면 `peer_unverified`로 넣지 않는다. 정확히 한 과제만 일치할 때만 약하게 귀속한다.
나머지는 voice 영수증 `same_day`(귀속·미귀속·서면 자료 없는 날·불일치·모호·peer 확인 불가·전사 확인 불가)에 센다.
`confirmed` 정책과 설정이 없거나 `false`일 때는 쓰지 않는다. 새로 귀속된 음성이 없는 날의 record와 지문은 그대로다.
카드가 아직 없는 녹음은 건너뛰고 `sessions_without_card`로 센다. 창 안에 카드 있는 녹음이 하나도 없고 카드 폴더
어느 것도 실제 녹음을 가리키지 않으면 `history_voice_cards_root_unmatched`로 멈춘다(잘못된 cards_root 방지).
메일 월 파일은 한 줄씩 읽고 전체 파일 한도를 두지 않는다. 한도는 선택된 사건에만 건다: 사건 한 줄 `max_line_bytes`
(기본 4 MiB, 최대 64 MiB), 선택 합계 `max_bytes`(기본 256 MiB). 스레드 id 없는 메일은 `thread_ref`를 두지 않는다.
Slack custody HOLD는 되돌릴 수 없는 사건별 제외이므로 그 사건만 빼고 센다(`held`·`held_time_unknown`), 창 전체를 막지 않는다.
메일 폴더의 첫 월 파일보다 이른 달은 `mail_not_collected_before:<YYYY-MM>`(메일 영수증 `not_collected`)로 남기고 막지 않는다.
첫 월 파일 뒤의 빠진 달은 계속 `mail_event_files_missing` 보류다. 같은 메일 사본의 빈 본문은 비지 않은 사본을 쓰고,
모두 비면 하나를 `empty_body_all_copies`로 표시해 남기며 `duplicate_empty_copies`로 센다.
Slack이 없는 과제는 sources 파일에 `"slack": {"project": ..., "none": true}`(또는 `channels: []`)로 적고 `slack_not_configured`로 남는다.
AI 메모 제외, 원천 해시, 읽기 한도, 네 원천의 누락/오류 차단은 유지한다. 현재 수집의 완전성을 보증하지 않는다.

준비 기준판은 **고정한 원천 입력**만 가리키며 초안 작성 완료를 뜻하지 않는다. `source_frozen`은 항상
input_file을 돌려준다. 원천 변경일이 비어 있어도 이력 `--prepare`는 최종 작성된 cell 지문으로 미작성 칸을 판단한다.
새 빈 날짜는 `no_sources`로 보고하고, 기존 자료를 빈 입력으로 조용히 지우지 않는다.
이 단계도 모델·봇·운영 설정·DB·예약 작업을 실행하거나 바꾸지 않는다. 프로필은 외부 실행 담당자가 구성한다.

## K1 승인 근거 연결

`linkApprovedUnits({project_ref,units,grant,now})`는 caller가 이미 승인한 목록만 처리한다.
grant는 project_ref/grant_id/epoch/expires_at/units를 가지며 각 허용 unit은 unit_id,
exact source_revision_ref 4필드, locator, text_sha256으로 고정한다. unit에는 source_kind
(mail/voice/document), 원문 text와 해시, occurred_at/known_at을 보존한다. 시각은 UTC 밀리초 ISO다.
완전한 목록만 받으며 일부 생략·중복·과제 혼입·판본/해시/locator 변조·만료는 전체 거부한다.
결과는 불변 source_digest·span binding·원문 단위·coverage다. 빈 목록은 삭제 지시가 아니다.
파일/네트워크/DB를 읽거나 source 승인을 발급하지 않는다. grant는 신뢰된 caller의 승인 증언이다.
전체 source bytes hash는 보존만 하며 실제 검사하는 것은 제공된 unit text의 UTF-8 hash다.

## K2 후보 검사

`checkKnowledgeCandidates({bundle,candidates,now})`는 K1 bundle을 다시 검증한다. candidate는
statement_id/unit_id/text/quote/impact_kinds/claim 필드만 받는다. claim은 null 또는 subject/key/value의
검증되지 않은 lint 후보다. text와 원문 속 quote가 NFC·공백 정리 뒤 같을 때 위키에 사용할 수 있다.
이는 출처가 그 문장을 말했다는 확인일 뿐 의미적 사실 검증·수락은 아니다. 자유 재서술은 미확인이다.
결정/마감/금액/대외 약속 표지를 모델 태그와 합쳐 검사하고 근거가 약할 때만 exception_required를 낸다.
구조화 claim은 항상 unverified_lint_candidate이며 사실로 승격하지 않는다. 실패 문장을 수정하지 않는다.
source 부족·짧은 인용·부정/수치 변경은 원문과 함께 그대로 사유를 반환한다. DB/모델 호출은 없다.

## K3 자동 위키 초안과 저장

`createWikiKnowledgeLayer({graph,archive,generator})`가 지속 쓰기를 소유한다. 별도 store/DB를 찾아 연결하지 않는다.
`generate({request,withdrawals,expected_previous})`의 request는 K1 입력 그대로이며 withdrawals는
`withdrawalFingerprint(text)`의 과제별 철회 지문, expected_previous는 직전 generation hash 또는 null이다.
source 단위가 없는 입력·문장이 없는 모델 응답은 HOLD이며 기존 페이지를 덮지 않는다.
topic이 없는 기존 응답은 과제 전체 1페이지+원천 entity별 페이지를 유지한다. topic이 하나라도 있으면 과제 전체+topic별 페이지를 만들고 원천은 재료 목록으로 보존한다.
인용 실패·철회로 정리본에서 제외된 문장의 모델 예외·모순도 과제 페이지와 해당 topic/원천 페이지 확인 필요에 보존한다.
topic 페이지의 materials.statement_ids는 그 페이지에 실제 포함된 문장만 기록한다. 색인은 topic 제목과 안정 ID를 함께 표시한다.
위 칸은 현재 정리본, 아래 칸은 추가 전용 기록이며 매번 불변 새 판이다. 실패 문장은 현재 페이지에서 제외한다.
모순·빈틈은 모델의 review 출력이다. 예외는 모델 보고와 K2와 동일한 고정 KO/EN 표지 바닥의 합집합이다.
인용 대조 성공·claim 없음이면 text와 quote가 달라도 source_attributed다. 인용 실패 또는 구조화 claim이 있으면 weak다.
source_attributed는 quote의 출처 귀속만 뜻한다. text의 의미 지지·사실성은 model_responsibility_unverified이며 자동 수락하지 않는다.
weak이고 결정/마감/금액/대외 약속 표지가 있으면 예외를 더한다. 재서술을 거부하거나 사실로 판정하지 않는다.
각 페이지는 해당 원천의 예외 사유·문장 참조와 모순을 `확인 필요`, 빈틈을 `빈틈` 절에 표시하고 없으면 `없음`을 적는다.
K4 이후의 기억/검색/별칭/열린 일은 아직 구현하지 않았다.

`readCurrent`도 같은 입력 계약을 요구한다. caller의 현재 source digest 또는 보존된 철회 집합이 다르면
옛 페이지를 현행으로 반환하지 않는다. `restore({input,generation_id})`는 archive hash·과제·현재 source/철회를
검사한 뒤 재적재한다. 복구에도 archive의 철회 파일을 함께 보존해야 한다. 정정 때 caller가 새 grant/판본을
공급하지 않으면 이 모듈은 외부 변화를 탐지할 수 없다. 원천의 실제 변화 탐지는 연결 스레드 책임이다.

### Adapters와 설정

- `createMemoryGraph/createMemoryArchive`: CI 가짜. 실제 Neo4j 성능·잠금 검증을 대신하지 않는다.
- `createFileArchive({root})`: 이미 존재하는 승인된 절대 디렉터리를 주입. generation hash.json과 페이지별
  hash.md/색인.md, 과제별 withdrawal marker를 create-only로 보존한다. 원문 파일은 수정하지 않는다.
  snapshot은 재적재 꾸러미, Markdown은 재생 가능한 표시물이다. root는 신뢰된 전용 archive여야 한다.
  선택 onWriteStart 콜백은 사전 검증·독점 파일 열기가 성공한 뒤 첫 바이트 쓰기 직전에 호출된다.
  이 시점에는 빈 파일이 생성되었으므로 이후 실패도 부분 쓰기로 취급한다. 검증 실패·open 거부·기존 파일 재사용은 알리지 않는다.
- `createNeo4jGraph`: enabled 기본 false, loopback Query API endpoint, namespace, 정확한 allowed_origins,
  timeout_ms(1~60000) 필요. 인증이 필요하면 승인된 fetchImpl이 헤더를 공급한다. 이 모듈은 secret/env를 읽지 않는다.
  시험은 test_only=true를 주며 생성 시 kl-test- 접두를 요구한다. 기본 false는 일반 adapter 계약이며 시험 실행은 반드시 true다.
  세 가지 사전 unique constraint가 필요하다: KLProject(namespace,project),
  KLGeneration(namespace,project,generation), KLNode(namespace,project,generation,node_id).
  자동 schema 설치 없음. endpoint는 Neo4j Query API `/db/<database>/query/v2`다.
  HTTP 성공 코드만 믿지 않고 body errors/data를 검사한다. 고정 Cypher+parameters만 사용한다.
- `createBoundedGenerator`: enabled 기본 false, id와 max_calls/max_input_characters/max_output_characters/timeout_ms
  모두 필수다. generate는 세션의 호출수를 실제로 세며 실패 시도도 소비한다. createSession으로 새 작업의
  한도 세션을 시작하며 K3는 새 세대당 새 세션에서 최대1회 호출하고 시간/입출력 상한을 다시 적용한다. id는 caller 표식이며
  실제 weight digest를 검증한 증거가 아니다. 공급 함수는 신뢰된 in-process adapter다.
- `createHttpGenerator`: 기본은 loopback. 역할 설정에서 명시한 project/role/data_class/egress policy가 있고
  exact origin allowlist도 맞을 때만 외부 호스트를 허용한다. redirect 거부,
  AbortSignal·응답 상한·JSON 검사. K3는 구간에 매달리고 인용은 검증기로 대조하며 K2는 별도의 더 엄격한 호출자다.
  별도 환경/자격증명 자동 탐색 없음. 실제 호출은 기본 꺼짐이다.
- 임베더는 K5 단계 대상이며 K0~K3에서는 호출하지 않는다. 사람이 넣는 파일은 연결 담당이 K1 단위로 전달한다.

### 그래프와 한계

물리 labels는 KLProject/KLGeneration/KLNode, edge는 KL_LINK(kind)다. NODE_KINDS/EDGE_KINDS의 닫힌 목록을 쓴다.
각 노드에 namespace/project/generation/origin/state가 있고 공식 수락 flag는 false다. 원천/추출 node 9종과
7관계의 기존 profile은 변경하지 않는다. 모델 노드와 deterministic projection은 origin으로 구별한다.
expected-prior를 먼저 확인→archive 보존→graph CAS→철회 marker 확정 순서다. 실패한 graph commit은 기존
current 읽기의 철회 상태를 바꾸지 않는다. 미완료 snapshot의 철회 intent는 current가 아니지만, graph 손실 후
구판 restore는 그 intent까지 대조해 미확정 철회를 부활시키지 않는다(복구 HOLD 해소는 재시도/후속 K8 책임).
graph 성공 뒤 marker 쓰기 실패는 graph_committed와 withdrawal_archive_pending으로 보고하며 재시도가 확정한다.
Neo4j CAS 불일치는 같은 implicit transaction에서 오류를 발생시켜 초기 MERGE/lock까지 rollback한다.
graph current와 archive는 단일 DB transaction이 아니므로 reader가 매번 둘을 재검사한다. 타 프로세스가 쓰는 신뢰되지 않은 archive root는
지원하지 않는다. 이 디렉터리의 무결성·접근 통제·백업 책임은 binding owner다.
현재 작업 기록은 세대200개, plain-data 검사는 전체문자500,000의 안전 상한이다. 넘으면 거부하고 조용히 자르지 않는다.

### 시험과 시연

`npm run validate:knowledge-layer`는 가짜 모델/메모리 graph, 임시 file archive와 전송 모의 시험을 실행한다.
같은 저장 계약을 실제 Neo4j로 실행하려면 `SOULFORGE_KL_TEST_DISPOSABLE=1` 및
`SOULFORGE_KL_TEST_NEO4J_URL`을 명시한다. 운영 인스턴스 사용 금지: 사전 constraint가 있는 disposable loopback
인스턴스만 사용하고, 시험은 임의 kl-test namespace에서 돌며 finally에서 그 namespace만 제거한다.
opt-in 없이는 SKIP이며 실제 DB 실행으로 보고하지 않는다. secret은 시험에서도 읽지 않는다.
개발 시연은 빈 승인 출력 디렉터리를 주고 `node guild_hall/context_engine/harness/knowledge_layer_demo.mjs <owned-output>`.
과제 2개 위키8페이지+색인2개와 평가 JSON을 만든다. found는 제목 baseline 0→생성 위키 1, 원문 reference 1이다.
셋 모두 cited=1/errors=0이다. 결정적 가짜의 배선 확인이며 모델 품질 향상이 아니다.

공개 참고: [Neo4j Query API](https://neo4j.com/docs/query-api/current/query/)의 원자적 query/parameters/errors 계약.
GBrain은 고정 d13aa742의 synthesize/synthesize-verify/withdrawal 개념만 참고했다. 옮긴 외부 코드 없음.

## 역할별 모델 설정과 위키 운영 규칙 (Owner 추가 방향 9~12)

### 승인된 실제 입력의 수동 위키 하네스

`harness/knowledge_layer_real_wiki.mjs`는 한 과제의 귀속된 메일을 K1 승인 단위로 준비하고,
외부에서 받은 모델 답 파일을 K3로 재생한다. 모델에 전송하는 기능은 없으며 실제 전송은 별도 승인된 caller 책임이다.

- `prepare`: `--project`, `--attribution-index`, `--hiworks-events`(반복 가능), 선택 `--gmail-sent-events`,
  빈 `--out`, `--now`, `--model-roles`, `--offhost-approval`을 명시한다. 과제+wiki_draft의 외부 전송 허가와
  별도 사람 승인 파일이 모두 필요하다. 원문·prompt는 승인된 비공개 작업 폴더에만 둔다.
- `docs/architecture/workspace/examples/knowledge_layer/model_roles.offhost_example.json`은 자리표시자 전용 형식 예다.
  예시의 enabled/egress=true를 실제 과제 승인으로 사용하지 않는다. 승인된 실제 표는 caller가 별도로 제공한다.
- prepare는 request.json/model_input.json/model_prompt.md/manifest.json과 manifest.sha256을 생성한다.
  사람 정정 단위와 coverage를 포함한 manifest 전체 바이트를 지문으로 묶으며 generate와 dump-model-input에서 대조한다.
  manifest나 지문을 손으로 고치지 않는다. 이전 지문 없는 준비물은 새 빈 폴더에서 prepare를 다시 한다.
- 같은 mail id의 원본 해시가 다를 때는 `--source-custody-root <approved_root>`를 추가한다. 자동 경로 추측은 없다.
  collector의 `hiworks/sha256/<prefix>/<sha>.eml` 경로만 읽고 전체 해시를 확인한 뒤 첫 CRLF/LF 빈 줄 아래 바이트를 대조한다.
  같은 본문이면 가장 이른 유효 ingested_at 저장본을 source_revision_ref 근거로 삼는다. 동률은 sha·메일함 소유자·레코드 지문 순서다.
  최초 부 선택은 sha가 같은 재수집에도 적용한다. 이 규칙은 본문 바이트가 동일한 부들 사이에서만 작동한다 — 고를 대상이 같은 것들이라 잃는 게 없고, 나중에 새 부가 더 들어와도 이미 쓴 위키의 근거 포인터가 흔들리지 않는다.
  내용이 바뀐 것은 이 규칙의 대상이 아니다(본문이 다르면 거부; 사람 정정은 정정 단위·철회 경로로).
  ingested_at 없음/파싱 불가는 그 기록만 제외하고 counts.excluded_invalid_ingested_at에 센다. 해당 id에 유효한 기록이 하나도 남지 않으면 mail_no_valid_ingested_at으로 거부한다.
  원본 비교에서 빈 본문은 custody_eml_body_empty로 거부한다. 동일 sha여도 파싱된 body_text·제목·참여자·분류 metadata의 동일성은 별도 보장되지 않는다.
  K3는 선택한 최초 기록의 body_text·subject·발신 도메인·시각을 사용하고 to/cc·classification은 위키 문장 구성에 쓰지 않는다. 나중 파싱/분류값을 조용히 섞지 않는다.
  나머지 저장본의 메일함 소유자·sha256·수집 시각은 manifest.unit_materials의 unit별 재료 목록과 coverage.header_only_variants에 보존한다.
  이 목록은 manifest 지문에 묶이고 생성 영수증 coverage로 전달된다. K1 unit·위키 core·모델 입력 구조를 확장하지 않는다.
  모든 부를 검사하므로 3부 중 1부라도 본문이 다르면 전체 id를 거부한다. body_text 또는 디코딩/공백 정리 후 비교로 대신하지 않는다.
  root 미지정·원문 부족이면 예외 허용 없이 거부한다. 원문 읽기는 파일당 32 MiB·회차 합계 256 MiB, id당 기록 1000부로 제한한다.
- `dump-model-input --work <private_work> [--write]`: 지문을 확인하고 실제 K1·K3 입력 생성기를 재사용한다.
- `generate --work <private_work> --answer <answer.json> --archive-root <private_archive> --model-id <placeholder>
  --now <ISO> --model-roles <approved_table> --offhost-approval <approval>`: grant 현재 유효성·입력/규칙/전송 승인 지문을
  재대조한다. 기본 graph는 메모리이며 Neo4j 활성화·schema 설치·예약 등록은 하지 않는다.
- generation_receipt.json은 archive/graph 작업 전에 wx로 독점 예약한다. 반복·동시 실행은 기존 영수증을 덮지 않는다.
  READY 성공은 새 저장·unchanged 여부·철회 마커의 존재와 무관하게 항상 파일 영수증을 남긴다. 저장 여부와 성공 여부는 별도 조건이다.
  저장 경로는 예약 전에 임시 파일 생성·삭제로 쓰기 가능 여부까지 검사한다. 답 검사 오류·저장 전 HOLD는 자신이 만든 예약만 풀어 같은 준비물로 재시도할 수 있다.
  열린 descriptor와 현재 경로의 dev/ino를 대조해 다른 예약이면 지우지 않는다. 해제 실패는 최초 오류를 덮지 않고 cleanup_code로 덧붙인다.
  저장 전 HOLD는 CLI stdout 결과만 반환하고 영수증 파일은 남기지 않는다. 해제가 실패하면 오류로 끝난다.
  probe의 신원 변경은 권한 부족과 구별한다. probe 정리 실패는 stderr의 failure_receipt에 안전한 파일명과 잔여 가능성을 기록한다(원문·절대 경로 없음).
  archive 파일이 실제 생성되거나 graph commit을 시도한 뒤 실패하면 예약을 보존한다. 크래시의 빈 예약도 부분 저장의 빈 예약과 구별할 수 없으므로 조용히 재시도하지 않는다.
  이 신원 확인은 신뢰된 전용 폴더의 동시 실행 보호이며 적대적인 외부 프로세스와의 모든 파일 교체 경쟁을 원자적으로 차단하는 보장은 아니다.

지문은 신뢰된 caller 전용 폴더에서의 변경 감지다. manifest와 지문을 함께 다시 쓰는 악의적 writer를 인증하거나
사람 수락을 대신하지 않는다. 머리글만 다른 것으로 바이트 대조된 저장본 외의 custody 불일치는 계속 거부한다.

### 역할 표

현재 모델을 선택하지 않는다. secret 없는 단일 표 `soulforge.knowledge_layer.model_roles.v1`을
`resolveModelRole/createRoleGenerator`에 주입한다. 예시는 `docs/architecture/workspace/examples/knowledge_layer/model_roles.json`.
roles는 wiki_draft/night_organize/memory_extract/entity_candidates/embedding/bot_answer → model ID,
models는 call_style/model/endpoint/allowed_origins/budget/allow_company_host_egress,
projects는 과제별 roles·company_host_egress의 역할별 override다. 표의 enabled와 전송 허용은 기본 false다.
회사 자료는 data_class 기본 company이며, 다른 과제·다른 역할의 전송 예외를 상속하지 않는다.
모델 행의 공통 허용 표식만으로 권한을 주지 않는다. projects의 해당 과제/역할에 true가 명시되어야 한다.
이번 작업은 밀린 음성 카드 1회의 예외를 사용하지 않았고 실제 외부 모델 호출도 하지 않았다.

call_style은 신뢰된 코드 registry의 adapter factory로 해결하며 설정 경로를 dynamic import하지 않는다.
chat_completions 기본 adapter 외 다른 호출 방식은 factory를 등록한다. 이미 등록한 호출 방식의 모델은
표만 바꾸면 교체되고 binding digest가 바뀌어 재생성한다. 미등록 프로토콜은 거부한다.
나머지 역할은 설정 해석만 제공하며 K4 이후의 업무를 실행하지 않는다.

K0~K2 구현은 그대로다. K3는 K2의 엄격한 text=quote 조건을 쓰지 않는다. 모델이 자기 말로 정리하고 원문 quote를 별도로 붙인다.
기계 콘텐츠 검사는 **quote의 글자 대조 + 페이지별 재료 목록·작업 기록 + Owner가 허용한 예외 표지 바닥**이다. 재서술은 모델 책임이며
semantic_fact_verified=false를 유지한다. 과제·hash·CAS·전송/자원 상한은 콘텐츠 판단이 아닌 기본 안전 계약이다.
`WIKI_SCHEMA.md` 한 장을 모델 system 규칙으로 전달해 문서 우선, 모순 처리, 사람 정정 보존,
늦게 온 문서 반영과 예외 판단을 맡긴다. 문서 hash는 생성 판본에 남기고 closure에 포함해 재생성한다.
human_correction_unit_ids는 현재 승인된 unit ID 목록만 받는다. 실제 정정 파일은 연결 담당이 승인 단위로 제공한다.
문서·원천 시각·판본을 모델에 그대로 제공한다. 규칙을 모델이 잘 수행하는지는 실제 평가 대상이며 기계 검증이라고 주장하지 않는다.
snapshot v2는 규칙 hash·재료 목록을 더한다. v1은 이전 판 이력으로 읽을 수 있으나 현재 정책에 맞는 새 v2 생성 전 current로 쓰지 않는다.
같은 snapshot v2 안의 규칙·표시 판은 wiki_rules_sha256으로 식별한다. 규칙 hash가 바뀌면 view_digest도 바뀌어 이전 판을 current로 반환하지 않는다.
운영 규칙 v4는 답장 인용 머리줄·서명·면책·인사말을 정리문에서 제외하고, 같은 스레드 반복은 가장 이른 근거 한 번만 쓰며, 시각 차이는 모순 또는 최신 상태로 표시하도록 모델에 요구한다.
topic page_id는 topic 문자열 전체의 sha256으로 만들며 topic 이름을 바꾸면 새 페이지가 된다. 이름 변경을 같은 페이지의 SUPERSEDES로 추정하지 않는다.
WIKI_SCHEMA 규칙 hash가 달라지면 기존 실제 준비 폴더는 wiki_rules_sha256_mismatch로 거부되므로 빈 폴더에서 prepare부터 다시 한다.
