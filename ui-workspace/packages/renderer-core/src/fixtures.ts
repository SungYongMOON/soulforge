import bodyFixture from "../../../fixtures/ui-state/body.sample.json";
import classFixture from "../../../fixtures/ui-state/class.sample.json";
import integratedFixture from "../../../fixtures/ui-state/integrated.sample.json";
import overviewFixture from "../../../fixtures/ui-state/overview.sample.json";
import workspacesFixture from "../../../fixtures/ui-state/workspaces.sample.json";
import type { FixtureName, UiState } from "@soulforge/ui-contract";

export const FIXTURE_MAP: Record<FixtureName, UiState> = {
  integrated: integratedFixture as UiState,
  overview: overviewFixture as UiState,
  body: bodyFixture as UiState,
  class: classFixture as UiState,
  workspaces: workspacesFixture as UiState
};
