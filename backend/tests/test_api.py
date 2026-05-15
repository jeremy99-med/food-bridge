import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from unittest.mock import patch, MagicMock, AsyncMock
import pytest
from fastapi.testclient import TestClient

from api import app
from dependencies import get_current_user

# Remove startup handler so tests don't require a live DB
app.router.on_startup.clear()

_FAKE_USER = {
    "user_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    "username": "testuser",
    "created_at": None,
}

_PROFILE_BODY = {
    "height_cm": 170.0,
    "weight_kg": 70.0,
    "age": 30,
    "sex": "male",
    "activity_level": "moderately_active",
    "smoking_status": "non_smoker",
}

_PREFS_BODY = {
    "profile_id": "test-profile-id",
    "weekly_budget_usd": 100.0,
    "zip_code": "10001",
}

_MEAL_BODY = {
    "profile_id": "test-id",
    "selected_foods": [{"fdc_id": 1, "name": "Chicken Breast"}],
}

_GROCERY_BODY = {
    "profile_id": "test-id",
    "selected_foods": [{"fdc_id": 1, "name": "Apple"}],
}

_SAVE_BODY = {
    "total_estimated_cost_usd": 80.0,
    "grocery_list": {"Produce": [{"name": "Apple"}]},
}


@pytest.fixture(autouse=True)
def clear_dep_overrides():
    """Ensure dependency overrides are clean before and after every test."""
    app.dependency_overrides.clear()
    yield
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_client():
    app.dependency_overrides[get_current_user] = lambda: _FAKE_USER
    return TestClient(app)


# ── GET /health ────────────────────────────────────────────────────────────────

def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_health_post_method_not_allowed(client):
    resp = client.post("/health")
    assert resp.status_code == 405


# ── POST /profile ──────────────────────────────────────────────────────────────

def test_create_profile_success(client):
    with patch("user.create_profile", return_value="new-profile-id"):
        resp = client.post("/profile", json=_PROFILE_BODY)
    assert resp.status_code == 200
    assert resp.json()["profile_id"] == "new-profile-id"


def test_create_profile_db_error_returns_500(client):
    with patch("user.create_profile", side_effect=RuntimeError("DB unavailable")):
        resp = client.post("/profile", json=_PROFILE_BODY)
    assert resp.status_code == 500


# ── POST /preferences ──────────────────────────────────────────────────────────

def test_save_preferences_success(client):
    with patch("user.save_preferences", return_value=None):
        resp = client.post("/preferences", json=_PREFS_BODY)
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_save_preferences_db_error_returns_500(client):
    with patch("user.save_preferences", side_effect=RuntimeError("write failed")):
        resp = client.post("/preferences", json=_PREFS_BODY)
    assert resp.status_code == 500


# ── POST /search ───────────────────────────────────────────────────────────────

def test_search_foods_returns_results(client):
    fake = [{"fdc_id": 1, "name": "Chicken Breast", "data_type": "sr_legacy_food",
             "score": 72.0, "top_nutrients": ["Protein"]}]
    with patch("user.search_foods", return_value=fake):
        resp = client.post("/search", json={"query": "chicken"})
    assert resp.status_code == 200
    assert resp.json()[0]["name"] == "Chicken Breast"


def test_search_foods_missing_query_returns_422(client):
    resp = client.post("/search", json={})  # 'query' is required
    assert resp.status_code == 422


# ── POST /meal-plan ────────────────────────────────────────────────────────────

def test_meal_plan_success(client):
    with patch("planner.generate_meal_plan", return_value='{"days": []}'):
        resp = client.post("/meal-plan", json=_MEAL_BODY)
    assert resp.status_code == 200
    assert "response" in resp.json()


def test_meal_plan_planner_error_returns_500(client):
    with patch("planner.generate_meal_plan", side_effect=RuntimeError("agent failed")):
        resp = client.post("/meal-plan", json=_MEAL_BODY)
    assert resp.status_code == 500


# ── POST /grocery-list ─────────────────────────────────────────────────────────

def test_grocery_list_success(client):
    # Empty grocery_list avoids any pricing/DB calls in _price_items
    with patch("user.derive_grocery_list", return_value={"grocery_list": {}}):
        resp = client.post("/grocery-list", json=_GROCERY_BODY)
    assert resp.status_code == 200
    assert "grocery_list" in resp.json()


def test_grocery_list_derive_error_returns_500(client):
    with patch("user.derive_grocery_list", side_effect=RuntimeError("bad parse")):
        resp = client.post("/grocery-list", json=_GROCERY_BODY)
    assert resp.status_code == 500


# ── POST /reset ────────────────────────────────────────────────────────────────

