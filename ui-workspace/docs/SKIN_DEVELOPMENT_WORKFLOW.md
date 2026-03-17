# Skin Development Workflow

## 목적

- 새 `theme-*` 패키지를 Soulforge UI workspace 에 추가할 때 필요한 최소 절차를 고정한다.
- skin 개발을 renderer 구현과 분리하고 `skin-lab-storybook` 중심으로 병렬 진행한다.

## 기본 원칙

- 스킨 구현은 `ui-workspace/packages/theme-*/` 아래 theme package 에만 둔다.
- `packages/renderer-react/` 는 `theme-contract` 만 알고 concrete theme package 는 직접 알지 않는다.
- `apps/renderer-web/`, `apps/skin-lab-storybook/` 는 registry 로 theme package 를 설치한다.
- palette token, raw color literal, asset path 는 theme package 내부에만 둔다.
- canonical `.registry`, `.unit`, `.workflow`, `.party`, `_workspaces` 정본은 skin 코드에서 직접 읽지 않는다.

## 최소 골격

```text
ui-workspace/packages/theme-my-skin/
├── README.md
├── package.json
├── theme.css
├── assets/
└── src/
    └── index.ts
```

필수 파일 책임:

- `package.json`: workspace package 이름과 export 정의
- `src/index.ts`: `ThemeManifest` 배열 export
- `theme.css`: `--sf-*` token 과 material surface 정의
- `README.md`: 스킨 목적, 포함 대상, 제외 대상
- `assets/`: 스킨 전용 texture, icon, image asset

## 개발 절차

1. `packages/theme-contract/src/index.ts` 에 있는 material/icon slot 을 먼저 확인한다.
2. `ui-workspace/packages/theme-<name>/` 패키지를 만들고 manifest, CSS token, asset 을 작성한다.
3. `ui-workspace/apps/renderer-web/package.json` 과 `ui-workspace/apps/skin-lab-storybook/package.json` 에 새 theme package dependency 를 추가한다.
4. `ui-workspace/apps/renderer-web/src/themes.ts` 와 `ui-workspace/apps/skin-lab-storybook/src/themes.ts` 에 새 theme manifest 와 `theme.css` import 를 registry 로 연결한다.
5. `npm run ui:workspace:install` 로 workspace dependency 를 설치한다.
6. `npm run ui:skin-lab:dev` 로 story/theme selector 기준 preview 를 확인한다.
7. 완료 전에 lint, build, smoke 순서로 검증한다.

## 권장 검증 순서

```bash
npm run ui:validate
npm run ui:lint:theme
npm run ui:lint:packages
npm run ui:lint:read-only
npm run ui:skin-lab:build
npm run ui:smoke:theme-pack
npm run ui:done:check
```

의미:

- `ui:lint:theme`: token/raw color/theme css registry 위치 검사
- `ui:lint:packages`: renderer, app shell, theme package 경계 검사
- `ui:lint:read-only`: canonical tree 직접 참조 금지 검사
- `ui:smoke:theme-pack`: 현재 worktree 의 모든 `theme-*` 패키지 패키징 검사

## Worktree 분리 기준

별도 `git worktree` 로 스킨 작업을 분리해도 된다. 현재 UI workspace 스크립트는 모두 현재 worktree 경로를 기준으로 상대 경로를 계산하므로 worktree-safe 하다.

예시:

```bash
git worktree add ../Soulforge-skin-ember -b codex/skin-ember
cd ../Soulforge-skin-ember
npm run ui:workspace:install
npm run ui:skin-lab:dev
```

안전한 이유:

- root proxy 스크립트는 `npm --prefix ui-workspace` 로 현재 worktree 안의 workspace 를 사용한다.
- `ui-lint` 는 `ui-workspace` 기준 상대 경로와 `UI_LINT_CANONICAL_ROOT=..` 를 사용하므로 현재 worktree 의 canonical tree 를 검사한다.
- `smoke-theme-pack.mjs` 는 현재 worktree 의 `packages/theme-*` 를 탐색해서 패키징한다.
- `package-lock.json` 과 `node_modules/` 는 worktree 경로별로 분리되므로 의존성 실험을 main 작업선과 격리할 수 있다.

주의점:

- 각 worktree 에서 `npm run ui:workspace:install` 을 별도로 실행해야 한다.
- 두 worktree 가 동시에 Vite dev server 를 띄우면 포트 충돌이 날 수 있으니 필요하면 `-- --port <번호>` 를 붙인다.
- `package.json` 또는 `package-lock.json` 을 여러 worktree 에서 동시에 바꾸면 병합 후 다시 install 하고 검증을 반복한다.

## 관련 경로

- [THEME_PACKAGE_MODEL.md](./THEME_PACKAGE_MODEL.md)
- [UI_RENDERER_MODEL.md](./UI_RENDERER_MODEL.md)
- [packages/theme-contract/src/index.ts](../packages/theme-contract/src/index.ts)
- [apps/skin-lab-storybook/README.md](../apps/skin-lab-storybook/README.md)
