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
- Raw truth lives only under `_workmeta/<project_code>/runs/<run_id>/`.
- Cross-project ingress/state lives only under `guild_hall/state/**`.
- Cross-project command surface uses `guild-hall:*` only.
- Tracked workspace samples sit under `docs/architecture/workspace/examples/`, not `_workspaces/`.
- `.workflow` and `.party` remain distinct from `.registry`.
- Relocation stubs, old bridges, old work logs, and archive pointers stay excluded from the canonical tree.

## Git 저장 규칙

- 기능 코드, 구조 문서, public-safe example 변경은 public GitHub repo (`Soulforge/.git`) 에 commit/push 한다.
- 메일 자료, 몬스터 이력, 해결 기록, battle_log, morning_report, outbound mail 기록 같은 보호 대상 업무 데이터는 public repo 에 commit/push 하지 않는다.
- project-local contract, run truth, onboarding note 같은 과제별 metadata 는 Soulforge root 아래 nested private repo `_workmeta/<project_code>/` 에만 둔다.
- guild_hall continuity, ingress history, outbound log 같은 cross-project 보호 데이터는 Soulforge root 아래 nested private repo `private-state/` 에만 commit/push 한다.
- active AI workspace 는 `Soulforge/` 를 기준으로 읽되, project-local private metadata 는 companion `_workmeta/`, cross-project private data plane 은 `private-state/` 에서 함께 읽는다.
- 저장 대상이 불분명하면 public 이 아니라 private 쪽으로 해석하고, 공개 가능 여부가 확인되기 전에는 public commit 에 포함하지 않는다.

## Secret 취급 규칙

- `.env`, token, password, cookie, session, credential JSON 같은 secret 파일은 agent 가 내용을 열어 읽지 않는다.
- secret 파일이 필요하면 agent 는 파일 경로와 대상 경로만 안내하고, 사용자가 직접 복사/입력하게 한다.
- bootstrap/이전 작업에서 agent 는 secret 파일의 존재 여부만 점검할 수 있지만, 값을 출력하거나 요약하지 않는다.
- secret 값을 다른 PC 로 옮길 때도 agent 는 “어느 파일을 사용자가 직접 열어 복사해야 하는지”만 안내한다.

## 문서 원칙

- 루트 `README.md` 는 상위 지도를 제공합니다.
- `docs/architecture/foundation/` 는 구조 목적과 owner 경계를 고정합니다.
- `docs/architecture/guild_hall/` 는 `guild_hall` cross-project 운영 owner 문서를 다룹니다.
- `docs/architecture/workspace/` 는 `_workspaces` 및 `_workmeta` 계약을 다룹니다.
- `docs/architecture/ui/` 는 root-owned UI 계약을 다룹니다.
- owner-local 설명과 owner boundary 설명은 각 루트 `README.md` 아래에 담습니다.

## README 동기화 규칙

- 폴더 책임이나 구조가 바뀔 때는 해당 `README.md` 를 같은 변경 안에서 갱신합니다.
- 구조 변경이 상위 owner 경계를 건드리면 루트 `README.md` 와 `docs/architecture/**` 문서도 함께 갱신합니다.
- `.registry/**`, `.unit/**/unit.yaml`, `.workflow/**`, `.party/**`, `docs/architecture/workspace/examples/**` 의 변경은 관련 계약 문서와 동시에 조율합니다.

## CHANGELOG 규칙

- public repo 에 구조/기능/설치 흐름/운영 규칙 변경이 있으면 루트 `CHANGELOG.md` 를 같은 변경 안에서 갱신합니다.
- private repo 에 continuity data plane 규칙이나 private 운영 흐름 변경이 있으면 `private-state/CHANGELOG.md` 를 같은 변경 안에서 갱신합니다.
- secret 값과 업무 원문은 changelog 에 적지 않습니다.

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

