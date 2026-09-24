# 자동 정리본 지식 층

Owner 방향에 따라 Neo4j와 주입식 보존 파일을 사용하는 자동 정리본 모듈을 단계적으로 만든다.
기존 처리 경로에 자동 연결하지 않는다. Rune와 정본 승격은 후속 별도 소비 경로다.

현재 K0: 공개 합성 2과제·3원천·6질문을 기존 answer_eval로 평가한다.
`node guild_hall/context_engine/harness/knowledge_layer_eval.mjs`는 제목 baseline과 원문 reference의
배선 점수를 출력한다. 실제 모델 품질·그래프 기여·운영 완료를 뜻하지 않는다.
검사: `npm run validate:knowledge-layer`. 새 시험은 done:check 양쪽 목록에 포함된다.

## 이력 CLI

### 밤 준비 단계

`src/history_prepare_cli.mjs --prepare|--run --project <CODE> --date YYYY-MM-DD
--sources <absolute JSON> --output-root <existing private directory> --binding <absolute JSON>`을 사용한다.
날짜를 생략하면 KST 어제, `--from-date`를 생략하면 대상 월의 첫날부터 확인한다. 과거 월은 별도 실행·출력 폴더를 쓴다.
하루 파일럿은 `--from-date`와 `--date`를 같은 날짜로 지정한다. 호출자가 정한 기간의 수집 보관본을 읽는 것이며,
외부 서비스의 모든 자료가 수집됐다는 보증이나 새 수집 작업을 뜻하지 않는다.

`sources`는 `project`와 `mail`, `slack`, `linear`, `voice` 네 설정을 명시한다.
- 메일: `index_path`, `event_dirs`, 허용 `strengths`, 선택 `org_config_path`와 `owner_table_paths`(파일명→절대경로)를 지정한다.
  귀속 색인의 지문·신선도·과제 연결을 검사하며 본문에서 과제를 추측하지 않는다. 인용된 과거 답장은 새 사건 입력에서 분리한다.
- Slack: `channels:[{root,channel_id}]`, 선택 `names_path`를 지정한다. 메시지와 회신은 각각 원래 timestamp 날짜를 유지한다.
- Linear: `root`, 정확한 `project_ids`를 지정한다. 이슈·댓글·변경 기록은 네이티브 판의 해시를 확인한다.
  최신 이슈 본문은 updated_at 시점의 스냅샷이며 과거 상태를 복원했다는 뜻이 아니다.
- 음성: `sessions_root`, `cards_root`, `routes_root`, `project_policy`를 지정한다. `confirmed` 또는 명시된
  `first_candidate` 정책으로 카드를 골라 연결된 발화 번호 각각을 입력 한 건으로 만든다. 카드의 파생 description이나 전체 전사 묶음은 모델 입력으로 보내지 않는다.
  카드가 지정한 전사 판의 해시를 확인하고 해당 발화의 문장·시각·번호만 선택한다. `kind:voice_utterance`,
  `evidence_mode:source_id`에서는 모델이 인용문 대신 발화의 source_id만 반환하고 코드가 원래 발화와 근거를 연결한다.
  번호가 입력에 없거나 현재 묶음 밖이면 표시하며, 번호 일치는 요약문의 의미 검증이 아니다. 다른 원천의 인용 검사는 유지한다.
  후보 귀속은 사람 수락으로 올리지 않으며 철회된 귀속은 제외한다.

AI 메모 표지는 `ai_note_senders`, `ai_note_subject_prefixes`, `ai_note_user_ids`, `ai_note_markers` 등
원천별 명시 설정으로 지정한다. 태그가 없는 글의 AI 작성 여부를 추론하지 않는다. `ai_work_note`, `ai_work_memo`,
`ai_memo`, `ai_note` 종류와 명시 메모 역할은 이력 CLI에서도 거부한다. 기계전사라는 이유만으로 음성을 거부하지 않는다.

준비기는 이전 원천 입력을 보관하고, 확인한 기간 밖의 기록은 유지한다. 어제와 입력이 달라진 날짜를 합치되,
날짜가 바뀐 같은 원천은 이전 날짜와 새 날짜를 모두 변경으로 센다. 누락·실패한 원천은 빈 목록으로 간주하지 않는다.
네 원천 모두 정상적으로 읽힌 최초 빈 날짜는 `no_sources`로 보고하고 모델을 호출하지 않는다.
이력이 있는 월을 빈 입력으로 지우지는 않는다. 새 이력 head가 준비한 입력 지문과 일치할 때만 준비 기준판을 전진시킨다.
동일 원천·표시·모델 설정이면 추가 호출은 없으며, 모델 설정 변경은 기존 이력 CLI의 판정에 전달한다.

