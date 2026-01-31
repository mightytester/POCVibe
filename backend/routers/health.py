"""Health check and configuration endpoints."""

from fastapi import APIRouter
from fastapi.responses import FileResponse, Response
from pathlib import Path

from config import config
from local_mode import local_mode

router = APIRouter()

# Frontend path for static files
frontend_path = Path(__file__).parent.parent.parent / "frontend"


@router.get("/")
async def serve_frontend():
    """Serve the main frontend application."""
    return FileResponse(str(frontend_path / "index.html"))


@router.get("/favicon.ico")
async def favicon():
    """Serve favicon if it exists, otherwise return 204."""
    favicon_path = frontend_path / "favicon.ico"
    if favicon_path.exists():
        return FileResponse(str(favicon_path))
    return Response(status_code=204)


@router.get("/api")
async def api_root():
    """API root endpoint."""
    return {"message": "Clipper API is running"}


@router.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy"}


@router.get("/api/config")
async def get_config():
    """Get current configuration."""
    return {
        "root_directory": str(config.root_directory),
        "excluded_folders": config.excluded_folders,
        "directory_exists": config.root_directory.exists(),
        "local_mode_enabled": local_mode.enabled
    }


@router.get("/api/mode")
async def get_mode_info():
    """Get current video access mode information."""
    return {
        "local_mode_enabled": local_mode.enabled
    }
