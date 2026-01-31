/**
 * DuplicateReviewModule - Duplicate detection and review functionality
 * Handles duplicate checking, similar videos modal, duplicate groups view
 */
class DuplicateReviewModule {
    constructor(app) {
        this.app = app

        // Duplicate review state
        this.duplicateViewActive = false
        this.duplicateViewData = null
        this.previousViewState = null
        this.duplicatesReviewActive = false
        this.duplicatesReviewData = null
        this.wasInDuplicatesReview = false
        this.currentSimilarGroupVideos = null
    }

    // ============ Helper Methods for Modals ============

    hideDuplicatesReviewIfActive() {
        const duplicatesReviewView = document.getElementById('duplicatesReviewView')
        if (duplicatesReviewView && duplicatesReviewView.style.display === 'flex') {
            this.wasInDuplicatesReview = true
            duplicatesReviewView.style.display = 'none'
            console.log('Temporarily hiding Duplicates Review View for modal')
            return true
        }
        return false
    }

    restoreDuplicatesReviewIfNeeded() {
        if (this.wasInDuplicatesReview) {
            const duplicatesReviewView = document.getElementById('duplicatesReviewView')
            if (duplicatesReviewView) {
                duplicatesReviewView.style.display = 'flex'
                console.log('Restored Duplicates Review View after modal close')
            }
            this.wasInDuplicatesReview = false
            return true
        }
        return false
    }

    // ============ Check Duplicate ============

    async checkIfDuplicate(videoId) {
        const video = this.app.videos.find(v => v.id === videoId) ||
                      this.app.allVideos.find(v => v.id === videoId)
        if (!video) return

        // Show overlay with progress
        this.showDuplicateSearchOverlay('Scanning fingerprints...', 30)

        try {
            const response = await fetch(
                `${this.app.apiBase}/api/videos/${videoId}/check-duplicate?threshold=10`
            )

            // Update progress
            this.showDuplicateSearchOverlay('Comparing with library...', 70)

            const data = await response.json()

            if (data.is_duplicate && data.matches && data.matches.length > 0) {
                this.showDuplicateSearchOverlay(`Found ${data.matches.length} similar video${data.matches.length !== 1 ? 's' : ''}!`, 100)

                setTimeout(() => {
                    this.hideDuplicateSearchOverlay()
                    this.showSimilarVideosModal(video, data.matches)
                }, 600)
            } else {
                this.showDuplicateSearchOverlay('No similar videos found - unique!', 100, false, true)
            }
        } catch (error) {
            console.error('Error checking duplicate:', error)
            this.showDuplicateSearchOverlay('Search failed', 100, true, true)
        }
    }

    // ============ Similar Videos Modal ============

