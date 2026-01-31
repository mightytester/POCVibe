/**
 * ContextMenuModule - Video and Face context menu management
 * Handles menu rendering, positioning, and action delegation
 */
class ContextMenuModule {
    constructor(app) {
        this.app = app
        this.api = app.api

        // Context state
        this.contextMenuVideoId = null
        this.contextMenuVideoName = null

        // Bind methods for event listeners
        this.handleContextMenuClickOutside = this.handleContextMenuClickOutside.bind(this)
        this.handleFaceContextMenuClickOutside = this.handleFaceContextMenuClickOutside.bind(this)
    }

    // ============ Video Context Menu ============

    showVideoContextMenu(event, videoId, videoName) {
        // Close any existing context menu
        this.hideVideoContextMenu()

        // Store video info for menu actions
        this.contextMenuVideoId = videoId
        this.contextMenuVideoName = videoName

        // Get video to check status flags
        const video = this.app.videos.find(v => v.id === videoId) ||
                      this.app.allVideos.find(v => v.id === videoId)
        const isFingerprinted = video && video.fingerprint_generated
        const hasMetadata = video && video.duration !== null && video.duration !== undefined
        const isFinal = video && video.is_final
        const isInDeleteFolder = video && video.category === 'DELETE'

        const menuHtml = `
            <div class="context-menu-item" onclick="app.contextMenu.refreshVideoFromContext()">
                <span class="context-menu-icon">🔄</span>
                <span>Refresh</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.checkDuplicateFromContext()">
                <span class="context-menu-icon">🔍</span>
                <span>Find Similar</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.contextMenu.autoScanFacesFromContext()">
                <span class="context-menu-icon">👤</span>
                <span>Auto-Scan Faces</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.autoScanFacesFromContext(3)">
                <span class="context-menu-icon">⚡</span>
                <span>Auto-Scan (Fast - First 3s)</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.reviewVideoFacesFromContext()">
                <span class="context-menu-icon">👥</span>
                <span>Review Faces</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.showSeriesModalFromContext()">
                <span class="context-menu-icon">📺</span>
                <span>Series Info</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.toggleFinalFromContext()">
                <span class="context-menu-icon">${isFinal ? '⭐' : '💎'}</span>
                <span>${isFinal ? 'Unmark as Final' : 'Mark as Final'}</span>
            </div>
            <div class="context-menu-separator"></div>
            ${isFingerprinted
                ? `<div class="context-menu-item" onclick="app.contextMenu.removeFingerprintFromContext()">
                    <span class="context-menu-icon">🔓</span>
                    <span>Remove Fingerprint</span>
                  </div>
                  <div class="context-menu-item" onclick="app.contextMenu.viewFingerprintsFromContext()">
                    <span class="context-menu-icon">👁️</span>
                    <span>View Fingerprints</span>
                  </div>`
                : `<div class="context-menu-item" onclick="app.contextMenu.addFingerprintFromContext()">
                    <span class="context-menu-icon">🔒</span>
                    <span>Generate Fingerprint</span>
                  </div>`
            }
            ${!hasMetadata
                ? `<div class="context-menu-item" onclick="app.contextMenu.loadMetadataFromContext()">
                    <span class="context-menu-icon">⚡</span>
                    <span>Scan Metadata</span>
                  </div>`
                : ''
            }
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.contextMenu.openRenameModalFromContext()">
                <span class="context-menu-icon">✏️</span>
                <span>Rename</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.hashRenameVideoFromContext()">
                <span class="context-menu-icon">🔐</span>
                <span>Hash-Based Rename</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.addActorFromContext()">
                <span class="context-menu-icon">👤</span>
                <span>Add Actor</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.addSceneFromContext()">
                <span class="context-menu-icon">📝</span>
                <span>Add Scene Description</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.sanitizeFilenameFromContext()">
                <span class="context-menu-icon">🧹</span>
                <span>Sanitize Filename</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.openEditVideoModalFromContext()">
                <span class="context-menu-icon">✂️</span>
                <span>Edit Video</span>
            </div>
            <div class="context-menu-item" onclick="app.contextMenu.addAudioFromContext()">
                <span class="context-menu-icon">🎵</span>
                <span>Add Audio</span>
            </div>
            ${isInDeleteFolder
                ? `<div class="context-menu-item context-menu-delete" onclick="app.contextMenu.permanentDeleteVideoFromContext()">
                    <span class="context-menu-icon">⚠️</span>
                    <span>Delete Permanently</span>
                  </div>`
                : `<div class="context-menu-item context-menu-delete" onclick="app.contextMenu.deleteVideoFromContext()">
                    <span class="context-menu-icon">🗑️</span>
                    <span>Move to Trash</span>
                  </div>`
            }
        `

        // Create menu element
        const menu = document.createElement('div')
        menu.id = 'videoContextMenu'
        menu.className = 'video-context-menu'
        menu.innerHTML = menuHtml

        // Position menu near the click
        const rect = event.target.getBoundingClientRect()
        menu.style.position = 'fixed'
        menu.style.top = `${rect.bottom + 5}px`
        menu.style.left = `${rect.left}px`

        // Temporarily append to measure
        document.body.appendChild(menu)
        const menuRect = menu.getBoundingClientRect()

        // Smart positioning to keep menu on screen
        let top = rect.bottom + 5
        let left = rect.left

        // Check right edge
        if (menuRect.right > window.innerWidth - 10) {
            left = Math.max(10, window.innerWidth - menuRect.width - 10)
        }

        // Check bottom edge - show above if needed
        if (menuRect.bottom > window.innerHeight - 10) {
            top = Math.max(10, rect.top - menuRect.height - 5)
        }

        // Check top edge
        if (top < 10) {
            top = rect.bottom + 5
        }

        // Check left edge
        if (left < 10) {
            left = 10
        }

        // Add max-height to ensure menu doesn't overflow
        const maxHeight = window.innerHeight - Math.max(top, 10) - 10
        if (maxHeight < menuRect.height) {
            menu.style.maxHeight = `${maxHeight}px`
            menu.style.overflowY = 'auto'
        }

        menu.style.top = `${top}px`
        menu.style.left = `${left}px`

        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.handleContextMenuClickOutside, { once: true })
        }, 0)
    }

    hideVideoContextMenu() {
        const existingMenu = document.getElementById('videoContextMenu')
        if (existingMenu) {
            existingMenu.remove()
        }
    }

    handleContextMenuClickOutside(event) {
        const menu = document.getElementById('videoContextMenu')
        if (menu && !menu.contains(event.target)) {
            this.hideVideoContextMenu()
        }
    }

    // ============ Face Context Menu ============

    showFaceSearchContextMenu(event, faceId, faceName) {
        this.hideFaceSearchContextMenu()

        const menuHtml = `
            <div class="context-menu-item" onclick="app.contextMenu.searchVideosWithFaceFromContext(${faceId}, '${faceName.replace(/'/g, "\\'")}')">
                <span class="context-menu-icon">🔍</span>
                <span>Search all videos with this face</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.filterByFace(${faceId}, '${faceName.replace(/'/g, "\\'")}')">
                <span class="context-menu-icon">👤</span>
                <span>Filter (current view)</span>
            </div>
            <div class="context-menu-separator"></div>
            <div class="context-menu-item" onclick="app.showFaceEmbeddingsModal(${faceId}, '${faceName.replace(/'/g, "\\'")}')">
                <span class="context-menu-icon">🎞️</span>
                <span>Review Embeddings</span>
            </div>
            <div class="context-menu-item context-menu-delete" onclick="app.contextMenu.deleteFaceIDFromContext(${faceId}, '${faceName.replace(/'/g, "\\'")}')">
                <span class="context-menu-icon">🗑️</span>
                <span>Delete Face ID</span>
            </div>
        `

        const menu = document.createElement('div')
        menu.id = 'faceContextMenu'
        menu.className = 'video-context-menu'
        menu.innerHTML = menuHtml

        // Position menu near the click
        const rect = event.target.getBoundingClientRect()
        menu.style.position = 'fixed'
        menu.style.top = `${rect.bottom + 5}px`
        menu.style.left = `${rect.left}px`

        // Adjust position if menu would go off screen
        document.body.appendChild(menu)
        const menuRect = menu.getBoundingClientRect()
        if (menuRect.right > window.innerWidth) {
            menu.style.left = `${rect.right - menuRect.width}px`
        }
        if (menuRect.bottom > window.innerHeight) {
            menu.style.top = `${rect.top - menuRect.height - 5}px`
        }

        // Add click outside to close
        setTimeout(() => {
            document.addEventListener('click', this.handleFaceContextMenuClickOutside, { once: true })
        }, 0)
    }

    hideFaceSearchContextMenu() {
        const existingMenu = document.getElementById('faceContextMenu')
        if (existingMenu) {
            existingMenu.remove()
        }
    }

    handleFaceContextMenuClickOutside(event) {
        const menu = document.getElementById('faceContextMenu')
        if (menu && !menu.contains(event.target)) {
            this.hideFaceSearchContextMenu()
        }
    }

    // ============ Video Context Menu Actions ============

    refreshVideoFromContext() {
        if (this.contextMenuVideoId) {
            this.app.refreshVideo(this.contextMenuVideoId)
            this.hideVideoContextMenu()
        }
    }

    async checkDuplicateFromContext() {
        if (this.contextMenuVideoId) {
            await this.app.checkIfDuplicate(this.contextMenuVideoId)
            this.hideVideoContextMenu()
        }
    }

    async autoScanFacesFromContext(maxDuration = null) {
        if (this.contextMenuVideoId) {
            this.hideVideoContextMenu()
            await this.app.autoScanFacesForVideo(this.contextMenuVideoId, 10, maxDuration)
        }
    }

    reviewVideoFacesFromContext() {
        if (this.contextMenuVideoId) {
            this.hideVideoContextMenu()
            this.app.showVideoFacesReviewModal(this.contextMenuVideoId)
        }
    }

    showSeriesModalFromContext() {
        const videoId = this.contextMenuVideoId
        const videoName = this.contextMenuVideoName

        if (!videoId) {
            console.error('No video ID for series modal')
            return
        }

        // Find the video to get current series info
        const video = this.app.videos.find(v => v.id === videoId) ||
                      this.app.allVideos.find(v => v.id === videoId)

        // Store current video
        this.app.currentVideo = { id: videoId, name: videoName }

        // Populate form with current values
        document.getElementById('seriesName').value = video?.series || ''
        document.getElementById('seriesSeason').value = video?.season || ''
        document.getElementById('seriesEpisode').value = video?.episode || ''

        // Show modal
        document.getElementById('seriesModal').style.display = 'flex'
        document.getElementById('seriesName').focus()

        // Hide context menu
        this.hideVideoContextMenu()
    }

    async toggleFinalFromContext(saveAndMarkFinal = false) {
        if (this.contextMenuVideoId) {
            const video = this.app.videos.find(v => v.id === this.contextMenuVideoId) ||
                          this.app.allVideos.find(v => v.id === this.contextMenuVideoId)
            if (!video) return

            if (saveAndMarkFinal && !video.is_final) {
                try {
                    const response = await fetch(`${this.app.apiBase}/api/videos/${this.contextMenuVideoId}/metadata`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            description: video.description || '',
                            is_final: true
                        })
                    })

                    if (response.ok) {
                        video.is_final = true
                        console.log(`✅ Saved and marked as Final`)
                        this.app.rerenderVideos()
                    }
                } catch (error) {
                    console.error('Error saving and marking final:', error)
                    console.log('❌ Failed to save and mark as final')
                }
            } else {
                await this.app.toggleFinalStatus(this.contextMenuVideoId)
            }
            this.hideVideoContextMenu()
        }
    }

    async removeFingerprintFromContext() {
        if (this.contextMenuVideoId) {
            await this.app.removeFingerprintFromLibrary(this.contextMenuVideoId)
            this.hideVideoContextMenu()
        }
    }

    viewFingerprintsFromContext() {
        const videoId = this.contextMenuVideoId
        const videoName = this.contextMenuVideoName

        this.app.showFingerprintViewer(videoId, videoName)
        this.hideVideoContextMenu()
    }

    async addFingerprintFromContext() {
        if (this.contextMenuVideoId) {
            const video = this.app.videos.find(v => v.id === this.contextMenuVideoId)
            if (video) {
                this.app.openFingerprintGenerationModal(video)
            }
            this.hideVideoContextMenu()
        }
    }

    async loadMetadataFromContext() {
        if (this.contextMenuVideoId) {
            await this.app.loadMetadataForVideo(this.contextMenuVideoId)
            this.hideVideoContextMenu()
        }
    }

    openRenameModalFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.app.showRenameModal(this.contextMenuVideoId, this.contextMenuVideoName)
        }
    }

    async hashRenameVideoFromContext() {
        if (!this.contextMenuVideoId) return

        const video = this.app.videos.find(v => v.id === this.contextMenuVideoId) ||
                      this.app.allVideos.find(v => v.id === this.contextMenuVideoId)
        if (!video) return

        this.hideVideoContextMenu()
        console.log(`Renaming "${video.name}" to hash-based name...`)

        try {
            const response = await fetch(`/api/videos/${this.contextMenuVideoId}/hash-rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })

            const result = await response.json()

            if (!response.ok) {
                throw new Error(result.detail || 'Failed to rename video')
            }

            // Update local video object
            if (result.video) {
                const videoIndex = this.app.videos.findIndex(v => v.id === this.contextMenuVideoId)
                if (videoIndex !== -1) {
                    this.app.videos[videoIndex] = result.video
                }
                const allVideoIndex = this.app.allVideos.findIndex(v => v.id === this.contextMenuVideoId)
                if (allVideoIndex !== -1) {
                    this.app.allVideos[allVideoIndex] = result.video
                }
            }

            console.log(`✓ Renamed to: ${result.new_name}`)

            // Refresh the view
            this.app.rerenderVideos()
        } catch (error) {
            console.error('Error renaming video:', error)
            console.log(error.message || 'Failed to rename video')
        }
    }

    addActorFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.app.showActorModal(this.contextMenuVideoId, this.contextMenuVideoName)
            this.hideVideoContextMenu()
        }
    }

    addSceneFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.app.showSceneDescriptionModal(this.contextMenuVideoId, this.contextMenuVideoName)
            this.hideVideoContextMenu()
        }
    }

    sanitizeFilename(filename) {
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename
        const extension = filename.substring(filename.lastIndexOf('.'))

        let sanitized = nameWithoutExt
            .replace(/['"`]/g, '-')
            .replace(/[<>|?*:\/\\]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '')
            .replace(/[^\x20-\x7E]/g, '')

        return sanitized + extension
    }

    async sanitizeFilenameFromContext() {
        if (!this.contextMenuVideoId || !this.contextMenuVideoName) {
            return
        }

        this.hideVideoContextMenu()

        const originalName = this.contextMenuVideoName
        const sanitizedName = this.sanitizeFilename(originalName)

        if (originalName === sanitizedName) {
            console.log('✅ Filename is already clean')
            return
        }

        const confirmed = confirm(
            `Sanitize filename?\n\n` +
            `Original:\n${originalName}\n\n` +
            `Sanitized:\n${sanitizedName}\n\n` +
            `This will rename the file on disk.`
        )

        if (!confirmed) return

        try {
            console.log('🧹 Sanitizing filename...')

            const response = await fetch(`${this.app.apiBase}/videos/${this.contextMenuVideoId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_name: sanitizedName })
            })

            if (!response.ok) {
                const errorData = await response.json()
                throw new Error(errorData.detail || `HTTP ${response.status}`)
            }

            // Update video in cache
            const video = this.app.videos.find(v => v.id === this.contextMenuVideoId) ||
                          this.app.allVideos.find(v => v.id === this.contextMenuVideoId)
            if (video) {
                video.name = sanitizedName
            }

            // Re-render current view
            if (this.app.currentView === 'list') {
                this.app.renderVideoGrid()
            } else if (this.app.currentView === 'explorer' && this.app.currentCategory) {
                await this.app.loadAndShowVideosInFolder(this.app.currentCategory, this.app.currentSubcategory)
            }

            console.log(`✅ Filename sanitized successfully`)

        } catch (error) {
            console.error('❌ Error sanitizing filename:', error)
            console.log(`❌ Failed to sanitize: ${error.message}`)
        }
    }

    openEditVideoModalFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.app.showVideoEditorModal(this.contextMenuVideoId, this.contextMenuVideoName)
            this.hideVideoContextMenu()
        }
    }

    addAudioFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            const video = this.app.videos.find(v => v.id === this.contextMenuVideoId) ||
                          this.app.allVideos.find(v => v.id === this.contextMenuVideoId)
            if (video) {
                this.app.currentVideo = video
                this.app.showAddAudioModal()
            }
            this.hideVideoContextMenu()
        }
    }

    deleteVideoFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.app.deleteVideo(this.contextMenuVideoId, this.contextMenuVideoName)
            this.hideVideoContextMenu()
        }
    }

    permanentDeleteVideoFromContext() {
        if (this.contextMenuVideoId && this.contextMenuVideoName) {
            this.app.permanentDeleteVideo(this.contextMenuVideoId, this.contextMenuVideoName)
            this.hideVideoContextMenu()
        }
    }

    // ============ Face Context Menu Actions ============

    searchVideosWithFaceFromContext(faceId, faceName) {
        this.app.filterByFace(faceId, faceName)
        this.hideFaceSearchContextMenu()
    }

    deleteFaceIDFromContext(faceId, faceName) {
        this.hideFaceSearchContextMenu()
        this.app.deleteEntireFaceID(faceId, faceName)
    }
}

// Export as global
window.ContextMenuModule = ContextMenuModule
