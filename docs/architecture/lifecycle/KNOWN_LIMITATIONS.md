# known limitations

## 목적

- 이 문서는 Soulforge vNext closeout 시점에 의도적으로 남겨 둔 제한과 운영상 주의점을 사실 기준으로 정리한다.

## known warnings

- `workspace_root_default_bridge`
  repo 내부 `_workspaces/` 를 local smoke root 로 직접 쓰면 legacy `company`, `personal` bridge skip warning 이 남을 수 있다.

## known limitations

- renderer 는 여전히 `derive-ui-state --json` 소비자 역할의 read-only prototype 이다.
- control center 는 full 6-rail owner shell 이 아니라 compatibility grouping 기반의 UI shell 이다.
- current public validator 는 local-only `.project_agent/` deep schema validation 을 강제하지 않는다.

## data / contract 남은 과제

- future local harness 에서 `.project_agent/contract.yaml` 최소 필드 검증을 더 엄밀히 붙일 수 있다.
- UI consumer 에 남아 있는 compatibility projection 을 더 줄여 6축 top-level 직접 소비로 옮길 여지가 있다.

## 운영 상 주의점

- local-only sample project 는 smoke 검증용으로만 사용한다.
- `_workspaces` 실제 project content 는 `.gitignore` 와 guardrail check 로 public tracking 대상이 아니어야 한다.
- archive 와 dev log 에 남은 legacy vocabulary 는 historical record 로만 본다.

## 후속 차수 후보

- full 6-rail control center owner navigation
- deeper local-only workspace harness
- stronger `_workspaces` 재추적 방지 릴리즈 체크
