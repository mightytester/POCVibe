/**
 * SortingModule - Sorting, filtering, and view switching functionality
 * Handles sort methods, filter controls, view transitions
 */
class SortingModule {
    constructor(app) {
        this.app = app
    }

    // ==================== SORTING METHODS ====================

    handleSortChange() {
        const sortSelect = document.getElementById('sortSelect')
        this.app.currentSort = sortSelect.value

        console.log(`🔄 Sorting by: ${this.app.currentSort}`)

        // Apply sorting to current videos
        this.applySorting()
        document.getElementById('videoGrid').innerHTML = ''
        this.app.renderVideoGrid()

        // Save settings
        this.app.saveSettingsToStorage()
    }

    applySorting() {
        switch (this.app.currentSort) {
            case 'random':
                this.sortRandom()
                break
            case 'name-asc':
                this.sortByName(true)
                break
            case 'name-desc':
                this.sortByName(false)
                break
            case 'newest':
                this.sortByNewest()
                break
            case 'modified':
                this.sortByModified()
                break
            case 'size-desc':
                this.sortBySize()
                break
            case 'duration-desc':
                this.sortByDuration()
                break
            default:
                console.warn(`Unknown sort method: ${this.app.currentSort}`)
        }
    }

    sortRandom() {
        // Fisher-Yates shuffle algorithm
        for (let i = this.app.videos.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.app.videos[i], this.app.videos[j]] = [this.app.videos[j], this.app.videos[i]]
        }
    }

    sortByName(ascending = true) {
        this.app.videos.sort((a, b) => {
            const nameA = a.name.toLowerCase()
            const nameB = b.name.toLowerCase()
            if (ascending) {
                return nameA.localeCompare(nameB)
            } else {
                return nameB.localeCompare(nameA)
            }
        })
    }

    sortByNewest() {
        // Sort by ID descending (newest added to database first)
        this.app.videos.sort((a, b) => b.id - a.id)
    }

    sortByModified() {
        // Sort by file modification time descending (most recently modified first)
        this.app.videos.sort((a, b) => {
            const timeA = a.modified || 0
            const timeB = b.modified || 0
            return timeB - timeA
        })
    }

    sortBySize() {
        // Sort by file size descending (largest first)
        this.app.videos.sort((a, b) => {
            const sizeA = a.size || 0
            const sizeB = b.size || 0
            return sizeB - sizeA
        })
    }

    sortByDuration() {
        // Sort by duration descending (longest first)
        this.app.videos.sort((a, b) => {
            const durA = a.duration || 0
            const durB = b.duration || 0
            return durB - durA
        })
    }

    setSortDefault(sortMethod) {
        this.app.currentSort = sortMethod
        const sortSelect = document.getElementById('sortSelect')
        if (sortSelect) {
            sortSelect.value = sortMethod
        }
    }

    // ==================== FILTER METHODS ====================

    toggleFolderFilterMenu() {
        const menu = document.getElementById('folderFilterMenu')
        const isVisible = menu.style.display !== 'none'

        if (isVisible) {
            menu.style.display = 'none'
        } else {
            menu.style.display = 'block'
        }
    }

    filterUntaggedVideos() {
        // Filter to show only videos without any tags
        let filtered = this.app.allVideos.filter(video =>
            !video.tags || video.tags.length === 0
        )

        // Apply folder filter if active
        if (this.app.currentFolderFilter && this.app.currentFolderFilter.length > 0) {
            filtered = filtered.filter(video => {
                return this.app.currentFolderFilter.includes(video.category)
            })
            console.log(`📊 Filtered to ${filtered.length} untagged videos in selected folders`)
        } else {
            console.log(`📊 Filtered to ${filtered.length} untagged videos`)
        }

        this.app.videos = filtered
        document.getElementById('videoGrid').innerHTML = ''
        this.app.renderVideoGrid()

        // Show feedback to user
        console.log(`Showing ${this.app.videos.length} untagged videos`)
    }

    disableAllFilters() {
        /**
         * Disable all filter dropdowns and controls
         */
        const filterElements = [
            'searchInput',
            'tagFilter',
            'seriesFilter',
            'yearFilter',
            'channelFilter',
            'ratingFilter',
            'favoriteFilter',
            'clearBtn',
            'folderFilterBtn'
        ]

        filterElements.forEach(id => {
            const element = document.getElementById(id)
            if (element) {
                element.disabled = true
                element.style.opacity = '0.5'
                element.style.cursor = 'not-allowed'
                element.style.pointerEvents = 'none'
            }
        })

        console.log('🔒 All filters disabled')
    }

    enableAllFilters() {
        /**
         * Enable all filter dropdowns and controls
         */
        const filterElements = [
            'searchInput',
            'tagFilter',
            'seriesFilter',
            'yearFilter',
            'channelFilter',
            'ratingFilter',
            'favoriteFilter',
            'clearBtn',
            'folderFilterBtn'
        ]

        filterElements.forEach(id => {
            const element = document.getElementById(id)
            if (element) {
                element.disabled = false
                element.style.opacity = '1'
                element.style.cursor = 'pointer'
                element.style.pointerEvents = 'auto'
            }
        })

        console.log('🔓 All filters enabled')
    }

    // ==================== VIEW SWITCHING ====================

    switchView(viewType, resetNavigation = true, animate = true) {
        console.log(`🔄 Switching to ${viewType} view (resetNavigation: ${resetNavigation}, animate: ${animate})`)
        this.app.currentView = viewType

        // Update button states immediately for visual feedback
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active')
        })
        const viewBtn = this.app.dom.get(`${viewType}ViewBtn`)
        if (viewBtn) {
            viewBtn.classList.add('active')
        } else {
            console.warn(`⚠️ View button not found: ${viewType}ViewBtn`)
        }

        // Get UI elements with error checking (using DOM cache)
        const videoGrid = this.app.dom.get('videoGrid')
        const folderExplorer = this.app.dom.get('folderExplorer')
        const seriesView = this.app.dom.get('seriesView')
        const breadcrumbNav = this.app.dom.get('breadcrumbNav')
        const listViewControls = this.app.dom.get('listViewControls')

        if (!videoGrid || !folderExplorer || !seriesView) {
            console.error('❌ Missing required DOM elements:', {
                videoGrid: !!videoGrid,
                folderExplorer: !!folderExplorer,
                seriesView: !!seriesView
            })
            return
        }

        if (viewType === 'list') {
            // Show Collection View: ALL videos, no folders
            // Hide other views first
            if (folderExplorer) folderExplorer.style.display = 'none'
            if (seriesView) seriesView.style.display = 'none'
            if (breadcrumbNav) breadcrumbNav.style.display = 'none'

            // Show collection view with optional animation
            if (animate) {
                videoGrid.style.opacity = '0'
                videoGrid.style.display = 'grid'
                requestAnimationFrame(() => {
                    videoGrid.style.transition = 'opacity 0.2s ease-in'
                    videoGrid.style.opacity = '1'
                })
            } else {
                videoGrid.style.display = 'grid'
                videoGrid.style.opacity = '1'
            }

            if (listViewControls) listViewControls.style.display = 'flex'

            // Disable all filter dropdowns until videos are loaded
            this.disableAllFilters()

            // Clear any explorer-specific filters/state
            this.app.currentCategory = null
            this.app.currentSubcategory = null
            this.app.breadcrumb = []

            // Show empty search-focused UI - load videos on demand when user searches/filters
            if (!this.app.skipLoadingVideosOnSwitch) {
                this.showListViewSearchUI()
            } else {
                console.log('⏭️ Skipping video load - preparing for duplicate view')
            }

        } else if (viewType === 'series') {
            // Show Series View: grouped by series → season → episode
            // Hide other views first
            if (videoGrid) videoGrid.style.display = 'none'
            if (folderExplorer) folderExplorer.style.display = 'none'
            if (breadcrumbNav) breadcrumbNav.style.display = 'none'
            if (listViewControls) listViewControls.style.display = 'none'

            // Show series view with optional animation
            if (animate) {
                seriesView.style.opacity = '0'
                seriesView.style.display = 'block'
                requestAnimationFrame(() => {
                    seriesView.style.transition = 'opacity 0.2s ease-in'
                    seriesView.style.opacity = '1'
                })
            } else {
                seriesView.style.display = 'block'
                seriesView.style.opacity = '1'
            }

            // Clear any explorer-specific filters/state
            this.app.currentCategory = null
            this.app.currentSubcategory = null
            this.app.breadcrumb = []

            // Load and render series view
            this.app.renderSeriesView()

        } else if (viewType === 'explorer') {
            // Show Explorer View: folder navigation
            // Hide other views first
            if (videoGrid) videoGrid.style.display = 'none'
            if (seriesView) seriesView.style.display = 'none'
            if (listViewControls) listViewControls.style.display = 'none'

            // Show explorer view with optional animation
            if (animate) {
                folderExplorer.style.opacity = '0'
                folderExplorer.style.display = 'block'
                if (breadcrumbNav) {
                    breadcrumbNav.style.opacity = '0'
                    breadcrumbNav.style.display = 'block'
                }
                requestAnimationFrame(() => {
                    folderExplorer.style.transition = 'opacity 0.2s ease-in'
                    folderExplorer.style.opacity = '1'
                    if (breadcrumbNav) {
                        breadcrumbNav.style.transition = 'opacity 0.2s ease-in'
                        breadcrumbNav.style.opacity = '1'
                    }
                })
            } else {
                folderExplorer.style.display = 'block'
                folderExplorer.style.opacity = '1'
                if (breadcrumbNav) {
                    breadcrumbNav.style.display = 'block'
                    breadcrumbNav.style.opacity = '1'
                }
            }

            // Clear list view specific state
            this.app.currentSearchQuery = ''
            this.app.currentTagFilter = ''

            // Reset list view inputs
            const searchInput = document.getElementById('searchInput')
            const tagFilter = document.getElementById('tagFilter')
            if (searchInput) searchInput.value = ''
            if (tagFilter) tagFilter.value = ''

            // Only reset navigation if explicitly requested (not restoring from saved state)
            if (resetNavigation) {
                this.app.currentCategory = null
                this.app.currentSubcategory = null
                this.app.breadcrumb = []
                this.app.renderFolderExplorer()
                this.app.renderBreadcrumb()
            } else {
                // Restoring from saved state - navigate to saved folder if exists
                if (this.app.currentCategory) {
                    console.log(`📂 Restoring explorer to: ${this.app.currentCategory}${this.app.currentSubcategory ? '/' + this.app.currentSubcategory : ''}`)
                    this.app.loadCategory(this.app.currentCategory, this.app.currentSubcategory)
                } else {
                    // No saved category, start at root
                    this.app.renderFolderExplorer()
                    this.app.renderBreadcrumb()
                }
            }
        }

        // Update button states to reflect active view
        this.app.updateViewButtons()

        // Save settings
        this.app.saveSettingsToStorage()

        // Update "Load More" button visibility based on new view
        this.app.updateLoadMoreButton()
    }

    showListViewSearchUI() {
        /**
         * Show empty search-focused UI with dedicated "Load Videos" button
         * OR show videos if already loaded
         */
        const videoGrid = document.getElementById('videoGrid')
        if (!videoGrid) return

        // Check if FULL collection was previously loaded (stored in allVideosCatalog)
        if (this.app.hasLoadedFullCollection && this.app.allVideosCatalog && this.app.allVideosCatalog.length > 0) {
            // Full collection already loaded - restore from cache and render
            console.log(`📺 Restoring full collection from cache (${this.app.allVideosCatalog.length} total)`)
            this.app.allVideos = this.app.allVideosCatalog // Restore from cache
            this.app.videos = this.app.allVideos
            this.app.resetPagination()
            this.applySorting()
            this.app.renderVideoGrid()
            this.app.updateLoadMoreButton()
            // Re-populate and enable filters since we have data
            this.app.populateSeriesFilter()
            this.app.populateYearFilter()
            this.app.populateChannelFilter()
            this.enableAllFilters()
            return
        }

        // No videos loaded yet - show Load button
        videoGrid.innerHTML = `
            <div style="
                grid-column: 1 / -1;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                min-height: 400px;
                color: #888;
                text-align: center;
            ">
                <div style="font-size: 64px; margin-bottom: 30px;">🎬</div>
                <h1 style="margin: 0 0 15px 0; color: #333; font-size: 32px;">Load Your Video Collection</h1>
                <p style="margin: 0 0 40px 0; font-size: 16px; color: #666; max-width: 500px;">
                    Click the button below to load all your videos
                </p>
                <button id="loadVideosBtn" style="
                    padding: 15px 50px;
                    font-size: 18px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                ">
                    📂 Load Videos Now
                </button>
            </div>
        `

        // Add hover effect
        const loadBtn = document.getElementById('loadVideosBtn')
        if (loadBtn) {
            loadBtn.addEventListener('mouseover', (e) => {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = '0 6px 20px rgba(102, 126, 234, 0.6)'
            })
            loadBtn.addEventListener('mouseout', (e) => {
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4)'
            })
            loadBtn.addEventListener('click', () => this.loadAllVideosSimple())
        }

        console.log('🔍 Showing dedicated Load Videos button')
    }

    async loadAllVideosSimple() {
        /**
         * Load all videos directly without any filters
         * Called from the "Load Videos Now" button in collection view
         */
        console.log('🎬 Loading all videos (no filters)')

        // Show full-screen loading overlay
        this.showLoadingOverlay()

        try {
            // Reset all filters
            this.app.currentFolderFilter = []
            this.app.currentSearchQuery = ''
            this.app.currentTagFilter = ''
            this.app.currentSeriesFilter = ''
            this.app.currentYearFilter = ''
            this.app.currentChannelFilter = ''
            this.app.currentRatingFilter = ''
            this.app.currentFavoriteFilter = false

            // Load all videos (GET /videos/_all)
            await this.app.loadAllVideosFlat(true) // forceReload = true

            // Ensure pagination is properly set up for collection view
            this.app.videos = this.app.allVideos
            this.app.resetPagination()
            this.applySorting()
            this.app.renderVideoGrid()
            this.app.updateLoadMoreButton()

            console.log('✅ All videos loaded successfully')
        } catch (error) {
            console.error('❌ Error loading videos:', error)
            console.log('Error loading videos: ' + error.message)
        } finally {
            // Hide loading overlay
            this.hideLoadingOverlay()
        }
    }

    showLoadingOverlay() {
        /**
         * Show full-screen loading animation overlay
         */
        // Remove existing overlay if any
        const existing = document.getElementById('loadingOverlay')
        if (existing) existing.remove()

        const overlay = document.createElement('div')
        overlay.id = 'loadingOverlay'
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.85);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            pointer-events: auto;
        `

        overlay.innerHTML = `
            <div style="
                text-align: center;
                color: white;
            ">
                <div style="
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 30px;
                    position: relative;
                ">
                    <div style="
                        position: absolute;
                        width: 100%;
                        height: 100%;
                        border: 6px solid rgba(255, 255, 255, 0.2);
                        border-top-color: #667eea;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    "></div>
                </div>
                <h2 style="margin: 0 0 15px 0; font-size: 24px;">Loading Videos...</h2>
                <p style="margin: 0; font-size: 14px; color: rgba(255, 255, 255, 0.8);">
                    This may take a moment. Please wait...
                </p>
                <div id="loadingProgressText" style="margin-top: 20px; font-size: 12px; color: rgba(255, 255, 255, 0.6);">
                    Scanning folders...
                </div>
            </div>
            <style>
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            </style>
        `

        document.body.appendChild(overlay)

        // Prevent any clicks/navigation
        overlay.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })

        // Prevent keyboard navigation
        const preventKeydown = (e) => {
            if (e.key !== 'F12' && e.key !== 'Escape') {
                e.preventDefault()
            }
        }
        document.addEventListener('keydown', preventKeydown, true)

        // Store reference to remove listener later
        this.loadingOverlayKeydownListener = preventKeydown
    }

    hideLoadingOverlay() {
        /**
         * Hide full-screen loading overlay
         */
        const overlay = document.getElementById('loadingOverlay')
        if (overlay) {
            overlay.remove()
        }

        // Remove keyboard prevention
        if (this.loadingOverlayKeydownListener) {
            document.removeEventListener('keydown', this.loadingOverlayKeydownListener, true)
            this.loadingOverlayKeydownListener = null
        }
    }

    updateLoadingProgress(message) {
        /**
         * Update loading overlay progress message
         */
        const progressText = document.getElementById('loadingProgressText')
        if (progressText) {
            progressText.textContent = message
        }
    }

    // ==================== UTILITY METHODS ====================

    debounce(fn, delay) {
        let t
        return (...args) => {
            clearTimeout(t)
            t = setTimeout(() => fn.apply(this.app, args), delay)
        }
    }

    escapeHtml(text) {
        /**
         * Escape HTML special characters to prevent XSS
         */
        if (!text) return ''
        const div = document.createElement('div')
        div.textContent = text
        return div.innerHTML
    }

    throttle(fn, delay = 100) {
        /**
         * Efficient throttle using requestAnimationFrame
         * Prevents execution more than once per delay period
         * No setTimeout overhead - just ignores calls during cooldown
         */
        let lastRun = 0
        let rafId = null

        return (...args) => {
            const now = Date.now()

            // If we're in cooldown period, ignore this call
            if (now - lastRun < delay) {
                return
            }

            // Cancel any pending animation frame
            if (rafId) {
                cancelAnimationFrame(rafId)
            }

            // Schedule execution on next animation frame
            rafId = requestAnimationFrame(() => {
                lastRun = Date.now()
                fn.apply(this.app, args)
                rafId = null
            })
        }
    }
}

// Export as global
window.SortingModule = SortingModule
