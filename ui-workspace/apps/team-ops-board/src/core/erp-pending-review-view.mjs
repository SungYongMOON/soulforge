// ERP "승인 대기" projection -> Board view model (pure, browser-safe).
// Consumes only the fixed soulforge.erp_pending_review_read_projection.v1
// envelope. Anything else becomes an explicit "unavailable" state with the
// default safe link; nothing is inferred from partial data.
//
// The projection this module reads carries counts and a status distribution
// only (Level 2 review finding M1: Tailscale Serve can proxy a tailnet peer's
// request to this host's loopback, so a loopback socket alone no longer
// proves the caller is the Owner). There is no username, item id, project id,
// proposal id, work-session id, or item title anywhere in the envelope; those
// stay behind the ERP's own loopback "검사 중" filter (post-login, Owner
// surface). This module cannot leak what it never receives.

export const ERP_PENDING_REVIEW_SCHEMA = "soulforge.erp_pending_review_read_projection.v1";
export const ERP_PENDING_REVIEW_DEFAULT_LINK = "http://127.0.0.1:4300/?view=mod:reviews";

const ENVELOPE_FIELDS = new Set([
  "schema_version",
  "read_only",
  "refresh_state",
  "observed_at",
  "erp_link",
  "counts",
  "hold_code",
]);
const COUNT_FIELDS = new Set([
  "proposals_pending",
  "work_sessions_recent",
  "work_sessions_unaccepted",
  "work_sessions_status_unknown",
  "pending_total",
]);

export const ERP_REVIEW_HOLD_LABELS = Object.freeze({
  ERP_REVIEW_UNCONFIGURED: "자격증명 미배치 · 링크만",
  ERP_REVIEW_URL_INVALID: "ERP 주소 설정 오류 · loopback http 만 허용",
  ERP_REVIEW_CREDENTIAL_PATH_INVALID: "자격증명 경로 설정 오류",
  ERP_REVIEW_CREDENTIAL_MISSING: "자격증명 파일 없음",
  ERP_REVIEW_CREDENTIAL_INVALID: "자격증명 파일 형식 오류 · 한 줄·BOM 없음·16~512바이트",
  ERP_REVIEW_DISCONNECTED: "ERP 연결 불가",
  ERP_REVIEW_TIMEOUT: "ERP 응답 시간 초과",
  ERP_REVIEW_UNAUTHORIZED: "인증 거부 · 토큰 만료·폐기 또는 admin 아님",
  ERP_REVIEW_ROUTE_DISABLED: "ERP 플래그 OFF · DEV_ERP_MCP_REVIEW_READ",
  ERP_REVIEW_RATE_LIMITED: "ERP 호출 제한",
  ERP_REVIEW_RESPONSE_MALFORMED: "ERP 응답 형식 불일치",
  ERP_REVIEW_RESPONSE_OVERSIZE: "ERP 응답 크기 초과",
});

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, fields) {
  return isPlainObject(value)
    && Object.keys(value).length === fields.size
    && Object.keys(value).every((key) => fields.has(key));
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function validCounts(value) {
  return hasExactKeys(value, COUNT_FIELDS) && [...COUNT_FIELDS].every((key) => safeCount(value[key]) !== null);
}

// Only a loopback http link may be rendered as an anchor; anything else is dropped.
export function safeErpLink(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    parsed.href !== value
    || parsed.protocol !== "http:"
    || (parsed.hostname !== "127.0.0.1" && parsed.hostname !== "[::1]")
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.hash !== ""
    || parsed.pathname !== "/"
    || (parsed.search !== "" && parsed.search !== "?view=mod:reviews")
  ) {
    return null;
  }
  return value;
}

function holdLabel(code) {
  return ERP_REVIEW_HOLD_LABELS[code] ?? "보류 · 알 수 없는 사유";
}

function emptyModelCounts() {
  return { pending: 0, proposals: 0, sessionsRecent: 0, sessionsUnaccepted: 0, sessionsUnknown: 0 };
}

function modelCounts(counts) {
  return {
    pending: counts.pending_total,
    proposals: counts.proposals_pending,
    sessionsRecent: counts.work_sessions_recent,
    sessionsUnaccepted: counts.work_sessions_unaccepted,
    sessionsUnknown: counts.work_sessions_status_unknown,
  };
}

function unavailableModel(holdCode = "ERP_REVIEW_RESPONSE_MALFORMED", link = ERP_PENDING_REVIEW_DEFAULT_LINK) {
  return {
    state: "hold",
    holdCode,
    holdLabel: holdLabel(holdCode),
    linkUrl: safeErpLink(link) ?? ERP_PENDING_REVIEW_DEFAULT_LINK,
    linkMode: "link_only",
    observedAt: null,
    counts: emptyModelCounts(),
  };
}

function validEnvelope(snapshot) {
  return hasExactKeys(snapshot, ENVELOPE_FIELDS)
    && snapshot.schema_version === ERP_PENDING_REVIEW_SCHEMA
    && snapshot.read_only === 1
    && (snapshot.refresh_state === "ready" || snapshot.refresh_state === "hold")
    && hasExactKeys(snapshot.erp_link, new Set(["url", "mode"]))
    && (snapshot.erp_link.mode === "link_only" || snapshot.erp_link.mode === "read_and_link")
    && validCounts(snapshot.counts);
}

export function buildErpPendingReviewViewModel(snapshot) {
  if (!validEnvelope(snapshot)) return unavailableModel();
  const linkOrDefault = safeErpLink(snapshot.erp_link.url) ?? ERP_PENDING_REVIEW_DEFAULT_LINK;

  if (snapshot.refresh_state === "hold") {
    const code = typeof snapshot.hold_code === "string" ? snapshot.hold_code : "ERP_REVIEW_RESPONSE_MALFORMED";
    return unavailableModel(code, linkOrDefault);
  }

  // refresh_state === "ready": an erp_link that fails validation becomes a
  // malformed-response HOLD instead of a silent swap to the default link — a
  // ready projection whose own link is not a trustworthy loopback URL is not a
  // state this view should present as healthy (M6).
  const validatedLink = safeErpLink(snapshot.erp_link.url);
  if (
    validatedLink === null
    || snapshot.hold_code !== null
    || typeof snapshot.observed_at !== "string"
    || !Number.isFinite(Date.parse(snapshot.observed_at))
  ) {
    return unavailableModel("ERP_REVIEW_RESPONSE_MALFORMED", ERP_PENDING_REVIEW_DEFAULT_LINK);
  }

  return {
    state: "ready",
    holdCode: null,
    holdLabel: null,
    linkUrl: validatedLink,
    linkMode: snapshot.erp_link.mode,
    observedAt: snapshot.observed_at,
    counts: modelCounts(snapshot.counts),
  };
}
