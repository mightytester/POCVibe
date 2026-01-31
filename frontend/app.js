class ClipperApp {
    constructor() {
        // Use environment-configurable API base URL
        this.apiBase = window.CLIPPER_CONFIG?.apiUrl || 'http://localhost:8000';

        // Initialize core utilities (loaded from separate modules)
        // api-client.js provides centralized API communication with error handling
        // dom-cache.js provides DOM element caching to reduce getElementById calls
        // settings-storage.js provides localStorage persistence for settings
        // format-utils.js provides formatting, parsing, and utility functions
        this.api = new window.ClipperAPIClient(this.apiBase);
        this.dom = window.DOMCache;
        this.storage = window.SettingsStorage;

        // Edited video indicators - all edited videos get the same badge
        // Add substrings here to detect edited videos (case-insensitive, matches anywhere in filename)
        this.editedVideoSubstrings = [
            'processed',
            'cut',
            'crop',
            'cut_and_crop'
            // Add more indicators here as needed
        ];

        // Initialize format utilities with edited video configuration
        this.format = new window.FormatUtils({
            editedVideoSubstrings: this.editedVideoSubstrings
        });

        // Initialize feature modules
        // keyboard-shortcuts-module.js handles global keyboard shortcuts and help modal
        this.keyboardModule = new window.KeyboardShortcutsModule(this);

        // series-metadata-module.js handles series/season/episode metadata and view
        this.seriesModule = new window.SeriesMetadataModule(this);

        // video-operations-module.js handles move, delete, and rename operations
        this.videoOps = new window.VideoOperationsModule(this);

        // video-collection-module.js handles video grid rendering and pagination
        this.collectionModule = new window.VideoCollectionModule(this);

        // context-menu-module.js handles video and face context menus
        this.contextMenu = new window.ContextMenuModule(this);

        // actor-management-module.js handles actor modal and autocomplete
        this.actorModule = new window.ActorManagementModule(this);

        // video-player-module.js handles video playback and controls
        this.videoPlayer = new window.VideoPlayerModule(this);

        // tag-management-module.js handles tag modal and autocomplete
        this.tagModule = new window.TagManagementModule(this);

        // duplicate-review-module.js handles duplicate detection and review
        this.duplicateModule = new window.DuplicateReviewModule(this);

        // bulk-edit-module.js handles folder bulk editing
        this.bulkEditModule = new window.BulkEditModule(this);

        // curation-mode-module.js handles curation bar and video controls
        this.curationModule = new window.CurationModeModule(this);

        // image-viewer-module.js handles image viewing
        this.imageViewer = new window.ImageViewerModule(this);

        // download-module.js handles M3U8/SOCKS/Quick downloads
        this.downloadModule = new window.DownloadModule(this);

        // sorting-module.js handles sorting, filtering, and view switching
        this.sorting = new window.SortingModule(this);

        // scan-system-module.js handles folder scanning and batch operations
        this.scanSystem = new window.ScanSystemModule(this);

        // fingerprint-module.js handles fingerprint generation and duplicate detection
        this.fingerprint = new window.FingerprintModule(this);

        // navigation-module.js handles navigation, breadcrumbs, folder explorer, and folder groups
        this.nav = new window.NavigationModule(this);

        // face-recognition-module.js handles face detection, search, and cataloging (lazy)
        this._faceModule = null; // Lazy initialized

        // Multi-root configuration
        this.availableRoots = [];
        this.currentRoot = null;
        this.currentRootLayout = 'horizontal';

        this.currentCategory = null;
        this.currentSubcategory = null;
        this.breadcrumb = []; // Track navigation path
        this.currentView = 'explorer'; // 'explorer', 'list', or 'series' (changed default to explorer)
        this.videos = [];
        this.allVideos = []; // Store all videos for filtering (category-specific or all)
        this.hasLoadedFullCollection = false; // Track if allVideos contains the FULL collection (vs just folder videos)
        this.allVideosCatalog = []; // Store COMPLETE video catalog across entire library (for face searching)
        this.categories = {};
        this.scrollPositions = {}; // Store scroll positions for each view
        this.folderStructure = {}; // Store hierarchical folder structure
        this.folderGroups = []; // Store custom folder groups
        this.systemFolders = []; // Store system folders list
        this.scanStatus = {}; // Store folder scan status
        this.allTags = [];
        this.allActors = []; // Store all actors for autocomplete
        this.currentVideoActors = []; // Store actors for current video being edited
        this.currentSearchQuery = '';
        this.currentTagFilter = '';
        this.currentFolderFilter = []; // Array of selected folder names (empty = no folders, explicit selection required)
        this.currentSeriesFilter = ''; // Series filter
        this.currentYearFilter = ''; // Year filter
        this.currentChannelFilter = ''; // Channel filter
        this.currentRatingFilter = ''; // Rating filter (minimum rating)
        this.currentFavoriteFilter = false; // Favorite filter (checkbox)
        this.currentSort = 'name-asc'; // Current sort method (name-asc=A-Z, modified=newest first, random, name-desc, newest, size-desc, duration-desc)
        this.isFirstLoad = true; // Track if this is the first load (no saved settings)
        this.moveContext = null; // { videoId, originalCategory }
        this.recentlyUsedTags = []; // Track recently used tags for smart suggestions
        this.tagUsageCount = {}; // Track tag usage frequency

        // ✅ NEW: Config for tags to exclude from suggestions
        // Add any tag prefixes you want to hide from suggestions here
        // Users can still type them fully if they want to use them
        this.excludedTagPrefixes = ['dup-']; // e.g., ['dup-', 'sys-', 'internal-']

        // Bulk operations state
        this.selectionMode = false; // Whether multi-select mode is active
        this.selectedVideos = new Set(); // Set of selected video IDs

        // Display mode state
        this.verticalMode = false; // Whether vertical video layout is active

        // Duplicate review state - delegated to duplicateModule via getter/setters below

        // Face filter state
        this.activeFaceFilter = null; // { faceId, faceName } when filtering by face

        // Scan queue system
        this.scanQueue = []; // Queue of pending folder scans
        this.currentlyScanning = false; // Whether a scan is currently in progress

        // Mode configuration
        this.localMode = {
            enabled: false,
            fallbackToStreaming: window.CLIPPER_CONFIG?.localMode?.fallbackToStreaming ?? true
        }

        // Performance optimization settings
        this.VIDEOS_PER_PAGE = 20;  // Load 20 videos at a time
        this.currentPage = 0;
        this.displayedVideos = [];

        // Intersection Observer for lazy loading thumbnails
        this.imageObserver = new IntersectionObserver(
            this.handleImageIntersection.bind(this),
            {
                rootMargin: '100px', // Start loading 100px before element enters viewport
                threshold: 0.1
            }
        );
        this.isLoading = false;
        this.observer = null; // Intersection Observer for infinite scroll

        // Face recognition state
        this.faceApiLoaded = false;
        this.faceApiLoading = false;
        this.currentVideoForFaces = null; // Track current video being processed
        this.detectedFaces = []; // Store detected faces from current frame
        this.currentFrameData = null; // Store current frame image data
        this.currentFaceSearchData = null; // Store face data for search modal
        this.scannedFrames = []; // Store scanned frames from video
        this.selectedFrames = []; // Store selected frames for batch processing

        // Audio modal state
        this.selectedAudio = null; // Currently selected audio for preview

        // Face merging state
        this.facesForMerging = []; // Store face IDs selected for merging
        this.mergingMode = false; // Track if we're in merge selection mode
        this.videoFacesForMerging = []; // Store faces selected for video-specific merging
        this.facesSelectedForMerge = []; // Store faces selected in review modal
        this.currentReviewVideoId = null; // Track which video is being reviewed
        this.currentConfirmationAction = null; // Track current confirmation action
        this.pendingFaceDeleteId = null; // Store face ID pending deletion
        this.pendingFaceDeleteElement = null; // Store face element pending deletion

        // Face detail modal state
        this.playingVideoFromFaceDetail = false; // Track if playing video from face detail modal
        this.currentFaceForDetail = null; // Store current face for returning from video playback

        this.init();
    }

    async init() {
        // Validate core utilities are loaded
        if (!this.api) {
            console.error('❌ ClipperAPIClient not initialized - check that api-client.js is loaded before app.js');
        } else {
            console.log('✅ API Client initialized:', this.api.baseUrl);
        }
        if (!this.dom) {
            console.error('❌ DOMCache not initialized - check that dom-cache.js is loaded before app.js');
        } else {
            console.log('✅ DOM Cache initialized');
        }
        if (!this.storage) {
            console.error('❌ SettingsStorage not initialized - check that settings-storage.js is loaded before app.js');
        } else {
            console.log('✅ Settings Storage initialized');
        }
        if (!this.format) {
            console.error('❌ FormatUtils not initialized - check that format-utils.js is loaded before app.js');
        } else {
            console.log('✅ Format Utils initialized');
        }

        // Load settings FIRST to restore view state before any rendering
        this.loadTagUsageFromStorage();
        this.loadSettingsFromStorage(); // Restore saved settings

        // Hide all views initially to prevent flash
        this.hideAllViews();

        // If this is the first load (no saved settings), we'll default to all folders after loading folder structure
        // Otherwise, respect the saved filter state (even if empty)

        await this.checkBackend();
        await this.loadModeConfiguration();
        await this.loadRoots();
        await this.loadVideos();
        await this.loadAllTags();
        await this.loadAllActors();
        await this.loadMetadataSuggestions(); // Load autocomplete suggestions
        await this.loadThumbnailStats();
        this.setupEventListeners();
    }

    // Lazy getter for face recognition module
    get faceModule() {
        if (!this._faceModule) {
            if (window.FaceRecognitionModule) {
                this._faceModule = new window.FaceRecognitionModule(this);
                console.log('✅ Face Recognition Module initialized');
            } else {
                console.error('❌ FaceRecognitionModule not available - check that face-recognition-module.js is loaded');
            }
        }
        return this._faceModule;
    }

    hideAllViews() {
        // Hide all views to prevent flash during initialization
        // Using DOM cache for efficient element access
        const videoGrid = this.dom.get('videoGrid');
        const folderExplorer = this.dom.get('folderExplorer');
        const seriesView = this.dom.get('seriesView');
        const breadcrumbNav = this.dom.get('breadcrumbNav');
        const listViewControls = this.dom.get('listViewControls');

        if (videoGrid) videoGrid.style.display = 'none';
        if (folderExplorer) folderExplorer.style.display = 'none';
        if (seriesView) seriesView.style.display = 'none';
        if (breadcrumbNav) breadcrumbNav.style.display = 'none';
        if (listViewControls) listViewControls.style.display = 'none';
    }

    updateViewButtons() {
        // Update main view button state (only Explorer button now)
        const explorerBtn = this.dom.get('explorerViewBtn');
        if (explorerBtn) {
            explorerBtn.classList.add('active');
        }

        // Update menu item styles to show which view is active
        const collectionMenuBtn = this.dom.get('menuCollectionViewBtn');
        const seriesMenuBtn = this.dom.get('menuSeriesViewBtn');

        if (collectionMenuBtn) {
            if (this.currentView === 'list') {
                collectionMenuBtn.classList.add('active');
            } else {
                collectionMenuBtn.classList.remove('active');
            }
        }

        if (seriesMenuBtn) {
            if (this.currentView === 'series') {
                seriesMenuBtn.classList.add('active');
            } else {
                seriesMenuBtn.classList.remove('active');
            }
        }
    }

    async checkBackend() {
        try {
            // Use centralized API client for health check
            const data = await this.api.healthCheck();

            if (data.status === 'healthy') {
                // Hide status once connected (using DOM cache)
                const statusEl = this.dom.get('status');
                if (statusEl) statusEl.style.display = 'none';
            } else {
                throw new Error('Backend unhealthy');
            }
        } catch (error) {
            this.showStatus('❌ Cannot connect to backend. Make sure the server is running on port 8000.', 'error');
            return false;
        }
        return true;
    }

    async loadModeConfiguration() {
        try {
            const response = await fetch(`${this.apiBase}/mode`);
            const modeInfo = await response.json();

            // Simple: only need to know if local mode is enabled
            this.localMode.enabled = modeInfo.local_mode_enabled;

            console.log('🔧 Mode configuration loaded:', this.localMode);

            // Mode indicator removed per user request
            // this.updateModeIndicator();

        } catch (error) {
            console.warn('⚠️ Failed to load mode configuration:', error);
            // Continue with default HTTP streaming mode
        }
    }

    updateModeIndicator() {
        const statusElement = document.getElementById('status');
        if (statusElement && statusElement.style.display === 'none') {
            let indicator = document.querySelector('.mode-indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'mode-indicator';
                document.querySelector('.container').insertBefore(indicator, document.querySelector('.controls'));
            }

            const modeText = this.localMode.enabled
                ? '⚡ Local Mode (Optimized Disk Streaming - Instant Seeking)'
                : '🌐 HTTP Streaming Mode';

            indicator.innerHTML = `<span class="mode-badge">${modeText}</span>`;
            indicator.style.display = 'block';
        }
    }

    async loadRoots() {
        /**
         * Load available roots from backend and setup root selector
         */
        try {
            const response = await fetch(`${this.apiBase}/api/roots`);
            const data = await response.json();

            this.availableRoots = data.roots || [];
            this.currentRoot = data.roots?.find(r => r.default) || data.roots?.[0];
            this.currentRootLayout = data.current?.layout || 'horizontal';

            console.log(`📁 Roots loaded. Current: ${this.currentRoot?.name} (${data.current?.layout})`);

            // Setup root selector UI
            this.setupRootSelector();
        } catch (error) {
            console.warn('⚠️ Could not load roots configuration:', error);
            // Continue without root switching if not available
            this.availableRoots = [];
        }
    }

    setupRootSelector() {
        /**
         * Setup root selector dropdown in actions menu
         */
        if (this.availableRoots.length <= 1) return; // Hide if only one root

        const container = document.getElementById('rootSelectorContainer');
        const selector = document.getElementById('rootSelector');

        if (!container || !selector) return;

        // Show container if multiple roots exist
        container.style.display = 'flex';

        // Populate root selector
        selector.innerHTML = this.availableRoots.map(root =>
            `<option value="${root.name}" ${root.default ? 'selected' : ''}>${root.name} (${root.layout})</option>`
        ).join('');

        // Add change event listener
        selector.addEventListener('change', async (e) => {
            const selectedRoot = e.target.value;
            if (selectedRoot) {
                await this.switchRoot(selectedRoot);
            }
        });
    }

    async switchRoot(rootName) {
        /**
         * Switch to a different root and reload all data
         * Ensures complete state isolation from previous root
         */
        try {
            console.log(`🔄 Switching to root: ${rootName}`);

            const response = await fetch(`${this.apiBase}/api/roots/select?root_name=${encodeURIComponent(rootName)}`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to switch root');
            }

            const data = await response.json();
            this.currentRoot = this.availableRoots.find(r => r.name === rootName);
            this.currentRootLayout = data.current.layout;

            console.log(`✅ Switched to: ${rootName} (${data.current.layout})`);

            // === Clear ALL Frontend State ===

            // Clear video-related state
            this.videos = [];
            this.allVideos = [];
            this.allVideosCatalog = [];
            this.displayedVideos = [];
            this.selectedVideos.clear();
            this.currentPage = 0;
            this.scrollPositions = {};

            // Clear modal state
            this.currentVideoInPlayer = null;
            this.hideVideoPlayer();
            this.hideMoveVideoPlayerModal();
            this.hideTagVideoPlayerModal();

            // Clear tag state
            this.tagCache = {};
            this.actorCache = {};

            // Clear filter state
            this.filterTag = null;
            this.filterActor = null;
            this.currentCategory = null;
            this.currentSubcategory = null;

            // Clear pagination state
            this.itemsPerPage = 50;

            // Clear view state
            this.currentView = 'explorer';
            this.verticalMode = false;
            this.sortBy = null;

            // Clear folder groups (will be reloaded)
            this.folderGroups = [];

            // === Apply Layout ===
            if (this.currentRootLayout === 'vertical') {
                this.verticalMode = true;
                // Apply vertical layout to video grid
                const videoGrid = document.getElementById('videoGrid');
                if (videoGrid) {
                    videoGrid.classList.add('vertical-mode');
                }
                // Apply to folder explorer grids
                const explorerGrids = document.querySelectorAll('.folder-explorer .video-grid');
                explorerGrids.forEach(grid => {
                    grid.classList.add('vertical-mode');
                });
            } else {
                this.verticalMode = false;
                // Apply horizontal layout to video grid
                const videoGrid = document.getElementById('videoGrid');
                if (videoGrid) {
                    videoGrid.classList.remove('vertical-mode');
                }
                // Apply to folder explorer grids
                const explorerGrids = document.querySelectorAll('.folder-explorer .video-grid');
                explorerGrids.forEach(grid => {
                    grid.classList.remove('vertical-mode');
                });
            }

            // === Reload Data from New Root ===
            // Reset view to explorer before reloading
            this.currentView = 'explorer';

            await this.loadVideos();
            await this.loadAllTags();
            await this.loadFolderGroups();  // Reload folder groups for new root

            console.log('🎬 Videos reloaded from new root with Explorer view');
        } catch (error) {
            console.error('❌ Error switching root:', error);
            alert(`Failed to switch root: ${error.message}`);
        }
    }

    async loadVideos() {
        try {
            console.log('📂 Loading existing videos from database (pagination-based)');

            // Load folder structure and scan status first (lightweight operations)
            await this.loadFolderStructure();
            await this.loadFolderGroups();
            await this.loadScanStatus();


            // Determine which view to start in
            const savedView = this.currentView || 'explorer';
            const isRestoringState = !this.isFirstLoad;

            // Don't load videos on startup - lazy load on demand for all views
            console.log('⚡ Lazy loading enabled - videos will load on demand (search/filter)');
            this.allVideos = [];

            // Only default to all folders on first load (no saved settings)
            // Otherwise, respect saved filter state (even if empty)
            if (this.isFirstLoad && (!this.currentFolderFilter || this.currentFolderFilter.length === 0)) {
                const allFolders = this.folderStructure.all_folders || [];
                this.currentFolderFilter = [...allFolders];
                console.log('📂 First load: defaulting to all folders');
            } else if (!this.isFirstLoad) {
                console.log(`📂 Restored folder filter: ${this.currentFolderFilter.length} folders selected`);
            }

            // Initialize view (respect saved view or default to explorer)
            // Don't reset navigation if restoring from saved state
            // Switch view without animation on initial load
            this.switchView(savedView, !isRestoringState, false);

        } catch (error) {
            console.error('❌ Error loading videos:', error);
            this.showStatus('❌ Failed to load videos from database. Try scanning some folders first.', 'warning');
            // Still load the interface even if no videos
            await this.loadFolderStructure();
            await this.loadScanStatus();

            this.allVideos = [];
            this.switchView('explorer', true, false); // No animation on error fallback
        }
    }
    async loadScanStatus() {
        try {
            console.log('📋 Loading scan status...');
            const data = await this.api.getScanStatus();
            this.scanStatus = data.folders || {};
            console.log('📋 Loaded scan status:', data);

            // Show scan status in UI
            const scannedCount = data.scanned_folders || 0;
            const totalCount = data.total_folders || 0;

            if (scannedCount === 0) {
                this.showStatus(`🔍 No folders scanned yet (${totalCount} folders found). Use per-folder scan controls to scan at your leisure.`, 'info');
            } else if (scannedCount < totalCount) {
                this.showStatus(`📊 ${scannedCount}/${totalCount} folders scanned. Videos available from scanned folders.`, 'info');
            }

            // Update the view if we're in explorer mode
            if (this.currentView === 'explorer') {
                this.renderFolderExplorer();
            }

        } catch (error) {
            console.error('❌ Failed to load scan status:', error);
            this.scanStatus = {};
            this.showStatus('❌ Failed to load folder information. Check server connection.', 'error');
        }
    }

    async loadFingerprintStats() {
        // Optimization: Skipped loading fingerprint stats for explorer view speed
        this.fingerprintStats = {};
        return;
    }

    async loadFolderStructure() {
        try {
            // API returns: {groups: [...], ungrouped_folders: [...], all_folders: [...]}
            this.folderStructure = await this.api.getFolderStructure();
            console.log('📁 Folder structure loaded:', this.folderStructure);

            // Populate folder filter dropdown
            this.populateFolderFilter();
        } catch (error) {
            console.warn('⚠️ Failed to load folder structure:', error);
            this.folderStructure = { groups: [], ungrouped_folders: [], all_folders: [] };
        }
    }

    async loadFolderGroups() {
        /**
         * Load custom folder groups configuration
         * Groups can be used to organize folders in explorer view
         */
        try {
            // API returns array directly: [{id, name, icon, folders, ...}, ...]
            const data = await this.api.getFolderGroups();
            this.folderGroups = Array.isArray(data) ? data : [];
            console.log('📊 Folder groups loaded:', this.folderGroups);
        } catch (error) {
            console.warn('⚠️ Failed to load folder groups:', error);
            this.folderGroups = [];
        }
    }

    async createFolderGroup(groupData) {
        /**
         * Create a new custom folder group
         *
         * groupData: {
         *   name: "Group Name",
         *   folders: ["FOLDER1", "FOLDER2"],
         *   icon: "📁",
         *   color: "#3B82F6"
         * }
         */
        try {
            const group = await this.api.createFolderGroup(groupData);
            console.log('✅ Folder group created:', group);

            // Reload groups
            await this.loadFolderGroups();

            return group;
        } catch (error) {
            console.error('❌ Failed to create folder group:', error);
            this.showStatus(`Failed to create group: ${error.message}`, 'error');
            return null;
        }
    }

    showCreateGroupDialog() { this.nav.showCreateGroupDialog() }

    closeGroupDialog() { this.nav.closeGroupDialog() }

    async submitCreateGroup() { return this.nav.submitCreateGroup() }

    async reorderGroup(groupId, direction) { return this.nav.reorderGroup(groupId, direction) }


    async refreshFolderGroup(groupId) { return this.nav.refreshFolderGroup(groupId) }

    showEditGroupDialog(groupId) { this.nav.showEditGroupDialog(groupId) }

    closeEditGroupDialog() { this.nav.closeEditGroupDialog() }

    async submitEditGroup(groupId) { return this.nav.submitEditGroup(groupId) }

    deleteFolderGroupWithConfirm(groupId) { this.nav.deleteFolderGroupWithConfirm(groupId) }

    closeDeleteConfirmModal() { this.nav.closeDeleteConfirmModal() }

    async confirmDeleteFolderGroup(groupId) { return this.nav.confirmDeleteFolderGroup(groupId) }

    async loadCategory(categoryName, subcategoryName = null) {
        this.currentCategory = categoryName;
        this.currentSubcategory = subcategoryName;

        // Update breadcrumb navigation
        this.updateBreadcrumb(categoryName, subcategoryName);

        // Load videos with tags from database with cache busting
        try {
            const timestamp = new Date().getTime();
            let apiUrl;
            if (subcategoryName) {
                apiUrl = `${this.apiBase}/videos/${categoryName}/${subcategoryName}?_t=${timestamp}`;
                console.log(`📂 Loading subcategory "${categoryName}/${subcategoryName}" with cache-buster: ${timestamp}`);
            } else {
                apiUrl = `${this.apiBase}/videos/${categoryName}?_t=${timestamp}`;
                console.log(`📂 Loading category "${categoryName}" with cache-buster: ${timestamp}`);
            }

            const response = await fetch(apiUrl);
            const data = await response.json();
            this.allVideos = data.videos || [];
            console.log(`📊 Loaded ${this.allVideos.length} videos from database`);
        } catch (error) {
            console.warn(`⚠️ Database load failed, falling back to file system`);
            // Fallback to file system scan
            this.allVideos = this.categories[categoryName]?.videos || [];
            console.log(`📊 Category "${categoryName}" loaded ${this.allVideos.length} videos from file system`);
        }

        this.applyFilters();
    }

    updateBreadcrumb(categoryName, subcategoryName = null) { this.nav.updateBreadcrumb(categoryName, subcategoryName) }



    createBreadcrumbContainer() { return this.nav.createBreadcrumbContainer() }

    // ==================== FOLDER EXPLORER - MODERN ONLY ====================
    // Legacy folder-card methods removed - using folder-card-modern only

    async markFolderAsImages(folderName) {
        // Mark all files in folder as images
        const confirmed = confirm(`🖼️ Mark all files in "${folderName}" as images?`);
        if (!confirmed) return;

        this.hideFolderMenu();

        try {
            console.log('🔄 Marking folder as images...')

            const url = new URL(`${this.apiBase}/api/maintenance/mark-folder-as-images`);
            url.searchParams.append('category', folderName);

            const response = await fetch(url.toString(), { method: 'POST' });
            const data = await response.json();

            if (response.ok) {
                console.log(`✅ Marked ${data.files_updated} files as images`)
                // Reload current view
                if (this.currentCategory) {
                    await this.loadCategory(this.currentCategory, this.currentSubcategory);
                } else {
                    await this.loadAllVideosFlat();
                }
            } else {
                console.log(`Error: ${data.detail || 'Failed'}`)
            }
        } catch (error) {
            console.error('Error marking folder:', error);
            console.log('Error marking folder as images')
        }
    }

    renderCategories() {
        const categoriesContainer = document.getElementById('categories');
        categoriesContainer.innerHTML = '';

        // Add "All Videos" button first
        const allButton = document.createElement('button');
        allButton.className = 'category-btn';
        const totalVideos = Object.values(this.categories).reduce((sum, cat) => sum + cat.count, 0);
        allButton.textContent = `All Videos (${totalVideos})`;
        allButton.onclick = () => this.loadCategory("_all");
        this.addDragDropToCategory(allButton, "_all");
        categoriesContainer.appendChild(allButton);

        Object.keys(this.categories).forEach(categoryName => {
            const category = this.categories[categoryName];
            const button = document.createElement('button');
            button.className = 'category-btn';
            button.textContent = `${categoryName} (${category.count})`;
            button.onclick = () => this.loadCategory(categoryName);
            this.addDragDropToCategory(button, categoryName);
            categoriesContainer.appendChild(button);
        });

        // Categories updated;
    }

    addDragDropToCategory(button, categoryName) {
        // Drag-over support to move videos
        button.addEventListener('dragover', (e) => {
            e.preventDefault();
            button.classList.add('drag-over');
        });
        button.addEventListener('dragleave', () => {
            button.classList.remove('drag-over');
        });
        button.addEventListener('drop', async (e) => {
            e.preventDefault();
            button.classList.remove('drag-over');
            const videoId = e.dataTransfer.getData('text/x-clipper-video-id');
            if (!videoId || categoryName === "_all") return;
            if (this.currentCategory === categoryName || (categoryName === '_root' && this.currentCategory === '_root')) return;
            try {
                await this.apiMoveVideo(parseInt(videoId, 10), categoryName, null);
                console.log('Video moved')
            } catch (err) {
                console.log(err.message || 'Move failed')
            }
        });
    }

    updateCategoryButtons() {
        document.querySelectorAll('.category-btn').forEach(btn => {
            btn.classList.remove('active');
            if (this.currentCategory === "_all" && btn.textContent.startsWith('All Videos')) {
                btn.classList.add('active');
            } else if (btn.textContent.startsWith(this.currentCategory) && !btn.textContent.startsWith('All Videos')) {
                btn.classList.add('active');
            }
        });
    }

    // ============================================================================
    // FORMAT UTILITY METHODS - Delegate to FormatUtils module
    // ============================================================================

    formatDuration(seconds) { return this.format.formatDuration(seconds) }
    parseTimeToSeconds(timeString) { return this.format.parseTimeToSeconds(timeString) }
    normalizeTimeFormat(timeString) { return this.format.normalizeTimeFormat(timeString) }
    formatSize(bytes) { return this.format.formatSize(bytes) }
    formatResolution(width, height) { return this.format.formatResolution(width, height) }
    isMobileDevice() { return this.format.isMobileDevice() }
    formatVideoMetadata(video) { return this.format.formatVideoMetadata(video) }
    isEditedVideo(videoName) { return this.format.isEditedVideo(videoName) }
    createEditedVideoBadge(videoName) { return this.format.createEditedVideoBadge(videoName) }
    getImageExtension(filename) { return this.format.getImageExtension(filename) }
    isImageExtension(extension) { return this.format.isImageExtension(extension) }
    getBaseVideoName(videoName) { return this.format.getBaseVideoName(videoName) }
    groupVideosByBase(videos) { return this.format.groupVideosByBase(videos) }

    createVideoCard(video) {
        const card = document.createElement('div');
        card.className = video.is_final ? 'video-card final' : 'video-card';
        // Add 'image-card' class for square cards - ✅ NEW
        if (video.media_type === 'image') {
            card.classList.add('image-card');
        }
        // Add 'vertical-video' class if video has vertical aspect ratio (height > width)
        if (video.width && video.height && video.height > video.width) {
            card.classList.add('vertical-video');
        }
        card.setAttribute('data-video-id', video.id); // Add data attribute for DOM updates
        card.setAttribute('data-video-name', video.name); // Add data-video-name for file refresh lookup
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/x-clipper-video-id', video.id);
            e.dataTransfer.effectAllowed = 'move';
        });

        // Create compact tags HTML - show first 3 tags, rest as "+X more"
        let tagsHtml = '';
        let tagsCompact = '';
        if (video.tags && video.tags.length > 0) {
            const visibleTags = video.tags.slice(0, 3);
            const remainingCount = video.tags.length - 3;

            tagsHtml = visibleTags.map(tag =>
                `<span class="tag clickable-tag" style="background-color: ${tag.color}" onclick="event.stopPropagation(); app.filterByTag('${tag.name}')">${tag.name}</span>`
            ).join('');

            if (remainingCount > 0) {
                tagsHtml += `<span class="more-indicator" title="${video.tags.slice(3).map(t => t.name).join(', ')}">+${remainingCount}</span>`;
            }

            tagsCompact = `<div class="compact-tags">${tagsHtml}</div>`;
        }

        // Create compact actors HTML - show first 3 actors, rest as "+X more"
        let actorsCompact = '';
        if (video.actors && video.actors.length > 0) {
            const visibleActors = video.actors.slice(0, 3);
            const remainingCount = video.actors.length - 3;

            let actorsHtml = visibleActors.map(actor =>
                `<span class="actor-compact clickable-actor" onclick="event.stopPropagation(); app.filterByActor('${actor.name.replace(/'/g, "\\'")}')" title="${actor.name}">👤 ${actor.name}</span>`
            ).join('');

            if (remainingCount > 0) {
                actorsHtml += `<span class="more-indicator" title="${video.actors.slice(3).map(a => a.name).join(', ')}">+${remainingCount}</span>`;
            }

            actorsCompact = `<div class="compact-actors">${actorsHtml}</div>`;
        }

        // Create faces HTML with click handlers for opening face review modal
        const facesHtml = video.faces && video.faces.length > 0 ?
            video.faces.slice(0, 5).map(face => {
                // Determine thumbnail with fallback logic
                let thumbnailSrc = '';

                if (face.thumbnail) {
                    // Use face's own thumbnail if available
                    thumbnailSrc = face.thumbnail.startsWith('data:')
                        ? face.thumbnail
                        : `data:image/jpeg;base64,${face.thumbnail}`;
                } else if (face.embeddings && face.embeddings.length > 0) {
                    // Fallback: Use best thumbnail from face's embeddings
                    const embWithThumb = face.embeddings.find(e => e.thumbnail);
                    if (embWithThumb) {
                        thumbnailSrc = `data:image/jpeg;base64,${embWithThumb.thumbnail}`;
                    }
                }

                // Skip if still no thumbnail found
                if (!thumbnailSrc) return '';

                // Store face data in data attributes for context menu access
                const faceName = face.name.replace(/'/g, "\\'");
                return `<div class="face-icon-container" data-face-id="${face.id}" data-face-name="${faceName}">
                     <img class="face-icon" src="${thumbnailSrc}"
                          title="${face.name}"
                          onerror="this.style.display='none'"
                          onclick="event.stopPropagation(); app.showAllVideosByFace(${face.id}, '${faceName}')" />
                     <div class="face-icon-actions">
                         <button class="face-action-btn face-search-btn" 
                                 title="View all videos with this face"
                                 onclick="event.stopPropagation(); app.showAllVideosByFace(${face.id}, '${faceName}')">
                             👁️
                         </button>
                     </div>
                 </div>`;
            }).join('') +
            (video.faces.length > 5 ? `<span class="face-count">+${video.faces.length - 5} more</span>` : '')
            : '';

        // Display folder path information
        let folderDisplayName = video.category === '_root' ? '(Root)' : video.category;
        if (video.subcategory) {
            folderDisplayName += ` / ${video.subcategory}`;
        }

        // Format metadata: Duration for videos, Dimensions for images - ✅ NEW
        const metadataParts = [];
        if (video.media_type === 'image') {
            // For images: show dimensions instead of duration
            if (video.width && video.height) {
                metadataParts.push(`📐 ${this.formatResolution(video.width, video.height)}`);
            }
        } else {
            // For videos: show duration first, then dimensions
            if (video.duration) {
                metadataParts.push(`⏱️ ${this.formatDuration(video.duration)}`);
            }
            if (video.width && video.height) {
                metadataParts.push(`📺 ${this.formatResolution(video.width, video.height)}`);
            }
        }
        if (video.size) {
            metadataParts.push(`💾 ${this.formatSize(video.size)}`);
        }
        if (video.fingerprint_generated) {
            metadataParts.push(`🆔`);
        }

        // Create channel badge (grey, no icon)
        const channelBadge = video.channel ?
            `<span class="video-channel-badge-grey">${this.escapeHtml(video.channel)}</span>` : '';

        // Create metadata line
        const metadataLine = metadataParts.length > 0 ?
            `<div class="video-metadata-line">${metadataParts.join(' • ')}</div>` : '';

        // Combine metadata and tags in one row (no channel here)
        const metadataWithTags = (metadataLine || tagsCompact) ?
            `<div class="video-channel-row">
                <div class="video-channel-left">
                    ${metadataLine}
                </div>
                <div class="video-channel-right">
                    ${tagsCompact}
                </div>
            </div>` : '';

        // Format actors and faces row: Actors on left, Face icons on right
        const actorsFacesRow = (actorsCompact || facesHtml) ?
            `<div class="video-actors-faces-row">
                <div class="video-actors-left">${actorsCompact}</div>
                <div class="video-faces-right">${facesHtml}</div>
            </div>` : '';

        // Use lazy loading for better performance
        let thumbnailHtml = '';
        if (video.thumbnail_url) {
            // Add cache-busting parameter if thumbnail was recently updated
            let thumbnailUrl = video.thumbnail_url;
            if (video.thumbnail_updated_at) {
                // Use the stored update timestamp for cache busting
                thumbnailUrl += (thumbnailUrl.includes('?') ? '&' : '?') + 'v=' + video.thumbnail_updated_at;
            }

            thumbnailHtml = `
                <img class="thumbnail-image lazy-image"
                     data-src="${thumbnailUrl}"
                     alt="${video.name}"
                     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23f3f4f6'/%3E%3C/svg%3E" />
                <div class="play-overlay">▶</div>
            `;
        } else {
            thumbnailHtml = `
                <div class="thumbnail-placeholder">
                    <div class="video-icon">🎬</div>
                    <div class="loading-text">Loading...</div>
                </div>
                <div class="play-overlay">▶</div>
            `;
        }

        // Store video data for click handler (simple approach)
        const videoData = JSON.stringify({
            id: video.id,
            name: video.name,
            category: video.category,
            subcategory: video.subcategory || '',
            relative_path: video.relative_path || video.name,
            path: video.path,  // Add the file path for local mode
            extension: video.extension,  // Add extension for image detection
            media_type: video.media_type || 'video'  // Include media_type for image routing
        }).replace(/"/g, '&quot;');

        card.innerHTML = `
            <div class="video-selection-checkbox">
                <input type="checkbox"
                       data-video-id="${video.id}"
                       onclick="event.stopPropagation(); app.toggleVideoSelection(${video.id})"
                       ${this.selectedVideos.has(video.id) ? 'checked' : ''} />
            </div>
            <div class="video-thumbnail" onclick="app.playVideoFromData('${videoData}')">
                ${thumbnailHtml}
                ${video._similarity !== undefined ? this.createSimilarityBadge(video._similarity, video._isOriginal) : ''}
                ${video.is_final ? '<div class="final-badge"><span>💎</span><span>FINAL</span></div>' : ''}
                ${video.media_type === 'image' ? `<div class="media-type-badge image-badge">${this.getImageExtension(video.name)}</div>` : '<div class="media-type-badge video-badge">Video</div>'}
                <div class="favorite-icon ${video.favorite ? 'is-favorite' : ''}"
                     onclick="event.stopPropagation(); app.toggleFavorite(${video.id}, ${!video.favorite})"
                     title="${video.favorite ? 'Remove from favorites' : 'Add to favorites'}">
                    ${video.favorite ? '★' : '☆'}
                </div>
            </div>
            <div class="video-info">
                <div class="video-header">
                    <div class="video-title-row">
                        <h3 class="video-title" title="${video.display_name || video.name}">${video.display_name || video.name}</h3>
                        ${this.createEditedVideoBadge(video.name)}
                        <div class="video-title-faces">${facesHtml}</div>
                        ${channelBadge}
                    </div>
                </div>
                ${metadataWithTags}
                ${actorsCompact ? `<div class="video-actors-row"><div class="compact-actors">${actorsCompact}</div></div>` : ''}
                <div class="video-footer">
                    <div class="video-actions">
                        <button class="add-tag-btn" title="Add tag" onclick="event.stopPropagation(); event.preventDefault(); app.showTagModal(${video.id}, '${video.name}')">🏷️</button>
                        <button class="scene-desc-btn" title="Add scene description" onclick="event.stopPropagation(); event.preventDefault(); app.showSceneDescriptionModal(${video.id}, '${video.name.replace(/'/g, "\\'")}')" >📝</button>
                        <button class="review-faces-btn" title="Review faces" onclick="event.stopPropagation(); event.preventDefault(); app.showVideoFacesReviewModal(${video.id})">👤</button>
                        <button class="refresh-btn" title="Refresh" onclick="event.stopPropagation(); event.preventDefault(); app.refreshVideo(${video.id})">🔄</button>
                        <button class="move-btn" title="Move" onclick="event.stopPropagation(); event.preventDefault(); app.showMoveModal(${video.id}, '${video.name}')">↗</button>
                        <button class="context-menu-btn" onclick="event.stopPropagation(); event.preventDefault(); app.showVideoContextMenu(event, ${video.id}, '${video.name.replace(/'/g, "\\'")}')">⋯</button>
                    </div>
                    <div class="video-path" title="${folderDisplayName}">
                        ${this.nav.createNavigablePath(video)}
                    </div>
                </div>
            </div>
        `;

        // Register lazy images with intersection observer
        const lazyImage = card.querySelector('.lazy-image');
        if (lazyImage) {
            this.imageObserver.observe(lazyImage);
        }

        // No card click handler - only thumbnail clicks play video
        return card;
    }



    navigateToFolder(category, subcategory) {
        if (subcategory) {
            return this.nav.navigateToSubcategory(category, subcategory);
        } else {
            return this.nav.navigateToCategory(category);
        }
    }

    // ==================== VIDEO PLAYER METHODS (delegated to VideoPlayerModule) ====================

    playVideo(video) { this.videoPlayer.playVideo(video) }
    playVideoFromData(videoDataString) { this.videoPlayer.playVideoFromData(videoDataString) }

    filterByTag(tagName) {
        // Navigate to a separate tag results view instead of filtering in-place
        console.log(`🏷️ Filtering by tag: ${tagName}`);

        // Use the complete catalog for searching
        let searchSource = this.allVideosCatalog && this.allVideosCatalog.length > 0 ? this.allVideosCatalog : this.allVideos;

        if (!searchSource || searchSource.length === 0) {
            searchSource = this.allVideos;
        }

        // Filter videos containing this tag
        const tagVideos = searchSource.filter(video => {
            if (!video.tags) return false;
            return video.tags.some(tag => tag.name === tagName);
        });

        console.log(`📊 Found ${tagVideos.length} video(s) with tag: ${tagName}`);

        // Save current state for "back" button
        this.previousView = {
            view: this.currentView,
            videos: this.videos,
            currentCategory: this.currentCategory,
            currentSubcategory: this.currentSubcategory,
            currentSearch: this.currentSearch
        };

        // Hide main UI elements (using DOM cache)
        const listViewControls = this.dom.get('listViewControls');
        const folderExplorer = this.dom.get('folderExplorer');
        const videoGrid = this.dom.get('videoGrid');
        if (listViewControls) listViewControls.style.display = 'none';
        if (folderExplorer) folderExplorer.style.display = 'none';
        if (videoGrid) videoGrid.style.display = 'none';

        // Switch to tag results view
        this.currentView = 'tag-results';
        this.videos = tagVideos;
        this.currentTagFilter = tagName;

        // Render tag results view with back button
        this.renderTagResultsView(tagName);

        console.log(`🏷️ Found ${tagVideos.length} video(s) with "${tagName}"`)
    }

    filterByFace(faceId, faceName) {
        // Navigate to a separate face results view instead of filtering in-place
        console.log(`🎭 Filtering by face: ${faceName} (ID: ${faceId})`);

        // Use the complete catalog for searching
        let searchSource = this.allVideosCatalog && this.allVideosCatalog.length > 0 ? this.allVideosCatalog : this.allVideos;

        if (!searchSource || searchSource.length === 0) {
            searchSource = this.allVideos;
        }

        // Filter videos containing this face
        const faceVideos = searchSource.filter(video => {
            if (!video.faces) return false;
            return video.faces.some(face => face.id === faceId);
        });

        const totalEmbeddings = faceVideos.reduce((sum, v) => {
            return sum + (v.faces ? v.faces.filter(f => f.id === faceId).length : 0);
        }, 0);

        console.log(`📊 Found ${faceVideos.length} video(s) with ${totalEmbeddings} total embeddings of: ${faceName}`);

        // Save current state for "back" button
        this.previousView = {
            view: this.currentView,
            videos: this.videos,
            currentCategory: this.currentCategory,
            currentSubcategory: this.currentSubcategory,
            currentSearch: this.currentSearch
        };

        // Hide main UI elements (using DOM cache)
        const listViewControlsFace = this.dom.get('listViewControls');
        const folderExplorerFace = this.dom.get('folderExplorer');
        const videoGridFace = this.dom.get('videoGrid');
        if (listViewControlsFace) listViewControlsFace.style.display = 'none';
        if (folderExplorerFace) folderExplorerFace.style.display = 'none';
        if (videoGridFace) videoGridFace.style.display = 'none';

        // Switch to face results view
        this.currentView = 'face-results';
        this.videos = faceVideos;
        this.currentFaceFilter = { id: faceId, name: faceName };

        // Render face results view with back button
        this.renderFaceResultsView(faceName, totalEmbeddings);

        console.log(`🎭 Found ${faceVideos.length} video(s) with ${faceName}`)
    }

    renderFaceResultsView(faceName, embeddingCount) {
        /**
         * Render a dedicated view for face search results
         */
        const videoGrid = this.dom.get('videoGrid');
        if (!videoGrid) return;

        videoGrid.style.display = 'block';
        videoGrid.innerHTML = `
            <div style="padding: 20px 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 0 20px;">
                    <div>
                        <h2 style="margin: 0 0 5px 0; color: #111827;">🎭 ${this.escapeHtml(faceName)}</h2>
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">
                            Found ${this.videos.length} video${this.videos.length !== 1 ? 's' : ''} with ${embeddingCount} total appearance${embeddingCount !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <button 
                        onclick="app.goBackToPreviousView()" 
                        style="
                            padding: 10px 16px;
                            background: #6366f1;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        "
                    >
                        ← Back
                    </button>
                </div>
                <div id="face-results-grid" class="video-grid"></div>
            </div>
        `;

        // Render videos in grid
        const resultsGrid = document.getElementById('face-results-grid');
        if (resultsGrid) {
            const fragment = document.createDocumentFragment();
            this.videos.forEach(video => {
                const card = this.createVideoCard(video);
                fragment.appendChild(card);
            });
            resultsGrid.appendChild(fragment);
        }
    }

    goBackToPreviousView() {
        /**
         * Return to the previous view before face/tag filtering
         */
        if (!this.previousView) {
            console.warn('No previous view to restore');
            this.currentView = 'explorer';
            this.switchView('explorer', true, false);
            return;
        }

        // Show main UI elements
        const listViewControls = document.getElementById('listViewControls');
        const folderExplorer = document.getElementById('folderExplorer');
        const videoGrid = document.getElementById('videoGrid');

        if (listViewControls) listViewControls.style.display = 'block';
        if (folderExplorer) folderExplorer.style.display = this.previousView.view === 'explorer' ? 'block' : 'none';

        // Clear the grid and reset its styling
        if (videoGrid) {
            videoGrid.innerHTML = '';
            videoGrid.style.display = '';  // Clear inline display style
            videoGrid.className = 'video-grid';  // Reset to base class
            // Apply vertical mode if needed
            if (this.verticalMode) {
                videoGrid.classList.add('vertical-mode');
            }
        }

        // Restore previous state
        this.currentView = this.previousView.view;
        this.videos = this.previousView.videos;
        this.currentCategory = this.previousView.currentCategory;
        this.currentSubcategory = this.previousView.currentSubcategory;
        this.currentSearch = this.previousView.currentSearch;
        this.currentFaceFilter = null;
        this.currentTagFilter = '';  // Clear tag filter when going back

        console.log(`↩️ Restored previous view: ${this.currentView}`);

        // Re-render based on previous view
        if (this.currentView === 'explorer') {
            this.renderMainCategories();
        } else if (this.currentView === 'category') {
            this.showCategory(this.currentCategory, this.currentSubcategory);
        } else if (this.currentView === 'search') {
            this.performSearch(this.currentSearch);
        } else {
            // Return to collection view - reset pagination
            this.currentPage = 0;
            this.renderVideoGrid();
        }
    }

    renderTagResultsView(tagName) {
        /**
         * Render a dedicated view for tag search results
         */
        const videoGrid = document.getElementById('videoGrid');
        if (!videoGrid) return;

        videoGrid.style.display = 'block';
        videoGrid.innerHTML = `
            <div style="padding: 20px 0;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding: 0 20px;">
                    <div>
                        <h2 style="margin: 0 0 5px 0; color: #111827;">🏷️ ${this.escapeHtml(tagName)}</h2>
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">
                            Found ${this.videos.length} video${this.videos.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                    <button 
                        onclick="app.goBackToPreviousView()" 
                        style="
                            padding: 10px 16px;
                            background: #6366f1;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                        "
                    >
                        ← Back
                    </button>
                </div>
                <div id="tag-results-grid" class="video-grid"></div>
            </div>
        `;

        // Render videos in grid
        const resultsGrid = document.getElementById('tag-results-grid');
        if (resultsGrid) {
            const fragment = document.createDocumentFragment();
            this.videos.forEach(video => {
                const card = this.createVideoCard(video);
                fragment.appendChild(card);
            });
            resultsGrid.appendChild(fragment);
        }
    }

    async linkFaceToVideo(faceId, videoId, detectionMethod = 'manual_search') {
        /**
         * Link a face to a video in the video_faces junction table
         * This creates the permanent relationship that persists across refreshes
         */
        try {
            // Use centralized API client
            const result = await this.api.linkFaceToVideo(videoId, faceId, detectionMethod);
            console.log(`✓ Linked face ${faceId} to video ${videoId}:`, result);
            return true;
        } catch (error) {
            console.error('❌ Error linking face to video:', error);
            return false;
        }
    }

    async refreshVideoFaces(videoId) {
        /**
         * Refresh face data for a specific video and update the UI immediately
         * This makes face icons appear without requiring a page refresh
         * Uses cache-busting to ensure fresh data from backend
         */
        try {
            console.log(`🔄 Starting refreshVideoFaces for video ID: ${videoId}`);

            // Fetch updated face data for this video with cache busting
            const timestamp = Date.now();
            const response = await fetch(`${this.apiBase}/api/videos/${videoId}/faces?_t=${timestamp}&cache=${Math.random()}`, {
                cache: 'no-store'
            });
            if (!response.ok) {
                console.error('❌ Failed to fetch video faces - HTTP', response.status);
                return;
            }

            const data = await response.json();
            const updatedFaces = data.faces;

            console.log(`✓ Fetched ${updatedFaces.length} face(s) from backend:`, updatedFaces);

            // Update this video in allVideos array
            const videoInAll = this.allVideos.find(v => v.id === videoId);
            if (videoInAll) {
                videoInAll.faces = updatedFaces;
                videoInAll.face_count = updatedFaces.length;
                console.log(`✓ Updated allVideos array for video ${videoId}`);
            } else {
                console.warn(`⚠️ Video ${videoId} not found in allVideos array`);
            }

            // Update this video in current displayed videos array
            const videoInCurrent = this.videos.find(v => v.id === videoId);
            if (videoInCurrent) {
                videoInCurrent.faces = updatedFaces;
                videoInCurrent.face_count = updatedFaces.length;
                console.log(`✓ Updated videos array for video ${videoId}`);

                // Re-render just this video card to show the face icons immediately
                const videoCard = document.querySelector(`[data-video-id="${videoId}"]`);
                if (videoCard) {
                    console.log(`✓ Found video card in DOM for video ${videoId}, replacing...`);
                    const updatedCard = this.createVideoCard(videoInCurrent);
                    videoCard.replaceWith(updatedCard);
                    console.log(`✨ Video card updated with ${updatedFaces.length} face icon(s)`);
                } else {
                    console.warn(`⚠️ Video card not found in DOM (not currently visible).`);
                    console.log(`💡 Tip: Close the video player to see the face icon on the video card.`);
                }
            } else {
                console.warn(`⚠️ Video ${videoId} not found in videos array (might be filtered out).`);
                console.log(`💡 Tip: Clear filters or search to see this video with its face icon.`);
            }

        } catch (error) {
            console.error('❌ Error refreshing video faces:', error);
        }
    }

    clearFilters() {
        // Dismiss all active toast notifications
        this.dismissAllToasts();

        // Clear search input
        document.getElementById('searchInput').value = '';
        this.currentSearchQuery = '';

        // Clear tag filter
        document.getElementById('tagFilter').value = '';
        this.currentTagFilter = '';

        // Clear ALL metadata filters
        document.getElementById('seriesFilter').value = '';
        this.currentSeriesFilter = '';

        document.getElementById('yearFilter').value = '';
        this.currentYearFilter = '';

        document.getElementById('channelFilter').value = '';
        this.currentChannelFilter = '';

        document.getElementById('ratingFilter').value = '';
        this.currentRatingFilter = '';

        document.getElementById('favoriteFilter').checked = false;
        this.currentFavoriteFilter = false;

        // Select ALL folders (opposite of the default empty state)
        // Get all folders from structure, or extract from cached videos if available
        let allFolders = this.folderStructure.all_folders || [];
        if (allFolders.length === 0 && this.allVideosCatalog && this.allVideosCatalog.length > 0) {
            // Extract unique folder names from cached videos
            const folderSet = new Set(this.allVideosCatalog.map(v => v.category).filter(Boolean));
            allFolders = Array.from(folderSet);
            console.log(`📂 Extracted ${allFolders.length} folders from cached videos`);
        }
        this.currentFolderFilter = [...allFolders];
        const checkboxes = document.querySelectorAll('#folderFilterList input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
        document.getElementById('selectAllFolders').checked = true;
        this.updateFolderFilterButton();

        // Load correct view based on current view mode
        if (this.currentView === 'list') {
            // Collection View: Show all videos without folder filtering
            this.showAllVideosInCollection();
        } else {
            // Explorer View: Load "All Videos" category
            this.loadCategory('_all');
        }

        // Save cleared state to localStorage
        this.saveSettingsToStorage();
    }

    setupLazyLoading() { this.collectionModule.setupLazyLoading() }

    setupInfiniteScroll() { this.collectionModule.setupInfiniteScroll() }

    async loadMoreVideos() { return this.collectionModule.loadMoreVideos() }

    updateLoadMoreButton() { this.collectionModule.updateLoadMoreButton() }

    showVideoPlayer(video, videoUrl, urlType = 'stream') { this.videoPlayer.showVideoPlayer(video, videoUrl, urlType) }
    getVideoMimeType(videoUrl) { return this.videoPlayer.getVideoMimeType(videoUrl) }

    // Helper methods for handling Duplicates Review View with modals - delegated to duplicateModule
    hideDuplicatesReviewIfActive() {
        return this.duplicateModule.hideDuplicatesReviewIfActive()
    }

    restoreDuplicatesReviewIfNeeded() {
        return this.duplicateModule.restoreDuplicatesReviewIfNeeded()
    }

    hideVideoPlayer(isTransition = false) { this.videoPlayer.hideVideoPlayer(isTransition) }

    toggleVideoLoop() {
        const videoPlayer = document.getElementById('videoPlayer');
        const loopToggleBtn = document.getElementById('loopToggleBtn');

        if (!videoPlayer || !videoPlayer.src) {
            return;
        }

        // Toggle loop state
        videoPlayer.loop = !videoPlayer.loop;

        // Update button visual state
        if (videoPlayer.loop) {
            loopToggleBtn.classList.add('active');
            console.log('🔁 Loop enabled');
        } else {
            loopToggleBtn.classList.remove('active');
            console.log('Loop disabled');
        }
    }

    showVideoPlayerMenu(event) {
        const menu = document.getElementById('videoPlayerMenu');
        if (menu) {
            // Toggle menu visibility
            if (menu.style.display === 'none') {
                menu.style.display = 'flex';
                // Close menu when clicking outside
                setTimeout(() => {
                    document.addEventListener('click', (e) => {
                        if (!e.target.closest('.video-player-menu-container')) {
                            menu.style.display = 'none';
                        }
                    }, { once: true });
                }, 0);
            } else {
                menu.style.display = 'none';
            }
        }
    }

    showImagePlayerMenu(event) {
        const menu = document.getElementById('imagePlayerMenu');
        if (menu) {
            // Toggle menu visibility
            if (menu.style.display === 'none') {
                menu.style.display = 'flex';
                // Close menu when clicking outside
                setTimeout(() => {
                    document.addEventListener('click', (e) => {
                        if (!e.target.closest('.video-player-menu-container')) {
                            menu.style.display = 'none';
                        }
                    }, { once: true });
                }, 0);
            } else {
                menu.style.display = 'none';
            }
        }
    }

    // ===== IMAGE VIEWER METHODS (delegated to ImageViewerModule) =====
    openImageViewer(image) { this.imageViewer.openImageViewer(image) }

    hideImageViewer(isTransition = false) { this.imageViewer.hideImageViewer(isTransition) }
    showNextImage() { this.imageViewer.showNextImage() }
    showPreviousImage() { this.imageViewer.showPreviousImage() }

    showMoveImageModal(imageId, imageName) { this.imageViewer.showMoveImageModal(imageId, imageName) }
    hideMoveImageModal() { this.imageViewer.hideMoveImageModal() }
    async moveImageToFolder(folderName) { await this.imageViewer.moveImageToFolder(folderName) }
    showTagImageModal(imageId, imageName) { this.imageViewer.showTagImageModal(imageId, imageName) }
    hideTagImageModal() { this.imageViewer.hideTagImageModal() }
    renderTagImagePlayerGrid() { this.imageViewer.renderTagImagePlayerGrid() }
    async addTagToImageViewer(tagId, tagName) { await this.imageViewer.addTagToImageViewer(tagId, tagName) }
    setupImageKeyboardControls() { this.imageViewer.setupImageKeyboardControls() }
    cleanupImageKeyboardControls() { this.imageViewer.cleanupImageKeyboardControls() }

    async autoScanImageFaces(image) {
        /**
         * Auto-scan image for faces using client-side face-api.js detection
         * Captures faces, displays them in a modal, lets user select which to search
         */
        const imageViewer = document.getElementById('imageViewer');

        if (!imageViewer || !imageViewer.src) {
            console.error('Image viewer not ready');
            return;
        }

        // Initialize arrays for this scan
        this.autoScanDetectedFaces = [];
        this.selectedAutoScanFaces = new Set();

        // Show overlay: Detecting
        this.showFaceSearchOverlay('Detecting faces...', 2);

        try {
            // Load face-api.js models if not already loaded
            if (!this.faceApiLoaded) {
                await this.loadFaceApiModels();
            }

            // Detect faces in the image
            const detections = await faceapi
                .detectAllFaces(imageViewer, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (!detections || detections.length === 0) {
                this.showFaceSearchOverlay('No faces detected', 2, true, true);
                console.warn('⚠️ No faces detected in image');
                return;
            }

            console.log(`📊 Detected ${detections.length} faces in image`);

            // PHASE 1: Extract faces from image
            // Create a canvas from the image element
            const canvas = document.createElement('canvas');
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = async () => {
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // PHASE 2: Extract and display each detected face
                for (const detection of detections) {
                    const box = detection.detection.box;

                    // Crop face from canvas
                    const faceCanvas = document.createElement('canvas');
                    const padding = 20;
                    faceCanvas.width = box.width + padding * 2;
                    faceCanvas.height = box.height + padding * 2;
                    const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });

                    faceCtx.drawImage(
                        canvas,
                        Math.max(0, box.x - padding),
                        Math.max(0, box.y - padding),
                        box.width + padding * 2,
                        box.height + padding * 2,
                        0,
                        0,
                        faceCanvas.width,
                        faceCanvas.height
                    );

                    const faceImageData = faceCanvas.toDataURL('image/jpeg', 0.95);

                    this.autoScanDetectedFaces.push({
                        id: this.autoScanDetectedFaces.length,
                        imageData: faceImageData,
                        confidence: detection.detection.score
                    });
                }

                console.log(`✓ Extracted ${this.autoScanDetectedFaces.length} faces from image`);

                // Show modal with detected faces for user selection
                this.showAutoScanModal(this.autoScanDetectedFaces, image);
                this.hideFaceSearchOverlay();
            };

            img.onerror = () => {
                console.error('Failed to load image for face extraction');
                this.showFaceSearchOverlay('Failed to load image', 2, true, true);
            };

            // Load the image
            img.src = imageViewer.src;

        } catch (error) {
            console.error('❌ Error auto-scanning image for faces:', error);
            this.showFaceSearchOverlay('Detection failed', 2, true, true);
        }
    }

    quickFaceSearchFromImage(image) {
        /**
         * Quick face search from image - uses face-api.js to detect faces and search
         */
        const imageViewer = document.getElementById('imageViewer');

        if (!imageViewer || !imageViewer.src) {
            return;
        }

        // Show overlay: Loading models
        this.showFaceSearchOverlay('Loading models...', 1);

        // Use face-api to detect faces in the image element
        const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

        // Use setTimeout to ensure overlay is rendered before loading models
        setTimeout(async () => {
            try {
                // Load models
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
                ]);

                // Update overlay: Detecting
                this.showFaceSearchOverlay('Detecting...', 2);

                // Detect faces
                const detectionOptions = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 });
                console.log('🔍 Detecting faces with minConfidence: 0.3');
                const results = await faceapi.detectAllFaces(imageViewer, detectionOptions)
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                console.log(`📊 Face-api detection results: ${results.length} faces found`);

                if (results.length === 0) {
                    console.warn('⚠️ Face-api found no faces - trying alternative detection...');
                    this.showFaceSearchOverlay('No faces detected', 2, true, true);
                    return;
                }

                // Update overlay: Searching
                this.showFaceSearchOverlay('Searching...', 3);

                // Initialize counter to track when all searches are complete
                this.imageSearchFaceCount = results.length;
                this.imageSearchCompleteCount = 0;

                // Search for each face detected
                results.forEach((detectionWithLandmarks, index) => {
                    console.log(`Face ${index + 1}: confidence=${detectionWithLandmarks.detection.score.toFixed(3)}, box=[${Math.round(detectionWithLandmarks.detection.box.x)},${Math.round(detectionWithLandmarks.detection.box.y)},${Math.round(detectionWithLandmarks.detection.box.width)}x${Math.round(detectionWithLandmarks.detection.box.height)}]`);
                    this.searchFaceFromImage(imageViewer, detectionWithLandmarks, `Face ${index + 1} from image`, image);
                });
            } catch (error) {
                console.error('Error detecting faces:', error);
                this.showFaceSearchOverlay('Detecting failed', 2, true, true);
            }
        }, 0);
    }

    async searchFaceFromImage(imageElement, detectionWithLandmarks, faceLabel, imageObject = null) {
        /**
         * Search a face detected from an image file (not from video)
         * Extracts the face region, converts to base64, and searches via backend API
         *
         * @param imageObject - The image object with ID for linking detected faces
         */
        try {
            const detection = detectionWithLandmarks.detection;
            const box = detection.box;

            // Create canvas to extract face region
            const faceCanvas = document.createElement('canvas');
            const faceCtx = faceCanvas.getContext('2d');

            // Set canvas size to face dimensions
            faceCanvas.width = box.width;
            faceCanvas.height = box.height;

            // Draw the face region from the image
            faceCtx.drawImage(
                imageElement,
                box.x, box.y, box.width, box.height,
                0, 0, box.width, box.height
            );

            // Convert to base64 JPEG
            const imageData = faceCanvas.toDataURL('image/jpeg', 0.95);

            // Create face object with required properties
            const faceObj = {
                imageData: imageData,
                confidence: detection.score,
                box: { x: box.x, y: box.y, width: box.width, height: box.height }
            };

            console.log(`🔍 Searching for ${faceLabel} from image...`);

            // Convert base64 to blob
            const response = await fetch(imageData);
            const blob = await response.blob();

            // Create form data
            // Note: video_id and frame_timestamp are required by backend but not used for image search
            const formData = new FormData();
            formData.append('face_image', blob, 'face.jpg');
            formData.append('video_id', '-1');  // Dummy value for image search
            formData.append('frame_timestamp', '0');  // Dummy value for image search
            formData.append('threshold', '0.4');

            // Search for similar faces via backend API
            const searchResponse = await fetch(`${this.apiBase}/api/faces/search`, {
                method: 'POST',
                body: formData
            });

            if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                console.error('❌ Backend face search failed:', errorText);
                throw new Error(`Backend error: ${errorText}`);
            }

            const searchResult = await searchResponse.json();
            console.log(`✓ Backend found ${searchResult.matches.length} matches for ${faceLabel}`);

            // Store search data for the modal
            const searchData = {
                face: faceObj,
                confidence: detection.score,
                quality_score: searchResult.quality_score || 0.5,
                matches: searchResult.matches || [],
                label: faceLabel,
                encoding: searchResult.encoding,
                thumbnail: searchResult.thumbnail,
                isImageSearch: true,  // Mark this as image search (no video context)
                imageId: imageObject ? imageObject.id : null,  // Image ID for linking
                imageName: imageObject ? (imageObject.display_name || imageObject.name) : null
            };

            // Store search data for button handlers
            this.currentFaceSearchData = searchData;

            // Show search results modal (overlay will be hidden there)
            this.showFaceSearchModal(searchData);

            // Increment completion counter
            this.imageSearchCompleteCount = (this.imageSearchCompleteCount || 0) + 1;

        } catch (error) {
            console.error(`Error searching for ${faceLabel}:`, error);
            // Increment completion counter even on error
            this.imageSearchCompleteCount = (this.imageSearchCompleteCount || 0) + 1;

            // Hide overlay if all searches are done
            if (this.imageSearchCompleteCount >= this.imageSearchFaceCount) {
                this.showFaceSearchOverlay('Search failed', 3, true, true);
            }
        }
    }

    async captureImageAsThumbnail(imageObject) {
        /**
         * Capture image as thumbnail (extract the image and save as thumbnail)
         * Works for images in the viewer
         */
        try {
            if (!imageObject) {
                console.error('No image to capture');
                return;
            }

            const imageViewer = document.getElementById('imageViewer');
            if (!imageViewer || !imageViewer.src) {
                console.error('Image viewer not ready');
                return;
            }

            // Show visual feedback
            this.showThumbnailCaptureEffect();

            // Create canvas to draw the image
            const canvas = document.createElement('canvas');
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = async () => {
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                // Convert to blob
                canvas.toBlob(async (blob) => {
                    try {
                        // Send to backend as thumbnail
                        const formData = new FormData();
                        formData.append('thumbnail', blob);
                        formData.append('format', 'jpeg');

                        const response = await fetch(`${this.apiBase}/api/images/${imageObject.id}/thumbnail`, {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            console.log(`📸 Thumbnail updated for image ${imageObject.id}`);
                            // Update the image card
                            this.updateImageCardAfterThumbnailChange(imageObject.id);
                        } else {
                            console.error('Failed to update thumbnail:', response.statusText);
                        }
                    } catch (error) {
                        console.error('Error saving thumbnail:', error);
                    }
                }, 'image/jpeg', 0.9);
            };

            img.onerror = () => {
                console.error('Failed to load image for thumbnail capture');
            };

            // Load the image
            img.src = imageViewer.src;

        } catch (error) {
            console.error('Error capturing image as thumbnail:', error);
        }
    }

    async copyImageFrameToClipboard(imageObject) {
        /**
         * Copy image frame to clipboard
         * Uses Canvas API to capture and Clipboard API to copy
         */
        try {
            if (!imageObject) {
                console.error('No image to copy');
                return;
            }

            const imageViewer = document.getElementById('imageViewer');
            if (!imageViewer || !imageViewer.src) {
                console.error('Image viewer not ready');
                return;
            }

            // Check if Clipboard API is supported
            if (!navigator.clipboard || !navigator.clipboard.write) {
                console.error('Clipboard API not supported');
                return;
            }

            // Create canvas to draw the image
            const canvas = document.createElement('canvas');
            const img = new Image();
            img.crossOrigin = 'anonymous';

            img.onload = async () => {
                try {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);

                    // Convert canvas to blob
                    const blob = await new Promise((resolve) => {
                        canvas.toBlob(resolve, 'image/png');
                    });

                    if (!blob) {
                        throw new Error('Failed to create image blob');
                    }

                    // Create ClipboardItem and write to clipboard
                    const clipboardItem = new ClipboardItem({ 'image/png': blob });
                    await navigator.clipboard.write([clipboardItem]);

                    // Show visual feedback
                    this.showFrameCopyEffect();
                    console.log(`📋 Image copied to clipboard (${canvas.width}x${canvas.height})`);

                } catch (error) {
                    console.error('Failed to copy image to clipboard:', error);
                }
            };

            img.onerror = () => {
                console.error('Failed to load image for clipboard copy');
            };

            // Load the image
            img.src = imageViewer.src;

        } catch (error) {
            console.error('Error copying image frame to clipboard:', error);
        }
    }

    setupImageSwipeNavigation() { this.imageViewer.setupImageSwipeNavigation() }
    cleanupImageSwipeNavigation() { this.imageViewer.cleanupImageSwipeNavigation() }

    setupImageZoomPan() { this.imageViewer.setupImageZoomPan() }
    cleanupImageZoomPan() { this.imageViewer.cleanupImageZoomPan() }

    hideImagePlayerMenu() {
        const menu = document.getElementById('imagePlayerMenu');
        if (menu) {
            menu.remove();
        }
    }

    toggleImageFullscreen() {
        // Toggle fullscreen for image viewer container (not the img element) ✅ FIXED
        this.hideImagePlayerMenu();
        // Fullscreen on the container, not the img element, so CSS transforms work properly
        const imageViewerContainer = document.querySelector('.image-viewer-container');
        if (imageViewerContainer && imageViewerContainer.requestFullscreen) {
            imageViewerContainer.requestFullscreen().catch(err => {
                console.warn('Fullscreen request failed:', err);
            });
        }
    }

    hideVideoPlayerMenu() {
        const menu = document.getElementById('videoPlayerMenu');
        if (menu) {
            menu.remove();
        }
    }

    handlePlayerMenuClickOutside(event) {
        const menu = document.getElementById('videoPlayerMenu');
        if (menu && !menu.contains(event.target)) {
            this.hideVideoPlayerMenu();
        }
    }

    toggleVideoLoopFromMenu() {
        this.hideVideoPlayerMenu();

        const videoPlayer = document.getElementById('videoPlayer');
        if (!videoPlayer || !videoPlayer.src) {
            return;
        }

        // Toggle loop state
        videoPlayer.loop = !videoPlayer.loop;

        // Console log for debugging
        if (videoPlayer.loop) {
            console.log('🔁 Loop enabled');
        } else {
            console.log('Loop disabled');
        }
    }

    // ==================== CURATION MODE ====================

    setupCurationMode(videoPlayer) {
        /**
         * Set up curation mode for mobile/desktop when video/image is playing
         * Shows action bar on 2-finger tap, allows delete & favorite while playing
         * Persistent: stays active until user closes it
         */
        const actionBar = document.getElementById('curationActionBar');
        const curationFavBtn = document.getElementById('curationFavBtn');
        const curationDeleteBtn = document.getElementById('curationDeleteBtn');
        const curationNextBtn = document.getElementById('curationNextBtn');
        const curationCloseBtn = document.getElementById('curationCloseBtn');

        // Clean up old handlers if they exist (for video->image or image->video transitions)
        if (this.curationEventListeners) {
            const { videoPlayer: oldVideoPlayer, imageViewer: oldImageViewer } = this.curationEventListeners;
            if (oldVideoPlayer && oldVideoPlayer.handleTouchStart && oldVideoPlayer.handleTouchEnd) {
                oldVideoPlayer.removeEventListener('touchstart', oldVideoPlayer.handleTouchStart);
                oldVideoPlayer.removeEventListener('touchend', oldVideoPlayer.handleTouchEnd);
            }
            if (oldImageViewer && oldImageViewer.handleTouchStart && oldImageViewer.handleTouchEnd) {
                oldImageViewer.removeEventListener('touchstart', oldImageViewer.handleTouchStart);
                oldImageViewer.removeEventListener('touchend', oldImageViewer.handleTouchEnd);
            }
        }

        let hideTimeout = null;

        // Show action bar
        const showCurationBar = () => {
            actionBar.classList.add('visible');
            this.updateCurationFavoriteButton();

            // Clear any existing auto-hide timeout
            if (hideTimeout) clearTimeout(hideTimeout);
            // Do NOT set auto-hide timeout - bar stays visible until user closes it
        };

        const hideCurationBar = () => {
            if (hideTimeout) clearTimeout(hideTimeout);
            actionBar.classList.remove('visible');
        };

        // Store the current toggle state to persist across video/image changes
        if (!this.curationBarVisible) {
            this.curationBarVisible = false;
        }

        // Gesture detection:
        // 2-finger tap → show tags modal
        // 3-finger tap → show curation bar
        let twoFingerTouchStart = false;
        let threeFingerTouchStart = false;

        const handleTouchStart = (e) => {
            // Track fingers
            if (e.touches.length === 2) {
                twoFingerTouchStart = true;
                threeFingerTouchStart = false;
            } else if (e.touches.length === 3) {
                threeFingerTouchStart = true;
                twoFingerTouchStart = false;
            } else {
                twoFingerTouchStart = false;
                threeFingerTouchStart = false;
            }
        };

        const handleTouchEnd = (e) => {
            // Check if this was a two-finger tap - show tags modal
            if (twoFingerTouchStart && e.changedTouches.length >= 1) {
                twoFingerTouchStart = false;
                const currentItem = this.currentVideoInPlayer || this.currentImageInViewer;
                if (currentItem) {
                    if (this.isMobileDevice()) {
                        this.showMobileTagModal(currentItem.id, currentItem.name);
                    } else {
                        this.showTagModal(currentItem.id, currentItem.name);
                    }
                }
            }
            // Check if this was a three-finger tap - toggle curation bar
            else if (threeFingerTouchStart && e.changedTouches.length >= 1) {
                threeFingerTouchStart = false;

                // Toggle curation bar
                if (this.curationBarVisible) {
                    hideCurationBar();
                    this.curationBarVisible = false;
                } else {
                    showCurationBar();
                    this.curationBarVisible = true;
                }
            } else if (e.touches.length === 0) {
                // Reset flags when all touches are released
                twoFingerTouchStart = false;
                threeFingerTouchStart = false;
            }
        };

        // Add listeners to both video and image players
        if (videoPlayer) {
            videoPlayer.addEventListener('touchstart', handleTouchStart, { passive: true });
            videoPlayer.addEventListener('touchend', handleTouchEnd, { passive: true });
            // Store reference for cleanup
            videoPlayer.handleTouchStart = handleTouchStart;
            videoPlayer.handleTouchEnd = handleTouchEnd;
        }

        const imageViewer = document.getElementById('imageViewer');
        if (imageViewer) {
            imageViewer.addEventListener('touchstart', handleTouchStart, { passive: true });
            imageViewer.addEventListener('touchend', handleTouchEnd, { passive: true });
            // Store reference for cleanup
            imageViewer.handleTouchStart = handleTouchStart;
            imageViewer.handleTouchEnd = handleTouchEnd;
        }

        // Store current listeners for cleanup
        this.curationEventListeners = { videoPlayer, imageViewer };

        // On desktop, show keyboard shortcut hint
        if (!this.isMobileDevice()) {
            const hintEl = document.getElementById('curationKeysHint');
            if (hintEl) hintEl.style.display = 'block';
        }

        // Button click handlers - replace old ones entirely
        curationFavBtn.onclick = () => {
            this.curationToggleFavorite();
            // Bar stays visible after action
        };

        const curationTagBtn = document.getElementById('curationTagBtn');
        curationTagBtn.onclick = () => {
            // Show appropriate tag modal based on device type
            const currentItem = this.currentVideoInPlayer || this.currentImageInViewer;
            if (currentItem) {
                if (this.isMobileDevice()) {
                    this.showMobileTagModal(currentItem.id, currentItem.name);
                } else {
                    this.showTagModal(currentItem.id, currentItem.name);
                }
            }
            // Bar stays visible after action
        };

        curationDeleteBtn.onclick = () => {
            this.curationDeleteAndAdvance();
            // Bar stays visible for next video/image
        };

        curationNextBtn.onclick = () => {
            this.playNextVideo();
            // Bar stays visible for next video/image
        };

        curationCloseBtn.onclick = () => {
            hideCurationBar();
            this.curationBarVisible = false;
        };

        // Setup video player menu buttons
        const videoMenuFavBtn = document.getElementById('videoMenuFavBtn');
        const videoMenuTagBtn = document.getElementById('videoMenuTagBtn');
        const videoMenuDeleteBtn = document.getElementById('videoMenuDeleteBtn');

        if (videoMenuFavBtn) {
            videoMenuFavBtn.onclick = () => {
                this.curationToggleFavorite();
                document.getElementById('videoPlayerMenu').style.display = 'none';
            };
        }
        if (videoMenuTagBtn) {
            videoMenuTagBtn.onclick = () => {
                const currentItem = this.currentVideoInPlayer;
                if (currentItem) {
                    if (this.isMobileDevice()) {
                        this.showMobileTagModal(currentItem.id, currentItem.name);
                    } else {
                        this.showTagModal(currentItem.id, currentItem.name);
                    }
                }
                document.getElementById('videoPlayerMenu').style.display = 'none';
            };
        }
        if (videoMenuDeleteBtn) {
            videoMenuDeleteBtn.onclick = () => {
                this.curationDeleteAndAdvance();
                document.getElementById('videoPlayerMenu').style.display = 'none';
            };
        }

        // Setup image player menu buttons
        const imageMenuFavBtn = document.getElementById('imageMenuFavBtn');
        const imageMenuTagBtn = document.getElementById('imageMenuTagBtn');
        const imageMenuDeleteBtn = document.getElementById('imageMenuDeleteBtn');

        if (imageMenuFavBtn) {
            imageMenuFavBtn.onclick = () => {
                this.curationToggleFavorite();
                document.getElementById('imagePlayerMenu').style.display = 'none';
            };
        }
        if (imageMenuTagBtn) {
            imageMenuTagBtn.onclick = () => {
                const currentItem = this.currentImageInViewer;
                if (currentItem) {
                    if (this.isMobileDevice()) {
                        this.showMobileTagModal(currentItem.id, currentItem.name);
                    } else {
                        this.showTagModal(currentItem.id, currentItem.name);
                    }
                }
                document.getElementById('imagePlayerMenu').style.display = 'none';
            };
        }
        if (imageMenuDeleteBtn) {
            imageMenuDeleteBtn.onclick = () => {
                this.curationDeleteAndAdvance();
                document.getElementById('imagePlayerMenu').style.display = 'none';
            };
        }

        // Setup video player menu - Face Search, Face Tools and Close
        const videoMenuFaceSearchBtn = document.getElementById('videoMenuFaceSearchBtn');
        const videoMenuFaceBtn = document.getElementById('videoMenuFaceBtn');
        const videoMenuCloseBtn = document.getElementById('videoMenuCloseBtn');

        if (videoMenuFaceSearchBtn) {
            videoMenuFaceSearchBtn.onclick = () => {
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer) {
                    // Trigger quick face search on current video frame
                    document.getElementById('mobileSearchFaceBtn').click();
                }
                document.getElementById('videoPlayerMenu').style.display = 'none';
            };
        }
        if (videoMenuFaceBtn) {
            videoMenuFaceBtn.onclick = () => {
                const faceControls = document.getElementById('mobileFaceControls');
                if (faceControls) {
                    if (faceControls.classList.contains('visible')) {
                        faceControls.style.display = 'none';
                        faceControls.classList.remove('visible');
                    } else {
                        faceControls.style.display = 'flex';
                        faceControls.classList.add('visible');
                    }
                }
                document.getElementById('videoPlayerMenu').style.display = 'none';
            };
        }
        if (videoMenuCloseBtn) {
            videoMenuCloseBtn.onclick = () => {
                document.getElementById('videoPlayerMenu').style.display = 'none';
            };
        }

        // Setup image player menu - Face Tools, Face Search and Close
        const imageMenuFaceToolsBtn = document.getElementById('imageMenuFaceToolsBtn');
        const imageMenuFaceBtn = document.getElementById('imageMenuFaceBtn');
        const imageMenuCloseBtn = document.getElementById('imageMenuCloseBtn');

        if (imageMenuFaceToolsBtn) {
            imageMenuFaceToolsBtn.onclick = () => {
                const faceControls = document.getElementById('mobileFaceControls');
                if (faceControls) {
                    if (faceControls.classList.contains('visible')) {
                        faceControls.style.display = 'none';
                        faceControls.classList.remove('visible');
                    } else {
                        faceControls.style.display = 'flex';
                        faceControls.classList.add('visible');
                    }
                }
                document.getElementById('imagePlayerMenu').style.display = 'none';
            };
        }
        if (imageMenuFaceBtn) {
            imageMenuFaceBtn.onclick = () => {
                const currentImage = this.currentImageInViewer;
                if (currentImage) {
                    this.quickFaceSearchFromImage(currentImage);
                }
                document.getElementById('imagePlayerMenu').style.display = 'none';
            };
        }
        if (imageMenuCloseBtn) {
            imageMenuCloseBtn.onclick = () => {
                document.getElementById('imagePlayerMenu').style.display = 'none';
            };
        }

        // Store cleanup function for when modal closes
        // NOTE: Only reset curationBarVisible on explicit close, not on transitions
        this.curationCleanup = () => {
            if (hideTimeout) clearTimeout(hideTimeout);
            // Do NOT reset this.curationBarVisible here - only reset on explicit user close
        };
    }

    curationToggleFavorite() {
        /**
         * Toggle favorite for current video or image while in player
         * Updates button immediately without showing toast
         */
        const currentItem = this.currentVideoInPlayer || this.currentImageInViewer;
        if (!currentItem) return;
        const itemId = currentItem.id;
        const newFavoriteState = !currentItem.favorite;

        // Update local state immediately for UI
        currentItem.favorite = newFavoriteState;
        this.updateCurationFavoriteButton();

        // Call API in background (no toast)
        this.toggleFavorite(itemId, newFavoriteState);
    }

    updateCurationFavoriteButton() {
        /**
         * Update favorite button to show current state (works for both videos and images)
         * Styling: empty outline when not favorite, golden fill when favorite
         */
        const currentItem = this.currentVideoInPlayer || this.currentImageInViewer;
        if (!currentItem) return;

        const btn = document.getElementById('curationFavBtn');
        if (currentItem.favorite) {
            btn.textContent = '★';
            btn.classList.add('favorited');
            btn.title = 'Favorited (tap to remove)';
        } else {
            btn.textContent = '☆';
            btn.classList.remove('favorited');
            btn.title = 'Add to favorites';
        }
    }

    async curationDeleteAndAdvance() {
        /**
         * Delete current video/image and immediately play/show next (handles both video/image)
         * Uses existing deleteVideo function with auto-advance
         */
        // Support both video player and image viewer contexts
        const currentItem = this.currentVideoInPlayer || this.currentImageInViewer;
        if (!currentItem) return;
        const videoId = currentItem.id;
        const videoName = currentItem.name;

        try {
            // Move video to DELETE folder (soft delete, reversible)
            await this.api.deleteVideo(videoId);
            console.log('✅ Video moved to DELETE:', videoName);
            console.log('Video moved to DELETE folder')

            // Use unified list for removal and navigation
            const searchList = this.allVideos && this.allVideos.length > 0 ? this.allVideos : this.videos;
            const index = searchList.findIndex(v => v.id === videoId);

            // Also remove from this.videos if it exists there
            const videoIndex = this.videos.findIndex(v => v.id === videoId);
            if (videoIndex !== -1) {
                this.videos.splice(videoIndex, 1);
            }

            if (index !== -1) {
                searchList.splice(index, 1);
            }

            // Auto-advance to next item (video or image)
            if (searchList.length > 0) {
                // If we deleted from the end, loop to beginning
                const nextIndex = index < searchList.length ? index : 0;
                const nextItem = searchList[nextIndex];
                if (nextItem) {
                    setTimeout(() => {
                        if (nextItem.media_type === 'image') {
                            // Store current image index for consistent navigation
                            this.currentImageIndex = nextIndex;
                            this.openImageViewer(nextItem);
                            this.updateCurationFavoriteButton();  // Update favorite state for next item
                        } else {
                            this.playVideo(nextItem);
                            this.updateCurationFavoriteButton();  // Update favorite state for next item
                        }
                    }, 300); // Small delay for smooth transition
                }
            } else {
                // No more items, close appropriate viewer
                if (this.currentImageInViewer) {
                    this.hideImageViewer();
                } else {
                    this.hideVideoPlayer();
                }
                console.log('No more items in collection')
            }
        } catch (error) {
            console.error('Error deleting video:', error);
            console.log(`Failed to delete: ${error.message}`)
        }
    }

    setupVideoKeyboardControls(videoPlayer) { this.videoPlayer.setupVideoKeyboardControls(videoPlayer) }
    seekVideo(videoPlayer, seconds, absolute = false) { this.videoPlayer.seekVideo(videoPlayer, seconds, absolute) }
    showSeekFeedback(seconds) { this.videoPlayer.showSeekFeedback(seconds) }
    createSeekIndicator() { return this.videoPlayer.createSeekIndicator() }
    cleanupVideoKeyboardControls() { this.videoPlayer.cleanupVideoKeyboardControls() }

    setupTouchSeekControls(videoPlayer) {
        /**
         * Mobile touch seek: double-tap left edge to rewind, double-tap right edge to fast forward
         * Left 25% edge (0-25%) → Rewind 10s
         * Right 25% edge (75-100%) → Forward 10s
         * Center 50% is reserved for swipe navigation
         */

        // Remove any existing touch listener
        this.cleanupTouchSeekControls();

        let lastTapTime = 0;
        let lastTapX = 0;
        let lastTapZone = null; // 'left' or 'right'
        const doubleTapDelay = 300; // milliseconds
        const tapTolerance = 50; // pixels - taps must be within this distance

        this.touchSeekHandler = (e) => {
            // Ignore if tapping on native controls
            if (e.target.tagName === 'VIDEO' && e.target === videoPlayer) {
                const rect = videoPlayer.getBoundingClientRect();
                const tapX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
                const tapY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);

                // Check if tap is in the video area (not on controls at bottom)
                const controlsHeight = 50; // Approximate height of video controls
                if (tapY > rect.bottom - controlsHeight) {
                    return; // Tapped on controls, ignore
                }

                // Check if tap is in left 25% or right 25% edge zones
                const screenWidth = window.innerWidth;
                const leftBoundary = screenWidth * 0.25;
                const rightBoundary = screenWidth * 0.75;

                let currentZone = null;
                if (tapX < leftBoundary) {
                    currentZone = 'left';
                } else if (tapX > rightBoundary) {
                    currentZone = 'right';
                } else {
                    // Tapped in center 50%, ignore (reserved for swipe)
                    return;
                }

                const currentTime = Date.now();
                const timeSinceLastTap = currentTime - lastTapTime;
                const distanceFromLastTap = Math.abs(tapX - lastTapX);

                // Check if this is a double-tap in the same zone
                if (timeSinceLastTap < doubleTapDelay &&
                    distanceFromLastTap < tapTolerance &&
                    currentZone === lastTapZone) {
                    // Double-tap detected in same zone!
                    const seekAmount = 10; // seconds to seek

                    if (currentZone === 'left') {
                        // Double-tapped on left edge - rewind
                        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - seekAmount);
                        this.showSeekIndicator('left', seekAmount);
                    } else {
                        // Double-tapped on right edge - fast forward
                        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + seekAmount);
                        this.showSeekIndicator('right', seekAmount);
                    }

                    // Reset to prevent triple-tap
                    lastTapTime = 0;
                    lastTapX = 0;
                    lastTapZone = null;
                } else {
                    // First tap - record time, position, and zone
                    lastTapTime = currentTime;
                    lastTapX = tapX;
                    lastTapZone = currentZone;
                }
            }
        };

        videoPlayer.addEventListener('click', this.touchSeekHandler);
        videoPlayer.addEventListener('touchend', this.touchSeekHandler);
    }

    cleanupTouchSeekControls() {
        const videoPlayer = document.getElementById('videoPlayer');
        if (this.touchSeekHandler && videoPlayer) {
            videoPlayer.removeEventListener('click', this.touchSeekHandler);
            videoPlayer.removeEventListener('touchend', this.touchSeekHandler);
            this.touchSeekHandler = null;
        }
    }

    showSeekIndicator(direction, seconds) {
        /**
         * Show animated seek indicator (like YouTube)
         * Left: « 10s, Right: 10s »
         */
        const modal = document.getElementById('videoModal');
        const indicator = document.createElement('div');

        const isLeft = direction === 'left';
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            ${isLeft ? 'left: 20%' : 'right: 20%'};
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            font-size: 24px;
            font-weight: bold;
            z-index: 1003;
            pointer-events: none;
            animation: seekPulse 0.6s ease-out;
        `;

        indicator.textContent = isLeft ? `« ${seconds}s` : `${seconds}s »`;
        modal.appendChild(indicator);

        // Remove after animation
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 600);
    }

    setupSwipeNavigation(videoPlayer) {
        /**
         * Mobile swipe navigation: swipe up for next video, swipe down for previous
         * Only works in center 50% of screen (25%-75% horizontal range)
         */

        // Remove any existing swipe listener
        this.cleanupSwipeNavigation();

        let touchStartY = 0;
        let touchEndY = 0;
        let isSingleTouch = true;
        let isInCenterZone = false;
        const swipeThreshold = 100; // Minimum distance for a swipe

        this.swipeStartHandler = (e) => {
            // Only track if it's a single finger touch (ignore pinch-to-zoom)
            if (e.touches.length === 1) {
                const touchX = e.touches[0].clientX;
                const screenWidth = window.innerWidth;

                // Check if touch is in center 50% (25% to 75% from left)
                const leftBoundary = screenWidth * 0.25;
                const rightBoundary = screenWidth * 0.75;

                isInCenterZone = touchX >= leftBoundary && touchX <= rightBoundary;

                if (isInCenterZone) {
                    touchStartY = e.touches[0].clientY;
                    isSingleTouch = true;
                } else {
                    isSingleTouch = false;
                }
            } else {
                isSingleTouch = false;
                isInCenterZone = false;
            }
        };

        // Track if user adds more fingers (starts pinching during touch)
        this.swipeMoveHandler = (e) => {
            if (e.touches.length > 1) {
                isSingleTouch = false;
            }
        };

        this.swipeEndHandler = (e) => {
            // Only trigger video change if it was a single-finger swipe in center zone
            if (!isSingleTouch || !isInCenterZone || e.changedTouches.length > 1) {
                return;
            }

            touchEndY = e.changedTouches[0].clientY;
            const swipeDistance = touchStartY - touchEndY;

            // Check if it's a valid vertical swipe
            if (Math.abs(swipeDistance) > swipeThreshold) {
                if (swipeDistance > 0) {
                    // Swiped up - next video
                    this.playNextVideo();
                } else {
                    // Swiped down - previous video
                    this.playPreviousVideo();
                }
            }
        };

        videoPlayer.addEventListener('touchstart', this.swipeStartHandler, { passive: true });
        videoPlayer.addEventListener('touchmove', this.swipeMoveHandler, { passive: true });
        videoPlayer.addEventListener('touchend', this.swipeEndHandler, { passive: true });
    }

    cleanupSwipeNavigation() {
        const videoPlayer = document.getElementById('videoPlayer');
        if (videoPlayer) {
            if (this.swipeStartHandler) {
                videoPlayer.removeEventListener('touchstart', this.swipeStartHandler);
                this.swipeStartHandler = null;
            }
            if (this.swipeMoveHandler) {
                videoPlayer.removeEventListener('touchmove', this.swipeMoveHandler);
                this.swipeMoveHandler = null;
            }
            if (this.swipeEndHandler) {
                videoPlayer.removeEventListener('touchend', this.swipeEndHandler);
                this.swipeEndHandler = null;
            }
        }
    }

    setupBottomSwipeControls(videoPlayer) {
        /**
         * Bottom area swipe up to toggle video progress bar
         * Only triggers when swipe starts in bottom 35% of screen
         * Works across full width (not limited to center)
         */

        // Remove any existing bottom swipe listener
        this.cleanupBottomSwipeControls();

        let touchStartY = 0;
        let touchStartedInBottom = false;
        const swipeThreshold = 50; // Minimum upward distance to trigger
        const bottomZoneHeight = 0.35; // Bottom 35% of screen

        this.bottomSwipeStartHandler = (e) => {
            if (e.touches.length === 1) {
                const touchY = e.touches[0].clientY;
                const screenHeight = window.innerHeight;
                const bottomBoundary = screenHeight * (1 - bottomZoneHeight);

                // Check if touch started in bottom zone
                touchStartedInBottom = touchY >= bottomBoundary;

                if (touchStartedInBottom) {
                    touchStartY = touchY;
                }
            } else {
                touchStartedInBottom = false;
            }
        };

        this.bottomSwipeEndHandler = (e) => {
            if (!touchStartedInBottom || e.changedTouches.length > 1) {
                return;
            }

            const touchEndY = e.changedTouches[0].clientY;
            const swipeDistance = touchStartY - touchEndY; // Positive = swipe up

            // Check if it's a valid upward swipe
            if (swipeDistance > swipeThreshold) {
                // Swiped up from bottom - toggle video controls
                this.toggleVideoControls(videoPlayer);
            }
        };

        videoPlayer.addEventListener('touchstart', this.bottomSwipeStartHandler, { passive: true });
        videoPlayer.addEventListener('touchend', this.bottomSwipeEndHandler, { passive: true });
    }

    cleanupBottomSwipeControls() {
        const videoPlayer = document.getElementById('videoPlayer');
        if (videoPlayer) {
            if (this.bottomSwipeStartHandler) {
                videoPlayer.removeEventListener('touchstart', this.bottomSwipeStartHandler);
                this.bottomSwipeStartHandler = null;
            }
            if (this.bottomSwipeEndHandler) {
                videoPlayer.removeEventListener('touchend', this.bottomSwipeEndHandler);
                this.bottomSwipeEndHandler = null;
            }
        }
    }

    toggleVideoControls(videoPlayer) {
        /**
         * Toggle the native video controls visibility
         */
        if (videoPlayer.hasAttribute('controls')) {
            videoPlayer.removeAttribute('controls');
        } else {
            videoPlayer.setAttribute('controls', 'controls');
        }
    }

    setupHorizontalPan(videoPlayer) {
        // Pan feature removed - no-op
    }

    enablePanning() {
        // Pan feature removed - no-op
    }

    disablePanning() {
        // Pan feature removed - no-op
    }

    playNextVideo() { this.videoPlayer.playNextVideo() }
    playPreviousVideo() { this.videoPlayer.playPreviousVideo() }
    showNavigationIndicator(direction) { this.videoPlayer.showNavigationIndicator(direction) }

    setupEventListeners() {
        // Video modal close
        const closeModalBtn = document.getElementById('closeModal');
        if (closeModalBtn) {
            closeModalBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideVideoPlayer();
            };
            closeModalBtn.ontouchend = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideVideoPlayer();
            };
        }

        // Image modal close - ✅ NEW
        const closeImageModalBtn = document.getElementById('closeImageModal');
        if (closeImageModalBtn) {
            closeImageModalBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideImageViewer();
            };
            closeImageModalBtn.ontouchend = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideImageViewer();
            };
        }

        // Image player menu button - ✅ UPDATED
        document.getElementById('imagePlayerMenuBtn').onclick = (e) => {
            e.stopPropagation();
            this.showImagePlayerMenu(e);
        };

        // Image navigation buttons - ✅ NEW
        document.getElementById('imageNextBtn').onclick = () => this.showNextImage();
        document.getElementById('imagePrevBtn').onclick = () => this.showPreviousImage();

        // Video player menu button
        document.getElementById('videoPlayerMenuBtn').onclick = (e) => {
            e.stopPropagation();
            this.showVideoPlayerMenu(e);
        };

        // Mobile face recognition buttons
        document.getElementById('mobilePauseBtn').onclick = (e) => {
            e.stopPropagation();
            const videoPlayer = document.getElementById('videoPlayer');
            const pauseBtn = document.getElementById('mobilePauseBtn');
            if (videoPlayer) {
                if (videoPlayer.paused) {
                    videoPlayer.play();
                    // Change to pause icon
                    pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                        <circle cx="256" cy="256" r="208" stroke-width="32"/>
                        <path d="M208 192v128M304 192v128" stroke-linecap="round"/>
                    </svg>`;
                } else {
                    videoPlayer.pause();
                    // Change to play icon
                    pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                        <circle cx="256" cy="256" r="208" stroke-width="32"/>
                        <path d="M208 192l128 64-128 64z" stroke-linejoin="round"/>
                    </svg>`;
                }
            }
        };

        document.getElementById('mobileSearchFaceBtn').onclick = (e) => {
            e.stopPropagation();
            if (this.currentVideoInPlayer) {
                // Pause video first for face search
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer && !videoPlayer.paused) {
                    videoPlayer.pause();
                    const pauseBtn = document.getElementById('mobilePauseBtn');
                    pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                        <circle cx="256" cy="256" r="208" stroke-width="32"/>
                        <path d="M208 192l128 64-128 64z" stroke-linejoin="round"/>
                    </svg>`;
                }
                this.quickFaceSearchFromCurrentFrame();
            }
        };

        document.getElementById('mobileAutoExtractBtn').onclick = (e) => {
            e.stopPropagation();
            if (this.currentVideoInPlayer) {
                // Pause video first for auto face extraction
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer && !videoPlayer.paused) {
                    videoPlayer.pause();
                    const pauseBtn = document.getElementById('mobilePauseBtn');
                    pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                        <circle cx="256" cy="256" r="208" stroke-width="32"/>
                        <path d="M208 192l128 64-128 64z" stroke-linejoin="round"/>
                    </svg>`;
                }
                this.autoScanFaces();
            }
        };

        document.getElementById('mobileFindSimilarBtn').onclick = async (e) => {
            e.stopPropagation();
            if (this.currentVideoInPlayer) {
                // Pause video first
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer && !videoPlayer.paused) {
                    videoPlayer.pause();
                    const pauseBtn = document.getElementById('mobilePauseBtn');
                    pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                        <circle cx="256" cy="256" r="208" stroke-width="32"/>
                        <path d="M208 192l128 64-128 64z" stroke-linejoin="round"/>
                    </svg>`;
                }
                await this.checkIfDuplicate(this.currentVideoInPlayer.id);
            }
        };

        document.getElementById('mobileAddFingerprintBtn').onclick = (e) => {
            e.stopPropagation();
            if (this.currentVideoInPlayer) {
                // Pause video first for fingerprint
                const videoPlayer = document.getElementById('videoPlayer');
                if (videoPlayer && !videoPlayer.paused) {
                    videoPlayer.pause();
                    const pauseBtn = document.getElementById('mobilePauseBtn');
                    pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                        <circle cx="256" cy="256" r="208" stroke-width="32"/>
                        <path d="M208 192l128 64-128 64z" stroke-linejoin="round"/>
                    </svg>`;
                }
                this.addCurrentFrameToFingerprint();
            }
        };

        // Mobile loop button
        document.getElementById('mobileLoopBtn').onclick = (e) => {
            e.stopPropagation();
            const videoPlayer = document.getElementById('videoPlayer');
            const loopBtn = document.getElementById('mobileLoopBtn');
            if (videoPlayer) {
                videoPlayer.loop = !videoPlayer.loop;
                loopBtn.setAttribute('data-loop', videoPlayer.loop ? 'on' : 'off');
            }
        };

        // Three-finger tap to show/hide mobile controls with pause/play
        const videoPlayer = document.getElementById('videoPlayer');
        let threeFingerTouchStart = false;

        videoPlayer.addEventListener('touchstart', (e) => {
            // Track if three fingers touched the screen
            if (e.touches.length === 3) {
                threeFingerTouchStart = true;
            }
        });

        videoPlayer.addEventListener('touchend', (e) => {
            // Check if this was a three-finger tap
            if (threeFingerTouchStart && e.changedTouches.length >= 1) {
                threeFingerTouchStart = false;
                const mobileControls = document.getElementById('mobileFaceControls');
                const isVisible = mobileControls.classList.contains('visible');

                if (isVisible) {
                    // Hide controls and resume playing
                    mobileControls.classList.remove('visible');
                    if (videoPlayer.paused) {
                        videoPlayer.play();
                        const pauseBtn = document.getElementById('mobilePauseBtn');
                        if (pauseBtn) {
                            pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                                <circle cx="256" cy="256" r="208" stroke-width="32"/>
                                <path d="M208 192v128M304 192v128" stroke-linecap="round"/>
                            </svg>`;
                        }
                    }
                } else {
                    // Show controls and pause video
                    mobileControls.classList.add('visible');
                    if (!videoPlayer.paused) {
                        videoPlayer.pause();
                        const pauseBtn = document.getElementById('mobilePauseBtn');
                        if (pauseBtn) {
                            pauseBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 512 512" fill="none" stroke="currentColor" stroke-width="32">
                                <circle cx="256" cy="256" r="208" stroke-width="32"/>
                                <path d="M208 192l128 64-128 64z" stroke-linejoin="round"/>
                            </svg>`;
                        }
                    }
                }
            } else if (e.touches.length === 0) {
                // Reset flag when all touches are released
                threeFingerTouchStart = false;
            }
        });

        // Tag modal close
        document.getElementById('closeTagModal').onclick = () => this.hideTagModal();

        // Actor modal close
        document.getElementById('closeActorModal').onclick = () => this.hideActorModal();

        // Scene description modal close
        document.getElementById('closeSceneDescriptionModal').onclick = () => this.hideSceneDescriptionModal();

        // Series modal close and actions
        document.getElementById('closeSeriesModal').onclick = () => this.hideSeriesModal();
        document.getElementById('saveSeriesBtn').onclick = () => this.saveSeriesInfo();
        document.getElementById('clearSeriesBtn').onclick = () => this.clearSeriesInfo();
        document.getElementById('cancelSeriesBtn').onclick = () => this.hideSeriesModal();

        // Move modal
        const moveModal = document.getElementById('moveModal');
        if (moveModal) {
            document.getElementById('closeMoveModal').onclick = () => this.hideMoveModal();
            document.getElementById('moveConfirmBtn').onclick = () => this.performMoveFromModal();
        }

        // Move modal for video player
        const moveVideoPlayerModal = document.getElementById('moveVideoPlayerModal');
        if (moveVideoPlayerModal) {
            document.getElementById('closeMoveVideoPlayerModal').onclick = () => this.hideMoveVideoPlayerModal();
        }

        // Tag modal for video player
        const tagVideoPlayerModal = document.getElementById('tagVideoPlayerModal');
        if (tagVideoPlayerModal) {
            document.getElementById('closeTagVideoPlayerModal').onclick = () => this.hideTagVideoPlayerModal();
        }

        // Fingerprint Viewer modal
        const fingerprintViewerModal = document.getElementById('fingerprintViewerModal');
        if (fingerprintViewerModal) {
            document.getElementById('closeFingerprintViewerModal').onclick = () => this.hideFingerprintViewer();
            document.getElementById('closeFingerprintViewerBtn').onclick = () => this.hideFingerprintViewer();
            document.getElementById('addMoreFingerprintsBtn').onclick = () => this.openFingerprintGenerationFromViewer();
        }

        // Fingerprint Generation modal
        const fingerprintGenerationModal = document.getElementById('fingerprintGenerationModal');
        if (fingerprintGenerationModal) {
            document.getElementById('closeFingerprintGenerationModal').onclick = () => this.closeFingerprintGenerationModal();
            document.getElementById('fpGenCancelBtn').onclick = () => this.closeFingerprintGenerationModal();
            document.getElementById('fpGenGenerateBtn').onclick = () => this.generateRandomFingerprintFrames();
            document.getElementById('fpGenSelectAllBtn').onclick = () => this.selectAllFingerprintFrames();
            document.getElementById('fpGenDeselectAllBtn').onclick = () => this.deselectAllFingerprintFrames();
            document.getElementById('fpGenAddSelectedBtn').onclick = () => this.addSelectedFingerprintFrames();
        }

        // Help modal
        const helpModal = document.getElementById('helpModal');
        if (helpModal) {
            document.getElementById('closeHelpModal').onclick = () => this.hideHelpModal();
            document.getElementById('closeHelpModalBtn').onclick = () => this.hideHelpModal();
        }

        // Audio modal
        const addAudioModal = document.getElementById('addAudioModal');
        if (addAudioModal) {
            document.getElementById('closeAddAudioModal').onclick = () => this.hideAddAudioModal();
            document.getElementById('closeAddAudioModalBtn').onclick = () => this.hideAddAudioModal();
            document.getElementById('addAudioConfirmBtn').onclick = () => this.confirmAddAudio();
        }

        // Move folder input enter key
        const folderInput = document.getElementById('folderInput');
        if (folderInput) {
            folderInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.performMoveFromModal();
            });

            // Add real-time filtering as user types
            folderInput.addEventListener('input', (e) => {
                this.filterFolderSuggestions(e.target.value);
            });

            // Add keyboard navigation for folder suggestions
            folderInput.addEventListener('keydown', (e) => {
                this.handleFolderNavigationKeys(e);
            });
        }

        // Add tag button
        document.getElementById('addTagBtn').onclick = () => this.addTag();
        document.getElementById('tagInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTag();
        });

        // Escape key to close modals - only close the modal that's actually open
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                let modalClosed = false;

                // Check each modal and close only the one that's open
                const modals = [
                    { id: 'faceSearchModal', hide: () => this.hideFaceSearchModal() },
                    { id: 'similarVideosModal', hide: () => this.hideSimilarVideosModal() },
                    { id: 'fingerprintGenerationModal', hide: () => this.closeFingerprintGenerationModal() },
                    { id: 'autoScanModal', hide: () => this.hideAutoScanModal() },
                    { id: 'faceExtractionModal', hide: () => this.hideFaceExtractionModal() },
                    { id: 'faceMergeModal', hide: () => this.hideFaceMergeModal() },
                    // Child modals (higher z-index, check first)
                    { id: 'videoFacesReviewModal', hide: () => this.hideVideoFacesReviewModal() },
                    { id: 'tagModal', hide: () => this.hideTagModal() },
                    { id: 'sceneDescriptionModal', hide: () => this.hideSceneDescriptionModal() },
                    { id: 'moveModal', hide: () => this.hideMoveModal() },
                    { id: 'addAudioModal', hide: () => this.hideAddAudioModal() },
                    // Parent modals (lower z-index, check after)
                    { id: 'faceDetailModal', hide: () => { document.getElementById('faceDetailModal').style.display = 'none'; } },
                    { id: 'fingerprintViewerModal', hide: () => this.hideFingerprintViewer() },
                    { id: 'helpModal', hide: () => this.hideHelpModal() },
                    { id: 'bulkEditModal', hide: () => this.hideBulkEditModal() },
                    { id: 'renameModal', hide: () => this.hideRenameModal() },
                    { id: 'renameFolderModal', hide: () => this.hideRenameFolderModal() },
                    { id: 'thumbnailModal', hide: () => this.hideThumbnailModal() },
                    { id: 'actorModal', hide: () => this.hideActorModal() },
                    { id: 'seriesModal', hide: () => this.hideSeriesModal() },
                    { id: 'videoModal', hide: () => this.hideVideoPlayer() }
                ];

                // Find and close the first open modal
                for (const modal of modals) {
                    const element = document.getElementById(modal.id);
                    if (element && (element.style.display === 'flex' || element.style.display === 'block')) {
                        modal.hide();
                        modalClosed = true;
                        e.preventDefault();
                        e.stopPropagation();
                        break;
                    }
                }

                // Also close context menu if no modal was closed
                if (!modalClosed) {
                    this.hideVideoContextMenu();
                }
            }
        });

        // Thumbnail modal event listeners
        document.getElementById('closeThumbnailModal').onclick = () => this.hideThumbnailModal();
        document.getElementById('cancelThumbnailBtn').onclick = () => this.hideThumbnailModal();
        document.getElementById('setThumbnailBtn').onclick = () => this.setSelectedThumbnail();

        // Progress overlay event listeners
        document.getElementById('dismissProgressBtn').onclick = () => {
            // Hide overlay, show top bar
            this.progressOverlayDismissed = true;
            this.hideProgressOverlay();
        };

        // Top progress bar event listeners
        document.getElementById('topProgressBar').onclick = (e) => {
            // Click bar to restore overlay (except close button)
            if (!e.target.closest('.top-progress-close')) {
                this.progressOverlayDismissed = false;
                this.hideTopProgressBar();
                // Progress will show overlay on next update
            }
        };

        document.getElementById('topProgressClose').onclick = (e) => {
            e.stopPropagation();
            // Cancel operation
            if (this.cancelProgressCallback) {
                this.cancelProgressCallback();
            }
            this.hideTopProgressBar();
        };

        // Rename modal event listeners
        document.getElementById('closeRenameModal').onclick = () => this.hideRenameModal();
        document.getElementById('cancelRenameBtn').onclick = () => this.hideRenameModal();
        document.getElementById('confirmRenameBtn').onclick = () => this.renameVideo();

        // Auto-format filename button in rename modal
        document.getElementById('autoFormatFilenameBtn').onclick = () => this.autoFormatRenameFilename();

        // Rename folder modal event listeners
        document.getElementById('closeRenameFolderModal').onclick = () => this.hideRenameFolderModal();
        document.getElementById('cancelRenameFolderBtn').onclick = () => this.hideRenameFolderModal();
        document.getElementById('confirmRenameFolderBtn').onclick = () => this.renameFolder();
        document.getElementById('newFolderName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.renameFolder();
        });

        // Bulk hash rename (zRename) modal event listeners
        document.getElementById('closeBulkHashRenameModal').onclick = () => this.hideBulkHashRenameModal();
        document.getElementById('cancelBulkHashRenameBtn').onclick = () => this.hideBulkHashRenameModal();
        document.getElementById('confirmBulkHashRenameBtn').onclick = () => this.performBulkHashRename();

        // Don't close modal when clicking outside (prevent accidental data loss)
        // Removed auto-close behavior to prevent accidental data loss

        // Add keyboard shortcuts for all input fields in rename modal
        const renameModalInputs = [
            document.getElementById('videoDisplayName'),
            document.getElementById('newVideoName'),
            document.getElementById('videoDescription')
        ];

        renameModalInputs.forEach(input => {
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        // Enter saves (allow Shift+Enter for newlines in textarea)
                        if (e.target.tagName !== 'TEXTAREA') {
                            e.preventDefault();
                            this.renameVideo();
                        }
                    } else if (e.key === 'Escape') {
                        // Escape closes without saving
                        e.preventDefault();
                        this.hideRenameModal();
                    }
                });
            }
        });

        // Removed dangerous refresh button - use per-folder scan instead

        // Clear filters button
        document.getElementById('clearBtn').onclick = () => this.clearFilters();

        // Fast rescan button removed - now in actions menu

        // Actions menu button
        document.getElementById('actionsMenuBtn').onclick = (e) => {
            e.stopPropagation();
            this.toggleActionsMenu();
        };

        // Actions menu items


        document.getElementById('menuSortBtn').onclick = (e) => {
            e.stopPropagation();
            this.toggleSortSubmenu();
        };

        // Sort submenu items
        document.querySelectorAll('.actions-submenu-item').forEach(item => {
            item.onclick = (e) => {
                e.stopPropagation();
                const sortValue = item.getAttribute('data-sort');
                this.applySortOption(sortValue);
                this.hideSortSubmenu();
                this.hideActionsMenu();
            };
        });
        document.getElementById('menuSelectionModeBtn').onclick = () => {
            this.hideActionsMenu();
            this.toggleSelectionMode();
        };
        document.getElementById('menuVerticalModeBtn').onclick = () => {
            this.hideActionsMenu();
            this.toggleVerticalMode();
        };
        document.getElementById('menuManageTagsBtn').onclick = () => {
            this.hideActionsMenu();
            this.showTagManagerView();
        };



        document.getElementById('menuFaceCatalogBtn').onclick = () => {
            this.hideActionsMenu();
            this.showFaceCatalogView();
        };

        document.getElementById('menuMergeFacesBtn').onclick = () => {
            this.hideActionsMenu();
            this.showMergeFacesModal();
        };

        document.getElementById('menuReviewDuplicatesBtn').onclick = () => {
            this.hideActionsMenu();
            this.showDuplicatesReviewView();
        };

        document.getElementById('menuCleanupDatabaseBtn').onclick = () => {
            this.hideActionsMenu();
            this.cleanupDatabase();
        };

        // Duplicates Review View exit button
        document.getElementById('exitDuplicatesReviewView').onclick = () => {
            this.exitDuplicatesReviewView();
        };

        document.getElementById('menuDownloadM3U8Btn').onclick = () => {
            this.hideActionsMenu();
            this.showDownloadM3U8Modal();
        };

        document.getElementById('menuDownloadSOCKSBtn').onclick = () => {
            this.hideActionsMenu();
            this.showDownloadSOCKSModal();
        };

        document.getElementById('menuQuickDownloadBtn').onclick = () => {
            this.hideActionsMenu();
            this.showQuickDownloadModal();
        };

        document.getElementById('menuBatchDownloadBtn').onclick = () => {
            this.hideActionsMenu();
            this.showBatchDownloadModal();
        };

        document.getElementById('menuClipboardDownloadBtn').onclick = () => {
            this.hideActionsMenu();
            this.downloadFromClipboard();
        };

        document.getElementById('menuHelpBtn').onclick = () => {
            this.hideActionsMenu();
            this.showHelpModal();
        };

        // M3U8 Download Modal
        document.getElementById('closeDownloadM3U8Modal').onclick = () => {
            this.hideDownloadM3U8Modal();
        };

        document.getElementById('startDownloadBtn').onclick = () => {
            this.startM3U8Download();
        };

        document.getElementById('backToCollectionFromDownload').onclick = () => {
            this.hideDownloadM3U8Modal();
            this.showVideoGrid();
        };

        // SOCKS Download Modal
        document.getElementById('closeDownloadSOCKSModal').onclick = () => {
            this.hideDownloadSOCKSModal();
        };

        document.getElementById('startSOCKSDownloadBtn').onclick = () => {
            this.startSOCKSDownload();
        };

        document.getElementById('backToCollectionFromSOCKSDownload').onclick = () => {
            this.hideDownloadSOCKSModal();
            this.showVideoGrid();
        };

        // Quick Download Modal
        document.getElementById('closeQuickDownloadModal').onclick = () => {
            this.hideQuickDownloadModal();
        };

        document.getElementById('startQuickDownloadBtn').onclick = () => {
            this.startQuickDownload();
        };

        // Batch Download Modal
        document.getElementById('closeBatchDownloadModal').onclick = () => {
            this.hideBatchDownloadModal();
        };

        document.getElementById('startBatchDownloadBtn').onclick = () => {
            this.startBatchDownload();
        };

        document.getElementById('pasteBatchUrlsBtn').onclick = async () => {
            try {
                const text = await navigator.clipboard.readText();
                const textarea = document.getElementById('batchDownloadUrls');
                if (textarea.value) {
                    textarea.value += '\n' + text;
                } else {
                    textarea.value = text;
                }
                textarea.focus();
                console.log('✅ URLs pasted from clipboard')
            } catch (err) {
                console.log('❌ Failed to read clipboard')
            }
        };

        // Referer Setup Modal
        document.getElementById('confirmRefererSetupBtn').onclick = () => {
            this.confirmRefererSetup();
        };

        document.getElementById('skipRefererSetupBtn').onclick = () => {
            this.skipRefererSetup();
        };

        // Video Editor Modal event listeners
        document.getElementById('closeVideoEditorModal').onclick = () => {
            this.hideVideoEditorModal();
        };

        document.getElementById('processVideoBtn').onclick = () => {
            this.processVideo();
        };

        document.getElementById('toggleSaveLocation').onclick = () => {
            this.toggleSaveLocation();
        };

        document.getElementById('backToCollectionFromEditor').onclick = () => {
            this.hideVideoEditorModal();
            this.showVideoGrid();
        };

        // Use Current Time buttons
        document.getElementById('useCurrentTimeStart').onclick = () => {
            this.useCurrentTimeFor('start');
        };

        document.getElementById('useCurrentTimeEnd').onclick = () => {
            this.useCurrentTimeFor('end');
        };

        // Click outside to close actions menu
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('actionsMenu');
            const menuBtn = document.getElementById('actionsMenuBtn');
            if (menu.style.display === 'block' && !menu.contains(e.target) && e.target !== menuBtn) {
                this.hideActionsMenu();
            }
        });

        // View toggle button (only Explorer as main button)
        document.getElementById('explorerViewBtn').onclick = () => this.switchView('explorer');

        // View menu items in Actions Menu
        document.getElementById('menuCollectionViewBtn').onclick = () => {
            this.switchView('list');
            this.hideActionsMenu();
        };
        document.getElementById('menuSeriesViewBtn').onclick = () => {
            this.switchView('series');
            this.hideActionsMenu();
        };

        // Ensure view buttons reflect current state (in case settings were loaded before DOM was ready)
        this.updateViewButtons();


        // Debounced server-side search & filter for List View
        const searchInputEl = document.getElementById('searchInput');
        const tagFilterEl = document.getElementById('tagFilter');
        this.debouncedFilter = this.debounce(() => this.handleFiltersChanged(), 300);

        // Search is GLOBAL - clears all other filters when typing
        searchInputEl.addEventListener('input', (e) => {
            this.currentSearchQuery = e.target.value.trim();

            // If user is typing a search query, clear all other filters
            if (this.currentSearchQuery) {
                // Clear tag filter
                tagFilterEl.value = '';
                this.currentTagFilter = '';

                // Clear all metadata filters
                document.getElementById('seriesFilter').value = '';
                this.currentSeriesFilter = '';
                document.getElementById('yearFilter').value = '';
                this.currentYearFilter = '';
                document.getElementById('channelFilter').value = '';
                this.currentChannelFilter = '';
                document.getElementById('ratingFilter').value = '';
                this.currentRatingFilter = '';
                document.getElementById('favoriteFilter').checked = false;
                this.currentFavoriteFilter = false;

                // Keep folder filter as-is (search within selected folders)
            }

            this.debouncedFilter();
            this.saveSettingsToStorage();
        });

        // ESC key resets to default collection view (clears search + all filters)
        searchInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();

                // Reset to default collection view
                this.resetCollectionView();

                console.log('🔍 Collection view reset via ESC');
            }
        });

        tagFilterEl.addEventListener('change', (e) => {
            this.currentTagFilter = e.target.value;
            this.debouncedFilter();
            this.saveSettingsToStorage();
        });

        // Enhanced metadata filters - MUTUALLY EXCLUSIVE (only one at a time)
        const seriesFilterEl = document.getElementById('seriesFilter');
        const yearFilterEl = document.getElementById('yearFilter');
        const channelFilterEl = document.getElementById('channelFilter');
        const ratingFilterEl = document.getElementById('ratingFilter');
        const favoriteFilterEl = document.getElementById('favoriteFilter');

        seriesFilterEl.addEventListener('change', (e) => {
            this.currentSeriesFilter = e.target.value;

            // Clear other metadata filters (mutually exclusive)
            if (this.currentSeriesFilter) {
                yearFilterEl.value = '';
                this.currentYearFilter = '';
                channelFilterEl.value = '';
                this.currentChannelFilter = '';
                ratingFilterEl.value = '';
                this.currentRatingFilter = '';
                favoriteFilterEl.checked = false;
                this.currentFavoriteFilter = false;
            }

            this.debouncedFilter();
            this.saveSettingsToStorage();
        });

        yearFilterEl.addEventListener('change', (e) => {
            this.currentYearFilter = e.target.value;

            // Clear other metadata filters (mutually exclusive)
            if (this.currentYearFilter) {
                seriesFilterEl.value = '';
                this.currentSeriesFilter = '';
                channelFilterEl.value = '';
                this.currentChannelFilter = '';
                ratingFilterEl.value = '';
                this.currentRatingFilter = '';
                favoriteFilterEl.checked = false;
                this.currentFavoriteFilter = false;
            }

            this.debouncedFilter();
            this.saveSettingsToStorage();
        });

        channelFilterEl.addEventListener('change', (e) => {
            this.currentChannelFilter = e.target.value;

            // Clear other metadata filters (mutually exclusive)
            if (this.currentChannelFilter) {
                seriesFilterEl.value = '';
                this.currentSeriesFilter = '';
                yearFilterEl.value = '';
                this.currentYearFilter = '';
                ratingFilterEl.value = '';
                this.currentRatingFilter = '';
                favoriteFilterEl.checked = false;
                this.currentFavoriteFilter = false;
            }

            this.debouncedFilter();
            this.saveSettingsToStorage();
        });

        ratingFilterEl.addEventListener('change', (e) => {
            this.currentRatingFilter = e.target.value;

            // Clear other metadata filters (mutually exclusive)
            if (this.currentRatingFilter) {
                seriesFilterEl.value = '';
                this.currentSeriesFilter = '';
                yearFilterEl.value = '';
                this.currentYearFilter = '';
                channelFilterEl.value = '';
                this.currentChannelFilter = '';
                favoriteFilterEl.checked = false;
                this.currentFavoriteFilter = false;
            }

            this.debouncedFilter();
            this.saveSettingsToStorage();
        });

        favoriteFilterEl.addEventListener('change', (e) => {
            this.currentFavoriteFilter = e.target.checked;

            // Clear other metadata filters (mutually exclusive)
            if (this.currentFavoriteFilter) {
                seriesFilterEl.value = '';
                this.currentSeriesFilter = '';
                yearFilterEl.value = '';
                this.currentYearFilter = '';
                channelFilterEl.value = '';
                this.currentChannelFilter = '';
                ratingFilterEl.value = '';
                this.currentRatingFilter = '';
            }

            this.debouncedFilter();
            this.saveSettingsToStorage();
        });

        // Folder filter event listeners
        document.getElementById('folderFilterBtn').onclick = () => this.toggleFolderFilterMenu();
        document.getElementById('selectAllFolders').addEventListener('change', () => this.handleSelectAllFolders());

        // Sort dropdown removed - now in actions menu
        // Tag management button removed - now in actions menu

        // Close folder filter menu when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('folderFilterDropdown');
            const menu = document.getElementById('folderFilterMenu');
            if (dropdown && !dropdown.contains(e.target) && menu.style.display !== 'none') {
                menu.style.display = 'none';
            }
        });

        // Bulk operations event listeners
        // Selection mode button removed - now in actions menu
        document.getElementById('selectAllBtn').onclick = () => this.selectAllVideos();
        document.getElementById('deselectAllBtn').onclick = () => this.deselectAllVideos();
        document.getElementById('bulkTagBtn').onclick = () => this.showBulkTagModal();
        document.getElementById('bulkMoveBtn').onclick = () => this.showBulkMoveModal();
        document.getElementById('bulkEditMetadataBtn').onclick = () => this.showBulkEditModal();
        document.getElementById('bulkDeleteBtn').onclick = () => this.showBulkDeleteModal();
        document.getElementById('cancelSelectionBtn').onclick = () => this.cancelSelection();

        // Bulk edit modal event listeners
        document.getElementById('closeBulkEditModal').onclick = () => this.hideBulkEditModal();
        document.getElementById('cancelBulkEditBtn').onclick = () => this.hideBulkEditModal();
        document.getElementById('confirmBulkEditBtn').onclick = () => this.saveBulkEdit();

        // Face extraction modal event listeners
        document.getElementById('closeFaceExtractionModal').onclick = () => this.hideFaceExtractionModal();
        document.getElementById('scanFramesBtn').onclick = () => this.scanVideoFrames();
        document.getElementById('detectFacesBtn').onclick = () => this.detectFacesInSelectedFrames();
        document.getElementById('clearFramesBtn').onclick = () => this.clearFrameSelection();

        // Face search modal event listeners
        document.getElementById('closeFaceSearchModal').onclick = () => this.hideFaceSearchModal();
        document.getElementById('createNewFaceBtn').onclick = () => this.createNewFaceFromSearch();
        document.getElementById('cancelFaceSearchBtn').onclick = () => this.hideFaceSearchModal();

        // Similar videos modal event listeners
        document.getElementById('closeSimilarVideosModal').onclick = () => this.hideSimilarVideosModal();
        document.getElementById('closeSimilarVideosModalBtn').onclick = () => this.hideSimilarVideosModal();

        // Auto-scan modal event listeners
        document.getElementById('closeAutoScanModal').onclick = () => this.hideAutoScanModal();
        document.getElementById('autoScanInfoIcon').onclick = (e) => {
            e.stopPropagation();
            console.log('Select faces (usually same person from different angles) to search and add as training samples')
        };
        document.getElementById('searchSelectedFacesBtn').onclick = () => this.searchAndAddSelectedFaces();
        document.getElementById('scanMoreFramesBtn').onclick = () => {
            // Keep modal open and scan 5 more frames
            this.autoScanFaces(5);
        };
        document.getElementById('selectAllFacesBtn').onclick = () => {
            document.querySelectorAll('.auto-scan-face-checkbox').forEach(cb => {
                cb.checked = true;
                cb.dispatchEvent(new Event('change'));
            });
        };
        document.getElementById('deselectAllFacesBtn').onclick = () => {
            document.querySelectorAll('.auto-scan-face-checkbox').forEach(cb => {
                cb.checked = false;
                cb.dispatchEvent(new Event('change'));
            });
        };
        document.getElementById('cancelAutoScanBtn').onclick = () => this.hideAutoScanModal();

        // Face catalog view listeners are set up in setupFaceCatalogListeners() when the view is shown

        // Quick navigation - type to jump to video
        this.setupQuickNavigation();

        // Global keyboard shortcuts - handled by KeyboardShortcutsModule (auto-initialized)

        // Explorer controls removed - use per-folder scan buttons instead
    }

    setupQuickNavigation() {
        let typingBuffer = '';
        let typingTimer = null;

        document.addEventListener('keypress', (e) => {
            // Ignore if typing in an input field or modal is open
            if (e.target.tagName === 'INPUT' ||
                e.target.tagName === 'TEXTAREA' ||
                document.getElementById('tagModal').style.display === 'flex' ||
                document.getElementById('moveModal').style.display === 'flex' ||
                document.getElementById('renameModal').style.display === 'flex' ||
                document.getElementById('thumbnailModal').style.display === 'flex') {
                return;
            }

            // Add character to buffer
            typingBuffer += e.key.toLowerCase();

            // Clear existing timer
            if (typingTimer) clearTimeout(typingTimer);

            // Set timer to reset buffer after 1 second
            typingTimer = setTimeout(() => {
                typingBuffer = '';
            }, 1000);

            // Find and navigate to matching video
            this.navigateToMatch(typingBuffer);
        });
    }

    navigateToMatch(searchTerm) {
        // Get all video cards currently visible
        const videoCards = document.querySelectorAll('.video-card');

        if (videoCards.length === 0) return;

        // Find first video that matches the search term
        for (const card of videoCards) {
            const titleElement = card.querySelector('.video-title');
            if (!titleElement) continue;

            const title = titleElement.textContent.toLowerCase();

            // Check if title starts with or contains the search term
            if (title.startsWith(searchTerm) || title.includes(searchTerm)) {
                // Highlight the matched card briefly
                card.style.transition = 'all 0.3s ease';
                card.style.outline = '3px solid #3b82f6';
                card.style.outlineOffset = '2px';

                // Scroll the card into view
                card.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                    inline: 'nearest'
                });

                // Remove highlight after 1 second
                setTimeout(() => {
                    card.style.outline = '';
                    card.style.outlineOffset = '';
                }, 1000);

                // Show toast with what we found
                const displayName = titleElement.textContent;
                console.log(`🎯 Quick jump to: "${displayName}"`);

                break; // Stop at first match
            }
        }
    }

    // ============================================================================
    // KEYBOARD SHORTCUTS - Delegate to KeyboardShortcutsModule
    // ============================================================================

    setupKeyboardShortcuts() { this.keyboardModule.setupKeyboardShortcuts() }
    focusSearch() { this.keyboardModule.focusSearch() }
    showKeyboardShortcutsHelp(shortcuts) { this.keyboardModule.showKeyboardShortcutsHelp(shortcuts) }
    get keyboardShortcuts() { return this.keyboardModule.keyboardShortcuts }
    set keyboardShortcuts(val) { this.keyboardModule.keyboardShortcuts = val }

    showMoveModal(videoId, videoName) { this.videoOps.showMoveModal(videoId, videoName) }
    get currentMoveVideo() { return this.videoOps.currentMoveVideo }
    set currentMoveVideo(val) { this.videoOps.currentMoveVideo = val }

    showMoveVideoPlayerModal(videoId, videoName) { this.videoOps.showMoveVideoPlayerModal(videoId, videoName) }
    renderMoveFolderGrid() { this.videoOps.renderMoveFolderGrid() }
    async moveVideoToFolder(folderName) { return this.videoOps.moveVideoToFolder(folderName) }
    hideMoveVideoPlayerModal() { this.videoOps.hideMoveVideoPlayerModal() }
    hideMoveModal() { this.videoOps.hideMoveModal() }

    showTagVideoPlayerModal(videoId, videoName) {
        /**
         * Show tag modal with full tag grid for video player
         * Similar to move modal but with tags instead of folders
         */
        this.currentItem = { id: videoId, name: videoName };
        this.tagToggleInProgress = false;  // Reset toggle flag

        // Load current tags for this video
        const video = this.allVideos.find(v => v.id === videoId) || this.videos.find(v => v.id === videoId);
        this.currentVideoTags = video ? video.tags || [] : [];

        // Update modal title with video name
        const modalTitle = document.getElementById('tagVideoPlayerTitle');
        modalTitle.textContent = `Tag "${videoName}"`;

        // Render tag grid
        this.renderTagVideoPlayerGrid();

        const modal = document.getElementById('tagVideoPlayerModal');
        modal.classList.add('active');
        modal.style.display = 'flex';

        // Add click outside to close
        this.tagModalClickHandler = (e) => {
            if (e.target === modal) {
                this.hideTagVideoPlayerModal();
            }
        };
        modal.addEventListener('click', this.tagModalClickHandler);

        // Add Escape key to close - only dismiss modal, don't propagate to video player
        this.tagModalKeyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.hideTagVideoPlayerModal();
            }
        };
        document.addEventListener('keydown', this.tagModalKeyHandler, true);
    }

    renderTagVideoPlayerGrid() {
        /**
         * Render all available tags as clickable grid items
         * Show all tags, highlight tags already applied to video
         */
        const tagGrid = document.getElementById('tagVideoPlayerGrid');
        if (!tagGrid) return;

        if (!this.allTags || this.allTags.length === 0) {
            tagGrid.innerHTML = '<p style="color: #999; padding: 20px; text-align: center;">No tags available</p>';
            return;
        }

        // Get list of tag IDs already applied to this video
        const appliedTagIds = new Set(this.currentVideoTags.map(t => t.id));

        tagGrid.innerHTML = this.allTags.map(tag => `
            <div class="tag-suggestion ${appliedTagIds.has(tag.id) ? 'tag-applied' : ''}" 
                 onclick="app.addTagToVideoPlayer('${tag.id}', '${this.escapeHtml(tag.name)}'); return false;">
                <span>${this.escapeHtml(tag.name)}</span>
                ${appliedTagIds.has(tag.id) ? '<span class="tag-check">✓</span>' : ''}
            </div>
        `).join('');
    }

    async addTagToVideoPlayer(tagId, tagName) {
        /**
         * Toggle tag on/off: remove if already applied, add if not applied
         * Uses same logic as mobile view for consistency
         */
        if (!this.currentItem) return;

        // Prevent double-clicks
        if (this.tagToggleInProgress) return;
        this.tagToggleInProgress = true;

        try {
            // Check if tag is already applied (check by ID match)
            const isApplied = this.currentVideoTags.some(tag => tag.id == tagId);

            if (isApplied) {
                // Remove tag
                const response = await fetch(`${this.apiBase}/videos/${this.currentItem.id}/tags/${tagId}`, {
                    method: 'DELETE'
                });

                if (response.ok) {
                    console.log(`✅ Removed tag "${tagName}" from "${this.currentItem.name}"`);

                    // Remove from current video tags
                    this.currentVideoTags = this.currentVideoTags.filter(tag => tag.id != tagId);

                    // Update the video in allVideos and videos lists
                    const video = this.allVideos.find(v => v.id === this.currentItem.id) ||
                        this.videos.find(v => v.id === this.currentItem.id);
                    if (video && video.tags) {
                        video.tags = video.tags.filter(tag => tag.id != tagId);
                    }

                    // Update video card and re-render grid
                    this.updateVideoCardTags(this.currentItem.id);
                    this.renderTagVideoPlayerGrid();
                } else {
                    const err = await response.json().catch(() => ({}));
                    console.log('Failed to remove tag:', err.detail || 'Unknown error');
                }
            } else {
                // Add tag
                const response = await fetch(`${this.apiBase}/videos/${this.currentItem.id}/tags?tag_name=${encodeURIComponent(tagName)}`, {
                    method: 'POST'
                });

                if (response.ok) {
                    const result = await response.json();
                    console.log(`✅ Added tag "${tagName}" to "${this.currentItem.name}"`);

                    // Update current video tags locally
                    this.currentVideoTags.push(result.tag);

                    // Update the video in allVideos and videos lists
                    const video = this.allVideos.find(v => v.id === this.currentItem.id) ||
                        this.videos.find(v => v.id === this.currentItem.id);
                    if (video) {
                        if (!video.tags) video.tags = [];
                        if (!video.tags.find(tag => tag.id == result.tag.id)) {
                            video.tags.push(result.tag);
                        }
                    }

                    // Track tag usage
                    this.trackTagUsage(result.tag.name);

                    // Update video card and re-render grid
                    this.updateVideoCardTags(this.currentItem.id);
                    this.renderTagVideoPlayerGrid();
                } else {
                    const err = await response.json().catch(() => ({}));
                    console.log('Failed to add tag:', err.detail || 'Unknown error');
                }
            }
        } catch (error) {
            console.log('Error toggling tag:', error);
        } finally {
            this.tagToggleInProgress = false;
        }
    }

    hideTagVideoPlayerModal() {
        const modal = document.getElementById('tagVideoPlayerModal');
        modal.classList.remove('active');
        modal.style.display = 'none';
        this.currentItem = null;
        this.currentVideoTags = [];

        // Clean up event listeners
        if (this.tagModalClickHandler) {
            modal.removeEventListener('click', this.tagModalClickHandler);
            this.tagModalClickHandler = null;
        }
        if (this.tagModalKeyHandler) {
            document.removeEventListener('keydown', this.tagModalKeyHandler, true);
            this.tagModalKeyHandler = null;
        }
    }

    setupFolderAutocomplete() { this.videoOps.setupFolderAutocomplete() }
    showFolderPathPreview(path) { this.videoOps.showFolderPathPreview(path) }
    updateFolderSuggestionsFiltered(query = '') { this.videoOps.updateFolderSuggestionsFiltered(query) }
    addSmartPathSuggestions(container, query, allFolders) { this.videoOps.addSmartPathSuggestions(container, query, allFolders) }
    getAllAvailableFolders() { return this.videoOps.getAllAvailableFolders() }
    createFolderSuggestionItem(path, displayName, icon, isNew = false) { return this.videoOps.createFolderSuggestionItem(path, displayName, icon, isNew) }

    updateFolderSuggestions() {
        const folderList = document.getElementById('folderSuggestionsList');
        folderList.innerHTML = '';

        // Get existing folders
        const folders = ['_root', ...Object.keys(this.categories)];

        folders.forEach(folder => {
            const folderItem = document.createElement('div');

            // Store the folder value as data attribute for easy access
            folderItem.setAttribute('data-folder-value', folder);

            if (folder === this.currentCategory) {
                // Show current category but disabled
                folderItem.className = 'folder-suggestion folder-current';
                folderItem.textContent = `${folder === '_root' ? '(Root)' : folder} (current)`;
                folderItem.style.opacity = '0.5';
                folderItem.style.cursor = 'not-allowed';
            } else {
                folderItem.className = 'folder-suggestion';
                folderItem.textContent = folder === '_root' ? '(Root)' : folder;
                folderItem.onclick = () => {
                    const folderValue = folderItem.getAttribute('data-folder-value');
                    document.getElementById('folderInput').value = folderValue === '_root' ? '' : folderValue;
                    // Clear the filter to show all folders again
                    this.filterFolderSuggestions('');
                };
            }

            folderList.appendChild(folderItem);
        });
    }

    filterFolderSuggestions(searchTerm) {
        const folderList = document.getElementById('folderSuggestionsList');
        const folderItems = folderList.querySelectorAll('.folder-suggestion');

        // If search term is empty, show all folders and restore original text
        if (!searchTerm.trim()) {
            folderItems.forEach(item => {
                item.style.display = 'block';
                // Restore original text without highlighting
                const originalText = item.getAttribute('data-original-text') || item.textContent;
                item.textContent = originalText;
            });
            return;
        }

        const searchLower = searchTerm.toLowerCase();

        folderItems.forEach(item => {
            // Store original text if not already stored
            if (!item.hasAttribute('data-original-text')) {
                item.setAttribute('data-original-text', item.textContent);
            }

            const originalText = item.getAttribute('data-original-text');
            const folderName = originalText.toLowerCase();

            // Show folders that match the search term
            if (folderName.includes(searchLower)) {
                item.style.display = 'block';

                // Highlight matching text (case-insensitive)
                const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const highlightedText = originalText.replace(regex, '<mark>$1</mark>');
                item.innerHTML = highlightedText;
            } else {
                item.style.display = 'none';
            }
        });
    }

    handleFolderNavigationKeys(e) {
        const visibleSuggestions = Array.from(document.querySelectorAll('.folder-suggestion')).filter(item =>
            item.style.display !== 'none' && !item.classList.contains('folder-current')
        );

        if (visibleSuggestions.length === 0) return;

        let currentIndex = visibleSuggestions.findIndex(item => item.classList.contains('folder-highlighted'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            // Remove previous highlight
            if (currentIndex >= 0) {
                visibleSuggestions[currentIndex].classList.remove('folder-highlighted');
            }
            // Move to next item (wrap around)
            currentIndex = (currentIndex + 1) % visibleSuggestions.length;
            visibleSuggestions[currentIndex].classList.add('folder-highlighted');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            // Remove previous highlight
            if (currentIndex >= 0) {
                visibleSuggestions[currentIndex].classList.remove('folder-highlighted');
            }
            // Move to previous item (wrap around)
            currentIndex = currentIndex <= 0 ? visibleSuggestions.length - 1 : currentIndex - 1;
            visibleSuggestions[currentIndex].classList.add('folder-highlighted');
        } else if (e.key === 'Enter' && currentIndex >= 0) {
            e.preventDefault();
            // Select the highlighted item
            const selectedItem = visibleSuggestions[currentIndex];
            const folderValue = selectedItem.getAttribute('data-folder-value');
            document.getElementById('folderInput').value = folderValue === '_root' ? '' : folderValue;
            this.filterFolderSuggestions('');
            // Remove highlight
            selectedItem.classList.remove('folder-highlighted');
        } else if (e.key === 'Escape') {
            // Clear highlights and filters
            visibleSuggestions.forEach(item => item.classList.remove('folder-highlighted'));
            this.filterFolderSuggestions('');
        }
    }

    async performMoveFromModal() { return this.videoOps.performMoveFromModal() }
    updateMoveSuggestions(query, container, videoId) { this.videoOps.updateMoveSuggestions(query, container, videoId) }

    hideInlineMoveSearch() {
        document.querySelectorAll('.inline-move-ui').forEach(ui => ui.remove());
        this.currentMoveVideo = null;
    }

    async moveCurrentVideoToFolder(folderName) { return this.videoOps.moveCurrentVideoToFolder(folderName) }
    async apiMoveVideo(videoId, targetCategory, newName, targetSubcategory = null) { return this.videoOps.apiMoveVideo(videoId, targetCategory, newName, targetSubcategory) }

    async loadAllTags() {
        try {
            this.allTags = await this.api.getTags();
            this.populateTagFilter();
        } catch (error) {
            console.error('Failed to load tags:', error);
        }
    }

    async loadAllActors() {
        try {
            this.allActors = await this.api.getActors();
        } catch (error) {
            console.error('Failed to load actors:', error);
        }
    }

    async loadMetadataSuggestions() {
        try {
            // Load suggestions for channel, series, and year in parallel
            const [channelRes, seriesRes, yearRes] = await Promise.all([
                fetch(`${this.apiBase}/api/metadata/suggestions?field=channel`),
                fetch(`${this.apiBase}/api/metadata/suggestions?field=series`),
                fetch(`${this.apiBase}/api/metadata/suggestions?field=year`)
            ]);

            // Check if all responses are successful
            if (!channelRes.ok || !seriesRes.ok || !yearRes.ok) {
                console.warn('Some metadata suggestions failed to load');
                return;
            }

            const channelData = await channelRes.json();
            const seriesData = await seriesRes.json();
            const yearData = await yearRes.json();

            // Populate datalist elements with validation
            if (channelData.suggestions && Array.isArray(channelData.suggestions)) {
                this.populateDatalist('channelSuggestions', channelData.suggestions);
            }
            if (seriesData.suggestions && Array.isArray(seriesData.suggestions)) {
                this.populateDatalist('seriesSuggestions', seriesData.suggestions);
            }
            if (yearData.suggestions && Array.isArray(yearData.suggestions)) {
                this.populateDatalist('yearSuggestions', yearData.suggestions);
            }

            console.log(`📊 Loaded metadata suggestions: ${channelData.total} channels, ${seriesData.total} series, ${yearData.total} years`);
        } catch (error) {
            console.error('Failed to load metadata suggestions:', error);
        }
    }

    populateDatalist(datalistId, suggestions) {
        const datalist = document.getElementById(datalistId);
        if (!datalist) return;

        // Clear existing options
        datalist.innerHTML = '';

        // Add new options with value and label (showing count)
        if (Array.isArray(suggestions) && suggestions.length > 0) {
            suggestions.forEach(suggestion => {
                if (suggestion && suggestion.value !== undefined) {
                    const option = document.createElement('option');
                    option.value = suggestion.value;
                    option.label = `${suggestion.value} (${suggestion.count} video${suggestion.count !== 1 ? 's' : ''})`;
                    datalist.appendChild(option);
                }
            });
        }
    }

    async loadThumbnailStats() {
        try {
            const response = await fetch(`${this.apiBase}/thumbnails/stats`);
            const stats = await response.json();
            this.updateThumbnailStats(stats);
        } catch (error) {
            console.error('Failed to load thumbnail stats:', error);
        }
    }

    updateThumbnailStats(stats) {
        // Performance indicator removed per user request
        // Stats are still available in the actions menu Info section
    }

    displayHierarchicalScanResult(result) {
        // Just show the scan result and refresh the current view to show videos
        console.log(`✅ Scanned ${result.folder_name}: ${result.total_direct_videos} videos found`)

        // Switch to explorer view to show the scanned folder and its videos
        this.switchView('explorer');
        this.currentCategory = result.folder_name;

        // Load and display the videos from this category immediately
        this.loadVideosForCategory(result.folder_name);
    }



    populateTagFilter() {
        const tagFilter = document.getElementById('tagFilter');
        tagFilter.innerHTML = '<option value="">All Tags</option>';

        // Add "Untagged" option to show videos without tags
        const untaggedOption = document.createElement('option');
        untaggedOption.value = '__untagged__';
        untaggedOption.textContent = '(Untagged)';
        tagFilter.appendChild(untaggedOption);

        this.allTags.forEach(tag => {
            const option = document.createElement('option');
            option.value = tag.name;
            option.textContent = tag.name;
            tagFilter.appendChild(option);
        });

        // Restore saved tag filter
        if (this.currentTagFilter) {
            tagFilter.value = this.currentTagFilter;
        }
    }

    // ============================================================================
    // SERIES/METADATA FILTERS - Delegate to SeriesMetadataModule
    // ============================================================================

    populateSeriesFilter() { this.seriesModule.populateSeriesFilter() }
    populateYearFilter() { this.seriesModule.populateYearFilter() }
    populateChannelFilter() { this.seriesModule.populateChannelFilter() }

    populateFolderFilter() {
        const folderList = document.getElementById('folderFilterList');
        folderList.innerHTML = '';

        // Get all top-level folders (categories) from folder structure
        const folders = this.folderStructure.all_folders || [];

        // Sort folders alphabetically
        folders.sort((a, b) => a.localeCompare(b));

        folders.forEach(folder => {
            const label = document.createElement('label');
            label.className = 'folder-filter-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = folder;
            // New behavior: Only checked if explicitly in the filter list
            checkbox.checked = this.currentFolderFilter.includes(folder);
            checkbox.addEventListener('change', () => this.handleFolderFilterChange());

            const span = document.createElement('span');
            span.textContent = folder;

            // Show video count if available
            const folderData = this.folderStructure[folder];
            if (folderData && folderData.video_count !== undefined) {
                span.textContent += ` (${folderData.video_count})`;
            }

            label.appendChild(checkbox);
            label.appendChild(span);
            folderList.appendChild(label);
        });

        // Update "All Folders" checkbox state
        const selectAllCheckbox = document.getElementById('selectAllFolders');
        if (selectAllCheckbox) {
            // Checked only if ALL folders are explicitly selected
            selectAllCheckbox.checked = this.currentFolderFilter.length === folders.length && folders.length > 0;
        }

        // Update button text after populating
        this.updateFastRescanButtonText();
        this.updateFolderFilterButton();
    }

    applyFilters() {
        // Local filter fallback when no server-side query is active
        const noServerFilters = !this.currentSearchQuery && !this.currentTagFilter;
        if (noServerFilters) {
            // Apply folder filter - empty means NO videos (not ALL videos)
            // First, ensure allVideos has no null entries
            let filteredVideos = this.allVideos.filter(v => v && v.id !== null && v.id !== undefined);

            if (this.currentFolderFilter && this.currentFolderFilter.length > 0) {
                // Show only videos from selected folders
                filteredVideos = filteredVideos.filter(video => {
                    return this.currentFolderFilter.includes(video.category);
                });
                console.log(`📁 Filtered to ${filteredVideos.length} videos from ${this.currentFolderFilter.length} folder(s)`);
            } else {
                // No folders selected = show no videos
                filteredVideos = [];
            }

            // Apply enhanced metadata filters
            if (this.currentSeriesFilter) {
                if (this.currentSeriesFilter === '__unknown__') {
                    // Show videos with no series
                    filteredVideos = filteredVideos.filter(video => !video.series);
                    console.log(`📺 Filtered by series "(Unknown)": ${filteredVideos.length} videos`);
                } else {
                    filteredVideos = filteredVideos.filter(video => video.series === this.currentSeriesFilter);
                    console.log(`📺 Filtered by series "${this.currentSeriesFilter}": ${filteredVideos.length} videos`);
                }
            }

            if (this.currentYearFilter) {
                const yearNum = parseInt(this.currentYearFilter);
                filteredVideos = filteredVideos.filter(video => video.year === yearNum);
                console.log(`📅 Filtered by year ${this.currentYearFilter}: ${filteredVideos.length} videos`);
            }

            if (this.currentChannelFilter) {
                console.log(`🔍 Applying channel filter: "${this.currentChannelFilter}"`);
                console.log(`📊 Videos before channel filter: ${filteredVideos.length}`);
                if (this.currentChannelFilter === '__unknown__') {
                    // Show videos with no channel
                    filteredVideos = filteredVideos.filter(video => !video.channel);
                    console.log(`📡 Filtered by channel "(Unknown)": ${filteredVideos.length} videos`);
                } else {
                    filteredVideos = filteredVideos.filter(video => video.channel === this.currentChannelFilter);
                    console.log(`📡 Filtered by channel "${this.currentChannelFilter}": ${filteredVideos.length} videos`);
                }
            }

            if (this.currentRatingFilter) {
                const minRating = parseFloat(this.currentRatingFilter);
                filteredVideos = filteredVideos.filter(video => video.rating && video.rating >= minRating);
                console.log(`⭐ Filtered by rating >= ${minRating}: ${filteredVideos.length} videos`);
            }

            if (this.currentFavoriteFilter) {
                filteredVideos = filteredVideos.filter(video => video.favorite);
                console.log(`❤️ Filtered by favorite: ${filteredVideos.length} videos`);
            }

            this.videos = filteredVideos;
            this.applySorting();
            this.resetPagination();
            this.renderVideoGrid();
            this.updateLoadMoreButton();
        }
    }

    resetPagination() { this.collectionModule.resetPagination() }

    removeVideoFromView(videoId) { this.videoOps.removeVideoFromView(videoId) }

    renderVideoGrid() { this.collectionModule.renderVideoGrid() }

    renderVideoGridWithoutReset() { this.collectionModule.renderVideoGridWithoutReset() }

    async performSearch(query, tagFilter = '') {
        try {
            const params = new URLSearchParams();

            // Parse duration filter from query (format: duration:30-45)
            let searchQuery = query;
            let durationMin = null;
            let durationMax = null;

            if (query) {
                const durationMatch = query.match(/duration:\s*(\d+)\s*-\s*(\d+)/i);
                if (durationMatch) {
                    durationMin = parseInt(durationMatch[1]);
                    durationMax = parseInt(durationMatch[2]);
                    // Remove duration filter from search query
                    searchQuery = query.replace(/duration:\s*\d+\s*-\s*\d+/gi, '').trim();
                    console.log(`⏱️ Duration filter: ${durationMin}s - ${durationMax}s`);
                }
            }

            if (searchQuery) params.append('q', searchQuery);
            if (tagFilter) params.append('tags', tagFilter);
            if (durationMin !== null) params.append('duration_min', durationMin);
            if (durationMax !== null) params.append('duration_max', durationMax);

            // Only add category filter if not in "All Videos" mode
            if (this.currentCategory && this.currentCategory !== "_all") {
                params.append('category', this.currentCategory);
            }

            // Add subcategory filter if we're in a specific subfolder
            if (this.currentSubcategory) {
                params.append('subcategory', this.currentSubcategory);
            }

            const response = await fetch(`${this.apiBase}/search?${params}`);
            let videos = await response.json();

            // Apply folder filter if active (client-side filtering of search results)
            // For search/tag filters: folder filter acts as additional constraint
            // Empty folder filter = search all folders (don't constrain)
            if (this.currentFolderFilter && this.currentFolderFilter.length > 0) {
                videos = videos.filter(video => {
                    return this.currentFolderFilter.includes(video.category);
                });
                console.log(`🔍 Search results filtered by ${this.currentFolderFilter.length} folder(s): ${videos.length} videos match`);
            } else {
                console.log(`🔍 Search results from all folders: ${videos.length} videos`);
            }

            this.videos = videos;
            document.getElementById('videoGrid').innerHTML = '';
            this.renderVideoGrid();
        } catch (error) {
            console.log('Search failed')
        }
    }

    resetCollectionView() {
        /**
         * Reset collection view to default state (like first navigation)
         * Uses same logic as clearFilters() for consistency
         */
        // Blur search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.blur();
        }

        // Use clearFilters which handles everything correctly
        this.clearFilters();

        console.log('🔄 Collection view reset via ESC');
    }

    async handleFiltersChanged() {
        // Check for untagged filter
        if (this.currentTagFilter === '__untagged__') {
            // Load all videos first if not already loaded
            if (!this.allVideos || this.allVideos.length === 0) {
                await this.loadAllVideosFlat();
            }
            this.filterUntaggedVideos();
            return;
        }

        // Check if we have any metadata filters active
        const hasMetadataFilters = this.currentSeriesFilter || this.currentYearFilter ||
            this.currentChannelFilter || this.currentRatingFilter ||
            this.currentFavoriteFilter;

        // If we have metadata filters but no search/tag filters, apply all filters together
        if (hasMetadataFilters && !this.currentSearchQuery && !this.currentTagFilter) {
            // Load all videos first if not already loaded
            if (!this.allVideos || this.allVideos.length === 0) {
                await this.loadAllVideosFlat();
            }
            this.applyFilters();  // This handles both folder + metadata filters
            return;
        }

        // Apply folder filter first (client-side) for non-metadata cases
        // Load all videos first if not already loaded
        if (!this.allVideos || this.allVideos.length === 0) {
            await this.loadAllVideosFlat();
        }
        this.applyFolderFilter();

        // If no other filters at all -> done
        if (!this.currentSearchQuery && !this.currentTagFilter) {
            return;
        }

        // Otherwise perform server-side search
        await this.performSearch(this.currentSearchQuery, this.currentTagFilter);
    }

    handleFolderFilterChange() {
        const checkboxes = document.querySelectorAll('#folderFilterList input[type="checkbox"]');
        const selectAllCheckbox = document.getElementById('selectAllFolders');

        // Get selected folders
        const selectedFolders = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.value);

        // Update current filter
        this.currentFolderFilter = selectedFolders;

        // Update "All Folders" checkbox state
        const allFolders = Array.from(checkboxes).map(cb => cb.value);
        selectAllCheckbox.checked = selectedFolders.length === allFolders.length;

        // Update button text
        this.updateFolderFilterButton();
        this.updateFastRescanButtonText();

        // Note: Sort preference is maintained across views
        // Default sort is A-Z (name-asc) everywhere

        // Apply filters (this will trigger sorting and rendering)
        this.handleFiltersChanged();

        // Save settings
        this.saveSettingsToStorage();
    }

    handleSelectAllFolders() {
        const selectAllCheckbox = document.getElementById('selectAllFolders');
        const checkboxes = document.querySelectorAll('#folderFilterList input[type="checkbox"]');

        checkboxes.forEach(cb => {
            cb.checked = selectAllCheckbox.checked;
        });

        this.handleFolderFilterChange();
    }

    updateFolderFilterButton() {
        const btn = document.getElementById('folderFilterBtn');
        const allFolders = this.folderStructure.all_folders || [];

        if (this.currentFolderFilter.length === 0) {
            btn.textContent = 'No Folders ▾';
        } else if (this.currentFolderFilter.length === allFolders.length) {
            btn.textContent = 'All Folders ▾';
        } else if (this.currentFolderFilter.length === 1) {
            btn.textContent = `${this.currentFolderFilter[0]} ▾`;
        } else {
            btn.textContent = `${this.currentFolderFilter.length} Folders ▾`;
        }
    }

    applyFolderFilter() {
        // New behavior: Empty folder filter = show no videos (explicit selection required)
        if (this.currentFolderFilter.length === 0) {
            this.videos = [];
            console.log('📁 No folders selected - showing no videos');
        } else {
            // Filter videos by selected folders
            this.videos = this.allVideos.filter(video =>
                this.currentFolderFilter.includes(video.category)
            );
            console.log(`📁 Filtered to ${this.videos.length} videos from ${this.currentFolderFilter.length} folder(s)`);
        }

        // Apply sorting after filtering
        this.applySorting();

        document.getElementById('videoGrid').innerHTML = '';
        this.renderVideoGrid();
    }

    // ==================== SORTING METHODS (delegated to SortingModule) ====================

    handleSortChange() { this.sorting.handleSortChange() }
    applySorting() { this.sorting.applySorting() }
    sortRandom() { this.sorting.sortRandom() }
    sortByName(ascending = true) { this.sorting.sortByName(ascending) }
    sortByNewest() { this.sorting.sortByNewest() }
    sortByModified() { this.sorting.sortByModified() }
    sortBySize() { this.sorting.sortBySize() }
    sortByDuration() { this.sorting.sortByDuration() }
    setSortDefault(sortMethod) { this.sorting.setSortDefault(sortMethod) }
    toggleFolderFilterMenu() { this.sorting.toggleFolderFilterMenu() }
    filterUntaggedVideos() { this.sorting.filterUntaggedVideos() }

    debounce(fn, delay) { return this.sorting.debounce(fn, delay) }

    escapeHtml(text) { return this.sorting.escapeHtml(text) }
    throttle(fn, delay = 100) { return this.sorting.throttle(fn, delay) }
    switchView(viewType, resetNavigation = true, animate = true) { this.sorting.switchView(viewType, resetNavigation, animate) }
    showListViewSearchUI() { this.sorting.showListViewSearchUI() }
    async loadAllVideosSimple() { await this.sorting.loadAllVideosSimple() }
    showLoadingOverlay() { this.sorting.showLoadingOverlay() }
    hideLoadingOverlay() { this.sorting.hideLoadingOverlay() }
    updateLoadingProgress(message) { this.sorting.updateLoadingProgress(message) }
    disableAllFilters() { this.sorting.disableAllFilters() }
    enableAllFilters() { this.sorting.enableAllFilters() }

    async loadAllVideosFlat(forceReload = false) { return this.collectionModule.loadAllVideosFlat(forceReload) }

    showAllVideosInCollection() { this.collectionModule.showAllVideosInCollection() }

    async renderSeriesView() { await this.seriesModule.renderSeriesView() }
    attachSeriesEventListeners() { this.seriesModule.attachSeriesEventListeners() }
    createVideoCardHTML(video) { return this.seriesModule.createVideoCardHTML(video) }

    // Explorer search removed - use List view for searching across all videos

    renderFolderExplorer() { this.nav.renderFolderExplorer() }

    async loadVideosInFolder(category, subcategory) { return this.nav.loadVideosInFolder(category, subcategory) }

    renderMainCategories() { this.nav.renderMainCategories() }

    renderBreadcrumb() { this.nav.renderBreadcrumb() }

    navigateToCategory(category) { this.nav.navigateToCategory(category) }

    async navigateToSubcategory(category, subcategory) { return this.nav.navigateToSubcategory(category, subcategory) }

    // ==================== TAG MODAL FUNCTIONS ====================
    // Note: TagManagementModule is available as this.tagModule for gradual migration
    // Legacy currentVideoTags state is managed by the module
    get currentVideoTags() { return this.tagModule.currentVideoTags }
    set currentVideoTags(val) { this.tagModule.currentVideoTags = val }

    // Duplicate review state - delegated to duplicateModule
    get duplicateViewActive() { return this.duplicateModule.duplicateViewActive }
    set duplicateViewActive(val) { this.duplicateModule.duplicateViewActive = val }
    get duplicateViewData() { return this.duplicateModule.duplicateViewData }
    set duplicateViewData(val) { this.duplicateModule.duplicateViewData = val }
    get previousViewState() { return this.duplicateModule.previousViewState }
    set previousViewState(val) { this.duplicateModule.previousViewState = val }
    get duplicatesReviewActive() { return this.duplicateModule.duplicatesReviewActive }
    set duplicatesReviewActive(val) { this.duplicateModule.duplicatesReviewActive = val }

    // ===== TAG MANAGEMENT METHODS (delegated to TagManagementModule) =====
    async showTagModal(videoId, videoName) { await this.tagModule.showTagModal(videoId, videoName) }
    setupTagAutocomplete() { this.tagModule.setupTagAutocomplete() }
    updateTagSuggestions(query = '') { this.tagModule.updateTagSuggestions(query) }
    renderTagSuggestions(tags, query) { this.tagModule.renderTagSuggestions(tags, query) }
    selectTagSuggestion(tagName) { this.tagModule.selectTagSuggestion(tagName) }
    hideTagAutocomplete() { this.tagModule.hideTagAutocomplete() }
    hideTagModal() { this.tagModule.hideTagModal() }

    // Mobile tag modal wrappers (delegated to TagManagementModule)
    async showMobileTagModal(videoId, videoName) { await this.tagModule.showMobileTagModal(videoId, videoName) }
    setupMobileTagModal() { this.tagModule.setupMobileTagModal() }
    toggleMobileTag(tagId) { this.tagModule.toggleMobileTag(tagId) }
    removeMobileTag(tagId) { this.tagModule.removeMobileTag(tagId) }
    renderMobileCurrentTags() { this.tagModule.renderMobileCurrentTags() }
    renderMobileSuggestedTags(filterQuery = '') { this.tagModule.renderMobileSuggestedTags(filterQuery) }
    hideMobileTagModal() { this.tagModule.hideMobileTagModal() }
    renderCurrentTags() { this.tagModule.renderCurrentTags() }
    renderAllTagSuggestions(filterQuery = '') { this.tagModule.renderAllTagSuggestions(filterQuery) }

    getIntelligentTagSuggestions(filterQuery = '') {
        const allAvailableTags = this.allTags || [];
        const currentVideo = this.videos.find(v => v.id === this.currentVideo?.id);
        const currentTagIds = this.currentVideoTags.map(t => t.id);

        // If filtering, just return filtered results (up to 9) but exclude configured prefixes unless explicitly typed
        if (filterQuery) {
            const isUserSearching = filterQuery && this.excludedTagPrefixes.some(prefix => filterQuery.toLowerCase().startsWith(prefix));
            return allAvailableTags
                .filter(tag => {
                    if (!isUserSearching && this.isExcludedTag(tag.name)) return false; // Hide excluded unless explicitly typed
                    return tag.name.toLowerCase().includes(filterQuery.toLowerCase());
                })
                .slice(0, 9);
        }

        // Build intelligent suggestions
        let suggestions = [];
        const addedTagIds = new Set();

        // 1. Recently used tags (up to 3) - exclude configured tag prefixes
        const recentTags = this.recentlyUsedTags
            .filter(tagName => {
                const tag = allAvailableTags.find(t => t.name === tagName);
                return tag && !currentTagIds.includes(tag.id) && !this.isExcludedTag(tag.name);
            })
            .slice(0, 3)
            .map(tagName => {
                const tag = allAvailableTags.find(t => t.name === tagName);
                return { ...tag, reason: '🕐' }; // Recently used
            });

        recentTags.forEach(tag => {
            if (tag && !addedTagIds.has(tag.id)) {
                suggestions.push(tag);
                addedTagIds.add(tag.id);
            }
        });

        // 2. Tags from the same category (up to 3)
        if (currentVideo?.category) {
            const categoryVideos = this.allVideos.filter(v =>
                v.category === currentVideo.category && v.id !== currentVideo.id
            );

            const categoryTagCounts = {};
            categoryVideos.forEach(video => {
                if (video.tags) {
                    video.tags.forEach(tag => {
                        if (!currentTagIds.includes(tag.id) && !addedTagIds.has(tag.id)) {
                            categoryTagCounts[tag.id] = (categoryTagCounts[tag.id] || 0) + 1;
                        }
                    });
                }
            });

            const categoryTags = Object.entries(categoryTagCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([tagId]) => {
                    const tag = allAvailableTags.find(t => t.id === parseInt(tagId));
                    return tag ? { ...tag, reason: '📁' } : null; // Same category
                })
                .filter(tag => tag !== null);

            categoryTags.forEach(tag => {
                if (!addedTagIds.has(tag.id)) {
                    suggestions.push(tag);
                    addedTagIds.add(tag.id);
                }
            });
        }

        // 3. Most frequently used tags overall (fill up to 9) - exclude configured tag prefixes
        const remainingSlots = 9 - suggestions.length;
        if (remainingSlots > 0) {
            const frequentTags = Object.entries(this.tagUsageCount)
                .sort((a, b) => b[1] - a[1])
                .slice(0, remainingSlots)
                .map(([tagName]) => {
                    const tag = allAvailableTags.find(t => t.name === tagName);
                    return tag && !currentTagIds.includes(tag.id) && !addedTagIds.has(tag.id) && !this.isExcludedTag(tag.name)
                        ? { ...tag, reason: '⭐' } // Popular
                        : null;
                })
                .filter(tag => tag !== null);

            suggestions.push(...frequentTags);
        }

        // 4. If still not enough, add random available tags (but exclude configured tag prefixes)
        const finalRemaining = 9 - suggestions.length;
        if (finalRemaining > 0) {
            const randomTags = allAvailableTags
                .filter(tag => !currentTagIds.includes(tag.id) && !addedTagIds.has(tag.id) && !this.isExcludedTag(tag.name))
                .slice(0, finalRemaining)
                .map(tag => ({ ...tag, reason: '' }));

            suggestions.push(...randomTags);
        }

        return suggestions.slice(0, 9);
    }

    async addTagFromSuggestion(tag) { await this.tagModule.addTagFromSuggestion(tag) }

    trackTagUsage(tagName) {
        // Add to recently used (keep last 10)
        this.recentlyUsedTags = [
            tagName,
            ...this.recentlyUsedTags.filter(t => t !== tagName)
        ].slice(0, 10);

        // Increment usage count
        this.tagUsageCount[tagName] = (this.tagUsageCount[tagName] || 0) + 1;

        // Persist to localStorage using storage module
        this.storage.saveTagUsage(this.recentlyUsedTags, this.tagUsageCount);
    }

    // ✅ NEW: Check if a tag should be excluded from suggestions
    isExcludedTag(tagName) {
        return this.excludedTagPrefixes.some(prefix => tagName.startsWith(prefix));
    }

    loadTagUsageFromStorage() {
        // Use storage module for localStorage operations
        const { recentTags, usageCount } = this.storage.loadTagUsage();
        this.recentlyUsedTags = recentTags;
        this.tagUsageCount = usageCount;
    }

    // ==================== SETTINGS PERSISTENCE ====================

    saveSettingsToStorage() {
        // Collect current settings and delegate to storage module
        const settings = {
            currentView: this.currentView,
            currentSort: this.currentSort,
            currentSearchQuery: this.currentSearchQuery,
            currentTagFilter: this.currentTagFilter,
            currentFolderFilter: this.currentFolderFilter,
            verticalMode: this.verticalMode,
            currentCategory: this.currentCategory,
            currentSubcategory: this.currentSubcategory,
            breadcrumb: this.breadcrumb
        };
        this.storage.saveSettings(settings);
    }

    loadSettingsFromStorage() {
        // Use storage module to load settings
        const settings = this.storage.loadSettings();
        if (!settings) return;

        // Mark that we found saved settings (not first load)
        this.isFirstLoad = false;

        // Restore state from settings
        if (settings.currentView) {
            this.currentView = settings.currentView;
        }
        if (settings.currentSort) {
            this.currentSort = settings.currentSort;
            // Update sort UI elements
            const sortSelect = this.dom.get('sortSelect');
            if (sortSelect) {
                sortSelect.value = settings.currentSort;
            }
            const sortLabel = this.dom.get('menuSortLabel');
            const sortNames = {
                'random': 'Random',
                'name-asc': 'Name (A-Z)',
                'name-desc': 'Name (Z-A)',
                'newest': 'Newest First',
                'modified': 'Recently Modified',
                'size-desc': 'Largest First',
                'duration-desc': 'Longest First'
            };
            if (sortLabel) {
                sortLabel.textContent = sortNames[settings.currentSort] || 'Name (A-Z)';
            }
        }
        if (settings.currentSearchQuery) {
            this.currentSearchQuery = settings.currentSearchQuery;
            const searchInput = this.dom.get('searchInput');
            if (searchInput) {
                searchInput.value = settings.currentSearchQuery;
            }
        }
        if (settings.currentTagFilter) {
            this.currentTagFilter = settings.currentTagFilter;
        }
        if (settings.currentFolderFilter && Array.isArray(settings.currentFolderFilter)) {
            this.currentFolderFilter = settings.currentFolderFilter;
        }
        if (settings.verticalMode !== undefined) {
            this.verticalMode = settings.verticalMode;
            const videoGrid = this.dom.get('videoGrid');
            if (videoGrid && this.verticalMode) {
                videoGrid.classList.add('vertical-mode');
            }
        }
        if (settings.currentCategory !== undefined) {
            this.currentCategory = settings.currentCategory;
        }
        if (settings.currentSubcategory !== undefined) {
            this.currentSubcategory = settings.currentSubcategory;
        }
        if (settings.breadcrumb && Array.isArray(settings.breadcrumb)) {
            this.breadcrumb = settings.breadcrumb;
        }

        console.log('✅ Settings restored:', settings);
    }

    clearSettingsFromStorage() {
        this.storage.clearSettings();
    }

    async addTag() { await this.tagModule.addTag() }
    async addPerfectTag(videoId, videoName) { await this.tagModule.addPerfectTag(videoId, videoName) }
    async addJunkTag(videoId, videoName) { await this.tagModule.addJunkTag(videoId, videoName) }
    updateVideoCardTags(videoId) { this.tagModule.updateVideoCardTags(videoId) }

    updateVideoCardAfterRename(videoId, updatedVideoData) {
        // Find the video card in the DOM
        const videoCard = document.querySelector(`[data-video-id="${videoId}"]`);
        if (!videoCard) {
            console.warn(`Video card not found for video ID ${videoId}`);
            return;
        }

        // Update the video display name/title in the card
        const videoTitle = videoCard.querySelector('.video-title');
        if (videoTitle) {
            const displayName = updatedVideoData.display_name || updatedVideoData.name;
            videoTitle.textContent = displayName;
            videoTitle.setAttribute('title', displayName);
        }

        // Also update the old .video-name selector for backwards compatibility
        const videoName = videoCard.querySelector('.video-name');
        if (videoName) {
            videoName.textContent = updatedVideoData.display_name || updatedVideoData.name;
        }

        console.log(`Updated video card for ID ${videoId} with new display name: ${updatedVideoData.display_name || updatedVideoData.name}`);
    }

    async removeTag(tagId) { await this.tagModule.removeTag(tagId) }

    // ==================== ACTOR MODAL FUNCTIONS ====================
    // Delegated to ActorManagementModule

    async showActorModal(videoId, videoName) {
        return this.actorModule.showActorModal(videoId, videoName)
    }

    hideActorModal() {
        return this.actorModule.hideActorModal()
    }

    // Legacy currentVideoActors state (now managed by module, kept for backward compatibility)
    get currentVideoActors() { return this.actorModule.currentVideoActors }
    set currentVideoActors(val) { this.actorModule.currentVideoActors = val }

    async showSceneDescriptionModal(videoId, videoName) {
        this.currentVideo = { id: videoId, name: videoName };

        // Hide Duplicates Review View if active
        this.hideDuplicatesReviewIfActive();

        // Load current description for this video
        const video = this.allVideos.find(v => v.id === videoId) || this.videos.find(v => v.id === videoId);
        const currentDescription = video ? (video.description || '') : '';

        // Set up the modal
        const sceneInput = document.getElementById('sceneDescriptionInput');
        if (!sceneInput) {
            console.error('Scene description input not found');
            return;
        }
        sceneInput.value = currentDescription;

        document.getElementById('sceneDescriptionModal').style.display = 'flex';
        sceneInput.focus();
    }

    async saveSceneDescription() {
        if (!this.currentVideo) return;

        const sceneInput = document.getElementById('sceneDescriptionInput');
        const description = sceneInput.value.trim();

        try {
            const response = await fetch(`/api/videos/${this.currentVideo.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: description })
            });

            if (response.ok) {
                // Update the local video object
                const video = this.allVideos.find(v => v.id === this.currentVideo.id) || this.videos.find(v => v.id === this.currentVideo.id);
                if (video) {
                    video.description = description;
                }
                this.hideSceneDescriptionModal();
            } else {
                console.error('Failed to save description');
                alert('Error saving description');
            }
        } catch (error) {
            console.error('Error saving description:', error);
            alert('Error saving description');
        }
    }

    async saveSceneDescriptionAndMarkFinal() {
        if (!this.currentVideo) return;

        try {
            // First save the description
            const sceneInput = document.getElementById('sceneDescriptionInput');
            const description = sceneInput.value.trim();
            const videoId = this.currentVideo.id;

            const response = await fetch(`/api/videos/${videoId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: description })
            });

            if (response.ok) {
                // Update the local video object
                let video = this.allVideos.find(v => v.id === videoId) || this.videos.find(v => v.id === videoId);
                if (video) {
                    video.description = description;
                }

                // Then mark as final
                const finalResponse = await fetch(`${this.apiBase}/videos/${videoId}/toggle-final`, {
                    method: 'POST'
                });

                if (finalResponse.ok) {
                    const finalData = await finalResponse.json();
                    if (video) {
                        video.is_final = finalData.is_final;
                    }
                }

                // Then hash rename
                const renameResponse = await fetch(`/api/videos/${videoId}/hash-rename`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (renameResponse.ok) {
                    const renameResult = await renameResponse.json();
                    if (renameResult.video) {
                        // Update arrays with the renamed video (which has updated relative_path)
                        const videoIndex = this.videos.findIndex(v => v.id === videoId);
                        if (videoIndex !== -1) {
                            this.videos[videoIndex] = renameResult.video;
                        }
                        const allVideoIndex = this.allVideos.findIndex(v => v.id === videoId);
                        if (allVideoIndex !== -1) {
                            this.allVideos[allVideoIndex] = renameResult.video;
                        }
                        // Use the updated video from rename response for card creation
                        video = renameResult.video;
                    }
                }

                this.hideSceneDescriptionModal();

                // Update the video card in the DOM with the fully updated video object
                const videoCard = document.querySelector(`.video-card[data-video-id="${videoId}"]`);
                if (videoCard && video) {
                    const newCard = this.createVideoCard(video);
                    videoCard.replaceWith(newCard);
                    // Setup lazy loading for the new card's thumbnail
                    this.setupLazyLoading();
                }

                // Refresh the current video to ensure it plays with the new path
                if (this.currentPlayingVideo && this.currentPlayingVideo.id === videoId) {
                    this.currentPlayingVideo = video;
                    this.refreshVideoFromContext();
                }
            } else {
                console.error('Failed to save description');
            }
        } catch (error) {
            console.error('Error saving and marking final:', error);
        }
    }

    hideSceneDescriptionModal() {
        document.getElementById('sceneDescriptionModal').style.display = 'none';
        const sceneInput = document.getElementById('sceneDescriptionInput');
        if (sceneInput) sceneInput.value = '';
        this.currentVideo = null;

        // Restore Duplicates Review View if it was hidden
        this.restoreDuplicatesReviewIfNeeded();
    }

    // Series Modal Methods
    // ============================================================================
    // SERIES MODAL - Delegate to SeriesMetadataModule
    // ============================================================================

    showSeriesModalFromContext() { this.seriesModule.showSeriesModalFromContext() }
    hideSeriesModal() { this.seriesModule.hideSeriesModal() }
    async saveSeriesInfo() { await this.seriesModule.saveSeriesInfo() }
    async clearSeriesInfo() { await this.seriesModule.clearSeriesInfo() }

    // Actor Render/Add/Remove Methods - Delegate to ActorManagementModule
    renderCurrentActors() {
        return this.actorModule.renderCurrentActors()
    }

    renderAllActorSuggestions(filterQuery = '') {
        return this.actorModule.renderAllActorSuggestions(filterQuery)
    }

    async addActorFromSuggestion(actor) {
        return this.actorModule.addActorFromSuggestion(actor)
    }

    async addActor() {
        return this.actorModule.addActor()
    }

    async removeActor(actorId) {
        return this.actorModule.removeActor(actorId)
    }

    updateVideoCardActors(videoId) {
        return this.actorModule.updateVideoCardActors(videoId)
    }

    filterByActor(actorName) {
        // TODO: Implement actor filtering (similar to tag filtering)
        console.log('Filter by actor:', actorName)
        console.log(`Filtering by actor: ${actorName} (coming soon)`)
    }

    toTitleCase(str) {
        return this.actorModule.toTitleCase(str)
    }

    getFolderColor(folderName, type = 'background') { return this.format.getFolderColor(folderName, type) }

    // Update navigateSuggestions to handle actors
    navigateSuggestions(direction, type) {
        const container = type === 'tag' ?
            document.getElementById('tagAutocomplete') :
            type === 'actor' ?
                document.getElementById('actorAutocomplete') :
                document.getElementById('folderSuggestionsList');

        if (!container || container.style.display === 'none') return;

        const suggestions = container.querySelectorAll(
            type === 'tag' || type === 'actor' ? '.tag-suggestion' : '.folder-suggestion'
        );

        if (suggestions.length === 0) return;

        const currentSelected = container.querySelector('.selected');
        let newIndex = 0;

        if (currentSelected) {
            currentSelected.classList.remove('selected');
            const currentIndex = Array.from(suggestions).indexOf(currentSelected);
            newIndex = direction === 'down' ?
                (currentIndex + 1) % suggestions.length :
                (currentIndex - 1 + suggestions.length) % suggestions.length;
        }

        suggestions[newIndex].classList.add('selected');
        suggestions[newIndex].scrollIntoView({ block: 'nearest' });
    }

    formatFileSize(bytes) { return this.format.formatFileSize(bytes) }
    formatDate(timestamp) { return this.format.formatDate(timestamp) }

    showStatus(message, type) {
        const status = document.getElementById('status');
        status.innerHTML = message;
        status.className = `status ${type}`;
    }

    showNotification(message, type = 'success', duration = 3000) {
        const container = document.getElementById('notification-container');
        if (!container) return;

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        // Auto-dismiss notification
        if (duration > 0) {
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }
    }

    showToast(message, type = 'success', duration = 3000) {
        // Alias for backwards compatibility - now uses new notification system
        this.showNotification(message, type, duration);
    }

    dismissAllNotifications() {
        // Remove all active notifications
        const container = document.getElementById('notification-container');
        if (container) {
            const notifications = container.querySelectorAll('.notification');
            notifications.forEach(notif => {
                notif.classList.add('fade-out');
                setTimeout(() => notif.remove(), 300);
            });
        }
    }

    dismissAllToasts() {
        // Alias for backwards compatibility
        this.dismissAllNotifications();
    }

    // New compact explorer methods
    renderFolderContents() { this.nav.renderFolderContents() }

    getSubfolderVideoCount(folderData) { return this.nav.getSubfolderVideoCount(folderData) }

    async loadAndShowVideosInFolder(category, subcategory, skipCache = false) { return this.nav.loadAndShowVideosInFolder(category, subcategory, skipCache) }

    async smartRefreshFolder(folderName) {
        /**
         * ⚡ SMART REFRESH - ONE button that does EVERYTHING:
         * 1. Scans folder for new/changed files AND DELETED files
         * 2. Syncs to database (add new, update modified, DELETE missing)
         * 3. Generates missing thumbnails
         * 4. Clears browser cache (images + DOM)
         * 5. Forces immediate visual refresh with proper cache busting
         *
         * This is THE refresh method - use this everywhere!
         */
        try {
            // Close the folder menu if it's open
            this.hideFolderMenu();

            console.log(`🔄 Smart refresh starting for folder: ${folderName}`);

            // Show loading overlay to prevent accidental clicks during refresh
            this.showRefreshLoadingOverlay();

            // Step 1: Call the smart refresh endpoint
            const data = await this.api.scanFolderSmartRefresh(folderName);
            console.log(`✅ Smart refresh completed:`, data);

            // Step 2: Clear all browser image caches for this folder
            this.clearImageCacheForFolder(folderName);

            // Step 3: Reload metadata from server
            await this.loadScanStatus();
            await this.loadFolderStructure();

            // Step 4: Force reload videos with aggressive cache busting
            const videos = await this.api.getVideosByFolder(folderName, true);
            // Ensure videos is always an array
            const freshVideos = Array.isArray(videos) ? videos : (videos?.videos || []);
            this.allVideos = freshVideos;
            this.videos = freshVideos;
            console.log(`🔄 Reloaded ${this.videos.length} videos from API`);

            // Step 4b: Update allVideosCatalog to remove deleted videos from this folder
            // This ensures collection view shows correct data after folder refresh
            if (this.allVideosCatalog && this.allVideosCatalog.length > 0) {
                // Remove old videos from this folder, add fresh ones
                const otherFolderVideos = this.allVideosCatalog.filter(v => v.category !== folderName);
                this.allVideosCatalog = otherFolderVideos.concat(freshVideos);
                console.log(`📦 Updated collection cache: removed deleted videos from ${folderName}, total: ${this.allVideosCatalog.length}`);
            }

            // Step 5: Clear DOM image elements to force reload
            this.clearImageElementsForFolder(folderName);

            // Step 6: Re-render the appropriate view with fresh data
            if (this.currentView === 'explorer') {
                if (this.currentCategory === folderName) {
                    this.renderFolderContents();
                } else {
                    this.renderFolderExplorer();
                }
            } else {
                this.renderVideoGrid();
            }

            // Step 7: Manually trigger image loading for visible images
            this.reloadVisibleImages();

            // Hide loading overlay when refresh completes
            this.hideRefreshLoadingOverlay();

        } catch (error) {
            console.error('❌ Error during smart refresh:', error);
            // Hide overlay even on error
            this.hideRefreshLoadingOverlay();
        }
    }

    clearImageCacheForFolder(folderName) {
        /**
         * Clear browser's image cache for all images in this folder
         * This ensures thumbnails show fresh versions
         */
        console.log(`🗑️ Clearing image cache for folder: ${folderName}`);

        // Clear from IndexedDB (Service Worker cache if available)
        if ('caches' in window) {
            caches.keys().then(cacheNames => {
                cacheNames.forEach(cacheName => {
                    caches.open(cacheName).then(cache => {
                        cache.keys().then(requests => {
                            requests.forEach(request => {
                                // Remove requests that contain this folder's videos
                                if (request.url.includes(`/videos/${encodeURIComponent(folderName)}`) ||
                                    request.url.includes(`/thumbnail/`) ||
                                    request.url.includes(`/thumbnails/`)) {
                                    cache.delete(request);
                                }
                            });
                        });
                    });
                });
            }).catch(e => console.log('Cache clearing not available:', e));
        }
    }

    clearImageElementsForFolder(folderName) {
        /**
         * Clear image src attributes for all thumbnail images
         * This forces lazy loaders to re-fetch when IntersectionObserver triggers
         */
        console.log(`🖼️ Clearing DOM image elements for folder: ${folderName}`);

        // Find all lazy-image elements and reset them
        const lazyImages = document.querySelectorAll('img.lazy-image');
        lazyImages.forEach(img => {
            // Reset the data-src to force reload
            if (img.hasAttribute('data-src')) {
                const originalSrc = img.getAttribute('data-src');
                // Add cache-buster to data-src
                const cacheBuster = `${originalSrc.includes('?') ? '&' : '?'}_refresh=${Date.now()}`;
                img.setAttribute('data-src', originalSrc + cacheBuster);
            }
            // Clear the current src
            img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23f3f4f6'/%3E%3C/svg%3E";
        });

        // Also clear any fully loaded images to reload from cache-busted URL
        const thumbnailImages = document.querySelectorAll('img[alt]');
        thumbnailImages.forEach(img => {
            if (img.classList.contains('loaded') || img.src.includes('thumbnail')) {
                img.classList.remove('loaded');
                img.classList.add('lazy-image');
            }
        });
    }

    reloadVisibleImages() {
        /**
         * Manually trigger lazy loading for all visible images
         * This ensures new thumbnails appear immediately without scrolling
         */
        console.log('📸 Reloading visible images...');

        const lazyImages = document.querySelectorAll('img.lazy-image[data-src]');
        lazyImages.forEach(img => {
            const rect = img.getBoundingClientRect();
            // Check if image is in viewport (with some margin)
            if (rect.top < window.innerHeight + 100 && rect.bottom > -100) {
                const src = img.getAttribute('data-src');
                if (src && !img.src.includes(src.split('?')[0])) {
                    img.src = src;
                    img.classList.add('loaded');
                    console.log(`📸 Loaded visible image: ${src.split('?')[0]}`);
                }
            }
        });
    }

    async forceRefreshFolderList() { return this.nav.forceRefreshFolderList() }

    async forceRefreshCurrentFolder() {
        /**
         * Wrapper that redirects to smart refresh
         * Use smartRefreshFolder() directly for new code
         */
        if (!this.currentCategory) {
            console.warn('⚠️ No current category to refresh');
            return;
        }
        await this.smartRefreshFolder(this.currentCategory);
    }

    showRefreshLoadingOverlay() {
        /**
         * Show a loading overlay during folder refresh
         * Prevents accidental clicks while refresh is in progress
         */
        // Remove existing overlay if any
        const existingOverlay = document.getElementById('refreshLoadingOverlay');
        if (existingOverlay) existingOverlay.remove();

        const overlay = document.createElement('div');
        overlay.id = 'refreshLoadingOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(2px);
        `;

        const spinnerContainer = document.createElement('div');
        spinnerContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            background: white;
            padding: 40px 60px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        `;

        // Spinner animation
        const spinner = document.createElement('div');
        spinner.style.cssText = `
            width: 50px;
            height: 50px;
            border: 4px solid #f3f4f6;
            border-top: 4px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        `;

        // Add animation keyframes
        if (!document.getElementById('refreshSpinnerStyle')) {
            const style = document.createElement('style');
            style.id = 'refreshSpinnerStyle';
            style.textContent = `
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        const text = document.createElement('div');
        text.style.cssText = `
            font-size: 16px;
            font-weight: 600;
            color: #374151;
            text-align: center;
        `;
        text.textContent = '🔄 Refreshing folder...';

        spinnerContainer.appendChild(spinner);
        spinnerContainer.appendChild(text);
        overlay.appendChild(spinnerContainer);
        document.body.appendChild(overlay);
    }

    hideRefreshLoadingOverlay() {
        /**
         * Hide the loading overlay when refresh completes
         */
        const overlay = document.getElementById('refreshLoadingOverlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => overlay.remove(), 300);
        }
    }

    async scanFolder(folderName) {
        try {
            console.log(`🔄 Scanning folder: ${folderName}...`)

            const data = await this.api.scanFolder(folderName);

            console.log(`✅ Scanned ${folderName}: ${data.videos_found} videos (${data.scan_duration?.toFixed(1)}s)`)

            // Update scan status and reload folder structure
            await this.loadScanStatus();
            await this.loadFolderStructure();


            // Auto-refresh current folder if we're viewing it
            if (this.currentCategory === folderName) {
                console.log(`🔄 Auto-refreshing current folder after scan: ${folderName}`);
                await this.forceRefreshCurrentFolder();
            } else if (this.currentView === 'explorer') {
                // Just refresh explorer view if not viewing this folder
                this.renderFolderExplorer();
            }

        } catch (error) {
            console.error('❌ Error scanning folder:', error);
            console.log(`❌ Failed to scan ${folderName}`)
        }
    }

    renderFolderWithScanControl(folderName, isSystemFolder = false) { return this.nav.renderFolderWithScanControl(folderName, isSystemFolder) }

    showFolderMenu(event, folderName, isScanned) { this.nav.showFolderMenu(event, folderName, isScanned) }

    createFolderMenu(folderName, isScanned) { return this.nav.createFolderMenu(folderName, isScanned) }

    hideFolderMenu() { this.nav.hideFolderMenu() }

    handleMenuClickOutside(event) { this.nav.handleMenuClickOutside(event) }

    // ==================== RENAME FOLDER ====================

    showRenameFolderModal(folderName) {
        this.hideFolderMenu();
        this.currentFolderToRename = folderName;

        const modal = document.getElementById('renameFolderModal');
        const currentNameEl = document.getElementById('currentFolderName');
        const newNameInput = document.getElementById('newFolderName');

        currentNameEl.textContent = folderName;
        newNameInput.value = folderName;
        newNameInput.select();

        modal.style.display = 'flex';
    }

    hideRenameFolderModal() {
        const modal = document.getElementById('renameFolderModal');
        modal.style.display = 'none';
        this.currentFolderToRename = null;
    }

    async renameFolder() {
        const oldName = this.currentFolderToRename;
        const newNameInput = document.getElementById('newFolderName');
        const newName = newNameInput.value.trim();

        if (!newName) {
            console.log('Please enter a folder name')
            return;
        }

        if (newName === oldName) {
            this.hideRenameFolderModal();
            return;
        }

        // Validate folder name (no special characters that would break filesystem)
        const invalidChars = /[<>:"|?*\/\\]/g;
        if (invalidChars.test(newName)) {
            console.log('Folder name contains invalid characters')
            return;
        }

        try {
            console.log(`Renaming folder "${oldName}" to "${newName}"...`)

            const response = await fetch(`${this.apiBase}/api/folders/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    old_name: oldName,
                    new_name: newName
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Failed to rename folder');
            }

            console.log(`✓ Folder renamed to "${newName}"`)
            this.hideRenameFolderModal();

            // Update folder groups if this folder is in any group
            let groupUpdated = false;
            this.folderGroups.forEach(group => {
                const folderIndex = group.folders.indexOf(oldName);
                if (folderIndex !== -1) {
                    group.folders[folderIndex] = newName;
                    groupUpdated = true;
                }
            });

            // Save updated groups if any were modified
            if (groupUpdated) {
                try {
                    await fetch(`${this.apiBase}/api/folder-groups`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ groups: this.folderGroups })
                    });
                    console.log('✅ Folder groups updated after rename');
                } catch (error) {
                    console.error('Error saving folder groups:', error);
                }
            }

            // Refresh the view
            if (this.currentView === 'explorer') {
                // If we're currently viewing this folder, navigate to the new name
                if (this.currentCategory === oldName) {
                    this.currentCategory = newName;
                }
                // Re-render the explorer view
                this.renderFolderExplorer();
            } else {
                await this.loadVideos();
            }

        } catch (error) {
            console.error('Error renaming folder:', error);
            console.log(error.message || 'Failed to rename folder')
        }
    }

    // ==================== BULK HASH RENAME (zRENAME) ====================

    async showBulkHashRenameModal(folderName) {
        this.hideFolderMenu();

        // Count videos in this folder
        const videosInFolder = this.allVideos.filter(v => v.category === folderName);

        if (videosInFolder.length === 0) {
            console.log('No videos in this folder')
            return;
        }

        console.log(`Renaming ${videosInFolder.length} videos in "${folderName}"...`)

        // Start the rename immediately in background
        await this.performBulkHashRename(folderName);
    }

    async performBulkHashRename(folderName) {
        try {
            const response = await fetch(`${this.apiBase}/api/folders/bulk-hash-rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    folder_name: folderName
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || result.error || 'Failed to rename videos');
            }

            // Show success message with results
            const successMsg = `✓ Renamed ${result.renamed_count} video${result.renamed_count !== 1 ? 's' : ''}${result.failed_count > 0 ? ` (${result.failed_count} failed)` : ''}`;
            console.log(successMsg)

            // Refresh videos after a delay
            setTimeout(async () => {
                await this.loadVideos();
            }, 1000);

        } catch (error) {
            console.error('Error in bulk hash rename:', error);
            console.log(error.message || 'Failed to rename videos')
        }
    }

    // ==================== SCAN SYSTEM (delegated to ScanSystemModule) ====================

    queueFolderScan(folderName, scanType, parentCategory = null) { this.scanSystem.queueFolderScan(folderName, scanType, parentCategory) }
    async processScanQueue() { await this.scanSystem.processScanQueue() }
    async scanFolderHierarchical(folderName, parentCategory = null) { await this.scanSystem.scanFolderHierarchical(folderName, parentCategory) }
    async scanFolderRecursive(folderName) { await this.scanSystem.scanFolderRecursive(folderName) }
    async scanFolderOnly(folderName) { await this.scanSystem.scanFolderOnly(folderName) }
    async scanFolderHierarchicalInternal(folderName, parentCategory = null) { await this.scanSystem.scanFolderHierarchicalInternal(folderName, parentCategory) }
    async loadVideosForCategory(folderName) { await this.scanSystem.loadVideosForCategory(folderName) }
    async batchGenerateThumbnails(folderName) { await this.scanSystem.batchGenerateThumbnails(folderName) }
    updateVideoCardThumbnail(video) { this.scanSystem.updateVideoCardThumbnail(video) }
    async scanFolderOnlyInternal(folderName) { await this.scanSystem.scanFolderOnlyInternal(folderName) }
    async scanFolderRecursiveInternal(folderName) { await this.scanSystem.scanFolderRecursiveInternal(folderName) }
    updateFastRescanButtonText() { this.scanSystem.updateFastRescanButtonText() }
    async performFastRescan(folders = null) { await this.scanSystem.performFastRescan(folders) }

    async cleanupDatabase() {
        // Delegated to scanSystem but needs access to app state for UI updates
        try {
            const confirmed = confirm(
                '🧹 Cleanup Database\n\n' +
                'This will scan all folders and remove database entries for videos that no longer exist on disk.\n\n' +
                'Continue?'
            );
            if (!confirmed) return;
            console.log('🧹 Starting database cleanup...');
            this.showRefreshLoadingOverlay();
            const response = await fetch(`${this.apiBase}/scan?sync_db=true&prune_missing=true&fast_mode=true`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const pruned = data.pruned_missing || 0;
            this.hideRefreshLoadingOverlay();
            if (pruned > 0) {
                alert(`🧹 Cleanup complete!\n\nRemoved ${pruned} database entries for deleted files.`);
                this.hasLoadedFullCollection = false;
                this.allVideosCatalog = [];

                // Reload current view
                if (this.currentView === 'list') {
                    await this.loadAllVideosFlat(true);
                } else {
                    await this.loadFolderStructure();
                    this.renderFolderExplorer();
                }
            } else {
                alert('✅ Database is clean!\n\nNo deleted files found.');
            }

            console.log(`🧹 Cleanup complete: ${pruned} entries removed`);

        } catch (error) {
            console.error('❌ Error during database cleanup:', error);
            this.hideRefreshLoadingOverlay();
            alert('❌ Cleanup failed. Check console for details.');
        }
    }

    async parseMetadataForCurrentFolder() { await this.scanSystem.parseMetadataForCurrentFolder() }
    showFolderDetails(folderName) { this.scanSystem.showFolderDetails(folderName) }
    async loadMetadataForFolderFromMenu(folderName) { await this.scanSystem.loadMetadataForFolderFromMenu(folderName) }
    async regenerateFolderThumbnails(folderName) { await this.scanSystem.regenerateFolderThumbnails(folderName) }
    async generateFolderFingerprints(folderName) { await this.scanSystem.generateFolderFingerprints(folderName) }
    async autoScanFacesInFolder(folderName, maxDuration = null) { await this.scanSystem.autoScanFacesInFolder(folderName, maxDuration) }

    // ==================== BULK EDIT VIEW (delegated to BulkEditModule) ====================
    async openBulkEditForFolder(folderName) { await this.bulkEditModule.openBulkEditForFolder(folderName) }
    showBulkEditView() { this.bulkEditModule.showBulkEditView() }
    renderBulkEditList() { this.bulkEditModule.renderBulkEditList() }
    createBulkEditCard(video, index) { return this.bulkEditModule.createBulkEditCard(video, index) }
    setupBulkEditEventListeners() { this.bulkEditModule.setupBulkEditEventListeners() }
    toggleBulkApplySection() { this.bulkEditModule.toggleBulkApplySection() }
    trackBulkEditChange(input) { this.bulkEditModule.trackBulkEditChange(input) }
    undoBulkEditVideo(videoId) { this.bulkEditModule.undoBulkEditVideo(videoId) }
    autoFormatFilename(videoId) { this.bulkEditModule.autoFormatFilename(videoId) }
    applyToAllVideos() { this.bulkEditModule.applyToAllVideos() }
    clearApplyAllFields() { this.bulkEditModule.clearApplyAllFields() }

    async saveBulkEditChanges() { await this.bulkEditModule.saveBulkEditChanges() }
    closeBulkEditView(skipConfirmation = false) { this.bulkEditModule.closeBulkEditView(skipConfirmation) }

    // Bulk edit state getters/setters for backward compatibility
    get bulkEditFolderName() { return this.bulkEditModule.bulkEditFolderName }
    set bulkEditFolderName(val) { this.bulkEditModule.bulkEditFolderName = val }
    get bulkEditVideos() { return this.bulkEditModule.bulkEditVideos }
    set bulkEditVideos(val) { this.bulkEditModule.bulkEditVideos = val }
    get bulkEditChanges() { return this.bulkEditModule.bulkEditChanges }
    set bulkEditChanges(val) { this.bulkEditModule.bulkEditChanges = val }

    // Video Context Menu Methods - Delegate to ContextMenuModule
    showVideoContextMenu(event, videoId, videoName) {
        this.contextMenu.showVideoContextMenu(event, videoId, videoName)
    }

    hideVideoContextMenu() {
        this.contextMenu.hideVideoContextMenu()
    }

    // Legacy context menu state (now managed by module, kept for backward compatibility)
    get contextMenuVideoId() { return this.contextMenu.contextMenuVideoId }
    set contextMenuVideoId(val) { this.contextMenu.contextMenuVideoId = val }
    get contextMenuVideoName() { return this.contextMenu.contextMenuVideoName }
    set contextMenuVideoName(val) { this.contextMenu.contextMenuVideoName = val }

    /* OLD showVideoContextMenu - Replaced by ContextMenuModule
    showVideoContextMenu_OLD(event, videoId, videoName) {
        // Close any existing context menu
        this.hideVideoContextMenu();

        // Store video info for menu actions to avoid quote escaping issues
        this.contextMenuVideoId = videoId;
        this.contextMenuVideoName = videoName;

        // Get video to check fingerprint status and metadata
        const video = this.videos.find(v => v.id === videoId) || this.allVideos.find(v => v.id === videoId);
        const isFingerprinted = video && video.fingerprint_generated;
        const hasMetadata = video && video.duration !== null && video.duration !== undefined;
        const isFinal = video && video.is_final;
        const isInDeleteFolder = video && video.category === 'DELETE';

        const menuHtml = `
            <div class="context-menu-item" onclick="app.refreshVideoFromContext()">
                <span class="context-menu-icon">🔄</span>
                <span>Refresh</span>
            </div>
            <div class="context-menu-item" onclick="app.checkDuplicateFromContext()">
                <span class="context-menu-icon">🔍</span>
                <span>Find Similar</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.autoScanFacesFromContext()">
                <span class="context-menu-icon">👤</span>
                <span>Auto-Scan Faces</span>
            </div>
            <div class="context-menu-item" onclick="app.autoScanFacesFromContext(3)">
                <span class="context-menu-icon">⚡</span>
                <span>Auto-Scan (Fast - First 3s)</span>
            </div>
            <div class="context-menu-item" onclick="app.reviewVideoFacesFromContext()">
                <span class="context-menu-icon">👥</span>
                <span>Review Faces</span>
            </div>
            <div class="context-menu-item" onclick="app.showSeriesModalFromContext()">
                <span class="context-menu-icon">📺</span>
                <span>Series Info</span>
            </div>
            <div class="context-menu-item" onclick="app.toggleFinalFromContext()">
                <span class="context-menu-icon">${isFinal ? '⭐' : '💎'}</span>
                <span>${isFinal ? 'Unmark as Final' : 'Mark as Final'}</span>
            </div>
            <div class="context-menu-separator"></div>
            ${isFingerprinted
                ? `<div class="context-menu-item" onclick="app.removeFingerprintFromContext()">
                    <span class="context-menu-icon">🔓</span>
                    <span>Remove Fingerprint</span>
                  </div>
                  <div class="context-menu-item" onclick="app.viewFingerprintsFromContext()">
                    <span class="context-menu-icon">👁️</span>
                    <span>View Fingerprints</span>
                  </div>`
                : `<div class="context-menu-item" onclick="app.addFingerprintFromContext()">
                    <span class="context-menu-icon">🔒</span>
                    <span>Generate Fingerprint</span>
                  </div>`
            }
            ${!hasMetadata
                ? `<div class="context-menu-item" onclick="app.loadMetadataFromContext()">
                    <span class="context-menu-icon">⚡</span>
                    <span>Scan Metadata</span>
                  </div>`
                : ''
            }
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.openRenameModalFromContext()">
                <span class="context-menu-icon">✏️</span>
                <span>Rename</span>
            </div>
            <div class="context-menu-item" onclick="app.hashRenameVideoFromContext()">
                <span class="context-menu-icon">🔐</span>
                <span>Hash-Based Rename</span>
            </div>
            <div class="context-menu-item" onclick="app.addActorFromContext()">
                <span class="context-menu-icon">👤</span>
                <span>Add Actor</span>
            </div>
            <div class="context-menu-item" onclick="app.addSceneFromContext()">
                <span class="context-menu-icon">📝</span>
                <span>Add Scene Description</span>
            </div>
            <div class="context-menu-item" onclick="app.sanitizeFilenameFromContext()">
                <span class="context-menu-icon">🧹</span>
                <span>Sanitize Filename</span>
            </div>
            <div class="context-menu-item" onclick="app.openEditVideoModalFromContext()">
                <span class="context-menu-icon">✂️</span>
                <span>Edit Video</span>
            </div>
            <div class="context-menu-item" onclick="app.addAudioFromContext()">
                <span class="context-menu-icon">🎵</span>
                <span>Add Audio</span>
            </div>
            ${isInDeleteFolder
                ? `<div class="context-menu-item context-menu-delete" onclick="app.permanentDeleteVideoFromContext()">
                    <span class="context-menu-icon">⚠️</span>
                    <span>Delete Permanently</span>
                  </div>`
                : `<div class="context-menu-item context-menu-delete" onclick="app.deleteVideoFromContext()">
                    <span class="context-menu-icon">🗑️</span>
                    <span>Move to Trash</span>
                  </div>`
            }
        `;

        // Create menu element
        const menu = document.createElement('div');
        menu.id = 'videoContextMenu';
        menu.className = 'video-context-menu';
        menu.innerHTML = menuHtml;

        // Position menu near the click
        const rect = event.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;

        // Temporarily append to measure
        document.body.appendChild(menu);
        const menuRect = menu.getBoundingClientRect();

        // Smart positioning to keep menu on screen
        let top = rect.bottom + 5;
        let left = rect.left;

        // Check right edge
        if (menuRect.right > window.innerWidth - 10) {
            left = Math.max(10, window.innerWidth - menuRect.width - 10);
        }

        // Check bottom edge - show above if needed
        if (menuRect.bottom > window.innerHeight - 10) {
            top = Math.max(10, rect.top - menuRect.height - 5);
        }

        // Check top edge
        if (top < 10) {
            top = rect.bottom + 5;
        }

        // Check left edge
        if (left < 10) {
            left = 10;
        }

        // Add max-height to ensure menu doesn't overflow bottom even if we can't move it
        const maxHeight = window.innerHeight - Math.max(top, 10) - 10;
        if (maxHeight < menuRect.height) {
            menu.style.maxHeight = `${maxHeight}px`;
            menu.style.overflowY = 'auto';
        }

        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;

        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.handleContextMenuClickOutside.bind(this), { once: true });
        }, 0);
    }
    END OF OLD showVideoContextMenu */

    /* OLD hideVideoContextMenu - Now handled by ContextMenuModule
    hideVideoContextMenu_OLD() {
        const existingMenu = document.getElementById('videoContextMenu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }
    */

    // Face Context Menu - Delegate to ContextMenuModule
    showFaceSearchContextMenu(event, faceId, faceName) {
        this.contextMenu.showFaceSearchContextMenu(event, faceId, faceName)
    }

    hideFaceSearchContextMenu() {
        this.contextMenu.hideFaceSearchContextMenu()
    }

    /* OLD showFaceSearchContextMenu - Now handled by ContextMenuModule
    showFaceSearchContextMenu_OLD(event, faceId, faceName) {
        // Close any existing face context menu
        this.hideFaceSearchContextMenu();

        const menuHtml = `
            <div class="context-menu-item" onclick="app.searchVideosWithFaceFromContext(${faceId}, '${faceName}')">
                <span class="context-menu-icon">🔍</span>
                <span>Search all videos with this face</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.filterByFace(${faceId}, '${faceName}')">
                <span class="context-menu-icon">👤</span>
                <span>Filter (current view)</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.showFaceEmbeddingsModal(${faceId}, '${faceName}')">
                <span class="context-menu-icon">🎞️</span>
                <span>Review Embeddings</span>
            </div>
            <div class="context-menu-item context-menu-delete" onclick="app.deleteFaceIDFromContext(${faceId}, '${faceName}')">
                <span class="context-menu-icon">🗑️</span>
                <span>Delete Face ID</span>
            </div>
        `;

        // Create menu element
        const menu = document.createElement('div');
        menu.id = 'faceContextMenu';
        menu.className = 'video-context-menu';
        menu.innerHTML = menuHtml;

        // Position menu near the click
        const rect = event.target.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;

        // Adjust position if menu would go off screen
        document.body.appendChild(menu);
        const menuRect = menu.getBoundingClientRect();
        if (menuRect.right > window.innerWidth) {
            menu.style.left = `${rect.right - menuRect.width}px`;
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = `${rect.top - menuRect.height - 5}px`;
        }

        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.handleFaceContextMenuClickOutside.bind(this), { once: true });
        }, 0);
    }

    hideFaceSearchContextMenu() {
        const existingMenu = document.getElementById('faceContextMenu');
        if (existingMenu) {
            existingMenu.remove();
        }
    }

    handleFaceContextMenuClickOutside(event) {
        const menu = document.getElementById('faceContextMenu');
        if (menu && !menu.contains(event.target)) {
            this.hideFaceSearchContextMenu();
        }
    }
    END OF OLD Face Context Menu code */

    // Note: The following face-related methods are kept in app.js because they handle
    // complex modal interactions that are tightly coupled with app state.
    // The context menu module delegates to these methods.

    searchVideosWithFaceFromContext(faceId, faceName) {
        // Redirect to search with this face across all videos
        this.filterByFace(faceId, faceName);
        this.hideFaceSearchContextMenu();
    }

    async showFaceEmbeddingsModal(faceId, faceName) {
        /**
         * Show modal with all embeddings for this face ID
         * Allows user to review and remove individual embeddings
         */
        this.hideFaceSearchContextMenu();

        try {
            console.log('Loading embeddings...')

            // Fetch all embeddings for this face
            const url = `${this.apiBase}/api/faces/${faceId}/encodings`;
            console.log(`Fetching embeddings from: ${url}`);

            const response = await fetch(url);
            console.log(`Response status: ${response.status}, OK: ${response.ok}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Response error text: ${errorText}`);
                throw new Error(`Failed to load embeddings: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            const embeddings = data.embeddings || [];

            // Create modal content
            const modal = document.createElement('div');
            modal.id = 'faceEmbeddingsModal';
            modal.className = 'thumbnail-modal';
            modal.style.display = 'flex';

            let embeddingsHtml = embeddings.map((emb, idx) => {
                const thumbnail = emb.thumbnail ? `data:image/jpeg;base64,${emb.thumbnail}` : '';
                const videoName = emb.video_name || 'Unknown Video';
                return `
                    <div class="embedding-card" data-embedding-id="${emb.id}" data-embedding-idx="${idx}">
                        <img src="${thumbnail}" class="embedding-thumbnail" alt="Embedding ${idx + 1}" />
                        <div class="embedding-info">
                            <div class="embedding-video">${videoName}</div>
                            <div class="embedding-quality">Quality: ${(emb.quality_score * 100).toFixed(0)}%</div>
                        </div>
                        <button class="embedding-remove-btn" onclick="event.stopPropagation(); app.removeEmbedding(${faceId}, ${emb.id}, ${idx})">
                            ✕
                        </button>
                    </div>
                `;
            }).join('');

            if (embeddings.length === 0) {
                embeddingsHtml = '<div class="no-embeddings-message">No embeddings found for this face.</div>';
            }

            modal.innerHTML = `
                <div class="thumbnail-modal-content" style="max-width: 900px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>👤 Face ID: ${faceName}</h3>
                        <button class="close-modal" onclick="app.hideFaceEmbeddingsModal()">&times;</button>
                    </div>
                    
                    <div class="modal-info">
                        <span>${embeddings.length} embedding(s) found</span>
                    </div>
                    
                    <div class="embeddings-grid">
                        ${embeddingsHtml}
                    </div>
                    
                    <div class="modal-actions">
                        <button class="thumbnail-modal-btn secondary" onclick="app.hideFaceEmbeddingsModal()">
                            Close
                        </button>
                        <button class="thumbnail-modal-btn primary context-menu-delete" onclick="app.deleteEntireFaceID(${faceId}, '${faceName}')">
                            🗑️ Delete Entire Face ID
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            console.log(`Loaded ${embeddings.length} embedding(s)`)

        } catch (error) {
            console.error('Error loading embeddings:', error);
            console.log(`Failed to load embeddings: ${error.message}`)
        }
    }

    hideFaceEmbeddingsModal() {
        const modal = document.getElementById('faceEmbeddingsModal');
        if (modal) {
            modal.remove();
        }
    }

    async removeEmbedding(faceId, embeddingId, embeddingIdx) {
        /**
         * Remove a single embedding for a face
         */
        try {
            console.log('Removing embedding...')

            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/embeddings/${embeddingId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to remove embedding');
            }

            // Remove from UI
            const card = document.querySelector(`[data-embedding-id="${embeddingId}"]`);
            if (card) {
                card.style.animation = 'fadeOut 0.3s ease-out forwards';
                setTimeout(() => card.remove(), 300);
            }

        } catch (error) {
            console.error('Error removing embedding:', error);
            console.log(`Failed to remove embedding: ${error.message}`)
        }
    }

    async deleteEntireFaceID(faceId, faceName) {
        /**
         * Delete the entire Face ID and all its embeddings
         */
        const confirmed = confirm(`⚠️ Are you sure you want to delete the entire Face ID "${faceName}"?\n\nThis will remove all embeddings and unlink this face from all videos.\n\nThis action cannot be undone.`);

        if (!confirmed) return;

        try {
            console.log('Deleting Face ID...')

            const response = await fetch(`${this.apiBase}/api/faces/${faceId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete Face ID');
            }

            // Close modal and refresh
            this.hideFaceEmbeddingsModal();

            // Refresh the current view to reflect the deletion
            await this.loadAllVideosFlat(true);

            console.log(`✅ Face ID "${faceName}" deleted successfully`)

        } catch (error) {
            console.error('Error deleting Face ID:', error);
            console.log(`Failed to delete Face ID: ${error.message}`)
        }
    }

    async deleteFaceIDFromContext(faceId, faceName) {
        /**
         * Delete face ID from context menu
         */
        this.hideFaceSearchContextMenu();
        this.deleteEntireFaceID(faceId, faceName);
    }

    async showVideoFacesReviewModal(videoId) {
        /**
         * Unified modal to review, delete embeddings, and manage faces for a video
         * Shows all faces detected in the video with their embeddings
         * Allows deleting individual embeddings or entire face IDs
         */
        try {
            // Find the video in the current display
            let video = null;

            if (this.allVideos && Array.isArray(this.allVideos)) {
                video = this.allVideos.find(v => v.id === videoId);
            }

            if (!video && this.allVideosCatalog && Array.isArray(this.allVideosCatalog)) {
                video = this.allVideosCatalog.find(v => v.id === videoId);
            }

            if (!video) {
                const response = await fetch(`${this.apiBase}/api/videos/${videoId}`);
                if (!response.ok) throw new Error('Failed to load video');
                const data = await response.json();
                video = data.video || {};
            }

            const faces = video.faces || [];
            if (faces.length === 0) {
                alert('No faces detected in this video');
                return;
            }

            // Fetch embeddings and duplicate analysis for all faces
            const facesWithEmbeddings = await Promise.all(
                faces.map(async (face) => {
                    try {
                        // Fetch regular embeddings
                        const response = await fetch(`${this.apiBase}/api/faces/${face.id}/encodings`);
                        let embeddings = [];
                        if (response.ok) {
                            const data = await response.json();
                            embeddings = data.embeddings || [];
                        }

                        // Fetch duplicate analysis
                        let duplicateAnalysis = null;
                        try {
                            const analysisResponse = await fetch(`${this.apiBase}/api/faces/${face.id}/duplicate-analysis`);
                            if (analysisResponse.ok) {
                                duplicateAnalysis = await analysisResponse.json();
                            }
                        } catch (e) {
                            console.warn(`Failed to load duplicate analysis for face ${face.id}:`, e);
                        }

                        return {
                            ...face,
                            embeddings: embeddings,
                            duplicateAnalysis: duplicateAnalysis
                        };
                    } catch (e) {
                        console.error(`Failed to load embeddings for face ${face.id}:`, e);
                    }
                    return { ...face, embeddings: [], duplicateAnalysis: null };
                })
            );

            // Create modal
            const modal = document.createElement('div');
            modal.id = 'videoFacesReviewModal';
            modal.className = 'thumbnail-modal';
            modal.style.display = 'flex';
            modal.style.zIndex = '10009';

            // Build faces with embeddings HTML
            let facesHtml = facesWithEmbeddings.map((face) => {
                const thumbnail = face.thumbnail ? `data:image/jpeg;base64,${face.thumbnail}` : '';

                // Build a map of embedding IDs that are suggested for deletion
                const suggestedForDeletion = new Set();
                if (face.duplicateAnalysis && face.duplicateAnalysis.groups) {
                    face.duplicateAnalysis.groups.forEach(group => {
                        group.suggested_for_deletion.forEach(item => {
                            suggestedForDeletion.add(item.id);
                        });
                    });
                }

                const embeddingsHtml = (face.embeddings || []).map((emb, idx) => {
                    // Use embedding's own thumbnail if available
                    let embThumbnail = emb.thumbnail ? `data:image/jpeg;base64,${emb.thumbnail}` : '';

                    // If no thumbnail for this embedding, find best available from other embeddings
                    if (!embThumbnail) {
                        const bestEmbWithThumb = (face.embeddings || []).find(e => e.thumbnail);
                        embThumbnail = bestEmbWithThumb ? `data:image/jpeg;base64,${bestEmbWithThumb.thumbnail}` : '';
                    }

                    const isDuplicate = suggestedForDeletion.has(emb.id);
                    const duplicateBadge = isDuplicate ? '<span class="duplicate-badge">⚠️</span>' : '';
                    const qualityPercent = (emb.quality_score * 100).toFixed(0);
                    const confidencePercent = (emb.confidence * 100).toFixed(0);

                    return `
                        <div class="embedding-item ${isDuplicate ? 'is-duplicate' : ''}" data-embedding-id="${emb.id}" title="Q${qualityPercent}/C${confidencePercent}">
                            <button class="embedding-corner-delete" 
                                    onclick="event.stopPropagation(); app.deleteEmbeddingFromReview(${face.id}, ${emb.id}, this.closest('.embedding-item'))"
                                    title="Delete this embedding">
                                ✕
                            </button>
                            <div class="embedding-container">
                                <img src="${embThumbnail}" class="embedding-thumb" alt="Embedding ${idx + 1}" onerror="this.style.display='none'" />
                                ${duplicateBadge}
                                <div class="embedding-details">
                                    <div class="embedding-compact-row">Q${qualityPercent}/C${confidencePercent}</div>
                                    ${isDuplicate ? '<div class="embedding-suggestion">⚠️ Delete</div>' : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <div class="face-review-card" data-face-id="${face.id}">
                        <div class="face-review-header">
                            <input type="checkbox" 
                                   class="face-review-checkbox" 
                                   data-face-id="${face.id}"
                                   data-face-name="${face.name.replace(/"/g, '&quot;')}"
                                   onchange="app.updateFaceMergeSelection()" />
                            <img src="${thumbnail}" class="face-review-thumbnail" alt="${face.name}" />
                            <div class="face-review-info">
                                <div class="face-review-name">${face.name}</div>
                                <div class="face-review-embeddings">${face.embeddings.length} embedding(s)</div>
                            </div>
                            <button class="face-delete-btn" 
                                    title="Delete this entire face ID and all its embeddings"
                                    onclick="event.stopPropagation(); app.directDeleteFaceFromReview(${face.id}, this.closest('.face-review-card'))">
                                🗑️
                            </button>
                        </div>
                        <div class="embeddings-list">
                            ${embeddingsHtml || '<div class="no-embeddings">No embeddings</div>'}
                        </div>
                    </div>
                `;
            }).join('');

            modal.innerHTML = `
                <div class="thumbnail-modal-content" style="max-width: 1000px; max-height: 90vh; overflow-y: auto;">
                    <div class="modal-header">
                        <h3>👥 Review Faces & Embeddings</h3>
                        <button class="close-modal" onclick="app.hideVideoFacesReviewModal()">&times;</button>
                    </div>
                    
                    <div class="modal-info">
                        <span>Video: ${video.name}</span>
                        <span style="margin-left: 20px;">Total faces: ${faces.length}</span>
                        <span id="faceSelectionCount" style="margin-left: 20px; color: #3b82f6; font-weight: 600; display: none;">
                            0 selected for merge
                        </span>
                        <div style="margin-left: 30px; display: flex; align-items: center; gap: 12px;">
                            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
                                <input type="checkbox" id="selectAllFacesCheckbox" onchange="app.toggleSelectAllFaces()" />
                                <span style="font-weight: 500; color: #374151;">Select All</span>
                            </label>
                            <button id="mergeQuickBtn" class="thumbnail-modal-btn primary" onclick="app.quickMergeFaces()" style="display: none; padding: 6px 12px; font-size: 12px;">
                                ⚡ Merge
                            </button>
                        </div>
                    </div>
                    
                    <div id="facesReviewContainer" class="faces-review-container">
                        ${facesHtml}
                    </div>
                    
                    <div class="modal-actions">
                        <button class="thumbnail-modal-btn secondary" onclick="app.hideVideoFacesReviewModal()">
                            Close
                        </button>
                        <button id="mergeFacesBtn" class="thumbnail-modal-btn primary" onclick="app.showMergeFacesConfirmation()" style="display: none;">
                            🔗 Merge Selected Faces
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            this.facesSelectedForMerge = [];
            this.currentReviewVideoId = video.id;

        } catch (error) {
            console.error('Error opening face review modal:', error);
            alert(`Failed to load faces: ${error.message}`);
        }
    }

    hideVideoFacesReviewModal(skipRefresh = false) {
        const modal = document.getElementById('videoFacesReviewModal');
        if (modal) modal.remove();
        this.facesSelectedForMerge = [];

        // Refresh the video to see any changes made in the review modal
        // (deleted embeddings, deleted face IDs, etc.)
        // Skip refresh if called internally with skipRefresh=true
        if (!skipRefresh && this.currentReviewVideoId) {
            this.refreshVideoFromContext();
        }

        this.currentReviewVideoId = null;
    }

    async showAllVideosByFace(faceId, faceName) {
        /**
         * Show face details modal from catalog using existing function
         */
        try {
            // Fetch the face from the catalog API
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}`);
            if (!response.ok) throw new Error('Failed to load face');

            const face = await response.json();

            // Use the existing working face detail modal
            this.showFaceDetailModal(face);

        } catch (error) {
            console.error('Error loading face details:', error);
            alert(`Failed to load face details: ${error.message}`);
        }
    }

    async openFaceDetailsModal(faceDataJson) {
        /**
         * Open a modal showing face details and all videos with this face
         */
        try {
            const faceData = JSON.parse(faceDataJson);
            const faceId = faceData.id;
            const faceName = faceData.name;

            // Fetch all videos with this face
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/videos`);
            if (!response.ok) {
                throw new Error('Failed to load face videos');
            }

            const result = await response.json();
            const videos = Array.isArray(result) ? result : (result?.videos || []);

            // Create modal
            const modal = document.createElement('div');
            modal.id = 'faceDetailsModal';
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 5000;
                overflow-y: auto;
            `;

            const content = document.createElement('div');
            content.style.cssText = `
                background: white;
                border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                margin: auto;
                padding: 0;
            `;

            // Build videos list
            const videosList = videos.map(video => `
                <div style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; cursor: pointer; transition: background 0.2s;" 
                     onmouseover="this.style.background='#f9fafb'" 
                     onmouseout="this.style.background='white'"
                     onclick="app.closeFaceDetailsModal(); app.playVideoFromData('${JSON.stringify({
                id: video.id,
                name: video.name,
                category: video.category,
                subcategory: video.subcategory || '',
                relative_path: video.relative_path || video.name,
                path: video.path,
                media_type: video.media_type || 'video'
            }).replace(/"/g, '&quot;')}')">
                    <div style="font-weight: 500; color: #1f2937; margin-bottom: 4px;">${this.escapeHtml(video.name)}</div>
                    <div style="font-size: 12px; color: #6b7280;">
                        📁 ${this.escapeHtml(video.category)}${video.subcategory ? ' / ' + this.escapeHtml(video.subcategory) : ''}
                    </div>
                </div>
            `).join('');

            content.innerHTML = `
                <div style="padding: 20px; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h3 style="margin: 0 0 8px 0; color: #1f2937; font-size: 18px;">👤 ${this.escapeHtml(faceName)}</h3>
                        <p style="margin: 0; color: #6b7280; font-size: 14px;">${videos.length} video${videos.length !== 1 ? 's' : ''} found</p>
                    </div>
                    <button onclick="app.closeFaceDetailsModal()" style="
                        background: none;
                        border: none;
                        font-size: 28px;
                        cursor: pointer;
                        color: #6b7280;
                        padding: 0;
                        width: 32px;
                        height: 32px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    ">✕</button>
                </div>
                <div style="max-height: calc(80vh - 100px); overflow-y: auto;">
                    ${videos.length > 0 ? videosList : '<div style="padding: 20px; text-align: center; color: #6b7280;">No videos found</div>'}
                </div>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);

            // Close on overlay click
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideVideoFacesReviewModal();
                }
            });

            // Close on Escape key
            const closeOnEscape = (e) => {
                if (e.key === 'Escape') {
                    this.hideVideoFacesReviewModal();
                    document.removeEventListener('keydown', closeOnEscape);
                }
            };
            document.addEventListener('keydown', closeOnEscape);

        } catch (error) {
            console.error('Error opening face details modal:', error);
            alert(`Failed to load face details: ${error.message}`);
        }
    }

    closeFaceDetailsModal() {
        /**
         * Close the face details modal
         */
        const modal = document.getElementById('faceDetailsModal');
        if (modal) {
            modal.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => modal.remove(), 300);
        }
    }

    async directDeleteFaceFromReview(faceId, element) {
        /**
         * Directly delete a face ID without confirmation
         */
        try {
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete face ID');

            // Fade out and remove
            const faceCard = element.closest ? element.closest('.face-review-card') : element;
            faceCard.style.animation = 'fadeOut 0.3s ease-out forwards';

            setTimeout(async () => {
                faceCard.remove();

                // Check if any faces remain
                const container = document.getElementById('facesReviewContainer');
                const remainingFaces = container ? container.querySelectorAll('.face-review-card').length : 0;

                if (remainingFaces === 0) {
                    // No more faces, close the modal and refresh the video
                    this.hideVideoFacesReviewModal(true);
                    // Refresh the video card to see updated faces
                    await this.refreshVideoFromContext();
                } else {
                    // Still have faces, stay in modal
                    // No refresh needed, just keep viewing the remaining faces
                }
            }, 300);

        } catch (error) {
            console.error('Error deleting face:', error);
            alert(`Failed to delete face: ${error.message}`);
        }
    }

    updateFaceMergeSelection() {
        /**
         * Update face selection for merging
         */
        const checkboxes = document.querySelectorAll('.face-review-checkbox:checked');
        this.facesSelectedForMerge = Array.from(checkboxes).map(cb => ({
            id: parseInt(cb.dataset.faceId),
            name: cb.dataset.faceName
        }));

        const countEl = document.getElementById('faceSelectionCount');
        const mergeBtn = document.getElementById('mergeFacesBtn');
        const mergeQuickBtn = document.getElementById('mergeQuickBtn');

        if (this.facesSelectedForMerge.length >= 2) {
            countEl.style.display = 'inline-block';
            countEl.textContent = `${this.facesSelectedForMerge.length} selected for merge`;
            mergeBtn.style.display = 'inline-block';
            if (mergeQuickBtn) mergeQuickBtn.style.display = 'inline-block';
        } else {
            countEl.style.display = 'none';
            mergeBtn.style.display = 'none';
            if (mergeQuickBtn) mergeQuickBtn.style.display = 'none';
        }
    }

    toggleSelectAllFaces() {
        /**
         * Toggle select all faces in the review modal
         */
        const selectAllCheckbox = document.getElementById('selectAllFacesCheckbox');
        const faceCheckboxes = document.querySelectorAll('.face-review-checkbox');

        if (selectAllCheckbox && selectAllCheckbox.checked) {
            // Check all face checkboxes
            faceCheckboxes.forEach(checkbox => {
                checkbox.checked = true;
            });
        } else {
            // Uncheck all face checkboxes
            faceCheckboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
        }

        // Update the merge selection counter
        this.updateFaceMergeSelection();
    }

    async quickMergeFaces() {
        /**
         * Quickly merge selected faces WITHOUT confirmation dialog
         */
        try {
            const targetFaceId = this.facesSelectedForMerge[0].id;
            const targetFaceName = this.facesSelectedForMerge[0].name;
            const faceIds = this.facesSelectedForMerge.map(f => f.id);

            const response = await fetch(`${this.apiBase}/api/faces/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_ids: faceIds,
                    target_name: targetFaceName,
                    target_actor_id: null
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to merge faces');
            }

            // Clear selections
            this.facesSelectedForMerge = [];

            // Close the modal (skip auto-refresh since we'll do it manually below)
            this.hideVideoFacesReviewModal(true);

            // Refresh the video card to see updated faces
            await this.refreshVideoFromContext();

        } catch (error) {
            console.error('Error merging faces:', error);
            alert(`Failed to merge faces: ${error.message}`);
        }
    }

    showMergeFacesConfirmation() {
        /**
         * Show confirmation modal for merging faces
         */
        if (this.facesSelectedForMerge.length < 2) {
            alert('Please select at least 2 faces to merge');
            return;
        }

        const targetFaceId = this.facesSelectedForMerge[0].id;
        const targetFaceName = this.facesSelectedForMerge[0].name;
        const sourceCount = this.facesSelectedForMerge.length - 1;

        this.showConfirmationModal(
            '🔗 Merge Faces',
            `Merge ${sourceCount} face ID(s) into "${targetFaceName}"?`,
            `All embeddings will be combined. This action cannot be undone.`,
            async () => await this.confirmMergeFacesFromReview(),
            () => { } // Cancel
        );
    }

    async confirmMergeFacesFromReview() {
        /**
         * Execute the merge of selected faces
         */
        try {
            const targetFaceId = this.facesSelectedForMerge[0].id;
            const targetFaceName = this.facesSelectedForMerge[0].name;
            const faceIds = this.facesSelectedForMerge.map(f => f.id);

            const response = await fetch(`${this.apiBase}/api/faces/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_ids: faceIds,
                    target_name: targetFaceName,
                    target_actor_id: null
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to merge faces');
            }

            // Clear selections
            this.facesSelectedForMerge = [];

            // Close the modal (skip auto-refresh since we'll do it manually below)
            this.hideVideoFacesReviewModal(true);

            // Refresh the video card to see updated faces
            await this.refreshVideoFromContext();

        } catch (error) {
            console.error('Error merging faces:', error);
            alert(`Failed to merge faces: ${error.message}`);
        }
    }

    showDeleteFaceConfirmation(faceId, faceName, element) {
        /**
         * Show confirmation modal for deleting a face ID
         */
        this.pendingFaceDeleteId = faceId;
        this.pendingFaceDeleteElement = element;

        this.showConfirmationModal(
            '🗑️ Delete Face ID',
            `Delete face ID "${faceName}" and all its embeddings?`,
            'This action cannot be undone.',
            'delete-face'
        );
    }

    showMergeFacesConfirmation() {
        /**
         * Show confirmation modal for merging faces
         */
        if (this.facesSelectedForMerge.length < 2) {
            alert('Please select at least 2 faces to merge');
            return;
        }

        const targetFaceId = this.facesSelectedForMerge[0].id;
        const targetFaceName = this.facesSelectedForMerge[0].name;
        const sourceCount = this.facesSelectedForMerge.length - 1;

        this.showConfirmationModal(
            '🔗 Merge Faces',
            `Merge ${sourceCount} face ID(s) into "${targetFaceName}"?`,
            `All embeddings will be combined. This action cannot be undone.`,
            'merge-faces'
        );
    }

    showConfirmationModal(title, message, details, action) {
        /**
         * Generic confirmation modal
         */
        // Hide the review modal if it's open
        const reviewModal = document.getElementById('videoFacesReviewModal');
        if (reviewModal) {
            reviewModal.style.display = 'none';
        }

        const modal = document.createElement('div');
        modal.id = 'confirmationModal';
        modal.className = 'confirmation-modal-overlay';

        modal.innerHTML = `
            <div class="confirmation-modal">
                <div class="confirmation-modal-header">
                    <h3>${title}</h3>
                </div>
                <div class="confirmation-modal-body">
                    <p class="confirmation-message">${message}</p>
                    <p class="confirmation-details">${details}</p>
                </div>
                <div class="confirmation-modal-actions">
                    <button class="confirmation-btn cancel-btn" onclick="app.cancelConfirmation('${action}')">
                        Cancel
                    </button>
                    <button class="confirmation-btn confirm-btn" id="confirmActionBtn" onclick="app.executeConfirmation('${action}')">
                        Confirm
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        this.currentConfirmationAction = action;

        // Auto-focus confirm button
        setTimeout(() => document.getElementById('confirmActionBtn')?.focus(), 100);
    }

    hideConfirmationModal() {
        const modal = document.getElementById('confirmationModal');
        if (modal) modal.remove();

        // Show the review modal again if it exists
        const reviewModal = document.getElementById('videoFacesReviewModal');
        if (reviewModal) {
            reviewModal.style.display = 'flex';
        }

        this.currentConfirmationAction = null;
    }

    cancelConfirmation(action) {
        this.hideConfirmationModal();
    }

    async executeConfirmation(action) {
        try {
            if (action === 'delete-face') {
                await this.confirmDeleteFace();
            } else if (action === 'merge-faces') {
                await this.confirmMergeFacesFromReview();
            }
            this.hideConfirmationModal();
        } catch (error) {
            console.error('Error executing confirmation:', error);
            this.hideConfirmationModal();
        }
    }

    async confirmDeleteFace() {
        /**
         * Execute face deletion
         */
        const faceId = this.pendingFaceDeleteId;
        const element = this.pendingFaceDeleteElement;

        try {
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete face ID');

            // Fade out and remove
            const faceCard = element.closest ? element.closest('.face-review-card') : element;
            faceCard.style.animation = 'fadeOut 0.3s ease-out forwards';

            setTimeout(async () => {
                faceCard.remove();

                // Check if any faces remain
                const container = document.getElementById('facesReviewContainer');
                const remainingFaces = container ? container.querySelectorAll('.face-review-card').length : 0;

                if (remainingFaces === 0) {
                    // No more faces, close the modal and refresh the video
                    this.hideVideoFacesReviewModal(true);
                    // Refresh the video card to see updated faces
                    await this.refreshVideoFromContext();
                } else {
                    // Still have faces, stay in modal
                    // No refresh needed, just keep viewing the remaining faces
                }
            }, 300);

        } catch (error) {
            console.error('Error deleting face:', error);
            alert(`Failed to delete face: ${error.message}`);
        } finally {
            this.pendingFaceDeleteId = null;
            this.pendingFaceDeleteElement = null;
        }
    }

    async deleteEmbeddingFromReview(faceId, embeddingId, element) {
        /**
         * Delete a single embedding and intelligently remap to best available
         * If embeddings remain: remap to best quality embedding
         * If no embeddings remain: show "no embeddings available" and fetch best from other videos
         */
        try {
            // Delete the embedding
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/encodings/${embeddingId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete embedding');

            const result = await response.json();
            console.log('Embedding deletion result:', result);

            // Fade out animation
            element.style.animation = 'fadeOut 0.3s ease-out forwards';
            setTimeout(() => element.remove(), 300);

            // Refresh the embeddings for this face to show updated list
            // This will automatically show remaining embeddings or "no embeddings available" state
            await this.refreshFaceEmbeddingsInModal(faceId);

            // Show appropriate toast message
            if (result.remaining_encodings > 0) {
                console.log(`✅ Embedding deleted. Face remapped to best quality version`)
            } else {
                console.log(`✅ Embedding deleted. Face kept mapped but has no embeddings. Using best from other videos.`)
            }

        } catch (error) {
            console.error('Error deleting embedding:', error);
            console.log(`❌ Failed to delete embedding: ${error.message}`)
        }
    }

    async refreshFaceEmbeddingsInModal(faceId) {
        /**
         * Refresh embeddings display for a specific face in the review modal
         * Handles case where face has no embeddings
         */
        try {
            // Fetch current embeddings for this face
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/encodings`);
            if (!response.ok) throw new Error('Failed to fetch embeddings');

            const data = await response.json();
            const embeddings = data.embeddings || [];

            // Find the face card in the modal
            const faceCard = document.querySelector(`.face-review-card[data-face-id="${faceId}"]`);
            if (!faceCard) return;

            // Get the embeddings list container
            const embeddingsList = faceCard.querySelector('.embeddings-list');
            if (!embeddingsList) return;

            // If no embeddings, show special state and fetch best from other videos
            if (embeddings.length === 0) {
                embeddingsList.innerHTML = `
                    <div class="no-embeddings-container">
                        <div class="no-embeddings">No embeddings available</div>
                        <div class="no-embeddings-hint">Searching for best quality from other videos...</div>
                    </div>
                `;

                // Fetch best embedding from other videos
                try {
                    const bestResponse = await fetch(`${this.apiBase}/api/faces/${faceId}/best-encoding`);
                    if (bestResponse.ok) {
                        const bestData = await bestResponse.json();
                        if (bestData.encoding) {
                            const bestEmb = bestData.encoding;
                            const qualityPercent = (bestEmb.quality_score * 100).toFixed(0);
                            const confidencePercent = (bestEmb.confidence * 100).toFixed(0);

                            // Update the display to show the best encoding from another video
                            embeddingsList.innerHTML = `
                                <div class="best-encoding-from-other-video">
                                    <div class="best-encoding-label">Best available:</div>
                                    <div class="embedding-item no-delete" title="Q${qualityPercent}/C${confidencePercent}">
                                        <div class="embedding-container">
                                            <img src="data:image/jpeg;base64,${bestEmb.thumbnail}" class="embedding-thumb" alt="Best encoding" />
                                            <div class="embedding-details">
                                                <div class="embedding-compact-row">Q${qualityPercent}/C${confidencePercent}</div>
                                                <div class="embedding-video-info">${bestEmb.video_name}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            `;
                        } else {
                            embeddingsList.innerHTML = `<div class="no-embeddings">No embeddings available for this face</div>`;
                        }
                    }
                } catch (e) {
                    console.warn('Could not fetch best encoding from other videos:', e);
                }
                return;
            }

            // Rebuild embeddings list with current data
            const suggestedForDeletion = new Set(); // No duplicates analysis for refresh
            const embeddingsHtml = embeddings.map((emb, idx) => {
                // Use embedding's own thumbnail if available
                let embThumbnail = emb.thumbnail ? `data:image/jpeg;base64,${emb.thumbnail}` : '';

                // If no thumbnail for this embedding, find best available from other embeddings
                if (!embThumbnail) {
                    const bestEmbWithThumb = embeddings.find(e => e.thumbnail);
                    embThumbnail = bestEmbWithThumb ? `data:image/jpeg;base64,${bestEmbWithThumb.thumbnail}` : '';
                }

                const qualityPercent = (emb.quality_score * 100).toFixed(0);
                const confidencePercent = (emb.confidence * 100).toFixed(0);

                return `
                    <div class="embedding-item" data-embedding-id="${emb.id}" title="Q${qualityPercent}/C${confidencePercent}">
                        <button class="embedding-corner-delete" 
                                onclick="event.stopPropagation(); app.deleteEmbeddingFromReview(${faceId}, ${emb.id}, this.closest('.embedding-item'))"
                                title="Delete this embedding">
                            ✕
                        </button>
                        <div class="embedding-container">
                            <img src="${embThumbnail}" class="embedding-thumb" alt="Embedding ${idx + 1}" onerror="this.style.display='none'" />
                            <div class="embedding-details">
                                <div class="embedding-compact-row">Q${qualityPercent}/C${confidencePercent}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');

            embeddingsList.innerHTML = embeddingsHtml;

            // Update the embeddings count in the header
            const faceHeader = faceCard.querySelector('.face-review-info');
            if (faceHeader) {
                const embedCountDiv = faceHeader.querySelector('.face-review-embeddings');
                if (embedCountDiv) {
                    embedCountDiv.textContent = `${embeddings.length} embedding(s)`;
                }
            }

        } catch (error) {
            console.error('Error refreshing face embeddings:', error);
        }
    }

    // Keep old functions for backward compatibility but don't use them
    async showMergeFacesModal() {
        alert('Use the Review Faces option instead');
    }

    hideMergeFacesModal() {
        const modal = document.getElementById('mergeFacesModal');
        if (modal) modal.remove();
    }

    async showVideoFacesMergeModal(videoId, faceCount) {
        // Redirect to new review modal
        this.showVideoFacesReviewModal(videoId);
    }

    hideVideoFacesMergeModal() {
        const modal = document.getElementById('videoFacesMergeModal');
        if (modal) modal.remove();
    }

    toggleVideoFaceMergeSelection() { }
    updateVideoMergeSelectionUI() { }
    confirmVideoFacesMerge() { }
    toggleMergeFaceSelection() {
        /**
         * Toggle face selection for merging
         */
        const modal = document.getElementById('mergeFacesModal');
        if (!modal) return;

        // For backward compatibility, just close the modal
        this.hideMergeFacesModal();
    }

    updateMergeSelectionUI() { }

    async confirmMergeFaces() {
        alert('Use the Review Faces option instead');
    }


    openRenameModalFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.showRenameModal(this.contextMenuVideoId, this.contextMenuVideoName);
        }
    }

    deleteVideoFromContext() { this.videoOps.deleteVideoFromContext() }

    async addFingerprintFromContext() {
        if (this.contextMenuVideoId) {
            // Find video object
            const video = this.videos.find(v => v.id === this.contextMenuVideoId);
            if (video) {
                // Open interactive fingerprint generation modal
                this.openFingerprintGenerationModal(video);
            }
            this.hideVideoContextMenu();
        }
    }

    addActorFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.showActorModal(this.contextMenuVideoId, this.contextMenuVideoName);
            this.hideVideoContextMenu();
        }
    }

    addSceneFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.showSceneDescriptionModal(this.contextMenuVideoId, this.contextMenuVideoName);
            this.hideVideoContextMenu();
        }
    }

    async hashRenameVideoFromContext() {
        if (!this.contextMenuVideoId) return;

        const video = this.videos.find(v => v.id === this.contextMenuVideoId) || this.allVideos.find(v => v.id === this.contextMenuVideoId);
        if (!video) return;

        this.hideVideoContextMenu();
        console.log(`Renaming "${video.name}" to hash-based name...`)

        try {
            const response = await fetch(`/api/videos/${this.contextMenuVideoId}/hash-rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.detail || 'Failed to rename video');
            }

            // Update local video object
            if (result.video) {
                const videoIndex = this.videos.findIndex(v => v.id === this.contextMenuVideoId);
                if (videoIndex !== -1) {
                    this.videos[videoIndex] = result.video;
                }
                const allVideoIndex = this.allVideos.findIndex(v => v.id === this.contextMenuVideoId);
                if (allVideoIndex !== -1) {
                    this.allVideos[allVideoIndex] = result.video;
                }
            }

            console.log(`✓ Renamed to: ${result.new_name}`)

            // Refresh the view
            if (this.currentViewType === 'grid') {
                this.renderVideos();
            } else if (this.currentViewType === 'list') {
                this.renderVideosList();
            } else if (this.currentViewType === 'timeline') {
                this.renderTimeline();
            }
        } catch (error) {
            console.error('Error renaming video:', error);
            console.log(error.message || 'Failed to rename video')
        }
    }

    async removeFingerprintFromContext() {
        if (this.contextMenuVideoId) {
            await this.removeFingerprintFromLibrary(this.contextMenuVideoId);
            this.hideVideoContextMenu();
        }
    }

    async checkDuplicateFromContext() {
        if (this.contextMenuVideoId) {
            await this.checkIfDuplicate(this.contextMenuVideoId);
            this.hideVideoContextMenu();
        }
    }

    async refreshVideoFromContext() {
        if (this.contextMenuVideoId) {
            await this.refreshVideo(this.contextMenuVideoId);
            this.hideVideoContextMenu();
        }
    }

    async loadMetadataFromContext() {
        if (this.contextMenuVideoId) {
            await this.loadMetadataForVideo(this.contextMenuVideoId);
            this.hideVideoContextMenu();
        }
    }

    async toggleFinalFromContext(saveAndMarkFinal = false) {
        if (this.contextMenuVideoId) {
            const video = this.videos.find(v => v.id === this.contextMenuVideoId) || this.allVideos.find(v => v.id === this.contextMenuVideoId);
            if (!video) return;

            if (saveAndMarkFinal && !video.is_final) {
                // Save and mark as final
                try {
                    const response = await fetch(`http://localhost:8000/api/videos/${this.contextMenuVideoId}/metadata`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            description: video.description || '',
                            is_final: true
                        })
                    });

                    if (response.ok) {
                        video.is_final = true;
                        console.log(`✅ Saved and marked as Final`)
                        this.rerenderVideos();
                    }
                } catch (error) {
                    console.error('Error saving and marking final:', error);
                    console.log('❌ Failed to save and mark as final')
                }
            } else {
                // Regular toggle
                await this.toggleFinalStatus(this.contextMenuVideoId);
            }
            this.hideVideoContextMenu();
        }
    }

    async autoScanFacesFromContext(maxDuration = null) {
        if (this.contextMenuVideoId) {
            this.hideVideoContextMenu();
            await this.autoScanFacesForVideo(this.contextMenuVideoId, 10, maxDuration);
        }
    }

    reviewVideoFacesFromContext() {
        if (this.contextMenuVideoId) {
            this.hideVideoContextMenu();
            this.showVideoFacesReviewModal(this.contextMenuVideoId);
        }
    }

    async showSimilarFacesAnalyzer() {
        /**
         * Show Similar Faces Analyzer from Face Catalog
         * Uses catalog data to find similar face IDs
         */
        try {
            if (!this.faceCatalogData || this.faceCatalogData.length === 0) {
                console.log('No faces in catalog')
                return;
            }

            // Show analyzer with all faces from catalog
            this.displaySimilarFacesAnalyzer(this.faceCatalogData);
        } catch (error) {
            console.error('Error loading faces:', error);
            console.log('Error loading faces')
        }
    }

    async displaySimilarFacesAnalyzer(catalogFaces) {
        /**
         * Display full-screen analyzer showing all similar face groups
         * User controls threshold slider to see different groupings
         * No need to select individual faces - all groups displayed automatically
         */

        // Create main container
        const analyzer = document.createElement('div');
        analyzer.id = 'similar-faces-analyzer';
        analyzer.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #000;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            color: #fff;
            font-family: Arial, sans-serif;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 20px;
            background: #1a1a1a;
            border-bottom: 2px solid #333;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const title = document.createElement('div');
        title.innerHTML = `
            <div style="font-size: 24px; font-weight: bold;">🔗 Similar Faces Analyzer</div>
            <div style="font-size: 14px; color: #aaa; margin-top: 4px;">Adjust threshold to find and merge duplicate face IDs</div>
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: #fff;
            font-size: 24px;
            cursor: pointer;
            padding: 0 10px;
        `;
        closeBtn.onclick = () => analyzer.remove();

        header.appendChild(title);
        header.appendChild(closeBtn);

        // Controls area
        const controls = document.createElement('div');
        controls.style.cssText = `
            padding: 15px 20px;
            background: #0f0f0f;
            border-bottom: 1px solid #333;
            display: flex;
            gap: 15px;
            align-items: center;
        `;

        const sliderLabel = document.createElement('div');
        sliderLabel.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
        `;

        const labelText = document.createElement('div');
        labelText.style.cssText = `
            font-size: 13px;
            color: #888;
            min-width: 120px;
        `;
        labelText.innerHTML = `Similarity Threshold: <strong id="similarity-value" style="color: #4a9eff;">42</strong>%`;

        const similaritySlider = document.createElement('input');
        similaritySlider.type = 'range';
        similaritySlider.min = '0';
        similaritySlider.max = '100';
        similaritySlider.value = '42';
        similaritySlider.id = 'similarity-slider';
        similaritySlider.style.cssText = `
            flex: 1;
            cursor: pointer;
            accent-color: #4a9eff;
            height: 6px;
        `;

        // Update label when slider changes
        similaritySlider.addEventListener('input', (e) => {
            document.getElementById('similarity-value').textContent = e.target.value;
        });

        sliderLabel.appendChild(labelText);
        sliderLabel.appendChild(similaritySlider);

        const searchBtn = document.createElement('button');
        searchBtn.textContent = '🔍 Analyze Groups';
        searchBtn.style.cssText = `
            padding: 8px 20px;
            background: #4a9eff;
            color: #000;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            font-size: 13px;
            transition: all 0.2s;
        `;
        searchBtn.onmouseover = () => searchBtn.style.background = '#3b8eef';
        searchBtn.onmouseout = () => searchBtn.style.background = '#4a9eff';
        searchBtn.onclick = async () => {
            const threshold = parseInt(document.getElementById('similarity-slider').value);
            await displayGroups(threshold);
        };

        controls.appendChild(sliderLabel);
        controls.appendChild(searchBtn);

        // Main content area - groups display
        const content = document.createElement('div');
        content.id = 'similar-faces-groups';
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 15px 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        `;

        const placeholder = document.createElement('div');
        placeholder.style.cssText = `
            text-align: center;
            color: #666;
            padding: 40px 20px;
            font-size: 14px;
        `;
        placeholder.textContent = 'Adjust threshold and click "Analyze Groups" to find similar face groups';
        content.appendChild(placeholder);

        // Function to display groups
        const displayGroups = async (threshold) => {
            try {
                // Show loading indicator
                content.innerHTML = '<div style="text-align: center; padding: 40px 20px;"><div style="font-size: 24px;">⏳</div><div style="color: #aaa; margin-top: 10px;">Analyzing similar faces...</div></div>';

                const response = await fetch(`${this.apiBase}/api/faces/group/similar?threshold=${threshold / 100}`);
                const data = await response.json();
                const groups = data.groups || [];

                content.innerHTML = '';

                if (groups.length === 0) {
                    const noGroups = document.createElement('div');
                    noGroups.style.cssText = `
                        text-align: center;
                        color: #666;
                        padding: 40px 20px;
                        font-size: 14px;
                    `;
                    noGroups.textContent = 'No similar face groups found at this threshold';
                    content.appendChild(noGroups);
                    return;
                }

                // Display each group
                groups.forEach((group, groupIdx) => {
                    const groupContainer = document.createElement('div');
                    groupContainer.style.cssText = `
                        background: #1a1a1a;
                        border: 1px solid #333;
                        border-radius: 6px;
                        padding: 15px;
                    `;

                    const groupHeader = document.createElement('div');
                    groupHeader.style.cssText = `
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 12px;
                        padding-bottom: 10px;
                        border-bottom: 1px solid #333;
                    `;

                    const groupTitle = document.createElement('div');
                    groupTitle.style.cssText = `
                        font-weight: bold;
                        font-size: 14px;
                        color: #4a9eff;
                    `;

                    // Handle both array structure and object with faces property
                    const faceList = Array.isArray(group) ? group : (group.faces || []);
                    const firstFace = faceList[0];
                    const similarityStr = firstFace && firstFace.similarity
                        ? `${Math.round(firstFace.similarity * 100)}%`
                        : 'N/A';

                    groupTitle.textContent = `Group ${groupIdx + 1} (${faceList.length} faces - Similarity: ${similarityStr})`;

                    const mergeGroupBtn = document.createElement('button');
                    mergeGroupBtn.textContent = '🔗 Merge Selected';
                    mergeGroupBtn.style.cssText = `
                        padding: 6px 14px;
                        background: #4a9eff;
                        color: #000;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                        font-size: 12px;
                        transition: all 0.2s;
                        opacity: 0.5;
                    `;
                    mergeGroupBtn.disabled = true;
                    mergeGroupBtn.onmouseover = () => !mergeGroupBtn.disabled && (mergeGroupBtn.style.background = '#3b8eef');
                    mergeGroupBtn.onmouseout = () => !mergeGroupBtn.disabled && (mergeGroupBtn.style.background = '#4a9eff');
                    mergeGroupBtn.onclick = () => {
                        const selectedCheckboxes = facesGrid.querySelectorAll(`input[type="checkbox"]:checked`);
                        const selectedFaces = [];  // Store face objects, not just IDs
                        const facesToFadeOut = [];

                        Array.from(selectedCheckboxes).forEach(cb => {
                            const faceCard = cb.parentElement;
                            const faceId = cb.dataset.faceId;

                            // Find the corresponding face object from faceList
                            const faceObj = faceList.find(f => {
                                const id = f.face_id || f.id;
                                return id == faceId;
                            });

                            if (faceObj) {
                                selectedFaces.push(faceObj);
                                facesToFadeOut.push(faceCard);
                            }
                        });

                        if (selectedFaces.length >= 2) {
                            // Store the actual DOM elements that need to be faded out
                            this.facesToFadeOutAfterMerge = facesToFadeOut;
                            this.targetFaceIdForMerge = null;
                            // Pass face objects directly instead of IDs
                            this.startGroupMerge(selectedFaces);
                        } else {
                            console.log('Select at least 2 faces to merge')
                        }
                    };

                    const deleteGroupBtn = document.createElement('button');
                    deleteGroupBtn.textContent = '🗑️ Delete Selected';
                    deleteGroupBtn.style.cssText = `
                        padding: 6px 14px;
                        background: #ef4444;
                        color: #fff;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-weight: bold;
                        font-size: 12px;
                        transition: all 0.2s;
                        opacity: 0.5;
                        margin-left: 8px;
                    `;
                    deleteGroupBtn.disabled = true;
                    deleteGroupBtn.onmouseover = () => !deleteGroupBtn.disabled && (deleteGroupBtn.style.background = '#dc2626');
                    deleteGroupBtn.onmouseout = () => !deleteGroupBtn.disabled && (deleteGroupBtn.style.background = '#ef4444');
                    deleteGroupBtn.onclick = async () => {
                        const selectedCheckboxes = facesGrid.querySelectorAll(`input[type="checkbox"]:checked`);
                        const selectedFaceIds = [];

                        Array.from(selectedCheckboxes).forEach(cb => {
                            const id = cb.dataset.faceId;
                            const faceId = parseInt(id) || id;
                            if (!isNaN(faceId)) {
                                selectedFaceIds.push(faceId);
                            }
                        });

                        if (selectedFaceIds.length === 0) {
                            console.log('Select embeddings to delete')
                            return;
                        }

                        // Confirm deletion
                        const confirmMsg = `Delete ${selectedFaceIds.length} embedding${selectedFaceIds.length !== 1 ? 's' : ''}?`;
                        if (!confirm(confirmMsg)) {
                            return;
                        }

                        try {
                            // Delete each selected embedding
                            for (const faceId of selectedFaceIds) {
                                const response = await fetch(`${this.apiBase}/api/faces/${faceId}`, {
                                    method: 'DELETE'
                                });
                                if (!response.ok) {
                                    throw new Error(`Failed to delete embedding ${faceId}`);
                                }
                            }

                            console.log(`Deleted ${selectedFaceIds.length} embedding${selectedFaceIds.length !== 1 ? 's' : ''} successfully`)

                            // Remove deleted embeddings from display
                            Array.from(selectedCheckboxes).forEach(cb => {
                                cb.parentElement.style.opacity = '0.3';
                                cb.parentElement.style.textDecoration = 'line-through';
                            });

                            // Reload face catalog after deletion
                            await this.loadFaceCatalogData(true);
                        } catch (error) {
                            console.error('Error deleting embeddings:', error);
                            console.log('Failed to delete embeddings: ' + error.message)
                        }
                    };

                    groupHeader.appendChild(groupTitle);
                    groupHeader.appendChild(mergeGroupBtn);
                    groupHeader.appendChild(deleteGroupBtn);
                    groupContainer.appendChild(groupHeader);

                    // Display faces in group
                    const facesGrid = document.createElement('div');
                    facesGrid.style.cssText = `
                        display: grid;
                        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
                        gap: 10px;
                    `;

                    faceList.forEach(face => {
                        const faceCard = document.createElement('div');
                        faceCard.style.cssText = `
                            background: #0f0f0f;
                            border: 2px solid #333;
                            border-radius: 4px;
                            padding: 8px;
                            text-align: center;
                            cursor: pointer;
                            transition: all 0.2s;
                            position: relative;
                        `;
                        // Use face_id from API response (not id)
                        const faceId = face.face_id || face.id;
                        faceCard.dataset.faceId = faceId;

                        // Checkbox
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.dataset.faceId = faceId;
                        checkbox.style.cssText = `
                            position: absolute;
                            top: 4px;
                            right: 4px;
                            width: 16px;
                            height: 16px;
                            cursor: pointer;
                            z-index: 10;
                        `;
                        checkbox.onchange = () => {
                            if (checkbox.checked) {
                                faceCard.style.borderColor = '#4a9eff';
                                faceCard.style.background = '#1a2a3a';
                            } else {
                                faceCard.style.borderColor = '#333';
                                faceCard.style.background = '#0f0f0f';
                            }
                            // Update button states based on selection count
                            const selectedCheckboxes = facesGrid.querySelectorAll(`input[type="checkbox"]:checked`);
                            const selectedCount = selectedCheckboxes.length;

                            // Merge button: requires at least 2 selections
                            if (selectedCount >= 2) {
                                mergeGroupBtn.disabled = false;
                                mergeGroupBtn.style.opacity = '1';
                                mergeGroupBtn.style.cursor = 'pointer';
                            } else {
                                mergeGroupBtn.disabled = true;
                                mergeGroupBtn.style.opacity = '0.5';
                                mergeGroupBtn.style.cursor = 'not-allowed';
                            }

                            // Delete button: requires at least 1 selection
                            if (selectedCount >= 1) {
                                deleteGroupBtn.disabled = false;
                                deleteGroupBtn.style.opacity = '1';
                                deleteGroupBtn.style.cursor = 'pointer';
                            } else {
                                deleteGroupBtn.disabled = true;
                                deleteGroupBtn.style.opacity = '0.5';
                                deleteGroupBtn.style.cursor = 'not-allowed';
                            }
                        };

                        faceCard.onclick = (e) => {
                            if (e.target !== checkbox) {
                                checkbox.checked = !checkbox.checked;
                                checkbox.dispatchEvent(new Event('change'));
                            }
                        };

                        faceCard.onmouseover = () => {
                            if (!checkbox.checked) {
                                faceCard.style.borderColor = '#666';
                            }
                        };
                        faceCard.onmouseout = () => {
                            if (!checkbox.checked) {
                                faceCard.style.borderColor = '#333';
                            }
                        };

                        const faceThumb = document.createElement('div');
                        faceThumb.style.cssText = `
                            width: 100%;
                            height: 80px;
                            background: linear-gradient(135deg, #2a4a6a, #3a5a7a);
                            border-radius: 3px;
                            margin-bottom: 6px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            color: #888;
                            font-size: 20px;
                            overflow: hidden;
                        `;

                        let thumbnailAdded = false;

                        // Try preview_url first (if face is from catalog)
                        if (face.preview_url) {
                            const img = document.createElement('img');
                            img.src = face.preview_url;
                            img.style.cssText = `
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                            `;
                            img.onerror = () => {
                                img.style.display = 'none';
                            };
                            faceThumb.textContent = '';
                            faceThumb.appendChild(img);
                            thumbnailAdded = true;
                        }
                        // Otherwise try base64 thumbnail from API
                        else if (face.thumbnail) {
                            const img = document.createElement('img');
                            if (!face.thumbnail.startsWith('data:')) {
                                img.src = `data:image/jpeg;base64,${face.thumbnail}`;
                            } else {
                                img.src = face.thumbnail;
                            }
                            img.style.cssText = `
                                width: 100%;
                                height: 100%;
                                object-fit: cover;
                            `;
                            img.onerror = () => {
                                img.style.display = 'none';
                            };
                            faceThumb.textContent = '';
                            faceThumb.appendChild(img);
                            thumbnailAdded = true;
                        }

                        // If no thumbnail available, show emoji
                        if (!thumbnailAdded) {
                            faceThumb.textContent = '👤';
                        }

                        const faceInfo = document.createElement('div');
                        faceInfo.style.cssText = `
                            font-size: 11px;
                            color: #aaa;
                        `;
                        faceInfo.innerHTML = `
                            <div><strong>${face.name || face.face_name || 'Unknown'}</strong></div>
                            <div style="color: #888;">ID: ${faceId}</div>
                            <div style="color: #666;">Embeddings: ${face.encoding_count || 0}</div>
                        `;

                        faceCard.appendChild(checkbox);
                        faceCard.appendChild(faceThumb);
                        faceCard.appendChild(faceInfo);
                        facesGrid.appendChild(faceCard);
                    });

                    groupContainer.appendChild(facesGrid);
                    content.appendChild(groupContainer);
                });
            } catch (error) {
                console.error('Error loading similar face groups:', error);
                content.innerHTML = '<div style="color: #f00; padding: 20px;">Error loading groups: ' + error.message + '</div>';
            }
        };

        // Update display on slider change
        similaritySlider.addEventListener('input', (e) => {
            document.getElementById('similarity-value').textContent = e.target.value;
        });

        // Search button click handler
        searchBtn.onclick = () => {
            const threshold = parseInt(similaritySlider.value);
            displayGroups(threshold);
        };

        analyzer.appendChild(header);
        analyzer.appendChild(controls);
        analyzer.appendChild(content);

        document.body.appendChild(analyzer);

        // Store displayGroups function on analyzer element for refresh after merge
        analyzer._displayGroups = displayGroups;

        // Auto-load initial groups with 42% threshold
        displayGroups(42);
    }

    async startGroupMerge(facesOrIds) {
        /**
         * Start merge process for a group of faces
         * Show dialog with thumbnail grid to select which face is the primary/target
         * Can accept either face objects (from analyzer) or face IDs (from other sources)
         */
        // Normalize input - could be face objects or IDs
        let faceIds = [];
        let faceDataMap = {};

        if (Array.isArray(facesOrIds) && facesOrIds.length > 0) {
            if (typeof facesOrIds[0] === 'object') {
                // Already have face objects
                facesOrIds.forEach(face => {
                    const id = face.face_id || face.id;
                    faceIds.push(id);
                    faceDataMap[id] = face;
                });
            } else {
                // Have IDs only - try to get from catalog
                faceIds = facesOrIds;
                if (this.faceCatalogData) {
                    this.faceCatalogData.forEach(face => {
                        faceDataMap[face.id] = face;
                    });
                }
            }
        }

        if (faceIds.length < 2) {
            console.log('Need at least 2 faces to merge')
            return;
        }

        // Create merge dialog
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #1a1a1a;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 20px;
            max-width: 700px;
            color: #fff;
            max-height: 80vh;
            overflow-y: auto;
        `;

        const title = document.createElement('div');
        title.style.cssText = `
            font-size: 18px;
            font-weight: bold;
            margin-bottom: 10px;
            color: #4a9eff;
        `;
        title.textContent = '🔗 Select Primary Face';

        const desc = document.createElement('div');
        desc.style.cssText = `
            font-size: 13px;
            color: #aaa;
            margin-bottom: 20px;
            line-height: 1.5;
        `;
        desc.textContent = `Click on a face thumbnail to select it as the primary face. All other selected faces will be merged into this one.`;

        // Grid container for face thumbnails
        const gridContainer = document.createElement('div');
        gridContainer.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 15px;
            margin-bottom: 20px;
        `;

        let selectedTargetId = faceIds[0]; // Default to first face

        faceIds.forEach((faceId, idx) => {
            const faceData = faceDataMap[faceId];

            const faceCard = document.createElement('div');
            faceCard.dataset.faceId = faceId;
            faceCard.style.cssText = `
                background: ${idx === 0 ? '#2a4a6a' : '#0f0f0f'};
                border: 3px solid ${idx === 0 ? '#4a9eff' : '#333'};
                border-radius: 8px;
                padding: 10px;
                cursor: pointer;
                transition: all 0.3s;
                text-align: center;
                position: relative;
            `;

            // Thumbnail image
            const thumbnail = document.createElement('img');
            thumbnail.style.cssText = `
                width: 100%;
                height: 100px;
                object-fit: cover;
                border-radius: 4px;
                background: #000;
                margin-bottom: 8px;
                display: block;
            `;

            // Use preview_url if available, otherwise create a placeholder
            if (faceData && faceData.preview_url) {
                thumbnail.src = faceData.preview_url;
                thumbnail.onerror = () => {
                    thumbnail.style.display = 'none';
                };
            } else {
                // Fallback gradient
                thumbnail.style.background = 'linear-gradient(135deg, #2a4a6a, #3a5a7a)';
                thumbnail.style.display = 'none'; // Hide the broken image
            }

            // Face label
            const label = document.createElement('div');
            label.style.cssText = `
                font-size: 12px;
                color: #aaa;
                margin-bottom: 4px;
                word-break: break-all;
            `;
            label.textContent = `ID: ${faceId}`;

            // Primary indicator
            const indicator = document.createElement('div');
            indicator.style.cssText = `
                font-size: 11px;
                font-weight: bold;
                color: ${idx === 0 ? '#4a9eff' : '#666'};
                min-height: 16px;
            `;
            indicator.textContent = idx === 0 ? '✓ PRIMARY' : '';

            // Hover effect
            faceCard.onmouseover = () => {
                if (faceCard.dataset.selected !== 'true') {
                    faceCard.style.borderColor = '#666';
                    faceCard.style.transform = 'scale(1.05)';
                }
            };

            faceCard.onmouseout = () => {
                if (faceCard.dataset.selected !== 'true') {
                    faceCard.style.borderColor = '#333';
                    faceCard.style.transform = 'scale(1)';
                }
            };

            // Click handler
            faceCard.onclick = () => {
                selectedTargetId = faceId;

                // Update all cards
                Array.from(gridContainer.children).forEach(card => {
                    const cardId = card.dataset.faceId;
                    const isSelected = cardId == faceId;

                    card.dataset.selected = isSelected ? 'true' : 'false';
                    card.style.background = isSelected ? '#2a4a6a' : '#0f0f0f';
                    card.style.borderColor = isSelected ? '#4a9eff' : '#333';
                    card.style.transform = 'scale(1)';

                    const cardIndicator = card.querySelector('[data-indicator]');
                    if (cardIndicator) {
                        cardIndicator.textContent = isSelected ? '✓ PRIMARY' : '';
                        cardIndicator.style.color = isSelected ? '#4a9eff' : '#666';
                    }
                });
            };

            // Create fallback thumbnail if preview_url doesn't exist
            const thumbnailWrapper = document.createElement('div');
            thumbnailWrapper.style.cssText = `
                width: 100%;
                height: 180px;
                background: linear-gradient(135deg, #2a4a6a, #3a5a7a);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 8px;
                font-size: 24px;
            `;

            let thumbnailAdded = false;

            // Try preview_url first
            if (faceData && faceData.preview_url) {
                const img = document.createElement('img');
                img.src = faceData.preview_url;
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 4px;
                `;
                img.onerror = () => {
                    img.style.display = 'none';
                };
                thumbnailWrapper.appendChild(img);
                thumbnailAdded = true;
            }
            // Try base64 thumbnail from face data
            else if (faceData && faceData.thumbnail) {
                const img = document.createElement('img');
                if (!faceData.thumbnail.startsWith('data:')) {
                    img.src = `data:image/jpeg;base64,${faceData.thumbnail}`;
                } else {
                    img.src = faceData.thumbnail;
                }
                img.style.cssText = `
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 4px;
                `;
                img.onerror = () => {
                    img.style.display = 'none';
                };
                thumbnailWrapper.appendChild(img);
                thumbnailAdded = true;
            }

            // Fallback to emoji if no image
            if (!thumbnailAdded) {
                thumbnailWrapper.textContent = '👤';
                thumbnailWrapper.style.fontSize = '32px';
            }

            faceCard.appendChild(thumbnailWrapper);
            faceCard.appendChild(label);

            const indicatorDiv = document.createElement('div');
            indicatorDiv.setAttribute('data-indicator', 'true');
            indicatorDiv.style.cssText = `
                font-size: 11px;
                font-weight: bold;
                color: ${idx === 0 ? '#4a9eff' : '#666'};
                min-height: 16px;
            `;
            indicatorDiv.textContent = idx === 0 ? '✓ PRIMARY' : '';
            faceCard.appendChild(indicatorDiv);

            gridContainer.appendChild(faceCard);
        });

        const buttons = document.createElement('div');
        buttons.style.cssText = `
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            background: #333;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
        `;
        cancelBtn.onmouseover = () => cancelBtn.style.background = '#444';
        cancelBtn.onmouseout = () => cancelBtn.style.background = '#333';
        cancelBtn.onclick = () => dialog.remove();

        const mergeBtn = document.createElement('button');
        mergeBtn.textContent = '🔗 Merge Now';
        mergeBtn.style.cssText = `
            padding: 8px 16px;
            background: #4a9eff;
            color: #000;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.2s;
        `;
        mergeBtn.onmouseover = () => mergeBtn.style.background = '#6ab0ff';
        mergeBtn.onmouseout = () => mergeBtn.style.background = '#4a9eff';
        mergeBtn.onclick = async () => {
            dialog.remove();
            await this.executeMergeGroup(selectedTargetId, faceIds);
        };

        buttons.appendChild(cancelBtn);
        buttons.appendChild(mergeBtn);

        modal.appendChild(title);
        modal.appendChild(desc);
        modal.appendChild(gridContainer);
        modal.appendChild(buttons);

        dialog.appendChild(modal);
        dialog.onclick = (e) => {
            if (e.target === dialog) dialog.remove();
        };

        document.body.appendChild(dialog);
    }

    async executeMergeGroup(targetFaceId, faceIds) {
        /**
         * Execute the merge of selected faces into target
         */
        try {
            // Reorder faceIds so target is first (backend uses first as target)
            const orderedFaceIds = [
                targetFaceId,
                ...faceIds.filter(id => id !== targetFaceId)
            ];

            console.log('Sending merge request with face IDs:', orderedFaceIds);

            const response = await fetch(`${this.apiBase}/api/faces/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_ids: orderedFaceIds,
                    target_name: null,
                    target_actor_id: null
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                const errorMsg = errorData.detail || JSON.stringify(errorData);
                console.error('Merge error response:', errorData);
                throw new Error(errorMsg);
            }

            const result = await response.json();
            console.log('✅ Successfully merged faces:', result);

            // Soft removal: fade out the face cards we stored earlier
            const facesToFadeOut = this.facesToFadeOutAfterMerge || [];
            console.log('Fading out', facesToFadeOut.length, 'face cards');

            for (const faceCard of facesToFadeOut) {
                if (faceCard && faceCard.parentElement) {
                    console.log('Fading out face card');
                    faceCard.classList.add('fade-out');

                    setTimeout(() => {
                        if (faceCard.parentElement) {
                            faceCard.remove();
                        }
                    }, 300);
                }
            }

            // Clear stored references
            this.facesToFadeOutAfterMerge = null;
            this.targetFaceIdForMerge = null;

        } catch (error) {
            console.error('Error merging faces:', error);
            console.log(`❌ Failed to merge faces: ${error.message}`)
        }
    }



    async deleteFaceId(faceId, resultElement) {
        /**
         * Delete a face ID from the database
         */
        try {
            const response = await fetch(`/api/faces/${faceId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                console.log(`Error deleting face ID ${faceId}`)
                return;
            }

            // Remove element from UI
            resultElement.style.opacity = '0.5';
            resultElement.style.pointerEvents = 'none';
            setTimeout(() => {
                resultElement.style.transition = 'all 0.3s ease-out';
                resultElement.style.transform = 'translateX(100%)';
                resultElement.style.opacity = '0';
                setTimeout(() => {
                    if (resultElement.parentElement) {
                        resultElement.remove();
                    }
                }, 300);
            }, 100);

            console.log(`Deleted face ID ${faceId}`)
        } catch (error) {
            console.error('Error deleting face:', error);
            console.log('Error deleting face ID')
        }
    }

    showFaceCardContextMenu(e, face) {
        /**
         * Show context menu for face card in catalog
         * Allows searching similar faces using primary encoding
         */
        const menu = document.createElement('div');
        menu.style.cssText = `
            position: fixed;
            top: ${e.clientY}px;
            left: ${e.clientX}px;
            background: #1a1a1a;
            border: 1px solid #333;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 10000;
            min-width: 180px;
            padding: 4px 0;
        `;

        const searchOption = document.createElement('div');
        searchOption.style.cssText = `
            padding: 10px 16px;
            color: #fff;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 13px;
        `;
        searchOption.textContent = '🔍 Search Similar';
        searchOption.onmouseover = () => searchOption.style.background = '#333';
        searchOption.onmouseout = () => searchOption.style.background = 'transparent';
        searchOption.onclick = () => {
            menu.remove();
            this.searchSimilarFaceByEncoding(face);
        };

        menu.appendChild(searchOption);
        document.body.appendChild(menu);

        // Close menu on click elsewhere
        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            });
        }, 0);
    }

    async searchSimilarFaceByEncoding(face) {
        /**
         * Search for similar faces using face's primary encoding
         * Uses the face ID's existing encoding instead of uploading a new image
         */
        if (!face.primary_encoding_id) {
            console.log(`Face "${face.name}" has no primary encoding`)
            return;
        }

        try {
            // Fetch the face details with encoding
            const response = await fetch(`/api/faces/${face.id}/encodings`);
            if (!response.ok) {
                console.log('Error fetching face encoding')
                return;
            }

            const data = await response.json();
            const encodings = data.encodings || [];

            // Find primary encoding
            const primaryEncoding = encodings.find(enc => enc.id === face.primary_encoding_id);
            if (!primaryEncoding) {
                console.log('Primary encoding not found')
                return;
            }

            // Search similar faces using the primary encoding
            this.showFaceSearchResultsFromEncoding(face, primaryEncoding);

        } catch (error) {
            console.error('Error searching similar faces:', error);
            console.log('Error searching similar faces')
        }
    }

    showFaceSearchResultsFromEncoding(face, encoding) {
        /**
         * Display search results using an encoding from the catalog
         * Similar to face search but using existing encoding
         */
        const searchData = {
            face: {
                ...face,
                imageData: encoding.thumbnail ?
                    (encoding.thumbnail.startsWith('data:') ? encoding.thumbnail : `data:image/jpeg;base64,${encoding.thumbnail}`)
                    : null
            },
            confidence: encoding.confidence || 0.9,
            quality_score: encoding.quality_score || 0.5,
            matches: [] // Will be populated if needed
        };

        // For now, just show the search modal with this face
        // This can be extended to call the search API if needed
        this.showFaceSearchModal(searchData);
    }

    async autoScanFacesForVideo(videoId, numFrames = 10, maxDuration = null) {
        /**
         * Detect faces for review before adding to database
         * Shows a modal with detected faces for user to review and select
         * 
         * Args:
         *   videoId: Video to scan
         *   numFrames: Number of frames to extract (default 10)
         *   maxDuration: Optional max duration in seconds (e.g., 3 for first 3 seconds) for fast mode
         */
        try {
            const video = this.videos.find(v => v.id === videoId) || this.allVideos.find(v => v.id === videoId);
            if (!video) {
                console.log('Video not found')
                return;
            }

            const modeLabel = maxDuration ? `(Fast - First ${maxDuration}s)` : '';
            // Show loading overlay with animation
            this.showFaceScanningOverlay(video.display_name || video.name, modeLabel);

            const params = new URLSearchParams({ num_frames: numFrames });
            if (maxDuration) {
                params.append('max_duration', maxDuration);
            }

            const response = await fetch(`/api/videos/${videoId}/detect-faces?${params}`, {
                method: 'POST'
            });

            // Hide loading overlay
            this.hideFaceScanningOverlay();

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Face detection failed');
            }

            const result = await response.json();

            if (result.status === 'completed') {
                // Show face review modal
                this.showFaceReviewModal(videoId, result);
            } else {
                console.log('No faces detected')
            }

        } catch (error) {
            console.error('❌ Face detection error:', error);
            this.hideFaceScanningOverlay();
            console.log(`Failed to detect faces: ${error.message}`)
        }
    }

    showFaceScanningOverlay(videoName, modeLabel = '') {
        /**
         * Show animated loading overlay while scanning for faces
         * 
         * Args:
         *   videoName: Name of video being scanned
         *   modeLabel: Optional mode label (e.g., "(Fast - First 3s)")
         */
        // Remove existing overlay if any
        this.hideFaceScanningOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'faceScanningOverlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(2px);
        `;

        overlay.innerHTML = `
            <style>
                @keyframes pulse-glow {
                    0%, 100% { box-shadow: 0 0 20px rgba(59, 130, 246, 0.5); }
                    50% { box-shadow: 0 0 40px rgba(59, 130, 246, 1); }
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .face-scanner {
                    animation: spin 2s linear infinite;
                }
                .scan-dots {
                    display: flex;
                    gap: 8px;
                    margin-top: 30px;
                }
                .scan-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: #3b82f6;
                    animation: bounce 1.4s ease-in-out infinite;
                }
                .scan-dot:nth-child(1) { animation-delay: 0s; }
                .scan-dot:nth-child(2) { animation-delay: 0.2s; }
                .scan-dot:nth-child(3) { animation-delay: 0.4s; }
            </style>

            <div class="face-scanner" style="font-size: 60px; animation: pulse-glow 2s ease-in-out infinite;">👤</div>

            <div style="margin-top: 30px; text-align: center; color: white;">
                <div style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">Scanning for faces ${modeLabel}</div>
                <div style="font-size: 14px; color: #d1d5db;">${videoName}</div>
            </div>

            <div class="scan-dots">
                <div class="scan-dot"></div>
                <div class="scan-dot"></div>
                <div class="scan-dot"></div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    hideFaceScanningOverlay() {
        /**
         * Hide the face scanning overlay
         */
        const overlay = document.getElementById('faceScanningOverlay');
        if (overlay) {
            overlay.remove();
        }
    }

    showFaceReviewModal(videoId, detectionResult) {
        /**
         * Show modal with detected faces for user review
         * User can select which faces to add and scan more if needed
         */
        // Store detection state
        this.faceReviewState = {
            videoId: videoId,
            videoName: detectionResult.video_name,
            detectedFaces: detectionResult.detected_faces,
            selectedFaceIndices: new Set(),
            numFrames: 10,
            allDetectedFaces: [...detectionResult.detected_faces]
        };

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'faceReviewModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Modal content - responsive for mobile/tablet/desktop
        const content = document.createElement('div');
        const isMobile = window.innerWidth < 480;
        const isTablet = window.innerWidth < 768;

        content.style.cssText = `
            background: white;
            padding: ${isMobile ? '16px' : isTablet ? '20px' : '30px'};
            border-radius: 12px;
            max-width: 95vw;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            width: ${isMobile ? '100%' : 'auto'};
            min-width: ${isMobile ? 'auto' : '400px'};
        `;

        const stats = `${detectionResult.total_detected} faces detected (${detectionResult.faces_with_matches} matches, ${detectionResult.faces_new} new)`;

        content.innerHTML = `
            <h2 style="margin-top: 0; color: #1f2937; font-size: ${isMobile ? '18px' : '20px'};">🔍👤 Review Detected Faces</h2>
            <p style="color: #6b7280; margin-bottom: 20px; font-size: ${isMobile ? '13px' : '14px'};">${stats}</p>

            <div id="facesContainer" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(${isMobile ? '70px' : '100px'}, 1fr)); gap: ${isMobile ? '10px' : '15px'}; margin-bottom: 20px; max-height: ${isMobile ? '300px' : '400px'}; overflow-y: auto;">
            </div>

            <div style="display: ${isMobile ? 'grid' : 'flex'}; grid-template-columns: ${isMobile ? '1fr 1fr' : 'auto'}; gap: ${isMobile ? '10px' : '10px'}; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                <button onclick="app.scanMoreFrames()" style="padding: ${isMobile ? '10px 8px' : '10px'}; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: ${isMobile ? '12px' : '13px'}; font-weight: 500;">
                    ${isMobile ? '+ Scan' : '+ Scan More Frames'}
                </button>
                <button onclick="app.confirmAddSelectedFaces()" style="padding: ${isMobile ? '10px 8px' : '10px'}; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: ${isMobile ? '12px' : '13px'}; font-weight: 500;">
                    ${isMobile ? '✓ Add' : '✓ Add Selected Faces'}
                </button>
                <button onclick="app.closeFaceReviewModal()" style="padding: ${isMobile ? '10px 8px' : '10px'}; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: ${isMobile ? '12px' : '13px'}; font-weight: 500; grid-column: ${isMobile ? '1 / -1' : 'auto'};">
                    ✕ Cancel
                </button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Populate faces
        this.renderFaceReviewItems();
    }

    renderFaceReviewItems() {
        /**
         * Render face items in review modal with animations for new faces
         */
        const container = document.getElementById('facesContainer');
        if (!container) return;

        const isMobile = window.innerWidth < 480;
        const imgHeight = isMobile ? '60px' : '100px';
        const padding = isMobile ? '6px' : '8px';
        const fontSize = isMobile ? '10px' : '11px';

        // Track which faces are already rendered to detect new ones
        const previousFaceCount = container.children.length;
        const isNewRender = previousFaceCount === 0;
        const newFaceStartIndex = previousFaceCount;

        container.innerHTML = '';

        this.faceReviewState.detectedFaces.forEach((face, index) => {
            const faceCard = document.createElement('div');
            faceCard.style.cssText = `
                padding: ${padding};
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                cursor: pointer;
                text-align: center;
                background: white;
                transition: all 0.2s;
                min-height: 0;
            `;

            // Add animation class for new faces
            const isNewFace = index >= newFaceStartIndex;
            if (isNewFace && !isNewRender) {
                faceCard.style.animation = 'slideInUp 0.4s ease-out, fadeIn 0.4s ease-out';
                faceCard.style.animationDelay = `${(index - newFaceStartIndex) * 0.1}s`;
            }

            if (this.faceReviewState.selectedFaceIndices.has(index)) {
                faceCard.style.borderColor = '#3b82f6';
                faceCard.style.background = '#eff6ff';
            }

            const thumbnail = face.thumbnail ? `data:image/jpeg;base64,${face.thumbnail}` : '';

            faceCard.innerHTML = `
                <img src="${thumbnail}" style="width: 100%; height: ${imgHeight}; object-fit: cover; border-radius: 4px; margin-bottom: ${isMobile ? '4px' : '8px'};" />
                <div style="font-size: ${fontSize};">
                    <div style="color: #1f2937; font-weight: 600;">${(face.confidence * 100).toFixed(0)}%</div>
                    <div style="color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${face.is_match ? `Match: ${face.matched_face.name}` : 'New'}</div>
                </div>
            `;

            faceCard.onclick = () => {
                if (this.faceReviewState.selectedFaceIndices.has(index)) {
                    this.faceReviewState.selectedFaceIndices.delete(index);
                } else {
                    this.faceReviewState.selectedFaceIndices.add(index);
                }
                this.renderFaceReviewItems();
            };

            container.appendChild(faceCard);
        });
    }

    async scanMoreFrames() {
        /**
         * Scan additional frames and append to detected faces with animation
         */
        if (!this.faceReviewState) return;

        const scanBtn = document.querySelector('[onclick*="scanMoreFrames"]');
        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.style.opacity = '0.6';
        }

        console.log('🔍 Scanning more frames...')

        try {
            const response = await fetch(
                `/api/videos/${this.faceReviewState.videoId}/detect-faces?num_frames=10`,
                { method: 'POST' }
            );

            if (!response.ok) throw new Error('Detection failed');

            const result = await response.json();

            // Append new faces
            const newFacesCount = result.detected_faces.length;
            this.faceReviewState.detectedFaces = [
                ...this.faceReviewState.detectedFaces,
                ...result.detected_faces
            ];
            this.faceReviewState.allDetectedFaces.push(...result.detected_faces);

            // Re-render with animations for new faces
            this.renderFaceReviewItems();

            // Scroll to show new faces
            setTimeout(() => {
                const container = document.getElementById('facesContainer');
                if (container) {
                    container.scrollLeft = container.scrollWidth;
                }
            }, 100);

            console.log(`✅ Found ${newFacesCount} more faces! Scroll right to see them.`)
        } catch (error) {
            console.log(`Failed to scan more frames: ${error.message}`)
        } finally {
            if (scanBtn) {
                scanBtn.disabled = false;
                scanBtn.style.opacity = '1';
            }
        }
    }

    async confirmAddSelectedFaces() {
        /**
         * Add selected faces to the database
         */
        // Defensive checks
        if (!this.faceReviewState) {
            console.log('Error: No faces loaded for review')
            return;
        }

        if (!this.faceReviewState.selectedFaceIndices || this.faceReviewState.selectedFaceIndices.size === 0) {
            console.log('Please select at least one face to add')
            return;
        }

        if (!this.faceReviewState.allDetectedFaces) {
            console.log('Error: Face data missing')
            return;
        }

        const videoId = this.faceReviewState.videoId;
        if (!videoId) {
            console.log('Error: Video ID missing')
            return;
        }

        console.log('✓ Adding selected faces...')

        try {
            // Get selected faces by index, with bounds checking
            const selectedFaces = [];
            for (const idx of this.faceReviewState.selectedFaceIndices) {
                if (idx >= 0 && idx < this.faceReviewState.allDetectedFaces.length) {
                    const face = this.faceReviewState.allDetectedFaces[idx];
                    if (face) {
                        selectedFaces.push(face);
                    }
                }
            }

            if (selectedFaces.length === 0) {
                console.log('No valid faces selected')
                return;
            }

            console.log(`Adding ${selectedFaces.length} faces to video ${videoId}...`);

            // Call backend to add selected faces
            const response = await fetch(`/api/videos/${videoId}/add-detected-faces`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    detected_faces: selectedFaces
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to add faces');
            }

            const result = await response.json();

            console.log(`✅ Added ${result.faces_added} face(s) to video`)

            console.log('✓ Faces added successfully:', result);

            // Close modal and refresh
            this.closeFaceReviewModal();
            await this.refreshVideo(videoId);

        } catch (error) {
            console.error('Error adding faces:', error);
            console.log(`Failed to add faces: ${error.message}`)
        }
    }

    closeFaceReviewModal() {
        /**
         * Close the face review modal
         */
        const modal = document.getElementById('faceReviewModal');
        if (modal) {
            modal.remove();
        }
        this.faceReviewState = null;
    }

    openEditVideoModalFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.showVideoEditorModal(this.contextMenuVideoId, this.contextMenuVideoName);
            this.hideVideoContextMenu();
        }
    }

    addAudioFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            // Set current video from context menu
            const video = this.videos.find(v => v.id === this.contextMenuVideoId) ||
                this.allVideos.find(v => v.id === this.contextMenuVideoId);
            if (video) {
                this.currentVideo = video;
                this.showAddAudioModal();
            }
            this.hideVideoContextMenu();
        }
    }

    sanitizeFilename(filename) { return this.format.sanitizeFilename(filename) }

    async sanitizeFilenameFromContext() {
        if (!this.contextMenuVideoId || !this.contextMenuVideoName) {
            return;
        }

        this.hideVideoContextMenu();

        const originalName = this.contextMenuVideoName;
        const sanitizedName = this.sanitizeFilename(originalName);

        // If no changes needed, notify user
        if (originalName === sanitizedName) {
            console.log('✅ Filename is already clean')
            return;
        }

        // Show confirmation modal with before/after preview
        const confirmed = confirm(
            `Sanitize filename?\n\n` +
            `Original:\n${originalName}\n\n` +
            `Sanitized:\n${sanitizedName}\n\n` +
            `This will rename the file on disk.`
        );

        if (!confirmed) {
            return;
        }

        try {
            console.log('🧹 Sanitizing filename...')

            const response = await fetch(`${this.apiBase}/videos/${this.contextMenuVideoId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: sanitizedName })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            const data = await response.json();

            // Update video in cache
            const video = this.videos.find(v => v.id === this.contextMenuVideoId) ||
                this.allVideos.find(v => v.id === this.contextMenuVideoId);
            if (video) {
                video.name = sanitizedName;
            }

            // Re-render current view
            if (this.currentView === 'list') {
                this.renderVideoGrid();
            } else if (this.currentView === 'explorer' && this.currentCategory) {
                await this.loadAndShowVideosInFolder(this.currentCategory, this.currentSubcategory);
            }

            console.log(`✅ Filename sanitized successfully`)

        } catch (error) {
            console.error('❌ Error sanitizing filename:', error);
            console.log(`❌ Failed to sanitize: ${error.message}`)
        }
    }

    /* OLD handleContextMenuClickOutside - Now handled by ContextMenuModule
    handleContextMenuClickOutside(event) {
        const menu = document.getElementById('videoContextMenu');
        if (menu && !menu.contains(event.target)) {
            this.hideVideoContextMenu();
        }
    }
    */

    // Thumbnail Generation Methods
    showThumbnailModal(videoId, videoName) {
        console.log('Opening thumbnail modal for:', { videoId, videoName });
        this.hideVideoContextMenu();

        // Hide Duplicates Review View if active
        this.hideDuplicatesReviewIfActive();

        // Validate input parameters
        if (!videoId || !videoName) {
            console.error('Invalid parameters for thumbnail modal:', { videoId, videoName });
            console.log('Error: Invalid video information')
            return;
        }

        this.currentThumbnailVideo = { id: videoId, name: videoName };
        this.selectedThumbnailTime = null;

        console.log('Set currentThumbnailVideo to:', this.currentThumbnailVideo);

        // Update modal title
        document.getElementById('thumbnailModalTitle').textContent = `Generate Thumbnail for "${videoName}"`;

        // Show modal
        document.getElementById('thumbnailModal').style.display = 'flex';

        // Generate random thumbnail options
        this.generateThumbnailPreviews(videoId);
    }

    hideThumbnailModal() {
        console.log('Hiding thumbnail modal');
        document.getElementById('thumbnailModal').style.display = 'none';

        // Restore Duplicates Review View if it was hidden
        this.restoreDuplicatesReviewIfNeeded();

        // Don't clear currentThumbnailVideo immediately to avoid race conditions
        setTimeout(() => {
            this.currentThumbnailVideo = null;
            this.selectedThumbnailTime = null;
        }, 100);

        document.getElementById('setThumbnailBtn').disabled = true;

        // Clear previews
        const grid = document.getElementById('thumbnailPreviewGrid');
        grid.innerHTML = '';
    }

    async refreshThumbnail(videoId) {
        try {
            console.log(`🖼️ Refreshing thumbnail for video ${videoId}...`);

            // Call API to regenerate thumbnail
            await this.api.generateThumbnail(videoId);

            // Wait a moment for the thumbnail to be written to disk
            await new Promise(resolve => setTimeout(resolve, 500));

            // Update all thumbnail images for this video with aggressive cache busting
            const cacheBuster = Date.now();
            const randomBuster = Math.random();

            // Update in videos array
            const video = this.videos.find(v => v.id === videoId);
            if (video) {
                // Update thumbnail URL in memory
                const baseThumbnailUrl = video.thumbnail_url.split('?')[0];
                video.thumbnail_url = `${baseThumbnailUrl}?t=${cacheBuster}&bust=${randomBuster}`;
            }

            // Update in allVideos array
            const allVideo = this.allVideos.find(v => v.id === videoId);
            if (allVideo) {
                const baseThumbnailUrl = allVideo.thumbnail_url.split('?')[0];
                allVideo.thumbnail_url = `${baseThumbnailUrl}?t=${cacheBuster}&bust=${randomBuster}`;
            }

            // Force update all thumbnail images in the DOM
            const thumbnailElements = document.querySelectorAll(`img[data-video-id="${videoId}"]`);
            thumbnailElements.forEach(img => {
                const baseSrc = img.src.split('?')[0];
                img.src = `${baseSrc}?t=${cacheBuster}&bust=${randomBuster}`;
            });

            // Also update by src matching (for elements without data-video-id)
            const allThumbnails = document.querySelectorAll('.video-thumbnail img, .bulk-edit-thumbnail');
            allThumbnails.forEach(img => {
                if (img.src.includes(`/api/thumbnails/${videoId}`)) {
                    const baseSrc = img.src.split('?')[0];
                    img.src = `${baseSrc}?t=${cacheBuster}&bust=${randomBuster}`;
                }
            });

            console.log('✅ Thumbnail refreshed successfully')
            console.log(`✅ Thumbnail refreshed for video ${videoId}`);

        } catch (error) {
            console.error('Error refreshing thumbnail:', error);
            console.log('❌ Failed to refresh thumbnail')
        }
    }

    async refreshVideoMetadata(videoId) {
        /**
         * Lightweight refresh: Fetch fresh metadata without regenerating thumbnail
         * Used for auto-refresh after rename/update operations
         */
        try {
            console.log(`🔄 Refreshing metadata for video ${videoId}...`);

            // Fetch fresh video data with all metadata (tags, actors, faces)
            const videoResponse = await fetch(`${this.apiBase}/api/videos/${videoId}`);

            if (!videoResponse.ok) {
                console.warn(`Failed to fetch video metadata for ${videoId}`);
                return;
            }

            const updatedVideo = await videoResponse.json();

            // Update video in both arrays
            const updateInArray = (array) => {
                const index = array.findIndex(v => v.id === videoId);
                if (index !== -1) {
                    array[index] = updatedVideo;
                }
            };

            updateInArray(this.videos);
            updateInArray(this.allVideos);

            // Update the video card in the DOM with cache-busted thumbnail URL
            const videoCard = document.querySelector(`[data-video-id="${videoId}"]`);
            if (videoCard) {
                const thumbnail = videoCard.querySelector('.video-thumbnail');
                if (thumbnail && updatedVideo.thumbnail_url) {
                    const cacheBust = `?t=${Date.now()}&bustCache=${Math.random()}`;
                    thumbnail.src = `${this.apiBase}${updatedVideo.thumbnail_url}${cacheBust}`;
                }

                // Update title/display name
                const titleEl = videoCard.querySelector('.video-title');
                if (titleEl) {
                    const displayName = updatedVideo.display_name || updatedVideo.name;
                    titleEl.textContent = displayName;
                    titleEl.setAttribute('title', displayName);
                }
            }

            console.log(`✅ Metadata refreshed for video ${videoId}`);

        } catch (error) {
            console.error(`Error refreshing metadata for video ${videoId}:`, error);
        }
    }

    async refreshVideo(videoId) { return this.videoOps.refreshVideo(videoId) }

    async loadMetadataForVideo(videoId) {
        try {
            console.log(`⚡ Loading metadata for video ${videoId}...`);

            // Call the metadata extraction endpoint
            const data = await this.api.extractMetadata(videoId);

            if (data.success) {
                // Update video in both arrays with new metadata
                const updateInArray = (array) => {
                    const index = array.findIndex(v => v.id === videoId);
                    if (index !== -1) {
                        array[index].duration = data.metadata.duration;
                        array[index].width = data.metadata.width;
                        array[index].height = data.metadata.height;
                        array[index].codec = data.metadata.codec;
                        array[index].bitrate = data.metadata.bitrate;
                        array[index].fps = data.metadata.fps;
                    }
                };

                updateInArray(this.videos);
                updateInArray(this.allVideos);

                // Refresh display to show new metadata
                this.renderVideoGrid();

                console.log('✓ Metadata loaded successfully')
            } else {
                throw new Error(data.message || 'Failed to load metadata');
            }

        } catch (error) {
            console.error('Error loading metadata:', error);
            console.log('Failed to load metadata')
        }
    }

    async loadMetadataForFolder(folderName) {
        try {
            console.log(`⚡ Loading metadata for folder "${folderName}"...`);
            console.log(`Loading metadata for "${folderName}"...`)

            // Call the folder metadata extraction endpoint
            const response = await fetch(`${this.apiBase}/api/videos/folder/${folderName}/extract-metadata`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Failed to extract folder metadata');
            }

            const data = await response.json();

            if (data.success) {
                // Reload videos to get updated metadata
                if (this.currentView === 'explorer' && this.currentCategory === folderName) {
                    await this.loadAndShowVideosInFolder(folderName, this.currentSubcategory);
                } else {
                    await this.loadAllVideosFlat();
                }

                console.log(`✓ Loaded metadata for ${data.processed} videos`)
            } else {
                throw new Error(data.message || 'Failed to load folder metadata');
            }

        } catch (error) {
            console.error('Error loading folder metadata:', error);
            console.log('Failed to load folder metadata')
        }
    }

    async generateThumbnailPreviews(videoId) {
        const grid = document.getElementById('thumbnailPreviewGrid');
        grid.innerHTML = '';

        // Generate 5 random time points between 5 and 30 seconds
        const timePoints = [];
        for (let i = 0; i < 5; i++) {
            const randomTime = Math.floor(Math.random() * 26) + 5; // 5-30 seconds
            timePoints.push(randomTime);
        }

        // Sort times for better user experience
        timePoints.sort((a, b) => a - b);

        console.log('Generating thumbnail previews...')

        // Create preview elements for each time point
        timePoints.forEach((timePoint, index) => {
            const option = document.createElement('div');
            option.className = 'thumbnail-option';
            option.dataset.time = timePoint;
            option.innerHTML = `
                <div class="thumbnail-loading">
                    <div>Generating...</div>
                </div>
                <div class="thumbnail-time-badge">${timePoint}s</div>
            `;

            option.onclick = () => this.selectThumbnailOption(option, timePoint);
            grid.appendChild(option);

            // Generate preview for this time point
            this.generateThumbnailPreview(videoId, timePoint, option, index);
        });
    }

    async generateThumbnailPreview(videoId, timePoint, optionElement, index) {
        try {
            // Add small delay to stagger requests
            await new Promise(resolve => setTimeout(resolve, index * 200));

            const response = await fetch(`${this.apiBase}/api/thumbnails/preview/${videoId}?time=${timePoint}`, {
                method: 'POST'
            });

            if (!response.ok) {
                throw new Error('Preview generation failed');
            }

            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);

            // Update the option element with the actual image
            optionElement.innerHTML = `
                <img src="${imageUrl}" alt="Thumbnail at ${timePoint}s" />
                <div class="thumbnail-time-badge">${timePoint}s</div>
            `;

        } catch (error) {
            console.error(`Failed to generate preview for ${timePoint}s:`, error);
            optionElement.innerHTML = `
                <div class="thumbnail-loading">
                    <div>Failed to generate</div>
                </div>
                <div class="thumbnail-time-badge">${timePoint}s</div>
            `;
        }
    }

    selectThumbnailOption(optionElement, timePoint) {
        // Remove selection from all options
        document.querySelectorAll('.thumbnail-option').forEach(option => {
            option.classList.remove('selected');
        });

        // Select this option
        optionElement.classList.add('selected');
        this.selectedThumbnailTime = timePoint;

        // Enable the set thumbnail button
        document.getElementById('setThumbnailBtn').disabled = false;
    }

    async setSelectedThumbnail() {
        if (!this.currentThumbnailVideo || !this.currentThumbnailVideo.id || this.selectedThumbnailTime === null) {
            console.error('Missing thumbnail video data:', this.currentThumbnailVideo);
            console.log('Error: Missing video information')
            return;
        }

        const setBtn = document.getElementById('setThumbnailBtn');
        setBtn.disabled = true;
        setBtn.textContent = 'Setting...';

        // Store current video info to prevent it being lost
        const videoId = this.currentThumbnailVideo.id;
        const videoName = this.currentThumbnailVideo.name;
        const selectedTime = this.selectedThumbnailTime;

        try {
            const response = await fetch(`${this.apiBase}/api/thumbnails/generate/${videoId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ time: selectedTime })
            });

            if (!response.ok) {
                throw new Error('Failed to set thumbnail');
            }

            const result = await response.json();
            console.log('Thumbnail generation API response:', result);

            console.log(`Thumbnail updated for "${videoName}"`)
            this.hideThumbnailModal();

            // Update the video card thumbnail immediately
            this.updateVideoCardAfterThumbnailChange(videoId);

            // Auto-refresh metadata to ensure cache is busted
            setTimeout(async () => {
                await this.refreshVideoMetadata(videoId);
                console.log('Auto-refreshed video after thumbnail update');
            }, 500);

        } catch (error) {
            console.error('Failed to set thumbnail:', error);
            console.log(`Failed to set thumbnail: ${error.message}`)
        } finally {
            setBtn.disabled = false;
            setBtn.textContent = 'Set Thumbnail';
        }
    }

    updateVideoCardAfterThumbnailChange(videoId) {
        console.log('Updating video card thumbnail for videoId:', videoId);

        const timestamp = Date.now();
        // Create cache-busted URL for immediate update
        const newThumbnailUrl = `${this.apiBase}/api/thumbnails/${videoId}?v=${timestamp}`;
        // Store base URL without timestamp for cache (will be cache-busted when rendered)
        const baseThumbnailUrl = `${this.apiBase}/api/thumbnails/${videoId}`;

        console.log('Generated new thumbnail URL:', newThumbnailUrl);

        // Find and update the video card thumbnail using data-video-id attribute
        const card = document.querySelector(`[data-video-id="${videoId}"]`);

        if (card) {
            const thumbnailDiv = card.querySelector('.video-thumbnail');
            if (thumbnailDiv) {
                console.log('Found matching video card, updating thumbnail');

                // Check if image exists and is lazy-loaded
                const img = thumbnailDiv.querySelector('img.lazy-image');

                if (img) {
                    // For lazy-loaded images, update both data-src and src to force reload
                    img.setAttribute('data-src', newThumbnailUrl);
                    img.src = newThumbnailUrl;
                    console.log('Updated lazy-loaded thumbnail');
                } else {
                    // Replace entire thumbnail content with fresh HTML
                    console.log('Replacing entire thumbnail div with new image');
                    thumbnailDiv.innerHTML = `
                        <img src="${newThumbnailUrl}" alt="Video thumbnail" class="thumbnail-image" loading="eager"
                             onload="console.log('New thumbnail loaded successfully')"
                             onerror="console.error('New thumbnail failed to load:', this.src)" />
                        <div class="play-overlay">▶</div>
                    `;

                    // Re-attach the onclick handler since we replaced the HTML
                    const videoData = card.querySelector('.video-thumbnail').parentElement.querySelector('[onclick*="playVideoFromData"]');
                    if (videoData) {
                        const onclickAttr = videoData.getAttribute('onclick');
                        if (onclickAttr) {
                            thumbnailDiv.setAttribute('onclick', onclickAttr);
                        }
                    }
                }

                console.log('Thumbnail updated successfully');
            } else {
                console.warn('Could not find thumbnail div in video card');
            }
        } else {
            console.warn('Could not find video card for videoId:', videoId);
        }

        // Update cached video data with base URL (without permanent timestamp)
        // This way, when cards are re-rendered, they'll use fresh timestamps
        let cacheUpdated = false;

        if (this.allVideos) {
            const video = this.allVideos.find(v => v.id === videoId);
            if (video) {
                // Store last update timestamp to track changes
                video.thumbnail_updated_at = timestamp;
                video.thumbnail_url = baseThumbnailUrl;
                video.thumbnail_generated = 1;
                console.log('Updated allVideos cache for video:', videoId);
                cacheUpdated = true;
            }
        }

        if (this.videos) {
            const video = this.videos.find(v => v.id === videoId);
            if (video) {
                // Store last update timestamp to track changes
                video.thumbnail_updated_at = timestamp;
                video.thumbnail_url = baseThumbnailUrl;
                video.thumbnail_generated = 1;
                console.log('Updated videos cache for video:', videoId);
                cacheUpdated = true;
            }
        }

        if (!cacheUpdated) {
            console.warn('Could not update cached video data for videoId:', videoId);
        }
    }

    updateImageCardAfterThumbnailChange(imageId) {
        /**
         * Update image card thumbnail after thumbnail capture
         * Similar to updateVideoCardAfterThumbnailChange but for images
         */
        console.log('Updating image card thumbnail for imageId:', imageId);

        const timestamp = Date.now();
        // Create cache-busted URL for immediate update
        const newThumbnailUrl = `${this.apiBase}/api/image-thumbnails/${imageId}?v=${timestamp}`;

        console.log('Generated new image thumbnail URL:', newThumbnailUrl);

        // Find and update the image card thumbnail using data-image-id attribute
        const card = document.querySelector(`[data-image-id="${imageId}"]`);

        if (card) {
            const thumbnailDiv = card.querySelector('.image-thumbnail');
            if (thumbnailDiv) {
                console.log('Found matching image card, updating thumbnail');

                // Check if image exists and is lazy-loaded
                const img = thumbnailDiv.querySelector('img.lazy-image');

                if (img) {
                    // For lazy-loaded images, update both data-src and src to force reload
                    img.setAttribute('data-src', newThumbnailUrl);
                    img.src = newThumbnailUrl;
                    console.log('Updated lazy-loaded image thumbnail');
                } else {
                    // Replace entire thumbnail content with fresh HTML
                    console.log('Replacing entire image thumbnail div with new image');
                    thumbnailDiv.innerHTML = `
                        <img src="${newThumbnailUrl}" alt="Image thumbnail" class="thumbnail-image" loading="eager"
                             onload="console.log('New image thumbnail loaded successfully')"
                             onerror="console.error('New image thumbnail failed to load:', this.src)" />
                    `;
                }

                console.log('Image thumbnail updated successfully');
            } else {
                console.warn('Could not find thumbnail div in image card');
            }
        } else {
            console.warn('Could not find image card for imageId:', imageId);
        }
    }

    updateVideoDataAfterRename(videoId, updatedVideoData) { this.videoOps.updateVideoDataAfterRename(videoId, updatedVideoData) }

    async captureCurrentFrameAsThumbnail() {
        // Get current video info from the HTML5 player
        const currentVideo = this.getCurrentPlayingVideo();
        const videoPlayer = document.getElementById('videoPlayer');

        if (!currentVideo) {
            console.error('No video currently playing');
            console.log('Error: No video currently playing')
            return;
        }

        if (!videoPlayer || videoPlayer.readyState < 2) {
            console.error('Video player not ready for thumbnail capture');
            console.log('Error: Video not ready')
            return;
        }

        const currentTime = Math.floor(videoPlayer.currentTime);
        console.log(`Capturing thumbnail at ${currentTime}s for video ${currentVideo.id}`);

        // Show visual feedback only - no toast notifications
        this.showThumbnailCaptureEffect();

        // Start thumbnail generation asynchronously - don't await
        this.generateThumbnailAsync(currentVideo.id, currentTime)
            .then(() => {
                // Update the video card thumbnail (visual effect is enough feedback)
                this.updateVideoCardAfterThumbnailChange(currentVideo.id);
            })
            .catch(error => {
                console.error('Failed to capture thumbnail:', error);
                console.log(`❌ Capture failed: ${error.message}`)
            });

        // Return immediately - don't block video playback
        return;
    }

    async copyCurrentFrameToClipboard(videoPlayer) {
        /**
         * Copy current video frame to clipboard (pure browser-based)
         * Uses Canvas API to capture frame and Clipboard API to copy
         */
        try {
            if (!videoPlayer || videoPlayer.readyState < 2) {
                console.log('⚠️ Video not ready yet')
                return;
            }

            // Check if Clipboard API is supported
            if (!navigator.clipboard || !navigator.clipboard.write) {
                console.log('❌ Clipboard API not supported in this browser')
                console.error('Clipboard API not available');
                return;
            }

            // Create a canvas to draw the video frame
            const canvas = document.createElement('canvas');
            canvas.width = videoPlayer.videoWidth;
            canvas.height = videoPlayer.videoHeight;

            // Draw current video frame to canvas
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);

            // Convert canvas to blob
            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/png');
            });

            if (!blob) {
                throw new Error('Failed to create image blob');
            }

            // Create ClipboardItem and write to clipboard
            const clipboardItem = new ClipboardItem({ 'image/png': blob });
            await navigator.clipboard.write([clipboardItem]);

            // Show visual feedback only (flash effect is enough)
            const currentTime = videoPlayer.currentTime;
            const timestamp = this.formatDuration(currentTime);
            this.showFrameCopyEffect();

            console.log(`📋 Frame copied to clipboard at ${timestamp} (${canvas.width}x${canvas.height})`);

        } catch (error) {
            console.error('Failed to copy frame to clipboard:', error);
            console.log(`❌ Copy failed: ${error.message}`)
        }
    }

    showFrameCopyEffect() {
        /**
         * Show a brief visual effect when frame is copied
         * Similar to thumbnail capture but with different color
         */
        const modal = document.getElementById('videoModal');
        const flashOverlay = document.createElement('div');
        flashOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(59, 130, 246, 0.3);
            pointer-events: none;
            z-index: 9999;
            animation: flashCopy 0.3s ease-out;
        `;

        // Add animation keyframes if not already added
        if (!document.getElementById('flashCopyAnimation')) {
            const style = document.createElement('style');
            style.id = 'flashCopyAnimation';
            style.textContent = `
                @keyframes flashCopy {
                    0% { opacity: 1; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        modal.appendChild(flashOverlay);

        // Remove after animation
        setTimeout(() => {
            if (flashOverlay.parentNode) {
                flashOverlay.parentNode.removeChild(flashOverlay);
            }
        }, 300);
    }

    async generateThumbnailAsync(videoId, currentTime) {
        // Use a separate async method for the actual generation
        const response = await fetch(`${this.apiBase}/api/thumbnails/generate/${videoId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                time: currentTime,
                priority: 'high' // Add priority flag for immediate captures
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Thumbnail generation completed:', result);
        return result;
    }

    getCurrentPlayingVideo() {
        // Try to get the currently playing video from various sources
        if (this.currentVideoInPlayer) {
            return this.currentVideoInPlayer;
        }

        // Parse from video title if available
        const videoTitle = document.getElementById('videoTitle');
        if (videoTitle && videoTitle.textContent) {
            const titleText = videoTitle.textContent;

            // Find video by name in our cached data
            if (this.videos) {
                const video = this.videos.find(v => v.name === titleText);
                if (video) return video;
            }

            if (this.allVideos) {
                const video = this.allVideos.find(v => v.name === titleText);
                if (video) return video;
            }
        }

        return null;
    }

    showThumbnailCaptureEffect() {
        // Create a flash effect to indicate thumbnail capture
        const modal = document.getElementById('videoModal');
        const flashOverlay = document.createElement('div');
        flashOverlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: white;
            opacity: 0.8;
            pointer-events: none;
            z-index: 1003;
            animation: thumbnailFlash 0.3s ease-out;
        `;

        // Add CSS animation if not already defined
        if (!document.querySelector('#thumbnail-flash-style')) {
            const style = document.createElement('style');
            style.id = 'thumbnail-flash-style';
            style.textContent = `
                @keyframes thumbnailFlash {
                    0% { opacity: 0; }
                    50% { opacity: 0.8; }
                    100% { opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        modal.appendChild(flashOverlay);

        // Remove flash effect after animation
        setTimeout(() => {
            if (flashOverlay.parentNode) {
                flashOverlay.parentNode.removeChild(flashOverlay);
            }
        }, 300);
    }

    handleImageIntersection(entries, observer) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                const src = img.getAttribute('data-src');

                if (src) {
                    // Create a new image to preload
                    const tempImage = new Image();
                    // Enable async decoding to avoid blocking main thread
                    tempImage.decoding = 'async';

                    tempImage.onload = async () => {
                        // Decode the image asynchronously before showing it
                        try {
                            await tempImage.decode();
                        } catch (e) {
                            // decode() failed, but still show the image
                        }
                        // Once loaded and decoded, swap the src
                        img.src = src;
                        img.classList.add('loaded');
                    };
                    tempImage.onerror = () => {
                        // Handle error gracefully
                        img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="320" height="180"%3E%3Crect width="100%" height="100%" fill="%23ef4444"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="white"%3EError%3C/text%3E%3C/svg%3E';
                        img.classList.add('error');
                    };
                    tempImage.src = src;

                    // Stop observing this image
                    observer.unobserve(img);
                }
            }
        });
    }

    // Helper method to construct proper streaming path
    getVideoStreamingPath(video) {
        if (video.relative_path && video.relative_path !== video.category) {
            // Use relative_path if it's valid (not just the category name)
            return video.relative_path;
        } else if (video.subcategory) {
            // If there's a subcategory, combine it with the name
            return `${video.subcategory}/${video.name}`;
        } else {
            // Otherwise just use the name
            return video.name;
        }
    }

    // Rename Modal Methods
    populateRenameVideoPreview(video) { this.videoOps.populateRenameVideoPreview(video) }

    showRenameModal(videoId, videoName, displayName = null, description = null) { this.videoOps.showRenameModal(videoId, videoName, displayName, description) }

    hideRenameModal() { this.videoOps.hideRenameModal() }

    updateRatingStars(rating) { this.seriesModule.updateRatingStars(rating) }

    async renameVideo() { return this.videoOps.renameVideo() }

    // ==================== TOGGLE FAVORITE ====================

    async toggleFavorite(videoId, isFavorite) {
        try {
            const response = await fetch(`${window.CLIPPER_CONFIG.apiUrl}/videos/${videoId}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ favorite: isFavorite })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('Favorite toggled successfully:', result);

            // Update video in cache
            const updateVideoInArray = (videos) => {
                const video = videos.find(v => v.id === videoId);
                if (video) {
                    video.favorite = isFavorite;
                }
            };

            updateVideoInArray(this.videos);
            updateVideoInArray(this.allVideos);

            // Update the video card in DOM
            const videoCard = document.querySelector(`.video-card[data-video-id="${videoId}"]`);
            if (videoCard) {
                const favoriteIcon = videoCard.querySelector('.favorite-icon');
                if (favoriteIcon) {
                    favoriteIcon.textContent = isFavorite ? '★' : '☆';
                    favoriteIcon.className = `favorite-icon ${isFavorite ? 'is-favorite' : ''}`;
                    favoriteIcon.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';
                    favoriteIcon.onclick = (e) => {
                        e.stopPropagation();
                        this.toggleFavorite(videoId, !isFavorite);
                    };
                }
            }

            // Update curation button if visible
            this.updateCurationFavoriteButton();

        } catch (error) {
            console.error('Error toggling favorite:', error);
            console.log(`Failed to toggle favorite: ${error.message}`)
        }
    }

    // ==================== DELETE VIDEO ====================

    async deleteVideo(videoId, videoName) { return this.videoOps.deleteVideo(videoId, videoName) }
    async permanentDeleteVideo(videoId, videoName) { return this.videoOps.permanentDeleteVideo(videoId, videoName) }
    permanentDeleteVideoFromContext() { this.videoOps.permanentDeleteVideoFromContext() }

    // ==================== BULK OPERATIONS ====================

    toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;

        const videoGrid = document.getElementById('videoGrid');

        if (this.selectionMode) {
            videoGrid.classList.add('selection-mode');
            console.log('Selection mode enabled')
        } else {
            videoGrid.classList.remove('selection-mode');
            this.selectedVideos.clear();
            this.updateBulkActionsBar();
            this.renderVideoGrid();
        }

        // Update menu toggle switch
        this.updateSelectionModeRadio();
    }

    toggleVerticalMode() {
        this.verticalMode = !this.verticalMode;

        // Apply to main video grid
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            if (this.verticalMode) {
                videoGrid.classList.add('vertical-mode');
            } else {
                videoGrid.classList.remove('vertical-mode');
            }
        }

        // Apply to all video grids in folder explorer
        const explorerGrids = document.querySelectorAll('.folder-explorer .video-grid');
        explorerGrids.forEach(grid => {
            if (this.verticalMode) {
                grid.classList.add('vertical-mode');
            } else {
                grid.classList.remove('vertical-mode');
            }
        });

        // Update menu toggle switch
        this.updateVerticalModeRadio();

        // Save preference
        this.saveSettingsToStorage();
    }

    toggleVideoSelection(videoId) {
        // Validate videoId
        if (videoId === null || videoId === undefined) {
            console.error('❌ toggleVideoSelection called with null/undefined videoId');
            return;
        }

        if (this.selectedVideos.has(videoId)) {
            this.selectedVideos.delete(videoId);
        } else {
            this.selectedVideos.add(videoId);
        }

        // Update the card's selected state
        const card = document.querySelector(`[data-video-id="${videoId}"]`);
        if (card) {
            if (this.selectedVideos.has(videoId)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        }

        this.updateBulkActionsBar();
    }

    updateBulkActionsBar() {
        const bar = document.getElementById('bulkActionsBar');
        const count = document.getElementById('selectionCount');

        if (this.selectedVideos.size > 0) {
            bar.style.display = 'block';
            count.textContent = `${this.selectedVideos.size} selected`;
        } else {
            bar.style.display = 'none';
        }
    }

    selectAllVideos() {
        // Filter out null videos and those without IDs
        const validVideos = this.videos.filter(video => video && video.id !== null && video.id !== undefined);

        validVideos.forEach(video => {
            this.selectedVideos.add(video.id);
        });

        // Clean up the videos array if we found null entries
        if (validVideos.length < this.videos.length) {
            console.warn(`⚠️ Found ${this.videos.length - validVideos.length} null/invalid videos in array, cleaning up...`);
            this.videos = validVideos;
        }

        this.renderVideoGrid();
        this.updateBulkActionsBar();
    }

    deselectAllVideos() {
        this.selectedVideos.clear();
        this.renderVideoGrid();
        this.updateBulkActionsBar();
    }

    cancelSelection() {
        this.selectionMode = false;
        this.selectedVideos.clear();

        const videoGrid = document.getElementById('videoGrid');
        videoGrid.classList.remove('selection-mode');

        this.updateBulkActionsBar();
        this.renderVideoGrid();
        this.updateSelectionModeRadio();
    }

    async showBulkTagModal() {
        if (this.selectedVideos.size === 0) {
            console.log('No videos selected')
            return;
        }

        const tagName = prompt(`Add tag to ${this.selectedVideos.size} videos:\n\nEnter tag name:`);
        if (!tagName || !tagName.trim()) return;

        await this.performBulkTag(tagName.trim());
    }

    async performBulkTag(tagName) {
        const videoIds = Array.from(this.selectedVideos);
        const total = videoIds.length;
        let completed = 0;
        let failed = 0;

        console.log(`Adding tag "${tagName}" to ${total} videos...`)

        // Process in parallel with limit
        const batchSize = 5;
        for (let i = 0; i < videoIds.length; i += batchSize) {
            const batch = videoIds.slice(i, i + batchSize);
            const promises = batch.map(async (videoId) => {
                try {
                    const response = await fetch(`${this.apiBase}/videos/${videoId}/tags`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ tag_name: tagName })
                    });

                    if (response.ok) {
                        completed++;
                        // Update local video data
                        const video = this.videos.find(v => v.id === videoId) ||
                            this.allVideos.find(v => v.id === videoId);
                        if (video) {
                            const data = await response.json();
                            if (!video.tags) video.tags = [];
                            if (!video.tags.find(t => t.name === tagName)) {
                                video.tags.push(data.tag);
                            }
                        }
                    } else {
                        failed++;
                    }
                } catch (error) {
                    console.error(`Failed to tag video ${videoId}:`, error);
                    failed++;
                }
            });

            await Promise.all(promises);

            // Update progress
            const progress = Math.round(((completed + failed) / total) * 100);
            console.log(`Progress: ${progress}% (${completed} success, ${failed} failed)`);
        }

        // Refresh display
        await this.loadAllTags();
        this.renderVideoGrid();

        if (failed === 0) {
            console.log(`✅ Successfully tagged ${completed} videos with "${tagName}"`)
        } else {
            console.log(`⚠️ Tagged ${completed} videos, ${failed} failed`)
        }
    }

    async showBulkMoveModal() {
        if (this.selectedVideos.size === 0) {
            console.log('No videos selected')
            return;
        }

        // Use the same move modal with folder autocomplete
        this.currentMoveVideo = null; // Indicate bulk move mode

        // Update modal title to show bulk operation
        const modalTitle = document.querySelector('#moveModal h3');
        modalTitle.textContent = `Move ${this.selectedVideos.size} videos`;

        // Clear previous input
        const folderInput = document.getElementById('folderInput');
        folderInput.value = '';

        // Setup autocomplete for folder input
        this.setupFolderAutocomplete();

        // Populate folder suggestions
        this.updateFolderSuggestionsFiltered('');

        document.getElementById('moveModal').style.display = 'flex';
        folderInput.focus();
    }

    async performBulkMove(targetCategory, targetSubcategory = null) {
        // Filter out any null/undefined IDs and ensure they're numbers
        const videoIds = Array.from(this.selectedVideos).filter(id => id !== null && id !== undefined);

        if (videoIds.length === 0) {
            console.log('❌ No valid videos selected')
            return;
        }

        const total = videoIds.length;
        let completed = 0;
        let failed = 0;

        console.log(`📦 Starting bulk move of ${total} videos:`, videoIds);

        const displayPath = targetSubcategory ? `${targetCategory}/${targetSubcategory}` : targetCategory;
        console.log(`Moving ${total} videos to "${displayPath}"...`)

        this.hideMoveModal(); // Close modal while processing

        // Process sequentially to avoid filesystem conflicts
        for (const videoId of videoIds) {
            try {
                console.log(`Moving video ID: ${videoId} (type: ${typeof videoId})`);

                const response = await fetch(`${this.apiBase}/videos/${videoId}/move`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        target_category: targetCategory,
                        target_subcategory: targetSubcategory
                    })
                });

                if (response.ok) {
                    completed++;
                    console.log(`✅ Successfully moved video ${videoId}`);
                    // Remove video from view without pagination reset
                    this.removeVideoFromView(videoId);
                } else {
                    // Parse error response
                    const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                    failed++;
                    const errorMsg = errorData.detail || `HTTP ${response.status}`;
                    console.error(`❌ Failed to move video ${videoId}: ${errorMsg}`);
                    console.log(`Failed to move video (ID: ${videoId}): ${errorMsg}`)
                }
            } catch (error) {
                console.error(`❌ Error moving video ${videoId}:`, error);
                failed++;
                console.log(`Error moving video (ID: ${videoId}): ${error.message}`)
            }

            // Update progress
            const progress = Math.round(((completed + failed) / total) * 100);
            console.log(`Progress: ${progress}% (${completed} success, ${failed} failed)`);
        }

        // Only reload folder structure in explorer view at root level
        if (this.currentView === 'explorer' && !this.currentCategory) {
            this.renderFolderExplorer();
        }

        // Clear selection after move
        this.selectedVideos.clear();
        this.updateBulkActionsBar();

        if (failed === 0) {
            console.log(`✅ Successfully moved ${completed} videos to "${displayPath}"`)
        } else {
            console.log(`⚠️ Moved ${completed} videos, ${failed} failed`)
        }
    }

    // ==================== BULK DELETE ====================

    showBulkDeleteModal() {
        if (this.selectedVideos.size === 0) {
            console.log('No videos selected')
            return;
        }

        // Check if any selected videos are in DELETE folder
        const videosInDeleteFolder = Array.from(this.selectedVideos).filter(videoId => {
            const video = this.videos.find(v => v.id === videoId) || this.allVideos.find(v => v.id === videoId);
            return video && video.category === 'DELETE';
        });

        const allInDeleteFolder = videosInDeleteFolder.length === this.selectedVideos.size;
        const hasDeleteFolderVideos = videosInDeleteFolder.length > 0;
        const nonDeleteVideos = this.selectedVideos.size - videosInDeleteFolder.length;

        // If ALL videos are in DELETE folder, only show permanent delete
        if (allInDeleteFolder) {
            const modalHtml = `
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
                " id="bulkDeleteModal" onclick="if(event.target.id==='bulkDeleteModal') this.remove();">
                    <div style="
                        background: white;
                        border-radius: 12px;
                        padding: 24px;
                        max-width: 450px;
                        width: 90%;
                        box-shadow: 0 20px 25px rgba(0,0,0,0.15);
                    " onclick="event.stopPropagation();">
                        <h3 style="margin-top: 0; margin-bottom: 16px; color: #DC2626;">
                            ⚠️ PERMANENT DELETION
                        </h3>
                        <p style="margin: 12px 0; color: #6b7280; font-size: 14px;">
                            This will permanently delete ${this.selectedVideos.size} video${this.selectedVideos.size > 1 ? 's' : ''} from disk and database.
                        </p>
                        <p style="margin: 12px 0; color: #DC2626; font-weight: bold; font-size: 13px;">
                            ⚠️ This action CANNOT be undone!
                        </p>

                        <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
                            <button 
                                onclick="document.getElementById('bulkDeleteModal').remove()" 
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
                                onclick="app.performBulkDelete('permanent')" 
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
                                Yes, Delete Permanently
                            </button>
                        </div>
                    </div>
                </div>
            `;

            const modal = document.createElement('div');
            modal.innerHTML = modalHtml;
            document.body.appendChild(modal.firstElementChild);
            return;
        }

        // If SOME or NONE are in DELETE folder, show both options
        const modalHtml = `
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
            " id="bulkDeleteModal" onclick="if(event.target.id==='bulkDeleteModal') this.remove();">
                <div style="
                    background: white;
                    border-radius: 12px;
                    padding: 24px;
                    max-width: 450px;
                    width: 90%;
                    box-shadow: 0 20px 25px rgba(0,0,0,0.15);
                " onclick="event.stopPropagation();">
                    <h3 style="margin-top: 0; margin-bottom: 16px; color: #111827;">
                        🗑️ Delete ${this.selectedVideos.size} Video${this.selectedVideos.size > 1 ? 's' : ''}?
                    </h3>
                    <p style="margin: 12px 0; color: #6b7280; font-size: 14px;">
                        Choose how to delete:
                    </p>

                    <div style="
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        margin: 20px 0;
                    ">
                        <button style="
                            padding: 12px 16px;
                            background: #EF4444;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                            text-align: left;
                        " onclick="app.performBulkDelete('trash')">
                            🗑️ Move to Trash
                            <div style="font-size: 12px; font-weight: normal; margin-top: 4px; color: rgba(255,255,255,0.8);">
                                ${nonDeleteVideos} video${nonDeleteVideos !== 1 ? 's' : ''} will be moved to DELETE folder (reversible)
                            </div>
                        </button>

                        ${hasDeleteFolderVideos ? `
                        <button style="
                            padding: 12px 16px;
                            background: #DC2626;
                            color: white;
                            border: none;
                            border-radius: 6px;
                            cursor: pointer;
                            font-size: 14px;
                            font-weight: 500;
                            text-align: left;
                        " onclick="app.performBulkDelete('permanent')">
                            ⚠️ Delete Permanently
                            <div style="font-size: 12px; font-weight: normal; margin-top: 4px; color: rgba(255,255,255,0.8);">
                                ${videosInDeleteFolder.length} video${videosInDeleteFolder.length !== 1 ? 's' : ''} from DELETE folder (irreversible!)
                            </div>
                        </button>
                        ` : ''}
                    </div>

                    <p style="margin: 12px 0; color: #9CA3AF; font-size: 12px;">
                        💡 Tip: Move to Trash first, then use "Delete Permanently" option if you're sure
                    </p>

                    <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;">
                        <button 
                            onclick="document.getElementById('bulkDeleteModal').remove()" 
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
                    </div>
                </div>
            </div>
        `;

        const modal = document.createElement('div');
        modal.innerHTML = modalHtml;
        document.body.appendChild(modal.firstElementChild);
    }

    async performBulkDelete(deleteType) {
        const videoIds = Array.from(this.selectedVideos);
        const total = videoIds.length;
        let completed = 0;
        let failed = 0;

        // Close modal
        const modal = document.getElementById('bulkDeleteModal');
        if (modal) modal.remove();

        if (deleteType === 'trash') {
            console.log(`Moving ${total} videos to DELETE folder...`)

            // Process sequentially
            for (const videoId of videoIds) {
                try {
                    const response = await fetch(`${this.apiBase}/videos/${videoId}/delete`, {
                        method: 'POST'
                    });

                    if (response.ok) {
                        completed++;
                        this.removeVideoFromView(videoId);
                    } else {
                        failed++;
                        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                        console.log(`Failed to delete video: ${errorData.detail}`)
                    }
                } catch (error) {
                    failed++;
                    console.log(`Error: ${error.message}`)
                }
            }

            if (failed === 0) {
                console.log(`✅ Moved ${completed} videos to DELETE folder`)
            } else {
                console.log(`⚠️ Moved ${completed} videos, ${failed} failed`)
            }

        } else if (deleteType === 'permanent') {
            // Get only videos in DELETE folder
            const deleteVideos = videoIds.filter(vid => {
                const video = this.videos.find(v => v.id === vid) || this.allVideos.find(v => v.id === vid);
                return video && video.category === 'DELETE';
            });

            if (deleteVideos.length === 0) {
                console.log('No videos in DELETE folder to permanently delete')
                return;
            }

            console.log(`Permanently deleting ${deleteVideos.length} videos...`)

            // Process sequentially
            for (const videoId of deleteVideos) {
                try {
                    const response = await fetch(`${this.apiBase}/videos/${videoId}/delete-permanent`, {
                        method: 'POST'
                    });

                    if (response.ok) {
                        completed++;
                        this.removeVideoFromView(videoId);
                    } else {
                        failed++;
                        const errorData = await response.json().catch(() => ({ detail: 'Unknown error' }));
                        console.log(`Failed to permanently delete video: ${errorData.detail}`)
                    }
                } catch (error) {
                    failed++;
                    console.log(`Error: ${error.message}`)
                }
            }

            if (failed === 0) {
                console.log(`✅ Permanently deleted ${completed} videos`)
            } else {
                console.log(`⚠️ Permanently deleted ${completed} videos, ${failed} failed`)
            }
        }

        // Clear selection
        this.selectedVideos.clear();
        this.updateBulkActionsBar();
    }

    // ==================== BULK EDIT METADATA ====================

    showBulkEditModal() {
        if (this.selectedVideos.size === 0) {
            console.log('No videos selected')
            return;
        }

        // Update video count
        document.getElementById('bulkEditVideoCount').textContent = this.selectedVideos.size;

        // Clear common fields
        document.getElementById('bulkSeries').value = '';
        document.getElementById('bulkChannel').value = '';
        document.getElementById('bulkSeason').value = '';
        document.getElementById('bulkYear').value = '';
        document.getElementById('bulkRating').value = '';
        document.getElementById('bulkFavorite').checked = false;

        // Populate individual video list
        const videosList = document.getElementById('bulkEditVideosList');
        videosList.innerHTML = '';

        Array.from(this.selectedVideos).forEach(videoId => {
            const video = this.videos.find(v => v.id === videoId) ||
                this.allVideos.find(v => v.id === videoId);
            if (!video) return;

            const item = document.createElement('div');
            item.className = 'bulk-edit-video-item';
            item.dataset.videoId = videoId;

            item.innerHTML = `
                <div class="bulk-edit-video-header">
                    <div class="bulk-edit-video-name" title="${video.display_name || video.name}">
                        ${video.display_name || video.name}
                    </div>
                </div>
                <div class="bulk-edit-video-fields">
                    <div class="bulk-edit-field-group">
                        <label>Episode:</label>
                        <input type="text" class="bulk-edit-episode" placeholder="e.g., E01"
                               value="${video.episode || ''}">
                    </div>
                    <div class="bulk-edit-field-group">
                        <label>Rename File:</label>
                        <input type="text" class="bulk-edit-filename" placeholder="New filename (optional)"
                               value="">
                    </div>
                </div>
            `;

            videosList.appendChild(item);
        });

        // Show modal
        document.getElementById('bulkEditModal').style.display = 'flex';

        // Focus first input
        const firstInput = document.getElementById('bulkSeries');
        if (firstInput) {
            setTimeout(() => firstInput.focus(), 100);
        }
    }

    hideBulkEditModal() {
        document.getElementById('bulkEditModal').style.display = 'none';
        document.getElementById('bulkEditPreview').style.display = 'none';
    }

    async saveBulkEdit() {
        try {
            // Collect common fields
            const commonFields = {};

            const bulkSeries = document.getElementById('bulkSeries').value.trim();
            if (bulkSeries) commonFields.series = bulkSeries;

            const bulkChannel = document.getElementById('bulkChannel').value.trim();
            if (bulkChannel) commonFields.channel = bulkChannel;

            const bulkSeason = document.getElementById('bulkSeason').value;
            if (bulkSeason) commonFields.season = parseInt(bulkSeason);

            const bulkYear = document.getElementById('bulkYear').value;
            if (bulkYear) commonFields.year = parseInt(bulkYear);

            const bulkRating = document.getElementById('bulkRating').value;
            if (bulkRating) commonFields.rating = parseFloat(bulkRating);

            const bulkFavorite = document.getElementById('bulkFavorite').checked;
            if (bulkFavorite) commonFields.favorite = true;

            // Collect individual video updates
            const videos = [];
            const videoItems = document.querySelectorAll('.bulk-edit-video-item');

            videoItems.forEach(item => {
                const videoId = parseInt(item.dataset.videoId);
                const episodeInput = item.querySelector('.bulk-edit-episode');
                const filenameInput = item.querySelector('.bulk-edit-filename');

                const videoUpdate = { id: videoId };

                // Episode (individual override)
                const episode = episodeInput.value.trim();
                if (episode) {
                    videoUpdate.episode = episode;
                }

                // Filename rename (individual only)
                const newFilename = filenameInput.value.trim();
                if (newFilename) {
                    videoUpdate.new_name = newFilename;
                }

                videos.push(videoUpdate);
            });

            // Prepare request body
            const requestBody = {
                common_fields: commonFields,
                videos: videos
            };

            console.log('📤 Bulk update request:', requestBody);

            // Show loading state
            const confirmBtn = document.getElementById('confirmBulkEditBtn');
            const originalText = confirmBtn.textContent;
            confirmBtn.textContent = 'Saving...';
            confirmBtn.disabled = true;

            // Send bulk update request
            const response = await fetch(`${this.apiBase}/api/videos/bulk-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw new Error(`Bulk update failed: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();
            console.log('✅ Bulk update result:', result);

            // Restore button state
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;

            // Close modal
            this.hideBulkEditModal();

            // Show success message
            const updated = result.updated_count || 0;
            const failed = result.failed_count || 0;

            if (failed === 0) {
                console.log(`✅ Successfully updated ${updated} videos`)
            } else {
                console.log(`⚠️ Updated ${updated} videos, ${failed} failed`)
                console.error('Failed videos:', result.failed_videos);
            }

            // Refresh metadata suggestions cache (series, channel, year autocomplete)
            await this.loadMetadataSuggestions();

            // Refresh video display
            if (this.currentView === 'list') {
                await this.loadAllVideosFlat();
            } else if (this.currentView === 'explorer') {
                if (this.currentCategory) {
                    await this.loadAndShowVideosInFolder(this.currentCategory, this.currentSubcategory);
                } else {
                    this.renderFolderExplorer();
                }
            }

            // Clear selection
            this.selectedVideos.clear();
            this.updateBulkActionsBar();

        } catch (error) {
            console.error('❌ Error saving bulk edit:', error);
            console.log(`Failed to save changes: ${error.message}`)

            // Restore button state
            const confirmBtn = document.getElementById('confirmBulkEditBtn');
            confirmBtn.textContent = 'Save All';
            confirmBtn.disabled = false;
        }
    }

    // ==================== TAG MANAGEMENT ====================

    async cleanupUnusedTags() {
        if (!confirm('Delete all tags that are not assigned to any videos?')) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/tags/unused`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to cleanup unused tags');
            }

            const result = await response.json();
            console.log(`✅ ${result.message}`)

            // Reload tags and refresh UI
            await this.loadAllTags();
        } catch (error) {
            console.error('Error cleaning up unused tags:', error);
            console.log('❌ Failed to cleanup unused tags')
        }
    }

    // ==================== CLEAR METADATA ====================

    showClearMetadataConfirmation() {
        // Show confirmation with warning about clearing fields
        const message = `⚠️ WARNING: This will clear the following fields from ALL videos in your collection:

• Series
• Season
• Episode
• Channel
• Year

This action cannot be undone. Continue?`;

        if (!confirm(message)) {
            return;
        }

        // Double confirmation for destructive action
        const doubleConfirm = confirm('Are you absolutely sure? This will affect ALL videos.');
        if (!doubleConfirm) {
            return;
        }

        this.clearAllMetadata();
    }

    async clearAllMetadata() {
        try {
            console.log('🧹 Clearing metadata from all videos...');

            // Show loading toast
            console.log('🧹 Clearing metadata from all videos...')

            // Get all video IDs from current videos (with cache-busting)
            const timestamp = Date.now();
            const response = await fetch(`${this.apiBase}/search?q=&_t=${timestamp}`, {
                headers: {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });
            if (!response.ok) {
                throw new Error('Failed to fetch videos');
            }

            const allVideos = await response.json();
            console.log(`📊 Found ${allVideos.length} videos to update`);

            // Prepare bulk update request with null values to clear fields
            const requestBody = {
                common_fields: {
                    series: null,
                    season: null,
                    episode: null,
                    channel: null,
                    year: null
                },
                videos: allVideos.map(v => ({ id: v.id }))
            };

            // Send bulk update request
            const updateResponse = await fetch(`${this.apiBase}/api/videos/bulk-update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!updateResponse.ok) {
                throw new Error(`Bulk update failed: ${updateResponse.status} ${updateResponse.statusText}`);
            }

            const result = await updateResponse.json();
            console.log('✅ Clear metadata result:', result);

            // Show success message
            const updated = result.updated_count || 0;
            const failed = result.failed_count || 0;

            if (failed === 0) {
                console.log(`✅ Successfully cleared metadata from ${updated} videos`)
            } else {
                console.log(`⚠️ Cleared ${updated} videos, ${failed} failed`)
                console.error('Failed videos:', result.failed_videos);
            }

            // Refresh video display
            if (this.currentView === 'list') {
                await this.loadAllVideosFlat();
            } else if (this.currentView === 'explorer') {
                if (this.currentCategory) {
                    await this.loadAndShowVideosInFolder(this.currentCategory, this.currentSubcategory);
                } else {
                    this.renderFolderExplorer();
                }
            }

            // Reload filter suggestions to clear series/channel/year filter options
            await this.loadMetadataSuggestions();

        } catch (error) {
            console.error('❌ Error clearing metadata:', error);
            console.log(`Failed to clear metadata: ${error.message}`)
        }
    }

    // Actions Menu Methods
    toggleActionsMenu() {
        const menu = document.getElementById('actionsMenu');
        if (menu.style.display === 'none') {
            this.showActionsMenu();
        } else {
            this.hideActionsMenu();
        }
    }

    showActionsMenu() {
        const menu = document.getElementById('actionsMenu');
        menu.style.display = 'block';
        this.updateMenuInfo();
        this.updateSelectionModeRadio();
        this.updateVerticalModeRadio();
    }

    hideActionsMenu() {
        const menu = document.getElementById('actionsMenu');
        menu.style.display = 'none';
        this.hideSortSubmenu();
    }

    toggleSortSubmenu() {
        const submenu = document.getElementById('sortSubmenu');
        if (submenu.style.display === 'none') {
            this.showSortSubmenu();
        } else {
            this.hideSortSubmenu();
        }
    }

    showSortSubmenu() {
        const submenu = document.getElementById('sortSubmenu');
        const arrow = document.getElementById('sortSubmenuArrow');
        submenu.style.display = 'block';
        arrow.classList.add('open');
        this.updateSortSubmenuSelection();
    }

    hideSortSubmenu() {
        const submenu = document.getElementById('sortSubmenu');
        const arrow = document.getElementById('sortSubmenuArrow');
        if (submenu) {
            submenu.style.display = 'none';
        }
        if (arrow) {
            arrow.classList.remove('open');
        }
    }

    updateSortSubmenuSelection() {
        // Highlight the currently selected sort option
        document.querySelectorAll('.actions-submenu-item').forEach(item => {
            const sortValue = item.getAttribute('data-sort');
            if (sortValue === this.currentSort) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    applySortOption(sortValue) {
        this.currentSort = sortValue;
        this.applySorting();
        this.saveSettingsToStorage();

        // Update the menu label
        const sortLabel = document.getElementById('menuSortLabel');
        const sortNames = {
            'random': 'Random',
            'name-asc': 'Name (A-Z)',
            'name-desc': 'Name (Z-A)',
            'newest': 'Newest First',
            'modified': 'Recently Modified',
            'size-desc': 'Largest First',
            'duration-desc': 'Longest First'
        };
        sortLabel.textContent = sortNames[sortValue] || 'Random';

        // Also update the standalone dropdown if it exists
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = sortValue;
        }
    }

    updateSelectionModeRadio() {
        const toggle = document.getElementById('menuSelectionModeToggle');
        if (toggle) {
            // Update toggle switch: add 'active' class when on, remove when off
            if (this.selectionMode) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
        }
    }

    updateVerticalModeRadio() {
        const toggle = document.getElementById('menuVerticalModeToggle');
        if (toggle) {
            // Update toggle switch: add 'active' class when on, remove when off
            if (this.verticalMode) {
                toggle.classList.add('active');
            } else {
                toggle.classList.remove('active');
            }
        }
    }

    async updateMenuInfo() {
        // Update mode info
        try {
            const modeResponse = await fetch('/mode');
            const modeData = await modeResponse.json();
            const modeInfo = document.getElementById('menuModeInfo');
            modeInfo.textContent = modeData.local_mode_enabled ? 'Local' : 'Stream';
        } catch (error) {
            console.error('Error fetching mode info:', error);
        }

        // Update thumbnail cache info
        try {
            const thumbResponse = await fetch('/thumbnails/stats');
            const thumbData = await thumbResponse.json();
            const thumbInfo = document.getElementById('menuThumbnailInfo');
            thumbInfo.textContent = `${thumbData.thumbnail_count} (${thumbData.cache_size_mb.toFixed(1)} MB)`;
        } catch (error) {
            console.error('Error fetching thumbnail stats:', error);
        }

        // Update fingerprint library info
        try {
            const fingerprintResponse = await fetch(`${this.apiBase}/api/fingerprints/stats`);
            const fingerprintData = await fingerprintResponse.json();
            const fingerprintInfo = document.getElementById('menuFingerprintInfo');
            if (fingerprintInfo) {
                fingerprintInfo.innerHTML = `
                    <span class="info-label">Library:</span>
                    <span>${fingerprintData.fingerprinted} / ${fingerprintData.total_videos} (${fingerprintData.coverage_percent}%)</span>
                `;
            }
        } catch (error) {
            console.error('Error fetching fingerprint stats:', error);
        }
    }

    // ==================== FINGERPRINT FUNCTIONS (delegated to FingerprintModule) ====================

    async addFingerprintToLibrary(videoId) { await this.fingerprint.addFingerprintToLibrary(videoId) }
    async removeFingerprintFromLibrary(videoId) { await this.fingerprint.removeFingerprintFromLibrary(videoId) }
    async toggleFinalStatus(videoId) { await this.fingerprint.toggleFinalStatus(videoId) }
    async checkIfDuplicate(videoId) { await this.fingerprint.checkIfDuplicate(videoId) }

    showSimilarVideosModal(originalVideo, matches) { this.fingerprint.showSimilarVideosModal(originalVideo, matches) }
    async tagSimilarGroup() { await this.fingerprint.tagSimilarGroup() }
    async mergeGroupsAndTag(newVideoIds, existingDupTags) { await this.fingerprint.mergeGroupsAndTag(newVideoIds, existingDupTags) }
    hideSimilarVideosModal() { this.fingerprint.hideSimilarVideosModal() }

    // ====================================
    // DUPLICATES REVIEW VIEW - All Tagged Duplicate Groups
    // ====================================

    async showDuplicatesReviewView() {
        console.log('📋 Entering Duplicates Review View');

        // Save current state
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

        // Set flag
        this.duplicatesReviewActive = true;

        // Hide collection/explorer views
        document.getElementById('videoGrid').style.display = 'none';
        document.getElementById('folderExplorer').style.display = 'none';
        document.getElementById('seriesView').style.display = 'none';
        document.getElementById('listViewControls').style.display = 'none';
        document.getElementById('categories').style.display = 'none';
        document.getElementById('breadcrumbNav').style.display = 'none';

        // Show duplicates review view
        document.getElementById('duplicatesReviewView').style.display = 'flex';

        // Load and display duplicate groups
        await this.loadDuplicatesReviewData();
    }

    async loadDuplicatesReviewData() {
        try {
            console.log('Loading duplicate groups...')

            // Fetch all tags and filter for dup-* tags
            const tagsResponse = await fetch(`${this.apiBase}/tags`);
            const allTags = await tagsResponse.json();
            const dupTags = allTags.filter(tag => tag.name.startsWith('dup-'));

            if (dupTags.length === 0) {
                console.log('No duplicate groups found')
                this.exitDuplicatesReviewView();
                return;
            }

            console.log(`Found ${dupTags.length} duplicate tags`);

            // Fetch videos for each dup tag
            const groups = [];
            for (const tag of dupTags) {
                const videosResponse = await fetch(`${this.apiBase}/search?tags=${encodeURIComponent(tag.name)}`);
                if (videosResponse.ok) {
                    const videos = await videosResponse.json();
                    console.log(`✓ Tag ${tag.name}: found ${videos.length} videos`);
                    if (videos.length > 0) {
                        // Calculate similarity percentages (first video is REF at 100%)
                        const videosWithSimilarity = videos.map((video, index) => ({
                            ...video,
                            similarity_percent: index === 0 ? 100 : 95 - (index * 2) // Approximate similarity
                        }));

                        groups.push({
                            tag: tag,
                            count: videos.length,
                            videos: videosWithSimilarity
                        });
                    } else {
                        console.warn(`⚠️ Tag ${tag.name} exists but has no videos (empty result)`);
                    }
                } else {
                    const errorText = await videosResponse.text();
                    console.error(`✗ Tag ${tag.name}: ${videosResponse.status} ${videosResponse.statusText}`, errorText);
                }
            }

            // Sort groups by video count (largest first)
            groups.sort((a, b) => b.count - a.count);

            // Store data
            this.duplicatesReviewData = {
                groups: groups,
                totalGroups: groups.length,
                totalVideos: groups.reduce((sum, g) => sum + g.count, 0)
            };

            // Render the view
            this.renderDuplicatesReviewView();

            console.log(`Found ${groups.length} duplicate groups with ${this.duplicatesReviewData.totalVideos} videos`)

        } catch (error) {
            console.error('Error loading duplicates review data:', error);
            console.log('Failed to load duplicate groups')
            this.duplicatesReviewActive = false;
        }
    }

    renderDuplicatesReviewView() { this.duplicateModule.renderDuplicatesReviewView() }
    exitDuplicatesReviewView() { this.duplicateModule.exitDuplicatesReviewView() }

    enterDuplicateView(originalVideo, matches) {
        // Save current state before entering duplicate view
        this.previousViewState = {
            videos: [...this.videos],
            allVideos: [...this.allVideos],
            currentSearchQuery: this.currentSearchQuery,
            currentTagFilter: this.currentTagFilter,
            currentFolderFilter: [...this.currentFolderFilter],
            currentSort: this.currentSort,
            // Save view state to restore properly
            currentView: this.currentView,
            currentCategory: this.currentCategory,
            currentSubcategory: this.currentSubcategory
        };

        // Store duplicate view data
        this.duplicateViewActive = true;
        this.duplicateViewData = {
            originalVideo: originalVideo,
            matches: matches
        };

        // Render the duplicate view
        this.renderDuplicateView();

        // Remove "Load More" button when entering duplicate view
        this.updateLoadMoreButton();
    }

    async exitDuplicateView() {
        this.duplicateViewActive = false;
        this.duplicateViewData = null;

        // Remove the banner
        const existingBanner = document.getElementById('duplicateBanner');
        if (existingBanner) {
            existingBanner.remove();
        }

        // Reset videoGrid display back to grid layout
        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            videoGrid.style.display = 'grid';
        }

        // Show list view controls again
        const listViewControls = document.getElementById('listViewControls');
        if (listViewControls && this.currentView === 'list') {
            listViewControls.style.display = 'flex';
        }

        // Restore previous view state if available
        if (this.previousViewState) {
            console.log('📋 Restoring previous view state:', this.previousViewState);

            this.videos = this.previousViewState.videos || [];
            this.allVideos = this.previousViewState.allVideos || [];
            this.currentSearchQuery = this.previousViewState.currentSearchQuery || '';
            this.currentTagFilter = this.previousViewState.currentTagFilter || '';
            this.currentFolderFilter = this.previousViewState.currentFolderFilter || [];
            this.currentSort = this.previousViewState.currentSort || 'newest';

            // Restore view state (Explorer vs Collection)
            const previousView = this.previousViewState.currentView;
            const previousCategory = this.previousViewState.currentCategory;
            const previousSubcategory = this.previousViewState.currentSubcategory;

            // Restore UI controls
            const searchInput = document.getElementById('searchInput');
            const tagFilter = document.getElementById('tagFilter');
            const sortSelect = document.getElementById('sortSelect');
            if (searchInput) searchInput.value = this.currentSearchQuery;
            if (tagFilter) tagFilter.value = this.currentTagFilter;
            if (sortSelect) sortSelect.value = this.currentSort;

            // Clear saved state
            this.previousViewState = null;

            // Restore the exact view we were in before
            if (previousView === 'explorer' && previousCategory) {
                console.log(`📋 Restoring Explorer view: ${previousCategory}${previousSubcategory ? '/' + previousSubcategory : ''}`);
                // Switch back to explorer view
                this.switchView('explorer', false);
                // Navigate back to the folder we were viewing
                if (previousSubcategory) {
                    await this.navigateToSubcategory(previousCategory, previousSubcategory);
                } else {
                    await this.loadAndShowVideosInFolder(previousCategory, null);
                }
            } else {
                // Just re-render in current (list) view
                // Force reset pagination to ensure duplicate group structure is fully cleared
                document.getElementById('videoGrid').innerHTML = '';
                this.renderVideoGrid();
            }
        } else {
            // Fallback: reload all videos (collection view)
            console.log('📋 No previous state - reloading all videos');
            this.currentSearchQuery = '';
            this.currentTagFilter = '';
            this.currentFolderFilter = [];
            await this.loadVideos();
        }

        // Restore "Load More" button if appropriate
        this.updateLoadMoreButton();
    }

    async findDuplicatesInFolder(folderName) { await this.duplicateModule.findDuplicatesInFolder(folderName) }

    showDuplicateGroupsView(data) {
        // Save current state BEFORE switching views
        this.previousViewState = {
            videos: [...this.videos],
            allVideos: [...this.allVideos],
            currentSearchQuery: this.currentSearchQuery,
            currentTagFilter: this.currentTagFilter,
            currentFolderFilter: [...this.currentFolderFilter],
            currentSort: this.currentSort,
            // Save view state to restore properly
            currentView: this.currentView,
            currentCategory: this.currentCategory,
            currentSubcategory: this.currentSubcategory
        };

        // Set a flag to prevent loading videos during view switch
        this.skipLoadingVideosOnSwitch = true;

        // Switch to collection view if not already
        if (this.currentView !== 'list') {
            this.switchView('list', false);
        }

        // Clear the flag after view switch
        this.skipLoadingVideosOnSwitch = false;

        // Hide search controls
        const listViewControls = document.getElementById('listViewControls');
        if (listViewControls) {
            listViewControls.style.display = 'none';
        }

        // Store groups data (don't flatten)
        this.duplicateViewActive = true;
        this.duplicateViewData = {
            isMultiGroup: true,
            groups: data.duplicate_groups,
            totalGroups: data.total_groups,
            totalVideos: data.total_duplicates
        };

        // Render grouped view
        this.renderDuplicateGroupsView();
        this.renderDuplicateGroupsBanner(data);

        // Remove "Load More" button when showing duplicate groups
        this.updateLoadMoreButton();

        console.log(`Found ${data.total_groups} duplicate groups with ${data.total_duplicates} total videos`)
    }

    renderDuplicateGroupsView() {
        const videoGrid = document.getElementById('videoGrid');
        if (!videoGrid) return;

        // Clear existing content
        videoGrid.innerHTML = '';
        videoGrid.style.display = 'block';

        const groups = this.duplicateViewData.groups;

        // Create a container for all groups
        const groupsContainer = document.createElement('div');
        groupsContainer.className = 'duplicate-groups-container';

        groups.forEach((group, groupIndex) => {
            // Create group section
            const groupSection = document.createElement('div');
            groupSection.className = 'duplicate-group-section';

            // Generate the deterministic tag for THIS specific group
            const videoIds = group.videos.map(v => v.id);
            const expectedTagName = this.generateDuplicateTag(videoIds);

            // Check if this group already has its specific deterministic tag
            let isAlreadyTagged = false;
            for (const video of group.videos) {
                if (video.tags && video.tags.some(tag => tag.name === expectedTagName)) {
                    isAlreadyTagged = true;
                    break;
                }
            }

            // Group header
            const groupHeader = document.createElement('div');
            groupHeader.className = 'duplicate-group-header';

            let tagButtonHtml = '';
            if (isAlreadyTagged) {
                // Show "Already Tagged" indicator with the deterministic tag
                tagButtonHtml = `<span class="duplicate-group-tagged">✓ Tagged: ${expectedTagName}</span>`;
            } else {
                // Show "Tag Group" button - clickable
                tagButtonHtml = `<button class="duplicate-group-tag-btn" onclick="app.tagDuplicateGroupByIndex(${groupIndex})">🏷️ Tag Group</button>`;
            }

            groupHeader.innerHTML = `
                <div class="duplicate-group-header-left">
                    <span class="duplicate-group-number">Group ${groupIndex + 1}</span>
                    <span class="duplicate-group-count">${group.count} similar videos</span>
                </div>
                <div class="duplicate-group-header-right">
                    ${tagButtonHtml}
                </div>
            `;
            groupSection.appendChild(groupHeader);

            // Group grid for videos
            const groupGrid = document.createElement('div');
            groupGrid.className = 'duplicate-group-grid';

            group.videos.forEach((video, videoIndex) => {
                const videoWithMeta = {
                    ...video,
                    _similarity: video.similarity_percent,
                    _isOriginal: videoIndex === 0
                };
                const videoCard = this.createVideoCard(videoWithMeta);
                groupGrid.appendChild(videoCard);
            });

            groupSection.appendChild(groupGrid);
            groupsContainer.appendChild(groupSection);
        });

        videoGrid.appendChild(groupsContainer);
    }

    async tagDuplicateGroupByIndex(groupIndex) {
        const group = this.duplicateViewData.groups[groupIndex];
        if (!group) return;

        // Extract all video IDs from this group
        const videoIds = group.videos.map(v => v.id);

        // Check if any videos already have dup- tags (need to merge)
        const existingDupTags = new Set();
        group.videos.forEach(video => {
            if (video.tags) {
                video.tags.forEach(tag => {
                    if (tag.name.startsWith('dup-')) {
                        existingDupTags.add(tag.name);
                    }
                });
            }
        });

        // Generate deterministic tag based on video IDs
        const expectedTag = this.generateDuplicateTag(videoIds);

        // If videos have existing dup tags that DON'T match the expected tag, merge groups
        const hasOtherDupTags = Array.from(existingDupTags).some(tag => tag !== expectedTag);

        if (hasOtherDupTags) {
            // Merge old groups with new videos
            console.log(`Merging groups: existing tags [${Array.from(existingDupTags).join(', ')}] → new tag ${expectedTag}`);
            await this.mergeGroupsAndTag(videoIds, existingDupTags);

            // Re-render the duplicate groups view after merge
            if (this.duplicateViewData?.groups) {
                this.renderDuplicateGroupsView();
                const bannerData = {
                    total_groups: this.duplicateViewData.totalGroups,
                    total_duplicates: this.duplicateViewData.totalVideos
                };
                this.renderDuplicateGroupsBanner(bannerData);
            }
            return;
        }

        // Simple case: no conflicting tags, just tag the group
        const tagName = expectedTag;
        console.log(`Generated deterministic tag for group ${groupIndex + 1} (${videoIds.length} videos): ${tagName}`);

        // Tag all videos in this group (backend auto-generates color)
        let successCount = 0;
        for (const videoId of videoIds) {
            try {
                // Use query parameters like the working addTag() function
                const response = await fetch(`${this.apiBase}/videos/${videoId}/tags?tag_name=${encodeURIComponent(tagName)}`, {
                    method: 'POST'
                });

                if (response.ok) {
                    successCount++;
                }
            } catch (error) {
                console.error(`Failed to tag video ${videoId}:`, error);
            }
        }

        if (successCount > 0) {
            console.log(`✓ Tagged ${successCount} videos with "${tagName}"`)

            // Reload tags to get the new tag
            await this.loadAllTags();

            // Find the tag object
            const tagObj = this.allTags.find(t => t.name === tagName);

            // Update the video cards in the duplicate view to show the new tag
            if (tagObj && this.duplicateViewData?.groups) {
                // Update each video in the duplicate groups
                this.duplicateViewData.groups.forEach(group => {
                    if (group.videos) {
                        group.videos.forEach(video => {
                            if (videoIds.includes(video.id)) {
                                if (!video.tags) video.tags = [];
                                // Add tag if not already present
                                if (!video.tags.find(t => t.id === tagObj.id)) {
                                    video.tags.push(tagObj);
                                }
                            }
                        });
                    }
                });

                // Re-render the duplicate groups view to show the updated tags
                this.renderDuplicateGroupsView();

                // Re-render the banner
                const bannerData = {
                    total_groups: this.duplicateViewData.totalGroups,
                    total_duplicates: this.duplicateViewData.totalVideos
                };
                this.renderDuplicateGroupsBanner(bannerData);
            }

            // Stay in duplicate view - user can exit when ready
        } else {
            console.log('❌ Failed to tag group')
        }
    }

    renderDuplicateGroupsBanner(data) {
        const videoGrid = document.getElementById('videoGrid');

        // Remove existing banner if any
        const existingBanner = document.getElementById('duplicateBanner');
        if (existingBanner) {
            existingBanner.remove();
        }

        const banner = document.createElement('div');
        banner.id = 'duplicateBanner';
        banner.className = 'duplicate-banner';
        banner.innerHTML = `
            <div class="duplicate-banner-content">
                <div class="duplicate-banner-info">
                    <span class="duplicate-banner-icon">🔍</span>
                    <span class="duplicate-banner-text">
                        <strong>${data.total_groups} Duplicate Groups</strong> • ${data.total_duplicates} videos total
                    </span>
                </div>
                <div class="duplicate-banner-actions">
                    <button class="btn-clear-view" onclick="app.exitDuplicateView()">
                        ✕ Clear View
                    </button>
                </div>
            </div>
        `;

        // Insert banner before video grid
        videoGrid.parentNode.insertBefore(banner, videoGrid);
    }


    renderDuplicateView() {
        if (!this.duplicateViewData) return;

        const { originalVideo, matches } = this.duplicateViewData;

        // Create array of all videos to display (original + matches)
        // Add original video with 100% similarity
        const allVideos = [
            {
                ...originalVideo,
                _similarity: 100,
                _isOriginal: true
            },
            ...matches.map(match => ({
                ...match.video,
                _similarity: match.similarity_percent,
                _isOriginal: false
            }))
        ];

        // Store in this.videos for rendering
        this.videos = allVideos;

        // Hide list view controls for clean duplicate view
        const listViewControls = document.getElementById('listViewControls');
        if (listViewControls) {
            listViewControls.style.display = 'none';
        }

        // Render banner and video grid
        this.renderDuplicateBanner();
        document.getElementById('videoGrid').innerHTML = '';
        this.renderVideoGrid();
    }

    renderDuplicateBanner() {
        const videoGrid = document.getElementById('videoGrid');

        // Remove existing banner if any
        const existingBanner = document.getElementById('duplicateBanner');
        if (existingBanner) {
            existingBanner.remove();
        }

        if (!this.duplicateViewActive || !this.duplicateViewData || !videoGrid) return;

        const totalVideos = 1 + this.duplicateViewData.matches.length;

        const banner = document.createElement('div');
        banner.id = 'duplicateBanner';
        banner.className = 'duplicate-banner';
        banner.innerHTML = `
            <div class="duplicate-banner-content">
                <div class="duplicate-banner-info">
                    <span class="duplicate-banner-icon">🔍</span>
                    <span class="duplicate-banner-text">
                        Similar Videos (<strong>${totalVideos} videos</strong>)
                    </span>
                </div>
                <div class="duplicate-banner-actions">
                    <button class="btn-tag-group" onclick="app.tagDuplicateGroup()">
                        🏷️ Tag This Group
                    </button>
                    <button class="btn-clear-view" onclick="app.exitDuplicateView()">
                        ✕ Clear View
                    </button>
                </div>
            </div>
        `;

        // Insert banner before video grid
        videoGrid.parentNode.insertBefore(banner, videoGrid);
    }

    createSimilarityBadge(similarity, isOriginal) {
        const similarityClass = similarity > 95 ? 'high' : similarity > 85 ? 'medium' : 'low';
        const label = isOriginal ? 'REF' : `${similarity}%`;
        const title = isOriginal ? 'Reference video (searched)' : `${similarity}% similar`;
        return `<div class="similarity-badge ${similarityClass}" title="${title}">${label}</div>`;
    }

    generateDuplicateTag(videoIds) { return this.duplicateModule.generateDuplicateTag(videoIds) }

    async tagDuplicateGroup() {
        if (!this.duplicateViewData) return;

        const { originalVideo, matches } = this.duplicateViewData;

        // Collect all video IDs
        const allVideoIds = [
            originalVideo.id,
            ...matches.map(m => m.video.id)
        ];

        // Check if any videos already have dup- tags
        const existingDupTags = new Set();
        const allVideosData = [originalVideo, ...matches.map(m => m.video)];

        for (const video of allVideosData) {
            if (video.tags) {
                video.tags.forEach(tag => {
                    if (tag.name.startsWith('dup-')) {
                        existingDupTags.add(tag.name);
                    }
                });
            }
        }

        // If there are existing dup tags, we need to merge groups
        if (existingDupTags.size > 0) {
            await this.mergeDuplicateGroups(allVideoIds, existingDupTags);
        } else {
            // Simple case: create new tag for this group
            await this.createDuplicateTag(allVideoIds);
        }
    }

    async createDuplicateTag(videoIds) {
        const tagName = this.generateDuplicateTag(videoIds);

        console.log(`Tagging ${videoIds.length} videos with "${tagName}"...`)

        let successCount = 0;
        let failCount = 0;

        // Tag all videos
        for (const videoId of videoIds) {
            try {
                const response = await fetch(`${this.apiBase}/videos/${videoId}/tags?tag_name=${encodeURIComponent(tagName)}`, {
                    method: 'POST'
                });

                if (response.ok) {
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                console.error(`Error tagging video ${videoId}:`, error);
                failCount++;
            }
        }

        if (successCount > 0) {
            console.log(`✓ Tagged ${successCount} videos with "${tagName}"`)

            // Exit duplicate view and filter by the new tag
            await this.exitDuplicateView();

            // Reload tags to include the new tag in the dropdown
            await this.loadAllTags();

            // Apply tag filter to show the group
            this.currentTagFilter = tagName;
            const tagFilter = document.getElementById('tagFilter');
            if (tagFilter) {
                tagFilter.value = tagName;
            }

            // Trigger filter update
            await this.handleFiltersChanged();

            // Save settings
            this.saveSettingsToStorage();
        } else {
            console.log('Failed to tag videos')
        }
    }

    async mergeDuplicateGroups(newVideoIds, existingDupTags) {
        console.log('Merging duplicate groups...')

        // Fetch all videos that have any of the existing dup tags
        const allRelatedVideos = new Set(newVideoIds);

        for (const tagName of existingDupTags) {
            try {
                const response = await fetch(`${this.apiBase}/search?tags=${encodeURIComponent(tagName)}`);

                // Check if response is ok (not 404 or other error)
                if (response.ok) {
                    const data = await response.json();
                    if (Array.isArray(data)) {
                        data.forEach(video => allRelatedVideos.add(video.id));
                    }
                } else {
                    // Tag doesn't exist in backend (already deleted or never existed)
                    console.log(`Tag ${tagName} not found in backend (404), skipping fetch`);
                }
            } catch (error) {
                console.error(`Error fetching videos for tag ${tagName}:`, error);
            }
        }

        const mergedVideoIds = Array.from(allRelatedVideos);
        const newTagName = this.generateDuplicateTag(mergedVideoIds);

        console.log(`Merging into "${newTagName}" (${mergedVideoIds.length} videos)...`)

        // Track old tag IDs to delete after removing them from videos
        const oldTagIdsToDelete = new Set();

        // Remove old dup tags and add new merged tag
        for (const videoId of mergedVideoIds) {
            // Get video's current tags
            const video = this.allVideos.find(v => v.id === videoId);
            if (!video) continue;

            // Remove old dup tags
            if (video.tags) {
                for (const tag of video.tags) {
                    if (tag.name.startsWith('dup-') && tag.name !== newTagName) {
                        try {
                            await fetch(`${this.apiBase}/videos/${videoId}/tags/${tag.id}`, {
                                method: 'DELETE'
                            });
                            // Track this tag for deletion
                            oldTagIdsToDelete.add(tag.id);
                        } catch (error) {
                            console.error(`Error removing tag ${tag.name}:`, error);
                        }
                    }
                }
            }

            // Add new merged tag
            try {
                const response = await fetch(`${this.apiBase}/videos/${videoId}/tags?tag_name=${encodeURIComponent(newTagName)}`, {
                    method: 'POST'
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result && result.tag) {
                        console.log(`✓ Merged tag added to video ${videoId}:`, result.tag.name);
                    } else {
                        console.error(`✗ Invalid merge response for video ${videoId}:`, result);
                    }
                } else {
                    const errorText = await response.text();
                    console.error(`✗ Failed to add merged tag to video ${videoId}: ${response.status}`, errorText);
                }
            } catch (error) {
                console.error(`Error adding merged tag to video ${videoId}:`, error);
            }
        }

        // Delete the orphaned old tags
        for (const tagId of oldTagIdsToDelete) {
            try {
                await fetch(`${this.apiBase}/tags/${tagId}`, {
                    method: 'DELETE'
                });
                console.log(`Deleted orphaned tag ID: ${tagId}`);
            } catch (error) {
                console.error(`Error deleting orphaned tag ${tagId}:`, error);
            }
        }

        console.log(`✓ Merged groups into "${newTagName}" (${mergedVideoIds.length} videos)`)

        // Exit duplicate view and filter by the new merged tag
        await this.exitDuplicateView();

        // Reload tags to include the new merged tag in the dropdown
        await this.loadAllTags();

        // Apply tag filter to show the merged group
        this.currentTagFilter = newTagName;
        const tagFilter = document.getElementById('tagFilter');
        if (tagFilter) {
            tagFilter.value = newTagName;
        }

        // Trigger filter update
        await this.handleFiltersChanged();

        // Save settings
        this.saveSettingsToStorage();
    }

    playVideoById(videoId) {
        const video = this.videos.find(v => v.id === videoId) || this.allVideos.find(v => v.id === videoId);
        if (video) {
            const videoData = {
                id: video.id,
                name: video.name,
                category: video.category,
                subcategory: video.subcategory || '',
                relative_path: video.relative_path || video.name,
                path: video.path
            };
            this.playVideoFromData(JSON.stringify(videoData));
        }
    }

    // ==================== FACE RECOGNITION METHODS ====================

    async loadFaceApiModels() {
        // Delegate to face recognition module
        const statusEl = this.dom.get('faceExtractionStatus');

        const result = await this.faceModule.initializeFaceAPI({
            onStatus: (message, isError) => {
                if (statusEl) {
                    if (isError) {
                        statusEl.textContent = `❌ ${message}`;
                        statusEl.className = 'face-extraction-status error';
                    } else if (message.includes('ready')) {
                        statusEl.textContent = `✓ ${message} - Click "Scan Video Frames" to begin`;
                        statusEl.className = 'face-extraction-status ready';
                    } else {
                        statusEl.textContent = message;
                        statusEl.className = 'face-extraction-status';
                    }
                }
            }
        });

        // Sync state with module (for backward compatibility with code checking this.faceApiLoaded)
        this.faceApiLoaded = this.faceModule.faceApiLoaded;
        this.faceApiLoading = this.faceModule.faceApiLoading;

        return result;
    }

    async showFaceExtractionModal(video) {
        // Now redirects to full-screen view
        await this.enterFaceExtractionView(video);
    }

    hideFaceExtractionModal() {
        // Now redirects to exit full-screen view
        this.exitFaceExtractionView();
    }

    // NEW FULL-SCREEN FACE EXTRACTION VIEW METHODS
    async enterFaceExtractionView(video) {
        const videoPlayer = document.getElementById('videoPlayer');
        const imageViewer = document.getElementById('imageViewer');
        const imageViewerContainer = document.querySelector('.image-viewer-container');
        const view = document.getElementById('faceExtractionView');
        const extractVideoPlayer = document.getElementById('faceExtractVideoPlayer');
        const extractImagePlayer = document.getElementById('faceExtractImagePlayer');
        const videoTitle = document.getElementById('faceExtractVideoTitle');

        // Determine if we're working with video or image - use media_type from object parameter
        // Also fallback to extension check for images in case media_type is not set in DB
        const isImage = video && (video.media_type === 'image' || this.isImageExtension(video.extension));
        const sourcePlayer = isImage ? imageViewer : videoPlayer;
        const extractPlayer = isImage ? extractImagePlayer : extractVideoPlayer;

        if (!sourcePlayer || !sourcePlayer.src) {
            console.log('No video or image is currently playing')
            return;
        }

        // Store current video/image info
        this.currentVideoForFaces = video;
        const wasPlaying = !videoPlayer.paused;
        this.videoWasPlayingBeforeExtract = wasPlaying;

        // Copy source to appropriate extraction player
        if (isImage) {
            // For images: use img element
            extractImagePlayer.src = sourcePlayer.src;
            extractVideoPlayer.style.display = 'none';
            extractImagePlayer.style.display = 'block';
        } else {
            // For videos: use video element
            extractVideoPlayer.src = sourcePlayer.src;
            extractImagePlayer.style.display = 'none';
            extractVideoPlayer.style.display = 'block';
            if (videoPlayer.currentTime) {
                extractVideoPlayer.currentTime = videoPlayer.currentTime;
            }
        }

        // Set title
        videoTitle.textContent = `Face Extraction - ${video.display_name || video.name}`;

        // Hide current viewer and show face extraction view
        if (isImage) {
            imageViewerContainer.style.display = 'none';
        } else {
            document.getElementById('videoModal').style.display = 'none';
        }
        view.style.display = 'flex';

        // Wait for player to be ready
        await new Promise((resolve) => {
            if (extractVideoPlayer.readyState >= 2) {
                // Player already has metadata loaded
                resolve();
            } else {
                // Wait for metadata to load
                const onReady = () => {
                    extractVideoPlayer.removeEventListener('loadedmetadata', onReady);
                    resolve();
                };
                extractVideoPlayer.addEventListener('loadedmetadata', onReady);
            }
        });

        // Detect orientation and apply appropriate layout
        this.applyFaceExtractionLayout(extractVideoPlayer);

        // Always pause for frame extraction
        extractVideoPlayer.pause();

        // Focus the extraction player so arrow keys work on it
        extractVideoPlayer.focus();

        // Load face-api.js models if not already loaded
        await this.loadFaceApiModels();

        // Clear previous state and initialize
        this.clearFaceExtractionState();
        this.initializeFaceExtractionListeners();
    }

    applyFaceExtractionLayout(videoPlayer) {
        const view = document.getElementById('faceExtractionView');
        const isVertical = videoPlayer.videoHeight > videoPlayer.videoWidth;

        if (isVertical) {
            view.classList.add('vertical-layout');
            view.classList.remove('horizontal-layout');
        } else {
            view.classList.add('horizontal-layout');
            view.classList.remove('vertical-layout');
        }
    }

    exitFaceExtractionView() {
        const view = document.getElementById('faceExtractionView');
        const videoModal = document.getElementById('videoModal');
        const imageViewerContainer = document.querySelector('.image-viewer-container');
        const extractVideoPlayer = document.getElementById('faceExtractVideoPlayer');
        const extractImagePlayer = document.getElementById('faceExtractImagePlayer');
        const videoPlayer = document.getElementById('videoPlayer');
        const imageViewer = document.getElementById('imageViewer');

        // Determine if we came from image or video viewer - use stored object's media_type
        // Also fallback to extension check for images in case media_type is not set in DB
        const wasFromImage = this.currentVideoForFaces && (this.currentVideoForFaces.media_type === 'image' || this.isImageExtension(this.currentVideoForFaces.extension));

        // Sync state back to original player
        if (!wasFromImage && extractVideoPlayer.src) {
            videoPlayer.currentTime = extractVideoPlayer.currentTime;

            // Restore play state
            if (!extractVideoPlayer.paused) {
                videoPlayer.play();
            } else if (this.videoWasPlayingBeforeExtract) {
                // Video was playing before, resume
                videoPlayer.play();
            }
        }

        // Clear extract players
        extractVideoPlayer.pause();
        extractVideoPlayer.src = '';
        extractImagePlayer.src = '';

        // Show appropriate viewer again
        view.style.display = 'none';
        if (wasFromImage) {
            imageViewerContainer.style.display = 'flex';
        } else {
            videoModal.style.display = 'flex';
        }

        // Focus the appropriate player so arrow keys work again
        setTimeout(() => {
            if (wasFromImage) {
                imageViewer?.focus();
            } else {
                videoPlayer.focus();
            }
        }, 50);

        // Remove keyboard listener
        if (this.faceExtractionKeyHandler) {
            document.removeEventListener('keydown', this.faceExtractionKeyHandler);
            this.faceExtractionKeyHandler = null;
        }

        // Clear state
        this.clearFaceExtractionState();
    }

    clearFaceExtractionState() {
        this.scannedFrames = [];
        this.selectedFrames = [];
        this.detectedFaces = [];

        // Clear grids
        const framesGrid = document.getElementById('capturedFramesGrid');
        const facesGrid = document.getElementById('detectedFacesGrid');

        framesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No frames captured yet</p><p class="face-extract-empty-hint">Capture frames manually or use random scan</p></div>';
        facesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No faces detected yet</p><p class="face-extract-empty-hint">Select frames and click "Detect Faces"</p></div>';

        // Reset counters
        document.getElementById('capturedFramesCount').textContent = '0';
        document.getElementById('selectedFramesCountLabel').textContent = '0';
        document.getElementById('detectedFacesCount').textContent = '0';
        document.getElementById('detectFacesInFramesBtn').disabled = true;
    }

    initializeFaceExtractionListeners() {
        // Remove old listeners to prevent duplicates
        const exitBtn = document.getElementById('exitFaceExtractionView');
        const captureBtn = document.getElementById('captureCurrentFrameBtn');
        const scanBtn = document.getElementById('scanRandomFramesBtn');
        const selectAllBtn = document.getElementById('selectAllFramesBtn');
        const clearAllBtn = document.getElementById('clearAllFramesBtn');
        const detectBtn = document.getElementById('detectFacesInFramesBtn');

        // Clone and replace to remove all listeners
        exitBtn.replaceWith(exitBtn.cloneNode(true));
        captureBtn.replaceWith(captureBtn.cloneNode(true));
        scanBtn.replaceWith(scanBtn.cloneNode(true));
        selectAllBtn.replaceWith(selectAllBtn.cloneNode(true));
        clearAllBtn.replaceWith(clearAllBtn.cloneNode(true));
        detectBtn.replaceWith(detectBtn.cloneNode(true));

        // Add fresh listeners
        document.getElementById('exitFaceExtractionView').onclick = () => this.exitFaceExtractionView();
        document.getElementById('captureCurrentFrameBtn').onclick = () => this.captureCurrentFrame();
        document.getElementById('scanRandomFramesBtn').onclick = () => this.scanRandomFramesNew();
        document.getElementById('scanSequentialFramesBtn').onclick = () => this.scanSequentialFramesNew();
        document.getElementById('selectAllFramesBtn').onclick = () => this.selectAllCapturedFrames();
        document.getElementById('clearAllFramesBtn').onclick = () => this.clearAllCapturedFrames();
        document.getElementById('detectFacesInFramesBtn').onclick = () => this.detectFacesInSelectedFrames();

        // Add keyboard shortcuts for face extraction view
        this.faceExtractionKeyHandler = (e) => {
            // Only handle if face extraction view is visible
            const view = document.getElementById('faceExtractionView');
            if (!view || view.style.display === 'none') return;

            // S key - Capture current frame
            if (e.key === 's' || e.key === 'S') {
                e.preventDefault();
                this.captureCurrentFrame();
            }

            // Escape key - Focus video player (stay in view)
            if (e.key === 'Escape') {
                e.preventDefault();
                const videoPlayer = document.getElementById('faceExtractVideoPlayer');
                if (videoPlayer) {
                    videoPlayer.focus();
                }
            }
        };

        // Remove any existing listener first
        document.removeEventListener('keydown', this.faceExtractionKeyHandler);
        document.addEventListener('keydown', this.faceExtractionKeyHandler);
    }

    async captureCurrentFrame() {
        const videoPlayer = document.getElementById('faceExtractVideoPlayer');
        const imagePlayer = document.getElementById('faceExtractImagePlayer');
        const statusEl = document.getElementById('faceDetectionStatus');
        const isImage = imagePlayer && imagePlayer.style.display !== 'none';
        const sourcePlayer = isImage ? imagePlayer : videoPlayer;

        try {
            // Validate player exists and is ready
            if (!sourcePlayer) {
                console.log('Media player not found')
                return;
            }

            if (isImage) {
                // For images: check if image is loaded
                if (!sourcePlayer.naturalWidth || !sourcePlayer.naturalHeight) {
                    console.log('Image not loaded yet, please wait...')
                    return;
                }
            } else {
                // For videos: check if video is ready
                if (sourcePlayer.readyState < 2) {
                    console.log('Video not loaded yet, please wait...')
                    return;
                }

                if (!sourcePlayer.videoWidth || !sourcePlayer.videoHeight) {
                    console.log('Video dimensions not available')
                    return;
                }
            }

            statusEl.textContent = 'Capturing frame...';

            // Create canvas and capture current frame
            const canvas = document.createElement('canvas');
            const width = isImage ? sourcePlayer.naturalWidth : sourcePlayer.videoWidth;
            const height = isImage ? sourcePlayer.naturalHeight : sourcePlayer.videoHeight;
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(sourcePlayer, 0, 0, canvas.width, canvas.height);

            const frameData = canvas.toDataURL('image/jpeg', 0.85);
            const timestamp = isImage ? 0 : sourcePlayer.currentTime;

            // Add to scanned frames
            const frame = {
                id: this.scannedFrames.length,
                timestamp: timestamp,
                data: frameData,
                selected: true  // Auto-select captured frames
            };

            this.scannedFrames.push(frame);
            this.selectedFrames.push(frame);

            // Render frames
            this.renderCapturedFrames();

            statusEl.textContent = `✓ Captured frame at ${this.formatDuration(timestamp)}`;
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);

            // Auto-refocus video so arrow keys work immediately
            setTimeout(() => {
                videoPlayer.focus();
            }, 50);

        } catch (error) {
            console.error('Error capturing frame:', error);
            statusEl.textContent = '✗ Failed to capture frame';
            console.log('Failed to capture frame')

            // Still refocus video on error
            videoPlayer.focus();
        }
    }

    async scanRandomFramesNew() {
        const videoPlayer = document.getElementById('faceExtractVideoPlayer');
        const imagePlayer = document.getElementById('faceExtractImagePlayer');
        const statusEl = document.getElementById('faceDetectionStatus');
        const isImage = imagePlayer && imagePlayer.style.display !== 'none';

        if (isImage) {
            // For images: just capture the one frame 8 times (same image)
            statusEl.textContent = 'Capturing image frame...';
            await this.captureCurrentFrame();
            statusEl.textContent = '✓ Image captured (1 frame)';
            return;
        }

        // For videos: scan random frames
        // Validate video player exists and is ready
        if (!videoPlayer) {
            console.log('Video player not found')
            return;
        }

        if (videoPlayer.readyState < 2) {
            console.log('Video not loaded yet, please wait...')
            return;
        }

        if (!videoPlayer.duration || videoPlayer.duration === Infinity) {
            console.log('Video duration not available')
            return;
        }

        if (!videoPlayer.videoWidth || !videoPlayer.videoHeight) {
            console.log('Video dimensions not available')
            return;
        }

        try {
            // Pause video
            videoPlayer.pause();

            statusEl.textContent = 'Scanning 8 random frames...';

            const TOTAL_FRAMES = 8;
            const duration = videoPlayer.duration;
            const startTime = duration * 0.05;
            const endTime = duration * 0.95;
            const timestamps = [];

            // Generate random timestamps
            for (let i = 0; i < TOTAL_FRAMES; i++) {
                const randomTime = startTime + Math.random() * (endTime - startTime);
                timestamps.push(randomTime);
            }

            timestamps.sort((a, b) => a - b);

            // Create canvas for capture
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

            // Capture frames
            for (let i = 0; i < timestamps.length; i++) {
                const timestamp = timestamps[i];

                // Seek to timestamp
                videoPlayer.currentTime = timestamp;

                // Wait for seek
                await new Promise((resolve) => {
                    const seekHandler = () => {
                        videoPlayer.removeEventListener('seeked', seekHandler);
                        resolve();
                    };
                    videoPlayer.addEventListener('seeked', seekHandler);
                });

                // Ensure paused
                if (!videoPlayer.paused) {
                    videoPlayer.pause();
                }

                await new Promise(resolve => setTimeout(resolve, 100));

                // Capture frame
                tempCanvas.width = videoPlayer.videoWidth;
                tempCanvas.height = videoPlayer.videoHeight;
                tempCtx.drawImage(videoPlayer, 0, 0, tempCanvas.width, tempCanvas.height);

                const frameData = tempCanvas.toDataURL('image/jpeg', 0.85);

                // Add frame
                const frame = {
                    id: this.scannedFrames.length,
                    timestamp: timestamp,
                    data: frameData,
                    selected: false
                };

                this.scannedFrames.push(frame);

                statusEl.textContent = `Scanning... ${i + 1}/${TOTAL_FRAMES}`;
            }

            // Render all frames
            this.renderCapturedFrames();

            statusEl.textContent = `✓ Scanned ${TOTAL_FRAMES} frames`;
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);

        } catch (error) {
            console.error('Error scanning frames:', error);
            statusEl.textContent = '✗ Scan failed';
            console.log('Failed to scan frames')
        }
    }

    async scanSequentialFramesNew() {
        const videoPlayer = document.getElementById('faceExtractVideoPlayer');
        const imagePlayer = document.getElementById('faceExtractImagePlayer');
        const statusEl = document.getElementById('faceDetectionStatus');
        const isImage = imagePlayer && imagePlayer.style.display !== 'none';

        if (isImage) {
            // For images: just capture the one frame
            statusEl.textContent = 'Capturing image frame...';
            await this.captureCurrentFrame();
            statusEl.textContent = '✓ Image captured (1 frame)';
            return;
        }

        // For videos: scan sequential frames
        // Validate video player exists and is ready
        if (!videoPlayer) {
            console.log('Video player not found')
            return;
        }

        if (videoPlayer.readyState < 2) {
            console.log('Video not loaded yet, please wait...')
            return;
        }

        if (!videoPlayer.duration || videoPlayer.duration === Infinity) {
            console.log('Video duration not available')
            return;
        }

        if (!videoPlayer.videoWidth || !videoPlayer.videoHeight) {
            console.log('Video dimensions not available')
            return;
        }

        try {
            // Pause video
            videoPlayer.pause();

            const duration = videoPlayer.duration;
            const currentPosition = videoPlayer.currentTime;
            const TOTAL_FRAMES = 8;
            const HOP_INTERVAL = 1; // 1 second hops
            const timestamps = [];

            // Generate 8 sequential timestamps from current position with 1-second hops
            for (let i = 0; i < TOTAL_FRAMES; i++) {
                let ts = currentPosition + (i * HOP_INTERVAL);
                // Cap at video end if needed
                if (ts > duration) {
                    ts = duration;
                }
                timestamps.push(ts);
            }

            statusEl.textContent = `Scanning 8 sequential frames from current position...`;

            // Create canvas for capture
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

            // Capture frames
            for (let i = 0; i < timestamps.length; i++) {
                const timestamp = timestamps[i];

                // Seek to timestamp
                videoPlayer.currentTime = timestamp;

                // Wait for seek
                await new Promise((resolve) => {
                    const seekHandler = () => {
                        videoPlayer.removeEventListener('seeked', seekHandler);
                        resolve();
                    };
                    videoPlayer.addEventListener('seeked', seekHandler);
                });

                // Ensure paused
                if (!videoPlayer.paused) {
                    videoPlayer.pause();
                }

                await new Promise(resolve => setTimeout(resolve, 100));

                // Capture frame
                tempCanvas.width = videoPlayer.videoWidth;
                tempCanvas.height = videoPlayer.videoHeight;
                tempCtx.drawImage(videoPlayer, 0, 0, tempCanvas.width, tempCanvas.height);

                const frameData = tempCanvas.toDataURL('image/jpeg', 0.85);

                // Add frame
                const frame = {
                    id: this.scannedFrames.length,
                    timestamp: timestamp,
                    data: frameData,
                    selected: false
                };

                this.scannedFrames.push(frame);

                statusEl.textContent = `Scanning... ${i + 1}/${TOTAL_FRAMES}`;
            }

            // Render all frames
            this.renderCapturedFrames();

            statusEl.textContent = `✓ Scanned ${TOTAL_FRAMES} frames at 1s intervals`;
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);

        } catch (error) {
            console.error('Error scanning sequential frames:', error);
            statusEl.textContent = '✗ Scan failed';
            console.log('Failed to scan sequential frames')
        }
    }

    renderCapturedFrames() {
        const framesGrid = document.getElementById('capturedFramesGrid');

        if (this.scannedFrames.length === 0) {
            framesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No frames captured yet</p><p class="face-extract-empty-hint">Capture frames manually or use random scan</p></div>';
            document.getElementById('capturedFramesCount').textContent = '0';
            document.getElementById('selectedFramesCountLabel').textContent = '0';
            document.getElementById('detectFacesInFramesBtn').disabled = true;
            return;
        }

        framesGrid.innerHTML = '';

        this.scannedFrames.forEach(frame => {
            const card = document.createElement('div');
            card.className = 'face-extract-frame-card';
            if (frame.selected) {
                card.classList.add('selected');
            }

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'face-extract-frame-checkbox';
            checkbox.checked = frame.selected;
            checkbox.onchange = (e) => {
                e.stopPropagation();
                this.toggleFrameSelection(frame);
            };

            const img = document.createElement('img');
            img.src = frame.data;
            img.className = 'face-extract-frame-img';
            img.alt = 'Captured frame';

            const time = document.createElement('div');
            time.className = 'face-extract-frame-time';
            time.textContent = this.formatDuration(frame.timestamp);

            card.onclick = () => this.toggleFrameSelection(frame);
            card.appendChild(checkbox);
            card.appendChild(img);
            card.appendChild(time);

            framesGrid.appendChild(card);
        });

        // Update counters
        document.getElementById('capturedFramesCount').textContent = this.scannedFrames.length;
        document.getElementById('selectedFramesCountLabel').textContent = this.selectedFrames.length;
        document.getElementById('detectFacesInFramesBtn').disabled = this.selectedFrames.length === 0;
    }

    toggleFrameSelection(frame) {
        frame.selected = !frame.selected;

        if (frame.selected) {
            if (!this.selectedFrames.includes(frame)) {
                this.selectedFrames.push(frame);
            }
        } else {
            const index = this.selectedFrames.indexOf(frame);
            if (index > -1) {
                this.selectedFrames.splice(index, 1);
            }
        }

        this.renderCapturedFrames();
    }

    selectAllCapturedFrames() {
        this.scannedFrames.forEach(frame => {
            frame.selected = true;
            if (!this.selectedFrames.includes(frame)) {
                this.selectedFrames.push(frame);
            }
        });
        this.renderCapturedFrames();
    }

    clearAllCapturedFrames() {
        this.scannedFrames = [];
        this.selectedFrames = [];
        this.renderCapturedFrames();
    }

    async detectFacesInSelectedFrames() {
        if (this.selectedFrames.length === 0) {
            console.log('No frames selected')
            return;
        }

        const statusEl = document.getElementById('faceDetectionStatus');

        try {
            statusEl.textContent = 'Detecting faces...';

            // Load face-api models if needed
            if (!this.faceApiLoaded) {
                await this.loadFaceApiModels();
            }

            this.detectedFaces = [];

            for (let i = 0; i < this.selectedFrames.length; i++) {
                const frame = this.selectedFrames[i];

                statusEl.textContent = `Detecting faces... ${i + 1}/${this.selectedFrames.length}`;

                // Convert frame data to image
                const img = new Image();
                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.src = frame.data;
                });

                // Create canvas from image
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tempCtx.drawImage(img, 0, 0);

                // Detect faces
                const detections = await faceapi
                    .detectAllFaces(tempCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                if (detections && detections.length > 0) {
                    for (const detection of detections) {
                        const box = detection.detection.box;

                        // Add padding
                        const padding = 20;
                        const x = Math.max(0, box.x - padding);
                        const y = Math.max(0, box.y - padding);
                        const width = Math.min(img.width - x, box.width + padding * 2);
                        const height = Math.min(img.height - y, box.height + padding * 2);

                        // Crop face
                        const faceCanvas = document.createElement('canvas');
                        faceCanvas.width = width;
                        faceCanvas.height = height;
                        const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });
                        faceCtx.imageSmoothingEnabled = true;
                        faceCtx.imageSmoothingQuality = 'high';
                        faceCtx.drawImage(tempCanvas, x, y, width, height, 0, 0, width, height);

                        const faceImageData = faceCanvas.toDataURL('image/jpeg', 0.95);

                        const faceObj = {
                            id: this.detectedFaces.length,
                            imageData: faceImageData,
                            confidence: detection.detection.score,
                            timestamp: frame.timestamp,
                            frameIndex: frame.id,
                            box: { x, y, width, height }
                        };

                        this.detectedFaces.push(faceObj);
                    }
                }
            }

            this.renderDetectedFaces();

            statusEl.textContent = `✓ Found ${this.detectedFaces.length} face(s)`;
            setTimeout(() => {
                statusEl.textContent = '';
            }, 2000);

        } catch (error) {
            console.error('Error detecting faces:', error);
            statusEl.textContent = '✗ Detection failed';
            console.log('Face detection failed')
        }
    }

    renderDetectedFaces() {
        const facesGrid = document.getElementById('detectedFacesGrid');

        if (this.detectedFaces.length === 0) {
            facesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No faces detected yet</p><p class="face-extract-empty-hint">Select frames and click "Detect Faces"</p></div>';
            document.getElementById('detectedFacesCount').textContent = '0';
            return;
        }

        facesGrid.innerHTML = '';

        this.detectedFaces.forEach(face => {
            const card = document.createElement('div');
            card.className = 'face-extract-face-card';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'face-extract-face-remove';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove this face';
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeFaceFromDetected(face.id);
            };

            const img = document.createElement('img');
            img.src = face.imageData;
            img.className = 'face-extract-face-img';
            img.alt = 'Detected face';

            const info = document.createElement('div');
            info.className = 'face-extract-face-info';
            info.textContent = `${(face.confidence * 100).toFixed(0)}% conf`;

            card.appendChild(removeBtn);
            card.appendChild(img);
            card.appendChild(info);

            // Click to search/add
            card.onclick = async () => {
                try {
                    console.log('Face clicked, starting search...', face);
                    console.log('Searching for similar faces...')

                    const searchResult = await this.searchSingleFace(face);
                    console.log('Search result:', searchResult);

                    if (!searchResult) {
                        console.error('Search returned null');
                        console.log('Face search failed - check console')
                        return;
                    }

                    // Store the current face data for later use
                    this.currentFaceSearchData = {
                        face: face,
                        confidence: searchResult.confidence,
                        quality_score: searchResult.quality_score,
                        encoding: searchResult.encoding,
                        thumbnail: searchResult.thumbnail,
                        matches: searchResult.matches || [],
                        videoId: this.currentVideoForFaces.id,
                        frameTimestamp: face.timestamp || 0
                    };

                    console.log('Showing search modal with data:', this.currentFaceSearchData);

                    // Show the search results modal
                    this.showFaceSearchModal(this.currentFaceSearchData);
                } catch (error) {
                    console.error('Error in face click handler:', error);
                    console.log(`Failed to search face: ${error.message}`)
                }
            };

            facesGrid.appendChild(card);
        });

        document.getElementById('detectedFacesCount').textContent = this.detectedFaces.length;
    }

    removeFaceFromDetected(faceId) {
        const index = this.detectedFaces.findIndex(f => f.id === faceId);
        if (index > -1) {
            this.detectedFaces.splice(index, 1);
            // Re-assign IDs
            this.detectedFaces.forEach((f, i) => {
                f.id = i;
            });
            this.renderDetectedFaces();
            console.log('Face removed')
        }
    }

    showFaceSearchOverlay(text = '', step = 0, isError = false, autoDismiss = false) {
        const overlay = document.getElementById('faceSearchOverlay');
        const textEl = document.getElementById('faceSearchOverlayText');
        const progressBar = document.getElementById('faceSearchProgressBar');

        overlay.style.display = 'flex';

        // Update text
        if (text) textEl.textContent = text;

        // Update progress bar (0-3 steps)
        if (progressBar) {
            const percentage = (step / 3) * 100;
            progressBar.style.width = `${percentage}%`;
        }

        // Apply error styling if needed
        if (isError) {
            textEl.style.color = '#fca5a5';
            if (progressBar) {
                progressBar.style.background = '#ef4444';
            }
        } else {
            textEl.style.color = 'rgba(255, 255, 255, 0.9)';
            if (progressBar) {
                progressBar.style.background = 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)';
            }
        }

        // Auto-dismiss if requested
        if (autoDismiss) {
            setTimeout(() => {
                this.hideFaceSearchOverlay();
            }, 1000);
        }
    }

    hideFaceSearchOverlay() {
        const overlay = document.getElementById('faceSearchOverlay');
        const progressBar = document.getElementById('faceSearchProgressBar');

        // Add fade-out class for smooth animation
        overlay.classList.add('fade-out');

        // Hide after animation completes
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.classList.remove('fade-out');
            // Reset progress bar for next time
            if (progressBar) {
                progressBar.style.width = '0%';
            }
        }, 300);
    }

    showDuplicateSearchOverlay(text = '', progress = 0, isError = false, autoDismiss = false) { this.duplicateModule.showDuplicateSearchOverlay(text, progress, isError, autoDismiss) }
    hideDuplicateSearchOverlay() { this.duplicateModule.hideDuplicateSearchOverlay() }

    // Progress overlay for long-running tasks
    showProgressOverlay(title, text, current, total) {
        const overlay = document.getElementById('progressOverlay');
        const titleEl = document.getElementById('progressOverlayTitle');
        const textEl = document.getElementById('progressOverlayText');
        const countEl = document.getElementById('progressOverlayCount');
        const progressBar = document.getElementById('progressBar');

        overlay.style.display = 'flex';
        titleEl.textContent = title;
        textEl.textContent = text;
        countEl.textContent = `${current} / ${total}`;

        const percentage = (current / total) * 100;
        progressBar.style.width = `${percentage}%`;
    }

    hideProgressOverlay() {
        const overlay = document.getElementById('progressOverlay');
        overlay.style.display = 'none';
    }

    // Show top progress bar (when overlay is dismissed)
    showTopProgressBar(icon, label, current, total) {
        const topBar = document.getElementById('topProgressBar');
        const iconEl = document.getElementById('topProgressIcon');
        const labelEl = document.getElementById('topProgressLabel');
        const countEl = document.getElementById('topProgressCount');
        const fillEl = document.getElementById('topProgressBarFill');

        topBar.style.display = 'block';
        iconEl.textContent = icon;
        labelEl.textContent = label;
        countEl.textContent = `${current}/${total}`;

        const percentage = (current / total) * 100;
        fillEl.style.width = `${percentage}%`;
    }

    hideTopProgressBar() {
        const topBar = document.getElementById('topProgressBar');
        topBar.style.display = 'none';
    }

    async quickFaceSearchFromCurrentFrame() {
        const videoPlayer = document.getElementById('videoPlayer');

        if (!videoPlayer.src) {
            console.log('No video is currently playing')
            return;
        }

        // Pause the video
        if (!videoPlayer.paused) {
            videoPlayer.pause();
        }

        // Set current video for face operations
        this.currentVideoForFaces = this.currentVideoInPlayer;

        if (!this.currentVideoForFaces) {
            console.log('No video information available')
            return;
        }

        // Show overlay: Step 1 - Capture
        this.showFaceSearchOverlay('Capturing...', 1);

        try {
            // Load face-api.js models if not already loaded
            if (!this.faceApiLoaded) {
                await this.loadFaceApiModels();
            }

            // Capture current frame
            const canvas = document.createElement('canvas');
            canvas.width = videoPlayer.videoWidth;
            canvas.height = videoPlayer.videoHeight;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);

            // Convert canvas to image for face-api.js
            const imageData = canvas.toDataURL('image/jpeg', 0.95);
            const img = new Image();
            img.src = imageData;

            await new Promise((resolve) => {
                img.onload = resolve;
            });

            // Step 2 - Detect
            this.showFaceSearchOverlay('Detecting...', 2);

            // Detect faces using face-api.js
            const detections = await faceapi
                .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (!detections || detections.length === 0) {
                this.showFaceSearchOverlay('No face detected', 2, true, true);
                return;
            }

            // Get the first detected face
            const detection = detections[0];
            const box = detection.detection.box;

            // Crop face from canvas
            const faceCanvas = document.createElement('canvas');
            const padding = 20; // Add padding around face
            faceCanvas.width = box.width + padding * 2;
            faceCanvas.height = box.height + padding * 2;
            const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });

            faceCtx.drawImage(
                canvas,
                Math.max(0, box.x - padding),
                Math.max(0, box.y - padding),
                box.width + padding * 2,
                box.height + padding * 2,
                0,
                0,
                faceCanvas.width,
                faceCanvas.height
            );

            const faceImageData = faceCanvas.toDataURL('image/jpeg', 0.95);

            // Create face object
            const face = {
                imageData: faceImageData,
                confidence: detection.detection.score,
                timestamp: videoPlayer.currentTime,
                index: 0
            };

            // Step 3 - Search
            this.showFaceSearchOverlay('Searching...', 3);
            const searchResult = await this.searchSingleFace(face);

            // Hide overlay and show results modal
            this.hideFaceSearchOverlay();

            if (searchResult && searchResult.matches && searchResult.matches.length > 0) {
                // Show search results modal - properly structure the data
                this.currentFaceSearchData = {
                    face: face,
                    videoId: this.currentVideoForFaces.id,
                    frameTimestamp: face.timestamp,
                    encoding: searchResult.encoding,
                    thumbnail: searchResult.thumbnail,
                    confidence: searchResult.confidence,
                    quality_score: searchResult.quality_score,
                    matches: searchResult.matches || []
                };
                this.showFaceSearchResults(face, searchResult.matches);
            } else {
                // No match found - offer to create new face
                this.currentFaceSearchData = {
                    face: face,
                    videoId: this.currentVideoForFaces.id,
                    frameTimestamp: face.timestamp,
                    encoding: searchResult?.encoding,
                    thumbnail: searchResult?.thumbnail,
                    confidence: searchResult?.confidence,
                    quality_score: searchResult?.quality_score,
                    matches: []
                };
                this.detectedFaces = [face];
                this.showFaceSearchResults(face, []);
            }

        } catch (error) {
            console.error('Error in quick face search:', error);
            this.showFaceSearchOverlay('Search failed', 3, true, true);
        }
    }

    async autoScanFaces(additionalFrames = 10) {
        const videoPlayer = document.getElementById('videoPlayer');

        if (!videoPlayer || !videoPlayer.src) {
            console.log('No video loaded')
            return;
        }

        // Pause the video
        if (!videoPlayer.paused) {
            videoPlayer.pause();
        }

        // Set current video for face operations
        this.currentVideoForFaces = this.currentVideoInPlayer;

        if (!this.currentVideoForFaces) {
            console.log('No video information available')
            return;
        }

        // Initialize arrays if first scan
        if (!this.autoScanDetectedFaces) {
            this.autoScanDetectedFaces = [];
            this.scannedTimestamps = [];
            this.selectedAutoScanFaces = new Set();
            // Save original mute state and mute audio to avoid annoying seek sounds
            this.autoScanOriginalMuted = videoPlayer.muted;
            videoPlayer.muted = true;
        }

        // Show overlay: Scanning
        this.showFaceSearchOverlay('Scanning frames...', 1);

        try {
            // Load face-api.js models if not already loaded
            if (!this.faceApiLoaded) {
                await this.loadFaceApiModels();
            }

            const duration = videoPlayer.duration;
            if (!duration || duration === 0) {
                this.showFaceSearchOverlay('Video duration not available', 0, true, true);
                this.restoreAutoScanAudio();
                return;
            }

            // Generate random timestamps (avoiding already scanned ones)
            const frameCount = additionalFrames;
            const timestamps = [];
            let attempts = 0;
            const maxAttempts = frameCount * 5; // Increased for short videos

            // Adaptive buffer based on video duration (prevents duplicate frames)
            let minTimeBetweenFrames;
            if (duration < 30) {
                // Short videos: 0.3 second buffer (allows ~10 frames in 10s video)
                minTimeBetweenFrames = 0.3;
            } else if (duration < 120) {
                // Medium videos: 1 second buffer
                minTimeBetweenFrames = 1.0;
            } else {
                // Long videos: 2 second buffer
                minTimeBetweenFrames = 2.0;
            }

            console.log(`📊 Video duration: ${duration.toFixed(1)}s, buffer: ${minTimeBetweenFrames}s`);

            while (timestamps.length < frameCount && attempts < maxAttempts) {
                // Random time between 5% and 95% of video
                const randomTime = (Math.random() * 0.9 + 0.05) * duration;

                // Check if this timestamp is too close to already scanned ones
                const tooClose = this.scannedTimestamps.some(t => Math.abs(t - randomTime) < minTimeBetweenFrames);

                if (!tooClose) {
                    timestamps.push(randomTime);
                    this.scannedTimestamps.push(randomTime);
                }

                attempts++;
            }

            console.log(`✓ Generated ${timestamps.length} timestamps (attempted ${attempts} times)`);

            // Sort timestamps for sequential seeking (faster)
            timestamps.sort((a, b) => a - b);

            // PHASE 1: Capture all frames (must be sequential due to video element)
            const capturedFrames = [];

            for (let i = 0; i < timestamps.length; i++) {
                const timestamp = timestamps[i];

                // Update progress
                this.showFaceSearchOverlay(`Capturing frames...`, 1);

                // Seek to timestamp
                videoPlayer.currentTime = timestamp;

                // Wait for seek to complete
                await new Promise(resolve => {
                    const seeked = () => {
                        videoPlayer.removeEventListener('seeked', seeked);
                        resolve();
                    };
                    videoPlayer.addEventListener('seeked', seeked);
                });

                // Small delay to ensure frame is rendered
                await new Promise(resolve => setTimeout(resolve, 50));

                // Capture frame
                const canvas = document.createElement('canvas');
                canvas.width = videoPlayer.videoWidth;
                canvas.height = videoPlayer.videoHeight;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);

                capturedFrames.push({
                    canvas: canvas,
                    timestamp: timestamp,
                    frameIndex: this.autoScanDetectedFaces.length + capturedFrames.length
                });
            }

            // PHASE 2: Detect faces in all captured frames (PARALLEL - batch processing)
            this.showFaceSearchOverlay('Detecting faces...', 2);

            const detectionPromises = capturedFrames.map(async (frameData) => {
                // Convert canvas to image for face-api.js
                const imageData = frameData.canvas.toDataURL('image/jpeg', 0.95);
                const img = new Image();
                img.src = imageData;

                await new Promise((resolve) => {
                    img.onload = resolve;
                });

                // Detect faces in this frame
                const detections = await faceapi
                    .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                const faces = [];
                if (detections && detections.length > 0) {
                    // Process each detected face
                    for (const detection of detections) {
                        const box = detection.detection.box;

                        // Crop face from canvas
                        const faceCanvas = document.createElement('canvas');
                        const padding = 20;
                        faceCanvas.width = box.width + padding * 2;
                        faceCanvas.height = box.height + padding * 2;
                        const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });

                        faceCtx.drawImage(
                            frameData.canvas,
                            Math.max(0, box.x - padding),
                            Math.max(0, box.y - padding),
                            box.width + padding * 2,
                            box.height + padding * 2,
                            0,
                            0,
                            faceCanvas.width,
                            faceCanvas.height
                        );

                        const faceImageData = faceCanvas.toDataURL('image/jpeg', 0.95);

                        faces.push({
                            id: this.autoScanDetectedFaces.length + faces.length,
                            imageData: faceImageData,
                            confidence: detection.detection.score,
                            timestamp: frameData.timestamp,
                            frameIndex: frameData.frameIndex
                        });
                    }
                }

                return faces;
            });

            // Wait for all detections to complete (parallel processing)
            const detectionResults = await Promise.all(detectionPromises);

            // Flatten results and add to detected faces
            const newFaces = detectionResults.flat();

            // PHASE 3: Progressive display - add faces to UI as they're detected
            if (newFaces.length > 0) {
                // Update IDs to ensure uniqueness
                newFaces.forEach((face, index) => {
                    face.id = this.autoScanDetectedFaces.length + index;
                    this.autoScanDetectedFaces.push(face);
                });

                // Show/update modal with new faces
                this.showAutoScanModal(this.autoScanDetectedFaces);
            } else {
                // No faces found in this batch
                if (this.autoScanDetectedFaces.length === 0) {
                    console.log('No faces detected in scanned frames')
                    this.hideFaceSearchOverlay();
                    this.restoreAutoScanAudio();
                    return;
                } else {
                    // Already have faces from previous scans, just update modal
                    this.showAutoScanModal(this.autoScanDetectedFaces);
                    console.log(`No new faces in this batch (${this.autoScanDetectedFaces.length} total)`)
                }
            }

            // Hide overlay
            this.hideFaceSearchOverlay();

        } catch (error) {
            console.error('Error in auto-scan faces:', error);
            this.showFaceSearchOverlay('Scan failed', 1, true, true);
            this.restoreAutoScanAudio();
        }
    }

    restoreAutoScanAudio() {
        // Helper function to restore audio mute state after auto-scan
        const videoPlayer = document.getElementById('videoPlayer');
        if (videoPlayer && this.autoScanOriginalMuted !== undefined) {
            videoPlayer.muted = this.autoScanOriginalMuted;
            this.autoScanOriginalMuted = undefined;
        }
    }

    showAutoScanModal(detectedFaces, imageSource = null) {
        const modal = document.getElementById('autoScanModal');
        const faceCountEl = document.getElementById('autoScanFaceCount');
        const faceGrid = document.getElementById('autoScanFaceGrid');

        // Store image source for later use (if scanning from image)
        this.autoScanImageSource = imageSource;

        // Update face count
        faceCountEl.textContent = detectedFaces.length;

        // Clear grid
        faceGrid.innerHTML = '';

        // Create face items
        detectedFaces.forEach(face => {
            const item = document.createElement('div');
            item.className = 'auto-scan-face-item';
            item.dataset.faceId = face.id;

            // Check if this face was previously selected
            const isSelected = this.selectedAutoScanFaces.has(face.id);
            if (isSelected) {
                item.classList.add('selected');
            }

            item.innerHTML = `
                <input type="checkbox" class="auto-scan-face-checkbox" data-face-id="${face.id}" ${isSelected ? 'checked' : ''}>
                <img src="${face.imageData}" class="auto-scan-face-img" alt="Detected face">
                <div class="auto-scan-face-info">
                    ${face.frameIndex !== undefined ? `Frame ${face.frameIndex + 1}<br>` : ''}${(face.confidence * 100).toFixed(0)}% conf
                </div>
            `;

            // Click anywhere on item to toggle checkbox
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    const checkbox = item.querySelector('.auto-scan-face-checkbox');
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change'));
                }
            });

            // Handle checkbox change
            const checkbox = item.querySelector('.auto-scan-face-checkbox');
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    item.classList.add('selected');
                    this.selectedAutoScanFaces.add(face.id);
                } else {
                    item.classList.remove('selected');
                    this.selectedAutoScanFaces.delete(face.id);
                }
                this.updateAutoScanSelectionCount();
            });

            faceGrid.appendChild(item);
        });

        // Update selection count to reflect current state
        this.updateAutoScanSelectionCount();

        // Show modal
        modal.style.display = 'flex';
    }

    hideAutoScanModal() {
        const modal = document.getElementById('autoScanModal');
        modal.style.display = 'none';

        // Restore original audio mute state
        this.restoreAutoScanAudio();

        // Clear scan session state
        this.autoScanDetectedFaces = [];
        this.selectedAutoScanFaces = new Set();
        this.scannedTimestamps = [];
    }

    updateAutoScanSelectionCount() {
        const countEl = document.getElementById('selectedFaceCount');
        const searchBtn = document.getElementById('searchSelectedFacesBtn');

        const count = this.selectedAutoScanFaces.size;
        countEl.textContent = count;

        // Enable/disable search button
        searchBtn.disabled = count === 0;
    }

    async searchAndAddSelectedFaces() {
        if (this.selectedAutoScanFaces.size === 0) {
            console.log('Please select at least one face')
            return;
        }

        // Get selected faces
        const selectedFaces = this.autoScanDetectedFaces.filter(face =>
            this.selectedAutoScanFaces.has(face.id)
        );

        if (selectedFaces.length === 0) return;

        // Hide auto-scan modal
        this.hideAutoScanModal();

        // Use first selected face to search
        const firstFace = selectedFaces[0];

        // Show overlay: Searching
        this.showFaceSearchOverlay('Searching...', 3);

        try {
            const searchResult = await this.searchSingleFace(firstFace);

            // Hide overlay
            this.hideFaceSearchOverlay();

            // Store all selected faces for bulk adding
            // All selected faces will be added as encodings to the same face ID
            this.pendingBulkFaces = selectedFaces;

            // Determine source (video or image)
            const isImageSource = !!this.autoScanImageSource;
            const sourceId = isImageSource ? this.autoScanImageSource.id : (this.currentVideoForFaces?.id || -1);

            if (searchResult && searchResult.matches && searchResult.matches.length > 0) {
                // Match found - prepare to add all selected faces to existing face
                this.currentFaceSearchData = {
                    face: firstFace,
                    videoId: sourceId,
                    frameTimestamp: firstFace.timestamp,
                    encoding: searchResult.encoding,
                    thumbnail: searchResult.thumbnail,
                    confidence: searchResult.confidence,
                    quality_score: searchResult.quality_score,
                    matches: searchResult.matches || [],
                    bulkMode: true,  // Flag indicating multiple faces to add
                    isImageSearch: isImageSource,  // Mark if from image
                    imageId: isImageSource ? this.autoScanImageSource.id : null,
                    imageName: isImageSource ? this.autoScanImageSource.name : null
                };
                // Show search results modal (will display option to add ALL selected faces)
                this.showFaceSearchResults(firstFace, searchResult.matches);
            } else {
                // No match found - prepare to create new face with all selected faces
                this.currentFaceSearchData = {
                    face: firstFace,
                    videoId: sourceId,
                    frameTimestamp: firstFace.timestamp,
                    encoding: searchResult?.encoding,
                    thumbnail: searchResult?.thumbnail,
                    confidence: searchResult?.confidence,
                    quality_score: searchResult?.quality_score,
                    matches: [],
                    bulkMode: true,
                    isImageSearch: isImageSource,  // Mark if from image
                    imageId: isImageSource ? this.autoScanImageSource.id : null,
                    imageName: isImageSource ? this.autoScanImageSource.name : null
                };
                // Keep all selected faces available for bulk adding to new face
                // When user clicks "Create New Face", all these will be added as encodings
                this.detectedFaces = selectedFaces;
                this.showFaceSearchResults(firstFace, []);
            }

        } catch (error) {
            console.error('Error searching selected faces:', error);
            this.hideFaceSearchOverlay();
            console.log('Search failed')
        }
    }

    clearFrameSelection() {
        const frameGridContainer = document.getElementById('frameGridContainer');
        const detectedFacesList = document.getElementById('detectedFacesList');

        // Clear frame grid
        frameGridContainer.innerHTML = '<div class="no-frames-message">Click "Scan Video Frames" to begin.</div>';

        // Clear detected faces
        detectedFacesList.innerHTML = '<div class="no-faces-message">No faces detected yet. Scan and select frames to begin.</div>';

        // Reset state
        this.scannedFrames = [];
        this.selectedFrames = [];
        this.detectedFaces = [];

        // Update button states
        document.getElementById('selectedFrameCount').textContent = '0';
        document.getElementById('detectFacesBtn').disabled = true;
    }

    async scanVideoFrames() {
        const videoPlayer = document.getElementById('videoPlayer');
        const frameGridContainer = document.getElementById('frameGridContainer');
        const statusEl = document.getElementById('faceExtractionStatus');
        const scanningOverlay = document.getElementById('videoScanningOverlay');
        const scanningProgress = scanningOverlay?.querySelector('.scanning-progress');

        if (!videoPlayer.duration || videoPlayer.duration === Infinity) {
            console.log('Video duration not available')
            return;
        }

        try {
            // Ensure video is paused and stays paused during scanning
            videoPlayer.pause();

            // Show scanning overlay on video
            if (scanningOverlay) {
                scanningOverlay.style.display = 'flex';
            }

            statusEl.textContent = 'Scanning video frames...';
            statusEl.className = 'face-extraction-status';

            const TOTAL_FRAMES = 8;

            // Check if we have existing selected frames to keep
            const existingSelectedFrames = this.scannedFrames.filter(f => f.selected);
            const numToScan = TOTAL_FRAMES - existingSelectedFrames.length;

            // Clear grid but keep data for selected frames
            frameGridContainer.innerHTML = '';

            // Generate random timestamps for new frames (avoiding first and last 5%)
            const duration = videoPlayer.duration;
            const startTime = duration * 0.05;
            const endTime = duration * 0.95;
            const timestamps = [];

            for (let i = 0; i < numToScan; i++) {
                const randomTime = startTime + Math.random() * (endTime - startTime);
                timestamps.push(randomTime);
            }

            // Sort timestamps for smoother seeking
            timestamps.sort((a, b) => a - b);

            // Create temporary canvas for frame capture
            const tempCanvas = document.createElement('canvas');
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

            // Capture new frames
            const newFrames = [];
            for (let i = 0; i < timestamps.length; i++) {
                const timestamp = timestamps[i];

                // Seek to timestamp
                videoPlayer.currentTime = timestamp;

                // Wait for seek to complete
                await new Promise((resolve) => {
                    const seekHandler = () => {
                        videoPlayer.removeEventListener('seeked', seekHandler);
                        resolve();
                    };
                    videoPlayer.addEventListener('seeked', seekHandler);
                });

                // Ensure video stays paused after seeking
                if (!videoPlayer.paused) {
                    videoPlayer.pause();
                }

                // Small delay to ensure frame is ready
                await new Promise(resolve => setTimeout(resolve, 100));

                // Capture frame
                tempCanvas.width = videoPlayer.videoWidth;
                tempCanvas.height = videoPlayer.videoHeight;
                tempCtx.drawImage(videoPlayer, 0, 0, tempCanvas.width, tempCanvas.height);

                const frameData = tempCanvas.toDataURL('image/jpeg', 0.85);

                // Store new frame
                newFrames.push({
                    timestamp: timestamp,
                    data: frameData,
                    selected: false
                });

                // Update status
                statusEl.textContent = `Scanning... ${i + 1}/${numToScan} new frames`;

                // Update overlay progress
                if (scanningProgress) {
                    scanningProgress.textContent = `${i + 1}/${numToScan}`;
                }
            }

            // Combine existing selected frames with new frames
            this.scannedFrames = [...existingSelectedFrames, ...newFrames];

            // Reassign IDs sequentially
            this.scannedFrames.forEach((frame, index) => {
                frame.id = index;
            });

            // Rebuild selected frames array (maintain references)
            this.selectedFrames = this.scannedFrames.filter(f => f.selected);

            // Render all frames
            this.scannedFrames.forEach(frame => {
                this.createFrameCard(frame, frameGridContainer);
            });

            // Update button state
            document.getElementById('selectedFrameCount').textContent = this.selectedFrames.length;
            document.getElementById('detectFacesBtn').disabled = this.selectedFrames.length === 0;

            if (existingSelectedFrames.length > 0) {
                statusEl.textContent = `✓ Scan complete! Kept ${existingSelectedFrames.length} selected, added ${numToScan} new frames.`;
            } else {
                statusEl.textContent = '✓ Scan complete! Select frames with clear faces.';
            }
            statusEl.className = 'face-extraction-status ready';

            // Ensure video remains paused after scanning
            videoPlayer.pause();

        } catch (error) {
            console.error('Error scanning frames:', error);
            console.log('Failed to scan video frames')
            statusEl.textContent = '✗ Scan failed';
            statusEl.className = 'face-extraction-status error';

            // Ensure video is paused even on error
            if (videoPlayer) {
                videoPlayer.pause();
            }
        } finally {
            // Always hide scanning overlay (success or error)
            if (scanningOverlay) {
                scanningOverlay.style.display = 'none';
            }
        }
    }

    createFrameCard(frameObj, container) {
        const card = document.createElement('div');
        card.className = 'frame-card';
        card.dataset.frameId = frameObj.id;

        // Apply selected state if frame is already selected
        if (frameObj.selected) {
            card.classList.add('selected');
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'frame-checkbox';
        checkbox.checked = frameObj.selected;

        const img = document.createElement('img');
        img.src = frameObj.data;
        img.className = 'frame-thumbnail';

        const timestamp = document.createElement('div');
        timestamp.className = 'frame-timestamp';
        timestamp.textContent = this.formatDuration(frameObj.timestamp);

        // Toggle selection on click
        card.onclick = () => {
            frameObj.selected = !frameObj.selected;
            checkbox.checked = frameObj.selected;
            card.classList.toggle('selected', frameObj.selected);

            // Update selected frames array
            if (frameObj.selected) {
                // Add if not already in array
                if (!this.selectedFrames.find(f => f.id === frameObj.id)) {
                    this.selectedFrames.push(frameObj);
                }
            } else {
                const index = this.selectedFrames.findIndex(f => f.id === frameObj.id);
                if (index > -1) {
                    this.selectedFrames.splice(index, 1);
                }
            }

            // Update button state
            document.getElementById('selectedFrameCount').textContent = this.selectedFrames.length;
            document.getElementById('detectFacesBtn').disabled = this.selectedFrames.length === 0;
        };

        card.appendChild(checkbox);
        card.appendChild(img);
        card.appendChild(timestamp);
        container.appendChild(card);
    }

    async detectFacesInSelectedFramesOld() {
        // OLD METHOD - renamed to avoid conflict with new full-screen view
        // This method is no longer used
        if (this.selectedFrames.length === 0 || !this.faceApiLoaded) {
            return;
        }

        const statusEl = document.getElementById('faceExtractionStatus');
        const detectedFacesList = document.getElementById('detectedFacesList');

        try {
            statusEl.textContent = 'Detecting faces in selected frames...';
            statusEl.className = 'face-extraction-status';

            this.detectedFaces = [];
            let totalFaces = 0;

            // Process each selected frame
            for (let frameIndex = 0; frameIndex < this.selectedFrames.length; frameIndex++) {
                const frame = this.selectedFrames[frameIndex];

                statusEl.textContent = `Detecting faces... ${frameIndex + 1}/${this.selectedFrames.length} frames`;

                // Create temporary canvas for this frame
                const tempCanvas = document.createElement('canvas');
                const img = new Image();

                await new Promise((resolve) => {
                    img.onload = resolve;
                    img.src = frame.data;
                });

                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
                tempCtx.drawImage(img, 0, 0);

                // Detect faces with landmarks
                const detections = await faceapi
                    .detectAllFaces(tempCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                    .withFaceLandmarks();

                // Extract face crops from this frame
                for (let i = 0; i < detections.length; i++) {
                    const detection = detections[i];
                    const box = detection.detection.box;

                    // Add generous padding (50% of face size)
                    const paddingPercent = 0.5;
                    const paddingX = box.width * paddingPercent;
                    const paddingY = box.height * paddingPercent;

                    const x = Math.max(0, box.x - paddingX);
                    const y = Math.max(0, box.y - paddingY);
                    const width = Math.min(tempCanvas.width - x, box.width + paddingX * 2);
                    const height = Math.min(tempCanvas.height - y, box.height + paddingY * 2);

                    // Skip faces that are too small
                    if (width < 80 || height < 80) {
                        console.warn(`Skipping small face: ${width}x${height}`);
                        continue;
                    }

                    // Create canvas for face crop
                    const faceCanvas = document.createElement('canvas');
                    faceCanvas.width = width;
                    faceCanvas.height = height;
                    const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });
                    faceCtx.imageSmoothingEnabled = true;
                    faceCtx.imageSmoothingQuality = 'high';
                    faceCtx.drawImage(tempCanvas, x, y, width, height, 0, 0, width, height);

                    const faceImageData = faceCanvas.toDataURL('image/jpeg', 0.95);

                    this.detectedFaces.push({
                        index: totalFaces++,
                        frameId: frame.id,
                        timestamp: frame.timestamp,
                        confidence: detection.detection.score,
                        box: { x, y, width, height },
                        imageData: faceImageData
                    });
                }
            }

            if (this.detectedFaces.length === 0) {
                console.log('No faces detected in selected frames')
                statusEl.textContent = '✓ Face detection ready';
                statusEl.className = 'face-extraction-status ready';
                detectedFacesList.innerHTML = '<div class="no-faces-message">No faces detected. Try different frames.</div>';
                return;
            }

            statusEl.textContent = `Searching for matches... (${this.detectedFaces.length} faces)`;

            // Auto-search all detected faces
            await this.batchSearchFaces();

        } catch (error) {
            console.error('Error detecting faces:', error);
            statusEl.textContent = '❌ Face detection failed';
            statusEl.className = 'face-extraction-status error';
            console.log('Face detection failed')
        }
    }

    async batchSearchFaces() {
        const statusEl = document.getElementById('faceExtractionStatus');
        const detectedFacesList = document.getElementById('detectedFacesList');

        try {
            // Sort faces by confidence and pick the best one
            const sortedFaces = [...this.detectedFaces].sort((a, b) => b.confidence - a.confidence);
            const bestFace = sortedFaces[0];

            statusEl.textContent = 'Searching with best face...';

            // Search only the best face
            const searchData = await this.searchSingleFace(bestFace);

            // Display result with all faces
            this.displaySmartBatchResult(searchData, bestFace);

            statusEl.textContent = `✓ Found ${this.detectedFaces.length} faces`;
            statusEl.className = 'face-extraction-status ready';

        } catch (error) {
            console.error('Error searching faces:', error);
            statusEl.textContent = '❌ Search failed';
            statusEl.className = 'face-extraction-status error';
            console.log('Failed to search faces')
        }
    }

    async searchSingleFace(face) {
        try {
            console.log('searchSingleFace called with face:', face);
            console.log('Current video:', this.currentVideoForFaces);

            // Convert base64 image to Blob
            const base64Data = face.imageData.split(',')[1];
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/jpeg' });

            // Create FormData with the image file
            const formData = new FormData();
            formData.append('face_image', blob, 'face.jpg');
            formData.append('video_id', this.currentVideoForFaces.id.toString());
            formData.append('frame_timestamp', (face.timestamp || 0).toString());
            formData.append('threshold', '0.4');

            console.log('Sending request to:', `${this.apiBase}/api/faces/search`);

            const response = await fetch(`${this.apiBase}/api/faces/search`, {
                method: 'POST',
                body: formData
            });

            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                return null;
            }

            const result = await response.json();
            console.log('API result:', result);

            // Store the encoding data on the face object for later use
            face.encoding = result.encoding;
            face.thumbnail = result.thumbnail;
            face.confidence = result.confidence;
            face.quality_score = result.quality_score;

            return result;

        } catch (error) {
            console.error('Error searching face:', error);
            return null;
        }
    }

    displaySmartBatchResult(searchData, bestFace) {
        const detectedFacesList = document.getElementById('detectedFacesList');
        detectedFacesList.innerHTML = '';

        const totalFaces = this.detectedFaces.length;

        if (!searchData || !searchData.matches || searchData.matches.length === 0) {
            // No match found - show create new face option
            const unmatchedGroup = document.createElement('div');
            unmatchedGroup.className = 'face-batch-group unmatched';

            const header = document.createElement('div');
            header.className = 'face-batch-header';
            header.innerHTML = `
                <div class="face-batch-title">
                    ❓ No Match Found (${totalFaces} faces)
                </div>
                <button class="face-batch-action-btn">
                    ➕ Create New Face & Add All ${totalFaces}
                </button>
            `;

            header.querySelector('.face-batch-action-btn').onclick = () => {
                this.createNewFaceAndAddAll(bestFace);
            };

            const facesContainer = document.createElement('div');
            facesContainer.className = 'face-batch-faces';

            this.detectedFaces.forEach((face, index) => {
                const faceWrapper = document.createElement('div');
                faceWrapper.className = 'face-batch-thumb-wrapper';
                faceWrapper.dataset.faceIndex = index;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'face-batch-remove-btn';
                removeBtn.textContent = '✕';
                removeBtn.title = 'Remove this face';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removeDetectedFaceFromBatch(index);
                };

                const faceThumb = document.createElement('img');
                faceThumb.src = face.imageData;
                faceThumb.className = 'face-batch-thumb';
                faceThumb.title = `Confidence: ${(face.confidence * 100).toFixed(1)}%`;

                faceWrapper.appendChild(removeBtn);
                faceWrapper.appendChild(faceThumb);
                facesContainer.appendChild(faceWrapper);
            });

            unmatchedGroup.appendChild(header);
            unmatchedGroup.appendChild(facesContainer);
            detectedFacesList.appendChild(unmatchedGroup);

        } else {
            // Match found - show add all to matched face
            const bestMatch = searchData.matches[0];
            const matchedGroup = document.createElement('div');
            matchedGroup.className = 'face-batch-group matched';

            const header = document.createElement('div');
            header.className = 'face-batch-header';
            header.innerHTML = `
                <div class="face-batch-title">
                    ✓ ${totalFaces} faces match <strong>${bestMatch.name}</strong>
                    <span class="face-batch-similarity">(${bestMatch.similarity_percent}% confidence)</span>
                </div>
                <button class="face-batch-action-btn primary" data-face-id="${bestMatch.face_id}">
                    ➕ Add All ${totalFaces}
                </button>
            `;

            header.querySelector('.face-batch-action-btn').onclick = () => {
                this.batchAddAllToFace(bestMatch.face_id);
            };

            const facesContainer = document.createElement('div');
            facesContainer.className = 'face-batch-faces';

            this.detectedFaces.forEach((face, index) => {
                const faceWrapper = document.createElement('div');
                faceWrapper.className = 'face-batch-thumb-wrapper';
                faceWrapper.dataset.faceIndex = index;

                const removeBtn = document.createElement('button');
                removeBtn.className = 'face-batch-remove-btn';
                removeBtn.textContent = '✕';
                removeBtn.title = 'Remove this face';
                removeBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.removeDetectedFaceFromBatch(index);
                };

                const faceThumb = document.createElement('img');
                faceThumb.src = face.imageData;
                faceThumb.className = 'face-batch-thumb';
                faceThumb.title = `Confidence: ${(face.confidence * 100).toFixed(1)}%`;

                faceWrapper.appendChild(removeBtn);
                faceWrapper.appendChild(faceThumb);
                facesContainer.appendChild(faceWrapper);
            });

            matchedGroup.appendChild(header);
            matchedGroup.appendChild(facesContainer);
            detectedFacesList.appendChild(matchedGroup);
        }
    }

    async batchAddToFace(faceId, results) {
        const statusEl = document.getElementById('faceExtractionStatus');

        try {
            statusEl.textContent = `Adding ${results.length} faces...`;
            statusEl.className = 'face-extraction-status';

            let successCount = 0;
            let failCount = 0;

            for (const { face } of results) {
                try {
                    // Make sure face has encoding data (search if not)
                    if (!face.encoding) {
                        await this.searchSingleFace(face);
                    }

                    // Create FormData with the encoding data
                    const formData = new FormData();
                    formData.append('encoding', face.encoding);
                    formData.append('thumbnail', face.thumbnail);
                    formData.append('confidence', face.confidence.toString());
                    formData.append('quality_score', (face.quality_score || 0.5).toString());
                    formData.append('video_id', this.currentVideoForFaces.id.toString());
                    formData.append('frame_timestamp', (face.timestamp || 0).toString());

                    const response = await fetch(`${this.apiBase}/api/faces/${faceId}/add-encoding`, {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        successCount++;
                    } else {
                        failCount++;
                    }

                    statusEl.textContent = `Adding faces... ${successCount + failCount}/${results.length}`;

                } catch (error) {
                    failCount++;
                    console.error('Failed to add encoding:', error);
                }
            }

            if (successCount > 0) {
                // Link this face to the current video
                await this.linkFaceToVideo(faceId, this.currentVideoForFaces.id, 'batch_extraction');

                // console.log(`Added ${successCount} face encoding(s)`)
            }
            if (failCount > 0) {
                console.log(`${failCount} face(s) failed to add`)
            }

            statusEl.textContent = '✓ Batch add complete';
            statusEl.className = 'face-extraction-status ready';

            // Clear after successful batch add
            setTimeout(() => {
                this.hideFaceExtractionModal();
            }, 1500);

        } catch (error) {
            console.error('Error batch adding faces:', error);
            statusEl.textContent = '❌ Batch add failed';
            statusEl.className = 'face-extraction-status error';
            console.log('Failed to add faces')
        }
    }

    async batchAddAllToFace(faceId) {
        const statusEl = document.getElementById('faceExtractionStatus');

        try {
            statusEl.textContent = `Adding ${this.detectedFaces.length} faces...`;
            statusEl.className = 'face-extraction-status';

            let successCount = 0;
            let failCount = 0;

            for (const face of this.detectedFaces) {
                try {
                    // Use stored encoding from search, or search if not available
                    if (!face.encoding) {
                        await this.searchSingleFace(face);
                    }

                    // Create FormData with the encoding data
                    const formData = new FormData();
                    formData.append('encoding', face.encoding);
                    formData.append('thumbnail', face.thumbnail);
                    formData.append('confidence', face.confidence.toString());
                    formData.append('quality_score', (face.quality_score || 0.5).toString());
                    formData.append('video_id', this.currentVideoForFaces.id.toString());
                    formData.append('frame_timestamp', (face.timestamp || 0).toString());

                    const response = await fetch(`${this.apiBase}/api/faces/${faceId}/add-encoding`, {
                        method: 'POST',
                        body: formData
                    });

                    if (response.ok) {
                        successCount++;
                    } else {
                        failCount++;
                    }

                    statusEl.textContent = `Adding faces... ${successCount + failCount}/${this.detectedFaces.length}`;

                } catch (error) {
                    failCount++;
                    console.error('Failed to add encoding:', error);
                }
            }

            if (successCount > 0) {
                // console.log(`Added ${successCount} face encoding(s)`)
            }
            if (failCount > 0) {
                console.log(`${failCount} face(s) failed to add`)
            }

            statusEl.textContent = '✓ Batch add complete';
            statusEl.className = 'face-extraction-status ready';

            // Clear after successful batch add
            setTimeout(() => {
                this.hideFaceExtractionModal();
            }, 1500);

        } catch (error) {
            console.error('Error batch adding faces:', error);
            statusEl.textContent = '❌ Batch add failed';
            statusEl.className = 'face-extraction-status error';
            console.log('Failed to add faces')
        }
    }

    createNewFaceAndAddAll(bestFace) {
        // Auto-generate name (backend will create "face-abc123" format)
        this.createNewFaceWithAllEncodings(bestFace, null);
    }

    async createNewFaceWithAllEncodings(bestFace, name) {
        const statusEl = document.getElementById('faceExtractionStatus');

        try {
            statusEl.textContent = 'Creating new face...';
            statusEl.className = 'face-extraction-status';

            // Make sure bestFace has encoding data (search if not)
            if (!bestFace.encoding) {
                await this.searchSingleFace(bestFace);
            }

            // Create new face with best face using FormData
            const formData = new FormData();
            if (name) {
                formData.append('name', name);
            }
            // If name is null/undefined, backend will auto-generate
            formData.append('encoding', bestFace.encoding);
            formData.append('thumbnail', bestFace.thumbnail);
            formData.append('confidence', bestFace.confidence.toString());
            formData.append('quality_score', (bestFace.quality_score || 0.5).toString());
            formData.append('video_id', this.currentVideoForFaces.id.toString());
            formData.append('frame_timestamp', (bestFace.timestamp || 0).toString());

            const response = await fetch(`${this.apiBase}/api/faces/create`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to create face');
            }

            const result = await response.json();
            const newFaceId = result.face_id;
            const createdName = result.name;

            // Link this face to the current video
            await this.linkFaceToVideo(newFaceId, this.currentVideoForFaces.id, 'batch_extraction');

            // console.log(`Created face "${createdName}"`)
            statusEl.textContent = `Adding remaining ${this.detectedFaces.length - 1} faces...`;

            // Add all remaining faces to the new face_id
            let successCount = 1; // Count the first face
            let failCount = 0;

            for (const face of this.detectedFaces) {
                // Skip the best face (already added during creation)
                if (face.index === bestFace.index) {
                    continue;
                }

                try {
                    // Make sure face has encoding data (search if not)
                    if (!face.encoding) {
                        await this.searchSingleFace(face);
                    }

                    // Create FormData with the encoding data
                    const addFormData = new FormData();
                    addFormData.append('encoding', face.encoding);
                    addFormData.append('thumbnail', face.thumbnail);
                    addFormData.append('confidence', face.confidence.toString());
                    addFormData.append('quality_score', (face.quality_score || 0.5).toString());
                    addFormData.append('video_id', this.currentVideoForFaces.id.toString());
                    addFormData.append('frame_timestamp', (face.timestamp || 0).toString());

                    const addResponse = await fetch(`${this.apiBase}/api/faces/${newFaceId}/add-encoding`, {
                        method: 'POST',
                        body: addFormData
                    });

                    if (addResponse.ok) {
                        successCount++;
                    } else {
                        failCount++;
                    }

                    statusEl.textContent = `Adding faces... ${successCount + failCount}/${this.detectedFaces.length}`;

                } catch (error) {
                    failCount++;
                    console.error('Failed to add encoding:', error);
                }
            }

            if (successCount > 0) {
                // console.log(`Added ${successCount} face encoding(s) to "${createdName}"`)
            }
            if (failCount > 0) {
                console.log(`${failCount} face(s) failed to add`)
            }

            statusEl.textContent = '✓ Face created with all encodings';
            statusEl.className = 'face-extraction-status ready';

            // Close modal after short delay
            setTimeout(() => {
                this.hideFaceExtractionModal();
            }, 1500);

        } catch (error) {
            console.error('Error creating face:', error);
            statusEl.textContent = '❌ Failed to create face';
            statusEl.className = 'face-extraction-status error';
            console.log('Failed to create face')
        }
    }

    createNewFaceFromSearch(face = null) {
        // Use the face passed or the first detected face
        const targetFace = face || this.detectedFaces[0];

        if (!targetFace) {
            console.log('No face available')
            return;
        }

        // Close search modal if open
        this.hideFaceSearchModal();

        // Auto-generate name (backend will create "face-abc123" format)
        this.createNewFaceWithEncoding(targetFace, null);
    }

    async createNewFaceWithEncoding(face, name) {
        const statusEl = document.getElementById('faceExtractionStatus');

        try {
            statusEl.textContent = 'Creating new face...';
            statusEl.className = 'face-extraction-status';

            // Make sure face has encoding data (search if not)
            if (!face.encoding) {
                await this.searchSingleFace(face);
            }

            // Create FormData with encoding data
            const formData = new FormData();
            if (name) {
                formData.append('name', name);
            }
            // If name is null/undefined, backend will auto-generate
            formData.append('encoding', face.encoding);
            formData.append('thumbnail', face.thumbnail);
            formData.append('confidence', face.confidence.toString());
            formData.append('quality_score', (face.quality_score || 0.5).toString());
            formData.append('video_id', this.currentVideoForFaces.id.toString());
            formData.append('frame_timestamp', (face.timestamp || 0).toString());

            const response = await fetch(`${this.apiBase}/api/faces/create`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to create face');
            }

            const result = await response.json();
            // console.log(`Created face "${result.name}"`)

            statusEl.textContent = '✓ Face created';
            statusEl.className = 'face-extraction-status ready';

            // Close modal after short delay
            setTimeout(() => {
                this.hideFaceExtractionModal();
            }, 1500);

        } catch (error) {
            console.error('Error creating face:', error);
            statusEl.textContent = '❌ Failed to create face';
            statusEl.className = 'face-extraction-status error';
            console.log('Failed to create face')
        }
    }

    // OLD MODAL-BASED METHODS (no longer used, kept for reference)
    // captureCurrentFrame() - REMOVED (conflicts with new full-screen view method)
    // The new method is defined earlier in the file at line ~7614

    async detectFacesInFrame() {
        if (!this.currentFrameData || !this.faceApiLoaded) {
            return;
        }

        const canvas = document.getElementById('frameCanvas');
        const overlayCanvas = document.getElementById('faceOverlayCanvas');
        const statusEl = document.getElementById('faceExtractionStatus');

        try {
            statusEl.textContent = 'Detecting faces...';
            statusEl.className = 'face-extraction-status';

            // Detect faces with landmarks
            const detections = await faceapi
                .detectAllFaces(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks();

            if (detections.length === 0) {
                console.log('No faces detected in this frame')
                statusEl.textContent = '✓ Face detection ready';
                statusEl.className = 'face-extraction-status ready';
                return;
            }

            // Draw bounding boxes on overlay canvas
            overlayCanvas.width = canvas.width;
            overlayCanvas.height = canvas.height;

            const displaySize = { width: canvas.width, height: canvas.height };
            faceapi.matchDimensions(overlayCanvas, displaySize);

            const resizedDetections = faceapi.resizeResults(detections, displaySize);
            faceapi.draw.drawDetections(overlayCanvas, resizedDetections);
            faceapi.draw.drawFaceLandmarks(overlayCanvas, resizedDetections);

            // Extract face crops with generous padding for backend processing
            this.detectedFaces = [];
            for (let i = 0; i < detections.length; i++) {
                const detection = detections[i];
                const box = detection.detection.box;

                // Add generous padding (50% of face size) for better backend detection
                const paddingPercent = 0.5; // 50% padding on each side
                const paddingX = box.width * paddingPercent;
                const paddingY = box.height * paddingPercent;

                const x = Math.max(0, box.x - paddingX);
                const y = Math.max(0, box.y - paddingY);
                const width = Math.min(canvas.width - x, box.width + paddingX * 2);
                const height = Math.min(canvas.height - y, box.height + paddingY * 2);

                // Skip faces that are too small (InsightFace needs minimum 112x112)
                if (width < 80 || height < 80) {
                    console.warn(`Skipping small face ${i}: ${width}x${height}`);
                    continue;
                }

                // Create temporary canvas for face crop with higher resolution
                const faceCanvas = document.createElement('canvas');
                faceCanvas.width = width;
                faceCanvas.height = height;
                const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });

                // Use high-quality image smoothing
                faceCtx.imageSmoothingEnabled = true;
                faceCtx.imageSmoothingQuality = 'high';

                faceCtx.drawImage(canvas, x, y, width, height, 0, 0, width, height);

                // Use higher JPEG quality for backend processing
                const faceImageData = faceCanvas.toDataURL('image/jpeg', 0.95);

                console.log(`✓ Extracted face ${i}: ${Math.round(width)}x${Math.round(height)}px, confidence: ${detection.detection.score.toFixed(2)}`);

                this.detectedFaces.push({
                    index: i,
                    confidence: detection.detection.score,
                    box: { x, y, width, height },
                    imageData: faceImageData
                });
            }

            // Display detected faces
            this.displayDetectedFaces();

            statusEl.textContent = `✓ Found ${detections.length} face(s)`;
            statusEl.className = 'face-extraction-status ready';

        } catch (error) {
            console.error('Error detecting faces:', error);
            statusEl.textContent = '❌ Face detection failed';
            statusEl.className = 'face-extraction-status error';
            console.log('Face detection failed')
        }
    }

    displayDetectedFaces() {
        const detectedFacesList = document.getElementById('detectedFacesList');
        detectedFacesList.innerHTML = '';

        if (this.detectedFaces.length === 0) {
            detectedFacesList.innerHTML = '<div class="no-faces-message">No faces detected. Select frames and click "Detect Faces".</div>';
            return;
        }

        this.detectedFaces.forEach((face, index) => {
            const faceCard = document.createElement('div');
            faceCard.className = 'detected-face-card';
            faceCard.dataset.faceIndex = index;

            faceCard.innerHTML = `
                <button class="face-remove-btn" data-face-index="${index}" title="Remove this face">
                    ✕
                </button>
                <img src="${face.imageData}" class="detected-face-preview" alt="Detected Face ${index + 1}">
                <div class="detected-face-info">
                    <div class="face-confidence">
                        ✓ Confidence: ${(face.confidence * 100).toFixed(1)}%
                    </div>
                    <div class="face-quality">
                        Face #${index + 1}
                    </div>
                </div>
                <div class="face-actions">
                    <button class="face-action-btn primary" data-face-index="${index}">
                        🔍 Search
                    </button>
                </div>
            `;

            // Add remove button listener
            const removeBtn = faceCard.querySelector('.face-remove-btn');
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeDetectedFace(index);
            };

            // Add search button listener
            const searchBtn = faceCard.querySelector('.face-action-btn');
            searchBtn.onclick = () => this.searchForFace(face);

            detectedFacesList.appendChild(faceCard);
        });
    }

    removeDetectedFace(index) {
        // Remove from array
        this.detectedFaces.splice(index, 1);

        // Update all face indices and re-render
        this.detectedFaces.forEach((face, newIndex) => {
            face.index = newIndex;
        });

        // Re-display the faces
        this.displayDetectedFaces();

        // Show feedback
        const statusEl = document.getElementById('faceExtractionStatus');
        if (statusEl) {
            statusEl.textContent = `${this.detectedFaces.length} face(s) remaining`;
            statusEl.className = 'face-extraction-status ready';
        }

        console.log('Face removed')
    }

    async removeDetectedFaceFromBatch(index) {
        // Remove from array
        this.detectedFaces.splice(index, 1);

        // Update all face indices
        this.detectedFaces.forEach((face, newIndex) => {
            face.index = newIndex;
        });

        console.log('Face removed')

        // If no faces left, clear the display
        if (this.detectedFaces.length === 0) {
            const detectedFacesList = document.getElementById('detectedFacesList');
            detectedFacesList.innerHTML = '<div class="no-faces-message">All faces removed. Scan and select frames to detect new faces.</div>';

            const statusEl = document.getElementById('faceExtractionStatus');
            if (statusEl) {
                statusEl.textContent = 'No faces remaining';
                statusEl.className = 'face-extraction-status';
            }
            return;
        }

        // Re-run the smart search with remaining faces
        const statusEl = document.getElementById('faceExtractionStatus');
        if (statusEl) {
            statusEl.textContent = `Re-analyzing ${this.detectedFaces.length} remaining face(s)...`;
            statusEl.className = 'face-extraction-status';
        }

        try {
            // Find the best face (highest confidence)
            const bestFace = this.detectedFaces.reduce((best, current) => {
                return (current.confidence > best.confidence) ? current : best;
            });

            // Search for the best face
            const searchData = await this.searchSingleFace(bestFace);

            // Re-display with updated search results
            this.displaySmartBatchResult(searchData, bestFace);

            statusEl.textContent = `✓ ${this.detectedFaces.length} face(s) remaining`;
            statusEl.className = 'face-extraction-status ready';

        } catch (error) {
            console.error('Error re-analyzing faces:', error);
            statusEl.textContent = '❌ Analysis failed';
            statusEl.className = 'face-extraction-status error';
        }
    }

    async searchForFace(face) {
        if (!this.currentVideoForFaces) {
            console.log('No video context available')
            return;
        }

        const videoPlayer = document.getElementById('videoPlayer');
        const currentTime = videoPlayer.currentTime;

        try {
            console.log('Searching for similar faces...')

            console.log(`🔍 Searching for face: ${Math.round(face.box.width)}x${Math.round(face.box.height)}px, confidence: ${face.confidence.toFixed(2)}`);

            // Convert base64 to blob
            const response = await fetch(face.imageData);
            const blob = await response.blob();

            console.log(`📤 Sending face image to backend: ${(blob.size / 1024).toFixed(1)} KB`);

            // Create form data
            const formData = new FormData();
            formData.append('face_image', blob, 'face.jpg');
            formData.append('video_id', this.currentVideoForFaces.id);
            formData.append('frame_timestamp', currentTime);
            formData.append('threshold', '0.4');

            // Search for similar faces
            const searchResponse = await fetch(`${this.apiBase}/api/faces/search`, {
                method: 'POST',
                body: formData
            });

            if (!searchResponse.ok) {
                const errorText = await searchResponse.text();
                console.error('❌ Backend face search failed:', errorText);
                throw new Error(`Backend error: ${errorText}`);
            }

            const searchResult = await searchResponse.json();
            console.log(`✓ Backend found ${searchResult.matches.length} matches, confidence: ${(searchResult.confidence * 100).toFixed(1)}%`);

            // Store search data for later use
            this.currentFaceSearchData = {
                face: face,
                videoId: this.currentVideoForFaces.id,
                frameTimestamp: currentTime,
                encoding: searchResult.encoding,
                thumbnail: searchResult.thumbnail,
                confidence: searchResult.confidence,
                quality_score: searchResult.quality_score,
                matches: searchResult.matches || []
            };

            // Show search results modal
            this.showFaceSearchModal(this.currentFaceSearchData);

        } catch (error) {
            console.error('Error searching for face:', error);
            console.log(`Face search failed: ${error.message}`)
        }
    }

    showFaceSearchResults(face, matches) {
        // Format search data for the modal
        const searchData = {
            face: face,
            confidence: face.confidence,
            quality_score: face.quality_score || 0.5,
            matches: matches
        };

        // Show the face search modal with formatted data
        this.showFaceSearchModal(searchData);
    }

    showFaceSearchModal(searchData) {
        const modal = document.getElementById('faceSearchModal');
        const queryImage = document.getElementById('queryFaceImage');
        const queryInfo = document.getElementById('queryFaceInfo');
        const resultsContainer = document.getElementById('faceSearchResults');

        // Display query face with stats stacked vertically next to it (aligned to face height)
        queryImage.src = searchData.face.imageData;
        queryInfo.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px; flex: 1; height: 108px;">
                <div style="flex: 1; background: #f3f4f6; padding: 6px 8px; border-radius: 6px; text-align: center; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-size: 20px; font-weight: 700; color: #6366f1; line-height: 1;">${(searchData.confidence * 100).toFixed(1)}%</div>
                    <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px;">Confidence</div>
                </div>
                <div style="flex: 1; background: #f3f4f6; padding: 6px 8px; border-radius: 6px; text-align: center; display: flex; flex-direction: column; justify-content: center;">
                    <div style="font-size: 20px; font-weight: 700; color: #10b981; line-height: 1;">${(searchData.quality_score * 100).toFixed(0)}%</div>
                    <div style="font-size: 10px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px;">Quality</div>
                </div>
            </div>
        `;

        // Display search results
        if (searchData.matches.length === 0) {
            const totalFaces = this.detectedFaces.length;
            resultsContainer.innerHTML = `
                <div class="face-search-no-results">
                    <p>No matching faces found in catalog.</p>
                    <p>${totalFaces > 1 ? `Create new face and add all ${totalFaces} detected faces.` : 'Click "Create New Face" to add this face to your catalog.'}</p>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = '';

            searchData.matches.forEach((match, index) => {
                const matchCard = document.createElement('div');
                matchCard.className = 'face-search-match-card';
                matchCard.dataset.faceId = match.face_id;
                matchCard.style.cssText = 'border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px; background: white; position: relative;';

                // Determine color based on similarity percentage
                let badgeColor = '';
                if (match.similarity_percent >= 85) {
                    badgeColor = 'background: #d1fae5; color: #065f46;'; // Green for high confidence
                } else if (match.similarity_percent >= 70) {
                    badgeColor = 'background: #fef3c7; color: #92400e;'; // Yellow for moderate
                } else {
                    badgeColor = 'background: #fee2e2; color: #991b1b;'; // Red for low confidence
                }

                // Header: Checkbox + Face name + colored similarity badge
                const header = document.createElement('div');
                header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px;';

                // Add checkbox
                const checkboxDiv = document.createElement('div');
                checkboxDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-shrink: 0;';
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'face-search-match-checkbox';
                checkbox.dataset.faceId = match.face_id;
                checkbox.checked = true; // Default to checked
                checkbox.style.cssText = 'width: 18px; height: 18px; cursor: pointer;';
                checkboxDiv.appendChild(checkbox);

                // Create name and actor container
                const nameActorContainer = document.createElement('div');
                nameActorContainer.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;';

                const nameSpan = document.createElement('span');
                nameSpan.style.cssText = 'font-weight: 600; font-size: 14px; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                nameSpan.textContent = `Match #${index + 1}: ${match.name}`;
                nameActorContainer.appendChild(nameSpan);

                // Add actor name if available
                if (match.actor_name) {
                    const actorSpan = document.createElement('span');
                    actorSpan.style.cssText = 'font-size: 12px; color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
                    actorSpan.textContent = `👤 ${match.actor_name}`;
                    nameActorContainer.appendChild(actorSpan);
                }

                checkboxDiv.appendChild(nameActorContainer);

                header.appendChild(checkboxDiv);

                const badgeDiv = document.createElement('div');
                badgeDiv.style.cssText = `font-size: 18px; font-weight: 700; padding: 6px 12px; border-radius: 6px; flex-shrink: 0; ${badgeColor}`;
                badgeDiv.textContent = `${match.similarity_percent}%`;
                header.appendChild(badgeDiv);

                matchCard.appendChild(header);

                // Main content: Thumbnail + Actions
                const mainContent = document.createElement('div');
                mainContent.style.cssText = 'display: flex; gap: 16px; margin-bottom: 12px;';

                // Left: Main thumbnail with fallback logic
                const thumbnailDiv = document.createElement('div');
                thumbnailDiv.style.cssText = 'flex-shrink: 0;';
                const mainThumb = document.createElement('img');

                // Thumbnail fallback: primary encoding -> best from all encodings -> search data thumbnail
                let mainThumbnailData = match.matched_encodings[0].thumbnail;
                if (!mainThumbnailData) {
                    const bestWithThumb = match.matched_encodings.find(e => e.thumbnail);
                    mainThumbnailData = bestWithThumb ? bestWithThumb.thumbnail : searchData.thumbnail;
                }

                mainThumb.src = `data:image/jpeg;base64,${mainThumbnailData}`;
                mainThumb.style.cssText = 'width: 90px; height: 90px; object-fit: cover; border-radius: 8px; border: 2px solid #e5e7eb;';
                mainThumb.onerror = () => { mainThumb.style.display = 'none'; };
                thumbnailDiv.appendChild(mainThumb);
                mainContent.appendChild(thumbnailDiv);

                // Right: Action buttons (stacked vertically, aligned to face height)
                const rightSection = document.createElement('div');
                rightSection.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 8px; height: 90px;';

                // Different buttons for image search vs video search
                if (searchData.isImageSearch) {
                    // Image search: just add encoding (no linking to video)
                    const addButton = document.createElement('button');
                    addButton.className = 'face-search-add-btn';
                    addButton.innerHTML = `Add to ${match.name}`;
                    addButton.style.cssText = `flex: 1; width: 100%; font-size: 13px; border-radius: 6px; cursor: pointer; text-align: center; background: #6366f1; color: white; border: 1px solid #4f46e5; font-weight: 500;`;
                    addButton.onclick = () => this.addEncodingFromImageSearch(match.face_id, match.name);

                    rightSection.appendChild(addButton);
                } else {
                    // Video search: link and optionally add encoding
                    const linkButton = document.createElement('button');
                    linkButton.className = 'face-search-add-btn';
                    linkButton.innerHTML = `Just Link`;
                    linkButton.style.cssText = `flex: 1; width: 100%; font-size: 13px; border-radius: 6px; cursor: pointer; text-align: center; background: #e5e7eb; color: #374151; border: 1px solid #d1d5db; font-weight: 500;`;
                    linkButton.onclick = () => this.addEncodingToFace(match.face_id, match.name);

                    const trainingButton = document.createElement('button');
                    trainingButton.className = 'face-search-add-btn';
                    trainingButton.innerHTML = `Link & Add`;
                    trainingButton.style.cssText = `flex: 1; width: 100%; font-size: 13px; border-radius: 6px; cursor: pointer; text-align: center; background: #6366f1; color: white; border: 1px solid #4f46e5; font-weight: 500;`;
                    trainingButton.onclick = () => this.addEncodingAndLinkToFace(match.face_id, match.name);

                    rightSection.appendChild(linkButton);
                    rightSection.appendChild(trainingButton);
                }

                mainContent.appendChild(rightSection);
                matchCard.appendChild(mainContent);

                // Encodings preview row
                const encodingsSection = document.createElement('div');
                encodingsSection.style.cssText = 'border-top: 1px solid #e5e7eb; padding-top: 12px;';

                const encodingsLabel = document.createElement('div');
                encodingsLabel.style.cssText = 'font-size: 11px; color: #6b7280; margin-bottom: 6px; font-weight: 500;';
                encodingsLabel.textContent = `Encodings (${match.matched_encodings.length} samples):`;
                encodingsSection.appendChild(encodingsLabel);

                const encodingsRow = document.createElement('div');
                encodingsRow.style.cssText = 'display: flex; gap: 6px; flex-wrap: wrap;';

                match.matched_encodings.forEach(encoding => {
                    const encodingThumb = document.createElement('div');
                    encodingThumb.style.cssText = 'position: relative; width: 55px; height: 55px; cursor: pointer;';

                    const img = document.createElement('img');
                    // Thumbnail fallback: use encoding's own thumbnail first, fall back to main if missing
                    const thumbData = encoding.thumbnail || (match.matched_encodings.find(e => e.thumbnail && e !== encoding)?.thumbnail);
                    img.src = thumbData ? `data:image/jpeg;base64,${thumbData}` : '';
                    img.style.cssText = 'width: 100%; height: 100%; object-fit: cover; border-radius: 4px; border: 1px solid #d1d5db;';
                    img.onerror = () => { img.style.display = 'none'; };

                    const badge = document.createElement('div');
                    badge.style.cssText = 'position: absolute; bottom: 2px; right: 2px; background: rgba(0,0,0,0.75); color: white; padding: 2px 4px; border-radius: 3px; font-size: 10px; font-weight: 600;';
                    badge.textContent = `${encoding.similarity_percent}%`;

                    encodingThumb.appendChild(img);
                    encodingThumb.appendChild(badge);

                    // Hover tooltip
                    encodingThumb.title = `Similarity: ${encoding.similarity_percent}%\nConfidence: ${(encoding.confidence * 100).toFixed(1)}%\nQuality: ${(encoding.quality_score * 100).toFixed(0)}%`;

                    // Enhanced hover effect
                    encodingThumb.onmouseenter = () => {
                        img.style.transform = 'scale(1.1)';
                        img.style.transition = 'transform 0.2s';
                        img.style.border = '2px solid #6366f1';
                    };
                    encodingThumb.onmouseleave = () => {
                        img.style.transform = 'scale(1)';
                        img.style.border = '1px solid #d1d5db';
                    };

                    encodingsRow.appendChild(encodingThumb);
                });

                encodingsSection.appendChild(encodingsRow);
                matchCard.appendChild(encodingsSection);

                resultsContainer.appendChild(matchCard);
            });

            // Merge multiple matches button (if 2+ matches found)
            if (searchData.matches.length > 1) {
                const mergeSection = document.createElement('div');
                mergeSection.style.cssText = 'margin-top: 16px; padding: 12px; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 6px;';

                const mergeLabel = document.createElement('div');
                mergeLabel.style.cssText = 'font-size: 12px; color: #92400e; margin-bottom: 8px; font-weight: 500;';
                mergeLabel.textContent = `💡 Check the faces you want to merge (primary is the first checked):`;
                mergeSection.appendChild(mergeLabel);

                const mergeButton = document.createElement('button');
                mergeButton.id = 'mergeSelectedFacesBtn';
                mergeButton.innerHTML = `🔀 Merge Selected`;
                mergeButton.style.cssText = 'width: 100%; background: #f59e0b; color: white; font-weight: 600; padding: 10px; border: 1px solid #d97706; border-radius: 6px; cursor: pointer; font-size: 13px;';
                mergeButton.onclick = () => {
                    const selectedCheckboxes = document.querySelectorAll('.face-search-match-checkbox:checked');
                    if (selectedCheckboxes.length < 2) {
                        alert('Please select at least 2 faces to merge');
                        return;
                    }
                    const selectedMatches = Array.from(selectedCheckboxes).map(cb =>
                        searchData.matches.find(m => m.face_id === parseInt(cb.dataset.faceId))
                    );
                    this.mergeSearchResults(selectedMatches);
                };

                mergeSection.appendChild(mergeButton);
                resultsContainer.appendChild(mergeSection);
            }

            // Bulk add button at the bottom (only if multiple faces detected)
            if (this.detectedFaces.length > 1) {
                const bulkSection = document.createElement('div');
                bulkSection.style.cssText = 'margin-top: 16px; padding-top: 16px; border-top: 2px solid #e5e7eb;';

                const bulkButton = document.createElement('button');
                bulkButton.className = 'face-search-add-btn primary';
                bulkButton.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; gap: 3px;">
                    <span style="font-size: 14px; font-weight: 600;">✓ Add ALL ${this.detectedFaces.length} Faces to ${searchData.matches[0].name}</span>
                    <span style="font-size: 11px; opacity: 0.9;">Links all detected faces + adds first as training sample</span>
                </div>`;
                bulkButton.style.cssText = 'width: 100%; background: #8b5cf6; color: white; font-weight: 600; padding: 12px; border: 2px solid #7c3aed; border-radius: 6px; cursor: pointer;';
                bulkButton.onclick = () => this.bulkAddAllFacesToFaceId(searchData.matches[0].face_id, searchData.matches[0].name);

                bulkSection.appendChild(bulkButton);
                resultsContainer.appendChild(bulkSection);
            }
        }

        // Hide the overlay now that we're showing the modal
        this.hideFaceSearchOverlay();

        modal.style.display = 'flex';

        // ✨ Re-attach event handlers to ensure they work (defensive programming)
        // This ensures the buttons work even if they were somehow detached
        const closeBtn = document.getElementById('closeFaceSearchModal');
        const cancelBtn = document.getElementById('cancelFaceSearchBtn');
        const createBtn = document.getElementById('createNewFaceBtn');

        console.log('🔍 Modal buttons found:', {
            closeBtn: !!closeBtn,
            cancelBtn: !!cancelBtn,
            createBtn: !!createBtn
        });

        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('✖️ Close button clicked');
                this.hideFaceSearchModal();
            };
        } else {
            console.warn('⚠️ Close button not found!');
        }

        if (cancelBtn) {
            cancelBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('❌ Cancel button clicked');
                this.hideFaceSearchModal();
            };
        } else {
            console.warn('⚠️ Cancel button not found!');
        }

        if (createBtn) {
            createBtn.onclick = (e) => {
                e.stopPropagation();
                console.log('➕ Create new face button clicked');
                this.createNewFaceFromSearch();
            };
        } else {
            console.warn('⚠️ Create new face button not found!');
        }
    }

    hideFaceSearchModal() {
        console.log('🔽 Closing face search modal');
        const modal = document.getElementById('faceSearchModal');
        modal.style.display = 'none';
    }

    async mergeSearchResults(matches) {
        /**
         * Merge multiple faces found in search results into the first match
         */
        if (matches.length < 2) return;

        try {
            const primaryFaceId = matches[0].face_id;
            const secondaryFaceIds = matches.slice(1).map(m => m.face_id);

            // Confirmation dialog
            const confirmed = confirm(
                `Merge ${matches.length} faces into "${matches[0].name}"?\n\n` +
                `Secondary faces: ${matches.slice(1).map(m => m.name).join(', ')}\n\n` +
                `This will consolidate all encodings and video links.`
            );

            if (!confirmed) return;

            const response = await fetch(`${this.apiBase}/api/faces/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_ids: [primaryFaceId, ...secondaryFaceIds]
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Merge failed');
            }

            console.log(`✅ Merged ${matches.length} faces into "${matches[0].name}"`)

            // Hide modal and stay in current video view
            this.hideFaceSearchModal();
            // Refresh current video to see updated face info
            if (this.currentPlayingVideo) {
                setTimeout(() => {
                    this.refreshVideoFromContext();
                }, 500);
            }

        } catch (error) {
            console.error('Error merging search results:', error);
            console.log(`Merge failed: ${error.message}`)
        }
    }

    async createNewFaceFromSearch() {
        if (!this.currentFaceSearchData) {
            return;
        }

        const data = this.currentFaceSearchData;

        try {
            // console.log('Creating new face in catalog...')

            // Create form data
            const formData = new FormData();
            formData.append('encoding', data.encoding);
            formData.append('thumbnail', data.thumbnail);
            formData.append('confidence', data.confidence);
            formData.append('quality_score', data.quality_score);

            // Only include video context if available (skip for image search)
            if (data.videoId && data.videoId !== -1) {
                formData.append('video_id', data.videoId);
                formData.append('frame_timestamp', data.frameTimestamp);
            } else {
                // For image search, use dummy timestamp
                formData.append('frame_timestamp', '0');
            }

            // Create new face
            const response = await fetch(`${this.apiBase}/api/faces/create`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Failed to create face:', errorText);
                throw new Error(`Failed to create face: ${errorText}`);
            }

            const result = await response.json();

            // Link to video/image if we have a valid context
            if (data.videoId && data.videoId !== -1) {
                // ✨ IMMEDIATELY link this face to the current video
                const linkSuccess = await this.linkFaceToVideo(result.face_id, data.videoId, 'manual_search');

                if (linkSuccess) {
                    console.log(`✓ New face ${result.face_id} linked to video ${data.videoId} immediately`);

                    // Update the current video in memory to show face icon immediately
                    await this.refreshVideoFaces(data.videoId);
                }
            } else if (data.isImageSearch && data.imageId) {
                // ✨ Link new face to image
                const linkSuccess = await this.linkFaceToVideo(result.face_id, data.imageId, 'manual_search');

                if (linkSuccess) {
                    console.log(`✓ New face ${result.face_id} linked to image ${data.imageId} (${data.imageName}) immediately`);

                    // Update the current image in memory to show face icon immediately
                    await this.refreshVideoFaces(data.imageId);
                }
            }

            // console.log(`✓ Created new face: ${result.name}`)
            this.hideFaceSearchModal();

            // Check if we're in bulk mode (auto-scan with multiple selected faces)
            if (data.bulkMode && this.pendingBulkFaces && this.pendingBulkFaces.length > 1) {
                // Bulk mode: Automatically add all remaining faces (skip first one, already added)
                const remainingFaces = this.pendingBulkFaces.slice(1);
                const totalFaces = remainingFaces.length;

                if (totalFaces > 0) {
                    console.log(`Adding ${totalFaces} more training samples to ${result.name}...`)

                    let successCount = 0;
                    let failCount = 0;

                    // Process each remaining face
                    for (let i = 0; i < remainingFaces.length; i++) {
                        const face = remainingFaces[i];

                        console.log(`Adding face ${i + 1}/${totalFaces} to new face ${result.name}...`);

                        try {
                            // Search this face to get encoding
                            const searchResult = await this.searchSingleFace(face);

                            if (searchResult && searchResult.encoding) {
                                // Add encoding to the new face
                                const encFormData = new FormData();
                                encFormData.append('encoding', searchResult.encoding);
                                encFormData.append('thumbnail', searchResult.thumbnail);
                                encFormData.append('confidence', searchResult.confidence);
                                encFormData.append('quality_score', searchResult.quality_score);
                                encFormData.append('video_id', data.videoId.toString());
                                encFormData.append('frame_timestamp', (face.frameIndex || 0).toString());

                                const encResponse = await fetch(`${this.apiBase}/api/faces/${result.face_id}/add-encoding`, {
                                    method: 'POST',
                                    body: encFormData
                                });

                                if (encResponse.ok) {
                                    successCount++;
                                    console.log(`✓ Added face ${i + 1}/${totalFaces} to ${result.name}`);
                                } else {
                                    failCount++;
                                    console.error(`Failed to add face ${i + 1}:`, await encResponse.text());
                                }
                            } else {
                                failCount++;
                                console.error(`No encoding for face ${i + 1}`);
                            }
                        } catch (error) {
                            console.error(`Error processing face ${i + 1}:`, error);
                            failCount++;
                        }
                    }

                    if (successCount > 0) {
                        console.log(`✓ Created ${result.name} with ${successCount + 1} training samples`)
                    } else {
                        console.log(`✓ Created ${result.name}, but failed to add remaining samples`)
                    }
                }

                // Clear pending bulk faces
                this.pendingBulkFaces = null;

            } else if (this.detectedFaces.length > 1) {
                // Normal mode: Ask if they want to add all detected faces
                setTimeout(() => {
                    if (confirm(`Add all ${this.detectedFaces.length} detected faces to ${result.name}?`)) {
                        this.bulkAddAllFacesToFaceId(result.face_id, result.name);
                    }
                }, 500);
            }

        } catch (error) {
            console.error('Error creating face:', error);
            console.log('Failed to create new face')
        }
    }

    async addEncodingToFace(faceId, faceName) {
        /**
         * Link a matched face to the current video (no encoding added)
         * When search finds a match, we just need to link - not store duplicate encoding
         */
        if (!this.currentFaceSearchData) {
            return;
        }

        const data = this.currentFaceSearchData;

        try {
            console.log(`Linking face to video...`)

            // Just link the face to the video (no encoding added)
            const linkSuccess = await this.linkFaceToVideo(faceId, data.videoId, 'manual_search');

            if (linkSuccess) {
                console.log(`✓ Face ${faceId} linked to video ${data.videoId} (search match)`);

                // Update the current video in memory to show face icon immediately
                await this.refreshVideoFaces(data.videoId);

                // console.log(`✓ Linked ${faceName || 'face'} to this video`)
            } else {
                console.log('Failed to link face to video')
            }

            this.hideFaceSearchModal();

            // Stay in extraction view so user can continue working

        } catch (error) {
            console.error('Error linking face:', error);
            console.log('Failed to link face to video')
        }
    }

    async addEncodingFromImageSearch(faceId, faceName) {
        /**
         * Add a face encoding from image search (no video linking)
         * Used when searching for faces from static image files
         */
        if (!this.currentFaceSearchData) {
            return;
        }

        const data = this.currentFaceSearchData;

        try {
            console.log(`Adding face encoding to ${faceName}...`)

            // Add encoding to existing face (from image search, no video context)
            const formData = new FormData();
            formData.append('encoding', data.encoding);
            formData.append('thumbnail', data.thumbnail);
            formData.append('confidence', data.confidence);
            formData.append('quality_score', data.quality_score);
            formData.append('frame_timestamp', '0');  // Dummy timestamp for image-sourced encodings

            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/add-encoding`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('❌ Failed to add encoding:', errorText);
                throw new Error(`Failed to add encoding: ${errorText}`);
            }

            const result = await response.json();

            // Check if encoding was actually added or if it was a duplicate
            if (!result.success) {
                console.log(`ℹ️ ${result.message}`, result);
                console.log(result.message)
                this.hideFaceSearchModal();
                return;
            }

            console.log(`✓ Added face encoding to ${faceName}:`, result);

            // Link face to image if we have image context
            if (data.isImageSearch && data.imageId) {
                const linkSuccess = await this.linkFaceToVideo(faceId, data.imageId, 'manual_search');

                if (linkSuccess) {
                    console.log(`✓ Face ${faceId} linked to image ${data.imageId} (${data.imageName})`);
                    await this.refreshVideoFaces(data.imageId);
                }
            }

            console.log(`✓ Added encoding to ${faceName}`)
            this.hideFaceSearchModal();

        } catch (error) {
            console.error('Error adding encoding:', error);
            console.log(`Failed to add encoding: ${error.message}`)
        }
    }

    async addEncodingAndLinkToFace(faceId, faceName) {
        /**
         * Add encoding to face AND link to video
         * Use this when face has significant variance (angle, lighting, expression)
         * Improves recognition accuracy with diverse training samples
         *
         * In bulk mode (auto-scan), adds ALL selected faces as training samples
         */
        if (!this.currentFaceSearchData) {
            return;
        }

        const data = this.currentFaceSearchData;

        try {
            // Check if we're in bulk mode (auto-scan with multiple selected faces)
            if (data.bulkMode && this.pendingBulkFaces && this.pendingBulkFaces.length > 1) {
                // Bulk mode: Add all selected faces as training samples
                const totalFaces = this.pendingBulkFaces.length;
                console.log(`Adding ${totalFaces} training samples for ${faceName}...`)

                this.hideFaceSearchModal();

                let successCount = 0;
                let failCount = 0;

                // Process each selected face
                for (let i = 0; i < this.pendingBulkFaces.length; i++) {
                    const face = this.pendingBulkFaces[i];

                    console.log(`Processing face ${i + 1}/${totalFaces} for ${faceName}...`);

                    try {
                        // Search this face to get encoding
                        const searchResult = await this.searchSingleFace(face);

                        if (searchResult && searchResult.encoding) {
                            // Add encoding to face
                            const formData = new FormData();
                            formData.append('encoding', searchResult.encoding);
                            formData.append('thumbnail', searchResult.thumbnail);
                            formData.append('confidence', searchResult.confidence);
                            formData.append('quality_score', searchResult.quality_score);
                            formData.append('video_id', data.videoId.toString());
                            formData.append('frame_timestamp', (face.frameIndex || 0).toString());

                            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/add-encoding`, {
                                method: 'POST',
                                body: formData
                            });

                            if (response.ok) {
                                successCount++;
                                console.log(`✓ Added face ${i + 1}/${totalFaces} to ${faceName}`);
                            } else {
                                failCount++;
                                console.error(`Failed to add face ${i + 1}:`, await response.text());
                            }
                        } else {
                            failCount++;
                            console.error(`No encoding for face ${i + 1}`);
                        }
                    } catch (error) {
                        console.error(`Error processing face ${i + 1}:`, error);
                        failCount++;
                    }
                }

                // Link the face to the video once after all encodings are added
                if (successCount > 0) {
                    const linkSuccess = await this.linkFaceToVideo(faceId, data.videoId, 'auto_scan');

                    if (linkSuccess) {
                        console.log(`✓ Face ${faceId} linked to video ${data.videoId} after bulk add`);
                        await this.refreshVideoFaces(data.videoId);
                        // console.log(`✓ Added ${successCount}/${totalFaces} training samples & linked ${faceName}`)
                    } else {
                        // console.log(`✓ Added ${successCount}/${totalFaces} training samples, but link failed`)
                    }
                } else {
                    console.log(`Failed to add training samples`)
                }

                // Clear pending bulk faces
                this.pendingBulkFaces = null;

            } else {
                // Normal mode: Add single encoding
                console.log(`Adding training sample for ${faceName}...`)

                // Create form data with the encoding
                const formData = new FormData();
                formData.append('encoding', data.encoding);
                formData.append('thumbnail', data.thumbnail);
                formData.append('confidence', data.confidence.toString());
                formData.append('quality_score', (data.quality_score || 0.5).toString());
                formData.append('video_id', data.videoId.toString());
                formData.append('frame_timestamp', (data.frameTimestamp || 0).toString());

                // Add encoding to the face
                const response = await fetch(`${this.apiBase}/api/faces/${faceId}/add-encoding`, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.detail || 'Failed to add encoding');
                }

                const result = await response.json();
                console.log(`✓ Added encoding to ${faceName}:`, result);

                // Also link the face to the video
                const linkSuccess = await this.linkFaceToVideo(faceId, data.videoId, 'manual_search');

                if (linkSuccess) {
                    console.log(`✓ Face ${faceId} linked to video ${data.videoId}`);

                    // Update the current video in memory to show face icon immediately
                    await this.refreshVideoFaces(data.videoId);

                    // console.log(`✓ Added training sample & linked ${faceName}`)
                } else {
                    // console.log(`✓ Added training sample, but link failed`)
                }

                this.hideFaceSearchModal();
            }

        } catch (error) {
            console.error('Error adding encoding and linking:', error);
            console.log(error.message || 'Failed to add encoding')
        }
    }

    async bulkAddAllFacesToFaceId(faceId, faceName) {
        const totalFaces = this.detectedFaces.length;

        if (totalFaces === 0) {
            console.log('No faces to add')
            return;
        }

        try {
            this.hideFaceSearchModal();

            let successCount = 0;
            let failCount = 0;

            // Process each face
            for (let i = 0; i < this.detectedFaces.length; i++) {
                const face = this.detectedFaces[i];

                // Update status
                const statusEl = document.getElementById('faceDetectionStatus');
                if (statusEl) {
                    statusEl.textContent = `Adding ${i + 1}/${totalFaces} faces to ${faceName}...`;
                }

                try {
                    // Search this face to get encoding
                    const searchResult = await this.searchSingleFace(face);

                    if (searchResult && searchResult.encoding) {
                        // Add encoding to face
                        const formData = new FormData();
                        formData.append('encoding', searchResult.encoding);
                        formData.append('thumbnail', searchResult.thumbnail);
                        formData.append('confidence', searchResult.confidence);
                        formData.append('quality_score', searchResult.quality_score);
                        formData.append('video_id', this.currentVideoForFaces.id);
                        formData.append('frame_timestamp', face.timestamp || 0);

                        const response = await fetch(`${this.apiBase}/api/faces/${faceId}/add-encoding`, {
                            method: 'POST',
                            body: formData
                        });

                        if (response.ok) {
                            successCount++;
                        } else {
                            failCount++;
                            console.error(`Failed to add face ${i + 1}:`, await response.text());
                        }
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    console.error(`Error processing face ${i + 1}:`, error);
                    failCount++;
                }
            }

            // ✨ IMMEDIATELY link this face to the current video after bulk add
            if (successCount > 0 && this.currentVideoForFaces) {
                const linkSuccess = await this.linkFaceToVideo(faceId, this.currentVideoForFaces.id, 'batch_extraction');
                if (linkSuccess) {
                    console.log(`✓ Face ${faceId} linked to video ${this.currentVideoForFaces.id} after bulk add`);

                    // Update the current video in memory to show face icon immediately
                    await this.refreshVideoFaces(this.currentVideoForFaces.id);
                }
            }

            // Clear detected faces after successful bulk add
            this.detectedFaces = [];
            this.renderDetectedFaces();

            // Show summary
            const statusEl = document.getElementById('faceDetectionStatus');
            if (statusEl) {
                statusEl.textContent = `✓ Added ${successCount}/${totalFaces} faces to ${faceName}`;
                setTimeout(() => {
                    statusEl.textContent = '';
                }, 3000);
            }

            // console.log(`✓ Added ${successCount} faces to ${faceName}${failCount > 0 ? ` (${failCount} failed)` : ''}`)

        } catch (error) {
            console.error('Error in bulk add:', error);
            console.log('Failed to add faces in bulk')
        }
    }

    async linkFaceToActor(faceId, faceName, currentActorId) {
        try {
            this.linkingFaceId = faceId;
            this.linkingFaceName = faceName;
            this.linkingFaceCurrentActorId = currentActorId;

            // Show modal with search interface
            const modal = document.getElementById('faceDetailModal');
            if (!modal) return;

            // Create overlay for search
            let searchOverlay = document.getElementById('faceActorLinkOverlay');
            if (!searchOverlay) {
                searchOverlay = document.createElement('div');
                searchOverlay.id = 'faceActorLinkOverlay';
                searchOverlay.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0,0,0,0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10006;
                `;
                searchOverlay.innerHTML = `
                    <div style="background: white; border-radius: 8px; padding: 20px; width: 90%; max-width: 400px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);">
                        <h3 style="margin: 0 0 15px 0; font-size: 16px;">Link to Actor</h3>
                        <div style="margin-bottom: 15px;">
                            <input id="faceActorSearchInput" type="text" placeholder="Search actor by name..." 
                                   style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; box-sizing: border-box;" />
                        </div>
                        <div id="faceActorSuggestions" style="max-height: 300px; overflow-y: auto; margin-bottom: 15px; border: 1px solid #f0f0f0; border-radius: 4px;"></div>
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button id="faceActorLinkCancel" style="padding: 8px 16px; background: #f0f0f0; border: 1px solid #ddd; border-radius: 4px; cursor: pointer;">Cancel</button>
                            <button id="faceActorLinkUnlink" style="padding: 8px 16px; background: #ff6b6b; color: white; border: none; border-radius: 4px; cursor: pointer;">Unlink</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(searchOverlay);
            } else {
                searchOverlay.style.display = 'flex';
            }

            // Setup handlers
            const input = document.getElementById('faceActorSearchInput');
            const suggestions = document.getElementById('faceActorSuggestions');
            const cancelBtn = document.getElementById('faceActorLinkCancel');
            const unlinkBtn = document.getElementById('faceActorLinkUnlink');

            input.focus();

            input.addEventListener('input', async (e) => {
                const query = e.target.value.trim();
                suggestions.innerHTML = '';

                if (query.length === 0) {
                    // Show popular actors
                    try {
                        const response = await fetch(`${this.apiBase}/actors/search?limit=10`);
                        const results = await response.json();
                        this.renderActorSuggestions(results, suggestions, '');
                    } catch (error) {
                        console.error('Error loading actors:', error);
                    }
                    return;
                }

                try {
                    const response = await fetch(`${this.apiBase}/actors/search?q=${encodeURIComponent(query)}&limit=10`);
                    const results = await response.json();
                    this.renderActorSuggestions(results, suggestions, query);
                } catch (error) {
                    console.error('Error searching actors:', error);
                }
            });

            cancelBtn.onclick = () => {
                searchOverlay.style.display = 'none';
            };

            unlinkBtn.onclick = async () => {
                await this.confirmActorLink(null, null);
                searchOverlay.style.display = 'none';
            };

            searchOverlay.onclick = (e) => {
                if (e.target === searchOverlay) {
                    searchOverlay.style.display = 'none';
                }
            };

            // Load initial suggestions
            input.dispatchEvent(new Event('input'));

        } catch (error) {
            console.error('Error in linkFaceToActor:', error);
            console.log('Failed to open actor selection')
        }
    }

    renderActorSuggestions(actors, container, searchQuery = '') {
        container.innerHTML = '';

        // Show create new actor option if there's a search query
        if (searchQuery.length > 0 && !actors.some(a => a.name.toLowerCase() === searchQuery.toLowerCase())) {
            const createNew = document.createElement('div');
            createNew.style.cssText = `
                padding: 12px;
                cursor: pointer;
                border-bottom: 2px solid #e5e7eb;
                transition: background 0.2s;
                background: #f0fdf4;
                font-weight: 600;
            `;
            createNew.innerHTML = `
                <div style="font-size: 14px; color: #059669;">+ Create new actor: "${searchQuery}"</div>
            `;
            createNew.onmouseover = () => createNew.style.background = '#dcfce7';
            createNew.onmouseout = () => createNew.style.background = '#f0fdf4';
            createNew.onclick = () => this.createAndLinkNewActor(searchQuery);
            container.appendChild(createNew);
        }

        if (actors.length === 0 && searchQuery.length === 0) {
            container.innerHTML = '<div style="padding: 15px; color: #999; text-align: center;">No actors found</div>';
            return;
        }

        actors.forEach(actor => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 10px;
                cursor: pointer;
                border-bottom: 1px solid #f0f0f0;
                transition: background 0.2s;
            `;
            const isSelected = actor.id === this.linkingFaceCurrentActorId ? '✓ ' : '';
            item.innerHTML = `
                <div style="font-weight: 500; font-size: 14px;">${isSelected}${actor.name}</div>
                <div style="font-size: 12px; color: #999;">📺 ${actor.video_count} videos</div>
            `;
            item.onmouseover = () => item.style.background = '#f5f5f5';
            item.onmouseout = () => item.style.background = '';
            item.onclick = () => this.confirmActorLink(actor.id, actor.name);
            container.appendChild(item);
        });
    }

    async createAndLinkNewActor(actorName) {
        try {
            // Create new actor via POST to /actors endpoint
            const response = await fetch(`${this.apiBase}/actors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: actorName })
            });

            if (!response.ok) {
                throw new Error('Failed to create actor');
            }

            const data = await response.json();
            const newActorId = data.id || data.actor_id;

            // Link face to newly created actor
            await this.confirmActorLink(newActorId, actorName);

        } catch (error) {
            console.error('Error creating new actor:', error);
            console.log('Failed to create new actor')
        }
    }

    async confirmActorLink(actorId, actorName) {
        try {
            const body = actorId === null ? { actor_id: null } : { actor_id: actorId };

            const response = await fetch(`${this.apiBase}/api/faces/${this.linkingFaceId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || 'Failed to link face to actor');
            }

            if (actorId === null) {
                console.log(`✓ Unlinked face from actor`)
            } else {
                console.log(`✓ Linked to actor: ${actorName}`)
            }

            // Close overlay
            const overlay = document.getElementById('faceActorLinkOverlay');
            if (overlay) overlay.style.display = 'none';

            // Update the cached face data locally
            if (this.currentFaceForDetail) {
                this.currentFaceForDetail.actor_id = actorId;
                this.currentFaceForDetail.actor_name = actorName || null;
                this.showFaceDetailModal(this.currentFaceForDetail);
            }

            // Update the face card in the grid without reloading all
            this.updateFaceCardInGrid(this.linkingFaceId, actorId, actorName);

        } catch (error) {
            console.error('Error confirming actor link:', error);
            console.log('Failed to link actor: ' + error.message)
        }
    }

    updateFaceCardInGrid(faceId, actorId, actorName) {
        // Update the face card in the catalog grid without reloading everything
        const faceCard = document.querySelector(`.face-catalog-card[data-face-id="${faceId}"]`);
        if (!faceCard) return;

        // Find the actor name element
        const actorNameEl = faceCard.querySelector('.face-catalog-card-actor');

        if (actorId !== null && actorId !== undefined && actorName) {
            // Show actor name
            if (actorNameEl) {
                actorNameEl.textContent = `👤 ${actorName}`;
            } else {
                // Create the actor name element if it doesn't exist
                const nameEl = faceCard.querySelector('.face-catalog-card-name');
                if (nameEl) {
                    const newActorEl = document.createElement('div');
                    newActorEl.className = 'face-catalog-card-actor';
                    newActorEl.textContent = `👤 ${actorName}`;
                    nameEl.insertAdjacentElement('afterend', newActorEl);
                }
            }
        } else {
            // Remove the actor name display if unlinking
            if (actorNameEl) {
                actorNameEl.remove();
            }
        }

        // Update the cached face data in the catalog
        if (this.faceCatalogData) {
            const faceData = this.faceCatalogData.find(f => f.id === faceId);
            if (faceData) {
                faceData.actor_id = actorId;
                faceData.actor_name = actorName || null;
            }
        }
    }

    async deleteFace(faceId, faceName) {
        if (!confirm(`Delete face "${faceName}" and all its encodings?\n\nThis cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete face');
            }

            console.log(`✓ Deleted face: ${faceName}`)

            // Remove card from UI
            const faceCard = document.querySelector(`.face-catalog-card[data-face-id="${faceId}"]`);
            if (faceCard) {
                faceCard.remove();
            }

            // Update stats
            const statsEl = document.querySelector('.face-catalog-stats');
            if (statsEl) {
                const match = statsEl.textContent.match(/(\d+)\s+face/i);
                if (match) {
                    const currentCount = parseInt(match[1]);
                    const newCount = currentCount - 1;
                    if (newCount === 0) {
                        // Reload to show empty state (force reload on deletion)
                        this.loadFaceCatalogData(true);
                    } else {
                        // Update the count in the stats text
                        statsEl.textContent = statsEl.textContent.replace(/\d+\s+face/i, `${newCount} face`);
                    }
                }
            }

            // Check if the catalog grid is now empty
            const faceListGrid = document.getElementById('faceListGrid');
            if (faceListGrid && faceListGrid.children.length === 0) {
                // Reload to show empty state (force reload on deletion)
                this.loadFaceCatalogData(true);
            }

        } catch (error) {
            console.error('Error deleting face:', error);
            console.log('Failed to delete face')
        }
    }

    async viewFaceVideos(faceId, faceName) {
        try {
            console.log(`Loading videos for: ${faceName}`)

            // Fetch face details including all videos
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch face details');
            }

            const faceDetails = await response.json();

            // Extract unique video IDs from encodings
            const videoIds = [...new Set(faceDetails.encodings.map(enc => enc.video_id))];

            if (videoIds.length === 0) {
                console.log('No videos found for this face')
                return;
            }

            // Close face catalog view
            this.exitFaceCatalogView();

            // Set face filter state
            this.activeFaceFilter = {
                faceId: faceId,
                faceName: faceName,
                videoIds: videoIds,
                videoCount: videoIds.length
            };

            // Filter videos to show only those containing this face
            this.videos = this.allVideos.filter(v => videoIds.includes(v.id));

            // Reset pagination and render filtered videos
            document.getElementById('videoGrid').innerHTML = '';
            this.renderVideoGrid();

            // Show face filter banner
            this.showFaceFilterBanner();

            console.log(`📹 Showing ${videoIds.length} video${videoIds.length !== 1 ? 's' : ''} with: ${faceName}`)

        } catch (error) {
            console.error('Error viewing face videos:', error);
            console.log('Failed to load videos for face')
        }
    }

    showFaceFilterBanner() {
        // Remove existing banner if present
        this.removeFaceFilterBanner();

        const controls = document.querySelector('.controls');
        const banner = document.createElement('div');
        banner.id = 'faceFilterBanner';
        banner.className = 'face-filter-banner';
        banner.innerHTML = `
            <div class="face-filter-info">
                <span class="face-filter-icon">👤</span>
                <span class="face-filter-text">
                    Showing ${this.activeFaceFilter.videoCount} video${this.activeFaceFilter.videoCount !== 1 ? 's' : ''} with:
                    <strong>${this.activeFaceFilter.faceName}</strong>
                </span>
            </div>
            <button id="clearFaceFilterBtn" class="face-filter-clear-btn">
                ✕ Clear Filter
            </button>
        `;

        controls.after(banner);

        // Wire up clear button
        document.getElementById('clearFaceFilterBtn').onclick = () => this.clearFaceFilter();
    }

    removeFaceFilterBanner() {
        const banner = document.getElementById('faceFilterBanner');
        if (banner) {
            banner.remove();
        }
    }

    clearFaceFilter() {
        // Clear face filter state
        this.activeFaceFilter = null;

        // Remove banner
        this.removeFaceFilterBanner();

        // Restore all videos
        this.videos = [...this.allVideos];

        // Re-apply filters and sorting
        this.applyFilters();

        console.log('Face filter cleared')
    }

    // ====================================
    // TAG MANAGER VIEW - Master-Detail Full-Screen
    // ====================================

    async showTagManagerView() {
        // Hide main UI, show tag manager view
        document.getElementById('videoGrid').style.display = 'none';
        document.querySelector('.controls').style.display = 'none';
        document.getElementById('tagManagerView').style.display = 'flex';

        // Initialize state
        this.selectedTag = null;

        // Load tags
        await this.loadTagManagerData();

        // Setup event listeners
        this.setupTagManagerListeners();
    }

    exitTagManagerView() {
        // Hide tag manager, show main UI
        document.getElementById('tagManagerView').style.display = 'none';
        document.getElementById('videoGrid').style.display = 'grid';
        document.querySelector('.controls').style.display = 'block';

        // Refresh main view if needed
        this.renderVideoGrid();
    }

    async loadTagManagerData() {
        try {
            // Fetch all tags
            const response = await fetch(`${this.apiBase}/tags`);
            const tags = await response.json();

            // Count videos per tag
            const tagCounts = {};
            this.allVideos.forEach(video => {
                if (video.tags) {
                    video.tags.forEach(tag => {
                        tagCounts[tag.id] = (tagCounts[tag.id] || 0) + 1;
                    });
                }
            });

            // Add counts to tags
            tags.forEach(tag => {
                tag.videoCount = tagCounts[tag.id] || 0;
            });

            // Sort tags by video count (most used first)
            tags.sort((a, b) => b.videoCount - a.videoCount);

            // Render tag list
            this.renderTagList(tags);

            // Update count
            document.getElementById('tagListCount').textContent = tags.length;

            // Store for later use
            this.tagManagerData = tags;

        } catch (error) {
            console.error('Error loading tag manager data:', error);
            console.log('Failed to load tags')
        }
    }

    renderTagList(tags) {
        const listGrid = document.getElementById('tagListGrid');

        if (tags.length === 0) {
            listGrid.innerHTML = `
                <div class="manager-empty-state">
                    <p>No tags found</p>
                    <p class="manager-empty-hint">Create tags by adding them to videos</p>
                </div>
            `;
            return;
        }

        listGrid.innerHTML = '';

        tags.forEach(tag => {
            const tagItem = document.createElement('div');
            tagItem.className = 'tag-list-item';
            tagItem.dataset.tagId = tag.id;

            tagItem.innerHTML = `
                <div class="tag-list-color" style="background-color: ${tag.color};"></div>
                <div class="tag-list-info">
                    <div class="tag-list-name">${tag.name}</div>
                    <div class="tag-list-count">${tag.videoCount} video${tag.videoCount !== 1 ? 's' : ''}</div>
                </div>
            `;

            // Click to select and show details
            tagItem.onclick = () => this.selectTag(tag);

            listGrid.appendChild(tagItem);
        });
    }

    selectTag(tag) {
        // Update selection state
        this.selectedTag = tag;

        // Update UI - highlight selected
        document.querySelectorAll('.tag-list-item').forEach(item => {
            if (parseInt(item.dataset.tagId) === tag.id) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });

        // Show detail panel
        this.showTagDetails(tag);
    }

    showTagDetails(tag) {
        // Hide empty state, show content
        document.getElementById('tagDetailEmpty').style.display = 'none';
        document.getElementById('tagDetailContent').style.display = 'flex';

        // Update header
        document.getElementById('tagDetailColor').style.backgroundColor = tag.color;
        document.getElementById('tagDetailName').textContent = tag.name;

        // Calculate max video count for usage bar
        const maxCount = Math.max(...this.tagManagerData.map(t => t.videoCount));
        const usagePercent = maxCount > 0 ? (tag.videoCount / maxCount) * 100 : 0;

        // Update usage bar
        document.getElementById('tagUsageBar').style.width = `${usagePercent}%`;
        document.getElementById('tagUsageText').textContent = `${tag.videoCount} video${tag.videoCount !== 1 ? 's' : ''}`;

        // Update video count
        document.getElementById('tagVideoCount').textContent = tag.videoCount;

        // Load videos with this tag
        this.loadTagVideos(tag);
    }

    async loadTagVideos(tag) {
        const videoGrid = document.getElementById('tagVideoGrid');

        // Filter videos with this tag
        const taggedVideos = this.allVideos.filter(video =>
            video.tags && video.tags.some(t => t.id === tag.id)
        );

        if (taggedVideos.length === 0) {
            videoGrid.innerHTML = '<p style="text-align: center; color: #999;">No videos with this tag</p>';
            return;
        }

        videoGrid.innerHTML = '';

        taggedVideos.forEach(video => {
            const videoCard = document.createElement('div');
            videoCard.className = 'tag-video-card';

            const thumbnailUrl = `${this.apiBase}/api/thumbnails/${video.id}?t=${video.modified || Date.now()}`;

            videoCard.innerHTML = `
                <img src="${thumbnailUrl}" class="tag-video-thumbnail" alt="${video.display_name || video.name}" />
                <div class="tag-video-name">${video.display_name || video.name}</div>
            `;

            // Click to play video
            videoCard.onclick = () => {
                // Exit tag manager and play video
                this.exitTagManagerView();
                this.playVideo(video);
            };

            videoGrid.appendChild(videoCard);
        });
    }

    setupTagManagerListeners() {
        // Exit button
        document.getElementById('exitTagManagerView').onclick = () => {
            this.exitTagManagerView();
        };

        // Cleanup unused tags button
        document.getElementById('cleanupUnusedTagsBtn').onclick = () => {
            this.cleanupUnusedTags();
        };

        // Action buttons
        document.getElementById('renameTagBtn').onclick = () => {
            if (this.selectedTag) {
                this.renameTagInManager(this.selectedTag);
            }
        };

        document.getElementById('changeTagColorBtn').onclick = () => {
            if (this.selectedTag) {
                this.changeTagColorInManager(this.selectedTag);
            }
        };

        document.getElementById('deleteTagBtn').onclick = () => {
            if (this.selectedTag) {
                this.deleteTagInManager(this.selectedTag);
            }
        };

        // Keyboard shortcuts
        document.addEventListener('keydown', this.tagManagerKeyHandler = (e) => {
            // Only handle if tag manager is visible
            if (document.getElementById('tagManagerView').style.display !== 'flex') return;

            if (e.key === 'Escape') {
                this.exitTagManagerView();
            }
        });
    }

    async renameTagInManager(tag) {
        const newName = prompt(`Rename tag "${tag.name}" to:`, tag.name);

        if (!newName || newName.trim() === '') {
            return;
        }

        if (newName.toLowerCase() === tag.name.toLowerCase()) {
            console.log('Tag name unchanged')
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/tags/${tag.id}?new_name=${encodeURIComponent(newName)}`, {
                method: 'PUT'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to rename tag');
            }

            const result = await response.json();
            console.log(`Tag renamed to "${result.tag.name}"`)

            // Reload tags and refresh
            await this.loadAllTags();
            await this.loadTagManagerData();

            // Re-select the renamed tag
            const updatedTag = this.tagManagerData.find(t => t.id === tag.id);
            if (updatedTag) {
                this.selectTag(updatedTag);
            }

        } catch (error) {
            console.error('Error renaming tag:', error);
            console.log(`${error.message}`)
        }
    }

    async changeTagColorInManager(tag) {
        const newColor = prompt(`Enter new color for "${tag.name}" (hex format):`, tag.color);

        if (!newColor || newColor.trim() === '') {
            return;
        }

        // Validate hex color
        if (!/^#[0-9A-F]{6}$/i.test(newColor)) {
            console.log('Invalid color format. Use #RRGGBB')
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/tags/${tag.id}/color`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ color: newColor })
            });

            if (!response.ok) {
                throw new Error('Failed to change tag color');
            }

            console.log('Tag color updated')

            // Reload and refresh
            await this.loadAllTags();
            await this.loadTagManagerData();

            // Re-select the updated tag
            const updatedTag = this.tagManagerData.find(t => t.id === tag.id);
            if (updatedTag) {
                this.selectTag(updatedTag);
            }

        } catch (error) {
            console.error('Error changing tag color:', error);
            console.log('Failed to change tag color')
        }
    }

    async deleteTagInManager(tag) {
        if (!confirm(`Delete tag "${tag.name}"? This will remove it from all ${tag.videoCount} video${tag.videoCount !== 1 ? 's' : ''}.`)) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/tags/${tag.id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete tag');
            }

            console.log(`Tag "${tag.name}" deleted`)

            // Reload tags
            await this.loadAllTags();
            await this.loadTagManagerData();

            // Clear selection
            this.selectedTag = null;
            document.getElementById('tagDetailEmpty').style.display = 'flex';
            document.getElementById('tagDetailContent').style.display = 'none';

            // Update main view
            this.allVideos.forEach(video => {
                if (video.tags) {
                    video.tags = video.tags.filter(t => t.id !== tag.id);
                }
            });

        } catch (error) {
            console.error('Error deleting tag:', error);
            console.log('Failed to delete tag')
        }
    }

    // ====================================
    // FACE CATALOG VIEW - Master-Detail Full-Screen
    // ====================================

    async showFaceCatalogView() {
        console.log('📸 Entering Face Catalog View');

        // Save current view state (like Duplicates Review does)
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

        // Hide main UI, show face catalog view
        document.getElementById('videoGrid').style.display = 'none';
        document.getElementById('folderExplorer').style.display = 'none';
        document.getElementById('seriesView').style.display = 'none';
        document.querySelector('.controls').style.display = 'none';
        document.getElementById('faceCatalogView').style.display = 'flex';

        // Prevent body scroll
        document.body.classList.add('video-modal-open');

        // Initialize state
        this.selectedFace = null;
        this.faceCatalogMergeMode = false;
        this.selectedFacesForMerge = new Set();
        this.faceCatalogCompareMode = false;
        this.selectedFacesForCompare = new Set();
        this.faceCatalogViewMode = 'grid'; // 'grid' or 'row'
        this.faceEncodingsCache = {}; // Cache for encodings

        // Load faces only if not already loaded
        if (!this.faceCatalogData || this.faceCatalogData.length === 0) {
            console.log('📸 Loading face catalog for first time...');
            await this.loadFaceCatalogData();
        } else {
            console.log(`📸 Face catalog already loaded (${this.faceCatalogData.length} faces) - using cache`);
            // Just render with cached data
            this.renderFaceList(this.faceCatalogData);
        }

        // Setup event listeners
        this.setupFaceCatalogListeners();

        // Setup refresh button
        this.setupFaceCatalogRefreshButton();
    }

    setupFaceCatalogRefreshButton() {
        const header = document.querySelector('.face-catalog-header');
        if (!header) return;

        // Add "Find Similar Faces" button
        let similarBtn = document.getElementById('faceCatalogSimilarBtn');
        if (!similarBtn) {
            similarBtn = document.createElement('button');
            similarBtn.id = 'faceCatalogSimilarBtn';
            similarBtn.textContent = '🔗 Find Similar Faces';
            similarBtn.style.cssText = `
                background: #8b5cf6;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                margin-left: auto;
                margin-right: 10px;
            `;
            similarBtn.onmouseover = () => similarBtn.style.background = '#7c3aed';
            similarBtn.onmouseout = () => similarBtn.style.background = '#8b5cf6';
            similarBtn.onclick = () => this.showSimilarFacesAnalyzer();
            header.appendChild(similarBtn);
        }

        let refreshBtn = document.getElementById('faceCatalogRefreshBtn');
        if (!refreshBtn) {
            refreshBtn = document.createElement('button');
            refreshBtn.id = 'faceCatalogRefreshBtn';
            refreshBtn.textContent = '🔄 Refresh';
            refreshBtn.style.cssText = `
                background: #10b981;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
            `;
            refreshBtn.onmouseover = () => refreshBtn.style.background = '#059669';
            refreshBtn.onmouseout = () => refreshBtn.style.background = '#10b981';
            refreshBtn.onclick = () => this.loadFaceCatalogData();
            header.appendChild(refreshBtn);
        }
    }

    exitFaceCatalogView() {
        console.log('📸 Exiting Face Catalog View');

        // Hide face catalog
        document.getElementById('faceCatalogView').style.display = 'none';

        // Restore body scroll
        document.body.classList.remove('video-modal-open');

        // Cleanup observer if exists
        if (this.encodingsObserver) {
            this.encodingsObserver.disconnect();
            this.encodingsObserver = null;
        }

        // Clear merge mode
        this.faceCatalogMergeMode = false;
        this.selectedFacesForMerge.clear();

        // Remove refresh button
        const refreshBtn = document.getElementById('faceCatalogRefreshBtn');
        if (refreshBtn) {
            refreshBtn.remove();
        }

        // Remove similar faces button
        const similarBtn = document.getElementById('faceCatalogSimilarBtn');
        if (similarBtn) {
            similarBtn.remove();
        }

        // Restore previous view state
        if (this.previousViewState) {
            console.log('📸 Restoring previous view state:', this.previousViewState);

            this.videos = [...this.previousViewState.videos];
            this.allVideos = [...this.previousViewState.allVideos];
            this.currentSearchQuery = this.previousViewState.currentSearchQuery;
            this.currentTagFilter = this.previousViewState.currentTagFilter;
            this.currentFolderFilter = [...this.previousViewState.currentFolderFilter];
            this.currentSort = this.previousViewState.currentSort;

            // Show controls
            document.querySelector('.controls').style.display = 'block';

            // Restore view type
            if (this.previousViewState.currentView === 'explorer') {
                this.currentView = 'explorer';
                this.currentCategory = this.previousViewState.currentCategory;
                this.currentSubcategory = this.previousViewState.currentSubcategory;

                document.getElementById('videoGrid').style.display = 'none';
                document.getElementById('folderExplorer').style.display = 'block';
                this.renderFolderExplorer();
            } else if (this.previousViewState.currentView === 'series') {
                this.currentView = 'series';
                document.getElementById('videoGrid').style.display = 'none';
                document.getElementById('folderExplorer').style.display = 'none';
                document.getElementById('seriesView').style.display = 'block';
                this.renderSeriesView();
            } else {
                // Return to collection view
                this.currentView = 'list';
                document.getElementById('folderExplorer').style.display = 'none';
                document.getElementById('seriesView').style.display = 'none';
                document.getElementById('videoGrid').style.display = 'grid';
                document.getElementById('videoGrid').innerHTML = '';
                this.renderVideoGrid();
            }

            this.previousViewState = null;
        } else {
            // No saved state, default to collection view
            console.log('📸 No saved state, defaulting to collection view');
            this.currentView = 'list';
            document.querySelector('.controls').style.display = 'block';
            document.getElementById('folderExplorer').style.display = 'none';
            document.getElementById('seriesView').style.display = 'none';
            document.getElementById('videoGrid').style.display = 'grid';
            document.getElementById('videoGrid').innerHTML = '';
            this.renderVideoGrid();
        }

        console.log('📸 Returned from Face Catalog');
    }

    async loadFaceCatalogData(forceReload = false) {
        try {
            // Show loading animation
            const listGrid = document.getElementById('faceListGrid');
            listGrid.innerHTML = `
                <div class="face-catalog-loading">
                    <div class="face-catalog-loading-dots">
                        <div class="face-catalog-loading-dot"></div>
                        <div class="face-catalog-loading-dot"></div>
                        <div class="face-catalog-loading-dot"></div>
                    </div>
                    <div class="face-catalog-loading-text">Loading faces...</div>
                </div>
            `;

            // Clear encoding cache when loading fresh data
            this.faceEncodingsCache = {};

            // Fetch face catalog
            const timestamp = new Date().getTime();
            const response = await fetch(`${this.apiBase}/api/faces/catalog?_t=${timestamp}`);
            const data = await response.json();

            // Store for later use
            this.faceCatalogData = data.faces;

            // Render face list
            this.renderFaceList(data.faces);

            // Update count
            document.getElementById('faceListCount').textContent = data.total_faces;

            console.log(`✅ Face catalog loaded: ${data.total_faces} faces`);

        } catch (error) {
            console.error('Error loading face catalog:', error);
            console.log('Failed to load face catalog')
        }
    }

    renderFaceList(faces) {
        const listGrid = document.getElementById('faceListGrid');

        if (faces.length === 0) {
            listGrid.innerHTML = `
                <div class="face-catalog-empty">
                    <p>No faces in catalog yet</p>
                    <p class="face-catalog-empty-hint">Press 'X' while watching videos to extract faces</p>
                </div>
            `;
            return;
        }

        listGrid.innerHTML = '';

        faces.forEach(face => {
            const faceCard = document.createElement('div');
            faceCard.className = 'face-catalog-card';
            faceCard.dataset.faceId = face.id;

            const thumbnailSrc = face.thumbnail
                ? `data:image/jpeg;base64,${face.thumbnail}`
                : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2260%22%3E👤%3C/text%3E%3C/svg%3E';

            // Build source stats
            let statsText = '';
            if (face.video_count > 0) {
                statsText += `${face.video_count} video${face.video_count !== 1 ? 's' : ''}`;
            }
            if (face.image_count > 0) {
                if (statsText) statsText += ' • ';
                statsText += `${face.image_count} image${face.image_count !== 1 ? 's' : ''}`;
            }
            if (!statsText) {
                statsText = 'No source';
            }
            statsText += ` • ${face.encoding_count} encoding${face.encoding_count !== 1 ? 's' : ''}`;

            // Build card HTML with optional actor name below face name
            let cardContent = `
                <input type="checkbox" class="face-catalog-checkbox" ${this.faceCatalogMergeMode ? '' : 'style="opacity: 0;"'}>
                <img src="${thumbnailSrc}" class="face-catalog-thumbnail-circle" alt="${face.name}" />
                <div class="face-catalog-card-name">${face.name}</div>`;

            if (face.actor_id && face.actor_name) {
                cardContent += `<div class="face-catalog-card-actor">👤 ${face.actor_name}</div>`;
            }

            cardContent += `<div class="face-catalog-card-stats">${statsText}</div>`;

            faceCard.innerHTML = cardContent;

            // Click to select and show details
            faceCard.onclick = () => {
                if (this.faceCatalogMergeMode) {
                    this.toggleFaceForMerge(face.id, faceCard);
                } else if (this.faceCatalogCompareMode) {
                    this.toggleFaceForCompare(face.id, faceCard);
                } else {
                    this.selectFace(face);
                }
            };

            // Right-click context menu for face card
            faceCard.oncontextmenu = (e) => {
                e.preventDefault();
                this.showFaceCardContextMenu(e, face);
            };

            listGrid.appendChild(faceCard);
        });

    }

    async renderFaceListRows(faces) {
        const listRows = document.getElementById('faceListRows');

        if (faces.length === 0) {
            listRows.innerHTML = `
                <div class="face-catalog-empty">
                    <p>No faces in catalog yet</p>
                    <p class="face-catalog-empty-hint">Press 'X' while watching videos to extract faces</p>
                </div>
            `;
            return;
        }

        listRows.innerHTML = '';

        // Create rows without loading encodings yet
        for (const face of faces) {
            const faceRow = document.createElement('div');
            faceRow.className = 'face-catalog-row';
            faceRow.dataset.faceId = face.id;
            faceRow.dataset.loaded = 'false';

            const thumbnailSrc = face.thumbnail
                ? `data:image/jpeg;base64,${face.thumbnail}`
                : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2260%22%3E👤%3C/text%3E%3C/svg%3E';

            // Primary face info
            const primaryHtml = `
                <div class="face-catalog-row-primary">
                    <img src="${thumbnailSrc}" class="face-catalog-row-primary-img" alt="${face.name}" />
                    <div class="face-catalog-row-primary-info">
                        <p class="face-catalog-row-primary-name">${face.name}</p>
                        <p class="face-catalog-row-primary-id">ID: ${face.id}</p>
                    </div>
                </div>
            `;

            // Placeholder encodings section
            const encodingsHtml = `<div class="face-catalog-row-encodings" data-face-id="${face.id}"><p style="color: #9ca3af; font-size: 12px;">Loading...</p></div>`;

            faceRow.innerHTML = primaryHtml + encodingsHtml;
            listRows.appendChild(faceRow);
        }

        // Cleanup old observer if exists
        if (this.encodingsObserver) {
            this.encodingsObserver.disconnect();
        }

        // Setup lazy loading with Intersection Observer
        this.setupLazyLoadEncodings();
    }

    setupLazyLoadEncodings() {
        /**
         * Use Intersection Observer to lazy load encodings only for visible rows
         */
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // Load if visible and not already loaded
                if (entry.isIntersecting && entry.target.dataset.loaded !== 'true') {
                    const faceId = parseInt(entry.target.dataset.faceId);
                    const face = this.faceCatalogData.find(f => f.id === faceId);
                    if (face) {
                        this.loadEncodingsForRow(face, entry.target);
                        entry.target.dataset.loaded = 'true';
                    }
                }
            });
        }, {
            rootMargin: '50px' // Start loading 50px before row comes into view
        });

        // Observe all rows
        const rows = document.querySelectorAll('.face-catalog-row');
        rows.forEach(row => {
            observer.observe(row);
        });

        // Store observer for cleanup
        this.encodingsObserver = observer;
    }

    async loadEncodingsForRow(face, rowEl) {
        /**
         * Load encodings for a specific row
         */
        const encodingsContainer = rowEl.querySelector('.face-catalog-row-encodings');

        // Check cache first
        let encodings = this.faceEncodingsCache[face.id];

        if (!encodings) {
            try {
                const response = await fetch(`${this.apiBase}/api/faces/${face.id}/encodings`);
                const data = await response.json();
                encodings = data.embeddings || data.encodings || [];
                // Cache the result
                this.faceEncodingsCache[face.id] = encodings;
            } catch (error) {
                console.error(`Error loading encodings for face ${face.id}:`, error);
                encodings = [];
            }
        }

        if (encodings.length === 0) {
            encodingsContainer.innerHTML = '<p style="color: #9ca3af; font-size: 12px;">No encodings</p>';
            return;
        }

        // Apply grouping logic (same as face detail modal)
        const similarPairs = this.findSimilarEncodings(encodings, 0.98);

        const colorPalette = [
            { bg: '#fef3c7', border: '#fcd34d' },    // Yellow
            { bg: '#dbeafe', border: '#93c5fd' },    // Blue
            { bg: '#fce7f3', border: '#fbcfe8' },    // Pink
            { bg: '#d1fae5', border: '#a7f3d0' },    // Green
            { bg: '#fed7aa', border: '#fdba74' },    // Orange
            { bg: '#e9d5ff', border: '#d8b4fe' },    // Purple
            { bg: '#dcfce7', border: '#86efac' },    // Light Green
            { bg: '#f3e8ff', border: '#e9d5ff' },    // Light Purple
            { bg: '#fecdd3', border: '#fca5a5' },    // Light Pink
            { bg: '#cffafe', border: '#67e8f9' }     // Cyan
        ];

        // Create groups: similar pairs + ungrouped
        const encodingGroups = [];
        const processedIds = new Set();

        // First, add grouped similar pairs
        similarPairs.forEach((pair, pairIdx) => {
            if (!processedIds.has(pair.encoding1.id)) {
                encodingGroups.push({
                    pairIdx: pairIdx,
                    color: colorPalette[pairIdx % colorPalette.length],
                    encodings: [pair.encoding1, pair.encoding2],
                    isGroup: true
                });
                processedIds.add(pair.encoding1.id);
                processedIds.add(pair.encoding2.id);
            }
        });

        // Then, add ungrouped encodings
        encodings.forEach(enc => {
            if (!processedIds.has(enc.id)) {
                encodingGroups.push({
                    pairIdx: null,
                    color: null,
                    encodings: [enc],
                    isGroup: false
                });
                processedIds.add(enc.id);
            }
        });

        // Build HTML with grouped display
        const fragment = document.createDocumentFragment();

        encodingGroups.forEach((group) => {
            group.encodings.forEach((encoding, encIdx) => {
                const encThumbnail = encoding.thumbnail
                    ? `data:image/jpeg;base64,${encoding.thumbnail}`
                    : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2230%22%3E🖼️%3C/text%3E%3C/svg%3E';

                const isPrimary = face.primary_encoding_id === encoding.id;
                const primaryClass = isPrimary ? 'primary' : '';

                const div = document.createElement('div');
                div.className = `face-encoding-thumbnail ${primaryClass}`;
                div.setAttribute('data-encoding-id', encoding.id);

                // Apply color border if part of a group
                if (group.color) {
                    div.style.borderWidth = '4px';
                    div.style.borderColor = group.color.border;
                    div.style.boxShadow = `0 0 0 1px ${group.color.border}, 0 0 8px ${group.color.border}60`;
                }

                div.innerHTML = `
                    <img src="${encThumbnail}" alt="Encoding ${encoding.id}" />
                    <button class="face-encoding-thumbnail-delete" title="Delete this encoding" data-encoding-id="${encoding.id}" data-face-id="${face.id}">
                        ✕
                    </button>
                    ${isPrimary ? '<div class="primary-badge">★</div>' : ''}
                `;

                fragment.appendChild(div);
            });
        });

        // Update container
        encodingsContainer.innerHTML = '';
        encodingsContainer.appendChild(fragment);

        // Add delete listeners
        rowEl.querySelectorAll('.face-encoding-thumbnail-delete').forEach(btn => {
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                // Prevent duplicate clicks
                if (btn.disabled) return;
                btn.disabled = true;

                const encodingId = parseInt(btn.dataset.encodingId);
                const faceId = parseInt(btn.dataset.faceId);
                this.deleteEncoding(encodingId, faceId);

                // Re-enable after 500ms
                setTimeout(() => {
                    btn.disabled = false;
                }, 500);
            };
        });
    }

    async deleteEncoding(encodingId, faceId) {
        try {
            // Find and fade out the encoding thumbnail (works in both grid and row views)
            const encodingEl = document.querySelector(`[data-encoding-id="${encodingId}"]`);
            if (encodingEl) {
                encodingEl.classList.add('fade-out');
            }

            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/encodings/${encodingId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete encoding');
            }

            console.log('✓ Encoding deleted')

            // Remove from DOM after animation completes (300ms matches CSS animation)
            if (encodingEl) {
                setTimeout(() => {
                    if (encodingEl.parentElement) {
                        encodingEl.remove();
                    }
                }, 300);
            }

            // Update the face catalog data if in catalog view
            if (this.faceCatalogData) {
                const face = this.faceCatalogData.find(f => f.id === faceId);
                if (face) {
                    face.encoding_count = Math.max(0, face.encoding_count - 1);
                }
            }

            // Clear encoding cache for this face so it's refreshed if needed
            if (this.faceEncodingsCache && this.faceEncodingsCache[faceId]) {
                delete this.faceEncodingsCache[faceId];
            }

            // Update row view if visible (for face catalog row mode)
            const faceRow = document.querySelector(`[data-face-id="${faceId}"].face-catalog-row`);
            if (faceRow) {
                // Just mark the row to reload when next viewed
                faceRow.dataset.loaded = 'false';
            }

        } catch (error) {
            console.error('Error deleting encoding:', error);
            console.log('Failed to delete encoding')

            // Remove fade-out class on error so user can try again
            const encodingEl = document.querySelector(`[data-encoding-id="${encodingId}"]`);
            if (encodingEl) {
                encodingEl.classList.remove('fade-out');
            }
        }
    }

    findSimilarEncodings(encodings, threshold = 0.98) {
        /**
         * Use clustering to group similar encodings instead of pairwise comparison
         * This prevents combinatorial explosion with many encodings
         */
        if (encodings.length <= 1) return [];

        // Tighter threshold for confidence/quality to avoid false positives
        const CONFIDENCE_THRESHOLD = 0.01; // 1% difference
        const QUALITY_THRESHOLD = 0.01;    // 1% difference

        const clusters = [];
        const assigned = new Set();

        // Greedy clustering: start with each unassigned encoding as a seed
        for (let i = 0; i < encodings.length; i++) {
            if (assigned.has(encodings[i].id)) continue;

            const cluster = [encodings[i]];
            assigned.add(encodings[i].id);

            // Find all encodings similar to this seed
            for (let j = i + 1; j < encodings.length; j++) {
                if (assigned.has(encodings[j].id)) continue;

                const enc1 = encodings[i];
                const enc2 = encodings[j];

                const confDiff = Math.abs((enc1.confidence || 0) - (enc2.confidence || 0));
                const qualDiff = Math.abs((enc1.quality_score || 0) - (enc2.quality_score || 0));

                // Stricter matching: both confidence AND quality must be very close
                if (confDiff <= CONFIDENCE_THRESHOLD && qualDiff <= QUALITY_THRESHOLD) {
                    cluster.push(enc2);
                    assigned.add(enc2.id);
                }
            }

            // Only add cluster if it has 2+ similar encodings
            if (cluster.length > 1) {
                clusters.push(cluster);
            }
        }

        // Convert clusters to pairs format (for compatibility with existing code)
        const similarPairs = [];
        clusters.forEach(cluster => {
            // Original is the first one, rest are duplicates
            const original = cluster[0];
            for (let i = 1; i < cluster.length; i++) {
                similarPairs.push({
                    encoding1: original,
                    encoding2: cluster[i],
                    similarity: 0.99
                });
            }
        });

        return similarPairs;
    }

    async showCleanupEmbeddingsModal() {
        /**
         * Show cleanup modal with backend-calculated similarity scores
         * Backend does the vector comparisons, frontend just displays
         */
        if (!this.selectedFace) return;

        const face = this.selectedFace;

        try {
            // Fetch pre-scored encodings from backend
            const threshold = 0.30;  // 30% - your preferred threshold
            const response = await fetch(`${this.apiBase}/api/faces/${face.id}/cleanup/encodings?threshold=${threshold}`);

            if (!response.ok) {
                const error = await response.json();
                alert('Error: ' + (error.detail || response.statusText));
                return;
            }

            const data = await response.json();
            const encodings = data.encodings || [];

            console.log(`✅ Got ${encodings.length} pre-scored encodings from backend`);
            console.log(`Threshold: ${(threshold * 100).toFixed(0)}%, Breakdown:`, {
                primary: encodings.filter(e => e.is_primary).length,
                good: encodings.filter(e => e.quality_level === 'good').length,
                acceptable: encodings.filter(e => e.quality_level === 'acceptable').length,
                poor: encodings.filter(e => e.quality_level === 'poor').length
            });

            if (encodings.length <= 1) {
                alert('This face has only 1 embedding, nothing to clean up');
                return;
            }

            this.cleanupEncodingsList = encodings;
            this.cleanupThreshold = threshold;

            this.renderCleanupModal(encodings, threshold);
            document.getElementById('cleanupEmbeddingsModal').style.display = 'flex';

        } catch (error) {
            console.error('Error loading cleanup data:', error);
            alert('Failed to load cleanup data: ' + error.message);
        }
    }

    getEmbeddingVector(encoding) {
        /**
         * Extract embedding vector from encoding object
         * The API returns embedding as a base64-encoded string
         * We need to decode it to a float array
         */
        if (!encoding) return null;

        // Try different possible field names
        const vectorFields = ['embedding', 'vector', 'data', 'features', 'embeddings'];

        for (const field of vectorFields) {
            const val = encoding[field];

            // Already an array of numbers
            if (Array.isArray(val) && val.length > 10) {
                if (typeof val[0] === 'number') {
                    return val;
                }
                // Handle nested array (first element is the vector)
                if (Array.isArray(val[0]) && val[0].length > 10) {
                    return val[0];
                }
            }

            // Base64 encoded string (from API)
            if (typeof val === 'string' && val.length > 100) {
                try {
                    // Decode base64
                    const binaryString = atob(val);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                        bytes[i] = binaryString.charCodeAt(i);
                    }

                    // Interpret as float32 array (512-D = 512 * 4 bytes)
                    const float32Array = new Float32Array(bytes.buffer);
                    if (float32Array.length > 10) {
                        // Convert to regular array
                        return Array.from(float32Array);
                    }
                } catch (e) {
                    // Not valid base64 or float32 data, continue
                }
            }
        }

        return null;
    }

    renderCleanupModal(encodings, threshold) {
        /**
         * Render cleanup modal with pre-scored encodings from backend
         * Display quality levels calculated by backend (good/acceptable/poor)
         */
        // Count matches vs non-matches at current threshold
        const matchCount = encodings.filter(e => !e.is_primary && e.vector_similarity >= threshold).length;
        const mismatchCount = encodings.filter(e => !e.is_primary && e.vector_similarity < threshold).length;

        // Render threshold control
        const thresholdHtml = `
            <div style="margin-bottom: 20px; padding: 15px; background: #f3f4f6; border-radius: 8px;">
                <div style="display: flex; align-items: center; gap: 15px;">
                    <label style="flex: 1;">
                        <div style="margin-bottom: 8px; font-weight: 600;">Vector Similarity Threshold: <span id="thresholdValue">${(threshold * 100).toFixed(0)}</span>%</div>
                        <input type="range" id="qualityThreshold" min="0" max="100" value="${threshold * 100}" style="width: 100%; cursor: pointer;">
                        <div style="font-size: 12px; color: #6b7280; margin-top: 4px;">
                            <strong style="color: #10b981;">${matchCount} matches</strong> | 
                            <strong style="color: #ef4444;">${mismatchCount} mismatches</strong> at ${(threshold * 100).toFixed(0)}% similarity
                            <br>Embeddings below threshold will be marked for deletion (blurry, wrong angle, different person, etc.)
                        </div>
                    </label>
                </div>
            </div>
        `;

        // Render face previews - sorted by vector similarity (best to worst match)
        const previewsHtml = encodings.map((enc, displayIdx) => {
            const faceThumbnail = enc.thumbnail ? `data:image/jpeg;base64,${enc.thumbnail}` :
                'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2240%22%3E👤%3C/text%3E%3C/svg%3E';

            const isMatch = enc.vector_similarity >= threshold;
            let borderColor = '#3b82f6'; // Primary
            let bgColor = 'rgba(59, 130, 246, 0.05)';
            let statusLabel = 'Primary';

            if (!enc.is_primary) {
                // Use backend quality_level
                if (enc.quality_level === 'good') {
                    borderColor = '#10b981'; // Green
                    bgColor = 'rgba(16, 185, 129, 0.05)';
                    statusLabel = 'Good ✓';
                } else if (enc.quality_level === 'acceptable') {
                    borderColor = '#f59e0b'; // Yellow
                    bgColor = 'rgba(245, 158, 11, 0.05)';
                    statusLabel = 'Okay ⚠️';
                } else if (enc.quality_level === 'poor') {
                    borderColor = '#ef4444'; // Red - mismatch
                    bgColor = 'rgba(239, 68, 68, 0.05)';
                    statusLabel = 'Poor ✗';
                }
            }

            return `
                <div style="display: flex; flex-direction: column; align-items: center; padding: 12px; border: 3px solid ${borderColor}; border-radius: 8px; background: ${bgColor}; gap: 8px;">
                    ${enc.is_primary ? '' : `<input type="checkbox" class="cleanup-checkbox" data-encoding-id="${enc.id}" ${!isMatch ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;">`}
                    <img src="${faceThumbnail}" style="width: 100px; height: 100px; border-radius: 6px; object-fit: cover;">
                    <div style="text-align: center; width: 100%; font-size: 13px;">
                        <div style="font-weight: 600;">${enc.is_primary ? 'Primary' : `#${displayIdx}`}</div>
                        <div style="color: #6b7280; font-size: 12px;">
                            ${(enc.vector_similarity * 100).toFixed(1)}% similar
                        </div>
                        <div style="font-size: 11px; margin-top: 4px; color: ${borderColor}; font-weight: 500;">
                            ${statusLabel}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Update the modal content
        const resultsContainer = document.getElementById('cleanupResults');
        resultsContainer.innerHTML = `
            ${thresholdHtml}
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 15px;">
                ${previewsHtml}
            </div>
        `;

        // Set up threshold slider listener
        const thresholdSlider = document.getElementById('qualityThreshold');
        if (thresholdSlider) {
            thresholdSlider.addEventListener('input', (e) => {
                const newThreshold = parseFloat(e.target.value) / 100;
                this.cleanupThreshold = newThreshold;
                document.getElementById('thresholdValue').textContent = e.target.value;

                // Re-render with new threshold
                this.renderCleanupModal(this.cleanupEncodingsList, newThreshold);
            });
        }
    }

    cosineSimilarity(vec1, vec2) {
        /**
         * Calculate cosine similarity between two embedding vectors
         * Returns value between 0 and 1
         */
        if (!vec1 || !vec2 || vec1.length !== vec2.length) return 0;

        let dotProduct = 0;
        let mag1 = 0;
        let mag2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            mag1 += vec1[i] * vec1[i];
            mag2 += vec2[i] * vec2[i];
        }

        mag1 = Math.sqrt(mag1);
        mag2 = Math.sqrt(mag2);

        if (mag1 === 0 || mag2 === 0) return 0;
        return dotProduct / (mag1 * mag2);
    }

    async deleteBadEmbeddings() {
        /**
         * Delete the selected embeddings from the face
         * Uses the custom threshold set by the user
         */
        const checkboxes = document.querySelectorAll('.cleanup-checkbox:checked');
        if (checkboxes.length === 0) {
            alert('Please select embeddings to delete');
            return;
        }

        const encodingIds = Array.from(checkboxes).map(cb => parseInt(cb.dataset.encodingId));

        if (!confirm(`Delete ${encodingIds.length} embedding(s)?`)) {
            return;
        }

        try {
            // Delete each encoding
            for (const encId of encodingIds) {
                await fetch(`${this.apiBase}/api/faces/${this.selectedFace.id}/encodings/${encId}`, {
                    method: 'DELETE'
                });
            }

            console.log(`✅ Deleted ${encodingIds.length} embeddings (threshold: ${(this.cleanupThreshold * 100).toFixed(0)}%)`);

            // Close the modal and refresh the face detail
            document.getElementById('cleanupEmbeddingsModal').style.display = 'none';

            // Refresh the face detail modal to show updated encodings
            if (this.selectedFace) {
                await this.showFaceDetailModal(this.selectedFace);
            }
        } catch (error) {
            console.error('Error deleting embeddings:', error);
            alert('Failed to delete embeddings');
        }
    }

    selectFace(face) {
        // Update selection state
        this.selectedFace = face;

        // Show detail modal
        this.showFaceDetailModal(face);
    }

    async showFaceDetailModal(face) {
        // Store current face for button handlers
        this.currentFaceForDetail = face;

        // Show modal
        document.getElementById('faceDetailModal').style.display = 'flex';

        // Update header
        const thumbnailSrc = face.thumbnail
            ? `data:image/jpeg;base64,${face.thumbnail}`
            : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2260%22%3E👤%3C/text%3E%3C/svg%3E';

        document.getElementById('faceDetailThumbnail').src = thumbnailSrc;
        document.getElementById('faceDetailName').textContent = face.name;

        // Build stats with both video and image counts
        let statsText = '';
        if (face.video_count > 0) {
            statsText += `${face.video_count} video${face.video_count !== 1 ? 's' : ''}`;
        }
        if (face.image_count > 0) {
            if (statsText) statsText += ' • ';
            statsText += `${face.image_count} image${face.image_count !== 1 ? 's' : ''}`;
        }
        if (!statsText) {
            statsText = 'No source';
        }
        statsText += ` • ${face.encoding_count} encoding${face.encoding_count !== 1 ? 's' : ''}`;

        document.getElementById('faceDetailStats').textContent = statsText;

        // Actor badge
        const actorEl = document.getElementById('faceDetailActor');
        if (face.actor_id && face.actor_name) {
            actorEl.innerHTML = `<strong>👤 Actor:</strong> ${face.actor_name}`;
            actorEl.style.display = 'block';
        } else {
            actorEl.style.display = 'none';
        }

        // Load encodings
        await this.loadFaceEncodings(face);

        // Show button if similar encodings found
        if (face.similarEncodingPairs && face.similarEncodingPairs.length > 0) {
            const alertBtn = document.getElementById('reviewSimilarEncodingsBtn');
            if (alertBtn) {
                alertBtn.style.display = 'inline-block';
                alertBtn.textContent = `⚠️ ${face.similarEncodingPairs.length} Similar Encoding Pair(s)`;
                alertBtn.onclick = () => this.showSimilarEncodingsReview(face);
            }
        }

        // Load video and image appearances in unified grid
        await this.loadFaceMedia(face);
    }

    async loadFaceEncodings(face) {
        const gallery = document.getElementById('faceEncodingGallery');
        document.getElementById('faceEncodingCount').textContent = face.encoding_count;

        try {
            // Fetch all encodings for this face
            const response = await fetch(`${this.apiBase}/api/faces/${face.id}/encodings`);
            const data = await response.json();
            const encodings = data.embeddings || data.encodings || [];

            // Check for very similar encodings (98%+ similarity)
            const similarPairs = this.findSimilarEncodings(encodings, 0.98);

            // Store for later use in the button
            face.similarEncodingPairs = similarPairs;

            if (encodings.length === 0) {
                gallery.innerHTML = '<p style="text-align: center; color: #999;">No encodings found</p>';
                return;
            }

            gallery.innerHTML = '';

            // Color palette for similar pairs
            const colorPalette = [
                { bg: '#fef3c7', border: '#fcd34d' },    // Yellow
                { bg: '#dbeafe', border: '#93c5fd' },    // Blue
                { bg: '#fce7f3', border: '#fbcfe8' },    // Pink
                { bg: '#d1fae5', border: '#a7f3d0' },    // Green
                { bg: '#fed7aa', border: '#fdba74' },    // Orange
                { bg: '#e9d5ff', border: '#d8b4fe' },    // Purple
                { bg: '#dcfce7', border: '#86efac' },    // Light Green
                { bg: '#f3e8ff', border: '#e9d5ff' },    // Light Purple
                { bg: '#fecdd3', border: '#fca5a5' },    // Light Pink
                { bg: '#cffafe', border: '#67e8f9' }     // Cyan
            ];

            // Create groups: original + its duplicates
            const encodingGroups = [];
            const processedIds = new Set();

            // First, add grouped similar pairs
            similarPairs.forEach((pair, pairIdx) => {
                if (!processedIds.has(pair.encoding1.id)) {
                    encodingGroups.push({
                        pairIdx: pairIdx,
                        color: colorPalette[pairIdx % colorPalette.length],
                        encodings: [pair.encoding1, pair.encoding2],
                        isGroup: true
                    });
                    processedIds.add(pair.encoding1.id);
                    processedIds.add(pair.encoding2.id);
                }
            });

            // Then, add ungrouped encodings
            encodings.forEach(enc => {
                if (!processedIds.has(enc.id)) {
                    encodingGroups.push({
                        pairIdx: null,
                        color: null,
                        encodings: [enc],
                        isGroup: false
                    });
                    processedIds.add(enc.id);
                }
            });

            // Single flat grid - all encodings together
            const flatGallery = document.createElement('div');
            flatGallery.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(69px, 1fr));
                gap: 12px;
            `;

            // Render all encodings flat
            encodingGroups.forEach((group) => {
                group.encodings.forEach((encoding, encIdx) => {
                    const encItem = this.createEncodingCard(encoding, face, group.color, group.isGroup && encIdx === 0);
                    flatGallery.appendChild(encItem);
                });
            });

            gallery.appendChild(flatGallery);

        } catch (error) {
            console.error('Error loading encodings:', error);
            gallery.innerHTML = '<p style="text-align: center; color: #999;">Error loading encodings</p>';
        }
    }

    createEncodingCard(encoding, face, color, isOriginal) {
        /**
         * Create a single encoding card element
         */
        const encItem = document.createElement('div');
        encItem.className = 'face-encoding-item';
        encItem.setAttribute('data-encoding-id', encoding.id);
        encItem.style.position = 'relative';
        encItem.style.cursor = 'pointer';

        // Apply color if part of a similar pair
        if (color) {
            encItem.style.border = `3px solid ${color.border}`;
            encItem.style.borderRadius = '8px';
            encItem.style.boxShadow = `0 0 0 2px ${color.border}20`;
        }

        // Check if this is the primary encoding
        const isPrimary = face.primary_encoding_id === encoding.id;
        if (isPrimary) {
            encItem.classList.add('primary-encoding');
        }

        const quality = encoding.quality_score || 0;
        const confidence = encoding.confidence || 0;
        const confidencePercent = Math.round(confidence * 100);

        // Delete button - show for ALL encodings
        const deleteButtonHtml = `<button class="face-encoding-delete-btn" style="position: absolute; top: 4px; right: 4px; padding: 2px 6px; background: rgba(0,0,0,0.7); color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 12px; opacity: 0; transition: opacity 0.2s;">✕ Delete</button>`;

        encItem.innerHTML = `
            <img src="data:image/jpeg;base64,${encoding.thumbnail}" class="face-encoding-thumbnail" />
            ${deleteButtonHtml}
            ${isPrimary ? '<div class="primary-badge">★</div>' : ''}
        `;

        // Show delete button on hover (for all encodings)
        encItem.onmouseenter = () => {
            const deleteBtn = encItem.querySelector('.face-encoding-delete-btn');
            if (deleteBtn) deleteBtn.style.opacity = '1';
        };
        encItem.onmouseleave = () => {
            const deleteBtn = encItem.querySelector('.face-encoding-delete-btn');
            if (deleteBtn) deleteBtn.style.opacity = '0';
        };

        // Delete button click handler
        const deleteBtn = encItem.querySelector('.face-encoding-delete-btn');
        if (deleteBtn) {
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                this.deleteEncoding(encoding.id, face.id);
            };
        }

        // Click to set as primary
        encItem.querySelector('.face-encoding-thumbnail').onclick = async () => {
            await this.setPrimaryEncoding(face.id, encoding.id);
        };

        // Add tooltip
        if (isOriginal && color) {
            encItem.title = 'Original encoding';
        } else if (color) {
            encItem.title = 'Duplicate encoding - click delete to remove';
        } else {
            encItem.title = isPrimary ? 'Current preview' : 'Click to set as preview';
        }

        return encItem;
    }

    showSimilarEncodingsReview(face) {
        /**
         * Show modal to review and manage similar encoding pairs
         */
        if (!face.similarEncodingPairs || face.similarEncodingPairs.length === 0) {
            console.log('No similar encodings found')
            return;
        }

        // Create modal
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.6);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            backdrop-filter: blur(4px);
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            border-radius: 12px;
            padding: 20px;
            max-width: 600px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 25px 50px rgba(0,0,0,0.4);
        `;

        // Title
        const title = document.createElement('h3');
        title.style.cssText = 'margin: 0 0 12px 0; color: #111827; font-size: 18px; font-weight: 700;';
        title.textContent = `🔍 Similar Encodings Found (${face.similarEncodingPairs.length} group${face.similarEncodingPairs.length !== 1 ? 's' : ''})`;
        content.appendChild(title);

        // Description
        const desc = document.createElement('p');
        desc.style.cssText = 'margin: 0 0 16px 0; color: #6b7280; font-size: 13px; line-height: 1.4;';
        desc.textContent = 'These encodings are nearly identical (98%+ similar). Delete duplicates to keep only the best quality encoding.';
        content.appendChild(desc);

        // Color palette for different pairs
        const colorPalette = [
            { bg: '#fef3c7', border: '#fcd34d', text: '#92400e' },
            { bg: '#dbeafe', border: '#93c5fd', text: '#1e40af' },
            { bg: '#fce7f3', border: '#fbcfe8', text: '#9f1239' },
            { bg: '#d1fae5', border: '#a7f3d0', text: '#065f46' },
            { bg: '#fed7aa', border: '#fdba74', text: '#92400e' },
            { bg: '#e9d5ff', border: '#d8b4fe', text: '#6b21a8' }
        ];

        // Each pair - show all encodings vertically
        face.similarEncodingPairs.forEach((pair, idx) => {
            const colors = colorPalette[idx % colorPalette.length];

            // Main pair container
            const pairDiv = document.createElement('div');
            pairDiv.style.cssText = `
                border: 2px solid ${colors.border};
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 12px;
                background: ${colors.bg};
            `;

            const pairTitle = document.createElement('div');
            pairTitle.style.cssText = `font-weight: 700; margin-bottom: 10px; color: ${colors.text}; font-size: 12px; text-transform: uppercase;`;
            pairTitle.textContent = `Group ${idx + 1} (${(pair.similarity * 100).toFixed(1)}% similar)`;
            pairDiv.appendChild(pairTitle);

            // Encoding 1 - inline horizontal
            const enc1Div = document.createElement('div');
            enc1Div.style.cssText = 'display: flex; gap: 12px; padding: 8px; background: rgba(255,255,255,0.6); border-radius: 6px; margin-bottom: 10px; align-items: flex-start;';

            const enc1Thumb = document.createElement('img');
            enc1Thumb.src = pair.encoding1.thumbnail ? `data:image/jpeg;base64,${pair.encoding1.thumbnail}` : '';
            enc1Thumb.style.cssText = 'width: 60px; height: 60px; border-radius: 4px; object-fit: cover; border: 2px solid ' + colors.border + '; flex-shrink: 0;';
            enc1Div.appendChild(enc1Thumb);

            const enc1Content = document.createElement('div');
            enc1Content.style.cssText = 'flex: 1; min-width: 0;';

            const enc1Stats = document.createElement('div');
            enc1Stats.style.cssText = 'font-size: 12px; color: #374151; margin-bottom: 6px; font-weight: 500;';
            enc1Stats.innerHTML = `
                <div>Conf: ${(pair.encoding1.confidence * 100).toFixed(0)}% | Quality: ${(pair.encoding1.quality_score * 100).toFixed(0)}% | ID: ${pair.encoding1.id}</div>
            `;
            enc1Content.appendChild(enc1Stats);

            const enc1DeleteBtn = document.createElement('button');
            enc1DeleteBtn.style.cssText = `
                padding: 5px 10px;
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                transition: background 0.2s;
            `;
            enc1DeleteBtn.textContent = `🗑️ Delete ID ${pair.encoding1.id}`;
            enc1DeleteBtn.onmouseover = () => { enc1DeleteBtn.style.background = '#dc2626'; };
            enc1DeleteBtn.onmouseout = () => { enc1DeleteBtn.style.background = '#ef4444'; };
            enc1DeleteBtn.onclick = () => {
                this.deleteEncoding(pair.encoding1.id, face.id);
                modal.remove();
                setTimeout(() => this.showFaceDetailModal(face), 500);
            };
            enc1Content.appendChild(enc1DeleteBtn);
            enc1Div.appendChild(enc1Content);
            pairDiv.appendChild(enc1Div);

            // Separator
            const sep = document.createElement('div');
            sep.style.cssText = 'height: 1px; background: ' + colors.border + '; margin: 8px 0;';
            pairDiv.appendChild(sep);

            // Encoding 2 - inline horizontal
            const enc2Div = document.createElement('div');
            enc2Div.style.cssText = 'display: flex; gap: 12px; padding: 8px; background: rgba(255,255,255,0.6); border-radius: 6px; align-items: flex-start;';

            const enc2Thumb = document.createElement('img');
            enc2Thumb.src = pair.encoding2.thumbnail ? `data:image/jpeg;base64,${pair.encoding2.thumbnail}` : '';
            enc2Thumb.style.cssText = 'width: 60px; height: 60px; border-radius: 4px; object-fit: cover; border: 2px solid ' + colors.border + '; flex-shrink: 0;';
            enc2Div.appendChild(enc2Thumb);

            const enc2Content = document.createElement('div');
            enc2Content.style.cssText = 'flex: 1; min-width: 0;';

            const enc2Stats = document.createElement('div');
            enc2Stats.style.cssText = 'font-size: 12px; color: #374151; margin-bottom: 6px; font-weight: 500;';
            enc2Stats.innerHTML = `
                <div>Conf: ${(pair.encoding2.confidence * 100).toFixed(0)}% | Quality: ${(pair.encoding2.quality_score * 100).toFixed(0)}% | ID: ${pair.encoding2.id}</div>
            `;
            enc2Content.appendChild(enc2Stats);

            const enc2DeleteBtn = document.createElement('button');
            enc2DeleteBtn.style.cssText = `
                padding: 5px 10px;
                background: #ef4444;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 600;
                transition: background 0.2s;
            `;
            enc2DeleteBtn.textContent = `🗑️ Delete ID ${pair.encoding2.id}`;
            enc2DeleteBtn.onmouseover = () => { enc2DeleteBtn.style.background = '#dc2626'; };
            enc2DeleteBtn.onmouseout = () => { enc2DeleteBtn.style.background = '#ef4444'; };
            enc2DeleteBtn.onclick = () => {
                this.deleteEncoding(pair.encoding2.id, face.id);
                modal.remove();
                setTimeout(() => this.showFaceDetailModal(face), 500);
            };
            enc2Content.appendChild(enc2DeleteBtn);
            enc2Div.appendChild(enc2Content);
            pairDiv.appendChild(enc2Div);

            content.appendChild(pairDiv);
        });

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.style.cssText = `
            width: 100%;
            padding: 10px;
            background: #e5e7eb;
            color: #374151;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: 600;
            margin-top: 16px;
            transition: background 0.2s;
        `;
        closeBtn.textContent = 'Close';
        closeBtn.onmouseover = () => { closeBtn.style.background = '#d1d5db'; };
        closeBtn.onmouseout = () => { closeBtn.style.background = '#e5e7eb'; };
        closeBtn.onclick = () => modal.remove();
        content.appendChild(closeBtn);

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Close on outside click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }

    async loadFaceMedia(face) {
        const mediaList = document.getElementById('faceMediaList');

        try {
            // Fetch all media (videos and images) where this face appears
            // The /videos endpoint returns both videos and images based on media_type field
            const response = await fetch(`${this.apiBase}/api/faces/${face.id}/videos`);
            const data = await response.json();

            // Combine all media from the single endpoint
            const allMedia = data.videos.map(v => ({ ...v.video, appearance_count: v.appearance_count }));

            // Store face media in allVideos so navigation/flag preservation works
            this.allVideos = allMedia;

            // Update total media count
            document.getElementById('faceMediaCount').textContent = allMedia.length;

            if (allMedia.length === 0) {
                mediaList.innerHTML = '<p style="text-align: center; color: #999;">No videos or images found</p>';
                return;
            }

            mediaList.innerHTML = '';

            // Create unified grid container for all media
            const gridContainer = document.createElement('div');
            gridContainer.className = 'face-media-grid';
            gridContainer.style.cssText = `
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 12px;
                padding: 10px;
            `;

            allMedia.forEach(media => {
                const card = this.createVideoCard(media);

                // Override click handler to set face detail flag and preserve face for return
                const thumbnail = card.querySelector('.video-thumbnail');
                if (thumbnail) {
                    thumbnail.onclick = (e) => {
                        e.stopPropagation();
                        // Set flags BEFORE playing - critical for ESC return
                        this.playingVideoFromFaceDetail = true;
                        this.currentFaceForDetail = face;
                        console.log('🎬 Opening media from face details - setting flags:', {
                            playingVideoFromFaceDetail: this.playingVideoFromFaceDetail,
                            currentFaceForDetail: face ? face.name : null,
                            mediaId: media.id,
                            mediaType: media.media_type
                        });
                        // Close face detail modal and play video/open image
                        document.getElementById('faceDetailModal').style.display = 'none';
                        this.playVideo(media);
                    };
                }

                gridContainer.appendChild(card);
            });

            mediaList.appendChild(gridContainer);

        } catch (error) {
            console.error('Error loading face media:', error);
            mediaList.innerHTML = '<p style="text-align: center; color: #f00;">Failed to load media</p>';
        }
    }

    setupFaceCatalogListeners() {
        // Exit button
        document.getElementById('exitFaceCatalogView').onclick = () => {
            this.exitFaceCatalogView();
        };

        // Grid/Row view toggle buttons
        document.getElementById('faceGridViewBtn').onclick = () => {
            this.toggleFaceCatalogView('grid');
        };

        document.getElementById('faceRowViewBtn').onclick = () => {
            this.toggleFaceCatalogView('row');
        };

        // Group similar faces button
        document.getElementById('faceGroupSimilarBtn').onclick = () => {
            this.showFaceGroupingView();
        };

        // Compare faces button
        document.getElementById('faceCompareModeBtn').onclick = () => {
            this.toggleFaceCompareMode();
        };

        // Merge mode button
        document.getElementById('faceMergeModeBtn').onclick = () => {
            this.toggleFaceMergeMode();
        };

        // Action buttons
        document.getElementById('renameFaceBtn').onclick = () => {
            if (this.selectedFace) {
                this.renameFaceInCatalog(this.selectedFace);
            }
        };

        document.getElementById('findDuplicateFacesBtn').onclick = () => {
            if (this.selectedFace) {
                this.findDuplicateFaces(this.selectedFace);
            }
        };

        document.getElementById('linkFaceActorBtn').onclick = () => {
            if (this.selectedFace) {
                this.linkFaceToActor(this.selectedFace.id, this.selectedFace.name, this.selectedFace.actor_id);
            }
        };

        document.getElementById('mergeFaceBtn').onclick = () => {
            if (this.selectedFace) {
                this.startFaceMergeFromDetail(this.selectedFace);
            }
        };

        document.getElementById('deleteFaceBtn').onclick = () => {
            if (this.selectedFace) {
                this.deleteFaceInCatalog(this.selectedFace);
            }
        };

        // Face Detail Modal handlers
        document.getElementById('closeFaceDetailModal').onclick = (e) => {
            e.stopPropagation();
            document.getElementById('faceDetailModal').style.display = 'none';
        };

        document.getElementById('closeFaceDetailBtn').onclick = (e) => {
            e.stopPropagation();
            document.getElementById('faceDetailModal').style.display = 'none';
        };

        // Cleanup Embeddings Modal handlers
        document.getElementById('closeCleanupModal').onclick = () => {
            document.getElementById('cleanupEmbeddingsModal').style.display = 'none';
        };
        document.getElementById('cancelCleanupBtn').onclick = () => {
            document.getElementById('cleanupEmbeddingsModal').style.display = 'none';
        };
        document.getElementById('confirmDeleteBadBtn').onclick = () => this.deleteBadEmbeddings();
        document.getElementById('cleanupEncodingsBtn').onclick = () => this.showCleanupEmbeddingsModal();

        // Face Merge Modal handlers
        document.getElementById('closeFaceMergeModal').onclick = () => this.hideFaceMergeModal();
        document.getElementById('cancelFaceMergeBtn').onclick = () => this.hideFaceMergeModal();
        document.getElementById('confirmFaceMergeBtn').onclick = () => this.confirmFaceMerge();

        // Face Comparison Modal handlers
        document.getElementById('closeFaceComparisonModal').onclick = () => {
            document.getElementById('faceComparisonModal').style.display = 'none';
        };
        document.getElementById('closeFaceComparisonBtn').onclick = () => {
            document.getElementById('faceComparisonModal').style.display = 'none';
        };

        // Merge Action Bar handlers
        document.getElementById('confirmMergeBtn').onclick = () => {
            if (this.selectedFacesForMerge.size >= 2) {
                this.showMergeConfirmation();
            }
        };

        document.getElementById('cancelMergeBtn').onclick = () => {
            this.toggleFaceMergeMode();
        };

        // Compare Action Bar handlers
        document.getElementById('calculateSimilarityBtn').onclick = () => {
            if (this.selectedFacesForCompare.size >= 2) {
                this.calculateFaceSimilarities();
            }
        };

        document.getElementById('cancelCompareBtn').onclick = () => {
            this.toggleFaceCompareMode();
        };

        // Keyboard shortcuts
        document.addEventListener('keydown', this.faceCatalogKeyHandler = (e) => {
            // Only handle if face catalog is visible
            if (document.getElementById('faceCatalogView').style.display !== 'flex') return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();

                // If detail modal is open, close it first
                const detailModal = document.getElementById('faceDetailModal');
                if (detailModal.style.display === 'flex') {
                    detailModal.style.display = 'none';
                } else if (this.faceCatalogMergeMode) {
                    this.toggleFaceMergeMode(); // Exit merge mode
                }
                // Stay in face catalog view (don't exit on ESC)
            }
        });
    }

    toggleFaceMergeMode() {
        this.faceCatalogMergeMode = !this.faceCatalogMergeMode;
        this.selectedFacesForMerge.clear();

        const mergeBtn = document.getElementById('faceMergeModeBtn');
        const actionBar = document.getElementById('faceMergeActionBar');

        if (this.faceCatalogMergeMode) {
            mergeBtn.textContent = '✓ Exit Merge Mode';
            mergeBtn.classList.add('active');
            console.log('Merge Mode: Select faces to merge')

            // Show checkboxes on all face cards
            document.querySelectorAll('.face-catalog-checkbox').forEach(cb => {
                cb.style.opacity = '1';
            });

            // Add merge-mode class to catalog
            document.getElementById('faceCatalogView').classList.add('face-merge-mode');
        } else {
            mergeBtn.textContent = '🔀 Merge Mode';
            mergeBtn.classList.remove('active');

            // Hide checkboxes
            document.querySelectorAll('.face-catalog-checkbox').forEach(cb => {
                cb.style.opacity = '0';
                cb.checked = false;
            });

            // Clear selections
            document.querySelectorAll('.face-catalog-card').forEach(card => {
                card.classList.remove('selected');
            });

            // Hide action bar
            actionBar.style.display = 'none';

            // Remove merge-mode class
            document.getElementById('faceCatalogView').classList.remove('face-merge-mode');
        }
    }

    toggleFaceCatalogView(viewMode) {
        this.faceCatalogViewMode = viewMode;

        const gridBtn = document.getElementById('faceGridViewBtn');
        const rowBtn = document.getElementById('faceRowViewBtn');
        const gridContainer = document.getElementById('faceListGrid');
        const rowContainer = document.getElementById('faceListRows');

        if (viewMode === 'grid') {
            gridBtn.classList.add('active-view');
            rowBtn.classList.remove('active-view');
            gridContainer.style.display = 'grid';
            rowContainer.style.display = 'none';
        } else if (viewMode === 'row') {
            gridBtn.classList.remove('active-view');
            rowBtn.classList.add('active-view');
            gridContainer.style.display = 'none';
            rowContainer.style.display = 'flex';
            // Render row view with current data
            if (this.faceCatalogData) {
                this.renderFaceListRows(this.faceCatalogData);
            }
        }
    }

    toggleFaceForMerge(faceId, itemEl) {
        const checkbox = itemEl.querySelector('.face-catalog-checkbox');

        if (this.selectedFacesForMerge.has(faceId)) {
            this.selectedFacesForMerge.delete(faceId);
            itemEl.classList.remove('selected');
            checkbox.checked = false;
        } else {
            this.selectedFacesForMerge.add(faceId);
            itemEl.classList.add('selected');
            checkbox.checked = true;
        }

        // Update merge action bar
        const actionBar = document.getElementById('faceMergeActionBar');
        const countEl = document.getElementById('faceMergeCount');

        if (this.selectedFacesForMerge.size >= 2) {
            actionBar.style.display = 'block';
            countEl.textContent = `${this.selectedFacesForMerge.size} selected`;
        } else {
            actionBar.style.display = 'none';
        }
    }

    async showMergeConfirmation() {
        const faceIds = Array.from(this.selectedFacesForMerge);

        // Get face data for selected faces
        const selectedFaces = this.faceCatalogData.filter(f => faceIds.includes(f.id));

        // Sort by video count (descending) to recommend the one with most data
        selectedFaces.sort((a, b) => (b.video_count || 0) - (a.video_count || 0));

        // Populate modal
        const optionsContainer = document.getElementById('faceMergeOptions');
        optionsContainer.innerHTML = '';

        selectedFaces.forEach((face, index) => {
            const isRecommended = index === 0; // First one (most videos) is recommended

            const thumbnailSrc = face.thumbnail
                ? `data:image/jpeg;base64,${face.thumbnail}`
                : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2230%22%3E👤%3C/text%3E%3C/svg%3E';

            const option = document.createElement('label');
            option.className = 'face-merge-option';
            if (isRecommended) option.classList.add('selected');

            option.innerHTML = `
                <input type="radio" name="targetFace" value="${face.id}" ${isRecommended ? 'checked' : ''}>
                <img src="${thumbnailSrc}" class="face-merge-thumbnail" alt="${face.name}">
                <div class="face-merge-info">
                    <div class="face-merge-name">
                        ${face.name}
                        ${isRecommended ? '<span class="face-merge-recommended">✓ Recommended</span>' : ''}
                    </div>
                    <div class="face-merge-stats">
                        ${face.video_count || 0} video${(face.video_count || 0) !== 1 ? 's' : ''} •
                        ${face.encoding_count || 0} encoding${(face.encoding_count || 0) !== 1 ? 's' : ''}
                    </div>
                </div>
            `;

            // Update selection styling
            const radio = option.querySelector('input[type="radio"]');
            radio.addEventListener('change', () => {
                document.querySelectorAll('.face-merge-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                if (radio.checked) {
                    option.classList.add('selected');
                }
            });

            optionsContainer.appendChild(option);
        });

        // Show modal
        document.getElementById('faceMergeModal').style.display = 'flex';
    }

    hideFaceMergeModal() {
        document.getElementById('faceMergeModal').style.display = 'none';
    }

    async confirmFaceMerge() {
        // Get selected target face
        const selectedRadio = document.querySelector('input[name="targetFace"]:checked');
        if (!selectedRadio) {
            console.log('Please select a target face')
            return;
        }

        const targetId = parseInt(selectedRadio.value);
        const allFaceIds = Array.from(this.selectedFacesForMerge);

        // Source IDs are all selected faces except the target
        const sourceIds = allFaceIds.filter(id => id !== targetId);

        if (sourceIds.length === 0) {
            console.log('No source faces to merge')
            return;
        }

        // Hide modal
        this.hideFaceMergeModal();

        // Perform merge
        await this.mergeFaces(sourceIds, targetId);
    }

    async mergeFaces(sourceIds, targetId) {
        try {
            // Backend expects face_ids array with target as first element
            const faceIds = [targetId, ...sourceIds];

            const response = await fetch(`${this.apiBase}/api/faces/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_ids: faceIds
                })
            });

            if (!response.ok) {
                throw new Error('Failed to merge faces');
            }

            const result = await response.json();
            console.log(`Merged ${sourceIds.length} face${sourceIds.length !== 1 ? 's' : ''} successfully`)

            // Close modal if open
            this.hideFaceMergeModal();

            // Reload catalog (force reload after merge)
            await this.loadFaceCatalogData(true);

            // Exit merge mode
            this.toggleFaceMergeMode();

        } catch (error) {
            console.error('Error merging faces:', error);
            console.log('Failed to merge faces')
        }
    }

    startFaceMergeFromDetail(face) {
        // Enable merge mode and pre-select this face
        if (!this.faceCatalogMergeMode) {
            this.toggleFaceMergeMode();
        }

        // Select this face
        const faceItem = document.querySelector(`.face-list-item[data-face-id="${face.id}"]`);
        if (faceItem) {
            this.toggleFaceForMerge(face.id, faceItem);
        }

        console.log('Merge mode: Select additional faces to merge with this one')
    }

    async renameFaceInCatalog(face) {
        const newName = prompt(`Rename face "${face.name}" to:`, face.name);

        if (!newName || newName.trim() === '') {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/api/faces/${face.id}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });

            if (!response.ok) {
                throw new Error('Failed to rename face');
            }

            console.log('Face renamed')

            // Reload and refresh (force reload after rename)
            await this.loadFaceCatalogData(true);

            // Re-select the renamed face
            const updatedFace = this.faceCatalogData.find(f => f.id === face.id);
            if (updatedFace) {
                this.selectFace(updatedFace);
            }

        } catch (error) {
            console.error('Error renaming face:', error);
            console.log('Failed to rename face')
        }
    }

    toggleFaceCompareMode() {
        this.faceCatalogCompareMode = !this.faceCatalogCompareMode;
        this.selectedFacesForCompare.clear();

        const compareBtn = document.getElementById('faceCompareModeBtn');
        const actionBar = document.getElementById('faceCompareActionBar');

        if (this.faceCatalogCompareMode) {
            compareBtn.textContent = '✓ Exit Compare Mode';
            compareBtn.classList.add('active');
            console.log('Compare Mode: Select faces to compare')

            // Show checkboxes on all face cards
            document.querySelectorAll('.face-catalog-checkbox').forEach(cb => {
                cb.style.opacity = '1';
            });

            // Add compare-mode class to catalog
            document.getElementById('faceCatalogView').classList.add('face-compare-mode');
        } else {
            compareBtn.textContent = '📊 Compare';
            compareBtn.classList.remove('active');

            // Hide checkboxes
            document.querySelectorAll('.face-catalog-checkbox').forEach(cb => {
                cb.style.opacity = '0';
                cb.checked = false;
            });

            // Clear selections
            document.querySelectorAll('.face-catalog-card').forEach(card => {
                card.classList.remove('selected');
            });

            // Hide action bar
            actionBar.style.display = 'none';

            // Remove compare-mode class
            document.getElementById('faceCatalogView').classList.remove('face-compare-mode');
        }
    }

    toggleFaceForCompare(faceId, itemEl) {
        const checkbox = itemEl.querySelector('.face-catalog-checkbox');

        if (this.selectedFacesForCompare.has(faceId)) {
            this.selectedFacesForCompare.delete(faceId);
            itemEl.classList.remove('selected');
            checkbox.checked = false;
        } else {
            this.selectedFacesForCompare.add(faceId);
            itemEl.classList.add('selected');
            checkbox.checked = true;
        }

        // Update compare action bar
        const actionBar = document.getElementById('faceCompareActionBar');
        const countEl = document.getElementById('faceCompareCount');

        if (this.selectedFacesForCompare.size >= 2) {
            actionBar.style.display = 'block';
            countEl.textContent = `${this.selectedFacesForCompare.size} selected`;
        } else {
            actionBar.style.display = 'none';
        }
    }

    async calculateFaceSimilarities() {
        /**
         * Calculate and display similarity scores for selected faces
         */
        if (this.selectedFacesForCompare.size < 2) {
            console.log('Select at least 2 faces to compare')
            return;
        }

        try {
            console.log('📊 Calculating similarities...')

            const faceIds = Array.from(this.selectedFacesForCompare);

            const response = await fetch(`${this.apiBase}/api/faces/compare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ face_ids: faceIds })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to compare faces');
            }

            const data = await response.json();

            // Show comparison modal
            this.showFaceComparisonModal(data);

            console.log('✓ Comparison complete')

        } catch (error) {
            console.error('Error calculating similarities:', error);
            console.log(`Failed to compare faces: ${error.message}`)
        }
    }

    showFaceComparisonModal(data) {
        /**
         * Display face comparison results
         */
        const modal = document.getElementById('faceComparisonModal');
        const content = document.getElementById('faceComparisonContent');

        // Build face cards
        const facesHtml = data.faces.map(face => `
            <div class="face-comparison-card">
                <img src="data:image/jpeg;base64,${face.thumbnail || ''}" 
                     class="face-comparison-thumbnail"
                     onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2280%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22100%22 height=%2280%22/%3E%3C/svg%3E'">
                <div class="face-comparison-name">${face.face_name}</div>
            </div>
        `).join('');

        // Build comparison table
        const tableHtml = `
            <table class="face-comparison-table">
                <thead>
                    <tr>
                        <th>Face 1</th>
                        <th>Face 2</th>
                        <th>Similarity Score</th>
                        <th>Match %</th>
                        <th>Will Group (75%)?</th>
                        <th>Will Group (70%)?</th>
                    </tr>
                </thead>
                <tbody>
                    ${data.comparisons.map(comp => {
            const scoreClass = comp.similarity >= 0.75 ? 'high' : comp.similarity >= 0.65 ? 'medium' : 'low';
            return `
                            <tr>
                                <td><strong>${comp.face1_name}</strong></td>
                                <td><strong>${comp.face2_name}</strong></td>
                                <td>
                                    <div class="face-comparison-score ${scoreClass}">
                                        ${comp.similarity.toFixed(3)}
                                    </div>
                                    <div class="face-comparison-bar">
                                        <div class="face-comparison-bar-fill" style="width: ${comp.similarity * 100}%"></div>
                                    </div>
                                </td>
                                <td>${comp.similarity_percent}%</td>
                                <td>${comp.would_group_at_75 ? '✅ Yes' : '❌ No'}</td>
                                <td>${comp.would_group_at_70 ? '✅ Yes' : '❌ No'}</td>
                            </tr>
                        `;
        }).join('')}
                </tbody>
            </table>
        `;

        content.innerHTML = `
            <div class="face-comparison-results">
                <div class="face-comparison-faces">
                    ${facesHtml}
                </div>
                ${tableHtml}
                <p style="color: #6b7280; font-size: 13px; margin-top: 20px;">
                    <strong>Tip:</strong> Scores above 75% will be grouped together. If similar faces aren't being grouped,
                    their similarity score might be below the threshold.
                </p>
            </div>
        `;

        modal.style.display = 'flex';
    }

    async deleteFaceInCatalog(face) {
        if (!confirm(`Delete face "${face.name}" and all ${face.encoding_count} encoding${face.encoding_count !== 1 ? 's' : ''}?`)) {
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/api/faces/${face.id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete face');
            }

            console.log(`Face "${face.name}" deleted`)

            // Close the detail modal immediately
            document.getElementById('faceDetailModal').style.display = 'none';

            // Clear selection
            this.selectedFace = null;

            // Reload catalog (force reload after deletion)
            await this.loadFaceCatalogData(true);

        } catch (error) {
            console.error('Error deleting face:', error);
            console.log('Failed to delete face')
        }
    }

    async showFaceGroupingView() {
        /**
         * Show full-screen view of grouped similar faces
         * Uses primary encodings only for optimization
         */
        try {
            // Hide main UI, show grouping view
            document.getElementById('faceCatalogView').style.display = 'none';
            document.getElementById('faceGroupingView').style.display = 'flex';

            // Prevent body scroll
            document.body.classList.add('video-modal-open');

            // Initialize selection state
            this.selectedFacesForGroupMerge = new Set();

            console.log('🔗 Analyzing similar faces...')

            // Fetch groups from backend
            const response = await fetch(`${this.apiBase}/api/faces/group/similar?threshold=0.75`);
            if (!response.ok) {
                throw new Error('Failed to load face groups');
            }

            const data = await response.json();

            // Render grouping view
            this.renderFaceGroups(data);

            // Setup event listeners
            this.setupFaceGroupingListeners();

            console.log(`Found ${data.group_count} group(s) of similar faces`)

        } catch (error) {
            console.error('Error showing face grouping view:', error);
            console.log(`Failed to load similar faces: ${error.message}`)
            // Exit if error
            document.getElementById('faceGroupingView').style.display = 'none';
            document.getElementById('faceCatalogView').style.display = 'flex';
        }
    }

    exitFaceGroupingView() {
        // Hide grouping view, show face catalog
        document.getElementById('faceGroupingView').style.display = 'none';
        document.getElementById('faceCatalogView').style.display = 'flex';

        // Restore body scroll
        document.body.classList.remove('video-modal-open');
    }

    renderFaceGroups(data) {
        /**
         * Render face groups in the grouping view
         */
        const content = document.getElementById('faceGroupingContent');

        // Update stats
        document.getElementById('faceGroupingStats').textContent =
            `${data.group_count} group${data.group_count !== 1 ? 's' : ''} • ${data.faces_in_groups} face${data.faces_in_groups !== 1 ? 's' : ''}`;

        if (!data.groups || data.groups.length === 0) {
            content.innerHTML = `
                <div class="face-grouping-empty">
                    <p>😊 No similar faces found</p>
                    <p style="color: #9ca3af; font-size: 14px;">All faces have unique primary encodings</p>
                </div>
            `;
            return;
        }

        content.innerHTML = '';

        data.groups.forEach((group, groupIndex) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'face-grouping-group';
            groupEl.dataset.groupId = group.group_id;

            const headerHtml = `
                <div class="face-grouping-group-header">
                    <div class="face-grouping-group-number">${groupIndex + 1}</div>
                    <div class="face-grouping-group-info">
                        <div class="face-grouping-group-title">Group ${groupIndex + 1}: ${group.face_count} Similar Face${group.face_count !== 1 ? 's' : ''}</div>
                        <div class="face-grouping-group-stats">
                            Compare with primary: ${group.faces[0].name} (best candidate for merging)
                        </div>
                    </div>
                </div>
            `;

            const facesHtml = group.faces.map((face, idx) => `
                <div class="face-grouping-card" data-face-id="${face.face_id}">
                    <input type="checkbox" class="face-grouping-card-checkbox" data-face-id="${face.face_id}">
                    <img src="data:image/jpeg;base64,${face.thumbnail || ''}" 
                         class="face-grouping-thumbnail" 
                         onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22150%22 height=%22120%22%3E%3Crect fill=%22%23f3f4f6%22 width=%22150%22 height=%22120%22/%3E%3C/svg%3E'">
                    <div class="face-grouping-card-name">${face.name}</div>
                    <div class="face-grouping-card-similarity">${face.similarity_percent}% match</div>
                    <div class="face-grouping-card-stats">${face.encoding_count} enc • ${face.video_count} vid</div>
                    <div class="face-grouping-actions">
                        <button class="face-grouping-action-btn inspect-btn" data-face-id="${face.face_id}">
                            View
                        </button>
                    </div>
                </div>
            `).join('');

            groupEl.innerHTML = headerHtml + `<div class="face-grouping-group-faces">${facesHtml}</div>`;

            content.appendChild(groupEl);
        });
    }

    setupFaceGroupingListeners() {
        /**
         * Setup event listeners for face grouping view
         */
        // Exit button
        document.getElementById('exitFaceGroupingView').onclick = () => {
            this.exitFaceGroupingView();
        };

        // Checkboxes for face selection
        document.querySelectorAll('.face-grouping-card-checkbox').forEach(checkbox => {
            checkbox.onclick = (e) => {
                e.stopPropagation();
                const faceId = parseInt(checkbox.dataset.faceId);
                const card = checkbox.closest('.face-grouping-card');

                if (checkbox.checked) {
                    this.selectedFacesForGroupMerge.add(faceId);
                    card.classList.add('selected');
                } else {
                    this.selectedFacesForGroupMerge.delete(faceId);
                    card.classList.remove('selected');
                }

                // Update action bar
                this.updateGroupMergeActionBar();
            };
        });

        // Card click to toggle checkbox
        document.querySelectorAll('.face-grouping-card').forEach(card => {
            card.onclick = (e) => {
                // Don't toggle if clicking buttons
                if (e.target.closest('.face-grouping-actions')) return;

                const checkbox = card.querySelector('.face-grouping-card-checkbox');
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            };
        });

        // Inspect buttons
        document.querySelectorAll('.face-grouping-action-btn.inspect-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const faceId = btn.dataset.faceId;
                // Find face in catalog data and show detail
                const face = this.faceCatalogData.find(f => f.id === parseInt(faceId));
                if (face) {
                    this.selectFace(face);
                    // Close grouping, stay in catalog
                    this.exitFaceGroupingView();
                }
            };
        });

        // Merge action bar buttons
        document.getElementById('groupConfirmMergeBtn').onclick = () => {
            if (this.selectedFacesForGroupMerge.size >= 2) {
                this.showGroupMergeConfirmation();
            }
        };

        document.getElementById('groupCancelMergeBtn').onclick = () => {
            this.clearGroupMergeSelection();
        };
    }

    updateGroupMergeActionBar() {
        const actionBar = document.getElementById('faceGroupMergeActionBar');
        const countEl = document.getElementById('faceGroupMergeCount');

        if (this.selectedFacesForGroupMerge.size >= 2) {
            actionBar.style.display = 'block';
            countEl.textContent = `${this.selectedFacesForGroupMerge.size} selected`;
        } else {
            actionBar.style.display = 'none';
            countEl.textContent = '0 selected';
        }
    }

    clearGroupMergeSelection() {
        this.selectedFacesForGroupMerge.clear();

        // Uncheck all checkboxes
        document.querySelectorAll('.face-grouping-card-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });

        // Remove selection styling
        document.querySelectorAll('.face-grouping-card').forEach(card => {
            card.classList.remove('selected');
        });

        // Hide action bar
        document.getElementById('faceGroupMergeActionBar').style.display = 'none';
    }

    showGroupMergeConfirmation() {
        const selectedIds = Array.from(this.selectedFacesForGroupMerge);
        const selectedFaces = selectedIds.map(id => this.faceCatalogData.find(f => f.id === id)).filter(f => f);

        if (selectedFaces.length < 2) {
            console.log('Select at least 2 faces to merge')
            return;
        }

        const primaryFace = selectedFaces[0];
        this.performGroupMerge(primaryFace.id, selectedFaces.slice(1).map(f => f.id));
    }

    async performGroupMerge(primaryFaceId, secondaryFaceIds) {
        try {
            // Mark faces as merging FIRST with spinner
            const allSelectedIds = [primaryFaceId, ...secondaryFaceIds];
            allSelectedIds.forEach(faceId => {
                const card = document.querySelector(`[data-face-id="${faceId}"]`);
                if (card) {
                    card.classList.add('merging');
                }
            });

            // Merge all selected faces at once
            const allFaceIds = [primaryFaceId, ...secondaryFaceIds];
            const response = await fetch(`${this.apiBase}/api/faces/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_ids: allFaceIds
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Merge failed');
            }

            const result = await response.json();

            // Show merged indicator on cards - keep them visible
            allSelectedIds.forEach(faceId => {
                const card = document.querySelector(`[data-face-id="${faceId}"]`);
                if (card) {
                    card.classList.remove('merging');
                    card.classList.add('merged');
                }
            });

            // Clear selection
            this.clearGroupMergeSelection();

        } catch (error) {
            console.error('Error merging faces:', error);

            // Remove merging state on error
            document.querySelectorAll('.face-grouping-card.merging').forEach(card => {
                card.classList.remove('merging');
            });
        }
    }

    async findDuplicateFaces(face) {
        /**
         * Find similar faces by searching the primary encoding against all other faces
         * Updated threshold for better results
         */
        try {
            console.log(`🔍 Searching for similar faces...`)

            // Check if we have a thumbnail to search with
            if (!face.thumbnail) {
                console.log('No thumbnail available for this face')
                return;
            }

            // Convert thumbnail (base64) back to blob for FormData
            const binaryString = atob(face.thumbnail);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], { type: 'image/jpeg' });

            // Prepare FormData for the API endpoint
            const formData = new FormData();
            formData.append('face_image', blob, 'face.jpg');
            formData.append('video_id', '0');  // Use 0 as placeholder for catalog search
            formData.append('frame_timestamp', '0');  // Use 0 as placeholder for catalog search
            formData.append('threshold', '0.75');  // Increased from 0.7 to 0.75 for better matching
            formData.append('exclude_face_id', face.id);  // Exclude current face from results

            // Search similar faces using the face catalog search
            const response = await fetch(`${this.apiBase}/api/faces/search`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API error response:', errorText);
                throw new Error('Failed to search for similar faces');
            }

            const data = await response.json();

            if (!data.matches || data.matches.length === 0) {
                console.log('No duplicate faces found')
                return;
            }

            // Show results in a dedicated modal
            this.showDuplicateFacesModal(face, data.matches);

        } catch (error) {
            console.error('Error finding duplicate faces:', error);
            console.log(`Failed to find duplicates: ${error.message}`)
        }
    }

    showDuplicateFacesModal(primaryFace, matches) {
        /**
         * Show modal with similar faces found
         * User can select which ones to merge with primary
         */
        const modal = document.createElement('div');
        modal.id = 'duplicateFacesModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            overflow-y: auto;
        `;

        const isMobile = window.innerWidth < 480;
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: ${isMobile ? '16px' : '24px'};
            border-radius: 12px;
            max-width: ${isMobile ? '95vw' : '900px'};
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
            margin: auto;
        `;

        // Check if no matches found
        if (!matches || matches.length === 0) {
            content.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h2 style="margin: 0; font-size: 20px;">🔍 Find Duplicates</h2>
                    <button onclick="document.getElementById('duplicateFacesModal').remove();" style="background: none; border: none; font-size: 24px; cursor: pointer;">✕</button>
                </div>

                <div style="padding: 40px 20px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">😊</div>
                    <div style="font-size: 18px; font-weight: 600; color: #1f2937; margin-bottom: 8px;">No Duplicate Faces Found</div>
                    <div style="color: #6b7280; margin-bottom: 20px;">
                        Great! <strong>${primaryFace.name}</strong> has no matching duplicate faces in the catalog.
                    </div>
                </div>

                <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
                    <button onclick="document.getElementById('duplicateFacesModal').remove();" style="width: 100%; padding: 10px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                        Close
                    </button>
                </div>
            `;

            modal.appendChild(content);
            document.body.appendChild(modal);
            return;
        }

        // Sort by similarity, highest first
        const sorted = [...matches].sort((a, b) => (b.similarity_percent || 0) - (a.similarity_percent || 0));

        content.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="margin: 0; font-size: 20px;">🔍 Found ${sorted.length} Similar Face${sorted.length !== 1 ? 's' : ''}</h2>
                <button onclick="document.getElementById('duplicateFacesModal').remove();" style="background: none; border: none; font-size: 24px; cursor: pointer;">✕</button>
            </div>

            <p style="color: #6b7280; margin-bottom: 20px;">
                Select faces to merge into <strong>${primaryFace.name}</strong>. All encodings will be combined.
            </p>

            <div id="duplicateFacesGrid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(${isMobile ? '70px' : '100px'}, 1fr)); gap: ${isMobile ? '12px' : '16px'}; margin-bottom: 20px;">
            </div>

            <div style="display: flex; gap: 10px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                <button onclick="document.getElementById('duplicateFacesModal').remove();" style="flex: 1; padding: 10px; background: #ef4444; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Cancel
                </button>
                <button onclick="app.confirmMergeDuplicates(${primaryFace.id})" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 500;">
                    Merge Selected
                </button>
            </div>
        `;

        modal.appendChild(content);
        document.body.appendChild(modal);

        // Populate grid
        const grid = document.getElementById('duplicateFacesGrid');
        this.selectedDuplicatesForMerge = new Set();

        sorted.forEach(match => {
            const card = document.createElement('div');
            card.style.cssText = `
                padding: 8px;
                border: 2px solid #e5e7eb;
                border-radius: 8px;
                cursor: pointer;
                text-align: center;
                background: white;
                transition: all 0.2s;
            `;
            card.dataset.faceId = match.face_id;

            const thumbnail = match.thumbnail || match.matched_encodings?.[0]?.thumbnail;
            const thumbnailSrc = thumbnail ? `data:image/jpeg;base64,${thumbnail}` : '👤';

            card.innerHTML = `
                <div style="width: 100%; aspect-ratio: 1; background: #f3f4f6; border-radius: 6px; margin-bottom: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                    ${thumbnail ? `<img src="${thumbnailSrc}" style="width: 100%; height: 100%; object-fit: cover;">` : '<span style="font-size: 32px;">👤</span>'}
                </div>
                <div style="font-size: 11px;">
                    <div style="color: #1f2937; font-weight: 600;">${(match.similarity_percent || 0).toFixed(0)}%</div>
                    <div style="color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${match.name}</div>
                </div>
            `;

            card.onclick = () => {
                if (this.selectedDuplicatesForMerge.has(match.face_id)) {
                    this.selectedDuplicatesForMerge.delete(match.face_id);
                    card.style.borderColor = '#e5e7eb';
                    card.style.background = 'white';
                } else {
                    this.selectedDuplicatesForMerge.add(match.face_id);
                    card.style.borderColor = '#10b981';
                    card.style.background = '#ecfdf5';
                }
            };

            grid.appendChild(card);
        });
    }

    async confirmMergeDuplicates(primaryFaceId) {
        /**
         * Merge selected duplicate faces into primary face
         */
        if (this.selectedDuplicatesForMerge.size === 0) {
            console.log('Please select at least one face to merge')
            return;
        }

        const facesToMerge = [primaryFaceId, ...this.selectedDuplicatesForMerge];
        const confirmed = confirm(`Merge ${this.selectedDuplicatesForMerge.size} face${this.selectedDuplicatesForMerge.size !== 1 ? 's' : ''} into this one?`);

        if (!confirmed) {
            return;
        }

        try {
            console.log('Merging faces...')

            const response = await fetch(`${this.apiBase}/api/faces/merge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    face_ids: facesToMerge
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to merge faces');
            }

            const result = await response.json();

            // Close modal
            const modal = document.getElementById('duplicateFacesModal');
            if (modal) modal.remove();

            console.log(`✅ Merged ${this.selectedDuplicatesForMerge.size} face${this.selectedDuplicatesForMerge.size !== 1 ? 's' : ''} into ${result.name}`)

            // Check if video player is open - if so, close it to restore previous view
            const videoModal = document.getElementById('videoModal');
            if (videoModal && videoModal.style.display === 'flex') {
                // Video is open - close it to properly restore the previous view
                this.hideVideoPlayer();
            } else {
                // No video open - just reload face catalog and select merged face (force reload after merge)
                await this.loadFaceCatalogData(true);
                const mergedFace = this.faceCatalogData.find(f => f.id === primaryFaceId);
                if (mergedFace) {
                    this.selectFace(mergedFace);
                }
            }

        } catch (error) {
            console.error('Error merging faces:', error);
            console.log(`Failed to merge: ${error.message}`)
        }
    }

    async setPrimaryEncoding(faceId, encodingId) {
        try {
            const response = await fetch(`${this.apiBase}/api/faces/${faceId}/primary-encoding/${encodingId}`, {
                method: 'PUT'
            });

            if (!response.ok) {
                throw new Error('Failed to set primary encoding');
            }

            const data = await response.json();
            console.log('Preview thumbnail updated')

            // Update the selected face object
            if (this.selectedFace && this.selectedFace.id === faceId) {
                this.selectedFace.primary_encoding_id = encodingId;
            }

            // Reload the encodings gallery to reflect the change
            await this.loadFaceEncodings(this.selectedFace);

            // Reload the face catalog to update the preview thumbnail (force reload after change)
            await this.loadFaceCatalogData(true);

        } catch (error) {
            console.error('Error setting primary encoding:', error);
            console.log('Failed to update preview thumbnail')
        }
    }

    // ==================== Fingerprint Viewer Methods (delegated to FingerprintModule) ====================

    viewFingerprintsFromContext() { this.fingerprint.viewFingerprintsFromContext() }
    async showFingerprintViewer(videoId, videoName) { await this.fingerprint.showFingerprintViewer(videoId, videoName) }
    async loadFingerprintFrames(videoId) { await this.fingerprint.loadFingerprintFrames(videoId) }
    renderFingerprintFrames(frames) { this.fingerprint.renderFingerprintFrames(frames) }
    async deleteFingerprintFrame(fingerprintId) { await this.fingerprint.deleteFingerprintFrame(fingerprintId) }

    // Show confirmation modal (returns Promise<boolean>)
    showConfirmModal(title, message, confirmText = 'Confirm', confirmStyle = 'danger') {
        return new Promise((resolve) => {
            const modal = document.getElementById('confirmModal');
            const titleEl = document.getElementById('confirmModalTitle');
            const messageEl = document.getElementById('confirmModalMessage');
            const confirmBtn = document.getElementById('confirmModalConfirm');
            const cancelBtn = document.getElementById('confirmModalCancel');
            const closeBtn = document.getElementById('confirmModalClose');

            // Set content (use innerHTML to support HTML formatting)
            titleEl.textContent = title;
            messageEl.innerHTML = message;
            confirmBtn.textContent = confirmText;

            // Set button style
            confirmBtn.className = 'thumbnail-modal-btn';
            confirmBtn.classList.add(confirmStyle);

            // Show modal
            modal.style.display = 'flex';

            // Setup slider listener for cut method if slider exists
            const cutMethodSlider = document.getElementById('cutMethodSlider');
            if (cutMethodSlider) {
                const updateCutMethodLabel = () => {
                    const value = cutMethodSlider.value;
                    const labels = {
                        '0': { text: '🚀 Stream Copy (Fastest, Keyframes)', color: '#3b82f6' },
                        '1': { text: '⚡ Smartcut (Fast, Frame Accurate)', color: '#ef4444' },
                        '2': { text: '🎯 FFmpeg (Precise, Re-encode)', color: '#f97316' }
                    };
                    const label = document.getElementById('cutMethodLabel');
                    const info = labels[value] || labels['1'];
                    label.textContent = info.text;
                    label.style.color = info.color;
                };

                // Initial label
                updateCutMethodLabel();

                // Update on slider change
                cutMethodSlider.addEventListener('input', updateCutMethodLabel);
            }

            // Handle confirm
            const handleConfirm = () => {
                cleanup();
                resolve(true);
            };

            // Handle cancel
            const handleCancel = () => {
                cleanup();
                resolve(false);
            };

            // Cleanup function to remove listeners and hide modal
            const cleanup = () => {
                modal.style.display = 'none';
                confirmBtn.removeEventListener('click', handleConfirm);
                cancelBtn.removeEventListener('click', handleCancel);
                closeBtn.removeEventListener('click', handleCancel);
                document.removeEventListener('keydown', handleEscape);
            };

            // Handle Escape key
            const handleEscape = (e) => {
                if (e.key === 'Escape') {
                    handleCancel();
                }
            };

            // Add event listeners
            confirmBtn.addEventListener('click', handleConfirm);
            cancelBtn.addEventListener('click', handleCancel);
            closeBtn.addEventListener('click', handleCancel);
            document.addEventListener('keydown', handleEscape);
        });
    }

    hideFingerprintViewer() { this.fingerprint.hideFingerprintViewer() }
    async openFingerprintGenerationFromViewer() { await this.fingerprint.openFingerprintGenerationFromViewer() }
    async addCurrentFrameToFingerprint() { await this.fingerprint.addCurrentFrameToFingerprint() }

    // ==================== INTERACTIVE FINGERPRINT GENERATION (delegated to FingerprintModule) ====================

    openFingerprintGenerationModal(video) { this.fingerprint.openFingerprintGenerationModal(video) }
    async generateRandomFingerprintFrames() { await this.fingerprint.generateRandomFingerprintFrames() }
    renderFingerprintGenerationFrames() { this.fingerprint.renderFingerprintGenerationFrames() }
    toggleFingerprintFrameSelection(index) { this.fingerprint.toggleFingerprintFrameSelection(index) }
    updateFingerprintGenerationSelection() { this.fingerprint.updateFingerprintGenerationSelection() }
    selectAllFingerprintFrames() { this.fingerprint.selectAllFingerprintFrames() }
    deselectAllFingerprintFrames() { this.fingerprint.deselectAllFingerprintFrames() }
    async addSelectedFingerprintFrames() { await this.fingerprint.addSelectedFingerprintFrames() }
    closeFingerprintGenerationModal() { this.fingerprint.closeFingerprintGenerationModal() }

    // ==================== Help Modal Methods ====================

    showHelpModal() {
        const modal = document.getElementById('helpModal');
        modal.style.display = 'flex';
    }

    hideHelpModal() {
        const modal = document.getElementById('helpModal');
        modal.style.display = 'none';
    }

    // ==================== Audio Modal Methods ====================

    async showAddAudioModal() {
        if (!this.currentVideo) {
            console.log('❌ No video selected');
            return;
        }

        // Get full video object
        const video = this.allVideos.find(v => v.id === this.currentVideo.id) ||
            this.videos.find(v => v.id === this.currentVideo.id);

        if (!video) {
            console.log('❌ Could not find video');
            return;
        }

        this.currentVideo = video;
        this.selectedAudio = null; // Reset selection

        // Open modal
        const modal = document.getElementById('addAudioModal');
        modal.style.display = 'flex';

        // Reset button states
        document.getElementById('addAudioConfirmBtn').disabled = true;

        // Load audio list
        console.log('📂 Loading audio files...');
        try {
            await this.loadAvailableAudios();
        } catch (err) {
            console.error('⚠️ Error loading audios:', err);
            document.getElementById('audioListContainer').innerHTML = '<div style="color: #ef4444; padding: 20px;">Failed to load audio files</div>';
        }
    }

    hideAddAudioModal() {
        const modal = document.getElementById('addAudioModal');
        modal.style.display = 'none';
        this.stopAudioPlayback();
        this.selectedAudio = null;
    }

    async loadAvailableAudios() {
        try {
            console.log('🔄 Fetching /api/audios...');
            const response = await fetch('/api/audios');

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const container = document.getElementById('audioListContainer');

            if (!container) {
                console.error('❌ audioListContainer not found');
                return;
            }

            container.innerHTML = '';

            if (!data.audios || data.audios.length === 0) {
                console.log('⚠️ No audio files found');
                container.innerHTML = '<div style="color: #9ca3af; padding: 20px; text-align: center;">No audio files in .clipper/Audios/</div>';
                return;
            }

            data.audios.forEach(audio => {
                const item = document.createElement('div');
                item.className = 'audio-list-item';
                item.innerHTML = `
                    <span class="audio-item-name">${audio.filename}</span>
                    <button class="audio-delete-btn" title="Delete audio">🗑️</button>
                `;

                // Click on item to select/play
                item.querySelector('.audio-item-name').onclick = (e) => {
                    e.stopPropagation();
                    this.selectAudio(audio, item);
                };

                // Click delete button
                item.querySelector('.audio-delete-btn').onclick = (e) => {
                    e.stopPropagation();
                    this.deleteAudio(audio.filename, item);
                };

                container.appendChild(item);
            });

            console.log(`✅ Loaded ${data.audios.length} audio files`);
        } catch (err) {
            console.error('❌ Failed to load audios:', err);
        }
    }

    selectAudio(audio, element) {
        // Check if same audio is already selected (toggle play/stop)
        if (this.selectedAudio && this.selectedAudio.filename === audio.filename) {
            const audioElement = document.getElementById('audioPreviewAudio');
            if (audioElement.paused) {
                // Paused - resume playing
                audioElement.play();
                console.log(`▶️ Resumed: ${audio.filename}`);
            } else {
                // Playing - stop it
                audioElement.pause();
                audioElement.currentTime = 0;
                console.log(`⏹️ Stopped: ${audio.filename}`);
            }
            return;
        }

        // New audio selected
        document.querySelectorAll('.audio-list-item').forEach(item => {
            item.classList.remove('selected');
        });
        element.classList.add('selected');

        this.selectedAudio = audio;

        // Auto-play selected audio
        this.playAudioPlayback();

        // Enable add button
        document.getElementById('addAudioConfirmBtn').disabled = false;

        console.log(`🎵 Selected & Playing: ${audio.filename}`);
    }

    async deleteAudio(filename, element) {
        if (!confirm(`Delete "${filename}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/audios/${encodeURIComponent(filename)}`, {
                method: 'DELETE'
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to delete audio');
            }

            console.log(`🗑️ Deleted: ${filename}`);

            // Remove from UI
            element.remove();

            // Reset selection if deleted audio was selected
            if (this.selectedAudio && this.selectedAudio.filename === filename) {
                this.selectedAudio = null;
                document.getElementById('addAudioConfirmBtn').disabled = true;
                document.getElementById('audioPreviewAudio').pause();
            }

        } catch (err) {
            console.error('❌ Delete failed:', err.message);
            alert(`Failed to delete: ${err.message}`);
        }
    }

    playAudioPlayback() {
        if (!this.selectedAudio) {
            console.log('❌ No audio selected');
            return;
        }

        const audioElement = document.getElementById('audioPreviewAudio');
        audioElement.src = `/audios/${encodeURIComponent(this.selectedAudio.filename)}`;
        audioElement.play();

        console.log('▶️ Playing audio...');
    }

    stopAudioPlayback() {
        const audioElement = document.getElementById('audioPreviewAudio');
        audioElement.pause();
        audioElement.currentTime = 0;

        console.log('⏹️ Stopped');
    }

    async confirmAddAudio() {
        if (!this.currentVideo || !this.selectedAudio) {
            console.log('❌ Missing selection');
            return;
        }

        const audioFilename = this.selectedAudio.filename;
        const videoFilename = this.currentVideo.filename;
        const videoId = this.currentVideo.id;

        this.stopAudioPlayback();
        this.showProgressOverlay(`🎵 Adding audio...`);

        try {
            const response = await fetch(`/api/videos/${videoId}/add-audio`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio_filename: audioFilename })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Failed to add audio');
            }

            console.log(`✅ Audio added: ${audioFilename}`);

            this.hideAddAudioModal();
            this.hideProgressOverlay();

            // Refresh video
            await this.refreshVideoMetadata(videoId);
            console.log(`✅ Done! Audio added to ${videoFilename}`);

        } catch (err) {
            console.error('❌ Error adding audio:', err.message);
            this.hideProgressOverlay();
            alert(`Failed to add audio: ${err.message}`);
        }
    }

    // ==================== DOWNLOAD MODULE WRAPPERS ====================
    showDownloadM3U8Modal() { this.downloadModule.showDownloadM3U8Modal() }
    hideDownloadM3U8Modal() { this.downloadModule.hideDownloadM3U8Modal() }
    async startM3U8Download() { await this.downloadModule.startM3U8Download() }
    async loadActiveDownloads() { await this.downloadModule.loadActiveDownloads() }
    formatDownloadStatus(status) { return this.downloadModule.formatDownloadStatus(status) }
    getStatusIcon(status) { return this.downloadModule.getStatusIcon(status) }
    showDownloadSOCKSModal() { this.downloadModule.showDownloadSOCKSModal() }
    hideDownloadSOCKSModal() { this.downloadModule.hideDownloadSOCKSModal() }
    async startSOCKSDownload() { await this.downloadModule.startSOCKSDownload() }
    async loadActiveSOCKSDownloads() { await this.downloadModule.loadActiveSOCKSDownloads() }
    showQuickDownloadModal() { this.downloadModule.showQuickDownloadModal() }
    hideQuickDownloadModal() { this.downloadModule.hideQuickDownloadModal() }
    showRefererSetupModal() { this.downloadModule.showRefererSetupModal() }

    hideRefererSetupModal() { this.downloadModule.hideRefererSetupModal() }
    confirmRefererSetup() { this.downloadModule.confirmRefererSetup() }
    skipRefererSetup() { this.downloadModule.skipRefererSetup() }
    async downloadFromClipboard() { await this.downloadModule.downloadFromClipboard() }
    async startQuickDownload() { await this.downloadModule.startQuickDownload() }
    async _executeQuickDownload(url) { await this.downloadModule._executeQuickDownload(url) }
    showBatchDownloadModal() { this.downloadModule.showBatchDownloadModal() }
    hideBatchDownloadModal() { this.downloadModule.hideBatchDownloadModal() }
    async startBatchDownload() { await this.downloadModule.startBatchDownload() }
    async _executeBatchDownload(urls) { await this.downloadModule._executeBatchDownload(urls) }

    // Download state getters/setters for backward compatibility
    get quickDownloadReferer() { return this.downloadModule.quickDownloadReferer }
    set quickDownloadReferer(val) { this.downloadModule.quickDownloadReferer = val }
    get pendingClipboardUrl() { return this.downloadModule.pendingClipboardUrl }
    set pendingClipboardUrl(val) { this.downloadModule.pendingClipboardUrl = val }

    // ==================== Pro Video Editor (Modern UI) ====================

    showVideoEditorModal(videoId, videoName) {
        // Open Pro Editor by default (can toggle to legacy)
        this.openProVideoEditor(videoId, videoName);
    }

    openProVideoEditor(videoId, videoName) {
        console.log('🎬 Opening Pro Video Editor for:', videoName);

        // Close any open context menu
        this.hideVideoContextMenu();

        // Store video info
        this.currentEditVideoId = videoId;
        this.currentEditVideoName = videoName;
        this.editSaveToSameFolder = true; // Default: save to same folder
        this.editVideoOriginalFolder = null; // Will be set from video object

        // Find the video object
        const video = this.videos.find(v => v.id === videoId) ||
            this.allVideos.find(v => v.id === videoId);

        if (!video) {
            console.error('❌ Video not found for ID:', videoId);
            console.log('Error: Video not found')
            return;
        }

        // Store original folder from video
        this.editVideoOriginalFolder = video.folder || video.category || 'Unknown';

        // Update UI to show save location
        this.updateSaveLocationDisplay();

        // Save current view state for restoration
        this.previousViewState = {
            view: this.currentView,
            category: this.currentCategory,
            subcategory: this.currentSubcategory,
            breadcrumb: [...this.breadcrumb]
        };

        // Initialize Pro Video Editor
        this.proEditor = {
            videoData: video, // Database video object
            video: null, // Will be set to {width, height} when metadata loads
            duration: 0,
            inPoint: 0,
            outPoint: 0,
            mode: 'cut', // Start in Cut mode
            cropPreset: '9:16', // Default preset for when switching to Cut & Crop
            cropX: 0,
            cropY: 0,
            cropWidth: 0,
            cropHeight: 0
        };

        // Show editor
        const editor = document.getElementById('proVideoEditor');
        editor.style.display = 'flex';

        // Show loading indicator
        const loadingIndicator = document.getElementById('proEditorLoading');
        loadingIndicator.style.display = 'flex';

        // Load video - HTTP streaming optimized for instant seeking
        // Note: file:// URLs blocked by browser (http pages can't load file:// resources)
        const videoElement = document.getElementById('proEditorVideo');
        const videoPath = this.getVideoStreamingPath(video);
        const httpUrl = `${this.apiBase}/stream/${video.category}/${videoPath}`;

        // Optimize video element for fast seeking
        videoElement.preload = 'auto'; // Preload entire video for instant seeking
        videoElement.crossOrigin = null; // Remove CORS for localhost

        console.log('🚀 Pro Editor: Optimized HTTP streaming (localhost byte-range seeking)');
        console.log('📍 Video URL:', httpUrl);

        videoElement.src = httpUrl;
        videoElement.load();

        // Set up listeners
        this.setupProEditorListeners();

        // Hide other views
        this.hideDuplicatesReviewIfActive();
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.style.display = 'none';
        }
    }

    setupProEditorListeners() {
        const video = document.getElementById('proEditorVideo');
        const playPauseBtn = document.getElementById('proPlayPauseBtn');

        // Video metadata loaded
        video.onloadedmetadata = () => {
            this.proEditor.duration = video.duration;
            this.proEditor.outPoint = video.duration;
            this.proEditor.video = {
                width: video.videoWidth,
                height: video.videoHeight
            };
            this.updateProTimeline();

            // Update metadata display in header
            this.updateProEditorMetadata();

            // Hide loading indicator
            const loadingIndicator = document.getElementById('proEditorLoading');
            loadingIndicator.style.display = 'none';

            // If already in crop mode, setup crop box with correct dimensions
            if (this.proEditor.mode === 'cut_crop') {
                this.setupProCropBox();
            }
        };

        // Video time update - move cursor (optimized with requestVideoFrameCallback)
        // Use requestVideoFrameCallback for smoother updates if available
        if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
            // Modern browsers: sync with video frame rendering for better performance
            const updateCursorFrame = () => {
                this.updateProTimelineCursor();
                if (!video.paused || video.seeking) {
                    video.requestVideoFrameCallback(updateCursorFrame);
                }
            };

            // Start callback chain on play
            video.onplay = () => {
                playPauseBtn.textContent = '⏸';
                video.requestVideoFrameCallback(updateCursorFrame);
            };

            // Single update on pause/seek (no need for continuous updates)
            video.onpause = () => {
                playPauseBtn.textContent = '▶';
                this.updateProTimelineCursor();
            };

            video.onseeked = () => {
                this.updateProTimelineCursor();
            };
        } else {
            // Fallback for older browsers (uses timeupdate event)
            video.ontimeupdate = () => {
                this.updateProTimelineCursor();
            };

            // Separate play/pause handlers for fallback
            video.onplay = () => {
                playPauseBtn.textContent = '⏸';
            };

            video.onpause = () => {
                playPauseBtn.textContent = '▶';
            };
        }

        // Play/Pause button
        playPauseBtn.onclick = () => {
            if (video.paused) {
                video.play();
            } else {
                video.pause();
            }
        };

        // Precision Controls
        const stepFrame = (forward = true) => {
            video.pause();
            // Default to 1/30s which is standard, but some videos might be 60fps
            const frameTime = 1 / 30;
            video.currentTime = forward ?
                Math.min(this.proEditor.duration, video.currentTime + frameTime) :
                Math.max(0, video.currentTime - frameTime);
        };

        const stepSecond = (forward = true) => {
            video.currentTime = forward ?
                Math.min(this.proEditor.duration, video.currentTime + 1) :
                Math.max(0, video.currentTime - 1);
        };

        document.getElementById('proPrevFrameBtn').onclick = () => stepFrame(false);
        document.getElementById('proNextFrameBtn').onclick = () => stepFrame(true);
        document.getElementById('proPrevSecBtn').onclick = () => stepSecond(false);
        document.getElementById('proNextSecBtn').onclick = () => stepSecond(true);

        document.getElementById('proJumpStartBtn').onclick = () => {
            video.currentTime = this.proEditor.inPoint;
        };

        document.getElementById('proJumpEndBtn').onclick = () => {
            video.currentTime = this.proEditor.outPoint;
        };

        document.getElementById('proSetInBtn').onclick = () => {
            this.proEditor.inPoint = video.currentTime;
            this.updateProTimeline();
        };

        document.getElementById('proSetOutBtn').onclick = () => {
            this.proEditor.outPoint = video.currentTime;
            this.updateProTimeline();
        };

        // Timeline dragging setup
        this.setupProTimelineDragging();

        // Operation mode buttons
        document.getElementById('proCutModeBtn').onclick = () => {
            this.setProEditorMode('cut');
        };

        document.getElementById('proCutCropModeBtn').onclick = () => {
            this.setProEditorMode('cut_crop');
        };

        // Crop preset buttons
        document.querySelectorAll('.pro-preset-btn').forEach(btn => {
            btn.onclick = () => {
                document.querySelectorAll('.pro-preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.proEditor.cropPreset = btn.getAttribute('data-preset');
                this.applyProCropPreset();
            };
        });

        // Process button
        document.getElementById('proProcessBtn').onclick = () => {
            this.processFromProEditor();
        };

        // Exit button
        document.getElementById('exitProEditor').onclick = async () => {
            await this.exitProEditor();
        };

        // Switch to legacy button
        // REMOVED - Legacy editor discontinued

        // Keyboard shortcuts toggle button
        document.getElementById('toggleShortcutsBtn').onclick = () => {
            this.toggleKeyboardShortcuts();
        };

        // Reset timeline button
        document.getElementById('proResetTimelineBtn').onclick = () => {
            const video = document.getElementById('proEditorVideo');
            this.proEditor.inPoint = 0;
            this.proEditor.outPoint = this.proEditor.duration;
            this.updateProTimeline();
            console.log('⏮️ Timeline reset to full video')
        };

        // Keyboard shortcuts
        this.setupProEditorKeyboardShortcuts({ stepFrame, stepSecond });
    }

    setProEditorMode(mode) {
        this.proEditor.mode = mode;

        // Update button states
        const cutBtn = document.getElementById('proCutModeBtn');
        const cutCropBtn = document.getElementById('proCutCropModeBtn');

        cutBtn.classList.toggle('active', mode === 'cut');
        cutCropBtn.classList.toggle('active', mode === 'cut_crop');

        // Show/hide crop controls
        const cropPresets = document.getElementById('proCropPresets');
        const cropOverlay = document.getElementById('proCropOverlay');
        const videoWrapper = document.querySelector('.pro-video-wrapper');

        if (mode === 'cut_crop') {
            cropPresets.style.display = 'flex';
            cropOverlay.style.display = 'block';
            videoWrapper.classList.add('crop-mode-active'); // Visual feedback
            this.setupProCropBox();
        } else {
            cropPresets.style.display = 'none';
            cropOverlay.style.display = 'none';
            videoWrapper.classList.remove('crop-mode-active'); // Remove visual feedback
        }
    }

    setupProTimelineDragging() {
        const track = document.getElementById('proTimelineTrack');
        const startHandle = document.getElementById('proHandleStart');
        const endHandle = document.getElementById('proHandleEnd');
        const cursor = document.getElementById('proTimelineCursor');
        const tooltip = document.getElementById('proTimelineTooltip');
        const video = document.getElementById('proEditorVideo');

        let dragging = null; // 'start' | 'end' | 'seek'
        let wasPlaying = false; // Remember play state for smooth seeking

        // Helper to get time from mouse position
        const getTimeFromMouse = (e) => {
            const rect = track.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            return percent * this.proEditor.duration;
        };

        // Helper to show tooltip at mouse position
        const showTooltip = (e, time) => {
            const rect = track.getBoundingClientRect();
            const x = e.clientX - rect.left;
            tooltip.style.left = `${x}px`;
            tooltip.textContent = this.formatDuration(time);
            tooltip.classList.add('visible');
        };

        // Helper to hide tooltip
        const hideTooltip = () => {
            tooltip.classList.remove('visible');
        };

        // Show tooltip on hover
        track.onmouseenter = () => {
            if (!dragging && this.proEditor.duration) {
                // Tooltip will be shown on mousemove
            }
        };

        track.onmouseleave = () => {
            if (!dragging) {
                hideTooltip();
            }
        };

        track.onmousemove = (e) => {
            if (!dragging && this.proEditor.duration) {
                const time = getTimeFromMouse(e);
                showTooltip(e, time);
            }
        };

        // Start handle dragging
        startHandle.onpointerdown = (e) => {
            e.stopPropagation();
            dragging = 'start';
            startHandle.setPointerCapture(e.pointerId);
        };

        // End handle dragging
        endHandle.onpointerdown = (e) => {
            e.stopPropagation();
            dragging = 'end';
            endHandle.setPointerCapture(e.pointerId);
        };

        // Seekbar dragging (drag cursor for smooth seeking with live preview)
        cursor.onpointerdown = (e) => {
            e.stopPropagation();
            dragging = 'seek';
            wasPlaying = !video.paused;
            if (wasPlaying) {
                video.pause(); // Pause during seeking for smooth preview
            }
            cursor.setPointerCapture(e.pointerId);
        };

        // Track click/drag to seek (smooth seeking anywhere on timeline)
        track.onpointerdown = (e) => {
            // Ignore if clicking on handles or cursor
            if (e.target === startHandle || e.target === endHandle || e.target === cursor) {
                return;
            }
            // Ignore if clicking inside handle elements
            if (startHandle.contains(e.target) || endHandle.contains(e.target) || cursor.contains(e.target)) {
                return;
            }

            e.stopPropagation();
            dragging = 'seek';
            wasPlaying = !video.paused;
            if (wasPlaying) {
                video.pause(); // Pause during seeking
            }
            track.setPointerCapture(e.pointerId);

            // Immediately seek to clicked position
            const time = getTimeFromMouse(e);
            video.currentTime = time;
        };

        // Handle pointer move
        const onPointerMove = (e) => {
            if (!dragging) return;

            const time = getTimeFromMouse(e);

            if (dragging === 'start') {
                this.proEditor.inPoint = Math.max(0, Math.min(time, this.proEditor.outPoint - 0.1));
                this.updateProTimeline();
                showTooltip(e, this.proEditor.inPoint);
            } else if (dragging === 'end') {
                this.proEditor.outPoint = Math.max(this.proEditor.inPoint + 0.1, Math.min(time, this.proEditor.duration));
                this.updateProTimeline();
                showTooltip(e, this.proEditor.outPoint);
            } else if (dragging === 'seek') {
                // Real-time preview during seeking
                video.currentTime = time;
                showTooltip(e, time);
                // Cursor position updates automatically via video.ontimeupdate
            }
        };

        // Handle pointer up
        const onPointerUp = () => {
            if (dragging === 'seek' && wasPlaying) {
                // Resume playback if was playing before seeking
                video.play().catch(() => {
                    // Ignore play errors (user gesture required)
                });
            }
            dragging = null;
            wasPlaying = false;
            hideTooltip();
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    }

    updateProTimeline() {
        if (!this.proEditor.duration) return;

        const inPercent = (this.proEditor.inPoint / this.proEditor.duration) * 100;
        const outPercent = (this.proEditor.outPoint / this.proEditor.duration) * 100;

        // Update excluded ranges
        document.getElementById('proExcludedStart').style.width = `${inPercent}%`;
        document.getElementById('proExcludedEnd').style.width = `${100 - outPercent}%`;

        // Update selected range
        const selected = document.getElementById('proTimelineSelected');
        selected.style.left = `${inPercent}%`;
        selected.style.width = `${outPercent - inPercent}%`;

        // Update handle positions
        document.getElementById('proHandleStart').style.left = `${inPercent}%`;
        document.getElementById('proHandleEnd').style.left = `${outPercent}%`;

        // Update time labels
        document.getElementById('proHandleStartTime').textContent = this.formatDuration(this.proEditor.inPoint);
        document.getElementById('proHandleEndTime').textContent = this.formatDuration(this.proEditor.outPoint);

        // Update selection duration info (real-time)
        const selectedDuration = this.proEditor.outPoint - this.proEditor.inPoint;
        const selectedPercent = Math.round((selectedDuration / this.proEditor.duration) * 100);
        document.getElementById('proSelectionDuration').textContent = this.formatDuration(selectedDuration);
        document.getElementById('proSelectionTotal').textContent = this.formatDuration(this.proEditor.duration);
        document.getElementById('proSelectionPercent').textContent = selectedPercent;
    }

    updateProEditorMetadata() {
        /**
         * Update video metadata display in editor header
         * Shows: duration, resolution, file size
         */
        const videoData = this.proEditor.videoData;
        const videoElement = this.proEditor.video;

        // Duration
        const duration = this.proEditor.duration;
        document.getElementById('proMetaDuration').textContent = `⏱️ ${this.formatDuration(duration)}`;

        // Resolution
        if (videoElement) {
            document.getElementById('proMetaResolution').textContent = `📺 ${videoElement.width}×${videoElement.height}`;
        }

        // File size
        if (videoData && videoData.size) {
            const sizeMB = (videoData.size / (1024 * 1024)).toFixed(1);
            const sizeGB = (videoData.size / (1024 * 1024 * 1024)).toFixed(2);
            const sizeText = videoData.size > 1024 * 1024 * 1024 ? `${sizeGB} GB` : `${sizeMB} MB`;
            document.getElementById('proMetaSize').textContent = `💾 ${sizeText}`;
        }
    }

    updateProTimelineCursor() {
        const video = document.getElementById('proEditorVideo');
        if (!video.duration) return;

        const percent = (video.currentTime / video.duration) * 100;
        document.getElementById('proTimelineCursor').style.left = `${percent}%`;
    }

    setupProEditorKeyboardShortcuts(navHelpers = {}) {
        const { stepFrame, stepSecond } = navHelpers;
        document.onkeydown = async (e) => {
            const editor = document.getElementById('proVideoEditor');
            if (editor.style.display !== 'flex') return;

            const video = document.getElementById('proEditorVideo');

            switch (e.key) {
                case ' ': // Space - Play/Pause
                    e.preventDefault();
                    if (video.paused) {
                        video.play();
                    } else {
                        video.pause();
                    }
                    break;

                case 'ArrowLeft': // Left - Navigate backwards
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Shift + Left: Jump 1 second back (fine-tuning)
                        if (stepSecond) stepSecond(false);
                        else video.currentTime = Math.max(0, video.currentTime - 1);
                    } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd + Left: Jump 5 seconds back
                        video.currentTime = Math.max(0, video.currentTime - 5);
                    } else {
                        // Left: Jump 10 seconds back (matches regular player)
                        video.currentTime = Math.max(0, video.currentTime - 10);
                    }
                    break;

                case 'ArrowRight': // Right - Navigate forwards
                    e.preventDefault();
                    if (e.shiftKey) {
                        // Shift + Right: Jump 1 second forward (fine-tuning)
                        if (stepSecond) stepSecond(true);
                        else video.currentTime = Math.min(this.proEditor.duration, video.currentTime + 1);
                    } else if (e.ctrlKey || e.metaKey) {
                        // Ctrl/Cmd + Right: Jump 5 seconds forward
                        video.currentTime = Math.min(this.proEditor.duration, video.currentTime + 5);
                    } else {
                        // Right: Jump 10 seconds forward (matches regular player)
                        video.currentTime = Math.min(this.proEditor.duration, video.currentTime + 10);
                    }
                    break;

                case 'ArrowUp': // Up - Jump 30 seconds forward (matches regular player)
                    e.preventDefault();
                    video.currentTime = Math.min(this.proEditor.duration, video.currentTime + 30);
                    break;

                case 'ArrowDown': // Down - Jump 30 seconds back (matches regular player)
                    e.preventDefault();
                    video.currentTime = Math.max(0, video.currentTime - 30);
                    break;

                case ',': // Comma - Previous frame
                case '<':
                    e.preventDefault();
                    stepFrame(false);
                    break;

                case '.': // Period - Next frame
                case '>':
                    e.preventDefault();
                    stepFrame(true);
                    break;

                case 'i':
                case 'I': // Set IN point
                    e.preventDefault();
                    this.proEditor.inPoint = video.currentTime;
                    this.updateProTimeline();
                    break;

                case 'o':
                case 'O': // Set OUT point
                    e.preventDefault();
                    this.proEditor.outPoint = video.currentTime;
                    this.updateProTimeline();
                    break;

                case 'c':
                case 'C': // Toggle between Cut and Cut & Crop modes
                    e.preventDefault();
                    if (this.proEditor.mode === 'cut') {
                        this.setProEditorMode('cut_crop');
                    } else {
                        this.setProEditorMode('cut');
                    }
                    break;

                case 'Enter': // Process video
                    this.processFromProEditor();
                    break;

                case 'Escape': // Close editor
                    await this.exitProEditor();
                    break;
            }
        };
    }

    setupProCropBox() {
        // Initialize crop box with video dimensions
        const video = document.getElementById('proEditorVideo');
        const videoObj = this.proEditor.video;

        if (videoObj && videoObj.width && videoObj.height) {
            const cropBox = document.getElementById('proCropBox');

            // Calculate crop dimensions based on current preset or default to 9:16
            let cropWidth, cropHeight;
            const preset = this.proEditor.cropPreset || '9:16';

            if (preset === '9:16') {
                // Vertical video - use 80% of video height to leave space for handles
                cropHeight = Math.floor(videoObj.height * 0.8);
                cropWidth = Math.floor(cropHeight * 9 / 16);
            } else if (preset === '1:1') {
                // Square - use 80% of smallest dimension
                const size = Math.floor(Math.min(videoObj.width, videoObj.height) * 0.8);
                cropWidth = size;
                cropHeight = size;
            } else if (preset === '16:9') {
                // Horizontal video - use 80% of video width
                cropWidth = Math.floor(videoObj.width * 0.8);
                cropHeight = Math.floor(cropWidth * 9 / 16);
            } else {
                // Custom - default to centered square
                const size = Math.floor(Math.min(videoObj.width, videoObj.height) * 0.8);
                cropWidth = size;
                cropHeight = size;
            }

            // Center the crop box both horizontally and vertically
            const cropX = Math.floor((videoObj.width - cropWidth) / 2);
            const cropY = Math.floor((videoObj.height - cropHeight) / 2);

            this.proEditor.cropWidth = cropWidth;
            this.proEditor.cropHeight = cropHeight;
            this.proEditor.cropX = cropX;
            this.proEditor.cropY = cropY;

            this.updateProCropBox(cropWidth, cropHeight, cropX, cropY);

            // Setup drag handlers (only once)
            if (!this.proEditor.cropDraggingSetup) {
                this.setupCropBoxDragging();
                this.proEditor.cropDraggingSetup = true;
            }
        }
    }

    setupCropBoxDragging() {
        const cropBox = document.getElementById('proCropBox');
        const videoElement = document.getElementById('proEditorVideo');
        const lockBtn = document.getElementById('proAspectLockBtn');

        let dragging = null; // 'move' | 'tl' | 'tr' | 'bl' | 'br'
        let dragStartX = 0;
        let dragStartY = 0;
        let initialCropX = 0;
        let initialCropY = 0;
        let initialCropWidth = 0;
        let initialCropHeight = 0;
        let lockedAspectRatio = null; // Aspect ratio when locked

        // Initialize aspect lock state (default: unlocked for better UX)
        if (!this.proEditor.hasOwnProperty('aspectLocked')) {
            this.proEditor.aspectLocked = false;
        }

        // Initialize button UI based on lock state
        if (this.proEditor.aspectLocked) {
            lockedAspectRatio = this.proEditor.cropWidth / this.proEditor.cropHeight;
            lockBtn.textContent = '🔒';
            lockBtn.classList.add('locked');
            lockBtn.title = 'Unlock aspect ratio';
        } else {
            lockBtn.textContent = '🔓';
            lockBtn.classList.remove('locked');
            lockBtn.title = 'Lock aspect ratio';
        }

        // Lock button click handler
        lockBtn.onclick = (e) => {
            e.stopPropagation();
            this.proEditor.aspectLocked = !this.proEditor.aspectLocked;

            if (this.proEditor.aspectLocked) {
                // Calculate and store current aspect ratio
                lockedAspectRatio = this.proEditor.cropWidth / this.proEditor.cropHeight;
                lockBtn.textContent = '🔒';
                lockBtn.classList.add('locked');
                lockBtn.title = 'Unlock aspect ratio';
            } else {
                lockedAspectRatio = null;
                lockBtn.textContent = '🔓';
                lockBtn.classList.remove('locked');
                lockBtn.title = 'Lock aspect ratio';
            }
        };

        // Helper: Convert display pixels to video pixels
        const displayToVideo = (displayDeltaX, displayDeltaY) => {
            const video = this.proEditor.video;
            const videoRect = videoElement.getBoundingClientRect();
            const videoAspect = video.width / video.height;
            const containerAspect = videoRect.width / videoRect.height;

            let videoDisplayWidth, videoDisplayHeight;
            if (containerAspect > videoAspect) {
                videoDisplayHeight = videoRect.height;
                videoDisplayWidth = videoRect.height * videoAspect;
            } else {
                videoDisplayWidth = videoRect.width;
                videoDisplayHeight = videoRect.width / videoAspect;
            }

            const scaleX = video.width / videoDisplayWidth;
            const scaleY = video.height / videoDisplayHeight;

            return {
                x: displayDeltaX * scaleX,
                y: displayDeltaY * scaleY
            };
        };

        // Drag crop box (move)
        cropBox.onpointerdown = (e) => {
            // Only start move if NOT clicking on a handle or the lock button
            const clickedElement = e.target;
            const isHandle = clickedElement.classList.contains('pro-crop-handle');
            const isLockBtn = clickedElement.id === 'proAspectLockBtn' || clickedElement.closest('#proAspectLockBtn');

            if (isHandle || isLockBtn) return; // Let handles and lock button have their own handlers

            e.stopPropagation();
            dragging = 'move';
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            initialCropX = this.proEditor.cropX;
            initialCropY = this.proEditor.cropY;
            initialCropWidth = this.proEditor.cropWidth;
            initialCropHeight = this.proEditor.cropHeight;
            cropBox.setPointerCapture(e.pointerId);
        };

        // Drag handles (resize) - 8 handles total
        const handles = {
            tl: cropBox.querySelector('.pro-handle-tl'),
            tr: cropBox.querySelector('.pro-handle-tr'),
            bl: cropBox.querySelector('.pro-handle-bl'),
            br: cropBox.querySelector('.pro-handle-br'),
            t: cropBox.querySelector('.pro-handle-t'),
            b: cropBox.querySelector('.pro-handle-b'),
            l: cropBox.querySelector('.pro-handle-l'),
            r: cropBox.querySelector('.pro-handle-r')
        };

        Object.entries(handles).forEach(([handleType, handle]) => {
            if (!handle) return;
            handle.onpointerdown = (e) => {
                e.stopPropagation();
                dragging = handleType;
                dragStartX = e.clientX;
                dragStartY = e.clientY;
                initialCropX = this.proEditor.cropX;
                initialCropY = this.proEditor.cropY;
                initialCropWidth = this.proEditor.cropWidth;
                initialCropHeight = this.proEditor.cropHeight;
                handle.setPointerCapture(e.pointerId);
            };
        });

        // Pointer move
        const onPointerMove = (e) => {
            if (!dragging) return;

            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            const videoDelta = displayToVideo(deltaX, deltaY);

            const video = this.proEditor.video;
            let newX = initialCropX;
            let newY = initialCropY;
            let newWidth = initialCropWidth;
            let newHeight = initialCropHeight;

            if (dragging === 'move') {
                // Move crop box - keep width and height unchanged
                newX = Math.max(0, Math.min(initialCropX + videoDelta.x, video.width - initialCropWidth));
                newY = Math.max(0, Math.min(initialCropY + videoDelta.y, video.height - initialCropHeight));
                // Width and height stay the same during move
                newWidth = initialCropWidth;
                newHeight = initialCropHeight;
            } else {
                // Resize from corner
                const MIN_SIZE = 200; // Prevent shrinking too small

                if (this.proEditor.aspectLocked && lockedAspectRatio) {
                    // Maintain aspect ratio during resize
                    switch (dragging) {
                        case 'br': // Bottom-right
                            newWidth = Math.max(MIN_SIZE, Math.min(initialCropWidth + videoDelta.x, video.width - initialCropX));
                            newHeight = Math.round(newWidth / lockedAspectRatio);
                            if (initialCropY + newHeight > video.height) {
                                newHeight = video.height - initialCropY;
                                newWidth = Math.round(newHeight * lockedAspectRatio);
                            }
                            break;
                        case 'bl': // Bottom-left
                            newWidth = Math.max(MIN_SIZE, initialCropWidth - videoDelta.x);
                            newHeight = Math.round(newWidth / lockedAspectRatio);
                            newX = initialCropX + initialCropWidth - newWidth;
                            if (initialCropY + newHeight > video.height) {
                                newHeight = video.height - initialCropY;
                                newWidth = Math.round(newHeight * lockedAspectRatio);
                                newX = initialCropX + initialCropWidth - newWidth;
                            }
                            break;
                        case 'tr': // Top-right
                            newWidth = Math.max(MIN_SIZE, Math.min(initialCropWidth + videoDelta.x, video.width - initialCropX));
                            newHeight = Math.round(newWidth / lockedAspectRatio);
                            newY = initialCropY + initialCropHeight - newHeight;
                            if (newY < 0) {
                                newY = 0;
                                newHeight = initialCropY + initialCropHeight;
                                newWidth = Math.round(newHeight * lockedAspectRatio);
                            }
                            break;
                        case 'tl': // Top-left
                            newWidth = Math.max(MIN_SIZE, initialCropWidth - videoDelta.x);
                            newHeight = Math.round(newWidth / lockedAspectRatio);
                            newX = initialCropX + initialCropWidth - newWidth;
                            newY = initialCropY + initialCropHeight - newHeight;
                            if (newX < 0) {
                                newX = 0;
                                newWidth = initialCropX + initialCropWidth;
                                newHeight = Math.round(newWidth / lockedAspectRatio);
                                newY = initialCropY + initialCropHeight - newHeight;
                            }
                            break;
                        // Middle handles maintain aspect ratio from center
                        case 't': // Top
                        case 'b': // Bottom
                        case 'l': // Left
                        case 'r': // Right
                            // Not supported with aspect lock - use corners
                            break;
                    }
                } else {
                    // Free-form resize (aspect ratio unlocked)
                    switch (dragging) {
                        // Corner handles
                        case 'tl': // Top-left
                            newWidth = Math.max(MIN_SIZE, initialCropWidth - videoDelta.x);
                            newHeight = Math.max(MIN_SIZE, initialCropHeight - videoDelta.y);
                            newX = initialCropX + initialCropWidth - newWidth;
                            newY = initialCropY + initialCropHeight - newHeight;
                            break;
                        case 'tr': // Top-right
                            newWidth = Math.max(MIN_SIZE, initialCropWidth + videoDelta.x);
                            newHeight = Math.max(MIN_SIZE, initialCropHeight - videoDelta.y);
                            newY = initialCropY + initialCropHeight - newHeight;
                            break;
                        case 'bl': // Bottom-left
                            newWidth = Math.max(MIN_SIZE, initialCropWidth - videoDelta.x);
                            newHeight = Math.max(MIN_SIZE, initialCropHeight + videoDelta.y);
                            newX = initialCropX + initialCropWidth - newWidth;
                            break;
                        case 'br': // Bottom-right
                            newWidth = Math.max(MIN_SIZE, initialCropWidth + videoDelta.x);
                            newHeight = Math.max(MIN_SIZE, initialCropHeight + videoDelta.y);
                            break;

                        // Middle handles (only for free-form)
                        case 't': // Top edge
                            newHeight = Math.max(MIN_SIZE, initialCropHeight - videoDelta.y);
                            newY = initialCropY + initialCropHeight - newHeight;
                            break;
                        case 'b': // Bottom edge
                            newHeight = Math.max(MIN_SIZE, initialCropHeight + videoDelta.y);
                            break;
                        case 'l': // Left edge
                            newWidth = Math.max(MIN_SIZE, initialCropWidth - videoDelta.x);
                            newX = initialCropX + initialCropWidth - newWidth;
                            break;
                        case 'r': // Right edge
                            newWidth = Math.max(MIN_SIZE, initialCropWidth + videoDelta.x);
                            break;
                    }
                }

                // Strict bounds checking - ensure crop stays within video
                // Constrain position
                newX = Math.max(0, Math.min(newX, video.width - MIN_SIZE));
                newY = Math.max(0, Math.min(newY, video.height - MIN_SIZE));

                // Constrain size based on position
                newWidth = Math.max(MIN_SIZE, Math.min(newWidth, video.width - newX));
                newHeight = Math.max(MIN_SIZE, Math.min(newHeight, video.height - newY));
            }

            // Update crop box
            this.proEditor.cropX = Math.round(newX);
            this.proEditor.cropY = Math.round(newY);
            this.proEditor.cropWidth = Math.round(newWidth);
            this.proEditor.cropHeight = Math.round(newHeight);

            this.updateProCropBox(
                this.proEditor.cropWidth,
                this.proEditor.cropHeight,
                this.proEditor.cropX,
                this.proEditor.cropY
            );
        };

        // Pointer up
        const onPointerUp = () => {
            dragging = null;
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    }

    applyProCropPreset() {
        const preset = this.proEditor.cropPreset;
        const video = this.proEditor.video;

        if (!video || !video.width || !video.height) return;

        // Get current crop dimensions (if any exist)
        const currentCropX = this.proEditor.cropX || 0;
        const currentCropY = this.proEditor.cropY || 0;
        const currentCropWidth = this.proEditor.cropWidth || video.width;
        const currentCropHeight = this.proEditor.cropHeight || video.height;

        let cropWidth, cropHeight;

        if (preset === 'custom') {
            // Custom - default to centered square or keep current
            if (this.proEditor.cropWidth && this.proEditor.cropHeight) {
                // Keep current dimensions
                return;
            }
            const size = Math.floor(Math.min(video.width, video.height) * 0.8);
            cropWidth = size;
            cropHeight = size;
        } else {
            // Parse aspect ratio from preset string (e.g., "9:16" -> 9/16)
            const [widthRatio, heightRatio] = preset.split(':').map(Number);
            const aspectRatio = widthRatio / heightRatio;

            // Determine if this is a portrait (tall) or landscape (wide) aspect ratio
            const isPortrait = aspectRatio < 1;
            const isSquare = aspectRatio === 1;

            if (isSquare) {
                // Square - use 80% of smallest dimension
                const size = Math.floor(Math.min(video.width, video.height) * 0.8);
                cropWidth = size;
                cropHeight = size;
            } else if (isPortrait) {
                // Portrait orientation - fit to height
                cropHeight = Math.floor(video.height * 0.9);
                cropWidth = Math.floor(cropHeight * aspectRatio);

                // If width exceeds video width, fit to width instead
                if (cropWidth > video.width) {
                    cropWidth = Math.floor(video.width * 0.9);
                    cropHeight = Math.floor(cropWidth / aspectRatio);
                }
            } else {
                // Landscape orientation - fit to width
                cropWidth = Math.floor(video.width * 0.9);
                cropHeight = Math.floor(cropWidth / aspectRatio);

                // If height exceeds video height, fit to height instead
                if (cropHeight > video.height) {
                    cropHeight = Math.floor(video.height * 0.9);
                    cropWidth = Math.floor(cropHeight * aspectRatio);
                }
            }
        }

        // Center the crop box
        let cropX = Math.floor((video.width - cropWidth) / 2);
        let cropY = Math.floor((video.height - cropHeight) / 2);

        // If we had a previous crop, try to keep it centered around the same area
        if (this.proEditor.cropWidth && this.proEditor.cropHeight) {
            const prevCenterX = currentCropX + currentCropWidth / 2;
            const prevCenterY = currentCropY + currentCropHeight / 2;

            cropX = Math.max(0, Math.min(prevCenterX - cropWidth / 2, video.width - cropWidth));
            cropY = Math.max(0, Math.min(prevCenterY - cropHeight / 2, video.height - cropHeight));
        }

        this.proEditor.cropWidth = cropWidth;
        this.proEditor.cropHeight = cropHeight;
        this.proEditor.cropX = cropX;
        this.proEditor.cropY = cropY;

        // Update the aspect lock to match the new preset
        if (preset !== 'custom') {
            this.proEditor.aspectLocked = false; // Start unlocked for better UX
        }

        this.updateProCropBox(cropWidth, cropHeight, cropX, cropY);
    }

    updateProCropBox(width, height, x, y) {
        const cropBox = document.getElementById('proCropBox');
        const videoElement = document.getElementById('proEditorVideo');
        const video = this.proEditor.video;

        if (!video || !video.width || !video.height) return;

        // Calculate scale between video pixels and display pixels
        const videoRect = videoElement.getBoundingClientRect();
        const videoAspect = video.width / video.height;
        const containerAspect = videoRect.width / videoRect.height;

        let videoDisplayWidth, videoDisplayHeight, offsetX = 0, offsetY = 0;

        if (containerAspect > videoAspect) {
            // Video has black bars on sides (pillarbox)
            videoDisplayHeight = videoRect.height;
            videoDisplayWidth = videoRect.height * videoAspect;
            offsetX = (videoRect.width - videoDisplayWidth) / 2;
        } else {
            // Video has black bars on top/bottom (letterbox)
            videoDisplayWidth = videoRect.width;
            videoDisplayHeight = videoRect.width / videoAspect;
            offsetY = (videoRect.height - videoDisplayHeight) / 2;
        }

        const scaleX = videoDisplayWidth / video.width;
        const scaleY = videoDisplayHeight / video.height;

        // Convert video pixels to display pixels
        const displayWidth = width * scaleX;
        const displayHeight = height * scaleY;
        const displayX = (x * scaleX) + offsetX;
        const displayY = (y * scaleY) + offsetY;

        cropBox.style.width = `${displayWidth}px`;
        cropBox.style.height = `${displayHeight}px`;
        cropBox.style.left = `${displayX}px`;
        cropBox.style.top = `${displayY}px`;

        // Update mask overlays (dark areas outside crop box)
        const cropOverlay = document.getElementById('proCropOverlay');
        const overlayRect = cropOverlay.getBoundingClientRect();

        const masks = {
            top: cropOverlay.querySelector('.pro-mask-top'),
            right: cropOverlay.querySelector('.pro-mask-right'),
            bottom: cropOverlay.querySelector('.pro-mask-bottom'),
            left: cropOverlay.querySelector('.pro-mask-left')
        };

        // Top mask - from top of overlay to top of crop box
        if (masks.top) {
            masks.top.style.left = '0';
            masks.top.style.top = '0';
            masks.top.style.width = '100%';
            masks.top.style.height = `${displayY}px`;
        }

        // Bottom mask - from bottom of crop box to bottom of overlay
        if (masks.bottom) {
            masks.bottom.style.left = '0';
            masks.bottom.style.top = `${displayY + displayHeight}px`;
            masks.bottom.style.width = '100%';
            masks.bottom.style.bottom = '0';
            masks.bottom.style.height = 'auto';
        }

        // Left mask - from left edge to left of crop box (only crop box height)
        if (masks.left) {
            masks.left.style.left = '0';
            masks.left.style.top = `${displayY}px`;
            masks.left.style.width = `${displayX}px`;
            masks.left.style.height = `${displayHeight}px`;
        }

        // Right mask - from right of crop box to right edge (only crop box height)
        if (masks.right) {
            masks.right.style.left = `${displayX + displayWidth}px`;
            masks.right.style.top = `${displayY}px`;
            masks.right.style.right = '0';
            masks.right.style.width = 'auto';
            masks.right.style.height = `${displayHeight}px`;
        }

        // Update dimensions display with aspect ratio
        const aspectRatio = this.calculateAspectRatio(width, height);
        document.getElementById('proCropDimensions').textContent = `${width}×${height} (${aspectRatio})`;
    }

    calculateAspectRatio(width, height) {
        // Calculate GCD for simplifying ratio
        const gcd = (a, b) => b === 0 ? a : gcd(b, a % b);
        const divisor = gcd(width, height);
        const ratioW = width / divisor;
        const ratioH = height / divisor;

        // Check for common aspect ratios
        const ratio = width / height;

        // Common ratios with tolerance
        if (Math.abs(ratio - 9 / 16) < 0.01) return '9:16';
        if (Math.abs(ratio - 16 / 9) < 0.01) return '16:9';
        if (Math.abs(ratio - 1) < 0.01) return '1:1';
        if (Math.abs(ratio - 4 / 3) < 0.01) return '4:3';
        if (Math.abs(ratio - 3 / 4) < 0.01) return '3:4';
        if (Math.abs(ratio - 21 / 9) < 0.01) return '21:9';
        if (Math.abs(ratio - 2 / 1) < 0.01) return '2:1';

        // If simplified ratio is reasonable, show it
        if (ratioW <= 100 && ratioH <= 100) {
            return `${ratioW}:${ratioH}`;
        }

        // Otherwise show decimal
        return ratio.toFixed(2);
    }

    async processFromProEditor() {
        if (!this.currentEditVideoId) {
            return;
        }

        const startTime = this.formatDuration(this.proEditor.inPoint);
        const endTime = this.formatDuration(this.proEditor.outPoint);
        const mode = this.proEditor.mode || 'cut';
        const cropEnabled = (mode === 'cut_crop');
        const cropPreset = this.proEditor.cropPreset;

        // Validate
        if (this.proEditor.inPoint >= this.proEditor.outPoint) {
            return;
        }

        if (cropEnabled && !cropPreset) {
            return;
        }

        // Show confirmation dialog
        const selectedDuration = this.proEditor.outPoint - this.proEditor.inPoint;
        const durationText = this.formatDuration(selectedDuration);
        const operationType = cropEnabled ? 'Cut & Crop' : 'Cut';
        const videoName = (this.proEditor.videoData?.name || 'video')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        const confirmMessage = `
            <div style="text-align: left;">
                <!-- Compact 2-Column Info Grid -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <div>
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">🎬 VIDEO</div>
                        <div style="font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${videoName}">${videoName}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">✂️ OPERATION</div>
                        <div style="font-size: 13px; font-weight: 600; color: #111827;">${operationType}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">⏱️ DURATION</div>
                        <div style="font-size: 13px; font-weight: 600; color: #111827;">${durationText}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">📍 RANGE</div>
                        <div style="font-size: 13px; font-weight: 600; color: #111827;">${startTime} → ${endTime}</div>
                    </div>
                    ${cropEnabled ? `
                    <div style="grid-column: 1 / -1;">
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">🎨 CROP</div>
                        <div style="font-size: 13px; font-weight: 600; color: #111827;">${cropPreset !== 'custom' ? cropPreset : 'Custom'} (${this.proEditor.cropWidth}×${this.proEditor.cropHeight})</div>
                    </div>
                    ` : ''}
                </div>

                <!-- Settings Section -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
                    <!-- Quality Selector -->
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 12px;">
                            💎 Quality
                        </label>
                        <select id="qualitySelect" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; background: white; cursor: pointer;">
                            <option value="fast">⚡ Fast</option>
                            <option value="balanced" selected>⚖️ Balanced</option>
                            <option value="high">💎 High</option>
                        </select>
                    </div>

                    <!-- Cut Method Slider -->
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 12px;">
                            ✂️ Cut Method
                        </label>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span style="font-size: 11px; color: #6b7280; width: 50px; text-align: center;">⚡ Fast</span>
                            <input 
                                id="cutMethodSlider" 
                                type="range" 
                                min="0" 
                                max="2" 
                                value="1" 
                                step="1" 
                                style="flex: 1; cursor: pointer; height: 6px; -webkit-appearance: none; appearance: none; background: linear-gradient(to right, #3b82f6, #ef4444, #f97316); border-radius: 3px; outline: none;"
                            >
                            <span style="font-size: 11px; color: #6b7280; width: 60px; text-align: center;">🎯 Precise</span>
                        </div>
                        <div style="margin-top: 6px; padding: 8px; background: #f3f4f6; border-radius: 4px; text-align: center;">
                            <span id="cutMethodLabel" style="font-size: 13px; font-weight: 600; color: #ef4444;">Smartcut (Balanced)</span>
                        </div>
                    </div>

                    <!-- Output Location Selector -->
                    <div>
                        <label style="display: block; margin-bottom: 6px; font-weight: 600; color: #374151; font-size: 12px;">
                            📁 Location
                        </label>
                        <select id="outputLocationSelect" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 13px; background: white; cursor: pointer;">
                            <option value="same_folder" selected>📂 Same Folder (Original Location)</option>
                            <option value="edited_folder">✂️ Edited Folder</option>
                        </select>
                    </div>
                </div>

                <!-- Metadata Options -->
                <div style="display: flex; gap: 12px; margin-bottom: 16px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px;">
                        <input id="copyMetadataCheckbox" type="checkbox" checked style="cursor: pointer; width: 18px; height: 18px;">
                        <span style="font-size: 13px; font-weight: 500; color: #374151;">📝 Copy Tags & Metadata</span>
                    </label>
                </div>

                <p style="margin: 0; padding: 10px; background: #fef3c7; border: 1px solid #fbbf24; border-radius: 4px; color: #92400e; font-size: 12px; text-align: center;">
                    ⚠️ Ready to process?
                </p>
            </div>
        `;

        const confirmed = await this.showConfirmModal(
            '🚀 Process Video?',
            confirmMessage,
            '✓ Start Processing',
            'primary'
        );

        if (!confirmed) {
            return; // User cancelled
        }

        // Get settings from modal
        const locationSelect = document.getElementById('outputLocationSelect');
        const outputLocation = locationSelect?.value || 'same_folder';
        const copyMetadata = document.getElementById('copyMetadataCheckbox')?.checked || false;
        const quality = document.getElementById('qualitySelect')?.value || 'balanced';

        // Map slider value to cut method: 0=smartcut, 1=ffmpeg, 2=copy
        const sliderValue = document.getElementById('cutMethodSlider')?.value || '1';
        const cutMethodMap = { '0': 'copy', '1': 'smartcut', '2': 'ffmpeg' };
        const cutMethod = cutMethodMap[sliderValue] || 'smartcut';

        // Determine operation based on mode
        const operation = cropEnabled ? 'cut_and_crop' : 'cut';

        try {
            let cropWidth = null, cropHeight = null, cropX = null, cropY = null;

            if (cropEnabled) {
                // Use current crop dimensions from proEditor state (updated during dragging)
                cropWidth = this.proEditor.cropWidth;
                cropHeight = this.proEditor.cropHeight;
                cropX = this.proEditor.cropX;
                cropY = this.proEditor.cropY;
            }

            const requestBody = {
                video_id: this.currentEditVideoId,
                operation: operation,
                start_time: startTime,
                end_time: endTime,
                cut_method: cutMethod,  // Use selected cut method (ffmpeg or smartcut)
                crop_preset: cropEnabled && cropPreset !== 'custom' ? cropPreset : null,
                crop_width: cropWidth,
                crop_height: cropHeight,
                crop_x: cropEnabled ? this.proEditor.cropX : null,
                crop_y: cropEnabled ? this.proEditor.cropY : null,
                preserve_faces: true,
                copy_other_items: copyMetadata,
                output_filename: null,
                output_location: outputLocation
            };

            console.log('📤 Sending process request:', requestBody);

            const response = await fetch(`${this.apiBase}/api/editor/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (response.ok) {
                this.currentEditJobId = data.job_id;
                this.monitorProEditorJob(data.job_id);
            }

        } catch (error) {
            console.error('Error processing video:', error);
        }
    }

    async monitorProEditorJob(jobId) {
        // Always show modal for consistent experience on desktop and mobile
        const modal = document.getElementById('videoProcessingModal');

        // Show modal
        modal.style.display = 'flex';
        const modalTitle = document.getElementById('processingModalTitle');
        const videoName = document.getElementById('processingVideoName');
        const progressText = document.getElementById('processingProgress');
        const progressBar = document.getElementById('processingProgressBar');
        const statusText = document.getElementById('processingStatus');
        const actionsDiv = document.getElementById('processingActions');

        // Get current video name
        const video = this.proEditor.video;
        videoName.textContent = video ? (video.display_name || video.name) : 'Unknown Video';

        // Reset modal state
        modalTitle.textContent = 'Processing Video...';
        progressText.textContent = '0%';
        progressBar.style.width = '0%';
        statusText.textContent = 'Starting video processing...';
        actionsDiv.style.display = 'none';

        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.apiBase}/api/editor/jobs/${jobId}`);
                const job = await response.json();

                // Update modal
                const modalTitle = document.getElementById('processingModalTitle');
                const progressText = document.getElementById('processingProgress');
                const progressBar = document.getElementById('processingProgressBar');
                const statusText = document.getElementById('processingStatus');
                const actionsDiv = document.getElementById('processingActions');

                progressText.textContent = `${job.progress}%`;
                progressBar.style.width = `${job.progress}%`;
                statusText.textContent = `Processing: ${job.output_filename}`;

                if (job.status === 'completed') {
                    clearInterval(pollInterval);

                    // Hide spinner
                    const spinner = document.querySelector('.processing-spinner');
                    if (spinner) spinner.style.display = 'none';

                    // Update to success state
                    modalTitle.innerHTML = '<span style="color: #10b981;">✓ Processing Complete!</span>';
                    progressText.textContent = '100%';
                    progressBar.style.width = '100%';
                    statusText.textContent = `Successfully created: ${job.output_filename}`;

                    // Store metadata copy preference for later (after scan)
                    const copyMetadata = document.getElementById('copyMetadataCheckbox')?.checked || false;
                    statusText.textContent = `Importing into library...`;

                    // Auto-scan and link (this scans the video into the database first)
                    await this.autoScanAndRefreshAfterEdit(job);

                    // Copy metadata AFTER scan completes (so video is in database)
                    if (copyMetadata) {
                        statusText.textContent = `Copying tags and faces...`;
                        try {
                            const copyResponse = await fetch(`${this.apiBase}/api/editor/jobs/${jobId}/copy-metadata`, {
                                method: 'POST'
                            });
                            const copyResult = await copyResponse.json();
                            if (copyResponse.ok) {
                                // Check if metadata was actually copied or skipped
                                if (copyResult.skipped) {
                                    console.log('ℹ️ Source video has no metadata to copy');
                                } else if (copyResult.tags_copied > 0 || copyResult.faces_copied > 0) {
                                    console.log('✅ Metadata copied:', copyResult.message);
                                    // Refresh the current folder view to show copied faces immediately
                                    if (this.currentCategory) {
                                        await this.smartRefreshFolder(this.currentCategory);
                                    }
                                } else {
                                    console.log('ℹ️ No new metadata to copy (already exists)');
                                }
                            } else {
                                console.warn('⚠️ Failed to copy metadata:', copyResult.detail);
                            }
                        } catch (error) {
                            console.error('Error copying metadata:', error);
                        }
                    }

                    // Show action buttons
                    actionsDiv.style.display = 'flex';
                    this.setupModalActions(job);

                } else if (job.status === 'failed') {
                    clearInterval(pollInterval);

                    // Hide spinner
                    const spinner = document.querySelector('.processing-spinner');
                    if (spinner) spinner.style.display = 'none';

                    // Update to error state
                    modalTitle.innerHTML = '<span style="color: #ef4444;">✗ Processing Failed</span>';
                    statusText.innerHTML = `<span style="color: #ef4444;">${job.error_message || 'Unknown error'}</span>`;

                    // Show dismiss button only
                    actionsDiv.style.display = 'flex';
                    actionsDiv.innerHTML = '<button id="processingDismiss" class="thumbnail-modal-btn primary" style="width: 100%;">Close</button>';
                    document.getElementById('processingDismiss').onclick = () => {
                        modal.style.display = 'none';
                    };
                }

            } catch (error) {
                console.error('Error monitoring job:', error);
                clearInterval(pollInterval);
            }
        }, 2000);
    }

    setupNotificationActions(job) {
        const actionsDiv = document.querySelector('.notification-actions');
        const deleteBtn = actionsDiv.querySelector('.btn-delete-source');
        const openFolderBtn = actionsDiv.querySelector('.btn-open-folder');
        const dismissBtn = actionsDiv.querySelector('.btn-dismiss');

        // Delete source video button
        deleteBtn.onclick = async () => {
            if (confirm('⚠️ Delete the original source video? This cannot be undone!')) {
                try {
                    const response = await fetch(`${this.apiBase}/videos/${job.video_id}`, {
                        method: 'DELETE'
                    });

                    if (response.ok) {
                        deleteBtn.disabled = true;
                        deleteBtn.textContent = '✓ Deleted';
                        deleteBtn.style.background = '#6b7280';

                        // Refresh current view
                        await this.loadVideos();
                    } else {
                        throw new Error('Failed to delete video');
                    }
                } catch (error) {
                    console.error('Error deleting source video:', error);
                }
            }
        };

        // Open folder button
        openFolderBtn.onclick = async () => {
            // Extract folder name from output path
            const pathParts = job.output_path.split('/');
            const folderName = pathParts[pathParts.length - 2];

            // Navigate to folder
            await this.loadCategory(folderName);
        };

        // Dismiss button
        dismissBtn.onclick = () => {
            document.getElementById('proEditorNotifications').style.display = 'none';
        };
    }

    setupNotificationActionsCompact(job) {
        const actionsDiv = document.querySelector('.notification-actions-compact');
        const deleteBtn = actionsDiv.querySelector('.btn-delete-source');
        const openFolderBtn = actionsDiv.querySelector('.btn-open-folder');
        const dismissBtn = actionsDiv.querySelector('.btn-dismiss');

        // Delete source video button
        deleteBtn.onclick = async () => {
            if (confirm('⚠️ Delete the original source video? This cannot be undone!')) {
                try {
                    const response = await fetch(`${this.apiBase}/videos/${job.video_id}`, {
                        method: 'DELETE'
                    });

                    if (response.ok) {
                        deleteBtn.disabled = true;
                        deleteBtn.style.opacity = '0.5';
                        deleteBtn.style.cursor = 'not-allowed';

                        // Refresh current view
                        await this.loadVideos();
                    } else {
                        throw new Error('Failed to delete video');
                    }
                } catch (error) {
                    console.error('Error deleting source video:', error);
                }
            }
        };

        // Open folder button
        openFolderBtn.onclick = async () => {
            // Extract folder name from output path
            const pathParts = job.output_path.split('/');
            const folderName = pathParts[pathParts.length - 2];

            // Navigate to folder and close editor
            await this.exitProEditor();
            await this.loadCategory(folderName);
        };

        // Dismiss button
        dismissBtn.onclick = () => {
            document.getElementById('proEditorNotifications').style.display = 'none';
        };
    }

    setupModalActions(job) {
        const deleteBtn = document.getElementById('processingDeleteSource');
        const openFolderBtn = document.getElementById('processingOpenFolder');
        const dismissBtn = document.getElementById('processingDismiss');
        const modal = document.getElementById('videoProcessingModal');

        // Delete source video button
        deleteBtn.onclick = async () => {
            if (confirm('⚠️ Delete the original source video? This cannot be undone!')) {
                try {
                    const response = await fetch(`${this.apiBase}/videos/${job.video_id}/delete-permanent`, {
                        method: 'POST'
                    });

                    if (response.ok) {
                        deleteBtn.disabled = true;
                        deleteBtn.style.opacity = '0.5';
                        deleteBtn.style.cursor = 'not-allowed';
                        deleteBtn.textContent = '✓ Deleted';

                        // Refresh current view
                        await this.loadVideos();
                    } else {
                        throw new Error('Failed to delete video');
                    }
                } catch (error) {
                    console.error('Error deleting source video:', error);
                }
            }
        };

        // Open folder button
        openFolderBtn.onclick = async () => {
            // Extract folder name from output path
            const pathParts = job.output_path.split('/');
            const folderName = pathParts[pathParts.length - 2];

            // Navigate to folder and close modal - use SAME behavior as Back button
            modal.style.display = 'none';
            await this.exitProEditor();

            // Switch to explorer view and load the folder with videos (same as Back button)
            this.switchView('explorer');
            this.currentCategory = folderName;
            this.currentSubcategory = null;
            this.renderBreadcrumb();
            // Force fresh fetch from API (skip cache) to ensure edited video shows up
            await this.loadAndShowVideosInFolder(folderName, null, true);
        };

        // Dismiss button
        dismissBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }

    toggleKeyboardShortcuts() { this.keyboardModule.toggleKeyboardShortcuts() }

    async exitProEditor() {
        console.log('🚪 Exiting Pro Video Editor');

        const editor = document.getElementById('proVideoEditor');
        if (editor) editor.style.display = 'none';

        // Pause and clear video
        const video = document.getElementById('proEditorVideo');
        if (video) {
            video.pause();
            video.src = '';
        }

        // Reset shortcuts panel
        const panel = document.getElementById('proShortcutsPanel');
        const toggleBtn = document.getElementById('toggleShortcutsBtn');
        if (panel) {
            panel.classList.remove('expanded');
            panel.style.display = 'none';
        }
        if (toggleBtn) {
            toggleBtn.classList.remove('active');
        }

        // Clear editor state
        this.proEditor = null;

        // Restore main content
        const mainContent = document.getElementById('mainContent');
        if (mainContent) {
            mainContent.style.display = 'block';
        }

        // Restore previous view state and refresh data
        // Load the folder with fresh videos (including the edited one)
        if (this.previousViewState) {
            const state = this.previousViewState;
            if (state.view === 'explorer') {
                this.switchView('explorer');
                this.currentCategory = state.category;
                this.currentSubcategory = state.subcategory;
                this.breadcrumb = state.breadcrumb;
                this.renderBreadcrumb();
                // Load the folder with all videos - skip cache to ensure edited file appears
                await this.loadAndShowVideosInFolder(state.category, state.subcategory, true);
            } else {
                // Return to Collection/List view
                this.switchView('list');
                console.log('📂 Returning to collection view...');
                await this.loadCategory(state.category);
            }
            this.previousViewState = null;
        }

        // Clear editing state
        this.currentEditVideoId = null;
        this.currentEditVideoName = null;
    }


    // LEGACY EDITOR REMOVED - Use Pro Editor only

    openVideoEditorView(videoId, videoName) {
        console.log('🎬 Opening video editor view for:', videoName);

        // Close any open context menu
        this.hideVideoContextMenu();

        // Store video info
        this.currentEditVideoId = videoId;
        this.currentEditVideoName = videoName;

        // Find the video object to get proper URL
        const video = this.videos.find(v => v.id === videoId) ||
            this.allVideos.find(v => v.id === videoId);

        if (!video) {
            console.error('❌ Video not found for ID:', videoId);
            console.log('Error: Video not found')
            return;
        }

        // Save current view state for restoration
        this.previousViewState = {
            view: this.currentView,
            category: this.currentCategory,
            subcategory: this.currentSubcategory,
            breadcrumb: [...this.breadcrumb]
        };

        // Show editor view
        const editorView = document.getElementById('videoEditorView');
        editorView.style.display = 'flex';

        // Update header with video name
        document.getElementById('videoEditorVideoName').textContent = videoName;

        // Load video into preview player
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const videoPath = this.getVideoStreamingPath(video);
        const videoUrl = `${this.apiBase}/stream/${video.category}/${videoPath}`;

        console.log('📹 Loading video URL:', videoUrl);

        previewPlayer.src = videoUrl;
        previewPlayer.load();

        // Set up timeline updates
        this.setupEditorViewListeners();

        // Reset to cut tab by default
        this.switchEditorViewTab('cut');

        // Check if main player is playing and capture time
        const mainPlayer = document.getElementById('videoPlayer');
        if (mainPlayer && mainPlayer.src && !mainPlayer.paused) {
            this.capturedPlaybackTime = mainPlayer.currentTime;
            previewPlayer.currentTime = mainPlayer.currentTime || 0;
            this.showCurrentViewTimeIndicator(this.capturedPlaybackTime);
        } else {
            this.capturedPlaybackTime = null;
            document.getElementById('currentViewTimeIndicator').style.display = 'none';
        }

        // Hide other views
        this.hideDuplicatesReviewIfActive();
        const mainContentHide = document.getElementById('mainContent');
        if (mainContentHide) {
            mainContentHide.style.display = 'none';
        }
    }

    exitVideoEditorView() {
        console.log('🚪 Exiting video editor view');

        // Hide editor view
        const editorView = document.getElementById('videoEditorView');
        editorView.style.display = 'none';

        // Pause and clear video
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        previewPlayer.pause();
        previewPlayer.src = '';

        // Restore main content
        const mainContentRestore = document.getElementById('mainContent');
        if (mainContentRestore) {
            mainContentRestore.style.display = 'block';
        }

        // Restore previous view state if available and refresh data
        if (this.previousViewState) {
            const state = this.previousViewState;
            if (state.view === 'explorer') {
                this.switchView('explorer');
                this.currentCategory = state.category;
                this.currentSubcategory = state.subcategory;
                this.breadcrumb = state.breadcrumb;
                this.renderFolderExplorer();
                this.renderBreadcrumb();
            } else {
                // Return to Collection/List view and refresh videos
                this.switchView('list');
                // Force reload to get any new/edited videos (bypass cache)
                console.log('🔄 Refreshing videos after editor exit...');
                this.loadAllVideosFlat(true).then(() => {
                    console.log('✅ Videos refreshed successfully');
                }).catch(err => {
                    console.error('❌ Error refreshing videos:', err);
                });
            }
            this.previousViewState = null;
        }

        // Clear editing state
        this.currentEditVideoId = null;
        this.currentEditVideoName = null;
    }

    setupEditorViewListeners() {
        const previewPlayer = document.getElementById('editorViewPreviewVideo');

        // Remove old listeners if any
        previewPlayer.removeEventListener('timeupdate', this.updateEditorViewTimeline);
        previewPlayer.removeEventListener('loadedmetadata', this.onEditorViewMetadataLoaded);

        // Add new listeners
        this.updateEditorViewTimeline = () => this._updateEditorViewTimeline();
        this.onEditorViewMetadataLoaded = () => this._onEditorViewMetadataLoaded();

        previewPlayer.addEventListener('timeupdate', this.updateEditorViewTimeline);
        previewPlayer.addEventListener('loadedmetadata', this.onEditorViewMetadataLoaded);
    }

    _updateEditorViewTimeline() {
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const currentTimeSpan = document.getElementById('editorViewCurrentTime');
        const timelineProgress = document.getElementById('editorViewTimelineProgress');
        const timelineMarker = document.getElementById('editorViewTimelineMarker');

        if (!previewPlayer || !previewPlayer.duration) return;

        // Update current time display
        const currentTime = previewPlayer.currentTime;
        currentTimeSpan.textContent = this.formatDuration(currentTime);

        // Update progress bar
        const progress = (currentTime / previewPlayer.duration) * 100;
        timelineProgress.style.width = `${progress}%`;
        timelineMarker.style.left = `${progress}%`;

        // Update range overlay
        this.updateEditorViewTimelineRange();
    }

    _onEditorViewMetadataLoaded() {
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const durationSpan = document.getElementById('editorViewDuration');

        if (previewPlayer && previewPlayer.duration) {
            durationSpan.textContent = this.formatDuration(previewPlayer.duration);

            // Set default end time to video duration
            const endTimeInput = document.getElementById('editViewEndTime');
            if (endTimeInput && endTimeInput.value === '00:10:00') {
                endTimeInput.value = this.formatDuration(previewPlayer.duration);
            }
        }

        // Update range overlay
        this.updateEditorViewTimelineRange();
    }

    updateEditorViewTimelineRange() {
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const startTimeInput = document.getElementById('editViewStartTime');
        const endTimeInput = document.getElementById('editViewEndTime');
        const timelineRange = document.getElementById('editorViewTimelineRange');

        if (!previewPlayer || !previewPlayer.duration || !timelineRange) return;

        const startTime = this.parseTimeToSeconds(startTimeInput.value) || 0;
        const endTime = this.parseTimeToSeconds(endTimeInput.value) || previewPlayer.duration;
        const duration = previewPlayer.duration;

        const startPercent = (startTime / duration) * 100;
        const widthPercent = ((endTime - startTime) / duration) * 100;

        timelineRange.style.left = `${startPercent}%`;
        timelineRange.style.width = `${widthPercent}%`;
    }

    seekEditorViewFromClick(event) {
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const timeline = event.currentTarget;

        if (!previewPlayer || !previewPlayer.duration) return;

        const rect = timeline.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percent = clickX / rect.width;
        const newTime = percent * previewPlayer.duration;

        previewPlayer.currentTime = newTime;
    }

    setStartFromEditorView() {
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const startTimeInput = document.getElementById('editViewStartTime');

        if (previewPlayer && previewPlayer.currentTime !== undefined) {
            startTimeInput.value = this.formatDuration(previewPlayer.currentTime);
            this.updateEditorViewTimelineRange();
            console.log('✅ Start time set')
        }
    }

    setEndFromEditorView() {
        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const endTimeInput = document.getElementById('editViewEndTime');

        if (previewPlayer && previewPlayer.currentTime !== undefined) {
            endTimeInput.value = this.formatDuration(previewPlayer.currentTime);
            this.updateEditorViewTimelineRange();
            console.log('✅ End time set')
        }
    }

    switchEditorViewTab(tab) {
        // Update tab buttons
        document.querySelectorAll('#videoEditorView .editor-tab-btn').forEach(btn => btn.classList.remove('active'));

        // Show/hide sections
        const cutSection = document.getElementById('cutViewSection');
        const cropSection = document.getElementById('cropViewSection');

        if (tab === 'cut') {
            document.getElementById('cutViewTabBtn').classList.add('active');
            cutSection.style.display = 'block';
            cropSection.style.display = 'none';
        } else if (tab === 'crop') {
            document.getElementById('cropViewTabBtn').classList.add('active');
            cutSection.style.display = 'none';
            cropSection.style.display = 'block';
        } else if (tab === 'both') {
            document.getElementById('bothViewTabBtn').classList.add('active');
            cutSection.style.display = 'block';
            cropSection.style.display = 'block';
        }
    }

    onCropViewPresetChange() {
        const cropPreset = document.getElementById('cropViewPreset').value;
        const customControls = document.getElementById('customCropViewControls');

        if (cropPreset && cropPreset !== 'custom') {
            customControls.style.display = 'block';
            // Show crop overlay for visual positioning (fixed aspect ratio)
            this.showCropOverlay(cropPreset);
        } else if (cropPreset === 'custom') {
            customControls.style.display = 'block';
            // Show crop overlay for custom crop (resizable)
            this.showCustomCropOverlay();
        } else {
            customControls.style.display = 'none';
            // Hide crop overlay
            this.hideCropOverlay();
        }
    }

    showCropOverlay(preset) {
        console.log('🎨 Showing crop overlay for preset:', preset);

        const video = this.videos.find(v => v.id === this.currentEditVideoId) ||
            this.allVideos.find(v => v.id === this.currentEditVideoId);

        if (!video) {
            console.error('❌ Video not found for crop overlay');
            return;
        }

        console.log('📹 Video dimensions:', { width: video.width, height: video.height });

        if (!video.width || !video.height) {
            console.log('⚠️ Loading video metadata...')
            console.log('⚠️ Video metadata not loaded, trying to get from video element');

            // Try to get dimensions from video element directly
            const previewPlayer = document.getElementById('editorViewPreviewVideo');
            if (previewPlayer && previewPlayer.videoWidth && previewPlayer.videoHeight) {
                // Use video element dimensions
                video.width = previewPlayer.videoWidth;
                video.height = previewPlayer.videoHeight;
                console.log('✅ Got dimensions from video element:', { width: video.width, height: video.height });
            } else {
                // Wait for video metadata to load
                if (previewPlayer) {
                    previewPlayer.addEventListener('loadedmetadata', () => {
                        console.log('✅ Video metadata loaded, retrying crop overlay');
                        video.width = previewPlayer.videoWidth;
                        video.height = previewPlayer.videoHeight;
                        this.showCropOverlay(preset);
                    }, { once: true });
                }
                return;
            }
        }

        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const cropOverlay = document.getElementById('cropOverlay');
        const cropBox = document.getElementById('cropBox');

        if (!previewPlayer || !cropOverlay || !cropBox) {
            console.error('❌ Required elements not found:', { previewPlayer: !!previewPlayer, cropOverlay: !!cropOverlay, cropBox: !!cropBox });
            return;
        }

        // Calculate crop dimensions based on preset
        let targetWidth, targetHeight;
        if (preset === '9:16') {
            targetWidth = Math.floor(video.height * 9 / 16);
            targetHeight = video.height;
        } else if (preset === '16:9') {
            targetWidth = video.width;
            targetHeight = Math.floor(video.width * 9 / 16);
        } else if (preset === '1:1') {
            const size = Math.min(video.width, video.height);
            targetWidth = size;
            targetHeight = size;
        } else {
            return;
        }

        // Get video element's rendered dimensions
        const videoRect = previewPlayer.getBoundingClientRect();
        const videoNaturalWidth = previewPlayer.videoWidth || video.width;
        const videoNaturalHeight = previewPlayer.videoHeight || video.height;

        // Calculate the actual displayed video area (accounting for object-fit: contain)
        const videoAspect = videoNaturalWidth / videoNaturalHeight;
        const containerAspect = videoRect.width / videoRect.height;

        let videoDisplayWidth, videoDisplayHeight, videoOffsetX, videoOffsetY;

        if (containerAspect > videoAspect) {
            // Container is wider - video will have pillarbox (black bars on sides)
            videoDisplayHeight = videoRect.height;
            videoDisplayWidth = videoRect.height * videoAspect;
            videoOffsetX = (videoRect.width - videoDisplayWidth) / 2;
            videoOffsetY = 0;
        } else {
            // Container is taller - video will have letterbox (black bars on top/bottom)
            videoDisplayWidth = videoRect.width;
            videoDisplayHeight = videoRect.width / videoAspect;
            videoOffsetX = 0;
            videoOffsetY = (videoRect.height - videoDisplayHeight) / 2;
        }

        console.log('📺 Video display area:', {
            containerSize: { width: videoRect.width, height: videoRect.height },
            videoNaturalSize: { width: videoNaturalWidth, height: videoNaturalHeight },
            videoDisplaySize: { width: videoDisplayWidth, height: videoDisplayHeight },
            videoOffset: { x: videoOffsetX, y: videoOffsetY }
        });

        // Calculate scale factor (video pixels to display pixels)
        const scaleX = videoDisplayWidth / videoNaturalWidth;
        const scaleY = videoDisplayHeight / videoNaturalHeight;

        // Get current X/Y from inputs (or center by default)
        const cropXInput = document.getElementById('cropViewX');
        const cropYInput = document.getElementById('cropViewY');
        const currentX = parseInt(cropXInput.value) || Math.floor((video.width - targetWidth) / 2);
        const currentY = parseInt(cropYInput.value) || (preset === '9:16' ? 0 : Math.floor((video.height - targetHeight) / 2));

        // Update inputs
        cropXInput.value = currentX;
        cropYInput.value = currentY;

        // Convert video coordinates to display coordinates (with offset)
        const displayX = currentX * scaleX + videoOffsetX;
        const displayY = currentY * scaleY + videoOffsetY;
        const displayWidth = targetWidth * scaleX;
        const displayHeight = targetHeight * scaleY;

        // Position crop box
        cropBox.style.left = `${displayX}px`;
        cropBox.style.top = `${displayY}px`;
        cropBox.style.width = `${displayWidth}px`;
        cropBox.style.height = `${displayHeight}px`;

        console.log('📐 Crop box positioned:', {
            displayX, displayY, displayWidth, displayHeight,
            videoX: currentX, videoY: currentY,
            targetWidth, targetHeight
        });

        // Update info display
        const cropBoxInfo = document.getElementById('cropBoxInfo');
        if (cropBoxInfo) {
            cropBoxInfo.textContent = `${preset} - ${targetWidth}x${targetHeight}`;
        }

        // Show overlay
        cropOverlay.style.display = 'block';
        console.log('✅ Crop overlay displayed');

        // Make crop box draggable
        this.makeCropBoxDraggable(cropBox, scaleX, scaleY, videoOffsetX, videoOffsetY, videoDisplayWidth, videoDisplayHeight);

        console.log(`✅ ${preset} crop overlay active - drag to position`)
    }

    showCustomCropOverlay() {
        console.log('🎨 Showing custom crop overlay (resizable)');

        const video = this.videos.find(v => v.id === this.currentEditVideoId) ||
            this.allVideos.find(v => v.id === this.currentEditVideoId);

        if (!video) {
            console.error('❌ Video not found for crop overlay');
            return;
        }

        console.log('📹 Video dimensions:', { width: video.width, height: video.height });

        if (!video.width || !video.height) {
            console.log('⚠️ Loading video metadata...')
            console.log('⚠️ Video metadata not loaded, trying to get from video element');

            const previewPlayer = document.getElementById('editorViewPreviewVideo');
            if (previewPlayer && previewPlayer.videoWidth && previewPlayer.videoHeight) {
                video.width = previewPlayer.videoWidth;
                video.height = previewPlayer.videoHeight;
                console.log('✅ Got dimensions from video element:', { width: video.width, height: video.height });
            } else {
                if (previewPlayer) {
                    previewPlayer.addEventListener('loadedmetadata', () => {
                        console.log('✅ Video metadata loaded, retrying crop overlay');
                        video.width = previewPlayer.videoWidth;
                        video.height = previewPlayer.videoHeight;
                        this.showCustomCropOverlay();
                    }, { once: true });
                }
                return;
            }
        }

        const previewPlayer = document.getElementById('editorViewPreviewVideo');
        const cropOverlay = document.getElementById('cropOverlay');
        const cropBox = document.getElementById('cropBox');

        if (!previewPlayer || !cropOverlay || !cropBox) {
            console.error('❌ Required elements not found:', { previewPlayer: !!previewPlayer, cropOverlay: !!cropOverlay, cropBox: !!cropBox });
            return;
        }

        // Start with half the video size, centered (as default custom crop)
        const targetWidth = Math.floor(video.width / 2);
        const targetHeight = Math.floor(video.height / 2);

        // Get video element's rendered dimensions
        const videoRect = previewPlayer.getBoundingClientRect();
        const videoNaturalWidth = previewPlayer.videoWidth || video.width;
        const videoNaturalHeight = previewPlayer.videoHeight || video.height;

        // Calculate the actual displayed video area (accounting for object-fit: contain)
        const videoAspect = videoNaturalWidth / videoNaturalHeight;
        const containerAspect = videoRect.width / videoRect.height;

        let videoDisplayWidth, videoDisplayHeight, videoOffsetX, videoOffsetY;

        if (containerAspect > videoAspect) {
            videoDisplayHeight = videoRect.height;
            videoDisplayWidth = videoRect.height * videoAspect;
            videoOffsetX = (videoRect.width - videoDisplayWidth) / 2;
            videoOffsetY = 0;
        } else {
            videoDisplayWidth = videoRect.width;
            videoDisplayHeight = videoRect.width / videoAspect;
            videoOffsetX = 0;
            videoOffsetY = (videoRect.height - videoDisplayHeight) / 2;
        }

        console.log('📺 Video display area:', {
            containerSize: { width: videoRect.width, height: videoRect.height },
            videoNaturalSize: { width: videoNaturalWidth, height: videoNaturalHeight },
            videoDisplaySize: { width: videoDisplayWidth, height: videoDisplayHeight },
            videoOffset: { x: videoOffsetX, y: videoOffsetY }
        });

        const scaleX = videoDisplayWidth / videoNaturalWidth;
        const scaleY = videoDisplayHeight / videoNaturalHeight;

        // Get current X/Y from inputs (or center by default)
        const cropXInput = document.getElementById('cropViewX');
        const cropYInput = document.getElementById('cropViewY');
        const currentX = parseInt(cropXInput.value) || Math.floor((video.width - targetWidth) / 2);
        const currentY = parseInt(cropYInput.value) || Math.floor((video.height - targetHeight) / 2);

        // Update inputs
        cropXInput.value = currentX;
        cropYInput.value = currentY;

        // Convert video coordinates to display coordinates (with offset)
        const displayX = currentX * scaleX + videoOffsetX;
        const displayY = currentY * scaleY + videoOffsetY;
        const displayWidth = targetWidth * scaleX;
        const displayHeight = targetHeight * scaleY;

        // Position crop box
        cropBox.style.left = `${displayX}px`;
        cropBox.style.top = `${displayY}px`;
        cropBox.style.width = `${displayWidth}px`;
        cropBox.style.height = `${displayHeight}px`;

        console.log('📐 Crop box positioned:', {
            displayX, displayY, displayWidth, displayHeight,
            videoX: currentX, videoY: currentY,
            targetWidth, targetHeight
        });

        // Update info display
        const cropBoxInfo = document.getElementById('cropBoxInfo');
        if (cropBoxInfo) {
            cropBoxInfo.textContent = `${targetWidth}x${targetHeight} @ (${currentX}, ${currentY})`;
        }

        // Show overlay
        cropOverlay.style.display = 'block';
        console.log('✅ Custom crop overlay displayed (resizable)');

        // Make crop box draggable and resizable
        this.makeCropBoxDraggable(cropBox, scaleX, scaleY, videoOffsetX, videoOffsetY, videoDisplayWidth, videoDisplayHeight);

        console.log('✅ Custom crop overlay active - drag to move, resize from corners')
    }

    makeCropBoxDraggable(cropBox, scaleX, scaleY, videoOffsetX, videoOffsetY, videoDisplayWidth, videoDisplayHeight) {
        let isDragging = false;
        let isResizing = false;
        let resizeHandle = null;
        let startX, startY, boxStartX, boxStartY, boxStartWidth, boxStartHeight;

        // Get all corner handles
        const handles = {
            'nw': cropBox.querySelector('.crop-handle-nw'),
            'ne': cropBox.querySelector('.crop-handle-ne'),
            'sw': cropBox.querySelector('.crop-handle-sw'),
            'se': cropBox.querySelector('.crop-handle-se')
        };

        // Handle resize from corners
        const onHandleMouseDown = (corner) => (e) => {
            isResizing = true;
            resizeHandle = corner;
            startX = e.clientX;
            startY = e.clientY;
            boxStartX = parseFloat(cropBox.style.left) || 0;
            boxStartY = parseFloat(cropBox.style.top) || 0;
            boxStartWidth = parseFloat(cropBox.style.width);
            boxStartHeight = parseFloat(cropBox.style.height);
            e.stopPropagation();
            e.preventDefault();
        };

        // Handle drag from center
        const onMouseDown = (e) => {
            // Only drag if not clicking on a handle
            if (e.target.classList.contains('crop-handle')) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            boxStartX = parseFloat(cropBox.style.left) || 0;
            boxStartY = parseFloat(cropBox.style.top) || 0;
            cropBox.style.cursor = 'grabbing';
            e.preventDefault();
        };

        const onMouseMove = (e) => {
            if (isResizing) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newX = boxStartX;
                let newY = boxStartY;
                let newWidth = boxStartWidth;
                let newHeight = boxStartHeight;

                // Adjust based on which corner is being dragged
                switch (resizeHandle) {
                    case 'nw': // Top-left
                        newX = boxStartX + deltaX;
                        newY = boxStartY + deltaY;
                        newWidth = boxStartWidth - deltaX;
                        newHeight = boxStartHeight - deltaY;
                        break;
                    case 'ne': // Top-right
                        newY = boxStartY + deltaY;
                        newWidth = boxStartWidth + deltaX;
                        newHeight = boxStartHeight - deltaY;
                        break;
                    case 'sw': // Bottom-left
                        newX = boxStartX + deltaX;
                        newWidth = boxStartWidth - deltaX;
                        newHeight = boxStartHeight + deltaY;
                        break;
                    case 'se': // Bottom-right
                        newWidth = boxStartWidth + deltaX;
                        newHeight = boxStartHeight + deltaY;
                        break;
                }

                // Constrain to minimum size (50px)
                const minSize = 50;
                if (newWidth < minSize) {
                    if (resizeHandle === 'nw' || resizeHandle === 'sw') {
                        newX = boxStartX + boxStartWidth - minSize;
                    }
                    newWidth = minSize;
                }
                if (newHeight < minSize) {
                    if (resizeHandle === 'nw' || resizeHandle === 'ne') {
                        newY = boxStartY + boxStartHeight - minSize;
                    }
                    newHeight = minSize;
                }

                // Constrain to video display area
                newX = Math.max(videoOffsetX, Math.min(newX, videoOffsetX + videoDisplayWidth - newWidth));
                newY = Math.max(videoOffsetY, Math.min(newY, videoOffsetY + videoDisplayHeight - newHeight));
                newWidth = Math.min(newWidth, videoOffsetX + videoDisplayWidth - newX);
                newHeight = Math.min(newHeight, videoOffsetY + videoDisplayHeight - newY);

                // Update crop box
                cropBox.style.left = `${newX}px`;
                cropBox.style.top = `${newY}px`;
                cropBox.style.width = `${newWidth}px`;
                cropBox.style.height = `${newHeight}px`;

                // Convert back to video coordinates
                const videoX = Math.floor((newX - videoOffsetX) / scaleX);
                const videoY = Math.floor((newY - videoOffsetY) / scaleY);
                const videoWidth = Math.floor(newWidth / scaleX);
                const videoHeight = Math.floor(newHeight / scaleY);

                // Update input fields
                document.getElementById('cropViewX').value = videoX;
                document.getElementById('cropViewY').value = videoY;

                // Update info display
                const cropBoxInfo = document.getElementById('cropBoxInfo');
                cropBoxInfo.textContent = `${videoWidth}x${videoHeight} @ (${videoX}, ${videoY})`;

            } else if (isDragging) {
                const deltaX = e.clientX - startX;
                const deltaY = e.clientY - startY;

                let newX = boxStartX + deltaX;
                let newY = boxStartY + deltaY;

                const boxWidth = parseFloat(cropBox.style.width);
                const boxHeight = parseFloat(cropBox.style.height);

                // Constrain to video display area (not container, accounting for letterbox/pillarbox)
                newX = Math.max(videoOffsetX, Math.min(newX, videoOffsetX + videoDisplayWidth - boxWidth));
                newY = Math.max(videoOffsetY, Math.min(newY, videoOffsetY + videoDisplayHeight - boxHeight));

                // Update crop box position
                cropBox.style.left = `${newX}px`;
                cropBox.style.top = `${newY}px`;

                // Convert display coordinates back to video coordinates (subtract offset)
                const videoX = Math.floor((newX - videoOffsetX) / scaleX);
                const videoY = Math.floor((newY - videoOffsetY) / scaleY);
                const videoWidth = Math.floor(boxWidth / scaleX);
                const videoHeight = Math.floor(boxHeight / scaleY);

                // Update input fields
                document.getElementById('cropViewX').value = videoX;
                document.getElementById('cropViewY').value = videoY;

                // Update info display
                const cropBoxInfo = document.getElementById('cropBoxInfo');
                cropBoxInfo.textContent = `${videoWidth}x${videoHeight} @ (${videoX}, ${videoY})`;
            }
        };

        const onMouseUp = () => {
            if (isDragging) {
                isDragging = false;
                cropBox.style.cursor = 'move';
                console.log('✅ Crop position updated')
            }
            if (isResizing) {
                isResizing = false;
                resizeHandle = null;
                console.log('✅ Crop size updated')
            }
        };

        // Remove old listeners
        cropBox.onmousedown = null;
        document.onmousemove = null;
        document.onmouseup = null;
        Object.values(handles).forEach(handle => {
            if (handle) handle.onmousedown = null;
        });

        // Add new listeners
        cropBox.onmousedown = onMouseDown;
        document.onmousemove = onMouseMove;
        document.onmouseup = onMouseUp;

        // Add resize handles
        Object.entries(handles).forEach(([corner, handle]) => {
            if (handle) {
                handle.onmousedown = onHandleMouseDown(corner);
            }
        });
    }

    hideCropOverlay() {
        const cropOverlay = document.getElementById('cropOverlay');
        if (cropOverlay) {
            cropOverlay.style.display = 'none';
        }
    }

    setCropViewPosition(position) {
        const video = this.videos.find(v => v.id === this.currentEditVideoId) ||
            this.allVideos.find(v => v.id === this.currentEditVideoId);

        if (!video || !video.width || !video.height) {
            console.log('⚠️ Please load video metadata first')
            return;
        }

        const cropPreset = document.getElementById('cropViewPreset').value;
        const cropXInput = document.getElementById('cropViewX');
        const cropYInput = document.getElementById('cropViewY');

        let targetWidth, targetHeight, x, y;

        // Calculate target dimensions based on preset
        if (cropPreset === '9:16') {
            targetWidth = Math.floor(video.height * 9 / 16);
            targetHeight = video.height;
        } else if (cropPreset === '16:9') {
            targetWidth = video.width;
            targetHeight = Math.floor(video.width * 9 / 16);
        } else if (cropPreset === '1:1') {
            const size = Math.min(video.width, video.height);
            targetWidth = size;
            targetHeight = size;
        } else {
            console.log('⚠️ Please select an aspect ratio preset first')
            return;
        }

        // Calculate position based on preset
        switch (position) {
            case 'center':
                x = Math.floor((video.width - targetWidth) / 2);
                y = Math.floor((video.height - targetHeight) / 2);
                break;
            case 'top':
                x = Math.floor((video.width - targetWidth) / 2);
                y = 0;
                break;
            case 'bottom':
                x = Math.floor((video.width - targetWidth) / 2);
                y = video.height - targetHeight;
                break;
            case 'left':
                x = 0;
                y = Math.floor((video.height - targetHeight) / 2);
                break;
            case 'right':
                x = video.width - targetWidth;
                y = Math.floor((video.height - targetHeight) / 2);
                break;
            default:
                x = 0;
                y = 0;
        }

        cropXInput.value = Math.max(0, x);
        cropYInput.value = Math.max(0, y);

        // Refresh crop overlay with new position
        if (cropPreset && cropPreset !== 'custom') {
            this.showCropOverlay(cropPreset);
        }

        console.log(`✅ Crop position set to ${position}`)
    }

    showCurrentViewTimeIndicator(time) {
        const indicator = document.getElementById('currentViewTimeIndicator');
        const timeDisplay = document.getElementById('currentViewTimeDisplay');

        if (indicator && timeDisplay) {
            timeDisplay.textContent = this.formatDuration(time);
            indicator.style.display = 'block';
        }
    }

    async processVideoFromView() {
        if (!this.currentEditVideoId) {
            console.log('❌ No video selected')
            return;
        }

        // Determine operation based on which tab is active
        const cutSection = document.getElementById('cutViewSection');
        const cropSection = document.getElementById('cropViewSection');
        let operation = 'cut';

        if (cutSection.style.display !== 'none' && cropSection.style.display !== 'none') {
            operation = 'cut_and_crop';
        } else if (cropSection.style.display !== 'none') {
            operation = 'crop';
        }

        let startTime = document.getElementById('editViewStartTime').value.trim();
        let endTime = document.getElementById('editViewEndTime').value.trim();
        const cropPreset = document.getElementById('cropViewPreset').value;
        const preserveFaces = document.getElementById('preserveViewFaces').checked;
        const outputFilename = document.getElementById('editViewOutputFilename').value.trim();

        // Validate based on operation
        if ((operation === 'cut' || operation === 'cut_and_crop') && (!startTime || !endTime)) {
            console.log('❌ Please enter start and end times')
            return;
        }

        if ((operation === 'crop' || operation === 'cut_and_crop') && !cropPreset) {
            console.log('❌ Please select a crop preset')
            return;
        }

        // Normalize time formats (accepts "30", "0:30", "1:45", "01:23:45", etc.)
        if ((operation === 'cut' || operation === 'cut_and_crop')) {
            try {
                startTime = this.normalizeTimeFormat(startTime);
                endTime = this.normalizeTimeFormat(endTime);
                console.log(`⏱️ Normalized times - Start: ${startTime}, End: ${endTime}`);
            } catch (error) {
                console.log('❌ Invalid time format. Use seconds (30), MM:SS (1:45), or HH:MM:SS (01:23:45)')
                return;
            }
        }

        try {
            const cropX = document.getElementById('cropViewX').value;
            const cropY = document.getElementById('cropViewY').value;
            const cutMethod = document.getElementById('editViewCutMethod')?.value || 'ffmpeg';

            // Calculate crop dimensions based on preset
            let cropWidth = null;
            let cropHeight = null;

            if (operation === 'crop' || operation === 'cut_and_crop') {
                const video = this.videos.find(v => v.id === this.currentEditVideoId) ||
                    this.allVideos.find(v => v.id === this.currentEditVideoId);

                if (video && video.width && video.height) {
                    if (cropPreset === 'custom') {
                        // For custom mode, read dimensions from the crop box (resized by user)
                        const cropBox = document.getElementById('cropBox');
                        const previewPlayer = document.getElementById('editorViewPreviewVideo');

                        if (cropBox && previewPlayer && cropBox.style.display !== 'none') {
                            // Get display dimensions
                            const displayWidth = parseFloat(cropBox.style.width);
                            const displayHeight = parseFloat(cropBox.style.height);

                            // Calculate video display scale
                            const videoRect = previewPlayer.getBoundingClientRect();
                            const videoNaturalWidth = previewPlayer.videoWidth || video.width;
                            const videoNaturalHeight = previewPlayer.videoHeight || video.height;
                            const videoAspect = videoNaturalWidth / videoNaturalHeight;
                            const containerAspect = videoRect.width / videoRect.height;

                            let videoDisplayWidth, videoDisplayHeight;
                            if (containerAspect > videoAspect) {
                                videoDisplayHeight = videoRect.height;
                                videoDisplayWidth = videoRect.height * videoAspect;
                            } else {
                                videoDisplayWidth = videoRect.width;
                                videoDisplayHeight = videoRect.width / videoAspect;
                            }

                            const scaleX = videoDisplayWidth / videoNaturalWidth;
                            const scaleY = videoDisplayHeight / videoNaturalHeight;

                            // Convert display dimensions back to video pixels
                            cropWidth = Math.floor(displayWidth / scaleX);
                            cropHeight = Math.floor(displayHeight / scaleY);

                            console.log(`📐 Custom crop dimensions from crop box: ${cropWidth}x${cropHeight}`);
                        } else {
                            // Fallback: use half video size if crop box not visible
                            cropWidth = Math.floor(video.width / 2);
                            cropHeight = Math.floor(video.height / 2);
                            console.log(`📐 Custom crop dimensions (default): ${cropWidth}x${cropHeight}`);
                        }
                    } else if (cropPreset) {
                        // Calculate dimensions based on preset
                        if (cropPreset === '9:16') {
                            cropWidth = Math.floor(video.height * 9 / 16);
                            cropHeight = video.height;
                        } else if (cropPreset === '16:9') {
                            cropWidth = video.width;
                            cropHeight = Math.floor(video.width * 9 / 16);
                        } else if (cropPreset === '1:1') {
                            const size = Math.min(video.width, video.height);
                            cropWidth = size;
                            cropHeight = size;
                        }
                        console.log(`📐 Calculated crop dimensions from preset: ${cropWidth}x${cropHeight}`);
                    }
                }
            }

            const requestBody = {
                video_id: this.currentEditVideoId,
                operation: operation,
                start_time: (operation === 'cut' || operation === 'cut_and_crop') ? startTime : null,
                end_time: (operation === 'cut' || operation === 'cut_and_crop') ? endTime : null,
                cut_method: (operation === 'cut' || operation === 'cut_and_crop') ? cutMethod : 'ffmpeg',
                crop_preset: (operation === 'crop' || operation === 'cut_and_crop') ? (cropPreset === 'custom' ? null : cropPreset) : null,
                crop_width: cropWidth,
                crop_height: cropHeight,
                crop_x: (operation === 'crop' || operation === 'cut_and_crop') && cropX ? parseInt(cropX) : null,
                crop_y: (operation === 'crop' || operation === 'cut_and_crop') && cropY ? parseInt(cropY) : null,
                preserve_faces: preserveFaces,
                output_filename: outputFilename || null
            };

            const response = await fetch(`${this.apiBase}/api/editor/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (response.ok) {
                console.log(`✅ Video processing started: ${data.output_filename}`)

                // Store job ID for face preservation
                this.currentEditJobId = data.job_id;
                this.currentEditJobPreserveFaces = preserveFaces;

                // Show job status and start monitoring
                this.monitorEditJobFromView(data.job_id);
            } else {
                console.log(`❌ Failed to start processing: ${data.detail}`)
            }

        } catch (error) {
            console.error('Error processing video:', error);
            console.log('❌ Failed to start video processing')
        }
    }

    async monitorEditJobFromView(jobId) {
        const statusContainer = document.getElementById('editViewJobStatus');
        statusContainer.style.display = 'block';
        console.log(`🎬 Job ${jobId}: Monitoring video processing...`);

        // Poll for status updates
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.apiBase}/api/editor/jobs/${jobId}`);
                const job = await response.json();

                const methodLabels = {
                    'copy': '🚀 Stream Copy (Fastest, Keyframes)',
                    'smartcut': '⚡ Smartcut (Fast, Frame Accurate)',
                    'ffmpeg': '🎯 Precise (FFmpeg Re-encode)'
                };
                const methodLabel = methodLabels[job.cut_method] || '⚙️ FFmpeg (Balanced)';
                console.log(`📊 Job ${jobId}: ${job.status.toUpperCase()} - ${job.progress}% - ${methodLabel}`);

                // Update status display
                statusContainer.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; background: #f8f9fa; border-radius: 8px;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 5px; font-size: 15px;">${job.output_filename}</div>
                            <div style="font-size: 14px; color: #666;">
                                Status: ${this.formatEditJobStatus(job.status)} ${job.progress}%
                            </div>
                            <div style="font-size: 13px; color: #999; margin-top: 4px;">
                                ${methodLabel}
                            </div>
                        </div>
                        <div style="font-size: 32px;">
                            ${this.getEditJobIcon(job.status)}
                        </div>
                    </div>
                `;

                // Stop polling when complete or failed
                if (job.status === 'completed') {
                    clearInterval(pollInterval);
                    console.log(`✅ Job ${jobId}: Completed with ${methodLabel}! Output: ${job.output_filename}`);
                    console.log('✅ Video processing completed!')

                    // If preserve faces was enabled, call the API
                    if (this.currentEditJobPreserveFaces) {
                        await this.preserveFacesForEditedVideo(jobId);
                    }

                    // Auto-scan the output folder and refresh if viewing it
                    await this.autoScanAndRefreshAfterEdit(job);

                } else if (job.status === 'failed') {
                    clearInterval(pollInterval);
                    console.error(`❌ Job ${jobId}: Failed with ${methodLabel}. Error: ${job.error_message}`);
                    console.log(`❌ Video processing failed: ${job.error_message}`)
                }

            } catch (error) {
                console.error('Error monitoring job:', error);
                clearInterval(pollInterval);
            }
        }, 2000); // Poll every 2 seconds
    }

    async autoScanAndRefreshAfterEdit(job) {
        /**
         * Automatically scan and refresh ONLY the edited video (not entire folder)
         * This is much faster than smartRefreshFolder which scans everything
         */
        try {
            if (!job.output_path) {
                console.warn('⚠️ No output_path in job, skipping auto-scan');
                return;
            }

            // Extract folder name from output path
            // Example: "/path/to/EDITED/video.mp4" -> "EDITED"
            const pathParts = job.output_path.split('/');
            const folderName = pathParts[pathParts.length - 2]; // Second to last part is the folder name
            const videoFilename = pathParts[pathParts.length - 1]; // Last part is the filename

            const methodLabelMap = {
                'copy': 'Stream Copy (Fastest)',
                'smartcut': 'Smartcut (Fast)',
                'ffmpeg': 'FFmpeg (Precise)'
            };
            const methodLabel = methodLabelMap[job.cut_method] || 'FFmpeg';
            console.log(`✂️ Job completed using ${methodLabel}`);
            console.log(`🔄 Auto-scanning edited video only: ${videoFilename} in folder ${folderName}`);

            // Scan and generate thumbnail for ONLY the edited video (not entire folder)
            await this.scanAndGenerateThumbnailForEditedVideo(folderName, videoFilename);

        } catch (error) {
            console.error('❌ Error auto-scanning after edit:', error);
            console.log('⚠️ Video saved but auto-import failed. Use ⚡ Smart Refresh.')
        }
    }

    async scanAndGenerateThumbnailForEditedVideo(folderName, videoFilename) {
        /**
         * Scan and generate thumbnail for ONLY the edited video
         * Much faster than smartRefreshFolder which scans the entire folder
         */
        try {
            console.log('🔄 Scanning edited video...')

            // Call backend endpoint that scans and generates thumbnail for just this video
            const data = await this.api.scanSingleVideo(folderName, videoFilename);
            console.log(`✅ Single video scan completed:`, data);

            // CRITICAL: Reload videos for THIS FOLDER ONLY to include the newly scanned video
            // Much more efficient than fetching all videos globally
            console.log(`🔄 Refreshing ${folderName} folder cache to include newly scanned video...`);
            try {
                const folderData = await this.api.getVideosByFolder(folderName, false);
                const folderVideos = folderData.videos || [];

                // Update this.allVideos: preserve other folders, add/refresh current folder videos
                const otherFolderVideos = this.allVideos.filter(v => v.category !== folderName);
                this.allVideos = otherFolderVideos.concat(folderVideos);

                console.log(`✅ Cache updated for ${folderName}: ${folderVideos.length} videos (${this.allVideos.length} total)`);
            } catch (err) {
                console.warn('⚠️ Failed to refresh folder cache, will fetch fresh on navigation');
            }

            // CRITICAL: Also update this.videos if we're currently viewing this folder
            // This ensures the UI shows the new video immediately without needing manual refresh
            if (this.currentView === 'explorer' && this.currentCategory === folderName) {
                console.log(`🔄 Updating current view (this.videos) for ${folderName}...`);
                // Fetch fresh data for current folder to update this.videos
                try {
                    const folderData = await this.api.getVideosByFolder(folderName, false);
                    this.videos = folderData.videos || [];
                    console.log(`✅ Current view updated: ${this.videos.length} videos`);

                    // Re-render the folder contents with fresh data
                    this.renderFolderContents();
                } catch (err) {
                    console.warn('⚠️ Failed to update current view, using cached data');
                    // Fallback: just re-render with existing data
                    this.renderFolderContents();
                }
            } else if (this.currentView === 'list') {
                // If in list view, refresh to show updated counts
                await this.loadVideos();
            }

            console.log(`✅ Video imported: ${videoFilename}`)

        } catch (error) {
            console.error('❌ Error scanning edited video:', error);
            // Fall back to smartRefreshFolder if single video scan fails
            console.log('⚠️ Falling back to smart refresh for entire folder');
            await this.smartRefreshFolder(folderName);
        }
    }

    switchEditorTab(tab) {
        // Update tab buttons
        document.querySelectorAll('.editor-tab-btn').forEach(btn => btn.classList.remove('active'));

        // Show/hide sections
        const cutSection = document.getElementById('cutSection');
        const cropSection = document.getElementById('cropSection');

        if (tab === 'cut') {
            document.getElementById('cutTabBtn').classList.add('active');
            cutSection.style.display = 'block';
            cropSection.style.display = 'none';
            this.currentEditorOperation = 'cut';
        } else if (tab === 'crop') {
            document.getElementById('cropTabBtn').classList.add('active');
            cutSection.style.display = 'none';
            cropSection.style.display = 'block';
            this.currentEditorOperation = 'crop';
        } else if (tab === 'both') {
            document.getElementById('bothTabBtn').classList.add('active');
            cutSection.style.display = 'block';
            cropSection.style.display = 'block';
            this.currentEditorOperation = 'cut_and_crop';
        }
    }

    async processVideo() {
        if (!this.currentEditVideoId) {
            console.log('❌ No video selected')
            return;
        }

        const operation = this.currentEditorOperation;
        let startTime = document.getElementById('editStartTime').value.trim();
        let endTime = document.getElementById('editEndTime').value.trim();
        const cropPreset = document.getElementById('cropPreset').value;
        const preserveFaces = document.getElementById('preserveFaces').checked;
        const copyOtherItems = document.getElementById('copyOtherItems').checked;
        const outputFilename = document.getElementById('editOutputFilename').value.trim();
        const saveToSameFolder = this.editSaveToSameFolder;

        // Validate based on operation
        if ((operation === 'cut' || operation === 'cut_and_crop') && (!startTime || !endTime)) {
            console.log('❌ Please enter start and end times')
            return;
        }

        if ((operation === 'crop' || operation === 'cut_and_crop') && !cropPreset) {
            console.log('❌ Please select a crop preset')
            return;
        }

        // Normalize time formats (accepts "30", "0:30", "1:45", "01:23:45", etc.)
        if ((operation === 'cut' || operation === 'cut_and_crop')) {
            try {
                startTime = this.normalizeTimeFormat(startTime);
                endTime = this.normalizeTimeFormat(endTime);
                console.log(`⏱️ Normalized times - Start: ${startTime}, End: ${endTime}`);
            } catch (error) {
                console.log('❌ Invalid time format. Use seconds (30), MM:SS (1:45), or HH:MM:SS (01:23:45)')
                return;
            }
        }

        try {
            const cropX = document.getElementById('cropX').value;
            const cropY = document.getElementById('cropY').value;

            const requestBody = {
                video_id: this.currentEditVideoId,
                operation: operation,
                start_time: (operation === 'cut' || operation === 'cut_and_crop') ? startTime : null,
                end_time: (operation === 'cut' || operation === 'cut_and_crop') ? endTime : null,
                crop_preset: (operation === 'crop' || operation === 'cut_and_crop') ? (cropPreset === 'custom' ? null : cropPreset) : null,
                crop_x: (operation === 'crop' || operation === 'cut_and_crop') && cropX ? parseInt(cropX) : null,
                crop_y: (operation === 'crop' || operation === 'cut_and_crop') && cropY ? parseInt(cropY) : null,
                preserve_faces: preserveFaces,
                copy_other_items: copyOtherItems,
                save_to_same_folder: saveToSameFolder,
                output_filename: outputFilename || null
            };

            const response = await fetch(`${this.apiBase}/api/editor/process`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (response.ok) {
                console.log(`✅ Video processing started: ${data.output_filename}`)

                // Store job ID for face preservation
                this.currentEditJobId = data.job_id;
                this.currentEditJobPreserveFaces = preserveFaces;

                // Show job status and start monitoring
                this.monitorEditJob(data.job_id);
            } else {
                console.log(`❌ Failed to start processing: ${data.detail}`)
            }

        } catch (error) {
            console.error('Error processing video:', error);
            console.log('❌ Failed to start video processing')
        }
    }

    async monitorEditJob(jobId) {
        const statusContainer = document.getElementById('editJobStatus');
        statusContainer.style.display = 'block';
        console.log(`🎬 Job ${jobId}: Monitoring video processing...`);

        // Poll for status updates
        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`${this.apiBase}/api/editor/jobs/${jobId}`);
                const job = await response.json();

                const methodLabelMap = {
                    'copy': 'Stream Copy',
                    'smartcut': 'Smartcut',
                    'ffmpeg': 'Precise (FFmpeg)'
                };
                const methodLabel = methodLabelMap[job.cut_method] || 'FFmpeg';
                console.log(`📊 Job ${jobId}: ${job.status.toUpperCase()} - ${job.progress}% - ✂️ ${methodLabel}`);

                // Update status display
                statusContainer.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 5px;">${job.output_filename}</div>
                            <div style="font-size: 14px; color: #666;">
                                Status: ${this.formatEditJobStatus(job.status)} ${job.progress}%
                            </div>
                            <div style="font-size: 13px; color: #999; margin-top: 4px;">
                                ✂️ ${methodLabel}
                            </div>
                        </div>
                        <div style="font-size: 24px;">
                            ${this.getEditJobIcon(job.status)}
                        </div>
                    </div>
                `;

                // Stop polling when complete or failed
                if (job.status === 'completed') {
                    clearInterval(pollInterval);
                    console.log(`✅ Job ${jobId}: Completed with ${methodLabel}! Output: ${job.output_filename}`);

                    // If preserve faces was enabled, call the API
                    if (this.currentEditJobPreserveFaces) {
                        await this.preserveFacesForEditedVideo(jobId);
                    }

                    // Auto-scan the output folder and refresh if viewing it
                    await this.autoScanAndRefreshAfterEdit(job);

                } else if (job.status === 'failed') {
                    clearInterval(pollInterval);
                    console.error(`❌ Job ${jobId}: Failed with ${methodLabel}. Error: ${job.error_message}`);
                }

            } catch (error) {
                console.error('Error monitoring job:', error);
                clearInterval(pollInterval);
            }
        }, 2000); // Poll every 2 seconds
    }

    async preserveFacesForEditedVideo(jobId) {
        try {
            const response = await fetch(`${this.apiBase}/api/editor/jobs/${jobId}/preserve-faces`, {
                method: 'POST'
            });

            const data = await response.json();

            if (response.ok && data.faces_copied > 0) {
                console.log(`✅ ${data.faces_copied} face(s) preserved to edited video`)
            }
        } catch (error) {
            console.error('Error preserving faces:', error);
        }
    }

    formatEditJobStatus(status) {
        const statusMap = {
            'pending': '⏳ Waiting',
            'processing': '🔄 Processing',
            'completed': '✅ Completed',
            'failed': '❌ Failed'
        };
        return statusMap[status] || status;
    }

    getEditJobIcon(status) {
        const iconMap = {
            'pending': '⏳',
            'processing': '🔄',
            'completed': '✅',
            'failed': '❌'
        };
        return iconMap[status] || '';
    }

    toggleSaveLocation() {
        // Toggle between same folder and edit folder
        this.editSaveToSameFolder = !this.editSaveToSameFolder;
        this.updateSaveLocationDisplay();
    }

    updateSaveLocationDisplay() {
        const btn = document.getElementById('toggleSaveLocation');
        const folderDisplay = document.getElementById('saveFolderName');

        if (!btn || !folderDisplay) return;

        if (this.editSaveToSameFolder) {
            btn.textContent = 'Same Folder';
            btn.style.background = '#dbeafe';
            btn.style.color = '#1e40af';
            btn.style.borderColor = '#3b82f6';
            folderDisplay.textContent = this.editVideoOriginalFolder || '-';
        } else {
            btn.textContent = 'Edit Folder';
            btn.style.background = '#dffce7';
            btn.style.color = '#165e1c';
            btn.style.borderColor = '#10b981';
            folderDisplay.textContent = 'Edit (separate folder)';
        }
    }

    showCurrentTimeIndicator(seconds) {
        const indicator = document.getElementById('currentTimeIndicator');
        const display = document.getElementById('currentTimeDisplay');

        if (seconds !== null && seconds !== undefined) {
            display.textContent = this.formatDuration(seconds);
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }

    useCurrentTimeFor(field) {
        if (this.capturedPlaybackTime === null || this.capturedPlaybackTime === undefined) {
            console.log('❌ No playback time captured. Open editor while video is playing.')
            return;
        }

        const timeString = this.formatDuration(this.capturedPlaybackTime);

        if (field === 'start') {
            document.getElementById('editStartTime').value = timeString;
            console.log(`✅ Start time set to ${timeString}`)
        } else if (field === 'end') {
            document.getElementById('editEndTime').value = timeString;
            console.log(`✅ End time set to ${timeString}`)
        }
    }

    onCropPresetChange() {
        const preset = document.getElementById('cropPreset').value;
        const customControls = document.getElementById('customCropControls');

        if (preset === 'custom') {
            customControls.style.display = 'block';
        } else {
            customControls.style.display = 'none';
            // Reset custom values when switching away
            document.getElementById('cropX').value = '0';
            document.getElementById('cropY').value = '0';
        }
    }

    setCropPosition(position) {
        // Get current video to calculate dimensions
        const video = this.videos.find(v => v.id === this.currentEditVideoId) ||
            this.allVideos.find(v => v.id === this.currentEditVideoId);

        if (!video || !video.width || !video.height) {
            console.log('❌ Video dimensions not available. Scan metadata first.')
            return;
        }

        const cropPreset = document.getElementById('cropPreset').value;
        let cropWidth, cropHeight;

        // Calculate crop dimensions based on preset
        if (cropPreset === '9:16') {
            cropWidth = Math.floor(video.height * 9 / 16);
            cropHeight = video.height;
        } else if (cropPreset === '16:9') {
            cropWidth = video.width;
            cropHeight = Math.floor(video.width * 9 / 16);
        } else if (cropPreset === '1:1') {
            const size = Math.min(video.width, video.height);
            cropWidth = size;
            cropHeight = size;
        } else {
            // Use custom or default to center
            cropWidth = video.width;
            cropHeight = video.height;
        }

        let x = 0, y = 0;

        switch (position) {
            case 'center':
                x = Math.floor((video.width - cropWidth) / 2);
                y = Math.floor((video.height - cropHeight) / 2);
                break;
            case 'top':
                x = Math.floor((video.width - cropWidth) / 2);
                y = 0;
                break;
            case 'bottom':
                x = Math.floor((video.width - cropWidth) / 2);
                y = video.height - cropHeight;
                break;
            case 'left':
                x = 0;
                y = Math.floor((video.height - cropHeight) / 2);
                break;
            case 'right':
                x = video.width - cropWidth;
                y = Math.floor((video.height - cropHeight) / 2);
                break;
        }

        document.getElementById('cropX').value = Math.max(0, x);
        document.getElementById('cropY').value = Math.max(0, y);

        console.log(`✅ Crop position set to ${position}`)
    }

    // ==================== Video Preview Player Methods ====================

    setupPreviewPlayerListeners() {
        const previewPlayer = document.getElementById('editorPreviewVideo');

        // Remove existing listeners if any
        if (this.previewPlayerListeners) {
            previewPlayer.removeEventListener('timeupdate', this.previewPlayerListeners.timeupdate);
            previewPlayer.removeEventListener('loadedmetadata', this.previewPlayerListeners.loadedmetadata);
        }

        // Create bound listeners
        this.previewPlayerListeners = {
            timeupdate: () => this.updatePreviewTimeline(),
            loadedmetadata: () => this.onPreviewMetadataLoaded()
        };

        previewPlayer.addEventListener('timeupdate', this.previewPlayerListeners.timeupdate);
        previewPlayer.addEventListener('loadedmetadata', this.previewPlayerListeners.loadedmetadata);
    }

    updatePreviewTimeline() {
        const previewPlayer = document.getElementById('editorPreviewVideo');
        const currentTime = previewPlayer.currentTime;
        const duration = previewPlayer.duration;

        if (isNaN(duration) || duration === 0) return;

        // Update time display
        document.getElementById('previewCurrentTime').textContent = this.formatDuration(currentTime);
        document.getElementById('previewDuration').textContent = this.formatDuration(duration);

        // Update progress marker
        const progress = (currentTime / duration) * 100;
        document.getElementById('timelineMarker').style.left = `${progress}%`;
        document.getElementById('timelineProgress').style.width = `${progress}%`;

        // Update range visualization
        this.updateTimelineRange();
    }

    onPreviewMetadataLoaded() {
        const previewPlayer = document.getElementById('editorPreviewVideo');
        document.getElementById('previewDuration').textContent = this.formatDuration(previewPlayer.duration);
        this.updateTimelineRange();
    }

    updateTimelineRange() {
        const previewPlayer = document.getElementById('editorPreviewVideo');
        const duration = previewPlayer.duration;

        if (isNaN(duration) || duration === 0) return;

        // Get start/end times from inputs
        const startTimeStr = document.getElementById('editStartTime').value;
        const endTimeStr = document.getElementById('editEndTime').value;

        const startTime = this.parseTimeString(startTimeStr);
        const endTime = this.parseTimeString(endTimeStr);

        if (startTime !== null && endTime !== null && endTime > startTime) {
            const startPercent = (startTime / duration) * 100;
            const endPercent = (endTime / duration) * 100;
            const rangeWidth = endPercent - startPercent;

            const rangeElement = document.getElementById('timelineRange');
            rangeElement.style.left = `${startPercent}%`;
            rangeElement.style.width = `${rangeWidth}%`;
            rangeElement.style.display = 'block';
        } else {
            document.getElementById('timelineRange').style.display = 'none';
        }
    }

    parseTimeString(timeStr) {
        // Parse HH:MM:SS to seconds
        const parts = timeStr.split(':');
        if (parts.length !== 3) return null;

        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseInt(parts[2]);

        if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return null;

        return hours * 3600 + minutes * 60 + seconds;
    }

    seekPreviewFromClick(event) {
        const previewPlayer = document.getElementById('editorPreviewVideo');
        const timeline = event.currentTarget;
        const rect = timeline.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percent = clickX / rect.width;
        const seekTime = percent * previewPlayer.duration;

        if (!isNaN(seekTime)) {
            previewPlayer.currentTime = seekTime;
        }
    }

    setStartFromPreview() {
        const previewPlayer = document.getElementById('editorPreviewVideo');
        const currentTime = previewPlayer.currentTime;

        if (!isNaN(currentTime)) {
            const timeString = this.formatDuration(currentTime);
            document.getElementById('editStartTime').value = timeString;
            console.log(`✅ Start time set to ${timeString}`)
            this.updateTimelineRange();
        }
    }

    setEndFromPreview() {
        const previewPlayer = document.getElementById('editorPreviewVideo');
        const currentTime = previewPlayer.currentTime;

        if (!isNaN(currentTime)) {
            const timeString = this.formatDuration(currentTime);
            document.getElementById('editEndTime').value = timeString;
            console.log(`✅ End time set to ${timeString}`)
            this.updateTimelineRange();
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new ClipperApp();
});
