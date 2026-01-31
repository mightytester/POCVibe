// NEW FULL-SCREEN FACE EXTRACTION VIEW METHODS
// Add these methods to the ClipperApp class after hideFaceExtractionModal()

async enterFaceExtractionView(video) {
    const videoPlayer = document.getElementById('videoPlayer');
    const view = document.getElementById('faceExtractionView');
    const extractVideoPlayer = document.getElementById('faceExtractVideoPlayer');
    const videoTitle = document.getElementById('faceExtractVideoTitle');

    if (!videoPlayer.src) {
        this.showToast('No video is currently playing', 'error');
        return;
    }

    // Store current video info
    this.currentVideoForFaces = video;
    const wasPlaying = !videoPlayer.paused;
    this.videoWasPlayingBeforeExtract = wasPlaying;

    // Copy video source to extraction view player
    extractVideoPlayer.src = videoPlayer.src;
    extractVideoPlayer.currentTime = videoPlayer.currentTime;

    // Maintain play state
    if (wasPlaying) {
        extractVideoPlayer.play();
    }

    // Set title
    videoTitle.textContent = `Face Extraction - ${video.display_name || video.name}`;

    // Hide everything except face extraction view
    document.getElementById('videoModal').style.display = 'none';
    document.getElementById('mainContent').style.display = 'none';
    view.style.display = 'flex';

    // Load face-api.js models if not already loaded
    await this.loadFaceApiModels();

    // Clear previous state and initialize
    this.clearFaceExtractionState();
    this.initializeFaceExtractionListeners();
}

exitFaceExtractionView() {
    const view = document.getElementById('faceExtractionView');
    const videoModal = document.getElementById('videoModal');
    const extractVideoPlayer = document.getElementById('faceExtractVideoPlayer');
    const videoPlayer = document.getElementById('videoPlayer');

    // Sync video state back to original player
    if (extractVideoPlayer.src) {
        videoPlayer.currentTime = extractVideoPlayer.currentTime;

        // Restore play state
        if (!extractVideoPlayer.paused) {
            videoPlayer.play();
        } else if (this.videoWasPlayingBeforeExtract) {
            // Video was playing before, resume
            videoPlayer.play();
        }
    }

    // Clear extract video player
    extractVideoPlayer.pause();
    extractVideoPlayer.src = '';

    // Show video modal again
    view.style.display = 'none';
    videoModal.style.display = 'flex';
    document.getElementById('mainContent').style.display = 'block';

    // Clear state
    this.clearFaceExtractionState();
}

clearFaceExtractionState() {
    this.scannedFrames = [];
    this.selectedFrames = [];
    this.detectedFaces = [];

    // Clear grids
    const framesGrid = document.getElementById('capturedFramesGrid');
    const facesGrid = document.getElementById('detectedFacesGrid');

    framesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No frames captured yet</p><p class="face-extract-empty-hint">Capture frames manually or use random scan</p></div>';
    facesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No faces detected yet</p><p class="face-extract-empty-hint">Select frames and click "Detect Faces"</p></div>';

    // Reset counters
    document.getElementById('capturedFramesCount').textContent = '0';
    document.getElementById('selectedFramesCountLabel').textContent = '0';
    document.getElementById('detectedFacesCount').textContent = '0';
    document.getElementById('detectFacesInFramesBtn').disabled = true;
}

