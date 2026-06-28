# 담당자 메모리 과제 격리 (Memory Project Isolation)

> 목적: 사람 단위 통합 메모리가 과제 경계를 넘어 다른 과제 작업 AI 컨텍스트로
> 새는 것(cross-project bleed = 오염)을 막는다. 방위 과제 격리 기준에서 지식에
> 적용한 "탐색 ≠ 체계 오염금지"를 메모리에도 동일하게 적용한 것.
>
> 작성: claude_opus-4-8 · 2026-06-28 · 교차검증(Codex/리뷰어)용.
> 관련 커밋: `b8fb1ab6`(격리 backbone), `6e4c3355`(쓰기 태깅 + 파일정본 왕복).

---

## 1. 문제 (왜 만들었나)

변경 전 메모리 구조:

- 메모리는 **사람(담당자 `ref`)별 한 풀**이고, 누적 항목(`assignee_memory_item`)에
  **과제 식별자가 없었다**. (`core_item` 등 대부분 테이블엔 `project_id`가 있는데 메모리만 없었음.)
- 주입(`memoryForInjection`)은 그 사람의 active 항목 전체를 후보로 두고 **관련도(토큰 겹침
  Jaccard) + recency + salience 점수 상위만** 골라 넣었다.
- 따라서 한 사람이 과제 A·B를 오가면 **A에서 쌓은 항목이 B 작업 AI에 주입될 수 있었다**:
  - 관련도는 **의미가 아니라 토큰 겹침**이라, 어휘를 공유하는 방위 과제들 사이에서 약하다.
  - B에 관련된 항목이 없으면 관련도 0이어도 **recency/salience로 A 항목이 그냥 채워졌다**.
- 결과: "A 고객/사양/계약 정보"가 B 작업 컨텍스트로 새는 오염 경로가 구조상 존재했다.

---

## 2. 설계 결정

1. **과제 태그**: `assignee_memory_item`에 `project_id TEXT` 추가. `NULL` = 과제무관 **일반**.
2. **주입 격리(하드 필터)**: 주입 후보 = `project_id IS NULL(일반) OR project_id = 현재 과제`.
   **다른 과제 항목은 SQL 단계에서 제외**(점수 경쟁에 끼지도 못함). 이 격리는 기존 관련도/recency/
   salience **점수와 별개의 하드 게이트**다 — 점수는 "그 다음" 우선순위만 정한다.
3. **dedup도 과제 범위 한정**: ADD/UPDATE/NOOP 게이트가 **같은 과제(또는 일반끼리)** 항목하고만
   비교. 다른 과제의 동일 문구는 병합되지 않고 별도 보존(서로 오염/덮어쓰기 방지).
4. **core blob은 일반 유지**: `assignee_memory`(본인이 직접 쓰는 규칙)는 과제 무관 일반 규칙이므로
   항상 주입(과제 격리 대상 아님). 과제 비밀을 여기 적으면 전 과제에 새므로 "일반 규칙만" 원칙.
5. **하위호환**: 마이그레이션은 컬럼 추가뿐 → 기존 항목은 전부 `project_id = NULL = 일반`이 되어
   **종전대로 모든 과제에 주입**된다. 새로 과제 태그가 붙는 항목만 격리된다(점진 적용).

---

## 3. 변경 내역 (파일·함수)

