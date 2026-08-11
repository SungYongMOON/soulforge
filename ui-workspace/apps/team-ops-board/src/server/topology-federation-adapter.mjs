// topology-federation-adapter.mjs — tracked AX topology federation projection을
// loopback 전용 GET /topology-federation.snapshot.json 으로 중계하는 읽기 전용
// Vite dev/preview 플러그인.
//
// 이 표면은 선언 구조(declared structure)만 나른다. Watchtower W1 health를
// 대체하거나 합성하지 않으며, live health·delivery·runtime 실행을 주장하지 않는다.
// 경로는 고정 repo-relative 하나뿐이고 glob·폴더 자동발견·관계 추측은 없다.
// 검증은 Watchtower가 소유한 순수 federation 계약을 그대로 재실행하고,
// 전체 topology digest가 일치하지 않으면 fail-closed 한다.

import { lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  AX_TOPOLOGY_FEDERATION_SCHEMA_VERSION,
  canonicalStringify,
  composeFederatedTopology,
} from "../../../../../guild_hall/watchtower/topology_federation.mjs";

export const TOPOLOGY_FEDERATION_SNAPSHOT_PATH = "/topology-federation.snapshot.json";
export const TOPOLOGY_FEDERATION_PROJECTION_SCHEMA = "soulforge.team_ops_board.topology_federation_projection.v1";
export const TOPOLOGY_FEDERATION_LENS = "declared_structure";
export const TOPOLOGY_FEDERATION_PROVES = Object.freeze([
  "declared_structure_contract_only",
]);
// 선언 구조가 입증하지 않는 것을 계약에 박아 둔다. 화면이 이 목록을 지우면
// 구조 표시가 곧 live 근거처럼 읽히기 시작한다.
export const TOPOLOGY_FEDERATION_DOES_NOT_PROVE = Object.freeze([
  "live_health",
  "runtime_execution",
  "delivery_receipt",
  "provider_availability",
  "repair_execution",
]);

