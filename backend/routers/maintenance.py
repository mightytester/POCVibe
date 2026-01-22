"""Maintenance and utility endpoints."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, Video

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


@router.post("/fix-media-types")
async def fix_media_types():
    """
    Fix media_type for existing database records.

    This endpoint corrects records that were created before media_type
    detection was implemented. It re-scans all existing Video records
    and updates their media_type based on file extension.
    """
    from database import fix_existing_media_types

    logger.info("Starting media type fix process...")
    stats = await fix_existing_media_types()

    return {
        "success": True,
        "message": f"Fixed {stats['images_fixed']} images and {stats['videos_fixed']} videos",
        "statistics": {
            "images_corrected": stats['images_fixed'],
            "videos_corrected": stats['videos_fixed'],
            "errors": stats['errors']
        }
    }


@router.post("/mark-folder-as-images")
async def mark_folder_as_images(
    folder_path: str = None,
    category: str = None,
    subcategory: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Mark all files in a folder as images.

    Can use either:
    - folder_path: absolute path (e.g., '/media/rpatel/1TBSSD/MTAGS/00WEBP')
    - category + subcategory: database category/subcategory
    """
    try:
        if folder_path:
            result = await db.execute(
                update(Video)
                .where(Video.path.like(f"{folder_path}%"))
                .values(media_type='image')
            )
        elif category:
            if subcategory:
                result = await db.execute(
                    update(Video)
                    .where((Video.category == category) & (Video.subcategory == subcategory))
                    .values(media_type='image')
                )
            else:
                result = await db.execute(
                    update(Video)
                    .where(Video.category == category)
                    .values(media_type='image')
                )
        else:
            raise HTTPException(status_code=400, detail="Must provide folder_path or category")

        rows_updated = result.rowcount
        await db.commit()

        logger.info(f"Marked {rows_updated} files as images")
        return {
            "success": True,
            "files_updated": rows_updated,
            "message": f"Marked {rows_updated} files as images"
        }

    except Exception as e:
        logger.error(f"Error marking folder as images: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
