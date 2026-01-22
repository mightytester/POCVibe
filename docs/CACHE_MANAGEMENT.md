# Cache Management & Root Switching

## Overview

When switching between root directories, the application must completely reset all cached data to ensure data isolation and prevent information from the previous root from appearing in the new root.

## Backend Caches

### 1. **Database Connection** ✅
- **Type**: SQLAlchemy AsyncEngine
- **Location**: `backend/database.py`
- **Current State**: Dynamically reinitialized on root switch
- **Clearing Strategy**: `init_database()` disposes old engine and creates new one
- **Triggered By**: `/api/roots/select` endpoint

```python
# When switching roots:
await init_database()  # Closes old connection, creates new one for current root's DB
```

### 2. **Thumbnail Database Cache** ✅
- **Type**: SQLite database connection (ThumbnailDatabase instance)
- **Location**: `backend/thumbnail_db.py`, `backend/main.py`
- **Current State**: Reinitialize and recreate tables on root switch
- **Clearing Strategy**: Create new ThumbnailDatabase instance for new root
- **Status**: DONE (line ~300 in main.py)

```python
# When switching roots:
thumbnail_db = ThumbnailDatabase(db_path=Path(config.database_path).parent / "thumbnails.db")
await thumbnail_db.create_tables()
```

### 3. **Face Service Model Cache** ✅ **NEW**
- **Type**: InsightFace ONNX model (loaded in memory)
- **Location**: `backend/face_service.py`
- **Current State**: Initialized once, never cleared
- **Issue**: Model remains in memory from previous root, no fresh start for new root
- **Clearing Strategy**: Reset `_initialized` flag and clear `app` reference
- **Status**: FIXED via `clear_all_caches()` function in main.py

```python
# When switching roots:
if face_service:
    face_service._initialized = False
    face_service.app = None
# Model will be lazily reloaded on next use
```

### 4. **Fingerprint Service** ✅
- **Type**: Stateless service (no caches)
- **Current State**: Fresh instance created per API call
- **Clearing Strategy**: No action needed (already fresh)
- **Status**: Verified stateless

### 5. **File Scanner** ✅
- **Type**: Stateless service (no persistent caches)
- **Current State**: Fresh instance created per API call
- **Clearing Strategy**: No action needed (already fresh)
- **Status**: Verified stateless

## Frontend Caches

### 1. **Video Lists** ✅
- **Variables**: `videos`, `allVideos`, `allVideosCatalog`, `displayedVideos`
- **Clearing**: Cleared in `switchRoot()` method

```javascript
this.videos = [];
this.allVideos = [];
this.allVideosCatalog = [];
this.displayedVideos = [];
```

### 2. **Selection & Pagination** ✅
- **Variables**: `selectedVideos`, `currentPage`, `scrollPositions`, `itemsPerPage`
- **Clearing**: Reset in `switchRoot()` method

```javascript
this.selectedVideos.clear();
this.currentPage = 0;
this.scrollPositions = {};
this.itemsPerPage = 50;
```

### 3. **Modal State** ✅
- **Variables**: `currentVideoInPlayer` + modal visibility
- **Clearing**: Closed and cleared in `switchRoot()` method

```javascript
this.currentVideoInPlayer = null;
this.hideVideoPlayerModal();
this.hideMoveVideoPlayerModal();
this.hideTagVideoPlayerModal();
```

### 4. **Tag & Actor Cache** ✅
- **Variables**: `tagCache`, `actorCache`
- **Clearing**: Reset in `switchRoot()` method

```javascript
this.tagCache = {};
this.actorCache = {};
```

### 5. **Filter State** ✅
- **Variables**: `filterTag`, `filterActor`, `currentCategory`, `currentSubcategory`
- **Clearing**: Reset in `switchRoot()` method

```javascript
this.filterTag = null;
this.filterActor = null;
this.currentCategory = null;
this.currentSubcategory = null;
```

### 6. **Layout & View State** ✅
- **Variables**: `currentView`, `verticalMode`, `sortBy`
- **Clearing**: Reset before applying new layout in `switchRoot()` method

