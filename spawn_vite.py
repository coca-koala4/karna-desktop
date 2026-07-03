#!/usr/bin/env python
"""
Karna dev server launcher (Phase 1.3 helper).
Uses subprocess.Popen with absolute node.exe path to avoid PowerShell-watch
PATH resolution issues that break Node's child_process.spawn('node', ...).
"""
import subprocess, sys, os, time, socket, signal

PORT = int(os.environ.get('SMOKE_VITE_PORT', '5174'))
HOST = '127.0.0.1'
NODE_EXE = r'C:\Users\26873\.workbuddy\binaries\node\versions\22.22.2\node.exe'
VITE_ENTRY = r'D:\Agent\projects\karna-hermes\node_modules\vite\bin\vite.js'
DESKTOP_DIR = r'D:\Agent\projects\karna-hermes\apps\desktop'

def main():
    if len(sys.argv) > 1 and sys.argv[1] == 'wait':
        # wait mode: poll for the port to open, then exit
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                s = socket.socket(); s.settimeout(0.5)
                s.connect((HOST, PORT))
                s.close()
                print(f'OK port {PORT} is open')
                return 0
            except Exception:
                time.sleep(0.5)
        print(f'FAIL port {PORT} did not open within 60s')
        return 1

    if len(sys.argv) > 1 and sys.argv[1] == 'spawn':
        log = open('C:/Users/26873/vite_spawn.log', 'wb')
        proc = subprocess.Popen(
            [NODE_EXE, VITE_ENTRY, '--host', HOST, '--port', str(PORT), '--strictPort'],
            cwd=DESKTOP_DIR,
            stdout=log, stderr=subprocess.STDOUT,
            stdin=subprocess.DEVNULL,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        print(f'spawned PID={proc.pid} PORT={PORT}')
        return 0

    if len(sys.argv) > 1 and sys.argv[1] == 'kill':
        # find and kill any node on PORT
        try:
            r = subprocess.run(['netstat','-ano','-p','TCP'], capture_output=True, text=True, timeout=5)
            for line in r.stdout.splitlines():
                if f':{PORT}' in line and 'LISTENING' in line:
                    pid = line.split()[-1]
                    subprocess.run(['taskkill','/F','/PID',pid], capture_output=True)
                    print(f'killed PID {pid} on {PORT}')
        except Exception as e:
            print(f'kill error: {e}')
        return 0

    print(__doc__)
    return 1

if __name__ == '__main__':
    sys.exit(main() or 0)
