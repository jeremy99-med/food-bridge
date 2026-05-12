"""
Calibration script — prints real Kroger shelf prices for common grocery items.

Run with:
    docker compose exec backend python3 scripts/calibrate_prices.py

Use the output to tune FALLBACK_PRICE_PER_100G in grocery_api.py.
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from grocery_api import _get_kroger_token, _get_kroger_location_id, _search_kroger_price

ITEMS = [
    ("salmon fillet",   453.0),
    ("chicken breast",  453.0),
    ("ground beef",     453.0),
    ("turkey breast",   453.0),
    ("whole milk",      240.0),
    ("greek yogurt",    227.0),
    ("cheddar cheese",  227.0),
    ("broccoli",        300.0),
    ("brown rice",      500.0),
    ("oats",            454.0),
    ("lentils",         454.0),
    ("olive oil",       250.0),
    ("almonds",         200.0),
    ("eggs",             50.0),
    ("avocado",         200.0),
    ("tofu",            396.0),
    ("shrimp",          453.0),
    ("pasta",           454.0),
    ("bread",           567.0),
]


async def main() -> None:
    if not os.getenv("KROGER_CLIENT_ID") or not os.getenv("KROGER_CLIENT_SECRET"):
        print("ERROR: KROGER_CLIENT_ID and KROGER_CLIENT_SECRET must be set in .env")
        return

    zip_code = sys.argv[1] if len(sys.argv) > 1 else None

    # Auth check
    token = await _get_kroger_token()
    if not token:
        print("ERROR: Failed to obtain Kroger access token — check credentials")
        return
    print("[OK] Kroger token obtained")

    # Location check
    location_id = await _get_kroger_location_id(zip_code)
    if location_id:
        zip_label = zip_code or os.getenv("KROGER_ZIP_CODE", "45202") + " (default)"
        print(f"[OK] zip={zip_label}  →  locationId={location_id}")
    else:
        print("[WARN] No Kroger location found for this zip — prices may be unavailable")

    print()
    print(f"{'Item':<25} {'Serving':>8}g  {'Serving cost':>13}  {'Per 100g':>10}")
    print("-" * 65)
    for name, serving in ITEMS:
        result = await _search_kroger_price(name, serving, zip_code)
        if result:
            print(
                f"{name:<25} {serving:>8.0f}g"
                f"  ${result['estimated_price_usd']:>11.2f}"
                f"  ${result['price_per_100g_usd']:>8.3f}"
            )
        else:
            print(f"{name:<25} {serving:>8.0f}g  {'NO RESULT':>12}")


if __name__ == "__main__":
    asyncio.run(main())
