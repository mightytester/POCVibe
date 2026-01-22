"""Custom exception classes for consistent error handling."""

from fastapi import HTTPException


class VideoNotFoundError(HTTPException):
    """Raised when a video is not found in the database."""

    def __init__(self, video_id: int):
        super().__init__(status_code=404, detail=f"Video {video_id} not found")


class FaceNotFoundError(HTTPException):
    """Raised when a face ID is not found in the database."""

    def __init__(self, face_id: int):
        super().__init__(status_code=404, detail=f"Face {face_id} not found")


class ActorNotFoundError(HTTPException):
    """Raised when an actor is not found in the database."""

    def __init__(self, actor_id: int):
        super().__init__(status_code=404, detail=f"Actor {actor_id} not found")


class TagNotFoundError(HTTPException):
    """Raised when a tag is not found in the database."""

    def __init__(self, tag_id: int):
        super().__init__(status_code=404, detail=f"Tag {tag_id} not found")


class FolderNotFoundError(HTTPException):
    """Raised when a folder is not found on the filesystem."""

    def __init__(self, folder_name: str):
        super().__init__(status_code=404, detail=f"Folder '{folder_name}' not found")


class FFmpegNotAvailableError(HTTPException):
    """Raised when FFmpeg is not available on the system."""

    def __init__(self):
        super().__init__(
            status_code=503,
            detail="FFmpeg not available. Please install FFmpeg to use this feature."
        )


class EncodingNotFoundError(HTTPException):
    """Raised when a face encoding is not found."""

    def __init__(self, encoding_id: int):
        super().__init__(status_code=404, detail=f"Encoding {encoding_id} not found")


class FingerprintNotFoundError(HTTPException):
    """Raised when a video fingerprint is not found."""

    def __init__(self, fingerprint_id: int):
        super().__init__(status_code=404, detail=f"Fingerprint {fingerprint_id} not found")


class DownloadNotFoundError(HTTPException):
    """Raised when a download job is not found."""

    def __init__(self, download_id: str):
        super().__init__(status_code=404, detail=f"Download {download_id} not found")


class JobNotFoundError(HTTPException):
    """Raised when a processing job is not found."""

    def __init__(self, job_id: str):
        super().__init__(status_code=404, detail=f"Job {job_id} not found")


class InvalidPathError(HTTPException):
    """Raised when a path is invalid or outside allowed directories."""

    def __init__(self, message: str = "Invalid path"):
        super().__init__(status_code=400, detail=message)


class DuplicateEntryError(HTTPException):
    """Raised when trying to create a duplicate entry."""

    def __init__(self, entity: str, name: str):
        super().__init__(
            status_code=409,
            detail=f"{entity} '{name}' already exists"
        )
