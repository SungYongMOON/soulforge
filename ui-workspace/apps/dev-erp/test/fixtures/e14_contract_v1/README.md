# E14 contract test dependency

This is the Owner-approved four-file reference-code subset from the existing
Soulforge E14 Modular System SDD/ICD ContractKit (SDK 0.1.0). Publication for the
repository's signed work-intake tests was authorized on 2026-09-09. The source
is preserved except for the syntax-only adjustment described below; this is not
a replacement or a mock codec. The table records the original reviewed bytes.

| File under src/sf_sewe | Bytes | SHA256 |
| --- | ---: | --- |
| __init__.py | 117 | 2a6818c4c8a27ff203056c5563c14633e8e5b11cd4aec4a363e5b9e921b1fc89 |
| models.py | 28081 | f54558f4c9e66d1495166f3fd74a5361bf830289a1ef2d863cd8d7e6b05eaf71 |
| codec.py | 2999 | 610a483e6d90a43c6476230cd38de5d499d74fd83fcd93fe4e75f00fc9e11a8b |
| permits.py | 1604 | e1a54461a4025f46a81719c1b64fd6b0ba17703cbd2c7becef3cb2d106677dae |

The UTC regex in models.py uses adjacent raw string literals so its source text
does not look like a host-local Windows path to the existing publication guard.
The parsed Python AST and resulting regex are unchanged; the guard is unchanged.
The other three files remain byte-identical to the original reviewed subset.
Published models.py SHA256:
`699c5afb971b4582562b4f9f8150fbec9c92c6a585d79880b2c98c04eec6378a`.

Only DTO validation, strict JSON/canonical hashing and Ed25519 permit checks are
included. No private source documents, example payloads, live keys, runtime
configuration, vault, journal or other kit modules are included. CI explicitly
binds WORK_INTAKE_TEST_PYTHON and WORK_INTAKE_TEST_KIT_ROOT to its selected Python
and this directory. The Python packet-reader suite is also run directly; the
Node glob alone would not execute those nine tests.

Install the two pinned dependencies in requirements.txt for that interpreter.
The tests use synthetic data and a published RFC 8032 vector, never operational
key material. This test-only distribution does not change operational kit paths,
grant authority, approve results, or attest that the full E14 system is complete.
It is an explicit test dependency, not an operational kit embedded in HPP.
