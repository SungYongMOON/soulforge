# scripts

## 목적

- Codex App Server thread isolation lab 을 재현하는 단일-file harness 를 둔다.

## 포함 대상

- `app_server_thread_isolation_check.py`: app-server 기동, thread 생성, turn 실행, 결과 검증
- `app_server_access_scope_check.py`: sandbox policy 기반 접근 제한 검증 전용 harness
- `app_server_multi_persona_check.py`: 4개 thread 에 서로 다른 developer instruction 을 고정하고 공통 prompt 저항성과 멀티턴 일관성을 검증
- `app_server_exec_turn_baseline_matrix.py`: `command/exec` 와 `turn/start`, `includePlatformDefaults=true/false` 차이를 분리 검증
- `app_server_workspace_contamination_check.py`: shared workspace 를 통한 정보 유입과 history contamination 분리를 검증
- `app_server_instruction_precedence_check.py`: developer instruction 과 충돌 user prompt 사이의 precedence 를 검증
- `app_server_concurrency_stability_check.py`: 4개 turn 동시 시작 후 event interleaving, completion, structured reply 안정성을 검증

## 운영 방식

- 표준 라이브러리만 사용한다.
- harness 는 lab 폴더 안의 `lab_root/`, `artifacts/`만 읽고 쓴다.
- 기존 JSON-RPC helper 는 재사용하고, persona 실험도 app-server 단일 프로세스 하나만 사용한다.
