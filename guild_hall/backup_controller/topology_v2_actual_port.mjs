/**
 * Production filesystem port for the topology v2 actual reader.
 *
 * Every call here is a READ. There is no create, write, move, delete, mount or
 * spawn in this file, and the reader is given nothing else through which to
 * reach the host.
 *
 * Kept separate from `topology_v2_actual_reader.mjs` so the reader stays
 * exercisable with an injected fake and the real `node:fs` surface stays one
 * small, auditable file.
 */

import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

function kindOf(stat) {
  if (stat.isDirectory()) return 'directory';
  if (stat.isFile()) return 'file';
  return 'other';
}

export function createTopologyV2ActualPort({ platform = process.platform } = {}) {
  return {
    platform,
    lstat(path) {
      try {
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) {
          // A link's TARGET kind decides whether the binding's declared kind is
          // satisfiable at all; is_symlink is what makes the judge refuse.
          let targetKind = 'other';
          try {
            targetKind = kindOf(lstatSync(realpathSync.native(path)));
          } catch {
            targetKind = 'other';
          }
          return { exists: true, kind: targetKind, is_symlink: true };
        }
        return { exists: true, kind: kindOf(stat), is_symlink: false };
      } catch {
        return { exists: false, kind: 'other', is_symlink: false };
      }
    },
    realpath(path) {
      try {
        return realpathSync.native(path);
      } catch {
        return null;
      }
    },
    readUtf8(path) {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    },
    hashFile(path) {
      try {
        const bytes = readFileSync(path);
        return { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
      } catch {
        return null;
      }
    },
    listDir(path) {
      try {
        return readdirSync(path);
      } catch {
        return null;
      }
    },
    joinPath(...segments) {
      return join(...segments);
    },
  };
}
