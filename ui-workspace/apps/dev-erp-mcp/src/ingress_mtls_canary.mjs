import { X509Certificate } from "node:crypto";
import { readFile } from "node:fs/promises";

import { createBoundIngressClient, loadIngressMtlsClientBinding } from "./ingress_mtls_client.mjs";

function fail(code, status = 400) {
  const error = new Error(code);
  error.code = code;
  error.status = status;
  throw error;
}

function certificateStatus(certificate, now) {
  const validFrom = Date.parse(certificate.validFrom);
  const validTo = Date.parse(certificate.validTo);
  if (!Number.isFinite(validFrom) || !Number.isFinite(validTo) || validFrom > now || validTo <= now
    || certificate.ca || !certificate.keyUsage?.includes("1.3.6.1.5.5.7.3.2")) fail("mtls_client_certificate_not_ready");
  return { valid_from: new Date(validFrom).toISOString(), valid_to: new Date(validTo).toISOString() };
}

export async function preflightIngressMtlsCanary({ bindingPath, now = Date.now() } = {}) {
  const binding = await loadIngressMtlsClientBinding(bindingPath);
  let certificate;
  try { certificate = new X509Certificate(await readFile(binding.clientCertPath)); }
  catch { fail("mtls_client_certificate_not_ready"); }
  const validity = certificateStatus(certificate, now);
  return {
    schema_version: "soulforge.ingress.mtls_canary_preflight.v1",
    status: "ready_for_owner_coordinated_probe",
    audience: binding.audience,
    transport: "strict_office_lan_mtls",
    endpoint_is_private_ipv4: true,
    certificate_valid_from: validity.valid_from,
    certificate_valid_to: validity.valid_to,
    expected_identity: {
      account_id: binding.expectedAccountId,
      device_id: binding.expectedDeviceId,
      agent_id: binding.expectedAgentId,
    },
    server_certificate_pin_present: true,
    secret_material_exposed: false,
    live_probe_performed: false,
  };
}

export async function probeIngressMtlsCanary({ bindingPath, token, syntheticLoopbackAddress = null } = {}) {
  const bound = await createBoundIngressClient({ bindingPath, token, syntheticLoopbackAddress });
  try {
    const identity = await bound.verifyIdentity();
    return {
      schema_version: "soulforge.ingress.mtls_canary_probe.v1",
      status: "read_only_identity_verified",
      account_id: identity.account_id,
      device_id: identity.device_id,
      agent_id: identity.agent_id,
      official_history_writer: false,
      write_performed: false,
      secret_material_exposed: false,
    };
  } finally {
    await bound.client.close();
  }
}
