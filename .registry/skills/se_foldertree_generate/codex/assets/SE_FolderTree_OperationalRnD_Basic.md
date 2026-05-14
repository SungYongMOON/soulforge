---
title: '운용연구개발 기본형 SE 폴더 트리 생성 지침'
version: '0.1'
owner_team: Soulforge
variant_binding:
  support_key: operational_rd_common_no_grade
supported_input:
  business_type: 운용연구개발
  prime_contractor: 공통
  quality_grade: 없음
principles:
- 폴더 순서 = 운용연구개발 기본 SE 수행 순서
- SRR/SFR/PDR/CDR/TRR/FCA/PCA spine 을 유지하되 contractor-specific 품질 게이트와 특정 업체 산출물은 넣지 않는다.
- "운용연구개발은 public-safe 공통 variant 작동을 위한 작업용 용어로 취급하며, 실제 프로젝트의 공식 사업 분류와 다를 수 있다."
- 완료판정은 03_Out 기준
root_naming:
  format: '{START_YYYYMMDD}_{PROJECT_NAME}'
  note: 단계별 날짜를 폴더명에 넣지 말 것(일정 변경에 강하게)
special_folders:
  reference:
    code: 0
    name: REF
    desc: 프로젝트 기준 및 참고자료
  management:
    code: 20
    name: MGMT
    desc: 프로젝트 통합 관리 및 원본 수집
  unclassified:
    code: 270
    name: 분류필요업무
    desc: 단계 미판정 또는 후속 분류 대기 자료
management_static_folders:
- code: 21
  name: 자동화설정_운영규칙
  desc: 프로젝트 자동화설정, 라우팅 기준, 운영 규칙
- code: 22
  name: INBOX_원본수집
  desc: 프로젝트로 들어온 메일과 원본 자료의 first landing path
- code: 23
  name: 연락처_이해관계자
  desc: 연락처, 조직, 역할, 이해관계자 정보
- code: 24
  name: 예산_집행
  desc: 예산, 집행, 정산 관련 자료
- code: 25
  name: 통합로그_의사결정조치
  desc: 회의 결과, 공문, action item, 조치 이력
- code: 26
  name: 상태_진행현황
  desc: 현재 단계, blocker, next action, 진행 현황 요약
- code: 27
  name: 수신이력_이동이력
  desc: 이메일 수신 및 프로젝트 내부 자료 이동 이력
- code: 29
  name: 보류_미분류
  desc: 바로 분류하지 못한 자료와 보류 항목
gates:
- code: 30
  name: SRR
  desc: 체계요구조건검토 (System Requirements Review)
  tasks:
  - id: 31
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 32
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 33
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 34
    name: 운용문제정의및배경
    desc: 현행 운용 문제, 개선 배경, 대상 범위 정리
    term: 운용문제
    source: 현존전력 성능 극대화 사업 업무지침
    template: 없음
  - id: 35
    name: 운용개념(CONOPS)
    desc: 운용 시나리오, 사용자 관점, 적용 환경 정리
    term: CONOPS
    source: 방위사업관리규정
    template: 없음
  - id: 36
    name: 연구범위및제약사항
    desc: 연구 범위, 제약, 제외 범위, 초기 위험 자료
    term: 범위제약
    source: 현존전력 성능 극대화 사업 업무지침
    template: 없음
  - id: 37
    name: 체계요구사항명세서(SSRS)_D
    desc: 운용개선 요구를 반영한 체계요구사항 초안
    term: SSRS
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 38
    name: SRR_회의록및조치결과
    desc: SRR 검토 결과, 진입조건, 후속 조치
    term: SRR_회의록
    source: 방위사업관리규정
    template: 없음
- code: 60
  name: SFR
  desc: 체계기능검토 (System Functional Review)
  tasks:
  - id: 61
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 62
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 63
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 64
    name: 체계요구사항명세서(SSRS)_F
    desc: 기능 기준선 설정을 위한 체계요구사항 확정본
    term: SSRS
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 65
    name: 기능시나리오분석
    desc: 기능 분석, 운용 시나리오, 기능 할당 자료
    term: 기능분석
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 66
    name: 요구사항추적표(RTM)
    desc: 요구사항과 기능/하위항목 간 추적성 자료
    term: RTM
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 67
    name: 인터페이스및데이터흐름초안
    desc: 인터페이스, 데이터 흐름, 연동 영향 초안
    term: 인터페이스초안
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 68
    name: SFR_회의록및조치결과
    desc: SFR 검토 결과와 기능 기준선 관련 조치
    term: SFR_회의록
    source: 방위사업관리규정
    template: 없음
