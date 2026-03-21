# Attachment Policy - email-fetch P3

> Version: `email.fetch.attachment-policy.v1`
> Updated: 2026-03-05 (P3)

## 기본 정책

1. 첨부 메타는 항상 수집한다.
2. `size <= 30MB`(`31457280`)인 binary 첨부만 기본 다운로드 시도.
3. `size > 30MB`이면 다운로드하지 않고 `reference_attachment`로 저장.
4. 본문 URL은 `body_link`로 분리 저장.
5. 링크 다운로드는 기본 비활성(`EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=false`)이며, 활성 시 allowlist/denylist 정책을 따른다.
6. 위험 확장자(`EMAIL_FETCH_BLOCKED_ATTACHMENT_EXTS`)는 자동 다운로드 금지 + `quarantine` 분류한다.
7. 광고/뉴스레터 성격 메일은 `ads` 분류한다(키워드/헤더/발신 도메인 기준).

## 링크 allowlist (기본)

- `drive.google.com`
- `docs.google.com`
- `onedrive.live.com`
- `*.sharepoint.com`
- `dropbox.com`

## 링크 denylist (옵션)

- `EMAIL_FETCH_DENIED_LINK_HOSTS`에 패턴(csv) 지정 시, allowlist보다 우선하여 다운로드를 차단한다.

## 분류 규칙

- `binary_attachment`: 바이너리 첨부(실제 파일)
- `reference_attachment`: 대용량/다운로드 생략/참조형 첨부
- `body_link`: 본문에서 추출한 URL

## 폴더 라우팅 규칙

이벤트는 `metadata.classification.bucket` 기준으로 저장된다.

- 기본: `guild_hall/state/gateway/mailbox/<workspace>/mail/events/<source>/<YYYY>/<YYYY-MM>.jsonl`
- 광고: `guild_hall/state/gateway/mailbox/<workspace>/ads/events/<source>/<YYYY>/<YYYY-MM>.jsonl`
- 격리: `guild_hall/state/gateway/mailbox/<workspace>/quarantine/events/<source>/<YYYY>/<YYYY-MM>.jsonl`

원본(raw) 저장:

- `guild_hall/state/gateway/mailbox/<workspace>/mail/raw/<source>/<YYYY>/<YYYY-MM>.jsonl`

첨부파일(`local_path`)이 존재할 경우 bucket에 맞게 첨부 파일도 이동한다.

- 광고 첨부: `guild_hall/state/gateway/mailbox/<workspace>/ads/attachments/<source>/<event_id>/...`
- 격리 첨부: `guild_hall/state/gateway/mailbox/<workspace>/quarantine/attachments/<source>/<event_id>/...`

## P3 링크 다운로드 규칙

1. 다운로드 대상:
- `body_link`, `reference_attachment` 중 URL이 있는 항목
2. 허용 조건:
- `EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=true`
- host가 allowlist에 매칭되고 denylist에는 매칭되지 않아야 함
3. 크기 제한:
- `EMAIL_FETCH_LINK_DOWNLOAD_MAX_BYTES` 초과 시 `too_large`로 스킵
3-1. 위험 확장자 제한:
- URL 경로 확장자가 `EMAIL_FETCH_BLOCKED_ATTACHMENT_EXTS`에 포함되면 `blocked_extension`으로 스킵
4. 재시도:
- 최대 `EMAIL_FETCH_LINK_DOWNLOAD_RETRY_MAX` (기본 3회), 백오프 1s/2s/4s
5. 산출물:
- 저장 경로: `guild_hall/state/gateway/mailbox/<workspace>/mail/attachments/<source>/links/<event_id>/...`
- 첨부 metadata에 `link_download` 상태(`downloaded|skipped|failed`) 기록

## 운영 가드레일 (R2 대응)

`EMAIL_FETCH_LINK_DOWNLOAD_ENABLED=true`일 때 아래 정책을 만족하지 않으면 수집기를 시작하지 않는다(fail-fast):

1. allowlist 비어있음 금지
- `EMAIL_FETCH_ALLOWED_LINK_HOSTS`는 1개 이상 유효한 host를 포함해야 한다.

2. 과도한 와일드카드 금지
- `*`, `*.*`, `*.com`, `*.net`, `*.org`, `*.io`, `*.co`, `*.kr`, `*.co.kr`, `*.biz` 패턴 금지

3. allowlist/denylist 중복 금지
- 동일 host가 `EMAIL_FETCH_ALLOWED_LINK_HOSTS`와 `EMAIL_FETCH_DENIED_LINK_HOSTS`에 동시에 존재하면 실패

4. 권장 운영
- 실데이터 검증은 운영 런타임이 아닌 격리 런타임(`/tmp/...`)에서 먼저 수행
- 검증 후 운영 `.env`에 승격

## 광고/격리 분류 기준

1. 광고(`ads`)
- 제목/본문에 `EMAIL_FETCH_AD_KEYWORDS` 키워드 포함
- 헤더에 `List-Unsubscribe` 존재 또는 `Precedence: bulk|junk|list`
- 발신 도메인이 `EMAIL_FETCH_AD_SENDER_DOMAINS` 패턴과 일치

2. 격리(`quarantine`)
- 첨부 파일 확장자가 `EMAIL_FETCH_BLOCKED_ATTACHMENT_EXTS`와 일치
- 광고 여부와 무관하게 `quarantine`가 우선한다

## 실패 처리

- 다운로드 실패 시 이벤트 전체 실패로 처리하지 않고 `ingest_status=partial`로 기록.
- 첨부별 실패/스킵 사유는 attachment metadata(`link_download`)에 남긴다.
- 인증 필요 링크(예: `http 401/403`)는 `skipped(auth_required)`로 기록되며, 도메인 허용과 별도로 인증 정책을 검토해야 한다.
