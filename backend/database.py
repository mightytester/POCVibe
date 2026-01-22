from sqlalchemy import create_engine, Column, Integer, String, Float, Text, Table, ForeignKey, text, Index, event, select
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from config import config
import logging

logger = logging.getLogger(__name__)

Base = declarative_base()

# Association table for many-to-many relationship between videos and tags
video_tags = Table(
    'video_tags',
    Base.metadata,
    Column('video_id', Integer, ForeignKey('videos.id')),
    Column('tag_id', Integer, ForeignKey('tags.id'))
)

# Association table for many-to-many relationship between videos and actors
video_actors = Table(
    'video_actors',
    Base.metadata,
    Column('id', Integer, primary_key=True),
    Column('video_id', Integer, ForeignKey('videos.id'), nullable=False),
    Column('actor_id', Integer, ForeignKey('actors.id'), nullable=False),
    Column('created_at', Float, default=lambda: __import__('time').time())
)

class Video(Base):
    __tablename__ = "videos"

    id = Column(Integer, primary_key=True)
    path = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    display_name = Column(String)  # User-friendly display name (defaults to filename without extension)
    description = Column(Text)  # User-provided description (includes scene description)
    category = Column(String, nullable=False)  # Top-level category
    subcategory = Column(String)  # Full subfolder path (e.g., "Action/2023")
    relative_path = Column(String)  # Path relative to category root
    size = Column(Integer)
    modified = Column(Float)  # Unix timestamp
    extension = Column(String)
    
    # Media type: 'video' or 'image' - ✅ NEW
    media_type = Column(String, default='video')
    
    thumbnail_url = Column(String)  # URL to thumbnail image
    thumbnail_generated = Column(Integer, default=0)  # 0=not generated, 1=generated, -1=failed
    thumbnail_updated_at = Column(Integer, default=0)  # Unix timestamp for cache-busting ✅ NEW

    # Video metadata extracted from file
    duration = Column(Float)  # Video duration in seconds
    width = Column(Integer)  # Video width in pixels
    height = Column(Integer)  # Video height in pixels
    codec = Column(String)  # Video codec (e.g., h264, h265)
    bitrate = Column(Integer)  # Bitrate in bits per second
    fps = Column(Float)  # Frames per second

    # Fingerprinting status
    fingerprint_generated = Column(Integer, default=0)  # 0=not generated, 1=generated
    fingerprinted_at = Column(Float)  # Unix timestamp when fingerprinted

    # Enhanced metadata for series/episodic content
    series = Column(String)  # Series name (e.g., "Breaking Bad")
    season = Column(Integer)  # Season number (e.g., 1, 2, 3)
    episode = Column(String)  # Episode identifier (e.g., "E01", "Episode 5")
    year = Column(Integer)  # Release year
    channel = Column(String)  # Channel/Network (e.g., "HBO", "Netflix")
    rating = Column(Float)  # User rating 0-5 stars (e.g., 4.5)
    favorite = Column(Integer, default=0)  # Favorite flag: 0=not favorite, 1=favorite
    is_final = Column(Integer, default=0)  # Final/Preferred version flag: 0=not final, 1=final (for deduplication workflow)

    # Performance indexes for common queries
    __table_args__ = (
        Index('idx_category_subcategory', 'category', 'subcategory'),
        Index('idx_media_type', 'media_type'),  # ✅ NEW: For filtering by media type
        Index('idx_thumbnail_generated', 'thumbnail_generated'),
        Index('idx_modified', 'modified'),
        Index('idx_fingerprint_generated', 'fingerprint_generated'),
        Index('idx_series_season', 'series', 'season'),
        Index('idx_year', 'year'),
        Index('idx_favorite', 'favorite'),
        Index('idx_is_final', 'is_final'),
    )

    # Many-to-many relationship with tags
    tags = relationship("Tag", secondary=video_tags, back_populates="videos")

    # Many-to-many relationship with actors
    actors = relationship("Actor", secondary=video_actors, back_populates="videos")

    # One-to-many relationship with face encodings (preserve encodings when video deleted)
    face_encodings_rel = relationship("FaceEncoding", back_populates="video")

    # One-to-many relationship with video faces (cascade delete)
    video_faces_rel = relationship("VideoFace", back_populates="video", cascade="all, delete-orphan")

    # One-to-many relationship with video fingerprints (cascade delete)
    fingerprints = relationship("VideoFingerprint", back_populates="video", cascade="all, delete-orphan")

