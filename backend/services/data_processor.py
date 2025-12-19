"""
Analysis Layer: Data Processor Module - SQL-Only Architecture

Queries the transactions table (Single Source of Truth) via SQLAlchemy and performs
statistical calculations. This module ONLY reads from the database - it never writes
or modifies data.

All analysis is performed using SQL aggregation for memory efficiency.
Safe for resource-constrained hosting (Render 512MB).
"""

import re
import os
import pandas as pd
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from calendar import monthrange
from services.classifier import get_bedroom_label
from services.classifier_extended import (
    classify_tenure,
    extract_lease_start_year,
    calculate_property_age,
    calculate_remaining_lease,
    classify_property_age_band,
    classify_remaining_lease_band,
)

# Table name constant for reference
MASTER_TABLE = "transactions"  # Use SQLAlchemy transactions table


def _add_lease_columns(df: pd.DataFrame) -> None:
    """
    Add lease- and age-related columns derived from Tenure text, in-place.
    
    Added columns:
    - tenure_type:      Normalized tenure (Freehold / 99-year / 999-year / Other / Unknown)
    - lease_start_year: 4-digit year lease commenced (NaN if unknown)
    - property_age:     Age in years at transaction date (or current year fallback)
    - age_band:         Banded age label (e.g. "New (0-5 yrs)")
    - remaining_lease:  Remaining lease years (Freehold treated as 999 for compatibility)
    - lease_band:       Remaining lease band (e.g. "75+ yrs (Full CPF)", "Freehold")
    """
    if "Tenure" not in df.columns and "tenure" not in df.columns:
        return

    # Normalize column name we read from
    tenure_col = "Tenure" if "Tenure" in df.columns else "tenure"

    tenure_types = []
    lease_start_years = []
    ages = []
    age_bands = []
    remaining_years = []
    lease_bands = []

    # We prefer parsed_date / transaction_date as the reference for age
    has_parsed_date = "parsed_date" in df.columns
    has_txn_date = "transaction_date" in df.columns

    for _, row in df.iterrows():
        tenure_str = row.get(tenure_col)

        # Reference date for age calculations
        ref_date = None
        if has_parsed_date and pd.notna(row.get("parsed_date")):
            ref_date = row.get("parsed_date")
        elif has_txn_date and pd.notna(row.get("transaction_date")):
            ref_date = row.get("transaction_date")

        t_type = classify_tenure(tenure_str)
        start_year = extract_lease_start_year(tenure_str)
        age = calculate_property_age(tenure_str, ref_date)
        remaining = calculate_remaining_lease(tenure_str, ref_date)
        age_band = classify_property_age_band(age)
        lease_band = classify_remaining_lease_band(tenure_str, remaining)

        tenure_types.append(t_type)
        lease_start_years.append(start_year)
        ages.append(age)
        age_bands.append(age_band)
        remaining_years.append(remaining)
        lease_bands.append(lease_band)

    df["tenure_type"] = tenure_types
    df["lease_start_year"] = lease_start_years
    df["property_age"] = ages
    df["age_band"] = age_bands
    df["remaining_lease"] = remaining_years
    df["lease_band"] = lease_bands


