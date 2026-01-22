"""Video fingerprinting and duplicate detection endpoints."""

import base64
import logging
import time
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func, case, delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, Video, VideoFingerprint
from fingerprint_service import FingerprintService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["fingerprints"])


@router.post("/api/videos/{video_id}/fingerprint")
async def generate_fingerprint(video_id: int, db: AsyncSession = Depends(get_db)):
    """Generate fingerprint for a specific video (user-triggered, on-demand)."""
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    existing = await db.execute(
        select(VideoFingerprint).where(VideoFingerprint.video_id == video_id)
    )
    if existing.scalars().first():
        return {
            "message": "Already fingerprinted",
            "video_id": video_id,
            "video_name": video.display_name or video.name
        }

    fingerprint_service = FingerprintService()
    try:
        fingerprints = await fingerprint_service.generate_fingerprints(video.path)

        if not fingerprints:
            raise HTTPException(status_code=500, detail="Failed to generate fingerprints")

        for position, phash in fingerprints:
            fp = VideoFingerprint(
                video_id=video_id,
                frame_position=position,
                phash=phash,
                created_at=time.time()
            )
            db.add(fp)

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


@router.delete("/api/videos/{video_id}/fingerprint")
async def remove_fingerprint(video_id: int, db: AsyncSession = Depends(get_db)):
    """Remove fingerprint from library."""
    await db.execute(
        sql_delete(VideoFingerprint).where(VideoFingerprint.video_id == video_id)
    )

    video = await db.get(Video, video_id)
    if video:
        video.fingerprint_generated = 0
        video.fingerprinted_at = None

    await db.commit()

    return {
        "message": "Fingerprint removed",
        "video_id": video_id
    }


