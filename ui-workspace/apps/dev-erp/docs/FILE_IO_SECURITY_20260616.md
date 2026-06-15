# 산출물 입력파일 업/다운로드 — 보안 설계 (2026-06-16)

> owner 요구 #C-ⓒ: ERP 를 통해 산출물 입력 폴더(01_In)에 파일을 넣고/받는다.
> 파일 IO 는 보안 민감 → path-safety 우선 설계 + 적대적 검토 후 구현. 작업자: claude_opus-4-8.

## 1. 위협 모델

- 경로탈출(`../`), 절대경로/드라이브/UNC, 백슬래시 분리자 혼동, 심볼릭 링크 탈출(TOCTOU 포함),
  널/제어문자, 유니코드 정규화, content-disposition 헤더 인젝션, 임의 경로 read/write, 메모리 남용.
- 목표: 어떤 입력으로도 `<ROOT>/_workspaces` **밖을 읽거나**, 산출물 `in_pointer`(01_In) **밖에 쓰지 못하게**.

## 2. 통제 (src/filevault.mjs)

- **기본 OFF**: 업/다운로드 엔드포인트는 `DEV_ERP_FILEIO=1`(또는 `--fileio`)일 때만 활성.
- **상대 포인터 검증**(`validateRelPointer`): 절대/드라이브/UNC/루트/백슬래시/널/제어 거부 + 세그먼트에
  `''`/`.`/`..` 금지 + 첫 세그먼트 `_workspaces` + 최소 깊이 2.
- **세그먼트 검증**(`safeSegment`): 폴더명·파일명에 분리자(`/`,`\`)·`.`·`..`·제어 금지.
- **다운로드**(`safeWorkspacePath`): ① lexical 봉쇄(_workspaces 아래) ② 존재 확인 ③ **realpath 봉쇄**
  (realpath 가 과제 심볼릭 `_workspaces/<code>` 의 realpath 아래여야 — 심볼릭 탈출 차단). 정상 OneDrive
  심볼릭 과제는 허용(realBase=심볼릭 타깃).
- **업로드**(`safeUploadTarget`+`commitUpload`): base(01_In) 검증 → subfolder/filename 세그먼트 검증 →
  lexical 봉쇄 → **mkdir 후 realpath 재확인**(미리 심어둔 심볼릭 탈출 TOCTOU 차단, 쓰기 전) → atomic temp+rename.
- **다운로드 화이트리스트**: 등록된 `deliverable_input.pointer` 만 서빙(임의 경로 입력 불가). 더해 쓰기
  경계(`registerDeliverableInput`/`addDeliverable`)에서 traversal/백슬래시/제어 포인터 **저장 자체를 차단**.
- **헤더 안전**: content-disposition 파일명은 `encodeURIComponent`(CRLF 인젝션 차단), content-type `octet-stream`.
- **상한**: 업로드 바이트는 수신 중 `DEV_ERP_UPLOAD_MAX`(기본 50MB) 초과 시 즉시 413(메모리 남용 방지).

## 3. 적대적 검토 결과 (2026-06-16)

독립 감사(서브에이전트)로 9개 벡터 전수 추적:
- **판정: _workspaces 밖 read / in_pointer 밖 write 익스플로잇 없음.** traversal·절대·분리자·심볼릭
  TOCTOU·널·유니코드·CRLF 전부 차단(이중 lexical+realpath 게이트, mkdir 후·write 전 realpath 순서).
- **수정한 major(잠재)**: 쓰기 경계에서 `..`/백슬래시/제어 포인터 저장을 막아 DB 가 불안전 경로를 보관하지
  않도록 강화(이전엔 절대만 차단, serve-time 재검증에만 의존 — fragile defense-in-depth였음).
- **minor(주석)**: `commitUpload` 의 mkdir 가 realpath 검사보다 앞 — 단일 subfolder 라 내용 탈출 없음
  (mkdir 는 기존 심볼릭에 no-op, 그 후 realpath 가 거부). 빈 디렉터리 부수효과만, 내용 미기록.

## 4. 의존 / 남은 것

- 업로드는 산출물 `in_pointer`(01_In 상대) 가 있어야 한다. 스캐너(scan_se_foldertree)가 `01_In` 도출,
  수동 산출물은 `addDeliverable(in_pointer)` 로 설정. 실제 폴더는 se_foldertree 생성/OneDrive 동기 전제.
- 다중 사용자: 현재 OS 파일 권한 + 동기 캐시 위임. 계정별 업로드 권한(RBAC)·바이러스 스캔은 후속.
- UI 업로드/다운로드 버튼은 후속(엔드포인트·보안은 준비됨).

## 5. 엔드포인트

| 메서드 | 경로 | 비고 |
|---|---|---|
| GET | `/api/deliverables/inputs/file?id=<입력키>` | 등록 입력 다운로드(화이트리스트+봉쇄), 기본 OFF |
| POST | `/api/deliverables/inputs/upload?deliverable=&subfolder=&filename=` | body=바이트, 01_In 하위 기록+장부 등록, 기본 OFF |

---
관련: [DELIVERABLE_INPUT_FILES_DESIGN_20260616.md](DELIVERABLE_INPUT_FILES_DESIGN_20260616.md) · src/filevault.mjs · FILEVAULT 테스트
