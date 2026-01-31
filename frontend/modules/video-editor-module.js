/**
 * VideoEditorModule - Pro video editor with timeline and cropping
 * Handles video editing operations: cut, crop, and combined processing
 * Features timeline UI, IN/OUT points, crop presets, and quality settings
 */
class VideoEditorModule {
    constructor(app) {
        this.app = app;
        this.api = app.api;
        this.dom = app.dom;

        // Editor state
        this.editor = null;
        this.currentVideoId = null;
        this.currentVideoName = null;
        this.currentVideoPath = null;

        // Timeline state
        this.inPoint = null;
        this.outPoint = null;
        this.duration = 0;

        // Crop state
        this.cropEnabled = false;
        this.cropBox = null;
        this.cropPreset = null;

        // Processing state
        this.currentJobId = null;
        this.processingPollInterval = null;
    }

    // ============ Editor Initialization ============

    openProVideoEditor(videoId, videoName, videoPath) {
        this.currentVideoId = videoId;
        this.currentVideoName = videoName;
        this.currentVideoPath = videoPath;

        // Create editor UI
        const editorHtml = this.createEditorHTML();
        document.body.insertAdjacentHTML('beforeend', editorHtml);

        // Initialize editor
        this.editor = document.getElementById('proVideoEditor');
        const videoElement = this.editor.querySelector('#editorVideoPlayer');

        // Set video source
        const streamUrl = this.api.getStreamUrl(
            this.extractCategory(videoPath),
            videoName
        );
        videoElement.src = streamUrl;

        // Setup event listeners
        this.setupEditorEventListeners(videoElement);

        // Show editor
        this.editor.classList.add('active');
        videoElement.play();
    }

    createEditorHTML() {
        return `
            <div id="proVideoEditor" class="pro-video-editor">
                <div class="editor-header">
                    <h2>Pro Video Editor</h2>
                    <button id="exitEditorBtn" class="btn-icon">✕</button>
                </div>

                <div class="editor-main">
                    <div class="editor-video-container">
                        <video id="editorVideoPlayer" class="editor-video" controls></video>
                        <div id="editorCropBox" class="crop-box" style="display: none;">
                            <div class="crop-handle crop-handle-tl"></div>
                            <div class="crop-handle crop-handle-tr"></div>
                            <div class="crop-handle crop-handle-bl"></div>
                            <div class="crop-handle crop-handle-br"></div>
                        </div>
                    </div>

                    <div class="editor-timeline">
                        <div class="timeline-track">
                            <div id="timelineInHandle" class="timeline-handle in-handle">IN</div>
                            <div id="timelineOutHandle" class="timeline-handle out-handle">OUT</div>
                            <div id="timelinePlayhead" class="timeline-playhead"></div>
                        </div>
                        <div class="timeline-labels">
                            <span id="timelineStart">0:00</span>
                            <span id="timelineDuration">0:00</span>
                            <span id="timelineEnd">0:00</span>
                        </div>
                    </div>

                    <div class="editor-controls">
                        <div class="control-group">
                            <h3>Trim</h3>
                            <button id="setInPointBtn" class="btn-secondary">Set IN (I)</button>
                            <button id="setOutPointBtn" class="btn-secondary">Set OUT (O)</button>
                            <button id="clearTrimBtn" class="btn-secondary">Clear</button>
                        </div>

                        <div class="control-group">
                            <h3>Crop</h3>
                            <button id="toggleCropBtn" class="btn-secondary">Toggle Crop (C)</button>
                            <select id="cropPresetSelect" class="form-select">
                                <option value="">Custom</option>
                                <option value="9:16">9:16 (Vertical)</option>
                                <option value="16:9">16:9 (Horizontal)</option>
                                <option value="1:1">1:1 (Square)</option>
                                <option value="4:3">4:3</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <h3>Quality</h3>
                            <select id="qualityPresetSelect" class="form-select">
                                <option value="fast">Fast (Stream Copy)</option>
                                <option value="balanced" selected>Balanced</option>
                                <option value="high">High Quality</option>
                            </select>
                        </div>

                        <div class="control-group">
                            <h3>Process</h3>
                            <button id="processCutBtn" class="btn-primary">Cut Only</button>
                            <button id="processCropBtn" class="btn-primary">Crop Only</button>
                            <button id="processBothBtn" class="btn-primary">Cut + Crop</button>
                        </div>
                    </div>
                </div>

                <div id="editorStatus" class="editor-status" style="display: none;">
                    <div class="status-message"></div>
                    <div class="progress-bar">
                        <div class="progress-fill"></div>
                    </div>
                </div>
            </div>
        `;
    }

