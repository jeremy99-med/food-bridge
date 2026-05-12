"""
Grocery pricing via Kroger API (primary) with Open Food Facts + Open Prices fallback.

Flow:
  1. _search_kroger_price(name) → Kroger product catalog → real US retail shelf price
  2. search_off(name)           → Open Food Facts barcode lookup (fallback)
  3. get_prices(barcode)        → crowdsourced Open Prices data (fallback)
  4. _match_category_price(name)→ static per-100g estimates (last resort)

Public APIs used:
  - https://api.kroger.com/v1/           (Kroger Developer API — requires credentials)
  - https://world.openfoodfacts.org/     (Open Food Facts — no auth)
  - https://prices.openfoodfacts.org/    (Open Prices — no auth)
"""

import base64
import os
import re
import statistics
import time

import httpx

# ── Constants ─────────────────────────────────────────────────────────────────

OFF_SEARCH_URL  = "https://world.openfoodfacts.org/cgi/search.pl"
OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
PRICES_URL      = "https://prices.openfoodfacts.org/api/v1/prices"

TIMEOUT = 8.0

# Fallback price estimates (USD per 100g) — used when both Kroger and Open Prices fail.
# Calibrated against US retail prices (Kroger / typical supermarket, 2025).
FALLBACK_PRICE_PER_100G: dict[str, float] = {
    # Proteins — per 100g of raw/packaged weight
    "salmon":     2.20,   # ~$10/lb → $2.20/100g
    "tuna":       1.80,
    "shrimp":     1.80,
    "fish":       1.60,
    "seafood":    1.60,
    "chicken":    0.88,   # ~$4/lb boneless breast
    "turkey":     1.10,   # ~$5/lb deli turkey breast
    "poultry":    0.88,
    "beef":       1.76,   # ~$8/lb ground beef
    "pork":       1.10,
    "lamb":       2.20,
    "meat":       1.32,
    # Dairy & eggs
    "yogurt":     0.44,
    "cheese":     1.10,
    "dairy":      0.44,
    "egg":        0.22,
    "milk":       0.11,
    # Produce
    "avocado":    0.66,
    "berry":      1.10,
    "fruit":      0.55,
    "vegetable":  0.44,
    "produce":    0.44,
    # Grains & legumes
    "oat":        0.33,
    "rice":       0.22,
    "pasta":      0.33,
    "bread":      0.44,
    "grain":      0.33,
    "cereal":     0.50,
    "lentil":     0.33,
    "bean":       0.33,
    "legume":     0.33,
    "tofu":       0.55,
    # Other
    "nut":        1.32,
    "oil":        0.77,
    "sauce":      0.55,
    "frozen":     0.60,
    "snack":      0.80,
    "beverage":   0.20,
    "juice":      0.25,
    "default":    0.66,
}


# ── Kroger API ────────────────────────────────────────────────────────────────

KROGER_TOKEN_URL     = "https://api.kroger.com/v1/connect/oauth2/token"
KROGER_PRODUCTS_URL  = "https://api.kroger.com/v1/products"
KROGER_LOCATIONS_URL = "https://api.kroger.com/v1/locations"

# Default zip — Cincinnati, OH (Kroger HQ city); yields prices from a standard Midwest store.
# Override via KROGER_ZIP_CODE env var.
_KROGER_DEFAULT_ZIP = "45202"

_kroger_token_cache:    dict | None       = None  # {"access_token": str, "expires_at": float}
_kroger_location_cache: dict[str, str]   = {}    # zip_code → locationId (in-process cache)


