// Product-runtime scheduling for already bound ports. Installers supply the
// worker and watchdog in separate processes; this does not register host tasks.
// An idle or unchanged poll performs no inference itself.
export function startFeedbackPolling({ runOnce, intervalMs = 60_000, onStatus = () => {},
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  if (![runOnce,onStatus,now,setTimer,clearTimer].every(fn=>typeof fn==='function')
    || !Number.isSafeInteger(intervalMs) || intervalMs < 1_000 || intervalMs > 3_600_000) throw new TypeError('feedback_polling_invalid');
  let stopped=false, timer=null, inFlight=null, sequence=0, lastStatus=null;
  async function run() {
    const started=now(); let status;
    try {
      const result=await runOnce();
      status=typeof result?.status==='string' && /^[A-Z_]{1,64}$/u.test(result.status) ? result.status : 'SOURCE_UNAVAILABLE';
    } catch { status='SOURCE_UNAVAILABLE'; }
    sequence+=1;lastStatus=status;
    // The callback receives no request body, exception text, or provider result.
    // Callback errors cannot kill polling; health is observed independently.
    try { Promise.resolve(onStatus(Object.freeze({sequence,status,started_at:started,finished_at:now()}))).catch(()=>{}); } catch {}
    return {status};
  }
  function tick() {
    if(stopped)return Promise.resolve({status:'STOPPED'});
    if(!inFlight)inFlight=run().finally(()=>{
      inFlight=null;
      if(!stopped)timer=setTimer(()=>{timer=null;void tick();},intervalMs);
    });
    return inFlight;
  }
  void tick();
  return Object.freeze({
    state:()=>({stopped,running:inFlight!==null,sequence,last_status:lastStatus}),
    async stop({stopActive}={}) {
      stopped=true;if(timer!==null){clearTimer(timer);timer=null;}
      if(typeof stopActive==='function')await stopActive();
      return inFlight ?? {status:'STOPPED'};
    },
  });
}
