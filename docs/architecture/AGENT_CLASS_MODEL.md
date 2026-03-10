# 에이전트 클래스 모델

## 목적

클래스 계층은 Soulforge 본체를 위한 설치 가능하고 교체 가능한 직무 정의다.

본체 자체를 다시 정의하지 않으면서, 특정 환경에서 무엇을 수행하도록 장착되어 있는지를 설명한다.

## 책임

- 클래스 정의
- 로드아웃 선택
- 설치된 스킬
- 장착된 도구
- 운영 워크플로우
- 지식 팩
- 클래스 문서

## 현재 클래스 영역

```text
.agent_class/
├── _local/
├── docs/
├── knowledge/
├── skills/
├── tools/
│   ├── adapters/
│   ├── connectors/
│   ├── local_cli/
│   └── mcp/
├── workflows/
├── class.yaml
└── loadout.yaml
```

## 설계 규칙

클래스는 설치 가능하며 교체 가능하다.
클래스가 바뀌어도 메모리는 본체에 남는다.
