# Soulforge — 저장소 작업 헌장

## 목적

Soulforge는 canonical 구조와 public/private 경계를 고정한 설계 저장소다.
과거 이행 흔적이나 relocation pointer 는 정본으로 인식하지 않는다.

## 정본 구조

1. `.registry` is the outer canon/store.
2. `.unit` is the active subject owner.
3. `.workflow` is the orchestration canon.
4. `.party` is the reusable orchestration template.
5. `.mission` is the held mission plan owner.
6. `guild_hall` is the cross-project operations root.
7. `_workspaces` is the local-only project worksite.

보조 루트:

- `docs/architecture/` = root-owned canon docs
- `ui-workspace/` = derived UI consumer workspace

## 핵심 원칙

- Species canon uses `.registry/species/<species_id>/species.yaml` with inline `heroes:` entries.
- Class canon uses `.registry/classes/<class_id>/class.yaml` along with class-local `*_refs.yaml` files.
- Raw truth lives only under `_workspaces/<project_code>/.project_agent/runs/<run_id>/`.
- Cross-project ingress/state lives only under `guild_hall/state/**`.
- Cross-project command surface uses `guild-hall:*` only.
- Tracked workspace samples sit under `docs/architecture/workspace/examples/`, not `_workspaces/`.
- `.workflow` and `.party` remain distinct from `.registry`.
- Relocation stubs, old bridges, old work logs, and archive pointers stay excluded from the canonical tree.

## 문서 원칙

- 루트 `README.md` 는 상위 지도를 제공합니다.
- `docs/architecture/foundation/` 는 구조 목적과 owner 경계를 고정합니다.
- `docs/architecture/guild_hall/` 는 `guild_hall` cross-project 운영 owner 문서를 다룹니다.
- `docs/architecture/workspace/` 는 `_workspaces` 및 `.project_agent` 계약을 다룹니다.
- `docs/architecture/ui/` 는 root-owned UI 계약을 다룹니다.
- owner-local 설명과 owner boundary 설명은 각 루트 `README.md` 아래에 담습니다.

## README 동기화 규칙

- 폴더 책임이나 구조가 바뀔 때는 해당 `README.md` 를 같은 변경 안에서 갱신합니다.
- 구조 변경이 상위 owner 경계를 건드리면 루트 `README.md` 와 `docs/architecture/**` 문서도 함께 갱신합니다.
- `.registry/**`, `.unit/**/unit.yaml`, `.workflow/**`, `.party/**`, `docs/architecture/workspace/examples/**` 의 변경은 관련 계약 문서와 동시에 조율합니다.

## 제외 원칙

- top-level relocation stub 는 만들지 않습니다.
- old archive, old checklist, working log 은 active canon 에 포함하지 않습니다.
- `_workspaces/<project_code>/` 실자료는 public tracked tree 로 올리지 않습니다.

## 커밋 원칙

1. 문서와 구조를 같은 커밋에 묶습니다.
2. 범위를 넘는 정리는 따로 나눕니다.
3. 커밋 전에는 status 와 diff 를 다시 점검합니다.
4. 커밋 메시지는 한글을 우선하며, scope 가 분명하면 영어 prefix 를 허용합니다.

## 한 줄 규칙

Soulforge의 정본은 `.registry`, `.unit`, `.workflow`, `.party`, `.mission`, `guild_hall`, `_workspaces` 와 그 계약 문서입니다.
