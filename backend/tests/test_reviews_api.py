from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# Returns empty list when no reviews exist
def test_list_reviews_empty():
    with patch("app.api.routes.reviews.get_db_session") as mock_dep:
        mock_dep.return_value = iter([MagicMock()])
        with patch("app.api.routes.reviews.list_reviews", return_value=[]):
            response = client.get("/api/reviews?page=1")
    assert response.status_code == 200
    assert response.json() == []


# Returns 404 when review id does not exist
def test_get_review_not_found():
    with patch("app.api.routes.reviews.get_db_session") as mock_dep:
        mock_dep.return_value = iter([MagicMock()])
        with patch("app.api.routes.reviews.get_review", return_value=None):
            response = client.get("/api/reviews/00000000-0000-0000-0000-000000000000")
    assert response.status_code == 404
