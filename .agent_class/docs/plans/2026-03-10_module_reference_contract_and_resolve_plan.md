# 2026-03-10 모듈 참조 계약과 loadout resolve 구현 계획

## 상태

- 진행 상태: 검증 완료, 커밋 대기
- 작업 유형: class 정본 계약 신설 + local CLI resolve/validate 확장
- 계획 저장 위치: `.agent_class/docs/plans/`

## 목적

- [x] loadout 과 installed library 사이의 module reference contract 를 class owner 문서로 고정한다.
- [x] `loadout.equipped.*` 를 경로가 아닌 module id 목록으로 잠근다.
- [x] `ui_sync.py` 에 class installed/loadout resolve 를 추가한다.
- [x] `validate` 가 non-empty equipped 를 blanket WARN 으로 넘기지 않고 resolve 결과 기준으로 PASS/FAIL 하게 만든다.
- [x] 관련 root/class 문서와 README 를 같은 변경 안에서 동기화한다.

## 범위

- [x] `.agent_class/docs/architecture/MODULE_REFERENCE_CONTRACT.md` 신설
- [x] class architecture 문서 3종과 architecture README 갱신
- [x] root architecture 문서와 루트 README 갱신
- [x] `.agent_class/tools/local_cli/ui_sync/ui_sync.py` 확장
- [x] `.agent_class/tools/**` 와 `.agent_class/docs/**` README 최신화
- [ ] 검증 후 커밋/푸시

## 고정 결정

- [x] `loadout.equipped.skills/tools/workflows/knowledge` 는 module id 문자열 목록이다.
- [x] installed module 은 `module.yaml` manifest 가 있는 엔트리만 인정한다.
- [x] resolve 대상 kind 는 `skill`, `tool`, `workflow`, `knowledge` 네 종류다.
- [x] tool 은 `adapters/`, `connectors/`, `local_cli/`, `mcp/` family 아래에서만 설치 모듈을 인정한다.
- [x] workflow manifest 는 `requires.skills/tools/knowledge` 를 module id 로 참조한다.
- [x] 이번 차수에서는 workspace `.project_agent` resolve 를 하지 않는다.
- [x] 이번 차수에서는 UI renderer 를 만들지 않는다.
- [x] 실제 설치 모듈이 없으면 빈 catalog 로 통과한다.
- [x] top-level `scripts/`, `tests/` 는 새로 만들지 않는다.
- [x] 구현은 기존 `ui_sync.py` 확장으로만 진행한다.

## 하지 말 것

- [x] dummy module 을 억지로 만들지 않는다.
- [x] loadout 참조를 경로나 파일명 규칙으로 되돌리지 않는다.
- [x] class owner 문서를 root `docs/` 로 밀어 넣지 않는다.
- [x] workspace binding resolve 나 renderer 구현까지 범위를 넓히지 않는다.
- [x] 신규 top-level 폴더나 별도 테스트 디렉터리를 만들지 않는다.

## ASSUMPTIONS

- [x] 현재 저장소에는 정식 installed module manifest 가 없으므로 첫 검증 결과의 catalog 는 비어 있을 가능성이 높다.
- [x] `class.yaml.modules.*` 는 `.agent_class/` 기준 상대 경로이며, resolve 는 그 경로를 기준으로 수행한다.
- [x] module manifest 의 최소 검증 범위는 필수 필드, kind/path/family 정합성, equipped workflow dependency resolve 까지로 제한한다.

## 모듈 참조 계약 초안

- [x] installed library 는 `.agent_class/**/module.yaml` manifest 집합으로 정의한다.
- [x] loadout 는 installed library 안의 module id 를 `equipped.*` 로 참조한다.
- [x] skill/workflow/knowledge 는 각 library root 바로 아래 `<module_dir>/module.yaml` 경로를 사용한다.
- [x] tool 은 `.agent_class/tools/<family>/<module_dir>/module.yaml` 경로를 사용한다.
- [x] 같은 kind 안의 duplicate module id 는 FAIL 이다.
- [x] tool 은 family mismatch 와 path-family mismatch 가 있으면 FAIL 이다.
- [x] equipped workflow `requires.*` 가 installed catalog 에 없으면 FAIL 이다.

## CLI 확장 범위

- [x] `resolve-loadout` 명령을 추가한다.
- [x] `resolve-loadout --json` 을 지원한다.
- [x] `validate` 가 resolve 결과를 재사용하게 만든다.
- [x] non-empty equipped blanket WARN 를 제거한다.
- [x] fail 기준을 duplicate id, path-like ref, kind mismatch, unknown id, equipped workflow dependency unresolved 로 바꾼다.

## 검증 체크리스트

- [x] 계획 문서를 실제 수행 결과에 맞게 갱신한다.
- [x] `MODULE_REFERENCE_CONTRACT.md` 가 경로 규약, manifest 필드, resolve/validate 규칙을 모두 포함하는지 확인한다.
- [x] class/root 문서가 새 contract 링크를 포함하는지 확인한다.
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py resolve-loadout --json`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate`
- [x] `python .agent_class/tools/local_cli/ui_sync/ui_sync.py validate --json`
- [x] `python -m py_compile .agent_class/tools/local_cli/ui_sync/ui_sync.py`
- [x] `git diff --check`
- [x] `git diff --stat`
- [x] `git status --short`
- [x] README 링크/명령 예시 확인
- [x] 문서 간 용어 일관성 확인
- [ ] 커밋
- [ ] 푸시

## owner 체크

- [x] module reference contract 정본은 `.agent_class/docs/architecture/` 아래에 둔다.
- [x] root 문서는 class 정본의 링크/요약만 유지한다.
- [x] `ui_sync.py` 변경은 `.agent_class/tools/local_cli/ui_sync/` 범위를 넘지 않는다.
- [x] workspace 전용 규약은 이번 차수에서 건드리지 않는다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 계약/구현 핵심 요약`
- [x] `3. 검증 결과`
- [x] `4. owner 체크`
- [x] `5. 커밋/푸시 정보`
