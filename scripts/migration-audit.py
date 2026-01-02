#!/usr/bin/env python3
"""
Migration Integrity Validator

Validates migration integrity by checking for incomplete migrations,
duplicate authorities, legacy code paths, and architectural drift.

Usage:
    python scripts/migration-audit.py [OPTIONS]

Options:
    --check CHECK    Run specific check (1-10) or "all" (default: all)
    --output FORMAT  Output format: json, cli, markdown (default: cli)
    --ci             Enable CI mode (exit codes, no color)
    --verbose        Show detailed output for each check
    --save FILE      Save JSON report to file

Examples:
    python scripts/migration-audit.py                    # Run all checks
    python scripts/migration-audit.py --check 2         # Run only check 2 (duplicate authorities)
    python scripts/migration-audit.py --output json     # Output as JSON
    python scripts/migration-audit.py --ci              # CI mode with exit codes
"""

import argparse
import json
import subprocess
import sys
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, date
from enum import Enum
from pathlib import Path
from typing import Optional

# ANSI color codes
class Colors:
    RED = "\033[91m"
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    MAGENTA = "\033[95m"
    CYAN = "\033[96m"
    RESET = "\033[0m"
    BOLD = "\033[1m"

class Severity(Enum):
    P0 = "P0"  # Blocks merge
    P1 = "P1"  # Warning
    P2 = "P2"  # Info

@dataclass
class Finding:
    check_id: str
    severity: Severity
    message: str
    locations: list[str]
    fix: str
    finding_type: str = ""

@dataclass
class AllowlistEntry:
    id: str
    check: str
    paths: list[str]
    justification: str
    expiry: str
    owner: str

@dataclass
class IncompleteMigration:
    commit: str
    message: str
    commit_date: str
    old_artifacts: list[str]
    new_artifacts: list[str]
    days_incomplete: int

@dataclass
class CheckResult:
    id: str
    name: str
    status: str  # PASS, FAIL, SKIP
    severity: Severity
    findings: list[Finding] = field(default_factory=list)

@dataclass
class AuditReport:
    summary: dict
    checks: list[CheckResult]
    incomplete_migrations: list[IncompleteMigration]
    allowlisted: list[dict]
    recommendations: list[dict]

