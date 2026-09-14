# Context Engine GraphRAG worker (neo4j-graphrag). Reads one JSON request on
# stdin and writes one ASCII JSON result on stdout (the pipe encoding of the
# host never touches the text). It assembles the tool's own components (text
# chunks, chunk embedder, LLM entity/relation extractor, lexical graph, schema
# pruning, KG writer, query embedder) and adds only what the tool does not own: a
# local-model adapter with an explicit thinking switch, a call budget and an
# observable call trace, the installed model digests as the model revision,
# deterministic document and chunk ids, a plain fragment the APP can pin, the hash
# of its own extraction rules (so a change to search or logging does not make a
# stored extraction unreusable), and the rule that a database holds one currently
# selected generation per project.
#
# Search is written here rather than taken from the tool's retrievers. The
# retrievers cannot express the one thing a shared database needs: a scope that is
# part of the index rather than a step a caller could forget. HybridRetriever takes
# no filters at all and VectorRetriever falls back to brute force without a
# filterable index, so this file issues Cypher 25's `SEARCH n IN (VECTOR INDEX ...
# WHERE ... LIMIT k)` itself, and reproduces the tool's own hybrid ranking rule
# (each half normalised by its own maximum, best per node) rather than inventing
# one. It reads no keys or network locations by itself; every
# endpoint comes from the trusted APP adapter and must be a loopback address; the
# only files it opens are the password file that adapter names and its own source,
# which it hashes to report which extraction rules it is running.
import asyncio
import hashlib
import importlib.metadata as metadata
import ipaddress
import json
import re
import sys
import time
from urllib.parse import urlparse

MAX_REQUEST_BYTES = 64 * 1024 * 1024
WORKER_SCHEMA = "soulforge.context_graphrag_worker.v1"
EMPTY_GRAPH = '{"nodes": [], "relationships": []}'
DIGEST = re.compile(r"^(?:sha256:)?([0-9a-f]{64})$")
TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,199}$")
# One database holds many projects, each with exactly one currently loaded
# generation. The index and label names are therefore database-wide, and every
# node carries `sf_project` and `sf_generation`; a search's scope is those two
# properties rather than the address of the container it reached.
GENERATION_LABEL = "__SfGeneration__"
CHUNK_LABEL = "Chunk"
DOCUMENT_LABEL = "Document"
ENTITY_LABEL = "__Entity__"
VECTOR_INDEX = "sf_chunk_vector"
FULLTEXT_INDEX = "sf_chunk_fulltext"
EMBEDDING_PROPERTY = "embedding"
# The properties the vector index declares as filterable, in the order the DDL
# names them. A vector index carrying these can be searched with the scope
# predicate INSIDE the index (Cypher 25 `SEARCH n IN (VECTOR INDEX ... WHERE ...
# LIMIT k)`), so the k rows it returns are already this project's and this
# generation's. Measured on this host's Neo4j 2026.02.3: two equality predicates
# joined by AND are accepted inside the parentheses, `IN` is not (that needs
# 2026.06). An index without them can only be filtered after the fact.
VECTOR_FILTER_PROPERTIES = ("sf_project", "sf_generation")
# One project's load takes this node for the duration, so two projects loading at
# once cannot stamp each other's freshly written nodes.
MATERIALIZE_LOCK_LABEL = "__SfMaterializeLock__"
# How many rows each half of a search asks for before the scope is applied. The
# in-index filter needs no overfetch; a post-filtered vector index and the
# fulltext index (which has no filter properties at all) do, and what the scope
# then removes is counted rather than hidden.
SCOPE_OVERFETCH = 10
# Lexical edges are the graph's skeleton; expansion follows the extracted ones.
LEXICAL_RELATIONSHIPS = ("FROM_CHUNK", "FROM_DOCUMENT", "NEXT_CHUNK")
MAX_TOP_K = 50
# A search that ranks the whole generation asks for more rows than the ordinary
# ceiling: it is how a caller sees where a chunk sits among all of them rather
# than only whether it reached the first fifty. Such a request is bounded by the
# generation's own chunk count, read from the database, so the ceiling is the data
# and not a larger fixed number. Only a request that asks for it is bounded this
# way; every other request keeps MAX_TOP_K.
MAX_WHOLE_GENERATION_TOP_K = 10000
# An explicit reference an extracted entity names verbatim: the edge the APP adds
# between a target node and the document that token identifies. One rule, one
# pattern, and the same pattern text is what the database matches on.
LINK_RELATIONSHIP = "REFERS_TO"
LINK_RULES = {"L1-linear-identifier": r"^SON-\d+$"}
MAX_LINK_IDENTIFIERS = 1000
# A related-evidence edge between two chunks: a relation a local model proposed
# and the APP checked against both texts before it was allowed here. It is an
# inference, so it carries its own claim and review state and never becomes an
# extracted relation.
RELATED_RELATIONSHIP = "RELATED_EVIDENCE"
RELATED_RULE = "R1-local-judgement"
RELATED_KINDS = ("same_test_context", "condition_material_for")
RELATED_DIRECTIONS = ("a_to_b", "symmetric")
MAX_RELATED_ROWS = 100
# Chunks one embed call may take. The vectors come back in the answer, so the
# bound is the request and reply size rather than a model budget.
MAX_EMBED_CHUNKS = 2000
# How far a search may follow the graph, and how much it may bring back. These
# are this APP's expansion budget, not a change to what top_k means to Neo4j:
# `seed_top_k` is the vector search, everything else bounds what follows it.
EXPANSION_RULES = ("L1", "R1")
EXPANSION_DEFAULTS = {"per_document_limit": 3, "expansion_limit": 8, "final_limit": 16}
# Which rule reached a chunk, by the tier the expansion query stamps on it.
EXPANSION_VIA = {0: "R1", 1: "L1", 2: "entity"}
# Lucene's own reserved set (QueryParser.escape). The fulltext half of a hybrid
# search parses its text as a Lucene query; a question is not a query expression.
LUCENE_SPECIAL = set('\\+-!():^[]"{}~*?|&/')


class WorkerError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def sha256_text(text):
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def loopback_url(value):
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https", "bolt", "neo4j"):
        return False
    host = parsed.hostname
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except (TypeError, ValueError):
        return False


def origin_of(value):
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        return None
    port = "" if parsed.port is None else ":" + str(parsed.port)
    return parsed.scheme + "://" + parsed.hostname + port


def model_host_admitted(value, allowed):
    """This host always; otherwise exactly one of the origins the binding named.

    The caller checks this too. It is repeated here because the worker must not
    take the caller's word for where a document's text is allowed to go: a request
    that reached this process with a foreign address is refused before any call.
    Off-host plaintext is refused outright -- on loopback nothing leaves the
    machine, but over a network http would put the text on the wire in clear.
    """
    if not isinstance(value, str):
        return False
    if loopback_url(value):
        return True
    if not isinstance(allowed, list) or not allowed:
        return False
    if not value.startswith("https://"):
        return False
    origin = origin_of(value)
    return origin is not None and origin in allowed


# The code that decides what an extraction produces. A change inside any of these
# means a fragment made by the old one cannot stand for a fragment made by the new
# one; a change anywhere else in this file (search, loading, diagnostics, logging)
# does not. The list is deliberately whole functions rather than lines: drawing a
# boundary inside a function by hand would rot, and being conservative here costs
# an extraction that was not strictly needed, never an extraction that was.
#
# `make_llm` carries its own trace rows, so editing what the trace records also
# changes this hash. That is the price of not cutting a function in half, and it
# errs on the side of re-extracting.
EXTRACTION_RULE_FUNCTIONS = ("think_value", "extractor_accepts", "extractor_verdict",
                             "drop_incomplete_relationships", "drop_null_properties",
                             "make_llm", "extract")


def extraction_rules_sha256(source=None):
    """The hash of this worker's extraction rules, read from its own source.

    Takes `source` so the same function can be asked about a different version of
    this file -- which is how a stored fragment written before this field existed
    can be checked rather than guessed at. Reading its own source is the only file
    this worker opens besides the password file the adapter names.
    """
    import ast
    text = source
    if text is None:
        with open(__file__, "r", encoding="utf-8") as handle:
            text = handle.read()
    tree = ast.parse(text)
    lines = text.splitlines(keepends=True)
    parts = []
    for name in EXTRACTION_RULE_FUNCTIONS:
        node = next((row for row in tree.body
                     if isinstance(row, (ast.FunctionDef, ast.AsyncFunctionDef)) and row.name == name), None)
        if node is None:
            raise WorkerError("extraction_rule_function_missing")
        parts.append(name + "\x00" + "".join(lines[node.lineno - 1:node.end_lineno]))
    return "sha256:" + hashlib.sha256("\x00".join(parts).encode("utf-8")).hexdigest()


