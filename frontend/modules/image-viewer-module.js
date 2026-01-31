/**
 * ImageViewerModule - Image viewer functionality
 * Handles image viewing, navigation, keyboard controls, zoom/pan
 */
class ImageViewerModule {
    constructor(app) {
        this.app = app

        // Image viewer state
        this.currentImageInViewer = null
        this.currentImageIndex = -1
        this.hasImageOpen = false
        this.savedScrollPosition = undefined

        // Event handlers
        this.imageKeyboardHandler = null
        this.imageFullscreenChangeHandler = null
        this.tagModalClickHandler = null
        this.tagModalKeyHandler = null
        this.moveModalClickHandler = null
        this.moveModalKeyHandler = null

        // Current modal state
        this.currentItem = null
        this.currentMoveImage = null
    }

    // ============ Open/Close Image Viewer ============

    openImageViewer(image) {
        console.log('Opening image viewer for:', image)

        const modal = document.getElementById('imageModal')
        const imageViewer = document.getElementById('imageViewer')
        const imageTitle = document.getElementById('imageTitle')
        const controlsHint = document.getElementById('imageControlsHint')
        const isMobile = this.app.isMobileDevice()

        const isImageSwitch = modal.style.display === 'flex'

        if (!isImageSwitch) {
            this.savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop
            console.log(`Saved scroll position: ${this.savedScrollPosition}px`)
        }

        this.currentImageInViewer = image
        this.currentImageIndex = this.app.allVideos.findIndex(v => v.id === image.id)

        if (isMobile) {
            imageTitle.style.display = 'none'
        } else {
            imageTitle.style.display = 'block'
            imageTitle.textContent = image.name
        }

        const imagePath = this.app.getVideoStreamingPath(image)
        const imageUrl = `${this.app.apiBase}/stream/${image.category}/${imagePath}`

        console.log(`Image URL: ${imageUrl}`)
        imageViewer.src = imageUrl
        modal.style.display = 'flex'

        document.body.classList.add('video-modal-open')

        if (!isMobile) {
            controlsHint.classList.add('show')
            setTimeout(() => {
                controlsHint.classList.remove('show')
            }, 4000)
        }

        this.setupImageKeyboardControls()
        this.app.setupCurationMode(null)

        if (this.app.curationBarVisible) {
            const curationBar = document.getElementById('curationActionBar')
            if (curationBar) {
                curationBar.classList.add('visible')
                this.app.updateCurationFavoriteButton()
            }
        }

        if (isMobile) {
            this.setupImageSwipeNavigation()
            if (document.fullscreenElement) {
                console.log('Image changed while in fullscreen - reset zoom/pan transforms')
                if (imageViewer) {
                    imageViewer.style.transform = 'scale(1) translate(0px, 0px)'
                }
            }
        }

        this.imageFullscreenChangeHandler = () => {
            if (document.fullscreenElement && isMobile) {
                console.log('Entered fullscreen - enabling zoom/pan')
                requestAnimationFrame(() => {
                    this.setupImageZoomPan()
                })
            } else if (!document.fullscreenElement && isMobile) {
                console.log('Exited fullscreen on mobile')
                this.cleanupImageZoomPan()
            }
        }
        document.addEventListener('fullscreenchange', this.imageFullscreenChangeHandler)

        this.hasImageOpen = true
    }

