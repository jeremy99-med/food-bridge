#!/usr/bin/env python3
"""
Bulk-load FoodData Central CSVs into PostgreSQL via COPY.

Usage:
    python load_data.py                # create tables + load all CSVs
    python load_data.py --drop         # drop & recreate tables first
    python load_data.py --table food   # load only the 'food' table
    python load_data.py --skip-large   # skip tables with >1M rows

Env vars (or .env file):
    POSTGRES_HOST, POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
"""
import argparse
import logging
import os
import sys
import time
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)

CSV_DIR = Path(__file__).parent / "data"

# ── Schema DDL ────────────────────────────────────────────────────────────────

DDL = """
-- Reference / Lookup tables
CREATE TABLE IF NOT EXISTS food_category (
    id          INTEGER PRIMARY KEY,
    code        TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS wweia_food_category (
    wweia_food_category             INTEGER PRIMARY KEY,
    wweia_food_category_description TEXT
);

CREATE TABLE IF NOT EXISTS nutrient (
    id           INTEGER PRIMARY KEY,
    name         TEXT,
    unit_name    TEXT,
    nutrient_nbr NUMERIC,
    rank         NUMERIC
);

CREATE TABLE IF NOT EXISTS food_nutrient_derivation (
    id          INTEGER PRIMARY KEY,
    code        TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS food_nutrient_source (
    id          INTEGER PRIMARY KEY,
    code        TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS food_attribute_type (
    id          INTEGER PRIMARY KEY,
    name        TEXT,
    description TEXT
);

CREATE TABLE IF NOT EXISTS measure_unit (
    id   INTEGER PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS lab_method (
    id          INTEGER PRIMARY KEY,
    description TEXT,
    technique   TEXT
);

CREATE TABLE IF NOT EXISTS retention_factor (
    gid          INTEGER PRIMARY KEY,
    code         INTEGER,
    food_group_id INTEGER,
    description  TEXT
);

CREATE TABLE IF NOT EXISTS fndds_derivation (
    derivation_code        TEXT PRIMARY KEY,
    derivation_description TEXT
);

-- Core food table
CREATE TABLE IF NOT EXISTS food (
    fdc_id           INTEGER PRIMARY KEY,
    data_type        TEXT,
    description      TEXT,
    food_category_id TEXT,
    publication_date DATE
);

-- Food-dependent tables
CREATE TABLE IF NOT EXISTS branded_food (
    fdc_id                     INTEGER PRIMARY KEY,
    brand_owner                TEXT,
    brand_name                 TEXT,
    subbrand_name              TEXT,
    gtin_upc                   TEXT,
    ingredients                TEXT,
    not_a_significant_source_of TEXT,
    serving_size               NUMERIC,
    serving_size_unit          TEXT,
    household_serving_fulltext TEXT,
    branded_food_category      TEXT,
    data_source                TEXT,
    package_weight             TEXT,
    modified_date              DATE,
    available_date             DATE,
    market_country             TEXT,
    discontinued_date          DATE,
    preparation_state_code     TEXT,
    trade_channel              TEXT,
    short_description          TEXT,
    material_code              TEXT
);

CREATE TABLE IF NOT EXISTS food_nutrient (
    id                  BIGINT PRIMARY KEY,
    fdc_id              INTEGER,
    nutrient_id         INTEGER,
    amount              NUMERIC,
    data_points         INTEGER,
    derivation_id       INTEGER,
    min                 NUMERIC,
    max                 NUMERIC,
    median              NUMERIC,
    loq                 NUMERIC,
    footnote            TEXT,
    min_year_acquired   INTEGER,
    percent_daily_value NUMERIC
);

CREATE TABLE IF NOT EXISTS food_attribute (
    id                    BIGINT PRIMARY KEY,
    fdc_id                INTEGER,
    seq_num               INTEGER,
    food_attribute_type_id INTEGER,
    name                  TEXT,
    value                 TEXT
);

CREATE TABLE IF NOT EXISTS food_portion (
    id                  INTEGER PRIMARY KEY,
    fdc_id              INTEGER,
    seq_num             INTEGER,
    amount              NUMERIC,
    measure_unit_id     INTEGER,
    portion_description TEXT,
    modifier            TEXT,
    gram_weight         NUMERIC,
    data_points         INTEGER,
    footnote            TEXT,
    min_year_acquired   INTEGER
);

CREATE TABLE IF NOT EXISTS food_component (
    id                INTEGER PRIMARY KEY,
    fdc_id            INTEGER,
    name              TEXT,
    pct_weight        NUMERIC,
    is_refuse         TEXT,
    gram_weight       NUMERIC,
    data_points       INTEGER,
    min_year_acquired INTEGER
);

CREATE TABLE IF NOT EXISTS food_nutrient_conversion_factor (
    id     INTEGER PRIMARY KEY,
    fdc_id INTEGER
);

CREATE TABLE IF NOT EXISTS food_calorie_conversion_factor (
    food_nutrient_conversion_factor_id INTEGER PRIMARY KEY,
    protein_value                      NUMERIC,
    fat_value                          NUMERIC,
    carbohydrate_value                 NUMERIC
);

CREATE TABLE IF NOT EXISTS food_protein_conversion_factor (
    food_nutrient_conversion_factor_id INTEGER PRIMARY KEY,
    value                              NUMERIC
);

CREATE TABLE IF NOT EXISTS food_update_log_entry (
    id           BIGINT PRIMARY KEY,
    description  TEXT,
    last_updated DATE
);

CREATE TABLE IF NOT EXISTS survey_fndds_food (
    fdc_id              INTEGER PRIMARY KEY,
    food_code           TEXT,
    wweia_category_code INTEGER,
    start_date          DATE,
    end_date            DATE
);

CREATE TABLE IF NOT EXISTS input_food (
    id                   INTEGER PRIMARY KEY,
    fdc_id               INTEGER,
    fdc_id_of_input_food INTEGER,
    seq_num              INTEGER,
    amount               NUMERIC,
    sr_code              INTEGER,
    sr_description       TEXT,
    unit                 TEXT,
    portion_code         TEXT,
    portion_description  TEXT,
    gram_weight          NUMERIC,
    retention_code       INTEGER
);

CREATE TABLE IF NOT EXISTS fndds_ingredient_nutrient_value (
    ingredient_code        INTEGER,
    ingredient_description TEXT,
    nutrient_code          INTEGER,
    nutrient_value         NUMERIC,
    nutrient_value_source  TEXT,
    fdc_id                 INTEGER,
    derivation_code        TEXT,
    sr_addmod_year         INTEGER,
    foundation_year_acquired INTEGER,
    start_date             DATE,
    end_date               DATE,
    PRIMARY KEY (ingredient_code, nutrient_code, start_date)
);

CREATE TABLE IF NOT EXISTS foundation_food (
    fdc_id     INTEGER PRIMARY KEY,
    ndb_number INTEGER,
    footnote   TEXT
);

CREATE TABLE IF NOT EXISTS sr_legacy_food (
    fdc_id     INTEGER PRIMARY KEY,
    ndb_number INTEGER
);

CREATE TABLE IF NOT EXISTS sample_food (
    fdc_id INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS sub_sample_food (
    fdc_id               INTEGER PRIMARY KEY,
    fdc_id_of_sample_food INTEGER
);

CREATE TABLE IF NOT EXISTS acquisition_samples (
    fdc_id_of_sample_food      INTEGER,
    fdc_id_of_acquisition_food INTEGER,
    PRIMARY KEY (fdc_id_of_sample_food, fdc_id_of_acquisition_food)
);

CREATE TABLE IF NOT EXISTS market_acquisition (
    fdc_id            INTEGER PRIMARY KEY,
    brand_description TEXT,
    expiration_date   DATE,
    label_weight      TEXT,
    location          TEXT,
    acquisition_date  DATE,
    sales_type        TEXT,
    sample_lot_nbr    TEXT,
    sell_by_date      DATE,
    store_city        TEXT,
    store_name        TEXT,
    store_state       TEXT,
    upc_code          TEXT,
    acquisition_number TEXT
);

CREATE TABLE IF NOT EXISTS agricultural_samples (
    fdc_id           INTEGER PRIMARY KEY,
    acquisition_date DATE,
    market_class     TEXT,
    treatment        TEXT,
    state            TEXT
);

CREATE TABLE IF NOT EXISTS lab_method_code (
    lab_method_id INTEGER,
    code          TEXT
);

CREATE TABLE IF NOT EXISTS lab_method_nutrient (
    lab_method_id INTEGER,
    nutrient_id   INTEGER,
    PRIMARY KEY (lab_method_id, nutrient_id)
);

CREATE TABLE IF NOT EXISTS sub_sample_result (
    food_nutrient_id BIGINT PRIMARY KEY,
    adjusted_amount  NUMERIC,
    lab_method_id    INTEGER,
    nutrient_name    TEXT
);

CREATE TABLE IF NOT EXISTS microbe (
    id          INTEGER PRIMARY KEY,
    food_id     INTEGER,
    method      TEXT,
    microbe_code TEXT,
    min_value   NUMERIC,
    max_value   NUMERIC,
    uom         TEXT
);

-- User tables (populated by the application, not CSV)
CREATE TABLE IF NOT EXISTS user_profile (
    profile_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    height_cm              NUMERIC,
    weight_kg              NUMERIC,
    age                    INTEGER,
    sex                    TEXT,
    activity_level         TEXT,
    smoking_status         TEXT,
    pregnancy_status       TEXT,
    household_size_adults  INTEGER,
    household_size_children INTEGER,
    created_at             TIMESTAMPTZ DEFAULT NOW(),
    updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_health_goal (
    id         SERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    goal       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_health_condition (
    id             SERIAL PRIMARY KEY,
    profile_id     UUID NOT NULL REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    condition_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_medication (
    id              SERIAL PRIMARY KEY,
    profile_id      UUID NOT NULL REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    rxcui           TEXT,
    medication_name TEXT,
    drug_class      TEXT
);

CREATE TABLE IF NOT EXISTS user_grocery_preference (
    id                 SERIAL PRIMARY KEY,
    profile_id         UUID NOT NULL UNIQUE REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    weekly_budget_usd  NUMERIC(10, 2),
    zip_code           TEXT,
    wic_filter_active  CHAR(1),
    created_at         TIMESTAMPTZ DEFAULT NOW(),
    updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_dietary_preference (
    id         SERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    preference TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_allergy (
    id         SERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    allergen   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_cuisine_preference (
    id         SERIAL PRIMARY KEY,
    profile_id UUID NOT NULL REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    cuisine    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_calculated_dv (
    id              SERIAL PRIMARY KEY,
    profile_id      UUID NOT NULL REFERENCES user_profile(profile_id) ON DELETE CASCADE,
    calories_kcal   NUMERIC,
    protein_g       NUMERIC,
    fat_g           NUMERIC,
    saturated_fat_g NUMERIC,
    carbohydrates_g NUMERIC,
    fiber_g         NUMERIC,
    added_sugars_g  NUMERIC,
    sodium_mg       NUMERIC,
    potassium_mg    NUMERIC,
    calcium_mg      NUMERIC,
    iron_mg         NUMERIC,
    vitamin_c_mg    NUMERIC,
    vitamin_d_iu    NUMERIC,
    folate_mcg      NUMERIC,
    b12_mcg         NUMERIC,
    magnesium_mg    NUMERIC,
    zinc_mg         NUMERIC,
    calculated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Auth tables (user identity, separate from health profile)
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

DROP_ORDER = [
    # auth + grocery persistence tables first (FK deps)
    "saved_grocery_list_item", "saved_grocery_list",
    # user tables (user_profile has FK to auth_user, so drop before auth_user)
    "user_calculated_dv", "user_cuisine_preference", "user_allergy",
    "user_dietary_preference", "user_grocery_preference", "user_medication",
    "user_health_condition", "user_health_goal", "user_profile",
    "auth_user",
    # USDA tables (no enforced FKs so order doesn't matter here)
    "microbe", "sub_sample_result", "lab_method_nutrient", "lab_method_code",
    "agricultural_samples", "market_acquisition", "acquisition_samples",
    "sub_sample_food", "sample_food", "sr_legacy_food", "foundation_food",
    "fndds_ingredient_nutrient_value", "input_food", "survey_fndds_food",
    "food_update_log_entry", "food_protein_conversion_factor",
    "food_calorie_conversion_factor", "food_nutrient_conversion_factor",
    "food_component", "food_portion", "food_attribute", "food_nutrient",
    "branded_food", "food",
    "fndds_derivation", "retention_factor", "lab_method", "measure_unit",
    "food_attribute_type", "food_nutrient_source", "food_nutrient_derivation",
    "nutrient", "wweia_food_category", "food_category",
]

# ── CSV Load Configuration ────────────────────────────────────────────────────
# Each entry: (table_name, csv_filename, [columns_in_csv_order], approx_rows)
# columns maps CSV column order → table column names (handles renamed headers)

LOAD_CONFIG = [
    # Reference tables first
    ("food_category",           "food_category.csv",           ["id", "code", "description"],                                     25),
    ("wweia_food_category",     "wweia_food_category.csv",     ["wweia_food_category", "wweia_food_category_description"],         170),
    ("nutrient",                "nutrient.csv",                ["id", "name", "unit_name", "nutrient_nbr", "rank"],                150),
    ("food_nutrient_derivation","food_nutrient_derivation.csv",["id", "code", "description"],                                      50),
    ("food_nutrient_source",    "food_nutrient_source.csv",    ["id", "code", "description"],                                      10),
    ("food_attribute_type",     "food_attribute_type.csv",     ["id", "name", "description"],                                      10),
    ("measure_unit",            "measure_unit.csv",            ["id", "name"],                                                     50),
    ("lab_method",              "lab_method.csv",              ["id", "description", "technique"],                                 10),
    ("retention_factor",        "retention_factor.csv",        ["gid", "code", "food_group_id", "description"],                   500),
    ("fndds_derivation",        "fndds_derivation.csv",        ["derivation_code", "derivation_description"],                      20),

    # Core food table
    ("food",                    "food.csv",                    ["fdc_id", "data_type", "description", "food_category_id", "publication_date"], 2_080_000),

    # Conversion factors (small, depend on food)
    ("food_nutrient_conversion_factor", "food_nutrient_conversion_factor.csv", ["id", "fdc_id"],                                  5_000),
    ("food_calorie_conversion_factor",  "food_calorie_conversion_factor.csv",
        ["food_nutrient_conversion_factor_id", "protein_value", "fat_value", "carbohydrate_value"],                               5_000),
    ("food_protein_conversion_factor",  "food_protein_conversion_factor.csv",
        ["food_nutrient_conversion_factor_id", "value"],                                                                          5_000),

    # Branded / commercial
    ("branded_food", "branded_food.csv", [
        "fdc_id", "brand_owner", "brand_name", "subbrand_name", "gtin_upc",
        "ingredients", "not_a_significant_source_of", "serving_size", "serving_size_unit",
        "household_serving_fulltext", "branded_food_category", "data_source",
        "package_weight", "modified_date", "available_date", "market_country",
        "discontinued_date", "preparation_state_code", "trade_channel",
        "short_description", "material_code",
    ], 1_990_000),

    # Medium tables
    ("food_component",   "food_component.csv",   ["id", "fdc_id", "name", "pct_weight", "is_refuse", "gram_weight", "data_points", "min_year_acquired"],   3_000),
    ("food_portion",     "food_portion.csv",     ["id", "fdc_id", "seq_num", "amount", "measure_unit_id", "portion_description", "modifier", "gram_weight", "data_points", "footnote", "min_year_acquired"], 47_000),
    ("food_update_log_entry", "food_update_log_entry.csv", ["id", "description", "last_updated"],                                1_600_000),
    ("survey_fndds_food","survey_fndds_food.csv",["fdc_id", "food_code", "wweia_category_code", "start_date", "end_date"],        5_400),
    ("input_food",       "input_food.csv",       ["id", "fdc_id", "fdc_id_of_input_food", "seq_num", "amount", "sr_code", "sr_description", "unit", "portion_code", "portion_description", "gram_weight", "retention_code"], 18_500),
    ("foundation_food",  "foundation_food.csv",  ["fdc_id", "ndb_number", "footnote"],                                          1_000),
    ("sr_legacy_food",   "sr_legacy_food.csv",   ["fdc_id", "ndb_number"],                                                      8_000),
    ("sample_food",      "sample_food.csv",      ["fdc_id"],                                                                     3_900),
    ("sub_sample_food",  "sub_sample_food.csv",  ["fdc_id", "fdc_id_of_sample_food"],                                           20_000),
    ("acquisition_samples","acquisition_samples.csv",["fdc_id_of_sample_food", "fdc_id_of_acquisition_food"],                    7_400),
    ("market_acquisition","market_acquisition.csv",[
        "fdc_id", "brand_description", "expiration_date", "label_weight", "location",
        "acquisition_date", "sales_type", "sample_lot_nbr", "sell_by_date",
        "store_city", "store_name", "store_state", "upc_code", "acquisition_number",
    ], 7_400),
    ("agricultural_samples","agricultural_samples.csv",["fdc_id", "acquisition_date", "market_class", "treatment", "state"],    810),
    ("lab_method_code",  "lab_method_code.csv",  ["lab_method_id", "code"],                                                     100),
    ("lab_method_nutrient","lab_method_nutrient.csv",["lab_method_id", "nutrient_id"],                                          500),
    ("sub_sample_result","sub_sample_result.csv",["food_nutrient_id", "adjusted_amount", "lab_method_id", "nutrient_name"],     200_000),
    ("microbe",          "microbe.csv",          ["id", "food_id", "method", "microbe_code", "min_value", "max_value", "uom"],  100),

    # CSV columns with spaces/caps → remapped to snake_case table columns
    ("fndds_ingredient_nutrient_value", "fndds_ingredient_nutrient_value.csv", [
        "ingredient_code", "ingredient_description", "nutrient_code", "nutrient_value",
        "nutrient_value_source", "fdc_id", "derivation_code", "sr_addmod_year",
        "foundation_year_acquired", "start_date", "end_date",
    ], 275_000),

    # Large tables last
    ("food_attribute",   "food_attribute.csv",   ["id", "fdc_id", "seq_num", "food_attribute_type_id", "name", "value"],        2_500_000),
    ("food_nutrient",    "food_nutrient.csv",     ["id", "fdc_id", "nutrient_id", "amount", "data_points", "derivation_id", "min", "max", "median", "loq", "footnote", "min_year_acquired", "percent_daily_value"], 27_000_000),
]

LARGE_TABLE_THRESHOLD = 1_000_000  # rows


# ── Database helpers ──────────────────────────────────────────────────────────

def get_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5433")),
        user=os.getenv("POSTGRES_USER"),
        password=os.getenv("POSTGRES_PASSWORD"),
        dbname=os.getenv("POSTGRES_DB"),
    )


def create_tables(conn):
    log.info("Creating tables...")
    with conn.cursor() as cur:
        cur.execute(DDL)
    conn.commit()
    log.info("Tables ready.")


def drop_tables(conn):
    log.info("Dropping tables...")
    with conn.cursor() as cur:
        for table in DROP_ORDER:
            cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
    conn.commit()
    log.info("Tables dropped.")


def table_is_empty(conn, table: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(f"SELECT NOT EXISTS (SELECT 1 FROM {table} LIMIT 1)")
        return cur.fetchone()[0]


def load_table(conn, table: str, csv_path: Path, columns: list[str]) -> int:
    col_list = ", ".join(columns)
    sql = (
        f"COPY {table} ({col_list}) "
        f"FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '', FORCE_NULL ({col_list}))"
    )
    t0 = time.monotonic()
    with open(csv_path, "r", encoding="utf-8-sig") as fh:
        with conn.cursor() as cur:
            cur.copy_expert(sql, fh)
            row_count = cur.rowcount
    conn.commit()
    elapsed = time.monotonic() - t0
    log.info("  %-40s %10d rows  %.1fs", table, row_count, elapsed)
    return row_count


# ── Main ──────────────────────────────────────────────────────────────────────

def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--drop",       action="store_true", help="Drop all tables before creating them")
    p.add_argument("--skip-large", action="store_true", help=f"Skip tables with >{LARGE_TABLE_THRESHOLD:,} estimated rows")
    p.add_argument("--table",      metavar="NAME",      help="Load only this table (by name)")
    return p.parse_args()


def main():
    args = parse_args()

    conn = get_connection()
    log.info("Connected to %s@%s:%s/%s",
             os.getenv("POSTGRES_USER"), os.getenv("POSTGRES_HOST", "localhost"),
             os.getenv("POSTGRES_PORT", "5433"), os.getenv("POSTGRES_DB"))

    if args.drop:
        drop_tables(conn)

    create_tables(conn)

    total_rows = 0
    skipped = 0

    for table, csv_file, columns, est_rows in LOAD_CONFIG:
        if args.table and table != args.table:
            continue
        if args.skip_large and est_rows >= LARGE_TABLE_THRESHOLD:
            log.info("  %-40s skipped (est. %s rows)", table, f"{est_rows:,}")
            skipped += 1
            continue

        csv_path = CSV_DIR / csv_file
        if not csv_path.exists():
            log.warning("  %-40s CSV not found: %s", table, csv_path)
            continue

        if not args.drop and not table_is_empty(conn, table):
            log.info("  %-40s already loaded, skipping", table)
            skipped += 1
            continue

        try:
            total_rows += load_table(conn, table, csv_path, columns)
        except Exception as exc:
            conn.rollback()
            log.error("  %-40s FAILED: %s", table, exc)
            raise

    conn.close()
    log.info("Done. %d total rows loaded, %d tables skipped.", total_rows, skipped)


if __name__ == "__main__":
    main()
