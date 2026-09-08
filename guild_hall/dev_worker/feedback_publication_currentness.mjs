// G1 reads only released projection/currentness metadata. Authentication belongs
// to the installed SENDER pipe, not to fields in a model response or JSON file.
import path from 'node:path';
import { createFeedbackCurrentnessClient } from '../secure_work/feedback_currentness_transport.mjs';
import { boundedRead, sha256 } from '../tool_workshop/src/workshop_files.mjs';
import { runtimeExact as exact, runtimeCheck as check } from './feedback_runtime_io.mjs';

const FIELDS = ['publisher_ref', 'producer_ref', 'scope_ref', 'issue_id', 'issue_content_sha256',
  'body_sha256', 'generation', 'review_ref', 'index_sha256'];
const CONTEXT = FIELDS.filter(key => !['publisher_ref', 'review_ref'].includes(key));
const json = bytes => JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));

export function createFeedbackPublicationCurrentness({ deploymentPath, deploymentSha256, deployment }) {
  const config = deployment.publicationCurrentness;
  check(exact(config, ['transport', 'expected']) && exact(config.transport, ['path', 'sha256'])
    && exact(config.expected, ['path', 'mode']) && config.expected.mode === 'current_metadata', 'FEEDBACK_CURRENTNESS_CONFIG');
  let closed = false;
  const current = () => {
    check(!closed && sha256(boundedRead(deploymentPath, 2_000_000)) === deploymentSha256,
      'FEEDBACK_DEPLOYMENT_CHANGED');
    check(sha256(boundedRead(config.transport.path, 65536)) === config.transport.sha256,
      'FEEDBACK_CURRENTNESS_BINDING_CHANGED');
  };
  current();
  const client = createFeedbackCurrentnessClient({ binding: json(boundedRead(config.transport.path, 65536)), assertCurrent: current });
  return Object.freeze({
    async assertProjection(context) {
      current();
      check(exact(context, CONTEXT), 'FEEDBACK_CURRENTNESS_CONTEXT');
      const before = boundedRead(config.expected.path, 65536), expected = json(before);
      check(exact(expected, FIELDS) && CONTEXT.every(key => expected[key] === context[key]), 'FEEDBACK_CURRENTNESS_PROJECTION_CHANGED');
      const metadata = await client.request(expected);
      current();
      check(sha256(boundedRead(config.expected.path, 65536)) === sha256(before), 'FEEDBACK_CURRENTNESS_PROJECTION_CHANGED');
      // Pin the exact published index again after the authenticated response.
      check(sha256(boundedRead(path.join(deployment.projectionRoot, 'current.json'), 2_000_000)) === expected.index_sha256,
        'FEEDBACK_CURRENTNESS_PROJECTION_CHANGED');
      return metadata;
    },
    async close() { closed = true; await client.close(); },
  });
}
