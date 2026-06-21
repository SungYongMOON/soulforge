# 배정 알림 브리지 (assign_notify_bridge)

dev-erp에서 **할 일이 담당자에게 배정되면 텔레그램으로 알림**을 보낸다. "일이 떨어져도 담당자가 앱을 안 열면 모른다(all-pull)" 운영 병목 해소용.

## 동작 (egress-safe)

dev-erp 서버는 외부 전송 금지 가드(`no_server_egress`)가 있어 텔레그램을 **직접 못 보낸다.** 그래서:

```
dev-erp (assign 시 event_log 에 item_assign 기록, 이미 동작)
  → assign_notify_bridge.mjs (event_log 읽어 미처리 배정 수집, watermark)
  → town_crier emitNotification(scope=gateway, event=item_assigned)  ← 외부 전송 허용 프로세스
  → telegram (notify 정책 + telegram env 로 게이트)
```

dev-erp 코드 변경 없음. 브리지는 별도 프로세스라 가드를 자동 준수한다.

## owner 셋업 (이게 돼야 알림이 실제로 나간다)

1. **루트 의존성**: repo 루트에서 `npm install` 1회 (guild_hall 은 `yaml` 등 의존).
2. **텔레그램 채널 secret** — `guild_hall/state/town_crier/telegram_notify.env` 에 bot token + chat_id.
   *agent 는 경로만 안내, 값은 owner 가 직접 입력(secret 규칙).*
3. **이벤트 활성화** — `item_assigned` 알림을 켠다(기본 OFF). gateway notify 정책
   (`guild_hall/state/gateway/bindings/notify_policy.yaml`)의 `channels.telegram.enabled: true` +
   `events.item_assigned.telegram: true`. (`guild-hall:notify:gateway` CLI 또는 직접 편집.)
4. **스캔 + 배달을 스케줄** (Windows 작업 스케줄러 권장, 수 분 간격):
   ```bash
   # 1) 새 배정 스캔 → town_crier 큐 적재 (운영 DB 경로 지정)
    npm run guild-hall:notify:assign-scan -- --apply --db "<DEV_ERP_DB_PATH>"
   # 2) 큐 배달 (텔레그램)
   npm run guild-hall:town-crier:run
   ```
   - `--db` 미지정 시 그 checkout 의 `ui-workspace/apps/dev-erp/data/dev-erp.db` 를 본다 → **운영 checkout DB 경로를 명시**하라.
   - `--apply` 없으면 dry-run(발화·watermark 전진 안 함). watermark: `guild_hall/state/town_crier/assign_notify_state.json`.

## 범위 / 한계

- **단일 팀 채널** 알림(기존 town_crier 텔레그램 채널 재사용). 담당자별 DM(per-user chat_id)은 후속.
- `item_assign` 이벤트(재배정·메일 claim·묶음 분류 시 발생)만 트리거. 미배정(담당 비움)은 제외.
- 정책/ env 미설정이면 `emitNotification` 은 `disabled` 로 조용히 no-op(에러 아님).

## 테스트

`node --test guild_hall/town_crier/assign_notify_bridge.test.mjs` — 수집/필터/텍스트/dry-run. 실제 dev-erp 스키마 통합도 검증됨(event_log+core_item 조인). 텔레그램 실발송은 owner env 에서 확인.
