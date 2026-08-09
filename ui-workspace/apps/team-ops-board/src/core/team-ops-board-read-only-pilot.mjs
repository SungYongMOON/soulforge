export const TEAM_OPS_BOARD_READ_ONLY_PILOT = "TEAM_OPS_BOARD_READ_ONLY_PILOT";
export const TEAM_OPS_BOARD_CLAUDE_QUOTA_READ = "TEAM_OPS_BOARD_CLAUDE_QUOTA_READ";

export function isTeamOpsBoardReadOnlyPilot(env = process.env) {
  return env?.[TEAM_OPS_BOARD_READ_ONLY_PILOT] === "1";
}

export function isTeamOpsBoardClaudeQuotaReadEnabled(env = process.env) {
  return !isTeamOpsBoardReadOnlyPilot(env) || env?.[TEAM_OPS_BOARD_CLAUDE_QUOTA_READ] === "1";
}

export function createTeamOpsBoardTopologyOptions(env = process.env) {
  return {
    readOnlyPilot: isTeamOpsBoardReadOnlyPilot(env),
  };
}

export function createTeamOpsBoardRuntimeEnvironment(env = process.env) {
  if (!isTeamOpsBoardReadOnlyPilot(env)) return env;
  return {
    ...env,
    TEAM_OPS_BOARD_AUTO_ENROLLMENT_DISABLED: "1",
    TEAM_OPS_BOARD_SUBAGENT_RECEIPT_ENROLLMENT_DISABLED: "1",
    TEAM_OPS_BOARD_AUTO_LIFECYCLE_RECONCILE: "false",
    TEAM_OPS_BOARD_RESULT_GATES_DISABLED: "1",
  };
}
