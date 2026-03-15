# scripts

## 목적

- Codex App Server thread isolation lab 을 재현하는 단일-file harness 를 둔다.

## 포함 대상

- `app_server_thread_isolation_check.py`: app-server 기동, thread 생성, turn 실행, 결과 검증

## 운영 방식

- 표준 라이브러리만 사용한다.
- harness 는 lab 폴더 안의 `lab_root/`, `artifacts/`만 읽고 쓴다.
