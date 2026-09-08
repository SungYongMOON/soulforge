import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {closeSync, copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
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
 c.setFont('Helvetica',14);c.drawString(72,760,'Hello HWPX');c.setFont('Helvetica',11);c.drawString(72,730,'Bounded output')
 c.drawString(72,700,'Complete paragraph on page '+str(i+1));c.showPage()
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
  const expectedText = pages => ['Hello HWPX', 'Bounded output', ...Array.from({length: pages}, (_, i) => `Complete paragraph on page ${i+1}`)];
  let multiProof;
  for (const pages of [2, 3]) {
    await t.test(`${pages} actual pages render completely with every expected paragraph`, async () => {
      makePdf(pages);
      multiProof = await verifyRenderedHwpxPdf({...options(), expectedText: expectedText(pages),
        ...(pages === 2 ? {expectedPageCount: pages} : {})});
      assert.equal(multiProof.page_count, pages);
      assert.equal(multiProof.page_count_basis, pages === 2 ? 'expected_match' : 'observed');
      assert.equal(multiProof.image_paths.length, pages);
      assert.equal(multiProof.renders.length, pages);
      for (const [i, render] of multiProof.renders.entries()) {
        const png = readFileSync(multiProof.image_paths[i]);
        assert.equal(render.sha256, sha256(png)); assert.equal(render.size_bytes, png.length);
      }
      assert.equal(multiProof.render_manifest_sha256, sha256(readFileSync(multiProof.render_manifest_path)));
      assert.equal(multiProof.visual_review_required, true);
      if (process.env.SOULFORGE_PDF_QA_EVIDENCE_DIR) {
        const evidence = path.join(process.env.SOULFORGE_PDF_QA_EVIDENCE_DIR, `${pages}-pages`);
        mkdirSync(evidence);
        for (const source of [multiProof.pdf_path, ...multiProof.image_paths, multiProof.render_manifest_path]) {
          const dest = path.join(evidence, path.basename(source)); assert.equal(existsSync(dest), false); copyFileSync(source, dest);
        }
        writeFileSync(path.join(evidence, 'readback.json'), JSON.stringify(multiProof, null, 2), {flag: 'wx'});
      }
    });
  }
  await t.test('last-page full text and exact expected page count are mandatory when supplied', async () => {
    await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: [...expectedText(3), 'Absent final-page paragraph']}));
    await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: ['Complete paragraph on page 3', 'Complete paragraph on page 3']}));
    await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: ['Complete paragraph on page 2', 'Complete paragraph on page 1']}));
    await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: expectedText(3), expectedPageCount: 2}));
    await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: expectedText(3), expectedPageCount: 65}), {code: 'pdf_input_invalid'});
  });
  await t.test('lease callback cannot replace pinned QA code, request or copied library bytes/set', async () => {
    for (const mutation of ['script', 'library', 'extra_library', 'request', 'before_acceptance']) {
      const existing = new Set(readdirSync(workRoot)); let changed = false;
      const queue = {assertCurrentLease() {
        const directory = readdirSync(workRoot).find(name => !existing.has(name));
        if (!directory || changed) return;
        const target = path.join(workRoot, directory), requestPath = path.join(target, 'pdf-readback-request.json');
        if (!existsSync(requestPath) || mutation === 'before_acceptance' && !existsSync(path.join(target, 'pdf-render-manifest.json'))) return;
        if (mutation === 'script' || mutation === 'before_acceptance') {
          const scriptPath = path.join(target, 'hwpx_pdf_readback.py');
          writeFileSync(scriptPath, readFileSync(scriptPath, 'utf8').replace('if found < 0:', 'if False:'));
        } else if (mutation === 'library') writeFileSync(path.join(target, 'runtime/pypdf/__init__.py'), '\n# changed snapshot', {flag:'a'});
        else if (mutation === 'extra_library') writeFileSync(path.join(target, 'runtime/unpinned.py'), '# foreign code', {flag:'wx'});
        else {
          const request = JSON.parse(readFileSync(requestPath, 'utf8')); request.expected_text = ['Hello HWPX'];
          writeFileSync(requestPath, JSON.stringify(request));
        }
        changed = true;
      }};
      await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: mutation === 'before_acceptance'
        ? expectedText(3) : [...expectedText(3), 'Text absent from the real PDF'], queue}));
      assert.equal(changed, true, `snapshot mutation exercised: ${mutation}`);
    }
  });
  await t.test('missing/extra images and changed snapshot PDF fail before a success receipt', async () => {
    for (const mutation of ['missing', 'extra', 'pdf', 'manifest_exists']) {
      const target = path.join(root, `mutate-${mutation}`); cpSync(path.dirname(multiProof.pdf_path), target, {recursive: true});
      if (mutation !== 'manifest_exists') rmSync(path.join(target, 'pdf-render-manifest.json'));
      if (mutation === 'missing') rmSync(path.join(target, 'page-3.png'));
      if (mutation === 'extra') copyFileSync(path.join(target, 'page-1.png'), path.join(target, 'page-4.png'));
      if (mutation === 'pdf') writeFileSync(path.join(target, 'rendered.pdf'), '\n%tampered', {flag: 'a'});
      await assert.rejects(runBoundedToolProcess({executable: python,
        args: ['-I', '-S', '-B', path.join(target, 'hwpx_pdf_readback.py'), 'validate', target, path.join(target, 'runtime')],
        runRoot: target, ...control()}));
    }
  });
  await t.test('64-page receipts stay in a bounded manifest beyond the child stdout cap', async () => {
    const target = path.join(root, 'manifest-64'); cpSync(path.dirname(multiProof.pdf_path), target, {recursive: true});
    rmSync(path.join(target, 'pdf-render-manifest.json'));
    makePdf(64); copyFileSync(pdfPath, path.join(target, 'rendered.pdf'));
    const requestPath = path.join(target, 'pdf-readback-request.json');
    const request = JSON.parse(readFileSync(requestPath, 'utf8'));
    request.pdf_sha256 = sha256(readFileSync(pdfPath)); request.expected_page_count = 64;
    writeFileSync(requestPath, JSON.stringify(request));
    // Reused real raster bytes test receipt transport only, not 64-page visual fidelity.
    for (let page = 4; page <= 64; page++) copyFileSync(path.join(target, 'page-1.png'), path.join(target, `page-${page}.png`));
    const receipt = await runBoundedToolProcess({executable: python,
      args: ['-I', '-S', '-B', path.join(target, 'hwpx_pdf_readback.py'), 'validate', target, path.join(target, 'runtime')],
      runRoot: target, ...control()});
    const bytes = readFileSync(path.join(target, 'pdf-render-manifest.json'));
    assert.equal(receipt.page_count, 64); assert.ok(bytes.length > 4096 && bytes.length <= 32768);
    assert.ok(Buffer.byteLength(JSON.stringify(receipt)) < 4096);
    assert.equal(receipt.manifest_sha256, sha256(bytes)); assert.equal(JSON.parse(bytes).renders.length, 64);
    makePdf(3);
  });
  // Exercise the actual parser and first raster, then revoke the lease before
  // another page can start. No mock parser/raster substitutes are involved.
  for (const reason of ['job_cancel_requested', 'lease_expired', 'fence_stale', 'deadline', 'source_tampered']) {
    await t.test(`all-page verification stops without partial success: ${reason}`, async () => {
      const originalSpawn = childProcess.spawn;
      let rasterCount = 0, stopped = false, qaDirectory;
      const originalNow = performance.now.bind(performance), start = originalNow();
      const clockMock = reason === 'deadline' ? mock.method(performance, 'now', () => stopped ? start + 60000 : originalNow()) : null;
      const spawnMock = mock.method(childProcess, 'spawn', (executable, args, spawnOptions) => {
        const child = originalSpawn(executable, args, spawnOptions);
        if (executable === poppler) {
          rasterCount++; qaDirectory = spawnOptions.cwd;
          if (rasterCount === 1) child.once('close', () => {
            stopped = true;
            if (reason === 'source_tampered') writeFileSync(pdfPath, '\n%changed', {flag: 'a'});
          });
        }
        return child;
      });
      syncBuiltinESMExports();
      try {
        await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: expectedText(3), queue: {assertCurrentLease() {
          if (stopped && !['source_tampered', 'deadline'].includes(reason)) throw Object.assign(new Error(reason), {code: reason});
        }}}), error => reason === 'source_tampered' ? error.code === 'pdf_input_changed'
          : [reason, 'cancelled', 'runner_timeout', 'fence_stale'].includes(error.code));
        if (reason !== 'source_tampered') {
          assert.equal(rasterCount, 1);
          assert.equal(existsSync(path.join(qaDirectory, 'page-2.png')), false);
          assert.equal(existsSync(path.join(qaDirectory, 'pdf-render-manifest.json')), false);
        }
      } finally {spawnMock.mock.restore(); clockMock?.mock.restore(); syncBuiltinESMExports();}
    });
  }
  await t.test('expired total deadline launches no child and returns no partial success', async () => {
    const before = readdirSync(workRoot), noSpawn = mock.method(childProcess, 'spawn', () => {throw new Error('must_not_spawn');});
    syncBuiltinESMExports();
    try {
      await assert.rejects(verifyRenderedHwpxPdf({...options(), expectedText: expectedText(3), deadline: performance.now() - 1}), {code: 'runner_timeout'});
      assert.equal(noSpawn.mock.callCount(), 0); assert.deepEqual(readdirSync(workRoot), before);
    } finally {noSpawn.mock.restore(); syncBuiltinESMExports();}
  });
  complete = true;
});
