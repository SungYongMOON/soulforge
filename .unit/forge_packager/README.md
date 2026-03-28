# .unit/forge_packager

- `forge_packager/` 는 회의 packet 과 배포본 마감 품질을 맡는 드워프 `기록관` trial unit 을 둔다.
- 이 unit 은 package shaping, artifact completeness, release-bundle finish check 성향의 owner lens 를 가진다.
- `unit.yaml` 은 current trial shape 를 `summary`, `identity`, `class_ids` 중심으로 고정한다.
- 이 경로의 tracked sample 은 owner surface 만 설명하고 runtime truth 는 담지 않는다.
