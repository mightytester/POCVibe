"""Video editing endpoints."""

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from config import config
from database import get_db, Video, VideoFace
from video_service import VideoService
from video_editor import get_editor
from schemas.editor import VideoEditRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/editor", tags=["editor"])


@router.post("/process")
async def create_video_edit_job(
    request: VideoEditRequest,
    db: AsyncSession = Depends(get_db)
):
    """Start a new video editing job (cut/crop/both)."""
    try:
        editor = get_editor()

        result = await db.execute(
            select(Video).where(Video.id == request.video_id)
        )
        video = result.scalar_one_or_none()

        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        input_width = video.width
        input_height = video.height

        if (not input_width or not input_height) and request.operation in ('crop', 'cut_and_crop'):
            video_service = VideoService(db)
            metadata = await video_service.extract_video_metadata(Path(video.path))
            if metadata:
                input_width = input_width or metadata.get('width')
                input_height = input_height or metadata.get('height')
                logger.info(f"Extracted metadata for video {video.id}: {input_width}x{input_height}")

        if request.operation in ('crop', 'cut_and_crop'):
            if not input_width or not input_height:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot crop: video dimensions unknown. Width={input_width}, Height={input_height}"
                )

        job = editor.create_edit_job(
            video_id=request.video_id,
            video_path=video.path,
            operation=request.operation,
            start_time=request.start_time,
            end_time=request.end_time,
            cut_method=request.cut_method,
            crop_preset=request.crop_preset,
            crop_width=request.crop_width or input_width,
            crop_height=request.crop_height or input_height,
            crop_x=request.crop_x,
            crop_y=request.crop_y,
            preserve_faces=request.preserve_faces,
            output_filename=request.output_filename,
            output_location=request.output_location,
            copy_other_items=request.copy_other_items,
            quality=request.quality
        )

        return {
            "job_id": job.id,
            "status": job.status,
            "output_filename": job.output_filename,
            "message": f"Video edit job created: {job.operation}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to create edit job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs/{job_id}")
async def get_edit_job_status(job_id: int):
    """Get status of a specific edit job."""
    try:
        editor = get_editor()
        job = editor.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        return {
            "id": job.id,
            "video_id": job.video_id,
            "operation": job.operation,
            "status": job.status,
            "progress": job.progress,
            "output_filename": job.output_filename,
            "output_path": job.output_path,
            "error_message": job.error_message,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
            "cut_method": job.cut_method
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get job status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/jobs")
async def list_edit_jobs(active_only: bool = False):
    """List all edit jobs or only active ones."""
    try:
        editor = get_editor()

        if active_only:
            jobs = editor.list_active_jobs()
        else:
            jobs = editor.list_jobs()

        return {
            "jobs": [
                {
                    "id": job.id,
                    "video_id": job.video_id,
                    "operation": job.operation,
                    "status": job.status,
                    "progress": job.progress,
                    "output_filename": job.output_filename,
                    "created_at": job.created_at,
                    "completed_at": job.completed_at,
                    "cut_method": job.cut_method
                }
                for job in jobs
            ]
        }

    except Exception as e:
        logger.error(f"Failed to list jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/preserve-faces")
async def preserve_faces_to_edited_video(
    job_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Copy face associations from original video to edited video."""
    try:
        editor = get_editor()
        job = editor.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status != 'completed':
            raise HTTPException(status_code=400, detail="Job not completed yet")

        result = await db.execute(
            select(Video)
            .options(selectinload(Video.video_faces_rel))
            .where(Video.id == job.video_id)
        )
        original_video = result.scalar_one_or_none()

        if not original_video:
            raise HTTPException(status_code=404, detail="Original video not found")

        result = await db.execute(
            select(Video).where(Video.path == job.output_path)
        )
        edited_video = result.scalar_one_or_none()

        if not edited_video:
            raise HTTPException(status_code=404, detail="Edited video not found in database. Run scan first.")

        faces_copied = 0
        for video_face in original_video.video_faces_rel:
            existing = await db.execute(
                select(VideoFace).where(
                    and_(
                        VideoFace.video_id == edited_video.id,
                        VideoFace.face_id == video_face.face_id
                    )
                )
            )
            if not existing.scalar_one_or_none():
                new_video_face = VideoFace(
                    video_id=edited_video.id,
                    face_id=video_face.face_id,
                    first_detected_at=video_face.first_detected_at,
                    detection_method='preserved_from_edit',
                    appearance_count=video_face.appearance_count
                )
                db.add(new_video_face)
                faces_copied += 1

        await db.commit()

        return {
            "success": True,
            "faces_copied": faces_copied,
            "message": f"Copied {faces_copied} face associations to edited video"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to preserve faces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/jobs/{job_id}/copy-metadata")
async def copy_metadata_to_edited_video(
    job_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Copy tags and face associations from original video to edited video."""
    try:
        editor = get_editor()
        job = editor.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status != 'completed':
            raise HTTPException(status_code=400, detail="Job not completed yet")

        result = await db.execute(
            select(Video)
            .options(
                selectinload(Video.tags),
                selectinload(Video.video_faces_rel)
            )
            .where(Video.id == job.video_id)
        )
        original_video = result.scalar_one_or_none()

        if not original_video:
            raise HTTPException(status_code=404, detail="Original video not found")

        has_tags = len(original_video.tags) > 0
        has_faces = len(original_video.video_faces_rel) > 0

        if not has_tags and not has_faces:
            return {
                "success": True,
                "tags_copied": 0,
                "faces_copied": 0,
                "skipped": True,
                "message": "Source video has no tags or faces to copy"
            }

        result = await db.execute(
            select(Video).where(Video.path == job.output_path)
        )
        edited_video = result.scalar_one_or_none()

        if not edited_video:
            raise HTTPException(status_code=404, detail="Edited video not found in database. Run scan first.")

        tags_copied = 0
        if has_tags:
            for tag in original_video.tags:
                if tag not in edited_video.tags:
                    edited_video.tags.append(tag)
                    tags_copied += 1

        faces_copied = 0
        if has_faces:
            for video_face in original_video.video_faces_rel:
                existing = await db.execute(
                    select(VideoFace).where(
                        and_(
                            VideoFace.video_id == edited_video.id,
                            VideoFace.face_id == video_face.face_id
                        )
                    )
                )
                if not existing.scalar_one_or_none():
                    new_video_face = VideoFace(
                        video_id=edited_video.id,
                        face_id=video_face.face_id,
                        first_detected_at=video_face.first_detected_at,
                        detection_method='preserved_from_edit',
                        appearance_count=video_face.appearance_count
                    )
                    db.add(new_video_face)
                    faces_copied += 1

        await db.commit()

        return {
            "success": True,
            "tags_copied": tags_copied,
            "faces_copied": faces_copied,
            "message": f"Copied {tags_copied} tags and {faces_copied} face associations to edited video"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to copy metadata: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/jobs/{job_id}")
async def remove_edit_job(job_id: int):
    """Remove edit job from tracking (does not delete output file)."""
    try:
        editor = get_editor()
        success = editor.remove_job(job_id)

        if not success:
            raise HTTPException(status_code=404, detail="Job not found")

        return {"success": True, "message": f"Job {job_id} removed from tracking"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove job: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear-completed")
async def clear_completed_edit_jobs():
    """Clear all completed/failed edit jobs from memory."""
    try:
        editor = get_editor()
        editor.clear_completed()
        return {"success": True, "message": "Completed jobs cleared"}

    except Exception as e:
        logger.error(f"Failed to clear jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
