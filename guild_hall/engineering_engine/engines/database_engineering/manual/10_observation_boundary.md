# 10 — Observation boundary

Observations are caller-supplied typed facts. The evaluator performs no file
scan, database query, telemetry lookup, connection, or external retrieval. An
unobserved fact stays `gap_unknown`.

Public source-byte pin capture is a separate research-time, public HTTP-read
activity. It records URL, access instant, response metadata, byte length, and
SHA-256 while retaining no source body. Package runtime never performs that
capture or any network I/O.
