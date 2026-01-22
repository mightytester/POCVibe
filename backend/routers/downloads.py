"""Download management endpoints (M3U8 and SOCKS proxy)."""

import logging

from fastapi import APIRouter, HTTPException

from m3u8_downloader import get_downloader
from socks_downloader import get_socks_downloader
from schemas.download import M3U8DownloadRequest, SOCKSDownloadRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["downloads"])


# ==================== M3U8 Download Endpoints ====================

@router.post("/api/downloads/m3u8")
async def create_m3u8_download(request: M3U8DownloadRequest):
    """Start a new M3U8 video download in the background."""
    try:
        downloader = get_downloader()
        download = downloader.create_download(
            url=request.url,
            start_time=request.start_time,
            end_time=request.end_time,
            filename=request.filename,
            use_ytdlp_fallback=request.use_ytdlp_fallback
        )

        return {
            "success": True,
            "download_id": download.id,
            "status": download.status,
            "filename": download.filename,
            "message": "Download started in background"
        }

    except Exception as e:
        logger.error(f"Failed to start download: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start download: {str(e)}")


@router.get("/api/downloads/{download_id}")
async def get_download_status(download_id: int):
    """Get status of a specific download."""
    try:
        downloader = get_downloader()
        download = downloader.get_download(download_id)

        if not download:
            raise HTTPException(status_code=404, detail="Download not found")

        return {
            "id": download.id,
            "url": download.url,
            "start_time": download.start_time,
            "end_time": download.end_time,
            "filename": download.filename,
            "status": download.status,
            "created_at": download.created_at,
            "completed_at": download.completed_at,
            "output_path": download.output_path,
            "error_message": download.error_message
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get download status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/downloads")
async def list_downloads(active_only: bool = False):
    """List all downloads."""
    try:
        downloader = get_downloader()

        if active_only:
            downloads = downloader.list_active_downloads()
        else:
            downloads = downloader.list_downloads()

        return {
            "downloads": [
                {
                    "id": d.id,
                    "url": d.url,
                    "filename": d.filename,
                    "status": d.status,
                    "created_at": d.created_at,
                    "completed_at": d.completed_at,
                    "error_message": d.error_message
                }
                for d in downloads
            ],
            "count": len(downloads)
        }

    except Exception as e:
        logger.error(f"Failed to list downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/downloads/{download_id}")
async def remove_download(download_id: int):
    """Remove download from tracking (does not delete file)."""
    try:
        downloader = get_downloader()
        success = downloader.remove_download(download_id)

        if not success:
            raise HTTPException(status_code=404, detail="Download not found")

        return {"success": True, "message": "Download removed from tracking"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/downloads/clear-completed")
async def clear_completed_downloads():
    """Clear all completed/failed downloads from memory."""
    try:
        downloader = get_downloader()
        downloader.clear_completed()

        return {"success": True, "message": "Completed downloads cleared"}

    except Exception as e:
        logger.error(f"Failed to clear downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SOCKS Proxy Download Endpoints ====================

@router.post("/api/socks-downloads")
async def create_socks_download(request: SOCKSDownloadRequest):
    """Start a new SOCKS proxy download in the background."""
    try:
        downloader = get_socks_downloader()
        download = downloader.create_download(
            url=request.url,
            filename=request.filename,
            proxy_url=request.proxy_url,
            referer=request.referer
        )

        return {
            "success": True,
            "download_id": download.id,
            "status": download.status,
            "filename": download.filename,
            "message": "SOCKS download started in background"
        }

    except Exception as e:
        logger.error(f"Failed to start SOCKS download: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start download: {str(e)}")


@router.get("/api/socks-downloads/{download_id}")
async def get_socks_download_status(download_id: int):
    """Get status of a specific SOCKS download."""
    try:
        downloader = get_socks_downloader()
        download = downloader.get_download(download_id)

        if not download:
            raise HTTPException(status_code=404, detail="SOCKS download not found")

        return {
            "id": download.id,
            "url": download.url,
            "filename": download.filename,
            "status": download.status,
            "proxy_url": download.proxy_url,
            "referer": download.referer,
            "created_at": download.created_at,
            "completed_at": download.completed_at,
            "output_path": download.output_path,
            "error_message": download.error_message
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get SOCKS download status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/socks-downloads")
async def list_socks_downloads(active_only: bool = False):
    """List all SOCKS downloads."""
    try:
        downloader = get_socks_downloader()

        if active_only:
            downloads = downloader.list_active_downloads()
        else:
            downloads = downloader.list_downloads()

        return {
            "downloads": [
                {
                    "id": d.id,
                    "url": d.url,
                    "filename": d.filename,
                    "status": d.status,
                    "proxy_url": d.proxy_url,
                    "created_at": d.created_at,
                    "completed_at": d.completed_at,
                    "error_message": d.error_message
                }
                for d in downloads
            ],
            "count": len(downloads)
        }

    except Exception as e:
        logger.error(f"Failed to list SOCKS downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/socks-downloads/{download_id}")
async def remove_socks_download(download_id: int):
    """Remove SOCKS download from tracking (does not delete file)."""
    try:
        downloader = get_socks_downloader()
        success = downloader.remove_download(download_id)

        if not success:
            raise HTTPException(status_code=404, detail="SOCKS download not found")

        return {"success": True, "message": "SOCKS download removed from tracking"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove SOCKS download: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/socks-downloads/clear-completed")
async def clear_completed_socks_downloads():
    """Clear all completed/failed SOCKS downloads from memory."""
    try:
        downloader = get_socks_downloader()
        downloader.clear_completed()

        return {"success": True, "message": "Completed SOCKS downloads cleared"}

    except Exception as e:
        logger.error(f"Failed to clear SOCKS downloads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/socks-config/proxy")
async def set_socks_proxy(proxy_url: str):
    """Set default SOCKS proxy for all future downloads."""
    try:
        downloader = get_socks_downloader()
        downloader.set_default_proxy(proxy_url)

        return {
            "success": True,
            "message": f"Default SOCKS proxy set: {proxy_url}",
            "proxy": proxy_url
        }

    except Exception as e:
        logger.error(f"Failed to set SOCKS proxy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/socks-config/proxy")
async def get_socks_proxy():
    """Get current default SOCKS proxy."""
    try:
        downloader = get_socks_downloader()
        proxy = downloader.get_default_proxy()

        return {
            "proxy": proxy,
            "is_set": proxy is not None
        }

    except Exception as e:
        logger.error(f"Failed to get SOCKS proxy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/socks-config/proxy")
async def clear_socks_proxy():
    """Clear default SOCKS proxy."""
    try:
        downloader = get_socks_downloader()
        downloader.clear_default_proxy()

        return {
            "success": True,
            "message": "Default SOCKS proxy cleared"
        }

    except Exception as e:
        logger.error(f"Failed to clear SOCKS proxy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/socks-config/referer")
async def set_socks_referer(referer: str):
    """Set default referer for all future downloads."""
    try:
        downloader = get_socks_downloader()
        downloader.set_default_referer(referer)

        return {
            "success": True,
            "message": f"Default referer set: {referer}",
            "referer": referer
        }

    except Exception as e:
        logger.error(f"Failed to set referer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/socks-config/referer")
async def get_socks_referer():
    """Get current default referer."""
    try:
        downloader = get_socks_downloader()
        referer = downloader.get_default_referer()

        return {
            "referer": referer,
            "is_set": referer is not None
        }

    except Exception as e:
        logger.error(f"Failed to get referer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/api/socks-config/referer")
async def clear_socks_referer():
    """Clear default referer."""
    try:
        downloader = get_socks_downloader()
        downloader.clear_default_referer()

        return {
            "success": True,
            "message": "Default referer cleared"
        }

    except Exception as e:
        logger.error(f"Failed to clear referer: {e}")
        raise HTTPException(status_code=500, detail=str(e))
