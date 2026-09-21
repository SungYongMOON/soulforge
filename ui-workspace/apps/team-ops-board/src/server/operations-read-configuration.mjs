import { readStableFile } from './receipt-expiry-adapter.mjs';

const KEYS = Object.freeze([
  'TEAM_OPS_DIRECTORY_ROOT_TABLE', 'TEAM_OPS_DIRECTORY_ROOT_TABLE_SHA256',
  'TEAM_OPS_GRAPH_RECEIPTS_ROOT', 'TEAM_OPS_GRAPH_PROJECTS', 'TEAM_OPS_RESPONSE_AGENT_LABEL',
  'TEAM_OPS_WORKSPACES_ROOT', 'TEAM_OPS_WORKMETA_ROOT', 'TEAM_OPS_MAIL_RULE_WRITE',
]);

// The scheduled runtime deliberately strips arbitrary environment variables.
// These five read-only UI settings can instead live beside existing Board
// bindings. This loader cannot add a process flag, collector or writer.
export async function readOperationsReadConfiguration({ bindingPath, env = process.env } = {}) {
  let configured = {};
  try {
    configured = JSON.parse(await readStableFile(bindingPath));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw new Error('operations_read_configuration_invalid');
  }
  if (!configured || typeof configured !== 'object' || Array.isArray(configured)
    || Object.keys(configured).some(key => !KEYS.includes(key))
    || Object.values(configured).some(value => typeof value !== 'string' || value.length > 4096)) {
    throw new Error('operations_read_configuration_invalid');
  }
  const settings = Object.fromEntries(KEYS.map(key => [key, env[key] !== undefined ? env[key] : configured[key]]));
  return {
    directory: { tablePath: settings.TEAM_OPS_DIRECTORY_ROOT_TABLE, expectedSha256: settings.TEAM_OPS_DIRECTORY_ROOT_TABLE_SHA256 },
    graph: { receiptsRoot: settings.TEAM_OPS_GRAPH_RECEIPTS_ROOT,
      projects: (settings.TEAM_OPS_GRAPH_PROJECTS || '').split(',').filter(Boolean),
      responseAgentLabel: settings.TEAM_OPS_RESPONSE_AGENT_LABEL },
    // Per-project mail classification rule panel (2026-09-21 owner decision). The scheduled
    // runtime cannot forward arbitrary env vars, so these three settings ride the same
    // allowlisted binding file as the five keys above instead of raw process.env only.
    mailRule: { workspacesRoot: settings.TEAM_OPS_WORKSPACES_ROOT, workmetaRoot: settings.TEAM_OPS_WORKMETA_ROOT,
      writeEnabled: settings.TEAM_OPS_MAIL_RULE_WRITE === '1' },
  };
}
