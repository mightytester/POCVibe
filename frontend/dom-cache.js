/**
 * DOMCacheManager - Efficient DOM element caching system
 * Reduces repeated getElementById calls by caching references
 * Provides automatic cache invalidation and performance metrics
 */
class DOMCacheManager {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            invalidations: 0
        };
    }

    /**
     * Get a DOM element by ID, using cache when available
     * @param {string} elementId - The element ID to retrieve
     * @returns {HTMLElement|null} The DOM element or null if not found
     */
    get(elementId) {
        if (this.cache.has(elementId)) {
            // Verify element still exists in DOM
            const cachedElement = this.cache.get(elementId);
            if (cachedElement && document.contains(cachedElement)) {
                this.stats.hits++;
                return cachedElement;
            } else {
                // Element removed from DOM, invalidate cache entry
                this.cache.delete(elementId);
                this.stats.invalidations++;
            }
        }

        // Cache miss - fetch from DOM
        const element = document.getElementById(elementId);
        if (element) {
            this.cache.set(elementId, element);
            this.stats.misses++;
        } else {
            console.warn(`DOM element not found: ${elementId}`);
        }

        return element;
    }

    /**
     * Manually invalidate a cached element
     * Use when dynamically replacing elements with same ID
     * @param {string} elementId - The element ID to invalidate
     */
    invalidate(elementId) {
        if (this.cache.has(elementId)) {
            this.cache.delete(elementId);
            this.stats.invalidations++;
        }
    }

    /**
     * Invalidate multiple cached elements
     * @param {string[]} elementIds - Array of element IDs to invalidate
     */
    invalidateMultiple(elementIds) {
        elementIds.forEach(id => this.invalidate(id));
    }

    /**
     * Clear entire cache
     * Use sparingly - typically only needed during major DOM restructuring
     */
    clear() {
        const size = this.cache.size;
        this.cache.clear();
        this.stats.invalidations += size;
    }

    /**
     * Get cache statistics
     * @returns {object} Cache performance metrics
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;

        return {
            cacheSize: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            invalidations: this.stats.invalidations,
            hitRate: `${hitRate}%`,
            totalQueries: total
        };
    }

    /**
     * Log cache statistics to console
     */
    logStats() {
        const stats = this.getStats();
        console.group('DOM Cache Statistics');
        console.log(`Cache Size: ${stats.cacheSize} elements`);
        console.log(`Hit Rate: ${stats.hitRate} (${stats.hits}/${stats.totalQueries})`);
        console.log(`Misses: ${stats.misses}`);
        console.log(`Invalidations: ${stats.invalidations}`);
        console.groupEnd();
    }

    /**
     * Batch get multiple elements
     * @param {string[]} elementIds - Array of element IDs
     * @returns {Map<string, HTMLElement>} Map of elementId to element
     */
    getMultiple(elementIds) {
        const elements = new Map();
        elementIds.forEach(id => {
            const element = this.get(id);
            if (element) {
                elements.set(id, element);
            }
        });
        return elements;
    }

    /**
     * Check if element exists in cache and DOM
     * @param {string} elementId - The element ID to check
     * @returns {boolean} True if element exists and is cached
     */
    has(elementId) {
        return this.cache.has(elementId) &&
               document.contains(this.cache.get(elementId));
    }
}

// Create global singleton instance
window.DOMCache = new DOMCacheManager();

// Optional: Log stats on page unload for debugging
window.addEventListener('beforeunload', () => {
    if (window.DOMCache && typeof window.DOMCache.logStats === 'function') {
        window.DOMCache.logStats();
    }
});