initializeFaceExtractionListeners() {
    // Remove old listeners to prevent duplicates
    const exitBtn = document.getElementById('exitFaceExtractionView');
    const captureBtn = document.getElementById('captureCurrentFrameBtn');
    const scanBtn = document.getElementById('scanRandomFramesBtn');
    const selectAllBtn = document.getElementById('selectAllFramesBtn');
    const clearAllBtn = document.getElementById('clearAllFramesBtn');
    const detectBtn = document.getElementById('detectFacesInFramesBtn');

    // Clone and replace to remove all listeners
    exitBtn.replaceWith(exitBtn.cloneNode(true));
    captureBtn.replaceWith(captureBtn.cloneNode(true));
    scanBtn.replaceWith(scanBtn.cloneNode(true));
    selectAllBtn.replaceWith(selectAllBtn.cloneNode(true));
    clearAllBtn.replaceWith(clearAllBtn.cloneNode(true));
    detectBtn.replaceWith(detectBtn.cloneNode(true));

    // Add fresh listeners
    document.getElementById('exitFaceExtractionView').onclick = () => this.exitFaceExtractionView();
    document.getElementById('captureCurrentFrameBtn').onclick = () => this.captureCurrentFrame();
    document.getElementById('scanRandomFramesBtn').onclick = () => this.scanRandomFramesNew();
    document.getElementById('selectAllFramesBtn').onclick = () => this.selectAllCapturedFrames();
    document.getElementById('clearAllFramesBtn').onclick = () => this.clearAllCapturedFrames();
    document.getElementById('detectFacesInFramesBtn').onclick = () => this.detectFacesInSelectedFrames();
}

async captureCurrentFrame() {
    const videoPlayer = document.getElementById('faceExtractVideoPlayer');
    const statusEl = document.getElementById('faceDetectionStatus');

    try {
        statusEl.textContent = 'Capturing frame...';

        // Create canvas and capture current frame
        const canvas = document.createElement('canvas');
        canvas.width = videoPlayer.videoWidth;
        canvas.height = videoPlayer.videoHeight;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(videoPlayer, 0, 0, canvas.width, canvas.height);

        const frameData = canvas.toDataURL('image/jpeg', 0.85);
        const timestamp = videoPlayer.currentTime;

        // Add to scanned frames
        const frame = {
            id: this.scannedFrames.length,
            timestamp: timestamp,
            data: frameData,
            selected: true  // Auto-select captured frames
        };

        this.scannedFrames.push(frame);
        this.selectedFrames.push(frame);

        // Render frames
        this.renderCapturedFrames();

        statusEl.textContent = `✓ Captured frame at ${this.formatDuration(timestamp)}`;
        setTimeout(() => {
            statusEl.textContent = '';
        }, 2000);

    } catch (error) {
        console.error('Error capturing frame:', error);
        statusEl.textContent = '✗ Failed to capture frame';
        this.showToast('Failed to capture frame', 'error');
    }
}

async scanRandomFramesNew() {
    const videoPlayer = document.getElementById('faceExtractVideoPlayer');
    const statusEl = document.getElementById('faceDetectionStatus');
    const scanningOverlay = document.getElementById('videoScanningOverlay');

    if (!videoPlayer.duration || videoPlayer.duration === Infinity) {
        this.showToast('Video duration not available', 'error');
        return;
    }

    try {
        // Pause video
        videoPlayer.pause();

        statusEl.textContent = 'Scanning 8 random frames...';

        const TOTAL_FRAMES = 8;
        const duration = videoPlayer.duration;
        const startTime = duration * 0.05;
        const endTime = duration * 0.95;
        const timestamps = [];

        // Generate random timestamps
        for (let i = 0; i < TOTAL_FRAMES; i++) {
            const randomTime = startTime + Math.random() * (endTime - startTime);
            timestamps.push(randomTime);
        }

        timestamps.sort((a, b) => a - b);

        // Create canvas for capture
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        // Capture frames
        for (let i = 0; i < timestamps.length; i++) {
            const timestamp = timestamps[i];

            // Seek to timestamp
            videoPlayer.currentTime = timestamp;

            // Wait for seek
            await new Promise((resolve) => {
                const seekHandler = () => {
                    videoPlayer.removeEventListener('seeked', seekHandler);
                    resolve();
                };
                videoPlayer.addEventListener('seeked', seekHandler);
            });

            // Ensure paused
            if (!videoPlayer.paused) {
                videoPlayer.pause();
            }

            await new Promise(resolve => setTimeout(resolve, 100));

            // Capture frame
            tempCanvas.width = videoPlayer.videoWidth;
            tempCanvas.height = videoPlayer.videoHeight;
            tempCtx.drawImage(videoPlayer, 0, 0, tempCanvas.width, tempCanvas.height);

            const frameData = tempCanvas.toDataURL('image/jpeg', 0.85);

            // Add frame
            const frame = {
                id: this.scannedFrames.length,
                timestamp: timestamp,
                data: frameData,
                selected: false
            };

            this.scannedFrames.push(frame);

            statusEl.textContent = `Scanning... ${i + 1}/${TOTAL_FRAMES}`;
        }

        // Render all frames
        this.renderCapturedFrames();

        statusEl.textContent = `✓ Scanned ${TOTAL_FRAMES} frames`;
        setTimeout(() => {
            statusEl.textContent = '';
        }, 2000);

    } catch (error) {
        console.error('Error scanning frames:', error);
        statusEl.textContent = '✗ Scan failed';
        this.showToast('Failed to scan frames', 'error');
    }
}

