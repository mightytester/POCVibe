/**
 * NavigationModule - Handles navigation, breadcrumbs, folder explorer, and folder groups
 *
 * Manages:
 * - Navigation between folders and categories
 * - Breadcrumb UI and navigation
 * - Folder explorer rendering (main categories, folder cards, groups)
 * - Folder menu (context menu for folders)
 * - Folder group management (create, edit, delete, reorder)
 * - Scroll position preservation during navigation
 *
 * Usage:
 *   const navModule = new NavigationModule(app);
 *   navModule.navigateToCategory('SomeFolder');
 */

class NavigationModule {
    constructor(app) {
        this.app = app;
    }

    // ============================================================================
    // NAVIGATION CORE - Navigate between folders and load videos
    // ============================================================================

    navigateToCategory(category) {
        console.log(`🧭 Navigating to category: "${category}"`);

        // Save scroll position for current view before navigating
        const saveViewKey = `explorer_${this.app.currentCategory || '_root'}_${this.app.currentSubcategory || ''}`;
        const folderExplorer = document.getElementById('folderExplorer');
        const videoGrid = document.getElementById('videoGrid');

        console.log(`💾 Saving scroll position for key: ${saveViewKey}`);

        // Save scroll position from whichever element is currently visible
        if (folderExplorer && folderExplorer.style.display !== 'none') {
            this.app.scrollPositions[saveViewKey] = folderExplorer.parentElement?.scrollTop || 0;
            console.log(`💾 Saved folderExplorer scroll: ${this.app.scrollPositions[saveViewKey]}px`);
        } else if (videoGrid && videoGrid.style.display !== 'none') {
            this.app.scrollPositions[saveViewKey] = videoGrid.parentElement?.scrollTop || 0;
            console.log(`💾 Saved videoGrid scroll: ${this.app.scrollPositions[saveViewKey]}px`);
        }

        this.app.currentCategory = category;
        this.app.currentSubcategory = null;

        if (this.app.currentView === 'explorer') {
            // Show folder explorer and hide video grid
            folderExplorer.style.display = 'block';
            videoGrid.style.display = 'none';

            this.renderFolderExplorer();
            this.renderBreadcrumb();

            // Restore scroll position after rendering
            setTimeout(() => {
                const restoreViewKey = `explorer_${category || '_root'}_`;
                const savedScroll = this.app.scrollPositions[restoreViewKey];
                console.log(`🔍 Looking for restore key: ${restoreViewKey}, found scroll: ${savedScroll}`);
                console.log(`📋 All saved keys:`, Object.keys(this.app.scrollPositions));
                if (savedScroll !== undefined && folderExplorer?.parentElement) {
                    folderExplorer.parentElement.scrollTop = savedScroll;
                    console.log(`↩️ Restored scroll position for ${restoreViewKey}: ${savedScroll}px`);
                }
            }, 50);
        } else {
            // In list view, this should load the specific category
            // But since list view shows ALL videos, we don't use this in list view
            this.app.loadCategory(category || '_all');
        }
    }

    async navigateToSubcategory(category, subcategory) {
        console.log(`🧭 Navigating to subcategory: category="${category}", subcategory="${subcategory}"`);

        // Save scroll position for current view before navigating
        const saveViewKey = `explorer_${this.app.currentCategory || '_root'}_${this.app.currentSubcategory || ''}`;
        const folderExplorer = document.getElementById('folderExplorer');
        const videoGrid = document.getElementById('videoGrid');

        console.log(`💾 Saving scroll position for key: ${saveViewKey}`);

        // Save scroll position from whichever element is currently visible
        if (folderExplorer && folderExplorer.style.display !== 'none') {
            this.app.scrollPositions[saveViewKey] = folderExplorer.parentElement?.scrollTop || 0;
            console.log(`💾 Saved folderExplorer scroll: ${this.app.scrollPositions[saveViewKey]}px`);
        } else if (videoGrid && videoGrid.style.display !== 'none') {
            this.app.scrollPositions[saveViewKey] = videoGrid.parentElement?.scrollTop || 0;
            console.log(`💾 Saved videoGrid scroll: ${this.app.scrollPositions[saveViewKey]}px`);
        }

        this.app.currentCategory = category;
        this.app.currentSubcategory = subcategory;

        if (this.app.currentView === 'explorer') {
            this.renderBreadcrumb();
            await this.loadAndShowVideosInFolder(category, subcategory);

            // Restore scroll position after loading
            setTimeout(() => {
                const restoreViewKey = `explorer_${category}_${subcategory || ''}`;
                const savedScroll = this.app.scrollPositions[restoreViewKey];
                console.log(`🔍 Looking for restore key: ${restoreViewKey}, found scroll: ${savedScroll}`);
                console.log(`📋 All saved keys:`, Object.keys(this.app.scrollPositions));
                if (savedScroll !== undefined && videoGrid?.parentElement) {
                    videoGrid.parentElement.scrollTop = savedScroll;
                    console.log(`↩️ Restored scroll position for ${restoreViewKey}: ${savedScroll}px`);
                }
            }, 100);
        } else {
            await this.app.loadCategory(category, subcategory);
        }
    }

