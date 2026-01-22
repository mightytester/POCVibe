"""Thumbnail generation and management endpoints."""

import logging
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, Video
from routers.roots import get_thumbnail_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["thumbnails"])


@router.get("/api/thumbnails/{video_id}")
async def get_thumbnail(video_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Get thumbnail for a video from database with aggressive browser caching."""
    thumbnail_db = get_thumbnail_db()

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    thumbnail_data = await thumbnail_db.get_thumbnail_data(video.path)
    if not thumbnail_data:
        success = await thumbnail_db.generate_and_store_thumbnail(video.path)
        if success:
            thumbnail_data = await thumbnail_db.get_thumbnail_data(video.path)
            video.thumbnail_generated = 1
            await db.commit()
        else:
            video.thumbnail_generated = -1
            await db.commit()
            raise HTTPException(status_code=404, detail="Thumbnail not available")

    etag = f'"{video_id}-{int(video.modified)}"'

    if_none_match = request.headers.get("if-none-match")
    if if_none_match == etag:
        return Response(status_code=304, headers={"ETag": etag})

    headers = {
        "Cache-Control": "public, max-age=3600",
        "ETag": etag,
        "Last-Modified": str(video.modified),
    }

    return Response(content=thumbnail_data, media_type="image/jpeg", headers=headers)


@router.post("/api/thumbnails/generate/{video_id}")
async def generate_thumbnail(video_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Generate thumbnail for a specific video."""
    thumbnail_db = get_thumbnail_db()

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    timestamp = "00:00:01"
    try:
        body = await request.json()
        if "time" in body and isinstance(body["time"], (int, float)):
            seconds = int(body["time"])
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            secs = seconds % 60
            timestamp = f"{hours:02d}:{minutes:02d}:{secs:02d}"
    except:
        pass

    force_regenerate = timestamp != "00:00:01"
    success = await thumbnail_db.generate_and_store_thumbnail(video.path, timestamp, force_regenerate)

    if success:
        video.thumbnail_generated = 1
        await db.commit()
        return {"message": "Thumbnail generated successfully", "video_id": video_id, "timestamp": timestamp}
    else:
        video.thumbnail_generated = -1
        await db.commit()
        return {"message": "Failed to generate thumbnail", "video_id": video_id, "error": True}


@router.post("/api/thumbnails/preview/{video_id}")
async def generate_thumbnail_preview(video_id: int, time: int, db: AsyncSession = Depends(get_db)):
    """Generate temporary thumbnail preview at specified time."""
    thumbnail_db = get_thumbnail_db()

    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if not thumbnail_db.ffmpeg_available:
        raise HTTPException(status_code=503, detail="FFmpeg not available")

    hours = time // 3600
    minutes = (time % 3600) // 60
    secs = time % 60
    timestamp = f"{hours:02d}:{minutes:02d}:{secs:02d}"

    try:
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            temp_path = temp_file.name

        cmd = [
            'ffmpeg',
            '-ss', timestamp,
            '-i', str(video.path),
            '-vframes', '1',
            '-vf', 'scale=320:-1',
            '-q:v', '2',
            '-f', 'mjpeg',
            '-threads', '1',
            '-loglevel', 'error',
            '-y',
            temp_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=8
        )

        if result.returncode == 0 and Path(temp_path).exists():
            with open(temp_path, 'rb') as f:
                image_data = f.read()

            Path(temp_path).unlink()

            headers = {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
            return Response(content=image_data, media_type="image/jpeg", headers=headers)
        else:
            if Path(temp_path).exists():
                Path(temp_path).unlink()
            raise HTTPException(status_code=500, detail="Failed to generate preview")

    except Exception as e:
        if 'temp_path' in locals() and Path(temp_path).exists():
            Path(temp_path).unlink()
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}")


@router.post("/thumbnails/cleanup")
async def cleanup_thumbnails(db: AsyncSession = Depends(get_db)):
    """Clean up orphaned thumbnails from database."""
    thumbnail_db = get_thumbnail_db()

    result = await db.execute(select(Video.path))
    valid_paths = set(result.scalars().all())

    removed_db = await thumbnail_db.cleanup_orphaned_thumbnails(valid_paths)

    return {
        "message": f"Cleaned up {removed_db} database thumbnails",
        "removed_database": removed_db,
        "total_removed": removed_db
    }


@router.get("/thumbnails/stats")
async def get_thumbnail_stats():
    """Get statistics about thumbnail database."""
    thumbnail_db = get_thumbnail_db()

    if not thumbnail_db:
        return {
            "thumbnail_count": 0,
            "cache_size_mb": 0,
            "ffmpeg_available": False,
            "error": "Thumbnail database not initialized"
        }

    count, size_mb = await thumbnail_db.get_cache_stats()
    return {
        "thumbnail_count": count,
        "cache_size_mb": size_mb,
        "ffmpeg_available": thumbnail_db.ffmpeg_available
    }
