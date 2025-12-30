import pytest


def pytest_addoption(parser):
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run tests marked as integration (requires DB/network).",
    )


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: tests that require external services (e.g., database)"
    )


def pytest_collection_modifyitems(config, items):
    run_integration = config.getoption("--run-integration")
    if run_integration:
        return

    skip_integration = pytest.mark.skip(
        reason="integration test (use --run-integration to run)"
    )
    for item in items:
        if "integration" in item.keywords:
            item.add_marker(skip_integration)
