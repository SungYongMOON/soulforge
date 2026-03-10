# Soulforge — 저장소 작업 헌장 (v0)

## 0. 목적

이 저장소는 Soulforge의 새 정본 구조를 정의하기 위한 초기 설계 저장소다.

이 레포의 목표는 다음 세 축을 명확히 정리하는 것이다.

1. `.agent(에이전트 본체)` = 에이전트의 종족/몸
2. `.agent_class(직업 계층)` = 현재 업무환경의 직업
3. `_workspaces(실제 프로젝트 현장)` = 실제 프로젝트가 운영되는 공간

현재 단계는 구조 설계와 문서화가 우선이며, 구현 코드는 나중에 붙인다.

기존 저장소는 참고용이다.
이 레포는 기존 구조를 그대로 복사하는 저장소가 아니라, 새 구조를 정본으로 정의하는 저장소다.

---

## 1. 현재 상태

Soulforge는 현재 초기 구조 정립 단계에 있다.

즉:

- 문서가 코드보다 먼저다
- 구조가 기능보다 먼저다
- UI는 나중 작업이다
- 현재 목표는 "잘 작동하는 구현"보다 "정확한 구조 정본"이다

---

## 2. 가장 중요한 원칙

### 2.1 기존 구조는 복사하지 않는다

기존의 `AGENT_BODY_MAP.md`, `AGENT_ROOT_STRUCTURE.md` 는 문서 형식, 설명 방식, 구조 서술 톤만 참고한다.

이번 레포에서는:

- 기존 top-level 구조를 그대로 복사하지 않는다
- 기존 경로를 정답처럼 전제하지 않는다
- 새 구조를 새 레포 기준으로 다시 정의한다

### 2.2 `.agent(에이전트 본체)` 는 몸이다

`.agent` 는 에이전트의 종족, 몸, 기본 패시브 기관을 담는 본체 계층이다.

여기에는 다음이 포함된다.

- `identity`
- `engine`
- `sessions`
- `memory`
- `communication`
- `autonomic`
- `policy`
- `registry`
- `artifacts`
- `export`
- `docs`

`.agent` 는 설치형 스킬 저장소가 아니다.

### 2.3 `.agent_class(직업 계층)` 는 직업이다

`.agent_class` 는 이 업무환경에서 선택된 직업 계층이다.

여기에는 다음이 포함된다.

- `class.yaml`
- `loadout.yaml`
- `skills/`
- `tools/`
- `workflows/`
- `knowledge/`
- `docs/`
- `_local/`

직업은 설치형이다.
직업은 스킬, 도구, 지식, 워크플로우를 장착한다.

### 2.4 `knowledge(설치형 지식 팩)` 는 `memory(장기 기억)` 가 아니다

- `memory` 는 `.agent(에이전트 본체)` 쪽 장기 기억이다
- `knowledge` 는 `.agent_class(직업 계층)` 쪽 설치형 지식 팩이다

지식은 내려받아 설치하는 것이고, 기억은 몸이 축적하는 것이다.

### 2.5 `tools(도구)` 와 `skills(스킬)` 는 다르다

- `skills` = 몸이 익힌 행동 패턴
- `tools` = 몸 밖 외부 장비
- `workflows` = 절차와 운용 교범

이 셋을 섞지 않는다.

### 2.6 프로젝트 실자료는 `_workspaces(실제 프로젝트 현장)` 안에만 둔다

실제 프로젝트 자료는 전부 `_workspaces/` 아래 프로젝트 폴더 안에 둔다.

루트는 다음을 위한 공간이다.

- 구조 정의
- 본체 계층
- 직업 계층
- 현장 연결 규약

프로젝트 실자료를 루트에 흩뿌리지 않는다.

### 2.7 프로젝트 연결 규약은 각 프로젝트 안에 둔다

각 프로젝트 폴더는 `.project_agent(프로젝트 연결 규약)` 디렉터리를 가질 수 있다.

예를 들어 다음 파일이 들어간다.

- `contract.yaml`
- `capsule_bindings.yaml`
- `workflow_bindings.yaml`
- `local_state_map.yaml`

즉:

- `.agent` = 몸
- `.agent_class` = 직업
- `.project_agent` = 현장 연결 계약

### 2.8 로컬 전용 상태는 추적하지 않는다

`.agent_class/_local/` 은 host-local 영역이다.

여기에는 다음이 들어갈 수 있다.

- env
- cache
- sessions
- mounts
- local tool path
- local runtime state

이 영역은 기본적으로 Git 추적 대상이 아니다.
현재 저장소에서는 `.agent_class/_local/.gitignore` 만 추적하고, 나머지 내용은 무시한다.

---

## 3. 현재 canonical 구조

현재 Soulforge의 목표 구조는 아래와 같다.

