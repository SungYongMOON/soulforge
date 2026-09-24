// Explicit local source bindings; no network, source mutation, or authority grant.
import { openSourceRoot } from '../adapters/sources/guarded_files.mjs';
import { parseSegments as parseVoiceSegments } from '../adapters/sources/voice_session_source.mjs';
import { validateVoiceRouteLedger } from '../runtime/voice_routes.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { hashText } from './data.mjs';
import { isAiWorkMemoRecord as isMemo } from './history.mjs';
import { readMailHistory, readSlackHistory } from './history_mail_slack.mjs';

const fail = code => { throw new Error(code); };
const safe = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u.test(value);
const kstDay = instant => {
  if (typeof instant !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/u.test(instant) || !Number.isFinite(Date.parse(instant))) fail('history_source_time_invalid');
  return new Date(Date.parse(instant) + 9 * 3600000).toISOString().slice(0,10);
};
const inWindow = (instant, from, through) => { const day = kstDay(instant); return day >= from && day <= through; };
const idFor = (kind, native) => `${kind}:${hashText(native).slice(7)}`;
function bounded(config) {
  let files = 0, bytes = 0;
  const fileLimit = config.max_files ?? 20000, byteLimit = config.max_total_bytes ?? 512 * 1024 * 1024;
  if (!Number.isSafeInteger(fileLimit) || fileLimit < 1 || fileLimit > 100000
    || !Number.isSafeInteger(byteLimit) || byteLimit < 1 || byteLimit > 2 ** 31) fail('history_source_budget_invalid');
  return async (root, path, max = 4 * 1024 * 1024) => {
    if (++files > fileLimit) fail('history_source_file_budget');
    const result = await root.readText(path,max); bytes += result.bytes;
    if (bytes > byteLimit) fail('history_source_byte_budget');
    return result;
  };
}
function requireProject(project, config) {
  if (!config || config.project !== project) fail('history_source_project_mismatch');
}
function noteText(text, config) {
  return (config.ai_note_markers ?? []).some(marker => typeof marker === 'string' && marker.length >= 4 && text.includes(marker));
}
function flatRecord(project, kind, native, instant, text, title, sender, refs, extra = {}) {
  return { id: idFor(kind,native), project, date: kstDay(instant), kind, title: String(title ?? ''),
    sender: String(sender ?? '미기록'), recipient: '미기록', attachments: [], thread_ref: idFor(kind,native),
    text, text_sha256: hashText(text), originrefs: refs, ...extra };
}

