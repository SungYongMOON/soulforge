# Chat Attachment Storage v1 — ERP Codex 대화 첨부 저장 계약

- 지위: workspace 데이터 계약
- 적용 대상: dev-ERP의 item-bound Codex 대화 파일과 이미지
- v1 결정: 2026-07-10, ERP runtime 껍데기와 Soulforge 실데이터 owner 분리

## 원칙

1. 첨부 payload는 public repo, `_workmeta`, ERP runtime checkout, SQLite DB에 두지 않는다.
2. 신규 첨부는 Soulforge가 소유한 `_workspaces/system/dev-erp/codex-task-attachments/`의
   서비스 전용 영역에만 저장한다. 팀원이 직접 쓰는 과제 폴더는 업로드 저장소로 쓰지 않는다.
3. 브라우저와 event log에는 item-bound opaque attachment ID, 원본 표시명, 크기, 종류만
   반환한다. host path, 저장명, SHA-256은 서버 내부 manifest에만 둔다.
4. Codex worker는 인증된 item과 workspace 권한을 다시 확인한 뒤 manifest의 크기·hash·
   realpath를 검증하고 파일을 읽는다. 브라우저가 제출한 경로는 사용하지 않는다.
5. `.hwp`는 직접 읽지 않는다. owner-approved worksite에서 HWPX로 전처리한 파생본만
   새 첨부로 등록한다.

## 저장 구조

```text
_workspaces/system/dev-erp/codex-task-attachments/
  <안전화된-item-key>/
    codex-attachment-manifest.v1.json
    att_<opaque-id>.pdf
    att_<opaque-id>.png
```

- 실제 owner root는 `DEV_ERP_BACKEND_ROOT`의 `_workspaces`에서 파생하거나
  `DEV_ERP_CODEX_TASK_ATTACHMENT_ROOT`로 명시한다.
- 운영에서는 root가 Soulforge `_workspaces/system/dev-erp` 안에 있다는 증거와 별도
  worker ACL을 release audit가 확인해야 한다.
- item directory, manifest, payload는 symlink/junction/hardlink 및 realpath 이탈을
  거부한다. payload는 exclusive create + fsync 후 manifest를 원자 교체한다.

## Manifest

manifest schema는 `dev_erp.codex_attachment_manifest.v1`이다. 각 record는 다음 내부
필드를 가진다.

```json
{
  "attachment_id": "att_opaque",
  "item_id": "item-key",
  "name": "사람에게 보이는 원본명.pdf",
  "stored_name": "att_opaque.pdf",
  "size": 12345,
  "sha256": "64-hex",
  "type": "localFile"
}
```

`stored_name`과 `sha256`은 public API/event에 노출하지 않는다. manifest의 item ID와
요청 item이 다르거나, 파일 크기/hash/realpath/nlink가 다르면 읽지 않는다.

## 상한과 보존

- 이미지 기본 상한 8 MiB, 일반 파일 25 MiB, item당 32개, 합계 100 MiB다.
- 확장자 allowlist 밖 파일과 Windows 예약명, 제어문자, 실행형 파일, secret 파일은
  거부한다.
- 첨부와 외부화된 대화 payload는 SQLite pointer와 같은 backup generation으로 묶고,
  복원 후 DB pointer→manifest→payload hash를 전수 검증해야 한다.
- `_workmeta`에는 원문을 복사하지 않고 backup generation/ref/hash와 검증 결과만 남긴다.

## Legacy

v0 과제별 `대화첨부/<할일명>/<원본파일명>` 및 runtime-local legacy bucket은 신규
쓰기 대상으로 사용하지 않는다. 배포 전 owner-approved migration이 각 파일을 v1
opaque record로 복사·검증하고 DB/event pointer를 전환하거나, 해당 legacy 대화를
명시적으로 retired 처리해야 한다. 자동 추측 이동은 금지한다.

## 구현·검증 표면

- 구현: `ui-workspace/apps/dev-erp/server.mjs`,
  `src/codex_attachment_registry.mjs`
- 정본 테스트: `test/codex_attachment_registry.test.mjs`, item 인증/업로드 통합 테스트,
  payload 포함 backup/restore 검증
- event `codex_task_file_attach` / `codex_task_image_attach`의 `to_val`은 opaque ID이며
  경로가 아니다.
