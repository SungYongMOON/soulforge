# .agent/policy

## 목적

- `policy/` 는 이 agent 가 넘으면 안 되는 species-free floor 를 둔다.
- identity 나 loadout 과 무관하게 항상 적용되는 본체 기본 제약, 승인 규칙, scope floor 를 관리한다.

## 포함 대상

- `precedence.yaml`, `approval_matrix.yaml`, `scope_rules.yaml`, `safety_rules.md`
- 안전 규칙, 허용 범위, 금지선 메타
- 모든 상황에 공통으로 적용되는 floor 제약

## 제외 대상

- species 기본값과 identity default
- 채널별 표현 규범과 응답 형식
- class 운영 절차와 loadout 특화 규칙
- runtime 부트스트랩과 실제 sandbox 상태

## 대표 파일

- [`precedence.yaml`](precedence.yaml): policy floor 의 우선순위 계층
- [`approval_matrix.yaml`](approval_matrix.yaml): 승인 요구 행렬
- [`scope_rules.yaml`](scope_rules.yaml): body 범위 제약
- [`safety_rules.md`](safety_rules.md): hard boundary 와 금지 규칙 요약

## 우선순위 해석

1. 저장소 규칙과 policy floor
2. 현재 작업의 명시 지시
3. 선택된 workflow 의 `required`
4. active profile 의 `preferred`
5. active hero overlay 의 bias
6. species default

- policy floor 는 species, hero, profile 보다 앞선다.
- workflow 는 required 조합식을 강제한다.
- profile 은 default preference mode 이며 restrictive allowlist 가 아니다.
- hero overlay 는 결을 바꾸지만 사실 판정과 안전선을 바꾸지 않는다.

## 참조 관계

- `policy/` vs `communication/`: `policy/` 는 허용/금지 floor 를 두고, `communication/` 은 그 안에서 tone 과 reply shape 를 정한다.
- `runtime/` vs `policy/`: `runtime/` 은 실행 기반을 소유하고, `policy/` 는 runtime 이 따라야 하는 permission floor 와 safety boundary 를 소유한다.
- [`../communication/README.md`](../communication/README.md)
- [`../runtime/README.md`](../runtime/README.md)

## 변경 원칙

- policy floor 는 species 나 class overlay 에 따라 낮아지지 않는다.
- policy floor 는 active profile, hero overlay, species default 보다 우선한다.
- runtime 관측 결과를 `precedence.yaml`, `approval_matrix.yaml`, `scope_rules.yaml` 에 적지 않는다.
- 제약이 늘어나면 `communication/`, `protocols/`, `runtime/` 과의 연결 규칙을 같은 변경 안에서 갱신한다.