    extractCategory(videoPath) {
        // Extract category from path (format: /path/to/root/CATEGORY/video.mp4)
        const parts = videoPath.split('/');
        return parts[parts.length - 2] || 'Unknown';
    }

    setupEditorEventListeners(videoElement) {
        // Header controls
        this.editor.querySelector('#exitEditorBtn').addEventListener('click', () => {
            this.exitProEditor();
        });

        // Video events
        videoElement.addEventListener('loadedmetadata', () => {
            this.duration = videoElement.duration;
            this.updateTimelineLabels();
            this.resetTrimPoints();
        });

        videoElement.addEventListener('timeupdate', () => {
            this.updatePlayhead();
        });

        // Trim controls
        this.editor.querySelector('#setInPointBtn').addEventListener('click', () => {
            this.setInPoint();
        });

        this.editor.querySelector('#setOutPointBtn').addEventListener('click', () => {
            this.setOutPoint();
        });

        this.editor.querySelector('#clearTrimBtn').addEventListener('click', () => {
            this.resetTrimPoints();
        });

        // Crop controls
        this.editor.querySelector('#toggleCropBtn').addEventListener('click', () => {
            this.toggleCrop();
        });

        this.editor.querySelector('#cropPresetSelect').addEventListener('change', (e) => {
            this.applyCropPreset(e.target.value);
        });

        // Processing controls
        this.editor.querySelector('#processCutBtn').addEventListener('click', () => {
            this.processVideo('cut');
        });

        this.editor.querySelector('#processCropBtn').addEventListener('click', () => {
            this.processVideo('crop');
        });

        this.editor.querySelector('#processBothBtn').addEventListener('click', () => {
            this.processVideo('both');
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleEditorKeyboard(e));

        // Timeline dragging
        this.setupTimelineDragging();

        // Crop box dragging
        this.setupCropBoxDragging();
    }

    // ============ Timeline Controls ============

    setInPoint() {
        const videoElement = this.editor.querySelector('#editorVideoPlayer');
        this.inPoint = videoElement.currentTime;
        this.updateTimelineHandles();
        this.updateTimelineLabels();
    }

    setOutPoint() {
        const videoElement = this.editor.querySelector('#editorVideoPlayer');
        this.outPoint = videoElement.currentTime;
        this.updateTimelineHandles();
        this.updateTimelineLabels();
    }

    resetTrimPoints() {
        this.inPoint = 0;
        this.outPoint = this.duration;
        this.updateTimelineHandles();
        this.updateTimelineLabels();
    }

    updateTimelineHandles() {
        const inHandle = this.editor.querySelector('#timelineInHandle');
        const outHandle = this.editor.querySelector('#timelineOutHandle');

        const inPercent = (this.inPoint / this.duration) * 100;
        const outPercent = (this.outPoint / this.duration) * 100;

        inHandle.style.left = `${inPercent}%`;
        outHandle.style.left = `${outPercent}%`;
    }

    updatePlayhead() {
        const videoElement = this.editor.querySelector('#editorVideoPlayer');
        const playhead = this.editor.querySelector('#timelinePlayhead');
        const percent = (videoElement.currentTime / this.duration) * 100;
        playhead.style.left = `${percent}%`;
    }

    updateTimelineLabels() {
        const startLabel = this.editor.querySelector('#timelineStart');
        const durationLabel = this.editor.querySelector('#timelineDuration');
        const endLabel = this.editor.querySelector('#timelineEnd');

        startLabel.textContent = this.formatTime(this.inPoint);
        durationLabel.textContent = this.formatTime(this.outPoint - this.inPoint);
        endLabel.textContent = this.formatTime(this.outPoint);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    setupTimelineDragging() {
        const timeline = this.editor.querySelector('.timeline-track');
        const inHandle = this.editor.querySelector('#timelineInHandle');
        const outHandle = this.editor.querySelector('#timelineOutHandle');

        let dragging = null;

        const startDrag = (handle, e) => {
            dragging = handle;
            e.preventDefault();
        };

        const doDrag = (e) => {
            if (!dragging) return;

            const rect = timeline.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percent = Math.max(0, Math.min(1, x / rect.width));
            const time = percent * this.duration;

            if (dragging === inHandle) {
                this.inPoint = Math.min(time, this.outPoint - 1);
            } else if (dragging === outHandle) {
                this.outPoint = Math.max(time, this.inPoint + 1);
            }

            this.updateTimelineHandles();
            this.updateTimelineLabels();
        };

        const endDrag = () => {
            dragging = null;
        };

        inHandle.addEventListener('mousedown', (e) => startDrag(inHandle, e));
        outHandle.addEventListener('mousedown', (e) => startDrag(outHandle, e));
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', endDrag);
    }

    // ============ Crop Controls ============

    toggleCrop() {
        this.cropEnabled = !this.cropEnabled;
        const cropBox = this.editor.querySelector('#editorCropBox');

        if (this.cropEnabled) {
            cropBox.style.display = 'block';
            this.initializeCropBox();
        } else {
            cropBox.style.display = 'none';
        }
    }

    initializeCropBox() {
        const videoContainer = this.editor.querySelector('.editor-video-container');
        const cropBox = this.editor.querySelector('#editorCropBox');

        // Default crop box (centered, 80% size)
        const containerWidth = videoContainer.offsetWidth;
        const containerHeight = videoContainer.offsetHeight;

        const cropWidth = containerWidth * 0.8;
        const cropHeight = containerHeight * 0.8;
        const cropLeft = (containerWidth - cropWidth) / 2;
        const cropTop = (containerHeight - cropHeight) / 2;

        this.cropBox = {
            x: cropLeft,
            y: cropTop,
            width: cropWidth,
            height: cropHeight
        };

        this.updateCropBoxDisplay();
    }

    updateCropBoxDisplay() {
        const cropBox = this.editor.querySelector('#editorCropBox');
        cropBox.style.left = `${this.cropBox.x}px`;
        cropBox.style.top = `${this.cropBox.y}px`;
        cropBox.style.width = `${this.cropBox.width}px`;
        cropBox.style.height = `${this.cropBox.height}px`;
    }

    applyCropPreset(preset) {
        if (!this.cropEnabled) {
            this.toggleCrop();
        }

        const videoContainer = this.editor.querySelector('.editor-video-container');
        const containerWidth = videoContainer.offsetWidth;
        const containerHeight = videoContainer.offsetHeight;

        let width, height;

        switch (preset) {
            case '9:16':
                height = containerHeight * 0.9;
                width = (height * 9) / 16;
                break;
            case '16:9':
                width = containerWidth * 0.9;
                height = (width * 9) / 16;
                break;
            case '1:1':
                const size = Math.min(containerWidth, containerHeight) * 0.8;
                width = height = size;
                break;
            case '4:3':
                width = containerWidth * 0.8;
                height = (width * 3) / 4;
                break;
            default:
                return;
        }

        this.cropBox = {
            x: (containerWidth - width) / 2,
            y: (containerHeight - height) / 2,
            width: width,
            height: height
        };

        this.updateCropBoxDisplay();
        this.cropPreset = preset;
    }

    setupCropBoxDragging() {
        const cropBox = this.editor.querySelector('#editorCropBox');
        const handles = cropBox.querySelectorAll('.crop-handle');

        let dragging = null;
        let dragStart = null;
        let boxStart = null;

        const startDrag = (handle, e) => {
            dragging = handle;
            dragStart = { x: e.clientX, y: e.clientY };
            boxStart = { ...this.cropBox };
            e.preventDefault();
        };

        const doDrag = (e) => {
            if (!dragging) return;

            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;

            // Update crop box based on handle
            if (dragging.classList.contains('crop-handle-tl')) {
                this.cropBox.x = boxStart.x + dx;
                this.cropBox.y = boxStart.y + dy;
                this.cropBox.width = boxStart.width - dx;
                this.cropBox.height = boxStart.height - dy;
            } else if (dragging.classList.contains('crop-handle-tr')) {
                this.cropBox.y = boxStart.y + dy;
                this.cropBox.width = boxStart.width + dx;
                this.cropBox.height = boxStart.height - dy;
            } else if (dragging.classList.contains('crop-handle-bl')) {
                this.cropBox.x = boxStart.x + dx;
                this.cropBox.width = boxStart.width - dx;
                this.cropBox.height = boxStart.height + dy;
            } else if (dragging.classList.contains('crop-handle-br')) {
                this.cropBox.width = boxStart.width + dx;
                this.cropBox.height = boxStart.height + dy;
            }

            this.updateCropBoxDisplay();
        };

        const endDrag = () => {
            dragging = null;
        };

        handles.forEach(handle => {
            handle.addEventListener('mousedown', (e) => startDrag(handle, e));
        });

        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', endDrag);
    }

    // ============ Processing ============

    async processVideo(mode) {
        const quality = this.editor.querySelector('#qualityPresetSelect').value;

        const options = {
            mode: mode,
            quality: quality
        };

        // Add trim options if set
        if (mode === 'cut' || mode === 'both') {
            if (this.inPoint === 0 && this.outPoint === this.duration) {
                alert('Please set IN and OUT points for cutting');
                return;
            }
            options.start_time = this.inPoint;
            options.end_time = this.outPoint;
        }

        // Add crop options if enabled
        if (mode === 'crop' || mode === 'both') {
            if (!this.cropEnabled) {
                alert('Please enable and configure crop box');
                return;
            }

            const videoElement = this.editor.querySelector('#editorVideoPlayer');
            const videoWidth = videoElement.videoWidth;
            const videoHeight = videoElement.videoHeight;
            const displayWidth = videoElement.offsetWidth;
            const displayHeight = videoElement.offsetHeight;

            // Convert display coordinates to video coordinates
            const scaleX = videoWidth / displayWidth;
            const scaleY = videoHeight / displayHeight;

            options.crop = {
                x: Math.round(this.cropBox.x * scaleX),
                y: Math.round(this.cropBox.y * scaleY),
                width: Math.round(this.cropBox.width * scaleX),
                height: Math.round(this.cropBox.height * scaleY)
            };
        }

        try {
            this.showProcessingStatus('Starting processing...');

            const result = await this.api.processVideo(this.currentVideoId, options);
            this.currentJobId = result.job_id;

            this.pollProcessingStatus();
        } catch (error) {
            console.error('Failed to start processing:', error);
            this.hideProcessingStatus();
            alert('Failed to start processing: ' + error.message);
        }
    }

    pollProcessingStatus() {
        this.processingPollInterval = setInterval(async () => {
            try {
                const status = await this.api.getProcessingStatus(this.currentJobId);

                if (status.status === 'completed') {
                    clearInterval(this.processingPollInterval);
                    this.showProcessingStatus('Processing complete!', 100);

                    setTimeout(() => {
                        this.hideProcessingStatus();
                        alert('Video processed successfully');
                        this.exitProEditor();
                    }, 2000);
                } else if (status.status === 'failed') {
                    clearInterval(this.processingPollInterval);
                    this.hideProcessingStatus();
                    alert('Processing failed: ' + (status.error || 'Unknown error'));
                } else {
                    const progress = status.progress || 0;
                    this.showProcessingStatus(`Processing... ${progress}%`, progress);
                }
            } catch (error) {
                console.error('Failed to get processing status:', error);
                clearInterval(this.processingPollInterval);
                this.hideProcessingStatus();
            }
        }, 1000);
    }

    showProcessingStatus(message, progress = 0) {
        const statusDiv = this.editor.querySelector('#editorStatus');
        const messageDiv = statusDiv.querySelector('.status-message');
        const progressFill = statusDiv.querySelector('.progress-fill');

        messageDiv.textContent = message;
        progressFill.style.width = `${progress}%`;
        statusDiv.style.display = 'block';
    }

    hideProcessingStatus() {
        const statusDiv = this.editor.querySelector('#editorStatus');
        statusDiv.style.display = 'none';
    }

    // ============ Keyboard Shortcuts ============

    handleEditorKeyboard(e) {
        if (!this.editor || !this.editor.classList.contains('active')) return;

        switch (e.key.toLowerCase()) {
            case 'i':
                e.preventDefault();
                this.setInPoint();
                break;
            case 'o':
                e.preventDefault();
                this.setOutPoint();
                break;
            case 'c':
                e.preventDefault();
                this.toggleCrop();
                break;
            case ' ':
                e.preventDefault();
                const video = this.editor.querySelector('#editorVideoPlayer');
                if (video.paused) {
                    video.play();
                } else {
                    video.pause();
                }
                break;
            case 'escape':
                e.preventDefault();
                this.exitProEditor();
                break;
        }
    }

    // ============ Exit Editor ============

    async exitProEditor() {
        if (this.processingPollInterval) {
            clearInterval(this.processingPollInterval);
        }

        if (this.editor) {
            this.editor.classList.remove('active');
            setTimeout(() => {
                if (this.editor && this.editor.parentNode) {
                    this.editor.parentNode.removeChild(this.editor);
                }
            }, 300);
        }

        this.editor = null;
        this.currentVideoId = null;
        this.currentVideoName = null;
        this.currentVideoPath = null;
        this.inPoint = null;
        this.outPoint = null;
        this.duration = 0;
        this.cropEnabled = false;
        this.cropBox = null;
        this.cropPreset = null;

        // Refresh video list to show newly created videos
        if (this.app && typeof this.app.refreshCurrentFolder === 'function') {
            await this.app.refreshCurrentFolder();
        }
    }
}

// Export as global
window.VideoEditorModule = VideoEditorModule;
