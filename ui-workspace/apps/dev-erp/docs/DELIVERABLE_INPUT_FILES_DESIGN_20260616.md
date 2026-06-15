# 산출물 입력파일 — 폴더 규약 + 입력파일 장부 설계 (2026-06-16)

> owner 요구: 산출물 만들려면 파일을 넣는 기능이 필요. 실제 input 폴더가 있지만
> **산출물 종류별로 input 하위폴더를 다르게** 만들고, 그 폴더에 **ERP/메일/Codex** 어디서든
> 파일을 넣되, **할일_장부처럼 서로 쓰고 읽기**(포인터·장부 동기). 작업자: claude_opus-4-8.
> 설계우선(owner 지시). 장부 형식 정본 = Codex 소유 → 본 문서는 ERP 측 규약 + v0 라우팅.

## 1. SE 폴더 규약 (정본: se_foldertree_generate)

- 폴더 순서 = 업무 순서. 산출물 폴더명 = `한글명(약어)_상태`(예 `체계요구사항명세서(SSRS)_D`).
- 산출물 폴더 내 표준 박스: **In(입력) / Work(작업·초안) / Out(산출·최종) / Review / Action / Quality**.
  - 완료판정 = Out. dev-erp 의 `out_pointer` = `_workspaces/<과제>/<경로>/03_Out`(상대, 원문 미저장).
- 게이트 코드(30 SRR, 60 SFR, 90 PDR …) 아래 task 번호(31·32 …)가 실제 산출물. (#B 추가 등록과 일치)

## 2. 입력 포인터 (ERP)

- `core_deliverable.in_pointer` 신설 — `out_pointer` 와 대칭. `_workspaces/<과제>/<경로>/02_Input`(상대).
- 절대경로 금지(헌장). 원문 미저장 — ERP 는 **경로 포인터만** 보관.

## 3. 산출물 종류별 입력 하위폴더 (owner 요구 핵심)

- In 폴더 아래에 **산출물 종류별로 다른 입력 하위폴더**를 둔다(필요 입력이 종류마다 다름).
- 종류 키 = `artifact_type`(bom|gerber|schematic|pcb|block_diagram|digikey|report|test|doc …) 또는 산출물 분류.
- 기본 매핑(초안, owner/Codex 가 도메인에 맞게 조정 — `data/input_subfolder_map.json`):

| 종류 | In 하위폴더(초안) |
|---|---|
| schematic(회로도) | 참고규격 · 이전버전 · 부품정보 |
| pcb | 회로도 · 기구도면 · 적층조건 |
| bom | 회로도 · 부품선정 · 단가표 |
| gerber | pcb데이터 · 제작사양 |
| report/doc | 근거자료 · 인용규격 · 이전보고서 |
| test | 시험요구 · 시험표준 · 대상사양 |
| (기타) | 참고자료 |

- ERP 는 이 매핑을 **읽어 폴더 경로를 제안/표시**만 한다. 실제 폴더 생성은 se_foldertree_generate(Codex) 소유.

## 4. 입력파일 장부 (입력파일_장부.csv — 서로 쓰고 읽기)

할일_장부와 같은 패턴: ERP write-through + 폴링 read. 포인터·메타만(원문/첨부 미저장).

스키마(가칭 `soulforge.deliverable_input_ledger.private.v0`):

| 컬럼 | 뜻 |
|---|---|
| 입력키 | 안정 id(`<산출물id>:<해시 또는 파일명키>`) |
| 스키마버전 | soulforge.deliverable_input_ledger.private.v0 |
| 기록일 | 등록 시각 |
| 프로젝트코드 | P##-### |
| 산출물참조 | core_deliverable.id |
| 게이트 | stage_code |
| 입력하위폴더 | In 아래 분류(§3) |
| 파일명 | 표시용 파일명(메타) |
| 파일포인터 | `_workspaces/<과제>/<경로>/02_Input/<하위>/<파일>`(상대·원문미저장) |
| 출처 | erp \| mail \| codex |
| 해시 | sha256(있으면) |
| 크기 | 바이트(있으면) |
| 상태 | needed(필요) \| received(수집됨) \| used(반영됨) |
| 관련메일이력키 | mail 출처면 mailcsv:<이력키> |
| 비고 | |
| 원문복사여부 | 아니오 고정 |

## 5. 파일 투입 경로 (3-루트, 한 장부)

- **ERP**: 입력 파일 **포인터 등록/조회**(어느 파일이 어느 In 하위에 있나). 상태 needed→received 토글.
  실제 파일 **업로드/서빙**(ERP가 바이트를 02_Input 에 쓰거나 내려주기)은 §7 경계로 **후속 슬라이스**.
- **메일**: 첨부를 해당 산출물 In 하위폴더로 라우팅 + 장부 기록(출처=mail). → Codex 메일 파이프라인 계약.
- **Codex**: 자동화로 파일 배치 + 장부 기록(출처=codex). → 계약.
- 세 경로 모두 **같은 입력파일_장부**에 쓰고, ERP/Codex 가 그 장부를 읽어 일관 표시(서로 쓰고 읽기).

## 6. ERP 구현 단계 (이 설계의 빌드 순서)

1. **데이터 층**(이번): `in_pointer` 컬럼 + `deliverable_input` 테이블 + 등록/조회 store 메서드 +
   종류→하위폴더 매핑 config + 스캐너 in_pointer 도출 + 테스트. (파일 IO 없음 — 포인터만)
2. **장부 동기**: 입력파일_장부.csv write-through + 폴링 read(autosync 패턴 재사용).
3. **UI**: 산출물별 입력파일 패널(필요/수집 상태, 하위폴더, 포인터 복사, 등록).
4. **파일 IO**(별도·신중): 업로드/다운로드 — §7 검토 통과 후.

## 7. 경계 (불변)

- 원문/첨부 미저장 — ERP 는 포인터·메타만. 절대경로 금지(상대만).
- secret 미열람(자격·토큰 파일 안 엶).
- **파일 업로드/서빙**은 경로탈출(`..`)·심볼릭 탈출·LAN 노출·다운로드 권한 검토 후에만. 화이트리스트 경로(=등록된 in_pointer 하위)로 제한.
- 장부 형식 정본 = Codex 소유. ERP 는 소비/검증/연결. v0 스키마는 후보로 라우팅.

## 8. Codex 라우팅
`_workmeta/system/dev_worker_candidate_queue/dev_erp_deliverable_input_files_v0.yaml`:
입력파일_장부 v0 스키마 정식화 + 메일/Codex 파일 라우팅 계약 + se_foldertree In 하위폴더 생성.

---
관련: [LEDGER_AUDIT_20260616.md](LEDGER_AUDIT_20260616.md) · se_foldertree_generate(정본) · 할일_장부(autosync 패턴)
