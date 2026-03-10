# 2026-03-10 tools leaf 역할 동기화 계획

## 상태

- 진행 상태: 완료
- 작업 유형: class 정본 보강 + root 색인 동기화
- 계획 저장 위치: `.agent_class/docs/plans/`

## 목적

- [x] `.agent_class/tools/` 하위 leaf 폴더 역할 공백을 class 정본 문서에 추가한다.
- [x] root 구조 색인 문서에 최소 수준 요약을 동기화한다.
- [x] owner 원칙과 구조 문서 정합성을 함께 유지한다.

## 범위

- [x] `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`
- [x] `docs/architecture/TARGET_TREE.md`

## 반드시 읽은 근거 문서

- [x] `AGENTS.md`
- [x] `docs/architecture/DOCUMENT_OWNERSHIP.md`
- [x] `docs/architecture/TARGET_TREE.md`
- [x] `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`
- [x] `docs/architecture/CURRENT_DECISIONS.md`

## 고정 의미 기준

- [x] `.agent_class/tools/adapters/` = 도구별 실행 인터페이스 차이를 공통 도구 인터페이스로 정렬하는 어댑터
- [x] `.agent_class/tools/connectors/` = 외부 서비스·원격 시스템과의 연결 정의와 인증 진입점
- [x] `.agent_class/tools/local_cli/` = 호스트 로컬 CLI 기반 도구 래퍼와 실행 바인딩
- [x] `.agent_class/tools/mcp/` = MCP 기반 도구 서버 연결과 프로토콜 바인딩

## 핵심 근거 정리

- [x] root `docs/` 는 저장소 전체 구조와 루트 설명만 둔다.
- [x] class 전용 정본은 `.agent_class/docs/` 아래에 둔다.
- [x] 구조 설명 문서는 같은 문서 안에 Mermaid 를 포함한다.
- [x] root 문서는 색인/구조 설명 수준을 유지한다.
- [x] class 내부 상세 책임의 정본은 class 문서에 둔다.
- [x] 작은 수정으로 정합성을 맞춘다.

## 하지 말 것

- [x] 신규 루트 문서를 만들지 않는다.
- [x] `.project_agent` 관련 규칙을 확장하지 않는다.
- [x] `_workspaces/<project>/` 일반 폴더 규칙을 새로 표준화하지 않는다.
- [x] 구현 코드, 스크립트, 테스트를 변경하지 않는다.
- [x] 저장소 근거 없는 추측성 모델을 추가하지 않는다.

## ASSUMPTIONS

- [x] 이번 작업의 정본 추가 위치는 `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md` 하나로 잠근다.
- [x] `docs/architecture/TARGET_TREE.md` 는 root 색인 문서이므로 leaf 역할은 한 줄 요약만 넣는다.
- [x] `AGENTS.md`, `DOCUMENT_OWNERSHIP.md`, `CURRENT_DECISIONS.md` 는 이번 작업에서 수정 대상이 아니다.
- [x] 기존 Mermaid 구조도와 트리 블록은 유지하고, 필요한 최소 섹션만 추가한다.
- [x] 기존 문서 톤인 짧은 문장, 짧은 bullet, 표 중심 서술을 유지한다.

## 변경 전 문제

### 1. `AGENT_CLASS_MODEL.md`

- [x] `tools/` 는 현재 "외부 장비와 연결 계층" 수준까지만 설명되어 있다.
- [x] `adapters/`, `connectors/`, `local_cli/`, `mcp/` 는 구조도와 트리에는 보이지만 역할 문장이 없다.
- [x] class 정본 문서 안에서 leaf 의미가 prose 로 고정되지 않아 해석 공백이 남아 있다.

### 2. `TARGET_TREE.md`

- [x] `폴더별 책임` 표는 `.agent_class/tools/` 까지만 설명하고 leaf 4개 경로는 누락되어 있다.
- [x] root 구조 색인과 class 정본 사이에 leaf 수준 정합성 공백이 있다.
- [x] root 문서가 class 정본을 대체하지 않도록 요약 수준을 엄격히 유지해야 한다.

## 파일별 수정 계획

### 1. `.agent_class/docs/architecture/AGENT_CLASS_MODEL.md`

- [x] `## 중요한 구분` 과 `## 메타 파일` 사이에 `## tools/ 하위 역할` 섹션을 추가할지 우선 검토한다.
- [x] 새 섹션에 Mermaid 1개를 추가한다.
- [x] Mermaid 는 `tools/` 아래 4개 leaf 의 분기 구조와 역할 범주만 보여준다.
- [x] Mermaid 에는 새로운 축이나 추가 모델을 만들지 않는다.
- [x] `adapters` bullet 을 추가한다.
- [x] `connectors` bullet 을 추가한다.
- [x] `local_cli` bullet 을 추가한다.
- [x] `mcp` bullet 을 추가한다.
- [x] bullet 문장은 의미 기준을 벗어나지 않도록 최소 설명만 쓴다.
- [x] 새 섹션이 `class 문서 소유` 와 `메타 파일` 설명을 침범하지 않는지 확인한다.

