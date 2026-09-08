"""M02 transport tests use synthetic bodies and ephemeral loopback servers only."""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
import threading
import urllib.request

import pytest

from soulforge_secure_work.adapters import AdapterUnavailable, LocalManagerAdapter


@contextmanager
def local_server(*, redirect=None, status=200, malformed=False, ipv6=False, truncated=False):
    calls = []

    class Handler(BaseHTTPRequestHandler):
        def handle_request(self):
            body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
            calls.append((self.command, self.path, body))
            self.send_response(status if redirect is None else redirect[0])
            if redirect is not None:
                self.send_header("Location", redirect[1])
            if truncated:
                self.send_header("Content-Length", "10000")
            self.end_headers()
            payload = {"data": [{"id": "synthetic-model"}]} if self.command == "GET" else {
                "choices": [{"message": {"content": "synthetic-answer"}, "finish_reason": "stop"}]}
            self.wfile.write(b"not-json" if malformed else json.dumps(payload).encode())

        do_GET = handle_request
        do_POST = handle_request

        def log_message(self, *args):
            pass

    class IPv6Server(ThreadingHTTPServer):
        address_family = socket.AF_INET6

    server = IPv6Server(("::1", 0), Handler) if ipv6 else ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host = "[::1]" if ipv6 else "127.0.0.1"
        yield f"http://{host}:{server.server_port}", calls
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


def manager(url, model="auto", enabled=True):
    return LocalManagerAdapter(url, model, timeout_s=2, enabled=enabled)


@pytest.mark.parametrize("suffix", ["", "/v1", "/v1/"])
def test_real_loopback_get_and_post(suffix):
    with local_server() as (url, calls):
        adapter = manager(url + suffix)
        assert adapter.probe().state == "AVAILABLE"
        assert adapter.propose("synthetic-prompt") == ("synthetic-model", "synthetic-answer", "stop")
        assert [call[0] for call in calls] == ["GET", "GET", "POST"]
        assert calls[-1][1] == suffix.rstrip("/") + "/chat/completions"
        assert json.loads(calls[-1][2])["messages"][-1]["content"] == "synthetic-prompt"


@pytest.mark.parametrize("url", [
    "http://example.invalid/v1", "http://localhost/v1", "http://localhost./v1",
    "http://192.0.2.1/v1", "http://0.0.0.0/v1", "http://[::]/v1",
    "http://[::ffff:127.0.0.1]/v1", "file:" "///v1", "ftp://127.0.0.1/v1",
    "//127.0.0.1/v1", "http://127.1/v1", "http://2130706433/v1",
    "http://0177.0.0.1/v1", "http://127.0.0.1.example.invalid/v1",
    "http://user:synthetic@127.0.0.1/v1", "http://@127.0.0.1/v1",
    "http://127.0.0.1:0/v1", "http://127.0.0.1:65536/v1", "http://127.0.0.1:/v1",
    "http://127.0.0.1:abc/v1", "http://127.0.0.1/v1?x=y", "http://127.0.0.1/v1#x",
    "http://127.0.0.1/v1?", "http://127.0.0.1/v1#", "http://127.0.0.1//v1",
    "http://127.0.0.1/v1/../proxy", "http://127.0.0.1/%76%31", "http://127.0.0.1/proxy",
    " http://127.0.0.1/v1", "http://127.0.0.1/\nv1", "http://127.0.0.1\\@example.invalid/v1",
    "http://[::1%25zone]/v1",
])
@pytest.mark.parametrize("model", ["auto", "synthetic-model"])
def test_unsafe_url_rejected_before_any_transport(monkeypatch, url, model):
    def forbidden(*args, **kwargs):
        pytest.fail("unsafe endpoint reached transport")

    monkeypatch.setattr(urllib.request, "urlopen", forbidden)
    monkeypatch.setattr(urllib.request.OpenerDirector, "open", forbidden)
    adapter = manager(url, model)
    assert adapter.probe().state == "UNAVAILABLE"
    with pytest.raises(AdapterUnavailable):
        adapter.propose("synthetic-prompt")


@pytest.mark.parametrize("code", [301, 302, 303, 307, 308])
@pytest.mark.parametrize("model", ["auto", "synthetic-model"])
def test_redirect_never_reaches_second_listener(code, model):
    with local_server() as (target, target_calls):
        with local_server(redirect=(code, target + "/redirected")) as (url, calls):
            adapter = manager(url + "/v1", model)
            assert adapter.probe().state == "UNAVAILABLE"
            with pytest.raises(AdapterUnavailable):
                adapter.propose("synthetic-prompt")
            assert len(calls) == 2
            assert target_calls == []