def _get_market_segment(district: str) -> Optional[str]:
    """
    Map Singapore postal district to Market Segment.
    
    Args:
        district: District code (e.g., "D01", "D09")
        
    Returns:
        "CCR", "RCR", "OCR", or None if unknown
    """
    if not district:
        return None
    
    # Normalize district format
    d = str(district).strip().upper()
    if not d.startswith("D"):
        d = f"D{d.zfill(2)}"
    
    # Core Central Region (CCR)
    ccr_districts = ["D01", "D02", "D06", "D07", "D09", "D10", "D11"]
    if d in ccr_districts:
        return "CCR"
    
    # Rest of Core Central Region (RCR)
    rcr_districts = ["D03", "D04", "D05", "D08", "D12", "D13", "D14", "D15", "D20"]
    if d in rcr_districts:
        return "RCR"
    
    # Outside Core Central Region (OCR)
    ocr_districts = ["D16", "D17", "D18", "D19", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28"]
    if d in ocr_districts:
        return "OCR"
    
    return None


def parse_contract_date(date_str: str) -> Optional[str]:
    """
    Parse URA contract date format (MMYY) to ISO format (YYYY-MM-01).
    
    Args:
        date_str: Date in MMYY format (e.g., "0124" for Jan 2024)
        
    Returns:
        Date in YYYY-MM-DD format or None
    """
    if not date_str or len(date_str) != 4:
        return None
    
    try:
        month = int(date_str[:2])
        year = int(date_str[2:])
        
        # Handle 2-digit year (assume 20XX for years < 50, 19XX otherwise)
        full_year = 2000 + year if year < 50 else 1900 + year
        
        return f"{full_year}-{month:02d}-01"
    except ValueError:
        return None


def get_filtered_transactions(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    districts: Optional[list] = None,
    segment: Optional[str] = None,
    limit: Optional[int] = None
) -> pd.DataFrame:
    """
    Query transactions with optional filters using SQL for memory efficiency.

    Args:
        start_date: Start date in YYYY-MM format (e.g., "2024-01")
        end_date: End date in YYYY-MM format (e.g., "2024-06")
        districts: List of districts (e.g., ["D09", "D10", "D11"])
        segment: Market segment filter ("CCR", "RCR", or "OCR")
        limit: Maximum number of rows to return (optional)

    Returns:
        DataFrame with filtered transactions
    """
    # SQLAlchemy database query (PostgreSQL/SQLite)
    from models.database import db
    from models.transaction import Transaction
    
    # Build query using SQLAlchemy
    query = db.session.query(Transaction)
    
    # Normalize districts if provided
    if districts:
        normalized_districts = []
        for d in districts:
            d = d.strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized_districts.append(d)
        query = query.filter(Transaction.district.in_(normalized_districts))
    
    # Apply date range filters in SQL (more efficient than pandas filtering)
    if start_date:
        start_filter = f"{start_date}-01" if len(start_date) == 7 else start_date
        start_dt = datetime.strptime(start_filter, "%Y-%m-%d")
        query = query.filter(Transaction.transaction_date >= start_dt)
    
    if end_date:
        # Get last day of month for end_date
        end_filter = f"{end_date}-01" if len(end_date) == 7 else end_date
        year, month = map(int, end_filter.split("-")[:2])
        last_day = monthrange(year, month)[1]
        end_dt = datetime(year, month, last_day)
        query = query.filter(Transaction.transaction_date <= end_dt)
    
    # Apply limit at database level if specified
    if limit:
        query = query.limit(limit)
    
    # Convert SQLAlchemy query to DataFrame
    from sqlalchemy import text
    df = pd.read_sql(query.statement, db.engine)
    
    if df.empty:
        return df
    
    # Apply segment filter in pandas (after loading, since segment is computed)
    if segment:
        segment_upper = segment.strip().upper()
        if segment_upper in ["CCR", "RCR", "OCR"]:
            df["_market_segment"] = df["district"].apply(_get_market_segment)
            df = df[df["_market_segment"] == segment_upper]
            df = df.drop(columns=["_market_segment"])
    
    # Add parsed_date column for date filtering
    if "transaction_date" in df.columns:
        df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        # Fill missing dates by parsing contract_date if available
        mask = df["parsed_date"].isna()
        if mask.any() and "contract_date" in df.columns:
            df.loc[mask, "parsed_date"] = df.loc[mask, "contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    elif "contract_date" in df.columns:
        # Fallback to contract_date if transaction_date not available
        df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
        df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    else:
        # If no date columns, return empty
        return pd.DataFrame()
    
    # Remove rows with invalid dates
    df = df.dropna(subset=["parsed_date"])
    
    # Add Tenure column mapping if needed (for lease parsing compatibility)
    if "tenure" in df.columns and "Tenure" not in df.columns:
        df["Tenure"] = df["tenure"]
    
    return df


def calculate_statistics(df: pd.DataFrame, bedroom_types: list = [2, 3, 4]) -> dict:
    """
    Calculate statistics for specified bedroom types.
    
    Args:
        df: DataFrame with transaction data
        bedroom_types: List of bedroom counts to include (default: 2, 3, 4)
        
    Returns:
        Dictionary with statistics for each bedroom type
    """
    results = {}
    
    for bedroom in bedroom_types:
        bedroom_df = df[df["bedroom_count"] == bedroom]
        label = get_bedroom_label(bedroom)
        
        if bedroom_df.empty:
            results[label] = {
                "transaction_count": 0,
                "median_price": None,
                "median_psf": None
            }
        else:
            results[label] = {
                "transaction_count": int(len(bedroom_df)),
                "median_price": round(bedroom_df["price"].median(), 2),
                "median_psf": round(bedroom_df["psf"].median(), 2)
            }
    
    return results


def get_transaction_details(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    districts: Optional[list] = None,
    bedroom_types: list = [2, 3, 4],
    segment: Optional[str] = None,
    limit: int = 200000  # Increased to include all transactions (New Sale + Resale)
) -> list:
    """
    Get detailed transaction list with filters.
    Optimized to limit results for better performance.
    
    Args:
        start_date: Start date in YYYY-MM format
        end_date: End date in YYYY-MM format
        districts: List of districts
        bedroom_types: List of bedroom counts to include
        segment: Market segment filter ("CCR", "RCR", or "OCR")
        limit: Maximum number of transactions to return (default: 10000 to include all years)
        
    Returns:
        List of transaction dictionaries
    """
    # Get filtered data - optimize by filtering bedroom types in SQL if possible
    # For now, get all data and filter in memory (bedroom filter is fast)
    df = get_filtered_transactions(start_date, end_date, districts, segment, limit=None)
    
    if df.empty:
        return []
    
    # Filter by bedroom types
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    # Sort by date descending (newest first) - use nlargest for better performance with large datasets
    if limit and len(df) > limit:
        # Use nlargest on a numeric date representation for better performance
        df['date_numeric'] = pd.to_numeric(df['parsed_date'], errors='coerce')
        df = df.nlargest(limit, 'date_numeric')
        df = df.drop('date_numeric', axis=1)
    else:
        df = df.sort_values("parsed_date", ascending=False)
    
    # Format output - convert parsed_date to string for JSON serialization
    transactions = []

    has_remaining_lease = "remaining_lease" in df.columns
    has_sale_type = "sale_type" in df.columns

    for _, row in df.iterrows():
        date_str = None
        if pd.notna(row["parsed_date"]):
            if isinstance(row["parsed_date"], pd.Timestamp):
                date_str = row["parsed_date"].strftime("%Y-%m-%d")
            else:
                # Take first 10 chars (YYYY-MM-DD)
                date_str = str(row["parsed_date"])[:10]

        txn = {
            "project_name": row["project_name"],
            "transaction_date": date_str,
            "price": float(row["price"]) if pd.notna(row["price"]) else None,
            "area_sqft": float(row["area_sqft"]) if pd.notna(row["area_sqft"]) else None,
            "psf": round(float(row["psf"]), 2) if pd.notna(row["psf"]) else None,
            "district": row["district"],
            "bedroom_type": get_bedroom_label(row["bedroom_count"])
        }

        if has_remaining_lease:
            remaining = row.get("remaining_lease")
            txn["remaining_lease"] = int(remaining) if pd.notna(remaining) else None

        if has_sale_type:
            txn["sale_type"] = row.get("sale_type")
        
        transactions.append(txn)
    
    return transactions


def get_resale_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    districts: Optional[list] = None,
    segment: Optional[str] = None
) -> dict:
    """
    Main function to get resale statistics.
    
    Args:
        start_date: Start date in YYYY-MM format (e.g., "2024-01")
        end_date: End date in YYYY-MM format (e.g., "2024-06")
        districts: List of districts (e.g., ["D09", "D10"])
        segment: Market segment filter ("CCR", "RCR", or "OCR")
        
    Returns:
        Dictionary with statistics and metadata
    """
    df = get_filtered_transactions(start_date, end_date, districts, segment)
    
    # Calculate statistics for 2, 3, 4 bedroom only
    stats = calculate_statistics(df, bedroom_types=[2, 3, 4])
    
    # Build response
    response = {
        "filters_applied": {
            "start_date": start_date,
            "end_date": end_date,
            "districts": districts
        },
        "total_transactions": int(len(df[df["bedroom_count"].isin([2, 3, 4])])),
        "statistics": stats
    }
    
    return response


def get_available_districts() -> list:
    """Get list of all districts with transaction data using SQL query."""
    from models.database import db
    from models.transaction import Transaction

    districts = db.session.query(Transaction.district).distinct().order_by(Transaction.district).all()
    return [d[0] for d in districts]  # Extract district from tuple results


def get_sale_type_trends(districts: Optional[list] = None, segment: Optional[str] = None) -> Dict[str, Any]:
    """
    Get transaction counts by sale type (New Sale vs Resale) over time by quarter.
    
    Args:
        districts: Optional list of districts to filter by (e.g., ["D09", "D10"])
        segment: Market segment filter ("CCR", "RCR", or "OCR")
    
    Returns:
        Dictionary with quarterly transaction counts for New Sale and Resale
    """
    df = get_filtered_transactions(districts=districts, segment=segment)
    
    if df.empty:
        return {"trends": []}
    
    # Parse dates if not already parsed
    if "parsed_date" not in df.columns:
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        else:
            df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    if df.empty:
        return {"trends": []}
    
    # Extract year-quarter
    df["year_quarter"] = df["parsed_date"].dt.to_period("Q").astype(str)
    df["year_quarter"] = df["year_quarter"].str.replace("Q", "-Q")
    
    # Get date range
    min_date = df["parsed_date"].min()
    max_date = df["parsed_date"].max()
    start_quarter = pd.Timestamp(min_date).to_period("Q").start_time
    end_quarter = pd.Timestamp(max_date).to_period("Q").end_time
    
    # Generate all quarters
    all_quarters = []
    current = pd.Timestamp(start_quarter)
    end = pd.Timestamp(end_quarter)
    while current <= end:
        quarter_period = pd.Timestamp(current).to_period("Q")
        quarter_str = str(quarter_period).replace("Q", "-Q")
        all_quarters.append(quarter_str)
        current = (quarter_period + 1).start_time
    
    # Count transactions by sale type and quarter
    # Default to "Resale" if sale_type is not available (for backward compatibility)
    if 'sale_type' not in df.columns:
        df['sale_type'] = 'Resale'
    
    trends_data = []
    for quarter in all_quarters:
        quarter_df = df[df["year_quarter"] == quarter]
        
        new_sale_count = len(quarter_df[quarter_df['sale_type'] == 'New Sale']) if 'sale_type' in quarter_df.columns else 0
        resale_count = len(quarter_df[quarter_df['sale_type'] == 'Resale']) if 'sale_type' in quarter_df.columns else len(quarter_df)
        
        trends_data.append({
            "quarter": quarter,
            "new_sale": int(new_sale_count),
            "resale": int(resale_count),
            "total": int(new_sale_count + resale_count)
        })
    
    return {"trends": trends_data}


def get_price_trends_by_sale_type(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None, segment: Optional[str] = None) -> Dict[str, Any]:
    """
    Get median price trends by sale type (New Sale vs Resale) over time by quarter.
    Returns separate trends for each bedroom type.
    
    Args:
        bedroom_types: List of bedroom counts to include (default: [2, 3, 4])
        segment: Market segment filter ("CCR", "RCR", or "OCR")
        
    Returns:
        Dictionary with quarterly median prices for New Sale and Resale by bedroom type
    """
    df = get_filtered_transactions(districts=districts, segment=segment)
    
    if df.empty:
        return {"trends": {}}
    
    # Parse dates if not already parsed
    if "parsed_date" not in df.columns:
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        else:
            df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    # Filter by bedroom types
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    if df.empty:
        return {"trends": {}}
    
    # Default to "Resale" if sale_type is not available (for backward compatibility)
    if 'sale_type' not in df.columns:
        df['sale_type'] = 'Resale'
    
    # Extract year-quarter
    df["year_quarter"] = df["parsed_date"].dt.to_period("Q").astype(str)
    df["year_quarter"] = df["year_quarter"].str.replace("Q", "-Q")
    
    # Get date range
    min_date = df["parsed_date"].min()
    max_date = df["parsed_date"].max()
    start_quarter = pd.Timestamp(min_date).to_period("Q").start_time
    end_quarter = pd.Timestamp(max_date).to_period("Q").end_time
    
    # Generate all quarters
    all_quarters = []
    current = pd.Timestamp(start_quarter)
    end = pd.Timestamp(end_quarter)
    while current <= end:
        quarter_period = pd.Timestamp(current).to_period("Q")
        quarter_str = str(quarter_period).replace("Q", "-Q")
        all_quarters.append(quarter_str)
        current = (quarter_period + 1).start_time
    
    # Calculate median price by quarter, bedroom type, and sale type
    trends_by_bedroom = {}
    
    for bedroom in bedroom_types:
        bedroom_df = df[df["bedroom_count"] == bedroom]
        
        # Calculate median price by quarter and sale type
        price_trends = bedroom_df.groupby(["year_quarter", "sale_type"])["price"].median().reset_index()
        
        # Build trends data structure for this bedroom type
        trends_data = []
        for quarter in all_quarters:
            quarter_data = {"quarter": quarter}
            
            # Get New Sale median price
            new_sale_data = price_trends[
                (price_trends["year_quarter"] == quarter) & 
                (price_trends["sale_type"] == "New Sale")
            ]
            new_sale_price = float(new_sale_data["price"].iloc[0]) if not new_sale_data.empty else None
            
            # Get Resale median price
            resale_data = price_trends[
                (price_trends["year_quarter"] == quarter) & 
                (price_trends["sale_type"] == "Resale")
            ]
            resale_price = float(resale_data["price"].iloc[0]) if not resale_data.empty else None
            
            trends_data.append({
                "quarter": quarter,
                "new_sale": new_sale_price,
                "resale": resale_price
            })
        
        trends_by_bedroom[f"{bedroom}b"] = trends_data
    
    return {"trends": trends_by_bedroom}


def get_price_trends_by_region(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None) -> Dict[str, Any]:
    """
    Get median price trends by region (CCR, RCR, OCR) over time by quarter.
    
    Args:
        bedroom_types: List of bedroom counts to include (default: [2, 3, 4])
        districts: Optional list of districts to filter by (ignored for region analysis)
        
    Returns:
        Dictionary with quarterly median prices for CCR, RCR, and OCR
    """
    # Get all transactions (don't filter by districts for region analysis)
    df = get_filtered_transactions(districts=None, segment=None)
    
    if df.empty:
        return {"trends": {}}
    
    # Parse dates if not already parsed
    if "parsed_date" not in df.columns:
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        else:
            df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    if df.empty:
        return {"trends": {}}
    
    # Filter by bedroom types
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    if df.empty:
        return {"trends": {}}
    
    # Add market segment column
    df["market_segment"] = df["district"].apply(_get_market_segment)
    # Filter out rows where market_segment is None
    df = df[df["market_segment"].notna()].copy()
    
    if df.empty:
        return {"trends": {}}
    
    # Extract year-quarter
    df["year_quarter"] = df["parsed_date"].dt.to_period("Q").astype(str)
    df["year_quarter"] = df["year_quarter"].str.replace("Q", "-Q")
    
    # Get date range
    min_date = df["parsed_date"].min()
    max_date = df["parsed_date"].max()
    start_quarter = pd.Timestamp(min_date).to_period("Q").start_time
    end_quarter = pd.Timestamp(max_date).to_period("Q").end_time
    
    # Generate all quarters
    all_quarters = []
    current = pd.Timestamp(start_quarter)
    end = pd.Timestamp(end_quarter)
    while current <= end:
        quarter_period = pd.Timestamp(current).to_period("Q")
        quarter_str = str(quarter_period).replace("Q", "-Q")
        all_quarters.append(quarter_str)
        current = (quarter_period + 1).start_time
    
    # Calculate median price by quarter and region
    price_trends = df.groupby(["year_quarter", "market_segment"])["price"].median().reset_index()
    
    # Build trends data structure
    trends_data = []
    for quarter in all_quarters:
        quarter_data = {"quarter": quarter}
        
        # Get median price for each region
        for region in ["CCR", "RCR", "OCR"]:
            region_data = price_trends[
                (price_trends["year_quarter"] == quarter) & 
                (price_trends["market_segment"] == region)
            ]
            region_price = float(region_data["price"].iloc[0]) if not region_data.empty else None
            quarter_data[region.lower()] = region_price
        
        trends_data.append(quarter_data)
    
    return {"trends": trends_data}


def get_psf_trends_by_region(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None) -> Dict[str, Any]:
    """
    Get median PSF trends by region (CCR, RCR, OCR) over time by quarter.
    
    Args:
        bedroom_types: List of bedroom counts to include (default: [2, 3, 4])
        districts: Optional list of districts to filter by (ignored for region analysis)
        
    Returns:
        Dictionary with quarterly median PSF for CCR, RCR, and OCR
    """
    # Get all transactions (don't filter by districts for region analysis)
    df = get_filtered_transactions(districts=None, segment=None)
    
    if df.empty:
        return {"trends": []}
    
    # Parse dates if not already parsed
    if "parsed_date" not in df.columns:
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        else:
            df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    if df.empty:
        return {"trends": []}
    
    # Filter by bedroom types
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    if df.empty:
        return {"trends": []}
    
    # Add market segment column
    df["market_segment"] = df["district"].apply(_get_market_segment)
    # Filter out rows where market_segment is None
    df = df[df["market_segment"].notna()].copy()
    
    if df.empty:
        return {"trends": []}
    
    # Extract year-quarter
    df["year_quarter"] = df["parsed_date"].dt.to_period("Q").astype(str)
    df["year_quarter"] = df["year_quarter"].str.replace("Q", "-Q")
    
    # Get date range
    min_date = df["parsed_date"].min()
    max_date = df["parsed_date"].max()
    start_quarter = pd.Timestamp(min_date).to_period("Q").start_time
    end_quarter = pd.Timestamp(max_date).to_period("Q").end_time
    
    # Generate all quarters
    all_quarters = []
    current = pd.Timestamp(start_quarter)
    end = pd.Timestamp(end_quarter)
    while current <= end:
        quarter_period = pd.Timestamp(current).to_period("Q")
        quarter_str = str(quarter_period).replace("Q", "-Q")
        all_quarters.append(quarter_str)
        current = (quarter_period + 1).start_time
    
    # Calculate median PSF by quarter and region
    psf_trends = df.groupby(["year_quarter", "market_segment"])["psf"].median().reset_index()
    
    # Build trends data structure
    trends_data = []
    for quarter in all_quarters:
        quarter_data = {"quarter": quarter}
        
        # Get median PSF for each region
        for region in ["CCR", "RCR", "OCR"]:
            region_data = psf_trends[
                (psf_trends["year_quarter"] == quarter) & 
                (psf_trends["market_segment"] == region)
            ]
            region_psf = float(region_data["psf"].iloc[0]) if not region_data.empty else None
            quarter_data[region.lower()] = region_psf
        
        trends_data.append(quarter_data)
    
    return {"trends": trends_data}


def get_price_trends(
    districts: Optional[list] = None,
    bedroom_types: list = [2, 3, 4],
    segment: Optional[str] = None
) -> dict:
    """
    Get price trends over time by district and bedroom type.
    
    Returns data for up to the last 5 years (shows all available data if less than 5 years):
    - Median price per quarter by bedroom type
    - Transaction count per quarter by bedroom type
    """
    # Get all transactions first to see what date range we have
    df_all = get_filtered_transactions(districts=districts, segment=segment)
    
    if df_all.empty:
        return {"trends": [], "transaction_counts": []}
    
    # Calculate date range: last 5 years from today, but use all available data
    from datetime import datetime, timedelta
    import pandas as pd
    
    # Convert to datetime if not already
    if "parsed_date" not in df_all.columns:
        if "transaction_date" in df_all.columns:
            df_all["parsed_date"] = pd.to_datetime(df_all["transaction_date"], errors='coerce')
        else:
            df_all["parsed_date"] = df_all["contract_date"].apply(parse_contract_date)
            df_all["parsed_date"] = pd.to_datetime(df_all["parsed_date"], errors='coerce')
    else:
        df_all["parsed_date"] = pd.to_datetime(df_all["parsed_date"], errors='coerce')
    
    df_all = df_all.dropna(subset=["parsed_date"])
    
    if df_all.empty:
        return {"trends": [], "transaction_counts": []}
    
    # Convert to datetime if not already
    if "parsed_date" not in df_all.columns:
        if "transaction_date" in df_all.columns:
            df_all["parsed_date"] = pd.to_datetime(df_all["transaction_date"], errors='coerce')
        else:
            df_all["parsed_date"] = df_all["contract_date"].apply(parse_contract_date)
            df_all["parsed_date"] = pd.to_datetime(df_all["parsed_date"], errors='coerce')
    else:
        df_all["parsed_date"] = pd.to_datetime(df_all["parsed_date"], errors='coerce')
    
    df_all = df_all.dropna(subset=["parsed_date"])
    
    if df_all.empty:
        return {"trends": [], "transaction_counts": []}
    
    # Get the actual date range in the data
    min_date = df_all["parsed_date"].min()
    max_date = df_all["parsed_date"].max()
    
    # Calculate 5 years ago from today (use first day of month to include all data)
    today = datetime.now()
    five_years_ago = datetime(today.year - 5, today.month, 1)  # First day of month 5 years ago
    
    # Use the later of: 5 years ago OR the earliest data we have
    # This ensures we show all available data if less than 5 years, or last 5 years if more
    # If we have data going back more than 5 years, start from 5 years ago
    # If we have less than 5 years, start from the earliest data
    if min_date < five_years_ago:
        # We have more than 5 years of data, show last 5 years
        start_date = five_years_ago
        df = df_all[df_all["parsed_date"] >= five_years_ago]
    else:
        # We have less than 5 years, show all available data
        start_date = min_date
        df = df_all
    
    # Round start_date to the beginning of its quarter
    start_quarter = pd.Timestamp(start_date).to_period("Q").start_time
    # Round max_date to the end of its quarter
    end_quarter = pd.Timestamp(max_date).to_period("Q").end_time
    
    if df.empty:
        return {"trends": [], "transaction_counts": []}
    
    # Filter by bedroom types
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    if df.empty:
        return {"trends": [], "transaction_counts": []}
    
    # Extract year-quarter for grouping (convert datetime to string format YYYY-QX)
    df = df.copy()  # Avoid SettingWithCopyWarning
    df["year_quarter"] = df["parsed_date"].dt.to_period("Q").astype(str)
    # Convert from "2020Q4" format to "2020-Q4" format for better readability
    df["year_quarter"] = df["year_quarter"].str.replace("Q", "-Q")
    
    # Price trends: median price by quarter and bedroom
    # Using .median() - actual median calculation, NOT interpolation or forward-fill
    price_trends = df.groupby(["year_quarter", "bedroom_count"]).agg({
        "price": "median",
        "psf": "median"
    }).reset_index()
    
    # Transaction counts by quarter and bedroom (for sample size validation)
    txn_counts = df.groupby(["year_quarter", "bedroom_count"]).size().reset_index(name="count")
    
    # Generate complete quarter timeline from start_quarter to end_quarter
    # This ensures all quarters are shown on x-axis, even if no data exists
    all_quarters = []
    current = pd.Timestamp(start_quarter)
    end = pd.Timestamp(end_quarter)
    
    while current <= end:
        quarter_period = pd.Timestamp(current).to_period("Q")
        quarter_str = str(quarter_period).replace("Q", "-Q")
        all_quarters.append(quarter_str)
        # Move to next quarter
        current = (quarter_period + 1).start_time
    
    # Build trends data structure with complete timeline
    # IMPORTANT: We use actual median per quarter, NOT interpolation or forward-fill
    trends_data = []
    for quarter in all_quarters:
        quarter_data = {"month": quarter}  # Keep "month" key for frontend compatibility
        for bed in bedroom_types:
            bed_label = f"{bed}b"
            
            # Get median price (if data exists for this quarter)
            # This is the ACTUAL median of transactions in that quarter - no interpolation
            price_row = price_trends[(price_trends["year_quarter"] == quarter) & 
                                      (price_trends["bedroom_count"] == bed)]
            
            # Get transaction count for sample size validation
            count_row = txn_counts[(txn_counts["year_quarter"] == quarter) & 
                                    (txn_counts["bedroom_count"] == bed)]
            txn_count = int(count_row["count"].iloc[0]) if len(count_row) > 0 else 0
            
            if len(price_row) > 0:
                # Only include data if we have actual transactions
                quarter_data[f"{bed_label}_price"] = float(price_row["price"].iloc[0])
                quarter_data[f"{bed_label}_psf"] = float(price_row["psf"].iloc[0])
                quarter_data[f"{bed_label}_count"] = txn_count
                # Add low sample size warning flag (less than 3 transactions)
                if txn_count < 3:
                    quarter_data[f"{bed_label}_low_sample"] = True
            else:
                # No data for this quarter - set to None (frontend will handle as gap)
                quarter_data[f"{bed_label}_price"] = None
                quarter_data[f"{bed_label}_psf"] = None
                quarter_data[f"{bed_label}_count"] = 0
        
        trends_data.append(quarter_data)
    
    # District breakdown if filtered
    district_breakdown = []
    if districts:
        for district in districts:
            district_df = df[df["district"] == district]
            if not district_df.empty:
                district_data = {"district": district}
                for bed in bedroom_types:
                    bed_df = district_df[district_df["bedroom_count"] == bed]
                    bed_label = f"{bed}b"
                    district_data[f"{bed_label}_count"] = len(bed_df)
                    district_data[f"{bed_label}_median_price"] = float(bed_df["price"].median()) if len(bed_df) > 0 else None
                district_breakdown.append(district_data)
    
    # Convert start_date and max_date to strings for JSON serialization
    start_date_str = start_date.strftime("%Y-%m") if isinstance(start_date, (pd.Timestamp, datetime)) else str(start_date)[:7]
    end_date_str = max_date.strftime("%Y-%m") if isinstance(max_date, pd.Timestamp) else str(max_date)[:7]
    
    return {
        "trends": trends_data,
        "district_breakdown": district_breakdown,
        "start_date": start_date_str,
        "end_date": end_date_str
    }


def get_total_volume_by_district(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None, segment: Optional[str] = None) -> dict:
    """
    Get total transacted amount by district, broken down by bedroom type.
    Also includes transaction counts and average prices.
    
    Args:
        bedroom_types: List of bedroom counts to include
        districts: Optional list of districts to filter by
        segment: Market segment filter ("CCR", "RCR", or "OCR")
    """
    df = get_filtered_transactions(districts=districts, segment=segment)
    
    if df.empty:
        return {"data": []}
    
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    # Group by district and bedroom, sum prices and count transactions
    volume = df.groupby(["district", "bedroom_count"])["price"].sum().reset_index()
    counts = df.groupby(["district", "bedroom_count"]).size().reset_index(name="count")
    
    # Pivot for chart format
    districts = sorted(df["district"].unique())
    result = []
    
    for district in districts:
        district_data = {"district": district, "total": 0, "total_quantity": 0}
        for bed in bedroom_types:
            bed_label = f"{bed}b"
            volume_row = volume[(volume["district"] == district) & (volume["bedroom_count"] == bed)]
            count_row = counts[(counts["district"] == district) & (counts["bedroom_count"] == bed)]
            
            amount = float(volume_row["price"].iloc[0]) if len(volume_row) > 0 else 0
            count = int(count_row["count"].iloc[0]) if len(count_row) > 0 else 0
            avg_price = amount / count if count > 0 else 0
            
            district_data[bed_label] = amount
            district_data[f"{bed_label}_count"] = count
            district_data[f"{bed_label}_avg_price"] = round(avg_price, 0) if count > 0 else 0
            district_data["total"] += amount
            district_data["total_quantity"] += count
        result.append(district_data)
    
    # Sort by total volume descending
    result.sort(key=lambda x: x["total"], reverse=True)
    
    return {"data": result}


def normalize_project_name(name: str) -> str:
    """
    Normalize project name to handle case sensitivity, whitespace, and duplicates.
    Converts to uppercase, strips whitespace, and normalizes common variations.
    """
    if not name or pd.isna(name):
        return ""
    # Convert to string, strip whitespace, convert to uppercase
    normalized = str(name).strip().upper()
    # Normalize common variations
    normalized = normalized.replace("'", "'")  # Normalize apostrophes
    normalized = normalized.replace("  ", " ")  # Multiple spaces to single
    return normalized


def get_project_aggregation_by_district(district: str, bedroom_types: list = [2, 3, 4], segment: Optional[str] = None) -> dict:
    """
    Get project-level aggregation for a specific district.
    Aggregates transactions by project_name showing volume and quantity by bedroom type.
    Project names are normalized to handle case sensitivity and duplicates.
    
    Args:
        district: District code (e.g., "D10")
        bedroom_types: List of bedroom counts to include (default: [2, 3, 4])
        segment: Market segment filter ("CCR", "RCR", or "OCR")
    
    Returns:
        Dictionary with project-level aggregations sorted by total volume
    """
    df = get_filtered_transactions(districts=[district], segment=segment)
    
    if df.empty:
        return {"projects": []}
    
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    if df.empty:
        return {"projects": []}
    
    # Normalize project names to handle case sensitivity and duplicates
    df["project_name_normalized"] = df["project_name"].apply(normalize_project_name)
    
    # Use the original project_name for display (prefer the most common variant)
    # But group by normalized name to aggregate duplicates
    name_mapping = df.groupby("project_name_normalized")["project_name"].agg(lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else x.iloc[0]).to_dict()
    
    # Group by normalized project_name and bedroom_count
    volume = df.groupby(["project_name_normalized", "bedroom_count"])["price"].sum().reset_index()
    counts = df.groupby(["project_name_normalized", "bedroom_count"]).size().reset_index(name="count")

    # Sale type mix per project (for New Launch / Resale labels) - use normalized names
    if "sale_type" in df.columns:
        sale_mix = (
            df.groupby(["project_name_normalized", "sale_type"])
            .size()
            .reset_index(name="count")
        )
    else:
        sale_mix = None
    
    # Get unique normalized projects
    normalized_projects = sorted(df["project_name_normalized"].unique())
    result = []
    
    for normalized_project in normalized_projects:
        # Use the most common original name for display
        display_name = name_mapping.get(normalized_project, normalized_project)
        
        project_data = {
            "project_name": display_name,
            "district": district,
            "total": 0,
            "total_quantity": 0
        }

        # Derive a simple New Launch / Resale label based on dominant sale_type
        if sale_mix is not None:
            mix_rows = sale_mix[sale_mix["project_name_normalized"] == normalized_project]
            label = None
            if not mix_rows.empty:
                # Get counts by sale_type
                new_sale_count = int(
                    mix_rows[mix_rows["sale_type"] == "New Sale"]["count"].sum()
                )
                resale_count = int(
                    mix_rows[mix_rows["sale_type"] == "Resale"]["count"].sum()
                )
                if new_sale_count > resale_count:
                    label = "New Launch"
                else:
                    label = "Resale"
            project_data["sale_type_label"] = label
        else:
            project_data["sale_type_label"] = None
        
        for bed in bedroom_types:
            bed_label = f"{bed}b"
            volume_row = volume[(volume["project_name_normalized"] == normalized_project) & (volume["bedroom_count"] == bed)]
            count_row = counts[(counts["project_name_normalized"] == normalized_project) & (counts["bedroom_count"] == bed)]
            
            amount = float(volume_row["price"].iloc[0]) if len(volume_row) > 0 else 0
            count = int(count_row["count"].iloc[0]) if len(count_row) > 0 else 0
            
            project_data[bed_label] = amount
            project_data[f"{bed_label}_count"] = count
            project_data["total"] += amount
            project_data["total_quantity"] += count
        
        result.append(project_data)
    
    # Sort by total volume descending
    result.sort(key=lambda x: x["total"], reverse=True)
    
    return {"projects": result}


def get_avg_psf_by_district(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None, segment: Optional[str] = None) -> dict:
    """
    Get average PSF by district, broken down by bedroom type.
    
    Args:
        bedroom_types: List of bedroom counts to include
        districts: Optional list of districts to filter by
        segment: Market segment filter ("CCR", "RCR", or "OCR")
    """
    df = get_filtered_transactions(districts=districts, segment=segment)
    
    if df.empty:
        return {"data": []}
    
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    # Group by district and bedroom, mean PSF
    avg_psf = df.groupby(["district", "bedroom_count"])["psf"].mean().reset_index()
    
    # Also get transaction counts
    counts = df.groupby(["district", "bedroom_count"]).size().reset_index(name="count")
    
    # Pivot for chart format
    districts = sorted(df["district"].unique())
    result = []
    
    for district in districts:
        district_data = {"district": district}
        total_psf = 0
        total_count = 0
        
        for bed in bedroom_types:
            bed_label = f"{bed}b"
            psf_row = avg_psf[(avg_psf["district"] == district) & (avg_psf["bedroom_count"] == bed)]
            count_row = counts[(counts["district"] == district) & (counts["bedroom_count"] == bed)]
            
            psf_val = float(psf_row["psf"].iloc[0]) if len(psf_row) > 0 else None
            count_val = int(count_row["count"].iloc[0]) if len(count_row) > 0 else 0
            
            district_data[bed_label] = round(psf_val, 2) if psf_val else None
            district_data[f"{bed_label}_count"] = count_val
            
            if psf_val:
                total_psf += psf_val * count_val
                total_count += count_val
        
        district_data["avg_psf"] = round(total_psf / total_count, 2) if total_count > 0 else None
        result.append(district_data)
    
    # Sort by average PSF descending
    result.sort(key=lambda x: x["avg_psf"] or 0, reverse=True)
    
    return {"data": result}


def get_project_price_stats_by_district(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None, segment: Optional[str] = None) -> dict:
    """
    Get price and psf quartiles by project, grouped within each district.
    Returns 25th, median, 75th for price and psf.
    """
    df = get_filtered_transactions(districts=districts, segment=segment)
    if df.empty:
        return {"data": {}}
    df = df[df["bedroom_count"].isin(bedroom_types)]
    if df.empty:
        return {"data": {}}

    # Ensure numeric
    df["price"] = pd.to_numeric(df["price"], errors="coerce")
    df["psf"] = pd.to_numeric(df["psf"], errors="coerce")
    df = df.dropna(subset=["price", "psf"])

    result = {}
    for district in sorted(df["district"].unique()):
        ddf = df[df["district"] == district]
        projects = []
        for project in sorted(ddf["project_name"].unique()):
            pdf = ddf[ddf["project_name"] == project]
            price_q = pdf["price"].quantile([0.25, 0.5, 0.75]).to_dict()
            psf_q = pdf["psf"].quantile([0.25, 0.5, 0.75]).to_dict()
            projects.append({
                "project_name": project,
                "price_25th": float(price_q.get(0.25, 0)),
                "price_median": float(price_q.get(0.5, 0)),
                "price_75th": float(price_q.get(0.75, 0)),
                "psf_25th": float(psf_q.get(0.25, 0)),
                "psf_median": float(psf_q.get(0.5, 0)),
                "psf_75th": float(psf_q.get(0.75, 0))
            })
        result[district] = projects

    return {"data": result}


def get_price_trends_by_district(bedroom_types: list = [2, 3, 4], top_n_districts: int = 10, segment: Optional[str] = None) -> dict:
    """
    Get median price trends over time by district (top N districts by transaction volume).
    
    Returns median price per quarter for each district, grouped by bedroom type.
    """
    df = get_filtered_transactions(segment=segment)
    
    if df.empty:
        return {"trends": []}
    
    df = df[df["bedroom_count"].isin(bedroom_types)]
    
    if df.empty:
        return {"trends": []}
    
    # Get top N districts by total transaction count
    district_counts = df.groupby("district").size().reset_index(name="count")
    top_districts = district_counts.nlargest(top_n_districts, "count")["district"].tolist()
    
    # Convert to datetime
    if "parsed_date" not in df.columns:
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        else:
            df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    else:
        df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    if df.empty:
        return {"trends": []}
    
    # Extract year-quarter
    df["year_quarter"] = df["parsed_date"].dt.to_period("Q").astype(str)
    df["year_quarter"] = df["year_quarter"].str.replace("Q", "-Q")
    
    # Get date range
    min_date = df["parsed_date"].min()
    max_date = df["parsed_date"].max()
    start_quarter = pd.Timestamp(min_date).to_period("Q").start_time
    end_quarter = pd.Timestamp(max_date).to_period("Q").end_time
    
    # Generate all quarters
    all_quarters = []
    current = pd.Timestamp(start_quarter)
    end = pd.Timestamp(end_quarter)
    while current <= end:
        quarter_period = pd.Timestamp(current).to_period("Q")
        quarter_str = str(quarter_period).replace("Q", "-Q")
        all_quarters.append(quarter_str)
        current = (quarter_period + 1).start_time
    
    # Calculate median price by district, quarter, and bedroom
    price_trends = df.groupby(["district", "year_quarter", "bedroom_count"])["price"].median().reset_index()
    
    # Build trends data structure
    trends_data = []
    for quarter in all_quarters:
        quarter_data = {"quarter": quarter}
        for district in top_districts:
            for bed in bedroom_types:
                bed_label = f"{bed}b"
                key = f"{district}_{bed_label}"
                
                price_row = price_trends[
                    (price_trends["district"] == district) & 
                    (price_trends["year_quarter"] == quarter) &
                    (price_trends["bedroom_count"] == bed)
                ]
                
                if len(price_row) > 0:
                    quarter_data[key] = float(price_row["price"].iloc[0])
                else:
                    quarter_data[key] = None
        
        trends_data.append(quarter_data)
    
    return {
        "trends": trends_data,
        "districts": top_districts,
        "bedroom_types": bedroom_types
    }


def get_market_stats(short_months: int = 3, long_months: int = 15, segment: Optional[str] = None) -> Dict[str, Any]:
    """
    Get dual-view market analysis: Pulse vs Baseline (Last X months).
    
    Calculates 25th percentile, Median, and 75th percentile for:
    - Total Price ($)
    - PSF ($)
    
    For both Overall Market and by Bedroom Type.
    
    Args:
        segment: Market segment filter ("CCR", "RCR", or "OCR")
    
    Returns:
        JSON structure with short_term and long_term statistics
    """
    # Get all transactions
    df = get_filtered_transactions(segment=segment)
    
    if df.empty:
        return {
            "short_term": {
                "label": f"Last {short_months} Months (Pulse)",
                "overall": {"price": {"25th": None, "median": None, "75th": None}, "psf": {"25th": None, "median": None, "75th": None}},
                "by_bedroom": {}
            },
            "long_term": {
                "label": f"Last {long_months} Months (Baseline)",
                "overall": {"price": {"25th": None, "median": None, "75th": None}, "psf": {"25th": None, "median": None, "75th": None}},
                "by_bedroom": {}
            }
        }
    
    # Ensure parsed_date is datetime
    if not pd.api.types.is_datetime64_any_dtype(df["parsed_date"]):
        df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors="coerce")
    df = df.dropna(subset=["parsed_date"])
    
    # Find max_date (latest transaction)
    max_date = df["parsed_date"].max()
    
    # Calculate date ranges
    short_term_start = max_date - pd.DateOffset(months=short_months)
    long_term_start = max_date - pd.DateOffset(months=long_months)
    
    # Filter for short-term (last X months)
    # Convert to pandas Timestamp for proper comparison
    short_term_start_ts = pd.Timestamp(short_term_start)
    long_term_start_ts = pd.Timestamp(long_term_start)
    short_term_df = df[df["parsed_date"] >= short_term_start_ts].copy()
    
    # Filter for long-term (last Y months)
    long_term_df = df[df["parsed_date"] >= long_term_start_ts].copy()

    # Debug logging: date range and row counts
    print(f"[market_stats] short_term range: {short_term_start.date()} to {max_date.date()} | rows={len(short_term_df)}")
    print(f"[market_stats] long_term  range: {long_term_start.date()} to {max_date.date()} | rows={len(long_term_df)}")

    # Data quality check for price column
    for label, frame in [("short_term", short_term_df), ("long_term", long_term_df)]:
        price_non_numeric = frame["price"].apply(lambda x: pd.to_numeric(x, errors="coerce")).isna().sum()
        nan_price = frame["price"].isna().sum()
        print(f"[market_stats] {label}: non-numeric price={price_non_numeric}, NaN price={nan_price}, total rows={len(frame)}")
    
    def calculate_stats(dataframe: pd.DataFrame) -> Dict[str, Any]:
        """Calculate statistics for a given dataframe."""
        result = {
            "overall": {"price": {}, "psf": {}},
            "by_bedroom": {}
        }
        
        # Overall statistics
        if len(dataframe) >= 5:
            result["overall"]["price"] = {
                "25th": float(dataframe["price"].quantile(0.25)),
                "median": float(dataframe["price"].median()),
                "75th": float(dataframe["price"].quantile(0.75))
            }
            result["overall"]["psf"] = {
                "25th": float(dataframe["psf"].quantile(0.25)),
                "median": float(dataframe["psf"].median()),
                "75th": float(dataframe["psf"].quantile(0.75))
            }
        else:
            result["overall"]["price"] = {"25th": None, "median": None, "75th": None}
            result["overall"]["psf"] = {"25th": None, "median": None, "75th": None}
        
        # Statistics by bedroom type
        if "bedroom_count" in dataframe.columns:
            for bedroom in [2, 3, 4]:
                bedroom_df = dataframe[dataframe["bedroom_count"] == bedroom].copy()
                bedroom_label = f"{bedroom}-Bedroom"
                
                if len(bedroom_df) >= 5:
                    result["by_bedroom"][bedroom_label] = {
                        "price": {
                            "25th": float(bedroom_df["price"].quantile(0.25)),
                            "median": float(bedroom_df["price"].median()),
                            "75th": float(bedroom_df["price"].quantile(0.75))
                        },
                        "psf": {
                            "25th": float(bedroom_df["psf"].quantile(0.25)),
                            "median": float(bedroom_df["psf"].median()),
                            "75th": float(bedroom_df["psf"].quantile(0.75))
                        }
                    }
                else:
                    result["by_bedroom"][bedroom_label] = {
                        "price": {"25th": None, "median": None, "75th": None},
                        "psf": {"25th": None, "median": None, "75th": None}
                    }
        
        return result
    
    # Calculate statistics for both timeframes
    short_term_stats = calculate_stats(short_term_df)
    long_term_stats = calculate_stats(long_term_df)
    
    return {
        "short_term": {
            "label": f"Last {short_months} Months (Pulse)",
            "overall": short_term_stats["overall"],
            "by_bedroom": short_term_stats["by_bedroom"]
        },
        "long_term": {
            "label": f"Last {long_months} Months (Baseline)",
            "overall": long_term_stats["overall"],
            "by_bedroom": long_term_stats["by_bedroom"]
        }
    }


