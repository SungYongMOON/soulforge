# 자동 정리본 지식 층

Owner 방향에 따라 Neo4j와 주입식 보존 파일을 사용하는 자동 정리본 모듈을 단계적으로 만든다.
기존 처리 경로에 자동 연결하지 않는다. Rune와 정본 승격은 후속 별도 소비 경로다.

현재 K0: 공개 합성 2과제·3원천·6질문을 기존 answer_eval로 평가한다.
`node guild_hall/context_engine/harness/knowledge_layer_eval.mjs`는 제목 baseline과 원문 reference의
배선 점수를 출력한다. 실제 모델 품질·그래프 기여·운영 완료를 뜻하지 않는다.
검사: `npm run validate:knowledge-layer`. 새 시험은 done:check 양쪽 목록에 포함된다.

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
과제 전체 1페이지+원천 entity별 페이지, 색인, append 기록, possible_conflict/gap/exception을 생성한다.
위 칸은 현재 정리본, 아래 칸은 추가 전용 기록이며 매번 불변 새 판이다. 실패 문장은 현재 페이지에서 제외한다.
모순·빈틈은 모델의 review 출력이다. 예외는 모델 보고와 K2와 동일한 고정 KO/EN 표지 바닥의 합집합이다.
인용 대조 성공·NFC/공백 후 text=quote·claim 없음이면 source_attributed, 나머지는 weak다.
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
- `dump-model-input --work <private_work> [--write]`: 지문을 확인하고 실제 K1·K3 입력 생성기를 재사용한다.
- `generate --work <private_work> --answer <answer.json> --archive-root <private_archive> --model-id <placeholder>
  --now <ISO> --model-roles <approved_table> --offhost-approval <approval>`: grant 현재 유효성·입력/규칙/전송 승인 지문을
  재대조한다. 기본 graph는 메모리이며 Neo4j 활성화·schema 설치·예약 등록은 하지 않는다.
- generation_receipt.json은 archive/graph 작업 전에 wx로 독점 예약한다. 반복·동시 실행은 기존 영수증을 덮지 않는다.
  생성 중 오류나 중단은 빈 예약 파일을 남길 수 있다. 이는 완료 영수증이 아니다. 부분 효과를 확인하고 새 준비 폴더를 사용한다.

지문은 신뢰된 caller 전용 폴더에서의 변경 감지다. manifest와 지문을 함께 다시 쓰는 악의적 writer를 인증하거나
사람 수락을 대신하지 않는다. custody 중복의 원문 해시 불일치는 계속 거부하며 임의로 한 사본을 선택하지 않는다.

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

K0~K2 구현은 그대로다. K3는 K2의 엄격한 재서술/영향도 판정으로 페이지를 막지 않는다.
기계 콘텐츠 검사는 **quote의 글자 대조 + 페이지별 재료 목록·작업 기록 + Owner가 허용한 예외 표지 바닥**이다. 재서술은 모델 책임이며
semantic_fact_verified=false를 유지한다. 과제·hash·CAS·전송/자원 상한은 콘텐츠 판단이 아닌 기본 안전 계약이다.
`WIKI_SCHEMA.md` 한 장을 모델 system 규칙으로 전달해 문서 우선, 모순 처리, 사람 정정 보존,
늦게 온 문서 반영과 예외 판단을 맡긴다. 문서 hash는 생성 판본에 남기고 closure에 포함해 재생성한다.
human_correction_unit_ids는 현재 승인된 unit ID 목록만 받는다. 실제 정정 파일은 연결 담당이 승인 단위로 제공한다.
문서·원천 시각·판본을 모델에 그대로 제공한다. 규칙을 모델이 잘 수행하는지는 실제 평가 대상이며 기계 검증이라고 주장하지 않는다.
snapshot v2는 규칙 hash·재료 목록을 더한다. v1은 이전 판 이력으로 읽을 수 있으나 현재 정책에 맞는 새 v2 생성 전 current로 쓰지 않는다.
같은 snapshot v2 안의 규칙·표시 판은 wiki_rules_sha256으로 식별한다. 규칙 hash가 바뀌면 view_digest도 바뀌어 이전 판을 current로 반환하지 않는다.
