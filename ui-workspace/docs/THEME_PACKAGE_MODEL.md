# Theme Package Model

## 목적

- theme package 를 renderer 구조에서 분리해 CSS, token, asset, manifest 중심으로 유지한다.
- skin 개발은 fixture 와 isolated preview app 만으로 병렬 진행한다.

## 계층

1. `packages/theme-contract`
- theme manifest 타입
- data attribute key
- material/icon hook slot

2. `packages/theme-adventurers-desk`
- theme manifest 구현
- CSS variable 정의
- package-local asset

3. `packages/renderer-react`
- structural CSS
- semantic hook (`data-material`, `data-status-tone`, `data-asset-state`)
- theme manifest consume only

4. `apps/renderer-web`, `apps/skin-lab-storybook`
- installed theme registry
- theme selector
- document root attribute apply

## swap mechanism

- renderer 는 `ThemeManifest` 만 안다.
- app shell 은 설치된 theme package 를 import 하고 registry 를 만든다.
- 선택된 theme id 를 `data-sf-theme`, `data-sf-theme-phase` 로 document root 에 적용한다.
- renderer structural CSS 는 `--sf-*` token 만 소비한다.
- 다른 theme package 는 같은 contract 와 hook 이름만 맞추면 renderer 수정 없이 교체 가능하다.

## hook 원칙

- material hook 은 semantic slot 기준이다.
- icon hook 은 semantic meaning 기준이다.
- renderer 는 canonical path, fixture source, theme asset 내부 경로를 알지 않는다.

## skin-lab 병렬 개발

- `apps/skin-lab-storybook` 는 story state 와 theme selector 로만 동작한다.
- preview state 는 `active`, `installed only`, `required`, `preferred`, `invalid dependency`, `none/unknown/partial` 를 모두 포함한다.
- canonical integration bridge 없이도 theme package 개발과 packaging smoke test 를 반복할 수 있다.
