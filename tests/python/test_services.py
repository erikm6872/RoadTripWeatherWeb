from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest
import requests

import services
from services import (
    ServiceError,
    geocode,
    reverse_geocode,
    get_route,
    sample_points,
    get_weather_at,
)


def make_route(total_seconds, num_points):
    """A route with `num_points` coordinates evenly spaced over `total_seconds`."""
    coords = []
    cum_time = []
    for i in range(num_points):
        coords.append([i, i])
        cum_time.append(total_seconds * i / (num_points - 1))
    return {"coords": coords, "cum_time": cum_time}


def fake_response(json_body, status=200):
    resp = MagicMock()
    resp.status_code = status
    resp.json.return_value = json_body
    resp.raise_for_status = MagicMock()
    if status >= 400:
        resp.raise_for_status.side_effect = requests.HTTPError(f"{status} error")
    return resp


class TestGeocode:
    @patch("services.requests.get")
    def test_resolves_a_place_name(self, mock_get):
        mock_get.return_value = fake_response(
            [{"lat": "33.4484", "lon": "-112.074", "display_name": "Phoenix, Arizona, USA"}]
        )
        lat, lon, display = geocode("Phoenix, AZ")
        assert (lat, lon, display) == (33.4484, -112.074, "Phoenix, Arizona, USA")

    @patch("services.requests.get")
    def test_raises_service_error_when_no_results(self, mock_get):
        mock_get.return_value = fake_response([])
        with pytest.raises(ServiceError, match="Nowhereville"):
            geocode("Nowhereville")

    @patch("services.requests.get")
    def test_sends_the_required_user_agent(self, mock_get):
        mock_get.return_value = fake_response([{"lat": "1", "lon": "1", "display_name": "x"}])
        geocode("x")
        _, kwargs = mock_get.call_args
        assert "User-Agent" in kwargs["headers"]


class TestReverseGeocode:
    def setup_method(self):
        services._last_reverse_call = 0.0

    @patch("services.time.sleep", MagicMock())
    @patch("services.requests.get")
    def test_prefers_city_over_broader_fields(self, mock_get):
        mock_get.return_value = fake_response({"address": {"town": "Winslow", "state": "Arizona"}})
        assert reverse_geocode(35.02, -110.7) == "Winslow, Arizona"

    @patch("services.time.sleep", MagicMock())
    @patch("services.requests.get")
    def test_falls_back_to_state_only(self, mock_get):
        mock_get.return_value = fake_response({"address": {"state": "Arizona"}})
        assert reverse_geocode(35.02, -110.7) == "Arizona"

    @patch("services.time.sleep", MagicMock())
    @patch("services.requests.get")
    def test_falls_back_to_coordinates_when_nothing_available(self, mock_get):
        mock_get.return_value = fake_response({"address": {}})
        assert reverse_geocode(35.021, -110.699) == "35.02, -110.70"

    @patch("services.time.sleep", MagicMock())
    @patch("services.requests.get")
    def test_falls_back_to_coordinates_on_request_failure(self, mock_get):
        mock_get.side_effect = requests.ConnectionError("network down")
        assert reverse_geocode(35.021, -110.699) == "35.02, -110.70"

    @patch("services.requests.get")
    def test_throttles_consecutive_calls(self, mock_get):
        mock_get.return_value = fake_response({"address": {"city": "Flagstaff", "state": "Arizona"}})
        services._last_reverse_call = services.time.monotonic()  # simulate a just-made call
        with patch("services.time.sleep") as mock_sleep:
            reverse_geocode(35.2, -111.65)
            assert mock_sleep.called
            waited = mock_sleep.call_args[0][0]
            assert 0 < waited <= services._REVERSE_MIN_INTERVAL


