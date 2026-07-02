# ENGINE-1-THREAD-DEDUP — 스레드 인지 중복 억제

- status: done (2026-07-02 Codex implementation) / parallel_group: G-intake-cycle / depends_on: 없음
- 규모 추정: 코드 ~120줄 + 테스트 ~80줄 (반나절)

## 목적 (1줄)

같은 메일 스레드의 후속 메일이 **새 할일을 또 만들지 않고**, 열린 기존 할일에
"후속 메일 도착" 사건으로 붙게 한다.

## 검증된 사실 (2026-07-02 실측)

1. 메일_이력.csv 에 `스레드` 컬럼 존재 (헤더 실측).
2. `tools/mail_to_task_ledger.mjs` 는 메일의 스레드 값을 읽어(125~128행 mc.thread)
   할일 행의 `소스스레드키`(source_thread_ref) 컬럼에 기본 기록한다(253행).
3. `tools/mail_to_task_pending.mjs` 의 pending 항목은 현재 thread 를 **포함하지 않는다**
   (89~98행: history_key/subject/from/received_at/mailbox/source_id/due_hint 만).
4. 처분 영수증(disposition=no_action)은 pending 재판단에서 그 메일을 영구 제외한다
   (readHandledReceiptKeys). 공용 작성기 tools/mail_receipts.mjs.
5. 사이클 오케스트레이터는 tools/auto_intake_cycle.mjs runCycle() (분류 → ledger → context).
6. core_item 의 id = 할일키(mailtask:<이력키>) 로 ledger 와 1:1 (autosync importTaskLedgerFile).
7. store.appendEvent 는 {actor_ref, actor_kind, kind, item_ref?, used_refs, data_label, note}
   형태를 받는다 (src/llm.mjs 295~301행 사용례 실측).

## 구현 전 확인 (구현자가 반드시 실측)

- [x] `스레드` 컬럼 채움율 — P26-014 는 100%(79행 전부) 실측 완료(2026-07-02). 대상 과제가
      다르면 표본 재확인: `powershell "Import-Csv .\_workmeta\<코드>\reports\메일_이력\메일_이력.csv | ? {$_.스레드} | measure"`
      빈 값이 많은 과제면 스레드키 폴백(제목 정규화 + 발신자 도메인)을 함께 구현.
      확인(2026-07-02 Codex): 현재 표면은 P26-014 80/80, P25-057 19/19, P21-062 17/17 등은 100%였지만
      P24-049 는 85/345(24.64%), P00-000_INBOX 는 0/435였다. 따라서 `thread-fallback:<hash>` 폴백을
      `tools/mail_thread_key.mjs` 로 구현하고 pending/ledger 양쪽에서 같은 키를 쓴다.
- [x] (확인완료 2026-07-02) store.appendEvent 는 `event.item_ref` 를 event_log.item_ref 컬럼에
      기록한다 (src/store.mjs 975~989행 실측) — 설계의 item_ref 표기 정확.
- [x] 발신 메일 제외: pending 에는 발신 이벤트도 포함될 수 있다(E8 검증에서 실측 —
      이벤트유형에 mail_sent_* 계열 존재). 스레드 맵 조회 전에 발신 메일은 분류 대상에서
      제외하되 영수증 없이 skip(E4 팔로업 스캐너의 입력으로 보존). 방향 판정은
      scan_mail_ledger.mjs 53행 directionOf() 패턴(`/발신|보낸|sent|out/i`) 재사용.
      확인(2026-07-02 Codex): mail_sent* 계열은 발신으로 잡히지만 `/out/i` 는
      `mail_received_outlook_folder_reconcile` 도 발신으로 오탐한다. 따라서 E1 구현은 `sent/outbound/outgoing/outbox`
      토큰과 `발신|보낸` 만 발신 skip 으로 인정하는 좁은 패턴을 사용한다.

## 설계

### 알고리즘 (결정적, LLM 0%)

```
사이클의 분류 단계 직전에 스레드 사전 검사(pre-pass):
1. pending 항목에 thread 필드 추가 (pendingForProject 가 메일_이력 '스레드' 컬럼을 읽어 동봉)
2. 프로젝트의 할일_장부.csv 를 읽어 open 상태(상태 != done/cancelled 계열) 행의
   소스스레드키 → 할일키 맵을 만든다 (thread 값 없는 행 제외)
3. pending 중 thread 가 맵에 있는 메일:
   a. 분류(LLM) 대상에서 제외 — LLM 비용 절감 + 중복 방지
   b. no_action 영수증 기록: reason=`thread_followup:<할일키>` (멱등, 공용 작성기)
   c. ERP 사건 기록: store.appendEvent({ kind:"mail_followup", item_ref:<할일키=core_item.id>,
      actor_ref:"erp", actor_kind:"ai", used_refs:["auto_intake","thread_dedup"],
      data_label:"meta", note:`history_key=<이력키>` })
      — DB 미가용(standalone)이면 생략하고 summary 에 카운트만
4. thread 가 맵에 없거나 기존 할일이 닫혀 있으면 → 기존 흐름대로 분류 진행
```

