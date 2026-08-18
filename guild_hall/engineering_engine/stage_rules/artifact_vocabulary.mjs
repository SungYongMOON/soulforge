// Artifact standard-token vocabulary for the SE stage rule source model (design section 4, D44).
//
// This module owns the tokens the three consumers share: the folder-tree variant spec that
// declares `artifact_type_id` on a task, the engine stage policy that turns a rule into a
// `requirement_kind` and a `required_capability`, and the Needs policy that names a
// `needed_artifact_type_id`. One list, so that "the same artifact" means the same thing in all
// three places.
//
// The token is the identity. `label_ko` and `label_en` are display text only: they are how a
// human reads the token, never how a rule is decided, and the glossary surface is expected to
// mirror them rather than the other way round. Where the design doc names a token without
// giving its expansion, the label recorded here is the compiler's provisional reading at
// claim ceiling `observed`; correcting a label is not a rule change, and must not renumber or
// rename a token, because a token that moves invalidates every rule already compiled against it.
//
// Project-local folder names, prime-contractor slot names, and any other project-specific
// naming stay out of this file. They belong to the L2 overlay `alias` operation, which records
// the correspondence without giving the project a second vocabulary.

// The families a rule row can carry. The engine reads a family as `requirement_kind`, and the
// gap-scan policy maps it to an `artifact_kind`, so a new family is a contract change for both
// consumers and not a local edit here.
export const ARTIFACT_FAMILIES = Object.freeze([
  'requirements_specification',
  'design_description',
  'drawing_and_interface',
  'configuration_and_bom',
  'mechanical_model',
  'technical_plan',
  'test_plan',
  'test_procedure',
  'test_result',
  'test_docs',
  'evaluation_report',
  'configuration_audit',
  'review_minutes',
  'review_result',
  'closeout',
  'internal',
  'prime_contract_item',
  // D46 node kinds that are not documents. An `activity` is work a canonical text says has to
  // happen; a `decision` is a state a canonical text says has to be declared (a baseline, a
  // selected concept). Neither has a folder of its own — what is filed is the record that shows
  // it happened, which the rule row names in `evidence_record`.
  'activity',
  'decision',
]);

// The capability tokens the engine already observes in role rosters. A vocabulary entry may
// only default to one of these: inventing a ninth capability here would produce requirements
// that no declared role can ever satisfy, and the engine would report `capability_unmapped`
// for a reason that lives in this file rather than in the project.
export const CAPABILITY_TOKENS = Object.freeze([
  'systems_engineering',
  'hw_engineering',
  'sw_engineering',
  'mechanical_design',
  'configuration_management',
  'verification_review',
  'project_management',
  'risk_management',
]);

const entry = (artifactTypeId, family, labelKo, labelEn, capabilityDefault) => Object.freeze({
  artifact_type_id: artifactTypeId,
  family,
  label_ko: labelKo,
  label_en: labelEn,
  capability_default: capabilityDefault,
});

