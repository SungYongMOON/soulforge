# codex_app_server_thread_isolation_lab

## 목적

- Codex App Server 를 단일 프로세스로 띄운 뒤, 같은 root 를 공유하는 thread A/B 의 file sharing 과 history isolation 을 검증한다.
- 같은 lab 안에서 sandbox policy 기반 access scope 검증도 별도 스크립트로 수행할 수 있게 유지한다.
- 이 폴더는 실험이 끝나면 통째로 제거할 수 있는 disposable lab 으로 유지한다.

## 구성

- `scripts/`: harness 와 실행 스크립트
- `lab_root/`: 실험 fixture root 와 thread 가 읽고 쓰는 공유 파일
- `artifacts/`: raw message log, turn 응답, summary 같은 산출물

## 운영 방식

- 추적 대상은 harness 와 설명 문서만 둔다.
- `lab_root/` 와 `artifacts/` 내용은 실행 시 생성되고 `.gitignore` 로 추적하지 않는다.
- 실험은 가능한 한 `codex app-server` 프로세스 1개만 사용한다.

## 관련 경로

- [../README.md](../README.md)
- [scripts/README.md](scripts/README.md)
- [lab_root/README.md](lab_root/README.md)
- [artifacts/README.md](artifacts/README.md)
