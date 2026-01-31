"""Face recognition and management endpoints."""

import logging
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, Form, Body
from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload
from sklearn.metrics.pairwise import cosine_similarity

from database import get_db, Video, FaceID, FaceEncoding, VideoFace, Actor
from face_service import face_service
from schemas.face import CompareFacesRequest, LinkFaceToVideoRequest, MergeFacesRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/faces", tags=["faces"])


# ==================== FACE SEARCH & CREATION ====================

@router.post("/search")
async def search_face(
    face_image: UploadFile = File(...),
    video_id: int = Form(...),
    frame_timestamp: float = Form(...),
    threshold: float = Form(0.4),
    exclude_face_id: int = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """
    Search for matching faces in the catalog.

    Receives a cropped face image from frontend, generates encoding,
    and searches for similar faces in the database.

    Args:
        exclude_face_id: Optional face ID to exclude from results (e.g., when finding duplicates)
    """
    import cv2

    try:
        image_bytes = await face_image.read()
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format")

        result = face_service.generate_face_encoding(img)

        if result is None:
            raise HTTPException(status_code=400, detail="No face detected in image")

        encoding, confidence = result
        quality_score = face_service.calculate_face_quality(img)

        matches = await face_service.search_similar_faces(
            encoding=encoding,
            db=db,
            threshold=threshold,
            top_k=5,
            exclude_face_id=exclude_face_id
        )

        encoding_b64 = face_service.encoding_to_base64(encoding)
        thumbnail_b64 = face_service.image_to_base64(img)

        return {
            "matches": matches,
            "has_matches": len(matches) > 0,
            "encoding": encoding_b64,
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


@router.get("/search")
async def search_faces_by_name(
    q: str = "",
    actor_id: Optional[int] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_db)
):
    """
    Search faces by name or actor name (autocomplete).

    Query params:
    - q: Search term (searches face name and linked actor name)
    - actor_id: Filter by actor_id if set
    - limit: Maximum results
    """
    try:
        stmt = select(FaceID).options(joinedload(FaceID.actor))

        filters = []
        if q.strip():
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


@router.post("/create")
async def create_face(
    name: str = Form(None),
    actor_id: int = Form(None),
    encoding: str = Form(...),
    thumbnail: str = Form(...),
    confidence: float = Form(...),
    quality_score: float = Form(...),
    video_id: int = Form(None),
    frame_timestamp: float = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """Create a new face_id and add the first encoding."""
    try:
        encoding_array = face_service.base64_to_encoding(encoding)

        face = await face_service.create_face_id(
            db=db,
            name=name,
            thumbnail_path=None,
            actor_id=actor_id
        )

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

        if face_encoding is None:
            logger.warning(f"Could not add initial encoding to new face {face.id}")
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


# ==================== FACE ENCODINGS ====================

@router.post("/{face_id}/add-encoding")
async def add_encoding_to_face(
    face_id: int,
    encoding: str = Form(...),
    thumbnail: str = Form(...),
    confidence: float = Form(...),
    quality_score: float = Form(...),
    video_id: int = Form(None),
    frame_timestamp: float = Form(None),
    db: AsyncSession = Depends(get_db)
):
    """Add a new encoding to an existing face_id."""
    try:
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        if face.encoding_count >= 200:
            raise HTTPException(
                status_code=400,
                detail=f"Face {face.name} already has maximum encodings (200)"
            )

        encoding_array = face_service.base64_to_encoding(encoding)

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

        if face_encoding is None:
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


@router.delete("/{face_id}/encodings/{encoding_id}")
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


@router.get("/{face_id}/encodings")
async def get_face_encodings(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get all encodings for a specific face with video information."""
    try:
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            logger.warning(f"Face {face_id} not found")
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        encodings_result = await db.execute(
            select(FaceEncoding, Video.name)
            .outerjoin(Video, FaceEncoding.video_id == Video.id)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.quality_score.desc())
        )
        encodings_data = encodings_result.all()

        encoding_list = []
        for enc, video_name in encodings_data:
            encoding_list.append({
                "id": enc.id,
                "video_id": enc.video_id,
                "video_name": video_name or "Unknown Video",
                "frame_timestamp": float(enc.frame_timestamp) if enc.frame_timestamp else None,
                "thumbnail": enc.thumbnail or "",
                "confidence": float(enc.confidence) if enc.confidence else 0.0,
                "quality_score": float(enc.quality_score) if enc.quality_score else 0.0,
                "created_at": enc.created_at.isoformat() if enc.created_at and hasattr(enc.created_at, 'isoformat') else str(enc.created_at) if enc.created_at else None,
                "embedding": enc.encoding or ""
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


@router.get("/{face_id}/cleanup/encodings")
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
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        primary_encoding = None
        primary_is_fallback = False

        if face.primary_encoding_id:
            primary_result = await db.execute(
                select(FaceEncoding).where(FaceEncoding.id == face.primary_encoding_id)
            )
            primary_encoding = primary_result.scalar_one_or_none()

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

        primary_vector = face_service.base64_to_encoding(primary_encoding.encoding)

        encodings_result = await db.execute(
            select(FaceEncoding, Video.name)
            .outerjoin(Video, FaceEncoding.video_id == Video.id)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.quality_score.desc())
        )
        encodings_data = encodings_result.all()

        scored_list = []
        for enc, video_name in encodings_data:
            is_primary = (enc.id == primary_encoding.id)

            similarity = 1.0 if is_primary else 0.0
            if not is_primary and enc.encoding:
                try:
                    enc_vector = face_service.base64_to_encoding(enc.encoding)
                    similarity = face_service.calculate_similarity(primary_vector, enc_vector)
                except Exception as e:
                    logger.warning(f"Error calculating similarity for encoding {enc.id}: {e}")
                    similarity = 0.0

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
                "vector_similarity": float(similarity),
                "quality_level": quality_level,
                "is_primary": is_primary
            })

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


@router.get("/{face_id}/best-encoding")
async def get_best_encoding_for_face(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get the best quality encoding for a face across all videos."""
    try:
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            logger.warning(f"Face {face_id} not found")
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        encoding_result = await db.execute(
            select(FaceEncoding, Video.name)
            .outerjoin(Video, FaceEncoding.video_id == Video.id)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.quality_score.desc(), FaceEncoding.confidence.desc())
            .limit(1)
        )
        encoding_data = encoding_result.first()

        if not encoding_data:
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


@router.put("/{face_id}/primary-encoding/{encoding_id}")
async def set_primary_encoding(face_id: int, encoding_id: int, db: AsyncSession = Depends(get_db)):
    """Set the primary/preview encoding for a face."""
    try:
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        encoding_result = await db.execute(
            select(FaceEncoding).where(
                FaceEncoding.id == encoding_id,
                FaceEncoding.face_id == face_id
            )
        )
        encoding = encoding_result.scalar_one_or_none()

        if not encoding:
            raise HTTPException(status_code=404, detail=f"Encoding {encoding_id} not found or doesn't belong to face {face_id}")

        face.primary_encoding_id = encoding_id
        face.updated_at = time.time()
        await db.commit()

        logger.info(f"Set primary encoding {encoding_id} for face {face_id}")

        return {
            "success": True,
            "face_id": face_id,
            "primary_encoding_id": encoding_id,
            "message": "Primary encoding set successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting primary encoding: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to set primary encoding: {str(e)}")


# ==================== FACE CATALOG & DETAILS ====================

@router.get("/catalog")
async def get_face_catalog(db: AsyncSession = Depends(get_db)):
    """Get all faces in the catalog with their details."""
    try:
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

        catalog = []
        for face, actor, video_count in face_rows:
            encodings_result = await db.execute(
                select(FaceEncoding, Video.media_type)
                .outerjoin(Video, FaceEncoding.video_id == Video.id)
                .where(FaceEncoding.face_id == face.id)
            )
            encodings_data = encodings_result.all()

            image_count = 0
            for enc, media_type in encodings_data:
                if media_type == 'image' or (media_type is None and enc.frame_timestamp == 0):
                    image_count += 1

            if face.primary_encoding_id:
                encoding_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.id == face.primary_encoding_id)
                )
                best_encoding = encoding_result.scalar_one_or_none()
            else:
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
                "video_count": video_count,
                "image_count": image_count,
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


