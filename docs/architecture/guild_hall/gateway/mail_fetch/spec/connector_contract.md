# Connector Contract - email-fetch P1

> Version: `email.fetch.contract.v1`
> Updated: 2026-07-21

## 목적

수집 소스별 구현체(Gmail/Hiworks/O365)가 동일 인터페이스로 이벤트를 반환하도록 고정한다.
P2에서는 Gmail + Hiworks를 실구현하고 O365는 인터페이스 호환만 보장한다.

## 프로토콜

```python
fetch_since(cursor: dict | None, limit: int) -> FetchResult
```

### 입력

- `cursor`: 이전 실행 상태. 없으면 최초 수집으로 처리.
- `limit`: 최대 메시지 수집 개수 (`1..500` 권장).

### 출력 (`FetchResult`)

- `events: list[EmailEvent]`
- `next_cursor: dict | None`
- `partial: bool` (부분 성공 여부)
- `errors: list[ConnectorError]`

## 에러 모델 (`ConnectorError`)

- `source`: `gmail|hiworks|o365`
- `code`: `http_401`, `rate_limit`, `timeout`, `parse_error` 등
- `message`: 운영자/로그용 설명
- `retryable`: 재시도 가능 여부
- `detail`: 원본 상세(옵션)

## 실행/복구 규칙

1. 소스 단위 격리: 한 소스 실패가 전체 실행 실패로 전파되지 않는다.
2. 재시도: 최대 3회 (1s, 2s, 4s).
3. 커서 커밋: sink 저장 성공한 이벤트 기준으로만 `next_cursor`를 반영한다.
4. 중복 제거는 connector가 아닌 pipeline(dedupe)에서 처리한다.

## Hiworks RFC822 source custody

- Hiworks connector는 POP3 `RETR`로 재구성한 RFC822 bytes를 MIME 파싱보다 먼저
  configured mailbox custody root에 기록한다.
- 저장 경로는
  `hiworks/sha256/<sha256-prefix>/<sha256>.eml`이며 provider UIDL, 제목,
  발신자, 첨부명은 경로에 사용하지 않는다.
- 저장은 temporary file의 byte identity를 검증한 뒤 atomic no-overwrite
  publication으로 수행한다. 같은 bytes의 replay는 기존 파일을 검증하고
  재사용하며, 같은 hash path의 bytes가 다르면 fail closed 한다.
- symlink, junction, reparse point, root escape를 통과하지 않는다.
- normalized event의 `raw.source_custody`에는 `sha256`, `size`,
  custody-root-relative `storage_ref`, `media_type=message/rfc822`만 연결하고
  RFC822 bytes 자체는 JSONL에 넣지 않는다.
- `ingress_only`는 attachment extraction과 downstream projection을 끄지만 이
  source custody write를 끄지 않는다. `dry_run`은 custody root를 전달하지 않아
  filesystem write를 수행하지 않는다.

### Offline custody link receipt

- standalone CLI owner는
  `guild_hall/gateway/mail_fetch/collector/storage/custody_link_index.py`다.
  입력 shape는 repeatable `--event-root`, single `--eml-root`, single `--output`이며
  CLI가 private locator를 추정하지 않는다.
- `--eml-root`의 accepted file shape는 정확히
  `hiworks/sha256/<2-lowercase-hex-prefix>/<64-lowercase-hex-sha256>.eml`이다.
  임의 segment나 filename/content hash 불일치는 거부한다. 각 EML의 hash와 header는
  한 retained descriptor에서 읽고 pre/post identity와 size/mtime 안정성을 확인한다.
- output은 immutable JSONL receipt이며 `event_id`, provider-id SHA-256, EML
  SHA-256/size, canonical custody-root-relative `storage_ref`, match method,
  `verified`만 포함한다. 제목, 주소, body, attachment payload, raw provider id는
  output과 operator summary에 넣지 않는다.
- output owner는 caller가 지정한 private mailbox runtime/custody evidence surface다.
  public/tracked source, publication packet, raw RFC822 owner로 승격하거나 자동
  복사하지 않는다.

## 구현 범위 (P2)

- `gmail`: 실구현 (list/get/attachments.get + refresh_token auto-refresh)
- `hiworks`: 실구현 (POP3 UIDL/retr + immutable RFC822 custody + MIME 파싱 + 첨부 다운로드 정책)
- `o365`: stub (disabled placeholder)
