/**
 * ActorManagementModule - Actor modal and management functionality
 * Handles actor autocomplete, add/remove actors from videos
 */
class ActorManagementModule {
    constructor(app) {
        this.app = app
        this.api = app.api

        // Modal state
        this.currentVideoActors = [] // Actors for currently open modal
    }

    // ============ Actor Modal ============

    async showActorModal(videoId, videoName) {
        this.app.currentVideo = { id: videoId, name: videoName }

        // Hide Duplicates Review View if active
        this.app.hideDuplicatesReviewIfActive()

        // Load current actors for this video
        const video = this.app.allVideos.find(v => v.id === videoId) ||
            this.app.videos.find(v => v.id === videoId)
        this.currentVideoActors = video ? video.actors || [] : []

        // Clear previous input
        const actorInput = document.getElementById('actorInput')
        actorInput.value = ''

        // Setup autocomplete for actor input
        this.setupActorAutocomplete()

        this.renderCurrentActors()
        this.renderAllActorSuggestions()

        document.getElementById('actorModal').style.display = 'flex'
        actorInput.focus()
    }

    hideActorModal() {
        document.getElementById('actorModal').style.display = 'none'
        document.getElementById('actorInput').value = ''
        this.app.currentVideo = null
        this.currentVideoActors = []

        // Restore Duplicates Review View if it was hidden
        this.app.restoreDuplicatesReviewIfNeeded()
    }

    // ============ Autocomplete ============

