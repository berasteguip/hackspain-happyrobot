# Railway despliega `api/`, que además sirve `web/gps` y `web/dashboard`.
#
# Se usa Dockerfile en vez de Nixpacks a propósito: en la raíz del repo no hay ningún marcador
# de Python (requirements.txt, pyproject.toml y main.py cuelgan de api/) y sí hay un
# package-lock.json huérfano, así que la detección automática construía una imagen de Node y
# fallaba con `pip: not found`.
FROM python:3.12-slim

WORKDIR /app

COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

# El repo entero, no solo api/: settings.py resuelve REPO_ROOT como el padre de api/, y de ahí
# cuelgan `data/scenarios` (el escenario) y `web/` (las dos páginas que sirve la API).
COPY . .

WORKDIR /app/api

# ${PORT:-8000} en vez de $PORT a secas: si Railway no inyecta la variable, uvicorn recibiría
# `--port` sin valor y el proceso no arrancaría.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
