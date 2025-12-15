#!/usr/bin/env python3
"""
Debug Script: Yearly Transaction Count

Diagnoses the data disconnect by showing transaction counts per year
from the SQLite database (where app.py reads from).
"""

import sqlite3
import pandas as pd
from datetime import datetime

DB_PATH = "condo_master.db"
MASTER_TABLE = "master_transactions"

def parse_contract_date(date_str: str):
    """Parse URA contract date format (MMYY) to year."""
    if not date_str or len(str(date_str)) != 4:
        return None
    try:
        year = int(str(date_str)[2:])
        return 2000 + year if year < 50 else 1900 + year
    except:
        return None

def debug_yearly_counts():
    """Print yearly transaction counts from database."""
    print("="*70)
    print("YEARLY TRANSACTION COUNT DIAGNOSIS")
    print("="*70)
    
    try:
        conn = sqlite3.connect(DB_PATH)
        
        # Check if table exists
        cursor = conn.cursor()
        cursor.execute(f"""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='{MASTER_TABLE}'
        """)
        if not cursor.fetchone():
            print(f"\n✗ ERROR: Table '{MASTER_TABLE}' does not exist in {DB_PATH}")
            print("   Run the ETL pipeline first: python run_etl.py")
            conn.close()
            return
        
        # Load all transactions
        df = pd.read_sql_query(f"SELECT * FROM {MASTER_TABLE}", conn)
        conn.close()
        
        if df.empty:
            print(f"\n✗ ERROR: Table '{MASTER_TABLE}' is empty")
            print("   Run the ETL pipeline first: python run_etl.py")
            return
        
        print(f"\n✓ Total rows in database: {len(df)}")
        
        # Extract years from transaction_date or contract_date
        years = []
        
        if 'transaction_date' in df.columns:
            # Use transaction_date where available
            df['parsed_date'] = pd.to_datetime(df['transaction_date'], errors='coerce')
            valid_dates = df[df['parsed_date'].notna()]
            years.extend(valid_dates['parsed_date'].dt.year.tolist())
        
        # Fallback to contract_date for remaining rows
        if 'contract_date' in df.columns:
            remaining = df[df['parsed_date'].isna()] if 'parsed_date' in df.columns else df
            if not remaining.empty:
                contract_years = remaining['contract_date'].apply(parse_contract_date)
                valid_years = contract_years[contract_years.notna()]
                years.extend(valid_years.tolist())
        
        if not years:
            print("\n✗ ERROR: No valid dates found in database")
            print("   Check date parsing in extract_web_scrape.py")
            return
        
        # Count by year
        year_counts = pd.Series(years).value_counts().sort_index()
        
        print("\n" + "-"*70)
        print("TRANSACTION COUNT BY YEAR")
        print("-"*70)
        
        # Show 2020-2025 (expected range)
        for year in range(2020, 2026):
            count = year_counts.get(year, 0)
            status = "✓" if count > 0 else "✗ MISSING"
            print(f"  {status} {year}: {count:,} transactions")
        
        # Show other years if any
        other_years = year_counts[~year_counts.index.isin(range(2020, 2026))]
        if len(other_years) > 0:
            print("\n  Other years found:")
            for year, count in other_years.items():
                print(f"    {year}: {count:,} transactions")
        
        # Summary
        total_with_dates = len(years)
        print("\n" + "-"*70)
        print(f"SUMMARY:")
        print(f"  Total transactions with valid dates: {total_with_dates:,}")
        print(f"  Years with data: {len(year_counts)}")
        print(f"  Missing years (2020-2025): {[y for y in range(2020, 2026) if year_counts.get(y, 0) == 0]}")
        print("="*70)
        
    except FileNotFoundError:
        print(f"\n✗ ERROR: Database file '{DB_PATH}' not found")
        print("   Run the ETL pipeline first: python run_etl.py")
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_yearly_counts()

