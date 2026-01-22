from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi import Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime
import time
import logging
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity
from config import config

logger = logging.getLogger(__name__)
from file_scanner import scanner
from database import get_db, create_tables, migrate_database, Video, Tag, Actor, FolderScanStatus, VideoFingerprint, FaceID, FaceEncoding, VideoFace, FolderGroup, init_database
from video_service import VideoService
from thumbnail_db import ThumbnailDatabase
from fingerprint_service import FingerprintService
from face_service import face_service
from m3u8_downloader import init_downloader, get_downloader
from socks_downloader import init_socks_downloader, get_socks_downloader
from video_editor import init_editor, get_editor
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, case
from contextlib import asynccontextmanager
from pydantic import BaseModel
from fastapi import Response
from local_mode import local_mode

class MoveVideoRequest(BaseModel):
    target_category: str
    target_subcategory: str | None = None
    new_name: str | None = None

class RenameVideoRequest(BaseModel):
    new_name: str

class RenameFolderRequest(BaseModel):
    old_name: str
    new_name: str

class CompareFacesRequest(BaseModel):
    face_ids: List[int]

class BulkHashRenameRequest(BaseModel):
    folder_name: str

class UpdateVideoRequest(BaseModel):
    display_name: str | None = None
    description: str | None = None
    new_name: str | None = None  # Optional: if provided, rename the actual file
    series: str | None = None
    season: int | None = None
    episode: str | None = None
    year: int | None = None
    channel: str | None = None
    rating: float | None = None  # 0-5 stars
    favorite: bool | None = None

class AddActorRequest(BaseModel):
    actor_name: str

class UpdateActorRequest(BaseModel):
    name: str | None = None
    notes: str | None = None

class LinkFaceToVideoRequest(BaseModel):
    detection_method: str = "manual_search"

class MergeFacesRequest(BaseModel):
    face_ids: List[int]
    target_name: str | None = None
    target_actor_id: int | None = None

class BulkUpdateRequest(BaseModel):
    """Request model for bulk updating multiple videos"""
    common_fields: Dict[str, Any]  # Fields to apply to all videos
    videos: List[Dict[str, Any]]  # Individual video updates (id, episode, new_name, etc.)

class M3U8DownloadRequest(BaseModel):
    """Request model for M3U8 video download"""
    url: str
    start_time: str  # Format: HH:MM:SS
    end_time: str    # Format: HH:MM:SS
    filename: str | None = None  # Optional custom filename
    use_ytdlp_fallback: bool = False  # Try yt-dlp if ffmpeg fails

class SOCKSDownloadRequest(BaseModel):
    """Request model for SOCKS proxy download"""
    url: str
    filename: str | None = None  # Optional custom filename
    proxy_url: str | None = None  # e.g., socks5h://127.0.0.1:9050
    referer: str | None = None  # Optional referer header

class VideoEditRequest(BaseModel):
    """Request model for video editing (cut/crop)"""
    video_id: int
    operation: str  # 'cut' | 'crop' | 'cut_and_crop'

    # Cut parameters
    start_time: str | None = None  # Format: HH:MM:SS
    end_time: str | None = None    # Format: HH:MM:SS
    cut_method: str = "ffmpeg"  # 'ffmpeg' (default, precise frame cutting) | 'smartcut' (fast, keyframe-based)

    # Crop parameters
    crop_preset: str | None = None  # '9:16' | '16:9' | '1:1' | 'custom'
    crop_width: int | None = None
    crop_height: int | None = None
    crop_x: int | None = None
    crop_y: int | None = None

    # Options
    preserve_faces: bool = True
    output_filename: str | None = None
    output_location: str = "same_folder"  # "same_folder" or "edited_folder"
    copy_other_items: bool = False  # Copy tags and face associations from original video
    quality: str = "balanced"  # "fast" | "balanced" | "high"

def serialize_video(video: Video, faces_map: Dict[int, List] = None) -> Dict[str, Any]:
    """Helper function to serialize a Video object to a dictionary with all fields

    Args:
        video: Video model instance
        faces_map: Optional dict mapping video_id to list of face data

    Returns:
        Dictionary representation of video with all metadata fields
    """
    result = {
        "id": video.id,
        "path": video.path,
        "name": video.name,
        "display_name": video.display_name,
        "description": video.description,
        "category": video.category,
        "subcategory": video.subcategory,
        "relative_path": video.relative_path,
        "size": video.size,
        "modified": video.modified,
        "extension": video.extension,
        "media_type": video.media_type or 'video',  # ✅ ADDED: Include media type for frontend routing
        "thumbnail_url": video.thumbnail_url,
        "thumbnail_generated": video.thumbnail_generated,
        "thumbnail_updated_at": getattr(video, 'thumbnail_updated_at', 0),  # ✅ ADDED for cache-busting (with fallback)
        "duration": video.duration,
        "width": video.width,
        "height": video.height,
        "codec": video.codec,
        "bitrate": video.bitrate,
        "fps": video.fps,
        "fingerprint_generated": video.fingerprint_generated,
        # Enhanced metadata fields
        "series": video.series,
        "season": video.season,
        "episode": video.episode,
        "year": video.year,
        "channel": video.channel,
        "rating": video.rating,
        "favorite": bool(video.favorite) if video.favorite is not None else False,
        "is_final": bool(video.is_final) if video.is_final is not None else False,
        # Relationships
        "tags": [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in video.tags],
        "actors": [{"id": actor.id, "name": actor.name} for actor in video.actors],
    }

    # Add faces if provided
    if faces_map is not None:
        result["faces"] = faces_map.get(video.id, [])
        result["face_count"] = len(faces_map.get(video.id, []))

    return result

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup - Initialize database for the current active root
    from database import init_database
    await init_database()
    await migrate_database()  # Add migration for existing databases

    # Initialize thumbnail database
    global thumbnail_db
    thumbnail_db = ThumbnailDatabase(db_path=Path(config.database_path).parent / "thumbnails.db")
    await thumbnail_db.create_tables()

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
    # Shutdown

app = FastAPI(title="Clipper API", version="0.1.0", lifespan=lifespan)

# Initialize thumbnail database (will be properly initialized in lifespan)
thumbnail_db = None

# Initialize thumbnail database (will be properly initialized in lifespan)
thumbnail_db = None

# Mount static files (frontend) - serve frontend from the same server
from pathlib import Path
frontend_path = Path(__file__).parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

# Mount video directories for local mode (direct file serving)
from local_mode import local_mode
if local_mode.enabled:
    # Mount each category directory from the root directory
    if config.root_directory.exists():
        for category_path in config.root_directory.iterdir():
            if category_path.is_dir() and not category_path.name.startswith('.'):
                category_name = category_path.name
                print(f"🎬 Mounting {category_name} videos from {category_path} at /local-videos/{category_name}")
                app.mount(f"/local-videos/{category_name}", StaticFiles(directory=str(category_path)), name=f"videos_{category_name}")
    else:
        print(f"⚠️ Root directory {config.root_directory} does not exist, skipping local mode mounting")

# CORS middleware for frontend (still needed for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"] + config.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def serve_frontend():
    """Serve the main frontend application"""
    return FileResponse(str(frontend_path / "index.html"))

@app.get("/favicon.ico")
async def favicon():
    """Serve favicon if it exists, otherwise return 204"""
    favicon_path = frontend_path / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(str(favicon_path))
    return Response(status_code=204)

@app.get("/api")
async def api_root():
    """API root endpoint"""
    return {"message": "Clipper API is running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/api/roots")
async def get_roots():
    """Get list of available roots and current active root"""
    return {
        "roots": config.get_roots_list(),
        "current": {
            "path": str(config.current_root_path),
            "layout": config.current_root_layout
        }
    }

async def clear_all_caches():
    """Clear all backend caches when switching roots
    
    This ensures complete state isolation between roots:
    - Database connection (reinitialize in separate function)
    - Thumbnail database cache
    - Face service model cache (InsightFace)
    - Any in-memory state
    """
    global thumbnail_db, face_service
    
    logger.info("Clearing all backend caches for root switch...")
    
    # Clear thumbnail database cache
    try:
        # Close existing connection
        if thumbnail_db:
            # Close any open connections
            if hasattr(thumbnail_db, 'engine'):
                await thumbnail_db.engine.dispose()
        logger.debug("✓ Thumbnail database cache cleared")
    except Exception as e:
        logger.warning(f"Warning clearing thumbnail cache: {e}")
    
    # Clear face service cache (reset InsightFace model)
    try:
        if face_service:
            # Reset the initialized flag so model reloads on next use
            face_service._initialized = False
            face_service.app = None
        logger.debug("✓ Face service model cache cleared")
    except Exception as e:
        logger.warning(f"Warning clearing face service cache: {e}")
    
    # FileScanner and FingerprintService are stateless (instantiated per use)
    # No need to clear them
    
    logger.info("✓ All backend caches cleared")

@app.post("/api/roots/select")
async def select_root(root_name: str):
    """Switch to a different root"""
    try:
        # Clear all caches BEFORE switching
        await clear_all_caches()
        
        config.set_active_root_by_name(root_name)
        
        # Reinitialize database for new root
        from database import init_database
        await init_database()
        
        # Reinitialize thumbnail database
        global thumbnail_db
        thumbnail_db = ThumbnailDatabase(db_path=Path(config.database_path).parent / "thumbnails.db")
        await thumbnail_db.create_tables()
        
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

@app.get("/scan")
async def scan_videos(
    sync_db: bool = True,
    prune_missing: bool = True,
    fast_mode: bool = True,  # Always fast by default - metadata loaded on-demand
    folders: str = None,  # Comma-separated list of folder names to scan
    db: AsyncSession = Depends(get_db),
    response: Response = Response()
) -> Dict[str, Any]:
    """Scan the configured directory for video files (fast mode - filename discovery only)

    Args:
        sync_db: Sync found videos to database
        prune_missing: Remove database entries for deleted files
        fast_mode: Skip thumbnail generation and metadata extraction (always True for instant scanning)
        folders: Comma-separated list of specific folders to scan (e.g., "Movies,TV Shows")
                 If not provided, scans all folders

    Note: Metadata (duration, resolution, codec) is now loaded on-demand via separate endpoints
    """
    import time

    # Set no-cache headers to prevent browser caching
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"

    scan_start = time.time()

    # Parse folder list if provided
    folder_list = None
    if folders:
        folder_list = [f.strip() for f in folders.split(',') if f.strip()]

    # If specific folders requested, scan them individually
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
        # Scan all folders
        result = scanner.scan_directory()
        result['scanned_folders'] = 'all'

    # Sync videos to database
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
    
    # Add media type statistics to scan result - ✅ NEW
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

@app.get("/config")
async def get_config():
    """Get current configuration"""
    return {
        "root_directory": str(config.root_directory),
        "excluded_folders": config.excluded_folders,
        "directory_exists": config.root_directory.exists(),
        "local_mode_enabled": local_mode.enabled
    }

@app.get("/mode")
async def get_mode_info():
    """Get current video access mode information"""
    return {
        "local_mode_enabled": local_mode.enabled
    }

@app.get("/structure")
async def get_folder_structure():
    """Get hierarchical folder structure of all categories"""
    structures = {}
    
    for item in config.root_directory.iterdir():
        if item.is_dir() and not scanner.should_exclude_folder(item.name):
            structures[item.name] = scanner.get_category_structure(item)
            
    return {
        "root_directory": str(config.root_directory),
        "categories": structures,
        "total_categories": len(structures)
    }

@app.get("/subfolders")
async def get_subfolders():
    """Get all unique subfolders across all categories"""
    return {
        "subfolders": scanner.get_all_subfolders(),
        "root_directory": str(config.root_directory)
    }

@app.post("/scan/folder/{folder_name}/scan-only")
async def scan_folder_files_only(
    folder_name: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Lightweight scan for explorer view - scans files and updates counts WITHOUT thumbnail generation
    1. Scans folder for new/changed files
    2. Syncs to database
    3. REMOVES deleted files from database
    4. Updates folder counts
    5. Returns fresh data for explorer
    
    NO thumbnail generation - those will be fetched/generated on demand when viewing
    
    ⚡ OPTIMIZED: Uses bulk operations for 5-10x faster scanning
    """
    import time
    from pathlib import Path
    from sqlalchemy import delete

    folder_path = config.root_directory / folder_name

    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder '{folder_name}' not found")

    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"'{folder_name}' is not a directory")

    if scanner.should_exclude_folder(folder_name):
        raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' is excluded from scanning")

    scan_start = time.time()

    # Step 1: Scan folder for videos
    category_videos = scanner._scan_category(folder_path)
    
    # Build a set of files that currently exist on disk
    disk_files = {video_info['path'] for video_info in category_videos}
    logger.info(f"📁 Found {len(disk_files)} files on disk for folder: {folder_name}")

    # Step 2A: Bulk DELETE videos that no longer exist on disk (much faster than individual deletes)
    # ⚡ OPTIMIZATION: Use single bulk DELETE query instead of loop with individual deletes
    result = await db.execute(
        select(Video.id).where(Video.category == folder_name)
    )
    existing_db_ids = [row[0] for row in result.all()]
    
    videos_deleted = 0
    if existing_db_ids:
        # Get list of IDs to delete in one query
        result_to_delete = await db.execute(
            select(Video.id, Video.path).where(Video.category == folder_name)
        )
        videos_to_delete = result_to_delete.all()
        ids_to_delete = [vid for vid, path in videos_to_delete if path not in disk_files]
        
        if ids_to_delete:
            # Single bulk delete query - 100x faster than loop
            await db.execute(
                delete(Video).where(Video.id.in_(ids_to_delete))
            )
            videos_deleted = len(ids_to_delete)
            logger.info(f"🗑️ Removed {videos_deleted} deleted videos from database (bulk delete)")

    # Step 2B: Sync to database (add new/update modified) - WITHOUT generating thumbnails
    # ⚡ OPTIMIZATION: Batch sync with single commit at end
    service = VideoService(db, thumbnail_db)
    current_time = int(time.time())
    
    # Pre-fetch all existing videos to avoid per-video queries
    existing_result = await db.execute(
        select(Video.path).where(Video.category == folder_name)
    )
    existing_paths = {row[0] for row in existing_result.all()}
    
    # Separate new vs existing for batch processing
    new_videos = [v for v in category_videos if v['path'] not in existing_paths]
    
    # Sync all videos efficiently
    for video_info in category_videos:
        video = await service.sync_video_to_db(video_info, skip_generation=True)
        if video:
            video.thumbnail_updated_at = current_time

    # Single commit for all operations (instead of multiple commits)
    await db.commit()

    scan_duration = time.time() - scan_start

    # Step 3: Update scan status with single upsert-style operation
    # ⚡ OPTIMIZATION: Reduce to single database operation
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
        "thumbnails_generated": 0,  # No thumbnails generated in scan-only mode
        "scan_duration": scan_duration,
        "timestamp": current_time_full
    }

@app.post("/scan/folder/{folder_name}/smart-refresh")
async def smart_refresh_folder(
    folder_name: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Smart refresh for a folder - ONE button that does everything:
    1. Scans folder for new/changed files
    2. Syncs to database
    3. REMOVES deleted files from database
    4. Generates missing thumbnails
    5. Updates thumbnail timestamps for cache busting
    6. Returns fresh data for browser cache update
    """
    import time
    from pathlib import Path

    folder_path = config.root_directory / folder_name

    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder '{folder_name}' not found")

    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"'{folder_name}' is not a directory")

    if scanner.should_exclude_folder(folder_name):
        raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' is excluded from scanning")

    scan_start = time.time()

    # Step 1: Scan folder for videos
    category_videos = scanner._scan_category(folder_path)
    
    # Build a set of files that currently exist on disk
    disk_files = {video_info['path'] for video_info in category_videos}
    logger.info(f"📁 Found {len(disk_files)} files on disk for folder: {folder_name}")

    # Step 2A: Find and DELETE videos that no longer exist on disk
    result = await db.execute(
        select(Video).where(Video.category == folder_name)
    )
    existing_db_videos = result.scalars().all()
    
    videos_deleted = 0
    for db_video in existing_db_videos:
        if db_video.path not in disk_files:
            logger.info(f"🗑️ Deleting video from DB (file not found on disk): {db_video.path}")
            await db.delete(db_video)
            videos_deleted += 1
    
    if videos_deleted > 0:
        await db.commit()
        logger.info(f"🗑️ Removed {videos_deleted} deleted videos from database")

    # Step 2B: Sync to database (add new/update modified)
    service = VideoService(db, thumbnail_db)
    video_ids = []
    current_time = time.time()
    
    for video_info in category_videos:
        video = await service.sync_video_to_db(video_info, skip_generation=True)
        if video:
            # Update thumbnail_updated_at for cache busting on ALL videos
            # This ensures browsers will fetch new thumbnails
            video.thumbnail_updated_at = int(current_time)
            video_ids.append(video.id)

    await db.commit()

    # Step 3: Skipped thumbnail generation for speed (as requested)
    # Thumbnails will be generated on-demand when user views them
    thumbnails_generated = 0
    
    scan_duration = time.time() - scan_start

    scan_duration = time.time() - scan_start

    # Step 4: Update scan status
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


