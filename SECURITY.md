# SECURITY

## 범위

- Soulforge public repo 는 canonical 구조, public-safe sample, 검증 하네스를 다룬다.
- secret, credential, session, token, password, cookie, 보호 대상 업무 데이터, `guild_hall/state/**` 실자료는 public 범위가 아니다.

## 취약점 제보 원칙

1. secret 노출, public/private boundary 위반, 인증 우회, unsafe automation, 민감 정보 추적 같은 이슈는 public issue 로 올리지 않는다.
2. 먼저 GitHub 의 private security reporting 경로가 열려 있으면 그 경로를 사용한다.
3. private security reporting 이 없으면 저장소 owner 에게 GitHub private contact 경로로 먼저 제보한다.
4. 재현 단계에는 실제 secret 값이나 보호 대상 원문을 포함하지 않는다.

## 기대하는 제보 내용

- 영향 경로
- 재현 조건
- 예상 영향
- 임시 완화 방법

## 저장소 운영 메모

- bootstrap/doctor/validator 는 secret 파일 내용을 읽거나 출력하지 않는 방향을 기본으로 둔다.
- public repo 에는 private-state mirror, project `_workmeta` truth, runtime mailbox/state 를 commit 하지 않는다.
