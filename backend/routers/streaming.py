"""Video/media streaming endpoints."""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from config import config
from file_scanner import scanner

logger = logging.getLogger(__name__)

router = APIRouter(tags=["streaming"])


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


@router.get("/stream/{category}/{video_path:path}")
async def stream_video(category: str, video_path: str, request: Request):
    """Stream a video or image file with optimized byte-range support for instant seeking."""
    if category == "_root":
        full_path = config.root_directory / video_path
    else:
        full_path = config.root_directory / category / video_path

    try:
        full_path = full_path.resolve()
        root_resolved = config.root_directory.resolve()

        if not str(full_path).startswith(str(root_resolved)):
            raise HTTPException(status_code=403, detail="Access denied: Path traversal detected")
    except (ValueError, OSError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid path: {str(e)}")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    if not (scanner.is_video_file(full_path) or scanner.is_image_file(full_path)):
        raise HTTPException(status_code=400, detail="File is not a video or image")

    file_size = full_path.stat().st_size
    content_type = get_media_type_header(full_path)

    range_header = request.headers.get("range")

    if range_header:
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1

        if start >= file_size or end >= file_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")

        chunk_size = end - start + 1

        def file_chunk_iterator():
            with open(full_path, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    read_size = min(8192 * 64, remaining)
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": content_type,
            "Cache-Control": "public, max-age=3600",
        }

        return StreamingResponse(
            file_chunk_iterator(),
            status_code=206,
            headers=headers
        )

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Cache-Control": "public, max-age=3600",
    }

    return FileResponse(
        path=str(full_path),
        media_type=content_type,
        headers=headers
    )
