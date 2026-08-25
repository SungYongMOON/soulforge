// Evaluation-only Soulforge Engineering Answer Lane: public synthetic interface tests.
//
// Every corpus, question, and model response is synthetic. No private source bytes, no homefield
// benchmark question, no crosswalk, rubric, evaluator gold, or prior answer is read here.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SYNTHETIC_EXTRACTION,
  SYNTHETIC_QUESTION,
  SYNTHETIC_SOURCES,
  benchmarkPin,
  composeCalls,
  derivedTextWithPreamble,
  fakeAnswerModel,
  laneInput as buildLaneInput,
  preambleBullets,
  sha256,
  singlePageDerivedText,
  sourceSetContract,
} from '../fixtures/se_core_sourcebound_synthetic_corpus.mjs';
import {
  ANSWER_LANE_ID,
  ANSWER_LANE_POLICY_REVISION,
  CODES as LANE_CODES,
  OUTPUT_SAFETY_REASONS,
  RECEIPT_SCHEMA_VERSION,
  STRUCTURAL_LIMIT,
  canonicalSeCoreSourceboundAnswerJson,
  canonicalSeCoreSourceboundReceiptJson,
  runSeCorePinnedBenchmarkAnswerLane,
  runSeCoreSourceboundAnswerLane,
  seCoreSourceCohortSha256,
  seCoreSourceSetContractSha256,
} from '../evaluation/se_core_sourcebound_answer_lane.mjs';
import { canonicalise } from '../../../core/validators/canonical.mjs';
import { CODES as KERNEL_CODES, ContractError } from '../../../core/validators/errors.mjs';

const laneInput = (question) => buildLaneInput({
  commitment: seCoreSourceSetContractSha256,
  ...(question === undefined ? {} : { question }),
});

/** Runs one mutated invocation and asserts the shared fail-closed HOLD invariants. */
async function holdFor(mutate, behaviour = {}) {
  const answerModel = fakeAnswerModel(behaviour);
  const input = laneInput();
  mutate(input);
  const { answer, receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  assert.equal(answer, null, 'a refused run must not render an answer');
  assert.equal(receipt.result, 'HOLD');
  assert.equal(receipt.answer_rendered, false);
  assert.equal(receipt.claim_ceiling, 'observed');
  for (const flag of Object.values(receipt.authority)) assert.equal(flag, false);
  assert.equal(receipt.writes.filesystem_writes, 0);
  assert.equal(receipt.writes.erp_writes, 0);
  return { code: receipt.blocker_code, receipt, answerModel };
}

const composeWith = (response) => ({ compose: () => response });

/** A duplicate descriptor with no object shared with its original: an alias is refused input. */
const copyDescriptor = (descriptor) => ({
  ...descriptor,
  derived_text_bytes: Buffer.from(descriptor.derived_text_bytes),
  approval: { ...descriptor.approval },
  permissions: { ...descriptor.permissions },
});

test('the model selects bounded host statements instead of authoring answer prose', async () => {
  const answerModel = fakeAnswerModel({
    compose: (request) => ({
      schema_version: 'soulforge.se_core_sourcebound_statement_selection.v0',
      result: 'answer',
      propositions: [{ statement_id: request.statements[0].statement_id, relation: 'direct' }],
    }),
  });
  const run = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });

  assert.equal(run.receipt.result, 'PASS');
  assert.deepEqual(Object.keys(answerModel.calls[0].request.statements[0]).sort(), [
    'excerpt', 'statement_id',
  ]);
  assert.equal(run.answer.model_authored_prose_present, false);
  assert.equal(run.answer.sections[0].text.endsWith(
    answerModel.calls[0].request.statements[0].excerpt,
  ), true);
});

test('an exact four-source Korean question renders a cited Korean structured answer', async () => {
  const answerModel = fakeAnswerModel();
  const run = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  const { answer, receipt } = run;

  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.schema_version, RECEIPT_SCHEMA_VERSION);
  assert.equal(receipt.lane_id, ANSWER_LANE_ID);
  assert.equal(receipt.lane_kind, 'evaluation_only_sourcebound_answer_lane');
  assert.equal(receipt.policy_revision, ANSWER_LANE_POLICY_REVISION);
  assert.equal(receipt.structural_limit, STRUCTURAL_LIMIT);
  assert.equal(answer.language, 'ko+source-original');
  assert.equal(answer.model_authored_prose_present, false);
  assert.equal(answer.rendering_mode, 'host_korean_labels_exact_source_excerpts');
  assert.equal(answer.claim_ceiling, 'observed');
  assert.equal(answer.candidate_disposition, 'external_advisory_candidate');
  assert.deepEqual(answer.authority_actions, []);
  assert.ok(answer.sections.length >= 1);

  const allowed = new Set(answer.evidence.map((item) => item.evidence_id));
  assert.ok(allowed.size >= 1);
  for (const section of answer.sections) {
    assert.ok(section.citations.length >= 1, 'every rendered block cites retrieved evidence');
    for (const citation of section.citations) {
      assert.ok(allowed.has(citation.evidence_id));
      assert.ok(Number.isSafeInteger(citation.page_number) && citation.page_number >= 1);
      assert.equal(typeof citation.title, 'string');
      assert.equal(typeof citation.revision, 'string');
    }
  }
  for (const item of answer.evidence) {
    assert.match(item.source_pdf_sha256, /^[0-9a-f]{64}$/u);
    assert.match(item.derived_text_sha256, /^[0-9a-f]{64}$/u);
  }

  assert.equal(receipt.retrieval.searched_source_count, 4);
  assert.equal(receipt.retrieval.per_source.length, 4);
  assert.equal(receipt.source_set.source_count, 4);
  assert.equal(receipt.question.sha256, sha256(Buffer.from(SYNTHETIC_QUESTION, 'utf8')));
  assert.equal(receipt.question.bytes, Buffer.byteLength(SYNTHETIC_QUESTION, 'utf8'));
  assert.equal(receipt.writes.filesystem_writes, 0);
  assert.equal(receipt.writes.erp_writes, 0);
  assert.equal(receipt.writes.network_calls_from_lane, 0);
  assert.equal(receipt.writes.notebook_calls, 0);
  assert.equal(receipt.model.invocation_count, 1);
  assert.equal(composeCalls(answerModel), 1);
  assert.equal(receipt.query_expansion.posture, 'not_requested');
  assert.equal(receipt.query_expansion.authoritative, false);
  assert.equal(receipt.claim_ceiling, 'observed');
  assert.equal(receipt.candidate_disposition, 'external_advisory_candidate');
  for (const flag of Object.values(receipt.authority)) assert.equal(flag, false);
  assert.equal(
    receipt.prompt_commitment.evidence_commitments.length,
    receipt.prompt_commitment.evidence_ids.length,
  );
  assert.equal(
    receipt.prompt_commitment.statement_commitments.length,
    receipt.prompt_commitment.evidence_ids.length,
  );
  for (const commitment of receipt.prompt_commitment.statement_commitments) {
    assert.deepEqual(Object.keys(commitment).sort(), [
      'evidence_id', 'excerpt_byte_length', 'excerpt_sha256', 'statement_id',
    ]);
    assert.match(commitment.statement_id, /^S[1-9][0-9]*$/u);
    assert.match(commitment.excerpt_sha256, /^[0-9a-f]{64}$/u);
    assert.ok(commitment.excerpt_byte_length >= 1 && commitment.excerpt_byte_length <= 2700);
    assert.equal(Object.hasOwn(commitment, 'excerpt'), false);
  }
  assert.equal(receipt.output.evidence_section_count, answer.sections.length);
  assert.equal(receipt.output.uncited_evidence_section_count, 0);
  assert.equal(receipt.output.html_present, false);
  assert.equal(receipt.output.model_authored_prose_present, false);
  assert.equal(receipt.output.content_verification, 'exact_host_evidence_projection');
  assert.equal(receipt.output.selection_correctness, 'unknown');
  assert.equal(canonicalSeCoreSourceboundAnswerJson(run).endsWith('\n'), true);
  assert.equal(receipt.output.answer_sha256, sha256(canonicalSeCoreSourceboundAnswerJson(run)));
});

test('the same exact inputs render byte-identical answer and receipt commitments', async () => {
  const first = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel: fakeAnswerModel() });
  const second = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel: fakeAnswerModel() });
  assert.equal(
    canonicalSeCoreSourceboundAnswerJson(first),
    canonicalSeCoreSourceboundAnswerJson(second),
  );
  assert.equal(
    canonicalSeCoreSourceboundReceiptJson(first),
    canonicalSeCoreSourceboundReceiptJson(second),
  );
});

test('the model sees only the exact question, host excerpts, and the closed policy', async () => {
  const answerModel = fakeAnswerModel();
  await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  const { request } = answerModel.calls[0];
  assert.deepEqual(
    Object.keys(request).sort(),
    ['instruction', 'language', 'output_schema', 'policy_revision', 'question_text', 'statements'],
  );
  assert.equal(request.question_text, SYNTHETIC_QUESTION);
  assert.ok(request.statements.length >= 1 && request.statements.length <= 6);
  for (const statement of request.statements) {
    assert.deepEqual(Object.keys(statement).sort(), ['excerpt', 'statement_id']);
    assert.equal(Object.getPrototypeOf(statement), Object.prototype);
    assert.match(statement.statement_id, /^S[1-9][0-9]*$/u);
    assert.equal(typeof statement.excerpt, 'string');
    assert.equal(Object.isFrozen(statement), true);
  }
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.statements), true);
  assert.equal(Object.isFrozen(request.output_schema), true);
});

// The citation metadata is the machine's, not the model's. The model sees exact source excerpts
// under opaque ids; the host binds each selected id back to the title, revision, page, and byte
// commitments it kept. Those separate metadata fields buy the selector nothing and stay outside
// its request even when the exact source prose naturally mentions a title, revision, or page.
test('no separate machine-owned citation metadata field reaches the model, and host binding is unchanged', async () => {
  const answerModel = fakeAnswerModel();
  const input = laneInput();
  const run = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  const visible = JSON.stringify(answerModel.calls[0].request);
  for (const source of input.corpus.sources) {
    for (const owned of [
      source.title, source.revision, source.source_id,
      source.source_pdf_sha256, source.derived_text_sha256,
    ]) {
      assert.equal(visible.includes(owned), false, `${source.source_id}: ${owned.slice(0, 24)}`);
    }
  }
  for (const key of [
    'source_title', 'source_revision', 'page_number', 'source_id', 'title', 'revision',
    'chunk_id', 'chunk_sha256', 'source_pdf_sha256', 'derived_text_sha256',
  ]) {
    assert.equal(visible.includes(`"${key}"`), false, key);
  }

  const byId = new Map(input.corpus.sources.map((source) => [source.source_id, source]));
  const cited = new Map(run.answer.evidence.map((item) => [item.evidence_id, item]));
  const commitments = new Map(run.receipt.prompt_commitment.evidence_commitments.map(
    (commitment) => [commitment.evidence_id, commitment],
  ));
  let bound = 0;
  for (const section of run.answer.sections) {
    for (const citation of section.citations) {
      const source = byId.get(citation.source_id);
      assert.ok(source !== undefined, citation.evidence_id);
      assert.equal(citation.title, source.title);
      assert.equal(citation.revision, source.revision);
      assert.equal(citation.page_number, commitments.get(citation.evidence_id).page_number);
      assert.equal(cited.get(citation.evidence_id).source_pdf_sha256, source.source_pdf_sha256);
      assert.equal(cited.get(citation.evidence_id).derived_text_sha256, source.derived_text_sha256);
      bound += 1;
    }
  }
  assert.ok(bound >= 1, 'the run must actually bind at least one citation');
  assert.equal(run.answer.evidence.length <= run.receipt.output.retrieved_evidence_count, true,
    'retrieved-but-uncited evidence is never auto-cited');
});

