# backend/routers/gemini/idealist_to_geo.py
import logging
import traceback
import os
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, HTTPException, Query

from pydantic import BaseModel

# import the volunteering search function (same-process call)
from routers.volunteering.router import search_volunteer_links

# import the gemini wrapper (call_gemini)
import importlib
import json
import time

# import the helper that attaches links to parsed locations
from utils.add_links import add_links_to_locations

router = APIRouter()
logger = logging.getLogger(__name__)


def import_call_gemini_module():
    try:
        module = importlib.import_module("gemini.call_gemini")
        return module
    except SystemExit:
        logger.exception("gemini.call_gemini attempted to exit (likely missing GEMINI_API_KEY)")
        raise
    except Exception:
        logger.exception("Failed to import gemini.call_gemini")
        logger.debug(traceback.format_exc())
        raise


def import_parser_module():
    """
    Import the parse_gemini_latlon_list module. Returns the parse function or raises.
    """
    try:
        parser_mod = importlib.import_module("gemini.parse_gemini_latlon_list")
        parse_fn = getattr(parser_mod, "parse_gemini_latlon_list", None)
        if not callable(parse_fn):
            raise ImportError("parse_gemini_latlon_list not found or not callable in gemini.parse_gemini_latlon_list")
        return parse_fn
    except Exception:
        logger.exception("Failed to import gemini.parse_gemini_latlon_list")
        logger.debug(traceback.format_exc())
        raise


@router.get("/convert_idealist", response_model=List[Dict[str, Any]])
def convert_idealist_to_geo(
    country: str = Query(..., min_length=1, description="Country or location to search, e.g. 'Japan'"),
    limit: Optional[int] = Query(None, ge=1, le=200, description="Optional max number of links to return"),
    model: Optional[str] = Query(None, description="Optional Gemini model override (e.g. gemini-2.5-flash)"),
) -> List[Dict[str, Any]]:
    """
    Run the volunteering search for `country`, call Gemini to get coordinates, parse Gemini's output,
    attach the original link and extracted NAME to each parsed location, and return ONLY the resulting
    list of location dicts (each dict contains "latlon", "country", "link", "name").

    This version does NOT expect or require a 'city' field from Gemini.
    """

    # 1) Run volunteer search
    try:
        search_result = search_volunteer_links(country=country, limit=limit)
        search_dict = search_result.dict()
    except HTTPException as he:
        raise he
    except Exception:
        logger.exception("Error while running volunteering search")
        return []

    links_list = search_dict.get("links") or search_dict.get("idealist_json", {}).get("links") or []
    links_json = json.dumps(links_list, ensure_ascii=False)

    # System prompt asking only for latlon and country
    system_prompt = (
        "You are given a JSON array of URLs (links) pointing to volunteer opportunity pages.\n"
        "For each URL produce a JSON object with EXACTLY these two keys:\n"
        "  - \"latlon\": an array [lat, lon] where lat and lon are parseable floats (latitude first),\n"
        "  - \"country\": the country for that lat/lon, as a lower-case English name (for example: 'japan').\n\n"
        "IMPORTANT:\n"
        " - Output MUST be a single valid JSON array and NOTHING else (no markdown or commentary).\n"
        " - Ensure lat and lon are parseable floats and in the order [latitude, longitude].\n"
        " - Make sure that country is a full English name in lower case (no abbreviations).\n"
        " - Return entries in the same order as the input links array. Omit any link if you cannot find coordinates.\n\n"
        "EXAMPLE OUTPUT FORMAT:\n"
        "[\n"
        "  {\"latlon\": [35.6897, 139.6922], \"country\": \"japan\"},\n"
        "  {\"latlon\": [-1.2833, 36.8167], \"country\": \"kenya\"}\n"
        "]\n\n"
        "Input links array:\n"
        f"{links_json}\n\n"
        "Reply now with ONLY the JSON array (no other text)."
    )

    # Retry strategy (simple): try up to MAX_RETRIES to get a parsable response
    MAX_RETRIES = int(os.environ.get("GEMINI_MAX_RETRIES", "3"))
    STRONG_MODEL = os.environ.get("GEMINI_STRONG_MODEL", None)
    FAST_MODEL = os.environ.get("GEMINI_FAST_MODEL", None)

    try:
        cg = import_call_gemini_module()
    except Exception:
        logger.exception("Failed to import call_gemini module")
        return []

    generate_fn = getattr(cg, "generate_response", None)
    if not callable(generate_fn):
        logger.error("generate_response not found in gemini.call_gemini")
        return []

    parse_fn = import_parser_module()

    attempt = 0
    last_response_text = None
    parsed_locations: Optional[List[Dict[str, Any]]] = None

    while attempt < MAX_RETRIES:
        attempt += 1
        # Choose model: explicit query param -> env FAST/STRONG -> default
        if attempt == 1:
            model_to_use = model or FAST_MODEL
        else:
            model_to_use = model or STRONG_MODEL or FAST_MODEL

        try:
            prompt_text = ""
            if model_to_use:
                gemini_text = generate_fn(system_prompt=system_prompt, prompt=prompt_text, model=model_to_use)
            else:
                gemini_text = generate_fn(system_prompt=system_prompt, prompt=prompt_text)
            gemini_text_str = gemini_text if isinstance(gemini_text, str) else str(gemini_text)
            last_response_text = gemini_text_str
        except Exception:
            logger.exception("Error while calling Gemini on attempt %d", attempt)
            if attempt < MAX_RETRIES:
                time.sleep(0.8 * attempt)
                continue
            else:
                raise HTTPException(status_code=502, detail="Upstream Gemini call failed repeatedly.")

        # Parse Gemini output
        try:
            parsed_locations = parse_fn(gemini_text_str)
            if parsed_locations is None:
                parsed_locations = []
        except Exception:
            logger.exception("Error while parsing Gemini output on attempt %d", attempt)
            parsed_locations = []

        # If we got at least one parsed entry, accept it (no 'city' requirement)
        if parsed_locations:
            break

        # otherwise retry
        logger.warning("Attempt %d: parsed_locations empty; retrying...", attempt)
        if attempt < MAX_RETRIES:
            time.sleep(0.6 * attempt)

    if parsed_locations is None:
        raise HTTPException(status_code=502, detail="Failed to obtain parsable response from Gemini.")

    # Attach links and extracted names
    try:
        final_locations = add_links_to_locations(parsed_locations, links_list)
    except Exception:
        logger.exception("Failed to attach links to parsed locations")
        final_locations = parsed_locations or []

    return final_locations
