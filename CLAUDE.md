# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Clipper** is a lightweight, self-hosted web-based video/media file manager (branded as "POCVibe" in this instance). It provides a clean web interface for browsing, organizing, and playing local video collections where folders act as categories.

**Stack**: Python FastAPI backend + Vanilla JavaScript frontend + SQLite database

## Architecture

### High-Level Structure

- **Backend** (`backend/`): FastAPI server with async SQLite using SQLAlchemy ORM
- **Frontend** (`frontend/`): Vanilla JavaScript SPA (~32,500 lines) with no build tools
- **Database**: Dual SQLite databases in `{ROOT}/.clipper/`
  - `clipper.db`: Video metadata, tags, actors, faces, fingerprints
  - `thumbnails.db`: Binary thumbnail BLOBs

### Key Architectural Principles

1. **Filesystem as Source of Truth**: Videos are physically moved/renamed on disk, then database is synced
2. **Multi-Root Support**: Multiple video directories via `roots.json`, each with separate database
3. **Dual Database Design**: Separates metadata from binary data for cleaner operations
4. **No Frameworks**: Pure vanilla JavaScript, no React/Vue, no npm, no build tools
5. **Async-First**: All database operations use async/await patterns

## Development Commands

### Starting the Application

```bash
# Quick start (recommended)
python start.py

# Access at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Multi-Root Configuration

Create `roots.json` in project root:
```json
{
  "roots": [
    {
      "name": "Videos",
      "path": "/path/to/videos",
      "default": true,
      "layout": "horizontal"
    }
  ],
  "rememberLastRoot": true
}
```

Each root gets its own `.clipper/` folder with separate database.

### Common Operations

```bash
# Scan filesystem and sync database
curl "http://localhost:8000/scan?sync_db=true&prune_missing=true"

# Generate thumbnail for specific video
curl -X POST "http://localhost:8000/api/thumbnails/generate/{video_id}"

# Extract metadata (duration, resolution, codec) for video
curl -X POST "http://localhost:8000/api/videos/{video_id}/extract-metadata"

# Health check
curl "http://localhost:8000/health"
```

### Testing

```bash
# Backend tests (if added, none currently exist)
cd backend
pytest

# Check API documentation
open http://localhost:8000/docs
```

## Key Backend Components

### Core Files

- **`backend/main.py`** (7,153 lines): FastAPI application with all REST endpoints
  - Lifespan management with `@asynccontextmanager`
  - 50+ API endpoints for video/tag/face/fingerprint operations
  - CORS middleware configuration
  - Static file serving for frontend

- **`backend/database.py`**: SQLAlchemy ORM models
  - `Video`: Main model with metadata, relationships to tags/actors/faces
  - `Tag`, `Actor`, `VideoFingerprint`, `FaceID`, `FaceEncoding`, `VideoFace`
  - Cascade delete relationships (when Face deleted, encodings/video_faces cascade)
  - Foreign keys with `ondelete='CASCADE'`
  - Database migrations in `migrate_database()` function

- **`backend/config.py`**: Configuration via environment variables and `roots.json`
  - Multi-root management
  - Environment variable fallbacks
  - Per-root layout preferences

- **`backend/video_service.py`**: Core video operations
  - Metadata extraction via ffprobe
  - Video file operations (move, rename)
  - Database sync operations

- **`backend/face_service.py`**: Face recognition using InsightFace
  - 512-dimensional face embeddings
  - Cosine similarity matching
  - Face cataloging and search

- **`backend/fingerprint_service.py`**: Perceptual hashing for duplicate detection
  - pHash algorithm on 5 key frames
  - Hamming distance comparison
  - Scoped duplicate detection (folder or global)

- **`backend/video_editor.py`**: Video processing
  - In-memory job tracking
  - Cut/crop operations via ffmpeg
  - Quality presets (fast/balanced/high)

- **`backend/thumbnail_db.py`**: Database-based thumbnail storage
  - Async BLOB operations
  - Reduces filesystem clutter

## Key Frontend Components

### Main Application

- **`frontend/app.js`** (32,541 lines): Single ClipperApp class managing entire UI
  - State management for videos, selections, filters, views
  - Dual view system: Explorer (folder browsing) vs Collection (list view)
  - Context-aware pagination (full display in folders, paginated in collection)
  - 30+ event listeners for UI interactions
  - Bulk operations (multi-select, batch tagging/moving)
  - Drag-and-drop for organizing videos
  - Real-time search with 300ms debouncing

- **`frontend/index.html`**: Single-page application HTML
- **`frontend/styles.css`**: CSS Grid/Flexbox layouts, no preprocessors
- **`frontend/face-extraction-new.js`**: Face detection modal workflow
- **`frontend/face-api.min.js`**: face-api.js library for browser-based face detection

## Database Schema

### Main Tables

**videos**: Core video metadata
- Metadata: id, path, name, display_name, description, category, subcategory
- File info: size, modified, extension, media_type
- Video metadata: duration, width, height, codec, bitrate, fps
- Flags: thumbnail_generated, fingerprint_generated, is_final, favorite
- Series data: series, season, episode, year, channel, rating

**tags**: Color-coded tags
- id, name, color (hex)
- Many-to-many with videos via `video_tags` table

**actors**: Person/actor metadata
- id, name, notes, video_count
- Many-to-many with videos via `video_actors` table

**video_fingerprints**: Perceptual hashes for duplicate detection
- video_id, frame_position, phash
- Cascade delete when video deleted

**face_ids**: Face identity catalog
- id, name, actor_id, encoding_count
- Cascade deletes to face_encodings and video_faces

**face_encodings**: 512-D face embeddings
- face_id, video_id (nullable, preserved when video deleted)
- encoding (base64), thumbnail (base64)
- Limit 20 per face

**video_faces**: Junction table linking faces to videos
- video_id, face_id, detection_method, appearance_count
- UNIQUE constraint on (video_id, face_id)

### Database Migrations

Add migrations to `migrate_database()` in `backend/database.py`:

```python
async def migrate_database():
    async with engine.begin() as conn:
        # Check if column exists
        result = await conn.execute(text("PRAGMA table_info(videos)"))
        columns = [row[1] for row in result.fetchall()]

        if 'new_column' not in columns:
            await conn.execute(text("ALTER TABLE videos ADD COLUMN new_column VARCHAR"))
