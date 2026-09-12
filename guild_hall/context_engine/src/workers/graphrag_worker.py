# Context Engine GraphRAG worker (neo4j-graphrag). Reads one JSON request on
# stdin and writes one ASCII JSON result on stdout (the pipe encoding of the
# host never touches the text). It assembles the tool's own components (text
# chunks, chunk embedder, LLM entity/relation extractor, lexical graph, schema
# pruning, KG writer, vector/hybrid/graph retrievers) and adds only what the tool
# does not own: a local-model adapter with an explicit thinking switch, a call
# budget and an observable call trace, the installed model digests as the model
# revision, deterministic document and chunk ids, a plain fragment the APP can
# pin, and the rule that a database holds exactly one project's currently
# selected generation. It reads no keys or network locations by itself; every
# endpoint comes from the trusted APP adapter and must be a loopback address, and
# the only file it opens is the password file that adapter names.
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
# One database holds one project. These names are therefore fixed, not per project:
# a second project would be a second container, never a second index in this one.
GENERATION_LABEL = "__SfGeneration__"
CHUNK_LABEL = "Chunk"
VECTOR_INDEX = "sf_chunk_vector"
FULLTEXT_INDEX = "sf_chunk_fulltext"
EMBEDDING_PROPERTY = "embedding"
# Lexical edges are the graph's skeleton; expansion follows the extracted ones.
LEXICAL_RELATIONSHIPS = ("FROM_CHUNK", "FROM_DOCUMENT", "NEXT_CHUNK")
MAX_TOP_K = 50


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


async def installed_model_digest(host, model):
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
                return "sha256:" + match.group(1) if match else None
    return None


def think_value(value):
    if value is None or isinstance(value, bool) or value in ("low", "medium", "high"):
        return value
    raise WorkerError("llm_think_invalid")


def extractor_accepts(content):
    """The extractor's own parse of an answer: repair, load, then the graph model.

    It turns any failure into an empty chunk graph without saying so, so the
    adapter runs the same steps to count answers that carried no graph.
    """
    from neo4j_graphrag.components.entity_relation_extractor import fix_invalid_json
    from neo4j_graphrag.components.types import Neo4jGraph
    try:
        Neo4jGraph.model_validate(json.loads(fix_invalid_json(content)))
        return True
    except Exception:
        return False


def make_llm(llm_profile, client):
    from neo4j_graphrag.llm.base import LLMInterface
    from neo4j_graphrag.llm.types import LLMResponse

    max_calls = int(llm_profile.get("max_calls", 0))
    if max_calls < 1:
        raise WorkerError("llm_budget_invalid")
    body = {"model": llm_profile["model"], "format": "json", "stream": False,
            "options": dict(llm_profile.get("options") or {}), "keep_alive": llm_profile.get("keep_alive", "0s")}
    think = think_value(llm_profile.get("think", False))
    if think is not None:
        body["think"] = think

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
                response = await client.post("/api/chat", json={**body, "messages": [{"role": "user", "content": input}]})
                row["http_status"] = response.status_code
                response.raise_for_status()
                data = response.json()
                message = data.get("message") or {}
                content = message.get("content") or ""
                row.update({"status": "ok" if extractor_accepts(content) else "invalid_output",
                            "output_sha256": sha256_text(content), "output_characters": len(content),
                            "thinking_characters": len(message.get("thinking") or ""),
                            "done_reason": data.get("done_reason"), "prompt_tokens": data.get("prompt_eval_count"),
                            "output_tokens": data.get("eval_count")})
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
    if not loopback_url(llm_profile.get("host")):
        raise WorkerError("llm_endpoint_not_loopback")
    if embedder_profile and not loopback_url(embedder_profile.get("host")):
        raise WorkerError("embedder_endpoint_not_loopback")
    models = {"llm": {"model": llm_profile["model"],
                      "digest": await installed_model_digest(llm_profile["host"], llm_profile["model"])}}
    if models["llm"]["digest"] is None:
        raise WorkerError("llm_model_not_installed")
    embedder = None
    if embedder_profile:
        from neo4j_graphrag.embeddings import OllamaEmbeddings
        models["embedder"] = {"model": embedder_profile["model"],
                              "digest": await installed_model_digest(embedder_profile["host"], embedder_profile["model"])}
        if models["embedder"]["digest"] is None:
            raise WorkerError("embedder_model_not_installed")
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


# ---------------------------------------------------------------------------
# Graph database: one container, one project, one selected generation.
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


def generation_rows(driver, database):
    return run_query(driver, database,
                     "MATCH (g:" + GENERATION_LABEL + ") "
                     "RETURN g.project_key AS project_key, g.generation_id AS generation_id, "
                     "toString(g.loaded_at) AS loaded_at ORDER BY g.generation_id")


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


