# ENGINE-4-FOLLOWUP-SLA — 무응답·기한 팔로업 자동 후보

- status: **done 2026-07-03 — K-2 owner 결정 반영, followup_scan 구현**
- parallel_group: G-intake-cycle / depends_on: E1(done — 스레드 맵 유틸 재사용), E8 과 같은 파일군이므로 한 작업자 직렬
- 규모 추정: 코드 ~150줄 + 테스트 ~90줄 (1일)

## 목적 (1줄)

"보냈는데 답이 없는 것"과 "기한이 다가오는 것"을 사람이 기억하지 않아도,
결정적 스캐너가 팔로업 할일 후보를 만든다 — 기다림을 일로 변환.

## 검증된 사실 (2026-07-02 실측)

1. 메일_이력 21컬럼에 **방향 전용 컬럼은 없다**. `이벤트유형` 컬럼이 존재한다(헤더 실측).
   **방향 판정 코드가 이미 있다**(검증 발견): scan_mail_ledger.mjs 53행 directionOf() 가
   이벤트유형·메일함 값에 `/발신|보낸|sent|out/i` 매칭으로 out/in 을 판정한다 — 이 함수를
   재사용(또는 export)하고, 새 방향 판정을 발명하지 말 것. 실데이터 값이 이 패턴과 맞는지는
   아래 구현 전 확인 필수(안 맞으면 트랙 A 비활성).
2. `스레드` 컬럼 존재 → "발신 후 같은 스레드 수신 없음" 판정의 키.
3. mail_to_task_ledger 에 `--default-review-days`(기한 없을 때 메일일+N일)와
   `--reminder-days`(기본 2) 정책이 이미 있다(31~32행) — 기한 파생 규칙 재사용.
4. 행보관 triage 는 이미 overdue/due_today 를 점수화하지만(haengbogwan_run buildTriageQueue)
   **할일을 만들지는 않는다** — 이 패킷이 그 간극을 메움.
5. 할일키 멱등 체계: `mailtask:<이력키>` — 팔로업은 별도 네임스페이스 필요(아래 설계).

## 구현 전 확인 (착수 게이트)

- [x] `이벤트유형` 값 분포 실측:
      `powershell "Import-Csv _workmeta\P26-014\reports\메일_이력\메일_이력.csv | group 이벤트유형 | select Count,Name"`
      발신 구분값이 없으면 → 발신 판정 대안: 메일함 계정 == 발신자 매칭. 그것도 불가하면
      이 패킷의 무응답 트랙은 **보류하고 기한 트랙만 진행** (거짓 판정 금지).
- [x] **K-2 확정됨 (2026-07-03 owner)** — 아래 "owner 결정 기록" 절 참조.

## owner 결정 기록 (2026-07-03)

**K-2 확정** — owner 결정(2026-07-03 대화):

1. **무응답 판정 일수 N = 3 (달력일)** — 발신 후 같은 스레드의 수신 메일이 3일간 없으면
   트랙 A 발동. (owner: "무응답 판정일수는 3일로")
2. **팔로업 기본 담당 = 원 발신자 제안** — 그 발신 메일을 보낸 사람(발신자/메일함 계정)을
   `suggested_assignee_ref` 로 제안한다. (owner: 선택지 (a) 확정)
   **제안만이며 확정 아님** — 팔로업 할일은 needs_review 로 뜨고 담당 칸은 화면에서 변경/
   해제 가능. 자동 확정 금지(기존 제안 계층 원칙). K-5 승인으로 `수신역할` 컬럼이 생기면
   발신자 식별 정밀도가 함께 올라간다. 세분화(예: 특정 업체는 구매담당)는 브랜치 규칙
   (haengbogwan_context_hint_rules.json)으로 후속 덮어쓰기 가능.
3. **대상 범위(기본값, owner 가 별도로 좁히지 않음)**: 팀 수집 대상 전체 메일함의
   프로젝트 라우팅된 발신 메일. 폭주 방어는 기존 설계의 사이클당 신규 상한(기본 5) 유지.
   범위 축소가 필요해지면 env/규칙으로 후속 조정(이 파일에 기록).

