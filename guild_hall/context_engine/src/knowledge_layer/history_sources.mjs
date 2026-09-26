// Explicit local source bindings; no network, source mutation, or authority grant.
import { join } from 'node:path';
import { openSourceRoot } from '../adapters/sources/guarded_files.mjs';
import { parseSegments as parseVoiceSegments } from '../adapters/sources/voice_session_source.mjs';
import { validateVoiceRouteLedger } from '../runtime/voice_routes.mjs';
import { sha256Canonical } from '../../../shared/project_history_envelope.mjs';
import { digest, hashText } from './data.mjs';
import { isAiWorkMemoRecord as isMemo } from './history.mjs';
import { readMailHistory, readSlackHistory } from './history_mail_slack.mjs';
import { SAME_DAY_ATTRIBUTION, matchSameDay, sameDayContext, sameDayEligible } from './history_voice_attribution.mjs';
const SAME_DAY_NATURES = new Set(['project_work', 'team_operations']);
const WRITTEN_READERS = { mail: readMailHistory, slack: readSlackHistory, linear: readLinearHistory };

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
// Built-in signatures of AI work memos written into Linear (work briefs, intake
// follow-ups, evidence notes, process notes). Linear custody records every
// author as a person account (agents write through a person's key), so the
// actor alone cannot tell a memo apart; these fixed structural markers are
// always applied, and `ai_note_markers` / `ai_note_user_ids` add to them.
// Matched text never becomes a history source; each exclusion is counted.
export const LINEAR_AI_MEMO_PATTERNS = Object.freeze([
  /^\s*#{1,4}\s*(?:합성\s*)?Work Brief/mu,
  /^\s*\[(?:업무인입|FOLLOW[-_ ]?UP|HANDOFF)/imu,
  /작성주체\s*[:：]\s*@?(?:Codex|ChatGPT|Claude|Hermes|Gemini|AI)/iu,
  /^\s*#{1,4}\s.*(?:Evidence|Follow-?up|FOLLOW_UP|Lifecycle|Handoff|Intake|Gate|자동 수집|대조)/imu,
  /^\s*#{1,4}\s*(?:Owner|AI)\s/mu,
  /^\s*(?:Source|Sources)\s*[:：]/mu,
  /^\s*(?:Evidence update|AUTO_APPLIED_EVIDENCE|FOLLOW[-_]UP)/mu,
  /Linear에\s*(?:기록|복제)하지\s*않/u,
  /상태·담당·Due(?:는|를)?\s*변경하지\s*않/u,
]);
export const isLinearAiMemoText = text => typeof text === 'string'
  && LINEAR_AI_MEMO_PATTERNS.some(pattern => pattern.test(text));
const linearMemo = (text, config) => isLinearAiMemoText(text) || noteText(text, config);
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
  // Display names from the collected users (latest snapshot): the history shows
  // who wrote or holds a task, never a raw account id.
  const names = new Map();
  if ((await root.list([])).some(e=>e.name==='users'&&e.directory)) {
    for (const entry of await root.list(['users'])) {
      if (!entry.directory || !safe(entry.name)) continue;
      const user = (await snapshots('users',entry.name)).at(-1)?.value;
      const name = [user?.name, user?.display_name].find(value => typeof value === 'string' && value.trim() && value.length <= 200);
      if (name) names.set(entry.name, name.trim());
    }
  }
  const personName = id => (typeof id === 'string' && names.get(id)) || '작성자 미기록';
  const assigneeName = id => typeof id === 'string' && id ? names.get(id) ?? '담당자 이름 미기록' : '';
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
    if (isMemo(row) || (config.ai_note_label_ids ?? []).some(id => (row.label_ids ?? []).includes(id))) {
      excluded.push({kind:'linear',id_hash:hashText(entry.name),reason:'ai_work_note'}); continue;
    }
    // An AI-written description (work brief) is left out; the issue itself (its
    // title, people and state) stays as a Linear fact. The body exclusion is counted.
    const memoBody = !!body.trim() && (linearMemo(body,config) || (config.ai_note_user_ids ?? []).includes(row.creator_id));
    if (memoBody) excluded.push({kind:'linear',id_hash:hashText(entry.name),reason:'ai_work_note_body'});
    const text = `${row.title ?? ''}${body && !memoBody ? '\n'+body : ''}`;
    const state = typeof row.state_name === 'string' && row.state_name.trim() ? row.state_name.trim().slice(0,100) : null;
    records.push(flatRecord(project,'linear',`issue:${entry.name}`,instant,text,row.title,personName(row.creator_id),
      [{source_kind:'linear',source_root:config.root,object_id:entry.name,object_kind:'issues',path:latest.file,content_sha256:latest.sha256,
        project_id:row.project_id,time_basis:'provider_updated_at',snapshot_not_event_history:true,
        ...(state?{issue_state:state}:{}),...(memoBody?{ai_memo_body_excluded:true}:{})}],
      {thread_ref:idFor('linear',entry.name),recipient:assigneeName(row.assignee_id)}));
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
        || linearMemo(String(row.body ?? ''),config)) {
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
        personName(row.user_id ?? row.actor_id),[{source_kind:'linear',source_root:config.root,object_kind:kind,object_id:entry.name,
          issue_id:row.issue_id,project_id:issue.project_id,path:latest.file,content_sha256:latest.sha256,time_basis:'provider_created_at'}],
        {thread_ref:idFor('linear',row.issue_id)}));
    }
  }
  receipts.push({source_kind:'linear',root_ref:hashText(config.root),project_ids:config.project_ids,selected_records:records.length});
  const reasons = {}; for (const item of excluded) reasons[item.reason] = (reasons[item.reason] ?? 0) + 1;
  return {records,displayMetadata:{},receipt:{status:'ok',records:records.length,excluded:excluded.length,excluded_reasons:reasons},excluded,sourceReceipts:receipts};
}

