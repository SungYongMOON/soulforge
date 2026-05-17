# Foundation Schema Field Matrix

This matrix is the schema-local field rule anchor for the root canon validator surface. It records structure and resolution rules only.

## `species.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `species_id` | yes | string | folder name and file payload must match |
| `kind` | yes | string | fixed `species` |
| `status` | yes | enum | `draft | active | archived` |
| `title` | yes | string | human-facing species title |
| `summary` | yes | string | short canonical description |
| `heroes` | yes | list[object] | inline hero set |
| `heroes[].hero_id` | yes | string | unique within the enclosing species |
| `heroes[].title` | yes | string | human-facing hero title |
| `heroes[].summary` | yes | string | hero description |
| `heroes[].profile_ref` | yes | string | string id, not a path |
| `heroes[].biases` | no | map[string, number] | recommendation weights, not policy |
| `notes` | no | list[string] | human-readable notes |

## `class.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `class_id` | yes | string | folder name and file payload must match |
| `kind` | yes | string | fixed `class` |
| `status` | yes | enum | `draft | active | archived` |
| `title` | yes | string | human-facing class title |
| `summary` | yes | string | short canonical description |
| `profile_ref` | yes | string | string id, not a path |
| `skill_refs` | yes | string | class-local sibling file pointer |
| `tool_refs` | yes | string | class-local sibling file pointer |
| `knowledge_refs` | yes | string | class-local sibling file pointer |
| `notes` | no | list[string] | human-readable notes |

## `unit.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `unit_id` | yes | string | active subject id |
| `status` | yes | enum | `draft | active | archived` |
| `summary` | yes | string | short description |
| `identity` | yes | object | active subject identity block |
| `identity.profile_ref` | yes | string | string id, not a path |
| `identity.species_id` | yes | string | resolves to `.registry/species/<species_id>/species.yaml` |
| `identity.hero_id` | yes | string | resolves only within `identity.species_id` |
| `class_ids` | yes | list[string] | each id resolves to `.registry/classes/<class_id>/class.yaml` |
| `notes` | no | list[string] | human-readable notes |

## `.registry/knowledge/<knowledge_id>/knowledge.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `knowledge_id` | yes | string | folder name and file payload must match |
| `kind` | yes | string | fixed `knowledge` |
| `status` | yes | enum | `draft | active | archived` |
| `title` | yes | string | human-facing knowledge title |
| `summary` | yes | string | short reusable knowledge description |
| `focus` | yes | object | structural focus block for catalog grouping |
| `focus.primary_domain` | yes | string | primary domain label |
| `focus.applied_to` | yes | list[string] | reusable application labels |
| `notes` | no | list[string] | human-readable notes |

Resolution rules:

| Surface | Rule |
| --- | --- |
| entry path | `.registry/knowledge/<knowledge_id>/knowledge.yaml` is the registry knowledge entry path |
| identity | `<knowledge_id>` and `knowledge_id` must match exactly |
| kind | `kind` must be `knowledge` |
| refs | class-local `knowledge_refs.yaml` resolves this entry by bare `knowledge_id`, not by file path |
| validator scope | checks structure and resolution only; truth and approval semantics are out of scope |

## class-local `*_refs.yaml`

| Field | Required | Type | Rule |
| --- | --- | --- | --- |
| `class_id` | yes | string | parent class folder and file payload must match |
| `kind` | yes | string | fixed `skill_refs`, `tool_refs`, or `knowledge_refs` |
| `status` | yes | enum | `draft | active | archived` |
| `assign` | yes | list[object] | class-local assign/ref pair list |
| `assign[].assign` | yes | string | class-local assignment key |
| `assign[].ref` | yes | string | canonical registry id |
| `assign[].summary` | no | string | short binding description |
| `notes` | no | list[string] | human-readable notes |

## `.registry/classes/<class_id>/knowledge_refs.yaml`

| Surface | Rule |
| --- | --- |
| entrance | `.registry/classes/<class_id>/class.yaml` owns the `knowledge_refs` sibling pointer |
| path | the resolved file stays class-local, normally `.registry/classes/<class_id>/knowledge_refs.yaml` |
| identity | `class_id` must match the parent class folder |
| kind | `kind` must be `knowledge_refs` |
| assignment key | `assign[].assign` is local to this class refs file |
| knowledge resolution | `assign[].ref` resolves to `.registry/knowledge/<ref>/knowledge.yaml` |
| ref type | `assign[].ref` is a bare knowledge id, not a path or source citation |
| validator scope | checks class-local file structure and knowledge id resolution only |
