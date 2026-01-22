"""Pydantic schemas for actor-related requests."""

from pydantic import BaseModel


class AddActorRequest(BaseModel):
    """Request model for adding an actor to a video."""
    actor_name: str


class UpdateActorRequest(BaseModel):
    """Request model for updating actor information."""
    name: str | None = None
    notes: str | None = None