// Candidate rule (first_candidate policy): a card's first project candidate is
// a model suggestion, so it alone does not place talk in a project's history.
// A segment enters only when its first candidate is this project AND either the
// candidate is strong (and the talk is readable work, not personal/unreadable),
// or it is weak but the segment is project work, names no other project, and its
// own utterances contain this project's code or one of the Owner-configured
// `project_terms` of the voice sources config. Terms the card matched against
// written sources are not used: measured on real cards they are mostly generic
// words (receive, PC, software) and would let unrelated talk in.
// Every excluded segment is counted in the voice receipt.
export const VOICE_CANDIDATE_RULE = 'first_candidate_strict.v1';
const STRONG_EXCLUDED_NATURES = new Set(['personal', 'unreadable']);
function candidateVerdict(segment, project) {
  const first = segment.project_candidates?.[0];
  if (first?.strength === 'strong') return STRONG_EXCLUDED_NATURES.has(segment.nature) ? 'excluded_strong_nature' : 'strong';
  if (segment.nature !== 'project_work') return 'excluded_weak_nature';
  if ((segment.other_project_mentions ?? []).some(item => item?.project_code && item.project_code !== project)
    || (segment.project_candidates ?? []).slice(1).some(item => item?.project_code && item.project_code !== project && item.strength === 'strong'))
    return 'excluded_weak_other_project';
  return 'weak';
}
function voiceProjectTerms(project, config) {
  const raw = config.project_terms ?? [];
  if (!Array.isArray(raw) || raw.length > 200 || raw.some(term => typeof term !== 'string' || term.length > 100))
    fail('history_voice_project_terms_invalid');
  const codes = [project, project.replace(/-/gu, '_'), project.replace(/-/gu, '')];
  return [...new Set([...codes, ...raw].map(term => term.normalize('NFC').trim().toLowerCase())
    .filter(term => term.length >= 2))].sort();
}
const termMatch = (text, terms) => { const hay = String(text ?? '').normalize('NFC').toLowerCase();
  return terms.find(term => hay.includes(term)) ?? null; };

/** `sameDay` = {own, peers, peersComplete} (Maps from sameDayContext) enables weak same-day
 * attribution; absent = off. A match that any peer project also has is ambiguous and not attributed. */
