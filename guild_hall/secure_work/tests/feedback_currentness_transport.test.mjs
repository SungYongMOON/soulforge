import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash, randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createFeedbackCurrentnessClient, startFeedbackCurrentnessServer} from '../feedback_currentness_transport.mjs';

const python = process.env.SOULFORGE_SECURE_WORK_TEST_PYTHON;
const enabled = process.platform === 'win32' && Boolean(python);
const source = fileURLToPath(new URL('../src/soulforge_secure_work/', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = () => ({publisher_ref:'publisher:G2', producer_ref:'source:G2', scope_ref:'project:SYN',
  issue_id:'f8091a2b-3c4d-4859-aa6b-465768798a9b', issue_content_sha256:`sha256:${'a'.repeat(64)}`,
  body_sha256:'b'.repeat(64), generation:1, review_ref:'review:synthetic', index_sha256:'c'.repeat(64)});
const answer = challenge => ({challenge, ...expected(), observed_at:new Date().toISOString(),
  valid_until:new Date(Date.now()+10000).toISOString(), execution_authority:false});
let sid;
function binding(overrides = {}) {
  sid ??= execFileSync(python, ['-I','-S','-B','-c',
    'import sys;sys.path.insert(0,sys.argv[1]);from ipc_pipe import current_sid;print(current_sid())', source],
  {encoding:'utf8',windowsHide:true,timeout:5000}).trim();
  return {pipe_name:`soulforge-secure-${randomBytes(16).toString('hex')}`, server_sid:sid, client_sid:sid,
    python_executable:python, python_sha256:hash(readFileSync(python)),
    bridge_sha256:hash(readFileSync(path.join(source,'feedback_currentness_pipe.py'))),
    ipc_pipe_sha256:hash(readFileSync(path.join(source,'ipc_pipe.py'))), timeout_ms:2000,
    valid_until:new Date(Date.now()+30000).toISOString(), ...overrides};
}
const current = () => true;
const skipped = {skip:!enabled && 'actual Windows kernel + SOULFORGE_SECURE_WORK_TEST_PYTHON required'};

test('actual current-user kernel pipe returns exact metadata, fresh challenges and closes owned handles', skipped, async t => {
  const before = readdirSync(os.tmpdir()).filter(name => name.startsWith('sf-feedback-currentness-')).sort();
  const fixed = binding(), challenges = [];
  const server = await startFeedbackCurrentnessServer({binding:fixed, assertCurrent:current,
    assertCurrentPublication:challenge => {challenges.push(challenge); return answer(challenge);}});
  const client = createFeedbackCurrentnessClient({binding:fixed, assertCurrent:current});
  try {
    for (let index=0; index<4; index++) {
      const value = await client.request(expected());
      assert.deepEqual(Object.fromEntries(Object.keys(expected()).map(key => [key,value[key]])),expected());
      assert.equal(value.execution_authority,false); assert.equal(Object.keys(value).length,13);
    }
    assert.equal(challenges.length,4); assert.equal(new Set(challenges).size,4);
  } finally {await client.close(); await server.close();}
  await assert.rejects(client.request(expected()));
  // FIRST_PIPE_INSTANCE succeeds again only after the owned server handle closes.
  const reopened = await startFeedbackCurrentnessServer({binding:fixed, assertCurrent:current, assertCurrentPublication:answer});
  await reopened.close();
  assert.deepEqual(readdirSync(os.tmpdir()).filter(name => name.startsWith('sf-feedback-currentness-')).sort(),before);
  t.diagnostic('Same-user synthetic kernel authentication only; separate installed SENDER/G1 accounts remain untested.');
});

test('server closed promise observes explicit close, expiry and failure after cleanup', skipped, async () => {
  for (const ending of ['close', 'expiry', 'failure']) {
    const before = readdirSync(os.tmpdir()).filter(name => name.startsWith('sf-feedback-currentness-')).sort();
    const fixed = binding(ending === 'expiry' ? {valid_until:new Date(Date.now()+600).toISOString()} : {});
    const server = await startFeedbackCurrentnessServer({binding:fixed, assertCurrent:current,
      assertCurrentPublication:ending === 'failure' ? () => {throw new Error('synthetic_publication_failure');} : answer});
    assert.ok(server.closed instanceof Promise);
    let client;
    try {
      if (ending === 'close') {await server.close(); await server.closed;}
      else {
        const observed = assert.rejects(server.closed);
        if (ending === 'failure') {
          client = createFeedbackCurrentnessClient({binding:fixed, assertCurrent:current});
          await assert.rejects(client.request(expected()));
        }
        let timer;
        try {await Promise.race([observed, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('lifetime_observation_timeout')), 2000);
        })]);} finally {clearTimeout(timer);}
      }
      assert.deepEqual(readdirSync(os.tmpdir()).filter(name => name.startsWith('sf-feedback-currentness-')).sort(), before);
    } finally {await client?.close(); await server.close();}
  }
});

