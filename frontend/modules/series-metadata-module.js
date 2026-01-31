/**
 * SeriesMetadataModule - Handles series/season/episode metadata and series view
 *
 * Manages:
 * - Series modal for editing series/season/episode info
 * - Series view rendering (hierarchical series > seasons > episodes)
 * - Filter population for series, year, channel
 * - Rating stars visual display
 * - Expand/collapse functionality for series and seasons
 *
 * Usage:
 *   const seriesModule = new SeriesMetadataModule(app);
 *   seriesModule.showSeriesModalFromContext();
 */

class SeriesMetadataModule {
    constructor(app) {
        this.app = app;
        this.currentVideo = null; // Currently edited video in series modal
    }

    // ============================================================================
    // SERIES MODAL - Edit series/season/episode info
    // ============================================================================

    /**
     * Show series modal from context menu
     * Populates form with current video's series information
     */
    showSeriesModalFromContext() {
        const videoId = this.app.contextMenuVideoId;
        const videoName = this.app.contextMenuVideoName;

        if (!videoId) {
            console.error('No video ID for series modal');
            return;
        }

        // Find the video to get current series info
        const video = this.app.videos.find(v => v.id === videoId) ||
                     this.app.allVideos.find(v => v.id === videoId);

        // Store current video
        this.currentVideo = { id: videoId, name: videoName };

        // Populate form with current values
        document.getElementById('seriesName').value = video?.series || '';
        document.getElementById('seriesSeason').value = video?.season || '';
        document.getElementById('seriesEpisode').value = video?.episode || '';

        // Show modal
        document.getElementById('seriesModal').style.display = 'flex';
        document.getElementById('seriesName').focus();

        // Hide context menu
        this.app.hideVideoContextMenu();
    }

    /**
     * Hide series modal and clear form
     */
    hideSeriesModal() {
        document.getElementById('seriesModal').style.display = 'none';
        document.getElementById('seriesName').value = '';
        document.getElementById('seriesSeason').value = '';
        document.getElementById('seriesEpisode').value = '';
        this.currentVideo = null;
    }

    /**
     * Save series information for current video
     */
    async saveSeriesInfo() {
        if (!this.currentVideo) return;

        const series = document.getElementById('seriesName').value.trim();
        const season = document.getElementById('seriesSeason').value;
        const episode = document.getElementById('seriesEpisode').value.trim();

        try {
            const response = await fetch(`${this.app.apiBase}/videos/${this.currentVideo.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    series: series || null,
                    season: season ? parseInt(season) : null,
                    episode: episode || null
                })
            });

            if (!response.ok) throw new Error('Failed to update series info');

            // Update local video data
            const video = this.app.videos.find(v => v.id === this.currentVideo.id) ||
                this.app.allVideos.find(v => v.id === this.currentVideo.id);

            if (video) {
                video.series = series || null;
                video.season = season ? parseInt(season) : null;
                video.episode = episode || null;
            }

            this.hideSeriesModal();

            // Refresh video card display
            this.app.renderVideoGrid();

        } catch (error) {
            console.error('Error updating series info:', error);
            console.log('Failed to update series info');
        }
    }

    /**
     * Clear all series information for current video
     */
    async clearSeriesInfo() {
        if (!this.currentVideo) return;

        if (!confirm('Clear all series information for this video?')) return;

        try {
            const response = await fetch(`${this.app.apiBase}/videos/${this.currentVideo.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    series: null,
                    season: null,
                    episode: null
                })
            });

            if (!response.ok) throw new Error('Failed to clear series info');

            // Update local video data
            const video = this.app.videos.find(v => v.id === this.currentVideo.id) ||
                this.app.allVideos.find(v => v.id === this.currentVideo.id);

            if (video) {
                video.series = null;
                video.season = null;
                video.episode = null;
            }

            this.hideSeriesModal();

