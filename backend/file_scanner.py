import os
from pathlib import Path
from typing import List, Dict, Any, Optional
from config import config
import mimetypes

class FileScanner:
    def __init__(self):
        self.video_extensions = {'.mp4', '.mov', '.avi', '.mkv', '.wmv', '.flv', '.webm'}
        self.image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}  # ✅ NEW
        
    def is_video_file(self, file_path: Path) -> bool:
        """Check if file is a video based on extension"""
        return file_path.suffix.lower() in self.video_extensions
    
    def is_image_file(self, file_path: Path) -> bool:
        """Check if file is an image based on extension"""
        return file_path.suffix.lower() in self.image_extensions
    
    def get_media_type(self, file_path: Path) -> Optional[str]:
        """Determine media type: 'video', 'image', or None"""
        if self.is_video_file(file_path):
            return 'video'
        elif self.is_image_file(file_path):
            return 'image'
        return None
    
    def should_exclude_folder(self, folder_name: str) -> bool:
        """Check if folder should be excluded based on config"""
        return folder_name in config.excluded_folders or folder_name.startswith('.')
    
    def get_file_info(self, file_path: Path) -> Dict[str, Any]:
        """Get basic file information"""
        stat = file_path.stat()
        return {
            'path': str(file_path),
            'name': file_path.name,
            'size': stat.st_size,
            'modified': stat.st_mtime,
            'extension': file_path.suffix.lower()
        }
    
    def scan_directory(self, directory: Path = None) -> Dict[str, Any]:
        """Scan directory for video files and return organized structure"""
        if directory is None:
            directory = config.root_directory
            
        if not directory.exists():
            return {
                'error': f"Directory does not exist: {directory}",
                'categories': {},
                'total_videos': 0
            }
        
        categories = {}
        total_videos = 0
        
        try:
            # Scan subdirectories as categories
            for item in directory.iterdir():
                if item.is_dir() and not self.should_exclude_folder(item.name):
                    category_videos = self._scan_category(item)
                    if category_videos:  # Only include categories with videos
                        categories[item.name] = {
                            'path': str(item),
                            'videos': category_videos,
                            'count': len(category_videos)
                        }
                        total_videos += len(category_videos)
            
            # Also scan root directory for loose videos and images
            root_files = []
            for item in directory.iterdir():
                if item.is_file():
                    # Check if file is a supported media type
                    media_type = self.get_media_type(item)
                    if media_type is None:
                        continue  # Skip unsupported files
                    
                    file_info = self.get_file_info(item)
                    file_info['media_type'] = media_type  # ✅ Include media type
                    root_files.append(file_info)
            
            if root_files:
                categories['_root'] = {
                    'path': str(directory),
                    'videos': root_files,
                    'count': len(root_files)
                }
                total_videos += len(root_files)
                
        except PermissionError:
            return {
                'error': f"Permission denied accessing: {directory}",
                'categories': {},
                'total_videos': 0
            }
        
        return {
            'root_directory': str(directory),
            'categories': categories,
            'total_videos': total_videos,
            'category_count': len(categories)
        }
    
    def _scan_category(self, category_path: Path) -> List[Dict[str, Any]]:
        """Scan a single category folder for videos and images, including all subfolders"""
        files = []

        try:
            for item in category_path.rglob('*'):
                if item.is_file():
                    # Check if file is a supported media type
                    media_type = self.get_media_type(item)
                    if media_type is None:
                        continue  # Skip unsupported files
                    
                    file_info = self.get_file_info(item)
                    file_info['media_type'] = media_type  # ✅ NEW: Add media type

                    # Calculate relative path and subcategory structure
                    relative_path = item.relative_to(category_path)
                    file_info['relative_path'] = str(relative_path)
                    file_info['category'] = category_path.name

                    # Extract subfolder structure
                    if len(relative_path.parts) > 1:
                        # File is in subfolder(s)
                        subfolder_parts = relative_path.parts[:-1]  # Exclude filename
                        file_info['subcategory'] = '/'.join(subfolder_parts)
                        file_info['display_path'] = f"{category_path.name}/{'/'.join(subfolder_parts)}"
                    else:
                        # File is directly in category root
                        file_info['subcategory'] = None
                        file_info['display_path'] = category_path.name

                    # Add breadcrumb information for UI
                    breadcrumbs = [category_path.name]
                    if file_info['subcategory']:
                        breadcrumbs.extend(subfolder_parts)
                    file_info['breadcrumbs'] = breadcrumbs

                    files.append(file_info)
        except PermissionError:
            pass  # Skip directories we can't access

        return files

    def _scan_category_folder_only(self, category_path: Path) -> List[Dict[str, Any]]:
        """Scan only the direct category folder for videos and images, excluding subfolders"""
        files = []

        try:
            # Only scan direct files in the category folder, not subfolders
            for item in category_path.iterdir():
                if item.is_file():
                    # Check if file is a supported media type (video or image)
                    media_type = self.get_media_type(item)
                    if media_type is None:
                        continue  # Skip unsupported files
                    
                    file_info = self.get_file_info(item)
                    file_info['media_type'] = media_type  # ✅ Include media type

                    # Set relative path and category info
                    file_info['relative_path'] = item.name
                    file_info['category'] = category_path.name
                    file_info['subcategory'] = None  # No subfolders for folder-only scan
                    file_info['display_path'] = category_path.name

                    # Simple breadcrumb for direct category
                    file_info['breadcrumbs'] = [category_path.name]

                    files.append(file_info)
        except PermissionError:
            pass  # Skip directories we can't access

        return files

    def scan_folder_hierarchical(self, folder_path: Path, parent_category: str = None) -> Dict[str, Any]:
        """Scan a folder hierarchically: direct videos + available subfolders for scanning"""
        result = {
            'folder_name': folder_path.name,
            'folder_path': str(folder_path),
            'parent_category': parent_category,
            'direct_videos': [],
            'available_subfolders': [],
            'total_direct_videos': 0,
            'total_subfolders': 0,
            'scanned_at': None
        }

        try:
            import time
            result['scanned_at'] = time.time()

            # Get direct videos and images in this folder only
            for item in folder_path.iterdir():
                if item.is_file():
                    # Check if file is a supported media type (video or image)
                    media_type = self.get_media_type(item)
                    if media_type is None:
                        continue  # Skip unsupported files
                    
                    file_info = self.get_file_info(item)
                    file_info['media_type'] = media_type  # ✅ Include media type

                    # Set proper category and subcategory based on hierarchy
                    if parent_category:
                        file_info['category'] = parent_category
                        file_info['subcategory'] = folder_path.name
                        file_info['relative_path'] = f"{folder_path.name}/{item.name}"
                        file_info['display_path'] = f"{parent_category}/{folder_path.name}"
                    else:
                        file_info['category'] = folder_path.name
                        file_info['subcategory'] = None
                        file_info['relative_path'] = item.name
                        file_info['display_path'] = folder_path.name

                    # Build breadcrumbs
                    breadcrumbs = []
                    if parent_category:
                        breadcrumbs.append(parent_category)
                    breadcrumbs.append(folder_path.name)
                    file_info['breadcrumbs'] = breadcrumbs

                    result['direct_videos'].append(file_info)

            result['total_direct_videos'] = len(result['direct_videos'])

            # Get available subfolders (not scanned yet, just listed for scanning)
            for item in folder_path.iterdir():
                if item.is_dir() and not self.should_exclude_folder(item.name):
                    # Count direct videos and images in subfolder (for preview)
                    direct_video_count = 0
                    has_subfolders = False

                    try:
                        for subitem in item.iterdir():
                            if subitem.is_file():
                                # Check if file is supported media type
                                media_type = self.get_media_type(subitem)
                                if media_type is not None:
                                    direct_video_count += 1
                            elif subitem.is_dir() and not self.should_exclude_folder(subitem.name):
                                has_subfolders = True
                    except PermissionError:
                        pass

                    subfolder_info = {
                        'name': item.name,
                        'path': str(item),
                        'full_category_path': f"{folder_path.name}/{item.name}" if parent_category else item.name,
                        'direct_video_count': direct_video_count,
                        'has_subfolders': has_subfolders,
                        'is_scanned': False,  # Will be updated from database
                        'scan_status': 'not_scanned'
                    }

                    result['available_subfolders'].append(subfolder_info)

            result['total_subfolders'] = len(result['available_subfolders'])

        except PermissionError:
            result['error'] = f"Permission denied accessing {folder_path}"

        return result

    def get_category_structure(self, category_path: Path) -> Dict[str, Any]:
        """Get hierarchical folder structure for a category"""
        structure = {'name': category_path.name, 'path': str(category_path), 'children': {}, 'video_count': 0}
        
        try:
            for item in category_path.rglob('*'):
                if item.is_file():
                    # Check if file is a supported media type (video or image)
                    media_type = self.get_media_type(item)
                    if media_type is None:
                        continue  # Skip unsupported files
                    
                    # Count videos and images in this category
                    structure['video_count'] += 1
                    
                    # Build folder hierarchy
                    relative_path = item.relative_to(category_path)
                    current_level = structure['children']
                    
                    # Navigate through folder hierarchy
                    for part in relative_path.parts[:-1]:  # Exclude filename
                        if part not in current_level:
                            current_level[part] = {
                                'name': part,
                                'children': {},
                                'video_count': 0,
                                'path': str(category_path / part)
                            }
                        current_level[part]['video_count'] += 1
                        current_level = current_level[part]['children']
                        
        except PermissionError:
            pass
            
        return structure

    def get_all_subfolders(self, directory: Path = None) -> Dict[str, List[str]]:
        """Get all unique subfolder paths across all categories"""
        if directory is None:
            directory = config.root_directory
            
        category_subfolders = {}
        
        for item in directory.iterdir():
            if item.is_dir() and not self.should_exclude_folder(item.name):
                subfolders = set()
                
                try:
                    for subitem in item.rglob('*'):
                        if subitem.is_dir() and not self.should_exclude_folder(subitem.name):
                            relative_path = subitem.relative_to(item)
                            subfolders.add(str(relative_path))
                except PermissionError:
                    pass
                    
                category_subfolders[item.name] = sorted(list(subfolders))
                
        return category_subfolders
    
    def get_video_by_path(self, video_path: str) -> Dict[str, Any]:
        """Get specific video information by path"""
        path = Path(video_path)
        if path.exists() and self.is_video_file(path):
            return self.get_file_info(path)
        return None

# Global scanner instance
scanner = FileScanner()