test('callback drain remains pending after close, expiry and timeout until the original callback settles', skipped, async () => {
  for (const ending of ['close', 'expiry', 'timeout']) {
    const fixed = binding({timeout_ms:ending === 'timeout' ? 500 : 2000,
      ...(ending === 'expiry' ? {valid_until:new Date(Date.now()+700).toISOString()} : {})});
    let enter, finish, challenge, drained = false;
    const entered = new Promise(resolve => {enter = resolve;});
    const original = new Promise(resolve => {finish = resolve;});
    const server = await startFeedbackCurrentnessServer({binding:fixed, assertCurrent:current,
      assertCurrentPublication:value => {challenge = value; enter(); return original;}});
    server.drained.then(() => {drained = true;});
    const client = createFeedbackCurrentnessClient({binding:fixed, assertCurrent:current});
    const rejected = assert.rejects(client.request(expected()));
    try {
      await entered;
      if (ending === 'close') {await server.close(); await server.closed;}
      else await assert.rejects(server.closed);
      await rejected;
      assert.equal(drained, false, `${ending}: original callback is still live`);
      // This represents the installed caller retaining its protection hooks
      // across pipe shutdown and only releasing them after the original work.
      finish(answer(challenge));
      await server.drained;
      assert.equal(drained, true, `${ending}: original callback settled`);
    } finally {finish(answer(challenge ?? 'a'.repeat(32))); await client.close(); await server.close(); await server.drained;}
  }
});

test('current callback cannot replace helper snapshot bytes/set before spawn or result acceptance', skipped, async () => {
  for (const mutation of ['ipc_bytes', 'bridge_bytes', 'extra_file', 'at_result']) {
    const fixed = binding(), server = await startFeedbackCurrentnessServer({binding:fixed, assertCurrent:current, assertCurrentPublication:answer});
    const existing = new Set(readdirSync(os.tmpdir()));
    let changed = false, received = false;
    const originalSpawn = childProcess.spawn;
    const spy = mock.method(childProcess, 'spawn', (...args) => {
      const child = originalSpawn(...args);
      child.stdout.on('data', () => {received = true;});
      return child;
    });
    syncBuiltinESMExports();
    const client = createFeedbackCurrentnessClient({binding:{...fixed,
      ...(mutation === 'ipc_bytes' ? {server_sid:'S-1-5-21-111-222-333-9999'} : {})}, assertCurrent() {
      if (changed || mutation === 'at_result' && !received) return true;
      const name = readdirSync(os.tmpdir()).find(member => member.startsWith('sf-feedback-currentness-') && !existing.has(member));
      if (!name) return true;
      const root = path.join(os.tmpdir(), name), bridge = path.join(root, 'feedback_currentness_pipe.py'), pipe = path.join(root, 'ipc_pipe.py');
      if (!existsSync(bridge) || !existsSync(pipe)) return true;
      if (mutation === 'ipc_bytes') writeFileSync(pipe, readFileSync(pipe, 'utf8').replaceAll('if actual != expected_sid:', 'if False:'));
      else if (mutation === 'extra_file') writeFileSync(path.join(root, 'foreign.py'), '# unpinned code', {flag:'wx'});
      else writeFileSync(bridge, '\n# changed snapshot', {flag:'a'});
      changed = true;
      return true;
    }});
    try {
      await assert.rejects(client.request(expected()));
      assert.equal(changed, true, mutation);
      assert.equal(spy.mock.callCount(), mutation === 'at_result' ? 1 : 0, mutation);
    } finally {await client.close(); spy.mock.restore(); syncBuiltinESMExports(); await server.close();}
  }
});

