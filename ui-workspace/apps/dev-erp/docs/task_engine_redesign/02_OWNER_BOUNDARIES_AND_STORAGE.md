# 02. owner 경계와 저장 위치

| 항목 | 내용 |
| --- | --- |
| owner | workspace storage contract + dev-ERP consumer |
| authority | payload/metadata/common/project 경계와 migration gate |
| CURRENT | project RAG runtime/docs 일부가 `_workspaces/knowledge/rag/**`와 ID prefix 격리를 사용 |
| TARGET | project RAG는 project worksite, common RAG만 common worksite |
| non-goals | 현재 코드가 target을 지원한다는 주장, 실제 이동, junction/NAS mutation |
| stop | source 분류 불명, collision, path escape, rollback manifest 부재 |

## LOCKED 저장 표

| 대상 | target owner |
| --- | --- |
| project 원본/첨부/추출본문 | `_workspaces/<project_code>/**` |
| project extraction | `_workspaces/<project_code>/reference_payloads/knowledge_extract/**` |
| **project RAG payload 전체** | `_workspaces/<project_code>/reference_payloads/rag/**` |
| project Wiki/private canon payload | `_workspaces/<project_code>/reference_payloads/knowledge_extract/**/wiki/**` |
| project metadata/ontology/receipt | `_workmeta/<project_code>/**` |
| cross-project common source/Wiki/source-text RAG payload | `_workspaces/knowledge/**` |
| system metadata-only RAG manifest/navigation output | `_workspaces/system/rag/**` (기존 system owner; project payload migration 대상 아님) |
| common metadata/receipt | `_workmeta/system/**` |

`_workspaces/knowledge/rag/**`는 common-only target이다. project code를 index ID나 path
prefix에 넣는 것만으로 project owner 경계가 생기지 않는다.

## 전체 physical owner map

```text
Soulforge/
├─ _workspaces/
│  ├─ <project_code>/
│  │  ├─ <owner-approved source folders>/            # 실제 이름은 VERIFY_HP
│  │  └─ reference_payloads/
│  │     ├─ knowledge_extract/<batch>/
│  │     │  ├─ derived_text/
│  │     │  ├─ extract_manifest.json
│  │     │  └─ wiki/
│  │     └─ rag/
│  │        ├─ indexes_local/
│  │        ├─ traceability_sidecars/
│  │        ├─ answer_runs/
│  │        ├─ source_text_quality_reviews/
│  │        └─ source_text_work_cards/
│  ├─ knowledge/                                     # cross-project common knowledge payload
│  └─ system/rag/                                    # metadata-only system output
├─ _workmeta/
│  ├─ <project_code>/                                # metadata/pointer/hash/event/ontology only
│  │  ├─ knowledge/source_revision_records/
│  │  ├─ knowledge/source_revision_events/<YYYY-MM>.jsonl
│  │  ├─ ontology/knowledge_bindings/events/<YYYY-MM>.jsonl
│  │  └─ reports/<source-owner ledgers>/              # exact CURRENT path는 VERIFY_HP
│  └─ system/                                        # common metadata/receipt/access history
└─ dev-ERP runtime DB                                # core_item current + event_log evidence
```

TaskDriver의 최종 physical table/ledger는 아직 열린 migration 결정이다. 위 지도에 새 임의
경로를 만들지 말고 ENGINE-13 inventory가 current writer와 replay 요구를 확인한 뒤 정한다.

## legacy migration

현행 project RAG의 `_workspaces/knowledge/rag/**` 사용은 **legacy migration input**이다.
index만 이동 대상으로 좁히지 않는다. project-bound index, traceability sidecar, answer run,
source-text quality review, work card와 그 payload consumer를 모두 분류한다. review/receipt/access
metadata는 payload와 함께 옮기지 않고 해당 `_workmeta/<project_code>/**` owner를 확인한다.
activation 전 고성능 PC에서 다음 순서로만 다룬다.

1. read-only inventory: opaque asset/index/source IDs, asset kind, project binding 근거,
   size/hash/status, inbound/outbound consumer만 수집
2. classification: `project | common | unresolved | conflict`
3. dry-run map: old ref -> target ref, collision, consumer, rollback source를 출력
4. consumer crosswalk: ERP/RAG/Wiki/source card가 새 ref를 읽을 수 있는지 합성 검증
5. one-project copy/rebuild pilot; source original과 legacy index를 삭제하지 않음
6. hash/lineage/query parity와 rollback 검증 뒤 activation decision
7. gate가 활성화된 시점부터 project payload의 **legacy path 신규 write 금지**

gate 이전에는 현행 writer를 조용히 redirect하지 않는다. gate 이후 legacy write가 감지되면
새 target에 자동 복사하지 말고 fail closed + migration alert로 보낸다.

## no-raw/public rules

public inventory 예시는 opaque refs와 합성 path만 사용한다. 실제 project name/path/body/chunk,
UNC/NAS root, account, private binding은 public repo에 쓰지 않는다. `_workmeta`도 metadata-only다.

## canonical refs

- [`PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md`](../../../../../docs/architecture/workspace/PROJECT_KNOWLEDGE_EXTRACTION_STORAGE_V0.md)
- [`WORKSPACE_PROJECT_MODEL.md`](../../../../../docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md)
- [`PROJECT_FILE_ACTIVITY_REVISION_V0.md`](../../../../../docs/architecture/workspace/PROJECT_FILE_ACTIVITY_REVISION_V0.md)
- [`08_MIGRATION_AND_IMPLEMENTATION_PLAN.md`](08_MIGRATION_AND_IMPLEMENTATION_PLAN.md)
