# Party Naming Contract v0

Status: `draft`
Owner: `.party`
Claim ceiling: `canon_candidate`

`canon_candidate` 는 이 문서가 public-safe authoring contract 후보라는 뜻이다. 아직 `canon_entry`, validator enforcement, rename approval 을 주장하지 않는다.

## 목적

이 문서는 Soulforge party 이름을 설명용 한국어 표시 이름, 호출용 한글 전역 호출명, 기계가 참조하는 canonical `party_id` 로 나누어 작성하기 위한 초안 규격이다.

Soulforge 에서 party 는 `.party/` 가 소유하는 reusable orchestration template 이다. party 는 member slot, allowed workflow/species/class, default workflow 같은 조합 정보를 소유하지만 workflow step 자체나 project-local run truth 를 소유하지 않는다.

2026-05-21 현재 `.party/index.yaml` 에서 관찰한 active canon party 는 `guild_master_cell`, `knowledge_wiki_cell`, `systems_engineering_cell`, `pcb_revision_library_cell` 4개다. 이전 샘플 party 였던 `vanguard_strike` 와 `lineage_strike` 는 active party canon 에서 제외되었으며, 이 문서는 현재 등록된 party 를 즉시 rename 하거나 validator 로 강제하지 않는다.

## 이름 3계층 구조

| 계층 | 용도 | 권장 형태 | 저장 후보 |
| --- | --- | --- | --- |
| 표시 이름 `display_name_ko` | 사람이 README, 작전판, UI 에서 빠르게 이해하는 설명용 이름 | 한국어 설명문 또는 `분류/조합/역할` 같은 문서용 표기 | README, authoring note, 추후 UI 표시 필드 |
| 한글 전역 호출명 `global_name_ko` | 사람이 호출 표면에서 party 를 고르기 위한 한국어 alias 후보 | slash 없는 한국어 `underscore` key | 추후 alias/catalog 후보 |
| canonical `party_id` | 파일 경로, index, runner, workflow/mission resolve 가 참조하는 내부 안정 id | 영문 `snake_case` | `.party/index.yaml`, `.party/<party_id>/party.yaml` |

`display_name_ko` 는 설명용이고 global invocation key 가 아니다. `global_name_ko` 는 사람이 호출할 때 쓰는 alias 후보이며, 실행과 저장 경계에서는 반드시 canonical `party_id` 로 resolve 되어야 한다. `party_id` 는 현재 repo 구조와 runner 가 참조하는 내부 안정 키다.

## 작명 규칙

### canonical `party_id`

- `party_id` 는 내부 안정 키다.
- 영문 소문자, 숫자, underscore 만 사용한다.
- 시작 문자는 영문 소문자여야 한다.
- 공백, slash, dash, 한글은 금지한다.
- `party_id` 는 `.party/index.yaml` 의 `party_id -> path` catalog 와 `.party/<party_id>/party.yaml` 의 값이 같은 대상을 가리켜야 한다.
- 미관, 길이, 표시 언어 선호만으로 기존 `party_id` 를 rename 하지 않는다.

### 한글 전역 호출명 `global_name_ko`

- `global_name_ko` 는 slash 없는 한글 호출 alias 후보다.
- 한글, 숫자, underscore 만 사용한다.
- slash `/`, 공백, dash `-`, colon `:`, backslash, dot path, `..`, URL/path-like 기호는 금지한다.
- 권장 regex 는 `^[가-힣][가-힣0-9_]*(?:_v[0-9]+)?$` 이다.
- 같은 `global_name_ko` 는 한 저장소 안에서 하나의 `party_id` 에만 resolve 되어야 한다.
- 호출 alias 후보는 party template 의 역할과 lane 을 드러내야 하며, workflow 실행 결과나 project performance 를 claim 하지 않는다.

### 표시 이름 `display_name_ko`

- `display_name_ko` 는 설명용 이름이며 호출 key 로 쓰지 않는다.
- 문서에서 사람에게 구조를 보여줄 때만 `분류/조합/역할` 같은 slash 표기를 허용한다.
- 표시 이름은 party 의 reusable composition 성격을 드러내야 한다.
- 특정 run 성과, mission success, owner acceptance 를 표시 이름에 넣지 않는다.

## workflow 와 party resolve 관계

현재 정본 catalog 는 두 단계로 나뉜다.

| 단계 | 정본 owner | 현재 catalog |
| --- | --- | --- |
| workflow resolve | `.workflow` | `.workflow/index.yaml` 의 `workflow_id -> path` |
| party resolve | `.party` | `.party/index.yaml` 의 `party_id -> path` |

사람이 한글 alias 로 요청하는 경우, 최종 실행 전에는 다음 흐름으로 resolve 되어야 한다.

```text
global_name_ko -> workflow_id -> party_id -> path
```

해석:

- `global_name_ko` 는 workflow alias 후보 또는 party alias 후보일 수 있으므로 catalog 설계에서 namespace 충돌을 피해야 한다.
- workflow alias 는 먼저 canonical `workflow_id` 로 resolve 되어야 한다.
- party 선택은 `default_workflow_id`, `allowed_workflows.yaml`, 요청 context, owner policy 를 함께 보고 canonical `party_id` 로 resolve 되어야 한다.
- `party_id` 는 다시 `.party/index.yaml` 의 path 로 resolve 된다.
- `.party/<party_id>/party.yaml` 의 `default_workflow_id` 는 routing hint 이며 workflow body 를 embed 하지 않는다.
- `.party/<party_id>/allowed_workflows.yaml` 는 허용 후보를 보여주는 compatibility surface 이며 workflow canon 을 대체하지 않는다.

## template/pattern 과 canonical party id 분리

- `party template`, `lineup pattern`, `role composition`, `member slot pattern` 같은 설명어를 실제 canonical `party_id` 와 섞지 않는다.
- `guild_master_cell`, `knowledge_wiki_cell`, `systems_engineering_cell`, `pcb_revision_library_cell` 은 현재 `.party/index.yaml` 에 등록된 canonical party id 다.
- "전방 타격형", "계보 생산형", "길드마스터형" 같은 표현은 display 또는 pattern 설명으로만 쓰고, catalog key 로 쓰려면 별도 owner 판단이 필요하다.
- 새 pattern 이 보이더라도 즉시 `.party/<new_party_id>/` 를 만들지 않고 기존 party 의 alias, README 설명, 또는 후속 candidate 로 먼저 둔다.

## rename/deprecation posture

- 이 문서는 현재 등록된 party 를 rename 하지 않는다.
- 현재 등록된 `party_id` 는 `observed current id` 로 유지한다.
- rename 이 필요하면 downstream refs, workflow compatibility, mission refs, README, changelog, private run evidence 를 포함한 migration packet 이 먼저 필요하다.
- alias 후보는 먼저 `global_name_ko` 로 문서화하고, runner/catalog 저장 위치는 후속 owner 판단으로 남긴다.
- deprecation 은 실제 사용 중지 근거, 대체 party, compatibility 영향, public/private evidence 경계가 확인되기 전까지 claim 하지 않는다.

## 후속 검토 항목

- party alias catalog 를 `.party/index.yaml`, 각 `party.yaml`, derived UI layer 중 어디에 둘지 결정이 필요하다.
- workflow alias 와 party alias 를 같은 namespace 에 둘지, `workflow:` / `party:` 같은 별도 namespace 로 둘지 후속 판단이 필요하다.
- validator 강제 여부는 authoring practice 가 안정된 뒤 별도 변경으로 검토한다.
