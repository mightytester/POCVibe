/**
 * CurationModeModule - Curation mode functionality
 * Handles mobile/desktop curation bar, gestures, and video seeking
 */
class CurationModeModule {
    constructor(app) {
        this.app = app

        // Curation mode state
        this.curationBarVisible = false
        this.curationEventListeners = null
        this.curationCleanup = null

        // Keyboard handler
        this.videoKeyboardHandler = null

        // Touch handlers
        this.touchSeekHandler = null
        this.swipeStartHandler = null
        this.swipeMoveHandler = null
        this.swipeEndHandler = null
        this.bottomSwipeStartHandler = null
        this.bottomSwipeEndHandler = null
    }

    // ============ Curation Mode Setup ============

    setupCurationMode(videoPlayer) {
        const actionBar = document.getElementById('curationActionBar')
        const curationFavBtn = document.getElementById('curationFavBtn')
        const curationDeleteBtn = document.getElementById('curationDeleteBtn')
        const curationNextBtn = document.getElementById('curationNextBtn')
        const curationCloseBtn = document.getElementById('curationCloseBtn')

        // Clean up old handlers
        if (this.curationEventListeners) {
            const { videoPlayer: oldVideoPlayer, imageViewer: oldImageViewer } = this.curationEventListeners
            if (oldVideoPlayer && oldVideoPlayer.handleTouchStart && oldVideoPlayer.handleTouchEnd) {
                oldVideoPlayer.removeEventListener('touchstart', oldVideoPlayer.handleTouchStart)
                oldVideoPlayer.removeEventListener('touchend', oldVideoPlayer.handleTouchEnd)
            }
            if (oldImageViewer && oldImageViewer.handleTouchStart && oldImageViewer.handleTouchEnd) {
                oldImageViewer.removeEventListener('touchstart', oldImageViewer.handleTouchStart)
                oldImageViewer.removeEventListener('touchend', oldImageViewer.handleTouchEnd)
            }
        }

        let hideTimeout = null

        const showCurationBar = () => {
            actionBar.classList.add('visible')
            this.updateCurationFavoriteButton()
            if (hideTimeout) clearTimeout(hideTimeout)
        }

        const hideCurationBar = () => {
            if (hideTimeout) clearTimeout(hideTimeout)
            actionBar.classList.remove('visible')
        }

        // Gesture detection
        let twoFingerTouchStart = false
        let threeFingerTouchStart = false

        const handleTouchStart = (e) => {
            if (e.touches.length === 2) {
                twoFingerTouchStart = true
                threeFingerTouchStart = false
            } else if (e.touches.length === 3) {
                threeFingerTouchStart = true
                twoFingerTouchStart = false
            } else {
                twoFingerTouchStart = false
                threeFingerTouchStart = false
            }
        }

        const handleTouchEnd = (e) => {
            if (twoFingerTouchStart && e.changedTouches.length >= 1) {
                twoFingerTouchStart = false
                const currentItem = this.app.currentVideoInPlayer || this.app.currentImageInViewer
                if (currentItem) {
                    if (this.app.isMobileDevice()) {
                        this.app.showMobileTagModal(currentItem.id, currentItem.name)
                    } else {
                        this.app.showTagModal(currentItem.id, currentItem.name)
                    }
                }
            } else if (threeFingerTouchStart && e.changedTouches.length >= 1) {
                threeFingerTouchStart = false
                if (this.curationBarVisible) {
                    hideCurationBar()
                    this.curationBarVisible = false
                } else {
                    showCurationBar()
                    this.curationBarVisible = true
                }
            } else if (e.touches.length === 0) {
                twoFingerTouchStart = false
                threeFingerTouchStart = false
            }
        }

        // Add listeners
        if (videoPlayer) {
            videoPlayer.addEventListener('touchstart', handleTouchStart, { passive: true })
            videoPlayer.addEventListener('touchend', handleTouchEnd, { passive: true })
            videoPlayer.handleTouchStart = handleTouchStart
            videoPlayer.handleTouchEnd = handleTouchEnd
        }

        const imageViewer = document.getElementById('imageViewer')
        if (imageViewer) {
            imageViewer.addEventListener('touchstart', handleTouchStart, { passive: true })
            imageViewer.addEventListener('touchend', handleTouchEnd, { passive: true })
            imageViewer.handleTouchStart = handleTouchStart
            imageViewer.handleTouchEnd = handleTouchEnd
        }

        this.curationEventListeners = { videoPlayer, imageViewer }

        // Desktop hint
        if (!this.app.isMobileDevice()) {
            const hintEl = document.getElementById('curationKeysHint')
            if (hintEl) hintEl.style.display = 'block'
        }

        // Button handlers
        curationFavBtn.onclick = () => this.curationToggleFavorite()

        const curationTagBtn = document.getElementById('curationTagBtn')
        curationTagBtn.onclick = () => {
            const currentItem = this.app.currentVideoInPlayer || this.app.currentImageInViewer
            if (currentItem) {
                if (this.app.isMobileDevice()) {
                    this.app.showMobileTagModal(currentItem.id, currentItem.name)
                } else {
                    this.app.showTagModal(currentItem.id, currentItem.name)
                }
            }
        }

        curationDeleteBtn.onclick = () => this.curationDeleteAndAdvance()
        curationNextBtn.onclick = () => this.app.playNextVideo()
        curationCloseBtn.onclick = () => {
            hideCurationBar()
            this.curationBarVisible = false
        }

        // Setup video player menu buttons
        this.setupVideoPlayerMenuButtons()
        this.setupImagePlayerMenuButtons()

        this.curationCleanup = () => {
            if (hideTimeout) clearTimeout(hideTimeout)
        }
    }

