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
        this.app.updateSelectionModeRadio();
        this.app.updateVerticalModeRadio();
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
        this.app.applySorting();
        this.app.saveSettingsToStorage();

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
            const modeResponse = await fetch('/mode');
            const modeData = await modeResponse.json();
            const modeInfo = document.getElementById('menuModeInfo');
            if (modeInfo) modeInfo.textContent = modeData.local_mode_enabled ? 'Local' : 'Stream';
        } catch (error) {
            console.error('Error fetching mode info:', error);
        }

        // Update thumbnail cache info
        try {
            const thumbResponse = await fetch('/thumbnails/stats');
            const thumbData = await thumbResponse.json();
            const thumbInfo = document.getElementById('menuThumbnailInfo');
            if (thumbInfo) thumbInfo.textContent = `${thumbData.thumbnail_count} (${thumbData.cache_size_mb.toFixed(1)} MB)`;
        } catch (error) {
            console.error('Error fetching thumbnail stats:', error);
        }

        // Update fingerprint library info
        try {
            const fingerprintResponse = await fetch(`${this.app.apiBase}/api/fingerprints/stats`);
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
}

window.MenuManager = MenuManager;
