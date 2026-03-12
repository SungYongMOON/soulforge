# .agent/policy

## 목적

- `policy/` 는 species-free floor 를 둔다.
- identity 나 loadout 과 무관하게 항상 적용되는 본체 기본 제약, 승인 규칙, scope floor 를 관리한다.

## 포함 대상

- `precedence.yaml`, `approval_matrix.yaml`, `scope_rules.yaml`
- 안전 규칙, 허용 범위, 금지선 메타
- 모든 상황에 공통으로 적용되는 floor 제약

## 제외 대상

- species 기본값과 identity default
- 채널별 표현 규범과 응답 형식
- class 운영 절차와 loadout 특화 규칙
- runtime 부트스트랩, 실행 루프 기본값, 실제 sandbox 상태
- 프로젝트 계약과 프로젝트별 예외 규칙

## 대표 파일

- [`precedence.yaml`](precedence.yaml): policy floor 가 species/class/workspace overlay 보다 앞선다는 순서를 고정하는 파일
- [`approval_matrix.yaml`](approval_matrix.yaml): binding 변경과 metadata 쓰기에 필요한 승인 기준을 정의하는 파일
- [`scope_rules.yaml`](scope_rules.yaml): continuity only, private-first memory, no shared memory inside body 같은 floor rule 을 담는 파일

## 참조 관계

- `policy/` vs `communication/`: `policy/` 는 무엇이 허용되고 금지되는지의 floor 를 두며, `communication/` 은 그 floor 안에서 어떤 tone 과 reply shape 를 쓸지 정의한다.
- `runtime/` vs `policy/`: 현재 `engine/` 이 runtime layer 를 소유하고, `policy/` 는 runtime 이 따라야 하는 permission floor 와 safety boundary 를 소유한다.
- `protocols/` 는 `policy/` 의 floor 를 실행 절차에 연결할 수 있지만, floor 자체를 재정의하지 않는다.
- [`../README.md`](../README.md)
- [`../communication/README.md`](../communication/README.md)
- [`../engine/README.md`](../engine/README.md)
- [`../protocols/README.md`](../protocols/README.md)

## 변경 원칙

- 상위 floor 위에 loadout 나 mission override 계층이 생겨도 floor 자체는 여기서 유지한다.
- `approval_matrix.yaml` 과 `scope_rules.yaml` 에는 runtime 관측 결과를 적지 않고, floor 와 승인 규칙만 선언한다.
- 정책 참조 구조가 늘어나면 `communication/`, `engine/`, `protocols/` 와의 연결 규칙을 같은 변경 안에서 갱신한다.
