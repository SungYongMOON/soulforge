// HPP component closure, not a new Pack kind. Imported by the HPP emitter.
import { listFiles, moduleClosure } from "./spec_closure_lib.mjs";

export const SONAR_APP = "ui-workspace/apps/sonar-intel";
export function sonarIntelPackMembers(rootDir) {
  const validators = listFiles(rootDir, `${SONAR_APP}/test`, ".test.mjs");
  const entries = [`${SONAR_APP}/server.mjs`, ...listFiles(rootDir, `${SONAR_APP}/tools`, ".mjs"), ...validators];
  const runtime = moduleClosure(rootDir, entries).filter((file) => !validators.includes(file));
  return {
    server_modules: [...new Set([...runtime, `${SONAR_APP}/static/index.html`, `${SONAR_APP}/config/sources.json`, `${SONAR_APP}/config/keywords.json`, ...listFiles(rootDir, `${SONAR_APP}/test/fixtures`, ".xml")])].sort(),
    manifests: [`${SONAR_APP}/package.json`, `${SONAR_APP}/module.manifest.json`],
    operator_docs: [`${SONAR_APP}/README.md`, `${SONAR_APP}/docs/SONAR_INTEL_MASTER_PLAN_V1.md`, "guild_hall/deployment_pack/manuals/sonar_intel_install_recovery.v0.md"],
    validators,
  };
}
