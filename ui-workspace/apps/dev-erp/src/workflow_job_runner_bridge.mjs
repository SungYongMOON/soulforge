import {
  WORKFLOW_ID,
  WorkflowJobError,
  validateSeparatedPassReceipts,
} from "./workflow_job_contract.mjs";

export const SHARED_WORKFLOW_RUNNER_MODULE = "../../../../guild_hall/workflow_runner/index.mjs";
export const SHARED_WORKFLOW_RUNNER_EXPORT = "runWorkflowJob";
const REQUIRED_VALIDATORS = Object.freeze([
  "validateWorkflowJobOutcome",
  "validateWorkflowJobRequest",
  "validateWorkflowJobResult",
  "validateWorkflowReceipt",
]);

function stableError(error, fallback) {
  const code = String(error?.code || error?.message || "");
  return /^[a-z][a-z0-9_]{0,95}$/.test(code) ? code : fallback;
}

export class WorkflowJobRunnerBridge {
  constructor({ moduleLoader = null } = {}) {
    this.moduleLoader = moduleLoader || ((specifier) => import(specifier));
    this.loaded = null;
  }

  async load() {
    if (!this.loaded) {
      this.loaded = (async () => {
        let module;
        try { module = await this.moduleLoader(SHARED_WORKFLOW_RUNNER_MODULE); }
        catch (error) {
          throw new WorkflowJobError(stableError(error, "workflow_runner_unavailable"), 503);
        }
        if (!module
          || typeof module[SHARED_WORKFLOW_RUNNER_EXPORT] !== "function"
          || REQUIRED_VALIDATORS.some((name) => typeof module[name] !== "function")) {
          throw new WorkflowJobError("workflow_runner_contract_unavailable", 503);
        }
        return module;
      })();
    }
    try { return await this.loaded; }
    catch (error) {
      this.loaded = null;
      throw error;
    }
  }

  async capability() {
    try {
      await this.load();
      return Object.freeze({ available: true, error: null, module: SHARED_WORKFLOW_RUNNER_MODULE, workflow_id: WORKFLOW_ID });
    } catch (error) {
      return Object.freeze({
        available: false,
        error: stableError(error, "workflow_runner_unavailable"),
        module: SHARED_WORKFLOW_RUNNER_MODULE,
        workflow_id: WORKFLOW_ID,
      });
    }
  }

  async execute({ request, adapters, expectedBundleDigest }) {
    if (!request || request.workflow_id !== WORKFLOW_ID) throw new WorkflowJobError("workflow_id_forbidden", 400);
    const module = await this.load();
    return module[SHARED_WORKFLOW_RUNNER_EXPORT](request, adapters, { expectedBundleDigest });
  }

  async validateRequest(value) {
    return (await this.load()).validateWorkflowJobRequest(value);
  }

  async validateResult(value) {
    return (await this.load()).validateWorkflowJobResult(value);
  }

  async validateReceipt(value) {
    return (await this.load()).validateWorkflowReceipt(value);
  }

  async validateOutcome(value) {
    return (await this.load()).validateWorkflowJobOutcome(value);
  }

  validatePassSeparation({ author, verifier, expectedBundleDigest }) {
    return validateSeparatedPassReceipts(author, verifier, expectedBundleDigest);
  }
}

export function createWorkflowJobRunnerBridge(options) {
  return new WorkflowJobRunnerBridge(options);
}
