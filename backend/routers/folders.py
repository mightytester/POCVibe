"""Folder management and folder groups endpoints."""

import hashlib
import json
import logging
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import config
from database import get_db, Video, FolderGroup
from video_service import VideoService
from schemas.common import RenameFolderRequest, BulkHashRenameRequest
from schemas.folder import FolderGroupCreate, FolderGroupUpdate, FolderGroupReorder
from routers.roots import get_thumbnail_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/folders", tags=["folders"])


def parse_folders(folders_str):
    """Parse folders string - handles both JSON array and comma-separated formats."""
    if not folders_str:
        return []
    try:
        if folders_str.startswith('['):
            return json.loads(folders_str)
        return [f.strip() for f in folders_str.split(',') if f.strip()]
    except:
        return [f.strip() for f in folders_str.split(',') if f.strip()]


def serialize_folders(folders_list):
    """Serialize folders list to JSON string."""
    if not folders_list:
        return '[]'
    return json.dumps(folders_list)


@router.get("/structure")
async def get_folder_structure_groups(db: AsyncSession = Depends(get_db)):
    """Get folder structure with groups for sidebar navigation."""
    from file_scanner import scanner

    # Get all physical folders
    physical_folders = []
    for item in config.root_directory.iterdir():
        if item.is_dir() and not scanner.should_exclude_folder(item.name):
            physical_folders.append(item.name)

    # Get all folder groups
    result = await db.execute(
        select(FolderGroup).order_by(FolderGroup.order)
    )
    groups = result.scalars().all()

    # Get folders already in groups
    grouped_folders = set()
    for group in groups:
        if group.folders:
            grouped_folders.update(parse_folders(group.folders))

    # Find ungrouped folders
    ungrouped_folders = [f for f in physical_folders if f not in grouped_folders]

    return {
        "groups": [{
            "id": g.id,
            "name": g.name,
            "icon": g.icon,
            "folders": parse_folders(g.folders),
            "position": g.order,
            "is_expanded": True,
            "color": g.color,
            "is_system": g.is_system,
            "created_at": g.created_at,
            "updated_at": g.updated_at
        } for g in groups],
        "ungrouped_folders": ungrouped_folders,
        "all_folders": physical_folders
    }


@router.get("/groups")
async def get_folder_groups(db: AsyncSession = Depends(get_db)):
    """Get all folder groups."""
    result = await db.execute(
        select(FolderGroup).order_by(FolderGroup.order)
    )
    groups = result.scalars().all()

    return [{
        "id": g.id,
        "name": g.name,
        "icon": g.icon,
        "folders": parse_folders(g.folders),
        "position": g.order,
        "is_expanded": True,
        "color": g.color,
        "is_system": g.is_system,
        "created_at": g.created_at,
        "updated_at": g.updated_at
    } for g in groups]


