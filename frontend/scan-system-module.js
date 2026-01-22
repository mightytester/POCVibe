/**
 * ScanSystemModule - Folder scanning and thumbnail generation
 * Handles scan queue, folder scanning, batch operations
 */
class ScanSystemModule {
    constructor(app) {
        this.app = app
    }

    // ==================== SCAN QUEUE SYSTEM ====================

    queueFolderScan(folderName, scanType, parentCategory = null) {
        // Check if this folder is already in the queue
        const alreadyQueued = this.app.scanQueue.some(item =>
            item.folderName === folderName && item.scanType === scanType
        )

        if (alreadyQueued) {
            console.log(`📋 ${folderName} is already in scan queue`)
            return
        }

        // Add to queue
        this.app.scanQueue.push({ folderName, scanType, parentCategory })

        const queueLength = this.app.scanQueue.length
        if (this.app.currentlyScanning) {
            console.log(`📋 Added "${folderName}" to queue (${queueLength} folder${queueLength > 1 ? 's' : ''} waiting)`)
        } else {
            console.log(`🔄 Starting scan of "${folderName}"...`)
        }

        // Start processing if not already scanning
        if (!this.app.currentlyScanning) {
            this.processScanQueue()
        }
    }

    async processScanQueue() {
        // If queue is empty, we're done
        if (this.app.scanQueue.length === 0) {
            this.app.currentlyScanning = false
            console.log('✅ All folder scans completed!')
            return
        }

        // Mark as scanning
        this.app.currentlyScanning = true

        // Get next scan from queue
        const { folderName, scanType, parentCategory } = this.app.scanQueue.shift()
        const remaining = this.app.scanQueue.length

        // Show progress
        if (remaining > 0) {
            console.log(`🔄 Scanning "${folderName}"... (${remaining} remaining in queue)`)
        }

        try {
            // Execute the appropriate scan method
            if (scanType === 'hierarchical') {
                await this.scanFolderHierarchicalInternal(folderName, parentCategory)
            } else if (scanType === 'recursive') {
                await this.scanFolderRecursiveInternal(folderName)
            } else if (scanType === 'only') {
                await this.scanFolderOnlyInternal(folderName)
            }
        } catch (error) {
            console.error(`❌ Error scanning ${folderName}:`, error)
            console.log(`❌ Failed to scan ${folderName}`)
        }

        // Process next item in queue
        await this.processScanQueue()
    }

    // ==================== SCAN METHODS (PUBLIC - USE QUEUE) ====================

    async scanFolderHierarchical(folderName, parentCategory = null) {
        this.queueFolderScan(folderName, 'hierarchical', parentCategory)
    }

    async scanFolderRecursive(folderName) {
        this.queueFolderScan(folderName, 'recursive')
    }

    async scanFolderOnly(folderName) {
        this.queueFolderScan(folderName, 'only')
    }

    // ==================== SCAN METHODS (INTERNAL) ====================

    async scanFolderHierarchicalInternal(folderName, parentCategory = null) {
        this.app.hideFolderMenu()
        try {
            console.log(`📂 Scanning ${folderName}...`)

            const result = await this.app.api.scanFolderWithOptions(folderName, {
                hierarchical: true,
                recursive: false,
                syncDb: true,
                parentCategory: parentCategory
            })

            // Show scan results
            console.log(`✅ Scanned ${folderName}: ${result.total_direct_videos} videos found`)

            // Update scan status and refresh current view
            await this.app.loadScanStatus()

            if (this.app.currentView === 'explorer') {
                // Stay in explorer view and refresh it
                this.app.renderFolderExplorer()
            } else {
                // If in list view, reload videos
                await this.app.loadAllVideosFlat()
            }

            // Generate thumbnails in background
            await this.batchGenerateThumbnails(folderName)

        } catch (error) {
            console.error('❌ Error scanning folder:', error)
            console.log(`❌ Failed to scan ${folderName}`)
        }
    }

    async scanFolderOnlyInternal(folderName) {
        this.app.hideFolderMenu()
        try {
            console.log(`🔍 Scanning folder only: ${folderName}...`)

            const data = await this.app.api.scanFolderWithOptions(folderName, { recursive: false })
            console.log(`✅ Scanned ${folderName} (folder only): ${data.videos_found} videos`)

            await this.app.loadScanStatus()
            if (this.app.currentView === 'explorer') {
                this.app.renderFolderExplorer()
            }
        } catch (error) {
            console.error('❌ Error scanning folder only:', error)
            console.log(`❌ Failed to scan ${folderName}`)
        }
    }

