/**
 * MenuManager - Handles Actions Menu and Sort Submenu UI logic
 */
class MenuManager {
    constructor(app) {
        this.app = app;
    }

    // ==================== ACTIONS MENU METHODS ====================

    toggleActionsMenu() {
        const menu = document.getElementById('actionsMenu');
        if (!menu) return;

        if (menu.style.display === 'none') {
            this.showActionsMenu();
        } else {
            this.hideActionsMenu();
        }
    }

    showActionsMenu() {
        const menu = document.getElementById('actionsMenu');
        if (!menu) return;

        menu.style.display = 'block';
        this.updateMenuInfo();

        // Sync toggles if methods exist on app
        if (this.app.updateSelectionModeRadio) this.app.updateSelectionModeRadio();
        if (this.app.updateVerticalModeRadio) this.app.updateVerticalModeRadio();
    }

    hideActionsMenu() {
        const menu = document.getElementById('actionsMenu');
        if (!menu) return;

        menu.style.display = 'none';
        this.hideSortSubmenu();
    }

    // ==================== SORT SUBMENU METHODS ====================

    toggleSortSubmenu() {
        const submenu = document.getElementById('sortSubmenu');
        if (!submenu) return;

        if (submenu.style.display === 'none') {
            this.showSortSubmenu();
        } else {
            this.hideSortSubmenu();
        }
    }

    showSortSubmenu() {
        const submenu = document.getElementById('sortSubmenu');
        const arrow = document.getElementById('sortSubmenuArrow');
        if (!submenu) return;

        submenu.style.display = 'block';
        if (arrow) arrow.classList.add('open');
        this.updateSortSubmenuSelection();
    }

    hideSortSubmenu() {
        const submenu = document.getElementById('sortSubmenu');
        const arrow = document.getElementById('sortSubmenuArrow');
        if (submenu) submenu.style.display = 'none';
        if (arrow) arrow.classList.remove('open');
    }

    updateSortSubmenuSelection() {
        // Highlight the currently selected sort option
        document.querySelectorAll('.actions-submenu-item').forEach(item => {
            const sortValue = item.getAttribute('data-sort');
            if (sortValue === this.app.currentSort) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    applySortOption(sortValue) {
        this.app.currentSort = sortValue;

        if (this.app.applySorting) this.app.applySorting();
        if (this.app.saveSettingsToStorage) this.app.saveSettingsToStorage();

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
        if (sortLabel) sortLabel.textContent = sortNames[sortValue] || 'Random';

        // Also update the standalone dropdown if it exists
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.value = sortValue;
        }
    }

    // ==================== INFO & STATS ====================

    async updateMenuInfo() {
        // Update mode info
        try {
            const modeResults = await this.app.api.getModeInfo();
            const modeInfoEl = document.getElementById('menuModeInfo');
            if (modeInfoEl) modeInfoEl.textContent = modeResults.local_mode_enabled ? 'Local' : 'Stream';

            if (this.app.updateVideoAccessMode) {
                this.app.updateVideoAccessMode(modeResults.local_mode_enabled);
            }
        } catch (error) {
            console.error('Error fetching mode info:', error);
        }

        // Update thumbnail cache info
        try {
            const thumbData = await this.app.api.getThumbnailStats();
            const thumbInfoEl = document.getElementById('menuThumbnailInfo');
            if (thumbInfoEl) thumbInfoEl.textContent = `${thumbData.thumbnail_count} (${thumbData.cache_size_mb.toFixed(1)} MB)`;

            if (this.app.updateThumbnailStats) {
                this.app.updateThumbnailStats(thumbData);
            }
        } catch (error) {
            console.error('Error fetching thumbnail stats:', error);
        }

        // Update fingerprint library info
        try {
            const fingerprintData = await this.app.api.getFingerprintStats();
            const fingerprintInfoEl = document.getElementById('menuFingerprintInfo');
            if (fingerprintInfoEl) {
                fingerprintInfoEl.innerHTML = `
                    <span class="info-label">Library:</span>
                    <span>${fingerprintData.fingerprinted} / ${fingerprintData.total_videos} (${fingerprintData.coverage_percent}%)</span>
                `;
            }

            if (this.app.updateFingerprintStats) {
                this.app.updateFingerprintStats(fingerprintData);
            }
        } catch (error) {
            console.error('Error fetching fingerprint stats:', error);
        }
    }

    setupEventListeners() {
        // Actions menu button
        const menuBtn = document.getElementById('actionsMenuBtn');
        if (menuBtn) {
            menuBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleActionsMenu();
            };
        }

        // Sort menu interaction
        const sortBtn = document.getElementById('menuSortBtn');
        if (sortBtn) {
            sortBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleSortSubmenu();
            };
        }

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

        // View menu items in Actions Menu
        const collectionBtn = document.getElementById('menuCollectionViewBtn');
        if (collectionBtn) {
            collectionBtn.onclick = () => {
                this.app.switchView('list');
                this.hideActionsMenu();
            };
        }

        const seriesBtn = document.getElementById('menuSeriesViewBtn');
        if (seriesBtn) {
            seriesBtn.onclick = () => {
                this.app.switchView('series');
                this.hideActionsMenu();
            };
        }

        // Toggles and Actions
        const selectionBtn = document.getElementById('menuSelectionModeBtn');
        if (selectionBtn) {
            selectionBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.toggleSelectionMode();
            };
        }

