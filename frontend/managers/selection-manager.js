/**
 * SelectionManager - Manages video selection and bulk action state
 */
class SelectionManager {
    constructor(app) {
        this.app = app;
    }

    toggleVideoSelection(videoId) {
        /**
         * Toggle selection state of a video and update UI
         */
        // Validate videoId
        if (videoId === null || videoId === undefined) {
            console.error('❌ toggleVideoSelection called with null/undefined videoId');
            return;
        }

        if (this.app.selectedVideos.has(videoId)) {
            this.app.selectedVideos.delete(videoId);
        } else {
            this.app.selectedVideos.add(videoId);
        }

        // Update the card's selected state
        const card = document.querySelector(`[data-video-id="${videoId}"]`);
        if (card) {
            if (this.app.selectedVideos.has(videoId)) {
                card.classList.add('selected');
                // Check the checkbox
                const checkbox = card.querySelector('.video-selection-checkbox input');
                if (checkbox) checkbox.checked = true;
            } else {
                card.classList.remove('selected');
                // Uncheck the checkbox
                const checkbox = card.querySelector('.video-selection-checkbox input');
                if (checkbox) checkbox.checked = false;
            }
        }

        this.updateBulkActionsBar();
    }

    updateBulkActionsBar() {
        /**
         * Update visibility and count of the lower bulk actions bar
         */
        const bar = document.getElementById('bulkActionsBar');
        const count = document.getElementById('selectionCount');

        if (!bar || !count) return;

        if (this.app.selectedVideos.size > 0) {
            bar.style.display = 'block';
            count.textContent = `${this.app.selectedVideos.size} selected`;
        } else {
            bar.style.display = 'none';
        }
    }

    selectAllVideos() {
        /**
         * Select all currently visible videos
         */
        // Filter out null videos and those without IDs
        const validVideos = this.app.videos.filter(video => video && video.id !== null && video.id !== undefined);

        validVideos.forEach(video => {
            this.app.selectedVideos.add(video.id);
        });

        // Clean up the videos array if we found null entries
        if (validVideos.length < this.app.videos.length) {
            console.warn(`⚠️ Found ${this.app.videos.length - validVideos.length} null/invalid videos in array, cleaning up...`);
            this.app.videos = validVideos;
        }

        this.app.renderVideoGrid();
        this.updateBulkActionsBar();
    }

    deselectAllVideos() {
        /**
         * Clear all selections
         */
        this.app.selectedVideos.clear();
        this.app.renderVideoGrid();
        this.updateBulkActionsBar();
    }

    cancelSelection() {
        /**
         * Exit selection mode and clear selections
         */
        this.app.selectionMode = false;
        this.app.selectedVideos.clear();

        const videoGrid = document.getElementById('videoGrid');
        if (videoGrid) {
            videoGrid.classList.remove('selection-mode');
        }

        this.app.renderVideoGrid();
        this.updateBulkActionsBar();

        // Update menu toggle switch if it exists
        this.app.updateSelectionModeRadio();
    }
}

window.SelectionManager = SelectionManager;
