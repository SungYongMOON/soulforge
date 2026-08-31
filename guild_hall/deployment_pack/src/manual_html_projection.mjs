import { createHash } from "node:crypto";

export const MANUAL_HTML_PROJECTION_SCHEMA = "soulforge.deployment_pack.manual_html_projection.v0";
export const MANUAL_HTML_RENDERER_VERSION = "manual-html-renderer.v0.1.0";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const DATA_IMAGE = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/u;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const REMOTE_OR_ACTIVE_URL = /\b(?:[a-z][a-z0-9+.-]*:\/\/|javascript:|data:|www\.)/iu;
const PROTOCOL_RELATIVE_OR_FORWARD_UNC = /(?:^|[\s("'])\/\//u;
const LOCAL_ABSOLUTE_PATH = /(?:^|[\s("'])(?:[A-Za-z]:[\\/]|\\\\[^\\\s]+[\\/]|\/[A-Za-z0-9._-]+(?:\/|\b))/u;
const RAW_HTML = /<\/?[A-Za-z][^>]*>|<script\b/iu;

function fail(code, message = code) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function text(value, field) {
  if (typeof value !== "string") fail(`${field}_invalid`);
  return value;
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function byteDigest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function rejectUnsafeText(value) {
  if (REMOTE_OR_ACTIVE_URL.test(value)) fail("unsafe_url_forbidden");
  if (PROTOCOL_RELATIVE_OR_FORWARD_UNC.test(value)) fail("unsafe_url_forbidden");
  if (LOCAL_ABSOLUTE_PATH.test(value)) fail("local_path_forbidden");
  if (RAW_HTML.test(value)) fail("raw_html_forbidden");
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function safeImage(image) {
  if (!image || typeof image !== "object" || Array.isArray(image)) fail("image_metadata_invalid");
  const id = text(image.id, "image_id");
  const alt = text(image.alt, "image_alt");
  if (!alt.trim()) fail("image_alt_missing");
  rejectUnsafeText(id);
  rejectUnsafeText(alt);
  if (!DIGEST.test(image.digest)) fail("image_digest_invalid");
  const uri = image.data_uri ?? image.src;
  if (typeof uri !== "string") fail("image_source_forbidden");
  const dataMatch = DATA_IMAGE.exec(uri);
  if (!dataMatch) fail("image_source_forbidden");
  const payload = dataMatch[2];
  if (payload.length % 4 !== 0) fail("image_base64_invalid");
  const bytes = Buffer.from(payload, "base64");
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) fail("image_size_invalid");
  if (bytes.toString("base64") !== payload) fail("image_base64_invalid");
  if (byteDigest(bytes) !== image.digest) fail("image_digest_mismatch");
  if (image.version !== undefined && (typeof image.version !== "string" || !VERSION.test(image.version))) {
    fail("image_version_invalid");
  }
  return { id, alt, digest: image.digest, version: image.version ?? null, data_uri: uri };
}

function validateOptions(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("projection_input_invalid");
  const markdown = text(options.markdown, "markdown");
  rejectUnsafeText(markdown);
  const manual = text(options.manual ?? options.manual_id, "manual");
  const version = text(options.version ?? options.manual_version, "version");
  const locale = text(options.locale, "locale");
  const audience = text(options.audience, "audience");
  if (!VERSION.test(version)) fail("version_invalid");
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(locale)) fail("locale_invalid");
  if (!audience.trim()) fail("audience_invalid");
  const imageInput = options.images ?? options.image_metadata;
  if (!Array.isArray(imageInput)) fail("images_invalid");
  const images = imageInput.map(safeImage);
  const byId = new Map();
  for (const image of images) {
    if (byId.has(image.id)) fail("image_id_duplicate");
    byId.set(image.id, image);
  }
  return { markdown, manual, version, locale, audience, images, byId };
}

function renderMarkdown(markdown, byId) {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const headings = [];
  const body = [];
  let inCode = false;
  let code = [];
  let codeLanguage = "";
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      body.push(`<p>${escapeHtml(paragraph.join(" ")).replace(/\*\*([^*]+)\*\*/gu, "<strong>$1</strong>")}</p>`);
      paragraph = [];
    }
  };
  for (const line of lines) {
    const fence = /^```([A-Za-z0-9_-]*)\s*$/u.exec(line);
    if (fence) {
      flush();
      if (inCode) {
        const language = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
        body.push(`<pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = []; codeLanguage = "";
      } else codeLanguage = fence[1];
      inCode = !inCode;
      continue;
    }
    if (inCode) { code.push(line); continue; }
    const heading = /^(#{1,6})\s+(.+?)\s*#*$/u.exec(line);
    if (heading) {
      flush();
      const level = heading[1].length;
      const raw = heading[2];
      const id = `section-${headings.length + 1}`;
      const title = escapeHtml(raw);
      headings.push({ id, title });
      body.push(`<h${level} id="${id}">${title}</h${level}>`);
      continue;
    }
    const image = /^!\[([^\]]*)\]\(([^)]+)\)$/u.exec(line.trim());
    if (image) {
      flush();
      const record = byId.get(image[2]);
      if (!record) fail("image_metadata_missing");
      if (image[1] && image[1] !== record.alt) fail("image_alt_mismatch");
      body.push(`<figure><img src="${record.data_uri}" alt="${escapeHtml(record.alt)}"><figcaption>${escapeHtml(record.alt)}</figcaption></figure>`);
      continue;
    }
    if (/^\s*$/u.test(line)) { flush(); continue; }
    if (/^\s*[-*+]\s+/u.test(line)) {
      flush();
      const item = line.replace(/^\s*[-*+]\s+/u, "");
      const last = body.at(-1);
      if (last?.startsWith("<ul>")) body[body.length - 1] = `${last.slice(0, -5)}<li>${escapeHtml(item)}</li></ul>`;
      else body.push(`<ul><li>${escapeHtml(item)}</li></ul>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  if (inCode) fail("unclosed_code_block");
  flush();
  return { headings, body: body.join("\n") };
}

export function renderManualHtmlProjection(options) {
  const input = validateOptions(options);
  const rendered = renderMarkdown(input.markdown, input.byId);
  const sourceDigest = digest(input.markdown);
  const imageDigests = input.images.map(({ id, digest: imageDigest, version }) => ({ id, digest: imageDigest, version }));
  const receipt = {
    schema: MANUAL_HTML_PROJECTION_SCHEMA,
    renderer_version: MANUAL_HTML_RENDERER_VERSION,
    manual: input.manual,
    version: input.version,
    locale: input.locale,
    audience: input.audience,
    source_digest: sourceDigest,
    image_digests: imageDigests,
  };
  const toc = rendered.headings.length
    ? `<nav aria-label="Table of contents"><h2>Contents</h2><ol>${rendered.headings.map((heading) => `<li><a href="#${heading.id}">${heading.title}</a></li>`).join("")}</ol></nav>`
    : "";
  const metadata = escapeHtml(JSON.stringify(receipt));
  const html = `<!doctype html><html lang="${escapeHtml(input.locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(input.manual)} ${escapeHtml(input.version)}</title><style> :root{color-scheme:light dark} body{font:1rem/1.6 system-ui,sans-serif;max-width:78rem;margin:auto;padding:2rem;color:#18202a} main{max-width:48rem;margin:auto} nav{border:1px solid #99a;padding:1rem;margin:1rem 0} pre{overflow:auto;padding:1rem;background:#eef} img{max-width:100%;height:auto} figure{margin:1.5rem 0} a{color:#0645ad}@media(max-width:40rem){body{padding:1rem}pre{font-size:.85rem}}@media print{nav{display:none}body{max-width:none;padding:0;color:#000}a{color:#000;text-decoration:none}h1,h2,h3{break-after:avoid}figure,pre{break-inside:avoid}}</style></head><body><header><p>Manual: ${escapeHtml(input.manual)} · Version: ${escapeHtml(input.version)} · Audience: ${escapeHtml(input.audience)}</p></header><main>${toc}<article>${rendered.body}</article></main><footer><small data-receipt="${metadata}">Source: ${sourceDigest}</small></footer></body></html>`;
  return { html, receipt };
}

export const projectManualHtml = renderManualHtmlProjection;
export const renderManualHtml = renderManualHtmlProjection;
