import os
import json
from pathlib import Path
from typing import List, Dict, Optional

class Config:
    """Configuration with multi-root support"""

    def __init__(self):
        self.app_root = Path(__file__).parent.parent
        self.roots_config_path = self.app_root / 'roots.json'
        
        # Load roots configuration
        self.roots = []
        self.current_root_path = None
        self.current_root_layout = 'horizontal'
        self.remember_last_root = True
        
        self._load_roots_config()
        self._set_active_root()

        # Server settings - rarely need to change these
        self.server_host = os.getenv('CLIPPER_HOST', '0.0.0.0')
        self.server_port = int(os.getenv('CLIPPER_PORT', '8000'))
        self.debug = os.getenv('CLIPPER_DEBUG', 'false').lower() in ('true', '1', 'yes')
        self.reload = os.getenv('CLIPPER_RELOAD', 'false').lower() in ('true', '1', 'yes')

        # Folders to exclude from scanning
        excluded_default = 'Temp,.DS_Store,.clipper,@eaDir'
        excluded_env = os.getenv('CLIPPER_EXCLUDED_FOLDERS', excluded_default)
        self.excluded_folders = [f.strip() for f in excluded_env.split(',') if f.strip()]

        # CORS origins - defaults work for local development
        cors_default = f'http://localhost:{self.server_port},http://127.0.0.1:{self.server_port}'
        cors_env = os.getenv('CLIPPER_CORS_ORIGINS', cors_default)
        self.cors_origins = [origin.strip() for origin in cors_env.split(',') if origin.strip()]

    def _load_roots_config(self):
        """Load roots configuration from roots.json"""
        try:
            if self.roots_config_path.exists():
                with open(self.roots_config_path, 'r') as f:
                    config_data = json.load(f)
                    self.roots = config_data.get('roots', [])
                    self.remember_last_root = config_data.get('rememberLastRoot', True)
                    print(f"✅ Loaded {len(self.roots)} roots from {self.roots_config_path}")
            else:
                # Fallback to environment variable if roots.json doesn't exist
                root_path = os.getenv('CLIPPER_ROOT_DIRECTORY', './videos')
                self.roots = [
                    {
                        'name': 'Default',
                        'path': root_path,
                        'default': True,
                        'layout': 'horizontal'
                    }
                ]
                print(f"⚠️  roots.json not found, using CLIPPER_ROOT_DIRECTORY: {root_path}")
        except Exception as e:
            print(f"❌ Error loading roots.json: {e}")
            root_path = os.getenv('CLIPPER_ROOT_DIRECTORY', './videos')
            self.roots = [
                {
                    'name': 'Default',
                    'path': root_path,
                    'default': True,
                    'layout': 'horizontal'
                }
            ]

    def _set_active_root(self):
        """Set the active root - prefer default, fallback to first"""
        if not self.roots:
            raise ValueError("No roots configured in roots.json")
        
        # Find default root
        default_root = next((r for r in self.roots if r.get('default')), None)
        active_root = default_root or self.roots[0]
        
        root_path = Path(active_root['path'])
        root_path.mkdir(parents=True, exist_ok=True)
        
        self.current_root_path = root_path
        self.current_root_layout = active_root.get('layout', 'horizontal')
        self.root_directory = root_path
        
        # Database path - in .clipper subfolder of active root
        default_db_path = self.current_root_path / '.clipper' / 'clipper.db'
        self.database_path = os.getenv('CLIPPER_DB_PATH', str(default_db_path))
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Ensure audio directory exists
        audios_dir = self.current_root_path / '.clipper' / 'Audios'
        audios_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"📁 Active root: {active_root['name']} ({self.current_root_path})")
        print(f"📐 Layout: {self.current_root_layout}")

    def set_active_root_by_name(self, root_name: str):
        """Switch to a different root by name"""
        root = next((r for r in self.roots if r['name'] == root_name), None)
        if not root:
            raise ValueError(f"Root '{root_name}' not found")
        
        root_path = Path(root['path'])
        root_path.mkdir(parents=True, exist_ok=True)
        
        self.current_root_path = root_path
        self.current_root_layout = root.get('layout', 'horizontal')
        self.root_directory = root_path
        
        # Update database path for new root
        default_db_path = self.current_root_path / '.clipper' / 'clipper.db'
        self.database_path = str(default_db_path)
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        
        print(f"🔄 Switched to root: {root['name']} ({self.current_root_path})")
        print(f"📐 Layout: {self.current_root_layout}")

    def get_roots_list(self) -> List[Dict]:
        """Get list of available roots"""
        return [
            {
                'name': r['name'],
                'path': r['path'],
                'default': r.get('default', False),
                'layout': r.get('layout', 'horizontal')
            }
            for r in self.roots
        ]

# Create global config instance
config = Config()