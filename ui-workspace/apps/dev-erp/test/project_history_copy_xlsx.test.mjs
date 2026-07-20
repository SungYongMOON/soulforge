import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
} from "../../../../guild_hall/shared/project_history_actual_shadow.mjs";
import {
  sha256Canonical,
} from "../../../../guild_hall/shared/project_history_envelope.mjs";
import {
  buildSyntheticFiveLaneShadowFixture,
  buildSyntheticH06CoverageFixture,
} from "../../../../guild_hall/shared/project_history_readiness.mjs";
import {
  buildCanonicalProjectHistoryCopyModel,
} from "../tools/project_history_copy_projector.mjs";
import {
  authorProjectHistoryCopyXlsx,
  readProjectHistoryCopyXlsx,
  verifyProjectHistoryCopyXlsxReadback,
} from "../tools/project_history_copy_xlsx.mjs";

function makeModel() {
  const shadow = buildSyntheticFiveLaneShadowFixture();
  const coverage = buildSyntheticH06CoverageFixture(shadow.envelopes);
  return buildCanonicalProjectHistoryCopyModel({
    schema_version: ACTUAL_SHADOW_GENERATION_SCHEMA_VERSION,
    generation_id: "-xlsx-generation",
    project_ref: shadow.project_ref,
    classification_state: "shadow",
    envelopes: shadow.envelopes,
    coverage_receipts: coverage.receipts,
    ordered_event_digest: sha256Canonical(shadow.envelopes.map((entry) => entry.metadata_digest)),
    source_attestation_digest: sha256Canonical({ source: "synthetic-xlsx-test" }),
    raw_payload_copied: false,
    accepted_history: false,
  });
}

test("XLSX author is byte-identical and strict readback reconstructs the ordered rows", () => {
  const model = makeModel();
  const first = authorProjectHistoryCopyXlsx(model);
  const second = authorProjectHistoryCopyXlsx(structuredClone(model));
  assert.deepEqual(second, first);
  assert.equal(first.subarray(0, 4).toString("hex"), "504b0304");
  const readback = readProjectHistoryCopyXlsx(first);
  assert.deepEqual(readback.rows, model.rows);
  assert.equal(readback.ordered_row_digest, model.ordered_row_digest);
  assert.equal(readback.hidden_sheet_count, 0);
  assert.equal(readback.external_link_count, 0);
  assert.equal(readback.formula_cell_count, 0);
  assert.equal(verifyProjectHistoryCopyXlsxReadback(readback, model), true);
});

test("XLSX formula detection does not reject an ordinary sha256 digest beginning with f", () => {
  const model = makeModel();
  const digest = `sha256:f${"0".repeat(63)}`;
  model.source_attestation_digest = digest;
  for (const row of model.rows) row.source_attestation_digest = digest;
  model.ordered_row_digest = sha256Canonical(model.rows);
  const readback = readProjectHistoryCopyXlsx(authorProjectHistoryCopyXlsx(model));
  assert.equal(readback.rows[0].source_attestation_digest, digest);
  assert.equal(verifyProjectHistoryCopyXlsxReadback(readback, model), true);
});

test("XLSX readback rejects formula cells and spreadsheet-prefix text", () => {
  const bytes = authorProjectHistoryCopyXlsx(makeModel());
  const entries = readStoredEntries(bytes);
  const sheet = textEntry(entries, "xl/worksheets/sheet1.xml");
  const formula = replaceEntry(entries, "xl/worksheets/sheet1.xml", sheet.replace(
    /<c r="L2" t="inlineStr"><is><t>mail<\/t><\/is><\/c>/u,
    '<c r="L2"><f>1+1</f><v>2</v></c>',
  ));
  assert.throws(
    () => readProjectHistoryCopyXlsx(buildStoredZip(formula)),
    (error) => ["xlsx_active_content_forbidden", "xlsx_formula_cell_forbidden"].includes(error.code),
  );

  const prefixed = replaceEntry(entries, "xl/worksheets/sheet1.xml", sheet.replace(
    /<c r="K2" t="inlineStr"><is><t>[^<]*<\/t><\/is><\/c>/u,
    '<c r="K2" t="inlineStr"><is><t>=cmd</t></is></c>',
  ));
  assert.throws(
    () => readProjectHistoryCopyXlsx(buildStoredZip(prefixed)),
    (error) => error.code === "xlsx_formula_prefix_forbidden",
  );
});

