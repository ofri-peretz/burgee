"""
Run a program on a real terminal, with no dependency: `python pty-host.py <exe> [args...]`.

What the test writes to this script's stdin is typed at the terminal; what the terminal shows is
written to this script's stdout. When the program has gone, the last line on stderr is
`SIGNAL <n> CODE <m>`: the signal it died of (0 if none) and the code it exited with.

Two routes, both in the standard library, so nothing enters a lockfile (U1):

- POSIX (Linux, macOS): `pty.fork()` - the route `packages/burgee/src/pty-signal.test.ts`
  measured and chose over `script(1)` and `zsh/zpty`.
- Windows: a pseudo-console (ConPTY, `CreatePseudoConsole` in kernel32, Windows 10 1809 and
  later) through `ctypes`. The child is started with `STARTF_USESTDHANDLES` and null handles, as
  node-pty's own ConPTY agent does, so it takes the pseudo-console's handles rather than this
  script's redirected ones. Ctrl+C typed into a ConPTY is what a console delivers: a byte to a
  program in raw mode, a CTRL_C_EVENT to one in processed (cooked) mode.

The child's output is drained while it runs, or a child that fills the terminal's buffer blocks
forever and the test becomes a timeout with no explanation.
"""
import os
import sys
import threading
import time

DEADLINE_S = 30


def posix(argv):
    import pty
    import select

    pid, fd = pty.fork()
    if pid == 0:
        try:
            os.execv(argv[0], argv)
        finally:
            os._exit(127)
    started = time.monotonic()
    stdin_open = True
    status = None
    while True:
        watch = [fd] + ([0] if stdin_open else [])
        try:
            ready, _, _ = select.select(watch, [], [], 0.2)
        except (OSError, ValueError):
            break
        if fd in ready:
            try:
                data = os.read(fd, 4096)
            except OSError:
                data = b""
            if not data:
                break
            os.write(1, data)
        if stdin_open and 0 in ready:
            typed = os.read(0, 1024)
            if typed:
                os.write(fd, typed)
            else:
                stdin_open = False
        if status is None:
            done, status_now = os.waitpid(pid, os.WNOHANG)
            if done != 0:
                status = status_now
                # The child has gone; whatever it wrote is still in the master. One more pass reads it.
                continue
        elif fd not in ready:
            break
        if time.monotonic() - started > DEADLINE_S:
            os.kill(pid, 9)
    if status is None:
        _, status = os.waitpid(pid, 0)
    # Both halves of the wait status, separately: dying *of* a signal is not calling exit().
    sys.stderr.write("SIGNAL %d CODE %d\n" % (status & 0x7F, status >> 8))


