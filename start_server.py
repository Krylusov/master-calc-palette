"""Run Master Calc locally, with no third-party Python dependencies."""
import argparse
import functools
import http.server
from pathlib import Path
import webbrowser

parser = argparse.ArgumentParser(description='Master Calc v2 Палитра — локальный запуск')
parser.add_argument('--no-browser', action='store_true')
parser.add_argument('--port', type=int, default=8766)
args = parser.parse_args()
root = Path(__file__).resolve().parent
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
server = http.server.ThreadingHTTPServer(('127.0.0.1', args.port), handler)
url = f'http://127.0.0.1:{server.server_port}/'
print(f'Master Calc: {url}', flush=True)
print('Для завершения нажмите Ctrl+C.', flush=True)
if not args.no_browser:
    webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
