// The tool set, in the order the tool map (9.1B) groups them: 알아보기 → 자료 넣기 → 판단·할 일.
//
// Adding a tool means adding a module and a line here. A module that does not export the five
// fields below fails the shape check at import time rather than at call time.

import * as rulesLayers from './rules_layers.mjs';
import * as rulesStage from './rules_stage.mjs';
import * as rulesCard from './rules_card.mjs';
import * as rulesVersion from './rules_version.mjs';
import * as observeScan from './observe_scan.mjs';
import * as observeRegister from './observe_register.mjs';
import * as observeConfirm from './observe_confirm.mjs';
import * as observeStatus from './observe_status.mjs';
import * as judgeRun from './judge_run.mjs';
import * as judgeResult from './judge_result.mjs';
import * as judgeDiff from './judge_diff.mjs';
import * as nextSteps from './next_steps.mjs';
import * as projectStatus from './project_status.mjs';

const MODULES = [
  rulesLayers, rulesStage, rulesCard, rulesVersion,
  observeScan, observeRegister, observeConfirm, observeStatus,
  judgeRun, judgeResult, judgeDiff, nextSteps, projectStatus,
];

const TOOL_NAME = /^[a-z][a-z0-9_]{2,63}$/u;

function asTool(module) {
  const tool = {
    name: module.name,
    title_ko: module.title_ko,
    description_ko: module.description_ko,
    inputSchema: module.inputSchema,
    write: module.write,
    handler: module.handler,
  };
  if (!TOOL_NAME.test(tool.name ?? '')
    || typeof tool.title_ko !== 'string' || typeof tool.description_ko !== 'string'
    || typeof tool.write !== 'boolean' || typeof tool.handler !== 'function'
    || tool.inputSchema === null || typeof tool.inputSchema !== 'object') {
    throw new Error(`engine mcp tool module is not shaped like a tool: ${String(tool.name)}`);
  }
  return Object.freeze(tool);
}

export const ENGINE_MCP_TOOLS = Object.freeze(MODULES.map(asTool));

export const ENGINE_MCP_TOOLS_BY_NAME = Object.freeze(new Map(
  ENGINE_MCP_TOOLS.map((tool) => [tool.name, tool])));

export const WRITE_TOOL_NAMES = Object.freeze(
  ENGINE_MCP_TOOLS.filter((tool) => tool.write).map((tool) => tool.name));
