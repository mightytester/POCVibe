"""Pydantic schemas for download-related requests."""

from pydantic import BaseModel


class M3U8DownloadRequest(BaseModel):
    """Request model for M3U8 video download."""
    url: str
    start_time: str  # Format: HH:MM:SS
    end_time: str    # Format: HH:MM:SS
    filename: str | None = None  # Optional custom filename
    use_ytdlp_fallback: bool = False  # Try yt-dlp if ffmpeg fails


class SOCKSDownloadRequest(BaseModel):
    """Request model for SOCKS proxy download."""
    url: str
    filename: str | None = None  # Optional custom filename
    proxy_url: str | None = None  # e.g., socks5h://127.0.0.1:9050
    referer: str | None = None  # Optional referer header