test('actual wrong server and client SIDs are rejected before publication callback', skipped, async () => {
  for (const role of ['server','client']) {
    const fixed = binding(), foreign = 'S-1-5-21-111-222-333-9999'; let calls=0;
    const server = await startFeedbackCurrentnessServer({binding:{...fixed,...(role==='client'?{client_sid:foreign}:{})},
      assertCurrent:current,assertCurrentPublication:challenge=>{calls++;return answer(challenge);}});
    const client = createFeedbackCurrentnessClient({binding:{...fixed,...(role==='server'?{server_sid:foreign}:{})},assertCurrent:current});
    try {await assert.rejects(client.request(expected())); assert.equal(calls,0);}
    finally {await client.close();await server.close();}
  }
});

test('nonce, freshness, exact hashes, shape and oversized metadata fail closed', skipped, async () => {
  for (const mutate of [v=>({...v,challenge:'0'.repeat(32)}), v=>({...v,observed_at:new Date(Date.now()-6000).toISOString()}),
    v=>({...v,body_sha256:'0'.repeat(64)}), v=>({...v,raw:'forbidden'}), v=>({...v,review_ref:'x'.repeat(5000)})]) {
    const fixed=binding(),server=await startFeedbackCurrentnessServer({binding:fixed,assertCurrent:current,
      assertCurrentPublication:challenge=>mutate(answer(challenge))});
    const client=createFeedbackCurrentnessClient({binding:fixed,assertCurrent:current});
    try {await assert.rejects(client.request(expected()));}
    finally {await client.close();await server.close();}
  }
});

test('a second challenge on the same connection is rejected instead of being reentered', skipped, async () => {
  const fixed=binding();let calls=0;
  const server=await startFeedbackCurrentnessServer({binding:fixed,assertCurrent:current,
    assertCurrentPublication:challenge=>{calls++;return answer(challenge);}});
  const program=`import sys,time,json,struct
sys.path.insert(0,sys.argv[1])
from ipc_pipe import Pipe,ChannelError
def frame(challenge):
 body=json.dumps({'challenge':challenge},separators=(',',':')).encode('ascii')
 return struct.pack('!I',len(body))+body
with Pipe.connect(sys.argv[2],sys.argv[3],time.monotonic()+2) as pipe:
 pipe.write(frame('a'*32)+frame('b'*32))
 size=struct.unpack('!I',pipe.read(4))[0]
 value=json.loads(pipe.read(size))
 assert value['challenge']=='a'*32
 try: pipe.read(4)
 except ChannelError: pass
 else: raise AssertionError('second request was accepted')`;
  try {
    await new Promise((resolve,reject)=>{
      const child=childProcess.spawn(python,['-I','-S','-B','-c',program,source,fixed.pipe_name,sid],
        {windowsHide:true,stdio:['ignore','ignore','ignore']});
      const timer=setTimeout(()=>{child.kill();reject(new Error('reentry_fixture_timeout'));},3000);
      child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('reentry_fixture_failed'));});
    });
    assert.equal(calls,1);
  } finally {await server.close();}
});

test('revocation and trusted binding mutation stop the next request', skipped, async () => {
  const fixed=binding();let live=true,calls=0;
  const server=await startFeedbackCurrentnessServer({binding:fixed,assertCurrent:()=>live,
    assertCurrentPublication:challenge=>{calls++;return answer(challenge);}});
  const client=createFeedbackCurrentnessClient({binding:fixed,assertCurrent:current});
  try {
    await client.request(expected());live=false;
    await assert.rejects(client.request(expected()));assert.equal(calls,1);
    fixed.server_sid='S-1-5-21-111-222-333-9999';
    await assert.rejects(client.request(expected()),{code:'FEEDBACK_CURRENTNESS_BINDING_CHANGED'});
    assert.throws(()=>createFeedbackCurrentnessClient({binding:binding(),assertCurrent:()=>false}),{code:'FEEDBACK_CURRENTNESS_REVOKED'});
  } finally {await client.close();await server.close();}
});

