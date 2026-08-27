# Fixtures, replay, and zero-write runner

The public fixture supplies an all-ready case and a hold case containing one
each of missing, unknown, conflict, and not-applicable evidence. Names, source
references, facts, and the explicit Project Binding are synthetic.

The runner reads no caller file and writes one JSON result to stdout. Tests run
it twice in an empty temporary directory, compare the outputs, and assert that
the directory remains empty. Reversing caller facet order yields an identical
assessment and receipt digest.
