# Soulforge — 저장소 작업 헌장

## 목적

Soulforge는 현재 canonical 구조와 public/private 경계를 고정하는 설계 저장소다.
과거 이행 흔적이나 relocation pointer 는 정본으로 취급하지 않는다.

## 정본 구조

1. `.registry` = outer canon/store
2. `.unit` = active subject owner
3. `.workflow` = orchestration canon
4. `.party` = reusable orchestration template
5. `_workspaces` = local-only runtime site

보조 루트:

- `docs/architecture/` = root-owned canon docs
- `ui-workspace/` = derived UI consumer workspace

## 핵심 원칙

- species canon 은 `.registry/species/<species_id>/species.yaml` 와 inline `heroes:` 를 사용한다.
- class canon 은 `.registry/classes/<class_id>/class.yaml` 와 class-local `*_refs.yaml` 를 사용한다.
- raw truth 는 `_workspaces/<project_code>/.project_agent/runs/<run_id>/` 아래에만 둔다.
- tracked workspace sample 은 `_workspaces/` 아래가 아니라 `docs/architecture/workspace/examples/` 아래에 둔다.
- `.workflow` 와 `.party` 는 `.registry` 아래로 흡수하지 않는다.
- relocation stub, old bridge, old work log, archive pointer 를 새 정본처럼 되살리지 않는다.

## 문서 원칙

- 루트 `README.md` 는 상위 지도만 유지한다.
- `docs/architecture/foundation/` 는 구조 목적, 목표 트리, owner 경계를 고정한다.
- `docs/architecture/workspace/` 는 `_workspaces` 와 `.project_agent` 계약을 다룬다.
- `docs/architecture/ui/` 는 root-owned UI 계약만 다룬다.
- owner-local 설명은 각 루트 `README.md` 아래에 둔다.

## README 동기화 규칙

- 폴더 책임이나 구조가 바뀌면 같은 변경 안에서 해당 `README.md` 를 갱신한다.
- 구조 변경이 상위 owner 경계에 영향을 주면 루트 `README.md` 와 `docs/architecture/**` 문서도 함께 갱신한다.
- `.registry/**`, `.unit/**/unit.yaml`, `.workflow/**`, `.party/**`, `docs/architecture/workspace/examples/**` 가 바뀌면 관련 계약 문서도 같은 변경 안에서 맞춘다.

## 제외 원칙

- top-level relocation stub 를 다시 만들지 않는다.
- old archive, old checklist, working log 를 active canon 으로 남기지 않는다.
- `_workspaces/<project_code>/` 실자료를 public tracked tree 로 올리지 않는다.

## 커밋 원칙

1. 문서와 구조를 같은 커밋에 묶는다.
2. 범위를 넘는 정리는 따로 쪼갠다.
3. 커밋 전에 status 와 diff 를 다시 확인한다.
4. 커밋 메시지는 한글 우선이지만, scope 가 분명하면 영어 prefix 도 허용한다.

## 한 줄 규칙

Soulforge의 정본은 `.registry`, `.unit`, `.workflow`, `.party`, `_workspaces` 와 그 계약 문서다.
