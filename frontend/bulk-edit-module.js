/**
 * BulkEditModule - Bulk edit view functionality
 * Handles folder-level bulk editing of video metadata
 */
class BulkEditModule {
    constructor(app) {
        this.app = app

        // Bulk edit state
        this.bulkEditFolderName = null
        this.bulkEditVideos = []
        this.bulkEditChanges = {}
    }

    // ============ Open Bulk Edit ============

    async openBulkEditForFolder(folderName) {
        this.app.hideFolderMenu()

        try {
            console.log(`Loading videos from ${folderName}...`)

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

            // Store folder name and videos for bulk edit
            this.bulkEditFolderName = folderName
            this.bulkEditVideos = videos.map(v => ({
                ...v,
                _originalData: { ...v }
            }))
            this.bulkEditChanges = {}

            this.showBulkEditView()

        } catch (error) {
            console.error('Error loading videos for bulk edit:', error)
            console.log(`Failed to load videos from ${folderName}`)
        }
    }

    // ============ View Management ============

    showBulkEditView() {
        // Hide other views
        document.getElementById('videoGrid').style.display = 'none'
        document.getElementById('folderExplorer').style.display = 'none'
        document.getElementById('seriesView').style.display = 'none'
        document.getElementById('listViewControls').style.display = 'none'

        // Show bulk edit view
        const bulkEditView = document.getElementById('bulkEditView')
        bulkEditView.style.display = 'flex'

        // Clear Apply to All fields
        document.getElementById('applyAllChannel').value = ''
        document.getElementById('applyAllSeries').value = ''
        document.getElementById('applyAllYear').value = ''

        // Update title and subtitle
        document.getElementById('bulkEditTitle').textContent = `Bulk Edit: ${this.bulkEditFolderName}`
        document.getElementById('bulkEditSubtitle').textContent =
            `Editing ${this.bulkEditVideos.length} video${this.bulkEditVideos.length !== 1 ? 's' : ''} - Changes are highlighted in orange`

        this.renderBulkEditList()
        this.setupBulkEditEventListeners()

        console.log(`Opened bulk edit view for ${this.bulkEditFolderName} (${this.bulkEditVideos.length} videos)`)
    }

    closeBulkEditView(skipConfirmation = false) {
        const changeCount = Object.keys(this.bulkEditChanges).length

        if (!skipConfirmation && changeCount > 0) {
            const confirmed = confirm(
                `You have unsaved changes to ${changeCount} video${changeCount !== 1 ? 's' : ''}. Discard changes?`
            )
            if (!confirmed) return
        }

        document.getElementById('bulkEditView').style.display = 'none'

        if (this.app.currentView === 'explorer') {
            document.getElementById('folderExplorer').style.display = 'block'
            if (this.app.currentCategory === this.bulkEditFolderName) {
                this.app.renderFolderExplorer()
            }
        } else {
            document.getElementById('videoGrid').style.display = 'grid'
            document.getElementById('listViewControls').style.display = 'block'
            this.app.loadVideos()
        }

        this.bulkEditFolderName = null
        this.bulkEditVideos = []
        this.bulkEditChanges = {}

        console.log('Closed bulk edit view')
    }

    // ============ Rendering ============

    renderBulkEditList() {
        const list = document.getElementById('bulkEditList')
        list.innerHTML = ''

        this.bulkEditVideos.forEach((video, index) => {
            const card = this.createBulkEditCard(video, index)
            list.appendChild(card)
        })
    }