export async function readLinearHistory({project,fromDate,throughDate,config}) {
  requireProject(project,config);
  if (!Array.isArray(config.project_ids) || !config.project_ids.every(safe)) fail('history_linear_project_ids_invalid');
  const root = openSourceRoot(config.root), read = bounded(config);
  const receipts = [], records = [], excluded = [], allIssues = new Map();
  async function snapshots(kind, objectId) {
    if (!safe(objectId)) fail('history_linear_object_id_invalid');
    const rows = [];
    for (const file of await root.list([kind,objectId])) {
      if (!file.file || !/^[0-9a-f]{64}\.json$/u.test(file.name)) continue;
      const result = await read(root,[kind,objectId,file.name]);
      const value = JSON.parse(result.text);
      if (value.schema_version !== 'soulforge.linear_collect.custody_object.v1' || value.kind !== kind
        || value.object_id !== objectId || value.object?.id !== objectId
        || value.content_sha256 !== 'sha256:'+file.name.slice(0,-5)
        || sha256Canonical(value.object) !== value.content_sha256) fail('history_linear_custody_mismatch');
      rows.push({value: value.object,sha256:value.content_sha256, file:[kind,objectId,file.name]});
    }
    return rows.sort((a,b)=>String(a.value.updated_at??a.value.created_at).localeCompare(String(b.value.updated_at??b.value.created_at))
      || a.sha256.localeCompare(b.sha256));
  }
  const issueEntries = await root.list(['issues']);
  // An empty configured custody directory is real empty; an absent directory is not.
  await root.list([]).then(entries=>{if(!entries.some(e=>e.name==='issues'&&e.directory))fail('history_linear_issues_missing');});
  for (const entry of issueEntries) {
    if (!entry.directory) continue;
    const latest = (await snapshots('issues',entry.name)).at(-1);
    if (!latest || !config.project_ids.includes(latest.value.project_id)) continue;
    allIssues.set(entry.name,latest);
    const row = latest.value, instant = row.updated_at ?? row.created_at;
    if (!inWindow(instant,fromDate,throughDate)) continue;
    const body = String(row.description ?? '');
    if (isMemo(row) || noteText(body,config) || (config.ai_note_label_ids ?? []).some(id => (row.label_ids ?? []).includes(id))) {
      excluded.push({kind:'linear',id_hash:hashText(entry.name),reason:'ai_work_note'}); continue;
    }
    const text = `${row.title ?? ''}${body ? '\n'+body : ''}`;
    records.push(flatRecord(project,'linear',`issue:${entry.name}`,instant,text,row.title,row.creator_id,
      [{source_kind:'linear',source_root:config.root,object_id:entry.name,object_kind:'issues',path:latest.file,content_sha256:latest.sha256,
        project_id:row.project_id,time_basis:'provider_updated_at',snapshot_not_event_history:true}],
      {thread_ref:idFor('linear',entry.name)}));
  }
  for (const kind of ['comments','issue_history']) {
    const entries = await root.list([kind]);
    if (!(await root.list([])).some(e=>e.name===kind&&e.directory)) fail('history_linear_related_missing');
    for (const entry of entries) {
      if (!entry.directory) continue;
      const latest = (await snapshots(kind,entry.name)).at(-1);
      if (!latest || !allIssues.has(latest.value.issue_id)) continue;
      const row = latest.value, instant = row.created_at;
      if (!inWindow(instant,fromDate,throughDate)) continue;
      if (isMemo(row) || (config.ai_note_user_ids ?? []).includes(row.user_id ?? row.actor_id)
        || noteText(String(row.body ?? ''),config)) {
        excluded.push({kind:'linear',id_hash:hashText(entry.name),reason:'ai_work_note'}); continue;
      }
      let text = String(row.body ?? '');
      if (kind === 'issue_history') {
        const pairs = ['title','state_id','assignee_id','due_date','priority','project_id','parent_id','team_id'];
        text = pairs.filter(field=>Object.hasOwn(row,`from_${field}`)||Object.hasOwn(row,`to_${field}`))
          .filter(field=>row[`from_${field}`]!==row[`to_${field}`])
          .map(field=>`${field}: ${row[`from_${field}`]??'없음'} → ${row[`to_${field}`]??'없음'}`).join('\n');
        if (!text) { excluded.push({kind:'linear',id_hash:hashText(entry.name),reason:'change_without_literal_fields'}); continue; }
      }
      if (!text.trim()) { excluded.push({kind:'linear',id_hash:hashText(entry.name),reason:'empty_body'}); continue; }
      const issue = allIssues.get(row.issue_id).value;
      records.push(flatRecord(project,'linear',`${kind}:${entry.name}`,instant,text,issue.title,
        row.user_id ?? row.actor_id ?? '미기록',[{source_kind:'linear',source_root:config.root,object_kind:kind,object_id:entry.name,
          issue_id:row.issue_id,project_id:issue.project_id,path:latest.file,content_sha256:latest.sha256,time_basis:'provider_created_at'}],
        {thread_ref:idFor('linear',row.issue_id)}));
    }
  }
  receipts.push({source_kind:'linear',root_ref:hashText(config.root),project_ids:config.project_ids,selected_records:records.length});
  return {records,displayMetadata:{},receipt:{status:'ok',records:records.length,excluded:excluded.length},excluded,sourceReceipts:receipts};
}

