import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from planner import _extract_json


# ── _extract_json: extraction correctness ────────────────────────────────────

def test_extract_json_from_code_fence():
    text = '```json\n{"days": [], "alternatives": {"breakfast": []}}\n```'
    result = _extract_json(text)
    obj = json.loads(result)
    assert "days" in obj


def test_extract_json_from_raw_brace_scan():
    text = 'Here is your plan: {"days": [], "alternatives": {}}'
    result = _extract_json(text)
    obj = json.loads(result)
    assert "days" in obj


def test_extract_json_prose_before_and_after():
    text = (
        "Here is your meal plan as requested.\n"
        '{"days": [{"day": "Day 1", "meals": []}], '
        '"alternatives": {"breakfast": [], "lunch": [], "dinner": []}}\n'
        "Hope this helps!"
    )
    result = _extract_json(text)
    obj = json.loads(result)
    assert "days" in obj
    assert "alternatives" in obj


def test_extract_json_skips_objects_without_days_key():
    text = '{"foo": "bar"} then {"days": [], "alternatives": {}}'
    result = _extract_json(text)
    obj = json.loads(result)
    assert "days" in obj


def test_extract_json_malformed_falls_back_to_text():
    text = "no json here at all"
    result = _extract_json(text)
    assert result == text


def test_extract_json_selects_first_code_fence_with_days():
    first = '{"days": [{"day": "Day 1", "meals": []}], "alternatives": {}}'
    second = '{"days": [{"day": "Day 2", "meals": []}]}'
    text = f"```json\n{first}\n```\nsome prose\n```json\n{second}\n```"
    result = _extract_json(text)
    obj = json.loads(result)
    assert obj["days"][0]["day"] == "Day 1"


# ── alternatives structure ────────────────────────────────────────────────────

SAMPLE_PLAN = {
    "days": [
        {"day": "Day 1", "meals": [
            {"name": "Breakfast: Oats"},
            {"name": "Lunch: Salad"},
            {"name": "Dinner: Soup"},
        ]}
    ],
    "nutrient_coverage": {"calories_kcal": 95},
    "suggested_swaps": [],
    "alternatives": {
        "breakfast": [
            {"name": "Greek Yogurt"},
            {"name": "Scrambled Eggs"},
            {"name": "Overnight Oats"},
            {"name": "Avocado Toast"},
            {"name": "Cottage Cheese"},
        ],
        "lunch": [
            {"name": "Chicken Salad"},
            {"name": "Lentil Soup"},
            {"name": "Rice Bowl"},
            {"name": "Turkey Wrap"},
            {"name": "Quinoa Bowl"},
        ],
        "dinner": [
            {"name": "Baked Salmon"},
            {"name": "Chicken Stir-fry"},
            {"name": "Bean Tacos"},
            {"name": "Turkey Meatballs"},
            {"name": "Lentil Dal"},
        ],
    },
}
SAMPLE_PLAN_JSON = json.dumps(SAMPLE_PLAN)


def test_alternatives_key_preserved_through_extraction():
    result = _extract_json(SAMPLE_PLAN_JSON)
    obj = json.loads(result)
    assert "alternatives" in obj


def test_alternatives_has_five_per_type():
    obj = json.loads(SAMPLE_PLAN_JSON)
    alts = obj["alternatives"]
    assert len(alts["breakfast"]) == 5
    assert len(alts["lunch"])     == 5
    assert len(alts["dinner"])    == 5


def test_alternatives_entries_have_non_empty_name():
    obj = json.loads(SAMPLE_PLAN_JSON)
    for meal_type in ("breakfast", "lunch", "dinner"):
        for alt in obj["alternatives"][meal_type]:
            assert "name" in alt
            assert isinstance(alt["name"], str)
            assert len(alt["name"]) > 0


def test_alternatives_not_empty_strings():
    obj = json.loads(SAMPLE_PLAN_JSON)
    for meal_type in ("breakfast", "lunch", "dinner"):
        names = [a["name"] for a in obj["alternatives"][meal_type]]
        assert all(n.strip() for n in names), f"Empty name found in {meal_type}"


def test_alternatives_total_count_is_15():
    obj = json.loads(SAMPLE_PLAN_JSON)
    alts = obj["alternatives"]
    total = len(alts["breakfast"]) + len(alts["lunch"]) + len(alts["dinner"])
    assert total == 15


def test_extract_json_with_alternatives_in_code_fence():
    text = f"Here is the plan:\n```json\n{SAMPLE_PLAN_JSON}\n```\nDone."
    result = _extract_json(text)
    obj = json.loads(result)
    assert "days" in obj
    assert "alternatives" in obj
    assert len(obj["alternatives"]["breakfast"]) == 5