    showSimilarVideosModal(originalVideo, matches) {
        console.log('Showing Similar Videos Modal:', { originalVideo, matches })

        const modal = document.getElementById('similarVideosModal')
        const titleEl = document.getElementById('similarVideosModalTitle')
        const container = document.getElementById('similarVideosGroupContainer')

        titleEl.textContent = 'Similar Videos'
        container.innerHTML = ''

        const groupSection = document.createElement('div')
        groupSection.className = 'duplicate-group-section'

        // Prepare video data
        const allVideos = [originalVideo, ...matches.map(m => m.video)]
        const videoIds = allVideos.map(v => v.id)

        // Generate deterministic tag
        const expectedTagName = this.generateDuplicateTag(videoIds)

        // Check if already tagged
        let isAlreadyTagged = false
        for (const video of allVideos) {
            if (video.tags && video.tags.some(tag => tag.name === expectedTagName)) {
                isAlreadyTagged = true
                break
            }
        }

        // Group header
        const groupHeader = document.createElement('div')
        groupHeader.className = 'duplicate-group-header'
        const totalVideos = 1 + matches.length

        let tagButtonHtml = ''
        if (isAlreadyTagged) {
            tagButtonHtml = `<span class="duplicate-group-tagged">Tagged: ${expectedTagName}</span>`
        } else {
            this.currentSimilarGroupVideos = allVideos
            tagButtonHtml = `<button class="duplicate-group-tag-btn" onclick="app.duplicateModule.tagSimilarGroup()">Tag Group</button>`
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

        // Group grid
        const groupGrid = document.createElement('div')
        groupGrid.className = 'duplicate-group-grid'

        // Add original video (REF)
        const originalWithMeta = {
            ...originalVideo,
            _similarity: 100,
            _isOriginal: true
        }
        const originalCard = this.app.createVideoCard(originalWithMeta)
        groupGrid.appendChild(originalCard)

        // Add matches
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

        modal.style.display = 'flex'
        console.log(`Found ${matches.length} similar video(s)`)
    }

    async tagSimilarGroup() {
        if (!this.currentSimilarGroupVideos || this.currentSimilarGroupVideos.length === 0) {
            console.log('No videos to tag')
            return
        }

        const allVideosData = this.currentSimilarGroupVideos
        const videoIds = allVideosData.map(v => v.id)

        // Check for existing dup- tags
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

        const expectedTag = this.generateDuplicateTag(videoIds)
        const hasOtherDupTags = Array.from(existingDupTags).some(tag => tag !== expectedTag)

        if (hasOtherDupTags) {
            console.log(`Merging groups: existing tags [${Array.from(existingDupTags).join(', ')}] -> new tag ${expectedTag}`)
            await this.mergeGroupsAndTag(videoIds, existingDupTags)
            return
        }

        const tagName = expectedTag
        console.log(`Generated deterministic tag for ${videoIds.length} videos: ${tagName}`)

        // Tag all videos
        let successCount = 0
        for (const videoId of videoIds) {
            try {
                const response = await fetch(`${this.app.apiBase}/videos/${videoId}/tags?tag_name=${encodeURIComponent(tagName)}`, {
                    method: 'POST'
                })

                if (response.ok) {
                    const result = await response.json()
                    if (result && result.tag) {
                        successCount++
                        console.log(`Tagged video ${videoId} with ${tagName}`)
                    }
                }
            } catch (error) {
                console.error(`Failed to tag video ${videoId}:`, error)
            }
        }

        if (successCount === videoIds.length) {
            console.log(`Tagged ${successCount} videos with "${tagName}"`)

            // Update button
            const tagButton = document.querySelector('.similar-videos-group-container .duplicate-group-tag-btn')
            if (tagButton) {
                tagButton.outerHTML = `<span class="duplicate-group-tagged">Tagged: ${tagName}</span>`
            }

            // Reload tags and update videos in memory
            await this.app.loadAllTags()
            const tagObj = this.app.allTags.find(t => t.name === tagName)

            if (tagObj) {
                this.updateVideosWithTag(videoIds, tagObj)
            }
        } else {
            console.log(`Tagged ${successCount}/${videoIds.length} videos`)
        }
    }

    updateVideosWithTag(videoIds, tagObj) {
        // Update in this.app.videos
        this.app.videos.forEach(video => {
            if (videoIds.includes(video.id)) {
                if (!video.tags) video.tags = []
                if (!video.tags.find(t => t.id === tagObj.id)) {
                    video.tags.push(tagObj)
                }
            }
        })

        // Update in this.app.allVideos
        this.app.allVideos.forEach(video => {
            if (videoIds.includes(video.id)) {
                if (!video.tags) video.tags = []
                if (!video.tags.find(t => t.id === tagObj.id)) {
                    video.tags.push(tagObj)
                }
            }
        })

        // Update stored group videos
        if (this.currentSimilarGroupVideos) {
            this.currentSimilarGroupVideos.forEach(video => {
                if (videoIds.includes(video.id)) {
                    if (!video.tags) video.tags = []
                    if (!video.tags.find(t => t.id === tagObj.id)) {
                        video.tags.push(tagObj)
                    }
                }
            })
        }
    }

    // ============ Duplicates Review View ============

    async showDuplicatesReviewView() {
        console.log('Entering Duplicates Review View')

        // Save current state
        this.previousViewState = {
            videos: [...this.app.videos],
            allVideos: [...this.app.allVideos],
            currentSearchQuery: this.app.currentSearchQuery,
            currentTagFilter: this.app.currentTagFilter,
            currentFolderFilter: [...this.app.currentFolderFilter],
            currentSort: this.app.currentSort,
            currentView: this.app.currentView,
            currentCategory: this.app.currentCategory,
            currentSubcategory: this.app.currentSubcategory
        }

        this.duplicatesReviewActive = true

        // Hide other views
        document.getElementById('videoGrid').style.display = 'none'
        document.getElementById('folderExplorer').style.display = 'none'
        document.getElementById('seriesView').style.display = 'none'
        document.getElementById('listViewControls').style.display = 'none'
        document.getElementById('categories').style.display = 'none'
        document.getElementById('breadcrumbNav').style.display = 'none'

        // Show duplicates review view
        document.getElementById('duplicatesReviewView').style.display = 'flex'

        await this.loadDuplicatesReviewData()
    }

    async loadDuplicatesReviewData() {
        try {
            console.log('Loading duplicate groups...')

            // Fetch all dup-* tags
            const tagsResponse = await fetch(`${this.app.apiBase}/tags`)
            const allTags = await tagsResponse.json()
            const dupTags = allTags.filter(tag => tag.name.startsWith('dup-'))

            if (dupTags.length === 0) {
                console.log('No duplicate groups found')
                this.exitDuplicatesReviewView()
                return
            }

            console.log(`Found ${dupTags.length} duplicate tags`)

            // Fetch videos for each tag
            const groups = []
            for (const tag of dupTags) {
                const videosResponse = await fetch(`${this.app.apiBase}/search?tags=${encodeURIComponent(tag.name)}`)
                if (videosResponse.ok) {
                    const videos = await videosResponse.json()
                    console.log(`Tag ${tag.name}: found ${videos.length} videos`)
                    if (videos.length > 0) {
                        const videosWithSimilarity = videos.map((video, index) => ({
                            ...video,
                            similarity_percent: index === 0 ? 100 : 95 - (index * 2)
                        }))

                        groups.push({
                            tag: tag,
                            count: videos.length,
                            videos: videosWithSimilarity
                        })
                    }
                }
            }

            // Sort by count
            groups.sort((a, b) => b.count - a.count)

            this.duplicatesReviewData = {
                groups: groups,
                totalGroups: groups.length,
                totalVideos: groups.reduce((sum, g) => sum + g.count, 0)
            }

            this.renderDuplicatesReviewView()

            console.log(`Found ${groups.length} duplicate groups with ${this.duplicatesReviewData.totalVideos} videos`)

        } catch (error) {
            console.error('Error loading duplicates review data:', error)
            console.log('Failed to load duplicate groups')
            this.duplicatesReviewActive = false
        }
    }

    renderDuplicatesReviewView() {
        const container = document.getElementById('duplicatesReviewContent')
        const countSpan = document.getElementById('duplicatesReviewCount')

        if (!container) return

        if (countSpan) {
            countSpan.textContent = `${this.duplicatesReviewData.totalGroups} groups, ${this.duplicatesReviewData.totalVideos} videos`
        }

        container.innerHTML = ''

        const groupsContainer = document.createElement('div')
        groupsContainer.className = 'duplicate-groups-container'

        this.duplicatesReviewData.groups.forEach((group, groupIndex) => {
            const groupSection = document.createElement('div')
            groupSection.className = 'duplicate-group-section'

            const groupHeader = document.createElement('div')
            groupHeader.className = 'duplicate-group-header'

            groupHeader.innerHTML = `
                <div class="duplicate-group-header-left">
                    <span class="duplicate-group-number">Group ${groupIndex + 1}</span>
                    <span class="duplicate-group-count">${group.count} videos</span>
                </div>
                <div class="duplicate-group-header-right">
                    <span class="duplicate-group-tagged">Tagged: ${group.tag.name}</span>
                </div>
            `
            groupSection.appendChild(groupHeader)

            const groupGrid = document.createElement('div')
            groupGrid.className = 'duplicate-group-grid'
            if (this.app.verticalMode) {
                groupGrid.classList.add('vertical-mode')
            }

            group.videos.forEach((video, videoIndex) => {
                const videoWithMeta = {
                    ...video,
                    _similarity: video.similarity_percent,
                    _isOriginal: videoIndex === 0
                }
                const videoCard = this.app.createVideoCard(videoWithMeta)
                groupGrid.appendChild(videoCard)
            })

            groupSection.appendChild(groupGrid)
            groupsContainer.appendChild(groupSection)
        })

        container.appendChild(groupsContainer)
    }

    exitDuplicatesReviewView() {
        console.log('Exiting Duplicates Review View')

        this.duplicatesReviewActive = false
        this.duplicatesReviewData = null

        document.getElementById('duplicatesReviewView').style.display = 'none'

        if (this.previousViewState) {
            console.log('Restoring previous view state')

            this.app.videos = [...this.previousViewState.videos]
            this.app.allVideos = [...this.previousViewState.allVideos]
            this.app.currentSearchQuery = this.previousViewState.currentSearchQuery
            this.app.currentTagFilter = this.previousViewState.currentTagFilter
            this.app.currentFolderFilter = [...this.previousViewState.currentFolderFilter]
            this.app.currentSort = this.previousViewState.currentSort

            document.getElementById('listViewControls').style.display = 'block'

            if (this.previousViewState.currentView === 'explorer') {
                this.app.currentView = 'explorer'
                this.app.currentCategory = this.previousViewState.currentCategory
                this.app.currentSubcategory = this.previousViewState.currentSubcategory

                document.getElementById('videoGrid').style.display = 'none'
                document.getElementById('folderExplorer').style.display = 'block'
                this.app.renderFolderExplorer()
            } else {
                this.app.currentView = 'list'
                document.getElementById('folderExplorer').style.display = 'none'
                document.getElementById('videoGrid').style.display = 'grid'
                document.getElementById('videoGrid').innerHTML = ''
                this.app.renderVideoGrid()
            }

            this.previousViewState = null
        } else {
            document.getElementById('listViewControls').style.display = 'block'
            document.getElementById('videoGrid').style.display = 'grid'
            document.getElementById('videoGrid').innerHTML = ''
            this.app.renderVideoGrid()
        }

        console.log('Returned to collection')
    }

    // ============ Find Duplicates in Folder ============

    async findDuplicatesInFolder(folderName) {
        this.app.hideFolderMenu()

        try {
            console.log(`Searching for duplicates within "${folderName}" folder...`)

            const folderVideosResponse = await fetch(`${this.app.apiBase}/videos/${encodeURIComponent(folderName)}`)
            if (!folderVideosResponse.ok) {
                throw new Error('Failed to fetch folder videos')
            }

            const folderData = await folderVideosResponse.json()
            const folderVideos = folderData.videos || []

            const fingerprintedVideoIds = folderVideos
                .filter(v => v.fingerprint_generated === 1)
                .map(v => v.id)

            if (fingerprintedVideoIds.length === 0) {
                console.log(`No fingerprinted videos found in "${folderName}". Generate fingerprints first!`)
                return
            }

            if (fingerprintedVideoIds.length < 2) {
                console.log(`Only ${fingerprintedVideoIds.length} fingerprinted video in "${folderName}". Need at least 2.`)
                return
            }

            const url = `${this.app.apiBase}/api/fingerprints/find-all-duplicates?threshold=10&folder=${encodeURIComponent(folderName)}`
            const response = await fetch(url)
            if (!response.ok) {
                throw new Error('Failed to find duplicates')
            }

            const data = await response.json()

            if (data.total_groups === 0) {
                console.log(`No duplicates found in "${folderName}"`)
                return
            }

            this.showDuplicateGroupsView(data)
            console.log(`Found ${data.total_groups} duplicate groups in "${folderName}"`)

        } catch (error) {
            console.error('Error finding folder duplicates:', error)
            console.log('Failed to find duplicates in folder')
        }
    }

    // ============ Utility Methods ============

    generateDuplicateTag(videoIds) {
        const sortedIds = [...videoIds].sort((a, b) => a - b)
        const idsString = sortedIds.join('-')
        let hash = 0
        for (let i = 0; i < idsString.length; i++) {
            const char = idsString.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash
        }
        const hashHex = Math.abs(hash).toString(16).slice(0, 4)
        return `dup-${sortedIds.length}v-${hashHex}`
    }

    // ============ Overlay Methods ============

    showDuplicateSearchOverlay(text = '', progress = 0, isError = false, autoDismiss = false) {
        const overlay = document.getElementById('duplicateSearchOverlay')
        const textEl = document.getElementById('duplicateSearchOverlayText')
        const progressBar = document.getElementById('duplicateSearchProgressBar')

        overlay.style.display = 'flex'

        if (text) textEl.textContent = text

        if (progressBar) {
            progressBar.style.width = `${progress}%`
        }

        if (isError) {
            textEl.style.color = '#fca5a5'
            if (progressBar) {
                progressBar.style.background = '#ef4444'
            }
        } else {
            textEl.style.color = 'rgba(255, 255, 255, 0.9)'
            if (progressBar) {
                progressBar.style.background = 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
            }
        }

        if (autoDismiss) {
            setTimeout(() => {
                this.hideDuplicateSearchOverlay()
            }, 1500)
        }
    }

    hideDuplicateSearchOverlay() {
        const overlay = document.getElementById('duplicateSearchOverlay')
        const textEl = document.getElementById('duplicateSearchOverlayText')
        const progressBar = document.getElementById('duplicateSearchProgressBar')

        overlay.classList.add('fade-out')

        setTimeout(() => {
            overlay.style.display = 'none'
            overlay.classList.remove('fade-out')

            if (textEl) {
                textEl.style.color = 'rgba(255, 255, 255, 0.9)'
            }
            if (progressBar) {
                progressBar.style.width = '0%'
                progressBar.style.background = 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)'
            }
        }, 300)
    }

