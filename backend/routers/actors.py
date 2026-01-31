"""Actor management endpoints."""

import logging
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, Actor, Video
from schemas.actor import AddActorRequest, UpdateActorRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/actors", tags=["actors"])


@router.get("/search")
async def search_actors(
    q: str = "",
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Search actors by name (autocomplete)."""
    if q.strip():
        stmt = select(Actor).where(
            func.lower(Actor.name).contains(q.lower())
        ).order_by(Actor.name).limit(limit)
    else:
        # If no query, return most used actors
        stmt = select(Actor).order_by(
            desc(Actor.video_count), Actor.name
        ).limit(limit)

    result = await db.execute(stmt)
    actors = result.scalars().all()

    return [{
        "id": actor.id,
        "name": actor.name,
        "notes": actor.notes,
        "video_count": actor.video_count
    } for actor in actors]


@router.get("")
async def get_all_actors(
    limit: int = 100,
    offset: int = 0,
    sort_by: str = "name",
    db: AsyncSession = Depends(get_db)
):
    """Get all actors with their video counts."""
    if sort_by == "video_count":
        stmt = select(Actor).order_by(desc(Actor.video_count))
    elif sort_by == "created_at":
        stmt = select(Actor).order_by(desc(Actor.created_at))
    else:  # Default to name
        stmt = select(Actor).order_by(Actor.name)

    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    actors = result.scalars().all()

    return [{
        "id": actor.id,
        "name": actor.name,
        "notes": actor.notes,
        "video_count": actor.video_count,
        "created_at": actor.created_at
    } for actor in actors]


@router.post("")
async def create_actor(
    body: dict,
    db: AsyncSession = Depends(get_db)
):
    """Create a new actor."""
    actor_name = body.get('name', '').strip()

    if not actor_name:
        raise HTTPException(status_code=400, detail="Actor name is required")

    if len(actor_name) < 2:
        raise HTTPException(status_code=400, detail="Actor name must be at least 2 characters")

    if len(actor_name) > 100:
        raise HTTPException(status_code=400, detail="Actor name must be less than 100 characters")

    # Convert to title case for consistency
    actor_name = actor_name.title()

    # Check if actor already exists (case-insensitive)
    result = await db.execute(
        select(Actor).where(func.lower(Actor.name) == func.lower(actor_name))
    )
    existing_actor = result.scalar_one_or_none()

    if existing_actor:
        # Return existing actor
        return {
            "id": existing_actor.id,
            "name": existing_actor.name,
            "notes": existing_actor.notes,
            "video_count": existing_actor.video_count,
            "created_at": existing_actor.created_at
        }

    # Create new actor
    new_actor = Actor(
        name=actor_name,
        notes=body.get('notes', ''),
        video_count=0,
        created_at=time.time()
    )

    db.add(new_actor)
    await db.commit()
    await db.refresh(new_actor)

    return {
        "id": new_actor.id,
        "name": new_actor.name,
        "notes": new_actor.notes,
        "video_count": new_actor.video_count,
        "created_at": new_actor.created_at
    }


@router.post("/videos/{video_id}/actors")
async def add_actor_to_video(
    video_id: int,
    body: AddActorRequest,
    db: AsyncSession = Depends(get_db)
):
    """Add an actor to a video (creates actor if doesn't exist)."""
    # Validate and normalize actor name (proper casing)
    actor_name = body.actor_name.strip()
    if len(actor_name) < 2:
        raise HTTPException(status_code=400, detail="Actor name must be at least 2 characters")
    if len(actor_name) > 100:
        raise HTTPException(status_code=400, detail="Actor name must be less than 100 characters")

    # Convert to title case for consistency
    actor_name = actor_name.title()

    # Get video with actors
    result = await db.execute(
        select(Video).options(selectinload(Video.actors)).where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check if actor already exists (case-insensitive)
    actor_result = await db.execute(
        select(Actor).where(func.lower(Actor.name) == actor_name.lower())
    )
    actor = actor_result.scalar_one_or_none()

    # Create actor if doesn't exist
    if not actor:
        actor = Actor(
            name=actor_name,
            video_count=0,
            created_at=time.time()
        )
        db.add(actor)
        await db.flush()  # Get the actor ID

    # Check if already assigned
    if actor in video.actors:
        raise HTTPException(status_code=400, detail="Actor already assigned to this video")

    # Add actor to video
    video.actors.append(actor)

    # Update actor video count
    actor.video_count += 1

    await db.commit()
    await db.refresh(actor)

    return {
        "message": "Actor added successfully",
        "actor": {
            "id": actor.id,
            "name": actor.name
        }
    }


@router.delete("/videos/{video_id}/actors/{actor_id}")
async def remove_actor_from_video(
    video_id: int,
    actor_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Remove an actor from a video."""
    # Get video with actors
    result = await db.execute(
        select(Video).options(selectinload(Video.actors)).where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Get actor
    actor_result = await db.execute(select(Actor).where(Actor.id == actor_id))
    actor = actor_result.scalar_one_or_none()

    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    # Remove actor from video
    if actor in video.actors:
        video.actors.remove(actor)
        actor.video_count -= 1
        await db.commit()

        return {
            "message": "Actor removed successfully",
            "video_id": video_id,
            "actor_id": actor_id
        }
    else:
        raise HTTPException(status_code=404, detail="Actor not assigned to this video")


@router.delete("/{actor_id}")
async def delete_actor(actor_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an actor (only if not assigned to any videos)."""
    actor_result = await db.execute(select(Actor).where(Actor.id == actor_id))
    actor = actor_result.scalar_one_or_none()

    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    if actor.video_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete actor: assigned to {actor.video_count} video(s)"
        )

    await db.delete(actor)
    await db.commit()

    return {"message": "Actor deleted successfully", "actor_id": actor_id}


@router.put("/{actor_id}")
async def update_actor(
    actor_id: int,
    body: UpdateActorRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update actor details (name, notes)."""
    actor_result = await db.execute(select(Actor).where(Actor.id == actor_id))
    actor = actor_result.scalar_one_or_none()

    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    # Update name if provided
    if body.name:
        new_name = body.name.strip().title()

        # Check for duplicate name (case-insensitive, excluding current actor)
        duplicate_check = await db.execute(
            select(Actor).where(
                func.lower(Actor.name) == new_name.lower(),
                Actor.id != actor_id
            )
        )
        if duplicate_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Actor with this name already exists")

        actor.name = new_name

    # Update notes if provided
    if body.notes is not None:
        actor.notes = body.notes

    await db.commit()
    await db.refresh(actor)

    return {
        "message": "Actor updated successfully",
        "actor": {
            "id": actor.id,
            "name": actor.name,
            "notes": actor.notes,
            "video_count": actor.video_count
        }
    }
