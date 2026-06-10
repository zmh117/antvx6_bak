"""Placeholder router for new Business Flow Context endpoints.

Routes are intentionally not registered in the application yet; this step only
creates the package boundary for the upcoming component/editor APIs.
"""

from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["business-flow"])