표시용 projection은 반복되는 출처 위치를 `originrefs_by_hash`에 한 번 저장하고 각 근거의 `originrefs_ref`로 연결한다.
불변 cell에는 전체 출처 위치가 그대로 남고 화면 근거도 유지된다. 입력·파일 크기 제한은 늘리지 않는다.

이 단계는 원천·운영 설정·DB·예약 작업을 쓰지 않는다. 현재 자료 수집과 이름 표의 완전성은 호출자/수집 lane 책임이다.

`node guild_hall/context_engine/src/history_cli.mjs --help`는 독립 실행면의 인자를 보여 준다.
`--dry-run`과 `--run`은 `--input <absolute JSON> --output-root <existing absolute private directory>
--binding <absolute JSON>`를 받는다. `--run`만 명시적으로 로컬 모델을 호출한다.
기존 위키·맥락이·장부·밤 사슬에는 연결하지 않는다.

입력은 `{project,month,as_of?,records}`다. 각 record는 `id,date,kind,title,sender,recipient,text`와
선택 `project,thread_ref,attachments,text_sha256,originrefs`를 가진다. 날짜는 호출자가 확정한 KST 날짜다.
호출자는 과제 귀속·원천 접근 권한·AI 업무메모 제외를 먼저 처리한다. 이 CLI는 원천을 탐색하거나
originrefs의 경로를 열지 않으며, 입력 목록이 현실의 모든 원천인지 판정하지 않는다.
한 출력 디렉터리는 한 과제·한 달 전용이다. 저장 위치는 주입받으며 프로젝트 정본 저장소를 기본값으로 삼지 않는다.

일별 원천을 스레드로 묶어 한 번 작성하고, 주별은 그 일별 문장, 월별은 주별 문장,
현황은 월별 문장에서 최근 있었던 일만 쓴다. 주는 월요일~일요일이며 월·기준일 경계는 부분 주다.
상위 입력에는 하위 문장·인용·출처 표시와 판 참조만 전달한다. 원문 전체를 다시 보내지 않는다.
현황도 남은 일·중요도·확인할 결과를 판단하는 기능이 아니다. 인용이 틀린 문장과 형식이 틀린 응답은
원 출력과 플래그를 남기고 진행한다. 내용 자동 보정·의미적 사실 수락은 하지 않으며,
재시도는 아래의 시간 초과 묶음 한 단계 분할 규칙에만 한정한다.

정렬한 입력·출처 정보·하위 판·모델 pin·작성 규칙을 지문으로 묶는다. 같은 지문은 보존한 칸을 재사용하고,
새 자료·수정·삭제가 있는 날과 그 상위 칸만 다시 쓴다. 호출 한도나 실행 시각은 내용 판 식별자가 아니다.
완성된 새 판과 이전 판은 함께 보존하며 빈 입력으로 이전 판을 지우지 않는다. 실패한 실행은 이전 현행 판을 유지한다.
모델 출력에 달린 근거는 문자열 연결 확인이며 서술 의미의 정확성을 보장하지 않는다.
완전한 JSON 코드 블록의 포장 기호만 읽기 단계에서 벗길 수 있으며 응답 원 바이트는 보존한다.
표시용 카드 JSON과 Markdown도 지문으로 새 판을 보관한다. 읽기 형식이 개선되면 보존 응답만으로
표시 판을 갱신할 수 있고(`display_updated`), 모델 재호출이나 문장 보정은 하지 않는다.

`--display-metadata <absolute JSON>`은 확인된 `source_attachments`, `slack_names`, `person_names`
표를 주입하는 선택 입력이다. 첨부는 실제 보관본의 binary_attachment 이름을 호출자가 가져온다.
선택 `source_body_sha256`은 호출자가 확인한 표시용 메일 사본 묶음의 본문 지문이다. 같은 날짜·송수신자·제목·본문 지문인
사본의 근거 줄만 합치며, 이 값이 없으면 제공된 원천 전체 지문으로 보수적으로 구분한다.
수집기별 강조·공백·목록 표시 차이를 확인해 표시 사본 키를 공유해도 원천 해시·인용 대조·개별 근거 참조는 그대로 보존한다.
이 표는 원본 바이트의 동일성 판정이나 원천 병합 권한으로 사용하지 않는다.
`--display-only`는 현행 판과 같은 입력 지문을 확인한 뒤 보존 응답의 보는 판만 갱신한다.
모델 호출은 0회이며, 일별 재작성 후에도 기존 상위 요약과 이전 판 표시를 유지한다.
모델 입력·원 응답·원천 참조를 고치지 않고 표시 이름과 첨부 표시만 바꾼다. 첨부가 4개 이상이면
처음 3개와 나머지 개수를 표시한다. 내부 카드·출처 식별자는 숨긴 연결로 남기고 사람에게는 날짜와 제목을 보인다.