    hideImageViewer(isTransition = false) {
        const modal = document.getElementById('imageModal')
        const imageViewer = document.getElementById('imageViewer')
        const controlsHint = document.getElementById('imageControlsHint')

        console.log('Closing image viewer')

        // Clear auto-scan state
        this.app.autoScanDetectedFaces = []
        this.app.selectedAutoScanFaces = new Set()
        this.app.autoScanImageSource = null
        this.app.currentFaceSearchData = null
        this.app.pendingBulkFaces = null
        this.app.detectedFaces = []

        // Check if returning to face detail modal
        if (this.app.playingVideoFromFaceDetail && this.app.currentFaceForDetail) {
            console.log('Returning to face detail modal from image')
            modal.style.display = 'none'
            imageViewer.src = ''
            document.body.classList.remove('video-modal-open')
            controlsHint.classList.remove('show')
            this.currentImageInViewer = null
            this.hasImageOpen = false
            this.cleanupImageKeyboardControls()
            this.cleanupImageSwipeNavigation()
            this.cleanupImageZoomPan()

            if (this.imageFullscreenChangeHandler) {
                document.removeEventListener('fullscreenchange', this.imageFullscreenChangeHandler)
                this.imageFullscreenChangeHandler = null
            }

            this.app.showFaceDetailModal(this.app.currentFaceForDetail)
            this.app.playingVideoFromFaceDetail = false
            return
        }

        imageViewer.src = ''
        modal.style.display = 'none'
        document.body.classList.remove('video-modal-open')

        if (this.savedScrollPosition !== undefined) {
            window.scrollTo(0, this.savedScrollPosition)
            console.log(`Restored scroll position: ${this.savedScrollPosition}px`)
            this.savedScrollPosition = undefined
        }

        controlsHint.classList.remove('show')
        this.currentImageInViewer = null
        this.hasImageOpen = false

        this.cleanupImageKeyboardControls()

        if (this.app.curationCleanup) {
            this.app.curationCleanup()
        }
        const curationActionBar = document.getElementById('curationActionBar')
        if (curationActionBar) {
            curationActionBar.classList.remove('visible')
        }

        if (!isTransition) {
            this.app.curationBarVisible = false
        }

        this.cleanupImageSwipeNavigation()
        this.cleanupImageZoomPan()

        if (this.imageFullscreenChangeHandler) {
            document.removeEventListener('fullscreenchange', this.imageFullscreenChangeHandler)
            this.imageFullscreenChangeHandler = null
        }
    }

    // ============ Navigation ============

    showNextImage() {
        if (!this.app.allVideos || this.app.allVideos.length === 0) return

        const nextIndex = (this.currentImageIndex + 1) % this.app.allVideos.length
        const nextItem = this.app.allVideos[nextIndex]

        this.currentImageIndex = nextIndex

        if (nextItem.media_type === 'image') {
            this.openImageViewer(nextItem)
            this.app.updateCurationFavoriteButton()
        } else {
            this.hideImageViewer(true)
            setTimeout(() => {
                this.app.playVideo(nextItem)
                this.app.updateCurationFavoriteButton()
            }, 200)
        }
    }

    showPreviousImage() {
        if (!this.app.allVideos || this.app.allVideos.length === 0) return

        const prevIndex = (this.currentImageIndex - 1 + this.app.allVideos.length) % this.app.allVideos.length
        const prevItem = this.app.allVideos[prevIndex]

        this.currentImageIndex = prevIndex

        if (prevItem.media_type === 'image') {
            this.openImageViewer(prevItem)
            this.app.updateCurationFavoriteButton()
        } else {
            this.hideImageViewer(true)
            setTimeout(() => {
                this.app.playVideo(prevItem)
                this.app.updateCurationFavoriteButton()
            }, 200)
        }
    }

    // ============ Keyboard Controls ============