export const ARTIFACT_VOCABULARY_V0 = Object.freeze([
  // -------------------------------------------------------------- requirements
  entry('ord', 'requirements_specification', '소요요구서', 'Operational Requirements Document', 'systems_engineering'),
  entry('roc', 'requirements_specification', '작전운용성능', 'Required Operational Capability', 'systems_engineering'),
  entry('ssrs', 'requirements_specification', '체계요구사항명세서', 'System/Subsystem Requirements Specification', 'systems_engineering'),
  entry('sss', 'requirements_specification', '체계사양서', 'System/Subsystem Specification', 'systems_engineering'),
  entry('hrs', 'requirements_specification', '하드웨어요구사항명세서', 'Hardware Requirements Specification', 'hw_engineering'),
  entry('srs', 'requirements_specification', '소프트웨어요구사항명세서', 'Software Requirements Specification', 'sw_engineering'),
  entry('irs', 'requirements_specification', '인터페이스요구사항명세서', 'Interface Requirements Specification', 'systems_engineering'),

  // -------------------------------------------------------------- design
  entry('ssdd', 'design_description', '체계/부체계 설계기술서', 'System/Subsystem Design Description', 'systems_engineering'),
  entry('hdd', 'design_description', '하드웨어 설계기술서', 'Hardware Design Description', 'hw_engineering'),
  entry('sdd', 'design_description', '소프트웨어 설계기술서', 'Software Design Description', 'sw_engineering'),
  entry('idd', 'design_description', '인터페이스 설계기술서', 'Interface Design Description', 'sw_engineering'),
  entry('dbdd', 'design_description', '데이터베이스 설계기술서', 'Database Design Description', 'sw_engineering'),

  // -------------------------------------------------------------- drawing and interface
  entry('icd', 'drawing_and_interface', '인터페이스통제문서', 'Interface Control Document', 'systems_engineering'),
  entry('drawings', 'drawing_and_interface', '도면', 'Engineering Drawings', 'mechanical_design'),

  // -------------------------------------------------------------- configuration, specification, BOM
  //
  // `sps` and `scs` sit here rather than with the requirement specifications. The design doc
  // lists them under the 시험·평가 heading because they are what an FCA/PCA is audited against,
  // but what they are is the specification baseline, which is configuration material.
  entry('fci', 'configuration_and_bom', '기능형상식별서', 'Functional Configuration Identification', 'configuration_management'),
  entry('dci', 'configuration_and_bom', '개발형상식별서', 'Development Configuration Identification', 'configuration_management'),
  entry('pci', 'configuration_and_bom', '제품형상식별서', 'Product Configuration Identification', 'configuration_management'),
  entry('bom', 'configuration_and_bom', '부품목록', 'Bill of Materials', 'configuration_management'),
  entry('sps', 'configuration_and_bom', '체계성능시방서', 'System Performance Specification', 'configuration_management'),
  entry('scs', 'configuration_and_bom', '체계구성시방서', 'System Configuration Specification', 'configuration_management'),
  entry('spec_linkage_table', 'configuration_and_bom', '국방규격화 연계표', 'Defense Specification Linkage Table', 'configuration_management'),
  entry('defense_spec_draft', 'configuration_and_bom', '국방규격 초안', 'Defense Specification Draft', 'configuration_management'),
  entry('registered_parts_plan', 'configuration_and_bom', '등록부품 확보계획서', 'Registered Parts Plan', 'configuration_management'),

  // -------------------------------------------------------------- mechanical model
  entry('mechanical_model', 'mechanical_model', '기구 3차원 모델', 'Mechanical 3D Model', 'mechanical_design'),

  // -------------------------------------------------------------- plan and management
  entry('semp', 'technical_plan', '체계공학관리계획서', 'Systems Engineering Management Plan', 'systems_engineering'),
  entry('sdp', 'technical_plan', '소프트웨어개발계획서', 'Software Development Plan', 'sw_engineering'),
  entry('p_temp', 'technical_plan', '예비 시험평가기본계획서', 'Preliminary Test and Evaluation Master Plan', 'verification_review'),
  entry('temp', 'technical_plan', '시험평가기본계획서', 'Test and Evaluation Master Plan', 'verification_review'),
  entry('ms_plan', 'technical_plan', 'M&S 활용계획서', 'Modelling and Simulation Plan', 'systems_engineering'),
  entry('ram_plan', 'technical_plan', 'RAM 업무계획서', 'RAM Programme Plan', 'systems_engineering'),
  entry('interop_plan', 'technical_plan', '상호운용성 확보계획서', 'Interoperability Plan', 'systems_engineering'),
  entry('qa_plan', 'technical_plan', '품질보증계획서', 'Quality Assurance Plan', 'verification_review'),
  entry('risk_register', 'technical_plan', '위험관리 목록', 'Risk Register', 'risk_management'),
  entry('wbs', 'technical_plan', '업무분할구조', 'Work Breakdown Structure', 'project_management'),

  // -------------------------------------------------------------- test planning, procedure, result
  entry('stp', 'test_plan', '소프트웨어 시험계획서', 'Software Test Plan', 'verification_review'),
  entry('dt_plan', 'test_plan', '개발시험 계획서', 'Development Test Plan', 'verification_review'),
  entry('ot_plan', 'test_plan', '운용시험 계획서', 'Operational Test Plan', 'verification_review'),
  entry('std', 'test_procedure', '소프트웨어 시험절차서', 'Software Test Description', 'verification_review'),
  entry('dt_procedure', 'test_procedure', '개발시험 절차서', 'Development Test Procedure', 'verification_review'),
  entry('str', 'test_result', '소프트웨어 시험결과서', 'Software Test Report', 'verification_review'),
  entry('dt_report', 'test_result', '개발시험 결과보고서', 'Development Test Report', 'verification_review'),
  entry('ot_report', 'test_result', '운용시험 결과보고서', 'Operational Test Report', 'verification_review'),
  entry('ess_test', 'test_result', '환경응력선별시험 결과', 'Environmental Stress Screening Result', 'verification_review'),
  entry('env_test', 'test_result', '환경시험 결과', 'Environmental Test Result', 'verification_review'),
  entry('test_docs', 'test_docs', '시험절차서·성적서 묶음', 'Test Procedure and Result Bundle', 'verification_review'),

  // -------------------------------------------------------------- evaluation report
  entry('tra_report', 'evaluation_report', '기술성숙도평가 결과보고서', 'Technology Readiness Assessment Report', 'systems_engineering'),
  entry('mra_report', 'evaluation_report', '제조성숙도평가 결과보고서', 'Manufacturing Readiness Assessment Report', 'systems_engineering'),
  entry('mid_check_report', 'evaluation_report', '사업중간점검 결과보고서', 'Mid-programme Check Report', 'project_management'),

  // -------------------------------------------------------------- configuration audit
  entry('fca_plan', 'configuration_audit', '기능형상감사 계획서', 'Functional Configuration Audit Plan', 'verification_review'),
  entry('fca_checklist', 'configuration_audit', '기능형상감사 점검표', 'Functional Configuration Audit Checklist', 'verification_review'),
  entry('fca_report', 'configuration_audit', '기능형상감사 결과보고서', 'Functional Configuration Audit Report', 'verification_review'),
  entry('pca_plan', 'configuration_audit', '물리형상감사 계획서', 'Physical Configuration Audit Plan', 'configuration_management'),
  entry('pca_checklist', 'configuration_audit', '물리형상감사 점검표', 'Physical Configuration Audit Checklist', 'configuration_management'),
  entry('pca_report', 'configuration_audit', '물리형상감사 결과보고서', 'Physical Configuration Audit Report', 'configuration_management'),

  // -------------------------------------------------------------- review minutes and results
  entry('review_minutes_srr', 'review_minutes', 'SRR 회의록', 'SRR Meeting Minutes', 'verification_review'),
  entry('review_minutes_sfr', 'review_minutes', 'SFR 회의록', 'SFR Meeting Minutes', 'verification_review'),
  entry('review_minutes_pdr', 'review_minutes', 'PDR 회의록', 'PDR Meeting Minutes', 'verification_review'),
  entry('review_minutes_cdr', 'review_minutes', 'CDR 회의록', 'CDR Meeting Minutes', 'verification_review'),
  entry('review_minutes_trr', 'review_minutes', 'TRR 회의록', 'TRR Meeting Minutes', 'verification_review'),
  entry('review_minutes_fca', 'review_minutes', 'FCA 회의록', 'FCA Meeting Minutes', 'verification_review'),
  entry('review_minutes_pca', 'review_minutes', 'PCA 회의록', 'PCA Meeting Minutes', 'verification_review'),
  entry('review_result_report_srr', 'review_result', 'SRR 결과보고서', 'SRR Result Report', 'verification_review'),
  entry('review_result_report_sfr', 'review_result', 'SFR 결과보고서', 'SFR Result Report', 'verification_review'),
  entry('review_result_report_pdr', 'review_result', 'PDR 결과보고서', 'PDR Result Report', 'verification_review'),
  entry('review_result_report_cdr', 'review_result', 'CDR 결과보고서', 'CDR Result Report', 'verification_review'),
  entry('review_result_report_trr', 'review_result', 'TRR 결과보고서', 'TRR Result Report', 'verification_review'),
  entry('review_result_report_fca', 'review_result', 'FCA 결과보고서', 'FCA Result Report', 'verification_review'),
  entry('review_result_report_pca', 'review_result', 'PCA 결과보고서', 'PCA Result Report', 'verification_review'),

  // -------------------------------------------------------------- closeout and handover
  entry('dev_result_report', 'closeout', '체계개발 결과보고서', 'Development Result Report', 'project_management'),
  entry('tdp', 'closeout', '기술자료묶음', 'Technical Data Package', 'configuration_management'),
  entry('lessons_learned', 'closeout', '교훈', 'Lessons Learned', 'project_management'),

  // -------------------------------------------------------------- extension tokens (2026-08-18)
  //
  // Tokens the 체계개발 variant's machine fields use beyond design §4 (see the skill's
  // references/variants.md, D44 owner sign-off pending). Listed so a regulation-mandated row
  // (e.g. RAM 분석보고서, 핵심부품 공인시험 성적서) is not silently downgraded to context.
  entry('cdrl', 'configuration_and_bom', '계약자료요구목록', 'Contract Data Requirements List', 'configuration_management'),
  entry('rtm', 'requirements_specification', '요구사항 추적표', 'Requirements Traceability Matrix', 'systems_engineering'),
  entry('functional_analysis', 'design_description', '기능분석', 'Functional Analysis', 'systems_engineering'),
  entry('vv_strategy', 'test_plan', '검증·확인 전략', 'Verification and Validation Strategy', 'verification_review'),
  entry('trade_study', 'design_description', '절충연구', 'Trade Study', 'systems_engineering'),
  entry('standard_parts_review', 'configuration_and_bom', '표준품 적절성 검토서', 'Standard Parts Review', 'configuration_management'),
  entry('wps', 'configuration_and_bom', '제작사양서 및 검사요구', 'Workmanship/Process Specification', 'mechanical_design'),
  entry('manufacturing_design_review', 'review_result', '제조관점 설계검토 결과', 'Manufacturing Design Review', 'mechanical_design'),
  entry('manufacturing_process_flow', 'configuration_and_bom', '제조공정도·작업표준', 'Manufacturing Process Flow', 'mechanical_design'),
  entry('ram_analysis_report', 'evaluation_report', 'RAM 분석 보고서', 'RAM Analysis Report', 'systems_engineering'),
  entry('build_record', 'configuration_and_bom', '제작 이력', 'Build Record', 'configuration_management'),
  entry('atp', 'test_procedure', '수락시험 절차서', 'Acceptance Test Procedure', 'verification_review'),
  entry('delivery_acceptance_record', 'closeout', '납품·수락 기록', 'Delivery Acceptance Record', 'project_management'),
  entry('sat_report', 'test_result', '현장 수락시험 결과', 'Site Acceptance Test Report', 'verification_review'),
  entry('integration_test_support', 'test_docs', '체계통합시험 지원 결과', 'Integration Test Support Record', 'verification_review'),
  entry('defect_action_report', 'evaluation_report', '결함 조치 보고서', 'Defect Action Report', 'verification_review'),
  entry('ncr', 'evaluation_report', '부적합 보고서', 'Nonconformance Report', 'verification_review'),
  entry('defense_spec_drawings', 'drawing_and_interface', '국방규격 도면', 'Defense Specification Drawings', 'configuration_management'),
  entry('development_history', 'closeout', '개발 이력', 'Development History', 'project_management'),
  entry('lessons_learned_workshop', 'closeout', '교훈 공유회', 'Lessons Learned Workshop', 'project_management'),
  entry('review_minutes_kickoff', 'review_minutes', '착수회의 회의록', 'Kickoff Meeting Minutes', 'project_management'),
  entry('cm_plan', 'technical_plan', '형상관리계획서', 'Configuration Management Plan', 'configuration_management'),
  entry('technical_review_package', 'review_result', '기술검토회의 자료', 'Technical Review Package', 'systems_engineering'),
  entry('critical_parts_test_report', 'test_result', '핵심부품 공인시험 성적서', 'Critical Parts Accredited Test Report', 'verification_review'),
  entry('fca_pca_plan_checklist', 'configuration_audit', 'FCA/PCA 계획서·점검표', 'FCA/PCA Plan and Checklist', 'verification_review'),
  entry('production_transition_package', 'closeout', '양산 이관 자료', 'Production Transition Package', 'project_management'),

  // -------------------------------------------------------------- generic SE baseline tokens (2026-08-18)
  //
  // Tokens the buyer- and country-independent SE floor (layer ①, spec `generic_se_base`) needs
  // beyond the two lists above. Each one is an artifact both canonical texts behind that layer
  // name — NASA NPR 7123.1D appendix G entrance/success criteria and the DoD SE Guidebook 2022
  // section 3 review criteria — or that one of them names and defence practice treats as standard.
  // They are deliberately generic: no token here belongs to one buyer, one country, or one
  // contract, which is what lets a national or prime-contractor layer meet this one on a shared id.
  entry('conops', 'requirements_specification', '운용개념서', 'Concept of Operations', 'systems_engineering'),
  entry('spec_tree', 'requirements_specification', '문서·규격 트리', 'Document and Specification Tree', 'systems_engineering'),
  entry('tpm_list', 'requirements_specification', '기술성능지표 목록', 'Technical Performance Measure List', 'systems_engineering'),
  entry('resource_budget', 'design_description', '기술자원 예산·여유도', 'Technical Resource Budget and Margins', 'systems_engineering'),
  entry('risk_management_plan', 'technical_plan', '위험관리계획서', 'Risk Management Plan', 'risk_management'),
  entry('ims', 'technical_plan', '통합일정', 'Integrated Master Schedule', 'project_management'),
  entry('ils_plan', 'technical_plan', '종합군수지원계획서', 'Integrated Logistics Support Plan', 'project_management'),
  entry('manufacturing_plan', 'technical_plan', '제조·생산계획서', 'Manufacturing Plan', 'mechanical_design'),
  entry('hsi_plan', 'technical_plan', '인간체계통합계획서', 'Human Systems Integration Plan', 'systems_engineering'),
  entry('security_plan', 'technical_plan', '체계보안·보호계획서', 'System Security and Protection Plan', 'systems_engineering'),
  entry('integration_plan', 'technical_plan', '체계통합계획서', 'System Integration Plan', 'systems_engineering'),
  entry('emc_control_plan', 'technical_plan', '전자기적합성·환경통제계획서', 'EMI/EMC and Environments Control Plan', 'hw_engineering'),
  entry('handling_transport_plan', 'technical_plan', '운송·취급·포장 지침', 'Transportation, Handling and Packaging Instruction', 'project_management'),
  entry('vcrm', 'test_plan', '검증교차참조표', 'Verification Cross-Reference Matrix', 'verification_review'),
  entry('system_safety_analysis', 'evaluation_report', '체계안전·위험원 분석서', 'System Safety and Hazard Analysis', 'systems_engineering'),
  entry('fmeca', 'evaluation_report', 'FMECA·신뢰성 분석서', 'FMECA and Reliability Analysis', 'systems_engineering'),
  entry('engineering_analysis_report', 'evaluation_report', '공학해석·M&S 결과보고서', 'Engineering Analysis and M&S Report', 'systems_engineering'),
  entry('discrepancy_log', 'evaluation_report', '결함·불일치 대장', 'Discrepancy Log', 'verification_review'),
  entry('ram_assessment_report', 'evaluation_report', 'RAM 달성도 평가보고서', 'RAM Achieved Performance Assessment', 'systems_engineering'),
  entry('security_assessment_report', 'evaluation_report', '보안통제 검증보고서', 'Security Controls Assessment Report', 'verification_review'),
  entry('fracas_report', 'evaluation_report', '고장보고·분석·시정조치 기록', 'FRACAS Record', 'verification_review'),
  entry('long_lead_list', 'configuration_and_bom', '장납기·핵심조달 품목 목록', 'Long-Lead Item List', 'configuration_management'),
  entry('critical_items_list', 'configuration_and_bom', '핵심품목·단일고장점 목록', 'Critical Items and Single Point Failure List', 'systems_engineering'),
  entry('as_built_config', 'configuration_and_bom', 'As-built 형상목록', 'As-Built Configuration List', 'configuration_management'),
  entry('vdd', 'configuration_and_bom', '소프트웨어 버전기술서', 'Software Version Description Document', 'sw_engineering'),
  entry('waiver_deviation_log', 'configuration_and_bom', '면제·일탈 및 결함종결 대장', 'Waiver and Deviation Register', 'configuration_management'),
  entry('acceptance_data_package', 'test_result', '수락자료묶음', 'Acceptance Data Package', 'verification_review'),
  entry('tech_manual', 'closeout', '운용·정비 기술교범', 'Operator and Maintenance Technical Manual', 'project_management'),
  entry('training_material', 'closeout', '교육훈련 자료·이수기록', 'Training Material and Completion Record', 'project_management'),
  entry('action_item_log', 'review_result', '검토 조치사항 종결 대장', 'Review Action Item Closure Log', 'verification_review'),

  // -------------------------------------------------------------- activity and decision nodes (2026-08-18, D46)
  //
  // The seventeen common technical processes, plus the baselines and the study a canonical text
  // names as a state to be declared. A token here is not a document: it is work that has to
  // happen, or a state that has to be declared, and the row that carries it names in
  // `evidence_record` which record would show it. Naming these lets a rule table say what a
  // document needs before it can be written, which is what `depends_on` is for.
  //
  // Source correspondence per token, the per-process input and output lists behind each edge and
  // the coverage gaps are in `.registry/skills/se_foldertree_generate/codex/references/se_io_relations_v0.md`.
  // Where two canonical texts name the same process differently the token is one of the two
  // names and the other is recorded there; where only one text names a process at all, the token
  // exists but its edges are single-source.
  entry('act_stakeholder_expectations', 'activity', '이해관계자 기대 정의', 'Stakeholder Expectations Definition', 'systems_engineering'),
  entry('act_requirements_analysis', 'activity', '요구사항 분석', 'Requirements Analysis', 'systems_engineering'),
  entry('act_logical_decomposition', 'activity', '논리적 분해·기능분석', 'Logical Decomposition', 'systems_engineering'),
  entry('act_architecture_design', 'activity', '아키텍처·설계해 정의', 'Architecture Design', 'systems_engineering'),
  entry('act_implementation', 'activity', '구현·제작', 'Product Implementation', 'systems_engineering'),
  entry('act_integration', 'activity', '통합', 'Product Integration', 'systems_engineering'),
  entry('act_verification', 'activity', '검증', 'Product Verification', 'verification_review'),
  entry('act_validation', 'activity', '확인', 'Product Validation', 'verification_review'),
  entry('act_transition', 'activity', '인도·전환', 'Product Transition', 'project_management'),
  entry('act_technical_planning', 'activity', '기술 계획', 'Technical Planning', 'systems_engineering'),
  entry('act_requirements_management', 'activity', '요구사항 관리', 'Requirements Management', 'systems_engineering'),
  entry('act_interface_management', 'activity', '인터페이스 관리', 'Interface Management', 'systems_engineering'),
  entry('act_risk_management', 'activity', '위험 관리', 'Technical Risk Management', 'risk_management'),
  entry('act_configuration_management', 'activity', '형상 관리', 'Configuration Management', 'configuration_management'),
  entry('act_technical_data_management', 'activity', '기술자료 관리', 'Technical Data Management', 'configuration_management'),
  entry('act_technical_assessment', 'activity', '기술 평가·성과측정', 'Technical Assessment', 'systems_engineering'),
  entry('act_decision_analysis', 'activity', '결정 분석·절충연구', 'Decision Analysis', 'systems_engineering'),
  // Named by the national practice guide as its own process rather than folded into the design
  // one, and by the NASA handbook as logical decomposition. Kept separate from
  // `act_architecture_design` because the two texts treat "what functions, allocated where" and
  // "which design solution" as different work with different inputs.
  entry('act_functional_analysis_allocation', 'activity', '기능분석·기능할당', 'Functional Analysis and Allocation', 'systems_engineering'),
  // The technical review meeting itself. The national review guidebook states a different INPUT
  // list for every gate, which is the most directly useful "what has to exist before this review"
  // the canon gives; the row for it therefore repeats gate by gate with its own inputs. Its
  // records are the minutes and the review result report.
  entry('act_technical_review', 'activity', '기술검토회의 수행', 'Technical Review Conducted', 'verification_review'),

  // The three baselines a canonical text names as established at a named review. A baseline is
  // not the document that identifies it: `fci` / `dci` / `pci` are the configuration
  // identification documents, and these tokens are the act of putting the configuration under
  // control. A development can hold the document and not have declared the baseline, which is
  // exactly the difference this layer exists to make visible.
  entry('dec_functional_baseline', 'decision', '기능 기준선 확정', 'Functional Baseline Established', 'configuration_management'),
  entry('dec_allocated_baseline', 'decision', '할당 기준선 확정', 'Allocated Baseline Established', 'configuration_management'),
  entry('dec_product_baseline', 'decision', '제품 기준선 확정', 'Product Baseline Established', 'configuration_management'),

  // -------------------------------------------------------------- internal management
  //
  // These are the fixed folders every variant carries. They are real folders and a real place
  // to put things, but they are not evidence that a stage produced anything, so the compiler
  // keeps them as context and never turns them into an engine requirement.
  entry('inbox', 'internal', '수신함', 'Inbox', 'project_management'),
  entry('log', 'internal', '작업기록', 'Work Log', 'project_management'),
  entry('tdp_exchange', 'internal', '기술자료 송수신', 'Technical Data Exchange', 'project_management'),
]);

