import sys
from pathlib import Path

import pytest

DATA_DIR = Path(__file__).resolve().parent.parent
if str(DATA_DIR) not in sys.path:
    sys.path.insert(0, str(DATA_DIR))

import generate as generate_module  # noqa: E402
import validate as validate_module  # noqa: E402


@pytest.fixture(scope="session")
def scenario_120():
    """El escenario principal (mismos parámetros que se comitean en
    backend/data/scenarios/sierra-culebra.json)."""
    return generate_module.generate_scenario("sierra-culebra", 42, 120)


@pytest.fixture(scope="session")
def scenario_mini():
    """El escenario mini (mismos parámetros que backend/data/scenarios/mini.json)."""
    return generate_module.generate_scenario("mini", 7, 12)


@pytest.fixture
def gen():
    return generate_module


@pytest.fixture
def val():
    return validate_module
