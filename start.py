#!/usr/bin/env python3
"""
Simple startup script for Clipper Video Manager
Ensures dependencies are installed and starts the server
"""

import subprocess
import sys
import os
from pathlib import Path

def print_logo():
    """Display ASCII art logo"""
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
    ║        🎬 Web-Based MP4 File Manager  🎬                   ║
    ║              Lightweight • Self-Hosted                    ║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
    """
    print(logo)

def main():
    """Start Clipper server with dependency check"""

    # Display logo
    print_logo()

    # Check if we're in the right directory
    backend_dir = Path("backend")
    if not backend_dir.exists():
        print("❌ Error: Run this script from the project root directory")
        print("   Should contain: backend/ and frontend/ directories")
        sys.exit(1)

    # Check if requirements.txt exists
    requirements_file = backend_dir / "requirements.txt"
    if not requirements_file.exists():
        print("❌ Error: backend/requirements.txt not found")
        sys.exit(1)

    print("🚀 Starting Clipper Video Manager...")
    print()

    # Check configuration
    video_path = os.getenv('CLIPPER_ROOT_DIRECTORY')
    if video_path:
        print(f"📁 Video directory: {video_path}")
        if not Path(video_path).exists():
            print(f"⚠️  Warning: Directory {video_path} doesn't exist - will be created")
    else:
        print("📁 Video directory: ./videos (default)")
        print("   💡 Set CLIPPER_ROOT_DIRECTORY to use a different directory")

    print()

    # Try to install dependencies
    print("📦 Installing dependencies...")
    try:
        subprocess.run([
            sys.executable, "-m", "pip", "install", "-r", str(requirements_file)
        ], check=True)
        print("✅ Dependencies installed")
    except subprocess.CalledProcessError:
        print("⚠️  Warning: Could not install dependencies")
        print("   You may need to run: cd backend && pip install -r requirements.txt")

    print()

    print("🎬 Starting server...")
    print("   Web Interface: http://localhost:8000")
    print("   API Docs: http://localhost:8000/docs")
    print()
    print("💡 Configuration:")
    print("   Set environment variables to customize:")
    print("   • CLIPPER_ROOT_DIRECTORY=/path/to/videos")
    print("   • CLIPPER_PORT=8000")
    print("   • CLIPPER_DEBUG=true")
    print()
    print("Press Ctrl+C to stop")
    print("-" * 50)

    # Start the server
    try:
        subprocess.run([sys.executable, "main.py"], cwd="backend")
    except KeyboardInterrupt:
        print("\n👋 Clipper stopped")
    except FileNotFoundError:
        print("❌ Error: backend/main.py not found")
        sys.exit(1)

if __name__ == "__main__":
    main()