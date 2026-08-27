# Compiler and Profile bindings

The compiler follows the existing Core Profile Binding contract. It accepts only ordered,
provenance-complete organization/project bindings and validates the Core operation digest rather
than recomputing a local alternative. It supports only `add` operations.

An added rule must have a closed `RM-…` ID, bound source reference, exact known R&M evidence
kind (or source-native `null`), registered authority family, canonical sorted arrays, and one
per-rule provenance entry. Prototype-sensitive keys, symbols, accessors, proxies, aliases,
cycles, unsafe paths, secret sentinels, duplicate IDs, unknown tokens, and unsupported
operations fail closed before a Profile array element or nested operation is read.

The compiler’s output changes the derived ruleset and assembly digests deterministically. The
base evaluator does not execute that derived output yet; that hold protects against making a
Profile’s project-/organization-specific source content silently executable.
