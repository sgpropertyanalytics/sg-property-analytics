#!/usr/bin/env python3
"""
CLI for Ingestion Orchestrator

Commands:
    csv-diff    - Compare CSV file against database and show diff report
    csv-upload  - Upload CSV with diff detection and optional promotion

Usage:
    python cli.py csv-diff upcoming_launches data/upcoming_launches.csv
    python cli.py csv-diff new_launch_units data/new_launch_units.csv
    python cli.py csv-upload upcoming_launches data/upcoming_launches.csv --promote

Examples:
    # Show diff only (dry run)
    python cli.py csv-diff upcoming_launches data/upcoming_launches.csv

    # Show diff with detailed changes
    python cli.py csv-diff upcoming_launches data/upcoming_launches.csv --verbose

    # Upload with promotion
    python cli.py csv-upload upcoming_launches data/upcoming_launches.csv --promote

    # Force promotion even with conflicts
    python cli.py csv-upload upcoming_launches data/upcoming_launches.csv --promote --force
"""

import click
import sys
import json


def get_app_context():
    """Get Flask app context for database access."""
    from app import create_app
    app = create_app()
    return app.app_context()


@click.group()
@click.version_option(version="1.0.0", prog_name="ingestion-cli")
def cli():
    """Ingestion Orchestrator CLI - Manage CSV uploads with diff detection."""
    pass


@cli.command("csv-diff")
@click.argument("csv_type", type=click.Choice(["upcoming_launches", "new_launch_units"]))
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--verbose", "-v", is_flag=True, help="Show detailed field changes")
@click.option("--json", "output_json", is_flag=True, help="Output as JSON")
@click.option("--markdown", "-m", is_flag=True, help="Output as Markdown")
def csv_diff(csv_type, file_path, verbose, output_json, markdown):
    """
    Compare CSV file against database and show diff report.

    CSV_TYPE: Type of CSV (upcoming_launches or new_launch_units)
    FILE_PATH: Path to CSV file
    """
    click.echo(f"Computing diff for {csv_type}...")
    click.echo(f"File: {file_path}")
    click.echo()

    with get_app_context():
        from models.database import db
        from scrapers import ScrapingOrchestrator

        orchestrator = ScrapingOrchestrator(db.session)

        result = orchestrator.run_csv_upload_with_diff(
            csv_type=csv_type,
            file_path=file_path,
            dry_run=True,
        )

        if result.get("error"):
            click.secho(f"Error: {result['error']}", fg="red")
            sys.exit(1)

        # Output format
        if output_json:
            click.echo(json.dumps(result.get("diff_report", {}), indent=2, default=str))
            return

        if markdown:
            click.echo(result.get("diff_markdown", ""))
            return

        # Default: summary view
        summary = result.get("diff_summary", {})
        rows_read = result.get("rows_read", 0)

        click.echo("=" * 60)
        click.secho("DIFF SUMMARY", fg="cyan", bold=True)
        click.echo("=" * 60)
        click.echo(f"Run ID: {result.get('run_id')}")
        click.echo(f"Rows Read: {rows_read}")
        click.echo()

        # Status counts with colors
        unchanged = summary.get("unchanged", 0)
        changed = summary.get("changed", 0)
        new = summary.get("new", 0)
        missing = summary.get("missing", 0)
        conflicts = summary.get("conflicts", 0)

        click.echo(click.style(f"  Unchanged: ", fg="white") + click.style(str(unchanged), fg="green"))
        click.echo(click.style(f"  Changed:   ", fg="white") + click.style(str(changed), fg="yellow"))
        click.echo(click.style(f"  New:       ", fg="white") + click.style(str(new), fg="blue"))
        click.echo(click.style(f"  Missing:   ", fg="white") + click.style(str(missing), fg="magenta"))
        click.echo(click.style(f"  Conflicts: ", fg="white") + click.style(str(conflicts), fg="red" if conflicts > 0 else "green"))
        click.echo()

        # Promotion eligibility
        can_promote = summary.get("can_auto_promote", False)
        if can_promote:
            click.secho("  Safe to auto-promote", fg="green", bold=True)
        else:
            click.secho(f"  Review required - {summary.get('blocking_conflicts', 0)} blocking conflict(s)", fg="red", bold=True)

        # Verbose output
        if verbose and result.get("diff_report"):
            report = result["diff_report"]
            diffs = report.get("diffs", [])

            if changed > 0:
                click.echo()
                click.secho("CHANGED RECORDS:", fg="yellow", bold=True)
                for diff in diffs:
                    if diff.get("status") == "changed":
                        click.echo(f"\n  {diff['entity_key']}:")
                        for change in diff.get("changes", []):
                            old_val = change.get("old", "null")
                            new_val = change.get("new", "null")
                            field = change.get("field")
                            conflict = " [CONFLICT]" if change.get("is_conflict") else ""
                            click.echo(f"    - {field}: {old_val} -> {new_val}{conflict}")

            if new > 0:
                click.echo()
                click.secho("NEW RECORDS:", fg="blue", bold=True)
                for diff in diffs:
                    if diff.get("status") == "new":
                        click.echo(f"  - {diff['entity_key']}")

            if missing > 0:
                click.echo()
                click.secho("MISSING RECORDS (in DB but not in CSV):", fg="magenta", bold=True)
                for diff in diffs:
                    if diff.get("status") == "missing":
                        click.echo(f"  - {diff['entity_key']}")