```javascript
this.currentView = 'list';
this.verticalMode = false;
this.sortBy = null;
```

## Cache Clearing Flow

### On Root Switch (`/api/roots/select`):

1. **Backend**:
   ```
   clear_all_caches()
   ↓
   - Close old DB connection
   - Reset face service (model + initialization flag)
   ↓
   config.set_active_root_by_name(rootName)
   ↓
   init_database()
   ↓
   ThumbnailDatabase.reinitialize()
   ```

2. **Frontend** (in `switchRoot()`):
   ```
   Clear video lists
   Clear selections & pagination
   Close modals
   Clear tag/actor cache
   Clear filters
   Reset view state
   ↓
   Apply layout from new root
   ↓
   loadVideos() from new root
   loadAllTags() from new root
   loadCategory('_all')
   ```

## Verification Checklist

When testing root switching, verify:

- [ ] **Videos from old root don't appear** when viewing new root
- [ ] **Tags are specific to new root** (not mixed with old root's tags)
- [ ] **Actors are specific to new root** (face database isolated)
- [ ] **Thumbnails load correctly** (from new root's cache)
- [ ] **Layout preference applies** (horizontal/vertical per root)
- [ ] **No modal popups** appear from previous view
- [ ] **Selection state is clear** (nothing selected in new root)
- [ ] **Search/filter reset** (no previous filters applied)
- [ ] **Pagination reset** (back to page 1, default items per page)

## Per-Root Configuration

Each root has its own:

```
/path/to/root/
├── .clipper/
│   ├── clipper.db              # Database for videos, tags, actors
│   ├── fingerprints.db         # Face recognition data
│   ├── thumbnails.db           # Thumbnail metadata cache
│   └── [media folders]/        # Thumbnails for videos
├── config.json                  # Root-specific layout preference
└── [Videos, Images, etc.]      # Media files
```

**Important**: Each root is completely independent. Switching roots means:
- ✅ New database connection
- ✅ New face model state
- ✅ New thumbnail cache
- ✅ New file listing
- ✅ New layout preference

## Backend Cache Functions

### `clear_all_caches()` (main.py)

```python
async def clear_all_caches():
    """Clear all backend caches when switching roots"""
    global thumbnail_db, face_service
    
    # Close thumbnail database
    if thumbnail_db:
        if hasattr(thumbnail_db, 'engine'):
            await thumbnail_db.engine.dispose()
    
    # Reset face service model
    if face_service:
        face_service._initialized = False
        face_service.app = None
```

**Called Before**: `config.set_active_root_by_name()`

### `init_database()` (database.py)

```python
async def init_database():
    """Initialize/reinitialize engine for current root"""
    global engine, AsyncSessionLocal
    
    # Close old engine
    if engine:
        await engine.dispose()
    
    # Create new engine for current root
    engine = create_async_engine(get_database_url(), echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
```

## Frontend Cache Functions

### `switchRoot(rootName)` (app.js)

```javascript
async switchRoot(rootName) {
    // 1. Call API to switch root (triggers clear_all_caches on backend)
    // 2. Clear all frontend caches
    // 3. Apply new layout
    // 4. Reload videos and tags
}
```

## Troubleshooting

**Problem**: Old root's videos still visible after switch
**Solution**: Check that `allVideosCatalog` is cleared before `loadVideos()`

**Problem**: Face recognition returns matches from old root
**Solution**: Verify `face_service._initialized = False` is being set

**Problem**: Tags show mixed from both roots
**Solution**: Ensure `loadAllTags()` is called AFTER database is reinitialized

**Problem**: Layout doesn't change when switching to different root
**Solution**: Check `config.current_root_layout` is set correctly by `set_active_root_by_name()`

## Future Improvements

- [ ] Add logging for each cache clear operation
- [ ] Add metrics for cache sizes before/after clear
- [ ] Consider preloading models for faster root switches
- [ ] Add cache warming for frequently accessed data