async def _get_kroger_token() -> str | None:
    """Return a valid Kroger OAuth2 access token, refreshing when close to expiry."""
    global _kroger_token_cache
    client_id     = os.getenv("KROGER_CLIENT_ID")
    client_secret = os.getenv("KROGER_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    now = time.time()
    if _kroger_token_cache and _kroger_token_cache["expires_at"] > now + 60:
        return _kroger_token_cache["access_token"]
    creds = base64.b64encode(f"{client_id}:{client_secret}".encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                KROGER_TOKEN_URL,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Authorization": f"Basic {creds}",
                },
                data={"grant_type": "client_credentials", "scope": "product.compact"},
            )
        if resp.status_code != 200:
            return None
        data = resp.json()
        _kroger_token_cache = {
            "access_token": data["access_token"],
            "expires_at":   now + data.get("expires_in", 1800),
        }
        return _kroger_token_cache["access_token"]
    except Exception:
        return None


def _ensure_zip_cache_table() -> None:
    """Create zip_location_cache table if it doesn't exist. Silently skips if DB unavailable."""
    try:
        from db import execute as _execute
        _execute(
            """
            CREATE TABLE IF NOT EXISTS zip_location_cache (
                zip_code    VARCHAR(10)  PRIMARY KEY,
                location_id VARCHAR(50)  NOT NULL,
                cached_at   TIMESTAMPTZ  DEFAULT NOW()
            )
            """,
            (),
        )
    except Exception:
        pass


async def _get_kroger_location_id(zip_code: str | None = None) -> str | None:
    """
    Return a Kroger locationId for the given zip code.

    Lookup order:
      1. In-process dict (fastest — survives within a single worker process)
      2. DB table zip_location_cache (survives container restarts)
      3. Live Kroger /v1/locations call (saved to DB for future requests)
    """
    zip_code = zip_code or os.getenv("KROGER_ZIP_CODE", _KROGER_DEFAULT_ZIP)

    if zip_code in _kroger_location_cache:
        return _kroger_location_cache[zip_code]

    # Check DB cache
    try:
        from db import fetch_one as _fetch_one, execute as _execute
        row = _fetch_one(
            "SELECT location_id FROM zip_location_cache WHERE zip_code = %s",
            (zip_code,),
        )
        if row:
            _kroger_location_cache[zip_code] = row["location_id"]
            return row["location_id"]
    except Exception:
        pass

    # Live lookup
    token = await _get_kroger_token()
    if not token:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                KROGER_LOCATIONS_URL,
                params={"filter.zipCode.near": zip_code, "filter.limit": 1},
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code != 200:
            return None
        locations = resp.json().get("data", [])
        if not locations:
            return None
        location_id: str = locations[0]["locationId"]

        # Persist to DB and in-process cache
        _kroger_location_cache[zip_code] = location_id
        try:
            from db import execute as _execute
            _execute(
                """
                INSERT INTO zip_location_cache (zip_code, location_id)
                VALUES (%s, %s)
                ON CONFLICT (zip_code) DO UPDATE
                    SET location_id = EXCLUDED.location_id,
                        cached_at   = NOW()
                """,
                (zip_code, location_id),
            )
        except Exception:
            pass

        return location_id
    except Exception:
        return None


def _parse_size_to_grams(size_str: str) -> float | None:
    """Convert a Kroger size string ('1 lb', '12 oz', '500 g') to grams."""
    m = re.match(r"([\d.]+)\s*(lb|lbs|oz|g|kg|ml|l)?", size_str.lower().strip())
    if not m:
        return None
    amount = float(m.group(1))
    unit   = m.group(2) or ""
    conversions: dict[str, float] = {
        "lb": 453.592, "lbs": 453.592,
        "oz": 28.3495,
        "g":  1.0,
        "kg": 1000.0,
        "ml": 1.0,
        "l":  1000.0,
    }
    factor = conversions.get(unit)
    return amount * factor if factor is not None else None


