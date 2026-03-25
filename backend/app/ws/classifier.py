"""Pure GSD stream event classifier. Returns classification metadata for the WS message
envelope — never mutates parsed_data.
"""
from typing import Literal, Optional

GsdClassification = Optional[Literal["AskUserQuestion", "freeform_wait", "completed"]]


def classify_stream_event(parsed_data: dict) -> GsdClassification:
    """Classify a parsed GSD NDJSON stream event for the WS message envelope.

    Returns a GsdClassification string or None. Never mutates parsed_data.

    Classification order:
    1. AskUserQuestion tool_use — STRM-01
    2. result events — STRM-03
    3. freeform_wait — STRM-02 (STUBBED — unconfirmed event shape)
    4. Default: None
    """
    event_type = parsed_data.get("type")

    # STRM-01: AskUserQuestion tool_use — classify by name field only (never inspect input).
    if event_type == "tool_use" and parsed_data.get("name") == "AskUserQuestion":
        return "AskUserQuestion"

    # STRM-03: Completion — any result event signals the run is done.
    if event_type == "result":
        return "completed"

    # STRM-02: Freeform wait — STUBBED.
    # TODO: The exact system event subtype for freeform text-input blocking is UNCONFIRMED
    # (MEDIUM confidence only). Capture raw NDJSON from a real `gsd discuss-phase` run
    # before enabling this branch. See STATE.md Research Flags.
    if False:  # noqa: SIM210
        if event_type == "system" and parsed_data.get("subtype") == "input_required":
            return "freeform_wait"

    return None
