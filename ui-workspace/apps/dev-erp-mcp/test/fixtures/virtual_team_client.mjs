import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";

import { IngressClient } from "../../src/ingress_client.mjs";

async function main() {
  const input = JSON.parse(await readFile(process.argv[2], "utf8"));
  const bytes = await readFile(input.file_path);
  const size = (await stat(input.file_path)).size;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const client = new IngressClient({ baseUrl: input.base_url, token: process.env.SOULFORGE_INGRESS_TOKEN });
  try {
    const identity = await client.whoami();
    const listed = await client.client.listTools();
    const prepared = await client.call("ingress_prepare_file_upload", {
      project_hint: input.project_hint,
      occurrence_id: input.file_occurrence,
      idempotency_key: input.file_idempotency,
      filename: input.filename,
      size,
      sha256,
      media_type: input.media_type,
    });
    const resume = await client.call("ingress_get_upload_status", { ticket_id: prepared.ticket_id });
    const uploaded = await client.uploadFile({
      path: input.file_path,
      projectHint: input.project_hint,
      occurrenceId: input.file_occurrence,
      idempotencyKey: input.file_idempotency,
      mediaType: input.media_type,
    });
    const baseEvent = {
      project_hint: input.project_hint,
      occurred_at: "2026-07-17T10:00:00.000Z",
      task_ref: input.task_ref,
      summary: `Synthetic bounded evidence from ${identity.account_id}`,
      outputs: [input.filename],
      verification: "virtual team client E2E",
      next_actions: [],
      stop_conditions: ["no production exposure"],
    };
    const work = await client.publishWorkEvent({
      ...baseEvent,
      occurrence_id: input.work_occurrence,
      idempotency_key: input.work_idempotency,
      event_kind: "work_checkpoint",
    });
    const run = await client.publishRunReceipt({
      ...baseEvent,
      occurrence_id: input.run_occurrence,
      idempotency_key: input.run_idempotency,
      event_kind: "validation_receipt",
    });
    const statuses = await Promise.all([
      client.submissionStatus(uploaded.submission_id),
      client.submissionStatus(work.submission_id),
      client.submissionStatus(run.submission_id),
    ]);
    let deniedProject = null;
    try {
      await client.call("ingress_prepare_file_upload", {
        project_hint: input.denied_project,
        occurrence_id: `${input.file_occurrence}_deny`,
        idempotency_key: `${input.file_idempotency}:deny`,
        filename: input.filename,
        size,
        sha256,
        media_type: input.media_type,
      });
    } catch (error) {
      deniedProject = error.code;
    }
    return {
      identity,
      tools: listed.tools.map((entry) => entry.name).sort(),
      prepare_replayed: prepared.replayed,
      initial_resume_offset: resume.received_size,
      submissions: [uploaded.submission_id, work.submission_id, run.submission_id],
      statuses: statuses.map((entry) => entry.status),
      denied_project_error: deniedProject,
      token_exposed: false,
    };
  } finally {
    await client.close();
  }
}

main().then((output) => {
  process.stdout.write(`${JSON.stringify(output)}\n`);
}).catch((error) => {
  process.stderr.write(`${JSON.stringify({ error: error?.code || error?.message || "virtual_team_client_failed" })}\n`);
  process.exitCode = 1;
});
