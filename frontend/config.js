// Frontend configuration for local vs remote mode
window.CLIPPER_CONFIG = {
    // API URL - can be overridden by environment
    apiUrl: window.location.origin,
    
    // Local mode settings - will be loaded from server /mode endpoint
    localMode: {
        enabled: false,
        fallbackToStreaming: true // Fall back to HTTP if local file fails
    }
};