@app.post("/scan/video/single")
async def scan_single_video(
    folder_name: str = Body(...),
    filename: str = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Scan and generate thumbnail for a SINGLE edited video only (not entire folder)
    This is much faster than smart-refresh for after video editing
    """
    import time
    from pathlib import Path

    folder_path = config.root_directory / folder_name
    video_path = folder_path / filename

    if not video_path.exists():
        raise HTTPException(status_code=404, detail=f"Video file not found: {filename}")

    if not video_path.is_file():
        raise HTTPException(status_code=400, detail=f"Path is not a file: {filename}")

    scan_start = time.time()

    try:
        # Get video info using the scanner
        video_info = scanner.get_file_info(video_path)
        if not video_info:
            raise HTTPException(status_code=400, detail=f"Could not read video file: {filename}")

        # Sync this single video to database
        service = VideoService(db, thumbnail_db)
        video = await service.sync_video_to_db(video_info, skip_generation=True)
        
        if not video:
            raise HTTPException(status_code=500, detail="Failed to sync video to database")

        # Generate thumbnail if not already generated
        thumbnails_generated = 0
        if not video.thumbnail_generated:
            try:
                if not video.thumbnail_url:
                    video.thumbnail_url = f"/api/thumbnails/{video.id}"
                
                await thumbnail_db.generate_thumbnail_for_video(video.path, video.id)
                video.thumbnail_generated = 1
                video.thumbnail_updated_at = int(time.time())
                thumbnails_generated = 1
                logger.info(f"🎬 Generated thumbnail for edited video: {video.path}")
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


@app.post("/scan/folder/{folder_name}")
async def scan_folder(
    folder_name: str,
    recursive: bool = True,
    sync_db: bool = True,
    prune_missing: bool = False,
    hierarchical: bool = False,
    parent_category: str = None,
    fast_mode: bool = True,  # Always fast by default - metadata loaded on-demand
    db: AsyncSession = Depends(get_db)
):
    """Scan a specific folder with hierarchical support (fast mode - filename discovery only)

    Note: Metadata (duration, resolution, codec) is now loaded on-demand via separate endpoints
    """
    import time

    folder_path = config.root_directory / folder_name

    if not folder_path.exists():
        raise HTTPException(status_code=404, detail=f"Folder '{folder_name}' not found")

    if not folder_path.is_dir():
        raise HTTPException(status_code=400, detail=f"'{folder_name}' is not a directory")

    if scanner.should_exclude_folder(folder_name):
        raise HTTPException(status_code=400, detail=f"Folder '{folder_name}' is excluded from scanning")

    # Track scan timing
    scan_start = time.time()

    # Choose scanning method
    if hierarchical:
        # New hierarchical scanning: direct videos + subfolders
        scan_result = scanner.scan_folder_hierarchical(folder_path, parent_category)
        category_videos = scan_result['direct_videos']
        result = scan_result
        result['scan_type'] = 'hierarchical'
        result['scan_duration'] = time.time() - scan_start
    else:
        # Legacy scanning methods
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
        # Fast mode - skip metadata extraction during scan
        service = VideoService(db, thumbnail_db if not fast_mode else None)
        for video_info in category_videos:
            await service.sync_video_to_db(video_info, skip_generation=fast_mode)
        result["synced_to_db"] = True
        result["fast_mode"] = fast_mode

        if prune_missing:
            # Only prune missing files from this specific category
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

    # Update scan status in database
    scan_status_result = await db.execute(
        select(FolderScanStatus).where(FolderScanStatus.folder_name == folder_name)
    )
    scan_status = scan_status_result.scalar_one_or_none()

    # Get timestamps and counts based on scan type
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

    # If hierarchical, update scan status for subfolders
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

@app.get("/scan/status")
async def get_scan_status(db: AsyncSession = Depends(get_db)):
    """Get scan status for all folders"""
    # Get all physical folders
    physical_folders = []
    for item in config.root_directory.iterdir():
        if item.is_dir() and not scanner.should_exclude_folder(item.name):
            physical_folders.append(item.name)

    # Get scan status from database
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

@app.post("/api/maintenance/fix-media-types")
async def fix_media_types():
    """Fix media_type for existing database records - ✅ NEW
    
    This endpoint corrects records that were created before media_type detection was implemented.
    It re-scans all existing Video records and updates their media_type based on file extension.
    
    Returns:
        Statistics on how many records were fixed
    """
    from database import fix_existing_media_types
    
    logger.info("🔧 Starting media type fix process...")
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

@app.post("/api/maintenance/mark-folder-as-images")
async def mark_folder_as_images(folder_path: str = None, category: str = None, subcategory: str = None, db: AsyncSession = Depends(get_db)):
    """Mark all files in a folder as images - ✅ NEW
    
    Can use either:
    - folder_path: absolute path (e.g., '/media/rpatel/1TBSSD/MTAGS/00WEBP')
    - category + subcategory: database category/subcategory
    """
    from sqlalchemy import update
    
    try:
        if folder_path:
            # Update by absolute path
            result = await db.execute(
                update(Video)
                .where(Video.path.like(f"{folder_path}%"))
                .values(media_type='image')
            )
        elif category:
            # Update by category/subcategory
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
        
        logger.info(f"✅ Marked {rows_updated} files as images")
        return {
            "success": True,
            "files_updated": rows_updated,
            "message": f"Marked {rows_updated} files as images"
        }
    
    except Exception as e:
        logger.error(f"❌ Error marking folder as images: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/videos/{category}")
async def get_videos_by_category(category: str, media_type: str = None, db: AsyncSession = Depends(get_db)):
    """Get all videos in a specific category with tags and faces from database
    
    Query Parameters:
        media_type: Filter by 'video' or 'image' (optional)
    """
    service = VideoService(db, thumbnail_db)
    if category == "_all":
        videos = await service.get_all_videos(media_type=media_type)
    else:
        videos = await service.get_videos_by_category(category, media_type=media_type)

    # Batch load faces for all videos
    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return {
        "videos": [serialize_video(video, faces_map) for video in videos],
        "count": len(videos)
    }

@app.get("/api/videos/page")
async def get_videos_paginated(page: int = 0, size: int = 50, media_type: str = None, db: AsyncSession = Depends(get_db)):
    """Get paginated videos for collection view
    
    Query Parameters:
        page: Page number (0-indexed), default 0
        size: Items per page, default 50
        media_type: Filter by 'video' or 'image' (optional)
    
    Returns:
        videos: Array of video objects for this page
        total: Total number of videos available
        page: Current page number
        size: Items per page
        total_pages: Total number of pages
    """
    service = VideoService(db, thumbnail_db)
    
    # Get all videos (with optional media_type filter)
    all_videos = await service.get_all_videos(media_type=media_type)
    total = len(all_videos)
    
    # Calculate pagination
    offset = page * size
    paginated_videos = all_videos[offset:offset + size]
    total_pages = (total + size - 1) // size  # Ceiling division
    
    # Batch load faces for paginated videos
    video_ids = [video.id for video in paginated_videos]
    faces_map = await service.get_faces_for_videos(video_ids)
    
    return {
        "videos": [serialize_video(video, faces_map) for video in paginated_videos],
        "total": total,
        "page": page,
        "size": size,
        "total_pages": total_pages
    }

@app.get("/videos/{category}/{subcategory}")
async def get_videos_by_subcategory(category: str, subcategory: str, media_type: str = None, db: AsyncSession = Depends(get_db)):
    """Get videos in a specific category and subcategory with faces
    
    Query Parameters:
        media_type: Filter by 'video' or 'image' (optional)
    """
    service = VideoService(db, thumbnail_db)
    videos = await service.get_videos_by_subcategory(category, subcategory, media_type=media_type)

    # Batch load faces for all videos
    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return {
        "videos": [serialize_video(video, faces_map) for video in videos],
        "count": len(videos)
    }

@app.get("/api/videos/{video_id}")
async def get_video_by_id(video_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single video by ID with all metadata (tags, actors, faces)"""
    try:
        # Get video from database
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        # Load relationships
        await db.refresh(video, ["tags", "actors"])

        # Get faces for this video
        service = VideoService(db, thumbnail_db)
        faces_map = await service.get_faces_for_videos([video_id])

        return serialize_video(video, faces_map)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching video: {str(e)}")

@app.put("/api/videos/{video_id}")
async def update_video(video_id: int, body: dict, db: AsyncSession = Depends(get_db)):
    """Update video metadata fields (description, scene_description, etc.)"""
    try:
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        # Update allowed fields
        allowed_fields = ['description', 'scene_description', 'series', 'season', 'episode', 'year', 'channel', 'rating', 'favorite', 'is_final']
        for field, value in body.items():
            if field in allowed_fields and hasattr(video, field):
                if field == 'favorite' or field == 'is_final':
                    setattr(video, field, 1 if value else 0)
                else:
                    setattr(video, field, value)

        await db.commit()
        await db.refresh(video, ["tags", "actors"])

        # Get faces for this video
        service = VideoService(db, thumbnail_db)
        faces_map = await service.get_faces_for_videos([video_id])

        return {
            "message": "Video updated successfully",
            "video": serialize_video(video, faces_map)
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating video: {str(e)}")

@app.post("/api/videos/{video_id}/hash-rename")
async def hash_rename_video(video_id: int, db: AsyncSession = Depends(get_db)):
    """Rename a single video using SHA1 hash-based naming and set display_name to the hash"""
    import hashlib
    from pathlib import Path
    
    try:
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        video_path = Path(video.path)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")

        # Generate hash-based name
        sha1_hash = hashlib.sha1()
        with open(video_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha1_hash.update(chunk)
        
        hash_str = sha1_hash.hexdigest()
        
        # Extract parts using same logic as zindex
        part1 = hash_str[0:4]                                    # First 4 characters
        part2 = hash_str[4:8]                                    # Next 4 characters
        part3 = hash_str[2] + hash_str[4] + hash_str[6] + hash_str[10]  # Prime positions 3, 5, 7, 11
        part4 = hash_str[10] + hash_str[6] + hash_str[4] + hash_str[2]  # Prime positions 11, 7, 5, 3 reversed
        
        new_name_base = part1 + part2 + part3 + part4
        ext = video_path.suffix
        new_name = f"{new_name_base}{ext}"
        
        # Check if target already exists
        new_path = video_path.parent / new_name
        if new_path.exists() and new_path != video_path:
            raise HTTPException(status_code=409, detail=f"Target name already exists: {new_name}")
        
        # Skip if already has the same name
        if video_path == new_path:
            await db.refresh(video, ["tags", "actors"])
            service = VideoService(db, thumbnail_db)
            faces_map = await service.get_faces_for_videos([video_id])
            return {
                "message": "Video already has this hash name",
                "new_name": new_name,
                "video": serialize_video(video, faces_map)
            }
        
        # Rename file on filesystem
        video_path.rename(new_path)
        
        # Update database with new path and thumbnail hash
        await thumbnail_db.update_path_hash(str(video_path), str(new_path))
        
        video.path = str(new_path)
        video.name = new_name
        video.display_name = new_name_base  # Set display_name to the hash
        video.extension = ext.lower()
        video.thumbnail_url = f"/api/thumbnails/{video.id}"
        
        await db.commit()
        await db.refresh(video, ["tags", "actors"])
        
        # Get faces for this video
        service = VideoService(db, thumbnail_db)
        faces_map = await service.get_faces_for_videos([video_id])
        
        logger.info(f"✓ Hash-renamed video {video_id}: {video.name}")
        
        return {
            "message": "Video renamed successfully",
            "new_name": new_name,
            "video": serialize_video(video, faces_map)
        }
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error hash-renaming video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error renaming video: {str(e)}")

@app.get("/api/metadata/suggestions")
async def get_metadata_suggestions(field: str, db: AsyncSession = Depends(get_db)):
    """
    Get distinct values for metadata fields with usage counts
    Supports: channel, series, year
    Returns: [{"value": "HBO", "count": 12}, ...]
    """
    try:
        # Validate field parameter
        valid_fields = ["channel", "series", "year"]
        if field not in valid_fields:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid field. Must be one of: {', '.join(valid_fields)}"
            )

        # Get the field column from Video model
        field_column = getattr(Video, field)

        # Query distinct values with counts, excluding NULL and empty strings
        result = await db.execute(
            select(field_column, func.count(Video.id).label('count'))
            .where(field_column.isnot(None))
            .where(field_column != '')
            .group_by(field_column)
            .order_by(desc('count'))
        )

        # Format results
        suggestions = [
            {"value": row[0], "count": row[1]}
            for row in result.all()
        ]

        logger.info(f"📊 Metadata suggestions for '{field}': {len(suggestions)} unique values")
        return {
            "field": field,
            "suggestions": suggestions,
            "total": len(suggestions)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting metadata suggestions for {field}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting suggestions: {str(e)}")

@app.get("/folder-structure")
async def get_db_folder_structure(category: str = None, db: AsyncSession = Depends(get_db)):
    """Get hierarchical folder structure from database"""
    service = VideoService(db, thumbnail_db)
    structure = await service.get_folder_structure(category)
    
    return {
        "structure": structure,
        "category_filter": category
    }

@app.get("/folder-groups")
async def get_folder_groups(db: AsyncSession = Depends(get_db)):
    """Get all folder groups configuration sorted by order
    
    Returns all folder groups from database, sorted by order field.
    Users manage all folder organization through custom groups.
    """
    import json
    from sqlalchemy import asc
    
    # Load all groups from database, sorted by order
    result = await db.execute(select(FolderGroup).order_by(asc(FolderGroup.order)))
    group_rows = result.scalars().all()
    
    groups = []
    for row in group_rows:
        try:
            folders = json.loads(row.folders) if isinstance(row.folders, str) else row.folders
        except:
            folders = []
        
        groups.append({
            "id": row.id,
            "name": row.name,
            "folders": folders,
            "icon": row.icon,
            "color": row.color,
            "is_system": bool(row.is_system),
            "order": row.order
        })
    
    return {
        "groups": groups
    }

@app.post("/folder-groups")
async def create_folder_group(
    group_data: dict = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """Create a new custom folder group
    
    Request body:
    {
        "name": "Group Name",
        "folders": ["FOLDER1", "FOLDER2"],
        "icon": "📁",
        "color": "#3B82F6"
    }
    """
    import json
    import uuid
    
    # Validate input
    if not group_data.get('name'):
        raise HTTPException(status_code=400, detail="Group name is required")
    
    if not isinstance(group_data.get('folders'), list) or len(group_data.get('folders', [])) == 0:
        raise HTTPException(status_code=400, detail="Folders must be a non-empty list")
    
    # Create new group
    group_id = str(uuid.uuid4())
    
    # Get highest existing order to add new group at end
    from sqlalchemy import func
    result = await db.execute(select(func.max(FolderGroup.order)))
    max_order = result.scalar() or 0
    
    new_group = FolderGroup(
        id=group_id,
        name=group_data.get('name'),
        folders=json.dumps(group_data.get('folders')),  # Store as JSON
        icon=group_data.get('icon', '📁'),
        color=group_data.get('color', '#f3f4f6'),
        is_system=0,
        order=max_order + 1
    )
    
    db.add(new_group)
    await db.commit()
    await db.refresh(new_group)
    
    return {
        "success": True,
        "group": {
            "id": group_id,
            "name": new_group.name,
            "folders": json.loads(new_group.folders),
            "icon": new_group.icon,
            "color": new_group.color,
            "is_system": False,
            "order": new_group.order
        },
        "message": "Custom folder group created successfully"
    }

@app.put("/folder-groups/{group_id}")
async def update_folder_group(
    group_id: str,
    group_data: dict = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """Update an existing custom folder group
    
    Path param: group_id - UUID of group to update
    
    Request body:
    {
        "name": "New Name",
        "folders": ["FOLDER1", "FOLDER2"],
        "icon": "⭐",
        "color": "#FFD700"
    }
    """
    import json
    import time
    
    # Validate input
    if not group_data.get('name'):
        raise HTTPException(status_code=400, detail="Group name is required")
    
    if not isinstance(group_data.get('folders'), list) or len(group_data.get('folders', [])) == 0:
        raise HTTPException(status_code=400, detail="Folders must be a non-empty list")
    
    # Find and update group
    result = await db.execute(
        select(FolderGroup).filter(FolderGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Update fields
    group.name = group_data.get('name')
    group.folders = json.dumps(group_data.get('folders'))
    group.icon = group_data.get('icon', '📁')
    group.color = group_data.get('color', '#f3f4f6')
    group.updated_at = time.time()
    
    await db.commit()
    await db.refresh(group)
    
    return {
        "success": True,
        "group": {
            "id": group.id,
            "name": group.name,
            "folders": json.loads(group.folders),
            "icon": group.icon,
            "color": group.color,
            "is_system": False
        },
        "message": "Folder group updated successfully"
    }

@app.delete("/folder-groups/{group_id}")
async def delete_folder_group(
    group_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a custom folder group
    
    Path param: group_id - UUID of group to delete
    Note: Cannot delete system folders
    """
    # Find and delete group
    result = await db.execute(
        select(FolderGroup).filter(FolderGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    await db.delete(group)
    await db.commit()
    
    return {
        "success": True,
        "message": f"Folder group '{group.name}' deleted successfully"
    }

@app.patch("/folder-groups/{group_id}/reorder")
async def reorder_groups(
    group_id: str,
    reorder_data: dict = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """Change group order (move up or down)
    
    Path param: group_id - UUID of group to move
    
    Request body:
    {
        "direction": "up" or "down"
    }
    """
    from sqlalchemy import asc, desc
    
    # Get the group to move
    result = await db.execute(select(FolderGroup).filter(FolderGroup.id == group_id))
    group = result.scalar_one_or_none()
    
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    direction = reorder_data.get('direction', '').lower()
    if direction not in ['up', 'down']:
        raise HTTPException(status_code=400, detail="Direction must be 'up' or 'down'")
    
    # Get all groups sorted by order
    result = await db.execute(select(FolderGroup).order_by(asc(FolderGroup.order)))
    all_groups = result.scalars().all()
    
    # Find current position
    current_index = next((i for i, g in enumerate(all_groups) if g.id == group_id), None)
    if current_index is None:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Check bounds
    if direction == 'up' and current_index == 0:
        return {"success": True, "message": "Already at top"}
    if direction == 'down' and current_index == len(all_groups) - 1:
        return {"success": True, "message": "Already at bottom"}
    
    # Swap orders with adjacent group
    if direction == 'up':
        other_group = all_groups[current_index - 1]
        group.order, other_group.order = other_group.order, group.order
    else:  # down
        other_group = all_groups[current_index + 1]
        group.order, other_group.order = other_group.order, group.order
    
    await db.commit()
    
    return {
        "success": True,
        "message": f"Group moved {direction}"
    }

def get_media_type_header(file_path: Path) -> str:
    """Get correct Content-Type header for file"""
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


@app.get("/stream/{category}/{video_path:path}")
async def stream_video(category: str, video_path: str, request: Request):
    """Stream a video or image file with optimized byte-range support for instant seeking"""
    # Construct full path
    if category == "_root":
        full_path = config.root_directory / video_path
    else:
        full_path = config.root_directory / category / video_path

    # SECURITY: Resolve path and validate it's within root directory
    try:
        full_path = full_path.resolve()
        root_resolved = config.root_directory.resolve()

        # Ensure the resolved path is within the root directory
        if not str(full_path).startswith(str(root_resolved)):
            raise HTTPException(status_code=403, detail="Access denied: Path traversal detected")
    except (ValueError, OSError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid path: {str(e)}")

    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    # Allow both video and image files ✅ UPDATED: Support images marked as media_type='image'
    if not (scanner.is_video_file(full_path) or scanner.is_image_file(full_path)):
        raise HTTPException(status_code=400, detail="File is not a video or image")

    # Get file size
    file_size = full_path.stat().st_size

    # Determine correct Content-Type ✅ UPDATED: Dynamic media type
    content_type = get_media_type_header(full_path)

    # Parse Range header for byte-range requests (essential for seeking)
    range_header = request.headers.get("range")

    if range_header:
        # Parse range header (format: "bytes=start-end")
        range_match = range_header.replace("bytes=", "").split("-")
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if len(range_match) > 1 and range_match[1] else file_size - 1

        # Validate range
        if start >= file_size or end >= file_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")

        chunk_size = end - start + 1

        # Read the requested chunk
        def file_chunk_iterator():
            with open(full_path, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                while remaining > 0:
                    read_size = min(8192 * 64, remaining)  # 512KB chunks for smooth streaming
                    data = f.read(read_size)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": content_type,  # ✅ UPDATED: Use dynamic content type
            "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
        }

        return StreamingResponse(
            file_chunk_iterator(),
            status_code=206,  # Partial Content
            headers=headers
        )

    # No range request - serve full file with optimized headers
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(file_size),
        "Cache-Control": "public, max-age=3600",
    }

    return FileResponse(
        path=str(full_path),
        media_type=content_type,  # ✅ UPDATED: Use dynamic content type
        headers=headers
    )

# Tag and metadata endpoints
@app.post("/videos/{video_id}/tags")
async def add_tag_to_video(
    video_id: int, 
    tag_name: str, 
    db: AsyncSession = Depends(get_db)
):
    """Add a tag to a video"""
    service = VideoService(db, thumbnail_db)
    tag = await service.add_tag_to_video(video_id, tag_name)
    return {"message": f"Tag '{tag.name}' added to video", "tag": {"id": tag.id, "name": tag.name, "color": tag.color}}

@app.delete("/videos/{video_id}/tags/{tag_id}")
async def remove_tag_from_video(
    video_id: int, 
    tag_id: int, 
    db: AsyncSession = Depends(get_db)
):
    """Remove a tag from a video"""
    service = VideoService(db, thumbnail_db)
    await service.remove_tag_from_video(video_id, tag_id)
    return {"message": "Tag removed from video"}

@app.get("/tags")
async def get_all_tags(db: AsyncSession = Depends(get_db)):
    """Get all available tags"""
    service = VideoService(db, thumbnail_db)
    tags = await service.get_all_tags()
    return [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in tags]

# NOTE: /tags/unused routes must come BEFORE /tags/{tag_id} to avoid route conflicts
@app.get("/tags/unused")
async def get_unused_tags(db: AsyncSession = Depends(get_db)):
    """Get all tags that are not assigned to any videos"""
    service = VideoService(db, thumbnail_db)
    unused_tags = await service.get_unused_tags()
    return [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in unused_tags]

@app.delete("/tags/unused")
async def delete_unused_tags(db: AsyncSession = Depends(get_db)):
    """Delete all tags that are not assigned to any videos"""
    service = VideoService(db, thumbnail_db)
    count = await service.delete_unused_tags()
    return {"message": f"Deleted {count} unused tag(s)", "deleted_count": count}

@app.delete("/tags/{tag_id}")
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a tag completely (removes from all videos)"""
    service = VideoService(db, thumbnail_db)
    deleted = await service.delete_tag(tag_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="Tag not found")

    return {"message": "Tag deleted successfully", "tag_id": tag_id}

@app.put("/tags/{tag_id}")
async def rename_tag(tag_id: int, new_name: str, db: AsyncSession = Depends(get_db)):
    """Rename a tag (affects all videos with this tag)"""
    service = VideoService(db, thumbnail_db)

    try:
        updated_tag = await service.rename_tag(tag_id, new_name)
        return {
            "message": "Tag renamed successfully",
            "tag": {
                "id": updated_tag.id,
                "name": updated_tag.name,
                "color": updated_tag.color
            }
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/tags/regenerate-colors")
async def regenerate_tag_colors(db: AsyncSession = Depends(get_db)):
    """Regenerate colors for all existing tags based on their names"""
    from color_utils import generate_vibrant_color

    try:
        # Get all tags
        result = await db.execute(select(Tag))
        tags = result.scalars().all()

        updated_count = 0
        for tag in tags:
            # Generate new color from tag name
            new_color = generate_vibrant_color(tag.name)
            tag.color = new_color
            updated_count += 1

        await db.commit()

        return {
            "message": f"Regenerated colors for {updated_count} tag(s)",
            "updated_count": updated_count
        }

    except Exception as e:
        await db.rollback()
        logger.error(f"Error regenerating tag colors: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to regenerate colors: {str(e)}")

# ==================== ACTOR ENDPOINTS ====================

@app.get("/actors/search")
async def search_actors(
    q: str = "",
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """Search actors by name (autocomplete)"""
    from sqlalchemy import func
    
    # Build search query - case-insensitive partial match
    if q.strip():
        stmt = select(Actor).where(
            func.lower(Actor.name).contains(q.lower())
        ).order_by(Actor.name).limit(limit)
    else:
        # If no query, return most used actors
        stmt = select(Actor).order_by(
            desc(Actor.video_count), Actor.name
        ).limit(limit)
    
    result = await db.execute(stmt)
    actors = result.scalars().all()
    
    return [{
        "id": actor.id,
        "name": actor.name,
        "notes": actor.notes,
        "video_count": actor.video_count
    } for actor in actors]

@app.get("/actors")
async def get_all_actors(
    limit: int = 100,
    offset: int = 0,
    sort_by: str = "name",
    db: AsyncSession = Depends(get_db)
):
    """Get all actors with their video counts"""
    from sqlalchemy.orm import selectinload
    from sqlalchemy import func, desc

    # Build query with video count
    if sort_by == "video_count":
        stmt = select(Actor).order_by(desc(Actor.video_count))
    elif sort_by == "created_at":
        stmt = select(Actor).order_by(desc(Actor.created_at))
    else:  # Default to name
        stmt = select(Actor).order_by(Actor.name)

    stmt = stmt.limit(limit).offset(offset)

    result = await db.execute(stmt)
    actors = result.scalars().all()

    return [{
        "id": actor.id,
        "name": actor.name,
        "notes": actor.notes,
        "video_count": actor.video_count,
        "created_at": actor.created_at
    } for actor in actors]

@app.post("/actors")
async def create_actor(
    body: dict,
    db: AsyncSession = Depends(get_db)
):
    """Create a new actor"""
    import time
    
    actor_name = body.get('name', '').strip()
    
    if not actor_name:
        raise HTTPException(status_code=400, detail="Actor name is required")
    
    if len(actor_name) < 2:
        raise HTTPException(status_code=400, detail="Actor name must be at least 2 characters")
    
    if len(actor_name) > 100:
        raise HTTPException(status_code=400, detail="Actor name must be less than 100 characters")
    
    # Convert to title case for consistency
    actor_name = actor_name.title()
    
    # Check if actor already exists (case-insensitive)
    result = await db.execute(
        select(Actor).where(func.lower(Actor.name) == func.lower(actor_name))
    )
    existing_actor = result.scalar_one_or_none()
    
    if existing_actor:
        # Return existing actor
        return {
            "id": existing_actor.id,
            "name": existing_actor.name,
            "notes": existing_actor.notes,
            "video_count": existing_actor.video_count,
            "created_at": existing_actor.created_at
        }
    
    # Create new actor
    new_actor = Actor(
        name=actor_name,
        notes=body.get('notes', ''),
        video_count=0,
        created_at=time.time()
    )
    
    db.add(new_actor)
    await db.commit()
    await db.refresh(new_actor)
    
    return {
        "id": new_actor.id,
        "name": new_actor.name,
        "notes": new_actor.notes,
        "video_count": new_actor.video_count,
        "created_at": new_actor.created_at
    }

@app.post("/videos/{video_id}/actors")
async def add_actor_to_video(
    video_id: int,
    body: AddActorRequest,
    db: AsyncSession = Depends(get_db)
):
    """Add an actor to a video (creates actor if doesn't exist)"""
    from sqlalchemy.orm import selectinload
    import time

    # Validate and normalize actor name (proper casing)
    actor_name = body.actor_name.strip()
    if len(actor_name) < 2:
        raise HTTPException(status_code=400, detail="Actor name must be at least 2 characters")
    if len(actor_name) > 100:
        raise HTTPException(status_code=400, detail="Actor name must be less than 100 characters")

    # Convert to title case for consistency
    actor_name = actor_name.title()

    # Get video with actors
    result = await db.execute(
        select(Video).options(selectinload(Video.actors)).where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check if actor already exists (case-insensitive)
    actor_result = await db.execute(
        select(Actor).where(func.lower(Actor.name) == actor_name.lower())
    )
    actor = actor_result.scalar_one_or_none()

    # Create actor if doesn't exist
    if not actor:
        actor = Actor(
            name=actor_name,
            video_count=0,
            created_at=time.time()
        )
        db.add(actor)
        await db.flush()  # Get the actor ID

    # Check if already assigned
    if actor in video.actors:
        raise HTTPException(status_code=400, detail="Actor already assigned to this video")

    # Add actor to video
    video.actors.append(actor)

    # Update actor video count (increment by 1 since we're adding one video)
    actor.video_count += 1

    await db.commit()
    await db.refresh(actor)

    return {
        "message": "Actor added successfully",
        "actor": {
            "id": actor.id,
            "name": actor.name
        }
    }

@app.delete("/videos/{video_id}/actors/{actor_id}")
async def remove_actor_from_video(
    video_id: int,
    actor_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Remove an actor from a video"""
    from sqlalchemy.orm import selectinload

    # Get video with actors
    result = await db.execute(
        select(Video).options(selectinload(Video.actors)).where(Video.id == video_id)
    )
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Get actor
    actor_result = await db.execute(select(Actor).where(Actor.id == actor_id))
    actor = actor_result.scalar_one_or_none()

    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    # Remove actor from video
    if actor in video.actors:
        video.actors.remove(actor)

        # Update actor video count (decrement by 1 since we're removing one video)
        actor.video_count -= 1

        await db.commit()

        return {
            "message": "Actor removed successfully",
            "video_id": video_id,
            "actor_id": actor_id
        }
    else:
        raise HTTPException(status_code=404, detail="Actor not assigned to this video")

@app.delete("/actors/{actor_id}")
async def delete_actor(actor_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an actor (only if not assigned to any videos)"""
    actor_result = await db.execute(select(Actor).where(Actor.id == actor_id))
    actor = actor_result.scalar_one_or_none()

    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    if actor.video_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete actor: assigned to {actor.video_count} video(s)"
        )

    await db.delete(actor)
    await db.commit()

    return {"message": "Actor deleted successfully", "actor_id": actor_id}

@app.put("/actors/{actor_id}")
async def update_actor(
    actor_id: int,
    body: UpdateActorRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update actor details (name, notes)"""
    from sqlalchemy import func

    actor_result = await db.execute(select(Actor).where(Actor.id == actor_id))
    actor = actor_result.scalar_one_or_none()

    if not actor:
        raise HTTPException(status_code=404, detail="Actor not found")

    # Update name if provided
    if body.name:
        new_name = body.name.strip().title()

        # Check for duplicate name (case-insensitive, excluding current actor)
        duplicate_check = await db.execute(
            select(Actor).where(
                func.lower(Actor.name) == new_name.lower(),
                Actor.id != actor_id
            )
        )
        if duplicate_check.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Actor with this name already exists")

        actor.name = new_name

    # Update notes if provided
    if body.notes is not None:
        actor.notes = body.notes

    await db.commit()
    await db.refresh(actor)

    return {
        "message": "Actor updated successfully",
        "actor": {
            "id": actor.id,
            "name": actor.name,
            "notes": actor.notes,
            "video_count": actor.video_count
        }
    }

@app.get("/search")
async def search_videos(
    q: str = "",
    tags: str = "",
    category: str = "",
    subcategory: str = "",
    duration_min: int = None,
    duration_max: int = None,
    db: AsyncSession = Depends(get_db)
):
    """Search videos by query, tags, category, subcategory, or duration range with faces"""
    service = VideoService(db, thumbnail_db)
    tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()] if tags else []

    videos = await service.search_videos(
        query=q, 
        tags=tag_list, 
        category=category, 
        subcategory=subcategory,
        duration_min=duration_min,
        duration_max=duration_max
    )

    # Batch load faces for all videos
    video_ids = [video.id for video in videos]
    faces_map = await service.get_faces_for_videos(video_ids)

    return [serialize_video(video, faces_map) for video in videos]


@app.get("/api/thumbnails/{video_id}")
async def get_thumbnail(video_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Get thumbnail for a video from database with aggressive browser caching"""
    # Get video from database
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Get thumbnail data from thumbnail database
    thumbnail_data = await thumbnail_db.get_thumbnail_data(video.path)
    if not thumbnail_data:
        # Try to generate thumbnail if it doesn't exist
        success = await thumbnail_db.generate_and_store_thumbnail(video.path)
        if success:
            thumbnail_data = await thumbnail_db.get_thumbnail_data(video.path)
            # Update video status
            video.thumbnail_generated = 1
            await db.commit()
        else:
            # Mark as failed
            video.thumbnail_generated = -1
            await db.commit()
            raise HTTPException(status_code=404, detail="Thumbnail not available")

    from fastapi.responses import Response
    import hashlib

    # Generate ETag based on video modified time for cache validation
    # This allows browser to cache but validate freshness
    etag = f'"{video_id}-{int(video.modified)}"'

    # Check If-None-Match header for conditional request
    if_none_match = request.headers.get("if-none-match")
    if if_none_match == etag:
        # Client has current version - return 304 Not Modified
        return Response(status_code=304, headers={"ETag": etag})

    # Caching headers - cache for 1 hour with revalidation
    # The ?v= query parameter in frontend will bust cache when thumbnail updates
    headers = {
        "Cache-Control": "public, max-age=3600",  # 1 hour
        "ETag": etag,
        "Last-Modified": str(video.modified),
    }

    return Response(content=thumbnail_data, media_type="image/jpeg", headers=headers)

@app.post("/api/thumbnails/generate/{video_id}")
async def generate_thumbnail(video_id: int, request: Request, db: AsyncSession = Depends(get_db)):
    """Generate thumbnail for a specific video"""
    # Get video from database
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check for custom time in request body
    timestamp = "00:00:01"  # default
    try:
        body = await request.json()
        if "time" in body and isinstance(body["time"], (int, float)):
            # Convert seconds to timestamp format
            seconds = int(body["time"])
            hours = seconds // 3600
            minutes = (seconds % 3600) // 60
            secs = seconds % 60
            timestamp = f"{hours:02d}:{minutes:02d}:{secs:02d}"
    except:
        pass  # Use default timestamp if parsing fails

    # Generate thumbnail - force regeneration if custom time is provided
    force_regenerate = timestamp != "00:00:01"
    success = await thumbnail_db.generate_and_store_thumbnail(video.path, timestamp, force_regenerate)

    if success:
        video.thumbnail_generated = 1
        await db.commit()
        return {"message": "Thumbnail generated successfully", "video_id": video_id, "timestamp": timestamp}
    else:
        video.thumbnail_generated = -1
        await db.commit()
        return {"message": "Failed to generate thumbnail", "video_id": video_id, "error": True}

@app.post("/api/thumbnails/preview/{video_id}")
async def generate_thumbnail_preview(video_id: int, time: int, db: AsyncSession = Depends(get_db)):
    """Generate temporary thumbnail preview at specified time"""
    # Get video from database
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if not thumbnail_db.ffmpeg_available:
        raise HTTPException(status_code=503, detail="FFmpeg not available")

    # Convert seconds to timestamp format
    hours = time // 3600
    minutes = (time % 3600) // 60
    secs = time % 60
    timestamp = f"{hours:02d}:{minutes:02d}:{secs:02d}"

    # Generate temporary preview (don't store in database)
    import tempfile
    import subprocess
    from pathlib import Path

    try:
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
            temp_path = temp_file.name

        # Use same optimized FFmpeg parameters as main thumbnail generation
        cmd = [
            'ffmpeg',
            '-ss', timestamp,  # Seek before input for faster seeking
            '-i', str(video.path),
            '-vframes', '1',
            '-vf', 'scale=320:-1',  # Preserve aspect ratio (320px width, auto height)
            '-q:v', '2',
            '-f', 'mjpeg',
            '-threads', '1',
            '-loglevel', 'error',
            '-y',
            temp_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=8  # Reduced timeout for previews
        )

        if result.returncode == 0 and Path(temp_path).exists():
            # Read the generated image
            with open(temp_path, 'rb') as f:
                image_data = f.read()

            # Clean up temp file
            Path(temp_path).unlink()

            # Return the image with no-cache headers
            from fastapi.responses import Response
            headers = {
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0"
            }
            return Response(content=image_data, media_type="image/jpeg", headers=headers)
        else:
            # Clean up temp file if it exists
            if Path(temp_path).exists():
                Path(temp_path).unlink()
            raise HTTPException(status_code=500, detail="Failed to generate preview")

    except Exception as e:
        # Clean up temp file if it exists
        if 'temp_path' in locals() and Path(temp_path).exists():
            Path(temp_path).unlink()
        raise HTTPException(status_code=500, detail=f"Preview generation failed: {str(e)}")

@app.post("/thumbnails/cleanup")
async def cleanup_thumbnails(db: AsyncSession = Depends(get_db)):
    """Clean up orphaned thumbnails from database"""
    # Get all video paths from database
    result = await db.execute(select(Video.path))
    valid_paths = set(result.scalars().all())

    # Clean up orphaned thumbnails from database
    removed_db = await thumbnail_db.cleanup_orphaned_thumbnails(valid_paths)

    return {
        "message": f"Cleaned up {removed_db} database thumbnails",
        "removed_database": removed_db,
        "total_removed": removed_db
    }

@app.post("/videos/{video_id}/move")
async def move_video(
    video_id: int,
    body: MoveVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Move a video to another category/subcategory (filesystem + DB update)."""
    service = VideoService(db, thumbnail_db)
    try:
        moved = await service.move_video(
            video_id=video_id,
            target_category=body.target_category,
            root_directory=config.root_directory,
            target_subcategory=body.target_subcategory,
            new_name=body.new_name
        )
    except FileExistsError:
        raise HTTPException(status_code=409, detail="Destination already exists")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))

    if not moved:
        raise HTTPException(status_code=404, detail="Video not found or source file missing")

    return {
        "message": "Video moved",
        "video": {
            "id": moved.id,
            "path": moved.path,
            "name": moved.name,
            "category": moved.category,
            "subcategory": moved.subcategory,
            "relative_path": moved.relative_path,
            "size": moved.size,
            "modified": moved.modified,
            "extension": moved.extension,
            "thumbnail_url": moved.thumbnail_url,
            "thumbnail_generated": moved.thumbnail_generated,
            "tags": [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in moved.tags],
            "actors": [{"id": actor.id, "name": actor.name} for actor in moved.actors]
        }
    }

@app.post("/videos/{video_id}/rename")
async def rename_video(
    video_id: int,
    body: RenameVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Rename a video file (filesystem + DB update)."""
    service = VideoService(db, thumbnail_db)

    # Get the current video to maintain its current location
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        moved = await service.move_video(
            video_id=video_id,
            target_category=video.category,
            root_directory=config.root_directory,
            target_subcategory=video.subcategory,
            new_name=body.new_name
        )
    except FileExistsError:
        raise HTTPException(status_code=409, detail="A file with this name already exists")
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))

    if not moved:
        raise HTTPException(status_code=404, detail="Video not found or source file missing")

    return {
        "message": "Video renamed successfully",
        "video": {
            "id": moved.id,
            "path": moved.path,
            "name": moved.name,
            "category": moved.category,
            "subcategory": moved.subcategory,
            "relative_path": moved.relative_path,
            "size": moved.size,
            "modified": moved.modified,
            "extension": moved.extension,
            "thumbnail_url": moved.thumbnail_url,
            "thumbnail_generated": moved.thumbnail_generated,
            "tags": [{"id": tag.id, "name": tag.name, "color": tag.color} for tag in moved.tags],
            "actors": [{"id": actor.id, "name": actor.name} for actor in moved.actors]
        }
    }

@app.post("/api/folders/rename")
async def rename_folder(
    body: RenameFolderRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Rename a top-level category folder and update all related database records.

    Only supports top-level directories within the root folder.
    Subdirectories are not supported and will be ignored.

    This endpoint:
    - Renames the folder on the filesystem
    - Updates all video records (path, category, relative_path)
    - Updates thumbnail path hashes
    - Updates categories table
    - Updates folder_scan_status table

    All existing mappings (tags, face-ids, fingerprints) continue to work
    because they are linked via video_id, which doesn't change.
    """
    service = VideoService(db, thumbnail_db)

    # Construct folder path from old_name (top-level folder in root directory)
    folder_path_obj = config.root_directory / body.old_name

    # Validate folder exists
    if not folder_path_obj.exists() or not folder_path_obj.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Folder '{body.old_name}' not found"
        )

    # Validate folder path is within root directory
    root_resolved = config.root_directory.resolve()
    folder_resolved = folder_path_obj.resolve()

    if not str(folder_resolved).startswith(str(root_resolved)):
        raise HTTPException(
            status_code=403,
            detail="Folder path must be within root directory"
        )

    # Check if target folder already exists
    new_folder_path = config.root_directory / body.new_name
    if new_folder_path.exists():
        raise HTTPException(
            status_code=400,
            detail=f"A folder named '{body.new_name}' already exists"
        )

    try:
        result = await service.rename_folder(
            old_folder_path=folder_path_obj,
            new_folder_name=body.new_name,
            root_directory=config.root_directory
        )
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))

@app.post("/api/folders/bulk-hash-rename")
async def bulk_hash_rename_videos(
    body: BulkHashRenameRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Bulk rename all videos in a folder using hash-based naming (zindex).
    
    This endpoint:
    1. Gets all videos in the specified folder
    2. Renames each video file using SHA1 hash-based naming
    3. Updates all database records (paths, thumbnails, faces)
    4. Returns summary of renamed files
    
    Hash format: {first4}{next4}{3,5,7,11positions}{11,7,5,3positions-reversed}
    Example: a1b2c3d4e5f6
    """
    import hashlib
    import os
    
    folder_name = body.folder_name
    folder_path = config.root_directory / folder_name
    
    # Validate folder exists
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Folder '{folder_name}' not found"
        )
    
    # Validate folder path is within root directory
    root_resolved = config.root_directory.resolve()
    folder_resolved = folder_path.resolve()
    
    if not str(folder_resolved).startswith(str(root_resolved)):
        raise HTTPException(
            status_code=403,
            detail="Folder path must be within root directory"
        )
    
    try:
        service = VideoService(db, thumbnail_db)
        
        # Get all videos in this folder from database
        result = await db.execute(
            select(Video).where(Video.category == folder_name)
        )
        videos = result.scalars().all()
        
        if not videos:
            return {
                "message": "No videos found in folder",
                "folder": folder_name,
                "renamed_count": 0,
                "failed_count": 0,
                "renamed_videos": []
            }
        
        renamed_videos = []
        failed_videos = []
        
        for video in videos:
            try:
                video_path = Path(video.path)
                
                if not video_path.exists():
                    failed_videos.append({
                        "name": video.name,
                        "error": "File not found"
                    })
                    continue
                
                # Generate hash-based name
                sha1_hash = hashlib.sha1()
                with open(video_path, 'rb') as f:
                    # Read file in chunks for better performance
                    for chunk in iter(lambda: f.read(8192), b''):
                        sha1_hash.update(chunk)
                
                hash_str = sha1_hash.hexdigest()
                
                # Extract parts using same logic as zindex
                part1 = hash_str[0:4]                                    # First 4 characters
                part2 = hash_str[4:8]                                    # Next 4 characters
                part3 = hash_str[2] + hash_str[4] + hash_str[6] + hash_str[10]  # Prime positions 3, 5, 7, 11
                part4 = hash_str[10] + hash_str[6] + hash_str[4] + hash_str[2]  # Prime positions 11, 7, 5, 3 reversed
                
                new_name_base = part1 + part2 + part3 + part4
                ext = video_path.suffix
                new_name = f"{new_name_base}{ext}"
                
                # Check if target already exists
                new_path = video_path.parent / new_name
                if new_path.exists() and new_path != video_path:
                    failed_videos.append({
                        "name": video.name,
                        "error": f"Target name already exists: {new_name}"
                    })
                    continue
                
                # Skip if already has the same name
                if video_path == new_path:
                    renamed_videos.append({
                        "old_name": video.name,
                        "new_name": new_name,
                        "status": "skipped_same_name"
                    })
                    continue
                
                # Rename file on filesystem
                video_path.rename(new_path)
                
                # Update database with new path and thumbnail hash
                await thumbnail_db.update_path_hash(str(video_path), str(new_path))
                
                video.path = str(new_path)
                video.name = new_name
                video.extension = ext.lower()
                
                # Update thumbnail URL
                video.thumbnail_url = f"/api/thumbnails/{video.id}"
                
                await db.commit()
                
                renamed_videos.append({
                    "old_name": video.name,
                    "new_name": new_name,
                    "status": "success"
                })
                
                logger.info(f"✓ Renamed: {video.name} → {new_name}")
                
            except Exception as e:
                logger.error(f"Error renaming {video.name}: {str(e)}")
                failed_videos.append({
                    "name": video.name,
                    "error": str(e)
                })
                # Rollback the transaction for this video
                await db.rollback()
                continue
        
        return {
            "message": f"Bulk rename completed: {len(renamed_videos)} renamed, {len(failed_videos)} failed",
            "folder": folder_name,
            "renamed_count": len(renamed_videos),
            "failed_count": len(failed_videos),
            "renamed_videos": renamed_videos,
            "failed_videos": failed_videos,
            "timestamp": time.time()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in bulk hash rename: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Bulk rename failed: {str(e)}")

@app.post("/videos/{video_id}/update")
async def update_video(
    video_id: int,
    body: UpdateVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update video metadata (display_name, description) and optionally rename file."""
    import logging
    from sqlalchemy.orm import selectinload

    logger = logging.getLogger(__name__)

    try:
        service = VideoService(db, thumbnail_db)

        # Get the current video with tags and actors eagerly loaded
        result = await db.execute(select(Video).options(selectinload(Video.tags), selectinload(Video.actors)).where(Video.id == video_id))
        video = result.scalar_one_or_none()

        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        # Handle file rename if new_name is provided
        if body.new_name:
            try:
                video = await service.move_video(
                    video_id=video_id,
                    target_category=video.category,
                    root_directory=config.root_directory,
                    target_subcategory=video.subcategory,
                    new_name=body.new_name
                )
            except FileExistsError:
                raise HTTPException(status_code=409, detail="A file with this name already exists")
            except ValueError as ve:
                raise HTTPException(status_code=400, detail=str(ve))
            except RuntimeError as re:
                raise HTTPException(status_code=500, detail=str(re))

            if not video:
                raise HTTPException(status_code=404, detail="Video not found or source file missing")

            # Reload video with tags and actors after rename
            result = await db.execute(select(Video).options(selectinload(Video.tags), selectinload(Video.actors)).where(Video.id == video_id))
            video = result.scalar_one_or_none()

        # Update display_name and description (database only)
        if body.display_name is not None:
            video.display_name = body.display_name
        if body.description is not None:
            video.description = body.description

        # Update enhanced metadata fields
        if body.series is not None:
            video.series = body.series
        if body.season is not None:
            video.season = body.season
        if body.episode is not None:
            video.episode = body.episode
        if body.year is not None:
            video.year = body.year
        if body.channel is not None:
            video.channel = body.channel
        if body.rating is not None:
            video.rating = body.rating
        if body.favorite is not None:
            video.favorite = 1 if body.favorite else 0

        await db.commit()
        await db.refresh(video)

        return {
            "message": "Video updated successfully",
            "video": serialize_video(video)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating video {video_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update video: {str(e)}")

@app.post("/videos/{video_id}/toggle-final")
async def toggle_final_status(
    video_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Toggle the final/preferred status of a video (for deduplication workflow)."""
    from sqlalchemy.orm import selectinload

    try:
        # Get the video
        result = await db.execute(
            select(Video)
            .options(selectinload(Video.tags), selectinload(Video.actors))
            .where(Video.id == video_id)
        )
        video = result.scalar_one_or_none()

        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        # Toggle the is_final status
        video.is_final = 0 if video.is_final else 1

        await db.commit()
        await db.refresh(video)

        return {
            "success": True,
            "is_final": bool(video.is_final),
            "message": f"Video marked as {'final' if video.is_final else 'not final'}",
            "video": serialize_video(video)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling final status for video {video_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to toggle final status: {str(e)}")

@app.post("/api/videos/parse-metadata")
async def parse_metadata_batch(
    category: str | None = None,
    subcategory: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Parse metadata from filenames for videos in a specific folder.
    Only updates NULL fields - won't override existing manual entries.

    Args:
        category: Category/folder name to parse (optional, if None parses all)
        subcategory: Subcategory path to parse (optional)

    Returns:
        Statistics about parsing (updated count, skipped count)
    """
    from metadata_parser import parse_metadata_from_filename, should_update_field
    import logging

    logger = logging.getLogger(__name__)

    try:
        # Build query for videos to parse
        query = select(Video)

        if category:
            query = query.where(Video.category == category)

        if subcategory:
            query = query.where(Video.subcategory == subcategory)

        result = await db.execute(query)
        videos = result.scalars().all()

        updated_count = 0
        skipped_count = 0

        for video in videos:
            # Parse metadata from filename
            parsed = parse_metadata_from_filename(video.name)

            # Check if any field needs updating (only update NULL fields)
            has_updates = False

            if should_update_field(video.series, parsed.get('series')):
                video.series = parsed.get('series')
                has_updates = True

            if should_update_field(video.season, parsed.get('season')):
                video.season = parsed.get('season')
                has_updates = True

            if should_update_field(video.episode, parsed.get('episode')):
                video.episode = parsed.get('episode')
                has_updates = True

            if should_update_field(video.year, parsed.get('year')):
                video.year = parsed.get('year')
                has_updates = True

            if should_update_field(video.channel, parsed.get('channel')):
                video.channel = parsed.get('channel')
                has_updates = True

            if has_updates:
                updated_count += 1
            else:
                skipped_count += 1

        await db.commit()

        return {
            "message": "Metadata parsing complete",
            "total_videos": len(videos),
            "updated": updated_count,
            "skipped": skipped_count,
            "category": category,
            "subcategory": subcategory
        }

    except Exception as e:
        logger.error(f"Error parsing metadata: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to parse metadata: {str(e)}")

@app.post("/api/videos/bulk-update")
async def bulk_update_videos(
    body: BulkUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Bulk update multiple videos with common fields and individual overrides.

    Args:
        body: BulkUpdateRequest with common_fields and per-video updates

    Returns:
        Success/failure count and updated video list
    """
    import logging
    from sqlalchemy.orm import selectinload

    logger = logging.getLogger(__name__)

    try:
        service = VideoService(db, thumbnail_db)
        updated_videos = []
        failed_videos = []

        for video_update in body.videos:
            video_id = video_update.get('id')
            if not video_id:
                continue

            try:
                # Get video with relationships
                result = await db.execute(
                    select(Video).options(
                        selectinload(Video.tags),
                        selectinload(Video.actors)
                    ).where(Video.id == video_id)
                )
                video = result.scalar_one_or_none()

                if not video:
                    failed_videos.append({"id": video_id, "error": "Video not found"})
                    continue

                # Handle file rename if new_name is provided in individual video update
                new_name = video_update.get('new_name')
                if new_name:
                    try:
                        video = await service.move_video(
                            video_id=video_id,
                            target_category=video.category,
                            root_directory=config.root_directory,
                            target_subcategory=video.subcategory,
                            new_name=new_name
                        )
                        # Reload video after rename
                        result = await db.execute(
                            select(Video).options(
                                selectinload(Video.tags),
                                selectinload(Video.actors)
                            ).where(Video.id == video_id)
                        )
                        video = result.scalar_one_or_none()
                    except (FileExistsError, ValueError, RuntimeError) as e:
                        failed_videos.append({"id": video_id, "error": str(e)})
                        continue

                # Apply common fields (only if not None)
                for field, value in body.common_fields.items():
                    if value is not None and hasattr(video, field):
                        if field == 'favorite':
                            setattr(video, field, 1 if value else 0)
                        else:
                            setattr(video, field, value)

                # Apply individual video fields (override common fields)
                for field, value in video_update.items():
                    if field not in ['id', 'new_name'] and value is not None and hasattr(video, field):
                        if field == 'favorite':
                            setattr(video, field, 1 if value else 0)
                        else:
                            setattr(video, field, value)

                await db.commit()
                await db.refresh(video)
                updated_videos.append(video)

            except Exception as e:
                logger.error(f"Error updating video {video_id}: {str(e)}", exc_info=True)
                failed_videos.append({"id": video_id, "error": str(e)})
                continue

        return {
            "message": "Bulk update complete",
            "updated_count": len(updated_videos),
            "failed_count": len(failed_videos),
            "updated_videos": [serialize_video(v) for v in updated_videos],
            "failed_videos": failed_videos
        }

    except Exception as e:
        logger.error(f"Error in bulk update: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to bulk update videos: {str(e)}")

# ===== On-Demand Metadata Extraction Endpoints =====

@app.post("/api/videos/{video_id}/extract-metadata")
async def extract_video_metadata(video_id: int, db: AsyncSession = Depends(get_db)):
    """Extract metadata for a single video on-demand (duration, resolution, codec, bitrate, fps)"""
    # Get video from database
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check if file exists
    video_path = Path(video.path)
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found on disk")

    # Extract metadata using VideoService
    service = VideoService(db, thumbnail_db)
    try:
        metadata = await service.extract_video_metadata(video_path)

        if metadata:
            # Update video with metadata
            video.duration = metadata.get('duration')
            video.width = metadata.get('width')
            video.height = metadata.get('height')
            video.codec = metadata.get('codec')
            video.bitrate = metadata.get('bitrate')
            video.fps = metadata.get('fps')
            await db.commit()

            return {
                "success": True,
                "video_id": video_id,
                "video_name": video.display_name or video.name,
                "metadata": {
                    "duration": video.duration,
                    "width": video.width,
                    "height": video.height,
                    "codec": video.codec,
                    "bitrate": video.bitrate,
                    "fps": video.fps
                },
                "message": "Metadata extracted successfully"
            }
        else:
            raise HTTPException(status_code=500, detail="Failed to extract metadata")

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Metadata extraction failed: {str(e)}")

@app.post("/api/videos/folder/{folder_name}/extract-metadata")
async def extract_folder_metadata(
    folder_name: str,
    db: AsyncSession = Depends(get_db)
):
    """Extract metadata for all videos in a folder"""
    # Get all videos in this folder
    result = await db.execute(
        select(Video).where(Video.category == folder_name)
    )
    videos = result.scalars().all()

    if not videos:
        return {
            "success": True,
            "folder_name": folder_name,
            "processed": 0,
            "message": "No videos found in folder"
        }

    service = VideoService(db, thumbnail_db)
    processed = 0
    failed = 0

    for video in videos:
        # Skip if already has metadata
        if video.duration is not None:
            continue

        # Check if file exists
        video_path = Path(video.path)
        if not video_path.exists():
            failed += 1
            continue

        try:
            metadata = await service.extract_video_metadata(video_path)

            if metadata:
                video.duration = metadata.get('duration')
                video.width = metadata.get('width')
                video.height = metadata.get('height')
                video.codec = metadata.get('codec')
                video.bitrate = metadata.get('bitrate')
                video.fps = metadata.get('fps')
                processed += 1
        except Exception as e:
            print(f"⚠️ Failed to extract metadata for {video.name}: {e}")
            failed += 1
            continue

    await db.commit()

    return {
        "success": True,
        "folder_name": folder_name,
        "total_videos": len(videos),
        "processed": processed,
        "failed": failed,
        "message": f"Extracted metadata for {processed} videos"
    }

@app.post("/api/videos/bulk/extract-metadata")
async def extract_bulk_metadata(
    video_ids: List[int],
    db: AsyncSession = Depends(get_db)
):
    """Extract metadata for multiple videos (bulk operation)"""
    if not video_ids:
        raise HTTPException(status_code=400, detail="No video IDs provided")

    # Get all videos
    result = await db.execute(
        select(Video).where(Video.id.in_(video_ids))
    )
    videos = result.scalars().all()

    if not videos:
        raise HTTPException(status_code=404, detail="No videos found")

    service = VideoService(db, thumbnail_db)
    processed = 0
    failed = 0

    for video in videos:
        # Skip if already has metadata
        if video.duration is not None:
            continue

        # Check if file exists
        video_path = Path(video.path)
        if not video_path.exists():
            failed += 1
            continue

        try:
            metadata = await service.extract_video_metadata(video_path)

            if metadata:
                video.duration = metadata.get('duration')
                video.width = metadata.get('width')
                video.height = metadata.get('height')
                video.codec = metadata.get('codec')
                video.bitrate = metadata.get('bitrate')
                video.fps = metadata.get('fps')
                processed += 1
        except Exception as e:
            print(f"⚠️ Failed to extract metadata for {video.name}: {e}")
            failed += 1
            continue

    await db.commit()

    return {
        "success": True,
        "requested": len(video_ids),
        "found": len(videos),
        "processed": processed,
        "failed": failed,
        "message": f"Extracted metadata for {processed} videos"
    }

@app.post("/videos/{video_id}/delete")
async def delete_video(
    video_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Move a video to the DELETE folder in root directory."""
    service = VideoService(db, thumbnail_db)

    # Get the current video
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    try:
        # Move video to DELETE folder (special category)
        moved = await service.move_video(
            video_id=video_id,
            target_category="DELETE",
            root_directory=config.root_directory,
            target_subcategory=None,
            new_name=None  # Keep the same filename
        )
    except FileExistsError:
        raise HTTPException(
            status_code=409,
            detail="A file with this name already exists in DELETE folder"
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        raise HTTPException(status_code=500, detail=str(re))

    if not moved:
        raise HTTPException(status_code=404, detail="Video not found or source file missing")

    return {
        "message": "Video moved to DELETE folder",
        "video": {
            "id": moved.id,
            "path": moved.path,
            "name": moved.name,
            "category": moved.category,
            "original_category": video.category
        }
    }

@app.post("/videos/{video_id}/delete-permanent")
async def delete_video_permanent(
    video_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete a video file from disk and database (only for videos in DELETE folder)."""
    import os

    # Get the current video
    result = await db.execute(select(Video).where(Video.id == video_id))
    video = result.scalar_one_or_none()

    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Safety check: Only allow permanent deletion from DELETE folder
    if video.category != "DELETE":
        raise HTTPException(
            status_code=403,
            detail="Can only permanently delete videos from DELETE folder. Move to DELETE first."
        )

    try:
        # Delete physical file
        video_path = Path(video.path)
        if video_path.exists():
            os.remove(video_path)
            logger.info(f"Permanently deleted file: {video_path}")
        else:
            logger.warning(f"File not found for deletion: {video_path}")

        # Delete database record (cascades to tags, fingerprints, etc.)
        await db.delete(video)
        await db.commit()

        return {
            "message": "Video permanently deleted",
            "video_id": video_id,
            "video_name": video.name
        }

    except Exception as e:
        await db.rollback()
        logger.error(f"Error permanently deleting video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to delete video: {str(e)}")

# ==================== FINGERPRINT ENDPOINTS ====================

@app.post("/api/videos/{video_id}/fingerprint")
async def generate_fingerprint(video_id: int, db: AsyncSession = Depends(get_db)):
    """Generate fingerprint for a specific video (user-triggered, on-demand)"""
    import time
    from datetime import datetime

    # Get video
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Check if already fingerprinted
    existing = await db.execute(
        select(VideoFingerprint).where(VideoFingerprint.video_id == video_id)
    )
    if existing.scalars().first():
        return {
            "message": "Already fingerprinted",
            "video_id": video_id,
            "video_name": video.display_name or video.name
        }

    # Generate fingerprints
    fingerprint_service = FingerprintService()
    try:
        fingerprints = await fingerprint_service.generate_fingerprints(video.path)

        if not fingerprints:
            raise HTTPException(status_code=500, detail="Failed to generate fingerprints")

        # Store in database
        for position, phash in fingerprints:
            fp = VideoFingerprint(
                video_id=video_id,
                frame_position=position,
                phash=phash,
                created_at=time.time()
            )
            db.add(fp)

        # Update video status
        video.fingerprint_generated = 1
        video.fingerprinted_at = time.time()

        await db.commit()

        return {
            "message": "Fingerprint generated successfully",
            "video_id": video_id,
            "video_name": video.display_name or video.name,
            "fingerprints_count": len(fingerprints)
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Fingerprint generation failed: {str(e)}")

@app.delete("/api/videos/{video_id}/fingerprint")
async def remove_fingerprint(video_id: int, db: AsyncSession = Depends(get_db)):
    """Remove fingerprint from library"""
    from sqlalchemy import delete as sql_delete

    # Delete fingerprints
    await db.execute(
        sql_delete(VideoFingerprint).where(VideoFingerprint.video_id == video_id)
    )

    # Update video status
    video = await db.get(Video, video_id)
    if video:
        video.fingerprint_generated = 0
        video.fingerprinted_at = None

    await db.commit()

    return {
        "message": "Fingerprint removed",
        "video_id": video_id
    }

@app.get("/api/videos/{video_id}/check-duplicate")
async def check_duplicate(
    video_id: int,
    threshold: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """
    Check if this video is a duplicate of any fingerprinted video.

    Generates temporary fingerprint and compares against library.
    Does NOT require the target video to be fingerprinted.
    """

    # Get video
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Generate temporary fingerprint (not stored)
    fingerprint_service = FingerprintService()
    temp_fingerprints = await fingerprint_service.generate_fingerprints(video.path)

    if not temp_fingerprints:
        raise HTTPException(status_code=500, detail="Failed to generate fingerprint for comparison")

    # Get all fingerprints from library (exclude current video)
    library_fps = await db.execute(
        select(VideoFingerprint).where(VideoFingerprint.video_id != video_id)
    )
    library_fps = library_fps.scalars().all()

    if not library_fps:
        return {
            "is_duplicate": False,
            "message": "No fingerprinted videos in library to compare against",
            "matches": []
        }

    # Compare against library
    video_scores = {}  # video_id -> min_distance

    for _, temp_hash in temp_fingerprints:
        for lib_fp in library_fps:
            distance = fingerprint_service.hamming_distance(temp_hash, lib_fp.phash)

            if lib_fp.video_id not in video_scores:
                video_scores[lib_fp.video_id] = distance
            else:
                video_scores[lib_fp.video_id] = min(video_scores[lib_fp.video_id], distance)

    # Find matches below threshold
    matches = [
        (vid, dist) for vid, dist in video_scores.items()
        if dist <= threshold
    ]
    matches.sort(key=lambda x: x[1])  # Best match first

    # Get video details for matches
    if matches:
        match_ids = [vid for vid, _ in matches]
        matched_videos = await db.execute(
            select(Video).where(Video.id.in_(match_ids))
        )
        matched_videos = matched_videos.scalars().all()

        # Build video_dict mapping
        video_dict = {v.id: v for v in matched_videos}

        results = []
        for vid, distance in matches:
            v = video_dict.get(vid)
            if v:
                similarity = fingerprint_service.similarity_percent(distance)
                results.append({
                    "video": {
                        "id": v.id,
                        "name": v.name,
                        "display_name": v.display_name or v.name,
                        "category": v.category,
                        "subcategory": v.subcategory,
                        "duration": v.duration,
                        "width": v.width,
                        "height": v.height,
                        "size": v.size,
                        "thumbnail_url": v.thumbnail_url,
                        "media_type": v.media_type or 'video'
                    },
                    "hamming_distance": distance,
                    "similarity_percent": round(similarity, 1)
                })

        return {
            "is_duplicate": True,
            "matches": results,
            "best_match": results[0] if results else None
        }

    return {
        "is_duplicate": False,
        "message": "No duplicates found in library",
        "matches": []
    }

@app.get("/api/fingerprints/find-all-duplicates")
async def find_all_duplicates(
    threshold: int = 10,
    folder: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Find all duplicate groups in the fingerprinted library.
    Compares all fingerprinted videos against each other.

    Args:
        threshold: Hamming distance threshold for duplicates (default 10)
        folder: Optional category/folder name to limit search to specific folder only (no cross-folder comparison)

    Note: When folder is provided, only compares videos WITHIN that folder for faster, focused cleanup.
    """
    fingerprint_service = FingerprintService()

    # Get all fingerprinted videos (optionally filtered by folder)
    query = select(Video).where(Video.fingerprint_generated == 1)
    if folder:
        query = query.where(Video.category == folder)

    fingerprinted_videos = await db.execute(query)
    fingerprinted_videos = fingerprinted_videos.scalars().all()

    if len(fingerprinted_videos) < 2:
        return {
            "duplicate_groups": [],
            "total_groups": 0,
            "total_duplicates": 0,
            "message": "Need at least 2 fingerprinted videos to find duplicates"
        }

    # Get fingerprints only for videos in this folder/query (more efficient)
    video_ids = [v.id for v in fingerprinted_videos]
    fingerprints_query = select(VideoFingerprint).where(VideoFingerprint.video_id.in_(video_ids))
    all_fingerprints = await db.execute(fingerprints_query)
    all_fingerprints = all_fingerprints.scalars().all()

    # Group fingerprints by video_id
    video_fingerprints = {}
    for fp in all_fingerprints:
        if fp.video_id not in video_fingerprints:
            video_fingerprints[fp.video_id] = []
        video_fingerprints[fp.video_id].append(fp)

    # Compare all videos against each other
    video_scores = {}  # (video_id1, video_id2) -> min_distance

    video_ids = list(video_fingerprints.keys())
    for i, vid1 in enumerate(video_ids):
        for vid2 in video_ids[i+1:]:  # Only compare each pair once
            fps1 = video_fingerprints.get(vid1, [])
            fps2 = video_fingerprints.get(vid2, [])

            min_distance = float('inf')
            for fp1 in fps1:
                for fp2 in fps2:
                    distance = fingerprint_service.hamming_distance(fp1.phash, fp2.phash)
                    min_distance = min(min_distance, distance)

            if min_distance <= threshold:
                video_scores[(vid1, vid2)] = min_distance

    # Group duplicates together (using union-find algorithm)
    parent = {}

    def find(x):
        if x not in parent:
            parent[x] = x
        if parent[x] != x:
            parent[x] = find(parent[x])
        return parent[x]

    def union(x, y):
        px, py = find(x), find(y)
        if px != py:
            parent[px] = py

    # Build groups
    for (vid1, vid2), distance in video_scores.items():
        union(vid1, vid2)

    # Collect groups
    groups = {}
    for vid in video_ids:
        if vid in video_fingerprints:  # Has fingerprints
            root = find(vid)
            if root not in groups:
                groups[root] = []
            groups[root].append(vid)

    # Filter to only groups with 2+ videos
    duplicate_groups = [group for group in groups.values() if len(group) >= 2]

    # Get video details for all duplicates
    all_duplicate_ids = [vid for group in duplicate_groups for vid in group]

    if all_duplicate_ids:
        duplicate_videos = await db.execute(
            select(Video).where(Video.id.in_(all_duplicate_ids))
        )
        duplicate_videos = duplicate_videos.scalars().all()
        video_dict = {v.id: v for v in duplicate_videos}

        # Build response with video details
        result_groups = []
        for group in duplicate_groups:
            videos_in_group = []
            for vid in group:
                v = video_dict.get(vid)
                if v:
                    # Calculate similarity to first video in group
                    similarity = 100  # Default for first video
                    if vid != group[0]:
                        pair_key = (min(vid, group[0]), max(vid, group[0]))
                        if pair_key in video_scores:
                            distance = video_scores[pair_key]
                            similarity = fingerprint_service.similarity_percent(distance)

                    videos_in_group.append({
                        "id": v.id,
                        "name": v.name,
                        "display_name": v.display_name or v.name,
                        "category": v.category,
                        "subcategory": v.subcategory,
                        "thumbnail_url": v.thumbnail_url,
                        "size": v.size,
                        "duration": v.duration,
                        "similarity_percent": round(similarity, 1),
                        "media_type": v.media_type or 'video'
                    })

            if len(videos_in_group) >= 2:
                result_groups.append({
                    "videos": videos_in_group,
                    "count": len(videos_in_group)
                })

        # Sort groups by size (largest first)
        result_groups.sort(key=lambda x: x["count"], reverse=True)

        return {
            "duplicate_groups": result_groups,
            "total_groups": len(result_groups),
            "total_duplicates": sum(g["count"] for g in result_groups),
            "message": f"Found {len(result_groups)} duplicate groups with {sum(g['count'] for g in result_groups)} total videos"
        }

    return {
        "duplicate_groups": [],
        "total_groups": 0,
        "total_duplicates": 0,
        "message": "No duplicates found"
    }

@app.get("/api/fingerprints/stats")
async def get_fingerprint_stats(db: AsyncSession = Depends(get_db)):
    """Get fingerprint library statistics"""

    total_videos = await db.execute(select(func.count(Video.id)))
    total_videos = total_videos.scalar()

    fingerprinted = await db.execute(
        select(func.count(Video.id)).where(Video.fingerprint_generated == 1)
    )
    fingerprinted = fingerprinted.scalar()

    return {
        "total_videos": total_videos,
        "fingerprinted": fingerprinted,
        "coverage_percent": round((fingerprinted / total_videos * 100), 1) if total_videos > 0 else 0
    }

@app.get("/api/fingerprints/stats/by-folder")
async def get_fingerprint_stats_by_folder(db: AsyncSession = Depends(get_db)):
    """Get fingerprint statistics grouped by folder/category"""

    # Get all videos grouped by category with fingerprint counts
    result = await db.execute(
        select(
            Video.category,
            func.count(Video.id).label('total_videos'),
            func.sum(case((Video.fingerprint_generated == 1, 1), else_=0)).label('fingerprinted_count')
        ).group_by(Video.category)
    )

    folder_stats = {}
    for row in result:
        category = row.category
        total = row.total_videos
        fingerprinted = row.fingerprinted_count or 0

        folder_stats[category] = {
            "total": total,
            "fingerprinted": fingerprinted,
            "percentage": round((fingerprinted / total * 100), 1) if total > 0 else 0
        }

    return folder_stats

@app.get("/api/videos/{video_id}/fingerprints")
async def get_video_fingerprints(video_id: int, db: AsyncSession = Depends(get_db)):
    """Get all fingerprint frames for a video with thumbnails"""
    import base64
    from pathlib import Path

    # Get video
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Get all fingerprints
    result = await db.execute(
        select(VideoFingerprint)
        .where(VideoFingerprint.video_id == video_id)
        .order_by(VideoFingerprint.frame_position)
    )
    fingerprints = result.scalars().all()

    if not fingerprints:
        return {
            "video_id": video_id,
            "fingerprinted": False,
            "frames": []
        }

    # Extract frame thumbnails
    fingerprint_service = FingerprintService()
    frames_data = []

    for fp in fingerprints:
        # Convert frame_position from integer percentage (0-100) to float (0.0-1.0)
        position_float = fp.frame_position / 100.0

        # Extract frame image at this position
        frame_image = await fingerprint_service.extract_frame_image(
            video.path,
            position_float
        )

        # Skip frames that failed to extract
        if not frame_image:
            logger.warning(f"Failed to extract thumbnail for fingerprint {fp.id} at {fp.frame_position}%")
            continue

        frames_data.append({
            "id": fp.id,
            "position": position_float,  # Return as float (0.0-1.0) for frontend
            "timestamp": video.duration * position_float if video.duration else 0,
            "phash": fp.phash,
            "created_at": fp.created_at,  # Already a float (Unix timestamp)
            "thumbnail": frame_image  # base64 encoded image
        })

    return {
        "video_id": video_id,
        "video_name": video.display_name or video.name,
        "fingerprinted": True,
        "fingerprinted_at": video.fingerprinted_at,
        "frame_count": len(frames_data),
        "frames": frames_data
    }

@app.delete("/api/videos/{video_id}/fingerprints/{fingerprint_id}")
async def delete_fingerprint_frame(
    video_id: int,
    fingerprint_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a specific fingerprint frame"""

    # Get the fingerprint
    fingerprint = await db.get(VideoFingerprint, fingerprint_id)
    if not fingerprint or fingerprint.video_id != video_id:
        raise HTTPException(status_code=404, detail="Fingerprint frame not found")

    # Delete it
    await db.delete(fingerprint)
    await db.commit()

    # Check if any fingerprints remain
    remaining = await db.execute(
        select(func.count(VideoFingerprint.id))
        .where(VideoFingerprint.video_id == video_id)
    )
    count = remaining.scalar()

    # If no fingerprints left, update video status
    if count == 0:
        video = await db.get(Video, video_id)
        if video:
            video.fingerprint_generated = 0
            video.fingerprinted_at = None
            await db.commit()

    return {
        "success": True,
        "remaining_frames": count,
        "message": f"Fingerprint frame deleted. {count} frames remaining."
    }

@app.post("/api/videos/{video_id}/fingerprints/add-frame")
async def add_fingerprint_frame(
    video_id: int,
    position: float,  # 0.0 to 1.0 (percentage of video)
    db: AsyncSession = Depends(get_db)
):
    """Add a custom fingerprint frame at specified position"""
    import time

    # Validate position
    if not 0.0 <= position <= 1.0:
        raise HTTPException(status_code=400, detail="Position must be between 0.0 and 1.0")

    # Get video
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    # Convert position to integer percentage for storage (0-100)
    position_percentage = int(position * 100)

    # Check if frame already exists at this position (within 1% tolerance)
    existing = await db.execute(
        select(VideoFingerprint)
        .where(
            VideoFingerprint.video_id == video_id,
            VideoFingerprint.frame_position.between(position_percentage - 1, position_percentage + 1)
        )
    )
    if existing.scalars().first():
        raise HTTPException(
            status_code=400,
            detail=f"Frame already exists near position {position_percentage}%"
        )

    # Generate fingerprint for this frame
    fingerprint_service = FingerprintService()
    try:
        # Extract single frame fingerprint (use float 0.0-1.0)
        phash = await fingerprint_service.generate_single_frame_fingerprint(
            video.path,
            position
        )

        if not phash:
            raise HTTPException(status_code=500, detail="Failed to generate fingerprint")

        # Save to database (store as integer percentage 0-100)
        fp = VideoFingerprint(
            video_id=video_id,
            frame_position=position_percentage,
            phash=phash,
            created_at=time.time()
        )
        db.add(fp)

        # Mark video as fingerprinted if not already
        if not video.fingerprint_generated:
            video.fingerprint_generated = 1
            video.fingerprinted_at = time.time()

        await db.commit()
        await db.refresh(fp)

        return {
            "success": True,
            "fingerprint_id": fp.id,
            "position": position,
            "timestamp": video.duration * position if video.duration else 0,
            "message": f"Added fingerprint frame at {int(position * 100)}%"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add frame: {str(e)}")

@app.post("/api/fingerprints/extract-frames/{video_id}")
async def extract_fingerprint_frames(
    video_id: int,
    request_body: dict,
    db: AsyncSession = Depends(get_db)
):
    """
    Extract frames at specified positions and generate pHash for each
    Used by interactive fingerprint generation modal

    Args:
        video_id: Video ID
        request_body: JSON with positions list

    Returns:
        List of frame data with thumbnails and phashes
    """
    # Get positions from request body
    positions = request_body.get('positions', [])

    if not positions:
        raise HTTPException(status_code=400, detail="No positions provided")

    # Get video
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if not video.path or not Path(video.path).exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    # Validate positions
    for pos in positions:
        if not 0.0 <= pos <= 1.0:
            raise HTTPException(status_code=400, detail=f"Position {pos} must be between 0.0 and 1.0")

    fingerprint_service = FingerprintService()
    frames = []

    # Extract each frame
    for position in positions:
        try:
            # Generate pHash
            phash = await fingerprint_service.generate_single_frame_fingerprint(
                video.path,
                position
            )

            if not phash:
                logger.warning(f"Failed to generate pHash at position {position}")
                continue

            # Extract thumbnail
            thumbnail = await fingerprint_service.extract_frame_image(
                video.path,
                position
            )

            if not thumbnail:
                logger.warning(f"Failed to extract thumbnail at position {position}")
                continue

            # Calculate timestamp
            timestamp = video.duration * position if video.duration else 0

            frames.append({
                "position": position,
                "phash": phash,
                "thumbnail": thumbnail,
                "timestamp": timestamp
            })

        except Exception as e:
            logger.error(f"Failed to extract frame at position {position}: {e}")
            continue

    if not frames:
        raise HTTPException(status_code=500, detail="Failed to extract any frames")

    return {
        "video_id": video_id,
        "frames": frames,
        "count": len(frames)
    }

@app.post("/api/videos/{video_id}/fingerprints/add-frames")
async def add_fingerprint_frames_batch(
    video_id: int,
    request_body: dict,
    db: AsyncSession = Depends(get_db)
):
    """
    Batch add multiple fingerprint frames
    Used by interactive fingerprint generation modal

    Args:
        video_id: Video ID
        request_body: JSON with frames list

    Returns:
        Success status and counts
    """
    import time

    # Get frames from request body
    frames = request_body.get('frames', [])

    if not frames:
        raise HTTPException(status_code=400, detail="No frames provided")

    # Get video
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    added_count = 0
    skipped_count = 0

    for frame in frames:
        try:
            position = frame.get('position')
            phash = frame.get('phash')

            if position is None or phash is None:
                logger.warning(f"Invalid frame data: {frame}")
                skipped_count += 1
                continue

            # Validate position
            if not 0.0 <= position <= 1.0:
                logger.warning(f"Invalid position: {position}")
                skipped_count += 1
                continue

            # Convert position to integer percentage for storage (0-100)
            position_percentage = int(position * 100)

            # Check if frame already exists at this position (within 1% tolerance)
            existing = await db.execute(
                select(VideoFingerprint)
                .where(
                    VideoFingerprint.video_id == video_id,
                    VideoFingerprint.frame_position.between(position_percentage - 1, position_percentage + 1)
                )
            )
            if existing.scalars().first():
                logger.info(f"Frame already exists near position {position_percentage}%, skipping")
                skipped_count += 1
                continue

            # Save to database
            fp = VideoFingerprint(
                video_id=video_id,
                frame_position=position_percentage,
                phash=phash,
                created_at=time.time()
            )
            db.add(fp)
            added_count += 1

        except Exception as e:
            logger.error(f"Failed to add frame: {e}")
            skipped_count += 1
            continue

    # Mark video as fingerprinted if we added any frames
    if added_count > 0:
        if not video.fingerprint_generated:
            video.fingerprint_generated = 1
            video.fingerprinted_at = time.time()

        await db.commit()

    # Get total frame count
    total_frames = await db.execute(
        select(func.count(VideoFingerprint.id))
        .where(VideoFingerprint.video_id == video_id)
    )
    total_count = total_frames.scalar()

    return {
        "success": True,
        "added_count": added_count,
        "skipped_count": skipped_count,
        "total_frames": total_count,
        "message": f"Added {added_count} frames ({skipped_count} skipped). Total: {total_count} frames."
    }

@app.post("/api/videos/{video_id}/fingerprints/add-frames-from-images")
async def add_fingerprint_frames_from_images(
    video_id: int,
    request_body: dict,
    db: AsyncSession = Depends(get_db)
):
    """
    Batch add multiple fingerprint frames from base64 images
    Generates pHash from client-captured thumbnails
    Used by interactive fingerprint generation modal (client-side capture)

    Args:
        video_id: Video ID
        request_body: JSON with frames list containing position and thumbnail (base64)

    Returns:
        Success status and counts
    """
    import time
    import base64
    import io
    from PIL import Image
    import imagehash

    # Get frames from request body
    frames = request_body.get('frames', [])

    if not frames:
        raise HTTPException(status_code=400, detail="No frames provided")

    # Get video
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    added_count = 0
    skipped_count = 0

    for frame in frames:
        try:
            position = frame.get('position')
            thumbnail_data = frame.get('thumbnail')

            if position is None or thumbnail_data is None:
                logger.warning(f"Invalid frame data: missing position or thumbnail")
                skipped_count += 1
                continue

            # Validate position
            if not 0.0 <= position <= 1.0:
                logger.warning(f"Invalid position: {position}")
                skipped_count += 1
                continue

            # Convert position to integer percentage for storage (0-100)
            position_percentage = int(position * 100)

            # Check if frame already exists at this position (within 1% tolerance)
            existing = await db.execute(
                select(VideoFingerprint)
                .where(
                    VideoFingerprint.video_id == video_id,
                    VideoFingerprint.frame_position.between(position_percentage - 1, position_percentage + 1)
                )
            )
            if existing.scalars().first():
                logger.info(f"Frame already exists near position {position_percentage}%, skipping")
                skipped_count += 1
                continue

            # Decode base64 image
            try:
                # Remove data:image/jpeg;base64, prefix if present
                if 'base64,' in thumbnail_data:
                    thumbnail_data = thumbnail_data.split('base64,')[1]

                # Decode base64 to bytes
                image_bytes = base64.b64decode(thumbnail_data)

                # Open image with PIL
                image = Image.open(io.BytesIO(image_bytes))

                # Generate pHash
                phash = imagehash.phash(image, hash_size=8)
                phash_str = str(phash)

                logger.info(f"Generated pHash for position {position_percentage}%: {phash_str}")

            except Exception as e:
                logger.error(f"Failed to generate pHash from thumbnail: {e}")
                skipped_count += 1
                continue

            # Save to database
            fp = VideoFingerprint(
                video_id=video_id,
                frame_position=position_percentage,
                phash=phash_str,
                created_at=time.time()
            )
            db.add(fp)
            added_count += 1

        except Exception as e:
            logger.error(f"Failed to add frame: {e}")
            skipped_count += 1
            continue

    # Mark video as fingerprinted if we added any frames
    if added_count > 0:
        if not video.fingerprint_generated:
            video.fingerprint_generated = 1
            video.fingerprinted_at = time.time()

        await db.commit()

    # Get total frame count
    total_frames = await db.execute(
        select(func.count(VideoFingerprint.id))
        .where(VideoFingerprint.video_id == video_id)
    )
    total_count = total_frames.scalar()

    return {
        "success": True,
        "added_count": added_count,
        "skipped_count": skipped_count,
        "total_frames": total_count,
        "message": f"Added {added_count} frames ({skipped_count} skipped). Total: {total_count} frames."
    }

# ==================== FACE RECOGNITION ENDPOINTS ====================

@app.post("/api/faces/search")
async def search_face(
    face_image: UploadFile = File(...),
    video_id: int = Form(...),
    frame_timestamp: float = Form(...),
    threshold: float = Form(0.4),
    exclude_face_id: int = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Search for matching faces in the catalog

    Receives a cropped face image from frontend, generates encoding,
    and searches for similar faces in the database.
    
    Args:
        exclude_face_id: Optional face ID to exclude from results (e.g., when finding duplicates)
    """
    import cv2
    import numpy as np

    try:
        # Read uploaded image
        image_bytes = await face_image.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format")

        # Generate face encoding
        result = face_service.generate_face_encoding(img)

        if result is None:
            raise HTTPException(status_code=400, detail="No face detected in image")

        encoding, confidence = result

        # Calculate face quality
        quality_score = face_service.calculate_face_quality(img)

        # Search for similar faces
        matches = await face_service.search_similar_faces(
            encoding=encoding,
            db=db,
            threshold=threshold,
            top_k=5,
            exclude_face_id=exclude_face_id
        )

        # Convert encoding to base64 for response
        encoding_b64 = face_service.encoding_to_base64(encoding)

        # Convert image to base64 thumbnail
        thumbnail_b64 = face_service.image_to_base64(img)

        return {
            "matches": matches,
            "has_matches": len(matches) > 0,
            "encoding": encoding_b64,  # Send back for frontend storage
            "thumbnail": thumbnail_b64,
            "confidence": confidence,
            "quality_score": quality_score,
            "video_id": video_id,
            "frame_timestamp": frame_timestamp
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in face search: {e}")
        raise HTTPException(status_code=500, detail=f"Face search failed: {str(e)}")

@app.post("/api/faces/create")
async def create_face(
    name: str = Form(None),
    actor_id: int = Form(None),
    encoding: str = Form(...),  # Base64 encoded
    thumbnail: str = Form(...),  # Base64 encoded
    confidence: float = Form(...),
    quality_score: float = Form(...),
    video_id: int = Form(None),  # Optional: for image search context
    frame_timestamp: float = Form(None),  # Optional: for image search context
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new face_id and add the first encoding
    """
    try:
        # Decode encoding from base64
        encoding_array = face_service.base64_to_encoding(encoding)

        # Create new face_id
        face = await face_service.create_face_id(
            db=db,
            name=name,
            thumbnail_path=None,  # Will be stored as base64 in encoding
            actor_id=actor_id
        )

        # Add encoding to the new face
        face_encoding = await face_service.add_encoding_to_face(
            db=db,
            face_id=face.id,
            video_id=video_id,
            frame_timestamp=frame_timestamp,
            encoding=encoding_array,
            confidence=confidence,
            thumbnail=thumbnail,
            quality_score=quality_score
        )

        # Check if encoding was added (should not be None for new face, but be defensive)
        if face_encoding is None:
            logger.warning(f"Could not add initial encoding to new face {face.id} - encoding may be invalid")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to add initial encoding to new face {face.name}"
            )

        return {
            "success": True,
            "face_id": face.id,
            "name": face.name,
            "encoding_id": face_encoding.id,
            "message": f"Created new face: {face.name}"
        }

    except Exception as e:
        logger.error(f"Error creating face: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create face: {str(e)}")

@app.post("/api/faces/{face_id}/add-encoding")
async def add_encoding_to_face(
    face_id: int,
    encoding: str = Form(...),  # Base64 encoded
    thumbnail: str = Form(...),  # Base64 encoded
    confidence: float = Form(...),
    quality_score: float = Form(...),
    video_id: int = Form(None),  # Optional: for image search context
    frame_timestamp: float = Form(None),  # Optional: for image search context
    db: AsyncSession = Depends(get_db)
):
    """
    Add a new encoding to an existing face_id
    """
    try:
        # Check if face exists
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        # Check encoding limit (max 200 per face)
        if face.encoding_count >= 200:
            raise HTTPException(
                status_code=400,
                detail=f"Face {face.name} already has maximum encodings (200)"
            )

        # Decode encoding from base64
        encoding_array = face_service.base64_to_encoding(encoding)

        # Add encoding
        face_encoding = await face_service.add_encoding_to_face(
            db=db,
            face_id=face_id,
            video_id=video_id,
            frame_timestamp=frame_timestamp,
            encoding=encoding_array,
            confidence=confidence,
            thumbnail=thumbnail,
            quality_score=quality_score
        )

        # Handle duplicate encoding (returns None if exact match already exists)
        if face_encoding is None:
            # Refresh face to get updated encoding_count
            await db.refresh(face)
            return {
                "success": False,
                "face_id": face.id,
                "name": face.name,
                "encoding_id": None,
                "encoding_count": face.encoding_count,
                "message": f"Encoding is a duplicate - already exists for {face.name}"
            }

        return {
            "success": True,
            "face_id": face.id,
            "name": face.name,
            "encoding_id": face_encoding.id,
            "encoding_count": face.encoding_count,
            "message": f"Added encoding to {face.name}"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding encoding: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add encoding: {str(e)}")

@app.delete("/api/faces/{face_id}/encodings/{encoding_id}")
async def delete_encoding_from_face(face_id: int, encoding_id: int, db: AsyncSession = Depends(get_db)):
    """
    Delete a single encoding from a face ID.
    If this is the last encoding, the entire face ID will be deleted.
    """
    try:
        result = await face_service.delete_encoding_from_face(
            db=db,
            face_id=face_id,
            encoding_id=encoding_id
        )
        return result

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting encoding: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete encoding: {str(e)}")

@app.get("/api/faces/search")
async def search_faces(
    q: str = "",
    actor_id: Optional[int] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """
    Search faces by name or actor name (autocomplete)
    
    Query params:
    - q: Search term (searches face name and linked actor name)
    - actor_id: Filter by actor_id if set
    - limit: Maximum results
    """
    try:
        from sqlalchemy.orm import joinedload
        
        # Build base query
        stmt = select(FaceID).options(joinedload(FaceID.actor))
        
        # Apply filters
        filters = []
        if q.strip():
            # Search by face name OR linked actor name
            filters.append(
                (func.lower(FaceID.name).contains(q.lower())) |
                (func.lower(Actor.name).contains(q.lower()))
            )
        
        if actor_id is not None:
            filters.append(FaceID.actor_id == actor_id)
        
        if filters:
            stmt = stmt.where(and_(*filters))
        
        stmt = stmt.order_by(FaceID.updated_at.desc()).limit(limit)
        
        result = await db.execute(stmt)
        faces = result.scalars().unique().all()
        
        return {
            "faces": [{
                "id": face.id,
                "name": face.name,
                "actor_id": face.actor_id,
                "actor_name": face.actor.name if face.actor else None,
                "encoding_count": face.encoding_count
            } for face in faces],
            "total_count": len(faces)
        }
    except Exception as e:
        logger.error(f"Error searching faces: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to search faces: {str(e)}")

@app.get("/api/faces/catalog")
async def get_face_catalog(db: AsyncSession = Depends(get_db)):
    """
    Get all faces in the catalog with their details
    """
    try:
        # Load all face_ids with video counts and image counts
        result = await db.execute(
            select(
                FaceID,
                Actor,
                func.count(VideoFace.id).label('video_count')
            )
            .outerjoin(VideoFace, FaceID.id == VideoFace.face_id)
            .outerjoin(Actor, FaceID.actor_id == Actor.id)
            .group_by(FaceID.id, Actor.id)
            .order_by(FaceID.updated_at.desc())
        )
        face_rows = result.all()

        # Build catalog
        catalog = []
        for face, actor, video_count in face_rows:
            # Count encodings by source (video vs image)
            encodings_result = await db.execute(
                select(FaceEncoding, Video.media_type)
                .outerjoin(Video, FaceEncoding.video_id == Video.id)
                .where(FaceEncoding.face_id == face.id)
            )
            encodings_data = encodings_result.all()

            image_count = 0
            for enc, media_type in encodings_data:
                if media_type == 'image' or (media_type is None and enc.frame_timestamp == 0):
                    # Image sources have either media_type='image' or frame_timestamp=0 with no video
                    image_count += 1

            # Get encoding thumbnail - use primary if set, otherwise best quality
            if face.primary_encoding_id:
                # Use user-selected primary encoding
                encoding_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.id == face.primary_encoding_id)
                )
                best_encoding = encoding_result.scalar_one_or_none()
            else:
                # Fall back to best quality encoding
                encoding_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.face_id == face.id)
                    .order_by(FaceEncoding.quality_score.desc())
                    .limit(1)
                )
                best_encoding = encoding_result.scalar_one_or_none()

            catalog.append({
                "id": face.id,
                "name": face.name,
                "actor_id": face.actor_id,
                "actor_name": actor.name if actor else None,
                "encoding_count": face.encoding_count,
                "video_count": video_count,  # Number of videos containing this face
                "image_count": image_count,  # Number of image-sourced encodings
                "thumbnail": best_encoding.thumbnail if best_encoding else None,
                "primary_encoding_id": face.primary_encoding_id,
                "created_at": face.created_at,
                "updated_at": face.updated_at
            })

        return {
            "faces": catalog,
            "total_count": len(catalog)
        }

    except Exception as e:
        logger.error(f"Error loading face catalog: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load catalog: {str(e)}")

@app.get("/api/faces/{face_id}/encodings")
async def get_face_encodings(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get all encodings for a specific face with video information"""
    try:
        # Verify face exists
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            logger.warning(f"Face {face_id} not found")
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Get all encodings for this face with video info
        # Using left outer join to handle videos that may be deleted
        encodings_result = await db.execute(
            select(FaceEncoding, Video.name)
            .outerjoin(Video, FaceEncoding.video_id == Video.id)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.quality_score.desc())
        )
        encodings_data = encodings_result.all()

        # Format encodings
        encoding_list = []
        for enc, video_name in encodings_data:
            encoding_list.append({
                "id": enc.id,
                "video_id": enc.video_id,
                "video_name": video_name or "Unknown Video",
                "frame_timestamp": float(enc.frame_timestamp) if enc.frame_timestamp else None,
                "thumbnail": enc.thumbnail or "",  # base64 encoded, provide empty string if none
                "confidence": float(enc.confidence) if enc.confidence else 0.0,
                "quality_score": float(enc.quality_score) if enc.quality_score else 0.0,
                "created_at": enc.created_at.isoformat() if enc.created_at and hasattr(enc.created_at, 'isoformat') else str(enc.created_at) if enc.created_at else None,
                "embedding": enc.encoding or ""  # 512-D vector as base64 string
            })

        logger.info(f"Retrieved {len(encoding_list)} encodings for face {face_id}")
        
        return {
            "face_id": face_id,
            "face_name": face.name,
            "total_encodings": len(encoding_list),
            "embeddings": encoding_list
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting face encodings for face {face_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get encodings: {str(e)}")

@app.get("/api/faces/{face_id}/cleanup/encodings")
async def get_cleanup_encodings(face_id: int, threshold: float = 0.3, db: AsyncSession = Depends(get_db)):
    """
    Get encodings for cleanup view with similarity scores already calculated.
    Backend compares all encodings to primary using cosine similarity.
    
    Args:
        face_id: Face ID to cleanup
        threshold: Similarity threshold (0-1, default 0.3 = 30%)
    
    Returns:
        Pre-scored encodings sorted by similarity to primary (or best quality if no primary)
    """
    try:
        # Verify face exists
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Get primary encoding, or fall back to best quality
        primary_encoding = None
        primary_is_fallback = False
        
        if face.primary_encoding_id:
            primary_result = await db.execute(
                select(FaceEncoding).where(FaceEncoding.id == face.primary_encoding_id)
            )
            primary_encoding = primary_result.scalar_one_or_none()
        
        # Fall back to best quality encoding if no primary or primary invalid
        if not primary_encoding or not primary_encoding.encoding:
            best_result = await db.execute(
                select(FaceEncoding)
                .where(FaceEncoding.face_id == face_id)
                .order_by(FaceEncoding.quality_score.desc())
                .limit(1)
            )
            primary_encoding = best_result.scalar_one_or_none()
            primary_is_fallback = True

        if not primary_encoding or not primary_encoding.encoding:
            raise HTTPException(status_code=400, detail="Face has no valid encodings")

        # Decode primary vector
        primary_vector = face_service.base64_to_encoding(primary_encoding.encoding)

        # Get all encodings for this face with video info
        encodings_result = await db.execute(
            select(FaceEncoding, Video.name)
            .outerjoin(Video, FaceEncoding.video_id == Video.id)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.quality_score.desc())
        )
        encodings_data = encodings_result.all()

        # Score each encoding vs primary
        scored_list = []
        for enc, video_name in encodings_data:
            is_primary = (enc.id == primary_encoding.id)  # Use best quality as reference
            
            # Calculate similarity
            similarity = 1.0 if is_primary else 0.0
            if not is_primary and enc.encoding:
                try:
                    enc_vector = face_service.base64_to_encoding(enc.encoding)
                    similarity = face_service.calculate_similarity(primary_vector, enc_vector)
                except Exception as e:
                    logger.warning(f"Error calculating similarity for encoding {enc.id}: {e}")
                    similarity = 0.0

            # Determine quality level based on similarity
            if is_primary:
                quality_level = "primary"
            elif similarity >= 0.75:
                quality_level = "good"
            elif similarity >= threshold:
                quality_level = "acceptable"
            else:
                quality_level = "poor"

            scored_list.append({
                "id": enc.id,
                "video_id": enc.video_id,
                "video_name": video_name or "Unknown Video",
                "frame_timestamp": float(enc.frame_timestamp) if enc.frame_timestamp else None,
                "thumbnail": enc.thumbnail or "",
                "confidence": float(enc.confidence) if enc.confidence else 0.0,
                "quality_score": float(enc.quality_score) if enc.quality_score else 0.0,
                "created_at": enc.created_at.isoformat() if enc.created_at and hasattr(enc.created_at, 'isoformat') else str(enc.created_at) if enc.created_at else None,
                "vector_similarity": float(similarity),  # Backend-calculated
                "quality_level": quality_level,  # "primary", "good", "acceptable", "poor"
                "is_primary": is_primary
            })

        # Sort: primary first, then by similarity descending
        primary = [e for e in scored_list if e["is_primary"]]
        others = [e for e in scored_list if not e["is_primary"]]
        others.sort(key=lambda e: e["vector_similarity"], reverse=True)
        scored_list = primary + others

        logger.info(f"Prepared {len(scored_list)} encodings for cleanup (face {face_id}, threshold {threshold})")
        
        return {
            "face_id": face_id,
            "face_name": face.name,
            "total_encodings": len(scored_list),
            "threshold": float(threshold),
            "default_threshold": 0.3,
            "encodings": scored_list
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cleanup encodings for face {face_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get cleanup data: {str(e)}")

@app.get("/api/faces/{face_id}/best-encoding")
async def get_best_encoding_for_face(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get the best quality encoding for a face across all videos"""
    try:
        # Verify face exists
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            logger.warning(f"Face {face_id} not found")
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Get best encoding by quality score
        encoding_result = await db.execute(
            select(FaceEncoding, Video.name)
            .outerjoin(Video, FaceEncoding.video_id == Video.id)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.quality_score.desc(), FaceEncoding.confidence.desc())
            .limit(1)
        )
        encoding_data = encoding_result.first()

        if not encoding_data:
            # No encodings available
            return {
                "face_id": face_id,
                "face_name": face.name,
                "encoding": None,
                "message": "No encodings available for this face"
            }

        enc, video_name = encoding_data
        return {
            "face_id": face_id,
            "face_name": face.name,
            "encoding": {
                "id": enc.id,
                "video_id": enc.video_id,
                "video_name": video_name or "Unknown Video",
                "frame_timestamp": float(enc.frame_timestamp) if enc.frame_timestamp else None,
                "thumbnail": enc.thumbnail or "",
                "confidence": float(enc.confidence) if enc.confidence else 0.0,
                "quality_score": float(enc.quality_score) if enc.quality_score else 0.0,
                "created_at": enc.created_at.isoformat() if enc.created_at and hasattr(enc.created_at, 'isoformat') else str(enc.created_at) if enc.created_at else None
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting best encoding for face {face_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get best encoding: {str(e)}")

@app.get("/api/faces/{face_id}/duplicate-analysis")
async def analyze_duplicate_embeddings(face_id: int, db: AsyncSession = Depends(get_db)):
    """Analyze embeddings for duplicates and suggest which ones to keep/delete"""
    try:
        import numpy as np
        from sklearn.metrics.pairwise import cosine_similarity
        import base64
        
        # Verify face exists
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            logger.warning(f"Face {face_id} not found")
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Get all encodings for this face
        encodings_result = await db.execute(
            select(FaceEncoding, Video.name)
            .outerjoin(Video, FaceEncoding.video_id == Video.id)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.quality_score.desc())
        )
        encodings_data = encodings_result.all()
        
        if not encodings_data:
            return {
                "face_id": face_id,
                "face_name": face.name,
                "total_encodings": 0,
                "groups": [],
                "summary": "No embeddings to analyze"
            }

        # Decode embeddings and prepare data
        embeddings_list = []
        for enc, video_name in encodings_data:
            try:
                # Decode base64 embedding vector
                embedding_bytes = base64.b64decode(enc.encoding)
                embedding_array = np.frombuffer(embedding_bytes, dtype=np.float32)
                
                embeddings_list.append({
                    "id": enc.id,
                    "video_id": enc.video_id,
                    "video_name": video_name or "Unknown Video",
                    "frame_timestamp": float(enc.frame_timestamp) if enc.frame_timestamp else None,
                    "confidence": float(enc.confidence) if enc.confidence else 0.0,
                    "quality_score": float(enc.quality_score) if enc.quality_score else 0.0,
                    "thumbnail": enc.thumbnail or "",
                    "vector": embedding_array
                })
            except Exception as e:
                logger.error(f"Error decoding embedding {enc.id}: {str(e)}")
                continue

        if len(embeddings_list) < 2:
            return {
                "face_id": face_id,
                "face_name": face.name,
                "total_encodings": len(embeddings_list),
                "groups": [{
                    "group_id": 0,
                    "embeddings": [
                        {k: v for k, v in emb.items() if k != "vector"}
                        for emb in embeddings_list
                    ],
                    "similarity": 1.0,
                    "best_embedding_id": embeddings_list[0]["id"] if embeddings_list else None,
                    "suggested_for_deletion": []
                }],
                "summary": "Only one embedding, no duplicates"
            }

        # Extract vectors for similarity calculation
        vectors = np.array([emb["vector"] for emb in embeddings_list])
        
        # Calculate similarity matrix
        similarity_matrix = cosine_similarity(vectors)
        
        # Group similar embeddings (threshold: > 0.95 similarity)
        similarity_threshold = 0.95
        visited = set()
        groups = []
        
        for i in range(len(embeddings_list)):
            if i in visited:
                continue
            
            # Find all embeddings similar to this one
            group_indices = [i]
            visited.add(i)
            
            for j in range(i + 1, len(embeddings_list)):
                if j not in visited and similarity_matrix[i][j] > similarity_threshold:
                    group_indices.append(j)
                    visited.add(j)
            
            # Sort group by quality score (descending)
            group_indices.sort(key=lambda idx: embeddings_list[idx]["quality_score"], reverse=True)
            
            # Build group data
            group_embeddings = [
                {k: v for k, v in embeddings_list[idx].items() if k != "vector"}
                for idx in group_indices
            ]
            
            # Best embedding is the one with highest quality score (first in sorted list)
            best_embedding_id = embeddings_list[group_indices[0]]["id"]
            
            # Suggest deleting lower quality duplicates
            suggested_for_deletion = []
            if len(group_indices) > 1:
                # Keep the best one, suggest deleting others
                for idx in group_indices[1:]:
                    suggested_for_deletion.append({
                        "id": embeddings_list[idx]["id"],
                        "reason": f"Duplicate with quality score {embeddings_list[idx]['quality_score']:.2f} (lower than best {embeddings_list[group_indices[0]]['quality_score']:.2f})"
                    })
            
            groups.append({
                "group_id": len(groups),
                "embeddings": group_embeddings,
                "similarity": float(similarity_matrix[group_indices[0]][group_indices[-1]]) if len(group_indices) > 1 else 1.0,
                "best_embedding_id": best_embedding_id,
                "suggested_for_deletion": suggested_for_deletion
            })
        
        # Count total suggested deletions
        total_suggested_deletions = sum(len(g["suggested_for_deletion"]) for g in groups)
        
        return {
            "face_id": face_id,
            "face_name": face.name,
            "total_encodings": len(embeddings_list),
            "groups": groups,
            "summary": f"{len(groups)} group(s) found, {total_suggested_deletions} embedding(s) suggested for deletion"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error analyzing duplicates for face {face_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to analyze duplicates: {str(e)}")

@app.get("/api/faces/group/similar")
async def group_similar_faces(threshold: float = 0.5, db: AsyncSession = Depends(get_db)):
    """
    Group all faces in catalog by similarity.
    Uses primary encodings if available, otherwise falls back to best quality encoding.
    
    Args:
        threshold: Similarity threshold for grouping (default 0.5 = 50%)
    
    Returns:
        Groups of similar faces with primary encoding similarity scores
    """
    try:
        # Step 1: Load all faces
        faces_result = await db.execute(
            select(FaceID)
            .order_by(FaceID.updated_at.desc())
        )
        faces = faces_result.scalars().all()

        if not faces:
            return {
                "groups": [],
                "total_faces": 0,
                "summary": "No faces in catalog"
            }

        # Step 2: Get video counts for all faces in a separate query
        video_counts_result = await db.execute(
            select(
                FaceID.id,
                func.count(VideoFace.id).label('video_count')
            )
            .outerjoin(VideoFace, FaceID.id == VideoFace.face_id)
            .group_by(FaceID.id)
        )
        video_counts_data = video_counts_result.all()
        video_counts_map = {face_id: count for face_id, count in video_counts_data}

        # Step 3: Build list of faces with valid encodings (primary or fallback)
        faces_with_encodings = []
        faces_without_encodings = []

        for face in faces:
            encoding = None
            
            # Try primary encoding first
            if face.primary_encoding_id:
                primary_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.id == face.primary_encoding_id)
                )
                encoding = primary_result.scalar_one_or_none()
            
            # Fall back to best quality encoding if needed
            if not encoding or not encoding.encoding:
                best_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.face_id == face.id)
                    .order_by(FaceEncoding.quality_score.desc())
                    .limit(1)
                )
                encoding = best_result.scalar_one_or_none()
            
            # Add face with valid encoding
            if encoding and encoding.encoding:
                try:
                    encoding_vector = face_service.base64_to_encoding(encoding.encoding)
                    video_count = video_counts_map.get(face.id, 0)
                    faces_with_encodings.append({
                        "face_id": face.id,
                        "face_name": face.name,
                        "encoding_id": encoding.id,
                        "vector": encoding_vector,
                        "thumbnail": encoding.thumbnail,
                        "encoding_count": face.encoding_count,
                        "video_count": video_count
                    })
                except Exception as e:
                    logger.error(f"Error decoding encoding for face {face.id}: {e}")
                    faces_without_encodings.append(face.id)
            else:
                faces_without_encodings.append(face.id)

        if not faces_with_encodings:
            return {
                "groups": [],
                "total_faces": len(faces),
                "faces_without_encoding": len(faces_without_encodings),
                "summary": "No faces with encodings to compare"
            }

        # Step 4: Calculate similarity matrix
        vectors = np.array([f["vector"] for f in faces_with_encodings])
        similarity_matrix = cosine_similarity(vectors)

        # Step 5: Group similar faces
        visited = set()
        groups = []

        for i in range(len(faces_with_encodings)):
            if i in visited:
                continue

            # Find all faces similar to this one
            group_indices = [i]
            visited.add(i)

            for j in range(i + 1, len(faces_with_encodings)):
                if j not in visited and similarity_matrix[i][j] > threshold:
                    group_indices.append(j)
                    visited.add(j)

            # Build group data
            group_faces = []
            for idx in group_indices:
                face_data = faces_with_encodings[idx]
                # Calculate similarity to first face in group
                similarity_to_primary = float(similarity_matrix[i][idx]) if idx != i else 1.0

                group_faces.append({
                    "face_id": face_data["face_id"],
                    "name": face_data["face_name"],
                    "similarity_to_primary": similarity_to_primary,
                    "similarity_percent": round(similarity_to_primary * 100, 1),
                    "encoding_count": face_data["encoding_count"],
                    "video_count": face_data["video_count"],
                    "thumbnail": face_data["thumbnail"]
                })

            # Only add groups with multiple faces (potential duplicates)
            if len(group_faces) > 1:
                groups.append({
                    "group_id": len(groups),
                    "faces": group_faces,
                    "face_count": len(group_faces),
                    "primary_face_id": group_faces[0]["face_id"],
                    "can_merge": len(group_faces) >= 2
                })

        return {
            "groups": groups,
            "total_faces": len(faces_with_encodings),
            "faces_without_primary_encoding": len(faces_without_encodings),
            "group_count": len(groups),
            "faces_in_groups": sum(g["face_count"] for g in groups),
            "summary": f"Found {len(groups)} group(s) with {sum(g['face_count'] for g in groups)} potentially similar faces"
        }

    except Exception as e:
        logger.error(f"Error grouping similar faces: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to group faces: {str(e)}")

@app.post("/api/faces/compare")
async def compare_faces(
    request: CompareFacesRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Compare selected faces and return pairwise similarity scores.
    Uses primary encodings if available, otherwise uses best quality encoding.
    
    Args:
        face_ids: List of face IDs to compare (minimum 2)
    
    Returns:
        Similarity matrix and comparison data
    """
    try:
        face_ids = request.face_ids
        if not face_ids or len(face_ids) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 faces to compare")

        # Load all selected faces
        faces_result = await db.execute(
            select(FaceID)
            .where(FaceID.id.in_(face_ids))
        )
        faces = faces_result.scalars().all()

        if len(faces) < 2:
            raise HTTPException(status_code=400, detail="Not enough faces found to compare")

        # Build list of faces with valid encodings
        faces_data = []
        for face in faces:
            encoding = None
            
            # First, try to get primary encoding
            if face.primary_encoding_id:
                primary_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.id == face.primary_encoding_id)
                )
                encoding = primary_result.scalar_one_or_none()
            
            # If no primary encoding or it's invalid, get best quality encoding
            if not encoding or not encoding.encoding:
                best_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.face_id == face.id)
                    .order_by(FaceEncoding.quality_score.desc())
                    .limit(1)
                )
                encoding = best_result.scalar_one_or_none()
            
            # Add face with valid encoding
            if encoding and encoding.encoding:
                try:
                    encoding_vector = face_service.base64_to_encoding(encoding.encoding)
                    faces_data.append({
                        "face_id": face.id,
                        "face_name": face.name,
                        "encoding_id": encoding.id,
                        "vector": encoding_vector,
                        "thumbnail": encoding.thumbnail,
                        "encoding_count": face.encoding_count
                    })
                except Exception as e:
                    logger.error(f"Error decoding encoding for face {face.id}: {e}")
                    # Continue to next face if decode fails
                    continue

        if len(faces_data) < 2:
            raise HTTPException(status_code=400, detail=f"Not enough valid faces to compare. Found {len(faces_data)}/required 2. Some faces may not have any encodings.")

        # Calculate pairwise similarities
        vectors = np.array([f["vector"] for f in faces_data])
        similarity_matrix = cosine_similarity(vectors)

        # Build comparison results
        comparisons = []
        for i in range(len(faces_data)):
            for j in range(i + 1, len(faces_data)):
                similarity = float(similarity_matrix[i][j])
                comparisons.append({
                    "face1_id": faces_data[i]["face_id"],
                    "face1_name": faces_data[i]["face_name"],
                    "face2_id": faces_data[j]["face_id"],
                    "face2_name": faces_data[j]["face_name"],
                    "similarity": similarity,
                    "similarity_percent": round(similarity * 100, 1),
                    "would_group_at_75": similarity >= 0.75,
                    "would_group_at_70": similarity >= 0.70
                })

        # Sort by similarity (highest first)
        comparisons.sort(key=lambda x: -x["similarity"])

        # Build face data response
        faces_response = [
            {
                "face_id": f["face_id"],
                "face_name": f["face_name"],
                "thumbnail": f["thumbnail"],
                "encoding_count": f["encoding_count"]
            }
            for f in faces_data
        ]

        return {
            "faces": faces_response,
            "comparisons": comparisons,
            "total_comparisons": len(comparisons),
            "summary": f"Comparing {len(faces_data)} faces - {len(comparisons)} pair(s)"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error comparing faces: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to compare faces: {str(e)}")

@app.get("/api/faces/{face_id}")
async def get_face_details(face_id: int, db: AsyncSession = Depends(get_db)):
    """
    Get detailed information about a specific face
    """
    try:
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        # Load all encodings for this face
        encodings_result = await db.execute(
            select(FaceEncoding)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.created_at.desc())
        )
        encodings = encodings_result.scalars().all()

        # Load associated videos
        video_ids = list(set([enc.video_id for enc in encodings]))
        videos = []
        for vid_id in video_ids:
            video = await db.get(Video, vid_id)
            if video:
                videos.append({
                    "id": video.id,
                    "name": video.name,
                    "display_name": video.display_name,
                    "category": video.category
                })

        return {
            "id": face.id,
            "name": face.name,
            "actor_id": face.actor_id,
            "encoding_count": face.encoding_count,
            "encodings": [
                {
                    "id": enc.id,
                    "video_id": enc.video_id,
                    "frame_timestamp": enc.frame_timestamp,
                    "confidence": enc.confidence,
                    "quality_score": enc.quality_score,
                    "thumbnail": enc.thumbnail,
                    "created_at": enc.created_at
                }
                for enc in encodings
            ],
            "videos": videos,
            "created_at": face.created_at,
            "updated_at": face.updated_at
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error loading face details: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to load face details: {str(e)}")

@app.post("/api/faces/merge")
async def merge_faces(
    request: MergeFacesRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Merge multiple face_ids into one

    All encodings from source faces are moved to the first face_id,
    VideoFace mappings are updated to point to the target face,
    then source faces are deleted.
    """
    try:
        face_ids = request.face_ids
        target_name = request.target_name
        target_actor_id = request.target_actor_id
        
        if len(face_ids) < 2:
            raise HTTPException(status_code=400, detail="Need at least 2 faces to merge")

        # Load all faces
        faces = []
        for face_id in face_ids:
            face = await db.get(FaceID, face_id)
            if not face:
                raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")
            faces.append(face)

        # Use first face as target
        target_face = faces[0]
        source_faces = faces[1:]

        # Move all encodings to target face
        total_moved = 0
        for source_face in source_faces:
            # Update encodings to point to target face
            encodings_result = await db.execute(
                select(FaceEncoding).where(FaceEncoding.face_id == source_face.id)
            )
            encodings = encodings_result.scalars().all()

            for encoding in encodings:
                encoding.face_id = target_face.id
                total_moved += 1

            # Update VideoFace mappings to point to target face
            video_faces_result = await db.execute(
                select(VideoFace).where(VideoFace.face_id == source_face.id)
            )
            video_faces = video_faces_result.scalars().all()

            for video_face in video_faces:
                # Check if target face is already mapped to this video
                existing_result = await db.execute(
                    select(VideoFace).where(
                        (VideoFace.video_id == video_face.video_id) &
                        (VideoFace.face_id == target_face.id)
                    )
                )
                existing = existing_result.scalar_one_or_none()

                if existing:
                    # Merge appearance counts
                    existing.appearance_count += video_face.appearance_count
                    await db.delete(video_face)
                else:
                    # Remap to target face
                    video_face.face_id = target_face.id

            # Delete source face
            await db.delete(source_face)

        # Update target face
        target_face.encoding_count += total_moved
        target_face.updated_at = time.time()

        if target_name:
            target_face.name = target_name
        if target_actor_id is not None:
            target_face.actor_id = target_actor_id

        await db.commit()
        await db.refresh(target_face)

        return {
            "success": True,
            "target_face_id": target_face.id,
            "name": target_face.name,
            "encoding_count": target_face.encoding_count,
            "merged_count": len(source_faces),
            "message": f"Merged {len(source_faces)} faces into {target_face.name}"
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error merging faces: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to merge faces: {str(e)}")

@app.delete("/api/faces/{face_id}")
async def delete_face(face_id: int, db: AsyncSession = Depends(get_db)):
    """
    Delete a face_id and all its encodings
    """
    try:
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        face_name = face.name
        encoding_count = face.encoding_count

        # Delete face (encodings will be cascade deleted)
        await db.delete(face)
        await db.commit()

        return {
            "success": True,
            "deleted_face_id": face_id,
            "name": face_name,
            "deleted_encodings": encoding_count,
            "message": f"Deleted face {face_name} and {encoding_count} encodings"
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error deleting face: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to delete face: {str(e)}")

@app.put("/api/faces/{face_id}")
async def update_face(
    face_id: int,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Update face_id name or actor link
    """
    try:
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        # Update name if provided
        if 'name' in body and body['name']:
            face.name = body['name']
        
        # Update actor_id - explicitly handle null
        if 'actor_id' in body:
            face.actor_id = body['actor_id']

        face.updated_at = time.time()

        await db.commit()
        await db.refresh(face)

        return {
            "success": True,
            "face_id": face.id,
            "name": face.name,
            "actor_id": face.actor_id,
            "message": f"Updated face {face.name}"
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error updating face: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update face: {str(e)}")

@app.get("/api/faces/stats")
async def get_face_stats(db: AsyncSession = Depends(get_db)):
    """Get face recognition statistics"""
    try:
        # Count total faces
        total_faces_result = await db.execute(select(func.count(FaceID.id)))
        total_faces = total_faces_result.scalar()

        # Count total encodings
        total_encodings_result = await db.execute(select(func.count(FaceEncoding.id)))
        total_encodings = total_encodings_result.scalar()

        # Count faces linked to actors
        linked_faces_result = await db.execute(
            select(func.count(FaceID.id)).where(FaceID.actor_id.isnot(None))
        )
        linked_faces = linked_faces_result.scalar()

        # Get average encodings per face
        avg_encodings = total_encodings / total_faces if total_faces > 0 else 0

        # Count orphaned faces (no encodings)
        orphaned_faces_result = await db.execute(
            select(func.count(FaceID.id)).where(FaceID.encoding_count == 0)
        )
        orphaned_faces = orphaned_faces_result.scalar()

        # Count encodings with no video (video_id is NULL - deleted videos)
        orphaned_encodings_result = await db.execute(
            select(func.count(FaceEncoding.id)).where(FaceEncoding.video_id.is_(None))
        )
        orphaned_encodings = orphaned_encodings_result.scalar()

        return {
            "total_faces": total_faces,
            "total_encodings": total_encodings,
            "linked_to_actors": linked_faces,
            "avg_encodings_per_face": round(avg_encodings, 1),
            "orphaned_faces": orphaned_faces,
            "orphaned_encodings": orphaned_encodings
        }

    except Exception as e:
        logger.error(f"Error getting face stats: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get stats: {str(e)}")

@app.post("/api/faces/cleanup-orphans")
async def cleanup_orphaned_faces(db: AsyncSession = Depends(get_db)):
    """Clean up orphaned faces (no encodings or no video links)"""
    try:
        # Find faces with no encodings
        faces_no_encodings_result = await db.execute(
            select(FaceID).where(FaceID.encoding_count == 0)
        )
        faces_no_encodings = faces_no_encodings_result.scalars().all()

        # Find faces with no video links
        faces_no_videos_result = await db.execute(
            select(FaceID)
            .outerjoin(VideoFace, VideoFace.face_id == FaceID.id)
            .where(VideoFace.id.is_(None))
        )
        faces_no_videos = faces_no_videos_result.scalars().all()

        # Combine unique faces (some may be in both lists)
        orphaned_faces = {face.id: face for face in faces_no_encodings + faces_no_videos}

        deleted_count = 0
        deleted_names = []

        for face_id, face in orphaned_faces.items():
            logger.info(f"Deleting orphaned face: {face.name} (id={face_id})")
            await db.delete(face)
            deleted_count += 1
            deleted_names.append(face.name)

        await db.commit()

        return {
            "deleted_count": deleted_count,
            "deleted_faces": deleted_names,
            "message": f"Cleaned up {deleted_count} orphaned face(s)"
        }

    except Exception as e:
        logger.error(f"Error cleaning up orphaned faces: {e}")
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to cleanup faces: {str(e)}")

@app.put("/api/faces/{face_id}/primary-encoding/{encoding_id}")
async def set_primary_encoding(face_id: int, encoding_id: int, db: AsyncSession = Depends(get_db)):
    """Set the primary/preview encoding for a face"""
    try:
        # Verify face exists
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Verify encoding exists and belongs to this face
        encoding_result = await db.execute(
            select(FaceEncoding).where(
                FaceEncoding.id == encoding_id,
                FaceEncoding.face_id == face_id
            )
        )
        encoding = encoding_result.scalar_one_or_none()

        if not encoding:
            raise HTTPException(status_code=404, detail=f"Encoding {encoding_id} not found or doesn't belong to face {face_id}")

        # Update face with primary encoding
        face.primary_encoding_id = encoding_id
        face.updated_at = time.time()
        await db.commit()

        logger.info(f"✅ Set primary encoding {encoding_id} for face {face_id}")

        return {
            "success": True,
            "face_id": face_id,
            "primary_encoding_id": encoding_id,
            "message": f"Primary encoding set successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting primary encoding: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to set primary encoding: {str(e)}")

@app.get("/api/faces/{face_id}/videos")
async def get_face_videos(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get all videos where this face appears (using VideoFace junction table)"""
    try:
        # Verify face exists
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Get all videos linked to this face via VideoFace table
        videos_result = await db.execute(
            select(Video, VideoFace.appearance_count, VideoFace.detection_method, VideoFace.first_detected_at)
            .join(VideoFace, Video.id == VideoFace.video_id)
            .where(VideoFace.face_id == face_id)
            .order_by(VideoFace.appearance_count.desc())
        )
        video_rows = videos_result.all()

        # Format videos
        video_list = []
        for video, appearance_count, detection_method, first_detected_at in video_rows:
            video_list.append({
                "video": {
                    "id": video.id,
                    "name": video.name,
                    "display_name": video.display_name,
                    "path": video.path,
                    "category": video.category,
                    "subcategory": video.subcategory,
                    "modified": video.modified,
                    "size": video.size,
                    "duration": video.duration,
                    "thumbnail_url": video.thumbnail_url,
                    "media_type": video.media_type or 'video'
                },
                "appearance_count": appearance_count,
                "detection_method": detection_method,
                "first_detected_at": first_detected_at
            })

        return {
            "face_id": face_id,
            "face_name": face.name,
            "total_videos": len(video_list),
            "videos": video_list
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting face videos: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get videos: {str(e)}")

@app.get("/api/faces/{face_id}/images")
async def get_face_images(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get all images where this face appears (using VideoFace junction table)"""
    try:
        # Verify face exists
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Get all images linked to this face via VideoFace table
        # Images are stored in Video table with media_type = 'image'
        images_result = await db.execute(
            select(Video, VideoFace.appearance_count, VideoFace.detection_method, VideoFace.first_detected_at)
            .join(VideoFace, Video.id == VideoFace.video_id)
            .where((VideoFace.face_id == face_id) & (Video.media_type == 'image'))
            .order_by(VideoFace.appearance_count.desc())
        )
        image_rows = images_result.all()

        # Format images
        image_list = []
        for image, appearance_count, detection_method, first_detected_at in image_rows:
            image_list.append({
                "image": {
                    "id": image.id,
                    "name": image.name,
                    "display_name": image.display_name,
                    "path": image.path,
                    "category": image.category,
                    "subcategory": image.subcategory,
                    "modified": image.modified,
                    "size": image.size,
                    "thumbnail_url": image.thumbnail_url,
                    "media_type": image.media_type or 'image'
                },
                "appearance_count": appearance_count,
                "detection_method": detection_method,
                "first_detected_at": first_detected_at
            })

        return {
            "face_id": face_id,
            "face_name": face.name,
            "total_images": len(image_list),
            "images": image_list
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting face images: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get images: {str(e)}")

@app.put("/api/faces/{face_id}/rename")
async def rename_face(face_id: int, request: dict, db: AsyncSession = Depends(get_db)):
    """Rename a face"""
    try:
        new_name = request.get("name")
        if not new_name or not new_name.strip():
            raise HTTPException(status_code=400, detail="Name is required")

        # Get face
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Update name
        face.name = new_name.strip()
        face.updated_at = datetime.now()

        await db.commit()

        return {
            "success": True,
            "face_id": face_id,
            "name": face.name
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error renaming face: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to rename face: {str(e)}")

@app.post("/api/videos/{video_id}/faces/{face_id}/link")
async def link_face_to_video(
    video_id: int,
    face_id: int,
    request: LinkFaceToVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Link a face to a video (creates relationship without adding duplicate encoding)

    This should be used when a face search finds a match - instead of storing
    the encoding again, we just record that this face appears in this video.
    """
    try:
        # Verify video exists
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        # Verify face exists
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Check if link already exists
        existing_link_result = await db.execute(
            select(VideoFace)
            .where(VideoFace.video_id == video_id)
            .where(VideoFace.face_id == face_id)
        )
        existing_link = existing_link_result.scalar_one_or_none()

        if existing_link:
            # Link already exists, just increment appearance count
            existing_link.appearance_count += 1
            await db.commit()

            return {
                "success": True,
                "message": f"Face {face.name} already linked to this video (appearance count: {existing_link.appearance_count})",
                "video_face_id": existing_link.id,
                "appearance_count": existing_link.appearance_count,
                "already_existed": True
            }

        # Create new link
        video_face = VideoFace(
            video_id=video_id,
            face_id=face_id,
            detection_method=request.detection_method,
            appearance_count=1
        )

        db.add(video_face)
        await db.commit()
        await db.refresh(video_face)

        return {
            "success": True,
            "message": f"Linked face {face.name} to video {video.display_name or video.name}",
            "video_face_id": video_face.id,
            "face_name": face.name,
            "video_name": video.display_name or video.name,
            "already_existed": False
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error linking face to video: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to link face: {str(e)}")

# ==================== VIDEO-FACE RELATIONSHIP ENDPOINTS ====================

@app.get("/api/videos/{video_id}/faces")
async def get_video_faces(video_id: int, db: AsyncSession = Depends(get_db)):
    """Get all faces that appear in a specific video"""
    try:
        # Verify video exists
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        # Get all faces linked to this video via video_faces junction table
        video_faces_result = await db.execute(
            select(VideoFace, FaceID, FaceEncoding)
            .join(FaceID, VideoFace.face_id == FaceID.id)
            .outerjoin(
                FaceEncoding,
                and_(
                    FaceEncoding.face_id == FaceID.id,
                    FaceEncoding.video_id == video_id
                )
            )
            .where(VideoFace.video_id == video_id)
            .order_by(VideoFace.first_detected_at.desc())
        )

        results = video_faces_result.all()

        # Group by face to get best thumbnail
        faces_dict = {}
        for video_face, face, encoding in results:
            if face.id not in faces_dict:
                # Get encoding thumbnail - use primary if set, otherwise best quality
                if face.primary_encoding_id:
                    # Use user-selected primary encoding
                    best_encoding_result = await db.execute(
                        select(FaceEncoding)
                        .where(FaceEncoding.id == face.primary_encoding_id)
                    )
                    best_encoding = best_encoding_result.scalar_one_or_none()
                else:
                    # Fall back to best quality encoding from ANY video
                    best_encoding_result = await db.execute(
                        select(FaceEncoding)
                        .where(FaceEncoding.face_id == face.id)
                        .order_by(FaceEncoding.quality_score.desc())
                        .limit(1)
                    )
                    best_encoding = best_encoding_result.scalar_one_or_none()

                # Get all encodings for this face (for fallback thumbnail display)
                all_encodings_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.face_id == face.id)
                    .order_by(FaceEncoding.quality_score.desc())
                    .limit(200)  # Increased from 50 to 100 to 200 embeddings per face
                )
                all_encodings = all_encodings_result.scalars().all()

                faces_dict[face.id] = {
                    "id": face.id,
                    "name": face.name,
                    "actor_id": face.actor_id,
                    "thumbnail": best_encoding.thumbnail if best_encoding else None,
                    "embeddings": [
                        {
                            "id": enc.id,
                            "thumbnail": enc.thumbnail,
                            "quality_score": enc.quality_score
                        }
                        for enc in all_encodings
                    ],
                    "appearance_count": video_face.appearance_count,
                    "first_detected_at": video_face.first_detected_at,
                    "detection_method": video_face.detection_method
                }

        return {
            "video_id": video_id,
            "video_name": video.name,
            "faces": list(faces_dict.values()),
            "total_faces": len(faces_dict)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting video faces: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get video faces: {str(e)}")

@app.post("/api/videos/{video_id}/faces/{face_id}")
async def link_face_to_video(
    video_id: int,
    face_id: int,
    request: LinkFaceToVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    """Link a face to a video (create video_faces relationship)"""
    detection_method = request.detection_method
    try:
        # Verify video exists
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        # Verify face exists
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        # Check if relationship already exists
        existing = await db.execute(
            select(VideoFace).where(
                and_(
                    VideoFace.video_id == video_id,
                    VideoFace.face_id == face_id
                )
            )
        )
        if existing.scalar_one_or_none():
            return {
                "message": "Face already linked to this video",
                "video_id": video_id,
                "face_id": face_id
            }

        # Count existing encodings for this face in this video
        encoding_count_result = await db.execute(
            select(func.count(FaceEncoding.id))
            .where(
                and_(
                    FaceEncoding.face_id == face_id,
                    FaceEncoding.video_id == video_id
                )
            )
        )
        encoding_count = encoding_count_result.scalar()

        # Create video_faces relationship
        import time
        video_face = VideoFace(
            video_id=video_id,
            face_id=face_id,
            first_detected_at=time.time(),
            detection_method=detection_method,
            appearance_count=encoding_count,
            created_at=time.time()
        )
        db.add(video_face)
        await db.commit()

        return {
            "success": True,
            "message": "Face linked to video successfully",
            "video_id": video_id,
            "face_id": face_id,
            "face_name": face.name,
            "appearance_count": encoding_count
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error linking face to video: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to link face: {str(e)}")

@app.delete("/api/videos/{video_id}/faces/{face_id}")
async def unlink_face_from_video(
    video_id: int,
    face_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Unlink a face from a video (remove video_faces relationship)"""
    try:
        # Find the relationship
        result = await db.execute(
            select(VideoFace).where(
                and_(
                    VideoFace.video_id == video_id,
                    VideoFace.face_id == face_id
                )
            )
        )
        video_face = result.scalar_one_or_none()

        if not video_face:
            raise HTTPException(
                status_code=404,
                detail=f"Face {face_id} is not linked to video {video_id}"
            )

        # Delete the relationship (encodings remain intact)
        await db.delete(video_face)
        await db.commit()

        return {
            "success": True,
            "message": "Face unlinked from video successfully",
            "video_id": video_id,
            "face_id": face_id
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error unlinking face from video: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to unlink face: {str(e)}")

@app.post("/api/videos/{video_id}/detect-faces")
async def detect_faces_for_review(
    video_id: int,
    num_frames: int = 10,
    max_duration: Optional[float] = None,
    db: AsyncSession = Depends(get_db)
):
    """
    Detect faces in a video for user review (without auto-adding to database)

    Returns detected faces with thumbnails and matching information for user to review.
    User can then confirm which faces to add with the add-faces endpoint.

    Args:
        video_id: Video ID to scan
        num_frames: Number of random frames to extract (default: 10, max: 50)
        max_duration: Optional max duration in seconds to limit scanning (e.g., 3.0 for first 3 seconds)

    Returns:
        Dictionary with detected faces, thumbnails, and match information
    """
    try:
        # In fast mode (max_duration specified), reduce frames for faster processing
        if max_duration and max_duration > 0:
            num_frames = 5  # Fast mode: 5 frames instead of 10
            logger.info(f"Fast mode: reducing to {num_frames} frames for first {max_duration}s")
        
        # Limit frame count
        num_frames = min(max(1, num_frames), 50)

        # Verify video exists
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        # Get full video path
        video_path = video.path
        if not Path(video_path).exists():
            raise HTTPException(
                status_code=404,
                detail=f"Video file not found at {video_path}"
            )

        # Detect faces without storing
        logger.info(f"Starting face detection for review on video {video_id}: {video.name}")
        detection_result = await face_service.detect_faces_for_review(
            db,
            video_id,
            video_path,
            num_frames,
            video.duration if video.duration else None,
            max_duration=max_duration
        )

        return {
            'status': detection_result['status'],
            'video_id': video_id,
            'video_name': video.display_name or video.name,
            'frames_scanned': detection_result.get('frames_scanned', 0),
            'detected_faces': detection_result['detected_faces'],
            'faces_with_matches': detection_result.get('faces_with_matches', 0),
            'faces_new': detection_result.get('faces_new', 0),
            'total_detected': len(detection_result['detected_faces']),
            'message': detection_result.get('message', '')
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error detecting faces for review on video {video_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to detect faces: {str(e)}")


@app.post("/api/videos/{video_id}/add-detected-faces")
async def add_detected_faces(
    video_id: int,
    request: dict = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Add user-selected detected faces to the database

    Takes the detected faces returned by detect-faces endpoint and adds them
    to the database after user confirms selection in the review modal.

    Args:
        video_id: Video ID
        request: Dictionary with 'detected_faces' list containing selected faces

    Returns:
        Dictionary with results of adding faces
    """
    try:
        # Verify video exists
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        detected_faces = request.get('detected_faces', [])
        if not detected_faces:
            return {
                'success': True,
                'faces_added': 0,
                'message': 'No faces selected to add'
            }

        logger.info(f"Adding {len(detected_faces)} selected faces to video {video_id}")

        face_ids_created = set()
        face_ids_linked = set()

        # Separate matched and unmatched faces
        matched_faces = []
        unmatched_faces = []

        for face_data in detected_faces:
            if face_data.get('is_match') and face_data.get('matched_face'):
                matched_faces.append(face_data)
            else:
                unmatched_faces.append(face_data)

        # Process matched faces (link to existing face IDs)
        for face_data in matched_faces:
            try:
                # Decode encoding from base64
                encoding = face_service.base64_to_encoding(face_data['encoding'])
                confidence = face_data['confidence']
                thumbnail_b64 = face_data.get('thumbnail')
                timestamp = face_data['timestamp']
                matched_face = face_data['matched_face']
                face_id = matched_face['face_id']

                # Add encoding to existing face
                await face_service.add_encoding_to_face(
                    db, face_id, video_id, timestamp,
                    encoding, confidence, thumbnail_b64
                )
                face_ids_linked.add(face_id)
                logger.debug(f"Added encoding to existing face {face_id}")

            except Exception as e:
                logger.warning(f"Error adding matched face: {e}")
                continue

        # Process unmatched faces
        # Group ALL unmatched faces into a SINGLE new face ID
        if unmatched_faces:
            try:
                # Create ONE new face for all unmatched faces (variations of same person)
                new_face = await face_service.create_face_id(db)
                face_id = new_face.id
                face_ids_created.add(face_id)

                logger.info(f"Created new face {new_face.id} to hold {len(unmatched_faces)} unmatched faces")

                # Add all unmatched faces as encodings to the single new face
                for face_data in unmatched_faces:
                    try:
                        encoding = face_service.base64_to_encoding(face_data['encoding'])
                        confidence = face_data['confidence']
                        thumbnail_b64 = face_data.get('thumbnail')
                        timestamp = face_data['timestamp']

                        # Add encoding to the new face
                        await face_service.add_encoding_to_face(
                            db, face_id, video_id, timestamp,
                            encoding, confidence, thumbnail_b64
                        )
                        logger.debug(f"Added encoding to new face {face_id}")
                    except Exception as e:
                        logger.warning(f"Error adding encoding to new face {face_id}: {e}")
                        continue

            except Exception as e:
                logger.warning(f"Error creating new face for unmatched faces: {e}")

        # Create VideoFace relationships for all unique faces
        unique_face_ids = face_ids_created | face_ids_linked

        for face_id in unique_face_ids:
            try:
                # Check if relationship already exists
                existing_result = await db.execute(
                    select(VideoFace).where(
                        (VideoFace.video_id == video_id) & (VideoFace.face_id == face_id)
                    )
                )
                existing = existing_result.scalar_one_or_none()

                if not existing:
                    # Create new VideoFace relationship
                    video_face = VideoFace(
                        video_id=video_id,
                        face_id=face_id,
                        detection_method='user_selected',
                        appearance_count=1
                    )
                    db.add(video_face)
                    logger.debug(f"Created VideoFace relationship: video {video_id} -> face {face_id}")
                else:
                    # Update existing relationship
                    existing.appearance_count += 1

            except Exception as e:
                logger.error(f"Error creating VideoFace relationship for face {face_id}: {e}")

        await db.commit()

        logger.info(f"Added faces complete: {len(face_ids_created)} new, {len(face_ids_linked)} linked")

        return {
            'success': True,
            'faces_added': len(unique_face_ids),
            'new_faces': len(face_ids_created),
            'linked_faces': len(face_ids_linked),
            'message': f"Successfully added {len(unique_face_ids)} face(s)"
        }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error adding detected faces: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add faces: {str(e)}")


@app.post("/api/videos/{video_id}/auto-scan-faces")
async def auto_scan_faces(
    video_id: int,
    num_frames: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """
    Auto-scan a video for faces at random frames and create/link face IDs

    Equivalent to pressing 'A' in the video player, but runs backend processing
    without opening the player.

    Args:
        video_id: Video ID to scan
        num_frames: Number of random frames to extract (default: 10, max: 50)

    Returns:
        Dictionary with scan results including face IDs created/linked
    """
    try:
        # Limit frame count
        num_frames = min(max(1, num_frames), 50)

        # Verify video exists
        video = await db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail=f"Video {video_id} not found")

        # Get full video path
        video_path = video.path
        if not Path(video_path).exists():
            raise HTTPException(
                status_code=404,
                detail=f"Video file not found at {video_path}"
            )

        # Run auto-scan
        logger.info(f"Starting auto-scan for video {video_id}: {video.name}")
        scan_result = await face_service.auto_scan_faces(
            db,
            video_id,
            video_path,
            num_frames,
            video.duration if video.duration else None
        )

        # Return scan results
        if scan_result['face_ids']:
            return {
                'status': scan_result['status'],
                'message': f"Auto-scan completed for {video.name}",
                'video_id': video_id,
                'video_name': video.display_name or video.name,
                'detected_count': scan_result['detected_count'],
                'new_faces_count': scan_result['new_faces_count'],
                'linked_faces_count': scan_result['linked_faces_count'],
                'total_unique_faces': len(scan_result['face_ids']),
                'face_ids': scan_result['face_ids'],
                'detections': scan_result['detections']
            }
        else:
            return {
                'status': 'completed',
                'message': f"Auto-scan completed for {video.name} - no faces detected",
                'video_id': video_id,
                'video_name': video.display_name or video.name,
                'detected_count': 0,
                'new_faces_count': 0,
                'linked_faces_count': 0,
                'total_unique_faces': 0,
                'face_ids': [],
                'detections': []
            }

    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        logger.error(f"Error auto-scanning faces for video {video_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to auto-scan faces: {str(e)}")

@app.get("/thumbnails/stats")
async def get_thumbnail_stats():
    """Get thumbnail cache statistics"""
    if not thumbnail_db:
        return {
            "thumbnail_count": 0,
            "cache_size_mb": 0,
            "ffmpeg_available": False,
            "error": "Thumbnail database not initialized"
        }

    # Get cache statistics
    count, size_mb = await thumbnail_db.get_cache_stats()

    return {
        "thumbnail_count": count,
        "cache_size_mb": size_mb,
        "ffmpeg_available": thumbnail_db.ffmpeg_available
    }

# ============================================================================
# M3U8 Download Endpoints (Simple utility - no database)
# ============================================================================

@app.post("/api/downloads/m3u8")
async def create_m3u8_download(request: M3U8DownloadRequest):
    """
    Start a new M3U8 video download in the background
    Downloads to {ROOT}/DOWNLOADS/ folder (auto-imported on scan)
    """
    try:
        downloader = get_downloader()
        download = downloader.create_download(
            url=request.url,
            start_time=request.start_time,
            end_time=request.end_time,
            filename=request.filename,
            use_ytdlp_fallback=request.use_ytdlp_fallback
        )

        return {
            "success": True,
            "download_id": download.id,
            "status": download.status,
            "filename": download.filename,
            "message": "Download started in background"
        }

    except Exception as e:
        logger.error(f"Failed to start download: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start download: {str(e)}")


@app.get("/api/downloads/{download_id}")
async def get_download_status(download_id: int):
    """Get status of a specific download"""
    try:
        downloader = get_downloader()
        download = downloader.get_download(download_id)

        if not download:
            raise HTTPException(status_code=404, detail="Download not found")

        return {
            "id": download.id,
            "url": download.url,
            "start_time": download.start_time,
            "end_time": download.end_time,
            "filename": download.filename,
            "status": download.status,
            "created_at": download.created_at,
            "completed_at": download.completed_at,
            "output_path": download.output_path,
            "error_message": download.error_message
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get download status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/downloads")
async def list_downloads(active_only: bool = False):
    """
    List all downloads
    Query param: active_only=true to show only pending/downloading
    """
    try:
        downloader = get_downloader()

        if active_only:
            downloads = downloader.list_active_downloads()
        else:
            downloads = downloader.list_downloads()

        return {
            "downloads": [
                {
                    "id": d.id,
                    "url": d.url,
                    "filename": d.filename,
                    "status": d.status,
                    "created_at": d.created_at,
                    "completed_at": d.completed_at,
                    "error_message": d.error_message
                }
                for d in downloads
            ],
            "count": len(downloads)
        }

    except Exception as e:
        logger.error(f"Failed to list downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/downloads/{download_id}")
async def remove_download(download_id: int):
    """Remove download from tracking (does not delete file)"""
    try:
        downloader = get_downloader()
        success = downloader.remove_download(download_id)

        if not success:
            raise HTTPException(status_code=404, detail="Download not found")

        return {"success": True, "message": "Download removed from tracking"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/downloads/clear-completed")
async def clear_completed_downloads():
    """Clear all completed/failed downloads from memory"""
    try:
        downloader = get_downloader()
        downloader.clear_completed()

        return {"success": True, "message": "Completed downloads cleared"}

    except Exception as e:
        logger.error(f"Failed to clear downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SOCKS Proxy Download Endpoints ====================

@app.post("/api/socks-downloads")
async def create_socks_download(request: SOCKSDownloadRequest):
    """
    Start a new SOCKS proxy download in the background
    Downloads to {ROOT}/DOWNLOADS/ folder (auto-imported on scan)
    
    Features:
    - proxy_url and referer persist until manually cleared
    - URL is cleared after successful download for security
    """
    try:
        downloader = get_socks_downloader()
        download = downloader.create_download(
            url=request.url,
            filename=request.filename,
            proxy_url=request.proxy_url,
            referer=request.referer
        )

        return {
            "success": True,
            "download_id": download.id,
            "status": download.status,
            "filename": download.filename,
            "message": "SOCKS download started in background"
        }

    except Exception as e:
        logger.error(f"Failed to start SOCKS download: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start download: {str(e)}")


@app.get("/api/socks-downloads/{download_id}")
async def get_socks_download_status(download_id: int):
    """Get status of a specific SOCKS download"""
    try:
        downloader = get_socks_downloader()
        download = downloader.get_download(download_id)

        if not download:
            raise HTTPException(status_code=404, detail="SOCKS download not found")

        return {
            "id": download.id,
            "url": download.url,  # Shows "[cleared after download]" if completed
            "filename": download.filename,
            "status": download.status,
            "proxy_url": download.proxy_url,
            "referer": download.referer,
            "created_at": download.created_at,
            "completed_at": download.completed_at,
            "output_path": download.output_path,
            "error_message": download.error_message
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get SOCKS download status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/socks-downloads")
async def list_socks_downloads(active_only: bool = False):
    """
    List all SOCKS downloads
    Query param: active_only=true to show only pending/downloading
    """
    try:
        downloader = get_socks_downloader()

        if active_only:
            downloads = downloader.list_active_downloads()
        else:
            downloads = downloader.list_downloads()

        return {
            "downloads": [
                {
                    "id": d.id,
                    "url": d.url,  # Shows "[cleared after download]" if completed
                    "filename": d.filename,
                    "status": d.status,
                    "proxy_url": d.proxy_url,
                    "created_at": d.created_at,
                    "completed_at": d.completed_at,
                    "error_message": d.error_message
                }
                for d in downloads
            ],
            "count": len(downloads)
        }

    except Exception as e:
        logger.error(f"Failed to list SOCKS downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/socks-downloads/{download_id}")
async def remove_socks_download(download_id: int):
    """Remove SOCKS download from tracking (does not delete file)"""
    try:
        downloader = get_socks_downloader()
        success = downloader.remove_download(download_id)

        if not success:
            raise HTTPException(status_code=404, detail="SOCKS download not found")

        return {"success": True, "message": "SOCKS download removed from tracking"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove SOCKS download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/socks-downloads/clear-completed")
async def clear_completed_socks_downloads():
    """Clear all completed/failed SOCKS downloads from memory"""
    try:
        downloader = get_socks_downloader()
        downloader.clear_completed()

        return {"success": True, "message": "Completed SOCKS downloads cleared"}

    except Exception as e:
        logger.error(f"Failed to clear SOCKS downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/socks-config/proxy")
async def set_socks_proxy(proxy_url: str):
    """
    Set default SOCKS proxy for all future downloads
    Example: socks5h://127.0.0.1:9050
    Persists until manually cleared
    """
    try:
        downloader = get_socks_downloader()
        downloader.set_default_proxy(proxy_url)

        return {
            "success": True,
            "message": f"Default SOCKS proxy set: {proxy_url}",
            "proxy": proxy_url
        }

    except Exception as e:
        logger.error(f"Failed to set SOCKS proxy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/socks-config/proxy")
async def get_socks_proxy():
    """Get current default SOCKS proxy"""
    try:
        downloader = get_socks_downloader()
        proxy = downloader.get_default_proxy()

        return {
            "proxy": proxy,
            "is_set": proxy is not None
        }

    except Exception as e:
        logger.error(f"Failed to get SOCKS proxy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/socks-config/proxy")
async def clear_socks_proxy():
    """Clear default SOCKS proxy"""
    try:
        downloader = get_socks_downloader()
        downloader.clear_default_proxy()

        return {
            "success": True,
            "message": "Default SOCKS proxy cleared"
        }

    except Exception as e:
        logger.error(f"Failed to clear SOCKS proxy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/socks-config/referer")
async def set_socks_referer(referer: str):
    """
    Set default referer for all future downloads
    Persists until manually cleared
    """
    try:
        downloader = get_socks_downloader()
        downloader.set_default_referer(referer)

        return {
            "success": True,
            "message": f"Default referer set: {referer}",
            "referer": referer
        }

    except Exception as e:
        logger.error(f"Failed to set referer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/socks-config/referer")
async def get_socks_referer():
    """Get current default referer"""
    try:
        downloader = get_socks_downloader()
        referer = downloader.get_default_referer()

        return {
            "referer": referer,
            "is_set": referer is not None
        }

    except Exception as e:
        logger.error(f"Failed to get referer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/socks-config/referer")
async def clear_socks_referer():
    """Clear default referer"""
    try:
        downloader = get_socks_downloader()
        downloader.clear_default_referer()

        return {
            "success": True,
            "message": "Default referer cleared"
        }

    except Exception as e:
        logger.error(f"Failed to clear referer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== Video Editor Endpoints ====================

@app.post("/api/editor/process")
async def create_video_edit_job(
    request: VideoEditRequest,
    db: AsyncSession = Depends(get_db)
):
    """Start a new video editing job (cut/crop/both)"""
    try:
        editor = get_editor()

        # Get video from database to verify it exists and get path
        result = await db.execute(
            select(Video).where(Video.id == request.video_id)
        )
        video = result.scalar_one_or_none()

        if not video:
            raise HTTPException(status_code=404, detail="Video not found")

        # Get video dimensions if crop is requested
        input_width = video.width
        input_height = video.height

        # If dimensions are missing from database, extract them from the video file
        if (not input_width or not input_height) and request.operation in ('crop', 'cut_and_crop'):
            video_service = VideoService(db)
            metadata = await video_service.extract_video_metadata(Path(video.path))
            if metadata:
                input_width = input_width or metadata.get('width')
                input_height = input_height or metadata.get('height')
                logger.info(f"Extracted metadata for video {video.id}: {input_width}x{input_height}")

        # Validate dimensions exist for crop operations
        if request.operation in ('crop', 'cut_and_crop'):
            if not input_width or not input_height:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot crop: video dimensions unknown. Width={input_width}, Height={input_height}"
                )

        # Create edit job
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


@app.get("/api/editor/jobs/{job_id}")
async def get_edit_job_status(job_id: int):
    """Get status of a specific edit job"""
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


@app.get("/api/editor/jobs")
async def list_edit_jobs(active_only: bool = False):
    """List all edit jobs or only active ones"""
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


@app.post("/api/editor/jobs/{job_id}/preserve-faces")
async def preserve_faces_to_edited_video(
    job_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Copy face associations from original video to edited video"""
    from sqlalchemy.orm import selectinload

    try:
        editor = get_editor()
        job = editor.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status != 'completed':
            raise HTTPException(status_code=400, detail="Job not completed yet")

        # Get original video with faces
        result = await db.execute(
            select(Video)
            .options(selectinload(Video.video_faces))
            .where(Video.id == job.video_id)
        )
        original_video = result.scalar_one_or_none()

        if not original_video:
            raise HTTPException(status_code=404, detail="Original video not found")

        # Find edited video by path
        result = await db.execute(
            select(Video).where(Video.path == job.output_path)
        )
        edited_video = result.scalar_one_or_none()

        if not edited_video:
            raise HTTPException(status_code=404, detail="Edited video not found in database. Run scan first.")

        # Copy face associations
        faces_copied = 0
        for video_face in original_video.video_faces:
            # Check if association already exists
            existing = await db.execute(
                select(VideoFace).where(
                    and_(
                        VideoFace.video_id == edited_video.id,
                        VideoFace.face_id == video_face.face_id
                    )
                )
            )
            if not existing.scalar_one_or_none():
                # Create new association
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


@app.post("/api/editor/jobs/{job_id}/copy-metadata")
async def copy_metadata_to_edited_video(
    job_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Copy tags and face associations from original video to edited video"""
    from sqlalchemy.orm import selectinload

    try:
        editor = get_editor()
        job = editor.get_job(job_id)

        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        if job.status != 'completed':
            raise HTTPException(status_code=400, detail="Job not completed yet")

        # Get original video with tags and faces
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

        # Check if source video has any metadata to copy
        has_tags = len(original_video.tags) > 0
        has_faces = len(original_video.video_faces_rel) > 0

        # Skip if nothing to copy
        if not has_tags and not has_faces:
            return {
                "success": True,
                "tags_copied": 0,
                "faces_copied": 0,
                "skipped": True,
                "message": "Source video has no tags or faces to copy"
            }

        # Find edited video by path
        result = await db.execute(
            select(Video).where(Video.path == job.output_path)
        )
        edited_video = result.scalar_one_or_none()

        if not edited_video:
            raise HTTPException(status_code=404, detail="Edited video not found in database. Run scan first.")

        # Copy tags (only if source has tags)
        tags_copied = 0
        if has_tags:
            for tag in original_video.tags:
                # Check if tag already exists for this video
                if tag not in edited_video.tags:
                    edited_video.tags.append(tag)
                    tags_copied += 1

        # Copy face associations (only if source has faces)
        faces_copied = 0
        if has_faces:
            for video_face in original_video.video_faces_rel:
                # Check if association already exists
                existing = await db.execute(
                    select(VideoFace).where(
                        and_(
                            VideoFace.video_id == edited_video.id,
                            VideoFace.face_id == video_face.face_id
                        )
                    )
                )
                if not existing.scalar_one_or_none():
                    # Create new association
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


@app.delete("/api/editor/jobs/{job_id}")
async def remove_edit_job(job_id: int):
    """Remove edit job from tracking (does not delete output file)"""
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


@app.post("/api/editor/clear-completed")
async def clear_completed_edit_jobs():
    """Clear all completed/failed edit jobs from memory"""
    try:
        editor = get_editor()
        editor.clear_completed()
        return {"success": True, "message": "Completed jobs cleared"}

    except Exception as e:
        logger.error(f"Failed to clear jobs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AUDIO ENDPOINTS - Add audio to videos
# ============================================================================

@app.get("/api/audios")
async def get_available_audios():
    """List all available audio files from .clipper/Audios/ folder"""
    try:
        audio_folder = config.root_directory / ".clipper" / "Audios"
        
        if not audio_folder.exists():
            return {"audios": []}
        
        # Just return filenames (instant, no ffprobe calls)
        audios = [
            {"filename": audio_file.name}
            for audio_file in sorted(audio_folder.glob("*.m4a"))
        ]
        
        return {"audios": audios}
    
    except Exception as e:
        logger.error(f"Failed to list audios: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/audios/{audio_filename}")
async def delete_audio(audio_filename: str):
    """Delete an audio file from .clipper/Audios/ folder"""
    try:
        audio_folder = config.root_directory / ".clipper" / "Audios"
        audio_path = audio_folder / audio_filename
        
        # Security: Prevent path traversal
        if not audio_path.exists() or not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        # Verify file is in audio folder
        if not audio_path.resolve().parent == audio_folder.resolve():
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete the file
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


@app.post("/api/videos/{video_id}/add-audio")
async def add_audio_to_video(video_id: int, request: dict = Body(...), db: AsyncSession = Depends(get_db)):
    """Add audio from .clipper/Audios/ to a video, trimming audio to match video length
    
    Args:
        video_id: Video to add audio to
        request: { "audio_filename": "song.m4a" }
    """
    try:
        import subprocess
        import shutil
        
        # Extract audio filename from request
        audio_filename = request.get('audio_filename')
        if not audio_filename:
            raise HTTPException(status_code=400, detail="audio_filename is required")
        
        # Get video from database
        stmt = select(Video).where(Video.id == video_id)
        result = await db.execute(stmt)
        video = result.scalar_one_or_none()
        
        if not video:
            raise HTTPException(status_code=404, detail="Video not found")
        
        video_path = Path(video.path)
        if not video_path.exists():
            raise HTTPException(status_code=404, detail="Video file not found")
        
        # Validate audio file
        audio_folder = config.root_directory / ".clipper" / "Audios"
        audio_path = audio_folder / audio_filename
        
        if not audio_path.exists() or not audio_path.suffix.lower() == ".m4a":
            raise HTTPException(status_code=404, detail="Audio file not found or invalid format")
        
        logger.info(f"Adding audio {audio_filename} to video {video_path}")
        
        # Get video duration
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
        
        # Get audio duration
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
        
        # Create temp output file
        temp_output = video_path.parent / f"{video_path.stem}_temp_with_audio.mp4"
        
        # Clean up any existing temp file from failed previous attempt
        if temp_output.exists():
            logger.info(f"Cleaning up existing temp file: {temp_output}")
            temp_output.unlink()
        
        # Build FFmpeg command:
        # If audio is shorter than video, loop it; otherwise trim to video length
        # Using aloop filter to repeat audio until it matches video duration
        
        if audio_duration < video_duration:
            # Audio is shorter - loop it until it matches video duration
            # Calculate number of loops needed: ceil(video_duration / audio_duration)
            import math
            loops_needed = math.ceil(video_duration / audio_duration)
            
            logger.info(f"Audio shorter than video - looping {loops_needed} times")
            
            # Use aloop filter to repeat audio
            ffmpeg_cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-c:v", "copy",                          # Copy video codec (no re-encoding)
                "-c:a", "aac",                           # AAC audio for MP4
                "-map", "0:v:0",                         # Map video from first input
                "-map", "1:a:0",                         # Map audio from second input
                "-af", f"aloop=loop={loops_needed}",     # Loop audio N times
                "-t", str(video_duration),               # Limit output to video duration
                "-y",                                    # Overwrite
                str(temp_output)
            ]
        else:
            # Audio is longer or same length - trim to video duration
            logger.info(f"Audio longer or equal to video - trimming to {video_duration}s")
            
            ffmpeg_cmd = [
                "ffmpeg",
                "-i", str(video_path),
                "-i", str(audio_path),
                "-c:v", "copy",           # Copy video codec (no re-encoding)
                "-c:a", "aac",            # AAC audio for MP4
                "-map", "0:v:0",          # Map video from first input
                "-map", "1:a:0",          # Map audio from second input
                "-t", str(video_duration), # Trim audio to video length
                "-y",                     # Overwrite
                str(temp_output)
            ]
        
        logger.info(f"Running: {' '.join(ffmpeg_cmd)}")
        
        result = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            timeout=300  # 5 minute timeout
        )
        
        if result.returncode != 0:
            logger.error(f"FFmpeg error: {result.stderr}")
            if temp_output.exists():
                temp_output.unlink()
            raise HTTPException(status_code=500, detail=f"Failed to add audio: {result.stderr}")
        
        # Overwrite original with temp file
        shutil.move(str(temp_output), str(video_path))
        logger.info(f"✅ Audio added successfully to {video_path}")
        
        # Update video metadata in database (duration may have changed)
        video.file_size = video_path.stat().st_size
        video.updated_at = datetime.utcnow()
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


@app.get("/audios/{audio_filename}")
async def serve_audio(audio_filename: str):
    """Serve audio file from .clipper/Audios/ folder for preview"""
    try:
        audio_folder = config.root_directory / ".clipper" / "Audios"
        audio_path = audio_folder / audio_filename
        
        # Security: Prevent path traversal
        if not audio_path.exists() or not audio_path.is_file():
            raise HTTPException(status_code=404, detail="Audio file not found")
        
        # Verify file is in audio folder
        if not audio_path.resolve().parent == audio_folder.resolve():
            raise HTTPException(status_code=403, detail="Access denied")
        
        return FileResponse(
            str(audio_path),
            media_type="audio/mp4",
            headers={
                "Accept-Ranges": "bytes",
                "Cache-Control": "public, max-age=3600"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to serve audio: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app", 
        host=config.server_host, 
        port=config.server_port, 
        reload=config.reload
    )