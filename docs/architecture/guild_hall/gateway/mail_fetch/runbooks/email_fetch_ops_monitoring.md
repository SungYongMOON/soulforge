# email-fetch 운영 모니터링 런북

> 마지막 업데이트: 2026-03-05

`email-fetch` 수집기의 장애/복구 상태를 점검하고 Telegram 알림 정책(장애/복구만)을 운영하는 절차다.

---

## 운영 원칙

- 정상 수집 알림은 보내지 않는다.
- 장애(`WARN/CRITICAL`)와 복구(`RECOVERY`)만 알림 대상으로 한다.
- 알림은 쿨다운(`EMAIL_FETCH_HEALTH_ALERT_COOLDOWN_SEC`, 기본 3600초)으로 중복 억제한다.
- 수집기는 상시 루프 프로세스가 아니라 one-shot 주기 실행(`StartInterval`)으로 운영한다.

---

## healthcheck 실행

```bash
npm run guild-hall:gateway:fetch:healthcheck -- --json
```

산출 파일:
- 상태 파일: `guild_hall/state/gateway/log/mail_fetch/monitor/health_state.json`

주요 환경변수:
- `EMAIL_FETCH_HEALTH_MAX_STALE_SEC` (기본 `900`)
- `EMAIL_FETCH_HEALTH_FAIL_STREAK` (기본 `2`)
- `EMAIL_FETCH_HEALTH_PARTIAL_STREAK` (기본 `3`)
- `EMAIL_FETCH_HEALTH_ALERT_COOLDOWN_SEC` (기본 `3600`)
- `EMAIL_FETCH_ALERT_TELEGRAM_ENABLED` (기본 `false`)
- `EMAIL_FETCH_ALERT_TELEGRAM_BOT_TOKEN` (민감정보)
- `EMAIL_FETCH_ALERT_TELEGRAM_CHAT_ID`

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

- collector/healthcheck 모두 기본 5분 주기 one-shot 실행을 권장한다.
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
2. 새 스킬이 주기 작업이면 해당 스킬 전용 스크립트(one-shot)를 만들고 launchd `StartInterval` 또는 `StartCalendarInterval`로 등록한다.
3. 새 스킬이 이벤트성/사용자 호출 작업이면 별도 런처를 만들지 않고 기존 gateway 명령 경로에서 호출한다.
4. 기본은 “스크립트 실행 단위 분리 + 스케줄러 연결”이며, 상시 `KeepAlive` 프로세스 증설은 예외로만 허용한다.

---

## 관련 문서

- [email_fetch_state_recovery.md](email_fetch_state_recovery.md)
- [email_fetch_retention_security.md](../policies/email_fetch_retention_security.md)
