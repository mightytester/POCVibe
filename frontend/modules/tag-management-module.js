/**
 * TagManagementModule - Tag modal and management functionality
 * Handles tag autocomplete, add/remove tags from videos, mobile tag modal
 */
class TagManagementModule {
    constructor(app) {
        this.app = app
        this.api = app.api

        // Modal state
        this.currentVideoTags = [] // Tags for currently open modal
    }

    // ============ Desktop Tag Modal ============

    async showTagModal(videoId, videoName) {
        this.app.currentVideo = { id: videoId, name: videoName }

        // Hide Duplicates Review View if active
        this.app.hideDuplicatesReviewIfActive()

        // Load current tags for this video
        const video = this.app.allVideos.find(v => v.id === videoId) ||
            this.app.videos.find(v => v.id === videoId)
        this.currentVideoTags = video ? video.tags || [] : []

        // Clear previous input
        const tagInput = document.getElementById('tagInput')
        tagInput.value = ''

        // Setup autocomplete
        this.setupTagAutocomplete()

        this.renderCurrentTags()
        this.renderAllTagSuggestions()

        document.getElementById('tagModal').style.display = 'flex'
        tagInput.focus()
    }

    hideTagModal() {
        document.getElementById('tagModal').style.display = 'none'
        document.getElementById('tagInput').value = ''
        this.app.currentVideo = null
        this.currentVideoTags = []

        // Restore Duplicates Review View if it was hidden
        this.app.restoreDuplicatesReviewIfNeeded()
    }

    // ============ Autocomplete ============