class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    color = Column(String, default="#3b82f6")  # Default blue color

    # Many-to-many relationship with videos
    videos = relationship("Video", secondary=video_tags, back_populates="tags")

class Actor(Base):
    __tablename__ = "actors"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)  # Proper cased (e.g., "Tom Cruise")
    notes = Column(Text)  # Optional notes about the actor
    video_count = Column(Integer, default=0)  # Cached count of videos
    created_at = Column(Float, default=lambda: __import__('time').time())

    # Many-to-many relationship with videos
    videos = relationship("Video", secondary=video_actors, back_populates="actors")

    __table_args__ = (
        Index('idx_actor_name', 'name'),
    )

class VideoFingerprint(Base):
    __tablename__ = "video_fingerprints"

    id = Column(Integer, primary_key=True)
    video_id = Column(Integer, ForeignKey('videos.id', ondelete='CASCADE'), nullable=False)
    frame_position = Column(Integer, nullable=False)  # 0, 25, 50, 75, 100 (percentage)
    phash = Column(String, nullable=False)  # 16-char hex string (64-bit perceptual hash)
    created_at = Column(Float, default=lambda: __import__('time').time())

    # Relationship to video
    video = relationship("Video", back_populates="fingerprints")

    __table_args__ = (
        Index('idx_fingerprints_video', 'video_id'),
        Index('idx_fingerprints_phash', 'phash'),
    )

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    path = Column(String, nullable=False)
    description = Column(Text)

class FolderScanStatus(Base):
    __tablename__ = "folder_scan_status"

    id = Column(Integer, primary_key=True)
    folder_name = Column(String, unique=True, nullable=False)
    last_scanned = Column(Float)  # Unix timestamp
    video_count = Column(Integer, default=0)
    scan_duration = Column(Float)  # Scan time in seconds
    is_scanned = Column(Integer, default=0)  # 0=never scanned, 1=scanned

class FaceID(Base):
    __tablename__ = "face_ids"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)  # "face-abc123" or user-provided name
    actor_id = Column(Integer, ForeignKey('actors.id'))  # Link to actor (optional)
    thumbnail_path = Column(String)  # Path to best face thumbnail (legacy)
    primary_encoding_id = Column(Integer, ForeignKey('face_encodings.id'), nullable=True)  # User-selected preview encoding
    encoding_count = Column(Integer, default=0)  # Number of encodings for this face
    created_at = Column(Float, default=lambda: __import__('time').time())
    updated_at = Column(Float, default=lambda: __import__('time').time())

    # Relationship to actor
    actor = relationship("Actor", backref="face_ids")

    # Relationship to encodings with cascade delete
    # Specify foreign_keys to avoid ambiguity with primary_encoding_id
    encodings = relationship(
        "FaceEncoding",
        back_populates="face",
        cascade="all, delete-orphan",
        foreign_keys="[FaceEncoding.face_id]"
    )

    # Relationship to video_faces with cascade delete
    video_faces = relationship("VideoFace", back_populates="face", cascade="all, delete-orphan")

    __table_args__ = (
        Index('idx_face_name', 'name'),
        Index('idx_face_actor', 'actor_id'),
    )