export async function readVoiceHistory({project,fromDate,throughDate,config,sameDay=null}) {
  requireProject(project,config);
  if (!['confirmed','first_candidate'].includes(config.project_policy)) fail('history_voice_policy_required');
  const projectTerms = voiceProjectTerms(project, config);
  const sessions = openSourceRoot(config.sessions_root), cardsRoot = openSourceRoot(config.cards_root);
  const routes = config.routes_root ? openSourceRoot(config.routes_root) : null;
  if (config.project_policy==='confirmed'&&!routes) fail('history_voice_routes_required');
  const read = bounded(config), records = [], excluded = [], receipts = [], voiceRecordings = {}, voiceGroups = {};
  // Same-day rule counts: every eligible (no-candidate) segment in the window ends
  // in exactly one bucket, so the unattributed remainder is visible in the receipt.
  const sameDayOn = config.project_policy==='first_candidate' && sameDay?.own instanceof Map && sameDay?.peers instanceof Map;
  // Nothing leaves silently: lines of a selected segment that fall outside the
  // window are counted (they belong to the adjacent window's run).
  const windowCounts = {segments_started_before_window:0,utterances_before_window:0,utterances_after_window:0};
  const sameDayCounts = {attributed_segments:0,attributed_utterances:0,unattributed_segments:0,
    nature_excluded:0,started_before_window:0,spill_utterances_excluded:0,
    no_written_source_day:0,no_match:0,ambiguous:0,peer_unverified:0,transcript_unverified:0};
  // Candidate rule counts: segments starting in this window whose first candidate is this project.
  const candidateCounts = {rule:VOICE_CANDIDATE_RULE,included_confirmed:0,included_strong:0,included_weak_term:0,
    excluded_strong_nature:0,excluded_weak_nature:0,excluded_weak_other_project:0,excluded_weak_no_term:0,
    excluded_transcript_unverified:0};
  let segmentRecords = 0, segmentUtterances = 0, emptySegmentParts = 0;
  let sessionsWithoutCard = 0, sessionsCarded = 0;
  const routeNames = routes ? new Set((await routes.list([])).filter(e=>e.file).map(e=>e.name)) : new Set();
  const previousDate=new Date(Date.parse(fromDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
  const windowStart=Date.parse(fromDate+'T00:00:00+09:00');
  const windowEnd=Date.parse(throughDate+'T00:00:00+09:00')+86400000;
  const cardSessions = new Set((await cardsRoot.list([])).filter(e=>e.directory).map(e=>e.name));
  const days = (await sessions.list([])).filter(e=>e.directory&&/^\d{4}-\d{2}-\d{2}$/u.test(e.name)&&e.name>=previousDate&&e.name<=throughDate);
  for (const date of days) for (const session of await sessions.list([date.name])) {
    if (!session.directory || !safe(session.name)) continue;
    // A session whose card has not been made yet contributes nothing; it is skipped
    // and counted (sessions_without_card) instead of stopping the whole lane.
    const runs=cardSessions.has(session.name)?await cardsRoot.list([session.name]):[];
    const carded=[];
    for(const run of runs)if(run.directory&&safe(run.name)&&(await cardsRoot.list([session.name,run.name])).some(e=>e.name==='conversation_list.v0.json'&&e.file))carded.push(run);
    if(!carded.length){sessionsWithoutCard++;continue;}
    sessionsCarded++;
    const manifestRead = await read(sessions,[date.name,session.name,'session_manifest.json']);
    const manifest = JSON.parse(manifestRead.text);
    if (manifest.session_id!==session.name) fail('history_voice_session_mismatch');
    const started = Date.parse(manifest.recorded_at_local);
    if (!Number.isFinite(started)||!/(?:Z|[+-]\d{2}:\d{2})$/u.test(manifest.recorded_at_local??'')) fail('history_voice_clock_invalid');
    if(started>=windowEnd || (Number.isFinite(manifest.duration_seconds)&&manifest.duration_seconds>=0
      &&started+manifest.duration_seconds*1000<windowStart))continue;
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
    const selected=[], pending=[], termPending=[];
    const startsInWindow=segment=>{const s=started+Number(segment.start_seconds)*1000;return s>=windowStart&&s<windowEnd;};
    for(const segment of latest.card.segments){
      if(!safe(segment.segment_id))fail('history_voice_segment_invalid');
      const human=ledger?.segments.find(s=>s.segment_id===segment.segment_id);
      const veto=human?.withdrawn?.some(row=>row.project_code===project) || (human?.status==='confirmed'&&human.project_candidates?.[0]?.project_code!==project);
      if(veto)continue;
      const confirmed=human?.status==='confirmed'&&human.project_candidates?.[0]?.project_code===project
        && JSON.stringify(human.source_segment_ids)===JSON.stringify(segment.source_segment_ids)
        && Array.isArray(human.transcript_ref)&&human.transcript_ref.includes(latest.card.transcript?.run_id);
      const first=!confirmed&&config.project_policy==='first_candidate'&&segment.project_candidates?.[0]?.project_code===project;
      const verdict=first?candidateVerdict(segment,project):null;
      if(first&&verdict.startsWith('excluded_')){if(startsInWindow(segment))candidateCounts[verdict]++;continue;}
      const candidate=verdict==='strong', termCheck=verdict==='weak';
      const weakShape=!confirmed&&!first&&sameDayOn
        &&(!human||(human.status!=='confirmed'&&!human.project_candidates?.length))&&sameDayEligible(latest.card,segment);
      // The same-day rule considers only work talk; other natures are counted, not placed.
      const weak=weakShape&&SAME_DAY_NATURES.has(segment.nature);
      if(weakShape&&!weak&&(()=>{const s=started+Number(segment.start_seconds)*1000;return s>=windowStart&&s<windowEnd;})()){
        sameDayCounts.unattributed_segments++;sameDayCounts.nature_excluded++;}
      if(!confirmed&&!candidate&&!termCheck&&!weak)continue;
      if(!Number.isFinite(segment.start_seconds)||!Number.isFinite(segment.end_seconds)
        ||segment.start_seconds<0||segment.end_seconds<segment.start_seconds)fail('history_voice_range_invalid');
      const instant=new Date(started+segment.start_seconds*1000).toISOString();
      if(started+segment.end_seconds*1000<windowStart||started+segment.start_seconds*1000>=windowEnd)continue;
      if(weak){
        const day=kstDay(instant);
        // A weak segment is judged only by the window holding its start.
        if(!inWindow(instant,fromDate,throughDate)){sameDayCounts.started_before_window++;continue;}
        if(!sameDay.own.has(day)){sameDayCounts.unattributed_segments++;sameDayCounts.no_written_source_day++;continue;}
        pending.push({segment,instant,day});continue;
      }
      if(termCheck){termPending.push({segment,instant});continue;}
      if(started+segment.start_seconds*1000<windowStart)windowCounts.segments_started_before_window++;
      if(startsInWindow(segment))candidateCounts[confirmed?'included_confirmed':'included_strong']++;
      selected.push({segment,instant,strength:confirmed?'confirmed':'candidate_only_not_accepted'});
    }
    if(!selected.length&&!pending.length&&!termPending.length)continue;
    const tr=latest.card.transcript;
    if(!safe(tr?.run_id)||!/^sha256:[0-9a-f]{64}$/u.test(tr?.sha256??''))fail('history_voice_transcript_ref_invalid');
    // A PLAUD-primary card reads the provider transcript at the session root; every
    // other card (declared whisper, a PLAUD-mode fallback, or no declaration) reads
    // its whisper run exactly as before, so those records stay byte-identical.
    const plaud=tr.source==='plaud';
    const transcriptPath=plaud?[date.name,session.name,'transcript.jsonl']
      :[date.name,session.name,'analysis','local_asr',tr.run_id,'transcript.jsonl'];
    // A session read only for the same-day rule never fails the lane: an unreadable
    // or changed transcript leaves its segments unattributed (counted).
    let transcript;
    try{
      transcript=await read(sessions,transcriptPath,32*1024*1024);
      if(transcript.sha256!==tr.sha256)fail('history_voice_transcript_digest_mismatch');
    }catch(error){
      if(selected.length)throw error;
      sameDayCounts.unattributed_segments+=pending.length;sameDayCounts.transcript_unverified+=pending.length;
      candidateCounts.excluded_transcript_unverified+=termPending.filter(({segment})=>startsInWindow(segment)).length;continue;
    }
    const voiceDisplay={...(typeof manifest.source_page_title==='string'&&manifest.source_page_title
      ? {title:manifest.source_page_title}:{}),recorded_at:manifest.recorded_at_local,session_id:session.name,
      transcript_path:join(config.sessions_root,...transcriptPath),
      // Display-only: which transcript the card read. Absent on undeclared cards.
      ...(typeof tr.source==='string'&&tr.source?{transcript_source:tr.source}:{}),
      ...(typeof tr.fallback==='string'&&tr.fallback?{transcript_fallback:tr.fallback}:{})};
    const audioPrefix=`ingress/plaud/sessions/${date.name}/${session.name}/audio/`;
    if(manifest.audio?.status==='source_present'&&typeof manifest.audio.ref==='string'&&manifest.audio.ref.startsWith(audioPrefix)) {
      const audioName=manifest.audio.ref.slice(audioPrefix.length);
      if(!safe(audioName)||audioName==='.'||audioName==='..')fail('history_voice_audio_ref_invalid');
      if((await sessions.list([date.name,session.name,'audio'])).some(entry=>entry.file&&entry.name===audioName))
        voiceDisplay.audio_path=join(config.sessions_root,date.name,session.name,'audio',audioName);
    }
    const byId=new Map();
    for(const row of parseVoiceSegments(transcript.text)){
      if(byId.has(row.segment_id))fail('history_voice_duplicate_asr_segment');
      byId.set(row.segment_id,row);
    }
    // Weak first candidates: kept only when the segment's own words name the project.
    const terms=projectTerms;
    for(const {segment,instant} of termPending){
      const ids=Array.isArray(segment.source_segment_ids)?segment.source_segment_ids:[];
      const spoken=ids.map(id=>byId.get(id)).filter(Boolean).map(row=>String(row.content??'')).join('\n');
      const term=termMatch(spoken,terms);
      if(!term){if(startsInWindow(segment))candidateCounts.excluded_weak_no_term++;continue;}
      if(startsInWindow(segment))candidateCounts.included_weak_term++;
      if(started+segment.start_seconds*1000<windowStart)windowCounts.segments_started_before_window++;
      selected.push({segment,instant,strength:'candidate_only_not_accepted',termReason:{rule:VOICE_CANDIDATE_RULE,matched_term:term}});
    }
    for(const {segment,instant,day} of pending){
      const ids=Array.isArray(segment.source_segment_ids)?segment.source_segment_ids:[];
      const spoken=ids.map(id=>byId.get(id)).filter(Boolean).map(row=>String(row.content??'')).join(' ');
      const reason=matchSameDay(sameDay.own.get(day),[{field:'transcript',text:spoken},
        {field:'recording_title',text:typeof manifest.source_page_title==='string'?manifest.source_page_title:''}]);
      if(!reason){sameDayCounts.unattributed_segments++;sameDayCounts.no_match++;continue;}
      // Only an exact single-project match is attributed: unverifiable peers or a peer match hold it back.
      if(!sameDay.peersComplete){sameDayCounts.unattributed_segments++;sameDayCounts.peer_unverified++;continue;}
      if([...sameDay.peers.values()].some(peer=>matchSameDay(peer.get(day),[{field:'transcript',text:spoken},
        {field:'recording_title',text:typeof manifest.source_page_title==='string'?manifest.source_page_title:''}]))){
        sameDayCounts.unattributed_segments++;sameDayCounts.ambiguous++;continue;}
      sameDayCounts.attributed_segments++;
      selected.push({segment,instant,strength:SAME_DAY_ATTRIBUTION,reason,day});
    }
    if(!selected.length)continue;
    for(const {segment,instant,strength,reason,day,termReason} of selected){
      const ids=segment.source_segment_ids;
      if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)))fail('history_voice_source_ids_invalid');
      const native=ids.map(id=>byId.get(id));
      if(native.some(row=>!row||(!plaud&&row.analysis_run_id!==tr.run_id)))fail('history_voice_source_missing');
      if(native.some(row=>!Number.isFinite(row.start_seconds)||!Number.isFinite(row.end_seconds)
        ||row.end_seconds<row.start_seconds||row.start_seconds<segment.start_seconds-0.02||row.end_seconds>segment.end_seconds+0.02)
        ||ids.some((id,index)=>index>0&&id<=ids[index-1]))fail('history_voice_range_mismatch');
      if(ids.some(id=>latest.card.segments.filter(s=>s.source_segment_ids?.includes(id)).length!==1))fail('history_voice_source_overlap');
      // Input format v3: one record per conversation segment and KST day. The
      // recording/segment bookkeeping is stored once in voice_groups under a
      // content key; the record holds the segment's utterances (one per line)
      // and every utterance's number and time range, so no line is lost.
      const segmentKey=hashText(`${session.name}:${segment.segment_id}`).slice(7,23);
      const group={source_kind:'voice',source_root:config.sessions_root,card_source_root:config.cards_root,
        session_id:session.name,card_run_id:latest.run,card_segment_id:segment.segment_id,card_sha256:latest.sha256,
        manifest_sha256:manifestRead.sha256,transcript_sha256:transcript.sha256,transcript_path:transcriptPath,
        attribution:strength,route_ledger_sha256:ledgerHash,...(reason?{attribution_reason:reason}:{}),
        ...(termReason?{attribution_reason:termReason}:{}),
        recorded_at:manifest.recorded_at_local,segment_title:String(segment.title??'녹음'),
        segment_nature:typeof segment.nature==='string'?segment.nature:null,
        derived_title_only:true,semantic_fact_verified:false};
      const groupKey=digest(group).slice(7,23);
      const byDay=new Map();
      for (const utterance of native) {
        const utteranceTime=new Date(started+utterance.start_seconds*1000).toISOString();
        if(!inWindow(utteranceTime,fromDate,throughDate)){
          if(kstDay(utteranceTime)<fromDate)windowCounts.utterances_before_window++;else windowCounts.utterances_after_window++;
          continue;
        }
        // A same-day attribution holds only for its own day; lines past midnight are counted.
        if(reason&&kstDay(utteranceTime)!==day){sameDayCounts.spill_utterances_excluded++;continue;}
        const at=kstDay(utteranceTime);
        if(!byDay.has(at))byDay.set(at,[]);
        byDay.get(at).push(utterance);
      }
      for(const [at,lines] of byDay){
        const text=lines.map(row=>String(row.content??'').trim()).filter(Boolean).join('\n');
        if(!text){emptySegmentParts++;continue;}
        voiceGroups[groupKey]=group;
        records.push({id:`voice_segment:${segmentKey}:${at.replace(/-/gu,'')}`,project,
          date:at,kind:'voice_segment',title:String(segment.title??'녹음').slice(0,300),sender:'발화자 미확인',recipient:'미기록',attachments:[],
          thread_ref:'voice:'+segmentKey,text,evidence_mode:'source_id',
          originrefs:[{voice_group:groupKey,source_offsets:lines.map(row=>[row.segment_id,row.start_seconds,row.end_seconds])}]});
        voiceRecordings[session.name]=voiceDisplay;
        segmentRecords++;segmentUtterances+=lines.length;
        if(reason)sameDayCounts.attributed_utterances+=lines.length;
      }
    }
    receipts.push({source_kind:'voice',session_ref:hashText(session.name),card_sha256:latest.sha256,transcript_sha256:transcript.sha256});
  }
  // Skipping uncarded sessions must not hide a wrong cards_root: when nothing in
  // the window had a card, at least one card folder must name a real session.
  if(sessionsWithoutCard>0&&!sessionsCarded){
    let matched=false;
    for(const name of cardSessions){
      const m=/^(\d{4})(\d{2})(\d{2})_/u.exec(name);
      if(!m)continue;
      const day=`${m[1]}-${m[2]}-${m[3]}`;
      if((await sessions.list([])).some(e=>e.directory&&e.name===day)&&(await sessions.list([day])).some(e=>e.directory&&e.name===name)){matched=true;break;}
    }
    if(!matched)fail('history_voice_cards_root_unmatched');
  }
  return {records,voiceGroups,displayMetadata:{voice_recordings:voiceRecordings},receipt:{status:'ok',records:records.length,excluded:excluded.length,
    sessions_without_card:sessionsWithoutCard,window:windowCounts,
    segments:{records:segmentRecords,utterances:segmentUtterances,empty_parts:emptySegmentParts},
    ...(config.project_policy==='first_candidate'?{candidate_rule:candidateCounts}:{}),
    ...(sameDayOn?{same_day:sameDayCounts}:{})},excluded,sourceReceipts:receipts};
}

