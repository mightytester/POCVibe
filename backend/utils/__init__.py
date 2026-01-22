"""Shared utilities for the Clipper backend."""

from .constants import (
    FACE_SIMILARITY_AUTO_LINK,
    FACE_SIMILARITY_SEARCH,
    FACE_SIMILARITY_GROUP_HIGH,
    FACE_SIMILARITY_GROUP_LOW,
    FINGERPRINT_HASH_SIZE,
    FINGERPRINT_FRAME_POSITIONS,
    FINGERPRINT_SIMILARITY_THRESHOLD,
    THUMBNAIL_WIDTH,
    THUMBNAIL_JPEG_QUALITY,
    INSIGHTFACE_DET_SIZE,
    INSIGHTFACE_DET_THRESH,
    FFMPEG_TIMEOUT,
    FFPROBE_TIMEOUT,
)
from .exceptions import (
    VideoNotFoundError,
    FaceNotFoundError,
    ActorNotFoundError,
    TagNotFoundError,
    FFmpegNotAvailableError,
    FolderNotFoundError,
)
from .ffmpeg import check_ffmpeg, get_ffmpeg_version
from .serializers import serialize_video

__all__ = [
    # Constants
    "FACE_SIMILARITY_AUTO_LINK",
    "FACE_SIMILARITY_SEARCH",
    "FACE_SIMILARITY_GROUP_HIGH",
    "FACE_SIMILARITY_GROUP_LOW",
    "FINGERPRINT_HASH_SIZE",
    "FINGERPRINT_FRAME_POSITIONS",
    "FINGERPRINT_SIMILARITY_THRESHOLD",
    "THUMBNAIL_WIDTH",
    "THUMBNAIL_JPEG_QUALITY",
    "INSIGHTFACE_DET_SIZE",
    "INSIGHTFACE_DET_THRESH",
    "FFMPEG_TIMEOUT",
    "FFPROBE_TIMEOUT",
    # Exceptions
    "VideoNotFoundError",
    "FaceNotFoundError",
    "ActorNotFoundError",
    "TagNotFoundError",
    "FFmpegNotAvailableError",
    "FolderNotFoundError",
    # FFmpeg
    "check_ffmpeg",
    "get_ffmpeg_version",
    # Serializers
    "serialize_video",
]
