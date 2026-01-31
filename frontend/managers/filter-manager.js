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
            if (this.app.currentCategory && this.app.currentCategory !== "_all") {
                params.append('category', this.app.currentCategory);
            }

            // Add subcategory filter if we're in a specific subfolder
            if (this.app.currentSubcategory) {
                params.append('subcategory', this.app.currentSubcategory);
            }

            const response = await fetch(`${this.app.apiBase}/search?${params}`);
            let videos = await response.json();

            // Apply folder filter if active (client-side filtering of search results)
            // For search/tag filters: folder filter acts as additional constraint
            // Empty folder filter = search all folders (don't constrain)
            if (this.app.currentFolderFilter && this.app.currentFolderFilter.length > 0) {
                videos = videos.filter(video => {
                    return this.app.currentFolderFilter.includes(video.category);
                });
                console.log(`🔍 Search results filtered by ${this.app.currentFolderFilter.length} folder(s): ${videos.length} videos match`);
            } else {
                console.log(`🔍 Search results from all folders: ${videos.length} videos`);
            }

            this.app.videos = videos;
            document.getElementById('videoGrid').innerHTML = '';
            this.app.renderVideoGrid();
        } catch (error) {
            console.log('Search failed', error);
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
        this.app.currentView = 'tag-results';
        this.app.videos = tagVideos;
        this.app.currentTagFilter = tagName;

        // Render tag results view with back button
        this.renderTagResultsView(tagName);

        console.log(`🏷️ Found ${tagVideos.length} video(s) with "${tagName}"`);
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
                            Found ${this.app.videos.length} video${this.app.videos.length !== 1 ? 's' : ''}
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
            this.app.videos.forEach(video => {
                const card = this.app.createVideoCard(video);
                fragment.appendChild(card);
            });
            resultsGrid.appendChild(fragment);
        }
    }

    filterByActor(actorName) {
        // TODO: Implement actor filtering (similar to tag filtering)
        console.log('Filter by actor:', actorName);
        console.log(`Filtering by actor: ${actorName} (coming soon)`);
    }

    clearFilters() {
        /**
         * Clear all active filters and reset view
         */
        // Dismiss all active toast notifications
        if (this.app.dismissAllToasts) this.app.dismissAllToasts();

        // Clear search input
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.value = '';
        this.app.currentSearchQuery = '';

        // Clear tag filter
        const tagFilter = document.getElementById('tagFilter');
        if (tagFilter) tagFilter.value = '';
        this.app.currentTagFilter = '';

        // Clear ALL metadata filters
        const filters = ['seriesFilter', 'yearFilter', 'channelFilter', 'ratingFilter'];
        filters.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });

        // Reset filter state variables in app
        this.app.currentSeriesFilter = '';
        this.app.currentYearFilter = '';
        this.app.currentChannelFilter = '';
        this.app.currentRatingFilter = '';

        const favFilter = document.getElementById('favoriteFilter');
        if (favFilter) favFilter.checked = false;
        this.app.currentFavoriteFilter = false;

        // Select ALL folders (opposite of the default empty state)
        // Get all folders from structure, or extract from cached videos if available
        let allFolders = this.app.folderStructure?.all_folders || [];
        if (allFolders.length === 0 && this.app.allVideosCatalog && this.app.allVideosCatalog.length > 0) {
            // Extract unique folder names from cached videos
            const folderSet = new Set(this.app.allVideosCatalog.map(v => v.category).filter(Boolean));
            allFolders = Array.from(folderSet);
            console.log(`📂 Extracted ${allFolders.length} folders from cached videos`);
        }
        this.app.currentFolderFilter = [...allFolders];

        // Update checkboxes
        const checkboxes = document.querySelectorAll('#folderFilterList input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = true);
        const selectAll = document.getElementById('selectAllFolders');
        if (selectAll) selectAll.checked = true;

        if (this.app.updateFolderFilterButton) this.app.updateFolderFilterButton();

        // Load correct view based on current view mode
        if (this.app.currentView === 'list') {
            // Collection View: Show all videos without folder filtering
            if (this.app.showAllVideosInCollection) this.app.showAllVideosInCollection();
        } else {
            // Explorer View: Load "All Videos" category
            if (this.app.loadCategory) this.app.loadCategory('_all');
        }

        // Save cleared state to localStorage
        if (this.app.saveSettingsToStorage) this.app.saveSettingsToStorage();
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.FilterManager = FilterManager;