const MODULE_ROOT = dirname(fileURLToPath(import.meta.url));
const FEDERATION_ARTIFACT_PATH = resolve(
  MODULE_ROOT,
  "../../../../../guild_hall/watchtower/topology/federated_topology.v1.json",
);
const MAX_ARTIFACT_BYTES = 4_194_304;
const MAX_PROVIDERS = 32;
const ROOT_KEYS = new Set([
  "schema_version", "projection_kind", "providers", "nodes", "edges",
  "source_set_digest", "summary", "topology_digest",
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_FAILURE_CODE = /^[a-z][a-z0-9_]{0,127}$/u;

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

// 실패 사유는 코드 형태로만 통과시킨다. 원문 메시지에는 경로가 섞일 수 있다.
export function safeFederationFailureCode(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (SAFE_FAILURE_CODE.test(code)) return code;
  const message = typeof error?.message === "string" ? error.message : "";
  return SAFE_FAILURE_CODE.test(message) ? message : "topology_federation_unclassified";
}

export function validateFederatedTopologyArtifact(artifact) {
  if (!isPlainObject(artifact) || !hasExactKeys(artifact, ROOT_KEYS)) {
    throw new Error("topology_federation_shape_invalid");
  }
  if (artifact.schema_version !== AX_TOPOLOGY_FEDERATION_SCHEMA_VERSION) {
    throw new Error("topology_federation_schema_invalid");
  }
  if (artifact.projection_kind !== TOPOLOGY_FEDERATION_LENS) {
    throw new Error("topology_federation_projection_kind_invalid");
  }
  if (!Array.isArray(artifact.providers) || artifact.providers.length === 0
    || artifact.providers.length > MAX_PROVIDERS) {
    throw new Error("topology_federation_providers_invalid");
  }
  if (typeof artifact.topology_digest !== "string" || !SHA256_PATTERN.test(artifact.topology_digest)
    || typeof artifact.source_set_digest !== "string" || !SHA256_PATTERN.test(artifact.source_set_digest)) {
    throw new Error("topology_federation_digest_invalid");
  }
  // Watchtower 계약을 그대로 재실행해 fragment 검증·namespace 합성·정렬·요약을
  // 다시 만든다. 이 어댑터는 별도 판정을 만들지 않는다.
  let recomposed;
  try {
    recomposed = composeFederatedTopology(artifact.providers);
  } catch (error) {
    throw new Error(safeFederationFailureCode(error));
  }
  if (recomposed.source_set_digest !== artifact.source_set_digest) {
    throw new Error("topology_federation_source_digest_mismatch");
  }
  if (recomposed.topology_digest !== artifact.topology_digest) {
    throw new Error("topology_federation_digest_mismatch");
  }
  // digest 두 개가 맞아도 파일에 남은 flattened node/edge/summary 가 계약 산출물과
  // 다를 수 있다. 화면이 읽는 것은 그 flattened 배열이므로 byte 수준까지 비교한다.
  if (canonicalStringify(recomposed) !== canonicalStringify(artifact)) {
    throw new Error("topology_federation_projection_mismatch");
  }
  return artifact;
}

export async function readFederatedTopologyArtifact({ artifactPath = FEDERATION_ARTIFACT_PATH } = {}) {
  const metadata = await lstat(artifactPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()
    || metadata.size <= 0 || metadata.size > MAX_ARTIFACT_BYTES) {
    throw new Error("topology_federation_file_invalid");
  }
  const content = await readFile(artifactPath, "utf8");
  if (Buffer.byteLength(content, "utf8") > MAX_ARTIFACT_BYTES) {
    throw new Error("topology_federation_file_invalid");
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("topology_federation_parse_failed");
  }
  return validateFederatedTopologyArtifact(parsed);
}

export function federationProjection(state, reason = null, snapshot = null) {
  return {
    schema_version: TOPOLOGY_FEDERATION_PROJECTION_SCHEMA,
    lens: TOPOLOGY_FEDERATION_LENS,
    state,
    reason,
    proves: [...TOPOLOGY_FEDERATION_PROVES],
    does_not_prove: [...TOPOLOGY_FEDERATION_DOES_NOT_PROVE],
    snapshot,
  };
}

export function createTopologyFederationAdapter({
  artifactPath = FEDERATION_ARTIFACT_PATH,
  readArtifact = readFederatedTopologyArtifact,
} = {}) {
  let lastGood = null;
  let inFlight = null;

  async function load() {
    try {
      lastGood = await readArtifact({ artifactPath });
      return federationProjection("ready", null, lastGood);
    } catch (error) {
      const reason = safeFederationFailureCode(error);
      // 마지막 정상 구조를 계속 보여주더라도 상태는 stale 로만 남긴다. 실패한 재읽기가
      // 현재 성공처럼 읽히면 구조 표시가 사실상 근거 없는 주장이 된다.
      return lastGood === null
        ? federationProjection("unavailable", reason, null)
        : federationProjection("stale", reason, lastGood);
    }
  }

  return {
    readProjection() {
      if (inFlight !== null) return inFlight;
      const operation = load().finally(() => {
        if (inFlight === operation) inFlight = null;
      });
      inFlight = operation;
      return operation;
    },
  };
}

export function createTopologyFederationAdapterPlugin(options = {}) {
  const adapter = createTopologyFederationAdapter(options);
  const configure = (server) => {
    server.middlewares.use((request, response, next) => {
      let url;
      try {
        url = new URL(request.url || "/", "http://127.0.0.1");
      } catch {
        response.statusCode = 400;
        response.end();
        return;
      }
      if (url.pathname !== TOPOLOGY_FEDERATION_SNAPSHOT_PATH) {
        next();
        return;
      }
      if (request.method !== "GET") {
        response.statusCode = 405;
        response.setHeader("Allow", "GET");
        response.end();
        return;
      }
      if (!isLoopbackAddress(request.socket.remoteAddress)) {
        response.statusCode = 403;
        response.end();
        return;
      }
      const respond = (projection) => {
        response.statusCode = 200;
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.end(JSON.stringify(projection));
      };
      void adapter.readProjection()
        .then(respond, () => respond(federationProjection("unavailable", "topology_federation_read_failed")));
    });
  };
  return {
    name: "soulforge-topology-federation-adapter",
    configureServer: configure,
    configurePreviewServer: configure,
  };
}
