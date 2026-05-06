"""
DB operations for auth and grocery list persistence.
Uses existing db.py helpers.
"""
from __future__ import annotations

import db


def create_auth_user(username: str, email: str, password_hash: str) -> str:
    row = db.execute_returning(
        """
        INSERT INTO auth_user (username, email, password_hash)
        VALUES (%s, %s, %s)
        RETURNING user_id
        """,
        (username, email, password_hash),
    )
    return str(row["user_id"])


def get_auth_user_by_identifier(identifier: str) -> dict | None:
    """Fetch a full auth_user row (including password_hash) by username OR email."""
    return db.fetch_one(
        "SELECT * FROM auth_user WHERE username = %s OR email = %s",
        (identifier, identifier),
    )


def get_auth_user_by_id(user_id: str) -> dict | None:
    """Return public user info only — never returns password_hash or email."""
    return db.fetch_one(
        "SELECT user_id, username, created_at FROM auth_user WHERE user_id = %s",
        (user_id,),
    )


def link_profile_to_user(profile_id: str, user_id: str) -> None:
    db.execute(
        "UPDATE user_profile SET auth_user_id = %s WHERE profile_id = %s",
        (user_id, profile_id),
    )


def save_grocery_list(
    user_id: str,
    total: float,
    items_by_category: dict[str, list[dict]],
) -> str:
    row = db.execute_returning(
        """
        INSERT INTO saved_grocery_list (user_id, total_estimated_cost_usd)
        VALUES (%s, %s)
        RETURNING list_id, saved_at
        """,
        (user_id, total),
    )
    list_id = str(row["list_id"])

    for category, items in items_by_category.items():
        for item in items:
            db.execute(
                """
                INSERT INTO saved_grocery_list_item
                    (list_id, category, name, fdc_id, quantity_needed,
                     serving_size_g, estimated_unit_price_usd, price_source, image_url)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    list_id,
                    category,
                    item.get("name"),
                    item.get("fdc_id"),
                    item.get("quantity_needed"),
                    item.get("serving_size_g"),
                    item.get("estimated_unit_price_usd"),
                    item.get("price_source"),
                    item.get("image_url"),
                ),
            )

    return list_id


def get_grocery_list_history(user_id: str) -> list[dict]:
    rows = db.fetch_all(
        """
        SELECT list_id, total_estimated_cost_usd, saved_at
        FROM saved_grocery_list
        WHERE user_id = %s
        ORDER BY saved_at DESC
        LIMIT 20
        """,
        (user_id,),
    )
    return [
        {
            "list_id": str(r["list_id"]),
            "total_estimated_cost_usd": float(r["total_estimated_cost_usd"] or 0),
            "saved_at": r["saved_at"].isoformat() if r["saved_at"] else None,
        }
        for r in rows
    ]


def get_grocery_list_detail(list_id: str, user_id: str) -> dict | None:
    header = db.fetch_one(
        """
        SELECT list_id, total_estimated_cost_usd, saved_at
        FROM saved_grocery_list
        WHERE list_id = %s AND user_id = %s
        """,
        (list_id, user_id),
    )
    if not header:
        return None

    items = db.fetch_all(
        """
        SELECT category, name, fdc_id, quantity_needed,
               serving_size_g, estimated_unit_price_usd, price_source, image_url
        FROM saved_grocery_list_item
        WHERE list_id = %s
        ORDER BY item_id
        """,
        (list_id,),
    )

    grouped: dict[str, list[dict]] = {}
    for item in items:
        cat = item.get("category") or "Other"
        grouped.setdefault(cat, []).append(dict(item))

    return {
        "list_id": str(header["list_id"]),
        "total_estimated_cost_usd": float(header["total_estimated_cost_usd"] or 0),
        "saved_at": header["saved_at"].isoformat() if header["saved_at"] else None,
        "grocery_list": grouped,
    }
