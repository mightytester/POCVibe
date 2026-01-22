#!/usr/bin/env python3
"""
Fast media organizer - uses /structure endpoint (same as explorer view).
Lists folders and lets you select which ones to organize.
"""

import asyncio
import httpx
import sys

API_BASE_URL = "http://localhost:8000"

async def get_folder_structure():
    """Get folder structure from API (fast, like explorer)"""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.get(f"{API_BASE_URL}/folder-structure")
            if response.status_code == 200:
                return response.json()
            else:
                print(f"❌ Error: {response.status_code}")
                return None
        except Exception as e:
            print(f"❌ Connection error: {e}")
            return None

async def get_videos_in_folder(folder_id):
    """Get all videos in a specific folder"""
    async with httpx.AsyncClient(timeout=30) as client:
        try:
            response = await client.get(f"{API_BASE_URL}/videos/{folder_id}")
            if response.status_code == 200:
                data = response.json()
                return data.get('videos', [])
            return []
        except Exception as e:
            print(f"❌ Error fetching videos for {folder_id}: {e}")
            return []

async def move_video(video_id, target_category):
    """Move a single video using the API"""
    async with httpx.AsyncClient(timeout=30) as client:
        payload = {
            "target_category": target_category,
            "new_name": None
        }
        try:
            response = await client.post(
                f"{API_BASE_URL}/videos/{video_id}/move",
                json=payload,
                timeout=30
            )
            return response.status_code == 200
        except:
            return False

async def organize_folder(folder_id, folder_data):
    """Organize files in a single folder"""
    gif_count = 0
    webp_count = 0
    
    # Fetch videos in this folder
    videos = await get_videos_in_folder(folder_id)
    
    if not videos:
        print(f"   No videos found")
        return gif_count, webp_count
    
    print(f"   Found {len(videos)} videos, organizing...")
    
    for video in videos:
        name = video.get('name', '').lower()
        video_id = video.get('id')
        
        if not video_id:
            continue
        
        if name.endswith('.gif'):
            success = await move_video(video_id, "GIF")
            if success:
                gif_count += 1
                print(f"  ✅ {video.get('name')}")
            else:
                print(f"  ❌ {video.get('name')}")
            await asyncio.sleep(0.05)
            
        elif name.endswith('.webp'):
            success = await move_video(video_id, "WEBP")
            if success:
                webp_count += 1
                print(f"  ✅ {video.get('name')}")
            else:
                print(f"  ❌ {video.get('name')}")
            await asyncio.sleep(0.05)
    
    return gif_count, webp_count

async def main():
    print("=" * 60)
    print("FAST MEDIA ORGANIZER")
    print("=" * 60)
    
    # Get structure
    print("\n📁 Loading folder structure...")
    structure = await get_folder_structure()
    
    if not structure or 'structure' not in structure:
        print("❌ Could not load structure")
        return
    
    folders = structure['structure']
    
    print(f"\n📂 Available folders:")
    for i, folder_name in enumerate(folders, 1):
        print(f"  {i}. {folder_name}")
    
    print("\nOptions:")
    print("  'all' - Organize ALL folders")
    print("  Or enter folder number(s): 1,2,3 or 1-5")
    
    choice = input("\nWhich folder(s)? ").strip().lower()
    
    folders_to_process = []
    
    if choice == 'all':
        folders_to_process = list(folders.keys())
    else:
        # Parse selection
        parts = choice.split(',')
        for part in parts:
            part = part.strip()
            if '-' in part:
                start, end = part.split('-')
                for i in range(int(start), int(end) + 1):
                    if i <= len(folders):
                        folders_to_process.append(list(folders.keys())[i-1])
            else:
                idx = int(part) - 1
                if idx < len(folders):
                    folders_to_process.append(list(folders.keys())[idx])
    
    if not folders_to_process:
        print("❌ No valid folders selected")
        return
    
    print(f"\n⚠️  Will organize: {', '.join(folders_to_process)}")
    confirm = input("Type YES to continue: ").strip()
    if confirm != "YES":
        print("Cancelled")
        return
    
    # Process folders
    total_gifs = 0
    total_webps = 0
    
    for folder_id in folders_to_process:
        folder_data = folders[folder_id]
        print(f"\n🎬 Processing '{folder_id}' ({folder_data.get('video_count', 0)} videos)...")
        
        gifs, webps = await organize_folder(folder_id, folder_data)
        total_gifs += gifs
        total_webps += webps
        
        print(f"   GIFs: {gifs}, WEBPs: {webps}")
    
    print(f"\n" + "=" * 60)
    print(f"✅ Total GIFs moved: {total_gifs}")
    print(f"✅ Total WEBPs moved: {total_webps}")
    print(f"=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
