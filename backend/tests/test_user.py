import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from user import _display_name, _snake, _categorise, derive_grocery_list


# ── _snake ─────────────────────────────────────────────────────────────────────

def test_snake_converts_spaces_to_underscores():
    assert _snake("Lightly Active") == "lightly_active"


def test_snake_leaves_already_normalized_string_unchanged():
    assert _snake("sedentary") == "sedentary"


# ── _display_name ──────────────────────────────────────────────────────────────

def test_display_name_strips_usda_preparation_noise():
    result = _display_name("Chicken, broilers or fryers, breast, meat only, cooked")
    assert "broilers" not in result.lower()
    assert "fryers" not in result.lower()
    assert "cooked" not in result.lower()


def test_display_name_applies_normalization_table():
    # "Peppers, bell, raw" → cleaned to "Peppers Bell" → mapped to "Bell Peppers"
    result = _display_name("Peppers, bell, raw")
    assert result == "Bell Peppers"


def test_display_name_drops_generic_fish_prefix():
    # "Fish, salmon, Atlantic" → drops "Fish" → "Salmon Atlantic" or similar
    result = _display_name("Fish, salmon, Atlantic")
    assert not result.lower().startswith("fish")


def test_display_name_drops_spices_prefix():
    # "Spices, garlic powder" → "Garlic Powder"
    result = _display_name("Spices, garlic powder")
    assert "Spices" not in result
    assert "Garlic" in result


# ── _categorise ────────────────────────────────────────────────────────────────

def test_categorise_seafood_keyword_returns_meat_seafood():
    assert _categorise("Salmon Fillet") == "Meat & Seafood"


def test_categorise_unknown_food_returns_other():
    assert _categorise("Exotic Kumquat Extract Blend") == "Other"


def test_categorise_dairy_keyword_returns_correct_category():
    assert _categorise("Whole Milk") == "Dairy & Eggs"


def test_categorise_nut_butter_not_miscategorised_as_dairy():
    # "almond butter" must match Nuts & Seeds before the dairy "butter" rule
    assert _categorise("Almond Butter") == "Nuts & Seeds"


# ── derive_grocery_list ────────────────────────────────────────────────────────

def test_derive_grocery_list_categorises_known_food():
    foods = [{"fdc_id": 1, "name": "Salmon Fillet"}]
    result = derive_grocery_list(foods)
    assert "Meat & Seafood" in result["grocery_list"]
    items = result["grocery_list"]["Meat & Seafood"]
    assert items[0]["name"] == "Salmon Fillet"


def test_derive_grocery_list_empty_input_returns_empty():
    result = derive_grocery_list([])
    assert result == {"grocery_list": {}}


def test_derive_grocery_list_item_has_required_fields():
    foods = [{"fdc_id": 42, "name": "Broccoli"}]
    item = derive_grocery_list(foods)["grocery_list"]["Produce"][0]
    assert "quantity_needed" in item
    assert "serving_size_g" in item
    assert item["fdc_id"] == 42


def test_derive_grocery_list_unknown_food_lands_in_other():
    foods = [{"fdc_id": 0, "name": "Exotic Kumquat Extract"}]
    result = derive_grocery_list(foods)
    assert "Other" in result["grocery_list"]