test('source and executable pin drift rejects before spawning any helper', skipped, async () => {
  const original=childProcess.spawn, spy=mock.method(childProcess,'spawn',(...args)=>original(...args));syncBuiltinESMExports();
  try {
    for (const key of ['python_sha256','bridge_sha256','ipc_pipe_sha256']) {
      const client=createFeedbackCurrentnessClient({binding:binding({[key]:'0'.repeat(64)}),assertCurrent:current});
      try {await assert.rejects(client.request(expected()));} finally {await client.close();}
    }
    assert.equal(spy.mock.callCount(),0);
  } finally {spy.mock.restore();syncBuiltinESMExports();}
});

test('actual malformed, duplicate and oversized pipe frames never reach the trusted callback', skipped, async () => {
  const bodies=[Buffer.from('{"challenge":"'+'a'.repeat(32)+'","challenge":"'+'b'.repeat(32)+'"}'),
    Buffer.from('{"request":"unexpected"}'),Buffer.alloc(4097,32)];
  for (const body of bodies) {
    const fixed=binding();let calls=0;
    const server=await startFeedbackCurrentnessServer({binding:fixed,assertCurrent:current,
      assertCurrentPublication:challenge=>{calls++;return answer(challenge);}});
    const prefix=Buffer.alloc(4);prefix.writeUInt32BE(body.length);
    // Deliberately malformed synthetic peer uses the same real Pipe SID checks.
    const program='import sys,time,base64;sys.path.insert(0,sys.argv[1]);from ipc_pipe import Pipe\nwith Pipe.connect(sys.argv[2],sys.argv[3],time.monotonic()+2) as p:p.write(base64.b64decode(sys.argv[4]))';
    try {
      await new Promise((resolve,reject)=>{
        const child=childProcess.spawn(python,['-I','-S','-B','-c',program,source,fixed.pipe_name,sid,Buffer.concat([prefix,body]).toString('base64')],
          {windowsHide:true,stdio:['ignore','ignore','ignore']});
        const timer=setTimeout(()=>{child.kill();reject(new Error('rogue_fixture_timeout'));},3000);
        child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('rogue_fixture_failed'));});
      });
      assert.equal(calls,0);
    } finally {await server.close();}
  }
});

test('bounded timeout and close terminate pending exchanges without a partial result', skipped, async () => {
  const fixed=binding({timeout_ms:600});
  const server=await startFeedbackCurrentnessServer({binding:fixed,assertCurrent:current,assertCurrentPublication:()=>new Promise(()=>{})});
  const client=createFeedbackCurrentnessClient({binding:fixed,assertCurrent:current});
  const started=Date.now();
  try {await assert.rejects(client.request(expected()));assert.ok(Date.now()-started<3000);}
  finally {await client.close();await server.close();}
  const absent=createFeedbackCurrentnessClient({binding:binding({timeout_ms:300}),assertCurrent:current});
  try {await assert.rejects(absent.request(expected()));} finally {await absent.close();}
  let entered;
  const enteredCallback=new Promise(resolve=>{entered=resolve;}), liveBinding=binding();
  const liveServer=await startFeedbackCurrentnessServer({binding:liveBinding,assertCurrent:current,
    assertCurrentPublication:()=>{entered();return new Promise(()=>{});}});
  const liveClient=createFeedbackCurrentnessClient({binding:liveBinding,assertCurrent:current});
  const rejected=assert.rejects(liveClient.request(expected()));
  await enteredCallback;
  await liveClient.close();await liveServer.close();await rejected;
  // Closing during preparation also waits for any helper started concurrently.
  const preparing=createFeedbackCurrentnessClient({binding:binding(),assertCurrent:current});
  const preparationRejected=assert.rejects(preparing.request(expected()));
  await preparing.close();await preparationRejected;
});
