# 목표 트리

```text
./
├── .agent/
│   ├── artifacts/
│   ├── autonomic/
│   ├── communication/
│   ├── docs/
│   │   └── architecture/
│   ├── engine/
│   ├── export/
│   ├── identity/
│   ├── memory/
│   ├── policy/
│   ├── registry/
│   └── sessions/
├── .agent_class/
│   ├── _local/
│   ├── docs/
│   │   ├── architecture/
│   │   ├── devlog/
│   │   ├── plans/
│   │   └── prompts/
│   ├── knowledge/
│   ├── skills/
│   ├── tools/
│   │   ├── adapters/
│   │   ├── connectors/
│   │   ├── local_cli/
│   │   └── mcp/
│   ├── workflows/
│   ├── class.yaml
│   └── loadout.yaml
├── _workspaces/
│   ├── company/
│   └── personal/
├── docs/
│   └── architecture/
└── README.md
```

## 폴더별 책임

| 경로 | 책임 |
| --- | --- |
| `.agent/` | 에이전트 본체의 지속 계층 |
| `.agent/identity/` | 정체성, 종별 정보, 기본 식별 정보 |
| `.agent/engine/` | 엔진 설정과 실행 기반 |
| `.agent/sessions/` | 세션 상태와 세션 기록 |
| `.agent/memory/` | 장기 기억 |
| `.agent/communication/` | 외부와의 상호작용 규칙 |
| `.agent/autonomic/` | 자율 동작과 자동 반응 규칙 |
| `.agent/policy/` | 정책과 안전 규칙 |
| `.agent/registry/` | 등록 정보와 색인 정보 |
| `.agent/artifacts/` | 본체 측 산출물 |
| `.agent/export/` | 내보내기 구조와 패키징 |
| `.agent/docs/` | 본체 내부 문서 |
| `.agent/docs/architecture/` | body 구조 문서 |
| `.agent_class/` | 직업 계층의 정본 |
| `.agent_class/class.yaml` | 직업 정의 메타 파일 |
| `.agent_class/loadout.yaml` | 현재 장착 상태 정의 |
| `.agent_class/skills/` | 설치된 스킬 |
| `.agent_class/tools/` | 외부 도구와 연결 계층 |
| `.agent_class/workflows/` | 운용 절차 |
| `.agent_class/knowledge/` | 설치형 지식 팩 |
| `.agent_class/docs/` | 직업 내부 문서 |
| `.agent_class/docs/architecture/` | class 구조와 메타 규약 |
| `.agent_class/docs/plans/` | class 변경 계획 |
| `.agent_class/docs/devlog/` | class 작업 로그 |
| `.agent_class/docs/prompts/` | class 재사용 프롬프트 |
| `.agent_class/_local/` | 비추적 로컬 전용 상태 |
| `_workspaces/` | 실제 프로젝트 운영 현장 |
| `_workspaces/company/` | 회사 프로젝트 |
| `_workspaces/personal/` | 개인 프로젝트 |
| `docs/architecture/` | 저장소 전체 구조 문서 |
| `docs/architecture/DOCUMENT_OWNERSHIP.md` | 문서 소유권 기준 |
| `README.md` | 저장소 진입 문서 |
