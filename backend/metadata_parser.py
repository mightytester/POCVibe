"""
Filename metadata parser with support for multiple naming formats.

Supports formats like:
- Show Name S01E01 2023 HBO.mp4
- Show Name - Episode 1 (2023) [HBO].mp4
- [HBO] Show Name - S01E01 - 2023.mp4
- 2023.Show.Name.E01.HBO.mp4
- Show_Name_S01E01_2023_HBO.mp4
- Movie Name (2023).mp4
"""

import re
import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


def parse_metadata_from_filename(filename: str) -> Dict[str, Optional[any]]:
    """
    Parse metadata from video filename using multiple regex patterns.

    Args:
        filename: Video filename (with or without extension)

    Returns:
        Dictionary with parsed metadata (series, season, episode, year, channel)
        All values are None if not found
    """
    # Remove file extension
    name = filename.rsplit('.', 1)[0] if '.' in filename else filename

    metadata = {
        'series': None,
        'season': None,
        'episode': None,
        'year': None,
        'channel': None
    }

    # Pattern 1: Standard format with SxxExx
    # Examples: "Breaking Bad S01E01 2008 AMC", "Show_Name_S02E05_2023_HBO"
    pattern1 = re.compile(
        r'^(?P<series>.*?)\s*[_\s-]*S(?P<season>\d+)E(?P<episode>\d+)\s*[_\s-]*(?P<year>\d{4})?\s*[_\s-]*(?P<channel>[\w\s]+)?$',
        re.IGNORECASE
    )

    # Pattern 2: Format with brackets for channel
    # Example: "[HBO] Show Name - S01E01 - 2023"
    pattern2 = re.compile(
        r'^\[(?P<channel>[^\]]+)\]\s*(?P<series>.*?)\s*[_\s-]*S(?P<season>\d+)E(?P<episode>\d+)\s*[_\s-]*(?P<year>\d{4})?',
        re.IGNORECASE
    )

    # Pattern 3: Format with parentheses for year
    # Example: "Show Name - Episode 1 (2023) [HBO]"
    pattern3 = re.compile(
        r'^(?P<series>.*?)\s*[_\s-]*(?:Episode|Ep|E)?\s*(?P<episode>\d+)\s*\((?P<year>\d{4})\)\s*(?:\[(?P<channel>[^\]]+)\])?',
        re.IGNORECASE
    )

    # Pattern 4: Dot-separated format
    # Example: "2023.Show.Name.S01E01.HBO"
    pattern4 = re.compile(
        r'^(?P<year>\d{4})\.(?P<series>.*?)\.S(?P<season>\d+)E(?P<episode>\d+)(?:\.(?P<channel>[\w]+))?$',
        re.IGNORECASE
    )

    # Pattern 5: Simple movie format with year
    # Example: "Movie Name (2023)", "Movie Name 2023"
    pattern5 = re.compile(
        r'^(?P<series>.*?)\s*[\(\[]*(?P<year>\d{4})[\)\]]*(?:\s*[\[\(](?P<channel>[^\]\)]+)[\]\)])?$',
        re.IGNORECASE
    )

    # Pattern 6: Episode without season
    # Example: "Show Name E01 2023 HBO"
    pattern6 = re.compile(
        r'^(?P<series>.*?)\s*[_\s-]*E(?P<episode>\d+)\s*[_\s-]*(?P<year>\d{4})?\s*[_\s-]*(?P<channel>[\w\s]+)?$',
        re.IGNORECASE
    )

    # Try each pattern
    patterns = [pattern1, pattern2, pattern3, pattern4, pattern5, pattern6]

    for pattern in patterns:
        match = pattern.match(name)
        if match:
            groups = match.groupdict()

            # Extract and clean series name
            if groups.get('series'):
                series = groups['series'].strip()
                # Replace dots and underscores with spaces
                series = series.replace('.', ' ').replace('_', ' ')
                # Remove extra whitespace
                series = ' '.join(series.split())
                metadata['series'] = series if series else None

            # Extract season (as integer)
            if groups.get('season'):
                try:
                    metadata['season'] = int(groups['season'])
                except (ValueError, TypeError):
                    pass

            # Extract episode (keep as string to support various formats)
            if groups.get('episode'):
                episode = groups['episode'].strip()
                # Format as E01, E02, etc.
                if episode.isdigit():
                    metadata['episode'] = f"E{int(episode):02d}"
                else:
                    metadata['episode'] = episode

            # Extract year (as integer)
            if groups.get('year'):
                try:
                    year = int(groups['year'])
                    # Validate year is reasonable (1900-2100)
                    if 1900 <= year <= 2100:
                        metadata['year'] = year
                except (ValueError, TypeError):
                    pass

            # Extract channel/network
            if groups.get('channel'):
                channel = groups['channel'].strip()
                # Remove common separators
                channel = channel.replace('_', ' ').strip()
                metadata['channel'] = channel if channel else None

            # If we found something useful, return
            if any(v is not None for v in metadata.values()):
                logger.info(f"Parsed '{filename}' -> {metadata}")
                return metadata

    # If no pattern matched, try to extract just the year
    year_match = re.search(r'[\(\[]?(\d{4})[\)\]]?', name)
    if year_match:
        try:
            year = int(year_match.group(1))
            if 1900 <= year <= 2100:
                metadata['year'] = year
                # Try to extract series name (everything before the year)
                series = name[:year_match.start()].strip()
                series = series.replace('.', ' ').replace('_', ' ')
                series = ' '.join(series.split())
                if series:
                    metadata['series'] = series
        except (ValueError, TypeError):
            pass

    logger.debug(f"Could not parse metadata from '{filename}' using standard patterns")
    return metadata


def should_update_field(current_value: Optional[any], parsed_value: Optional[any]) -> bool:
    """
    Determine if a field should be updated based on current and parsed values.

    Args:
        current_value: Current value in database (may be None)
        parsed_value: Newly parsed value (may be None)

    Returns:
        True if field should be updated (current is None and parsed is not None)
    """
    # Only update if current is NULL/None and we have a parsed value
    return current_value is None and parsed_value is not None
