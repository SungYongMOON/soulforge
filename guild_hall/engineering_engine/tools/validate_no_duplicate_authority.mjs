// Structural validator: ensures that target core/ and engines/ are the sole canonical implementations,
// that legacy flat paths contain only thin compatibility re-exports / forwarders or legacy pointers,
// and that cross-package duplicates / wrong-domain files do not exist across core/ and engines/.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(HERE, '..');

export const FLAT_DIRS = [
  'kernel',
  'assembly',
  'stage_rules',
  'subjects',
  'observation',
  'guidance',
  'evaluation',
  'mcp',
  'fixtures',
  'contracts',
  'manual',
  'tools',
  'tests',
];

// Explicitly justified whole-engine shared root tools
export const JUSTIFIED_SHARED_ROOT_TOOLS = new Set([
  'emit_manifest.mjs',
  'emit_release_manifest.mjs',
  'emit_topology.mjs',
  'phase_1_integration_check.mjs',
  'validate_no_duplicate_authority.mjs',
]);

const DISALLOWED_IMPLEMENTATION_PATTERNS = [
  /\bfunction\s+[A-Za-z0-9_]+\s*\(/u,
  /\bclass\s+[A-Za-z0-9_]+/u,
  /\bconst\s+[A-Za-z0-9_]+\s*=\s*\([^)]*\)\s*=>/u,
  /\blet\s+[A-Za-z0-9_]+\s*=\s*\([^)]*\)\s*=>/u,
];

export function checkDirectory(dirRel, customEngineRoot = ENGINE_ROOT) {
  const fullDir = path.join(customEngineRoot, dirRel);
  const violations = [];
  let entries = [];
  try {
    entries = readdirSync(fullDir, { withFileTypes: true });
  } catch (err) {
    return violations;
  }

  for (const entry of entries) {
    const fullPath = path.join(fullDir, entry.name);
    const relPath = path.relative(customEngineRoot, fullPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      if (dirRel === 'mcp' && entry.name === 'tools') {
        const subViolations = checkDirectory('mcp/tools', customEngineRoot);
        violations.push(...subViolations);
      } else {
        violations.push({
          file: relPath,
          reason: 'UNEXPECTED_SUBDIRECTORY',
          detail: `Flat legacy directory "${dirRel}" should not contain nested directory "${entry.name}"`,
        });
      }
      continue;
    }

    // Check pointer directories (contracts, manual)
    if (dirRel === 'contracts' || dirRel === 'manual') {
      if (entry.name !== 'README.md') {
        violations.push({
          file: relPath,
          reason: 'DUPLICATE_NON_CODE_CANON',
          detail: `Legacy "${dirRel}" must only contain a pointer README.md, found: ${entry.name}`,
        });
      }
      continue;
    }

    // Check fixtures directory: strictly no data payloads (JSON, SHA, YAML, etc.)
    if (dirRel === 'fixtures') {
      if (entry.name === 'README.md') continue;
      if (!entry.name.endsWith('.mjs')) {
        violations.push({
          file: relPath,
          reason: 'DUPLICATE_FIXTURE_PAYLOAD',
          detail: `Legacy fixtures directory must not contain raw payload files (${entry.name}); canonical fixtures reside in engines/<domain>/fixtures/`,
        });
        continue;
      }
    }

    // Check tools directory
    if (dirRel === 'tools') {
      if (JUSTIFIED_SHARED_ROOT_TOOLS.has(entry.name)) {
        // Justified shared tool: verify it exists in our explicit allowlist
        continue;
      }
      // Non-shared tools must be thin forwarders
      if (!entry.name.endsWith('.mjs')) {
        violations.push({
          file: relPath,
          reason: 'UNEXPECTED_TOOL_FILE',
          detail: `Legacy tool "${entry.name}" must be an .mjs forwarding stub`,
        });
        continue;
      }
    }

    // Check tests directory
    if (dirRel === 'tests') {
      if (entry.name === 'README.md') continue;
      if (!entry.name.endsWith('.mjs')) {
        violations.push({
          file: relPath,
          reason: 'UNEXPECTED_TEST_FILE',
          detail: `Legacy tests directory must only contain .mjs forwarders or README.md, found: ${entry.name}`,
        });
        continue;
      }
    }

    if (!entry.name.endsWith('.mjs') && !entry.name.endsWith('.md')) {
      violations.push({
        file: relPath,
        reason: 'UNEXPECTED_FILE_TYPE',
        detail: `File "${entry.name}" in legacy directory "${dirRel}" is not allowed`,
      });
      continue;
    }

    if (entry.name.endsWith('.mjs')) {
      const content = readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      if (lines.length > 25) {
        violations.push({
          file: relPath,
          reason: 'EXCESSIVE_WRAPPER_LENGTH',
          detail: `Compatibility wrapper has ${lines.length} lines (max expected is 25)`,
        });
      }

      for (const pattern of DISALLOWED_IMPLEMENTATION_PATTERNS) {
        if (pattern.test(content)) {
          violations.push({
            file: relPath,
            reason: 'DUPLICATE_IMPLEMENTATION_AUTHORITY',
            detail: `Compatibility wrapper appears to declare executable implementation logic matching ${pattern}`,
          });
          break;
        }
      }
    }
  }

  return violations;
}

