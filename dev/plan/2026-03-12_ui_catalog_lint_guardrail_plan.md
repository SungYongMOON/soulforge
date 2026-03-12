# 2026-03-12 UI catalog lint guardrail plan

## 목표

- Soulforge renderer consumer layer 에 UI/카탈로그 필수 검사기 세트를 먼저 도입한다.
- 기능 확장보다 data contract, catalog projection, read-only boundary 정합성을 자동 검사하는 데 초점을 둔다.

## 범위

- `tools/ui-lint/` workspace 추가
- catalog lint 구현
- ui-state contract lint 구현
- read-only boundary lint 구현
- package boundary lint 구현
- fixture coverage lint 구현
- theme isolation lint 구현
- 루트 `npm` 명령과 README/LINT_RULES 문서화

## 우선순위

1. catalog lint
2. ui-state contract lint
3. read-only/package boundary lint
4. fixture coverage lint
5. theme isolation lint

## done 기준

1. `npm run ui:lint:all` 이 PASS 한다.
2. 각 lint 별 단일 실행 명령이 있다.
3. catalog lint 가 fixture projection 과 canonical YAML target 을 함께 검사한다.
4. README 와 `tools/ui-lint/LINT_RULES.md` 에 lint 목적과 규칙이 적힌다.

## 검증 계획

1. `npm run ui:lint:catalog`
2. `npm run ui:lint:ui-state`
3. `npm run ui:lint:read-only`
4. `npm run ui:lint:packages`
5. `npm run ui:lint:fixtures`
6. `npm run ui:lint:theme`
7. `npm run ui:lint:all`

## ASSUMPTIONS

- 이번 package boundary lint 는 renderer package 경계에 집중하고, tooling package 자체의 repo scan 은 예외로 둔다.
- catalog lint 는 현재 fixture baseline 과 canonical sample YAML 세트를 기준으로 삼고, future producer payload lint 는 다음 라운드로 미룬다.
