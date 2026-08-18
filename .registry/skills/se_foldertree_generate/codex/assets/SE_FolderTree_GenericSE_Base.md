---
title: 일반 체계공학 기준선 폴더 트리 생성 지침 (발주처·국가 무관)
version: '0.1'
owner_team: Soulforge
variant_binding:
  support_key: generic_se_base
supported_input:
  business_type: 일반SE
  prime_contractor: 공통
  quality_grade: 없음
principles:
- 폴더 순서 = 체계공학 수행 순서(기술검토 게이트 기준선)
- 이 기준선은 특정 발주처·국가·계약의 규정이 아니라 체계공학 일반 지침이 각 기술검토 전에 만들어 두라고 말하는 산출물의 바닥선이다.
- 근거는 NASA NPR 7123.1D 부록 G 진입·성공 기준과 DoD Systems Engineering Guidebook 2022 §3 기술검토 기준이며(행이 실제로 인용하는 정본은 이 둘뿐), NASA SE Handbook (SP-2016-6105 Rev2) 6.7 은 사실 추출만 되어 있고 아직 행에 반영되지 않았다(references/generic_se_base_derivation_v0.md §6). 규정(regulation)이 아니라 지침(guidance)으로 취급한다.
- '발주처·국가 계층(예: 특정 국가 조달 규정, 주계약사 품질게이트)은 이 기준선 위에 add/alias/N-A 로 얹고, 같은 산출물은 같은 artifact_type_id 로 만난다.'
- 두 출처가 모두 요구하거나 NASA 가 required 로 표기한 항목은 must_have, 한 출처만 요구하면 should_have, 발주처 소유 입력이나 임무 특화 항목은 context 로 둔다.
- '폴더명 규칙: 한글명(영문약어)_상태 예) 체계요구사항명세서(SSS)_F'
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
- code: 0
  name: REF
  desc: 사업 기준 및 발주처 제공 참조자료 (Concept / pre-award reference)
  tasks:
  - id: 1
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 2
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 3
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 4
    name: 소요-작전운용성능참조문서(ORD)_F
    desc: Buyer capability / operational requirements reference (ROC/ORD/CDD equivalent) with mission goals and MOEs
    term: ORD
    source: NASA NPR 7123.1D Table G-3, p.37 §5.2.2.2.a [SE-35..SE-37]; DoD SE Guidebook 2022 Table 3-1 p.69, Table 3-4 p.81
    template: 없음
    artifact_type_id: ord
    evidence_level: general_se_guidance
    se_floor: context
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-3
    - source_key: nasa_npr_7123_1d
      locator: p.37 §5.2.2.2.a [SE-35..SE-37]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-1 p.69
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 5
    name: 운용개념서초안(CONOPS)_D
    desc: Concept of Operations (draft) / operational mode summary and mission profile
    term: CONOPS
    source: NASA NPR 7123.1D Table G-3, Table G-4; DoD SE Guidebook 2022 p.68, Table 3-1 p.69
    template: 없음
    artifact_type_id: conops
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-3
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: p.68
    - source_key: dod_se_guidebook_2022
      locator: Table 3-1 p.69
    verification_status: source_supported
  - id: 6
    name: 대안분석-개념절충연구기록(Trade_Study)_D
    desc: Alternatives / concept trade study record (AoA-type)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-3; DoD SE Guidebook 2022 p.68, Table 3-1 p.69
    template: 없음
    artifact_type_id: trade_study
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-3
    - source_key: dod_se_guidebook_2022
      locator: p.68
    - source_key: dod_se_guidebook_2022
      locator: Table 3-1 p.69
    verification_status: source_supported
  - id: 7
    name: 기술성숙도평가-기술성숙화계획초안(TRA)_D
    desc: Technology readiness assessment / technology maturation (development) plan (initial)
    term: TRA
    source: NASA NPR 7123.1D Table G-3, p.36 §5.1.6; DoD SE Guidebook 2022 Table 3-1 p.69
    template: 없음
    artifact_type_id: tra_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-3
    - source_key: nasa_npr_7123_1d
      locator: p.36 §5.1.6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-1 p.69
    verification_status: source_supported
