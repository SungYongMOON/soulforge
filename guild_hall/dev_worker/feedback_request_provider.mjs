// Reuse an issued bounded dev-worker request. This adapter never turns a Linear
// title, a model reply, or its own approval flag into execution authority.
import {createHash} from 'node:crypto';
import {normalizeTaskPacket} from './claim_task.mjs';

const ref=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u.test(value);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
const fail=code=>{throw Object.assign(new Error(code),{feedbackCode:code});};
const fields=['request_ref','source_ref','semantic_sha256','authority_ref','authority_revision','valid_from','valid_until','packet'];
const iso=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  &&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;

export function createFeedbackRequestProvider({resolveRequest,currentAuthority,now=Date.now}={}) {
  if(![resolveRequest,currentAuthority,now].every(fn=>typeof fn==='function'))throw new TypeError('feedback_request_ports_required');
  async function resolve(item) {
    if(!ref(item?.source_ref)||!ref(item?.scope_ref)||!sha(item?.semantic_sha256))fail('FEEDBACK_REQUEST_INVALID');
    const value=await resolveRequest(item.source_ref,item.semantic_sha256);
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length
      ||fields.some(key=>!Object.hasOwn(value,key))||![value.request_ref,value.authority_ref,value.authority_revision].every(ref)
      ||value.source_ref!==item.source_ref||value.semantic_sha256!==item.semantic_sha256
      ||!iso(value.valid_from)||!iso(value.valid_until))fail('FEEDBACK_REQUEST_UNAVAILABLE');
    const serialized=JSON.stringify(value.packet);
    if(typeof serialized!=='string'||Buffer.byteLength(serialized)>64*1024)fail('FEEDBACK_REQUEST_INVALID');
    const packet=JSON.parse(serialized);
    const normalized=normalizeTaskPacket(packet,{packet_path:'feedback.yaml',packet_ref:value.request_ref});
    if(!normalized.eligible||packet.schema_version!=='soulforge.dev_worker_request.v0'
      ||packet.origin?.kind!=='agent_generated')fail('FEEDBACK_PACKET_INELIGIBLE');
    const assertion=Object.freeze({request_ref:value.request_ref,source_ref:item.source_ref,semantic_sha256:item.semantic_sha256,
      scope_ref:item.scope_ref,authority_ref:value.authority_ref,authority_revision:value.authority_revision,
      packet_sha256:hash(packet),valid_from:value.valid_from,valid_until:value.valid_until});
    const fresh=()=>Number.isSafeInteger(now())&&Date.parse(assertion.valid_from)<=now()&&Date.parse(assertion.valid_until)>now();
    if(!fresh()||await currentAuthority(assertion)!==true||!fresh())fail('FEEDBACK_REQUEST_AUTHORITY_CHANGED');
    // A resolver/current authority is owned by the live dispatcher. Its decision
    // must bind the exact source, scope and packet digest, not just request_ref.
    return{packet,assertion};
  }
  return Object.freeze({
    async prepare(item) {
      const current=await resolve(item);
      return{status:'READY',packet:current.packet,packet_sha256:current.assertion.packet_sha256};
    },
    async authorize(_action,item,execution={}) {
      try{
        const current=await resolve(item);
        return execution.packet_sha256==null || (sha(execution.packet_sha256)&&execution.packet_sha256===current.assertion.packet_sha256);
      }catch{return false;}
    },
  });
}