**K-2 보강 — 무응답 추적 범위 확장 (2026-07-03 owner 확정)**:

4. **이미 할일로 변환된 발신 메일도 무응답 추적 대상에 포함한다.**
   (owner: "무응답 추적에 변환된 할일도 포함해")
   - 배경: v1 구현(694e330c)은 converted-skip(followup_scan.mjs:340)이 무응답 검사보다
     선행해, 이미 인테이크된 발신 메일은 무응답이어도 영구 침묵했다(2026-07-03 표면 검토
     실측: skipped_converted 132건 vs 산출 1건 — E4-d3). 이 결정으로 그 사각이 대상이 된다.
   - 구현 방향: 변환된 발신 메일은 **새 팔로업 할일을 또 만들지 않고**, 대응하는 기존
     할일(`mailtask:<이력키>`)에 `followup_due` 이벤트를 부착하는 방식으로 확장한다
     (중복 할일 방지 + 담당자 화면에서 기존 할일에 신호가 쌓임). 판정 순서 재설계:
     무응답 판정 → (미변환이면 후보 생성 / 변환됐으면 기존 할일에 이벤트).
   - 멱등·상한·달력일 3일 규칙은 1~3항 그대로 유지. 구현은 Codex 후속 패킷
     (표면 스레드 2026-07-03 착륙 기록의 "Codex 이관" 목록 E4-d3 항목과 동일 건).

### blocked 기록 (2026-07-02 Codex preflight — K-2 확정으로 해소됨)

- 첫 착수 게이트는 닫았다. P26-014 메일_이력 metadata 집계에서 발신/수신 구분값이 실측되었다:
  `mail_sent_existing_history` 19, `mail_sent_outlook_subject_match` 12, `mail_sent` 11,
  `mail_sent_outlook_reconcile` 3, `mail_sent_user_supplied_msg` 1,
  `mail_received_existing_history` 20, `mail_received` 9,
  `mail_received_outlook_folder_reconcile` 3, `mail_received_user_supplied_msg` 1,
  `mail_draft` 1. 따라서 방향 판정 재사용 조건은 충족한다.
- 두 번째 착수 게이트는 2026-07-03 owner K-2 결정으로 닫혔다.
- 이전 owner 질문은 해소됨: 무응답 판정 N=3 달력일, 대상은 수집 전체, 기본 담당은 원 발신자
  `suggested_assignee_ref` 제안(확정 담당 아님)으로 기록한다.

## 설계

### 알고리즘 (결정적, LLM 0%)

```
새 도구 tools/followup_scan.mjs (dry-run 기본, --apply 게이트):
트랙 A — 무응답 팔로업 (이벤트유형 검증 통과 시에만):
1. 프로젝트별 메일_이력에서 발신 메일 중, 같은 스레드의 이후 수신 메일이 없고
   발생시각이 N일 경과한 것을 추출
2. 이미 팔로업이 있으면 skip — 멱등키: followup:<스레드키 or 이력키>
3. 해당 스레드에 열린 할일이 있으면 새 할일 대신 event(kind=followup_due) 만 기록(E1 유틸)
4. 없으면 candidates 형태로 생성: { title: "회신 확인: <제목 40자>", work_type: "answer",
   completion_criteria: "상대 회신 수신 또는 재송부/유선 확인", due: today+2,
   review_status: "needs_review", review_reason: "auto_followup_no_reply" }
   → mail_to_task_ledger --candidates 로 위임(자체 CSV 쓰기 금지)
트랙 B — 기한 임박 리마인드:
1. 할일_장부 open 행 중 마감일이 D-<M>일 이내이고 다음액션이 비어 있는 행
2. 할일을 새로 만들지 않고 event(kind=due_reminder, item_ref=할일키) + summary 보고만
   (중복 알림 방지: data/followup_cursor.json 에 (할일키,마감일) 기록)
배선: auto_intake_cycle 마지막 단계 opt-in (env DEV_ERP_INTAKE_FOLLOWUP=1, 기본 off)
```

### 구현 결과 (2026-07-03)

