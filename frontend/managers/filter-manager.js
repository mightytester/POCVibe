/**
 * FilterManager - Handles search, tags, actors, and metadata filtering
 */
class FilterManager {
    constructor(app) {
        this.app = app;
    }

    async performSearch(query) {
        /**
         * Search videos by title, tags, or actors
         * If query starts with 'folder:', filter by folder instead
         */
        if (!query || query.trim() === '') {
            this.app.videos = [...this.app.allVideos];
            this.app.renderVideoGrid();
            return;
        }

        try {
            console.log(`🔍 Searching for: "${query}"`);

            // Use centralized API client for search
            const results = await this.app.api.searchVideos(query);
            this.app.videos = Array.isArray(results) ? results : (results.videos || []);

            console.log(`✅ Search returned ${this.app.videos.length} videos`);

            // Check if we also need to do client-side folder filtering
            if (query.startsWith('folder:')) {
                const folderName = query.replace('folder:', '').trim();
                this.app.videos = this.app.videos.filter(v =>
                    v.category === folderName || v.subcategory === folderName
                );
            }

            // Update the UI
            this.app.handleSearchResults(this.app.videos);

        } catch (error) {
            console.error('Search failed:', error);
            this.app.showStatus('Search failed. Check console for details.', 'error');
        }
    }

    filterByTag(tagName) {
        /**
         * Filter current view by tag name
         */
        if (!tagName) {
            this.app.videos = [...this.app.allVideos];
            if (this.app.renderVideoGrid) this.app.renderVideoGrid();
            return;
        }

        console.log(`🏷️ Filtering by tag: "${tagName}"`);

        // Use pre-loaded videos for instant filtering
        let tagVideos = [];
        if (tagName === '__untagged__') {
            tagVideos = this.app.allVideos.filter(v => !v.tags || v.tags.length === 0);
        } else {
            tagVideos = this.app.allVideos.filter(v =>
                v.tags && v.tags.some(t => t.name === tagName)
            );
        }

        console.log(`✅ Found ${tagVideos.length} videos with tag "${tagName}"`);

        // Update view
        this.app.videos = tagVideos;

        // Use standard grid rendering if possible
        if (this.app.renderVideoGrid) {
            this.app.renderVideoGrid();
        } else {
            // Fallback for custom results grid if it exists
            const resultsGrid = document.getElementById('tagResultsGrid');
            if (resultsGrid) {
                resultsGrid.innerHTML = '';
                tagVideos.forEach(video => {
                    const card = this.app.createVideoCard(video);
                    resultsGrid.appendChild(card);
                });
            }
        }

        // Scroll to top
        window.scrollTo(0, 0);
    }

    clearFilters() {
        /**
         * Reset all filters and show all videos
         */
        console.log('🧹 Clearing all filters');

        // Reset inputs
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';

        const tagFilter = document.getElementById('tagFilter');
        if (tagFilter) tagFilter.value = '';

        const seriesFilter = document.getElementById('seriesFilter');
        if (seriesFilter) seriesFilter.value = '';

        const yearFilter = document.getElementById('yearFilter');
        if (yearFilter) yearFilter.value = '';

        const channelFilter = document.getElementById('channelFilter');
        if (channelFilter) channelFilter.value = '';

        const ratingFilter = document.getElementById('ratingFilter');
        if (ratingFilter) ratingFilter.value = '';

        const favoriteFilter = document.getElementById('favoriteFilter');
        if (favoriteFilter) favoriteFilter.checked = false;

        // Reset state
        this.app.videos = [...this.app.allVideos];
        this.app.activeFaceFilter = null;

        // Re-render
        if (this.app.renderVideoGrid) this.app.renderVideoGrid();

        // Close menus
        if (this.app.hideFolderFilterMenu) this.app.hideFolderFilterMenu();
    }

    setupEventListeners() {
        // Reserved for future filter-specific listeners
        console.log('✅ FilterManager event listeners setup');
    }
}

// Export for usage
window.FilterManager = FilterManager;
