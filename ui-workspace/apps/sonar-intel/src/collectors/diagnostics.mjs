// No response body, query, userinfo, exception text or credential enters a receipt.
export function assertCredentialFreeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("invalid_request_url"); }
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || [...url.searchParams.keys()].some((key) => /key|token|secret|pass|auth|credential|signature|(?:^|[_-])(?:sig|hmac|jwt)(?:$|[_-])/i.test(key))) throw new Error("credential_in_request_url");
}
export function collectionError(error) {
  const message = error?.message;
  return typeof message === "string" && /^(?:HTTP_\d{3}|redirect_denied|invalid_request_url|credential_in_request_url|request_timeout)$/.test(message) ? message : "collection_request_failed";
}