export function checkCrossPackageDuplication(customEngineRoot = ENGINE_ROOT) {
  const violations = [];

  // Check 1: SE tools must not duplicate shared root tools
  const seToolsDir = path.join(customEngineRoot, 'engines', 'systems_engineering', 'tools');
  if (existsSync(seToolsDir)) {
    for (const toolName of JUSTIFIED_SHARED_ROOT_TOOLS) {
      const duplicatePath = path.join(seToolsDir, toolName);
      if (existsSync(duplicatePath)) {
        violations.push({
          file: path.relative(customEngineRoot, duplicatePath).replace(/\\/g, '/'),
          reason: 'DUPLICATE_SHARED_ROOT_TOOL',
          detail: `Root shared tool "${toolName}" must not be duplicated inside domain package engines/systems_engineering/tools/`,
        });
      }
    }

    // Check 2: SE tools must not contain wrong-domain tools (e.g. quality_readiness_runner)
    const wrongDomainTools = ['quality_readiness_runner.mjs'];
    for (const wrongTool of wrongDomainTools) {
      const wrongPath = path.join(seToolsDir, wrongTool);
      if (existsSync(wrongPath)) {
        violations.push({
          file: path.relative(customEngineRoot, wrongPath).replace(/\\/g, '/'),
          reason: 'WRONG_DOMAIN_TOOL',
          detail: `Wrong-domain tool "${wrongTool}" must not reside in engines/systems_engineering/tools/`,
        });
      }
    }
  }

  // Check 3: SE package must not duplicate root ENGINE_VERSION
  const duplicateVersionFile = path.join(customEngineRoot, 'engines', 'systems_engineering', 'topology', 'ENGINE_VERSION');
  if (existsSync(duplicateVersionFile)) {
    violations.push({
      file: path.relative(customEngineRoot, duplicateVersionFile).replace(/\\/g, '/'),
      reason: 'DUPLICATE_ENGINE_VERSION',
      detail: 'ENGINE_VERSION belongs solely at root topology/ENGINE_VERSION',
    });
  }

  return violations;
}

export function checkDomainPackagesTestPlacement(customEngineRoot = ENGINE_ROOT) {
  const violations = [];
  const enginesDir = path.join(customEngineRoot, 'engines');
  if (!existsSync(enginesDir)) return violations;

  let domainDirs = [];
  try {
    domainDirs = readdirSync(enginesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return violations;
  }

  function scanDirForDisplacedTests(currentDir, domainName) {
    let entries = [];
    try {
      entries = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'tests') {
          scanDirForDisplacedTests(fullPath, domainName);
        }
      } else if (entry.isFile() && (entry.name.endsWith('.test.mjs') || entry.name.endsWith('.test.js'))) {
        violations.push({
          file: path.relative(customEngineRoot, fullPath).replace(/\\/g, '/'),
          reason: 'DISPLACED_TEST_AUTHORITY',
          detail: `Test file "${entry.name}" in domain package "${domainName}" must reside in its tests/ subtree, not in ${path.relative(customEngineRoot, currentDir).replace(/\\/g, '/')}`,
        });
      }
    }
  }

  for (const domain of domainDirs) {
    const domainPath = path.join(enginesDir, domain);
    scanDirForDisplacedTests(domainPath, domain);
  }

  return violations;
}

export function validateNoDuplicateAuthority(customEngineRoot = ENGINE_ROOT) {
  const violations = [];
  for (const dir of FLAT_DIRS) {
    violations.push(...checkDirectory(dir, customEngineRoot));
  }
  violations.push(...checkCrossPackageDuplication(customEngineRoot));
  violations.push(...checkDomainPackagesTestPlacement(customEngineRoot));
  return violations;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const violations = validateNoDuplicateAuthority();
  if (violations.length > 0) {
    console.error(JSON.stringify({
      verified: 'guild_hall/engineering_engine no duplicate authority',
      ok: false,
      violations_count: violations.length,
      violations,
    }, null, 2));
    process.exit(1);
  } else {
    console.log(JSON.stringify({
      verified: 'guild_hall/engineering_engine no duplicate authority',
      ok: true,
      checked_directories: FLAT_DIRS,
      violations_count: 0,
      violations: [],
    }, null, 2));
    process.exit(0);
  }
}
