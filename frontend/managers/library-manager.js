/**
 * LibraryManager - Manages multi-root library state and switching
 */
class LibraryManager {
    constructor(app) {
        this.app = app;
        this.availableRoots = [];
        this.currentRoot = null;
        this.currentRootLayout = 'horizontal';
    }

    async loadRoots() {
        /**
         * Load available roots from backend and setup root selector
         */
        try {
            const response = await fetch(`${this.app.apiBase}/api/roots`);
            const data = await response.json();

            this.availableRoots = data.roots || [];
            this.currentRoot = data.roots?.find(r => r.default) || data.roots?.[0];
            this.currentRootLayout = data.current?.layout || 'horizontal';

            // Sync app state for compatibility
            this.app.availableRoots = this.availableRoots;
            this.app.currentRoot = this.currentRoot;
            this.app.currentRootLayout = this.currentRootLayout;

            console.log(`📁 Roots loaded. Current: ${this.currentRoot?.name} (${data.current?.layout})`);

            // Setup root selector UI
            this.setupRootSelector();
        } catch (error) {
            console.warn('⚠️ Could not load roots configuration:', error);
            // Continue without root switching if not available
            this.availableRoots = [];
            this.app.availableRoots = [];
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

            const response = await fetch(`${this.app.apiBase}/api/roots/select?root_name=${encodeURIComponent(rootName)}`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to switch root');
            }

            const data = await response.json();
            this.currentRoot = this.availableRoots.find(r => r.name === rootName);
            this.currentRootLayout = data.current.layout;

            // Sync app state
            this.app.currentRoot = this.currentRoot;
            this.app.currentRootLayout = this.currentRootLayout;

            console.log(`✅ Switched to: ${rootName} (${data.current.layout})`);

            // === Clear ALL Frontend State ===
            this.resetAppState();

            // === Apply Layout ===
            this.applyLayout();

            // === Reload Data from New Root ===
            // Reset view to explorer before reloading
            this.app.currentView = 'explorer';

            await this.app.loadVideos();
            await this.app.loadAllTags();
            await this.app.loadFolderGroups();  // Reload folder groups for new root

            console.log('🎬 Videos reloaded from new root with Explorer view');
        } catch (error) {
            console.error('❌ Error switching root:', error);
            alert(`Failed to switch root: ${error.message}`);
        }
    }

    resetAppState() {
        // Clear video-related state
        this.app.videos = [];
        this.app.allVideos = [];
        this.app.allVideosCatalog = [];
        this.app.displayedVideos = [];
        this.app.selectedVideos.clear();
        this.app.currentPage = 0;
        this.app.scrollPositions = {};

        // Clear modal state
        this.app.currentVideoInPlayer = null;
        this.app.hideVideoPlayer();
        this.app.hideMoveVideoPlayerModal();
        this.app.hideTagVideoPlayerModal();

        // Clear tag state
        this.app.tagCache = {};
        this.app.actorCache = {};

        // Clear filter state
        this.app.filterTag = null;
        this.app.filterActor = null;
        this.app.currentCategory = null;
        this.app.currentSubcategory = null;

        // Clear pagination state
        this.app.itemsPerPage = 50;

        // Clear view state
        this.app.currentView = 'explorer';
        this.app.verticalMode = false;
        this.app.sortBy = null;

        // Clear folder groups (will be reloaded)
        this.app.folderGroups = [];
    }

    applyLayout() {
        // Delegate vertical mode toggle to app if logic exists, or do it here
        // Using logic from app.js
        if (this.currentRootLayout === 'vertical') {
            this.app.verticalMode = true;
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
            this.app.verticalMode = false;
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
    }
}

// Export for usage
window.LibraryManager = LibraryManager;