def package_versions():
    names = ("neo4j-graphrag", "neo4j", "ollama", "pydantic")
    versions = {}
    for name in names:
        try:
            versions[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            versions[name] = None
    return versions


def http_client(host):
    import httpx
    # trust_env=False: proxy variables can never redirect a loopback call.
    return httpx.AsyncClient(base_url=host, trust_env=False, timeout=httpx.Timeout(600.0, connect=5.0))


async def ollama_model_pin(host, model):
    """The installed model's manifest digest is the model revision; a tag alone is not.

    A `-cloud` model runs on the vendor's service behind the local server, so a
    loopback address alone does not keep text on this host: such models, and any
    row the server reports with a remote host or model, are refused.
    """
    if model.endswith("-cloud"):
        raise WorkerError("model_not_local")
    wanted = model if ":" in model else model + ":latest"
    async with http_client(host) as client:
        response = await client.get("/api/tags")
        response.raise_for_status()
        for row in response.json().get("models") or []:
            if wanted in (row.get("name"), row.get("model")):
                if row.get("remote_host") or row.get("remote_model"):
                    raise WorkerError("model_not_local")
                match = DIGEST.match(str(row.get("digest") or ""))
                if not match:
                    return None
                return {"digest": "sha256:" + match.group(1), "pin_kind": "model_digest"}
    return None


async def openai_model_pin(host, model):
    """What an OpenAI-compatible server can honestly say about what it is serving.

    There is no weight digest on this path. llama.cpp's /props does report the file
    it loaded, its quantisation, its build and its context size, so those are hashed
    together into the revision under `pin_kind: server_props`. That is weaker than a
    weight digest -- swapping the file at the same path would not be caught -- and it
    is labelled so nothing reads it as one. The reported path is a host-local
    absolute path, so it goes into the hash and never into a result.

    A server with no /props leaves `pin_kind: name_only` and no digest, which the
    caller's model contract refuses: an index nobody can tie to a model is not
    silently accepted.
    """
    async with http_client(host) as client:
        listing = await client.get("/v1/models")
        listing.raise_for_status()
        served = sorted(str(row.get("id")) for row in (listing.json().get("data") or []) if row.get("id"))
        if not served:
            return None
        props = {}
        try:
            answer = await client.get("/props")
            if answer.status_code == 200:
                body = answer.json()
                props = {key: body.get(key) for key in ("model_path", "model_ftype", "build_info")}
                props["n_ctx"] = (body.get("default_generation_settings") or {}).get("n_ctx")
        except Exception:  # a server without /props is pinned by name only
            props = {}
        if not props.get("model_path"):
            # No /props: the identity is whatever the server says it is serving. That
            # catches a swapped model -- the usual way an index and its model come
            # apart -- but not new weights published under the same id, so it is
            # labelled `served_id` and never confused with a weight digest.
            blob = json.dumps({"requested": model, "served": served}, sort_keys=True, ensure_ascii=True)
            return {"digest": sha256_text(blob), "pin_kind": "served_id"}
        blob = json.dumps({"requested": model, "served": served, **props}, sort_keys=True, ensure_ascii=True)
        return {"digest": sha256_text(blob), "pin_kind": "server_props"}


async def model_pin(host, model, transport):
    if transport == "openai_chat":
        return await openai_model_pin(host, model)
    return await ollama_model_pin(host, model)


def think_value(value):
    if value is None or isinstance(value, bool) or value in ("low", "medium", "high"):
        return value
    raise WorkerError("llm_think_invalid")


# The field names the tool's graph model uses. A path element that is one of
# these, or a list index, says where an answer failed; anything else is a name the
# model itself wrote and is replaced by "*", so a diagnosis never carries text.
GRAPH_MODEL_FIELDS = frozenset({"nodes", "relationships", "properties", "embedding_properties",
                                "id", "label", "type", "start_node_id", "end_node_id"})
MAX_SHAPE_PROBLEMS = 8
# A key an answer used that the graph model does not know, named only when the key
# itself is a plain ASCII identifier: a schema label, never a phrase from a document.
SCHEMA_LABEL = re.compile(r"^[A-Za-z_][A-Za-z0-9_]{0,31}$")


def rejected_shape(content, error):
    """What an answer the extractor refuses looks like -- never what it says.

    A rejected answer used to be a bare count, so "the model is writing something
    the tool will not take" could not be told apart from "the model wrote the
    wrong thing". This records the shape: whether it parsed at all, which
    top-level keys it had (only the ones the graph model knows; anything else is
    counted), how many nodes and relationships, and the field path and error kind
    of each validation problem. No value, key name or message from the answer is
    included -- a pydantic error carries the offending input, and that input is
    document text.
    """
    from neo4j_graphrag.components.entity_relation_extractor import fix_invalid_json
    shape = {"parsed": False, "error_type": type(error).__name__, "characters": len(content)}
    try:
        parsed = json.loads(fix_invalid_json(content))
    except Exception as parse_error:
        shape["parse_error_type"] = type(parse_error).__name__
        return shape
    shape["parsed"] = True
    if not isinstance(parsed, dict):
        shape["top_level_type"] = type(parsed).__name__
        return shape
    known = sorted(key for key in parsed if key in GRAPH_MODEL_FIELDS)
    unknown = [key for key in parsed if key not in GRAPH_MODEL_FIELDS]
    shape.update({"top_level_keys": known, "unknown_top_level_keys": len(unknown),
                  # The names an answer used instead, but only when a name is a
                  # plain ASCII identifier -- that is a schema label the model
                  # chose ("entities", "graph"), and it is what tells a reader
                  # whether the answer was the wrong shape or the wrong content.
                  # Anything else could be a phrase out of the document and is
                  # counted rather than named.
                  "unknown_top_level_key_names": [key for key in unknown
                                                  if SCHEMA_LABEL.match(str(key))][:8]})
    for key in ("nodes", "relationships"):
        rows = parsed.get(key)
        shape[key] = len(rows) if isinstance(rows, list) else None
    problems = getattr(error, "errors", None)
    if callable(problems):
        seen = []
        try:
            for problem in problems():
                where = ".".join(str(part) if isinstance(part, int) or part in GRAPH_MODEL_FIELDS else "*"
                                 for part in (problem.get("loc") or ()))
                row = {"at": where[:120], "kind": str(problem.get("type"))[:60]}
                if row not in seen:
                    seen.append(row)
                if len(seen) >= MAX_SHAPE_PROBLEMS:
                    break
        except Exception:  # a model whose errors cannot be listed is still counted
            seen = []
        shape["problems"] = seen
    return shape


def extractor_verdict(content):
    """Whether the extractor's own parse accepts this answer, and if not, its shape.

    The extractor turns any failure into an empty chunk graph without saying so,
    so the adapter runs the same steps itself to count -- and now to describe --
    the answers that carried no graph.
    """
    from neo4j_graphrag.components.entity_relation_extractor import fix_invalid_json
    from neo4j_graphrag.components.types import Neo4jGraph
    try:
        Neo4jGraph.model_validate(json.loads(fix_invalid_json(content)))
        return True, None
    except Exception as error:
        return False, rejected_shape(content, error)


def extractor_accepts(content):
    return extractor_verdict(content)[0]


def drop_incomplete_relationships(parsed):
    """Removes relationship rows that cannot stand, and says how many.

    An answer cut off mid-object leaves a relationship with no `start_node_id` or
    `end_node_id`; the tool's `Neo4jRelationship` requires both, so pydantic
    rejects the whole answer and the extractor turns that chunk into an empty
    graph -- seventeen good relationships lost because the eighteenth was cut. A
    relationship that names a node the same answer never defined is the same kind
    of row: the APP's own admission drops it a moment later anyway
    (`relationships_outside_fragment`), so nothing is admitted here that would not
    have been. Nodes are untouched, and a complete answer is unchanged.
    """
    rows = parsed.get("relationships") if isinstance(parsed, dict) else None
    if not isinstance(rows, list):
        return parsed, 0
    known = {node.get("id") for node in (parsed.get("nodes") or []) if isinstance(node, dict)}
    kept = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        start, end, kind = row.get("start_node_id"), row.get("end_node_id"), row.get("type")
        if not isinstance(start, str) or not isinstance(end, str) or not isinstance(kind, str) or not kind:
            continue
        if start not in known or end not in known:
            continue
        kept.append(row)
    dropped = len(rows) - len(kept)
    if dropped:
        parsed["relationships"] = kept
    return parsed, dropped


def drop_null_properties(content):
    """Remove properties the model left null, and say how many. Nothing else changes.

    The installed tool's `PropertyValue` has no null member, so a single
    `"properties": {"due": null}` makes the graph model reject the whole chunk
    answer; the extractor then turns that answer into an empty chunk graph
    without saying so and the run is degraded. A null property has no meaning
    downstream either -- Neo4j has no null property and the APP's own
    `cleanProperties` drops undefined -- so the key is removed rather than the
    answer lost. An answer that does not parse, or that carries no null property,
    goes to the tool exactly as the model wrote it; the tool still judges it.
    The prompt is untouched: it belongs to the pinned tool version.

    It also drops the relationship rows an answer could not finish
    (`drop_incomplete_relationships`) and reports both counts, because both are
    the same failure: one row the tool will not take losing the whole answer.
    """
    from neo4j_graphrag.components.entity_relation_extractor import fix_invalid_json
    try:
        parsed = json.loads(fix_invalid_json(content))
    except Exception:
        return content, {"null_properties": 0, "incomplete_relationships": 0}
    dropped = 0
    for key in ("nodes", "relationships"):
        rows = parsed.get(key) if isinstance(parsed, dict) else None
        for row in rows if isinstance(rows, list) else []:
            properties = row.get("properties") if isinstance(row, dict) else None
            if not isinstance(properties, dict):
                continue
            empty = [name for name, value in properties.items() if value is None]
            for name in empty:
                del properties[name]
            dropped += len(empty)
    parsed, incomplete = drop_incomplete_relationships(parsed)
    if dropped == 0 and incomplete == 0:
        return content, {"null_properties": 0, "incomplete_relationships": 0}
    return json.dumps(parsed, ensure_ascii=False), {"null_properties": dropped, "incomplete_relationships": incomplete}


def make_llm(llm_profile, client):
    from neo4j_graphrag.llm.base import LLMInterface
    from neo4j_graphrag.llm.types import LLMResponse

    max_calls = int(llm_profile.get("max_calls", 0))
    if max_calls < 1:
        raise WorkerError("llm_budget_invalid")
    transport = llm_profile.get("transport", "ollama")
    if transport not in ("ollama", "openai_chat"):
        raise WorkerError("llm_transport_invalid")
    think = think_value(llm_profile.get("think", False))
    options = dict(llm_profile.get("options") or {})
    if transport == "ollama":
        path = "/api/chat"
        body = {"model": llm_profile["model"], "format": "json", "stream": False,
                "options": options, "keep_alive": llm_profile.get("keep_alive", "0s")}
        if think is not None:
            body["think"] = think
    else:
        # OpenAI-compatible: JSON mode is response_format, the sampler lives at the
        # top level, and thinking is a chat-template argument rather than a field.
        # llama.cpp returns its reasoning separately, so `content` stays pure JSON.
        path = "/v1/chat/completions"
        body = {"model": llm_profile["model"], "stream": False,
                "response_format": {"type": "json_object"}}
        if "temperature" in options:
            body["temperature"] = options["temperature"]
        if "seed" in options:
            body["seed"] = options["seed"]
        if "num_predict" in options:
            body["max_tokens"] = options["num_predict"]
        if think is not None:
            body["chat_template_kwargs"] = {"enable_thinking": bool(think)}

    class BudgetedLocalLLM(LLMInterface):
        """LLM adapter for the extractor's prompt path.

        The packaged Ollama wrapper sends every model parameter inside `options`
        on its async path, and the pinned ollama client predates the thinking
        switch, so a thinking model spends its whole turn thinking and returns no
        JSON. This adapter posts to the local chat API directly with JSON format,
        an explicit `think` value, a call budget and one trace row per call
        (hashes, sizes, stop reason, time and tokens; never the text).
        """

        def __init__(self):
            super().__init__(model_name=llm_profile["model"])
            self.trace = []

        def invoke(self, input, message_history=None, system_instruction=None):
            raise WorkerError("sync_llm_path_not_used")

        async def ainvoke(self, input, message_history=None, system_instruction=None):
            # Only the prompt is sent; a tool path that adds history or a system
            # instruction would change the prompt without the revision showing it.
            if message_history or system_instruction:
                raise WorkerError("llm_prompt_path_not_supported")
            if len(self.trace) >= max_calls:
                self.trace.append({"call": len(self.trace) + 1, "status": "budget_exhausted",
                                   "input_sha256": sha256_text(input)})
                return LLMResponse(content=EMPTY_GRAPH)
            started = time.monotonic()
            row = {"call": len(self.trace) + 1, "input_sha256": sha256_text(input)}
            try:
                response = await client.post(path, json={**body, "messages": [{"role": "user", "content": input}]})
                row["http_status"] = response.status_code
                response.raise_for_status()
                data = response.json()
                if transport == "ollama":
                    message = data.get("message") or {}
                    content = message.get("content") or ""
                    thinking = message.get("thinking") or ""
                    stop, prompt_tokens = data.get("done_reason"), data.get("prompt_eval_count")
                    output_tokens = data.get("eval_count")
                else:
                    choice = (data.get("choices") or [{}])[0]
                    message = choice.get("message") or {}
                    content = message.get("content") or ""
                    thinking = message.get("reasoning_content") or ""
                    usage = data.get("usage") or {}
                    # finish_reason uses the same word for a cut-off answer, which is
                    # what the caller's degraded check reads.
                    stop, prompt_tokens = choice.get("finish_reason"), usage.get("prompt_tokens")
                    output_tokens = usage.get("completion_tokens")
                # The answer as the model wrote it is what the trace hashes and
                # measures; only the null properties are taken out before the tool.
                row.update({"output_sha256": sha256_text(content), "output_characters": len(content),
                            "thinking_characters": len(thinking),
                            "done_reason": stop, "prompt_tokens": prompt_tokens,
                            "output_tokens": output_tokens})
                content, cleaned = drop_null_properties(content)
                accepted, shape = extractor_verdict(content)
                row.update({"status": "ok" if accepted else "invalid_output",
                            "dropped_null_properties": cleaned["null_properties"],
                            "dropped_incomplete_relationships": cleaned["incomplete_relationships"]})
                if shape is not None:
                    row["rejected_shape"] = shape
            except Exception as error:  # the extractor turns empty output into an empty chunk graph
                content = EMPTY_GRAPH
                row.update({"status": "error", "error_type": type(error).__name__})
            row["elapsed_ms"] = round((time.monotonic() - started) * 1000)
            self.trace.append(row)
            return LLMResponse(content=content)

    return BudgetedLocalLLM()


def pruning_summary(stats):
    def by_reason(items):
        counts = {}
        for item in items:
            reason = getattr(item.pruned_reason, "value", str(item.pruned_reason))
            counts[reason] = counts.get(reason, 0) + 1
        return dict(sorted(counts.items()))
    return {"nodes": by_reason(stats.pruned_nodes), "relationships": by_reason(stats.pruned_relationships),
            "properties": by_reason(stats.pruned_properties)}


def graph_to_fragment(graph, document, pruned):
    nodes = []
    for node in graph.nodes:
        nodes.append({"id": node.id, "label": node.label, "properties": dict(node.properties or {}),
                      "embedding_properties": {key: list(value) for key, value in (node.embedding_properties or {}).items()}})
    relationships = []
    for rel in graph.relationships:
        relationships.append({"start_node_id": rel.start_node_id, "end_node_id": rel.end_node_id, "type": rel.type,
                              "properties": dict(rel.properties or {})})
    nodes.sort(key=lambda row: (row["label"], row["id"]))
    relationships.sort(key=lambda row: (row["type"], row["start_node_id"], row["end_node_id"]))
    return {"doc_key": document["doc_key"], "nodes": nodes, "relationships": relationships, "tool_pruning": pruned}


async def extract(request):
    from neo4j_graphrag.components.embedder import TextChunkEmbedder
    from neo4j_graphrag.components.entity_relation_extractor import LLMEntityRelationExtractor, OnError
    from neo4j_graphrag.components.graph_pruning import GraphPruning
    from neo4j_graphrag.components.schema import GraphSchema
    from neo4j_graphrag.components.types import DocumentInfo, TextChunk, TextChunks

    profile = request["profile"]
    schema = GraphSchema.model_validate(profile["schema"])
    llm_profile, embedder_profile = profile["llm"], profile.get("embedder")
    allowed = profile.get("allowed_hosts") or []
    if not model_host_admitted(llm_profile.get("host"), allowed):
        raise WorkerError("llm_endpoint_not_admitted")
    if embedder_profile and not model_host_admitted(embedder_profile.get("host"), allowed):
        raise WorkerError("embedder_endpoint_not_admitted")
    llm_pin = await model_pin(llm_profile["host"], llm_profile["model"], llm_profile.get("transport", "ollama"))
    if not llm_pin or llm_pin.get("digest") is None:
        raise WorkerError("llm_model_not_installed")
    models = {"llm": {"model": llm_profile["model"], **llm_pin}}
    embedder = None
    if embedder_profile:
        from neo4j_graphrag.embeddings import OllamaEmbeddings
        # The embedder is always spoken to over Ollama: its vectors are the index.
        embedder_pin = await ollama_model_pin(embedder_profile["host"], embedder_profile["model"])
        if not embedder_pin or embedder_pin.get("digest") is None:
            raise WorkerError("embedder_model_not_installed")
        models["embedder"] = {"model": embedder_profile["model"], **embedder_pin}
        embedder = TextChunkEmbedder(OllamaEmbeddings(model=embedder_profile["model"], host=embedder_profile["host"]),
                                     max_concurrency=1)
    fragments, embedder_calls = [], 0
    async with http_client(llm_profile["host"]) as client:
        llm = make_llm(llm_profile, client)
        extractor = LLMEntityRelationExtractor(llm=llm, create_lexical_graph=True, on_error=OnError.IGNORE,
                                               max_concurrency=int(profile.get("max_concurrency", 1)))
        pruner = GraphPruning()
        for document in request["documents"]:
            chunks = [TextChunk(text=unit["text"], index=index, uid=document["doc_key"] + ":" + unit["unit_id"],
                                metadata={"sf_unit_id": unit["unit_id"]})
                      for index, unit in enumerate(document["units"])]
            text_chunks = TextChunks(chunks=chunks)
            if embedder is not None:
                text_chunks = await embedder.run(text_chunks=text_chunks)
                embedder_calls += len(chunks)
            info = DocumentInfo(path=document["doc_key"], uid=document["doc_key"],
                                metadata={"sf_doc_key": document["doc_key"], "sf_title": str(document.get("title", ""))[:512]})
            graph = await extractor.run(chunks=text_chunks, document_info=info, schema=schema)
            pruned = await pruner.run(graph=graph, schema=schema)
            fragments.append(graph_to_fragment(pruned.graph, document, pruning_summary(pruned.pruning_stats)))
    calls = llm.trace
    return {"status": "ok", "fragments": fragments, "llm_calls": calls, "models": models, "packages": package_versions(),
            "embedder_calls": embedder_calls,
            "budget_exhausted": any(row["status"] == "budget_exhausted" for row in calls),
            "llm_errors": sum(1 for row in calls if row["status"] == "error"),
            "invalid_outputs": sum(1 for row in calls if row["status"] == "invalid_output")}


async def embed_chunks(request):
    """Vectors for chunks that already exist, with no extraction and nothing written.

    `extract` embeds a chunk on its way through the tool's TextChunkEmbedder, which
    calls `OllamaEmbeddings.embed_query(chunk.text)`; this operation calls exactly
    that, one chunk at a time, so a generation whose vectors were replaced here holds
    the vectors the same path would have produced. Nothing is prepended to the text,
    nothing is normalised on this side (the server returns unit-length vectors), and
    `truncate=False` turns Ollama's silent cut at the context length into a refusal:
    a chunk too long for the model is reported with its size rather than embedded as
    a prefix of itself. The relations of the source generation are not touched -- no
    model writes a graph here, and no LLM is called at all.
    """
    from neo4j_graphrag.embeddings import OllamaEmbeddings

    profile = request.get("profile") or {}
    spec = profile.get("embedder")
    if not isinstance(spec, dict) or not model_host_admitted(spec.get("host"), profile.get("allowed_hosts") or []):
        raise WorkerError("embedder_endpoint_not_admitted")
    pin = await ollama_model_pin(spec["host"], spec["model"])
    if not pin or pin.get("digest") is None:
        raise WorkerError("embedder_model_not_installed")
    chunks = request.get("chunks")
    if not isinstance(chunks, list) or not chunks or len(chunks) > MAX_EMBED_CHUNKS:
        raise WorkerError("embed_request_invalid")
    for chunk in chunks:
        if (not isinstance(chunk, dict) or not DIGEST.match(str(chunk.get("doc_key") or ""))
                or not TOKEN.match(str(chunk.get("unit_id") or "")) or not isinstance(chunk.get("text"), str)
                or not chunk["text"]):
            raise WorkerError("embed_request_invalid")

    embedder = OllamaEmbeddings(model=spec["model"], host=spec["host"])
    vectors, refused, calls = [], [], 0
    started = time.monotonic()
    for chunk in chunks:
        try:
            vector = embedder.embed_query(chunk["text"], truncate=False)
            calls += 1
        except Exception as error:  # never echo the text, only its size
            refused.append({"doc_key": chunk["doc_key"], "unit_id": chunk["unit_id"],
                            "characters": len(chunk["text"]), "error_type": type(error).__name__})
            continue
        vectors.append({"doc_key": chunk["doc_key"], "unit_id": chunk["unit_id"],
                        "dimensions": len(vector), "embedding": vector})
    dimensions = sorted({row["dimensions"] for row in vectors})
    code = "embed_input_refused" if refused else "embed_dimensions_mixed" if len(dimensions) > 1 else None
    return {"status": "incomplete" if code else "ok", "code": code,
            "models": {"embedder": {"model": spec["model"], **pin}},
            "vectors": vectors, "refused": refused, "dimensions": dimensions,
            "embedder_calls": calls, "elapsed_ms": round((time.monotonic() - started) * 1000),
            "packages": package_versions()}


# ---------------------------------------------------------------------------
# Graph database: one database, many projects, one selected generation each.
#
# What used to be guaranteed by the address (a container held one project, so a
# wrong address was the only way to reach another project's nodes) is guaranteed
# here by the scope every operation carries. The checks did not go away; their
# ground moved. A load names (project, generation) and may read, write or delete
# only nodes with that pair. A search names it and the vector index itself filters
# on it. A generation id already held by a different project is refused outright,
# because a receipt that named it would be ambiguous. And a load counts every
# other project's nodes before and after itself: if that number moves, the load
# reached outside its scope and says so rather than reporting success.
# ---------------------------------------------------------------------------


def read_password(path):
    """The single line at `path`, checked for shape only.

    The value is handed straight to the driver. It is never logged, hashed into a
    receipt, or included in any result this worker prints.
    """
    with open(path, "rb") as handle:
        raw = handle.read(4096)
    if raw.startswith(b"\xef\xbb\xbf"):
        raise WorkerError("neo4j_password_file_invalid")
    lines = raw.decode("utf-8").splitlines()
    if len(lines) != 1 or not lines[0].strip():
        raise WorkerError("neo4j_password_file_invalid")
    return lines[0].strip()


def neo4j_driver(binding):
    """A driver for a loopback Neo4j, with the driver's own telemetry switched off."""
    from neo4j import GraphDatabase
    if not isinstance(binding, dict):
        raise WorkerError("neo4j_binding_invalid")
    uri = binding.get("uri")
    if not loopback_url(uri) or urlparse(uri).scheme not in ("bolt", "neo4j"):
        raise WorkerError("neo4j_endpoint_not_loopback")
    user, password_file = binding.get("user"), binding.get("password_file")
    database = binding.get("database") or None
    for value in (user, password_file):
        if not isinstance(value, str) or not value:
            raise WorkerError("neo4j_binding_invalid")
    if database is not None and not TOKEN.match(database):
        raise WorkerError("neo4j_binding_invalid")
    driver = GraphDatabase.driver(uri, auth=(user, read_password(password_file)), telemetry_disabled=True)
    return driver, database


def run_query(driver, database, query, **parameters):
    return driver.execute_query(query, database_=database, **parameters).records


def chunk_count(driver, database, project_key, generation_id):
    """How many chunks this project's generation holds, as the database has them."""
    rows = run_query(driver, database,
                     "MATCH (c:" + CHUNK_LABEL + " {sf_project: $project, sf_generation: $generation}) "
                     "RETURN count(c) AS chunks", project=project_key, generation=generation_id)
    return int(rows[0]["chunks"]) if rows else 0


def generation_rows(driver, database, project_key=None):
    """The generations this database holds; one project's when `project_key` is given.

    Every caller that decides something about a project passes one. Without it the
    answer is the whole database, which is what an inventory asks for.
    """
    if project_key is None:
        return run_query(driver, database,
                         "MATCH (g:" + GENERATION_LABEL + ") "
                         "RETURN g.project_key AS project_key, g.generation_id AS generation_id, "
                         "toString(g.loaded_at) AS loaded_at ORDER BY g.project_key, g.generation_id")
    return run_query(driver, database,
                     "MATCH (g:" + GENERATION_LABEL + " {project_key: $project}) "
                     "RETURN g.project_key AS project_key, g.generation_id AS generation_id, "
                     "toString(g.loaded_at) AS loaded_at ORDER BY g.generation_id", project=project_key)


def assert_generation_owned(driver, database, project_key, generation_id):
    """Refuses a generation id this database already holds under another project.

    Two projects naming one generation the same would make every row that carries
    only the id -- a receipt's `generations_present`, an operator's query, a
    superseded list -- mean two things at once, and the next replacement would be
    aimed at an ambiguous target. The scope is the pair, so the id must be free.
    """
    rows = run_query(driver, database,
                     "MATCH (g:" + GENERATION_LABEL + " {generation_id: $g}) WHERE g.project_key <> $p "
                     "RETURN count(g) AS n", g=generation_id, p=project_key)
    if rows and rows[0]["n"]:
        raise WorkerError("graph_project_mismatch")


def other_project_nodes(driver, database, project_key):
    """How many nodes in this database belong to some other project."""
    rows = run_query(driver, database,
                     "MATCH (n) WHERE n.sf_project IS NOT NULL AND n.sf_project <> $p RETURN count(n) AS n",
                     p=project_key)
    return int(rows[0]["n"]) if rows else 0


def residue_count(driver, database):
    """Nodes the tool's writer left mid-flight.

    Neo4jWriter marks every node it creates with `__tmp_internal_id` and clears the
    property when it finishes. A node still carrying one is an unfinished earlier
    load, and writing on top of it would stamp those nodes as this generation's.
    """
    rows = run_query(driver, database,
                     "MATCH (n:__KGBuilder__) WHERE n.__tmp_internal_id IS NOT NULL RETURN count(n) AS n")
    return rows[0]["n"] if rows else 0


def fragment_to_graph(fragment):
    """One admitted fragment as the tool's own graph model.

    The APP keeps a chunk's vector beside the node; the tool wants it under
    `embedding_properties`, which is what `db.create.setNodeVectorProperty` reads.
    """
    from neo4j_graphrag.components.types import Neo4jGraph
    # Neo4j has no null property: setting one removes it. The APP writes null for a
    # field that does not apply (a Document node has no unit id), so those keys are
    # dropped here rather than offered to the tool, which rejects None outright.
    present = lambda properties: {key: value for key, value in (properties or {}).items() if value is not None}
    nodes = []
    for node in fragment["nodes"]:
        row = {"id": node["id"], "label": node["label"], "properties": present(node.get("properties"))}
        embedding = node.get("embedding")
        if embedding:
            row["embedding_properties"] = {EMBEDDING_PROPERTY: list(embedding)}
        nodes.append(row)
    relationships = [{"start_node_id": rel["start_node_id"], "end_node_id": rel["end_node_id"],
                      "type": rel["type"], "properties": present(rel.get("properties"))}
                     for rel in fragment["relationships"]]
    return Neo4jGraph.model_validate({"nodes": nodes, "relationships": relationships})


async def write_fragments(driver, database, fragments):
    from neo4j_graphrag.components.kg_writer import Neo4jWriter
    # clean_db=False: the temporary ids are how the just-written nodes are found, so
    # this adapter stamps them with project and generation first and clears them itself.
    writer = Neo4jWriter(driver=driver, neo4j_database=database, clean_db=False)
    written = {"nodes": 0, "relationships": 0}
    for fragment in fragments:
        graph = fragment_to_graph(fragment)
        result = await writer.run(graph=graph)
        if str(getattr(result, "status", "SUCCESS")) not in ("SUCCESS", "KGWriterStatus.SUCCESS"):
            raise WorkerError("graph_write_failed")
        written["nodes"] += len(graph.nodes)
        written["relationships"] += len(graph.relationships)
    return written


def vector_index_row(driver, database):
    """What the database says its chunk vector index is, or None when it has none.

    `properties` lists the embedding property first and the declared filter
    properties after it, which is how a caller learns whether the scope predicate
    can sit inside the index or has to be applied to what it returns.
    """
    for row in run_query(driver, database,
                         "SHOW VECTOR INDEXES YIELD name, properties, options, state "
                         "RETURN name, properties, options, state"):
        if row["name"] != VECTOR_INDEX:
            continue
        properties = list(row["properties"] or [])
        config = (row["options"] or {}).get("indexConfig") or {}
        dimensions = config.get("vector.dimensions")
        return {"name": VECTOR_INDEX, "state": row["state"],
                "embedding_property": properties[0] if properties else None,
                "filter_properties": properties[1:],
                "dimensions": int(dimensions) if isinstance(dimensions, (int, float)) else None}
    return None


def ensure_indexes(driver, database, dimensions):
    """The database-wide chunk indexes, created once and never silently replaced.

    The vector index is written as DDL rather than through the tool's helper
    because the helper cannot declare filter properties, and those are what make a
    project's scope part of the index rather than a step a caller could forget.
    An index that is already there with different dimensions is a refusal: dropping
    it would delete every other project's search vectors along with this one's.
    """
    from neo4j_graphrag.indexes import create_fulltext_index
    existing = vector_index_row(driver, database)
    if dimensions:
        if existing is None:
            # `dimensions` is an integer measured from the fragments; index options
            # take no parameters, so it is rendered as one after that check.
            if not isinstance(dimensions, int) or isinstance(dimensions, bool) or not 1 <= dimensions <= 8192:
                raise WorkerError("graph_embedding_dimensions_invalid")
            filters = ", ".join("n." + name for name in VECTOR_FILTER_PROPERTIES)
            run_query(driver, database,
                      "CREATE VECTOR INDEX " + VECTOR_INDEX + " IF NOT EXISTS "
                      "FOR (n:" + CHUNK_LABEL + ") ON n." + EMBEDDING_PROPERTY + " "
                      "WITH [" + filters + "] "
                      "OPTIONS {indexConfig:{`vector.dimensions`: " + str(dimensions) + ", "
                      "`vector.similarity_function`: 'cosine'}}")
        elif existing["dimensions"] != dimensions:
            raise WorkerError("graph_vector_index_dimension_mismatch")
    create_fulltext_index(driver, FULLTEXT_INDEX, label=CHUNK_LABEL, node_properties=["text"],
                          neo4j_database=database, fail_if_exists=False)
    run_query(driver, database, "CALL db.awaitIndexes(300)")
    return vector_index_row(driver, database)


def take_materialize_lock(driver, database, project_key, token):
    """Holds the database against a second load for the length of this one.

    A load writes nodes the tool marks with `__tmp_internal_id` and then stamps
    every marked node with this project and generation. That stamp is database-wide
    by construction, so two projects loading at the same time would each take the
    other's half-written nodes. The lock is a single node: it is created only when
    none is there, and the creator re-reads it to be sure exactly its own is held.
    """
    if run_query(driver, database, "MATCH (l:" + MATERIALIZE_LOCK_LABEL + ") RETURN count(l) AS n")[0]["n"]:
        raise WorkerError("graph_materialize_locked")
    run_query(driver, database,
              "CREATE (l:" + MATERIALIZE_LOCK_LABEL + " {token: $token, project_key: $project, taken_at: datetime()})",
              token=token, project=project_key)
    held = run_query(driver, database, "MATCH (l:" + MATERIALIZE_LOCK_LABEL + ") RETURN l.token AS token")
    if len(held) != 1 or held[0]["token"] != token:
        release_materialize_lock(driver, database, token)
        raise WorkerError("graph_materialize_locked")


def release_materialize_lock(driver, database, token):
    run_query(driver, database, "MATCH (l:" + MATERIALIZE_LOCK_LABEL + " {token: $token}) DELETE l", token=token)


def embedding_dimensions(fragments):
    for fragment in fragments:
        for node in fragment["nodes"]:
            if node.get("embedding"):
                return len(node["embedding"])
    return 0


def materialize(request):
    """Loads one generation so the database holds exactly that generation of this project.

    A repeat of the same generation changes nothing and says so. A different
    generation of the same project replaces the previous one: the graph is a derived,
    rebuildable projection of the project store, and two generations of one project in
    one database would double every chunk. Another project's generations are neither
    read nor written: the replacement names this project and this generation, so a
    load is bounded by the scope it declares rather than by the database it reached.
    """
    project_key, generation_id = request.get("project_key"), request.get("generation_id")
    # The project key is the APP's composite identity string (it carries unit
    # separators), so it is bounded and stored as given rather than tokenised.
    # The generation id is a store token and is checked as one.
    if not isinstance(project_key, str) or not project_key or len(project_key) > 512:
        raise WorkerError("graph_materialize_request_invalid")
    if not TOKEN.match(str(generation_id or "")):
        raise WorkerError("graph_materialize_request_invalid")
    fragments = request.get("fragments")
    if not isinstance(fragments, list):
        raise WorkerError("graph_materialize_request_invalid")

    driver, database = neo4j_driver(request.get("neo4j"))
    with driver:
        driver.verify_connectivity()
        # This project's generations, and the id's freedom from every other project.
        existing = generation_rows(driver, database, project_key)
        assert_generation_owned(driver, database, project_key, generation_id)
        others = sorted({row["project_key"] for row in generation_rows(driver, database)
                         if row["project_key"] != project_key})
        if any(row["generation_id"] == generation_id for row in existing):
            counts = run_query(driver, database,
                               "MATCH (n) WHERE n.sf_project = $p AND n.sf_generation = $g RETURN count(n) AS nodes",
                               p=project_key, g=generation_id)
            return {"status": "ok", "loaded": False, "code": "generation_already_loaded",
                    "project_key": project_key, "generation_id": generation_id,
                    "counts": {"nodes": counts[0]["nodes"] if counts else 0},
                    "generations_present": [row["generation_id"] for row in existing],
                    "other_projects_present": len(others)}
        dimensions = embedding_dimensions(fragments)
        token = hashlib.sha256((project_key + "\x00" + generation_id + "\x00" + str(time.time_ns())).encode("utf-8")).hexdigest()
        take_materialize_lock(driver, database, project_key, token)
        # Counted before the first write and again after the last one. This load
        # may touch only its own (project, generation); if the number of nodes
        # belonging to anyone else moves, it reached outside that scope, and the
        # result says so instead of reporting a successful load.
        outside_before = other_project_nodes(driver, database, project_key)
        try:
            if residue_count(driver, database):
                raise WorkerError("graph_residue_present")
            # Checked before anything is written: an index of another width cannot
            # be widened, and dropping it would take every other project's vectors.
            present_index = vector_index_row(driver, database)
            if dimensions and present_index is not None and present_index["dimensions"] != dimensions:
                raise WorkerError("graph_vector_index_dimension_mismatch")

            superseded = [row["generation_id"] for row in existing]
            removed = 0
            for old in superseded:
                rows = run_query(driver, database,
                                 "MATCH (n) WHERE n.sf_project = $p AND n.sf_generation = $g "
                                 "DETACH DELETE n RETURN count(n) AS n", p=project_key, g=old)
                removed += rows[0]["n"] if rows else 0

            written = asyncio.run(write_fragments(driver, database, fragments))
            stamped = run_query(driver, database,
                                "MATCH (n:__KGBuilder__) WHERE n.__tmp_internal_id IS NOT NULL "
                                "SET n.sf_project = $p, n.sf_generation = $g "
                                "SET n.__tmp_internal_id = NULL RETURN count(n) AS n",
                                p=project_key, g=generation_id)
            stamped_count = stamped[0]["n"] if stamped else 0
            if residue_count(driver, database):
                raise WorkerError("graph_residue_not_cleared")
            # The stamp is database-wide by construction (it finds nodes by the
            # tool's temporary marker), so what it actually stamped is checked
            # against the scope it was given rather than assumed to match it.
            crossed = run_query(driver, database,
                                "MATCH (n) WHERE n.sf_generation = $g AND n.sf_project <> $p "
                                "RETURN count(n) AS n", g=generation_id, p=project_key)
            if crossed and crossed[0]["n"]:
                raise WorkerError("graph_project_mismatch")

            indexes = ensure_indexes(driver, database, dimensions)

            scope = {"p": project_key, "g": generation_id}
            chunks = run_query(driver, database,
                               "MATCH (c:" + CHUNK_LABEL + ") WHERE c.sf_project = $p AND c.sf_generation = $g "
                               "RETURN count(c) AS n", **scope)
            embedded = run_query(driver, database,
                                 "MATCH (c:" + CHUNK_LABEL + ") WHERE c.sf_project = $p AND c.sf_generation = $g "
                                 "AND c." + EMBEDDING_PROPERTY + " IS NOT NULL RETURN count(c) AS n", **scope)
            run_query(driver, database,
                      "CREATE (g:" + GENERATION_LABEL + " {project_key: $p, generation_id: $g, "
                      "sf_project: $p, sf_generation: $g, loaded_at: datetime()})", **scope)
            loaded_at = run_query(driver, database,
                                  "MATCH (g:" + GENERATION_LABEL + " {project_key: $p, generation_id: $g}) "
                                  "RETURN toString(g.loaded_at) AS loaded_at", **scope)
            outside_after = other_project_nodes(driver, database, project_key)
            if outside_after != outside_before:
                raise WorkerError("graph_other_project_changed")
        finally:
            release_materialize_lock(driver, database, token)
        # What the rest of the database holds after this load, counted rather than
        # asserted: a load that touched another project would show up here.
        untouched = [{"project_key": row["project_key"], "generation_id": row["generation_id"],
                      "loaded_at": row["loaded_at"]} for row in generation_rows(driver, database)
                     if row["project_key"] != project_key]
        return {"status": "ok", "loaded": True, "project_key": project_key, "generation_id": generation_id,
                "loaded_at": loaded_at[0]["loaded_at"] if loaded_at else None,
                "counts": {"fragments": len(fragments), "nodes": written["nodes"],
                           "relationships": written["relationships"], "stamped": stamped_count,
                           "chunks": chunks[0]["n"] if chunks else 0,
                           "embedded_chunks": embedded[0]["n"] if embedded else 0},
                "superseded": superseded, "removed_nodes": removed,
                "indexes": {"vector": VECTOR_INDEX if dimensions else None, "fulltext": FULLTEXT_INDEX,
                            "dimensions": dimensions,
                            "filter_properties": (indexes or {}).get("filter_properties", [])},
                "other_projects": untouched,
                "other_project_nodes": {"before": outside_before, "after": outside_after},
                "packages": package_versions()}


# ---------------------------------------------------------------------------
# Explicit references: an edge from a node that names an identifier verbatim to
# the document that identifier belongs to. Nothing is merged and no node changes;
# the edge is an addition to the derived projection, rebuilt with the generation.
# ---------------------------------------------------------------------------

LINK_SCAN_QUERY = (
    "MATCH (e:" + ENTITY_LABEL + ") "
    "WHERE e.sf_generation = $generation AND e.sf_project = $project AND e.name =~ $pattern "
    "RETURN elementId(e) AS element_id, e.name AS name, e.sf_unit_id AS sf_unit_id, "
    "e.sf_doc_key AS sf_doc_key, e.sf_generation AS sf_generation, e.sf_project AS sf_project "
    "ORDER BY e.sf_doc_key, e.sf_unit_id, e.name"
)

# Counted before and after the merge: the difference is what this call created,
# so a repeat of the same request reports the same edges and creates none.
LINK_COUNT_QUERY = (
    "UNWIND $rows AS row "
    "MATCH (e) WHERE elementId(e) = row.element_id "
    "MATCH (e)-[r:" + LINK_RELATIONSHIP + "]->(d:" + DOCUMENT_LABEL + ") "
    "WHERE d.sf_doc_key = row.target_doc_key AND d.sf_generation = $generation AND d.sf_project = $project "
    "AND r.sf_rule = $rule AND r.sf_token = row.token AND r.sf_generation = $generation "
    "AND r.sf_project = $project "
    "RETURN count(r) AS n"
)

LINK_MERGE_QUERY = (
    "UNWIND $rows AS row "
    "MATCH (e) WHERE elementId(e) = row.element_id "
    "MATCH (d:" + DOCUMENT_LABEL + ") "
    "WHERE d.sf_doc_key = row.target_doc_key AND d.sf_generation = $generation AND d.sf_project = $project "
    "MERGE (e)-[r:" + LINK_RELATIONSHIP + " {sf_rule: $rule, sf_token: row.token, "
    "sf_source_unit_id: row.source_unit_id, sf_source_doc_key: row.source_doc_key, "
    "sf_generation: $generation, sf_project: $project, sf_claim_state: 'observed'}]->(d) "
    "RETURN count(r) AS n"
)


def link_candidates(rows, identifiers, project_key, generation_id, pattern):
    """The rows this rule links, and only those.

    A row survives when its name is exactly an identifier of this rule's shape,
    that identifier belongs to a document of this same generation and project,
    and that document is not the row's own. A node naming its own document adds
    no hop, and a name the identifier map does not know is not a reference this
    rule can claim -- both are left out rather than guessed at.
    """
    candidates = []
    for row in rows:
        token = row.get("name")
        if not isinstance(token, str) or not pattern.match(token):
            continue
        target = identifiers.get(token)
        if not isinstance(target, str) or not target:
            continue
        source_doc_key = row.get("sf_doc_key")
        if not isinstance(source_doc_key, str) or target == source_doc_key:
            continue
        if row.get("sf_generation") != generation_id or row.get("sf_project") != project_key:
            continue
        candidates.append({"element_id": row.get("element_id"), "token": token,
                           "source_unit_id": row.get("sf_unit_id"), "source_doc_key": source_doc_key,
                           "target_doc_key": target})
    candidates.sort(key=lambda row: (row["source_doc_key"], str(row["source_unit_id"]), row["token"],
                                     row["target_doc_key"]))
    return candidates


def link_request_identifiers(value):
    """The token -> document map this request may link, checked for shape only."""
    if not isinstance(value, dict) or not value or len(value) > MAX_LINK_IDENTIFIERS:
        raise WorkerError("graph_link_request_invalid")
    for token, doc_key in value.items():
        if not isinstance(token, str) or not token or len(token) > 200:
            raise WorkerError("graph_link_request_invalid")
        if not isinstance(doc_key, str) or not doc_key.startswith("sha256:") or not DIGEST.match(doc_key):
            raise WorkerError("graph_link_request_invalid")
    return value


def link_explicit_refs(request):
    """Adds one rule's explicit-reference edges to the generation this database holds.

    `apply: false` reads and returns the candidates without writing anything.
    `apply: true` merges one edge per candidate, so running it again finds the same
    edges and creates none. Nodes are never merged, relabelled or given a property
    here: a node keeps the chunk it came from, which is what a citation reads back.
    """
    project_key, generation_id = request.get("project_key"), request.get("generation_id")
    if not isinstance(project_key, str) or not project_key or len(project_key) > 512:
        raise WorkerError("graph_link_request_invalid")
    if not TOKEN.match(str(generation_id or "")):
        raise WorkerError("graph_link_request_invalid")
    rule = request.get("rule")
    if rule not in LINK_RULES:
        raise WorkerError("graph_link_rule_unknown")
    pattern_text = LINK_RULES[rule]
    pattern = re.compile(pattern_text)
    identifiers = link_request_identifiers(request.get("identifiers"))
    apply_edges = request.get("apply")
    if not isinstance(apply_edges, bool):
        raise WorkerError("graph_link_request_invalid")

    driver, database = neo4j_driver(request.get("neo4j"))
    with driver:
        driver.verify_connectivity()
        # A generation id this project does not own is a refusal, not an empty
        # answer: "not loaded" would read as "nothing there" when in fact the
        # name belongs to someone else.
        assert_generation_owned(driver, database, project_key, generation_id)
        present = [row["generation_id"] for row in generation_rows(driver, database, project_key)]
        if generation_id not in present:
            return {"status": "not_loaded", "code": "generation_not_materialized", "rule": rule,
                    "project_key": project_key, "generation_id": generation_id,
                    "generations_present": present, "applied": False, "edges": []}
        rows = [dict(record) for record in run_query(driver, database, LINK_SCAN_QUERY,
                                                     generation=generation_id, project=project_key,
                                                     pattern=pattern_text)]
        candidates = link_candidates(rows, identifiers, project_key, generation_id, pattern)
        counted = lambda: (run_query(driver, database, LINK_COUNT_QUERY, rows=candidates, rule=rule,
                                     generation=generation_id, project=project_key)[0]["n"] if candidates else 0)
        existing = counted()
        created = 0
        if apply_edges and candidates:
            run_query(driver, database, LINK_MERGE_QUERY, rows=candidates, rule=rule,
                      generation=generation_id, project=project_key)
            created = counted() - existing
        return {"status": "ok", "rule": rule, "relationship": LINK_RELATIONSHIP, "pattern": pattern_text,
                "project_key": project_key, "generation_id": generation_id, "applied": apply_edges,
                "counts": {"identifiers": len(identifiers), "scanned": len(rows),
                           "candidates": len(candidates), "created": created, "existing": existing},
                "edges": [{key: row[key] for key in ("token", "source_unit_id", "source_doc_key",
                                                     "target_doc_key")} for row in candidates],
                "packages": package_versions()}


# ---------------------------------------------------------------------------
# Related evidence: an inferred edge between two chunks. A local model proposed
# the relation and the APP checked both quotes against both texts before asking
# for it; nothing here judges anything. Like the explicit reference it is an
# addition to the derived projection and is rebuilt with the generation.
# ---------------------------------------------------------------------------

RELATED_MERGE_QUERY = (
    "UNWIND $rows AS row "
    "MATCH (a:" + CHUNK_LABEL + ") WHERE a.sf_doc_key = row.a_doc_key AND a.sf_unit_id = row.a_unit_id "
    "AND a.sf_generation = $generation AND a.sf_project = $project "
    "MATCH (b:" + CHUNK_LABEL + ") WHERE b.sf_doc_key = row.b_doc_key AND b.sf_unit_id = row.b_unit_id "
    "AND b.sf_generation = $generation AND b.sf_project = $project "
    "MERGE (a)-[r:" + RELATED_RELATIONSHIP + " {sf_rule: $rule, sf_judgement_id: row.judgement_id, "
    "sf_generation: $generation, sf_project: $project}]->(b) "
    "SET r += row.properties "
    "RETURN count(r) AS n"
)

RELATED_COUNT_QUERY = (
    "UNWIND $rows AS row "
    "MATCH (a:" + CHUNK_LABEL + ")-[r:" + RELATED_RELATIONSHIP + "]->(b:" + CHUNK_LABEL + ") "
    "WHERE a.sf_doc_key = row.a_doc_key AND a.sf_unit_id = row.a_unit_id AND a.sf_project = $project "
    "AND b.sf_doc_key = row.b_doc_key AND b.sf_unit_id = row.b_unit_id AND b.sf_project = $project "
    "AND r.sf_rule = $rule AND r.sf_judgement_id = row.judgement_id AND r.sf_generation = $generation "
    "AND r.sf_project = $project "
    "RETURN count(r) AS n"
)


def related_rows(value):
    """The related-evidence rows this request may write, checked for shape only.

    Both ends must be a unit of this generation and this project (the database
    match enforces that too), the relation kind must be one this rule links, and
    the judgement id must be a digest, so a repeat of the same judgement merges
    onto the same edge instead of adding another.
    """
    if not isinstance(value, list) or not value or len(value) > MAX_RELATED_ROWS:
        raise WorkerError("graph_related_request_invalid")
    rows = []
    for row in value:
        if not isinstance(row, dict):
            raise WorkerError("graph_related_request_invalid")
        keys = ("a_doc_key", "a_unit_id", "b_doc_key", "b_unit_id", "judgement_id", "relation_kind",
                "direction", "evidence_a_unit", "evidence_b_unit", "prompt_sha256", "model", "model_pin")
        if any(key not in row for key in keys):
            raise WorkerError("graph_related_request_invalid")
        if not DIGEST.match(str(row["a_doc_key"])) or not DIGEST.match(str(row["b_doc_key"])):
            raise WorkerError("graph_related_request_invalid")
        if not TOKEN.match(str(row["a_unit_id"])) or not TOKEN.match(str(row["b_unit_id"])):
            raise WorkerError("graph_related_request_invalid")
        if not DIGEST.match(str(row["judgement_id"])) or not DIGEST.match(str(row["prompt_sha256"])):
            raise WorkerError("graph_related_request_invalid")
        if row["relation_kind"] not in RELATED_KINDS or row["direction"] not in RELATED_DIRECTIONS:
            raise WorkerError("graph_related_kind_unknown")
        if (row["a_doc_key"], row["a_unit_id"]) == (row["b_doc_key"], row["b_unit_id"]):
            raise WorkerError("graph_related_request_invalid")
        for key in ("evidence_a_unit", "evidence_b_unit", "model", "model_pin"):
            if not isinstance(row[key], str) or not row[key] or len(row[key]) > 200:
                raise WorkerError("graph_related_request_invalid")
        rows.append({"a_doc_key": row["a_doc_key"], "a_unit_id": row["a_unit_id"],
                     "b_doc_key": row["b_doc_key"], "b_unit_id": row["b_unit_id"],
                     "judgement_id": row["judgement_id"],
                     "properties": {"sf_relation_kind": row["relation_kind"], "sf_direction": row["direction"],
                                    "sf_evidence_a_unit": row["evidence_a_unit"],
                                    "sf_evidence_b_unit": row["evidence_b_unit"],
                                    "sf_prompt_sha256": row["prompt_sha256"], "sf_model": row["model"],
                                    "sf_model_pin": row["model_pin"], "sf_claim_state": "inferred",
                                    "sf_review_state": "unreviewed"}})
    rows.sort(key=lambda item: (item["a_doc_key"], item["a_unit_id"], item["b_doc_key"], item["b_unit_id"]))
    return rows


def link_related_evidence(request):
    """Adds the checked related-evidence edges to the generation this database holds.

    `apply: false` reads and returns what is already there without writing. The
    merge key is the rule, the judgement digest, the generation and the project, so
    the same judgement run twice finds its own edge and creates none. Nodes are
    never merged, relabelled or given a property: each chunk stays the chunk its
    own document produced, which is what a citation reads back.
    """
    project_key, generation_id = request.get("project_key"), request.get("generation_id")
    if not isinstance(project_key, str) or not project_key or len(project_key) > 512:
        raise WorkerError("graph_related_request_invalid")
    if not TOKEN.match(str(generation_id or "")):
        raise WorkerError("graph_related_request_invalid")
    if request.get("rule") != RELATED_RULE:
        raise WorkerError("graph_related_rule_unknown")
    apply_edges = request.get("apply")
    if not isinstance(apply_edges, bool):
        raise WorkerError("graph_related_request_invalid")
    rows = related_rows(request.get("relations"))

    driver, database = neo4j_driver(request.get("neo4j"))
    with driver:
        driver.verify_connectivity()
        # A generation id this project does not own is a refusal, not an empty
        # answer: "not loaded" would read as "nothing there" when in fact the
        # name belongs to someone else.
        assert_generation_owned(driver, database, project_key, generation_id)
        present = [row["generation_id"] for row in generation_rows(driver, database, project_key)]
        if generation_id not in present:
            return {"status": "not_loaded", "code": "generation_not_materialized", "rule": RELATED_RULE,
                    "project_key": project_key, "generation_id": generation_id,
                    "generations_present": present, "applied": False, "edges": []}
        counted = lambda: run_query(driver, database, RELATED_COUNT_QUERY, rows=rows, rule=RELATED_RULE,
                                    generation=generation_id, project=project_key)[0]["n"]
        existing = counted()
        created = 0
        if apply_edges:
            run_query(driver, database, RELATED_MERGE_QUERY, rows=rows, rule=RELATED_RULE,
                      generation=generation_id, project=project_key)
            created = counted() - existing
        return {"status": "ok", "rule": RELATED_RULE, "relationship": RELATED_RELATIONSHIP,
                "project_key": project_key, "generation_id": generation_id, "applied": apply_edges,
                "counts": {"requested": len(rows), "created": created, "existing": existing},
                "edges": [{"a_doc_key": row["a_doc_key"], "a_unit_id": row["a_unit_id"],
                           "b_doc_key": row["b_doc_key"], "b_unit_id": row["b_unit_id"],
                           "judgement_id": row["judgement_id"],
                           "relation_kind": row["properties"]["sf_relation_kind"],
                           "direction": row["properties"]["sf_direction"]} for row in rows],
                "packages": package_versions()}


# Seed chunk plus the chunks its entities reach over one extracted edge, the
# chunks of a document one of those entities names outright (rule L1), and the
# chunk a checked related-evidence edge names (rule R1). Lexical edges are
# excluded from the first hop so expansion follows meaning, not document order.
# Expansion is one hop: nothing a reached chunk reaches is followed. A chunk is
# returned once, seeded if any seed of this search was it; a seed keeps its own
# vector score even when another seed also reaches it, so the order among seeds is
# the vector order. Only a reached chunk inherits a score, and it inherits the best
# of the seeds that reached it. `tier` says which rule reached it first (the
# related-evidence chunk a relation names outright before a cited document's other
# chunks) and `relevance` is that chunk's own distance to this question, which the
# caller uses to choose within its inflow budget -- never as the score it reports.
GRAPH_EXPANSION_QUERY = (
    "WITH node, score "
    "WHERE node.sf_generation = $generation AND node.sf_project = $project "
    "OPTIONAL MATCH (node)<-[:FROM_CHUNK]-(entity) "
    "OPTIONAL MATCH (entity)-[edge]-(neighbour) "
    "WHERE NOT type(edge) IN $lexical AND neighbour.sf_generation = $generation "
    "AND neighbour.sf_project = $project "
    "OPTIONAL MATCH (neighbour)-[:FROM_CHUNK]->(other) "
    "WHERE other.sf_generation = $generation AND other.sf_project = $project AND other:" + CHUNK_LABEL + " "
    "WITH node, score, collect(DISTINCT other) AS others "
    "OPTIONAL MATCH (node)<-[:FROM_CHUNK]-(:" + ENTITY_LABEL + ")-[:" + LINK_RELATIONSHIP + "]->"
    "(cited:" + DOCUMENT_LABEL + ")<-[:FROM_DOCUMENT]-(quoted:" + CHUNK_LABEL + ") "
    "WHERE 'L1' IN $rules AND cited.sf_generation = $generation AND quoted.sf_generation = $generation "
    "AND cited.sf_project = $project AND quoted.sf_project = $project "
    "WITH node, score, others, collect(DISTINCT quoted) AS cited_chunks "
    "OPTIONAL MATCH (node)-[:" + RELATED_RELATIONSHIP + "]-(related:" + CHUNK_LABEL + ") "
    "WHERE 'R1' IN $rules AND related.sf_generation = $generation AND related.sf_project = $project "
    "WITH node, score, others, cited_chunks, collect(DISTINCT related) AS related_chunks "
    "UNWIND ([{chunk: node, tier: -1}] + [c IN others | {chunk: c, tier: 2}] "
    "+ [c IN cited_chunks | {chunk: c, tier: 1}] + [c IN related_chunks | {chunk: c, tier: 0}]) AS reached "
    "WITH node, score, reached.chunk AS chunk, reached.tier AS tier "
    "WITH chunk.sf_unit_id AS sf_unit_id, chunk.sf_doc_key AS sf_doc_key, "
    "chunk.sf_generation AS sf_generation, chunk.text AS text, score, tier, "
    "CASE WHEN chunk." + EMBEDDING_PROPERTY + " IS NULL THEN null "
    "ELSE vector.similarity.cosine(chunk." + EMBEDDING_PROPERTY + ", $query_vector) END AS relevance, "
    "CASE WHEN chunk.sf_unit_id = node.sf_unit_id AND chunk.sf_doc_key = node.sf_doc_key "
    "THEN 1 ELSE 0 END AS seeded "
    "WITH sf_unit_id, sf_doc_key, sf_generation, text, max(seeded) AS seeded_max, max(relevance) AS relevance, "
    "max(CASE WHEN seeded = 1 THEN score END) AS own_score, "
    "max(CASE WHEN seeded = 0 THEN score END) AS reached_score, "
    "min(CASE WHEN seeded = 0 THEN tier END) AS reached_tier "
    "RETURN sf_unit_id, sf_doc_key, sf_generation, text, relevance, "
    "coalesce(own_score, reached_score) AS score, seeded_max = 1 AS seed, "
    "CASE WHEN seeded_max = 1 THEN null ELSE reached_tier END AS tier "
    "ORDER BY seed DESC, score DESC, sf_unit_id"
)


def expansion_request(value):
    """This search's expansion budget: the defaults, lowered by the request only."""
    if value is None:
        value = {}
    if not isinstance(value, dict):
        raise WorkerError("graph_retrieve_request_invalid")
    rules = value.get("enabled_rules", list(EXPANSION_RULES))
    if not isinstance(rules, list) or any(rule not in EXPANSION_RULES for rule in rules) or len(set(rules)) != len(rules):
        raise WorkerError("graph_retrieve_request_invalid")
    limits = dict(EXPANSION_DEFAULTS)
    for key, bound in EXPANSION_DEFAULTS.items():
        given = value.get(key)
        if given is None:
            continue
        if not isinstance(given, int) or isinstance(given, bool) or given < 0 or given > bound:
            raise WorkerError("graph_retrieve_request_invalid")
        limits[key] = given
    return sorted(rules), limits


def apply_expansion(rows, limits):
    """The seeds in the order the vector search gave them, then the inflow it earned.

    Seeds are never dropped or reordered here: they are the search. Inflow is taken
    by the rule that reached it first (a relation naming the chunk outright before a
    cited document's other chunks), then by that chunk's own relevance to this
    question, and it is bounded three ways -- per target document, in total, and by
    what is left of the final row count. Whatever the bounds leave out is counted by
    the bound that left it out, so a missing piece of evidence is visible rather than
    silently absent.
    """
    seeds = [row for row in rows if row.get("seed")]
    inflow = [row for row in rows if not row.get("seed")]
    inflow.sort(key=lambda row: (row.get("tier") if row.get("tier") is not None else len(EXPANSION_VIA),
                                 -(row.get("relevance") or 0.0), -(row.get("score") or 0.0),
                                 str(row.get("sf_doc_key")), str(row.get("sf_unit_id"))))
    truncated = {"seed_limit": max(0, len(seeds) - limits["final_limit"]),
                 "per_document": 0, "expansion_limit": 0, "final_limit": 0}
    per_document, taken = {}, []
    seeds = seeds[:limits["final_limit"]]
    for row in inflow:
        document = row.get("sf_doc_key")
        if per_document.get(document, 0) >= limits["per_document_limit"]:
            truncated["per_document"] += 1
        elif len(taken) >= limits["expansion_limit"]:
            truncated["expansion_limit"] += 1
        elif len(seeds) + len(taken) >= limits["final_limit"]:
            truncated["final_limit"] += 1
        else:
            per_document[document] = per_document.get(document, 0) + 1
            taken.append(row)
    truncated["total"] = sum(truncated.values())
    return seeds + taken, {"seeds": len(seeds), "inflow": len(taken),
                           "candidates": len(rows), "truncated": truncated}

def escape_lucene(text):
    """`text` with every Lucene reserved character escaped, so it searches as itself.

    A question the Owner types is not a search expression: `10/30` starts a regex to
    Lucene's parser and fails the whole query, and `SON-84` reads as a NOT. Escaping
    turns those back into literal characters. Only the fulltext half needs this --
    the vector half embeds the question exactly as written.
    """
    return "".join("\\" + character if character in LUCENE_SPECIAL else character
                   for character in text)


RETURN_PROPERTIES = ["sf_unit_id", "sf_doc_key", "sf_generation", "text"]
CHUNK_COLUMNS = ("node.sf_unit_id AS sf_unit_id, node.sf_doc_key AS sf_doc_key, "
                 "node.sf_generation AS sf_generation, node.sf_project AS sf_project, "
                 "node.text AS text, score")

# The vector half with the project and the generation INSIDE the index: the rows
# it returns are already this scope's, so nothing has to be thrown away afterwards
# and a small project is not starved by a database full of other projects.
# Measured on this host's Neo4j 2026.02.3: two equality predicates joined by AND
# are accepted inside the parentheses. A WHERE after the closing parenthesis would
# be an ordinary post-filter wearing the same word.
SEARCH_IN_INDEX = (
    "CYPHER 25 MATCH (node:" + CHUNK_LABEL + ") "
    "SEARCH node IN (VECTOR INDEX " + VECTOR_INDEX + " FOR vector($query_vector, {dimensions}, FLOAT) "
    "WHERE node.sf_project = $project AND node.sf_generation = $generation LIMIT $seed_k) SCORE AS score "
)
# The same seeds from an index that declares no filter property (every index built
# before this change, including the per-project containers): ask the index for more
# than is wanted and drop what is out of scope. Both what was asked for and what
# survived are reported, so a starved search reads as one.
SEARCH_POST_FILTER = (
    "CALL db.index.vector.queryNodes($index, $raw_k, $query_vector) YIELD node, score "
    "WITH node, score WHERE node.sf_project = $project AND node.sf_generation = $generation "
    "WITH node, score ORDER BY score DESC LIMIT $seed_k "
)
FULLTEXT_QUERY = (
    "CALL db.index.fulltext.queryNodes($index, $text, {limit: $limit}) YIELD node, score "
    "RETURN " + CHUNK_COLUMNS + " ORDER BY score DESC"
)


def hit_from_row(row):
    """One database row as a hit, or None when it does not name a unit of a document.

    The expansion columns (`seed`, `tier`, `relevance`) are absent from a vector or
    hybrid row and null on a seed; they are read structurally here so a chunk's
    Korean text is never parsed back out of a rendered record.
    """
    if not isinstance(row, dict) or not row.get("sf_unit_id") or not row.get("sf_doc_key"):
        return None
    hit = {key: row.get(key) for key in RETURN_PROPERTIES}
    hit["score"] = row.get("score")
    hit["seed"] = bool(row["seed"]) if row.get("seed") is not None else None
    hit["tier"] = row["tier"] if isinstance(row.get("tier"), int) else None
    hit["relevance"] = float(row["relevance"]) if isinstance(row.get("relevance"), (int, float)) else None
    return hit


def normalise(rows):
    """Each half's scores divided by that half's own best, as the installed hybrid does.

    neo4j-graphrag's hybrid query normalises the vector rows by `max(score)` of the
    vector rows and the fulltext rows by `max(score)` of the fulltext rows, then
    keeps `max(score)` per node. That rule is reproduced here rather than invented,
    so a hybrid rank stays comparable with the ones taken before this change.
    """
    best = max((row["score"] for row in rows if isinstance(row.get("score"), (int, float))), default=0.0)
    if not best:
        return [{**row, "score": 0.0} for row in rows]
    return [{**row, "score": float(row["score"]) / best} for row in rows]


def retrieve(request):
    """vector, hybrid or graph search over one project's generation in this database.

    The database holds many projects. Every mode is therefore bound to a project
    and a generation, and that bound is applied where the rows are chosen -- inside
    the vector index when the index declares the filter properties -- rather than to
    whatever a search happened to return. Hits carry unit and document ids only; the
    APP joins them back to its own manifest, so nothing here decides what a hit means.
    """
    from neo4j_graphrag.embeddings import OllamaEmbeddings

    mode = request.get("mode")
    if mode not in ("vector", "hybrid", "graph"):
        raise WorkerError("graph_retrieve_mode_invalid")
    query_text = request.get("query_text")
    if not isinstance(query_text, str) or not query_text.strip():
        raise WorkerError("graph_retrieve_request_invalid")
    project_key = request.get("project_key")
    if not isinstance(project_key, str) or not project_key or len(project_key) > 512:
        raise WorkerError("graph_retrieve_request_invalid")
    generation_id = request.get("generation_id")
    if not TOKEN.match(str(generation_id or "")):
        raise WorkerError("graph_retrieve_request_invalid")
    whole_generation = request.get("whole_generation", False)
    if not isinstance(whole_generation, bool):
        raise WorkerError("graph_retrieve_request_invalid")
    top_k = request.get("top_k", 10)
    ceiling = MAX_WHOLE_GENERATION_TOP_K if whole_generation else MAX_TOP_K
    if not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 1 or top_k > ceiling:
        raise WorkerError("graph_retrieve_request_invalid")
    spec = request.get("embedder")
    if not isinstance(spec, dict) or not model_host_admitted(spec.get("host"), request.get("allowed_hosts") or []):
        raise WorkerError("embedder_endpoint_not_admitted")
    pin = asyncio.run(ollama_model_pin(spec["host"], spec["model"]))
    if not pin or pin.get("digest") is None:
        raise WorkerError("embedder_model_not_installed")
    digest = pin["digest"]
    rules, limits = expansion_request(request.get("expansion"))

    driver, database = neo4j_driver(request.get("neo4j"))
    with driver:
        driver.verify_connectivity()
        # A generation id this project does not own is a refusal, not an empty
        # answer: "not loaded" would read as "nothing there" when in fact the
        # name belongs to someone else.
        assert_generation_owned(driver, database, project_key, generation_id)
        present = [row["generation_id"] for row in generation_rows(driver, database, project_key)]
        if generation_id not in present:
            return {"status": "not_loaded", "code": "generation_not_materialized", "mode": mode,
                    "project_key": project_key, "generation_id": generation_id,
                    "generations_present": present, "hits": []}
        index = vector_index_row(driver, database)
        if index is None or index.get("dimensions") is None:
            raise WorkerError("graph_vector_index_missing")
        # The whole-generation ceiling is the generation itself: asking for more
        # rows than it holds is refused rather than quietly answered with fewer.
        held = chunk_count(driver, database, project_key, generation_id) if whole_generation else None
        if whole_generation and top_k > max(MAX_TOP_K, held):
            raise WorkerError("graph_retrieve_top_k_above_generation")

        embedder = OllamaEmbeddings(model=spec["model"], host=spec["host"])
        query_vector = list(embedder.embed_query(query_text))
        # A question embedded to a different width than the index was built at is a
        # silent miss on one path and a scan of every other project on the other.
        if len(query_vector) != index["dimensions"]:
            raise WorkerError("graph_query_vector_dimension_mismatch")

        in_index = list(VECTOR_FILTER_PROPERTIES) == list(index["filter_properties"])
        parameters = {"query_vector": query_vector, "project": project_key, "generation": generation_id,
                      "seed_k": top_k}
        if in_index:
            seed_clause = SEARCH_IN_INDEX.format(dimensions=index["dimensions"])
        else:
            seed_clause = SEARCH_POST_FILTER
            parameters["index"] = VECTOR_INDEX
            parameters["raw_k"] = min(MAX_WHOLE_GENERATION_TOP_K, top_k * SCOPE_OVERFETCH)

        vector_rows = [dict(row) for row in
                       run_query(driver, database, seed_clause + "RETURN " + CHUNK_COLUMNS + " ORDER BY score DESC",
                                 **parameters)]
        retrieval = {"filter_stage": "in_index_filter" if in_index else "post_filter",
                     "index_filter_properties": index["filter_properties"], "index_dimensions": index["dimensions"],
                     "vector_requested": parameters.get("raw_k", top_k), "vector_in_scope": len(vector_rows),
                     "vector_starved": (not in_index) and len(vector_rows) < top_k}

        expansion = None
        if mode == "vector":
            rows = vector_rows
        elif mode == "hybrid":
            # The fulltext index carries no filter property of any kind, so its half
            # always overfetches and is then cut to this scope. When everything it
            # returned belonged to other projects the half is starved, and that is
            # said rather than left to look like "these words are not in the corpus".
            limit = min(MAX_WHOLE_GENERATION_TOP_K, top_k * SCOPE_OVERFETCH)
            raw = run_query(driver, database, FULLTEXT_QUERY, index=FULLTEXT_INDEX,
                            text=escape_lucene(query_text), limit=limit)
            in_scope = [dict(row) for row in raw
                        if row["sf_project"] == project_key and row["sf_generation"] == generation_id]
            retrieval.update({"fulltext_requested": limit, "fulltext_retrieved": len(raw),
                              "fulltext_in_scope": len(in_scope),
                              "fulltext_starved": len(raw) >= limit and len(in_scope) < top_k})
            merged = {}
            for row in normalise(vector_rows) + normalise(in_scope):
                key = (row.get("sf_doc_key"), row.get("sf_unit_id"))
                if key not in merged or row["score"] > merged[key]["score"]:
                    merged[key] = row
            rows = sorted(merged.values(), key=lambda row: (-row["score"], str(row.get("sf_unit_id"))))[:top_k]
        else:
            # The expansion reads `$query_vector`, which is the same parameter the
            # seed search already carries: a chunk's distance to the question is
            # measured with the embedding that found the seeds, never a second one.
            rows = [dict(row) for row in
                    run_query(driver, database, seed_clause + GRAPH_EXPANSION_QUERY,
                              rules=rules, lexical=list(LEXICAL_RELATIONSHIPS), **parameters)]

        hits, dropped = [], 0
        for row in rows:
            hit = hit_from_row(row)
            # The indexes span the database, and the expansion follows edges: a row
            # outside this project's selected generation is not this view's, and is
            # dropped rather than relabelled. (The expansion already constrains both
            # in Cypher and returns no project column, so this is the second check.)
            if hit is None or row.get("sf_generation") not in (None, generation_id) \
                    or row.get("sf_project") not in (None, project_key):
                dropped += 1
                continue
            hits.append(hit)
        if mode == "graph":
            # The budget is applied after the scope filter, so a row this view does
            # not hold never takes an inflow place from one it does.
            hits, expansion = apply_expansion(hits, limits)
            expansion = {"enabled_rules": rules, "limits": limits, "seed_top_k": top_k, **expansion}
            for row in hits:
                row["via"] = "seed" if row.get("seed") else EXPANSION_VIA.get(row.get("tier"), "unknown")
        return {"status": "ok", "mode": mode, "project_key": project_key, "generation_id": generation_id,
                "top_k": top_k, "whole_generation": whole_generation, "chunks_in_generation": held,
                "embedder": {"model": spec["model"], "digest": digest},
                "hits": hits, "expansion": expansion, "retrieval": retrieval,
                "dropped_out_of_generation": dropped, "packages": package_versions()}


async def probe_models(models, allowed=None):
    found = {}
    for role in ("llm", "embedder"):
        spec = models.get(role)
        if not spec:
            continue
        if not model_host_admitted(spec.get("host"), allowed or []):
            raise WorkerError(role + "_endpoint_not_admitted")
        pin = await model_pin(spec["host"], spec["model"], spec.get("transport", "ollama"))
        if not pin or pin.get("digest") is None:
            raise WorkerError(role + "_model_not_installed")
        found[role] = {"model": spec["model"], **pin}
    return found


def probe(request):
    result = {"status": "ok", "python": sys.version.split()[0], "packages": package_versions(),
              "rules_sha256": extraction_rules_sha256()}
    neo4j_binding = request.get("neo4j")
    if not neo4j_binding:
        result["neo4j"] = {"status": "not_bound"}
    else:
        try:
            driver, database = neo4j_driver(neo4j_binding)
            with driver:
                driver.verify_connectivity()
                row = run_query(driver, database,
                                "CALL dbms.components() YIELD name, versions, edition "
                                "RETURN name AS name, versions[0] AS version, edition AS edition")[0]
                result["neo4j"] = {"status": "ok", "name": row["name"], "version": row["version"],
                                   "edition": row["edition"],
                                   "generations": [dict(r) for r in generation_rows(driver, database)]}
        except WorkerError:
            raise
        except Exception as error:  # never echo the address or the password path
            result["neo4j"] = {"status": "unreachable", "error_type": type(error).__name__}
    if request.get("models"):
        result["models"] = asyncio.run(probe_models(request["models"], request.get("allowed_hosts") or []))
    return result


def inspect(request):
    """What this database holds, per project. Read-only, no model call, no text.

    An inventory and a sync receipt both need the same three answers: which
    generation of which project is loaded, when it was loaded, and how much of it
    is there. They are read from the database rather than from a manifest, because
    "the store has a generation" and "the database holds it" are different claims.
    """
    driver, database = neo4j_driver(request.get("neo4j"))
    with driver:
        driver.verify_connectivity()
        projects = []
        for row in generation_rows(driver, database):
            scope = {"p": row["project_key"], "g": row["generation_id"]}
            counts = run_query(driver, database,
                               "MATCH (n) WHERE n.sf_project = $p AND n.sf_generation = $g "
                               "RETURN count(n) AS nodes", **scope)[0]["nodes"]
            chunks = run_query(driver, database,
                               "MATCH (c:" + CHUNK_LABEL + ") WHERE c.sf_project = $p AND c.sf_generation = $g "
                               "RETURN count(c) AS n, count(c." + EMBEDDING_PROPERTY + ") AS embedded", **scope)[0]
            edges = run_query(driver, database,
                              "MATCH ()-[r]->() WHERE r.sf_project = $p AND r.sf_generation = $g "
                              "RETURN type(r) AS type, count(r) AS n ORDER BY type", **scope)
            projects.append({"project_key": row["project_key"], "generation_id": row["generation_id"],
                             "loaded_at": row["loaded_at"], "nodes": counts, "chunks": chunks["n"],
                             "embedded_chunks": chunks["embedded"],
                             "rule_edges": {edge["type"]: edge["n"] for edge in edges}})
        total = run_query(driver, database, "MATCH (n) RETURN count(n) AS n")[0]["n"]
        unscoped = run_query(driver, database,
                             "MATCH (n) WHERE n.sf_project IS NULL AND NOT n:" + MATERIALIZE_LOCK_LABEL
                             + " RETURN count(n) AS n")[0]["n"]
        locked = run_query(driver, database,
                           "MATCH (l:" + MATERIALIZE_LOCK_LABEL + ") "
                           "RETURN l.project_key AS project_key, toString(l.taken_at) AS taken_at")
        return {"status": "ok", "projects": projects, "total_nodes": total, "unscoped_nodes": unscoped,
                "residue_nodes": residue_count(driver, database),
                "materialize_lock": [dict(row) for row in locked],
                "indexes": {"vector": vector_index_row(driver, database), "fulltext": FULLTEXT_INDEX},
                "packages": package_versions()}


def main():
    raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    if len(raw) > MAX_REQUEST_BYTES:
        raise WorkerError("request_too_large")
    request = json.loads(raw.decode("utf-8"))
    if request.get("schema_version") != WORKER_SCHEMA:
        raise WorkerError("request_schema_invalid")
    operation = request.get("operation")
    if operation == "probe":
        return probe(request)
    if operation == "inspect":
        return inspect(request)
    if operation == "extract":
        # The rules hash is added here rather than inside `extract`, because
        # `extract` is one of the functions it hashes: reporting a revision must
        # not be able to change the revision it reports.
        return {**asyncio.run(extract(request)), "rules_sha256": extraction_rules_sha256()}
    if operation == "materialize":
        return materialize(request)
    if operation == "embed":
        return asyncio.run(embed_chunks(request))
    if operation == "link_explicit_refs":
        return link_explicit_refs(request)
    if operation == "link_related_evidence":
        return link_related_evidence(request)
    if operation == "retrieve":
        return retrieve(request)
    raise WorkerError("operation_unknown")


if __name__ == "__main__":
    try:
        code, payload = 0, json.dumps(main(), ensure_ascii=True, sort_keys=True, allow_nan=False)
    except WorkerError as error:
        code, payload = 3, json.dumps({"status": "error", "code": error.code}, sort_keys=True)
    except Exception as error:  # never echo request content or paths
        code, payload = 4, json.dumps({"status": "error", "code": "worker_failed", "error_type": type(error).__name__},
                                      sort_keys=True)
    # ASCII bytes on the raw buffer: a Korean Windows pipe would otherwise
    # re-encode the text as cp949 and every chunk would stop matching its unit.
    sys.stdout.buffer.write(payload.encode("ascii"))
    sys.stdout.buffer.flush()
    sys.exit(code)
