/**
 * FilterManager - Manages search, tags, actors, and metadata filtering
 */
class FilterManager {
    constructor(app) {
        this.app = app;
    }

    async performSearch(query, tagFilter = '') {
        /**
         * Execute a search query against the backend
         */
        try {
            const searchParams = {};

            // Parse duration filter from query (format: duration:30-45)
            let searchQuery = query;
            if (query) {
                const durationMatch = query.match(/duration:\s*(\d+)\s*-\s*(\d+)/i);
                if (durationMatch) {
                    searchParams.duration_min = parseInt(durationMatch[1]);
                    searchParams.duration_max = parseInt(durationMatch[2]);
                    // Remove duration filter from search query
                    searchQuery = query.replace(/duration:\s*\d+\s*-\s*\d+/gi, '').trim();
                    console.log(`⏱️ Duration filter: ${searchParams.duration_min}s - ${searchParams.duration_max}s`);
                }
            }

            if (searchQuery) searchParams.q = searchQuery;
            if (tagFilter) searchParams.tags = tagFilter;

            // Only add category filter if not in "All Videos" mode
            if (this.app.currentCategory && this.app.currentCategory !== "_all") {
                searchParams.category = this.app.currentCategory;
            }

            // Add subcategory filter if we're in a specific subfolder
            if (this.app.currentSubcategory) {
                searchParams.subcategory = this.app.currentSubcategory;
            }

            const videos = await this.app.api.searchVideos(searchParams);

            // Apply folder filter if active (client-side filtering of search results)
            let filteredVideos = videos;
            if (this.app.currentFolderFilter && this.app.currentFolderFilter.length > 0) {
                filteredVideos = videos.filter(video => {
                    return this.app.currentFolderFilter.includes(video.category);
                });
                console.log(`🔍 Search results filtered by ${this.app.currentFolderFilter.length} folder(s): ${filteredVideos.length} videos match`);
            } else {
                console.log(`🔍 Search results from all folders: ${filteredVideos.length} videos`);
            }

            this.app.videos = filteredVideos;

            // Update the UI
            this.app.handleSearchResults(filteredVideos);

        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    filterByTag(tagName) {
        /**
         * Filter videos by tag and switch to tag results view
         */
        // Navigate to a separate tag results view instead of filtering in-place
        console.log(`🏷️ Filtering by tag: ${tagName}`);

        // Use the complete catalog for searching
        let searchSource = this.app.allVideosCatalog && this.app.allVideosCatalog.length > 0 ? this.app.allVideosCatalog : this.app.allVideos;

        if (!searchSource || searchSource.length === 0) {
            searchSource = this.app.allVideos;
        }

        // Filter videos containing this tag
        const tagVideos = searchSource.filter(video => {
            if (!video.tags) return false;
            return video.tags.some(tag => tag.name === tagName);
        });

        console.log(`📊 Found ${tagVideos.length} video(s) with tag: ${tagName}`);

        // Save current state for "back" button
        this.app.previousView = {
            view: this.app.currentView,
            videos: this.app.videos,
            currentCategory: this.app.currentCategory,
            currentSubcategory: this.app.currentSubcategory,
            currentSearch: this.app.currentSearch
        };

        // Hide main UI elements (using DOM cache or direct access)
        const listViewControls = document.getElementById('listViewControls');
        const folderExplorer = document.getElementById('folderExplorer');
        const videoGrid = document.getElementById('videoGrid');
        if (listViewControls) listViewControls.style.display = 'none';
        if (folderExplorer) folderExplorer.style.display = 'none';
        if (videoGrid) videoGrid.style.display = 'none';

        // Switch to tag results view
        this.app.currentView = 'searchResults';
        this.app.currentSearch = `Tag: ${tagName}`;

        // Use a container for search results
        const container = document.getElementById('searchResultsContainer');
        const header = document.getElementById('searchResultsHeader');
        const resultsGrid = document.getElementById('searchResultsGrid');

        if (container) container.classList.remove('hidden');
        if (header) header.textContent = `Tagged: ${tagName} (${tagVideos.length} items)`;

        // Show back button
        const backBtn = document.getElementById('backToExplorerBtn');
        if (backBtn) backBtn.classList.remove('hidden');

        // Render videos in results grid
        if (resultsGrid) {
            resultsGrid.innerHTML = '';
            tagVideos.forEach(video => {
                const card = this.app.createVideoCard(video);
                resultsGrid.appendChild(card);
            });
        }

        // Scroll to top
        window.scrollTo(0, 0);
    }
}

// Export for usage
window.FilterManager = FilterManager;
