# email-fetch 상태 복구 런북

> 마지막 업데이트: 2026-03-05

`email-fetch` 수집기의 `guild_hall/state/gateway/log/mail_fetch/state` 손상/누락 시, 백업과 복구를 수행하는 표준 절차다.

---

## 목적

- cursor/dedupe 상태를 스냅샷으로 보호한다.
- 손상 시 fail-close 복구(`manifest + 필수 파일 검증`)를 수행한다.
- 복구 직전 자동 보호백업(`pre_restore_*`)을 남긴다.

---

## 전제

- 기본 env: `guild_hall/state/gateway/mailbox/state/email_fetch.env`
- 기본 runtime root: `guild_hall/state/gateway/log/mail_fetch`
- 필수 state 파일: `cursor_state.json`, `dedupe_keys.json`
- 백업 보관 개수: `EMAIL_FETCH_STATE_BACKUP_KEEP` (기본 `30`)

---

## 1) 백업 생성

```bash
npm run gateway:fetch:state-backup -- --json
```

옵션:
- `--snapshot-id <id>`: 스냅샷 이름 수동 지정
- `--keep <N>`: 보관 개수 임시 override
- `--env-file <path>`: env 파일 경로 지정

산출물:
- `guild_hall/state/gateway/log/mail_fetch/state_backups/<snapshot_id>/state/*`
- `guild_hall/state/gateway/log/mail_fetch/state_backups/<snapshot_id>/manifest.json`

---

## 2) 복구 실행

특정 스냅샷 복구:

```bash
npm run gateway:fetch:state-restore -- --snapshot <snapshot_id> --json
```

최신 스냅샷 복구:

```bash
npm run gateway:fetch:state-restore -- --latest --json
```

복구 동작:
- snapshot manifest 검증(해시/크기)
- 필수 파일 누락 시 즉시 실패(fail-close)
- 복구 직전 `pre_restore_*` 보호백업 생성
- `tmp -> rename` 방식으로 원자적 교체

---

## 3) 복구 후 확인

```bash
npm run gateway:fetch -- --once --json
```

확인 기준:
- collector 실행 성공(`partial=false` 권장)
- cursor 재시작 이어받기 정상
- 중복 폭증/완전 누락 없음

---

## 장애 대응 체크리스트

1. 복구 실패 시 에러 메시지에서 누락 파일/해시 불일치 항목 확인
2. `guild_hall/state/gateway/log/mail_fetch/state_backups`에서 다른 snapshot으로 재시도
3. 필요 시 최신 `pre_restore_*`로 역복구
4. 결과를 project-local 운영 노트에 기록한다.

---

## 관련 문서

- [email_fetch_ops_monitoring.md](email_fetch_ops_monitoring.md)
- [email_fetch_retention_security.md](../policies/email_fetch_retention_security.md)
- [attachment_policy.md](../spec/attachment_policy.md)
