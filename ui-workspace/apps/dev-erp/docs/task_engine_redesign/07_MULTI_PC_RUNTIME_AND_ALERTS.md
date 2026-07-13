# 07. 멀티 PC runtime과 alert

| 항목 | 내용 |
| --- | --- |
| owner | node-local collectors + exactly one operational reconciler |
| authority | target role/packet/notification contract |
| CURRENT | public synthetic file helper; live binding/transport/alerts 미활성 |
| TARGET | four-role immutable packets, sole reconciler, bounded state-change alerts |
| non-goals | 이번 PC에서 scheduler/network/Telegram 활성화, node identity 추정 |
| stop | exact profile/primary/ACL 없음, shared mutable ledger, secret 필요 |

## roles

| role | target responsibility | verification |
| --- | --- | --- |
| `work_pc` | 일반 project work, deletion authority 후보 | VERIFY_HP/owner binding |
| `tool_pc` | 고성능 extraction/RAG/ERP engine | 고성능 PC 목표 |
| `portable_dev_pc` | public development, intermittent positive observations | writer 아님 |
| `always_on_node` | packet ingress/watchdog/reconciliation | sole primary만 writer |

LOCKED 방향: Mac mini는 voice operational-primary와 watchdog target, 고성능 PC는
ERP/context/RAG/life-tree server target이다. 한 물리 PC가 `tool_pc`와
`always_on_node`를 겸할 수 있어도 logical identity를 분리한다. exact binding과 sole
reconciler 지정은 owner/runtime 증거 전까지 열려 있다.

같은 물리 고성능 PC가 두 role을 겸할 때도 같은 mutable checkout을 공유하지 않는다.
`tool_pc`와 `always_on_node`는 별도 clone/worktree, node identity, outbox/lock, process owner로
분리해 role별 write scope와 장애 복구를 독립시킨다.

메일 coverage도 역할과 함께 기록한다. Mac mini의 회사 메일 접근은 제한된 부분 관측이므로
watchdog/voice context 보조에는 쓸 수 있지만 팀 전체 메일의 부재나 완전성을 판단하지 않는다.
고성능 PC의 팀 전체 메일 접근이 확인되면 canonical mail reconciliation 후보가 된다. 모든
packet/projection은 `coverage_scope`, 마지막 성공 시각, gap을 노출해 부분 관측을 전체처럼
보이지 않게 한다.

## packet and reconciler

- node는 자기 immutable partition만 쓴다.
- packet은 sequence, prior packet, observed/ingested time, bounded metadata/hash, coverage를 가짐.
- same packet ID/same digest=no-op; same ID/different digest=quarantine.
- sole file-activity reconciler만 node observation에서 만든 logical-file/revision current state,
  projection, receipt를 쓴다. `core_item`, TaskDriver, mail/source truth는 이 권한으로 쓰지 않는다.
- Tailscale은 authenticated transport 후보일 뿐 task/source authority가 아니다.
- scanner/writer/scheduler는 binding, transport, ACL, replay/compaction gates 뒤 활성화한다.

## alert target (`DEFAULT`, 운영 승인 전)

Alert는 Telegram으로 검증된 state transition, recovery와 제한된 reminder/summary만 보낸다.
heartbeat는 보내지 않고 project name/path/payload는 포함하지 않는다.

Mac mini watchdog은 고성능 PC에 대해 Tailscale reachability와 ERP/service health를 따로
확인한다. ping 성공은 네트워크 도달만 뜻하므로 service healthy로 간주하지 않고, ping 실패
한 번도 장애로 확정하지 않는다. 두 probe의 연속 상태 변화가 아래 debounce를 통과할 때만
알림 후보가 된다.

| rule | default candidate |
| --- | --- |
| unhealthy debounce | 2회 연속 실패 + 10분 |
| severity escalation | cooldown과 무관하게 즉시 |
| repeated weekday reminder | 같은 cause는 6시간에 최대 1회 |
| weekend/long outage | Asia/Seoul 토·일 또는 12시간 초과 시 하루 1회 10:00 요약 |
| recovery | 즉시 1회, outage 시작/지속/복구시각과 generic cause code |
| dedupe key | node role + service + outage episode + transition sequence + state + severity + cause code |

상태는 `healthy | degraded | offline | recovering` 후보이며 heartbeats는 보내지 않는다.
Telegram 실패가 runtime state를 바꾸지 않으며 local receipt에 notification gap만 남긴다.
recovery 후 다음 unhealthy transition은 새 outage episode를 시작해 이전 dedupe가 새 장애를
숨기지 않게 한다. alert ack도 task/incident close authority가 아니다.

- transition/escalation: 위 표의 transition sequence dedupe를 사용한다.
- weekday reminder: `role + service + episode + reminder + 6시간 period bucket`당 최대 1회.
- weekend/long-outage summary: `role + service + episode + summary + Asia/Seoul 날짜`당 1회.
- recovery: 같은 episode의 recovery 1회이며, 전송 뒤 episode를 닫는다.

## activation gates

1. exact bootstrap profile/node IDs/sole primary
2. Tailscale peer identity, ACL, replay protection, packet signature
3. service probes와 state transition validator
4. Telegram destination/secret은 owner-local env에만 존재
5. cooldown/weekend policy owner 승인과 synthetic clock tests
6. outage/recovery/notification-failure rollback drill
7. no raw/path/private identifier payload check

## recovery sequence

1. 새 packet 적용을 멈추되 immutable inbox는 지우지 않는다.
2. last reviewed checkpoint와 packet sequence/digest를 확인한다.
3. competing primary 또는 clock/chain conflict를 quarantine한다.
4. dry-run replay로 canonical state/projection digest를 비교한다.
5. owner가 exact primary/binding을 재확인한 뒤 한 writer만 재개한다.
6. `recovering` state를 기록하고 projection freshness를 확인한다.
7. 정상 전환 뒤 recovery alert를 한 번 보내고 cooldown key를 닫는다.

오래된 node가 돌아와도 최신 head나 삭제를 자동 확정하지 않고 positive observation만 낸다.

## refs

- [`PROJECT_FILE_ACTIVITY_REVISION_V0.md`](../../../../../docs/architecture/workspace/PROJECT_FILE_ACTIVITY_REVISION_V0.md)
- [`MULTI_PC_DEVELOPMENT_V0.md`](../../../../../docs/architecture/workspace/MULTI_PC_DEVELOPMENT_V0.md)
- [`10_HIGH_PERFORMANCE_PC_PLAN_MODE_RUNBOOK.md`](10_HIGH_PERFORMANCE_PC_PLAN_MODE_RUNBOOK.md)
