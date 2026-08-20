function clone(value) {
  return structuredClone(value);
}

function taskKey(ref) {
  return `${String(ref?.provider ?? "")}:${String(ref?.task_id ?? "")}`;
}

export class FixtureLinearTaskProvider {
  #tasks;
  #readCount = 0;

  constructor({ tasks } = {}) {
    if (!Array.isArray(tasks)) throw new TypeError("task_execution_fixture_tasks_required");
    this.#tasks = new Map(tasks.map((task) => [taskKey(task.task_ref), clone(task)]));
  }

  async readTask(ref) {
    this.#readCount += 1;
    const task = this.#tasks.get(taskKey(ref));
    return task === undefined ? null : clone(task);
  }

  get read_count() {
    return this.#readCount;
  }
}

export class MockExecutor {
  #outcome;
  #callCount = 0;

  constructor({ outcome } = {}) {
    this.#outcome = clone(outcome);
  }

  async execute() {
    this.#callCount += 1;
    if (this.#outcome?.status === "crash") {
      throw new Error(String(this.#outcome.raw_message ?? "synthetic executor crash"));
    }
    return clone(this.#outcome);
  }

  get call_count() {
    return this.#callCount;
  }
}
