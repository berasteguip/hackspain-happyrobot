"""Comprobaciones flojas de plausibilidad demográfica (comarca envejecida).
No fijan porcentajes exactos (es una generación estocástica), solo bandas
razonables alrededor de los objetivos del encargo."""


def _census_people(scenario):
    """Personas censadas (excluye visitantes de fin de semana no censados),
    que son las que representan la demografía oficial del pueblo."""
    return [p for p in scenario["people"] if not p["_sim"]["uncensored"]]


def test_over_65_share_is_plausible_for_aging_rural_area(scenario_120):
    people = _census_people(scenario_120)
    over_65 = sum(1 for p in people if p["_sim"]["age"] >= 65)
    share = over_65 / len(people)
    assert 0.35 <= share <= 0.60, f"% >=65 = {share:.1%}, fuera de banda plausible"


def test_reduced_or_immobile_mobility_share_is_plausible(scenario_120):
    people = _census_people(scenario_120)
    reduced_or_immobile = sum(1 for p in people if p["mobility"] in ("reduced", "immobile"))
    share = reduced_or_immobile / len(people)
    assert 0.10 <= share <= 0.35, f"% movilidad reducida/inmóvil = {share:.1%}"


def test_no_smartphone_share_is_plausible(scenario_120):
    people = _census_people(scenario_120)
    no_smartphone = sum(1 for p in people if not p["has_smartphone"])
    share = no_smartphone / len(people)
    assert 0.20 <= share <= 0.50, f"% sin smartphone = {share:.1%}"


def test_empty_second_residences_share_is_plausible(scenario_120):
    houses = scenario_120["houses"]
    empty = sum(
        1 for h in houses
        if h["_sim"]["is_second_residence"] and not h["_sim"]["currently_occupied"]
    )
    share = empty / len(houses)
    assert 0.03 <= share <= 0.15, f"% casas vacías = {share:.1%}"


def test_houses_with_uncensored_visitors_share_is_plausible(scenario_120):
    houses = scenario_120["houses"]
    with_visitors = sum(1 for h in houses if h["_sim"]["has_uncensored_visitors"])
    share = with_visitors / len(houses)
    assert 0.02 <= share <= 0.16, f"% casas con visitantes no censados = {share:.1%}"


def test_smartphone_probability_decreases_with_age(scenario_120):
    people = _census_people(scenario_120)
    young = [p for p in people if p["_sim"]["age"] < 50]
    old = [p for p in people if p["_sim"]["age"] >= 80]
    if young and old:
        young_rate = sum(1 for p in young if p["has_smartphone"]) / len(young)
        old_rate = sum(1 for p in old if p["has_smartphone"]) / len(old)
        assert young_rate > old_rate