```

Migrations run automatically on startup.

## Key Features & Workflows

### Fast Scanning with On-Demand Metadata

- **Fast scan mode**: Only discovers filenames, no metadata extraction (instant for large collections)
- **On-demand metadata**: Load via context menu "⚡ Load Metadata" on video or folder
- **ffprobe extraction**: Duration, resolution, codec, bitrate, FPS extracted lazily

### Display Name vs Filename

- **display_name**: User-friendly name shown in UI (separate from filename)
- **name**: Actual filename on disk
- Unified edit modal updates both independently

### Duplicate Detection

- **Perceptual hashing**: 5 key frames at 5%, 25%, 50%, 75%, 95% of video
- **Scoped detection**: Within folder (fast) or entire library (comprehensive)
- **Duplicate groups view**: Shows similarity percentages, one-time group tagging with `dup-XXXX` tags
- **View state preservation**: Saves context when entering/exiting duplicate view

### Face Recognition

- **Dual stack**: face-api.js (frontend) + InsightFace (backend)
- **'S' key workflow**: Quick face search from current frame
- **'X' key workflow**: Batch extraction modal, scan 20-30 frames
- **512-D embeddings**: Cosine similarity matching on backend

### Video Editor (Pro Edition)

- **Timeline UI**: Drag IN/OUT handles, visual timeline
- **Keyboard shortcuts**: I/O for IN/OUT points, Space for play/pause, C for crop toggle
- **Operations**: Cut, Crop (9:16, 16:9, 1:1, custom), or combined
- **Quality presets**: Fast (stream copy), Balanced, High
- **Auto-import**: Refreshes destination folder after processing

### Smart Delete System

- **Two-tier deletion**: Move to DELETE folder (reversible) → Permanent delete (irreversible)
- Permanent deletion only available from DELETE folder with confirmation

## Backend Development Guidelines

### Database Operations

```python
# Always use async patterns
async def get_video(video_id: int, db: AsyncSession):
    result = await db.execute(
        select(Video)
        .where(Video.id == video_id)
        .options(selectinload(Video.tags))  # Eager load to avoid N+1
    )
    return result.scalar_one_or_none()
```

### Security Best Practices

```python
# Always validate paths
full_path = Path(video_path).resolve()
if not str(full_path).startswith(str(config.root_directory)):
    raise HTTPException(status_code=403, detail="Access denied")
