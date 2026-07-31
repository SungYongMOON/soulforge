import assert from "node:assert/strict";
import test from "node:test";

import { buildOwnerInboxFixture } from "./owner-inbox.mjs";
import {
  PROVIDER_ASSET_SLUGS,
  PROVIDER_ICON_KEYS,
  buildCompactCardView,
  resolveProviderVisual,
  selectObservedProviderEntries
} from "./provider-visual.mjs";

test("provider visual: observed provider별 library icon key를 결정한다", () => {
  assert.equal(
    resolveProviderVisual({ agent: "Codex", provider: "GPT", observed: true }).iconKey,
    PROVIDER_ICON_KEYS.CODEX_GPT
  );
  assert.equal(
    resolveProviderVisual({ agent: "Antigravity", provider: "Gemini", observed: true }).iconKey,
    PROVIDER_ICON_KEYS.ANTIGRAVITY_GEMINI
  );
  assert.equal(
    resolveProviderVisual({ agent: "Kimi", provider: "Kimi", observed: true }).iconKey,
    PROVIDER_ICON_KEYS.KIMI
  );
  assert.deepEqual(PROVIDER_ASSET_SLUGS, {
    antigravity: "antigravity-color.svg",
    codex: "codex-color.svg",
    kimi: "kimi-color.svg"
  });
});

test("provider visual: multi-agent는 observed icon을 각각 보존하고 UNKNOWN은 추정하지 않는다", () => {
  const fixture = buildOwnerInboxFixture();
  const multi = fixture.tasks.find((task) => task.id === "fixture-atlas-multi-agent");
  const unknown = fixture.tasks.find((task) => task.id === "fixture-lumen-unknown");

  assert.deepEqual(
    buildCompactCardView(multi).providers.map((entry) => entry.iconKey),
    [PROVIDER_ICON_KEYS.CODEX_GPT, PROVIDER_ICON_KEYS.ANTIGRAVITY_GEMINI]
  );
  assert.deepEqual(buildCompactCardView(unknown).providers, []);
  assert.equal(resolveProviderVisual({ observed: false }).iconKey, PROVIDER_ICON_KEYS.UNKNOWN);
  assert.equal(resolveProviderVisual({ observed: false }).mapped, false);
});

test("provider visual: mixed observed/unobserved는 observed entry만 렌더링·count한다", () => {
  const fixture = buildOwnerInboxFixture();
  const multi = fixture.tasks.find((task) => task.id === "fixture-atlas-multi-agent");
  const observedProviders = selectObservedProviderEntries(multi);

  assert.equal(multi.providers.length, 3);
  assert.equal(observedProviders.length, 2);
  assert.deepEqual(
    observedProviders.map((entry) => entry.agent),
    ["Codex", "Antigravity"]
  );
  assert.equal(observedProviders.some((entry) => entry.agent === "Kimi"), false);
  assert.equal(observedProviders.length > 1, true);
});

test("compact card model: 필수 hierarchy만 포함하고 상세 전용 필드는 중복하지 않는다", () => {
  const fixture = buildOwnerInboxFixture();
  const blocked = fixture.tasks.find((task) => task.id === "fixture-aurora-supply");
  const compact = buildCompactCardView(blocked);

  assert.deepEqual(
    Object.keys(compact).sort(),
    ["project", "providers", "responsibility", "route", "status", "title"].sort()
  );
  assert.equal(compact.project, blocked.project);
  assert.equal(compact.responsibility, blocked.responsibility);
  assert.equal(compact.title, blocked.title);
  assert.equal(compact.status, blocked.status);
  for (const detailedOnly of [
    "blockerReason",
    "blockerSummary",
    "owner",
    "reviewer",
    "lastActivityKst",
    "pointer",
    "evidenceSummary",
    "nextDecision"
  ]) {
    assert.equal(Object.hasOwn(compact, detailedOnly), false);
  }
});