    setupVideoPlayerMenuButtons() {
        const videoMenuFavBtn = document.getElementById('videoMenuFavBtn')
        const videoMenuTagBtn = document.getElementById('videoMenuTagBtn')
        const videoMenuDeleteBtn = document.getElementById('videoMenuDeleteBtn')
        const videoMenuFaceSearchBtn = document.getElementById('videoMenuFaceSearchBtn')
        const videoMenuFaceBtn = document.getElementById('videoMenuFaceBtn')
        const videoMenuCloseBtn = document.getElementById('videoMenuCloseBtn')

        if (videoMenuFavBtn) {
            videoMenuFavBtn.onclick = () => {
                this.curationToggleFavorite()
                document.getElementById('videoPlayerMenu').style.display = 'none'
            }
        }
        if (videoMenuTagBtn) {
            videoMenuTagBtn.onclick = () => {
                const currentItem = this.app.currentVideoInPlayer
                if (currentItem) {
                    if (this.app.isMobileDevice()) {
                        this.app.showMobileTagModal(currentItem.id, currentItem.name)
                    } else {
                        this.app.showTagModal(currentItem.id, currentItem.name)
                    }
                }
                document.getElementById('videoPlayerMenu').style.display = 'none'
            }
        }
        if (videoMenuDeleteBtn) {
            videoMenuDeleteBtn.onclick = () => {
                this.curationDeleteAndAdvance()
                document.getElementById('videoPlayerMenu').style.display = 'none'
            }
        }
        if (videoMenuFaceSearchBtn) {
            videoMenuFaceSearchBtn.onclick = () => {
                document.getElementById('mobileSearchFaceBtn').click()
                document.getElementById('videoPlayerMenu').style.display = 'none'
            }
        }
        if (videoMenuFaceBtn) {
            videoMenuFaceBtn.onclick = () => {
                const faceControls = document.getElementById('mobileFaceControls')
                if (faceControls) {
                    if (faceControls.classList.contains('visible')) {
                        faceControls.style.display = 'none'
                        faceControls.classList.remove('visible')
                    } else {
                        faceControls.style.display = 'flex'
                        faceControls.classList.add('visible')
                    }
                }
                document.getElementById('videoPlayerMenu').style.display = 'none'
            }
        }
        if (videoMenuCloseBtn) {
            videoMenuCloseBtn.onclick = () => {
                document.getElementById('videoPlayerMenu').style.display = 'none'
            }
        }
    }

