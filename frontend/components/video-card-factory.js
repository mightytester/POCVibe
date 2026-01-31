/**
 * VideoCardFactory - Creates DOM elements for video cards
 */
class VideoCardFactory {
    constructor(app) {
        this.app = app;
    }

    createVideoCard(video) {
        const card = document.createElement('div');
        card.className = video.is_final ? 'video-card final' : 'video-card';
        // Add 'image-card' class for square cards
        if (video.media_type === 'image') {
            card.classList.add('image-card');
        }
        // Add 'vertical-video' class if video has vertical aspect ratio (height > width)
        if (video.width && video.height && video.height > video.width) {
            card.classList.add('vertical-video');
        }
        card.setAttribute('data-video-id', video.id); // Add data attribute for DOM updates
        card.setAttribute('data-video-name', video.name); // Add data-video-name for file refresh lookup
        card.setAttribute('draggable', 'true');

        // Drag handler
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/x-clipper-video-id', video.id);
            e.dataTransfer.effectAllowed = 'move';
        });

        // Create compact tags HTML
        const tagsCompact = this.createTagsHtml(video);

        // Create compact actors HTML
        const actorsCompact = this.createActorsHtml(video);

        // Create faces HTML
        const facesHtml = this.createFacesHtml(video);

        // Display folder path information
        let folderDisplayName = video.category === '_root' ? '(Root)' : video.category;
        if (video.subcategory) {
            folderDisplayName += ` / ${video.subcategory}`;
        }

        // Format metadata
        const metadataLine = this.createMetadataLine(video);

        // Create channel badge
        const channelBadge = video.channel ?
            `<span class="video-channel-badge-grey">${this.escapeHtml(video.channel)}</span>` : '';

        // Combine metadata and tags in one row
        const metadataWithTags = (metadataLine || tagsCompact) ?
            `<div class="video-channel-row">
                <div class="video-channel-left">
                    ${metadataLine}
                </div>
                <div class="video-channel-right">
                    ${tagsCompact}
                </div>
            </div>` : '';

        // Thumbnail HTML
        const thumbnailHtml = this.createThumbnailHtml(video);

        // Store video data for click handler
        const videoData = JSON.stringify({
            id: video.id,
            name: video.name,
            category: video.category,
            subcategory: video.subcategory || '',
            relative_path: video.relative_path || video.name,
            path: video.path,
            extension: video.extension,
            media_type: video.media_type || 'video'
        }).replace(/"/g, '&quot;');

        const escapedName = video.name.replace(/'/g, "\\'");
        const isFavorite = video.favorite;

        card.innerHTML = `
            <div class="video-selection-checkbox">
                <input type="checkbox"
                       data-video-id="${video.id}"
                       onclick="event.stopPropagation(); app.toggleVideoSelection(${video.id})"
                       ${this.app.selectedVideos.has(video.id) ? 'checked' : ''} />
            </div>
            <div class="video-thumbnail" onclick="app.playVideoFromData('${videoData}')">
                ${thumbnailHtml}
                ${video._similarity !== undefined ? this.createSimilarityBadge(video._similarity, video._isOriginal) : ''}
                ${video.is_final ? '<div class="final-badge"><span>💎</span><span>FINAL</span></div>' : ''}
                ${video.media_type === 'image' ? `<div class="media-type-badge image-badge">${this.app.format.getImageExtension(video.name)}</div>` : '<div class="media-type-badge video-badge">Video</div>'}
                <div class="favorite-icon ${isFavorite ? 'is-favorite' : ''}"
                     onclick="event.stopPropagation(); app.toggleFavorite(${video.id}, ${!isFavorite})"
                     title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                    ${isFavorite ? '★' : '☆'}
                </div>
            </div>
            <div class="video-info">
                <div class="video-header">
                    <div class="video-title-row">
                        <h3 class="video-title" title="${video.display_name || video.name}">${video.display_name || video.name}</h3>
                        ${this.app.format.createEditedVideoBadge(video.name)}
                        <div class="video-title-faces">${facesHtml}</div>
                        ${channelBadge}
                    </div>
                </div>
                ${metadataWithTags}
                ${actorsCompact ? `<div class="video-actors-row"><div class="compact-actors">${actorsCompact}</div></div>` : ''}
                <div class="video-footer">
                    <div class="video-actions">
                        <button class="add-tag-btn" title="Add tag" onclick="event.stopPropagation(); event.preventDefault(); app.showTagModal(${video.id}, '${escapedName}')">🏷️</button>
                        <button class="scene-desc-btn" title="Add scene description" onclick="event.stopPropagation(); event.preventDefault(); app.showSceneDescriptionModal(${video.id}, '${escapedName}')" >📝</button>
                        <button class="review-faces-btn" title="Review faces" onclick="event.stopPropagation(); event.preventDefault(); app.showVideoFacesReviewModal(${video.id})">👤</button>
                        <button class="refresh-btn" title="Refresh" onclick="event.stopPropagation(); event.preventDefault(); app.refreshVideo(${video.id})">🔄</button>
                        <button class="move-btn" title="Move" onclick="event.stopPropagation(); event.preventDefault(); app.showMoveModal(${video.id}, '${escapedName}')">↗</button>
                        <button class="context-menu-btn" onclick="event.stopPropagation(); event.preventDefault(); app.showVideoContextMenu(event, ${video.id}, '${escapedName}')">⋯</button>
                    </div>
                    <div class="video-path" title="${folderDisplayName}">
                        ${this.app.nav.createNavigablePath ? this.app.nav.createNavigablePath(video) : video.category}
                    </div>
                </div>
            </div>
        `;

        // Register lazy images with intersection observer
        const lazyImage = card.querySelector('.lazy-image');
        if (lazyImage && this.app.imageObserver) {
            this.app.imageObserver.observe(lazyImage);
        }

        return card;
    }

    createTagsHtml(video) {
        if (!video.tags || video.tags.length === 0) return '';

        const visibleTags = video.tags.slice(0, 3);
        const remainingCount = video.tags.length - 3;

        let tagsHtml = visibleTags.map(tag =>
            `<span class="tag clickable-tag" style="background-color: ${tag.color}" onclick="event.stopPropagation(); app.filterByTag('${tag.name}')">${tag.name}</span>`
        ).join('');

        if (remainingCount > 0) {
            tagsHtml += `<span class="more-indicator" title="${video.tags.slice(3).map(t => t.name).join(', ')}">+${remainingCount}</span>`;
        }

        return `<div class="compact-tags">${tagsHtml}</div>`;
    }

    createActorsHtml(video) {
        if (!video.actors || video.actors.length === 0) return '';

        const visibleActors = video.actors.slice(0, 3);
        const remainingCount = video.actors.length - 3;

        let actorsHtml = visibleActors.map(actor =>
            `<span class="actor-compact clickable-actor" onclick="event.stopPropagation(); app.filterByActor('${actor.name.replace(/'/g, "\\'")}')" title="${actor.name}">👤 ${actor.name}</span>`
        ).join('');

        if (remainingCount > 0) {
            actorsHtml += `<span class="more-indicator" title="${video.actors.slice(3).map(a => a.name).join(', ')}">+${remainingCount}</span>`;
        }

        return `<div class="compact-actors">${actorsHtml}</div>`;
    }

    createFacesHtml(video) {
        if (!video.faces || video.faces.length === 0) return '';

        return video.faces.slice(0, 5).map(face => {
            // Determine thumbnail with fallback logic
            let thumbnailSrc = '';

            if (face.thumbnail) {
                // Use face's own thumbnail if available
                thumbnailSrc = face.thumbnail.startsWith('data:')
                    ? face.thumbnail
                    : `data:image/jpeg;base64,${face.thumbnail}`;
            } else if (face.embeddings && face.embeddings.length > 0) {
                // Fallback: Use best thumbnail from face's embeddings
                const embWithThumb = face.embeddings.find(e => e.thumbnail);
                if (embWithThumb) {
                    thumbnailSrc = `data:image/jpeg;base64,${embWithThumb.thumbnail}`;
                }
            }

            // Skip if still no thumbnail found
            if (!thumbnailSrc) return '';

            // Store face data in data attributes for context menu access
            const faceName = face.name.replace(/'/g, "\\'");
            return `<div class="face-icon-container" data-face-id="${face.id}" data-face-name="${faceName}">
                 <img class="face-icon" src="${thumbnailSrc}"
                      title="${face.name}"
                      onerror="this.style.display='none'"
                      onclick="event.stopPropagation(); app.showAllVideosByFace(${face.id}, '${faceName}')" />
                 <div class="face-icon-actions">
                     <button class="face-action-btn face-search-btn" 
                             title="View all videos with this face"
                             onclick="event.stopPropagation(); app.showAllVideosByFace(${face.id}, '${faceName}')">
                         👁️
                     </button>
                 </div>
             </div>`;
        }).join('') +
            (video.faces.length > 5 ? `<span class="face-count">+${video.faces.length - 5} more</span>` : '');
    }

    createMetadataLine(video) {
        const metadataParts = [];
        if (video.media_type === 'image') {
            if (video.width && video.height) {
                metadataParts.push(`📐 ${this.app.format.formatResolution(video.width, video.height)}`);
            }
        } else {
            if (video.duration) {
                metadataParts.push(`⏱️ ${this.app.format.formatDuration(video.duration)}`);
            }
            if (video.width && video.height) {
                metadataParts.push(`📺 ${this.app.format.formatResolution(video.width, video.height)}`);
            }
        }
        if (video.size) {
            metadataParts.push(`💾 ${this.app.format.formatSize(video.size)}`);
        }
        if (video.fingerprint_generated) {
            metadataParts.push(`🆔`);
        }
        return metadataParts.length > 0 ? `<div class="video-metadata-line">${metadataParts.join(' • ')}</div>` : '';
    }

    createThumbnailHtml(video) {
        if (video.thumbnail_url) {
            let thumbnailUrl = video.thumbnail_url;
            if (video.thumbnail_updated_at) {
                thumbnailUrl += (thumbnailUrl.includes('?') ? '&' : '?') + 'v=' + video.thumbnail_updated_at;
            }

            return `
                <img class="thumbnail-image lazy-image"
                     data-src="${thumbnailUrl}"
                     alt="${video.name}"
                     src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='100%25' height='100%25' fill='%23f3f4f6'/%3E%3C/svg%3E" />
                <div class="play-overlay">▶</div>
            `;
        } else {
            return `
                <div class="thumbnail-placeholder">
                    <div class="video-icon">🎬</div>
                    <div class="loading-text">Loading...</div>
                </div>
                <div class="play-overlay">▶</div>
            `;
        }
    }

    createSimilarityBadge(similarity, isOriginal) {
        if (isOriginal) {
            return `<div class="similarity-badge original">ORIGINAL</div>`;
        }
        const percentage = Math.round(similarity * 100);
        let colorClass = 'high';
        if (percentage < 80) colorClass = 'medium';
        if (percentage < 50) colorClass = 'low';

        return `<div class="similarity-badge ${colorClass}">${percentage}% MATCH</div>`;
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

window.VideoCardFactory = VideoCardFactory;
