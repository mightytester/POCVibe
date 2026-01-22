"""Audio management endpoints."""

import logging
import math
import shutil
import subprocess
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import config
from database import get_db, Video

logger = logging.getLogger(__name__)

router = APIRouter(tags=["audio"])


@router.get("/api/audios")
async def get_available_audios():
    """List all available audio files from .clipper/Audios/ folder."""
    try:
        audio_folder = config.root_directory / ".clipper" / "Audios"

        if not audio_folder.exists():
            return {"audios": []}

        audios = [
            {"filename": audio_file.name}
            for audio_file in sorted(audio_folder.glob("*.m4a"))
        ]

        return {"audios": audios}

    except Exception as e:
        logger.error(f"Failed to list audios: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/audios/{audio_filename}")
async def delete_audio(audio_filename: str):
    """Delete an audio file from .clipper/Audios/ folder."""
    try:
        audio_folder = config.root_directory / ".clipper" / "Audios"
        audio_path = audio_folder / audio_filename

        if not audio_path.exists() or not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Audio file not found")

        if not audio_path.resolve().parent == audio_folder.resolve():
            raise HTTPException(status_code=403, detail="Access denied")

        audio_path.unlink()
        logger.info(f"Deleted audio file: {audio_filename}")

        return {
            "success": True,
            "message": f"Audio '{audio_filename}' deleted",
            "filename": audio_filename
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/videos/{video_id}/add-audio")
async def add_audio_to_video(
    video_id: int,
    request: dict = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """Add audio from .clipper/Audios/ to a video, trimming audio to match video length."""
    try:
        audio_filename = request.get('audio_filename')
        if not audio_filename:
            raise HTTPException(status_code=400, detail="audio_filename is required")

        stmt = select(Video).where(Video.id == video_id)
        result = await db.execute(stmt)
        video = result.scalar_one_or_none()

        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        video_path = Path(video.path)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")

        audio_folder = config.root_directory / ".clipper" / "Audios"
        audio_path = audio_folder / audio_filename

        if not audio_path.exists() or not audio_path.suffix.lower() == ".m4a":
            raise HTTPException(status_code=404, detail="Audio file not found or invalid format")

        logger.info(f"Adding audio {audio_filename} to video {video_path}")

        video_duration_result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1",
                str(video_path)
            ],
            capture_output=True,
            text=True,
            timeout=10
        )

        video_duration = float(video_duration_result.stdout.strip()) if video_duration_result.stdout.strip() else None
        if not video_duration:
            raise HTTPException(status_code=400, detail="Could not determine video duration")

        logger.info(f"Video duration: {video_duration} seconds")

        audio_duration_result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1:noprint_wrappers=1",
                str(audio_path)
            ],
            capture_output=True,
            text=True,
            timeout=10
        )

        audio_duration = float(audio_duration_result.stdout.strip()) if audio_duration_result.stdout.strip() else None
        if not audio_duration:
            raise HTTPException(status_code=400, detail="Could not determine audio duration")

        logger.info(f"Audio duration: {audio_duration} seconds, Video duration: {video_duration} seconds")

        temp_output = video_path.parent / f"{video_path.stem}_temp_with_audio.mp4"

        if temp_output.exists():
            logger.info(f"Cleaning up existing temp file: {temp_output}")
            temp_output.unlink()

        if audio_duration < video_duration:
            loops_needed = math.ceil(video_duration / audio_duration)

            logger.info(f"Audio shorter than video - looping {loops_needed} times")

            ffmpeg_cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-c:v", "copy",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-af", f"aloop=loop={loops_needed}",
                "-t", str(video_duration),
                "-y",
                str(temp_output)
            ]
        else:
            logger.info(f"Audio longer or equal to video - trimming to {video_duration}s")

            ffmpeg_cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-c:v", "copy",
                "-c:a", "aac",
                "-map", "0:v:0",
                "-map", "1:a:0",
                "-t", str(video_duration),
                "-y",
                str(temp_output)
            ]

        logger.info(f"Running: {' '.join(ffmpeg_cmd)}")

        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            if temp_output.exists():
                temp_output.unlink()
            raise HTTPException(status_code=500, detail=f"Failed to add audio: {result.stderr}")

        shutil.move(str(temp_output), str(video_path))
        logger.info(f"Audio added successfully to {video_path}")

        video.size = video_path.stat().st_size
        await db.commit()

        return {
            "success": True,
            "message": f"Audio '{audio_filename}' added to video",
            "video_id": video_id,
            "video_path": str(video_path)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audios/{audio_filename}")
async def serve_audio(audio_filename: str):
    """Serve audio file from .clipper/Audios/ folder for preview."""
    try:
        audio_folder = config.root_directory / ".clipper" / "Audios"
        audio_path = audio_folder / audio_filename

        if not audio_path.exists() or not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Audio file not found")

        if not audio_path.resolve().parent == audio_folder.resolve():
            raise HTTPException(status_code=403, detail="Access denied")

        return FileResponse(
            str(audio_path),
            media_type="audio/mp4",
            headers={
                "Cache-Control": "public, max-age=3600",
                "Accept-Ranges": "bytes"
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to serve audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))
