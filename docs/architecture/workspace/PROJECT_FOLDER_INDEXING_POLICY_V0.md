# Project Folder Indexing Policy v0

## 목적

- 활성 프로젝트 폴더는 자료 정리, 검색, RAG, 지식화 작업 전에 project-local 파일 색인을 갖는다.
- 파일 색인은 "무엇이 어디에 있고, 검색 가능한 텍스트가 무엇인지"를 찾기 위한 작업 표면이다.
- 파일 색인은 source truth 나 확정 지식이 아니다. 지식 승격은 별도 source-supported review 를 거친다.

## 기본 원칙

1. 실제 원문 파일은 프로젝트 worksite 에 둔다.
   - 기본 위치는 `_workspaces/<project_code>/` 이다.
   - owner-approved shared worksite 를 쓰는 프로젝트는 그 공유 폴더를 원문 위치로 둔다.
2. `_workmeta/<project_code>/` 에는 원문 파일을 저장하지 않는다.
   - `_workmeta` 에는 색인 실행 기록, 경로 포인터, 해시, 크기, 상태, 판단 근거만 남긴다.
3. 프로젝트마다 색인을 독립적으로 유지한다.
   - cross-project 검색은 각 프로젝트 색인의 포인터를 모아 보는 rollup 이다.
   - 원문 payload 와 추출 텍스트를 중앙 공유 규칙으로 임의 복사하지 않는다.
4. 색인과 지식화를 분리한다.
   - 색인: 파일 목록, 검색 텍스트, 추출 가능 여부, 암호/오류/중복 상태.
   - 지식화: 사람이 재사용할 주장, 설계 기준, 결정, 수치, 근거 묶음.

## 기본 저장 위치

프로젝트가 SE workspace folder tree 를 쓰는 경우 색인 산출물의 기본 위치는 project-local 관리 폴더 아래다.

```text
020_MGMT/021_자동화설정_운영규칙/file_search_index/<run_id>/
```

프로젝트가 다른 폴더 구조를 쓰는 경우에는 해당 프로젝트의 자동화/관리/운영규칙에 해당하는 project-local 폴더를 쓴다.

`_workmeta/<project_code>/reports/` 아래에는 다음만 남긴다.

- 색인 실행 일시와 범위
- 색인 산출물 위치 포인터
- 파일 수, 종류별 개수, 실패/암호/보류 개수
- 사용한 추출기와 검증 결과
- 재색인이 필요한 이유와 다음 행동

## 최소 색인 산출물

각 프로젝트 색인은 최소한 아래 정보를 갖는다.

| 항목 | 설명 |
| --- | --- |
| `file_search_catalog.csv` 또는 동등 manifest | 현재 경로, 상대 경로, 종류, 크기, 수정 시간, 해시, 추출 상태를 담은 목록 |
| extracted text folder | 검색용 텍스트. 원문 대체물이 아니며 project-local 색인 산출물로 취급한다. |
| extraction status | `ok`, `unsupported`, `encrypted`, `password_needed`, `manual_review`, `error` 같은 파일별 상태 |
| blocked queue | 암호, 손상, 전용 앱 필요, OCR 필요, HWP/HWPX 변환 필요 등 보류 사유 |
| duplicate grouping | 동일 해시, 동일 크기/이름 후보, 버전 후보를 분리한 중복 판단 근거 |
| source pointer | 원문 위치와 이전 import/source 위치가 있으면 경로 포인터로 기록 |

## 파일 생성/다운로드 시

파일을 만들거나 다운로드할 때는 전체 재색인이 아니라 새 파일 또는 변경된 파일만 증분 색인한다.

- agent 가 프로젝트 산출물 파일을 만들면, 파일 저장 후 해당 파일을 catalog 에 등록한다.
- 사용자가 메일, 웹, 메신저, 외장매체 등에서 파일을 받으면, 프로젝트 worksite 에 옮겨 둔 뒤 그 파일만 catalog 에 등록한다.
- 브라우저 `Downloads` 같은 임시 위치는 최종 보관 위치로 보지 않는다. 프로젝트 worksite 에 채택된 뒤 색인한다.
- 다운로드 중인 partial 파일, 변환 중간 파일, 일회성 scratch 파일은 색인하지 않는다.
- 파일명만으로 내용을 단정하지 않고, 가능한 경우 추출 상태와 해시를 함께 남긴다.
- 원문 출처는 허용되는 범위에서 source pointer 로 남기되, secret 값이나 문서 본문을 `_workmeta` 에 복사하지 않는다.
- 생성/다운로드 파일이 암호, 전용 앱, OCR, HWPX 변환 때문에 바로 읽히지 않으면 blocked queue 에 넣는다.

## 매일 새벽 색인 점검

자동화가 설정된 환경에서는 매일 새벽에 색인 누락 여부를 점검할 수 있다. 이 작업은 원문 정리나 지식화가 아니라 "검색 준비 상태"를 유지하기 위한 housekeeping 이다.

