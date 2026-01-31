/**
 * VideoOperationsModule - Handles video move, delete, and rename operations
 *
 * Manages:
 * - Move modal (single video and bulk operations)
 * - Folder autocomplete and suggestions
 * - Delete operations (soft delete and permanent delete)
 * - Rename modal with metadata editing (display name, filename, description, series/season/episode)
 * - Video data refresh and cache updates
 * - Smart path completion and folder navigation
 *
 * Usage:
 *   const videoOps = new VideoOperationsModule(app);
 *   videoOps.showMoveModal(videoId, videoName);
 *   await videoOps.deleteVideo(videoId, videoName);
 */

class VideoOperationsModule {
    constructor(app) {
        this.app = app;
        this.currentMoveVideo = null; // Currently selected video for move operation
    }

    // ============================================================================
    // MOVE MODAL - Display and folder selection
    // ============================================================================

    /**
     * Show move modal for single video (from context menu)
     * @param {number} videoId - Video ID to move
     * @param {string} videoName - Video name for display
     */
    showMoveModal(videoId, videoName) {
        this.app.hideVideoContextMenu();

        // Hide Duplicates Review View if active
        this.app.hideDuplicatesReviewIfActive();

        this.currentMoveVideo = { id: videoId, name: videoName };

        // Show the move modal
        document.getElementById('moveModal').style.display = 'flex';

        // Focus on folder input
        const folderInput = document.getElementById('folderInput');
        folderInput.value = '';
        folderInput.focus();

        // Setup autocomplete handlers
        this.setupFolderAutocomplete();

        // Populate initial suggestions
        this.updateFolderSuggestionsFiltered('');
    }

    /**
     * Show move modal for video player (from player menu)
     * @param {number} videoId - Video ID to move
     * @param {string} videoName - Video name for display
     */
    showMoveVideoPlayerModal(videoId, videoName) {
        this.currentMoveVideo = { id: videoId, name: videoName };

        // Get the video player modal element
        const videoPlayerModal = document.getElementById('videoPlayerModal');

        // Create move modal overlay
        const moveOverlay = document.createElement('div');
        moveOverlay.id = 'moveVideoPlayerOverlay';
        moveOverlay.className = 'move-player-overlay';

        moveOverlay.innerHTML = `
            <div class="move-player-content">
                <h3>Move Video</h3>
                <p>Select destination for: <strong>${this.app.escapeHtml(videoName)}</strong></p>
                <div id="moveFolderGrid" class="move-folder-grid"></div>
                <button class="btn btn-secondary" onclick="app.videoOps.hideMoveVideoPlayerModal()">Cancel</button>
            </div>
        `;

        videoPlayerModal.appendChild(moveOverlay);

        // Render folder grid
        this.renderMoveFolderGrid();
    }

    /**
     * Render folder grid for video player move modal
     * Filters folders with 3-15 character names for better UX
     */
    renderMoveFolderGrid() {
        const grid = document.getElementById('moveFolderGrid');
        if (!grid) return;

        const allFolders = this.getAllAvailableFolders();

        // Filter folders (3-15 chars) for cleaner UI
        const folders = allFolders.filter(f => f.path.length >= 3 && f.path.length <= 15);

        let html = '<div class="folder-grid-row">';
        folders.forEach(folder => {
            html += `
                <div class="folder-grid-item" onclick="app.videoOps.moveCurrentVideoToFolder('${folder.path}')">
                    📁 ${this.app.escapeHtml(folder.displayName)}
                </div>
            `;
        });
        html += '</div>';

        grid.innerHTML = html;
    }

    /**
     * Hide move modal (standard modal)
     */
    hideMoveModal() {
        document.getElementById('moveModal').style.display = 'none';
        document.getElementById('folderInput').value = '';
        this.currentMoveVideo = null;

        // Restore Duplicates Review View if it was hidden
        this.app.restoreDuplicatesReviewIfNeeded();
    }

    /**
     * Hide move modal (video player overlay)
     */
    hideMoveVideoPlayerModal() {
        const overlay = document.getElementById('moveVideoPlayerOverlay');
        if (overlay) {
            overlay.remove();
        }
        this.currentMoveVideo = null;
    }

    // ============================================================================
    // FOLDER AUTOCOMPLETE - Smart path completion
    // ============================================================================