test('a host statement id is the only selection currency the model can spend', async () => {
  for (const [label, propositions, code] of [
    ['a foreign statement id', [{ statement_id: 'S99', relation: 'direct' }],
      LANE_CODES.CITATION_UNBOUND],
    ['a chunk id', [{ statement_id: 'syn_alpha_practice_guide_p1_c1', relation: 'direct' }],
      LANE_CODES.CITATION_UNBOUND],
    ['a repeated id', [
      { statement_id: 'S1', relation: 'direct' },
      { statement_id: 'S1', relation: 'support' },
    ], LANE_CODES.CITATION_UNBOUND],
    ['no id at all', [], LANE_CODES.MODEL_OUTPUT_INVALID],
  ]) {
    const refused = await holdFor(() => {}, composeWith(answerSelection(propositions)));
    assert.equal(refused.code, code, label);
  }
});

test('source-set ambiguity is refused: missing, extra, duplicate, and reordered members', async () => {
  const dropped = await holdFor((input) => {
    input.corpus.sourceSetContract.sources.pop();
    input.corpus.sources.pop();
  });
  assert.equal(dropped.code, LANE_CODES.SOURCE_SET_INVALID);

  const extra = await holdFor((input) => {
    input.corpus.sourceSetContract.sources.push({ ...input.corpus.sourceSetContract.sources[0] });
    input.corpus.sources.push(copyDescriptor(input.corpus.sources[0]));
  });
  assert.equal(extra.code, LANE_CODES.SOURCE_SET_INVALID);

  const duplicated = await holdFor((input) => {
    input.corpus.sourceSetContract.sources[1] = { ...input.corpus.sourceSetContract.sources[0] };
    input.corpus.sources[1] = copyDescriptor(input.corpus.sources[0]);
  });
  assert.equal(duplicated.code, LANE_CODES.SOURCE_SET_INVALID);

  const reorderedContract = await holdFor((input) => {
    const pinned = input.corpus.sourceSetContract.sources;
    [pinned[0], pinned[1]] = [pinned[1], pinned[0]];
    const runtime = input.corpus.sources;
    [runtime[0], runtime[1]] = [runtime[1], runtime[0]];
    input.corpus.expectedSourceSetSha256 = seCoreSourceSetContractSha256(
      input.corpus.sourceSetContract,
    );
  });
  assert.equal(reorderedContract.code, LANE_CODES.SOURCE_SET_INVALID);

  const reorderedRuntime = await holdFor((input) => {
    const runtime = input.corpus.sources;
    [runtime[0], runtime[1]] = [runtime[1], runtime[0]];
  });
  assert.equal(reorderedRuntime.code, LANE_CODES.SOURCE_SET_INVALID);
});

test('a PDF pin drift and a one-byte derived-text drift both refuse the run', async () => {
  const descriptorDrift = await holdFor((input) => {
    input.corpus.sources[2].source_pdf_sha256 = sha256('a different pdf');
  });
  assert.equal(descriptorDrift.code, LANE_CODES.SOURCE_SET_INVALID);

  const staleCommitment = await holdFor((input) => {
    const drifted = sha256('a different pdf');
    input.corpus.sourceSetContract.sources[2].source_pdf_sha256 = drifted;
    input.corpus.sources[2].source_pdf_sha256 = drifted;
  });
  assert.equal(staleCommitment.code, LANE_CODES.SOURCE_SET_PIN_INVALID);
  assert.match(staleCommitment.receipt.computed_source_set_sha256, /^[0-9a-f]{64}$/u);

  const oneByte = await holdFor((input) => {
    const bytes = Buffer.from(input.corpus.sources[0].derived_text_bytes);
    bytes[bytes.length - 2] ^= 0x01;
    input.corpus.sources[0].derived_text_bytes = bytes;
  });
  assert.equal(oneByte.code, LANE_CODES.DERIVED_TEXT_PIN_INVALID);

  const declaredDrift = await holdFor((input) => {
    const drifted = sha256('a different derived text');
    input.corpus.sourceSetContract.sources[1].derived_text_sha256 = drifted;
    input.corpus.sources[1].derived_text_sha256 = drifted;
    input.corpus.expectedSourceSetSha256 = seCoreSourceSetContractSha256(
      input.corpus.sourceSetContract,
    );
  });
  assert.equal(declaredDrift.code, LANE_CODES.DERIVED_TEXT_PIN_INVALID);
});

test('the source-set contract carries its own verified canonical commitment', async () => {
  const contract = sourceSetContract(laneInput().corpus.sources);
  const shuffled = { ...contract, sources: [...contract.sources].reverse() };
  assert.equal(
    seCoreSourceSetContractSha256(contract),
    seCoreSourceSetContractSha256(shuffled),
    'the commitment is over the member set, not its listing order',
  );

  const badPin = await holdFor((input) => {
    input.corpus.expectedSourceSetSha256 = sha256('not the contract');
  });
  assert.equal(badPin.code, LANE_CODES.SOURCE_SET_PIN_INVALID);

  const renamedSet = await holdFor((input) => {
    input.corpus.sourceSetContract.source_set_id = 'syn_other_set';
  });
  assert.equal(renamedSet.code, LANE_CODES.SOURCE_SET_PIN_INVALID);

  const wrongSchema = await holdFor((input) => {
    input.corpus.sourceSetContract.schema_version = 'soulforge.something_else.v0';
  });
  assert.equal(wrongSchema.code, LANE_CODES.SOURCE_SET_INVALID);
});

test('approval and permission posture must be sufficient for public-source analysis', async () => {
  const unapproved = await holdFor((input) => {
    input.corpus.sources[0].approval.approval_status = 'unreviewed_download';
  });
  assert.equal(unapproved.code, LANE_CODES.SOURCE_SET_INVALID);

  const reuseUnreviewed = await holdFor((input) => {
    input.corpus.sources[0].approval.reuse_rights_reviewed = false;
  });
  assert.equal(reuseUnreviewed.code, LANE_CODES.SOURCE_SET_INVALID);

  const promotionClaimed = await holdFor((input) => {
    input.corpus.sources[3].permissions.canon_promotion = true;
  });
  assert.equal(promotionClaimed.code, LANE_CODES.SOURCE_SET_INVALID);

  const uploadClaimed = await holdFor((input) => {
    input.corpus.sources[3].permissions.external_upload = true;
  });
  assert.equal(uploadClaimed.code, LANE_CODES.SOURCE_SET_INVALID);
});

test('question hash, byte-length, and type drift are all refused', async () => {
  const hashDrift = await holdFor((input) => {
    input.expectedQuestionSha256 = sha256('another question');
  });
  assert.equal(hashDrift.code, LANE_CODES.QUESTION_PIN_INVALID);

  const byteDrift = await holdFor((input) => { input.expectedQuestionBytes += 1; });
  assert.equal(byteDrift.code, LANE_CODES.QUESTION_PIN_INVALID);

  const notBuffer = await holdFor((input) => { input.questionBytes = 'plain text question'; });
  assert.equal(notBuffer.code, LANE_CODES.QUESTION_PIN_INVALID);
});

test('malformed UTF-8, non-NFC, control, and oversize questions are refused', async () => {
  const pinnedTo = (bytes) => (input) => {
    input.questionBytes = bytes;
    input.expectedQuestionSha256 = sha256(bytes);
    input.expectedQuestionBytes = bytes.length;
  };

  const malformed = await holdFor(pinnedTo(Buffer.from([0xff, 0xfe, 0x41, 0x42])));
  assert.equal(malformed.code, LANE_CODES.QUESTION_TEXT_INVALID);

  const nonNfc = await holdFor(pinnedTo(
    Buffer.from('\u1100\u1161 verification criteria 설명', 'utf8'),
  ));
  assert.equal(nonNfc.code, LANE_CODES.QUESTION_TEXT_INVALID);

  const control = await holdFor(pinnedTo(Buffer.from('verification\u0007criteria', 'utf8')));
  assert.equal(control.code, LANE_CODES.QUESTION_TEXT_INVALID);

  const oversize = await holdFor(pinnedTo(
    Buffer.from(`verification ${'가'.repeat(4000)}`, 'utf8'),
  ));
  assert.equal(oversize.code, LANE_CODES.QUESTION_PIN_INVALID);

  // Path-shaped fixtures are composed from fragments so the file that proves the guard works
  // does not itself carry a local absolute path. The runtime value is unchanged.
  const pathBearing = await holdFor(pinnedTo(
    Buffer.from(`${'C:'}/Soulforge/_workspaces/x criteria 설명`, 'utf8'),
  ));
  assert.equal(pathBearing.code, LANE_CODES.QUESTION_TEXT_INVALID);
});

test('the declared evaluation scope must stay evaluation-only and authority-free', async () => {
  const notEvaluation = await holdFor((input) => { input.scope.evaluation_only = false; });
  assert.equal(notEvaluation.code, LANE_CODES.SCOPE_INVALID);

  for (const field of [
    'actual_project_data_included', 'private_data_included', 'authority_to_approve',
    'authority_to_create_task', 'authority_to_promote_canon', 'action_execution_allowed',
  ]) {
    const escalated = await holdFor((input) => { input.scope[field] = true; });
    assert.equal(escalated.code, LANE_CODES.SCOPE_INVALID, field);
  }

  const impossibleDay = await holdFor((input) => { input.scope.point_in_time = '2026-02-30'; });
  assert.equal(impossibleDay.code, LANE_CODES.SCOPE_INVALID);

  const noPointInTime = await holdFor((input) => { input.scope.point_in_time = 'recently'; });
  assert.equal(noPointInTime.code, LANE_CODES.SCOPE_INVALID);
});

test('crosswalk, rubric, gold, prior answers, and Notebook material are forbidden inputs', async () => {
  for (const field of [
    'crosswalk', 'rubric', 'evaluator_gold', 'answer_key', 'expected_answer', 'prior_answer',
    'prior_review', 'notebook_output', 'notebooklm_answer', 'question_set', 'page_hints', 'oracle',
  ]) {
    const refused = await holdFor((input) => { input.scope[field] = 'x'; });
    assert.equal(refused.code, LANE_CODES.FORBIDDEN_PARTICIPANT_INPUT, field);
  }
  for (const field of ['secret', 'token', 'account_id', 'absolute_path', 'session_id', 'prompt']) {
    const refused = await holdFor((input) => { input.retrieval[field] = 'x'; });
    assert.equal(refused.code, LANE_CODES.FORBIDDEN_PARTICIPANT_INPUT, field);
  }
  const leakedPath = await holdFor((input) => {
    input.corpus.sourceSetContract.sources[0].title = `${'C:'}/Soulforge/_workspaces/a.pdf`;
  });
  assert.equal(leakedPath.code, LANE_CODES.FORBIDDEN_PARTICIPANT_INPUT);
});

test('closed schemas, prototypes, accessors, sparse arrays, aliases, and cycles are refused', async () => {
  const extraKey = await holdFor((input) => { input.unexpected = true; });
  assert.equal(extraKey.code, LANE_CODES.INPUT_INVALID);

  const missingKey = await holdFor((input) => { delete input.retrieval; });
  assert.equal(missingKey.code, LANE_CODES.INPUT_INVALID);

  const closedRetrieval = await holdFor((input) => { input.retrieval.top_k = 4; });
  assert.equal(closedRetrieval.code, LANE_CODES.INPUT_INVALID);

  const closedCorpus = await holdFor((input) => { input.corpus.extra_index = 'x'; });
  assert.equal(closedCorpus.code, LANE_CODES.SOURCE_SET_INVALID);

  const prototyped = await holdFor((input) => {
    input.retrieval = Object.assign(Object.create({ inherited: true }), input.retrieval);
  });
  assert.equal(prototyped.code, LANE_CODES.INPUT_INVALID);

  const accessor = await holdFor((input) => {
    Object.defineProperty(input.scope, 'point_in_time', {
      get: () => '2026-08-13', enumerable: true, configurable: true,
    });
  });
  assert.equal(accessor.code, LANE_CODES.INPUT_INVALID);

  const sparse = await holdFor((input) => { delete input.corpus.sources[2]; });
  assert.equal(sparse.code, LANE_CODES.INPUT_INVALID);

  const namedArrayProperty = await holdFor((input) => { input.corpus.sources.extra = 'x'; });
  assert.equal(namedArrayProperty.code, LANE_CODES.INPUT_INVALID);

  const aliased = await holdFor((input) => {
    input.corpus.sources[1].approval = input.corpus.sources[0].approval;
  });
  assert.equal(aliased.code, LANE_CODES.INPUT_INVALID);

  const cyclic = await holdFor((input) => { input.scope.self = input.scope; });
  assert.equal(cyclic.code, LANE_CODES.INPUT_INVALID);

  const notAnObject = await runSeCoreSourceboundAnswerLane([], { answerModel: fakeAnswerModel() });
  assert.equal(notAnObject.receipt.blocker_code, LANE_CODES.INPUT_INVALID);
  assert.equal(notAnObject.answer, null);
});

