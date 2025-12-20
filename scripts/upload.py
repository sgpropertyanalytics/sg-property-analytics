"""
Upload Script - Loads CSV data into Transaction table and triggers computation

Memory-efficient design for 512MB Render limit:
1. Process one CSV at a time, save to DB, clear memory
2. Deduplicate using SQL after all data loaded
3. Remove outliers using SQL-based IQR calculation (no pandas needed)

Pipeline: **Load Raw** → **Validate/Filter** → Store in DB → **Compute Stats**

CRITICAL: This script now preserves ALL CSV columns end-to-end.
The following columns are now imported (previously dropped):
  - Street Name → street_name
  - Floor Range → floor_range, floor_level (classified)
  - No. of Units → num_units
  - Nett Price ($) → nett_price
  - Type of Area → type_of_area
  - Market Segment → market_segment
"""

import sys
import os
import gc
import re

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db
from models.transaction import Transaction
from services.data_loader import clean_csv_data, parse_date_flexible
from services.data_computation import recompute_all_stats
from services.data_validation import (
    filter_outliers_sql,
    remove_duplicates_sql,
    print_iqr_statistics
)
import pandas as pd
from datetime import datetime


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def _safe_str(value, default='') -> str:
    """Safely convert a value to string, handling NaN/None."""
    if pd.isna(value) or value is None:
        return default
    return str(value).strip() if str(value).strip() != 'nan' else default


def _safe_float(value, default=0.0) -> float:
    """Safely convert a value to float, handling NaN/None."""
    if pd.isna(value) or value is None:
        return default
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def _safe_int(value, default=None):
    """Safely convert a value to int, handling NaN/None."""
    if pd.isna(value) or value is None:
        return default
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return default


def _parse_lease_info(tenure_str: str, current_year: int):
    """
    Parse lease start year and remaining lease from tenure string.

    Returns:
        Tuple of (lease_start_year, remaining_lease)
    """
    if not tenure_str or tenure_str == 'nan':
        return None, None

    tenure_str = str(tenure_str)

    # Freehold properties
    if "freehold" in tenure_str.lower() or "estate in perpetuity" in tenure_str.lower():
        return None, 999

    # Try to extract lease start year
    lease_start_year = None
    remaining_lease = None

    # Pattern 1: "from 2020" or "commencing from 2020"
    match = re.search(r"(?:from|commencing)\s+(\d{4})", tenure_str.lower())
    if match:
        try:
            year = int(match.group(1))
            lease_start_year = year
            remaining_lease = 99 - (current_year - year)
            if remaining_lease < 0:
                remaining_lease = 0
        except ValueError:
            pass

    # Pattern 2: Fallback to any 4-digit year
    if lease_start_year is None:
        fallback = re.search(r"(\d{4})", tenure_str)
        if fallback:
            try:
                year = int(fallback.group(1))
                lease_start_year = year
                remaining_lease = 99 - (current_year - year)
                if remaining_lease < 0:
                    remaining_lease = 0
            except ValueError:
                pass

    return lease_start_year, remaining_lease


