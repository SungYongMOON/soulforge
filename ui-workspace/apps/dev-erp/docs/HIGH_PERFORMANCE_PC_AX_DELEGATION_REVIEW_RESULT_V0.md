# 고성능 PC AX AI 위임 범위 교차검토 결과 V0

| 항목 | 판정 |
| --- | --- |
| verdict | `REVISE` |
| claim ceiling | 공개 계획은 `source_supported`, 이 PC의 읽기 전용 runtime 관찰은 `validated_private` |
| Stage A | `CONDITIONAL_READY` — 한 phase의 exact child packet 단위만 |
| Stage B | `BLOCKED` — coverage shadow와 readiness shadow를 분리해야 함 |
| Stage C | `BLOCKED` — accepted core/AX/transport/cutover gate 없음 |
| 구현·운영 영향 | 없음. 코드·DB·업무 데이터·writer·scheduler·service를 변경하거나 활성화하지 않음 |

## 1. 주인을 위한 한 문장 결론

고성능 PC를 팀의 정상 ingress/custody·Task Engine/AX primary로 두고 맥미니를 감시·비상
fallback으로 두는 방향은 유지할 수 있다. 그러나 현재는 **일부 수집 기반과 feature-OFF 코드가
존재할 뿐, 프로젝트별 통합 이력·ERP/MCP 조회·sole-writer 전환이 완료된 상태가 아니다.**
따라서 AI 자율 위임은 public/synthetic 개발부터 한 단계씩 열고, live read와 write는 기존
P0~P10 및 AX gate receipt 뒤에 별도로 열어야 한다.

```text
현재
  맥미니 쪽 메일 연속성 ─┐
                         ├─ 일부 수집은 살아 있음
  HPP 비메일 ingress ────┘
             │
             ├─ ERP / MCP / project promoter: OFF
             └─ 프로젝트별 5-lane 정식 이력: 아직 미수락

목표
  각 PC·메일·음성·파일·실행로그
             │
             ▼
  HPP 접수·원본 보관·sole writer
             │
             ├─ ERP 정본
             ├─ 프로젝트별 감사 projection
             └─ ERP UI / MCP 조회
  맥미니: 감시·알림·비상 fallback
```

## 2. 확인된 CURRENT와 아직 확인하지 못한 것

### 2.1 확인된 사실

- 공개 Git 기준선은 이 검토 시작 시 `main == origin/main`이었고 검토 대상 packet과 HPP/Mac 역할
  보정이 포함돼 있었다.
- macOS의 고정 `/var` alias만 `/private/var`로 정규화하고 Windows의 기존 대소문자 비교를
  유지하는 physical-path helper가 추가됐다. 임의 symlink를 같은 경로로 간주하지 않으므로
  fail-closed 경계를 넓히지 않는다.
- ingress·voice·MCP·mail reconciliation 관련 집중 테스트 75건을 실행해 75건 모두 통과했다.
- 현재 HPP의 운영 runtime은 최신 공개 Git 기준선보다 뒤에 있다. 새 helper와 최신 역할 문서는
  아직 운영 runtime에 배포됐다고 볼 수 없다.
- HPP의 비메일 ingress schedule은 동작 중이지만 ERP 관련 schedule, MCP network listener,
  project promoter는 활성 상태가 아니다.
- 현재 fallback 측 메일 수집은 aggregate health 기준 정상으로 관찰됐지만 `ingress-only`가
  강제된 상태는 아니다. HPP에서 정상 메일 sole-writer가 가동 중이라는 증거는 없다.
- PLAUD KST 보정은 기존 private receipt 기준 이미 완료돼 있다. protected payload hash가 유지됐고
  후속 live recording도 KST session/date 규칙으로 들어왔으므로 재실행 대상이 아니다.

### 2.2 아직 완료로 주장할 수 없는 것

- 현재 HPP bootstrap identity가 accepted `always_on_node` operational-primary writer binding이라는 것
- HPP가 메일·음성·PC 업무·파일·실행로그 5개 lane을 모두 정상 수집한다는 것
- 5개 lane이 프로젝트별 accepted history envelope와 coverage receipt로 변환된다는 것
- ERP DB와 CSV/XLSX/ICS generation이 같은 cutoff에서 parity를 이룬다는 것
- 팀원이 MCP로 실제 자료·지식·작업 세션을 안전하게 조회·전송할 수 있다는 것
- HPP와 맥미니 사이의 fencing·lease/epoch·failover·failback이 실제 canary로 증명됐다는 것

## 3. 검토 질문 1~8의 답

### Q1. Stage A에서 지금 만들 수 있는 것은 무엇인가