class FaceEncoding(Base):
    __tablename__ = "face_encodings"

    id = Column(Integer, primary_key=True)
    face_id = Column(Integer, ForeignKey('face_ids.id', ondelete='CASCADE'), nullable=False)
    video_id = Column(Integer, ForeignKey('videos.id', ondelete='SET NULL'), nullable=True)  # Nullable: preserve encoding if video deleted
    frame_timestamp = Column(Float, nullable=False)  # Seconds into video (0 for image-sourced encodings)
    encoding = Column(Text, nullable=False)  # 512-D vector as BLOB (stored as base64)
    thumbnail = Column(Text)  # Base64 encoded JPEG crop of face
    confidence = Column(Float)  # Detection confidence (0-1)
    quality_score = Column(Float)  # Face quality score (sharpness, angle, etc.)
    created_at = Column(Float, default=lambda: __import__('time').time())

    # Relationships
    # Specify foreign_keys to avoid ambiguity with FaceID.primary_encoding_id
    face = relationship("FaceID", back_populates="encodings", foreign_keys=[face_id])
    video = relationship("Video", back_populates="face_encodings_rel")

    __table_args__ = (
        Index('idx_encoding_face', 'face_id'),
        Index('idx_encoding_video', 'video_id'),
    )

class VideoFace(Base):
    """Junction table tracking which faces appear in which videos (many-to-many)"""
    __tablename__ = "video_faces"

    id = Column(Integer, primary_key=True)
    video_id = Column(Integer, ForeignKey('videos.id', ondelete='CASCADE'), nullable=False)
    face_id = Column(Integer, ForeignKey('face_ids.id', ondelete='CASCADE'), nullable=False)
    first_detected_at = Column(Float, default=lambda: __import__('time').time())  # When first linked
    detection_method = Column(String, default='manual_search')  # 'manual_search', 'batch_extraction', 'auto_scan'
    appearance_count = Column(Integer, default=1)  # How many encodings of this face in this video
    created_at = Column(Float, default=lambda: __import__('time').time())

    # Relationships
    video = relationship("Video", back_populates="video_faces_rel")
    face = relationship("FaceID", back_populates="video_faces")

    __table_args__ = (
        # Ensure each face can only be linked once per video
        Index('idx_video_face_unique', 'video_id', 'face_id', unique=True),
        Index('idx_video_faces_video', 'video_id'),
        Index('idx_video_faces_face', 'face_id'),
    )

class FolderGroup(Base):
    """Custom folder grouping for explorer view organization"""
    __tablename__ = "folder_groups"

    id = Column(String, primary_key=True)  # UUID
    name = Column(String, nullable=False)  # Group name (e.g., "Favorites", "To Review")
    folders = Column(String, nullable=False)  # JSON string of folder names: ["FOLDER1", "FOLDER2"]
    icon = Column(String, default="📁")  # Emoji or icon for display
    color = Column(String, default="#f3f4f6")  # Hex color for group header
    is_system = Column(Integer, default=0)  # 0=custom, 1=system folder (built-in)
    order = Column(Integer, default=0)  # Sort order for displaying groups
    created_at = Column(Float, default=lambda: __import__('time').time())
    updated_at = Column(Float, default=lambda: __import__('time').time())

    __table_args__ = (
        Index('idx_folder_group_name', 'name'),
    )

# Global engine and session factory - will be initialized dynamically
engine = None
AsyncSessionLocal = None

def get_database_url():
    """Get database URL for current active root"""
    return f"sqlite+aiosqlite:///{config.database_path}"

async def init_database():
    """Initialize or reinitialize database engine for current root"""
    global engine, AsyncSessionLocal
    
    database_url = get_database_url()
    logger.info(f"🔗 Initializing database: {database_url}")
    
    # Close old engine if it exists
    if engine is not None:
        await engine.dispose()
        engine = None
        AsyncSessionLocal = None
    
    # Create new engine
    engine = create_async_engine(database_url, echo=False)
    AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
    
    # Enable foreign key constraints for SQLite
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_conn, connection_record):
        """Enable foreign key constraints for SQLite connections"""
        cursor = dbapi_conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
    
    # Create tables
    await create_tables()
    
    # Run migrations for existing databases
    await migrate_database()
    
    logger.info(f"✅ Database initialized for root: {config.current_root_path}")

# Enable foreign key constraints for SQLite (required for CASCADE delete)
@event.listens_for(engine.sync_engine, "connect") if engine else lambda x: None
def set_sqlite_pragma(dbapi_conn, connection_record):
    """Enable foreign key constraints for SQLite connections"""
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

