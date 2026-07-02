# ENGINE-8-TEAM-MAIL-DEDUP — 팀 메일 사본 통합 (fingerprint)

- status: blocked (2026-07-02 Codex preflight) / parallel_group: G-intake-cycle / depends_on: 없음 (**E1보다 먼저 권장** — E1이 이 그룹키를 재사용)
- 규모 추정: 공용 유틸 ~150줄 + 배선 ~80줄 + 테스트 ~120줄 (1일)

## 목적 (1줄)

owner가 업체 메일을 팀원에게 지시·전체 참조로 전달하면 같은 내용이 팀원 수만큼 사본으로
쌓인다(하루 여러 번 발생). **사본은 개인별 메일 뷰를 위해 보존하되, 판단(할일)·줄기(leaf)·
통계는 논리 메일당 1회**가 되게 한다. "1인 메일함 가정"을 팀 단위로 올리는 패킷.

## 검증된 사실 (2026-07-02 실측)

1. **수집 구조가 사본을 만든다**: team_cli 가 팀 등록부의 메일함별로 순회 fetch 하고 메일마다
   owner 메타를 붙인다(src/mail_collect.mjs ①~③ 주석·구현). 같은 메시지가 수신자 수만큼
   원장 행이 되는 것은 구조적 귀결이며 owner 가 ERP 메일함에서 실제로 관측.
2. **메일소스ID는 사본 매칭 키로 쓸 수 없다**: P26-014 원장 실측 — 53자 복합키
   `provider:계정:폴더_uid` 형태(콜론 구분, RFC Message-ID `<...@...>` 아님). 메일함 종속.
3. **스레드 컬럼 채움율 100%** (P26-014 79행 전부) — 그룹핑 보조키로 사용 가능.
4. **게이트웨이 이벤트 스키마에 provider_message_id, to, cc 가 required 로 실존**
   (guild_hall/gateway/mail_fetch/spec/email_event.schema.json 10·13·14행) — 데이터는 이미
   수집되나 원장 21컬럼(헤더 실측: 발신자만 있고 수신자/참조 없음)으로 흐르지 않는다.
5. 원장 표준 `soulforge.project_mail_history.private.v1` 은 Codex 소유(로드맵 후보 22·23 선례)
   — 컬럼 추가는 K-5 조율 사항.
6. 처분 영수증 채널(no_action → pending 영구 제외)과 공용 작성기 tools/mail_receipts.mjs 가동 중.
7. 할일_장부 자동화 컬럼에 `소스그룹키`(source_group_ref)가 이미 존재하고 candidates 의
   source_group_ref 를 그대로 기록한다(tools/mail_to_task_ledger.mjs 254·274행) — 그룹키를
   실을 자리가 이미 있다.
8. 계약 근거: 줄기 8단계 루프의 2단계가 "fingerprint — 중복/thread 후보"로 이 기능을 예정
   (docs/architecture/guild_hall/PROJECT_CONTEXT_GRAPH_V0.md) — 새 발명이 아니라 계약 이행.
9. 표본 한계(정직): P26-014 원장 CSV(79행, 6/24 갱신)는 대부분 단일 메일함 시대 데이터라
   사본 그룹이 2건뿐 — **팀 수집 체제의 실제 사본 규모는 회사 runtime 원장에서 실측 필요**.

## 구현 전 확인 (착수 게이트)

- [ ] 회사 runtime 원장(팀 수집분)에서 사본 그룹 표본 10건: 같은 발송의 메일함별 수신시각
      편차 분포 실측 → 시각 버킷 크기 확정(제안 기본 ±10분).
      확인(예): `Import-Csv 메일_이력.csv | group {정규화제목+발신자} | ? Count -gt 1`
- [ ] 정규화 제목 규칙이 실제 변형(RE:/FW:/Fwd:/답장:/전달:/(외부) 태그, 대괄호 태그 순서)에서
      안정적인지 표본 대조.
- [ ] 이벤트유형의 발신 값 실측: directionOf() 패턴(`/발신|보낸|sent|out/i`,
      scan_mail_ledger.mjs 53행)이 실데이터 값과 매칭되는지 확인 — 안 맞으면 발신 필터를
      메일함 계정==발신자 매칭으로 폴백.