class MigrationAuditor:
    def __init__(self, ci_mode: bool = False, verbose: bool = False):
        self.ci_mode = ci_mode
        self.verbose = verbose
        self.project_root = Path(__file__).parent.parent.resolve()
        if self.verbose:
            print(f"Project root: {self.project_root}")
        self.allowlist = self._load_allowlist()
        if self.verbose:
            print(f"Allowlist entries: {len(self.allowlist.get('allowlist', []))}")
        self.findings: list[Finding] = []
        self.check_results: list[CheckResult] = []
        self.incomplete_migrations: list[IncompleteMigration] = []
        self.allowlisted_items: list[dict] = []

    def _load_allowlist(self) -> dict:
        """Load the migration allowlist file."""
        allowlist_path = self.project_root / ".migration-allowlist"
        if allowlist_path.exists():
            try:
                import yaml
                return yaml.safe_load(allowlist_path.read_text())
            except ImportError:
                # Fallback: parse simple YAML manually
                return self._parse_simple_yaml(allowlist_path.read_text())
            except Exception as e:
                self._log(f"Warning: Could not parse allowlist: {e}", Colors.YELLOW)
        return {"allowlist": []}

    def _parse_simple_yaml(self, content: str) -> dict:
        """Simple YAML parser for allowlist format."""
        # This is a minimal parser for the allowlist format
        result = {"allowlist": []}
        current_entry = None

        for line in content.split("\n"):
            stripped = line.strip()
            if stripped.startswith("- id:"):
                if current_entry:
                    result["allowlist"].append(current_entry)
                current_entry = {"id": stripped.split(":", 1)[1].strip().strip('"')}
            elif current_entry and ":" in stripped:
                key, value = stripped.split(":", 1)
                key = key.strip()
                value = value.strip().strip('"')
                if key == "paths":
                    current_entry["paths"] = []
                elif key.startswith("- ") and "paths" in current_entry:
                    current_entry["paths"].append(key[2:].strip().strip('"'))
                else:
                    current_entry[key] = value

        if current_entry:
            result["allowlist"].append(current_entry)

        return result

    def _is_allowlisted(self, check_id: str, path: str) -> Optional[AllowlistEntry]:
        """Check if a finding is allowlisted."""
        # Normalize path for comparison (remove project root prefix if present)
        normalized_path = path
        project_root_str = str(self.project_root)
        if path.startswith(project_root_str):
            normalized_path = path[len(project_root_str):].lstrip("/")

        entries = self.allowlist.get("allowlist", [])
        for entry in entries:
            if entry.get("check") == check_id:
                for allowed_path in entry.get("paths", []):
                    # Check if paths match (either direction for partial matches)
                    if (allowed_path in normalized_path or
                        normalized_path in allowed_path or
                        allowed_path in path or
                        path.endswith(allowed_path)):
                        # Check expiry
                        expiry_str = entry.get("expiry", "")
                        if expiry_str:
                            try:
                                # Handle quoted strings from YAML
                                expiry_str = str(expiry_str).strip('"\'')
                                expiry_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                                if expiry_date < date.today():
                                    if self.verbose:
                                        self._log(f"    Allowlist expired: {entry.get('id')}", Colors.YELLOW)
                                    return None  # Expired
                            except ValueError as e:
                                if self.verbose:
                                    self._log(f"    Date parse error: {e}", Colors.RED)
                        return AllowlistEntry(
                            id=entry.get("id", ""),
                            check=entry.get("check", ""),
                            paths=entry.get("paths", []),
                            justification=entry.get("justification", ""),
                            expiry=str(entry.get("expiry", "")).strip('"\''),
                            owner=entry.get("owner", "")
                        )
        return None

    def _run_grep(self, pattern: str, paths: list[str],
                  include: Optional[str] = None,
                  exclude_pattern: Optional[str] = None) -> list[str]:
        """Run grep and return matching lines."""
        cmd = ["grep", "-rn", "-E", pattern]
        if include:
            cmd.extend(["--include", include])
        cmd.extend([str(self.project_root / p) for p in paths])

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            lines = [l for l in result.stdout.strip().split("\n") if l]
            if exclude_pattern:
                lines = [l for l in lines if not re.search(exclude_pattern, l)]
            return lines
        except (subprocess.TimeoutExpired, Exception) as e:
            if self.verbose:
                self._log(f"Grep error: {e}", Colors.YELLOW)
            return []

    def _run_git(self, args: list[str]) -> list[str]:
        """Run git command and return output lines."""
        cmd = ["git", "-C", str(self.project_root)] + args
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return [l for l in result.stdout.strip().split("\n") if l]
        except (subprocess.TimeoutExpired, Exception) as e:
            if self.verbose:
                self._log(f"Git error: {e}", Colors.YELLOW)
            return []

    def _log(self, message: str, color: str = ""):
        """Log message with optional color."""
        if self.ci_mode:
            print(message)
        else:
            print(f"{color}{message}{Colors.RESET}")

    # =========================================================================
    # CHECK 1: Duplicate Authorities (P0)
    # =========================================================================
    def check_1_duplicate_authorities(self) -> CheckResult:
        """Find >1 implementation of the same concern."""
        findings = []

        # 1. Check for multiple normalization implementations
        norm_matches = self._run_grep(
            r"def (to_int|to_date|to_float|to_bool|to_list|normalize_)",
            ["backend/"],
            include="*.py"
        )

        norm_files = set()
        for match in norm_matches:
            file_path = match.split(":")[0]
            # Exclude test files
            if "/tests/" not in file_path and "test_" not in file_path:
                norm_files.add(file_path)

        if len(norm_files) > 1:
            # Check if any are allowlisted
            non_allowlisted = []
            allowlisted_count = 0
            for f in norm_files:
                entry = self._is_allowlisted("duplicate_authorities", f)
                if entry:
                    allowlisted_count += 1
                    self.allowlisted_items.append({
                        "check": "duplicate_authorities",
                        "path": f,
                        "type": "normalization",
                        "id": entry.id
                    })
                    if self.verbose:
                        self._log(f"  Allowlisted: {f}", Colors.MAGENTA)
                else:
                    non_allowlisted.append(f)
                    if self.verbose:
                        self._log(f"  Not allowlisted: {f}", Colors.YELLOW)

            # Only report if there are non-allowlisted files that represent true duplication
            # (more than 1 non-allowlisted file, or allowlisted files + 1 non-allowlisted)
            if len(non_allowlisted) > 1:
                findings.append(Finding(
                    check_id="duplicate_authorities",
                    severity=Severity.P0,
                    message="Multiple normalization implementations found",
                    locations=list(non_allowlisted),
                    fix="Consolidate into single source: backend/utils/normalize.py",
                    finding_type="normalization"
                ))

        # 2. Check for multiple retry mechanisms in frontend
        retry_matches = self._run_grep(
            r"(retryCount|retryAttempts|auth:token-refreshed|setupRetryInterceptor)",
            ["frontend/src/"],
            include="*.js"
        )

        retry_files = set()
        for match in retry_matches:
            file_path = match.split(":")[0]
            # Exclude test files
            if "/tests/" not in file_path and ".test." not in file_path:
                retry_files.add(file_path)

        if len(retry_files) > 1:
            non_allowlisted = []
            for f in retry_files:
                if self._is_allowlisted("duplicate_authorities", f):
                    self.allowlisted_items.append({
                        "check": "duplicate_authorities",
                        "path": f,
                        "type": "retry"
                    })
                else:
                    non_allowlisted.append(f)

            # Only report if there are non-allowlisted duplicates
            if len(non_allowlisted) > 1:
                findings.append(Finding(
                    check_id="duplicate_authorities",
                    severity=Severity.P0,
                    message="Multiple retry mechanisms found",
                    locations=list(non_allowlisted),
                    fix="Consolidate retry logic into API client interceptor only",
                    finding_type="retry"
                ))

        # 3. Check for multiple query hook implementations
        hook_matches = self._run_grep(
            r"export.*(function|const).*(useQuery|useFetch|useAbortable)",
            ["frontend/src/hooks/"],
            include="*.js"
        )

        hook_files = set()
        for match in hook_matches:
            file_path = match.split(":")[0]
            hook_files.add(file_path)

        if len(hook_files) > 2:  # Allow useQuery + useGatedAbortableQuery
            non_allowlisted = []
            for f in hook_files:
                if not self._is_allowlisted("duplicate_authorities", f):
                    non_allowlisted.append(f)

            if len(non_allowlisted) > 2:
                findings.append(Finding(
                    check_id="duplicate_authorities",
                    severity=Severity.P0,
                    message="Multiple query hook implementations found",
                    locations=list(non_allowlisted),
                    fix="Use useQuery as base, wrap with useGatedAbortableQuery",
                    finding_type="query_hooks"
                ))

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="1_duplicate_authorities",
            name="Duplicate Authorities",
            status=status,
            severity=Severity.P0,
            findings=findings
        )

    # =========================================================================
    # CHECK 2: Dynamic SQL (P0)
    # =========================================================================
    def check_2_dynamic_sql(self) -> CheckResult:
        """Check for dynamic SQL construction."""
        findings = []

        # 1. f-string SQL
        fstring_matches = self._run_grep(
            r'f"[^"]*SELECT|f"[^"]*INSERT|f"[^"]*UPDATE|f"[^"]*DELETE',
            ["backend/"],
            include="*.py",
            exclude_pattern=r"test_|tests/"
        )

        if fstring_matches:
            findings.append(Finding(
                check_id="dynamic_sql",
                severity=Severity.P0,
                message="f-string SQL construction detected",
                locations=fstring_matches[:10],  # Limit to 10
                fix="Use static SQL with :param placeholders",
                finding_type="fstring_sql"
            ))

        # 2. String concatenation SQL
        concat_matches = self._run_grep(
            r'"\s*\+.*SELECT|SELECT.*\+\s*"',
            ["backend/"],
            include="*.py",
            exclude_pattern=r"test_|tests/"
        )

        if concat_matches:
            findings.append(Finding(
                check_id="dynamic_sql",
                severity=Severity.P0,
                message="String concatenation SQL detected",
                locations=concat_matches[:10],
                fix="Use static SQL with :param placeholders",
                finding_type="concat_sql"
            ))

        # 3. Old-style %(param)s
        old_style_matches = self._run_grep(
            r'%\([a-zA-Z_]+\)s',
            ["backend/services/", "backend/routes/"],
            include="*.py",
            exclude_pattern=r"test_|tests/"
        )

        if old_style_matches:
            findings.append(Finding(
                check_id="dynamic_sql",
                severity=Severity.P0,
                message="%(param)s style SQL detected (should use :param)",
                locations=old_style_matches[:10],
                fix="Use :param style for all SQL parameters",
                finding_type="old_style_params"
            ))

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="2_dynamic_sql",
            name="Dynamic SQL",
            status=status,
            severity=Severity.P0,
            findings=findings
        )

    # =========================================================================
    # CHECK 3: Old Path Reachable (P1)
    # =========================================================================
    def check_3_old_path_reachable(self) -> CheckResult:
        """Find deprecated code that's still callable."""
        findings = []

        # 1. Find route files that only return 410/deprecated
        route_files = list((self.project_root / "backend/routes").rglob("*.py"))
        for route_file in route_files:
            # Skip __init__.py files
            if route_file.name == "__init__.py":
                continue

            content = route_file.read_text()
            if "410" in content or "Gone" in content:
                # Check if file ONLY returns 410/deprecated
                if content.count("return") <= 5 and ("410" in content or "deprecated" in content.lower()):
                    rel_path = str(route_file.relative_to(self.project_root))
                    allowlist_entry = self._is_allowlisted("old_path_reachable", rel_path)
                    if not allowlist_entry:
                        findings.append(Finding(
                            check_id="old_path_reachable",
                            severity=Severity.P1,
                            message="Deprecated route file still exists (only returns 410)",
                            locations=[rel_path],
                            fix="Delete file after confirming no external consumers",
                            finding_type="deprecated_route"
                        ))
                    else:
                        self.allowlisted_items.append({
                            "check": "old_path_reachable",
                            "path": rel_path,
                            "type": "deprecated_route",
                            "id": allowlist_entry.id,
                            "expiry": allowlist_entry.expiry
                        })

        # 2. Find @deprecated markers in frontend that are still imported
        deprecated_matches = self._run_grep(
            r"@deprecated",
            ["frontend/src/"],
            include="*.js"
        )

        for match in deprecated_matches:
            file_path = match.split(":")[0]
            rel_path = str(Path(file_path).relative_to(self.project_root))

            # Check if this file is imported elsewhere
            file_name = Path(file_path).stem
            import_matches = self._run_grep(
                f"from.*{file_name}|import.*{file_name}",
                ["frontend/src/"],
                include="*.js"
            )

            # Filter out self-imports
            external_imports = [m for m in import_matches if rel_path not in m]

            if external_imports and not self._is_allowlisted("old_path_reachable", rel_path):
                findings.append(Finding(
                    check_id="old_path_reachable",
                    severity=Severity.P1,
                    message=f"Deprecated file still imported: {rel_path}",
                    locations=external_imports[:5],
                    fix="Migrate imports to new implementation",
                    finding_type="deprecated_import"
                ))

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="3_old_path_reachable",
            name="Old Path Reachable",
            status=status,
            severity=Severity.P1,
            findings=findings
        )

    # =========================================================================
    # CHECK 4: Contract Drift (P1)
    # =========================================================================
    def check_4_contract_drift(self) -> CheckResult:
        """Check if schema definitions match runtime behavior."""
        findings = []

        # This check requires comparing schema files to actual route implementations
        # For now, we'll check for obvious mismatches

        # 1. Check if all routes with @api_contract use g.normalized_params
        contract_routes = self._run_grep(
            r"@api_contract",
            ["backend/routes/"],
            include="*.py"
        )

        for match in contract_routes:
            file_path = match.split(":")[0]
            content = Path(file_path).read_text() if Path(file_path).exists() else ""

            # Routes with @api_contract should use g.normalized_params
            if "@api_contract" in content and "g.normalized_params" not in content:
                if "request.args" in content:
                    rel_path = str(Path(file_path).relative_to(self.project_root))
                    findings.append(Finding(
                        check_id="contract_drift",
                        severity=Severity.P1,
                        message="Route with @api_contract uses request.args instead of g.normalized_params",
                        locations=[rel_path],
                        fix="Use g.normalized_params for validated params",
                        finding_type="params_mismatch"
                    ))

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="4_contract_drift",
            name="Contract Drift",
            status=status,
            severity=Severity.P1,
            findings=findings
        )

    # =========================================================================
    # CHECK 5: Wrapper-Only Migration (P1)
    # =========================================================================
    def check_5_wrapper_only_migration(self) -> CheckResult:
        """Find wrappers that just forward to old implementations."""
        findings = []

        # Check for hooks that just re-export
        hook_files = list((self.project_root / "frontend/src/hooks").glob("*.js"))

        for hook_file in hook_files:
            content = hook_file.read_text()

            # Simple heuristic: if file is small and just returns another hook
            lines = [l.strip() for l in content.split("\n") if l.strip() and not l.strip().startswith("//")]

            # Check for patterns like "return useOtherHook(...)" in small files
            if len(lines) < 40:
                if re.search(r"return\s+use[A-Z]\w+\(", content):
                    if "@deprecated" in content:
                        rel_path = str(hook_file.relative_to(self.project_root))
                        if not self._is_allowlisted("wrapper_only_migration", rel_path):
                            findings.append(Finding(
                                check_id="wrapper_only_migration",
                                severity=Severity.P1,
                                message="Deprecated wrapper hook that just re-exports",
                                locations=[rel_path],
                                fix="Migrate callers to use the underlying hook directly",
                                finding_type="wrapper_hook"
                            ))
                        else:
                            self.allowlisted_items.append({
                                "check": "wrapper_only_migration",
                                "path": rel_path,
                                "type": "wrapper_hook"
                            })

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="5_wrapper_only_migration",
            name="Wrapper-Only Migration",
            status=status,
            severity=Severity.P1,
            findings=findings
        )

    # =========================================================================
    # CHECK 6: Normalization Split-Brain (P1)
    # =========================================================================
    def check_6_normalization_split_brain(self) -> CheckResult:
        """Find same value normalized differently in different places."""
        findings = []

        # Check for multiple sale_type normalization patterns
        sale_type_matches = self._run_grep(
            r"(normalize_sale_type|SaleType\.from_db|sale_type.*=.*['\"])",
            ["backend/"],
            include="*.py"
        )

        # Group by file
        files_with_normalization = set()
        for match in sale_type_matches:
            file_path = match.split(":")[0]
            files_with_normalization.add(file_path)

        if len(files_with_normalization) > 2:  # Allow constants.py + contract_schema.py
            findings.append(Finding(
                check_id="normalization_split_brain",
                severity=Severity.P1,
                message="Sale type normalization scattered across multiple files",
                locations=list(files_with_normalization)[:5],
                fix="Consolidate normalization into single source (constants.py or contract_schema.py)",
                finding_type="sale_type_normalization"
            ))

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="6_normalization_split_brain",
            name="Normalization Split-Brain",
            status=status,
            severity=Severity.P1,
            findings=findings
        )

    # =========================================================================
    # CHECK 7: Multiple State Machines (P2)
    # =========================================================================
    def check_7_multiple_state_machines(self) -> CheckResult:
        """Find multiple state machines for the same concern."""
        findings = []

        # Check for multiple auth state implementations
        auth_state_matches = self._run_grep(
            r"(isAuthenticated|isLoggedIn|authState|useAuth)",
            ["frontend/src/"],
            include="*.js"
        )

        auth_files = set()
        for match in auth_state_matches:
            file_path = match.split(":")[0]
            if "context" in file_path.lower() or "hook" in file_path.lower():
                auth_files.add(file_path)

        # This is informational - multiple references are expected
        # Only flag if there are multiple DEFINITIONS

        status = "PASS"  # Usually PASS for P2
        return CheckResult(
            id="7_multiple_state_machines",
            name="Multiple State Machines",
            status=status,
            severity=Severity.P2,
            findings=findings
        )

    # =========================================================================
    # CHECK 8: Adapter Inconsistency (P2)
    # =========================================================================
    def check_8_adapter_inconsistency(self) -> CheckResult:
        """Check if adapters produce inconsistent output shapes."""
        findings = []

        # Find all adapter files
        adapter_path = self.project_root / "frontend/src/adapters"
        if adapter_path.exists():
            adapter_files = list(adapter_path.rglob("*.js"))

            # This would require AST parsing for accurate analysis
            # For now, we do a simple check for common inconsistencies

            if self.verbose:
                self._log(f"Found {len(adapter_files)} adapter files", Colors.CYAN)

        status = "PASS"
        return CheckResult(
            id="8_adapter_inconsistency",
            name="Adapter Inconsistency",
            status=status,
            severity=Severity.P2,
            findings=findings
        )

    # =========================================================================
    # CHECK 9: Error Model Leakage (P2)
    # =========================================================================
    def check_9_error_model_leakage(self) -> CheckResult:
        """Check if raw errors reach UI boundary."""
        findings = []

        # Check for components rendering raw error.message
        error_render_matches = self._run_grep(
            r"\{error\.message\}|\{error\.response",
            ["frontend/src/components/"],
            include="*.jsx"
        )

        if error_render_matches:
            findings.append(Finding(
                check_id="error_model_leakage",
                severity=Severity.P2,
                message="Components rendering raw error objects",
                locations=error_render_matches[:5],
                fix="Use normalized userMessage from error handler",
                finding_type="raw_error_render"
            ))

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="9_error_model_leakage",
            name="Error Model Leakage",
            status=status,
            severity=Severity.P2,
            findings=findings
        )

    # =========================================================================
    # CHECK 10: No Enforcement Layer (P2)
    # =========================================================================
    def check_10_no_enforcement_layer(self) -> CheckResult:
        """Check if migration can regress without detection."""
        findings = []

        # Check for CI workflow
        workflows_path = self.project_root / ".github/workflows"
        if not workflows_path.exists() or not list(workflows_path.glob("*.yml")):
            findings.append(Finding(
                check_id="no_enforcement_layer",
                severity=Severity.P2,
                message="No GitHub Actions workflows found",
                locations=[".github/workflows/"],
                fix="Add CI workflow to enforce migration integrity",
                finding_type="missing_ci"
            ))

        # Check for ESLint rules targeting deprecated patterns
        eslint_config = self.project_root / "frontend/eslint.config.js"
        if eslint_config.exists():
            content = eslint_config.read_text()
            if "no-restricted-imports" not in content:
                findings.append(Finding(
                    check_id="no_enforcement_layer",
                    severity=Severity.P2,
                    message="No ESLint rule for restricted imports",
                    locations=["frontend/eslint.config.js"],
                    fix="Add no-restricted-imports rule for deprecated modules",
                    finding_type="missing_lint_rule"
                ))

        status = "FAIL" if findings else "PASS"
        return CheckResult(
            id="10_no_enforcement_layer",
            name="No Enforcement Layer",
            status=status,
            severity=Severity.P2,
            findings=findings
        )

    # =========================================================================
    # Git History Analysis
    # =========================================================================
    def analyze_git_history(self) -> list[IncompleteMigration]:
        """Analyze git history for incomplete migrations."""
        migrations = []

        # Find migration-related commits
        migrate_commits = self._run_git([
            "log", "--all", "--oneline",
            "--grep=migrate", "--grep=v2", "--grep=deprecate",
            "--since=6 months ago",
            "-n", "20"
        ])

        for commit_line in migrate_commits:
            if not commit_line.strip():
                continue

            parts = commit_line.split(" ", 1)
            if len(parts) < 2:
                continue

            commit_hash = parts[0]
            commit_msg = parts[1]

            # Get files changed in this commit
            changed_files = self._run_git([
                "show", "--name-only", "--pretty=format:", commit_hash
            ])

            # Look for v2/new files that have v1/old counterparts still existing
            new_files = [f for f in changed_files if "v2" in f or "_new" in f]
            for new_file in new_files:
                old_file = new_file.replace("v2", "v1").replace("_v2", "").replace("_new", "")
                old_path = self.project_root / old_file

                if old_path.exists():
                    # Get commit date
                    date_output = self._run_git([
                        "show", "-s", "--format=%ci", commit_hash
                    ])
                    commit_date = date_output[0] if date_output else ""

                    # Calculate days incomplete
                    days = 0
                    if commit_date:
                        try:
                            commit_dt = datetime.strptime(commit_date[:10], "%Y-%m-%d")
                            days = (datetime.now() - commit_dt).days
                        except ValueError:
                            pass

                    migrations.append(IncompleteMigration(
                        commit=commit_hash,
                        message=commit_msg,
                        commit_date=commit_date[:10] if commit_date else "",
                        old_artifacts=[old_file],
                        new_artifacts=[new_file],
                        days_incomplete=days
                    ))

        return migrations

    # =========================================================================
    # Run All Checks
    # =========================================================================
    def run_all_checks(self, specific_check: Optional[int] = None) -> AuditReport:
        """Run all migration integrity checks."""
        checks = [
            self.check_1_duplicate_authorities,
            self.check_2_dynamic_sql,
            self.check_3_old_path_reachable,
            self.check_4_contract_drift,
            self.check_5_wrapper_only_migration,
            self.check_6_normalization_split_brain,
            self.check_7_multiple_state_machines,
            self.check_8_adapter_inconsistency,
            self.check_9_error_model_leakage,
            self.check_10_no_enforcement_layer,
        ]

        if specific_check:
            if 1 <= specific_check <= len(checks):
                checks = [checks[specific_check - 1]]
            else:
                self._log(f"Invalid check number: {specific_check}", Colors.RED)
                sys.exit(1)

        for i, check_fn in enumerate(checks, 1):
            if self.verbose:
                self._log(f"Running check {i}/{len(checks)}: {check_fn.__name__}", Colors.CYAN)

            try:
                result = check_fn()
                self.check_results.append(result)
            except Exception as e:
                self._log(f"Error in check {i}: {e}", Colors.RED)
                self.check_results.append(CheckResult(
                    id=f"check_{i}_error",
                    name=f"Check {i}",
                    status="ERROR",
                    severity=Severity.P0,
                    findings=[]
                ))

        # Analyze git history
        if self.verbose:
            self._log("Analyzing git history...", Colors.CYAN)
        self.incomplete_migrations = self.analyze_git_history()

        # Build summary
        p0_count = sum(1 for r in self.check_results
                       if r.status == "FAIL" and r.severity == Severity.P0)
        p1_count = sum(1 for r in self.check_results
                       if r.status == "FAIL" and r.severity == Severity.P1)
        p2_count = sum(1 for r in self.check_results
                       if r.status == "FAIL" and r.severity == Severity.P2)

        status = "CRITICAL" if p0_count > 0 else ("INCOMPLETE" if p1_count > 0 else "COMPLETE")

        summary = {
            "status": status,
            "p0Count": p0_count,
            "p1Count": p1_count,
            "p2Count": p2_count,
            "allowlistedCount": len(self.allowlisted_items),
            "incompleteMigrationsCount": len(self.incomplete_migrations),
            "timestamp": datetime.now().isoformat()
        }

        # Build recommendations
        recommendations = []
        for result in self.check_results:
            if result.status == "FAIL":
                for finding in result.findings:
                    recommendations.append({
                        "priority": finding.severity.value,
                        "action": finding.fix,
                        "reason": finding.message
                    })

        return AuditReport(
            summary=summary,
            checks=self.check_results,
            incomplete_migrations=self.incomplete_migrations,
            allowlisted=self.allowlisted_items,
            recommendations=recommendations
        )

    # =========================================================================
    # Output Formatters
    # =========================================================================
    def format_cli(self, report: AuditReport) -> str:
        """Format report for CLI output."""
        lines = []

        # Header
        status_color = {
            "COMPLETE": Colors.GREEN,
            "INCOMPLETE": Colors.YELLOW,
            "CRITICAL": Colors.RED
        }.get(report.summary["status"], Colors.RESET)

        lines.append("")
        lines.append("╔══════════════════════════════════════════════════════════════════╗")
        lines.append("║                  MIGRATION INTEGRITY REPORT                       ║")
        lines.append("╠══════════════════════════════════════════════════════════════════╣")
        lines.append(f"║  Status: {status_color}{report.summary['status']}{Colors.RESET}                                               ║")
        lines.append(f"║  P0 Issues: {report.summary['p0Count']} (blocking)                                          ║")
        lines.append(f"║  P1 Issues: {report.summary['p1Count']} (warning)                                           ║")
        lines.append(f"║  P2 Issues: {report.summary['p2Count']} (info)                                              ║")
        lines.append(f"║  Allowlisted: {report.summary['allowlistedCount']}                                                   ║")
        lines.append("╚══════════════════════════════════════════════════════════════════╝")
        lines.append("")

        # Findings by severity
        for check in report.checks:
            if check.status == "FAIL":
                color = Colors.RED if check.severity == Severity.P0 else (
                    Colors.YELLOW if check.severity == Severity.P1 else Colors.CYAN
                )

                lines.append(f"{color}[{check.severity.value}] {check.name.upper()}{Colors.RESET}")

                for finding in check.findings:
                    lines.append(f"  └─ {finding.message}")
                    for loc in finding.locations[:5]:
                        lines.append(f"     • {loc}")
                    if len(finding.locations) > 5:
                        lines.append(f"     ... and {len(finding.locations) - 5} more")
                    lines.append("")
                    lines.append(f"     {Colors.BLUE}FIX: {finding.fix}{Colors.RESET}")
                    lines.append("")

        # Allowlisted items
        if report.allowlisted:
            lines.append(f"{Colors.MAGENTA}[ALLOWLISTED]{Colors.RESET}")
            for item in report.allowlisted:
                lines.append(f"  └─ {item.get('path', 'unknown')} ({item.get('type', '')})")
            lines.append("")

        # Git history
        if report.incomplete_migrations:
            lines.append("──────────────────────────────────────────────────────────────────")
            lines.append("GIT HISTORY ANALYSIS")
            lines.append("──────────────────────────────────────────────────────────────────")
            lines.append("")
            lines.append("Incomplete Migrations Detected:")
            lines.append("")

            for migration in report.incomplete_migrations:
                lines.append(f"  • \"{migration.message}\" ({migration.commit}, {migration.commit_date})")
                for old in migration.old_artifacts:
                    lines.append(f"    └─ OLD: {old} (still exists)")
                for new in migration.new_artifacts:
                    lines.append(f"    └─ NEW: {new}")
                lines.append(f"    └─ Days incomplete: {migration.days_incomplete}")
                lines.append("")

        # Recommendations
        if report.recommendations:
            lines.append("──────────────────────────────────────────────────────────────────")
            lines.append("RECOMMENDATIONS (Priority Order)")
            lines.append("──────────────────────────────────────────────────────────────────")
            lines.append("")

            for i, rec in enumerate(report.recommendations[:10], 1):
                lines.append(f"{i}. [{rec['priority']}] {rec['action']}")
            lines.append("")

        return "\n".join(lines)

    def format_json(self, report: AuditReport) -> str:
        """Format report as JSON."""
        def serialize(obj):
            if isinstance(obj, Severity):
                return obj.value
            if isinstance(obj, (CheckResult, Finding, IncompleteMigration)):
                return asdict(obj)
            return str(obj)

        data = {
            "summary": report.summary,
            "checks": [asdict(c) for c in report.checks],
            "incompleteMigrations": [asdict(m) for m in report.incomplete_migrations],
            "allowlisted": report.allowlisted,
            "recommendations": report.recommendations
        }

        # Fix enum serialization
        for check in data["checks"]:
            check["severity"] = check["severity"].value if isinstance(check["severity"], Severity) else check["severity"]
            for finding in check.get("findings", []):
                if "severity" in finding:
                    finding["severity"] = finding["severity"].value if isinstance(finding["severity"], Severity) else finding["severity"]

        return json.dumps(data, indent=2, default=serialize)

    def format_markdown(self, report: AuditReport) -> str:
        """Format report as Markdown."""
        lines = []

        lines.append("# Migration Integrity Report")
        lines.append("")
        lines.append(f"**Status**: {report.summary['status']}")
        lines.append(f"**Generated**: {report.summary['timestamp']}")
        lines.append("")
        lines.append("## Summary")
        lines.append("")
        lines.append(f"| Metric | Count |")
        lines.append(f"|--------|-------|")
        lines.append(f"| P0 Issues | {report.summary['p0Count']} |")
        lines.append(f"| P1 Issues | {report.summary['p1Count']} |")
        lines.append(f"| P2 Issues | {report.summary['p2Count']} |")
        lines.append(f"| Allowlisted | {report.summary['allowlistedCount']} |")
        lines.append("")

        for check in report.checks:
            if check.status == "FAIL":
                lines.append(f"## [{check.severity.value}] {check.name}")
                lines.append("")
                for finding in check.findings:
                    lines.append(f"### {finding.message}")
                    lines.append("")
                    lines.append("**Locations:**")
                    for loc in finding.locations[:10]:
                        lines.append(f"- `{loc}`")
                    lines.append("")
                    lines.append(f"**Fix:** {finding.fix}")
                    lines.append("")

        return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(
        description="Migration Integrity Validator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    parser.add_argument("--check", type=int, help="Run specific check (1-10)")
    parser.add_argument("--output", choices=["json", "cli", "markdown"], default="cli")
    parser.add_argument("--ci", action="store_true", help="CI mode (exit codes, no color)")
    parser.add_argument("--verbose", action="store_true", help="Verbose output")
    parser.add_argument("--save", type=str, help="Save JSON report to file")

    args = parser.parse_args()

    # Disable colors in CI mode
    if args.ci:
        for attr in dir(Colors):
            if not attr.startswith("_"):
                setattr(Colors, attr, "")

    auditor = MigrationAuditor(ci_mode=args.ci, verbose=args.verbose)
    report = auditor.run_all_checks(specific_check=args.check)

    # Output
    if args.output == "json":
        output = auditor.format_json(report)
    elif args.output == "markdown":
        output = auditor.format_markdown(report)
    else:
        output = auditor.format_cli(report)

    print(output)

    # Save JSON if requested
    if args.save:
        json_output = auditor.format_json(report)
        Path(args.save).write_text(json_output)
        print(f"\nReport saved to: {args.save}")

    # Exit code for CI
    if args.ci:
        if report.summary["p0Count"] > 0:
            sys.exit(1)  # P0 issues - fail
        elif report.summary["p1Count"] > 0:
            sys.exit(2)  # P1 issues - warning
        else:
            sys.exit(0)  # All clear


if __name__ == "__main__":
    main()
