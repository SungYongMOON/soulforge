# .agent_class

## 현재 의미

- `.agent_class/` 는 `.registry/classes/` cutover 이전 자료를 붙들기 위한 transition bridge 다.
- active canonical class owner 는 이제 `.registry/classes/` 다.
- 새 canonical entry 나 새 owner 문서를 이 경로 아래에 추가하지 않는다.

## 무엇을 남길 수 있나

- migration note
- cleanup 전까지 필요한 legacy reference
- tooling relocation 전 임시 안내 문서

## 무엇을 두지 않는다

- 새 class canon
- 새 skill/tool/knowledge canon
- active subject state
- project-local truth

## 전환 메모

- 새 canonical entry 는 `classes/<class_id>/class.yaml` 이고 class-local `*_refs.yaml` 패턴은 유지된다.
- 기존 `.agent_class/**` 내용은 후속 cleanup 전까지 bridge/reference 로만 본다.
- 상세 owner 의미는 [`.registry/README.md`](../.registry/README.md) 와 foundation 문서를 따른다.

## 관련 경로

- [루트 README](../README.md)
- [`.registry/README.md`](../.registry/README.md)
- [`../docs/architecture/foundation/TARGET_TREE.md`](../docs/architecture/foundation/TARGET_TREE.md)