public/synthetic/pathless fixture, feature-OFF adapter, deterministic validator, replay·idempotency·rollback
시험, public-safe schema·문서는 가능하다. 실제 source locator, private binding, DB row, 업무 원문,
writer, scheduler, network service는 Stage A 권한이 아니다. 각 개발 slice는 literal path·symbol·명령,
출력, validator, stop/rollback, expiry를 가진 exact child packet 하나로 제한해야 한다.

### Q2. P0와 P1은 통과했는가

공개 마스터플랜은 C00Q source와 C00B judge foundation의 존재를 기록하지만 formal acceptance와
live binding을 HOLD로 둔다. 이후 private receipt가 있더라도 현재 delegation packet의 exact gate map에
수락 근거가 연결돼 있지 않으므로 이번 위임 판정에서는 P0 PASS로 승격하지 않는다. H00은 아직
owner-ratified canon이 아니며 H01~H05 accepted lane receipt와 H06 acceptance도 없다. 따라서 P1도
PASS가 아니다.

### Q3. Stage B 전에 무엇이 더 필요한가

Stage B를 다음 두 단계로 나눈다.

1. `coverage shadow`: H00 ratification, D19/D20/D26, H01A~H05 shadow, D25, lane acceptance,
   D22/D24와 H06가 모두 수락된 뒤 exact private read grant로 연다.
2. `readiness shadow`: cross-source context가 필요한 계산이므로 P2~P5와 D29/Q8을 추가로 통과한 뒤
   연다. 실제 one-project accepted query는 P9/Q9 뒤에만 연다.

새 `Source Coverage Ledger`나 `Project Pulse` 정본을 발명하지 않고 기존 H06 coverage receipt와
accepted-generation manifest를 논리 출력으로 재사용한다.

### Q4. 기존 gate와 충돌하거나 빠진 것은 무엇인가

Stage C에 적힌 D01~D09·D12·D28·D29와 AX-G1~G3 방향은 맞다. 다만 HPP MCP/network/artifact
transport를 사용하면 D27, A8-SYNTH, private `VERIFY_HP`, A8-CANARY Level 3도 추가해야 한다.
P1 축약 표기에는 다음 실제 순서를 함께 고정해야 한다.

```text
D19 / D20 / D26
        ↓
H01A~H05 shadow
        ↓
       D25
        ↓
lane acceptance
        ↓
   D22 / D24
        ↓
       H06
```

### Q5. 개발-write와 source-read는 분리할 수 있는가

가능하며 반드시 분리해야 한다. public/synthetic write packet은 private locator·source authority를
포함하지 않는다. source-read packet은 opaque project/scope ref와 exact private authority, 허용 field,
time window, logical output owner/path, 시작·만료·폐기 조건을 가져야 한다. 한 packet의 권한을 다음
phase로 상속하지 않는다.

### Q6. 공식 writer와 외부 행동이 0임을 증명할 수 있는가

현재 검토 자체는 Git 및 source fingerprint, schedule/listener 관찰, read-only query guard로 mutation
0을 확인했다. 그러나 살아 있는 기존 collector까지 0이라는 뜻은 아니다. 향후 child packet은
feature flag OFF, 네트워크·scheduler 비활성, durable output allowlist, before/after fingerprint,
SQLite readOnly+query_only+total_changes=0, temp leftover 0을 각각 증명해야 한다.

### Q7. 사람이 확인할 횟수는 어떻게 줄이는가

권한 묶음 하나를 여러 phase에 쓰는 대신, **한 phase·한 child packet**의 시작·만료·폐기 조건을
한 번 승인하고 routine validator PASS 동안 계속 실행한다. 사람에게 다시 묻는 경우는 scope 변경,
threshold 실패, private source 추가, state mutation, external action, live activation뿐으로 제한한다.

### Q8. 더 단순하고 안전한 대안은 무엇인가

기존 gate를 대체하는 새 control plane을 만들지 않는다. 기존 H06 receipt와 generation manifest를
재사용하고 Stage B만 coverage/readiness로 분리한다. HPP/Mac 인계도 새 동시 writer를 만들지 않고
현재 collector 연속성을 유지한 채 freeze·catch-up·parity·새 lease/epoch 순서로 전환한다.

## 4. Stage별 최종 판정

| 단계 | 판정 | 지금 가능한 일 | 아직 필요한 것 |
| --- | --- | --- | --- |
| A public/synthetic | `CONDITIONAL_READY` | feature-OFF 코드·fixture·validator·문서 | exact child packet, 누락된 root validation surface, 실제 OS별 비운영 검증 |
| B1 coverage shadow | `BLOCKED` | packet·fixture 설계 | P0, H00, D19/D20/D26, H01~H06, D22/D24/D25, private read grant |
| B2 readiness shadow | `BLOCKED` | 계산 규칙 설계 | B1 + P2~P5 + D29/Q8; accepted project query는 P9/Q9 |
| C provisional write | `BLOCKED` | write contract·rollback 시험 | core/AX gate, exact owner packet, Level 3, 필요 시 D27+A8/VERIFY_HP |
| live activation | `BLOCKED` | runbook·canary 설계 | 별도 owner 승인, identity/ACL, fencing, parity, cutover/failback receipt |