@router.post("/groups")
async def create_folder_group(
    body: FolderGroupCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new folder group."""
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Group name is required")

    # Check for duplicate name
    existing = await db.execute(
        select(FolderGroup).where(FolderGroup.name == name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Group with this name already exists")

    # Get max order
    max_order_result = await db.execute(
        select(FolderGroup.order).order_by(FolderGroup.order.desc()).limit(1)
    )
    max_order = max_order_result.scalar() or 0

    # Create group with UUID id
    group = FolderGroup(
        id=str(uuid.uuid4()),
        name=name,
        icon=body.icon,
        color=body.color,
        folders=serialize_folders(body.folders),
        order=max_order + 1,
        created_at=time.time(),
        updated_at=time.time()
    )
    db.add(group)
    await db.commit()
    await db.refresh(group)

    return {
        "id": group.id,
        "name": group.name,
        "icon": group.icon,
        "folders": parse_folders(group.folders),
        "position": group.order,
        "is_expanded": True,
        "color": group.color,
        "is_system": group.is_system,
        "created_at": group.created_at,
        "updated_at": group.updated_at
    }


@router.put("/groups/{group_id}")
async def update_folder_group(
    group_id: str,
    body: FolderGroupUpdate,
    db: AsyncSession = Depends(get_db)
):
    """Update a folder group."""
    result = await db.execute(
        select(FolderGroup).where(FolderGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if body.name is not None:
        name = body.name.strip()
        if name:
            # Check for duplicate name (excluding current group)
            existing = await db.execute(
                select(FolderGroup).where(
                    FolderGroup.name == name,
                    FolderGroup.id != group_id
                )
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="Group with this name already exists")
            group.name = name

    if body.icon is not None:
        group.icon = body.icon

    if body.color is not None:
        group.color = body.color

    if body.folders is not None:
        group.folders = serialize_folders(body.folders) if body.folders else '[]'

    group.updated_at = time.time()

    await db.commit()
    await db.refresh(group)

    return {
        "id": group.id,
        "name": group.name,
        "icon": group.icon,
        "folders": parse_folders(group.folders),
        "position": group.order,
        "is_expanded": True,
        "color": group.color,
        "is_system": group.is_system,
        "created_at": group.created_at,
        "updated_at": group.updated_at
    }


@router.delete("/groups/{group_id}")
async def delete_folder_group(
    group_id: str,
    db: AsyncSession = Depends(get_db)
):
    """Delete a folder group."""
    result = await db.execute(
        select(FolderGroup).where(FolderGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    await db.delete(group)
    await db.commit()

    return {"message": "Group deleted", "group_id": group_id}


@router.patch("/groups/{group_id}/reorder")
async def reorder_folder_group(
    group_id: str,
    body: FolderGroupReorder,
    db: AsyncSession = Depends(get_db)
):
    """Reorder a folder group (move up or down)."""
    direction = body.direction

    # Get current group
    result = await db.execute(
        select(FolderGroup).where(FolderGroup.id == group_id)
    )
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    old_position = group.order

    # Get all groups sorted by order
    result = await db.execute(
        select(FolderGroup).order_by(FolderGroup.order)
    )
    all_groups = result.scalars().all()

    # Calculate new position based on direction
    if direction == 'up':
        prev_groups = [g for g in all_groups if g.order < old_position]
        if not prev_groups:
            raise HTTPException(status_code=400, detail="Cannot move up - already at top")
        new_position = prev_groups[-1].order
    else:  # down
        next_groups = [g for g in all_groups if g.order > old_position]
        if not next_groups:
            raise HTTPException(status_code=400, detail="Cannot move down - already at bottom")
        new_position = next_groups[0].order

    # Swap positions with adjacent group
    for g in all_groups:
        if g.order == new_position:
            g.order = old_position
            break

    group.order = new_position
    group.updated_at = time.time()

    await db.commit()

    # Return updated list
    result = await db.execute(
        select(FolderGroup).order_by(FolderGroup.order)
    )
    groups = result.scalars().all()

    return [{
        "id": g.id,
        "name": g.name,
        "icon": g.icon,
        "folders": parse_folders(g.folders),
        "position": g.order,
        "is_expanded": True,
        "color": g.color,
        "is_system": g.is_system,
        "created_at": g.created_at,
        "updated_at": g.updated_at
    } for g in groups]


@router.post("/rename")
async def rename_folder(
    body: RenameFolderRequest,
    db: AsyncSession = Depends(get_db)
):
    """Rename a top-level category folder and update all related database records."""
    thumbnail_db = get_thumbnail_db()
    service = VideoService(db, thumbnail_db)

    folder_path_obj = config.root_directory / body.old_name

    if not folder_path_obj.exists() or not folder_path_obj.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Folder '{body.old_name}' not found"
        )

    root_resolved = config.root_directory.resolve()
    folder_resolved = folder_path_obj.resolve()

    if not str(folder_resolved).startswith(str(root_resolved)):
        raise HTTPException(
            status_code=403,
            detail="Folder path must be within root directory"
        )

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


@router.post("/bulk-hash-rename")
async def bulk_hash_rename_videos(
    body: BulkHashRenameRequest,
    db: AsyncSession = Depends(get_db)
):
    """Bulk rename all videos in a folder using hash-based naming (zindex)."""
    thumbnail_db = get_thumbnail_db()

    folder_name = body.folder_name
    folder_path = config.root_directory / folder_name

    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Folder '{folder_name}' not found"
        )

    root_resolved = config.root_directory.resolve()
    folder_resolved = folder_path.resolve()

    if not str(folder_resolved).startswith(str(root_resolved)):
        raise HTTPException(
            status_code=403,
            detail="Folder path must be within root directory"
        )

    try:
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

                sha1_hash = hashlib.sha1()
                with open(video_path, 'rb') as f:
                    for chunk in iter(lambda: f.read(8192), b''):
                        sha1_hash.update(chunk)

                hash_str = sha1_hash.hexdigest()

                part1 = hash_str[0:4]
                part2 = hash_str[4:8]
                part3 = hash_str[2] + hash_str[4] + hash_str[6] + hash_str[10]
                part4 = hash_str[10] + hash_str[6] + hash_str[4] + hash_str[2]

                new_name_base = part1 + part2 + part3 + part4
                ext = video_path.suffix
                new_name = f"{new_name_base}{ext}"

                new_path = video_path.parent / new_name
                if new_path.exists() and new_path != video_path:
                    failed_videos.append({
                        "name": video.name,
                        "error": f"Target name already exists: {new_name}"
                    })
                    continue

                if video_path == new_path:
                    renamed_videos.append({
                        "old_name": video.name,
                        "new_name": new_name,
                        "status": "skipped_same_name"
                    })
                    continue

                video_path.rename(new_path)

                await thumbnail_db.update_path_hash(str(video_path), str(new_path))

                video.path = str(new_path)
                video.name = new_name
                video.extension = ext.lower()
                video.thumbnail_url = f"/api/thumbnails/{video.id}"

                await db.commit()

                renamed_videos.append({
                    "old_name": video.name,
                    "new_name": new_name,
                    "status": "success"
                })

                logger.info(f"Renamed: {video.name} -> {new_name}")

            except Exception as e:
                logger.error(f"Error renaming {video.name}: {str(e)}")
                failed_videos.append({
                    "name": video.name,
                    "error": str(e)
                })
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
