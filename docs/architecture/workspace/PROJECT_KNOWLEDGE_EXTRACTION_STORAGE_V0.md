# Project Knowledge Extraction Storage v0

## 목적

프로젝트 지식 등록·추출 작업(장서목록=레그, 본문 추출, 추출 메타)의 저장 위치를
`<project_code>` 단위로 **격리**해서 고정한다. `HWP_NORMALIZATION_V0.md` 의 폴더 구조와
`COMPANY_COMMON_SOURCE_STORAGE_V0.md` 의 분류 규칙을 HWP 뿐 아니라 **모든 문서 추출
(PDF/HWPX/XLSX/DOCX/PPTX 등)** 로 일반화한 규칙이다.

## 핵심 원칙

1. **프로젝트별 격리.** 모든 지식 산출물은 그 자료가 속한 `<project_code>` 폴더 안에만 둔다.
   전역으로 모아두거나 프로젝트를 섞지 않는다. 단계/과제가 다르면(예: `탐색개발`↔`체계개발`)
   서로 다른 project_code 로 분리한다 — 섞으면 오염이다.
2. **메타데이터와 payload 분리.** `_workmeta/<code>/` 에는 메타데이터(레그·포인터·해시·상태)만
   두고, 추출 본문 같은 payload 는 `_workspaces/<code>/` 에 둔다.
3. **금지.** `_workspaces/_local/...` 같은 개인 임시 폴더, 임의 top-level 분기, 미승인
   `knowledge/projects` 분기를 만들지 않는다. `_workmeta` 에 원문/추출본문을 넣지 않는다.

## 저장 위치 (프로젝트 자료)

| 산출물 | 위치 |
| --- | --- |
| 장서목록(레그, 메타) | `_workmeta/<project_code>/reports/source_research/<set_id>_metadata_source_ledger.yaml` |
| source root binding | `_workmeta/<project_code>/bindings/<set_id>_source_roots.yaml` (절대경로/정션 루트는 여기만) |
| 추출 본문(derived text, payload) | `_workspaces/<project_code>/reference_payloads/knowledge_extract/<batch_id>/derived_text/` |
| 추출 manifest(packet index) | `_workspaces/<project_code>/reference_payloads/knowledge_extract/<batch_id>/extract_manifest.json` |
| 연결 receipt | `_workmeta/<project_code>/knowledge_ingest_receipts/events/<YYYY-MM>.jsonl` |
| RAG payload root (target) | `_workspaces/<project_code>/reference_payloads/rag/` |
| RAG index | 위 root의 `indexes_local/source_text_indexes/<source_id>_source_text_index/` |
| RAG trace/answer/review/work card | 위 root의 `traceability_sidecars/`, `answer_runs/`, `source_text_quality_reviews/`, `source_text_work_cards/` 등 asset-kind 하위 경로 |

현재 runtime/docs 일부가 project RAG asset을
`_workspaces/knowledge/rag/indexes_local/source_text_indexes/**`에 두고 project_code 접두로
격리하거나 같은 common root의 traceability sidecar, answer run, source-text quality review,
work card가 이를 참조한다. 이는 모두 legacy migration input이며 target 지원 완료가 아니다.
고성능 PC에서 asset/consumer read-only inventory, project/common 분류, metadata receipt owner,
collision/rollback dry-run, 한 project pilot을 통과한 activation gate 이후에는 project
payload의 legacy path 신규 write를 금지한다. `_workspaces/knowledge/rag/**`는 cross-project
common RAG 전용 target이다.

## 저장 위치 (회사 공통 — 특정 과제 아님)

여러 프로젝트 공통 참조 지식(예: 고객 품질/도면 프로세스)은 과제 폴더가 아니라 회사 공통 면에 둔다.

| 산출물 | 위치 |
| --- | --- |
| 장서목록(레그) | `_workmeta/system/reports/source_research/<set_id>_metadata_source_ledger.yaml` |
| source packet / 추출 본문 | `_workspaces/knowledge/common/company/<source_set_id>/derived_text/` |
| 연결 receipt | `_workmeta/system/knowledge_ingest_receipts/events/<YYYY-MM>.jsonl` |

## HWP 경계

HWP 원문은 직접 추출하지 않는다. `HWP_NORMALIZATION_V0.md` 를 따라 owner-approved worksite 에서
HWPX 파생본을 먼저 만들고, 그 HWPX 를 위 derived_text 경로로 추출해 합류한다. 장서목록에는
HWP 항목을 `extraction_probe.status: needs_hwpx_normalization` 으로 남긴다.

## 경계와 claim ceiling

- 추출 본문/manifest 는 metadata-only 경계를 넘지 않는다: 원문 자체를 public repo 에 올리지 않고,
  본문 payload 는 `_workspaces`(local/owner worksite)에만 둔다.
