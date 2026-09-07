// Fixed synthetic computation only. Never import a caller-selected file or execute a command.
import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';

parentPort.once('message', input => {
  const fields = ['run_id', 'fencing_epoch', 'attempt_no', 'request_id', 'project_code', 'stage_code', 'artifact_family_id',
    'input_revision', 'work_brief_digest', 'generation', 'delay_ms'];
  const ref = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(value);
  if (!input || Object.keys(input).length !== fields.length || !fields.every(key => Object.hasOwn(input, key))
    || !['run_id', 'request_id', 'project_code', 'stage_code', 'artifact_family_id', 'generation'].every(key => ref(input[key]))
    || !/^S(?:YN|FX)[-_]/u.test(input.project_code) || !['input_revision', 'work_brief_digest'].every(key => /^sha256:[a-f0-9]{64}$/u.test(input[key]))
    || !Number.isSafeInteger(input.fencing_epoch) || input.fencing_epoch < 1
    || !Number.isSafeInteger(input.attempt_no) || input.attempt_no < 1
    || !Number.isSafeInteger(input.delay_ms) || input.delay_ms < 0 || input.delay_ms > 10000) {
    parentPort.postMessage({ type: 'invalid' }); return;
  }
  parentPort.postMessage({ type: 'started', run_id: input.run_id, fencing_epoch: input.fencing_epoch });
  // Approved synthetic delay exercises real termination and fencing. It does not call a timer,
  // model, process, network or filesystem, and cannot be changed through the browser request.
  if (input.delay_ms) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, input.delay_ms);
  const bytes = Buffer.from(`# 합성 실행 검증 후보\n\n실과제 산출물이 아닌 고정 코드 실행 검증입니다.\n\n`
    + `- 과제: ${input.project_code}\n- 단계: ${input.stage_code}\n- 산출물: ${input.artifact_family_id}\n`
    + `- 입력 판본: ${input.input_revision}\n- 승인 업무지시 digest: ${input.work_brief_digest}\n`
    + `- 자료 세대: ${input.generation}\n- 실행: ${input.run_id}\n- 시도: ${input.attempt_no}\n`
    + `- 결정론 검사: ${Array.from({ length: 1000 }, (_, i) => i + 1).reduce((sum, n) => sum + n, 0)}\n\n`
    + '모델 호출·외부 제출·공식 업무 완료·결과 수락은 수행하지 않았습니다.\n', 'utf8');
  parentPort.postMessage({ type: 'result', run_id: input.run_id, fencing_epoch: input.fencing_epoch,
    content: bytes.toString('utf8'), content_sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` });
});
