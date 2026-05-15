import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from nutrition import (
    UserProfile,
    calculate_bmr,
    calculate_tdee,
    calculate_personalized_dv,
    score_food,
)


def _profile(**overrides) -> UserProfile:
    base = dict(
        height_cm=170.0, weight_kg=70.0, age=30,
        sex="male", activity_level="moderately_active",
        smoking_status="non_smoker", pregnancy_status="not_pregnant",
        health_goals=[], health_conditions=[],
    )
    base.update(overrides)
    return UserProfile(**base)


# ── calculate_bmr ──────────────────────────────────────────────────────────────

def test_bmr_male_formula_correct():
    profile = _profile(sex="male", weight_kg=80, height_cm=180, age=30)
    # Mifflin-St Jeor male: 10w + 6.25h - 5a + 5
    expected = 10 * 80 + 6.25 * 180 - 5 * 30 + 5
    assert calculate_bmr(profile) == expected


def test_bmr_female_lower_than_male():
    male = _profile(sex="male")
    female = _profile(sex="female")
    # Female formula subtracts 166 more than male
    assert calculate_bmr(female) < calculate_bmr(male)


# ── calculate_tdee ─────────────────────────────────────────────────────────────

def test_tdee_applies_correct_multiplier():
    profile = _profile(activity_level="moderately_active")
    assert abs(calculate_tdee(profile) - calculate_bmr(profile) * 1.55) < 0.01


def test_tdee_unknown_activity_falls_back_to_sedentary():
    profile = _profile(activity_level="quantum_jogging")
    # Unknown key defaults to 1.2 (sedentary)
    assert abs(calculate_tdee(profile) - calculate_bmr(profile) * 1.2) < 0.01


# ── calculate_personalized_dv ──────────────────────────────────────────────────

def test_dv_hypertension_lowers_sodium_target():
    profile = _profile(health_conditions=["hypertension"])
    dv = calculate_personalized_dv(profile)
    assert dv["sodium_mg"] == 1500.0


def test_dv_healthy_profile_uses_standard_sodium():
    profile = _profile(health_conditions=[])
    dv = calculate_personalized_dv(profile)
    assert dv["sodium_mg"] == 2300.0


# ── score_food ─────────────────────────────────────────────────────────────────

def test_score_food_nutrient_dense_food_is_positive():
    dv = {
        "protein_g": 50, "fiber_g": 28, "calcium_mg": 1000, "iron_mg": 18,
        "calories_kcal": 2000, "saturated_fat_g": 20,
        "sodium_mg": 2300, "added_sugars_g": 50,
    }
    nutrients = {"protein_g": 30, "fiber_g": 8, "calcium_mg": 200}
    assert score_food(nutrients, dv) > 0


def test_score_food_high_penalty_nutrients_scores_lower_than_clean():
    dv = {
        "protein_g": 50, "fiber_g": 28, "calcium_mg": 1000, "iron_mg": 18,
        "calories_kcal": 2000, "saturated_fat_g": 20,
        "sodium_mg": 2300, "added_sugars_g": 50,
    }
    clean = {"protein_g": 25, "fiber_g": 5}
    junk = {"saturated_fat_g": 20, "sodium_mg": 2300, "added_sugars_g": 50}
    assert score_food(clean, dv) > score_food(junk, dv)


# ── Pregnancy / smoking adjustments ───────────────────────────────────────────

def test_dv_pregnancy_increases_folate():
    baseline = _profile(sex="female", pregnancy_status="not_pregnant")
    pregnant = _profile(sex="female", pregnancy_status="pregnant")
    assert calculate_personalized_dv(pregnant)["folate_mcg"] > \
           calculate_personalized_dv(baseline)["folate_mcg"]


def test_dv_smoker_gets_extra_vitamin_c():
    non_smoker = _profile(smoking_status="non_smoker")
    smoker = _profile(smoking_status="smoker")
    assert calculate_personalized_dv(smoker)["vitamin_c_mg"] > \
           calculate_personalized_dv(non_smoker)["vitamin_c_mg"]


# ── Calorie targets ────────────────────────────────────────────────────────────

def test_dv_weight_loss_goal_reduces_calories():
    maintenance = _profile(health_goals=[])
    deficit = _profile(health_goals=["weight_loss"])
    assert calculate_personalized_dv(deficit)["calories_kcal"] < \
           calculate_personalized_dv(maintenance)["calories_kcal"]


def test_dv_muscle_gain_goal_increases_calories():
    maintenance = _profile(health_goals=[])
    bulk = _profile(health_goals=["muscle_gain"])
    assert calculate_personalized_dv(bulk)["calories_kcal"] > \
           calculate_personalized_dv(maintenance)["calories_kcal"]


# ── Diabetes adjustments ───────────────────────────────────────────────────────

def test_dv_diabetes_caps_added_sugars():
    diabetic = _profile(health_conditions=["diabetes"])
    dv = calculate_personalized_dv(diabetic)
    assert dv["added_sugars_g"] <= 25.0


def test_dv_no_diabetes_allows_higher_added_sugars():
    healthy = _profile(health_conditions=[])
    dv = calculate_personalized_dv(healthy)
    assert dv["added_sugars_g"] > 25.0