    async loadAndShowVideosInFolder(category, subcategory, skipCache = false) {
        try {
            // Hide folder explorer and show video grid for video display
            document.getElementById('folderExplorer').style.display = 'none';
            document.getElementById('videoGrid').style.display = 'grid';

            console.log(`🎬 Loading videos: category="${category}", subcategory="${subcategory || '(none)'}"`);

            // Build the API path
            let apiPath = `${this.app.apiBase}/videos/${category}`;
            if (subcategory) {
                apiPath += `/${subcategory}`;
            }

            // Add cache busting if requested
            if (skipCache) {
                apiPath += `?t=${Date.now()}&bust=${Math.random()}`;
            }

            const data = await this.app.api.getVideos(category, subcategory, skipCache);
            this.app.videos = data.videos || [];

            // ✅ CRITICAL: Set allVideos too so filtering/face detection works in folder view
            this.app.allVideos = this.app.videos;

            console.log(`✅ Loaded ${this.app.videos.length} videos from ${category}${subcategory ? '/' + subcategory : ''}`);

            // Reset pagination and render
            this.app.currentPage = 0;
            this.app.displayedVideos = [];
            this.app.renderVideoGrid();

            // Show video count in status
            console.log(`📊 Showing ${this.app.videos.length} videos in ${category}${subcategory ? '/' + subcategory : ''}`);

        } catch (error) {
            console.error('❌ Error loading folder videos:', error);
            console.log('Failed to load folder videos. Please try refreshing.')
        }
    }

    async loadVideosInFolder(category, subcategory) {
        try {
            console.log(`📂 Loading videos in folder: ${category}/${subcategory || '(root)'}`);

            // Hide folder explorer and show video grid
            document.getElementById('folderExplorer').style.display = 'none';
            document.getElementById('videoGrid').style.display = 'grid';

            const data = await this.app.api.getVideos(category, subcategory, true);

            this.app.videos = data.videos || [];
            // ✅ IMPORTANT: Set allVideos too so face filtering works in folder view
            this.app.allVideos = this.app.videos;

            console.log(`📊 Loaded ${this.app.videos.length} videos from ${category}/${subcategory}`);

            // Reset pagination and render
            this.app.currentPage = 0;
            this.app.displayedVideos = [];
            this.app.renderVideoGrid();

        } catch (error) {
            console.error('❌ Error loading folder videos:', error);
            console.log('Failed to load folder videos')
        }
    }

    // ============================================================================
    // BREADCRUMB UI - Navigation breadcrumbs
    // ============================================================================

    updateBreadcrumb(categoryName, subcategoryName) {
        this.app.breadcrumb = [];

        if (categoryName && categoryName !== '_all') {
            this.app.breadcrumb.push({
                name: categoryName,
                category: categoryName,
                subcategory: null
            });

            if (subcategoryName) {
                this.app.breadcrumb.push({
                    name: subcategoryName,
                    category: categoryName,
                    subcategory: subcategoryName
                });
            }
        }

        this.renderBreadcrumb();
    }

    renderBreadcrumb() {
        const container = document.getElementById('breadcrumbNav');
        let html = '';

        if (this.app.currentView === 'explorer') {
            // Root level
            html += `<span class="breadcrumb-item clickable" onclick="app.nav.navigateToCategory(null)">📁 All Folders</span>`;

            if (this.app.currentCategory) {
                html += `<span class="breadcrumb-separator"> / </span>`;
                html += `<span class="breadcrumb-item clickable" onclick="app.nav.navigateToCategory('${this.app.currentCategory}')">${this.app.currentCategory}</span>`;

                if (this.app.currentSubcategory) {
                    // Handle nested subcategories by splitting the path
                    const subcategoryParts = this.app.currentSubcategory.split('/');
                    let currentPath = '';

                    subcategoryParts.forEach((part, index) => {
                        currentPath = currentPath ? `${currentPath}/${part}` : part;
                        const isLast = index === subcategoryParts.length - 1;

                        html += `<span class="breadcrumb-separator"> / </span>`;

                        if (isLast) {
                            // Last part is not clickable (current location)
                            html += `<span class="breadcrumb-item current">${part}</span>`;
                        } else {
                            // Intermediate parts are clickable
                            html += `<span class="breadcrumb-item clickable" onclick="app.nav.navigateToSubcategory('${this.app.currentCategory}', '${currentPath}')">${part}</span>`;
                        }
                    });
                }
            }
        }

        container.innerHTML = html;
    }

    createBreadcrumbContainer() {
        const container = document.createElement('div');
        container.id = 'breadcrumb';
        container.className = 'breadcrumb-navigation';

        // Insert breadcrumb before the video grid
        const videoGrid = document.getElementById('videoGrid');
        videoGrid.parentNode.insertBefore(container, videoGrid);

        return container;
    }

    // ============================================================================
    // FOLDER EXPLORER RENDERING - Main folder view
    // ============================================================================

    renderFolderExplorer() {
        if (this.app.currentCategory && this.app.currentSubcategory) {
            // Inside a subfolder - show folder contents
            this.renderFolderContents();
        } else if (this.app.currentCategory) {
            // Inside a category folder but not in a subfolder
            this.renderFolderContents();
        } else {
            // Root level - show all main categories/folders
            this.renderMainCategories();
        }
    }