async def create_tables():
    """Create all database tables"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def migrate_database():
    """Add missing columns to existing database"""
    async with engine.begin() as conn:
        try:
            # Check existing columns
            result = await conn.execute(text("PRAGMA table_info(videos)"))
            columns = [row[1] for row in result.fetchall()]

            # Add thumbnail columns if missing
            if 'thumbnail_url' not in columns:
                logger.info("Adding thumbnail_url column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN thumbnail_url VARCHAR"))

            if 'thumbnail_generated' not in columns:
                logger.info("Adding thumbnail_generated column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN thumbnail_generated INTEGER DEFAULT 0"))

            if 'thumbnail_updated_at' not in columns:
                logger.info("Adding thumbnail_updated_at column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN thumbnail_updated_at INTEGER DEFAULT 0"))

            # Add video metadata columns if missing
            if 'duration' not in columns:
                logger.info("Adding duration column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN duration FLOAT"))

            if 'width' not in columns:
                logger.info("Adding width column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN width INTEGER"))

            if 'height' not in columns:
                logger.info("Adding height column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN height INTEGER"))

            if 'codec' not in columns:
                logger.info("Adding codec column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN codec VARCHAR"))

            if 'bitrate' not in columns:
                logger.info("Adding bitrate column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN bitrate INTEGER"))

            if 'fps' not in columns:
                logger.info("Adding fps column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN fps FLOAT"))

            # Add display_name and description columns if missing
            if 'display_name' not in columns:
                logger.info("Adding display_name column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN display_name VARCHAR"))

                # Populate display_name from existing name field (without extension)
                logger.info("Populating display_name from existing filenames")
                await conn.execute(text("""
                    UPDATE videos
                    SET display_name = CASE
                        WHEN instr(name, '.') > 0
                        THEN substr(name, 1, instr(name, '.') - 1)
                        ELSE name
                    END
                    WHERE display_name IS NULL
                """))

            if 'description' not in columns:
                logger.info("Adding description column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN description TEXT"))

            # Add fingerprint columns if missing
            if 'fingerprint_generated' not in columns:
                logger.info("Adding fingerprint_generated column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN fingerprint_generated INTEGER DEFAULT 0"))

            if 'fingerprinted_at' not in columns:
                logger.info("Adding fingerprinted_at column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN fingerprinted_at FLOAT"))

            # Add enhanced metadata columns for series/episodic content
            if 'series' not in columns:
                logger.info("Adding series column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN series VARCHAR"))

            if 'season' not in columns:
                logger.info("Adding season column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN season INTEGER"))

            if 'episode' not in columns:
                logger.info("Adding episode column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN episode VARCHAR"))

            if 'year' not in columns:
                logger.info("Adding year column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN year INTEGER"))

            if 'channel' not in columns:
                logger.info("Adding channel column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN channel VARCHAR"))

            if 'rating' not in columns:
                logger.info("Adding rating column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN rating FLOAT"))

            if 'favorite' not in columns:
                logger.info("Adding favorite column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN favorite INTEGER DEFAULT 0"))

            if 'is_final' not in columns:
                logger.info("Adding is_final column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN is_final INTEGER DEFAULT 0"))

            # Add media_type column for image/video support - ✅ NEW
            if 'media_type' not in columns:
                logger.info("Adding media_type column to videos table")
                await conn.execute(text("ALTER TABLE videos ADD COLUMN media_type VARCHAR DEFAULT 'video'"))
                logger.info("✅ media_type column added successfully (default='video' for all existing entries)")

            # Check if actors table exists
            actors_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='actors'"))
            actors_exists = actors_check.fetchone() is not None

            if not actors_exists:
                logger.info("Creating actors table")
                await conn.execute(text("""
                    CREATE TABLE actors (
                        id INTEGER PRIMARY KEY,
                        name VARCHAR UNIQUE NOT NULL,
                        notes TEXT,
                        video_count INTEGER DEFAULT 0,
                        created_at FLOAT
                    )
                """))
                await conn.execute(text("CREATE INDEX idx_actor_name ON actors(name)"))

            # Check folder_groups table for order column (for group reordering feature)
            folder_groups_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='folder_groups'"))
            folder_groups_exists = folder_groups_check.fetchone() is not None
            
            if folder_groups_exists:
                fg_columns = await conn.execute(text("PRAGMA table_info(folder_groups)"))
                fg_col_names = [row[1] for row in fg_columns.fetchall()]
                
                if 'order' not in fg_col_names:
                    logger.info("Adding order column to folder_groups table")
                    await conn.execute(text("ALTER TABLE folder_groups ADD COLUMN \"order\" INTEGER DEFAULT 0"))
                    # Assign sequential order to existing groups
                    await conn.execute(text("""
                        UPDATE folder_groups
                        SET "order" = (
                            SELECT COUNT(*) FROM folder_groups AS fg2
                            WHERE fg2.rowid <= folder_groups.rowid
                        ) - 1
                    """))
                    logger.info("✅ order column added to folder_groups with sequential values")

            # Check if video_actors table exists
            video_actors_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='video_actors'"))
            video_actors_exists = video_actors_check.fetchone() is not None

            if not video_actors_exists:
                logger.info("Creating video_actors junction table")
                await conn.execute(text("""
                    CREATE TABLE video_actors (
                        id INTEGER PRIMARY KEY,
                        video_id INTEGER NOT NULL,
                        actor_id INTEGER NOT NULL,
                        created_at FLOAT,
                        FOREIGN KEY(video_id) REFERENCES videos(id),
                        FOREIGN KEY(actor_id) REFERENCES actors(id)
                    )
                """))
                await conn.execute(text("CREATE INDEX idx_video_actors_video ON video_actors(video_id)"))
                await conn.execute(text("CREATE INDEX idx_video_actors_actor ON video_actors(actor_id)"))

            # Check if video_fingerprints table exists
            fingerprints_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='video_fingerprints'"))
            fingerprints_exists = fingerprints_check.fetchone() is not None

            if not fingerprints_exists:
                logger.info("Creating video_fingerprints table")
                await conn.execute(text("""
                    CREATE TABLE video_fingerprints (
                        id INTEGER PRIMARY KEY,
                        video_id INTEGER NOT NULL,
                        frame_position INTEGER NOT NULL,
                        phash VARCHAR NOT NULL,
                        created_at FLOAT,
                        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                """))
                await conn.execute(text("CREATE INDEX idx_fingerprints_video ON video_fingerprints(video_id)"))
                await conn.execute(text("CREATE INDEX idx_fingerprints_phash ON video_fingerprints(phash)"))

            # Check if face_ids table exists
            face_ids_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='face_ids'"))
            face_ids_exists = face_ids_check.fetchone() is not None

            if not face_ids_exists:
                logger.info("Creating face_ids table")
                await conn.execute(text("""
                    CREATE TABLE face_ids (
                        id INTEGER PRIMARY KEY,
                        name VARCHAR NOT NULL,
                        actor_id INTEGER,
                        thumbnail_path VARCHAR,
                        encoding_count INTEGER DEFAULT 0,
                        created_at FLOAT,
                        updated_at FLOAT,
                        FOREIGN KEY(actor_id) REFERENCES actors(id)
                    )
                """))
                await conn.execute(text("CREATE INDEX idx_face_name ON face_ids(name)"))
                await conn.execute(text("CREATE INDEX idx_face_actor ON face_ids(actor_id)"))

            # Add primary_encoding_id column to face_ids table if missing
            if face_ids_exists:
                face_ids_columns_result = await conn.execute(text("PRAGMA table_info(face_ids)"))
                face_ids_columns = [row[1] for row in face_ids_columns_result.fetchall()]

                if 'primary_encoding_id' not in face_ids_columns:
                    logger.info("Adding primary_encoding_id column to face_ids table")
                    await conn.execute(text("ALTER TABLE face_ids ADD COLUMN primary_encoding_id INTEGER"))
                    await conn.execute(text("CREATE INDEX idx_face_primary_encoding ON face_ids(primary_encoding_id)"))

            # Check if face_encodings table exists
            face_encodings_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='face_encodings'"))
            face_encodings_exists = face_encodings_check.fetchone() is not None

            if not face_encodings_exists:
                logger.info("Creating face_encodings table")
                await conn.execute(text("""
                    CREATE TABLE face_encodings (
                        id INTEGER PRIMARY KEY,
                        face_id INTEGER NOT NULL,
                        video_id INTEGER NOT NULL,
                        frame_timestamp FLOAT NOT NULL,
                        encoding TEXT NOT NULL,
                        thumbnail TEXT,
                        confidence FLOAT,
                        quality_score FLOAT,
                        created_at FLOAT,
                        FOREIGN KEY(face_id) REFERENCES face_ids(id) ON DELETE CASCADE,
                        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
                    )
                """))
                await conn.execute(text("CREATE INDEX idx_encoding_face ON face_encodings(face_id)"))
                await conn.execute(text("CREATE INDEX idx_encoding_video ON face_encodings(video_id)"))

            # Check if video_faces junction table exists
            video_faces_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='video_faces'"))
            video_faces_exists = video_faces_check.fetchone() is not None

            if not video_faces_exists:
                logger.info("Creating video_faces junction table")
                await conn.execute(text("""
                    CREATE TABLE video_faces (
                        id INTEGER PRIMARY KEY,
                        video_id INTEGER NOT NULL,
                        face_id INTEGER NOT NULL,
                        first_detected_at FLOAT,
                        detection_method VARCHAR DEFAULT 'manual_search',
                        appearance_count INTEGER DEFAULT 1,
                        created_at FLOAT,
                        FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE,
                        FOREIGN KEY(face_id) REFERENCES face_ids(id) ON DELETE CASCADE,
                        UNIQUE(video_id, face_id)
                    )
                """))
                await conn.execute(text("CREATE UNIQUE INDEX idx_video_face_unique ON video_faces(video_id, face_id)"))
                await conn.execute(text("CREATE INDEX idx_video_faces_video ON video_faces(video_id)"))
                await conn.execute(text("CREATE INDEX idx_video_faces_face ON video_faces(face_id)"))

                # Populate video_faces from existing face_encodings data
                logger.info("Populating video_faces from existing face_encodings data")
                await conn.execute(text("""
                    INSERT INTO video_faces (video_id, face_id, first_detected_at, detection_method, appearance_count, created_at)
                    SELECT
                        video_id,
                        face_id,
                        MIN(created_at) as first_detected_at,
                        'batch_extraction' as detection_method,
                        COUNT(*) as appearance_count,
                        MIN(created_at) as created_at
                    FROM face_encodings
                    GROUP BY video_id, face_id
                """))
                logger.info("Video_faces table populated successfully")

            # Migrate face_encodings to make video_id nullable (preserve encodings when videos deleted)
            face_encodings_check = await conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='face_encodings'"))
            if face_encodings_check.fetchone() is not None:
                # Check if video_id is nullable by examining the schema
                schema_check = await conn.execute(text("SELECT sql FROM sqlite_master WHERE type='table' AND name='face_encodings'"))
                schema = schema_check.fetchone()

                # If video_id is NOT NULL, we need to migrate
                if schema and 'video_id INTEGER NOT NULL' in schema[0]:
                    logger.info("Migrating face_encodings table to make video_id nullable (preserves face encodings when videos deleted)")

                    # Create new table with nullable video_id
                    await conn.execute(text("""
                        CREATE TABLE face_encodings_new (
                            id INTEGER PRIMARY KEY,
                            face_id INTEGER NOT NULL,
                            video_id INTEGER,
                            frame_timestamp FLOAT NOT NULL,
                            encoding TEXT NOT NULL,
                            thumbnail TEXT,
                            confidence FLOAT,
                            quality_score FLOAT,
                            created_at FLOAT,
                            FOREIGN KEY(face_id) REFERENCES face_ids(id) ON DELETE CASCADE,
                            FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE SET NULL
                        )
                    """))

                    # Copy all data from old table
                    await conn.execute(text("""
                        INSERT INTO face_encodings_new
                        SELECT * FROM face_encodings
                    """))

                    # Drop old table
                    await conn.execute(text("DROP TABLE face_encodings"))

                    # Rename new table
                    await conn.execute(text("ALTER TABLE face_encodings_new RENAME TO face_encodings"))

                    # Recreate indexes
                    await conn.execute(text("CREATE INDEX idx_encoding_face ON face_encodings(face_id)"))
                    await conn.execute(text("CREATE INDEX idx_encoding_video ON face_encodings(video_id)"))

                    logger.info("✅ Face encodings migration complete - encodings will now be preserved when videos are deleted")

        except Exception as e:
            logger.error(f"Error during database migration: {e}")
            # If migration fails, just create all tables (for new databases)
            await conn.run_sync(Base.metadata.create_all)

    # Fix media_type for existing records (GIF/WebP should be 'image', not 'video')
    logger.info("🔧 Fixing media_type for GIF/WebP and other files...")
    fix_stats = await fix_existing_media_types()
    if fix_stats['images_fixed'] > 0 or fix_stats['videos_fixed'] > 0:
        logger.info(f"✅ Fixed {fix_stats['images_fixed']} images and {fix_stats['videos_fixed']} videos")
    if fix_stats['errors']:
        logger.warning(f"⚠️ Encountered {len(fix_stats['errors'])} errors: {fix_stats['errors'][:3]}")

async def fix_existing_media_types() -> dict:
    """Fix media_type for existing database records based on actual file extensions - ✅ NEW
    
    This function corrects records that were created before media_type detection was implemented.
    It re-scans all existing Video records and updates their media_type based on file extension.
    
    Returns:
        dict with statistics: {'videos_fixed': N, 'images_fixed': M, 'errors': []}
    """
    from pathlib import Path
    from file_scanner import FileScanner
    
    scanner = FileScanner()
    stats = {'videos_fixed': 0, 'images_fixed': 0, 'errors': [], 'total_checked': 0, 'no_change_needed': 0}
    
    try:
        async with AsyncSessionLocal() as session:
            # Get all videos from database
            result = await session.execute(select(Video))
            all_videos = result.scalars().all()
            
            logger.info(f"🔧 Fixing media_type for {len(all_videos)} existing records...")
            
            for video in all_videos:
                try:
                    stats['total_checked'] += 1
                    # Determine media type based on file extension
                    file_path = Path(video.path) if video.path else None
                    if not file_path or not file_path.exists():
                        stats['errors'].append(f"File not found: {video.path}")
                        continue
                    
                    detected_type = scanner.get_media_type(file_path)
                    current_type = video.media_type
                    
                    logger.debug(f"File: {video.name} | Current: {current_type} | Detected: {detected_type}")
                    
                    # Only update if different from current value
                    if detected_type and detected_type != current_type:
                        video.media_type = detected_type
                        
                        if detected_type == 'image':
                            stats['images_fixed'] += 1
                            logger.info(f"📷 Fixed to image: {video.name}")
                        else:
                            stats['videos_fixed'] += 1
                            logger.info(f"🎬 Fixed to video: {video.name}")
                    else:
                        stats['no_change_needed'] += 1
                
                except Exception as e:
                    error_msg = f"Error fixing {video.name}: {str(e)}"
                    stats['errors'].append(error_msg)
                    logger.error(error_msg)
            
            # Commit all changes
            await session.commit()
            logger.info(f"✅ Media type fix complete: {stats['images_fixed']} images, {stats['videos_fixed']} videos")
            
            if stats['errors']:
                logger.warning(f"⚠️ Encountered {len(stats['errors'])} errors during fix")
            
            return stats
    
    except Exception as e:
        logger.error(f"❌ Error during media_type fix: {e}")
        stats['errors'].append(str(e))
        return stats

async def get_db():
    """Dependency to get database session"""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()