- `tools/followup_scan.mjs` 추가: dry-run 기본, `--apply` 게이트, metadata-only, 프로젝트별 상한 기본 5,
  cursor 파일 `data/followup_cursor.json` 기반 멱등.
- 트랙 A: 발신 후 3달력일 동안 같은 스레드의 수신 메일이 없으면 `needs_review` 후보를 만들고,
  기본 담당은 `suggested_assignee_ref` 로만 제안한다. 같은 스레드에 열린 할일이 있으면 새 할일 대신
  `followup_due` event 만 기록한다.
- 트랙 B: D-2 이내 open 할일 중 다음액션이 비어 있으면 `due_reminder` event 만 기록한다.
- 방향 신호가 없는 프로젝트는 무응답 트랙을 자동 비활성화하고
  `track_a_disabled_reason=no_outbound_direction_signal` 을 summary 에 남긴다.
- `auto_intake_cycle.mjs` 배선은 `DEV_ERP_INTAKE_FOLLOWUP=1` 또는 명시 옵션에서만 켜지며,
  `DEV_ERP_AUTO_INTAKE` 기본 동작만으로는 팔로업 스캐너가 실행되지 않는다.

🚫 정정(적대 검증에서 blocker 판정): 이전 초안의 `mailtask:<이력키>:f1` 표기는 폐기한다 —
할일키 정규식 `(?::\d+)?` 는 **숫자 suffix 만** 허용하므로 `:f1` 은 멱등 교체(isTouchedMailTask,
316행)에서 빠져 orphan 행을 만든다.
확정 설계: 트랙 A 는 "해당 발신 메일에 기존 할일 행이 없음 + 스레드에 열린 할일 없음"일 때만
발동하므로(위 1~3 조건), **원 발신 메일의 이력키로 평범한 단건 candidates
(`mailtask:<이력키>`)를 생성**하면 충돌이 없다. split 불필요. 부수 효과(무해·의도됨):
이 키가 생기면 그 발신 메일은 pending converted 판정에 잡혀 재스캔에서 사라진다.
이미 할일이 있는 메일/스레드는 candidates 로 재투입하지 않는다 — ledger 는 touched 메일의
기존 행을 통째 교체하므로(303행 주석) 사람 편집을 날릴 수 있다.

## 경계 가드

- 제목 40자 캡 외 메일 내용 미복사. 발신자 개인 식별은 기존 메일함/발신자 메타 범위 내.
- 알림 폭주 방지: 프로젝트당 사이클당 팔로업 신규 생성 상한(기본 5) + 커서 멱등.
- 판정 불가(이벤트유형 미구분) 시 트랙 A 비활성 — 추정으로 발신 판정하지 않는다.

## 검사 방법

### node:test (신규 test/followup_scan.test.mjs)

1. `무응답: 발신 후 N일 경과 + 동일 스레드 수신 없음 → 후보 1건` (fixture 이력 3행)
2. `무응답: 이후 수신 있으면 후보 0`
3. `무응답: 열린 할일 있는 스레드는 event 만` (E1 맵 재사용)
4. `멱등: 2회 실행 신규 0`
5. `기한: D-M 이내 open 행 → due_reminder 이벤트, 커서 후 중복 0`
6. `상한: 후보 6건 중 5건만 생성 + truncated 보고`
7. `방향 신호 없음: 트랙 A 비활성 + summary 사유 기록`
8. `이벤트 sink 없음: due_reminder 커서 미기록`

### 수동 verify

```
node tools/followup_scan.mjs --workmeta <fixture> --json            # dry-run
node tools/followup_scan.mjs --workmeta <fixture> --apply --json
node tools/mail_to_task_pending.mjs --workmeta <fixture>            # 팔로업이 pending 을 오염시키지 않음
```

### 공통 검사 총칙 수행

## 완료 기준

- 합성 fixture 에서 "발신 3달력일 무응답 → 회신 확인 할일(needs_review)" 재현 + 멱등.
- 방향 신호가 없으면 트랙 A 가 자동 비활성되고 그 사실이 summary 에 명시된다.
- 직렬 전체 테스트 green + verify_gate L1 PASS.
