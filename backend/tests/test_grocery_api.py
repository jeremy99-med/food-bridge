import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from grocery_api import _parse_size_to_grams, _search_kroger_price, get_grocery_price


# ── _parse_size_to_grams ──────────────────────────────────────────────────────

@pytest.mark.parametrize("size,expected", [
    ("1 lb",   453.592),
    ("12 oz",  12 * 28.3495),
    ("500 g",  500.0),
    ("2.5 lb", 2.5 * 453.592),
    ("1 kg",   1000.0),
    ("",       None),
    ("count",  None),
])
def test_parse_size_to_grams(size, expected):
    result = _parse_size_to_grams(size)
    if expected is None:
        assert result is None
    else:
        assert abs(result - expected) < 0.01


# ── _search_kroger_price ──────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_search_kroger_price_success():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": [{
        "images": [{"sizes": [{"id": "medium", "url": "http://img.test/salmon.jpg"}]}],
        "items": [{"price": {"regular": 9.99}, "size": "1 lb"}],
    }]}
    with patch("grocery_api._get_kroger_token", new=AsyncMock(return_value="fake-token")), \
         patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_resp)
        result = await _search_kroger_price("salmon", 450.0)
    assert result is not None
    assert result["estimated_price_usd"] > 0
    assert result["image_url"] == "http://img.test/salmon.jpg"


@pytest.mark.asyncio
async def test_search_kroger_price_no_token():
    with patch("grocery_api._get_kroger_token", new=AsyncMock(return_value=None)):
        result = await _search_kroger_price("chicken", 450.0)
    assert result is None


@pytest.mark.asyncio
async def test_search_kroger_price_no_results():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": []}
    with patch("grocery_api._get_kroger_token", new=AsyncMock(return_value="tok")), \
         patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_resp)
        result = await _search_kroger_price("xyznonexistentfood", 100.0)
    assert result is None


# ── get_grocery_price ─────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_grocery_price_uses_kroger():
    fake_kroger = {
        "estimated_price_usd": 8.50,
        "price_per_100g_usd": 1.89,
        "image_url": None,
    }
    with patch("grocery_api._search_kroger_price", new=AsyncMock(return_value=fake_kroger)):
        result = await get_grocery_price("salmon fillet", 450.0)
    assert result["source"] == "kroger"
    assert result["estimated_price_usd"] == 8.50
    assert result["price_per_100g_usd"] == 1.89


@pytest.mark.asyncio
async def test_get_grocery_price_falls_back_when_kroger_fails():
    with patch("grocery_api._search_kroger_price", new=AsyncMock(return_value=None)), \
         patch("grocery_api.search_off", new=AsyncMock(return_value=[])), \
         patch("grocery_api.get_prices", new=AsyncMock(return_value=[])):
        result = await get_grocery_price("chicken breast", 450.0)
    assert result["source"] == "category_estimate"
    assert result["estimated_price_usd"] > 0


# ── price math ────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_price_scales_correctly_with_serving_size():
    # $10 for 1 lb (453.592 g) → price_per_100g = 10/453.592*100 = $2.204
    # for 300 g serving → $2.204/100*300 = $6.61
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"data": [{
        "images": [],
        "items": [{"price": {"regular": 10.00}, "size": "1 lb"}],
    }]}
    with patch("grocery_api._get_kroger_token", new=AsyncMock(return_value="tok")), \
         patch("httpx.AsyncClient") as mock_client:
        mock_client.return_value.__aenter__.return_value.get = AsyncMock(return_value=mock_resp)
        result = await _search_kroger_price("beef", 300.0)
    expected = round((10.00 / 453.592 * 100) / 100 * 300.0, 2)
    assert result["estimated_price_usd"] == expected
