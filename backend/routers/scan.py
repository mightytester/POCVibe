"""File scanning and synchronization endpoints."""

import logging
import time
from pathlib import Path
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Body
from fastapi.responses import Response
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from config import config
from database import get_db, Video, FolderScanStatus
from file_scanner import scanner
from video_service import VideoService
from routers.roots import get_thumbnail_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/scan", tags=["scan"])


@router.get("")
async def scan_videos(
    sync_db: bool = True,
    prune_missing: bool = True,
    fast_mode: bool = True,
    folders: str = None,
    db: AsyncSession = Depends(get_db),
    response: Response = Response()
) -> Dict[str, Any]:
    """Scan the configured directory for video files (fast mode - filename discovery only)."""
    thumbnail_db = get_thumbnail_db()

    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    scan_start = time.time()

    folder_list = None
    if folders:
        folder_list = [f.strip() for f in folders.split(',') if f.strip()]

    if folder_list:
        result = {
            'root_directory': str(config.root_directory),
            'categories': {},
            'total_videos': 0,
            'category_count': 0
        }

        for folder_name in folder_list:
            folder_path = config.root_directory / folder_name
            if folder_path.exists() and folder_path.is_dir():
                folder_result = scanner.scan_directory(folder_path.parent)
                if folder_name in folder_result.get('categories', {}):
                    result['categories'][folder_name] = folder_result['categories'][folder_name]
                    result['total_videos'] += folder_result['categories'][folder_name]['count']
                    result['category_count'] += 1

        result['scanned_folders'] = folder_list
    else:
        result = scanner.scan_directory()
        result['scanned_folders'] = 'all'

    service = VideoService(db, thumbnail_db if not fast_mode else None)
    if sync_db and not result.get("error"):
        for category_name, category_data in result["categories"].items():
            for video_info in category_data["videos"]:
                await service.sync_video_to_db(video_info, skip_generation=fast_mode)

    pruned = 0
    if prune_missing and sync_db:
        pruned = await service.prune_missing_files()

    scan_duration = time.time() - scan_start
    result["pruned_missing"] = pruned
    result["fast_mode"] = fast_mode
    result["scan_duration"] = scan_duration

    media_stats = {'videos': 0, 'images': 0}
    for category_data in result.get("categories", {}).values():
        for video_info in category_data.get("videos", []):
            media_type = video_info.get('media_type', 'video')
            if media_type == 'image':
                media_stats['images'] += 1
            else:
                media_stats['videos'] += 1

    result["media_stats"] = media_stats
    return result


@router.get("/structure")
async def get_folder_structure():
    """Get hierarchical folder structure of all categories."""
    structures = {}

    for item in config.root_directory.iterdir():
        if item.is_dir() and not scanner.should_exclude_folder(item.name):
            structures[item.name] = scanner.get_category_structure(item)

    return {
        "root_directory": str(config.root_directory),
        "categories": structures,
        "total_categories": len(structures)
    }


@router.get("/subfolders")
async def get_subfolders():
    """Get all unique subfolders across all categories."""
    return {
        "subfolders": scanner.get_all_subfolders(),
        "root_directory": str(config.root_directory)
    }