test("XLSX readback rejects hidden-sheet, external-link, and macro carriers", () => {
  const bytes = authorProjectHistoryCopyXlsx(makeModel());
  const entries = readStoredEntries(bytes);
  const workbook = textEntry(entries, "xl/workbook.xml");
  const hidden = replaceEntry(entries, "xl/workbook.xml", workbook.replace(
    '<sheet name="Project History" sheetId="1" r:id="rId1"/>',
    '<sheet name="Project History" sheetId="1" state="hidden" r:id="rId1"/>',
  ));
  assert.throws(
    () => readProjectHistoryCopyXlsx(buildStoredZip(hidden)),
    (error) => error.code === "xlsx_active_content_forbidden",
  );

  const external = [...entries, {
    name: "xl/externalLinks/externalLink1.xml",
    bytes: Buffer.from('<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>'),
  }];
  assert.throws(
    () => readProjectHistoryCopyXlsx(buildStoredZip(external)),
    (error) => error.code === "xlsx_entries_invalid",
  );

  const macro = [...entries, { name: "xl/vbaProject.bin", bytes: Buffer.from("synthetic-macro") }];
  assert.throws(
    () => readProjectHistoryCopyXlsx(buildStoredZip(macro)),
    (error) => error.code === "xlsx_entries_invalid",
  );
});

test("XLSX ZIP parser rejects duplicate entries and CRC corruption", () => {
  const bytes = authorProjectHistoryCopyXlsx(makeModel());
  const entries = readStoredEntries(bytes);
  const duplicate = [...entries, { ...entries[0], bytes: Buffer.from(entries[0].bytes) }];
  assert.throws(
    () => readProjectHistoryCopyXlsx(buildStoredZip(duplicate)),
    (error) => error.code === "xlsx_zip_duplicate_entry",
  );

  const corrupted = Buffer.from(bytes);
  const cellOffset = corrupted.indexOf(Buffer.from(">mail<", "utf8"));
  assert(cellOffset >= 0);
  corrupted[cellOffset + 1] = "n".charCodeAt(0);
  assert.throws(
    () => readProjectHistoryCopyXlsx(corrupted),
    (error) => error.code === "xlsx_zip_crc_mismatch",
  );
});

test("CRC-valid cell tampering is reconstructed but rejected against the ordered DB model", () => {
  const model = makeModel();
  const entries = readStoredEntries(authorProjectHistoryCopyXlsx(model));
  const sheet = textEntry(entries, "xl/worksheets/sheet1.xml");
  const tampered = replaceEntry(entries, "xl/worksheets/sheet1.xml", sheet.replace(">mail<", ">file<"));
  const readback = readProjectHistoryCopyXlsx(buildStoredZip(tampered));
  assert.notEqual(readback.ordered_row_digest, model.ordered_row_digest);
  assert.throws(
    () => verifyProjectHistoryCopyXlsxReadback(readback, model),
    (error) => error.code === "xlsx_readback_parity_mismatch",
  );
});

function textEntry(entries, name) {
  const entry = entries.find((candidate) => candidate.name === name);
  assert(entry, `missing ${name}`);
  return entry.bytes.toString("utf8");
}

function replaceEntry(entries, name, content) {
  return entries.map((entry) => entry.name === name
    ? { name, bytes: Buffer.from(content, "utf8") }
    : { name: entry.name, bytes: Buffer.from(entry.bytes) });
}

function readStoredEntries(buffer) {
  const entries = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    assert.equal(method, 0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    entries.push({
      name: buffer.subarray(nameStart, nameStart + nameLength).toString("utf8"),
      bytes: Buffer.from(buffer.subarray(dataStart, dataEnd)),
    });
    offset = dataEnd;
  }
  return entries;
}

function buildStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const content = Buffer.from(entry.bytes);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, end]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table = [];
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    table.push(crc >>> 0);
  }
  return table;
})();