    renderMainCategories() {

        const container = document.getElementById('folderExplorer');

        if (!container) {
            console.error('❌ folderExplorer container not found');
            return;
        }

        // Get all physical folders from folder structure
        let physicalFolders = [];
        if (this.app.folderStructure?.all_folders && Array.isArray(this.app.folderStructure.all_folders)) {
            physicalFolders = this.app.folderStructure.all_folders;
        }

        // Sort folders alphabetically (A-Z)
        physicalFolders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

        // console.log('📊 Physical folders found:', physicalFolders);


        // Add header with refresh button
        let html = `
            <div class="explorer-header" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px;">
                <span class="current-folder" style="font-size: 16px; font-weight: 600; color: #111827;">📁 All Folders</span>
                <div style="display: flex; gap: 8px;">
                    <button class="create-group-btn" onclick="app.nav.showCreateGroupDialog()" title="Create a new folder group" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                        ➕ Group
                    </button>
                    <button class="refresh-folder-btn" onclick="app.nav.forceRefreshFolderList()" title="Refresh folder list from disk" style="padding: 6px 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                        🔄 Refresh
                    </button>
                </div>
            </div>
        `;

        html += '<div class="folder-browser">';

        // Track which folders have been rendered (to avoid duplicates)
        const renderedFolders = new Set();

        // Render folder groups if available
        if (this.app.folderGroups && this.app.folderGroups.length > 0) {
            this.app.folderGroups.forEach(group => {
                html += `
                    <div class="folder-group" style="grid-column: 1 / -1;">
                        <div class="group-header" style="
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            padding: 12px 16px;
                            background: ${group.color || '#f3f4f6'};
                            border-radius: 6px;
                            margin-bottom: 12px;
                            font-weight: 600;
                            color: #111827;
                            justify-content: space-between;
                        ">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span>${group.icon || '📁'}</span>
                                <span>${group.name}</span>
                            </div>
                            <div style="display: flex; gap: 4px;">
                                <button
                                    onclick="app.nav.refreshFolderGroup('${group.id}')"
                                    title="Refresh all folders in this group"
                                    style="
                                        padding: 4px 8px;
                                        background: rgba(255, 255, 255, 0.9);
                                        border: 1px solid rgba(0, 0, 0, 0.1);
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 12px;
                                    "
                                >
                                    🔄
                                </button>
                                <button
                                    onclick="app.nav.reorderGroup('${group.id}', 'up')"
                                    title="Move group up"
                                    style="
                                        padding: 4px 8px;
                                        background: rgba(255, 255, 255, 0.9);
                                        border: 1px solid rgba(0, 0, 0, 0.1);
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 12px;
                                    "
                                >
                                    ▲
                                </button>
                                <button
                                    onclick="app.nav.reorderGroup('${group.id}', 'down')"
                                    title="Move group down"
                                    style="
                                        padding: 4px 8px;
                                        background: rgba(255, 255, 255, 0.9);
                                        border: 1px solid rgba(0, 0, 0, 0.1);
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 12px;
                                    "
                                >
                                    ▼
                                </button>
                                <button
                                    onclick="app.nav.showEditGroupDialog('${group.id}')"
                                    title="Edit group"
                                    style="
                                        padding: 4px 8px;
                                        background: rgba(255, 255, 255, 0.9);
                                        border: 1px solid rgba(0, 0, 0, 0.1);
                                        border-radius: 4px;
                                        cursor: pointer;
                                        font-size: 12px;
                                    "
                                >
                                    ✏️
                                </button>
                            </div>
                        </div>
                        <div class="folder-group-content" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px;">
                `;

                // Render folders in this group
                group.folders.forEach(folderName => {
                    const isSystemFolder = ['NEW', 'REVIEW', 'DELETE'].includes(folderName);
                    html += this.renderFolderWithScanControl(folderName, isSystemFolder);
                    renderedFolders.add(folderName);
                });

                html += `
                        </div>
                    </div>
                `;
            });
        }

        // Render ungrouped folders in "Other Folders" section
        const ungroupedFolders = physicalFolders.filter(f => !renderedFolders.has(f));

        if (ungroupedFolders.length > 0) {
            html += `
                <div class="folder-group" style="grid-column: 1 / -1;">
                    <div class="group-header" style="
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        padding: 12px 16px;
                        background: #f9fafb;
                        border-radius: 6px;
                        margin-bottom: 12px;
                        font-weight: 600;
                        color: #6b7280;
                    ">
                        <span>📂</span>
                        <span>Other Folders</span>
                    </div>
                    <div class="folder-group-content" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
            `;

            ungroupedFolders.forEach(folderName => {
                const isSystemFolder = ['NEW', 'REVIEW', 'DELETE'].includes(folderName);
                html += this.renderFolderWithScanControl(folderName, isSystemFolder);
            });

            html += `
                    </div>
                </div>
            `;
        }

        html += '</div>'; // Close folder-browser

        container.innerHTML = html;
    }

    renderFolderContents() {
        const container = document.getElementById('folderExplorer');

        // Get video count from scanStatus (which is loaded from /scan/status endpoint)
        const scanInfo = this.app.scanStatus?.[this.app.currentCategory];
        const videoCount = scanInfo?.video_count || 0;

        console.log(`📂 renderFolderContents: category="${this.app.currentCategory}", videoCount=${videoCount}`);

        // If folder has videos, load and show them directly
        // This uses the /videos/{category} API endpoint which works correctly
        if (videoCount > 0) {
            this.loadAndShowVideosInFolder(this.app.currentCategory, null);
            return; // Let loadAndShowVideosInFolder handle the rendering
        }

        // If no videos, show empty state with back button
        let html = '<div class="explorer-list">';

        // Add back button and refresh button
        html += `
            <div class="explorer-header">
                <button class="back-btn" onclick="app.nav.navigateToCategory(null)">← Back</button>
                <span class="current-folder">📁 ${this.app.currentCategory}</span>
                <button class="refresh-folder-btn" onclick="app.forceRefreshCurrentFolder()" title="Force refresh folder from disk">
                    🔄 Refresh
                </button>
            </div>
        `;

        html += '<div class="no-videos">No videos found in this folder</div>';
        html += '</div>';
        container.innerHTML = html;
    }

    getSubfolderVideoCount(folderData) {
        let count = folderData.video_count || 0;
        if (folderData.subfolders) {
            Object.values(folderData.subfolders).forEach(subfolder => {
                count += this.getSubfolderVideoCount(subfolder);
            });
        }
        return count;
    }

