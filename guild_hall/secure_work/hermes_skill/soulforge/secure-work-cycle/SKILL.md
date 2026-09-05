---
name: soulforge-secure-work-cycle
description: Run a Soulforge secure-work cycle test and report job status.
version: 1.0.0
author: Soulforge 창구 lane B (Claude Sonnet 5), 2026-09-06 KST
license: Soulforge internal
platforms: [windows]
metadata:
  hermes:
    tags: [soulforge, secure-work, cli, buzz, pilot]
    category: soulforge
    requires_toolsets: []
prerequisites:
  commands: [node]
---

# Soulforge Secure-Work Cycle

`sfx`(`guild_hall/secure_work/sfx.mjs`)는 업무 원문을 로컬에 둔 채 보호 가공하는 사이클
1호 lane의 명령줄이다. 이 스킬은 그 명령을 대신 실행하고 결과를 Buzz DM 문장으로 옮기는
것만 한다 — 이 스킬 자체는 판단하지 않는다. lane·문서 정본은 저장소의
`docs/architecture/guild_hall/SECURE_WORK_CYCLE_V0.md`와 `guild_hall/secure_work/README.md`이고,
여기서는 그 명령 표면을 그대로 옮긴다.

## When to Use

Buzz DM에서 다음과 같은 문구를 받았을 때 쓴다.

- "사이클 시험" / "secure-work 사이클 시험 한 번 돌려줘"
- "업무 요청 R1-07 <산출물명> 부탁해" 처럼 레시피 ID를 명시한 요청
- 이미 만든 job의 진행 상황("그 job 어떻게 됐어?", "승인 대기중이야?")을 물을 때

쓰지 않는 경우: 실제 회사 문서·계약·도면을 그대로 요약하거나 옮겨 달라는 요청(이 스킬의
소관이 아니다), lane 자체의 코드를 고치거나 재시작해 달라는 요청(Owner 손, 아래 참고).

## Prerequisites

- `node`(CLI 진입점 실행)와, 실행 시점에 lane 설정 JSON 경로 — 환경변수
  `SOULFORGE_SECURE_WORK_CONFIG` 또는 `--config <path>`로 넘긴다. 이 스킬은 그 경로의
  실제 값을 대화나 로그에 적지 않는다(host 절대경로이기 때문).
- lane 위치는 `<SECURE_WORK_LANE>`로 아래에 적는다. 저장소 정본 사본(이 파일이 커밋되는
  경로)에서는 실제 값을 몰라야 하므로 자리표시자로 남긴다 — 설치된 사본
  (`<home>/skills/soulforge/secure-work-cycle/SKILL.md`)에는 lane 빌드 시점의 실제
  절대경로가 채워져 있다.
- `sfx keys`, kit·venv·pilot root 바인딩은 전부 Owner가 미리 배치한 설정 파일 소관이다.
  이 스킬은 그 파일을 새로 만들거나 값을 바꾸지 않는다.

## 하지 말 것

- **원본을 대화에 붙이지 않는다.** `sfx` 출력에 원문 문장, 파일 내용, host 절대경로가
  보이면 그대로 옮기지 않는다 — job id·상태 코드·건수·파일명만 옮긴다.
- **승인은 사람이 "승인"이라고 쓸 때만.** `sfx permit approve`는 이 대화에서 사람이
  정확히 "승인"(또는 명백한 동의어를 사람이 직접 씀)이라고 답한 뒤에만 실행한다. 요청
  문구 자체("사이클 시험 돌려줘")를 승인으로 해석하지 않는다. 거부 의사가 보이면
  `sfx permit deny`를 실행하고 이유를 그대로 회신에 옮긴다.
- **자기 승인 금지.** 이 스킬을 실행하는 봇 자신을 `--actor`로 쓰지 않는다. 사람이 승인
  문구를 쓴 그 사람 참조를 `--actor`에 남긴다.
- **외부 전송은 기대하지 않는다.** custody·외부 provider adapter는 Owner가 키 파일을
  배치하고 `live_enabled`를 켜기 전까지 항상 꺼져 있다. `ADAPTER_UNAVAILABLE`류 코드가
  나오면 고장이 아니라 설계대로 멈춘 것이라고 회신한다. 이 스킬은 그 스위치를 켜려
  시도하지 않는다.
- **lane을 고치거나 재시작하지 않는다.** 코드 수정, 설정 파일 생성/수정, 서버·게이트웨이
  재시작은 이 스킬의 범위 밖이다.

## How to Run