@router.post("/folder/{folder_name}/scan-only")
async def scan_folder_files_only(
    folder_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Lightweight scan for explorer view - scans files WITHOUT thumbnail generation."""
    thumbnail_db = get_thumbnail_db()

    folder_path = config.root_directory / folder_name

    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder '{folder_name}' not found")

    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"'{folder_name}' is not a directory")

    if scanner.should_exclude_folder(folder_name):
        raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' is excluded from scanning")

    scan_start = time.time()

    category_videos = scanner._scan_category(folder_path)
    disk_files = {video_info['path'] for video_info in category_videos}
    logger.info(f"Found {len(disk_files)} files on disk for folder: {folder_name}")

    result = await db.execute(
        select(Video.id).where(Video.category == folder_name)
    )
    existing_db_ids = [row[0] for row in result.all()]

    videos_deleted = 0
    if existing_db_ids:
        result_to_delete = await db.execute(
            select(Video.id, Video.path).where(Video.category == folder_name)
        )
        videos_to_delete = result_to_delete.all()
        ids_to_delete = [vid for vid, path in videos_to_delete if path not in disk_files]

        if ids_to_delete:
            await db.execute(
                delete(Video).where(Video.id.in_(ids_to_delete))
            )
            videos_deleted = len(ids_to_delete)
            logger.info(f"Removed {videos_deleted} deleted videos from database (bulk delete)")

    service = VideoService(db, thumbnail_db)
    current_time = int(time.time())

    existing_result = await db.execute(
        select(Video.path).where(Video.category == folder_name)
    )
    existing_paths = {row[0] for row in existing_result.all()}

    for video_info in category_videos:
        video = await service.sync_video_to_db(video_info, skip_generation=True)
        if video:
            video.thumbnail_updated_at = current_time

    await db.commit()

    scan_duration = time.time() - scan_start

    scan_status_result = await db.execute(
        select(FolderScanStatus).where(FolderScanStatus.folder_name == folder_name)
    )
    scan_status = scan_status_result.scalar_one_or_none()

    current_time_full = time.time()
    if scan_status:
        scan_status.last_scanned = current_time_full
        scan_status.video_count = len(category_videos)
        scan_status.scan_duration = scan_duration
        scan_status.is_scanned = 1
    else:
        scan_status = FolderScanStatus(
            folder_name=folder_name,
            last_scanned=current_time_full,
            video_count=len(category_videos),
            scan_duration=scan_duration,
            is_scanned=1
        )
        db.add(scan_status)

    await db.commit()

    return {
        "success": True,
        "folder": folder_name,
        "videos_found": len(category_videos),
        "videos_deleted": videos_deleted,
        "thumbnails_generated": 0,
        "scan_duration": scan_duration,
        "timestamp": current_time_full
    }


@router.post("/folder/{folder_name}/smart-refresh")
async def smart_refresh_folder(
    folder_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Smart refresh for a folder - scans, syncs, removes deleted, updates timestamps."""
    thumbnail_db = get_thumbnail_db()

    folder_path = config.root_directory / folder_name

    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder '{folder_name}' not found")

    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"'{folder_name}' is not a directory")

    if scanner.should_exclude_folder(folder_name):
        raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' is excluded from scanning")

    scan_start = time.time()

    category_videos = scanner._scan_category(folder_path)
    disk_files = {video_info['path'] for video_info in category_videos}
    logger.info(f"Found {len(disk_files)} files on disk for folder: {folder_name}")

    result = await db.execute(
        select(Video).where(Video.category == folder_name)
    )
    existing_db_videos = result.scalars().all()

    videos_deleted = 0
    for db_video in existing_db_videos:
        if db_video.path not in disk_files:
            logger.info(f"Deleting video from DB (file not found on disk): {db_video.path}")
            await db.delete(db_video)
            videos_deleted += 1

    if videos_deleted > 0:
        await db.commit()
        logger.info(f"Removed {videos_deleted} deleted videos from database")

    service = VideoService(db, thumbnail_db)
    video_ids = []
    current_time = time.time()

    for video_info in category_videos:
        video = await service.sync_video_to_db(video_info, skip_generation=True)
        if video:
            video.thumbnail_updated_at = int(current_time)
            video_ids.append(video.id)

    await db.commit()

    thumbnails_generated = 0
    scan_duration = time.time() - scan_start

    scan_status_result = await db.execute(
        select(FolderScanStatus).where(FolderScanStatus.folder_name == folder_name)
    )
    scan_status = scan_status_result.scalar_one_or_none()

    if scan_status:
        scan_status.last_scanned = time.time()
        scan_status.video_count = len(category_videos)
        scan_status.scan_duration = scan_duration
        scan_status.is_scanned = 1
    else:
        scan_status = FolderScanStatus(
            folder_name=folder_name,
            last_scanned=time.time(),
            video_count=len(category_videos),
            scan_duration=scan_duration,
            is_scanned=1
        )
        db.add(scan_status)

    await db.commit()

    return {
        "success": True,
        "folder": folder_name,
        "videos_found": len(category_videos),
        "videos_deleted": videos_deleted,
        "thumbnails_generated": thumbnails_generated,
        "scan_duration": scan_duration,
        "timestamp": time.time()
    }


