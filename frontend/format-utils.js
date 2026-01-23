/**
 * FormatUtils - Utility functions for formatting, parsing, and data manipulation
 *
 * Pure utility functions with no UI dependencies. Handles:
 * - Time/duration formatting and parsing
 * - File size formatting
 * - Resolution formatting
 * - Filename sanitization
 * - Video metadata formatting
 * - Image/video type detection
 * - Edited video detection and grouping
 * - Color generation for folders
 *
 * Usage:
 *   const utils = new FormatUtils({ editedVideoSubstrings: ['processed', 'cut', 'crop'] });
 *   const formatted = utils.formatDuration(125); // "2:05"
 */

class FormatUtils {
    constructor(config = {}) {
        // Configuration for edited video detection
        // Add substrings here to detect edited videos (case-insensitive, matches anywhere in filename)
        this.editedVideoSubstrings = config.editedVideoSubstrings || [
            'processed',
            'cut',
            'crop',
            'cut_and_crop'
        ];
    }

    // ============================================================================
    // TIME AND DURATION FORMATTING
    // ============================================================================

    /**
     * Format duration in seconds as HH:MM:SS or MM:SS
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration (e.g., "2:05" or "1:23:45")
     */
    formatDuration(seconds) {
        if (seconds === undefined || seconds === null || isNaN(seconds)) return '';

        // Ensure non-negative
        const val = Math.max(0, seconds);
        const hrs = Math.floor(val / 3600);
        const mins = Math.floor((val % 3600) / 60);
        const secs = Math.floor(val % 60);

        if (hrs > 0) {
            return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Parse time string to seconds
     * Accepts formats: "30" (seconds), "1:45" (MM:SS), "01:23:45" (HH:MM:SS)
     * @param {string} timeString - Time string to parse
     * @returns {number} Total seconds
     */
    parseTimeToSeconds(timeString) {
        if (!timeString || timeString.trim() === '') return 0;

        const parts = timeString.trim().split(':');

        if (parts.length === 1) {
            // Just seconds: "30"
            return parseInt(parts[0]) || 0;
        } else if (parts.length === 2) {
            // MM:SS format: "1:45"
            const mins = parseInt(parts[0]) || 0;
            const secs = parseInt(parts[1]) || 0;
            return mins * 60 + secs;
        } else if (parts.length === 3) {
            // HH:MM:SS format: "01:23:45"
            const hrs = parseInt(parts[0]) || 0;
            const mins = parseInt(parts[1]) || 0;
            const secs = parseInt(parts[2]) || 0;
            return hrs * 3600 + mins * 60 + secs;
        }

        return 0;
    }

    /**
     * Normalize any time format to HH:MM:SS format
     * Accepts: "30", "0:30", "1:45", "01:45", "1:23:45", "00:01:45"
     * Returns: Always "HH:MM:SS" format
     * @param {string} timeString - Time string to normalize
     * @returns {string} Normalized time in HH:MM:SS format
     */
    normalizeTimeFormat(timeString) {
        if (!timeString || timeString.trim() === '') return '00:00:00';

        const totalSeconds = this.parseTimeToSeconds(timeString);
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = Math.floor(totalSeconds % 60);

        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    // ============================================================================
    // FILE SIZE FORMATTING
    // ============================================================================

    /**
     * Format file size in bytes to human-readable format (GB/MB)
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size (e.g., "1.5GB" or "750MB")
     */
    formatSize(bytes) {
        if (!bytes) return '';
        const gb = bytes / (1024 * 1024 * 1024);
        const mb = bytes / (1024 * 1024);
        if (gb >= 1) return `${gb.toFixed(1)}GB`;
        return `${mb.toFixed(0)}MB`;
    }

    /**
     * Format file size in bytes with more detail (Bytes/KB/MB/GB)
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size (e.g., "1.50 GB" or "750.00 KB")
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * Alternative formatFileSize with shorter units (B instead of Bytes)
     * @param {number} bytes - File size in bytes
     * @returns {string} Formatted size (e.g., "1.5 GB" or "750.0 KB")
     */
    formatFileSizeShort(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // ============================================================================
    // RESOLUTION AND VIDEO METADATA
    // ============================================================================

    /**
     * Format video resolution to user-friendly format (4K, 1080p, 720p, etc.)
     * @param {number} width - Video width in pixels
     * @param {number} height - Video height in pixels
     * @returns {string} Formatted resolution (e.g., "1080p")
     */
    formatResolution(width, height) {
        if (!width || !height) return '';
        if (height >= 2160) return '4K';
        if (height >= 1080) return '1080p';
        if (height >= 720) return '720p';
        return `${height}p`;
    }

    /**
     * Format complete video metadata with all available info
     * Returns HTML string with badge and tooltip
     * @param {object} video - Video object with metadata
     * @returns {string} HTML string for metadata badge
     */
    formatVideoMetadata(video) {
        const metadata = [];

        // Series and Episode (e.g., "S01E01")
        if (video.season && video.episode) {
            metadata.push(`S${String(video.season).padStart(2, '0')}${video.episode}`);
        } else if (video.episode) {
            metadata.push(video.episode);
        }

        // Duration
        if (video.duration) {
            metadata.push(this.formatDuration(video.duration));
        }

        // Resolution
        if (video.width && video.height) {
            const resolution = video.height >= 2160 ? '4K' :
                video.height >= 1080 ? '1080p' :
                    video.height >= 720 ? '720p' :
                        `${video.height}p`;
            metadata.push(resolution);
        }

        // File size
        if (video.size) {
            metadata.push(this.formatSize(video.size));
        }

        // Year
        if (video.year) {
            metadata.push(String(video.year));
        }

        // Channel
        if (video.channel) {
            metadata.push(video.channel);
        }

        // Rating (stars)
        if (video.rating) {
            const fullStars = Math.floor(video.rating);
            const hasHalfStar = (video.rating % 1) >= 0.5;
            let stars = '★'.repeat(fullStars);
            if (hasHalfStar) stars += '⯨';
            metadata.push(stars);
        }

        if (metadata.length === 0) return '';

        // Build tooltip with all info
        let tooltip = '';
        if (video.series) tooltip += `${video.series} `;
        if (video.season && video.episode) tooltip += `S${String(video.season).padStart(2, '0')}${video.episode} `;
        if (video.year) tooltip += `(${video.year}) `;
        if (video.channel) tooltip += `[${video.channel}] `;
        if (video.width && video.height) tooltip += `${video.width}x${video.height} `;
        if (video.size) tooltip += `${this.formatSize(video.size)} `;
        if (video.rating) tooltip += `Rating: ${video.rating}/5`;

        return `<span class="video-metadata-badge" title="${tooltip.trim()}">${metadata.join(' • ')}</span>`;
    }

    // ============================================================================
    // DATE FORMATTING
    // ============================================================================

    /**
     * Format Unix timestamp to locale date string
     * @param {number} timestamp - Unix timestamp (seconds)
     * @returns {string} Formatted date string
     */
    formatDate(timestamp) {
        return new Date(timestamp * 1000).toLocaleDateString();
    }

    // ============================================================================
    // DEVICE DETECTION
    // ============================================================================

    /**
     * Detect if user is on a mobile device
     * Used to hide desktop-only features (keyboard shortcuts, etc.)
     * @returns {boolean} True if mobile device detected
     */
    isMobileDevice() {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
            || (window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
    }

    // ============================================================================
    // FILE EXTENSION AND TYPE DETECTION
    // ============================================================================

    /**
     * Extract image file extension and return it in uppercase
     * Examples: image.jpg → JPG, photo.png → PNG, pic.webp → WEBP
     * @param {string} filename - Filename to extract extension from
     * @returns {string} Uppercase extension or 'IMAGE'
     */
    getImageExtension(filename) {
        const extension = filename.split('.').pop()?.toUpperCase() || 'IMAGE';
        return extension;
    }

    /**
     * Check if extension indicates an image file
     * Handles various formats: '.jpg', 'jpg', '.GIF', 'GIF', etc.
     * @param {string} extension - File extension to check
     * @returns {boolean} True if image extension
     */
    isImageExtension(extension) {
        if (!extension) return false;

        // Normalize: remove leading dot, convert to lowercase
        const normalized = extension.toLowerCase().replace(/^\./, '');
        const imageExts = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp']);
        return imageExts.has(normalized);
    }

    // ============================================================================
    // FILENAME SANITIZATION
    // ============================================================================

    /**
     * Sanitize filename by removing or replacing problematic characters
     * Handles: apostrophes, quotes, and other special characters that cause playback issues
     * @param {string} filename - Filename to sanitize
     * @returns {string} Sanitized filename
     */
    sanitizeFilename(filename) {
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
        const extension = filename.substring(filename.lastIndexOf('.'));

        let sanitized = nameWithoutExt
            // Replace apostrophes and quotes with hyphens
            .replace(/['"`]/g, '-')
            // Replace other problematic characters with hyphens
            .replace(/[<>|?*:\/\\]/g, '-')
            // Replace multiple consecutive hyphens with single hyphen
            .replace(/-+/g, '-')
            // Remove leading/trailing hyphens
            .replace(/^-+|-+$/g, '')
            // Remove any remaining non-ASCII characters that might cause issues
            .replace(/[^\x20-\x7E]/g, '');

        return sanitized + extension;
    }

    // ============================================================================
    // EDITED VIDEO DETECTION AND GROUPING
    // ============================================================================

    /**
     * Check if a video is edited based on filename
     * Returns true if any edited indicator substring is found in the filename
     * @param {string} videoName - Video filename to check
     * @returns {boolean} True if video appears to be edited
     */
    isEditedVideo(videoName) {
        const lowerName = videoName.toLowerCase();
        return this.editedVideoSubstrings.some(substring => lowerName.includes(substring));
    }

    /**
     * Create a badge HTML for edited videos
     * @param {string} videoName - Video filename to check
     * @returns {string} HTML badge string or empty string
     */
    createEditedVideoBadge(videoName) {
        if (!this.isEditedVideo(videoName)) return '';
        return `<span class="edited-video-badge" title="Edited Video">✏️</span>`;
    }

    /**
     * Extract base filename by removing edit operation prefixes or suffixes
     * Handles two patterns:
     * 1. Prefix: [operation]_[timestamp]_[hash/rest] → extracts rest
     * 2. Suffix: [base]_[operation]_... → extracts base
     * Examples:
     *   "401652_cut_and_crop_9x16.mp4" → "401652.mp4"
     *   "401652_cut_and_crop_028_038_9x16.mp4" → "401652.mp4"
     *   "processed_1757774645603_1757774645504_9654e0fa5efccfe5.mp4" → "1757774645504_9654e0fa5efccfe5.mp4"
     *   "401652.mp4" → "401652.mp4" (no edits)
     * @param {string} videoName - Video filename to process
     * @returns {string} Base filename
     */
    getBaseVideoName(videoName) {
        // Extract extension
        const lastDotIndex = videoName.lastIndexOf('.');
        const extension = lastDotIndex !== -1 ? videoName.substring(lastDotIndex) : '';
        const nameWithoutExt = lastDotIndex !== -1 ? videoName.substring(0, lastDotIndex) : videoName;

        // Try prefix pattern first: operation_timestamp_rest
        for (const operation of this.editedVideoSubstrings) {
            const prefixPattern = new RegExp(`^${operation}_\\d+_(.+)$`, 'i');
            const prefixMatch = nameWithoutExt.match(prefixPattern);
            if (prefixMatch) {
                return prefixMatch[1] + extension;
            }
        }

        // Try suffix pattern: base_operation_...
        // Sort by length descending to match longer operations first (e.g., "cut_and_crop" before "cut")
        const sortedOps = [...this.editedVideoSubstrings].sort((a, b) => b.length - a.length);
        for (const operation of sortedOps) {
            // Match: "..._operation_..." anywhere in the name
            const suffixPattern = new RegExp(`(.+)_${operation}(_|$)`, 'i');
            const suffixMatch = nameWithoutExt.match(suffixPattern);
            if (suffixMatch) {
                return suffixMatch[1] + extension;
            }
        }

        // No edit pattern found, return original name
        return videoName;
    }

    /**
     * Group videos: separate originals from edited versions grouped by base name
     * Returns { regular: [], grouped: {} } where grouped has structure { baseName: {original, edits: [videos]} }
     * @param {array} videos - Array of video objects
     * @returns {object} Object with regular videos and grouped edited videos
     */
    groupVideosByBase(videos) {
        const regular = []; // Videos with no matching edited versions
        const editedByBase = {}; // {baseName: {original, edits: [videos]}}

        // Identify which base names have edited versions
        const baseNamesToCheck = new Set();

        videos.forEach(video => {
            if (this.isEditedVideo(video.name)) {
                const baseName = this.getBaseVideoName(video.name);
                baseNamesToCheck.add(baseName);
            }
        });

        // Organize videos
        videos.forEach(video => {
            const baseName = this.getBaseVideoName(video.name);

            // Check if this is an edited video with an original
            const hasOriginal = baseNamesToCheck.has(baseName) && videos.some(v =>
                !this.isEditedVideo(v.name) &&
                (v.name === baseName || this.getBaseVideoName(v.name) === baseName)
            );

            if (this.isEditedVideo(video.name) && hasOriginal) {
                // This is an edited version
                if (!editedByBase[baseName]) {
                    editedByBase[baseName] = { original: null, edits: [] };
                }
                editedByBase[baseName].edits.push(video);
            } else if (!this.isEditedVideo(video.name) && baseNamesToCheck.has(baseName)) {
                // This is the original with edits
                if (!editedByBase[baseName]) {
                    editedByBase[baseName] = { original: null, edits: [] };
                }
                editedByBase[baseName].original = video;
            } else {
                // Regular video with no edits
                regular.push(video);
            }
        });

        return {
            regular,
            grouped: editedByBase
        };
    }

    // ============================================================================
    // COLOR GENERATION
    // ============================================================================

    /**
     * Generate a consistent, light, glassy color for a folder name
     * Uses hash-based HSL color generation for unique but consistent colors
     * @param {string} folderName - Folder name to generate color for
     * @param {string} type - Color type: 'background', 'border', or 'text'
     * @returns {string} CSS color string (hsla format)
     */
    getFolderColor(folderName, type = 'background') {
        if (!folderName || folderName === '_root') {
            // Default neutral color for root
            return type === 'background' ? 'rgba(229, 231, 235, 0.2)' : 'rgba(156, 163, 175, 0.5)';
        }

        // Simple hash function to get a number from folder name
        let hash = 0;
        for (let i = 0; i < folderName.length; i++) {
            hash = folderName.charCodeAt(i) + ((hash << 5) - hash);
            hash = hash & hash; // Convert to 32-bit integer
        }

        // Generate hue (0-360) from hash
        const hue = Math.abs(hash % 360);

        // Use higher saturation and lower lightness for more vibrant, distinguishable colors
        const saturation = 65; // More pungent and vivid (increased from 40%)
        const lightness = 55;   // Darker for better differentiation (decreased from 80%)

        if (type === 'background') {
            // More visible background with higher opacity
            return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.4)`;
        } else if (type === 'border') {
            // Darker, more opaque border for stronger definition
            return `hsla(${hue}, ${saturation}%, ${lightness - 15}%, 0.8)`;
        } else if (type === 'text') {
            // Darker text for readability
            return `hsla(${hue}, ${saturation}%, 30%, 0.9)`;
        }

        return `hsla(${hue}, ${saturation}%, ${lightness}%, 0.4)`;
    }
}

// Export as global for use in app.js
window.FormatUtils = FormatUtils;
