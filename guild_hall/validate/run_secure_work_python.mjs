#!/usr/bin/env node
// Keyless CI by default. An explicit read-only test kit/interpreter is optional;
// operational config, user Python hooks and live-route environment never pass.
import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function secureWorkPythonCommand({ pythonExecutable, kitRoot, environment = process.env } = {}) {
  for (const path of [pythonExecutable, kitRoot]) if (path !== undefined && (typeof path !== 'string' || !isAbsolute(path))) throw new Error('secure_python_path_invalid');
  const env = {};
  for (const [key,value] of Object.entries(environment)) if (/^(PATH|SystemRoot|WINDIR|TEMP|TMP)$/i.test(key)) env[key] = value;
  env.PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1';
  if (kitRoot) env.SOULFORGE_SECURE_WORK_KIT_ROOT = kitRoot;
  const args = ['-I','-B','-m','pytest','-q','-ra','--tb=short','-p','no:cacheprovider','guild_hall/secure_work/tests'];
  // E14 requirements-tested.txt pins these optional contract dependencies.
  // Bind the kit explicitly; do not discover its path or read runtime config.
  const kitDependencies = kitRoot ? ['--with','pydantic==2.13.4','--with','jsonschema==4.26.0'] : [];
  return {command: pythonExecutable ?? 'uv', args: pythonExecutable ? args : ['--no-config','run','--no-project','--with','pytest==9.0.2','--with','cryptography==46.0.4',...kitDependencies,'python',...args], env};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args=process.argv.slice(2), options={};
    if (args.length===1 && args[0]==='--help') {
      console.log('node run_secure_work_python.mjs [--python-executable <absolute-path>] [--kit-root <read-only-test-kit>]');
    } else {
      for(let i=0;i<args.length;i+=2) {
        const key=args[i]==='--python-executable'?'pythonExecutable':args[i]==='--kit-root'?'kitRoot':null;
        if(!key || !args[i+1] || options[key]!==undefined) throw new Error('secure_python_arguments_invalid');
        options[key]=args[i+1];
      }
      const invocation=secureWorkPythonCommand(options);
      const result=spawnSync(invocation.command,invocation.args,{cwd:fileURLToPath(new URL('../../',import.meta.url)),env:invocation.env,windowsHide:true,stdio:'inherit',timeout:180000});
      if(result.error) console.error('secure_python_runner_unavailable');
      process.exitCode=Number.isInteger(result.status)?result.status:1;
    }
  } catch { console.error('secure_python_arguments_invalid');process.exitCode=1; }
}
