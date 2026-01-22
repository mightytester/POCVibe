"""Pydantic schemas for request/response validation."""

from .video import (
    MoveVideoRequest,
    RenameVideoRequest,
    UpdateVideoRequest,
)
from .actor import (
    AddActorRequest,
    UpdateActorRequest,
)
from .face import (
    CompareFacesRequest,
    LinkFaceToVideoRequest,
    MergeFacesRequest,
)
from .download import (
    M3U8DownloadRequest,
    SOCKSDownloadRequest,
)
from .editor import VideoEditRequest
from .common import (
    BulkUpdateRequest,
    RenameFolderRequest,
    BulkHashRenameRequest,
)

__all__ = [
    # Video
    "MoveVideoRequest",
    "RenameVideoRequest",
    "UpdateVideoRequest",
    # Actor
    "AddActorRequest",
    "UpdateActorRequest",
    # Face
    "CompareFacesRequest",
    "LinkFaceToVideoRequest",
    "MergeFacesRequest",
    # Download
    "M3U8DownloadRequest",
    "SOCKSDownloadRequest",
    # Editor
    "VideoEditRequest",
    # Common
    "BulkUpdateRequest",
    "RenameFolderRequest",
    "BulkHashRenameRequest",
]
