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

### `done:check` 전제 (worktree에서 실행할 때)

관측된 전제 두 가지다. 어느 쪽이 빠져도 이 변경과 무관한 실패로 멈춘다.

- **`node_modules`를 정션으로 연결하지 않는다.** 정션이면 esbuild가 실제 경로를
  주석에 박아 Universal Client 번들이 실제로는 같은데도
  `Universal Client transport bundle drifted`로 실패한다. 실제 복사본을 쓴다.
- **`SOULFORGE_SECURE_WORK_TEST_PYTHON`에 Python 3.10+ 실행 파일을 지정한다.**
  없으면 secure-work 전송 시험 3건이 건너뛰고, HPP 팩 subset-smoke의
  `skipped === 0` 단언이 깨져 `deployment-pack`에서 멈춘다(수정 없는 main에서도 동일).
  지정값은 심볼릭 링크가 아니고 `nlink === 1`이어야 한다. 하드링크로 설치된
  런타임은 `FEEDBACK_RUNTIME_PATH_UNSAFE`로 거부된다.

`ui-workspace/apps/dev-erp` 아래 시험 파일을 추가하면 HPP 서버 팩 파일 집합이
바뀐다. `hpp_server_pack.spec.json`은 손으로 고치지 말고
`node guild_hall/deployment_pack/tools/emit_hpp_spec.mjs`로 재발행한다.

## 문서 동기화 체크

- `package.json`, `guild_hall/**`, `.workflow/**`, `.party/**`, `.mission/**`, `.unit/**`, `.registry/**` 구조를 바꾸면 관련 `README.md` 와 architecture 문서를 같이 본다.
- public 운영 규칙이 바뀌면 `CHANGELOG.md` 를 같은 변경 안에서 갱신한다.
- bootstrap/profile 규칙이 바뀌면 `docs/architecture/bootstrap/**` 와 root `README.md` 를 같이 확인한다.

## Pull Request 기준선

- PR 전 `npm run validate` 가 통과해야 한다.
- UI/workspace 또는 gateway/mail_fetch 까지 건드렸으면 `npm run done:check` 까지 확인한다.
- owner boundary, public/private 분리, ontology binding, canonical path/ref 규칙을 깨지 않는지 다시 본다.
