import { digest, fail, freeze, keys, snapshot, token } from './data.mjs';
import { createHttpGenerator, validateBudget } from './model.mjs';
export const MODEL_ROLES = Object.freeze(['wiki_draft', 'night_organize', 'memory_extract', 'entity_candidates', 'embedding', 'bot_answer']);
const subset = (value, names) => value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(k => names.includes(k));
/** One trusted, secret-free configuration table. Source text never selects it.
 * A model-level preference is never a company-egress grant. An exact project
 * and role must explicitly opt in; missing entries always mean denied.
 */
export function resolveModelRole({ config, project_ref, role, data_class = 'company' }) {
  const c = snapshot(config);
  if (!keys(c, ['schema', 'enabled', 'roles', 'models', 'projects']) || c.schema !== 'soulforge.knowledge_layer.model_roles.v1'
    || typeof c.enabled !== 'boolean' || !token(project_ref) || !MODEL_ROLES.includes(role)
    || !['company', 'public_synthetic'].includes(data_class) || !keys(c.roles, MODEL_ROLES)
    || !c.models || typeof c.models !== 'object' || Array.isArray(c.models)
    || !c.projects || typeof c.projects !== 'object' || Array.isArray(c.projects)) fail('model_roles_invalid');
  for (const [id, m] of Object.entries(c.models)) {
    if (!token(id) || !keys(m, ['call_style', 'model', 'endpoint', 'allowed_origins', 'budget', 'allow_company_host_egress'])
      || !token(m.call_style) || !token(m.model) || (m.endpoint !== null && typeof m.endpoint !== 'string')
      || !Array.isArray(m.allowed_origins) || m.allowed_origins.some(o => typeof o !== 'string')
      || typeof m.allow_company_host_egress !== 'boolean') fail('model_spec_invalid');
    validateBudget(m.budget);
  }
  for (const id of Object.values(c.roles)) if (id !== null && (!token(id) || !Object.hasOwn(c.models, id))) fail('role_model_unknown');
  for (const [p, override] of Object.entries(c.projects)) {
    if (!token(p) || !keys(override, ['roles', 'company_host_egress']) || !subset(override.roles, MODEL_ROLES)
      || !subset(override.company_host_egress, MODEL_ROLES) || Object.values(override.company_host_egress).some(v => typeof v !== 'boolean')
      || Object.values(override.roles).some(id => id !== null && (!token(id) || !Object.hasOwn(c.models, id)))) fail('model_project_override_invalid');
  }
  const override = Object.hasOwn(c.projects, project_ref) ? c.projects[project_ref] : null;
  const id = override && Object.hasOwn(override.roles, role) ? override.roles[role] : c.roles[role];
  if (id === null) fail('role_unconfigured');
  const m = c.models[id], permission = override?.company_host_egress?.[role] === true;
  let outside = false;
  if (m.endpoint !== null) {
    let url; try { url = new URL(m.endpoint); } catch { fail('model_endpoint_invalid'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || !m.allowed_origins.includes(url.origin)) fail('model_endpoint_invalid');
    outside = !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  }
  if (outside && data_class === 'company' && !permission) fail('company_host_egress_denied');
  const binding = { project_ref, role, data_class, enabled: c.enabled, model_id: id, ...m,
    model_host_egress_preference: m.allow_company_host_egress, allow_company_host_egress: permission, outside_host: outside };
  return freeze({ ...binding, binding_digest: digest(binding) });
}
/** Adapter factories are trusted code, registered by call_style, never imported
 * from a configured path. Other roles resolve now; their workflows are K4+.
 */
export function createRoleGenerator({ config, project_ref, role = 'wiki_draft', data_class = 'company', adapters = {} }) {
  const binding = resolveModelRole({ config, project_ref, role, data_class });
  const factory = Object.hasOwn(adapters, binding.call_style) ? adapters[binding.call_style] : (binding.call_style === 'chat_completions' ? b => createHttpGenerator({
    enabled: b.enabled, id: 'role:' + b.binding_digest.slice(7), model: b.model, endpoint: b.endpoint,
    allowed_origins: b.allowed_origins, budget: b.budget,
    host_egress_policy: { project_ref: b.project_ref, role: b.role, data_class: b.data_class, allowed: b.allow_company_host_egress },
  }) : null);
  if (typeof factory !== 'function') fail('model_call_style_unavailable');
  return Object.freeze({ id: 'role:' + binding.binding_digest.slice(7), budget: binding.budget,
    project_ref, role, binding, createSession() {
      let session = null;
      return Object.freeze({ async generate(input) {
        const request = snapshot(input);
        if (!binding.enabled) fail('generation_disabled');
        if (request.project_ref !== project_ref) fail('model_project_mismatch');
        if (request.role !== undefined && request.role !== role) fail('model_role_mismatch');
        if (session === null) {
          const adapter = factory(binding);
          if (!adapter || typeof adapter.createSession !== 'function') fail('model_adapter_invalid');
          session = adapter.createSession();
        }
        return session.generate({ ...request, role });
      } });
    } });
}