- [ ] K-5 owner/Codex 결정: 원장에 `메일메시지ID`(provider_message_id)와 `수신역할`(to|cc)
      컬럼 추가 여부. **추가되면 fingerprint 는 폴백으로 강등**되고 정확 매칭 + "TO 수신자 =
      담당 후보" 승격이 가능해진다(데이터는 이미 수집 중 — 사실 4).

### blocked 기록 (2026-07-02 Codex preflight)

- 첫 착수 게이트는 아직 닫을 수 없다. 로컬에서 확인 가능한 runtime/metadata 표면
  (`_workmeta/**/reports/메일_이력/메일_이력.csv`, `ui-workspace/apps/dev-erp/data/dev-erp.db`)
  은 21컬럼 원장 형식이며 `메일메시지ID`/`수신역할` 컬럼이 없다.
- 같은 `정규화제목+발신자` 기준의 다중 메일함 후보는 현재 DB 518행 중 2그룹뿐이었다.
  그중 1그룹만 10분 이내(9.53분)였고, 다른 1그룹은 동일 발송 표본으로 볼 수 없는 장기 편차였다.
  P00-000_INBOX 435행은 다중 메일함 후보 0그룹, P26-014 79행은 2그룹이었다.
- 따라서 "회사 runtime 원장(팀 수집분) 사본 그룹 표본 10건" 요구를 충족하지 못한다.
  시각 버킷 크기를 확정하지 않고 E8 구현을 진행하면 추측 쓰기가 되므로 이 패킷은 blocked.
- owner 질문: 팀 수집분 runtime 원장에서 같은 발송의 메일함별 사본 표본 10건을 제공/export 할지,
  아니면 K-5(`메일메시지ID`, `수신역할`)를 먼저 확정해 fingerprint 를 폴백 경로로 낮출지 결정 필요.

## 설계

### 공용 유틸: tools/mail_fingerprint.mjs (순수 함수, E1·E4·행보관 공유)

```
normalizeSubject(s): NFC → lowercase → 선두의 (re|fw|fwd|답장|전달|회신)[:\s\]]* 반복 제거
  → 공백 축약. 대괄호 태그([P99] 등)는 보존(프로젝트 신호).
mailFingerprint(row): sha256(normalizeSubject(제목) + "|" + 발신자.toLowerCase()
  + "|" + timeBucket(메일수신시각, 10분)).slice(0,16) — 접두 "mg:" 부여
  ⚠️ 메일수신시각은 ISO 8601 타임존 포함 형식 — timeBucket 은 **UTC 로 정규화 후** 버킷팅
  (타임존 혼합으로 같은 발송이 다른 버킷에 떨어지는 것 방지).
groupByFingerprint(pendingRows): Map<groupKey, rows[]> — 스레드 값이 서로 다르면
  같은 fingerprint 라도 분리(보수 병합: 오병합 > 오분리 해악 원칙)
⚠️ 발신 메일 제외(검증에서 실측된 누락 보완): 메일_이력에는 발신 이벤트(이벤트유형
  mail_sent_* 계열)도 포함된다. fingerprint 그룹핑·판단 대상은 **수신 메일만** —
  scan_mail_ledger.mjs 53행 directionOf() 패턴(`/발신|보낸|sent|out/i`)으로 발신을 걸러
  영수증 없이 skip 한다(발신 메일은 E4 팔로업 스캐너의 입력으로 보존해야 하므로
  no_action 영수증을 쓰면 안 된다).
pickRepresentative(rows): 결정적 대표 1건 —
  ① (K-5 이후) 수신역할=to 인 사본
  ② 가장 이른 메일수신시각 → ③ 메일함 사전순 (tie-break 안정성)
```

### 배선 1: 판단 중복 제거 (tools/auto_intake_cycle.mjs — E1 pre-pass 앞단)

```
1. pending 을 groupByFingerprint 로 묶는다
2. 그룹 크기 1 → 기존 흐름
3. 그룹 크기 >1:
   a. 대표만 분류(LLM/스레드 검사) 대상으로
   b. 나머지 사본 → no_action 영수증: reason=`duplicate_of:<대표 이력키>` (--apply 시,
      공용 작성기, 멱등). 사본 행 자체는 원장·core_mail 에 그대로 — 개인 메일 뷰 불변 ★
   c. 대표가 할일 후보가 되면 candidates.source_group_ref = 그룹키 (컬럼 실존 — 사실 7)
4. summary 에 { groups, copies_suppressed } 카운트
```

