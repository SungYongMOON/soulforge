# Task Note

## 목적

- `se_stage_artifact_gap_scan_v0`를 private run evidence에서 public-safe authoring draft package로 꺼내어, 다음 스레드나 다음 작업자가 stage gap scanning lane을 재발명하지 않고 이어갈 수 있게 한다.

## 입력

- source files:
  - `docs/architecture/foundation/VISION_AND_GOALS.md`
  - `docs/architecture/foundation/DEVELOPMENT_ROADMAP_V0.md`
  - `docs/architecture/workspace/SE_DUNGEON_STAGE_MODEL_V0.md`
  - `.workflow/project_readiness_digest_v0/**`
  - `.workflow/source_gap_followup_packet_v0/**`
  - `.workflow/source_packet_sufficiency_review_v0/**`
  - `.workflow/review_gate_evidence_pack_v0/**`
- reference notes:
  - current SE assistant direction note
  - current SE next-thread handoff note
  - current bounded private stage-gap-scan draft evidence
- external channels:
  - none

## 기대하는 출력

- final artifacts:
  - `workflow.yaml`
  - `step_graph.yaml`
  - `role_slots.yaml`
  - `handoff_rules.yaml`
  - `monster_rules.yaml`
  - `party_compatibility.yaml`
  - `profile_policy.yaml`
  - `README.md`
  - `templates/**`
- completion signal:
  - authoring draft package만 읽어도 scope, non-claims, outputs, next promotion gate를 이해할 수 있다.

## 실제 작업 순서 메모

1. stage gap scan을 non-authoring, non-approval lane으로 고정한다.
2. private draft의 step/role vocabulary를 public workflow package 형식으로 normalize한다.
3. synthetic example outputs를 generalized template shape로 추상화한다.
4. downstream route는 남기되, future candidate를 실행된 workflow처럼 쓰지 않는다.

## 사용하는 도구

- repo search
- read-only comparison
- workflow-generator verification gate 기준 검토

## 자주 막히는 지점

- gap scan lane에 문서 작성 책임을 섞는 것
- readiness summary를 approval처럼 쓰는 것
- owner question을 owner decision으로 오인하는 것
- source gap row를 source truth처럼 다루는 것

## 다음에 자동화하고 싶은 부분

- stage binding -> matrix row seed 생성
- synthetic fixture -> packet bundle smoke check
- route map wording consistency check
