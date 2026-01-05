"""
Contract schemas for chart endpoints.

Specialized chart data endpoints for visualizations.

Endpoints:
- GET /api/projects_by_district
- GET /api/price_projects_by_district
- GET /api/floor-liquidity-heatmap
- GET /api/psf-by-price-band
- GET /api/budget-heatmap
"""

from ..registry import (
    EndpointContract,
    ResponseSchema,
    FieldSpec,
    register_contract,
    SchemaMode,
    make_meta_fields,
    make_required_meta,
)
from ..pydantic_models import (
    ProjectsByDistrictParams,
    PriceProjectsByDistrictParams,
    FloorLiquidityHeatmapParams,
    PsfByPriceBandParams,
    BudgetHeatmapParams,
)


# =============================================================================
# /projects_by_district
# =============================================================================

# Project item fields (nested within projects array)
PROJECT_BY_DISTRICT_ITEM_FIELDS = {
    "project_name": FieldSpec(name="project_name", type=str, required=True),
    "total": FieldSpec(name="total", type=float, required=False),
    "total_quantity": FieldSpec(name="total_quantity", type=int, required=False),
    # Dynamic bedroom fields: 2b, 3b, 4b, 2b_count, 3b_count, 4b_count
}

PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projects": FieldSpec(name="projects", type=list, required=True),
        "project_count": FieldSpec(name="project_count", type=int, required=False),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,  # Response is {projects: [...], project_count: int}
)

PROJECTS_BY_DISTRICT_CONTRACT = EndpointContract(
    endpoint="charts/projects-by-district",
    version="v3",
    response_schema=PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA,
    pydantic_model=ProjectsByDistrictParams,
    mode=SchemaMode.WARN,
)

register_contract(PROJECTS_BY_DISTRICT_CONTRACT)


# =============================================================================
# /price_projects_by_district
# =============================================================================

# Price project item fields (nested within projects array)
PRICE_PROJECT_ITEM_FIELDS = {
    "project_name": FieldSpec(name="project_name", type=str, required=True),
    "price_25th": FieldSpec(name="price_25th", type=float, nullable=True),
    "price_median": FieldSpec(name="price_median", type=float, nullable=True),
    "price_75th": FieldSpec(name="price_75th", type=float, nullable=True),
    "psf_25th": FieldSpec(name="psf_25th", type=float, nullable=True),
    "psf_median": FieldSpec(name="psf_median", type=float, nullable=True),
    "psf_75th": FieldSpec(name="psf_75th", type=float, nullable=True),
    "count": FieldSpec(name="count", type=int, required=True),
    "sale_type_label": FieldSpec(name="sale_type_label", type=str, nullable=True),
}

PRICE_PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projects": FieldSpec(name="projects", type=list, required=True),
    },
    meta_fields=make_meta_fields(),
    required_meta=make_required_meta(),
    data_is_list=False,  # Response is {projects: [...]}
)

PRICE_PROJECTS_BY_DISTRICT_CONTRACT = EndpointContract(
    endpoint="charts/price-projects-by-district",
    version="v3",
    response_schema=PRICE_PROJECTS_BY_DISTRICT_RESPONSE_SCHEMA,
    pydantic_model=PriceProjectsByDistrictParams,
    mode=SchemaMode.WARN,
)

register_contract(PRICE_PROJECTS_BY_DISTRICT_CONTRACT)


# =============================================================================
# /floor-liquidity-heatmap
# =============================================================================

FLOOR_LIQUIDITY_HEATMAP_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        "projects": FieldSpec(name="projects", type=list, required=False),
        "floor_zone_order": FieldSpec(name="floor_zone_order", type=list, required=False),
    },
    meta_fields=make_meta_fields(
        FieldSpec(name="window_months", type=int),
        FieldSpec(name="filters_applied", type=dict),
        FieldSpec(name="filtersApplied", type=dict),
        FieldSpec(name="total_projects", type=int),
        FieldSpec(name="projects_returned", type=int),
        FieldSpec(name="exclusions", type=dict),
        FieldSpec(name="cache_hit", type=bool),
        FieldSpec(name="cacheHit", type=bool),
        FieldSpec(name="elapsed_ms", type=int),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,
)

FLOOR_LIQUIDITY_HEATMAP_CONTRACT = EndpointContract(
    endpoint="charts/floor-liquidity-heatmap",
    version="v3",
    response_schema=FLOOR_LIQUIDITY_HEATMAP_RESPONSE_SCHEMA,
    pydantic_model=FloorLiquidityHeatmapParams,
    mode=SchemaMode.WARN,
)

register_contract(FLOOR_LIQUIDITY_HEATMAP_CONTRACT)


# =============================================================================
# /psf-by-price-band
# =============================================================================

PSF_BY_PRICE_BAND_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={},
    meta_fields=make_meta_fields(
        FieldSpec(name="kAnonymity", type=dict),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,
)

PSF_BY_PRICE_BAND_CONTRACT = EndpointContract(
    endpoint="charts/psf-by-price-band",
    version="v3",
    response_schema=PSF_BY_PRICE_BAND_RESPONSE_SCHEMA,
    pydantic_model=PsfByPriceBandParams,
    mode=SchemaMode.WARN,
)

register_contract(PSF_BY_PRICE_BAND_CONTRACT)


# =============================================================================
# /budget-heatmap
# =============================================================================

BUDGET_HEATMAP_RESPONSE_SCHEMA = ResponseSchema(
    data_fields={
        # v2 response keys (camelCase)
        "matrix": FieldSpec(name="matrix", type=dict, required=False),
        "ageBands": FieldSpec(name="ageBands", type=list, required=False),
        "bedroomTypes": FieldSpec(name="bedroomTypes", type=list, required=False),
        "totalCount": FieldSpec(name="totalCount", type=int, required=False),
        "insight": FieldSpec(name="insight", type=str, required=False),
        "meta": FieldSpec(name="meta", type=dict, required=False),
    },
    meta_fields=make_meta_fields(
        # v2 meta fields (camelCase)
        FieldSpec(name="budget", type=int),
        FieldSpec(name="tolerance", type=int),
        FieldSpec(name="priceRange", type=dict),
        FieldSpec(name="monthsLookback", type=int),
        FieldSpec(name="ageIsApprox", type=bool),
    ),
    required_meta=make_required_meta(),
    data_is_list=False,
)

BUDGET_HEATMAP_CONTRACT = EndpointContract(
    endpoint="charts/budget-heatmap",
    version="v3",
    response_schema=BUDGET_HEATMAP_RESPONSE_SCHEMA,
    pydantic_model=BudgetHeatmapParams,
    mode=SchemaMode.WARN,
)

register_contract(BUDGET_HEATMAP_CONTRACT)
