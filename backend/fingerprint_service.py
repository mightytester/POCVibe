"""
Video Fingerprinting Service using Perceptual Hashing

This service generates perceptual hashes (pHash) for videos by extracting key frames
and comparing them to detect duplicate or similar content.
"""

import imagehash
from PIL import Image
import subprocess
import tempfile
from pathlib import Path
from typing import List, Tuple, Optional
import asyncio
import logging
import os

logger = logging.getLogger(__name__)


class FingerprintService:
    """Generate and compare video fingerprints using perceptual hashing"""

    def __init__(self):
        self.hash_size = 8  # 64-bit hash (8x8 grid)
        self.frame_positions = [5, 25, 50, 75, 95]  # Percentage positions (avoid edges)
        self._check_ffmpeg()

    def _check_ffmpeg(self):
        """Check if FFmpeg is available"""
        try:
            subprocess.run(['ffmpeg', '-version'],
                         capture_output=True, check=True, timeout=5)
            self.ffmpeg_available = True
        except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
            self.ffmpeg_available = False
            logger.warning("FFmpeg not available - fingerprinting will not work")

    async def generate_fingerprints(self, video_path: str) -> List[Tuple[int, str]]:
        """
        Extract key frames and generate pHash for each

        For videos: Extract 5 frames at key positions (5%, 25%, 50%, 75%, 95%)
        For images (JPG, PNG, WebP): Generate 1 fingerprint from the image
        For animated GIF/WebP: Generate 1 fingerprint from first frame (like thumbnail)

        Args:
            video_path: Path to video file or image file

        Returns:
            List of (frame_position_percent, hash_hex) tuples
            - Videos: [(5, 'hash'), (25, 'hash'), (50, 'hash'), (75, 'hash'), (95, 'hash')]
            - Images: [(0, 'hash')] - single fingerprint at position 0
        """
        if not self.ffmpeg_available:
            logger.error("FFmpeg not available")
            return []

        if not Path(video_path).exists():
            logger.error(f"Video file not found: {video_path}")
            return []

        file_ext = Path(video_path).suffix.lower()
        is_image = file_ext in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}

        fingerprints = []

        if is_image:
            # For images: Generate only 1 fingerprint (from first frame/whole image)
            logger.info(f"Generating fingerprint for image: {Path(video_path).name}")

            try:
                # For static images, use directly; for animated (GIF/WebP), extract first frame
                if file_ext in {'.gif', '.webp'}:
                    # Extract first frame from animation
                    frame_path = await self._extract_frame(video_path, 0.0)
                    if not frame_path:
                        logger.warning(f"Failed to extract first frame from {Path(video_path).name}")
                        return []

                    try:
                        img = Image.open(frame_path)
                        phash = imagehash.phash(img, hash_size=self.hash_size)
                        fingerprints.append((0, str(phash)))
                        logger.info(f"Generated fingerprint from first frame of {Path(video_path).name}: {phash}")
                    finally:
                        try:
                            os.unlink(frame_path)
                        except:
                            pass
                else:
                    # Static image (JPG, PNG, etc.)
                    img = Image.open(video_path)
                    phash = imagehash.phash(img, hash_size=self.hash_size)
                    fingerprints.append((0, str(phash)))
                    logger.info(f"Generated fingerprint for static image {Path(video_path).name}: {phash}")

            except Exception as e:
                logger.error(f"Failed to generate fingerprint for image {video_path}: {e}")
                return []

        else:
            # For videos: Extract frames at key positions
            duration = await self._get_duration(video_path)
            if not duration or duration <= 0:
                logger.error(f"Could not get duration for: {video_path}")
                return []

            logger.info(f"Generating fingerprints for video: {Path(video_path).name} (duration: {duration:.1f}s)")

            # Extract frames at each position
            for position in self.frame_positions:
                # Calculate timestamp
                timestamp = (duration * position) / 100.0

                # Extract frame at timestamp
                frame_path = await self._extract_frame(video_path, timestamp)
                if not frame_path:
                    logger.warning(f"Failed to extract frame at {position}% for {Path(video_path).name}")
                    continue

                try:
                    # Generate pHash
                    img = Image.open(frame_path)
                    phash = imagehash.phash(img, hash_size=self.hash_size)
                    fingerprints.append((position, str(phash)))
                    logger.debug(f"Generated hash for {position}%: {phash}")
                except Exception as e:
                    logger.error(f"Failed to generate hash for frame at {position}%: {e}")
                finally:
                    # Cleanup temp file
                    try:
                        os.unlink(frame_path)
                    except:
                        pass

        logger.info(f"Generated {len(fingerprints)} fingerprint(s) for {Path(video_path).name}")
        return fingerprints

    async def _get_duration(self, video_path: str) -> Optional[float]:
        """Get video duration in seconds using ffprobe"""
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(video_path)
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=10)

            if process.returncode == 0:
                duration_str = stdout.decode().strip()
                return float(duration_str)
            else:
                logger.error(f"ffprobe failed: {stderr.decode()}")
                return None
        except asyncio.TimeoutError:
            logger.error("ffprobe timeout")
            return None
        except Exception as e:
            logger.error(f"Error getting duration: {e}")
            return None

    async def _extract_frame(self, video_path: str, timestamp: float) -> Optional[str]:
        """
        Extract single frame at timestamp

        Args:
            video_path: Path to video file
            timestamp: Time in seconds

        Returns:
            Path to extracted frame (temp file) or None if failed
        """
        temp_file = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
        temp_path = temp_file.name
        temp_file.close()

        cmd = [
            'ffmpeg',
            '-ss', str(timestamp),
            '-i', str(video_path),
            '-vframes', '1',
            '-vf', 'scale=320:-1',  # Consistent size for comparison, preserve aspect ratio
            '-q:v', '2',
            '-loglevel', 'error',
            '-y',
            temp_path
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await asyncio.wait_for(process.communicate(), timeout=15)

            if process.returncode == 0 and Path(temp_path).exists():
                return temp_path
            else:
                # Cleanup on failure
                try:
                    os.unlink(temp_path)
                except:
                    pass
                return None
        except asyncio.TimeoutError:
            logger.error(f"Frame extraction timeout at {timestamp}s")
            try:
                os.unlink(temp_path)
            except:
                pass
            return None
        except Exception as e:
            logger.error(f"Error extracting frame: {e}")
            try:
                os.unlink(temp_path)
            except:
                pass
            return None

    def hamming_distance(self, hash1: str, hash2: str) -> int:
        """
        Calculate Hamming distance between two hashes

        Args:
            hash1: First hash (hex string)
            hash2: Second hash (hex string)

        Returns:
            Hamming distance (0 = identical, higher = more different)
        """
        try:
            h1 = imagehash.hex_to_hash(hash1)
            h2 = imagehash.hex_to_hash(hash2)
            return h1 - h2  # Returns Hamming distance
        except Exception as e:
            logger.error(f"Error calculating hamming distance: {e}")
            return 999  # Return high value on error

    def are_similar(self, hash1: str, hash2: str, threshold: int = 10) -> bool:
        """
        Check if two hashes represent similar videos

        Args:
            hash1: First hash (hex string)
            hash2: Second hash (hex string)
            threshold: Maximum Hamming distance to consider similar (default: 10)
                      - 0: Identical
                      - 1-5: Very similar (slight quality changes)
                      - 6-10: Similar (resolution changes, minor edits)
                      - 11-15: Possibly related
                      - 16+: Different

        Returns:
            True if similar (distance <= threshold)
        """
        distance = self.hamming_distance(hash1, hash2)
        return distance <= threshold

    def similarity_percent(self, hamming_distance: int) -> float:
        """
        Convert Hamming distance to similarity percentage

        Args:
            hamming_distance: Hamming distance between two hashes

        Returns:
            Similarity percentage (0-100)
        """
        # 64 bits total, each bit difference = 1.5625% less similar
        return max(0, 100 - (hamming_distance * 1.5625))

    async def extract_frame_image(self, video_path: str, position: float) -> Optional[str]:
        """
        Extract single frame at position and return as base64 encoded JPEG thumbnail

        Args:
            video_path: Path to video file
            position: Position in video (0.0 to 1.0, percentage)

        Returns:
            Base64 encoded JPEG image string, or None if failed
        """
        if not self.ffmpeg_available:
            logger.error("FFmpeg not available")
            return None

        if not Path(video_path).exists():
            logger.error(f"Video file not found: {video_path}")
            return None

        # Get video duration
        duration = await self._get_duration(video_path)
        if not duration or duration <= 0:
            logger.error(f"Could not get duration for: {video_path}")
            return None

        # Calculate timestamp from position
        timestamp = duration * position

        # Extract frame
        frame_path = await self._extract_frame(video_path, timestamp)
        if not frame_path:
            logger.error(f"Failed to extract frame at {position*100}%")
            return None

        try:
            # Read image and convert to base64
            import base64
            with open(frame_path, 'rb') as f:
                image_data = f.read()

            # Encode to base64
            base64_str = base64.b64encode(image_data).decode('utf-8')
            return f"data:image/jpeg;base64,{base64_str}"
        except Exception as e:
            logger.error(f"Failed to encode frame image: {e}")
            return None
        finally:
            # Cleanup temp file
            try:
                os.unlink(frame_path)
            except:
                pass

    async def generate_single_frame_fingerprint(self, video_path: str, position: float) -> Optional[str]:
        """
        Generate pHash fingerprint for a single frame at specified position

        Args:
            video_path: Path to video file
            position: Position in video (0.0 to 1.0, percentage)

        Returns:
            Hex string of pHash, or None if failed
        """
        if not self.ffmpeg_available:
            logger.error("FFmpeg not available")
            return None

        if not Path(video_path).exists():
            logger.error(f"Video file not found: {video_path}")
            return None

        # Get video duration
        duration = await self._get_duration(video_path)
        if not duration or duration <= 0:
            logger.error(f"Could not get duration for: {video_path}")
            return None

        # Calculate timestamp from position
        timestamp = duration * position

        # Extract frame
        frame_path = await self._extract_frame(video_path, timestamp)
        if not frame_path:
            logger.error(f"Failed to extract frame at {position*100}%")
            return None

        try:
            # Generate pHash
            img = Image.open(frame_path)
            phash = imagehash.phash(img, hash_size=self.hash_size)
            logger.info(f"Generated pHash for frame at {position*100}%: {phash}")
            return str(phash)
        except Exception as e:
            logger.error(f"Failed to generate pHash for frame at {position*100}%: {e}")
            return None
        finally:
            # Cleanup temp file
            try:
                os.unlink(frame_path)
            except:
                pass
