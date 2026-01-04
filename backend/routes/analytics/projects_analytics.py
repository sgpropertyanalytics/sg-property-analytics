"""
Project Analysis Endpoints

Project-specific analysis endpoints for inventory, price bands, and exit queue.

Endpoints:
- /projects/<name>/inventory - Project inventory status
- /projects/<name>/price-bands - Price floor analysis
- /projects/resale-projects - List all projects with resale data
- /projects/<name>/exit-queue - Exit queue risk analysis
"""

import time
from flask import request, jsonify, g
from routes.analytics import analytics_bp
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE
from utils.normalize import (
    to_int, to_float,
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts.wrapper import api_contract


@analytics_bp.route("/projects/<path:project_name>/inventory", methods=["GET"])
@api_contract("projects/inventory")
def get_project_inventory(project_name):
    """
    Get inventory data for a specific project.

    Uses CSV file (rawdata/new_launch_units.csv) for total_units lookup.
    Calculates unsold from total_units - count(New Sale transactions).

    Returns:
        - total_units: Total units in the development
        - cumulative_new_sales: Units sold by developer (from transactions)
        - estimated_unsold: total_units - cumulative_new_sales
    """
    start = time.time()
    from models.transaction import Transaction
    from models.database import db
    from services.new_launch_units import get_units_for_project
    from sqlalchemy import func
    from db.sql import exclude_outliers

    try:
        # Lookup total_units from CSV
        lookup = get_units_for_project(project_name)
        total_units = lookup.get("total_units")

        # Count sales from transactions
        new_sale_count = db.session.query(func.count(Transaction.id)).filter(
            Transaction.project_name == project_name,
            Transaction.sale_type == SALE_TYPE_NEW,
            exclude_outliers(Transaction)
        ).scalar() or 0

        resale_count = db.session.query(func.count(Transaction.id)).filter(
            Transaction.project_name == project_name,
            Transaction.sale_type == SALE_TYPE_RESALE,
            exclude_outliers(Transaction)
        ).scalar() or 0

        # Build response
        result = {
            "project_name": project_name,
            "cumulative_new_sales": new_sale_count,
            "cumulative_resales": resale_count,
            "total_transactions": new_sale_count + resale_count,
        }

        if total_units:
            percent_sold = round((new_sale_count / total_units) * 100, 1) if total_units > 0 else 0
            result.update({
                "total_units": total_units,
                "estimated_unsold": max(0, total_units - new_sale_count),
                "percent_sold": percent_sold,
                "data_source": lookup.get("source", "CSV"),
            })
        else:
            result.update({
                "total_units": None,
                "estimated_unsold": None,
                "message": "Total units not available. Add to rawdata/new_launch_units.csv"
            })

        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/inventory took: {elapsed:.4f}s")

        return jsonify(result)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/inventory ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/projects/<path:project_name>/price-bands", methods=["GET"])
@api_contract("projects/price-bands")
def get_project_price_bands(project_name):
    """
    Get historical price bands (P25/P50/P75) for downside protection analysis.

    Computes percentile bands from resale transactions to help buyers
    assess price floor and downside risk for a specific project.

    Query params:
        - window_months: Analysis window in months (default 24, max 60)
        - unit_psf: Optional user's unit PSF for verdict calculation

    Returns:
        Strict v2 camelCase only.

    Example response:
        {
            "projectName": "The Continuum",
            "dataSource": "project",
            "proxyLabel": null,
            "bands": [{"month": "2024-01", "count": 12, "p25": 1850, ...}],
            "latest": {"month": "2024-12", "p25S": 1920, ...},
            "trend": {"floorDirection": "rising", "floorSlopePct": 2.3, ...},
            "verdict": {"unitPsf": 2100, "badge": "protected", ...},
            "dataQuality": {"totalTrades": 156, ...},
            "apiContractVersion": "v2"
        }
    """
    start = time.time()
    from services.price_bands_service import get_project_price_bands as compute_bands
    from api.contracts.contract_schema import serialize_price_bands_v2

    # Use normalized params from Pydantic (via @api_contract decorator)
    params = g.normalized_params
    window_months = params.get('window_months', 24)
    window_months = min(max(window_months, 6), 60)  # Clamp to 6-60 months

    unit_psf = params.get('unit_psf')
    if unit_psf is not None:
        # Validate PSF range
        if unit_psf < 300 or unit_psf > 10000:
            return jsonify({
                "error": "unit_psf must be between 300 and 10000",
                "type": "validation_error",
                "field": "unit_psf"
            }), 400

    try:
        # Compute price bands
        result = compute_bands(
            project_name=project_name,
            window_months=window_months,
            unit_psf=unit_psf
        )

        # Serialize to v2 schema (v1 deprecated)
        response = serialize_price_bands_v2(result)
        response['apiContractVersion'] = 'v2'

        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/price-bands completed in {elapsed:.4f}s")

        return jsonify(response)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/price-bands ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# =============================================================================
# EXIT QUEUE RISK ANALYSIS ENDPOINTS
# =============================================================================

@analytics_bp.route("/projects/resale-projects", methods=["GET"])
@api_contract("projects/resale-projects")
def get_resale_projects():
    """
    Get list of all projects from transactions table for dropdown.
    Returns project name, district, transaction counts, and data availability flags.
    """
    start = time.time()

    try:
        from models.database import db
        from sqlalchemy import text
        from services.new_launch_units import get_units_for_project
        from db.sql import OUTLIER_FILTER

        # Get all projects from transactions table
        result = db.session.execute(
            text(f"""
                SELECT
                    project_name,
                    district,
                    COUNT(*) as transaction_count,
                    COUNT(CASE WHEN sale_type = :sale_type_resale THEN 1 END) as resale_count
                FROM transactions
                WHERE {OUTLIER_FILTER}
                GROUP BY project_name, district
                ORDER BY project_name
            """),
            {"sale_type_resale": SALE_TYPE_RESALE}
        ).fetchall()

        projects = []
        for row in result:
            project_name = row[0]
            district = row[1]
            transaction_count = row[2]
            resale_count = row[3]

            # Check if we have unit data for this project
            unit_data = get_units_for_project(project_name)
            has_total_units = unit_data is not None and unit_data.get('total_units') is not None
            has_top_year = unit_data is not None and unit_data.get('top') is not None

            projects.append({
                "name": project_name,
                "district": district,
                "transaction_count": transaction_count,
                "resale_count": resale_count,
                "has_total_units": has_total_units,
                "has_top_year": has_top_year
            })

        elapsed = time.time() - start
        print(f"GET /projects/resale-projects completed in {elapsed:.4f}s ({len(projects)} projects)")

        return jsonify({
            "projects": projects,
            "count": len(projects)
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /projects/resale-projects ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/projects/<path:project_name>/exit-queue", methods=["GET"])
@api_contract("projects/exit-queue")
def get_project_exit_queue(project_name):
    """
    Get exit queue risk analysis for a specific project.

    Returns:
    - data_quality: Completeness flags and warnings
    - fundamentals: Property age, total units, tenure, district
    - resale_metrics: Transaction counts and turnover metrics (displayed as "X per 100 units")
    - risk_assessment: Liquidity zones (low/healthy/high), overall risk, interpretation
    - gating_flags: Boutique, brand new, ultra-luxury, thin data, unit-type mixed

    Query params:
    - None (v2-only response)
    """
    start = time.time()

    try:
        from models.database import db
        from sqlalchemy import text
        from services.new_launch_units import get_project_units
        from services.exit_queue_service import get_exit_queue_analysis
        from api.contracts.contract_schema import serialize_exit_queue_v2

        # Call the service - returns (result, error_response, status_code)
        # Uses hybrid lookup: CSV → database → estimation
        result, error_response, status_code = get_exit_queue_analysis(
            db=db,
            text=text,
            project_name=project_name,
            get_units_for_project=get_project_units  # Hybrid lookup with confidence
        )

        elapsed = time.time() - start
        print(f"GET /projects/{project_name}/exit-queue completed in {elapsed:.4f}s")

        # Handle error case
        if error_response:
            return jsonify(error_response), status_code

        # Serialize v2-only response (camelCase fields + enums)
        response = serialize_exit_queue_v2(result)
        return jsonify(response)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /projects/{project_name}/exit-queue ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
