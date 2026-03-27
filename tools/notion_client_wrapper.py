"""
Shared Notion SDK wrapper.
Handles authentication, rate limiting, retries, and common database operations.
Uses the Notion data sources API (2026-03-11) for database queries.
All other Notion tools import from here.
"""

import os
import time
import httpx
from notion_client import Client, APIResponseError, APIErrorCode
from dotenv import load_dotenv

load_dotenv()

# API version that supports data sources
NOTION_VERSION = "2026-03-11"

# Singleton instances
_client = None
_http_headers = None

# Cache for data source IDs (db_id -> ds_id)
_ds_cache = {}


def get_client() -> Client:
    """Get or create the Notion client singleton."""
    global _client
    if _client is None:
        api_key = os.getenv("NOTION_API_KEY")
        if not api_key:
            raise ValueError("NOTION_API_KEY not set in .env")
        _client = Client(auth=api_key)
    return _client


def _get_headers() -> dict:
    """Get HTTP headers for direct API calls (data sources)."""
    global _http_headers
    if _http_headers is None:
        api_key = os.getenv("NOTION_API_KEY")
        if not api_key:
            raise ValueError("NOTION_API_KEY not set in .env")
        _http_headers = {
            "Authorization": f"Bearer {api_key}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        }
    return _http_headers


def get_db_id(name: str) -> str:
    """Get a database ID from environment variables."""
    env_key = f"NOTION_DB_{name}"
    db_id = os.getenv(env_key)
    if not db_id:
        raise ValueError(f"{env_key} not set in .env")
    return db_id


def get_data_source_id(db_name: str) -> str:
    """Get the data source ID for a database (with caching)."""
    if db_name in _ds_cache:
        return _ds_cache[db_name]

    client = get_client()
    db_id = get_db_id(db_name)
    db = client.databases.retrieve(database_id=db_id)
    ds_list = db.get("data_sources", [])
    if not ds_list:
        raise ValueError(f"No data source found for {db_name}")

    ds_id = ds_list[0]["id"]
    _ds_cache[db_name] = ds_id
    return ds_id


def _retry_on_rate_limit(func, *args, max_retries=3, **kwargs):
    """Execute a Notion API call with exponential backoff on rate limits."""
    for attempt in range(max_retries):
        try:
            return func(*args, **kwargs)
        except APIResponseError as e:
            if e.code == APIErrorCode.RateLimited and attempt < max_retries - 1:
                wait = 2 ** attempt
                time.sleep(wait)
                continue
            raise
    return None


def _api_request(method: str, path: str, json_body: dict = None, max_retries: int = 3) -> dict:
    """Make a direct HTTP request to the Notion API with retry logic."""
    headers = _get_headers()
    url = f"https://api.notion.com/v1{path}"

    for attempt in range(max_retries):
        if method == "GET":
            resp = httpx.get(url, headers=headers, timeout=30)
        elif method == "POST":
            resp = httpx.post(url, headers=headers, json=json_body or {}, timeout=30)
        elif method == "PATCH":
            resp = httpx.patch(url, headers=headers, json=json_body or {}, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")

        if resp.status_code == 429 and attempt < max_retries - 1:
            wait = 2 ** attempt
            time.sleep(wait)
            continue

        resp.raise_for_status()
        return resp.json()

    return {}


def query_database(db_name: str, filter_obj: dict = None, sorts: list = None, page_size: int = 100) -> list:
    """Query a Notion database via its data source and return all matching pages."""
    ds_id = get_data_source_id(db_name)

    body = {"page_size": page_size}
    if filter_obj:
        body["filter"] = filter_obj
    if sorts:
        body["sorts"] = sorts

    all_results = []
    has_more = True

    while has_more:
        response = _api_request("POST", f"/data_sources/{ds_id}/query", body)
        all_results.extend(response.get("results", []))
        has_more = response.get("has_more", False)
        next_cursor = response.get("next_cursor")
        if next_cursor:
            body["start_cursor"] = next_cursor
        else:
            has_more = False

    return all_results


def retrieve_data_source_schema(db_name: str) -> dict:
    """Retrieve a data source's full schema (properties)."""
    ds_id = get_data_source_id(db_name)
    return _api_request("GET", f"/data_sources/{ds_id}")


def create_page(db_name: str, properties: dict, children: list = None) -> dict:
    """Create a new page in a Notion database."""
    client = get_client()
    db_id = get_db_id(db_name)

    kwargs = {
        "parent": {"database_id": db_id},
        "properties": properties,
    }
    if children:
        kwargs["children"] = children

    return _retry_on_rate_limit(client.pages.create, **kwargs)


def update_page(page_id: str, properties: dict) -> dict:
    """Update an existing page's properties."""
    client = get_client()
    return _retry_on_rate_limit(client.pages.update, page_id=page_id, properties=properties)


def get_page_title(page: dict) -> str:
    """Extract the title text from a page object."""
    for prop_name, prop_value in page.get("properties", {}).items():
        if prop_value.get("type") == "title":
            title_parts = prop_value.get("title", [])
            if title_parts:
                return "".join(part.get("plain_text", "") for part in title_parts)
    return ""


def get_property_value(page: dict, prop_name: str):
    """Extract a property value from a page, handling common types."""
    prop = page.get("properties", {}).get(prop_name)
    if not prop:
        return None

    prop_type = prop.get("type")

    if prop_type == "title":
        parts = prop.get("title", [])
        return "".join(p.get("plain_text", "") for p in parts) if parts else ""

    elif prop_type == "rich_text":
        parts = prop.get("rich_text", [])
        return "".join(p.get("plain_text", "") for p in parts) if parts else ""

    elif prop_type == "number":
        return prop.get("number")

    elif prop_type == "select":
        sel = prop.get("select")
        return sel.get("name") if sel else None

    elif prop_type == "multi_select":
        return [s.get("name") for s in prop.get("multi_select", [])]

    elif prop_type == "status":
        status = prop.get("status")
        return status.get("name") if status else None

    elif prop_type == "date":
        date_obj = prop.get("date")
        if date_obj:
            return {"start": date_obj.get("start"), "end": date_obj.get("end")}
        return None

    elif prop_type == "checkbox":
        return prop.get("checkbox")

    elif prop_type == "url":
        return prop.get("url")

    elif prop_type == "email":
        return prop.get("email")

    elif prop_type == "phone_number":
        return prop.get("phone_number")

    elif prop_type == "relation":
        return [r.get("id") for r in prop.get("relation", [])]

    elif prop_type == "formula":
        formula = prop.get("formula", {})
        return formula.get(formula.get("type"))

    elif prop_type == "rollup":
        rollup = prop.get("rollup", {})
        return rollup.get(rollup.get("type"))

    return None


if __name__ == "__main__":
    try:
        client = get_client()
        result = client.search(query="", page_size=1)
        print(f"Notion client connected. Found {len(result.get('results', []))} result(s).")
    except Exception as e:
        print(f"Connection failed: {e}")
