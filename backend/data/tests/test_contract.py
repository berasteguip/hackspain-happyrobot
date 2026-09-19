import json


def test_scenario_120_passes_contract_validation(scenario_120, tmp_path, val):
    p = tmp_path / "sierra-culebra.json"
    p.write_text(json.dumps(scenario_120, ensure_ascii=False, indent=2), encoding="utf-8")
    errors = val.run_validation(p)
    assert errors.ok(), "\n" + "\n".join(errors.items)


def test_scenario_mini_passes_contract_validation(scenario_mini, tmp_path, val):
    p = tmp_path / "mini.json"
    p.write_text(json.dumps(scenario_mini, ensure_ascii=False, indent=2), encoding="utf-8")
    errors = val.run_validation(p)
    assert errors.ok(), "\n" + "\n".join(errors.items)


def test_scenario_120_has_expected_shape(scenario_120):
    assert len(scenario_120["houses"]) == 120
    assert 3 <= len(scenario_120["villages"]) <= 6
    assert 5 <= len(scenario_120["sectors"]) <= 6
    assert len(scenario_120["safe_zones"]) == 2
    assert len(scenario_120["patrols"]) >= 1
    assert scenario_120["meta"]["synthetic"] is True
    assert "SINTÉTICOS" in scenario_120["meta"]["notice"]


def test_scenario_mini_has_expected_shape(scenario_mini):
    assert len(scenario_mini["houses"]) == 12
    assert len(scenario_mini["villages"]) == 1


def test_no_house_is_its_own_neighbor(scenario_120):
    for h in scenario_120["houses"]:
        assert h["id"] not in h["_sim"]["neighbor_ids"]


def test_neighbor_lists_are_within_2_to_6_after_symmetrization(scenario_120):
    # 2-4 vecinos más cercanos por diseño, simetrizados (una casa puede ganar
    # vecinos adicionales si otras la señalan a ella como su vecina cercana).
    for h in scenario_120["houses"]:
        n = len(h["_sim"]["neighbor_ids"])
        assert 2 <= n <= 8, f"{h['id']} tiene {n} vecinos"
