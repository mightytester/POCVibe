/**
 * FingerprintModule - Fingerprint management and duplicate detection
 * Handles fingerprint generation, viewing, and duplicate tagging
 */
class FingerprintModule {
    constructor(app) {
        this.app = app

        // Fingerprint viewer state
        this.fingerprintViewerVideoId = null
        this.fingerprintViewerVideoName = null

        // Fingerprint generation state
        this.fpGenVideo = null
        this.fpGenFrames = []
        this.fpGenSelectedFrames = new Set()
        this.fpGenVideoElement = null

        // Similar videos modal state
        this.currentSimilarGroupVideos = null
    }

    // ==================== FINGERPRINT LIBRARY OPERATIONS ====================

    async addFingerprintToLibrary(videoId) {
        const video = this.app.videos.find(v => v.id === videoId) || this.app.allVideos.find(v => v.id === videoId)
        if (!video) return

        try {
            const response = await fetch(`${this.app.apiBase}/api/videos/${videoId}/fingerprint`, {
                method: 'POST'
            })
            const data = await response.json()

            if (response.ok) {
                // Update video in memory
                video.fingerprint_generated = 1

                // Refresh display
                this.app.renderVideoGrid()
            } else {
                console.log(data.detail || 'Failed to generate fingerprint')
            }
        } catch (error) {
            console.error('Error generating fingerprint:', error)
            console.log('Failed to generate fingerprint')
        }
    }

    async removeFingerprintFromLibrary(videoId) {
        const video = this.app.videos.find(v => v.id === videoId) || this.app.allVideos.find(v => v.id === videoId)
        if (!video) return

        const confirmation = confirm(
            `Remove "${video.display_name || video.name}" from fingerprint library?\n\n` +
            `This video will no longer be used for duplicate detection.`
        )

        if (!confirmation) return

        try {
            const response = await fetch(`${this.app.apiBase}/api/videos/${videoId}/fingerprint`, {
                method: 'DELETE'
            })

            if (response.ok) {
                // Update video in memory
                video.fingerprint_generated = 0

                // Refresh display
                this.app.renderVideoGrid()
            } else {
                console.log('Failed to remove fingerprint')
            }
        } catch (error) {
            console.error('Error removing fingerprint:', error)
            console.log('Failed to remove fingerprint')
        }
    }

    async toggleFinalStatus(videoId) {
        const video = this.app.videos.find(v => v.id === videoId) || this.app.allVideos.find(v => v.id === videoId)
        if (!video) return

        try {
            const response = await fetch(`${this.app.apiBase}/videos/${videoId}/toggle-final`, {
                method: 'POST'
            })

            if (response.ok) {
                const data = await response.json()

                // Update video in memory
                video.is_final = data.is_final

                // Log to console instead of showing toast
                console.log(data.message)

                // Refresh display to show/hide badge
                this.app.renderVideoGrid()
            } else {
                console.log('Failed to toggle final status')
            }
        } catch (error) {
            console.error('Error toggling final status:', error)
            console.log('Failed to toggle final status')
        }
    }

    // ==================== DUPLICATE DETECTION ====================

    async checkIfDuplicate(videoId) {
        const video = this.app.videos.find(v => v.id === videoId) || this.app.allVideos.find(v => v.id === videoId)
        if (!video) return

        // Show overlay with progress
        this.app.showDuplicateSearchOverlay('Scanning fingerprints...', 30)

        try {
            const response = await fetch(
                `${this.app.apiBase}/api/videos/${videoId}/check-duplicate?threshold=10`
            )

            // Update progress
            this.app.showDuplicateSearchOverlay('Comparing with library...', 70)

            const data = await response.json()

            if (data.is_duplicate && data.matches && data.matches.length > 0) {
                // Update to complete
                this.app.showDuplicateSearchOverlay(`Found ${data.matches.length} similar video${data.matches.length !== 1 ? 's' : ''}!`, 100)

                // Hide overlay and show modal
                setTimeout(() => {
                    this.app.hideDuplicateSearchOverlay()
                    this.showSimilarVideosModal(video, data.matches)
                }, 600)
            } else {
                // Show "unique" message and auto-dismiss
                this.app.showDuplicateSearchOverlay('No similar videos found - unique! ✓', 100, false, true)
            }
        } catch (error) {
            console.error('Error checking duplicate:', error)
            this.app.showDuplicateSearchOverlay('Search failed', 100, true, true)
        }
    }