### 2. `docs/architecture/TARGET_TREE.md`

- [x] `폴더별 책임` 표에서 `.agent_class/tools/` 다음 위치에 4개 leaf 경로를 추가한다.
- [x] 각 row 는 한 줄 요약만 유지한다.
- [x] root 문서답게 세부 동작 방식이나 인증 절차 같은 상세 규칙은 넣지 않는다.
- [x] 새 row 문구가 class 정본 문장과 어긋나지 않는지 교차 확인한다.

## 실행 순서 체크리스트

### 1. 사전 점검

- [x] 수정 대상 두 문서의 최신 내용을 다시 읽는다.
- [x] 현재 워킹트리가 clean 인지 확인한다.
- [x] 삽입 위치가 기존 섹션 흐름을 깨지 않는지 확인한다.

### 2. class 정본 보강

- [x] `AGENT_CLASS_MODEL.md` 에 `## tools/ 하위 역할` 섹션을 추가한다.
- [x] Mermaid 블록 1개를 추가한다.
- [x] leaf 4개 책임 bullet 을 추가한다.
- [x] 문체를 기존 문서 톤에 맞춘다.

### 3. root 색인 동기화

- [x] `TARGET_TREE.md` 표에 leaf 4개 경로를 한 줄 요약으로 추가한다.
- [x] root 문서가 상세 정본 역할을 하지 않도록 요약 수준을 유지한다.

### 4. 정합성 검증

- [x] class 상세 책임의 정본이 `AGENT_CLASS_MODEL.md` 임을 유지한다.
- [x] root 문서는 색인/구조 설명 수준을 벗어나지 않는다.
- [x] Mermaid 가 같은 문서 안에 포함되어 있는지 확인한다.
- [x] 신규 root 문서가 생기지 않았는지 확인한다.
- [x] `.project_agent` 규칙이 확장되지 않았는지 확인한다.
- [x] `_workspaces/<project>/` 일반 폴더 규칙이 추가되지 않았는지 확인한다.
- [x] 구현 코드, 스크립트, 테스트 변경이 없는지 확인한다.
- [x] 의미 기준 밖의 추측성 문장이 들어가지 않았는지 확인한다.

### 5. 결과 정리

- [x] `git diff` 로 변경 범위가 두 문서인지 확인한다.
- [x] 기존 규칙과 충돌하는 문장이 있으면 원인과 수정 이유를 메모한다.
- [x] 한글 커밋 메시지를 1개 고정한다.
- [x] 커밋한다.
- [x] 푸시한다.
- [x] 지정된 출력 형식으로 채팅 결과를 작성한다.

## owner 원칙 체크

- [x] root `docs/` 에 class 상세 책임 정본을 새로 만들지 않는다.
- [x] class 상세 leaf 역할은 `.agent_class/docs/architecture/` 아래에만 둔다.
- [x] `TARGET_TREE.md` 는 색인형 요약만 유지한다.
- [x] root 문서의 역할과 class 정본의 역할이 섞이지 않는다.

## 완료 조건

- [x] `AGENT_CLASS_MODEL.md` 에 `## tools/ 하위 역할` 섹션이 생긴다.
- [x] 위 섹션 안에 Mermaid 1개와 leaf 4개 bullet 이 들어간다.
- [x] `TARGET_TREE.md` 표에 leaf 4개 경로와 한 줄 요약이 들어간다.
- [x] root 문서가 상세 규칙 문서로 비대해지지 않는다.
- [x] owner 원칙 위반이 없다.
- [x] 커밋/푸시 후 결과 보고를 지정 형식으로 바로 복사할 수 있다.

## 결과 보고 형식

- [x] `1. 변경 파일 목록`
- [x] `2. 파일별 변경 전 문제`
- [x] `3. 파일별 수정 요약`
- [x] `4. owner 원칙 위반 여부 체크`
- [x] `5. 핵심 diff 요약`
- [x] `6. 커밋 메시지 제안 1개(한글)`

## 예상 충돌 포인트

- [x] `TARGET_TREE.md` 문구가 길어져 root 색인 문서 톤을 깨지 않는지 판단한다.
- [x] `AGENT_CLASS_MODEL.md` 새 섹션 위치가 `중요한 구분` 과 `메타 파일` 흐름을 방해하지 않는지 판단한다.
- [x] 기존 `tools/` 설명과 새 leaf 설명 사이에 의미 중복이나 모순이 생기지 않는지 판단한다.
