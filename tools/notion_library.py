"""
Library operations for the Second Brain dashboard.
Queries books, movies, and recipes from their respective Notion databases.
Uses the data sources API via notion_client_wrapper.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from tools.notion_client_wrapper import (
    query_database, get_page_title, get_property_value,
)

# ── Books database properties ──
BOOK_NAME = "Name"         # title
BOOK_STATUS = "Status"     # status: Want to Read, Reading, On Hold, Read
BOOK_AUTHOR = "Author"     # rich_text
BOOK_RATING = "Rating"     # select
BOOK_GENRE = "Genres"      # relation

# ── Movies database properties ──
MOVIE_NAME = "Title"       # title
MOVIE_STATUS = "Status"    # status: Want to Watch, Started, Paused, Watched
MOVIE_DIRECTOR = "Director"  # rich_text
MOVIE_RATING = "Rating"    # select
MOVIE_GENRE = "Genres"     # relation

# ── Recipes database properties ──
RECIPE_NAME = "Name"           # title
RECIPE_URL = "URL"             # url
RECIPE_FAVORITE = "Favorite"   # checkbox
RECIPE_TAG = "Tags"            # relation
RECIPE_CHEF = "Chef Name"      # rich_text


def _serialize_book(page: dict) -> dict:
    """Convert a Notion page to a clean book dict."""
    return {
        "id": page["id"],
        "title": get_page_title(page),
        "status": get_property_value(page, BOOK_STATUS),
        "author": get_property_value(page, BOOK_AUTHOR),
        "rating": get_property_value(page, BOOK_RATING),
        "genre_ids": get_property_value(page, BOOK_GENRE) or [],
        "url": page.get("url"),
    }


def _serialize_movie(page: dict) -> dict:
    """Convert a Notion page to a clean movie dict."""
    return {
        "id": page["id"],
        "title": get_page_title(page),
        "status": get_property_value(page, MOVIE_STATUS),
        "director": get_property_value(page, MOVIE_DIRECTOR),
        "rating": get_property_value(page, MOVIE_RATING),
        "genre_ids": get_property_value(page, MOVIE_GENRE) or [],
        "url": page.get("url"),
    }


def _serialize_recipe(page: dict) -> dict:
    """Convert a Notion page to a clean recipe dict."""
    return {
        "id": page["id"],
        "title": get_page_title(page),
        "source_url": get_property_value(page, RECIPE_URL),
        "favorite": get_property_value(page, RECIPE_FAVORITE),
        "chef": get_property_value(page, RECIPE_CHEF),
        "tag_ids": get_property_value(page, RECIPE_TAG) or [],
        "url": page.get("url"),
    }


# ── Book functions ──

def get_currently_reading() -> list:
    """Get books with Status = Reading."""
    filter_obj = {
        "property": BOOK_STATUS,
        "status": {"equals": "Reading"},
    }
    pages = query_database("BOOKS", filter_obj=filter_obj)
    return [_serialize_book(p) for p in pages]


def get_book_list(status: str = None) -> list:
    """Get all books, optionally filtered by status."""
    filter_obj = None
    if status:
        filter_obj = {
            "property": BOOK_STATUS,
            "status": {"equals": status},
        }
    pages = query_database("BOOKS", filter_obj=filter_obj)
    return [_serialize_book(p) for p in pages]


# ── Movie functions ──

def get_movie_watchlist() -> list:
    """Get movies that haven't been watched yet (Status != Watched)."""
    filter_obj = {
        "property": MOVIE_STATUS,
        "status": {"does_not_equal": "Watched"},
    }
    pages = query_database("MOVIES", filter_obj=filter_obj)
    return [_serialize_movie(p) for p in pages]


def get_movie_list(status: str = None) -> list:
    """Get all movies, optionally filtered by status."""
    filter_obj = None
    if status:
        filter_obj = {
            "property": MOVIE_STATUS,
            "status": {"equals": status},
        }
    pages = query_database("MOVIES", filter_obj=filter_obj)
    return [_serialize_movie(p) for p in pages]


# ── Recipe functions ──

def get_recipes(limit: int = 50) -> list:
    """Get recipes sorted alphabetically."""
    pages = query_database("RECIPES", page_size=limit)
    return [_serialize_recipe(p) for p in pages[:limit]]


def get_favorite_recipes() -> list:
    """Get recipes marked as Favorite."""
    filter_obj = {
        "property": RECIPE_FAVORITE,
        "checkbox": {"equals": True},
    }
    pages = query_database("RECIPES", filter_obj=filter_obj)
    return [_serialize_recipe(p) for p in pages]


def run(input_data: dict = None) -> dict:
    """Entry point for WAT framework."""
    action = (input_data or {}).get("action", "get_currently_reading")

    try:
        if action == "get_currently_reading":
            return {"status": "success", "books": get_currently_reading()}
        elif action == "get_books":
            status = (input_data or {}).get("book_status")
            return {"status": "success", "books": get_book_list(status)}
        elif action == "get_watchlist":
            return {"status": "success", "movies": get_movie_watchlist()}
        elif action == "get_movies":
            status = (input_data or {}).get("movie_status")
            return {"status": "success", "movies": get_movie_list(status)}
        elif action == "get_recipes":
            limit = (input_data or {}).get("limit", 20)
            return {"status": "success", "recipes": get_recipes(limit)}
        elif action == "get_favorite_recipes":
            return {"status": "success", "recipes": get_favorite_recipes()}
        else:
            return {"status": "error", "message": f"Unknown action: {action}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


if __name__ == "__main__":
    print("Currently reading:")
    result = run({"action": "get_currently_reading"})
    for book in result.get("books", []):
        print(f"  {book['title']} by {book['author']}")

    print("\nMovie watchlist:")
    result = run({"action": "get_watchlist"})
    for movie in result.get("movies", []):
        print(f"  {movie['title']} ({movie['director']})")

    print("\nRecent recipes:")
    result = run({"action": "get_recipes", "limit": 5})
    for recipe in result.get("recipes", []):
        print(f"  {recipe['title']} (last made: {recipe['last_made']})")