    setupImagePlayerMenuButtons() {
        const imageMenuFavBtn = document.getElementById('imageMenuFavBtn')
        const imageMenuTagBtn = document.getElementById('imageMenuTagBtn')
        const imageMenuDeleteBtn = document.getElementById('imageMenuDeleteBtn')
        const imageMenuFaceToolsBtn = document.getElementById('imageMenuFaceToolsBtn')
        const imageMenuFaceBtn = document.getElementById('imageMenuFaceBtn')
        const imageMenuCloseBtn = document.getElementById('imageMenuCloseBtn')

        if (imageMenuFavBtn) {
            imageMenuFavBtn.onclick = () => {
                this.curationToggleFavorite()
                document.getElementById('imagePlayerMenu').style.display = 'none'
            }
        }
        if (imageMenuTagBtn) {
            imageMenuTagBtn.onclick = () => {
                const currentItem = this.app.currentImageInViewer
                if (currentItem) {
                    if (this.app.isMobileDevice()) {
                        this.app.showMobileTagModal(currentItem.id, currentItem.name)
                    } else {
                        this.app.showTagModal(currentItem.id, currentItem.name)
                    }
                }
                document.getElementById('imagePlayerMenu').style.display = 'none'
            }
        }
        if (imageMenuDeleteBtn) {
            imageMenuDeleteBtn.onclick = () => {
                this.curationDeleteAndAdvance()
                document.getElementById('imagePlayerMenu').style.display = 'none'
            }
        }
        if (imageMenuFaceToolsBtn) {
            imageMenuFaceToolsBtn.onclick = () => {
                const faceControls = document.getElementById('mobileFaceControls')
                if (faceControls) {
                    if (faceControls.classList.contains('visible')) {
                        faceControls.style.display = 'none'
                        faceControls.classList.remove('visible')
                    } else {
                        faceControls.style.display = 'flex'
                        faceControls.classList.add('visible')
                    }
                }
                document.getElementById('imagePlayerMenu').style.display = 'none'
            }
        }
        if (imageMenuFaceBtn) {
            imageMenuFaceBtn.onclick = () => {
                const currentImage = this.app.currentImageInViewer
                if (currentImage) {
                    this.app.quickFaceSearchFromImage(currentImage)
                }
                document.getElementById('imagePlayerMenu').style.display = 'none'
            }
        }
        if (imageMenuCloseBtn) {
            imageMenuCloseBtn.onclick = () => {
                document.getElementById('imagePlayerMenu').style.display = 'none'
            }
        }
    }

    // ============ Curation Actions ============

    curationToggleFavorite() {
        const currentItem = this.app.currentVideoInPlayer || this.app.currentImageInViewer
        if (!currentItem) return
        const itemId = currentItem.id
        const newFavoriteState = !currentItem.favorite

        currentItem.favorite = newFavoriteState
        this.updateCurationFavoriteButton()

        this.app.toggleFavorite(itemId, newFavoriteState)
    }

    updateCurationFavoriteButton() {
        const currentItem = this.app.currentVideoInPlayer || this.app.currentImageInViewer
        if (!currentItem) return

        const btn = document.getElementById('curationFavBtn')
        if (currentItem.favorite) {
            btn.textContent = '\u2605'
            btn.classList.add('favorited')
            btn.title = 'Favorited (tap to remove)'
        } else {
            btn.textContent = '\u2606'
            btn.classList.remove('favorited')
            btn.title = 'Add to favorites'
        }
    }

