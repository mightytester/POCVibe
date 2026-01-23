/**
 * VideoCollectionModule - Handles video collection loading, rendering, and pagination
 *
 * Manages:
 * - Video grid rendering with grouping (originals + edited versions)
 * - Pagination (load more, page management)
 * - Lazy loading and infinite scroll setup
 * - Collection loading (loadAllVideosFlat, cache management)
 * - Video display state (currentPage, displayedVideos)
 *
 * Usage:
 *   const collectionModule = new VideoCollectionModule(app);
 *   collectionModule.renderVideoGrid();
 *   await collectionModule.loadAllVideosFlat();
 */

class VideoCollectionModule {
    constructor(app) {
        this.app = app;
        this.isLoading = false;
    }

    // ============================================================================
    // VIDEO GRID RENDERING - Main rendering with pagination and grouping
    // ============================================================================

    /**
     * Render video grid with pagination and edited video grouping
     * Handles both collection view (paginated) and explorer folder view (all videos)
     */
    renderVideoGrid() {
        const container = document.getElementById('videoGrid');

        // Reset if starting fresh
        if (this.app.currentPage === 0) {
            container.innerHTML = '';
            this.app.displayedVideos = [];

            // Add header with back and refresh buttons when in explorer folder view
            if (this.app.currentView === 'explorer' && this.app.currentCategory) {
                const folderPath = this.app.currentSubcategory
                    ? `${this.app.currentCategory} / ${this.app.currentSubcategory}`
                    : this.app.currentCategory;

                const headerHtml = `
                    <div class="explorer-header" style="grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #e5e7eb; margin-bottom: 16px; background: white; border-radius: 8px;">
                        <button class="back-btn" onclick="app.navigateToCategory(null)" style="padding: 8px 16px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px;">
                            ← Back
                        </button>
                        <span class="current-folder" style="font-size: 16px; font-weight: 600; color: #111827; flex: 1; text-align: center;">📁 ${folderPath}</span>
                        <button class="refresh-folder-btn" onclick="app.smartRefreshFolder('${this.app.currentCategory}')" title="Smart refresh: scan + thumbnails" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 4px;">
                            ⚡ Refresh
                        </button>
                    </div>
                `;
                container.innerHTML = headerHtml;
            }
        }

        if (this.app.videos.length === 0) {
            if (this.app.currentPage === 0) {
                // Keep the header if it exists, just add no-videos message
                const existingHeader = container.querySelector('.explorer-header');
                const noVideosDiv = '<div class="no-videos">No videos found</div>';
                if (existingHeader) {
                    container.innerHTML += noVideosDiv;
                } else {
                    container.innerHTML = noVideosDiv;
                }
            }
            return;
        }

        // Determine if we should show all videos (explorer folder view) or paginate (collection view)
        const isExplorerFolderView = this.app.currentView === 'explorer' && (this.app.currentCategory || this.app.currentSubcategory);

        let videosToRender;
        if (isExplorerFolderView) {
            // Explorer folder view: Show ALL videos without pagination
            console.log(`📊 Explorer folder view detected - showing ALL ${this.app.videos.length} videos (currentView=${this.app.currentView}, category=${this.app.currentCategory}, subcategory=${this.app.currentSubcategory})`);
            videosToRender = this.app.videos;
        } else {
            // Collection view: Use pagination
            const startIndex = this.app.currentPage * this.app.VIDEOS_PER_PAGE;
            const endIndex = startIndex + this.app.VIDEOS_PER_PAGE;
            console.log(`📄 Collection view - using pagination: page ${this.app.currentPage}, showing ${Math.min(endIndex - startIndex, this.app.videos.length)}/${this.app.videos.length} videos`);
            videosToRender = this.app.videos.slice(startIndex, endIndex);
        }

        if (videosToRender.length === 0) {
            return; // No more videos to load
        }

        // Create document fragment for better performance
        const fragment = document.createDocumentFragment();

        // Group videos: separate originals from edited versions
        const { regular, grouped } = this.app.groupVideosByBase(videosToRender);

        // Render regular videos first
        regular.forEach(video => {
            const card = this.app.createVideoCard(video);
            fragment.appendChild(card);
            this.app.displayedVideos.push(video);
        });

        // Count total edited videos
        const totalEdited = Object.values(grouped).reduce((sum, group) => sum + group.edits.length, 0);

        // Add separator if there are edited videos
        if (totalEdited > 0) {
            const separator = document.createElement('div');
            separator.style.cssText = `
                grid-column: 1 / -1;
                padding: 16px;
                margin: 24px 0 16px 0;
                border-top: 2px solid #d1d5db;
                border-bottom: 1px solid #e5e7eb;
                background: #f9fafb;
                font-size: 14px;
                font-weight: 600;
                color: #6b7280;
                display: flex;
                align-items: center;
                gap: 8px;
            `;
            separator.innerHTML = `
                <span>📦 Edited Versions</span>
                <span style="font-size: 12px; color: #9ca3af;">(${totalEdited} video${totalEdited !== 1 ? 's' : ''})</span>
            `;
            fragment.appendChild(separator);
        }

        // Render edited videos with originals first
        Object.entries(grouped).forEach(([baseName, group]) => {
            // Add sub-header for this original video
            if (group.original) {
                const subHeader = document.createElement('div');
                subHeader.style.cssText = `
                    grid-column: 1 / -1;
                    padding: 12px 16px;
                    margin: 16px 0 8px 0;
                    background: #f3f4f6;
                    font-size: 13px;
                    font-weight: 600;
                    color: #4b5563;
                    border-left: 3px solid #9ca3af;
                `;
                subHeader.textContent = `Original video (${baseName})`;
                fragment.appendChild(subHeader);

                // Show original first
                const card = this.app.createVideoCard(group.original);
                fragment.appendChild(card);
                this.app.displayedVideos.push(group.original);
            }
            // Then show edited versions
            group.edits.forEach(video => {
                const card = this.app.createVideoCard(video);
                fragment.appendChild(card);
                this.app.displayedVideos.push(video);
            });
        });

        container.appendChild(fragment);

        // Setup lazy loading for new video thumbnails
        this.setupLazyLoading();

        // Setup infinite scroll detection
        this.setupInfiniteScroll();

        // Show load more button if there are more videos
        this.updateLoadMoreButton();
    }

