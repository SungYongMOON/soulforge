import test from 'node:test';
import assert from 'node:assert/strict';
import { safeOwnerAttentionBuzzUrl } from '../src/owner_attention_buzz_link.mjs';

const channel = '11111111-2222-3333-8444-555555555555';
const id = 'a'.repeat(64);
test('exact Buzz channel and message shapes plus bound web fallbacks are supported', () => {
  for (const value of [`buzz://channel/${channel}`, `buzz://channel/${channel}/${id}`,
    `buzz://message?channel=${channel}&id=${id}`, `buzz://message?channel=${channel}&id=${id}&thread=${'b'.repeat(64)}`,
    'https://buzz.example.invalid/conversation/1', 'http://127.0.0.1:4312/synthetic']) assert.equal(safeOwnerAttentionBuzzUrl(value), value);
});
test('credentials, unknown arguments, invalid identifiers and path normalization cannot widen a Buzz link', () => {
  for (const value of [null, '', `buzz://other/${channel}`, `buzz://channel/${channel}?other=1`,
    `buzz://channel/${channel}#fragment`, `buzz://channel/user/../${channel}`, `buzz://channel/${channel}/`,
    `buzz://user@channel/${channel}`, `buzz://channel:123/${channel}`, 'buzz://channel/not-a-channel',
    `buzz://message?channel=${channel}&id=${id}&id=${id}`, `buzz://message?channel=${channel}&id=bad`,
    `buzz://message?channel=${channel}&id=${id}&command=run`, `buzz://message?channel=${channel}&id=${id}&thread=bad`,
    `buzz://message/?channel=${channel}&id=${id}`, `buzz://message?channel=${channel}&id=${id}#secret`,
    'javascript:alert(1)', 'file:///private', 'http://public.example.invalid/', 'https://user:secret@example.invalid/']) assert.equal(safeOwnerAttentionBuzzUrl(value), null, String(value));
});