            // Refresh video card display
            this.app.renderVideoGrid();

        } catch (error) {
            console.error('Error clearing series info:', error);
            console.log('Failed to clear series info');
        }
    }

    // ============================================================================
    // SERIES VIEW RENDERING - Hierarchical series > seasons > episodes
    // ============================================================================

    /**
     * Render series view with hierarchical organization
     * Groups videos by series > season > episode
     */
    async renderSeriesView() {
        console.log('📺 Rendering Series View');

        // Load all videos if not already loaded
        if (!this.app.allVideos || this.app.allVideos.length === 0) {
            await this.app.loadAllVideosFlat();
        }

        const seriesContainer = document.getElementById('seriesView');
        if (!seriesContainer) {
            console.error('❌ Series view container not found');
            return;
        }

        // Filter videos that have series metadata
        const videosWithSeries = this.app.allVideos.filter(v => v.series);

        if (videosWithSeries.length === 0) {
            seriesContainer.innerHTML = `
                <div class="series-empty-state">
                    <p>No series found in your collection</p>
                    <p class="series-empty-hint">Videos need series metadata to appear here.</p>
                    <p class="series-empty-hint">Use "📝 Parse Metadata" from the Actions menu or edit videos manually.</p>
                </div>
            `;
            return;
        }

        // Group videos by series
        const seriesMap = new Map();

        videosWithSeries.forEach(video => {
            const seriesName = video.series;
            if (!seriesMap.has(seriesName)) {
                seriesMap.set(seriesName, {
                    name: seriesName,
                    year: video.year,
                    channel: video.channel,
                    seasons: new Map()
                });
            }

            const series = seriesMap.get(seriesName);

            // Update year and channel if not set (use earliest year, most common channel)
            if (!series.year && video.year) {
                series.year = video.year;
            }
            if (!series.channel && video.channel) {
                series.channel = video.channel;
            }

            // Group by season (use 0 for videos without season)
            const seasonNum = video.season || 0;
            if (!series.seasons.has(seasonNum)) {
                series.seasons.set(seasonNum, []);
            }

            series.seasons.get(seasonNum).push(video);
        });

        // Sort series alphabetically
        const sortedSeries = Array.from(seriesMap.entries()).sort((a, b) =>
            a[0].localeCompare(b[0])
        );

        // Build HTML
        let html = '';

        sortedSeries.forEach(([seriesName, seriesData]) => {
            // Calculate total episodes across all seasons
            let totalEpisodes = 0;
            seriesData.seasons.forEach(episodes => {
                totalEpisodes += episodes.length;
            });

            // Series header
            const seriesYearRange = seriesData.year ? `(${seriesData.year})` : '';
            const seriesChannel = seriesData.channel ? `• ${seriesData.channel}` : '';
            const seasonCount = seriesData.seasons.size;

            html += `
                <div class="series-group" data-series="${this.app.escapeHtml(seriesName)}">
                    <div class="series-header">
                        <div class="series-header-info">
                            <h2 class="series-title">
                                📺 ${this.app.escapeHtml(seriesName)} ${seriesYearRange}
                            </h2>
                            <div class="series-meta">
                                <span class="series-meta-item">
                                    🎬 ${seasonCount} season${seasonCount !== 1 ? 's' : ''}
                                </span>
                                <span class="series-meta-item">
                                    📹 ${totalEpisodes} episode${totalEpisodes !== 1 ? 's' : ''}
                                </span>
                                ${seriesChannel ? `<span class="series-meta-item">${this.app.escapeHtml(seriesData.channel)}</span>` : ''}
                            </div>
                        </div>
                        <span class="series-expand-icon">▼</span>
                    </div>
                    <div class="series-seasons">
            `;

            // Sort seasons
            const sortedSeasons = Array.from(seriesData.seasons.entries()).sort((a, b) => a[0] - b[0]);

            sortedSeasons.forEach(([seasonNum, episodes]) => {
                // Sort episodes by episode number
                const sortedEpisodes = episodes.sort((a, b) => {
                    // Extract numeric part from episode string (e.g., "E01" -> 1)
                    const aNum = a.episode ? parseInt(a.episode.replace(/\D/g, '')) : 0;
                    const bNum = b.episode ? parseInt(b.episode.replace(/\D/g, '')) : 0;
                    return aNum - bNum;
                });

                const seasonTitle = seasonNum === 0 ? 'No Season' : `Season ${seasonNum}`;

                html += `
                    <div class="season-group" data-season="${seasonNum}">
                        <div class="season-header">
                            <div class="season-header-info">
                                <h3 class="season-title">${seasonTitle}</h3>
                                <span class="season-meta">${sortedEpisodes.length} episode${sortedEpisodes.length !== 1 ? 's' : ''}</span>
                            </div>
                            <span class="season-expand-icon">▼</span>
                        </div>
                        <div class="season-episodes">
                `;

                // Add episode cards (reuse video card creation)
                sortedEpisodes.forEach(video => {
                    html += this.createVideoCardHTML(video);
                });

                html += `
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        seriesContainer.innerHTML = html;

        // Add event listeners for expand/collapse
        this.attachSeriesEventListeners();
    }

    /**
     * Attach event listeners for series view interactions
     */
    attachSeriesEventListeners() {
        // Series expand/collapse
        document.querySelectorAll('.series-header').forEach(header => {
            header.addEventListener('click', () => {
                const seriesGroup = header.closest('.series-group');
                seriesGroup.classList.toggle('expanded');
            });
        });

        // Season expand/collapse
        document.querySelectorAll('.season-header').forEach(header => {
            header.addEventListener('click', () => {
                const seasonGroup = header.closest('.season-group');
                seasonGroup.classList.toggle('expanded');
            });
        });

        // Attach lazy loading observers to video card images
        document.querySelectorAll('.season-episodes .lazy-image').forEach(img => {
            if (this.app.imageObserver) {
                this.app.imageObserver.observe(img);
            }
        });

        // Drag and drop support for video cards
        document.querySelectorAll('.season-episodes .video-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                const videoId = card.getAttribute('data-video-id');
                e.dataTransfer.setData('text/x-clipper-video-id', videoId);
                e.dataTransfer.effectAllowed = 'move';
            });
        });
    }

    /**
     * Create HTML string for video card (for series view)
     */
    createVideoCardHTML(video) {
        // Reuse existing video card creation logic
        const card = this.app.createVideoCard(video);
        return card.outerHTML;
    }

    // ============================================================================
    // FILTER POPULATION - Series, Year, Channel dropdowns
    // ============================================================================

    /**
     * Populate series filter dropdown with unique series names
     */
    populateSeriesFilter() {
        const seriesFilter = document.getElementById('seriesFilter');
        if (!seriesFilter) return;

        seriesFilter.innerHTML = '<option value="">All Series</option>';

        // Extract unique series names from all videos (excluding null/undefined)
        const seriesSet = new Set();
        let hasUnknown = false;

        this.app.allVideos.forEach(video => {
            if (video.series) {
                seriesSet.add(video.series);
            } else {
                hasUnknown = true;
            }
        });

        // Add "Unknown" option if there are videos with no series
        if (hasUnknown) {
            const unknownOption = document.createElement('option');
            unknownOption.value = '__unknown__';
            unknownOption.textContent = '(Unknown)';
            seriesFilter.appendChild(unknownOption);
        }

        // Convert to array and sort alphabetically
        const seriesList = Array.from(seriesSet).sort((a, b) => a.localeCompare(b));

        // Create options
        seriesList.forEach(series => {
            const option = document.createElement('option');
            option.value = series;
            option.textContent = series;
            seriesFilter.appendChild(option);
        });

        // Restore saved series filter
        if (this.app.currentSeriesFilter) {
            seriesFilter.value = this.app.currentSeriesFilter;
        }
    }

    /**
     * Populate year filter dropdown with unique years
     */
    populateYearFilter() {
        const yearFilter = document.getElementById('yearFilter');
        if (!yearFilter) return;

        yearFilter.innerHTML = '<option value="">All Years</option>';

        // Extract unique years from all videos (excluding null/undefined)
        const yearSet = new Set();
        this.app.allVideos.forEach(video => {
            if (video.year) {
                yearSet.add(video.year);
            }
        });

        // Convert to array and sort in descending order (newest first)
        const yearList = Array.from(yearSet).sort((a, b) => b - a);

        // Create options
        yearList.forEach(year => {
            const option = document.createElement('option');
            option.value = year;
            option.textContent = year;
            yearFilter.appendChild(option);
        });

        // Restore saved year filter
        if (this.app.currentYearFilter) {
            yearFilter.value = this.app.currentYearFilter;
        }
    }

    /**
     * Populate channel filter dropdown with unique channels
     */
    populateChannelFilter() {
        const channelFilter = document.getElementById('channelFilter');
        if (!channelFilter) return;

        channelFilter.innerHTML = '<option value="">All Channels</option>';

        // Extract unique channels from all videos (excluding null/undefined)
        const channelSet = new Set();
        let hasUnknown = false;

        this.app.allVideos.forEach(video => {
            if (video.channel) {
                channelSet.add(video.channel);
            } else {
                hasUnknown = true;
            }
        });

        // Add "Unknown" option if there are videos with no channel
        if (hasUnknown) {
            const unknownOption = document.createElement('option');
            unknownOption.value = '__unknown__';
            unknownOption.textContent = '(Unknown)';
            channelFilter.appendChild(unknownOption);
        }

        // Convert to array and sort alphabetically
        const channelList = Array.from(channelSet).sort((a, b) => a.localeCompare(b));

        // Create options
        channelList.forEach(channel => {
            const option = document.createElement('option');
            option.value = channel;
            option.textContent = channel;
            channelFilter.appendChild(option);
        });

        // Restore saved channel filter
        if (this.app.currentChannelFilter) {
            channelFilter.value = this.app.currentChannelFilter;
        }
    }

    // ============================================================================
    // RATING STARS - Visual display helper
    // ============================================================================

    /**
     * Update visual star display based on rating (0-5)
     * @param {number} rating - Rating value from 0 to 5
     */
    updateRatingStars(rating) {
        const starsElement = document.getElementById('ratingStars');
        if (!starsElement) return;

        const fullStars = Math.floor(rating);
        const hasHalfStar = (rating % 1) >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

        let starsHtml = '';
        // Full stars
        for (let i = 0; i < fullStars; i++) {
            starsHtml += '★';
        }
        // Half star
        if (hasHalfStar) {
            starsHtml += '⯨';  // Half star character
        }
        // Empty stars
        for (let i = 0; i < emptyStars; i++) {
            starsHtml += '☆';
        }

        starsElement.textContent = starsHtml;
    }
}

// Export as global for use in app.js
window.SeriesMetadataModule = SeriesMetadataModule;
