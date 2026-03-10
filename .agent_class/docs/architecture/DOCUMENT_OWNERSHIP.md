# 문서 소유 원칙

## 목적

이 문서는 Soulforge에서 문서가 어느 계층에 소유되어야 하는지 class 관점에서 정리한다.

## 기본 원칙

- 루트 `docs/` 는 저장소 전체 구조와 루트 설명만 둔다.
- body 문서는 `.agent/docs/` 아래에 둔다.
- class 문서는 `.agent_class/docs/` 아래에 둔다.
- project 전용 문서는 각 프로젝트의 `.project_agent/` 아래에 둔다.

## `.agent_class/docs/` 운영 구조

```text
.agent_class/docs/
├── architecture/
├── plans/
├── devlog/
└── prompts/
```

## 폴더별 역할

- `architecture/` = class 구조 설명, 메타 규약, 소유 원칙
- `plans/` = 아직 수행 전인 계획, 수정 계획, relocation 계획
- `devlog/` = 실제 수행 결과, 변경 이유, 남은 리스크
- `prompts/` = 반복 사용 가능한 class 작업 프롬프트

## 적용 규칙

1. class 를 설명하는 문서는 가능한 한 `.agent_class/docs/` 아래에서 관리한다.
2. root `docs/` 에 class 문서가 남아 있는 경우, 먼저 relocation 계획을 세운 뒤 이동한다.
3. project 전용 변경 계획과 로그는 class 문서 공간으로 끌어오지 않는다.