def get_market_stats_by_district(bedroom_types: Optional[list] = None, districts: Optional[list] = None, short_months: int = 3, long_months: int = 15, segment: Optional[str] = None) -> Dict[str, Any]:
    """
    Get dual-view market analysis by district: Pulse (Last 3) vs Baseline (Last 15) months.
    
    Calculates 25th percentile, Median, and 75th percentile for:
    - Total Price ($)
    - PSF ($)
    
    Grouped by Postal District.
    
    Args:
        bedroom_types: Optional list of bedroom types to filter (e.g., [2, 3, 4])
        districts: Optional list of districts to filter by (e.g., ["D09", "D10"])
        segment: Market segment filter ("CCR", "RCR", or "OCR")
    
    Returns:
        JSON structure with short_term and long_term statistics by district
    """
    # Get filtered transactions (with district filter if provided)
    df = get_filtered_transactions(districts=districts, segment=segment)
    
    # Filter by bedroom type if specified
    if bedroom_types and "bedroom_count" in df.columns:
        df = df[df["bedroom_count"].isin(bedroom_types)].copy()
    
    if df.empty:
        return {
            "short_term": {
                "label": "Last 6 Months",
                "by_district": {}
            },
            "long_term": {
                "label": "Last 12 Months",
                "by_district": {}
            }
        }
    
    # Ensure parsed_date is datetime
    if not pd.api.types.is_datetime64_any_dtype(df["parsed_date"]):
        df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors="coerce")
    df = df.dropna(subset=["parsed_date"])
    
    # Find max_date (latest transaction)
    max_date = df["parsed_date"].max()
    
    # Calculate date ranges
    short_term_start = max_date - pd.DateOffset(months=short_months)
    long_term_start = max_date - pd.DateOffset(months=long_months)
    
    # Use boolean masks on the datetime column to avoid type issues
    short_term_mask = df["parsed_date"] >= short_term_start
    long_term_mask = df["parsed_date"] >= long_term_start
    
    # Filter for short-term (last X months)
    short_term_df = df[short_term_mask].copy()
    
    # Filter for long-term (last Y months)
    long_term_df = df[long_term_mask].copy()

    print(f"[market_stats_by_district] short_term range: {short_term_start.date()} to {max_date.date()} | rows={len(short_term_df)} (district filter: {districts})")
    print(f"[market_stats_by_district] long_term  range: {long_term_start.date()} to {max_date.date()} | rows={len(long_term_df)} (district filter: {districts})")

    # Data quality check for price column
    for label, frame in [("short_term", short_term_df), ("long_term", long_term_df)]:
        price_non_numeric = frame["price"].apply(lambda x: pd.to_numeric(x, errors="coerce")).isna().sum()
        nan_price = frame["price"].isna().sum()
        print(f"[market_stats_by_district] {label}: non-numeric price={price_non_numeric}, NaN price={nan_price}, total rows={len(frame)}")
    
    def calculate_stats_by_district(dataframe: pd.DataFrame) -> Dict[str, Any]:
        """Calculate statistics grouped by district."""
        result = {"by_district": {}}
        
        if dataframe.empty or "district" not in dataframe.columns:
            return result
        
        # Get all unique districts
        districts = sorted(dataframe["district"].unique())
        
        for district in districts:
            district_df = dataframe[dataframe["district"] == district].copy()
            
            if len(district_df) >= 3:
                result["by_district"][district] = {
                    "price": {
                        "25th": float(district_df["price"].quantile(0.25)),
                        "median": float(district_df["price"].median()),
                        "75th": float(district_df["price"].quantile(0.75))
                    },
                    "psf": {
                        "25th": float(district_df["psf"].quantile(0.25)),
                        "median": float(district_df["psf"].median()),
                        "75th": float(district_df["psf"].quantile(0.75))
                    }
                }
            elif len(district_df) > 0:
                # Flag insufficient data (e.g., <3 transactions)
                result["by_district"][district] = {
                    "price": {"25th": None, "median": None, "75th": None, "insufficient": True, "count": int(len(district_df))},
                    "psf": {"25th": None, "median": None, "75th": None, "insufficient": True, "count": int(len(district_df))}
                }
            else:
                result["by_district"][district] = {
                    "price": {"25th": None, "median": None, "75th": None, "insufficient": True, "count": 0},
                    "psf": {"25th": None, "median": None, "75th": None, "insufficient": True, "count": 0}
                }
        
        return result
    
    # Calculate statistics for both timeframes
    short_term_stats = calculate_stats_by_district(short_term_df)
    long_term_stats = calculate_stats_by_district(long_term_df)
    
    return {
        "short_term": {
            "label": f"Last {short_months} Months (Pulse)",
            "by_district": short_term_stats["by_district"]
        },
        "long_term": {
            "label": f"Last {long_months} Months (Baseline)",
            "by_district": long_term_stats["by_district"]
        }
    }


