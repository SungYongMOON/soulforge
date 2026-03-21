# docs/architecture/guild_hall/gateway/mail_fetch

## 목적

- `guild_hall/gateway/mail_fetch/` tracked source capsule 의 운영/관리 문서를 모은다.
- 실제 코드 owner 설명은 `guild_hall/gateway/mail_fetch/README.md` 가 맡고, runbook/policy/spec 정본은 이 경로에서 읽는다.

## 포함 대상

- `runbooks/`
  - 운영 모니터링
  - 상태 복구
- `policies/`
  - 보존/권한/보안 기준
- `spec/`
  - connector contract
  - attachment 정책

## 읽는 순서

1. [`../../../workspace/GATEWAY_MAIL_FETCH_V0.md`](../../../workspace/GATEWAY_MAIL_FETCH_V0.md)
2. [`runbooks/email_fetch_ops_monitoring.md`](runbooks/email_fetch_ops_monitoring.md)
3. [`runbooks/email_fetch_state_recovery.md`](runbooks/email_fetch_state_recovery.md)
4. [`policies/email_fetch_retention_security.md`](policies/email_fetch_retention_security.md)
5. [`spec/connector_contract.md`](spec/connector_contract.md)
6. [`spec/attachment_policy.md`](spec/attachment_policy.md)

## 관련 경로

- [`../../../../../../guild_hall/gateway/mail_fetch/README.md`](../../../../../../guild_hall/gateway/mail_fetch/README.md)
- [`../../../workspace/GATEWAY_MAIL_FETCH_V0.md`](../../../workspace/GATEWAY_MAIL_FETCH_V0.md)
- [`../../../workspace/INSTALLATION_MANUAL_V0.md`](../../../workspace/INSTALLATION_MANUAL_V0.md)
