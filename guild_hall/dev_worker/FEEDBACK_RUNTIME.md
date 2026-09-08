# Feedback 실행 조립

기존 여섯 feedback 모듈을 파일·DB·프로세스 포트에 연결하는 G1 실행면이다.
새 공식 업무·Linear writer·정본·운영 scheduler·권한을 만들지 않는다.
G2는 원문을 준비하고, G1은 승인된 공개 안전 요구 투영과 고정된 코드만 소비한다.

## 실행 경로

```text
committed Linear metadata index → 현재 standing scope grant/workforce 검증
→ G2의 source-revision-bound public-code projection → 영속 issued request
→ 기존 SQLite cycle → G1 ACP proposer/별도 stateless patch reviewer
→ sparse Git/고정 validator/full output capture → 별도 final reviewer
→ local result readbox → 다음 polling 회차와 독립 watchdog
```

배포 설정에 issue UUID 목록을 넣지 않는다. metadata index를 bounded 열거하고
각 항목을 기존 `createLinearReadEvidenceReader.resolve()`로 검증한다.
새 UUID도 같은 위임 아래 처리한다. 제목·본문·label·creator는 실행 권한이 아니다.
G2 투영이 없으면 `PREPARATION_PENDING`으로 보이며 G1이 원문을 대신 읽지 않는다.

## 모듈

| 파일 | 역할 |
|---|---|
| `feedback_runtime_source.mjs` | metadata 열거, 현재 권한, G2 투영, issued request |
| `feedback_runtime.mjs` / `feedback_runtime_cli.mjs` | 실제 worker/watchdog/inspect/recover/retry 조립 |
| `feedback_runtime_acp.mjs` | 기존 승인된 `loadBinding`/`createClaudeAcp`를 쓰는 G1 경로 |
| `feedback_runtime_model.mjs` | 역할별 입력/응답/evidence 결속과 직렬화; Ollama는 합성 harness 전용 |
| `feedback_runtime_validator.mjs` | 고정 검사 자식, 원출력과 종료 증거 |
| `feedback_runtime_stage.mjs` | 실제 코드 closure/YAML 의존성의 stage/verify |
| `feedback_runtime_io.mjs` | file pin, 일반 경로 검사, create-only 증거 |

기존 six-module core와 common authority/usage/schema는 수정하지 않는다.
control DB의 runtime binding/issued-request 표는 이 실행면의 비정본 구현 기록이다.
레거시 `_workmeta`나 canonical workspace를 실행 큐로 가져오지 않는다.

## 설치와 실행

source checkout과 분리된 빈 일반 디렉터리를 먼저 승인·준비한다.

```text
node guild_hall/dev_worker/feedback_runtime_stage.mjs stage --source-root <source-root> --target-root <empty-install-root> --dependency-root <existing-node_modules>
node <install-root>/guild_hall/dev_worker/feedback_runtime_stage.mjs verify --target-root <install-root>
```

stage는 runtime/ACP import closure와 YAML bytes를 기록하고 명시된 의존성만 junction으로
재사용한다. checksum receipt는 관측이며 신뢰·권한·Pack 수락이 아니다. populated/alias target,
source drift, 중간 실패 target을 자동 덮어쓰지 않는다. worker를 자동 시작하지 않는다.

worker와 watchdog는 **별도 host process**로 실행한다. checkout에서 운영하지 않는다.

```text
node <install-root>/guild_hall/dev_worker/feedback_runtime_cli.mjs worker --deployment <approved-deployment.json> --sha256 <exact-bytes-sha256>
node <install-root>/guild_hall/dev_worker/feedback_runtime_cli.mjs watchdog --deployment <approved-deployment.json> --sha256 <exact-bytes-sha256>
node <install-root>/guild_hall/dev_worker/feedback_runtime_cli.mjs inspect --deployment <approved-deployment.json> --sha256 <exact-bytes-sha256>
```

`--once`와 `--cycles N`은 bounded 실행용이다. worker가 control DB를 초기화한 후
watchdog를 시작한다. watcher는 worker DB를 read-only로 열고 lease/last_tick을 갱신하지 않는다.
host scheduler 등록·supervisor 활성화·Pack 통합은 해당 sole writer의 범위다.

## 설치자가 결속할 입력

정확 배포 구조는 `loadFeedbackDeployment`, grant 구조는 `GRANT_KEYS`가 소유하는
local consumer 입력이다. 새 common schema나 authority canon이 아니다.

- 겹치지 않는 control/evidence/G2 projection/source repo/candidate roots와 기존 Linear reader의 전체 expectedBinding/freshness.
- 별도 issuer의 현재 standing scope grant와 정확 hash. source scope, kind/state, 허용 path/check, action, issuer, 유효기간을 명시한다.
- 기존 workforce claim/pin의 정확 hash. actor binding 검증은 별도 grant를 대신하지 않는다.
- current authority는 고정 `{path,sha256}` 또는 신뢰된 current-state writer의 `{path,mode:"current_state"}`다.
  후자는 관측/철회 epoch만 갱신한다. grant/claim/pin을 바꾸지 않으며 stale/revoked 상태는 거부한다.
  model/G2 projection writer가 이 경로에 쓸 수 있어서는 안 된다.
