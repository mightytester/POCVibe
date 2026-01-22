"""Pydantic schemas for video-related requests."""

from pydantic import BaseModel
from typing import Optional


class MoveVideoRequest(BaseModel):
    """Request model for moving a video to a new category/subcategory."""
    target_category: str
    target_subcategory: str | None = None
    new_name: str | None = None


class RenameVideoRequest(BaseModel):
    """Request model for renaming a video file."""
    new_name: str


class UpdateVideoRequest(BaseModel):
    """Request model for updating video metadata."""
    display_name: str | None = None
    description: str | None = None
    new_name: str | None = None  # Optional: if provided, rename the actual file
    series: str | None = None
    season: int | None = None
    episode: str | None = None
    year: int | None = None
    channel: str | None = None
    rating: float | None = None  # 0-5 stars
    favorite: bool | None = None
