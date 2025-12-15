#!/usr/bin/env python3
"""
Offline ETL Pipeline - CSV to Database

Reads all CSV files from rawdata/ folder and loads them into condo_master.db.
100% offline - no internet dependencies.

Usage:
    python run_etl.py
"""

import pandas as pd
import sqlite3
import os
from datetime import datetime
from typing import Optional
from classifier import classify_bedroom

DB_PATH = "condo_master.db"
MASTER_TABLE = "master_transactions"
CSV_FOLDER = "rawdata"

# Month name to number mapping
MONTH_MAP = {
    'jan': 1, 'january': 1,
    'feb': 2, 'february': 2,
    'mar': 3, 'march': 3,
    'apr': 4, 'april': 4,
    'may': 5,
    'jun': 6, 'june': 6,
    'jul': 7, 'july': 7,
    'aug': 8, 'august': 8,
    'sep': 9, 'september': 9, 'sept': 9,
    'oct': 10, 'october': 10,
    'nov': 11, 'november': 11,
    'dec': 12, 'december': 12
}


def init_database():
    """Initialize the master database with master_transactions table."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute(f"""
        CREATE TABLE IF NOT EXISTS {MASTER_TABLE} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_name TEXT NOT NULL,
            transaction_date TEXT,
            contract_date TEXT,
            price REAL NOT NULL,
            area_sqft REAL NOT NULL,
            psf REAL NOT NULL,
            district TEXT NOT NULL,
            bedroom_count INTEGER,
            property_type TEXT,
            source TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(project_name, contract_date, price, area_sqft, district)
        )
    """)
    
    # Create indexes for performance
    cursor.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_transaction_date 
        ON {MASTER_TABLE}(transaction_date)
    """)
    
    cursor.execute(f"""
        CREATE INDEX IF NOT EXISTS idx_district 
        ON {MASTER_TABLE}(district)
    """)
    
    conn.commit()
    conn.close()


def parse_date_flexible(date_str):
    """
    Robust date parser for formats like "Dec-20", "Mar-21", "Oct 2023", etc.
    Returns (year, month) tuple or (None, None) if parsing fails.
    """
    if pd.isna(date_str) or date_str == '' or str(date_str).lower() == 'nan':
        return None, None
    
    date_str = str(date_str).strip()
    
    # Format 1: "Dec-20" or "Mar-21" (abbreviated month-year)
    if '-' in date_str:
        parts = date_str.split('-')
        if len(parts) == 2:
            month_str = parts[0].strip().lower()
            year_str = parts[1].strip()
            month = MONTH_MAP.get(month_str)
            if month:
                try:
                    # Handle 2-digit years (20 = 2020, 21 = 2021, etc.)
                    year = 2000 + int(year_str) if len(year_str) == 2 else int(year_str)
                    return year, month
                except:
                    pass
    
    # Format 2: "Oct 2023" or "October 2023" (month name year)
    parts = date_str.split()
    if len(parts) >= 2:
        month_str = parts[0].strip().lower()
        year_str = parts[-1].strip()
        month = MONTH_MAP.get(month_str)
        if month:
            try:
                year = int(year_str)
                if year < 100:
                    year = 2000 + year if year < 50 else 1900 + year
                return year, month
            except:
                pass
    
    # Format 3: "2023-10-01" or "2023/10/01" (ISO format)
    for sep in ['-', '/']:
        if sep in date_str:
            parts = date_str.split(sep)
            if len(parts) >= 3:
                try:
                    if len(parts[0]) == 4:
                        year = int(parts[0])
                        month = int(parts[1])
                        if 1 <= month <= 12:
                            return year, month
                except:
                    pass
    
    # Format 4: Try pd.to_datetime as last resort
    try:
        parsed = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(parsed):
            return parsed.year, parsed.month
    except:
        pass
    
    return None, None


