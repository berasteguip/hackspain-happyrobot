# Railway despliega `api/`, que además sirve `web/gps` y `web/dashboard`.
#
# Se usa Dockerfile en vez de Nixpacks a propósito: en la raíz del repo no hay ningún marcador
# de Python (requirements.txt, pyproject.toml y main.py cuelgan de api/) y sí hay un
# package-lock.json huérfano, así que la detección automática construía una imagen de Node y
# fallaba con `pip: not found`.
# Etapa 1: router (Vite + React). Se construye aquí para no depender de que alguien se acuerde
# de subir el `dist/` al repo, y para que `npm run build` corra con la misma versión siempre.
FROM node:22-slim AS router
WORKDIR /build

# El token publico de Mapbox se incrusta al compilar: Vite sustituye
# import.meta.env.VITE_MAPBOX_TOKEN en `npm run build`, no en ejecucion. Sin esto la imagen
# sale sin token y todo el que abra la plataforma se encuentra la pantalla que lo pide, que
# es justo la friccion que no queremos en una demo. Railway lo pasa desde las variables del
# servicio (las de build llegan como ARG si estan declaradas aqui); en local:
#   docker build --build-arg VITE_MAPBOX_TOKEN=pk.xxx .
# Si falta, la app sigue funcionando: cae en pedirlo por pantalla como hasta ahora.
ARG VITE_MAPBOX_TOKEN=""
ENV VITE_MAPBOX_TOKEN=$VITE_MAPBOX_TOKEN

COPY apps/command-center/package.json apps/command-center/package-lock.json ./
RUN npm ci
COPY apps/command-center/ ./
RUN npm run build

# Etapa 2: la API, que además sirve router, la página del ciudadano y el dashboard.
FROM python:3.12-slim

WORKDIR /app

COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

# El repo entero, no solo api/: settings.py resuelve REPO_ROOT como el padre de api/, y de ahí
# cuelgan `data/scenarios` (el escenario) y `web/` (las dos páginas que sirve la API).
COPY . .
COPY --from=router /build/dist /app/apps/command-center/dist

WORKDIR /app/api

# ${PORT:-8000} en vez de $PORT a secas: si Railway no inyecta la variable, uvicorn recibiría
# `--port` sin valor y el proceso no arrancaría.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
