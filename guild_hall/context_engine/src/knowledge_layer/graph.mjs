import { digest, fail, freeze, keys, sha, snapshot, token } from './data.mjs';
import { allowedEndpoint, boundedCall, readJsonBounded } from './model.mjs';
export const NODE_KINDS = Object.freeze(['SourceUnit', 'WikiPage', 'WikiRevision', 'Statement', 'WorkLog', 'Conflict', 'Gap', 'Exception']);
export const EDGE_KINDS = Object.freeze(['HAS_REVISION', 'HAS_STATEMENT', 'SUPPORTED_BY', 'SUPERSEDES', 'IN_GENERATION', 'HAS_EXCEPTION', 'HAS_GAP', 'CONFLICTS_WITH']);
const CONTENT_FIELDS = ['schema', 'project_ref', 'source_digest', 'view_digest', 'request_digest', 'parent_generation', 'generator',
  'input_snapshot', 'claim_ceiling', 'display_label', 'semantic_fact_verified', 'knowledge_accepted', 'withdrawals',
  'statements', 'excluded', 'pages', 'work_log', 'gaps', 'conflicts', 'exceptions', 'index_markdown', 'nodes', 'edges'];
function automaticOnly(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if ((['semantic_fact_verified', 'knowledge_accepted'].includes(key) && child !== false)
      || (key === 'claim_ceiling' && child !== 'observed') || (key === 'display_label' && child !== '자동 정리본')) fail('graph_authority_invalid');
    automaticOnly(child);
  }
}
export function validateGraphRecord(record, project) {
  const r = snapshot(record); if (!keys(r, ['generation_id', 'content']) || !sha(r.generation_id) || digest(r.content) !== r.generation_id
    || !keys(r.content, CONTENT_FIELDS) || r.content.schema !== 'soulforge.knowledge_layer.wiki_snapshot.v1'
    || r.content.project_ref !== project || !token(project) || !Array.isArray(r.content.nodes) || r.content.nodes.length > 2000
    || !Array.isArray(r.content.edges) || r.content.edges.length > 5000 || r.content.claim_ceiling !== 'observed') fail('graph_record_invalid');
  if (r.content.input_snapshot?.grant?.project_ref !== project || !Array.isArray(r.content.input_snapshot?.units)
    || r.content.input_snapshot.units.some(u => u.project_ref !== project) || !Array.isArray(r.content.statements)
    || r.content.statements.some(s => s.project_ref !== project)) fail('graph_project_invalid');
  automaticOnly(r.content);
  const ids = new Set();
  for (const n of r.content.nodes) { if (!keys(n, ['id', 'kind', 'origin', 'state', 'data']) || !sha(n.id) || ids.has(n.id)
    || !NODE_KINDS.includes(n.kind) || !['model_proposal', 'deterministic_projection', 'human_input'].includes(n.origin) || n.state !== 'candidate') fail('graph_node_invalid'); ids.add(n.id); }
  for (const e of r.content.edges) if (!keys(e, ['source', 'target', 'kind']) || !ids.has(e.source) || !ids.has(e.target) || !EDGE_KINDS.includes(e.kind)) fail('graph_edge_invalid');
  return freeze(r);
}
export function createMemoryGraph() {
  const projects = new Map();
  return Object.freeze({
    async read(project) { if (!token(project)) fail('graph_project_invalid'); return projects.has(project) ? snapshot(projects.get(project)) : null; },
    async commit(project, expected, record) {
      const r = validateGraphRecord(record, project), prior = projects.get(project);
      if (prior?.generation_id === r.generation_id) return snapshot(prior);
      if ((prior?.generation_id ?? null) !== expected) fail('graph_prior_mismatch');
      projects.set(project, r); return snapshot(r);
    },
    async clearTestNamespace() { projects.clear(); },
    async testProjectCount() { return projects.size; },
  });
}
const READ = 'MATCH (p:KLProject {namespace:$namespace,project:$project}) MATCH (g:KLGeneration {namespace:$namespace,project:$project,generation:p.current}) RETURN g.payload AS payload';
// Deliberate arithmetic error on stale CAS rolls back the ENTIRE implicit
// transaction, including initial project MERGE and lock increment. A WHERE-only
// rejection would commit those writes while returning zero rows.
const WRITE = 'MERGE (p:KLProject {namespace:$namespace,project:$project}) SET p.lock=coalesce(p.lock,0)+1 WITH p SET p.cas_guard=1 / (CASE WHEN coalesce(p.current,\'\')=$expected OR p.current=$generation THEN 1 ELSE 0 END) MERGE (g:KLGeneration {namespace:$namespace,project:$project,generation:$generation}) ON CREATE SET g.payload=$payload CALL { WITH p UNWIND $nodes AS row MERGE (n:KLNode {namespace:$namespace,project:$project,generation:$generation,node_id:row.id}) ON CREATE SET n.kind=row.kind,n.origin=row.origin,n.state=row.state,n.data=row.json RETURN count(*) AS node_count } CALL { WITH p UNWIND $edges AS row MATCH (a:KLNode {namespace:$namespace,project:$project,generation:$generation,node_id:row.source}) MATCH (b:KLNode {namespace:$namespace,project:$project,generation:$generation,node_id:row.target}) MERGE (a)-[:KL_LINK {kind:row.kind}]->(b) RETURN count(*) AS edge_count } SET p.current=$generation RETURN g.payload AS payload';
const CONSTRAINTS = 'SHOW CONSTRAINTS YIELD type,labelsOrTypes,properties RETURN type,labelsOrTypes,properties';
const REQUIRED = [['KLProject', ['namespace', 'project']], ['KLGeneration', ['namespace', 'project', 'generation']], ['KLNode', ['namespace', 'project', 'generation', 'node_id']]];
/** Neo4j Query API, loopback-only and off by default. No credential/env lookup.
 * The operator provisions the three uniqueness constraints; this module never
 * changes schema. Tests opt into an isolated namespace on a disposable server.
 */