`terminal` 도구로 아래 명령을 그대로 실행한다. `<SECURE_WORK_LANE>`·`<SECURE_WORK_CONFIG>`는
설치된 사본에서 실제 경로로 치환되어 있다.

```
node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> doctor
node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> request --recipe R1-07 --source <SECURE_WORK_PILOT_SOURCE> --requester "<요청자 ref>" --mission "<합성 미션명>"
node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> advance --job <job_id> --max-steps 10
node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> status --job <job_id>
node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> events --job <job_id>
node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> permit approve --job <job_id> --actor "<승인한 사람 ref>"
node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> permit deny --job <job_id> --actor "<거부한 사람 ref>"
```

`--source`는 반드시 설정에 고정된 pilot source 디렉터리(`<SECURE_WORK_PILOT_SOURCE>`)와
정확히 같아야 한다 — 그 외 경로는 CLI가 `SOURCE_DIR_NOT_BOUND`로 그 자리에서 거부한다.
요청자가 다른 문서를 가리키면 실제로 읽을 수 있는 자료가 아니라고 답하고, 그 자료를 pilot
source에 올리는 것은 Owner 결정이라고 안내한다.

## 절차

1. `doctor` 실행 → 표를 보고 `g2`(로컬 관리자)·`transport`·`custody`·permit 신뢰 키 상태를
   확인한다. 신뢰 키가 `PERMIT_TRUST_UNBOUND`/`PERMIT_SIGNER_UNBOUND`면 그 사실을 그대로
   회신하고 계속 진행은 하되(request/advance는 신뢰 키가 없어도 RELEASE_REVIEW까지는
   갈 수 있다) permit 단계에서 막힐 것이라고 미리 알린다.
2. 레시피 ID(기본 `R1-07`)와 미션명을 요청 문구에서 뽑아 `request`를 실행한다. 미션명이
   없으면 짧게 되묻는다. 응답의 `job_id`를 이후 모든 명령에 그대로 재사용한다(추정하지
   않는다 — 실제 자기 응답에서만 가져온다).
3. `advance --max-steps 10` 실행. `ok`가 거짓이거나 `phase`가 멈춰 있으면 그 자리가 이번
   실행의 도착점이다 — 더 큰 `--max-steps`로 억지로 밀지 않는다.
4. `status --job <job_id>`로 현재 phase와 (있으면) `status_projection`을 확인한다.
5. `events --job <job_id>`로 건수(`count`)를 확인해 "영수증/이벤트 건수"로 보고한다(이
   CLI 표면에는 별도 receipts-count 명령이 없다 — 이벤트 원장 건수를 그 자리에서
   보고한다고 회신 문구에 명시한다).
6. phase가 `RELEASE_REVIEW`이고 사람이 이미 "승인"이라고 답했으면 `permit approve`를
   실행하고 다시 `advance`를 한 번 더 돌린다. 그렇지 않으면 승인 대기 상태 그대로 회신한다.
7. 5필드 요약이나 Linear 상태 변경은 이 스킬의 소관이 아니다 — 결과 등록·수락은 다른
   절차(재기준 plan 18 §8)를 따른다. 이 스킬은 사이클 시험 결과만 회신한다.

## 회신 형식

Buzz DM 회신은 다음 항목을 이 순서로 담는다. 문장은 자유롭게 쓰되 필드는 빠뜨리지 않는다.

