#!/usr/bin/env python3
"""
Debug startup script for Clipper Video Manager
Enables auto-reload for development - server restarts when code changes
"""

import subprocess
import sys
import os
from pathlib import Path

def print_logo():
    """Display ASCII art logo with debug indicator"""
    logo = """
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║    ██████╗██╗     ██╗██████╗ ██████╗ ███████╗██████╗      ║
    ║   ██╔════╝██║     ██║██╔══██╗██╔══██╗██╔════╝██╔══██╗     ║
    ║   ██║     ██║     ██║██████╔╝██████╔╝█████╗  ██████╔╝     ║
    ║   ██║     ██║     ██║██╔═══╝ ██╔═══╝ ██╔══╝  ██╔══██╗     ║
    ║   ╚██████╗███████╗██║██║     ██║     ███████╗██║  ██║     ║
    ║    ╚═════╝╚══════╝╚═╝╚═╝     ╚═╝     ╚══════╝╚═╝  ╚═╝     ║
    ║                                                           ║
    ║     🔧 DEBUG MODE - Auto-Reload Enabled 🔧                ║
    ║        Server restarts on code changes                    ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    """
    print(logo)

def main():
    """Start Clipper server in debug mode with auto-reload"""

    # Display logo
    print_logo()

    # Check if we're in the right directory
    backend_dir = Path("backend")
    if not backend_dir.exists():
        print("❌ Error: Run this script from the project root directory")
        print("   Should contain: backend/ and frontend/ directories")
        sys.exit(1)

    # Set debug environment variables
    os.environ['CLIPPER_DEBUG'] = 'true'
    os.environ['CLIPPER_RELOAD'] = 'true'

    print("🔧 DEBUG MODE ENABLED")
    print("   • Auto-reload: ON (server restarts on file changes)")
    print("   • Debug logging: ON")
    print()

    # Check configuration
    video_path = os.getenv('CLIPPER_ROOT_DIRECTORY')
    if video_path:
        print(f"📁 Video directory: {video_path}")
    else:
        print("📁 Video directory: ./videos (default)")

    print()
    print("🎬 Starting server with auto-reload...")
    print("   Web Interface: http://localhost:8000")
    print("   API Docs: http://localhost:8000/docs")
    print()
    print("💡 Auto-reload watches for changes in:")
    print("   • backend/*.py")
    print("   • backend/routers/*.py")
    print("   • backend/schemas/*.py")
    print()
    print("⚠️  Note: Frontend JS/CSS changes don't need server restart")
    print("   Just refresh your browser (Ctrl+Shift+R for hard refresh)")
    print()
    print("Press Ctrl+C to stop")
    print("-" * 50)

    # Start the server
    try:
        subprocess.run([sys.executable, "main.py"], cwd="backend")
    except KeyboardInterrupt:
        print("\n👋 Debug server stopped")
    except FileNotFoundError:
        print("❌ Error: backend/main.py not found")
        sys.exit(1)

if __name__ == "__main__":
    main()
