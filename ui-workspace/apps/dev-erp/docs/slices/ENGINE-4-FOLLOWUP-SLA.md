# ENGINE-4-FOLLOWUP-SLA — 무응답·기한 팔로업 자동 후보

- status: proposed (owner 결정 K-2 로 기본 정책 확정 후 착수 권장)
- parallel_group: G-intake-cycle / depends_on: E1(스레드 맵 유틸 재사용)
- 규모 추정: 코드 ~150줄 + 테스트 ~90줄 (1일)

## 목적 (1줄)

"보냈는데 답이 없는 것"과 "기한이 다가오는 것"을 사람이 기억하지 않아도,
결정적 스캐너가 팔로업 할일 후보를 만든다 — 기다림을 일로 변환.

## 검증된 사실 (2026-07-02 실측)

1. 메일_이력 21컬럼에 **방향 전용 컬럼은 없다**. `이벤트유형` 컬럼이 존재한다(헤더 실측).
   ⚠️ 발신/수신 구분이 이벤트유형 값으로 표현되는지는 **미확인** — 아래 구현 전 확인 필수.
2. `스레드` 컬럼 존재 → "발신 후 같은 스레드 수신 없음" 판정의 키.
3. mail_to_task_ledger 에 `--default-review-days`(기한 없을 때 메일일+N일)와
   `--reminder-days`(기본 2) 정책이 이미 있다(31~32행) — 기한 파생 규칙 재사용.
4. 행보관 triage 는 이미 overdue/due_today 를 점수화하지만(haengbogwan_run buildTriageQueue)
   **할일을 만들지는 않는다** — 이 패킷이 그 간극을 메움.
5. 할일키 멱등 체계: `mailtask:<이력키>` — 팔로업은 별도 네임스페이스 필요(아래 설계).

## 구현 전 확인 (착수 게이트)

- [ ] `이벤트유형` 값 분포 실측:
      `powershell "Import-Csv _workmeta\P26-014\reports\메일_이력\메일_이력.csv | group 이벤트유형 | select Count,Name"`
      발신 구분값이 없으면 → 발신 판정 대안: 메일함 계정 == 발신자 매칭. 그것도 불가하면
      이 패킷의 무응답 트랙은 **보류하고 기한 트랙만 진행** (거짓 판정 금지).
- [ ] K-2 owner 결정: 무응답 판정 일수 N(제안 기본 5영업일 아님 — 달력일 5), 대상 프로젝트 범위,
      팔로업 할일의 기본 담당(원 발신자 제안).

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

주의: 팔로업 할일키는 `mailtask:` 를 쓰지 않는다(원 메일이 이미 소비한 키공간).
ledger 도구는 mailtask 전용이므로, 트랙 A 는 **원 발신 메일의 이력키로 mailtask:<이력키> 를
사용하되 split 인덱스**(`mailtask:<이력키>:f1`)로 충돌 회피 — 구현 전 ledger 의 split 처리
(`Array.isArray(cand)`, 298행)로 표현 가능한지 확인하고, 불가하면 candidates 배열 1원소
split 로 구현한다(검증된 경로).

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

### 수동 verify

```
node tools/followup_scan.mjs --workmeta <fixture> --json            # dry-run
node tools/followup_scan.mjs --workmeta <fixture> --apply --json
node tools/mail_to_task_pending.mjs --workmeta <fixture>            # 팔로업이 pending 을 오염시키지 않음
```

### 공통 검사 총칙 수행

## 완료 기준

- 합성 fixture 에서 "발신 5일 무응답 → 회신 확인 할일(needs_review)" 재현 + 멱등.
- 이벤트유형 검증 실패 시 트랙 A 가 자동 비활성되고 그 사실이 summary 에 명시된다.
- 직렬 전체 테스트 green + verify_gate L1 PASS.
