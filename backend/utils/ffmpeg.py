"""Centralized FFmpeg availability check and utilities."""

import subprocess
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Cached FFmpeg availability status
_ffmpeg_available: Optional[bool] = None
_ffmpeg_version: Optional[str] = None


def check_ffmpeg() -> bool:
    """
    Check if FFmpeg is available on the system.

    Result is cached after first check for performance.

    Returns:
        True if FFmpeg is available, False otherwise.
    """
    global _ffmpeg_available

    if _ffmpeg_available is not None:
        return _ffmpeg_available

    try:
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        _ffmpeg_available = result.returncode == 0
        if _ffmpeg_available:
            # Extract version from first line
            first_line = result.stdout.split('\n')[0] if result.stdout else ''
            logger.debug(f"FFmpeg available: {first_line}")
        else:
            logger.warning("FFmpeg check returned non-zero exit code")
    except FileNotFoundError:
        logger.warning("FFmpeg not found in PATH")
        _ffmpeg_available = False
    except subprocess.TimeoutExpired:
        logger.warning("FFmpeg check timed out")
        _ffmpeg_available = False
    except Exception as e:
        logger.warning(f"FFmpeg check failed: {e}")
        _ffmpeg_available = False

    return _ffmpeg_available


def get_ffmpeg_version() -> Optional[str]:
    """
    Get the FFmpeg version string.

    Returns:
        Version string if FFmpeg is available, None otherwise.
    """
    global _ffmpeg_version

    if _ffmpeg_version is not None:
        return _ffmpeg_version

    if not check_ffmpeg():
        return None

    try:
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout:
            # Parse version from first line: "ffmpeg version X.X.X ..."
            first_line = result.stdout.split('\n')[0]
            parts = first_line.split()
            if len(parts) >= 3 and parts[0] == 'ffmpeg' and parts[1] == 'version':
                _ffmpeg_version = parts[2]
            else:
                _ffmpeg_version = first_line
    except Exception as e:
        logger.warning(f"Failed to get FFmpeg version: {e}")
        _ffmpeg_version = None

    return _ffmpeg_version


def check_ffprobe() -> bool:
    """
    Check if FFprobe is available on the system.

    Returns:
        True if FFprobe is available, False otherwise.
    """
    try:
        result = subprocess.run(
            ['ffprobe', '-version'],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        return False


def reset_cache():
    """Reset the cached FFmpeg availability status (useful for testing)."""
    global _ffmpeg_available, _ffmpeg_version
    _ffmpeg_available = None
    _ffmpeg_version = None
