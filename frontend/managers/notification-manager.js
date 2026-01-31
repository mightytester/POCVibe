/**
 * NotificationManager - Manages application notifications and toasts
 */
class NotificationManager {
    constructor(app) {
        this.app = app;
        this.containerId = 'notification-container';
    }

    showNotification(message, type = 'success', duration = 3000) {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        // Auto-dismiss notification
        if (duration > 0) {
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }, duration);
        }
    }

    dismissAllNotifications() {
        // Remove all active notifications
        const container = document.getElementById(this.containerId);
        if (container) {
            const notifications = container.querySelectorAll('.notification');
            notifications.forEach(notif => {
                notif.classList.add('fade-out');
                setTimeout(() => notif.remove(), 300);
            });
        }
    }

    setupEventListeners() {
        // Notification close button (if exists)
        const closeNotifBtn = document.getElementById('closeNotification');
        if (closeNotifBtn) {
            closeNotifBtn.onclick = () => this.dismissAllNotifications();
        }
    }
}

window.NotificationManager = NotificationManager;
