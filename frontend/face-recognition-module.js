/**
 * FaceRecognitionModule - Comprehensive face recognition system
 * Handles face detection, cataloging, searching, and management
 * Integrates with face-api.js (frontend) and InsightFace (backend)
 */
class FaceRecognitionModule {
    constructor(app) {
        this.app = app;
        this.api = app.api;

        // Face state
        this.catalogFaces = [];
        this.selectedEncodings = new Set();
        this.currentFaceSearchResults = null;

        // Face-API.js models
        this.faceApiLoaded = false;
        this.faceApiLoading = false;
        this.faceApiModelsPath = '/models';

        // Detection settings
        this.detectionThreshold = 0.6;
        this.detectionOptions = null;
    }

    // ============ Initialization ============

    /**
     * Initialize face-api.js models
     * @param {Object} options - Optional configuration
     * @param {Function} options.onStatus - Callback for status updates (message, isError)
     * @returns {Promise<boolean>} True if models loaded successfully
     */
    async initializeFaceAPI(options = {}) {
        if (this.faceApiLoaded) return true;
        if (this.faceApiLoading) return false; // Already loading

        this.faceApiLoading = true;
        const onStatus = options.onStatus || (() => {});

        try {
            onStatus('Loading face detection models...', false);
            console.log('Loading face-api.js models...');

            // Use CDN for reliable model loading
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';

            await Promise.all([
                faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);

            this.detectionOptions = new faceapi.SsdMobilenetv1Options({
                minConfidence: 0.5
            });

            this.faceApiLoaded = true;
            onStatus('Face detection ready', false);
            console.log('✓ face-api.js models loaded successfully');
            return true;
        } catch (error) {
            console.error('Failed to load face-api.js models:', error);
            onStatus('Failed to load face detection models', true);
            return false;
        } finally {
            this.faceApiLoading = false;
        }
    }

    // ============ Face Search ('S' key workflow) ============

    async searchFaceFromCurrentFrame(videoElement) {
        if (!await this.initializeFaceAPI()) {
            alert('Face detection models not loaded');
            return;
        }

        try {
            // Detect faces in current frame
            const detections = await faceapi
                .detectAllFaces(videoElement, this.detectionOptions)
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (!detections || detections.length === 0) {
                alert('No faces detected in current frame');
                return;
            }

            if (detections.length > 1) {
                alert(`Found ${detections.length} faces. Please ensure only one face is visible.`);
                return;
            }

            const detection = detections[0];
            const encoding = Array.from(detection.descriptor);

            // Search backend for matching faces
            const results = await this.api.searchFaces(encoding, this.detectionThreshold);

            if (!results || results.matches.length === 0) {
                this.showCreateFaceModal(encoding, detection);
            } else {
                this.showFaceSearchResults(results.matches, encoding, detection);
            }
        } catch (error) {
            console.error('Face search failed:', error);
            alert('Face search failed: ' + error.message);
        }
    }

    showFaceSearchResults(matches, encoding, detection) {
        this.currentFaceSearchResults = { matches, encoding, detection };

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Face Search Results</h2>
                <p>Found ${matches.length} matching face(s)</p>
                <div class="face-results-container">
                    ${matches.map(match => this.renderFaceMatchCard(match)).join('')}
                </div>
                <div class="modal-actions">
                    <button id="createNewFaceBtn" class="btn-secondary">Create New Face</button>
                    <button id="closeFaceSearchBtn" class="btn-primary">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('#createNewFaceBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
            this.showCreateFaceModal(encoding, detection);
        });

        modal.querySelector('#closeFaceSearchBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Add click handlers for face cards
        modal.querySelectorAll('.face-match-card').forEach(card => {
            card.addEventListener('click', async (e) => {
                const faceId = card.dataset.faceId;
                const videoId = this.app.currentVideo?.id;
                if (videoId && faceId) {
                    await this.linkFaceToVideo(videoId, faceId);
                    document.body.removeChild(modal);
                }
            });
        });
    }

    renderFaceMatchCard(match) {
        const similarity = ((1 - match.distance) * 100).toFixed(1);
        return `
            <div class="face-match-card" data-face-id="${match.face.id}">
                <img src="${match.face.thumbnail || '/placeholder-face.png'}" alt="${match.face.name}">
                <div class="face-match-info">
                    <strong>${match.face.name}</strong>
                    <span>Similarity: ${similarity}%</span>
                    <span>Encodings: ${match.face.encoding_count}</span>
                </div>
            </div>
        `;
    }

    showCreateFaceModal(encoding, detection) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Create New Face</h2>
                <p>No matching face found. Create a new face identity.</p>
                <input type="text" id="newFaceName" placeholder="Enter face name" class="form-input">
                <div class="modal-actions">
                    <button id="confirmCreateFaceBtn" class="btn-primary">Create</button>
                    <button id="cancelCreateFaceBtn" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const nameInput = modal.querySelector('#newFaceName');
        nameInput.focus();

        modal.querySelector('#confirmCreateFaceBtn').addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                alert('Please enter a face name');
                return;
            }

