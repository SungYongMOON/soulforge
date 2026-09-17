/**
 * Bounded workspace-specific core helpers for operations folder & search UI leaf.
 * Pure functions: hierarchy, filter, dedupe, mention parsing, and title/match snippets.
 */

const SLACK_MENTION_PATTERN = /<@([A-Z0-9]+)(?:\|([^>]+))?>/g;

/**
 * Sanitizes Slack user mentions:
 * - <@U12345|display_name> => display_name (metadata-provided)
 * - <@U12345> => 'Slack 사용자' (no external API / invented names)
 * Preserves raw user IDs in metadata for collapsed technical details.
 */
export function sanitizeSlackMentions(text) {
  if (typeof text !== 'string' || !text) {
    return { text: '', rawMentions: [] };
  }
  const rawMentions = [];
  const sanitized = text.replace(SLACK_MENTION_PATTERN, (match, userId, displayName) => {
    rawMentions.push({ id: userId, raw: match, name: displayName || null });
    if (displayName && displayName.trim()) {
      return displayName.trim();
    }
    return 'Slack 사용자';
  });
  return { text: sanitized, rawMentions };
}

/**
 * Clean text for human display (Slack mentions sanitized).
 */
export function cleanHumanText(text) {
  return sanitizeSlackMentions(text).text;
}

/**
 * Extracts truthful dates from evidence item or locator.
 * Never invents dates; returns null if date is not genuinely present.
 */
export function extractDatesFromEvidence(hit) {
  if (!hit || typeof hit !== 'object') return null;

  // 1. Explicit hit.occurred_at
  if (hit.occurred_at && typeof hit.occurred_at === 'string') {
    const parsed = Date.parse(hit.occurred_at);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString();
    }
  }

  // 2. Dates in locator
  const loc = hit.locator;
  if (loc) {
    if (typeof loc === 'string') {
      const match = loc.match(/\b(20\d{2}[-/]\d{2}[-/]\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?)\b/);
      if (match) {
        const parsed = Date.parse(match[1].replace(/\//g, '-'));
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
      }
    } else if (typeof loc === 'object') {
      if (loc.message_ts && typeof loc.message_ts === 'string') {
        const seconds = parseFloat(loc.message_ts);
        if (Number.isFinite(seconds) && seconds > 1000000000) {
          return new Date(seconds * 1000).toISOString();
        }
      }
      if (Array.isArray(loc.path)) {
        for (const segment of loc.path) {
          if (typeof segment === 'string') {
            const match = segment.match(/\b(20\d{2}[-_]\d{2}[-_]\d{2})\b/);
            if (match) {
              const parsed = Date.parse(match[1].replace(/_/g, '-'));
              if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
            }
          }
        }
      }
    }
  }

  return null;
}

/**
 * Calculates truthful rank reason based on normalized query match in title/body.
 * Never fakes scores or models.
 */
export function calculateTruthfulRankReason(hit, query) {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return '단어 검색 순위';

  const title = String(hit?.title ?? '').toLowerCase();
  const text = String(hit?.text ?? '').toLowerCase();

  const titleExact = title.includes(q);
  const textExact = text.includes(q);

  if (titleExact && textExact) {
    return '제목 및 본문 검색어 정확 일치';
  }
  if (titleExact) {
    return '제목에 검색어 정확 일치';
  }
  if (textExact) {
    return '본문에 검색어 정확 일치';
  }

  const tokens=q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const titleTokens = tokens.filter(t => title.includes(t));
    const textTokens = tokens.filter(t => text.includes(t));
    if (titleTokens.length === tokens.length) {
      return '제목에 모든 단어 포함';
    }
    if (textTokens.length === tokens.length) {
      return '본문에 모든 단어 포함';
    }
    if (titleTokens.length > 0 || textTokens.length > 0) {
      return '검색어 일부 단어 포함';
    }
  }

  return `검색엔진 반환 순위 ${hit?.rank ? `#${hit.rank}` : ''}`.trim();
}

/**
 * Extracts a match snippet around the query with context window.
 */
export function extractMatchSnippet(text, query, windowChars = 140, title='') {
  let raw = cleanHumanText(String(text ?? ''));
  const heading=cleanHumanText(title).trim();
  if(heading&&raw.trim().startsWith(heading))raw=raw.trim().slice(heading.length).replace(/^[\s:·—-]+/,'');
  if (!raw) return '';
  const q = String(query ?? '').trim();
  if (!q) {
    return raw.length > windowChars ? `${raw.slice(0, windowChars)}…` : raw;
  }

  const lowerRaw = raw.toLowerCase();
  const lowerQ = q.toLowerCase();

  let matchIndex = lowerRaw.indexOf(lowerQ);

  // If exact query not found, search for the longest token
  if (matchIndex === -1) {
    const tokens = q.split(/\s+/).filter(Boolean).sort((a, b) => b.length - a.length);
    for (const t of tokens) {
      const idx = lowerRaw.indexOf(t.toLowerCase());
      if (idx !== -1) {
        matchIndex = idx;
        break;
      }
    }
  }

  if (matchIndex === -1) {
    return raw.length > windowChars ? `${raw.slice(0, windowChars)}…` : raw;
  }

  const half = Math.floor((windowChars - q.length) / 2);
  let start = Math.max(0, matchIndex - Math.max(20, half));
  let end = Math.min(raw.length, start + windowChars);

  if (end === raw.length) {
    start = Math.max(0, end - windowChars);
  }

  let snippet = raw.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < raw.length) snippet = `${snippet}…`;

  return snippet;
}

/**
 * Splits text into segments for query highlighting using React text nodes (no HTML injection).
 */