- code: 90
  name: PDR
  desc: 기본설계검토 (Preliminary Design Review)
  tasks:
  - id: 91
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 92
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 93
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 94
    name: 기본설계및실증설계방안
    desc: 기본설계 또는 실증/분석 설계 방안
    term: 기본설계
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 95
    name: 대안분석(Trade_Study)
    desc: 대안 비교, 절충 분석, 영향 판단 자료
    term: Trade_Study
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 96
    name: 연동통제문서(ICD)_Prelim
    desc: 초기 인터페이스 정의와 통제 초안
    term: ICD
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 97
    name: 검증실증계획(VnV)_D
    desc: 검증/실증 항목, 절차, 기준 초안
    term: VnV
    source: 시험평가 가이드북
    template: 없음
  - id: 98
    name: PDR_회의록및조치결과
    desc: PDR 검토 결과와 설계 보완 조치
    term: PDR_회의록
    source: 방위사업관리규정
    template: 없음
- code: 120
  name: CDR
  desc: 상세설계검토 (Critical Design Review)
  tasks:
  - id: 121
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 122
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 123
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 124
    name: 상세설계구현패키지
    desc: 구현/적용에 필요한 상세설계 패키지
    term: 상세설계
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 125
    name: 인터페이스설계기술서(IDD)_F
    desc: 인터페이스 상세설계 확정본
    term: IDD
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 126
    name: 시험실증절차서(STP)_D
    desc: 상세 시험/실증 절차 초안
    term: STP
    source: 시험평가 가이드북
    template: 없음
  - id: 127
    name: 형상식별및변경관리자료
    desc: 변경 영향과 형상 식별/통제 자료
    term: 형상관리
    source: 국방 표준화 업무 실무 지침서
    template: 없음
  - id: 128
    name: CDR_회의록및조치결과
    desc: CDR 검토 결과와 구현 전 조치
    term: CDR_회의록
    source: 방위사업관리규정
    template: 없음
- code: 150
  name: TRR
  desc: 시험준비상태검토 (Test Readiness Review)
  tasks:
  - id: 151
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 152
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 153
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 154
    name: 시험준비상태검토자료(TRR)
    desc: 시험 진입 판단에 필요한 검토 패키지
    term: TRR
    source: 시험평가 가이드북
    template: 없음
  - id: 155
    name: 시험환경및자원준비상태
    desc: 시험 장비, 환경, 인력, 데이터 준비 자료
    term: 시험준비
    source: 시험평가 가이드북
    template: 없음
  - id: 156
    name: 안전보안상호운용성확인
    desc: 안전, 보안, 상호운용성 영향 점검 자료
    term: 안전보안상호운용성
    source: 현존전력 성능 극대화 사업 업무지침
    template: 없음
  - id: 157
    name: 수락기준및평가항목
    desc: 수락 기준, 평가 항목, 판단 기준 자료
    term: 평가기준
    source: 시험평가 가이드북
    template: 없음
  - id: 158
    name: TRR_회의록및조치결과
    desc: TRR 검토 결과와 시험 착수 전 조치
    term: TRR_회의록
    source: 방위사업관리규정
    template: 없음
- code: 180
  name: FCA
  desc: 기능적형상확인 (Functional Configuration Audit)
  tasks:
  - id: 181
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 182
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 183
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 184
    name: 기능검증실증결과
    desc: 기능 충족 여부와 실증 결과 자료
    term: 기능검증
    source: 시험평가 가이드북
    template: 없음
  - id: 185
    name: 운용적합성사용자피드백
    desc: 운용 관점 적합성, 사용자/현장 피드백 자료
    term: 운용적합성
    source: 현존전력 성능 극대화 사업 업무지침
    template: 없음
  - id: 186
    name: 요구사항검증매트릭스(VCRM)_F
    desc: 요구사항 충족 입증과 추적성 결과
    term: VCRM
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 187
    name: 결함개선조치결과
    desc: 시험/실증 중 식별된 결함과 개선 조치 결과
    term: 개선조치
    source: 과학적사업관리 수행지침
    template: 없음
  - id: 188
    name: FCA_회의록및조치결과
    desc: FCA 결과와 기능 충족 판단 조치
    term: FCA_회의록
    source: 방위사업관리규정
    template: 없음
- code: 210
  name: PCA
  desc: 물리적형상확인 (Physical Configuration Audit)
  tasks:
  - id: 211
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 212
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 213
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
  - id: 214
    name: 제품형상식별서(PCI)_F
    desc: 최종 형상 식별 및 반영 자료
    term: PCI
    source: SE기반 기술검토회의 가이드북
    template: 없음
  - id: 215
    name: 현행체계변경반영자료
    desc: 최종 변경 반영 사항과 적용 범위 자료
    term: 변경반영
    source: 현존전력 성능 극대화 사업 업무지침
    template: 없음
  - id: 216
    name: 최종보고서및전환권고
    desc: 최종 수행 결과와 후속 전환/적용 권고
    term: 최종보고서
    source: 현존전력 성능 극대화 사업 업무지침
    template: 없음
  - id: 217
    name: 후속조치운용반영계획
    desc: 후속조치, 운영 반영, 유지관리 계획
    term: 후속조치
    source: 현존전력 성능 극대화 사업 업무지침
    template: 없음
  - id: 218
    name: PCA_회의록및조치결과
    desc: PCA 결과와 최종 조치 이력
    term: PCA_회의록
    source: 방위사업관리규정
    template: 없음