- 기본 시간대는 사용자 작업 방해가 적은 local dawn window 로 둔다.
- 먼저 프로젝트 worksite 별로 색인 존재 여부와 freshness 를 확인한다.
- 색인이 없거나 오래된 폴더만 queue 에 넣는다.
- 새 파일만 생긴 경우에는 증분 색인을 우선한다.
- 최초 온보딩, 대량 이동, 폴더 병합 뒤처럼 전체 상태가 불명확한 경우에만 전체 재색인을 queue 에 넣는다.
- 자동 점검은 원본 파일을 이동, 삭제, 이름 변경하지 않는다.
- 자동 점검은 비밀번호 값을 읽거나 암호 해제를 기본 수행하지 않는다. 암호 파일은 blocked queue 또는 owner-approved password workflow 로 넘긴다.
- 큰 폴더는 한 번에 끝내려 하지 않고 시간/파일 수 budget 으로 나누어 다음 새벽 run 에 이어간다.
- 처리 결과는 project-local 색인 산출물과 `_workmeta/<project_code>/reports/` 의 metadata-only 요약에 남긴다.
- 색인할 대상이 없으면 no-op 요약만 남기고 종료한다.

이 정책은 새벽 자동화의 운영 규칙만 정의한다. 실제 Windows Task Scheduler, cron, watcher, service 등록은 별도 구현 또는 owner 승인된 automation workflow 가 필요하다.

## 갱신 트리거

다음 경우에는 해당 프로젝트 폴더 색인을 만들거나 갱신한다.

- 프로젝트를 처음 온보딩할 때
- 흩어진 과거 자료를 대량 이동, 정리, 병합한 뒤
- 프로젝트 산출물 파일을 새로 만들거나 외부 파일을 다운로드해 project-local worksite 에 채택한 뒤
- 메일 첨부, 회의자료, 설계자료, 시험자료를 새로 가져온 뒤
- 사용자가 "어떤 파일에 그 내용이 있지?"처럼 자료 탐색을 요청하기 전
- RAG, NotebookLM, wiki, source packet, 지식화 작업을 시작하기 전
- 암호 해제, HWPX 변환, OCR, 중복 제거 같은 전처리 작업 뒤
- 기존 색인이 오래되었거나 원문 폴더의 파일 수/해시가 달라진 것이 보일 때
- 새벽 자동 점검에서 색인이 없거나 오래된 프로젝트 worksite 로 판정될 때

## 암호와 민감 자료 경계

- 비밀번호 값은 색인, 로그, `_workmeta`, Git, 채팅에 남기지 않는다.
- 암호 후보 파일이 필요한 경우 project-local secret 취급 경로에 두고, agent 는 값이 아니라 경로와 존재 여부만 다룬다.
- 암호 파일, credential, token, cookie, session, `.env` 는 색인 대상에서 제외하거나 `secret_excluded` 로 기록한다.
- 암호로 막힌 문서는 `password_needed` 또는 `manual_review` 로 표시하고, 원문을 수정하지 않는다.

## 형식별 처리 기준

- HWP 원문은 직접 본문 분석하지 않는다. 먼저 owner-approved worksite 에서 HWPX 파생본으로 저장/export 한 뒤 HWPX 를 읽는다.
- PDF, Office, HWPX, 압축파일은 도구별 추출 가능 여부와 오류 상태를 파일별로 남긴다.
- 스캔 PDF, 이미지, 도면, 회로도, PCB 산출물은 추출 텍스트가 비어 있을 수 있으므로 파일 metadata 와 preview/OCR 필요 상태를 함께 남긴다.
- 도면 XML, BOM, CAD export 처럼 구조화 가능한 자료는 별도 파서나 manifest 로 확장할 수 있다.

## 완료 기준

프로젝트 색인은 아래 조건을 만족하면 "검색 준비됨"으로 본다.

- 대상 폴더의 전체 파일 목록이 catalog 에 들어 있다.
- 파일별 추출 상태가 비어 있지 않다.
- 암호/오류/수동확인 파일이 별도 queue 로 분리되어 있다.
- 검색 가능한 텍스트 산출물의 위치가 project-local 로 기록되어 있다.
- `_workmeta/<project_code>/reports/` 에 실행 요약과 산출물 포인터가 남아 있다.
- 색인이 source truth 나 확정 지식으로 승격되지 않았다는 경계가 유지되어 있다.

## 지식화로 넘기는 기준

색인 결과에서 다음 신호가 보이면 별도 지식화 후보로 넘긴다.

- 반복해서 찾게 되는 설계 기준, 시험 조건, 결정 근거
- 수치, 산식, 요구사항, 인터페이스, 결함 원인처럼 다음 프로젝트에도 재사용 가능한 내용
- 같은 주장의 버전 충돌 또는 근거 공백
- owner 판단이 필요한 보류 자료

이때 지식화 후보는 원문을 복사하지 않고 source pointer, hash, evidence note, claim ceiling 으로만 넘긴다.
