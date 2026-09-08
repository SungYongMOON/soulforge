# Bounded Hermes Buzz pilot observer — source candidate

This is a source/review packet, not an installation or activation receipt.

- `ui-workspace/apps/dev-erp/tools/hermes_buzz_pilot_hook.py`: generic observer helper; no model execution.
- `ui-workspace/apps/dev-erp/test/test_hermes_buzz_pilot_hook.py`: portable synthetic subprocess/ACK tests. Only the import roots differ from the privately reviewed test layout.
- `hermes-vendor.patch`: minimal patch for the three exact baseline vendor sources; the helper is supplied separately above.

The patch uses zero context lines so unchanged whitespace-only vendor lines are
not republished as trailing whitespace in this source artifact. Verify every
baseline SHA below before using
`git -c core.autocrlf=false -c core.eol=lf apply --unidiff-zero`; these exact pins,
not fuzzy patch matching, establish its applicable input. The resulting three
files must match the separately reviewed candidate hashes before application.

Run with Python 3.11 or later:

```text
python -m unittest discover -s ui-workspace/apps/dev-erp/test -p test_hermes_buzz_pilot_hook.py -v
```

The first pilot supports one clarify call and a single string response. Multi-select is rejected before execution. The stored tool output is the actual public `user_response` string projection, not the original full tool JSON. Hidden reasoning is not captured.

The hook observes existing execution and records through a pinned Node CLI. A reference or file hash does not confer execution authority. Real profile, chat, account, job, source locations and credentials are excluded. The separate private apply/rollback kit retains its exact target and stopped-process guards; it is deliberately not generalized by this source packet.

Baseline SHA-256 pins:

| Vendor file | SHA-256 |
| --- | --- |
| gateway/run.py | 5bd7c157a4aff539a84068b2a1443f1674404e0a93748db16939abb46e8b2445 |
| plugins/platforms/buzz/adapter.py | 6a4b214bae858cd7cfc4889b9829538e56555c7f16738eed02a5b243358443f4 |
| tools/clarify_gateway.py | 114a720ee69bc79b00fd837e6a4cbbb4e34933aafd2097fd405b247c98403081 |

These pins identify the reviewed installed-source baseline; a version label alone is insufficient. Vendor source ownership and license remain with the upstream Hermes project. Whole vendor files are not included here. Applying to any other bytes requires renewed review.