    async scanFolderRecursiveInternal(folderName) {
        this.app.hideFolderMenu()
        try {
            console.log(`📁 Scanning ${folderName} and all subfolders...`)

            const data = await this.app.api.scanFolderWithOptions(folderName, { recursive: true })
            console.log(`✅ Scanned ${folderName} (with subfolders): ${data.videos_found} videos`)

            // Update scan status and refresh current view
            await this.app.loadScanStatus()

            if (this.app.currentView === 'explorer') {
                // Stay in explorer view and refresh it
                this.app.renderFolderExplorer()
            } else {
                // If in list view, reload videos
                await this.app.loadAllVideosFlat()
            }

            // Generate thumbnails in background
            await this.batchGenerateThumbnails(folderName)
        } catch (error) {
            console.error('❌ Error scanning folder recursively:', error)
            console.log(`❌ Failed to scan ${folderName} with subfolders`)
        }
    }

    // ==================== BATCH OPERATIONS ====================

    async loadVideosForCategory(folderName) {
        try {
            console.log(`📂 Loading videos for category: ${folderName}`)
            const data = await this.app.api.getVideosByFolder(folderName, true)
            this.app.allVideos = data.videos || []
            // Note: Don't reset hasLoadedFullCollection - the cache (allVideosCatalog) is still valid
            console.log(`📊 Loaded ${this.app.allVideos.length} videos from ${folderName}`)

            // Smart default: Random sort for single folder view (mix it up!)
            this.app.sorting.setSortDefault('random')

            // Apply any active filters and render
            this.app.applyFilters()

        } catch (error) {
            console.error('❌ Error loading videos for category:', error)
            console.log(`Failed to load videos from ${folderName}`)
        }
    }

    async batchGenerateThumbnails(folderName) {
        try {
            console.log(`🖼️ Generating thumbnails for ${folderName}...`)

            // Get videos that need thumbnails
            const videosNeedingThumbnails = this.app.allVideos.filter(video =>
                !video.thumbnail_generated || video.thumbnail_generated === 0
            )

            if (videosNeedingThumbnails.length === 0) {
                console.log('✅ All videos already have thumbnails')
                return
            }

            console.log(`🔄 Generating thumbnails for ${videosNeedingThumbnails.length} videos...`)
            console.log(`🖼️ Generating ${videosNeedingThumbnails.length} thumbnails...`)

            // Generate thumbnails in batches to avoid overwhelming the server
            const batchSize = 5
            for (let i = 0; i < videosNeedingThumbnails.length; i += batchSize) {
                const batch = videosNeedingThumbnails.slice(i, i + batchSize)

                const promises = batch.map(async (video) => {
                    try {
                        const response = await fetch(`${this.app.apiBase}/api/thumbnails/generate/${video.id}`, {
                            method: 'POST'
                        })

                        if (response.ok) {
                            const result = await response.json()
                            console.log(`✅ Thumbnail generated for: ${video.name}`)

                            // Update video thumbnail status
                            video.thumbnail_generated = 1
                            video.thumbnail_url = `/api/thumbnails/${video.id}`

                            // Also update the cached allVideos data so Explorer view gets the thumbnails
                            if (this.app.allVideos) {
                                const cachedVideo = this.app.allVideos.find(v => v.id === video.id)
                                if (cachedVideo) {
                                    cachedVideo.thumbnail_generated = 1
                                    cachedVideo.thumbnail_url = `/api/thumbnails/${video.id}`
                                }
                            }

                            // Find and update the video card immediately
                            this.updateVideoCardThumbnail(video)

                            return true
                        } else {
                            console.warn(`⚠️ Failed to generate thumbnail for: ${video.name}`)
                            return false
                        }
                    } catch (error) {
                        console.error(`❌ Error generating thumbnail for ${video.name}:`, error)
                        return false
                    }
                })

                await Promise.all(promises)

                // Small delay between batches to prevent overwhelming the server
                if (i + batchSize < videosNeedingThumbnails.length) {
                    await new Promise(resolve => setTimeout(resolve, 500))
                }
            }

            // Re-render the video grid to show updated thumbnails
            this.app.renderVideoGrid()

            console.log('✅ Thumbnail generation completed')
            console.log('✅ All thumbnails generated successfully!')

        } catch (error) {
            console.error('❌ Error in batch thumbnail generation:', error)
        }
    }