    /**
     * Render video grid without resetting (for appending to existing content)
     * Used when subfolders are already rendered and we want to add videos below
     */
    renderVideoGridWithoutReset() {
        const container = document.getElementById('videoGrid');

        if (this.app.videos.length === 0) {
            container.insertAdjacentHTML('beforeend', '<div class="no-videos">No videos found</div>');
            return;
        }

        // Determine if we should show all videos (explorer folder view) or paginate (collection view)
        const isExplorerFolderView = this.app.currentView === 'explorer' && (this.app.currentCategory || this.app.currentSubcategory);

        let videosToRender;
        if (isExplorerFolderView) {
            // Explorer folder view: Show ALL videos without pagination
            console.log(`📊 Explorer folder view (WithoutReset) - showing ALL ${this.app.videos.length} videos (currentView=${this.app.currentView}, category=${this.app.currentCategory}, subcategory=${this.app.currentSubcategory})`);
            videosToRender = this.app.videos;
        } else {
            // Collection view: Use pagination
            const startIndex = this.app.currentPage * this.app.VIDEOS_PER_PAGE;
            const endIndex = startIndex + this.app.VIDEOS_PER_PAGE;
            console.log(`📄 Collection view (WithoutReset) - using pagination: page ${this.app.currentPage}, showing ${Math.min(endIndex - startIndex, this.app.videos.length)}/${this.app.videos.length} videos`);
            videosToRender = this.app.videos.slice(startIndex, endIndex);
        }

        if (videosToRender.length === 0) {
            return; // No more videos to load
        }

        // Create document fragment for better performance
        const fragment = document.createDocumentFragment();

        videosToRender.forEach(video => {
            const card = this.app.createVideoCard(video);
            fragment.appendChild(card);
            this.app.displayedVideos.push(video);
        });

        container.appendChild(fragment);

        // Setup lazy loading for new video thumbnails
        this.setupLazyLoading();

        // Setup infinite scroll detection
        this.setupInfiniteScroll();

        // Show load more button if there are more videos
        this.updateLoadMoreButton();
    }

