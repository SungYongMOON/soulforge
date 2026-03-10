# Soulforge

Soulforge는 모듈형 에이전트를 위한 본체-클래스 아키텍처 저장소다.

이 저장소는 에이전트를 `.agent(에이전트 본체)`, `.agent_class(직업 계층)`, `_workspaces(실제 프로젝트 현장)` 라는 세 축으로 분리해 정의한다.

현재 단계에서는 구현보다 문서와 구조를 먼저 확정한다.
Soulforge는 기존 저장소를 복사하는 프로젝트가 아니라, 새 구조를 정본으로 정리하는 저장소다.

---

## 핵심 개념

Soulforge는 세 개의 계층으로 구성된다.

- **`.agent(에이전트 본체)`**
  정체성, 엔진, 메모리, 세션, 커뮤니케이션, 자율 동작, 정책, 레지스트리, 산출물, 내보내기, 본체 문서를 담당한다.
- **`.agent_class(직업 계층)`**
  설치된 스킬, 도구, 워크플로우, 지식 팩, 클래스 정의, 현재 로드아웃을 담당한다.
- **`_workspaces(실제 프로젝트 현장)`**
  문서, 결과물, 프로젝트별 상태가 존재하는 회사/개인 프로젝트 폴더를 뜻한다.

이 모델은 다음을 분리한다.

- 지속되는 본체
- 설치 가능한 클래스 콘텐츠
- 실제 프로젝트 현장 상태

---

## 세계관 모델

Soulforge는 설명을 위해 진지한 판타지 기반 모델을 사용한다.

- **Body / Species(몸 / 종족)** -> `.agent(에이전트 본체)`
- **Class / Profession(직업 / 역할)** -> `.agent_class(직업 계층)`
- **Skills(스킬)** -> 설치된 역량
- **Tools(도구)** -> 장착된 외부 도구와 MCP 연동
- **Knowledge(지식 팩)** -> 메모리가 아닌 설치형 지식 팩
- **Workflows(운용 교범)** -> 운영 절차와 실행 규범
- **Project Fields(프로젝트 현장)** -> `_workspaces(실제 프로젝트 현장)`
- **Project Contracts(프로젝트 연결 규약)** -> `.project_agent`

메모리는 본체의 일부다.
지식은 클래스의 일부로 설치된다.

---

## 저장소 구조

```text
./
├── .agent/                  # 에이전트 본체
├── .agent_class/            # 직업 계층
├── _workspaces/             # 실제 프로젝트 현장
├── docs/
│   └── architecture/
└── README.md
```

### `.agent`

`.agent(에이전트 본체)` 는 지속되는 몸의 계층이다.

### `.agent_class`

`.agent_class(직업 계층)` 는 현재 환경에 설치된 직업 계층이다.
포함 항목은 다음과 같다.

- `class.yaml`
- `loadout.yaml`
- `skills/`
- `tools/`
- `workflows/`
- `knowledge/`
- `docs/`
- `_local/` 비추적 로컬 전용 상태

### `_workspaces`

`_workspaces(실제 프로젝트 현장)` 는 실제 프로젝트 폴더를 담는다.

- `company/`
- `personal/`

각 프로젝트는 자체 `.project_agent(프로젝트 연결 규약)` 폴더를 가질 수 있다.

---

## 설계 원칙

1. 본체는 지속된다.
2. 클래스는 설치 가능하며 교체 가능하다.
3. 메모리는 본체에 속한다.
4. 지식은 클래스에 속한다.
5. 스킬과 도구는 서로 다르다.
6. 워크플로우는 본체 기관이 아니라 운영 규범이다.
7. 실제 프로젝트 파일은 프로젝트 폴더 안에 남아 있어야 한다.
8. `.agent_class/_local/` 의 로컬 상태는 Git에 올리지 않는다.

---

## 왜 Soulforge인가

대부분의 에이전트 저장소는 본체 로직, 설치된 역량, 로컬 런타임 상태, 프로젝트 현장 데이터를 한곳에 섞어 둔다.

Soulforge는 이를 분리한다.

- **본체**: 지속되는 정체성과 핵심 동작
- **클래스**: 설치된 직무별 역량
- **워크스페이스**: 실제 프로젝트 실행 공간
- **프로젝트 계약**: 현장별 바인딩 규칙

이렇게 하면 시스템을 설명하고, 버전 관리하고, 이동하고, 진화시키기가 쉬워진다.

---

## 문서 우선 원칙

Soulforge는 다음 순서로 변경한다.

1. 문서 초안 작성
2. 목표 구조 반영
3. 폴더 생성
4. 예시 메타 파일 생성
5. 마지막에 구현 코드 작성

구조가 바뀌면 먼저 `docs/architecture/` 문서를 갱신한 뒤 실제 파일 구조를 맞춘다.

---

## 현재 상태

이 저장소는 초기 아키텍처 정립 단계에 있다.

현재 집중하는 항목은 다음과 같다.

- 본체 모델 정의
- 클래스 모델 정의
- 워크스페이스/프로젝트 구조 정의
- 설치 가능한 스킬, 도구, 지식 팩, 워크플로우 준비
- 이전 에이전트 구조에서의 마이그레이션 문서화
- 샘플 메타 파일 규약 정리

UI는 나중에 온다.
아키텍처와 계약이 먼저다.

---

## 예정 문서

- [`docs/architecture/REPOSITORY_PURPOSE.md`](docs/architecture/REPOSITORY_PURPOSE.md)
- [`docs/architecture/AGENT_BODY_MODEL.md`](docs/architecture/AGENT_BODY_MODEL.md)
- [`docs/architecture/AGENT_CLASS_MODEL.md`](docs/architecture/AGENT_CLASS_MODEL.md)
- [`docs/architecture/WORKSPACE_PROJECT_MODEL.md`](docs/architecture/WORKSPACE_PROJECT_MODEL.md)
- [`docs/architecture/TARGET_TREE.md`](docs/architecture/TARGET_TREE.md)
- [`docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`](docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md)
- [`docs/architecture/CURRENT_DECISIONS.md`](docs/architecture/CURRENT_DECISIONS.md)
- [`docs/architecture/MIGRATION_REFERENCE.md`](docs/architecture/MIGRATION_REFERENCE.md)

---

## 라이선스

미정