// The same-day rule is on only when the voice config names its peers (possibly
// none): each peer project's written lanes are read for the same window so a
// match that a peer also has is recognised as ambiguous. A peer lane that does
// not read cleanly makes every would-be attribution unverifiable (not attributed).
async function sameDayContexts({project,fromDate,throughDate,records,displayMetadata,config}){
  if(config===false||config===undefined||config===null)return null;
  if(typeof config!=='object'||!Array.isArray(config.peers)||config.peers.length>50)fail('history_voice_same_day_config_invalid');
  const own=sameDayContext({project,records,displayMetadata,config});
  const peers=new Map();let peersComplete=true;
  for(const peer of config.peers){
    if(!peer||typeof peer!=='object'||!safe(peer.project)||peer.project===project||peers.has(peer.project))fail('history_voice_same_day_peer_invalid');
    const peerRecords=[],peerDisplay={person_names:{},slack_names:{}};
    for(const [kind,reader] of Object.entries(WRITTEN_READERS)){
      if(!peer[kind])continue;
      try{
        const result=await reader({project:peer.project,fromDate,throughDate,config:peer[kind],now:new Date().toISOString()});
        if(result.receipt?.status!=='ok')peersComplete=false;
        peerRecords.push(...result.records);
        for(const key of Object.keys(peerDisplay))Object.assign(peerDisplay[key],result.displayMetadata?.[key]??{});
      }catch{peersComplete=false;}
    }
    peers.set(peer.project,sameDayContext({project:peer.project,records:peerRecords,displayMetadata:peerDisplay,config:peer.same_day_context??{}}));
  }
  return {own,peers,peersComplete};
}

