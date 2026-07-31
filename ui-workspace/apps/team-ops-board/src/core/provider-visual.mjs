export const PROVIDER_ICON_KEYS = Object.freeze({
  CODEX_GPT: "codex",
  ANTIGRAVITY_GEMINI: "antigravity",
  KIMI: "kimi",
  UNKNOWN: "bot"
});

export const PROVIDER_ASSET_SLUGS = Object.freeze({
  [PROVIDER_ICON_KEYS.CODEX_GPT]: "codex-color.svg",
  [PROVIDER_ICON_KEYS.ANTIGRAVITY_GEMINI]: "antigravity-color.svg",
  [PROVIDER_ICON_KEYS.KIMI]: "kimi-color.svg"
});

export function resolveProviderVisual(entry) {
  if (!entry?.observed) {
    return {
      iconKey: PROVIDER_ICON_KEYS.UNKNOWN,
      label: "UNKNOWN",
      accessibleName: "Agent/provider UNKNOWN · 추정 안 함",
      mapped: false
    };
  }

  const agent = String(entry.agent ?? "").trim();
  const provider = String(entry.provider ?? "").trim();
  const label = [agent, provider].filter(Boolean).join("/") || "UNKNOWN";

  if (/codex/i.test(agent) || /^(openai|gpt)$/i.test(provider)) {
    return {
      iconKey: PROVIDER_ICON_KEYS.CODEX_GPT,
      label,
      accessibleName: `관찰된 Codex/OpenAI provider: ${label}`,
      mapped: true
    };
  }

  if (/antigravity/i.test(agent) || /gemini/i.test(provider)) {
    return {
      iconKey: PROVIDER_ICON_KEYS.ANTIGRAVITY_GEMINI,
      label,
      accessibleName: `관찰된 Antigravity/Gemini provider: ${label}`,
      mapped: true
    };
  }

  if (/kimi/i.test(agent) || /kimi/i.test(provider)) {
    return {
      iconKey: PROVIDER_ICON_KEYS.KIMI,
      label,
      accessibleName: `관찰된 Kimi provider: ${label}`,
      mapped: true
    };
  }

  return {
    iconKey: PROVIDER_ICON_KEYS.UNKNOWN,
    label,
    accessibleName: `관찰됐으나 시각 매핑이 없는 provider: ${label}`,
    mapped: false
  };
}

export function buildCompactCardView(task) {
  return {
    project: task.project,
    responsibility: task.responsibility || "책임분야 미관찰",
    route: task.route || "route 미관찰 · UNKNOWN",
    title: task.title,
    status: task.status,
    providers:
      task.agentState === "observed"
        ? task.providers.filter((entry) => entry.observed).map(resolveProviderVisual)
        : [],
    blockerSummary: task.status === "blocked" ? task.blockerReason : null
  };
}