- 기본 claim ceiling 은 `observed`. 추출·등록만으로 source truth, RAG index 승인, public canon
  promotion 이 생기지 않는다. 승급은 `RAG_THREE_STAGE_OPERATING_MODEL_V0.md` 와 review gate 를 따른다.
- 국방/고객 자료는 외부(public repo, 외부 API)로 보내지 않는다. 본문 분석·요약은 로컬 런타임만 쓴다.

## Feature-OFF 명시 범위 조회

- public synthetic project-history projection의 read-only helper는 호출자가
  `project` 또는 `common`을 반드시 명시하고, projection의 origin project도
  exact-match해야 한다. scope가 반대이거나 origin이 다르면 조회를 거부하며
  project→common, common→project, foreign-project fallback은 하지 않는다.
- 이 helper는 held metadata index만 조회한다. raw question, source/body/chunk,
  locator, private path를 결과에 남기지 않고 모든 authority와 write flag를
  false로 유지한다. accepted generation pointer, 실제 project/common payload,
  Wiki/RAG/canon/ontology, ERP/MCP service를 읽거나 변경하지 않는다.
- 따라서 이 slice는 feature-OFF metadata query contract이며 accepted knowledge,
  live RAG, full `erp_search_knowledge`, production ACL/generation adapter의 완료
  증거가 아니다.

## Owner 선언 정본(private canon)과 자동 인용

owner 결정(2026-06-28): 워크스페이스 프로젝트 지식도 정본이 될 수 있다. 정본에 공개/비공개 구분은 없다 — 다만 국방/고객 자료는 공개 `.registry/knowledge` 에 못 올리므로 **비공개 워크스페이스 정본**으로 둔다.

- owner 는 위키 페이지를 정본으로 직접 선언할 수 있다. 본문은
  `_workspaces/knowledge/**/wiki/**` 또는
  `_workspaces/<project_code>/reference_payloads/knowledge_extract/**/wiki/**`에 두고,
  frontmatter 에 `claim_ceiling: canon_entry`,
  `canon_surface: private_workspace_canon`, `owner_declared_canon: true`,
  `public_registry_excluded: true`, exact `wiki_revision_id`, Wiki body `content_id`,
  `owner_decision_ref`를 모두 둔다.
- 비공개 정본은 공개 `.registry/knowledge` 등록과 무관하다. 공개 canon 은 별도의 public-safe 추상만 다룬다(국방 구체값 제외).
- 2026-07-15 Google Drive ontology package 정책은 이 private workspace
  canon을 대체하지 않는다. 개인 Drive/NotebookLM에는 국방·고객·회사 비공개
  원문을 올리지 않으며, 원문 복원이 불가능하다고 별도 검토된 public-safe
  reusable abstraction만 ontology release 후보가 될 수 있다.
- owner 가 `auto_cite_allowed: true` 로 표시한 정본은 응답·작업에서 **자동 인용·재사용**해도 된다(owner 사전 승인). 인용 시 bare page path가 아니라 exact `wiki_revision_id + content_id + owner_decision_ref`로 구성한 `knowledge_revision_ref`를 남긴다.
- 주의: `auto_cite_allowed` 는 owner 권한 표시다. 실제 자동 retrieval 동작(비서가 응답 중 자동으로 이 지식을 꺼내 쓰는 기능)은 별도 구현이 필요하며, 표시만으로 동작이 켜지지 않는다.
- `_workmeta`에는 본문을 복사하지 않고 private canon의 ref/hash/owner 결정/검토
  metadata만 둔다. owner 선언은 해당 Wiki revision에만 적용되며 이후 revision을 자동
  승인하지 않는다.

## 검증

- derived_text 파일 수 == extract_manifest 의 `extracted` 카운트.
- public Git status 에 원문 payload·추출 본문·실제 연락처/조직 정보가 잡히지 않는다.
- `_workmeta` 기록이 metadata-only 인지 확인한다.
- project_code 격리: 한 과제의 derived_text 에 다른 과제 자료가 섞이지 않았는지 확인한다.

## 관련 문서

- [`COMPANY_COMMON_SOURCE_STORAGE_V0.md`](COMPANY_COMMON_SOURCE_STORAGE_V0.md)
- [`HWP_NORMALIZATION_V0.md`](HWP_NORMALIZATION_V0.md)
- [`../guild_hall/RAG_THREE_STAGE_OPERATING_MODEL_V0.md`](../guild_hall/RAG_THREE_STAGE_OPERATING_MODEL_V0.md)
- [`../guild_hall/KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md`](../guild_hall/KARPATHY_STYLE_WIKI_RAG_ERP_CONTRACT_V0.md)
