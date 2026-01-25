# Repository-Wide GitHub Copilot Instructions

## 🎯 Primary Goal
Generate complete, production-ready code for requested changes while minimizing unnecessary output and token usage.


## 🧑‍💻 Code Generation Rules

- **Generate full code implementations**, not short snippets or partial examples.
- If a file needs to be changed, output the **entire updated file** unless I explicitly ask for a diff.
- Follow the existing project structure, naming conventions, and coding style.
- Prefer clarity and correctness over brevity.


## ❌ Disallowed Outputs

- **Do NOT generate Markdown (`.md`) files** unless I explicitly request documentation.
- Do NOT auto-generate README files, design docs, or explanatory markdown.
- Do NOT generate sample usage docs unless explicitly requested.


## 🚫 No Execution or Debugging

- **Do NOT start, run, build, test, debug, or simulate the application.**
- Do NOT assume runtime behavior or environment setup.
- Leave all execution, debugging, and testing to me.


## 🤝 Interaction & Assumptions

- **Do NOT make assumptions** about missing requirements, configurations, or environment details.
- If something is unclear or required to proceed, **ask me explicitly** before generating code.
- Do not auto-fix or refactor unrelated parts of the codebase.


## 🧪 Tests & Tooling

- Do NOT generate tests unless explicitly requested.
- Do NOT add new dependencies, tools, or scripts unless I approve.


## 📌 Output Discipline

- Only generate files directly related to the requested change.
- Avoid boilerplate, placeholders, or unrelated refactors.
- Keep comments concise and relevant.


## Project Overview

**Clipper** is a lightweight, self-hosted web-based video/media file manager. It provides a clean web interface for browsing, organizing, and playing local video collections where folders act as categories.

**Stack**: Python FastAPI backend + Vanilla JavaScript frontend + SQLite database

## Architecture

### High-Level Structure

- **Backend** (`backend/`): FastAPI server with async SQLite using SQLAlchemy ORM
- **Frontend** (`frontend/`): Vanilla JavaScript SPA (~37,500 lines, main app.js now ~22,200 lines) with no build tools
- **Database**: Dual SQLite databases in `{ROOT}/.clipper/`
  - `clipper.db`: Video metadata, tags, actors, faces, fingerprints
  - `thumbnails.db`: Binary thumbnail BLOBs

### Key Architectural Principles

1. **Filesystem as Source of Truth**: Videos are physically moved/renamed on disk, then database is synced
2. **Multi-Root Support**: Multiple video directories via `roots.json`, each with separate database
3. **Dual Database Design**: Separates metadata from binary data for cleaner operations
4. **No Frameworks**: Pure vanilla JavaScript, no React/Vue, no npm, no build tools
5. **Async-First**: All database operations use async/await patterns

### Backend Architecture

```
backend/
├── main.py              # App setup, lifespan, router mounting
├── config.py            # Multi-root configuration
├── database.py          # SQLAlchemy ORM models + migrations
├── routers/             # 16 FastAPI APIRouter modules
│   ├── videos.py        # Video CRUD, streaming, metadata
│   ├── thumbnails.py    # Thumbnail generation/retrieval
│   ├── faces.py         # Face recognition
│   ├── fingerprints.py  # Duplicate detection
│   ├── tags.py          # Tag management
│   ├── actors.py        # Actor catalog
│   ├── scan.py          # Filesystem scanning
│   ├── search.py        # Video search
│   ├── roots.py         # Multi-root switching
│   ├── downloads.py     # M3U8/SOCKS downloads
│   ├── editor.py        # Video editing
│   ├── folders.py       # Folder operations
│   ├── audio.py         # Audio extraction/processing
│   ├── maintenance.py   # Database cleanup operations
│   └── health.py        # Health checks
├── schemas/             # Pydantic request/response models
└── utils/               # Shared utilities
```

### Frontend Modular Architecture

The frontend has been progressively modularized from a monolithic `app.js` into discrete, maintainable modules. The modularization follows a dependency hierarchy where core utilities are loaded first, followed by feature modules that depend on them.

**Core Utilities (No Dependencies)**
- `frontend/api-client.js`: Centralized API client class for all backend communication
- `frontend/dom-cache.js`: DOM element caching system with automatic invalidation
- `frontend/settings-storage.js`: LocalStorage persistence for app settings
- `frontend/format-utils.js`: Formatting, parsing, and utility functions (time, size, filenames, colors)

