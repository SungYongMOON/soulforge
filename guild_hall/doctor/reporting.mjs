export function printDoctorHuman(report) {
  const lines = [
    "Soulforge Bootstrap Doctor",
    `profile: ${report.profile}`,
    `mode: ${report.mode}`,
    `ready: ${report.ready ? "yes" : "no"}`,
    `required: ${report.summary.required_passed}/${report.summary.required_total}`,
    `profile_checks: ${report.summary.profile_checks_passed}/${report.summary.profile_checks_total}`,
    `safe_smokes: ${report.summary.safe_smokes_passed}/${report.summary.safe_smokes_total}`,
    `remote_checks: ${report.summary.remote_checks_passed}/${report.summary.remote_checks_total}`,
    `live_smokes: ${report.summary.live_smokes_passed}/${report.summary.live_smokes_total}`,
    `status_file: ${report.status_file}`,
    "",
    "Checks:",
  ];

  for (const item of report.results) {
    const target = item.path ?? (Array.isArray(item.command) ? item.command.join(" ") : item.label);
    lines.push(`- [${item.status}] ${item.id}: ${target}`);
    if (item.detail) {
      lines.push(`  ${item.detail}`);
    }
    if (item.fix_hint) {
      lines.push(`  fix_hint: ${item.fix_hint}`);
    }
  }

  if (report.next_steps.length > 0) {
    lines.push("");
    lines.push("Next steps:");
    report.next_steps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

export function printDoctorJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function buildDoctorFatalPayload({
  doctorSchemaVersion,
  profile,
  mode,
  repoRoot,
  statusFile,
  checklistFile,
  detail,
}) {
  return {
    schema_version: doctorSchemaVersion,
    doctor_version: "v0",
    checklist_version: "unknown",
    profile,
    mode,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    ready: false,
    summary: {
      required_passed: 0,
      required_total: 0,
      profile_checks_passed: 0,
      profile_checks_total: 0,
      safe_smokes_passed: 0,
      safe_smokes_total: 0,
      remote_checks_passed: 0,
      remote_checks_total: 0,
      live_smokes_passed: 0,
      live_smokes_total: 0,
    },
    status_file: statusFile,
    checklist_file: checklistFile,
    results: [
      {
        id: "fatal_internal_error",
        label: "bootstrap doctor fatal error",
        category: "doctor_fatal",
        required: true,
        status: "failed",
        detail,
      },
    ],
    next_steps: [
      "doctor fatal 원인을 확인하고 bootstrap checklist/경로 구성을 다시 점검한다.",
    ],
    fatal: true,
    detail,
  };
}
