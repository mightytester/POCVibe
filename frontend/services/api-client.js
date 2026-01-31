/**
 * ClipperAPIClient - Centralized API client for all backend communication
 * Provides type-safe API calls with error handling and consistent patterns
 */
class ClipperAPIClient {
    constructor(baseUrl = 'http://localhost:8000') {
        this.baseUrl = baseUrl;
    }

    /**
     * Generic request handler with error handling
     * @param {string} endpoint - API endpoint (e.g., '/videos')
     * @param {object} options - Fetch options (method, body, headers, etc.)
     * @returns {Promise<any>} Response data
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            // Handle empty responses
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            throw error;
        }
    }

    // ============ Video API ============

    async getVideos(category = null, subcategory = null, bustCache = false) {
        const params = {};
        if (category) params.category = category;
        if (subcategory) params.subcategory = subcategory;
        if (bustCache) params._t = Date.now();

        const queryString = new URLSearchParams(params).toString();
        return this.request(`/api/videos${queryString ? `?${queryString}` : ''}`);
    }

    async getVideosByFolder(folderName, bustCache = false) {
        const params = bustCache ? `?_t=${Date.now()}&cache=${Math.random()}` : '';
        return this.request(`/api/videos/${encodeURIComponent(folderName)}${params}`, {
            cache: 'no-store'
        });
    }

    async getAllVideos(bustCache = false) {
        const params = bustCache ? `?_t=${Date.now()}` : '';
        return this.request(`/api/videos/_all${params}`);
    }

    async getVideo(videoId) {
        return this.request(`/api/videos/${videoId}`);
    }

    async updateVideo(videoId, data) {
        return this.request(`/api/videos/${videoId}/update`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async moveVideo(videoId, targetCategory) {
        return this.request(`/api/videos/${videoId}/move`, {
            method: 'POST',
            body: JSON.stringify({ target_category: targetCategory })
        });
    }

    async deleteVideo(videoId) {
        return this.request(`/api/videos/${videoId}/delete`, {
            method: 'POST'
        });
    }

    async deletePermanent(videoId) {
        return this.request(`/api/videos/${videoId}/delete-permanent`, {
            method: 'POST'
        });
    }

    async extractMetadata(videoId) {
        return this.request(`/api/videos/${videoId}/extract-metadata`, {
            method: 'POST'
        });
    }

    async hashRename(videoId) {
        return this.request(`/api/videos/${videoId}/hash-rename`, {
            method: 'POST'
        });
    }

    async toggleFinal(videoId) {
        return this.request(`/api/videos/${videoId}/toggle-final`, {
            method: 'POST'
        });
    }

    async bulkUpdateVideos(data) {
        return this.request('/api/videos/bulk-update', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async extractFolderMetadata(folderName) {
        return this.request(`/api/videos/folder/${encodeURIComponent(folderName)}/extract-metadata`, {
            method: 'POST'
        });
    }

    // ============ Folder Group API ============

    async getFolderStructure() {
        return this.request('/api/folders/structure');
    }

    async getFolderGroups() {
        return this.request('/api/folders/groups');
    }

    async createFolderGroup(data) {
        return this.request('/api/folders/groups', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateFolderGroup(groupId, data) {
        return this.request(`/api/folders/groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteFolderGroup(groupId) {
        return this.request(`/api/folders/groups/${groupId}`, {
            method: 'DELETE'
        });
    }

    async reorderFolderGroup(groupId, direction) {
        return this.request(`/api/folders/groups/${groupId}/reorder`, {
            method: 'PATCH',
            body: JSON.stringify({ direction })
        });
    }

    // ============ Tag API ============

    async getTags() {
        return this.request('/api/tags');
    }

    async createTag(name, color) {
        return this.request('/api/tags', {
            method: 'POST',
            body: JSON.stringify({ name, color })
        });
    }

    async addTagToVideo(videoId, tagName) {
        return this.request(`/api/tags/videos/${videoId}/tags?tag_name=${encodeURIComponent(tagName)}`, {
            method: 'POST'
        });
    }

    async removeTagFromVideo(videoId, tagId) {
        return this.request(`/api/tags/videos/${videoId}/tags/${tagId}`, {
            method: 'DELETE'
        });
    }

    // ============ Actor API ============

    async getActors() {
        return this.request('/api/actors');
    }

    async createActor(name, notes = '') {
        return this.request('/api/actors', {
            method: 'POST',
            body: JSON.stringify({ name, notes })
        });
    }

    async addActorToVideo(videoId, actorName) {
        return this.request(`/api/actors/videos/${videoId}/actors`, {
            method: 'POST',
            body: JSON.stringify({ actor_name: actorName })
        });
    }

    async removeActorFromVideo(videoId, actorId) {
        return this.request(`/api/actors/videos/${videoId}/actors/${actorId}`, {
            method: 'DELETE'
        });
    }

    // ============ Thumbnail API ============

    async generateThumbnail(videoId) {
        return this.request(`/api/thumbnails/generate/${videoId}`, {
            method: 'POST'
        });
    }

    async getThumbnailStats() {
        return this.request('/api/thumbnails/stats');
    }

    getThumbnailUrl(videoId, bustCache = false) {
        const timestamp = Date.now();
        const cacheParam = bustCache ? `&bustCache=${Math.random()}` : '';
        return `${this.baseUrl}/api/thumbnails/${videoId}?t=${timestamp}${cacheParam}`;
    }

    // ============ Face API ============

    async detectFaces(videoId, options = {}) {
        const params = new URLSearchParams();
        if (options.num_frames) params.set('num_frames', options.num_frames);
        if (options.max_duration) params.set('max_duration', options.max_duration);

        const queryString = params.toString();
        const endpoint = `/api/videos/${videoId}/detect-faces${queryString ? `?${queryString}` : ''}`;

        return this.request(endpoint, { method: 'POST' });
    }

    async addDetectedFaces(videoId, detectedFaces) {
        return this.request(`/api/videos/${videoId}/add-detected-faces`, {
            method: 'POST',
            body: JSON.stringify({ detected_faces: detectedFaces })
        });
    }

    async autoScanFaces(videoId, num_frames = 10) {
        return this.request(`/api/videos/${videoId}/auto-scan-faces?num_frames=${num_frames}`, {
            method: 'POST'
        });
    }

    async getVideoFaces(videoId) {
        return this.request(`/api/videos/${videoId}/faces`);
    }

    async linkFaceToVideo(videoId, faceId, detectionMethod = 'manual') {
        return this.request(`/api/videos/${videoId}/faces/${faceId}`, {
            method: 'POST',
            body: JSON.stringify({ detection_method: detectionMethod })
        });
    }

    async searchFaces(encoding, threshold = 0.6) {
        return this.request('/api/faces/search', {
            method: 'POST',
            body: JSON.stringify({
                encoding: encoding,
                threshold: threshold
            })
        });
    }

    async createFace(name, encoding, thumbnail, actorId = null) {
        return this.request('/api/faces/create', {
            method: 'POST',
            body: JSON.stringify({
                name,
                encoding,
                thumbnail,
                actor_id: actorId
            })
        });
    }

    async linkFaceToVideo(videoId, faceId, detectionMethod = 'manual') {
        return this.request(`/api/videos/${videoId}/faces/${faceId}/link`, {
            method: 'POST',
            body: JSON.stringify({ detection_method: detectionMethod })
        });
    }

    async getAllFaces() {
        return this.request('/api/faces');
    }

    async getFace(faceId) {
        return this.request(`/api/faces/${faceId}`);
    }

    async updateFace(faceId, data) {
        return this.request(`/api/faces/${faceId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteFace(faceId) {
        return this.request(`/api/faces/${faceId}`, {
            method: 'DELETE'
        });
    }

    async catalogFaces(faceId, encodings) {
        return this.request('/api/faces/catalog', {
            method: 'POST',
            body: JSON.stringify({
                face_id: faceId,
                encodings: encodings
            })
        });
    }

    async mergeFaces(sourceFaceId, targetFaceId) {
        return this.request('/api/faces/merge', {
            method: 'POST',
            body: JSON.stringify({
                source_face_id: sourceFaceId,
                target_face_id: targetFaceId
            })
        });
    }

    // ============ Fingerprint API ============

    async generateFingerprint(videoId) {
        return this.request(`/api/fingerprints/generate/${videoId}`, {
            method: 'POST'
        });
    }

    async findDuplicates(videoId, scope = 'folder') {
        return this.request(`/api/fingerprints/find-duplicates/${videoId}?scope=${scope}`, {
            method: 'POST'
        });
    }

    async findAllDuplicates(category = null) {
        const endpoint = category
            ? `/api/fingerprints/find-all-duplicates?category=${encodeURIComponent(category)}`
            : '/api/fingerprints/find-all-duplicates';
        return this.request(endpoint, {
            method: 'POST'
        });
    }

    // ============ Video Editor API ============

    async processVideo(videoId, options) {
        return this.request(`/api/videos/${videoId}/process`, {
            method: 'POST',
            body: JSON.stringify(options)
        });
    }

    async getProcessingStatus(jobId) {
        return this.request(`/api/videos/processing/status/${jobId}`);
    }

    // ============ Search API ============

    async getMetadataSuggestions(field = null) {
        const endpoint = field
            ? `/api/videos/metadata/suggestions?field=${field}`
            : '/api/videos/metadata/suggestions';
        return this.request(endpoint);
    }

    async searchVideos(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/api/search?${queryString}`);
    }

    // ============ Scan API ============

    async scanAll(syncDb = true, pruneMissing = true, fastMode = true) {
        return this.request(`/api/scan?sync_db=${syncDb}&prune_missing=${pruneMissing}&fast_mode=${fastMode}`);
    }

    async scanFolder(folderName) {
        return this.request(`/api/scan/folder/${encodeURIComponent(folderName)}`, {
            method: 'POST'
        });
    }

    async getScanStatus() {
        return this.request('/api/scan/status');
    }

    async scanFolderSmartRefresh(folderName) {
        return this.request(`/api/scan/folder/${encodeURIComponent(folderName)}/smart-refresh`, {
            method: 'POST'
        });
    }

    async scanFolderScanOnly(folderName) {
        return this.request(`/api/scan/folder/${encodeURIComponent(folderName)}/scan-only`, {
            method: 'POST'
        });
    }

    async scanFolderWithOptions(folderName, options = {}) {
        const params = new URLSearchParams();
        if (options.recursive !== undefined) params.set('recursive', options.recursive);
        if (options.parentCategory) params.set('parent_category', options.parentCategory);
        if (options.hierarchical !== undefined) params.set('hierarchical', options.hierarchical);
        if (options.syncDb !== undefined) params.set('sync_db', options.syncDb);

        const queryString = params.toString();
        const url = `/api/scan/folder/${encodeURIComponent(folderName)}${queryString ? '?' + queryString : ''}`;
        return this.request(url, { method: 'POST' });
    }

    async scanSingleVideo(folderName, filename) {
        return this.request('/api/scan/video/single', {
            method: 'POST',
            body: JSON.stringify({
                folder_name: folderName,
                filename: filename
            })
        });
    }

    // ============ Multi-Root API ============

    async getRoots() {
        return this.request('/api/roots');
    }

    async selectRoot(rootName) {
        return this.request(`/api/roots/select?root_name=${encodeURIComponent(rootName)}`, {
            method: 'POST'
        });
    }

    // ============ Download API ============

    async downloadM3U8(url, outputPath, socksProxy = null) {
        return this.request('/api/downloads/m3u8', {
            method: 'POST',
            body: JSON.stringify({
                url,
                output_path: outputPath,
                socks_proxy: socksProxy
            })
        });
    }

    async getDownloadStatus(downloadId) {
        return this.request(`/api/downloads/${downloadId}/status`);
    }

    // ============ Helper Methods ============

    getStreamUrl(category, videoPath) {
        return `${this.baseUrl}/stream/${encodeURIComponent(category)}/${encodeURIComponent(videoPath)}`;
    }

    async getModeInfo() {
        return this.request('/api/mode');
    }

    async getFingerprintStats() {
        return this.request('/api/fingerprints/stats');
    }

    async getConfig() {
        return this.request('/api/config');
    }

    async healthCheck() {
        return this.request('/api/health');
    }
}

// Export as global
window.ClipperAPIClient = ClipperAPIClient;