- **job id**: `request` 응답의 `job_id` 그대로.
- **현재 상태**: 원문 phase 코드(예: `RELEASE_REVIEW`) + 한 줄 쉬운 뜻(예: "전송 허가
  대기 중").
- **이벤트/영수증 건수**: `events`의 `count` 값.
- **산출 경로**: 있다면 파일명만(예: `packet_9f21.json`) — 절대경로·host 경로는 절대
  옮기지 않는다.
- **다음에 필요한 것**: 사람이 할 일 한 줄(예: "'승인'이라고 답해 주시면 permit을
  실행합니다", "Owner가 키를 배치해야 다음 단계로 갑니다").

## 오류 시 회신

명령이 0이 아닌 종료 코드나 `ok: false`를 반환하면 스택트레이스나 원문 예외를 옮기지
않는다. 대신:

1. `doctor`를 (다시) 실행해 어댑터 가용성 표를 얻는다.
2. 응답의 `code`(예: `CONFIG_NOT_BOUND`, `KIT_ROOT_NOT_FOUND`, `PERMIT_TRUST_UNBOUND`,
   `FIELD_REVIEW_REQUIRED`, `PERMIT_REQUIRED`)를 `doctor` 표의 어느 행과 관련 있는지와
   함께 한 문단으로 요약해 회신한다.
3. 코드가 이 목록에 없거나 원인이 불명확하면 "이 스킬로는 원인을 못 좁혔습니다, Owner
   확인이 필요합니다"라고 답하고 멈춘다 — 재시도를 반복하지 않는다.

## 예시 (2026-09-06 lane-B 시험, 합성 자료만 — 아래는 실제 실행 출력)

```
$ node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> doctor
{
  "ok": true, "command": "doctor",
  "adapters": [
    { "module": "M01", "adapter": "filesystem.exact_revision", "state": "AVAILABLE", "detail": "6 synthetic documents" },
    { "module": "M02", "adapter": "openai_compatible.local", "state": "AVAILABLE", "detail": "1 local model(s)" },
    { "module": "M06", "adapter": "openrouter.https", "state": "UNAVAILABLE", "detail": "key file missing" },
    { "module": "M10", "adapter": "tongs.ingress_client", "state": "UNAVAILABLE", "detail": "bearer file missing" },
    { "module": "M05", "adapter": "permit_trust_key", "state": "AVAILABLE", "detail": "trusted verification key bound" }
  ]
}
```

```
$ node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> request \
    --recipe R1-07 --source <SECURE_WORK_PILOT_SOURCE> --requester test.requester.laneB --mission "합성 lane-B 사이클 시험 2026-09-06"
{ "ok": true, "command": "request", "job_id": "o_452459b07c050058ef7ea375c584d7b2",
  "mission_id": "o_28b41ef771e8d85cd883ec20acd447df", "phase": "RECEIVED" }
```

```
$ node <SECURE_WORK_LANE>/guild_hall/secure_work/sfx.mjs --config <SECURE_WORK_CONFIG> advance \
    --job o_452459b07c050058ef7ea375c584d7b2 --max-steps 10
{
  "ok": false, "command": "advance", "job_id": "o_452459b07c050058ef7ea375c584d7b2",
  "phase": "RELEASE_REVIEW",
  "steps": [
    { "phase": "RECEIVED", "action": "step_pin_source", "state": "ADVANCED", "after_phase": "SOURCE_PINNED",
      "receipt": "o_452459b07c050058ef7ea375c584d7b2/002_source.read_exact.json" },
    { "phase": "SOURCE_PINNED", "action": "step_g2_propose", "state": "ADVANCED", "after_phase": "G2_PREPARED",
      "receipt": "o_452459b07c050058ef7ea375c584d7b2/003_g2.propose.json" },
    { "phase": "G2_PREPARED", "action": "step_project", "state": "ADVANCED", "after_phase": "RELEASE_REVIEW",
      "receipt": "o_452459b07c050058ef7ea375c584d7b2/004_projection.project.json" },
    { "phase": "RELEASE_REVIEW", "action": "step_ready", "state": "STOPPED",
      "code": "PERMIT_REQUIRED", "detail": "sfx permit approve <job>" }
  ]
}
```

`events --job o_452459b07c050058ef7ea375c584d7b2`는 `"count": 4`를 반환했다(제출 1건 +
전이 3건). `ok`가 거짓인 것은 오류가 아니다 — `advance`는 더 진행할 동작이 없을 때 그
자리에서 정직하게 멈췄다는 뜻으로 `false`를 쓴다(엔진이 성공을 지어내지 않는다).

회신 예시(이 실행 그대로): "job `o_452459b07c050058ef7ea375c584d7b2` 접수해서 돌렸습니다.
지금 상태는 RELEASE_REVIEW(전송 허가 대기 중)입니다. 이벤트/영수증 4건 기록됐고 마지막
산출은 `004_projection.project.json`입니다. '승인'이라고 답해 주시면 permit approve를
실행하겠습니다."

이 예시의 job id·phase·건수는 이 실행 고유의 값이다 — 실제 응답에서는 항상 그 실행
자신의 값으로 다시 채운다. 이 예시를 그대로 베끼지 않는다.

## Uninstall

스킬 디렉터리 `<home>/skills/soulforge/secure-work-cycle/`를 삭제하면 완전히 제거된다.
lane 자체(`<SECURE_WORK_LANE>`)나 pilot root, kit, venv, permit 신뢰 키에는 영향이 없다.

## Status

`draft` — 구조 확인과 셸 단독 시험(봇 없이 명령을 직접 실행)까지 완료. 강도담 게이트웨이가
이 스킬 파일을 실제로 읽어 Buzz DM에서 트리거되는지는 별도 확인이 필요하다(재시작 없이는
확인 불가 — Owner 아침 확인 항목). 그 확인 전까지 `production-ready`로 보지 않는다.