    async curationDeleteAndAdvance() {
        const currentItem = this.app.currentVideoInPlayer || this.app.currentImageInViewer
        if (!currentItem) return
        const videoId = currentItem.id
        const videoName = currentItem.name

        try {
            await this.app.api.deleteVideo(videoId)
            console.log('Video moved to DELETE:', videoName)

            const searchList = this.app.allVideos && this.app.allVideos.length > 0 ? this.app.allVideos : this.app.videos
            const index = searchList.findIndex(v => v.id === videoId)

            const videoIndex = this.app.videos.findIndex(v => v.id === videoId)
            if (videoIndex !== -1) {
                this.app.videos.splice(videoIndex, 1)
            }

            if (index !== -1) {
                searchList.splice(index, 1)
            }

            if (searchList.length > 0) {
                const nextIndex = index < searchList.length ? index : 0
                const nextItem = searchList[nextIndex]
                if (nextItem) {
                    setTimeout(() => {
                        if (nextItem.media_type === 'image') {
                            this.app.currentImageIndex = nextIndex
                            this.app.openImageViewer(nextItem)
                            this.updateCurationFavoriteButton()
                        } else {
                            this.app.playVideo(nextItem)
                            this.updateCurationFavoriteButton()
                        }
                    }, 300)
                }
            } else {
                if (this.app.currentImageInViewer) {
                    this.app.hideImageViewer()
                } else {
                    this.app.hideVideoPlayer()
                }
                console.log('No more items in collection')
            }
        } catch (error) {
            console.error('Error deleting video:', error)
            console.log(`Failed to delete: ${error.message}`)
        }
    }

    // ============ Video Keyboard Controls ============

