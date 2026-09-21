# Context Engine

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
wscript.exe //B //NoLogo "<lane>\ops\run-voice-conversation-list-hidden.vbs" "<System32>\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command "& '<node.exe>' '<lane>\...\voice_conversation_list_nightly.mjs' '--root-table' '<root_table.json>' '--root-table-sha256' 'sha256:<...>' '--tools-config' '<tools.json>' '--pipeline-config' '<pipeline.json>' '--receipts' '<receipts_dir>' '--max-sessions' '40' '--deadline' '04:00' '--scheduled-start' '00:00' ; exit $LASTEXITCODE"
```

시험: `tests/voice_conversation_list_nightly.test.mjs` — `nextDeadlineInstant` 자체 8건, 마감 정지·다음 밤
픽업·마감 미도달·지각 시작 즉시 정지 4건, 연쇄 순서·인자 전달·실패 기록·throw 방어·`--dry` 전파 5건, 실
reconcile/present 종단 시험 2건, 등록기 구조 시험 3건(-DailyAt/-Deadline/-ChainReconcile·S2/S4/S6/N3·
R1a-1, 전부 PowerShell 실행 없이 소스 텍스트 대조), R1(필수) 5건, S1 1건, S2 2건, S3 1건, S4 3건, S5 2건,
N1 1건, S1-1(재시도·대체 쓰기·정리) 3건, S5-1(`staleLockMsFor` 3건 + 통합 1건 + `releaseLock` 소유권 3건),
R1b-1(다중일 lookback) 1건, nit1/2(CLI 엄격 검사) 2건, nit3(margin≥span 거부) 1건, nit4(worst-case 경고)
2건 — 총 86건, 전부 통과. `tests/estate_voice_card_reconcile.test.mjs`에 nit5(schema v1/v2 겸용 수용)
1건 추가, 47건 전부 통과.

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
  (`soulforge.voice_conversation_list_nightly_receipt.v1`)이 `ran` 또는 `skipped_existing`이면서
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
- 잠금: `--receipts` 아래 `nightly.lock.json` 하나가 같은 밤 두 회차가 겹치는 것을 막는다. 3시간(`STALE_LOCK_MS`)
  넘은 잠금은 버려진 것으로 보고 이전 값을 receipt에 남긴 뒤 회수한다. 잠금을 잡지 못하면 아무 것도 부르지 않고
  종료코드 3이다.
- 영수증: 밤마다 receipts에 `soulforge.voice_conversation_list_nightly_receipt.v1` 파일 하나. 세션마다 id·제목·
  길이·`outcome`(`ran`·`skipped_existing`·`skipped_short`·`failed`)·이유·모델 호출 수·걸린 초를 담는다. 실패가
  하나라도 있으면 종료코드 2, 전부 끝나면 0.
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
