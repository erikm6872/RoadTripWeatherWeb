import pytest

from weather_codes import describe, assess_hazards


class TestDescribe:
    def test_known_codes(self):
        assert describe(0) == ("Clear sky", "☀️")
        assert describe(95) == ("Thunderstorm", "⛈️")

    def test_unknown_code_falls_back(self):
        assert describe(12345) == ("Unknown", "❓")

    def test_invalid_input_falls_back_without_raising(self):
        assert describe(None) == ("Unknown", "❓")
        assert describe("not-a-code") == ("Unknown", "❓")

    def test_covers_every_hazardous_code(self):
        hazard_codes = [45, 48, 56, 57, 65, 66, 67, 71, 73, 75, 77, 81, 82, 85, 86, 95, 96, 99]
        for code in hazard_codes:
            desc, _emoji = describe(code)
            assert desc != "Unknown"


class TestAssessHazards:
    def test_benign_conditions_produce_no_hazard(self):
        severity, hazards = assess_hazards(weathercode=0, temperature=70, wind_speed=10)
        assert severity == "none"
        assert hazards == []

    def test_fog_is_a_hazard(self):
        severity, hazards = assess_hazards(weathercode=45, temperature=70, wind_speed=5)
        assert severity == "hazard"
        assert hazards == [{"label": "Fog", "level": "hazard"}]

    def test_heavy_snow_is_extreme(self):
        severity, _ = assess_hazards(weathercode=75, temperature=20, wind_speed=5)
        assert severity == "extreme"

    def test_apparent_temperature_preferred_over_raw_temperature(self):
        severity, hazards = assess_hazards(apparent_temperature=0, temperature=70, wind_speed=5)
        assert severity == "extreme"
        assert {"label": "Extreme cold 0°F", "level": "extreme"} in hazards

    def test_falls_back_to_temperature_when_apparent_missing(self):
        severity, hazards = assess_hazards(apparent_temperature=None, temperature=0, wind_speed=5)
        assert severity == "extreme"
        assert {"label": "Extreme cold 0°F", "level": "extreme"} in hazards

    def test_combines_multiple_simultaneous_hazards_to_worst_severity(self):
        severity, hazards = assess_hazards(weathercode=71, apparent_temperature=-5, wind_speed=10)
        assert severity == "extreme"
        assert len(hazards) == 2

    def test_tolerates_all_missing_input(self):
        severity, hazards = assess_hazards()
        assert severity == "none"
        assert hazards == []

    def test_invalid_weathercode_does_not_raise(self):
        severity, _ = assess_hazards(weathercode="garbage", temperature=70, wind_speed=5)
        assert severity == "none"


# The same threshold table verified for static/api.js's assessHazards() in
# tests/js/regression/hazard-thresholds.test.js — kept in sync deliberately
# since this is the one part of the legacy backend (weather_codes.py) that
# IS still kept current (see docs/Architecture/Legacy-Flask-Backend.md).
@pytest.mark.parametrize(
    "temp,expected",
    [(99.9, "none"), (100, "hazard"), (109.9, "hazard"), (110, "extreme")],
)
def test_heat_threshold_boundaries(temp, expected):
    severity, _ = assess_hazards(apparent_temperature=temp)
    assert severity == expected


@pytest.mark.parametrize(
    "temp,expected",
    [(15.1, "none"), (15, "hazard"), (0.1, "hazard"), (0, "extreme")],
)
def test_cold_threshold_boundaries(temp, expected):
    severity, _ = assess_hazards(apparent_temperature=temp)
    assert severity == expected


@pytest.mark.parametrize(
    "wind,expected",
    [(34.9, "none"), (35, "hazard"), (49.9, "hazard"), (50, "extreme")],
)
def test_wind_threshold_boundaries(wind, expected):
    severity, _ = assess_hazards(wind_speed=wind)
    assert severity == expected


EXPECTED_WEATHER_HAZARDS = {
    45: "hazard", 48: "hazard",
    56: "hazard", 57: "hazard",
    65: "hazard", 66: "hazard", 67: "extreme",
    71: "hazard", 73: "hazard", 75: "extreme", 77: "hazard",
    81: "hazard", 82: "extreme",
    85: "hazard", 86: "extreme",
    95: "hazard", 96: "extreme", 99: "extreme",
}


@pytest.mark.parametrize("code,expected", EXPECTED_WEATHER_HAZARDS.items())
def test_weather_code_hazard_table(code, expected):
    severity, _ = assess_hazards(weathercode=code, temperature=70, wind_speed=5)
    assert severity == expected


def test_benign_codes_produce_no_hazard():
    for code in [0, 1, 2, 3, 51, 53, 55, 61, 63, 80]:
        severity, _ = assess_hazards(weathercode=code, temperature=70, wind_speed=5)
        assert severity == "none"
