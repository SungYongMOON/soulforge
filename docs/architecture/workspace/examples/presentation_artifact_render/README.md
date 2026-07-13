# presentation_artifact_render public fixture

`presentation_packet.public.json`은 실제 고객·프로젝트 자료가 없는 합성 fixture다.
`presentation_artifact_render_v0`과 얇은 Codex launcher의 cold replay에 사용한다.

검증 시 다음 literal이 최종 PPTX에서 그대로 보존되어야 한다.

- `82%`, `24 / 24`, `2건`, `2026-07-18`
- `RQ-017`, `TC-204`, `-3.2 dB`, `10 ms 이하`
- `PASS`, `REVIEW`, `불합격이 아니다`
- `증가했지만 승인 전에는 종결하지 않는다`

fixture는 실제 template 파일을 public Git에 넣지 않는다. 실행 시
`_workspaces/SE_TEMPLATE_LIBRARY/team_default_v0/`의 owner-controlled snapshot과
패킷의 revision/hash가 일치해야 한다.