export async function collectHistorySources({project,fromDate,throughDate,sourceConfig}) {
  if(!safe(project)||sourceConfig?.project!==project)fail('history_source_project_mismatch');
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(fromDate??'')||!/^\d{4}-\d{2}-\d{2}$/u.test(throughDate??'')||fromDate>throughDate)fail('history_source_window_invalid');
  const records=[],displayMetadata={source_attachments:{},slack_names:{},person_names:{},source_body_sha256:{},voice_sources:{},voice_recordings:{}},lanes={},excluded=[],sourceReceipts=[];
  const voiceGroups={};
  const readers={mail:readMailHistory,slack:readSlackHistory,linear:readLinearHistory,voice:readVoiceHistory};
  for(const [kind,reader] of Object.entries(readers)){
    if(!sourceConfig[kind]){lanes[kind]={status:'missing',records:0};continue;}
    try{
      // Voice runs last: its same-day rule reads the written records collected above.
      const sameDay=kind==='voice'?await sameDayContexts({project,fromDate,throughDate,records,displayMetadata,
        config:sourceConfig.voice.same_day_context}):null;
      const result=await reader({project,fromDate,throughDate,config:sourceConfig[kind],now:new Date().toISOString(),sameDay});
      records.push(...result.records);lanes[kind]=result.receipt;excluded.push(...(result.excluded??[]));
      sourceReceipts.push(...(result.sourceReceipts??[]));Object.assign(voiceGroups,result.voiceGroups??{});
      for(const key of Object.keys(displayMetadata))Object.assign(displayMetadata[key],result.displayMetadata?.[key]??{});
    }catch(error){lanes[kind]={status:'error',code:/^[A-Za-z0-9_:-]{1,120}$/u.test(error?.code??error?.message??'')?(error.code??error.message):'history_source_read_failed',records:0};}
  }
  records.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  if(new Set(records.map(r=>r.id)).size!==records.length)fail('history_source_duplicate_id');
  return {records,voiceGroups,displayMetadata,coverage:{lanes,excluded},sourceReceipts};
}
