---
title: 'SE 기반 폴더 트리 생성 지침 (000_REF/020_MGMT/단계별 게이트)'
version: '0.12'
owner_team: 개발1팀
variant_binding:
  support_key: system_dev_lig_grade_a
schedule_rules_ref: assets/schedule_rules.yaml
supported_input:
  business_type: 체계개발
  prime_contractor: LIG 넥스원
  quality_grade: A
principles:
- 폴더 순서 = 업무 순서
- 존재하는 폴더만 수행(없으면 N/A)
- 초안/진행본은 Work, 최종/승인본은 Out. Review/Action/Quality에는 근거/코멘트/조치/품질증빙을 둔다.
- 완료판정은 Out 기준
- '폴더명 규칙: 한글명(영문약어)_상태 예) 체계요구사항명세서(SSRS)_D'
- 'task id는 append-only: 한 번 쓴 id는 행이 빠져도 재사용하지 않는다(이미 만들어진 과제 폴더의 번호가 다른 산출물을 가리키게 되므로). 새 행은 그 게이트의 남은 가장 작은 번호를 쓴다.'
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
  lig_qgate:
  - Q1
  - Q2
  tasks:
  - id: 31
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
  - id: 32
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
  - id: 33
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
  - id: 34
    name: 계약자료검토결과(Q1)
    desc: 고객 요구사양서 검토 및 리스크 식별
    term: Q1_계약자료검토
    source: LIG 개발품질 1
    template: 첨부1 (Q1 활동) 2
    artifact_type_id: prime_q1_contract_data_review
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 35
    name: 협력개발실행계획서(Q2)
    desc: 계약 후 30일 이내 제출하는 승인된 계획서
    term: Q2_실행계획서
    source: LIG 개발품질 3
    template: Q2 승인 양식
    artifact_type_id: prime_q2_development_execution_plan
    evidence_level: prime_contract
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제76조①
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제77조①
    - source_key: dapa_se_technical_management_practice_guide
      locator: §2.4.6
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표7 A5
    verification_status: partially_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 36
    name: 체계공학관리계획서(SEMP)
    desc: (Final) 기술적 관리 및 SE 프로세스 계획
    term: SEMP
    source: 방사청 가이드북 4
    template: p.129 (부록 F) 4
    artifact_type_id: semp
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표7 B2/B3
    - source_key: dapa_se_technical_management_practice_guide
      locator: §5.1.3.4
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.120
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.47-48
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.133
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: 부록 F
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    gate_role: core
  - id: 37
    name: 품질보증계획서(QAP)
    desc: 개발 단계별 검사 계획 및 부적합 처리 절차
    term: QAP
    source: 방사청 가이드북 5
    template: p.30 (진입기준) 5
    artifact_type_id: qa_plan
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.27
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.47
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.72
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.85
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 38
    name: 착수회의록(Kick-off)
    desc: 사업 착수 회의 결과 기록
    term: Kick-off
    source: LIG 개발품질 6
    template: 착수회의록 양식
    artifact_type_id: review_minutes_kickoff
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.10.1
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 39
    name: 운용개념(CONOPS)
    desc: 운용 시나리오 및 사용자 요구사항 분석
    term: CONOPS
    source: 방사청 가이드북 7
    template: p.119 (함정사례) 8
    artifact_type_id: conops
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표3
    - source_key: dapa_se_technical_management_practice_guide
      locator: §3.2
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.124
    verification_status: partially_supported
    applies_when:
    - exploratory_skipped
    depends_on:
    - act_stakeholder_expectations
    - p_temp
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표 26 (p.144); 그림 33 (p.141)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.2.1-§3.2.2.3 (p.24)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.129-136 (printed p.116-123) §5.4.1.1/§5.4.1.3, Figure 5.4-1
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.66-75 (printed p.53-62) §4.1.1.1/§4.1.1.3, Figure 4.1-1
    depends_on_origin: mixed
    gate_role: supporting
  - id: 40
    name: 체계요구사항명세서(SSRS)_D
    desc: (Draft) 기술적 요구사항 변환 초안
    term: SSRS
    source: 방사청 가이드북 9
    template: p.131 (서식) 10
    artifact_type_id: ssrs
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.40
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.49
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.125
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제78조④
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    gate_role: core
  - id: 41
    name: 가정및제약사항
    desc: 설계 제약 조건 및 가정 사항 정리
    term: 가정및제약
    source: 방사청 가이드북
    template: 분석요소 참조
    artifact_type_id: unmapped_41
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.44
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.125
    verification_status: partially_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 42
    name: 초기위험관리자료
    desc: 식별된 위험 요소 평가 및 관리 계획
    term: 위험관리
    source: 방사청 가이드북 5
    template: p.30 (진입기준) 5
    artifact_type_id: risk_register
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.40
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.116
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.2
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 43
    name: SRR_회의록및조치결과
    desc: SRR 회의록 및 조치결과
    term: SRR_회의록
    source: 방사청 가이드북 11
    template: p.38 (종료기준) 11
    artifact_type_id: review_minutes_srr
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.49
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.25
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조②
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 44
    name: 계약자료제출목록(CDRL)
    desc: 제출 산출물 목록 및 일정 정의
    term: CDRL
    source: 계약서 12
    template: 계약 요구사항 12
    artifact_type_id: cdrl
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.47
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.30
    verification_status: partially_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 45
    name: SW개발계획서(SDP)
    desc: (Final) SW 개발 프로세스 및 조직 정의
    term: SDP
    source: 방사청 가이드북 13
    template: p.39 (산출물) 13
    artifact_type_id: sdp
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.34
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제49조①
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.43
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    - sw_included
    gate_role: supporting
  - id: 46
    name: 시험평가기본계획서(TEMP)_D
    desc: (Draft) 시험평가 마스터 플랜 초안
    term: TEMP
    source: 방사청 가이드북 14
    template: p.35 (기술계획) 14
    artifact_type_id: temp
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.34
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.46
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제63조①
    verification_status: partially_supported
    applies_when:
    - exploratory_skipped
    gate_role: supporting
  - id: 47
    name: 기능형상식별서(FCI)_D
    desc: (Draft) 체계 기능 식별서 초안
    term: FCI
    source: 방사청 가이드북 5
    template: p.30 (진입기준) 5
    artifact_type_id: fci
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.49
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.34
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.26
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    depends_on:
    - conops
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.2 (p.143-145)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 48
    name: 연동통제문서(ICD)_D
    desc: (Draft) 인터페이스 식별 초기 문서
    term: ICD
    source: 방사청 가이드북 13
    template: 산출물 목록 참조 13
    artifact_type_id: icd
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.49
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제43조①
    verification_status: source_supported
    applies_when:
    - exploratory_skipped
    depends_on:
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: generic_layer_projection
    gate_role: core
  - id: 49
    name: 예비시험평가기본계획서(P-TEMP)
    desc: SRR 단계 예비 시험평가 기본계획, SFR 이후 TEMP로 발전
    term: P-TEMP
    source: 국방전력발전업무훈령 제63조①
    template: 없음
    artifact_type_id: p_temp
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제73조②
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제63조①
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.34
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.46
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 50
    name: M&S활용계획서
    desc: 수명주기 단계별 M&S 활용계획 수립과 SBA 등록, 각 검토회의에서 최신화
    term: M&S활용계획
    source: 방위사업관리규정 제64조①
    template: 없음
    artifact_type_id: ms_plan
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제64조①
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.27
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.47
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.85
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 51
    name: 상호운용성확보계획서
    desc: 획득단계별 상호운용성 확보계획과 연동합의문서, ICD 연계
    term: 상호운용성확보계획
    source: 방위사업관리규정 제41조·제42조
    template: 없음
    artifact_type_id: interop_plan
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제41조
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제42조
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.46-47
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.84
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 52
    name: RAM업무계획서(RAM)
    desc: RAM 업무계획 수립과 단계별 최신화, RAM 분석자료 및 분석결과 보고서
    term: RAM업무계획
    source: 방위사업관리규정 제76조⑤
    template: 없음
    artifact_type_id: ram_plan
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제76조⑤
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제56조④6
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.47
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.95-96
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 53
    name: 업무분할구조(WBS)
    desc: EVM 적용사업의 WBS 관리방안, 미적용 사업은 대안 관리방안
    term: WBS
    source: 방위사업관리규정 제78조⑨
    template: 없음
    artifact_type_id: wbs
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제78조⑨
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제63조①
    verification_status: source_supported
    applies_when:
    - evm_applied
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 54
    name: 형상관리계획서(CMP)
    desc: SRR에서 수립하는 형상관리계획과 SW 형상관리계획, 각 검토회의에서 최신화 확인
    term: CMP
    source: SE기반 기술검토회의 가이드북 p.45
    template: 없음
    artifact_type_id: cm_plan
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.45
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.47
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.48
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제158조
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 55
    name: 기술검토회의제출자료
    desc: 공식 기술검토회의 2주 전 제출하는 검토자료 본체
    term: 기술검토회의자료
    source: 방위사업관리규정 제70조③
    template: 없음
    artifact_type_id: technical_review_package
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제70조③
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제78조⑧
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.41
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.52
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 56
    name: 기능분석·기능할당(활동)
    desc: Functional analysis and allocation — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_functional_analysis_allocation
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: '3.5 (p.54); 표 3 순서 4 ''체계 기능분석'' (p.14)'
    verification_status: partially_supported
    evidence_record:
    - p_temp
    - ssrs
    - technical_review_package
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 57
    name: 이해관계자 기대 정의(활동)
    desc: Stakeholder expectations definition — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_stakeholder_expectations
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표 26 (p.144); 그림 33 (p.141)
    verification_status: partially_supported
    evidence_record:
    - conops
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 58
    name: 기술검토회의 수행(활동)
    desc: Technical review conducted — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_technical_review
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.49 (바. 주요 산출물)
    verification_status: partially_supported
    evidence_record:
    - review_minutes_srr
    added_by_verification: '2026-08-18'
    depends_on:
    - conops
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.49 (바. 주요 산출물)
    depends_on_origin: canonical
    gate_role: supporting
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
    artifact_type_id: inbox
    evidence_level: internal_management
    source_refs: []
    verification_status: internal_management
    gate_role: supporting
  - id: 62
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
  - id: 63
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
  - id: 64
    name: 체계요구사항명세서(SSRS)_F
    desc: (Final) 기능 기준선 확정본
    term: SSRS
    source: 방사청 가이드북 15
    template: p.22 (기준선 정의) 15
    artifact_type_id: ssrs
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.49
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    verification_status: partially_supported
    gate_role: core
  - id: 65
    name: 기능분석및할당자료
    desc: FFBD 및 요구사항 할당 분석
    term: 기능분석
    source: 방사청 가이드북 16
    template: p.40 (개요) 16
    artifact_type_id: functional_analysis
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표6 B7
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표8 B5
    - source_key: dapa_se_technical_management_practice_guide
      locator: §3.5.2
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.53-54
    verification_status: source_supported
    depends_on:
    - conops
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.2 (p.143-145)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.4.1-§3.2.4.2 (p.25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.87-89 (printed p.74-76) §4.3.1.1/§4.3.1.3, Figure 4.3-1
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 66
    name: 요구사항추적표(RTM)
    desc: 요구사항-기능 매핑 추적 매트릭스
    term: RTM
    source: 방사청 가이드북 17
    template: p.112 (추적성) 17
    artifact_type_id: rtm
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.59
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.135
    - source_key: dapa_se_technical_management_practice_guide
      locator: §5.8
    verification_status: partially_supported
    depends_on:
    - conops
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 67
    name: 연동통제문서(ICD)_Prelim
    desc: (Preliminary) 인터페이스 구체화 중간본
    term: ICD
    source: 방사청 가이드북 18
    template: p.50 (산출물) 18
    artifact_type_id: icd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60
    verification_status: source_supported
    depends_on:
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: generic_layer_projection
    gate_role: core
  - id: 68
    name: 검증확인전략(V&V)
    desc: 요구사항 검증 및 확인 전략
    term: V&V 전략
    source: 시험평가 19
    template: 기본전략 참조 19
    artifact_type_id: vv_strategy
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.3
    - source_key: dapa_se_technical_management_practice_guide
      locator: §5.11
    - source_key: dapa_se_technical_management_practice_guide
      locator: §5.12
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.117
    verification_status: partially_supported
    gate_role: supporting
  - id: 69
    name: 대안분석(Trade-Study)
    desc: 설계 대안 분석 및 절충(Trade-Off) 연구 자료
    term: Trade-Study
    source: 방사청 가이드북 8
    template: p.119 (분석절차) 20
    artifact_type_id: trade_study
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.59
    - source_key: dapa_se_technical_management_practice_guide
      locator: §5.9
    verification_status: partially_supported
    gate_role: supporting
  - id: 70
    name: SFR_회의록및조치결과
    desc: SFR 회의 결과 및 기능 기준선 승인
    term: SFR_회의록
    source: LIG 개발품질 21
    template: G1 Gate 양식 21
    artifact_type_id: review_minutes_sfr
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조②
    verification_status: source_supported
    gate_role: supporting
  - id: 71
    name: 기능형상식별서(FCI)_F
    desc: (Final) 기능 기준선 설정 문서
    term: FCI
    source: 방사청 가이드북 18
    template: p.50 (산출물) 18
    artifact_type_id: fci
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.26
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.47
    verification_status: source_supported
    depends_on:
    - conops
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.2 (p.143-145)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 72
    name: HW요구사항명세서(HRS)_D
    desc: (Draft) HW 상세 요구사항 초안
    term: HRS
    source: 방사청 가이드북 22
    template: p.132 (서식) 22
    artifact_type_id: hrs
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.126
    verification_status: source_supported
    gate_role: core
  - id: 73
    name: SW요구사항명세서(SRS)_D
    desc: (Draft) SW 상세 요구사항 초안
    term: SRS
    source: 방사청 가이드북 18
    template: 산출물 목록 참조
    artifact_type_id: srs
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60
    verification_status: source_supported
    applies_when:
    - sw_included
    gate_role: core
  - id: 74
    name: 체계설계기술서(SSDD)_D
    desc: (Draft) 체계 및 부체계 설계 초안
    term: SSDD
    source: 방사청 가이드북 18
    template: p.50 (산출물) 18
    artifact_type_id: ssdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60
    verification_status: source_supported
    gate_role: core
  - id: 75
    name: 기술검토회의 수행(활동)
    desc: Technical review conducted — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_technical_review
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60 (바. 주요 산출물)
    verification_status: partially_supported
    evidence_record:
    - review_minutes_sfr
    added_by_verification: '2026-08-18'
    depends_on:
    - conops
    - icd
    - ssrs
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.60 (바. 주요 산출물)
    depends_on_origin: canonical
    gate_role: supporting
- code: 90
  name: PDR
  desc: 기본설계검토 (Preliminary Design Review)
  lig_qgate:
  - Q3
  tasks:
  - id: 91
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
  - id: 92
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
  - id: 93
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
  - id: 94
    name: 설계품질점검결과(Q3)
    desc: 상세설계 진입 전 성숙도 점검
    term: Q3_설계점검
    source: LIG 개발품질 3
    template: Q3 활동 양식 3
    artifact_type_id: prime_q3_design_quality_review
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 95
    name: 체계아키텍처및형상식별서(안)
    desc: 아키텍처 정의 및 구성품 식별
    term: 아키텍처
    source: 방사청 가이드북 23
    template: 산출물 목록 참조
    artifact_type_id: dci
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.64
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.68
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.71
    verification_status: source_supported
    gate_role: core
  - id: 96
    name: 체계설계기술서(SSDD)_F
    desc: (Final) 아키텍처/설계 확정 (할당 기준선)
    term: SSDD
    source: 방사청 가이드북 24
    template: p.133 (서식) 25
    artifact_type_id: ssdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.127
    verification_status: source_supported
    gate_role: core
  - id: 97
    name: HW요구사항명세서(HRS)_D
    desc: (Draft) HW 상세 요구사항 초안
    term: HRS
    source: 방사청 가이드북 26
    template: p.53 (진입기준) 26
    artifact_type_id: hrs
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.63-64
    verification_status: partially_supported
    gate_role: core
  - id: 98
    name: SW요구사항명세서(SRS)_D
    desc: (Draft) SW 상세 요구사항 초안
    term: SRS
    source: 방사청 가이드북 26
    template: p.53 (진입기준) 26
    artifact_type_id: srs
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    verification_status: partially_supported
    applies_when:
    - sw_included
    gate_role: core
  - id: 99
    name: 인터페이스설계기술서(IDD)_D
    desc: (Draft) 인터페이스 상세 설계 초안
    term: IDD
    source: 방사청 가이드북 24
    template: p.64 (산출물) 24
    artifact_type_id: idd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    verification_status: source_supported
    gate_role: core
  - id: 100
    name: 연동통제문서(ICD)_Prelim
    desc: (Preliminary) PDR 단계 업데이트본
    term: ICD
    source: 방사청 가이드북 24
    template: 산출물 목록 참조
    artifact_type_id: icd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73-74
    verification_status: source_supported
    depends_on:
    - dci
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: generic_layer_projection
    gate_role: core
  - id: 101
    name: 요구사항추적표(RTM)_최신화
    desc: 할당 기준선 설정에 따른 업데이트
    term: RTM
    source: 방사청 가이드북 17
    template: 추적표 양식
    artifact_type_id: rtm
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.72-73
    verification_status: partially_supported
    depends_on:
    - conops
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 102
    name: 시험평가기본계획서(TEMP)_D
    desc: (Draft) P-TEMP 구체화 버전
    term: TEMP
    source: 방사청 가이드북 27
    template: 산출물 목록 참조
    artifact_type_id: temp
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.70
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73-74
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제63조
    verification_status: source_supported
    gate_role: supporting
  - id: 103
    name: PDR_회의록및조치결과
    desc: PDR 회의 결과 및 할당 기준선 승인
    term: PDR_회의록
    source: LIG 개발품질 21
    template: G2 Gate 양식 21
    artifact_type_id: review_minutes_pdr
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.74
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조②
    verification_status: source_supported
    gate_role: supporting
  - id: 104
    name: HW설계기술서(HDD)_D
    desc: (Draft) HW 상세설계 초안
    term: HDD
    source: 방사청 가이드북 24
    template: p.64 (산출물) 24
    artifact_type_id: hdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    verification_status: source_supported
    depends_on:
    - idd
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: 부록 E-5 HDD 서식, p.128
    depends_on_origin: canonical
    gate_role: core
  - id: 105
    name: SW설계기술서(SDD)_D
    desc: (Draft) SW 상세설계 초안
    term: SDD
    source: 방사청 가이드북 24
    template: 산출물 목록 참조
    artifact_type_id: sdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    verification_status: source_supported
    applies_when:
    - sw_included
    gate_role: core
  - id: 106
    name: DB설계기술서(DBDD)_D
    desc: (Draft) DB 상세설계 초안
    term: DBDD
    source: 방사청 가이드북 24
    template: 산출물 목록 참조
    artifact_type_id: dbdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.68
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.35
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.30
    verification_status: source_supported
    applies_when:
    - db_included
    gate_role: supporting
  - id: 107
    name: 상세설계도면_D
    desc: (Draft) 제작용 도면 초안
    term: 설계도면
    source: 방사청 가이드북
    template: 산출물 목록 참조
    artifact_type_id: drawings
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표8 B6
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    verification_status: source_supported
    depends_on:
    - bom
    - icd
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: 부록 E-8 물리적 형상확인 점검표(HW 형상 일치성), p.131
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: mixed
    gate_role: supporting
  - id: 108
    name: 자재명세서(Q-BOM)_D
    desc: (Draft) 자재 내역서 초안
    term: Q-BOM
    source: LIG 개발품질 28
    template: 산출물 목록 참조
    artifact_type_id: bom
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.71
    verification_status: source_supported
    gate_role: supporting
  - id: 109
    name: 등록부품활용계획서
    desc: 제안 시 제출한 등록부품활용계획의 PDR 반영본과 국산화기본계획 연계
    term: 등록부품활용계획
    source: 방위사업관리규정 제79조④
    template: 없음
    artifact_type_id: registered_parts_plan
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제27조⑧
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제76조⑥
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조④
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 110
    name: 기술검토회의 수행(활동)
    desc: Technical review conducted — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_technical_review
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73 (바. 주요 산출물)
    verification_status: partially_supported
    evidence_record:
    - review_minutes_pdr
    added_by_verification: '2026-08-18'
    depends_on:
    - hrs
    - icd
    - srs
    - ssdd
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73 (바. 주요 산출물)
    depends_on_origin: canonical
    gate_role: supporting
- code: 120
  name: CDR
  desc: 상세설계검토 (Critical Design Review)
  lig_qgate:
  - Q4
  tasks:
  - id: 121
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
  - id: 122
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
  - id: 123
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
  - id: 124
    name: 제작준비검토결과(MRR_Q4)
    desc: 도면/자재/공정 준비 및 제작 승인
    term: Q4 (MRR)
    source: LIG 개발품질 28
    template: Q4 MRR 양식 28
    artifact_type_id: prime_q4_manufacturing_readiness_review
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 125
    name: HW설계기술서(HDD)_F
    desc: (Final) HW 상세설계 확정 (제품 기준선)
    term: HDD
    source: 방사청 가이드북 29
    template: p.134 (서식) 30
    artifact_type_id: hdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.128
    verification_status: source_supported
    depends_on:
    - idd
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: 부록 E-5 HDD 서식, p.128
    depends_on_origin: canonical
    gate_role: core
  - id: 126
    name: SW설계기술서(SDD)_F
    desc: (Final) SW 상세설계 확정 (제품 기준선)
    term: SDD
    source: 방사청 가이드북 29
    template: p.67 (진입기준) 29
    artifact_type_id: sdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.77
    verification_status: source_supported
    applies_when:
    - sw_included
    gate_role: core
  - id: 127
    name: DB설계기술서(DBDD)_F
    desc: (Final) DB 설계 확정본
    term: DBDD
    source: 방사청 가이드북 31
    template: 산출물 목록 참조
    artifact_type_id: dbdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.35
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.77
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.82
    verification_status: source_supported
    applies_when:
    - db_included
    gate_role: supporting
  - id: 128
    name: 인터페이스설계기술서(IDD)_F
    desc: (Final) 인터페이스 설계 확정본
    term: IDD
    source: 방사청 가이드북 31
    template: p.78 (산출물) 31
    artifact_type_id: idd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87
    verification_status: source_supported
    gate_role: core
  - id: 129
    name: 연동통제문서(ICD)_F
    desc: (Final) ICD 최종 확정
    term: ICD
    source: 방사청 가이드북 31
    template: 산출물 목록 참조
    artifact_type_id: icd
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제43조①
    verification_status: source_supported
    depends_on:
    - dci
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: generic_layer_projection
    gate_role: core
  - id: 130
    name: 상세설계도면_F
    desc: (Final) 승인된 제작용 도면
    term: 설계도면
    source: 방사청 가이드북 29
    template: p.67 (진입기준) 29
    artifact_type_id: drawings
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: 표8 B7
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.77
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    verification_status: source_supported
    depends_on:
    - bom
    - icd
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: 부록 E-8 물리적 형상확인 점검표(HW 형상 일치성), p.131
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: mixed
    gate_role: supporting
  - id: 131
    name: 자재명세서(Q-BOM)_F
    desc: (Final) Q4 승인 자재 목록
    term: Q-BOM
    source: LIG 개발품질 28
    template: Q4 점검항목
    artifact_type_id: bom
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.85
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.27
    verification_status: source_supported
    gate_role: supporting
  - id: 132
    name: Artwork설계검토서_F
    desc: PCB 제작을 위한 Artwork 승인
    term: Artwork
    source: LIG 개발품질 28
    template: Q4 진입조건 28
    artifact_type_id: prime_artwork_design_review
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 133
    name: 표준품적절성검토서
    desc: 부품 단종/수급 이슈 검토
    term: 표준품검토
    source: LIG 개발품질 28
    template: 검토서 양식
    artifact_type_id: standard_parts_review
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.85
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.71
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조④
    verification_status: partially_supported
    gate_role: supporting
  - id: 134
    name: 제작사양서(WPS)및검사요구
    desc: 제조 공정 및 검사 요구 기준서
    term: WPS
    source: LIG 개발품질 32
    template: 첨부2 (발주문서) 32
    artifact_type_id: wps
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_management_practice_guide
      locator: 부록D
    verification_status: partially_supported
    gate_role: supporting
  - id: 135
    name: 제조관점설계검토결과
    desc: 양산 이관성 및 제조 용이성 검토
    term: M-DR
    source: LIG 개발품질 33
    template: 검토보고서 양식
    artifact_type_id: manufacturing_design_review
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제56조④6
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.84
    verification_status: partially_supported
    gate_role: supporting
  - id: 136
    name: 제조공정도및작업표준(Flow)
    desc: 제조 흐름 및 공정별 작업 표준
    term: 제조공정도
    source: LIG 개발품질 28
    template: Q4 점검항목
    artifact_type_id: manufacturing_process_flow
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.115
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.8
    verification_status: partially_supported
    gate_role: supporting
  - id: 137
    name: 요구사항추적표(RTM)_업데이트
    desc: 상세설계 결과 요구사항 충족 확인
    term: RTM
    source: 방사청 가이드북 34
    template: 추적표 양식
    artifact_type_id: rtm
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.86
    verification_status: partially_supported
    depends_on:
    - conops
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.1 (p.142-143)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.3.1-§3.2.3.2 (p.24-25)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.77-85 (printed p.64-72) §4.2.1.1/§4.2.1.3, Figure 4.2-1
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 138
    name: 안전성및신뢰성분석_F
    desc: RAM 및 안전성 분석 확정본
    term: RAM/Safety
    source: 방사청 가이드북 34
    template: p.75 (점검항목) 34
    artifact_type_id: ram_analysis_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.84-85
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제76조⑤
    verification_status: source_supported
    gate_role: supporting
  - id: 139
    name: CDR_회의록및조치결과
    desc: CDR 회의 결과 및 승인 기록
    term: CDR_회의록
    source: LIG 개발품질 21
    template: G3 Gate 양식 21
    artifact_type_id: review_minutes_cdr
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조②
    verification_status: source_supported
    gate_role: supporting
  - id: 140
    name: HW요구사항명세서(HRS)_F
    desc: (Final) HW 요구사항 최종본
    term: HRS
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
    artifact_type_id: hrs
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.77-78
    verification_status: partially_supported
    gate_role: entry
  - id: 141
    name: SW요구사항명세서(SRS)_F
    desc: (Final) SW 요구사항 최종본
    term: SRS
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
    artifact_type_id: srs
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.73
    verification_status: partially_supported
    applies_when:
    - sw_included
    gate_role: entry
  - id: 142
    name: 통합시험계획서절차서(STP)_D
    desc: (Draft) 통합시험 계획 및 절차 초안
    term: STP
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
    artifact_type_id: stp
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.84
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.89
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.95
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.5
    verification_status: source_supported
    gate_role: supporting
  - id: 143
    name: 제품형상식별서(PCI)_D
    desc: (Draft) 제품 기준선 식별서 초안
    term: PCI
    source: 방사청 가이드북 35
    template: 산출물 목록 참조
    artifact_type_id: pci
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.83
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.82
    verification_status: source_supported
    gate_role: core
  - id: 148
    name: 제조성숙도평가(MRA)계획및결과
    desc: MRL 8 목표의 제조성숙도평가 계획과 평가 결과
    term: MRA
    source: 방위사업관리규정 제78조③
    template: 없음
    artifact_type_id: mra_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제78조③
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조③
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제56조⑦⑧
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.84
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 145
    name: 사업중간점검결과보고서
    desc: CDR 종료 이전 수행하는 사업중간점검 결과보고서(별지27) 입력자료
    term: 사업중간점검
    source: 방위사업관리규정 제65조①
    template: 없음
    artifact_type_id: mid_check_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제65조①
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제65조③④
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 146
    name: 핵심부품공인시험성적서
    desc: CDR까지 선정한 핵심부품·구성품의 공인시험기관 시험 성적서
    term: 핵심부품시험성적서
    source: 방위사업관리규정 제79조①
    template: 없음
    artifact_type_id: critical_parts_test_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조①⑤⑥
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제81조③6
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 147
    name: 기술검토회의 수행(활동)
    desc: Technical review conducted — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_technical_review
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87 (바. 주요 산출물)
    verification_status: partially_supported
    evidence_record:
    - review_minutes_cdr
    added_by_verification: '2026-08-18'
    depends_on:
    - hdd
    - hrs
    - icd
    - idd
    - sdd
    - srs
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87 (바. 주요 산출물)
    depends_on_origin: canonical
    gate_role: supporting
- code: 150
  name: TRR_DT
  desc: 시험준비/시제제작/개발시험 (Q5-Q6-Q7)
  lig_qgate:
  - Q5
  - Q6
  - Q7
  tasks:
  - id: 151
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
  - id: 152
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
  - id: 153
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
  - id: 154
    name: 협력사발주문서
    desc: 발주유형별 발주문서 (PO 등)
    term: 발주서
    source: LIG 구매절차 36
    template: 구매 양식 36
    artifact_type_id: prime_supplier_purchase_order
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 155
    name: 원자재성적서및COC
    desc: 원소재 MillSheet 및 추적 정보
    term: MillSheet
    source: LIG 개발품질 32
    template: 첨부3 (가이드) 32
    artifact_type_id: prime_raw_material_coc
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 156
    name: 부품COC(제조사또는대리점)
    desc: 정품 인증서 (COC)
    term: 부품 COC
    source: LIG 개발품질 32
    template: 첨부4 (위조품) 37
    artifact_type_id: prime_part_coc
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 157
    name: 위조품검사성적서(Offer_COC)
    desc: 비공식 구매품 검사 성적서
    term: 위조품검사
    source: LIG 개발품질 37
    template: 성적서 양식 37
    artifact_type_id: prime_counterfeit_part_inspection
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 158
    name: 일솜씨검사결과(Q5)
    desc: 조립 공정 품질(Workmanship) 검사
    term: Q5_일솜씨
    source: LIG 개발품질 38
    template: Q5 검사 양식
    artifact_type_id: prime_q5_workmanship_inspection
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 159
    name: 시제제작기록(공정확인표)
    desc: 공정 확인표(Traveler) 및 기록
    term: Traveler
    source: LIG 개발품질 28
    template: Traveler 양식
    artifact_type_id: build_record
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.131-132
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.9
    verification_status: partially_supported
    gate_role: supporting
  - id: 160
    name: SW산출물명세서(SPS_VDD)
    desc: SW 바이너리, 소스코드 및 버전 정의
    term: SPS/VDD
    source: 방사청 가이드북 39
    template: p.89 (산출물) 39
    artifact_type_id: vdd
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.95
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.93
    verification_status: source_supported
    applies_when:
    - sw_included
    gate_role: supporting
  - id: 161
    name: SW시험계획절차서(STP_STD)
    desc: SW 단위/통합 시험 계획 및 절차
    term: STP/STD
    source: 방사청 가이드북 39
    template: 산출물 목록 참조
    artifact_type_id: std
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.95
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.93
    verification_status: source_supported
    applies_when:
    - sw_included
    gate_role: supporting
  - id: 162
    name: SW시험결과서(STR)
    desc: SW 통합시험 수행 결과
    term: STR
    source: 방사청 가이드북 39
    template: 산출물 목록 참조
    artifact_type_id: str
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.95
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.93
    verification_status: source_supported
    applies_when:
    - sw_included
    gate_role: supporting
  - id: 163
    name: SW신뢰성시험결과(Q6)
    desc: SW 정적/동적 시험 성적서
    term: Q6_신뢰성
    source: LIG 개발품질 40
    template: Q6 검사 양식 40
    artifact_type_id: prime_q6_sw_reliability_test
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.84
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.95
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제64조④
    verification_status: source_supported
    applies_when:
    - sw_included
    gate_role: supporting
  - id: 164
    name: 수락시험절차서(ATP)_F
    desc: 승인된 수락검사 기준 절차서
    term: ATP
    source: LIG 개발품질 40
    template: 검사절차서 양식
    artifact_type_id: atp
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.9
    verification_status: partially_supported
    gate_role: supporting
  - id: 165
    name: 시험평가기본계획서(TEMP)_F
    desc: (Final) 시험평가 착수 승인 본
    term: TEMP
    source: 방사청 가이드북 39
    template: p.89 (산출물) 39
    artifact_type_id: temp
    evidence_level: regulation_mandated
    source_refs:
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제63조
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.83
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.97
    verification_status: source_supported
    gate_role: core
  - id: 166
    name: 통합시험계획서절차서(STP)_F
    desc: (Final) 통합시험 절차서 확정
    term: STP
    source: 방사청 가이드북 39
    template: p.89 (산출물) 39
    artifact_type_id: stp
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.89
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.90
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.97
    verification_status: source_supported
    gate_role: supporting
  - id: 167
    name: 수락검사성적서(FAT_Q7)_F
    desc: 최종 수락검사 합격 성적서
    term: Q7 (FAT)
    source: LIG 개발품질 45
    template: Q7 검사 양식 40
    artifact_type_id: prime_q7_factory_acceptance_test
    evidence_level: prime_contract
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    verification_status: partially_supported
    gate_role: supporting
  - id: 168
    name: TRR_회의록및시험준비검토
    desc: 시험평가 착수 승인 기록
    term: TRR_회의록
    source: 방사청 가이드북 41
    template: p.79 (수행시기) 41
    artifact_type_id: review_minutes_trr
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.97
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.88
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제65조①
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제68조①
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조②
    verification_status: source_supported
    gate_role: supporting
  - id: 169
    name: 개발시험평가결과(DT)
    desc: DT 로그, 데이터, 성적서 종합본
    term: DT 결과
    source: 방사청 가이드북 42
    template: 산출물 목록 참조
    artifact_type_id: dt_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제66조①
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.90
    verification_status: source_supported
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
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 170
    name: 개발시험평가계획서및절차서(DT)
    desc: DT 착수 2개월 전 제출하는 개발시험평가계획서(별지5)와 시험평가절차서
    term: DT계획서
    source: 국방전력발전업무훈령 제64조①
    template: 없음
    artifact_type_id: dt_plan
    evidence_level: regulation_mandated
    source_refs:
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제64조①②
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제60조②2
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.89
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.97
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 171
    name: 기술검토회의 수행(활동)
    desc: Technical review conducted — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_technical_review
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.97 (바. 주요 산출물)
    verification_status: partially_supported
    evidence_record:
    - review_minutes_trr
    added_by_verification: '2026-08-18'
    depends_on:
    - ssrs
    - temp
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.97 (바. 주요 산출물)
    depends_on_origin: canonical
    gate_role: supporting
- code: 180
  name: FCA_OT
  desc: 기능형상확인/통합/운용시험 (Q8)
  lig_qgate:
  - Q8
  tasks:
  - id: 181
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
  - id: 182
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
  - id: 183
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
  - id: 184
    name: 입고검사결과(Q8)
    desc: LIG 입고 후 외관/수량 검사
    term: Q8_입고검사
    source: LIG 개발품질 43
    template: Q8 검사 양식 43
    artifact_type_id: prime_q8_incoming_inspection
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 185
    name: 납품원장및인수증
    desc: 물품 인도 및 인수 증빙
    term: 인수증
    source: 계약관리 36
    template: 인수증 양식
    artifact_type_id: delivery_acceptance_record
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.9
    verification_status: partially_supported
    gate_role: supporting
  - id: 186
    name: 현장수락시험결과(SAT)
    desc: 현장 수락시험 결과
    term: SAT
    source: LIG 개발품질 44
    template: SAT 보고서 양식
    artifact_type_id: sat_report
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    verification_status: partially_supported
    gate_role: supporting
  - id: 187
    name: 설치및시운전기록(STW)
    desc: 설치, 셋팅, 시운전 기록
    term: STW
    source: 현장지원
    template: STW 기록지
    artifact_type_id: prime_installation_commissioning_record
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 188
    name: 체계통합지원결과
    desc: 통합시험 지원 데이터 및 내역
    term: 통합지원
    source: 사업관리
    template: 지원 결과서
    artifact_type_id: integration_test_support
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.89
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.88
    verification_status: partially_supported
    gate_role: supporting
  - id: 189
    name: 기능형상확인결과보고서(FCA)
    desc: 체계요구사항 충족 여부 감사 결과
    term: FCA
    source: 방사청 가이드북 45
    template: p.90 (개요) 45
    artifact_type_id: fca_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.104
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.133
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제56조④5
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조②
    verification_status: source_supported
    depends_on:
    - drawings
    - vcrm
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: 부록 E-9 FCA 결과보고서 서식, p.133
    depends_on_origin: canonical
    gate_role: core
  - id: 190
    name: 요구사항검증매트릭스(VCRM)_F
    desc: (Final) 요구사항 검증 입증
    term: VCRM
    source: 방사청 가이드북 17
    template: p.112 (추적성) 17
    artifact_type_id: vcrm
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.101
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.135
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.96-97
    verification_status: partially_supported
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
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 191
    name: 운용시험평가지원자료(OT)
    desc: OT 수행 지원 및 기록
    term: OT 지원
    source: 방사청 가이드북 46
    template: 지원 자료 양식
    artifact_type_id: ot_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제69조①
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.91-92
    verification_status: source_supported
    depends_on:
    - p_temp
    - pci
    - vv_strategy
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.7 (p.151-152; explicit product sentences p.152)
    - source_key: nasa_se_handbook_rev2
      locator: pdf p.129-136 (printed p.116-123) §5.4.1.1/§5.4.1.3, Figure 5.4-1
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 192
    name: FCA_OT_회의록및조치결과
    desc: FCA 및 OT 회의록
    term: FCA 회의록
    source: 방사청 가이드북 47
    template: p.96 (산출물) 47
    artifact_type_id: review_minutes_fca
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.104
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.25
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.7
    verification_status: source_supported
    gate_role: core
  - id: 193
    name: 개발시험결과보고서(DT)_종합본
    desc: DT 성적서 종합본 (FCA 근거)
    term: DT 종합
    source: 방사청 가이드북 47
    template: 보고서 양식
    artifact_type_id: dt_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제66조①
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    verification_status: source_supported
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
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 194
    name: 결함조치결과보고서(Defect)
    desc: 시험 중 결함 및 조치 결과
    term: 결함보고서
    source: LIG 개발품질 48
    template: 결함보고서 양식 48
    artifact_type_id: defect_action_report
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.100
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.92
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제69조⑤⑥
    verification_status: partially_supported
    gate_role: supporting
  - id: 195
    name: 제품형상식별서(PCI)_Prelim
    desc: (Preliminary) 제품 형상 식별서 중간본
    term: PCI
    source: 방사청 가이드북 47
    template: p.96 (산출물) 47
    artifact_type_id: pci
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.123
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    verification_status: source_supported
    gate_role: supporting
  - id: 196
    name: 운용시험평가계획서(OT)
    desc: 운용시험평가계획(안)/계획서(별지7)와 상호운용성시험평가계획(안) 입력 지원
    term: OT계획서
    source: 국방전력발전업무훈령 제67조②
    template: 없음
    artifact_type_id: ot_plan
    evidence_level: regulation_mandated
    source_refs:
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제67조②③⑤
    - source_key: mnd_force_development_directive_law_20260701
      locator: 제67조①⑥
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 197
    name: 형상확인계획서및점검표(FCA_PCA)
    desc: 기능적·물리적 형상확인 계획서와 점검표(E-7, E-8), 품질보증요구서(QAR)
    term: FCA_PCA점검표
    source: SE기반 기술검토회의 가이드북 p.99
    template: 없음
    artifact_type_id: fca_pca_plan_checklist
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.130-132
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 198
    name: 기술검토회의 수행(활동)
    desc: Technical review conducted — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_technical_review
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.104 (바. 주요 산출물)
    verification_status: partially_supported
    evidence_record:
    - review_minutes_fca
    added_by_verification: '2026-08-18'
    depends_on:
    - drawings
    - vcrm
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.104 (바. 주요 산출물)
    depends_on_origin: canonical
    gate_role: supporting
- code: 210
  name: PCA
  desc: 물리적 형상확인 및 규격화 (Product Baseline 확정)
  tasks:
  - id: 211
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
  - id: 212
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
  - id: 213
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
  - id: 214
    name: 물리형상확인결과보고서(PCA)
    desc: 제품 실물-도면 일치성 검증 결과
    term: PCA
    source: 방사청 가이드북 49
    template: p.97 (개요) 49
    artifact_type_id: pca_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.111
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.134
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제79조②
    verification_status: source_supported
    depends_on:
    - drawings
    - vcrm
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: 부록 E-10 PCA 결과보고서 서식, p.134
    depends_on_origin: canonical
    gate_role: core
  - id: 215
    name: 최종도면(As-Built)_F
    desc: 실물 일치 최종 도면
    term: 최종도면
    source: 방사청 가이드북 50
    template: p.98 (진입기준) 50
    artifact_type_id: drawings
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.131-132
    verification_status: source_supported
    depends_on:
    - bom
    - icd
    - tdp
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: 부록 E-8 물리적 형상확인 점검표(HW 형상 일치성), p.131
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.8 (p.152)
    depends_on_origin: mixed
    gate_role: supporting
  - id: 216
    name: 자재명세서(Q-BOM)_F
    desc: 최종 자재 목록(As-Built BOM)
    term: 최종 BOM
    source: LIG 개발품질 28
    template: BOM 양식
    artifact_type_id: bom
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.31
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.27
    verification_status: source_supported
    gate_role: supporting
  - id: 217
    name: 시험성적서통합본
    desc: PCA 증빙용 성적서 모음
    term: 성적서 통합
    source: 방사청 가이드북 50
    template: 통합본 양식
    artifact_type_id: test_docs
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    verification_status: source_supported
    gate_role: supporting
  - id: 218
    name: 부적합및면제요청서(NCR)
    desc: 부적합, 면제 등 불일치 관리
    term: NCR
    source: LIG 개발품질 48
    template: nISP 결함관리
    artifact_type_id: ncr
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.132
    verification_status: source_supported
    gate_role: supporting
  - id: 219
    name: 최종제품보증서(COC_CoA)
    desc: 최종 납품 제품 품질 보증서
    term: 제품보증서
    source: LIG 개발품질 32
    template: 보증서 양식
    artifact_type_id: prime_final_product_certificate
    evidence_level: prime_contract
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 220
    name: 기술자료패키지목록(TDP)
    desc: 국방규격 제정용 도면/목록 패키지
    term: TDP
    source: 방사청 가이드북 15
    template: p.22 (주석 11) 15
    artifact_type_id: tdp
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제81조②
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.30
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.83
    verification_status: source_supported
    depends_on:
    - pci
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.4 (p.148-149; explicit output sentences p.148 and p.149)
    - source_key: nasa_npr_7123_1d
      locator: §3.2.6.1-§3.2.6.2 (p.25)
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 221
    name: PCA_회의록및조치결과
    desc: 제품 기준선 최종 승인 기록
    term: PCA 회의록
    source: 방사청 가이드북 51
    template: 회의록 양식
    artifact_type_id: review_minutes_pca
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.111
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.107
    verification_status: source_supported
    gate_role: supporting
  - id: 222
    name: 연동통제문서(ICD)
    desc: 최종 인터페이스 문서
    term: ICD Final
    source: 방사청 가이드북 51
    template: 산출물 목록 참조
    artifact_type_id: icd
    evidence_level: unstated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.87
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.27
    verification_status: partially_supported
    depends_on:
    - dci
    - semp
    depends_on_evidence: general_se_guidance
    depends_on_refs:
    - source_key: dod_se_guidebook_2022
      locator: §4.2.3 (p.145-148; explicit output sentence p.147)
    - source_key: dod_se_guidebook_2022
      locator: §4.2.5 (p.149-150)
    depends_on_origin: generic_layer_projection
    gate_role: supporting
  - id: 223
    name: 제품형상식별서(PCI)_F
    desc: (Final) 제품 기준선 최종 문서
    term: PCI
    source: 방사청 가이드북 51
    template: p.103 (산출물) 51
    artifact_type_id: pci
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.123
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.35
    - source_key: dapa_se_technical_review_guidebook_2024
      locator: pdf p.107
    verification_status: source_supported
    gate_role: supporting
  - id: 224
    name: 상세설계도면_F(PCA)
    desc: (Final) 국방규격화용 상세 도면
    term: 규격도면
    source: 방사청 가이드북 50
    template: 규격 양식
    artifact_type_id: defense_spec_drawings
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.106
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제80조①
    verification_status: source_supported
    gate_role: supporting
  - id: 225
    name: 국방규격(안)및국방규격화연계표
    desc: DT로 검증하고 OT 적합 판정 후 제정 건의하는 국방규격(안)과 국방규격화연계표
    term: 국방규격화
    source: 방위사업관리규정 제80조①
    template: 없음
    artifact_type_id: defense_spec_draft
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제80조①③
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제81조①
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.99
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.135
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 226
    name: 체계개발결과보고서및기술자료묶음
    desc: 체계개발 완료 후 2개월 이내 제출하는 체계개발결과보고서(별지14)와 기술자료묶음
    term: 체계개발결과보고서
    source: 방위사업관리규정 제81조②
    template: 없음
    artifact_type_id: dev_result_report
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제81조②
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.10.5
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 227
    name: 양산전제출자료및양산지원자료
    desc: 양산 계약 이전 제출자료와 양산 지원 자료 묶음
    term: 양산전제출자료
    source: 방위사업관리규정 제81조③
    template: 없음
    artifact_type_id: production_transition_package
    evidence_level: regulation_mandated
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제81조③
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제81조④
    verification_status: source_supported
    added_by_verification: '2026-08-18'
    gate_role: supporting
  - id: 228
    name: 기술검토회의 수행(활동)
    desc: Technical review conducted — activity node (no folder); evidenced by the records it produces
    term: ACTIVITY
    source: 방사청 SE 기술검토회의 가이드북 INPUT 표 / SE 기술관리 실무지침서 활동 입출력
    template: 없음
    artifact_type_id: act_technical_review
    node_kind: activity
    is_virtual: true
    evidence_level: guidebook_recommended
    source_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.111 (바. 주요 산출물)
    verification_status: partially_supported
    evidence_record:
    - review_minutes_pca
    added_by_verification: '2026-08-18'
    depends_on:
    - atp
    depends_on_evidence: guidebook_recommended
    depends_on_refs:
    - source_key: dapa_se_technical_review_guidebook_2017
      locator: p.111 (바. 주요 산출물)
    depends_on_origin: canonical
    gate_role: supporting
- code: 240
  name: LL
  desc: 개발이력 공유 및 종결 (Lessons Learned)
  tasks:
  - id: 241
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
  - id: 242
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
  - id: 243
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
  - id: 244
    name: 협력개발품개발이력서
    desc: 개발 이력(변경, 이슈) 정리
    term: 개발이력서
    source: LIG 개발품질 52
    template: 이력공유 양식 52
    artifact_type_id: development_history
    evidence_level: internal_management
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제5조①
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제118조의15③
    verification_status: partially_supported
    gate_role: supporting
  - id: 245
    name: 실패사례요약서
    desc: 실패 사례 및 극복 과정
    term: 실패사례
    source: LIG 개발품질 33
    template: 사례 양식
    artifact_type_id: lessons_learned
    evidence_level: internal_management
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 246
    name: 개발이력공유회결과
    desc: 이력 공유회 발표 자료
    term: 공유회결과
    source: LIG 개발품질 52
    template: 발표자료 양식
    artifact_type_id: lessons_learned_workshop
    evidence_level: internal_management
    source_refs: []
    verification_status: unsupported
    gate_role: supporting
  - id: 247
    name: 사업종료보고서
    desc: 사업 정산 및 행정 종료 보고서
    term: 종료보고서
    source: LIG 개발품질 53
    template: G6 종료 양식 53
    artifact_type_id: prime_g6_project_closeout_report
    evidence_level: internal_management
    source_refs:
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제81조②
    - source_key: dapa_program_management_rule_law_20260811
      locator: 제55조①
    - source_key: dapa_se_technical_management_practice_guide
      locator: §4.10.5
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
# 게이트 레벨 고정폴더(INBOX, LOG, TDP) 하위 구조 정의
# folder_type: 폴더명에 매칭 (INBOX, LOG, TDP)
# subfolders: 해당 폴더 내 생성할 하위폴더
# item_subfolders: 개별 아이템(YYYYMMDD_이름) 폴더 내 생성할 하위폴더
# example_item: 예시 폴더 생성 여부
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
  - 000_REF/03_고객품질
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
- 이 문서의 YAML(위)을 파싱해서 폴더를 생성한다.
- 정적 상위 폴더는 `000_REF`, `020_MGMT`를 먼저 생성한다.
- 단계 폴더는 `030_SRR`부터 시작하며, 이후 030 간격으로 진행한다.
- 작업폴더 내부는 fixed_subfolders 그대로 생성한다.
- 완료는 03_Out 기준으로 판단한다.

## 상위 구조 원칙
- `000_REF`: 과제 시작 전에 준비하는 기준/참고자료
- `020_MGMT`: 과제 전체를 가로지르는 자동화설정, 원본수집, 연락처, 예산, 통합로그, 상태, 수신/이동이력, 보류자료
- `030~`: 체계공학 단계별 수행 및 산출물 축적 영역

## 폴더명 규칙
- **형식:** `한글명(영문약어)_상태`
- **예시:** `체계요구사항명세서(SSRS)_D`, `HW설계기술서(HDD)_F`
- **상태:** `_D` (초안), `_F` (확정), `_Prelim` (검토중)

## 파일명/Baseline 관리 권장사항
- 파일명 권장: `*_D_v0.9`, `*_F_v1.0` (또는 Approved/Baseline 표기)
- 승인 증빙(공문/메일/회의록 승인결과)은 Out 또는 Quality에 함께 보관

## 프로젝트별 추가 산출물(옵션)

아래 산출물은 계약/고객 요구에 따라 required_tasks에 추가할 수 있습니다.
- 형상관리계획서(CMP) — 020_MGMT 또는 060_SFR
- WBS/IMS — 020_MGMT
- 데이터관리계획(DMP) — 020_MGMT
- 교육훈련계획서(TTP) — 020_MGMT 또는 150_TRR_DT
- SE 도구/환경 계획서 — 020_MGMT

## 일정(Schedule) 필드 안내

### CSV 입력 시 추가 컬럼 (선택)
| 컬럼명     | 설명                                                               | 예시       |
| ---------- | ------------------------------------------------------------------ | ---------- |
| 작성목표일 | 내부 준비/초안 완료 목표 (Internal Target Date)                    | 2026-02-10 |
| 제출마감일 | 계약/고객 제출 마감일 (Official Deadline), 형상 기준선 확정과 연결 | 2026-02-24 |

- 빈 값 허용 (없으면 null)
- 출력은 ISO 8601 형식(YYYY-MM-DD)으로 정규화

### 파생 계산 (향후 확장)
- 2주 전 알림 계산 등은 대시보드/스캐너 에이전트에서 처리 (이번 범위 밖)

## task id 규칙 — append-only (2026-08-19)

**한 번 쓴 task id는 그 행이 스펙에서 빠져도 다시 쓰지 않는다.** 이미 만들어진 과제 폴더는 `{id:03d}_{이름}`으로 디스크에 남아 있어서, id를 재사용하면 그 번호 폴더가 갑자기 다른 산출물을 가리키게 된다. 새 행은 그 게이트에서 아직 쓴 적 없는 가장 작은 번호를 쓴다.

### 은퇴한 id

| id | 게이트 | 원래 행(v0.7) | 어디로 갔나 |
| --- | --- | --- | --- |
| 144 | 120_CDR | `CDR_발표자료_F` | 발주처·주계약사 발표 자료라 스펙 본문이 아니라 **과제 덧씌움(overlay)**으로 옮겼다. id 144는 재사용 금지 — v0.7로 만든 과제 트리에는 `144_CDR_발표자료_F` 폴더가 그대로 있다 |

2026-08-19 정정: v0.8~v0.11에서 제조성숙도평가(MRA) 행이 144를 재사용하고 있었다. **148**로 옮겼다(145·146·147은 사용 중, 148~150은 미사용이었다).
