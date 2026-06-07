from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def _mock_supabase():
    mock = MagicMock()
    app.dependency_overrides[
        __import__("app.core.supabase_client", fromlist=["get_supabase"]).get_supabase
    ] = lambda: mock
    return mock


def test_list_reviews_empty():
    with patch("app.api.routes.reviews.list_reviews", return_value=[]):
        response = client.get("/api/reviews?page=1")
    assert response.status_code == 200
    assert response.json() == []


def test_get_review_not_found():
    with patch("app.api.routes.reviews.get_review", return_value=None):
        response = client.get("/api/reviews/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
