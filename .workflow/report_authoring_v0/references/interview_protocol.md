# Report Authoring — Gap Interview Protocol

Use this protocol before a fixed runner request, never as a prompt or command in
that request.

`final_polish` accepts one draft. Missing optional source material, owner contract,
or semantic manifest is not an interview reason. Ask one question only when two
plausible edits would materially change the draft's meaning.

For `full_authoring`, a gap is material only when its answer could change the
purpose/decision question, method or tested conditions, a protected semantic
field, applicability, conclusion/verdict, recommendation/decision Ask, or a
required owner-contract field.

Priority:

1. What decision or uncertainty motivated the work?
2. What evidence was produced, under which conditions?
3. What supported conclusion follows, with which limits?
4. What action or decision is requested, from whom, and by when?
5. Which source, requirement, uncertainty, role, or scope field remains unconfirmed?

Ask exactly one material question, state briefly why it matters, wait for the
answer, update the structured gap register, and rescan before asking another.
Stop when no material gap remains, the author says the answer is unknown, or the
answer requires unavailable authority. Do not ask for optional style preferences
while a material evidence gap is open. Skip the interview when the evidence already
supports a bounded report.

Never fill a missing fact, number, unit, citation, role, condition, cause, or
verdict by inference. Record `unconfirmed` with a close condition when the owner
cannot answer. A named requirement or approved source is required before creating
an overall pass/fail verdict.

The gap register is an audit artifact and never enters the reader deliverable.
Interview answers enter through an approved payload adapter or the next bounded
request. The runner request still contains only hash-bound opaque refs.