    createBulkEditCard(video, index) {
        const card = document.createElement('div')
        card.className = 'bulk-edit-card'
        card.dataset.videoId = video.id
        card.dataset.index = index

        const thumbnailUrl = video.thumbnail_url ?
            `${this.app.apiBase}${video.thumbnail_url}?t=${video.modified || Date.now()}&bustCache=${Math.random()}` :
            ''

        let seasonEpisodeBadges = ''
        if (video.season || video.episode) {
            const badges = []
            if (video.season) {
                badges.push(`<span class="video-season-badge">(S${String(video.season).padStart(2, '0')})</span>`)
            }
            if (video.episode) {
                const episodeDisplay = /^E\d+$/i.test(video.episode) ?
                    video.episode.toUpperCase() :
                    (video.episode.match(/^\d+$/) ? `E${String(video.episode).padStart(2, '0')}` : video.episode)
                badges.push(`<span class="video-episode-badge">(${episodeDisplay})</span>`)
            }
            seasonEpisodeBadges = ` ${badges.join(' ')}`
        }

        const channelBadge = video.channel ?
            `<span class="video-channel-badge-grey">${this.app.escapeHtml(video.channel)}</span>` : ''

        const duration = video.duration ? this.app.formatDuration(video.duration) : 'N/A'
        const resolution = video.width && video.height ?
            this.app.formatResolution(video.width, video.height) : 'N/A'
        const fileSize = video.size ? this.formatFileSize(video.size) : 'N/A'

        card.innerHTML = `
            <div class="bulk-edit-card-header">
                <img src="${thumbnailUrl}" alt="${video.name}" class="bulk-edit-thumbnail"
                     onerror="this.style.display='none'">
                <div class="bulk-edit-video-info">
                    <div class="bulk-edit-title-row">
                        <h3 class="bulk-edit-video-title">${this.app.escapeHtml(video.display_name || video.name)}${seasonEpisodeBadges}</h3>
                        ${channelBadge}
                    </div>
                    <div class="bulk-edit-video-meta">
                        <span>${duration}</span>
                        <span>${resolution}</span>
                        <span>${fileSize}</span>
                    </div>
                </div>
                <button class="bulk-edit-undo-btn"
                        data-video-id="${video.id}"
                        onclick="app.bulkEditModule.undoBulkEditVideo(${video.id})"
                        title="Undo all changes for this video"
                        style="display: none;">
                    Undo
                </button>
            </div>
            <div class="bulk-edit-fields">
                <div class="bulk-edit-field">
                    <label>Display Name</label>
                    <input type="text"
                           class="bulk-edit-input"
                           data-field="display_name"
                           data-video-id="${video.id}"
                           value="${this.app.escapeHtml(video.display_name || '')}"
                           placeholder="User-friendly name">
                </div>
                <div class="bulk-edit-field">
                    <label>Channel</label>
                    <input type="text"
                           class="bulk-edit-input"
                           data-field="channel"
                           data-video-id="${video.id}"
                           value="${this.app.escapeHtml(video.channel || '')}"
                           placeholder="HBO, Netflix, etc.">
                </div>
                <div class="bulk-edit-field">
                    <label>Year</label>
                    <input type="number"
                           class="bulk-edit-input"
                           data-field="year"
                           data-video-id="${video.id}"
                           value="${video.year || ''}"
                           placeholder="2023"
                           min="1900"
                           max="2100">
                </div>
                <div class="bulk-edit-field">
                    <label>Series</label>
                    <input type="text"
                           class="bulk-edit-input"
                           data-field="series"
                           data-video-id="${video.id}"
                           value="${this.app.escapeHtml(video.series || '')}"
                           placeholder="Series name">
                </div>
                <div class="bulk-edit-field">
                    <label>Season</label>
                    <input type="number"
                           class="bulk-edit-input"
                           data-field="season"
                           data-video-id="${video.id}"
                           value="${video.season || ''}"
                           placeholder="1"
                           min="1"
                           max="99">
                </div>
                <div class="bulk-edit-field">
                    <label>Episode</label>
                    <input type="text"
                           class="bulk-edit-input"
                           data-field="episode"
                           data-video-id="${video.id}"
                           value="${this.app.escapeHtml(video.episode || '')}"
                           placeholder="E01">
                </div>
                <div class="bulk-edit-field bulk-edit-field-filename">
                    <label>File Name</label>
                    <div class="bulk-edit-filename-row">
                        <input type="text"
                               class="bulk-edit-input"
                               data-field="new_name"
                               data-video-id="${video.id}"
                               value="${this.app.escapeHtml(video.name || '')}"
                               placeholder="Actual filename">
                        <button class="bulk-edit-auto-btn"
                                onclick="app.bulkEditModule.autoFormatFilename(${video.id})"
                                title="Auto-format filename">
                            Auto
                        </button>
                    </div>
                </div>
            </div>
        `

        return card
    }

