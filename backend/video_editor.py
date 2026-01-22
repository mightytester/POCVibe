"""
Video Editor Service - Simple utility for cutting, cropping, and editing videos
No database - in-memory tracking only
Uses ffmpeg for video processing
"""

import asyncio
import logging
import time
import json
from pathlib import Path
from typing import Dict, Optional, List
from dataclasses import dataclass
from datetime import datetime

logger = logging.getLogger(__name__)


@dataclass
class VideoEditJob:
    """Track video edit job status in memory"""
    id: int
    video_id: int
    video_path: str
    operation: str  # 'cut' | 'crop' | 'cut_and_crop'

    # Cut parameters
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    cut_method: str = "ffmpeg"  # 'ffmpeg' (precise, frame-accurate) | 'smartcut' (fast, keyframe-based) | 'copy' (fastest, keyframe-based, no encoding)

    # Crop parameters
    crop_preset: Optional[str] = None  # '9:16' | '16:9' | '1:1' | 'custom'
    crop_width: Optional[int] = None
    crop_height: Optional[int] = None
    crop_x: Optional[int] = None
    crop_y: Optional[int] = None

    # Options
    preserve_faces: bool = True
    copy_other_items: bool = False  # Copy tags and face associations from original video
    output_filename: Optional[str] = None
    quality: str = "balanced"  # 'fast' | 'balanced' | 'high'

    # Status tracking
    status: str = 'pending'  # 'pending' | 'processing' | 'completed' | 'failed'
    created_at: float = 0
    completed_at: Optional[float] = None
    output_path: Optional[str] = None
    error_message: Optional[str] = None
    progress: int = 0  # 0-100


