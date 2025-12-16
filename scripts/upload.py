"""
Upload Script - Loads CSV data into Transaction table and triggers aggregation

This script:
1. Loads all CSV files using existing data_loader logic
2. Saves transactions to SQLAlchemy Transaction table
3. Triggers aggregation_service to pre-compute all analytics
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from flask import Flask
from config import Config
from models.database import db
from models.transaction import Transaction
from services.data_loader import clean_csv_data, parse_date_flexible
from services.classifier import classify_bedroom
from services.data_processor import _add_lease_columns, _get_market_segment
from services.aggregation_service import recompute_all_stats
import pandas as pd
from datetime import datetime


def create_app():
    """Create Flask app for database access"""
    app = Flask(__name__)
    app.config.from_object(Config)
    db.init_app(app)
    return app


def load_csv_to_transactions(csv_path: str, sale_type: str) -> pd.DataFrame:
    """
    Load a single CSV file and return cleaned DataFrame.
    Uses existing data_loader logic.
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
            return pd.DataFrame()
        
        df = clean_csv_data(df)
        
        # Add sale_type column
        df['sale_type'] = sale_type
        
        return df
    except Exception as e:
        print(f"    ⚠️  Error loading {csv_path}: {e}")
        return pd.DataFrame()


def save_dataframe_to_db(df: pd.DataFrame, app):
    """
    Save DataFrame rows to Transaction table.
    Maps DataFrame columns to Transaction model fields.
    """
    with app.app_context():
        batch_size = 1000
        total_rows = len(df)
        saved = 0
        
        print(f"  Saving {total_rows:,} transactions to database...")
        
        for idx in range(0, total_rows, batch_size):
            batch = df.iloc[idx:idx+batch_size]
            transactions = []
            
            for _, row in batch.iterrows():
                try:
                    # Parse transaction_date
                    transaction_date = None
                    if 'transaction_date' in row and pd.notna(row['transaction_date']):
                        if isinstance(row['transaction_date'], str):
                            year, month = parse_date_flexible(row['transaction_date'])
                            if year and month:
                                from datetime import date
                                # Use first day of month as default
                                transaction_date = date(year, month, 1)
                        elif hasattr(row['transaction_date'], 'date'):
                            transaction_date = row['transaction_date'].date()
                        elif isinstance(row['transaction_date'], tuple):
                            # Handle tuple (year, month) from parse_date_flexible
                            year, month = row['transaction_date']
                            if year and month:
                                from datetime import date
                                transaction_date = date(year, month, 1)
                    
                    # Parse lease columns if Tenure exists
                    lease_start_year = None
                    remaining_lease = None
                    if 'Tenure' in row and pd.notna(row['Tenure']):
                        tenure_str = str(row['Tenure'])
                        current_year = datetime.now().year
                        
                        # Parse lease start year (simplified - can use _add_lease_columns logic)
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
                    
                    # Map column names (clean_csv_data returns 'project_name', not 'Project Name')
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
                    print(f"    ⚠️  Error processing row: {e}")
                    continue
            
            # Bulk insert
            if transactions:
                db.session.bulk_save_objects(transactions)
                saved += len(transactions)
            
            if (idx + batch_size) % 5000 == 0:
                print(f"    Progress: {saved:,} / {total_rows:,} ({saved*100//total_rows}%)")
        
        # Commit all transactions
        db.session.commit()
        print(f"  ✓ Saved {saved:,} transactions")
        
        return saved


def main():
    """Main upload function"""
    print("=" * 60)
    print("CSV Upload Script - Loading data into Transaction table")
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
        
        all_dataframes = []
        
        # Load New Sale CSVs
        new_sale_folder = os.path.join(csv_folder, 'New Sale')
        if os.path.exists(new_sale_folder):
            print("\n📊 Loading New Sale data...")
            for filename in os.listdir(new_sale_folder):
                if filename.endswith('.csv'):
                    csv_path = os.path.join(new_sale_folder, filename)
                    df = load_csv_to_transactions(csv_path, 'New Sale')
                    if not df.empty:
                        all_dataframes.append(df)
        
        # Load Resale CSVs
        resale_folder = os.path.join(csv_folder, 'Resale')
        if os.path.exists(resale_folder):
            print("\n📊 Loading Resale data...")
            for filename in os.listdir(resale_folder):
                if filename.endswith('.csv'):
                    csv_path = os.path.join(resale_folder, filename)
                    df = load_csv_to_transactions(csv_path, 'Resale')
                    if not df.empty:
                        all_dataframes.append(df)
        
        if not all_dataframes:
            print("\n❌ No CSV files found or all files were empty.")
            return
        
        # Combine all DataFrames
        print("\n📊 Combining all data...")
        combined_df = pd.concat(all_dataframes, ignore_index=True)
        print(f"  Total rows: {len(combined_df):,}")
        
        # Remove duplicates (same project, date, price, area)
        print("\n🔍 Removing duplicates...")
        before_dedup = len(combined_df)
        
        # Check which columns exist for deduplication
        # clean_csv_data returns 'project_name', not 'Project Name'
        dedup_cols = []
        
        # Find project name column
        project_col = None
        if 'project_name' in combined_df.columns:
            project_col = 'project_name'
        elif 'Project Name' in combined_df.columns:
            project_col = 'Project Name'
            combined_df['project_name'] = combined_df['Project Name']
            project_col = 'project_name'
        
        if project_col:
            dedup_cols.append(project_col)
        
        # Add other deduplication columns
        for col in ['transaction_date', 'price', 'area_sqft']:
            if col in combined_df.columns:
                dedup_cols.append(col)
        
        if dedup_cols:
            combined_df = combined_df.drop_duplicates(subset=dedup_cols, keep='first')
        else:
            print("  ⚠️  Could not find columns for deduplication, skipping...")
        
        after_dedup = len(combined_df)
        print(f"  Removed {before_dedup - after_dedup:,} duplicates")
        
        # Save to database
        print("\n💾 Saving to database...")
        saved_count = save_dataframe_to_db(combined_df, app)
        
        # Verify
        final_count = db.session.query(Transaction).count()
        print(f"\n✓ Upload complete! Total transactions in database: {final_count:,}")
        
        # Trigger aggregation
        print("\n" + "=" * 60)
        print("Triggering aggregation service...")
        print("=" * 60)
        recompute_all_stats()
        
        print("\n" + "=" * 60)
        print("✓ All done! Data loaded and analytics pre-computed.")
        print("=" * 60)


if __name__ == "__main__":
    main()