- G2 `current.json`의 producer/scope/유효기간/generation과 각 issue projection의 파일명·SHA.
  projection은 exact issue hash/scope, 공개 안전 summary/kind, grant보다 좁은 path/check를 갖는다.
- 기존 runner의 base commit, Git/Node SHA, 허용 파일, validator closure pins.
  argv는 고정 capture wrapper와 original validator/hash/evidence root/source repo를 묶는다.
- 세 G1 actor의 기존 승인 ACP binding과 SHA. role/model이 맞아야 하며 추가 inputFiles나 쓰기 tool은 허용하지 않는다.
- 실행·재시도·일일 예산과 polling/watchdog 시간. maxTickAge는 run deadline과 poll 여유를 고려해 정한다.

G1 운영 모드는 `g1_acp`, provider `g1_acp`, group `G1`이다. 로컬 Ollama는
`synthetic_rehearsal` + `purpose:"synthetic_harness"`에서만 사용한다. G2 로컬 모델을
G1 개발/검토 기본으로 선택하거나 새 모델 비교·교체를 실행하지 않는다.

## 증거·반복·실패

현재 권한 확인 → 허용 입력 원본 저장 → 권한 재확인 → 모델 호출 → visible JSON 저장 순서다.
실패에도 승인된 입력은 남고, hidden reasoning/auth diagnostics는 저장하지 않는다.
evidence root는 issued request/G2 public projection, model request/response, source/patch pins,
candidate manifest, validator stdout/stderr, review/report/run-result를 보존한다.
validator stream은 lossless base64이며 부분 출력·크기 초과·미종료는 성공이 아니다.
최종 reviewer는 확인된 원출력과 hash/check/candidate 결속을 받는다. `_workmeta`에는 refs/hash/status만 둔다.

report와 watchdog `DELIVERED`는 local readbox의 확인된 기록이다. 채팅·메일·Linear 발송이나
Owner 승인을 뜻하지 않는다. 실제 전달 route에는 별도의 현재 승인 transport가 필요하다.
echo 제외는 exact source revision의 G2 readback과 local report ref/hash를 요구한다.
단순 boolean/label/문자열 유사성은 쓰지 않는다. core의 semantic hash는 전체 normalized
issue revision과 delegation을 포함하며, 의미만의 hash나 문서 classifier가 아니다.

불명 실행·report는 `EXECUTION_UNKNOWN`으로 유지하며 재시작만으로 재실행하지 않는다.
실패 후보/증거를 삭제하지 않는다. 현재 위임과 별도 controller의 pinned 독립 inspection이 있으면:

```text
node <install-root>/guild_hall/dev_worker/feedback_runtime_cli.mjs recover --deployment <deployment.json> --sha256 <hash> --run-ref <run-ref> --proof <independent-readback.json> --proof-sha256 <hash>
node <install-root>/guild_hall/dev_worker/feedback_runtime_cli.mjs retry --deployment <deployment.json> --sha256 <hash> --run-ref <run-ref> --proof <independent-readback.json> --proof-sha256 <hash>
```

proof는 original source/scope/packet/instance·독립 inspector를 결속한다. worker PID가 살아
있거나 재사용 가능하면 보류한다. candidate가 있으면 inspection의 manifest SHA와 현재 파일을
검사한다. partial candidate와 확인되지 않은 process tree는 자동 수리하지 않는다.
recovery는 stop inspection이고 retry는 현재 source/권한을 다시 요구하는 requeue다.
종료한 worker PID만으로 descendant/model 종료를 입증할 수 없어 별도 process evidence가 필수다.
model의 자기 선언으로 inspection을 만들지 않는다.

이 실행면과 기존 runner는 OS sandbox/descendant isolation이 아니다. 고정 검사, 승인된 native
binding, 독립 검토, 설치 root ACL과 실제 process stop 검사가 각각 필요하다.

## 검증과 한계

```text
node --test --test-concurrency=1 guild_hall/dev_worker/feedback_runtime*.test.mjs
npm run validate:dev-worker
```

임시 SQLite·sparse Git·검사 자식·설치 사본 worker/watchdog·기본 ACP factory와 임시 native
fake CLI를 사용한다. fake model의 제안/검토는 합성 대조다. 실제 사용자 자료·credentials·원대화·
provider 추론·GPU 부하·운영 scheduler는 시험하지 않는다. 실제 G2 공급·현재 권한 writer·ACP
binding·모델 효용·운영 설치 수락은 각각 현재 증거가 필요하다. 합성 관통을 전체 출시 완료로 바꾸지 않는다.
