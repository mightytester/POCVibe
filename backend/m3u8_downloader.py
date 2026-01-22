"""
M3U8 Download Service - Simple utility for downloading M3U8 video clips
No database - in-memory tracking only
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Dict, Optional
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class DownloadStatus:
    """Track download status in memory"""
    id: int
    url: str
    start_time: str
    end_time: str
    filename: str
    status: str  # 'pending' | 'downloading' | 'completed' | 'failed'
    created_at: float
    completed_at: Optional[float] = None
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    use_ytdlp_fallback: bool = False


class M3U8Downloader:
    """Simple M3U8 downloader using ffmpeg (with optional yt-dlp fallback)"""

    def __init__(self, download_folder: Path):
        self.download_folder = download_folder
        self.download_folder.mkdir(parents=True, exist_ok=True)

        # In-memory tracking
        self.downloads: Dict[int, DownloadStatus] = {}
        self.next_id = 1

        logger.info(f"M3U8 Downloader initialized. Output folder: {download_folder}")

    def create_download(
        self,
        url: str,
        start_time: str,
        end_time: str,
        filename: Optional[str] = None,
        use_ytdlp_fallback: bool = False
    ) -> DownloadStatus:
        """Create a new download task and start it in background"""

        download_id = self.next_id
        self.next_id += 1

        # Generate filename if not provided
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"video_{timestamp}.mp4"

        # Append start and end times to filename (convert HH:MM:SS to HHMMSS)
        start_suffix = start_time.replace(':', '')  # "01:23:45" -> "012345"
        end_suffix = end_time.replace(':', '')      # "02:30:15" -> "023015"

        # Remove .mp4 extension if present, add time suffix, then add .mp4
        if filename.endswith('.mp4'):
            filename = filename[:-4]  # Remove .mp4

        filename = f"{filename}_{start_suffix}_{end_suffix}.mp4"

        output_path = self.download_folder / filename

        # Create download status
        download = DownloadStatus(
            id=download_id,
            url=url,
            start_time=start_time,
            end_time=end_time,
            filename=filename,
            status='pending',
            created_at=time.time(),
            output_path=str(output_path),
            use_ytdlp_fallback=use_ytdlp_fallback
        )

        self.downloads[download_id] = download

        # Start download in background
        asyncio.create_task(self._download_worker(download_id))

        logger.info(f"Created download {download_id}: {filename}")
        return download

    async def _download_worker(self, download_id: int):
        """Background worker that handles the actual download"""

        download = self.downloads.get(download_id)
        if not download:
            logger.error(f"Download {download_id} not found")
            return

        try:
            download.status = 'downloading'
            logger.info(f"Starting download {download_id}: {download.url}")

            # Try ffmpeg first (primary method)
            success = await self._try_ffmpeg_download(download)

            # If ffmpeg failed and fallback is enabled, try yt-dlp
            if not success and download.use_ytdlp_fallback:
                logger.info(f"ffmpeg failed for download {download_id}, trying yt-dlp fallback")
                success = await self._try_ytdlp_download(download)

            if success:
                download.status = 'completed'
                download.completed_at = time.time()
                logger.info(f"Download {download_id} completed: {download.filename}")
            else:
                download.status = 'failed'
                if not download.error_message:
                    download.error_message = "Download failed with all methods"
                logger.error(f"Download {download_id} failed: {download.error_message}")

        except Exception as e:
            download.status = 'failed'
            download.error_message = str(e)
            logger.error(f"Download {download_id} error: {e}")

    async def _try_ffmpeg_download(self, download: DownloadStatus) -> bool:
        """Try downloading with ffmpeg (primary method)"""
        try:
            logger.info(f"Attempting ffmpeg download for {download.id}")

            # Calculate duration
            start_parts = list(map(int, download.start_time.split(':')))
            end_parts = list(map(int, download.end_time.split(':')))
            start_seconds = start_parts[0] * 3600 + start_parts[1] * 60 + start_parts[2]
            end_seconds = end_parts[0] * 3600 + end_parts[1] * 60 + end_parts[2]
            duration = end_seconds - start_seconds

            # Build ffmpeg command
            cmd = [
                'ffmpeg',
                '-ss', download.start_time,
                '-i', download.url,
                '-t', str(duration),
                '-c', 'copy',
                '-y',  # Overwrite without asking
                download.output_path
            ]

            logger.info(f"Running ffmpeg: {' '.join(cmd)}")

            # Run ffmpeg subprocess
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Wait for completion
            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                logger.info(f"ffmpeg download succeeded for {download.id}")
                return True
            else:
                error_msg = stderr.decode('utf-8')[-500:]
                download.error_message = f"ffmpeg failed: {error_msg}"
                logger.warning(f"ffmpeg failed for {download.id}: {error_msg}")
                return False

        except Exception as e:
            download.error_message = f"ffmpeg error: {str(e)}"
            logger.warning(f"ffmpeg error for {download.id}: {e}")
            return False

    async def _try_ytdlp_download(self, download: DownloadStatus) -> bool:
        """Try downloading with yt-dlp (fallback method with enhanced format)"""
        try:
            logger.info(f"Attempting yt-dlp download for {download.id}")

            # Get just the filename (not full path) and download folder
            output_path = Path(download.output_path)
            filename = output_path.name
            download_folder = output_path.parent

            # Build yt-dlp command with enhanced format selection
            # Use -o with just filename, and cwd to set the download directory
            cmd = [
                'yt-dlp',
                '-f', 'bestvideo*+bestaudio/best',  # Enhanced format selection
                '--hls-prefer-native',
                '--download-sections', f'*{download.start_time}-{download.end_time}',
                '-o', filename,  # Just filename, not full path
                download.url
            ]

            logger.info(f"Running yt-dlp in {download_folder}: {' '.join(cmd)}")

            # Run yt-dlp subprocess with cwd set to download folder
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(download_folder)  # Set working directory
            )

            # Wait for completion
            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                logger.info(f"yt-dlp download succeeded for {download.id}")
                return True
            else:
                error_msg = stderr.decode('utf-8')[-500:]
                download.error_message = f"yt-dlp fallback also failed: {error_msg}"
                logger.error(f"yt-dlp failed for {download.id}: {error_msg}")
                return False

        except Exception as e:
            download.error_message = f"yt-dlp error: {str(e)}"
            logger.error(f"yt-dlp error for {download.id}: {e}")
            return False

    def get_download(self, download_id: int) -> Optional[DownloadStatus]:
        """Get download status by ID"""
        return self.downloads.get(download_id)

    def list_downloads(self) -> list[DownloadStatus]:
        """List all downloads (sorted by creation time, newest first)"""
        return sorted(
            self.downloads.values(),
            key=lambda d: d.created_at,
            reverse=True
        )

    def list_active_downloads(self) -> list[DownloadStatus]:
        """List only active downloads (pending or downloading)"""
        return [
            d for d in self.downloads.values()
            if d.status in ('pending', 'downloading')
        ]

    def remove_download(self, download_id: int) -> bool:
        """Remove download from tracking (does not delete file)"""
        if download_id in self.downloads:
            del self.downloads[download_id]
            logger.info(f"Removed download {download_id} from tracking")
            return True
        return False

    def clear_completed(self):
        """Clear all completed/failed downloads from memory"""
        to_remove = [
            d_id for d_id, d in self.downloads.items()
            if d.status in ('completed', 'failed')
        ]
        for d_id in to_remove:
            del self.downloads[d_id]
        logger.info(f"Cleared {len(to_remove)} completed/failed downloads")


# Global instance
downloader: Optional[M3U8Downloader] = None


def init_downloader(download_folder: Path):
    """Initialize the global downloader instance"""
    global downloader
    downloader = M3U8Downloader(download_folder)
    logger.info("M3U8 Downloader service initialized")


def get_downloader() -> M3U8Downloader:
    """Get the global downloader instance"""
    if downloader is None:
        raise RuntimeError("M3U8 Downloader not initialized. Call init_downloader() first.")
    return downloader
