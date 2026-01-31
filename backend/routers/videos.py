"""Video management endpoints."""

import hashlib
import logging
import os
import time
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import config
from database import get_db, Video
from file_scanner import scanner
from video_service import VideoService
from schemas.video import MoveVideoRequest, RenameVideoRequest, UpdateVideoRequest
from schemas.common import BulkUpdateRequest
from utils.serializers import serialize_video
from routers.roots import get_thumbnail_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/videos", tags=["videos"])


def get_media_type_header(file_path: Path) -> str:
    """Get correct Content-Type header for file."""
    extension = file_path.suffix.lower()
    media_types = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.wmv': 'video/x-ms-wmv',
        '.flv': 'video/x-flv',
        '.webm': 'video/webm',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
    }
    return media_types.get(extension, 'application/octet-stream')


@router.get("")
async def get_videos(category: str = None, media_type: str = None, db: AsyncSession = Depends(get_db)):
    """Get all videos, optionally filtered by category."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)

    if not category or category == "_all":
        videos = await service.get_all_videos(media_type=media_type)
    else:
        videos = await service.get_videos_by_category(category, media_type=media_type)

    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return {
        "videos": [serialize_video(video, faces_map) for video in videos],
        "count": len(videos)
    }


@router.get("/{category}")
async def get_videos_by_category(category: str, media_type: str = None, db: AsyncSession = Depends(get_db)):
    """Get all videos in a specific category (path parameter version)."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)

    if category == "_all":
        videos = await service.get_all_videos(media_type=media_type)
    else:
        videos = await service.get_videos_by_category(category, media_type=media_type)

    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return {
        "videos": [serialize_video(video, faces_map) for video in videos],
        "count": len(videos)
    }


