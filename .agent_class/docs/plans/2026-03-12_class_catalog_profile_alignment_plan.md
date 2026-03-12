# 2026-03-12 class catalog profile alignment plan

## 목표

- `.agent` 와 `.agent_class` 를 active layer, catalog layer, canonical definition layer 3층 모델에 맞춰 정렬한다.
- hero 를 `.agent/identity` 의 optional overlay 로 유지하고, profile 을 class 의 default preference mode 로 재정의한다.
- `.agent/catalog/**` 를 UI selection layer 로 도입하되 `.agent_class/**` canonical asset 을 복제하지 않는다.

## 범위

- `.agent` body/identity/catalog/registry 문서와 메타 갱신
- `.agent/catalog/**` skeleton, README, YAML index 추가
- `.agent_class` canonical loadout 문서와 profiles/manifests 구조 추가
- 루트 구조 문서, owner 경계 문서, body report 갱신
- `sync-body-state --check` 가 새 body 메타 계약과 다시 일치하도록 최소 로컬 CLI 정합성 보정

## 변경 대상 파일

- `.agent/body.yaml`
- `.agent/body_state.yaml`
- `.agent/identity/**`
- `.agent/catalog/**`
- `.agent/registry/**`
- `.agent/docs/architecture/**`
- `.agent_class/class.yaml`
- `.agent_class/loadout.yaml`
- `.agent_class/docs/**`
- `.agent_class/profiles/**`
- `.agent_class/manifests/**`
- `docs/architecture/agent_body_finalization_report.md`
- `docs/architecture/TARGET_TREE.md`
- `docs/architecture/DOCUMENT_OWNERSHIP.md`
- `README.md`
- `AGENTS.md`

## done 기준

- hero overlay, profile preferred semantics, `.agent` catalog layer 가 문서와 메타에 모두 반영된다.
- `.agent/identity`, `.agent/catalog`, `.agent/registry`, `.agent_class/profiles`, `.agent_class/manifests` skeleton 이 생성된다.
- `.agent/catalog/class/**` catalog 파일이 `.agent_class/**` canonical source 를 `source_ref` 로 가리킨다.
- `.agent_class/default profile` 과 `.agent/registry/active_class_binding.yaml` 이 같은 active profile 기준을 사용한다.
- body report, target tree, document ownership, owner README 가 최신 구조를 설명한다.
- `python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check` 가 통과한다.

## 제외 범위

- deep research generator 구현
- UI renderer 구현/수정
- daemon/worker/runtime 확장
- 실존 인물 또는 특정 IP 캐릭터 기반 hero 데이터셋 구축
- `.agent_class/**` canonical asset 을 `.agent/catalog/class/**` 로 복제하는 작업

## 검증 계획

1. `python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state`
2. `python .agent_class/tools/local_cli/ui_sync/ui_sync.py sync-body-state --check`
3. YAML 파싱 검사
4. `docs/architecture/TARGET_TREE.md` 와 실제 구조 비교
5. catalog `source_ref` 존재 여부 검사
6. active species / hero / profile / class ref 정합성 검사
7. README 상대 링크 점검
8. 필수 문구 반영 여부 점검

## 리스크

- 기존 body report 와 body architecture 문서가 `species only`, `hero 비도입` 전제를 강하게 갖고 있어 충돌 면적이 크다.
- `sync-body-state` 는 현재 body_state 추가 필드를 재생성하지 않으므로, body 메타 확장 시 local CLI 수정이 필요하다.
- sample workspace contract 의 `default_loadout` 과 active profile id 가 어긋나면 추가 검증에서 잡힐 수 있다.

## TODO

- [x] `.agent` / `.agent_class` 충돌 문구 정리
- [x] body report 및 `.agent/docs/architecture/*` 갱신
- [x] `.agent/catalog/**` skeleton/README/YAML 생성
- [x] `.agent/identity/**` hero overlay 계약 정리
- [x] `.agent/registry/**` active class/profile/trait binding 정리
- [x] `.agent_class` profiles/manifests 구조 추가
- [x] `.agent_class` architecture 문서 갱신
- [x] 루트 문서 최소 수정
- [x] local CLI body_state 재생성 로직 정합성 보정
- [x] 검증 및 Git 정리
