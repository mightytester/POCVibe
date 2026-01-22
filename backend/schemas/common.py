"""Pydantic schemas for common/shared requests."""

from pydantic import BaseModel
from typing import Dict, Any, List


class BulkUpdateRequest(BaseModel):
    """Request model for bulk updating multiple videos."""
    common_fields: Dict[str, Any]  # Fields to apply to all videos
    videos: List[Dict[str, Any]]  # Individual video updates (id, episode, new_name, etc.)


class RenameFolderRequest(BaseModel):
    """Request model for renaming a folder."""
    old_name: str
    new_name: str


class BulkHashRenameRequest(BaseModel):
    """Request model for bulk hash-based renaming of files in a folder."""
    folder_name: str