    updateVideoCardThumbnail(video) {
        // Find the video card in the DOM using data attribute and update its thumbnail
        const card = document.querySelector(`.video-card[data-video-id="${video.id}"]`)

        if (!card) {
            console.log(`⚠️ Card not found for video ID ${video.id}, will be updated on next render`)
            return
        }

        const thumbnailDiv = card.querySelector('.video-thumbnail')
        if (!thumbnailDiv) {
            console.log(`⚠️ Thumbnail div not found in card for video ID ${video.id}`)
            return
        }

        // Add cache-busting parameter for immediate refresh
        let thumbnailUrl = video.thumbnail_url
        if (video.thumbnail_url && !video.thumbnail_url.includes('?')) {
            thumbnailUrl += '?v=' + Date.now()
        }

        // Replace the placeholder with the actual thumbnail
        thumbnailDiv.innerHTML = `
            <img src="${thumbnailUrl}" alt="${video.name}" class="thumbnail-image" loading="lazy" />
            <div class="play-overlay">▶</div>
            ${card.querySelector('.favorite-icon') ? card.querySelector('.favorite-icon').outerHTML : ''}
            ${card.querySelector('.final-badge') ? card.querySelector('.final-badge').outerHTML : ''}
        `

        console.log(`🖼️ Updated thumbnail for: ${video.name}`)
    }

    // ==================== FAST RESCAN ====================

    updateFastRescanButtonText() {
        const fastRescanBtn = document.getElementById('fastRescanBtn')
        if (!fastRescanBtn) return

        const foldersToScan = this.app.currentFolderFilter && this.app.currentFolderFilter.length > 0
            ? this.app.currentFolderFilter
            : []

        if (foldersToScan.length === 0) {
            fastRescanBtn.textContent = '⚡ Fast Rescan All'
        } else if (foldersToScan.length === 1) {
            fastRescanBtn.textContent = `⚡ Fast Rescan (1)`
        } else {
            fastRescanBtn.textContent = `⚡ Fast Rescan (${foldersToScan.length})`
        }
    }

    async performFastRescan(folders = null) {
        try {
            // Determine which folders to scan
            let foldersToScan = []

            if (folders && Array.isArray(folders) && folders.length > 0) {
                // Priority 1: Explicit folders passed as argument (e.g. from folder group)
                foldersToScan = folders
            } else if (this.app.currentFolderFilter && this.app.currentFolderFilter.length > 0) {
                // Priority 2: Current folder filter
                foldersToScan = this.app.currentFolderFilter
            }
            // else: empty array means scan ALL folders

            // Build scan message
            let toastMessage
            if (foldersToScan.length === 0) {
                toastMessage = '⚡ Fast rescan started for all folders (skipping thumbnails and metadata)...'
            } else if (foldersToScan.length === 1) {
                toastMessage = `⚡ Fast rescan started for "${foldersToScan[0]}" (skipping thumbnails and metadata)...`
            } else {
                toastMessage = `⚡ Fast rescan started for ${foldersToScan.join(', ')} (skipping thumbnails and metadata)...`
            }

            console.log(toastMessage)

            // Build URL with folder filter if applicable
            let url = `${this.app.apiBase}/scan?sync_db=true&prune_missing=true&fast_mode=true`
            if (foldersToScan.length > 0) {
                url += `&folders=${encodeURIComponent(foldersToScan.join(','))}`
            }

            // Call scan endpoint
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const data = await response.json()

            // Count total videos across all categories
            let totalVideos = 0
            for (const categoryData of Object.values(data.categories || {})) {
                totalVideos += categoryData.videos?.length || 0
            }

            const pruned = data.pruned_missing || 0
            const scanDuration = data.scan_duration || 0

            // Build success message
            let successMessage
            if (foldersToScan.length === 0) {
                successMessage = `✅ Fast rescan complete (all folders): ${totalVideos} videos found, ${pruned} removed, ${scanDuration.toFixed(1)}s`
            } else {
                successMessage = `✅ Fast rescan complete (${foldersToScan.length} folder${foldersToScan.length > 1 ? 's' : ''}): ${totalVideos} videos found, ${pruned} removed, ${scanDuration.toFixed(1)}s`
            }

            // Show results
            console.log(successMessage)

            // Reload videos to reflect changes - FORCE reload to clear cache of deleted videos
            await this.app.loadAllVideosFlat(true)
            this.app.applyFilters()

            // Reload scan status and folder structure
            await this.app.loadScanStatus()
            await this.app.loadFolderStructure()

            // Re-render explorer if in that view
            if (this.app.currentView === 'explorer') {
                this.app.renderFolderExplorer()
            }

        } catch (error) {
            console.error('❌ Error during fast rescan:', error)
            console.log('❌ Fast rescan failed. Check console for details.')
        }
    }

