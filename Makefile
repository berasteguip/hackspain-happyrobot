# HackSpain 2026 · Track HappyRobot · Equipo router123
# Arranque de cada componente. Contrato entre ellos: docs/06-producto/03-contrato-de-datos.md
#
# Árbol: backend/ (api, engine, sim, data)  frontend/ (dashboard, gps, command-center)
#        happyrobot/ (prompts, workflows)     docs/ (base de conocimiento)
#
# Requisito: Python 3.12+ (el python3 del sistema es 3.9 y no sirve) y uv.
#   brew install uv && uv python install 3.12

PY          := python3.12
UV          := uv
SCENARIO    ?= sierra-culebra
TIME_SCALE  ?= 60
SEED        ?= 42
HOUSES      ?= 120
API_PORT    ?= 8000
DASH_PORT   ?= 8080
GPS_PORT    ?= 8081

.DEFAULT_GOAL := help
BACKEND     := backend
FRONTEND    := frontend
PY_PKGS     := api engine data sim

.PHONY: help check env install api engine dashboard gps cecop video video-studio data sim test demo stop clean

help: ## Muestra esta ayuda
	@grep -hE '^[a-z-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*?## ' '{printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Orden para arrancar la demo, una pestaña por comando:"
	@echo "    1) make api        2) make dashboard    3) make engine"

check: ## Verifica que el entorno tiene lo que hace falta
	@command -v $(UV) >/dev/null || { echo "FALTA uv. Instala: brew install uv"; exit 1; }
	@command -v $(PY) >/dev/null || { echo "FALTA $(PY). Instala: uv python install 3.12"; exit 1; }
	@echo "OK $$($(PY) --version), uv $$($(UV) --version)"
	@test -f .env || echo "AVISO: no hay .env. Ejecuta 'make env' y rellénalo."

env: ## Crea .env a partir de .env.example (no sobrescribe)
	@test -f .env && echo ".env ya existe, no lo toco." || { cp .env.example .env; echo "Creado .env. Rellena HR_SHARED_SECRET y las claves."; }

install: check ## Crea los venv e instala dependencias de todos los componentes
	@for d in $(PY_PKGS); do \
	  p=$(BACKEND)/$$d; \
	  if [ -f $$p/requirements.txt ]; then \
	    echo "--- $$p"; \
	    $(UV) venv --python 3.12 $$p/.venv -q; \
	    ( cd $$p && $(UV) pip install --python .venv/bin/python -r requirements.txt -q ) || echo "  FALLO en $$p (mira su README)"; \
	  else echo "--- $$p: sin requirements.txt, salto"; fi; \
	done

api: ## Arranca la API del estado de crisis (puerto 8000)
	cd $(BACKEND)/api && .venv/bin/python -m uvicorn main:app --reload --port $(API_PORT)

engine: ## Lanza el motor de escenario contra la API
	cd $(BACKEND)/engine && .venv/bin/python run.py --scenario scenarios/$(SCENARIO).yaml --time-scale $(TIME_SCALE)

dashboard: ## Sirve el dashboard del puesto de mando (puerto 8080)
	@echo "Dashboard en http://localhost:$(DASH_PORT)"
	cd $(FRONTEND)/dashboard && python3 -m http.server $(DASH_PORT) --bind 127.0.0.1

gps: ## Sirve la pagina de ubicacion (puerto 8081)
	@echo "GPS en http://localhost:$(GPS_PORT)?p=p-001"
	@echo "OJO: en un movil por IP local el navegador DENIEGA el GPS (hace falta HTTPS)."
	@echo "     Usa un tunel: cloudflared tunnel --url http://localhost:$(GPS_PORT)"
	cd $(FRONTEND)/gps && python3 -m http.server $(GPS_PORT) --bind 127.0.0.1

cecop: ## Arranca el CECOP (Vite + React + Mapbox); pide token de Mapbox al abrir
	cd $(FRONTEND)/command-center && npm install && npm run dev

video: ## Renderiza el video del pitch (Remotion) en frontend/video/out/video.mp4
	cd $(FRONTEND)/video && npm install && npm run render

video-studio: ## Abre Remotion Studio para iterar el video escena a escena
	cd $(FRONTEND)/video && npm install && npm run dev

data: ## Regenera el dataset sintetico y lo valida
	cd $(BACKEND)/data && .venv/bin/python generate.py --scenario $(SCENARIO) --seed $(SEED) --houses $(HOUSES) --out scenarios/$(SCENARIO).json
	cd $(BACKEND)/data && .venv/bin/python validate.py scenarios/$(SCENARIO).json

sim: ## Corre el simulador de evacuacion y compara planes
	cd $(BACKEND)/sim && .venv/bin/python -m sim.cli --scenario ../data/scenarios/$(SCENARIO).json --variants 200 --out out/

test: ## Corre los tests de todos los componentes
	@fail=0; for d in $(PY_PKGS); do \
	  p=$(BACKEND)/$$d; \
	  if [ -d $$p/tests ] && [ -x $$p/.venv/bin/python ]; then \
	    echo "=== $$p"; ( cd $$p && .venv/bin/python -m pytest -q ) || fail=1; \
	  fi; \
	done; exit $$fail

demo: ## Recuerda la secuencia de la demo (no arranca nada)
	@echo "Antes:  make install && make env && make data && make test"
	@echo "Pestana 1: make api"
	@echo "Pestana 2: make dashboard   -> http://localhost:$(DASH_PORT)"
	@echo "Pestana 3: make gps         -> tunel HTTPS si se usa movil"
	@echo "Pestana 4: make engine      -> empieza a moverse el escenario"
	@echo ""
	@echo "ALLOW_REAL_CALLS sigue en $$(grep -E '^ALLOW_REAL_CALLS' .env 2>/dev/null || echo 'false (no hay .env)')"
	@echo "Ponlo a true SOLO en el momento de la demo."

stop: ## Mata los procesos de los puertos de la demo
	@for p in $(API_PORT) $(DASH_PORT) $(GPS_PORT); do \
	  pid=$$(lsof -ti tcp:$$p 2>/dev/null); \
	  [ -n "$$pid" ] && { echo "matando $$pid en puerto $$p"; kill $$pid; } || true; \
	done

clean: ## Borra venv, caches y artefactos (NO borra .env ni los escenarios)
	rm -rf $(BACKEND)/*/.venv .pytest_cache $(BACKEND)/*/.pytest_cache $(BACKEND)/*/*.egg-info
	find $(BACKEND) -name __pycache__ -type d -prune -exec rm -rf {} +
	rm -f $(BACKEND)/api/state.jsonl
	rm -rf $(BACKEND)/sim/out
