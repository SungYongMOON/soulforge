// Metadata contract shared by the G1 consumer and authenticated SENDER port.
// This validates a received proof; it never authenticates a transport or a model.
import { runtimeExact as exact } from '../dev_worker/feedback_runtime_io.mjs';
const require = (value, code = 'G2_FEEDBACK_HOLD') => { if (!value) throw new Error(code); };

export function validateAuthenticatedCurrentnessMetadata(value, expected, { now = Date.now, maxAgeMs = 1000 } = {}) {
  require(exact(value, ['challenge', 'publisher_ref', 'producer_ref', 'scope_ref', 'issue_id', 'issue_content_sha256',
    'body_sha256', 'generation', 'review_ref', 'index_sha256', 'observed_at', 'valid_until', 'execution_authority']));
  require(exact(expected, ['challenge', 'publisher_ref', 'producer_ref', 'scope_ref', 'issue_id', 'issue_content_sha256',
    'body_sha256', 'generation', 'review_ref', 'index_sha256']));
  require(Object.entries(expected).every(([key, member]) => value[key] === member)
    && /^[a-f0-9]{32}$/u.test(value.challenge) && value.execution_authority === false
    && Number.isSafeInteger(maxAgeMs) && maxAgeMs > 0 && maxAgeMs <= 5000
    && Number.isFinite(Date.parse(value.observed_at)) && Date.parse(value.observed_at) <= now()
    && now() - Date.parse(value.observed_at) <= maxAgeMs && now() < Date.parse(value.valid_until), 'G2_FEEDBACK_CURRENTNESS_UNBOUND');
  return true;
}
