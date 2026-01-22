"""Multi-root management endpoints."""

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import config
from database import init_database
from thumbnail_db import ThumbnailDatabase
from face_service import face_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/roots", tags=["roots"])

# Reference to thumbnail_db - will be set by main.py
_thumbnail_db_ref = {"instance": None}


def set_thumbnail_db(db: ThumbnailDatabase):
    """Set the thumbnail database reference (called from main.py)."""
    _thumbnail_db_ref["instance"] = db


def get_thumbnail_db() -> ThumbnailDatabase:
    """Get the current thumbnail database instance."""
    return _thumbnail_db_ref["instance"]


async def clear_all_caches():
    """
    Clear all backend caches when switching roots.

    This ensures complete state isolation between roots:
    - Database connection (reinitialize in separate function)
    - Thumbnail database cache
    - Face service model cache (InsightFace)
    - Any in-memory state
    """
    thumbnail_db = _thumbnail_db_ref["instance"]

    logger.info("Clearing all backend caches for root switch...")

    # Clear thumbnail database cache
    try:
        if thumbnail_db:
            if hasattr(thumbnail_db, 'engine'):
                await thumbnail_db.engine.dispose()
        logger.debug("✓ Thumbnail database cache cleared")
    except Exception as e:
        logger.warning(f"Warning clearing thumbnail cache: {e}")

    # Clear face service cache (reset InsightFace model)
    try:
        if face_service:
            face_service._initialized = False
            face_service.app = None
        logger.debug("✓ Face service model cache cleared")
    except Exception as e:
        logger.warning(f"Warning clearing face service cache: {e}")

    logger.info("✓ All backend caches cleared")


@router.get("")
async def get_roots():
    """Get list of available roots and current active root."""
    return {
        "roots": config.get_roots_list(),
        "current": {
            "path": str(config.current_root_path),
            "layout": config.current_root_layout
        }
    }


@router.post("/select")
async def select_root(root_name: str):
    """Switch to a different root."""
    try:
        # Clear all caches BEFORE switching
        await clear_all_caches()

        config.set_active_root_by_name(root_name)

        # Reinitialize database for new root
        await init_database()

        # Reinitialize thumbnail database
        new_thumbnail_db = ThumbnailDatabase(
            db_path=Path(config.database_path).parent / "thumbnails.db"
        )
        await new_thumbnail_db.create_tables()
        _thumbnail_db_ref["instance"] = new_thumbnail_db

        logger.info(f"✓ Successfully switched to root: {root_name}")

        return {
            "success": True,
            "message": f"Switched to root: {root_name}",
            "current": {
                "path": str(config.current_root_path),
                "layout": config.current_root_layout
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
