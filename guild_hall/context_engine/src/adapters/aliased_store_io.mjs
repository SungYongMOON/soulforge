// The store io for a real estate, where the first segment of an address is a
// root class rather than a folder.
//
// `rootedStore` answers addresses below one absolute root, which is what a
// synthetic store is. A real project store is addressed as
// `data_root/20_PROJECTS/<project-ref>/…`, where `data_root` is a Path Registry
// alias: the address is portable and the table says where that class lives on
// this host. This composes the two and changes nothing else - the same
// `{ path, read }` contract, the same per-segment refusal of links, and the same
// `safeStoreRel` shape, so a manifest written through either io is byte-identical
// and a stored ref keeps meaning what it says.
//
// Nothing here learns a physical path from an address; an address that names no
// bound alias is refused rather than guessed at.
import { physicalRootFor } from '../../../path_registry/src/root_table.mjs';
import { rootedStore, safeStoreRel } from '../runtime/pair_store.mjs';

export class AliasedStoreIoError extends Error {
  constructor(code) { super(code); this.name = 'AliasedStoreIoError'; this.code = code; }
}
const fail = code => { throw new AliasedStoreIoError(code); };

const split = name => {
  if (!safeStoreRel(name)) fail('aliased_store_address_invalid');
  const cut = name.indexOf('/');
  // An address is an alias and something below it. A bare alias names a root,
  // and a root is not a thing this io hands out.
  if (cut < 1 || cut === name.length - 1) fail('aliased_store_address_invalid');
  return [name.slice(0, cut), name.slice(cut + 1)];
};

/**
 * `rootTable` comes from `readRootTable`, which admitted every root it holds.
 * Each alias gets its own guarded io, built once, so a root swapped underneath a
 * running caller is refused the same way `rootedStore` already refuses one.
 */
export function createAliasedStoreIo(rootTable) {
  const opened = new Map();
  const ioFor = alias => {
    if (!opened.has(alias)) {
      // physicalRootFor refuses an unbound alias; rootedStore re-checks the root
      // it is handed, so admission is asserted twice by two owners.
      try { opened.set(alias, rootedStore(physicalRootFor(rootTable, alias))); }
      catch (error) { return fail(error?.code === 'root_table_alias_not_bound' ? 'aliased_store_alias_not_bound' : 'aliased_store_root_unavailable'); }
    }
    return opened.get(alias);
  };
  return Object.freeze({
    // The table digest, never the roots: a receipt says which table answered, and
    // a reader who needs the place has to hold the table themselves.
    table_sha256: rootTable.table_sha256,
    aliases: rootTable.aliases,
    path(name, missing = false) {
      const [alias, rest] = split(name);
      return ioFor(alias).path(rest, missing);
    },
    read(name, maxBytes) {
      const [alias, rest] = split(name);
      return maxBytes === undefined ? ioFor(alias).read(rest) : ioFor(alias).read(rest, maxBytes);
    },
  });
}
