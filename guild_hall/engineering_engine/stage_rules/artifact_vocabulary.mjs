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
export function isKnownArtifactType(id) {
  return typeof id === 'string' && BY_ID.has(id);
}

/**
 * The vocabulary entry for `id`, or `null`.
 *
 * `null` rather than a throw: an unknown token is a normal outcome for a variant task that has
 * not been given machine fields yet, and the compiler answers it by keeping the row as
 * unmapped context rather than by refusing the whole variant.
 */
export function artifactTypeEntry(id) {
  return (typeof id === 'string' ? BY_ID.get(id) : undefined) ?? null;
}
