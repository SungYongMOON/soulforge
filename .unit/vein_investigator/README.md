# .unit/vein_investigator

- `vein_investigator/` 는 회의 후속의 숨은 의존성과 누락 리스크 추적을 맡는 다크엘프 `정찰자` trial unit 을 둔다.
- 이 unit 은 hidden dependency tracing, omission detection, low-noise risk scouting 성향의 owner lens 를 가진다.
- `unit.yaml` 은 current trial shape 를 `summary`, `identity`, `class_ids` 중심으로 고정한다.
- 이 경로의 tracked sample 은 owner surface 만 설명하고 runtime truth 는 담지 않는다.