@router.post("/video/single")
async def scan_single_video(
    folder_name: str = Body(...),
    filename: str = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """Scan and generate thumbnail for a SINGLE edited video only."""
    thumbnail_db = get_thumbnail_db()

    folder_path = config.root_directory / folder_name
    video_path = folder_path / filename

    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {filename}")

    if not video_path.is_file():
        raise HTTPException(status_code=400, detail=f"Path is not a file: {filename}")

    scan_start = time.time()

    try:
        video_info = scanner.get_file_info(video_path)
        if not video_info:
            raise HTTPException(status_code=400, detail=f"Could not read video file: {filename}")

        service = VideoService(db, thumbnail_db)
        video = await service.sync_video_to_db(video_info, skip_generation=True)

        if not video:
            raise HTTPException(status_code=500, detail="Failed to sync video to database")

        thumbnails_generated = 0
        if not video.thumbnail_generated:
            try:
                if not video.thumbnail_url:
                    video.thumbnail_url = f"/api/thumbnails/{video.id}"

                await thumbnail_db.generate_thumbnail_for_video(video.path, video.id)
                video.thumbnail_generated = 1
                video.thumbnail_updated_at = int(time.time())
                thumbnails_generated = 1
                logger.info(f"Generated thumbnail for edited video: {video.path}")
            except Exception as e:
                logger.warning(f"Failed to generate thumbnail for edited video {video.id}: {e}")
                raise HTTPException(status_code=500, detail=f"Failed to generate thumbnail: {str(e)}")

        await db.commit()

        scan_duration = time.time() - scan_start

        return {
            "success": True,
            "video_id": video.id,
            "video_name": video.name,
            "folder": folder_name,
            "filename": filename,
            "thumbnails_generated": thumbnails_generated,
            "scan_duration": scan_duration,
            "message": f"Successfully imported edited video: {filename}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error scanning single edited video: {e}")
        raise HTTPException(status_code=500, detail=f"Error scanning video: {str(e)}")


@router.post("/folder/{folder_name}")
async def scan_folder(
    folder_name: str,
    recursive: bool = True,
    sync_db: bool = True,
    prune_missing: bool = False,
    hierarchical: bool = False,
    parent_category: str = None,
    fast_mode: bool = True,
    db: AsyncSession = Depends(get_db)
):
    """Scan a specific folder with hierarchical support (fast mode - filename discovery only)."""
    thumbnail_db = get_thumbnail_db()

    folder_path = config.root_directory / folder_name

    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder '{folder_name}' not found")

    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"'{folder_name}' is not a directory")

    if scanner.should_exclude_folder(folder_name):
        raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' is excluded from scanning")

    scan_start = time.time()

    if hierarchical:
        scan_result = scanner.scan_folder_hierarchical(folder_path, parent_category)
        category_videos = scan_result['direct_videos']
        result = scan_result
        result['scan_type'] = 'hierarchical'
        result['scan_duration'] = time.time() - scan_start
    else:
        if recursive:
            category_videos = scanner._scan_category(folder_path)
        else:
            category_videos = scanner._scan_category_folder_only(folder_path)

        scan_duration = time.time() - scan_start
        scanned_at = time.time()

        result = {
            "folder": folder_name,
            "path": str(folder_path),
            "videos_found": len(category_videos),
            "scanned_at": scanned_at,
            "scan_duration": scan_duration,
            "recursive": recursive,
            "scan_type": "recursive" if recursive else "folder_only"
        }

    if sync_db:
        service = VideoService(db, thumbnail_db if not fast_mode else None)
        for video_info in category_videos:
            await service.sync_video_to_db(video_info, skip_generation=fast_mode)
        result["synced_to_db"] = True
        result["fast_mode"] = fast_mode

        if prune_missing:
            all_videos_result = await db.execute(
                select(Video).where(Video.category == folder_name)
            )
            category_db_videos = all_videos_result.scalars().all()

            scanned_paths = {video_info['path'] for video_info in category_videos}
            pruned = 0

            for db_video in category_db_videos:
                if db_video.path not in scanned_paths:
                    await db.delete(db_video)
                    pruned += 1

            await db.commit()
            result["pruned_missing"] = pruned

    scan_status_result = await db.execute(
        select(FolderScanStatus).where(FolderScanStatus.folder_name == folder_name)
    )
    scan_status = scan_status_result.scalar_one_or_none()

    if hierarchical:
        scanned_at = result.get('scanned_at')
        scan_duration = result.get('scan_duration')
        video_count = result.get('total_direct_videos', 0)
    else:
        video_count = len(category_videos)

    if scan_status:
        scan_status.last_scanned = scanned_at
        scan_status.video_count = video_count
        scan_status.scan_duration = scan_duration
        scan_status.is_scanned = 1
    else:
        scan_status = FolderScanStatus(
            folder_name=folder_name,
            last_scanned=scanned_at,
            video_count=video_count,
            scan_duration=scan_duration,
            is_scanned=1
        )
        db.add(scan_status)

    await db.commit()

    if hierarchical and 'available_subfolders' in result:
        scan_statuses_result = await db.execute(select(FolderScanStatus))
        scan_statuses = {status.folder_name: status for status in scan_statuses_result.scalars().all()}

        for subfolder in result['available_subfolders']:
            if subfolder['name'] in scan_statuses:
                status = scan_statuses[subfolder['name']]
                subfolder['is_scanned'] = bool(status.is_scanned)
                subfolder['last_scanned'] = status.last_scanned
                subfolder['scan_status'] = 'scanned' if status.is_scanned else 'not_scanned'

    return result


@router.get("/status")
async def get_scan_status(db: AsyncSession = Depends(get_db)):
    """Get scan status for all folders."""
    physical_folders = []
    for item in config.root_directory.iterdir():
        if item.is_dir() and not scanner.should_exclude_folder(item.name):
            physical_folders.append(item.name)

    scan_statuses_result = await db.execute(select(FolderScanStatus))
    scan_statuses = {status.folder_name: status for status in scan_statuses_result.scalars().all()}

    folder_status = {}
    for folder_name in physical_folders:
        if folder_name in scan_statuses:
            status = scan_statuses[folder_name]
            folder_status[folder_name] = {
                "is_scanned": bool(status.is_scanned),
                "last_scanned": status.last_scanned,
                "video_count": status.video_count,
                "scan_duration": status.scan_duration
            }
        else:
            folder_status[folder_name] = {
                "is_scanned": False,
                "last_scanned": None,
                "video_count": 0,
                "scan_duration": None
            }

    return {
        "folders": folder_status,
        "total_folders": len(physical_folders),
        "scanned_folders": sum(1 for status in folder_status.values() if status["is_scanned"])
    }
