"""
Upload Script - Loads CSV data into Transaction table and triggers computation

Memory-efficient design for 512MB Render limit:
1. Process one CSV at a time, save to DB, clear memory
2. Deduplicate using SQL after all data loaded
3. Remove outliers using SQL-based IQR calculation (no pandas needed)

Pipeline: **Load Raw** → **Validate/Filter** → Store in DB → **Compute Stats**
"""

import sys
import os
import gc

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


def process_and_save_csv(csv_path: str, sale_type: str, app):
    """
    Process a single CSV file and save directly to database.
    Clears memory after saving to minimize footprint.
    Returns count of rows saved.
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

        # Clean data using existing logic
        df = clean_csv_data(df)

        if df.empty:
            print(f"    ⚠️  No valid data after cleaning")
            return 0

        # Add sale_type column
        df['sale_type'] = sale_type

        # Save to database in batches
        batch_size = 500
        total_rows = len(df)
        saved = 0

        with app.app_context():
            for idx in range(0, total_rows, batch_size):
                batch = df.iloc[idx:idx+batch_size]
                transactions = []

                for _, row in batch.iterrows():
                    try:
                        # Parse transaction_date
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

                        # Parse lease columns if Tenure exists
                        lease_start_year = None
                        remaining_lease = None
                        if 'Tenure' in row and pd.notna(row['Tenure']):
                            tenure_str = str(row['Tenure'])
                            current_year = datetime.now().year

                            import re
                            if "freehold" in tenure_str.lower() or "estate in perpetuity" in tenure_str.lower():
                                remaining_lease = 999
                            else:
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

                        project_name = row.get('project_name') or row.get('Project Name', '')
                        property_type = row.get('Property Type') or row.get('property_type', 'Condominium')

                        transaction = Transaction(
                            project_name=str(project_name) if pd.notna(project_name) else '',
                            transaction_date=transaction_date,
                            contract_date=str(row.get('contract_date', '')) if pd.notna(row.get('contract_date')) else None,
                            price=float(row['price']) if pd.notna(row['price']) else 0.0,
                            area_sqft=float(row['area_sqft']) if pd.notna(row['area_sqft']) else 0.0,
                            psf=float(row['psf']) if pd.notna(row['psf']) else 0.0,
                            district=str(row['district']) if pd.notna(row['district']) else '',
                            bedroom_count=int(row['bedroom_count']) if pd.notna(row['bedroom_count']) else 1,
                            property_type=str(property_type) if pd.notna(property_type) else 'Condominium',
                            sale_type=str(row.get('sale_type', '')) if pd.notna(row.get('sale_type')) else None,
                            tenure=str(row.get('Tenure', '')) if pd.notna(row.get('Tenure')) else None,
                            lease_start_year=lease_start_year,
                            remaining_lease=remaining_lease
                        )

                        transactions.append(transaction)
                    except Exception as e:
                        continue

                if transactions:
                    db.session.bulk_save_objects(transactions)
                    db.session.commit()
                    saved += len(transactions)

            print(f"    ✓ Saved {saved:,} rows")

        # Clear memory
        del df
        gc.collect()

        return saved

    except Exception as e:
        print(f"    ⚠️  Error: {e}")
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

    print("\n" + "=" * 60)
    print("✓ All done! Data loaded, validated, and analytics pre-computed.")
    print("=" * 60)


if __name__ == "__main__":
    main()
