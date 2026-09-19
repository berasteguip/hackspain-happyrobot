#!/usr/bin/env python3
"""Mock de api/ para desarrollar web/gps/ sin la API real.
Implementa POST /positions y GET /instructions/{person_id} del contrato
(docs/06-producto/03-contrato-de-datos.md). Uso: python3 mock-api.py [puerto]
"""
import json
import os
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

API_KEY = os.environ.get("MOCK_API_KEY", "dev-secret-mock")
INSTRUCTIONS = [
    "Salga por la ZA-P-2434 hacia Tábara. No coja la N-631.",
    "El fuego ha cortado la N-631. Gira a la izquierda en la próxima bifurcación.",
    "Sigue al Seat León blanco de Antonio, es tu coche guía.",
    "Está cerca del Tábara (CRA León Felipe). Sigue todo recto 800 metros.",
]


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "content-type,x-api-key")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

    def _json(self, code, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _authorized(self):
        return self.headers.get("x-api-key") == API_KEY

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path.split("?")[0] != "/positions":
            self._json(404, {"ok": False, "error": "not_found"})
            return
        if not self._authorized():
            self._json(401, {"ok": False, "error": "unauthorized"})
            return
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            point = json.loads(raw)
        except ValueError:
            self._json(400, {"ok": False, "error": "invalid_json"})
            return
        print("[mock-api] POST /positions ->", json.dumps(point))
        self._json(200, {"ok": True, "state_version": 1, "decisions": []})

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/health":
            self._json(200, {"ok": True, "state_version": 1, "people_count": 0, "uptime_s": 0})
            return
        if path.startswith("/instructions/"):
            if not self._authorized():
                self._json(401, {"ok": False, "error": "unauthorized"})
                return
            person_id = path[len("/instructions/"):]
            idx = int(time.time() // 20) % len(INSTRUCTIONS)
            self._json(200, {
                "instruction": INSTRUCTIONS[idx],
                "exit_name": "Tábara (CRA León Felipe)",
                "route_summary": "7.4 km, 11 min",
                "convoy": None,
                "urgency": "media",
                "minutes_to_front": 18.0,
                "say_this": INSTRUCTIONS[idx],
                "person_id": person_id,
            })
            return
        self._json(404, {"ok": False, "error": "not_found"})

    def log_message(self, fmt, *args):
        print("[mock-api]", fmt % args)


if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print("mock-api escuchando en http://localhost:%d (API_KEY=%s)" % (port, API_KEY))
    print("Instrucción cambia cada 20 s, ciclando %d mensajes." % len(INSTRUCTIONS))
    HTTPServer(("0.0.0.0", port), Handler).serve_forever()
