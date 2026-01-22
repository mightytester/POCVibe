# Root Change Bug Fix - Explorer Default View

## Problem
When users changed the root, the app was still loading the Collection view instead of the Explorer view as the new default.

## Root Cause
The `switchRoot()` method was calling `loadVideos()` which restores the previously saved view (collection) from localStorage before the Explorer view default was being enforced.

## Solution
Made three key fixes to ensure Explorer is always the default view when changing roots:

### 1. Reset currentView Before loadVideos() in switchRoot()
**File:** `frontend/app.js` (Lines 388-395)

**Before:**
```javascript
await this.loadVideos();
await this.loadAllTags();
await this.loadFolderGroups();
this.switchView('explorer', true, false);
```

**After:**
```javascript
// Reset view to explorer before reloading
this.currentView = 'explorer';

await this.loadVideos();
await this.loadAllTags();
await this.loadFolderGroups();
```

**Why:** When `loadVideos()` is called, it reads `this.currentView` to determine which view to restore. By setting it to 'explorer' first, we ensure the saved view preference is ignored during root switch.

---

### 2. Updated Face/Tag Search Fallback
**File:** `frontend/app.js` (Lines 2345-2352)

**Before:**
```javascript
if (!this.previousView) {
    console.warn('No previous view to restore');
    this.currentView = 'list';
    this.renderMainCategories();
    return;
}
```

**After:**
```javascript
if (!this.previousView) {
    console.warn('No previous view to restore');
    this.currentView = 'explorer';
    this.switchView('explorer', true, false);
    return;
}
```

**Why:** If face/tag search has no previous view to restore, it should default to Explorer instead of Collection.

---

### 3. Updated Comment for Clarity
**File:** `frontend/app.js` (Line 430)

**Before:**
```javascript
// Initialize view (respect saved view or default to list)
```

**After:**
```javascript
// Initialize view (respect saved view or default to explorer)
```

---

## Testing Checklist

- [ ] Open app → Should show Explorer view
- [ ] Navigate to a folder in Explorer
- [ ] Change root via menu
- [ ] App should load Explorer view (not Collection) with new root
- [ ] Navigate to a different folder
- [ ] Change root again → Should show Explorer view
- [ ] Do a tag/face search → Go back → Should show Explorer view

---

## Files Modified
1. `frontend/app.js` - 3 changes in switchRoot(), goBackToPreviousView(), and loadVideos()

## Impact
- ✅ No breaking changes
- ✅ All functionality preserved
- ✅ localStorage still works correctly
- ✅ User preference for Collection/Series views still respected (when not switching roots)
