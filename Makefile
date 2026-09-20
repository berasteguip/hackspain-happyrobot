# HackSpain 2026 · Track HappyRobot · Equipo router123
# Arranque de cada componente. Contrato entre ellos: docs/06-producto/03-contrato-de-datos.md
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
.PHONY: help check env install api engine dashboard gps data sim test demo ensayo reset router stop clean

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
	@for d in api engine data sim; do \
	  if [ -f $$d/requirements.txt ]; then \
	    echo "--- $$d"; \
	    $(UV) venv --python 3.12 $$d/.venv -q; \
	    $(UV) pip install --python $$d/.venv/bin/python -r $$d/requirements.txt -q || echo "  FALLO en $$d (mira su README)"; \
	  else echo "--- $$d: sin requirements.txt, salto"; fi; \
	done

api: ## Arranca la API del estado de crisis (puerto 8000)
	cd api && .venv/bin/python -m uvicorn main:app --reload --port $(API_PORT)

engine: ## Lanza el motor de escenario contra la API
	cd engine && .venv/bin/python -m engine.run --scenario scenarios/$(SCENARIO).yaml --time-scale $(TIME_SCALE) 2>/dev/null \
	  || .venv/bin/python run.py --scenario scenarios/$(SCENARIO).yaml --time-scale $(TIME_SCALE)

dashboard: ## Sirve el dashboard del puesto de mando (puerto 8080)
	@echo "Dashboard en http://localhost:$(DASH_PORT)"
	cd web/dashboard && python3 -m http.server $(DASH_PORT)

gps: ## Sirve la pagina de ubicacion (puerto 8081)
	@echo "GPS en http://localhost:$(GPS_PORT)?p=p-001"
	@echo "OJO: en un movil por IP local el navegador DENIEGA el GPS (hace falta HTTPS)."
	@echo "     Usa un tunel: cloudflared tunnel --url http://localhost:$(GPS_PORT)"
	cd web/gps && python3 -m http.server $(GPS_PORT)

data: ## Regenera el dataset sintetico y lo valida
	cd data && .venv/bin/python generate.py --scenario $(SCENARIO) --seed $(SEED) --houses $(HOUSES) --out scenarios/$(SCENARIO).json
	cd data && .venv/bin/python validate.py scenarios/$(SCENARIO).json

router: ## Compila router (la API lo sirve en / cuando existe apps/command-center/dist)
	cd apps/command-center && npm ci && npm run build

ensayo: ## Arranca la API con el banco de pruebas de la Complutense (telefonos REALES del equipo)
	@echo "Escenario ucm-madrid: p-001..p-005 son el equipo (moviles reales via PHONE_OVERRIDES)."
	@echo "Los dos cerrojos siguen mandando: ALLOW_REAL_CALLS y CALL_ALLOWLIST."
	@echo "Circulo que coge exactamente al equipo: centro 40.45298 / -3.72695, radio 150 m."
	@echo ""
	cd api && SCENARIO=ucm-madrid .venv/bin/python -m uvicorn main:app --reload --port $(API_PORT)

reset: ## Vacia el tablero de llamadas. URL=... KEY=... al desplegado; TODO=1 recarga el escenario
	@python3 scripts/reset.py \
	  --url "$(or $(URL),http://localhost:$(API_PORT))" \
	  $(if $(KEY),--key "$(KEY)",) $(if $(TODO),--todo,)

sim: ## Corre el simulador de evacuacion y compara planes
	cd sim && .venv/bin/python -m sim.cli --scenario ../data/scenarios/$(SCENARIO).json --variants 200 --out out/

test: ## Corre los tests de todos los componentes
	@fail=0; for d in api engine data sim; do \
	  if [ -d $$d/tests ] && [ -x $$d/.venv/bin/python ]; then \
	    echo "=== $$d"; ( cd $$d && .venv/bin/python -m pytest -q ) || fail=1; \
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
	rm -rf */.venv */__pycache__ */**/__pycache__ .pytest_cache */.pytest_cache
	rm -f api/state.jsonl
	rm -rf sim/out
