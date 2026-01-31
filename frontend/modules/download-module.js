/**
 * DownloadModule - Download functionality
 * Handles M3U8, SOCKS proxy, Quick download, and Batch download
 */
class DownloadModule {
    constructor(app) {
        this.app = app

        // Quick download state
        this.quickDownloadReferer = null
        this.pendingClipboardUrl = null
    }

    // ============ M3U8 Download ============

    showDownloadM3U8Modal() {
        const modal = document.getElementById('downloadM3U8Modal')
        modal.style.display = 'flex'

        document.getElementById('m3u8StartTime').value = '00:00:00'
        document.getElementById('m3u8EndTime').value = '00:00:00'

        this.app.hideDuplicatesReviewIfActive()
        this.loadActiveDownloads()
    }

    hideDownloadM3U8Modal() {
        const modal = document.getElementById('downloadM3U8Modal')
        modal.style.display = 'none'
    }

    async startM3U8Download() {
        const url = document.getElementById('m3u8Url').value.trim()
        const startTime = document.getElementById('m3u8StartTime').value.trim()
        const endTime = document.getElementById('m3u8EndTime').value.trim()
        const filename = document.getElementById('m3u8Filename').value.trim()
        const useFallback = document.getElementById('m3u8UseFallback').checked

        if (!url) {
            console.log('Please enter a URL')
            return
        }

        if (!startTime || !endTime) {
            console.log('Please enter start and end times')
            return
        }

        const timeRegex = /^\d{2}:\d{2}:\d{2}$/
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            console.log('Time must be in HH:MM:SS format')
            return
        }

