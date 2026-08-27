# 01. Purpose and boundary

The engine answers one narrow question: **given one Core-bound controlled change with explicit
pre-change baseline/revision and target post-change revision, is impact coverage complete enough
for a source-supported candidate assessment?**

The engine has no authority to approve, reject, implement, release, mutate, notify, or close a
project change. `approved` and `closed` are caller-supplied fact states that the engine checks
for internal consistency; they are never produced as authority decisions.

It reads neither the change request nor any affected item. The package uses the existing Core
Project Binding/Typed Facts seam but does not alter Core: it requires a bound project/Profile/change
fact bundle and validates its identity digest before evaluation. If a fact is absent, `unknown` is
retained rather than inferred.