export function createNeo4jGraph({ enabled = false, endpoint, namespace, allowed_origins, timeout_ms, fetchImpl = fetch } = {}) {
  const url = allowedEndpoint(endpoint, snapshot(allowed_origins), true);
  if (!/^kl-[a-z0-9-]{8,80}$/u.test(namespace ?? '') || !Number.isSafeInteger(timeout_ms) || timeout_ms < 1 || timeout_ms > 60000
    || !/\/db\/[A-Za-z0-9_-]+\/query\/v2$/u.test(new URL(url).pathname) || new URL(url).search) fail('graph_binding_invalid');
  async function query(statement, parameters) {
    if (enabled !== true) fail('graph_disabled');
    const out = await boundedCall(async signal => readJsonBounded(await fetchImpl(url, { method: 'POST', redirect: 'error', signal,
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ statement, parameters: { ...parameters, namespace } }) }), 4000000), timeout_ms);
    if ((out.errors !== undefined && (!Array.isArray(out.errors) || out.errors.length)) || !Array.isArray(out.data?.values)) fail('graph_query_failed'); return out.data.values;
  }
  async function checkConstraints() {
    const rows = await query(CONSTRAINTS, {});
    if (!REQUIRED.every(([label, properties]) => rows.some(([type, labels, props]) => typeof type === 'string' && /UNIQUENESS/u.test(type)
      && Array.isArray(labels) && Array.isArray(props) && labels.includes(label)
      && props.length === properties.length && properties.every(p => props.includes(p))))) fail('graph_constraints_required');
  }
  return Object.freeze({
    async read(project) { if (!token(project)) fail('graph_project_invalid'); const rows = await query(READ, { project });
      if (rows.length > 1) fail('graph_ambiguous'); return rows.length ? validateGraphRecord(JSON.parse(rows[0][0]), project) : null; },
    async commit(project, expected, record) {
      const r = validateGraphRecord(record, project); if (expected !== null && !sha(expected)) fail('graph_prior_invalid');
      await checkConstraints();
      const rows = await query(WRITE, { project, expected: expected ?? '', generation: r.generation_id, payload: JSON.stringify(r),
        nodes: r.content.nodes.map(n => ({ ...n, json: JSON.stringify(n.data) })), edges: r.content.edges });
      if (rows.length !== 1) fail('graph_prior_mismatch'); return validateGraphRecord(JSON.parse(rows[0][0]), project);
    },
    async clearTestNamespace() {
      if (!namespace.startsWith('kl-test-')) fail('graph_cleanup_not_test');
      await query('MATCH (n) WHERE (n:KLProject OR n:KLGeneration OR n:KLNode) AND n.namespace=$namespace DETACH DELETE n RETURN count(*)', {});
    },
    async testProjectCount() {
      if (!namespace.startsWith('kl-test-')) fail('graph_not_test');
      const rows = await query('MATCH (p:KLProject {namespace:$namespace}) RETURN count(p)', {});
      if (!Number.isSafeInteger(rows[0]?.[0])) fail('graph_count_invalid'); return rows[0][0];
    },
  });
}