    // ==================== SIMILAR VIDEOS MODAL ====================

    showSimilarVideosModal(originalVideo, matches) {
        console.log('📋 Showing Similar Videos Modal:', { originalVideo, matches })

        const modal = document.getElementById('similarVideosModal')
        const titleEl = document.getElementById('similarVideosModalTitle')
        const container = document.getElementById('similarVideosGroupContainer')

        // Update modal title - simple and clean
        titleEl.textContent = '🔍 Similar Videos'

        // Clear previous content
        container.innerHTML = ''

        // Create duplicate-group-section structure (consistent with full duplicate view)
        const groupSection = document.createElement('div')
        groupSection.className = 'duplicate-group-section'

        // Prepare video data
        const allVideos = [originalVideo, ...matches.map(m => m.video)]
        const videoIds = allVideos.map(v => v.id)

        // Generate the deterministic tag for THIS specific group
        const expectedTagName = this.app.generateDuplicateTag(videoIds)

        // Check if this group already has its specific deterministic tag
        let isAlreadyTagged = false
        for (const video of allVideos) {
            if (video.tags && video.tags.some(tag => tag.name === expectedTagName)) {
                isAlreadyTagged = true
                break
            }
        }

        // Group header with count and Tag Group button
        const groupHeader = document.createElement('div')
        groupHeader.className = 'duplicate-group-header'
        const totalVideos = 1 + matches.length // Original + matches

        let tagButtonHtml = ''
        if (isAlreadyTagged) {
            // Show "Already Tagged" indicator with the deterministic tag
            tagButtonHtml = `<span class="duplicate-group-tagged">✓ Tagged: ${expectedTagName}</span>`
        } else {
            // Show "Tag Group" button - store video data for tagging
            this.currentSimilarGroupVideos = allVideos // Store full video objects, not just IDs
            tagButtonHtml = `<button class="duplicate-group-tag-btn" onclick="app.fingerprint.tagSimilarGroup()">🏷️ Tag Group</button>`
        }

        groupHeader.innerHTML = `
            <div class="duplicate-group-header-left">
                <span class="duplicate-group-number">Similar Videos</span>
                <span class="duplicate-group-count">${totalVideos} videos (${matches.length} matches)</span>
            </div>
            <div class="duplicate-group-header-right">
                ${tagButtonHtml}
            </div>
        `
        groupSection.appendChild(groupHeader)

        // Group grid for videos (original + matches)
        const groupGrid = document.createElement('div')
        groupGrid.className = 'duplicate-group-grid'

        // Add original video first (marked as REF with special styling)
        const originalWithMeta = {
            ...originalVideo,
            _similarity: 100, // REF video shown as 100%
            _isOriginal: true
        }
        const originalCard = this.app.createVideoCard(originalWithMeta)
        groupGrid.appendChild(originalCard)

        // Add all matches with similarity badges
        matches.forEach(match => {
            const matchVideo = {
                ...match.video,
                _similarity: match.similarity_percent,
                _isOriginal: false
            }
            const matchCard = this.app.createVideoCard(matchVideo)
            groupGrid.appendChild(matchCard)
        })

        groupSection.appendChild(groupGrid)
        container.appendChild(groupSection)

        // Show modal
        modal.style.display = 'flex'

        console.log(`Found ${matches.length} similar video(s)`)
    }

