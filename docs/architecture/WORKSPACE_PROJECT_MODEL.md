# 워크스페이스 프로젝트 모델

## 목적

워크스페이스는 Soulforge의 실제 운영 현장이다.

워크스페이스에는 추상적인 역량 정의가 아니라 실제 프로젝트 파일, 산출물, 프로젝트별 상태가 들어간다.

## 워크스페이스 구조

```text
_workspaces/
├── company/
└── personal/
```

각 프로젝트 폴더에는 `.project_agent(프로젝트 연결 규약)` 디렉터리가 포함될 수 있다.

이 디렉터리에는 예를 들어 다음 파일이 들어간다.

- `contract.yaml`
- `capsule_bindings.yaml`
- `workflow_bindings.yaml`
- `local_state_map.yaml`

## 설계 규칙

프로젝트 파일은 프로젝트 현장 안에 남아 있어야 한다.
본체와 클래스 계층은 워크스페이스를 참조해야 하며, 이를 흡수해서는 안 된다.
