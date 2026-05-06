#!/usr/bin/env python3
"""
Idempotent migration: adds auth_user, alters user_profile, adds saved_grocery_list tables.
Run once against an existing database (does NOT drop or reload USDA data):

    python migrate_auth.py
"""
import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS auth_user (
    user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_profile
    ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth_user(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_profile_auth_user ON user_profile(auth_user_id);

CREATE TABLE IF NOT EXISTS saved_grocery_list (
    list_id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL REFERENCES auth_user(user_id) ON DELETE CASCADE,
    total_estimated_cost_usd NUMERIC(10,2),
    saved_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_grocery_list_user ON saved_grocery_list(user_id);

CREATE TABLE IF NOT EXISTS saved_grocery_list_item (
    item_id                  SERIAL PRIMARY KEY,
    list_id                  UUID NOT NULL REFERENCES saved_grocery_list(list_id) ON DELETE CASCADE,
    category                 TEXT,
    name                     TEXT NOT NULL,
    fdc_id                   INTEGER,
    quantity_needed          INTEGER,
    serving_size_g           NUMERIC,
    estimated_unit_price_usd NUMERIC(10,4),
    price_source             TEXT,
    image_url                TEXT
);
"""


def main() -> None:
    conn = psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        dbname=os.getenv("POSTGRES_DB", "hackathon"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
    )
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(MIGRATION_SQL)
        print("Migration complete.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
