# 시설관리 봇 — 있는 것과 없는 것 (2026-09-04)

| 항목 | 값 |
| --- | --- |
| 상태 | `OWNER_REVIEW_DRAFT` / `canon_candidate` |
| 주장 한계 | `관찰됨` — 소스와 spec 을 읽은 결과이며 실행 관찰은 없음 |
| 목적 | Owner 가 그린 "시설관리 봇"과 현재 `dev_worker` 의 차이만 확정한다 |
| 비권한 | 이 문서만으로 automation 을 켜거나 권한을 넓히지 않는다 |

## Owner 가 정한 봇의 성격 (2026-09-04)

> 시설관리자다. 건물은 알아서 고친다. 입주자 물건은 안 건드린다.
> 열쇠는 안 만든다. 일지는 남긴다.

건물 = 시스템 자신(코드·설정·예약작업·수집기). 입주자 물건 = 업무 데이터
(`_workspaces`, custody, 프로젝트 자료). 이 경계가 자율성을 안전하게 만드는 이유이며,
"우리 프로그램을 고치는 것은 보안 위배가 아니다" 라는 Owner 판단의 근거이기도 하다.

## 이미 있는 것 — `dev_worker`

`automations/soulforge-dev-worker.spec.json` 과 그 prompt 가 이미 다음을 고정한다.

| | 현재 |
| --- | --- |
| 실행자 | `gpt-5.3-codex`, reasoning `medium`, 4시간 주기, 기본 `PAUSED` |
| 절차 | preflight → 후보 승격 → task claim → 브랜치 → 구현 → acceptance_checks → commit·push → activity 이벤트 → 요약 |
| 경계 | `main` 직접 수정 금지, **merge 금지**, secret·원문 열람 금지, packet 의 `allowed_write_paths` 준수 |
| 자동승인 | `risk_level` 이 `low`/`routine` 이고, 쓰기 경로가 `docs/architecture/guild_hall/`·`guild_hall/dev_worker/`·`guild_hall/night_watch/`·`CHANGELOG.md` 안이고, acceptance check 가 `npm run validate`·`done:check`·해당 모듈 테스트 계열일 때만 |
| 일지 | activity 이벤트를 append |

**Owner 가 그린 것의 대부분이 이미 여기 있다.** 새로 만들 것은 아래 다섯뿐이다.

## 없는 것 — 다섯

### 1. 자기 발견 (가장 큰 차이)

현재 봇은 **작업지시서를 기다린다.** 일감 출처가 세 큐뿐이다.

```
.mission/<mission_id>/dev_worker_request.yaml
_workmeta/<project_code>/dev_worker_queue/*.yaml
_workmeta/<project_code>/dev_worker_candidate_queue/*.yaml
```

시설관리자는 형광등이 나간 것을 스스로 본다. 봇은 지금 못 본다.

**필요한 것**: 복구 이력·activity 장부를 읽어 `dev_worker_candidate_queue` 에 packet 을
자동으로 넣는 다리. 2026-09-04 의 `task_action_path_drift` 200건이 그 첫 입력이며,
그것이 만들 packet 은 "이 진단코드를 결정론 규칙으로 만들라" 다.

**봇의 성적표는 "몇 건 고쳤나" 가 아니라 "사람 부를 일을 몇 종류 없앴나" 다.** 같은
진단코드가 반복된다는 사실 자체가 규칙 후보이고, 그 반복을 세는 것이 이 다리의 일이다.

### 2. 전역 금지 목록 — 열쇠

`allowed_write_paths` 는 **packet 마다** 정해진다. 즉 packet 이 그렇게 적기만 하면
봇 자신의 울타리를 쓰기 대상으로 지정할 수 있다.

```
guild_hall/watchtower/health_recovery_coordinator.mjs   자기 복구 허용 행동 목록
guild_hall/path_registry/**                             어디에 쓸 수 있는지
guild_hall/dev_worker/candidate_queue.mjs               자동승인 정책 자신
각 lane runner 의 forbidden_roots / writer 권한
```

나쁜 의도는 필요 없다. **"검사가 자꾸 막히는데"** 가 울타리를 넓히는 가장 흔한 경로다.

