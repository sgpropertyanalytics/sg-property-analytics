#!/usr/bin/env python3
"""
CSV Import Script: Direct Import to Database

Imports CSV data directly into condo_master.db, bypassing ETL pipeline.
Use this if you need to quickly import CSV data without running full ETL.

This script:
1. Reads CSV file (asks for path if not found)
2. Parses dates using robust multi-format parser
3. Maps CSV columns to database schema
4. Appends data to master_transactions table (with deduplication)
"""

import pandas as pd
import sqlite3
import os
from datetime import datetime
from typing import Optional
import sys

DB_PATH = "condo_master.db"
MASTER_TABLE = "master_transactions"

# Default CSV path (can be overridden)
DEFAULT_CSV_PATH = os.getenv('CSV_SOURCE_PATH', '/Users/changyuesin/Desktop/Dec20toDec25.csv')

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


def parse_date_flexible(date_str):
    """Robust multi-format date parser."""
    if pd.isna(date_str) or date_str == '' or str(date_str).lower() == 'nan':
        return None, None
    
    date_str = str(date_str).strip()
    
    # Format 1: "Mar-21" or "Mar-2021"
    if '-' in date_str:
        parts = date_str.split('-')
        if len(parts) == 2:
            month_str = parts[0].strip().lower()
            year_str = parts[1].strip()
            month = MONTH_MAP.get(month_str)
            if month:
                try:
                    year = 2000 + int(year_str) if len(year_str) == 2 else int(year_str)
                    return year, month
                except:
                    pass
    
    # Format 2: "Oct 2023" or "October 2023"
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
    
    # Format 3: "2023-10-01" or "2023/10/01"
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
    
    # Format 4: "10/01/2023" (MM/DD/YYYY)
    for sep in ['/', '-']:
        if sep in date_str:
            parts = date_str.split(sep)
            if len(parts) >= 3:
                try:
                    month = int(parts[0])
                    year = int(parts[2])
                    if 1 <= month <= 12:
                        if year < 100:
                            year = 2000 + year if year < 50 else 1900 + year
                        return year, month
                except:
                    pass
    
    # Format 5: Try pd.to_datetime
    try:
        parsed = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(parsed):
            return parsed.year, parsed.month
    except:
        pass
    
    return None, None


def classify_bedroom(area_sqft):
    """Classify bedroom count based on area."""
    if pd.isna(area_sqft) or area_sqft <= 0:
        return None
    if area_sqft < 700:
        return 2
    elif area_sqft < 1200:
        return 3
    elif area_sqft < 1800:
        return 4
    else:
        return 5


def import_csv_to_database(csv_path: str):
    """Import CSV file directly to database."""
    print("="*70)
    print("CSV TO DATABASE IMPORT")
    print("="*70)
    
    # Check if CSV exists
    if not os.path.exists(csv_path):
        print(f"\n✗ CSV file not found: {csv_path}")
        print("\nPlease provide the CSV file path:")
        csv_path = input("CSV file path: ").strip()
        if not os.path.exists(csv_path):
            print(f"✗ File still not found: {csv_path}")
            return False
    
    print(f"\n✓ Reading CSV: {csv_path}")
    
    try:
        # Read CSV
        df = pd.read_csv(csv_path)
        print(f"✓ Loaded {len(df)} rows from CSV")
        
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
        
        # Parse dates
        if 'Sale Date' not in df.columns:
            print("✗ ERROR: 'Sale Date' column not found in CSV")
            return False
        
        print("\nParsing dates...")
        date_results = df['Sale Date'].apply(parse_date_flexible)
        df['parsed_year'] = date_results.apply(lambda x: x[0] if x[0] is not None else None)
        df['parsed_month'] = date_results.apply(lambda x: x[1] if x[1] is not None else None)
        
        # Filter out failed dates
        failed_count = len(df[df['parsed_year'].isna() | df['parsed_month'].isna()])
        df = df[df['parsed_year'].notna() & df['parsed_month'].notna()].copy()
        
        if failed_count > 0:
            print(f"⚠️  Dropped {failed_count} rows with invalid dates")
        
        # Create transaction_date
        df['transaction_date'] = pd.to_datetime({
            'year': df['parsed_year'].values,
            'month': df['parsed_month'].values,
            'day': 1
        }).dt.strftime('%Y-%m-%d')
        
        df['contract_date'] = df['transaction_date'].str[5:7] + df['transaction_date'].str[2:4]
        df = df.drop(columns=['parsed_year', 'parsed_month'])
        
        # Parse district
        if 'Postal District' in df.columns:
            df['district'] = df['Postal District'].astype(str).str.extract(r'(\d+)', expand=False)
            df = df[df['district'].notna()].copy()
            df['district'] = 'D' + df['district'].str.zfill(2)
        
        # Parse price and area
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
        
        # Prepare final dataframe
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
            'source': 'csv_import'
        })
        
        print(f"✓ Processed {len(result)} valid transactions")
        
        # Show yearly breakdown
        result['year'] = pd.to_datetime(result['transaction_date']).dt.year
        year_counts = result['year'].value_counts().sort_index()
        print("\nTransactions by year:")
        for year in range(2020, 2026):
            count = year_counts.get(year, 0)
            print(f"  {year}: {count:,} transactions")
        
        # Connect to database
        print("\nConnecting to database...")
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Ensure table exists
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
        
        # Insert data (with deduplication via UNIQUE constraint)
        print("Inserting data (duplicates will be skipped)...")
        inserted = 0
        skipped = 0
        
        for _, row in result.iterrows():
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
        
        print(f"\n✓ Import complete!")
        print(f"  - Inserted: {inserted:,} new transactions")
        print(f"  - Skipped: {skipped:,} duplicates")
        print("="*70)
        
        return True
        
    except Exception as e:
        print(f"\n✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV_PATH
    success = import_csv_to_database(csv_path)
    if success:
        print("\n✓ Data imported successfully!")
        print("  Refresh your dashboard to see the new data.")
    else:
        print("\n✗ Import failed. Check errors above.")