    // ============ Merge Groups ============

    async mergeGroupsAndTag(newVideoIds, existingDupTags) {
        // Get all videos with existing dup tags
        const allVideoIdsToTag = new Set(newVideoIds)

        for (const tagName of existingDupTags) {
            try {
                const response = await fetch(`${this.app.apiBase}/search?tags=${encodeURIComponent(tagName)}`)
                if (response.ok) {
                    const videos = await response.json()
                    videos.forEach(v => allVideoIdsToTag.add(v.id))
                }
            } catch (error) {
                console.error(`Error fetching videos for tag ${tagName}:`, error)
            }
        }

        // Generate new tag for merged group
        const mergedVideoIds = Array.from(allVideoIdsToTag)
        const newTagName = this.generateDuplicateTag(mergedVideoIds)

        console.log(`Merging ${existingDupTags.size} groups into new tag: ${newTagName}`)

        // Tag all videos with new tag
        let successCount = 0
        for (const videoId of mergedVideoIds) {
            try {
                const response = await fetch(`${this.app.apiBase}/videos/${videoId}/tags?tag_name=${encodeURIComponent(newTagName)}`, {
                    method: 'POST'
                })
                if (response.ok) {
                    successCount++
                }
            } catch (error) {
                console.error(`Failed to tag video ${videoId}:`, error)
            }
        }

        console.log(`Tagged ${successCount}/${mergedVideoIds.length} videos with "${newTagName}"`)

        // Update UI
        const tagButton = document.querySelector('.similar-videos-group-container .duplicate-group-tag-btn')
        if (tagButton) {
            tagButton.outerHTML = `<span class="duplicate-group-tagged">Tagged: ${newTagName}</span>`
        }

        // Reload and update
        await this.app.loadAllTags()
        const tagObj = this.app.allTags.find(t => t.name === newTagName)
        if (tagObj) {
            this.updateVideosWithTag(mergedVideoIds, tagObj)
        }
    }
}

// Export as global
window.DuplicateReviewModule = DuplicateReviewModule