def get_price_project_stats_by_district(
    district: str,
    bedroom_types: list = [2, 3, 4],
    months: int = 15,
    segment: Optional[str] = None
) -> dict:
    """
    Get project-level price and PSF quartiles for a specific district and timeframe.
    
    Aggregates transactions by project_name and returns 25th / median / 75th
    for both price and psf, across the selected bedroom types.
    """
    df = get_filtered_transactions(districts=[district], segment=segment)

    if df.empty:
        return {"projects": []}

    # Filter by bedroom types
    df = df[df["bedroom_count"].isin(bedroom_types)]
    if df.empty:
        return {"projects": []}

    # Ensure parsed_date exists
    if "parsed_date" not in df.columns:
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors="coerce")
        else:
            df["parsed_date"] = pd.to_datetime(df["contract_date"].apply(parse_contract_date), errors="coerce")
    else:
        df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors="coerce")

    df = df.dropna(subset=["parsed_date"])
    if df.empty:
        return {"projects": []}

    # Time window: last `months` months from latest transaction in this district
    max_date = df["parsed_date"].max()
    start_date = max_date - pd.DateOffset(months=months)
    df = df[df["parsed_date"] >= start_date]

    if df.empty:
        return {"projects": []}

    # Compute sale type label per project (New Launch / Resale)
    sale_label = {}
    if "sale_type" in df.columns:
        mix = df.groupby(["project_name", "sale_type"]).size().reset_index(name="count")
        for project_name in df["project_name"].unique():
            rows = mix[mix["project_name"] == project_name]
            if rows.empty:
                sale_label[project_name] = None
            else:
                new_sale_count = int(rows[rows["sale_type"] == "New Sale"]["count"].sum())
                resale_count = int(rows[rows["sale_type"] == "Resale"]["count"].sum())
                sale_label[project_name] = "New Launch" if new_sale_count > resale_count else "Resale"
    else:
        for project_name in df["project_name"].unique():
            sale_label[project_name] = None

    projects = []
    for project_name, group in df.groupby("project_name"):
        txn_count = len(group)
        if txn_count < 5:
            # Enforce minimum volume: only show projects with >=5 transactions
            continue

        # Use all selected bedrooms together for quartiles
        price_25 = float(group["price"].quantile(0.25))
        price_med = float(group["price"].median())
        price_75 = float(group["price"].quantile(0.75))

        psf_25 = float(group["psf"].quantile(0.25))
        psf_med = float(group["psf"].median())
        psf_75 = float(group["psf"].quantile(0.75))

        projects.append({
            "project_name": project_name,
            "district": district,
            "price": {
                "25th": price_25,
                "median": price_med,
                "75th": price_75
            },
            "psf": {
                "25th": psf_25,
                "median": psf_med,
                "75th": psf_75
            },
            "count": int(txn_count),
            "sale_type_label": sale_label.get(project_name)
        })

    # Sort by median price descending
    projects.sort(key=lambda x: x["price"]["median"], reverse=True)

    return {"projects": projects}


