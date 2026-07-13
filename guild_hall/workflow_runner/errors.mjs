export class WorkflowRunnerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "WorkflowRunnerError";
    this.code = code;
    this.details = details;
  }
}

export function fail(code, message, details = {}) {
  throw new WorkflowRunnerError(code, message, details);
}