@router.get("/api/videos/page")
async def get_videos_paginated(
    page: int = 0,
    size: int = 50,
    media_type: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Get paginated videos for collection view."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)

    all_videos = await service.get_all_videos(media_type=media_type)
    total = len(all_videos)

    offset = page * size
    paginated_videos = all_videos[offset:offset + size]
    total_pages = (total + size - 1) // size

    video_ids = [video.id for video in paginated_videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return {
        "videos": [serialize_video(video, faces_map) for video in paginated_videos],
        "total": total,
        "page": page,
        "size": size,
        "total_pages": total_pages
    }


@router.get("/api/videos/{video_id}")
async def get_video_by_id(video_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single video by ID with all metadata (tags, actors, faces)."""
    thumbnail_db = get_thumbnail_db()

    try:
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        await db.refresh(video, ["tags", "actors"])

        service = VideoService(db, thumbnail_db)
        faces_map = await service.get_faces_for_videos([video_id])

        return serialize_video(video, faces_map)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching video: {str(e)}")


@router.put("/api/videos/{video_id}")
async def update_video_metadata(video_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    """Update video metadata fields (description, scene_description, etc.)."""
    thumbnail_db = get_thumbnail_db()

    try:
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        allowed_fields = ['description', 'scene_description', 'series', 'season', 'episode',
                         'year', 'channel', 'rating', 'favorite', 'is_final']
        for field, value in body.items():
            if field in allowed_fields and hasattr(video, field):
                if field in ('favorite', 'is_final'):
                    setattr(video, field, 1 if value else 0)
                else:
                    setattr(video, field, value)

        await db.commit()
        await db.refresh(video, ["tags", "actors"])

        service = VideoService(db, thumbnail_db)
        faces_map = await service.get_faces_for_videos([video_id])

        return {
            "message": "Video updated successfully",
            "video": serialize_video(video, faces_map)
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating video: {str(e)}")


@router.post("/api/videos/{video_id}/hash-rename")
async def hash_rename_video(video_id: int, db: AsyncSession = Depends(get_db)):
    """Rename a single video using SHA1 hash-based naming and set display_name to the hash."""
    thumbnail_db = get_thumbnail_db()

    try:
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        video_path = Path(video.path)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")

        sha1_hash = hashlib.sha1()
        with open(video_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha1_hash.update(chunk)

        hash_str = sha1_hash.hexdigest()

        part1 = hash_str[0:4]
        part2 = hash_str[4:8]
        part3 = hash_str[2] + hash_str[4] + hash_str[6] + hash_str[10]
        part4 = hash_str[10] + hash_str[6] + hash_str[4] + hash_str[2]

        new_name_base = part1 + part2 + part3 + part4
        ext = video_path.suffix
        new_name = f"{new_name_base}{ext}"

        new_path = video_path.parent / new_name
        if new_path.exists() and new_path != video_path:
            raise HTTPException(status_code=409, detail=f"Target name already exists: {new_name}")

        if video_path == new_path:
            await db.refresh(video, ["tags", "actors"])
            service = VideoService(db, thumbnail_db)
            faces_map = await service.get_faces_for_videos([video_id])
            return {
                "message": "Video already has this hash name",
                "new_name": new_name,
                "video": serialize_video(video, faces_map)
            }

        video_path.rename(new_path)

        await thumbnail_db.update_path_hash(str(video_path), str(new_path))

        video.path = str(new_path)
        video.name = new_name
        video.display_name = new_name_base
        video.extension = ext.lower()
        video.thumbnail_url = f"/api/thumbnails/{video.id}"

        await db.commit()
        await db.refresh(video, ["tags", "actors"])

        service = VideoService(db, thumbnail_db)
        faces_map = await service.get_faces_for_videos([video_id])

        return {
            "message": "Video renamed successfully",
            "new_name": new_name,
            "hash": new_name_base,
            "video": serialize_video(video, faces_map)
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error hash-renaming video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Hash rename failed: {str(e)}")


@router.post("/{video_id}/move")
async def move_video(
    video_id: int,
    body: MoveVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Move a video to another category/subcategory (filesystem + DB update)."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)

    try:
        moved = await service.move_video(
            video_id=video_id,
            target_category=body.target_category,
            root_directory=config.root_directory,
            target_subcategory=body.target_subcategory,
            new_name=body.new_name
        )
    except FileExistsError:
        raise HTTPException(status_code=409, detail="Destination already exists")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))

    if not moved:
        raise HTTPException(status_code=404, detail="Video not found or source file missing")

    return {
        "message": "Video moved",
        "video": {
            "id": moved.id,
            "path": moved.path,
            "name": moved.name,
            "category": moved.category,
            "subcategory": moved.subcategory,
            "relative_path": moved.relative_path,
            "size": moved.size,
            "modified": moved.modified,
            "extension": moved.extension,
            "thumbnail_url": moved.thumbnail_url,
            "thumbnail_generated": moved.thumbnail_generated,
            "tags": [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in moved.tags],
            "actors": [{"id": actor.id, "name": actor.name} for actor in moved.actors]
        }
    }


@router.post("/{video_id}/rename")
async def rename_video(
    video_id: int,
    body: RenameVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Rename a video file (filesystem + DB update)."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)

    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        moved = await service.move_video(
            video_id=video_id,
            target_category=video.category,
            root_directory=config.root_directory,
            target_subcategory=video.subcategory,
            new_name=body.new_name
        )
    except FileExistsError:
        raise HTTPException(status_code=409, detail="A file with this name already exists")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))

    if not moved:
        raise HTTPException(status_code=404, detail="Video not found or source file missing")

    return {
        "message": "Video renamed successfully",
        "video": {
            "id": moved.id,
            "path": moved.path,
            "name": moved.name,
            "category": moved.category,
            "subcategory": moved.subcategory,
            "relative_path": moved.relative_path,
            "size": moved.size,
            "modified": moved.modified,
            "extension": moved.extension,
            "thumbnail_url": moved.thumbnail_url,
            "thumbnail_generated": moved.thumbnail_generated,
            "tags": [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in moved.tags],
            "actors": [{"id": actor.id, "name": actor.name} for actor in moved.actors]
        }
    }


@router.post("/videos/{video_id}/update")
async def update_video(
    video_id: int,
    body: UpdateVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update video metadata (display_name, description) and optionally rename file."""
    thumbnail_db = get_thumbnail_db()

    try:
        service = VideoService(db, thumbnail_db)

        result = await db.execute(
            select(Video)
            .options(selectinload(Video.tags), selectinload(Video.actors))
            .where(Video.id == video_id)
        )
        video = result.scalar_one_or_none()

        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        if body.new_name:
            try:
                video = await service.move_video(
                    video_id=video_id,
                    target_category=video.category,
                    root_directory=config.root_directory,
                    target_subcategory=video.subcategory,
                    new_name=body.new_name
                )
            except FileExistsError:
                raise HTTPException(status_code=409, detail="A file with this name already exists")
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
            except RuntimeError as re:
                raise HTTPException(status_code=500, detail=str(re))

            if not video:
                raise HTTPException(status_code=404, detail="Video not found or source file missing")

            result = await db.execute(
                select(Video)
                .options(selectinload(Video.tags), selectinload(Video.actors))
                .where(Video.id == video_id)
            )
            video = result.scalar_one_or_none()

        if body.display_name is not None:
            video.display_name = body.display_name
        if body.description is not None:
            video.description = body.description
        if body.series is not None:
            video.series = body.series
        if body.season is not None:
            video.season = body.season
        if body.episode is not None:
            video.episode = body.episode
        if body.year is not None:
            video.year = body.year
        if body.channel is not None:
            video.channel = body.channel
        if body.rating is not None:
            video.rating = body.rating
        if body.favorite is not None:
            video.favorite = 1 if body.favorite else 0

        await db.commit()
        await db.refresh(video)

        return {
            "message": "Video updated successfully",
            "video": serialize_video(video)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating video {video_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update video: {str(e)}")


@router.post("/videos/{video_id}/toggle-final")
async def toggle_final_status(video_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle the final/preferred status of a video (for deduplication workflow)."""
    try:
        result = await db.execute(
            select(Video)
            .options(selectinload(Video.tags), selectinload(Video.actors))
            .where(Video.id == video_id)
        )
        video = result.scalar_one_or_none()

        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        video.is_final = 0 if video.is_final else 1

        await db.commit()
        await db.refresh(video)

        return {
            "success": True,
            "is_final": bool(video.is_final),
            "message": f"Video marked as {'final' if video.is_final else 'not final'}",
            "video": serialize_video(video)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling final status for video {video_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to toggle final status: {str(e)}")


@router.post("/api/videos/parse-metadata")
async def parse_metadata_batch(
    category: str | None = None,
    subcategory: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """Parse metadata from filenames for videos in a specific folder."""
    from metadata_parser import parse_metadata_from_filename, should_update_field

    try:
        query = select(Video)

        if category:
            query = query.where(Video.category == category)
        if subcategory:
            query = query.where(Video.subcategory == subcategory)

        result = await db.execute(query)
        videos = result.scalars().all()

        updated_count = 0
        skipped_count = 0

        for video in videos:
            parsed = parse_metadata_from_filename(video.name)
            has_updates = False

            if should_update_field(video.series, parsed.get('series')):
                video.series = parsed.get('series')
                has_updates = True
            if should_update_field(video.season, parsed.get('season')):
                video.season = parsed.get('season')
                has_updates = True
            if should_update_field(video.episode, parsed.get('episode')):
                video.episode = parsed.get('episode')
                has_updates = True
            if should_update_field(video.year, parsed.get('year')):
                video.year = parsed.get('year')
                has_updates = True
            if should_update_field(video.channel, parsed.get('channel')):
                video.channel = parsed.get('channel')
                has_updates = True

            if has_updates:
                updated_count += 1
            else:
                skipped_count += 1

        await db.commit()

        return {
            "message": "Metadata parsing complete",
            "total_videos": len(videos),
            "updated": updated_count,
            "skipped": skipped_count,
            "category": category,
            "subcategory": subcategory
        }

    except Exception as e:
        logger.error(f"Error parsing metadata: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to parse metadata: {str(e)}")


@router.post("/api/videos/bulk-update")
async def bulk_update_videos(
    body: BulkUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """Bulk update multiple videos with common fields and individual overrides."""
    thumbnail_db = get_thumbnail_db()

    try:
        service = VideoService(db, thumbnail_db)
        updated_videos = []
        failed_videos = []

        for video_update in body.videos:
            video_id = video_update.get('id')
            if not video_id:
                continue

            try:
                result = await db.execute(
                    select(Video).options(
                        selectinload(Video.tags),
                        selectinload(Video.actors)
                    ).where(Video.id == video_id)
                )
                video = result.scalar_one_or_none()

                if not video:
                    failed_videos.append({"id": video_id, "error": "Video not found"})
                    continue

                new_name = video_update.get('new_name')
                if new_name:
                    try:
                        video = await service.move_video(
                            video_id=video_id,
                            target_category=video.category,
                            root_directory=config.root_directory,
                            target_subcategory=video.subcategory,
                            new_name=new_name
                        )
                        result = await db.execute(
                            select(Video).options(
                                selectinload(Video.tags),
                                selectinload(Video.actors)
                            ).where(Video.id == video_id)
                        )
                        video = result.scalar_one_or_none()
                    except (FileExistsError, ValueError, RuntimeError) as e:
                        failed_videos.append({"id": video_id, "error": str(e)})
                        continue

                for field, value in body.common_fields.items():
                    if value is not None and hasattr(video, field):
                        if field == 'favorite':
                            setattr(video, field, 1 if value else 0)
                        else:
                            setattr(video, field, value)

                for field, value in video_update.items():
                    if field not in ['id', 'new_name'] and value is not None and hasattr(video, field):
                        if field == 'favorite':
                            setattr(video, field, 1 if value else 0)
                        else:
                            setattr(video, field, value)

                await db.commit()
                await db.refresh(video)
                updated_videos.append(video)

            except Exception as e:
                logger.error(f"Error updating video {video_id}: {str(e)}", exc_info=True)
                failed_videos.append({"id": video_id, "error": str(e)})
                continue

        return {
            "message": "Bulk update complete",
            "updated_count": len(updated_videos),
            "failed_count": len(failed_videos),
            "updated_videos": [serialize_video(v) for v in updated_videos],
            "failed_videos": failed_videos
        }

    except Exception as e:
        logger.error(f"Error in bulk update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to bulk update videos: {str(e)}")


@router.post("/api/videos/{video_id}/extract-metadata")
async def extract_video_metadata(video_id: int, db: AsyncSession = Depends(get_db)):
    """Extract metadata for a single video on-demand."""
    thumbnail_db = get_thumbnail_db()

    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    video_path = Path(video.path)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found on disk")

    service = VideoService(db, thumbnail_db)
    try:
        metadata = await service.extract_video_metadata(video_path)

        if metadata:
            video.duration = metadata.get('duration')
            video.width = metadata.get('width')
            video.height = metadata.get('height')
            video.codec = metadata.get('codec')
            video.bitrate = metadata.get('bitrate')
            video.fps = metadata.get('fps')
            await db.commit()

            return {
                "success": True,
                "video_id": video_id,
                "video_name": video.display_name or video.name,
                "metadata": {
                    "duration": video.duration,
                    "width": video.width,
                    "height": video.height,
                    "codec": video.codec,
                    "bitrate": video.bitrate,
                    "fps": video.fps
                },
                "message": "Metadata extracted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to extract metadata")

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Metadata extraction failed: {str(e)}")


@router.post("/api/videos/folder/{folder_name}/extract-metadata")
async def extract_folder_metadata(folder_name: str, db: AsyncSession = Depends(get_db)):
    """Extract metadata for all videos in a folder."""
    thumbnail_db = get_thumbnail_db()

    result = await db.execute(
        select(Video).where(Video.category == folder_name)
    )
    videos = result.scalars().all()

    if not videos:
        return {
            "success": True,
            "folder_name": folder_name,
            "processed": 0,
            "message": "No videos found in folder"
        }

    service = VideoService(db, thumbnail_db)
    processed = 0
    failed = 0

    for video in videos:
        if video.duration is not None:
            continue

        video_path = Path(video.path)
        if not video_path.exists():
            failed += 1
            continue

        try:
            metadata = await service.extract_video_metadata(video_path)

            if metadata:
                video.duration = metadata.get('duration')
                video.width = metadata.get('width')
                video.height = metadata.get('height')
                video.codec = metadata.get('codec')
                video.bitrate = metadata.get('bitrate')
                video.fps = metadata.get('fps')
                processed += 1
        except Exception as e:
            logger.warning(f"Failed to extract metadata for {video.name}: {e}")
            failed += 1
            continue

    await db.commit()

    return {
        "success": True,
        "folder_name": folder_name,
        "total_videos": len(videos),
        "processed": processed,
        "failed": failed,
        "message": f"Extracted metadata for {processed} videos"
    }


@router.post("/api/videos/bulk/extract-metadata")
async def extract_bulk_metadata(video_ids: List[int], db: AsyncSession = Depends(get_db)):
    """Extract metadata for multiple videos (bulk operation)."""
    thumbnail_db = get_thumbnail_db()

    if not video_ids:
        raise HTTPException(status_code=400, detail="No video IDs provided")

    result = await db.execute(
        select(Video).where(Video.id.in_(video_ids))
    )
    videos = result.scalars().all()

    if not videos:
        raise HTTPException(status_code=404, detail="No videos found")

    service = VideoService(db, thumbnail_db)
    processed = 0
    failed = 0

    for video in videos:
        if video.duration is not None:
            continue

        video_path = Path(video.path)
        if not video_path.exists():
            failed += 1
            continue

        try:
            metadata = await service.extract_video_metadata(video_path)

            if metadata:
                video.duration = metadata.get('duration')
                video.width = metadata.get('width')
                video.height = metadata.get('height')
                video.codec = metadata.get('codec')
                video.bitrate = metadata.get('bitrate')
                video.fps = metadata.get('fps')
                processed += 1
        except Exception as e:
            logger.warning(f"Failed to extract metadata for {video.name}: {e}")
            failed += 1
            continue

    await db.commit()

    return {
        "success": True,
        "requested": len(video_ids),
        "found": len(videos),
        "processed": processed,
        "failed": failed,
        "message": f"Extracted metadata for {processed} videos"
    }


@router.post("/videos/{video_id}/delete")
async def delete_video(video_id: int, db: AsyncSession = Depends(get_db)):
    """Move a video to the DELETE folder in root directory."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)

    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        moved = await service.move_video(
            video_id=video_id,
            target_category="DELETE",
            root_directory=config.root_directory,
            target_subcategory=None,
            new_name=None
        )
    except FileExistsError:
        raise HTTPException(
            status_code=409,
            detail="A file with this name already exists in DELETE folder"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))

    if not moved:
        raise HTTPException(status_code=404, detail="Video not found or source file missing")

    return {
        "message": "Video moved to DELETE folder",
        "video": {
            "id": moved.id,
            "path": moved.path,
            "name": moved.name,
            "category": moved.category,
            "original_category": video.category
        }
    }


@router.post("/videos/{video_id}/delete-permanent")
async def delete_video_permanent(video_id: int, db: AsyncSession = Depends(get_db)):
    """Permanently delete a video file from disk and database (only for videos in DELETE folder)."""
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if video.category != "DELETE":
        raise HTTPException(
            status_code=403,
            detail="Can only permanently delete videos from DELETE folder. Move to DELETE first."
        )

    try:
        video_path = Path(video.path)
        if video_path.exists():
            os.remove(video_path)
            logger.info(f"Permanently deleted file: {video_path}")
        else:
            logger.warning(f"File not found for deletion: {video_path}")

        await db.delete(video)
        await db.commit()

        return {
            "message": "Video permanently deleted",
            "video_id": video_id,
            "video_name": video.name
        }

    except Exception as e:
        await db.rollback()
        logger.error(f"Error permanently deleting video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete video: {str(e)}")


@router.get("/api/metadata/suggestions")
async def get_metadata_suggestions(field: str = None, db: AsyncSession = Depends(get_db)):
    """Get unique values for metadata fields (series, channel, year) for autocomplete with counts."""
    from sqlalchemy import func

    try:
        if field == "channel":
            result = await db.execute(
                select(Video.channel, func.count(Video.id)).where(Video.channel.isnot(None))
                .group_by(Video.channel).order_by(Video.channel)
            )
            values = [{"value": r[0], "count": r[1]} for r in result.fetchall() if r[0]]
            return {"suggestions": values, "total": len(values)}

        elif field == "series":
            result = await db.execute(
                select(Video.series, func.count(Video.id)).where(Video.series.isnot(None))
                .group_by(Video.series).order_by(Video.series)
            )
            values = [{"value": r[0], "count": r[1]} for r in result.fetchall() if r[0]]
            return {"suggestions": values, "total": len(values)}

        elif field == "year":
            result = await db.execute(
                select(Video.year, func.count(Video.id)).where(Video.year.isnot(None))
                .group_by(Video.year).order_by(Video.year.desc())
            )
            values = [{"value": str(r[0]), "count": r[1]} for r in result.fetchall() if r[0]]
            return {"suggestions": values, "total": len(values)}

        else:
            # Return all suggestions if no field specified
            series_result = await db.execute(
                select(Video.series, func.count(Video.id)).where(Video.series.isnot(None))
                .group_by(Video.series).order_by(Video.series)
            )
            series = [{"value": r[0], "count": r[1]} for r in series_result.fetchall() if r[0]]

            channel_result = await db.execute(
                select(Video.channel, func.count(Video.id)).where(Video.channel.isnot(None))
                .group_by(Video.channel).order_by(Video.channel)
            )
            channels = [{"value": r[0], "count": r[1]} for r in channel_result.fetchall() if r[0]]

            year_result = await db.execute(
                select(Video.year, func.count(Video.id)).where(Video.year.isnot(None))
                .group_by(Video.year).order_by(Video.year.desc())
            )
            years = [{"value": str(r[0]), "count": r[1]} for r in year_result.fetchall() if r[0]]

            return {
                "series": series,
                "channels": channels,
                "years": years
            }
    except Exception as e:
        logger.error(f"Error fetching metadata suggestions: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch suggestions: {str(e)}")
