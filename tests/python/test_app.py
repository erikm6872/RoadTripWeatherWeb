from datetime import datetime, timezone
from unittest.mock import patch

import pytest
import requests

from app import app as flask_app
from services import ServiceError


@pytest.fixture
def client():
    flask_app.config.update(TESTING=True)
    return flask_app.test_client()


class TestTripEndpointValidation:
    def test_missing_from_and_to_returns_400(self, client):
        resp = client.get("/api/trip")
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_missing_to_returns_400(self, client):
        resp = client.get("/api/trip?from=Phoenix")
        assert resp.status_code == 400

    def test_invalid_depart_time_returns_400(self, client):
        resp = client.get("/api/trip?from=Phoenix&to=Tucson&depart=not-a-date")
        assert resp.status_code == 400

    def test_accepts_a_trailing_z_on_depart_time(self, client):
        with patch("app.services") as mock_services:
            mock_services.geocode.side_effect = ServiceError("stop early, only checking date parsing")
            resp = client.get("/api/trip?from=Phoenix&to=Tucson&depart=2026-01-01T12:00:00Z")
        # Reaching the geocode() call (and failing there) proves the date parsed OK.
        assert resp.status_code == 502

    def test_interval_is_clamped_to_a_15_minute_minimum(self, client):
        with patch("app.services") as mock_services:
            mock_services.geocode.side_effect = [
                (33.45, -112.07, "Phoenix, AZ"),
                (32.22, -110.97, "Tucson, AZ"),
            ]
            mock_services.get_route.return_value = {
                "coords": [[33.45, -112.07], [32.22, -110.97]],
                "cum_time": [0, 3600],
                "distance": 180000,
                "duration": 3600,
            }
            mock_services.sample_points.return_value = []
            client.get("/api/trip?from=Phoenix&to=Tucson&interval=10")
            args, _ = mock_services.sample_points.call_args
            assert args[1] >= 900


class TestTripEndpointHappyPath:
    def test_returns_route_and_weather_shaped_json(self, client):
        with patch("app.services") as mock_services:
            mock_services.geocode.side_effect = [
                (33.45, -112.07, "Phoenix, Arizona, USA"),
                (32.22, -110.97, "Tucson, Arizona, USA"),
            ]
            mock_services.get_route.return_value = {
                "coords": [[33.45, -112.07], [32.22, -110.97]],
                "cum_time": [0, 3600],
                "distance": 180000,
                "duration": 3600,
            }
            mock_services.sample_points.return_value = [
                {"lat": 33.45, "lon": -112.07, "drive_seconds": 0},
                {"lat": 32.22, "lon": -110.97, "drive_seconds": 3600},
            ]
            mock_services.reverse_geocode.return_value = "Some Town, AZ"
            mock_services.get_weather_at.return_value = {
                "temperature": 75,
                "weathercode": 0,
                "description": "Clear sky",
                "emoji": "☀️",
                "severity": "none",
                "hazards": [],
            }

            resp = client.get("/api/trip?from=Phoenix&to=Tucson")
            assert resp.status_code == 200
            body = resp.get_json()
            assert body["origin"]["display"] == "Phoenix, Arizona, USA"
            assert body["destination"]["display"] == "Tucson, Arizona, USA"
            assert len(body["waypoints"]) == 2
            assert body["waypoints"][0]["weather"]["severity"] == "none"


class TestTripEndpointUpstreamFailures:
    def test_service_error_returns_502(self, client):
        with patch("app.services") as mock_services:
            mock_services.geocode.side_effect = ServiceError("Could not find a location for 'Nowhere'.")
            resp = client.get("/api/trip?from=Nowhere&to=Tucson")
            assert resp.status_code == 502
            assert "Nowhere" in resp.get_json()["error"]

    def test_network_error_returns_502(self, client):
        with patch("app.services") as mock_services:
            mock_services.geocode.side_effect = requests.ConnectionError("boom")
            resp = client.get("/api/trip?from=Phoenix&to=Tucson")
            assert resp.status_code == 502
