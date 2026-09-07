// Same custody sender account, fixed launcher only. No controller path/token
// travels through stdin/stdout. The enclosing Python broker owns its deadline
// and kills this child on stalled reads/writes/upstream loss.
import { readSync, writeSync } from "node:fs";
import { runCustody } from "./custody_bridge.mjs";

const fail = () => { throw new Error("CUSTODY_OPERATION_HOLD"); };
const exact = (value, keys) => {
  if (!value || Array.isArray(value) || typeof value !== "object"
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail();
};
function read(size) {
  const body = Buffer.alloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(0, body, offset, size - offset, null);
    if (!count) fail();
    offset += count;
  }
  return body;
}
function frame(kind = 0) {
  const header = read(5), size = header.readUInt32BE(1);
  if (header[0] !== kind || size < 1 || size > (kind ? 1048576 : 8192)) fail();
  const body = read(size);
  return kind ? body : JSON.parse(body);
}
function send(value) {
  const body = Buffer.from(JSON.stringify(value));
  if (body.length > 8192) fail();
  const header = Buffer.alloc(5);
  header.writeUInt32BE(body.length, 1);
  const buffer = Buffer.concat([header, body]);
  let offset = 0;
  while (offset < buffer.length) offset += writeSync(1, buffer, offset);
}

export async function custodyOperation(authority, runtime) {
  if (!authority || !runtime || runtime.installationRole?.purpose !== "custody.deposit") fail();
  const request = frame(), body = frame(1);
  const authorizeOnly = request.operation === "authorize";
  exact(request, authorizeOnly ? ["operation", "binding"] : ["operation", "binding", "action", "submission_id"]);
  if (!authorizeOnly && request.operation !== "execute") fail();
  let sequence = 0;
  const deadline = Date.now() + 45000;
  function current() {
    if (Date.now() >= deadline) fail();
    runtime.recheck();
    if (++sequence > 256) fail();
    send({ kind: "check", sequence });
    const response = frame();
    exact(response, ["kind", "sequence"]);
    if (response.kind !== "authorized" || response.sequence !== sequence || Date.now() >= deadline) fail();
  }
  current();
  const proof = authority.authorize(request.binding);
  let result;
  if (authorizeOnly) {
    if (!body.equals(Buffer.from("."))) fail();
    result = { binding_sha256: proof.binding_sha256, ...proof.principal, expires_at: proof.expires_at };
  } else {
    if (request.action === "status" && !body.equals(Buffer.from("."))) fail();
    const ingressUrl = runtime.config.adapters.custody.ingress_url;
    result = await runCustody({ ...request, ingress_url: ingressUrl, principal: proof.principal,
      authorization_expires_at: proof.expires_at }, { token: authority.token(request.binding),
      candidateBytes: request.action === "upload" ? body : null,
      authorize: value => authority.authorizeRequest(value), integrity: current });
  }
  current();
  authority.authorize(request.binding);
  send({ kind: "result", result });
  const received = frame();
  exact(received, ["kind"]);
  if (received.kind !== "received") fail();
  return { exitCode: 0 };
}
