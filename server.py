import os
import subprocess
import threading
import signal
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STREAMS_DIR = os.path.join(BASE_DIR, 'streams')

CAMERAS = [
    {
        'nombre': 'Sacos',
        'rtsp':   'rtsp://admin:envase_2025@10.52.4.133/Streaming/Channels/101',
        'salida': os.path.join(STREAMS_DIR, 'sacos.m3u8'),
        'segmento': os.path.join(STREAMS_DIR, 'sacos_%03d.ts'),
    },
    {
        'nombre': 'Pallets',
        'rtsp':   'rtsp://admin:envase_2025@10.52.4.146/Streaming/Channels/101',
        'salida': os.path.join(STREAMS_DIR, 'pallets.m3u8'),
        'segmento': os.path.join(STREAMS_DIR, 'pallets_%03d.ts'),
    },
]

procesos = []


def iniciar_ffmpeg(cam):
    cmd = [
        'ffmpeg', '-y',
        '-rtsp_transport', 'tcp',
        '-i', cam['rtsp'],
        '-c:v', 'copy',
        '-an',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '3',
        '-hls_flags', 'delete_segments+independent_segments',
        '-hls_segment_filename', cam['segmento'],
        cam['salida'],
    ]
    print(f"[{cam['nombre']}] Iniciando stream...")
    proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    procesos.append(proc)
    proc.wait()
    print(f"[{cam['nombre']}] FFmpeg terminó (código {proc.returncode})")


def detener_todo(sig=None, frame=None):
    print('\nDeteniendo todo...')
    for p in procesos:
        p.terminate()
    sys.exit(0)


class CORSHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Cache-Control', 'no-cache, no-store')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    os.makedirs(STREAMS_DIR, exist_ok=True)
    os.chdir(BASE_DIR)

    signal.signal(signal.SIGINT, detener_todo)
    signal.signal(signal.SIGTERM, detener_todo)

    for cam in CAMERAS:
        t = threading.Thread(target=iniciar_ffmpeg, args=(cam,), daemon=True)
        t.start()

    port = 8080
    server = HTTPServer(('0.0.0.0', port), CORSHandler)
    print(f'Servidor HLS activo en http://10.52.0.108:{port}/streams/')
    print('Presiona Ctrl+C para detener todo')
    server.serve_forever()