### `src/store.mjs` — `b8fb1ab6`
| 위치 | 변경 |
| --- | --- |
| `CREATE TABLE assignee_memory_item` | `project_id TEXT` 컬럼 추가(신규 DB용) |
| `openStore()` ddl 배열 | `ALTER TABLE assignee_memory_item ADD COLUMN project_id TEXT`(기존 DB 멱등 마이그레이션, try/catch) |
| `addMemoryItem(ref, {…, project_id})` | `project_id` 수용. dedup 비교 대상을 **같은 과제 범위로 한정**(`WHERE … ((project_id IS NULL AND ? IS NULL) OR project_id=?)`). INSERT에 `project_id` 포함 |
| `retrieveMemoryItems(ref, {…, project_id})` | 후보 조회에 `AND (project_id IS NULL OR project_id=?)` 격리 필터 |
| `memoryForInjection(ref, budget, context, project_id)` | `project_id`를 retrieve로 전달 |
| `listMemoryItems` | 반환 컬럼에 `project_id` 추가 |
| `appendAssigneeMemory(ref, text, project_id)` | `project_id` passthrough(완료지식→메모리 경로용) |

### `server.mjs` — `b8fb1ab6`
| 위치 | 변경 |
| --- | --- |
| Codex 작업 스레드 생성(`createCodexTaskThread`, ~L453) | 주입 호출에 `item.project_id` 전달(**시작 시**) |
| Codex 작업 메시지(~L1084) | 주입 호출에 `item.project_id` 전달(**매 턴**) |
| `/api/me/memory/item` (add op) | 본문 `project_id` 수용 → `addMemoryItem` |
| `/api/memory/append` | 본문 `project_id` 수용 → `appendAssigneeMemory` |

### `static/app.js` — `6e4c3355`
| 위치 | 변경 |
| --- | --- |
| 디제스트 `+ 메모리` 버튼 | `data-mem-proj="${p.payload?.project_id}"` 부착 |
| `.mem-add` 클릭 핸들러(`/api/memory/append` fetch) | `project_id: b.dataset.memProj || null` 전송 |

### `tools/memory_ledger.mjs` — `6e4c3355` (파일정본 ↔ DB 왕복)
| 위치 | 변경 |
| --- | --- |
| `ITEM_COLS` | `project_id` 추가 → export CSV에 컬럼 포함 |
| `--apply` `itemIns` INSERT | `project_id` 포함 |
| `--apply` `itemExists` 중복판정 | `project_id` 범위까지 비교(과제별 동일문구 보존) |

### `test/memory_project_isolation.test.mjs` — `b8fb1ab6` (신규, 4 케이스)
1. retrieve가 현재 과제+일반만, 다른 과제 차단.
2. `memoryForInjection`이 다른 과제 비밀("12억")을 안 흘림.
3. dedup이 같은 과제 범위 안에서만 — 다른 과제 동일문구는 별도 ADD.
4. 기존 무태그(NULL=일반) 항목은 모든 과제에 하위호환 주입.

---

## 4. 동작 방식

### 쓰기 경로 (전수 — 빠짐없이)
메모리에 쓰는 곳은 **3개뿐**이다(서버 측 자동 캡처 경로 없음 — 전부 사용자 액션):

| 경로 | 과제 태그 | 비고 |
| --- | --- | --- |
| 디제스트 **`+ 메모리`**(완료지식→메모리, `/api/memory/append`) | ✅ 해당 할일 `project_id` 자동 태깅 | 격리의 주 입력 |
| 개인 **`+ 항목`**(내 메모리 패널, `/api/me/memory/item`) | ⬜ **일반(NULL) 기본** | 본인 일반 규칙 입력 용도. 안전(일반은 누설이 아니라 공유 의도). 과제 선택 UI는 미제공 |
| `내 메모리` **core 편집**(`/api/me/memory`) | ⬜ 일반(설계상 과제 무관) | 본인 작성 규칙 blob |

> "일반(NULL)"은 누설이 아니라 **의도된 공유**다(사람 습관·규칙). 격리가 막는 건 **과제 태그가
> 붙은 항목이 다른 과제로 가는 것**이다.

### 읽기·주입 경로
`memoryForInjection(ref, 1800, context, project_id)` (Codex 작업 시작 시 + 매 턴 호출):
1. core blob 먼저(예산 절반까지, 항상).
2. `retrieveMemoryItems`가 **`project_id IS NULL OR = 현재 과제`** 항목만 후보로 조회(하드 격리).
3. 그 후보를 점수(맥락 있으면 `0.6·관련도+0.2·recency+0.2·salience`)로 정렬해 예산 내 상위만.

