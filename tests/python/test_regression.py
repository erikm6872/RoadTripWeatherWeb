from unittest.mock import patch, MagicMock

import services
from services import reverse_geocode, sample_points


def make_route(total_seconds, num_points):
    coords, cum_time = [], []
    for i in range(num_points):
        coords.append([i, i])
        cum_time.append(total_seconds * i / (num_points - 1))
    return {"coords": coords, "cum_time": cum_time}


def fake_response(json_body):
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = json_body
    resp.raise_for_status = MagicMock()
    return resp


def test_short_trip_can_leave_only_the_destination_sample():
    """Documents current behavior (see docs/Features/Trip-Planning-Flow.md):
    when the whole drive is much shorter than half the requested interval,
    the origin sample can be popped and replaced by the destination sample,
    so a trip of just a few minutes may report only one weather stop, not
    an origin+destination pair. Mirrors the JS regression test of the same
    name for static/api.js's samplePoints()."""
    route = make_route(500, 2)
    samples = sample_points(route, 3600)
    assert len(samples) == 1
    assert samples[0]["drive_seconds"] == 500


def test_reverse_geocode_address_fallback_precedence():
    """Locks the exact fallback order documented in
    docs/Data-Sources/Nominatim.md: city > town > village > hamlet > suburb
    > municipality > county > state > raw coordinates. Each case below has
    only its target field plus lower-priority ones, to prove precedence
    rather than mere presence."""
    services._last_reverse_call = 0.0
    cases = [
        ({"city": "A", "town": "B", "state": "S"}, "A, S"),
        ({"town": "B", "village": "C", "state": "S"}, "B, S"),
        ({"village": "C", "hamlet": "D", "state": "S"}, "C, S"),
        ({"hamlet": "D", "suburb": "E", "state": "S"}, "D, S"),
        ({"suburb": "E", "municipality": "F", "state": "S"}, "E, S"),
        ({"municipality": "F", "county": "G", "state": "S"}, "F, S"),
        ({"county": "G", "state": "S"}, "G, S"),
        ({"state": "S"}, "S"),
        ({}, "1.00, 2.00"),
    ]
    for address, expected in cases:
        services._last_reverse_call = 0.0
        with patch("services.time.sleep", MagicMock()), patch("services.requests.get") as mock_get:
            mock_get.return_value = fake_response({"address": address})
            assert reverse_geocode(1.0, 2.0) == expected


def test_get_route_truncates_when_more_durations_than_segments():
    """The inverse of the length-mismatch case in test_services.py: extra
    duration entries (more than coords - 1) must also be truncated, not
    cause an index error or silently misalign coords/cum_time."""
    with patch("services.requests.get") as mock_get:
        mock_get.return_value = fake_response(
            {
                "code": "Ok",
                "routes": [
                    {
                        "geometry": {"coordinates": [[0, 0], [1, 1]]},  # 2 coords -> 1 segment expected
                        "legs": [{"annotation": {"duration": [600, 600, 600]}}],  # 3 durations, too many
                        "distance": 1000,
                        "duration": 1800,
                    }
                ],
            }
        )
        route = services.get_route((0, 0), (1, 1))
        assert len(route["coords"]) == len(route["cum_time"])
