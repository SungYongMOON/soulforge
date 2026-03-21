# Connector Contract - email-fetch P1

> Version: `email.fetch.contract.v1`
> Updated: 2026-03-05 (P2)

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

## 구현 범위 (P2)

- `gmail`: 실구현 (list/get/attachments.get + refresh_token auto-refresh)
- `hiworks`: 실구현 (POP3 UIDL/retr + MIME 파싱 + 첨부 다운로드 정책)
- `o365`: stub (disabled placeholder)
