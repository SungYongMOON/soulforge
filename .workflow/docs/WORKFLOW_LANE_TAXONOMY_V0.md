# Workflow Lane Taxonomy v0

Status: `draft`
Owner: `.workflow`
Claim ceiling: `canon_candidate`

이 문서는 workflow `classification_lane` 과 party `service_lane` 에 쓰는 lane id 의 한글 표시 이름 초안이다.
영문 id 는 기계가 안정적으로 참조하는 값이고, 한글 이름은 사람이 검토하고 부르는 표시 이름이다.

## 필드 규칙

- `primary` / `secondary`: stable lane id. 영문 `snake_case` 를 쓴다.
- `primary_name_ko` / `secondary_name_ko`: 사람이 보는 한글 표시 이름이다.
- 한글 이름만으로 실행 party, workflow owner, project owner, mission binding 을 만들지 않는다.
- 실제 실행 관계는 `execution_binding`, party `allowed_workflows.yaml`, 또는 mission binding 으로만 확정한다.

## 주요 workflow lane

| lane id | 한글 이름 | 의미 |
| --- | --- | --- |
| `project_management` | 프로젝트 관리 | 프로젝트 생성, 등록, readiness, 리스크, owner decision, 운영 상태 정리 |
| `mail_management` | 메일 관리 | 메일 수집, 분류, 프로젝트 매칭, inbox holding, 작업지시서 감지 |
| `knowledge_management` | 지식 관리 | 지식 접근 기록, wiki curation, knowledge preflight, knowledge candidate triage |
| `source_management` | 소스 관리 | 공식/owner-approved source packet, source gap, provenance, source sufficiency |
| `design_asset` | 설계 자산 | XML, Capture, 부품 자료, PCB guide, diagram, harness asset 생성/정리 |
| `systems_engineering` | 체계공학 지원 | 요구사항, 검증계획, review gate, FCA/PCA, baseline/change control |
| `simulation_verification` | 시뮬레이션/검증 | simulation source/deck/run, test harness, result ingest, verdict packaging |
| `review_governance` | 리뷰/거버넌스 | post-development review, review evidence, action closure, strategic review |
| `skill_authoring` | 스킬 작성 | Soulforge skill package 작성, 검토, 설치 handoff |
| `workflow_authoring` | 워크플로우 작성 | workflow 생성, 진화, 검증, rename/alias 검토 |
| `workspace_management` | 작업공간 관리 | `_workspaces` link, portable binding, cloud-folder workspace materialization |
| `risk_register` | 리스크 등록 | open question, blocker, technical risk, owner follow-up queue |

## 주요 party service lane

| lane id | 한글 이름 | 의미 |
| --- | --- | --- |
| `governance` | 거버넌스 | 검토, 승인 전 점검, authoring/review orchestration 에 맞는 조합 |
| `source_lineage` | 소스 계보 | source lineage, boundary stabilization, follow-up drafting 에 맞는 조합 |
| `frontline_execution` | 전방 실행 | bounded task assault 와 빠른 실행 조율에 맞는 조합 |

