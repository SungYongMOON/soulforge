import test from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { secureWorkPythonCommand } from './run_secure_work_python.mjs';

test('keyless CI excludes operational config, live route, Python injection and inherited kit',()=>{
  const input={PATH:'synthetic-bin',SystemRoot:'synthetic-os',SOULFORGE_SECURE_WORK_CONFIG:'must-not-read',SOULFORGE_SECURE_WORK_KIT_ROOT:'unapproved-kit',PYTHONPATH:'must-not-import',VIRTUAL_ENV:'must-not-activate',UV_INDEX_URL:'must-not-contact',LIVE_ENABLED:'1'};
  const command=secureWorkPythonCommand({environment:input});
  assert.deepEqual(command.env,{PATH:'synthetic-bin',SystemRoot:'synthetic-os',PYTEST_DISABLE_PLUGIN_AUTOLOAD:'1'});
  assert.equal(command.command,'uv');assert.ok(command.args.includes('--no-config'));
  assert.ok(command.args.includes('pytest==9.0.2'));assert.ok(command.args.includes('cryptography==46.0.4'));
});
test('explicit interpreter and read-only test kit are the sole opt-ins',()=>{
  const command=secureWorkPythonCommand({pythonExecutable:process.execPath,kitRoot:tmpdir(),environment:{}});
  assert.equal(command.command,process.execPath);assert.deepEqual(command.env,{SOULFORGE_SECURE_WORK_KIT_ROOT:tmpdir(),PYTEST_DISABLE_PLUGIN_AUTOLOAD:'1'});
  assert.deepEqual(command.args.slice(0,4),['-I','-B','-m','pytest']);
  assert.throws(()=>secureWorkPythonCommand({kitRoot:'relative'}),/secure_python_path_invalid/);
});