    async tagSimilarGroup() {
        // Tag all videos in the similar videos modal group
        if (!this.currentSimilarGroupVideos || this.currentSimilarGroupVideos.length === 0) {
            console.log('No videos to tag')
            return
        }

        const allVideosData = this.currentSimilarGroupVideos
        const videoIds = allVideosData.map(v => v.id)

        // Check if any videos already have dup- tags (need to merge)
        const existingDupTags = new Set()
        allVideosData.forEach(video => {
            if (video.tags) {
                video.tags.forEach(tag => {
                    if (tag.name.startsWith('dup-')) {
                        existingDupTags.add(tag.name)
                    }
                })
            }
        })

        // Generate deterministic tag based on video IDs
        const expectedTag = this.app.generateDuplicateTag(videoIds)

        // If videos have existing dup tags that DON'T match the expected tag, merge groups
        const hasOtherDupTags = Array.from(existingDupTags).some(tag => tag !== expectedTag)

        if (hasOtherDupTags) {
            // Merge old groups with new videos
            console.log(`Merging groups: existing tags [${Array.from(existingDupTags).join(', ')}] → new tag ${expectedTag}`)
            await this.mergeGroupsAndTag(videoIds, existingDupTags)
            return
        }

        // Simple case: no conflicting tags, just tag the group
        const tagName = expectedTag
        console.log(`Generated deterministic tag for ${videoIds.length} videos: ${tagName}`)

        // Tag all videos in this group
        let successCount = 0
        for (const videoId of videoIds) {
            try {
                // Use the same endpoint as tagDuplicateGroupByIndex
                const response = await fetch(`${this.app.apiBase}/videos/${videoId}/tags?tag_name=${encodeURIComponent(tagName)}`, {
                    method: 'POST'
                })

                if (response.ok) {
                    const result = await response.json()
                    if (result && result.tag) {
                        successCount++
                        console.log(`✓ Tagged video ${videoId} with ${tagName}`, result)
                    } else {
                        console.error(`✗ Invalid response for video ${videoId}:`, result)
                    }
                } else {
                    const errorText = await response.text()
                    console.error(`✗ Failed to tag video ${videoId}: ${response.status} ${response.statusText}`, errorText)
                }
            } catch (error) {
                console.error(`Failed to tag video ${videoId}:`, error)
            }
        }

        if (successCount === videoIds.length) {
            console.log(`✓ Tagged ${successCount} videos with "${tagName}"`)

            // Update the button to show "Tagged" state
            const tagButton = document.querySelector('.similar-videos-group-container .duplicate-group-tag-btn')
            if (tagButton) {
                tagButton.outerHTML = `<span class="duplicate-group-tagged">✓ Tagged: ${tagName}</span>`
            }

            // Reload tags to get the new tag with its color
            await this.app.loadAllTags()

            // Find the tag object
            const tagObj = this.app.allTags.find(t => t.name === tagName)

            // Update videos in memory with the new tag (consistency!)
            if (tagObj) {
                // Update videos in this.app.videos
                this.app.videos.forEach(video => {
                    if (videoIds.includes(video.id)) {
                        if (!video.tags) video.tags = []
                        // Add tag if not already present
                        if (!video.tags.find(t => t.id === tagObj.id)) {
                            video.tags.push(tagObj)
                        }
                    }
                })

                // Update videos in this.app.allVideos
                this.app.allVideos.forEach(video => {
                    if (videoIds.includes(video.id)) {
                        if (!video.tags) video.tags = []
                        // Add tag if not already present
                        if (!video.tags.find(t => t.id === tagObj.id)) {
                            video.tags.push(tagObj)
                        }
                    }
                })

                // Update the stored group videos too
                if (this.currentSimilarGroupVideos) {
                    this.currentSimilarGroupVideos.forEach(video => {
                        if (videoIds.includes(video.id)) {
                            if (!video.tags) video.tags = []
                            // Add tag if not already present
                            if (!video.tags.find(t => t.id === tagObj.id)) {
                                video.tags.push(tagObj)
                            }
                        }
                    })
                }

                console.log(`✓ Updated ${videoIds.length} videos in memory with tag: ${tagName}`)
            }

            // Clear the stored video data
            this.currentSimilarGroupVideos = null
        } else if (successCount > 0) {
            console.log(`⚠️ Partially tagged: ${successCount}/${videoIds.length} videos succeeded`)
            console.warn(`Only ${successCount} out of ${videoIds.length} videos were tagged successfully`)
        } else {
            console.log('❌ Failed to tag any videos')
            console.error('All tagging operations failed')
        }
    }

