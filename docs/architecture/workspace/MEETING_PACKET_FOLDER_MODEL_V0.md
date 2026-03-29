# MEETING_PACKET_FOLDER_MODEL_V0

## 목적

- 회의 item 폴더의 canonical 단계 구조와 의미 하위폴더를 고정한다.
- `soulforge-se-foldertree-generate` skill 이 회의 item 을 자동 생성할 때 따라야 하는 기준을 제공한다.
- project-local meeting packet rule 은 이 문서를 override 하지 않고, packet-local naming 과 operating detail 만 보강한다.

## 적용 범위

- `020_MGMT/**/LOG/01_회의/YYYYMMDD_회의명_*` 형태의 회의 item 폴더
- 회의 결과를 만드는 `meeting packet` working surface

## 상위 원칙

- top-level 단계 폴더만 번호 prefix 를 쓴다.
- 하위 의미 폴더는 숫자 없이 짧은 한국어 이름을 쓴다.
- `00_Temp` 는 생성 지침, 양식, 규칙 보관 자리다.
- `01_Work` 는 raw 자료를 모으고 편집하는 작업 공간이다.
- `02_Input` 는 `03_Out` 생성을 위해 잠근 입력 자료 자리다.
- `03_Out` 는 회의 결과 산출물 자리다.
- `04_Review` 는 `03_Out` 검토와 수정 요청 자리다.
- `05_Action` 는 `03_Out` 이후 실제 실행 흔적 자리다.

## 고정 폴더 모델

```text
YYYYMMDD_회의명_예시/
├─ 00_Temp/
│  ├─ 양식/
│  └─ 규칙/
├─ 01_Work/
│  ├─ 원본자료/
│  └─ 작업메모/
├─ 02_Input/
│  ├─ 정리본/
│  └─ 잠금입력/
├─ 03_Out/
│  ├─ 회의록/
│  ├─ 조치사항/
│  ├─ 확정사항/
│  ├─ 열린쟁점/
│  ├─ 문서반영후보/
│  └─ 배포본/
├─ 04_Review/
│  ├─ 검토의견/
│  └─ 수정요청/
└─ 05_Action/
   ├─ 팀별전달/
   ├─ 요청발송/
   ├─ 일정반영/
   └─ PDR승격/
```

## 단계별 의미

### `00_Temp`

- 회의록 템플릿
- 조치사항 템플릿
- 작성 규칙
- packet-local guide

### `01_Work`

- 메일 원문 사본
- 녹음 파일과 raw transcript
- 회의 직후 rough memo
- working note, 브레인스토밍, 임시 정리

### `02_Input`

- 통합 정리본
- 잠근 최종정리본
- 회의록 생성용 입력 묶음
- 조치사항 생성용 입력 묶음

### `03_Out`

- `회의록`: 공식 회의록
- `조치사항`: action item tracker
- `확정사항`: 결정 로그와 잠금 결과
- `열린쟁점`: unresolved issue 와 조사 필요 항목
- `문서반영후보`: PDR/기술문서 반영 후보
- `배포본`: HTML/HWPX/PDF 등 공유용 패키지

### `04_Review`

- 검토 코멘트
- 수정 요청
- 승인 전 확인 메모

### `05_Action`

- 팀별 전달 메모
- 요청 메일/공문 발송 기록
- 일정 반영 결과
- 대상 PDR 폴더 승격 착수/완료 기록

## 운영 해석

- raw 자료는 먼저 `01_Work` 에 쌓는다.
- agent/operator 는 `00_Temp` 와 `02_Input` 를 기준으로 `03_Out` 을 만든다.
- `03_Out` 에서 나온 follow-up 은 `05_Action` 에서 실제 수행한다.
- `04_Review` 는 `03_Out` 수정이 필요한 경우에만 사용한다.

## owner 경계

- canonical model owner: `docs/architecture/workspace/`
- generator materialization owner: `soulforge-se-foldertree-generate`
- project-local trial or packet-local detail: `_workmeta/<project_code>/rules/`

## 상태

- `V0`
- future meeting scaffold 는 이 모델을 기본으로 생성해야 한다.