    setupActorAutocomplete() {
        const actorInput = document.getElementById('actorInput')

        // Remove existing event listeners to prevent duplicates
        actorInput.replaceWith(actorInput.cloneNode(true))
        const newActorInput = document.getElementById('actorInput')

        // Create autocomplete dropdown
        if (!document.getElementById('actorAutocomplete')) {
            const autocompleteDiv = document.createElement('div')
            autocompleteDiv.id = 'actorAutocomplete'
            autocompleteDiv.className = 'tag-autocomplete' // Reuse tag autocomplete styling
            autocompleteDiv.style.display = 'none'
            newActorInput.parentNode.appendChild(autocompleteDiv)
        }

        // Add input event listener for autocomplete and filtering
        newActorInput.addEventListener('input', (e) => {
            const query = e.target.value.trim()
            this.updateActorSuggestions(query)
            // Also filter the suggestions grid
            this.renderAllActorSuggestions(query)
        })

        // Add keydown event listener for navigation
        newActorInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                this.addActor()
            } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                this.app.navigateSuggestions('down', 'actor')
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                this.app.navigateSuggestions('up', 'actor')
            } else if (e.key === 'Escape') {
                this.hideActorAutocomplete()
            }
        })

        // Add focus event to show suggestions
        newActorInput.addEventListener('focus', () => {
            const query = newActorInput.value.trim()
            this.updateActorSuggestions(query)
        })

        // Add blur event to hide suggestions (with delay)
        newActorInput.addEventListener('blur', () => {
            setTimeout(() => this.hideActorAutocomplete(), 150)
        })

        // Add click handler for add button
        const addActorBtn = document.getElementById('addActorBtn')
        if (addActorBtn) {
            addActorBtn.onclick = () => this.addActor()
        }
    }

    updateActorSuggestions(query = '') {
        const autocompleteDiv = document.getElementById('actorAutocomplete')

        if (!query) {
            // Show recent actors
            const recentActors = this.app.allActors.slice(0, 8)
            this.renderActorSuggestions(recentActors, '')
            autocompleteDiv.style.display = recentActors.length > 0 ? 'block' : 'none'
            return
        }

        // Filter existing actors (case-insensitive)
        const filteredActors = this.app.allActors.filter(actor =>
            actor.name.toLowerCase().includes(query.toLowerCase()) &&
            !this.currentVideoActors.some(currentActor => currentActor.id === actor.id)
        )

        // Sort by relevance
        filteredActors.sort((a, b) => {
            const queryLower = query.toLowerCase()
            const aName = a.name.toLowerCase()
            const bName = b.name.toLowerCase()

            if (aName === queryLower) return -1
            if (bName === queryLower) return 1
            if (aName.startsWith(queryLower) && !bName.startsWith(queryLower)) return -1
            if (bName.startsWith(queryLower) && !aName.startsWith(queryLower)) return 1
            return a.name.localeCompare(b.name)
        })

        this.renderActorSuggestions(filteredActors.slice(0, 6), query)
        autocompleteDiv.style.display = 'block'
    }

    renderActorSuggestions(actors, query) {
        const autocompleteDiv = document.getElementById('actorAutocomplete')
        autocompleteDiv.innerHTML = ''

        // Add existing actors
        actors.forEach(actor => {
            const item = document.createElement('div')
            item.className = 'tag-suggestion' // Reuse tag suggestion styling
            item.textContent = actor.name
            item.title = `Click to add "${actor.name}"`

            item.onclick = () => {
                this.selectActorSuggestion(actor.name)
            }

            autocompleteDiv.appendChild(item)
        })

        // Add "Create new actor" option if query doesn't match existing
        if (query && !actors.some(actor => actor.name.toLowerCase() === query.toLowerCase())) {
            const createItem = document.createElement('div')
            createItem.className = 'tag-suggestion new-tag' // Reuse new-tag styling
            createItem.innerHTML = `+ Create "${this.toTitleCase(query)}"`
            createItem.title = `Create and add new actor "${this.toTitleCase(query)}"`

            createItem.onclick = () => {
                this.selectActorSuggestion(query)
            }

            autocompleteDiv.appendChild(createItem)
        }
    }

    selectActorSuggestion(actorName) {
        const actorInput = document.getElementById('actorInput')
        actorInput.value = actorName
        this.hideActorAutocomplete()
        this.addActor()
    }

    hideActorAutocomplete() {
        const autocompleteDiv = document.getElementById('actorAutocomplete')
        if (autocompleteDiv) {
            autocompleteDiv.style.display = 'none'
        }
    }

    // ============ Render Methods ============

    renderCurrentActors() {
        const actorsList = document.getElementById('currentActorsList')
        actorsList.innerHTML = ''

        if (this.currentVideoActors.length === 0) {
            actorsList.innerHTML = '<p style="color: #9ca3af; font-size: 13px;">No actors yet</p>'
            return
        }

        this.currentVideoActors.forEach(actor => {
            const actorElement = document.createElement('div')
            actorElement.className = 'tag-removable' // Reuse tag-removable styling
            actorElement.innerHTML = `
                ${actor.name}
                <button class="tag-remove" onclick="app.actorModule.removeActor(${actor.id})">&times;</button>
            `
            actorsList.appendChild(actorElement)
        })
    }

    renderAllActorSuggestions(filterQuery = '') {
        const suggestionsGrid = document.getElementById('actorSuggestionsGrid')
        if (!suggestionsGrid) return

        suggestionsGrid.innerHTML = ''

        // Filter actors if query provided
        let displayActors = this.app.allActors
        if (filterQuery) {
            displayActors = this.app.allActors.filter(actor =>
                actor.name.toLowerCase().includes(filterQuery.toLowerCase())
            )
        }

        // Check which actors are already added to current video
        const currentActorIds = this.currentVideoActors.map(a => a.id)

        if (displayActors.length === 0) {
            suggestionsGrid.innerHTML = '<p style="color: #9ca3af; font-size: 13px; grid-column: 1/-1; text-align: center;">No actor suggestions available</p>'
            return
        }

        displayActors.forEach(actor => {
            const isAlreadyAdded = currentActorIds.includes(actor.id)
            const actorElement = document.createElement('div')
            actorElement.className = `tag-suggestion-item ${isAlreadyAdded ? 'already-added' : ''}` // Reuse tag styling
            actorElement.textContent = actor.name

            actorElement.title = isAlreadyAdded ? 'Already added' : `Click to add "${actor.name}"`

            if (!isAlreadyAdded) {
                actorElement.onclick = () => this.addActorFromSuggestion(actor)
            }

            suggestionsGrid.appendChild(actorElement)
        })
    }

    // ============ Add/Remove Actions ============

    async addActorFromSuggestion(actor) {
        if (!this.app.currentVideo) return

        try {
            // Use unified API client to add actor
            const result = await this.api.addActorToVideo(this.app.currentVideo.id, actor.name);

            if (result) {
                const actorData = result.actor;

                // Add to current video actors if not already there
                if (!this.currentVideoActors.find(a => a.id === result.actor.id)) {
                    this.currentVideoActors.push(result.actor)
                }

                // Re-render both sections
                this.renderCurrentActors()
                this.renderAllActorSuggestions()

                // Update the video in BOTH the displayed list AND the full list
                const video = this.app.videos.find(v => v.id === this.app.currentVideo.id)
                if (video) {
                    if (!video.actors) video.actors = []
                    if (!video.actors.find(a => a.id === result.actor.id)) {
                        video.actors.push(result.actor)
                    }
                }

                // Also update in allVideos for scrolled/lazy-loaded videos
                const allVideo = this.app.allVideos.find(v => v.id === this.app.currentVideo.id)
                if (allVideo) {
                    if (!allVideo.actors) allVideo.actors = []
                    if (!allVideo.actors.find(a => a.id === result.actor.id)) {
                        allVideo.actors.push(result.actor)
                    }
                }

                // Update the video card in the DOM directly (without full re-render)
                this.updateVideoCardActors(this.app.currentVideo.id)
            } else {
                console.log('Failed to add actor')
            }
        } catch (error) {
            console.error('Error adding actor from suggestion:', error)
            console.log('Error adding actor')
        }
    }

    async addActor() {
        const actorInput = document.getElementById('actorInput')
        const actorName = actorInput.value.trim()

        if (!actorName || !this.app.currentVideo) return

        try {
            // Use unified API client to add actor
            const result = await this.api.addActorToVideo(this.app.currentVideo.id, actorName);

            if (result) {
                const actorData = result.actor;

                // Check if actor already exists in current video actors before adding
                if (!this.currentVideoActors.find(actor => actor.id === result.actor.id)) {
                    this.currentVideoActors.push(result.actor)
                }

                this.renderCurrentActors()

                // Update the video in BOTH the displayed list AND the full list
                const video = this.app.videos.find(v => v.id === this.app.currentVideo.id)
                if (video) {
                    if (!video.actors) video.actors = []
                    // Check if actor already exists in video actors before adding
                    if (!video.actors.find(actor => actor.id === result.actor.id)) {
                        video.actors.push(result.actor)
                    }
                }

                // Also update in allVideos for scrolled/lazy-loaded videos
                const allVideo = this.app.allVideos.find(v => v.id === this.app.currentVideo.id)
                if (allVideo) {
                    if (!allVideo.actors) allVideo.actors = []
                    if (!allVideo.actors.find(actor => actor.id === result.actor.id)) {
                        allVideo.actors.push(result.actor)
                    }
                }

                // Update the video card in the DOM directly (without full re-render)
                this.updateVideoCardActors(this.app.currentVideo.id)

                // Refresh actor list if this is a new actor
                if (!this.app.allActors.find(a => a.name === result.actor.name)) {
                    await this.app.loadAllActors()
                }

                // Re-render suggestions to update "already-added" state
                this.renderAllActorSuggestions()

                actorInput.value = ''
            } else {
                const error = await response.json()
                console.log(error.detail || 'Failed to add actor')
            }
        } catch (error) {
            console.error('Error adding actor:', error)
            console.log('Error adding actor')
        }
    }

    async removeActor(actorId) {
        if (!this.app.currentVideo) return

        try {
            // Use unified API client to remove actor
            const result = await this.api.removeActorFromVideo(this.app.currentVideo.id, actorId);

            if (result) {
                // Remove actor from current video actors
                this.currentVideoActors = this.currentVideoActors.filter(actor => actor.id !== actorId)
                this.renderCurrentActors()

                // Update the video in BOTH the displayed list AND the full list
                const video = this.app.videos.find(v => v.id === this.app.currentVideo.id)
                if (video && video.actors) {
                    video.actors = video.actors.filter(actor => actor.id !== actorId)
                }

                // Also update in allVideos for scrolled/lazy-loaded videos
                const allVideo = this.app.allVideos.find(v => v.id === this.app.currentVideo.id)
                if (allVideo && allVideo.actors) {
                    allVideo.actors = allVideo.actors.filter(actor => actor.id !== actorId)
                }

                // Update the video card in the DOM directly (without full re-render)
                this.updateVideoCardActors(this.app.currentVideo.id)

                // Re-render suggestions to update "already-added" state
                this.renderAllActorSuggestions()
            } else {
                console.log('Failed to remove actor')
            }
        } catch (error) {
            console.error('Error removing actor:', error)
            console.log('Error removing actor')
        }
    }

    // ============ DOM Update Methods ============

    updateVideoCardActors(videoId) {
        // Find the video card in the DOM
        const videoCard = document.querySelector(`[data-video-id="${videoId}"]`)
        if (!videoCard) {
            console.warn(`Video card not found for video ID ${videoId}`)
            return
        }

        // Find the video data from either videos or allVideos
        let video = this.app.videos.find(v => v.id === videoId)
        if (!video) {
            video = this.app.allVideos.find(v => v.id === videoId)
        }

        if (!video) {
            console.warn(`Video data not found for video ID ${videoId}`)
            return
        }

        // Find the actors container in the card
        const actorsContainer = videoCard.querySelector('.video-actors')
        if (!actorsContainer) {
            console.warn(`Actors container not found in video card ${videoId}`)
            return
        }

        // Clear and re-render actors
        actorsContainer.innerHTML = ''

        if (video.actors && video.actors.length > 0) {
            video.actors.forEach(actor => {
                const actorSpan = document.createElement('span')
                actorSpan.className = 'actor clickable-actor'
                actorSpan.textContent = `${actor.name}`
                actorSpan.title = `Actor: ${actor.name}`
                actorSpan.onclick = (e) => {
                    e.stopPropagation()
                    e.preventDefault()
                    this.app.filterByActor(actor.name)
                }
                actorsContainer.appendChild(actorSpan)
            })
        }
    }

    // ============ Utility Methods ============

    toTitleCase(str) {
        return str.replace(/\w\S*/g, (txt) => {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
        })
    }

    setupEventListeners() {
        // Actor modal close
        const closeActorBtn = document.getElementById('closeActorModal');
        if (closeActorBtn) {
            closeActorBtn.onclick = () => this.hideActorModal();
        }

        // Add actor button (this is also handled in setupActorAutocomplete but good for consistency)
        const addActorBtn = document.getElementById('addActorBtn');
        if (addActorBtn) {
            addActorBtn.onclick = () => this.addActor();
        }
    }
}

// Export as global
window.ActorManagementModule = ActorManagementModule