    setupImageKeyboardControls() {
        this.imageKeyboardHandler = (e) => {
            if (!document.getElementById('imageModal') || document.getElementById('imageModal').style.display !== 'flex') {
                return
            }

            const currentItem = this.currentImageInViewer

            switch (e.key) {
                case 'Escape':
                    if (document.fullscreenElement) {
                        document.exitFullscreen().catch(err => {
                            console.warn('Exit fullscreen failed:', err)
                        })
                    } else {
                        this.hideImageViewer()
                    }
                    break
                case 'ArrowRight':
                    e.preventDefault()
                    this.showNextImage()
                    break
                case 'ArrowLeft':
                    e.preventDefault()
                    this.showPreviousImage()
                    break
                case 'f':
                case 'F':
                    e.preventDefault()
                    if (e.altKey) {
                        this.app.curationToggleFavorite()
                    } else {
                        const imageViewerContainer = document.querySelector('.image-viewer-container')
                        if (imageViewerContainer && imageViewerContainer.requestFullscreen) {
                            imageViewerContainer.requestFullscreen().catch(err => {
                                console.warn('Fullscreen request failed:', err)
                            })
                        }
                    }
                    break
                case 'd':
                case 'D':
                    e.preventDefault()
                    this.app.curationDeleteAndAdvance()
                    break
                case 'm':
                case 'M':
                    e.preventDefault()
                    if (currentItem) {
                        this.showMoveImageModal(currentItem.id, currentItem.name)
                    }
                    break
                case 'p':
                case 'P':
                    e.preventDefault()
                    if (currentItem) {
                        this.showTagImageModal(currentItem.id, currentItem.name)
                    }
                    break
                case 'r':
                case 'R':
                    e.preventDefault()
                    if (currentItem) {
                        this.app.addPerfectTag(currentItem.id, currentItem.name)
                    }
                    break
                case 's':
                case 'S':
                    e.preventDefault()
                    if (this.currentImageInViewer) {
                        console.log('Quick face search for image')
                        this.app.quickFaceSearchFromImage(this.currentImageInViewer)
                    }
                    break
                case 'x':
                case 'X':
                    e.preventDefault()
                    if (this.currentImageInViewer) {
                        console.log('Face extraction modal for image')
                        this.app.showFaceExtractionModal(this.currentImageInViewer)
                    }
                    break
                case 'a':
                case 'A':
                    e.preventDefault()
                    if (this.currentImageInViewer) {
                        console.log('Auto-scan faces for image')
                        this.app.autoScanImageFaces(this.currentImageInViewer)
                    }
                    break
                case 't':
                case 'T':
                    e.preventDefault()
                    if (this.currentImageInViewer) {
                        console.log('Capture thumbnail from image')
                        this.app.captureImageAsThumbnail(this.currentImageInViewer)
                    }
                    break
                case 'c':
                case 'C':
                    e.preventDefault()
                    if (this.currentImageInViewer) {
                        console.log('Copy image frame to clipboard')
                        this.app.copyImageFrameToClipboard(this.currentImageInViewer)
                    }
                    break
            }
        }

        document.addEventListener('keydown', this.imageKeyboardHandler)
    }

    cleanupImageKeyboardControls() {
        if (this.imageKeyboardHandler) {
            document.removeEventListener('keydown', this.imageKeyboardHandler)
            this.imageKeyboardHandler = null
        }
    }

    // ============ Move Modal ============

