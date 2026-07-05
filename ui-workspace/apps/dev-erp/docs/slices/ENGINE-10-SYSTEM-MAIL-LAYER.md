# ENGINE-10-SYSTEM-MAIL-LAYER — 시스템/광고 메일 분류층 (Gmail식 격리)

- status: **done 2026-07-05** / parallel_group: G-intake-cycle / depends_on: E8·E1·E9 (done)
- 규모 추정: 프리패스 ~120줄 + 규칙 파일 + UI 액션 ~60줄 + 테스트 ~120줄 (1일)
- 작성: claude_fable-5 (2026-07-05, owner 지시 직후 인계)

## owner 지시 (2026-07-05, 원문 취지)

> "Soulforge 에서 오는 건 다 시스템 메일로 분류하고 할일에서는 빼야 하고,
> 광고성 메일들도 앞으로는 안 들어오게 하는 것 등등."

벤치마크 합의(Gmail 3층): ① 카테고리 자동분류는 **삭제가 아니라 격리**(프로모션 탭 방식 —
오분류 복구 가능) ② **사용자 규칙이 자동분류보다 우선**(결정적) ③ 사용자 액션(신고)이
분류를 계속 교정하는 피드백 루프.

## 검증된 사실 (2026-07-05 실측)

1. **자기참조 루프 실재**: dev-erp 아침 브리핑 메일(발신=owner 메일함, 제목 `[dev-erp] ...`)이
   수집기에 다시 들어와 미분류 제안이 됨. owner 수신 브리핑의 제안 30건에 '일일 업무 보고
   검토', '나이트워치 쉬운 보고서 검토 및 처리' 등 **Soulforge 자동화 메일 유래 항목 다수**
   (owner 스크린샷 확인). 시스템이 자기 출력을 자기 입력으로 삼아 할일을 불리는 구조.
2. **제외 규칙 인프라는 실존**: `mail_exclude_rule` 테이블(field=from|subject|mailbox,
   match=contains|equals) + 수집 시 저장 전 드롭 + `applyMailExcludeToExisting()` 소급 숨김 +
   관리자 패널 UI(app.js wireMailRules). **즉시 조치 완료**: `subject contains "[dev-erp]"`
   규칙 id 5 를 운영 DB 에 등록, 기존 5통 소급 숨김(2026-07-05). 기존 규칙 3·4 = 급여 차단.
3. **not_task 고신뢰 영수증 채널 가동 중**(auto_intake_cycle: `llm_not_task_high` 사유 영수증
   → pending 영구 제외) — 시스템 분류 제외에 재사용 가능한 수렴 메커니즘.
4. 미확인(착수 게이트로): 게이트웨이 이벤트 스키마에 `List-Unsubscribe` 헤더가 흐르는지,
   runtime 원장의 시스템 발신 주소/제목 패턴 전수 인벤토리, 미분류 143건 중 시스템 유래 비율.

## 설계 (Gmail 3층 매핑)

### S1. 시스템 메일 프리패스 (결정적, LLM 전 단계)

- 규칙 파일(owner 편집 가능, metadata-only): `_workmeta/system/rules/system_mail_rules.json`
  ```json
  { "schema_version": "soulforge.system_mail_rules.v0",
    "senders": ["<Soulforge 자동화 발신 주소들 — 착수 게이트 인벤토리로 채움>"],
    "subject_prefixes": ["[dev-erp]", "[Soulforge]", "나이트워치", "아침보고"] }
  ```
- auto_intake 후보 생성 **전**에 매칭 → ① core_mail 에 카테고리 라벨 `system`(기존 라벨
  체계 재사용 — 격리이지 삭제 아님, 메일 이력 보존) ② 할일 후보 생성 제외 ③ not_task
  영수증(사유 `system_mail_rule`) 으로 재판단 영구 제외.
- 주의: `[dev-erp]` subject 는 이미 exclude_rule(수집 드롭)로 처리됨 — S1 은 "보관은 하되
  할일에서 빼는" 중간층이므로 exclude 와 역할 구분을 문서화(드롭=가치 0, system=이력 가치 있음).

### S2. 광고 감지 (자동 격리 + 차단 승격 제안)

