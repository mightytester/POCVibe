from sqlalchemy import Column, Integer, String, LargeBinary, Float, create_engine, select
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from pathlib import Path
import hashlib
import subprocess
import logging
from typing import Optional
import time

logger = logging.getLogger(__name__)

Base = declarative_base()

class Thumbnail(Base):
    __tablename__ = "thumbnails"

    id = Column(Integer, primary_key=True)
    video_path_hash = Column(String, unique=True, nullable=False)  # MD5 of video path
    image_data = Column(LargeBinary, nullable=False)  # JPEG binary data
    created_at = Column(Float, nullable=False)  # Unix timestamp
    file_size = Column(Integer, nullable=False)  # Size in bytes
    width = Column(Integer, default=320)
    height = Column(Integer, default=180)

class ThumbnailDatabase:
    def __init__(self, db_path: str = "thumbnails.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Create separate engine for thumbnails
        self.database_url = f"sqlite+aiosqlite:///{self.db_path}"
        self.engine = create_async_engine(self.database_url, echo=False)
        self.SessionLocal = async_sessionmaker(self.engine, expire_on_commit=False)

        # Check FFmpeg availability
        self.ffmpeg_available = self._check_ffmpeg()

    def _check_ffmpeg(self) -> bool:
        """Check if FFmpeg is available"""
        try:
            subprocess.run(['ffmpeg', '-version'],
                         capture_output=True, check=True, timeout=5)
            return True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            return False

    async def create_tables(self):
        """Create thumbnail database tables"""
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    def _get_path_hash(self, video_path: str) -> str:
        """Generate MD5 hash for video path"""
        return hashlib.md5(str(video_path).encode()).hexdigest()

    async def get_thumbnail_data(self, video_path: str) -> Optional[bytes]:
        """Get thumbnail binary data from database"""
        path_hash = self._get_path_hash(video_path)

        async with self.SessionLocal() as session:
            result = await session.execute(
                select(Thumbnail).where(Thumbnail.video_path_hash == path_hash)
            )
            thumbnail = result.scalar_one_or_none()

            if thumbnail:
                return thumbnail.image_data
            return None

    async def store_thumbnail(self, video_path: str, image_data: bytes) -> bool:
        """Store thumbnail binary data in database"""
        path_hash = self._get_path_hash(video_path)

        async with self.SessionLocal() as session:
            # Check if already exists
            result = await session.execute(
                select(Thumbnail).where(Thumbnail.video_path_hash == path_hash)
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Update existing
                existing.image_data = image_data
                existing.created_at = time.time()
                existing.file_size = len(image_data)
            else:
                # Create new
                thumbnail = Thumbnail(
                    video_path_hash=path_hash,
                    image_data=image_data,
                    created_at=time.time(),
                    file_size=len(image_data)
                )
                session.add(thumbnail)

            await session.commit()
            return True

    async def generate_thumbnail_for_video(self, video_path: str, video_id: int = None) -> bool:
        """Generate thumbnail for a video (wrapper for generate_and_store_thumbnail)
        
        Args:
            video_path: Path to the video file
            video_id: Video ID (optional, for logging purposes)
            
        Returns:
            True if thumbnail was generated, False otherwise
        """
        return await self.generate_and_store_thumbnail(video_path, timestamp="00:00:01")

    async def generate_and_store_thumbnail(self, video_path: str,
                                         timestamp: str = "00:00:01", force_regenerate: bool = False) -> bool:
        """Generate thumbnail using FFmpeg and store in database"""
        if not self.ffmpeg_available:
            return False

        if not Path(video_path).exists():
            return False

        # ✅ NEW: Safety check - if file is an image, use image thumbnail instead
        file_ext = Path(video_path).suffix.lower()
        image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
        if file_ext in image_extensions:
            logger.warning(f"⚠️ Image file passed to generate_and_store_thumbnail: {video_path}")
            logger.info(f"🖼️ Routing to image thumbnail handler instead")
            return await self.store_image_thumbnail(video_path)

        # Check if already exists (unless forced to regenerate)
        if not force_regenerate and await self.get_thumbnail_data(video_path):
            return True

        try:
            # Generate thumbnail to temporary location
            import tempfile
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as temp_file:
                temp_path = temp_file.name

            # Optimized FFmpeg command for faster thumbnail generation
            cmd = [
                'ffmpeg',
                '-ss', timestamp,  # Seek before input for much faster seeking
                '-i', str(video_path),
                '-vframes', '1',
                '-vf', 'scale=320:-1',  # Preserve aspect ratio (320px width, auto height)
                '-q:v', '2',  # Better quality, small size increase
                '-f', 'mjpeg',  # Explicit format
                '-threads', '1',  # Single thread for predictable performance
                '-loglevel', 'error',  # Reduce log verbosity
                '-y',
                temp_path
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=15,  # Reduced timeout for faster failure detection
                check=True
            )

            # Read generated file and store in database
            with open(temp_path, 'rb') as f:
                image_data = f.read()

            # Clean up temp file
            Path(temp_path).unlink()

            # Store in database
            return await self.store_thumbnail(video_path, image_data)

        except Exception as e:
            logger.error(f"Error generating thumbnail for {video_path}: {e}")
            return False

    async def store_image_thumbnail(self, image_path: str) -> bool:
        """Store image file itself as thumbnail (for JPG, PNG, GIF, WEBP) - ✅ NEW
        
        Much faster than generating - just resize/compress the image file directly.
        Uses CV2 first, falls back to PIL for formats CV2 doesn't support (animated WebP).
        """
        if not Path(image_path).exists():
            return False

        # Try CV2 first (faster for static images) - ✅ UPDATED: Better error handling
        try:
            import cv2
            
            try:
                img = cv2.imread(image_path)
                if img is not None:
                    # Successfully read with CV2
                    max_size = 320
                    height, width = img.shape[:2]
                    scale = max_size / max(height, width)
                    
                    if scale < 1:  # Only resize if larger than max_size
                        new_width = int(width * scale)
                        new_height = int(height * scale)
                        img = cv2.resize(img, (new_width, new_height), interpolation=cv2.INTER_LANCZOS4)
                    
                    # Encode as JPEG
                    success, thumb_bytes = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    
                    if success:
                        return await self.store_thumbnail(image_path, thumb_bytes.tobytes())
            
            except Exception as cv2_error:
                # CV2 failed (likely animated WebP or unsupported format)
                logger.debug(f"CV2 failed for {Path(image_path).name}: {type(cv2_error).__name__}")
            
            # CV2 failed or returned None - try PIL/Pillow as fallback - ✅ NEW
            logger.debug(f"Trying PIL fallback for {Path(image_path).name}...")
            try:
                from PIL import Image
                import io
                
                # Open image with PIL (supports animated WebP, APNG, etc.)
                with Image.open(image_path) as img:
                    # For animated images, get first frame
                    if hasattr(img, 'is_animated') and img.is_animated:
                        img.seek(0)  # Get first frame
                        logger.debug(f"Using first frame from animated image: {Path(image_path).name}")
                    
                    # Convert to RGB if necessary (handles RGBA, LA, P, etc.)
                    if img.mode in ('RGBA', 'LA', 'P'):
                        img = img.convert('RGB')
                    elif img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Resize to thumbnail size while preserving aspect ratio
                    max_size = 320
                    img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
                    
                    # Encode as JPEG
                    buffer = io.BytesIO()
                    img.save(buffer, format='JPEG', quality=85, optimize=True)
                    thumb_bytes = buffer.getvalue()
                    
                    if thumb_bytes:
                        logger.info(f"✅ PIL fallback successful for {Path(image_path).name}")
                        return await self.store_thumbnail(image_path, thumb_bytes)
            
            except ImportError:
                logger.warning("PIL/Pillow not installed, cannot process image: " + str(image_path))
                return False
            except Exception as pil_error:
                logger.error(f"PIL fallback failed for {Path(image_path).name}: {pil_error}")
                return False
            
            return False

        except Exception as e:
            logger.error(f"Error storing image thumbnail for {image_path}: {e}")
            return False

    async def delete_thumbnail(self, video_path: str) -> bool:
        """Delete thumbnail from database"""
        path_hash = self._get_path_hash(video_path)

        async with self.SessionLocal() as session:
            result = await session.execute(
                select(Thumbnail).where(Thumbnail.video_path_hash == path_hash)
            )
            thumbnail = result.scalar_one_or_none()

            if thumbnail:
                await session.delete(thumbnail)
                await session.commit()
                return True
            return False

    async def cleanup_orphaned_thumbnails(self, valid_video_paths: set) -> int:
        """Remove thumbnails for videos that no longer exist"""
        valid_hashes = {self._get_path_hash(path) for path in valid_video_paths}

        async with self.SessionLocal() as session:
            # Get all thumbnail hashes
            result = await session.execute(select(Thumbnail))
            all_thumbnails = result.scalars().all()

            removed_count = 0
            for thumbnail in all_thumbnails:
                if thumbnail.video_path_hash not in valid_hashes:
                    await session.delete(thumbnail)
                    removed_count += 1

            await session.commit()
            return removed_count

    async def get_cache_stats(self) -> tuple[int, int]:
        """Get thumbnail cache statistics (count, total size in MB)"""
        async with self.SessionLocal() as session:
            result = await session.execute(select(Thumbnail))
            thumbnails = result.scalars().all()

            count = len(thumbnails)
            total_size = sum(t.file_size for t in thumbnails)

            return count, total_size // (1024 * 1024)  # Convert to MB

    async def update_path_hash(self, old_path: str, new_path: str) -> bool:
        """Update thumbnail path hash when video is moved/renamed

        Args:
            old_path: Original video file path
            new_path: New video file path after rename/move

        Returns:
            True if thumbnail was found and updated, False otherwise
        """
        old_hash = self._get_path_hash(old_path)
        new_hash = self._get_path_hash(new_path)

        async with self.SessionLocal() as session:
            # Find thumbnail with old hash
            result = await session.execute(
                select(Thumbnail).where(Thumbnail.video_path_hash == old_hash)
            )
            thumbnail = result.scalar_one_or_none()

            if thumbnail:
                # Update to new hash
                thumbnail.video_path_hash = new_hash
                await session.commit()
                logger.info(f"✅ Updated thumbnail hash: {old_path} → {new_path}")
                return True
            else:
                logger.warning(f"⚠️ No thumbnail found for old path: {old_path}")
                return False