test('proxy-backed inputs, adapters, and model responses are refused before traps can run', async () => {
  const proxyOf = (target, trapCounter) => new Proxy(target, {
    getPrototypeOf(value) { trapCounter.count += 1; return Reflect.getPrototypeOf(value); },
    ownKeys(value) { trapCounter.count += 1; return Reflect.ownKeys(value); },
    getOwnPropertyDescriptor(value, key) {
      trapCounter.count += 1;
      return Reflect.getOwnPropertyDescriptor(value, key);
    },
    apply(value, receiver, args) {
      trapCounter.count += 1;
      return Reflect.apply(value, receiver, args);
    },
  });

  for (const [label, build] of [
    ['root invocation', () => {
      const counter = { count: 0 };
      const answerModel = fakeAnswerModel();
      return {
        counter,
        answerModel,
        run: () => runSeCoreSourceboundAnswerLane(proxyOf(laneInput(), counter), { answerModel }),
      };
    }],
    ['nested invocation value', () => {
      const counter = { count: 0 };
      const input = laneInput();
      input.retrieval = proxyOf(input.retrieval, counter);
      const answerModel = fakeAnswerModel();
      return { counter, answerModel, run: () => runSeCoreSourceboundAnswerLane(input, { answerModel }) };
    }],
    ['model context', () => {
      const counter = { count: 0 };
      const answerModel = fakeAnswerModel();
      return {
        counter,
        answerModel,
        run: () => runSeCoreSourceboundAnswerLane(
          laneInput(), proxyOf({ answerModel }, counter),
        ),
      };
    }],
    ['answer model', () => {
      const counter = { count: 0 };
      const answerModel = fakeAnswerModel();
      return {
        counter,
        answerModel,
        run: () => runSeCoreSourceboundAnswerLane(
          laneInput(), { answerModel: proxyOf(answerModel, counter) },
        ),
      };
    }],
    ['adapter descriptor', () => {
      const counter = { count: 0 };
      const answerModel = fakeAnswerModel();
      answerModel.descriptor = proxyOf(answerModel.descriptor, counter);
      return { counter, answerModel, run: () => runSeCoreSourceboundAnswerLane(laneInput(), { answerModel }) };
    }],
    ['adapter function', () => {
      const counter = { count: 0 };
      const answerModel = fakeAnswerModel();
      answerModel.composeAnswer = proxyOf(answerModel.composeAnswer, counter);
      return { counter, answerModel, run: () => runSeCoreSourceboundAnswerLane(laneInput(), { answerModel }) };
    }],
  ]) {
    const { counter, answerModel, run } = build();
    const result = await run();
    assert.equal(result.receipt.result, 'HOLD', label);
    assert.equal(result.receipt.model.invocation_count, 0, label);
    assert.equal(composeCalls(answerModel), 0, label);
    assert.equal(counter.count, 0, `${label}: no proxy trap may run`);
  }

  const responseCounter = { count: 0 };
  const proxiedResponse = proxyOf(answerSelection(), responseCounter);
  const responseModel = fakeAnswerModel({ compose: () => proxiedResponse });
  const responseRun = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: responseModel,
  });
  assert.equal(responseRun.receipt.blocker_code, LANE_CODES.MODEL_OUTPUT_INVALID);
  assert.equal(responseRun.receipt.model.answer_invocation_count, 1);
  assert.equal(responseCounter.count, 0, 'model response proxy traps never run');
});

test('a canonical own __proto__ data property is a plain key, not a prototype write', async () => {
  const injected = JSON.parse(
    '{"__proto__":{"polluted":true},"evaluation_only":true,"point_in_time":"2026-08-13",'
    + '"actual_project_data_included":false,"private_data_included":false,'
    + '"authority_to_approve":false,"authority_to_create_task":false,'
    + '"authority_to_promote_canon":false,"action_execution_allowed":false}',
  );
  assert.equal(Object.getPrototypeOf(injected), Object.prototype);
  assert.equal(Object.hasOwn(injected, '__proto__'), true);
  const refused = await holdFor((input) => { input.scope = injected; });
  assert.equal(refused.code, LANE_CODES.SCOPE_INVALID);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.polluted, undefined);
});

test('derived text must be page-aware Markdown within the pinned page count', async () => {
  const repin = (input, index, text) => {
    const bytes = Buffer.from(text, 'utf8');
    const digest = sha256(bytes);
    input.corpus.sources[index].derived_text_bytes = bytes;
    input.corpus.sources[index].derived_text_sha256 = digest;
    input.corpus.sourceSetContract.sources[index].derived_text_sha256 = digest;
    input.corpus.expectedSourceSetSha256 = seCoreSourceSetContractSha256(
      input.corpus.sourceSetContract,
    );
  };
  const cases = [
    'verification criteria without any page heading\n',
    'preamble text\n\n## Page 1\n\nverification criteria\n',
    '## Page 1\n\nverification\n\n## Page 1\n\ncriteria\n',
    '## Page 2\n\nverification\n\n## Page 1\n\ncriteria\n',
    '## Page 9\n\nverification criteria\n',
    '## Page 0\n\nverification criteria\n',
    '## Page 1\n\n\n',
  ];
  for (const text of cases) {
    const refused = await holdFor((input) => repin(input, 0, text));
    assert.equal(refused.code, LANE_CODES.DERIVED_TEXT_MALFORMED, text.slice(0, 28));
  }
  const nonUtf8 = await holdFor((input) => {
    const bytes = Buffer.from([0x23, 0x23, 0x20, 0x50, 0x61, 0x67, 0x65, 0x20, 0x31, 0x0a, 0xff]);
    const digest = sha256(bytes);
    input.corpus.sources[0].derived_text_bytes = bytes;
    input.corpus.sources[0].derived_text_sha256 = digest;
    input.corpus.sourceSetContract.sources[0].derived_text_sha256 = digest;
    input.corpus.expectedSourceSetSha256 = seCoreSourceSetContractSha256(
      input.corpus.sourceSetContract,
    );
  });
  assert.equal(nonUtf8.code, LANE_CODES.DERIVED_TEXT_MALFORMED);
});

// ------------------------------------------------------------------ metadata preamble
//
// The authorized derived-text artifacts open with a bounded metadata preamble before their first
// page heading. These fixtures reproduce that shape synthetically: no real artifact byte, no real
// title, and no real extraction provenance line is read here.

/** Re-pins one source's derived text everywhere it is committed. */
const repinDerivedText = (input, index, bytes) => {
  const digest = sha256(bytes);
  input.corpus.sources[index].derived_text_bytes = bytes;
  input.corpus.sources[index].derived_text_sha256 = digest;
  input.corpus.sourceSetContract.sources[index].derived_text_sha256 = digest;
  input.corpus.expectedSourceSetSha256 = seCoreSourceSetContractSha256(
    input.corpus.sourceSetContract,
  );
};

/** Rewrites source `index` with a preamble. `options` may be a function of its default bullets. */
const withPreamble = (index, options = {}) => (input) => {
  const descriptor = input.corpus.sources[index];
  const resolved = typeof options === 'function'
    ? options(preambleBullets(descriptor), descriptor)
    : options;
  repinDerivedText(
    input, index, derivedTextWithPreamble(SYNTHETIC_SOURCES[index], descriptor, resolved),
  );
};

const dropKey = (dropped) => (bullets) => ({
  bullets: bullets.filter(([key]) => key !== dropped),
});
const setValue = (target, value) => (bullets) => ({
  bullets: bullets.map(([key, current]) => [key, key === target ? value : current]),
});

test('a real-format metadata preamble is accepted and never indexed as evidence', async () => {
  const plainModel = fakeAnswerModel();
  const plain = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel: plainModel });
  assert.equal(plain.receipt.result, 'PASS');
  assert.equal(
    plain.receipt.source_set.sources.every((source) => source.preamble_present === false),
    true,
    'a synthetic stream with no preamble keeps its existing behaviour',
  );

  const answerModel = fakeAnswerModel();
  const input = laneInput();
  for (let index = 0; index < 4; index += 1) withPreamble(index)(input);
  const run = await runSeCoreSourceboundAnswerLane(input, { answerModel });

  assert.equal(run.receipt.result, 'PASS');
  assert.equal(run.receipt.source_set.sources.every((source) => source.preamble_present), true);
  assert.equal(
    run.receipt.source_set.sources.every((source) => source.preamble_title_matches_pinned_title),
    true,
  );
  // The preamble is metadata about the stream, not content of it: pages, chunk identity, and
  // chunk bytes are the same as the stream without it.
  assert.deepEqual(
    run.receipt.source_set.sources.map(
      (source) => [source.parsed_page_count, source.chunk_count],
    ),
    plain.receipt.source_set.sources.map(
      (source) => [source.parsed_page_count, source.chunk_count],
    ),
  );
  assert.deepEqual(
    run.receipt.prompt_commitment.evidence_commitments.map(
      (commitment) => [commitment.chunk_id, commitment.page_number, commitment.chunk_sha256],
    ),
    plain.receipt.prompt_commitment.evidence_commitments.map(
      (commitment) => [commitment.chunk_id, commitment.page_number, commitment.chunk_sha256],
    ),
  );
  for (const statement of answerModel.calls[0].request.statements) {
    assert.equal(statement.excerpt.includes(SYNTHETIC_EXTRACTION), false);
    assert.equal(/source_pdf_sha256|page_count/u.test(statement.excerpt), false);
  }
  const receiptJson = canonicalSeCoreSourceboundReceiptJson(run);
  assert.equal(receiptJson.includes(SYNTHETIC_EXTRACTION), false);
  assert.equal(receiptJson.includes(SYNTHETIC_SOURCES[0].title), false);
});

test('a preamble is per-stream, so a mixed corpus keeps both accepted shapes', async () => {
  const input = laneInput();
  withPreamble(1)(input);
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(receipt.result, 'PASS');
  assert.deepEqual(
    receipt.source_set.sources.map((source) => source.preamble_present),
    [false, true, false, false],
  );
});

test('an H1 that differs from the pinned title is reported, not refused', async () => {
  // The pinned title is an operator-curated label; the H1 is whatever the extraction step rendered
  // from the document itself. Identity is pinned by source_id, revision, source_pdf_sha256, and
  // page_count, and the H1 bytes are already committed by derived_text_sha256, so a spelling
  // difference is cosmetic. It is recorded, never equated.
  const input = laneInput();
  withPreamble(0, { title: 'Synthetic Systems Engineering Practice Guide (second printing)' })(input);
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.source_set.sources[0].preamble_present, true);
  assert.equal(receipt.source_set.sources[0].preamble_title_matches_pinned_title, false);
  assert.equal(receipt.source_set.sources[1].preamble_title_matches_pinned_title, false);
});

test('a metadata bullet may write its value as one Markdown code span', async () => {
  const input = laneInput();
  withPreamble(0, (bullets) => ({
    bullets: bullets.map(([key, value]) => [key, `\`${value}\``]),
  }))(input);
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.source_set.sources[0].preamble_present, true);
});