`--run --retry-days YYYY-MM-DD,...`는 현행 판에서 형식 오류가 확인된 지정 날짜에만
모델을 한 번씩 다시 호출하는 명시 재작성이다. 모든 날짜를 먼저 검사하며 자동 재시도는 없다.
이 모드에서는 다른 날·주·월·현황을 다시 호출하지 않고 이전 판을 보관한다. 상위 요약이
재작성 전의 일별 판에 기반하면 보는 판에 알린다. 다음 일반 증분 실행의 상위 갱신과는 구분한다.

### 큰 하루 입력 나누기

`daily_batch_characters`는 모델에 보낼 사용자 입력 JSON의 문자 수 기준이다. 토큰 수와는 다르며,
모델 전체 입력·출력·호출 수·시간 제한은 기존 binding의 상한을 함께 적용한다.
스레드가 기준 안에 들어오면 그대로 묶고, 큰 스레드는 기록으로, 기록 하나도 크면 원문 구간으로 나눈다.
원문을 줄이거나 요약해 입력 크기를 맞추지 않는다. 구간 위치와 묶음별 지문을 보존하며
각 묶음을 한 번씩 호출한 결과를 코드가 순서대로 합친다. 별도 병합 모델이나 같은 묶음의 반복 호출은 없다.
시간 초과에만 아래의 두 절반 처리 규칙을 적용한다.

`--rebuild-days YYYY-MM-DD,...`는 지정 날짜만 이 규칙으로 다시 구성하고 다른 날짜의 판은 유지한다.
하위 판 참조가 바뀐 주·월·현황만 갱신한다. 이전 판의 참조 관계를 증명할 수 없으면 오래된 요약임을 표시한다.
이전 형식의 주간 판은 검증된 불변 현행 판 기록에서 유일한 하위 판 조합을 확인할 수 있을 때만 비교한다.
`--dry-run`은 모델 호출 없이 묶음 크기와 갱신 대상을 보여 준다. 원 응답·이전 판·실패한 묶음도 보관한다.
묶음 요청이 시간 초과 등으로 실패하면 받은 응답이 없다는 기록을 남기고 다른 묶음은 계속한다.
실패한 묶음도 캐시한다. 새 요청에서 발생했거나 이미 보존된 시간 초과(`ABORT_ERR` 또는 `TimeoutError`)는 원 묶음을 보존하고
원문 범위를 결정적으로 두 절반으로 나눠 각 절반을 한 번씩만 재시도한다. 원문 구간과 순서를 보존하고,
나눌 수 없는 입력은 미처리로 남긴다. 하위 묶음의 실패·형식 오류에는 추가 분할이나 재시도가 없다.
아직 호출하지 않은 절반들을 처리할 호출·시간 예산이 부족하면 시작하지 않는다. 완료된 절반은 재사용한다.
다른 오류, 표시 전용 실행과 실패 기록 복원은 이 규칙으로 모델을 호출하지 않는다. 일부가 실패한 새 판은
완료된 문장과 실패 표시를 함께 보관하고 `generated_partial`(종료 코드 2)로 보고한다.
이전 실행이 중단돼 실패 캐시가 없는 경우 `--record-failed-batch --failed-run <absolute JSON>`은
실제 실패 영수증의 현행 판·입력 지문·묶음 지문이 모두 일치할 때만 실패 기록을 복원한다.
이 명령은 모델을 호출하거나 현행 판을 바꾸지 않으며 성공 응답을 만들어 넣지 않는다.

binding은 `host,transport,model_id,model_pin,think:false,prompt_version,prompt_content,max_tokens,temperature,
max_calls,max_input_characters,max_output_characters,per_call_timeout_ms,wall_timeout_ms`를 명시한다.
호스트는 loopback만 허용하고 서버가 보고한 모델 신원을 pin과 대조한다. OpenAI 호환 서버 pin은
서버 신원 지문이며 가중치 파일 전체 해시라는 뜻이 아니다. 비밀값·환경설정 자동 탐색은 없다.
합성 회귀 시험은 같은 입력의 0회 호출, 하루 변경의 상위 전파, 과제 경계, 이전 판 보존과 실패 동작을 확인한다.
실제 내용 품질·운영 배치·백업 복구의 합격을 이 시험만으로 주장하지 않는다.

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
