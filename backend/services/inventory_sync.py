"""
Inventory Sync Service - Auto-sync total units from URA Developer Sales API

This service:
1. Detects new projects in transactions that don't have inventory data
2. Fetches total units from URA Developer Sales API
3. Stores in project_inventory table for unsold calculation

URA API Details:
- Endpoint: https://www.ura.gov.sg/uraDataService/invokeUraDS?service=PMI_Resi_Developer_Sales
- Requires: AccessKey (from registration) and Token (generated from AccessKey)
- Returns: JSON with project details including launchedToDate, soldToDate, unitsAvail
"""
import os
import requests
from datetime import datetime
from difflib import SequenceMatcher
from models.database import db
from models.transaction import Transaction
from models.project_inventory import ProjectInventory
from sqlalchemy import func


class InventorySyncService:
    """Service to sync project inventory data from URA API."""

    URA_API_BASE = "https://www.ura.gov.sg/uraDataService"
    TOKEN_ENDPOINT = "/insertNewToken.action"
    DATA_ENDPOINT = "/invokeUraDS"

    def __init__(self):
        self.access_key = os.getenv('URA_API_ACCESS_KEY')
        self.token = None
        self._ura_cache = None  # Cache URA data to avoid repeated API calls

    def is_configured(self):
        """Check if URA API credentials are configured."""
        return bool(self.access_key)

    def _get_token(self):
        """Get a new token from URA API using the access key."""
        if not self.access_key:
            return None

        try:
            response = requests.get(
                f"{self.URA_API_BASE}{self.TOKEN_ENDPOINT}",
                headers={"AccessKey": self.access_key},
                timeout=30
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("Result")
        except Exception as e:
            print(f"Error getting URA token: {e}")
        return None

    def _fetch_ura_developer_sales(self, ref_period=None):
        """
        Fetch developer sales data from URA API.

        Args:
            ref_period: Optional period in MMYY format (e.g., "1224" for Dec 2024)
                       If not specified, fetches latest available data.

        Returns:
            List of project data dicts or empty list on error.
        """
        if not self.is_configured():
            print("URA API not configured - skipping sync")
            return []

        if not self.token:
            self.token = self._get_token()
            if not self.token:
                print("Failed to get URA API token")
                return []

        try:
            params = {"service": "PMI_Resi_Developer_Sales"}
            if ref_period:
                params["refPeriod"] = ref_period

            response = requests.get(
                f"{self.URA_API_BASE}{self.DATA_ENDPOINT}",
                params=params,
                headers={
                    "AccessKey": self.access_key,
                    "Token": self.token
                },
                timeout=60
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("Result", [])
            else:
                print(f"URA API error: {response.status_code}")
                return []

        except Exception as e:
            print(f"Error fetching URA data: {e}")
            return []

    def _normalize_project_name(self, name):
        """Normalize project name for matching."""
        if not name:
            return ""
        # Uppercase, remove extra spaces, common variations
        normalized = name.upper().strip()
        # Remove common suffixes/prefixes that might differ
        for suffix in [" (EC)", " EC", " CONDO", " CONDOMINIUM"]:
            normalized = normalized.replace(suffix, "")
        return normalized

    def _find_ura_match(self, project_name, ura_data):
        """
        Find matching project in URA data using fuzzy matching.

        Args:
            project_name: Project name from our transactions
            ura_data: List of URA project records

        Returns:
            Matching URA record or None
        """
        normalized_name = self._normalize_project_name(project_name)

        best_match = None
        best_score = 0

        for ura_record in ura_data:
            ura_project_name = ura_record.get("project", "")
            normalized_ura = self._normalize_project_name(ura_project_name)

            # Exact match
            if normalized_name == normalized_ura:
                return ura_record

            # Fuzzy match
            score = SequenceMatcher(None, normalized_name, normalized_ura).ratio()
            if score > best_score and score > 0.85:  # 85% similarity threshold
                best_match = ura_record
                best_score = score

        return best_match

    def get_new_projects(self):
        """
        Get project names from transactions that don't have inventory data.

        Returns:
            List of project names that need inventory lookup.
        """
        # Get distinct project names from transactions
        transaction_projects = db.session.query(
            Transaction.project_name
        ).distinct().all()
        transaction_project_names = {p[0] for p in transaction_projects}

        # Get project names already in inventory
        inventory_projects = db.session.query(
            ProjectInventory.project_name
        ).all()
        inventory_project_names = {p[0] for p in inventory_projects}

        # Return projects that need lookup
        return list(transaction_project_names - inventory_project_names)

    def sync_new_projects(self, use_scraper_fallback: bool = True):
        """
        Sync inventory data for new projects from URA API.

        If URA API is not configured, falls back to multi-source scraper
        (project_scraper.py) which cross-validates data from 10 sources:
        EdgeProp, 99.co, PropertyGuru, SRX, PropNex, ERA, Huttons, OrangeTee, ST Property, URA

        Args:
            use_scraper_fallback: If True, use project_scraper when URA unavailable

        Returns:
            Dict with sync results: {synced: int, pending: int, scraped: int, errors: []}
        """
        new_projects = self.get_new_projects()
        if not new_projects:
            return {"synced": 0, "pending": 0, "scraped": 0, "errors": [], "message": "No new projects to sync"}

        print(f"Found {len(new_projects)} new projects to sync")

        results = {"synced": 0, "pending": 0, "scraped": 0, "errors": []}

        # Try URA API first if configured
        if self.is_configured():
            if self._ura_cache is None:
                self._ura_cache = self._fetch_ura_developer_sales()

        # Initialize scraper if URA not available and fallback enabled
        scraper = None
        if not self._ura_cache and use_scraper_fallback:
            try:
                from services.property_scraper import PropertyScraper
                scraper = PropertyScraper()
                print("  URA API not configured - using multi-source scraper fallback")
            except ImportError:
                print("  Warning: project_scraper not available")

        for project_name in new_projects:
            try:
                # Try URA API first
                if self._ura_cache:
                    match = self._find_ura_match(project_name, self._ura_cache)
                    if match:
                        ProjectInventory.upsert_from_ura(project_name, {
                            "launchedToDate": match.get("launchedToDate"),
                            "soldToDate": match.get("soldToDate"),
                            "unitsAvail": match.get("unitsAvail"),
                            "projectId": match.get("projectId")
                        })
                        results["synced"] += 1
                        print(f"  Synced (URA): {project_name} ({match.get('launchedToDate')} units)")
                        continue

                # Fallback to multi-source scraper
                if scraper:
                    scrape_result = scraper.scrape_and_save(project_name)
                    if scrape_result.get("status") == "saved":
                        results["scraped"] += 1
                        print(f"  Scraped: {project_name} ({scrape_result.get('total_units')} units, {scrape_result.get('confidence')})")
                        continue
                    elif scrape_result.get("status") == "low_confidence":
                        print(f"  Low confidence: {project_name} - {scrape_result.get('total_units')} units (not saved)")

                # No match found - mark as pending
                ProjectInventory.get_or_create(project_name)
                results["pending"] += 1
                print(f"  Pending: {project_name}")

            except Exception as e:
                results["errors"].append({"project": project_name, "error": str(e)})
                print(f"  Error: {project_name} - {e}")

        return results

    def refresh_stale_data(self):
        """
        Refresh inventory data for projects that need re-syncing.

        Returns:
            Dict with refresh results.
        """
        stale_records = ProjectInventory.get_stale_records()
        if not stale_records:
            return {"refreshed": 0, "message": "No stale records to refresh"}

        # Fetch fresh URA data
        self._ura_cache = self._fetch_ura_developer_sales()

        results = {"refreshed": 0, "errors": []}

        for record in stale_records:
            try:
                match = self._find_ura_match(record.project_name, self._ura_cache)
                if match:
                    ProjectInventory.upsert_from_ura(record.project_name, {
                        "launchedToDate": match.get("launchedToDate"),
                        "soldToDate": match.get("soldToDate"),
                        "unitsAvail": match.get("unitsAvail"),
                        "projectId": match.get("projectId")
                    })
                    results["refreshed"] += 1
            except Exception as e:
                results["errors"].append({"project": record.project_name, "error": str(e)})

        return results

    def get_inventory_with_sales(self, project_name):
        """
        Get inventory data combined with cumulative sales from transactions.

        Args:
            project_name: The project name to look up

        Returns:
            Dict with inventory and sales data, or None if not found
        """
        # Get inventory record
        inventory = ProjectInventory.query.filter_by(project_name=project_name).first()

        # Get cumulative sales from transactions
        sales_query = db.session.query(
            Transaction.sale_type,
            func.count(Transaction.id).label('count')
        ).filter(
            Transaction.project_name == project_name,
            Transaction.outlier_filter()
        ).group_by(Transaction.sale_type).all()

        new_sale_count = 0
        resale_count = 0
        for sale_type, count in sales_query:
            if sale_type == 'New Sale':
                new_sale_count = count
            elif sale_type == 'Resale':
                resale_count = count

        # Build response
        result = {
            "project_name": project_name,
            "cumulative_new_sales": new_sale_count,
            "cumulative_resales": resale_count,
            "total_transactions": new_sale_count + resale_count,
        }

        if inventory and inventory.total_units:
            percent_sold = round((new_sale_count / inventory.total_units) * 100, 1) if inventory.total_units > 0 else 0
            result.update({
                "total_units": inventory.total_units,
                "estimated_unsold": max(0, inventory.total_units - new_sale_count),
                "percent_sold": percent_sold,
                "data_source": inventory.data_source,
                "last_synced": inventory.last_synced.isoformat() if inventory.last_synced else None,
                "confidence": "high" if inventory.data_source == "URA_API" else "medium",
                "units_sold_ura": inventory.units_sold_ura,
                "units_available_ura": inventory.units_available,
            })
        else:
            result.update({
                "total_units": None,
                "estimated_unsold": None,
                "data_source": inventory.data_source if inventory else "NOT_FOUND",
                "confidence": "none",
                "message": "Total units data not available for this project"
            })

        return result


# Singleton instance
_inventory_sync = None


def get_inventory_sync():
    """Get the singleton InventorySyncService instance."""
    global _inventory_sync
    if _inventory_sync is None:
        _inventory_sync = InventorySyncService()
    return _inventory_sync
