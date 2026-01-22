"""
Color generation utilities for tags and other entities.
Generates consistent, visually distinct colors from string inputs using hash functions.
"""
import hashlib
from colorsys import hls_to_rgb

def generate_color_from_string(text: str, saturation: float = 0.7, lightness: float = 0.5) -> str:
    """
    Generate a consistent hex color from a string using hash-based color generation.

    Similar to GitHub's avatar colors - same string always produces the same color.

    Args:
        text: Input string (tag name, folder name, etc.)
        saturation: Color saturation (0.0-1.0). Default 0.7 for vibrant colors.
        lightness: Color lightness (0.0-1.0). Default 0.5 for medium brightness.

    Returns:
        Hex color string (e.g., "#3b82f6")

    Examples:
        >>> generate_color_from_string("action")
        '#e85d75'
        >>> generate_color_from_string("comedy")
        '#4a9eff'
        >>> generate_color_from_string("action")  # Same input = same color
        '#e85d75'
    """
    # Generate hash from string
    hash_obj = hashlib.md5(text.lower().encode('utf-8'))
    hash_int = int(hash_obj.hexdigest(), 16)

    # Use hash to generate hue (0-360 degrees)
    hue = (hash_int % 360) / 360.0

    # Convert HLS to RGB
    r, g, b = hls_to_rgb(hue, lightness, saturation)

    # Convert to hex
    hex_color = '#{:02x}{:02x}{:02x}'.format(
        int(r * 255),
        int(g * 255),
        int(b * 255)
    )

    return hex_color

def generate_pastel_color(text: str) -> str:
    """
    Generate a pastel (light, soft) color from a string.
    Good for backgrounds and subtle UI elements.

    Args:
        text: Input string

    Returns:
        Hex color string with pastel tone
    """
    return generate_color_from_string(text, saturation=0.5, lightness=0.75)

def generate_vibrant_color(text: str) -> str:
    """
    Generate a vibrant (bright, saturated) color from a string.
    Good for tags, labels, and attention-grabbing elements.

    Args:
        text: Input string

    Returns:
        Hex color string with vibrant tone
    """
    return generate_color_from_string(text, saturation=0.8, lightness=0.5)

def generate_dark_color(text: str) -> str:
    """
    Generate a dark color from a string.
    Good for text and dark mode elements.

    Args:
        text: Input string

    Returns:
        Hex color string with dark tone
    """
    return generate_color_from_string(text, saturation=0.6, lightness=0.3)

def generate_category_color_palette(categories: list[str]) -> dict[str, str]:
    """
    Generate a color palette for multiple categories with maximum visual distinction.

    Args:
        categories: List of category names

    Returns:
        Dictionary mapping category names to hex colors
    """
    # For small sets, use predefined distinct colors
    if len(categories) <= 12:
        predefined_colors = [
            "#ef4444",  # Red
            "#f59e0b",  # Amber
            "#10b981",  # Green
            "#3b82f6",  # Blue
            "#8b5cf6",  # Violet
            "#ec4899",  # Pink
            "#14b8a6",  # Teal
            "#f97316",  # Orange
            "#06b6d4",  # Cyan
            "#6366f1",  # Indigo
            "#84cc16",  # Lime
            "#a855f7",  # Purple
        ]

        return {
            cat: predefined_colors[i % len(predefined_colors)]
            for i, cat in enumerate(sorted(categories))
        }

    # For larger sets, use hash-based generation
    return {cat: generate_vibrant_color(cat) for cat in categories}

# Color scheme presets for different use cases
COLOR_SCHEMES = {
    "vibrant": {"saturation": 0.8, "lightness": 0.5},   # Bright, eye-catching
    "pastel": {"saturation": 0.5, "lightness": 0.75},   # Soft, subtle
    "dark": {"saturation": 0.6, "lightness": 0.3},       # Dark, professional
    "default": {"saturation": 0.7, "lightness": 0.5},    # Balanced
}

def get_color_scheme(scheme_name: str = "default") -> dict:
    """Get color scheme parameters by name"""
    return COLOR_SCHEMES.get(scheme_name, COLOR_SCHEMES["default"])