def get_new_vs_resale_comparison(
    districts: Optional[List[str]] = None,
    bedrooms: Optional[List[int]] = None,
    segment: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    time_grain: str = "quarter"
) -> Dict[str, Any]:
    """
    Get New Launch vs Resale (lease age < 10 years) comparison data.

    Compares median PSF of new launches against resale units under 10 years old.
    This controls for age by comparing new launches with near-new resale units.

    RESPECTS GLOBAL FILTERS from sidebar. Only time_grain is visual-local.

    Args:
        districts: List of district codes (e.g., ['D09', 'D10']) - from global sidebar
        bedrooms: List of bedroom counts (e.g., [2, 3, 4]) - from global sidebar
        segment: Market segment ('CCR', 'RCR', 'OCR') - from global sidebar (used if no districts)
        date_from: Start date 'YYYY-MM-DD' - from global sidebar
        date_to: End date 'YYYY-MM-DD' - from global sidebar
        time_grain: Time granularity for drill ("year", "quarter", "month") - visual-local

    Returns:
        Dictionary with chart data, summary, and applied filters
    """
    from models.database import db
    from sqlalchemy import text

    # Set implicit time range based on drill level (only if no date filter from sidebar)
    # Year: ALL time, Quarter: 5Y, Month: 2Y
    today = datetime.now()
    if date_from or date_to:
        # Use sidebar date filters if provided
        start_date = None  # Will be applied via where clause
        end_date = None
    else:
        # Apply implicit time range based on drill level
        if time_grain == "year":
            start_date = None  # ALL time at year level
        elif time_grain == "month":
            start_date = today - timedelta(days=2 * 365)  # 2Y at month level
        else:  # quarter (default)
            start_date = today - timedelta(days=5 * 365)  # 5Y at quarter level

    # Build WHERE conditions for the query
    where_conditions = ["1=1"]  # Base condition that's always true
    params = {}

    # Apply date filters
    if date_from:
        where_conditions.append("transaction_date >= :date_from")
        params["date_from"] = date_from
    elif start_date:
        where_conditions.append("transaction_date >= :start_date")
        params["start_date"] = start_date.strftime("%Y-%m-%d")

    if date_to:
        where_conditions.append("transaction_date <= :date_to")
        params["date_to"] = date_to

    # District filter (from global sidebar)
    if districts and len(districts) > 0:
        placeholders = ", ".join([f":district_{i}" for i in range(len(districts))])
        where_conditions.append(f"district IN ({placeholders})")
        for i, d in enumerate(districts):
            params[f"district_{i}"] = d
    elif segment:
        # Fallback to segment if no districts specified
        ccr_districts = ["D01", "D02", "D06", "D07", "D09", "D10", "D11"]
        rcr_districts = ["D03", "D04", "D05", "D08", "D12", "D13", "D14", "D15", "D20"]
        ocr_districts = ["D16", "D17", "D18", "D19", "D21", "D22", "D23", "D24", "D25", "D26", "D27", "D28"]

        if segment.upper() == "CCR":
            segment_districts = ccr_districts
        elif segment.upper() == "RCR":
            segment_districts = rcr_districts
        elif segment.upper() == "OCR":
            segment_districts = ocr_districts
        else:
            segment_districts = []

        if segment_districts:
            placeholders = ", ".join([f":segment_district_{i}" for i in range(len(segment_districts))])
            where_conditions.append(f"district IN ({placeholders})")
            for i, d in enumerate(segment_districts):
                params[f"segment_district_{i}"] = d

    # Bedroom filter (from global sidebar - numeric list)
    if bedrooms and len(bedrooms) > 0:
        placeholders = ", ".join([f":bedroom_{i}" for i in range(len(bedrooms))])
        where_conditions.append(f"bedroom_count IN ({placeholders})")
        for i, b in enumerate(bedrooms):
            params[f"bedroom_{i}"] = b

    where_clause = " AND ".join(where_conditions)

    # Determine DATE_TRUNC parameter based on time_grain
    date_trunc_grain = time_grain  # 'year', 'quarter', 'month'

    # Raw SQL query using PostgreSQL's DATE_TRUNC for time granularity
    # Using avg as fallback for true median (SQLite compatibility)
    # Note: NULL lease_start_year = "unknown age", include them (production-safe fix)
    sql = text(f"""
        WITH new_launches AS (
            SELECT
                DATE_TRUNC('{date_trunc_grain}', transaction_date) AS period,
                AVG(psf) AS median_psf,
                COUNT(*) AS transaction_count
            FROM transactions
            WHERE sale_type = 'New Sale'
              AND {where_clause}
            GROUP BY DATE_TRUNC('{date_trunc_grain}', transaction_date)
        ),
        resale_under_10y AS (
            SELECT
                DATE_TRUNC('{date_trunc_grain}', transaction_date) AS period,
                AVG(psf) AS median_psf,
                COUNT(*) AS transaction_count
            FROM transactions
            WHERE sale_type = 'Resale'
              AND (
                lease_start_year IS NULL
                OR (EXTRACT(YEAR FROM transaction_date) - lease_start_year) < 10
              )
              AND {where_clause}
            GROUP BY DATE_TRUNC('{date_trunc_grain}', transaction_date)
        )
        SELECT
            COALESCE(n.period, r.period) AS period,
            n.median_psf AS new_launch_psf,
            n.transaction_count AS new_launch_count,
            r.median_psf AS resale_psf,
            r.transaction_count AS resale_count
        FROM new_launches n
        FULL OUTER JOIN resale_under_10y r ON n.period = r.period
        ORDER BY period
    """)

    try:
        result = db.session.execute(sql, params).fetchall()
    except Exception as e:
        # Fallback for SQLite (which doesn't support FULL OUTER JOIN or DATE_TRUNC)
        # Build SQLite-compatible period expression based on time_grain
        if time_grain == "year":
            sqlite_period = "strftime('%Y', transaction_date)"
        elif time_grain == "month":
            sqlite_period = "strftime('%Y-%m', transaction_date)"
        else:  # quarter
            sqlite_period = "strftime('%Y', transaction_date) || '-Q' || ((CAST(strftime('%m', transaction_date) AS INTEGER) - 1) / 3 + 1)"

        sql_fallback = text(f"""
            WITH new_launches AS (
                SELECT
                    {sqlite_period} AS period,
                    AVG(psf) AS median_psf,
                    COUNT(*) AS transaction_count
                FROM transactions
                WHERE sale_type = 'New Sale'
                  AND {where_clause}
                GROUP BY {sqlite_period}
            ),
            resale_under_10y AS (
                SELECT
                    {sqlite_period} AS period,
                    AVG(psf) AS median_psf,
                    COUNT(*) AS transaction_count
                FROM transactions
                WHERE sale_type = 'Resale'
                  AND (
                    lease_start_year IS NULL
                    OR (CAST(strftime('%Y', transaction_date) AS INTEGER) - lease_start_year) < 10
                  )
                  AND {where_clause}
                GROUP BY {sqlite_period}
            )
            SELECT
                COALESCE(n.period, r.period) AS period,
                n.median_psf AS new_launch_psf,
                n.transaction_count AS new_launch_count,
                r.median_psf AS resale_psf,
                r.transaction_count AS resale_count
            FROM new_launches n
            LEFT JOIN resale_under_10y r ON n.period = r.period
            UNION
            SELECT
                r.period AS period,
                n.median_psf AS new_launch_psf,
                n.transaction_count AS new_launch_count,
                r.median_psf AS resale_psf,
                r.transaction_count AS resale_count
            FROM resale_under_10y r
            LEFT JOIN new_launches n ON n.period = r.period
            WHERE n.period IS NULL
            ORDER BY period
        """)
        result = db.session.execute(sql_fallback, params).fetchall()

    # Build chart data
    chart_data = []
    premiums = []

    for row in result:
        period = row[0]
        new_launch_psf = float(row[1]) if row[1] else None
        new_launch_count = int(row[2]) if row[2] else 0
        resale_psf = float(row[3]) if row[3] else None
        resale_count = int(row[4]) if row[4] else 0

        # Calculate premium percentage
        premium_pct = None
        if new_launch_psf and resale_psf and resale_psf > 0:
            premium_pct = round((new_launch_psf - resale_psf) / resale_psf * 100, 1)
            premiums.append(premium_pct)

        # Format period based on time_grain
        if period:
            if hasattr(period, 'month'):
                # PostgreSQL returns datetime objects
                if time_grain == "year":
                    period_str = str(period.year)
                elif time_grain == "month":
                    period_str = f"{period.year}-{period.month:02d}"
                else:  # quarter
                    quarter = (period.month - 1) // 3 + 1
                    period_str = f"{period.year}-Q{quarter}"
            else:
                # SQLite returns strings (already formatted)
                period_str = str(period)
        else:
            period_str = "Unknown"

        chart_data.append({
            'period': period_str,
            'newLaunchPsf': round(new_launch_psf, 0) if new_launch_psf else None,
            'resalePsf': round(resale_psf, 0) if resale_psf else None,
            'premiumPct': premium_pct,
            'newLaunchCount': new_launch_count,
            'resaleCount': resale_count
        })

    # Calculate summary statistics
    current_premium = premiums[-1] if premiums else None
    avg_premium = round(sum(premiums) / len(premiums), 1) if premiums else None

    # Determine trend (compare last 4 quarters vs previous 4)
    premium_trend = 'stable'
    if len(premiums) >= 8:
        recent_avg = sum(premiums[-4:]) / 4
        previous_avg = sum(premiums[-8:-4]) / 4
        diff = recent_avg - previous_avg
        if diff >= 2:
            premium_trend = 'widening'
        elif diff <= -2:
            premium_trend = 'narrowing'

    return {
        'chartData': chart_data,
        'summary': {
            'currentPremium': current_premium,
            'avgPremium10Y': avg_premium,
            'premiumTrend': premium_trend,
            'dataPoints': len(chart_data)
        },
        'appliedFilters': {
            'districts': districts if districts else [],
            'bedrooms': bedrooms if bedrooms else [],
            'segment': segment,
            'date_from': date_from,
            'date_to': date_to,
            'timeGrain': time_grain,
            'scope': 'respects-global-filters'
        }
    }


