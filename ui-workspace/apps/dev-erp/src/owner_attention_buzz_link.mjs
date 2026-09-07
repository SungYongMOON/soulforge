// Web fallbacks and the existing Buzz channel/message producer formats only.
// Parsing a link does not prove OS dispatch support or grant message authority.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EVENT = /^[0-9a-f]{64}$/iu;

export function safeOwnerAttentionBuzzUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    if (url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) return url.href;
    if (url.protocol !== 'buzz:' || url.port || url.hash) return null;
    if (url.hostname === 'channel') {
      // Validate raw path spelling too: URL normalization must not admit ../.
      const match = /^buzz:\/\/channel\/([^/?#]+)(?:\/([^/?#]+))?$/u.exec(value);
      if (!match || !UUID.test(match[1]) || (match[2] !== undefined && !EVENT.test(match[2]))) return null;
      return `buzz://channel/${match[1].toLowerCase()}${match[2] ? `/${match[2].toLowerCase()}` : ''}`;
    }
    if (url.hostname !== 'message' || !value.startsWith('buzz://message?') || url.pathname) return null;
    const keys = [...url.searchParams.keys()];
    if (keys.length < 2 || keys.length > 3 || new Set(keys).size !== keys.length
      || keys.some(key => !['channel', 'id', 'thread'].includes(key))) return null;
    const channel = url.searchParams.get('channel'), id = url.searchParams.get('id'), thread = url.searchParams.get('thread');
    if (!UUID.test(channel ?? '') || !EVENT.test(id ?? '') || (thread !== null && !EVENT.test(thread))) return null;
    const params = new URLSearchParams({ channel: channel.toLowerCase(), id: id.toLowerCase() });
    if (thread !== null) params.set('thread', thread.toLowerCase());
    return `buzz://message?${params}`;
  } catch { return null; }
}