def load_csv_data():
    """
    Load and process all CSV files from rawdata/ folder.
    Returns cleaned DataFrame ready for database insertion.
    """
    if not os.path.exists(CSV_FOLDER):
        print(f"✗ Error: Folder '{CSV_FOLDER}' not found")
        return pd.DataFrame()
    
    # Find all CSV files
    csv_files = [
        os.path.join(CSV_FOLDER, f) 
        for f in os.listdir(CSV_FOLDER) 
        if f.lower().endswith('.csv')
    ]
    
    if not csv_files:
        print(f"✗ Error: No CSV files found in '{CSV_FOLDER}' folder")
        return pd.DataFrame()
    
    csv_files.sort()
    print(f"✓ Found {len(csv_files)} CSV file(s)")
    
    # Read all CSV files and combine
    dfs = []
    for csv_file in csv_files:
        try:
            df = pd.read_csv(csv_file)
            dfs.append(df)
            print(f"  ✓ {os.path.basename(csv_file)}: {len(df):,} rows")
        except Exception as e:
            print(f"  ✗ Error reading {os.path.basename(csv_file)}: {e}")
            continue
    
    if not dfs:
        return pd.DataFrame()
    
    # Combine all DataFrames
    df = pd.concat(dfs, ignore_index=True)
    print(f"✓ Combined {len(df):,} total rows")
    
    # ============================================================
    # DATA CLEANING (Vectorized Operations)
    # ============================================================
    
    # Filter: Only Resale transactions
    if 'Type of Sale' in df.columns:
        df = df[df['Type of Sale'].astype(str).str.lower().str.contains('resale', na=False)].copy()
    
    # Filter: Only Condominium/Apartment, NOT EC, NOT HDB
    if 'Property Type' in df.columns:
        prop_type_lower = df['Property Type'].astype(str).str.lower()
        df = df[
            (prop_type_lower.str.contains('condominium', na=False) | 
             prop_type_lower.str.contains('apartment', na=False)) &
            ~prop_type_lower.str.contains('executive condominium', na=False) &
            ~prop_type_lower.str.contains('ec', na=False) &
            ~prop_type_lower.str.contains('hdb', na=False) &
            ~prop_type_lower.str.contains('public', na=False)
        ].copy()
    
    # Filter: Non-empty project names
    if 'Project Name' in df.columns:
        df = df[df['Project Name'].astype(str).str.strip() != ''].copy()
        df = df[df['Project Name'].astype(str).str.strip() != 'nan'].copy()
    
    # Parse dates (vectorized)
    if 'Sale Date' not in df.columns:
        print("✗ Error: 'Sale Date' column not found")
        return pd.DataFrame()
    
    date_results = df['Sale Date'].apply(parse_date_flexible)
    df['parsed_year'] = date_results.apply(lambda x: x[0] if x[0] is not None else None)
    df['parsed_month'] = date_results.apply(lambda x: x[1] if x[1] is not None else None)
    
    # Filter out failed dates
    failed_count = len(df[df['parsed_year'].isna() | df['parsed_month'].isna()])
    df = df[df['parsed_year'].notna() & df['parsed_month'].notna()].copy()
    
    if failed_count > 0:
        print(f"⚠️  Dropped {failed_count} rows with invalid dates")
    
    # Create transaction_date (YYYY-MM-DD format)
    df['transaction_date'] = pd.to_datetime({
        'year': df['parsed_year'].values,
        'month': df['parsed_month'].values,
        'day': 1
    }).dt.strftime('%Y-%m-%d')
    
    # Create contract_date (MMYY format for compatibility)
    df['contract_date'] = df['transaction_date'].str[5:7] + df['transaction_date'].str[2:4]
    df = df.drop(columns=['parsed_year', 'parsed_month'])
    
    # Parse district
    if 'Postal District' in df.columns:
        df['district'] = df['Postal District'].astype(str).str.extract(r'(\d+)', expand=False)
        df = df[df['district'].notna()].copy()
        df['district'] = 'D' + df['district'].str.zfill(2)
    
    # Clean and parse price (remove $ and commas)
    if 'Transacted Price ($)' in df.columns:
        df['price'] = (
            df['Transacted Price ($)']
            .astype(str)
            .str.replace(',', '', regex=False)
            .str.replace('$', '', regex=False)
            .str.strip()
            .replace('nan', '0')
            .astype(float)
        )
    
    # Clean and parse area (remove commas)
    if 'Area (SQFT)' in df.columns:
        df['area_sqft'] = (
            df['Area (SQFT)']
            .astype(str)
            .str.replace(',', '', regex=False)
            .str.strip()
            .replace('nan', '0')
            .astype(float)
        )
    
    # Calculate PSF
    if 'Unit Price ($ PSF)' in df.columns:
        df['psf'] = (
            df['Unit Price ($ PSF)']
            .astype(str)
            .str.replace(',', '', regex=False)
            .str.replace('$', '', regex=False)
            .str.strip()
            .replace('nan', '')
        )
        psf_mask = (df['psf'] == '') | (df['psf'] == 'nan')
        df.loc[psf_mask, 'psf'] = (df.loc[psf_mask, 'price'] / df.loc[psf_mask, 'area_sqft']).fillna(0)
        df['psf'] = df['psf'].astype(float)
    else:
        df['psf'] = (df['price'] / df['area_sqft']).fillna(0)
    
    # Filter valid prices/areas
    df = df[(df['price'] > 0) & (df['area_sqft'] > 0)].copy()
    
    # Classify bedrooms
    df['bedroom_count'] = df['area_sqft'].apply(classify_bedroom)
    
    # Prepare final result
    result = pd.DataFrame({
        'project_name': df['Project Name'],
        'transaction_date': df['transaction_date'],
        'contract_date': df['contract_date'],
        'price': df['price'],
        'area_sqft': df['area_sqft'],
        'psf': df['psf'],
        'district': df['district'],
        'bedroom_count': df['bedroom_count'],
        'property_type': df.get('Property Type', 'Condominium'),
        'source': 'csv_offline'
    })
    
    return result