    /**
     * Setup folder autocomplete with keyboard navigation
     */
    setupFolderAutocomplete() {
        const folderInput = document.getElementById('folderInput');

        // Remove existing event listeners to prevent duplicates
        folderInput.replaceWith(folderInput.cloneNode(true));
        const newFolderInput = document.getElementById('folderInput');

        // Add input event listener for autocomplete
        newFolderInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            this.updateFolderSuggestionsFiltered(query);
            this.showFolderPathPreview(query);
        });

        // Add keydown event listener for navigation
        newFolderInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.performMoveFromModal();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.app.navigateSuggestions('down', 'folder');
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.app.navigateSuggestions('up', 'folder');
            } else if (e.key === 'Tab') {
                // Auto-complete with first suggestion
                const firstSuggestion = document.querySelector('.folder-suggestion');
                if (firstSuggestion && e.target.value.trim()) {
                    e.preventDefault();
                    const path = firstSuggestion.dataset.path || firstSuggestion.textContent.replace(/^[📁📂➕🔗✨💭📝📍] /, '');
                    e.target.value = path;
                    this.updateFolderSuggestionsFiltered(path);
                }
            }
        });
    }

    /**
     * Show visual folder path preview with breadcrumb-style display
     * @param {string} path - Folder path to preview
     */
    showFolderPathPreview(path) {
        if (!path) return;

        // Create or update path preview
        let previewDiv = document.getElementById('folderPathPreview');
        if (!previewDiv) {
            previewDiv = document.createElement('div');
            previewDiv.id = 'folderPathPreview';
            previewDiv.className = 'folder-path-preview';
            const folderInput = document.getElementById('folderInput');
            folderInput.parentNode.appendChild(previewDiv);
        }

        const pathParts = path.split('/').filter(part => part.trim());
        if (pathParts.length === 0) {
            previewDiv.style.display = 'none';
            return;
        }

        // Build visual path representation
        let pathHtml = '<span class="path-label">📁 Path:</span> ';
        pathParts.forEach((part, index) => {
            const isLast = index === pathParts.length - 1;
            pathHtml += `<span class="path-part ${isLast ? 'path-final' : ''}">${part}</span>`;
            if (!isLast) {
                pathHtml += '<span class="path-separator">→</span>';
            }
        });

        previewDiv.innerHTML = pathHtml;
        previewDiv.style.display = 'block';
    }

    /**
     * Update folder suggestions based on query
     * @param {string} query - Search query
     */
    updateFolderSuggestionsFiltered(query = '') {
        const container = document.getElementById('folderSuggestionsList');

        // Get all available folder paths
        const allFolders = this.getAllAvailableFolders();

        // Filter folders based on query
        const filtered = allFolders.filter(folder =>
            folder.path.toLowerCase().includes(query.toLowerCase()) ||
            folder.displayName.toLowerCase().includes(query.toLowerCase())
        );

        // Sort by relevance (exact match first, then starts with, then contains)
        filtered.sort((a, b) => {
            const queryLower = query.toLowerCase();
            const aPath = a.path.toLowerCase();
            const bPath = b.path.toLowerCase();

            if (aPath === queryLower) return -1;
            if (bPath === queryLower) return 1;
            if (aPath.startsWith(queryLower) && !bPath.startsWith(queryLower)) return -1;
            if (bPath.startsWith(queryLower) && !aPath.startsWith(queryLower)) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        // Render suggestions
        container.innerHTML = '';

        // Add root option
        if ('root'.includes(query.toLowerCase()) || query === '') {
            const rootItem = this.createFolderSuggestionItem('_root', '(Root Folder)', '📁');
            container.appendChild(rootItem);
        }

        // Add filtered folders
        filtered.slice(0, 6).forEach(folder => {
            const item = this.createFolderSuggestionItem(
                folder.path,
                folder.displayName,
                folder.isCategory ? '📁' : '📂'
            );
            container.appendChild(item);
        });

        // Smart path completion suggestions
        if (query.trim()) {
            this.addSmartPathSuggestions(container, query, allFolders);
        }

        // Add "Create new folder" option if query doesn't match existing
        if (query.trim() && !allFolders.some(f => f.path === query.trim())) {
            const createItem = this.createFolderSuggestionItem(
                query.trim(),
                `Create "${query.trim()}"`,
                '➕',
                true
            );
            container.appendChild(createItem);
        }
    }

    /**
     * Add smart path suggestions for nested folders
     * @param {HTMLElement} container - Container element
     * @param {string} query - Current query
     * @param {Array} allFolders - All available folders
     */
    addSmartPathSuggestions(container, query, allFolders) {
        const queryParts = query.split('/');
        const basePath = queryParts.slice(0, -1).join('/');
        const lastPart = queryParts[queryParts.length - 1];

        // If we're typing a path with slashes, suggest extensions
        if (queryParts.length > 1 && basePath) {
            // Find folders that start with the base path
            const relatedFolders = allFolders.filter(folder =>
                folder.path.startsWith(basePath + '/') &&
                folder.path !== query
            );

            // Suggest completing the current path
            relatedFolders.slice(0, 3).forEach(folder => {
                const item = this.createFolderSuggestionItem(
                    folder.path,
                    `📍 ${folder.displayName}`,
                    '📂'
                );
                container.appendChild(item);
            });
        }
    }

    /**
     * Get all available folders from folder structure
     * @returns {Array} Array of folder objects {path, displayName, isCategory}
     */
    getAllAvailableFolders() {
        const folders = [];

        // Add main categories (top-level folders) from folderStructure
        const allFolders = this.app.folderStructure.all_folders || [];
        allFolders.forEach(category => {
            folders.push({
                path: category,
                displayName: category,
                isCategory: true
            });
        });

        // Subfolder support removed - API doesn't return subfolder data
        // If needed in future, add separate API call for subfolder discovery

        return folders;
    }

    /**
     * Create folder suggestion item with click handler
     * @param {string} path - Folder path
     * @param {string} displayName - Display name
     * @param {string} icon - Emoji icon
     * @param {boolean} isNew - Whether this is a "create new" option
     * @returns {HTMLElement} Folder suggestion element
     */
    createFolderSuggestionItem(path, displayName, icon, isNew = false) {
        const item = document.createElement('div');
        item.className = `tag folder-suggestion ${isNew ? 'new-folder' : ''}`;
        item.innerHTML = `${icon} ${displayName}`;
        item.dataset.path = path; // Store the actual path for easy access

        item.onclick = async () => {
            try {
                // Check if we have a video to move
                if (!this.currentMoveVideo || !this.currentMoveVideo.id) {
                    console.log('No video selected for move')
                    return;
                }

                const pathParts = path.includes('/') ? path.split('/') : [path];
                const targetCategory = pathParts[0];
                const targetSubcategory = pathParts.length > 1 ? pathParts.slice(1).join('/') : null;

                await this.apiMoveVideo(
                    this.currentMoveVideo.id,
                    targetCategory,
                    null,
                    targetSubcategory
                );

                this.hideMoveModal();
                console.log(`Video moved to ${displayName}`)

                // Smart refresh: remove video without resetting pagination
                this.removeVideoFromView(this.currentMoveVideo.id);

                // Only reload folder structure in explorer view at root level
                if (this.app.currentView === 'explorer' && !this.app.currentCategory) {
                    this.app.renderFolderExplorer();
                }

            } catch (err) {
                console.log(err.message || 'Move failed')
            }
        };

        return item;
    }

    /**
     * Update move suggestions (legacy inline move - for compatibility)
     * @param {string} query - Search query
     * @param {HTMLElement} container - Container element
     * @param {number} videoId - Video ID
     */
    updateMoveSuggestions(query, container, videoId) {
        const categories = ['_root', ...Object.keys(this.app.categories)];
        const filtered = categories.filter(cat =>
            cat !== this.app.currentCategory &&
            cat.toLowerCase().includes(query.toLowerCase())
        );

        container.innerHTML = '';
        filtered.slice(0, 5).forEach(cat => {
            const item = document.createElement('div');
            item.className = 'move-suggestion';
            item.textContent = cat === '_root' ? '(Root)' : cat;
            item.onclick = async () => {
                try {
                    await this.apiMoveVideo(videoId, cat, null);
                    this.app.hideInlineMoveSearch();
                } catch (err) {
                    console.log(err.message || 'Move failed')
                }
            };
            container.appendChild(item);
        });

        // Add "Create new folder" option if query doesn't match existing
        if (query.trim() && !categories.includes(query.trim())) {
            const createItem = document.createElement('div');
            createItem.className = 'move-suggestion create-new';
            createItem.textContent = `Create "${query.trim()}"`;
            createItem.onclick = async () => {
                try {
                    await this.apiMoveVideo(videoId, query.trim(), null);
                    this.app.hideInlineMoveSearch();
                } catch (err) {
                    console.log(err.message || 'Move failed')
                }
            };
            container.appendChild(createItem);
        }
    }

    // ============================================================================
    // MOVE OPERATIONS - Perform video moves
    // ============================================================================

    /**
     * Perform move operation from modal (handles both single and bulk moves)
     */
    async performMoveFromModal() {
        const folderInput = document.getElementById('folderInput');
        const moveBtn = document.getElementById('moveConfirmBtn');
        const folderPath = folderInput.value.trim() || '_root';

        // Parse the folder path to extract category and subcategory
        const pathParts = folderPath.includes('/') ? folderPath.split('/') : [folderPath];
        const targetCategory = pathParts[0];
        const targetSubcategory = pathParts.length > 1 ? pathParts.slice(1).join('/') : null;

        // Check if this is a bulk move (multiple videos selected)
        if (!this.currentMoveVideo && this.app.selectedVideos.size > 0) {
            // Bulk move mode
            await this.app.performBulkMove(targetCategory, targetSubcategory);
            return;
        }

        // Single video move mode - ensure currentMoveVideo is set
        if (!this.currentMoveVideo) {
            console.log('No video selected for move')
            return;
        }

        // Disable button and show loading state
        moveBtn.disabled = true;
        moveBtn.textContent = 'Moving...';

        try {
            await this.apiMoveVideo(
                this.currentMoveVideo.id,
                targetCategory,
                null,
                targetSubcategory
            );

            const displayPath = folderPath === '_root' ? 'root folder' : folderPath;
            console.log(`Video moved to ${displayPath}`)

            // Save video ID before clearing
            const movedVideoId = this.currentMoveVideo.id;
            this.hideMoveModal();

            // Smart refresh: remove video without resetting pagination
            this.removeVideoFromView(movedVideoId);

            // Only reload folder structure in explorer view at root level
            if (this.app.currentView === 'explorer' && !this.app.currentCategory) {
                this.app.renderFolderExplorer();
            }

        } catch (error) {
            console.error('Move failed:', error);
            console.log(`Failed to move video: ${error.message}`)
        } finally {
            // Reset button state
            moveBtn.disabled = false;
            moveBtn.textContent = 'Move';
        }
    }

    /**
     * Move video to folder (from player menu folder grid)
     * @param {string} folderName - Target folder name
     */
    async moveVideoToFolder(folderName) {
        if (!this.currentMoveVideo) {
            console.log('No video selected for move')
            return;
        }

        try {
            // Move the video
            await this.apiMoveVideo(this.currentMoveVideo.id, folderName, null);

            // Close the move overlay
            this.hideMoveVideoPlayerModal();

            // Get next video before closing player
            const currentVideo = this.app.getCurrentPlayingVideo();
            if (currentVideo) {
                const nextVideo = this.app.getNextVideo(currentVideo);

                // Close the video player
                this.app.closeVideoPlayer();

                // Remove the moved video from view
                this.removeVideoFromView(this.currentMoveVideo.id);

                // Play next video if available
                if (nextVideo) {
                    // Small delay to allow DOM updates
                    setTimeout(() => {
                        this.app.playVideo(nextVideo.id, nextVideo.name);
                    }, 100);
                } else {
                    console.log('No more videos in queue');
                }
            }

            console.log(`Video moved to ${folderName}`)

        } catch (error) {
            console.error('Error moving video:', error);
            console.log(`Failed to move video: ${error.message}`)
        }
    }

    /**
     * Move current video to folder (from player context menu)
     * @param {string} folderName - Target folder name
     */
    async moveCurrentVideoToFolder(folderName) {
        const currentVideo = this.app.getCurrentPlayingVideo();
        if (!currentVideo) {
            console.log('No video currently playing')
            return;
        }

        try {
            await this.apiMoveVideo(currentVideo.id, folderName, null);
            this.hideMoveVideoPlayerModal();
            console.log(`Video moved to ${folderName}`)
        } catch (error) {
            console.error('Error moving video:', error);
            console.log(`Failed to move video: ${error.message}`)
        }
    }

    /**
     * API call to move video to target folder
     * @param {number} videoId - Video ID
     * @param {string} targetCategory - Target category/folder
     * @param {string|null} newName - Optional new name
     * @param {string|null} targetSubcategory - Optional subcategory
     */
    async apiMoveVideo(videoId, targetCategory, newName = null, targetSubcategory = null) {
        try {
            const requestBody = { target_category: targetCategory };
            if (newName) requestBody.new_name = newName;
            if (targetSubcategory) requestBody.target_subcategory = targetSubcategory;

            const response = await fetch(`${this.app.apiBase}/api/videos/${videoId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('Video moved successfully:', result);

            // Update video in cache
            const video = this.app.videos.find(v => v.id === videoId) ||
                         this.app.allVideos.find(v => v.id === videoId);

            if (video) {
                video.category = targetCategory;
                if (targetSubcategory) video.subcategory = targetSubcategory;
                if (newName) video.name = newName;
            }

            return result;

        } catch (error) {
            console.error('Error moving video:', error);
            throw error;
        }
    }

    // ============================================================================
    // DELETE OPERATIONS - Soft delete and permanent delete
    // ============================================================================

    /**
     * Delete video from context menu (soft delete - moves to DELETE folder)
     */
    deleteVideoFromContext() {
        if (this.app.contextMenuVideoId && this.app.contextMenuVideoName) {
            this.deleteVideo(this.app.contextMenuVideoId, this.app.contextMenuVideoName);
            this.app.hideVideoContextMenu();
        }
    }

    /**
     * Soft delete video (move to DELETE folder)
     * @param {number} videoId - Video ID
     * @param {string} videoName - Video name for display
     */
    async deleteVideo(videoId, videoName) {
        try {
            const result = await this.app.api.deleteVideo(videoId);
            console.log('Video moved to DELETE folder:', result);

            // Remove video from current view
            this.app.videos = this.app.videos.filter(v => v.id !== videoId);
            this.app.allVideos = this.app.allVideos.filter(v => v.id !== videoId);

            // Re-render the grid
            document.getElementById('videoGrid').innerHTML = '';
            this.app.renderVideoGrid();

            // Reload scan status and fingerprint stats
            await this.app.loadScanStatus();


        } catch (error) {
            console.error('Error deleting video:', error);
            console.log(`❌ Failed to move video: ${error.message}`)
        }
    }

    /**
     * Permanently delete video (cannot be undone)
     * @param {number} videoId - Video ID
     * @param {string} videoName - Video name for display
     */
    async permanentDeleteVideo(videoId, videoName) {
        try {
            // Extra confirmation for permanent deletion using app modal
            const confirmed = await this.app.showConfirmModal(
                '⚠️ PERMANENT DELETION',
                `This will permanently delete:\n"${videoName}"\n\nThis action CANNOT be undone!\n\nAre you sure you want to continue?`
            );

            if (!confirmed) {
                return;
            }

            console.log(`Permanently deleting "${videoName}"...`)

            const result = await this.app.api.deletePermanent(videoId);
            console.log('Video permanently deleted:', result);

            console.log(`✅ "${videoName}" permanently deleted`)

            // Remove video from current view
            this.app.videos = this.app.videos.filter(v => v.id !== videoId);
            this.app.allVideos = this.app.allVideos.filter(v => v.id !== videoId);

            // Re-render the grid
            document.getElementById('videoGrid').innerHTML = '';
            this.app.renderVideoGrid();

            // Reload scan status and fingerprint stats
            await this.app.loadScanStatus();


        } catch (error) {
            console.error('Error permanently deleting video:', error);
            console.log(`❌ Failed to delete permanently: ${error.message}`)
        }
    }

    /**
     * Permanently delete video from context menu
     */
    permanentDeleteVideoFromContext() {
        if (this.app.contextMenuVideoId && this.app.contextMenuVideoName) {
            this.permanentDeleteVideo(this.app.contextMenuVideoId, this.app.contextMenuVideoName);
            this.app.hideVideoContextMenu();
        }
    }

    // ============================================================================
    // RENAME OPERATIONS - Edit video info and metadata
    // ============================================================================

    /**
     * Show rename/edit modal with video information
     * @param {number} videoId - Video ID
     * @param {string} videoName - Video filename
     * @param {string|null} displayName - Display name
     * @param {string|null} description - Video description
     */
    showRenameModal(videoId, videoName, displayName = null, description = null) {
        console.log('Opening edit video info modal for:', { videoId, videoName, displayName, description });
        this.app.hideVideoContextMenu();

        // Hide Duplicates Review View if active
        this.app.hideDuplicatesReviewIfActive();

        // Validate input parameters
        if (!videoId || !videoName) {
            console.error('Invalid parameters for edit modal:', { videoId, videoName });
            console.log('Error: Invalid video information')
            return;
        }

        // Find the video object to get all data
        const video = this.app.videos.find(v => v.id === videoId) || this.app.allVideos.find(v => v.id === videoId);

        // Store full video object for auto-format access to resolution
        this.app.currentRenameVideo = video || {
            id: videoId,
            name: videoName,
            display_name: displayName,
            description: description
        };

        // Update modal title
        document.getElementById('renameModalTitle').textContent = `Edit "${displayName || videoName}"`;

        // Populate video preview header
        this.populateRenameVideoPreview(this.app.currentRenameVideo);

        // Pre-fill display name (or default to filename without extension)
        const defaultDisplayName = this.app.currentRenameVideo.display_name || videoName.replace(/\.[^/.]+$/, "");
        document.getElementById('videoDisplayName').value = defaultDisplayName;

        // Pre-fill file name (without extension) and replace spaces with underscores
        const nameWithoutExt = videoName.replace(/\.[^/.]+$/, "");
        const nameWithUnderscores = nameWithoutExt.replace(/\s+/g, '_');
        document.getElementById('newVideoName').value = nameWithUnderscores;

        // Pre-fill description
        document.getElementById('videoDescription').value = this.app.currentRenameVideo.description || '';

        // Pre-fill enhanced metadata fields
        document.getElementById('videoSeries').value = video?.series || '';
        document.getElementById('videoSeason').value = video?.season || '';
        document.getElementById('videoEpisode').value = video?.episode || '';
        document.getElementById('videoYear').value = video?.year || '';
        document.getElementById('videoChannel').value = video?.channel || '';
        document.getElementById('videoRating').value = video?.rating || '';
        document.getElementById('videoFavorite').checked = video?.favorite || false;

        // Update rating stars visual
        this.app.seriesModule.updateRatingStars(video?.rating || 0);

        // Add rating input listener to update stars
        document.getElementById('videoRating').addEventListener('input', (e) => {
            this.app.seriesModule.updateRatingStars(parseFloat(e.target.value) || 0);
        });

        // Focus on display name input
        document.getElementById('videoDisplayName').focus();

        // Show modal
        document.getElementById('renameModal').style.display = 'flex';
    }

    /**
     * Hide rename modal and clear form
     */
    hideRenameModal() {
        console.log('Hiding edit video info modal');
        document.getElementById('renameModal').style.display = 'none';

        // Restore Duplicates Review View if it was hidden
        this.app.restoreDuplicatesReviewIfNeeded();

        // Clear form
        document.getElementById('videoDisplayName').value = '';
        document.getElementById('newVideoName').value = '';
        document.getElementById('videoDescription').value = '';

        // Clear enhanced metadata fields
        document.getElementById('videoSeries').value = '';
        document.getElementById('videoSeason').value = '';
        document.getElementById('videoEpisode').value = '';
        document.getElementById('videoYear').value = '';
        document.getElementById('videoChannel').value = '';
        document.getElementById('videoRating').value = '';
        document.getElementById('videoFavorite').checked = false;
        this.app.seriesModule.updateRatingStars(0);

        // Clear video reference
        setTimeout(() => {
            this.app.currentRenameVideo = null;
        }, 100);
    }

    /**
     * Rename video and update metadata
     */
    async renameVideo() {
        if (!this.app.currentRenameVideo || !this.app.currentRenameVideo.id) {
            console.error('No video selected for updating');
            console.log('Error: No video selected')
            return;
        }

        const displayName = document.getElementById('videoDisplayName').value.trim();
        const newName = document.getElementById('newVideoName').value.trim();
        const description = document.getElementById('videoDescription').value.trim();

        // At least one field must be provided
        if (!displayName && !newName && !description) {
            console.log('Please enter at least one field')
            return;
        }

        const confirmBtn = document.getElementById('confirmRenameBtn');
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Saving...';

        try {
            // Build request body - only include fields that changed
            const requestBody = {};

            // Only update display_name if it actually changed
            const currentDisplayName = this.app.currentRenameVideo.display_name || this.app.currentRenameVideo.name.replace(/\.[^/.]+$/, "");
            if (displayName && displayName !== currentDisplayName) {
                requestBody.display_name = displayName;
            }

            if (description !== (this.app.currentRenameVideo.description || '')) {
                requestBody.description = description;
            }

            // Check if filename actually changed (compare without spaces/underscores since we auto-convert)
            const currentNameWithoutExt = this.app.currentRenameVideo.name.replace(/\.[^/.]+$/, "");
            if (newName && newName !== currentNameWithoutExt && newName !== currentNameWithoutExt.replace(/\s+/g, '_')) {
                requestBody.new_name = newName;
            }

            // Enhanced metadata fields - get current video data
            const video = this.app.videos.find(v => v.id === this.app.currentRenameVideo.id) || this.app.allVideos.find(v => v.id === this.app.currentRenameVideo.id);

            // Series
            const series = document.getElementById('videoSeries').value.trim();
            if (series !== (video?.series || '')) {
                requestBody.series = series || null;
            }

            // Season
            const season = document.getElementById('videoSeason').value;
            const seasonNum = season ? parseInt(season) : null;
            if (seasonNum !== (video?.season || null)) {
                requestBody.season = seasonNum;
            }

            // Episode
            const episode = document.getElementById('videoEpisode').value.trim();
            if (episode !== (video?.episode || '')) {
                requestBody.episode = episode || null;
            }

            // Year
            const year = document.getElementById('videoYear').value;
            const yearNum = year ? parseInt(year) : null;
            if (yearNum !== (video?.year || null)) {
                requestBody.year = yearNum;
            }

            // Channel
            const channel = document.getElementById('videoChannel').value.trim();
            if (channel !== (video?.channel || '')) {
                requestBody.channel = channel || null;
            }

            // Rating
            const rating = document.getElementById('videoRating').value;
            const ratingNum = rating ? parseFloat(rating) : null;
            if (ratingNum !== (video?.rating || null)) {
                requestBody.rating = ratingNum;
            }

            // Favorite
            const favorite = document.getElementById('videoFavorite').checked;
            if (favorite !== (video?.favorite || false)) {
                requestBody.favorite = favorite;
            }

            const response = await fetch(`${window.CLIPPER_CONFIG.apiUrl}/videos/${this.app.currentRenameVideo.id}/update`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json();

                // Special handling for 409 Conflict (duplicate filename)
                if (response.status === 409) {
                    // Highlight the filename field
                    const filenameInput = document.getElementById('newVideoName');
                    if (filenameInput) {
                        filenameInput.style.borderColor = '#ef4444';
                        filenameInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)';
                        filenameInput.focus();

                        // Reset highlight after 3 seconds
                        setTimeout(() => {
                            filenameInput.style.borderColor = '';
                            filenameInput.style.boxShadow = '';
                        }, 3000);
                    }

                    throw new Error(errorData.detail || 'A video with this filename already exists in this folder');
                }

                throw new Error(errorData.detail || `HTTP ${response.status}`);
            }

            const result = await response.json();
            console.log('Video updated successfully:', result);

            this.hideRenameModal();
            console.log(`Video updated successfully`)

            // Update cached video data immediately to prevent playback issues
            this.updateVideoDataAfterRename(this.app.currentRenameVideo.id, result.video);

            // Update the video card in the DOM directly (without full re-render or view switch)
            this.app.updateVideoCardAfterRename(this.app.currentRenameVideo.id, result.video);

            // Auto-refresh metadata to update cache and display (without regenerating thumbnail)
            await this.app.refreshVideoMetadata(this.app.currentRenameVideo.id);

            // Refresh metadata suggestions cache (series, channel, year autocomplete)
            await this.app.loadMetadataSuggestions();

        } catch (error) {
            console.error('Error updating video:', error);
            console.log(`❌ ${error.message}`)
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Save';
        }
    }

    /**
     * Populate video preview in rename modal
     * @param {Object} video - Video object with metadata
     */
    populateRenameVideoPreview(video) {
        const previewContainer = document.getElementById('renameVideoPreview');
        if (!previewContainer) return;

        // Format season/episode badges (separate badges for modern look)
        let seasonEpisodeBadges = '';
        if (video.season || video.episode) {
            const badges = [];
            if (video.season) {
                badges.push(`<span class="video-season-badge">(S${String(video.season).padStart(2, '0')})</span>`);
            }
            if (video.episode) {
                // Check if episode is already formatted (e.g., "E01") or just a number
                const episodeDisplay = /^E\d+$/i.test(video.episode) ?
                    video.episode.toUpperCase() :
                    (video.episode.match(/^\d+$/) ? `E${String(video.episode).padStart(2, '0')}` : video.episode);
                badges.push(`<span class="video-episode-badge">(${episodeDisplay})</span>`);
            }
            seasonEpisodeBadges = badges.join(' ');
        }

        // Format channel badge (grey, no icon)
        const channelBadge = video.channel ?
            `<span class="video-channel-badge-grey">${this.app.escapeHtml(video.channel)}</span>` : '';

        // Format metadata
        const duration = video.duration ? this.app.formatDuration(video.duration) : 'N/A';
        const resolution = video.width && video.height ?
            this.app.formatResolution(video.width, video.height) : 'N/A';
        const fileSize = video.size ? this.app.formatSize(video.size) : 'N/A';

        // Thumbnail URL with cache busting
        const thumbnailUrl = video.thumbnail_url ?
            `${this.app.apiBase}${video.thumbnail_url}?t=${video.modified || Date.now()}&bustCache=${Math.random()}` :
            '';

        previewContainer.innerHTML = `
            <img src="${thumbnailUrl}" alt="${video.name}" class="rename-video-thumbnail"
                 onerror="this.style.display='none'">
            <div class="rename-video-info">
                <div class="rename-title-row">
                    <h3 class="rename-video-title">${this.app.escapeHtml(video.display_name || video.name)} ${seasonEpisodeBadges}</h3>
                    ${channelBadge}
                </div>
                <div class="rename-video-meta">
                    <span>⏱️ ${duration}</span>
                    <span>📺 ${resolution}</span>
                    <span>💾 ${fileSize}</span>
                </div>
            </div>
        `;
    }

    // ============================================================================
    // HELPER METHODS - Video management utilities
    // ============================================================================

    /**
     * Remove video from view without resetting pagination
     * @param {number} videoId - Video ID to remove
     */
    removeVideoFromView(videoId) {
        /**
         * Smart video removal: Remove video from view without resetting pagination
         * Preserves scroll position and current page state
         */
        // Validate videoId
        if (videoId === null || videoId === undefined) {
            console.error('❌ removeVideoFromView called with null/undefined videoId');
            return;
        }

        // Remove from both arrays
        this.app.videos = this.app.videos.filter(v => v && v.id !== videoId);
        this.app.allVideos = this.app.allVideos.filter(v => v && v.id !== videoId);
        this.app.displayedVideos = this.app.displayedVideos.filter(v => v && v.id !== videoId);

        // Remove the video card from DOM
        const videoCard = document.querySelector(`[data-video-id="${videoId}"]`);
        if (videoCard) {
            videoCard.remove();
        }

        // If we're on a page beyond the first and now have fewer videos,
        // adjust currentPage if needed to avoid empty pages
        const totalPages = Math.ceil(this.app.videos.length / this.app.VIDEOS_PER_PAGE);
        if (this.app.currentPage >= totalPages && totalPages > 0) {
            this.app.currentPage = totalPages - 1;
        }

        // Update the load more button visibility
        this.app.updateLoadMoreButton();

        console.log(`✅ Removed video ${videoId} from view (pagination preserved)`);
    }

    /**
     * Refresh video data (regenerate thumbnail, fetch metadata, update cache)
     * @param {number} videoId - Video ID to refresh
     */
    async refreshVideo(videoId) {
        try {
            console.log(`🔄 Refreshing video data for video ${videoId}...`);

            // Step 1: Regenerate thumbnail
            const thumbnailResponse = await fetch(`${this.app.apiBase}/api/thumbnails/generate/${videoId}`, {
                method: 'POST'
            });

            if (!thumbnailResponse.ok) {
                console.warn('Failed to regenerate thumbnail, continuing...');
            }

            // Step 2: Fetch fresh video data with all metadata (tags, actors, faces)
            const videoResponse = await fetch(`${this.app.apiBase}/api/videos/${videoId}`);

            if (!videoResponse.ok) {
                throw new Error('Failed to fetch video data');
            }

            const freshVideoData = await videoResponse.json();

            // Step 3: Update video in memory (both arrays)
            const cacheBuster = Date.now();
            const randomBuster = Math.random();

            // Add cache busting to thumbnail URL
            if (freshVideoData.thumbnail_url) {
                const baseThumbnailUrl = freshVideoData.thumbnail_url.split('?')[0];
                freshVideoData.thumbnail_url = `${baseThumbnailUrl}?t=${cacheBuster}&bust=${randomBuster}`;
            }

            // Update in this.videos array
            const videoIndex = this.app.videos.findIndex(v => v.id === videoId);
            if (videoIndex !== -1) {
                this.app.videos[videoIndex] = freshVideoData;
            }

            // Update in this.allVideos array
            const allVideoIndex = this.app.allVideos.findIndex(v => v.id === videoId);
            if (allVideoIndex !== -1) {
                this.app.allVideos[allVideoIndex] = freshVideoData;
            }

            // Step 4: Update the video card in the DOM
            const videoCard = document.querySelector(`.video-card[data-video-id="${videoId}"]`);
            if (videoCard) {
                // Replace the entire card with fresh data
                const newCard = this.app.createVideoCard(freshVideoData);
                videoCard.replaceWith(newCard);
            }

            // Step 5: Update any other DOM elements (thumbnails, bulk edit, etc.)
            const thumbnailElements = document.querySelectorAll(`img[data-video-id="${videoId}"]`);
            thumbnailElements.forEach(img => {
                if (freshVideoData.thumbnail_url) {
                    img.src = freshVideoData.thumbnail_url;
                }
            });

            // Update bulk edit card if it exists
            const bulkEditCard = document.querySelector(`.bulk-edit-card[data-video-id="${videoId}"]`);
            if (bulkEditCard) {
                const videoInBulkEdit = this.app.bulkEditVideos?.find(v => v.id === videoId);
                if (videoInBulkEdit) {
                    // Update the bulk edit video data
                    Object.assign(videoInBulkEdit, freshVideoData);
                    videoInBulkEdit._originalData = { ...freshVideoData };
                }
            }

            console.log(`✅ Video ${videoId} refreshed with latest data`);

        } catch (error) {
            console.error('Error refreshing video:', error);
        }
    }

    /**
     * Update cached video data after rename operation
     * @param {number} videoId - Video ID
     * @param {Object} updatedVideoData - Updated video data from server
     */
    updateVideoDataAfterRename(videoId, updatedVideoData) {
        console.log('Updating cached video data after rename:', { videoId, updatedVideoData });
        let cacheUpdated = false;

        // Update in allVideos array
        if (this.app.allVideos) {
            const video = this.app.allVideos.find(v => v.id === videoId);
            if (video) {
                // Update all the fields that could affect streaming
                video.name = updatedVideoData.name;
                video.path = updatedVideoData.path;
                video.relative_path = updatedVideoData.relative_path;
                video.category = updatedVideoData.category;
                video.subcategory = updatedVideoData.subcategory;
                video.extension = updatedVideoData.extension;
                video.size = updatedVideoData.size;
                video.modified = updatedVideoData.modified;
                console.log('Updated allVideos cache for video:', videoId);
                cacheUpdated = true;
            }
        }

        // Update in videos array
        if (this.app.videos) {
            const video = this.app.videos.find(v => v.id === videoId);
            if (video) {
                // Update all the fields that could affect streaming
                video.name = updatedVideoData.name;
                video.path = updatedVideoData.path;
                video.relative_path = updatedVideoData.relative_path;
                video.category = updatedVideoData.category;
                video.subcategory = updatedVideoData.subcategory;
                video.extension = updatedVideoData.extension;
                video.size = updatedVideoData.size;
                video.modified = updatedVideoData.modified;
                console.log('Updated videos cache for video:', videoId);
                cacheUpdated = true;
            }
        }

        if (!cacheUpdated) {
            console.warn('Could not update cached video data after rename for videoId:', videoId);
        }
    }
}

// Export as global for use in app.js
window.VideoOperationsModule = VideoOperationsModule;
