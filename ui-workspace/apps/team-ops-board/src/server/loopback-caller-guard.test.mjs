import assert from "node:assert/strict";
import test from "node:test";

import {
  PROXY_MARKER_HEADERS,
  hasProxyPassageMarker,
  isDirectLoopbackCaller,
  isLoopbackAddress,
} from "./loopback-caller-guard.mjs";

const LOOPBACK_ADDRESSES = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];

test("the proxy-passage marker list is exactly the five lowercase names the endpoints were reviewed against (M1/M8)", () => {
  assert.deepEqual([...PROXY_MARKER_HEADERS], [
    "x-forwarded-for",
    "x-forwarded-host",
    "x-forwarded-proto",
    "forwarded",
    "tailscale-user-login",
  ]);
  assert.ok(Object.isFrozen(PROXY_MARKER_HEADERS));
  for (const name of PROXY_MARKER_HEADERS) {
    assert.equal(name, name.toLowerCase(), `${name} must match Node's lowercased IncomingMessage.headers keys`);
  }
});

test("only the three loopback socket forms count as loopback", () => {
  for (const address of LOOPBACK_ADDRESSES) assert.equal(isLoopbackAddress(address), true, address);
  for (const address of [undefined, null, "", " 127.0.0.1", "127.0.0.2", "localhost", "::2", "100.64.0.9", "192.168.1.100", "::ffff:100.64.0.9"]) {
    assert.equal(isLoopbackAddress(address), false, String(address));
  }
});

test("a marker header counts by presence alone, and an absent or non-object headers bag is not a proxy hop", () => {
  for (const bag of [undefined, null, {}, "x-forwarded-for", 7, { host: "127.0.0.1:4192", "x-requested-with": "fetch" }]) {
    assert.equal(hasProxyPassageMarker(bag), false, JSON.stringify(bag ?? String(bag)));
  }
  for (const name of PROXY_MARKER_HEADERS) {
    assert.equal(hasProxyPassageMarker({ [name]: "anything" }), true, name);
    assert.equal(hasProxyPassageMarker({ [name]: "" }), true, `${name} with an empty value still marks a hop`);
    assert.equal(hasProxyPassageMarker({ host: "127.0.0.1:4192", [name]: "100.64.0.9" }), true, `${name} beside other headers`);
  }
});

test("a direct loopback caller is a loopback socket with no marker header; anything else fails closed", () => {
  for (const address of LOOPBACK_ADDRESSES) {
    assert.equal(isDirectLoopbackCaller({ socket: { remoteAddress: address }, headers: {} }), true, address);
    assert.equal(isDirectLoopbackCaller({ socket: { remoteAddress: address } }), true, `${address} without a headers bag`);
    for (const name of PROXY_MARKER_HEADERS) {
      assert.equal(isDirectLoopbackCaller({ socket: { remoteAddress: address }, headers: { [name]: "anything" } }), false, `${address} + ${name}`);
    }
  }
  assert.equal(isDirectLoopbackCaller({ socket: { remoteAddress: "100.64.0.9" }, headers: {} }), false, "remote socket");
  assert.equal(isDirectLoopbackCaller({ socket: {}, headers: {} }), false, "socket without an address");
  assert.equal(isDirectLoopbackCaller({ headers: {} }), false, "request without a socket");
  assert.equal(isDirectLoopbackCaller(undefined), false, "no request");
});