- code: 30
  name: SRR
  desc: 체계요구조건검토 (System Requirements Review)
  tasks:
  - id: 301
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 302
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 303
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 304
    name: 체계요구사항명세서(SSS)_F
    desc: System/Subsystem Specification (system performance / system requirements specification) ready to baseline
    term: SSS
    source: NASA NPR 7123.1D Table G-4, p.38 §5.2.2.2.b [SE-39]; DoD SE Guidebook 2022 Table 3-2 p.72
    template: 없음
    artifact_type_id: sss
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: p.38 §5.2.2.2.b [SE-39]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    verification_status: source_supported
  - id: 305
    name: 운용개념서(CONOPS)_U
    desc: Concept of Operations / operations concept (updated)
    term: CONOPS
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-1 p.69, p.68
    template: 없음
    artifact_type_id: conops
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-1 p.69
    - source_key: dod_se_guidebook_2022
      locator: p.68
    verification_status: source_supported
  - id: 306
    name: 체계공학관리계획서(SEMP)_F
    desc: Systems Engineering Management Plan (SEMP) ready to baseline
    term: SEMP
    source: NASA NPR 7123.1D Table G-4, p.37 §5.2.2.2.b [SE-38]; DoD SE Guidebook 2022 Table 3-2 p.72, p.17
    template: 없음
    artifact_type_id: semp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: p.37 §5.2.2.2.b [SE-38]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    - source_key: dod_se_guidebook_2022
      locator: p.17
    - source_key: dod_se_guidebook_2022
      locator: p.63
    verification_status: source_supported
  - id: 307
    name: 요구사항추적표(RTM)_D
    desc: 'Requirements traceability matrix (bidirectional: buyer requirement - SOW - system spec)'
    term: RTM
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.72, p.71
    template: 없음
    artifact_type_id: rtm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: Table G-1
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    - source_key: dod_se_guidebook_2022
      locator: p.71
    verification_status: source_supported
  - id: 308
    name: 외부인터페이스통제문서(ICD)_D
    desc: External interface identification and preliminary external ICDs
    term: ICD
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72
    template: 없음
    artifact_type_id: icd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    verification_status: source_supported
  - id: 309
    name: 검증전략-요구사항별검증방법(V_and_V)_D
    desc: 'Verification and validation strategy: verification method identified for each requirement, certifying agencies identified'
    term: V_and_V
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.73
    template: 없음
    artifact_type_id: vv_strategy
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    verification_status: source_supported
  - id: 310
    name: 위험관리계획서(RMP)_F
    desc: Risk management plan
    term: RMP
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 p.17, Table 3-2 p.72
    template: 없음
    artifact_type_id: risk_management_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: p.17
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    verification_status: source_supported
  - id: 311
    name: 위험목록(Risk_Register)_U
    desc: Risk register / risk assessment with mitigation plans (technical, safety, security, cost, schedule)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.72
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: Table G-1
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    verification_status: source_supported
  - id: 312
    name: 형상관리계획서(CMP)_F
    desc: Configuration management plan
    term: CMP
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.73, p.134
    template: 없음
    artifact_type_id: cm_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: Table G-1
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    - source_key: dod_se_guidebook_2022
      locator: p.134
    verification_status: source_supported
  - id: 313
    name: 기술성숙도평가-기술성숙화계획(TRA)_U
    desc: Technology readiness assessment and technology maturation plan (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.73
    template: 없음
    artifact_type_id: tra_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    verification_status: source_supported
  - id: 314
    name: 통합일정(IMS)-WBS_D
    desc: Integrated master schedule / WBS with critical path (resourced) and cost basis
    term: IMS
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72-73, p.108-109
    template: 없음
    artifact_type_id: ims
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72-73
    - source_key: dod_se_guidebook_2022
      locator: p.108-109
    - source_key: dod_se_guidebook_2022
      locator: Table 2-4 p.59
    verification_status: source_supported
  - id: 315
    name: 문서-규격트리(Spec_Tree)_D
    desc: Document tree / specification tree
    term: Spec_Tree
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 p.78
    template: 없음
    artifact_type_id: spec_tree
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: p.78
    verification_status: source_supported
  - id: 316
    name: 예비체계안전분석서(Safety)_D
    desc: Preliminary system safety / hazard analysis
    term: Safety
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-1 p.69, Table 3-2 p.73
    template: 없음
    artifact_type_id: system_safety_analysis
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-1 p.69
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    verification_status: source_supported
  - id: 317
    name: RAM계획서_F
    desc: Reliability / maintainability (R&M) program plan; safety and mission assurance plan
    term: RAM
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72-73, p.195-197
    template: 없음
    artifact_type_id: ram_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72-73
    - source_key: dod_se_guidebook_2022
      locator: p.195-197
    verification_status: source_supported
  - id: 318
    name: 핵심성능지표(TPM)목록_D
    desc: 'Key driving requirements: MOP/TPM list with thresholds and margins'
    term: TPM
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72, p.83
    template: 없음
    artifact_type_id: tpm_list
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    - source_key: dod_se_guidebook_2022
      locator: p.83
    verification_status: source_supported
  - id: 319
    name: 소프트웨어개발계획서(SDP)_D
    desc: Software development plan / software development strategy with sizing estimates
    term: SDP
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72-73
    template: 없음
    artifact_type_id: sdp
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72-73
    verification_status: source_supported
  - id: 320
    name: 종합군수지원계획(ILS)_D
    desc: Integrated logistics support / product support plan (preliminary; maintenance concept)
    term: ILS
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.73
    template: 없음
    artifact_type_id: ils_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    verification_status: source_supported
  - id: 321
    name: 제조-생산전략서(MFG_Plan)_D
    desc: Manufacturing and production strategy (initial producibility)
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-3; DoD SE Guidebook 2022 Table 3-2 p.73, Table 3-1 p.69
    template: 없음
    artifact_type_id: manufacturing_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-3
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    - source_key: dod_se_guidebook_2022
      locator: Table 3-1 p.69
    verification_status: source_supported
  - id: 322
    name: 인간체계통합계획-접근(HSI)_F
    desc: Human systems integration approach / HSI plan
    term: HSI
    source: NASA NPR 7123.1D Table G-4, p.37 §5.2.1.3; DoD SE Guidebook 2022 Table 3-2 p.73
    template: 없음
    artifact_type_id: hsi_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: p.37 §5.2.1.3
    - source_key: nasa_npr_7123_1d
      locator: p.38 §5.2.2.2.b [SE-66]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    verification_status: source_supported
  - id: 323
    name: 체계보안-프로그램보호계획(PPP)_D
    desc: System security / program protection plan (preliminary) with initial cyber risk assessment
    term: PPP
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.72, p.216
    template: 없음
    artifact_type_id: security_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: Table G-1
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    - source_key: dod_se_guidebook_2022
      locator: p.216
    - source_key: dod_se_guidebook_2022
      locator: p.71
    verification_status: source_supported
  - id: 324
    name: 자료요구목록(CDRL)_F
    desc: Contract data requirements list / product certification and acceptance data requirements
    term: CDRL
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 2-4 p.59, Table 3-4 p.81
    template: 없음
    artifact_type_id: cdrl
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 2-4 p.59
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 325
    name: SRR검토자료(Review_Package)_F
    desc: SRR technical review package (agenda, success criteria, prior RFA/RID closure status)
    term: Review_Package
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 p.63, p.75
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: p.63
    - source_key: dod_se_guidebook_2022
      locator: p.75
    verification_status: source_supported
  - id: 326
    name: SRR회의록_F
    desc: SRR minutes with RID/RFA dispositions and action items
    term: SRR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.75
    template: 없음
    artifact_type_id: review_minutes_srr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.75
    verification_status: source_supported
  - id: 327
    name: SRR결과보고서_F
    desc: SRR review result report / decision memo (baselined requirements confirmation)
    term: SRR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, Table G-4; DoD SE Guidebook 2022 p.74
    template: 없음
    artifact_type_id: review_result_report_srr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: p.74
    verification_status: source_supported
- code: 60
  name: SFR
  desc: 체계기능검토 (System Functional Review / NASA SDR)
  tasks:
  - id: 601
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 602
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 603
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 604
    name: 기능형상식별서(FCI)_F
    desc: Functional baseline configuration identification (system spec + verification requirements + external interfaces under configuration control)
    term: FCI
    source: NASA NPR 7123.1D p.38 §5.2.2.2.c [SE-41] [SE-42]; DoD SE Guidebook 2022 p.74, p.132
    template: 없음
    artifact_type_id: fci
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.38 §5.2.2.2.c [SE-41] [SE-42]
    - source_key: dod_se_guidebook_2022
      locator: p.74
    - source_key: dod_se_guidebook_2022
      locator: p.132
    verification_status: source_supported
  - id: 605
    name: 체계요구사항명세서(SSS)_U
    desc: System/Subsystem Specification (updated, functional baseline version)
    term: SSS
    source: NASA NPR 7123.1D Table G-2, Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: sss
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-2
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 606
    name: 기능분석-체계아키텍처정의서(Functional_Analysis)_F
    desc: Functional analysis / system architecture definition (functional allocation, timing, tradeoffs and options)
    term: Functional_Analysis
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: functional_analysis
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 607
    name: 부체계요구사항명세서(SSRS)_D
    desc: Segment / subsystem performance requirements specifications (allocation to next lower level, draft)
    term: SSRS
    source: NASA NPR 7123.1D Table G-5, p.38 [SE-42]; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: ssrs
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-42]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 608
    name: 검증교차참조표(VCRM)_D
    desc: Verification cross-reference matrix / verification requirements for FCA-SVR (per requirement method and level)
    term: VCRM
    source: NASA NPR 7123.1D Table G-5, Table G-4; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: vcrm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 609
    name: 핵심성능지표정의및추이(TPM)_F
    desc: TPM/MOP definitions (approved) with technical performance status and margins
    term: TPM
    source: NASA NPR 7123.1D Table G-5, p.38 [SE-40] [SE-43]; DoD SE Guidebook 2022 p.83, p.89
    template: 없음
    artifact_type_id: tpm_list
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-40] [SE-43]
    - source_key: dod_se_guidebook_2022
      locator: p.83
    - source_key: dod_se_guidebook_2022
      locator: p.89
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 610
    name: 절충연구보고서(Trade_Study)_U
    desc: Trade study reports (architecture and allocation trades)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: trade_study
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 611
    name: 인터페이스통제문서(ICD)_D
    desc: System interface definitions / ICDs (preliminary, external plus major internal)
    term: ICD
    source: NASA NPR 7123.1D Table G-5, Table G-2; DoD SE Guidebook 2022 p.132-133, Table 3-2 p.72
    template: 없음
    artifact_type_id: icd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-2
    - source_key: dod_se_guidebook_2022
      locator: p.132-133
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    verification_status: source_supported
  - id: 612
    name: 요구사항추적표(RTM)_U
    desc: 'Requirements traceability matrix (updated: parent to system to subsystem)'
    term: RTM
    source: NASA NPR 7123.1D Table G-2, Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: rtm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-2
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 613
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated, incl. HSI/ESOH/cyber mitigation requirements)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 614
    name: SEMP_U
    desc: SEMP (updated)
    term: SEMP
    source: NASA NPR 7123.1D Table G-5, Table G-2; DoD SE Guidebook 2022 p.15-18
    template: 없음
    artifact_type_id: semp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-2
    - source_key: dod_se_guidebook_2022
      locator: p.15-18
    verification_status: source_supported
  - id: 615
    name: RAM계획서_U
    desc: R&M program plan / SMA plan (updated)
    term: RAM
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: ram_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 616
    name: 체계안전분석서(Safety)_U
    desc: System safety analysis (preliminary, updated for architecture)
    term: Safety
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: system_safety_analysis
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 617
    name: IMS_U
    desc: Integrated master schedule with resourced plan to PDR
    term: IMS
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: ims
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 618
    name: 통합계획서(Integration)_D
    desc: Integration plan (preliminary)
    term: Integration
    source: NASA NPR 7123.1D Table G-5, Table G-2
    template: 없음
    artifact_type_id: integration_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-2
    verification_status: partially_supported
  - id: 619
    name: ILSP_D
    desc: Integrated logistics support plan (preliminary)
    term: ILS
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: ils_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 620
    name: 기술자원예산-여유도(Margins)_D
    desc: Technical resource budgets and margins (mass, power, memory, throughput) initial
    term: Margins
    source: NASA NPR 7123.1D Table G-5, Table G-6
    template: 없음
    artifact_type_id: resource_budget
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    verification_status: partially_supported
  - id: 621
    name: TRA_U
    desc: Technology readiness assessment (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-5
    template: 없음
    artifact_type_id: tra_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    verification_status: partially_supported
  - id: 622
    name: 운용개념서(CONOPS)_U
    desc: Concept of operations (preliminary/updated for architecture)
    term: CONOPS
    source: NASA NPR 7123.1D Table G-5
    template: 없음
    artifact_type_id: conops
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    verification_status: partially_supported
  - id: 623
    name: 체계보안계획(PPP)_D
    desc: System security plan (preliminary, updated)
    term: PPP
    source: NASA NPR 7123.1D Table G-5, Table G-2; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: security_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-2
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
  - id: 624
    name: SFR검토자료(Review_Package)_F
    desc: SFR/SDR technical review package
    term: Review_Package
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 p.75, p.63
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: p.75
    - source_key: dod_se_guidebook_2022
      locator: p.63
    verification_status: source_supported
  - id: 625
    name: SFR회의록_F
    desc: SFR minutes with RID/RFA dispositions
    term: SFR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.76
    template: 없음
    artifact_type_id: review_minutes_sfr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.76
    verification_status: source_supported
  - id: 626
    name: SFR결과보고서_F
    desc: SFR review result report (functional baseline established)
    term: SFR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, p.38 §5.2.2.2.c; DoD SE Guidebook 2022 p.74, p.76
    template: 없음
    artifact_type_id: review_result_report_sfr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: nasa_npr_7123_1d
      locator: p.38 §5.2.2.2.c
    - source_key: dod_se_guidebook_2022
      locator: p.74
    - source_key: dod_se_guidebook_2022
      locator: p.76
    verification_status: source_supported
- code: 90
  name: PDR
  desc: 기본설계검토 (Preliminary Design Review)
  tasks:
  - id: 901
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 902
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 903
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 904
    name: 할당형상식별서-아키텍처및형상식별서(DCI)_F
    desc: Allocated baseline configuration identification (CI-level specs, ICDs, verification requirements, design/safety constraints under configuration control)
    term: DCI
    source: NASA NPR 7123.1D Table G-6, p.38 [SE-45]; DoD SE Guidebook 2022 p.78, p.83
    template: 없음
    artifact_type_id: dci
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-45]
    - source_key: dod_se_guidebook_2022
      locator: p.78
    - source_key: dod_se_guidebook_2022
      locator: p.83
    - source_key: dod_se_guidebook_2022
      locator: p.132-133
    verification_status: source_supported
  - id: 905
    name: 체계-부체계설계기술서(SSDD)_D
    desc: System/Subsystem Design Description (preliminary)
    term: SSDD
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: ssdd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 906
    name: 하드웨어설계기술서(HDD)_D
    desc: Hardware design description (preliminary) with supporting trade-off analyses
    term: HDD
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: hdd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 907
    name: 소프트웨어설계기술서(SDD)_D
    desc: Software architecture / software design description (preliminary; CSCI/CSC structure)
    term: SDD
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81-82
    template: 없음
    artifact_type_id: sdd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81-82
    verification_status: source_supported
  - id: 908
    name: 하드웨어요구사항명세서(HRS)_F
    desc: Hardware requirements specifications per CI (development specifications, baselined)
    term: HRS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.78, Table 3-4 p.81
    template: 없음
    artifact_type_id: hrs
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.78
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 909
    name: 소프트웨어요구사항명세서(SRS)_F
    desc: Software requirements specifications per CSCI (baselined)
    term: SRS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: srs
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 910
    name: 인터페이스요구사항명세서(IRS)_F
    desc: Interface requirements specifications (baselined)
    term: IRS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: irs
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 911
    name: 인터페이스통제문서(ICD)_F
    desc: Interface control documents (internal and external, baselined)
    term: ICD
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.78, Table 3-4 p.81
    template: 없음
    artifact_type_id: icd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.78
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    - source_key: dod_se_guidebook_2022
      locator: p.133
    verification_status: source_supported
  - id: 912
    name: 소프트웨어개발계획서(SDP)_F
    desc: Software development plan (baselined)
    term: SDP
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81-82
    template: 없음
    artifact_type_id: sdp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81-82
    verification_status: source_supported
  - id: 913
    name: 요구사항추적표(RTM)_U
    desc: Requirements traceability matrix (functional to allocated baseline, complete and verifiable)
    term: RTM
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: rtm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 914
    name: 시험평가기본계획서(TEMP)-검증확인계획_F
    desc: Test and evaluation master plan / V&V plan (baselined; TEMP drafted)
    term: TEMP
    source: NASA NPR 7123.1D Table G-6, p.38 [SE-68]; DoD SE Guidebook 2022 Table 3-4 p.80, p.82
    template: 없음
    artifact_type_id: temp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-68]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.80
    - source_key: dod_se_guidebook_2022
      locator: p.82
    verification_status: source_supported
  - id: 915
    name: VCRM_U
    desc: Verification cross-reference matrix (updated for CI-level verification requirements)
    term: VCRM
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.78, Table 3-4 p.81
    template: 없음
    artifact_type_id: vcrm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.78
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 916
    name: 통합계획서(Integration)_F
    desc: Integration plan (baselined)
    term: Integration
    source: NASA NPR 7123.1D Table G-6, p.38 [SE-67]; DoD SE Guidebook 2022 Table 3-4 p.82
    template: 없음
    artifact_type_id: integration_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-67]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82
    verification_status: source_supported
  - id: 917
    name: 절충연구보고서(Trade_Study)_U
    desc: Trade study reports (design trades mostly complete; remaining planned)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82
    template: 없음
    artifact_type_id: trade_study
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82
    verification_status: source_supported
  - id: 918
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated; mitigation plans approved and scheduled in IMS)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.80, p.83
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.80
    - source_key: dod_se_guidebook_2022
      locator: p.83
    verification_status: source_supported
  - id: 919
    name: TPM현황-자원여유도_U
    desc: TPM status with technical resource budgets and margins (updated)
    term: TPM
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.83-84
    template: 없음
    artifact_type_id: tpm_list
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.83-84
    verification_status: source_supported
  - id: 920
    name: TRA_U
    desc: Technology readiness assessment (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.112, Table 3-4
    template: 없음
    artifact_type_id: tra_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.112
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4
    verification_status: source_supported
  - id: 921
    name: 도면트리-예비도면(Drawings)_D
    desc: Engineering drawing tree and preliminary drawings / mechanical model
    term: Drawings
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.86
    template: 없음
    artifact_type_id: drawings
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.86
    verification_status: source_supported
  - id: 922
    name: 부품관리계획서(Parts_Plan)_F
    desc: Parts management plan with preliminary parts list and DMSMS management plan
    term: Parts_Plan
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81-82
    template: 없음
    artifact_type_id: registered_parts_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81-82
    verification_status: source_supported
  - id: 923
    name: 기능FMECA-신뢰성분석_D
    desc: Functional FMECA / reliability analyses and R&M estimate; reliability program plan
    term: FMECA
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: fmeca
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 924
    name: 체계안전분석서(Safety)_U
    desc: System safety analyses (PHA, requirements hazard analysis) and hazard tracking; safety plan updated
    term: Safety
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: system_safety_analysis
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 925
    name: 생산성평가-예비제조계획(MFG_Plan)_D
    desc: Producibility / manufacturability assessment and preliminary manufacturing plan
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81-82
    template: 없음
    artifact_type_id: manufacturing_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81-82
    verification_status: source_supported
  - id: 926
    name: 품질보증계획서(QAP)_F
    desc: Quality assurance plan
    term: QAP
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: qa_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 927
    name: EMI-EMC및환경통제계획_F
    desc: EMI/EMC and environments control plan (incl. contamination control where applicable)
    term: EMC
    source: NASA NPR 7123.1D Table G-6
    template: 없음
    artifact_type_id: emc_control_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    verification_status: partially_supported
  - id: 928
    name: ILSP-LCSP_F
    desc: Integrated logistics support plan / life cycle sustainment plan (baselined)
    term: ILS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82-83
    template: 없음
    artifact_type_id: ils_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82-83
    verification_status: source_supported
  - id: 929
    name: 운용개념서(CONOPS)_F
    desc: Concept of operations (baseline)
    term: CONOPS
    source: NASA NPR 7123.1D Table G-6
    template: 없음
    artifact_type_id: conops
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    verification_status: partially_supported
  - id: 930
    name: IMS_F
    desc: Integrated master schedule and cost update with plan to CDR
    term: IMS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82, p.83
    template: 없음
    artifact_type_id: ims
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82
    - source_key: dod_se_guidebook_2022
      locator: p.83
    verification_status: source_supported
  - id: 931
    name: 보안-보호계획(PPP)_U
    desc: System security / program protection plan (updated)
    term: PPP
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82
    template: 없음
    artifact_type_id: security_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82
    verification_status: source_supported
  - id: 932
    name: SEMP_U
    desc: SEMP (updated)
    term: SEMP
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: semp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 933
    name: 장납기품목-조달목록(Long_Lead)_D
    desc: Long-lead item / critical procurement list with supply chain risk status
    term: Long_Lead
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82
    template: 없음
    artifact_type_id: long_lead_list
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82
    verification_status: source_supported
  - id: 934
    name: 공학해석-M&S결과서(Analysis)_D
    desc: Preliminary engineering analysis and modeling results (subsystem analyses, M&S)
    term: Analysis
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-2 p.73, Table 3-4
    template: 없음
    artifact_type_id: engineering_analysis_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4
    verification_status: source_supported
  - id: 935
    name: HSI접근_U
    desc: HSI approach / human rating or human factors plan (updated)
    term: HSI
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: hsi_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
  - id: 936
    name: PDR검토자료(Review_Package)_F
    desc: PDR technical review package (incl. lower-level PDR closure and prior action items)
    term: Review_Package
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.80, p.82
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.80
    - source_key: dod_se_guidebook_2022
      locator: p.82
    verification_status: source_supported
  - id: 937
    name: PDR회의록_F
    desc: PDR minutes with RID/RFA dispositions and corrective action plans
    term: PDR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.83
    template: 없음
    artifact_type_id: review_minutes_pdr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.83
    verification_status: source_supported
  - id: 938
    name: PDR결과보고서_F
    desc: PDR review result report / assessment (allocated baseline evidence, TPM status)
    term: PDR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, p.38 §5.2.2.2.d; DoD SE Guidebook 2022 p.83-84
    template: 없음
    artifact_type_id: review_result_report_pdr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: nasa_npr_7123_1d
      locator: p.38 §5.2.2.2.d
    - source_key: dod_se_guidebook_2022
      locator: p.83-84
    verification_status: source_supported
- code: 120
  name: CDR
  desc: 상세설계검토 (Critical Design Review)
  tasks:
  - id: 1201
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1202
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1203
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1204
    name: 제품형상식별서(PCI)_F
    desc: Initial product baseline configuration identification (build-to/code-to documentation under configuration control)
    term: PCI
    source: NASA NPR 7123.1D p.38 §5.2.2.2.e [SE-46], Table G-7; DoD SE Guidebook 2022 p.84, p.88
    template: 없음
    artifact_type_id: pci
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.38 §5.2.2.2.e [SE-46]
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: p.84
    - source_key: dod_se_guidebook_2022
      locator: p.88
    - source_key: dod_se_guidebook_2022
      locator: p.132-133
    verification_status: source_supported
  - id: 1205
    name: 체계-부체계설계기술서(SSDD)_F
    desc: System/Subsystem Design Description (final, detailed design)
    term: SSDD
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: ssdd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
  - id: 1206
    name: 하드웨어설계기술서(HDD)_F
    desc: Hardware design description (final)
    term: HDD
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: hdd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
  - id: 1207
    name: 소프트웨어설계기술서(SDD)_F
    desc: Software design description (final, code-to)
    term: SDD
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: sdd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    verification_status: source_supported
  - id: 1208
    name: 인터페이스설계기술서(IDD)+ICD갱신_F
    desc: Interface design descriptions and updated ICDs (mature for fabrication/integration/test)
    term: IDD
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: idd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    verification_status: source_supported
  - id: 1209
    name: 데이터베이스설계기술서(DBDD)_F
    desc: Database design description (where a database CSCI exists)
    term: DBDD
    source: DoD SE Guidebook 2022 Table 3-5 p.87; NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: dbdd
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    verification_status: source_supported
  - id: 1210
    name: 제작도면(Drawings)_F
    desc: Engineering drawings (production-representative; 75-90% complete, 100% for critical/safety items)
    term: Drawings
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 p.86, p.89
    template: 없음
    artifact_type_id: drawings
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: p.86
    - source_key: dod_se_guidebook_2022
      locator: p.89
    verification_status: source_supported
  - id: 1211
    name: 기계3D모델(3D_Model)_F
    desc: 3D mechanical model / production model (final)
    term: 3D_Model
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: mechanical_model
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
  - id: 1212
    name: 자재명세서(BOM)_F
    desc: Bill of materials / materials list with critical parts identified
    term: BOM
    source: NASA NPR 7123.1D Table G-7, Table G-8; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: bom
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
  - id: 1213
    name: 요구사항추적표(RTM)_U
    desc: Requirements traceability matrix (functional, allocated, product baselines)
    term: RTM
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: rtm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
  - id: 1214
    name: 기술자료묶음(TDP)_D
    desc: 'Technical data package (initial: schematics, specs, ICDs, engineering analyses, spares list)'
    term: TDP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86, p.96
    template: 없음
    artifact_type_id: tdp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    - source_key: dod_se_guidebook_2022
      locator: p.96
    verification_status: source_supported
  - id: 1215
    name: 제조계획서(MFG_Plan)_F
    desc: 'Manufacturing plan: critical manufacturing processes, process control plans, tooling and fabrication/assembly plans'
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-6, Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: manufacturing_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    verification_status: source_supported
  - id: 1216
    name: 개발시험계획서(DT_Plan)_F
    desc: Development / qualification test plan (baselined)
    term: DT_Plan
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: dt_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    verification_status: source_supported
  - id: 1217
    name: 개발시험절차서(DT_Proc)_D
    desc: Development / qualification test procedures (draft)
    term: DT_Proc
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: dt_procedure
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
  - id: 1218
    name: 수락시험계획서(ATP)_F
    desc: Acceptance test plan and acceptance criteria (ready to baseline)
    term: ATP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-7 p.94
    template: 없음
    artifact_type_id: atp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    verification_status: source_supported
  - id: 1219
    name: TEMP_U
    desc: Test and evaluation master plan / V&V plan (updated)
    term: TEMP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: temp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
  - id: 1220
    name: VCRM_U
    desc: Verification cross-reference matrix (updated to product baseline)
    term: VCRM
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: vcrm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
  - id: 1221
    name: 소프트웨어시험기술서(STD)_D
    desc: Software test description / test cases (draft)
    term: STD
    source: DoD SE Guidebook 2022 Table 3-5 p.87; NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: std
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    verification_status: source_supported
  - id: 1222
    name: 통합계획서(Integration)_U
    desc: Integration plan (updated)
    term: Integration
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: integration_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
  - id: 1223
    name: 설계FMECA-신뢰성분석_F
    desc: Design FMECA / reliability analyses and R&M estimate (updated); R&M plan updated
    term: FMECA
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: fmeca
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
  - id: 1224
    name: 체계-부체계안전분석서(Safety)_F
    desc: System and subsystem safety analyses with associated verifications (baselined)
    term: Safety
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: system_safety_analysis
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
  - id: 1225
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated; mitigations in IMS)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87, p.88
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    - source_key: dod_se_guidebook_2022
      locator: p.88
    verification_status: source_supported
  - id: 1226
    name: TPM현황-자원여유도_U
    desc: TPM status, technical resource budgets and margins (updated)
    term: TPM
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 p.89
    template: 없음
    artifact_type_id: tpm_list
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: p.89
    verification_status: source_supported
  - id: 1227
    name: TRA_U
    desc: Technology readiness assessment (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 p.112
    template: 없음
    artifact_type_id: tra_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: p.112
    verification_status: source_supported
  - id: 1228
    name: 부품관리-단종관리,부품목록(Parts_Plan)_U
    desc: Parts list and parts management / DMSMS status (EEE parts selected)
    term: Parts_Plan
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: registered_parts_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
  - id: 1229
    name: 장납기조달계획(Long_Lead)_U
    desc: Long-lead procurement plan and supply chain assessment
    term: Long_Lead
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: long_lead_list
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
  - id: 1230
    name: 공학해석보고서(Analysis)_F
    desc: Engineering analysis reports (loads/stress/thermal/EMC/fracture; material properties; M&S results)
    term: Analysis
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: engineering_analysis_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
  - id: 1231
    name: 핵심품목-단일고장점목록(CIL)_F
    desc: Critical items list (critical safety/application items, key product characteristics, single point failures)
    term: CIL
    source: DoD SE Guidebook 2022 Table 3-5 p.86-87; NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: critical_items_list
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    verification_status: source_supported
  - id: 1232
    name: 절충연구보고서(Trade_Study)_F
    desc: Trade study reports (detailed design trades, complete)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: trade_study
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
  - id: 1233
    name: 제조성숙도평가(MRA)_D
    desc: Manufacturing readiness / producibility assessment (pre-build)
    term: MRA
    source: DoD SE Guidebook 2022 Table 5-5 p.187-189, Table 3-5; NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: mra_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 5-5 p.187-189
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    verification_status: source_supported
  - id: 1234
    name: 품질보증계획(QAP)_U
    desc: Quality assurance plan / inspection plan (updated for fabrication)
    term: QAP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: qa_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    verification_status: source_supported
  - id: 1235
    name: 운용한계-제약및명령·텔레메트리목록(SSDD)_U
    desc: Operational limits and constraints; command/telemetry or control-interface list (as applicable)
    term: SSDD
    source: NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: ssdd
    evidence_level: general_se_guidance
    se_floor: context
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    verification_status: partially_supported
  - id: 1236
    name: SEMP_U
    desc: SEMP (updated)
    term: SEMP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: semp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
  - id: 1237
    name: IMS_U
    desc: 'Integrated master schedule (updated: fabrication, coding, integration, test critical path)'
    term: IMS
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: ims
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
  - id: 1238
    name: ILSP_U
    desc: Integrated logistics support plan / LCSP (updated with supportability features)
    term: ILS
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: ils_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
  - id: 1239
    name: 체계보안계획(PPP)_F
    desc: System security plan (baselined) / program protection plan updated; security controls identified
    term: PPP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87-88
    template: 없음
    artifact_type_id: security_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87-88
    verification_status: source_supported
  - id: 1240
    name: CDR검토자료(Review_Package)_F
    desc: CDR technical review package (incl. lower-level CDR integration, prior action closure)
    term: Review_Package
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
  - id: 1241
    name: CDR회의록_F
    desc: CDR minutes with RID/RFA dispositions and corrective action plans
    term: CDR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.88
    template: 없음
    artifact_type_id: review_minutes_cdr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.88
    verification_status: source_supported
  - id: 1242
    name: CDR결과보고서_F
    desc: CDR review result report / assessment (product baseline evidence, TPM status)
    term: CDR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, p.38 §5.2.2.2.e; DoD SE Guidebook 2022 p.88-89
    template: 없음
    artifact_type_id: review_result_report_cdr
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: nasa_npr_7123_1d
      locator: p.38 §5.2.2.2.e
    - source_key: dod_se_guidebook_2022
      locator: p.88-89
    verification_status: source_supported
- code: 150
  name: TRR_DT
  desc: 시험준비상태검토 및 개발시험 (Test Readiness Review / DT)
  tasks:
  - id: 1501
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1502
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1503
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1504
    name: 개발시험계획서(DT_Plan)_F
    desc: Development test plan (approved, with test objectives and cases)
    term: DT_Plan
    source: NASA NPR 7123.1D Table G-10; DoD SE Guidebook 2022 Table 3-5 p.87, p.67
    template: 없음
    artifact_type_id: dt_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    - source_key: dod_se_guidebook_2022
      locator: p.67
    verification_status: source_supported
  - id: 1505
    name: 개발시험절차서(DT_Proc)_F
    desc: Development test procedures (approved)
    term: DT_Proc
    source: NASA NPR 7123.1D Table G-10
    template: 없음
    artifact_type_id: dt_procedure
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
  - id: 1506
    name: 소프트웨어시험기술서(STD)_F
    desc: Software test description (final test cases/procedures)
    term: STD
    source: NASA NPR 7123.1D Table G-10
    template: 없음
    artifact_type_id: std
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
  - id: 1507
    name: 시험품as-built형상목록(As_Built)_F
    desc: As-built configuration list of item under test (HW/SW) released under configuration control
    term: As_Built
    source: NASA NPR 7123.1D Table G-10
    template: 없음
    artifact_type_id: as_built_config
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
  - id: 1508
    name: 버전기술서(VDD)_F
    desc: Version description document(s) for test article software and test/support systems
    term: VDD
    source: NASA NPR 7123.1D Table G-10
    template: 없음
    artifact_type_id: vdd
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
  - id: 1509
    name: 통합계획서및통합절차(Integration)_U
    desc: Integration plan (updated and approved) with integration procedures and workflow
    term: Integration
    source: NASA NPR 7123.1D Table G-9, p.38 [SE-47]
    template: 없음
    artifact_type_id: integration_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-47]
    verification_status: source_supported
  - id: 1510
    name: 하위시험결과보고서(DT)_D
    desc: Lower-tier verification results (unit, subsystem, qualification test reports; initial V&V results)
    term: DT
    source: NASA NPR 7123.1D Table G-9, p.38 [SE-48]; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: dt_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-48]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: source_supported
  - id: 1511
    name: 환경시험계획-절차(Env_Test)_F
    desc: Environmental / qualification test plan and procedures
    term: Env_Test
    source: NASA NPR 7123.1D Table G-9, Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: env_test
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
  - id: 1512
    name: ESS시험_F
    desc: Environmental stress screening plan/procedure (where applicable)
    term: ESS
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: ess_test
    evidence_level: general_se_guidance
    se_floor: context
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1513
    name: 인터페이스검증기록-VCRM_U
    desc: Interface verification records against ICDs (mechanical/electrical) and VCRM update
    term: VCRM
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: vcrm
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1514
    name: 결함-불일치목록(Discrepancy)_U
    desc: Discrepancy / deficiency log with dispositions and closure schedule
    term: Discrepancy
    source: NASA NPR 7123.1D Table G-9, Table G-10; DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: discrepancy_log
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: dod_se_guidebook_2022
      locator: p.95-96
    verification_status: source_supported
  - id: 1515
    name: 시험안전계획-취급안전요구(Safety)_U
    desc: Test safety plan / test hazard analysis and handling & safety requirements
    term: Safety
    source: NASA NPR 7123.1D Table G-10, Table G-9
    template: 없음
    artifact_type_id: system_safety_analysis
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1516
    name: TRR검토자료(Review_Package)_F
    desc: Test readiness package (test resources, facilities, GSE, instrumentation, personnel roles and training, test director designation)
    term: Review_Package
    source: NASA NPR 7123.1D Table G-10, Table G-9
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1517
    name: TEMP_U
    desc: Test and evaluation master plan / V&V plan (updated)
    term: TEMP
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: temp
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1518
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated; residual test risk accepted)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-10, Table G-9
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1519
    name: 운송-취급-포장지침(PHS_T)_F
    desc: Transportation, handling and packaging criteria/instructions (final)
    term: PHS_T
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: handling_transport_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1520
    name: 설계기술서-ICD_U
    desc: Design description and ICDs (updated to as-built for integration)
    term: ICD
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: icd
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1521
    name: IMS_U
    desc: 'Integrated master schedule (updated: component availability and test schedule)'
    term: IMS
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: ims
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
  - id: 1522
    name: 시험교훈수집계획(Lessons_Learned)_D
    desc: Lessons learned capture plan for test (initial log)
    term: Lessons_Learned
    source: NASA NPR 7123.1D Table G-10
    template: 없음
    artifact_type_id: lessons_learned
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
  - id: 1523
    name: TRR회의록_F
    desc: TRR minutes with test authorization and RID/action dispositions
    term: TRR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1, Table G-10
    template: 없음
    artifact_type_id: review_minutes_trr
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
  - id: 1524
    name: TRR결과보고서_F
    desc: TRR review result report
    term: TRR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1
    template: 없음
    artifact_type_id: review_result_report_trr
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    verification_status: partially_supported
- code: 180
  name: FCA_OT
  desc: 기능형상확인 및 운용시험 (Functional Configuration Audit / OT)
  tasks:
  - id: 1801
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1802
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1803
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 1804
    name: 개발시험결과보고서-검증결과(DT)_F
    desc: Development test report(s) / verification results (all spec requirements verified by A/D/E/T and documented)
    term: DT
    source: NASA NPR 7123.1D Table G-11, Table G-12 [SE-69]; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: dt_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: nasa_npr_7123_1d
      locator: Table G-12 [SE-69]
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: source_supported
  - id: 1805
    name: 소프트웨어시험결과보고서(STR)_F
    desc: Software test report (CSCI verification against SRS/IRS)
    term: STR
    source: DoD SE Guidebook 2022 p.90; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: str
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.90
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
  - id: 1806
    name: VCRM완료본_F
    desc: Verification cross-reference matrix completed (requirement-to-evidence compliance matrix)
    term: VCRM
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91, p.90
    template: 없음
    artifact_type_id: vcrm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    - source_key: dod_se_guidebook_2022
      locator: p.90
    verification_status: source_supported
  - id: 1807
    name: 요구사항추적표(RTM)_F
    desc: Requirements traceability matrix (final, requirement to verification evidence)
    term: RTM
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: rtm
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: source_supported
  - id: 1808
    name: 기능형상감사계획서(FCA_Plan)_F
    desc: Functional configuration audit plan
    term: FCA_Plan
    source: DoD SE Guidebook 2022 §3.6, p.89-91
    template: 없음
    artifact_type_id: fca_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §3.6
    - source_key: dod_se_guidebook_2022
      locator: p.89-91
    verification_status: partially_supported
  - id: 1809
    name: 기능형상감사점검표(FCA_Checklist)_F
    desc: Functional configuration audit checklist
    term: FCA_Checklist
    source: DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: fca_checklist
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: partially_supported
  - id: 1810
    name: 기능형상감사결과보고서(FCA)_F
    desc: Functional configuration audit report (functional/allocated baseline verified)
    term: FCA
    source: DoD SE Guidebook 2022 p.91; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: fca_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.91
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
  - id: 1811
    name: 운용시험계획(발주처주관(OT_Plan)_F
    desc: 'Operational test support: OT plan input / OT readiness evidence'
    term: OT_Plan
    source: DoD SE Guidebook 2022 Table 3-6 p.91; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: ot_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
  - id: 1812
    name: 운용시험결과보고서(OT)_F
    desc: Operational test / validation results report
    term: OT
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91, p.95
    template: 없음
    artifact_type_id: ot_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    - source_key: dod_se_guidebook_2022
      locator: p.95
    verification_status: source_supported
  - id: 1813
    name: RAM평가보고서_F
    desc: R&M assessment report (achieved R&M vs contractual specification)
    term: RAM
    source: DoD SE Guidebook 2022 Table 3-6 p.91; NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: ram_assessment_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    verification_status: source_supported
  - id: 1814
    name: As-built형상문서(As_Built)_F
    desc: As-built configuration documentation (HW/SW) baselined; product baseline for initial production
    term: As_Built
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: as_built_config
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: source_supported
  - id: 1815
    name: TDP_U
    desc: Technical data package (updated with all test results)
    term: TDP
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 p.90
    template: 없음
    artifact_type_id: tdp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: p.90
    verification_status: source_supported
  - id: 1816
    name: 수락자료묶음(ADP)_F
    desc: Acceptance data package / certificate of conformance evidence
    term: ADP
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-7 p.94, p.91
    template: 없음
    artifact_type_id: acceptance_data_package
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: dod_se_guidebook_2022
      locator: p.91
    verification_status: source_supported
  - id: 1817
    name: 결함-면제·일탈현황(Discrepancy)_U
    desc: Discrepancy / deficiency and waiver-deviation status (closed or planned)
    term: Discrepancy
    source: NASA NPR 7123.1D Table G-11, Table G-12; DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: discrepancy_log
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: p.95-96
    verification_status: source_supported
  - id: 1818
    name: 위험목록(Risk_Register)_U
    desc: Risk register (residual risks accepted before initial production)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: source_supported
  - id: 1819
    name: 보안통제검증보고서(SAR)_F
    desc: Security assessment / cybersecurity controls verification report
    term: SAR
    source: DoD SE Guidebook 2022 p.90, Table 3-5 p.88
    template: 없음
    artifact_type_id: security_assessment_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.90
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: partially_supported
  - id: 1820
    name: 소프트웨어제품명세서(VDD)_D
    desc: Software product specification / executable and source baseline (preliminary)
    term: VDD
    source: DoD SE Guidebook 2022 p.90, p.96; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: vdd
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.90
    - source_key: dod_se_guidebook_2022
      locator: p.96
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
  - id: 1821
    name: 개발결과보고서(Final_Report)_D
    desc: System development result report (development completion evidence, preliminary)
    term: Final_Report
    source: DoD SE Guidebook 2022 Table 3-6 p.91; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: dev_result_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
  - id: 1822
    name: 운송-취급-점검절차(PHS_T)_F
    desc: Shipping, handling, checkout and operational plans/procedures (safety-cleared)
    term: PHS_T
    source: NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: handling_transport_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: partially_supported
  - id: 1823
    name: IMS_U
    desc: Plan and schedule to PRR/PCA (resourced)
    term: IMS
    source: DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: ims
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: partially_supported
  - id: 1824
    name: 교훈기록(Lessons_Learned)_U
    desc: Lessons learned log (captured through verification)
    term: Lessons_Learned
    source: NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: lessons_learned
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: partially_supported
  - id: 1825
    name: FCA검토자료(Review_Package)_F
    desc: FCA/SVR technical review package
    term: Review_Package
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 p.90
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: p.90
    verification_status: source_supported
  - id: 1826
    name: FCA회의록_F
    desc: FCA/SVR minutes with dispositions
    term: FCA_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 Table 3-7 p.94
    template: 없음
    artifact_type_id: review_minutes_fca
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    verification_status: source_supported
  - id: 1827
    name: FCA결과보고서_F
    desc: FCA/SVR review result report (verified functional/allocated baseline; authorization for acceptance/initial production)
    term: FCA_결과보고서
    source: NASA NPR 7123.1D Table G-11, p.40 §5.2.3.1; DoD SE Guidebook 2022 p.91
    template: 없음
    artifact_type_id: review_result_report_fca
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.91
    verification_status: source_supported
- code: 210
  name: PCA
  desc: 물리적형상확인 및 생산·인도 준비 (Physical Configuration Audit / PRR)
  tasks:
  - id: 2101
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 2102
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 2103
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 2104
    name: 물리형상감사계획서(PCA_Plan)_F
    desc: Physical configuration audit plan
    term: PCA_Plan
    source: DoD SE Guidebook 2022 §3.8, p.95-97
    template: 없음
    artifact_type_id: pca_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §3.8
    - source_key: dod_se_guidebook_2022
      locator: p.95-97
    verification_status: partially_supported
  - id: 2105
    name: 물리형상감사점검표(PCA_Checklist)_F
    desc: Physical configuration audit checklist
    term: PCA_Checklist
    source: DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: pca_checklist
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.95-96
    verification_status: partially_supported
  - id: 2106
    name: 물리형상감사결과보고서(PCA)_F
    desc: Physical configuration audit report (final product baseline verified)
    term: PCA
    source: DoD SE Guidebook 2022 p.97; NASA NPR 7123.1D Table G-12
    template: 없음
    artifact_type_id: pca_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.97
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    verification_status: source_supported
  - id: 2107
    name: 제품형상식별서(PCI)_F
    desc: Final product baseline configuration identification (as-built, OT-validated item)
    term: PCI
    source: DoD SE Guidebook 2022 Table 3-8 p.97, p.133; NASA NPR 7123.1D Table G-12, Table G-11
    template: 없음
    artifact_type_id: pci
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-8 p.97
    - source_key: dod_se_guidebook_2022
      locator: p.133
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
  - id: 2108
    name: 제작도면(Drawings)_F
    desc: Engineering drawings / production models approved and certified (as-built, redlines incorporated)
    term: Drawings
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: drawings
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: p.95-96
    verification_status: source_supported
  - id: 2109
    name: BOM-예비품목록_F
    desc: Bill of materials with critical parts and spares provisioning list (final)
    term: BOM
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-7 p.94
    template: 없음
    artifact_type_id: bom
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    verification_status: source_supported
  - id: 2110
    name: TDP_F
    desc: Technical data package (final, transferred per contract)
    term: TDP
    source: DoD SE Guidebook 2022 p.96; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: tdp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.96
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    verification_status: source_supported
  - id: 2111
    name: 생산계획서(MFG_Plan)_F
    desc: Production plan (critical process controls, control limits, procedures, tooling/test equipment, delivery schedule)
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-7 p.93-94
    template: 없음
    artifact_type_id: manufacturing_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.93-94
    verification_status: source_supported
  - id: 2112
    name: 수락시험절차-장비(ATP)_F
    desc: Acceptance test procedures and acceptance test equipment (validated, under CM)
    term: ATP
    source: DoD SE Guidebook 2022 Table 3-7 p.94; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: atp
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    verification_status: source_supported
  - id: 2113
    name: 생산품질-검사계획(QAP)_F
    desc: Quality / inspection plan for production (in-process and end-item inspections)
    term: QAP
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-7 p.94, Table 3-8 p.97
    template: 없음
    artifact_type_id: qa_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: dod_se_guidebook_2022
      locator: Table 3-8 p.97
    verification_status: source_supported
  - id: 2114
    name: 제조성숙도평가-생산준비검토보고서(MRA)_F
    desc: Manufacturing readiness assessment / PRR report
    term: MRA
    source: DoD SE Guidebook 2022 p.94, Table 5-5 p.187-189; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: mra_report
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.94
    - source_key: dod_se_guidebook_2022
      locator: Table 5-5 p.187-189
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    verification_status: source_supported
  - id: 2115
    name: 고장보고·분석·시정조치(FRACAS)기록_F
    desc: Failure reporting, analysis and corrective action system (FRACAS) records
    term: FRACAS
    source: DoD SE Guidebook 2022 Table 3-7 p.94; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: fracas_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    verification_status: source_supported
  - id: 2116
    name: 면제-일탈및결함종결대장(Waiver)_F
    desc: Waiver / deviation and deficiency closure register (all closed or incorporated)
    term: Waiver
    source: NASA NPR 7123.1D Table G-12; DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: waiver_deviation_log
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: p.95-96
    verification_status: source_supported
  - id: 2117
    name: 운용-정비기술교범(Tech_Manual)_F
    desc: Operator and maintenance technical manuals / operations documentation (verified and approved)
    term: Tech_Manual
    source: NASA NPR 7123.1D Table G-12; DoD SE Guidebook 2022 p.96, Table 3-5 p.88
    template: 없음
    artifact_type_id: tech_manual
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: p.96
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
  - id: 2118
    name: 교육훈련자료-이수기록(Training)_F
    desc: Training materials and training completion records
    term: Training
    source: NASA NPR 7123.1D Table G-12; DoD SE Guidebook 2022 Table 3-7 p.94, Table 3-8 p.97
    template: 없음
    artifact_type_id: training_material
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: dod_se_guidebook_2022
      locator: Table 3-8 p.97
    verification_status: source_supported
  - id: 2119
    name: 소프트웨어제품명세서-버전기술서(VDD)_F
    desc: Software product specification (final) and version description document (delivered build)
    term: VDD
    source: DoD SE Guidebook 2022 p.96; NASA NPR 7123.1D Table G-12
    template: 없음
    artifact_type_id: vdd
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.96
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    verification_status: source_supported
  - id: 2120
    name: ILSP_F
    desc: Integrated logistics support plan / sustainment plan (final; sustaining planning complete)
    term: ILS
    source: NASA NPR 7123.1D Table G-11, Table G-12; DoD SE Guidebook 2022 Table 3-8 p.97
    template: 없음
    artifact_type_id: ils_plan
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: Table 3-8 p.97
    verification_status: source_supported
  - id: 2121
    name: 생산-납품IMS_U
    desc: Production / delivery integrated master schedule
    term: IMS
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-7 p.94, Table 3-8 p.97
    template: 없음
    artifact_type_id: ims
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: dod_se_guidebook_2022
      locator: Table 3-8 p.97
    verification_status: source_supported
  - id: 2122
    name: 위험목록(Risk_Register)_U
    desc: Risk register (production and deployment risks; low enough for FRP)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-8, Table G-12; DoD SE Guidebook 2022 Table 3-7 p.93, Table 3-8 p.97
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.93
    - source_key: dod_se_guidebook_2022
      locator: Table 3-8 p.97
    verification_status: source_supported
  - id: 2123
    name: 국방규격(Spec_Draft)_D
    desc: Product specification set for procurement / defense specification draft (from final product baseline)
    term: Spec_Draft
    source: DoD SE Guidebook 2022 p.132-133, p.95
    template: 없음
    artifact_type_id: defense_spec_draft
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.132-133
    - source_key: dod_se_guidebook_2022
      locator: p.95
    verification_status: partially_supported
  - id: 2124
    name: 현장인수-설치점검시험보고서(SAT)_F
    desc: Site acceptance / installation and checkout test report (enabling products delivered/installed)
    term: SAT
    source: NASA NPR 7123.1D Table G-12
    template: 없음
    artifact_type_id: sat_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    verification_status: partially_supported
  - id: 2125
    name: 보안-보호계획(PPP)_U
    desc: System security / protection plan (updated for deployment)
    term: PPP
    source: NASA NPR 7123.1D Table G-12; DoD SE Guidebook 2022 p.216
    template: 없음
    artifact_type_id: security_plan
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: p.216
    verification_status: source_supported
  - id: 2126
    name: 개발결과보고서(Final_Report)_F
    desc: System development result report (final)
    term: Final_Report
    source: NASA NPR 7123.1D Table G-12; DoD SE Guidebook 2022 p.97
    template: 없음
    artifact_type_id: dev_result_report
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: p.97
    verification_status: source_supported
  - id: 2127
    name: PCA-PRR검토자료(Review_Package)_F
    desc: PCA/PRR technical review package
    term: Review_Package
    source: NASA NPR 7123.1D Table G-8, Table G-12; DoD SE Guidebook 2022 Table 3-7 p.94, Table 3-8 p.97
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: dod_se_guidebook_2022
      locator: Table 3-8 p.97
    verification_status: source_supported
  - id: 2128
    name: PCA-PRR회의록_F
    desc: PCA/PRR minutes with dispositions
    term: PCA_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.94, p.97
    template: 없음
    artifact_type_id: review_minutes_pca
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.94
    - source_key: dod_se_guidebook_2022
      locator: p.97
    verification_status: source_supported
  - id: 2129
    name: PCA-PRR결과보고서_F
    desc: PCA/PRR review result report (final product baseline established; production go-ahead)
    term: PCA_결과보고서
    source: NASA NPR 7123.1D Table G-8, p.40 §5.2.3.1; DoD SE Guidebook 2022 p.94, p.97
    template: 없음
    artifact_type_id: review_result_report_pca
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.94
    - source_key: dod_se_guidebook_2022
      locator: p.97
    verification_status: source_supported
- code: 240
  name: LL
  desc: 사업 종결 및 교훈 정리 (Closeout and lessons learned)
  tasks:
  - id: 2401
    name: INBOX_분류전
    desc: 분류 안 된 일정·산출물 임시 보관
    term: INBOX
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 2402
    name: LOG_의사결정조치기록
    desc: 회의록, 공문, 액션아이템 등 의사결정 및 조치 기록
    term: LOG
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: log
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 2403
    name: TDP_기술자료
    desc: 주고받은 기술자료 패키지
    term: TDP
    source: 내부관리
    template: 없음
    is_fixed: true
    artifact_type_id: tdp_exchange
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
  - id: 2404
    name: 교훈보고서(Lessons_Learned)_F
    desc: Lessons learned report (development, test, production, review process)
    term: Lessons_Learned
    source: NASA NPR 7123.1D Table G-4, Table G-10
    template: 없음
    artifact_type_id: lessons_learned
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: nasa_npr_7123_1d
      locator: Table G-11 and G-12
    verification_status: partially_supported
  - id: 2405
    name: 검토조치사항종결대장(Action_Log)_F
    desc: Action item / RID-RFA closure log across all reviews (final)
    term: Action_Log
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.75, p.87
    template: 없음
    artifact_type_id: action_item_log
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.75
    - source_key: dod_se_guidebook_2022
      locator: p.87
    - source_key: dod_se_guidebook_2022
      locator: p.94
    verification_status: source_supported
  - id: 2406
    name: 자료납품종결확인(CDRL)_F
    desc: CDRL delivery closeout / data transfer receipt (TDP, baselines, manuals delivered)
    term: CDRL
    source: DoD SE Guidebook 2022 p.96; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: cdrl
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.96
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
  - id: 2407
    name: 위험목록종결본(Risk_Register)_F
    desc: Risk register closeout (final status, transferred risks)
    term: Risk_Register
    source: NASA NPR 7123.1D Tables G-1..G-12; DoD SE Guidebook 2022 p.17
    template: 없음
    artifact_type_id: risk_register
    evidence_level: general_se_guidance
    se_floor: context
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Tables G-1..G-12
    - source_key: dod_se_guidebook_2022
      locator: p.17
    verification_status: source_supported
  - id: 2408
    name: TPM최종추이요약_F
    desc: Final TPM / leading-indicator trend summary
    term: TPM
    source: NASA NPR 7123.1D Tables G-2, G-5..G-9; DoD SE Guidebook 2022 p.83, p.89
    template: 없음
    artifact_type_id: tpm_list
    evidence_level: general_se_guidance
    se_floor: context
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Tables G-2, G-5..G-9
    - source_key: dod_se_guidebook_2022
      locator: p.83
    - source_key: dod_se_guidebook_2022
      locator: p.89
    verification_status: source_supported
  - id: 2409
    name: 종결검토결과보고서_F
    desc: Closeout review minutes / result report (if a closeout meeting is held)
    term: 종결_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1
    template: 없음
    artifact_type_id: review_result_report_240_LL
    evidence_level: general_se_guidance
    se_floor: context
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    verification_status: partially_supported
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

- 이 문서의 YAML(위)을 파싱해서 발주처·국가에 종속되지 않는 일반 체계공학(SE) 기준선 폴더 트리를 생성한다.
- 계층 ①(generic SE baseline)이다. "체계공학 기반으로 개발한다면 각 기술검토 전에 최소한 이것은 만들어 두어야 한다"는 바닥선만 담고,
  특정 국가 조달 규정·발주처 계약·주계약사 품질게이트는 담지 않는다. 그 계층은 이 기준선 위에 overlay 로 얹는다.
- 근거: NASA NPR 7123.1D (2023) 부록 G 기술검토 진입·성공 기준과 5.2 절 산출물, DoD Systems Engineering Guidebook (2022) §3 기술검토 기준.
  NASA SE Handbook SP-2016-6105 Rev2 6.7 은 추출만 되어 있고 행에는 아직 반영되지 않았다(도출 기록 §6). 규정이 아니라 지침이므로 evidence_level 은 `general_se_guidance` 이며,
  컴파일러에서 `present_or_not_applicable`(있거나, 근거를 들어 해당없음) 로 내려간다.
- `se_floor` 의미: `must_have` = 두 출처가 모두 그 단계 산출물로 열거하거나 NASA 가 required(**) 로 표기, `should_have` = 한 출처만 열거,
  `context` = 발주처 소유 입력이거나 임무 특화라서 계약자가 만들지 않을 수 있는 항목. `context` 행만 engine requirement 에서 빠진다.
- `maturity` 는 그 게이트에서 기대되는 성숙도(preliminary/updated/baseline/final)이며 폴더명 접미사 `_D/_U/_F` 와 짝을 이룬다.
  같은 산출물이 게이트마다 반복되는 것은 중복이 아니라 성숙도 진행을 게이트별로 점검하기 위한 것이다.
- 출처 인용은 표 번호와 페이지 마커만 남긴다(`Table G-4`, `Table 3-2 p.72`). 원문 문장·파일 경로·사업명은 이 공개 파일에 넣지 않는다.
- 검토 회의록/결과보고서는 공유 어휘의 `review_minutes_*` / `review_result_report_*` 토큰을 쓴다. 240_LL 종결 검토는 두 출처 어디에도
  전용 게이트가 없어 `context` 행으로만 남겼고 어휘 토큰이 없다(컴파일러에서 unmapped context 로 유지).
- 국가·발주처 계층과의 관계: 같은 산출물은 같은 `artifact_type_id` 로 만난다. 예를 들어 특정 국가 조달 규정 트리의 `ssrs`·`icd`·`temp` 행은
  이 기준선의 같은 토큰 행과 대응하며, 계약 고유 항목만 overlay 의 `add`(evidence_level `prime_contract`)로 추가된다.
- 000_REF 는 이 스펙에서 정적 참고 폴더가 아니라 실제 게이트다(발주처가 제공하는 소요/운용개념/대안분석/기술성숙도 입력). 따라서
  `generation_rules.static_folders` 에는 000_REF 하위 고정 폴더를 두지 않는다.
