# CHANGELOG_POLICY_V0

## 목적

- 이 문서는 Soulforge public/private 저장소의 revision note 작성 규칙을 잠근다.
- Git log 만으로 부족한 운영 의미, 설치 영향, owner action 을 사람이 읽기 좋은 patch note 로 남기게 한다.

## 한 줄 정의

- public repo 는 `CHANGELOG.md`, nested private repo 는 `private-state/CHANGELOG.md` 에 각각 revision note 를 남긴다.

## 기본 원칙

1. public repo revision note 는 기능 코드, 구조, bootstrap/doctor/update/handoff 규칙 변경을 기록한다.
2. private repo revision note 는 continuity data sync, private data plane 구조, private 운영 규칙 변경을 기록한다.
3. secret 값, credential, token, password, cookie, session 은 어떤 changelog 에도 적지 않는다.
4. 업무 데이터의 본문 원문을 changelog 에 복사하지 않는다.
5. changelog 는 commit message 요약이 아니라, 운영자에게 중요한 영향과 다음 행동을 함께 적는다.

## 언제 갱신하는가

- public repo 에 구조/문서/기능/설치 흐름/명령 표면 변경이 있을 때
- private repo 에 continuity data schema 나 운영 규칙이 바뀔 때
- owner handoff, bootstrap, update 절차가 바뀔 때
- 다른 PC 설치/복구/restore 규칙이 바뀔 때

## 항목 형식

최소 항목은 아래를 따른다.

- `날짜`
- `Revision <commit>`
- `무엇이 바뀌었는가`
- `운영 영향`
- `관련 경로`

## 저장소별 위치

- public repo:
  - `CHANGELOG.md`
- private repo:
  - `private-state/CHANGELOG.md`

## 관련 문서

- [`../../../CHANGELOG.md`](../../../CHANGELOG.md)
- [`../../../private-state/CHANGELOG.md`](../../../private-state/CHANGELOG.md)
- [`../../bootstrap/README.md`](../bootstrap/README.md)
- [`../../workspace/PRIVATE_STATE_REPO_V0.md`](../workspace/PRIVATE_STATE_REPO_V0.md)