    setupVideoKeyboardControls(videoPlayer) {
        this.cleanupVideoKeyboardControls()

        this.videoKeyboardHandler = (e) => {
            const modal = document.getElementById('videoModal')
            if (!modal || modal.style.display !== 'flex' || !videoPlayer || videoPlayer.readyState < 2) return

            const currentItem = this.app.currentVideoInPlayer || this.app.currentImageInViewer

            try {
                switch (e.key) {
                    case 'Escape':
                        e.preventDefault()
                        this.app.hideVideoPlayer()
                        break

                    case 'ArrowLeft':
                        e.preventDefault()
                        this.seekVideo(videoPlayer, -10)
                        this.showSeekFeedback(-10)
                        break

                    case 'ArrowRight':
                        e.preventDefault()
                        this.seekVideo(videoPlayer, 10)
                        this.showSeekFeedback(+10)
                        break

                    case 'ArrowUp':
                        e.preventDefault()
                        this.app.playNextVideo()
                        break

                    case 'ArrowDown':
                        e.preventDefault()
                        this.app.playPreviousVideo()
                        break

                    case ' ':
                        e.preventDefault()
                        if (videoPlayer.paused) {
                            videoPlayer.play().catch(err => console.warn('Play failed:', err))
                        } else {
                            videoPlayer.pause()
                        }
                        break

                    case 'f':
                    case 'F':
                        e.preventDefault()
                        if (e.shiftKey) {
                            this.app.addCurrentFrameToFingerprint()
                        } else if (e.altKey) {
                            this.curationToggleFavorite()
                        } else {
                            if (videoPlayer.requestFullscreen) {
                                videoPlayer.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err))
                            } else if (videoPlayer.webkitRequestFullscreen) {
                                videoPlayer.webkitRequestFullscreen()
                            }
                        }
                        break

                    case 'd':
                    case 'D':
                        e.preventDefault()
                        this.curationDeleteAndAdvance()
                        break

                    case 'm':
                    case 'M':
                        e.preventDefault()
                        if (currentItem) {
                            this.app.showMoveVideoPlayerModal(currentItem.id, currentItem.name)
                        }
                        break

                    case '0':
                        e.preventDefault()
                        this.seekVideo(videoPlayer, 0, true)
                        this.showSeekFeedback('start')
                        break

                    case '9':
                        e.preventDefault()
                        if (!isNaN(videoPlayer.duration)) {
                            this.seekVideo(videoPlayer, videoPlayer.duration - 5, true)
                            this.showSeekFeedback('end')
                        }
                        break

                    case 't':
                    case 'T':
                        e.preventDefault()
                        this.app.captureCurrentFrameAsThumbnail()
                        break

                    case 'c':
                    case 'C':
                        e.preventDefault()
                        this.app.copyCurrentFrameToClipboard(videoPlayer)
                        break

                    case 's':
                    case 'S':
                        e.preventDefault()
                        if (this.app.currentVideoInPlayer) {
                            this.app.quickFaceSearchFromCurrentFrame()
                        }
                        break

                    case 'a':
                    case 'A':
                        e.preventDefault()
                        if (this.app.currentVideoInPlayer) {
                            this.app.autoScanFaces()
                        }
                        break

                    case 'x':
                    case 'X':
                        e.preventDefault()
                        if (this.app.currentVideoInPlayer) {
                            this.app.showFaceExtractionModal(this.app.currentVideoInPlayer)
                        } else if (this.app.currentImageInViewer) {
                            this.app.showFaceExtractionModal(this.app.currentImageInViewer)
                        }
                        break

                    case 'l':
                    case 'L':
                        e.preventDefault()
                        this.app.toggleVideoLoop()
                        break

                    case 'p':
                    case 'P':
                        e.preventDefault()
                        if (currentItem) {
                            this.app.showTagVideoPlayerModal(currentItem.id, currentItem.name)
                        }
                        break

                    case 'h':
                    case 'H':
                        e.preventDefault()
                        const controlsHint = document.getElementById('videoControlsHint')
                        if (controlsHint) {
                            controlsHint.classList.toggle('show')
                        }
                        break

                    case 'r':
                    case 'R':
                        e.preventDefault()
                        if (currentItem) {
                            this.app.addPerfectTag(currentItem.id, currentItem.name)
                        }
                        break

                    case 'j':
                    case 'J':
                        e.preventDefault()
                        if (currentItem) {
                            this.app.addJunkTag(currentItem.id, currentItem.name)
                        }
                        break
                }
            } catch (error) {
                console.warn('Keyboard control error:', error)
            }
        }

        document.addEventListener('keydown', this.videoKeyboardHandler)
    }

    cleanupVideoKeyboardControls() {
        if (this.videoKeyboardHandler) {
            document.removeEventListener('keydown', this.videoKeyboardHandler)
            this.videoKeyboardHandler = null
        }
    }

    // ============ Video Seeking ============

    seekVideo(videoPlayer, seconds, absolute = false) {
        try {
            if (!videoPlayer || !videoPlayer.seekable || videoPlayer.seekable.length === 0) {
                console.warn('Video not seekable yet')
                return
            }

            let newTime
            if (absolute) {
                newTime = seconds
            } else {
                newTime = videoPlayer.currentTime + seconds
            }

            const duration = videoPlayer.duration
            if (!isNaN(duration)) {
                newTime = Math.max(0, Math.min(duration, newTime))
            } else {
                newTime = Math.max(0, newTime)
            }

            if (this.app.localMode.enabled) {
                videoPlayer.currentTime = newTime
                console.log(`Local seek to ${newTime.toFixed(1)}s`)
            } else {
                const seekableEnd = videoPlayer.seekable.length > 0 ? videoPlayer.seekable.end(0) : duration
                newTime = Math.min(newTime, seekableEnd)
                videoPlayer.currentTime = newTime
                console.log(`Stream seek to ${newTime.toFixed(1)}s`)
            }

        } catch (error) {
            console.warn('Seek error:', error)
            try {
                if (absolute) {
                    videoPlayer.currentTime = seconds
                } else {
                    videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime + seconds)
                }
            } catch (fallbackError) {
                console.error('Fallback seek failed:', fallbackError)
            }
        }
    }

    showSeekFeedback(seconds) {
        const seekIndicator = document.getElementById('seekIndicator') || this.createSeekIndicator()

        let text
        if (seconds === 'start') {
            text = 'Start'
        } else if (seconds === 'end') {
            text = 'End'
        } else if (seconds > 0) {
            text = `+${seconds}s`
        } else {
            text = `${seconds}s`
        }

        seekIndicator.textContent = text
        seekIndicator.classList.add('show')

        setTimeout(() => {
            seekIndicator.classList.remove('show')
        }, 1000)
    }

    createSeekIndicator() {
        const indicator = document.createElement('div')
        indicator.id = 'seekIndicator'
        indicator.className = 'seek-indicator'
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            font-size: 18px;
            font-weight: bold;
            z-index: 1002;
            opacity: 0;
            transition: opacity 0.2s ease;
            pointer-events: none;
        `

        const videoModal = document.getElementById('videoModal')
        videoModal.appendChild(indicator)

        return indicator
    }

    // ============ Touch Controls ============

    setupTouchSeekControls(videoPlayer) {
        this.cleanupTouchSeekControls()

        let lastTapTime = 0
        let lastTapX = 0
        let lastTapZone = null
        const doubleTapDelay = 300
        const tapTolerance = 50

        this.touchSeekHandler = (e) => {
            if (e.target.tagName === 'VIDEO' && e.target === videoPlayer) {
                const rect = videoPlayer.getBoundingClientRect()
                const tapX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX)
                const tapY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY)

                const controlsHeight = 50
                if (tapY > rect.bottom - controlsHeight) {
                    return
                }

                const screenWidth = window.innerWidth
                const leftBoundary = screenWidth * 0.25
                const rightBoundary = screenWidth * 0.75

                let currentZone = null
                if (tapX < leftBoundary) {
                    currentZone = 'left'
                } else if (tapX > rightBoundary) {
                    currentZone = 'right'
                } else {
                    return
                }

                const currentTime = Date.now()
                const timeSinceLastTap = currentTime - lastTapTime
                const distanceFromLastTap = Math.abs(tapX - lastTapX)

                if (timeSinceLastTap < doubleTapDelay &&
                    distanceFromLastTap < tapTolerance &&
                    currentZone === lastTapZone) {
                    const seekAmount = 10

                    if (currentZone === 'left') {
                        videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - seekAmount)
                        this.showSeekIndicator('left', seekAmount)
                    } else {
                        videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + seekAmount)
                        this.showSeekIndicator('right', seekAmount)
                    }

                    lastTapTime = 0
                    lastTapX = 0
                    lastTapZone = null
                } else {
                    lastTapTime = currentTime
                    lastTapX = tapX
                    lastTapZone = currentZone
                }
            }
        }

        videoPlayer.addEventListener('click', this.touchSeekHandler)
        videoPlayer.addEventListener('touchend', this.touchSeekHandler)
    }

    cleanupTouchSeekControls() {
        const videoPlayer = document.getElementById('videoPlayer')
        if (this.touchSeekHandler && videoPlayer) {
            videoPlayer.removeEventListener('click', this.touchSeekHandler)
            videoPlayer.removeEventListener('touchend', this.touchSeekHandler)
            this.touchSeekHandler = null
        }
    }

    showSeekIndicator(direction, seconds) {
        const modal = document.getElementById('videoModal')
        const indicator = document.createElement('div')

        const isLeft = direction === 'left'
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            ${isLeft ? 'left: 20%' : 'right: 20%'};
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 20px 30px;
            border-radius: 12px;
            font-size: 24px;
            font-weight: bold;
            z-index: 1003;
            pointer-events: none;
            animation: seekPulse 0.6s ease-out;
        `

        indicator.textContent = isLeft ? `<< ${seconds}s` : `${seconds}s >>`
        modal.appendChild(indicator)

        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator)
            }
        }, 600)
    }

    // ============ Swipe Navigation ============

    setupSwipeNavigation(videoPlayer) {
        this.cleanupSwipeNavigation()

        let touchStartY = 0
        let touchEndY = 0
        let isSingleTouch = true
        let isInCenterZone = false
        const swipeThreshold = 100

        this.swipeStartHandler = (e) => {
            if (e.touches.length === 1) {
                const touchX = e.touches[0].clientX
                const screenWidth = window.innerWidth

                const leftBoundary = screenWidth * 0.25
                const rightBoundary = screenWidth * 0.75

                isInCenterZone = touchX >= leftBoundary && touchX <= rightBoundary

                if (isInCenterZone) {
                    touchStartY = e.touches[0].clientY
                    isSingleTouch = true
                } else {
                    isSingleTouch = false
                }
            } else {
                isSingleTouch = false
                isInCenterZone = false
            }
        }

        this.swipeMoveHandler = (e) => {
            if (e.touches.length > 1) {
                isSingleTouch = false
            }
        }

        this.swipeEndHandler = (e) => {
            if (!isSingleTouch || !isInCenterZone || e.changedTouches.length > 1) {
                return
            }

            touchEndY = e.changedTouches[0].clientY
            const swipeDistance = touchStartY - touchEndY

            if (Math.abs(swipeDistance) > swipeThreshold) {
                if (swipeDistance > 0) {
                    this.app.playNextVideo()
                } else {
                    this.app.playPreviousVideo()
                }
            }
        }

        videoPlayer.addEventListener('touchstart', this.swipeStartHandler, { passive: true })
        videoPlayer.addEventListener('touchmove', this.swipeMoveHandler, { passive: true })
        videoPlayer.addEventListener('touchend', this.swipeEndHandler, { passive: true })
    }

    cleanupSwipeNavigation() {
        const videoPlayer = document.getElementById('videoPlayer')
        if (videoPlayer) {
            if (this.swipeStartHandler) {
                videoPlayer.removeEventListener('touchstart', this.swipeStartHandler)
                this.swipeStartHandler = null
            }
            if (this.swipeMoveHandler) {
                videoPlayer.removeEventListener('touchmove', this.swipeMoveHandler)
                this.swipeMoveHandler = null
            }
            if (this.swipeEndHandler) {
                videoPlayer.removeEventListener('touchend', this.swipeEndHandler)
                this.swipeEndHandler = null
            }
        }
    }

    setupBottomSwipeControls(videoPlayer) {
        this.cleanupBottomSwipeControls()

        let touchStartY = 0
        let touchStartedInBottom = false
        const swipeThreshold = 50
        const bottomZoneHeight = 0.35

        this.bottomSwipeStartHandler = (e) => {
            if (e.touches.length === 1) {
                const touchY = e.touches[0].clientY
                const screenHeight = window.innerHeight
                const bottomBoundary = screenHeight * (1 - bottomZoneHeight)

                touchStartedInBottom = touchY >= bottomBoundary

                if (touchStartedInBottom) {
                    touchStartY = touchY
                }
            } else {
                touchStartedInBottom = false
            }
        }

        this.bottomSwipeEndHandler = (e) => {
            if (!touchStartedInBottom || e.changedTouches.length > 1) {
                return
            }

            const touchEndY = e.changedTouches[0].clientY
            const swipeDistance = touchStartY - touchEndY

            if (swipeDistance > swipeThreshold) {
                this.app.toggleVideoControls(videoPlayer)
            }
        }

        videoPlayer.addEventListener('touchstart', this.bottomSwipeStartHandler, { passive: true })
        videoPlayer.addEventListener('touchend', this.bottomSwipeEndHandler, { passive: true })
    }

    cleanupBottomSwipeControls() {
        const videoPlayer = document.getElementById('videoPlayer')
        if (videoPlayer) {
            if (this.bottomSwipeStartHandler) {
                videoPlayer.removeEventListener('touchstart', this.bottomSwipeStartHandler)
                this.bottomSwipeStartHandler = null
            }
            if (this.bottomSwipeEndHandler) {
                videoPlayer.removeEventListener('touchend', this.bottomSwipeEndHandler)
                this.bottomSwipeEndHandler = null
            }
        }
    }
}

// Export as global
window.CurationModeModule = CurationModeModule
