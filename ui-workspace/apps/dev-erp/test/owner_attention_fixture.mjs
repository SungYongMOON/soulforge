import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.mjs';
import { createErpMcpService } from '../src/erp_mcp_service.mjs';
import { createOwnerAttentionSource } from '../src/owner_attention_source.mjs';
import { createOwnerAttentionService } from '../src/owner_attention_service.mjs';

export function makeAttentionFixture(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'owner-attention-synthetic-'));
  let store = openStore(options.persistent ? join(root, 'erp.db') : ':memory:');
  const clock = { value: Date.parse('2026-09-08T03:00:00Z') };
  const now = () => clock.value;
  store.upsertProject({ id: 'SYN-ATTENTION', title: '합성 프로젝트', data_label: 'synthetic' });
  const addAccount = (username, roles) => {
    const result = store.createAccount({ username, password: 'Synthetic-password-123!', email: `${username}@example.invalid`, display_name: username === 'syntheticbot' ? '합성 문서 봇' : username, roles });
    return store.db.prepare('SELECT * FROM core_account WHERE id=?').get(result.id);
  };
  const owner = addAccount('syntheticowner', ['admin']), bot = addAccount('syntheticbot', ['member']);
  const item = store.createItem({ project_id:'SYN-ATTENTION', title:'검토용 문서 작성', assignee_ref:bot.email, due:'2026-09-08' }).item;
  const erp = createErpMcpService({ store, artifactRoot:join(root,'artifacts'), now });
  let counter = 0;
  const state = { active:true, access:true, route:null };
  const access = { accountId:owner.id, checkSession:() => state.active, canAccessProject:() => state.access };
  const sourceOptions = { ownerAccountId:owner.id, enabled:true, ...(options.sourceOptions || {}) };
  let source = createOwnerAttentionSource({ store, ...sourceOptions });
  const serviceOptions = { now, resolveNotificationRoute:() => state.route, ...(options.serviceOptions || {}) };
  let service = createOwnerAttentionService({ store, source, ...serviceOptions });
  const f = { root, store, owner, bot, item, erp, clock, now, state, access, source, service,
    publish(overrides = {}, account = bot) {
      return erp.publishWorkSession(account, { item_id:item.id, idempotency_key:`attention-synthetic-${++counter}`,
        client_session_ref:'oa1:review_document:1:none', request_kind:'owner_attention/request',
        summary:'표지의 제목을 어느 표현으로 확정할까요?', knowledge:'내용 검토는 끝났으며 표지의 대외 표기만 결정하면 됩니다.',
        outputs:['artifact:synthetic-document-r1'], verification:'합성 문서의 구조와 내용 검증을 통과했습니다.',
        next_actions:['Buzz에서 확정할 제목을 한 줄로 알려 주세요.'],
        stop_conditions:['표지 제목 확정을 기다리는 문서 최종본 작업'], ...overrides }).session;
    },
    reopen() {
      store.db.close(); store = openStore(join(root, 'erp.db'));
      source = createOwnerAttentionSource({store,...sourceOptions});
      service = createOwnerAttentionService({store,source,...serviceOptions});
      f.store = store; f.source = source; f.service = service;
    },
    close() { try { store.db.close(); } catch {} if (root.startsWith(join(tmpdir(),'owner-attention-synthetic-'))) rmSync(root,{recursive:true,force:true}); },
  };
  t?.after(() => f.close());
  return f;
}