@router.get("/api/videos/{video_id}/check-duplicate")
async def check_duplicate(
    video_id: int,
    threshold: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """Check if this video is a duplicate of any fingerprinted video."""
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    fingerprint_service = FingerprintService()
    temp_fingerprints = await fingerprint_service.generate_fingerprints(video.path)

    if not temp_fingerprints:
        raise HTTPException(status_code=500, detail="Failed to generate fingerprint for comparison")

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

    video_scores = {}

    for _, temp_hash in temp_fingerprints:
        for lib_fp in library_fps:
            distance = fingerprint_service.hamming_distance(temp_hash, lib_fp.phash)

            if lib_fp.video_id not in video_scores:
                video_scores[lib_fp.video_id] = distance
            else:
                video_scores[lib_fp.video_id] = min(video_scores[lib_fp.video_id], distance)

    matches = [
        (vid, dist) for vid, dist in video_scores.items()
        if dist <= threshold
    ]
    matches.sort(key=lambda x: x[1])

    if matches:
        match_ids = [vid for vid, _ in matches]
        matched_videos = await db.execute(
            select(Video).where(Video.id.in_(match_ids))
        )
        matched_videos = matched_videos.scalars().all()

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


@router.get("/api/fingerprints/find-all-duplicates")
async def find_all_duplicates(
    threshold: int = 10,
    folder: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Find all duplicate groups in the fingerprinted library."""
    fingerprint_service = FingerprintService()

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

    video_ids = [v.id for v in fingerprinted_videos]
    fingerprints_query = select(VideoFingerprint).where(VideoFingerprint.video_id.in_(video_ids))
    all_fingerprints = await db.execute(fingerprints_query)
    all_fingerprints = all_fingerprints.scalars().all()

    video_fingerprints = {}
    for fp in all_fingerprints:
        if fp.video_id not in video_fingerprints:
            video_fingerprints[fp.video_id] = []
        video_fingerprints[fp.video_id].append(fp)

    video_scores = {}

    video_ids = list(video_fingerprints.keys())
    for i, vid1 in enumerate(video_ids):
        for vid2 in video_ids[i+1:]:
            fps1 = video_fingerprints.get(vid1, [])
            fps2 = video_fingerprints.get(vid2, [])

            min_distance = float('inf')
            for fp1 in fps1:
                for fp2 in fps2:
                    distance = fingerprint_service.hamming_distance(fp1.phash, fp2.phash)
                    min_distance = min(min_distance, distance)

            if min_distance <= threshold:
                video_scores[(vid1, vid2)] = min_distance

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

    for (vid1, vid2), distance in video_scores.items():
        union(vid1, vid2)

    groups = {}
    for vid in video_ids:
        if vid in video_fingerprints:
            root = find(vid)
            if root not in groups:
                groups[root] = []
            groups[root].append(vid)

    duplicate_groups = [group for group in groups.values() if len(group) >= 2]

    all_duplicate_ids = [vid for group in duplicate_groups for vid in group]

    if all_duplicate_ids:
        duplicate_videos = await db.execute(
            select(Video).where(Video.id.in_(all_duplicate_ids))
        )
        duplicate_videos = duplicate_videos.scalars().all()
        video_dict = {v.id: v for v in duplicate_videos}

        result_groups = []
        for group in duplicate_groups:
            videos_in_group = []
            for vid in group:
                v = video_dict.get(vid)
                if v:
                    similarity = 100
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


@router.get("/api/fingerprints/stats")
async def get_fingerprint_stats(db: AsyncSession = Depends(get_db)):
    """Get fingerprint library statistics."""
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


@router.get("/api/fingerprints/stats/by-folder")
async def get_fingerprint_stats_by_folder(db: AsyncSession = Depends(get_db)):
    """Get fingerprint statistics grouped by folder/category."""
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


@router.get("/api/videos/{video_id}/fingerprints")
async def get_video_fingerprints(video_id: int, db: AsyncSession = Depends(get_db)):
    """Get all fingerprint frames for a video with thumbnails."""
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    result = await db.execute(
        select(VideoFingerprint)
        .where(VideoFingerprint.video_id == video_id)
        .order_by(VideoFingerprint.frame_position)
    )
    fingerprints = result.scalars().all()

    if not fingerprints:
        return {
            "video_id": video_id,
            "fingerprints": [],
            "message": "No fingerprints found for this video"
        }

    fingerprint_service = FingerprintService()
    frames_data = []

    for fp in fingerprints:
        try:
            thumbnail_data = await fingerprint_service.get_frame_thumbnail(video.path, fp.frame_position)
            thumbnail_b64 = base64.b64encode(thumbnail_data).decode('utf-8') if thumbnail_data else None
        except Exception:
            thumbnail_b64 = None

        frames_data.append({
            "id": fp.id,
            "frame_position": fp.frame_position,
            "phash": fp.phash,
            "thumbnail": thumbnail_b64,
            "created_at": fp.created_at
        })

    return {
        "video_id": video_id,
        "video_name": video.display_name or video.name,
        "fingerprints": frames_data,
        "count": len(frames_data)
    }


@router.delete("/api/videos/{video_id}/fingerprints/{fingerprint_id}")
async def delete_fingerprint_frame(
    video_id: int,
    fingerprint_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Delete a specific fingerprint frame."""
    result = await db.execute(
        select(VideoFingerprint).where(
            VideoFingerprint.id == fingerprint_id,
            VideoFingerprint.video_id == video_id
        )
    )
    fingerprint = result.scalar_one_or_none()

    if not fingerprint:
        raise HTTPException(status_code=404, detail="Fingerprint not found")

    await db.delete(fingerprint)

    remaining = await db.execute(
        select(func.count(VideoFingerprint.id)).where(VideoFingerprint.video_id == video_id)
    )
    remaining_count = remaining.scalar()

    if remaining_count == 0:
        video = await db.get(Video, video_id)
        if video:
            video.fingerprint_generated = 0
            video.fingerprinted_at = None

    await db.commit()

    return {
        "message": "Fingerprint frame deleted",
        "video_id": video_id,
        "fingerprint_id": fingerprint_id,
        "remaining_fingerprints": remaining_count
    }


@router.post("/api/videos/{video_id}/fingerprints/add-frame")
async def add_fingerprint_frame(
    video_id: int,
    frame_position: int,
    db: AsyncSession = Depends(get_db)
):
    """Add a fingerprint at a specific frame position."""
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    existing = await db.execute(
        select(VideoFingerprint).where(
            VideoFingerprint.video_id == video_id,
            VideoFingerprint.frame_position == frame_position
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Fingerprint at position {frame_position} already exists")

    fingerprint_service = FingerprintService()
    try:
        phash = await fingerprint_service.generate_fingerprint_at_position(video.path, frame_position)

        if not phash:
            raise HTTPException(status_code=500, detail="Failed to generate fingerprint")

        fp = VideoFingerprint(
            video_id=video_id,
            frame_position=frame_position,
            phash=phash,
            created_at=time.time()
        )
        db.add(fp)

        video.fingerprint_generated = 1
        if not video.fingerprinted_at:
            video.fingerprinted_at = time.time()

        await db.commit()

        return {
            "message": "Fingerprint frame added",
            "video_id": video_id,
            "frame_position": frame_position,
            "phash": phash
        }

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to add fingerprint: {str(e)}")


@router.post("/api/fingerprints/extract-frames/{video_id}")
async def extract_fingerprint_frames(
    video_id: int,
    positions: List[int] = None,
    db: AsyncSession = Depends(get_db)
):
    """Extract fingerprint frames at specific positions (for preview/selection)."""
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    if positions is None:
        positions = [5, 25, 50, 75, 95]

    fingerprint_service = FingerprintService()
    frames_data = []

    for position in positions:
        try:
            thumbnail_data = await fingerprint_service.get_frame_thumbnail(video.path, position)
            phash = await fingerprint_service.generate_fingerprint_at_position(video.path, position)

            thumbnail_b64 = base64.b64encode(thumbnail_data).decode('utf-8') if thumbnail_data else None

            frames_data.append({
                "frame_position": position,
                "phash": phash,
                "thumbnail": thumbnail_b64
            })
        except Exception as e:
            logger.warning(f"Failed to extract frame at position {position}: {e}")
            frames_data.append({
                "frame_position": position,
                "phash": None,
                "thumbnail": None,
                "error": str(e)
            })

    return {
        "video_id": video_id,
        "video_name": video.display_name or video.name,
        "frames": frames_data
    }


@router.post("/api/videos/{video_id}/fingerprints/add-frames")
async def add_fingerprint_frames(
    video_id: int,
    positions: List[int],
    db: AsyncSession = Depends(get_db)
):
    """Add multiple fingerprint frames at specified positions."""
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    fingerprint_service = FingerprintService()
    added_frames = []
    failed_frames = []

    for position in positions:
        existing = await db.execute(
            select(VideoFingerprint).where(
                VideoFingerprint.video_id == video_id,
                VideoFingerprint.frame_position == position
            )
        )
        if existing.scalar_one_or_none():
            failed_frames.append({"position": position, "error": "Already exists"})
            continue

        try:
            phash = await fingerprint_service.generate_fingerprint_at_position(video.path, position)

            if phash:
                fp = VideoFingerprint(
                    video_id=video_id,
                    frame_position=position,
                    phash=phash,
                    created_at=time.time()
                )
                db.add(fp)
                added_frames.append({"position": position, "phash": phash})
            else:
                failed_frames.append({"position": position, "error": "Failed to generate hash"})

        except Exception as e:
            failed_frames.append({"position": position, "error": str(e)})

    if added_frames:
        video.fingerprint_generated = 1
        if not video.fingerprinted_at:
            video.fingerprinted_at = time.time()

    await db.commit()

    return {
        "video_id": video_id,
        "added_frames": added_frames,
        "failed_frames": failed_frames,
        "total_added": len(added_frames),
        "total_failed": len(failed_frames)
    }


@router.post("/api/videos/{video_id}/fingerprints/add-frames-from-images")
async def add_fingerprint_frames_from_images(
    video_id: int,
    image_data: List[dict],
    db: AsyncSession = Depends(get_db)
):
    """Add fingerprint frames from base64-encoded images (for manual frame selection)."""
    video = await db.get(Video, video_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")

    fingerprint_service = FingerprintService()
    added_frames = []
    failed_frames = []

    for item in image_data:
        position = item.get('position', 0)
        image_b64 = item.get('image')

        if not image_b64:
            failed_frames.append({"position": position, "error": "No image data"})
            continue

        existing = await db.execute(
            select(VideoFingerprint).where(
                VideoFingerprint.video_id == video_id,
                VideoFingerprint.frame_position == position
            )
        )
        if existing.scalar_one_or_none():
            failed_frames.append({"position": position, "error": "Already exists"})
            continue

        try:
            image_bytes = base64.b64decode(image_b64)
            phash = fingerprint_service.generate_fingerprint_from_image_bytes(image_bytes)

            if phash:
                fp = VideoFingerprint(
                    video_id=video_id,
                    frame_position=position,
                    phash=phash,
                    created_at=time.time()
                )
                db.add(fp)
                added_frames.append({"position": position, "phash": phash})
            else:
                failed_frames.append({"position": position, "error": "Failed to generate hash"})

        except Exception as e:
            failed_frames.append({"position": position, "error": str(e)})

    if added_frames:
        video.fingerprint_generated = 1
        if not video.fingerprinted_at:
            video.fingerprinted_at = time.time()

    await db.commit()

    return {
        "video_id": video_id,
        "added_frames": added_frames,
        "failed_frames": failed_frames,
        "total_added": len(added_frames),
        "total_failed": len(failed_frames)
    }
