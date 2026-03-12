# class validation rules

## 목적

- class canonical asset 과 loadout 참조가 어떤 규칙으로 검증되는지 요약한다.

## 규칙

- installed module 은 `module.yaml` manifest 가 있어야 한다.
- `equipped.*` 는 module id 기반이어야 한다.
- duplicate id, kind mismatch, family mismatch, unknown id 는 FAIL 이다.
- equipped workflow dependency 가 installed catalog 에 없으면 FAIL 이다.
- profile 은 preferred mode 이므로 installed asset 비활성화를 검증 규칙으로 요구하지 않는다.
- `.agent/catalog/class/**` 는 canonical source 복제본이 아니어야 한다.
