# 2026-03-10 문서 소유권 정리 패치 계획

## 상태

- [x] 진행 상태를 `완료` 로 바꾼다.
- [x] 이 계획 파일을 기준 체크리스트로 사용한다.

## 목적

- [x] root `docs/` 에 남아 있는 body/class 전용 문서를 owner 기준 위치로 재배치한다.
- [x] root 문서는 root/레포 전체 설명만 남도록 정리한다.
- [x] 이동 후 링크, 문서 목록, 참조 경로를 함께 보정한다.

## 범위

- [x] `README.md`
- [x] `AGENTS.md`
- [x] `docs/architecture/*`
- [x] `.agent/docs/*`
- [x] `.agent_class/docs/*`

## 하지 말 것

- [x] 구현 코드를 추가하지 않는다.
- [x] runtime 을 추가하지 않는다.
- [x] `_workspaces` 내부 프로젝트 문서까지 손대지 않는다.
- [x] 무계획 대량 이동을 하지 않는다.
- [x] `AGENT_WORLD_MODEL.md` 자체 내용을 새로 확장하는 작업까지 넓히지 않는다.

## ASSUMPTIONS

- [x] 현재 기준에서는 `README.md` 와 `AGENTS.md` 는 root 유지 대상이다.
- [x] `WORKSPACE_PROJECT_MODEL.md` 는 root/레포 전체 구조 설명 문서로 유지한다.
- [x] `CLASS_METADATA_CONTRACT.md` 는 이미 class 소유 위치에 있으므로 이동하지 않는다.
- [x] `DOCUMENT_OWNERSHIP.md` 는 repo 전체 규칙 문서 성격이 있으므로 root 이동 가능성을 반드시 재평가한다.

## 사전 확인

- [x] 현재 문서 트리를 다시 확인한다.
- [x] `.agent/docs/architecture/` 가 비어 있거나 부재한지 확인한다.
- [x] `.agent_class/docs/architecture/` 의 현재 문서 구성을 확인한다.
- [x] 현재 워킹트리가 clean 인지 확인한다.

## 1. 문서 소유권 재판정

- [x] `README.md` 의 owner 를 root 로 확정한다.
- [x] `AGENTS.md` 의 owner 를 root 로 확정한다.
- [x] `docs/architecture/AGENT_BODY_MODEL.md` 의 owner 를 body 로 확정한다.
- [x] `docs/architecture/AGENT_CLASS_MODEL.md` 의 owner 를 class 로 확정한다.
- [x] `docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md` 의 owner 를 class 로 확정한다.
- [x] `docs/architecture/WORKSPACE_PROJECT_MODEL.md` 의 owner 를 root 로 확정한다.
- [x] `docs/architecture/TARGET_TREE.md` 의 owner 를 root 로 확정한다.
- [x] `docs/architecture/REPOSITORY_PURPOSE.md` 의 owner 를 root 로 확정한다.
- [x] `docs/architecture/CURRENT_DECISIONS.md` 의 owner 를 root 로 확정한다.
- [x] `docs/architecture/MIGRATION_REFERENCE.md` 의 owner 를 root 로 확정한다.
- [x] `.agent_class/docs/architecture/CLASS_METADATA_CONTRACT.md` 의 owner 를 class 로 재확인한다.
- [x] `.agent_class/docs/architecture/DOCUMENT_OWNERSHIP.md` 의 owner 를 root vs class 중 하나로 재판정한다.

## 2. 디렉터리 준비

- [x] `.agent/docs/architecture/` 디렉터리가 없으면 생성한다.
- [x] `.agent_class/docs/architecture/` 디렉터리가 실제로 존재하는지 확인한다.
- [x] 필요하면 `.gitkeep` 또는 실제 문서 파일로 빈 디렉터리 상태를 해소한다.

## 3. 이동 수행 대상 고정

- [x] `docs/architecture/AGENT_BODY_MODEL.md -> .agent/docs/architecture/AGENT_BODY_MODEL.md`
- [x] `docs/architecture/AGENT_CLASS_MODEL.md -> .agent_class/docs/architecture/AGENT_CLASS_MODEL.md`
- [x] `docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md -> .agent_class/docs/architecture/INSTALLATION_AND_LOADOUT_CONCEPT.md`
- [x] 이동 후 root 원본 파일 삭제 여부를 확인한다.
- [x] 중복 문서가 남지 않도록 최종 경로를 하나로 정리한다.

## 4. `DOCUMENT_OWNERSHIP.md` 위치 재평가

