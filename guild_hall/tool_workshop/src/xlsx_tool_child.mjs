// Only invoked by the pinned local runner. No shell, network, plugins or Office.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { authorProjectHistoryCopyXlsx, readProjectHistoryCopyXlsx, validateProjectHistoryCopyXlsxInput, verifyProjectHistoryCopyXlsxReadback } from '../../../ui-workspace/apps/dev-erp/tools/project_history_copy_xlsx.mjs';

try {
  const [mode,input,output] = process.argv.slice(2);
  if (process.argv.length !== 5 || !['render','validate'].includes(mode)) throw new Error('arguments_invalid');
  const model=JSON.parse(readFileSync(input,'utf8'));
  validateProjectHistoryCopyXlsxInput(model);
  if (mode === 'render') writeFileSync(output,authorProjectHistoryCopyXlsx(model),{flag:'wx'});
  const bytes = readFileSync(output);
  const readback=readProjectHistoryCopyXlsx(bytes);
  verifyProjectHistoryCopyXlsxReadback(readback,model);
  process.stdout.write(JSON.stringify({sha256:createHash('sha256').update(bytes).digest('hex'),size_bytes:bytes.length,row_count:readback.rows.length,ordered_row_digest:readback.ordered_row_digest}));
} catch {
  process.stderr.write('xlsx_tool_failed');
  process.exitCode=1;
}
