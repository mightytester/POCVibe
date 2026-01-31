"""FastAPI routers for the Clipper backend."""

from .health import router as health_router
from .roots import router as roots_router
from .scan import router as scan_router
from .videos import router as videos_router
from .tags import router as tags_router
from .actors import router as actors_router
from .search import router as search_router
from .thumbnails import router as thumbnails_router
from .fingerprints import router as fingerprints_router
from .faces import router as faces_router
from .downloads import router as downloads_router
from .editor import router as editor_router
from .audio import router as audio_router
from .folders import router as folders_router
from .maintenance import router as maintenance_router
from .folder_videos import router as folder_videos_router

__all__ = [
    "health_router",
    "roots_router",
    "scan_router",
    "videos_router",
    "tags_router",
    "actors_router",
    "search_router",
    "thumbnails_router",
    "fingerprints_router",
    "faces_router",
    "downloads_router",
    "editor_router",
    "audio_router",
    "folders_router",
    "maintenance_router",
    "folder_videos_router",
]
