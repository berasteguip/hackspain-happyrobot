import json


def _canonical(scenario):
    return json.dumps(scenario, ensure_ascii=False, sort_keys=False)


def test_same_seed_same_houses_gives_byte_identical_output(gen):
    s1 = gen.generate_scenario("sierra-culebra", 42, 120)
    s2 = gen.generate_scenario("sierra-culebra", 42, 120)
    assert _canonical(s1) == _canonical(s2)


def test_different_seed_gives_different_output(gen):
    s1 = gen.generate_scenario("sierra-culebra", 42, 120)
    s2 = gen.generate_scenario("sierra-culebra", 43, 120)
    assert _canonical(s1) != _canonical(s2)


def test_generated_at_is_fixed_reference_not_wall_clock(gen):
    # Si esto fuera datetime.now(), dos ejecuciones en instantes distintos
    # producirían ficheros distintos y rompería la reproducibilidad byte a byte.
    s1 = gen.generate_scenario("sierra-culebra", 42, 120)
    assert s1["meta"]["generated_at"] == gen.SCENARIO_REFERENCE_DATE
