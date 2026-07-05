# ENGINE-11-STEM-V2-GENERATOR — 줄기 생성기 v2 (링크 기반 3종 줄기)

- status: ready (cold-start 실행 가능)
- execution_owner: **engine_thread_codex** (parallel_group: G-intake-cycle — auto_intake/haengbogwan 파일군)
- 정본: `STEM-V2-ONTOLOGY.md` (온톨로지·판정 순서·연결 등급). 이 패킷은 생성기 교체만 소유.
- 규모 추정: 코드 ~250줄 + 테스트 ~120줄 (1~1.5일)

## 목적 (1줄)

project_context 가지 배치를 "제목 문자열 클러스터"에서 "링크 기반 3종 줄기(골격/작업/이력)"로
교체해, 그래프가 업무 단위로 읽히게 한다.

## 검증된 사실 (2026-07-05 표면 스레드 실측 — 신뢰 가능)

1. 현재 배치 로직: `tools/haengbogwan_run.mjs` `branchHintForProject()` — ①과제 규칙 키워드
   ②`GENERIC_BRANCH_SEEDS`(requirements/design/test/…10종) ③폴백. 이벤트 branch_hint →
   `tools/haengbogwan_project_context.mjs:396-397` branchLabel→branchKeyFor.
2. P24-049 는 `_workmeta/P24-049/rules/` 에 context_hint_rules.json **부재**(연락처 스타일 파일뿐)
   → 제목 조각이 가지가 됨. 실측: sources 347행(mail 337) 중 "실무협의" 단일 가지 91+.
3. 탄생 신호 기존재: `store.confirmItem`(status unclassified→open, review_status='approved',
   anchor_stage_code/stage_id/link_kind 확정) — 사람 승인 = 작업줄기 탄생.
4. 성장 메커니즘 기존재: E1 threadDedupPrePass 가 `mail_followup` 이벤트(item_ref=할일키)로
   후속 메일을 기존 할일에 귀속. 스레드 키 = `mail_thread_key.mjs` threadKeyForMail +
   threadKeyAliasesForMail(legacy 호환, item01 완료).
5. 골격 데이터 기존재: core_deliverable(P26-014 128건)·게이트 8단계·core_stage.
6. 사본 억제 기존재: E8 groupMailCopies(대표 1건). 팀 사본은 줄기에 1건만 진입.

## 구현 전 확인 (실측으로 닫을 것)

- [ ] project_context CSV v1 소비자 전수(그래프 탭·branch_summaries 소비 지점) — v2 컬럼 추가가
      깨뜨리는 reader 유무. (표면 스레드 메모: 그래프 탭은 branch_summaries.csv + sources.csv 읽음)
- [ ] confirm된 할일의 anchor 충족률(anchor 없는 open 할일 비율) — 골격 소속 불가분의 크기.
- [ ] "실무협의" 정규화 제목의 실제 주기(월/주) 표본 — 이력줄기 감지 파라미터 검증.

## 설계

### 출력 계약 (project_context v2 — 하위호환 컬럼 추가 방식)

- `branches.csv` 확장: `branch_kind`(skeleton|work|history|legacy), `anchor_ref`
  (work=`item:<할일id>` / skeleton=`deliverable_group:<ref>`|`gate:<code>`|`mgmt:<계약·일정|구매·납품|품질|회의체>` /
  history=`series:<정규화제목해시>`), `status`(open|closed), `born_at`, `closed_at`.
- `occurrences.csv` 신설(이력줄기 회차): series_key, occurrence_key(YYYY-MM-DD), source_count,
  spawned_item_refs(;구분), 미결 이월은 저장하지 않고 파생 계산.
- `sources.csv`: `branch_ref` 를 위 anchor 체계로 기록(문자열 라벨 매칭 폐지).
- 기존 문자열 가지는 삭제하지 않고 `branch_kind=legacy` 표시 — 신규 유입 중단.

### 생성 규칙 (온톨로지 판정 순서 그대로)

1. **골격**: 과제별 1회 시드 — 게이트·산출물 그룹·관리 4종(계약·일정/구매·납품/품질/회의체).
2. **작업줄기**: confirm 이벤트(또는 core_item status open+approved) 감지 시 branch 생성,
   anchor=item id, 라벨=할일 제목. 후속 메일은 mail_followup(기존)으로 sources 에 귀속.
   할일 done → status=closed(closed_at=done_at).
3. **이력줄기**: 정규화 제목(normalizeThreadSubject) 기준 8주 내 3회 이상 반복 →
   **승격 후보로만 기록**(branch_kind=history, status=proposed) — 확정은 사람(ERP 승인 표면 or
   review 큐). 확정 전에는 그래프가 제안 표시. 회차 = 해당 제목 메일의 날짜 클러스터(같은 날 묶음).
4. **보류**: 판정 실패 메일은 가지 미생성 — sources 에 branch_ref 빈 값으로 남기고
   pending 카운트만 요약에 노출.
5. LLM 가지 추천(2등급)은 이 패킷 범위 밖(후속 opt-in) — 필드만 예약(`suggested_branch_ref`).

### 멱등·경계

- 리빌드 멱등: 같은 입력이면 같은 branches/occurrences (기존 upsert 패턴).
- dry-run 기본 + --apply. 본문·첨부 미접촉(메타 전용). 코어 LLM 0%. 이벤트: `stem_v2_rebuild`
  (data_label=meta, 건수만).

## 검사 방법

- fixture: 확정 할일 3(1건 done) + 후속 메일 2 + 반복 제목 메일 4회(2계열) + 미판정 메일 2 →
  branches: skeleton 시드 + work 3(closed 1) + history proposed 1, 보류 2, 제목조각 가지 0.
- 기존 그래프 탭이 legacy 가지와 v2 가지를 함께 렌더해도 깨지지 않음(컬럼 추가 하위호환).
- `node --test --test-concurrency=1`(dev-erp 전건) + verify_gate Level ≥1 + 커밋 표기.

## 완료 기준 (1문장)

P24-049 리빌드 시 "실무협의"가 history 제안 1건+회차들로, confirm 된 할일들이 work 가지로,
제목 조각 가지 신규 0으로 나오면 완료.
