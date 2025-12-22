Validate data completeness for a specific filter state.

Arguments: $ARGUMENTS (e.g., "year=2024 quarter=3 district=D09")

> This command invokes the `filter-validator` agent. See `.claude/agents/filter-validator.md` for full documentation.

## Quick Reference

**Supported arguments:**
- `year=YYYY` - Filter by year
- `quarter=N` - Filter by quarter (1-4)
- `month=N` - Filter by month (1-12)
- `district=DXX` - Filter by district (e.g., D09, D10)
- `bedroom=N` - Filter by bedroom count (2, 3, 4)
- `segment=XXX` - Filter by market segment (CCR, RCR, OCR)

## Example

```
/validate-filters year=2024 quarter=3 district=D09
```

This will:
1. Check if months 7, 8, 9 all have transactions for D09 in 2024
2. Verify Q3 transaction count = sum of July + Aug + Sept
3. Check if D09 has 2BR, 3BR, and 4BR transactions in Q3
4. Verify no data from other districts/quarters appears
5. Compare API endpoint results vs. direct database queries

## See Also

- [POWER_BI_PATTERNS.md](../../POWER_BI_PATTERNS.md#7-validation-requirements) - Full validation documentation
- [.claude/agents/filter-validator.md](../agents/filter-validator.md) - Agent implementation
