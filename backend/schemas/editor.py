"""Pydantic schemas for video editor requests."""

from pydantic import BaseModel


class VideoEditRequest(BaseModel):
    """Request model for video editing (cut/crop)."""
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