@router.get("/{face_id}")
async def get_face_details(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get detailed information about a specific face."""
    try:
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        encodings_result = await db.execute(
            select(FaceEncoding)
            .where(FaceEncoding.face_id == face_id)
            .order_by(FaceEncoding.created_at.desc())
        )
        encodings = encodings_result.scalars().all()

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


@router.get("/{face_id}/videos")
async def get_face_videos(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get all videos where this face appears (using VideoFace junction table)."""
    try:
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        videos_result = await db.execute(
            select(Video, VideoFace.appearance_count, VideoFace.detection_method, VideoFace.first_detected_at)
            .join(VideoFace, Video.id == VideoFace.video_id)
            .where(VideoFace.face_id == face_id)
            .order_by(VideoFace.appearance_count.desc())
        )
        video_rows = videos_result.all()

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


@router.get("/{face_id}/images")
async def get_face_images(face_id: int, db: AsyncSession = Depends(get_db)):
    """Get all images where this face appears (using VideoFace junction table)."""
    try:
        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

        images_result = await db.execute(
            select(Video, VideoFace.appearance_count, VideoFace.detection_method, VideoFace.first_detected_at)
            .join(VideoFace, Video.id == VideoFace.video_id)
            .where((VideoFace.face_id == face_id) & (Video.media_type == 'image'))
            .order_by(VideoFace.appearance_count.desc())
        )
        image_rows = images_result.all()

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


# ==================== FACE UPDATE & DELETE ====================

@router.put("/{face_id}")
async def update_face(
    face_id: int,
    body: dict = Body(...),
    db: AsyncSession = Depends(get_db)
):
    """Update face_id name or actor link."""
    try:
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        if 'name' in body and body['name']:
            face.name = body['name']

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


@router.put("/{face_id}/rename")
async def rename_face(face_id: int, request: dict, db: AsyncSession = Depends(get_db)):
    """Rename a face."""
    try:
        new_name = request.get("name")
        if not new_name or not new_name.strip():
            raise HTTPException(status_code=400, detail="Name is required")

        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

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


@router.delete("/{face_id}")
async def delete_face(face_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a face_id and all its encodings."""
    try:
        face = await db.get(FaceID, face_id)
        if not face:
            raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")

        face_name = face.name
        encoding_count = face.encoding_count

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


# ==================== FACE ANALYSIS & GROUPING ====================

@router.get("/{face_id}/duplicate-analysis")
async def analyze_duplicate_embeddings(face_id: int, db: AsyncSession = Depends(get_db)):
    """Analyze embeddings for duplicates and suggest which ones to keep/delete."""
    try:
        import base64

        face_result = await db.execute(
            select(FaceID).where(FaceID.id == face_id)
        )
        face = face_result.scalar_one_or_none()

        if not face:
            logger.warning(f"Face {face_id} not found")
            raise HTTPException(status_code=404, detail=f"Face {face_id} not found")

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

        embeddings_list = []
        for enc, video_name in encodings_data:
            try:
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

        vectors = np.array([emb["vector"] for emb in embeddings_list])
        similarity_matrix = cosine_similarity(vectors)

        similarity_threshold = 0.95
        visited = set()
        groups = []

        for i in range(len(embeddings_list)):
            if i in visited:
                continue

            group_indices = [i]
            visited.add(i)

            for j in range(i + 1, len(embeddings_list)):
                if j not in visited and similarity_matrix[i][j] > similarity_threshold:
                    group_indices.append(j)
                    visited.add(j)

            group_indices.sort(key=lambda idx: embeddings_list[idx]["quality_score"], reverse=True)

            group_embeddings = [
                {k: v for k, v in embeddings_list[idx].items() if k != "vector"}
                for idx in group_indices
            ]

            best_embedding_id = embeddings_list[group_indices[0]]["id"]

            suggested_for_deletion = []
            if len(group_indices) > 1:
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


@router.get("/group/similar")
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

        faces_with_encodings = []
        faces_without_encodings = []

        for face in faces:
            encoding = None

            if face.primary_encoding_id:
                primary_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.id == face.primary_encoding_id)
                )
                encoding = primary_result.scalar_one_or_none()

            if not encoding or not encoding.encoding:
                best_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.face_id == face.id)
                    .order_by(FaceEncoding.quality_score.desc())
                    .limit(1)
                )
                encoding = best_result.scalar_one_or_none()

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

        vectors = np.array([f["vector"] for f in faces_with_encodings])
        similarity_matrix = cosine_similarity(vectors)

        visited = set()
        groups = []

        for i in range(len(faces_with_encodings)):
            if i in visited:
                continue

            group_indices = [i]
            visited.add(i)

            for j in range(i + 1, len(faces_with_encodings)):
                if j not in visited and similarity_matrix[i][j] > threshold:
                    group_indices.append(j)
                    visited.add(j)

            group_faces = []
            for idx in group_indices:
                face_data = faces_with_encodings[idx]
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


@router.post("/compare")
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

        faces_result = await db.execute(
            select(FaceID)
            .where(FaceID.id.in_(face_ids))
        )
        faces = faces_result.scalars().all()

        if len(faces) < 2:
            raise HTTPException(status_code=400, detail="Not enough faces found to compare")

        faces_data = []
        for face in faces:
            encoding = None

            if face.primary_encoding_id:
                primary_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.id == face.primary_encoding_id)
                )
                encoding = primary_result.scalar_one_or_none()

            if not encoding or not encoding.encoding:
                best_result = await db.execute(
                    select(FaceEncoding)
                    .where(FaceEncoding.face_id == face.id)
                    .order_by(FaceEncoding.quality_score.desc())
                    .limit(1)
                )
                encoding = best_result.scalar_one_or_none()

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
                    continue

        if len(faces_data) < 2:
            raise HTTPException(status_code=400, detail=f"Not enough valid faces to compare. Found {len(faces_data)}/required 2. Some faces may not have any encodings.")

        vectors = np.array([f["vector"] for f in faces_data])
        similarity_matrix = cosine_similarity(vectors)

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

        comparisons.sort(key=lambda x: -x["similarity"])

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


@router.post("/merge")
async def merge_faces(
    request: MergeFacesRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Merge multiple face_ids into one.

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

        faces = []
        for face_id in face_ids:
            face = await db.get(FaceID, face_id)
            if not face:
                raise HTTPException(status_code=404, detail=f"Face ID {face_id} not found")
            faces.append(face)

        target_face = faces[0]
        source_faces = faces[1:]

        total_moved = 0
        for source_face in source_faces:
            encodings_result = await db.execute(
                select(FaceEncoding).where(FaceEncoding.face_id == source_face.id)
            )
            encodings = encodings_result.scalars().all()

            for encoding in encodings:
                encoding.face_id = target_face.id
                total_moved += 1

            video_faces_result = await db.execute(
                select(VideoFace).where(VideoFace.face_id == source_face.id)
            )
            video_faces = video_faces_result.scalars().all()

            for video_face in video_faces:
                existing_result = await db.execute(
                    select(VideoFace).where(
                        (VideoFace.video_id == video_face.video_id) &
                        (VideoFace.face_id == target_face.id)
                    )
                )
                existing = existing_result.scalar_one_or_none()

                if existing:
                    existing.appearance_count += video_face.appearance_count
                    await db.delete(video_face)
                else:
                    video_face.face_id = target_face.id

            await db.delete(source_face)

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


# ==================== FACE STATISTICS & CLEANUP ====================

@router.get("/stats")
async def get_face_stats(db: AsyncSession = Depends(get_db)):
    """Get face recognition statistics."""
    try:
        total_faces_result = await db.execute(select(func.count(FaceID.id)))
        total_faces = total_faces_result.scalar()

        total_encodings_result = await db.execute(select(func.count(FaceEncoding.id)))
        total_encodings = total_encodings_result.scalar()

        linked_faces_result = await db.execute(
            select(func.count(FaceID.id)).where(FaceID.actor_id.isnot(None))
        )
        linked_faces = linked_faces_result.scalar()

        avg_encodings = total_encodings / total_faces if total_faces > 0 else 0

        orphaned_faces_result = await db.execute(
            select(func.count(FaceID.id)).where(FaceID.encoding_count == 0)
        )
        orphaned_faces = orphaned_faces_result.scalar()

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


@router.post("/cleanup-orphans")
async def cleanup_orphaned_faces(db: AsyncSession = Depends(get_db)):
    """Clean up orphaned faces (no encodings or no video links)."""
    try:
        faces_no_encodings_result = await db.execute(
            select(FaceID).where(FaceID.encoding_count == 0)
        )
        faces_no_encodings = faces_no_encodings_result.scalars().all()

        faces_no_videos_result = await db.execute(
            select(FaceID)
            .outerjoin(VideoFace, VideoFace.face_id == FaceID.id)
            .where(VideoFace.id.is_(None))
        )
        faces_no_videos = faces_no_videos_result.scalars().all()

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
