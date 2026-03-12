# .agent/artifacts

## 목적

- `artifacts/` 는 이 agent 가 재사용 가능한 공용 산출물로 보관하는 서가다.
- body 자체에 귀속되는 reusable output 을 workspace deliverable 과 분리해 둔다.

## 포함 대상

- `templates/`, `playbooks/`, `rubrics/`, `reports/`
- reusable reports 와 body-level reusable outputs
- template 와 운영 playbook

## 제외 대상

- 특정 workspace 의 현장 납품물
- 임시 scratch
- export packaging 규칙
- policy 문서

## 대표 파일

- [`README.md`](README.md): artifacts owner 경계

## 참조 관계

- `artifacts/` vs `export/`: 재사용 가치가 body 자체에 귀속되면 `artifacts/` 다. 전달 포맷 concern 은 별도 `export/` 기관으로 두지 않는다.
- mission 결과물은 `_workspaces/` 로 가고, body reusable output 만 여기에 남긴다.

## 변경 원칙

- reusable output 만 두고 mission-specific deliverable 은 `_workspaces/` 로 분리한다.
- export profile 이 필요해도 별도 top-level body section 을 만들지 않는다.