```text
./
├── .agent/
│   ├── identity/
│   ├── engine/
│   ├── sessions/
│   ├── memory/
│   ├── communication/
│   ├── autonomic/
│   ├── policy/
│   ├── registry/
│   ├── artifacts/
│   ├── export/
│   └── docs/
├── .agent_class/
│   ├── class.yaml
│   ├── loadout.yaml
│   ├── skills/
│   ├── tools/
│   │   ├── mcp/
│   │   ├── connectors/
│   │   ├── local_cli/
│   │   └── adapters/
│   ├── workflows/
│   ├── knowledge/
│   ├── docs/
│   └── _local/
├── _workspaces/
│   ├── company/
│   └── personal/
├── docs/
│   └── architecture/
└── README.md
```

이 구조가 바뀌면 먼저 `docs/architecture/` 문서를 갱신한 뒤 변경한다.

---

## 4. 작업 우선순위

현재 작업 우선순위는 아래와 같다.

### 1순위

문서 정리

- `README.md`
- `docs/architecture/*`

### 2순위

폴더 뼈대 생성

- `.agent/`
- `.agent_class/`
- `_workspaces/`

### 3순위

최소 메타 파일 생성

- `.agent_class/class.yaml`
- `.agent_class/loadout.yaml`
- example project의 `.project_agent/*.yaml`

### 4순위

기존 저장소 참고 이식

- 필요한 본체 문맥
- 필요한 naming rule
- 필요한 migration note

### 5순위

구현 코드

- 지금은 보류

### 6순위

UI

- 지금은 보류
- 다만 나중에 UI가 붙기 쉽도록 `class.yaml`, `loadout.yaml`, 각 패키지의 `meta.yaml` 규약은 고려한다

---

## 5. 이번 단계에서 하지 않는 것

아래는 현재 단계에서 하지 않는다.

1. 기존 저장소의 구현 코드를 대량 복사하지 않는다
2. top-level `configs/`, `scripts/`, `tests/` 를 습관적으로 만들지 않는다
3. UI를 먼저 만들지 않는다
4. runtime 구현을 먼저 옮기지 않는다
5. `.agent` 와 `.agent_class` 의 책임을 섞지 않는다
6. 구조 문서 없이 폴더만 먼저 늘리지 않는다

---

## 6. 파일과 폴더의 소유 원칙

### `.agent(에이전트 본체)`

몸의 정본

### `.agent_class(직업 계층)`

직업의 정본

### `_workspaces/.../<project>`

프로젝트 실자료의 정본

### `_workspaces/.../<project>/.project_agent`

해당 프로젝트 연결 규약의 정본

### `docs/architecture/`

레포 전체 구조 문서의 정본

### `.agent/docs/`

본체 내부 문서의 정본

### `.agent_class/docs/`

직업 내부 문서의 정본

---

## 7. 문서 우선 규칙

구조 변경은 아래 순서로 진행한다.

1. 문서 초안 작성
2. 목표 구조 반영
3. 폴더 생성
4. 예시 파일 생성
5. 그다음 구현

문서와 실제 구조가 다르면, 우선 문서를 갱신하고 구조를 맞춘다.

---

## 8. 현재 생성 대상 문서

초기 문서 세트는 아래를 기준으로 한다.

- `docs/architecture/REPOSITORY_PURPOSE.md`
- `docs/architecture/AGENT_BODY_MODEL.md`
- `docs/architecture/AGENT_CLASS_MODEL.md`
- `docs/architecture/WORKSPACE_PROJECT_MODEL.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`
- `docs/architecture/CURRENT_DECISIONS.md`
- `docs/architecture/MIGRATION_REFERENCE.md`

---

## 9. 커밋 원칙 (v0)

현재 단계에서는 다음을 우선한다.

1. 작은 단위 커밋
2. 문서와 구조를 같은 커밋에 묶기
3. 구조를 바꿨으면 관련 architecture 문서를 함께 갱신
4. 구현보다 문서 정합성을 우선

커밋 메시지는 아직 최소 규칙만 적용한다.

- 한글 사용 권장
- 구조 변경이면 문서와 실제 변경이 같이 보여야 함

---

## 10. 오픈 이슈

아래는 아직 확정되지 않았다.

1. species 용어를 그대로 쓸지, 다른 용어로 바꿀지
2. loadout을 단일 YAML로 유지할지 폴더로 확장할지
3. 공용 상점 구조를 Drive 중심으로 둘지 repo 기반으로 둘지
4. 기존 저장소에서 어떤 본체 문맥을 언제 가져올지
5. UI 정보 구조를 어떤 메타 필드로 표준화할지

이 항목들은 문서로 먼저 확정하고 나서 구현으로 간다.

---

## 11. 한 줄 규칙

Soulforge에서는 몸은 `.agent`, 직업은 `.agent_class`, 실제 프로젝트 현장은 `_workspaces` 이다.

이 기본 축을 흐리지 않는다.