async def _search_kroger_price(
    food_name: str,
    serving_size_g: float,
    zip_code: str | None = None,
) -> dict | None:
    """
    Query the Kroger product catalog and return a price estimate.

    Returns dict with estimated_price_usd, price_per_100g_usd, image_url,
    or None if Kroger credentials are missing, the item isn't found, or any error occurs.
    """
    token = await _get_kroger_token()
    if not token:
        return None
    location_id = await _get_kroger_location_id(zip_code)
    params: dict = {
        "filter.term":  food_name,
        "filter.limit": 5,
    }
    if location_id:
        params["filter.locationId"] = location_id
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                KROGER_PRODUCTS_URL,
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code != 200:
            return None
        products = resp.json().get("data", [])
        for product in products:
            for item in product.get("items", []):
                price_data = item.get("price") or {}
                regular = price_data.get("regular") or price_data.get("promo")
                if not regular or regular <= 0:
                    continue
                unit_g         = _parse_size_to_grams(item.get("size", ""))
                price_per_100g = (regular / unit_g * 100) if unit_g else (regular / 4)
                # Extract first medium/small product image
                image_url: str | None = None
                for img in product.get("images", []):
                    for sz in img.get("sizes", []):
                        if sz.get("id") in ("medium", "small"):
                            image_url = sz.get("url")
                            break
                    if image_url:
                        break
                return {
                    "estimated_price_usd": round(price_per_100g / 100 * serving_size_g, 2),
                    "price_per_100g_usd":  round(price_per_100g, 3),
                    "image_url":           image_url,
                }
    except Exception:
        pass
    return None


# ── Open Food Facts ───────────────────────────────────────────────────────────

