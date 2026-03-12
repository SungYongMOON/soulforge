# .agent

## 목적

- `.agent/` 는 한 명의 durable agent unit 을 이루는 private operating system 이다.
- 이 본체는 identity, policy, communication, protocols, runtime, memory, sessions, autonomic, artifacts 를 묶는 private 운영기관 경계다.

## 포함 대상

- `body.yaml`, `body_state.yaml`
- `identity/`, `registry/`, `policy/`, `communication/`, `protocols/`, `runtime/`, `memory/`, `sessions/`, `autonomic/`, `artifacts/`, `docs/`
- section-owned YAML 메타와 body owner 구조 문서

## 제외 대상

- `.agent_class` 의 loadout, installed module, tool implementation
- `_workspaces` 의 프로젝트 실자료와 project-owned contract
- `_teams/shared` 협업 상태와 shared memory
- raw transcript 와 host-local runtime 상태

## 대표 파일

- [`body.yaml`](body.yaml): `.agent` 전체의 정적 메타 지도
- [`body_state.yaml`](body_state.yaml): 저장소 추적 가능한 현재 구조 스냅샷
- [`docs/architecture/AGENT_BODY_MODEL.md`](docs/architecture/AGENT_BODY_MODEL.md): `.agent` 전체 구조 의미의 정본 문서

## 참조 관계

- `identity/` vs `registry/`: `identity/` 는 이 agent 가 누구인지의 durable default 를 담고, `registry/` 는 무엇이 어디에 있고 어떻게 연결되는지의 binding/index/reference 를 담는다.
- `policy/` vs `communication/`: `policy/` 는 species-free floor 를 두고, `communication/` 은 그 floor 안에서 바깥에 어떻게 말할지의 표현 규칙을 둔다.
- `memory/` vs `sessions/`: `memory/` 는 private 장기 기억이고, `sessions/` 는 transcript 저장소가 아니라 작업 연속성 체크포인트 저장소다.
- `artifacts/` vs `export/`: `artifacts/` 는 body 소유 재사용 산출물 서가이고, `export/` 는 별도 body 기관이 아니라 전달 concern 이다.
- `communication/` vs `protocols/`: `communication/` 은 사람과 채널 표현을, `protocols/` 는 request, handoff, decision, incident, escalation 계약을 다룬다.
- `runtime/` vs `policy/`: `runtime/` 은 기관 조립과 실행 순서를, `policy/` 는 runtime 이 넘지 말아야 할 경계를 고정한다.

## 변경 원칙

- `.agent` 하위 구조가 바뀌면 같은 변경 안에서 해당 폴더 README, `body.yaml`, `body_state.yaml`, 관련 architecture 문서를 함께 갱신한다.
- body 메타에는 관측되지 않은 runtime 상태를 지어내지 않는다.
- shared team memory 는 `.agent` 안으로 끌어오지 않고 `_teams/shared` 경계에만 예약한다.
