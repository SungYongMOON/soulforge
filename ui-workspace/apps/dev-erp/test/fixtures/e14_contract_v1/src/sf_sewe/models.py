"""E14/ICD 1.0 typed boundary records. Schemas derive from these models.
No provider, source credentials, or runtime discovery occurs on import.
"""
from __future__ import annotations
from typing import Annotated, Literal, Generic, TypeVar
from pydantic import BaseModel, ConfigDict, Field, model_validator

Id = Annotated[str, Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$')]
Opaque = Annotated[str, Field(pattern=r'^o_[0-9a-f]{32}$')]
Digest = Annotated[str, Field(pattern=r'^[0-9a-f]{64}$')]
Version = Annotated[str, Field(pattern=r'^[0-9]+\.[0-9]+\.[0-9]+$')]
Text = Annotated[str, Field(min_length=1, max_length=16000)]
Utc = Annotated[str, Field(pattern=r'^\d{4}-\d\d-\d\dT\d\d' r':\d\d' r':\d\dZ$')]
NonNeg = Annotated[int, Field(ge=0, le=2**53-1)]
Classification = Literal['PRIVATE','RELEASE_CANDIDATE','RELEASED','QUARANTINE']
Status = Literal['FACT','ANALYSIS','PROPOSAL','UNKNOWN']

class DTO(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True, frozen=True, hide_input_in_errors=True)
    @model_validator(mode='after')
    def validate_timestamps(self):
        from datetime import datetime
        for name in type(self).model_fields:
            if name.endswith('_utc') and isinstance(getattr(self,name,None),str):
                try:datetime.strptime(getattr(self,name),'%Y-%m-%dT%H:%M:%SZ')
                except ValueError:raise ValueError('TIME_INVALID') from None
        return self

class Empty(DTO):
    pass

class RequestMeta(DTO):
    request_id: Opaque
    idempotency_key: Opaque
    expected_revision: NonNeg
    deadline_utc: Utc

class ResourceRef(DTO):
    object_id: Opaque
    revision: Id
    sha256: Digest
    media_type: Literal['application/json','text/plain','text/markdown','application/octet-stream','application/pdf','image/png','image/svg+xml','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/hwp+zip']
    byte_length: Annotated[int, Field(ge=0, le=268435456)]
    classification: Classification

class SourcePin(DTO):
    source_ref: Id
    revision: Id
    sha256: Digest

class SourceBinding(DTO):
    project_ref: Id
    assignment_ref: Id
    assignment_epoch: NonNeg
    sources: Annotated[list[SourcePin], Field(min_length=1,max_length=128)]

class PrivateField(DTO):
    field_id: Id
    source_ref: Id
    source_revision: Id
    span_start: NonNeg
    span_end: NonNeg
    value: Text
    role: Literal['text','entity','quantity','date','verbatim']
    status: Status
    dependencies: Annotated[list[Id], Field(max_length=128)]
    classification: Literal['PRIVATE','RELEASE_CANDIDATE','UNKNOWN']

class SourceBundle(DTO):
    protocol: Literal['sf.sewe.private-source/1.0']
    binding: SourceBinding
    fields: Annotated[list[PrivateField], Field(min_length=1,max_length=4096)]
    extraction_complete: bool
    gaps: Annotated[list[Id], Field(max_length=128)]

class LiteralSegment(DTO):
    kind: Literal['literal']
    text: Text

class SlotSegment(DTO):
    kind: Literal['slot']
    slot_id: Opaque

Segment = Annotated[LiteralSegment|SlotSegment, Field(discriminator='kind')]

class SectionSpec(DTO):
    section_id: Id
    title: Text
    required: bool
    required_fact_ids: Annotated[list[Opaque], Field(max_length=512)]
    allowed_slot_ids: Annotated[list[Opaque], Field(max_length=512)]
    required_slot_ids: Annotated[list[Opaque], Field(max_length=512)]

class WorkDefinition(DTO):
    work_type: Id
    revision: Version
    instructions: Text
    section_titles: Annotated[dict[Id,Text], Field(min_length=1,max_length=128)]
    required_sections: Annotated[list[Id], Field(min_length=1,max_length=128)]
    output_profile: Id
    max_rounds: Annotated[int,Field(ge=1,le=100)]
    validators: Annotated[list[Id], Field(min_length=1,max_length=32)]

class FieldRule(DTO):
    field_id: Id
    action: Literal['KEEP_REVIEWED','TOKENIZE_ID','TYPED_SLOT','LOCAL_VERBATIM_SLOT','OMIT']
    section_ids: Annotated[list[Id],Field(max_length=128)]
    required: bool
    review_ref: Id|None

class ProjectionPlan(DTO):
    protocol: Literal['sf.sewe.projection-plan/1.0']
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    base_candidate_rev: Id
    source_bundle_sha256: Digest
    work_definition_sha256: Digest
    policy_epoch: NonNeg
    rules: Annotated[list[FieldRule],Field(min_length=1,max_length=4096)]

class FactIR(DTO):
    fact_id: Opaque
    status: Status
    segments: Annotated[list[Segment],Field(min_length=1,max_length=128)]
    depends_on: Annotated[list[Opaque],Field(max_length=512)]
    source_refs: Annotated[list[Opaque],Field(max_length=128)]

class PublicSlot(DTO):
    slot_id: Opaque
    role: Literal['entity','quantity','date','verbatim']
    display_hint: Literal['NAME','VALUE','DATE','LOCAL_BLOCK']

class PublicAssetSlot(DTO):
    slot_id: Opaque
    content_kind: Literal['IMAGE','TABULAR_DATA','NATIVE_TEMPLATE']
    semantic_role: Id
    aspect_width: Annotated[int,Field(ge=1,le=10000)]|None
    aspect_height: Annotated[int,Field(ge=1,le=10000)]|None

class WorkPacket(DTO):
    protocol: Literal['sf.sewe.packet/1.0']
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    base_candidate_rev: Id
    work_type: Id
    work_revision: Version
    instructions: Text
    facts: Annotated[list[FactIR],Field(max_length=4096)]
    slots: Annotated[list[PublicSlot],Field(max_length=4096)]
    asset_slots: Annotated[list[PublicAssetSlot],Field(max_length=4096)]
    sections: Annotated[list[SectionSpec],Field(min_length=1,max_length=128)]

class BindingRecord(DTO):
    mission_id: Opaque
    slot_id: Opaque
    source_bundle_sha256: Digest
    field_id: Id
    source_pin: SourcePin
    role: Literal['entity','quantity','date','verbatim']
    value: Text
    allowed_sections: Annotated[list[Id],Field(min_length=1,max_length=128)]

class ProjectionOutput(DTO):
    packet: WorkPacket
    bindings: Annotated[list[BindingRecord],Field(max_length=4096)]
    used_field_ids: Annotated[list[Id],Field(max_length=4096)]
    omitted_field_ids: Annotated[list[Id],Field(max_length=4096)]
    review_state: Literal['REVIEW_REQUIRED']

class Block(DTO):
    block_id: Opaque
    kind: Literal['paragraph','table']
    status: Status
    evidence_ids: Annotated[list[Opaque],Field(max_length=512)]
    segments: Annotated[list[Segment],Field(max_length=128)]
    columns: Annotated[list[Text],Field(max_length=32)]
    rows: Annotated[list[list[list[Segment]]],Field(max_length=1000)]

class SectionIR(DTO):
    section_id: Id
    blocks: Annotated[list[Block],Field(min_length=1,max_length=256)]

class MissingEvidence(DTO):
    code: Literal['SOURCE_MISSING','CONTEXT_INSUFFICIENT','TRANSFORMATION_INADEQUATE']
    section_id: Id
    related_fact_ids: Annotated[list[Opaque],Field(max_length=128)]

class DocumentIR(DTO):
    protocol: Literal['sf.sewe.document/1.0']
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    base_candidate_rev: Id
    work_type: Id
    work_revision: Version
    completion: Literal['COMPLETE_CANDIDATE','PARTIAL']
    sections: Annotated[list[SectionIR],Field(min_length=1,max_length=128)]
    missing_evidence: Annotated[list[MissingEvidence],Field(max_length=128)]

class MoreContext(DTO):
    protocol: Literal['sf.sewe.more-context/1.0']
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    base_candidate_rev: Id
    request_id: Opaque
    related_fact_ids: Annotated[list[Opaque],Field(max_length=64)]
    question: Annotated[str,Field(min_length=1,max_length=2000)]

class WorkerReply(DTO):
    result: DocumentIR|None
    more_context: MoreContext|None
    @model_validator(mode='after')
    def check_variant(self):
        if (self.result is None)==(self.more_context is None):
            raise ValueError('WORKER_REPLY_VARIANT')
        return self

class ModuleManifest(DTO):
    module_id: Id
    implementation_version: Version
    contract_major: Annotated[int,Field(ge=1,le=1)]
    kind: Literal['SOURCE','G2','TRANSFORM','POLICY','KEY','PROVIDER_CODEC','TRANSPORT','RENDERER','VALIDATOR','CUSTODY']
    reads: Annotated[list[Classification],Field(max_length=4)]
    writes: Annotated[list[Classification],Field(max_length=4)]
    needs_network: bool
    supported_operations: Annotated[list[Id],Field(min_length=1,max_length=64)]
    schema_digests: Annotated[dict[Id,Digest],Field(min_length=1,max_length=128)]
    qualification_ref: Id|None

class PolicyReview(DTO):
    review_ref: Id
    scope_digest: Digest
    packet_digest: Digest
    work_digest: Digest
    policy_epoch: NonNeg
    mode: Literal['HUMAN_REVIEWED_EXACT','QUALIFIED_RECIPE_INSTANCE']
    decision: Literal['ALLOW','DENY','REVIEW_REQUIRED']
    actor_ref: Id
    expires_utc: Utc
    evidence_refs: Annotated[list[Id],Field(min_length=1,max_length=64)]

class RouteProfile(DTO):
    profile_id: Id
    revision: Version
    model_id: Annotated[str,Field(pattern=r'^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,255}$')]
    codec_id: Id
    transport_id: Id
    max_request_bytes: Annotated[int,Field(ge=1024,le=16777216)]
    max_response_bytes: Annotated[int,Field(ge=1024,le=16777216)]
    deadline_ms: Annotated[int,Field(ge=1000,le=3600000)]
    streaming: Literal[False]
    redirects: Literal[False]
    auto_retry: Literal[False]
    data_class: Literal['RELEASED']
    live_enabled: bool

class PreparedRequest(DTO):
    request_id: Opaque
    job_id: Opaque
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    packet_sha256: Digest
    review_ref: Id
    body: ResourceRef
    route_sha256: Digest
    codec_version: Version
    header_profile_sha256: Digest

class PermitClaims(DTO):
    protocol: Literal['sf.sewe.permit/1.0']
    permit_id: Opaque
    job_id: Opaque
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    request_sha256: Digest
    route_sha256: Digest
    review_ref: Id
    policy_epoch: NonNeg
    audience: Id
    issued_utc: Utc
    expires_utc: Utc
    max_uses: Literal[1]

class SignedPermit(DTO):
    key_id: Id
    claims: PermitClaims
    signature_hex: Annotated[str,Field(pattern=r'^[0-9a-f]{128}$')]

class DispatchOutcome(DTO):
    attempt_id: Opaque
    state: Literal['RESPONSE_RECEIVED','NOT_SENT','DELIVERY_UNKNOWN']
    request_sha256: Digest
    response: ResourceRef|None
    error_code: Id|None

class CheckFinding(DTO):
    code: Id
    severity: Literal['BLOCK','REVIEW','INFO']
    location_ref: Id|None
    evidence_ref: Id|None

class ValidationReport(DTO):
    report_id: Opaque
    subject_sha256: Digest
    validator_id: Id
    validator_version: Version
    privacy: Literal['PASS_IN_SCOPE','FAIL','NOT_RUN']
    utility: Literal['PASS_IN_SCOPE','FAIL','REVIEW_REQUIRED','NOT_RUN']
    integrity: Literal['PASS_IN_SCOPE','FAIL','NOT_RUN']
    enforcement: Literal['PASS_IN_SCOPE','FAIL','NOT_RUN']
    findings: Annotated[list[CheckFinding],Field(max_length=1000)]
    evidence_refs: Annotated[list[Id],Field(max_length=1000)]

class CandidateManifest(DTO):
    candidate_id: Opaque
    job_id: Opaque
    source_binding_sha256: Digest
    base_candidate_rev: Id
    files: Annotated[list[ResourceRef],Field(min_length=1,max_length=128)]
    validation_refs: Annotated[list[Opaque],Field(min_length=1,max_length=128)]
    status: Literal['PARTIAL','REVIEW_PENDING','VERIFIED_CANDIDATE']
    is_accepted_revision: Literal[False]

class CustodyReceipt(DTO):
    receipt_id: Opaque
    candidate_id: Opaque
    manifest_sha256: Digest
    state: Literal['ACKNOWLEDGED','PENDING','UNKNOWN','REJECTED']
    server_acknowledged: bool
    accepted: Literal[False]

class SubmitInput(DTO):
    meta: RequestMeta
    task_ref: Id
    project_ref: Id
    assignment_ref: Id
    assignment_epoch: NonNeg
    sources: Annotated[list[SourcePin],Field(min_length=1,max_length=128)]
    request_ref: ResourceRef
    work_type: Id
    work_revision: Version
    output_profile: Id

JobPhase = Literal['RECEIVED','SOURCE_PINNED','G2_PREPARED','RELEASE_REVIEW','READY',
 'RUNNING','NEEDS_CONTEXT','RESULT_QUARANTINED','STRUCTURE_CHECKED','BOUND',
 'REVIEW_PENDING','CANDIDATE_READY','CUSTODY_PENDING','CUSTODY_ACKNOWLEDGED',
 'HOLD','CANCEL_REQUESTED','CANCELLED','STALE','FAILED']
class JobView(DTO):
    job_id: Opaque
    revision: NonNeg
    phase: JobPhase
    round: Annotated[int,Field(ge=0,le=100)]
    work_type: Id
    last_error: Id|None
    candidate_ref: Opaque|None
    official_done: Literal[False]

class JobCommand(DTO):
    meta: RequestMeta
    job_id: Opaque

class ReviseInput(JobCommand):
    base_candidate_rev: Id
    request_ref: ResourceRef

class SupplyContextInput(JobCommand):
    request_id: Opaque
    source_pins: Annotated[list[SourcePin],Field(min_length=1,max_length=128)]

class EventRecord(DTO):
    event_id: Opaque
    job_id: Opaque
    seq: Annotated[int,Field(ge=1,le=2**53-1)]
    event_type: Id
    actor_ref: Id
    before_phase: JobPhase
    after_phase: JobPhase
    evidence_refs: Annotated[list[Id],Field(max_length=64)]
    occurred_utc: Utc

class ErrorInfo(DTO):
    code: Id
    disposition: Literal['RETRY_SAME','NEW_REVIEW','WAIT','STOP']
    correlation_id: Opaque
    side_effect: Literal['NONE','LOCAL_COMMITTED','EXTERNAL_POSSIBLE','EXTERNAL_CONFIRMED']

T=TypeVar('T')
class Outcome(DTO,Generic[T]):
    ok: bool
    data: T|None
    error: ErrorInfo|None
    @model_validator(mode='after')
    def check_branch(self):
        if self.ok and (self.data is None or self.error is not None):
            raise ValueError('OUTCOME_BRANCH')
        if not self.ok and (self.data is not None or self.error is None):
            raise ValueError('OUTCOME_BRANCH')
        return self

class SpanMetric(DTO):
    job_id: Opaque
    category: Literal['G2_QUEUE','G2_INFERENCE','CODE','G3_ROUNDTRIP','RENDER','REVIEW','CUSTODY']
    duration_ms: NonNeg
    attempt_id: Opaque|None

# R2/R3 extension contracts: typed boundaries, not claims of native support.
class AdapterCapability(DTO):
    adapter_id: Id
    adapter_version: Version
    profile_id: Id
    target_version: Id
    media_types: Annotated[list[Text],Field(min_length=1,max_length=16)]
    operations: Annotated[list[Id],Field(min_length=1,max_length=64)]
    qualification_ref: Id|None
    mode: Literal['REFERENCE','QUALIFIED_TARGET','UNAVAILABLE']

class RenderInput(DTO):
    document_ref: ResourceRef
    binding_bundle_ref: ResourceRef
    template_ref: ResourceRef
    target_profile: Id
    source_binding_sha256: Digest

class RenderOutput(DTO):
    files: Annotated[list[ResourceRef],Field(min_length=1,max_length=128)]
    private_preview_refs: Annotated[list[ResourceRef],Field(max_length=128)]
    validation: ValidationReport

class StyleChange(DTO):
    object_id: Opaque
    x_emu: NonNeg|None
    y_emu: NonNeg|None
    width_emu: Annotated[int,Field(gt=0,le=2**53-1)]|None
    height_emu: Annotated[int,Field(gt=0,le=2**53-1)]|None
    font_centipoints: Annotated[int,Field(ge=100,le=40000)]|None
    paragraph_after_centipoints: Annotated[int,Field(ge=0,le=40000)]|None
    alignment: Literal['LEFT','CENTER','RIGHT']|None

class StyleDelta(DTO):
    protocol: Literal['sf.sewe.style-delta/1.0']
    mission_id: Opaque
    base_artifact_sha256: Digest
    template_sha256: Digest
    changes: Annotated[list[StyleChange],Field(min_length=1,max_length=2048)]

class ToolCommand(DTO):
    protocol: Literal['sf.sewe.tool-command/1.0']
    command_id: Opaque
    mission_id: Opaque
    expected_artifact_sha256: Digest
    adapter_profile: Id
    operation: Literal['RENDER_DOCUMENT','APPLY_STYLE_DELTA','RUN_REGISTERED_CALCULATION','APPLY_REVIEWED_PATCH','RUN_VALIDATOR']
    input_refs: Annotated[list[ResourceRef],Field(min_length=1,max_length=64)]
    parameter_ref: ResourceRef
    lease_ref: Opaque
    idempotency_key: Opaque

class ToolReceipt(DTO):
    command_id: Opaque
    state: Literal['APPLIED','REJECTED','FAILED','OUTCOME_UNKNOWN']
    output_refs: Annotated[list[ResourceRef],Field(max_length=64)]
    observation_ref: ResourceRef|None
    validation_refs: Annotated[list[Opaque],Field(max_length=64)]

class HealthReport(DTO):
    contract_version: Literal['1.0.0']
    mode: Literal['OFFLINE','BOUND_NOT_QUALIFIED','QUALIFIED_LIVE']
    modules: Annotated[list[Id],Field(max_length=64)]
    blocked_bindings: Annotated[list[Id],Field(max_length=64)]

class Quantity(DTO):
    decimal_value: Annotated[str,Field(pattern=r'^-?(0|[1-9][0-9]*)(\.[0-9]+)?$')]
    unit: Id

class CalculationInput(DTO):
    calculator_id: Id
    calculator_version: Version
    arguments: Annotated[dict[Id,Quantity],Field(min_length=1,max_length=256)]
    output_contract_sha256: Digest

class PatchInput(DTO):
    target_ref: ResourceRef
    patch_ref: ResourceRef
    patch_format: Literal['UNIFIED_DIFF_UTF8','TYPED_OBJECT_PATCH_V1']
    review_ref: Id
    dependency_manifest: ResourceRef

class ValidatorInput(DTO):
    target_refs: Annotated[list[ResourceRef],Field(min_length=1,max_length=128)]
    validator_profile: Id
    original_oracle_ref: ResourceRef

class BlobPutInput(DTO):
    source_handle: Opaque
    media_type: ResourceRef.model_fields['media_type'].annotation
    expected_sha256: Digest
    byte_length: Annotated[int,Field(ge=0,le=268435456)]
    classification: Classification

class BlobReadInput(DTO):
    ref: ResourceRef
    offset: NonNeg
    length: Annotated[int,Field(ge=0,le=268435456)]

class BlobReadOutput(DTO):
    read_handle: Opaque
    ref: ResourceRef
    offset: NonNeg
    length: NonNeg

class SourceReadInput(DTO):
    binding: SourceBinding

class G2PrepareInput(DTO):
    source_bundle_ref: ResourceRef
    user_request_ref: ResourceRef
    work_definition_ref: ResourceRef
    current_context_ref: ResourceRef|None

class G2Proposal(DTO):
    selected_field_ids: Annotated[list[Id],Field(min_length=1,max_length=4096)]
    dependency_pairs: Annotated[list[Annotated[list[Id],Field(min_length=2,max_length=2)]],Field(max_length=4096)]
    missing_field_roles: Annotated[list[Id],Field(max_length=128)]
    proposed_actions: Annotated[list[FieldRule],Field(max_length=4096)]
    source_bundle_sha256: Digest
    review_required: Literal[True]

class ProjectInput(DTO):
    source: SourceBundle
    plan: ProjectionPlan
    work: WorkDefinition

class SealBindingsInput(DTO):
    mission_id: Opaque
    source_bundle_sha256: Digest
    bindings: Annotated[list[BindingRecord],Field(max_length=4096)]

class BindingHandle(DTO):
    handle_id: Opaque
    mission_id: Opaque
    source_bundle_sha256: Digest
    record_count: NonNeg

class ResolveBindingsInput(DTO):
    handle: BindingHandle
    requested_slot_ids: Annotated[list[Opaque],Field(max_length=4096)]

class ResolvedBindings(DTO):
    bindings: Annotated[list[BindingRecord],Field(max_length=4096)]

class ReviewInput(DTO):
    packet_ref: ResourceRef
    source_binding: SourceBinding
    plan_ref: ResourceRef
    protected_fact_catalog_ref: ResourceRef
    work_definition_ref: ResourceRef
    history_ref: ResourceRef

class IssuePermitInput(DTO):
    prepared: PreparedRequest
    review: PolicyReview
    audience: Id

class RevokeInput(DTO):
    policy_scope_ref: Id
    expected_policy_epoch: NonNeg
    evidence_ref: Id

class PolicyEpoch(DTO):
    policy_scope_ref: Id
    epoch: NonNeg

class PrepareWireInput(DTO):
    job_id: Opaque
    packet: WorkPacket
    review: PolicyReview
    route: RouteProfile
    released_history_refs: Annotated[list[ResourceRef],Field(max_length=128)]

class DispatchInput(DTO):
    meta: RequestMeta
    prepared: PreparedRequest
    permit: SignedPermit

class AttemptQuery(DTO):
    attempt_id: Opaque

class ParseReplyInput(DTO):
    prepared: PreparedRequest
    response_ref: ResourceRef
    codec_id: Id

class CheckResultInput(DTO):
    packet: WorkPacket
    result: DocumentIR
    current_base: Id

class StructureVerdict(DTO):
    state: Literal['STRUCTURAL_PASS_SEMANTIC_REVIEW_REQUIRED']
    result_sha256: Digest
    required_complete: bool

class BindInput(DTO):
    packet: WorkPacket
    result: DocumentIR
    binding_handle: BindingHandle
    current_source_bundle_sha256: Digest
    current_base: Id
    output_profile: Literal['markdown.literal.v1']

class ArtifactOutput(DTO):
    content_ref: ResourceRef
    body_sha256: Digest
    profile: Id
    structure: StructureVerdict
    semantic_accepted: Literal[False]

class StageInput(DTO):
    meta: RequestMeta
    job_id: Opaque
    candidate: CandidateManifest

class DepositInput(DTO):
    meta: RequestMeta
    candidate_ref: ResourceRef
    receiver_profile: Id

class ReceiptQuery(DTO):
    receipt_id: Opaque

class EventQuery(DTO):
    job_id: Opaque
    after_seq: NonNeg
    limit: Annotated[int,Field(ge=1,le=200)]

class EventPage(DTO):
    events: Annotated[list[EventRecord],Field(max_length=200)]
    next_after_seq: NonNeg|None

class Capabilities(DTO):
    principal_ref: Id
    permitted_actions: Annotated[list[Id],Field(max_length=128)]
    project_refs: Annotated[list[Id],Field(max_length=128)]
    authority_epoch: NonNeg
    expires_utc: Utc


class WorkerReceipt(DTO):
    receipt_id: Opaque
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    reply_sha256: Digest
    state: Literal['QUARANTINED','CONTEXT_REQUEST_QUEUED']
    accepted: Literal[False]

# Closed extension contracts. New operations require a versioned, qualified profile.
class FontStyle(DTO):
    family_profile: Id
    size_centipoints: Annotated[int,Field(ge=100,le=40000)]
    bold: bool
    italic: bool
    color_rgb: Annotated[str,Field(pattern=r'^[0-9A-F]{6}$')]

class TextRun(DTO):
    segment: Segment
    style: FontStyle

class Box(DTO):
    x_emu: NonNeg
    y_emu: NonNeg
    width_emu: Annotated[int,Field(gt=0,le=2**53-1)]
    height_emu: Annotated[int,Field(gt=0,le=2**53-1)]

class TextShape(DTO):
    kind: Literal['text']
    object_id: Opaque
    box: Box
    runs: Annotated[list[TextRun],Field(min_length=1,max_length=256)]
    alignment: Literal['LEFT','CENTER','RIGHT']
    line_spacing_percent: Annotated[int,Field(ge=80,le=300)]
    paragraph_after_centipoints: Annotated[int,Field(ge=0,le=40000)]

class ImageShape(DTO):
    kind: Literal['image']
    object_id: Opaque
    box: Box
    asset_slot_id: Opaque
    fit: Literal['CONTAIN']

class TableShape(DTO):
    kind: Literal['table']
    object_id: Opaque
    box: Box
    columns: Annotated[list[Text],Field(min_length=1,max_length=32)]
    rows: Annotated[list[list[list[Segment]]],Field(min_length=1,max_length=1000)]
    style_profile: Id

class ChartShape(DTO):
    kind: Literal['chart']
    object_id: Opaque
    box: Box
    dataset_slot_id: Opaque
    chart_type: Literal['BAR','LINE','SCATTER']
    style_profile: Id

ArtifactShape = Annotated[TextShape|ImageShape|TableShape|ChartShape,Field(discriminator='kind')]

class SlidePlan(DTO):
    slide_id: Opaque
    layout_profile: Id
    objects: Annotated[list[ArtifactShape],Field(min_length=1,max_length=256)]
    notes: Annotated[list[Segment],Field(max_length=256)]

class PresentationPlan(DTO):
    protocol: Literal['sf.sewe.presentation-plan/1.0']
    mission_id: Opaque
    base_artifact_sha256: Digest
    template_sha256: Digest
    width_emu: Annotated[int,Field(gt=0,le=2**53-1)]
    height_emu: Annotated[int,Field(gt=0,le=2**53-1)]
    slides: Annotated[list[SlidePlan],Field(min_length=1,max_length=256)]

class AssetBinding(DTO):
    slot_id: Opaque
    mission_id: Opaque
    resource: ResourceRef
    allowed_object_ids: Annotated[list[Opaque],Field(min_length=1,max_length=256)]
    content_kind: Literal['IMAGE','TABULAR_DATA','NATIVE_TEMPLATE']

class ObjectChange(DTO):
    object_id: Opaque
    operation: Literal['CAD_MOVE_ENTITY','CAD_SET_DIMENSION','PCB_MOVE_COMPONENT','PCB_RENAME_LABEL','PCB_SET_TRACK_WIDTH']
    coordinates: Annotated[list[Quantity],Field(max_length=3)]
    value: Quantity|None
    label_slot_id: Opaque|None

class ObjectPatch(DTO):
    protocol: Literal['sf.sewe.object-patch/1.0']
    mission_id: Opaque
    parent_sha256: Digest
    library_manifest_sha256: Digest
    changes: Annotated[list[ObjectChange],Field(min_length=1,max_length=2048)]
    mandatory_validators: Annotated[list[Id],Field(min_length=1,max_length=32)]

class EffectLease(DTO):
    protocol: Literal['sf.sewe.effect-lease/1.0']
    lease_id: Opaque
    mission_id: Opaque
    assignment_epoch: NonNeg
    command_sha256: Digest
    source_binding_sha256: Digest
    adapter_profile: Id
    expires_utc: Utc
    maximum_uses: Literal[1]
    authority_ref: Id
    signature_hex: Annotated[str,Field(pattern=r'^[0-9a-f]{128}$')]

class ProtectedFact(DTO):
    rule_id: Id
    kind: Literal['LITERAL','ATTRIBUTE','RELATION','COMBINATION']
    field_ids: Annotated[list[Id],Field(min_length=1,max_length=128)]
    classification_basis_ref: Id
    attack_catalog_refs: Annotated[list[Id],Field(max_length=128)]

class ProtectedFactCatalog(DTO):
    protocol: Literal['sf.sewe.protected-facts/1.0']
    source_bundle_sha256: Digest
    rules: Annotated[list[ProtectedFact],Field(min_length=1,max_length=4096)]
    completeness_review_ref: Id|None

class DisclosureHistoryItem(DTO):
    permit_id: Opaque
    mission_id: Opaque
    request_sha256: Digest
    audience: Id
    known_disclosure_tags: Annotated[list[Id],Field(max_length=256)]
    observed_at_utc: Utc
    transmission: Literal['RESERVED','DELIVERY_UNKNOWN','CONFIRMED','NOT_SENT']

class DisclosureHistory(DTO):
    protocol: Literal['sf.sewe.disclosure-history/1.0']
    policy_scope_ref: Id
    policy_epoch: NonNeg
    entries: Annotated[list[DisclosureHistoryItem],Field(max_length=10000)]
    archive_refs: Annotated[list[ResourceRef],Field(max_length=256)]

class NetworkBinding(DTO):
    binding_id: Id
    purpose: Literal['G2_INTERNAL','G3_PROVIDER','SOURCE','CUSTODY','KEY_SERVICE']
    endpoint_uri: Annotated[str,Field(min_length=1,max_length=1024)]
    authentication_profile_ref: Id
    network_policy_ref: Id
    qualification_ref: Id|None
    enabled: bool

class RuntimeConfig(DTO):
    contract_version: Literal['1.0.0']
    mode: Literal['OFFLINE','BOUND_NOT_QUALIFIED','QUALIFIED_LIVE']
    bindings: Annotated[list[NetworkBinding],Field(max_length=64)]
    enabled_module_ids: Annotated[list[Id],Field(min_length=1,max_length=64)]
    worker_concurrency: Annotated[int,Field(ge=1,le=64)]
    local_concurrency_per_model: Annotated[int,Field(ge=1,le=8)]
    max_rounds: Annotated[int,Field(ge=1,le=100)]
    max_pending_jobs: Annotated[int,Field(ge=1,le=10000)]
    max_permit_lifetime_seconds: Annotated[int,Field(ge=1,le=3600)]
    max_clock_skew_seconds: Annotated[int,Field(ge=0,le=30)]
    private_retention_profile_ref: Id
    shutdown_grace_ms: Annotated[int,Field(ge=0,le=300000)]

class CodeProposal(DTO):
    protocol: Literal['sf.sewe.code-proposal/1.0']
    mission_id: Opaque
    target_object_id: Opaque
    base_sha256: Digest
    language_profile: Id
    format: Literal['UNIFIED_DIFF_UTF8','COMPLETE_FILE_UTF8']
    code_text: Annotated[str,Field(min_length=1,max_length=1048576)]
    required_validator_profiles: Annotated[list[Id],Field(min_length=1,max_length=32)]

ArtifactProposal = Annotated[PresentationPlan|StyleDelta|ObjectPatch|CodeProposal,Field(discriminator='protocol')]

class ArtifactReply(DTO):
    protocol: Literal['sf.sewe.artifact-reply/1.0']
    mission_id: Opaque
    round: Annotated[int,Field(ge=0,le=100)]
    base_candidate_rev: Id
    work_type: Id
    work_revision: Version
    completion: Literal['COMPLETE_CANDIDATE','PARTIAL']
    proposal: ArtifactProposal
    missing_evidence: Annotated[list[MissingEvidence],Field(max_length=128)]

class ParsedWorkerOutput(DTO):
    document_reply: WorkerReply|None
    artifact_reply: ArtifactReply|None
    @model_validator(mode='after')
    def check_variant(self):
        if (self.document_reply is None)==(self.artifact_reply is None):
            raise ValueError('WORKER_OUTPUT_VARIANT')
        return self