    async mergeGroupsAndTag(newVideoIds, existingDupTags) {
        // Merge old duplicate groups with new videos
        console.log('Merging duplicate groups...')

        // Fetch all videos that have any of the existing dup tags
        const allRelatedVideos = new Set(newVideoIds)

        for (const tagName of existingDupTags) {
            try {
                const response = await fetch(`${this.app.apiBase}/search?tags=${encodeURIComponent(tagName)}`)

                // Check if response is ok (not 404 or other error)
                if (response.ok) {
                    const data = await response.json()
                    if (Array.isArray(data)) {
                        data.forEach(video => allRelatedVideos.add(video.id))
                    }
                } else {
                    // Tag doesn't exist in backend (already deleted or never existed)
                    console.log(`Tag ${tagName} not found in backend (404), skipping fetch`)
                }
            } catch (error) {
                console.error(`Error fetching videos for tag ${tagName}:`, error)
            }
        }

        const mergedVideoIds = Array.from(allRelatedVideos)
        const newTagName = this.app.generateDuplicateTag(mergedVideoIds)

        console.log(`Merging into "${newTagName}" (${mergedVideoIds.length} videos)...`)

        // Track old tag IDs to delete after removing them from videos
        const oldTagIdsToDelete = new Set()

        // Remove old dup tags and add new merged tag
        for (const videoId of mergedVideoIds) {
            // Get video's current tags
            const video = this.app.allVideos.find(v => v.id === videoId)
            if (!video) continue

            // Remove old dup tags
            if (video.tags) {
                for (const tag of video.tags) {
                    if (tag.name.startsWith('dup-') && tag.name !== newTagName) {
                        try {
                            await fetch(`${this.app.apiBase}/videos/${videoId}/tags/${tag.id}`, {
                                method: 'DELETE'
                            })
                            oldTagIdsToDelete.add(tag.id)
                        } catch (error) {
                            console.error(`Error removing tag ${tag.name}:`, error)
                        }
                    }
                }
            }

            // Add new merged tag
            try {
                const response = await fetch(`${this.app.apiBase}/videos/${videoId}/tags?tag_name=${encodeURIComponent(newTagName)}`, {
                    method: 'POST'
                })

                if (response.ok) {
                    const result = await response.json()
                    if (result && result.tag) {
                        console.log(`✓ Merged tag added to video ${videoId}:`, result.tag.name)
                    } else {
                        console.error(`✗ Invalid merge response for video ${videoId}:`, result)
                    }
                } else {
                    const errorText = await response.text()
                    console.error(`✗ Failed to add merged tag to video ${videoId}: ${response.status}`, errorText)
                }
            } catch (error) {
                console.error(`Error adding merged tag to video ${videoId}:`, error)
            }
        }

        // Delete the orphaned old tags
        for (const tagId of oldTagIdsToDelete) {
            try {
                await fetch(`${this.app.apiBase}/tags/${tagId}`, {
                    method: 'DELETE'
                })
                console.log(`Deleted orphaned tag ID: ${tagId}`)
            } catch (error) {
                console.error(`Error deleting orphaned tag ${tagId}:`, error)
            }
        }

        console.log(`✓ Merged groups into "${newTagName}" (${mergedVideoIds.length} videos)`)

        // Check if user is currently filtering by one of the deleted tags
        const wasFilteringDeletedTag = existingDupTags.has(this.app.currentTagFilter)

        // Reload tags to include the new merged tag (also updates dropdown)
        await this.app.loadAllTags()

        // If user was filtering by a deleted tag, switch to the new merged tag
        if (wasFilteringDeletedTag) {
            this.app.currentTagFilter = newTagName
            const tagFilter = document.getElementById('tagFilter')
            if (tagFilter) {
                tagFilter.value = newTagName
            }
            // Trigger filter update to show videos with new tag
            await this.app.handleFiltersChanged()
            console.log(`✓ Switched filter from deleted tag to ${newTagName}`)
        }

        // Find the tag object and update videos in memory
        const tagObj = this.app.allTags.find(t => t.name === newTagName)
        if (tagObj) {
            // Update videos in memory - remove old dup tags, add new merged tag
            const updateVideoTags = (video) => {
                if (mergedVideoIds.includes(video.id)) {
                    if (!video.tags) video.tags = []
                    // Remove old dup tags
                    video.tags = video.tags.filter(t => !t.name.startsWith('dup-') || t.name === newTagName)
                    // Add new merged tag if not already present
                    if (!video.tags.find(t => t.id === tagObj.id)) {
                        video.tags.push(tagObj)
                    }
                }
            }

            this.app.videos.forEach(updateVideoTags)
            this.app.allVideos.forEach(updateVideoTags)
        }

        // Update modal button to show "Already Tagged"
        const tagButton = document.querySelector('.similar-videos-group-container .duplicate-group-tag-btn')
        if (tagButton) {
            tagButton.outerHTML = `<span class="duplicate-group-tagged">✓ Tagged: ${newTagName}</span>`
        }

        // Clear stored video data
        this.currentSimilarGroupVideos = null
    }