```

### Adding New Endpoints

1. Define Pydantic request model in `main.py`
2. Create endpoint with proper dependency injection
3. Use `Depends(get_db)` for database sessions
4. Return proper HTTP status codes (200, 201, 400, 404, 500)

```python
class UpdateVideoRequest(BaseModel):
    display_name: str | None = None
    description: str | None = None

@app.post("/videos/{video_id}/update")
async def update_video(
    video_id: int,
    request: UpdateVideoRequest,
    db: AsyncSession = Depends(get_db)
):
    # Implementation here
    pass
```

## Frontend Development Guidelines

### State Management

All state lives in `ClipperApp` class:
- Use `this.videos` for displayed videos
- Use `this.allVideos` for unfiltered collection
- Use `Set()` for selection tracking (fast add/remove/has)

### API Communication

```javascript
// All API calls via fetch
async loadVideos() {
    try {
        const response = await fetch(`${this.apiBase}/videos?category=${cat}`);
        const data = await response.json();
        this.videos = data.videos;
        this.renderVideos();
    } catch (error) {
        console.error('Failed to load videos:', error);
        alert('Failed to load videos');
    }
}
```

### Performance Patterns

```javascript
// Use debouncing for search
this.searchDebounceTimer = setTimeout(() => {
    this.performSearch();
}, 300);

// Use requestAnimationFrame for scroll
requestAnimationFrame(() => {
    this.checkScrollPosition();
});

// Passive event listeners
element.addEventListener('scroll', handler, { passive: true });
```

### Cache Busting

```javascript
// After thumbnail changes, bust cache
const timestamp = Date.now();
const bustParam = Math.random();
thumbnailUrl = `/api/thumbnails/${videoId}?t=${timestamp}&bustCache=${bustParam}`;
```

## Code Style & Conventions

### Python

- Use async/await for all database operations
- Type hints for function parameters: `def func(param: str) -> dict:`
- SQLAlchemy ORM patterns, not raw SQL
- Pydantic models for request/response validation
- Use `HTTPException` for errors with proper status codes

### JavaScript

- ES6+ features (async/await, arrow functions, destructuring)
- No semicolons (consistent style)
- Methods return DOM elements for composability
- Error handling: try/catch on all `fetch()` calls
- User feedback: loading states, success/error toasts

### Database

- Always include foreign key `ondelete` behavior
- Use cascade relationships when appropriate
- Add indexes for common query patterns
- Test migrations with both empty and populated databases

## Configuration

### Environment Variables

```bash
# Primary configuration
export CLIPPER_ROOT_DIRECTORY="/path/to/videos"  # Fallback if no roots.json

# Server settings
export CLIPPER_PORT=8000
export CLIPPER_HOST="0.0.0.0"
export CLIPPER_DEBUG=true