**필요한 것**: packet 이 무엇을 적든 거부되는 전역 deny 목록. 그리고 그 목록은
봇의 쓰기 대상 밖에 둔다. 자동승인 safe-path 는 이미 좁은 allow-list 이므로 그 정신을
`allowed_write_paths` 전체로 넓히는 형태가 된다.

### 3. 즉시 수리와 항구 수리의 연결

둘은 다른 일이고 지금 둘 다 있지만 서로 모른다.

| | 담당 | 시간 |
| --- | --- | --- |
| 즉시 살리기 | `health_recovery_coordinator` (결정론, LLM 없음) | 몇 분 |
| 원인 고치기 | `dev_worker` (브랜치·테스트) | 몇 시간~며칠 |

코디네이터가 `owner_action_required` 로 닫은 건이 dev_worker 큐로 가지 않는다.
2026-09-04 에 그것이 200번 일어났고 아무 packet 도 만들어지지 않았다.

**필요한 것**: 1번의 다리가 이 연결이다. 별개 항목이 아니라 같은 것의 다른 면이다.

### 4. 배포

현재 봇은 **브랜치 push 에서 멈춘다.** 그것은 옳은 기본값이다 — 이 저장소에서
커밋은 운영을 바꾸지 않고, 버전이 박힌 lane 사본 재등록이 바꾼다. 예약작업을
재등록할 수 있는 주체는 수집을 멈출 수 있고, 2026-09-01 Slack rc=1 사고가 그 모양이었다.

**필요한 것**: 배포를 둘로 나눈다.

```
봇      →  배포 꾸러미 (dry-run digest 포함)
등록기  →  digest 대조 후 적용, 실패 시 이전 XML 복원
```

`register-*-task.ps1` 이 이미 `-ExpectedDryRunDigest`·`-ExpectedExistingTaskSha256`·
실패 롤백을 갖고 있다. 봇이 digest 를 만들고 등록기가 대조하면 봇은 임의 배포를 할 수
없다. 이 항목은 `main` 병합 승인과 함께 사람이 남는 자리다.

### 5. 감시견 — 시설관리자가 아프면

봇이 장부의 유일한 독자가 되면, 봇이 멈출 때 아무도 장부를 읽지 않는다.
그것은 2026-09-04 의 이틀 침묵이 한 층 위에서 그대로 재현되는 것이다.

**필요한 것**: 봇의 마지막 보고가 N시간을 넘으면 알리는 장치. 똑똑할 필요가 없고
**똑똑하면 안 된다** — 봇과 같은 이유로 함께 죽으면 감시견이 아니다. 봇과 다른
실행면에 두고, 판단은 시각 비교 하나로 끝낸다.

## 문을 두드리는 다섯 가지 (Owner 확정)

시설관리자가 주인을 부르는 경우. 나머지는 스스로 한다.

| | 예 |
| --- | --- |
| 돈 드는 일 | 외부 전송, 새 계정, 새 자격증명 |
| 구조 변경 | 스키마, 정본, 새 최상위 폴더, 권한 변경 |
| 처음 보는 고장 | 진단 목록 17종에 없는 증상 |
| 고쳐봤는데 안 됨 | 수리 후 검증 미통과 |
| 입주자 공간 | `_workspaces`·custody 를 건드려야 하는 일 |

## 순서

1번(자기 발견)과 2번(금지 목록)은 서로를 필요로 한다. 스스로 일감을 찾는 봇에게
전역 울타리가 없으면 안 되고, 울타리만 있고 일감이 없으면 봇은 계속 기다린다.
**둘을 한 묶음으로 본다.**

3번은 1번에 포함된다. 5번은 봇을 켜기 전에 있어야 한다 — 감시 없는 자율은 오늘
고친 그 실패 모양이다. 4번은 마지막이며 별도 Owner 게이트다.

## 확인하지 않은 것

- `dev_worker` automation 의 현재 ACTIVE/PAUSED 실제 상태
- packet 스키마의 `allowed_write_paths` 강제 지점이 코드 어디인지
- 자동승인 정책의 테스트 커버리지
