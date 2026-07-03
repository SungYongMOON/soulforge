# Chat Attachment Storage v0 — 대화 첨부 파일 저장 규칙

- 지위: workspace 데이터 계약 (owner 결정 2026-07-03 — "대화 첨부 저장 위치를 폴더까지 규칙화")
- 적용 대상: dev-erp Codex 할일 대화창의 파일/이미지 첨부. (ERP 챗봇은 첨부 없음 —
  매뉴얼 검색기라 파일을 읽지 않는 역할 구분, DESIGN.md 참조)

## 원칙 (기존 계약에서 도출)

1. **원문 파일은 `_workspaces`** — `_workmeta`/public repo 에는 payload 를 두지 않는다 (AGENTS.md).
2. **과제 자료는 과제 워크스페이스에** — 할일은 과제에 속하므로 그 대화에 첨부된 파일도
   `_workspaces/<과제코드>/` 가 정위치다. 도구 전용 버킷에 과제 자료를 묻지 않는다.
3. **폴더명은 한글·의미 중심, ID/시각/해시는 manifest 로** (SE_WORKSPACE_FOLDER_NAMING_CONVENTION_V0).
4. **모델 API 로 payload 미전송** — 파일은 로컬 저장 + 메시지에 경로 참조만. Codex 가
   read-only 로 직접 읽는다.

## 저장 위치 결정표

| 상황 | 저장 위치 |
| --- | --- |
| 할일의 과제 워크스페이스가 로컬에 존재 | `_workspaces/<과제코드>/대화첨부/<할일명 축약>/<원본파일명>` |
| 과제 폴더 미존재(정션 미마운트 PC 등) | 폴백: `_workspaces/system/dev-erp/codex-task-attachments/<할일ID>/` (legacy 루트 유지) |
| 미분류/일반 업무 할일 | 동일 규칙 — `_workspaces/P00-000_INBOX/대화첨부/…`, `_workspaces/general_work/대화첨부/…` (예약 코드도 과제코드로 취급) |

- `대화첨부/` 는 SE 단계 번호(000~240)와 충돌하지 않는 **비번호 유틸리티 폴더**다
  (선례: analysis_plots 등). SE 템플릿 내부 구조를 변경하지 않는다.

## 명명 규칙

- **할일 폴더명** = 할일 제목의 Windows-안전 축약(40자, 금지문자 제거). 같은 제목의 다른
  할일과 충돌할 때만 끝에 `_<짧은할일ID>` 를 붙인다 — Codex 스레드 제목 규칙
  (`[과제번호] 할일명`, 중복 시만 짧은ID)과 같은 owner 승인 선례를 따른다.
- **파일명** = 업로드 원본명 유지(안전화만). 같은 이름이 이미 있으면 `이름-2.ext` 순번.
  timestamp/uuid 를 파일명 앞에 붙이지 않는다(사람 중심) — 업로드 시각은 manifest 에.

## Manifest (기계 매핑 — 폴더당 1개)

각 할일 폴더에 `첨부_manifest.json`:

```json
{
  "schema": "dev_erp.chat_attachment_manifest.v0",
  "item_id": "mailtask:…",
  "project_id": "P26-014",
  "title": "할일 제목 원문",
  "files": [
    { "name": "저장된파일명.pdf", "original": "업로드원본명.pdf",
      "size": 12345, "sha256": "…", "at": "ISO8601", "actor": "계정" }
  ]
}
```

- 폴더명↔할일 바인딩의 정본은 폴더명이 아니라 manifest 의 `item_id` 다(제목 변경에 안전).
- `_workmeta` 에는 payload 를 복사하지 않는다 — 경로·해시 추적은 이 manifest 와
  event_log(kind=codex_task_file_attach/image_attach, to=경로)가 담당한다.

## 경계·보존

- 허용 확장자 allowlist·크기 상한은 dev-erp capabilities 가 정본(실행형 차단, 이미지 8MB /
  파일 25MB 기본). secret 파일(.env·token 등)은 첨부 대상이 아니다.
- 첨부는 "대화 참조용 사본"일 수 있다 — 산출물의 정본은 과제 폴더의 원 위치이며,
  보존/삭제는 과제 워크스페이스 규칙을 따른다. 대량 자료(할일당 20파일 초과 권장선)는
  첨부 대신 과제 폴더에 직접 두고 경로만 대화에 적는 것을 권장.
- OneDrive 정션 아래이므로 과제 첨부는 PC 간 자동 동기화된다(다른 PC 의 Codex 도 경로 접근 가능).

## Legacy

- 2026-07-03 이전 첨부는 `_workspaces/system/dev-erp/codex-task-attachments/<할일ID>/` 에
  있다. **이동하지 않는다**(event_log 의 경로 포인터 보존). 신규 첨부만 본 규칙을 따른다.
- 같은 legacy 루트는 폴백 저장소로 계속 사용된다(위 결정표).

## 구현 표면

- 서버: dev-erp `server.mjs` 첨부 엔드포인트가 이 규칙대로 경로를 결정한다.
  테스트 격리는 `DEV_ERP_ATTACHMENT_WORKSPACES_ROOT`(기본 `<repo>/_workspaces`)로 한다.
- 검증: core.test 의 첨부 케이스(과제 경로/폴백/manifest/sha256) + fixture 브라우저 스모크.
