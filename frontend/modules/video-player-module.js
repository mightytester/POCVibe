/**
 * VideoPlayerModule - Video playback and controls
 * Handles video modal, playback, keyboard shortcuts, seeking, and navigation
 */
class VideoPlayerModule {
    constructor(app) {
        this.app = app

        // Player state
        this.currentVideoInPlayer = null
        this.savedScrollPosition = 0
        this.videoKeyboardHandler = null
    }

    // ============ Core Playback ============

    playVideo(video) {
        console.log('Playing video:', video)

        // Ensure we have all required video data
        if (!video || !video.category) {
            console.error('Invalid video data:', video)
            console.log('Error: Invalid video data')
            return
        }

        // Route to image viewer if media_type is 'image'
        const isImage = video.media_type === 'image' || this.app.isImageExtension(video.extension)

        if (isImage) {
            console.log('Media is image, opening image viewer')
            this.app.openImageViewer(video)
            return
        }

        // Check if any modal is open and close it
        const openModals = document.querySelectorAll('[style*="display: flex"][id*="Modal"]')
        openModals.forEach(modal => {
            if (modal.style.display === 'flex') {
                modal.style.display = 'none'
            }
        })

        // Build streaming URL
        const videoPath = this.app.getVideoStreamingPath(video)
        const videoUrl = `${this.app.apiBase}/stream/${video.category}/${videoPath}`
        const urlType = this.app.localMode.enabled ? 'local' : 'stream'

        if (this.app.localMode.enabled) {
            console.log('LOCAL MODE: Optimized streaming from local disk')
        } else {
            console.log('STREAM MODE: HTTP streaming with byte-range seeking')
        }

        console.log('Using URL:', videoUrl)
        this.showVideoPlayer(video, videoUrl, urlType)
    }

    playVideoFromData(videoDataString) {
        try {
            const video = JSON.parse(videoDataString.replace(/&quot;/g, '"'))
            console.log('Playing video from data:', video)
            this.playVideo(video)
        } catch (error) {
            console.error('Failed to parse video data:', error)
            console.log('Error: Invalid video data format')
        }
    }

    // ============ Player Modal ============

    showVideoPlayer(video, videoUrl, urlType = 'stream') {
        const modal = document.getElementById('videoModal')
        const videoPlayer = document.getElementById('videoPlayer')
        const videoTitle = document.getElementById('videoTitle')

        // Check if this is a video switch (modal already open)
        const isVideoSwitch = modal.style.display === 'flex'

        // Save scroll position when first opening modal
        if (!isVideoSwitch) {
            this.savedScrollPosition = window.pageYOffset || document.documentElement.scrollTop
            console.log(`Saved scroll position: ${this.savedScrollPosition}px`)

            // Hide duplicates review if active
            this.app.hideDuplicatesReviewIfActive()
        }

        // Store current video info
        this.currentVideoInPlayer = video
        this.app.currentVideoInPlayer = video // Keep app reference in sync
        videoTitle.textContent = video.name

        // Add transition effect if switching videos
        if (isVideoSwitch) {
            videoPlayer.classList.add('transitioning')
        }

        // Clear any previous video
        videoPlayer.src = ''
        videoPlayer.load()

        // Set preload based on mode
        videoPlayer.preload = 'metadata'

        // Set the video source
        videoPlayer.src = videoUrl

        // Show modal
        modal.style.display = 'flex'

        // Prevent body scroll on mobile
        document.body.classList.add('video-modal-open')

        // Focus the video player for keyboard controls
        videoPlayer.focus()

        // Clear existing event handlers
        videoPlayer.onloadstart = null
        videoPlayer.oncanplay = null
        videoPlayer.onerror = null
        videoPlayer.onloadeddata = null
        videoPlayer.onloadedmetadata = null

        // Set up event handlers
        videoPlayer.onloadstart = () => {
            console.log(`Started loading ${urlType} video`)
        }

        videoPlayer.onloadedmetadata = () => {
            console.log(`Video metadata loaded, duration: ${videoPlayer.duration}s`)

            // Auto-enable loop for short videos (< 45 seconds)
            const loopToggleBtn = document.getElementById('loopToggleBtn')
            if (videoPlayer.duration < 45) {
                videoPlayer.loop = true
                if (loopToggleBtn) loopToggleBtn.classList.add('active')
                console.log('Auto-enabled loop for short video (<45s)')
            } else {
                videoPlayer.loop = false
                if (loopToggleBtn) loopToggleBtn.classList.remove('active')
            }
        }

        videoPlayer.oncanplay = () => {
            console.log(`${urlType} video ready to play`)
            videoPlayer.classList.remove('transitioning')

            videoPlayer.play().catch(err => {
                console.warn('Autoplay prevented:', err)
                console.log('Click video to play (autoplay blocked)')
            })
        }

        videoPlayer.onerror = (e) => {
            console.error('Video playback error:', e, videoPlayer.error)
            videoPlayer.classList.remove('transitioning')

            const errorCode = videoPlayer.error?.code
            let errorMsg = 'Failed to load video'

            switch (errorCode) {
                case 1: errorMsg = 'Video loading aborted'; break
                case 2: errorMsg = 'Network error loading video'; break
                case 3: errorMsg = 'Video decoding error'; break
                case 4: errorMsg = 'Video format not supported'; break
            }

            console.log(errorMsg)
        }

        // Set up keyboard controls
        this.setupVideoKeyboardControls(videoPlayer)

        // Set up curation mode
        this.app.setupCurationMode(videoPlayer)

        // Set up touch controls for mobile
        if (this.app.isMobileDevice()) {
            this.app.setupTouchSeekControls(videoPlayer)
            this.app.setupSwipeNavigation(videoPlayer)
            this.app.setupBottomSwipeControls(videoPlayer)
            this.app.setupHorizontalPan(videoPlayer)
        }
    }

