import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {closeSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {performance} from 'node:perf_hooks';
import {runBoundedToolProcess} from '../src/bounded_tool_process.mjs';
import {pinHwpxPdfVerifierBinding, verifyHwpxPdfVerifierBinding, verifyRenderedHwpxPdf} from '../src/hwpx_pdf_verifier.mjs';
import {sha256} from '../src/workshop_files.mjs';

const python = process.env.SOULFORGE_PDF_TEST_PYTHON;
const poppler = process.env.SOULFORGE_PDF_TEST_POPPLER;
const temporary = (t, retain = () => false) => {const root = mkdtempSync(path.join(tmpdir(), 'sf-hwpx-pdf-'));
  t.after(() => {if (retain()) {console.log(JSON.stringify({retained_synthetic_fixture: root})); return;}
    rmSync(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});}); return root;};
const control = () => ({queue: {assertCurrentLease() {}}, lease: {expires_at: new Date(Date.now() + 30000).toISOString()}, deadline: performance.now() + 30000});

test('bounded child keeps JSON by default and permits explicit direct raster output only', async t => {
  const root = temporary(t), options = {executable: process.execPath, runRoot: root, ...control()};
  assert.deepEqual(await runBoundedToolProcess({...options, args: ['-e', 'console.log(JSON.stringify({ok:true}))']}), {ok: true});
  await assert.rejects(runBoundedToolProcess({...options, args: ['-e', 'console.log("plain")']}), {code: 'validator_failed'});
  await assert.rejects(runBoundedToolProcess({...options, args: [], resultFormat: 'anything'}), {code: 'runner_output_mode_invalid'});
  const file = path.join(root, 'raster.bin'), fd = openSync(file, 'wx');
  try {
    assert.deepEqual(await runBoundedToolProcess({...options, args: ['-e', 'process.stdout.write("synthetic raster")'],
      resultFormat: 'exit_code', stdoutFd: fd}), {exit_code: 0});
    await assert.rejects(runBoundedToolProcess({...options, args: [], stdoutFd: fd}), {code: 'runner_output_mode_invalid'});
  } finally {closeSync(fd);}
  assert.equal(readFileSync(file, 'utf8'), 'synthetic raster');
  await assert.rejects(runBoundedToolProcess({...options, args: ['-e', 'process.exit(2)'], resultFormat: 'exit_code'}), {code: 'runner_failed'});
});

test('real pinned PDF parser and rasterizer check every page, text and artifact bytes', {skip: !python || !poppler}, async t => {
  let complete = false;
  const root = temporary(t, () => Boolean(process.env.SOULFORGE_PDF_QA_EVIDENCE_DIR) && !complete), pdfRoot = path.join(root, 'exports'), workRoot = path.join(root, 'work');
  mkdirSync(pdfRoot); mkdirSync(workRoot);
  const pdfPath = path.join(pdfRoot, 'synthetic.pdf');
  const makePdf = (pages = 1) => {
    const program = `from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
import sys
c=canvas.Canvas(sys.argv[1],pagesize=A4)
for i in range(int(sys.argv[2])):
 c.setFont('Helvetica',14);c.drawString(72,760,'Hello HWPX');c.setFont('Helvetica',11);c.drawString(72,730,'Bounded output');c.showPage()
c.save()`;
    const run = spawnSync(python, ['-I', '-B', '-c', program, pdfPath, String(pages)], {encoding: 'utf8', windowsHide: true,
      timeout: 10000, cwd: root, env: {SystemRoot: process.env.SystemRoot ?? '', HOME: root, USERPROFILE: root, TEMP: root, TMP: root}});
    assert.equal(run.status, 0, 'synthetic PDF generation');
  };
  makePdf();
  const binding = pinHwpxPdfVerifierBinding({pythonExecutable: python, popplerExecutable: poppler, pdfRoot});
  const noProbe = mock.method(childProcess, 'spawnSync', () => { throw new Error('verification_must_not_execute_live_code'); });
  syncBuiltinESMExports();
  try {
    assert.equal(verifyHwpxPdfVerifierBinding(binding), sha256(JSON.stringify(binding)));
    assert.throws(() => verifyHwpxPdfVerifierBinding({...binding, library_files: []}), {code: 'binding_drift'});
    assert.equal(noProbe.mock.callCount(), 0);
  } finally {noProbe.mock.restore(); syncBuiltinESMExports();}
  const options = () => ({pdfPath, pdfSha256: sha256(readFileSync(pdfPath)), hwpxSha256: '1'.repeat(64),
    title: 'Hello HWPX', body: 'Bounded output', runRoot: workRoot, binding, ...control()});
  const proof = await verifyRenderedHwpxPdf(options());
  assert.equal(proof.page_count, 1); assert.equal(proof.pdf_sha256, sha256(readFileSync(pdfPath)));
  assert.equal(proof.renders[0].sha256, sha256(readFileSync(proof.image_paths[0])));
  assert.equal(proof.visual_review_required, true);
  if (process.env.SOULFORGE_PDF_QA_EVIDENCE_DIR) {
    const evidence = process.env.SOULFORGE_PDF_QA_EVIDENCE_DIR;
    mkdirSync(evidence, {recursive: true});
    for (const [source, name] of [[proof.pdf_path, 'synthetic.pdf'], [proof.image_paths[0], 'page-1.png']]) {
      const dest = path.join(evidence, name); assert.equal(existsSync(dest), false); copyFileSync(source, dest);
    }
    writeFileSync(path.join(evidence, 'readback.json'), JSON.stringify(proof, null, 2), {flag: 'wx'});
  }
  assert.throws(() => verifyHwpxPdfVerifierBinding({...binding, python_sha256: '0'.repeat(64)}), {code: 'binding_drift'});
  await assert.rejects(verifyRenderedHwpxPdf({...options(), pdfSha256: '0'.repeat(64)}), {code: 'pdf_input_invalid'});
  await assert.rejects(verifyRenderedHwpxPdf({...options(), body: 'Missing text'}));
  makePdf(2);
  await assert.rejects(verifyRenderedHwpxPdf(options()));
  complete = true;
});
