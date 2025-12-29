"""
Data Loading Service - CSV Processing Utilities

This module is responsible for LOADING data only:
- CSV parsing and cleaning
- Three-tier bedroom classification (New Sale Post/Pre Harmonization, Resale)
- Flexible date parsing (Dec-20, Mar-21, Oct 2023, etc.)
- Property type filtering (Condo/Apartment only, exclude EC/HDB)
- Floor level classification (Low, Mid-Low, Mid, Mid-High, High, Luxury)

CRITICAL: ALL raw CSV columns are preserved end-to-end.
The clean_csv_data() function adds computed columns but NEVER drops original columns.

For data VALIDATION and FILTERING (outliers, duplicates, etc.),
see: services/data_validation.py

Pipeline: **Load Raw** → Validate/Filter/Clean → Store in DB → Compute Stats

CSV Column Mapping (URA REALIS format):
  CSV Column              → DB Column           Transformation
  ─────────────────────────────────────────────────────────────
  Project Name            → project_name        Direct copy
  Street Name             → street_name         Direct copy (NEW)
  Property Type           → property_type       Direct copy
  Postal District         → district            Extract number, format as D01
  Market Segment          → market_segment      Direct copy (NEW)
  Tenure                  → tenure              Direct copy
  Type of Sale            → sale_type           Direct copy
  Number of Units         → num_units           Parse as integer (NEW)
  Nett Price($)           → nett_price          Parse as float (NEW)
  Transacted Price ($)    → price               Parse as float
  Area (SQFT)             → area_sqft           Parse as float
  Type of Area            → type_of_area        Direct copy (NEW)
  Unit Price ($ PSF)      → psf                 Parse as float
  Sale Date               → transaction_date    Parse to YYYY-MM-DD
  Floor Level             → floor_range         Direct copy (renamed from Floor Level)
  (computed)              → floor_level         Classified from floor_range
  (computed)              → bedroom_count       Classified from area_sqft
  (computed)              → contract_date       Derived from transaction_date
  (computed)              → lease_start_year    Parsed from tenure
  (computed)              → remaining_lease     Calculated from tenure
"""

