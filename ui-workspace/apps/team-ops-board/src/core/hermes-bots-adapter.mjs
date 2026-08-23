// Hermes Bot 스냅샷 -> 관찰 레코드 배열 순수 프로젝터.
// raw 본문 열 이름(content/reasoning/transcript 등)은 구조적으로 버린다.

import { buildHermesBotPanelViewModel } from "./hermes-bot-panel.mjs";

export function projectHermesBotsSnapshot(snapshot) {
  if (
    snapshot === null
    || typeof snapshot !== "object"
    || Array.isArray(snapshot)
    || !Array.isArray(snapshot.bots)
  ) {
    return [];
  }

  const generatedAtMs = typeof snapshot.generatedAtMs === "number"
    && Number.isFinite(snapshot.generatedAtMs)
    && snapshot.generatedAtMs >= 0
    ? snapshot.generatedAtMs
    : undefined;

  const viewModel = buildHermesBotPanelViewModel({
    ...(generatedAtMs === undefined ? {} : { nowMs: generatedAtMs }),
    bots: snapshot.bots.filter((entry) => entry !== null && typeof entry === "object"),
  });

  return viewModel.rows;
}
