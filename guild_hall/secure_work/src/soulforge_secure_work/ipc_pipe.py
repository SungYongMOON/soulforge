"""Local Windows byte pipes, kernel peer identity and bounded nonblocking I/O.

No multiprocessing.Connection/pickle, sockets, inherited stdio authority or
caller-provided identity claims. The transient pipe DACL is created together
with the object; this module changes no account, file ACL or registered task.
"""
from __future__ import annotations

import ctypes as C
from ctypes import wintypes as W
import os
import re
import time


class ChannelError(RuntimeError):
    def __init__(self, code="SECURE_WORK_CHANNEL_HOLD"):
        super().__init__(code)


def remaining(deadline):
    value = deadline - time.monotonic()
    if value <= 0:
        raise ChannelError("CHANNEL_DEADLINE")
    return value


def _api():
    if os.name != "nt":
        raise ChannelError("CHANNEL_PLATFORM_UNSUPPORTED")
    kernel, adv = C.WinDLL("kernel32", use_last_error=True), C.WinDLL("advapi32", use_last_error=True)
    signatures = [(kernel, "CreateNamedPipeW", W.HANDLE, [W.LPCWSTR, W.DWORD, W.DWORD, W.DWORD, W.DWORD, W.DWORD, W.DWORD, C.c_void_p]),
        (kernel, "CreateFileW", W.HANDLE, [W.LPCWSTR, W.DWORD, W.DWORD, C.c_void_p, W.DWORD, W.DWORD, W.HANDLE]),
        (kernel, "ConnectNamedPipe", W.BOOL, [W.HANDLE, C.c_void_p]),
        (kernel, "DisconnectNamedPipe", W.BOOL, [W.HANDLE]),
        (kernel, "ReadFile", W.BOOL, [W.HANDLE, C.c_void_p, W.DWORD, C.POINTER(W.DWORD), C.c_void_p]),
        (kernel, "WriteFile", W.BOOL, [W.HANDLE, C.c_void_p, W.DWORD, C.POINTER(W.DWORD), C.c_void_p]),
        (kernel, "SetNamedPipeHandleState", W.BOOL, [W.HANDLE, C.POINTER(W.DWORD), C.c_void_p, C.c_void_p]),
        (kernel, "GetNamedPipeServerProcessId", W.BOOL, [W.HANDLE, C.POINTER(W.ULONG)]),
        (kernel, "OpenProcess", W.HANDLE, [W.DWORD, W.BOOL, W.DWORD]),
        (kernel, "GetCurrentProcess", W.HANDLE, []), (kernel, "GetCurrentThread", W.HANDLE, []),
        (kernel, "CloseHandle", W.BOOL, [W.HANDLE]), (kernel, "LocalFree", C.c_void_p, [C.c_void_p]),
        (adv, "OpenProcessToken", W.BOOL, [W.HANDLE, W.DWORD, C.POINTER(W.HANDLE)]),
        (adv, "OpenThreadToken", W.BOOL, [W.HANDLE, W.DWORD, W.BOOL, C.POINTER(W.HANDLE)]),
        (adv, "GetTokenInformation", W.BOOL, [W.HANDLE, C.c_int, C.c_void_p, W.DWORD, C.POINTER(W.DWORD)]),
        (adv, "ConvertSidToStringSidW", W.BOOL, [C.c_void_p, C.POINTER(W.LPWSTR)]),
        (adv, "ConvertStringSecurityDescriptorToSecurityDescriptorW", W.BOOL, [W.LPCWSTR, W.DWORD, C.POINTER(C.c_void_p), C.POINTER(W.DWORD)]),
        (adv, "ImpersonateNamedPipeClient", W.BOOL, [W.HANDLE]), (adv, "RevertToSelf", W.BOOL, [])]
    for dll, name, result, args in signatures:
        function = getattr(dll, name)
        function.restype, function.argtypes = result, args
    return kernel, adv


def _sid(token, kernel, adv):
    size = W.DWORD()
    adv.GetTokenInformation(token, 1, None, 0, C.byref(size))
    if not 1 <= size.value <= 65536:
        raise ChannelError()
    buf = C.create_string_buffer(size.value)
    if not adv.GetTokenInformation(token, 1, buf, size, C.byref(size)):
        raise ChannelError()
    sid_pointer = C.cast(buf, C.POINTER(C.c_void_p))[0]
    value = W.LPWSTR()
    if not adv.ConvertSidToStringSidW(sid_pointer, C.byref(value)):
        raise ChannelError()
    try:
        return value.value
    finally:
        kernel.LocalFree(C.cast(value, C.c_void_p))


def _process_sid(process, kernel, adv):
    token = W.HANDLE()
    if not adv.OpenProcessToken(process, 8, C.byref(token)):
        raise ChannelError("CHANNEL_PEER_IDENTITY_UNAVAILABLE")
    try:
        return _sid(token, kernel, adv)
    finally:
        kernel.CloseHandle(token)


def current_sid():
    kernel, adv = _api()
    return _process_sid(kernel.GetCurrentProcess(), kernel, adv)


def _name(name, sid):
    if not isinstance(name, str) or not re.fullmatch(r"soulforge-secure-[a-z0-9-]{16,80}", name):
        raise ChannelError("CHANNEL_BINDING_INVALID")
    if not isinstance(sid, str) or not re.fullmatch(r"S-1-[0-9]+(?:-[0-9]+)+", sid):
        raise ChannelError("CHANNEL_IDENTITY_UNBOUND")
    return "\\\\.\\pipe\\" + name


