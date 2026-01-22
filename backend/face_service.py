"""
Face Recognition Service using InsightFace (ONNX)

Handles face encoding generation and similarity matching for the face catalog system.
"""

import numpy as np
import cv2
import base64
import time
import secrets
from typing import List, Tuple, Optional, Dict, Any
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import FaceID, FaceEncoding, VideoFace, Actor
import logging

logger = logging.getLogger(__name__)


class FaceService:
    """Service for face recognition using InsightFace with ONNX Runtime"""

    def __init__(self):
        self.app = None
        self._initialized = False

    def initialize(self):
        """Initialize InsightFace model (lazy loading)"""
        if self._initialized:
            return

        try:
            from insightface.app import FaceAnalysis

            logger.info("Initializing InsightFace model...")
            self.app = FaceAnalysis(providers=['CPUExecutionProvider'])
            # Use smaller det_size for better performance with cropped faces
            # det_thresh=0.3 makes detection more lenient (default is 0.5)
            self.app.prepare(ctx_id=0, det_size=(320, 320), det_thresh=0.3)
            self._initialized = True
            logger.info("✓ InsightFace model initialized successfully (det_size=320, det_thresh=0.3)")
        except Exception as e:
            logger.error(f"Failed to initialize InsightFace: {e}")
            raise

    def generate_face_encoding(self, image: np.ndarray) -> Optional[Tuple[np.ndarray, float]]:
        """
        Generate face encoding from image

        Args:
            image: BGR image as numpy array

        Returns:
            Tuple of (encoding as 512-D numpy array, confidence score) or None if no face found
        """
        if not self._initialized:
            self.initialize()

        try:
            logger.info(f"Processing image: {image.shape} (H x W x C), dtype: {image.dtype}")

            # Ensure image is at least 112x112 (InsightFace minimum)
            height, width = image.shape[:2]
            if height < 112 or width < 112:
                # Resize to minimum size while preserving aspect ratio
                scale = max(112 / height, 112 / width)
                new_width = int(width * scale)
                new_height = int(height * scale)
                image = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
                logger.info(f"Resized image to: {image.shape}")

            # Convert BGR to RGB
            rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

            # Detect and encode faces
            faces = self.app.get(rgb_image)

            if not faces:
                logger.warning(f"No face detected in image of size {image.shape}")
                return None

            # Get the first (largest) face
            face = faces[0]
            encoding = face.embedding  # 512-D vector
            confidence = float(face.det_score)  # Detection confidence

            logger.info(f"✓ Generated face encoding with confidence: {confidence:.2f}")
            return encoding, confidence

        except Exception as e:
            logger.error(f"Error generating face encoding: {e}")
            return None

    def calculate_similarity(self, encoding1: np.ndarray, encoding2: np.ndarray) -> float:
        """
        Calculate cosine similarity between two face encodings

        Args:
            encoding1: First 512-D encoding
            encoding2: Second 512-D encoding

        Returns:
            Similarity score (0-1, higher = more similar)
        """
        # Cosine similarity: dot product / (norm1 * norm2)
        similarity = np.dot(encoding1, encoding2) / (
            np.linalg.norm(encoding1) * np.linalg.norm(encoding2)
        )
        return float(similarity)

    def encoding_to_base64(self, encoding: np.ndarray) -> str:
        """Convert numpy encoding to base64 string for database storage"""
        return base64.b64encode(encoding.tobytes()).decode('utf-8')

    def base64_to_encoding(self, base64_str: str) -> np.ndarray:
        """Convert base64 string back to numpy encoding"""
        bytes_data = base64.b64decode(base64_str)
        return np.frombuffer(bytes_data, dtype=np.float32)

    def image_to_base64(self, image: np.ndarray) -> str:
        """Convert image to base64 JPEG string"""
        _, buffer = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 85])
        return base64.b64encode(buffer).decode('utf-8')

    def base64_to_image(self, base64_str: str) -> np.ndarray:
        """Convert base64 string back to image"""
        image_bytes = base64.b64decode(base64_str)
        nparr = np.frombuffer(image_bytes, np.uint8)
        return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

    def calculate_face_quality(self, image: np.ndarray) -> float:
        """
        Calculate face quality score based on sharpness

        Args:
            image: Face crop as numpy array

        Returns:
            Quality score (0-1, higher = better quality)
        """
        try:
            # Convert to grayscale
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

            # Calculate Laplacian variance (sharpness measure)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()

            # Normalize to 0-1 range (empirically, >100 is sharp)
            quality = min(laplacian_var / 200.0, 1.0)

            return float(quality)
        except Exception as e:
            logger.error(f"Error calculating face quality: {e}")
            return 0.5  # Default medium quality

    async def search_similar_faces(
        self,
        encoding: np.ndarray,
        db: AsyncSession,
        threshold: float = 0.4,
        top_k: int = 5,
        exclude_face_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Search for similar faces in the database

        Args:
            encoding: Face encoding to search for
            db: Database session
            threshold: Similarity threshold (0-1, default 0.4)
            top_k: Return top K matches
            exclude_face_id: Optional face ID to exclude from results (for duplicate detection)

        Returns:
            List of matching face_ids with similarity scores
        """
        # Load all face encodings from database
        result = await db.execute(select(FaceEncoding))
        all_encodings = result.scalars().all()

        if not all_encodings:
            logger.info("No face encodings in database")
            return []

        logger.info(f"Searching among {len(all_encodings)} face encodings...")

        # Calculate similarities for ALL encodings
        encoding_matches = []  # Store all encoding matches with details
        face_id_encodings = {}  # Group encodings by face_id

        for stored_encoding in all_encodings:
            try:
                # Skip if this encoding belongs to the excluded face
                if exclude_face_id and stored_encoding.face_id == exclude_face_id:
                    continue
                
                # Decode stored encoding
                stored_vec = self.base64_to_encoding(stored_encoding.encoding)

                # Calculate similarity
                similarity = self.calculate_similarity(encoding, stored_vec)

                # Only keep matches above threshold
                if similarity >= threshold:
                    face_id = stored_encoding.face_id

                    # Store encoding match with all details
                    encoding_match = {
                        'encoding_id': stored_encoding.id,
                        'face_id': face_id,
                        'similarity': similarity,
                        'similarity_percent': round(similarity * 100, 1),
                        'thumbnail': stored_encoding.thumbnail,
                        'confidence': stored_encoding.confidence,
                        'quality_score': stored_encoding.quality_score,
                        'video_id': stored_encoding.video_id,
                        'frame_timestamp': stored_encoding.frame_timestamp
                    }

                    encoding_matches.append(encoding_match)

                    # Group by face_id
                    if face_id not in face_id_encodings:
                        face_id_encodings[face_id] = []
                    face_id_encodings[face_id].append(encoding_match)

            except Exception as e:
                logger.error(f"Error comparing encoding {stored_encoding.id}: {e}")
                continue

        # Build results with all encodings per face
        results = []
        for face_id, encodings in face_id_encodings.items():
            face = await db.get(FaceID, face_id)
            if face:
                # Sort encodings by similarity
                encodings.sort(key=lambda x: -x['similarity'])

                # Calculate best similarity for this face
                best_similarity = encodings[0]['similarity']

                # Get actor name if actor_id is set
                actor_name = None
                if face.actor_id:
                    # Query actor separately to avoid lazy loading issues
                    actor = await db.get(Actor, face.actor_id)
                    if actor:
                        actor_name = actor.name

                results.append({
                    'face_id': face.id,
                    'name': face.name,
                    'similarity': best_similarity,  # Best similarity for sorting
                    'similarity_percent': round(best_similarity * 100, 1),
                    'encoding_count': face.encoding_count,
                    'thumbnail_path': face.thumbnail_path,
                    'actor_id': face.actor_id,
                    'actor_name': actor_name,  # Include actor name in results
                    'matched_encodings': encodings  # All matching encodings with details
                })

        # Sort by best similarity and limit
        results.sort(key=lambda x: -x['similarity'])
        results = results[:top_k]

        total_matches = sum(len(r['matched_encodings']) for r in results)
        logger.info(f"Found {len(results)} matching faces with {total_matches} total encodings above threshold {threshold}")
        return results

    def generate_face_name(self) -> str:
        """Generate a random name for a new face_id"""
        # Generate format: face-abc123
        random_suffix = secrets.token_hex(3)  # 6 hex chars
        return f"face-{random_suffix}"

    async def create_face_id(
        self,
        db: AsyncSession,
        name: Optional[str] = None,
        thumbnail_path: Optional[str] = None,
        actor_id: Optional[int] = None
    ) -> FaceID:
        """
        Create a new face_id entry

        Args:
            db: Database session
            name: Face name (auto-generated if not provided)
            thumbnail_path: Path to face thumbnail
            actor_id: Optional link to actor

        Returns:
            Created FaceID object
        """
        if not name:
            name = self.generate_face_name()

        face = FaceID(
            name=name,
            actor_id=actor_id,
            thumbnail_path=thumbnail_path,
            encoding_count=0,
            created_at=time.time(),
            updated_at=time.time()
        )

        db.add(face)
        await db.commit()
        await db.refresh(face)

        logger.info(f"Created new face_id: {face.id} ({face.name})")
        return face

    async def add_encoding_to_face(
        self,
        db: AsyncSession,
        face_id: int,
        video_id: int,
        frame_timestamp: float,
        encoding: np.ndarray,
        confidence: float,
        thumbnail: Optional[str] = None,
        quality_score: Optional[float] = None
    ) -> Optional[FaceEncoding]:
        """
        Add a new encoding to an existing face_id

        Checks for duplicate encodings (exact match) to prevent storing duplicates.

        Args:
            db: Database session
            face_id: ID of the face
            video_id: ID of the video
            frame_timestamp: Timestamp in video
            encoding: 512-D face encoding
            confidence: Detection confidence
            thumbnail: Base64 face thumbnail
            quality_score: Face quality score

        Returns:
            Created FaceEncoding object, or None if encoding is duplicate
        """
        # Convert encoding to base64
        encoding_b64 = self.encoding_to_base64(encoding)

        # Check for exact duplicate encoding in this face
        result = await db.execute(
            select(FaceEncoding).where(
                (FaceEncoding.face_id == face_id) &
                (FaceEncoding.encoding == encoding_b64)
            )
        )
        existing = result.scalar_one_or_none()

        if existing:
            logger.info(f"Skipped duplicate encoding for face_id {face_id} - exact match already exists")
            return None  # Return None to indicate duplicate was skipped

        # Create encoding entry
        face_encoding = FaceEncoding(
            face_id=face_id,
            video_id=video_id,
            frame_timestamp=frame_timestamp,
            encoding=encoding_b64,
            thumbnail=thumbnail,
            confidence=confidence,
            quality_score=quality_score,
            created_at=time.time()
        )

        db.add(face_encoding)

        # Update face_id encoding count
        face = await db.get(FaceID, face_id)
        if face:
            face.encoding_count += 1
            face.updated_at = time.time()

        await db.commit()
        await db.refresh(face_encoding)

        logger.info(f"Added encoding to face_id {face_id} (video {video_id} @ {frame_timestamp:.1f}s)")
        return face_encoding

    def _load_image_as_frame(self, image_path: str) -> List[Tuple[np.ndarray, float]]:
        """
        Load a static image file or animated GIF/WebP and return as frame tuple(s)

        Handles:
        - Static images (JPG, PNG): Returns 1 frame
        - Animated GIF/WebP: Returns multiple frames with timestamps

        Args:
            image_path: Path to image file (JPG, PNG, GIF, WebP, etc.)

        Returns:
            List of tuples (frame as numpy array, timestamp in seconds)
        """
        try:
            from PIL import Image

            file_ext = Path(image_path).suffix.lower()
            frames = []

            # Try to load as animated image (GIF, WebP)
            if file_ext in {'.gif', '.webp'}:
                try:
                    with Image.open(image_path) as img:
                        # Check if it's animated
                        is_animated = hasattr(img, 'n_frames') and img.n_frames > 1

                        if is_animated:
                            logger.info(f"Loading animated {file_ext}: {img.n_frames} frames")

                            # Extract frames evenly spaced (max 10 frames like videos)
                            frame_indices = []
                            num_frames = min(img.n_frames, 10)
                            step = img.n_frames / num_frames
                            for i in range(num_frames):
                                frame_indices.append(int(i * step))

                            for frame_idx in frame_indices:
                                img.seek(frame_idx)
                                frame = np.array(img.convert('RGB'))
                                # Convert RGB to BGR for OpenCV
                                frame = cv2.cvtColor(frame, cv2.COLOR_RGB2BGR)

                                # Scale if too large
                                height, width = frame.shape[:2]
                                if width > 640:
                                    scale = 640 / width
                                    new_width = int(width * scale)
                                    new_height = int(height * scale)
                                    frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)

                                # Use frame index as pseudo-timestamp
                                timestamp = frame_idx / max(img.n_frames - 1, 1)
                                frames.append((frame, timestamp))

                            logger.info(f"Extracted {len(frames)} frames from animated {file_ext}: {image_path}")
                            return frames
                except Exception as e:
                    logger.warning(f"Could not load {file_ext} as animated: {e}, falling back to static load")

            # Fallback: Load as static image using OpenCV
            frame = cv2.imread(image_path)
            if frame is None:
                logger.warning(f"Failed to read image: {image_path}")
                return []

            # Scale image if it's too large
            height, width = frame.shape[:2]
            if width > 640:
                scale = 640 / width
                new_width = int(width * scale)
                new_height = int(height * scale)
                frame = cv2.resize(frame, (new_width, new_height), interpolation=cv2.INTER_AREA)

            logger.info(f"Loaded static image for face scan: {image_path} ({frame.shape[1]}x{frame.shape[0]})")
            return [(frame, 0.0)]  # Timestamp 0.0 for static image

        except Exception as e:
            logger.error(f"Error loading image {image_path}: {e}")
            return []

    async def extract_frames_from_video(
        self,
        video_path: str,
        num_frames: int = 10,
        video_duration: Optional[float] = None,
        max_duration: Optional[float] = None
    ) -> List[Tuple[np.ndarray, float]]:
        """
        Extract random frames from video at random timestamps

        Args:
            video_path: Path to video file
            num_frames: Number of random frames to extract
            video_duration: Optional video duration in seconds (auto-detected if not provided)
            max_duration: Optional max duration limit (e.g., 3.0 to only scan first 3 seconds)

        Returns:
            List of tuples (frame as numpy array, timestamp in seconds)
        """
        import subprocess
        import json
        import random

        try:
            # Get video duration if not provided
            if video_duration is None:
                result = subprocess.run(
                    ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                     '-of', 'default=noprint_wrappers=1:nokey=1:nokey=1', video_path],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                video_duration = float(result.stdout.strip())

            if video_duration <= 0:
                logger.warning(f"Invalid video duration: {video_duration}")
                return []

            # Limit to max_duration if specified (for fast mode)
            effective_duration = video_duration
            if max_duration and max_duration > 0:
                effective_duration = min(video_duration, max_duration)
                logger.info(f"Fast mode: limiting face scan to first {effective_duration}s (full duration: {video_duration}s)")

            # Generate random timestamps (0.5% to 99.5% of effective duration)
            timestamps = []
            min_gap = max(1.0, effective_duration / (num_frames * 2))  # Minimum gap between frames

            for _ in range(num_frames * 3):  # Try up to 3x to get desired number
                ts = random.uniform(effective_duration * 0.005, effective_duration * 0.995)

                # Check if too close to existing timestamps
                if not any(abs(ts - existing) < min_gap for existing in timestamps):
                    timestamps.append(ts)
                    if len(timestamps) >= num_frames:
                        break

            timestamps.sort()
            logger.info(f"Extracting {len(timestamps)} frames from {video_path}")

            frames = []
            extraction_errors = []

            for ts in timestamps:
                try:
                    # Use ffmpeg to extract frame at specific timestamp
                    result = subprocess.run(
                        ['ffmpeg', '-ss', str(ts), '-i', video_path,
                         '-vf', 'scale=320:-1', '-vframes', '1', '-f', 'rawvideo',
                         '-pix_fmt', 'bgr24', '-'],
                        capture_output=True,
                        timeout=10
                    )

                    if result.returncode != 0:
                        error_msg = result.stderr.decode('utf-8', errors='ignore') if result.stderr else 'Unknown error'
                        extraction_errors.append(f"Frame at {ts:.2f}s: ffmpeg failed (code {result.returncode})")
                        logger.debug(f"ffmpeg error at {ts:.2f}s: {error_msg[:200]}")
                        continue

                    if len(result.stdout) == 0:
                        extraction_errors.append(f"Frame at {ts:.2f}s: no output from ffmpeg")
                        continue

                    # Parse raw BGR24 data
                    # First, get frame dimensions
                    info_result = subprocess.run(
                        ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                         '-show_entries', 'stream=width,height',
                         '-of', 'csv=p=0', video_path],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )

                    if info_result.returncode != 0:
                        extraction_errors.append(f"Frame at {ts:.2f}s: ffprobe failed")
                        logger.debug(f"ffprobe error: {info_result.stderr}")
                        continue

                    width, height = map(int, info_result.stdout.strip().split(','))
                    # Recalculate based on scale filter (preserve aspect ratio)
                    height_scaled = int((height * 320) / width)
                    width_scaled = 320

                    frame_data = np.frombuffer(result.stdout, dtype=np.uint8)
                    actual_size = len(frame_data)
                    bytes_per_pixel = 3

                    # Calculate actual height from data size (more reliable than calculating)
                    if actual_size % (width_scaled * bytes_per_pixel) != 0:
                        extraction_errors.append(f"Frame at {ts:.2f}s: invalid data size {actual_size} (not divisible by {width_scaled * bytes_per_pixel})")
                        logger.debug(f"Frame data invalid at {ts:.2f}s: size {actual_size} not divisible by {width_scaled * bytes_per_pixel}")
                        continue

                    actual_height = actual_size // (width_scaled * bytes_per_pixel)

                    # Allow ±2 rows tolerance for rounding differences
                    if abs(actual_height - height_scaled) > 2:
                        extraction_errors.append(f"Frame at {ts:.2f}s: height mismatch (expected ~{height_scaled}, got {actual_height})")
                        logger.debug(f"Frame height mismatch at {ts:.2f}s: expected ~{height_scaled}, got {actual_height}, size: {actual_size}")
                        continue

                    frame = frame_data.reshape((actual_height, width_scaled, 3))
                    frames.append((frame, ts))
                    logger.debug(f"✓ Extracted frame at {ts:.2f}s: {frame.shape}")

                except Exception as e:
                    extraction_errors.append(f"Frame at {ts:.2f}s: {str(e)}")
                    logger.warning(f"Failed to extract frame at {ts:.2f}s: {e}")
                    continue

            if frames:
                logger.info(f"✓ Successfully extracted {len(frames)}/{len(timestamps)} frames from {video_path}")
            else:
                logger.error(f"✗ Failed to extract ANY frames! Errors: {extraction_errors[:3]}")

            return frames

        except Exception as e:
            logger.error(f"Error extracting frames from {video_path}: {e}")
            return []

    async def detect_faces_for_review(
        self,
        db: AsyncSession,
        video_id: int,
        video_path: str,
        num_frames: int = 10,
        video_duration: Optional[float] = None,
        max_duration: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Detect faces in a video and return them for user review (without storing)

        Args:
            db: Database session
            video_id: Video ID being scanned
            video_path: Path to video file
            num_frames: Number of random frames to extract
            video_duration: Optional video duration
            max_duration: Optional max duration limit (e.g., 3.0 for fast mode on first 3 seconds)

        Returns:
            Dictionary with detected faces and metadata for review
        """
        if not self._initialized:
            self.initialize()

        # Extract frames (with optional max_duration for fast mode)
        frames = await self.extract_frames_from_video(video_path, num_frames, video_duration, max_duration)

        if not frames:
            logger.warning(f"No frames extracted for face detection on video {video_id}")
            return {
                'status': 'failed',
                'detected_faces': [],
                'message': 'Failed to extract frames from video'
            }

        detected_faces = []

        # Process each frame for faces
        for frame, timestamp in frames:
            try:
                # Convert BGR to RGB for InsightFace
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Detect faces in frame
                faces = self.app.get(rgb_frame)

                for face_obj in faces:
                    try:
                        encoding = face_obj.embedding
                        confidence = float(face_obj.det_score)

                        # Extract face crop for thumbnail
                        bbox = face_obj.bbox.astype(int)
                        x1, y1, x2, y2 = bbox
                        face_crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]

                        if face_crop.size > 0:
                            _, buffer = cv2.imencode('.jpg', face_crop)
                            thumbnail_b64 = base64.b64encode(buffer).decode('utf-8')
                        else:
                            thumbnail_b64 = None

                        # Search for similar faces (match detection) - 80% threshold
                        matches = await self.search_similar_faces(encoding, db, threshold=0.8, top_k=1)

                        match_info = None
                        if matches and len(matches) > 0:
                            matched_face = matches[0]
                            match_info = {
                                'face_id': matched_face['face_id'],
                                'name': matched_face['name'],
                                'similarity': matched_face['similarity'],
                                'similarity_percent': matched_face['similarity_percent']
                            }

                        detected_faces.append({
                            'timestamp': timestamp,
                            'confidence': confidence,
                            'thumbnail': thumbnail_b64,
                            'encoding': self.encoding_to_base64(encoding),
                            'matched_face': match_info,
                            'is_match': match_info is not None
                        })

                    except Exception as e:
                        logger.warning(f"Error processing detected face at {timestamp:.2f}s: {e}")
                        continue

            except Exception as e:
                logger.warning(f"Error detecting faces in frame at {timestamp:.2f}s: {e}")
                continue

        logger.info(f"Face detection complete: {len(detected_faces)} faces detected in {len(frames)} frames")

        return {
            'status': 'completed',
            'detected_faces': detected_faces,
            'frames_scanned': len(frames),
            'faces_with_matches': sum(1 for f in detected_faces if f['is_match']),
            'faces_new': sum(1 for f in detected_faces if not f['is_match']),
            'message': f"Detected {len(detected_faces)} faces"
        }

    async def auto_scan_faces(
        self,
        db: AsyncSession,
        video_id: int,
        video_path: str,
        num_frames: int = 10,
        video_duration: Optional[float] = None,
        max_duration: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Auto-scan video/image for faces - batch search with intelligent grouping

        For images (JPG, PNG, etc.), scans the image directly.
        For videos (MP4, GIF, WebP, etc.), extracts frames.

        Instead of searching each face individually, all extracted faces are:
        1. Batch searched for matches in the database
        2. Grouped by matched Face_ID (if found)
        3. All faces in a group assigned to the highest-similarity match
        4. Unmatched faces create a single new Face_ID

        Args:
            db: Database session
            video_id: Video ID to scan
            video_path: Path to video/image file
            num_frames: Number of random frames to extract (ignored for static images)
            video_duration: Optional video duration
            max_duration: Optional max duration limit (e.g., 3.0 for fast mode on first 3 seconds)

        Returns:
            Dictionary with scan results (detected_count, linked_count, face_ids, etc.)
        """
        if not self._initialized:
            self.initialize()

        # Check if it's a static image (JPG, PNG, etc.)
        image_extensions = {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}
        file_ext = Path(video_path).suffix.lower()
        is_static_image = file_ext in image_extensions

        if is_static_image:
            # For static images, load the image directly
            frames = self._load_image_as_frame(video_path)
        else:
            # For videos/GIFs, extract frames (with optional max_duration for fast mode)
            frames = await self.extract_frames_from_video(video_path, num_frames, video_duration, max_duration)

        if not frames:
            logger.warning(f"No frames extracted for auto-scan on {video_id}")
            return {
                'status': 'failed',
                'detected_count': 0,
                'linked_count': 0,
                'face_ids': [],
                'message': 'Failed to extract frames from file'
            }

        all_detected_faces = []  # All extracted faces with data

        # Process each frame for faces - extract all face data first
        for frame, timestamp in frames:
            try:
                # Convert BGR to RGB for InsightFace
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                # Detect faces in frame
                faces = self.app.get(rgb_frame)

                for face_obj in faces:
                    try:
                        encoding = face_obj.embedding
                        confidence = float(face_obj.det_score)

                        # Extract face crop for thumbnail
                        bbox = face_obj.bbox.astype(int)
                        x1, y1, x2, y2 = bbox
                        face_crop = frame[max(0, y1):min(frame.shape[0], y2), max(0, x1):min(frame.shape[1], x2)]

                        if face_crop.size > 0:
                            _, buffer = cv2.imencode('.jpg', face_crop)
                            thumbnail_b64 = base64.b64encode(buffer).decode('utf-8')
                        else:
                            thumbnail_b64 = None

                        all_detected_faces.append({
                            'timestamp': timestamp,
                            'confidence': confidence,
                            'encoding': encoding,
                            'thumbnail_b64': thumbnail_b64,
                            'matched_face_id': None,
                            'match_similarity': 0.0
                        })

                    except Exception as e:
                        logger.warning(f"Error processing detected face at {timestamp:.2f}s: {e}")
                        continue

            except Exception as e:
                logger.warning(f"Error detecting faces in frame at {timestamp:.2f}s: {e}")
                continue

        if not all_detected_faces:
            logger.info(f"No faces detected during auto-scan for video {video_id}")
            return {
                'status': 'completed',
                'detected_count': 0,
                'new_faces_count': 0,
                'linked_faces_count': 0,
                'unique_faces': 0,
                'face_ids': [],
                'detections': []
            }

        # BATCH SEARCH PHASE: Search all detected faces in database
        logger.info(f"Batch searching {len(all_detected_faces)} detected faces for matches...")
        
        for face_data in all_detected_faces:
            try:
                # Search for similar faces - 80%+ similarity threshold for auto-linking
                matches = await self.search_similar_faces(
                    face_data['encoding'], db, threshold=0.8, top_k=1
                )

                if matches and len(matches) > 0:
                    # Found a match - record it
                    best_match = matches[0]
                    face_data['matched_face_id'] = best_match['face_id']
                    face_data['match_similarity'] = best_match.get('similarity', 0.8)
                    logger.debug(f"Face matched to existing face_id {best_match['face_id']} "
                               f"with similarity {best_match.get('similarity', 0.8):.2%}")
                else:
                    logger.debug("Face has no matches - will create new Face_ID")

            except Exception as e:
                logger.warning(f"Error searching for face match: {e}")
                # Continue without match

        # GROUPING PHASE: Group extracted faces by matched Face_ID
        # Faces with matches group together; unmatched faces become one new group
        face_groups = {}  # face_id -> [face_data1, face_data2, ...]
        unmatched_faces = []

        for face_data in all_detected_faces:
            if face_data['matched_face_id'] is not None:
                face_id = face_data['matched_face_id']
                if face_id not in face_groups:
                    face_groups[face_id] = []
                face_groups[face_id].append(face_data)
            else:
                unmatched_faces.append(face_data)

        # ASSIGNMENT PHASE: Add all faces in each group to the matched Face_ID
        face_ids_created = set()
        face_ids_linked = set()
        detected_faces_result = []

        # Process groups with matches (all faces in group → existing Face_ID)
        for face_id, faces_in_group in face_groups.items():
            for face_data in faces_in_group:
                try:
                    await self.add_encoding_to_face(
                        db, face_id, video_id, face_data['timestamp'],
                        face_data['encoding'], face_data['confidence'], 
                        face_data['thumbnail_b64']
                    )
                    face_ids_linked.add(face_id)
                    detected_faces_result.append({
                        'timestamp': face_data['timestamp'],
                        'confidence': face_data['confidence'],
                        'face_id': face_id,
                        'is_new': False
                    })
                except Exception as e:
                    logger.warning(f"Error adding encoding to face {face_id}: {e}")

            logger.info(f"Added {len(faces_in_group)} faces to existing Face_ID {face_id}")

        # Process unmatched faces (create single new Face_ID for entire group)
        if unmatched_faces:
            try:
                new_face = await self.create_face_id(db)
                new_face_id = new_face.id
                face_ids_created.add(new_face_id)

                for face_data in unmatched_faces:
                    try:
                        await self.add_encoding_to_face(
                            db, new_face_id, video_id, face_data['timestamp'],
                            face_data['encoding'], face_data['confidence'],
                            face_data['thumbnail_b64']
                        )
                        detected_faces_result.append({
                            'timestamp': face_data['timestamp'],
                            'confidence': face_data['confidence'],
                            'face_id': new_face_id,
                            'is_new': True
                        })
                    except Exception as e:
                        logger.warning(f"Error adding encoding to new face {new_face_id}: {e}")

                logger.info(f"Created new Face_ID {new_face_id} for {len(unmatched_faces)} unmatched faces")

            except Exception as e:
                logger.error(f"Error creating new face for unmatched detections: {e}")

        # Create VideoFace relationships for all unique faces
        unique_face_ids = face_ids_created | face_ids_linked
        video_faces_created = 0

        for face_id in unique_face_ids:
            try:
                # Check if relationship already exists
                existing_result = await db.execute(
                    select(VideoFace).where(
                        (VideoFace.video_id == video_id) & (VideoFace.face_id == face_id)
                    )
                )
                existing = existing_result.scalar_one_or_none()

                if not existing:
                    # Create new VideoFace relationship
                    video_face = VideoFace(
                        video_id=video_id,
                        face_id=face_id,
                        detection_method='auto_scan',
                        appearance_count=1
                    )
                    db.add(video_face)
                    video_faces_created += 1
                    logger.debug(f"Created VideoFace relationship: video {video_id} -> face {face_id}")
                else:
                    # Update existing relationship
                    existing.appearance_count += 1
                    logger.debug(f"Updated VideoFace relationship: video {video_id} -> face {face_id}")

            except Exception as e:
                logger.error(f"Error creating VideoFace relationship for face {face_id}: {e}")

        await db.commit()

        logger.info(f"Auto-scan complete: {len(all_detected_faces)} faces detected, "
                   f"{len(face_ids_created)} new Face_IDs created, "
                   f"{len(face_ids_linked)} existing Face_IDs linked, "
                   f"{len(unique_face_ids)} total unique Face_IDs")

        return {
            'status': 'completed',
            'detected_count': len(all_detected_faces),
            'new_faces_count': len(face_ids_created),
            'linked_faces_count': len(face_ids_linked),
            'unique_faces': len(unique_face_ids),
            'face_ids': list(unique_face_ids),
            'detections': detected_faces_result
        }

    async def delete_encoding_from_face(
        self,
        db: AsyncSession,
        face_id: int,
        encoding_id: int
    ) -> Dict[str, Any]:
        """
        Delete a single encoding from a face ID.
        Keeps face mapped to videos but remaps to best available encoding.
        If no other encodings exist, keeps VideoFace mapping but marks as "no embeddings available".

        Args:
            db: Database session
            face_id: ID of the face
            encoding_id: ID of the encoding to delete

        Returns:
            Dict with result (encoding_deleted or remapped)
        """
        try:
            # Get the encoding
            encoding = await db.get(FaceEncoding, encoding_id)
            if not encoding:
                raise ValueError(f"Encoding {encoding_id} not found")

            # Verify it belongs to the specified face
            if encoding.face_id != face_id:
                raise ValueError(f"Encoding {encoding_id} does not belong to face {face_id}")

            # Get the face
            face = await db.get(FaceID, face_id)
            if not face:
                raise ValueError(f"Face {face_id} not found")

            # Check if this was the primary encoding
            was_primary = face.primary_encoding_id == encoding_id

            # Delete the encoding
            await db.delete(encoding)
            face.encoding_count -= 1
            face.updated_at = time.time()

            # Find remaining encodings for this face
            result = await db.execute(
                select(FaceEncoding).where(FaceEncoding.face_id == face_id).order_by(
                    FaceEncoding.quality_score.desc(),
                    FaceEncoding.confidence.desc()
                )
            )
            remaining_encodings = result.scalars().all()

            # If this is the last encoding, keep VideoFace mappings but set primary to None
            if face.encoding_count == 0:
                face.primary_encoding_id = None
                await db.commit()
                logger.info(f"Deleted last encoding {encoding_id} from face {face_id}. Face kept for video mappings.")
                return {
                    "success": True,
                    "action": "encoding_deleted",
                    "face_id": face_id,
                    "encoding_id": encoding_id,
                    "remaining_encodings": 0,
                    "new_primary_encoding_id": None,
                    "message": f"Deleted encoding. Face {face_id} has no embeddings but is still mapped to videos."
                }

            # If deleted encoding was primary, select highest quality remaining encoding
            if was_primary:
                if remaining_encodings:
                    new_primary = remaining_encodings[0]
                    face.primary_encoding_id = new_primary.id
                    logger.info(f"Auto-selected encoding {new_primary.id} as primary for face {face_id}")
                else:
                    face.primary_encoding_id = None

            await db.commit()
            logger.info(f"Deleted encoding {encoding_id} from face {face_id}. Remaining: {face.encoding_count}")

            return {
                "success": True,
                "action": "encoding_deleted",
                "face_id": face_id,
                "encoding_id": encoding_id,
                "remaining_encodings": face.encoding_count,
                "new_primary_encoding_id": face.primary_encoding_id,
                "message": f"Deleted encoding. Face {face_id} now has {face.encoding_count} encodings"
            }

        except Exception as e:
            await db.rollback()
            logger.error(f"Error deleting encoding {encoding_id} from face {face_id}: {e}")
            raise


# Global singleton instance
face_service = FaceService()
