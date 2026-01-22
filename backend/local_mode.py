"""
Local file access mode for Clipper
Simple configuration for enabling direct file:// URLs
"""

import os

class LocalModeConfig:
    """Simple configuration for local file access mode"""
    
    def __init__(self):
        # Enable local mode via environment variable
        self.enabled = os.getenv('CLIPPER_LOCAL_MODE', 'false').lower() in ('true', '1', 'yes')

# Global instance
local_mode = LocalModeConfig()