async def search_off(name: str, max_results: int = 5) -> list[dict]:
    """
    Search Open Food Facts by product name.

    Returns a list of products with barcode, name, category, and serving size.
    """
    params = {
        "search_terms": name,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": max_results,
        "fields": "code,product_name,categories_tags,serving_size,quantity,stores_tags,image_url",
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(OFF_SEARCH_URL, params=params)
        resp.raise_for_status()
        data = resp.json()

    products = []
    for p in data.get("products", []):
        barcode = p.get("code")
        if not barcode:
            continue
        products.append({
            "barcode": barcode,
            "name": p.get("product_name", name),
            "categories": p.get("categories_tags", []),
            "serving_size": p.get("serving_size"),
            "quantity": p.get("quantity"),
            "image_url": p.get("image_url"),
        })
    return products


async def get_product_by_barcode(barcode: str) -> dict | None:
    """Fetch a single product from Open Food Facts by barcode."""
    url = OFF_PRODUCT_URL.format(barcode=barcode)
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None
        data = resp.json()

    if data.get("status") != 1:
        return None

    p = data.get("product", {})
    return {
        "barcode": barcode,
        "name": p.get("product_name"),
        "categories": p.get("categories_tags", []),
        "serving_size": p.get("serving_size"),
        "quantity": p.get("quantity"),
    }


# ── Open Prices ───────────────────────────────────────────────────────────────

async def get_prices(barcode: str, max_entries: int = 20) -> list[dict]:
    """
    Fetch crowdsourced price entries for a product barcode from Open Prices.

    Returns a list of price entries with price, currency, date, and store.
    """
    params = {
        "product_code": barcode,
        "currency": "USD",
        "size": max_entries,
        "order_by": "-date",          # most recent first
    }
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(PRICES_URL, params=params)
        if resp.status_code != 200:
            return []
        data = resp.json()

    entries = []
    for item in data.get("items", []):
        price = item.get("price")
        if price is None:
            continue
        entries.append({
            "price_usd": float(price),
            "currency": item.get("currency", "USD"),
            "date": item.get("date"),
            "store": item.get("location", {}).get("osm_name") if item.get("location") else None,
            "price_per_unit": item.get("price_per_unit"),
        })
    return entries


def summarise_prices(price_entries: list[dict]) -> dict | None:
    """
    Summarise a list of price entries into min / median / max.
    Returns None if no entries.
    """
    if not price_entries:
        return None
    values = [e["price_usd"] for e in price_entries]
    return {
        "min_usd":    round(min(values), 2),
        "median_usd": round(statistics.median(values), 2),
        "max_usd":    round(max(values), 2),
        "sample_size": len(values),
        "source": "open_prices",
    }


# ── Fallback estimator ────────────────────────────────────────────────────────

def _match_category_price(name: str, categories: list[str]) -> float:
    """Match a food to a fallback price per 100g using name + OFF category tags."""
    search_text = " ".join([name.lower()] + [c.lower() for c in categories])
    for key, price in FALLBACK_PRICE_PER_100G.items():
        if key in search_text:
            return price
    return FALLBACK_PRICE_PER_100G["default"]


# ── Main public function ──────────────────────────────────────────────────────

async def get_grocery_price(
    food_name: str,
    serving_size_g: float = 100.0,
    zip_code: str | None = None,
) -> dict:
    """
    Get the best available price for a food item.

    Tries Kroger first (real US retail shelf prices), then Open Food Facts →
    Open Prices, then falls back to category-based estimate.

    Args:
        food_name:      Food description (from FDC or branded_food)
        serving_size_g: Serving size in grams (used to scale price per 100g)
        zip_code:       User's zip — used to select a nearby Kroger store for accurate prices

    Returns:
        dict with estimated_price_usd, price_per_100g, source, and barcode if found
    """
    # Step 1: Try Kroger (real US retail prices)
    kroger = await _search_kroger_price(food_name, serving_size_g, zip_code)
    if kroger:
        return {
            "food_name": food_name,
            "barcode": None,
            "image_url": kroger["image_url"],
            "serving_size_g": serving_size_g,
            "estimated_price_usd": kroger["estimated_price_usd"],
            "price_per_100g_usd": kroger["price_per_100g_usd"],
            "price_range": None,
            "source": "kroger",
        }

    barcode: str | None = None
    categories: list[str] = []
    image_url: str | None = None
    price_summary: dict | None = None

    # Step 2: Search Open Food Facts for a matching product
    try:
        products = await search_off(food_name, max_results=3)
        if products:
            best = products[0]
            barcode = best["barcode"]
            categories = best.get("categories", [])
            image_url = best.get("image_url")
    except Exception:
        pass

    # Step 3: Fetch prices from Open Prices using barcode
    if barcode:
        try:
            entries = await get_prices(barcode)
            price_summary = summarise_prices(entries)
        except Exception:
            pass

    # Step 4: Calculate price for the given serving size
    if price_summary:
        # Open Prices returns per-item price — estimate per 100g from median
        # Most entries are per package; scale by serving size as a fraction
        price_per_100g = price_summary["median_usd"] / max(serving_size_g, 1) * 100
        estimated_price = round(price_summary["median_usd"] * (serving_size_g / 100), 2)
        return {
            "food_name": food_name,
            "barcode": barcode,
            "image_url": image_url,
            "serving_size_g": serving_size_g,
            "estimated_price_usd": estimated_price,
            "price_per_100g_usd": round(price_per_100g, 3),
            "price_range": price_summary,
            "source": "open_prices",
        }

    # Fallback: category estimate
    price_per_100g = _match_category_price(food_name, categories)
    estimated_price = round(price_per_100g * (serving_size_g / 100), 2)
    return {
        "food_name": food_name,
        "barcode": barcode,
        "image_url": image_url,
        "serving_size_g": serving_size_g,
        "estimated_price_usd": estimated_price,
        "price_per_100g_usd": price_per_100g,
        "price_range": None,
        "source": "category_estimate",
    }


async def get_grocery_prices_bulk(
    foods: list[dict],
    zip_code: str | None = None,
) -> list[dict]:
    """
    Price a list of foods concurrently.

    Args:
        foods:    list of dicts with keys: food_name, serving_size_g
        zip_code: user's zip — passed to every get_grocery_price call

    Returns:
        list of price dicts from get_grocery_price, one per input food
    """
    import asyncio
    tasks = [
        get_grocery_price(f["food_name"], f.get("serving_size_g", 100.0), zip_code)
        for f in foods
    ]
    return await asyncio.gather(*tasks)