test('the metadata preamble is one closed shape, not arbitrary front matter', async () => {
  const malformed = [
    ['missing source_id', dropKey('source_id')],
    ['missing revision', dropKey('revision')],
    ['missing source_pdf_sha256', dropKey('source_pdf_sha256')],
    ['missing page_count', dropKey('page_count')],
    ['missing extraction', dropKey('extraction')],
    ['every bullet missing', () => ({ bullets: [] })],
    ['duplicate key', (bullets) => ({ bullets: [...bullets, ['revision', 'SYN-A rev 1']] })],
    ['unknown key', (bullets) => ({ bullets: [...bullets, ['operator_note', 'looks harmless']] })],
    ['body prose before Page 1', () => ({ trailing: ['', 'unbounded prose before the first page'] })],
    ['a second H1', () => ({ trailing: ['', '# Another Title'] })],
    ['no H1 title', () => ({ omitTitle: true })],
    ['an empty H1 title', () => ({ title: '' })],
    ['an oversized H1 title', () => ({ title: `Synthetic ${'T'.repeat(420)}` })],
    ['an empty value', setValue('extraction', '')],
    ['an oversized value', setValue('extraction', `synthetic ${'x'.repeat(420)}`)],
    ['a non-NFC value', setValue('extraction', 'synthetic \u1100\u1161 extraction')],
    ['a control character', setValue('extraction', 'synthetic\u0007extraction')],
  ];
  for (const [label, options] of malformed) {
    const refused = await holdFor(withPreamble(0, options));
    assert.equal(refused.code, LANE_CODES.DERIVED_TEXT_MALFORMED, label);
  }

  const drifted = [
    ['source_id', setValue('source_id', 'syn_other_practice_guide')],
    ['revision', setValue('revision', 'SYN-A rev 2')],
    ['source_pdf_sha256', setValue('source_pdf_sha256', sha256('a different pdf'))],
    ['page_count', setValue('page_count', '5')],
    ['zero-padded page_count', setValue('page_count', '04')],
  ];
  for (const [label, options] of drifted) {
    const refused = await holdFor(withPreamble(0, options));
    assert.equal(refused.code, LANE_CODES.DERIVED_TEXT_PIN_INVALID, label);
  }

  const leaks = [
    ['a path in extraction', setValue('extraction', `extracted from ${'C:'}/Soulforge/_workspaces/a.pdf`)],
    ['a private plane in extraction', setValue('extraction', 'logged under _workmeta/system/reports')],
    ['a secret in extraction', setValue('extraction', 'token ghp_abcdefghijklmnop was used')],
    ['a URL in extraction', setValue('extraction', 'tool from https://example.org/extractor')],
    ['a project code in extraction', setValue('extraction', 'prepared for P26-014 review')],
    ['a path in the H1 title', () => ({ title: `${'C:'}/Soulforge/_workspaces/a.pdf` })],
  ];
  for (const [label, options] of leaks) {
    const refused = await holdFor(withPreamble(0, options));
    assert.equal(refused.code, LANE_CODES.FORBIDDEN_PARTICIPANT_INPUT, label);
  }
});

test('an empty retrieval refuses rather than answering without evidence', async () => {
  const answerModel = fakeAnswerModel();
  const { answer, receipt } = await runSeCoreSourceboundAnswerLane(
    laneInput('예산 배정 절차와 결재 순서를 알려 주세요.'), { answerModel },
  );
  assert.equal(answer, null);
  assert.equal(receipt.blocker_code, LANE_CODES.RETRIEVAL_EMPTY);
  assert.equal(receipt.model.invocation_count, 0);
  assert.equal(composeCalls(answerModel), 0);
});

test('retrieval budgets stay bounded and every source is searched', async () => {
  const answerModel = fakeAnswerModel();
  const input = laneInput();
  input.retrieval = { max_evidence: 3, max_per_source: 1 };
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.retrieval.searched_source_count, 4);
  assert.equal(receipt.retrieval.per_source.length, 4);
  assert.ok(receipt.retrieval.selected_count <= 3);
  assert.ok(receipt.retrieval.per_source.every((entry) => entry.selected_count <= 1));
  assert.equal(receipt.output.retrieved_evidence_count, receipt.retrieval.selected_count);
  assert.ok(receipt.retrieval.searched_chunk_count >= receipt.retrieval.hit_count);

  const unbounded = await holdFor((request) => {
    request.retrieval = { max_evidence: 999, max_per_source: 2 };
  });
  assert.equal(unbounded.code, LANE_CODES.INPUT_INVALID);
});

test('a model query expansion is advisory, provenance-bound, and never authoritative', async () => {
  const answerModel = fakeAnswerModel();
  const input = laneInput();
  input.queryExpansion = { requested: true, max_terms: 6 };
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.query_expansion.posture, 'model_advisory_shadow');
  assert.equal(receipt.query_expansion.authoritative, false);
  assert.equal(receipt.query_expansion.engine_retrieval, false);
  assert.equal(receipt.query_expansion.ai_assisted_shadow, true);
  assert.equal(receipt.query_expansion.terms_accepted, 2);
  assert.equal(receipt.query_expansion.provenance, 'in_memory_fake_answer_model');
  assert.match(receipt.query_expansion.terms_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.retrieval.advisory_expansion_applied, true);
  assert.equal(receipt.retrieval.exact_query_preserved, true);
  assert.equal(receipt.model.invocation_count, 2);
  assert.equal(receipt.model.expansion_invocation_count, 1);
  assert.equal(receipt.model.answer_invocation_count, 1);
  const expansionRequest = answerModel.calls[0].request;
  assert.equal(expansionRequest.question_text, SYNTHETIC_QUESTION);
  assert.equal(Object.hasOwn(expansionRequest, 'evidence'), false);
});

// The lane declares an advisory ceiling of twelve terms and accepts `max_terms: 12` as a legal
// request. A declared ceiling the lane cannot actually accept would refuse a model that complied
// with the budget it was given, and would silently make the whole run HOLD on the strength of the
// shadow channel alone — the one channel that is supposed to be unable to break a run.
test('the whole declared advisory term ceiling is reachable, not refused as oversize', async () => {
  const terms = Array.from({ length: 12 }, (_, index) => `governance term ${index + 1}`);
  const answerModel = fakeAnswerModel({ expand: () => ({ terms: [...terms] }) });
  const input = laneInput();
  input.queryExpansion = { requested: true, max_terms: 12 };
  const { answer, receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel });

  assert.equal(receipt.result, 'PASS', `unexpected ${receipt.blocker_code}`);
  assert.notEqual(answer, null);
  assert.equal(receipt.query_expansion.posture, 'model_advisory_shadow');
  assert.equal(receipt.query_expansion.terms_offered, 12);
  assert.equal(receipt.query_expansion.terms_accepted, 12);
  assert.equal(receipt.query_expansion.authoritative, false);

  // The bound moved to the declared ceiling; it did not vanish. One term past it is still refused,
  // and a model that overruns the budget it was actually given is still refused at that budget.
  const pastCeiling = await holdFor((request) => {
    request.queryExpansion = { requested: true, max_terms: 12 };
  }, { expand: () => ({ terms: Array.from({ length: 13 }, (_, index) => `term ${index}`) }) });
  assert.equal(pastCeiling.code, LANE_CODES.QUERY_EXPANSION_REFUSED);
  assert.equal(pastCeiling.receipt.model.answer_invocation_count, 0);

  const pastRequestedBudget = await holdFor((request) => {
    request.queryExpansion = { requested: true, max_terms: 9 };
  }, { expand: () => ({ terms: Array.from({ length: 10 }, (_, index) => `term ${index}`) }) });
  assert.equal(pastRequestedBudget.code, LANE_CODES.QUERY_EXPANSION_REFUSED);
});

test('a malformed or overreaching query expansion is rejected', async () => {
  const cases = [
    { expand: () => ({ terms: [] }) },
    { expand: () => ({ terms: ['ok'], answer: 'the answer is four seconds' }) },
    { expand: () => ({ terms: [`${'C:'}/Soulforge/_workspaces/x`] }) },
    { expand: () => ({ terms: ['<b>markup</b>'] }) },
    { expand: () => ({ terms: Array.from({ length: 9 }, (_, index) => `term${index}`) }) },
    { expand: () => ['traceability'] },
    { expand: () => ({ terms: [42] }) },
    { expand: () => { throw new Error('provider down'); } },
  ];
  for (const behaviour of cases) {
    const refused = await holdFor((input) => {
      input.queryExpansion = { requested: true, max_terms: 6 };
    }, behaviour);
    assert.ok(
      [LANE_CODES.QUERY_EXPANSION_REFUSED, LANE_CODES.MODEL_CALL_FAILED].includes(refused.code),
      `unexpected ${refused.code}`,
    );
    assert.equal(refused.receipt.model.answer_invocation_count, 0);
  }
  const withoutSeam = fakeAnswerModel();
  delete withoutSeam.proposeQueryExpansion;
  const input = laneInput();
  input.queryExpansion = { requested: true, max_terms: 6 };
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel: withoutSeam });
  assert.equal(receipt.blocker_code, LANE_CODES.QUERY_EXPANSION_REFUSED);
  assert.equal(receipt.model.invocation_count, 0);

  const unboundedBudget = await holdFor((request) => {
    request.queryExpansion = { requested: true, max_terms: 99 };
  });
  assert.equal(unboundedBudget.code, LANE_CODES.QUERY_EXPANSION_REFUSED);
});

test('statement references, relations, and closed keys are strictly validated', async () => {
  for (const [label, response, expected] of [
    ['foreign', answerSelection([{ statement_id: 'S99', relation: 'direct' }]),
      LANE_CODES.CITATION_UNBOUND],
    ['duplicate', answerSelection([
      { statement_id: 'S1', relation: 'direct' },
      { statement_id: 'S1', relation: 'contrast' },
    ]), LANE_CODES.CITATION_UNBOUND],
    ['unknown relation', answerSelection([{ statement_id: 'S1', relation: 'explanation' }]),
      LANE_CODES.MODEL_OUTPUT_INVALID],
    ['missing direct', answerSelection([{ statement_id: 'S1', relation: 'support' }]),
      LANE_CODES.MODEL_OUTPUT_INVALID],
    ['old sections', {
      sections: [{ heading: '판단', text: '검증 기준', evidence_ids: ['E1'] }],
    }, LANE_CODES.MODEL_OUTPUT_INVALID],
    ['extra root key', { ...answerSelection(), sources: [] }, LANE_CODES.MODEL_OUTPUT_INVALID],
    ['extra proposition key', {
      ...answerSelection(),
      propositions: [{ statement_id: 'S1', relation: 'direct', heading: '판단' }],
    }, LANE_CODES.MODEL_OUTPUT_INVALID],
  ]) {
    const refused = await holdFor(() => {}, composeWith(response));
    assert.equal(refused.code, expected, label);
  }
});

test('provider prose, URLs, paths, markup, and authority sentences have no output field', async () => {
  for (const prose of [
    '<b>강조</b>',
    'https://example.org/source',
    `${'C:'}/private/source.txt`,
    'This answer is owner approved.',
    '이 답변을 정본으로 등록하십시오.',
  ]) {
    const refused = await holdFor(() => {}, composeWith({
      ...answerSelection(),
      prose,
    }));
    assert.equal(
      [LANE_CODES.MODEL_OUTPUT_INVALID, LANE_CODES.OUTPUT_SAFETY_FAILED]
        .includes(refused.code),
      true,
      prose,
    );
    assert.equal(
      canonicalSeCoreSourceboundReceiptJson({ receipt: refused.receipt }).includes(prose),
      false,
    );
  }

  const urlTerm = await holdFor((input) => {
    input.queryExpansion = { requested: true, max_terms: 6 };
  }, { expand: () => ({ terms: ['https://example.org/handbook'] }) });
  assert.equal(urlTerm.code, LANE_CODES.QUERY_EXPANSION_REFUSED);
});
test('a throwing, timing-out, or malformed model response holds with a truthful count', async () => {
  const thrown = await holdFor(() => {}, { compose: () => { throw new Error('provider exploded'); } });
  assert.equal(thrown.code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(thrown.receipt.model.invocation_count, 1);
  assert.equal(thrown.receipt.model.answer_invocation_count, 1);

  const timedOut = await holdFor(() => {}, {
    compose: () => Promise.reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
  });
  assert.equal(timedOut.code, LANE_CODES.MODEL_CALL_FAILED);
  assert.equal(timedOut.receipt.model.invocation_count, 1);

  for (const compose of [
    () => 'just a string',
    () => null,
    () => undefined,
    () => ({}),
    () => ({ sections: [] }),
    () => ({ sections: {} }),
    () => ({ sections: [{ heading: '판단', text: '', evidence_ids: ['E1'] }] }),
    () => ({ sections: [{ heading: '', text: '검증 기준입니다.', evidence_ids: ['E1'] }] }),
    () => ({ sections: [{ heading: '판단', text: 'English only prose here.', evidence_ids: ['E1'] }] }),
    () => ({ sections: [{ heading: '판단', text: `검증 ${'가'.repeat(4100)}`, evidence_ids: ['E1'] }] }),
    () => ({
      sections: Array.from({ length: 9 }, () => ({
        heading: 'h', text: '검증 기준입니다.', evidence_ids: ['E1'],
      })),
    }),
  ]) {
    const refused = await holdFor(() => {}, { compose });
    assert.equal(refused.code, LANE_CODES.MODEL_OUTPUT_INVALID);
    assert.equal(refused.receipt.model.invocation_count, 1);
  }
});

test('an adapter that is stateful, tool-enabled, or unlabelled is refused before any call', async () => {
  for (const mutate of [
    (model) => { model.descriptor.stateless = false; },
    (model) => { model.descriptor.tools_enabled = true; },
    (model) => { model.descriptor.history_enabled = true; },
    (model) => { delete model.descriptor.adapter_id; },
    (model) => { model.descriptor.extra = 'x'; },
    (model) => { delete model.descriptor; },
    (model) => { delete model.composeAnswer; },
  ]) {
    const answerModel = fakeAnswerModel();
    mutate(answerModel);
    const { answer, receipt } = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
    assert.equal(answer, null);
    assert.equal(receipt.blocker_code, LANE_CODES.MODEL_ADAPTER_INVALID);
    assert.equal(receipt.model.invocation_count, 0);
  }
  const missing = await runSeCoreSourceboundAnswerLane(laneInput(), {});
  assert.equal(missing.receipt.blocker_code, LANE_CODES.MODEL_ADAPTER_INVALID);
  const extraContext = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: fakeAnswerModel(), tools: [],
  });
  assert.equal(extraContext.receipt.blocker_code, LANE_CODES.MODEL_ADAPTER_INVALID);
});