export async function readVoiceHistory({project,fromDate,throughDate,config}) {
  requireProject(project,config);
  if (!['confirmed','first_candidate'].includes(config.project_policy)) fail('history_voice_policy_required');
  const sessions = openSourceRoot(config.sessions_root), cardsRoot = openSourceRoot(config.cards_root);
  const routes = config.routes_root ? openSourceRoot(config.routes_root) : null;
  if (config.project_policy==='confirmed'&&!routes) fail('history_voice_routes_required');
  const read = bounded(config), records = [], excluded = [], receipts = [];
  const routeNames = routes ? new Set((await routes.list([])).filter(e=>e.file).map(e=>e.name)) : new Set();
  const days = (await sessions.list([])).filter(e=>e.directory&&/^\d{4}-\d{2}-\d{2}$/u.test(e.name)&&e.name>=fromDate&&e.name<=throughDate);
  for (const date of days) for (const session of await sessions.list([date.name])) {
    if (!session.directory || !safe(session.name)) continue;
    const manifestRead = await read(sessions,[date.name,session.name,'session_manifest.json']);
    const manifest = JSON.parse(manifestRead.text);
    if (manifest.session_id!==session.name) fail('history_voice_session_mismatch');
    const started = Date.parse(manifest.recorded_at_local);
    if (!Number.isFinite(started)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(manifest.recorded_at_local??'')) fail('history_voice_clock_invalid');
    const candidates = [];
    for (const run of await cardsRoot.list([session.name])) {
      if (!run.directory || !safe(run.name)) continue;
      if (!(await cardsRoot.list([session.name,run.name])).some(e=>e.name==='conversation_list.v0.json'&&e.file)) continue;
      const raw = await read(cardsRoot,[session.name,run.name,'conversation_list.v0.json']);
      const card = JSON.parse(raw.text);
      if (card.schema!=='soulforge.voice_conversation_list.v0'||card.session_id!==session.name || card.run_id!==run.name || !Array.isArray(card.segments)
        || !Number.isFinite(Date.parse(card.generated_at))) fail('history_voice_card_invalid');
      candidates.push({card,sha256:raw.sha256,run:run.name});
    }
    candidates.sort((a,b)=>a.card.generated_at.localeCompare(b.card.generated_at)||a.run.localeCompare(b.run));
    const latest=candidates.at(-1);
    if (!latest) fail('history_voice_card_missing');
    let ledger = null, ledgerHash = null;
    if (routes&&routeNames.has(session.name+'.json')) {
      const rawLedger=await read(routes,[session.name+'.json']); ledgerHash=rawLedger.sha256;
      ledger=validateVoiceRouteLedger(JSON.parse(rawLedger.text),{sessionId:session.name});
    }
    const selected=[];
    for(const segment of latest.card.segments){
      if(!safe(segment.segment_id))fail('history_voice_segment_invalid');
      const human=ledger?.segments.find(s=>s.segment_id===segment.segment_id);
      const veto=human?.withdrawn?.some(row=>row.project_code===project) || (human?.status==='confirmed'&&human.project_candidates?.[0]?.project_code!==project);
      if(veto)continue;
      const confirmed=human?.status==='confirmed'&&human.project_candidates?.[0]?.project_code===project
        && JSON.stringify(human.source_segment_ids)===JSON.stringify(segment.source_segment_ids)
        && Array.isArray(human.transcript_ref)&&human.transcript_ref.includes(latest.card.transcript?.run_id);
      const candidate=config.project_policy==='first_candidate'&&segment.project_candidates?.[0]?.project_code===project;
      if(!confirmed&&!candidate)continue;
      if(!Number.isFinite(segment.start_seconds)||!Number.isFinite(segment.end_seconds)
        ||segment.start_seconds<0||segment.end_seconds<segment.start_seconds)fail('history_voice_range_invalid');
      const instant=new Date(started+segment.start_seconds*1000).toISOString();
      if(!inWindow(instant,fromDate,throughDate))continue;
      selected.push({segment,instant,strength:confirmed?'confirmed':'candidate_only_not_accepted'});
    }
    if(!selected.length)continue;
    const tr=latest.card.transcript;
    if(!safe(tr?.run_id)||!/^sha256:[0-9a-f]{64}$/u.test(tr?.sha256??''))fail('history_voice_transcript_ref_invalid');
    const transcriptPath=[date.name,session.name,'analysis','local_asr',tr.run_id,'transcript.jsonl'];
    const transcript=await read(sessions,transcriptPath,32*1024*1024);
    if(transcript.sha256!==tr.sha256)fail('history_voice_transcript_digest_mismatch');
    const byId=new Map();
    for(const row of parseVoiceSegments(transcript.text)){
      if(byId.has(row.segment_id))fail('history_voice_duplicate_asr_segment');
      byId.set(row.segment_id,row);
    }
    for(const {segment,instant,strength} of selected){
      const ids=segment.source_segment_ids;
      if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)))fail('history_voice_source_ids_invalid');
      const native=ids.map(id=>byId.get(id));
      if(native.some(row=>!row||row.analysis_run_id!==tr.run_id))fail('history_voice_source_missing');
      if(native.some(row=>!Number.isFinite(row.start_seconds)||!Number.isFinite(row.end_seconds)
        ||row.end_seconds<row.start_seconds||row.start_seconds<segment.start_seconds-0.02||row.end_seconds>segment.end_seconds+0.02)
        ||ids.some((id,index)=>index>0&&id<=ids[index-1]))fail('history_voice_range_mismatch');
      if(ids.some(id=>latest.card.segments.filter(s=>s.source_segment_ids?.includes(id)).length!==1))fail('history_voice_source_overlap');
      const text=native.map(row=>row.content).join('\n');
      records.push(flatRecord(project,'voice_card_unverified_ASR',`${session.name}:${segment.segment_id}`,instant,text,
        String(segment.title??'녹음'), '발화자 미확인', [{source_kind:'voice',source_root:config.sessions_root,card_source_root:config.cards_root,
          session_id:session.name,card_run_id:latest.run,
          card_segment_id:segment.segment_id,card_sha256:latest.sha256,manifest_sha256:manifestRead.sha256,
          transcript_sha256:transcript.sha256,transcript_path:transcriptPath,source_segment_ids:ids,attribution:strength,
          route_ledger_sha256:ledgerHash,
          source_offsets:native.map(row=>[row.segment_id,row.start_seconds,row.end_seconds]),
          derived_title_only:true,semantic_fact_verified:false}], {thread_ref:idFor('voice',session.name)}));
    }
    receipts.push({source_kind:'voice',session_ref:hashText(session.name),card_sha256:latest.sha256,transcript_sha256:transcript.sha256});
  }
  return {records,displayMetadata:{},receipt:{status:'ok',records:records.length,excluded:excluded.length},excluded,sourceReceipts:receipts};
}

