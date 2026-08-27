# Integration door and handoff

The package owns only its domain directory. Global engine topology, release
generation, registry, Core conformance expansion, root validation aliases, and
shared documentation are integration-lane work. The exact proposal is in the
local integration request.

Before integration, the manager or factory must re-run the deterministic package
validators, inspect the current receipt and replay evidence, and obtain a fresh
independent `ACCEPT` review. The E05 worker must not commit or push this package
before those gates and manager authorization. This package boundary is not
authority to change Core, root surfaces, or shared conformance. No manager or
reviewer action confers build-start, production, live-project, or product
acceptance authority.
