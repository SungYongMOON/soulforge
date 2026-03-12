# .agent/artifacts

## 목적

- `artifacts/` 는 본체 소유 산출물을 둔다.
- mission site 원본 결과물과 구분되는 body 측 파생 산출물을 관리한다.

## 포함 대상

- 본체가 생성한 공용 산출물
- 본체 산출물 메타와 보관 구조
- body 문서나 continuity 를 보조하는 파생 결과물

## 제외 대상

- 프로젝트별 결과물 원본
- class 문서와 class 지식 팩
- 별도 `.agent/export/` 폴더

## 대표 파일

- [`README.md`](README.md): artifacts owner 경계와 body-owned derived output 범위를 정의하는 현재 정본
- [`.agent/body.yaml`](../body.yaml): body 가 artifacts section 을 소유함을 고정하는 메타

## 참조 관계

- `artifacts/` vs `export/`: `artifacts/` 는 본체가 보관하는 파생 산출물 저장 경계이고, `export/` 는 전달 포맷이나 반출 행위에 가까운 관심사라 별도 body 폴더로 두지 않는다.
- project deliverable 원본은 `_workspaces/` owner 로 남고, 여기에는 body 측 복제본이나 파생본만 둘 수 있다.
- [`.agent/README.md`](../README.md)
- [`_workspaces/README.md`](../../_workspaces/README.md)
- [`.agent/docs/architecture/AGENT_BODY_MODEL.md`](../docs/architecture/AGENT_BODY_MODEL.md)

## 변경 원칙

- 전달 포맷이 늘어나도 body 핵심 기관으로서 `.agent/export/` 폴더를 새로 만들지 않는다.
- mission deliverable 공유가 필요하면 owner 를 `_workspaces/` 또는 `_teams/shared/` 로 두고, body 사본만 여기에 남긴다.
- artifacts 분류 체계가 늘어나면 보관 구조와 README 를 같은 변경 안에서 함께 갱신한다.
