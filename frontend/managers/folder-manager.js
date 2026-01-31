/**
 * FolderManager - Handles folder structure and folder group management logic
 */
class FolderManager {
    constructor(app) {
        this.app = app;
    }

    async loadFolderStructure() {
        try {
            // API returns: {groups: [...], ungrouped_folders: [...], all_folders: [...]}
            this.app.folderStructure = await this.app.api.getFolderStructure();
            console.log('📁 Folder structure loaded:', this.app.folderStructure);

            // Populate folder filter dropdown
            this.app.populateFolderFilter();
        } catch (error) {
            console.warn('⚠️ Failed to load folder structure:', error);
            this.app.folderStructure = { groups: [], ungrouped_folders: [], all_folders: [] };
        }
    }

    async loadFolderGroups() {
        /**
         * Load custom folder groups configuration
         * Groups can be used to organize folders in explorer view
         */
        try {
            // API returns array directly: [{id, name, icon, folders, ...}, ...]
            const data = await this.app.api.getFolderGroups();
            this.app.folderGroups = Array.isArray(data) ? data : [];
            console.log('📊 Folder groups loaded:', this.app.folderGroups);
        } catch (error) {
            console.warn('⚠️ Failed to load folder groups:', error);
            this.app.folderGroups = [];
        }
    }

    async createFolderGroup(groupData) {
        /**
         * Create a new custom folder group
         */
        try {
            const group = await this.app.api.createFolderGroup(groupData);
            console.log('✅ Folder group created:', group);

            // Reload groups
            await this.loadFolderGroups();

            return group;
        } catch (error) {
            console.error('❌ Failed to create folder group:', error);
            this.app.showStatus(`Failed to create group: ${error.message}`, 'error');
            return null;
        }
    }
}

window.FolderManager = FolderManager;
