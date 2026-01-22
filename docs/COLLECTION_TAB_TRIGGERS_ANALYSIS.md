# Collection Tab Triggers & Default View Analysis

## Current Default Behavior
- **Default view on load**: `list` (Collection view)
- **Persisted in**: `localStorage` via `clipper_settings`
- **Button state**: Collection button has `.active` class by default in HTML

---

## ALL TRIGGERS THAT LOAD COLLECTION VIEW (List View)

### 1. **Initial App Load** (Primary Default)
- **Location**: [app.js#L14](app.js#L14)
- **Code**: `this.currentView = 'list';` (constructor)
- **Method**: `loadVideos()` [app.js#L386](app.js#L386)
- **Details**: 
  - On first page load, `currentView` is initialized to `'list'`
  - During `loadVideos()`, the saved view is restored via `loadSettingsFromStorage()`
  - If no saved view exists, defaults to `'list'`
  - Triggers: `this.switchView(savedView, !isRestoringState, false);` [app.js#L417](app.js#L417)

### 2. **Button Click: "📋 Collection" Button**
- **Location**: [app.js#L5918](app.js#L5918)
- **HTML Element**: `#listViewBtn`
- **Trigger**: `document.getElementById('listViewBtn').onclick = () => this.switchView('list');`
- **User Action**: Direct click by user

### 3. **After Scan Completion** (Auto-switch after folder scan)
- **Location**: [app.js#L7424](app.js#L7424)
- **Method**: `displayHierarchicalScanResult()`
- **Trigger**: Automatically switches to list view after scanning a folder
- **Code**: `this.switchView('list');`
- **Purpose**: Shows scanned videos immediately in collection view

### 4. **After Duplicate Review (Cancel)**
- **Location**: [app.js#L20264](app.js#L20264)
- **Method**: `exitDuplicateReview()`
- **Context**: When user exits duplicate review modal
- **Trigger**: `this.switchView('list', false);`
- **Restored State**: Restores previous filters and search

### 5. **After Video Edit in Pro Editor - Return from Explorer**
- **Location**: [app.js#L30628](app.js#L30628)
- **Method**: `exitProEditor()`
- **Context**: If user was in explorer view before opening pro editor
- **Condition**: Only if `previousViewState.view === 'list'`
- **Trigger**: `this.switchView('list');`

### 6. **After Legacy Video Editor Exit - Return from List View**
- **Location**: [app.js#L30743](app.js#L30743)
- **Method**: `exitVideoEditorView()`
- **Context**: If user was in list/collection view before opening video editor
- **Condition**: Only if `previousViewState.view !== 'explorer'`
- **Trigger**: `this.switchView('list');`

### 7. **Error Fallback** (Multiple locations)
- **Locations**: 
  - `loadVideos()` [app.js#L376](app.js#L376) - Sets to list if loading fails
  - Load error scenarios reset to `this.currentView = 'list'`

### 8. **Manual Search/Filter Reset**
- **Location**: Not explicit but happens through filter interactions
- **Note**: Remains on current view but list view is where search is most prominent

### 9. **Face/Tag Search Results**
- **Context**: When searching by tags or faces, results display in collection view
- **Method**: Results overlay collection view grid

---

## CURRENT HTML STRUCTURE

```html
<div class="view-toggle">
    <button id="listViewBtn" class="view-btn active" data-view="list">
        📋 Collection
    </button>
    <button id="explorerViewBtn" class="view-btn" data-view="explorer">
        📁 Explorer
    </button>
    <button id="seriesViewBtn" class="view-btn" data-view="series">
        📺 Series
    </button>
</div>

<div class="actions-menu-container">
    <button id="actionsMenuBtn" class="actions-menu-btn" title="Actions Menu">
        ☰
    </button>
    <div id="actionsMenu" class="actions-menu" style="display: none;">
        <!-- Current actions -->
    </div>
</div>
```

---

## PROPOSED CHANGES: Move Collection & Series to Action Menu

### Analysis & Considerations

#### ✅ **Advantages:**
1. **Cleaner UI**: Only one main view toggle button (Explorer as default)
2. **Explorer-centric**: Aligns with file browsing paradigm as primary interface
3. **Less visual clutter**: Top controls more minimal
4. **Context-sensitive**: Collection/Series could be sub-options under Actions
5. **Better organization**: Grouping related viewing modes together

#### ⚠️ **Challenges & Required Changes:**

1. **Default View Logic**
   - Change [app.js#L14](app.js#L14): `this.currentView = 'list'` → `this.currentView = 'explorer'`
   - Update [app.js#L397](app.js#L397): Fallback default from `'list'` → `'explorer'`
   - Update [app.js#L376](app.js#L376): Error fallback to `'explorer'`

2. **Default Button State**
   - Move `.active` class from `#listViewBtn` to `#explorerViewBtn` in HTML
   - Or dynamically add `.active` via JS on init

3. **Event Listeners**
   - Must convert from button `.onclick` to menu item `.onclick`
   - Create menu items for Collection and Series under Actions Menu
   - Keep view switching logic identical

4. **Visibility & Accessibility**
   - Menu items not immediately visible - users must click ☰ first
   - First-time users might not discover Collection/Series views
   - **Solution**: Add tooltip or keyboard shortcuts?

5. **Quick Access**
   - Current buttons allow 1-click view switching
   - Menu requires 2 clicks (open menu → select view)
   - **Mitigation**: Keyboard shortcuts (Ctrl+1, Ctrl+2, Ctrl+3 for views?)

6. **Auto-switch Triggers**
   - Must review all 9 triggers above
   - Most should switch to Explorer instead of List
   - **Scan completion** [app.js#L7424](app.js#L7424): Switch to `'explorer'` instead of `'list'`
   - **Return from editor**: Switch to `'explorer'` if coming from explorer

---

## IMPLEMENTATION CHECKLIST

### Phase 1: HTML Changes
- [ ] Remove Collection, Explorer, Series from main view-toggle
- [ ] Keep Explorer as single main button OR show only Explorer button
- [ ] Add "Collection" and "Series" menu items to Actions Menu
- [ ] Update button styling/spacing

### Phase 2: JavaScript Changes
- [ ] Change default `currentView` from `'list'` to `'explorer'` [L14]
- [ ] Update error fallback defaults [L376, L397]
- [ ] Create click handlers for new menu items
- [ ] Update all 9 trigger points to switch to `'explorer'` where appropriate

### Phase 3: UX Improvements
- [ ] Add keyboard shortcuts for view switching
- [ ] Consider "quick view" toggle next to Explorer button?
- [ ] Update help docs/tooltips

### Phase 4: Testing
- [ ] Test first load (should show Explorer)
- [ ] Test each menu item triggers correct view
- [ ] Test all 9 auto-switch scenarios
- [ ] Test localStorage persistence of view choice

---

## ALTERNATIVE: Hybrid Approach

**Option A: Keep Explorer + Hide Collection/Series**
- Explorer always visible as main
- Collection/Series in menu but less prominent
- Users can still switch quickly

**Option B: Add View Selector Dropdown**
- Instead of buttons: Single dropdown showing current view
- Click to open dropdown with 3 options
- Saves space, clear intent

**Option C: Tab Layout in Menu**
- Keep three buttons but move to sub-menu
- Show preview/indicator of which is selected
- More discovery-friendly than buried in menu

---

## SUMMARY

The **Collection view (list) is triggered 9 different ways**:
1. App initialization (default)
2. Collection button click
3. Scan completion
4. Duplicate review exit
5. Pro editor exit (if from explorer)
6. Legacy editor exit (if from list)
7. Error scenarios
8. Search/filter operations
9. Face/Tag result searches

**Moving to Action Menu is feasible but requires**:
- Changing default from `'list'` to `'explorer'`
- Updating ~15 code locations
- Adding menu items with click handlers
- Testing all auto-switch scenarios
- Considering UX (2-click vs 1-click)

**Recommendation**: Start with **Option C (Tab Layout in Menu)** - maintains discoverability while cleaning up main UI.
