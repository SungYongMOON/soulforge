// Official @plaud-ai/cli 0.3.4 files output, src/commands/list-files.ts.
// DATE is created_at rendered in the CLI host's local calendar, not an instant.
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const HEADER = `  ${"ID".padEnd(34)}  ${"NAME".padEnd(36)}  ${"DATE".padEnd(12)}  DURATION`;
const RULE = `  ${"─".repeat(98)}`;
const COMMAND_ERROR_CODES = new Set([
  "plaud_deadline_exceeded", "plaud_command_timeout", "plaud_rate_limited",
  "plaud_authentication_failed", "plaud_network_failed",
]);
export const plaudCatalogMaxPages = 16;

function fail(code) {
  // Never attach command output or provider rows to an error.
  const error = new Error(code);
  error.code = code;
  return error;
}

/** Parse only the pinned files table; unknown or incomplete layouts fail closed. */
export function parsePlaudFilesPage(raw, { page, pageSize = 100 } = {}) {
  if (typeof raw !== "string" || !Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(pageSize) || pageSize < 10 || pageSize > 100) {
    throw fail("plaud_catalog_malformed_page");
  }
  const lines = raw.replace(ANSI_PATTERN, "").split(/\r?\n/u).filter((line) => line.trim());
  const countMatch = lines[0]?.match(/^Files on this page: (0|[1-9]\d*)$/u);
  const footerMatch = lines.at(-1)?.match(/^Page ([1-9]\d*)$/u);
  if (!countMatch || !footerMatch || Number(footerMatch[1]) !== page
    || lines[1] !== HEADER || lines[2] !== RULE) {
    throw fail("plaud_catalog_malformed_page");
  }
  const count = Number(countMatch[1]);
  if (!Number.isSafeInteger(count) || count > pageSize || lines.length !== count + 4) {
    throw fail("plaud_catalog_malformed_page");
  }
  const rows = [];
  const ids = new Set();
  for (const line of lines.slice(3, -1)) {
    const idMatch = line.match(/^  ([0-9a-f]{32,64}) /iu);
    if (!idMatch) throw fail("plaud_catalog_malformed_row");
    const id = idMatch[1];
    const prefix = `  ${id.padEnd(34)}  `;
    const dateOffset = prefix.length + 38;
    const date = line.slice(dateOffset, dateOffset + 12).trimEnd();
    const duration = line.slice(dateOffset + 14);
    if (!line.startsWith(prefix) || line.slice(dateOffset - 2, dateOffset) !== "  "
      || line.slice(dateOffset + 12, dateOffset + 14) !== "  "
      || !/^(?:-|\d+s|\d+m\d{2}s|\d+h\d{2}m)$/u.test(duration)
      || !(date === "-" || (/^\d{4}-\d{2}-\d{2}$/u.test(date)
        && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date))) {
      throw fail("plaud_catalog_malformed_row");
    }
    const normalizedId = id.toLowerCase();
    if (ids.has(normalizedId)) throw fail("plaud_catalog_duplicate_id");
    ids.add(normalizedId);
    rows.push({ id: normalizedId, date: date === "-" ? null : date });
  }
  return rows;
}

/** Read-only bounded observation; no filesystem, provider content, or partial success. */
export async function collectPlaudCatalog(options = {}) {
  const {
    command = "plaud", commandRunner, cwd, clock = Date.now,
    deadlineAtMs, commandTimeoutMs = 120000, platform = process.platform,
    maxPages = plaudCatalogMaxPages, pageSize = 100,
  } = options;
  if (typeof commandRunner !== "function" || typeof clock !== "function"
    || !Number.isFinite(deadlineAtMs) || !Number.isSafeInteger(commandTimeoutMs) || commandTimeoutMs <= 0
    || !Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > plaudCatalogMaxPages
    || !Number.isSafeInteger(pageSize) || pageSize < 10 || pageSize > 100) {
    throw fail("plaud_catalog_invalid_options");
  }
  // runPlaudCommand can spend T resolving the Windows shim and another T spawning it.
  const admissionMs = commandTimeoutMs * (platform === "win32" ? 2 : 1);
  const now = () => {
    const value = clock();
    if (!Number.isFinite(value) || value >= deadlineAtMs) throw fail("plaud_catalog_deadline_exceeded");
    return value;
  };
  const readPage = async (page) => {
    if (deadlineAtMs - now() < admissionMs) throw fail("plaud_catalog_deadline_exceeded");
    let raw;
    try {
      raw = await commandRunner(command, ["files", "--page", String(page), "--page-size", String(pageSize)], {
        cwd, timeoutMs: commandTimeoutMs,
      });
    } catch (error) {
      throw fail(COMMAND_ERROR_CODES.has(error?.code) ? error.code : "plaud_catalog_command_failed");
    }
    now();
    return parsePlaudFilesPage(raw, { page, pageSize });
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const pages = [];
    const rows = [];
    const ids = new Set();
    let terminal = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const batch = await readPage(page);
      pages.push(batch);
      if (batch.length === 0) {
        terminal = page;
        break;
      }
      for (const row of batch) {
        if (ids.has(row.id)) throw fail("plaud_catalog_duplicate_id");
        ids.add(row.id);
        rows.push(row);
      }
    }
    if (!terminal) throw fail("plaud_catalog_page_limit");
    // Short pages never terminate a scan. Recheck distinct head, last nonempty,
    // and explicit empty boundary; this is an observation, not a provider snapshot.
    let changed = false;
    for (const page of new Set([1, Math.max(1, terminal - 1), terminal])) {
      const checked = await readPage(page);
      if (JSON.stringify(checked) !== JSON.stringify(pages[page - 1])) {
        changed = true;
        break;
      }
    }
    if (changed) {
      if (attempt === 1) throw fail("plaud_catalog_unstable");
      continue;
    }
    return { rows, page_count: terminal, complete: true, observed_at: new Date(now()).toISOString() };
  }
  throw fail("plaud_catalog_unstable");
}