**Feature Modules (Depend on Core)**
- `frontend/keyboard-shortcuts-module.js`: Global keyboard shortcuts and help modal (~315 lines)
- `frontend/series-metadata-module.js`: Series/season/episode metadata, series view, filters (~527 lines)
- `frontend/video-operations-module.js`: Video move, delete, rename operations (~1,270 lines)
- `frontend/video-collection-module.js`: Video grid rendering, pagination, lazy loading (~500 lines)
- `frontend/face-recognition-module.js`: Face detection ('S' key), batch extraction ('X' key)
- `frontend/video-editor-module.js`: Timeline UI, cut/crop operations
- `frontend/bulk-operations-module.js`: Multi-select bulk operations
- `frontend/context-menu-module.js`: Right-click context menu for videos
- `frontend/actor-management-module.js`: Actor catalog and face-actor associations
- `frontend/video-player-module.js`: Video playback controls and fullscreen
- `frontend/tag-management-module.js`: Tag CRUD operations and color picker
- `frontend/duplicate-review-module.js`: Visual duplicate comparison and deletion
- `frontend/bulk-edit-module.js`: Batch metadata editing
- `frontend/curation-mode-module.js`: Curation workflow UI
- `frontend/image-viewer-module.js`: Image gallery and lightbox
- `frontend/download-module.js`: M3U8/SOCKS download UI
- `frontend/sorting-module.js`: Sorting, filtering, view switching (~659 lines)
- `frontend/scan-system-module.js`: Scan queue, folder scanning, batch thumbnails (~932 lines)
- `frontend/fingerprint-module.js`: Fingerprint generation, duplicate detection (~1,038 lines)
- `frontend/navigation-module.js`: Navigation, breadcrumbs, folder explorer, folder groups (~1,489 lines)

**Module Loading Order in index.html**
```html
<!-- Core utilities (no dependencies) -->
<script src="/static/dom-cache.js"></script>
<script src="/static/api-client.js"></script>
<script src="/static/settings-storage.js"></script>
<script src="/static/format-utils.js"></script>

<!-- Feature modules (depend on core) -->
<script src="/static/keyboard-shortcuts-module.js"></script>
<script src="/static/series-metadata-module.js"></script>
<script src="/static/video-operations-module.js"></script>
<script src="/static/video-collection-module.js"></script>
<script src="/static/face-recognition-module.js"></script>
<script src="/static/video-editor-module.js"></script>
<script src="/static/bulk-operations-module.js"></script>
<script src="/static/context-menu-module.js"></script>
<script src="/static/actor-management-module.js"></script>
<script src="/static/video-player-module.js"></script>
<script src="/static/tag-management-module.js"></script>
<script src="/static/duplicate-review-module.js"></script>
<script src="/static/bulk-edit-module.js"></script>
<script src="/static/curation-mode-module.js"></script>
<script src="/static/image-viewer-module.js"></script>
<script src="/static/download-module.js"></script>
<script src="/static/sorting-module.js"></script>
<script src="/static/scan-system-module.js"></script>
<script src="/static/fingerprint-module.js"></script>
<script src="/static/navigation-module.js"></script>

<!-- Main application -->
<script src="/static/app.js"></script>
```

**Integration Pattern**
- Main `app.js` instantiates modules: `this.api = new ClipperAPIClient(this.apiBase)`
- Core utilities initialized: `this.format = new FormatUtils({ editedVideoSubstrings: [...] })`
- Feature modules receive `app` reference: `this.keyboardModule = new KeyboardShortcutsModule(this)`
- Modules use `this.app.api` for API calls, `this.app.dom` for cached DOM access, `this.app.format` for utilities
- Some modules auto-initialize (keyboard module sets up shortcuts, series module manages state)
- Delegated methods in app.js call module methods: `showSeriesModalFromContext() { this.seriesModule.showSeriesModalFromContext() }`

## Development Commands

### Starting the Application

```bash
# Quick start (recommended)
python start.py

# Debug mode with auto-reload (server restarts on code changes)
python debug-start.py

# Access at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Common Operations

```bash
# Scan filesystem and sync database (removes deleted files)
curl "http://localhost:8000/scan?sync_db=true&prune_missing=true"

# Generate thumbnail for specific video
curl -X POST "http://localhost:8000/api/thumbnails/generate/{video_id}"

# Extract metadata (duration, resolution, codec)
curl -X POST "http://localhost:8000/api/videos/{video_id}/extract-metadata"

# Health check
curl "http://localhost:8000/health"
```

### Database Cleanup

To remove database entries for files deleted from filesystem:
- **UI**: Actions menu → "🧹 Cleanup Database"
- **API**: `GET /scan?sync_db=true&prune_missing=true`
- **Console**: `await app.cleanupDatabase()`

### Multi-Root Configuration

Create `roots.json` in project root:
```json
{
  "roots": [
    {"name": "Videos", "path": "/path/to/videos", "default": true, "layout": "horizontal"}
  ],
  "rememberLastRoot": true
}
```

## Key Frontend Patterns

### View Types and State

**Three view types**: Explorer, Collection (list), Series

**Explorer view has two states**:
- Root level: Shows folder cards in `folderExplorer` container
- Inside folder: Shows video cards in `videoGrid` container
- `loadAndShowVideosInFolder()` bridges between these states

### Collection View Caching

```javascript
// Two arrays for collection view:
this.allVideos = [];           // Working array for current display (may be filtered/folder-specific)
this.allVideosCatalog = [];    // Persistent cache of FULL collection (all videos across all folders)
this.hasLoadedFullCollection = false;  // Flag: true when allVideosCatalog has complete data

// When loading collection: store in both
this.allVideos = data.videos;
this.allVideosCatalog = data.videos;
this.hasLoadedFullCollection = true;

