// Concrete G1 transport. Existing scoped ACP owns CLI/auth/tool enforcement.
// Each operation gets a new adapter/session and must confirm child closure.
import path from 'node:path';
import { loadBinding } from '../tool_workshop/src/claude_acp_policy.mjs';
import { createClaudeAcp } from '../tool_workshop/src/claude_acp_server.mjs';
import { createFeedbackRuntimeModelPorts } from './feedback_runtime_model.mjs';

const HASH = /^[a-f0-9]{64}$/u;
const fail = code => { throw Object.assign(new Error(code), { feedbackCode: code }); };
let closureUnknown = false;

export function createFeedbackRuntimeAcp(options = {}) {
  if (options.purpose === 'synthetic_harness' || Object.hasOwn(options, 'dependencies')) fail('FEEDBACK_ACP_CONFIG_INVALID');
  return createAdapter(options, { loadBinding, createClaudeAcp }, false);
}

// A separately named test-only entry; production config cannot inject factories.
export function createFeedbackRuntimeAcpTestHarness(options, dependencies) {
  if (options?.purpose !== 'synthetic_harness' || typeof dependencies?.loadBinding !== 'function'
    || typeof dependencies?.createClaudeAcp !== 'function') fail('FEEDBACK_ACP_HARNESS_REQUIRED');
  return createAdapter(options, dependencies, true);
}