    hideSimilarVideosModal() {
        console.log('🔽 Closing Similar Videos Modal')
        const modal = document.getElementById('similarVideosModal')
        modal.style.display = 'none'

        // Clear stored video data
        this.currentSimilarGroupVideos = null
    }

    // ==================== FINGERPRINT VIEWER ====================

    viewFingerprintsFromContext() {
        const videoId = this.app.contextMenuVideoId
        const videoName = this.app.contextMenuVideoName

        this.showFingerprintViewer(videoId, videoName)
        this.app.hideVideoContextMenu()
    }

    async showFingerprintViewer(videoId, videoName) {
        // Store current video info
        this.fingerprintViewerVideoId = videoId
        this.fingerprintViewerVideoName = videoName

        // Clear previous content immediately to avoid showing stale data
        const grid = document.getElementById('fingerprintFramesGrid')
        grid.innerHTML = '<div style="text-align: center; padding: 40px; color: #9ca3af;">Loading fingerprint frames...</div>'

        // Set video name and reset frame count
        document.getElementById('fingerprintVideoName').textContent = videoName
        document.getElementById('fingerprintFrameCount').textContent = 'Loading...'

        // Show modal
        const modal = document.getElementById('fingerprintViewerModal')
        modal.style.display = 'flex'

        // Load fingerprint frames
        await this.loadFingerprintFrames(videoId)
    }

    async loadFingerprintFrames(videoId) {
        try {
            console.log(`🆔 Loading fingerprint frames for video ${videoId}...`)
            const response = await fetch(`${this.app.apiBase}/api/videos/${videoId}/fingerprints`)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const data = await response.json()
            console.log(`🆔 Loaded ${data.frame_count || 0} fingerprint frames`)

            // Update frame count
            const frameCountEl = document.getElementById('fingerprintFrameCount')
            if (data.frame_count > 0) {
                frameCountEl.textContent = `${data.frame_count} ${data.frame_count === 1 ? 'frame' : 'frames'}`
            } else {
                frameCountEl.textContent = 'No frames'
            }

            // Render frames grid
            this.renderFingerprintFrames(data.frames || [])

        } catch (error) {
            console.error('❌ Failed to load fingerprint frames:', error)
            console.log('Failed to load fingerprint frames')
        }
    }

    renderFingerprintFrames(frames) {
        const grid = document.getElementById('fingerprintFramesGrid')
        grid.innerHTML = ''

        if (frames.length === 0) {
            // Empty state is handled by CSS ::before
            return
        }

        frames.forEach(frame => {
            const card = document.createElement('div')
            card.className = 'fingerprint-frame-card'
            card.dataset.fingerprintId = frame.id

            // Format timestamp
            const timestamp = this.app.formatDuration(frame.timestamp)

            card.innerHTML = `
                <img src="${frame.thumbnail}" class="fingerprint-frame-thumbnail" alt="Frame at ${frame.position}%">
                <div class="fingerprint-frame-info">
                    <div class="fingerprint-frame-position">${Math.round(frame.position * 100)}% of video</div>
                    <div class="fingerprint-frame-timestamp">${timestamp}</div>
                </div>
                <button class="fingerprint-frame-delete" onclick="app.fingerprint.deleteFingerprintFrame(${frame.id})" title="Delete this frame">
                    ×
                </button>
            `

            grid.appendChild(card)
        })
    }