    hideVideoPlayer(isTransition = false) {
        const modal = document.getElementById('videoModal')
        const videoPlayer = document.getElementById('videoPlayer')
        const controlsHint = document.getElementById('videoControlsHint')

        console.log('Closing video player')

        // Check if we came from face detail modal
        if (this.app.playingVideoFromFaceDetail && this.app.currentFaceForDetail) {
            console.log('Returning to face detail modal from video')

            videoPlayer.pause()
            videoPlayer.src = ''
            videoPlayer.classList.remove('transitioning')
            this.clearVideoEventHandlers(videoPlayer)

            modal.style.display = 'none'
            document.body.classList.remove('video-modal-open')
            if (controlsHint) controlsHint.classList.remove('show')

            this.app.playingVideoFromFaceDetail = false
            this.app.showFaceDetailModal(this.app.currentFaceForDetail)
            return
        }

        // Normal close - pause and clear
        videoPlayer.pause()
        videoPlayer.src = ''
        videoPlayer.classList.remove('transitioning')
        this.clearVideoEventHandlers(videoPlayer)

        modal.style.display = 'none'
        document.body.classList.remove('video-modal-open')
        if (controlsHint) controlsHint.classList.remove('show')

        // Restore scroll position
        if (!isTransition && this.savedScrollPosition > 0) {
            setTimeout(() => {
                window.scrollTo(0, this.savedScrollPosition)
                console.log(`Restored scroll position: ${this.savedScrollPosition}px`)
            }, 50)
        }

        // Restore duplicates review if needed
        if (!isTransition) {
            this.app.restoreDuplicatesReviewIfNeeded()
        }

        // Cleanup keyboard controls
        this.cleanupVideoKeyboardControls()

        this.currentVideoInPlayer = null
        this.app.currentVideoInPlayer = null
    }

    clearVideoEventHandlers(videoPlayer) {
        videoPlayer.onloadstart = null
        videoPlayer.oncanplay = null
        videoPlayer.onerror = null
        videoPlayer.onloadeddata = null
        videoPlayer.onloadedmetadata = null
    }

    // ============ Keyboard Controls ============

