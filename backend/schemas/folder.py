"""Pydantic schemas for folder group operations."""

from pydantic import BaseModel, Field
from typing import List, Optional


class FolderGroupCreate(BaseModel):
    """Schema for creating a new folder group."""
    name: str = Field(..., min_length=1, max_length=100, description="Group name")
    icon: str = Field(default="📁", max_length=10, description="Emoji or icon for display")
    color: str = Field(default="#f3f4f6", pattern=r'^#[0-9A-Fa-f]{6}$', description="Hex color for group header")
    folders: List[str] = Field(default_factory=list, description="List of folder names in this group")


class FolderGroupUpdate(BaseModel):
    """Schema for updating an existing folder group."""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Group name")
    icon: Optional[str] = Field(None, max_length=10, description="Emoji or icon for display")
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$', description="Hex color for group header")
    folders: Optional[List[str]] = Field(None, description="List of folder names in this group")


class FolderGroupReorder(BaseModel):
    """Schema for reordering a folder group."""
    direction: str = Field(..., pattern=r'^(up|down)$', description="Direction to move: 'up' or 'down'")


class FolderGroupResponse(BaseModel):
    """Schema for folder group API responses."""
    id: str
    name: str
    icon: str
    color: str
    is_system: int
    folders: List[str]
    position: int
    is_expanded: bool = True
    created_at: float
    updated_at: float

    class Config:
        from_attributes = True
