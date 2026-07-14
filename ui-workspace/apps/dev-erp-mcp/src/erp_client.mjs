export class ErpClientError extends Error {
  constructor(code, status = 502, detail = null) {
    super(code);
    this.name = "ErpClientError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function loopbackHost(value) {
  return ["127.0.0.1", "localhost", "::1"].includes(String(value).toLowerCase());
}

export function cleanBaseUrl(value, { allowInsecureHttp = false } = {}) {
  const url = new URL(String(value || "http://127.0.0.1:4300"));
  if (!["http:", "https:"].includes(url.protocol)) throw new TypeError("invalid_erp_base_url");
  if (url.protocol === "http:" && !loopbackHost(url.hostname) && !allowInsecureHttp) {
    throw new TypeError("erp_https_required");
  }
  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export class ErpClient {
  constructor({
    baseUrl,
    timeoutMs = 15000,
    fetchImpl = globalThis.fetch,
    allowInsecureHttp = process.env.ERP_MCP_ALLOW_INSECURE_HTTP === "1",
  } = {}) {
    this.baseUrl = cleanBaseUrl(baseUrl, { allowInsecureHttp });
    this.timeoutMs = Math.max(1000, Math.min(60000, Number(timeoutMs) || 15000));
    this.fetchImpl = fetchImpl;
  }

  url(path) {
    const relativePath = String(path).replace(/^\/+/, "");
    if (/^[a-z][a-z0-9+.-]*:/i.test(relativePath)) throw new TypeError("invalid_erp_path");
    const url = new URL(relativePath, `${this.baseUrl.toString().replace(/\/$/, "")}/`);
    if (url.origin !== this.baseUrl.origin) throw new TypeError("invalid_erp_path");
    return url;
  }

  async request(path, { token, method = "GET", body } = {}) {
    const headers = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    let response;
    try {
      response = await this.fetchImpl(this.url(path), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ErpClientError("erp_unreachable", 502, error?.name || null);
    }
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new ErpClientError(payload?.error || "erp_request_failed", response.status, null);
    return payload;
  }

  async upload(path, bytes) {
    let response;
    try {
      response = await this.fetchImpl(this.url(path), {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
        redirect: "error",
        signal: AbortSignal.timeout(Math.max(this.timeoutMs, 60000)),
      });
    } catch (error) {
      throw new ErpClientError("erp_upload_unreachable", 502, error?.name || null);
    }
    let payload = null;
    try { payload = await response.json(); } catch {}
    if (!response.ok) throw new ErpClientError(payload?.error || "erp_upload_failed", response.status, null);
    return payload;
  }
}
