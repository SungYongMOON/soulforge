# CONTRIBUTING

## 목적

- 이 문서는 Soulforge public repo 변경 전에 최소 검증과 문서 동기화 규칙을 짧게 고정한다.
- public repo 는 코드/구조 문서/public-safe sample 만 다루고, private runtime truth 는 범위 밖으로 둔다.

## 기본 원칙

1. 변경은 owner root 와 그 계약 문서를 함께 갱신한다.
2. 구조 변경이 있으면 해당 `README.md` 와 필요 시 `docs/architecture/**` 문서를 같은 변경 안에서 갱신한다.
3. public repo 에는 secret, token, password, cookie, session, credential JSON, 보호 대상 업무 데이터, `guild_hall/state/**` 실자료를 넣지 않는다.
4. `_workspaces/**` 실자료, `_workmeta/**` project metadata, `private-state/**` continuity record 는 public contribution 범위가 아니다.

## 로컬 검증

- 최소 검증:
  - `npm run validate`
- 더 넓은 점검:
  - `npm run done:check`
- bootstrap/profile readiness:
  - `npm run guild-hall:doctor -- --profile public-only`
  - `npm run guild-hall:doctor -- --profile operator`
  - `npm run guild-hall:doctor -- --profile owner-with-state`

## 문서 동기화 체크

- `package.json`, `guild_hall/**`, `.workflow/**`, `.party/**`, `.mission/**`, `.unit/**`, `.registry/**` 구조를 바꾸면 관련 `README.md` 와 architecture 문서를 같이 본다.
- public 운영 규칙이 바뀌면 `CHANGELOG.md` 를 같은 변경 안에서 갱신한다.
- bootstrap/profile 규칙이 바뀌면 `docs/architecture/bootstrap/**` 와 root `README.md` 를 같이 확인한다.

## Pull Request 기준선

- PR 전 `npm run validate` 가 통과해야 한다.
- UI/workspace 또는 gateway/mail_fetch 까지 건드렸으면 `npm run done:check` 까지 확인한다.
- owner boundary, public/private 분리, ontology binding, canonical path/ref 규칙을 깨지 않는지 다시 본다.