fixed_subfolders:
- name: 00_Temp
  desc: AI가 읽는 산출물 생성 지침 및 양식. 이 폴더 안에 프롬프트, 템플릿, 작성 가이드를 배치하면 AI가 참조하여 산출물을 생성함.
- name: 01_Work
  desc: 자료 수집 및 가공 작업 공간. 원본 자료를 모으고 정리하는 임시 공간. 완료되면 02_Input으로 정제하여 이동.
- name: 02_Input
  desc: AI에게 전달할 최종 입력 데이터. 버전별 하위폴더(01/, 02/...) 생성 권장. AI는 가장 최신 버전을 읽어 산출물 생성.
- name: 03_Out
  desc: AI가 생성한 최종 산출물. 승인용 파일이 저장되며, 완료 여부 판단 기준 폴더. *_FINAL.* 파일 존재 시 완료로 간주.
- name: 04_Review
  desc: 산출물 검토 의견 및 피드백. 03_Out에 대한 리뷰 코멘트, RFI, 수정 요청 등을 기록.
- name: 05_Action
  desc: Review 후 조치 기록. 04_Review의 피드백에 대한 조치 결과 및 변경 이력을 문서화.
fixed_gate_subfolders:
  INBOX:
    desc: 아직 분류되지 않은 자료 임시 보관. 하위에 YYYYMMDD_자료명 폴더 생성하여 사용.
    subfolders: []
    item_subfolders: []
    example_item: YYYYMMDD_분류전자료_예시
  LOG:
    desc: 의사결정 및 조치 기록. 회의록, 공문 관리.
    subfolders:
    - name: 01_회의
      desc: 회의록 보관. 하위에 YYYYMMDD_회의명 폴더 생성.
      example_item: YYYYMMDD_회의명_예시
      item_subfolders:
      - 00_Temp
      - 01_Work
      - 02_Input
      - 03_Out
      - 04_Action
    - name: 02_공문
      desc: 공문 보관. 하위에 YYYYMMDD_공문명 폴더 생성.
      example_item: YYYYMMDD_공문명_예시
      item_subfolders:
      - 00_Temp
      - 01_Work
      - 02_Input
      - 03_Out
      - 04_Action
  TDP:
    desc: 기술자료 패키지. 수신/송신 자료 관리.
    subfolders:
    - name: 01_수신
      desc: 외부에서 받은 기술자료. 하위에 YYYYMMDD_자료명 폴더 생성.
      example_item: YYYYMMDD_수신자료_예시
      item_subfolders: []
    - name: 02_송신
      desc: 외부로 보낸 기술자료. 하위에 YYYYMMDD_자료명 폴더 생성 후 작업.
      example_item: YYYYMMDD_송신자료_예시
      item_subfolders:
      - 00_Temp
      - 01_Work
      - 02_Input
      - 03_Out
completion_rule:
  required_folder: 03_Out
  done_if:
    mode: final_file
    pattern_examples:
    - '*_FINAL.*'
    fallback_mvp: 03_Out에 파일 1개 이상이면 완료로 간주
profiles:
  A:
    description: 최상위(슈퍼셋) — 모든 폴더 생성
    exclude_task_ids: []
  B:
    description: 'A에서 일부 제외(하드 제외: 폴더 미생성)'
    exclude_task_ids: []
  C:
    description: B보다 더 제외
    exclude_task_ids: []
generation_rules:
  gate_folder_format: '{GATE_CODE:03d}_{GATE_NAME}'
  task_folder_format: '{TASK_ID:03d}_{TASK_NAME}'
  static_folders:
  - 000_REF/01_방사청SE
  - 000_REF/02_방사청품질
  - 000_REF/03_공통참고자료
  - 000_REF/99_템플릿
  - 020_MGMT/021_자동화설정_운영규칙
  - 020_MGMT/022_INBOX_원본수집
  - 020_MGMT/023_연락처_이해관계자
  - 020_MGMT/024_예산_집행
  - 020_MGMT/025_통합로그_의사결정조치
  - 020_MGMT/026_상태_진행현황
  - 020_MGMT/027_수신이력_이동이력
  - 020_MGMT/029_보류_미분류
---

# 설명(사람용)

- 이 문서의 YAML(위)을 파싱해서 운용연구개발 기본형 폴더 트리를 생성한다.
- public-safe 공통 variant 이므로 contractor-specific Q-gate, 업체/계약 전용 산출물, 품질등급 분기 규칙은 넣지 않는다.
- `운용연구개발`은 정식 법령 단계 용어로 확정된 것이 아니라 작업용 분류이므로, 실제 과제에서 더 무거운 설계/시험 범위가 확인되면 별도 variant로 승격해야 한다.
