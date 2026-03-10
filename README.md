# Soulforge

Soulforge는 모듈형 에이전트를 위한 본체-클래스 아키텍처 저장소다.

이 저장소는 `.agent(에이전트 본체)`, `.agent_class(직업 계층)`, `_workspaces(실제 프로젝트 현장)` 의 세 축으로 구조를 정의한다.
현재 단계에서는 구현보다 문서와 메타 구조를 먼저 확정한다.

---

## 핵심 개념

Soulforge는 아래 세 계층을 분리한다.

- **`.agent`**: 정체성, 엔진, 기억, 세션, 정책, 자율 동작을 담는 지속 계층
- **`.agent_class`**: 설치된 skills, tools, workflows, knowledge, class 메타, loadout 을 담는 직업 계층
- **`_workspaces`**: 실제 프로젝트 파일과 결과물이 존재하는 운영 현장

이 모델은 본체, 설치 가능한 직업 콘텐츠, 실제 프로젝트 상태를 한곳에 섞지 않기 위해 존재한다.

---

## 세계관 모델

Soulforge는 설명을 위해 진지한 판타지 기반 모델을 사용한다.
다만 은유보다 실제 소유 경계가 우선이다.

- **Body / Species** -> `.agent`
- **Class / Profession** -> `.agent_class`
- **Project Field** -> `_workspaces`
- **Project Contract** -> `.project_agent`

세부 대응표와 용어 기준은 [`docs/architecture/AGENT_WORLD_MODEL.md`](docs/architecture/AGENT_WORLD_MODEL.md) 에서 다룬다.

---

## 저장소 구조

```text
./
├── .agent/
├── .agent_class/
│   └── docs/
│       ├── architecture/
│       ├── plans/
│       ├── devlog/
│       └── prompts/
├── _workspaces/
├── docs/
│   └── architecture/
└── README.md
```

### `.agent`

`.agent` 는 지속되는 몸의 계층이다.

### `.agent_class`

`.agent_class` 는 현재 환경에 설치된 직업 계층이다.

- `class.yaml` = 설치된 class 의 정적 정의
- `loadout.yaml` = 현재 장착 상태표
- `skills/`, `tools/`, `workflows/`, `knowledge/` = 설치형 모듈
- `docs/` = class 소유 문서
- `_local/` = 비추적 로컬 상태

`.agent_class/docs/` 는 아래 네 하위 폴더를 기준으로 운영한다.

- `architecture/` = class 구조와 메타 규약
- `plans/` = 수행 전 계획과 수정 계획
- `devlog/` = 수행 결과와 변경 로그
- `prompts/` = 재사용 프롬프트 자산

### `_workspaces`

`_workspaces` 는 실제 프로젝트 폴더를 담는다.

- `company/`
- `personal/`

각 프로젝트는 필요하면 `.project_agent/` 폴더를 가진다.

---

## 문서 소유 원칙

- 루트 `docs/` 는 저장소 전체 구조와 루트 설명만 둔다.
- body 문서는 `.agent/docs/` 아래에 둔다.
- class 문서는 `.agent_class/docs/` 아래에 둔다.
- project 전용 문서는 각 프로젝트의 `.project_agent/` 아래에 둔다.

현재 root `docs/architecture/` 에는 과도기 문서가 남아 있으며, 이동은 계획 문서를 먼저 세운 뒤 진행한다.

---

## 설계 원칙

1. 본체는 지속된다.
2. 클래스는 설치 가능하며 교체 가능하다.
3. 메모리는 본체에 속한다.
4. 지식은 클래스에 속한다.
5. 스킬과 도구는 서로 다르다.
6. 워크플로우는 운영 규범이다.
7. 실제 프로젝트 파일은 프로젝트 폴더 안에 남아 있어야 한다.
8. `.agent_class/_local/` 의 로컬 상태는 Git에 올리지 않는다.

---

## 현재 상태

이 저장소는 초기 아키텍처 정립 단계에 있다.

현재 집중하는 항목은 다음과 같다.

- 본체 모델 정의
- 클래스 모델 정의
- 워크스페이스/프로젝트 구조 정의
- class 문서 운영 구조 정리
- 메타 파일 규약 정리
- 마이그레이션 기준 정리

UI와 runtime 구현은 나중 작업이다.

---

## 주요 문서

- [`docs/architecture/REPOSITORY_PURPOSE.md`](docs/architecture/REPOSITORY_PURPOSE.md)
- [`docs/architecture/AGENT_WORLD_MODEL.md`](docs/architecture/AGENT_WORLD_MODEL.md)
- [`docs/architecture/AGENT_BODY_MODEL.md`](docs/architecture/AGENT_BODY_MODEL.md)
- [`docs/architecture/AGENT_CLASS_MODEL.md`](docs/architecture/AGENT_CLASS_MODEL.md)
- [`docs/architecture/WORKSPACE_PROJECT_MODEL.md`](docs/architecture/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md`](docs/architecture/PROJECT_AGENT_MINIMUM_SCHEMA.md)
- [`docs/architecture/TARGET_TREE.md`](docs/architecture/TARGET_TREE.md)
- [`docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`](docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md)
- [`docs/architecture/CURRENT_DECISIONS.md`](docs/architecture/CURRENT_DECISIONS.md)
- [`docs/architecture/MIGRATION_REFERENCE.md`](docs/architecture/MIGRATION_REFERENCE.md)
- [`.agent_class/docs/architecture/CLASS_METADATA_CONTRACT.md`](.agent_class/docs/architecture/CLASS_METADATA_CONTRACT.md)
- [`.agent_class/docs/architecture/DOCUMENT_OWNERSHIP.md`](.agent_class/docs/architecture/DOCUMENT_OWNERSHIP.md)

---

## 라이선스

미정
