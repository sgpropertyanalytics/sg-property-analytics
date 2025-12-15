#!/bin/bash
# Cleanup Script for ETL Migration
# Removes legacy files that have been replaced by the new ETL architecture

echo "=========================================="
echo "ETL Migration Cleanup Script"
echo "=========================================="
echo ""
echo "Deleting legacy files..."

# Legacy fetch scripts
echo "  - Removing legacy fetch scripts..."
rm -f fetch_2025_data.py
rm -f fetch_all_sources.py
rm -f fetch_datagovsg_data.py
rm -f fetch_historical_data.py
rm -f fetch_real_data.py

# Legacy core module
echo "  - Removing legacy core module..."
rm -f data_fetcher.py

# Backup artifacts
echo "  - Removing backup artifacts..."
rm -f files.zip

# Unused frontend
echo "  - Removing unused frontend..."
rm -f Dashboard.jsx

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "Note: condo_data.db was NOT deleted."
echo "      If you want to remove it, run: rm -f condo_data.db"
echo "      (Backup first if you need historical data)"

