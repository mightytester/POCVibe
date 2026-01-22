/**
 * BulkOperationsModule - Multi-select bulk operations on videos
 * Handles bulk tagging, moving, deleting, and other batch operations
 * Provides UI for selection management and bulk action execution
 */
class BulkOperationsModule {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.dom = app.dom;

        // Selection state
        this.selectedVideos = new Set();
        this.selectionMode = false;
    }

    // ============ Selection Management ============

    toggleSelectionMode() {
        this.selectionMode = !this.selectionMode;

        if (!this.selectionMode) {
            this.clearSelection();
        }

        this.updateUI();
    }

    selectVideo(videoId) {
        this.selectedVideos.add(videoId);
        this.updateSelectionUI();
    }

    deselectVideo(videoId) {
        this.selectedVideos.delete(videoId);
        this.updateSelectionUI();
    }

    toggleVideoSelection(videoId) {
        if (this.selectedVideos.has(videoId)) {
            this.deselectVideo(videoId);
        } else {
            this.selectVideo(videoId);
        }
    }

    selectAll() {
        const videos = this.app.videos || [];
        videos.forEach(video => this.selectedVideos.add(video.id));
        this.updateSelectionUI();
    }

    clearSelection() {
        this.selectedVideos.clear();
        this.updateSelectionUI();
    }

    isSelected(videoId) {
        return this.selectedVideos.has(videoId);
    }

    getSelectedCount() {
        return this.selectedVideos.size;
    }

    getSelectedVideos() {
        const videos = this.app.videos || [];
        return videos.filter(video => this.selectedVideos.has(video.id));
    }

    // ============ UI Updates ============

    updateSelectionUI() {
        // Update video cards
        const videoCards = document.querySelectorAll('.video-card');
        videoCards.forEach(card => {
            const videoId = parseInt(card.dataset.videoId);
            if (this.selectedVideos.has(videoId)) {
                card.classList.add('selected');
            } else {
                card.classList.remove('selected');
            }
        });

        // Update selection counter
        this.updateSelectionCounter();

        // Update bulk action buttons
        this.updateBulkActionButtons();
    }

    updateSelectionCounter() {
        let counter = document.getElementById('selectionCounter');
        if (!counter && this.selectedVideos.size > 0) {
            counter = document.createElement('div');
            counter.id = 'selectionCounter';
            counter.className = 'selection-counter';
            document.body.appendChild(counter);
        }

        if (counter) {
            if (this.selectedVideos.size > 0) {
                counter.textContent = `${this.selectedVideos.size} selected`;
                counter.style.display = 'block';
            } else {
                counter.style.display = 'none';
            }
        }
    }

    updateBulkActionButtons() {
        const hasSelection = this.selectedVideos.size > 0;
        const buttons = document.querySelectorAll('.bulk-action-btn');
        buttons.forEach(btn => {
            btn.disabled = !hasSelection;
        });
    }

    updateUI() {
        // Toggle selection mode visual indicators
        const videoGrid = document.querySelector('.video-grid');
        if (videoGrid) {
            if (this.selectionMode) {
                videoGrid.classList.add('selection-mode');
            } else {
                videoGrid.classList.remove('selection-mode');
            }
        }
    }

    // ============ Bulk Add Tag ============

    async showBulkAddTagModal() {
        if (this.selectedVideos.size === 0) {
            alert('Please select videos first');
            return;
        }

        try {
            const tags = await this.api.getTags();

            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <h2>Add Tag to ${this.selectedVideos.size} Video(s)</h2>
                    <div class="tags-list">
                        ${tags.map(tag => `
                            <button class="tag-option" data-tag-id="${tag.id}" style="background-color: ${tag.color}">
                                ${tag.name}
                            </button>
                        `).join('')}
                    </div>
                    <div class="modal-actions">
                        <button id="createNewTagBtn" class="btn-secondary">Create New Tag</button>
                        <button id="cancelBulkTagBtn" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Tag selection
            modal.querySelectorAll('.tag-option').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const tagId = parseInt(btn.dataset.tagId);
                    await this.bulkAddTag(tagId);
                    document.body.removeChild(modal);
                });
            });

            modal.querySelector('#createNewTagBtn').addEventListener('click', () => {
                document.body.removeChild(modal);
                this.showCreateTagModal(true);
            });

            modal.querySelector('#cancelBulkTagBtn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        } catch (error) {
            console.error('Failed to load tags:', error);
            alert('Failed to load tags: ' + error.message);
        }
    }

    async bulkAddTag(tagId) {
        const selectedVideos = Array.from(this.selectedVideos);
        let successCount = 0;
        let failCount = 0;

        for (const videoId of selectedVideos) {
            try {
                await this.api.addTagToVideo(videoId, tagId);
                successCount++;
            } catch (error) {
                console.error(`Failed to add tag to video ${videoId}:`, error);
                failCount++;
            }
        }

        alert(`Tag added to ${successCount} video(s). ${failCount} failed.`);

        // Refresh video display
        if (this.app && typeof this.app.refreshCurrentView === 'function') {
            await this.app.refreshCurrentView();
        }
    }

    async showCreateTagModal(isBulk = false) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Create New Tag</h2>
                <input type="text" id="newTagName" placeholder="Tag name" class="form-input">
                <input type="color" id="newTagColor" value="#3b82f6" class="form-input">
                <div class="modal-actions">
                    <button id="confirmCreateTagBtn" class="btn-primary">Create</button>
                    <button id="cancelCreateTagBtn" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const nameInput = modal.querySelector('#newTagName');
        const colorInput = modal.querySelector('#newTagColor');
        nameInput.focus();

        modal.querySelector('#confirmCreateTagBtn').addEventListener('click', async () => {
            const name = nameInput.value.trim();
            const color = colorInput.value;

            if (!name) {
                alert('Please enter a tag name');
                return;
            }

            try {
                const result = await this.api.createTag(name, color);
                document.body.removeChild(modal);

                if (isBulk) {
                    await this.bulkAddTag(result.tag_id);
                }
            } catch (error) {
                console.error('Failed to create tag:', error);
                alert('Failed to create tag: ' + error.message);
            }
        });

        modal.querySelector('#cancelCreateTagBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    // ============ Bulk Move ============

    async showBulkMoveModal() {
        if (this.selectedVideos.size === 0) {
            alert('Please select videos first');
            return;
        }

        try {
            const structure = await this.api.getFolderStructure();
            const folders = structure.all_folders || [];

            const modal = document.createElement('div');
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content">
                    <h2>Move ${this.selectedVideos.size} Video(s)</h2>
                    <select id="targetFolderSelect" class="form-select">
                        <option value="">Select folder...</option>
                        ${folders.map(folder => `
                            <option value="${folder}">${folder}</option>
                        `).join('')}
                    </select>
                    <div class="modal-actions">
                        <button id="confirmBulkMoveBtn" class="btn-primary">Move</button>
                        <button id="cancelBulkMoveBtn" class="btn-secondary">Cancel</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            modal.querySelector('#confirmBulkMoveBtn').addEventListener('click', async () => {
                const targetFolder = modal.querySelector('#targetFolderSelect').value;

                if (!targetFolder) {
                    alert('Please select a target folder');
                    return;
                }

                document.body.removeChild(modal);
                await this.bulkMoveVideos(targetFolder);
            });

            modal.querySelector('#cancelBulkMoveBtn').addEventListener('click', () => {
                document.body.removeChild(modal);
            });
        } catch (error) {
            console.error('Failed to load folders:', error);
            alert('Failed to load folders: ' + error.message);
        }
    }

    async bulkMoveVideos(targetCategory) {
        const selectedVideos = Array.from(this.selectedVideos);
        let successCount = 0;
        let failCount = 0;

        for (const videoId of selectedVideos) {
            try {
                await this.api.moveVideo(videoId, targetCategory);
                successCount++;
            } catch (error) {
                console.error(`Failed to move video ${videoId}:`, error);
                failCount++;
            }
        }

        alert(`Moved ${successCount} video(s). ${failCount} failed.`);

        this.clearSelection();

        // Refresh video display
        if (this.app && typeof this.app.refreshCurrentView === 'function') {
            await this.app.refreshCurrentView();
        }
    }

    // ============ Bulk Delete ============

    async bulkDeleteVideos() {
        if (this.selectedVideos.size === 0) {
            alert('Please select videos first');
            return;
        }

        const currentFolder = this.app.currentCategory;
        const isPermanent = currentFolder === 'DELETE';

        const confirmMessage = isPermanent
            ? `PERMANENTLY DELETE ${this.selectedVideos.size} video(s)? This cannot be undone!`
            : `Move ${this.selectedVideos.size} video(s) to DELETE folder?`;

        if (!confirm(confirmMessage)) {
            return;
        }

        const selectedVideos = Array.from(this.selectedVideos);
        let successCount = 0;
        let failCount = 0;

        for (const videoId of selectedVideos) {
            try {
                if (isPermanent) {
                    await this.api.deletePermanent(videoId);
                } else {
                    await this.api.deleteVideo(videoId);
                }
                successCount++;
            } catch (error) {
                console.error(`Failed to delete video ${videoId}:`, error);
                failCount++;
            }
        }

        const action = isPermanent ? 'Permanently deleted' : 'Moved to DELETE';
        alert(`${action} ${successCount} video(s). ${failCount} failed.`);

        this.clearSelection();

        // Refresh video display
        if (this.app && typeof this.app.refreshCurrentView === 'function') {
            await this.app.refreshCurrentView();
        }
    }

    // ============ Bulk Extract Metadata ============

    async bulkExtractMetadata() {
        if (this.selectedVideos.size === 0) {
            alert('Please select videos first');
            return;
        }

        if (!confirm(`Extract metadata for ${this.selectedVideos.size} video(s)?`)) {
            return;
        }

        const selectedVideos = Array.from(this.selectedVideos);
        let successCount = 0;
        let failCount = 0;

        for (const videoId of selectedVideos) {
            try {
                await this.api.extractMetadata(videoId);
                successCount++;
            } catch (error) {
                console.error(`Failed to extract metadata for video ${videoId}:`, error);
                failCount++;
            }
        }

        alert(`Extracted metadata for ${successCount} video(s). ${failCount} failed.`);

        // Refresh video display
        if (this.app && typeof this.app.refreshCurrentView === 'function') {
            await this.app.refreshCurrentView();
        }
    }

    // ============ Bulk Generate Thumbnails ============

    async bulkGenerateThumbnails() {
        if (this.selectedVideos.size === 0) {
            alert('Please select videos first');
            return;
        }

        if (!confirm(`Generate thumbnails for ${this.selectedVideos.size} video(s)?`)) {
            return;
        }

        const selectedVideos = Array.from(this.selectedVideos);
        let successCount = 0;
        let failCount = 0;

        for (const videoId of selectedVideos) {
            try {
                await this.api.generateThumbnail(videoId);
                successCount++;
            } catch (error) {
                console.error(`Failed to generate thumbnail for video ${videoId}:`, error);
                failCount++;
            }
        }

        alert(`Generated thumbnails for ${successCount} video(s). ${failCount} failed.`);

        // Refresh video display
        if (this.app && typeof this.app.refreshCurrentView === 'function') {
            await this.app.refreshCurrentView();
        }
    }

    // ============ Bulk Generate Fingerprints ============

    async bulkGenerateFingerprints() {
        if (this.selectedVideos.size === 0) {
            alert('Please select videos first');
            return;
        }

        if (!confirm(`Generate fingerprints for ${this.selectedVideos.size} video(s)?`)) {
            return;
        }

        const selectedVideos = Array.from(this.selectedVideos);
        let successCount = 0;
        let failCount = 0;

        for (const videoId of selectedVideos) {
            try {
                await this.api.generateFingerprint(videoId);
                successCount++;
            } catch (error) {
                console.error(`Failed to generate fingerprint for video ${videoId}:`, error);
                failCount++;
            }
        }

        alert(`Generated fingerprints for ${successCount} video(s). ${failCount} failed.`);
    }
}

// Export as global
window.BulkOperationsModule = BulkOperationsModule;