# Optional settings
export CLIPPER_EXCLUDED_FOLDERS="Temp,.DS_Store,.clipper"
export CLIPPER_DB_PATH="custom/path/to/clipper.db"
export CLIPPER_CORS_ORIGINS="http://localhost:8000"
```

### Multi-Root Setup

Preferred over environment variable. Create `roots.json`:

```json
{
  "roots": [
    {
      "name": "Movies",
      "path": "/media/movies",
      "default": true,
      "layout": "horizontal"
    },
    {
      "name": "TV Shows",
      "path": "/media/tv",
      "layout": "vertical"
    }
  ],
  "rememberLastRoot": true
}
```

Each root maintains its own `.clipper/` directory with separate database.

## Dependencies

### System Requirements

- **Python 3.12+** required
- **ffmpeg** required for thumbnails, metadata extraction, video editing
- **yt-dlp** optional for M3U8/HLS downloads

### Python Packages

See `backend/requirements.txt`:
- fastapi==0.104.1
- uvicorn==0.24.0
- sqlalchemy==2.0.23
- aiosqlite==0.19.0
- pydantic==2.5.0
- insightface==0.7.3 (face recognition)
- onnxruntime==1.16.3 (face models)
- opencv-python==4.8.1.78 (computer vision)
- imagehash==4.3.1 (perceptual hashing)
- Pillow==10.1.0

### Frontend Dependencies

- **face-api.js@0.22.2**: Included locally at `frontend/face-api.min.js`
- No npm packages, no build tools

## API Endpoints Overview

### Videos
- `GET /videos` - List videos (pagination, filtering)
- `GET /videos/{id}` - Get single video
- `POST /videos/{id}/update` - Update display_name, description, or rename file
- `POST /videos/{id}/move` - Move video between folders
- `POST /videos/{id}/delete` - Move to DELETE folder
- `POST /videos/{id}/delete-permanent` - Permanently delete (DELETE folder only)
- `GET /stream/{category}/{video_path}` - Stream video with byte-range support

### Metadata
- `POST /api/videos/{id}/extract-metadata` - Extract metadata for single video
- `POST /api/videos/folder/{name}/extract-metadata` - Extract for entire folder

### Tags
- `GET /tags` - List all tags
- `POST /videos/{id}/tags` - Add tag to video
- `DELETE /videos/{id}/tags/{tag_id}` - Remove tag

### Thumbnails
- `GET /api/thumbnails/{video_id}` - Get thumbnail BLOB
- `POST /api/thumbnails/generate/{video_id}` - Generate thumbnail

### Fingerprinting
- `POST /api/fingerprints/generate/{video_id}` - Generate perceptual hashes
- `POST /api/fingerprints/find-duplicates/{video_id}` - Find similar videos
- `POST /api/fingerprints/find-all-duplicates?category={name}` - Find all duplicate groups

### Faces
- `POST /api/faces/search` - Search for face by encoding
- `POST /api/faces/create` - Create new face identity
- `POST /api/videos/{id}/faces/{face_id}/link` - Link face to video
- `POST /api/faces/catalog` - Batch catalog faces
- `POST /api/faces/merge` - Merge duplicate faces

### Video Editor
- `POST /api/videos/{id}/process` - Process video (cut/crop)
- `GET /api/videos/processing/status/{job_id}` - Get processing status

### Multi-Root
- `GET /api/roots` - List available roots and current root
- `POST /api/roots/select?root_name={name}` - Switch to different root

### Scanning
- `GET /scan` - Full scan with `sync_db=true&prune_missing=true`
- `POST /scan/folder/{name}` - Scan specific folder

## Troubleshooting

### Common Issues

**Thumbnails not generating**: Check ffmpeg installation with `ffmpeg -version`

**Videos not appearing**: Verify `CLIPPER_ROOT_DIRECTORY` or `roots.json` paths, run manual scan

**Database errors**: Ensure write permissions in `{ROOT}/.clipper/`, stop other Clipper instances

**Port in use**: Change port with `export CLIPPER_PORT=9000` or kill process on 8000

**Face recognition failing**: Ensure InsightFace models downloaded to `~/.insightface/`

### Debug Mode

```bash
export CLIPPER_DEBUG=true
cd backend && python main.py
```

Provides detailed SQL logs, stack traces, and ffmpeg output.

## Project-Specific Rules (from copilot-instructions.md)

- **Generate complete, production-ready code** - no snippets or partial examples
- **Output entire files** when making changes (unless explicitly asked for diff)
- **Never auto-generate README or .md files** unless explicitly requested
- **Never start, run, build, test, or debug** - leave execution to user
- **Ask before making assumptions** about missing requirements
- **Never generate tests** unless explicitly requested
- **Never add dependencies** without approval

## Utilities

### Media Organization Tools

Located in `api-tools/`:
- `organize_media.py`: Script to organize GIF/WEBP files into dedicated folders
- Moves GIF → `GIF/`, WEBP → `WEBP/`, updates database automatically
- Leaves MP4 and other files unchanged

Run with:
```bash
cd api-tools
python3 organize_media.py
```

## Recent Major Features

### v18 Updates
- **Pro Video Editor**: Timeline-based interface with drag handles, keyboard shortcuts (I/O keys)
- **Mobile optimizations**: Ultra-compact controls, responsive layout
- **Smart delete system**: Two-tier deletion (trash → permanent)

### v15 Updates
- **Force refresh buttons**: Manual cache refresh at folder and main explorer level
- **Auto-refresh after scan**: Eliminates manual reload
- **Lazy loading optimization**: Defer video loading until needed
- **Sanitize filename**: Context menu option to clean problematic characters
- **Interactive crop box**: Full resize with corner handles
- **yt-dlp fallback**: Two-tier M3U8 download strategy

## Tech Stack Summary

**Backend**: Python 3.12+, FastAPI, SQLAlchemy, uvicorn, SQLite
**Frontend**: Vanilla JavaScript ES6+, HTML5, CSS3 Grid/Flexbox
**Computer Vision**: InsightFace, OpenCV, face-api.js, Pillow, imagehash
**Video Processing**: FFmpeg for thumbnails, metadata, editing
**Deployment**: Self-hosted, single Python process, no external services
