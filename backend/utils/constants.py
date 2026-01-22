"""Constants and magic numbers used throughout the Clipper backend."""

# =============================================================================
# Face Recognition Constants
# =============================================================================

# Threshold for automatically linking a detected face to an existing face ID
FACE_SIMILARITY_AUTO_LINK = 0.8

# Minimum threshold for search results to be considered a match
FACE_SIMILARITY_SEARCH = 0.4

# High confidence threshold for grouping similar faces
FACE_SIMILARITY_GROUP_HIGH = 0.75

# Lower confidence threshold for grouping similar faces
FACE_SIMILARITY_GROUP_LOW = 0.70

# Maximum number of encodings per face ID
FACE_ENCODING_LIMIT = 20

# =============================================================================
# Fingerprinting Constants
# =============================================================================

# Hash size for perceptual hashing (8 = 64-bit hash)
FINGERPRINT_HASH_SIZE = 8

# Frame positions (as percentages) for extracting fingerprints
FINGERPRINT_FRAME_POSITIONS = [5, 25, 50, 75, 95]

# Maximum Hamming distance for duplicate detection
FINGERPRINT_SIMILARITY_THRESHOLD = 10

# =============================================================================
# Thumbnail Constants
# =============================================================================

# Default thumbnail width in pixels
THUMBNAIL_WIDTH = 320

# JPEG quality for thumbnails (0-100)
THUMBNAIL_JPEG_QUALITY = 85

# Thumbnail extraction position (percentage of video duration)
THUMBNAIL_POSITION_PERCENT = 10

# =============================================================================
# InsightFace Constants
# =============================================================================

# Detection size for InsightFace model
INSIGHTFACE_DET_SIZE = (320, 320)

# Detection threshold for face detection
INSIGHTFACE_DET_THRESH = 0.3

# =============================================================================
# Timeout Constants (in seconds)
# =============================================================================

# FFmpeg operation timeout
FFMPEG_TIMEOUT = 15

# FFprobe metadata extraction timeout
FFPROBE_TIMEOUT = 10

# Video processing job timeout (10 minutes)
VIDEO_PROCESSING_TIMEOUT = 600

# =============================================================================
# Pagination Constants
# =============================================================================

# Default page size for video listings
DEFAULT_PAGE_SIZE = 50

# Maximum page size allowed
MAX_PAGE_SIZE = 200

# =============================================================================
# Search Constants
# =============================================================================

# Debounce delay for search (in milliseconds, used by frontend)
SEARCH_DEBOUNCE_MS = 300

# =============================================================================
# Media Type Constants
# =============================================================================

# Video file extensions
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.m4v', '.flv'}

# Image file extensions
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}

# Audio file extensions
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a', '.wma'}
