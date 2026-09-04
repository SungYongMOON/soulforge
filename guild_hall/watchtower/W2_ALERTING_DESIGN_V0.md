# Watchtower W2 — 알림 배선 설계 초안 v0

| 항목 | 값 |
| --- | --- |
| 상태 | `OWNER_REVIEW_DRAFT` / `canon_candidate` |
| 주장 한계 | `관찰됨` — 기존 두 모듈의 소스를 읽고 설계했을 뿐 구현·검증은 없음 |
| 기준일 | 2026-09-04 |
| 소유 | `guild_hall/watchtower` (W2 범위) |
| 비권한 | 이 문서만으로 알림을 켜거나, town_crier 계약을 바꾸거나, 예약작업을 등록하지 않음 |

`README.md`가 "복구(self-heal)·알림·스케줄 상주화는 W2에서 별도 owner 승인 게이트로
추가한다"고 유보한 그 W2 중 **알림 한 갈래만** 설계한다. self-heal은 범위 밖이다.

## 1. 풀려는 문제

W1은 판정한다. 그리고 아무에게도 말하지 않는다.

노드가 grace를 넘겨 `stale`이나 `down`이 되어도 그 사실은 스냅샷 파일과 4192 화면에만
남는다. 사람이 화면을 열어야 안다. 그래서 **"수집기가 조용히 죽고 아무도 모른다"가
현재 구조상 정상 동작**이다. 감시기가 있는데도 그렇다.

## 2. 이미 있는 부품

| 부품 | 하는 일 |
| --- | --- |
| `watchtower.mjs` `composeTopologyHealth` | 노드별 `{state, reasons, age_seconds}` 판정 |
| `watchtower.mjs` `writeTopologyHealthSnapshot` | `<state_root>/snapshot/topology_health.v2.json` |
| `town_crier/runtime.mjs` `emitNotification` | scope 정책 확인 → queue 적재 |
| `town_crier` runner | queue 소비 → Telegram 전송, `attempt_count` 재시도 |
| `NOTIFY_BRIEF_FORMAT_V0.md` | 한국어 brief 표시 규칙 |

**새로 만들 전송로는 없다.** 빠진 것은 판정과 큐 사이의 한 조각이다.

## 3. 그냥 이으면 안 되는 이유 — 알림 폭주

`enqueueNotification`은 요청을 받으면 무조건 적재한다. `request_id`가
`notify_<시각>_<uuid>`라 **내용 기준 중복 제거가 없다.**

Watchtower를 5분마다 돌리고 판정이 나올 때마다 알림을 보내면, 사흘 죽어 있는 lane
하나가 **864번** 울린다. 사람은 이틀째에 알림을 끈다. 그러면 W2는 W1보다 나쁘다 —
없느니만 못한 감시가 된다.

그러므로 W2의 본체는 전송이 아니라 **억제**다.

## 4. 설계 — 상태 전이에서만 발화

큐에 넣을지 결정하는 얇은 판정기 하나(`alert_policy.mjs`)를 둔다. 스냅샷 두 개(직전·현재)와
알림 장부를 읽고, 보낼 요청 목록을 낸다. 전송은 하지 않는다.

```text
composeTopologyHealth ──▶ alert_policy ──▶ emitNotification ──▶ (기존 town_crier)
                             ▲   │
                 직전 스냅샷 ─┘   └─▶ 알림 장부 갱신
```

규칙 넷.

1. **전이에서만 발화.** `ok → stale|down|degraded`일 때 1회. 같은 상태가 유지되는 동안은
   침묵한다. 판정 주기가 아니라 상태가 바뀔 때가 사건이다.
2. **재알림은 백오프.** 계속 죽어 있으면 1시간 → 4시간 → 24시간 뒤 한 번씩만 다시
   울리고 그 뒤로는 하루 1회로 고정한다. 잊지는 않되 지치게 하지 않는다.
3. **복구도 알린다.** `stale|down → ok`는 1회 발화한다. 복구 알림이 없으면 사람이
   화면을 열어 확인해야 하고, 그러면 처음 문제로 돌아간다.
4. **미감시는 알리지 않는다.** `unmonitored`는 장애가 아니라 binding에 probe가 없다는
   선언이다. 이걸 울리면 첫날 20개가 쏟아진다. 미감시 개수는 일일 요약에만 넣는다.

장부는 `<state_root>/alert/state.v1.json`에 노드별로
`{last_state, since, last_notified_at, notify_count}`만 둔다. 경로·임계값은 계속 binding이
소유하고 장부에는 넣지 않는다.

## 5. town_crier 계약 변경 — scope 하나

`emitNotification`의 scope는 `gateway`와 `mission` 둘뿐이고, 허용 event 표에는
`healer`가 이미 세 번째 자리로 들어가 있다. 같은 모양으로 넷째를 추가한다.

```js
export const WATCHTOWER_NOTIFY_EVENTS = ["node_down", "node_stale", "node_recovered"];
```

`emitNotification`에 `watchtower` scope 분기와 `watchtowerNotifyStatus`를 더한다. 정책
파일이 없으면 `disabled`를 반환하는 기존 fail-safe를 그대로 따르므로, **Owner가 켜기
전에는 코드가 들어가도 한 통도 나가지 않는다.** 이것이 이 변경을 안전하게 만드는 지점이다.

## 6. 메시지 — 세 줄

`NOTIFY_BRIEF_FORMAT_V0`에 따라 한국어 문장형, 절대경로·secret·내부 ID 없음.

```text
Linear 수집기가 45분째 응답이 없습니다.
마지막 정상 수집은 오늘 09:45입니다.
예약작업이 살아 있는지 확인해 주세요.
```

노드 `label`(이미 public-safe 한국어)과 `age_seconds`만 쓴다. `reasons`의 기계 코드는
본문에 넣지 않고 `source_ref`에만 남긴다.

## 7. Owner 결정이 필요한 것

| # | 항목 | 기본안 |
| --- | --- | --- |
| 1 | W2 알림 게이트 자체 | README의 유보를 이 범위(알림만, self-heal 제외)에서 해제 |
| 2 | 어느 노드가 울릴 자격이 있나 | 수집·백업 워커 4개부터. store와 external은 제외 |
| 3 | 백오프 간격 | 1h → 4h → 24h → 매일 |
| 4 | 조용한 시간 | 없음(백업 실패는 새벽에 난다). 필요하면 후속 |
| 5 | 채널 | 기존 Telegram 하나 재사용, 새 채널 없음 |

1번이 닫히기 전에는 구현하지 않는다.

## 8. 범위 밖

self-heal·자동 재시작·예약작업 조작, 새 전송 채널, 새 알림 저장소, Watchtower의 상주화,
노드별 임계값의 tracked 저장. 모두 별도 owner 게이트가 필요하다.

## 9. 검증 계획

- `alert_policy`는 순수 함수로 둔다. 스냅샷 두 개와 장부를 받아 요청 목록을 내는 형태라
  네트워크 없이 전이·백오프·복구·미감시 제외를 결정론 테스트로 고정할 수 있다.
- town_crier scope 추가는 기존 `town_crier.test.mjs`의 허용 event 검사 경로를 그대로 탄다.
- 실제 발화는 `--apply` 없이는 하지 않는 기존 bridge 관행(`assign_notify_bridge.mjs`)을 따른다.
- 알림 정책을 바꾸는 변경이므로 실행 계약상 Level 2 이상, 실제 발화 활성화는 Level 3.