## 5. HPP와 맥미니의 안전한 전환 순서

현재 fallback 메일 연속성을 갑자기 끊거나 HPP writer를 동시에 켜면 안 된다. 최소 전환 순서는
다음과 같다.

```text
1. HPP runtime을 승인 기준선으로 동결·검증
2. HPP always_on_node identity와 source authority 확정
3. 기존 collector queue/cursor/dedupe 상태 freeze·snapshot
4. HPP에서 메일함 1개 ingress-only canary
5. receipt / ack / 누락 / 중복 / DB·projection parity 검증
6. 기존 writer 정지 확인
7. 새 lease/epoch로 HPP sole writer 전환
8. 맥미니는 monitor·alert·HOLD/outbox·비상 fallback만 유지
9. failback도 새 epoch와 동일한 fencing 절차로만 수행
```

PLAUD KST migration은 이미 수락된 상태이므로 1~9 과정에서 다시 적용하지 않는다. HPP에서는
동기화된 pointer와 manifest를 검증하기만 한다.

## 6. 최소 capability bundle

각 bundle은 다음 필드를 가져야 하며 다른 phase에 자동 상속되지 않는다.

- opaque project/scope ref
- 허용 operation과 source/field class
- logical output owner/path class
- exact 시작·만료·revocation
- exception·stop·rollback
- deterministic validator와 zero-mutation proof
- private packet에만 기록하는 exact source·physical locator·identity/authority ref
- `no official task/status/completion`, `no external action`, `no live activation` 기본값

## 7. 측정 기준과 권장 threshold

첫 회차에는 baseline을 먼저 측정하며 근거 없는 숫자를 production 기준으로 고정하지 않는다.

| 항목 | Stage A/B 권장 중단 기준 |
| --- | --- |
| unauthorized mutation | 반드시 `0` |
| raw/private leak | 반드시 `0` |
| writer overlap | 반드시 `0` |
| source-ref coverage | 필수 입력 `100%`, optional은 gap code 필수 |
| blind spot | 숨김 `0`; 관찰 불가는 명시적 상태로 보존 |
| duplicate/conflict | 자동 소실 `0`; 전부 exception/receipt로 남김 |
| replay/idempotency | 동일 input에서 동일 logical result |
| rollback | synthetic/feature-OFF 범위에서 완전 복구 |
| temp/output scope | allowlist 밖 write와 leftover `0` |

## 8. owner 결정이 필요한 최소 항목

1. Stage A 첫 exact child packet의 한 phase·allowed paths·validators·expiry
2. 현재 private P0 receipt를 공식 gate map에 연결할지 또는 fresh acceptance를 다시 만들지
3. H00 independent envelope/coverage pair ratification 여부
4. HPP `always_on_node` identity와 정상 operational-primary 지정
5. 맥미니 mail collector의 정확한 current write 범위와 HPP cutover 시점
6. Stage B용 one-project·source/field/time-window private read grant
7. Stage C 및 live activation은 별도 승인으로 계속 유지

## 9. 검증과 독립 검토

- 공개 변경 diff와 실제 HPP runtime 상태를 분리해 점검했다.
- physical path, ingress, voice, MCP, mail reconciliation 집중 테스트: `75/75 PASS`.
- fresh implementation/runtime inspector: `REVISE` — 코드 방향 수락, runtime sync와 OS별 검증 보강 필요.
- fresh plan/gate inspector: `REVISE` — Stage B의 P2~P5·Q8/Q9 분리와 D27/A8 조건 보강 필요.
- fresh Mac/HPP 교차판정은 private locator·raw payload를 공개하지 않는 aggregate evidence만 사용한다.
- 검토 중 메일 본문·첨부·음성 본문·파일 원문·raw row·secret은 읽거나 공개 문서에 복사하지 않았다.

## 10. 이번 판정의 중단선

`REVISE`는 방향 폐기가 아니다. 제안이 다음 owner 결정 후보가 되려면 위 gate 분리와 현재 writer
인계 조건을 먼저 반영해야 한다는 뜻이다. 이 결과는 구현, DB migration, collector/writer 변경,
scheduler/service 활성화, P0/P1/AX acceptance 또는 production readiness를 승인하지 않는다.
