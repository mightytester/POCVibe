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

    async getVideos(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/videos${queryString ? `?${queryString}` : ''}`);
    }

    async getVideo(videoId) {
        return this.request(`/videos/${videoId}`);
    }

    async updateVideo(videoId, data) {
        return this.request(`/videos/${videoId}/update`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async moveVideo(videoId, targetCategory) {
        return this.request(`/videos/${videoId}/move`, {
            method: 'POST',
            body: JSON.stringify({ target_category: targetCategory })
        });
    }

    async deleteVideo(videoId) {
        return this.request(`/videos/${videoId}/delete`, {
            method: 'POST'
        });
    }

    async deletePermanent(videoId) {
        return this.request(`/videos/${videoId}/delete-permanent`, {
            method: 'POST'
        });
    }

    async extractMetadata(videoId) {
        return this.request(`/api/videos/${videoId}/extract-metadata`, {
            method: 'POST'
        });
    }

    async extractFolderMetadata(folderName) {
        return this.request(`/api/videos/folder/${encodeURIComponent(folderName)}/extract-metadata`, {
            method: 'POST'
        });
    }

    // ============ Folder Group API ============

    async getFolderStructure() {
        return this.request('/folder-structure');
    }

    async getFolderGroups() {
        return this.request('/folder-groups');
    }

    async createFolderGroup(data) {
        return this.request('/folder-groups', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async updateFolderGroup(groupId, data) {
        return this.request(`/folder-groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }

    async deleteFolderGroup(groupId) {
        return this.request(`/folder-groups/${groupId}`, {
            method: 'DELETE'
        });
    }

    async reorderFolderGroup(groupId, direction) {
        return this.request(`/folder-groups/${groupId}/reorder`, {
            method: 'PATCH',
            body: JSON.stringify({ direction })
        });
    }

    // ============ Tag API ============

    async getTags() {
        return this.request('/tags');
    }

    async createTag(name, color) {
        return this.request('/tags', {
            method: 'POST',
            body: JSON.stringify({ name, color })
        });
    }

    async addTagToVideo(videoId, tagId) {
        return this.request(`/videos/${videoId}/tags`, {
            method: 'POST',
            body: JSON.stringify({ tag_id: tagId })
        });
    }

    async removeTagFromVideo(videoId, tagId) {
        return this.request(`/videos/${videoId}/tags/${tagId}`, {
            method: 'DELETE'
        });
    }

    // ============ Actor API ============

    async getActors() {
        return this.request('/actors');
    }

    async createActor(name, notes = '') {
        return this.request('/actors', {
            method: 'POST',
            body: JSON.stringify({ name, notes })
        });
    }

    async addActorToVideo(videoId, actorId) {
        return this.request(`/videos/${videoId}/actors`, {
            method: 'POST',
            body: JSON.stringify({ actor_id: actorId })
        });
    }

    async removeActorFromVideo(videoId, actorId) {
        return this.request(`/videos/${videoId}/actors/${actorId}`, {
            method: 'DELETE'
        });
    }

    // ============ Thumbnail API ============

    async generateThumbnail(videoId) {
        return this.request(`/api/thumbnails/generate/${videoId}`, {
            method: 'POST'
        });
    }

    getThumbnailUrl(videoId, bustCache = false) {
        const timestamp = Date.now();
        const cacheParam = bustCache ? `&bustCache=${Math.random()}` : '';
        return `${this.baseUrl}/api/thumbnails/${videoId}?t=${timestamp}${cacheParam}`;
    }

    // ============ Face API ============

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

    async searchVideos(params = {}) {
        const queryString = new URLSearchParams(params).toString();
        return this.request(`/search?${queryString}`);
    }

    // ============ Scan API ============

    async scanAll(syncDb = true, pruneMissing = true) {
        return this.request(`/scan?sync_db=${syncDb}&prune_missing=${pruneMissing}`);
    }

    async scanFolder(folderName) {
        return this.request(`/scan/folder/${encodeURIComponent(folderName)}`, {
            method: 'POST'
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

    async healthCheck() {
        return this.request('/health');
    }
}

// Export as global
window.ClipperAPIClient = ClipperAPIClient;
