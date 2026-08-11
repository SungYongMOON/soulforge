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

## 역할 경계

- 이 문서는 **HWP container 를 HWPX container 로 변환하는 정규화 전처리**를 소유한다.
- `new-hwpx-master-v5-1-20260720` 같은 HWPX 편집 스킬은 정규화가 끝난 HWPX의 ZIP/XML 구조 분석, 템플릿 보존 편집, 재패키징, 구조검사를 소유한다.
- HWPX 편집 스킬을 HWP 원문 Open/SaveAs 수단으로 해석하지 않는다. 반대로 HWP Automation 변환 성공은 HWPX 본문 의미·양식·시각 품질을 승인하지 않는다.

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

## 공식 근거와 확인된 로컬 바인딩

한컴 공식 진입점은 [`developer.hancom.com/hwpautomation`](https://developer.hancom.com/hwpautomation) 이다. 이 페이지가 직접 연결하는 공식 자료를 사용한다.

- [`HwpAutomation_2504.pdf`](https://github.com/hancom-io/devcenter-archive/raw/main/hwp-automation/HwpAutomation_2504.pdf)
  - PDF p.13-14: `Open(BSTR path, BSTR format, BSTR arg)`와 `suspendpassword`, `forceopen`, `versionwarning` 옵션
  - PDF p.29: `RegisterModule(Method)`과 보안 모듈 문서 연결
  - PDF p.48-50: 지정 경로·형식·옵션으로 저장하는 `SaveAs` 항목
  - PDF p.59: `IXHwpWindow.Visible` 속성
- [`보안모듈(Automation).zip`](https://github.com/hancom-io/devcenter-archive/raw/main/hwp-automation/%EB%B3%B4%EC%95%88%EB%AA%A8%EB%93%88(Automation).zip)
  - 공식 sample DLL: `FilePathCheckerModuleExample.dll`
  - 공식 sample registry value name: `FilePathCheckerModuleExample`
  - registry 위치: `HKCU\Software\HNC\HwpAutomation\Modules`
  - export 함수: `IsAccessiblePath`

2026-08-11 확인 기준 공식 ZIP SHA-256은 `5D87292EFAFD7311CBA6D35E4B416AC8BFA78608A64DDE1656C8CB827B051BD8`이고, 그 안의 sample DLL을 이름만 `FilePathCheckerModule.dll`로 둔 이 PC 승인 사본 SHA-256은 `9AC5B97C47AC8AED1E8BCA27A3EEF39411361D8F68C262509F0C40A8F9D21BB6`이다. 해시는 설치·업데이트 때 다시 확인하며, 다른 hash를 조용히 승인하지 않는다.

`RegisterModule`의 두 문자열은 다음처럼 구분한다.

- module type: `FilePathCheckDLL`
- module name: 위 registry key의 value name. 공통 절차는 다른 등록값을 덮어쓰지 않는 run-owned name `SoulforgeHwpNormalization`을 사용한다.

현재 PC의 Hancom Office 2020 바인딩은 32-bit `HWPFrame.HwpObject`가 검증됐다. 64-bit PowerShell은 과거 `Open` hang이 관찰됐으므로 현재 기본 host로 승격하지 않는다.

## 기본 실행 계약

기본 경로는 다음을 동시에 만족해야 한다.

- visible Hancom GUI `0`
- Computer Use `0`
- source 원본 read-only
- 변환 대상은 `_workspaces/**/source_copies/`의 workspace-local 사본 1개 이상
- HWPX는 `_workspaces/**/exports/`의 exact output path에만 생성
- 보안 모듈 registry value는 변환 직전에 등록하고 `finally`에서 제거
- 변환이 생성한 HWP process만 종료하고 기존 process는 건드리지 않음
- partial/invalid output은 사용 가능 상태로 남기지 않음

등록 전에 source/output/모듈/metadata 경로를 절대경로로 resolve하고 허용 root 내부인지 확인한다. output이 이미 존재하거나 run-owned registry value가 이미 존재하면 동시 writer 또는 잔류 상태로 보고 `blocked_conversion`한다.

## 처리 순서

1. HWP 파일을 발견하면 본문을 읽지 않고 inventory 에 등록한다.
2. 원본 위치, workspace 작업 위치, 크기, SHA-256, 출처 메모를 기록한다.
3. 원본을 직접 수정하지 않고 workspace-local 사본 또는 owner-approved worksite 작업본을 준비하고, 원본과 사본 hash가 같은지 확인한다.
4. 기존 HWP process ID, run-owned registry value 부재, output 부재를 기록한다.
5. 승인된 공식 보안 DLL의 경로와 hash를 확인한다.
6. `HKCU\Software\HNC\HwpAutomation\Modules`에 run-owned module name과 DLL 절대경로를 `REG_SZ`로 등록하고 읽기-back으로 확인한다.
7. `HWPFrame.HwpObject`를 만들고 첫 `XHwpWindow.Visible`을 `false`로 둔다.
8. `RegisterModule('FilePathCheckDLL', 'SoulforgeHwpNormalization')`이 `true`인지 확인한 뒤에만 `Open`한다.
9. `Open(source, 'HWP', 'suspendpassword:true;forceopen:true;versionwarning:false')`을 호출한다. `false`, 예외, timeout이면 GUI로 전환하지 않는다.
10. Open 성공 후 visible HWP main window 수가 `0`인지 확인하고 `SaveAs(output, 'HWPX', '')`을 호출한다.
11. `finally`에서 `Clear(1)`, `Quit()`, COM final release를 수행한다.
12. 이 실행이 만든 registry value만 제거하고 사전 registry 상태와 같아졌는지 확인한다. 다른 module value는 삭제하거나 덮어쓰지 않는다.
13. 이 실행 이후 새 HWP process가 자연 종료됐는지 기다린다. 남아 있으면 사전 PID 집합에 없던 exact PID만 종료하고 다시 `0`인지 확인한다.
14. source 원본과 local 사본 hash 불변, exact output 1개, HWPX ZIP/XML validator PASS를 확인한 뒤에만 `converted_hwpx_ready`로 승격한다.
15. 본문/양식/항목 추출은 HWPX 파생본에서만 수행한다. PDF 시각검증은 아래 별도 gate로 처리한다.

## 호출 surface

공개 reusable runner/skill/workflow는 아직 없다. 2026-08-11 smoke는 아래 contract를 구현한 bounded private runner로 실행됐으며, 이 문서가 공통 호출 설계를 소유한다. 새 workflow/skill 또는 production runner 생성은 별도 Owner 승인 전 `HOLD`다.

현재 PC의 pilot-executed 호출 모양:

```powershell
& '<32-bit-powershell-exe>' `
  -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass `
  -File '<bounded-runner.ps1>' `
  -SourceHwp '<workspace-local-source-copy.hwp>' `
  -OutputHwpx '<exact-workspace-output.hwpx>' `
  -SecurityModuleDll '<approved-FilePathCheckerModule.dll>' `
  -AllowedWorkspaceRoot '<batch-root>' `
  -MetadataRoot '<metadata-root>' `
  -ReceiptPath '<metadata-root>\smoke_test_receipt.json' `
  -SecurityModuleName 'SoulforgeHwpNormalization'
```

HWPX 구조 validator의 현재 PC 바인딩:

```powershell
& '<lxml-capable-python-exe>' -B `
  '.registry/skills/hwpx_document/codex/scripts/validate.py' `
  '<exact-workspace-output.hwpx>'
```

공통 runner 설계가 받아야 하는 필수 입력은 source copy, exact output, allowed workspace root, 승인된 보안 DLL, metadata root와 receipt path다. password/secret 인자는 만들지 않는다. 공개 runner로 materialize할 때에도 같은 fail-closed contract와 별도 review gate를 유지한다.

## 실패·암호 분류

- `owner_secret_required`: 별도 권위 metadata 또는 도구의 비본문 상태가 암호 필요를 명확히 식별한 경우. 암호 값은 입력·환경변수·로그·receipt에 넣지 않는다.
- `blocked_conversion`: 모듈 미설치/hash 불일치, registry alias 충돌, `RegisterModule=false`, Open/SaveAs false 또는 예외, DRM, 손상, timeout, visible window 관찰, cleanup 실패, source hash 변화, output 누락/중복, validator 실패.
- `Open=false`만으로 암호라고 추정하지 못하면 `blocked_conversion`으로 둔다.
- 실패 시 한컴 visible GUI, Computer Use, shell association, 수동 허용창 클릭으로 자동 우회하지 않는다.
- 실패 후 partial output은 제거하거나 격리하고 성공 HWPX로 노출하지 않는다.

## 검증·기록 계약

성공 receipt와 manifest에는 본문 없이 다음 metadata만 남긴다.

- source 원본 pointer, local copy pointer, 크기, 변환 전후 SHA-256, read-only 여부
- output exact path, 크기, SHA-256, exact output count
- Automation host/bitness, module type/name, DLL SHA-256, `RegisterModule` 결과
- Open, SaveAs, Clear, Quit 결과
- registry pre-state, run-owned 등록·제거, post-state 일치
- HWP process pre/during/post PID 집합과 visible main-window count
- HWPX ZIP integrity, required entries, `mimetype` first/stored, manifest, 모든 XML parse 결과
- 최종 상태와 blocker code

`_workmeta`에는 이 metadata receipt와 validator log만 둔다. HWP/HWPX/PDF/text payload와 원문 본문은 `_workspaces`에 둔다.

## PDF 시각검증 gate

HWP→HWPX 변환과 HWPX→PDF/전페이지 시각검증은 다른 gate다. HWPX 구조 validator PASS는 PDF 렌더, 표 잘림, 겹침, 폰트, 머리말/꼬리말 또는 페이지 수 PASS를 뜻하지 않는다. PDF가 필요한 deliverable은 승인된 별도 exporter와 전페이지 render QA를 통과해야 한다.

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
- 보안 모듈 registry value를 변환 종료 후 남김
- 사전 HWP process와 실행이 만든 HWP process를 구분하지 않고 일괄 종료
- 변환 실패를 visible GUI, Computer Use 또는 허용창 클릭으로 자동 우회
- HWPX 구조검사만으로 PDF 시각검증 또는 문서 의미 승인을 주장

## 주장 한계

HWPX 변환 전에는 HWP 파일에 대해 다음까지만 말할 수 있다.

- 파일이 존재한다.
- 경로, 크기, 해시, 확장자, container/magic 상태를 확인했다.
- 변환 또는 암호 입력이 필요하다.

HWPX 변환 후에도 P25 같은 예시 프로젝트는 reference example 이며, 공식 정본/승인본/최신본/합격 근거가 되려면 별도의 공식 source 또는 owner-approved 문서관리 증거가 필요하다.