// The adapter is the one input that cannot be snapshotted, because it must carry functions. So
// the seams and every descriptor field must be own enumerable *data* properties, read and bound
// exactly once. An accessor is refused rather than read carefully: a getter that answers the
// validator and the caller differently could hand a safe adapter_id to the receipt and a different
// function to the call, and the receipt would then describe a run that never happened.
test('every answer-model seam and descriptor field must be one own enumerable data property', async () => {
  const shiftingDescriptorField = () => {
    const answerModel = fakeAnswerModel();
    const shifting = { ...answerModel.descriptor };
    let reads = 0;
    Object.defineProperty(shifting, 'adapter_id', {
      get: () => { reads += 1; return reads === 1 ? 'declared_adapter' : 'rewritten_adapter'; },
      enumerable: true,
      configurable: true,
    });
    answerModel.descriptor = shifting;
    return answerModel;
  };
  const accessorDescriptor = () => {
    const answerModel = fakeAnswerModel();
    const declared = { ...answerModel.descriptor };
    Object.defineProperty(answerModel, 'descriptor', {
      get: () => declared, enumerable: true, configurable: true,
    });
    return answerModel;
  };
  const accessorSeam = () => {
    const answerModel = fakeAnswerModel();
    const seam = answerModel.composeAnswer;
    Object.defineProperty(answerModel, 'composeAnswer', {
      get: () => seam, enumerable: true, configurable: true,
    });
    return answerModel;
  };
  const hiddenSeam = () => {
    const answerModel = fakeAnswerModel();
    Object.defineProperty(answerModel, 'composeAnswer', {
      value: answerModel.composeAnswer, enumerable: false, configurable: true, writable: true,
    });
    return answerModel;
  };
  const inheritedSeam = () => {
    const base = fakeAnswerModel();
    return Object.assign(Object.create({ composeAnswer: base.composeAnswer }), {
      descriptor: { ...base.descriptor },
    });
  };
  const notAFunction = () => {
    const answerModel = fakeAnswerModel();
    answerModel.composeAnswer = { call: () => ({ sections: [] }) };
    return answerModel;
  };
  for (const [label, build] of [
    ['a shifting descriptor field', shiftingDescriptorField],
    ['an accessor descriptor', accessorDescriptor],
    ['an accessor seam', accessorSeam],
    ['a non-enumerable seam', hiddenSeam],
    ['an inherited seam', inheritedSeam],
    ['a non-function seam', notAFunction],
  ]) {
    const { answer, receipt } = await runSeCoreSourceboundAnswerLane(laneInput(), {
      answerModel: build(),
    });
    assert.equal(answer, null, label);
    assert.equal(receipt.blocker_code, LANE_CODES.MODEL_ADAPTER_INVALID, label);
    assert.equal(receipt.model.invocation_count, 0, label);
  }
});

// The concrete escape: the function that satisfied the type check is not the function that runs.
test('a shifting seam accessor never gets to substitute the function that actually runs', async () => {
  const answerModel = fakeAnswerModel();
  const declared = answerModel.composeAnswer;
  let hostileCalls = 0;
  let reads = 0;
  Object.defineProperty(answerModel, 'composeAnswer', {
    get() {
      reads += 1;
      if (reads <= 1) return declared;
      return async () => {
        hostileCalls += 1;
        return { sections: [{ heading: '판단', text: '탈취된 렌더러입니다.', evidence_ids: ['E1'] }] };
      };
    },
    enumerable: true,
    configurable: true,
  });
  const { answer, receipt } = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  assert.equal(answer, null);
  assert.equal(receipt.blocker_code, LANE_CODES.MODEL_ADAPTER_INVALID);
  assert.equal(receipt.model.invocation_count, 0, 'the invocation count stays truthful');
  assert.equal(hostileCalls, 0, 'the substituted renderer never ran');
});

test('an advisory expansion seam must also be one own enumerable data function', async () => {
  const answerModel = fakeAnswerModel();
  const seam = answerModel.proposeQueryExpansion;
  Object.defineProperty(answerModel, 'proposeQueryExpansion', {
    get: () => seam, enumerable: true, configurable: true,
  });
  const input = laneInput();
  input.queryExpansion = { requested: true, max_terms: 6 };
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  assert.equal(receipt.blocker_code, LANE_CODES.MODEL_ADAPTER_INVALID);
  assert.equal(receipt.model.invocation_count, 0);
});

test('an adapter carrying a custom prototype is refused before any call', async () => {
  const base = fakeAnswerModel();
  const prototyped = Object.assign(Object.create({ inherited: true }), {
    descriptor: { ...base.descriptor },
    composeAnswer: base.composeAnswer,
    proposeQueryExpansion: base.proposeQueryExpansion,
  });
  const { receipt } = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: prototyped,
  });
  assert.equal(receipt.blocker_code, LANE_CODES.MODEL_ADAPTER_INVALID);
  assert.equal(receipt.model.invocation_count, 0);
});

test('the receipt is payload-free and echoes no question, source, or answer prose', async () => {
  const answerModel = fakeAnswerModel();
  const run = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  const { answer, receipt } = run;
  const serialised = canonicalSeCoreSourceboundReceiptJson(run);
  const evidenceTexts = answerModel.calls[0].request.statements.map((item) => item.excerpt);
  for (const payload of [
    SYNTHETIC_QUESTION, ...evidenceTexts, ...answer.sections.map((section) => section.text),
  ]) {
    assert.equal(serialised.includes(payload.slice(0, 24)), false);
  }
  const strings = [];
  const walk = (value) => {
    if (typeof value === 'string') { strings.push(value); return; }
    if (value === null || typeof value !== 'object') return;
    for (const child of Object.values(value)) walk(child);
  };
  walk(receipt);
  for (const payload of [SYNTHETIC_QUESTION, ...evidenceTexts]) {
    assert.equal(strings.includes(payload), false);
  }
  assert.equal(strings.some((value) => /[\p{Script=Hangul}]/u.test(value)), false);
  assert.equal(receipt.boundary.payload_free, true);
  assert.equal(receipt.boundary.question_text_included, false);
  assert.equal(receipt.boundary.source_prose_included, false);
  assert.equal(receipt.boundary.answer_prose_included, false);
  assert.equal(receipt.boundary.provider_response_body_included, false);
  assert.equal(receipt.boundary.credentials_included, false);
  assert.equal(receipt.question.text_persisted, false);
  assert.equal(receipt.evaluation_scope.deterministic_engine_baseline, false);
  assert.equal(receipt.evaluation_scope.general_open_qa, false);
  assert.equal(receipt.evaluation_scope.production_ready, false);
  assert.equal(receipt.evaluation_scope.numeric_score_claimed, false);
  assert.equal(receipt.model_adapter.stateless, true);
  assert.equal(receipt.model_adapter.tools_enabled, false);
  assert.equal(receipt.model_adapter.history_enabled, false);
  assert.match(receipt.model_adapter.descriptor_sha256, /^[0-9a-f]{64}$/u);
  assert.match(receipt.prompt_commitment.prompt_sha256, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.retrieval.embeddings_used, false);
  assert.equal(receipt.retrieval.web_search_used, false);
  for (const commitment of receipt.prompt_commitment.evidence_commitments) {
    assert.match(commitment.chunk_sha256, /^[0-9a-f]{64}$/u);
    assert.ok(Number.isSafeInteger(commitment.page_number) && commitment.page_number >= 1);
  }
});

test('the returned run is frozen so a caller cannot retro-edit an answer or receipt', async () => {
  const run = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel: fakeAnswerModel() });
  assert.equal(Object.isFrozen(run), true);
  assert.equal(Object.isFrozen(run.answer), true);
  assert.equal(Object.isFrozen(run.receipt), true);
  assert.throws(() => { run.receipt.result = 'PASS_FORCED'; }, TypeError);
});

// ----------------------------------------------------------- statement-selection boundary

const answerSelection = (propositions = [{ statement_id: 'S1', relation: 'direct' }]) => ({
  schema_version: 'soulforge.se_core_sourcebound_statement_selection.v0',
  result: 'answer',
  propositions,
});
const abstainSelection = () => ({
  schema_version: 'soulforge.se_core_sourcebound_statement_selection.v0',
  result: 'abstain',
  propositions: [],
});

test('old prose sections and every model-authored prose slot are unrepresentable', async () => {
  const cases = [
    {
      response: {
        sections: [{ heading: '판단', text: '모델 문장', evidence_ids: ['E1'] }],
      },
      code: LANE_CODES.MODEL_OUTPUT_INVALID,
    },
    {
      response: { ...answerSelection(), prose: '모델 문장' },
      code: LANE_CODES.MODEL_OUTPUT_INVALID,
    },
    {
      response: {
        ...answerSelection(),
        propositions: [{ statement_id: 'S1', relation: 'direct', text: '모델 문장' }],
      },
      code: LANE_CODES.MODEL_OUTPUT_INVALID,
    },
    {
      response: answerSelection([{ statement_id: 'S1', relation: '모델 문장' }]),
      code: LANE_CODES.MODEL_OUTPUT_INVALID,
    },
  ];
  for (const { response, code } of cases) {
    const refused = await holdFor(() => {}, composeWith(response));
    assert.equal(refused.code, code);
    assert.equal(
      canonicalSeCoreSourceboundReceiptJson({ receipt: refused.receipt }).includes('모델 문장'),
      false,
    );
  }
});