    setupTagAutocomplete() {
        const tagInput = document.getElementById('tagInput')

        // Remove existing event listeners
        tagInput.replaceWith(tagInput.cloneNode(true))
        const newTagInput = document.getElementById('tagInput')

        // Create autocomplete dropdown
        if (!document.getElementById('tagAutocomplete')) {
            const autocompleteDiv = document.createElement('div')
            autocompleteDiv.id = 'tagAutocomplete'
            autocompleteDiv.className = 'tag-autocomplete'
            autocompleteDiv.style.display = 'none'
            newTagInput.parentNode.appendChild(autocompleteDiv)
        }

        // Input event for autocomplete and filtering
        newTagInput.addEventListener('input', (e) => {
            const query = e.target.value.trim()
            this.updateTagSuggestions(query)
            this.renderAllTagSuggestions(query)
        })

        // Keydown for navigation
        newTagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                this.addTag()
            } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                this.app.navigateSuggestions('down', 'tag')
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                this.app.navigateSuggestions('up', 'tag')
            } else if (e.key === 'Escape') {
                this.hideTagAutocomplete()
            }
        })

        // Focus to show suggestions
        newTagInput.addEventListener('focus', () => {
            const query = newTagInput.value.trim()
            this.updateTagSuggestions(query)
        })

        // Blur to hide suggestions
        newTagInput.addEventListener('blur', () => {
            setTimeout(() => this.hideTagAutocomplete(), 150)
        })
    }

    updateTagSuggestions(query = '') {
        const autocompleteDiv = document.getElementById('tagAutocomplete')

        if (!query) {
            // Show recent/popular tags (exclude configured prefixes)
            const recentTags = this.app.allTags.filter(tag =>
                !this.app.isExcludedTag(tag.name)
            ).slice(0, 8)
            this.renderTagSuggestions(recentTags, '')
            autocompleteDiv.style.display = recentTags.length > 0 ? 'block' : 'none'
            return
        }

        // Filter existing tags
        const filteredTags = this.app.allTags.filter(tag => {
            const isUserSearching = query && this.app.excludedTagPrefixes.some(
                prefix => query.toLowerCase().startsWith(prefix)
            )
            if (!isUserSearching && this.app.isExcludedTag(tag.name)) return false
            return tag.name.toLowerCase().includes(query.toLowerCase()) &&
                !this.currentVideoTags.some(currentTag => currentTag.id === tag.id)
        })

        // Sort by relevance
        filteredTags.sort((a, b) => {
            const queryLower = query.toLowerCase()
            const aName = a.name.toLowerCase()
            const bName = b.name.toLowerCase()

            if (aName === queryLower) return -1
            if (bName === queryLower) return 1
            if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1
            if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1
            return a.name.localeCompare(b.name)
        })

        this.renderTagSuggestions(filteredTags.slice(0, 6), query)
        autocompleteDiv.style.display = 'block'
    }

    renderTagSuggestions(tags, query) {
        const autocompleteDiv = document.getElementById('tagAutocomplete')
        autocompleteDiv.innerHTML = ''

        tags.forEach(tag => {
            const item = document.createElement('div')
            item.className = 'tag-suggestion'
            item.textContent = tag.name
            item.title = `Click to add "${tag.name}"`

            item.onclick = () => {
                this.selectTagSuggestion(tag.name)
            }

            autocompleteDiv.appendChild(item)
        })

        // Add "Create new tag" option
        if (query && !tags.some(tag => tag.name.toLowerCase() === query.toLowerCase())) {
            const createItem = document.createElement('div')
            createItem.className = 'tag-suggestion new-tag'
            createItem.innerHTML = `+ Create "${query}"`
            createItem.title = `Create and add new tag "${query}"`

            createItem.onclick = () => {
                this.selectTagSuggestion(query)
            }

            autocompleteDiv.appendChild(createItem)
        }
    }

    selectTagSuggestion(tagName) {
        const tagInput = document.getElementById('tagInput')
        tagInput.value = tagName
        this.hideTagAutocomplete()
        this.addTag()
    }

    hideTagAutocomplete() {
        const autocompleteDiv = document.getElementById('tagAutocomplete')
        if (autocompleteDiv) {
            autocompleteDiv.style.display = 'none'
        }
    }

    // ============ Render Methods ============

    renderCurrentTags() {
        const tagsList = document.getElementById('currentTagsList')
        tagsList.innerHTML = ''

        if (this.currentVideoTags.length === 0) {
            tagsList.innerHTML = '<p style="color: #9ca3af; font-size: 13px;">No tags yet</p>'
            return
        }

        this.currentVideoTags.forEach(tag => {
            const tagElement = document.createElement('div')
            tagElement.className = 'tag-removable'
            tagElement.innerHTML = `
                ${tag.name}
                <button class="tag-remove" onclick="app.tagModule.removeTag(${tag.id})">&times;</button>
            `
            tagsList.appendChild(tagElement)
        })
    }

    renderAllTagSuggestions(filterQuery = '') {
        const suggestionsGrid = document.getElementById('tagSuggestionsGrid')
        if (!suggestionsGrid) return

        suggestionsGrid.innerHTML = ''

        // Get intelligent suggestions
        const suggestedTags = this.app.getIntelligentTagSuggestions(filterQuery)

        // Check which tags are already added
        const currentTagIds = this.currentVideoTags.map(t => t.id)

        if (suggestedTags.length === 0) {
            suggestionsGrid.innerHTML = '<p style="color: #9ca3af; font-size: 13px; grid-column: 1/-1; text-align: center;">No tag suggestions available</p>'
            return
        }

        suggestedTags.forEach(tag => {
            const isAlreadyAdded = currentTagIds.includes(tag.id)
            const tagElement = document.createElement('div')
            tagElement.className = `tag-suggestion-item ${isAlreadyAdded ? 'already-added' : ''}`
            tagElement.textContent = tag.name

            // Add reason badge if not searching
            if (!filterQuery && tag.reason) {
                const badge = document.createElement('span')
                badge.className = 'tag-reason-badge'
                badge.textContent = tag.reason
                tagElement.appendChild(badge)
            }

            tagElement.title = isAlreadyAdded ? 'Click to remove' : `Click to add "${tag.name}"`
            tagElement.style.cursor = 'pointer'

            tagElement.onclick = () => {
                if (isAlreadyAdded) {
                    this.removeTag(tag.id)
                } else {
                    this.addTagFromSuggestion(tag)
                }
            }

            suggestionsGrid.appendChild(tagElement)
        })
    }

    // ============ Add/Remove Actions ============

    async addTagFromSuggestion(tag) {
        if (!this.app.currentVideo) return

        try {
            // Use unified API client to add tag
            const result = await this.api.addTagToVideo(this.app.currentVideo.id, tag.name);

            if (result) {
                const tagData = result.tag;

                // Add to current video tags
                if (!this.currentVideoTags.find(t => t.id === result.tag.id)) {
                    this.currentVideoTags.push(result.tag)
                }

                // Track usage
                this.app.trackTagUsage(result.tag.name)

                // Re-render
                this.renderCurrentTags()
                this.renderAllTagSuggestions()

                // Update video in lists
                this.updateVideoTagsInLists(this.app.currentVideo.id, result.tag, 'add')

                // Update video card
                this.updateVideoCardTags(this.app.currentVideo.id)
            } else {
                console.log('Failed to add tag')
            }
        } catch (error) {
            console.error('Error adding tag from suggestion:', error)
            console.log('Error adding tag')
        }
    }

    async addTag() {
        const tagInput = document.getElementById('tagInput')
        const tagName = tagInput.value.trim()

        if (!tagName || !this.app.currentVideo) return

        try {
            // Use unified API client to add tag
            const result = await this.api.addTagToVideo(this.app.currentVideo.id, tagName);

            if (result) {
                const tagData = result.tag;

                // Add to current video tags
                if (!this.currentVideoTags.find(tag => tag.id === result.tag.id)) {
                    this.currentVideoTags.push(result.tag)
                }

                // Track usage
                this.app.trackTagUsage(result.tag.name)

                this.renderCurrentTags()

                // Update video in lists
                this.updateVideoTagsInLists(this.app.currentVideo.id, result.tag, 'add')

                // Update video card
                this.updateVideoCardTags(this.app.currentVideo.id)

                // Refresh tag list if new tag
                if (!this.app.allTags.find(t => t.name === result.tag.name)) {
                    await this.app.loadAllTags()
                }

                // Re-render suggestions
                this.renderAllTagSuggestions()

                tagInput.value = ''
            } else {
                console.log('Failed to add tag')
            }
        } catch (error) {
            console.log('Error adding tag')
        }
    }

    async removeTag(tagId) {
        if (!this.app.currentVideo) return

        try {
            // Use unified API client to remove tag
            const result = await this.api.removeTagFromVideo(this.app.currentVideo.id, tagId);

            if (result) {
                // Remove from current tags
                this.currentVideoTags = this.currentVideoTags.filter(tag => tag.id !== tagId)
                this.renderCurrentTags()

                // Update video in lists
                this.updateVideoTagsInLists(this.app.currentVideo.id, { id: tagId }, 'remove')

                // Update video card
                this.updateVideoCardTags(this.app.currentVideo.id)

                // Re-render suggestions
                this.renderAllTagSuggestions()
                this.renderMobileSuggestedTags()
            } else {
                console.log('Failed to remove tag')
            }
        } catch (error) {
            console.log('Error removing tag')
        }
    }

    // ============ Mobile Tag Modal ============

    async showMobileTagModal(videoId, videoName) {
        this.app.currentVideo = { id: videoId, name: videoName }

        // Load current tags
        const video = this.app.allVideos.find(v => v.id === videoId) ||
            this.app.videos.find(v => v.id === videoId)
        this.currentVideoTags = video ? video.tags || [] : []

        // Setup and render
        this.setupMobileTagModal()
        this.renderMobileCurrentTags()
        this.renderMobileSuggestedTags()

        document.getElementById('mobileTagModal').style.display = 'flex'
    }

    setupMobileTagModal() {
        const mobileTagModal = document.getElementById('mobileTagModal')
        mobileTagModal.onclick = (e) => {
            if (e.target === mobileTagModal) {
                this.hideMobileTagModal()
            }
        }
    }

    hideMobileTagModal() {
        document.getElementById('mobileTagModal').style.display = 'none'
        this.app.currentVideo = null
        this.currentVideoTags = []
    }

    toggleMobileTag(tagId) {
        const isAlreadyAdded = this.currentVideoTags.some(t => t.id == tagId)

        if (isAlreadyAdded) {
            this.removeTag(tagId)
        } else {
            if (!this.app.currentVideo) return

            const tag = this.app.allTags.find(t => t.id == tagId)
            if (!tag) return

            this.api.addTagToVideo(this.app.currentVideo.id, tag.name)
                .then(result => {
                    this.currentVideoTags.push(result.tag)

                    // Update video in lists
                    this.updateVideoTagsInLists(this.app.currentVideo.id, result.tag, 'add')

                    // Re-render
                    this.renderMobileCurrentTags()
                    this.renderMobileSuggestedTags()
                    console.log(`Tag "${tag.name}" added`)
                })
                .catch(error => {
                    console.error('Error adding tag:', error)
                })
        }
    }

    removeMobileTag(tagId) {
        const index = this.currentVideoTags.findIndex(t => t.id === tagId)
        if (index !== -1) {
            this.currentVideoTags.splice(index, 1)
            this.removeTag(tagId)
            this.renderMobileCurrentTags()
            this.renderMobileSuggestedTags()
        }
    }

    renderMobileCurrentTags() {
        const currentTagsList = document.getElementById('mobileCurrentTagsList')
        if (!currentTagsList) return

        currentTagsList.innerHTML = ''

        if (this.currentVideoTags.length === 0) {
            currentTagsList.innerHTML = '<div style="color: #9ca3af; font-size: 13px;">No tags yet</div>'
            return
        }

        this.currentVideoTags.forEach(tag => {
            const pill = document.createElement('div')
            pill.className = 'mobile-tag-pill'
            pill.innerHTML = `
                ${tag.name}
                <button class="mobile-tag-pill-remove" onclick="app.tagModule.removeMobileTag(${tag.id})">×</button>
            `
            currentTagsList.appendChild(pill)
        })
    }

    renderMobileSuggestedTags(filterQuery = '') {
        const suggestionsGrid = document.getElementById('mobileSuggestedTagsList')
        if (!suggestionsGrid) return

        suggestionsGrid.innerHTML = ''

        // Get all tags sorted alphabetically
        const allAvailableTags = (this.app.allTags || []).sort((a, b) =>
            a.name.localeCompare(b.name)
        )

        const currentTagIds = this.currentVideoTags.map(t => t.id)

        if (allAvailableTags.length === 0) {
            suggestionsGrid.innerHTML = '<div class="mobile-tag-empty-message">No tags available</div>'
            return
        }

        allAvailableTags.forEach(tag => {
            const isAdded = currentTagIds.includes(tag.id)
            const tagBtn = document.createElement('button')
            tagBtn.className = 'mobile-tag-suggestion' + (isAdded ? ' added' : '')
            tagBtn.textContent = tag.name
            tagBtn.onclick = () => {
                this.toggleMobileTag(tag.id)
            }
            suggestionsGrid.appendChild(tagBtn)
        })
    }

    // ============ DOM Update Methods ============

    updateVideoTagsInLists(videoId, tag, action) {
        // Update in videos list
        const video = this.app.videos.find(v => v.id === videoId)
        if (video) {
            if (!video.tags) video.tags = []
            if (action === 'add') {
                if (!video.tags.find(t => t.id === tag.id)) {
                    video.tags.push(tag)
                }
            } else if (action === 'remove') {
                video.tags = video.tags.filter(t => t.id !== tag.id)
            }
        }

        // Update in allVideos
        const allVideo = this.app.allVideos.find(v => v.id === videoId)
        if (allVideo) {
            if (!allVideo.tags) allVideo.tags = []
            if (action === 'add') {
                if (!allVideo.tags.find(t => t.id === tag.id)) {
                    allVideo.tags.push(tag)
                }
            } else if (action === 'remove') {
                allVideo.tags = allVideo.tags.filter(t => t.id !== tag.id)
            }
        }
    }

    updateVideoCardTags(videoId) {
        const videoCard = document.querySelector(`[data-video-id="${videoId}"]`)
        if (!videoCard) {
            console.warn(`Video card not found for video ID ${videoId}`)
            return
        }

        let video = this.app.videos.find(v => v.id === videoId)
        if (!video) {
            video = this.app.allVideos.find(v => v.id === videoId)
        }

        if (!video) {
            console.warn(`Video data not found for video ID ${videoId}`)
            return
        }

        const tagsContainer = videoCard.querySelector('.video-tags')
        if (!tagsContainer) {
            console.warn(`Tags container not found in video card ${videoId}`)
            return
        }

        tagsContainer.innerHTML = ''

        if (video.tags && video.tags.length > 0) {
            video.tags.forEach(tag => {
                const tagSpan = document.createElement('span')
                tagSpan.className = 'tag clickable-tag'
                tagSpan.style.backgroundColor = tag.color || '#3b82f6'
                tagSpan.textContent = tag.name
                tagSpan.onclick = (e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    this.app.filterByTag(tag.name)
                }
                tagsContainer.appendChild(tagSpan)
            })
        }
    }

    // ============ Quick Tag Methods ============

    async addPerfectTag(videoId, videoName) {
        return this.addQuickTag(videoId, videoName, 'perfect')
    }

    async addJunkTag(videoId, videoName) {
        return this.addQuickTag(videoId, videoName, 'junk')
    }

    async addQuickTag(videoId, videoName, tagName) {
        try {
            // Use unified API client for quick tag
            const result = await this.api.addTagToVideo(videoId, tagName);

            if (result) {
                const tagData = result.tag;

                // Update currentVideoInPlayer
                if (this.app.currentVideoInPlayer && this.app.currentVideoInPlayer.id === videoId) {
                    if (!this.app.currentVideoInPlayer.tags) this.app.currentVideoInPlayer.tags = []
                    if (!this.app.currentVideoInPlayer.tags.find(tag => tag.id === result.tag.id)) {
                        this.app.currentVideoInPlayer.tags.push(result.tag)
                    }
                }

                // Update in lists
                this.updateVideoTagsInLists(videoId, result.tag, 'add')

                // Update video card
                this.updateVideoCardTags(videoId)

                console.log(`Added "${tagName}" tag to ${videoName}`)
            } else {
                console.log(`Failed to add "${tagName}" tag`)
            }
        } catch (error) {
            console.log(`Error adding "${tagName}" tag:`, error)
        }
    }

    setupEventListeners() {
        // Tag modal close
        const closeTagBtn = document.getElementById('closeTagModal');
        if (closeTagBtn) {
            closeTagBtn.onclick = () => this.hideTagModal();
        }

        // Add tag button
        const addTagBtn = document.getElementById('addTagBtn');
        if (addTagBtn) {
            addTagBtn.onclick = () => this.addTag();
        }

        // Tag input enter key
        const tagInput = document.getElementById('tagInput');
        if (tagInput) {
            tagInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.addTag();
            });
        }
    }
}

// Export as global
window.TagManagementModule = TagManagementModule
