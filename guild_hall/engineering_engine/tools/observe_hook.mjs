// Records which kernel module actually requested which other kernel module during a run.
//
// Loaded with `node --import <this file> <script>`. The resolve hook is told the parent that
// asked for each specifier, so every kernel-to-kernel edge the run actually traverses is
// observed rather than assumed. That is the difference between the topology saying an edge is
// declared and a receipt saying it was taken.
//
// What this proves: the edge was traversed by a real execution.
// What it does not prove: that data was processed, or that the call did anything useful. The
// receipt's observation_method is `module_load_observation` for exactly that reason.
//
// Writes one edge key per line so several suites can append to the same file without any
// coordination, and so a partial run still leaves usable evidence.

import { registerHooks } from 'node:module';
import { appendFileSync } from 'node:fs';
import process from 'node:process';

const OUT = process.env.SE_ENGINE_OBSERVATION_OUT;
const KERNEL_MODULE = /[/\\]kernel[/\\]([a-z0-9_]+)\.mjs$/;
const observed = new Set();

const kernelModuleName = (url) => {
  if (typeof url !== 'string') return null;
  const match = KERNEL_MODULE.exec(url);
  return match ? match[1] : null;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const result = nextResolve(specifier, context);
    // A test importing the kernel is not a topology edge, so an unnamed parent is skipped.
    const from = kernelModuleName(context?.parentURL);
    const to = kernelModuleName(result?.url);
    if (from !== null && to !== null && from !== to) observed.add(`${from}>${to}`);
    return result;
  },
});

process.on('exit', () => {
  if (!OUT || observed.size === 0) return;
  try {
    appendFileSync(OUT, `${[...observed].sort().join('\n')}\n`, 'utf8');
  } catch {
    // A run must not fail because its observation could not be recorded. The orchestrator
    // reports missing evidence as missing rather than inferring that nothing was traversed.
  }
});