        try {
            const response = await fetch(`${this.app.apiBase}/api/downloads/m3u8`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    start_time: startTime,
                    end_time: endTime,
                    filename: filename || null,
                    use_ytdlp_fallback: useFallback
                })
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`Download started: ${data.filename}`)
                this.loadActiveDownloads()
            } else {
                console.log(`Failed to start download: ${data.detail}`)
            }

        } catch (error) {
            console.error('Error starting download:', error)
            console.log('Failed to start download')
        }
    }

    async loadActiveDownloads() {
        try {
            const response = await fetch(`${this.app.apiBase}/api/downloads?active_only=false`)
            const data = await response.json()

            const container = document.getElementById('activeDownloadsList')

            if (!data.downloads || data.downloads.length === 0) {
                container.innerHTML = ''
                container.style.display = 'none'
                return
            }

            container.style.display = 'block'

            const lastDownload = data.downloads[0]
            container.innerHTML = `
                <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-top: 10px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">Last Download</h4>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 13px; font-weight: 500; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${lastDownload.filename}
                            </div>
                            <div style="font-size: 11px; color: #666;">
                                ${this.formatDownloadStatus(lastDownload.status)}
                            </div>
                        </div>
                        <div style="margin-left: 10px;">
                            ${this.getStatusIcon(lastDownload.status)}
                        </div>
                    </div>
                </div>
            `

        } catch (error) {
            console.error('Error loading downloads:', error)
        }
    }

    formatDownloadStatus(status) {
        const statusMap = {
            'pending': 'Waiting to start...',
            'downloading': 'Downloading...',
            'completed': 'Completed',
            'failed': 'Failed'
        }
        return statusMap[status] || status
    }

    getStatusIcon(status) {
        const iconMap = {
            'pending': '...',
            'downloading': '>>',
            'completed': 'OK',
            'failed': 'X'
        }
        return iconMap[status] || ''
    }

    // ============ SOCKS Proxy Download ============

    showDownloadSOCKSModal() {
        const modal = document.getElementById('downloadSOCKSModal')
        modal.style.display = 'flex'

        document.getElementById('socksUrl').value = ''
        document.getElementById('socksFilename').value = ''
        document.getElementById('socksProxy').value = ''
        document.getElementById('socksReferer').value = ''

        this.app.hideDuplicatesReviewIfActive()
        this.loadActiveSOCKSDownloads()
    }

    hideDownloadSOCKSModal() {
        const modal = document.getElementById('downloadSOCKSModal')
        modal.style.display = 'none'
    }

    async startSOCKSDownload() {
        const url = document.getElementById('socksUrl').value.trim()
        const filename = document.getElementById('socksFilename').value.trim()
        const proxyUrl = document.getElementById('socksProxy').value.trim()
        const referer = document.getElementById('socksReferer').value.trim()

        if (!url) {
            console.log('Please enter a download URL')
            return
        }

        try {
            const payload = {
                url,
                filename: filename || null,
                proxy_url: proxyUrl || null,
                referer: referer || null
            }

            const response = await fetch(`${this.app.apiBase}/api/socks-downloads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`SOCKS download started: ${data.filename}`)
                document.getElementById('socksUrl').value = ''
                this.loadActiveSOCKSDownloads()
            } else {
                console.log(`Failed to start download: ${data.detail}`)
            }

        } catch (error) {
            console.error('Error starting SOCKS download:', error)
            console.log('Failed to start download')
        }
    }

    async loadActiveSOCKSDownloads() {
        try {
            const response = await fetch(`${this.app.apiBase}/api/socks-downloads?active_only=false`)
            const data = await response.json()

            const container = document.getElementById('socksActiveDownloadsList')

            if (!data.downloads || data.downloads.length === 0) {
                container.innerHTML = ''
                container.style.display = 'none'
                return
            }

            container.style.display = 'block'

            const lastDownload = data.downloads[0]
            container.innerHTML = `
                <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-top: 10px;">
                    <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #333;">Last Download</h4>
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 13px; font-weight: 500; color: #111827; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                ${lastDownload.filename}
                            </div>
                            <div style="font-size: 11px; color: #666;">
                                ${this.formatDownloadStatus(lastDownload.status)}
                            </div>
                        </div>
                        <div style="margin-left: 10px;">
                            ${this.getStatusIcon(lastDownload.status)}
                        </div>
                    </div>
                </div>
            `

        } catch (error) {
            console.error('Error loading SOCKS downloads:', error)
        }
    }

    // ============ Quick Download ============

    showQuickDownloadModal() {
        const modal = document.getElementById('quickDownloadModal')
        modal.style.display = 'flex'

        document.getElementById('quickDownloadStatusText').textContent = 'Ready to download'
        document.getElementById('startQuickDownloadBtn').disabled = false
        document.getElementById('startQuickDownloadBtn').style.opacity = '1'

        if (!this.quickDownloadReferer) {
            this.showRefererSetupModal()
            return
        }

        navigator.clipboard.readText().then(text => {
            if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
                document.getElementById('quickDownloadUrl').value = text
                document.getElementById('quickDownloadUrl').focus()
                document.getElementById('quickDownloadUrl').select()
            }
        }).catch(() => {
            document.getElementById('quickDownloadUrl').focus()
        })

        this.app.hideDuplicatesReviewIfActive()
    }

    hideQuickDownloadModal() {
        const modal = document.getElementById('quickDownloadModal')
        modal.style.display = 'none'
    }

    showRefererSetupModal() {
        const modal = document.getElementById('refererSetupModal')
        modal.style.display = 'flex'
        document.getElementById('setupRefererInput').focus()
    }

    hideRefererSetupModal() {
        const modal = document.getElementById('refererSetupModal')
        modal.style.display = 'none'
    }

    confirmRefererSetup() {
        const referer = document.getElementById('setupRefererInput').value.trim()
        if (!referer) {
            console.log('Please enter a referer URL')
            return
        }
        this.quickDownloadReferer = referer
        this.hideRefererSetupModal()
        this.showQuickDownloadModal()
    }

    skipRefererSetup() {
        this.quickDownloadReferer = ''
        this.hideRefererSetupModal()
        this.showQuickDownloadModal()
    }

    async downloadFromClipboard() {
        try {
            const text = await navigator.clipboard.readText()

            if (!text || (!text.startsWith('http://') && !text.startsWith('https://'))) {
                console.log('No valid URL in clipboard')
                return
            }

            if (!this.quickDownloadReferer) {
                this.showRefererSetupModal()
                this.pendingClipboardUrl = text
                return
            }

            await this._executeQuickDownload(text)

        } catch (error) {
            console.error('Clipboard read error:', error)
            console.log('Unable to read clipboard')
        }
    }

    async startQuickDownload() {
        let url = document.getElementById('quickDownloadUrl').value.trim()

        if (!url) {
            try {
                const clipboardText = await navigator.clipboard.readText()
                if (clipboardText && (clipboardText.startsWith('http://') || clipboardText.startsWith('https://'))) {
                    url = clipboardText
                    document.getElementById('quickDownloadUrl').value = url
                } else {
                    console.log('No valid URL in clipboard or field')
                    return
                }
            } catch (error) {
                console.log('Please enter a download URL')
                return
            }
        }

        await this._executeQuickDownload(url)
    }

    async _executeQuickDownload(url) {
        try {
            const btn = document.getElementById('startQuickDownloadBtn')
            const statusText = document.getElementById('quickDownloadStatusText')
            btn.disabled = true
            btn.style.opacity = '0.7'
            statusText.textContent = 'Downloading...'

            const payload = {
                url,
                referer: this.quickDownloadReferer || null
            }

            const response = await fetch(`${this.app.apiBase}/api/socks-downloads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            const data = await response.json()

            if (response.ok) {
                console.log(`Downloading: ${data.filename}`)

                document.getElementById('quickDownloadUrl').value = ''
                this.pendingClipboardUrl = null

                statusText.textContent = `OK: ${data.filename}`
                btn.disabled = false
                btn.style.opacity = '1'

                setTimeout(() => {
                    statusText.textContent = 'Ready to download'
                }, 2000)
            } else {
                console.log(`Failed: ${data.detail}`)
                statusText.textContent = 'Download failed'
                btn.disabled = false
                btn.style.opacity = '1'

                setTimeout(() => {
                    statusText.textContent = 'Ready to download'
                }, 2000)
            }

        } catch (error) {
            console.error('Error starting quick download:', error)
            console.log('Failed to start download')

            const btn = document.getElementById('startQuickDownloadBtn')
            const statusText = document.getElementById('quickDownloadStatusText')
            statusText.textContent = 'Error'
            btn.disabled = false
            btn.style.opacity = '1'

            setTimeout(() => {
                statusText.textContent = 'Ready to download'
            }, 2000)
        }
    }

    // ============ Batch Download ============

    showBatchDownloadModal() {
        const modal = document.getElementById('batchDownloadModal')
        modal.style.display = 'flex'

        document.getElementById('batchDownloadStatusText').textContent = 'Ready to download'
        document.getElementById('startBatchDownloadBtn').disabled = false
        document.getElementById('startBatchDownloadBtn').style.opacity = '1'
        document.getElementById('batchDownloadProgressContainer').style.display = 'none'
        document.getElementById('batchDownloadProgressBar').style.width = '0%'
        document.getElementById('batchDownloadProgressText').textContent = '0 / 0'

        if (!this.quickDownloadReferer) {
            this.showRefererSetupModal()
            return
        }

        document.getElementById('batchDownloadUrls').focus()

        this.app.hideDuplicatesReviewIfActive()
    }

    hideBatchDownloadModal() {
        const modal = document.getElementById('batchDownloadModal')
        modal.style.display = 'none'
    }

    async startBatchDownload() {
        const textarea = document.getElementById('batchDownloadUrls').value
        const allLines = textarea.split('\n')
        const urls = allLines
            .map(url => url.trim())
            .filter(url => url && (url.startsWith('http://') || url.startsWith('https://')))

        console.log(`Batch Download: ${allLines.length} total lines, ${urls.length} valid URLs parsed`)

        if (urls.length === 0) {
            console.log('No valid URLs entered')
            return
        }

        await this._executeBatchDownload(urls)
    }

    async _executeBatchDownload(urls) {
        try {
            const btn = document.getElementById('startBatchDownloadBtn')
            const statusText = document.getElementById('batchDownloadStatusText')
            const progressContainer = document.getElementById('batchDownloadProgressContainer')
            const progressBar = document.getElementById('batchDownloadProgressBar')
            const progressText = document.getElementById('batchDownloadProgressText')

            btn.disabled = true
            btn.style.opacity = '0.7'
            statusText.textContent = `Downloading ${urls.length} video${urls.length !== 1 ? 's' : ''}...`
            progressBar.style.width = '0%'
            progressText.textContent = `0 / ${urls.length}`
            progressContainer.style.display = 'block'

            let successCount = 0
            let failureCount = 0

            for (let i = 0; i < urls.length; i++) {
                const url = urls[i]

                try {
                    const payload = {
                        url,
                        referer: this.quickDownloadReferer || null
                    }

                    const response = await fetch(`${this.app.apiBase}/api/socks-downloads`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    })

                    if (response.ok) {
                        successCount++
                    } else {
                        failureCount++
                    }
                } catch (error) {
                    failureCount++
                }

                const processed = successCount + failureCount
                const percentage = (processed / urls.length) * 100
                progressBar.style.width = percentage + '%'
                progressText.textContent = `${processed} / ${urls.length}`

                if (i < urls.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000))
                }
            }

            btn.disabled = false
            btn.style.opacity = '1'
            const totalProcessed = successCount + failureCount
            const msg = totalProcessed > 0
                ? `${successCount} downloaded${failureCount > 0 ? `, ${failureCount} failed` : ''}`
                : 'No URLs to download'
            statusText.innerHTML = msg
            console.log(`Batch Download complete: ${successCount} success, ${failureCount} failed out of ${totalProcessed} URLs processed`)

            document.getElementById('batchDownloadUrls').value = ''

            setTimeout(() => {
                statusText.textContent = 'Ready to download'
                progressContainer.style.display = 'none'
            }, 5000)

        } catch (error) {
            console.error('Error during batch download:', error)
            console.log('Failed to start batch download')

            const btn = document.getElementById('startBatchDownloadBtn')
            const statusText = document.getElementById('batchDownloadStatusText')
            statusText.textContent = 'Error'
            btn.disabled = false
            btn.style.opacity = '1'

            setTimeout(() => {
                statusText.textContent = 'Ready to download'
            }, 2000)
        }
    }
}

// Export as global
window.DownloadModule = DownloadModule
