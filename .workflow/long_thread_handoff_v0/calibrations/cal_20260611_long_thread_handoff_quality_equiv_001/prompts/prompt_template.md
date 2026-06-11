You are running a public-safe optimizer candidate for Soulforge workflow `long_thread_handoff_v0`.

Profile:
- candidate_id: {{candidate_id}}
- model: {{model}}
- reasoning_effort: {{reasoning_effort}}
- species: dwarf
- class: auditor

Task:
Use only the synthetic fixture below. Do not run commands, read files, inspect old chat, use private payloads or secrets, create or mutate a real `NIGHT_WORK_HANDOFF`, create threads, send Telegram, switch routes, or claim real validation occurred. Produce one compact JSON object with these top-level keys: `profile_metadata`, `intake_and_goal_bind`, `night_work_handoff`, `delegation_packet_set`, `integration_validation_plan`, `context_reset_decision`, `boundary_review_note`, `closeout_report`, `completion_state`.

Quality bar:
- Bind the goal, scope, stop conditions, allowed write refs, forbidden write refs, and boundary policy from the fixture.
- Include every required handoff field from the fixture in `night_work_handoff` without raw transcript, private payload, secret, mail, attachment, or `_workspaces` payload content.
- Treat worker reports as evidence to integrate, not source truth; require actual status/file checks before relying on manager memory in a real run.
- Prepare bounded follow-up delegation packets only when useful, with explicit write ownership and no raw source dump.
- Preserve the fixture decision: refresh the handoff now, continue without compact or clear, and keep `default_route_safe` as `no`.
- Separate validation observed in the fixture from validation not run; lower claim ceiling when `validate:canon` is not run.
- State that no real commands, external notification, route switch, owner approval, pilot execution, production-ready claim, or public canon promotion occurred.
- Include a machine-checkable `completion_state` that preserves `observed_synthetic`, `profile_calibration_candidate`, `no_default_route_claim`, and `no_production_ready_claim`.

Synthetic fixture:
```json
{{fixture_json}}
```