class VideoEditor:
    """Simple video editor using ffmpeg"""

    def __init__(self, output_folder: Path):
        self.output_folder = output_folder
        self.output_folder.mkdir(parents=True, exist_ok=True)

        # In-memory tracking
        self.jobs: Dict[int, VideoEditJob] = {}
        self.next_id = 1

        logger.info(f"Video Editor initialized. Output folder: {output_folder}")

    def create_edit_job(
        self,
        video_id: int,
        video_path: str,
        operation: str,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        cut_method: str = "ffmpeg",
        crop_preset: Optional[str] = None,
        crop_width: Optional[int] = None,
        crop_height: Optional[int] = None,
        crop_x: Optional[int] = None,
        crop_y: Optional[int] = None,
        preserve_faces: bool = True,
        output_filename: Optional[str] = None,
        output_location: str = "same_folder",
        copy_other_items: bool = False,
        quality: str = "balanced"
    ) -> VideoEditJob:
        """Create a new video edit job and start it in background

        Args:
            cut_method: 'ffmpeg' (default, precise frame-accurate) | 'smartcut' (fast, keyframe-based) | 'copy' (fastest, no encoding, keyframe-based)
            output_location: "same_folder" (default, exports to same folder as source video) or
                           "edited_folder" (exports to ROOT/EDITED/)
        """

        job_id = self.next_id
        self.next_id += 1

        # Generate output filename if not provided
        if not output_filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            video_name = Path(video_path).stem

            # Build suffix based on operation
            suffix = f"_{operation}"
            if start_time and end_time:
                start_suffix = start_time.replace(':', '')
                end_suffix = end_time.replace(':', '')
                suffix += f"_{start_suffix}_{end_suffix}"
            if crop_preset:
                suffix += f"_{crop_preset.replace(':', 'x')}"

            output_filename = f"{video_name}{suffix}.mp4"

        # Ensure .mp4 extension
        if not output_filename.endswith('.mp4'):
            output_filename += '.mp4'

        # Determine output path based on location preference
        if output_location == "same_folder":
            # Export to same folder as source video
            source_folder = Path(video_path).parent
            output_path = source_folder / output_filename
        else:
            # Default: export to EDITED folder
            output_path = self.output_folder / output_filename

        # Create edit job
        job = VideoEditJob(
            id=job_id,
            video_id=video_id,
            video_path=video_path,
            operation=operation,
            start_time=start_time,
            end_time=end_time,
            cut_method=cut_method,
            crop_preset=crop_preset,
            crop_width=crop_width,
            crop_height=crop_height,
            crop_x=crop_x,
            crop_y=crop_y,
            preserve_faces=preserve_faces,
            copy_other_items=copy_other_items,
            output_filename=output_filename,
            quality=quality,
            status='pending',
            created_at=time.time(),
            output_path=str(output_path)
        )

        self.jobs[job_id] = job

        # Start processing in background
        asyncio.create_task(self._process_job(job_id))

        logger.info(f"Created edit job {job_id}: {operation} on {video_path}")
        return job

    async def _check_has_audio(self, video_path: str) -> bool:
        """Check if video has audio stream using ffprobe"""
        try:
            cmd = [
                'ffprobe',
                '-v', 'error',
                '-select_streams', 'a:0',
                '-show_entries', 'stream=codec_type',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                video_path
            ]
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.communicate()
            result = stdout.decode().strip()
            has_audio = result == 'audio'
            logger.info(f"Video {Path(video_path).name} has audio: {has_audio}")
            return has_audio
        except Exception as e:
            logger.warning(f"Could not detect audio stream: {e}, assuming audio exists")
            return True  # Default to assuming audio exists for safety

    async def _process_job(self, job_id: int):
        """Background worker that processes the video edit job"""

        job = self.jobs.get(job_id)
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        try:
            job.status = 'processing'
            job.progress = 10
            method_desc = "Smartcut" if job.cut_method == "smartcut" else "FFmpeg"
            logger.info(f"Starting job {job_id}: {job.operation} using {method_desc}")

            # Detect if video has audio stream
            has_audio = await self._check_has_audio(job.video_path)

            # Build command based on cut_method for cut operations
            if job.operation == 'cut' and job.cut_method == 'smartcut':
                cmd = self._build_smartcut_command(job)
            elif job.operation == 'cut' and job.cut_method == 'copy':
                cmd = self._build_copy_cut_command(job, has_audio=has_audio)
            else:
                cmd = self._build_ffmpeg_command(job, has_audio=has_audio)

            logger.info(f"Running command: {' '.join(cmd)}")
            job.progress = 20

            # Run subprocess
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            job.progress = 50

            # Wait for completion
            stdout, stderr = await process.communicate()

            job.progress = 90

            if process.returncode == 0:
                job.status = 'completed'
                job.completed_at = time.time()
                job.progress = 100
                if job.cut_method == "smartcut":
                    method_desc = "Smartcut"
                elif job.cut_method == "copy":
                    method_desc = "FFmpeg Copy"
                else:
                    method_desc = "FFmpeg"
                logger.info(f"Job {job_id} completed ({method_desc}): {job.output_filename}")
            else:
                job.status = 'failed'
                job.error_message = stderr.decode('utf-8')[-500:]  # Last 500 chars
                if job.cut_method == "smartcut":
                    method_desc = "Smartcut"
                elif job.cut_method == "copy":
                    method_desc = "FFmpeg Copy"
                else:
                    method_desc = "FFmpeg"
                logger.error(f"Job {job_id} failed ({method_desc}): {job.error_message}")

        except Exception as e:
            job.status = 'failed'
            job.error_message = str(e)
            logger.error(f"Job {job_id} error: {e}")

    def _build_ffmpeg_command(self, job: VideoEditJob, has_audio: bool = True) -> List[str]:
        """Build ffmpeg command with frame-accurate precision using re-encoding"""

        # Header and Input flags
        cmd = ['ffmpeg', '-y', '-hide_banner']
        
        # Check if time-based cutting is being done
        has_time_cut = bool(job.start_time and job.start_time != "0:00:00") or bool(job.end_time)
        
        # Use input seeking (-ss BEFORE -i) for maximum precision and speed with re-encoding
        # FFmpeg will seek to the nearest keyframe and then decode precisely to the start timestamp
        if job.start_time:
            cmd.extend(['-ss', job.start_time])
            
        # Add accurate seek flag
        cmd.extend(['-accurate_seek'])
        
        # Input file
        cmd.extend(['-i', job.video_path])

        # Duration or To
        if job.start_time and job.end_time:
            # When -ss is before -i, -to refers to the absolute time of the input
            # However, -t (duration) is often more reliable
            start_sec = self._time_to_seconds(job.start_time)
            end_sec = self._time_to_seconds(job.end_time)
            duration = max(0, end_sec - start_sec)
            cmd.extend(['-t', str(duration)])
            logger.info(f"FFmpeg precise cut: {job.start_time} to {job.end_time} (duration: {duration}s)")
        elif job.end_time:
            cmd.extend(['-to', job.end_time])
            logger.info(f"FFmpeg precise cut: start to {job.end_time}")

        # Determine if we need re-encoding
        # Time cuts ALWAYS require re-encoding in this method for frame accuracy
        # (The 'copy' method handles keyframe-only cuts)
        needs_reencoding = has_time_cut or job.operation in ('crop', 'cut_and_crop')
        
        video_filters = []
        if job.operation in ('crop', 'cut_and_crop'):
            if job.crop_preset or (job.crop_width and job.crop_height):
                x = job.crop_x or 0
                y = job.crop_y or 0
                
                if job.crop_width and job.crop_height:
                    # Build the crop filter
                    crop_filter = f"crop={job.crop_width}:{job.crop_height}:{x}:{y}"
                    video_filters.append(crop_filter)
                    needs_reencoding = True

        # Apply video filters if any
        if video_filters:
            cmd.extend(['-vf', ','.join(video_filters)])

        # Encoding settings
        if needs_reencoding:
            # Map quality setting to CRF and preset values
            quality_settings = {
                'fast': {'crf': '28', 'preset': 'ultrafast'},
                'balanced': {'crf': '23', 'preset': 'medium'},
                'high': {'crf': '18', 'preset': 'slow'}
            }
            settings = quality_settings.get(job.quality, quality_settings['balanced'])

            # Re-encode with quality settings
            cmd.extend(['-c:v', 'libx264', '-preset', settings['preset'], '-crf', settings['crf']])
            
            # Use specific flags for accurate cuts
            cmd.extend(['-avoid_negative_ts', 'make_zero'])
            
            # Only encode audio if video has audio stream
            if has_audio:
                cmd.extend(['-c:a', 'aac', '-b:a', '128k'])
            else:
                cmd.extend(['-an'])
        else:
            # Fallback to copy if no transformation needed (shouldn't really happen for 'Precise' method)
            cmd.extend(['-c', 'copy'])

        # Output file
        cmd.append(job.output_path)

        logger.info(f"Precise FFmpeg command: {' '.join(cmd)}")
        return cmd

    def _build_copy_cut_command(self, job: VideoEditJob, has_audio: bool = True) -> List[str]:
        """Build FFmpeg command for ultra-fast cutting with stream copy (no encoding)
        
        Uses -c copy to avoid re-encoding. Cuts at keyframes only (similar limitations as smartcut).
        This is the fastest cutting method but cannot crop.
        """
        
        if job.operation in ('crop', 'cut_and_crop'):
            logger.warning(f"Copy cut method does not support crop operations. Falling back to ffmpeg.")
            return self._build_ffmpeg_command(job, has_audio=True)
        
        cmd = ['ffmpeg', '-hide_banner']
        
        # Add start time seeking (precise seeking with -ss before input)
        if job.start_time:
            cmd.extend(['-ss', job.start_time])
        
        # Input file
        cmd.extend(['-i', job.video_path])
        
        # Duration (-t uses duration from -ss point)
        if job.end_time and job.start_time:
            # Calculate duration = end_time - start_time
            start_sec = self._time_to_seconds(job.start_time)
            end_sec = self._time_to_seconds(job.end_time)
            duration = max(0, end_sec - start_sec)
            cmd.extend(['-t', str(duration)])
            logger.info(f"Copy cut: {job.start_time} to {job.end_time} (duration: {duration}s)")
        elif job.end_time:
            # Just end time, cut from start
            end_sec = self._time_to_seconds(job.end_time)
            cmd.extend(['-t', str(end_sec)])
            logger.info(f"Copy cut: start to {job.end_time} (duration: {end_sec}s)")
        
        # Avoid negative timestamps
        cmd.extend(['-avoid_negative_ts', 'make_zero'])
        
        # Map all streams with copy codec (no re-encoding)
        # We map video and audio explicitly to be safe, but only if they exist
        cmd.extend(['-map', '0:v', '-c:v', 'copy'])
        
        if has_audio:
            cmd.extend(['-map', '0:a', '-c:a', 'copy'])
        
        # Copy metadata and optimize for fast start
        cmd.extend(['-map_metadata', '0'])
        cmd.extend(['-movflags', '+faststart'])
        
        # Additional flags for robustness
        cmd.extend(['-default_mode', 'infer_no_subs'])
        cmd.extend(['-ignore_unknown'])
        
        # Output format and file
        cmd.extend(['-f', 'mp4', '-y', job.output_path])
        
        logger.info(f"Copy cut command: {' '.join(cmd)}")
        return cmd

    def _build_smartcut_command(self, job: VideoEditJob) -> List[str]:
        """Build smartcut command for efficient frame-accurate cutting with minimal re-encoding
        
        Note: smartcut only supports the --cut or --keep operations for cutting.
        It does NOT support cropping, so crop operations must still use ffmpeg.
        """
        
        if job.operation in ('crop', 'cut_and_crop'):
            logger.warning(f"smartcut does not support crop operations. Falling back to ffmpeg.")
            return self._build_ffmpeg_command(job, has_audio=True)
        
        # Only use smartcut for pure 'cut' operations
        if job.operation != 'cut':
            return self._build_ffmpeg_command(job, has_audio=True)
        
        cmd = ['smartcut', job.video_path, job.output_path]
        
        # Convert HH:MM:SS or MM:SS format to seconds for smartcut
        start_seconds = self._time_to_seconds(job.start_time) if job.start_time else None
        end_seconds = self._time_to_seconds(job.end_time) if job.end_time else None
        
        # smartcut uses --keep to specify segments to keep
        # We need to convert cut times to keep times
        if start_seconds is not None and end_seconds is not None:
            # Keep from start_seconds to end_seconds
            cmd.extend(['--keep', f'{start_seconds},{end_seconds}'])
            logger.info(f"smartcut keeping segment: {start_seconds}s to {end_seconds}s")
        elif start_seconds is not None:
            # Keep from start_seconds to end of file
            cmd.extend(['--keep', f'{start_seconds},e'])
            logger.info(f"smartcut keeping from {start_seconds}s to end")
        elif end_seconds is not None:
            # Keep from start to end_seconds
            cmd.extend(['--keep', f's,{end_seconds}'])
            logger.info(f"smartcut keeping from start to {end_seconds}s")
        
        # Add log level for debugging (valid options: warning, error, fatal)
        cmd.extend(['--log-level', 'warning'])
        
        logger.info(f"smartcut command: {' '.join(cmd)}")
        return cmd
    
    def _time_to_seconds(self, time_str: str) -> float:
        """Convert HH:MM:SS or MM:SS format to seconds"""
        if not time_str:
            return 0
        
        parts = time_str.split(':')
        try:
            if len(parts) == 3:  # HH:MM:SS
                hours, minutes, seconds = map(float, parts)
                return hours * 3600 + minutes * 60 + seconds
            elif len(parts) == 2:  # MM:SS
                minutes, seconds = map(float, parts)
                return minutes * 60 + seconds
            else:
                # Try to parse as seconds
                return float(time_str)
        except ValueError:
            logger.warning(f"Could not parse time string: {time_str}")
            return 0

    def _get_crop_filter_from_preset(
        self,
        preset: str,
        input_width: Optional[int],
        input_height: Optional[int],
        custom_x: Optional[int] = None,
        custom_y: Optional[int] = None
    ) -> Optional[str]:
        """Generate crop filter string from preset (9:16, 16:9, 1:1) with optional custom positioning"""

        if not input_width or not input_height:
            # Can't calculate crop without input dimensions
            # Will need to detect from video metadata
            return None

        if preset == '9:16':
            # Vertical video (1080x1920, 720x1280, etc)
            target_width = int(input_height * 9 / 16)
            target_height = input_height
            x = custom_x if custom_x is not None else int((input_width - target_width) / 2)  # Center horizontally or use custom
            y = custom_y if custom_y is not None else 0
            return f"crop={target_width}:{target_height}:{x}:{y}"

        elif preset == '16:9':
            # Horizontal video (1920x1080, 1280x720, etc)
            target_width = input_width
            target_height = int(input_width * 9 / 16)
            x = custom_x if custom_x is not None else 0
            y = custom_y if custom_y is not None else int((input_height - target_height) / 2)  # Center vertically or use custom
            return f"crop={target_width}:{target_height}:{x}:{y}"

        elif preset == '1:1':
            # Square video (1080x1080, 720x720, etc)
            size = min(input_width, input_height)
            x = custom_x if custom_x is not None else int((input_width - size) / 2)
            y = custom_y if custom_y is not None else int((input_height - size) / 2)
            return f"crop={size}:{size}:{x}:{y}"

        return None

    def get_job(self, job_id: int) -> Optional[VideoEditJob]:
        """Get job status by ID"""
        return self.jobs.get(job_id)

    def list_jobs(self) -> List[VideoEditJob]:
        """List all jobs (sorted by creation time, newest first)"""
        return sorted(
            self.jobs.values(),
            key=lambda j: j.created_at,
            reverse=True
        )

    def list_active_jobs(self) -> List[VideoEditJob]:
        """List only active jobs (pending or processing)"""
        return [
            j for j in self.jobs.values()
            if j.status in ('pending', 'processing')
        ]

    def remove_job(self, job_id: int) -> bool:
        """Remove job from tracking (does not delete output file)"""
        if job_id in self.jobs:
            del self.jobs[job_id]
            logger.info(f"Removed job {job_id} from tracking")
            return True
        return False

    def clear_completed(self):
        """Clear all completed/failed jobs from memory"""
        to_remove = [
            j_id for j_id, j in self.jobs.items()
            if j.status in ('completed', 'failed')
        ]
        for j_id in to_remove:
            del self.jobs[j_id]
        logger.info(f"Cleared {len(to_remove)} completed/failed jobs")


# Global instance
editor: Optional[VideoEditor] = None


def init_editor(output_folder: Path):
    """Initialize the global video editor instance"""
    global editor
    editor = VideoEditor(output_folder)
    logger.info("Video Editor service initialized")


def get_editor() -> VideoEditor:
    """Get the global video editor instance"""
    if editor is None:
        raise RuntimeError("Video Editor not initialized. Call init_editor() first.")
    return editor
