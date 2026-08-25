// The tool set, in the order the tool map (9.1B) groups them: 알아보기 → 자료 넣기 → 파일 넣기·받기
// → 판단·할 일, with the three status/permission tools (9.1E ①, 9.1F F2·F3) in front because they
// are what a caller reads first.
//
// Adding a tool means adding a module and a line here. A module that does not export the fields
// below fails the shape check at import time rather than at call time.
//
// Two things this file adds to every module, so no tool can forget them:
//
//   * `project_code`, optional, on every input schema. One server serves many projects (부록 B),
//     and the argument that says which one belongs to all tools, not to some of them.
//   * a data class, defaulting to ⓒ confidential. A tool whose author did not state a class is
//     treated as the most restricted one, which is the fail-closed direction (9.1F). A module may
//     also name fields that are narrower than its own class (`team_fields`, `confidential_fields`);
//     those are blanked for a caller without the class rather than refusing the whole answer.

import * as whoami from './whoami.mjs';
import * as engineStatus from './engine_status.mjs';
import * as accessTable from './access_table.mjs';
import * as projectsList from './projects_list.mjs';
import * as rulesLayers from './rules_layers.mjs';
import * as rulesStage from './rules_stage.mjs';
import * as rulesCard from './rules_card.mjs';
import * as rulesVersion from './rules_version.mjs';
import * as observeScan from './observe_scan.mjs';
import * as observeRegister from './observe_register.mjs';
import * as observeConfirm from './observe_confirm.mjs';
import * as observeStatus from './observe_status.mjs';
import * as fileTicket from './file_ticket.mjs';
import * as filePut from './file_put.mjs';
import * as fileRegister from './file_register.mjs';
import * as fileGet from './file_get.mjs';
import * as fileTicketsList from './file_tickets_list.mjs';
import * as fileTicketsGc from './file_tickets_gc.mjs';
import * as judgeRun from './judge_run.mjs';
import * as judgeResult from './judge_result.mjs';
import * as judgeDiff from './judge_diff.mjs';
import * as nextSteps from './next_steps.mjs';
import * as projectStatus from './project_status.mjs';

import { DATA_CLASSES, DEFAULT_DATA_CLASS } from '../access_table.mjs';

const MODULES = [
  whoami, engineStatus, accessTable, projectsList,
  rulesLayers, rulesStage, rulesCard, rulesVersion,
  observeScan, observeRegister, observeConfirm, observeStatus,
  fileTicket, filePut, fileRegister, fileGet, fileTicketsList, fileTicketsGc,
  judgeRun, judgeResult, judgeDiff, nextSteps, projectStatus,
];

const TOOL_NAME = /^[a-z][a-z0-9_]{2,63}$/u;

export const PROJECT_CODE_PROPERTY = Object.freeze({
  type: 'string',
  description: '과제 코드. 생략하면 명부의 기본 과제를 쓴다.',
});

function asTool(module) {
  const inputSchema = Object.freeze({
    ...module.inputSchema,
    properties: Object.freeze({
      ...(module.inputSchema?.properties ?? {}),
      project_code: PROJECT_CODE_PROPERTY,
    }),
  });
  const tool = {
    name: module.name,
    title_ko: module.title_ko,
    description_ko: module.description_ko,
    inputSchema,
    write: module.write,
    data_class: module.data_class ?? DEFAULT_DATA_CLASS,
    // Fields inside an answer can be narrower than the answer's own class. A tool that is ⓐ as a
    // whole may still carry a project code or a file name, and those are withheld from a caller
    // who does not hold that class rather than the whole answer being refused.
    restricted_fields: Object.freeze({
      team_judgment: Object.freeze([...(module.team_fields ?? [])]),
      confidential_contract: Object.freeze([...(module.confidential_fields ?? [])]),
    }),
    // Read tools are idempotent by nature; a write tool says so for itself, because "calling this
    // twice is harmless" is a claim about what it writes, not about whether it writes.
    idempotent: module.idempotent ?? module.write !== true,
    handler: module.handler,
  };
  if (!TOOL_NAME.test(tool.name ?? '')
    || typeof tool.title_ko !== 'string' || typeof tool.description_ko !== 'string'
    || typeof tool.write !== 'boolean' || typeof tool.handler !== 'function'
    || typeof tool.idempotent !== 'boolean'
    || !DATA_CLASSES.includes(tool.data_class)
    || module.inputSchema === null || typeof module.inputSchema !== 'object') {
    throw new Error(`engine mcp tool module is not shaped like a tool: ${String(tool.name)}`);
  }
  return Object.freeze(tool);
}

export const ENGINE_MCP_TOOLS = Object.freeze(MODULES.map(asTool));

export const ENGINE_MCP_TOOLS_BY_NAME = Object.freeze(new Map(
  ENGINE_MCP_TOOLS.map((tool) => [tool.name, tool])));

export const WRITE_TOOL_NAMES = Object.freeze(
  ENGINE_MCP_TOOLS.filter((tool) => tool.write).map((tool) => tool.name));

/** What the server hands the tools as `ctx.shared.tools`: identity, never the handler. */
export const TOOL_DESCRIPTORS = Object.freeze(ENGINE_MCP_TOOLS.map((tool) => Object.freeze({
  name: tool.name,
  write: tool.write,
  data_class: tool.data_class,
  idempotent: tool.idempotent,
})));
