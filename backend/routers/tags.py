"""Tag management endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, Tag, Video
from video_service import VideoService
from routers.roots import get_thumbnail_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tags", tags=["tags"])


@router.post("/videos/{video_id}/tags")
async def add_tag_to_video(
    video_id: int,
    tag_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Add a tag to a video."""
    service = VideoService(db, get_thumbnail_db())
    tag = await service.add_tag_to_video(video_id, tag_name)
    return {
        "message": f"Tag '{tag.name}' added to video",
        "tag": {"id": tag.id, "name": tag.name, "color": tag.color}
    }


@router.delete("/videos/{video_id}/tags/{tag_id}")
async def remove_tag_from_video(
    video_id: int,
    tag_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Remove a tag from a video."""
    service = VideoService(db, get_thumbnail_db())
    await service.remove_tag_from_video(video_id, tag_id)
    return {"message": "Tag removed from video"}


@router.get("")
async def get_all_tags(db: AsyncSession = Depends(get_db)):
    """Get all available tags."""
    service = VideoService(db, get_thumbnail_db())
    tags = await service.get_all_tags()
    return [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in tags]


# NOTE: /unused routes must come BEFORE /{tag_id} to avoid route conflicts
@router.get("/unused")
async def get_unused_tags(db: AsyncSession = Depends(get_db)):
    """Get all tags that are not assigned to any videos."""
    service = VideoService(db, get_thumbnail_db())
    unused_tags = await service.get_unused_tags()
    return [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in unused_tags]


@router.delete("/unused")
async def delete_unused_tags(db: AsyncSession = Depends(get_db)):
    """Delete all tags that are not assigned to any videos."""
    service = VideoService(db, get_thumbnail_db())
    count = await service.delete_unused_tags()
    return {"message": f"Deleted {count} unused tag(s)", "deleted_count": count}


@router.delete("/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a tag completely (removes from all videos)."""
    service = VideoService(db, get_thumbnail_db())
    deleted = await service.delete_tag(tag_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Tag not found")

    return {"message": "Tag deleted successfully", "tag_id": tag_id}


@router.put("/{tag_id}")
async def rename_tag(tag_id: int, new_name: str, db: AsyncSession = Depends(get_db)):
    """Rename a tag (affects all videos with this tag)."""
    service = VideoService(db, get_thumbnail_db())

    try:
        updated_tag = await service.rename_tag(tag_id, new_name)
        return {
            "message": "Tag renamed successfully",
            "tag": {
                "id": updated_tag.id,
                "name": updated_tag.name,
                "color": updated_tag.color
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/regenerate-colors")
async def regenerate_tag_colors(db: AsyncSession = Depends(get_db)):
    """Regenerate colors for all existing tags based on their names."""
    from color_utils import generate_vibrant_color

    try:
        result = await db.execute(select(Tag))
        tags = result.scalars().all()

        updated_count = 0
        for tag in tags:
            new_color = generate_vibrant_color(tag.name)
            tag.color = new_color
            updated_count += 1

        await db.commit()

        return {
            "message": f"Regenerated colors for {updated_count} tag(s)",
            "updated_count": updated_count
        }

    except Exception as e:
        await db.rollback()
        logger.error(f"Error regenerating tag colors: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerate colors: {str(e)}")
