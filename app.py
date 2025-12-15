"""
Flask API Application - Optimized for Performance

Implements "Load Once, Serve Many" pattern:
- Loads all CSV data into memory at startup
- Processes dates and bedroom classification once
- Serves all API requests from in-memory DataFrame
- Target: < 100ms response time per endpoint
"""

from flask import Flask, request, jsonify
import pandas as pd
import os
import time
from datetime import datetime
from typing import Optional
from classifier import classify_bedroom

app = Flask(__name__)

# Global DataFrame - loaded once at startup
GLOBAL_DF = None

# Month name to number mapping (from run_etl.py)
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


def clean_csv_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean and process CSV data - same logic as run_etl.py
    """
    if df.empty:
        return pd.DataFrame()
    
    # Filter: Private condos and apartments only (exclude EC, HDB, public housing)
    if 'Property Type' in df.columns:
        prop_type_lower = df['Property Type'].astype(str).str.lower()
        df = df[
            (prop_type_lower.str.contains('condo', na=False) | 
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
        return pd.DataFrame()
    
    date_results = df['Sale Date'].apply(parse_date_flexible)
    df['parsed_year'] = date_results.apply(lambda x: x[0] if x[0] is not None else None)
    df['parsed_month'] = date_results.apply(lambda x: x[1] if x[1] is not None else None)
    
    # Filter out failed dates
    df = df[df['parsed_year'].notna() & df['parsed_month'].notna()].copy()
    
    # Create transaction_date (YYYY-MM-DD format)
    # For the most recent month, use the last day of the month to show it as "latest"
    # For older months, use the 1st day
    if not df.empty:
        max_year = int(df['parsed_year'].max())
        max_month_df = df[df['parsed_year'] == max_year]
        if not max_month_df.empty:
            max_month = int(max_month_df['parsed_month'].max())
            
            # Calculate last day of the most recent month
            from calendar import monthrange
            last_day = monthrange(max_year, max_month)[1]
            
            # Create dates: use last day for most recent month, 1st day for others
            def get_day(row):
                if int(row['parsed_year']) == max_year and int(row['parsed_month']) == max_month:
                    return last_day
                else:
                    return 1
            
            df['parsed_day'] = df.apply(get_day, axis=1)
        else:
            df['parsed_day'] = 1
    else:
        df['parsed_day'] = 1
    
    # Create transaction_date as datetime (needed for bedroom classification)
    df['transaction_date_dt'] = pd.to_datetime({
        'year': df['parsed_year'].values,
        'month': df['parsed_month'].values,
        'day': df['parsed_day'].values
    })
    df['transaction_date'] = df['transaction_date_dt'].dt.strftime('%Y-%m-%d')
    df = df.drop(columns=['parsed_day'])
    
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
    
    # Classify bedrooms using three-tier logic (based on sale type and date)
    def classify_bedroom_final(row):
        """
        Three-tier bedroom classification based on sale type and date.
        
        Tier 1: New Sale (Post-Harmonization, >= June 1, 2023) - Ultra Compact
        Tier 2: New Sale (Pre-Harmonization, < June 1, 2023) - Modern Compact
        Tier 3: Resale (Any Date) - Legacy Sizes
        """
        try:
            area = float(row['area_sqft'])
            sale_date_str = row['transaction_date']
            sale_type = row.get('Type of Sale', 'Resale')  # Default to Resale if not found
            
            # Parse sale date to datetime
            # First try transaction_date_dt if available (already parsed)
            if 'transaction_date_dt' in row and pd.notna(row['transaction_date_dt']):
                sale_date = row['transaction_date_dt']
            else:
                # Fallback: parse from transaction_date string
                sale_date = pd.to_datetime(sale_date_str, errors='coerce')
                if pd.isna(sale_date):
                    # Last resort: try to parse from original Sale Date
                    if 'Sale Date' in row:
                        date_result = parse_date_flexible(row['Sale Date'])
                        if date_result[0] is not None and date_result[1] is not None:
                            sale_date = pd.Timestamp(year=int(date_result[0]), month=int(date_result[1]), day=1)
                        else:
                            sale_date = None
                    else:
                        sale_date = None
            
            if pd.isna(sale_date):
                # If we can't parse the date, use Legacy (Resale) logic
                sale_type = 'Resale'
                sale_date = pd.Timestamp('2000-01-01')  # Use old date to trigger Legacy logic
            
            # CUTOFF DATE for Harmonization (AC Ledge Removal)
            harmonization_date = pd.Timestamp('2023-06-01')
            
            # Normalize sale_type
            sale_type_str = str(sale_type).strip()
            
            # ---------------------------------------------------------
            # TIER 1: NEW SALE (Post-Harmonization) - Ultra Compact
            # ---------------------------------------------------------
            if sale_type_str == 'New Sale' and sale_date >= harmonization_date:
                if area < 580:
                    return 1  # 1-Bedroom
                elif area < 780:
                    return 2  # 2-Bedroom (3-Bed starts 780)
                elif area < 1150:
                    return 3  # 3-Bedroom
                else:
                    return 4  # 4-Bedroom
            
            # ---------------------------------------------------------
            # TIER 2: NEW SALE (Pre-Harmonization) - Modern Compact
            # ---------------------------------------------------------
            elif sale_type_str == 'New Sale' and sale_date < harmonization_date:
                if area < 600:
                    return 1  # 1-Bedroom
                elif area < 850:
                    return 2  # 2-Bedroom (3-Bed starts 850)
                elif area < 1200:
                    return 3  # 3-Bedroom
                else:
                    return 4  # 4-Bedroom
            
            # ---------------------------------------------------------
            # TIER 3: RESALE - Legacy Sizes
            # ---------------------------------------------------------
            else:
                if area < 600:
                    return 1  # 1-Bedroom
                elif area < 950:
                    return 2  # 2-Bedroom (3-Bed starts 950)
                elif area < 1350:
                    return 3  # 3-Bedroom
                else:
                    return 4  # 4-Bedroom
                    
        except Exception as e:
            # Fallback to simple classification if anything fails
            try:
                return classify_bedroom(float(row['area_sqft']))
            except:
                return 1  # Default to 1-Bedroom
    
    # Apply the three-tier classification
    df['bedroom_count'] = df.apply(classify_bedroom_final, axis=1)
    
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
        'source': 'csv_offline',
        'sale_type': None  # Will be set based on folder
    })
    
    return result


def load_all_csv_data():
    """
    Load all CSV files from rawdata/Resale/ and rawdata/New Sale/ folders and process them.
    This runs once at startup.
    """
    global GLOBAL_DF
    
    csv_folder = "rawdata"
    if not os.path.exists(csv_folder):
        print(f"⚠️  Warning: {csv_folder} folder not found. Using database fallback.")
        return None
    
    print("🔄 Loading CSV data into memory...")
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
                    cleaned['sale_type'] = 'Resale'
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
                    # Set sale_type column
                    cleaned['sale_type'] = 'New Sale'
                    # Ensure Type of Sale is set for bedroom classification
                    if 'Type of Sale' not in cleaned.columns:
                        cleaned['Type of Sale'] = 'New Sale'
                    all_dataframes.append(cleaned)
                    print(f"  ✓ Loaded New Sale/{csv_file}: {len(cleaned)} rows")
            except Exception as e:
                print(f"  ✗ Error loading New Sale/{csv_file}: {e}")
    
    if not all_dataframes:
        print("⚠️  Warning: No valid data loaded. Using database fallback.")
        return None
    
    # Combine all dataframes
    GLOBAL_DF = pd.concat(all_dataframes, ignore_index=True)
    
    # Convert transaction_date to datetime for faster filtering
    GLOBAL_DF['parsed_date'] = pd.to_datetime(GLOBAL_DF['transaction_date'], errors='coerce')
    GLOBAL_DF = GLOBAL_DF.dropna(subset=['parsed_date'])
    
    # Set global DataFrame in data_processor module for fast queries
    from data_processor import set_global_dataframe
    set_global_dataframe(GLOBAL_DF)
    
    elapsed = time.time() - start_time
    print(f"✓ Loaded {len(GLOBAL_DF):,} total transactions in {elapsed:.2f} seconds")
    print(f"  Date range: {GLOBAL_DF['parsed_date'].min()} to {GLOBAL_DF['parsed_date'].max()}")
    
    # Show breakdown by sale type
    if 'sale_type' in GLOBAL_DF.columns:
        sale_type_counts = GLOBAL_DF['sale_type'].value_counts()
        print(f"  Sale type breakdown:")
        for sale_type, count in sale_type_counts.items():
            print(f"    {sale_type}: {count:,} transactions")
    
    return GLOBAL_DF


# Enable CORS for frontend
@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    return response


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({
        "status": "healthy",
        "data_loaded": GLOBAL_DF is not None,
        "row_count": len(GLOBAL_DF) if GLOBAL_DF is not None else 0
    })


@app.route("/api/resale_stats", methods=["GET"])
def resale_stats():
    """Get resale statistics for 2, 3, 4-Bedroom condos."""
    start = time.time()
    
    from data_processor import get_resale_stats
    
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    districts_param = request.args.get("districts")
    
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
    
    try:
        stats = get_resale_stats(start_date, end_date, districts)
        elapsed = time.time() - start
        print(f"GET /api/resale_stats took: {elapsed:.4f} seconds")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/resale_stats ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/transactions", methods=["GET"])
def transactions():
    """Get detailed transaction list."""
    start = time.time()
    
    from data_processor import get_transaction_details
    
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")
    districts_param = request.args.get("districts")
    bedroom_param = request.args.get("bedroom", "2,3,4")
    limit_param = request.args.get("limit", "200000")
    
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
        limit = int(limit_param)
    except ValueError:
        return jsonify({"error": "Invalid parameter"}), 400
    
    try:
        transactions = get_transaction_details(start_date, end_date, districts, bedroom_types, limit=limit)
        elapsed = time.time() - start
        print(f"GET /api/transactions took: {elapsed:.4f} seconds (returned {len(transactions)} rows)")
        return jsonify({
            "count": len(transactions),
            "transactions": transactions
        })
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/transactions ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/price_trends", methods=["GET"])
def price_trends():
    """Get price trends by district and month, broken down by bedroom type."""
    start = time.time()
    
    from data_processor import get_price_trends
    
    districts_param = request.args.get("districts")
    bedroom_param = request.args.get("bedroom", "2,3,4")
    
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    try:
        data = get_price_trends(districts, bedroom_types)
        elapsed = time.time() - start
        print(f"GET /api/price_trends took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/total_volume", methods=["GET"])
def total_volume():
    """Get total transacted amount by district, broken down by bedroom type."""
    start = time.time()
    
    from data_processor import get_total_volume_by_district
    
    bedroom_param = request.args.get("bedroom", "2,3,4")
    districts_param = request.args.get("districts")
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
    
    try:
        data = get_total_volume_by_district(bedroom_types, districts=districts)
        elapsed = time.time() - start
        print(f"GET /api/total_volume took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/total_volume ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/avg_psf", methods=["GET"])
def avg_psf():
    """Get average PSF by district, broken down by bedroom type."""
    start = time.time()
    
    from data_processor import get_avg_psf_by_district
    
    bedroom_param = request.args.get("bedroom", "2,3,4")
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    try:
        data = get_avg_psf_by_district(bedroom_types)
        elapsed = time.time() - start
        print(f"GET /api/avg_psf took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/avg_psf ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/districts", methods=["GET"])
def get_districts():
    """Get list of all districts with transactions."""
    start = time.time()
    
    from data_processor import get_available_districts
    
    try:
        districts = get_available_districts()
        elapsed = time.time() - start
        print(f"GET /api/districts took: {elapsed:.4f} seconds")
        return jsonify({"districts": districts})
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/districts ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/market_stats", methods=["GET"])
def market_stats():
    """Get dual-view market analysis: Short-Term (6 months) vs Long-Term (12 months)."""
    start = time.time()
    
    from data_processor import get_market_stats
    
    try:
        stats = get_market_stats()
        elapsed = time.time() - start
        print(f"GET /api/market_stats took: {elapsed:.4f} seconds")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/market_stats ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/price_trends_by_district", methods=["GET"])
def price_trends_by_district():
    """Get median price trends over time by district (top N districts)."""
    start = time.time()
    
    from data_processor import get_price_trends_by_district
    
    bedroom_param = request.args.get("bedroom", "2,3,4")
    top_n = request.args.get("top_n", "10")
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
        top_n_int = int(top_n)
    except ValueError:
        return jsonify({"error": "Invalid parameter"}), 400
    
    try:
        data = get_price_trends_by_district(bedroom_types, top_n_int)
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_district took: {elapsed:.4f} seconds")
        return jsonify(data)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_district ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/market_stats_by_district", methods=["GET"])
def market_stats_by_district():
    """Get dual-view market analysis by district: Short-Term (6 months) vs Long-Term (12 months)."""
    start = time.time()
    
    from data_processor import get_market_stats_by_district
    
    bedroom_param = request.args.get("bedroom", "2,3,4")
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    try:
        stats = get_market_stats_by_district(bedroom_types)
        elapsed = time.time() - start
        print(f"GET /api/market_stats_by_district took: {elapsed:.4f} seconds")
        return jsonify(stats)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/market_stats_by_district ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/sale_type_trends", methods=["GET"])
def sale_type_trends():
    """Get transaction counts by sale type (New Sale vs Resale) over time by quarter."""
    start = time.time()
    
    from data_processor import get_sale_type_trends
    
    districts_param = request.args.get("districts")
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
    
    try:
        trends = get_sale_type_trends(districts=districts)
        elapsed = time.time() - start
        print(f"GET /api/sale_type_trends took: {elapsed:.4f} seconds")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/sale_type_trends ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/price_trends_by_sale_type", methods=["GET"])
def price_trends_by_sale_type():
    """Get median price trends by sale type (New Sale vs Resale) over time by quarter, separated by bedroom type."""
    start = time.time()
    
    from data_processor import get_price_trends_by_sale_type
    
    bedroom_param = request.args.get("bedroom", "2,3,4")
    districts_param = request.args.get("districts")
    
    try:
        bedroom_types = [int(b.strip()) for b in bedroom_param.split(",")]
    except ValueError:
        return jsonify({"error": "Invalid bedroom parameter"}), 400
    
    districts = None
    if districts_param:
        districts = [d.strip() for d in districts_param.split(",") if d.strip()]
    
    try:
        trends = get_price_trends_by_sale_type(bedroom_types, districts=districts)
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_sale_type took: {elapsed:.4f} seconds")
        return jsonify(trends)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/price_trends_by_sale_type ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/", methods=["GET"])
def index():
    """Serve the dashboard or API documentation."""
    dashboard_path = os.path.join(os.path.dirname(__file__), 'dashboard.html')
    if os.path.exists(dashboard_path):
        with open(dashboard_path, 'r') as f:
            return f.read()
    
    frontend_path = os.path.join(os.path.dirname(__file__), 'frontend', 'dashboard.html')
    if os.path.exists(frontend_path):
        with open(frontend_path, 'r') as f:
            return f.read()
    
    return jsonify({
        "name": "Singapore Condo Resale Statistics API",
        "status": "running",
        "data_loaded": GLOBAL_DF is not None,
        "row_count": len(GLOBAL_DF) if GLOBAL_DF is not None else 0
    })


if __name__ == "__main__":
    # Load all CSV data into memory at startup
    print("=" * 60)
    print("Starting Flask API with in-memory data loading...")
    print("=" * 60)
    
    load_all_csv_data()
    
    if GLOBAL_DF is None:
        print("\n⚠️  WARNING: No CSV data loaded. API will use database fallback.")
        print("   Make sure rawdata/ folder contains CSV files.")
    else:
        print(f"\n✓ API ready! Serving {len(GLOBAL_DF):,} transactions from memory.")
        print("=" * 60)
    
    app.run(debug=True, host="0.0.0.0", port=5000)
