# MAILBOX_CONCRETE_CONTRACT_V0

이 문서는 Phase 1 mailbox concrete split의 current-default v0 workspace contract draft 다.

## 추천 tracked 필드

Tracked `mailbox_binding.yaml` boundary 는 아래 여섯 필드만 유지한다.

- `mailbox_id`
- `kind`
- `status`
- `profile_ref`
- `routing_mode`
- `notes`

Tracked binding sample:

```yaml
mailbox_id: hiworks_company_mail
kind: mailbox_binding
status: draft
profile_ref: hiworks_pop3_uidl_company_v1
routing_mode: pop3_uidl_poll
notes: local-only sample mailbox binding for Phase 1 dogfood
```

## 추천 local-only 필드

Local-only concrete profile 은 아래 필드만 둔다.

- `provider`
- `protocol`
- `security_mode`
- `port_default`
- `auth_type`
- `workspace_binding`
- `cursor_strategy`
- `cursor_seen_window`
- `attachment_max_bytes`

Local-only concrete profile sample:

```yaml
# host, username, and password are placeholder or masked references and are not stored here as live values.
provider: hiworks
protocol: pop3
security_mode: SSL_TLS
port_default: 995
auth_type: USER_PASS
workspace_binding: company
cursor_strategy: UIDL
cursor_seen_window: company_policy_default
attachment_max_bytes: company_policy_default
```

## 하지 않을 것

- tracked `mailbox_binding.yaml` 에 host, username, password, token, live endpoint 값을 넣지 않는다.
- local-only sample 에 real cursor state, fetched UIDL list, runtime path, live secret 를 넣지 않는다.
- tracked boundary 를 `mailbox_id / kind / status / profile_ref / routing_mode / notes` 밖으로 넓히지 않는다.

## 왜 이 분리가 필요한가

- tracked binding 은 public-safe routing intent 만 보여주고 concrete POP3 설정은 local-only profile 로 내린다.
- provider, protocol, SSL/TLS, port `995`, USER_PASS, workspace/company binding, UIDL with seen window, attachment policy 같은 구현 개념은 local-only 에서만 잠근다.
- 이렇게 나누면 owner-local planning 은 유지하면서도 secret, runtime state, live execution surface 가 tracked contract 로 새지 않는다.