def load_to_database(df: pd.DataFrame) -> int:
    """
    Load cleaned DataFrame into master_transactions table.
    Returns number of new records inserted.
    """
    if df.empty:
        return 0
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    inserted = 0
    skipped = 0
    
    for _, row in df.iterrows():
        try:
            cursor.execute(f"""
                INSERT INTO {MASTER_TABLE} 
                (project_name, transaction_date, contract_date, price, area_sqft, psf, 
                 district, bedroom_count, property_type, source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row['project_name'],
                row['transaction_date'],
                row['contract_date'],
                row['price'],
                row['area_sqft'],
                row['psf'],
                row['district'],
                row['bedroom_count'],
                row['property_type'],
                row['source']
            ))
            inserted += 1
        except sqlite3.IntegrityError:
            skipped += 1
            continue
    
    conn.commit()
    conn.close()
    
    return inserted


def run_etl():
    """Main ETL function - reads CSV and loads to database."""
    start_time = datetime.now()
    
    print("="*70)
    print("OFFLINE ETL PIPELINE: CSV → Database")
    print("="*70)
    
    # Initialize database
    print("\n[1/3] Initializing database...")
    init_database()
    print("✓ Database initialized")
    
    # Load and process CSV data
    print("\n[2/3] Loading and processing CSV files...")
    df = load_csv_data()
    
    if df.empty:
        print("✗ No data to load")
        return 0
    
    print(f"✓ Processed {len(df):,} valid transactions")
    
    # Show date range
    if 'transaction_date' in df.columns:
        df['year'] = pd.to_datetime(df['transaction_date']).dt.year
        year_counts = df['year'].value_counts().sort_index()
        print("\nTransactions by year:")
        for year in sorted(year_counts.index):
            print(f"  {year}: {year_counts[year]:,} transactions")
        
        min_date = df['transaction_date'].min()
        max_date = df['transaction_date'].max()
        print(f"\nDate range: {min_date} to {max_date}")
    
    # Load to database
    print("\n[3/3] Loading to database...")
    inserted = load_to_database(df)
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    print("\n" + "="*70)
    print("ETL COMPLETE")
    print("="*70)
    print(f"✓ Successfully loaded {inserted:,} rows from CSV")
    if 'transaction_date' in df.columns:
        print(f"✓ Date range: {df['transaction_date'].min()} to {df['transaction_date'].max()}")
    print(f"✓ Execution time: {elapsed:.2f} seconds")
    print("="*70)
    
    return inserted


if __name__ == "__main__":
    count = run_etl()
    
    if count > 0:
        print(f"\n✅ ETL completed successfully! {count} new records added.")
        print("You can now access the API at http://localhost:5000")
    else:
        print("\n⚠️  No new records were added. This could mean:")
        print("   - All data already exists in the master table")
        print("   - No CSV files found in rawdata/ folder")