    // ============================================================================
    // COLLECTION LOADING - Load all videos with caching
    // ============================================================================

    /**
     * Load ALL videos from all folders (flat list)
     * Implements smart caching to avoid redundant API calls
     * @param {boolean} forceReload - Skip cache and force fresh API call
     */
    async loadAllVideosFlat(forceReload = false) {
        try {
            // OPTIMIZATION: Skip loading if FULL collection already cached (in allVideosCatalog)
            if (!forceReload && this.app.hasLoadedFullCollection && this.app.allVideosCatalog && this.app.allVideosCatalog.length > 0) {
                console.log(`📦 Restoring from cached full collection: ${this.app.allVideosCatalog.length} videos`);

                // Restore from cache
                this.app.allVideos = this.app.allVideosCatalog;

                // Still populate filters and apply them
                this.app.seriesModule.populateSeriesFilter();
                this.app.seriesModule.populateYearFilter();
                this.app.seriesModule.populateChannelFilter();
                this.app.applyFilters();
                return;
            }

            console.log(`📋 Loading ALL videos in flat list (forceReload: ${forceReload})`);
            const data = await this.app.api.getAllVideos(true);
            this.app.allVideos = data.videos || [];
            this.app.hasLoadedFullCollection = true; // Mark that we have the FULL collection
            this.app.allVideosCatalog = data.videos || []; // Store complete catalog for face searching
            console.log(`📊 Loaded ${this.app.allVideos.length} total videos from all folders`);

            // Populate metadata filter dropdowns with values from loaded videos
            this.app.seriesModule.populateSeriesFilter();
            this.app.seriesModule.populateYearFilter();
            this.app.seriesModule.populateChannelFilter();

            // Default sort for collection view: newest first (by modification date)
            if (this.app.currentSort === 'random') {
                this.app.currentSort = 'modified';
                const sortSelect = document.getElementById('sortSelect');
                if (sortSelect) {
                    sortSelect.value = 'modified';
                }
            }

            // Apply any active filters
            this.app.applyFilters();

            // Enable all filters now that videos are loaded
            this.app.enableAllFilters();
        } catch (error) {
            console.error('❌ Error loading all videos:', error);
            console.log('Failed to load videos');
            // Enable filters even on error so user can retry
            this.app.enableAllFilters();
        }
    }

    /**
     * Show ALL videos in collection view without any folder filtering
     * Used when clearing filters - bypasses folder filter to show complete collection
     */
    showAllVideosInCollection() {
        console.log('📺 Showing all videos in collection (no folder filtering)');

        // Restore from cache if available
        if (this.app.hasLoadedFullCollection && this.app.allVideosCatalog && this.app.allVideosCatalog.length > 0) {
            console.log(`📦 Using cached collection: ${this.app.allVideosCatalog.length} videos`);
            this.app.allVideos = [...this.app.allVideosCatalog];
            this.app.videos = [...this.app.allVideosCatalog];
        } else if (this.app.allVideos && this.app.allVideos.length > 0) {
            // Use current allVideos
            this.app.videos = [...this.app.allVideos];
        } else {
            // No cached data, need to fetch
            console.log('⚠️ No cached videos, fetching from server...');
            this.loadAllVideosFlat(true);
            return;
        }

        // Populate metadata filters
        this.app.seriesModule.populateSeriesFilter();
        this.app.seriesModule.populateYearFilter();
        this.app.seriesModule.populateChannelFilter();

        // Apply sorting but NOT folder filtering
        this.app.applySorting();
        this.resetPagination();
        this.renderVideoGrid();
        this.updateLoadMoreButton();
        this.app.enableAllFilters();

        console.log(`✅ Showing ${this.app.videos.length} total videos`);
    }

    // ============================================================================
    // PAGINATION - Page management and load more functionality
    // ============================================================================

