/**
 * SettingsStorage - Centralized settings persistence module
 * Handles localStorage operations for app settings and tag usage
 * Provides clean interface for save/load operations
 */
class SettingsStorage {
    constructor() {
        this.KEYS = {
            SETTINGS: 'clipper_settings',
            RECENT_TAGS: 'clipper_recent_tags',
            TAG_USAGE: 'clipper_tag_usage'
        };
    }

    // ============ App Settings ============

    /**
     * Save app settings to localStorage
     * @param {Object} settings - Settings object to persist
     */
    saveSettings(settings) {
        try {
            localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
            console.log('💾 Settings saved to localStorage');
            return true;
        } catch (error) {
            console.warn('Failed to save settings to localStorage:', error);
            return false;
        }
    }

    /**
     * Load app settings from localStorage
     * @returns {Object|null} Settings object or null if not found
     */
    loadSettings() {
        try {
            const settingsJson = localStorage.getItem(this.KEYS.SETTINGS);
            if (settingsJson) {
                const settings = JSON.parse(settingsJson);
                console.log('✅ Settings loaded from localStorage');
                return settings;
            }
            return null;
        } catch (error) {
            console.warn('Failed to load settings from localStorage:', error);
            return null;
        }
    }

    /**
     * Clear app settings from localStorage
     */
    clearSettings() {
        try {
            localStorage.removeItem(this.KEYS.SETTINGS);
            console.log('🗑️ Settings cleared from localStorage');
            return true;
        } catch (error) {
            console.warn('Failed to clear settings from localStorage:', error);
            return false;
        }
    }

    // ============ Tag Usage Tracking ============

    /**
     * Save tag usage data to localStorage
     * @param {Array} recentTags - Array of recently used tag names
     * @param {Object} usageCount - Object mapping tag names to usage counts
     */
    saveTagUsage(recentTags, usageCount) {
        try {
            localStorage.setItem(this.KEYS.RECENT_TAGS, JSON.stringify(recentTags));
            localStorage.setItem(this.KEYS.TAG_USAGE, JSON.stringify(usageCount));
            return true;
        } catch (error) {
            console.warn('Failed to save tag usage to localStorage:', error);
            return false;
        }
    }

    /**
     * Load tag usage data from localStorage
     * @returns {Object} Object with recentTags array and usageCount object
     */
    loadTagUsage() {
        try {
            const recentTags = localStorage.getItem(this.KEYS.RECENT_TAGS);
            const tagUsage = localStorage.getItem(this.KEYS.TAG_USAGE);

            return {
                recentTags: recentTags ? JSON.parse(recentTags) : [],
                usageCount: tagUsage ? JSON.parse(tagUsage) : {}
            };
        } catch (error) {
            console.warn('Failed to load tag usage from localStorage:', error);
            return { recentTags: [], usageCount: {} };
        }
    }

    /**
     * Clear all tag usage data from localStorage
     */
    clearTagUsage() {
        try {
            localStorage.removeItem(this.KEYS.RECENT_TAGS);
            localStorage.removeItem(this.KEYS.TAG_USAGE);
            return true;
        } catch (error) {
            console.warn('Failed to clear tag usage from localStorage:', error);
            return false;
        }
    }

    // ============ Utility Methods ============

    /**
     * Clear all Clipper data from localStorage
     */
    clearAll() {
        this.clearSettings();
        this.clearTagUsage();
        console.log('🗑️ All Clipper localStorage data cleared');
    }

    /**
     * Get storage usage statistics
     * @returns {Object} Storage statistics
     */
    getStats() {
        const stats = {
            settings: null,
            recentTags: null,
            tagUsage: null,
            totalBytes: 0
        };

        try {
            const settingsJson = localStorage.getItem(this.KEYS.SETTINGS);
            const recentTagsJson = localStorage.getItem(this.KEYS.RECENT_TAGS);
            const tagUsageJson = localStorage.getItem(this.KEYS.TAG_USAGE);

            if (settingsJson) {
                stats.settings = settingsJson.length;
                stats.totalBytes += settingsJson.length;
            }
            if (recentTagsJson) {
                stats.recentTags = recentTagsJson.length;
                stats.totalBytes += recentTagsJson.length;
            }
            if (tagUsageJson) {
                stats.tagUsage = tagUsageJson.length;
                stats.totalBytes += tagUsageJson.length;
            }
        } catch (error) {
            console.warn('Failed to get storage stats:', error);
        }

        return stats;
    }
}

// Export as global singleton
window.SettingsStorage = new SettingsStorage();