        const verticalBtn = document.getElementById('menuVerticalModeBtn');
        if (verticalBtn) {
            verticalBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.toggleVerticalMode();
            };
        }

        const manageTagsBtn = document.getElementById('menuManageTagsBtn');
        if (manageTagsBtn) {
            manageTagsBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showTagManagerView();
            };
        }

        const faceCatalogBtn = document.getElementById('menuFaceCatalogBtn');
        if (faceCatalogBtn) {
            faceCatalogBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showFaceCatalogView();
            };
        }

        const mergeFacesBtn = document.getElementById('menuMergeFacesBtn');
        if (mergeFacesBtn) {
            mergeFacesBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showMergeFacesModal();
            };
        }

        const reviewDuplicatesBtn = document.getElementById('menuReviewDuplicatesBtn');
        if (reviewDuplicatesBtn) {
            reviewDuplicatesBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showDuplicatesReviewView();
            };
        }

        const cleanupDBBtn = document.getElementById('menuCleanupDatabaseBtn');
        if (cleanupDBBtn) {
            cleanupDBBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.cleanupDatabase();
            };
        }

        const downloadM3U8Btn = document.getElementById('menuDownloadM3U8Btn');
        if (downloadM3U8Btn) {
            downloadM3U8Btn.onclick = () => {
                this.hideActionsMenu();
                this.app.showDownloadM3U8Modal();
            };
        }

        const downloadSOCKSBtn = document.getElementById('menuDownloadSOCKSBtn');
        if (downloadSOCKSBtn) {
            downloadSOCKSBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showDownloadSOCKSModal();
            };
        }

        const quickDownloadBtn = document.getElementById('menuQuickDownloadBtn');
        if (quickDownloadBtn) {
            quickDownloadBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showQuickDownloadModal();
            };
        }

        const batchDownloadBtn = document.getElementById('menuBatchDownloadBtn');
        if (batchDownloadBtn) {
            batchDownloadBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showBatchDownloadModal();
            };
        }

        const clipboardBtn = document.getElementById('menuClipboardDownloadBtn');
        if (clipboardBtn) {
            clipboardBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.downloadFromClipboard();
            };
        }

        const helpBtn = document.getElementById('menuHelpBtn');
        if (helpBtn) {
            helpBtn.onclick = () => {
                this.hideActionsMenu();
                this.app.showHelpModal();
            };
        }

        // Click outside to close actions menu
        document.addEventListener('click', (e) => {
            const menu = document.getElementById('actionsMenu');
            const menuBtn = document.getElementById('actionsMenuBtn');
            if (menu && menu.style.display === 'block' && !menu.contains(e.target) && e.target !== menuBtn) {
                this.hideActionsMenu();
            }
        });
    }
}

// Export for usage
window.MenuManager = MenuManager;