class Pipe:
    def __init__(self, handle, kernel, adv, deadline, server=False):
        self.handle, self.kernel, self.adv, self.deadline = handle, kernel, adv, deadline
        self.server = server

    @classmethod
    def connect(cls, name, expected_sid, deadline):
        kernel, adv = _api()
        endpoint = _name(name, expected_sid)
        while True:
            remaining(deadline)
            # SECURITY_SQOS_PRESENT | SECURITY_IDENTIFICATION: server can query
            # client identity, but cannot use the client token to act as it.
            handle = kernel.CreateFileW(endpoint, 0xC0000000, 0, None, 3, 0x110000, None)
            if handle != C.c_void_p(-1).value:
                break
            if C.get_last_error() not in (2, 231):
                raise ChannelError("CHANNEL_CONNECT_REFUSED")
            time.sleep(min(.005, remaining(deadline)))
        pipe = cls(handle, kernel, adv, deadline)
        try:
            mode = W.DWORD(1)  # PIPE_NOWAIT; all I/O owns one absolute deadline.
            if not kernel.SetNamedPipeHandleState(handle, C.byref(mode), None, None):
                raise ChannelError()
            pid = W.ULONG()
            if not kernel.GetNamedPipeServerProcessId(handle, C.byref(pid)):
                raise ChannelError("CHANNEL_PEER_IDENTITY_UNAVAILABLE")
            process = kernel.OpenProcess(0x1000, False, pid.value)
            if not process:
                raise ChannelError("CHANNEL_PEER_IDENTITY_UNAVAILABLE")
            try:
                actual = _process_sid(process, kernel, adv)
            finally:
                kernel.CloseHandle(process)
            if actual != expected_sid:
                raise ChannelError("CHANNEL_PEER_MISMATCH")
            pipe.write(b"SFX1")  # no identity or business data before server authentication
            return pipe
        except BaseException:
            pipe.close()
            raise

    @classmethod
    def listen(cls, name, expected_sid, deadline, *, ready=None):
        kernel, adv = _api()
        endpoint = _name(name, expected_sid)
        own = current_sid()
        class SecurityAttributes(C.Structure):
            _fields_ = [("length", W.DWORD), ("descriptor", C.c_void_p), ("inherit", W.BOOL)]
        descriptor = C.c_void_p()
        # Protected DACL, only current role and exact peer. No remote clients.
        sddl = "D:P" + "".join("(A;;GRGW;;;" + sid + ")" for sid in sorted({own, expected_sid}))
        if not adv.ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, C.byref(descriptor), None):
            raise ChannelError()
        try:
            attrs = SecurityAttributes(C.sizeof(SecurityAttributes), descriptor, False)
            handle = kernel.CreateNamedPipeW(endpoint, 3 | 0x80000, 1 | 8, 1, 65536, 65536, 0, C.byref(attrs))
        finally:
            kernel.LocalFree(descriptor)
        if handle == C.c_void_p(-1).value:
            raise ChannelError("CHANNEL_LISTEN_REFUSED")
        pipe = cls(handle, kernel, adv, deadline, True)
        try:
            if ready:
                ready()  # test receipt notification only, never an identity verifier
            while not kernel.ConnectNamedPipe(handle, None):
                error = C.get_last_error()
                if error == 535:  # ERROR_PIPE_CONNECTED
                    break
                if error != 536:  # ERROR_PIPE_LISTENING
                    raise ChannelError("CHANNEL_CONNECT_REFUSED")
                time.sleep(min(.005, remaining(deadline)))
            if pipe.read(4) != b"SFX1":
                raise ChannelError("CHANNEL_PROTOCOL_INVALID")
            if not adv.ImpersonateNamedPipeClient(handle):
                raise ChannelError("CHANNEL_PEER_IDENTITY_UNAVAILABLE")
            token = W.HANDLE()
            try:
                if not adv.OpenThreadToken(kernel.GetCurrentThread(), 8, True, C.byref(token)):
                    raise ChannelError("CHANNEL_PEER_IDENTITY_UNAVAILABLE")
                actual = _sid(token, kernel, adv)
            finally:
                if token:
                    kernel.CloseHandle(token)
                # Failing to revert must terminate this isolated process.
                if not adv.RevertToSelf():
                    os._exit(72)
            if actual != expected_sid:
                raise ChannelError("CHANNEL_PEER_MISMATCH")
            return pipe
        except BaseException:
            pipe.close()
            raise

    def read(self, size):
        result = bytearray()
        while len(result) < size:
            remaining(self.deadline)
            buf = C.create_string_buffer(min(size - len(result), 65536))
            count = W.DWORD()
            ok = self.kernel.ReadFile(self.handle, buf, len(buf), C.byref(count), None)
            if count.value:
                result.extend(buf.raw[:count.value])
            elif not ok and C.get_last_error() not in (232, 536):
                raise ChannelError("CHANNEL_CLOSED")
            else:
                time.sleep(min(.005, remaining(self.deadline)))
        return bytes(result)

    def write(self, body):
        offset = 0
        while offset < len(body):
            remaining(self.deadline)
            chunk = body[offset:offset + 65536]
            count = W.DWORD()
            if not self.kernel.WriteFile(self.handle, chunk, len(chunk), C.byref(count), None):
                if C.get_last_error() != 232:
                    raise ChannelError("CHANNEL_CLOSED")
            offset += count.value
            if not count.value:
                time.sleep(min(.005, remaining(self.deadline)))

    def close(self):
        if self.handle is not None:
            # No FlushFileBuffers: an unresponsive peer must not extend deadline.
            self.kernel.CloseHandle(self.handle)
            self.handle = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()
