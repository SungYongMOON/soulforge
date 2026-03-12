import { FIXTURE_MAP } from "./fixtures";
import { normalizeUiState } from "./normalize";
import type { UiState, UiStateRequest } from "@soulforge/ui-contract";

type MinimalResponse = {
  json(): Promise<unknown>;
};

type FetchLike = (input: string) => Promise<MinimalResponse>;

export async function loadUiState(
  request: UiStateRequest,
  fetchImpl: FetchLike = (input) => fetch(input)
): Promise<UiState> {
  if (request.kind === "fixture") {
    const fixtureName = request.fixture ?? "integrated";
    return normalizeUiState(FIXTURE_MAP[fixtureName]);
  }

  if (!request.url) {
    throw new Error("URL request requires a url value.");
  }

  const response = await fetchImpl(request.url);
  const payload = await response.json();
  return normalizeUiState(payload);
}
