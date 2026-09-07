// Public-safe synthetic structured packet for the existing XLSX contract.
import { createHash } from 'node:crypto';
import { PROJECT_HISTORY_COPY_COLUMNS, PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION } from '../../../../../ui-workspace/apps/dev-erp/tools/project_history_copy_xlsx.mjs';
import { sha256Canonical } from '../../../../../guild_hall/shared/project_history_envelope.mjs';

export function syntheticXlsxPacket() {
  const model={schema_version:PROJECT_HISTORY_COPY_XLSX_INPUT_SCHEMA_VERSION,generation_id:'synthetic.workshop.1',project_id:'project.synthetic',classification_state:'shadow',event_count:2,coverage_count:2,ordered_event_digest:`sha256:${'a'.repeat(64)}`,source_attestation_digest:`sha256:${'b'.repeat(64)}`,raw_payload_copied:false,accepted_history:false,columns:[...PROJECT_HISTORY_COPY_COLUMNS],rows:[],ordered_row_digest:'',hidden_sheets:false,external_links:false,formula_cells:false};
  model.rows=['mail','file'].map((lane,index)=>({generation_id:model.generation_id,project_id:model.project_id,classification_state:model.classification_state,event_count:model.event_count,coverage_count:model.coverage_count,ordered_event_digest:model.ordered_event_digest,source_attestation_digest:model.source_attestation_digest,raw_payload_copied:false,accepted_history:false,sort_ordinal:index,occurrence_id:`occurrence.synthetic.${index}`,lane,event_at:'2026-09-07T00:00:00Z',valid_at:'2026-09-07T00:00:00Z',observed_at:'2026-09-07T00:00:00Z',known_at:'2026-09-07T00:00:00Z',recorded_at:'2026-09-07T00:00:00Z',metadata_digest:`sha256:${createHash('sha256').update(`synthetic-${index}`).digest('hex')}`}));
  model.ordered_row_digest=sha256Canonical(model.rows);
  return model;
}
