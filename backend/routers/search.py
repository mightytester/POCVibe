"""Search endpoint for videos."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from video_service import VideoService
from utils.serializers import serialize_video
from routers.roots import get_thumbnail_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
async def search_videos(
    q: str = "",
    tags: str = "",
    category: str = "",
    subcategory: str = "",
    duration_min: int = None,
    duration_max: int = None,
    db: AsyncSession = Depends(get_db)
):
    """Search videos by query, tags, category, subcategory, or duration range with faces."""
    service = VideoService(db, get_thumbnail_db())
    tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()] if tags else []

    videos = await service.search_videos(
        query=q,
        tags=tag_list,
        category=category,
        subcategory=subcategory,
        duration_min=duration_min,
        duration_max=duration_max
    )

    # Batch load faces for all videos
    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return [serialize_video(video, faces_map) for video in videos]
