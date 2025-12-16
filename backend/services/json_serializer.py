"""
JSON Serialization Helper - Converts pandas Timestamps and other non-serializable types to JSON-compatible formats
"""

import json
from datetime import datetime, date
import pandas as pd
import numpy as np


def serialize_for_json(obj):
    """
    Recursively convert non-JSON-serializable objects to strings or native types.
    
    Handles:
    - pandas Timestamp -> ISO format string
    - datetime -> ISO format string
    - date -> ISO format string
    - numpy types -> Python native types
    - dict/list -> recursively process
    """
    if isinstance(obj, (pd.Timestamp, datetime)):
        return obj.isoformat()
    elif isinstance(obj, date):
        return obj.isoformat()
    elif isinstance(obj, (np.integer, np.floating)):
        return obj.item()
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, dict):
        return {key: serialize_for_json(value) for key, value in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [serialize_for_json(item) for item in obj]
    elif pd.isna(obj):
        return None
    else:
        return obj


def safe_json_dumps(obj):
    """Safely convert object to JSON string, handling all pandas/datetime types"""
    serialized = serialize_for_json(obj)
    return json.dumps(serialized, default=str)

