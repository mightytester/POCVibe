"""Pydantic schemas for face recognition requests."""

from pydantic import BaseModel
from typing import List


class CompareFacesRequest(BaseModel):
    """Request model for comparing multiple faces."""
    face_ids: List[int]


class LinkFaceToVideoRequest(BaseModel):
    """Request model for linking a face to a video."""
    detection_method: str = "manual_search"


class MergeFacesRequest(BaseModel):
    """Request model for merging multiple face identities."""
    face_ids: List[int]
    target_name: str | None = None
    target_actor_id: int | None = None