renderCapturedFrames() {
    const framesGrid = document.getElementById('capturedFramesGrid');

    if (this.scannedFrames.length === 0) {
        framesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No frames captured yet</p><p class="face-extract-empty-hint">Capture frames manually or use random scan</p></div>';
        document.getElementById('capturedFramesCount').textContent = '0';
        document.getElementById('selectedFramesCountLabel').textContent = '0';
        document.getElementById('detectFacesInFramesBtn').disabled = true;
        return;
    }

    framesGrid.innerHTML = '';

    this.scannedFrames.forEach(frame => {
        const card = document.createElement('div');
        card.className = 'face-extract-frame-card';
        if (frame.selected) {
            card.classList.add('selected');
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'face-extract-frame-checkbox';
        checkbox.checked = frame.selected;
        checkbox.onchange = (e) => {
            e.stopPropagation();
            this.toggleFrameSelection(frame);
        };

        const img = document.createElement('img');
        img.src = frame.data;
        img.className = 'face-extract-frame-img';
        img.alt = 'Captured frame';

        const time = document.createElement('div');
        time.className = 'face-extract-frame-time';
        time.textContent = this.formatDuration(frame.timestamp);

        card.onclick = () => this.toggleFrameSelection(frame);
        card.appendChild(checkbox);
        card.appendChild(img);
        card.appendChild(time);

        framesGrid.appendChild(card);
    });

    // Update counters
    document.getElementById('capturedFramesCount').textContent = this.scannedFrames.length;
    document.getElementById('selectedFramesCountLabel').textContent = this.selectedFrames.length;
    document.getElementById('detectFacesInFramesBtn').disabled = this.selectedFrames.length === 0;
}

toggleFrameSelection(frame) {
    frame.selected = !frame.selected;

    if (frame.selected) {
        if (!this.selectedFrames.includes(frame)) {
            this.selectedFrames.push(frame);
        }
    } else {
        const index = this.selectedFrames.indexOf(frame);
        if (index > -1) {
            this.selectedFrames.splice(index, 1);
        }
    }

    this.renderCapturedFrames();
}

selectAllCapturedFrames() {
    this.scannedFrames.forEach(frame => {
        frame.selected = true;
        if (!this.selectedFrames.includes(frame)) {
            this.selectedFrames.push(frame);
        }
    });
    this.renderCapturedFrames();
}

clearAllCapturedFrames() {
    if (confirm('Clear all captured frames?')) {
        this.scannedFrames = [];
        this.selectedFrames = [];
        this.renderCapturedFrames();
    }
}

async detectFacesInSelectedFrames() {
    if (this.selectedFrames.length === 0) {
        this.showToast('No frames selected', 'error');
        return;
    }

    const statusEl = document.getElementById('faceDetectionStatus');

    try {
        statusEl.textContent = 'Detecting faces...';

        // Load face-api models if needed
        if (!this.faceApiLoaded) {
            await this.loadFaceApiModels();
        }

        this.detectedFaces = [];

        for (let i = 0; i < this.selectedFrames.length; i++) {
            const frame = this.selectedFrames[i];

            statusEl.textContent = `Detecting faces... ${i + 1}/${this.selectedFrames.length}`;

            // Convert frame data to image
            const img = new Image();
            await new Promise((resolve) => {
                img.onload = resolve;
                img.src = frame.data;
            });

            // Create canvas from image
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
            tempCtx.drawImage(img, 0, 0);

            // Detect faces
            const detections = await faceapi
                .detectAllFaces(tempCanvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
                .withFaceLandmarks()
                .withFaceDescriptors();

            if (detections && detections.length > 0) {
                for (const detection of detections) {
                    const box = detection.detection.box;

                    // Add padding
                    const padding = 20;
                    const x = Math.max(0, box.x - padding);
                    const y = Math.max(0, box.y - padding);
                    const width = Math.min(img.width - x, box.width + padding * 2);
                    const height = Math.min(img.height - y, box.height + padding * 2);

                    // Crop face
                    const faceCanvas = document.createElement('canvas');
                    faceCanvas.width = width;
                    faceCanvas.height = height;
                    const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });
                    faceCtx.imageSmoothingEnabled = true;
                    faceCtx.imageSmoothingQuality = 'high';
                    faceCtx.drawImage(tempCanvas, x, y, width, height, 0, 0, width, height);

                    const faceImageData = faceCanvas.toDataURL('image/jpeg', 0.95);

                    const faceObj = {
                        id: this.detectedFaces.length,
                        imageData: faceImageData,
                        confidence: detection.detection.score,
                        timestamp: frame.timestamp,
                        frameIndex: frame.id,
                        box: { x, y, width, height }
                    };

                    this.detectedFaces.push(faceObj);
                }
            }
        }

        this.renderDetectedFaces();

        statusEl.textContent = `✓ Found ${this.detectedFaces.length} face(s)`;
        setTimeout(() => {
            statusEl.textContent = '';
        }, 2000);

    } catch (error) {
        console.error('Error detecting faces:', error);
        statusEl.textContent = '✗ Detection failed';
        this.showToast('Face detection failed', 'error');
    }
}