- [x] 현재 `.agent_class/docs/architecture/DOCUMENT_OWNERSHIP.md` 내용을 읽고 범위를 점검한다.
- [x] 이 문서가 repo 전체 규칙인지 class 전용 규칙인지 판단 근거를 정리한다.
- [x] root 이동안의 장단점을 적는다.
- [x] 현재 위치 유지안의 장단점을 적는다.
- [x] 권장안을 하나로 결정한다.
- [x] 권장안이 root 이동이면 `docs/architecture/DOCUMENT_OWNERSHIP.md` 로 옮긴다.
- [x] 권장안이 현 위치 유지면 root 문서에서 class 소유 문서임을 분명히 적는다.

## 5. root 유지 문서 고정

- [x] `README.md` 를 root 유지 목록으로 명시한다.
- [x] `AGENTS.md` 를 root 유지 목록으로 명시한다.
- [x] `docs/architecture/REPOSITORY_PURPOSE.md` 를 root 유지 목록으로 명시한다.
- [x] `docs/architecture/TARGET_TREE.md` 를 root 유지 목록으로 명시한다.
- [x] `docs/architecture/CURRENT_DECISIONS.md` 를 root 유지 목록으로 명시한다.
- [x] `docs/architecture/MIGRATION_REFERENCE.md` 를 root 유지 목록으로 명시한다.
- [x] `docs/architecture/WORKSPACE_PROJECT_MODEL.md` 를 root 유지 목록으로 명시한다.
- [x] `docs/architecture/DOCUMENT_OWNERSHIP.md` 는 재평가 결과에 따라 root 유지 또는 위치 유지로 확정한다.

## 6. 링크와 참조 갱신

- [x] `README.md` 의 문서 링크를 새 경로에 맞게 갱신한다.
- [x] `AGENTS.md` 의 참조 문서를 새 경로에 맞게 갱신한다.
- [x] `docs/architecture/TARGET_TREE.md` 의 문서 소유 경로 설명을 갱신한다.
- [x] `docs/architecture/CURRENT_DECISIONS.md` 의 문서 세트 경로를 점검한다.
- [x] `docs/architecture/REPOSITORY_PURPOSE.md` 의 자주 찾는 파일 목록을 점검한다.
- [x] `docs/architecture/WORKSPACE_PROJECT_MODEL.md` 의 상호 참조를 점검한다.
- [x] `AGENT_BODY_MODEL.md` 내부에서 self-location 설명이 새 경로와 맞는지 확인한다.
- [x] `AGENT_CLASS_MODEL.md` 내부에서 class 문서 소유 설명이 새 경로와 맞는지 확인한다.
- [x] `INSTALLATION_AND_LOADOUT_CONCEPT.md` 내부 링크가 새 경로와 맞는지 확인한다.

## 7. class 공용 운영 폴더 유지 확인

- [x] `.agent_class/docs/plans/` 를 유지한다.
- [x] `.agent_class/docs/devlog/` 를 유지한다.
- [x] `.agent_class/docs/prompts/` 를 유지한다.
- [x] 기존 계획/로그/프롬프트 파일이 이동 작업으로 영향을 받지 않는지 확인한다.

## 8. 점검용 이동표 작성 또는 갱신

- [x] 이동한 파일 목록을 별도 기록한다.
- [x] root 유지 파일 목록을 별도 기록한다.
- [x] 링크 갱신 파일 목록을 별도 기록한다.
- [x] `DOCUMENT_OWNERSHIP.md` 위치 결정 이유를 별도 기록한다.

## 9. 최종 검증

- [x] root `docs/` 에 body/class 전용 문서가 남아 있지 않은지 확인한다.
- [x] `.agent/docs/` 아래에 body 문서가 들어갔는지 확인한다.
- [x] `.agent_class/docs/` 아래에 class 문서가 들어갔는지 확인한다.
- [x] 깨진 상대 경로 링크가 없는지 확인한다.
- [x] 중복 파일이나 stale 경로 참조가 없는지 확인한다.
- [x] `AGENT_WORLD_MODEL.md` 는 불필요하게 수정되지 않았는지 확인한다.
- [x] 구현 코드와 runtime 관련 변경이 없는지 확인한다.

## 10. 결과 보고 형식

- [x] `1. 이동한 파일 목록`
- [x] `2. root 유지 파일 목록`
- [x] `3. 링크 갱신 파일 목록`
- [x] `4. 남은 오픈 이슈`

## 예상 판단 포인트

- [x] `DOCUMENT_OWNERSHIP.md` 는 root 이동이 더 자연스러운지 판단한다.
- [ ] root 문서 목록에 alias/index 문서를 둘 필요가 있는지 판단한다.
- [ ] relocation 이후 `TARGET_TREE.md` 의 서술 수준을 더 세분화할지 판단한다.

## 완료 조건

- [x] root docs 는 root 설명만 남는다.
- [x] body 문서는 `.agent/docs/` 로 정리된다.
- [x] class 문서는 `.agent_class/docs/` 로 정리된다.
- [x] 링크 깨짐이 없다.
- [x] 이동 후 문서 세트가 더 명확해진다.
