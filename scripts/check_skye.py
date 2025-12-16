#!/usr/bin/env python3
"""
Check all transactions for SKYE AT HOLLAND in the database
"""
import sys
import os
import pandas as pd
from pathlib import Path

# Add backend to path
backend_dir = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from services.data_processor import get_filtered_transactions, normalize_project_name

# Get all transactions for D10
print("=" * 80)
print("Checking SKYE AT HOLLAND transactions in District D10")
print("=" * 80)

df = get_filtered_transactions(districts=["D10"])

if df.empty:
    print("No transactions found for D10")
    sys.exit(1)

print(f"\nTotal transactions in D10: {len(df)}")

# Find all project names that contain "SKYE" or "HOLLAND"
skye_projects = df[df["project_name"].str.contains("SKYE", case=False, na=False) | 
                   df["project_name"].str.contains("HOLLAND", case=False, na=False)]

print(f"\nProjects containing 'SKYE' or 'HOLLAND': {len(skye_projects)}")

if len(skye_projects) > 0:
    print("\nUnique project names (raw):")
    unique_names = skye_projects["project_name"].unique()
    for name in sorted(unique_names):
        count = len(skye_projects[skye_projects["project_name"] == name])
        normalized = normalize_project_name(name)
        print(f"  '{name}' -> normalized: '{normalized}' ({count} transactions)")

# Specifically check for SKYE AT HOLLAND variations
print("\n" + "=" * 80)
print("Checking for SKYE AT HOLLAND specifically:")
print("=" * 80)

# Check exact matches and normalized matches
skye_variations = [
    "SKYE AT HOLLAND",
    "Skye At Holland",
    "skye at holland",
    "SKYE AT HOLLAND ",
    "Skye At Holland ",
]

for variation in skye_variations:
    exact_match = df[df["project_name"] == variation]
    normalized_variation = normalize_project_name(variation)
    normalized_match = df[df["project_name"].apply(normalize_project_name) == normalized_variation]
    
    if len(exact_match) > 0:
        print(f"\nExact match '{variation}': {len(exact_match)} transactions")
        print(f"  Normalized: '{normalized_variation}'")
        print(f"  Transactions with normalized match: {len(normalized_match)}")
        
        if len(exact_match) > 0:
            print(f"\n  Sample transactions:")
            for idx, row in exact_match.head(5).iterrows():
                print(f"    - {row['project_name']} | Bedroom: {row.get('bedroom_count', 'N/A')} | Price: ${row.get('price', 0):,.0f} | Date: {row.get('sale_date', 'N/A')}")

# Check all transactions that normalize to "SKYE AT HOLLAND"
normalized_skye = normalize_project_name("SKYE AT HOLLAND")
all_normalized = df[df["project_name"].apply(normalize_project_name) == normalized_skye]

print(f"\n" + "=" * 80)
print(f"All transactions that normalize to '{normalized_skye}': {len(all_normalized)}")
print("=" * 80)

if len(all_normalized) > 0:
    print(f"\nUnique raw project names that normalize to this:")
    for name in all_normalized["project_name"].unique():
        count = len(all_normalized[all_normalized["project_name"] == name])
        print(f"  '{name}' ({count} transactions)")
    
    print(f"\nBreakdown by bedroom type:")
    if "bedroom_count" in all_normalized.columns:
        bedroom_counts = all_normalized["bedroom_count"].value_counts().sort_index()
        for bed, count in bedroom_counts.items():
            print(f"  {bed} bedroom: {count} transactions")
    
    print(f"\nTotal volume: ${all_normalized['price'].sum():,.0f}")
    print(f"Total quantity: {len(all_normalized)}")
else:
    print("\n⚠️  NO TRANSACTIONS FOUND that normalize to 'SKYE AT HOLLAND'")
    print("\nChecking similar project names in D10:")
    all_projects = df["project_name"].unique()
    similar = [p for p in all_projects if "SKYE" in normalize_project_name(p) or "HOLLAND" in normalize_project_name(p)]
    for name in sorted(similar):
        count = len(df[df["project_name"] == name])
        normalized = normalize_project_name(name)
        print(f"  '{name}' -> '{normalized}' ({count} transactions)")