핵심 결정: **후속 메일은 '처리됨'이 맞다** — 그 메일 자체는 기존 할일에 귀속됐으므로
no_action 영수증이 의미론적으로 정확하다. 할일이 닫힌 뒤 오는 다음 메일은 새 이력키라서
새로 판단된다(스레드 재개 = 새 할일 후보). 정보 손실 없음: 귀속 기록이 event_log 와
영수증 reason 양쪽에 남는다.

### 파일 변경

| 파일 | 변경 |
| --- | --- |
| tools/mail_to_task_pending.mjs | pendingForProject 출력에 `thread` 필드 추가(메일_이력 `스레드` 컬럼). 기존 소비자는 필드 추가에 영향 없음. **주의(실측): 이 파일의 parseCsv(26행)·readCsvObjects(40행)는 현재 미export** — 옵션 A(권장, 최소 diff): 두 함수에 export 추가 후 E1 코드에서 import. 옵션 B: openTaskThreadMap 내부에 동일 파서 로컬 구현(중복 비용) |
| tools/mail_thread_key.mjs | 스레드 빈 값 보완용 `thread-fallback:<hash>` 생성 + 발신 메일 skip 판정. 제목/발신자 원문을 키로 저장하지 않고 해시만 사용. |
| tools/mail_to_task_ledger.mjs | 스레드 빈 메일에서 동일 fallback 키를 `소스스레드키` 에 기록해 이후 E1 pre-pass 가 같은 키로 귀속 가능하게 함. |
| tools/auto_intake_cycle.mjs | threadDedupPrePass() 삽입 지점: runCycle 의 `// 1) pending 델타` 블록에서 scanned 배열 확정 직후, `// 2) LLM 분류` 루프 진입 직전 (2026-07-02 코드 기준 116~125행 부근 — 행번호는 변할 수 있으니 **주석 앵커로 찾을 것**). scanned 의 프로젝트별 pending 배열을 받아 걸러진 배열 + followup 목록을 반환하는 순수 함수(export, deps 주입 유지). summary 에 `thread_dedup.followups` 카운트 |
| tools/auto_intake_cycle.mjs | openTaskThreadMap(workmeta, project) 순수 함수: 할일_장부에서 open 계열 행의 소스스레드키→할일키 맵 생성 (파서는 위 옵션 A/B 중 택한 쪽 사용) |
| test/auto_intake_cycle.test.mjs | 아래 검사 케이스 추가 |

## 경계 가드

- 메일 제목/본문을 event note 에 넣지 않는다 — note 는 history_key 만.
- 할일_장부 행을 이 패킷이 직접 수정하지 않는다(귀속은 event + 영수증으로만).
- 영수증은 --apply 에서만 기록. dry-run 은 계획 카운트만.

## 검사 방법

### node:test (test/auto_intake_cycle.test.mjs 추가 케이스)

1. `스레드 인지: 열린 할일과 같은 스레드의 pending 은 분류 제외 + no_action 영수증`
   - fixture: 메일_이력 2행(스레드 T1) / 할일_장부 1행(할일키 mailtask:k1, 소스스레드키 T1, 상태 open)
   - 기대: classify 호출 인자에 k2 메일 미포함, receipts.written=1, reason 에 thread_followup:mailtask:k1
2. `스레드 인지: 기존 할일이 done 이면 새로 판단`
   - 할일 상태 done → classify 대상 포함, 영수증 0
3. `스레드 인지: thread 빈 값은 통과` (맵 미포함 → 기존 흐름)
4. `멱등: 같은 사이클 2회 실행 시 영수증/이벤트 중복 0`
5. pendingForProject 가 thread 필드를 반환 (기존 pending 테스트 확장)

### 수동 verify (합성 DB)

```
cd ui-workspace/apps/dev-erp
node tools/auto_intake_cycle.mjs --workmeta <fixture> --json          # dry-run: thread_followups 계획 표시
node tools/auto_intake_cycle.mjs --workmeta <fixture> --apply --json  # 영수증/이벤트 기록
node tools/mail_to_task_pending.mjs --workmeta <fixture> --project P99-001  # 후속 메일이 pending 에서 사라짐
```

### 공통 검사 총칙 수행 (마스터 플랜 참조)

## 완료 기준 (acceptance)

- 같은 스레드 후속 메일이 새 unclassified 할일을 만들지 않는다(신규 테스트 green).
- 후속 도착 사실이 core_item 이력(event_log)에서 확인 가능하다.
- 직렬 전체 테스트 green + verify_gate L1 PASS.