import pandas as pd
import os
import time
from datetime import datetime
from typing import Optional, Tuple, List
from services.classifier import classify_bedroom, classify_bedroom_three_tier
from services.classifier_extended import classify_floor_level


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
    """
    Robust date parser for formats like "Dec-20", "Mar-21", "Oct 2023", etc.
    Returns (year, month) tuple or (None, None) if parsing fails.
    
    KEEP THIS FUNCTION EXACTLY AS-IS FROM app.py (lines 41-86)
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
                    year = 2000 + int(year_str) if len(year_str) == 2 else int(year_str)
                    return year, month
                except ValueError:
                    pass
    
    # Format 2: "Oct 2023" or "March 2021" (month name year)
    parts = date_str.split()
    if len(parts) >= 2:
        month_str = parts[0].strip().lower()
        year_str = parts[-1].strip()
        month = MONTH_MAP.get(month_str)
        if month:
            try:
                year = int(year_str)
                return year, month
            except ValueError:
                pass
    
    # Format 3: "2023-10-01" or "2023/10/01" (ISO format)
    try:
        dt = pd.to_datetime(date_str, errors='coerce')
        if pd.notna(dt):
            return dt.year, dt.month
    except:
        pass
    
    return None, None


def clean_csv_data(df: pd.DataFrame, verbose: bool = False) -> pd.DataFrame:
    """
    Clean and process CSV data while preserving ALL original columns.

    CRITICAL: This function preserves ALL raw CSV columns end-to-end.
    It adds computed columns (transaction_date, district, price, etc.) but
    NEVER drops original columns from the CSV.

    Args:
        df: Raw DataFrame from CSV file
        verbose: If True, print diagnostic info about rejected rows

    Returns:
        Cleaned DataFrame with ALL original columns plus computed columns
        Also sets df.attrs['diagnostics'] with rejection counts if verbose=True
    """
    if df.empty:
        return pd.DataFrame()

    diagnostics = {
        'initial_rows': len(df),
        'rejected': {},
        'sample_rejected': []
    }

    # Store original columns for later preservation
    original_columns = list(df.columns)

    # Filter: Private condos and apartments only (exclude EC, HDB, public housing)
    # Use word boundary regex for "ec" to avoid matching words containing "ec" (like "sector")
    if 'Property Type' in df.columns:
        before = len(df)
        prop_type_lower = df['Property Type'].astype(str).str.lower()
        df = df[
            (prop_type_lower.str.contains('condo', na=False) |
             prop_type_lower.str.contains('apartment', na=False)) &
            ~prop_type_lower.str.contains('executive condominium', na=False) &
            ~prop_type_lower.str.contains(r'\bec\b', na=False, regex=True) &  # Word boundary
            ~prop_type_lower.str.contains('hdb', na=False) &
            ~prop_type_lower.str.contains('public', na=False)
        ].copy()
        rejected = before - len(df)
        if rejected > 0:
            diagnostics['rejected']['property_type_filter'] = rejected

    # Filter: Non-empty project names
    if 'Project Name' in df.columns:
        before = len(df)
        df = df[df['Project Name'].astype(str).str.strip() != ''].copy()
        df = df[df['Project Name'].astype(str).str.strip() != 'nan'].copy()
        rejected = before - len(df)
        if rejected > 0:
            diagnostics['rejected']['empty_project_name'] = rejected

    # Parse dates (vectorized)
    if 'Sale Date' not in df.columns:
        diagnostics['rejected']['no_sale_date_column'] = len(df)
        if verbose:
            print(f"    ⚠️  No 'Sale Date' column found in CSV")
        return pd.DataFrame()

    date_results = df['Sale Date'].apply(parse_date_flexible)
    df['parsed_year'] = date_results.apply(lambda x: x[0] if x[0] is not None else None)
    df['parsed_month'] = date_results.apply(lambda x: x[1] if x[1] is not None else None)

    # Track rows with invalid dates before filtering
    before = len(df)
    invalid_date_mask = df['parsed_year'].isna() | df['parsed_month'].isna()
    if invalid_date_mask.any() and verbose:
        sample_invalid = df[invalid_date_mask].head(3)
        for _, row in sample_invalid.iterrows():
            diagnostics['sample_rejected'].append({
                'reason': 'invalid_date',
                'sale_date': row.get('Sale Date'),
                'project': row.get('Project Name', '')[:30]
            })

    # Filter out failed dates
    df = df[df['parsed_year'].notna() & df['parsed_month'].notna()].copy()
    rejected = before - len(df)
    if rejected > 0:
        diagnostics['rejected']['invalid_date'] = rejected

    if df.empty:
        if verbose:
            print(f"    ⚠️  All rows rejected due to invalid dates")
        return pd.DataFrame()

    # Create transaction_date (YYYY-MM-DD format)
    # Issue B9: Use consistent day (15th - middle of month) for ALL months
    # Previous logic used last day for recent months and 1st for older months,
    # which created artificial ~30-day gaps in time-series charts.
    # Using day 15 represents the "average" date within a month when exact day is unknown.
    df['parsed_day'] = 15

    # Create transaction_date as datetime (needed for bedroom classification)
    df['transaction_date_dt'] = pd.to_datetime({
        'year': df['parsed_year'].values,
        'month': df['parsed_month'].values,
        'day': df['parsed_day'].values
    })
    df['transaction_date'] = df['transaction_date_dt'].dt.strftime('%Y-%m-%d')

    # Create contract_date (MMYYYY format - Issue B11: use 4-digit year to avoid century ambiguity)
    # Old format was MMYY which loses century info (e.g., "1024" could be Oct 2024 or Oct 1924)
    # New format MMYYYY is unambiguous (e.g., "102024" is clearly October 2024)
    df['contract_date'] = df['transaction_date'].str[5:7] + df['transaction_date'].str[0:4]

    # Drop temporary parsing columns (not original columns)
    df = df.drop(columns=['parsed_year', 'parsed_month', 'parsed_day'], errors='ignore')

    # Parse district from Postal District
    if 'Postal District' in df.columns:
        before = len(df)
        df['district'] = df['Postal District'].astype(str).str.extract(r'(\d+)', expand=False)
        invalid_district_mask = df['district'].isna()
        if invalid_district_mask.any() and verbose:
            sample_invalid = df[invalid_district_mask].head(3)
            for _, row in sample_invalid.iterrows():
                diagnostics['sample_rejected'].append({
                    'reason': 'invalid_district',
                    'postal_district': row.get('Postal District'),
                    'project': row.get('Project Name', '')[:30]
                })
        df = df[df['district'].notna()].copy()
        rejected = before - len(df)
        if rejected > 0:
            diagnostics['rejected']['invalid_district'] = rejected
        df['district'] = 'D' + df['district'].str.zfill(2)

    # === Parse price fields ===
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

    # NEW: Parse Nett Price if it exists (handle both column name variants)
    # Issue B7: Preserve NULL semantics - don't fill missing values with 0
    nett_price_col = 'Nett Price($)' if 'Nett Price($)' in df.columns else 'Nett Price ($)'
    if nett_price_col in df.columns:
        # Clean the string values but preserve NULLs
        cleaned_nett = (
            df[nett_price_col]
            .astype(str)
            .str.replace(',', '', regex=False)
            .str.replace('$', '', regex=False)
            .str.strip()
        )
        # Convert empty strings and 'nan' to actual NaN, then parse
        cleaned_nett = cleaned_nett.replace(['nan', '', 'None', 'none', '-'], pd.NA)
        df['nett_price'] = pd.to_numeric(cleaned_nett, errors='coerce')
        # Note: We do NOT fillna(0) - NULL means "nett price not provided"

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

    # Calculate PSF - with safe division to prevent division by zero (Issue B6)
    if 'Unit Price ($ PSF)' in df.columns:
        df['psf'] = (
            df['Unit Price ($ PSF)']
            .astype(str)
            .str.replace(',', '', regex=False)
            .str.replace('$', '', regex=False)
            .str.strip()
            .replace('nan', '')
        )
        # Only calculate PSF where area_sqft > 0 to prevent division by zero
        psf_mask = (df['psf'] == '') | (df['psf'] == 'nan')
        valid_area_mask = psf_mask & (df['area_sqft'] > 0)
        df.loc[valid_area_mask, 'psf'] = df.loc[valid_area_mask, 'price'] / df.loc[valid_area_mask, 'area_sqft']
        # Set PSF to 0 for rows with invalid area (will be filtered out later)
        df.loc[psf_mask & (df['area_sqft'] <= 0), 'psf'] = 0
        df['psf'] = pd.to_numeric(df['psf'], errors='coerce').fillna(0)
    else:
        # Safe division: only divide where area_sqft > 0
        df['psf'] = df.apply(
            lambda row: row['price'] / row['area_sqft'] if row['area_sqft'] > 0 else 0,
            axis=1
        )

    # Filter valid prices/areas
    before = len(df)
    invalid_price_mask = (df['price'] <= 0) | (df['area_sqft'] <= 0)
    if invalid_price_mask.any() and verbose:
        sample_invalid = df[invalid_price_mask].head(3)
        for _, row in sample_invalid.iterrows():
            diagnostics['sample_rejected'].append({
                'reason': 'invalid_price_or_area',
                'price': row.get('price'),
                'area': row.get('area_sqft'),
                'project': row.get('Project Name', '')[:30]
            })
    df = df[(df['price'] > 0) & (df['area_sqft'] > 0)].copy()
    rejected = before - len(df)
    if rejected > 0:
        diagnostics['rejected']['invalid_price_or_area'] = rejected

    # === NEW: Parse Number of Units if it exists (handle both column name variants) ===
    # Issue B8: Preserve NULL semantics - don't fill missing values with 1
    # Use nullable Int64 type to preserve NaN while keeping integer semantics
    num_units_col = 'Number of Units' if 'Number of Units' in df.columns else 'No. of Units'
    if num_units_col in df.columns:
        cleaned_units = df[num_units_col].astype(str).str.strip()
        cleaned_units = cleaned_units.replace(['nan', '', 'None', 'none', '-'], pd.NA)
        df['num_units'] = pd.to_numeric(cleaned_units, errors='coerce').astype('Int64')
        # Note: We do NOT fillna(1) - NULL means "num_units not provided"

    # Helper to normalize null-like strings to empty
    def _normalize_null_str(s):
        if pd.isna(s):
            return ''
        s = str(s).strip()
        return '' if s.lower() in ('nan', 'none', 'null', '<na>', 'nat') else s

    # === NEW: Preserve Street Name ===
    if 'Street Name' in df.columns:
        df['street_name'] = df['Street Name'].apply(_normalize_null_str)

    # === NEW: Preserve Type of Area ===
    if 'Type of Area' in df.columns:
        df['type_of_area'] = df['Type of Area'].apply(_normalize_null_str)

    # === NEW: Preserve Market Segment ===
    if 'Market Segment' in df.columns:
        df['market_segment'] = df['Market Segment'].apply(_normalize_null_str)

    # === NEW: Preserve and classify Floor Level (handle both column name variants) ===
    # CSV has "Floor Level" but we store as "floor_range" for backwards compatibility
    floor_col = 'Floor Level' if 'Floor Level' in df.columns else 'Floor Range'
    if floor_col in df.columns:
        df['floor_range'] = df[floor_col].apply(_normalize_null_str)
        # Apply floor level classification (handles empty strings)
        df['floor_level'] = df['floor_range'].apply(classify_floor_level)

    # Classify bedrooms using consolidated three-tier logic from classifier.py
    def classify_bedroom_for_row(row):
        """
        Wrapper that extracts row data and calls the consolidated classifier.
        Handles date parsing edge cases specific to CSV data loading.
        """
        try:
            area = float(row['area_sqft'])
            sale_type = row.get('Type of Sale', 'Resale')

            # Parse sale date - try multiple sources
            sale_date = None

            # First try transaction_date_dt if available (already parsed)
            if 'transaction_date_dt' in row and pd.notna(row['transaction_date_dt']):
                sale_date = row['transaction_date_dt']
            else:
                # Fallback: parse from transaction_date string
                sale_date_str = row.get('transaction_date')
                if sale_date_str:
                    sale_date = pd.to_datetime(sale_date_str, errors='coerce')

                if pd.isna(sale_date) or sale_date is None:
                    # Last resort: try to parse from original Sale Date
                    if 'Sale Date' in row:
                        date_result = parse_date_flexible(row['Sale Date'])
                        if date_result[0] is not None and date_result[1] is not None:
                            sale_date = pd.Timestamp(year=int(date_result[0]), month=int(date_result[1]), day=1)

            # Use consolidated three-tier classifier
            return classify_bedroom_three_tier(area, sale_type, sale_date)

        except Exception:
            # Fallback to simple classification if anything fails
            try:
                return classify_bedroom(float(row['area_sqft']))
            except:
                return 1  # Default to 1-Bedroom

    # Apply the three-tier classification
    df['bedroom_count'] = df.apply(classify_bedroom_for_row, axis=1)

    # === Create standardized column names (DB-friendly) ===
    # Map original CSV columns to standardized names for the database
    # This preserves original columns AND creates standardized versions

    # Project Name → project_name
    if 'Project Name' in df.columns:
        df['project_name'] = df['Project Name']

    # Property Type → property_type
    if 'Property Type' in df.columns:
        df['property_type'] = df['Property Type']
    else:
        df['property_type'] = 'Condominium'

    # Tenure → tenure (lowercase for DB)
    if 'Tenure' in df.columns:
        df['tenure'] = df['Tenure']

    # Type of Sale → sale_type (normalized to canonical DB labels)
    if 'Type of Sale' in df.columns:
        df['sale_type'] = df['Type of Sale']
    else:
        df['sale_type'] = None

    # Normalize sale_type values (maps variants to canonical DB labels)
    from constants import normalize_sale_type
    df['sale_type'] = df['sale_type'].apply(normalize_sale_type)

    # Fill Type of Sale from normalized sale_type (for bedroom classifier)
    if 'Type of Sale' in df.columns:
        df['Type of Sale'] = df['Type of Sale'].fillna(df['sale_type'])
    else:
        df['Type of Sale'] = df['sale_type']

    # Add source marker
    df['source'] = 'csv_offline'

    # Drop the temporary datetime column used for classification
    df = df.drop(columns=['transaction_date_dt'], errors='ignore')

    # Store diagnostics for the caller
    diagnostics['final_rows'] = len(df)
    diagnostics['total_rejected'] = diagnostics['initial_rows'] - len(df)
    df.attrs['diagnostics'] = diagnostics

    if verbose and diagnostics['total_rejected'] > 0:
        print(f"    Diagnostics: {diagnostics['initial_rows']} initial -> {len(df)} final")
        for reason, count in diagnostics['rejected'].items():
            print(f"      - {reason}: {count}")

    return df


def get_csv_columns_from_dataframe(df: pd.DataFrame) -> List[str]:
    """
    Get the list of original CSV columns from a DataFrame.
    Useful for debugging and schema parity checks.
    """
    return list(df.columns)


def load_all_csv_data():
    """
    Load all CSV files from rawdata/Resale/ and rawdata/New Sale/ folders.
    Returns a DataFrame with all transactions for upload to database.

    Note: This function is used by upload scripts. The main application
    uses SQL-only architecture and doesn't load CSVs into memory at runtime.
    """
    csv_folder = "../rawdata"  # Updated path for backend/ folder structure
    if not os.path.exists(csv_folder):
        csv_folder = "rawdata"  # Fallback to same directory
        if not os.path.exists(csv_folder):
            print(f"⚠️  Warning: {csv_folder} folder not found.")
            return None

    print("🔄 Loading CSV data...")
    start_time = time.time()

    all_dataframes = []

    # Load Resale transactions
    resale_folder = os.path.join(csv_folder, "Resale")
    if os.path.exists(resale_folder):
        resale_files = [f for f in os.listdir(resale_folder) if f.endswith('.csv')]
        for csv_file in sorted(resale_files):
            csv_path = os.path.join(resale_folder, csv_file)
            try:
                # Try different encodings for CSV files
                df = None
                for encoding in ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']:
                    try:
                        df = pd.read_csv(csv_path, encoding=encoding)
                        break
                    except UnicodeDecodeError:
                        continue

                if df is None:
                    print(f"  ✗ Error loading Resale/{csv_file}: Could not decode with any encoding")
                    continue

                cleaned = clean_csv_data(df)
                if not cleaned.empty:
                    # sale_type is now normalized in clean_csv_data() - no folder override
                    all_dataframes.append(cleaned)
                    print(f"  ✓ Loaded Resale/{csv_file}: {len(cleaned)} rows")
            except Exception as e:
                print(f"  ✗ Error loading Resale/{csv_file}: {e}")

    # Load New Sale transactions
    new_sale_folder = os.path.join(csv_folder, "New Sale")
    if os.path.exists(new_sale_folder):
        new_sale_files = [f for f in os.listdir(new_sale_folder) if f.endswith('.csv')]
        for csv_file in sorted(new_sale_files):
            csv_path = os.path.join(new_sale_folder, csv_file)
            try:
                # Try different encodings for CSV files
                df = None
                for encoding in ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']:
                    try:
                        df = pd.read_csv(csv_path, encoding=encoding)
                        break
                    except UnicodeDecodeError:
                        continue

                if df is None:
                    print(f"  ✗ Error loading New Sale/{csv_file}: Could not decode with any encoding")
                    continue

                cleaned = clean_csv_data(df)
                if not cleaned.empty:
                    # sale_type is now normalized in clean_csv_data() - no folder override
                    # Type of Sale is also filled from sale_type in clean_csv_data()
                    all_dataframes.append(cleaned)
                    print(f"  ✓ Loaded New Sale/{csv_file}: {len(cleaned)} rows")
            except Exception as e:
                print(f"  ✗ Error loading New Sale/{csv_file}: {e}")

    if not all_dataframes:
        print("⚠️  Warning: No valid data loaded.")
        return None

    # Combine all dataframes
    result_df = pd.concat(all_dataframes, ignore_index=True)

    # Convert transaction_date to datetime for filtering
    result_df['parsed_date'] = pd.to_datetime(result_df['transaction_date'], errors='coerce')
    result_df = result_df.dropna(subset=['parsed_date'])

    elapsed = time.time() - start_time
    print(f"✓ Loaded {len(result_df):,} total transactions in {elapsed:.2f} seconds")
    print(f"  Date range: {result_df['parsed_date'].min()} to {result_df['parsed_date'].max()}")

    # Enhanced sale_type breakdown with validation
    if 'sale_type' in result_df.columns:
        print(f"\n  Sale type breakdown:")

        # Count known types
        known_types = {'New Sale', 'Resale', 'Sub Sale'}
        sale_type_counts = result_df['sale_type'].value_counts(dropna=False)

        for sale_type, count in sale_type_counts.items():
            if pd.isna(sale_type):
                print(f"    NULL: {count:,} transactions ⚠️")
            elif sale_type in known_types:
                print(f"    {sale_type}: {count:,} transactions")
            else:
                print(f"    {sale_type}: {count:,} transactions ⚠️ (UNKNOWN)")

        # Summary warnings
        null_count = result_df['sale_type'].isna().sum()
        unknown_mask = ~result_df['sale_type'].isin(known_types) & result_df['sale_type'].notna()
        unknown_count = unknown_mask.sum()

        if null_count > 0:
            print(f"\n  ⚠️  {null_count:,} rows have NULL sale_type")
        if unknown_count > 0:
            unknown_values = result_df.loc[unknown_mask, 'sale_type'].value_counts()
            print(f"\n  ⚠️  {unknown_count:,} rows have UNKNOWN sale_type:")
            for val, cnt in unknown_values.items():
                print(f"       '{val}': {cnt:,}")

    return result_df

