# guild_hall/dungeon_assignment

## 목적

- `dungeon_assignment/` 는 gateway staging 몬스터를 실제 project/stage 로 배치하는 owner 다.
- 배치 결과는 `guild_hall` staging state 와 `_workspaces/<project_code>/` project-side monster record 를 함께 이어 준다.

## 현재 CLI

```bash
node guild_hall/dungeon_assignment/cli.mjs file \
  --inbox-dir guild_hall/state/gateway/intake_inbox/<inbox_id> \
  --monster-id <gateway_monster_id>
```

- gateway monster 또는 triaged candidate 를 private filing packet 으로 바꾼다.
- project-side monster declaration 은 `_workmeta/<project_code>/monsters/<monster_id>.yaml` 에 쓰며, `monster_id` 는 gateway stable key 를 그대로 유지한다.
- workspace bridge 는 `_workspaces/<project_code>/020_MGMT/022_INBOX_원본수집/` 와 `020_MGMT/027_수신이력_이동이력/` 에 metadata-only filing/history 를 쓴다.
- private mission handoff 는 `--emit-private-mission-handoff` 를 명시한 경우 `_workmeta/<project_code>/missions/<mission_id>/` 아래에 `mission.yaml`, `readiness.yaml`, `dispatch_request.yaml`, `resolved_plan.yaml` 을 pointer-only project-local metadata 로 쓴다.
- `.mission/**` public draft 는 `--emit-public-mission-draft --public-project-code <safe-code>` 를 명시하고 redaction check 를 통과한 경우에만 생성한다. 기본 상태는 `blocked` 다.
- private mission handoff 와 public `.mission/**` draft 는 같은 실행에서 동시에 만들지 않는다.
- project 또는 stage 가 unresolved 이면 mission handoff 는 만들지 않는다.
