"""
SOCKS Proxy Downloader - Download files via SOCKS5 proxy with curl
Maintains proxy and referer settings until manually cleared
"""

import asyncio
import logging
import time
from pathlib import Path
from typing import Dict, Optional
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class SOCKSDownloadStatus:
    """Track SOCKS download status in memory"""
    id: int
    url: str
    filename: str
    status: str  # 'pending' | 'downloading' | 'completed' | 'failed'
    created_at: float
    completed_at: Optional[float] = None
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    proxy_url: Optional[str] = None  # socks5h://127.0.0.1:9050
    referer: Optional[str] = None


class SOCKSDownloader:
    """SOCKS proxy downloader using curl with persistent settings"""

    def __init__(self, download_folder: Path):
        self.download_folder = download_folder
        self.download_folder.mkdir(parents=True, exist_ok=True)

        # In-memory tracking
        self.downloads: Dict[int, SOCKSDownloadStatus] = {}
        self.next_id = 1

        # Global settings (persistent until cleared)
        self.default_proxy_url: Optional[str] = None
        self.default_referer: Optional[str] = None

        logger.info(f"SOCKS Downloader initialized. Output folder: {download_folder}")

    def set_default_proxy(self, proxy_url: str) -> None:
        """Set default SOCKS proxy URL (e.g., 'socks5h://127.0.0.1:9050')"""
        self.default_proxy_url = proxy_url
        logger.info(f"Default SOCKS proxy set: {proxy_url}")

    def set_default_referer(self, referer: str) -> None:
        """Set default referer (persists until cleared)"""
        self.default_referer = referer
        logger.info(f"Default referer set: {referer}")

    def clear_default_proxy(self) -> None:
        """Clear default SOCKS proxy"""
        self.default_proxy_url = None
        logger.info("Default SOCKS proxy cleared")

    def clear_default_referer(self) -> None:
        """Clear default referer"""
        self.default_referer = None
        logger.info("Default referer cleared")

    def get_default_proxy(self) -> Optional[str]:
        """Get current default proxy"""
        return self.default_proxy_url

    def get_default_referer(self) -> Optional[str]:
        """Get current default referer"""
        return self.default_referer

    def create_download(
        self,
        url: str,
        filename: Optional[str] = None,
        proxy_url: Optional[str] = None,
        referer: Optional[str] = None
    ) -> SOCKSDownloadStatus:
        """Create a new SOCKS download task and start it in background"""

        download_id = self.next_id
        self.next_id += 1

        # Generate filename if not provided
        if not filename:
            # Remove query string from URL
            url_path = url.split('?')[0]
            url_path = url_path.split('#')[0]  # Also remove fragment
            
            # Extract the filename from the URL path
            # Get the last part of the path
            url_filename = url_path.split('/')[-1] if '/' in url_path else ''
            
            # Check if it's a valid filename with extension
            if url_filename and '.' in url_filename:
                # Use the actual filename from URL
                filename = url_filename
            else:
                # Fallback: generate timestamp-based name with extension
                ext = url_path.split('.')[-1] if '.' in url_path else 'bin'
                # Sanitize extension (max 5 chars, alphanumeric)
                ext = ''.join(c for c in ext if c.isalnum())[:5]
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"download_{timestamp}.{ext}"

        output_path = self.download_folder / filename

        # Use provided settings or fall back to defaults
        effective_proxy = proxy_url or self.default_proxy_url
        effective_referer = referer or self.default_referer

        # Create download status
        download = SOCKSDownloadStatus(
            id=download_id,
            url=url,
            filename=filename,
            status='pending',
            created_at=time.time(),
            output_path=str(output_path),
            proxy_url=effective_proxy,
            referer=effective_referer
        )

        self.downloads[download_id] = download

        # Start download in background
        asyncio.create_task(self._download_worker(download_id))

        logger.info(f"Created SOCKS download {download_id}: {filename}")
        return download

    async def _download_worker(self, download_id: int):
        """Background worker that handles the actual download via curl"""

        download = self.downloads.get(download_id)
        if not download:
            logger.error(f"Download {download_id} not found")
            return

        try:
            download.status = 'downloading'
            logger.info(f"Starting SOCKS download {download_id}: {download.url}")

            success = await self._download_with_curl(download)

            if success:
                download.status = 'completed'
                download.completed_at = time.time()
                logger.info(f"Download {download_id} completed: {download.filename}")
                # Clear URL after successful download
                download.url = "[cleared after download]"
            else:
                download.status = 'failed'
                if not download.error_message:
                    download.error_message = "Download failed"
                logger.error(f"Download {download_id} failed: {download.error_message}")

        except Exception as e:
            download.status = 'failed'
            download.error_message = str(e)
            logger.error(f"Download {download_id} error: {e}")

    async def _download_with_curl(self, download: SOCKSDownloadStatus) -> bool:
        """Download file using curl with SOCKS proxy"""
        try:
            logger.info(f"Attempting curl download for {download.id}")

            # Build curl command
            cmd = ['curl', '-L']  # -L to follow redirects

            # Add SOCKS proxy if configured
            if download.proxy_url:
                cmd.extend(['-x', download.proxy_url])
                logger.info(f"Using proxy: {download.proxy_url}")

            # Add standard headers
            headers = [
                'accept: */*',
                'accept-language: en-GB,en;q=0.8',
                'priority: i',
                'range: bytes=0-',
            ]

            # Add referer if configured
            if download.referer:
                headers.append(f'referer: {download.referer}')

            # Add all headers
            headers.extend([
                'sec-ch-ua: "Brave";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
                'sec-ch-ua-mobile: ?0',
                'sec-ch-ua-platform: "Linux"',
                'sec-fetch-dest: video',
                'sec-fetch-mode: no-cors',
                'sec-fetch-site: cross-site',
                'sec-fetch-storage-access: none',
                'sec-gpc: 1',
                'user-agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
            ])

            # Add headers to command
            for header in headers:
                cmd.extend(['-H', header])

            # Add output file and URL
            cmd.extend(['-o', download.output_path, download.url])

            logger.info(f"Running curl command: {' '.join(cmd[:5])}... (full command hidden for security)")

            # Run curl subprocess
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            # Wait for completion with timeout
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=3600  # 1 hour timeout
                )
            except asyncio.TimeoutError:
                process.kill()
                download.error_message = "Download timeout (1 hour exceeded)"
                logger.error(f"Download {download.id} timeout")
                return False

            if process.returncode == 0:
                # Verify file was created
                output_file = Path(download.output_path)
                if output_file.exists() and output_file.stat().st_size > 0:
                    logger.info(f"curl download succeeded for {download.id}, size: {output_file.stat().st_size} bytes")
                    return True
                else:
                    download.error_message = "File not created or is empty"
                    logger.warning(f"curl created empty file for {download.id}")
                    return False
            else:
                error_msg = stderr.decode('utf-8', errors='ignore')[-500:]
                download.error_message = f"curl failed with code {process.returncode}: {error_msg}"
                logger.warning(f"curl failed for {download.id}: {error_msg}")
                return False

        except Exception as e:
            download.error_message = f"curl error: {str(e)}"
            logger.warning(f"curl error for {download.id}: {e}")
            return False

    def get_download(self, download_id: int) -> Optional[SOCKSDownloadStatus]:
        """Get download status by ID"""
        return self.downloads.get(download_id)

    def list_downloads(self) -> list[SOCKSDownloadStatus]:
        """List all downloads (sorted by creation time, newest first)"""
        return sorted(
            self.downloads.values(),
            key=lambda d: d.created_at,
            reverse=True
        )

    def list_active_downloads(self) -> list[SOCKSDownloadStatus]:
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
downloader: Optional[SOCKSDownloader] = None


def init_socks_downloader(download_folder: Path):
    """Initialize the global SOCKS downloader instance"""
    global downloader
    downloader = SOCKSDownloader(download_folder)
    logger.info("SOCKS Downloader service initialized")


def get_socks_downloader() -> SOCKSDownloader:
    """Get the global SOCKS downloader instance"""
    if downloader is None:
        raise RuntimeError("SOCKS Downloader not initialized. Call init_socks_downloader() first.")
    return downloader
