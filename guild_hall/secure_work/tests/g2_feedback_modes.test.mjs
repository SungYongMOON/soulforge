import test from 'node:test';
import assert from 'node:assert/strict';
import { pythonInvocation } from '../sfx.mjs';

test('unknown feedback modes and caller arguments are rejected before any runtime configuration read', () => {
  let reads=0;
  const runtime={get binding(){reads++;throw new Error('private configuration must remain unread');}};
  for(const [mode,argv] of [
    ['feedback_admin',[]], ['feedback_verify',['--config','caller.json']],
    ['feedback_prepare',['--role','controller']], ['feedback_verify',['--actor','model:self']],
    ['feedback_prepare',['unexpected']],
  ]) assert.throws(()=>pythonInvocation(runtime,mode,argv),/SECURE_WORK_LAUNCH_HOLD/);
  assert.equal(reads,0);
});
