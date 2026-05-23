# HWP Normalization v0

## 목적

이 문서는 Soulforge 에서 HWP 원문을 다루는 전사 기본 순서를 고정한다.

핵심 규칙은 단순하다. **HWP 원문은 직접 본문 분석하지 않고, 먼저 HWPX 로 정규화한 뒤 HWPX 파생본만 읽는다.**

## 적용 범위

- SE 참조 프로젝트
- 공식 기준팩 수집
- 템플릿/양식/항목 추출
- stage artifact scan
- sourcebound knowledge packet
- 문서 초안 생성 전 참고자료 조사

HWP 가 private reference, official source, working copy, final copy, attachment, archive extract 중 어디에서 왔든 본문을 읽기 전에 이 절차를 거친다.

## 저장 경계

- HWP 원문, HWPX 파생본, PDF/text 보조 export 는 `_workspaces/<project_code>/...`, `_workspaces/system/...`, 또는 owner-approved shared worksite 에 둔다.
- `_workmeta` 에는 원문 파일을 저장하지 않는다.
- `_workmeta` 에 남기는 것은 경로, 크기, 해시, 출처 메모, 변환 상태, 차단 사유, 추출 요약, 대조 결과뿐이다.
- NAS, 공유 폴더, 원본 source pack 은 read-only 원본으로 취급한다. 변환은 workspace-local 사본 또는 승인된 shared worksite 작업본에서만 한다.

## 표준 폴더 모양

프로젝트 소유 작업:

```text
_workspaces/<project_code>/reference_payloads/hwp_normalization/<batch_id>/
├── source_copies/
├── exports/
├── derived_text/
└── review_outputs/

_workmeta/<project_code>/runs/<run_id>/hwp_normalization/
├── inventory.yaml
├── conversion_queue.yaml
├── export_manifest.yaml
├── extraction_status.yaml
└── comparison_summary.yaml
```

프로젝트가 없는 reusable/system 작업:

```text
_workspaces/system/reference_payloads/hwp_normalization/<batch_id>/
_workmeta/system/runs/<run_id>/hwp_normalization/
```

## 처리 순서

1. HWP 파일을 발견하면 본문을 읽지 않고 inventory 에 등록한다.
2. 원본 위치, workspace 작업 위치, 크기, 해시, 출처 메모를 기록한다.
3. 원본을 직접 수정하지 않고 workspace-local 사본 또는 owner-approved worksite 작업본을 준비한다.
4. HWP 를 HWPX 로 저장/export 한다.
5. 암호가 필요하면 agent 는 암호를 입력하거나 기록하지 않고, owner 가 한컴 GUI 에서 직접 입력한다.
6. HWPX export 가 생기면 export manifest 에 경로, 크기, 해시, 생성 방식을 기록한다.
7. 본문/양식/항목 추출은 HWPX 파생본에서만 수행한다.
8. PDF/text export 는 보조 증거로 둘 수 있지만, 기본 읽기 대상은 HWPX 다.
9. 추출 결과는 `_workspaces` 에 derived text 로 두고, `_workmeta` 에는 요약과 대조 결과만 둔다.
10. 열린 HWP 창은 export/확인 후 닫는다.

## 상태값

| 상태 | 의미 |
| --- | --- |
| `discovered` | HWP 존재만 확인했다. |
| `queued_for_normalization` | HWPX 변환 큐에 올렸다. |
| `workspace_copy_ready` | workspace-local 사본 또는 승인된 작업본이 준비됐다. |
| `owner_secret_required` | 암호 입력이 필요하며 owner 직접 입력 대기다. |
| `converted_hwpx_ready` | HWPX 파생본이 준비됐다. |
| `extracted_from_hwpx` | HWPX 에서 본문/항목 추출을 완료했다. |
| `blocked_conversion` | 변환 도구, 암호, 손상, DRM, UI 문제 등으로 HWPX 변환이 막혔다. |
| `blocked_extraction` | HWPX 는 있으나 파서/구조 문제로 추출이 막혔다. |

## 금지 사항

- HWP 원문 본문 직접 추출
- NAS 또는 source 원본 직접 수정
- 암호를 명령어, 스크립트, 환경 변수, 로그, YAML, JSON, 채팅 요약에 기록
- `_workmeta` 에 HWP/HWPX/PDF/text 원문 또는 파생 원문 저장
- HWPX 정규화 전 결과를 공식 항목 대조나 초안 생성의 본문 근거로 사용

## 주장 한계

HWPX 변환 전에는 HWP 파일에 대해 다음까지만 말할 수 있다.

- 파일이 존재한다.
- 경로, 크기, 해시, 확장자, container/magic 상태를 확인했다.
- 변환 또는 암호 입력이 필요하다.

HWPX 변환 후에도 P25 같은 예시 프로젝트는 reference example 이며, 공식 정본/승인본/최신본/합격 근거가 되려면 별도의 공식 source 또는 owner-approved 문서관리 증거가 필요하다.
