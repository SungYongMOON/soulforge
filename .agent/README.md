# .agent

## 현재 의미

- `.agent/` 는 `.registry` cutover 이전 자료를 붙들기 위한 transition bridge 다.
- active canonical species/hero owner 는 이제 `.registry/species/` 다.
- 새 canonical entry 나 새 owner 문서를 이 경로 아래에 추가하지 않는다.

## 무엇을 남길 수 있나

- migration note
- cleanup 전까지 필요한 legacy reference
- archive 로 내리기 전 임시 설명 문서

## 무엇을 두지 않는다

- 새 species canon
- 새 hero canon
- active owner 정의
- project-local truth

## 전환 메모

- 새 canonical model 은 `species/<species_id>/species.yaml + heroes inline` 이다.
- 기존 `.agent/**` 내용은 후속 cleanup 전까지 bridge/reference 로만 본다.
- 상세 owner 의미는 [`.registry/README.md`](../.registry/README.md) 와 foundation 문서를 따른다.