    /**
     * Reset pagination state and clear video grid
     */
    resetPagination() {
        this.app.currentPage = 0;
        this.app.displayedVideos = [];
        document.getElementById('videoGrid').innerHTML = '';
    }

    /**
     * Load more videos (increment page and render next batch)
     * Called by "Load More" button
     */
    async loadMoreVideos() {
        if (this.isLoading) return;

        // Deduplicate to get accurate count
        const uniqueVideosCount = new Set(this.app.videos.map(v => v.id)).size;
        const hasMoreVideos = (this.app.currentPage + 1) * this.app.VIDEOS_PER_PAGE < uniqueVideosCount;
        if (!hasMoreVideos) return;

        this.isLoading = true;
        this.app.currentPage++;

        // Add a small delay to show loading state
        setTimeout(() => {
            this.renderVideoGrid();
            this.isLoading = false;
        }, 100);
    }

    /**
     * Update or remove "Load More" button based on pagination state
     * Only shows button in collection view when more videos are available
     */
    updateLoadMoreButton() {
        let loadMoreBtn = document.getElementById('loadMoreBtn');

        // Only show "Load More" button in main collection view
        // NOT in explorer view, duplicate view, or when viewing specific folders
        const shouldShowButton =
            this.app.currentView === 'list' &&
            !this.app.duplicateViewActive &&
            !this.app.currentCategory &&
            !this.app.currentSubcategory;

        if (!shouldShowButton) {
            // Remove button if it exists when not in appropriate view
            if (loadMoreBtn) {
                loadMoreBtn.remove();
            }
            return;
        }

        // Deduplicate to get accurate count
        const uniqueVideosCount = new Set(this.app.videos.map(v => v.id)).size;
        const hasMoreVideos = (this.app.currentPage + 1) * this.app.VIDEOS_PER_PAGE < uniqueVideosCount;

        if (hasMoreVideos && !loadMoreBtn) {
            loadMoreBtn = document.createElement('button');
            loadMoreBtn.id = 'loadMoreBtn';
            loadMoreBtn.className = 'load-more-btn';
            loadMoreBtn.textContent = 'Load More Videos';
            loadMoreBtn.onclick = () => this.loadMoreVideos();
            document.getElementById('videoGrid').parentElement.appendChild(loadMoreBtn);
        } else if (!hasMoreVideos && loadMoreBtn) {
            loadMoreBtn.remove();
        }
    }

    // ============================================================================
    // LAZY LOADING & INFINITE SCROLL - Performance optimization
    // ============================================================================

    /**
     * Setup lazy loading for video thumbnails using Intersection Observer
     * Videos only load when they're about to become visible
     */
    setupLazyLoading() {
        const videoElements = document.querySelectorAll('.thumbnail-video[data-src]:not([src])');

        if (!this.app.observer) {
            this.app.observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const video = entry.target;
                        const src = video.getAttribute('data-src');
                        if (src) {
                            // Hide placeholder, show video
                            const placeholder = video.parentElement.querySelector('.thumbnail-placeholder');
                            video.innerHTML = `<source src="${src}" type="video/mp4">`;
                            video.removeAttribute('data-src');
                            video.setAttribute('preload', 'metadata');
                            if (placeholder) placeholder.style.display = 'none';
                        }
                        this.app.observer.unobserve(video);
                    }
                });
            }, {
                rootMargin: '50px' // Start loading 50px before the video is visible
            });
        }

        videoElements.forEach(video => this.app.observer.observe(video));
    }

    /**
     * Setup infinite scroll (currently disabled in favor of manual "Load More" button)
     * This prevents duplicate video display bugs and gives user explicit control
     */
    setupInfiniteScroll() {
        // Infinite scroll disabled - using manual "Load More" button instead
        // This prevents duplicate video display bugs and gives user explicit control

        // Remove existing scroll listener if any
        if (this.app.scrollHandler) {
            window.removeEventListener('scroll', this.app.scrollHandler);
            this.app.scrollHandler = null;
        }
    }
}

// Export as global for use in app.js
window.VideoCollectionModule = VideoCollectionModule;
