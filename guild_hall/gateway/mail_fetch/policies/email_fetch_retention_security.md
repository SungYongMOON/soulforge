# email-fetch 보존/권한 정책

> 마지막 업데이트: 2026-03-05

`email-fetch` 수집 데이터의 보존, 정리, 파일 권한 기준을 고정하는 정책 문서다.

---

## 1. 보존 정책

### 월 세그먼트 저장 규칙 (고정)

- 이벤트는 월 단위 세그먼트(JSONL)로 저장한다.
  - `guild_hall/state/gateway/mailbox/<workspace>/<bucket>/events/<source>/<YYYY>/<YYYY-MM>.jsonl`
- 원본(raw)도 월 단위 세그먼트(JSONL)로 저장한다.
  - `guild_hall/state/gateway/mailbox/<workspace>/mail/raw/<source>/<YYYY>/<YYYY-MM>.jsonl`
- 기본 분할 단위는 `month`이며, `quarter` 분할은 사용하지 않는다.
- 월 세그먼트가 비정상적으로 커질 경우(기준: `>256MB` 또는 `>500,000 lines`) 월 내 보조 세그먼트(`-a`, `-b` suffix)로 추가 분할한다.

### 회사 데이터

- 대상: `guild_hall/state/gateway/mailbox/company/*`
- 정책: 자동 삭제 금지(무삭제 보존)

### 개인 데이터

- `guild_hall/state/gateway/mailbox/personal/mail` (첨부 포함): 730일
- `guild_hall/state/gateway/mailbox/personal/ads`: 180일
- `guild_hall/state/gateway/mailbox/personal/quarantine`: 365일

### 런타임 로그

- `guild_hall/state/gateway/log/mail_fetch/logs/runs.jsonl`: 180일(라인 단위 정리)
- `guild_hall/state/gateway/log/mail_fetch/logs/last_run_summary.json`: 180일
- `guild_hall/state/gateway/log/mail_fetch/logs/collector_debug.jsonl`: 30일(라인 단위 정리)
- `guild_hall/state/gateway/log/mail_fetch/collector.stdout.log`, `collector.stderr.log`: 30일

---

## 2. 정리 실행 정책

- 기본 모드: `report-only`
  - `EMAIL_FETCH_RETENTION_REPORT_ONLY=true`
- 실제 적용은 명시 실행 시에만 수행
  - `npm run guild-hall:gateway:fetch:retention -- --apply --json`
- 즉시 삭제 금지
  - 만료 파일은 `guild_hall/state/gateway/mailbox/_trash/email-fetch/<YYYYMMDD>/`로 이동
- trash 보류 기간
  - `EMAIL_FETCH_RETENTION_TRASH_GRACE_DAYS` (기본 14일)
  - 보류 기간 경과분만 purge

실행 예시:

```bash
npm run guild-hall:gateway:fetch:retention -- --json
npm run guild-hall:gateway:fetch:retention -- --apply --json
```

리포트:
- `guild_hall/state/gateway/log/mail_fetch/retention/reports/retention_*.json`

---

## 3. 권한 기준(권장)

- 민감 파일(`.env`, token/password file): `600`
- `guild_hall/state/gateway/log/mail_fetch` 및 하위 state/logs: `700`
- `guild_hall/state/gateway/mailbox/company`, `guild_hall/state/gateway/mailbox/personal` 운영 디렉터리: `750` (협업 그룹 환경)

의미:
- `600`: 소유자 읽기/쓰기만 허용
- `700`: 소유자만 디렉터리 접근(읽기/쓰기/실행)
- `750`: 소유자 전체 + 그룹 읽기/실행

---

## 4. 운영 수칙

1. Telegram alert bot token은 `guild_hall/state/gateway/mailbox/state/email_fetch.env`에만 저장한다.
2. 보존 정책 변경은 코드 수정이 아니라 `.env` 값 조정으로 수행한다.
3. 정리 결과는 반드시 JSON 리포트와 `RUNLOG/VERIFY` 문서에 남긴다.
4. 월 세그먼트 백업/복구 규칙:
   - 열린 월 세그먼트는 일 1회 증분 백업
   - 닫힌 월 세그먼트는 월 1회 불변(immutable) 백업
   - 복구 시 `state(cursor/dedupe)` 복구 후 세그먼트 해시/라인수 검증을 수행하고, 마지막으로 collector `--once` 재개 점검을 수행한다.

---

## 5. 용량 계획 (2026-03-05 측정 기준)

- 측정 월별 총량(events/raw + local attachments):
  - `2025-12`: 약 `52.33 MB`
  - `2026-01`: 약 `64.09 MB`
  - `2026-02`: 약 `279.03 MB` (피크)
  - `2026-03`: 약 `35.26 MB` (부분 월)
- 평균 월량(샘플): 약 `107.68 MB/month`

5년(60개월) 추정:

- 평균 기준: 약 `6.31 GB`
- 피크 고정 기준(보수): 약 `16.35 GB`

권장 디스크 예산:

- 운영 데이터 전용 최소: `50 GB`
- 백업/복구 여유 포함 권장: `100~200 GB`

---

## 관련 문서

- [email_fetch_state_recovery.md](../runbooks/email_fetch_state_recovery.md)
- [email_fetch_ops_monitoring.md](../runbooks/email_fetch_ops_monitoring.md)
- [email_fetch.env.example](../email_fetch.env.example)
