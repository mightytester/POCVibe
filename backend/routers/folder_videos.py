"""Endpoints for browsing videos by folder/category - unprefixed routes."""

import logging
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from video_service import VideoService
from utils.serializers import serialize_video
from routers.roots import get_thumbnail_db

logger = logging.getLogger(__name__)

# No prefix - these are accessed directly as /videos/{category}
router = APIRouter(tags=["folder_videos"])


@router.get("/videos/{category}")
async def get_videos_by_category(
    category: str,
    media_type: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Get all videos in a specific category with faces."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)
    videos = await service.get_videos_by_category(category, media_type=media_type)

    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return {
        "videos": [serialize_video(video, faces_map) for video in videos],
        "count": len(videos)
    }


@router.get("/videos/{category}/{subcategory}")
async def get_videos_by_subcategory(
    category: str,
    subcategory: str,
    media_type: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Get videos in a specific category and subcategory with faces."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)
    videos = await service.get_videos_by_subcategory(category, subcategory, media_type=media_type)

    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return {
        "videos": [serialize_video(video, faces_map) for video in videos],
        "count": len(videos)
    }