def test_reset_returns_cleared(client):
    resp = client.post("/reset", json={"session_id": "sess-abc"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "cleared"


def test_reset_missing_session_id_returns_422(client):
    resp = client.post("/reset", json={})
    assert resp.status_code == 422


# ── POST /auth/signup ──────────────────────────────────────────────────────────

_SIGNUP_BODY = {"username": "newuser", "email": "new@test.com", "password": "StrongPass1!"}


def test_signup_success(client):
    with patch("auth.validate_password_rules", return_value=None), \
         patch("auth.hash_password", return_value="hashed"), \
         patch("auth_db.create_auth_user", return_value="user-123"), \
         patch("auth.create_access_token", return_value="access-tok"), \
         patch("auth.create_refresh_token", return_value="refresh-tok"):
        resp = client.post("/auth/signup", json=_SIGNUP_BODY)
    assert resp.status_code == 200
    data = resp.json()
    assert data["access_token"] == "access-tok"
    assert data["user"]["username"] == "newuser"


def test_signup_weak_password_returns_400(client):
    with patch("auth.validate_password_rules", side_effect=ValueError("Too short")):
        resp = client.post("/auth/signup", json={**_SIGNUP_BODY, "password": "abc"})
    assert resp.status_code == 400


# ── POST /auth/login ───────────────────────────────────────────────────────────

_LOGIN_BODY = {"identifier": "testuser", "password": "StrongPass1!"}


def test_login_success(client):
    fake_row = {"user_id": "uid-1", "password_hash": "hashed", "username": "testuser"}
    with patch("auth_db.get_auth_user_by_identifier", return_value=fake_row), \
         patch("auth.verify_password", return_value=True), \
         patch("auth.create_access_token", return_value="access-tok"), \
         patch("auth.create_refresh_token", return_value="refresh-tok"):
        resp = client.post("/auth/login", json=_LOGIN_BODY)
    assert resp.status_code == 200
    assert resp.json()["access_token"] == "access-tok"


def test_login_user_not_found_returns_401(client):
    with patch("auth_db.get_auth_user_by_identifier", return_value=None):
        resp = client.post("/auth/login", json=_LOGIN_BODY)
    assert resp.status_code == 401


# ── POST /auth/refresh ─────────────────────────────────────────────────────────

def test_refresh_token_success(client):
    fake_row = {"user_id": "uid-1", "username": "testuser"}
    with patch("auth.decode_refresh_token", return_value="uid-1"), \
         patch("auth_db.get_auth_user_by_id", return_value=fake_row), \
         patch("auth.create_access_token", return_value="new-access"), \
         patch("auth.create_refresh_token", return_value="new-refresh"):
        resp = client.post("/auth/refresh", json={"refresh_token": "valid-tok"})
    assert resp.status_code == 200
    assert resp.json()["access_token"] == "new-access"


def test_refresh_token_stale_user_returns_401(client):
    with patch("auth.decode_refresh_token", return_value="uid-gone"), \
         patch("auth_db.get_auth_user_by_id", return_value=None):
        resp = client.post("/auth/refresh", json={"refresh_token": "stale-tok"})
    assert resp.status_code == 401


# ── GET /auth/me ───────────────────────────────────────────────────────────────

def test_me_authorized_returns_user(auth_client):
    resp = auth_client.get("/auth/me")
    assert resp.status_code == 200
    assert resp.json()["username"] == "testuser"


def test_me_without_auth_not_200(client):
    resp = client.get("/auth/me")
    assert resp.status_code != 200


# ── POST /grocery-list/save ────────────────────────────────────────────────────

def test_save_grocery_list_success(auth_client):
    with patch("auth_db.save_grocery_list", return_value="list-id-1"):
        resp = auth_client.post("/grocery-list/save", json=_SAVE_BODY)
    assert resp.status_code == 200
    assert resp.json()["list_id"] == "list-id-1"


def test_save_grocery_list_unauthenticated_not_200(client):
    resp = client.post("/grocery-list/save", json=_SAVE_BODY)
    assert resp.status_code != 200


# ── GET /grocery-list/history ──────────────────────────────────────────────────

def test_grocery_list_history_returns_list(auth_client):
    with patch("auth_db.get_grocery_list_history", return_value=[{"list_id": "a"}]):
        resp = auth_client.get("/grocery-list/history")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_grocery_list_history_unauthenticated_not_200(client):
    resp = client.get("/grocery-list/history")
    assert resp.status_code != 200


# ── GET /grocery-list/history/{id} ────────────────────────────────────────────

def test_grocery_list_detail_found(auth_client):
    fake = {"list_id": "list-1", "total_estimated_cost_usd": 80.0}
    with patch("auth_db.get_grocery_list_detail", return_value=fake):
        resp = auth_client.get("/grocery-list/history/list-1")
    assert resp.status_code == 200
    assert resp.json()["list_id"] == "list-1"


def test_grocery_list_detail_not_found_returns_404(auth_client):
    with patch("auth_db.get_grocery_list_detail", return_value=None):
        resp = auth_client.get("/grocery-list/history/nonexistent")
    assert resp.status_code == 404