def ensure_indexes(driver, database, dimensions):
    from neo4j_graphrag.indexes import create_fulltext_index, create_vector_index
    if dimensions:
        create_vector_index(driver, VECTOR_INDEX, label=CHUNK_LABEL, embedding_property=EMBEDDING_PROPERTY,
                            dimensions=dimensions, similarity_fn="cosine", neo4j_database=database,
                            fail_if_exists=False)
    create_fulltext_index(driver, FULLTEXT_INDEX, label=CHUNK_LABEL, node_properties=["text"],
                          neo4j_database=database, fail_if_exists=False)
    run_query(driver, database, "CALL db.awaitIndexes(300)")


def embedding_dimensions(fragments):
    for fragment in fragments:
        for node in fragment["nodes"]:
            if node.get("embedding"):
                return len(node["embedding"])
    return 0


def materialize(request):
    """Loads one generation so the database holds exactly that generation.

    A repeat of the same generation changes nothing and says so. A different
    generation of the same project replaces the previous one: the graph is a derived,
    rebuildable projection of the project store, and two generations in one database
    would double every chunk. A database already holding another project is refused
    outright rather than merged.
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
        existing = generation_rows(driver, database)
        if any(row["project_key"] != project_key for row in existing):
            # One project per container: never merge, never delete another project's.
            raise WorkerError("graph_project_mismatch")
        if any(row["generation_id"] == generation_id for row in existing):
            counts = run_query(driver, database,
                               "MATCH (n) WHERE n.sf_generation = $g RETURN count(n) AS nodes", g=generation_id)
            return {"status": "ok", "loaded": False, "code": "generation_already_loaded",
                    "project_key": project_key, "generation_id": generation_id,
                    "counts": {"nodes": counts[0]["nodes"] if counts else 0},
                    "generations_present": [row["generation_id"] for row in existing]}
        if residue_count(driver, database):
            raise WorkerError("graph_residue_present")

        superseded = [row["generation_id"] for row in existing]
        removed = 0
        for old in superseded:
            rows = run_query(driver, database,
                             "MATCH (n) WHERE n.sf_generation = $g DETACH DELETE n RETURN count(n) AS n", g=old)
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

        dimensions = embedding_dimensions(fragments)
        ensure_indexes(driver, database, dimensions)

        chunks = run_query(driver, database,
                           "MATCH (c:" + CHUNK_LABEL + ") WHERE c.sf_generation = $g RETURN count(c) AS n",
                           g=generation_id)
        embedded = run_query(driver, database,
                             "MATCH (c:" + CHUNK_LABEL + ") WHERE c.sf_generation = $g AND c."
                             + EMBEDDING_PROPERTY + " IS NOT NULL RETURN count(c) AS n", g=generation_id)
        run_query(driver, database,
                  "CREATE (g:" + GENERATION_LABEL + " {project_key: $p, generation_id: $gen, "
                  "sf_project: $p, sf_generation: $gen, loaded_at: datetime()})",
                  p=project_key, gen=generation_id)
        return {"status": "ok", "loaded": True, "project_key": project_key, "generation_id": generation_id,
                "counts": {"fragments": len(fragments), "nodes": written["nodes"],
                           "relationships": written["relationships"], "stamped": stamped_count,
                           "chunks": chunks[0]["n"] if chunks else 0,
                           "embedded_chunks": embedded[0]["n"] if embedded else 0},
                "superseded": superseded, "removed_nodes": removed,
                "indexes": {"vector": VECTOR_INDEX if dimensions else None, "fulltext": FULLTEXT_INDEX,
                            "dimensions": dimensions},
                "packages": package_versions()}


# Seed chunk plus the chunks its entities reach over one extracted edge. Lexical
# edges are excluded so expansion follows meaning, not document order.
GRAPH_EXPANSION_QUERY = (
    "WITH node, score "
    "WHERE node.sf_generation = $generation "
    "OPTIONAL MATCH (node)<-[:FROM_CHUNK]-(entity) "
    "OPTIONAL MATCH (entity)-[edge]-(neighbour) "
    "WHERE NOT type(edge) IN $lexical AND neighbour.sf_generation = $generation "
    "OPTIONAL MATCH (neighbour)-[:FROM_CHUNK]->(other) "
    "WHERE other.sf_generation = $generation AND other:" + CHUNK_LABEL + " "
    "WITH node, score, collect(DISTINCT other) AS others "
    "UNWIND ([node] + others) AS chunk "
    "RETURN DISTINCT chunk.sf_unit_id AS sf_unit_id, chunk.sf_doc_key AS sf_doc_key, "
    "chunk.sf_generation AS sf_generation, chunk.text AS text, score, "
    "chunk.sf_unit_id = node.sf_unit_id AS seed "
    "ORDER BY seed DESC, score DESC"
)

RETURN_PROPERTIES = ["sf_unit_id", "sf_doc_key", "sf_generation", "text"]


def record_formatter(record):
    """Every retriever result as a plain dict of the fields this worker asked for.

    Without a formatter the tool renders a row as its repr and the fields would have
    to be parsed back out of a string -- which silently mangles non-ASCII text and
    truncates anything containing a quote. A formatter reads the record structurally
    instead, so a chunk's Korean text survives exactly as stored.

    Vector and hybrid searches return the properties inside a `node` map; the graph
    expansion returns them as top-level columns. Both shapes are read here.
    """
    from neo4j_graphrag.types import RetrieverResultItem
    data = dict(record)
    node = data.pop("node", None)
    row = {}
    if isinstance(node, dict):
        row.update({key: node.get(key) for key in RETURN_PROPERTIES})
    for key in RETURN_PROPERTIES:
        if key in data:
            row[key] = data[key]
    row["score"] = data.get("score")
    row["seed"] = bool(data["seed"]) if data.get("seed") is not None else None
    return RetrieverResultItem(content=row, metadata={"score": data.get("score")})


def hit_from_record(item):
    """One formatted item, or None when it does not name a unit of a document."""
    row = item.content
    if not isinstance(row, dict) or not row.get("sf_unit_id") or not row.get("sf_doc_key"):
        return None
    return row


def retrieve(request):
    """vector, hybrid or graph search over the generation this database holds.

    Every mode is bound to one generation: the vector and fulltext indexes are
    database-wide, so a hit from another generation would cross a selection the APP
    has already made. Hits carry unit and document ids only; the APP joins them back
    to its own manifest, so nothing here decides what a hit means.
    """
    from neo4j_graphrag.embeddings import OllamaEmbeddings
    from neo4j_graphrag.retrievers import HybridRetriever, VectorCypherRetriever, VectorRetriever

    mode = request.get("mode")
    if mode not in ("vector", "hybrid", "graph"):
        raise WorkerError("graph_retrieve_mode_invalid")
    query_text = request.get("query_text")
    if not isinstance(query_text, str) or not query_text.strip():
        raise WorkerError("graph_retrieve_request_invalid")
    generation_id = request.get("generation_id")
    if not TOKEN.match(str(generation_id or "")):
        raise WorkerError("graph_retrieve_request_invalid")
    top_k = request.get("top_k", 10)
    if not isinstance(top_k, int) or isinstance(top_k, bool) or top_k < 1 or top_k > MAX_TOP_K:
        raise WorkerError("graph_retrieve_request_invalid")
    spec = request.get("embedder")
    if not isinstance(spec, dict) or not loopback_url(spec.get("host")):
        raise WorkerError("embedder_endpoint_not_loopback")
    digest = asyncio.run(installed_model_digest(spec["host"], spec["model"]))
    if digest is None:
        raise WorkerError("embedder_model_not_installed")

    driver, database = neo4j_driver(request.get("neo4j"))
    with driver:
        driver.verify_connectivity()
        present = [row["generation_id"] for row in generation_rows(driver, database)]
        if generation_id not in present:
            return {"status": "not_loaded", "code": "generation_not_materialized", "mode": mode,
                    "generation_id": generation_id, "generations_present": present, "hits": []}
        embedder = OllamaEmbeddings(model=spec["model"], host=spec["host"])
        if mode == "graph":
            retriever = VectorCypherRetriever(driver, VECTOR_INDEX, GRAPH_EXPANSION_QUERY, embedder,
                                              result_formatter=record_formatter, neo4j_database=database)
            result = retriever.search(query_text=query_text, top_k=top_k,
                                      query_params={"generation": generation_id,
                                                    "lexical": list(LEXICAL_RELATIONSHIPS)})
        elif mode == "vector":
            retriever = VectorRetriever(driver, VECTOR_INDEX, embedder, return_properties=RETURN_PROPERTIES,
                                        result_formatter=record_formatter, neo4j_database=database)
            result = retriever.search(query_text=query_text, top_k=top_k)
        else:
            retriever = HybridRetriever(driver, VECTOR_INDEX, FULLTEXT_INDEX, embedder,
                                        return_properties=RETURN_PROPERTIES,
                                        result_formatter=record_formatter, neo4j_database=database)
            result = retriever.search(query_text=query_text, top_k=top_k)
        hits, dropped = [], 0
        for item in result.items:
            row = hit_from_record(item)
            # The indexes span the database; a hit outside the selected generation is
            # not this view's, and is dropped rather than relabelled.
            if row is None or row.get("sf_generation") not in (None, generation_id):
                dropped += 1
                continue
            hits.append(row)
        return {"status": "ok", "mode": mode, "generation_id": generation_id, "top_k": top_k,
                "embedder": {"model": spec["model"], "digest": digest},
                "hits": hits, "dropped_out_of_generation": dropped, "packages": package_versions()}


async def probe_models(models):
    found = {}
    for role in ("llm", "embedder"):
        spec = models.get(role)
        if not spec:
            continue
        if not loopback_url(spec.get("host")):
            raise WorkerError(role + "_endpoint_not_loopback")
        digest = await installed_model_digest(spec["host"], spec["model"])
        if digest is None:
            raise WorkerError(role + "_model_not_installed")
        found[role] = {"model": spec["model"], "digest": digest}
    return found


def probe(request):
    result = {"status": "ok", "python": sys.version.split()[0], "packages": package_versions()}
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
        result["models"] = asyncio.run(probe_models(request["models"]))
    return result


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
    if operation == "extract":
        return asyncio.run(extract(request))
    if operation == "materialize":
        return materialize(request)
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