### 배선 2: 줄기(leaf) 중복 제거 (tools/haengbogwan_run.mjs)

```
buildMetadataRunContextEvents 의 mail 이벤트 생성 전에 같은 유틸로 그룹핑 —
그룹당 leaf 1개만 생성(대표 기준), summary_hint 에 `copies=<n>` 표기.
사본 수만큼 leaf 가 생겨 줄기 통계(sources)가 부풀던 것을 차단.
```

### 내부 지시 전달(FW) 처리 — E1 과의 관계

- 원본(업체→owner)과 전달(owner→팀원들)은 **발신자가 다르므로 fingerprint 가 다르다**
  = 별개 그룹(옳음: 전달은 지시라는 새 사건). 전달 사본들(팀원 N명 수신)은 같은 그룹 = 1회 판단.
- 두 그룹은 스레드로 연결 → E1 로직이 처리: 원본 그룹의 할일이 열려 있으면 전달 그룹은
  followup event 로 귀속, 없으면 전달(지시) 그룹이 주 후보가 되고 lineage 로 원본 참조.
- (K-5 이후) 전달 메일의 TO 팀원을 suggested_assignee_ref 로 제안 — E3 규칙 제안과 병합
  (둘 다 제안 계층, 확정은 사람).

## 경계 가드

- 원장/DB 의 사본 행을 삭제·수정하지 않는다 — 판단·줄기 계층에서만 그룹핑.
- 보수 병합: 제목 정규화 후에도 발신자·시각버킷·스레드 중 하나라도 다르면 별개 그룹.
  그룹핑 근거(구성 이력키 목록)를 영수증 reason 과 receipts JSONL 에 남겨 사후 감사 가능.
- 본문 미접근. 제목은 fingerprint 해시 계산에만 사용(출력에 해시·이력키만).
- 대표 선정·그룹핑은 결정적(같은 입력 → 같은 출력) — 테스트로 고정.

## 검사 방법

### node:test (신규 test/mail_fingerprint.test.mjs + cycle 통합 케이스)

1. `정규화: "RE: FW: [P99] 견적" ≡ "[P99] 견적", "전달: " 접두 제거, 태그 보존`
2. `fingerprint: 같은 제목·발신자·5분차 → 동일 / 발신자 다르면(원본 vs FW) 분리`
3. `보수 병합: 같은 제목·발신자·다른 날짜 → 분리 / 스레드 상이 → 분리`
4. `대표 선정 결정성: 입력 순서를 섞어도 같은 대표` (수신시각→메일함 tie-break)
5. `cycle 통합: 사본 3(메일함 3) fixture → classify 1회, duplicate_of 영수증 2,
   재실행 시 pending 0·영수증 신규 0(멱등)`
6. `줄기: 사본 3 → context 이벤트(leaf) 1 + copies=3 표기` (haengbogwan_run 테스트 확장)
7. `개인 뷰 불변: 원장 행수·core_mail 행수는 그룹핑 전후 동일`

### 수동 verify

```
cd ui-workspace/apps/dev-erp
node tools/auto_intake_cycle.mjs --workmeta <fixture> --json      # dry-run: groups/copies_suppressed 표시
node tools/auto_intake_cycle.mjs --workmeta <fixture> --apply --json
node tools/mail_to_task_pending.mjs --workmeta <fixture>           # 사본이 pending 에서 사라짐
# runtime 적용 전: 실원장 dry-run 으로 병합 예정 그룹 목록을 owner 가 1회 검토
```

### 공통 검사 총칙 수행 (마스터 플랜)

## 완료 기준 (acceptance)

- "업체 메일 1 + 전달 사본 3" fixture 에서: 할일 최대 2개(원본 1·지시 1, E1 결합 시 1개)·
  줄기 leaf 그룹당 1개·개인 메일 뷰 4행 유지·중복 할일 0.
- 그룹핑이 보수적(오병합 케이스 테스트 green)이고 결정적임이 고정된다.
- 직렬 전체 테스트 green + verify_gate L1 PASS.
- K-5 결정이 나면 이 파일에 결정·반영 상태를 갱신한다(fingerprint → 폴백 강등 경로 명시됨).