---

## 5. 한계·주의 (정직하게)

- 개인 `+ 항목`/core blob은 **일반 기본**이며 과제 선택 UI가 없다. 사용자가 여기 과제 비밀을
  적으면 일반으로 저장돼 전 과제에 주입된다(설계상 "일반 규칙만" 가정). 향후 과제 드롭다운 추가 여지.
- **과제별 메모리 보기 화면**은 아직 없다(`listMemoryItems`가 `project_id`를 반환하므로 UI 추가는 가능).
- 관련도는 여전히 토큰 겹침(의미 아님)이나, **격리는 점수가 아니라 하드 SQL 필터**라 관련도 약함과
  무관하게 다른 과제는 차단된다.
- 성능 인덱스 `(ref, project_id, status)`는 미추가 — 사람당 항목 수가 작아 현재 무영향(필요 시 추가).
- core blob 격리는 일부러 안 한다(본인 일반 규칙 표면).

---

## 6. 교차검증 방법 (How to verify)

모두 `ui-workspace/apps/dev-erp/`에서 실행.

```bash
# (1) 격리 단위 테스트 — 4건 pass
node --test test/memory_project_isolation.test.mjs

# (2) 전건 회귀 — 296 pass(0 fail)
npm test

# (3) 코드 근거 grep — 격리 필터/전달/태깅이 실제로 있는지
#  retrieve 격리 필터:
grep -n "project_id IS NULL OR project_id=?" src/store.mjs       # retrieveMemoryItems
#  dedup 과제 범위 한정:
grep -n "project_id IS NULL AND ? IS NULL" src/store.mjs          # addMemoryItem
#  주입 호출이 현재 과제 전달(시작/매턴 2곳):
grep -n "item.project_id); // 담당자 메모리 주입" server.mjs
#  디제스트 버튼 태깅:
grep -n "data-mem-proj" static/app.js
```

### (4) 파일정본 왕복 실측 (export → apply 에서 project_id 보존)
다음 스크립트(요지)를 임시 DB로 돌리면 `PASS`가 나와야 한다 — 실측 완료:
```
openStore(a.db) 에 P26-014/P24-049/NULL 항목 추가
node tools/memory_ledger.mjs --export --db a.db --out <tmp>   # memory_items.csv 에 project_id 컬럼
node tools/memory_ledger.mjs --apply  --db b.db --out <tmp>   # 새 DB 로 복원
openStore(b.db).listMemoryItems(ref) → project_id 가 P26-014/P24-049/NULL 로 복원
```
검증 스냅샷: CSV에 `project_id` 컬럼·`P26-014`·`P24-049` 보존, 복원 후 각 항목 `project_id` 일치 → **PASS**.

### (5) 수동 시나리오 (오염 차단 확인)
한 담당자에 A 항목("과제A 비밀")·B 항목·일반 항목을 넣고:
- `retrieveMemoryItems(ref,{project_id:"P26-014"})` → A + 일반만, B 없음.
- `memoryForInjection(ref,1800,"…","P24-049")` 결과 문자열에 A 비밀 미포함.

---

## 7. 연관 규칙

- 지식 오염 규칙(탐색 P23-037 ≠ 체계 P26-014, project_code 격리)과 같은 원칙을 메모리에 적용.
  지식 저장 규칙: `docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md`.
- 동시편집/커밋 규칙: 루트 `AGENTS.md`(main 직접 + 슬라이스마다 commit·push·self-verify,
  외부 동시편집 징후 시 중단·보고). 본 작업은 store/server/app.js/ledger가 clean인 창에서만
  편집, Codex의 동시 haengbogwan 커밋과 파일 비겹침을 확인 후 푸시함.