    renderFolderWithScanControl(folderName, isSystemFolder = false) {
        const scanStatus = this.app.scanStatus[folderName];
        const isScanned = scanStatus?.is_scanned || false;
        const videoCount = scanStatus?.video_count || 0;
        const lastScanned = scanStatus?.last_scanned;

        // Get unique glassy color for this folder
        const bgColor = this.app.format.getFolderColor(folderName, 'background');
        const borderColor = this.app.format.getFolderColor(folderName, 'border');

        // Add system-folder class if this is a system folder (NEW, REVIEW, DELETE)
        const systemFolderClass = isSystemFolder ? ' system-folder' : '';

        // Fingerprint status removed for performance optimization
        let fpStatusClass = 'fp-none';

        if (isScanned) {
            // Scanned folder - modern card with stats
            const scanDate = lastScanned ? new Date(lastScanned * 1000).toLocaleString() : 'Unknown';

            return `
                <div class="folder-card-modern scanned ${fpStatusClass}${systemFolderClass}" onclick="app.nav.navigateToCategory('${folderName}')" title="Last scanned: ${scanDate}" style="background: ${bgColor}; border-color: ${borderColor};">
                    <div class="folder-header">
                        <div class="folder-name-large">${folderName}</div>
                    </div>
                    <div class="folder-menu-trigger" onclick="event.stopPropagation(); app.nav.showFolderMenu(event, '${folderName}', true)" title="Folder options">
                        <span class="menu-dots">⋯</span>
                    </div>

                    <!-- Fingerprint progress removed for speed -->

                    <div class="folder-stats-row" style="display: flex; flex-direction: column; gap: 8px; justify-content: flex-start; align-items: flex-start;">
                        <div class="folder-stat" style="display: flex; align-items: center; gap: 6px; justify-content: flex-start;">
                            <span class="stat-icon">📹</span>
                            <span class="stat-value">${videoCount}</span>
                            <span class="stat-label">videos</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Unscanned folder - simplified card
            return `
                <div class="folder-card-modern unscanned${systemFolderClass}" onclick="event.stopPropagation()" title="Not scanned yet" style="background: ${bgColor}; border-color: ${borderColor};">
                    <div class="folder-header">
                        <div class="folder-name-large">${folderName}</div>
                    </div>
                    <div class="folder-menu-trigger" onclick="event.stopPropagation(); app.nav.showFolderMenu(event, '${folderName}', false)" title="Scan options">
                        <span class="menu-dots">⋯</span>
                    </div>

                    <div class="folder-unscanned-message">
                        <span class="unscanned-icon">🔍</span>
                        <span class="unscanned-text">Not scanned yet</span>
                    </div>
                </div>
            `;
        }
    }

    // ============================================================================
    // FOLDER MENU - Context menu for folders
    // ============================================================================

    showFolderMenu(event, folderName, isScanned) {
        // Close any existing menu
        this.hideFolderMenu();

        const menuHtml = this.createFolderMenu(folderName, isScanned);

        // Create menu element
        const menu = document.createElement('div');
        menu.id = 'folderContextMenu';
        menu.className = 'folder-context-menu';
        menu.innerHTML = menuHtml;

        // Position menu near the click - handle both folder-menu-trigger and folder-card
        const trigger = event.target.closest('.folder-menu-trigger') || event.target.closest('.folder-card');
        const rect = trigger?.getBoundingClientRect() || { bottom: event.clientY, right: event.clientX };

        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;

        // Add to body
        document.body.appendChild(menu);

        // Adjust position if menu would go off screen
        const menuRect = menu.getBoundingClientRect();
        let top = rect.bottom + 5;
        let right = window.innerWidth - rect.right;
        let left = undefined;

        // Check if menu goes off bottom of screen
        if (menuRect.bottom > window.innerHeight - 10) {
            // Position above the button instead
            top = Math.max(10, rect.top - menuRect.height - 5);
        }

        // Check if menu goes off left side (when right-aligned)
        if (menuRect.left < 10) {
            // Switch to left alignment
            right = 'auto';
            left = Math.max(10, rect.left);
        }

        // Check if menu goes off right side (when left-aligned)
        if (left !== undefined && (left + menuRect.width > window.innerWidth - 10)) {
            left = Math.max(10, window.innerWidth - menuRect.width - 10);
        }

        // Add max-height to ensure menu is scrollable if needed
        const maxHeight = window.innerHeight - Math.max(top, 10) - 10;
        if (maxHeight < menuRect.height) {
            menu.style.maxHeight = `${maxHeight}px`;
            menu.style.overflowY = 'auto';
        }

        menu.style.top = `${top}px`;
        if (right !== 'auto') {
            menu.style.right = `${right}px`;
        } else {
            menu.style.right = 'auto';
        }
        if (left !== undefined) {
            menu.style.left = `${left}px`;
        }

        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.handleMenuClickOutside.bind(this), { once: true });
        }, 0);
    }

    createFolderMenu(folderName, isScanned) {
        const scanStatus = this.app.scanStatus[folderName];
        const videoCount = scanStatus?.video_count || 0;

        let menuItems = '';

        if (isScanned) {
            // Scanned folder options
            menuItems = `
                <div class="menu-item" onclick="app.smartRefreshFolder('${folderName}')">
                    <span class="menu-icon">⚡</span>
                    <span class="menu-text">Smart Refresh (Scan + Thumbnails)</span>
                </div>
                <div class="menu-item" onclick="app.showRenameFolderModal('${folderName}')">
                    <span class="menu-icon">📝</span>
                    <span class="menu-text">Rename Folder</span>
                </div>
                <div class="menu-separator"></div>
                <div class="menu-item" onclick="app.loadMetadataForFolderFromMenu('${folderName}')">
                    <span class="menu-icon">📊</span>
                    <span class="menu-text">Load Metadata</span>
                </div>
                <div class="menu-item" onclick="app.openBulkEditForFolder('${folderName}')">
                    <span class="menu-icon">✏️</span>
                    <span class="menu-text">Bulk Edit Videos</span>
                </div>
                <div class="menu-item" onclick="app.findDuplicatesInFolder('${folderName}')">
                    <span class="menu-icon">🔍</span>
                    <span class="menu-text">Find Duplicates (Within Folder)</span>
                </div>
                <div class="menu-item" onclick="app.autoScanFacesInFolder('${folderName}')">
                    <span class="menu-icon">🔍👤</span>
                    <span class="menu-text">Auto-Scan Faces (All Videos)</span>
                </div>
                <div class="menu-item" onclick="app.autoScanFacesInFolder('${folderName}', 3)">
                    <span class="menu-icon">⚡👤</span>
                    <span class="menu-text">Auto-Scan Faces (Fast - First 3s)</span>
                </div>
                <div class="menu-separator"></div>
                <div class="menu-item" onclick="app.showBulkHashRenameModal('${folderName}')">
                    <span class="menu-icon">🔤</span>
                    <span class="menu-text">Hash-Based Rename (zRename)</span>
                </div>
                <div class="menu-separator"></div>
                <div class="menu-item" onclick="app.generateFolderFingerprints('${folderName}')">
                    <span class="menu-icon">🔒</span>
                    <span class="menu-text">Generate Fingerprints</span>
                </div>
                <div class="menu-separator"></div>
                <div class="menu-item" onclick="app.markFolderAsImages('${folderName}')">
                    <span class="menu-icon">🖼️</span>
                    <span class="menu-text">Mark Folder as Images</span>
                </div>
            `;
        } else {
            // Unscanned folder options
            menuItems = `
                <div class="menu-item" onclick="app.smartRefreshFolder('${folderName}')">
                    <span class="menu-icon">⚡</span>
                    <span class="menu-text">Scan Folder</span>
                </div>
            `;
        }

        return menuItems;
    }

    hideFolderMenu() {
        const existingMenu = document.getElementById('folderContextMenu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }

    handleMenuClickOutside(event) {
        const menu = document.getElementById('folderContextMenu');
        if (menu && !menu.contains(event.target)) {
            this.hideFolderMenu();
        }
    }

    // ============================================================================
    // FOLDER GROUP MANAGEMENT - Create, edit, delete, reorder groups
    // ============================================================================

    showCreateGroupDialog() {
        /**
         * Show dialog to create a new folder group
         */
        // Get available folders (those not yet in groups)
        const usedFolders = new Set();
        if (this.app.folderGroups) {
            this.app.folderGroups.forEach(group => {
                if (group.folders && Array.isArray(group.folders)) {
                    group.folders.forEach(f => usedFolders.add(f));
                }
            });
        }

        const availableFolders = Object.keys(this.app.scanStatus || {})
            .filter(f => !usedFolders.has(f))
            .sort();

        // Build HTML for folder checkboxes
        const folderCheckboxes = availableFolders.map(folder => `
            <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer;">
                <input type="checkbox" value="${folder}" class="group-folder-checkbox" style="cursor: pointer;">
                <span>${folder}</span>
            </label>
        `).join('');

        // Create modal HTML
        const modalHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            " id="groupModal" onclick="if(event.target.id==='groupModal') app.nav.closeGroupDialog();">
                <div style="
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 25px rgba(0,0,0,0.15);
                " onclick="event.stopPropagation();">
                    <h3 style="margin-top: 0; margin-bottom: 20px; color: #111827;">
                        📁 Create New Folder Group
                    </h3>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; margin-bottom: 6px; color: #374151;">
                            Group Name
                        </label>
                        <input
                            type="text"
                            id="groupNameInput"
                            placeholder="e.g., Favorites, Pending Review, etc."
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 14px;
                                box-sizing: border-box;
                            "
                        >
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; margin-bottom: 8px; color: #374151;">
                            Icon (optional)
                        </label>
                        <input
                            type="text"
                            id="groupIconInput"
                            placeholder="e.g., ⭐, 📌, 🎬"
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 14px;
                                box-sizing: border-box;
                            "
                        >
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; margin-bottom: 8px; color: #374151;">
                            Color (optional)
                        </label>
                        <input
                            type="color"
                            id="groupColorInput"
                            value="#f3f4f6"
                            style="
                                width: 60px;
                                height: 40px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                cursor: pointer;
                            "
                        >
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 500; margin-bottom: 8px; color: #374151;">
                            Select Folders
                        </label>
                        <div style="
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            max-height: 250px;
                            overflow-y: auto;
                            padding: 8px;
                            background: #f9fafb;
                        ">
                            ${folderCheckboxes || '<div style="padding: 12px; color: #6b7280; text-align: center;">No available folders</div>'}
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button
                            onclick="app.nav.closeGroupDialog()"
                            style="
                                padding: 10px 16px;
                                background: #e5e7eb;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            "
                        >
                            Cancel
                        </button>
                        <button
                            onclick="app.nav.submitCreateGroup()"
                            style="
                                padding: 10px 16px;
                                background: #3b82f6;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            "
                        >
                            Create Group
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existing = document.getElementById('groupModal');
        if (existing) existing.remove();

        // Create and show modal
        const modal = document.createElement('div');
        modal.innerHTML = modalHTML;
        document.body.appendChild(modal.firstElementChild);

        // Focus on group name input
        document.getElementById('groupNameInput').focus();
    }

    closeGroupDialog() {
        /**
         * Close the folder group creation dialog
         */
        const modal = document.getElementById('groupModal');
        if (modal) modal.remove();
    }

    async submitCreateGroup() {
        /**
         * Submit the create group form
         */
        const name = document.getElementById('groupNameInput')?.value?.trim();
        const icon = document.getElementById('groupIconInput')?.value?.trim() || '📁';
        const color = document.getElementById('groupColorInput')?.value || '#f3f4f6';

        // Get selected folders
        const checkboxes = document.querySelectorAll('.group-folder-checkbox:checked');
        const folders = Array.from(checkboxes).map(cb => cb.value);

        // Validation with user feedback
        if (!name) {
            this.app.showStatus('Please enter a group name', 'error');
            return;
        }

        if (folders.length === 0) {
            this.app.showStatus('Please select at least one folder', 'error');
            return;
        }

        // Create the group
        const result = await this.app.createFolderGroup({
            name,
            folders,
            icon,
            color
        });

        if (result) {
            // Always close modal first
            this.closeGroupDialog();

            // Show success message
            this.app.showStatus(`Group "${name}" created successfully`, 'success');

            // Always refresh explorer view to show new group
            if (this.app.currentView === 'explorer') {
                this.renderMainCategories();
            }
        }
        // Error case is already handled in createFolderGroup with showStatus
    }

    showEditGroupDialog(groupId) {
        /**
         * Show dialog to edit an existing folder group
         */
        const group = this.app.folderGroups.find(g => g.id === groupId);
        if (!group) return;

        // Get all folders
        const allFolders = Object.keys(this.app.scanStatus || {}).sort();

        // Get folders that are in OTHER groups (not this one)
        const foldersInOtherGroups = new Set();
        this.app.folderGroups.forEach(g => {
            if (g.id !== groupId) {  // Other groups
                g.folders.forEach(folder => {
                    foldersInOtherGroups.add(folder);
                });
            }
        });

        // Create checkbox list - only show folders not in other groups, plus current group's folders
        const folderCheckboxes = allFolders.map(folder => {
            const isInOtherGroup = foldersInOtherGroups.has(folder);
            const isInThisGroup = group.folders.includes(folder);

            // Show: folders in this group OR folders not in any other group
            if (!isInThisGroup && isInOtherGroup) {
                return '';  // Hide - it's in another group
            }

            return `
                <label style="display: flex; align-items: center; gap: 8px; padding: 8px; cursor: pointer;">
                    <input type="checkbox" value="${folder}" class="edit-group-folder-checkbox" ${isInThisGroup ? 'checked' : ''} style="cursor: pointer;">
                    <span>${folder}</span>
                </label>
            `;
        }).filter(html => html).join('');

        // Create modal HTML
        const modalHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            " id="editGroupModal" onclick="if(event.target.id==='editGroupModal') app.nav.closeEditGroupDialog();">
                <div style="
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 20px 25px rgba(0,0,0,0.15);
                " onclick="event.stopPropagation();">
                    <h3 style="margin-top: 0; margin-bottom: 20px; color: #111827;">
                        ✏️ Edit Folder Group
                    </h3>

                    <div style="margin-bottom: 16px;">
                        <label style="display: block; font-weight: 500; margin-bottom: 6px; color: #374151;">
                            Group Name
                        </label>
                        <input
                            type="text"
                            id="editGroupNameInput"
                            value="${group.name}"
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 14px;
                                box-sizing: border-box;
                            "
                        >
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; margin-bottom: 8px; color: #374151;">
                            Icon (optional)
                        </label>
                        <input
                            type="text"
                            id="editGroupIconInput"
                            value="${group.icon}"
                            style="
                                width: 100%;
                                padding: 10px 12px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                font-size: 14px;
                                box-sizing: border-box;
                            "
                        >
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="display: flex; align-items: center; gap: 8px; font-weight: 500; margin-bottom: 8px; color: #374151;">
                            Color (optional)
                        </label>
                        <input
                            type="color"
                            id="editGroupColorInput"
                            value="${group.color}"
                            style="
                                width: 60px;
                                height: 40px;
                                border: 1px solid #d1d5db;
                                border-radius: 6px;
                                cursor: pointer;
                            "
                        >
                    </div>

                    <div style="margin-bottom: 20px;">
                        <label style="display: block; font-weight: 500; margin-bottom: 8px; color: #374151;">
                            Select Folders
                        </label>
                        <div style="
                            border: 1px solid #d1d5db;
                            border-radius: 6px;
                            max-height: 250px;
                            overflow-y: auto;
                            padding: 8px;
                            background: #f9fafb;
                        ">
                            ${folderCheckboxes}
                        </div>
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: flex-end;">
                        <button
                            onclick="app.nav.deleteFolderGroupWithConfirm('${groupId}')"
                            style="
                                padding: 10px 16px;
                                background: #EF4444;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                                margin-right: auto;
                            "
                        >
                            🗑️ Delete
                        </button>
                        <button
                            onclick="app.nav.closeEditGroupDialog()"
                            style="
                                padding: 10px 16px;
                                background: #e5e7eb;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            "
                        >
                            Cancel
                        </button>
                        <button
                            onclick="app.nav.submitEditGroup('${groupId}')"
                            style="
                                padding: 10px 16px;
                                background: #3b82f6;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            "
                        >
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existing = document.getElementById('editGroupModal');
        if (existing) existing.remove();

        // Create and show modal
        const modal = document.createElement('div');
        modal.innerHTML = modalHTML;
        document.body.appendChild(modal.firstElementChild);

        // Focus on group name input
        document.getElementById('editGroupNameInput').focus();
    }

    closeEditGroupDialog() {
        /**
         * Close the folder group edit dialog
         */
        const modal = document.getElementById('editGroupModal');
        if (modal) modal.remove();
    }

    async submitEditGroup(groupId) {
        /**
         * Submit the edit group form
         * Automatically removes folders from other groups if they're added to this one
         */
        const name = document.getElementById('editGroupNameInput')?.value?.trim();
        const icon = document.getElementById('editGroupIconInput')?.value?.trim() || '📁';
        const color = document.getElementById('editGroupColorInput')?.value || '#f3f4f6';

        // Get selected folders
        const checkboxes = document.querySelectorAll('.edit-group-folder-checkbox:checked');
        const folders = Array.from(checkboxes).map(cb => cb.value);

        // Validation with user feedback
        if (!name) {
            this.app.showStatus('Please enter a group name', 'error');
            return;
        }

        if (folders.length === 0) {
            this.app.showStatus('Please select at least one folder', 'error');
            return;
        }

        try {
            // First, remove these folders from any other groups
            for (const group of this.app.folderGroups) {
                if (group.id !== groupId) {
                    // Remove folders that are being added to this group
                    const updatedFolders = group.folders.filter(f => !folders.includes(f));

                    // If folders were removed, update the group
                    if (updatedFolders.length !== group.folders.length) {
                        if (updatedFolders.length > 0) {
                            // Group still has folders, just update it
                            await this.app.api.updateFolderGroup(group.id, {
                                name: group.name,
                                icon: group.icon,
                                color: group.color,
                                folders: updatedFolders
                            });
                            console.log(`✅ Removed folders from group "${group.name}"`);
                        }
                        // If group becomes empty, we could delete it, but let's keep it empty for now
                    }
                }
            }

            // Now update this group
            const updatedGroup = await this.app.api.updateFolderGroup(groupId, {
                name, icon, color, folders
            });
            console.log('✅ Folder group updated:', updatedGroup);

            // Reload groups
            await this.app.loadFolderGroups();

            // Close modal
            this.closeEditGroupDialog();

            // Show success message
            this.app.showStatus(`Group "${name}" updated successfully`, 'success');

            // Refresh explorer view
            if (this.app.currentView === 'explorer') {
                this.renderMainCategories();
            }
        } catch (error) {
            console.error('❌ Failed to update folder group:', error);
            this.app.showStatus(`Failed to update group: ${error.message}`, 'error');
        }
    }

    deleteFolderGroupWithConfirm(groupId) {
        /**
         * Show confirmation dialog before deleting group
         */
        const group = this.app.folderGroups.find(g => g.id === groupId);
        if (!group) return;

        const confirmHtml = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            " id="deleteConfirmModal" onclick="if(event.target.id==='deleteConfirmModal') app.nav.closeDeleteConfirmModal();">
                <div style="
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 400px;
                    width: 90%;
                    box-shadow: 0 20px 25px rgba(0,0,0,0.15);
                " onclick="event.stopPropagation();">
                    <h3 style="margin-top: 0; margin-bottom: 12px; color: #DC2626;">
                        ⚠️ Delete Group?
                    </h3>
                    <p style="margin: 12px 0; color: #6b7280;">
                        Are you sure you want to delete the group "<strong>${group.name}</strong>"?
                    </p>
                    <p style="margin: 12px 0; color: #9CA3AF; font-size: 13px;">
                        This action cannot be undone. The folders will not be deleted, only the group organization.
                    </p>

                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
                        <button
                            onclick="app.nav.closeDeleteConfirmModal()"
                            style="
                                padding: 10px 16px;
                                background: #e5e7eb;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            "
                        >
                            Cancel
                        </button>
                        <button
                            onclick="app.nav.confirmDeleteFolderGroup('${groupId}')"
                            style="
                                padding: 10px 16px;
                                background: #DC2626;
                                color: white;
                                border: none;
                                border-radius: 6px;
                                cursor: pointer;
                                font-size: 14px;
                                font-weight: 500;
                            "
                        >
                            Delete Group
                        </button>
                    </div>
                </div>
            </div>
        `;

        const modal = document.createElement('div');
        modal.innerHTML = confirmHtml;
        document.body.appendChild(modal.firstElementChild);
    }

    closeDeleteConfirmModal() {
        /**
         * Close the delete confirmation modal
         */
        const modal = document.getElementById('deleteConfirmModal');
        if (modal) modal.remove();
    }

    async confirmDeleteFolderGroup(groupId) {
        /**
         * Confirm deletion and delete the group
         */
        try {
            await this.app.api.deleteFolderGroup(groupId);

            console.log('✅ Folder group deleted');

            // Reload groups
            await this.app.loadFolderGroups();

            // Close modals
            this.closeDeleteConfirmModal();
            this.closeEditGroupDialog();

            // Show success message
            this.app.showStatus('Group deleted successfully', 'success');

            // Refresh explorer view
            if (this.app.currentView === 'explorer') {
                this.renderMainCategories();
            }
        } catch (error) {
            console.error('❌ Failed to delete folder group:', error);
        }
    }

    async reorderGroup(groupId, direction) {
        /**
         * Move a group up or down in the order
         */
        try {
            const data = await this.app.api.reorderFolderGroup(groupId, direction);
            console.log(`✅ Group moved ${direction}:`, data);

            // Reload groups and refresh UI
            await this.app.loadFolderGroups();

            if (this.app.currentView === 'explorer') {
                this.renderMainCategories();
            }
        } catch (error) {
            console.error(`❌ Failed to move group ${direction}:`, error);
            // Don't show error for edge cases (already at top/bottom)
            if (!error.message.includes('400')) {
                this.app.showStatus(`Failed to reorder group: ${error.message}`, 'error');
            }
        }
    }

    async refreshFolderGroup(groupId) {
        /**
         * Refresh all folders in a group
         * Shows loading overlay instead of toast notifications
         * Just reloads metadata from database (same as "All Folders" refresh)
         * Fast because it doesn't scan - uses cached database data
         */
        try {
            const group = this.app.folderGroups.find(g => g.id === groupId);
            if (!group || !group.folders) {
                console.warn('⚠️ Group not found or has no folders');
                return;
            }

            const folderNames = Array.isArray(group.folders) ? group.folders : JSON.parse(group.folders);

            if (folderNames.length === 0) {
                console.log('No folders in this group')
                return;
            }

            console.log(`🔄 Refreshing folder group: ${group.name} (${folderNames.length} folders)`);

            // Show loading overlay
            this.app.showRefreshLoadingOverlay();

            try {
                // Use performFastRescan to actually scan the files on disk
                // This will sync DB, prune missing, and update UI
                await this.app.performFastRescan(folderNames);
                this.app.hideRefreshLoadingOverlay();

            } catch (error) {
                console.error(`❌ Error refreshing group:`, error);
                this.app.hideRefreshLoadingOverlay();
                console.log(`Failed to refresh group: ${error.message}`)
            }

        } catch (error) {
            console.error('❌ Error refreshing folder group:', error);
            this.app.hideRefreshLoadingOverlay();
            console.log('Failed to refresh folder group')
        }
    }

    // ============================================================================
    // FOLDER OPERATIONS - Refresh folder list
    // ============================================================================

    async forceRefreshFolderList() {
        console.log('🔄 Force refreshing folder list...');

        try {
            // Show loading overlay
            this.app.showRefreshLoadingOverlay();

            // Load folder structure from backend
            await this.app.loadFolderStructure();
            await this.app.loadFolderGroups();

            const folderCount = this.app.folderStructure?.all_folders?.length || 0;
            console.log(`✅ Refreshed folder list: ${folderCount} folders found`);

            // Re-render folder explorer
            this.renderFolderExplorer();

            // Hide loading overlay
            this.app.hideRefreshLoadingOverlay();

            this.app.showStatus('Folder list refreshed', 'success');

        } catch (error) {
            console.error('❌ Error refreshing folder list:', error);
            this.app.hideRefreshLoadingOverlay();
            this.app.showStatus('Failed to refresh folder list', 'error');
        }
    }

    createNavigablePath(video) {
        if (!video.category && !video.subcategory) {
            const rootBg = this.app.format.getFolderColor('_root', 'background');
            const rootBorder = this.app.format.getFolderColor('_root', 'border');
            return `<span class="path-segment root" style="background: ${rootBg}; border-color: ${rootBorder};">Root</span>`;
        }

        // Different behavior for Collection vs Explorer view
        if (this.app.currentView === 'list') {
            // Collection View: Show only the last folder name with full path in tooltip
            let fullPath = '';
            let lastFolderName = '';
            let folderForColor = '';

            if (video.category) {
                fullPath = video.category;
                lastFolderName = video.category;
                folderForColor = video.category;
            }

            if (video.subcategory) {
                fullPath += ` › ${video.subcategory.replace(/\//g, ' › ')}`;
                const subcategoryParts = video.subcategory.split('/');
                lastFolderName = subcategoryParts[subcategoryParts.length - 1];
                folderForColor = lastFolderName; // Use last subfolder for color
            }

            const bgColor = this.app.format.getFolderColor(folderForColor, 'background');
            const borderColor = this.app.format.getFolderColor(folderForColor, 'border');

            return `<span class="path-segment collection-path" title="${fullPath}" style="background: ${bgColor}; border-color: ${borderColor};">${lastFolderName}</span>`;
        } else {
            // Explorer View: Show full navigable breadcrumb (existing behavior)
            let pathHtml = '';

            // Add category
            if (video.category) {
                const catBg = this.app.format.getFolderColor(video.category, 'background');
                const catBorder = this.app.format.getFolderColor(video.category, 'border');
                // Updated onclick to use app.nav.navigateToCategory
                pathHtml += `<span class="path-segment category" style="background: ${catBg}; border-color: ${catBorder};" onclick="event.stopPropagation(); app.nav.navigateToCategory('${video.category}')">${video.category}</span>`;
            }

            // Add subcategory parts if they exist
            if (video.subcategory) {
                const subcategoryParts = video.subcategory.split('/');
                let currentPath = video.category || '';

                subcategoryParts.forEach((part, index) => {
                    const subPath = subcategoryParts.slice(0, index + 1).join('/');
                    const subBg = this.app.format.getFolderColor(part, 'background');
                    const subBorder = this.app.format.getFolderColor(part, 'border');

                    pathHtml += ` <span class="path-separator">›</span> `;
                    // Updated onclick to use app.nav.navigateToSubcategory
                    pathHtml += `<span class="path-segment subcategory" style="background: ${subBg}; border-color: ${subBorder};" onclick="event.stopPropagation(); app.nav.navigateToSubcategory('${video.category}', '${subPath}')">${part}</span>`;
                });
            }

            return pathHtml || `<span class="path-segment root" style="background: ${this.app.format.getFolderColor('_root', 'background')}; border-color: ${this.app.format.getFolderColor('_root', 'border')};">Root</span>`;
        }
    }
}


// Export as global for use in app.js
window.NavigationModule = NavigationModule;