            await this.createNewFace(name, encoding, detection);
            document.body.removeChild(modal);
        });

        modal.querySelector('#cancelCreateFaceBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        // Enter key to submit
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                modal.querySelector('#confirmCreateFaceBtn').click();
            }
        });
    }

    async createNewFace(name, encoding, detection) {
        try {
            // Extract thumbnail from detection
            const canvas = document.createElement('canvas');
            canvas.width = 150;
            canvas.height = 150;
            const ctx = canvas.getContext('2d');

            // Draw face region
            const box = detection.detection.box;
            const videoElement = this.app.currentVideoElement;
            ctx.drawImage(
                videoElement,
                box.x, box.y, box.width, box.height,
                0, 0, 150, 150
            );

            const thumbnail = canvas.toDataURL('image/jpeg', 0.8);

            // Create face in backend
            const result = await this.api.createFace(name, encoding, thumbnail);

            // Link to current video
            if (this.app.currentVideo) {
                await this.linkFaceToVideo(this.app.currentVideo.id, result.face_id);
            }

            alert(`Face "${name}" created successfully`);
        } catch (error) {
            console.error('Failed to create face:', error);
            alert('Failed to create face: ' + error.message);
        }
    }

    async linkFaceToVideo(videoId, faceId) {
        try {
            await this.api.linkFaceToVideo(videoId, faceId, 'manual');
            alert('Face linked to video successfully');

            // Refresh video details if showing
            if (this.app.currentVideo && this.app.currentVideo.id === videoId) {
                await this.app.refreshCurrentVideo();
            }
        } catch (error) {
            console.error('Failed to link face to video:', error);
            alert('Failed to link face: ' + error.message);
        }
    }

    // ============ Batch Extraction ('X' key workflow) ============

    async openBatchExtractionModal(videoElement, videoId) {
        if (!await this.initializeFaceAPI()) {
            alert('Face detection models not loaded');
            return;
        }

        this.catalogFaces = [];
        this.selectedEncodings = new Set();

        const modal = document.createElement('div');
        modal.id = 'batchExtractionModal';
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content large-modal">
                <h2>Batch Face Extraction</h2>
                <p>Scanning video for faces...</p>
                <div id="extractionProgress">
                    <div class="progress-bar">
                        <div id="extractionProgressBar" class="progress-fill"></div>
                    </div>
                    <span id="extractionProgressText">0%</span>
                </div>
                <div id="extractedFacesContainer" class="faces-grid"></div>
                <div class="modal-actions">
                    <button id="catalogSelectedBtn" class="btn-primary" disabled>Catalog Selected (0)</button>
                    <button id="closeBatchExtractionBtn" class="btn-secondary">Close</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Start extraction
        await this.performBatchExtraction(videoElement, videoId);

        // Event listeners
        modal.querySelector('#catalogSelectedBtn').addEventListener('click', () => {
            this.showCatalogModal();
        });

        modal.querySelector('#closeBatchExtractionBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    async performBatchExtraction(videoElement, videoId) {
        const duration = videoElement.duration;
        const frameCount = 25; // Sample 25 frames
        const interval = duration / frameCount;

        const progressBar = document.getElementById('extractionProgressBar');
        const progressText = document.getElementById('extractionProgressText');
        const facesContainer = document.getElementById('extractedFacesContainer');

        for (let i = 0; i < frameCount; i++) {
            const time = i * interval;
            videoElement.currentTime = time;

            // Wait for seek to complete
            await new Promise(resolve => {
                videoElement.onseeked = resolve;
            });

            // Detect faces
            const detections = await faceapi
                .detectAllFaces(videoElement, this.detectionOptions)
                .withFaceLandmarks()
                .withFaceDescriptors();

            // Process each detected face
            for (const detection of detections) {
                const faceData = await this.extractFaceData(videoElement, detection, time);
                this.catalogFaces.push(faceData);
                this.renderExtractedFace(facesContainer, faceData, this.catalogFaces.length - 1);
            }

            // Update progress
            const progress = ((i + 1) / frameCount * 100).toFixed(0);
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `${progress}% - Found ${this.catalogFaces.length} faces`;
        }

        progressText.textContent = `Complete! Found ${this.catalogFaces.length} faces`;
    }

    async extractFaceData(videoElement, detection, timestamp) {
        const canvas = document.createElement('canvas');
        canvas.width = 150;
        canvas.height = 150;
        const ctx = canvas.getContext('2d');

        const box = detection.detection.box;
        ctx.drawImage(
            videoElement,
            box.x, box.y, box.width, box.height,
            0, 0, 150, 150
        );

        return {
            encoding: Array.from(detection.descriptor),
            thumbnail: canvas.toDataURL('image/jpeg', 0.8),
            timestamp: timestamp,
            confidence: detection.detection.score
        };
    }

    renderExtractedFace(container, faceData, index) {
        const faceCard = document.createElement('div');
        faceCard.className = 'extracted-face-card';
        faceCard.dataset.index = index;
        faceCard.innerHTML = `
            <img src="${faceData.thumbnail}" alt="Face ${index + 1}">
            <div class="face-info">
                <span>${faceData.timestamp.toFixed(1)}s</span>
                <span>${(faceData.confidence * 100).toFixed(0)}%</span>
            </div>
            <input type="checkbox" class="face-checkbox">
        `;

        faceCard.querySelector('.face-checkbox').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.selectedEncodings.add(index);
                faceCard.classList.add('selected');
            } else {
                this.selectedEncodings.delete(index);
                faceCard.classList.remove('selected');
            }
            this.updateCatalogButton();
        });

        container.appendChild(faceCard);
    }

    updateCatalogButton() {
        const btn = document.getElementById('catalogSelectedBtn');
        if (btn) {
            btn.textContent = `Catalog Selected (${this.selectedEncodings.size})`;
            btn.disabled = this.selectedEncodings.size === 0;
        }
    }

    showCatalogModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h2>Catalog Faces</h2>
                <p>Cataloging ${this.selectedEncodings.size} selected face(s)</p>
                <input type="text" id="catalogFaceName" placeholder="Enter face name" class="form-input">
                <div class="modal-actions">
                    <button id="confirmCatalogBtn" class="btn-primary">Catalog</button>
                    <button id="cancelCatalogBtn" class="btn-secondary">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const nameInput = modal.querySelector('#catalogFaceName');
        nameInput.focus();

        modal.querySelector('#confirmCatalogBtn').addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                alert('Please enter a face name');
                return;
            }

            await this.catalogSelectedFaces(name);
            document.body.removeChild(modal);
        });

        modal.querySelector('#cancelCatalogBtn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }

    async catalogSelectedFaces(faceName) {
        try {
            // Get selected encodings
            const encodings = Array.from(this.selectedEncodings).map(index => ({
                encoding: this.catalogFaces[index].encoding,
                thumbnail: this.catalogFaces[index].thumbnail
            }));

            // Create face or add to existing
            const result = await this.api.catalogFaces(null, encodings);

            // Link to current video
            if (this.app.currentVideo && result.face_id) {
                await this.linkFaceToVideo(this.app.currentVideo.id, result.face_id);
            }

            alert(`Successfully cataloged ${encodings.length} face encoding(s) for "${faceName}"`);

            // Close batch extraction modal
            const batchModal = document.getElementById('batchExtractionModal');
            if (batchModal) {
                document.body.removeChild(batchModal);
            }
        } catch (error) {
            console.error('Failed to catalog faces:', error);
            alert('Failed to catalog faces: ' + error.message);
        }
    }

    // ============ Face Management ============

    async loadAllFaces() {
        try {
            const faces = await this.api.getAllFaces();
            return faces;
        } catch (error) {
            console.error('Failed to load faces:', error);
            return [];
        }
    }

    async renameFace(faceId, newName) {
        try {
            await this.api.updateFace(faceId, { name: newName });
            alert('Face renamed successfully');
        } catch (error) {
            console.error('Failed to rename face:', error);
            alert('Failed to rename face: ' + error.message);
        }
    }

    async deleteFace(faceId) {
        if (!confirm('Are you sure you want to delete this face? This will remove all encodings and video associations.')) {
            return;
        }

        try {
            await this.api.deleteFace(faceId);
            alert('Face deleted successfully');
        } catch (error) {
            console.error('Failed to delete face:', error);
            alert('Failed to delete face: ' + error.message);
        }
    }

    async mergeFaces(sourceFaceId, targetFaceId) {
        if (!confirm('Merge these faces? All encodings and videos will be moved to the target face.')) {
            return;
        }

        try {
            await this.api.mergeFaces(sourceFaceId, targetFaceId);
            alert('Faces merged successfully');
        } catch (error) {
            console.error('Failed to merge faces:', error);
            alert('Failed to merge faces: ' + error.message);
        }
    }
}

// Export as global
window.FaceRecognitionModule = FaceRecognitionModule;
