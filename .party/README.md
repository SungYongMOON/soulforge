# .party

## 정본 의미

- `.party/` 는 reusable party template 와 template-level stats 의 정본 루트다.
- party 는 member slot, allowed species/class/workflow, appserver profile 을 소유한다.
- `.party/` 는 raw battle log, project-specific operational metrics owner 가 아니다.

## 무엇을 둔다

- `index.yaml`
- `<party_id>/party.yaml`
- `<party_id>/member_slots.yaml`
- `<party_id>/allowed_species.yaml`
- `<party_id>/allowed_classes.yaml`
- `<party_id>/allowed_workflows.yaml`
- `<party_id>/appserver_profile.yaml`
- `<party_id>/stats/`

## 무엇을 두지 않는다

- raw battle log, run id, feedback dump, project-local operational metrics
- `_workspaces/<project_code>/` run artifact 와 analytics truth
- active unit session transcript

## 왜 이렇게 둔다

- party 는 조합 템플릿이므로 reusable fit 정보만 공개 정본에 남기고 실제 전투 기록은 mission site 에 남겨야 한다.
- template-level stats 만 유지해야 party canon 과 project performance data 의 owner 경계가 분리된다.

## template skeleton

- [`index.yaml`](index.yaml): party template index
- [`example_party/party.yaml`](example_party/party.yaml): placeholder party definition
- [`example_party/stats/README.md`](example_party/stats/README.md): template-level stats only rule
