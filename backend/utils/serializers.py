"""Serialization helpers for converting database models to API responses."""

from typing import Dict, Any, List, Optional


def serialize_video(video, faces_map: Optional[Dict[int, List]] = None) -> Dict[str, Any]:
    """
    Helper function to serialize a Video object to a dictionary with all fields.

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
        "media_type": video.media_type or 'video',
        "thumbnail_url": video.thumbnail_url,
        "thumbnail_generated": video.thumbnail_generated,
        "thumbnail_updated_at": getattr(video, 'thumbnail_updated_at', 0),
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


def serialize_tag(tag) -> Dict[str, Any]:
    """Serialize a Tag object to a dictionary."""
    return {
        "id": tag.id,
        "name": tag.name,
        "color": tag.color,
    }


def serialize_actor(actor) -> Dict[str, Any]:
    """Serialize an Actor object to a dictionary."""
    return {
        "id": actor.id,
        "name": actor.name,
        "notes": actor.notes,
        "video_count": actor.video_count or 0,
        "created_at": actor.created_at,
    }


def serialize_face(face, include_encodings: bool = False) -> Dict[str, Any]:
    """
    Serialize a FaceID object to a dictionary.

    Args:
        face: FaceID model instance
        include_encodings: Whether to include encoding details

    Returns:
        Dictionary representation of the face
    """
    result = {
        "id": face.id,
        "name": face.name,
        "actor_id": face.actor_id,
        "encoding_count": face.encoding_count or 0,
        "primary_encoding_id": face.primary_encoding_id,
        "created_at": face.created_at,
        "updated_at": face.updated_at,
    }

    if include_encodings and hasattr(face, 'encodings'):
        result["encodings"] = [
            serialize_encoding(enc) for enc in face.encodings
        ]

    return result


def serialize_encoding(encoding) -> Dict[str, Any]:
    """Serialize a FaceEncoding object to a dictionary."""
    return {
        "id": encoding.id,
        "face_id": encoding.face_id,
        "video_id": encoding.video_id,
        "thumbnail": encoding.thumbnail,
        "created_at": encoding.created_at,
    }


def serialize_fingerprint(fingerprint) -> Dict[str, Any]:
    """Serialize a VideoFingerprint object to a dictionary."""
    return {
        "id": fingerprint.id,
        "video_id": fingerprint.video_id,
        "frame_position": fingerprint.frame_position,
        "phash": fingerprint.phash,
        "created_at": fingerprint.created_at,
    }


def serialize_folder_group(group) -> Dict[str, Any]:
    """Serialize a FolderGroup object to a dictionary."""
    return {
        "id": group.id,
        "name": group.name,
        "icon": group.icon,
        "folders": group.folders.split(',') if group.folders else [],
        "position": group.position,
        "is_expanded": bool(group.is_expanded),
        "created_at": group.created_at,
        "updated_at": group.updated_at,
    }