def windows(argv):
    import ctypes
    import subprocess
    from ctypes import wintypes as w

    k32 = ctypes.WinDLL("kernel32", use_last_error=True)

    class COORD(ctypes.Structure):
        _fields_ = [("X", ctypes.c_short), ("Y", ctypes.c_short)]

    class STARTUPINFOW(ctypes.Structure):
        _fields_ = [
            ("cb", w.DWORD), ("lpReserved", w.LPWSTR), ("lpDesktop", w.LPWSTR), ("lpTitle", w.LPWSTR),
            ("dwX", w.DWORD), ("dwY", w.DWORD), ("dwXSize", w.DWORD), ("dwYSize", w.DWORD),
            ("dwXCountChars", w.DWORD), ("dwYCountChars", w.DWORD), ("dwFillAttribute", w.DWORD),
            ("dwFlags", w.DWORD), ("wShowWindow", w.WORD), ("cbReserved2", w.WORD),
            ("lpReserved2", ctypes.c_void_p), ("hStdInput", w.HANDLE), ("hStdOutput", w.HANDLE),
            ("hStdError", w.HANDLE),
        ]

    class STARTUPINFOEXW(ctypes.Structure):
        _fields_ = [("StartupInfo", STARTUPINFOW), ("lpAttributeList", ctypes.c_void_p)]

    class PROCESS_INFORMATION(ctypes.Structure):
        _fields_ = [("hProcess", w.HANDLE), ("hThread", w.HANDLE), ("dwProcessId", w.DWORD), ("dwThreadId", w.DWORD)]

    k32.CreatePipe.argtypes = [ctypes.POINTER(w.HANDLE), ctypes.POINTER(w.HANDLE), ctypes.c_void_p, w.DWORD]
    k32.CreatePipe.restype = w.BOOL
    k32.CreatePseudoConsole.argtypes = [COORD, w.HANDLE, w.HANDLE, w.DWORD, ctypes.POINTER(w.HANDLE)]
    k32.CreatePseudoConsole.restype = ctypes.c_long
    k32.ClosePseudoConsole.argtypes = [w.HANDLE]
    k32.ClosePseudoConsole.restype = None
    k32.InitializeProcThreadAttributeList.argtypes = [ctypes.c_void_p, w.DWORD, w.DWORD, ctypes.POINTER(ctypes.c_size_t)]
    k32.InitializeProcThreadAttributeList.restype = w.BOOL
    k32.UpdateProcThreadAttribute.argtypes = [ctypes.c_void_p, w.DWORD, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_size_t, ctypes.c_void_p, ctypes.c_void_p]
    k32.UpdateProcThreadAttribute.restype = w.BOOL
    k32.CreateProcessW.argtypes = [w.LPCWSTR, w.LPWSTR, ctypes.c_void_p, ctypes.c_void_p, w.BOOL, w.DWORD, ctypes.c_void_p, w.LPCWSTR, ctypes.POINTER(STARTUPINFOEXW), ctypes.POINTER(PROCESS_INFORMATION)]
    k32.CreateProcessW.restype = w.BOOL
    k32.ReadFile.argtypes = [w.HANDLE, ctypes.c_void_p, w.DWORD, ctypes.POINTER(w.DWORD), ctypes.c_void_p]
    k32.ReadFile.restype = w.BOOL
    k32.WriteFile.argtypes = [w.HANDLE, ctypes.c_void_p, w.DWORD, ctypes.POINTER(w.DWORD), ctypes.c_void_p]
    k32.WriteFile.restype = w.BOOL
    k32.WaitForSingleObject.argtypes = [w.HANDLE, w.DWORD]
    k32.WaitForSingleObject.restype = w.DWORD
    k32.GetExitCodeProcess.argtypes = [w.HANDLE, ctypes.POINTER(w.DWORD)]
    k32.GetExitCodeProcess.restype = w.BOOL
    k32.TerminateProcess.argtypes = [w.HANDLE, w.UINT]
    k32.TerminateProcess.restype = w.BOOL
    k32.CloseHandle.argtypes = [w.HANDLE]
    k32.CloseHandle.restype = w.BOOL

    def fail(what):
        raise OSError("pty-host: %s failed, error %d" % (what, ctypes.get_last_error()))

    def pipe():
        read, write = w.HANDLE(), w.HANDLE()
        if not k32.CreatePipe(ctypes.byref(read), ctypes.byref(write), None, 0):
            fail("CreatePipe")
        return read, write

    console_in, typed_in = pipe()  # we write `typed_in`; the pseudo-console reads `console_in`
    shown_out, console_out = pipe()  # the pseudo-console writes `console_out`; we read `shown_out`
    hpc = w.HANDLE()
    hr = k32.CreatePseudoConsole(COORD(120, 30), console_in, console_out, 0, ctypes.byref(hpc))
    if hr != 0:
        raise OSError("pty-host: CreatePseudoConsole returned 0x%08x" % (hr & 0xFFFFFFFF))
    # The pseudo-console holds its own duplicates; ours would keep the pipes open past its close.
    k32.CloseHandle(console_in)
    k32.CloseHandle(console_out)

    size = ctypes.c_size_t(0)
    k32.InitializeProcThreadAttributeList(None, 1, 0, ctypes.byref(size))
    attributes = ctypes.create_string_buffer(size.value)
    if not k32.InitializeProcThreadAttributeList(attributes, 1, 0, ctypes.byref(size)):
        fail("InitializeProcThreadAttributeList")
    PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016
    if not k32.UpdateProcThreadAttribute(attributes, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, hpc, ctypes.sizeof(w.HANDLE), None, None):
        fail("UpdateProcThreadAttribute")

    info = STARTUPINFOEXW()
    info.StartupInfo.cb = ctypes.sizeof(STARTUPINFOEXW)
    STARTF_USESTDHANDLES = 0x00000100
    info.StartupInfo.dwFlags = STARTF_USESTDHANDLES
    info.lpAttributeList = ctypes.cast(attributes, ctypes.c_void_p)
    process = PROCESS_INFORMATION()
    EXTENDED_STARTUPINFO_PRESENT = 0x00080000
    command = ctypes.create_unicode_buffer(subprocess.list2cmdline(argv))
    if not k32.CreateProcessW(None, command, None, None, False, EXTENDED_STARTUPINFO_PRESENT, None, None, ctypes.byref(info), ctypes.byref(process)):
        fail("CreateProcessW")

    def show():
        buffer = ctypes.create_string_buffer(4096)
        count = w.DWORD(0)
        while k32.ReadFile(shown_out, buffer, 4096, ctypes.byref(count), None) and count.value > 0:
            os.write(1, buffer.raw[: count.value])

    def type_in():
        while True:
            try:
                typed = os.read(0, 1024)
            except OSError:
                return
            if not typed:
                return
            written = w.DWORD(0)
            if not k32.WriteFile(typed_in, typed, len(typed), ctypes.byref(written), None):
                return

    reader = threading.Thread(target=show, daemon=True)
    reader.start()
    threading.Thread(target=type_in, daemon=True).start()

    WAIT_TIMEOUT = 0x00000102
    if k32.WaitForSingleObject(process.hProcess, DEADLINE_S * 1000) == WAIT_TIMEOUT:
        k32.TerminateProcess(process.hProcess, 9)
        k32.WaitForSingleObject(process.hProcess, 5000)
    code = w.DWORD(0)
    k32.GetExitCodeProcess(process.hProcess, ctypes.byref(code))
    # Closing the pseudo-console ends its output pipe, which ends the reader, once drained.
    time.sleep(0.5)
    k32.ClosePseudoConsole(hpc)
    reader.join(5)
    sys.stdout.flush()
    sys.stderr.write("SIGNAL 0 CODE %d\n" % code.value)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.stderr.write("usage: pty-host.py <exe> [args...]\n")
        sys.exit(2)
    (windows if os.name == "nt" else posix)(sys.argv[1:])
