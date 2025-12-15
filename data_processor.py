"""
Analysis Layer: Data Processor Module

Queries the master_transactions table (Single Source of Truth) and performs
statistical calculations. This module ONLY reads from the master table - it
never writes or modifies data.

All analysis is performed on the clean, consolidated master_transactions table.
"""

import sqlite3
import pandas as pd
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from classifier import get_bedroom_label

# Master database - Single Source of Truth (fallback if CSV not loaded)
DB_PATH = "condo_master.db"
MASTER_TABLE = "master_transactions"

# Global DataFrame - set by app.py if CSV data is loaded into memory
GLOBAL_DF = None

def set_global_dataframe(df):
    """Set the global DataFrame for in-memory queries. Called by app.py at startup."""
    global GLOBAL_DF
    GLOBAL_DF = df
    if df is not None:
        # Ensure parsed_date column exists for fast filtering
        if 'parsed_date' not in df.columns and 'transaction_date' in df.columns:
            df['parsed_date'] = pd.to_datetime(df['transaction_date'], errors='coerce')


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
    limit: Optional[int] = None
) -> pd.DataFrame:
    """
    Query transactions with optional filters.
    Uses in-memory DataFrame (GLOBAL_DF) if available, otherwise falls back to database.
    
    Args:
        start_date: Start date in YYYY-MM format (e.g., "2024-01")
        end_date: End date in YYYY-MM format (e.g., "2024-06")
        districts: List of districts (e.g., ["D09", "D10", "D11"])
        limit: Maximum number of rows to return (optional)
        
    Returns:
        DataFrame with filtered transactions
    """
    global GLOBAL_DF
    
    # Use in-memory DataFrame if available (much faster)
    if GLOBAL_DF is not None and not GLOBAL_DF.empty:
        df = GLOBAL_DF.copy()
        
        # Apply district filter
        if districts:
            normalized_districts = []
            for d in districts:
                d = d.strip().upper()
                if not d.startswith("D"):
                    d = f"D{d.zfill(2)}"
                normalized_districts.append(d)
            df = df[df["district"].isin(normalized_districts)]
        
        # Apply date range filter
        if start_date:
            start_filter = f"{start_date}-01" if len(start_date) == 7 else start_date
            start_ts = pd.to_datetime(start_filter)
            df = df[df["parsed_date"] >= start_ts]
        
        if end_date:
            end_filter = f"{end_date}-31" if len(end_date) == 7 else end_date
            end_ts = pd.to_datetime(end_filter)
            df = df[df["parsed_date"] <= end_ts]
        
        # Apply limit if specified
        if limit and len(df) > limit:
            df = df.head(limit)
        
        return df
    
    # Fallback to database (for backward compatibility)
    conn = sqlite3.connect(DB_PATH)
    
    # Build SQL query with WHERE clauses for better performance
    query = f"SELECT * FROM {MASTER_TABLE} WHERE 1=1"
    params = []
    
    # Apply district filter in SQL if provided
    if districts:
        normalized_districts = []
        for d in districts:
            d = d.strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized_districts.append(d)
        placeholders = ','.join(['?'] * len(normalized_districts))
        query += f" AND district IN ({placeholders})"
        params.extend(normalized_districts)
    
    # Load data and parse dates
    df = pd.read_sql_query(query, conn, params=params)
    conn.close()
    
    if df.empty:
        return df
    
    # Use transaction_date if available (from scraped data with exact dates), otherwise parse contract_date
    if "transaction_date" in df.columns:
        # Use transaction_date where available, fallback to parsed contract_date
        df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        # Fill missing dates by parsing contract_date
        mask = df["parsed_date"].isna()
        if mask.any():
            df.loc[mask, "parsed_date"] = df.loc[mask, "contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    else:
        # Convert contract_date (MMYY) to proper date for filtering
        df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
        df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    # Apply date range filter
    if start_date:
        # Convert start_date to first day of month
        start_filter = f"{start_date}-01" if len(start_date) == 7 else start_date
        start_ts = pd.to_datetime(start_filter)
        df = df[df["parsed_date"] >= start_ts]
    
    if end_date:
        # Convert end_date to last day of month (approximate with first of next month)
        end_filter = f"{end_date}-31" if len(end_date) == 7 else end_date
        end_ts = pd.to_datetime(end_filter)
        df = df[df["parsed_date"] <= end_ts]
    
    # Apply limit if specified (but only if we have enough data)
    if limit and len(df) > limit:
        df = df.head(limit)
    
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
        limit: Maximum number of transactions to return (default: 10000 to include all years)
        
    Returns:
        List of transaction dictionaries
    """
    # Get filtered data - optimize by filtering bedroom types in SQL if possible
    # For now, get all data and filter in memory (bedroom filter is fast)
    df = get_filtered_transactions(start_date, end_date, districts, limit=None)
    
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
    for _, row in df.iterrows():
        date_str = None
        if pd.notna(row["parsed_date"]):
            if isinstance(row["parsed_date"], pd.Timestamp):
                date_str = row["parsed_date"].strftime("%Y-%m-%d")
            else:
                date_str = str(row["parsed_date"])[:10]  # Take first 10 chars (YYYY-MM-DD)
        
        transactions.append({
            "project_name": row["project_name"],
            "transaction_date": date_str,
            "price": float(row["price"]) if pd.notna(row["price"]) else None,
            "area_sqft": float(row["area_sqft"]) if pd.notna(row["area_sqft"]) else None,
            "psf": round(float(row["psf"]), 2) if pd.notna(row["psf"]) else None,
            "district": row["district"],
            "bedroom_type": get_bedroom_label(row["bedroom_count"])
        })
    
    return transactions


def get_resale_stats(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    districts: Optional[list] = None
) -> dict:
    """
    Main function to get resale statistics.
    
    Args:
        start_date: Start date in YYYY-MM format (e.g., "2024-01")
        end_date: End date in YYYY-MM format (e.g., "2024-06")
        districts: List of districts (e.g., ["D09", "D10"])
        
    Returns:
        Dictionary with statistics and metadata
    """
    df = get_filtered_transactions(start_date, end_date, districts)
    
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
    """Get list of all districts with transaction data."""
    global GLOBAL_DF
    
    # Use in-memory DataFrame if available (much faster)
    if GLOBAL_DF is not None and not GLOBAL_DF.empty:
        return sorted(GLOBAL_DF["district"].unique().tolist())
    
    # Fallback to database
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(f"SELECT DISTINCT district FROM {MASTER_TABLE} ORDER BY district", conn)
    conn.close()
    return df["district"].tolist()


def get_sale_type_trends(districts: Optional[list] = None) -> Dict[str, Any]:
    """
    Get transaction counts by sale type (New Sale vs Resale) over time by quarter.
    
    Args:
        districts: Optional list of districts to filter by (e.g., ["D09", "D10"])
    
    Returns:
        Dictionary with quarterly transaction counts for New Sale and Resale
    """
    global GLOBAL_DF
    
    # Use in-memory DataFrame if available
    if GLOBAL_DF is not None and not GLOBAL_DF.empty:
        df = GLOBAL_DF.copy()
    else:
        # Fallback to database
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query(f"SELECT * FROM {MASTER_TABLE}", conn)
        conn.close()
        
        if df.empty:
            return {"trends": []}
        
        # Parse dates
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        else:
            df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    # Apply district filter if provided
    if districts:
        normalized_districts = []
        for d in districts:
            d = d.strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized_districts.append(d)
        df = df[df["district"].isin(normalized_districts)]
    
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


def get_price_trends_by_sale_type(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None) -> Dict[str, Any]:
    """
    Get median price trends by sale type (New Sale vs Resale) over time by quarter.
    Returns separate trends for each bedroom type.
    
    Args:
        bedroom_types: List of bedroom counts to include (default: [2, 3, 4])
        
    Returns:
        Dictionary with quarterly median prices for New Sale and Resale by bedroom type
    """
    global GLOBAL_DF
    
    # Use in-memory DataFrame if available
    if GLOBAL_DF is not None and not GLOBAL_DF.empty:
        df = GLOBAL_DF.copy()
    else:
        # Fallback to database
        conn = sqlite3.connect(DB_PATH)
        df = pd.read_sql_query(f"SELECT * FROM {MASTER_TABLE}", conn)
        conn.close()
        
        if df.empty:
            return {"trends": {}}
        
        # Parse dates
        if "transaction_date" in df.columns:
            df["parsed_date"] = pd.to_datetime(df["transaction_date"], errors='coerce')
        else:
            df["parsed_date"] = df["contract_date"].apply(parse_contract_date)
            df["parsed_date"] = pd.to_datetime(df["parsed_date"], errors='coerce')
    
    df = df.dropna(subset=["parsed_date"])
    
    if df.empty:
        return {"trends": {}}
    
    # Apply district filter if provided
    if districts:
        normalized_districts = []
        for d in districts:
            d = d.strip().upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized_districts.append(d)
        df = df[df["district"].isin(normalized_districts)]
    
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


def get_price_trends(
    districts: Optional[list] = None,
    bedroom_types: list = [2, 3, 4]
) -> dict:
    """
    Get price trends over time by district and bedroom type.
    
    Returns data for up to the last 5 years (shows all available data if less than 5 years):
    - Median price per quarter by bedroom type
    - Transaction count per quarter by bedroom type
    """
    # Get all transactions first to see what date range we have
    df_all = get_filtered_transactions(districts=districts)
    
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
    
    return {
        "trends": trends_data,
        "district_breakdown": district_breakdown,
        "start_date": start_date,
        "end_date": max_date.strftime("%Y-%m") if isinstance(max_date, pd.Timestamp) else str(max_date)[:7]
    }


def get_total_volume_by_district(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None) -> dict:
    """
    Get total transacted amount by district, broken down by bedroom type.
    Also includes transaction counts and average prices.
    
    Args:
        bedroom_types: List of bedroom counts to include
        districts: Optional list of districts to filter by
    """
    df = get_filtered_transactions(districts=districts)
    
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


def get_avg_psf_by_district(bedroom_types: list = [2, 3, 4], districts: Optional[list] = None) -> dict:
    """
    Get average PSF by district, broken down by bedroom type.
    
    Args:
        bedroom_types: List of bedroom counts to include
        districts: Optional list of districts to filter by
    """
    df = get_filtered_transactions(districts=districts)
    
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


def get_price_trends_by_district(bedroom_types: list = [2, 3, 4], top_n_districts: int = 10) -> dict:
    """
    Get median price trends over time by district (top N districts by transaction volume).
    
    Returns median price per quarter for each district, grouped by bedroom type.
    """
    df = get_filtered_transactions()
    
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


def get_market_stats() -> Dict[str, Any]:
    """
    Get dual-view market analysis: Short-Term (6 months) vs Long-Term (12 months).
    
    Calculates 25th percentile, Median, and 75th percentile for:
    - Total Price ($)
    - PSF ($)
    
    For both Overall Market and by Bedroom Type.
    
    Returns:
        JSON structure with short_term and long_term statistics
    """
    # Get all transactions
    df = get_filtered_transactions()
    
    if df.empty:
        return {
            "short_term": {
                "label": "Last 6 Months",
                "overall": {"price": {"25th": None, "median": None, "75th": None}, "psf": {"25th": None, "median": None, "75th": None}},
                "by_bedroom": {}
            },
            "long_term": {
                "label": "Last 12 Months",
                "overall": {"price": {"25th": None, "median": None, "75th": None}, "psf": {"25th": None, "median": None, "75th": None}},
                "by_bedroom": {}
            }
        }
    
    # Ensure parsed_date is datetime
    df["parsed_date"] = pd.to_datetime(df["parsed_date"])
    
    # Find max_date (latest transaction)
    max_date = df["parsed_date"].max()
    
    # Calculate date ranges
    short_term_start = max_date - timedelta(days=180)  # 6 months
    long_term_start = max_date - timedelta(days=365)   # 12 months
    
    # Filter for short-term (last 6 months)
    short_term_df = df[df["parsed_date"] >= short_term_start].copy()
    
    # Filter for long-term (last 12 months)
    long_term_df = df[df["parsed_date"] >= long_term_start].copy()
    
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
            "label": "Last 6 Months",
            "overall": short_term_stats["overall"],
            "by_bedroom": short_term_stats["by_bedroom"]
        },
        "long_term": {
            "label": "Last 12 Months",
            "overall": long_term_stats["overall"],
            "by_bedroom": long_term_stats["by_bedroom"]
        }
    }


def get_market_stats_by_district(bedroom_types: Optional[list] = None) -> Dict[str, Any]:
    """
    Get dual-view market analysis by district: Short-Term (6 months) vs Long-Term (12 months).
    
    Calculates 25th percentile, Median, and 75th percentile for:
    - Total Price ($)
    - PSF ($)
    
    Grouped by Postal District.
    
    Args:
        bedroom_types: Optional list of bedroom types to filter (e.g., [2, 3, 4])
    
    Returns:
        JSON structure with short_term and long_term statistics by district
    """
    # Get all transactions
    df = get_filtered_transactions()
    
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
    df["parsed_date"] = pd.to_datetime(df["parsed_date"])
    
    # Find max_date (latest transaction)
    max_date = df["parsed_date"].max()
    
    # Calculate date ranges
    short_term_start = max_date - timedelta(days=180)  # 6 months
    long_term_start = max_date - timedelta(days=365)   # 12 months
    
    # Filter for short-term (last 6 months)
    short_term_df = df[df["parsed_date"] >= short_term_start].copy()
    
    # Filter for long-term (last 12 months)
    long_term_df = df[df["parsed_date"] >= long_term_start].copy()
    
    def calculate_stats_by_district(dataframe: pd.DataFrame) -> Dict[str, Any]:
        """Calculate statistics grouped by district."""
        result = {"by_district": {}}
        
        if dataframe.empty or "district" not in dataframe.columns:
            return result
        
        # Get all unique districts
        districts = sorted(dataframe["district"].unique())
        
        for district in districts:
            district_df = dataframe[dataframe["district"] == district].copy()
            
            if len(district_df) >= 5:
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
            else:
                result["by_district"][district] = {
                    "price": {"25th": None, "median": None, "75th": None},
                    "psf": {"25th": None, "median": None, "75th": None}
                }
        
        return result
    
    # Calculate statistics for both timeframes
    short_term_stats = calculate_stats_by_district(short_term_df)
    long_term_stats = calculate_stats_by_district(long_term_df)
    
    return {
        "short_term": {
            "label": "Last 6 Months",
            "by_district": short_term_stats["by_district"]
        },
        "long_term": {
            "label": "Last 12 Months",
            "by_district": long_term_stats["by_district"]
        }
    }