    showMoveImageModal(imageId, imageName) {
        this.currentMoveImage = { id: imageId, name: imageName }

        const modalTitle = document.getElementById('moveVideoPlayerTitle')
        modalTitle.textContent = `Move "${imageName}"`

        this.app.renderMoveFolderGrid()

        const modal = document.getElementById('moveVideoPlayerModal')
        modal.classList.add('active')
        modal.style.display = 'flex'

        this.moveModalClickHandler = (e) => {
            if (e.target === modal) {
                this.hideMoveImageModal()
            }
        }
        modal.addEventListener('click', this.moveModalClickHandler)

        this.moveModalKeyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                this.hideMoveImageModal()
            }
        }
        document.addEventListener('keydown', this.moveModalKeyHandler, true)
    }

    hideMoveImageModal() {
        const modal = document.getElementById('moveVideoPlayerModal')
        if (modal) {
            modal.classList.remove('active')
            modal.style.display = 'none'
        }

        if (this.moveModalClickHandler) {
            modal.removeEventListener('click', this.moveModalClickHandler)
            this.moveModalClickHandler = null
        }
        if (this.moveModalKeyHandler) {
            document.removeEventListener('keydown', this.moveModalKeyHandler, true)
            this.moveModalKeyHandler = null
        }

        this.currentMoveImage = null
    }

    async moveImageToFolder(folderName) {
        if (!this.currentMoveImage) return

        try {
            const searchList = this.app.allVideos && this.app.allVideos.length > 0 ? this.app.allVideos : this.app.videos
            const currentIndex = searchList.findIndex(v => v.id === this.currentMoveImage.id)

            let nextImageToShow = null
            if (currentIndex !== -1 && searchList.length > 1) {
                const nextIndex = currentIndex < searchList.length - 1 ? currentIndex + 1 : 0
                nextImageToShow = searchList[nextIndex]
            }

            const response = await fetch(`${this.app.apiBase}/api/videos/${this.currentMoveImage.id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_category: folderName })
            })

            if (response.ok) {
                console.log(`Moved image "${this.currentMoveImage.name}" to "${folderName}"`)

                const indexInAll = this.app.allVideos.findIndex(v => v.id === this.currentMoveImage.id)
                const indexInVideos = this.app.videos.findIndex(v => v.id === this.currentMoveImage.id)

                if (indexInAll !== -1) {
                    this.app.allVideos.splice(indexInAll, 1)
                }
                if (indexInVideos !== -1) {
                    this.app.videos.splice(indexInVideos, 1)
                }

                this.hideMoveImageModal()

                if (nextImageToShow) {
                    this.currentImageIndex = this.app.allVideos.findIndex(v => v.id === nextImageToShow.id)
                    if (nextImageToShow.media_type === 'image') {
                        this.openImageViewer(nextImageToShow)
                    } else {
                        this.hideImageViewer(true)
                        setTimeout(() => this.app.playVideo(nextImageToShow), 200)
                    }
                } else {
                    this.hideImageViewer()
                }
            } else {
                const err = await response.json().catch(() => ({}))
                console.log('Failed to move image:', err.detail || 'Unknown error')
            }
        } catch (error) {
            console.error('Error moving image:', error)
        }
    }

    // ============ Tag Modal ============

    showTagImageModal(imageId, imageName) {
        this.currentItem = { id: imageId, name: imageName }
        this.app.tagToggleInProgress = false

        const image = this.app.allVideos.find(v => v.id === imageId) || this.app.videos.find(v => v.id === imageId)
        this.app.currentVideoTags = image ? image.tags || [] : []

        const modalTitle = document.getElementById('tagVideoPlayerTitle')
        modalTitle.textContent = `Tag "${imageName}"`

        this.renderTagImagePlayerGrid()

        const modal = document.getElementById('tagVideoPlayerModal')
        modal.classList.add('active')
        modal.style.display = 'flex'

        this.tagModalClickHandler = (e) => {
            if (e.target === modal) {
                this.hideTagImageModal()
            }
        }
        modal.addEventListener('click', this.tagModalClickHandler)

        this.tagModalKeyHandler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                this.hideTagImageModal()
            }
        }
        document.addEventListener('keydown', this.tagModalKeyHandler, true)
    }

    hideTagImageModal() {
        const modal = document.getElementById('tagVideoPlayerModal')
        if (modal) {
            modal.classList.remove('active')
            modal.style.display = 'none'
        }

        if (this.tagModalClickHandler) {
            modal.removeEventListener('click', this.tagModalClickHandler)
            this.tagModalClickHandler = null
        }
        if (this.tagModalKeyHandler) {
            document.removeEventListener('keydown', this.tagModalKeyHandler, true)
            this.tagModalKeyHandler = null
        }

        this.currentItem = null
    }

    renderTagImagePlayerGrid() {
        const tagGrid = document.getElementById('tagVideoPlayerGrid')
        if (!tagGrid) return

        if (!this.app.allTags || this.app.allTags.length === 0) {
            tagGrid.innerHTML = '<p style="color: #999; padding: 20px; text-align: center;">No tags available</p>'
            return
        }

        const appliedTagIds = new Set(this.app.currentVideoTags.map(t => t.id))

        tagGrid.innerHTML = this.app.allTags.map(tag => `
            <div class="tag-suggestion ${appliedTagIds.has(tag.id) ? 'tag-applied' : ''}"
                 onclick="app.imageViewer.addTagToImageViewer('${tag.id}', '${this.app.escapeHtml(tag.name)}'); return false;">
                <span>${this.app.escapeHtml(tag.name)}</span>
                ${appliedTagIds.has(tag.id) ? '<span class="tag-check">OK</span>' : ''}
            </div>
        `).join('')
    }

    async addTagToImageViewer(tagId, tagName) {
        if (!this.currentItem) return

        if (this.app.tagToggleInProgress) return
        this.app.tagToggleInProgress = true

        try {
            const isApplied = this.app.currentVideoTags.some(tag => tag.id == tagId)

            if (isApplied) {
                const response = await fetch(`${this.app.apiBase}/videos/${this.currentItem.id}/tags/${tagId}`, {
                    method: 'DELETE'
                })

                if (response.ok) {
                    console.log(`Removed tag "${tagName}" from "${this.currentItem.name}"`)

                    this.app.currentVideoTags = this.app.currentVideoTags.filter(tag => tag.id != tagId)

                    const video = this.app.allVideos.find(v => v.id === this.currentItem.id) ||
                        this.app.videos.find(v => v.id === this.currentItem.id)
                    if (video && video.tags) {
                        video.tags = video.tags.filter(tag => tag.id != tagId)
                    }

                    this.app.updateVideoCardTags(this.currentItem.id)
                    this.renderTagImagePlayerGrid()
                } else {
                    const err = await response.json().catch(() => ({}))
                    console.log('Failed to remove tag:', err.detail || 'Unknown error')
                }
            } else {
                const response = await fetch(`${this.app.apiBase}/videos/${this.currentItem.id}/tags?tag_name=${encodeURIComponent(tagName)}`, {
                    method: 'POST'
                })

                if (response.ok) {
                    const result = await response.json()
                    console.log(`Added tag "${tagName}" to "${this.currentItem.name}"`)

                    this.app.currentVideoTags.push(result.tag)

                    const video = this.app.allVideos.find(v => v.id === this.currentItem.id) ||
                        this.app.videos.find(v => v.id === this.currentItem.id)
                    if (video) {
                        if (!video.tags) video.tags = []
                        video.tags.push(result.tag)
                    }

                    this.app.updateVideoCardTags(this.currentItem.id)
                    this.renderTagImagePlayerGrid()
                } else {
                    const err = await response.json().catch(() => ({}))
                    console.log('Failed to add tag:', err.detail || 'Unknown error')
                }
            }
        } catch (error) {
            console.error('Error toggling tag:', error)
        } finally {
            this.app.tagToggleInProgress = false
        }
    }

    // ============ Swipe Navigation ============

    setupImageSwipeNavigation() {
        // Implementation would be similar to video swipe navigation
        // Left out for brevity - can be added if needed
    }

    cleanupImageSwipeNavigation() {
        // Cleanup swipe handlers
    }

    // ============ Zoom/Pan ============

    setupImageZoomPan() {
        // Implementation for pinch-to-zoom and pan
        // Left out for brevity - can be added if needed
    }

    cleanupImageZoomPan() {
        // Cleanup zoom/pan handlers
    }

    setupEventListeners() {
        // Image modal close
        const closeImageModalBtn = document.getElementById('closeImageModal');
        if (closeImageModalBtn) {
            closeImageModalBtn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideImageViewer();
            };
            closeImageModalBtn.ontouchend = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideImageViewer();
            };
        }

        // Image player menu button
        const imageMenuBtn = document.getElementById('imagePlayerMenuBtn');
        if (imageMenuBtn) {
            imageMenuBtn.onclick = (e) => {
                e.stopPropagation();
                this.app.showVideoPlayerMenu(e); // Images use same menu
            };
        }

        // Image navigation buttons
        const nextBtn = document.getElementById('imageNextBtn');
        if (nextBtn) {
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                this.showNextImage();
            };
        }

        const prevBtn = document.getElementById('imagePrevBtn');
        if (prevBtn) {
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                this.showPreviousImage();
            };
        }
    }
}

// Export as global
window.ImageViewerModule = ImageViewerModule
