# Context Engine GraphRAG worker (neo4j-graphrag). Reads one JSON request on
# stdin and writes one ASCII JSON result on stdout (the pipe encoding of the
# host never touches the text). It assembles the tool's own components (text
# chunks, chunk embedder, LLM entity/relation extractor, lexical graph, schema
# pruning) and adds only what the tool does not own: a local-model adapter with
# an explicit thinking switch, a call budget and an observable call trace, the
# installed model digests as the model revision, deterministic document and
# chunk ids, and a plain fragment the APP can pin. It reads no files, keys or
# network locations by itself; every endpoint comes from the trusted APP adapter
# and must be a loopback address. Graph writes and search wait for a Neo4j
# binding and report that instead of pretending.
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
    """The installed model's manifest digest is the model revision; a tag alone is not."""
    wanted = model if ":" in model else model + ":latest"
    async with http_client(host) as client:
        response = await client.get("/api/tags")
        response.raise_for_status()
        for row in response.json().get("models") or []:
            if wanted in (row.get("name"), row.get("model")):
                match = DIGEST.match(str(row.get("digest") or ""))
                return "sha256:" + match.group(1) if match else None
    return None


def think_value(value):
    if value is None or isinstance(value, bool) or value in ("low", "medium", "high"):
        return value
    raise WorkerError("llm_think_invalid")


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
                row.update({"status": "ok", "output_sha256": sha256_text(content), "output_characters": len(content),
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
    fragments = []
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
            info = DocumentInfo(path=document["doc_key"], uid=document["doc_key"],
                                metadata={"sf_doc_key": document["doc_key"], "sf_title": str(document.get("title", ""))[:512]})
            graph = await extractor.run(chunks=text_chunks, document_info=info, schema=schema)
            pruned = await pruner.run(graph=graph, schema=schema)
            fragments.append(graph_to_fragment(pruned.graph, document, pruning_summary(pruned.pruning_stats)))
    calls = llm.trace
    return {"status": "ok", "fragments": fragments, "llm_calls": calls, "models": models,
            "budget_exhausted": any(row["status"] == "budget_exhausted" for row in calls),
            "llm_errors": sum(1 for row in calls if row["status"] == "error")}


def probe(request):
    result = {"status": "ok", "python": sys.version.split()[0], "packages": package_versions()}
    neo4j_binding = request.get("neo4j")
    result["neo4j"] = {"status": "not_bound"} if not neo4j_binding else {"status": "not_connected_in_this_slice"}
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
    if operation in ("materialize", "retrieve"):
        return {"status": "not_connected", "code": "neo4j_binding_not_connected", "operation": operation}
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