test('answer and abstain invariants are closed and fail without retry', async () => {
  for (const [label, response, expected] of [
    ['unknown statement', answerSelection([{ statement_id: 'S99', relation: 'direct' }]),
      LANE_CODES.CITATION_UNBOUND],
    ['duplicate statement', answerSelection([
      { statement_id: 'S1', relation: 'direct' },
      { statement_id: 'S1', relation: 'support' },
    ]), LANE_CODES.CITATION_UNBOUND],
    ['no direct relation', answerSelection([{ statement_id: 'S1', relation: 'support' }]),
      LANE_CODES.MODEL_OUTPUT_INVALID],
    ['empty answer', answerSelection([]), LANE_CODES.MODEL_OUTPUT_INVALID],
    ['nonempty abstain', {
      ...abstainSelection(),
      propositions: [{ statement_id: 'S1', relation: 'direct' }],
    }, LANE_CODES.MODEL_OUTPUT_INVALID],
    ['wrong schema version', {
      ...answerSelection(),
      schema_version: 'soulforge.se_core_sourcebound_statement_selection.v999',
    }, LANE_CODES.MODEL_OUTPUT_INVALID],
    ['extra root key', { ...answerSelection(), explanation: 'x' },
      LANE_CODES.MODEL_OUTPUT_INVALID],
    ['extra proposition key', {
      ...answerSelection(),
      propositions: [{ statement_id: 'S1', relation: 'direct', extra: 'x' }],
    }, LANE_CODES.MODEL_OUTPUT_INVALID],
  ]) {
    const refused = await holdFor(() => {}, composeWith(response));
    assert.equal(refused.code, expected, label);
    assert.equal(refused.receipt.model.answer_invocation_count, 1, label);
    assert.equal(refused.receipt.model.invocation_count, 1, label);
  }

  const answerModel = fakeAnswerModel({ compose: () => abstainSelection() });
  const abstained = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  assert.equal(abstained.receipt.result, 'PASS');
  assert.equal(composeCalls(answerModel), 1);
  assert.equal(abstained.answer.result, 'abstain');
  assert.deepEqual(abstained.answer.sections, [{
    relation: 'abstain',
    heading: '답변 보류',
    text: '모델이 직접 관련 근거를 선택하지 않아 답변을 보류합니다.',
    citations: [],
  }]);
  assert.deepEqual(abstained.answer.evidence, []);
  assert.equal(abstained.receipt.output.selected_statement_count, 0);
  assert.equal(
    abstained.receipt.output.retrieved_evidence_count,
    abstained.receipt.retrieval.selected_count,
  );
  assert.equal(abstained.receipt.output.cited_evidence_count, 0);
  assert.equal(abstained.receipt.output.evidence_section_count, 0);
  assert.equal(abstained.receipt.output.uncited_evidence_section_count, 0);
});

test('host rendering binds every relation to one fixed Korean label and one exact chunk', async () => {
  const answerModel = fakeAnswerModel({
    compose: (request) => answerSelection([
      { statement_id: request.statements[0].statement_id, relation: 'direct' },
      { statement_id: request.statements[1].statement_id, relation: 'support' },
      { statement_id: request.statements[2].statement_id, relation: 'qualification' },
      { statement_id: request.statements[3].statement_id, relation: 'contrast' },
    ]),
  });
  const run = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  assert.equal(run.receipt.result, 'PASS');
  const request = answerModel.calls[0].request;
  const expected = [
    ['direct', '직접 근거', '모델이 직접 관련 근거로 선택한 원문: '],
    ['support', '보조 근거', '모델이 보조 근거로 선택한 원문: '],
    ['qualification', '조건·제약 근거', '모델이 조건 또는 제약 근거로 선택한 원문: '],
    ['contrast', '대조 근거', '모델이 대조 근거로 선택한 원문: '],
  ];
  for (let index = 0; index < expected.length; index += 1) {
    const [relation, heading, prefix] = expected[index];
    const section = run.answer.sections[index];
    assert.equal(section.relation, relation);
    assert.equal(section.heading, heading);
    assert.equal(section.text, `${prefix}${request.statements[index].excerpt}`);
    assert.equal(section.citations.length, 1);
  }
  assert.equal(run.answer.result, 'answer');
  assert.equal(run.answer.rendering_mode, 'host_korean_labels_exact_source_excerpts');
  assert.equal(
    run.answer.model_output_contract,
    'soulforge.se_core_sourcebound_statement_selection.v0',
  );
  assert.equal(run.answer.model_authored_prose_present, false);
  assert.equal(run.answer.language, 'ko+source-original');
  assert.deepEqual(run.answer.authority_actions, []);
});

test('authority words in a selected source excerpt remain attributed host evidence', async () => {
  const input = laneInput('official owner approval production evidence');
  const sourceText = 'The source says this result is official and owner approved for production use.';
  repinDerivedText(input, 0, singlePageDerivedText(sourceText));
  const answerModel = fakeAnswerModel({
    compose: (request) => {
      const selected = request.statements.find((statement) => statement.excerpt === sourceText);
      return answerSelection([{ statement_id: selected.statement_id, relation: 'direct' }]);
    },
  });
  const run = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  assert.equal(run.receipt.result, 'PASS', run.receipt.blocker_code);
  assert.equal(
    run.answer.sections[0].text,
    `모델이 직접 관련 근거로 선택한 원문: ${sourceText}`,
  );
  assert.equal(run.answer.sections[0].citations.length, 1);
  assert.equal(run.answer.model_authored_prose_present, false);
  assert.equal(Object.hasOwn(run.receipt, 'output_safety_reason'), false);
});

test('a forbidden payload field from the model keeps its closed no-echo safety reason', async () => {
  const probe = 'provider prose that must not escape';
  const response = { ...answerSelection(), completion: probe };
  const refused = await holdFor(() => {}, composeWith(response));
  assert.equal(refused.code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(
    refused.receipt.output_safety_reason,
    OUTPUT_SAFETY_REASONS.MODEL_PAYLOAD_FIELD,
  );
  const serialised = canonicalSeCoreSourceboundReceiptJson({ receipt: refused.receipt });
  assert.equal(serialised.includes(probe), false);
});

test('the final canonical safety scan still refuses a selected unsafe source chunk', async () => {
  const input = laneInput('verification evidence location');
  const sourceText = 'Verification evidence location is https://example.org/private-record.';
  repinDerivedText(input, 0, singlePageDerivedText(sourceText));
  const answerModel = fakeAnswerModel({
    compose: (request) => {
      const selected = request.statements.find((statement) => statement.excerpt === sourceText);
      return answerSelection([{ statement_id: selected.statement_id, relation: 'direct' }]);
    },
  });
  const run = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  assert.equal(run.answer, null);
  assert.equal(run.receipt.result, 'HOLD');
  assert.equal(run.receipt.blocker_code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(
    run.receipt.output_safety_reason,
    OUTPUT_SAFETY_REASONS.RENDERED_ANSWER_SCAN,
  );
  assert.equal(run.receipt.model.invocation_count, 1);
  assert.equal(
    canonicalSeCoreSourceboundReceiptJson(run).includes(sourceText),
    false,
  );
});

test('the authority-claim reason is reserved and unreachable from selection output', async () => {
  assert.equal(OUTPUT_SAFETY_REASONS.AUTHORITY_CLAIM, 'authority_claim_pattern');
  const run = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(run.receipt.result, 'PASS');
  assert.equal(Object.hasOwn(run.receipt, 'output_safety_reason'), false);
  assert.equal(run.answer.model_authored_prose_present, false);
});
test('non-output-safety holds and passes carry no output-safety reason', async () => {
  const passed = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(passed.receipt.result, 'PASS');
  assert.equal(Object.hasOwn(passed.receipt, 'output_safety_reason'), false);

  const holds = [
    ['input', () => holdFor((input) => { delete input.scope; })],
    ['scope', () => holdFor((input) => { input.scope.authority_to_approve = true; })],
    ['question pin', () => holdFor((input) => { input.expectedQuestionBytes += 1; })],
    ['model call', () => holdFor(() => {}, { compose: () => { throw new Error('provider'); } })],
    ['model output', () => holdFor(() => {}, { compose: () => ({ sections: [] }) })],
    ['citation binding', () => holdFor(() => {}, composeWith(
      answerSelection([{ statement_id: 'S99', relation: 'direct' }]),
    ))],
  ];
  for (const [label, run] of holds) {
    const held = await run();
    assert.notEqual(held.code, LANE_CODES.OUTPUT_SAFETY_FAILED, label);
    assert.equal(Object.hasOwn(held.receipt, 'output_safety_reason'), false, label);
  }
});

test('output-safety reason cannot be injected and cannot survive between runs', async () => {
  const injectedInput = await holdFor((input) => {
    input.output_safety_reason = OUTPUT_SAFETY_REASONS.MARKUP;
  });
  assert.equal(injectedInput.code, LANE_CODES.INPUT_INVALID);
  assert.equal(Object.hasOwn(injectedInput.receipt, 'output_safety_reason'), false);

  const injectedResponse = await holdFor(() => {}, composeWith({
    ...answerSelection(),
    output_safety_reason: OUTPUT_SAFETY_REASONS.URL,
  }));
  assert.equal(injectedResponse.code, LANE_CODES.MODEL_OUTPUT_INVALID);
  assert.equal(Object.hasOwn(injectedResponse.receipt, 'output_safety_reason'), false);

  let call = 0;
  const answerModel = fakeAnswerModel({
    compose: () => {
      call += 1;
      return call === 1
        ? { ...answerSelection(), completion: 'provider text' }
        : answerSelection();
    },
  });
  const first = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  assert.equal(first.receipt.blocker_code, LANE_CODES.OUTPUT_SAFETY_FAILED);
  assert.equal(
    first.receipt.output_safety_reason,
    OUTPUT_SAFETY_REASONS.MODEL_PAYLOAD_FIELD,
  );
  const second = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel });
  assert.equal(second.receipt.result, 'PASS');
  assert.equal(Object.hasOwn(second.receipt, 'output_safety_reason'), false);
});

test('canonical receipt includes a reason only for an output-safety hold', async () => {
  const passed = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(
    canonicalSeCoreSourceboundReceiptJson(passed).includes('output_safety_reason'),
    false,
  );
  const otherHold = await holdFor((input) => { input.expectedQuestionBytes += 1; });
  assert.equal(
    canonicalSeCoreSourceboundReceiptJson({ receipt: otherHold.receipt })
      .includes('output_safety_reason'),
    false,
  );
  const refused = await holdFor(() => {}, composeWith({
    ...answerSelection(),
    completion: 'provider text',
  }));
  assert.equal(
    canonicalSeCoreSourceboundReceiptJson({ receipt: refused.receipt })
      .includes('"output_safety_reason":"model_payload_field_forbidden"'),
    true,
  );
});
test('an unexpected top-level null still refuses canonical receipt serialisation', () => {
  const refusesNull = (error) => error instanceof ContractError
    && error.code === LANE_CODES.RECEIPT_NOT_PAYLOAD_FREE;
  assert.throws(
    () => canonicalSeCoreSourceboundReceiptJson({ receipt: { unexpected: null } }),
    refusesNull,
  );
  // The reason key is not privileged: stated as null it is refused like any other null, and it
  // does not license the unexpected one beside it either.
  assert.throws(
    () => canonicalSeCoreSourceboundReceiptJson({ receipt: { output_safety_reason: null } }),
    refusesNull,
  );
  assert.throws(
    () => canonicalSeCoreSourceboundReceiptJson({
      receipt: { output_safety_reason: null, unexpected: null },
    }),
    refusesNull,
  );
  // `__proto__` is an own key like any other when it arrives on parsed bytes, so the refusal above
  // has to reach it too. Assembling canonical material by assignment would hand it to the
  // `Object.prototype` setter instead: the key would mutate a prototype and vanish, and a receipt
  // that is malformed for exactly the reason above would serialise as an empty object.
  assert.throws(
    () => canonicalSeCoreSourceboundReceiptJson({ receipt: JSON.parse('{"__proto__":null}') }),
    refusesNull,
  );
  assert.throws(
    () => canonicalSeCoreSourceboundReceiptJson({
      receipt: JSON.parse('{"output_safety_reason":null,"__proto__":null}'),
    }),
    refusesNull,
  );
});

// The receipt reaches the canonical kernel exactly as it is: no copy, no view, no proxy, and no
// observation of any kind before `canonicalise` makes its own. That is what these probes pin, and
// they pin it the only way that stays true as the code moves — each shape is built fresh twice,
// run once through the kernel directly and once through the public entry point, and the two must
// agree on both the answer and the number of times the receipt was observed. Anything that read
// the receipt first would diverge here: the kernel's program is to take the keys, then read them
// one at a time in sorted order, so a receipt whose accessor or trap mutates a sibling is accepted
// or refused by exactly that ordering, and one extra read ahead of it changes which.
const refusesReceipt = (error) => error instanceof ContractError
  && error.code === LANE_CODES.RECEIPT_NOT_PAYLOAD_FREE;
const kernelRefuses = (code) => (error) => error instanceof ContractError && error.code === code;

