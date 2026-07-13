# email-fetch 운영 모니터링 런북

> 마지막 업데이트: 2026-07-13

`email-fetch` 수집기의 장애/복구 상태를 점검하고 Telegram 알림 정책(장애/복구만)을 운영하는 절차다.

---

## 운영 원칙

- 정상 수집 알림은 보내지 않는다.
- 장애(`WARN/CRITICAL`)와 복구(`RECOVERY`)만 알림 대상으로 한다.
- 알림은 쿨다운(`EMAIL_FETCH_HEALTH_ALERT_COOLDOWN_SEC`, 기본 3600초)으로 중복 억제한다.
- 수집 명령 자체는 one-shot 계약을 유지한다. 지정 macOS always-on node에서는
  GUI launchd의 interval spawn 보류를 피하기 위해 하나의 persistent LaunchAgent
  loop가 one-shot 명령을 순차 호출한다.

---

## healthcheck 실행

```bash
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

산출 파일:
- 상태 파일: `guild_hall/state/gateway/log/mail_fetch/monitor/health_state.json`

경로 해석:
- `EMAIL_FETCH_RUNTIME_DIR` 는 Soulforge root 기준 상대경로를 권장한다.
- `guild_hall/...`, `_workspaces/...`, `_workmeta/...` 처럼 Soulforge 내부 root 로
  시작하는 값은 현재 clone 기준으로 해석한다.
- 기존 env 호환을 위해 `../../log/mail_fetch` 처럼 env 파일 위치 기준 상대경로도
  유지하지만, 새 기록에는 PC별 mount/home 절대경로를 쓰지 않는다.

주요 환경변수:
- `EMAIL_FETCH_HEALTH_MAX_STALE_SEC` (기본 `900`)
- `EMAIL_FETCH_HEALTH_FAIL_STREAK` (기본 `2`)
- `EMAIL_FETCH_HEALTH_PARTIAL_STREAK` (기본 `3`)
- `EMAIL_FETCH_HEALTH_ALERT_COOLDOWN_SEC` (기본 `3600`)
- `EMAIL_FETCH_ALERT_TELEGRAM_ENABLED` (기본 `false`)
- `EMAIL_FETCH_ALERT_TELEGRAM_BOT_TOKEN` (민감정보)
- `EMAIL_FETCH_ALERT_TELEGRAM_CHAT_ID`

`EMAIL_FETCH_ALERT_TELEGRAM_*` 값은 gateway mail fetch env 에서 우선 읽고, 없으면 `guild_hall/state/town_crier/telegram_notify.env` 의 `TELEGRAM_*` 값을 fallback 으로 사용한다.

---

## 상태 판정

- `CRITICAL`
  - 마지막 실행이 stale(`finished_at` 기준 max stale 초과)
  - 또는 연속 fail streak 기준 초과(기본 2회)
- `WARN`
  - 연속 partial streak 기준 초과(기본 3회)
- `RECOVERY`
  - 이전 `WARN/CRITICAL`에서 `NORMAL`로 복귀

---

## 주기 실행 기준

- collector/healthcheck 명령은 모두 기본 5분 주기 one-shot 호출을 권장한다.
- 지정 macOS always-on node의 scheduler wrapper는 `RunAtLoad + KeepAlive`로
  계속 살아 있으면서 앞 호출이 끝난 뒤 5분을 기다린다. 실행이 겹치지 않는다.
- launchd/crontab/systemd 중 어떤 스케줄러를 쓰더라도 명령은 아래 두 개만 호출하면 된다.

```bash
npm run guild-hall:gateway:fetch -- --once --json
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

---

## 점검 체크리스트

1. `health_state.json`의 `last_status`가 기대값인지 확인
2. 장애 발생 시 알림 1회, 동일 fingerprint는 쿨다운 동안 억제되는지 확인
3. 복구 시 `RECOVERY` 알림이 1회 발생하는지 확인
4. 정상 루프에서 알림이 발생하지 않는지 확인

---

## 스킬 추가 원칙

1. `gateway launcher`는 1개만 상시 운영한다.
2. 새 스킬이 주기 작업이면 해당 스킬 전용 one-shot 스크립트를 만든다. 지정
   macOS always-on node의 interval job은 공용 persistent wrapper로 호출하고,
   calendar job은 `StartCalendarInterval`을 사용할 수 있다.
3. 새 스킬이 이벤트성/사용자 호출 작업이면 별도 런처를 만들지 않고 기존 gateway 명령 경로에서 호출한다.
4. 기본은 “스크립트 실행 단위 분리 + 스케줄러 연결”이다. persistent wrapper는
   always-on job별 하나로 제한하고, 작업 본문을 장기 프로세스로 바꾸지 않는다.

---

## 관련 문서

- [email_fetch_state_recovery.md](email_fetch_state_recovery.md)
- [email_fetch_retention_security.md](../policies/email_fetch_retention_security.md)