// When visiting a folder: only update allVideos, preserve allVideosCatalog
this.allVideos = folderVideos;  // Don't touch allVideosCatalog

// When returning to collection: restore from cache
if (this.hasLoadedFullCollection && this.allVideosCatalog.length > 0) {
    this.allVideos = this.allVideosCatalog;  // Restore from cache
}

// After folder refresh that removes deleted files: update cache
const otherFolderVideos = this.allVideosCatalog.filter(v => v.category !== folderName);
this.allVideosCatalog = otherFolderVideos.concat(freshVideos);
```

### View State Preservation

When implementing full-screen modal views (Face Catalog, Duplicates Review):

```javascript
// Save state before entering
this.previousViewState = {
    videos: [...this.videos],
    allVideos: [...this.allVideos],
    currentSearchQuery: this.currentSearchQuery,
    currentTagFilter: this.currentTagFilter,
    currentFolderFilter: [...this.currentFolderFilter],
    currentSort: this.currentSort,
    currentView: this.currentView,
    currentCategory: this.currentCategory,
    currentSubcategory: this.currentSubcategory
};

// Restore when exiting - detect and restore correct view type
if (this.previousViewState.currentView === 'explorer') {
    // Restore explorer view
} else if (this.previousViewState.currentView === 'series') {
    // Restore series view
} else {
    // Restore list/collection view
}
```

### Cache Busting for Thumbnails

```javascript
const timestamp = Date.now();
const bustParam = Math.random();
thumbnailUrl = `/api/thumbnails/${videoId}?t=${timestamp}&bustCache=${bustParam}`;
```

## Database Schema

### Main Tables

**videos**: id, path, name, display_name, category, subcategory, duration, width, height, codec, thumbnail_generated, fingerprint_generated, favorite, series, season, episode, year, channel, rating

**tags**: id, name, color (hex) - Many-to-many via `video_tags`

**actors**: id, name, notes - Many-to-many via `video_actors`

**face_ids**: id, name, actor_id, encoding_count - Cascade deletes to encodings/video_faces

**face_encodings**: face_id, encoding (base64), thumbnail (base64) - Limit 20 per face

**video_fingerprints**: video_id, frame_position, phash - For duplicate detection

### Database Migrations

Add to `migrate_database()` in `backend/database.py`:

```python
async def migrate_database():
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(videos)"))
        columns = [row[1] for row in result.fetchall()]
        if 'new_column' not in columns:
            await conn.execute(text("ALTER TABLE videos ADD COLUMN new_column VARCHAR"))
```

## Backend Development

### Adding New Endpoints

1. Define Pydantic model in `schemas/*.py`
2. Add endpoint to appropriate router in `routers/*.py`
3. Use `Depends(get_db)` for database sessions

```python
# schemas/video.py
class UpdateVideoRequest(BaseModel):
    display_name: str | None = None

# routers/videos.py
@router.post("/videos/{video_id}/update")
async def update_video(video_id: int, request: UpdateVideoRequest, db: AsyncSession = Depends(get_db)):
    pass
```

### Sharing State Between Routers

```python
# In routers/roots.py
_thumbnail_db = None
def set_thumbnail_db(db): global _thumbnail_db; _thumbnail_db = db
def get_thumbnail_db(): return _thumbnail_db

# In main.py lifespan
from routers.roots import set_thumbnail_db
set_thumbnail_db(thumbnail_db)
```

### Path Validation

```python
full_path = Path(video_path).resolve()
if not str(full_path).startswith(str(config.root_directory)):
    raise HTTPException(status_code=403, detail="Access denied")
```

## Dependencies

### System Requirements

- **Python 3.12+** required
- **ffmpeg** required for thumbnails, metadata, video editing
- **yt-dlp** optional for M3U8/HLS downloads

### Frozen Packages (DO NOT UPGRADE)

Due to InsightFace compatibility:
```
onnxruntime==1.16.3
opencv-python==4.8.1.78
numpy==1.24.3
```

## Environment Variables

```bash
CLIPPER_ROOT_DIRECTORY="/path/to/videos"  # Fallback if no roots.json
CLIPPER_PORT=8000
CLIPPER_HOST="0.0.0.0"
CLIPPER_DEBUG=true
CLIPPER_RELOAD=true  # Enable auto-reload in debug mode
```

## Project Rules

- **Generate complete, production-ready code** - no snippets or partial examples
- **Output entire files** when making changes (unless explicitly asked for diff)
- **Never auto-generate README or .md files** unless explicitly requested
- **Never start, run, build, test, or debug** - leave execution to user
- **Ask before making assumptions** about missing requirements
- **Never generate tests** unless explicitly requested
- **Never add dependencies** without approval

## Troubleshooting

**Thumbnails not generating**: Check `ffmpeg -version`

**Videos not appearing**: Verify paths in `roots.json`, run scan

**Database errors**: Check write permissions in `{ROOT}/.clipper/`

**Deleted files still showing**: Use Actions menu → "🧹 Cleanup Database"

**Face recognition failing**: InsightFace models download to `~/.insightface/`
