---
title: 일반 체계공학 기준선 폴더 트리 생성 지침 (발주처·국가 무관)
version: '0.4'
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 4
    name: 소요-작전운용성능참조문서(ORD)_F
    desc: Buyer capability / operational requirements reference (ROC/ORD/CDD equivalent) with mission goals and MOEs
    term: ORD
    source: NASA NPR 7123.1D Table G-3, p.37 §5.2.2.2.a [SE-35..SE-37]; DoD SE Guidebook 2022 Table 3-1 p.69, Table 3-4 p.81
    template: 없음
    artifact_type_id: ord
    purpose_ko: '이해관계자 요구의 권위 있는 출처가 되는 소요 문서로, 기존·미래 작전의 능력 공백 분석을 거쳐 검증되고 우선순위가 정해진 능력 소요를 담는다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.2.1 (p.143)'
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
    gate_role: supporting
  - id: 5
    name: 운용개념서초안(CONOPS)_D
    desc: Concept of Operations (draft) / operational mode summary and mission profile
    term: CONOPS
    source: NASA NPR 7123.1D Table G-3, Table G-4; DoD SE Guidebook 2022 p.68, Table 3-1 p.69
    template: 없음
    artifact_type_id: conops
    purpose_ko: '운용개념서는 시스템이 이해관계자 기대를 충족하도록 어떻게 사용될지를 시간 순으로 기술해 시스템 목표 이해를 돕고, 사용자 관련 요구사항과 아키텍처 개발을 촉발하며, 후속 정의문서의 기초이자 장기 운용계획의 토대가 된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.222 (printed p.209) App B Glossary ''Concept of Operations'''
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.71 (printed p.58) §4.1.1.2.4'
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
    gate_role: supporting
  - id: 6
    name: 대안분석-개념절충연구기록(Trade_Study)_D
    desc: Alternatives / concept trade study record (AoA-type)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-3; DoD SE Guidebook 2022 p.68, Table 3-1 p.69
    template: 없음
    artifact_type_id: trade_study
    purpose_ko: '체계 아키텍처와 운용개념, 설계 결정이 가용 자원으로 달성 가능한 최선의 해로 나아가게 하는 것이 목적이며, 보고서에는 대안·측도·자료원·계산결과·선정규칙과 권고 대안을 담는다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.94 (printed p.81) §4.4.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.247 (printed p.234) App B Glossary (Trade Study Report)'
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
    gate_role: supporting
  - id: 7
    name: 기술성숙도평가-기술성숙화계획초안(TRA)_D
    desc: Technology readiness assessment / technology maturation (development) plan (initial)
    term: TRA
    source: NASA NPR 7123.1D Table G-3, p.36 §5.1.6; DoD SE Guidebook 2022 Table 3-1 p.69
    template: 없음
    artifact_type_id: tra_report
    purpose_ko: '체계·부체계·구성품에 요구되는 기술 성숙도를 시험과 해석으로 입증해 기록하는 보고서로, 그 성숙도평가 결과는 기술개발계획 수립과 대안 경로·대체안·성능 축소안 식별에 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.260 (printed p.247) App G §G.1'
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 304
    name: 체계요구사항명세서(SSS)_F
    desc: System/Subsystem Specification (system performance / system requirements specification) ready to baseline
    term: SSS
    source: NASA NPR 7123.1D Table G-4, p.38 §5.2.2.2.b [SE-39]; DoD SE Guidebook 2022 Table 3-2 p.72
    template: 없음
    artifact_type_id: sss
    purpose_ko: '요구사항 분석 결과와 배분된 요구를 담아 계약에 반영되는 체계 성능 규격으로, 요구가 현실적임을 확인받아 예비설계의 건전한 기술적 토대를 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§3.3 (p.74)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.2.2 (p.143)'
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 305
    name: 운용개념서(CONOPS)_U
    desc: Concept of Operations / operations concept (updated)
    term: CONOPS
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-1 p.69, p.68
    template: 없음
    artifact_type_id: conops
    purpose_ko: '운용개념서는 시스템이 이해관계자 기대를 충족하도록 어떻게 사용될지를 시간 순으로 기술해 시스템 목표 이해를 돕고, 사용자 관련 요구사항과 아키텍처 개발을 촉발하며, 후속 정의문서의 기초이자 장기 운용계획의 토대가 된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.222 (printed p.209) App B Glossary ''Concept of Operations'''
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.71 (printed p.58) §4.1.1.2.4'
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
    depends_on:
    - act_stakeholder_expectations
    - act_validation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.2.1-§3.2.2.3 (p.24)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.66-75 (printed p.53-62) §4.1.1.1/§4.1.1.3, Figure 4.1-1
    depends_on_origin: canonical
    gate_role: entry
  - id: 306
    name: 체계공학관리계획서(SEMP)_F
    desc: Systems Engineering Management Plan (SEMP) ready to baseline
    term: SEMP
    source: NASA NPR 7123.1D Table G-4, p.37 §5.2.2.2.b [SE-38]; DoD SE Guidebook 2022 Table 3-2 p.72, p.17
    template: 없음
    artifact_type_id: semp
    purpose_ko: '프로젝트 기술·공학 활동의 기반 문서로, 어떤 기술과정을 어떻게 적용하고 조직과 자원을 어떻게 갖출지 규정하며 각 수명주기 단계의 진입·성공 기준을 충족하는 작업산출물 실현의 틀을 제공한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.282 (printed p.269) App J §J.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.155 (printed p.142) §6.1.1.2.4'
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
    gate_role: entry
  - id: 307
    name: 요구사항추적표(RTM)_D
    desc: 'Requirements traceability matrix (bidirectional: buyer requirement - SOW - system spec)'
    term: RTM
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.72, p.71
    template: 없음
    artifact_type_id: rtm
    purpose_ko: '요구사항의 양방향 추적성을 기록하는 표로, 각 요구가 상위 요구를 온전히 충족하는지 점검하고 충족되지 않은 부분을 보완해 넣으며 부모 없는 요구를 걸러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.165 (printed p.152) §6.2.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.163 (printed p.150) §6.2'
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
    depends_on:
    - act_requirements_analysis
    - act_stakeholder_expectations
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    depends_on_origin: canonical
    gate_role: core
  - id: 308
    name: 외부인터페이스통제문서(ICD)_D
    desc: External interface identification and preliminary external ICDs
    term: ICD
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72
    template: 없음
    artifact_type_id: icd
    purpose_ko: '인터페이스 통제문서는 인터페이스 정보와 승인된 인터페이스 변경요청을 식별·수록하는 문서로, 형상관리로 유지·승인되어 기술자료묶음의 일부가 되며 제품검증·확인 과정의 입력으로 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.172 (printed p.159) §6.3.1.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.171 (printed p.158) §6.3.1.2.3'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.72
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_integration
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: canonical
    gate_role: core
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: core
  - id: 310
    name: 위험관리계획서(RMP)_F
    desc: Risk management plan
    term: RMP
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 p.17, Table 3-2 p.72
    template: 없음
    artifact_type_id: risk_management_plan
    purpose_ko: '기술기획 과정에서 작성하는 문서로, 프로젝트 안에서 위험을 어떻게 식별·완화·감시·통제할지를 규정하며 기술위험관리 과정의 입력이 된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.176 (printed p.163) §6.4.1.1'
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
    gate_role: entry
  - id: 311
    name: 위험목록(Risk_Register)_U
    desc: Risk register / risk assessment with mitigation plans (technical, safety, security, cost, schedule)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.72
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
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
    gate_role: core
  - id: 312
    name: 형상관리계획서(CMP)_F
    desc: Configuration management plan
    term: CMP
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.73, p.134
    template: 없음
    artifact_type_id: cm_plan
    purpose_ko: '형상관리계획서는 사업 전체 형상관리 절차의 전략계획으로, 내부적으로는 CM 활동과 일정을 안내·감시·측정하고 외부적으로는 계약자에게 CM 절차를 전달해 일관된 절차와 협업관계를 세우며, 각 기술 기준선 생성·기술승인·감사의 기준을 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.182 (printed p.169) §6.5.1.2.1'
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
    gate_role: entry
  - id: 313
    name: 기술성숙도평가-기술성숙화계획(TRA)_U
    desc: Technology readiness assessment and technology maturation plan (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.73
    template: 없음
    artifact_type_id: tra_report
    purpose_ko: '체계·부체계·구성품에 요구되는 기술 성숙도를 시험과 해석으로 입증해 기록하는 보고서로, 그 성숙도평가 결과는 기술개발계획 수립과 대안 경로·대체안·성능 축소안 식별에 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.260 (printed p.247) App G §G.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    verification_status: source_supported
    gate_role: entry
  - id: 314
    name: 통합일정(IMS)-WBS_D
    desc: Integrated master schedule / WBS with critical path (resourced) and cost basis
    term: IMS
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72-73, p.108-109
    template: 없음
    artifact_type_id: ims
    purpose_ko: '발주·계약자·하도급 활동을 포함한 전체 작업 범위를 일정·기간·선후관계로 기술한 문서로, 주공정과 이정표를 식별하고 계획 대비 진척 비교, 자원 분석, 위험 완화 추적의 기준을 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.106-107)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
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
    gate_role: supporting
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
    gate_role: entry
  - id: 316
    name: 예비체계안전분석서(Safety)_D
    desc: Preliminary system safety / hazard analysis
    term: Safety
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-1 p.69, Table 3-2 p.73
    template: 없음
    artifact_type_id: system_safety_analysis
    purpose_ko: '운용자·체계·환경·공중에 미치는 위험을 평가하기 위해 안전해석을 수행하며, 그 접근법과 방법은 체계공학관리계획의 체계안전 항목에 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.1'
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
    gate_role: entry
  - id: 317
    name: RAM계획서_F
    desc: Reliability / maintainability (R&M) program plan; safety and mission assurance plan
    term: RAM
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72-73, p.195-197
    template: 없음
    artifact_type_id: ram_plan
    purpose_ko: '신뢰도·정비도 공학이 체계공학 활동에 통합되도록 수명주기 전체를 다루는 계획으로, 각 요소가 비용효과적으로 수행·평가·보고되고 설계·해석·개발·시험·제조에 제때 통합되게 한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.196)'
    - source_key: dod_se_guidebook_2022
      locator: '§5.18 (p.194)'
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
    gate_role: supporting
  - id: 318
    name: 핵심성능지표(TPM)목록_D
    desc: 'Key driving requirements: MOP/TPM list with thresholds and margins'
    term: TPM
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.72, p.83
    template: 없음
    artifact_type_id: tpm_list
    purpose_ko: '임무성공에 결정적인 체계의 물리·기능 특성으로, 구현 중 실제 달성값을 그 시점의 기대값과 비교해 진척을 확인하고 핵심 요구 충족이나 비용·일정을 위협할 결함을 드러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.84 (printed p.71) §4.2.1.2.5'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.4'
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
    depends_on:
    - act_architecture_design
    - act_requirements_analysis
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: canonical
    gate_role: entry
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
    gate_role: supporting
  - id: 320
    name: 종합군수지원계획(ILS)_D
    desc: Integrated logistics support / product support plan (preliminary; maintenance concept)
    term: ILS
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 3-2 p.73
    template: 없음
    artifact_type_id: ils_plan
    purpose_ko: '종합군수지원은 설계요구 정의, 자재 조달·배분, 정비, 보급 교체, 수송, 폐기와 관련된 관리·공학 활동과 분석, 정보관리를 포괄하며, 비행·지상체계 지원성 목표에 따라 식별된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.230 (printed p.217) App B Glossary ''Integrated Logistics Support'''
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-4
    - source_key: dod_se_guidebook_2022
      locator: Table 3-2 p.73
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: entry
  - id: 321
    name: 제조-생산전략서(MFG_Plan)_D
    desc: Manufacturing and production strategy (initial producibility)
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-3; DoD SE Guidebook 2022 Table 3-2 p.73, Table 3-1 p.69
    template: 없음
    artifact_type_id: manufacturing_plan
    purpose_ko: '회사와 생산 시설이 계약 요구를 어떻게 충족하고 제품을 인도할지 상세히 다루는 계획으로, 작업분해구조·자재명세서와 연결되고 최종품 제작·조립에 필요한 단계를 기술한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.14 (p.178)'
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
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 322
    name: 인간체계통합계획-접근(HSI)_F
    desc: Human systems integration approach / HSI plan
    term: HSI
    source: NASA NPR 7123.1D Table G-4, p.37 §5.2.1.3; DoD SE Guidebook 2022 Table 3-2 p.73
    template: 없음
    artifact_type_id: hsi_plan
    purpose_ko: '인간체계통합계획서는 수명주기 전반의 HSI 전략과 이행계획을 문서화하며, 인간 요소를 하드웨어·소프트웨어와 효과적으로 통합하고, 개발·운용 인력을 수명주기 비용에 반영하며, 사용자 집단 특성에 맞게 시스템이 만들어지도록 하는 데 목적이 있다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.305 (printed p.292) App R.1'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.1.3 (p.37)'
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: core
  - id: 323
    name: 체계보안-프로그램보호계획(PPP)_D
    desc: System security / program protection plan (preliminary) with initial cyber risk assessment
    term: PPP
    source: NASA NPR 7123.1D Table G-4, Table G-1; DoD SE Guidebook 2022 Table 3-2 p.72, p.216
    template: 없음
    artifact_type_id: security_plan
    purpose_ko: '체계보안공학 분석의 종합적 접근과 그 결과를 문서화해 프로그램과 관련자의 활동을 이끄는 계획으로, 각 기술검토·감사에 제출되어 검토 평가 기준과 기능·할당·제품 기준선에 반영된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.24 (p.216)'
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
    gate_role: entry
  - id: 324
    name: 자료요구목록(CDRL)_F
    desc: Contract data requirements list / product certification and acceptance data requirements
    term: CDRL
    source: NASA NPR 7123.1D Table G-4; DoD SE Guidebook 2022 Table 2-4 p.59, Table 3-4 p.81
    template: 없음
    artifact_type_id: cdrl
    purpose_ko: '계약에서 요구되는 기술자료·디지털 산출물·소프트웨어의 인도를 주문하는 목록으로, 잘 정의되면 개발자가 적절한 설계 고려사항을 구현하고 필요한 객관적 품질 증거를 산출하도록 보장한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.7 (p.136)'
    - source_key: dod_se_guidebook_2022
      locator: 'p.56'
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
    gate_role: supporting
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
    gate_role: entry
  - id: 326
    name: SRR회의록_F
    desc: SRR minutes with RID/RFA dispositions and action items
    term: SRR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.75
    template: 없음
    artifact_type_id: review_minutes_srr
    purpose_ko: '검토에서 내려진 결정을 뒷날 참조할 수 있는 이력 기록으로 남기며, 모든 RID·RFA 처리에 대한 합의와 함께 완성·배포되어야 해당 수명주기 검토가 완료로 인정된다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.2.9 (p.40)'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.75
    verification_status: source_supported
    gate_role: supporting
  - id: 327
    name: SRR결과보고서_F
    desc: SRR review result report / decision memo (baselined requirements confirmation)
    term: SRR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, Table G-4; DoD SE Guidebook 2022 p.74
    template: 없음
    artifact_type_id: review_result_report_srr
    purpose_ko: '검토위원회 보고서로, 검토 성공기준 대비 미흡한 성과의 문제·우려를 담아 관리조직에 보고되며, 검토의 성공적 완료를 문서화하는 결정 메모와 함께 수명주기 검토 완료 요건을 이룬다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
  - id: 328
    name: 아키텍처·설계해 정의(활동)
    desc: Architecture design — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_architecture_design
    purpose_ko: '설계해 정의는 상위 요구사항과 논리분해 결과를 대안 설계로 바꾸고 절충연구로 선호안을 선정해 최종 설계해로 확정하는 활동이며, 그 결과는 제품 생산과 제품검증에 쓰이는 최종산품 규격을 만드는 근거가 된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.90 (printed p.77) §4.4'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.5.2-§3.2.5.3 (p.25)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    verification_status: partially_supported
    evidence_record:
    - hsi_plan
    - icd
    - ils_plan
    - sss
    - tpm_list
    - vv_strategy
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 329
    name: 구현·제작(활동)
    desc: Product implementation — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_implementation
    purpose_ko: '구현은 구매·제작(코딩)·재사용으로 해당 제품계층의 규정된 산품을 만들어 설계해 정의와 규정 요구사항을 충족시키는 활동으로, 계획과 설계를 실제 산품으로 옮기는 단계다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.104 (printed p.91) §5.1'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.6.2 (p.25)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    verification_status: partially_supported
    evidence_record:
    - manufacturing_plan
    added_by_verification: '2026-08-18'
    depends_on:
    - tra_report
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 330
    name: 통합(활동)
    desc: Product integration — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_integration
    purpose_ko: '통합은 검증·확인된 하위 산품을 조립·통합해 상위 계층의 최종산품으로 만드는 활동이며, 궁극적 목적은 시스템 구성요소들이 하나의 전체로 기능하도록 보장하는 것이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.111 (printed p.98) §5.2'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.7.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    verification_status: partially_supported
    evidence_record:
    - icd
    added_by_verification: '2026-08-18'
    depends_on:
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 331
    name: 요구사항 분석(활동)
    desc: Requirements analysis — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_requirements_analysis
    purpose_ko: '기술요구사항 정의는 기준선화된 이해관계자 기대를 고유하고 정량적·측정가능한 ''shall'' 요구사항으로 바꾸어 설계해 정의의 근거로 삼는 활동이며, 요구사항 문서는 이를 고객·이해관계자·기술조직에 정리해 전달한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.76 (printed p.63) §4.2'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.3.2 (p.24-25)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    verification_status: partially_supported
    evidence_record:
    - rtm
    - tpm_list
    added_by_verification: '2026-08-18'
    depends_on:
    - conops
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 332
    name: 이해관계자 기대 정의(활동)
    desc: Stakeholder expectations definition — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_stakeholder_expectations
    purpose_ko: '이해관계자 기대 정의는 이해관계자가 누구이고 제품을 어떻게 쓸 것인지를 사용사례와 운용개념으로 식별하는 활동이며, 기준선화된 기대는 제품실현 단계에서 최종산품 확인의 기준이 된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.66 (printed p.53) §4.1'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.2.3 (p.24)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.2.1-§3.2.2.3 (p.24)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.66-75 (printed p.53-62) §4.1.1.1/§4.1.1.3, Figure 4.1-1
    verification_status: partially_supported
    evidence_record:
    - conops
    - rtm
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 333
    name: 인도·전환(활동)
    desc: Product transition — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_transition
    purpose_ko: '인도·전환은 검증·확인을 마친 최종산품을 상위 계층 고객에게 넘겨 통합되게 하거나 최상위 산품의 경우 실사용자에게 인도하는 활동으로, 한 계층에서 다음 계층으로 잇는 다리 역할을 한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.137 (printed p.124) §5.5'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.10.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    verification_status: partially_supported
    evidence_record:
    - ils_plan
    added_by_verification: '2026-08-18'
    depends_on:
    - hsi_plan
    - icd
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 334
    name: 확인(활동)
    desc: Product validation — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_validation
    purpose_ko: '확인은 검증을 마친 최종산품이 의도한 환경에서 의도한 용도를 충족하는지를 기준선화된 이해관계자 기대(MOE·운용개념)에 비추어 확증하고, 발견된 이상을 인도나 상위 통합 전에 해결하도록 하는 활동이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.129 (printed p.116) §5.4'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.9.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    verification_status: partially_supported
    evidence_record:
    - conops
    added_by_verification: '2026-08-18'
    depends_on:
    - vv_strategy
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.129-136 (printed p.116-123) §5.4.1.1/§5.4.1.3, Figure 5.4-1
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 604
    name: 기능형상식별서(FCI)_F
    desc: Functional baseline configuration identification (system spec + verification requirements + external interfaces under configuration control)
    term: FCI
    source: NASA NPR 7123.1D p.38 §5.2.2.2.c [SE-41] [SE-42]; DoD SE Guidebook 2022 p.74, p.132
    template: 없음
    artifact_type_id: fci
    purpose_ko: '기능 기준선은 시스템 또는 최상위 형상항목의 성능(기능·상호운용·인터페이스) 요구사항과 그 특성 달성을 입증하는 데 필요한 검증사항을 기술한 승인된 형상문서다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.183 (printed p.170) §6.5.1.2.2'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.229 (printed p.216) App B Glossary ''Functional Baseline'''
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
    depends_on:
    - act_requirements_analysis
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.2 (p.143-145)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 605
    name: 체계요구사항명세서(SSS)_U
    desc: System/Subsystem Specification (updated, functional baseline version)
    term: SSS
    source: NASA NPR 7123.1D Table G-2, Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: sss
    purpose_ko: '요구사항 분석 결과와 배분된 요구를 담아 계약에 반영되는 체계 성능 규격으로, 요구가 현실적임을 확인받아 예비설계의 건전한 기술적 토대를 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§3.3 (p.74)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.2.2 (p.143)'
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 606
    name: 기능분석-체계아키텍처정의서(Functional_Analysis)_F
    desc: Functional analysis / system architecture definition (functional allocation, timing, tradeoffs and options)
    term: Functional_Analysis
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: functional_analysis
    purpose_ko: '기능분석은 시스템이 목표를 이루기 위해 수행해야 할 기능을 체계적으로 식별·기술·연관짓는 활동으로, 시스템 기능과 절충연구·인터페이스 특성·근거를 요구사항에 연결하며 아키텍처 개발과 기능요구 분해의 주된 방법이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.88 (printed p.75) §4.3.1.2.2'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_logical_decomposition
    - act_requirements_analysis
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.2 (p.143-145)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.4.1-§3.2.4.2 (p.25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.87-89 (printed p.74-76) §4.3.1.1/§4.3.1.3, Figure 4.3-1
    depends_on_origin: canonical
    gate_role: entry
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
    gate_role: supporting
  - id: 608
    name: 검증교차참조표(VCRM)_D
    desc: Verification cross-reference matrix / verification requirements for FCA-SVR (per requirement method and level)
    term: VCRM
    source: NASA NPR 7123.1D Table G-5, Table G-4; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: vcrm
    purpose_ko: '모든 요구사항을 어떻게 검증할지 규정하는 표로, ''shall'' 요구를 고유 식별자와 출처 문서로 특정하고 성공기준·검증방법·수행조직과 충족 증거 문서를 함께 기록한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.253 (printed p.240) App D'
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
    depends_on:
    - act_verification
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 609
    name: 핵심성능지표정의및추이(TPM)_F
    desc: TPM/MOP definitions (approved) with technical performance status and margins
    term: TPM
    source: NASA NPR 7123.1D Table G-5, p.38 [SE-40] [SE-43]; DoD SE Guidebook 2022 p.83, p.89
    template: 없음
    artifact_type_id: tpm_list
    purpose_ko: '임무성공에 결정적인 체계의 물리·기능 특성으로, 구현 중 실제 달성값을 그 시점의 기대값과 비교해 진척을 확인하고 핵심 요구 충족이나 비용·일정을 위협할 결함을 드러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.84 (printed p.71) §4.2.1.2.5'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.4'
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
    depends_on:
    - act_architecture_design
    - act_requirements_analysis
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: canonical
    gate_role: entry
  - id: 610
    name: 절충연구보고서(Trade_Study)_U
    desc: Trade study reports (architecture and allocation trades)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: trade_study
    purpose_ko: '체계 아키텍처와 운용개념, 설계 결정이 가용 자원으로 달성 가능한 최선의 해로 나아가게 하는 것이 목적이며, 보고서에는 대안·측도·자료원·계산결과·선정규칙과 권고 대안을 담는다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.94 (printed p.81) §4.4.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.247 (printed p.234) App B Glossary (Trade Study Report)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.5.1-§3.2.5.3 (p.25)
    depends_on_origin: canonical
    gate_role: core
  - id: 611
    name: 인터페이스통제문서(ICD)_D
    desc: System interface definitions / ICDs (preliminary, external plus major internal)
    term: ICD
    source: NASA NPR 7123.1D Table G-5, Table G-2; DoD SE Guidebook 2022 p.132-133, Table 3-2 p.72
    template: 없음
    artifact_type_id: icd
    purpose_ko: '인터페이스 통제문서는 인터페이스 정보와 승인된 인터페이스 변경요청을 식별·수록하는 문서로, 형상관리로 유지·승인되어 기술자료묶음의 일부가 되며 제품검증·확인 과정의 입력으로 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.172 (printed p.159) §6.3.1.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.171 (printed p.158) §6.3.1.2.3'
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
    depends_on:
    - act_architecture_design
    - act_integration
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: canonical
    gate_role: entry
  - id: 612
    name: 요구사항추적표(RTM)_U
    desc: 'Requirements traceability matrix (updated: parent to system to subsystem)'
    term: RTM
    source: NASA NPR 7123.1D Table G-2, Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: rtm
    purpose_ko: '요구사항의 양방향 추적성을 기록하는 표로, 각 요구가 상위 요구를 온전히 충족하는지 점검하고 충족되지 않은 부분을 보완해 넣으며 부모 없는 요구를 걸러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.165 (printed p.152) §6.2.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.163 (printed p.150) §6.2'
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
    depends_on:
    - act_requirements_analysis
    - act_stakeholder_expectations
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    depends_on_origin: canonical
    gate_role: core
  - id: 613
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated, incl. HSI/ESOH/cyber mitigation requirements)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
    gate_role: core
  - id: 614
    name: SEMP_U
    desc: SEMP (updated)
    term: SEMP
    source: NASA NPR 7123.1D Table G-5, Table G-2; DoD SE Guidebook 2022 p.15-18
    template: 없음
    artifact_type_id: semp
    purpose_ko: '프로젝트 기술·공학 활동의 기반 문서로, 어떤 기술과정을 어떻게 적용하고 조직과 자원을 어떻게 갖출지 규정하며 각 수명주기 단계의 진입·성공 기준을 충족하는 작업산출물 실현의 틀을 제공한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.282 (printed p.269) App J §J.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.155 (printed p.142) §6.1.1.2.4'
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
    gate_role: entry
  - id: 615
    name: RAM계획서_U
    desc: R&M program plan / SMA plan (updated)
    term: RAM
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: ram_plan
    purpose_ko: '신뢰도·정비도 공학이 체계공학 활동에 통합되도록 수명주기 전체를 다루는 계획으로, 각 요소가 비용효과적으로 수행·평가·보고되고 설계·해석·개발·시험·제조에 제때 통합되게 한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.196)'
    - source_key: dod_se_guidebook_2022
      locator: '§5.18 (p.194)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
    gate_role: supporting
  - id: 616
    name: 체계안전분석서(Safety)_U
    desc: System safety analysis (preliminary, updated for architecture)
    term: Safety
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: system_safety_analysis
    purpose_ko: '운용자·체계·환경·공중에 미치는 위험을 평가하기 위해 안전해석을 수행하며, 그 접근법과 방법은 체계공학관리계획의 체계안전 항목에 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
    gate_role: entry
  - id: 617
    name: IMS_U
    desc: Integrated master schedule with resourced plan to PDR
    term: IMS
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: ims
    purpose_ko: '발주·계약자·하도급 활동을 포함한 전체 작업 범위를 일정·기간·선후관계로 기술한 문서로, 주공정과 이정표를 식별하고 계획 대비 진척 비교, 자원 분석, 위험 완화 추적의 기준을 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.106-107)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
    gate_role: supporting
  - id: 618
    name: 통합계획서(Integration)_D
    desc: Integration plan (preliminary)
    term: Integration
    source: NASA NPR 7123.1D Table G-5, Table G-2
    template: 없음
    artifact_type_id: integration_plan
    purpose_ko: '통합계획서는 조율된 통합 노력을 기술해 구현전략을 뒷받침하고, 각 통합 단계에서 참여자가 무엇을 해야 하는지 기술하며, 필요한 자원과 그 시기·장소를 식별하는 데 주된 목적이 있다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.269 (printed p.256) App H.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.111 (printed p.98) §5.2'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-2
    verification_status: partially_supported
    gate_role: entry
  - id: 619
    name: ILSP_D
    desc: Integrated logistics support plan (preliminary)
    term: ILS
    source: NASA NPR 7123.1D Table G-5; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: ils_plan
    purpose_ko: '종합군수지원은 설계요구 정의, 자재 조달·배분, 정비, 보급 교체, 수송, 폐기와 관련된 관리·공학 활동과 분석, 정보관리를 포괄하며, 비행·지상체계 지원성 목표에 따라 식별된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.230 (printed p.217) App B Glossary ''Integrated Logistics Support'''
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: dod_se_guidebook_2022
      locator: Table 3-3 p.76
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: entry
  - id: 620
    name: 기술자원예산-여유도(Margins)_D
    desc: Technical resource budgets and margins (mass, power, memory, throughput) initial
    term: Margins
    source: NASA NPR 7123.1D Table G-5, Table G-6
    template: 없음
    artifact_type_id: resource_budget
    purpose_ko: '여유(margin)는 불확실성과 위험에 대비해 예산·일정·기술성능 파라미터(중량·전력·메모리 등)에 갖고 가는 허용분으로, 형성 단계에서 위험평가에 근거해 배분되고 수명주기가 진행되며 소모된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.232 (printed p.219) App B Glossary (Margin)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    verification_status: partially_supported
    gate_role: entry
  - id: 621
    name: TRA_U
    desc: Technology readiness assessment (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-5
    template: 없음
    artifact_type_id: tra_report
    purpose_ko: '체계·부체계·구성품에 요구되는 기술 성숙도를 시험과 해석으로 입증해 기록하는 보고서로, 그 성숙도평가 결과는 기술개발계획 수립과 대안 경로·대체안·성능 축소안 식별에 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.260 (printed p.247) App G §G.1'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    verification_status: partially_supported
    gate_role: entry
  - id: 622
    name: 운용개념서(CONOPS)_U
    desc: Concept of operations (preliminary/updated for architecture)
    term: CONOPS
    source: NASA NPR 7123.1D Table G-5
    template: 없음
    artifact_type_id: conops
    purpose_ko: '운용개념서는 시스템이 이해관계자 기대를 충족하도록 어떻게 사용될지를 시간 순으로 기술해 시스템 목표 이해를 돕고, 사용자 관련 요구사항과 아키텍처 개발을 촉발하며, 후속 정의문서의 기초이자 장기 운용계획의 토대가 된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.222 (printed p.209) App B Glossary ''Concept of Operations'''
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.71 (printed p.58) §4.1.1.2.4'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-5
    verification_status: partially_supported
    depends_on:
    - act_stakeholder_expectations
    - act_validation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.2.1-§3.2.2.3 (p.24)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.66-75 (printed p.53-62) §4.1.1.1/§4.1.1.3, Figure 4.1-1
    depends_on_origin: canonical
    gate_role: core
  - id: 623
    name: 체계보안계획(PPP)_D
    desc: System security plan (preliminary, updated)
    term: PPP
    source: NASA NPR 7123.1D Table G-5, Table G-2; DoD SE Guidebook 2022 Table 3-3 p.76
    template: 없음
    artifact_type_id: security_plan
    purpose_ko: '체계보안공학 분석의 종합적 접근과 그 결과를 문서화해 프로그램과 관련자의 활동을 이끄는 계획으로, 각 기술검토·감사에 제출되어 검토 평가 기준과 기능·할당·제품 기준선에 반영된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.24 (p.216)'
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
    gate_role: entry
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
    gate_role: entry
  - id: 625
    name: SFR회의록_F
    desc: SFR minutes with RID/RFA dispositions
    term: SFR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.76
    template: 없음
    artifact_type_id: review_minutes_sfr
    purpose_ko: '검토에서 내려진 결정을 뒷날 참조할 수 있는 이력 기록으로 남기며, 모든 RID·RFA 처리에 대한 합의와 함께 완성·배포되어야 해당 수명주기 검토가 완료로 인정된다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.2.9 (p.40)'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.76
    verification_status: source_supported
    gate_role: supporting
  - id: 626
    name: SFR결과보고서_F
    desc: SFR review result report (functional baseline established)
    term: SFR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, p.38 §5.2.2.2.c; DoD SE Guidebook 2022 p.74, p.76
    template: 없음
    artifact_type_id: review_result_report_sfr
    purpose_ko: '검토위원회 보고서로, 검토 성공기준 대비 미흡한 성과의 문제·우려를 담아 관리조직에 보고되며, 검토의 성공적 완료를 문서화하는 결정 메모와 함께 수명주기 검토 완료 요건을 이룬다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
  - id: 627
    name: 통합(활동)
    desc: Product integration — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_integration
    purpose_ko: '통합은 검증·확인된 하위 산품을 조립·통합해 상위 계층의 최종산품으로 만드는 활동이며, 궁극적 목적은 시스템 구성요소들이 하나의 전체로 기능하도록 보장하는 것이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.111 (printed p.98) §5.2'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.7.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    verification_status: partially_supported
    evidence_record:
    - icd
    added_by_verification: '2026-08-18'
    depends_on:
    - integration_plan
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 628
    name: 논리적 분해·기능분석(활동)
    desc: Logical decomposition — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_logical_decomposition
    purpose_ko: '논리적 분해는 기술요구사항과 그 관계에 대한 이해를 높이고, 상위 요구사항을 논리분해 모델과 그에 딸린 파생 기술요구사항으로 바꾸어 하위 계층과 설계해 정의 과정의 입력으로 넘기는 활동이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.86 (printed p.73) §4.3'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.4.2 (p.25)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: §3.2.4.1-§3.2.4.2 (p.25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.87-89 (printed p.74-76) §4.3.1.1/§4.3.1.3, Figure 4.3-1
    verification_status: partially_supported
    evidence_record:
    - functional_analysis
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 629
    name: 검증(활동)
    desc: Product verification — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_verification
    purpose_ko: '검증은 구현 또는 통합으로 만든 최종산품이 규정된 요구사항·규격에 부합함을 증명해 ''제품을 올바르게 만들었는가''에 답하는 활동이며, 그 규격과 설계기술문서가 해당 산품의 형상 기준선을 이룬다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.116 (printed p.103) §5.3'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.8.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    verification_status: partially_supported
    evidence_record:
    - vcrm
    added_by_verification: '2026-08-18'
    depends_on:
    - fci
    - icd
    - vv_strategy
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.118-127 (printed p.105-114) §5.3.1.1/§5.3.1.3, Figure 5.3-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 630
    name: 기능 기준선 확정(결정)
    desc: Functional baseline established at SFR — decision node (no folder); evidenced by the configuration identification and the review record
    term: DECISION
    source: DoD SE Guidebook 2022 §4.1.6 (baseline definitions)
    template: 없음
    artifact_type_id: dec_functional_baseline
    purpose_ko: '기능 기준선 확정은 시스템·최상위 형상항목의 성능(기능·상호운용·인터페이스) 요구사항과 그 검증사항을 승인된 형상문서로 고정하는 것으로, 이후 변경이 대비되는 합의된 형상을 정한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.183 (printed p.170) §6.5.1.2.2'
    node_kind: decision
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.6 (p.131-134; baseline definitions p.132-133)'
    verification_status: partially_supported
    evidence_record:
    - fci
    - review_minutes_sfr
    added_by_verification: '2026-08-18'
    depends_on:
    - fci
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.1.6 (p.131-134; baseline definitions p.132-133)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 904
    name: 할당형상식별서-아키텍처및형상식별서(DCI)_F
    desc: Allocated baseline configuration identification (CI-level specs, ICDs, verification requirements, design/safety constraints under configuration control)
    term: DCI
    source: NASA NPR 7123.1D Table G-6, p.38 [SE-45]; DoD SE Guidebook 2022 p.78, p.83
    template: 없음
    artifact_type_id: dci
    purpose_ko: '할당 기준선은 상위 요구문서나 형상항목에서 할당된 기능·성능·인터페이스 특성과 그 달성을 입증할 검증사항을 규정한 승인된 성능지향 형상문서로, 기능 기준선을 형상항목 상세설계 착수에 충분한 수준까지 구체화한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.183 (printed p.170) §6.5.1.2.2'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.220 (printed p.207) App B Glossary ''Allocated Baseline'''
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    depends_on_origin: canonical
    gate_role: supporting
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
  - id: 907
    name: 소프트웨어설계기술서(SDD)_D
    desc: Software architecture / software design description (preliminary; CSCI/CSC structure)
    term: SDD
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81-82
    template: 없음
    artifact_type_id: sdd
    purpose_ko: '최초 제품 기준선에 포함되는 소프트웨어 모듈 설계, 즉 코딩용(code-to) 규격으로, 상세설계검토 시점에 형상통제 아래 확정되어 소프트웨어 구현의 근거가 된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.6 (p.133)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81-82
    verification_status: source_supported
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 910
    name: 인터페이스요구사항명세서(IRS)_F
    desc: Interface requirements specifications (baselined)
    term: IRS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: irs
    purpose_ko: '인터페이스 요구사항 문서는 정해진 당사자·구성품 사이의 인터페이스 요구사항을 정의하고 통제하며, 다른 문서와의 우선순위 및 인터페이스 조직의 개발책임·변경승인 권한을 함께 규정한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.297 (printed p.284) App L §1.1-1.3'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 911
    name: 인터페이스통제문서(ICD)_F
    desc: Interface control documents (internal and external, baselined)
    term: ICD
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.78, Table 3-4 p.81
    template: 없음
    artifact_type_id: icd
    purpose_ko: '인터페이스 통제문서는 인터페이스 정보와 승인된 인터페이스 변경요청을 식별·수록하는 문서로, 형상관리로 유지·승인되어 기술자료묶음의 일부가 되며 제품검증·확인 과정의 입력으로 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.172 (printed p.159) §6.3.1.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.171 (printed p.158) §6.3.1.2.3'
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
    depends_on:
    - act_architecture_design
    - act_integration
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: canonical
    gate_role: core
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
    gate_role: supporting
  - id: 913
    name: 요구사항추적표(RTM)_U
    desc: Requirements traceability matrix (functional to allocated baseline, complete and verifiable)
    term: RTM
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: rtm
    purpose_ko: '요구사항의 양방향 추적성을 기록하는 표로, 각 요구가 상위 요구를 온전히 충족하는지 점검하고 충족되지 않은 부분을 보완해 넣으며 부모 없는 요구를 걸러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.165 (printed p.152) §6.2.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.163 (printed p.150) §6.2'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
    depends_on:
    - act_requirements_analysis
    - act_stakeholder_expectations
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    depends_on_origin: canonical
    gate_role: core
  - id: 914
    name: 시험평가기본계획서(TEMP)-검증확인계획_F
    desc: Test and evaluation master plan / V&V plan (baselined; TEMP drafted)
    term: TEMP
    source: NASA NPR 7123.1D Table G-6, p.38 [SE-68]; DoD SE Guidebook 2022 Table 3-4 p.80, p.82
    template: 없음
    artifact_type_id: temp
    purpose_ko: '검증·확인(V&V) 계획으로, 요구사항 충족을 입증할 활동(검증)과 체계가 고객 기대를 충족함을 확인할 활동(확인)을 식별하는 것이 목적이며 PDR 지적사항 반영 뒤 기준선화한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.272 (printed p.259) App I §1.1'
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
    gate_role: supporting
  - id: 915
    name: VCRM_U
    desc: Verification cross-reference matrix (updated for CI-level verification requirements)
    term: VCRM
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.78, Table 3-4 p.81
    template: 없음
    artifact_type_id: vcrm
    purpose_ko: '모든 요구사항을 어떻게 검증할지 규정하는 표로, ''shall'' 요구를 고유 식별자와 출처 문서로 특정하고 성공기준·검증방법·수행조직과 충족 증거 문서를 함께 기록한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.253 (printed p.240) App D'
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
    depends_on:
    - act_verification
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 916
    name: 통합계획서(Integration)_F
    desc: Integration plan (baselined)
    term: Integration
    source: NASA NPR 7123.1D Table G-6, p.38 [SE-67]; DoD SE Guidebook 2022 Table 3-4 p.82
    template: 없음
    artifact_type_id: integration_plan
    purpose_ko: '통합계획서는 조율된 통합 노력을 기술해 구현전략을 뒷받침하고, 각 통합 단계에서 참여자가 무엇을 해야 하는지 기술하며, 필요한 자원과 그 시기·장소를 식별하는 데 주된 목적이 있다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.269 (printed p.256) App H.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.111 (printed p.98) §5.2'
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
    gate_role: entry
  - id: 917
    name: 절충연구보고서(Trade_Study)_U
    desc: Trade study reports (design trades mostly complete; remaining planned)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82
    template: 없음
    artifact_type_id: trade_study
    purpose_ko: '체계 아키텍처와 운용개념, 설계 결정이 가용 자원으로 달성 가능한 최선의 해로 나아가게 하는 것이 목적이며, 보고서에는 대안·측도·자료원·계산결과·선정규칙과 권고 대안을 담는다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.94 (printed p.81) §4.4.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.247 (printed p.234) App B Glossary (Trade Study Report)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.5.1-§3.2.5.3 (p.25)
    depends_on_origin: canonical
    gate_role: core
  - id: 918
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated; mitigation plans approved and scheduled in IMS)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.80, p.83
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
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
    gate_role: core
  - id: 919
    name: TPM현황-자원여유도_U
    desc: TPM status with technical resource budgets and margins (updated)
    term: TPM
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.83-84
    template: 없음
    artifact_type_id: tpm_list
    purpose_ko: '임무성공에 결정적인 체계의 물리·기능 특성으로, 구현 중 실제 달성값을 그 시점의 기대값과 비교해 진척을 확인하고 핵심 요구 충족이나 비용·일정을 위협할 결함을 드러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.84 (printed p.71) §4.2.1.2.5'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.4'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.83-84
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_requirements_analysis
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 920
    name: TRA_U
    desc: Technology readiness assessment (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.112, Table 3-4
    template: 없음
    artifact_type_id: tra_report
    purpose_ko: '체계·부체계·구성품에 요구되는 기술 성숙도를 시험과 해석으로 입증해 기록하는 보고서로, 그 성숙도평가 결과는 기술개발계획 수립과 대안 경로·대체안·성능 축소안 식별에 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.260 (printed p.247) App G §G.1'
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
    gate_role: core
  - id: 921
    name: 도면트리-예비도면(Drawings)_D
    desc: Engineering drawing tree and preliminary drawings / mechanical model
    term: Drawings
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 p.86
    template: 없음
    artifact_type_id: drawings
    purpose_ko: '기술자료묶음은 단계가 진행되며 개념 스케치나 모델에서 시작해, 제품 구현과 통합에 필요한 완성 도면·부품목록·상세자료로 마무리된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.98 (printed p.85) §4.4.1.2.6'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: p.86
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: canonical
    gate_role: entry
  - id: 922
    name: 부품관리계획서(Parts_Plan)_F
    desc: Parts management plan with preliminary parts list and DMSMS management plan
    term: Parts_Plan
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81-82
    template: 없음
    artifact_type_id: registered_parts_plan
    purpose_ko: '부품·재료·공정이 체계 요구를 충족함을 확인하기 위한 관리 계획으로, 의도한 사용 수명에 대한 신뢰도 위험 고려사항과 평가 전략을 담고 요구를 협력업체·공급자까지 전개한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.198)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81-82
    verification_status: source_supported
    gate_role: supporting
  - id: 923
    name: 기능FMECA-신뢰성분석_D
    desc: Functional FMECA / reliability analyses and R&M estimate; reliability program plan
    term: FMECA
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: fmeca
    purpose_ko: '인명 피해나 임무 손실로 이어질 수 있는 고장 모드와 그 탐지 방법을 식별해 설계에서 완화되도록 하는 분석으로, 생산·운용 자료에 따라 갱신되어 정비·예비품·가용도 영향 평가에 쓰인다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.197)'
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.198)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
    gate_role: core
  - id: 924
    name: 체계안전분석서(Safety)_U
    desc: System safety analyses (PHA, requirements hazard analysis) and hazard tracking; safety plan updated
    term: Safety
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: system_safety_analysis
    purpose_ko: '운용자·체계·환경·공중에 미치는 위험을 평가하기 위해 안전해석을 수행하며, 그 접근법과 방법은 체계공학관리계획의 체계안전 항목에 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
    gate_role: entry
  - id: 925
    name: 생산성평가-예비제조계획(MFG_Plan)_D
    desc: Producibility / manufacturability assessment and preliminary manufacturing plan
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81-82
    template: 없음
    artifact_type_id: manufacturing_plan
    purpose_ko: '회사와 생산 시설이 계약 요구를 어떻게 충족하고 제품을 인도할지 상세히 다루는 계획으로, 작업분해구조·자재명세서와 연결되고 최종품 제작·조립에 필요한 단계를 기술한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.14 (p.178)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81-82
    verification_status: source_supported
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: entry
  - id: 926
    name: 품질보증계획서(QAP)_F
    desc: Quality assurance plan
    term: QAP
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: qa_plan
    purpose_ko: '품질보증은 실제로 생산·인도된 체계가 기능·성능·설계 요구에 부합한다는 확신을 얻기 위해 제품 수명주기 전반에 걸쳐 수행하는 독립적 평가다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.239 (printed p.226) App B Glossary (Quality Assurance)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: entry
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
    gate_role: entry
  - id: 928
    name: ILSP-LCSP_F
    desc: Integrated logistics support plan / life cycle sustainment plan (baselined)
    term: ILS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82-83
    template: 없음
    artifact_type_id: ils_plan
    purpose_ko: '종합군수지원은 설계요구 정의, 자재 조달·배분, 정비, 보급 교체, 수송, 폐기와 관련된 관리·공학 활동과 분석, 정보관리를 포괄하며, 비행·지상체계 지원성 목표에 따라 식별된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.230 (printed p.217) App B Glossary ''Integrated Logistics Support'''
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82-83
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: entry
  - id: 929
    name: 운용개념서(CONOPS)_F
    desc: Concept of operations (baseline)
    term: CONOPS
    source: NASA NPR 7123.1D Table G-6
    template: 없음
    artifact_type_id: conops
    purpose_ko: '운용개념서는 시스템이 이해관계자 기대를 충족하도록 어떻게 사용될지를 시간 순으로 기술해 시스템 목표 이해를 돕고, 사용자 관련 요구사항과 아키텍처 개발을 촉발하며, 후속 정의문서의 기초이자 장기 운용계획의 토대가 된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.222 (printed p.209) App B Glossary ''Concept of Operations'''
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.71 (printed p.58) §4.1.1.2.4'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    verification_status: partially_supported
    depends_on:
    - act_stakeholder_expectations
    - act_validation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.2.1-§3.2.2.3 (p.24)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.66-75 (printed p.53-62) §4.1.1.1/§4.1.1.3, Figure 4.1-1
    depends_on_origin: canonical
    gate_role: core
  - id: 930
    name: IMS_F
    desc: Integrated master schedule and cost update with plan to CDR
    term: IMS
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82, p.83
    template: 없음
    artifact_type_id: ims
    purpose_ko: '발주·계약자·하도급 활동을 포함한 전체 작업 범위를 일정·기간·선후관계로 기술한 문서로, 주공정과 이정표를 식별하고 계획 대비 진척 비교, 자원 분석, 위험 완화 추적의 기준을 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.106-107)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
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
    gate_role: entry
  - id: 931
    name: 보안-보호계획(PPP)_U
    desc: System security / program protection plan (updated)
    term: PPP
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.82
    template: 없음
    artifact_type_id: security_plan
    purpose_ko: '체계보안공학 분석의 종합적 접근과 그 결과를 문서화해 프로그램과 관련자의 활동을 이끄는 계획으로, 각 기술검토·감사에 제출되어 검토 평가 기준과 기능·할당·제품 기준선에 반영된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.24 (p.216)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.82
    verification_status: source_supported
    gate_role: entry
  - id: 932
    name: SEMP_U
    desc: SEMP (updated)
    term: SEMP
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: semp
    purpose_ko: '프로젝트 기술·공학 활동의 기반 문서로, 어떤 기술과정을 어떻게 적용하고 조직과 자원을 어떻게 갖출지 규정하며 각 수명주기 단계의 진입·성공 기준을 충족하는 작업산출물 실현의 틀을 제공한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.282 (printed p.269) App J §J.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.155 (printed p.142) §6.1.1.2.4'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
    gate_role: entry
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
    gate_role: supporting
  - id: 934
    name: 공학해석-M&S결과서(Analysis)_D
    desc: Preliminary engineering analysis and modeling results (subsystem analyses, M&S)
    term: Analysis
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-2 p.73, Table 3-4
    template: 없음
    artifact_type_id: engineering_analysis_report
    purpose_ko: '계산 모델을 포함한 공인된 해석 기법으로 체계요소의 거동·성능을 해석하거나 설명한 결과로, 시험자료나 설계자료 분석을 통해 요구사항을 검증하는 데 쓰인다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.2.6 (p.150)'
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
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: core
  - id: 935
    name: HSI접근_U
    desc: HSI approach / human rating or human factors plan (updated)
    term: HSI
    source: NASA NPR 7123.1D Table G-6; DoD SE Guidebook 2022 Table 3-4 p.81
    template: 없음
    artifact_type_id: hsi_plan
    purpose_ko: '인간체계통합계획서는 수명주기 전반의 HSI 전략과 이행계획을 문서화하며, 인간 요소를 하드웨어·소프트웨어와 효과적으로 통합하고, 개발·운용 인력을 수명주기 비용에 반영하며, 사용자 집단 특성에 맞게 시스템이 만들어지도록 하는 데 목적이 있다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.305 (printed p.292) App R.1'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.1.3 (p.37)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-6
    - source_key: dod_se_guidebook_2022
      locator: Table 3-4 p.81
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: core
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
    gate_role: entry
  - id: 937
    name: PDR회의록_F
    desc: PDR minutes with RID/RFA dispositions and corrective action plans
    term: PDR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.83
    template: 없음
    artifact_type_id: review_minutes_pdr
    purpose_ko: '검토에서 내려진 결정을 뒷날 참조할 수 있는 이력 기록으로 남기며, 모든 RID·RFA 처리에 대한 합의와 함께 완성·배포되어야 해당 수명주기 검토가 완료로 인정된다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.2.9 (p.40)'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.83
    verification_status: source_supported
    gate_role: supporting
  - id: 938
    name: PDR결과보고서_F
    desc: PDR review result report / assessment (allocated baseline evidence, TPM status)
    term: PDR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, p.38 §5.2.2.2.d; DoD SE Guidebook 2022 p.83-84
    template: 없음
    artifact_type_id: review_result_report_pdr
    purpose_ko: '검토위원회 보고서로, 검토 성공기준 대비 미흡한 성과의 문제·우려를 담아 관리조직에 보고되며, 검토의 성공적 완료를 문서화하는 결정 메모와 함께 수명주기 검토 완료 요건을 이룬다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
  - id: 939
    name: 구현·제작(활동)
    desc: Product implementation — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_implementation
    purpose_ko: '구현은 구매·제작(코딩)·재사용으로 해당 제품계층의 규정된 산품을 만들어 설계해 정의와 규정 요구사항을 충족시키는 활동으로, 계획과 설계를 실제 산품으로 옮기는 단계다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.104 (printed p.91) §5.1'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.6.2 (p.25)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    verification_status: partially_supported
    evidence_record:
    - engineering_analysis_report
    - manufacturing_plan
    - qa_plan
    added_by_verification: '2026-08-18'
    depends_on:
    - drawings
    - tra_report
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.6.1-§3.2.6.2 (p.25)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 940
    name: 통합(활동)
    desc: Product integration — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_integration
    purpose_ko: '통합은 검증·확인된 하위 산품을 조립·통합해 상위 계층의 최종산품으로 만드는 활동이며, 궁극적 목적은 시스템 구성요소들이 하나의 전체로 기능하도록 보장하는 것이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.111 (printed p.98) §5.2'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.7.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    verification_status: partially_supported
    evidence_record:
    - icd
    added_by_verification: '2026-08-18'
    depends_on:
    - dci
    - integration_plan
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 941
    name: 확인(활동)
    desc: Product validation — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_validation
    purpose_ko: '확인은 검증을 마친 최종산품이 의도한 환경에서 의도한 용도를 충족하는지를 기준선화된 이해관계자 기대(MOE·운용개념)에 비추어 확증하고, 발견된 이상을 인도나 상위 통합 전에 해결하도록 하는 활동이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.129 (printed p.116) §5.4'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.9.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    verification_status: partially_supported
    evidence_record:
    - conops
    added_by_verification: '2026-08-18'
    depends_on:
    - temp
    - vv_strategy
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.129-136 (printed p.116-123) §5.4.1.1/§5.4.1.3, Figure 5.4-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 942
    name: 검증(활동)
    desc: Product verification — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_verification
    purpose_ko: '검증은 구현 또는 통합으로 만든 최종산품이 규정된 요구사항·규격에 부합함을 증명해 ''제품을 올바르게 만들었는가''에 답하는 활동이며, 그 규격과 설계기술문서가 해당 산품의 형상 기준선을 이룬다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.116 (printed p.103) §5.3'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.8.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    verification_status: partially_supported
    evidence_record:
    - vcrm
    added_by_verification: '2026-08-18'
    depends_on:
    - dci
    - fci
    - icd
    - vv_strategy
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.118-127 (printed p.105-114) §5.3.1.1/§5.3.1.3, Figure 5.3-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 943
    name: 할당 기준선 확정(결정)
    desc: Allocated baseline established at PDR — decision node (no folder); evidenced by the configuration identification and the review record
    term: DECISION
    source: DoD SE Guidebook 2022 §4.1.6 (baseline definitions)
    template: 없음
    artifact_type_id: dec_allocated_baseline
    purpose_ko: '할당 기준선 확정은 통상 PDR 성공적 완료 시점에 이루어지며, 형상항목의 특성을 합의·문서화해 상세설계 착수 기준과 이후 변경이 대비되는 알려진 형상을 제공한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.183 (printed p.170) §6.5.1.2.2'
    node_kind: decision
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.6 (p.131-134; baseline definitions p.132-133)'
    verification_status: partially_supported
    evidence_record:
    - dci
    - review_minutes_pdr
    added_by_verification: '2026-08-18'
    depends_on:
    - dci
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.1.6 (p.131-134; baseline definitions p.132-133)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 1204
    name: 제품형상식별서(PCI)_F
    desc: Initial product baseline configuration identification (build-to/code-to documentation under configuration control)
    term: PCI
    source: NASA NPR 7123.1D p.38 §5.2.2.2.e [SE-46], Table G-7; DoD SE Guidebook 2022 p.84, p.88
    template: 없음
    artifact_type_id: pci
    purpose_ko: '제품기준선은 생산·배치·운용지원 단계에서 형상항목의 형상을 기술하는 승인된 기술문서로, 형상항목의 물리적 형태·적합·기능 특성과 생산수락시험 대상 기능특성 및 그 시험요구를 규정한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.183 (printed p.170) §6.5.1.2.2'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.236 (printed p.223) App B Glossary (Product Baseline)'
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
    gate_role: core
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
  - id: 1207
    name: 소프트웨어설계기술서(SDD)_F
    desc: Software design description (final, code-to)
    term: SDD
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: sdd
    purpose_ko: '최초 제품 기준선에 포함되는 소프트웨어 모듈 설계, 즉 코딩용(code-to) 규격으로, 상세설계검토 시점에 형상통제 아래 확정되어 소프트웨어 구현의 근거가 된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.6 (p.133)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    verification_status: source_supported
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 1210
    name: 제작도면(Drawings)_F
    desc: Engineering drawings (production-representative; 75-90% complete, 100% for critical/safety items)
    term: Drawings
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 p.86, p.89
    template: 없음
    artifact_type_id: drawings
    purpose_ko: '기술자료묶음은 단계가 진행되며 개념 스케치나 모델에서 시작해, 제품 구현과 통합에 필요한 완성 도면·부품목록·상세자료로 마무리된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.98 (printed p.85) §4.4.1.2.6'
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
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 1213
    name: 요구사항추적표(RTM)_U
    desc: Requirements traceability matrix (functional, allocated, product baselines)
    term: RTM
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86
    template: 없음
    artifact_type_id: rtm
    purpose_ko: '요구사항의 양방향 추적성을 기록하는 표로, 각 요구가 상위 요구를 온전히 충족하는지 점검하고 충족되지 않은 부분을 보완해 넣으며 부모 없는 요구를 걸러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.165 (printed p.152) §6.2.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.163 (printed p.150) §6.2'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86
    verification_status: source_supported
    depends_on:
    - act_requirements_analysis
    - act_stakeholder_expectations
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1214
    name: 기술자료묶음(TDP)_D
    desc: 'Technical data package (initial: schematics, specs, ICDs, engineering analyses, spares list)'
    term: TDP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86, p.96
    template: 없음
    artifact_type_id: tdp
    purpose_ko: '획득전략·생산·공학·군수지원을 뒷받침하기에 충분한 품목의 기술적 기술서로, 요구되는 설계 형상과 성능 적합성을 보장할 절차를 규정하며 도면·목록·규격·표준·품질보증 조항 등을 포함한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.191 (printed p.178) §6.6.1.2.1'
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
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: entry
  - id: 1215
    name: 제조계획서(MFG_Plan)_F
    desc: 'Manufacturing plan: critical manufacturing processes, process control plans, tooling and fabrication/assembly plans'
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-6, Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: manufacturing_plan
    purpose_ko: '회사와 생산 시설이 계약 요구를 어떻게 충족하고 제품을 인도할지 상세히 다루는 계획으로, 작업분해구조·자재명세서와 연결되고 최종품 제작·조립에 필요한 단계를 기술한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.14 (p.178)'
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
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: core
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 1218
    name: 수락시험계획서(ATP)_F
    desc: Acceptance test plan and acceptance criteria (ready to baseline)
    term: ATP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-7 p.94
    template: 없음
    artifact_type_id: atp
    purpose_ko: '수락시험은 검증 프로그램에서 선별한 축소 항목을 제작·인도되는 비행품마다 수행하며, 그 시험·해석 기준은 해당 호기의 제작과 기량이 앞서 검증·인정된 설계에 부합함을 보이도록 선정한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.117 (printed p.104) §5.3 (Verification/Qualification/Acceptance/Certification box)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    verification_status: source_supported
    gate_role: entry
  - id: 1219
    name: TEMP_U
    desc: Test and evaluation master plan / V&V plan (updated)
    term: TEMP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: temp
    purpose_ko: '검증·확인(V&V) 계획으로, 요구사항 충족을 입증할 활동(검증)과 체계가 고객 기대를 충족함을 확인할 활동(확인)을 식별하는 것이 목적이며 PDR 지적사항 반영 뒤 기준선화한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.272 (printed p.259) App I §1.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
    gate_role: supporting
  - id: 1220
    name: VCRM_U
    desc: Verification cross-reference matrix (updated to product baseline)
    term: VCRM
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: vcrm
    purpose_ko: '모든 요구사항을 어떻게 검증할지 규정하는 표로, ''shall'' 요구를 고유 식별자와 출처 문서로 특정하고 성공기준·검증방법·수행조직과 충족 증거 문서를 함께 기록한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.253 (printed p.240) App D'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
    depends_on:
    - act_verification
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
  - id: 1222
    name: 통합계획서(Integration)_U
    desc: Integration plan (updated)
    term: Integration
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: integration_plan
    purpose_ko: '통합계획서는 조율된 통합 노력을 기술해 구현전략을 뒷받침하고, 각 통합 단계에서 참여자가 무엇을 해야 하는지 기술하며, 필요한 자원과 그 시기·장소를 식별하는 데 주된 목적이 있다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.269 (printed p.256) App H.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.111 (printed p.98) §5.2'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
    gate_role: entry
  - id: 1223
    name: 설계FMECA-신뢰성분석_F
    desc: Design FMECA / reliability analyses and R&M estimate (updated); R&M plan updated
    term: FMECA
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: fmeca
    purpose_ko: '인명 피해나 임무 손실로 이어질 수 있는 고장 모드와 그 탐지 방법을 식별해 설계에서 완화되도록 하는 분석으로, 생산·운용 자료에 따라 갱신되어 정비·예비품·가용도 영향 평가에 쓰인다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.197)'
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.198)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
    gate_role: core
  - id: 1224
    name: 체계-부체계안전분석서(Safety)_F
    desc: System and subsystem safety analyses with associated verifications (baselined)
    term: Safety
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: system_safety_analysis
    purpose_ko: '운용자·체계·환경·공중에 미치는 위험을 평가하기 위해 안전해석을 수행하며, 그 접근법과 방법은 체계공학관리계획의 체계안전 항목에 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
    gate_role: entry
  - id: 1225
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated; mitigations in IMS)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87, p.88
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
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
    gate_role: core
  - id: 1226
    name: TPM현황-자원여유도_U
    desc: TPM status, technical resource budgets and margins (updated)
    term: TPM
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 p.89
    template: 없음
    artifact_type_id: tpm_list
    purpose_ko: '임무성공에 결정적인 체계의 물리·기능 특성으로, 구현 중 실제 달성값을 그 시점의 기대값과 비교해 진척을 확인하고 핵심 요구 충족이나 비용·일정을 위협할 결함을 드러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.84 (printed p.71) §4.2.1.2.5'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.4'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: p.89
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_requirements_analysis
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1227
    name: TRA_U
    desc: Technology readiness assessment (updated)
    term: TRA
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 p.112
    template: 없음
    artifact_type_id: tra_report
    purpose_ko: '체계·부체계·구성품에 요구되는 기술 성숙도를 시험과 해석으로 입증해 기록하는 보고서로, 그 성숙도평가 결과는 기술개발계획 수립과 대안 경로·대체안·성능 축소안 식별에 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.260 (printed p.247) App G §G.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: p.112
    verification_status: source_supported
    gate_role: entry
  - id: 1228
    name: 부품관리-단종관리,부품목록(Parts_Plan)_U
    desc: Parts list and parts management / DMSMS status (EEE parts selected)
    term: Parts_Plan
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: registered_parts_plan
    purpose_ko: '부품·재료·공정이 체계 요구를 충족함을 확인하기 위한 관리 계획으로, 의도한 사용 수명에 대한 신뢰도 위험 고려사항과 평가 전략을 담고 요구를 협력업체·공급자까지 전개한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.198)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
    gate_role: supporting
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
    gate_role: supporting
  - id: 1230
    name: 공학해석보고서(Analysis)_F
    desc: Engineering analysis reports (loads/stress/thermal/EMC/fracture; material properties; M&S results)
    term: Analysis
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: engineering_analysis_report
    purpose_ko: '계산 모델을 포함한 공인된 해석 기법으로 체계요소의 거동·성능을 해석하거나 설명한 결과로, 시험자료나 설계자료 분석을 통해 요구사항을 검증하는 데 쓰인다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.2.6 (p.150)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: core
  - id: 1231
    name: 핵심품목-단일고장점목록(CIL)_F
    desc: Critical items list (critical safety/application items, key product characteristics, single point failures)
    term: CIL
    source: DoD SE Guidebook 2022 Table 3-5 p.86-87; NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: critical_items_list
    purpose_ko: '설계·개발 단계에서 핵심안전품목을 식별·문서화한 목록으로, 초도 예비품 산정·보급 지원·제조 계획 같은 후속 공정에 영향을 주어 운용지원 단계까지 적절한 관리를 보장한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.6 (p.167)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    verification_status: source_supported
    gate_role: supporting
  - id: 1232
    name: 절충연구보고서(Trade_Study)_F
    desc: Trade study reports (detailed design trades, complete)
    term: Trade_Study
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: trade_study
    purpose_ko: '체계 아키텍처와 운용개념, 설계 결정이 가용 자원으로 달성 가능한 최선의 해로 나아가게 하는 것이 목적이며, 보고서에는 대안·측도·자료원·계산결과·선정규칙과 권고 대안을 담는다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.94 (printed p.81) §4.4.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.247 (printed p.234) App B Glossary (Trade Study Report)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.5.1-§3.2.5.3 (p.25)
    depends_on_origin: canonical
    gate_role: entry
  - id: 1233
    name: 제조성숙도평가(MRA)_D
    desc: Manufacturing readiness / producibility assessment (pre-build)
    term: MRA
    source: DoD SE Guidebook 2022 Table 5-5 p.187-189, Table 3-5; NASA NPR 7123.1D Table G-7
    template: 없음
    artifact_type_id: mra_report
    purpose_ko: '제조 위험을 평가하는 수단으로, 획득 수명주기 전반의 기존 프로그램 평가와 통합되어 지속 수행되며 각 기술검토와 이정표 결정 전에 제조 준비 상태와 진척을 보고하는 근거가 된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.14.5 (p.185)'
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
    gate_role: supporting
  - id: 1234
    name: 품질보증계획(QAP)_U
    desc: Quality assurance plan / inspection plan (updated for fabrication)
    term: QAP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.86-87
    template: 없음
    artifact_type_id: qa_plan
    purpose_ko: '품질보증은 실제로 생산·인도된 체계가 기능·성능·설계 요구에 부합한다는 확신을 얻기 위해 제품 수명주기 전반에 걸쳐 수행하는 독립적 평가다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.239 (printed p.226) App B Glossary (Quality Assurance)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.86-87
    verification_status: source_supported
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: supporting
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
    depends_on:
    - act_architecture_design
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1236
    name: SEMP_U
    desc: SEMP (updated)
    term: SEMP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87
    template: 없음
    artifact_type_id: semp
    purpose_ko: '프로젝트 기술·공학 활동의 기반 문서로, 어떤 기술과정을 어떻게 적용하고 조직과 자원을 어떻게 갖출지 규정하며 각 수명주기 단계의 진입·성공 기준을 충족하는 작업산출물 실현의 틀을 제공한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.282 (printed p.269) App J §J.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.155 (printed p.142) §6.1.1.2.4'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87
    verification_status: source_supported
    gate_role: entry
  - id: 1237
    name: IMS_U
    desc: 'Integrated master schedule (updated: fabrication, coding, integration, test critical path)'
    term: IMS
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: ims
    purpose_ko: '발주·계약자·하도급 활동을 포함한 전체 작업 범위를 일정·기간·선후관계로 기술한 문서로, 주공정과 이정표를 식별하고 계획 대비 진척 비교, 자원 분석, 위험 완화 추적의 기준을 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.106-107)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
    gate_role: entry
  - id: 1238
    name: ILSP_U
    desc: Integrated logistics support plan / LCSP (updated with supportability features)
    term: ILS
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.88
    template: 없음
    artifact_type_id: ils_plan
    purpose_ko: '종합군수지원은 설계요구 정의, 자재 조달·배분, 정비, 보급 교체, 수송, 폐기와 관련된 관리·공학 활동과 분석, 정보관리를 포괄하며, 비행·지상체계 지원성 목표에 따라 식별된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.230 (printed p.217) App B Glossary ''Integrated Logistics Support'''
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.88
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: entry
  - id: 1239
    name: 체계보안계획(PPP)_F
    desc: System security plan (baselined) / program protection plan updated; security controls identified
    term: PPP
    source: NASA NPR 7123.1D Table G-7; DoD SE Guidebook 2022 Table 3-5 p.87-88
    template: 없음
    artifact_type_id: security_plan
    purpose_ko: '체계보안공학 분석의 종합적 접근과 그 결과를 문서화해 프로그램과 관련자의 활동을 이끄는 계획으로, 각 기술검토·감사에 제출되어 검토 평가 기준과 기능·할당·제품 기준선에 반영된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.24 (p.216)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: baseline
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-7
    - source_key: dod_se_guidebook_2022
      locator: Table 3-5 p.87-88
    verification_status: source_supported
    gate_role: entry
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
    gate_role: entry
  - id: 1241
    name: CDR회의록_F
    desc: CDR minutes with RID/RFA dispositions and corrective action plans
    term: CDR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.88
    template: 없음
    artifact_type_id: review_minutes_cdr
    purpose_ko: '검토에서 내려진 결정을 뒷날 참조할 수 있는 이력 기록으로 남기며, 모든 RID·RFA 처리에 대한 합의와 함께 완성·배포되어야 해당 수명주기 검토가 완료로 인정된다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.2.9 (p.40)'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: p.88
    verification_status: source_supported
    gate_role: supporting
  - id: 1242
    name: CDR결과보고서_F
    desc: CDR review result report / assessment (product baseline evidence, TPM status)
    term: CDR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1, p.38 §5.2.2.2.e; DoD SE Guidebook 2022 p.88-89
    template: 없음
    artifact_type_id: review_result_report_cdr
    purpose_ko: '검토위원회 보고서로, 검토 성공기준 대비 미흡한 성과의 문제·우려를 담아 관리조직에 보고되며, 검토의 성공적 완료를 문서화하는 결정 메모와 함께 수명주기 검토 완료 요건을 이룬다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
  - id: 1243
    name: 구현·제작(활동)
    desc: Product implementation — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_implementation
    purpose_ko: '구현은 구매·제작(코딩)·재사용으로 해당 제품계층의 규정된 산품을 만들어 설계해 정의와 규정 요구사항을 충족시키는 활동으로, 계획과 설계를 실제 산품으로 옮기는 단계다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.104 (printed p.91) §5.1'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.6.2 (p.25)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    verification_status: partially_supported
    evidence_record:
    - engineering_analysis_report
    - manufacturing_plan
    - qa_plan
    - tdp
    added_by_verification: '2026-08-18'
    depends_on:
    - pci
    - tra_report
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.6.1-§3.2.6.2 (p.25)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1244
    name: 인도·전환(활동)
    desc: Product transition — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_transition
    purpose_ko: '인도·전환은 검증·확인을 마친 최종산품을 상위 계층 고객에게 넘겨 통합되게 하거나 최상위 산품의 경우 실사용자에게 인도하는 활동으로, 한 계층에서 다음 계층으로 잇는 다리 역할을 한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.137 (printed p.124) §5.5'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.10.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    verification_status: partially_supported
    evidence_record:
    - drawings
    - ils_plan
    added_by_verification: '2026-08-18'
    depends_on:
    - hsi_plan
    - icd
    - tdp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1245
    name: 제품 기준선 확정(결정)
    desc: Initial product baseline established at CDR — decision node (no folder); evidenced by the configuration identification and the review record
    term: DECISION
    source: DoD SE Guidebook 2022 §4.1.6 (baseline definitions)
    template: 없음
    artifact_type_id: dec_product_baseline
    purpose_ko: '제품 기준선 확정은 생산·배치·운용지원 단계의 형상항목 형상을 기술하는 승인된 기술문서를 고정하는 것으로, 상세 형상적합기능 특성과 생산 수락시험 대상 기능특성 및 수락시험 요구사항을 규정한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.183 (printed p.170) §6.5.1.2.2'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.236 (printed p.223) App B Glossary ''Product Baseline'''
    node_kind: decision
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.6 (p.131-134; baseline definitions p.132-133)'
    verification_status: partially_supported
    evidence_record:
    - pci
    - review_minutes_cdr
    added_by_verification: '2026-08-18'
    depends_on:
    - pci
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.1.6 (p.131-134; baseline definitions p.132-133)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: core
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
    gate_role: entry
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
    gate_role: supporting
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
    gate_role: entry
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
    gate_role: entry
  - id: 1509
    name: 통합계획서및통합절차(Integration)_U
    desc: Integration plan (updated and approved) with integration procedures and workflow
    term: Integration
    source: NASA NPR 7123.1D Table G-9, p.38 [SE-47]
    template: 없음
    artifact_type_id: integration_plan
    purpose_ko: '통합계획서는 조율된 통합 노력을 기술해 구현전략을 뒷받침하고, 각 통합 단계에서 참여자가 무엇을 해야 하는지 기술하며, 필요한 자원과 그 시기·장소를 식별하는 데 주된 목적이 있다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.269 (printed p.256) App H.1'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.111 (printed p.98) §5.2'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    - source_key: nasa_npr_7123_1d
      locator: p.38 [SE-47]
    verification_status: source_supported
    gate_role: supporting
  - id: 1510
    name: 하위시험결과보고서(DT)_D
    desc: Lower-tier verification results (unit, subsystem, qualification test reports; initial V&V results)
    term: DT
    source: NASA NPR 7123.1D Table G-9, p.38 [SE-48]; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: dt_report
    purpose_ko: '개발시험·수락시험·인정시험으로 수행한 검증 활동과 그 결과를 문서화한 것으로, 기능형상감사와 체계검증검토의 산출물에 포함되어 요구 충족의 근거가 된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.2.6 (p.151)'
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
    depends_on:
    - act_verification
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 1513
    name: 인터페이스검증기록-VCRM_U
    desc: Interface verification records against ICDs (mechanical/electrical) and VCRM update
    term: VCRM
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: vcrm
    purpose_ko: '모든 요구사항을 어떻게 검증할지 규정하는 표로, ''shall'' 요구를 고유 식별자와 출처 문서로 특정하고 성공기준·검증방법·수행조직과 충족 증거 문서를 함께 기록한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.253 (printed p.240) App D'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
    depends_on:
    - act_verification
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1514
    name: 결함-불일치목록(Discrepancy)_U
    desc: Discrepancy / deficiency log with dispositions and closure schedule
    term: Discrepancy
    source: NASA NPR 7123.1D Table G-9, Table G-10; DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: discrepancy_log
    purpose_ko: '불일치가 관측되면 검증을 멈추고 불일치보고를 작성하며, 불일치와 부적합품은 후속조치와 종결을 위해 기록·보고한다. 모든 불일치·부적합 보고의 종결은 제품검증 완료 판정 기준의 하나다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.125 (printed p.112) §5.3.1.2.2'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.126 (printed p.113) §5.3.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.128 (printed p.115) §5.3.1.3'
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
    depends_on:
    - act_implementation
    - act_transition
    - act_validation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.9.1-§3.2.9.2 (p.26)
    depends_on_origin: canonical
    gate_role: entry
  - id: 1515
    name: 시험안전계획-취급안전요구(Safety)_U
    desc: Test safety plan / test hazard analysis and handling & safety requirements
    term: Safety
    source: NASA NPR 7123.1D Table G-10, Table G-9
    template: 없음
    artifact_type_id: system_safety_analysis
    purpose_ko: '운용자·체계·환경·공중에 미치는 위험을 평가하기 위해 안전해석을 수행하며, 그 접근법과 방법은 체계공학관리계획의 체계안전 항목에 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.1'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
    gate_role: supporting
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
    gate_role: entry
  - id: 1517
    name: TEMP_U
    desc: Test and evaluation master plan / V&V plan (updated)
    term: TEMP
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: temp
    purpose_ko: '검증·확인(V&V) 계획으로, 요구사항 충족을 입증할 활동(검증)과 체계가 고객 기대를 충족함을 확인할 활동(확인)을 식별하는 것이 목적이며 PDR 지적사항 반영 뒤 기준선화한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.272 (printed p.259) App I §1.1'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
    gate_role: supporting
  - id: 1518
    name: 위험목록(Risk_Register)_U
    desc: Risk register (updated; residual test risk accepted)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-10, Table G-9
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
    gate_role: core
  - id: 1519
    name: 운송-취급-포장지침(PHS_T)_F
    desc: Transportation, handling and packaging criteria/instructions (final)
    term: PHS_T
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: handling_transport_plan
    purpose_ko: '군수·운용 절차 문서는 해당 설계해에 대한 취급, 수송, 정비, 장기보관, 운용상 고려사항을 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.101 (printed p.88) §4.4.1.3'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
    gate_role: supporting
  - id: 1520
    name: 설계기술서-ICD_U
    desc: Design description and ICDs (updated to as-built for integration)
    term: ICD
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: icd
    purpose_ko: '인터페이스 통제문서는 인터페이스 정보와 승인된 인터페이스 변경요청을 식별·수록하는 문서로, 형상관리로 유지·승인되어 기술자료묶음의 일부가 되며 제품검증·확인 과정의 입력으로 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.172 (printed p.159) §6.3.1.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.171 (printed p.158) §6.3.1.2.3'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
    depends_on:
    - act_architecture_design
    - act_integration
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: canonical
    gate_role: entry
  - id: 1521
    name: IMS_U
    desc: 'Integrated master schedule (updated: component availability and test schedule)'
    term: IMS
    source: NASA NPR 7123.1D Table G-9
    template: 없음
    artifact_type_id: ims
    purpose_ko: '발주·계약자·하도급 활동을 포함한 전체 작업 범위를 일정·기간·선후관계로 기술한 문서로, 주공정과 이정표를 식별하고 계획 대비 진척 비교, 자원 분석, 위험 완화 추적의 기준을 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.106-107)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-9
    verification_status: partially_supported
    gate_role: supporting
  - id: 1522
    name: 시험교훈수집계획(Lessons_Learned)_D
    desc: Lessons learned capture plan for test (initial log)
    term: Lessons_Learned
    source: NASA NPR 7123.1D Table G-10
    template: 없음
    artifact_type_id: lessons_learned
    purpose_ko: '유사 프로그램의 성공·실패·문제와 해결책을 정리한 기록으로, 위험·불확실성·기회에 대한 통찰을 주며 현재 프로그램에 맞게 선별·조정해 적용할 때 가장 큰 이익을 준다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§2.2.8 (p.46)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: preliminary
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
    gate_role: core
  - id: 1523
    name: TRR회의록_F
    desc: TRR minutes with test authorization and RID/action dispositions
    term: TRR_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1, Table G-10
    template: 없음
    artifact_type_id: review_minutes_trr
    purpose_ko: '검토에서 내려진 결정을 뒷날 참조할 수 있는 이력 기록으로 남기며, 모든 RID·RFA 처리에 대한 합의와 함께 완성·배포되어야 해당 수명주기 검토가 완료로 인정된다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.2.9 (p.40)'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: nasa_npr_7123_1d
      locator: Table G-10
    verification_status: partially_supported
    gate_role: supporting
  - id: 1524
    name: TRR결과보고서_F
    desc: TRR review result report
    term: TRR_결과보고서
    source: NASA NPR 7123.1D p.40 §5.2.3.1
    template: 없음
    artifact_type_id: review_result_report_trr
    purpose_ko: '검토위원회 보고서로, 검토 성공기준 대비 미흡한 성과의 문제·우려를 담아 관리조직에 보고되며, 검토의 성공적 완료를 문서화하는 결정 메모와 함께 수명주기 검토 완료 요건을 이룬다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    verification_status: partially_supported
    gate_role: supporting
  - id: 1525
    name: 인도·전환(활동)
    desc: Product transition — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_transition
    purpose_ko: '인도·전환은 검증·확인을 마친 최종산품을 상위 계층 고객에게 넘겨 통합되게 하거나 최상위 산품의 경우 실사용자에게 인도하는 활동으로, 한 계층에서 다음 계층으로 잇는 다리 역할을 한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.137 (printed p.124) §5.5'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.10.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    verification_status: partially_supported
    evidence_record:
    - discrepancy_log
    added_by_verification: '2026-08-18'
    depends_on:
    - handling_transport_plan
    - hsi_plan
    - icd
    - tdp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1526
    name: 확인(활동)
    desc: Product validation — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: NASA SE Handbook Rev2 4-6장 / DoD SE Guidebook 2022 §4 프로세스 입출력
    template: 없음
    artifact_type_id: act_validation
    purpose_ko: '확인은 검증을 마친 최종산품이 의도한 환경에서 의도한 용도를 충족하는지를 기준선화된 이해관계자 기대(MOE·운용개념)에 비추어 확증하고, 발견된 이상을 인도나 상위 통합 전에 해결하도록 하는 활동이다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.129 (printed p.116) §5.4'
    - source_key: nasa_npr_7123_1d
      locator: '§3.2.9.2 (p.26)'
    node_kind: activity
    is_virtual: true
    evidence_level: general_se_guidance
    se_floor: should_have
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: §3.2.9.1-§3.2.9.2 (p.26)
    verification_status: partially_supported
    evidence_record:
    - discrepancy_log
    added_by_verification: '2026-08-18'
    depends_on:
    - pci
    - temp
    - vv_strategy
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.129-136 (printed p.116-123) §5.4.1.1/§5.4.1.3, Figure 5.4-1
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 1804
    name: 개발시험결과보고서-검증결과(DT)_F
    desc: Development test report(s) / verification results (all spec requirements verified by A/D/E/T and documented)
    term: DT
    source: NASA NPR 7123.1D Table G-11, Table G-12 [SE-69]; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: dt_report
    purpose_ko: '개발시험·수락시험·인정시험으로 수행한 검증 활동과 그 결과를 문서화한 것으로, 기능형상감사와 체계검증검토의 산출물에 포함되어 요구 충족의 근거가 된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.2.6 (p.151)'
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
    depends_on:
    - act_verification
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
  - id: 1806
    name: VCRM완료본_F
    desc: Verification cross-reference matrix completed (requirement-to-evidence compliance matrix)
    term: VCRM
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91, p.90
    template: 없음
    artifact_type_id: vcrm
    purpose_ko: '모든 요구사항을 어떻게 검증할지 규정하는 표로, ''shall'' 요구를 고유 식별자와 출처 문서로 특정하고 성공기준·검증방법·수행조직과 충족 증거 문서를 함께 기록한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.253 (printed p.240) App D'
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
    depends_on:
    - act_verification
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.6 (p.150-151; explicit output sentence p.151)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1807
    name: 요구사항추적표(RTM)_F
    desc: Requirements traceability matrix (final, requirement to verification evidence)
    term: RTM
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: rtm
    purpose_ko: '요구사항의 양방향 추적성을 기록하는 표로, 각 요구가 상위 요구를 온전히 충족하는지 점검하고 충족되지 않은 부분을 보완해 넣으며 부모 없는 요구를 걸러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.165 (printed p.152) §6.2.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.163 (printed p.150) §6.2'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: source_supported
    depends_on:
    - act_requirements_analysis
    - act_stakeholder_expectations
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 1808
    name: 기능형상감사계획서(FCA_Plan)_F
    desc: Functional configuration audit plan
    term: FCA_Plan
    source: DoD SE Guidebook 2022 §3.6, p.89-91
    template: 없음
    artifact_type_id: fca_plan
    purpose_ko: '정량화된 검토 기준을 세워 프로그램 목표에 맞게 조정한 감사 수행 계획으로, 그 기준은 체계공학계획에 문서화되며 기준이 충족되기 전에는 감사를 시작하지 않는다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§3.6 (p.90-91)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §3.6
    - source_key: dod_se_guidebook_2022
      locator: p.89-91
    verification_status: partially_supported
    gate_role: supporting
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
    gate_role: supporting
  - id: 1810
    name: 기능형상감사결과보고서(FCA)_F
    desc: Functional configuration audit report (functional/allocated baseline verified)
    term: FCA
    source: DoD SE Guidebook 2022 p.91; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: fca_report
    purpose_ko: '기능형상감사는 형상화된 산품의 기능 특성을 조사해 PDR·CDR에서 승인된 기능 기준선 문서와 이후 승인된 변경의 요구사항을 시험결과로 충족했는지 검증하며, 하드웨어·소프트웨어 모두에 대해 PCA에 앞서 수행한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.229 (printed p.216) App B Glossary ''Functional Configuration Audit (FCA)'''
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.91
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
    gate_role: supporting
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
    gate_role: supporting
  - id: 1812
    name: 운용시험결과보고서(OT)_F
    desc: Operational test / validation results report
    term: OT
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91, p.95
    template: 없음
    artifact_type_id: ot_report
    purpose_ko: '확인(validation) 결과 보고서로, 해당 계층 제품이 확인 대상으로 식별된 이해관계자 기대에 부합한다는 증거를 제시하며 부적합·이상과 그에 대해 취한 시정조치를 함께 담는다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.136 (printed p.123) §5.4.1.3'
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
    depends_on:
    - act_validation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: entry
  - id: 1815
    name: TDP_U
    desc: Technical data package (updated with all test results)
    term: TDP
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 p.90
    template: 없음
    artifact_type_id: tdp
    purpose_ko: '획득전략·생산·공학·군수지원을 뒷받침하기에 충분한 품목의 기술적 기술서로, 요구되는 설계 형상과 성능 적합성을 보장할 절차를 규정하며 도면·목록·규격·표준·품질보증 조항 등을 포함한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.191 (printed p.178) §6.6.1.2.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: p.90
    verification_status: source_supported
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: entry
  - id: 1816
    name: 수락자료묶음(ADP)_F
    desc: Acceptance data package / certificate of conformance evidence
    term: ADP
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-7 p.94, p.91
    template: 없음
    artifact_type_id: acceptance_data_package
    purpose_ko: '수락시험 항목은 검증 프로그램에서 축소 선별해 제작·인도되는 비행품마다 수행하며, 그 결과를 담은 수락자료묶음을 호기마다 작성해 제품과 함께 인도한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.117 (printed p.104) §5.3 (Verification/Qualification/Acceptance/Certification box)'
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
    gate_role: core
  - id: 1817
    name: 결함-면제·일탈현황(Discrepancy)_U
    desc: Discrepancy / deficiency and waiver-deviation status (closed or planned)
    term: Discrepancy
    source: NASA NPR 7123.1D Table G-11, Table G-12; DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: discrepancy_log
    purpose_ko: '불일치가 관측되면 검증을 멈추고 불일치보고를 작성하며, 불일치와 부적합품은 후속조치와 종결을 위해 기록·보고한다. 모든 불일치·부적합 보고의 종결은 제품검증 완료 판정 기준의 하나다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.125 (printed p.112) §5.3.1.2.2'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.126 (printed p.113) §5.3.1.2.3'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.128 (printed p.115) §5.3.1.3'
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
    depends_on:
    - act_implementation
    - act_transition
    - act_validation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.9.1-§3.2.9.2 (p.26)
    depends_on_origin: canonical
    gate_role: entry
  - id: 1818
    name: 위험목록(Risk_Register)_U
    desc: Risk register (residual risks accepted before initial production)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-11; DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: source_supported
    gate_role: core
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 1822
    name: 운송-취급-점검절차(PHS_T)_F
    desc: Shipping, handling, checkout and operational plans/procedures (safety-cleared)
    term: PHS_T
    source: NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: handling_transport_plan
    purpose_ko: '군수·운용 절차 문서는 해당 설계해에 대한 취급, 수송, 정비, 장기보관, 운용상 고려사항을 기술한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.101 (printed p.88) §4.4.1.3'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: partially_supported
    gate_role: entry
  - id: 1823
    name: IMS_U
    desc: Plan and schedule to PRR/PCA (resourced)
    term: IMS
    source: DoD SE Guidebook 2022 Table 3-6 p.91
    template: 없음
    artifact_type_id: ims
    purpose_ko: '발주·계약자·하도급 활동을 포함한 전체 작업 범위를 일정·기간·선후관계로 기술한 문서로, 주공정과 이정표를 식별하고 계획 대비 진척 비교, 자원 분석, 위험 완화 추적의 기준을 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.106-107)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-6 p.91
    verification_status: partially_supported
    gate_role: supporting
  - id: 1824
    name: 교훈기록(Lessons_Learned)_U
    desc: Lessons learned log (captured through verification)
    term: Lessons_Learned
    source: NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: lessons_learned
    purpose_ko: '유사 프로그램의 성공·실패·문제와 해결책을 정리한 기록으로, 위험·불확실성·기회에 대한 통찰을 주며 현재 프로그램에 맞게 선별·조정해 적용할 때 가장 큰 이익을 준다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§2.2.8 (p.46)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: partially_supported
    gate_role: core
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
    gate_role: entry
  - id: 1826
    name: FCA회의록_F
    desc: FCA/SVR minutes with dispositions
    term: FCA_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 Table 3-7 p.94
    template: 없음
    artifact_type_id: review_minutes_fca
    purpose_ko: '검토에서 내려진 결정을 뒷날 참조할 수 있는 이력 기록으로 남기며, 모든 RID·RFA 처리에 대한 합의와 함께 완성·배포되어야 해당 수명주기 검토가 완료로 인정된다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.2.9 (p.40)'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: p.40 §5.2.3.1
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    verification_status: source_supported
    gate_role: supporting
  - id: 1827
    name: FCA결과보고서_F
    desc: FCA/SVR review result report (verified functional/allocated baseline; authorization for acceptance/initial production)
    term: FCA_결과보고서
    source: NASA NPR 7123.1D Table G-11, p.40 §5.2.3.1; DoD SE Guidebook 2022 p.91
    template: 없음
    artifact_type_id: review_result_report_fca
    purpose_ko: '검토위원회 보고서로, 검토 성공기준 대비 미흡한 성과의 문제·우려를 담아 관리조직에 보고되며, 검토의 성공적 완료를 문서화하는 결정 메모와 함께 수명주기 검토 완료 요건을 이룬다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 2104
    name: 물리형상감사계획서(PCA_Plan)_F
    desc: Physical configuration audit plan
    term: PCA_Plan
    source: DoD SE Guidebook 2022 §3.8, p.95-97
    template: 없음
    artifact_type_id: pca_plan
    purpose_ko: '정량화된 검토 기준을 세워 프로그램 목표에 맞게 조정한 감사 수행 계획으로, 그 기준은 체계공학계획에 문서화되고 감사는 기준이 충족되었다고 판단될 때 수행한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§3.8 (p.96-97)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: §3.8
    - source_key: dod_se_guidebook_2022
      locator: p.95-97
    verification_status: partially_supported
    gate_role: supporting
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
    gate_role: supporting
  - id: 2106
    name: 물리형상감사결과보고서(PCA)_F
    desc: Physical configuration audit report (final product baseline verified)
    term: PCA
    source: DoD SE Guidebook 2022 p.97; NASA NPR 7123.1D Table G-12
    template: 없음
    artifact_type_id: pca_report
    purpose_ko: '물리형상감사는 형상화된 제품의 물리적 형상을 검사해 CDR에서 승인된 제작·코딩 기준 제품기준선 문서와 이후 승인된 변경에 제품이 일치하는지 확인하며, 하드웨어와 소프트웨어 모두에 수행한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.235 (printed p.222) App B Glossary (Physical Configuration Audits)'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.187 (printed p.174) §6.4.1.2.5 (Conduct Configuration Audits)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.97
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    verification_status: source_supported
    gate_role: supporting
  - id: 2107
    name: 제품형상식별서(PCI)_F
    desc: Final product baseline configuration identification (as-built, OT-validated item)
    term: PCI
    source: DoD SE Guidebook 2022 Table 3-8 p.97, p.133; NASA NPR 7123.1D Table G-12, Table G-11
    template: 없음
    artifact_type_id: pci
    purpose_ko: '제품기준선은 생산·배치·운용지원 단계에서 형상항목의 형상을 기술하는 승인된 기술문서로, 형상항목의 물리적 형태·적합·기능 특성과 생산수락시험 대상 기능특성 및 그 시험요구를 규정한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.183 (printed p.170) §6.5.1.2.2'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.236 (printed p.223) App B Glossary (Product Baseline)'
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
    gate_role: supporting
  - id: 2108
    name: 제작도면(Drawings)_F
    desc: Engineering drawings / production models approved and certified (as-built, redlines incorporated)
    term: Drawings
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 p.95-96
    template: 없음
    artifact_type_id: drawings
    purpose_ko: '기술자료묶음은 단계가 진행되며 개념 스케치나 모델에서 시작해, 제품 구현과 통합에 필요한 완성 도면·부품목록·상세자료로 마무리된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.98 (printed p.85) §4.4.1.2.6'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: p.95-96
    verification_status: source_supported
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: canonical
    gate_role: core
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
    gate_role: entry
  - id: 2110
    name: TDP_F
    desc: Technical data package (final, transferred per contract)
    term: TDP
    source: DoD SE Guidebook 2022 p.96; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: tdp
    purpose_ko: '획득전략·생산·공학·군수지원을 뒷받침하기에 충분한 품목의 기술적 기술서로, 요구되는 설계 형상과 성능 적합성을 보장할 절차를 규정하며 도면·목록·규격·표준·품질보증 조항 등을 포함한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.191 (printed p.178) §6.6.1.2.1'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.96
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    verification_status: source_supported
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: supporting
  - id: 2111
    name: 생산계획서(MFG_Plan)_F
    desc: Production plan (critical process controls, control limits, procedures, tooling/test equipment, delivery schedule)
    term: MFG_Plan
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-7 p.93-94
    template: 없음
    artifact_type_id: manufacturing_plan
    purpose_ko: '회사와 생산 시설이 계약 요구를 어떻게 충족하고 제품을 인도할지 상세히 다루는 계획으로, 작업분해구조·자재명세서와 연결되고 최종품 제작·조립에 필요한 단계를 기술한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.14 (p.178)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.93-94
    verification_status: source_supported
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: core
  - id: 2112
    name: 수락시험절차-장비(ATP)_F
    desc: Acceptance test procedures and acceptance test equipment (validated, under CM)
    term: ATP
    source: DoD SE Guidebook 2022 Table 3-7 p.94; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: atp
    purpose_ko: '수락시험은 검증 프로그램에서 선별한 축소 항목을 제작·인도되는 비행품마다 수행하며, 그 시험·해석 기준은 해당 호기의 제작과 기량이 앞서 검증·인정된 설계에 부합함을 보이도록 선정한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.117 (printed p.104) §5.3 (Verification/Qualification/Acceptance/Certification box)'
    evidence_level: general_se_guidance
    se_floor: must_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    verification_status: source_supported
    gate_role: supporting
  - id: 2113
    name: 생산품질-검사계획(QAP)_F
    desc: Quality / inspection plan for production (in-process and end-item inspections)
    term: QAP
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-7 p.94, Table 3-8 p.97
    template: 없음
    artifact_type_id: qa_plan
    purpose_ko: '품질보증은 실제로 생산·인도된 체계가 기능·성능·설계 요구에 부합한다는 확신을 얻기 위해 제품 수명주기 전반에 걸쳐 수행하는 독립적 평가다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.239 (printed p.226) App B Glossary (Quality Assurance)'
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
    depends_on:
    - act_implementation
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    depends_on_origin: canonical
    gate_role: core
  - id: 2114
    name: 제조성숙도평가-생산준비검토보고서(MRA)_F
    desc: Manufacturing readiness assessment / PRR report
    term: MRA
    source: DoD SE Guidebook 2022 p.94, Table 5-5 p.187-189; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: mra_report
    purpose_ko: '제조 위험을 평가하는 수단으로, 획득 수명주기 전반의 기존 프로그램 평가와 통합되어 지속 수행되며 각 기술검토와 이정표 결정 전에 제조 준비 상태와 진척을 보고하는 근거가 된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.14.5 (p.185)'
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
    gate_role: supporting
  - id: 2115
    name: 고장보고·분석·시정조치(FRACAS)기록_F
    desc: Failure reporting, analysis and corrective action system (FRACAS) records
    term: FRACAS
    source: DoD SE Guidebook 2022 Table 3-7 p.94; NASA NPR 7123.1D Table G-8
    template: 없음
    artifact_type_id: fracas_report
    purpose_ko: '시험 중 고장 자료가 되먹임되도록 하고 시정조치를 적용·추적하기 위한 폐회로 기록 체계로, 생산과 운용지원 단계에서 문제 영역을 찾아 개선하는 데 쓰인다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.197)'
    - source_key: dod_se_guidebook_2022
      locator: 'Table 5-6 (p.198)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: baseline
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: Table 3-7 p.94
    - source_key: nasa_npr_7123_1d
      locator: Table G-8
    verification_status: source_supported
    gate_role: supporting
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
    gate_role: supporting
  - id: 2117
    name: 운용-정비기술교범(Tech_Manual)_F
    desc: Operator and maintenance technical manuals / operations documentation (verified and approved)
    term: Tech_Manual
    source: NASA NPR 7123.1D Table G-12; DoD SE Guidebook 2022 p.96, Table 3-5 p.88
    template: 없음
    artifact_type_id: tech_manual
    purpose_ko: '최종산출물에 동반해 인도되는 문서로, 제품의 내력과 현재 상태를 밝히고 검증·확인 적합성 증거를 포함하며 운용설명서·설치지침 등이 여기에 속한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.139 (printed p.126) §5.5.1.1'
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
    depends_on:
    - act_implementation
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.105-108 (printed p.92-95) §5.1.1.1/§5.1.1.3, Figure 5.1-1
    depends_on_origin: canonical
    gate_role: supporting
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
    depends_on:
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
  - id: 2120
    name: ILSP_F
    desc: Integrated logistics support plan / sustainment plan (final; sustaining planning complete)
    term: ILS
    source: NASA NPR 7123.1D Table G-11, Table G-12; DoD SE Guidebook 2022 Table 3-8 p.97
    template: 없음
    artifact_type_id: ils_plan
    purpose_ko: '종합군수지원은 설계요구 정의, 자재 조달·배분, 정비, 보급 교체, 수송, 폐기와 관련된 관리·공학 활동과 분석, 정보관리를 포괄하며, 비행·지상체계 지원성 목표에 따라 식별된다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.230 (printed p.217) App B Glossary ''Integrated Logistics Support'''
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
    depends_on:
    - act_architecture_design
    - act_transition
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.90-100 (printed p.77-87) §4.4.1.1/§4.4.1.3, Figure 4.4-1
    depends_on_origin: canonical
    gate_role: supporting
  - id: 2121
    name: 생산-납품IMS_U
    desc: Production / delivery integrated master schedule
    term: IMS
    source: NASA NPR 7123.1D Table G-8; DoD SE Guidebook 2022 Table 3-7 p.94, Table 3-8 p.97
    template: 없음
    artifact_type_id: ims
    purpose_ko: '발주·계약자·하도급 활동을 포함한 전체 작업 범위를 일정·기간·선후관계로 기술한 문서로, 주공정과 이정표를 식별하고 계획 대비 진척 비교, 자원 분석, 위험 완화 추적의 기준을 제공한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.106-107)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
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
    gate_role: supporting
  - id: 2122
    name: 위험목록(Risk_Register)_U
    desc: Risk register (production and deployment risks; low enough for FRP)
    term: Risk_Register
    source: NASA NPR 7123.1D Table G-8, Table G-12; DoD SE Guidebook 2022 Table 3-7 p.93, Table 3-8 p.97
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
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
    gate_role: entry
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
    gate_role: supporting
  - id: 2124
    name: 현장인수-설치점검시험보고서(SAT)_F
    desc: Site acceptance / installation and checkout test report (enabling products delivered/installed)
    term: SAT
    source: NASA NPR 7123.1D Table G-12
    template: 없음
    artifact_type_id: sat_report
    purpose_ko: '인도·설치 이후 수행하는 기능시험·수락시험의 기록으로, 운송·취급 과정에서 손상이 없었고 제품이 지원 개시 준비가 되었음을 확인한다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.142 (printed p.129) §5.5.1.2.4'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    verification_status: partially_supported
    gate_role: supporting
  - id: 2125
    name: 보안-보호계획(PPP)_U
    desc: System security / protection plan (updated for deployment)
    term: PPP
    source: NASA NPR 7123.1D Table G-12; DoD SE Guidebook 2022 p.216
    template: 없음
    artifact_type_id: security_plan
    purpose_ko: '체계보안공학 분석의 종합적 접근과 그 결과를 문서화해 프로그램과 관련자의 활동을 이끄는 계획으로, 각 기술검토·감사에 제출되어 검토 평가 기준과 기능·할당·제품 기준선에 반영된다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§5.24 (p.216)'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: updated
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Table G-12
    - source_key: dod_se_guidebook_2022
      locator: p.216
    verification_status: source_supported
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 2128
    name: PCA-PRR회의록_F
    desc: PCA/PRR minutes with dispositions
    term: PCA_회의록
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.94, p.97
    template: 없음
    artifact_type_id: review_minutes_pca
    purpose_ko: '검토에서 내려진 결정을 뒷날 참조할 수 있는 이력 기록으로 남기며, 모든 RID·RFA 처리에 대한 합의와 함께 완성·배포되어야 해당 수명주기 검토가 완료로 인정된다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.2.9 (p.40)'
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
  - id: 2129
    name: PCA-PRR결과보고서_F
    desc: PCA/PRR review result report (final product baseline established; production go-ahead)
    term: PCA_결과보고서
    source: NASA NPR 7123.1D Table G-8, p.40 §5.2.3.1; DoD SE Guidebook 2022 p.94, p.97
    template: 없음
    artifact_type_id: review_result_report_pca
    purpose_ko: '검토위원회 보고서로, 검토 성공기준 대비 미흡한 성과의 문제·우려를 담아 관리조직에 보고되며, 검토의 성공적 완료를 문서화하는 결정 메모와 함께 수명주기 검토 완료 요건을 이룬다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
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
    gate_role: supporting
  - id: 2404
    name: 교훈보고서(Lessons_Learned)_F
    desc: Lessons learned report (development, test, production, review process)
    term: Lessons_Learned
    source: NASA NPR 7123.1D Table G-4, Table G-10
    template: 없음
    artifact_type_id: lessons_learned
    purpose_ko: '유사 프로그램의 성공·실패·문제와 해결책을 정리한 기록으로, 위험·불확실성·기회에 대한 통찰을 주며 현재 프로그램에 맞게 선별·조정해 적용할 때 가장 큰 이익을 준다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§2.2.8 (p.46)'
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
    gate_role: supporting
  - id: 2405
    name: 검토조치사항종결대장(Action_Log)_F
    desc: Action item / RID-RFA closure log across all reviews (final)
    term: Action_Log
    source: NASA NPR 7123.1D p.40 §5.2.3.1; DoD SE Guidebook 2022 p.75, p.87
    template: 없음
    artifact_type_id: action_item_log
    purpose_ko: '수명주기 검토는 모든 RID·RFA 처리와 조치계획에 합의하고, 검토에서 도출된 모든 조치가 이행·확인을 거쳐 종결되도록 하는 절차와 통제가 마련되었을 때 완료로 본다.'
    purpose_refs:
    - source_key: nasa_npr_7123_1d
      locator: '§5.2.3.1 (p.40)'
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
    gate_role: supporting
  - id: 2406
    name: 자료납품종결확인(CDRL)_F
    desc: CDRL delivery closeout / data transfer receipt (TDP, baselines, manuals delivered)
    term: CDRL
    source: DoD SE Guidebook 2022 p.96; NASA NPR 7123.1D Table G-11
    template: 없음
    artifact_type_id: cdrl
    purpose_ko: '계약에서 요구되는 기술자료·디지털 산출물·소프트웨어의 인도를 주문하는 목록으로, 잘 정의되면 개발자가 적절한 설계 고려사항을 구현하고 필요한 객관적 품질 증거를 산출하도록 보장한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.7 (p.136)'
    - source_key: dod_se_guidebook_2022
      locator: 'p.56'
    evidence_level: general_se_guidance
    se_floor: should_have
    maturity: final
    source_refs:
    - source_key: dod_se_guidebook_2022
      locator: p.96
    - source_key: nasa_npr_7123_1d
      locator: Table G-11
    verification_status: source_supported
    gate_role: supporting
  - id: 2407
    name: 위험목록종결본(Risk_Register)_F
    desc: Risk register closeout (final status, transferred risks)
    term: Risk_Register
    source: NASA NPR 7123.1D Tables G-1..G-12; DoD SE Guidebook 2022 p.17
    template: 없음
    artifact_type_id: risk_register
    purpose_ko: '발주 측과 계약자가 공통으로 사용해 프로그램의 위험·이슈·기회를 함께 식별·분석·완화·감시하기 위한 도구의 예로, 일정 추정 오차의 영향 같은 지식도 여기에 기록해 추적한다.'
    purpose_refs:
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.5 (p.123)'
    - source_key: dod_se_guidebook_2022
      locator: '§4.1.1 (p.109)'
    evidence_level: general_se_guidance
    se_floor: context
    maturity: final
    source_refs:
    - source_key: nasa_npr_7123_1d
      locator: Tables G-1..G-12
    - source_key: dod_se_guidebook_2022
      locator: p.17
    verification_status: source_supported
    gate_role: supporting
  - id: 2408
    name: TPM최종추이요약_F
    desc: Final TPM / leading-indicator trend summary
    term: TPM
    source: NASA NPR 7123.1D Tables G-2, G-5..G-9; DoD SE Guidebook 2022 p.83, p.89
    template: 없음
    artifact_type_id: tpm_list
    purpose_ko: '임무성공에 결정적인 체계의 물리·기능 특성으로, 구현 중 실제 달성값을 그 시점의 기대값과 비교해 진척을 확인하고 핵심 요구 충족이나 비용·일정을 위협할 결함을 드러내는 데 쓰인다.'
    purpose_refs:
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.84 (printed p.71) §4.2.1.2.5'
    - source_key: nasa_se_handbook_rev2
      locator: 'pdf p.290 (printed p.277) App J §7.4'
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
    depends_on:
    - act_architecture_design
    - act_requirements_analysis
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: canonical
    gate_role: supporting
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
    gate_role: supporting
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
