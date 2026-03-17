# 문서 소유 원칙

## 목적

- 새 정본 5축 기준으로 어떤 문서가 어떤 owner 경계를 설명하는지 고정한다.
- 루트 문서와 owner-local 문서의 책임 범위를 분리한다.

## 기본 원칙

- 루트 `README.md` 는 저장소 전체 상위 지도만 다룬다.
- `docs/architecture/foundation/` 는 canonical roots 의 cross-root canon 을 고정한다.
- 각 owner 루트가 materialize 되면 해당 루트 바로 아래 `README.md` 와 owner-local 문서가 그 owner의 상세 운영 정본이 된다.
- `_workspaces/<project_code>/` 아래 문서와 실행 산출물은 local/private owner 영역으로 관리한다.

## 현재 public canon 과 owner-local 정본

| 범위 | owner 의미 | 현재 public canon | owner-local 정본 위치 |
| --- | --- | --- | --- |
| 저장소 루트 `./` | 전체 상위 지도와 cross-root 경계 | `README.md`, `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` | 해당 없음 |
| `.registry/` | outer canon/store | `README.md`, `docs/architecture/foundation/*.md` | `.registry/README.md`, `.registry/docs/architecture/` |
| `.unit/` | active agent unit owner | `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` | `.unit/README.md`, `.unit/docs/architecture/` |
| `.workflow/` | workflow canon + curated learning history | `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` | `.workflow/README.md`, `.workflow/docs/` |
| `.party/` | reusable party template + template-level stats | `docs/architecture/foundation/TARGET_TREE.md`, `docs/architecture/foundation/DOCUMENT_OWNERSHIP.md` | `.party/README.md`, `.party/docs/` |
| `_workspaces/` | local-only mission site mount point | `_workspaces/README.md`, `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md` | `_workspaces/<project_code>/.project_agent/` 와 project-local 문서 |
| `.agent/`, `.agent_class/` | transition bridge | 각 루트 README 의 migration note | cleanup 전까지의 legacy 참고 문서 |
| `docs/architecture/foundation/` | 저장소 차원의 구조 canon | `docs/architecture/foundation/README.md`, `docs/architecture/foundation/*.md` | 해당 없음 |
| `docs/architecture/workspace/` | `_workspaces` 구조와 보안 정책 canon | `docs/architecture/workspace/README.md`, `docs/architecture/workspace/WORKSPACE_PROJECT_MODEL.md` | 해당 없음 |
| `ui-workspace/` | 파생 UI consumer workspace | `ui-workspace/README.md` 와 하위 README | 각 하위 패키지/앱 로컬 README |

## owner별 문서 경계

| owner | 문서에 반드시 남겨야 할 것 | 문서에서 제거해야 할 것 |
| --- | --- | --- |
| `.registry` | species/class/skill/tool/knowledge canon 구조와 설명 | active runtime, project-local truth, workflow/party owner 서술 |
| `.unit` | unit 구조, policy, protocols, runtime, memory owner 설명 | registry canon 자체나 workflow/party canon owner 서술 |
| `.workflow` | workflow 정의와 curated learning history | raw run log, run index, project-local battle log |
| `.party` | reusable party template 와 template-level stats | raw feedback dump, project operational metrics |
| `_workspaces` | local-only mission site mount 정책, `_workspaces/<project_code>/` 구조 | helper directory 를 project root 로 문서화, per-project 실자료 public 추적 |
| `.agent`, `.agent_class` | transition bridge 와 cleanup 범위 | active canonical owner root 처럼 설명하는 서술 |

## 적용 규칙

1. foundation 문서는 owner-local 세부 운영을 복제하지 않고 owner 경계만 고정한다.
2. owner 의미는 `.registry`, `.unit`, `.workflow`, `.party`, `_workspaces` 와 관련 contract 문서에서 직접 읽는다.
3. `.workflow/history` 는 curated/sanitized learning summary 만 public repo 에 남긴다.
4. `.party/stats` 는 template-level fit/observation summary 만 public repo 에 남긴다.
5. `_workspaces/README.md` 를 제외한 per-project 문서와 실자료는 public tracking 대상이 아니다.
6. `.agent` 와 `.agent_class` 에 새 canonical entry 를 추가하지 않는다.
7. 폴더 구조나 owner 책임이 바뀌면 같은 변경 안에서 해당 README 와 foundation 문서를 함께 갱신한다.