    setupVideoKeyboardControls(videoPlayer) {
        // Remove any existing handler
        this.cleanupVideoKeyboardControls()

        // Create the keyboard handler
        this.videoKeyboardHandler = (e) => {
            const modal = document.getElementById('videoModal')
            if (!modal || modal.style.display !== 'flex' || !videoPlayer || videoPlayer.readyState < 2) return

            const currentItem = this.currentVideoInPlayer || this.app.currentImageInViewer

            try {
                switch (e.key) {
                    case 'Escape':
                        e.preventDefault()
                        this.hideVideoPlayer()
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
                        this.playNextVideo()
                        break

                    case 'ArrowDown':
                        e.preventDefault()
                        this.playPreviousVideo()
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
                            this.app.curationToggleFavorite()
                        } else {
                            this.toggleFullscreen(videoPlayer)
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
                        if (this.currentVideoInPlayer) {
                            this.app.quickFaceSearchFromCurrentFrame()
                        }
                        break

                    case 'a':
                    case 'A':
                        e.preventDefault()
                        if (this.currentVideoInPlayer) {
                            this.app.autoScanFaces()
                        }
                        break

                    case 'x':
                    case 'X':
                        e.preventDefault()
                        this.app.openFaceExtractionModal()
                        break

                    case 'l':
                    case 'L':
                        e.preventDefault()
                        this.toggleLoop(videoPlayer)
                        break

                    case 'h':
                    case 'H':
                        e.preventDefault()
                        this.toggleControlsHint()
                        break
                }
            } catch (error) {
                console.error('Keyboard handler error:', error)
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

    toggleFullscreen(videoPlayer) {
        if (videoPlayer.requestFullscreen) {
            videoPlayer.requestFullscreen().catch(err => console.warn('Fullscreen failed:', err))
        } else if (videoPlayer.webkitRequestFullscreen) {
            videoPlayer.webkitRequestFullscreen()
        } else if (videoPlayer.msRequestFullscreen) {
            videoPlayer.msRequestFullscreen()
        }
    }

    toggleLoop(videoPlayer) {
        videoPlayer.loop = !videoPlayer.loop
        const loopToggleBtn = document.getElementById('loopToggleBtn')
        if (loopToggleBtn) {
            loopToggleBtn.classList.toggle('active', videoPlayer.loop)
        }
        console.log(`Loop ${videoPlayer.loop ? 'enabled' : 'disabled'}`)
    }

    toggleControlsHint() {
        const controlsHint = document.getElementById('videoControlsHint')
        if (controlsHint) {
            controlsHint.classList.toggle('show')
        }
    }

    // ============ Seeking ============

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

            // Clamp to valid range
            const duration = videoPlayer.duration
            if (!isNaN(duration)) {
                newTime = Math.max(0, Math.min(duration, newTime))
            } else {
                newTime = Math.max(0, newTime)
            }

            videoPlayer.currentTime = newTime
            console.log(`Seek to ${newTime.toFixed(1)}s`)

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

    // ============ Navigation ============

    playNextVideo() {
        if (!this.currentVideoInPlayer) return

        const searchList = this.app.allVideos && this.app.allVideos.length > 0
            ? this.app.allVideos
            : this.app.videos

        const currentIndex = searchList.findIndex(v => v.id === this.currentVideoInPlayer.id)

        if (currentIndex === -1) {
            console.log('Cannot find next video')
            return
        }

        const nextIndex = (currentIndex + 1) % searchList.length
        const nextItem = searchList[nextIndex]

        this.showNavigationIndicator('next')

        if (nextItem.media_type === 'image') {
            this.app.currentImageIndex = nextIndex
            this.hideVideoPlayer(true)
            setTimeout(() => {
                this.app.openImageViewer(nextItem)
                this.app.updateCurationFavoriteButton()
            }, 200)
        } else {
            this.playVideo(nextItem)
            this.app.updateCurationFavoriteButton()
        }
    }

    playPreviousVideo() {
        if (!this.currentVideoInPlayer) return

        const searchList = this.app.allVideos && this.app.allVideos.length > 0
            ? this.app.allVideos
            : this.app.videos

        const currentIndex = searchList.findIndex(v => v.id === this.currentVideoInPlayer.id)

        if (currentIndex === -1) {
            console.log('Cannot find previous video')
            return
        }

        const prevIndex = currentIndex === 0 ? searchList.length - 1 : currentIndex - 1
        const prevItem = searchList[prevIndex]

        this.showNavigationIndicator('previous')

        if (prevItem.media_type === 'image') {
            this.app.currentImageIndex = prevIndex
            this.hideVideoPlayer(true)
            setTimeout(() => {
                this.app.openImageViewer(prevItem)
                this.app.updateCurationFavoriteButton()
            }, 200)
        } else {
            this.playVideo(prevItem)
            this.app.updateCurationFavoriteButton()
        }
    }

    showNavigationIndicator(direction) {
        const modal = document.getElementById('videoModal')
        const indicator = document.createElement('div')

        const isNext = direction === 'next'
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.85);
            color: white;
            padding: 30px;
            border-radius: 50%;
            font-size: 48px;
            z-index: 1003;
            pointer-events: none;
            animation: seekPulse 0.4s ease-out;
        `
        indicator.textContent = isNext ? '⬆️' : '⬇️'

        modal.appendChild(indicator)

        setTimeout(() => {
            indicator.remove()
        }, 400)
    }

    // ============ Utility ============

    getVideoMimeType(videoUrl) {
        const extension = videoUrl.split('.').pop().toLowerCase()
        const mimeTypes = {
            'mp4': 'video/mp4',
            'webm': 'video/webm',
            'ogv': 'video/ogg',
            'avi': 'video/x-msvideo',
            'mov': 'video/quicktime',
            'mkv': 'video/x-matroska',
            'm4v': 'video/mp4'
        }
        return mimeTypes[extension] || 'video/mp4'
    }
}

// Export as global
window.VideoPlayerModule = VideoPlayerModule
