# UI Workspace Done

## 상태

- 상태: Done
- 기준 날짜: 2026-03-12
- 범위: UI workspace split, lint guardrail, theme package split, skin-lab closeout

## 완료 선언 기준

- [x] catalog lint PASS
- [x] ui-state contract lint PASS
- [x] read-only boundary lint PASS
- [x] package boundary lint PASS
- [x] fixture coverage lint PASS
- [x] theme isolation lint PASS
- [x] ui-workspace build PASS
- [x] renderer-web dev shell PASS
- [x] skin-lab/storybook build PASS
- [x] skin-lab dev shell PASS
- [x] theme package smoke tests PASS
- [x] docs relative link check PASS

## acceptance 명령

- workspace full check: `npm run done:check`
- root proxy full check: `npm run ui:done:check`
- renderer dev: `npm run dev -- --host 127.0.0.1`
- skin-lab dev: `npm run skin-lab:dev -- --host 127.0.0.1`

## acceptance checklist

1. renderer 는 canonical `.agent`, `.agent_class`, `_workspaces` 를 직접 읽지 않는다.
2. renderer-web 과 skin-lab 은 fixture mode 만으로 build/dev 가 가능하다.
3. renderer-react 는 concrete theme package 가 아니라 `theme-contract` 만 안다.
4. theme package 들은 CSS/token/asset/manifest 만 가진다.
5. lint suite 는 catalog, contract, boundary, coverage, theme isolation 을 모두 자동 검사한다.
6. docs 와 root proxy 는 현재 `ui-workspace/` 구조를 기준으로 탐색 가능하다.

## 종료 판단

- 이번 범위는 "portable read-only UI workspace" 와 "swappable theme package + isolated skin lab" 을 완료 기준으로 한다.
- future editing, producer-native v1 contract, visual regression automation 은 이번 Done 범위 밖이다.

## 다음 단계

- 다음 작업은 [UI_NEXT_PHASE_BACKLOG.md](./docs/UI_NEXT_PHASE_BACKLOG.md) 에 분리한다.
