import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import test from "node:test";

import {
  ROOT_STATUS,
  containsRoot,
  resolveKnowledgeRoot,
  rootRelation,
} from "./knowledge_root_resolver.mjs";

function syntheticRoots(t) {
  const containmentRoot = mkdtempSync(join(tmpdir(), "soulforge-knowledge-root-"));
  t.after(() => rmSync(containmentRoot, { recursive: true, force: true }));
  const projectRoot = join(containmentRoot, "project-a");
  const projectChild = join(projectRoot, "derived");
  const commonRoot = join(containmentRoot, "common");
  mkdirSync(projectChild, { recursive: true });
  mkdirSync(commonRoot);
  return { containmentRoot, projectRoot, projectChild, commonRoot };
}

test("does not echo root paths and compares authentic in-process root relations", (t) => {
  const paths = syntheticRoots(t);
  const project = resolveKnowledgeRoot(paths.projectRoot, {
    containmentRoot: paths.containmentRoot,
  });
  const child = resolveKnowledgeRoot(paths.projectChild, {
    containmentRoot: paths.containmentRoot,
  });
  const common = resolveKnowledgeRoot(paths.commonRoot, {
    containmentRoot: paths.containmentRoot,
  });

  assert.deepEqual(Object.keys(project).sort(), ["local_path_commitment_sha256", "status"]);
  assert.equal(project.status, ROOT_STATUS.RESOLVED);
  assert.match(project.local_path_commitment_sha256, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(JSON.stringify(project).includes(paths.projectRoot), false);
  assert.equal(Object.isFrozen(project), true);
  assert.equal(containsRoot(project, child), true);
  assert.equal(containsRoot(child, project), false);
  assert.equal(rootRelation(project, child), "contains");
  assert.equal(rootRelation(child, project), "contained_by");
  assert.equal(rootRelation(project, common), "disjoint");
});

test("refuses relative, non-normalized, UNC, device, ADS, and control-character roots", (t) => {
  const paths = syntheticRoots(t);
  const rawCases = [
    ["relative-root", "path_invalid"],
    [
      `${paths.projectRoot}${sep}.`,
      process.platform === "win32" ? "path_unsafe" : "path_invalid",
    ],
    String.raw`\\server\share\project-a`,
    ["\\\\", "?", "\\", "C", ":", "\\", "project-a"].join(""),
    `${paths.projectRoot}:stream`,
    `${paths.projectRoot}\u0001`,
    `${paths.projectRoot}\u0000`,
  ];
  if (process.platform === "win32") {
    rawCases.push(
      `${paths.projectRoot}.`,
      `${paths.projectRoot} `,
      join(paths.containmentRoot, "NUL"),
    );
  }
  const cases = rawCases.map((entry) => (
    Array.isArray(entry) ? entry : [entry, "path_unsafe"]
  ));

  for (const [value, expectedCode] of cases) {
    assert.throws(
      () => resolveKnowledgeRoot(value, { containmentRoot: paths.containmentRoot }),
      (error) => {
        assert.equal(error.name, "KnowledgeRootResolverError");
        assert.equal(error.code, expectedCode);
        assert.equal(error.message.includes(value), false);
        return true;
      },
    );
  }
});

test("refuses missing, non-directory, and outside roots without leaking their paths", (t) => {
  const paths = syntheticRoots(t);
  const outsideRoot = mkdtempSync(join(tmpdir(), "soulforge-knowledge-outside-"));
  t.after(() => rmSync(outsideRoot, { recursive: true, force: true }));
  const missingOutsideRoot = join(outsideRoot, "not-present");
  const missingRoot = join(paths.containmentRoot, "missing");
  const fileRoot = join(paths.containmentRoot, "not-a-directory.txt");
  writeFileSync(fileRoot, "public synthetic fixture", "utf8");

  const cases = [
    [missingRoot, "root_unavailable"],
    [fileRoot, "root_not_direct_directory"],
    [outsideRoot, "root_outside_containment"],
    [missingOutsideRoot, "root_outside_containment"],
  ];
  for (const [value, expectedCode] of cases) {
    assert.throws(
      () => resolveKnowledgeRoot(value, { containmentRoot: paths.containmentRoot }),
      (error) => {
        assert.equal(error.code, expectedCode);
        assert.equal(error.message.includes(value), false);
        assert.equal(JSON.stringify(error).includes(value), false);
        return true;
      },
    );
  }
});

test("refuses selecting the containment root itself as a project or common root", (t) => {
  const paths = syntheticRoots(t);
  assert.throws(
    () => resolveKnowledgeRoot(paths.containmentRoot, {
      containmentRoot: paths.containmentRoot,
    }),
    (error) => error.code === "root_must_be_strict_descendant",
  );
});

test("keeps physical identities opaque, authentic, deterministic, and immutable", (t) => {
  const paths = syntheticRoots(t);
  const first = resolveKnowledgeRoot(paths.projectRoot, {
    containmentRoot: paths.containmentRoot,
  });
  const replay = resolveKnowledgeRoot(paths.projectRoot, {
    containmentRoot: paths.containmentRoot,
  });

  assert.notEqual(first, replay);
  assert.deepEqual(first, replay);
  assert.equal(rootRelation(first, replay), "same");
  assert.equal(containsRoot(first, replay), true);
  assert.throws(
    () => rootRelation(first, { ...first }),
    (error) => error.code === "invalid_resolution",
  );
  assert.throws(
    () => containsRoot(structuredClone(first), replay),
    (error) => error.code === "invalid_resolution",
  );
});

test("uses metadata-only filesystem APIs and never enumerates or reads root contents", () => {
  const source = readFileSync(new URL("./knowledge_root_resolver.mjs", import.meta.url), "utf8");
  const forbiddenApis = [
    "readdir",
    "opendir",
    "readFile",
    "writeFile",
    "appendFile",
    "createReadStream",
    "createWriteStream",
  ];
  for (const api of forbiddenApis) {
    assert.equal(source.includes(api), false, `${api} must not appear in the resolver`);
  }
  assert.match(source, /\blstatSync\b/u);
  assert.match(source, /\brealpathSync\b/u);
});

test("allows an explicit containment junction but refuses a junction as the selected root", (t) => {
  const paths = syntheticRoots(t);
  const aliasParent = mkdtempSync(join(tmpdir(), "soulforge-knowledge-alias-"));
  t.after(() => rmSync(aliasParent, { recursive: true, force: true }));
  const containmentAlias = join(aliasParent, "containment-link");
  const selectedLink = join(paths.containmentRoot, "selected-link");

  try {
    symlinkSync(paths.containmentRoot, containmentAlias, "junction");
    symlinkSync(paths.projectRoot, selectedLink, "junction");
  } catch (error) {
    t.diagnostic(`junction checks skipped: ${error.code ?? "unsupported"}`);
    return;
  }

  const throughApprovedAlias = resolveKnowledgeRoot(join(containmentAlias, "project-a"), {
    containmentRoot: containmentAlias,
  });
  const direct = resolveKnowledgeRoot(paths.projectRoot, {
    containmentRoot: paths.containmentRoot,
  });
  assert.equal(rootRelation(throughApprovedAlias, direct), "same");
  assert.throws(
    () => resolveKnowledgeRoot(selectedLink, { containmentRoot: paths.containmentRoot }),
    (error) => error.code === "root_not_direct_directory",
  );
  assert.throws(
    () => resolveKnowledgeRoot(join(selectedLink, "derived"), {
      containmentRoot: paths.containmentRoot,
    }),
    (error) => error.code === "root_not_direct_directory",
  );
});
