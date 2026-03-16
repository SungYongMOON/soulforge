# .agent/docs/architecture

## 목적

- `.agent/docs/architecture/` 는 species / hero catalog owner 관련 설명 문서를 두는 위치다.
- 현재 vNext 정본에서는 `.agent` 가 active body/runtime owner 가 아니므로, 이 경로에는 catalog owner 경계를 흐리는 body-era 문서를 두지 않는다.

## 포함 대상

- `.agent` 의 species / hero catalog owner 경계를 설명하는 문서
- catalog template 운영 규칙
- 필요한 경우 hero / species naming guideline 같은 owner-local 참고 문서

## 제외 대상

- active body, runtime, memory, sessions, autonomic, artifacts owner 문서
- body.yaml, body_state.yaml, loadout-era binding 문서
- project-local execution truth 문서

## 상태

- Stable
- body-era architecture 문서는 live owner path 에서 제거했다.
- historical 설명이 필요하면 `dev/log/**`, `dev/plan/**`, `docs/architecture/archive/**` 를 참조한다.
