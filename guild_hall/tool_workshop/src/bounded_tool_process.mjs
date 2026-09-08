import { spawn } from 'node:child_process';
import { fstatSync } from 'node:fs';

// Trusted executor seam. Request envelopes never supply executable or args.
export function runBoundedToolProcess({executable,args,runRoot,lease,queue,deadline,resultFormat='json',stdoutFd=null}) {
  return new Promise((resolve,reject)=>{
    if (!['json','exit_code'].includes(resultFormat) || stdoutFd !== null
      && (resultFormat !== 'exit_code' || !Number.isInteger(stdoutFd))) {
      return reject(Object.assign(new Error('runner_output_mode_invalid'),{code:'runner_output_mode_invalid'}));
    }
    if (stdoutFd !== null) {
      try { if (!fstatSync(stdoutFd).isFile()) throw new Error(); }
      catch { return reject(Object.assign(new Error('runner_output_mode_invalid'),{code:'runner_output_mode_invalid'})); }
    }
    try {queue.assertCurrentLease(lease,new Date().toISOString());} catch(error){return reject(error);}
    const remaining=Math.min(Date.parse(lease.expires_at)-Date.now(),deadline-performance.now());
    if(remaining<=0) return reject(Object.assign(new Error('runner_timeout'),{code:'runner_timeout'}));
    const env={TEMP:runRoot,TMP:runRoot,HOME:runRoot,USERPROFILE:runRoot};
    if(process.platform==='win32') env.SystemRoot=process.env.SystemRoot;
    // A trusted adapter may supply its already-opened create-only raster file.
    // No job envelope controls this descriptor or the executable arguments.
    const child=spawn(executable,args,{cwd:runRoot,env,shell:false,windowsHide:true,stdio:['ignore',stdoutFd??'pipe','pipe']});
    let stdout='',count=0,stopCode=null;
    const stop=code=>{if(!stopCode){stopCode=code;child.kill();}};
    const timeout=setTimeout(()=>stop('runner_timeout'),remaining);
    const poll=setInterval(()=>{
      try {queue.assertCurrentLease(lease,new Date().toISOString());}
      catch(error){stop(error.code==='job_cancel_requested'?'cancelled':error.code==='lease_expired'?'runner_timeout':'fence_stale');}
    },50);
    child.stdout?.on('data',chunk=>{count+=chunk.length;if(count>4096)stop('runner_failed');else stdout+=chunk;});
    child.stderr.on('data',chunk=>{count+=chunk.length;if(count>4096)stop('runner_failed');});
    child.on('error',()=>{stopCode='runner_failed';});
    child.on('close',code=>{
      clearTimeout(timeout);clearInterval(poll);
      if(stopCode || code!==0) return reject(Object.assign(new Error(stopCode??'runner_failed'),{code:stopCode??'runner_failed'}));
      if(resultFormat==='exit_code') return resolve({exit_code:0});
      try {resolve(JSON.parse(stdout));} catch {reject(Object.assign(new Error('validator_failed'),{code:'validator_failed'}));}
    });
  });
}