- 신호: `List-Unsubscribe` 헤더 존재(가용 시), 제목 패턴(`(광고)`, `[광고]`, `수신거부`,
  `unsubscribe`), 대량발송 발신 도메인 휴리스틱.
- 매칭 → 카테고리 `ad` + 할일 후보 제외(S1 과 동일 경로). **자동 삭제 금지.**
- 주간 요약(또는 아침 브리핑 관리자판)에 "광고 의심 N건 — 발신자 차단 규칙으로 승격?"
  제안 → 사람 승인 시 exclude_rule 로 승격(ai_proposal 큐 재사용, 코어 LLM 0% 가드 준수).

### S3. 피드백 루프 (사람 교정 → 규칙 후보)

- 미분류/메일 화면에 "시스템으로 표시" / "광고로 표시" 액션 → 해당 발신자·제목 패턴을
  규칙 후보로 ai_proposal 큐에 적재(사람 승인 후 규칙 파일/exclude_rule 반영).
- Gmail '스팸 신고' 학습의 결정적 버전 — 자동 학습이 아니라 승인 큐(가드 ② 준수).

## 착수 게이트 (실측 후 진행)

- [x] runtime 규칙 초기값: public 코드 기본값은 제목 prefix(`[dev-erp]`, `[Soulforge]`, `나이트워치`,
      `아침보고`) + 광고 제목/수신거부 신호. owner 편집 규칙 파일
      `_workmeta/system/rules/system_mail_rules.json` 이 있으면 병합해 사용.
- [x] List-Unsubscribe: pending scanner 가 `List-Unsubscribe`/`list_unsubscribe` 메타 컬럼을
      통과시키도록 배선. 컬럼이 없으면 제목/발신 패턴만으로 시작한다.
- [ ] 기존 미분류 143건 소급 정리는 운영 원장 범위 owner 확인 후 별도 ops 실행. 이번 패킷은
      신규 유입 차단/격리층과 영수증 수렴을 먼저 닫음.

## 구현 결과 (2026-07-05, codex_gpt-5)

- `tools/system_mail_rules.mjs`: `_workmeta/system/rules/system_mail_rules.json` optional loader +
  결정적 `classifySystemMail()` 추가. 본문/첨부/secret 접근 없음.
- `tools/auto_intake_cycle.mjs`: `scanPending` 직후, LLM 분류 전 `systemMailPrePass()` 추가.
  매칭된 system/ad 메일은 후보에서 제외하고 apply 시 `mail_receipts.csv`에
  `disposition=no_action`, `generation_rule_ref=system_mail_layer` 영수증을 쓴다.
- `src/store.mjs`: 기존 Gmail식 `mail_label`/`mail_label_map`을 재사용하는
  `ensureMailLabel()`·`setMailLabelByRefs()` 추가. core_mail 행은 삭제하지 않고 `system`/`ad`
  라벨만 부착한다.
- `tools/mail_to_task_pending.mjs`: `List-Unsubscribe` 메타 컬럼을 pending item에 보존.

검증:

- `node --test test/auto_intake_cycle.test.mjs` — PASS 36/36.
- 신규 회귀: system/ad 2건은 LLM mock 입력에서 제외, 업무 메일 1건만 classify 전달,
  영수증 2건 + core_mail 라벨 2건 착지.

## 완료 기준

1. 수집 2사이클 관찰 동안 시스템/광고 메일의 **미분류·할일 후보 신규 유입 0**.
2. 시스템 메일은 메일 이력에 `system` 라벨로 보존(격리 확인, 삭제 0). 광고는 `ad` 라벨.
3. 기존 시스템 유래 미분류 소급 정리 완료(owner 승인 범위 내, 별도 ops).
4. node:test green + 규칙 파일 없는 환경 하위호환(기본 규칙만 적용).

## 경계 (공통 가드 준수)

- 본문 미저장 원칙 유지 — 매칭은 발신자/제목/헤더 메타만.
- 규칙 파일은 `_workmeta`(metadata-only). 광고/시스템 판정에 LLM 0%(결정적 패턴만).
- 자동 삭제 금지 — 드롭(exclude)은 owner 가 UI 로 명시한 규칙만, 자동층은 격리까지.