const BY_ID = new Map(ARTIFACT_VOCABULARY_V0.map((row) => [row.artifact_type_id, row]));

/** True when `id` is a token this vocabulary owns. */
// Prime-contractor items (contract quality gates, supplier records) are per-contractor and cannot
// be enumerated here. A token of the shape `prime_<...>` is recognised as a prime contract item
// so that a variant row carrying one keeps its evidence level instead of falling to unmapped
// context; other prime contractors mark such rows N/A in their overlay.
const PRIME_TOKEN = /^prime_[a-z0-9]+(?:_[a-z0-9]+)*$/u;
const primeEntry = (id) => Object.freeze({
  artifact_type_id: id,
  family: 'prime_contract_item',
  label_ko: '주계약사 계약 항목',
  label_en: 'Prime Contract Item',
  capability_default: 'project_management',
});

export function isKnownArtifactType(id) {
  return typeof id === 'string' && (BY_ID.has(id) || PRIME_TOKEN.test(id));
}

/**
 * The vocabulary entry for `id`, or `null`.
 *
 * `null` rather than a throw: an unknown token is a normal outcome for a variant task that has
 * not been given machine fields yet, and the compiler answers it by keeping the row as
 * unmapped context rather than by refusing the whole variant.
 */
export function artifactTypeEntry(id) {
  if (typeof id !== 'string') return null;
  return BY_ID.get(id) ?? (PRIME_TOKEN.test(id) ? primeEntry(id) : null);
}