export async function collectHistorySources({project,fromDate,throughDate,sourceConfig}) {
  if(!safe(project)||sourceConfig?.project!==project)fail('history_source_project_mismatch');
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(fromDate??'')||!/^\d{4}-\d{2}-\d{2}$/u.test(throughDate??'')||fromDate>throughDate)fail('history_source_window_invalid');
  const records=[],displayMetadata={source_attachments:{},slack_names:{},person_names:{},source_body_sha256:{}},lanes={},excluded=[],sourceReceipts=[];
  const readers={mail:readMailHistory,slack:readSlackHistory,linear:readLinearHistory,voice:readVoiceHistory};
  for(const [kind,reader] of Object.entries(readers)){
    if(!sourceConfig[kind]){lanes[kind]={status:'missing',records:0};continue;}
    try{
      const result=await reader({project,fromDate,throughDate,config:sourceConfig[kind],now:new Date().toISOString()});
      records.push(...result.records);lanes[kind]=result.receipt;excluded.push(...(result.excluded??[]));
      sourceReceipts.push(...(result.sourceReceipts??[]));
      for(const key of Object.keys(displayMetadata))Object.assign(displayMetadata[key],result.displayMetadata?.[key]??{});
    }catch(error){lanes[kind]={status:'error',code:/^[A-Za-z0-9_:-]{1,120}$/u.test(error?.code??error?.message??'')?(error.code??error.message):'history_source_read_failed',records:0};}
  }
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  if(new Set(records.map(r=>r.id)).size!==records.length)fail('history_source_duplicate_id');
  return {records,displayMetadata,coverage:{lanes,excluded},sourceReceipts};
}