@cli.command("csv-upload")
@click.argument("csv_type", type=click.Choice(["upcoming_launches", "new_launch_units"]))
@click.argument("file_path", type=click.Path(exists=True))
@click.option("--promote", is_flag=True, help="Promote changes to database")
@click.option("--force", is_flag=True, help="Force promotion even with conflicts")
@click.option("--dry-run", is_flag=True, help="Show what would be done without making changes")
def csv_upload(csv_type, file_path, promote, force, dry_run):
    """
    Upload CSV with diff detection and optional promotion.

    CSV_TYPE: Type of CSV (upcoming_launches or new_launch_units)
    FILE_PATH: Path to CSV file
    """
    if dry_run:
        promote = False

    click.echo(f"Processing {csv_type} upload...")
    click.echo(f"File: {file_path}")
    click.echo(f"Mode: {'DRY RUN' if dry_run else 'LIVE' if promote else 'DIFF ONLY'}")
    if force:
        click.secho("Force mode enabled - will promote even with conflicts", fg="yellow")
    click.echo()

    with get_app_context():
        from models.database import db
        from scrapers import ScrapingOrchestrator

        orchestrator = ScrapingOrchestrator(db.session)

        result = orchestrator.run_csv_upload_with_diff(
            csv_type=csv_type,
            file_path=file_path,
            auto_promote=promote,
            force_promote=force,
            dry_run=dry_run,
        )

        if result.get("error"):
            click.secho(f"Error: {result['error']}", fg="red")
            if result.get("traceback"):
                click.echo(result["traceback"])
            sys.exit(1)

        # Show diff summary
        summary = result.get("diff_summary", {})
        rows_read = result.get("rows_read", 0)

        click.echo("=" * 60)
        click.secho("UPLOAD SUMMARY", fg="cyan", bold=True)
        click.echo("=" * 60)
        click.echo(f"Run ID: {result.get('run_id')}")
        click.echo(f"Rows Read: {rows_read}")
        click.echo()

        unchanged = summary.get("unchanged", 0)
        changed = summary.get("changed", 0)
        new = summary.get("new", 0)
        missing = summary.get("missing", 0)
        conflicts = summary.get("conflicts", 0)

        click.echo(f"  Unchanged: {unchanged}")
        click.echo(f"  Changed:   {changed}")
        click.echo(f"  New:       {new}")
        click.echo(f"  Missing:   {missing}")
        click.echo(f"  Conflicts: {conflicts}")
        click.echo()

        # Show promotion results
        if promote and result.get("promotion_stats"):
            stats = result["promotion_stats"]
            click.echo("=" * 60)
            click.secho("PROMOTION RESULTS", fg="green", bold=True)
            click.echo("=" * 60)

            if stats.get("note"):
                click.echo(f"  Note: {stats['note']}")
            else:
                click.echo(f"  Inserted: {stats.get('inserted', 0)}")
                click.echo(f"  Updated:  {stats.get('updated', 0)}")
                click.echo(f"  Skipped (unchanged): {stats.get('skipped_unchanged', 0)}")
                click.echo(f"  Skipped (conflict):  {stats.get('skipped_conflict', 0)}")
                click.echo()
                click.secho(f"  Total promoted: {stats.get('promoted', 0)}", fg="green", bold=True)
        elif dry_run:
            click.secho("\nDRY RUN - No changes made", fg="yellow")
        else:
            click.echo("\nNo promotion requested. Use --promote to apply changes.")


