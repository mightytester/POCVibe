/**
 * KeyboardShortcutsModule - Handles all keyboard shortcuts and help modal
 *
 * Manages:
 * - Global keyboard shortcut registration and handling
 * - Search box focus shortcut (/)
 * - Help modal display (Ctrl+Alt+h)
 * - Navigation shortcuts (Backspace, Delete, Ctrl+z)
 * - Platform-specific modifier key handling (Cmd on Mac, Ctrl elsewhere)
 * - Shortcuts panel toggle (for video editor)
 *
 * Usage:
 *   const keyboardModule = new KeyboardShortcutsModule(app);
 *   // Shortcuts are automatically set up on instantiation
 */

class KeyboardShortcutsModule {
    constructor(app) {
        this.app = app;
        this.keyboardShortcuts = null; // Store shortcuts configuration

        // Setup shortcuts after a brief delay to ensure DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupKeyboardShortcuts());
        } else {
            this.setupKeyboardShortcuts();
        }
    }

    /**
     * Global keyboard shortcuts system
     * Extensible configuration for adding new shortcuts
     */
    setupKeyboardShortcuts() {
        const shortcuts = {
            '/': {
                description: 'Focus search box',
                action: () => this.focusSearch(),
                preventDefault: true
            },
            'Ctrl+Alt+h': {
                description: 'Show keyboard shortcuts help',
                action: () => this.showKeyboardShortcutsHelp(shortcuts),
                preventDefault: true
            },
            'backspace': {
                description: 'Go back in Explorer view',
                action: () => {
                    if (this.app.currentView === 'explorer' && this.app.currentCategory) {
                        this.app.navigateToCategory(null);
                    }
                },
                preventDefault: true
            },
            'delete': {
                description: 'Go back in Explorer view',
                action: () => {
                    if (this.app.currentView === 'explorer' && this.app.currentCategory) {
                        this.app.navigateToCategory(null);
                    }
                },
                preventDefault: true
            },
            'Ctrl+z': {
                description: 'Go back in Explorer view (alternative)',
                action: () => {
                    if (this.app.currentView === 'explorer' && this.app.currentCategory) {
                        this.app.navigateToCategory(null);
                    }
                },
                preventDefault: true
            }
        };

        // Store shortcuts for help modal
        this.keyboardShortcuts = shortcuts;

        document.addEventListener('keydown', (e) => {
            // Skip if typing in input/textarea
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            // Skip if any modal is open
            if (document.getElementById('tagModal').style.display === 'flex' ||
                document.getElementById('actorModal').style.display === 'flex' ||
                document.getElementById('moveModal').style.display === 'flex' ||
                document.getElementById('renameModal').style.display === 'flex' ||
                document.getElementById('thumbnailModal').style.display === 'flex' ||
                document.getElementById('videoModal').style.display === 'flex') {
                return;
            }

            // Build shortcut key string (e.g., "Ctrl+k", "/", "Ctrl+h")
            const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
            const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

            let shortcutKey = '';
            if (ctrlKey) shortcutKey += 'Ctrl+';
            if (e.altKey) shortcutKey += 'Alt+';
            if (e.shiftKey) shortcutKey += 'Shift+';

            // Normalize the key - handle both e.key and e.code for better compatibility
            let keyChar = e.key.toLowerCase();

            // Some browsers may send different values for e.key when Alt is pressed
            // Fallback to e.code if e.key is not a simple character
            if (keyChar.length > 1 && e.code.startsWith('Key')) {
                keyChar = e.code.replace('Key', '').toLowerCase();
            }

            shortcutKey += keyChar;

            // Debug log for troubleshooting (remove after testing)
            if ((ctrlKey && e.altKey) || e.key === '/') {
                console.log(`⌨️ Keyboard shortcut detected: "${shortcutKey}" (key: "${e.key}", code: "${e.code}")`);
            }

            // Check if this shortcut exists
            const shortcut = shortcuts[shortcutKey];
            if (shortcut) {
                if (shortcut.preventDefault) {
                    e.preventDefault();
                }
                console.log(`✅ Executing shortcut: ${shortcutKey}`);
                shortcut.action();
            }
        });

        console.log('⌨️ Keyboard shortcuts enabled:', Object.keys(shortcuts).join(', '));
    }

    /**
     * Focus the search input box and select all text
     */
    focusSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
            console.log('🔍 Search box focused (keyboard shortcut)');
        }
    }

    /**
     * Show keyboard shortcuts help modal with all available shortcuts
     * @param {object} shortcuts - Shortcuts configuration object
     */
    showKeyboardShortcutsHelp(shortcuts) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = 'shortcutsHelpModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create modal content
        const content = document.createElement('div');
        content.style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 12px;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        `;

        // Build shortcuts list
        const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') >= 0;
        const ctrlLabel = isMac ? '⌘' : 'Ctrl';
        const altLabel = isMac ? '⌥' : 'Alt';

        let shortcutsHTML = `
            <h2 style="margin-top: 0; color: #1f2937; font-size: 24px;">⌨️ Keyboard Shortcuts</h2>
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead>
                    <tr style="border-bottom: 2px solid #e5e7eb;">
                        <th style="text-align: left; padding: 12px 8px; color: #6b7280; font-weight: 600;">Shortcut</th>
                        <th style="text-align: left; padding: 12px 8px; color: #6b7280; font-weight: 600;">Action</th>
                    </tr>
                </thead>
                <tbody>
        `;

        Object.entries(shortcuts).forEach(([key, config]) => {
            // Replace modifier keys with platform-specific labels
            let displayKey = key.replace('Ctrl+', ctrlLabel + '+').replace('Alt+', altLabel + '+');
            shortcutsHTML += `
                <tr style="border-bottom: 1px solid #f3f4f6;">
                    <td style="padding: 12px 8px;">
                        <kbd style="
                            background: #f3f4f6;
                            padding: 4px 12px;
                            border-radius: 6px;
                            font-family: monospace;
                            font-size: 14px;
                            font-weight: 600;
                            color: #374151;
                            border: 1px solid #d1d5db;
                            display: inline-block;
                        ">${displayKey}</kbd>
                    </td>
                    <td style="padding: 12px 8px; color: #4b5563;">${config.description}</td>
                </tr>
            `;
        });

        shortcutsHTML += `
                </tbody>
            </table>
            <div style="margin-top: 20px; padding: 16px; background: #f0f9ff; border-radius: 8px; border: 1px solid #bae6fd;">
                <strong style="color: #0369a1;">💡 Quick Navigation:</strong>
                <p style="margin: 8px 0 0 0; color: #0c4a6e; line-height: 1.6;">
                    Type any letter while viewing videos to jump to the first matching title. The search buffer resets after 1 second of inactivity.
                </p>
            </div>
            <div style="margin-top: 16px; padding: 16px; background: #fef3c7; border-radius: 8px; border: 1px solid #fde68a;">
                <strong style="color: #92400e;">🎬 Video Player Shortcuts:</strong>
                <p style="margin: 8px 0 0 0; color: #78350f; line-height: 1.6;">
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">Space</kbd> Play/Pause &nbsp;•&nbsp;
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">←→</kbd> Seek 5s &nbsp;•&nbsp;
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">L</kbd> Toggle loop &nbsp;•&nbsp;
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">T</kbd> Capture thumbnail &nbsp;•&nbsp;
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">C</kbd> Copy frame to clipboard &nbsp;•&nbsp;
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">S</kbd> Quick face search &nbsp;•&nbsp;
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">A</kbd> Auto-scan faces &nbsp;•&nbsp;
                    <kbd style="background: #fff; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 13px; border: 1px solid #d1d5db;">X</kbd> Face extraction
                </p>
            </div>
            <button id="closeShortcutsHelp" style="
                margin-top: 20px;
                width: 100%;
                padding: 12px;
                background: #3b82f6;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.2s;
            " onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                Got it!
            </button>
        `;

        content.innerHTML = shortcutsHTML;
        modal.appendChild(content);
        document.body.appendChild(modal);

        // Close handlers
        const closeModal = () => {
            modal.remove();
        };

        document.getElementById('closeShortcutsHelp').onclick = closeModal;
        modal.onclick = (e) => {
            if (e.target === modal) closeModal();
        };

        // Close on Escape
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        console.log('❓ Showing keyboard shortcuts help');
    }

    /**
     * Toggle keyboard shortcuts panel visibility (used in Pro Video Editor)
     */
    toggleKeyboardShortcuts() {
        const panel = document.getElementById('proShortcutsPanel');
        const toggleBtn = document.getElementById('toggleShortcutsBtn');

        if (!panel || !toggleBtn) {
            console.warn('⚠️ Shortcuts panel or toggle button not found');
            return;
        }

        const isExpanded = panel.classList.contains('expanded');

        if (isExpanded) {
            // Collapse
            panel.classList.remove('expanded');
            panel.style.display = 'none';
            toggleBtn.classList.remove('active');
        } else {
            // Expand
            panel.style.display = 'block';
            // Use setTimeout to allow display change to take effect before transition
            setTimeout(() => {
                panel.classList.add('expanded');
            }, 10);
            toggleBtn.classList.add('active');
        }
    }
}

// Export as global for use in app.js
window.KeyboardShortcutsModule = KeyboardShortcutsModule;