    // ============ Event Listeners ============

    setupBulkEditEventListeners() {
        document.getElementById('bulkEditSaveBtn').onclick = () => this.saveBulkEditChanges()
        document.getElementById('bulkEditCancelBtn').onclick = () => this.closeBulkEditView()
        document.getElementById('bulkApplyToggleBtn').onclick = () => this.toggleBulkApplySection()
        document.getElementById('applyAllBtn').onclick = () => this.applyToAllVideos()
        document.getElementById('clearAllBtn').onclick = () => this.clearApplyAllFields()

        document.querySelectorAll('.bulk-edit-input').forEach(input => {
            input.addEventListener('input', (e) => {
                this.trackBulkEditChange(e.target)
            })
        })
    }

    // ============ Change Tracking ============

    trackBulkEditChange(input) {
        const videoId = parseInt(input.dataset.videoId)
        const field = input.dataset.field
        const value = input.value.trim()

        const video = this.bulkEditVideos.find(v => v.id === videoId)
        if (!video) return

        const originalValue = video._originalData[field] || ''
        const hasChanged = value !== String(originalValue)

        if (hasChanged) {
            input.classList.add('modified')
        } else {
            input.classList.remove('modified')
        }

        if (!this.bulkEditChanges[videoId]) {
            this.bulkEditChanges[videoId] = {}
        }

        if (hasChanged) {
            this.bulkEditChanges[videoId][field] = value
        } else {
            delete this.bulkEditChanges[videoId][field]
            if (Object.keys(this.bulkEditChanges[videoId]).length === 0) {
                delete this.bulkEditChanges[videoId]
            }
        }

        const card = document.querySelector(`.bulk-edit-card[data-video-id="${videoId}"]`)
        if (card) {
            const undoBtn = card.querySelector('.bulk-edit-undo-btn')
            if (undoBtn) {
                const hasChanges = this.bulkEditChanges[videoId] && Object.keys(this.bulkEditChanges[videoId]).length > 0
                undoBtn.style.display = hasChanges ? 'block' : 'none'
            }
        }
    }

    undoBulkEditVideo(videoId) {
        const video = this.bulkEditVideos.find(v => v.id === videoId)
        if (!video) return

        const card = document.querySelector(`.bulk-edit-card[data-video-id="${videoId}"]`)
        if (!card) return

        const fields = ['display_name', 'channel', 'year', 'series', 'season', 'episode', 'new_name']
        fields.forEach(field => {
            const input = card.querySelector(`input[data-field="${field}"]`)
            if (input) {
                const originalValue = video._originalData[field] || ''
                input.value = originalValue
                input.classList.remove('modified')
            }
        })

        delete this.bulkEditChanges[videoId]

        const undoBtn = card.querySelector('.bulk-edit-undo-btn')
        if (undoBtn) {
            undoBtn.style.display = 'none'
        }

        console.log(`Reverted all changes for video ID ${videoId}`)
    }

    // ============ Bulk Apply ============

    toggleBulkApplySection() {
        const section = document.getElementById('bulkApplyAllSection')
        const toggleBtn = document.getElementById('bulkApplyToggleBtn')

        if (section.style.display === 'none') {
            section.style.display = 'block'
            toggleBtn.textContent = 'Bulk Apply ^'
            toggleBtn.title = 'Collapse bulk apply options'
        } else {
            section.style.display = 'none'
            toggleBtn.textContent = 'Bulk Apply...'
            toggleBtn.title = 'Expand bulk apply options'
        }
    }