def process_and_save_csv(csv_path: str, sale_type: str, app):
    """
    Process a single CSV file and save directly to database.
    Clears memory after saving to minimize footprint.

    CRITICAL: This function now maps ALL CSV columns to the Transaction model.
    No columns are dropped.

    Returns:
        Count of rows saved.
    """
    print(f"  Loading: {os.path.basename(csv_path)}")

    try:
        # Try different encodings for CSV files
        encodings = ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']
        df = None
        for encoding in encodings:
            try:
                df = pd.read_csv(csv_path, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue

        if df is None:
            print(f"    ⚠️  Could not decode {csv_path} with any encoding")
            return 0

        # Store original column count for debugging
        original_cols = len(df.columns)

        # Clean data using existing logic (now preserves all columns)
        df = clean_csv_data(df)

        if df.empty:
            print(f"    ⚠️  No valid data after cleaning")
            return 0

        # Override sale_type from folder structure
        df['sale_type'] = sale_type

        # Save to database in batches
        batch_size = 500
        total_rows = len(df)
        saved = 0
        current_year = datetime.now().year

        with app.app_context():
            for idx in range(0, total_rows, batch_size):
                batch = df.iloc[idx:idx+batch_size]
                transactions = []

                for _, row in batch.iterrows():
                    try:
                        # === Parse transaction_date ===
                        transaction_date = None
                        if 'transaction_date' in row and pd.notna(row['transaction_date']):
                            if isinstance(row['transaction_date'], str):
                                try:
                                    transaction_date = pd.to_datetime(row['transaction_date']).date()
                                except:
                                    year, month = parse_date_flexible(row['transaction_date'])
                                    if year and month:
                                        from datetime import date
                                        transaction_date = date(year, month, 1)
                            elif hasattr(row['transaction_date'], 'date'):
                                transaction_date = row['transaction_date'].date()

                        # === Parse lease columns from Tenure ===
                        tenure_str = _safe_str(row.get('tenure') or row.get('Tenure'))
                        lease_start_year, remaining_lease = _parse_lease_info(tenure_str, current_year)

                        # === Get project name ===
                        project_name = _safe_str(
                            row.get('project_name') or row.get('Project Name'),
                            default=''
                        )

                        # === Get property type ===
                        property_type = _safe_str(
                            row.get('property_type') or row.get('Property Type'),
                            default='Condominium'
                        )

                        # === Create Transaction with ALL columns ===
                        transaction = Transaction(
                            # Core required fields
                            project_name=project_name,
                            transaction_date=transaction_date,
                            contract_date=_safe_str(row.get('contract_date')),
                            price=_safe_float(row.get('price')),
                            area_sqft=_safe_float(row.get('area_sqft')),
                            psf=_safe_float(row.get('psf')),
                            district=_safe_str(row.get('district')),
                            bedroom_count=_safe_int(row.get('bedroom_count'), default=1),
                            property_type=property_type,
                            sale_type=_safe_str(row.get('sale_type')),
                            tenure=tenure_str if tenure_str else None,
                            lease_start_year=lease_start_year,
                            remaining_lease=remaining_lease,

                            # NEW: Previously dropped columns
                            street_name=_safe_str(row.get('street_name')) or None,
                            floor_range=_safe_str(row.get('floor_range')) or None,
                            floor_level=_safe_str(row.get('floor_level')) or None,
                            num_units=_safe_int(row.get('num_units')),
                            nett_price=_safe_float(row.get('nett_price')) if row.get('nett_price') else None,
                            type_of_area=_safe_str(row.get('type_of_area')) or None,
                            market_segment=_safe_str(row.get('market_segment')) or None,
                        )

                        transactions.append(transaction)
                    except Exception as e:
                        # Log error but continue processing
                        continue

                if transactions:
                    db.session.bulk_save_objects(transactions)
                    db.session.commit()
                    saved += len(transactions)

            # Print summary with column info
            print(f"    ✓ Saved {saved:,} rows (from {original_cols} CSV columns)")

        # Clear memory
        del df
        gc.collect()

        return saved

    except Exception as e:
        print(f"    ⚠️  Error: {e}")
        import traceback
        traceback.print_exc()
        return 0


def main():
    """Main upload function - memory efficient design"""
    print("=" * 60)
    print("CSV Upload Script - Memory Efficient Design")
    print("=" * 60)

    app = create_app()

    with app.app_context():
        # Create tables if they don't exist
        db.create_all()

        # Check if data already exists
        existing_count = db.session.query(Transaction).count()
        if existing_count > 0:
            response = input(f"\n⚠️  Found {existing_count:,} existing transactions. Clear and reload? (yes/no): ")
            if response.lower() == 'yes':
                print("  Clearing existing transactions...")
                db.session.query(Transaction).delete()
                db.session.commit()
                print("  ✓ Cleared")
            else:
                print("  Keeping existing data. New data will be appended.")

    # Load CSV files
    csv_folder = os.path.join(os.path.dirname(__file__), '..', 'rawdata')

    if not os.path.exists(csv_folder):
        print(f"\n❌ Error: CSV folder not found: {csv_folder}")
        return

    print(f"\n📂 Loading CSV files from: {csv_folder}")

    total_saved = 0

    # Process New Sale CSVs one at a time
    new_sale_folder = os.path.join(csv_folder, 'New Sale')
    if os.path.exists(new_sale_folder):
        print("\n📊 Processing New Sale data...")
        for filename in sorted(os.listdir(new_sale_folder)):
            if filename.endswith('.csv'):
                csv_path = os.path.join(new_sale_folder, filename)
                saved = process_and_save_csv(csv_path, 'New Sale', app)
                total_saved += saved
                gc.collect()  # Force garbage collection

    # Process Resale CSVs one at a time
    resale_folder = os.path.join(csv_folder, 'Resale')
    if os.path.exists(resale_folder):
        print("\n📊 Processing Resale data...")
        for filename in sorted(os.listdir(resale_folder)):
            if filename.endswith('.csv'):
                csv_path = os.path.join(resale_folder, filename)
                saved = process_and_save_csv(csv_path, 'Resale', app)
                total_saved += saved
                gc.collect()  # Force garbage collection

    if total_saved == 0:
        print("\n❌ No CSV files found or all files were empty.")
        return

    print(f"\n📊 Total rows loaded: {total_saved:,}")

    # Validate and filter data using centralized data_validation module
    with app.app_context():
        # Step 1: Remove duplicates
        print("\n🔍 Removing duplicates using SQL...")
        duplicates_removed = remove_duplicates_sql()
        print(f"  ✓ Removed {duplicates_removed:,} duplicates")

        # Step 2: Filter outliers using IQR
        print("\n🔍 Filtering outliers using IQR method (SQL-based)...")
        outliers_excluded, stats = filter_outliers_sql()
        print_iqr_statistics(stats)
        print(f"  ✓ Removed {outliers_excluded:,} outliers")

        # Step 3: Verify final count
        final_count = db.session.query(Transaction).count()
        print(f"\n✓ Upload complete! Final transaction count: {final_count:,}")

        # Step 4: Compute stats
        print("\n" + "=" * 60)
        print("Triggering data computation service...")
        print("=" * 60)

        recompute_all_stats(outliers_excluded=outliers_excluded)

    # Step 5: Update project locations (optional - can be run separately)
    try:
        from services.project_location_service import run_incremental_update
        print("\n" + "=" * 60)
        print("Updating project locations...")
        print("=" * 60)
        run_incremental_update(app, geocode_limit=50)
    except ImportError as e:
        print(f"\n⚠️  Project location update skipped (module not found): {e}")
    except Exception as e:
        print(f"\n⚠️  Project location update failed (non-critical): {e}")

    print("\n" + "=" * 60)
    print("✓ All done! Data loaded, validated, and analytics pre-computed.")
    print("=" * 60)


if __name__ == "__main__":
    main()