def get_comparable_value_analysis(
    target_price: float,
    price_band: float = 100000.0,
    bedroom_types: list = [2, 3, 4],
    districts: Optional[list] = None,
    segment: Optional[str] = None,
    min_lease: Optional[int] = None,
    sale_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Build a Comparable Value Analysis around a target price.
    
    Filters transactions into a buy box of [target_price - price_band, target_price + price_band],
    then aggregates by (district, project_name, bedroom_count) to provide:
      - scatter points (area vs. price) with bedroom colour coding
      - competitor table with min/max price and max area
      - summary of smallest and largest units in the band
    """
    lower = max(target_price - price_band, 0)
    upper = target_price + price_band

    df = get_filtered_transactions(districts=districts, segment=segment)

    if df.empty:
        return {"points": [], "competitors": [], "summary": {}}

    # Filter by bedroom and price band
    df = df[df["bedroom_count"].isin(bedroom_types)]
    df = df[(df["price"] >= lower) & (df["price"] <= upper)]

    if df.empty:
        return {"points": [], "competitors": [], "summary": {}}

    # Filter by sale type if specified
    if sale_type:
        if "sale_type" in df.columns:
            # Map filter values to actual sale_type values
            # Handle both "New Launch" and "New Sale" as the same
            if sale_type.lower() == "new launch" or sale_type.lower() == "new sale":
                # Filter for New Sale transactions
                df = df[df["sale_type"].notna() & df["sale_type"].astype(str).str.contains("New Sale", case=False, na=False)].copy()
            elif sale_type.lower() == "resale":
                # Filter for Resale transactions
                df = df[df["sale_type"].notna() & df["sale_type"].astype(str).str.contains("Resale", case=False, na=False)].copy()
        else:
            # If sale_type column doesn't exist, can't filter - but don't return empty, just continue without filter
            pass
    
    if df.empty:
        return {"points": [], "competitors": [], "summary": {}}

    # Remaining lease may be absent
    has_remaining = "remaining_lease" in df.columns

    # Filter by minimum lease if specified (BEFORE aggregation)
    if min_lease is not None:
        if has_remaining:
            # Filter out NaN values and apply lease filter
            lease_mask = df["remaining_lease"].notna() & (df["remaining_lease"] >= min_lease)
            df = df[lease_mask].copy()
            if df.empty:
                return {"points": [], "competitors": [], "summary": {}}
        else:
            # If remaining_lease column doesn't exist, return empty (can't filter)
            return {"points": [], "competitors": [], "summary": {}}

    # Aggregate by (district, project_name, bedroom_count)
    # Note: sale_type is filtered BEFORE aggregation, so we don't need to include it in grouping
    group_cols = ["district", "project_name", "bedroom_count"]
    agg_dict = {
        "price": ["min", "max"],
        "area_sqft": ["min", "max"]
    }
    if has_remaining:
        agg_dict["remaining_lease"] = "max"

    grouped = df.groupby(group_cols).agg(agg_dict)
    # Flatten MultiIndex columns
    grouped.columns = ["_".join(col) if isinstance(col, tuple) else col for col in grouped.columns]
    grouped = grouped.reset_index()

    points = []
    competitors = []

    for _, row in grouped.iterrows():
        district = row["district"]
        project = row["project_name"]
        bed = int(row["bedroom_count"])

        min_price = float(row["price_min"])
        max_price = float(row["price_max"])
        min_area = float(row["area_sqft_min"]) if not pd.isna(row["area_sqft_min"]) else None
        max_area = float(row["area_sqft_max"]) if not pd.isna(row["area_sqft_max"]) else None

        remaining_lease = None
        if has_remaining:
            remaining_val = row.get("remaining_lease_max")
            if pd.notna(remaining_val):
                remaining_lease = int(remaining_val)

        # Midpoint price for plotting (use max area for scatter plot positioning)
        mid_price = (min_price + max_price) / 2.0

        points.append({
            "district": district,
            "project_name": project,
            "bedroom_count": bed,
            "area_sqft": max_area,  # Keep max for map positioning
            "area_sqft_min": min_area,
            "area_sqft_max": max_area,
            "price_mid": mid_price,
            "price_min": min_price,
            "price_max": max_price,
            "remaining_lease": remaining_lease
        })

        competitors.append({
            "district": district,
            "project_name": project,
            "bedroom_count": bed,
            "min_area_sqft": min_area,
            "max_area_sqft": max_area,
            "min_price": min_price,
            "max_price": max_price,
            "remaining_lease": remaining_lease
        })

    # Summary: smallest and largest units by area
    valid_areas = [p for p in points if p["area_sqft"] is not None]
    if valid_areas:
        smallest = min(valid_areas, key=lambda x: x["area_sqft"])
        largest = max(valid_areas, key=lambda x: x["area_sqft"])
        summary = {
            "smallest_area_sqft": smallest["area_sqft"],
            "smallest_project": smallest["project_name"],
            "smallest_district": smallest["district"],
            "largest_area_sqft": largest["area_sqft"],
            "largest_project": largest["project_name"],
            "largest_district": largest["district"],
        }
    else:
        summary = {}

    return {
        "points": points,
        "competitors": competitors,
        "summary": summary
    }
