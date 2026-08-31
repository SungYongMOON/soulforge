# Tool Workshop — capacity-one lease/fence/validator core (in-memory only)

Owner: `guild_hall/tool_workshop`. Status: `CURRENT = 순수 코어 + adversarial 테스트 + 합성 PPTX 파일 pilot fixture`; production Tool PC·상주 runner·Buzz identity binding과 HWPX/CAD 실행은 `TARGET`(별도 Owner gate).

Program plan 11의 첫 Workshop 수직이다. 첫 프로파일로는 plan 11 표의 첫 행인 **Document 공방**(`DOCUMENT_WORKSHOP_PROFILE`)을 선택했다 — 실제 도구는 밖에 있고, 이 코어는 자원 계약만 소유한다.

## 계약 요점

- **capacity=1 고정**: 자원당 활성 lease 하나. 바쁜 자원의 acquire는 `null`(대기)이며 **UI idle·죽은 runner는 release가 아니다** — 명시 release 또는 expiry takeover만 자원을 푼다.
- **fencing**: lease마다 단조 증가 token. expiry takeover가 token을 올리고, 옛 token의 늦은 completeRun은 `fence_stale`로 거부되어 아무것도 승격하지 못한다(고전적 zombie-writer 방어, 테스트 고정).
- queue는 priority(1~3)→제출 순서. 명시 release는 retry를 소모하지 않고 재대기; expiry takeover는 그 job을 `failed_terminal(lease_expired_takeover)`로 닫는다(bounded run 초과).
- validator `fail`은 retry 1회 소모 후 재대기, 소진 시 `failed_terminal` — 실패 run은 custody 0.
- 성공 run의 산출은 `done_candidate` + custody receipt(`claim: workshop_output_candidate_only`)까지다. **수락·승격·task 완료 표면이 존재하지 않는다**(팩토리에 해당 메서드 없음이 테스트로 고정). 후속 review/acceptance는 Vault revision 경로의 몫.
- capability gate: workshop이 선언한 exact tool version만 수주; 형식 위반은 큐 변형 전에 fail-closed.
- 결정론 append-only event log.

## 검증

```powershell
npm.cmd run validate:tool-workshop
```

이 validator는 기존 capacity/fence/candidate 계약과 같은-priority
multi-project FIFO(`A1 -> B1 -> A2 -> B2`)를 함께 검사한다. 별도
`fixtures/artifact_isolation_mcp.py`와 Python/ACP probe는 public-safe synthetic
Hermes profile Tool 분리 실험용이며 canonical validator가 실제 Hermes 설치나
provider를 요구하지 않도록 분리한다. 그 물리 실행 결과는 project-private review
packet이 소유하고, public module은 runtime/Buzz/NAS/PPTX effect를 주장하지 않는다.

`fixtures/ppt_workshop_pilot_mcp.py`는 다음 단계의 public-safe 합성 PPTX
파일 fixture다. caller가 승인한 두 root만 받고 `Cxxxx` create-only checkpoint,
`Rxxxx` candidate revision, hash/readback, Job/Work Product 이중 receipt를 만든다.
`tests/ppt_workshop_pilot_core_test.py`는 좋은 checkpoint에서 다시 branch하여
잘못된 후속 수정이 최종 revision에 섞이지 않는지, overwrite와 path escape가
fail-closed인지 검사한다. 편집과 finalization은 최초 `REQUEST/request.json`의
exact project/artifact/job binding이 없거나 다르면 새 Job을 만들지 않고 거부한다.
이 Python 시험은 `mcp`와 `python-pptx`가 설치된
격리 runtime에서 실행한다. 의존성을 repository의 canonical Node validator에
강제로 추가하지 않는다.

2026-08-31 private pilot에서는 실제 합성 PPTX bytes로 `C0000 -> C0001 ->
C0002(bad)`와 `C0001 -> C0003(corrected) -> R0001/V1.1`을 만들고 독립
verifier hash/readback 및 4-slide PNG render를 통과했다. 이는 특정 pilot
artifact의 `verified_completion_candidate` 근거일 뿐 Human Acceptance, backup
acceptance, production Buzz readiness 또는 일반 project payload 권한이 아니다.

## 관련 정본

- `docs/architecture/foundation/team_member_engineering_program/11_TOOL_WORKSHOPS_AND_JOB_SHOP.md`
- `guild_hall/agent_observation/resource_job_shop.mjs` (host/resource registry 계약 — 본 코어는 workshop-lease seam만 소유, 중복 구현 아님)
- `guild_hall/vault_revision/` (산출 후보의 후속 review/acceptance 경로)