    applyToAllVideos() {
        const channelValue = document.getElementById('applyAllChannel').value.trim()
        const seriesValue = document.getElementById('applyAllSeries').value.trim()
        const yearValue = document.getElementById('applyAllYear').value.trim()

        if (!channelValue && !seriesValue && !yearValue) {
            console.log('Please enter at least one value to apply')
            return
        }

        let appliedCount = 0
        const fields = []
        if (channelValue) fields.push('Channel')
        if (seriesValue) fields.push('Series')
        if (yearValue) fields.push('Year')

        this.bulkEditVideos.forEach(video => {
            const card = document.querySelector(`.bulk-edit-card[data-video-id="${video.id}"]`)
            if (!card) return

            let hasChanges = false

            if (channelValue) {
                const input = card.querySelector('input[data-field="channel"]')
                if (input) {
                    input.value = channelValue
                    this.trackBulkEditChange(input)
                    hasChanges = true
                }
            }

            if (seriesValue) {
                const input = card.querySelector('input[data-field="series"]')
                if (input) {
                    input.value = seriesValue
                    this.trackBulkEditChange(input)
                    hasChanges = true
                }
            }

            if (yearValue) {
                const input = card.querySelector('input[data-field="year"]')
                if (input) {
                    input.value = yearValue
                    this.trackBulkEditChange(input)
                    hasChanges = true
                }
            }

            if (hasChanges) appliedCount++
        })

        console.log(`Applied ${fields.join(', ')} to ${appliedCount} video${appliedCount !== 1 ? 's' : ''}`)

        setTimeout(() => {
            const section = document.getElementById('bulkApplyAllSection')
            const toggleBtn = document.getElementById('bulkApplyToggleBtn')
            section.style.display = 'none'
            toggleBtn.textContent = 'Bulk Apply...'
            toggleBtn.title = 'Expand bulk apply options'
        }, 500)
    }

    clearApplyAllFields() {
        document.getElementById('applyAllChannel').value = ''
        document.getElementById('applyAllSeries').value = ''
        document.getElementById('applyAllYear').value = ''
    }

    // ============ Auto Format ============