@cli.command("scrape-diff")
@click.argument("scraper_name", type=click.Choice(["ura_gls"]))
@click.option("--year", type=int, default=2025, help="Year to scrape")
@click.option("--limit", type=int, default=None, help="Limit number of records")
@click.option("--promote", is_flag=True, help="Promote changes to database")
@click.option("--force", is_flag=True, help="Force promotion even with conflicts")
@click.option("--verbose", "-v", is_flag=True, help="Show detailed changes")
def scrape_diff(scraper_name, year, limit, promote, force, verbose):
    """
    Run scraper with diff detection.

    SCRAPER_NAME: Name of scraper to run (ura_gls)
    """
    click.echo(f"Running {scraper_name} scraper with diff detection...")
    click.echo(f"Year: {year}")
    if limit:
        click.echo(f"Limit: {limit}")
    click.echo()

    with get_app_context():
        from models.database import db
        from scrapers import ScrapingOrchestrator
        from scrapers.adapters import URAGLSAdapter

        orchestrator = ScrapingOrchestrator(db.session)
        orchestrator.register_scraper(URAGLSAdapter)

        config = {"year": year}
        if limit:
            config["limit"] = limit

        result = orchestrator.run_scraper_with_diff(
            scraper_name=scraper_name,
            config=config,
            auto_promote=promote,
            force_promote=force,
        )

        if result.get("error"):
            click.secho(f"Error: {result['error']}", fg="red")
            if result.get("traceback"):
                click.echo(result["traceback"])
            sys.exit(1)

        # Show summary
        summary = result.get("diff_summary", {})
        click.echo("=" * 60)
        click.secho("SCRAPE DIFF SUMMARY", fg="cyan", bold=True)
        click.echo("=" * 60)
        click.echo(f"Run ID: {result.get('run_id')}")
        click.echo(f"URLs Found: {result.get('urls_found', 0)}")
        click.echo(f"Records Scraped: {result.get('records_count', 0)}")
        click.echo()

        unchanged = summary.get("unchanged", 0)
        changed = summary.get("changed", 0)
        new = summary.get("new", 0)
        missing = summary.get("missing", 0)
        conflicts = summary.get("conflicts", 0)

        click.echo(click.style(f"  Unchanged: ", fg="white") + click.style(str(unchanged), fg="green"))
        click.echo(click.style(f"  Changed:   ", fg="white") + click.style(str(changed), fg="yellow"))
        click.echo(click.style(f"  New:       ", fg="white") + click.style(str(new), fg="blue"))
        click.echo(click.style(f"  Missing:   ", fg="white") + click.style(str(missing), fg="magenta"))
        click.echo(click.style(f"  Conflicts: ", fg="white") + click.style(str(conflicts), fg="red" if conflicts > 0 else "green"))

        # Promotion results
        if promote and result.get("promotion_stats"):
            stats = result["promotion_stats"]
            click.echo()
            click.secho("PROMOTION:", fg="green", bold=True)
            click.echo(f"  Inserted: {stats.get('inserted', 0)}")
            click.echo(f"  Updated:  {stats.get('updated', 0)}")
            click.echo(f"  Total:    {stats.get('promoted', 0)}")


if __name__ == "__main__":
    cli()