    async deleteFingerprintFrame(fingerprintId) {
        // Show custom confirmation modal instead of browser confirm
        const confirmed = await this.app.showConfirmModal(
            '🗑️ Delete Fingerprint Frame',
            'Are you sure you want to delete this fingerprint frame? This action cannot be undone.'
        )

        if (!confirmed) {
            return
        }

        try {
            console.log(`🗑️ Deleting fingerprint frame ${fingerprintId}...`)
            const response = await fetch(
                `${this.app.apiBase}/api/videos/${this.fingerprintViewerVideoId}/fingerprints/${fingerprintId}`,
                { method: 'DELETE' }
            )

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const result = await response.json()
            console.log(`✓ Deleted fingerprint frame. ${result.remaining_frames} frames remaining.`)

            console.log(`Frame deleted (${result.remaining_frames} remaining)`)

            // Reload frames
            await this.loadFingerprintFrames(this.fingerprintViewerVideoId)

            // Refresh video grid to update fingerprint icon
            await this.app.renderVideoGrid()

        } catch (error) {
            console.error('❌ Failed to delete fingerprint frame:', error)
            console.log('Failed to delete frame')
        }
    }

    hideFingerprintViewer() {
        const modal = document.getElementById('fingerprintViewerModal')
        modal.style.display = 'none'

        // Clear stored data
        this.fingerprintViewerVideoId = null
        this.fingerprintViewerVideoName = null
    }

    // ==================== FINGERPRINT GENERATION FROM VIEWER ====================

    async openFingerprintGenerationFromViewer() {
        // Save video info before closing viewer (hideFingerprintViewer clears these)
        const videoId = this.fingerprintViewerVideoId
        const videoName = this.fingerprintViewerVideoName

        if (!videoId) {
            return
        }

        // Close the viewer modal
        this.hideFingerprintViewer()

        try {
            // Fetch full video object from API (need category and relative_path for stream URL)
            const response = await fetch(`${this.app.apiBase}/api/videos/${videoId}`)
            if (!response.ok) {
                throw new Error(`Failed to fetch video: ${response.status}`)
            }

            const video = await response.json()

            // Open the generation modal with full video object
            this.openFingerprintGenerationModal(video)

        } catch (error) {
            console.error('❌ Error loading video for fingerprint generation:', error)
            console.log('Failed to open fingerprint generation')
        }
    }

    async addCurrentFrameToFingerprint() {
        // Called when user presses 'Shift+F' during video playback
        const videoPlayer = document.getElementById('videoPlayer')

        if (!videoPlayer || !videoPlayer.src || !this.app.currentVideoInPlayer) {
            console.log('No video playing')
            return
        }

        // Calculate position (0.0 to 1.0)
        const position = videoPlayer.currentTime / videoPlayer.duration

        try {
            console.log(`➕ Adding fingerprint frame at ${(position * 100).toFixed(1)}%...`)
            const response = await fetch(
                `${this.app.apiBase}/api/videos/${this.app.currentVideoInPlayer.id}/fingerprints/add-frame?position=${position}`,
                { method: 'POST' }
            )

            if (!response.ok) {
                const error = await response.json()
                throw new Error(error.detail || 'Failed to add frame')
            }

            const result = await response.json()
            console.log(`✓ Added fingerprint frame:`, result)

            console.log(`Added fingerprint at ${Math.round(position * 100)}%`)

            // Refresh video grid to update fingerprint icon
            await this.app.renderVideoGrid()

        } catch (error) {
            console.error('❌ Failed to add fingerprint frame:', error)
            console.log(error.message || 'Failed to add frame')
        }
    }

    // ==================== INTERACTIVE FINGERPRINT GENERATION ====================