class TestGetRoute:
    @patch("services.requests.get")
    def test_flips_osrm_lon_lat_to_lat_lon(self, mock_get):
        mock_get.return_value = fake_response(
            {
                "code": "Ok",
                "routes": [
                    {
                        "geometry": {"coordinates": [[-112.07, 33.45], [-110.97, 32.22]]},
                        "legs": [{"annotation": {"duration": [3600]}}],
                        "distance": 180000,
                        "duration": 3600,
                    }
                ],
            }
        )
        route = get_route((33.45, -112.07), (32.22, -110.97))
        assert route["coords"][0] == [33.45, -112.07]
        assert route["coords"][1] == [32.22, -110.97]

    @patch("services.requests.get")
    def test_builds_cumulative_time(self, mock_get):
        mock_get.return_value = fake_response(
            {
                "code": "Ok",
                "routes": [
                    {
                        "geometry": {"coordinates": [[0, 0], [1, 1], [2, 2]]},
                        "legs": [{"annotation": {"duration": [600, 600]}}],
                        "distance": 1000,
                        "duration": 1200,
                    }
                ],
            }
        )
        route = get_route((0, 0), (2, 2))
        assert route["cum_time"] == [0, 600, 1200]

    @patch("services.requests.get")
    def test_raises_service_error_on_no_route(self, mock_get):
        mock_get.return_value = fake_response({"code": "NoRoute", "routes": []})
        with pytest.raises(ServiceError):
            get_route((0, 0), (1, 1))

    @patch("services.requests.get")
    def test_truncates_on_length_mismatch(self, mock_get):
        mock_get.return_value = fake_response(
            {
                "code": "Ok",
                "routes": [
                    {
                        "geometry": {"coordinates": [[0, 0], [1, 1], [2, 2]]},
                        "legs": [{"annotation": {"duration": [600]}}],  # only 1 segment for 3 coords
                        "distance": 1000,
                        "duration": 600,
                    }
                ],
            }
        )
        route = get_route((0, 0), (2, 2))
        assert len(route["coords"]) == len(route["cum_time"]) == 2


class TestSamplePoints:
    def test_samples_at_the_requested_interval(self):
        route = make_route(7200, 73)
        samples = sample_points(route, 1800)
        assert [s["drive_seconds"] for s in samples] == [0, 1800, 3600, 5400, 7200]

    def test_widens_interval_to_respect_max_points(self):
        route = make_route(36000, 361)
        samples = sample_points(route, 1800, max_points=12)
        assert len(samples) <= 12
        assert samples[0]["drive_seconds"] == 0
        assert samples[-1]["drive_seconds"] == 36000

    def test_destination_replaces_a_too_close_predecessor(self):
        route = make_route(1000, 11)
        samples = sample_points(route, 300)
        times = [s["drive_seconds"] for s in samples]
        assert times == [0, 300, 600, 1000]
        assert 900 not in times

    def test_no_duplicate_points(self):
        route = make_route(5000, 51)
        samples = sample_points(route, 900)
        seen = set()
        for s in samples:
            key = (s["lat"], s["lon"])
            assert key not in seen
            seen.add(key)


class TestGetWeatherAt:
    @patch("services.requests.get")
    def test_matches_nearest_hour(self, mock_get):
        when = datetime(2026, 1, 1, 15, 0, tzinfo=timezone.utc)
        times = [f"2026-01-01T{h:02d}:00" for h in range(24)]
        mock_get.return_value = fake_response(
            {
                "hourly": {
                    "time": times,
                    "temperature_2m": [50 + h for h in range(24)],
                    "apparent_temperature": [50 + h for h in range(24)],
                    "precipitation": [0] * 24,
                    "precipitation_probability": [0] * 24,
                    "weathercode": [0] * 24,
                    "wind_speed_10m": [5] * 24,
                }
            }
        )
        result = get_weather_at(33.45, -112.07, when)
        assert result["temperature"] == 65  # 50 + 15
        assert result["forecast_time_utc"] == "2026-01-01T15:00"

    @patch("services.requests.get")
    def test_raises_service_error_when_no_hourly_data(self, mock_get):
        mock_get.return_value = fake_response({"hourly": {"time": []}})
        with pytest.raises(ServiceError):
            get_weather_at(0, 0, datetime.now(timezone.utc))

    @patch("services.requests.get")
    def test_attaches_hazard_assessment(self, mock_get):
        when = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
        mock_get.return_value = fake_response(
            {
                "hourly": {
                    "time": ["2026-01-01T00:00"],
                    "temperature_2m": [20],
                    "apparent_temperature": [20],
                    "precipitation": [0],
                    "precipitation_probability": [0],
                    "weathercode": [75],  # heavy snow -> extreme
                    "wind_speed_10m": [5],
                }
            }
        )
        result = get_weather_at(0, 0, when)
        assert result["severity"] == "extreme"
        assert len(result["hazards"]) >= 1

    @patch("services.requests.get")
    def test_clamps_forecast_days_to_16(self, mock_get):
        far_future = datetime.now(timezone.utc).replace(year=datetime.now(timezone.utc).year + 1)
        mock_get.return_value = fake_response(
            {
                "hourly": {
                    "time": ["2026-01-01T00:00"],
                    "temperature_2m": [70],
                    "apparent_temperature": [70],
                    "precipitation": [0],
                    "precipitation_probability": [0],
                    "weathercode": [0],
                    "wind_speed_10m": [5],
                }
            }
        )
        get_weather_at(0, 0, far_future)
        _, kwargs = mock_get.call_args
        assert kwargs["params"]["forecast_days"] <= 16