    autoFormatFilename(videoId) {
        const video = this.bulkEditVideos.find(v => v.id === videoId)
        if (!video) return

        const card = document.querySelector(`.bulk-edit-card[data-video-id="${videoId}"]`)
        if (!card) return

        const displayNameInput = card.querySelector('input[data-field="display_name"]')
        const seasonInput = card.querySelector('input[data-field="season"]')
        const episodeInput = card.querySelector('input[data-field="episode"]')
        const yearInput = card.querySelector('input[data-field="year"]')
        const channelInput = card.querySelector('input[data-field="channel"]')
        const filenameInput = card.querySelector('input[data-field="new_name"]')

        const displayName = displayNameInput.value.trim()
        const season = seasonInput.value.trim()
        const episode = episodeInput.value.trim()
        const year = yearInput.value.trim()
        const channel = channelInput.value.trim()

        const parts = []

        if (displayName) {
            parts.push(displayName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_'))
        }

        if (season) {
            parts.push(`S${String(season).padStart(2, '0')}`)
        }

        if (episode) {
            const episodeFormatted = /^\d+$/.test(episode) ? `E${String(episode).padStart(2, '0')}` : episode.replace(/\s+/g, '_')
            parts.push(episodeFormatted)
        }

        if (year) {
            parts.push(year)
        }

        if (video.width && video.height) {
            const resolution = this.app.formatResolution(video.width, video.height)
            if (resolution) {
                parts.push(resolution)
            }
        }

        if (channel) {
            parts.push(channel.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_'))
        }

        if (parts.length === 0) {
            console.log('Fill in some metadata first to auto-format')
            return
        }

        const originalFilename = video.name
        const extension = originalFilename.substring(originalFilename.lastIndexOf('.'))
        const newFilename = parts.join('_') + extension

        const currentFilename = filenameInput.value.trim()
        if (currentFilename === newFilename) {
            console.log('Filename is already in correct format')
            return
        }

        filenameInput.value = newFilename
        const event = new Event('input', { bubbles: true })
        filenameInput.dispatchEvent(event)

        console.log(`Auto-formatted filename for video ${videoId}: ${newFilename}`)
    }

    // ============ Save Changes ============

    async saveBulkEditChanges() {
        const changeCount = Object.keys(this.bulkEditChanges).length

        if (changeCount === 0) {
            console.log('No changes to save')
            return
        }

        const confirmed = confirm(
            `Save changes to ${changeCount} video${changeCount !== 1 ? 's' : ''}?`
        )

        if (!confirmed) return

        console.log(`Saving bulk edit changes for ${changeCount} videos...`)

        let completed = 0
        let failed = 0
        const updatedVideoIds = []

        for (const [videoIdStr, changes] of Object.entries(this.bulkEditChanges)) {
            const videoId = parseInt(videoIdStr)
            const video = this.bulkEditVideos.find(v => v.id === videoId)

            if (!video) {
                failed++
                continue
            }

            try {
                const payload = {}

                ['display_name', 'new_name', 'series', 'episode', 'channel'].forEach(field => {
                    if (changes[field] !== undefined) {
                        payload[field] = changes[field]
                    }
                })

                if (changes.season !== undefined) {
                    payload.season = parseInt(changes.season) || null
                }
                if (changes.year !== undefined) {
                    payload.year = parseInt(changes.year) || null
                }

                const response = await fetch(`${this.app.apiBase}/videos/${videoId}/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                })

                if (response.ok) {
                    completed++
                    updatedVideoIds.push(videoId)
                    console.log(`Updated ${video.display_name || video.name} (${completed}/${changeCount})`)
                } else {
                    failed++
                    const errorData = await response.json().catch(() => ({}))
                    const errorMsg = response.status === 409
                        ? `Duplicate filename: ${video.display_name || video.name}`
                        : `Failed to update ${video.display_name || video.name}`
                    console.error(errorMsg, errorData)

                    if (response.status === 409) {
                        const card = document.querySelector(`.bulk-edit-card[data-video-id="${videoId}"]`)
                        const filenameInput = card?.querySelector('input[data-field="new_name"]')
                        if (filenameInput) {
                            filenameInput.style.borderColor = '#ef4444'
                            filenameInput.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.1)'
                        }
                    }
                }

            } catch (error) {
                failed++
                console.error(`Error updating video ${videoId}:`, error)
            }
        }

        if (failed > 0) {
            console.log(`Completed with errors: ${completed} succeeded, ${failed} failed`)

            if (updatedVideoIds.length > 0) {
                console.log(`Auto-refreshing ${updatedVideoIds.length} successful updates...`)
                for (let i = 0; i < updatedVideoIds.length; i += 5) {
                    const batch = updatedVideoIds.slice(i, i + 5)
                    await Promise.all(batch.map(id => this.app.refreshVideoMetadata(id)))
                }
                await this.app.loadMetadataSuggestions()
            }
        } else {
            console.log(`Successfully updated ${completed} video${completed !== 1 ? 's' : ''}`)
            this.closeBulkEditView(true)

            if (updatedVideoIds.length > 0) {
                console.log(`Auto-refreshing ${updatedVideoIds.length} updated videos...`)
                for (let i = 0; i < updatedVideoIds.length; i += 5) {
                    const batch = updatedVideoIds.slice(i, i + 5)
                    await Promise.all(batch.map(id => this.app.refreshVideoMetadata(id)))
                }
            }

            await this.app.loadMetadataSuggestions()
        }
    }

    // ============ Utility ============

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }
}

// Export as global
window.BulkEditModule = BulkEditModule
