# CODEX_OWNER_UPDATE_PROMPT_V0

아래 프롬프트를 다른 PC 의 Codex 에 넣으면, 설치된 Soulforge 를 owner-with-state 기준으로 최신 상태까지 갱신하도록 지시할 수 있다.

```text
Soulforge를 이 PC에서 owner-with-state 프로필 기준으로 최신 상태로 업데이트해줘.

규칙:
- 먼저 `npm run guild-hall:doctor -- --profile owner-with-state --remote` 를 실행해서 public/private repo 의 before 상태를 확인해
- public repo 는 Soulforge root, private repo 는 Soulforge root 아래 nested `private-state/`
- behind 인 repo 만 `git pull --rebase origin main` 으로 갱신해
- local env, token, password, cookie, session, credential JSON 은 읽거나 바꾸지 마
- pull 이 끝나면 `npm run skills:sync -- shield_wall record_stitch skill_check` 를 실행해
- 마지막에 `npm run guild-hall:doctor -- --profile owner-with-state` 를 실행해
- 외부 연결까지 다시 보고 싶을 때만 `npm run guild-hall:doctor -- --profile owner-with-state --live` 를 실행해

끝나면 아래만 짧게 보고해
- public/private 각각 before ahead/behind
- public/private 각각 pull 여부
- skills sync 결과
- final doctor 결과
```
