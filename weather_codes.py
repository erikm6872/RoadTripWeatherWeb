"""WMO weather interpretation codes used by Open-Meteo.

Maps the numeric ``weathercode`` returned by the Open-Meteo API to a short
human-readable description and a representative emoji for the UI.
Reference: https://open-meteo.com/en/docs (WMO Weather interpretation codes).
"""

# code -> (description, emoji)
WMO_CODES = {
    0: ("Clear sky", "☀️"),
    1: ("Mainly clear", "\U0001f324️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Fog", "\U0001f32b️"),
    48: ("Depositing rime fog", "\U0001f32b️"),
    51: ("Light drizzle", "\U0001f327️"),
    53: ("Moderate drizzle", "\U0001f327️"),
    55: ("Dense drizzle", "\U0001f327️"),
    56: ("Light freezing drizzle", "\U0001f328️"),
    57: ("Dense freezing drizzle", "\U0001f328️"),
    61: ("Slight rain", "\U0001f327️"),
    63: ("Moderate rain", "\U0001f327️"),
    65: ("Heavy rain", "\U0001f327️"),
    66: ("Light freezing rain", "\U0001f328️"),
    67: ("Heavy freezing rain", "\U0001f328️"),
    71: ("Slight snow", "\U0001f328️"),
    73: ("Moderate snow", "\U0001f328️"),
    75: ("Heavy snow", "❄️"),
    77: ("Snow grains", "❄️"),
    80: ("Slight rain showers", "\U0001f326️"),
    81: ("Moderate rain showers", "\U0001f326️"),
    82: ("Violent rain showers", "⛈️"),
    85: ("Slight snow showers", "\U0001f328️"),
    86: ("Heavy snow showers", "❄️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm w/ slight hail", "⛈️"),
    99: ("Thunderstorm w/ heavy hail", "⛈️"),
}


def describe(code):
    """Return ``(description, emoji)`` for a WMO weather code."""
    try:
        return WMO_CODES[int(code)]
    except (KeyError, TypeError, ValueError):
        return ("Unknown", "❓")


# WMO codes that represent a driving hazard, mapped to a severity tier and a
# short label. "extreme" feeds the route-level alert; "hazard" is a milder flag.
HAZARD_WEATHER = {
    45: ("hazard", "Fog"),
    48: ("hazard", "Freezing fog"),
    56: ("hazard", "Freezing drizzle"),
    57: ("hazard", "Freezing drizzle"),
    65: ("hazard", "Heavy rain"),
    66: ("hazard", "Freezing rain"),
    67: ("extreme", "Heavy freezing rain"),
    71: ("hazard", "Snow"),
    73: ("hazard", "Snow"),
    75: ("extreme", "Heavy snow"),
    77: ("hazard", "Snow grains"),
    81: ("hazard", "Heavy rain showers"),
    82: ("extreme", "Violent rain showers"),
    85: ("hazard", "Snow showers"),
    86: ("extreme", "Heavy snow showers"),
    95: ("hazard", "Thunderstorm"),
    96: ("extreme", "Thunderstorm with hail"),
    99: ("extreme", "Thunderstorm with heavy hail"),
}

_SEVERITY_RANK = {"none": 0, "hazard": 1, "extreme": 2}


def assess_hazards(weathercode=None, apparent_temperature=None,
                   temperature=None, wind_speed=None):
    """Evaluate driving-weather hazards for a single forecast.

    Considers the weather code plus feels-like temperature and wind speed
    (Imperial units, matching the Open-Meteo request). Returns
    ``(severity, hazards)`` where ``severity`` is ``"none"``/``"hazard"``/
    ``"extreme"`` (the worst found) and ``hazards`` is a list of
    ``{"label", "level"}`` describing each individual threat.
    """
    level = "none"
    hazards = []

    def add(lvl, label):
        nonlocal level
        hazards.append({"label": label, "level": lvl})
        if _SEVERITY_RANK[lvl] > _SEVERITY_RANK[level]:
            level = lvl

    if weathercode is not None:
        try:
            info = HAZARD_WEATHER.get(int(weathercode))
        except (TypeError, ValueError):
            info = None
        if info:
            add(info[0], info[1])

    # Feels-like temperature captures heat-index / wind-chill danger.
    feels = apparent_temperature if apparent_temperature is not None else temperature
    if feels is not None:
        if feels >= 110:
            add("extreme", f"Extreme heat {round(feels)}°F")
        elif feels >= 100:
            add("hazard", f"Dangerous heat {round(feels)}°F")
        if feels <= 0:
            add("extreme", f"Extreme cold {round(feels)}°F")
        elif feels <= 15:
            add("hazard", f"Bitter cold {round(feels)}°F")

    if wind_speed is not None:
        if wind_speed >= 50:
            add("extreme", f"Violent wind {round(wind_speed)} mph")
        elif wind_speed >= 35:
            add("hazard", f"High wind {round(wind_speed)} mph")

    return level, hazards