export function splitTextForHighlight(text, query) {
  const raw = String(text ?? '');
  const q = String(query ?? '').trim();
  if (!raw || !q) {
    return [{ text: raw, isMatch: false }];
  }

  const words=q.split(/\s+/).filter(Boolean);
  const tokens=words.map(word=>[...word].map(char=>'\\^$.*+?()[]{}|'.includes(char)?'\\'+char:char).join(''));
  if (!tokens.length) {
    return [{ text: raw, isMatch: false }];
  }

  const regex = new RegExp(`(${tokens.join('|')})`, 'gi');
  const parts = raw.split(regex);

  return parts.filter(Boolean).map(part => ({
    text: part,
    isMatch: words.some(word => part.toLowerCase() === word.toLowerCase())
  }));
}

/**
 * Deduplicates hits referencing the same source item or text,
 * while preserving all underlying evidence references in duplicateRefs.
 */
export function dedupeEvidence(hits) {
  if (!Array.isArray(hits)) return [];
  const groups=[];
  const body=hit=>String(hit.text??'').trim().replace(/\s+/g,' ');
  const doc=hit=>hit.item_id?`${hit.source_kind??'unknown'}:${hit.item_id}`:null;
  for (const hit of hits) {
    // Compare original bodies, never anonymized mentions: different people are not duplicates.
    const matches=groups.filter(group=>group.refs.some(ref=>(doc(hit)&&doc(ref)===doc(hit))||(body(hit)&&body(ref)===body(hit))));
    const group=matches[0]??{refs:[]};
    if(!matches.length)groups.push(group);
    for(const other of matches.slice(1)){group.refs.push(...other.refs);groups.splice(groups.indexOf(other),1);}
    group.refs.push(hit);
  }
  return groups.map(({refs})=>{
    const ordered=[...refs].sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)),first=ordered[0];
    const texts=[...new Set(ordered.map(r=>String(r.text??'')))];
    return {...first,text:texts.join('\n'),displayTitle:cleanHumanText(first.title)||'제목이 제공되지 않은 자료',displayText:cleanHumanText(texts.join('\n')),duplicateRefs:ordered.slice(1),evidenceRefs:ordered};
  });
}

/**
 * Client-side filter & sort on returned evidence hits.
 */
export function filterAndSortEvidence(hits, {
  inResultQuery = '',
  sourceFilter = 'all',
  startDate = '',
  endDate = '',
  sortBy = 'rank'
} = {}) {
  let list = Array.isArray(hits) ? [...hits] : [];

  // Source filter
  if (sourceFilter && sourceFilter !== 'all') {
    list = list.filter(h => (h.evidenceRefs??[h]).some(r=>r.source_kind === sourceFilter));
  }

  // Date filter
  if (startDate || endDate) {
    list = list.filter(h => {
      return (h.evidenceRefs??[h]).some(ref=>{const d=extractDatesFromEvidence(ref);if(!d)return false;const isoDate=new Date(Date.parse(d)+9*3600000).toISOString().slice(0,10);return (!startDate||isoDate>=startDate)&&(!endDate||isoDate<=endDate);});
    });
  }

  // In-result query
  if (inResultQuery && inResultQuery.trim()) {
    const q = inResultQuery.trim().toLowerCase();
    list = list.filter(h => {
      const title = String(h.title || h.displayTitle || '').toLowerCase();
      const text = String(h.text || h.displayText || '').toLowerCase();
      const itemId = String(h.item_id || '').toLowerCase();
      return title.includes(q) || text.includes(q) || itemId.includes(q);
    });
  }

  // Sort
  list.sort((a, b) => {
    if (sortBy === 'date') {
      const da = extractDatesFromEvidence(a);
      const db = extractDatesFromEvidence(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    }
    if (sortBy === 'title') {
      const ta = String(a.displayTitle || a.title || a.item_id || '');
      const tb = String(b.displayTitle || b.title || b.item_id || '');
      return ta.localeCompare(tb, 'ko');
    }
    // Default: rank
    return (a.rank ?? 999) - (b.rank ?? 999);
  });

  return list;
}

/**
 * Client filter on loaded tree sibling entries.
 * Scope note: Applies ONLY to currently loaded folder entries, not global search.
 */
export function filterLoadedTreeEntries(entries, { nameQuery = '', startDate = '', endDate = '' } = {}) {
  if (!Array.isArray(entries)) return [];
  let list = entries;

  if (nameQuery && nameQuery.trim()) {
    const q = nameQuery.trim().toLowerCase();
    list = list.filter(e => String(e.name || '').toLowerCase().includes(q));
  }

  if (startDate || endDate) {
    list = list.filter(e => {
      if (!e.modified_at) return false;
      const isoDate = String(e.modified_at).slice(0, 10);
      if (startDate && isoDate < startDate) return false;
      if (endDate && isoDate > endDate) return false;
      return true;
    });
  }

  return list;
}

/**
 * Bounded pagination for tree sibling entries (>50).
 */
export function paginateSiblings(entries, page = 1, pageSize = 50) {
  const items = Array.isArray(entries) ? entries : [];
  const visible = items.slice(0, page * pageSize);
  return {
    visible,
    total: items.length,
    hasMore: items.length > page * pageSize,
    remaining: Math.max(0, items.length - page * pageSize),
    page,
    pageSize
  };
}

export function filterLoadedTreeLevel(cache,parent='',filters={}){
  const entries=cache[parent]?.entries??[];
  if(!filters.nameQuery&&!filters.startDate&&!filters.endDate)return entries;
  return entries.filter(entry=>filterLoadedTreeEntries([entry],filters).length>0||(entry.browsable&&filterLoadedTreeLevel(cache,[parent,entry.name].filter(Boolean).join('/'),filters).length>0));
}
