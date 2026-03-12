# .agent

## 목적

- `.agent/` 는 한 명의 durable agent unit 을 이루는 private operating system 이다.
- 현재 baseline 은 species only, policy species-free floor, sessions continuity only, memory private-first 를 기준으로 본체 기관과 메타를 관리한다.

## 포함 대상

- `body.yaml`, `body_state.yaml`
- `identity/`, `engine/`, `memory/`, `sessions/`, `communication/`, `protocols/`, `autonomic/`, `policy/`, `registry/`, `artifacts/`, `docs/`
- section-owned YAML 메타 파일과 본체 owner 기준의 구조 문서, 계약 문서, 기관 README

## 제외 대상

- 설치형 `knowledge`, `skills`, `tools`, `workflows` 와 현재 장착 상태인 loadout
- 실제 프로젝트 파일, 프로젝트별 `.project_agent/`, mission 현장 원본 결과물
- raw transcript, host-local 임시 상태, 관측되지 않은 runtime 상태
- 미래 협업 확장 경로인 `_teams/shared/` 와 별도 top-level body 폴더로서의 `.agent/export/`

## 대표 파일

- [`body.yaml`](body.yaml): body section 맵, operating constraints, section-owned YAML 메타 파일 목록을 고정하는 정적 정의
- [`body_state.yaml`](body_state.yaml): 실제 `.agent/` 구조에 대한 재생성 가능 스냅샷
- [`docs/architecture/AGENT_BODY_MODEL.md`](docs/architecture/AGENT_BODY_MODEL.md): `.agent` 전체 구조 의미의 정본 문서

## 참조 관계

- `identity/` vs `registry/`: `identity/` 는 agent 가 누구인지에 대한 durable default 를 정의하고, `registry/` 는 body 소유 자산과 바인딩 참조를 찾기 위한 색인만 관리한다.
- `policy/` vs `communication/`: `policy/` 는 항상 지켜야 하는 floor 를 두고, `communication/` 은 그 floor 안에서 외부에 어떻게 말하고 전달할지의 규범을 둔다.
- `memory/` vs `sessions/`: `memory/` 는 장기 보존되는 private-first 기억을 두고, `sessions/` 는 resume 와 handoff 를 위한 continuity 상태만 둔다.
- `artifacts/` vs `export/`: `artifacts/` 는 body 소유 파생 산출물 저장 경계이며, `export/` 는 별도 body 기관이 아니라 전달 방식이나 포맷 차원의 관심사다.
- `communication/` vs `protocols/`: `communication/` 은 채널 semantics 와 응답 형식을 다루고, `protocols/` 는 request, handoff, decision, incident, escalation 계약을 다룬다.
- `runtime/` vs `policy/`: 현재 경로는 `engine/` 이지만 의미는 runtime layer 이며, runtime 은 실행 기반을 설명하고 `policy/` 는 그 runtime 이 넘지 말아야 할 제약을 고정한다.
- [`docs/README.md`](docs/README.md)
- [`docs/architecture/BODY_METADATA_CONTRACT.md`](docs/architecture/BODY_METADATA_CONTRACT.md)
- [루트 README](../README.md)

## 변경 원칙

- `.agent` 하위 폴더에 YAML 메타 파일이 추가·변경·삭제되면 같은 변경 안에서 해당 폴더 `README.md`, `body.yaml.section_files`, 관련 계약 문서를 함께 갱신한다.
- `body.yaml` 과 `body_state.yaml` 은 runtime 상태를 추측해 채우지 않고, 선언된 정적 구조와 재생성 가능한 구조 스냅샷만 유지한다.
- `engine/` 는 현재 경로를 유지하되 문서와 메타에서는 runtime 의미를 우선 사용한다. 실제 rename 은 별도 coordinated migration 으로만 다룬다.
- 팀 공유 자산이나 workspace 실자료가 필요해도 `.agent` 로 끌어오지 않고 각 owner 경계에서 별도 문서화한다.
