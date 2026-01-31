"""Clipper API - Video management backend.

This is the main FastAPI application entry point. All endpoint handlers
are organized into routers under the routers/ directory.
"""

import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import config
from database import init_database, migrate_database
from thumbnail_db import ThumbnailDatabase
from m3u8_downloader import init_downloader
from socks_downloader import init_socks_downloader
from video_editor import init_editor
from local_mode import local_mode

# Import all routers
from routers import (
    health_router,
    roots_router,
    scan_router,
    videos_router,
    streaming_router,
    tags_router,
    actors_router,
    search_router,
    thumbnails_router,
    fingerprints_router,
    faces_router,
    downloads_router,
    editor_router,
    audio_router,
    folders_router,
    maintenance_router,
    folder_videos_router,
)
from routers.roots import set_thumbnail_db

logger = logging.getLogger(__name__)

# Global thumbnail database reference
thumbnail_db = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown."""
    global thumbnail_db

    # Startup - Initialize database for the current active root
    await init_database()
    await migrate_database()

    # Initialize thumbnail database
    thumbnail_db = ThumbnailDatabase(
        db_path=Path(config.database_path).parent / "thumbnails.db"
    )
    await thumbnail_db.create_tables()

    # Share thumbnail_db with routers that need it
    set_thumbnail_db(thumbnail_db)

    # Initialize M3U8 downloader (downloads to {ROOT}/DOWNLOADS/ folder)
    downloads_folder = config.root_directory / "DOWNLOADS"
    init_downloader(downloads_folder)
    logger.info(f"M3U8 Downloader initialized: {downloads_folder}")

    # Initialize SOCKS downloader (downloads to {ROOT}/DOWNLOADS/ folder)
    init_socks_downloader(downloads_folder)
    logger.info(f"SOCKS Downloader initialized: {downloads_folder}")

    # Initialize Video Editor (edited videos output to {ROOT}/EDITED/ folder)
    edited_folder = config.root_directory / "EDITED"
    init_editor(edited_folder)
    logger.info(f"Video Editor initialized: {edited_folder}")

    yield

    # Shutdown - cleanup if needed
    logger.info("Shutting down Clipper API")


# Create FastAPI application
app = FastAPI(
    title="Clipper API",
    version="0.1.0",
    lifespan=lifespan,
    description="Video/media file manager API"
)

# Frontend path for static file serving
frontend_path = Path(__file__).parent.parent / "frontend"

# Mount static files (frontend)
app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

# Mount video directories for local mode (direct file serving)
if local_mode.enabled:
    if config.root_directory.exists():
        for category_path in config.root_directory.iterdir():
            if category_path.is_dir() and not category_path.name.startswith('.'):
                category_name = category_path.name
                logger.info(f"Mounting {category_name} videos at /local-videos/{category_name}")
                app.mount(
                    f"/local-videos/{category_name}",
                    StaticFiles(directory=str(category_path)),
                    name=f"videos_{category_name}"
                )
    else:
        logger.warning(f"Root directory {config.root_directory} does not exist")

# CORS middleware for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"] + config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== STATIC ROUTES ====================

@app.get("/")
async def serve_frontend():
    """Serve the main frontend application."""
    return FileResponse(str(frontend_path / "index.html"))


@app.get("/favicon.ico")
async def favicon():
    """Serve favicon if it exists, otherwise return 204."""
    favicon_path = frontend_path / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(str(favicon_path))
    return Response(status_code=204)


# ==================== MOUNT ROUTERS ====================

# Core routers
app.include_router(health_router)
app.include_router(roots_router)
app.include_router(scan_router)
app.include_router(streaming_router)  # Mount streaming before videos to avoid prefix conflict
app.include_router(videos_router)
app.include_router(folder_videos_router)
app.include_router(tags_router)
app.include_router(actors_router)
app.include_router(search_router)
app.include_router(thumbnails_router)

# Advanced routers
app.include_router(fingerprints_router)
app.include_router(faces_router)

# Utility routers
app.include_router(downloads_router)
app.include_router(editor_router)
app.include_router(audio_router)
app.include_router(folders_router)
app.include_router(maintenance_router)


# ==================== APPLICATION ENTRY POINT ====================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=config.server_host,
        port=config.server_port,
        reload=config.reload
    )
