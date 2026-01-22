# Multi-Root Configuration Guide

## Overview
Clipper now supports multiple root directories with per-root layout preferences. Each root can have its own layout (horizontal/vertical) and is automatically applied when switching roots.

## Configuration

### 1. Create/Update `roots.json`

Place the `roots.json` file in the application root directory (same level as `start.py`):

```json
{
  "roots": [
    {
      "name": "Videos",
      "path": "/path/to/videos",
      "default": true,
      "layout": "horizontal"
    },
    {
      "name": "Photos",
      "path": "/path/to/photos",
      "layout": "vertical"
    },
    {
      "name": "Archive",
      "path": "/path/to/archive",
      "layout": "horizontal"
    }
  ],
  "rememberLastRoot": true
}
```

### Configuration Options

- **name**: Display name for the root (shown in selector dropdown)
- **path**: Full path to the directory
- **default**: `true` for the default root on startup (only one should be marked true)
- **layout**: `"horizontal"` for grid view or `"vertical"` for vertical list view
- **rememberLastRoot**: `true` to remember last selected root, `false` to always use default

## Usage

### Starting the Application

1. **With roots.json** (recommended):
   ```bash
   python start.py
   ```
   The app will load roots from `roots.json`

2. **Fallback (no roots.json)**:
   ```bash
   export CLIPPER_ROOT_DIRECTORY=/path/to/videos
   python start.py
   ```
   Will create a default root from the environment variable

### Switching Roots in UI

1. Open the **Actions Menu** (☰ button)
2. Scroll down to the **Info Section**
3. Select a different root from the **Root:** dropdown
4. The app will:
   - Load all videos from the new root
   - Apply the configured layout automatically
   - Clear filters and reset to default view

## How It Works

### Backend (Python)

- **config.py**: 
  - Loads `roots.json` on startup
  - Manages active root switching
  - Updates database paths for each root
  - Each root has its own `.clipper/clipper.db` database

- **main.py**:
  - `GET /api/roots`: Returns list of all available roots and current active root
  - `POST /api/roots/select`: Switches to a different root

### Frontend (JavaScript)

- **app.js**:
  - `loadRoots()`: Fetches available roots from backend
  - `setupRootSelector()`: Creates dropdown in UI
  - `switchRoot()`: Handles root switching, applies layout, reloads data

- **index.html**: Root selector dropdown in actions menu info section

- **styles.css**: Styling for root selector

## Directory Structure

Each root maintains its own database:
```
/path/to/root/
├── video1.mp4
├── video2.mp4
└── .clipper/
    ├── clipper.db (database)
    └── Audios/ (audio files)
```

## Features

✅ Multiple independent roots with separate databases  
✅ Per-root layout preferences (horizontal/vertical)  
✅ Auto-apply layout when switching roots  
✅ Root selector in UI  
✅ Graceful fallback to environment variable  
✅ localStorage to remember selected root  

## API Endpoints

### Get Available Roots
```
GET /api/roots

Response:
{
  "roots": [
    {"name": "Videos", "path": "...", "default": true, "layout": "horizontal"},
    {"name": "Photos", "path": "...", "default": false, "layout": "vertical"}
  ],
  "current": {
    "path": "/path/to/videos",
    "layout": "horizontal"
  }
}
```

### Switch Root
```
POST /api/roots/select?root_name=Photos

Response:
{
  "success": true,
  "message": "Switched to root: Photos",
  "current": {
    "path": "/path/to/photos",
    "layout": "vertical"
  }
}
```

## Troubleshooting

**Problem**: Root selector not appearing
- **Solution**: Check that `roots.json` exists and has multiple roots

**Problem**: Layout not changing when switching roots
- **Solution**: Ensure layout is set in `roots.json` for each root

**Problem**: Videos not loading after switching
- **Solution**: Verify the path exists and is readable

## Migration from Environment Variable

If you're currently using `CLIPPER_ROOT_DIRECTORY`:

1. Create `roots.json` with your current path
2. (Optional) Remove the environment variable
3. Restart the application

The app will use `roots.json` if it exists, otherwise falls back to the env var.