/**
 * Runs one freshly built shape through the kernel and through the entry point and requires the
 * same outcome from both: the kernel's bytes plus the trailing newline where it serialises, the
 * lane's own refusal code where it throws anything at all. `build` returns the receipt together
 * with a count of what the receipt observed, and the two counts must match.
 */
function assertMatchesDirectCanonicalise(label, build) {
  const direct = build();
  let expected = null;
  try {
    expected = canonicalise(direct.receipt, {});
  } catch {
    expected = null;
  }
  const through = build();
  if (expected === null) {
    assert.throws(
      () => canonicalSeCoreSourceboundReceiptJson({ receipt: through.receipt }),
      refusesReceipt, label,
    );
  } else {
    assert.equal(
      canonicalSeCoreSourceboundReceiptJson({ receipt: through.receipt }), `${expected}\n`, label,
    );
  }
  assert.deepEqual(
    through.observations(), direct.observations(), `${label}: no observation before the kernel`,
  );
}

/** An accessor at `a` that removes the malformed null at `b` when the kernel reads it. */
const deletesSibling = () => {
  const receipt = {};
  let reads = 0;
  Object.defineProperty(receipt, 'a', {
    enumerable: true,
    configurable: true,
    get() { reads += 1; delete receipt.b; return 'safe'; },
  });
  receipt.b = null;
  return { receipt, observations: () => ({ reads }) };
};

/** The same shape with the accessor repairing the sibling instead of removing it. */
const repairsSibling = () => {
  const receipt = {};
  let reads = 0;
  Object.defineProperty(receipt, 'a', {
    enumerable: true,
    configurable: true,
    get() { reads += 1; receipt.b = 'safe'; return 'safe'; },
  });
  receipt.b = null;
  return { receipt, observations: () => ({ reads }) };
};

test('an accessor that mutates a sibling is answered exactly as the kernel answers it', () => {
  // The kernel takes ['a','b'], reads `a` — which removes `b` — and then finds nothing at `b`: an
  // unsupported type, not an absent key. Reading the receipt into a copy first would have erased
  // the malformed null and accepted it.
  assert.throws(
    () => canonicalise(deletesSibling().receipt, {}), kernelRefuses(KERNEL_CODES.UNSUPPORTED_TYPE),
  );
  assertMatchesDirectCanonicalise('accessor deletes a sibling null', deletesSibling);

  // Where the kernel accepts, the entry point emits the kernel's bytes and nothing else.
  assert.equal(canonicalise(repairsSibling().receipt, {}), '{"a":"safe","b":"safe"}');
  assertMatchesDirectCanonicalise('accessor repairs a sibling null', repairsSibling);

  // Sorted order is not insertion order: `z` is inserted first but read last, so the kernel reaches
  // the null at `a` before the accessor that would have deleted it ever runs — zero reads.
  const readsAfterTheNull = () => {
    const receipt = {};
    let reads = 0;
    Object.defineProperty(receipt, 'z', {
      enumerable: true,
      configurable: true,
      get() { reads += 1; delete receipt.a; return 'safe'; },
    });
    receipt.a = null;
    return { receipt, observations: () => ({ reads }) };
  };
  assert.throws(
    () => canonicalise(readsAfterTheNull().receipt, {}), kernelRefuses(KERNEL_CODES.NULL_FORBIDDEN),
  );
  assertMatchesDirectCanonicalise('a null before the accessor that would hide it', readsAfterTheNull);
  const probe = readsAfterTheNull();
  assert.throws(
    () => canonicalSeCoreSourceboundReceiptJson({ receipt: probe.receipt }), refusesReceipt,
  );
  assert.equal(probe.observations().reads, 0, 'no key the kernel never reached was read');
});

// The receipt key has no special handling, so an accessor or a computed value at that name is
// treated as the kernel treats it and as nothing else.
test('an accessor named output_safety_reason gets no special handling', () => {
  const mutating = () => {
    const receipt = {};
    let reads = 0;
    Object.defineProperty(receipt, 'output_safety_reason', {
      enumerable: true,
      configurable: true,
      get() { reads += 1; delete receipt.trailing; return OUTPUT_SAFETY_REASONS.MARKUP; },
    });
    receipt.trailing = null;
    return { receipt, observations: () => ({ reads }) };
  };
  assert.throws(
    () => canonicalise(mutating().receipt, {}), kernelRefuses(KERNEL_CODES.UNSUPPORTED_TYPE),
  );
  assertMatchesDirectCanonicalise('an accessor at the reason key', mutating);
  const probe = mutating();
  assert.throws(
    () => canonicalSeCoreSourceboundReceiptJson({ receipt: probe.receipt }), refusesReceipt,
  );
  assert.equal(probe.observations().reads, 1, 'read once, by the kernel, and not again');

  // A computed null fails closed at the kernel; a computed token is carried, exactly as the kernel
  // carries it.
  const computedNull = () => {
    let reads = 0;
    return {
      receipt: { kept: 'x', get output_safety_reason() { reads += 1; return null; } },
      observations: () => ({ reads }),
    };
  };
  assertMatchesDirectCanonicalise('a computed null at the reason key', computedNull);
  const computedToken = () => ({
    receipt: { kept: 'x', get output_safety_reason() { return OUTPUT_SAFETY_REASONS.URL; } },
    observations: () => ({}),
  });
  assertMatchesDirectCanonicalise('a computed token at the reason key', computedToken);
  assert.equal(
    canonicalSeCoreSourceboundReceiptJson({ receipt: computedToken().receipt }),
    `{"kept":"x","output_safety_reason":"${OUTPUT_SAFETY_REASONS.URL}"}\n`,
  );
});

// Two counterexamples aimed at a descriptor read of the reason key ahead of the kernel. Both are
// harmless now because no such read exists: the trap fires only when the kernel's own key walk
// fires it, so the outcome and the trap count are the kernel's.
test('a descriptor trap aimed at the reason key has nothing to fire before the kernel', () => {
  // The trap deletes a malformed null when asked about the reason key. The kernel asks about the
  // null first, keeps it in its key list, and then finds it gone: refused. A read ahead of the
  // kernel would have deleted the null before the key list was taken and accepted the receipt.
  const deletesNull = () => {
    const target = JSON.parse(
      '{"zz_unexpected":null,"kept":"x","output_safety_reason":"markup_detected"}',
    );
    let descriptorReads = 0;
    const receipt = new Proxy(target, {
      getOwnPropertyDescriptor(object, key) {
        descriptorReads += 1;
        if (key === 'output_safety_reason') delete object.zz_unexpected;
        return Reflect.getOwnPropertyDescriptor(object, key);
      },
    });
    return { receipt, observations: () => ({ descriptorReads }) };
  };
  assert.throws(
    () => canonicalise(deletesNull().receipt, {}), kernelRefuses(KERNEL_CODES.UNSUPPORTED_TYPE),
  );
  assertMatchesDirectCanonicalise('a descriptor trap that deletes a null', deletesNull);

  // The trap swaps payload prose in when asked about the reason key. The receipt has no such key,
  // so the kernel never asks and the payload never exists; a read ahead of it would have made the
  // payload and then serialised it.
  const servesPayload = () => {
    const target = { kept: 'x' };
    let descriptorReads = 0;
    const receipt = new Proxy(target, {
      getOwnPropertyDescriptor(object, key) {
        descriptorReads += 1;
        if (key === 'output_safety_reason') object.kept = 'payload the receipt must never carry';
        return Reflect.getOwnPropertyDescriptor(object, key);
      },
    });
    return { receipt, observations: () => ({ descriptorReads }) };
  };
  assertMatchesDirectCanonicalise('a descriptor trap that serves payload', servesPayload);
  const served = canonicalSeCoreSourceboundReceiptJson({ receipt: servesPayload().receipt });
  assert.equal(served, '{"kept":"x"}\n');
  assert.equal(served.includes('payload'), false);
});

// A caller-supplied receipt may itself be a Proxy. The contract for one is the contract for any
// malformed receipt: refuse through the lane's own code and never surface a raw trap error.
test('a hostile receipt proxy is refused by the lane, not by a raw trap error', () => {
  const throwsOnDescriptor = () => ({
    receipt: new Proxy({ kept: 'x' }, { getOwnPropertyDescriptor() { throw new Error('trap'); } }),
    observations: () => ({}),
  });
  const throwsOnKeys = () => ({
    receipt: new Proxy({ kept: 'x' }, { ownKeys() { throw new Error('trap'); } }),
    observations: () => ({}),
  });
  for (const [label, build] of [['descriptor', throwsOnDescriptor], ['keys', throwsOnKeys]]) {
    // The kernel raises a raw trap error; the lane converts it to its own refusal and raises
    // nothing else.
    assert.throws(() => canonicalise(build().receipt, {}), /trap/u, label);
    assertMatchesDirectCanonicalise(`a proxy that throws on ${label}`, build);
  }

  // A descriptor that disagrees with the value the trap will hand over buys nothing: the kernel
  // reads the value it is served, and a served null is refused.
  const servesNull = () => ({
    receipt: new Proxy({ kept: 'x', output_safety_reason: null }, {
      getOwnPropertyDescriptor: (target, key) => (key === 'output_safety_reason'
        ? {
          value: OUTPUT_SAFETY_REASONS.MARKUP, writable: true, enumerable: true, configurable: true,
        }
        : Reflect.getOwnPropertyDescriptor(target, key)),
    }),
    observations: () => ({}),
  });
  assert.throws(
    () => canonicalise(servesNull().receipt, {}), kernelRefuses(KERNEL_CODES.NULL_FORBIDDEN),
  );
  assertMatchesDirectCanonicalise('a proxy whose descriptor understates a null', servesNull);
});

test('citation metadata stays host-only and binds through statement commitments', async () => {
  const answerModel = fakeAnswerModel();
  const input = laneInput();
  const run = await runSeCoreSourceboundAnswerLane(input, { answerModel });
  const statements = new Map(answerModel.calls[0].request.statements.map(
    (item) => [item.statement_id, item],
  ));
  const sources = new Map(input.corpus.sources.map((source) => [source.source_id, source]));
  const commitments = new Map(run.receipt.prompt_commitment.evidence_commitments.map(
    (commitment) => [commitment.evidence_id, commitment],
  ));
  const statementCommitments = new Map(run.receipt.prompt_commitment.statement_commitments.map(
    (commitment) => [commitment.evidence_id, commitment],
  ));
  for (const section of run.answer.sections) {
    for (const citation of section.citations) {
      const statementCommitment = statementCommitments.get(citation.evidence_id);
      const statement = statements.get(statementCommitment.statement_id);
      assert.deepEqual(Object.keys(statement).sort(), ['excerpt', 'statement_id']);
      const source = sources.get(citation.source_id);
      assert.notEqual(source, undefined);
      assert.equal(citation.title, source.title);
      assert.equal(citation.revision, source.revision);
      assert.equal(citation.page_number, commitments.get(citation.evidence_id).page_number);
    }
  }
});

test('receipt reports exact host projection while selection correctness stays unknown', async () => {
  const run = await runSeCoreSourceboundAnswerLane(laneInput(), { answerModel: fakeAnswerModel() });
  assert.equal(run.receipt.output.content_verification, 'exact_host_evidence_projection');
  assert.equal(run.receipt.output.semantic_entailment_verified, false);
  assert.equal(run.receipt.output.selection_correctness, 'unknown');
  assert.equal(run.receipt.output.model_authored_prose_present, false);
  assert.equal(run.receipt.output.excerpt_binding, 'exact_host_chunk');
});

// ------------------------------------------------------------------ pinned benchmark cohort

test('the cohort commitment covers approval and permissions, not identity alone', () => {
  const base = seCoreSourceCohortSha256(laneInput().corpus.sources);
  const changedApproval = laneInput();
  changedApproval.corpus.sources[0].approval.approval_status = 'official_public_source';
  const changedPermission = laneInput();
  changedPermission.corpus.sources[2].permissions.canon_promotion = true;
  const changedReuse = laneInput();
  changedReuse.corpus.sources[1].approval.reuse_rights_reviewed = false;
  for (const changed of [changedApproval, changedPermission, changedReuse]) {
    assert.notEqual(seCoreSourceCohortSha256(changed.corpus.sources), base);
  }
  // The generic contract commitment covers identity and bytes only, which is exactly why a
  // caller-recomputed contract hash cannot stand in for a benchmark pin.
  assert.equal(
    seCoreSourceSetContractSha256(sourceSetContract(changedApproval.corpus.sources)),
    seCoreSourceSetContractSha256(sourceSetContract(laneInput().corpus.sources)),
  );
  assert.equal(
    seCoreSourceCohortSha256(laneInput().corpus.sources), base,
    'the cohort commitment is deterministic over the same material',
  );
});