function createAdapter(options, dependencies, synthetic) {
  if (options.provider !== 'g1_acp' || options.group !== 'G1') fail('FEEDBACK_ACP_GROUP_INVALID');
  const configuredModel = options.model, authorize = options.authorize;
  const roles = { propose: ['author', options.authorRef], 'patch-review': ['patchReviewer', options.patchReviewerRef],
    'final-review': ['finalReviewer', options.finalReviewerRef] };
  if (!options.bindings || Object.keys(options.bindings).length !== 3) fail('FEEDBACK_ACP_CONFIG_INVALID');
  const specs = {};
  for (const [stage, [name, actor]] of Object.entries(roles)) {
    const spec = options.bindings[name];
    if (!spec || Object.keys(spec).length !== 2 || typeof spec.path !== 'string' || !path.isAbsolute(spec.path)
      || !HASH.test(spec.sha256 ?? '')) fail('FEEDBACK_ACP_CONFIG_INVALID');
    specs[stage] = Object.freeze({ path: spec.path, sha256: spec.sha256, actor });
  }
  if (new Set(Object.values(specs).map(spec => spec.path.toLowerCase())).size !== 3
    || new Set(Object.values(specs).map(spec => spec.sha256)).size !== 3) fail('FEEDBACK_ACP_CONFIG_INVALID');
  let localClosureUnknown = false;
  const transport = {
    name: synthetic ? 'g1-claude-acp-synthetic-harness' : 'g1-claude-acp',
    bindingFor(stage) { return { provider: 'g1_acp', group: 'G1', binding_sha256: specs[stage].sha256, role_ref: specs[stage].actor }; },
    async generate(payload, context, timeoutMs, maxBytes, stage) {
      if (localClosureUnknown || (!synthetic && closureUnknown)) fail('FEEDBACK_ACP_CLOSURE_UNKNOWN');
      const spec = specs[stage];
      let binding;
      try { binding = dependencies.loadBinding(spec.path, spec.sha256); }
      catch { fail('FEEDBACK_ACP_BINDING_INVALID'); }
      // All source/output evidence arrives in the authorized prompt. No second
      // workspace source manifest or write-capable model tool is admitted.
      if (binding.model !== configuredModel || binding.roleRef !== spec.actor || binding.bindingSha256 !== spec.sha256
        || !Array.isArray(binding.inputFiles) || binding.inputFiles.length !== 0
        || !Array.isArray(binding.tools) || !binding.tools.length
        || binding.tools.some(tool => !['workspace_list', 'workspace_read_text'].includes(tool))) fail('FEEDBACK_ACP_BINDING_INVALID');
      const prompt = `${payload.system}\n\n${payload.prompt}`;
      if (Buffer.byteLength(prompt) > Math.min(maxBytes, 128 * 1024)) fail('FEEDBACK_MODEL_INPUT_LIMIT');
      let sessionId, collecting = false, visible = '', outputFailure = null, interrupted = false, timer, rejectInterrupt, turn;
      const interruption = new Promise((_, reject) => { rejectInterrupt = reject; });
      const interrupt = code => {
        if (interrupted) return;
        interrupted = true; rejectInterrupt(Object.assign(new Error(code), { feedbackCode: code }));
      };
      const agent = dependencies.createClaudeAcp(binding, message => {
        if (!collecting || message?.method !== 'session/update') return;
        const update = message.params?.update;
        if (update?.sessionUpdate !== 'agent_message_chunk') return;
        if (message.params.sessionId !== sessionId || update.content?.type !== 'text' || typeof update.content.text !== 'string') {
          outputFailure = 'FEEDBACK_ACP_OUTPUT_INVALID'; interrupt(outputFailure); return;
        }
        if (Buffer.byteLength(visible) + Buffer.byteLength(update.content.text) > Math.min(maxBytes, 256 * 1024)) {
          outputFailure = 'FEEDBACK_MODEL_OUTPUT_LIMIT'; interrupt(outputFailure); return;
        }
        visible += update.content.text;
      });
      const abort = () => interrupt('FEEDBACK_MODEL_INTERRUPTED');
      context.signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => interrupt('FEEDBACK_MODEL_TIMEOUT'), Math.min(timeoutMs, Math.max(1, Date.parse(context.deadline_at) - Date.now())));
      const current = () => { if (interrupted || context.signal.aborted || Date.parse(context.deadline_at) <= Date.now()) fail('FEEDBACK_MODEL_INTERRUPTED'); };
      let result, failure;
      try {
        const work = async () => {
          current();
          const init = await agent.dispatch('initialize', { protocolVersion: 1 });
          if (init?.protocolVersion !== 1) fail('FEEDBACK_ACP_PROTOCOL_INVALID');
          current();
          const session = await agent.dispatch('session/new', { mcpServers: [], additionalDirectories: [] });
          sessionId = session?.sessionId;
          if (typeof sessionId !== 'string' || !sessionId.length || session.models?.currentModelId !== configuredModel) fail('FEEDBACK_ACP_MODEL_INVALID');
          if (await authorize(stage, JSON.parse(payload.prompt).binding, context) !== true) fail('FEEDBACK_MODEL_INPUT_DENIED');
          current(); collecting = true;
          turn = agent.dispatch('session/prompt', { sessionId, prompt: [{ type: 'text', text: prompt }] });
          const terminal = await turn; collecting = false;
          if (outputFailure) fail(outputFailure);
          if (terminal?.stopReason !== 'end_turn' || terminal._meta?.source !== 'claude_cli_observed'
            || terminal._meta?.model !== configuredModel || terminal._meta?.accepted !== false
            || terminal._meta?.failure_meta) fail('FEEDBACK_ACP_TURN_FAILED');
          let value;
          try { value = JSON.parse(visible); } catch { fail('FEEDBACK_MODEL_RESPONSE_INVALID'); }
          return value;
        };
        result = await Promise.race([work(), interruption]);
      } catch (error) { failure = error.feedbackCode ?? 'FEEDBACK_ACP_TURN_FAILED'; }
      finally {
        collecting = false; clearTimeout(timer); context.signal.removeEventListener('abort', abort);
        // ACP close() is fire-and-forget. Cancel and inspect the cached terminal
        // instead: a failed/cancelled session cannot dispatch another native turn.
        let closeTimer;
        try {
          const closed = await Promise.race([
            (async () => {
              if (!sessionId) return true; // initialize/session-new never spawn in the concrete adapter.
              await agent.dispatch('session/cancel', { sessionId });
              if (turn) await turn.catch(() => {});
              const terminal = await agent.dispatch('session/prompt', { sessionId,
                prompt: [{ type: 'text', text: 'Inspect cancelled session closure; do not start a new turn.' }] });
              return terminal?._meta?.failure_meta?.directChildClosed === true;
            })(),
            new Promise(resolve => { closeTimer = setTimeout(() => resolve(false), 5000); }),
          ]);
          if (!closed) { localClosureUnknown = true; if (!synthetic) closureUnknown = true; failure = 'FEEDBACK_ACP_CLOSURE_UNKNOWN'; }
        } catch { localClosureUnknown = true; if (!synthetic) closureUnknown = true; failure = 'FEEDBACK_ACP_CLOSURE_UNKNOWN'; }
        finally { clearTimeout(closeTimer); agent.close(); }
      }
      if (failure) fail(failure);
      return result;
    },
  };
  return createFeedbackRuntimeModelPorts(options, transport);
}