renderDetectedFaces() {
    const facesGrid = document.getElementById('detectedFacesGrid');

    if (this.detectedFaces.length === 0) {
        facesGrid.innerHTML = '<div class="face-extract-empty-state"><p>No faces detected yet</p><p class="face-extract-empty-hint">Select frames and click "Detect Faces"</p></div>';
        document.getElementById('detectedFacesCount').textContent = '0';
        return;
    }

    facesGrid.innerHTML = '';

    this.detectedFaces.forEach(face => {
        const card = document.createElement('div');
        card.className = 'face-extract-face-card';

        const removeBtn = document.createElement('button');
        removeBtn.className = 'face-extract-face-remove';
        removeBtn.textContent = '✕';
        removeBtn.title = 'Remove this face';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeFaceFromDetected(face.id);
        };

        const img = document.createElement('img');
        img.src = face.imageData;
        img.className = 'face-extract-face-img';
        img.alt = 'Detected face';

        const info = document.createElement('div');
        info.className = 'face-extract-face-info';
        info.textContent = `${(face.confidence * 100).toFixed(0)}% conf`;

        card.appendChild(removeBtn);
        card.appendChild(img);
        card.appendChild(info);

        // Click to search/add
        card.onclick = () => this.searchSingleFace(face);

        facesGrid.appendChild(card);
    });

    document.getElementById('detectedFacesCount').textContent = this.detectedFaces.length;
}

removeFaceFromDetected(faceId) {
    const index = this.detectedFaces.findIndex(f => f.id === faceId);
    if (index > -1) {
        this.detectedFaces.splice(index, 1);
        // Re-assign IDs
        this.detectedFaces.forEach((f, i) => {
            f.id = i;
        });
        this.renderDetectedFaces();
        this.showToast('Face removed', 'info');
    }
}

// Update showFaceExtractionModal to use new view
async showFaceExtractionModal(video) {
    await this.enterFaceExtractionView(video);
}

hideFaceExtractionModal() {
    this.exitFaceExtractionView();
}