    openFingerprintGenerationModal(video) {
        // Store video info
        this.fpGenVideo = video
        this.fpGenFrames = []
        this.fpGenSelectedFrames = new Set()

        // Set video name
        document.getElementById('fpGenVideoName').textContent = video.display_name || video.name
        document.getElementById('fpGenFrameCount').textContent = '0 frames selected'
        document.getElementById('fpGenSelectedCount').textContent = '0'
        document.getElementById('fpGenStatus').textContent = ''

        // Clear frames grid
        const grid = document.getElementById('fpGenFramesGrid')
        grid.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; color: #9ca3af;">
                <p style="font-size: 18px; margin: 0;">Click "Generate Random Frames" to get started</p>
                <p style="font-size: 14px; color: #d1d5db; margin-top: 8px;">Select the frames you want to add as fingerprints</p>
            </div>
        `

        // Create hidden video element for client-side frame extraction
        if (!this.fpGenVideoElement) {
            this.fpGenVideoElement = document.createElement('video')
            this.fpGenVideoElement.style.display = 'none'
            this.fpGenVideoElement.crossOrigin = 'anonymous'
            this.fpGenVideoElement.preload = 'metadata'
            document.body.appendChild(this.fpGenVideoElement)
        }

        // Show modal
        const modal = document.getElementById('fingerprintGenerationModal')
        modal.style.display = 'flex'
    }

    async generateRandomFingerprintFrames() {
        if (!this.fpGenVideo) return

        const btn = document.getElementById('fpGenGenerateBtn')
        const statusEl = document.getElementById('fpGenStatus')

        try {
            btn.disabled = true
            statusEl.textContent = '🎲 Loading video...'

            // Generate 10 random positions
            const positions = []
            for (let i = 0; i < 10; i++) {
                const position = 0.05 + (Math.random() * 0.9)
                positions.push(position)
            }
            positions.sort((a, b) => a - b)

            // Load video in hidden element
            const video = this.fpGenVideoElement
            const videoUrl = `${this.app.apiBase}/stream/${encodeURIComponent(this.fpGenVideo.category)}/${encodeURIComponent(this.fpGenVideo.name)}`

            // Set video source
            video.src = videoUrl

            // Wait for video metadata to load
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = resolve
                video.onerror = () => reject(new Error('Failed to load video'))
                setTimeout(() => reject(new Error('Video load timeout')), 10000)
            })

            const duration = video.duration
            if (!duration || duration <= 0) {
                throw new Error('Invalid video duration')
            }

            console.log(`✓ Video loaded. Duration: ${duration.toFixed(1)}s`)
            statusEl.textContent = '📸 Capturing frames...'

            // Create canvas for frame capture
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')

            // Capture frames at each position
            const capturedFrames = []
            for (let i = 0; i < positions.length; i++) {
                const position = positions[i]
                const timestamp = duration * position

                try {
                    statusEl.textContent = `📸 Capturing frame ${i + 1}/${positions.length}...`

                    // Seek to position
                    video.currentTime = timestamp

                    // Wait for seek to complete
                    await new Promise((resolve) => {
                        video.onseeked = resolve
                        setTimeout(resolve, 1000) // Fallback timeout
                    })

                    // Capture frame to canvas
                    canvas.width = video.videoWidth
                    canvas.height = video.videoHeight
                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

                    // Convert to base64 JPEG
                    const thumbnail = canvas.toDataURL('image/jpeg', 0.85)

                    capturedFrames.push({
                        position: position,
                        timestamp: timestamp,
                        thumbnail: thumbnail,
                        phash: null  // Will be generated server-side when added
                    })

                    console.log(`✓ Captured frame ${i + 1}/${positions.length} at ${(position * 100).toFixed(1)}%`)

                } catch (error) {
                    console.error(`Failed to capture frame at position ${position}:`, error)
                }
            }

            // Add to existing frames
            this.fpGenFrames.push(...capturedFrames)

            // Render frames immediately
            this.renderFingerprintGenerationFrames()

            statusEl.textContent = `✓ Generated ${capturedFrames.length} frames`
            console.log(`✓ Generated ${capturedFrames.length} fingerprint frames`)

        } catch (error) {
            console.error('❌ Failed to generate frames:', error)
            console.log(error.message || 'Failed to generate frames')
            statusEl.textContent = ''
        } finally {
            btn.disabled = false
        }
    }

    renderFingerprintGenerationFrames() {
        const grid = document.getElementById('fpGenFramesGrid')
        grid.innerHTML = ''

        if (this.fpGenFrames.length === 0) {
            grid.innerHTML = `
                <div style="text-align: center; padding: 60px 20px; color: #9ca3af;">
                    <p style="font-size: 18px; margin: 0;">Click "Generate Random Frames" to get started</p>
                    <p style="font-size: 14px; color: #d1d5db; margin-top: 8px;">Select the frames you want to add as fingerprints</p>
                </div>
            `
            return
        }

        this.fpGenFrames.forEach((frame, index) => {
            const card = document.createElement('div')
            card.className = 'fingerprint-frame-card'
            card.style.position = 'relative'

            const isSelected = this.fpGenSelectedFrames.has(index)
            if (isSelected) {
                card.classList.add('selected')
            }

            // Format timestamp
            const timestamp = this.app.formatDuration(frame.timestamp)

            card.innerHTML = `
                <input type="checkbox"
                    class="fingerprint-frame-checkbox"
                    data-frame-index="${index}"
                    ${isSelected ? 'checked' : ''}
                    onchange="app.fingerprint.toggleFingerprintFrameSelection(${index})">
                <img src="${frame.thumbnail}" class="fingerprint-frame-thumbnail" alt="Frame at ${frame.position}%">
                <div class="fingerprint-frame-info">
                    <div class="fingerprint-frame-position">${Math.round(frame.position * 100)}% of video</div>
                    <div class="fingerprint-frame-timestamp">${timestamp}</div>
                </div>
            `

            card.onclick = (e) => {
                if (e.target.type !== 'checkbox') {
                    this.toggleFingerprintFrameSelection(index)
                }
            }

            grid.appendChild(card)
        })
    }

    toggleFingerprintFrameSelection(index) {
        if (this.fpGenSelectedFrames.has(index)) {
            this.fpGenSelectedFrames.delete(index)
        } else {
            this.fpGenSelectedFrames.add(index)
        }

        // Update UI
        this.updateFingerprintGenerationSelection()
    }

    updateFingerprintGenerationSelection() {
        const count = this.fpGenSelectedFrames.size

        // Update counter
        document.getElementById('fpGenFrameCount').textContent = `${count} frame${count !== 1 ? 's' : ''} selected`
        document.getElementById('fpGenSelectedCount').textContent = count

        // Enable/disable add button
        const addBtn = document.getElementById('fpGenAddSelectedBtn')
        addBtn.disabled = count === 0

        // Update checkboxes and cards
        this.fpGenFrames.forEach((frame, index) => {
            const checkbox = document.querySelector(`input[data-frame-index="${index}"]`)
            const card = checkbox?.closest('.fingerprint-frame-card')

            if (checkbox && card) {
                const isSelected = this.fpGenSelectedFrames.has(index)
                checkbox.checked = isSelected
                card.classList.toggle('selected', isSelected)
            }
        })
    }

    selectAllFingerprintFrames() {
        this.fpGenSelectedFrames.clear()
        this.fpGenFrames.forEach((_, index) => {
            this.fpGenSelectedFrames.add(index)
        })
        this.updateFingerprintGenerationSelection()
    }

    deselectAllFingerprintFrames() {
        this.fpGenSelectedFrames.clear()
        this.updateFingerprintGenerationSelection()
    }

    async addSelectedFingerprintFrames() {
        if (this.fpGenSelectedFrames.size === 0 || !this.fpGenVideo) return

        const btn = document.getElementById('fpGenAddSelectedBtn')
        const statusEl = document.getElementById('fpGenStatus')

        try {
            btn.disabled = true
            statusEl.textContent = '⚙️ Generating fingerprints...'

            // Get selected frames
            const selectedFrames = Array.from(this.fpGenSelectedFrames)
                .map(index => this.fpGenFrames[index])

            // Send thumbnails to server for pHash generation
            const frames = selectedFrames.map(f => ({
                position: f.position,
                thumbnail: f.thumbnail  // base64 image
            }))

            console.log(`➕ Adding ${frames.length} fingerprint frames...`)

            // Add frames to fingerprints (server will generate pHash)
            const response = await fetch(
                `${this.app.apiBase}/api/videos/${this.fpGenVideo.id}/fingerprints/add-frames-from-images`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ frames })
                }
            )

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(error.detail || 'Failed to add frames')
            }

            const result = await response.json()
            console.log(`✓ Added ${result.added_count} frames. Total: ${result.total_frames}`)

            console.log(`Added ${result.added_count} fingerprint frames`)

            // Refresh video grid
            await this.app.renderVideoGrid()

            // Close modal
            this.closeFingerprintGenerationModal()

        } catch (error) {
            console.error('❌ Failed to add frames:', error)
            console.log(error.message || 'Failed to add frames')
            statusEl.textContent = ''
        } finally {
            btn.disabled = false
        }
    }

    closeFingerprintGenerationModal() {
        const modal = document.getElementById('fingerprintGenerationModal')
        modal.style.display = 'none'

        // Clear data
        this.fpGenVideo = null
        this.fpGenFrames = []
        this.fpGenSelectedFrames = new Set()
    }
}

// Export as global
window.FingerprintModule = FingerprintModule
