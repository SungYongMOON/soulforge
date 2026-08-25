# 05. Evaluator

The evaluator validates the common manifest/binding and exact domain additions before looking at
a row. It then resolves applicability, source conflict, required authority family, named-human
authority evidence, observation, presence, named evidence fields, and domain vocabulary.

A named human authority binding must carry exact authority, delegation, and scope refs. The
engine refuses non-human authority roles. A bound written record remains only evidence of a
record; it does not prove scope, signature, validity, or acceptance, and it cannot trigger an
acceptance action.