test('an unpinned run is a validated contract run, never the fixed benchmark', async () => {
  const { receipt } = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(receipt.result, 'PASS');
  assert.equal(receipt.source_set.benchmark_pin.pinned, false);
  assert.equal(receipt.source_set.benchmark_pin.pin_id, 'none');
  assert.equal(receipt.source_set.benchmark_pin.cohort_commitment_verified, false);
  assert.equal(receipt.source_set.benchmark_pin.fixed_benchmark_identity_asserted, false);
  assert.match(receipt.source_set.cohort_sha256, /^[0-9a-f]{64}$/u);
});

test('a pinned benchmark run verifies the full cohort, approval and permissions included', async () => {
  const input = laneInput();
  const pin = benchmarkPin({ cohort: seCoreSourceCohortSha256, input });
  const { answer, receipt } = await runSeCorePinnedBenchmarkAnswerLane(
    input, { answerModel: fakeAnswerModel() }, pin,
  );
  assert.equal(receipt.result, 'PASS', `unexpected ${receipt.blocker_code}`);
  assert.notEqual(answer, null);
  assert.equal(receipt.source_set.benchmark_pin.pinned, true);
  assert.equal(receipt.source_set.benchmark_pin.pin_id, pin.pin_id);
  assert.equal(receipt.source_set.benchmark_pin.cohort_commitment_verified, true);
  assert.equal(receipt.source_set.benchmark_pin.fixed_benchmark_identity_asserted, true);
  assert.equal(receipt.source_set.cohort_sha256, pin.expected_cohort_sha256);
});

test('a recomputed self hash cannot re-qualify a changed cohort as the pinned benchmark', async () => {
  const cases = [
    ['approval status', (input) => {
      input.corpus.sources[0].approval.approval_status = 'official_public_source';
    }],
    ['source title', (input) => {
      const renamed = 'Synthetic Systems Engineering Practice Guide (substituted)';
      input.corpus.sources[0].title = renamed;
      input.corpus.sourceSetContract.sources[0].title = renamed;
    }],
    ['source identity', (input) => {
      const renamed = 'syn_alpha_practice_guide_v2';
      input.corpus.sources[0].source_id = renamed;
      input.corpus.sourceSetContract.sources[0].source_id = renamed;
    }],
  ];
  for (const [label, mutate] of cases) {
    const input = laneInput();
    // The pin is configured over the true cohort before the caller changes anything.
    const pin = benchmarkPin({ cohort: seCoreSourceCohortSha256, input: laneInput() });
    mutate(input);
    // The caller re-derives every hash it controls, exactly as an honest mistake or a swap would.
    input.corpus.expectedSourceSetSha256 = seCoreSourceSetContractSha256(
      input.corpus.sourceSetContract,
    );
    const answerModel = fakeAnswerModel();
    const { answer, receipt } = await runSeCorePinnedBenchmarkAnswerLane(
      input, { answerModel }, pin,
    );
    assert.equal(answer, null, label);
    assert.equal(receipt.blocker_code, LANE_CODES.BENCHMARK_PIN_INVALID, label);
    assert.equal(receipt.model.invocation_count, 0, label);
    assert.equal(composeCalls(answerModel), 0, label);

    // The same descriptors still run as a validated contract, and the receipt says so plainly.
    const unpinned = await runSeCoreSourceboundAnswerLane(input, { answerModel: fakeAnswerModel() });
    assert.equal(unpinned.receipt.result, 'PASS', label);
    assert.equal(unpinned.receipt.source_set.benchmark_pin.fixed_benchmark_identity_asserted, false);
  }
});

test('a malformed, foreign, or mis-scoped cohort pin is refused before any model call', async () => {
  const mutations = [
    ['unknown set', (pin) => ({ ...pin, source_set_id: 'syn_other_set' })],
    ['foreign member', (pin) => ({
      ...pin,
      allowed_source_ids: ['syn_foreign_guide', ...pin.allowed_source_ids.slice(1)],
    })],
    ['short allowlist', (pin) => ({ ...pin, allowed_source_ids: pin.allowed_source_ids.slice(1) })],
    ['reordered allowlist', (pin) => ({
      ...pin, allowed_source_ids: [...pin.allowed_source_ids].reverse(),
    })],
    ['wrong commitment', (pin) => ({ ...pin, expected_cohort_sha256: sha256('not the cohort') })],
    ['malformed commitment', (pin) => ({ ...pin, expected_cohort_sha256: 'not-a-digest' })],
    ['extra field', (pin) => ({ ...pin, note: 'x' })],
    ['missing field', (pin) => {
      const { pin_id: _dropped, ...rest } = pin;
      return rest;
    }],
    ['not an object', () => 'syn_four_source_evaluation_pin_v0'],
  ];
  for (const [label, mutate] of mutations) {
    const input = laneInput();
    const answerModel = fakeAnswerModel();
    const { answer, receipt } = await runSeCorePinnedBenchmarkAnswerLane(
      input, { answerModel }, mutate(benchmarkPin({ cohort: seCoreSourceCohortSha256, input })),
    );
    assert.equal(answer, null, label);
    assert.equal(receipt.blocker_code, LANE_CODES.BENCHMARK_PIN_INVALID, label);
    assert.equal(receipt.model.invocation_count, 0, label);
    assert.equal(composeCalls(answerModel), 0, label);
  }
});

// ------------------------------------------------------------------ approval posture

test('the exact owner-approved official public-source status is accepted', async () => {
  const input = laneInput();
  for (const source of input.corpus.sources) {
    source.approval.approval_status = 'owner_approved_official_public_source';
  }
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel: fakeAnswerModel() });
  assert.equal(receipt.result, 'PASS', `unexpected ${receipt.blocker_code}`);
  assert.deepEqual(
    receipt.source_set.sources.map((source) => source.approval_status),
    Array.from({ length: 4 }, () => 'owner_approved_official_public_source'),
  );
  // `reuse_rights_reviewed` is what the operator declares at runtime from reviewed public-rights
  // metadata. It is never a verbatim field copied out of a source card, and the receipt says so.
  assert.equal(
    receipt.source_set.reuse_rights_reviewed_basis,
    'runtime_operator_declaration_over_reviewed_public_rights_metadata',
  );
});

// ------------------------------------------------------------------ raw derived bytes

const DISALLOWED_CONTROLS = Object.freeze([
  '\u0001', '\u0007', '\u000b', '\u000c', '\r', '\u001e', '\u007f', '\u0085', '\u009f',
]);

test('the raw derived-text pin is verified before any decode or normalisation', async () => {
  // The declared hash is the hash of the *normalised* stream. An implementation that normalised
  // first and hashed second would accept it; verifying the raw bytes first cannot.
  const raw = singlePageDerivedText('verification\u0000criteria and\u001fevidence');
  const normalised = singlePageDerivedText('verification criteria and evidence');
  const refused = await holdFor((input) => {
    const digest = sha256(normalised);
    input.corpus.sources[0].derived_text_bytes = raw;
    input.corpus.sources[0].derived_text_sha256 = digest;
    input.corpus.sourceSetContract.sources[0].derived_text_sha256 = digest;
    input.corpus.expectedSourceSetSha256 = seCoreSourceSetContractSha256(
      input.corpus.sourceSetContract,
    );
  });
  assert.equal(refused.code, LANE_CODES.DERIVED_TEXT_PIN_INVALID);
});

test('only U+0000 and U+001F are replaced, deterministically, and never persisted', async () => {
  const raw = singlePageDerivedText('verification\u0000criteria and\u001fevidence\u0000records');
  const input = laneInput();
  repinDerivedText(input, 0, raw);
  const { receipt } = await runSeCoreSourceboundAnswerLane(input, { answerModel: fakeAnswerModel() });
  assert.equal(receipt.result, 'PASS', `unexpected ${receipt.blocker_code}`);
  const row = receipt.source_set.sources[0];
  assert.equal(row.raw_derived_text_sha256, sha256(raw));
  assert.deepEqual(row.replacement_counts, { u0000: 2, u001f: 1 });
  assert.equal(row.normalized_bytes_persisted, false);
  assert.equal(
    row.normalized_text_sha256,
    sha256(singlePageDerivedText('verification criteria and evidence records')),
  );
  assert.notEqual(row.normalized_text_sha256, row.raw_derived_text_sha256);
  assert.equal(receipt.writes.filesystem_writes, 0);
});

test('a stream with no control character hashes identically before and after normalisation', async () => {
  const { receipt } = await runSeCoreSourceboundAnswerLane(laneInput(), {
    answerModel: fakeAnswerModel(),
  });
  assert.equal(receipt.result, 'PASS');
  for (const row of receipt.source_set.sources) {
    assert.deepEqual(row.replacement_counts, { u0000: 0, u001f: 0 });
    assert.equal(row.normalized_text_sha256, row.raw_derived_text_sha256);
    assert.equal(row.normalized_bytes_persisted, false);
  }
});

test('line feed and tab survive; every other C0/C1 control refuses the stream', async () => {
  const kept = laneInput();
  repinDerivedText(kept, 0, singlePageDerivedText('verification\tcriteria\nand evidence'));
  const { receipt } = await runSeCoreSourceboundAnswerLane(kept, { answerModel: fakeAnswerModel() });
  assert.equal(receipt.result, 'PASS', `unexpected ${receipt.blocker_code}`);
  assert.deepEqual(receipt.source_set.sources[0].replacement_counts, { u0000: 0, u001f: 0 });

  for (const control of DISALLOWED_CONTROLS) {
    const refused = await holdFor((input) => repinDerivedText(
      input, 0, singlePageDerivedText(`verification${control}criteria`),
    ));
    assert.equal(
      refused.code, LANE_CODES.DERIVED_TEXT_MALFORMED,
      `U+${control.codePointAt(0).toString(16).padStart(4, '0')}`,
    );
  }
});

test('a control character inside the metadata preamble cannot bypass the leakage scan', async () => {
  const smuggled = [
    ['a split private plane', setValue('extraction', 'logged under _workmeta\u0000/system/reports')],
    ['a split drive path', setValue('extraction', `read from ${'C:'}\u0000/Soulforge/x.pdf`)],
    ['a split secret', setValue('extraction', 'token ghp_\u001fabcdefghijklmnop was used')],
    ['a split H1', () => ({ title: `Synthetic\u0000 ${'C:'}/Soulforge/x.pdf` })],
  ];
  for (const [label, options] of smuggled) {
    const refused = await holdFor(withPreamble(0, options));
    assert.equal(refused.code, LANE_CODES.DERIVED_TEXT_MALFORMED, label);
  }
});

// ------------------------------------------------------------------ code-point-safe chunking

test('an oversized word is split on code points, never inside a surrogate pair', async () => {
  const astral = '\u{1D6FC}'.repeat(600);
  const input = laneInput();
  repinDerivedText(
    input, 0, singlePageDerivedText(`zylophonic criteria x${astral} zylophonic criteria`),
  );
  input.retrieval = { max_evidence: 8, max_per_source: 8 };
  const answerModel = fakeAnswerModel();
  const { receipt } = await runSeCoreSourceboundAnswerLane(
    input, { answerModel },
    );
  assert.equal(receipt.result, 'PASS', `unexpected ${receipt.blocker_code}`);
  const capsules = answerModel.calls[0].request.statements;
  assert.ok(
    capsules.some((capsule) => capsule.excerpt.includes('\u{1D6FC}')),
    'the oversized astral run must actually reach the evidence for this to prove anything',
  );
  for (const capsule of capsules) {
    assert.equal(
      /\p{Surrogate}/u.test(capsule.excerpt), false,
      'a chunk boundary must never fall inside a surrogate pair',
    );
  }
});