def test_proxy_environment_and_global_opener_cannot_route_requests(monkeypatch):
    with local_server() as (proxy, proxy_calls):
        for key in ("http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
            monkeypatch.setenv(key, proxy)
        monkeypatch.setenv("no_proxy", "")
        monkeypatch.setenv("NO_PROXY", "")
        # A global urllib opener is also ambient process state, not M02 authority.
        monkeypatch.setattr(urllib.request, "_opener", urllib.request.build_opener(
            urllib.request.ProxyHandler({"http": proxy, "https": proxy})))
        with local_server() as (url, calls):
            adapter = manager(url + "/v1")
            assert adapter.probe().state == "AVAILABLE"
            assert adapter.propose("synthetic-prompt")[1] == "synthetic-answer"
            assert len(calls) == 3
            assert proxy_calls == []


@pytest.mark.parametrize("options", [{"status": 503}, {"malformed": True}, {"truncated": True}])
def test_local_failure_is_explicit(options):
    with local_server(**options) as (url, calls):
        adapter = manager(url + "/v1", "synthetic-model")
        assert adapter.probe().state == "UNAVAILABLE"
        with pytest.raises(AdapterUnavailable):
            adapter.propose("synthetic-prompt")
        assert len(calls) == 2


def test_base_url_rechecked_between_calls(monkeypatch):
    with local_server() as (url, calls):
        adapter = manager(url + "/v1", "synthetic-model")
        assert adapter.probe().state == "AVAILABLE"
        def forbidden(*args, **kwargs):
            pytest.fail("changed unsafe endpoint reached transport")

        monkeypatch.setattr(urllib.request, "urlopen", forbidden)
        monkeypatch.setattr(urllib.request.OpenerDirector, "open", forbidden)
        adapter.base_url = "http://example.invalid/v1"
        with pytest.raises(AdapterUnavailable):
            adapter.propose("synthetic-prompt")
        assert len(calls) == 1


def test_real_ipv6_loopback_get_and_post():
    with local_server(ipv6=True) as (url, calls):
        adapter = manager(url + "/v1")
        assert adapter.probe().state == "AVAILABLE"
        assert adapter.propose("synthetic-prompt")[1] == "synthetic-answer"
        assert [call[0] for call in calls] == ["GET", "GET", "POST"]


@pytest.mark.parametrize("path", ["//example.invalid", "/models?next=x", "/other", "/../models"])
def test_unapproved_operation_path_is_rejected_without_request(path):
    with local_server() as (url, calls):
        with pytest.raises(AdapterUnavailable):
            manager(url + "/v1")._get(path)
        assert calls == []


def test_disabled_direct_get_is_also_rejected():
    with local_server() as (url, calls):
        with pytest.raises(AdapterUnavailable, match="disabled"):
            manager(url, enabled=False)._get("/models")
        assert calls == []


@pytest.mark.parametrize("error", [TimeoutError(), OSError("synthetic-connection-failure")])
def test_transport_failure_is_sanitized_and_never_falls_back(monkeypatch, error):
    attempts = []

    def failing_open(self, request, **kwargs):
        attempts.append(request.method)
        raise error

    monkeypatch.setattr(urllib.request.OpenerDirector, "open", failing_open)
    adapter = manager("http://127.0.0.1:1/v1", "synthetic-model")
    assert adapter.probe().state == "UNAVAILABLE"
    with pytest.raises(AdapterUnavailable) as raised:
        adapter.propose("synthetic-prompt")
    assert raised.value.reason == type(error).__name__
    assert attempts == ["GET", "POST"]


def test_https_keeps_verified_default_context(monkeypatch):
    contexts = []
    original = urllib.request.HTTPSHandler.__init__

    def record_context(self, *args, **kwargs):
        contexts.append(kwargs.get("context"))
        original(self, *args, **kwargs)

    def stop_before_connect(self, request, **kwargs):
        assert request.full_url == "https://127.0.0.1/v1/models"
        raise TimeoutError

    monkeypatch.setattr(urllib.request.HTTPSHandler, "__init__", record_context)
    monkeypatch.setattr(urllib.request.OpenerDirector, "open", stop_before_connect)
    assert manager("https://127.0.0.1/v1").probe().state == "UNAVAILABLE"
    assert contexts == [None]
