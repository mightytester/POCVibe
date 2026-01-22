from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.orm import selectinload
from database import Video, Tag, Actor, Category
from typing import List, Optional, Dict, Any
from pathlib import Path
import os
import asyncio
import json
class VideoService:
    def __init__(self, db: AsyncSession, thumbnail_db=None):
        self.db = db
        self.thumbnail_db = thumbnail_db

    async def extract_video_metadata(self, video_path: Path) -> Optional[Dict[str, Any]]:
        """Extract video metadata using ffprobe (duration, resolution, codec, bitrate, fps)"""
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', str(video_path)
            ]

            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                print(f"⚠️ ffprobe failed for {video_path}: {stderr.decode()}")
                return None

            data = json.loads(stdout.decode())

            # Find video stream
            video_stream = next(
                (s for s in data.get('streams', []) if s.get('codec_type') == 'video'),
                None
            )

            if not video_stream:
                print(f"⚠️ No video stream found in {video_path}")
                return None

            # Extract metadata
            metadata = {
                'duration': float(data.get('format', {}).get('duration', 0)),
                'width': video_stream.get('width'),
                'height': video_stream.get('height'),
                'codec': video_stream.get('codec_name'),
                'bitrate': int(data.get('format', {}).get('bit_rate', 0)),
            }

            # Calculate FPS from r_frame_rate or avg_frame_rate
            fps_str = video_stream.get('r_frame_rate') or video_stream.get('avg_frame_rate')
            if fps_str and '/' in fps_str:
                num, den = fps_str.split('/')
                metadata['fps'] = float(num) / float(den) if float(den) != 0 else 0
            else:
                metadata['fps'] = None

            return metadata

        except FileNotFoundError:
            print("⚠️ ffprobe not found. Install ffmpeg to extract video metadata.")
            return None
        except Exception as e:
            print(f"⚠️ Error extracting metadata from {video_path}: {e}")
            return None

    async def sync_video_to_db(self, video_info: Dict[str, Any], skip_generation: bool = False) -> Video:
        """Sync a video/image file to the database

        Args:
            video_info: Media metadata from filesystem scan (includes media_type)
            skip_generation: If True, skip thumbnail generation and metadata extraction (fast rescan mode)
        """
        # Check if video already exists
        result = await self.db.execute(
            select(Video).where(Video.path == video_info['path'])
        )
        video = result.scalar_one_or_none()
        
        # Get media type - ✅ NEW
        media_type = video_info.get('media_type', 'video')

        if video:
            # Update existing video
            video.name = video_info['name']
            video.size = video_info['size']
            video.modified = video_info['modified']
            video.extension = video_info['extension']
            video.category = video_info.get('category', '_root')
            video.subcategory = video_info.get('subcategory')
            video.relative_path = video_info.get('relative_path')
            video.media_type = media_type  # ✅ NEW
        else:
            # Create new video
            # Set display_name to filename without extension by default
            name_without_ext = Path(video_info['name']).stem
            video = Video(
                path=video_info['path'],
                name=video_info['name'],
                display_name=name_without_ext,
                description='',
                size=video_info['size'],
                modified=video_info['modified'],
                extension=video_info['extension'],
                category=video_info.get('category', '_root'),
                subcategory=video_info.get('subcategory'),
                relative_path=video_info.get('relative_path'),
                media_type=media_type  # ✅ NEW
            )
            self.db.add(video)

        # Commit first to get the video ID
        await self.db.commit()

        # ALWAYS set thumbnail URL, even in skip_generation mode
        # This is critical for the UI to know thumbnails are available
        if not video.thumbnail_url and video.id:
            video.thumbnail_url = f"/api/thumbnails/{video.id}"
            await self.db.commit()

        # Extract metadata ONLY for videos - ✅ UPDATED
        if not skip_generation and media_type == 'video' and video.duration is None:
            try:
                metadata = await self.extract_video_metadata(Path(video.path))
                if metadata:
                    video.duration = metadata.get('duration')
                    video.width = metadata.get('width')
                    video.height = metadata.get('height')
                    video.codec = metadata.get('codec')
                    video.bitrate = metadata.get('bitrate')
                    video.fps = metadata.get('fps')
                    print(f"✅ Extracted metadata for {video.name}: {video.width}x{video.height}, {video.duration:.1f}s")
            except Exception as e:
                print(f"⚠️ Failed to extract metadata for {video.name}: {e}")
        
        # Extract image dimensions for images - ✅ NEW
        if not skip_generation and media_type == 'image' and video.width is None:
            try:
                import cv2
                img = cv2.imread(video.path)
                if img is not None:
                    height, width = img.shape[:2]
                    video.width = width
                    video.height = height
                    print(f"✅ Extracted dimensions for {video.name}: {width}x{height}")
            except Exception as e:
                print(f"⚠️ Failed to extract image dimensions for {video.name}: {e}")

        # Generate thumbnail during scan if not already generated
        # Skip in fast_mode to avoid expensive ffmpeg operations
        if not skip_generation and not video.thumbnail_generated and self.thumbnail_db and video.id:
            # Set thumbnail URL immediately
            video.thumbnail_url = f"/api/thumbnails/{video.id}"

            # Try to generate thumbnail during scan for immediate availability
            try:
                # ✅ UPDATED: Handle images differently
                if media_type == 'image':
                    success = await self.thumbnail_db.store_image_thumbnail(video.path)
                else:
                    success = await self.thumbnail_db.generate_and_store_thumbnail(video.path)
                
                if success:
                    video.thumbnail_generated = 1  # Mark as generated
                    print(f"✅ Generated thumbnail for {video.name}")
                else:
                    video.thumbnail_generated = -1  # Mark as failed
                    print(f"❌ Failed to generate thumbnail for {video.name}")
            except Exception as e:
                video.thumbnail_generated = -1  # Mark as failed
                print(f"❌ Thumbnail error for {video.name}: {e}")

            await self.db.commit()  # Commit the thumbnail status update

        return video
    
    async def get_video_by_path(self, path: str) -> Optional[Video]:
        """Get video by file path"""
        result = await self.db.execute(
            select(Video).options(selectinload(Video.tags), selectinload(Video.actors)).where(Video.path == path)
        )
        return result.scalar_one_or_none()
    
    async def get_videos_by_category(self, category: str, media_type: str = None) -> List[Video]:
        """Get all videos in a category
        
        Args:
            category: Category name
            media_type: Filter by media type - 'video', 'image', or None for all
        """
        stmt = select(Video).options(selectinload(Video.tags), selectinload(Video.actors)).where(Video.category == category)
        if media_type:
            stmt = stmt.where(Video.media_type == media_type)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_videos_by_subcategory(self, category: str, subcategory: str = None, media_type: str = None) -> List[Video]:
        """Get videos by category and optional subcategory
        
        Args:
            category: Category name
            subcategory: Optional subcategory filter
            media_type: Filter by media type - 'video', 'image', or None for all
        """
        if subcategory:
            stmt = select(Video).options(selectinload(Video.tags), selectinload(Video.actors))\
                .where(and_(Video.category == category, Video.subcategory == subcategory))
        else:
            stmt = select(Video).options(selectinload(Video.tags), selectinload(Video.actors))\
                .where(and_(Video.category == category, Video.subcategory.is_(None)))
        
        if media_type:
            stmt = stmt.where(Video.media_type == media_type)
        
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def get_folder_structure(self, category: str = None) -> Dict[str, Any]:
        """Get hierarchical folder structure"""
        if category:
            result = await self.db.execute(
                select(Video).where(Video.category == category)
            )
        else:
            result = await self.db.execute(select(Video))
        
        videos = result.scalars().all()
        structure = {}
        
        for video in videos:
            cat = video.category or '_root'
            if cat not in structure:
                structure[cat] = {'subfolders': {}, 'video_count': 0, 'path': video.path.rsplit(os.path.sep, 1)[0] if video.path else None}
            
            if video.subcategory:
                # Handle nested subcategories
                subcat_parts = video.subcategory.split(os.path.sep)
                current_level = structure[cat]['subfolders']
                folder_path = str(Path(video.path).parent)  # Get parent directory
                
                # Navigate/create nested structure
                for i, part in enumerate(subcat_parts):
                    if part not in current_level:
                        current_level[part] = {'subfolders': {}, 'video_count': 0, 'path': folder_path}
                    
                    # If this is the final part, increment video count
                    if i == len(subcat_parts) - 1:
                        current_level[part]['video_count'] += 1
                    else:
                        # Move to next level
                        current_level = current_level[part]['subfolders']
            else:
                structure[cat]['video_count'] += 1
        
        return structure
    
    async def get_all_videos(self, exclude_deleted: bool = True, media_type: str = None) -> List[Video]:
        """Get all videos from all categories

        Args:
            exclude_deleted: If True, exclude videos in DELETE category (default: True)
            media_type: Filter by media type - 'video', 'image', or None for all
        """
        stmt = select(Video).options(selectinload(Video.tags), selectinload(Video.actors))

        # Exclude DELETE category from collection view by default
        if exclude_deleted:
            stmt = stmt.where(Video.category != "DELETE")
        
        # Filter by media_type if specified
        if media_type:
            stmt = stmt.where(Video.media_type == media_type)

        result = await self.db.execute(stmt)
        videos = result.scalars().all()
        
        # Update thumbnail URLs for videos that don't have them yet
        for video in videos:
            if not video.thumbnail_url and self.thumbnail_db and video.id:
                # Set database-based thumbnail URL
                video.thumbnail_url = f"/api/thumbnails/{video.id}"
                video.thumbnail_generated = 0  # Mark as pending
        
        await self.db.commit()
        return videos
    
    async def add_tag_to_video(self, video_id: int, tag_name: str) -> Tag:
        """Add a tag to a video"""
        # Get or create tag
        tag = await self.get_or_create_tag(tag_name)

        # Get video
        result = await self.db.execute(
            select(Video).options(selectinload(Video.tags), selectinload(Video.actors)).where(Video.id == video_id)
        )
        video = result.scalar_one_or_none()

        if video and tag not in video.tags:
            video.tags.append(tag)
            await self.db.commit()

        return tag
    
    async def remove_tag_from_video(self, video_id: int, tag_id: int):
        """Remove a tag from a video"""
        result = await self.db.execute(
            select(Video).options(selectinload(Video.tags), selectinload(Video.actors)).where(Video.id == video_id)
        )
        video = result.scalar_one_or_none()

        if video:
            video.tags = [tag for tag in video.tags if tag.id != tag_id]
            await self.db.commit()
    
    async def get_or_create_tag(self, tag_name: str, color: str = None) -> Tag:
        """Get existing tag or create new one with auto-generated color"""
        result = await self.db.execute(
            select(Tag).where(Tag.name == tag_name.lower())
        )
        tag = result.scalar_one_or_none()

        if not tag:
            # Auto-generate color from tag name if not provided
            if color is None:
                from color_utils import generate_vibrant_color
                color = generate_vibrant_color(tag_name)

            tag = Tag(name=tag_name.lower(), color=color)
            self.db.add(tag)
            await self.db.commit()

        return tag
    
    async def get_all_tags(self) -> List[Tag]:
        """Get all tags"""
        result = await self.db.execute(select(Tag))
        return result.scalars().all()

    async def delete_tag(self, tag_id: int) -> bool:
        """Delete a tag completely (removes from all videos)

        Returns:
            True if tag was deleted, False if tag not found
        """
        result = await self.db.execute(select(Tag).where(Tag.id == tag_id))
        tag = result.scalar_one_or_none()

        if not tag:
            return False

        await self.db.delete(tag)
        await self.db.commit()
        return True

    async def rename_tag(self, tag_id: int, new_name: str) -> Tag:
        """Rename a tag (affects all videos with this tag)

        Args:
            tag_id: ID of tag to rename
            new_name: New name for the tag

        Returns:
            Updated tag object

        Raises:
            ValueError: If tag not found or new name already exists
        """
        # Check if tag exists
        result = await self.db.execute(select(Tag).where(Tag.id == tag_id))
        tag = result.scalar_one_or_none()

        if not tag:
            raise ValueError("Tag not found")

        # Check if new name already exists (and it's not the same tag)
        new_name_lower = new_name.lower()
        result = await self.db.execute(select(Tag).where(Tag.name == new_name_lower))
        existing_tag = result.scalar_one_or_none()

        if existing_tag and existing_tag.id != tag_id:
            raise ValueError(f"Tag '{new_name}' already exists")

        # Update the tag name
        tag.name = new_name_lower
        await self.db.commit()

        return tag

    async def get_unused_tags(self) -> List[Tag]:
        """Get all tags that are not assigned to any videos

        Returns:
            List of unused tags
        """
        # Get all tags with their video count
        from sqlalchemy import func, select as sa_select

        stmt = sa_select(Tag).outerjoin(Tag.videos).group_by(Tag.id).having(func.count(Video.id) == 0)
        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def delete_unused_tags(self) -> int:
        """Delete all tags that are not assigned to any videos

        Returns:
            Number of tags deleted
        """
        unused_tags = await self.get_unused_tags()
        count = len(unused_tags)

        for tag in unused_tags:
            await self.db.delete(tag)

        if count > 0:
            await self.db.commit()

        return count

    async def search_videos(self, query: str = "", tags: List[str] = [], category: str = "", subcategory: str = "", duration_min: int = None, duration_max: int = None, exclude_deleted: bool = True) -> List[Video]:
        """Search videos by name, display_name, description, series, episode, year, channel, tags, actors, category, subcategory, or duration

        Args:
            query: Search query string (searches across multiple fields)
            tags: List of tag names to filter by (AND logic - all must match)
            category: Category to filter by
            subcategory: Subcategory to filter by
            duration_min: Minimum duration in seconds
            duration_max: Maximum duration in seconds
            exclude_deleted: If True, exclude videos in DELETE category (default: True)

        Returns:
            List of matching Video objects with tags and actors loaded
        """
        stmt = select(Video).options(selectinload(Video.tags), selectinload(Video.actors))

        conditions = []

        # Always exclude DELETE category from search unless explicitly searching for it
        if exclude_deleted and category != "DELETE":
            conditions.append(Video.category != "DELETE")
        
        # Duration range filter
        if duration_min is not None:
            conditions.append(Video.duration >= duration_min)
        if duration_max is not None:
            conditions.append(Video.duration <= duration_max)

        if query:
            # Search in video name, display_name, description, tag names, actor names, AND enhanced metadata fields
            name_condition = Video.name.ilike(f"%{query}%")
            display_name_condition = Video.display_name.ilike(f"%{query}%")
            description_condition = Video.description.ilike(f"%{query}%")

            # Enhanced metadata fields
            series_condition = Video.series.ilike(f"%{query}%")
            episode_condition = Video.episode.ilike(f"%{query}%")
            channel_condition = Video.channel.ilike(f"%{query}%")

            # Year search (exact match or starts with for partial year search like "202")
            year_condition = None
            if query.isdigit():
                # If query is numeric, search year field
                year_condition = Video.year == int(query)

            # Create subquery for videos that have tags matching the search query
            tag_subquery = select(Video.id).join(Video.tags).where(Tag.name.ilike(f"%{query.lower()}%"))
            # Create subquery for videos that have actors matching the search query
            actor_subquery = select(Video.id).join(Video.actors).where(Actor.name.ilike(f"%{query}%"))

            # Combine all conditions with OR
            search_conditions = [
                name_condition,
                display_name_condition,
                description_condition,
                series_condition,
                episode_condition,
                channel_condition,
                Video.id.in_(tag_subquery),
                Video.id.in_(actor_subquery)
            ]

            if year_condition is not None:
                search_conditions.append(year_condition)

            query_condition = or_(*search_conditions)
            conditions.append(query_condition)

        if category and category != "_all":
            conditions.append(Video.category == category)

        if subcategory:
            conditions.append(Video.subcategory == subcategory)

        if tags:
            # For ALL tags intersection: sequential joins then distinct to avoid duplicates
            for idx, tag_name in enumerate(tags):
                alias_join = Video.tags  # using relationship join repeatedly
                stmt = stmt.join(alias_join).where(Tag.name == tag_name.lower())
            stmt = stmt.distinct()

        if conditions:
            stmt = stmt.where(and_(*conditions))

        result = await self.db.execute(stmt)
        return result.scalars().all()

    async def move_video(self, video_id: int, target_category: str, root_directory: Path, target_subcategory: str = None, new_name: Optional[str] = None) -> Optional[Video]:
        """Move a video file to another category/subcategory and update DB.

        Rules:
        - target_category == "_root" places the file directly under root_directory.
        - target_subcategory creates subfolder structure within category.
        - If target directory doesn't exist it is created (except for "_root").
        - new_name (if provided) must retain original extension unless explicitly includes another extension.
        - Fails if destination already exists.
        - If filesystem move succeeds but DB update fails, tries to rollback the move.
        """
        # Load video with tags and actors
        result = await self.db.execute(
            select(Video).options(selectinload(Video.tags), selectinload(Video.actors)).where(Video.id == video_id)
        )
        video: Video = result.scalar_one_or_none()
        if not video:
            return None

        original_path = Path(video.path)
        if not original_path.exists():
            # File missing - treat as not movable
            return None

        # Determine destination directory
        if target_category == "_root":
            dest_dir = root_directory
        else:
            # Sanitize category name (basic): no path separators
            if os.path.sep in target_category or target_category.strip() == "":
                raise ValueError("Invalid target category")
            dest_dir = root_directory / target_category
            
            # Add subcategory if specified
            if target_subcategory:
                # Clean and validate subcategory path
                target_subcategory = target_subcategory.strip()
                if not target_subcategory or target_subcategory in [".", ".."]:
                    raise ValueError("Invalid subcategory")
                
                # Remove leading/trailing path separators and normalize
                subcategory_parts = [part.strip() for part in target_subcategory.split(os.path.sep) if part.strip()]
                if not subcategory_parts or any(part in [".", ".."] for part in subcategory_parts):
                    raise ValueError("Invalid subcategory")
                
                # Build nested path
                for part in subcategory_parts:
                    dest_dir = dest_dir / part
            
            dest_dir.mkdir(parents=True, exist_ok=True)

        # Determine destination filename
        orig_ext = original_path.suffix
        if new_name:
            # If new_name has no extension, keep original
            if not Path(new_name).suffix:
                new_name = new_name + orig_ext
        else:
            new_name = original_path.name

        destination = dest_dir / new_name
        if destination.exists():
            raise FileExistsError("Destination file already exists")

        # Perform move
        destination_parent = destination.parent
        destination_parent.mkdir(parents=True, exist_ok=True)
        original_parent = original_path.parent
        try:
            original_path.rename(destination)
        except Exception as e:
            raise RuntimeError(f"Filesystem move failed: {e}")

        # Update DB metadata
        try:
            stat = destination.stat()

            # Update thumbnail hash before updating video path
            if self.thumbnail_db:
                await self.thumbnail_db.update_path_hash(str(original_path), str(destination))

            video.path = str(destination)
            video.name = destination.name
            video.category = target_category
            video.subcategory = target_subcategory

            # Calculate relative path from root directory
            try:
                full_relative_path = destination.relative_to(root_directory)
                # Get the path relative to the category directory (not the root directory)
                category_relative_path = destination.relative_to(root_directory / video.category)
                video.relative_path = str(category_relative_path)
            except ValueError:
                # Fallback to just the filename
                video.relative_path = destination.name

            video.size = stat.st_size
            video.modified = stat.st_mtime
            # extension stays consistent with filename
            video.extension = destination.suffix.lower()
            await self.db.commit()
        except Exception as e:
            # Rollback DB and attempt to revert filesystem move
            await self.db.rollback()
            try:
                destination.rename(original_path)
            except Exception:
                pass  # At this point we log in real-world scenario
            raise RuntimeError(f"Database update failed after move: {e}")

        return video

    async def prune_missing_files(self) -> int:
        """Delete DB video rows whose files no longer exist. Returns count removed."""
        result = await self.db.execute(select(Video))
        videos = result.scalars().all()
        removed = 0
        for video in videos:
            if not Path(video.path).exists():
                await self.db.delete(video)
                removed += 1
        if removed:
            await self.db.commit()
        return removed

    async def get_faces_for_videos(self, video_ids: List[int]) -> Dict[int, List[Dict[str, Any]]]:
        """Get faces for multiple videos efficiently (batched query)

        Returns a dict mapping video_id -> list of face dicts with fallback embeddings
        """
        from database import VideoFace, FaceID, FaceEncoding
        from sqlalchemy import select, and_

        if not video_ids:
            return {}

        # Batch query all video_faces relationships for these videos
        video_faces_result = await self.db.execute(
            select(VideoFace, FaceID)
            .join(FaceID, VideoFace.face_id == FaceID.id)
            .where(VideoFace.video_id.in_(video_ids))
        )

        video_faces = video_faces_result.all()

        # Get best thumbnails for all faces (batch query)
        face_ids = list(set(vf.face_id for vf, _ in video_faces))
        if face_ids:
            # Get best encoding for each face from ANY video (for primary thumbnail)
            best_encodings_result = await self.db.execute(
                select(
                    FaceEncoding.face_id,
                    FaceEncoding.thumbnail,
                    FaceEncoding.quality_score
                )
                .where(FaceEncoding.face_id.in_(face_ids))
                .distinct(FaceEncoding.face_id)
                .order_by(FaceEncoding.face_id, FaceEncoding.quality_score.desc())
            )

            # Build best thumbnail map: face_id -> thumbnail
            best_thumbnail_map = {}
            for row in best_encodings_result.all():
                if row.face_id not in best_thumbnail_map:
                    best_thumbnail_map[row.face_id] = row.thumbnail

            # Get all embeddings for fallback (for images)
            all_encodings_result = await self.db.execute(
                select(
                    FaceEncoding.face_id,
                    FaceEncoding.thumbnail,
                    FaceEncoding.quality_score,
                    FaceEncoding.id
                )
                .where(FaceEncoding.face_id.in_(face_ids))
                .order_by(FaceEncoding.face_id, FaceEncoding.quality_score.desc())
            )

            # Build embeddings map: face_id -> list of embedding dicts
            embeddings_map = {}
            for row in all_encodings_result.all():
                if row.face_id not in embeddings_map:
                    embeddings_map[row.face_id] = []
                embeddings_map[row.face_id].append({
                    "id": row.id,
                    "thumbnail": row.thumbnail,
                    "quality_score": row.quality_score
                })
        else:
            best_thumbnail_map = {}
            embeddings_map = {}

        # Build result dict
        result = {}
        for video_face, face in video_faces:
            if video_face.video_id not in result:
                result[video_face.video_id] = []

            thumbnail = best_thumbnail_map.get(face.id)

            result[video_face.video_id].append({
                "id": face.id,
                "name": face.name,
                "thumbnail": thumbnail,
                "embeddings": embeddings_map.get(face.id, []),
                "appearance_count": video_face.appearance_count
            })

        return result

    async def rename_folder(
        self,
        old_folder_path: Path,
        new_folder_name: str,
        root_directory: Path
    ) -> Dict[str, Any]:
        """
        Rename a top-level category folder and update all related database records.
        
        Only supports top-level directories within the root folder.
        Subdirectories are not supported and will be ignored.
        
        Args:
            old_folder_path: Full path to the folder to rename (must be a top-level category)
            new_folder_name: New name for the folder
            root_directory: Root directory where videos are stored
            
        Returns:
            Dict with update statistics
            
        Raises:
            ValueError: If folder doesn't exist, is not a top-level category, or new name is invalid
            RuntimeError: If filesystem or database update fails
        """
        import logging
        from database import Category, FolderScanStatus
        
        logger = logging.getLogger(__name__)
        
        # Validate inputs
        if not old_folder_path.exists() or not old_folder_path.is_dir():
            raise ValueError(f"Folder does not exist: {old_folder_path}")
        
        if not new_folder_name or new_folder_name.strip() == "":
            raise ValueError("New folder name cannot be empty")
        
        # Sanitize new folder name (remove invalid characters)
        invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|']
        if any(char in new_folder_name for char in invalid_chars):
            raise ValueError(f"New folder name contains invalid characters: {invalid_chars}")
        
        # Validate that this is a top-level category (direct child of root_directory)
        try:
            relative_to_root = old_folder_path.relative_to(root_directory)
            if len(relative_to_root.parts) != 1:
                raise ValueError(f"Only top-level categories can be renamed. Found: {relative_to_root.parts}")
        except ValueError as ve:
            if "not in subpath" in str(ve):
                raise ValueError(f"Folder must be within root directory: {root_directory}")
            raise
        
        # Calculate new folder path
        new_folder_path = old_folder_path.parent / new_folder_name
        
        # Check if destination already exists
        if new_folder_path.exists():
            raise ValueError(f"Destination folder already exists: {new_folder_path}")
        
        # Get old and new category names
        old_category = old_folder_path.name
        new_category = new_folder_name
        
        # Find all videos in this category (only top-level, no subdirectories)
        result = await self.db.execute(
            select(Video).where(Video.category == old_category)
        )
        
        videos = result.scalars().all()
        
        if not videos:
            raise ValueError(f"No videos found in folder: {old_folder_path}")
        
        logger.info(f"Renaming top-level category: {old_folder_path} -> {new_folder_path}")
        logger.info(f"Found {len(videos)} videos to update")
        
        # Step 1: Rename folder on filesystem
        try:
            old_folder_path.rename(new_folder_path)
            logger.info(f"✅ Folder renamed on filesystem")
        except Exception as e:
            raise RuntimeError(f"Filesystem rename failed: {e}")
        
        # Step 2: Update all video records and thumbnail hashes
        updated_count = 0
        thumbnail_updates = []
        
        try:
            for video in videos:
                old_video_path = Path(video.path)
                
                # Calculate new path: replace category in path
                relative_to_root = old_video_path.relative_to(root_directory)
                # Replace first part (category) with new name
                path_parts = relative_to_root.parts
                new_path_parts = (new_category,) + path_parts[1:]
                new_video_path = root_directory / Path(*new_path_parts)
                
                # Update video record
                old_path_str = str(old_video_path)
                new_path_str = str(new_video_path)
                
                video.path = new_path_str
                video.name = new_video_path.name
                video.category = new_category
                # subcategory and relative_path remain unchanged (videos are in category root only)
                
                # Update relative_path (should just be the filename for top-level videos)
                video.relative_path = new_video_path.name
                
                # Track thumbnail update
                thumbnail_updates.append((old_path_str, new_path_str))
                
                updated_count += 1
            
            # Commit video updates
            await self.db.commit()
            logger.info(f"✅ Updated {updated_count} video records in database")
            
            # Step 3: Update thumbnail path hashes
            if self.thumbnail_db:
                thumbnail_updated = 0
                for old_path, new_path in thumbnail_updates:
                    if await self.thumbnail_db.update_path_hash(old_path, new_path):
                        thumbnail_updated += 1
                logger.info(f"✅ Updated {thumbnail_updated} thumbnail path hashes")
            
            # Step 4: Update categories table
            result = await self.db.execute(
                select(Category).where(Category.name == old_category)
            )
            category = result.scalar_one_or_none()
            if category:
                category.name = new_category
                category.path = str(new_folder_path)
                await self.db.commit()
                logger.info(f"✅ Updated category record: {old_category} -> {new_category}")
            
            # Step 5: Update folder_scan_status table
            old_folder_name = old_folder_path.name
            result = await self.db.execute(
                select(FolderScanStatus).where(FolderScanStatus.folder_name == old_folder_name)
            )
            scan_status = result.scalar_one_or_none()
            if scan_status:
                scan_status.folder_name = new_folder_name
                await self.db.commit()
                logger.info(f"✅ Updated folder_scan_status: {old_folder_name} -> {new_folder_name}")
            
            return {
                "message": "Folder renamed successfully",
                "old_path": str(old_folder_path),
                "new_path": str(new_folder_path),
                "old_category": old_category,
                "new_category": new_category,
                "videos_updated": updated_count,
                "thumbnails_updated": len(thumbnail_updates)
            }
            
        except Exception as e:
            # Rollback: attempt to revert filesystem rename
            logger.error(f"❌ Database update failed: {e}")
            try:
                new_folder_path.rename(old_folder_path)
                logger.info("✅ Reverted filesystem rename")
            except Exception as revert_error:
                logger.error(f"❌ Failed to revert filesystem rename: {revert_error}")
            await self.db.rollback()
            raise RuntimeError(f"Database update failed after folder rename: {e}")