    // ==================== DATABASE CLEANUP ====================

    async cleanupDatabase() {
        /**
         * Cleanup Database - Remove entries for files that no longer exist
         * Simple one-click solution to remove deleted videos from database
         */
        try {
            // Confirm with user
            const confirmed = confirm(
                '🧹 Cleanup Database\n\n' +
                'This will scan all folders and remove database entries for videos that no longer exist on disk.\n\n' +
                'Continue?'
            )

            if (!confirmed) return

            console.log('🧹 Starting database cleanup...')
            this.app.showRefreshLoadingOverlay()

            // Call scan with prune_missing=true to remove deleted files
            const response = await fetch(`${this.app.apiBase}/scan?sync_db=true&prune_missing=true&fast_mode=true`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const data = await response.json()
            const pruned = data.pruned_missing || 0

            this.app.hideRefreshLoadingOverlay()

            if (pruned > 0) {
                alert(`🧹 Cleanup complete!\n\nRemoved ${pruned} database entries for deleted files.`)

                // Force reload collection cache
                this.app.hasLoadedFullCollection = false
                this.app.allVideosCatalog = []

                // Reload current view
                if (this.app.currentView === 'list') {
                    await this.app.loadAllVideosFlat(true)
                } else {
                    await this.app.loadFolderStructure()
                    this.app.renderFolderExplorer()
                }
            } else {
                alert('✅ Database is clean!\n\nNo deleted files found.')
            }

            console.log(`🧹 Cleanup complete: ${pruned} entries removed`)

        } catch (error) {
            console.error('❌ Error during database cleanup:', error)
            this.app.hideRefreshLoadingOverlay()
            alert('❌ Cleanup failed. Check console for details.')
        }
    }

    // ==================== METADATA PARSING ====================

    async parseMetadataForCurrentFolder() {
        try {
            // Get current folder context
            const category = this.app.currentCategory || null
            const subcategory = this.app.currentSubcategory || null

            // Build toast message
            let toastMessage
            if (!category) {
                toastMessage = '📝 Parsing metadata for all videos...'
            } else if (!subcategory) {
                toastMessage = `📝 Parsing metadata for "${category}"...`
            } else {
                toastMessage = `📝 Parsing metadata for "${category}/${subcategory}"...`
            }

            console.log(toastMessage)

            // Build URL with folder filters
            let url = `${this.app.apiBase}/api/videos/parse-metadata`
            const params = new URLSearchParams()
            if (category) params.append('category', category)
            if (subcategory) params.append('subcategory', subcategory)

            if (params.toString()) {
                url += '?' + params.toString()
            }

            // Call parse-metadata endpoint
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            })

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            const data = await response.json()

            const updated = data.updated || 0
            const skipped = data.skipped || 0

            // Build success message
            let successMessage
            if (!category) {
                successMessage = `✅ Metadata parsed (all videos): ${updated} updated, ${skipped} skipped`
            } else if (!subcategory) {
                successMessage = `✅ Metadata parsed ("${category}"): ${updated} updated, ${skipped} skipped`
            } else {
                successMessage = `✅ Metadata parsed ("${category}/${subcategory}"): ${updated} updated, ${skipped} skipped`
            }

            // Show results
            console.log(successMessage)

            // Reload videos to reflect metadata changes
            await this.app.loadAllVideosFlat()
            this.app.applyFilters()

            // Re-render current view
            if (this.app.currentView === 'explorer') {
                this.app.renderFolderExplorer()
            }

        } catch (error) {
            console.error('❌ Error parsing metadata:', error)
            console.log('❌ Metadata parsing failed. Check console for details.')
        }
    }

    // ==================== FOLDER DETAILS ====================

    showFolderDetails(folderName) {
        this.app.hideFolderMenu()
        const scanStatus = this.app.scanStatus[folderName]
        const videoCount = scanStatus?.video_count || 0
        const lastScanned = scanStatus?.last_scanned
        const scanDate = lastScanned ? new Date(lastScanned * 1000).toLocaleString() : 'Never'
        const scanDuration = scanStatus?.scan_duration || 0

        console.log(`📊 ${folderName}: ${videoCount} videos • Last scanned: ${scanDate} • Scan took: ${scanDuration.toFixed(1)}s`)
    }

    async loadMetadataForFolderFromMenu(folderName) {
        this.app.hideFolderMenu()
        await this.app.loadMetadataForFolder(folderName)
    }

    // ==================== REGENERATE THUMBNAILS ====================

    async regenerateFolderThumbnails(folderName) {
        this.app.hideFolderMenu()

        try {
            // Fetch all videos in this folder
            console.log(`📊 Loading videos from ${folderName}...`)

            const data = await this.app.api.getVideosByFolder(folderName, false)
            const videos = Array.isArray(data) ? data : (data.videos || [])

            if (videos.length === 0) {
                console.log(`No videos found in ${folderName}`)
                return
            }

            // Confirm with user
            const confirmed = confirm(
                `Regenerate thumbnails for ${videos.length} videos in "${folderName}"?\n\n` +
                `This will refresh all cached thumbnails.`
            )

            if (!confirmed) {
                return
            }

            // Regenerate thumbnails in batches (progress shown in console)
            console.log(`🖼️ Starting thumbnail regeneration for ${videos.length} videos...`)

            let completed = 0
            let failed = 0

            // Process in parallel batches of 5
            const batchSize = 5
            for (let i = 0; i < videos.length; i += batchSize) {
                const batch = videos.slice(i, i + batchSize)

                const promises = batch.map(async (video) => {
                    try {
                        await this.app.api.generateThumbnail(video.id)
                        completed++
                        console.log(`✓ Thumbnail regenerated for: ${video.name} (${completed}/${videos.length})`)

                        // Update thumbnail URL with aggressive cache busting
                        const cacheBuster = Date.now() + completed
                        const randomBuster = Math.random()

                        // Update in memory
                        const videoInMemory = this.app.allVideos.find(v => v.id === video.id)
                        if (videoInMemory && videoInMemory.thumbnail_url) {
                            const baseThumbnailUrl = videoInMemory.thumbnail_url.split('?')[0]
                            videoInMemory.thumbnail_url = `${baseThumbnailUrl}?t=${cacheBuster}&bust=${randomBuster}`
                        }

                        const videoInView = this.app.videos.find(v => v.id === video.id)
                        if (videoInView && videoInView.thumbnail_url) {
                            const baseThumbnailUrl = videoInView.thumbnail_url.split('?')[0]
                            videoInView.thumbnail_url = `${baseThumbnailUrl}?t=${cacheBuster}&bust=${randomBuster}`
                        }
                    } catch (error) {
                        failed++
                        console.error(`✗ Error regenerating thumbnail for ${video.name}:`, error)
                    }
                })

                await Promise.all(promises)

                // Progress logged to console
                console.log(`🖼️ Progress: ${completed}/${videos.length} completed...`)
            }

            // Show final results
            if (failed > 0) {
                console.log(`⚠️ Completed with errors: ${completed} succeeded, ${failed} failed`)
            } else {
                console.log(`✅ Regenerated ${completed} thumbnail${completed !== 1 ? 's' : ''}`)
            }

            // Refresh the view to show updated thumbnails
            if (this.app.currentView === 'list') {
                this.app.renderVideoGrid()
            } else if (this.app.currentView === 'explorer' && this.app.currentCategory === folderName) {
                // If we're currently viewing this folder, refresh it
                this.app.renderVideoGrid()
            }

        } catch (error) {
            console.error('❌ Error regenerating folder thumbnails:', error)
            console.log(`❌ Failed to regenerate thumbnails for ${folderName}`)
        }
    }

    // ==================== GENERATE FINGERPRINTS ====================

    async generateFolderFingerprints(folderName) {
        this.app.hideFolderMenu()

        try {
            // Fetch all videos in this folder
            console.log(`📊 Loading videos from ${folderName}...`)

            const response = await fetch(`${this.app.apiBase}/videos/${encodeURIComponent(folderName)}`)
            if (!response.ok) {
                throw new Error('Failed to fetch videos')
            }

            const data = await response.json()
            const videos = Array.isArray(data) ? data : (data.videos || [])

            if (videos.length === 0) {
                console.log(`No videos found in ${folderName}`)
                return
            }

            // Filter out videos that already have fingerprints
            const videosWithoutFingerprints = videos.filter(v => !v.fingerprint_generated)

            if (videosWithoutFingerprints.length === 0) {
                console.log(`All videos in ${folderName} already have fingerprints`)
                return
            }

            // Confirm with user
            const confirmed = confirm(
                `Generate fingerprints for ${videosWithoutFingerprints.length} videos in "${folderName}"?\n\n` +
                `(${videos.length - videosWithoutFingerprints.length} videos already have fingerprints)`
            )

            if (!confirmed) {
                return
            }

            // Initialize progress tracking
            this.app.progressOverlayDismissed = false
            this.app.cancelProgressCallback = null
            let cancelled = false

            // Set up cancel callback
            this.app.cancelProgressCallback = () => {
                cancelled = true
                console.log('Fingerprint generation cancelled')
            }

            console.log(`🔒 Starting fingerprint generation for ${videosWithoutFingerprints.length} videos...`)

            let completed = 0
            let failed = 0
            const total = videosWithoutFingerprints.length

            // Show initial progress
            this.app.showProgressOverlay(
                '🆔 Generating Fingerprints',
                `Processing videos in ${folderName}...`,
                completed,
                total
            )

            // Process in parallel batches of 3
            const batchSize = 3
            for (let i = 0; i < videosWithoutFingerprints.length && !cancelled; i += batchSize) {
                const batch = videosWithoutFingerprints.slice(i, i + batchSize)

                const promises = batch.map(async (video) => {
                    if (cancelled) return

                    try {
                        const response = await fetch(`${this.app.apiBase}/api/videos/${video.id}/fingerprint`, {
                            method: 'POST'
                        })

                        if (response.ok) {
                            completed++
                            console.log(`✓ Fingerprint generated for: ${video.name} (${completed}/${total})`)

                            // Update video in memory
                            video.fingerprint_generated = 1
                            const videoInMemory = this.app.allVideos.find(v => v.id === video.id)
                            if (videoInMemory) {
                                videoInMemory.fingerprint_generated = 1
                            }
                        } else {
                            failed++
                            console.error(`✗ Failed to generate fingerprint for: ${video.name}`)
                        }
                    } catch (error) {
                        failed++
                        console.error(`✗ Error generating fingerprint for ${video.name}:`, error)
                    }
                })

                await Promise.all(promises)

                // Update progress
                if (!cancelled) {
                    if (this.app.progressOverlayDismissed) {
                        // Show top bar
                        this.app.showTopProgressBar('🆔', 'Fingerprinting videos...', completed, total)
                    } else {
                        // Show overlay
                        this.app.showProgressOverlay(
                            '🆔 Generating Fingerprints',
                            `Processing videos in ${folderName}...`,
                            completed,
                            total
                        )
                    }
                }
            }

            // Hide progress UI
            this.app.hideProgressOverlay()
            this.app.hideTopProgressBar()
            this.app.cancelProgressCallback = null

            if (cancelled) {
                return
            }

            // Show final results
            if (failed > 0) {
                console.log(`⚠️ Completed with errors: ${completed} succeeded, ${failed} failed`)
            } else {
                console.log(`✓ Generated fingerprints for ${completed} videos`)
            }

            // Refresh the view to show updated fingerprint badges
            if (this.app.currentView === 'list') {
                this.app.renderVideoGrid()
            } else if (this.app.currentView === 'explorer' && this.app.currentCategory === folderName) {
                // If we're currently viewing this folder, refresh it
                this.app.renderVideoGrid()
            }

        } catch (error) {
            console.error('❌ Error generating folder fingerprints:', error)
            this.app.hideProgressOverlay()
            this.app.hideTopProgressBar()
            console.log(`❌ Failed to generate fingerprints for ${folderName}`)
        }
    }

    // ==================== AUTO-SCAN FACES ====================

    async autoScanFacesInFolder(folderName, maxDuration = null) {
        /**
         * Auto-scan all videos in a folder for faces
         * Runs backend face detection on all videos without opening the player
         *
         * Args:
         *   folderName: Name of folder to scan
         *   maxDuration: Optional max duration in seconds (e.g., 3 for fast mode on first 3 seconds)
         */
        this.app.hideFolderMenu()

        try {
            // Fetch all videos in this folder
            const modeLabel = maxDuration ? ` (Fast - First ${maxDuration}s)` : ''
            console.log(`📊 Loading videos from ${folderName}${modeLabel}...`)

            const response = await fetch(`${this.app.apiBase}/videos/${encodeURIComponent(folderName)}`)
            if (!response.ok) {
                throw new Error('Failed to fetch videos')
            }

            const data = await response.json()
            const videos = Array.isArray(data) ? data : (data.videos || [])

            if (videos.length === 0) {
                console.log(`No videos found in ${folderName}`)
                return
            }

            // Confirm with user
            const timeLabel = maxDuration ? ` (scanning first ${maxDuration}s of each video)` : ''
            const confirmed = confirm(
                `Auto-scan faces for all ${videos.length} videos in "${folderName}"${timeLabel}?\n\n` +
                `This will run backend face detection on each video.\n` +
                `Processing may take a few minutes.`
            )

            if (!confirmed) {
                return
            }

            // Initialize progress tracking
            this.app.progressOverlayDismissed = false
            this.app.cancelProgressCallback = null
            let cancelled = false

            // Set up cancel callback
            this.app.cancelProgressCallback = () => {
                cancelled = true
                console.log('Face scanning cancelled')
            }

            console.log(`🔍👤 Starting auto-scan for ${videos.length} videos...`)
            let completed = 0
            let totalFacesFound = 0
            let newFacesCreated = 0

            // Process each video sequentially
            for (const video of videos) {
                if (cancelled) break

                try {
                    const params = new URLSearchParams({ num_frames: '10' })
                    if (maxDuration) {
                        params.append('max_duration', maxDuration)
                    }

                    const scanResponse = await fetch(
                        `/api/videos/${video.id}/auto-scan-faces?${params}`,
                        { method: 'POST' }
                    )

                    if (scanResponse.ok) {
                        const result = await scanResponse.json()
                        totalFacesFound += result.detected_count || 0
                        newFacesCreated += result.new_faces_count || 0
                        const modeLabel = maxDuration ? ` (Fast)` : ''
                        console.log(`✓ Scanned ${video.name}${modeLabel}: ${result.detected_count} faces found`)
                    } else {
                        console.error(`✗ Failed to scan ${video.name}`)
                    }
                } catch (error) {
                    console.error(`✗ Error scanning ${video.name}:`, error)
                }

                completed++

                // Update progress
                if (!cancelled) {
                    if (this.app.progressOverlayDismissed) {
                        // Show top bar
                        this.app.showTopProgressBar('🔍👤', 'Scanning faces...', completed, videos.length)
                    } else {
                        // Show overlay
                        this.app.showProgressOverlay(
                            '👤 Auto-Scanning Faces',
                            `Processing ${folderName}... (${completed}/${videos.length})\n${totalFacesFound} faces found so far`,
                            completed,
                            videos.length
                        )
                    }
                }

                // Small delay between requests to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100))
            }

            // Hide progress indicators
            this.app.hideProgressOverlay()
            this.app.hideTopProgressBar()

            if (cancelled) {
                console.log(`Face scanning cancelled (${completed}/${videos.length} videos scanned)`)
            } else {
                console.log(`✅ Face scanning complete: ${totalFacesFound} total faces found (${newFacesCreated} new)`)
                console.log(`✅ Auto-scan complete: ${totalFacesFound} faces, ${newFacesCreated} new`)
            }

        } catch (error) {
            console.error('❌ Error auto-scanning faces:', error)
            this.app.hideProgressOverlay()
            this.app.hideTopProgressBar()
            console.log(`❌ Failed to auto-scan faces for ${folderName}`)
        }
    }
}

// Export as global
window.ScanSystemModule = ScanSystemModule
