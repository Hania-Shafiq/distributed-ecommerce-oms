import logging
import threading
from pybloom_live import ScalableBloomFilter
from sqlalchemy.orm import Session
from models import User

logger = logging.getLogger(__name__)

# ===========================================================================
# BLOOM FILTER ARCHITECTURE & DESIGN NOTES
# ===========================================================================
# A Bloom filter is a space-efficient probabilistic data structure used to test
# whether an element is a member of a set.
#
# Key Mathematical Properties:
# ------------------------------
# 1. NO FALSE NEGATIVES:
#    - If Bloom filter returns `False` ("not in set"), it is 100% MATHEMATICALLY
#      GUARANTEED that the element does NOT exist in the set.
#    - Benefit: When a new user signs up with a unique username/email, the Bloom
#      filter returns False in microsecond speed (~O(k) in-memory hash operations).
#      We can completely bypass executing costly SELECT queries against PostgreSQL!
#
# 2. POSSIBLE FALSE POSITIVES:
#    - If Bloom filter returns `True` ("possibly in set"), there is a small
#      probability (e.g., error_rate=0.001 -> 0.1%) that hash bits collided and
#      the item does NOT actually exist in the database.
#
# WHY CHECK BLOOM FILTER FIRST?
# ------------------------------
# High-traffic services receive millions of signup / availability checks.
# Querying PostgreSQL for every check causes high database connection pool contention,
# network latency, and disk/index I/O.
# Checking Bloom filter first eliminates ~99.9% of unnecessary DB read queries
# for new unique values.
#
# WHY POSTGRESQL CHECK AFTER (WHEN BLOOM RETURNS TRUE)?
# -----------------------------------------------------
# If the Bloom filter returns `True`, we CANNOT immediately reject the user because
# of the small false positive rate. Rejecting a user falsely would be a bad user experience.
# Therefore, when Bloom returns `True`, we execute a targeted SELECT query in PostgreSQL
# (the authoritative source of truth) to verify whether the record truly exists.
#
# WHY POSTGRESQL UNIQUE CONSTRAINT IS THE FINAL GUARANTEE?
# --------------------------------------------------------
# 1. Race Conditions / Concurrency: If two users submit the identical username at the
#    exact same millisecond, both requests might check the Bloom filter before either
#    has completed inserting into the DB. PostgreSQL's UNIQUE index constraint
#    enforces ACID transactional serialization at the storage engine level.
# 2. Durability & Recovery: Memory can be wiped during restarts or crashes; PostgreSQL
#    persists the ground truth forever on disk.
# ===========================================================================

class UserBloomFilter:
    """
    Manages in-memory Bloom filter for fast username and email uniqueness pre-checks.
    Uses ScalableBloomFilter to dynamically grow while keeping error rate low (0.1%).
    """

    def __init__(self, initial_capacity: int = 1000, error_rate: float = 0.001):
        """
        Initialize the scalable bloom filter.
        
        :param initial_capacity: Initial number of items expected before scaling.
        :param error_rate: Maximum allowed false positive rate (0.001 = 0.1%).
        """
        self.lock = threading.Lock()
        self.bloom = ScalableBloomFilter(
            initial_capacity=initial_capacity,
            error_rate=error_rate,
            mode=ScalableBloomFilter.SMALL_SET_GROWTH
        )

    def _format_username_key(self, username: str) -> str:
        """Namespace key for usernames (lowercased for case-insensitive uniqueness check)."""
        return f"username:{username.strip().lower()}"

    def _format_email_key(self, email: str) -> str:
        """Namespace key for emails (lowercased for standard email handling)."""
        return f"email:{email.strip().lower()}"

    def add_user(self, username: str, email: str) -> None:
        """
        Add a newly registered user's username and email to the Bloom filter.
        Called immediately after a user is successfully committed to PostgreSQL.
        """
        with self.lock:
            self.bloom.add(self._format_username_key(username))
            self.bloom.add(self._format_email_key(email))

    def check_username(self, username: str) -> bool:
        """
        Fast pre-check for username presence.
        
        Returns:
            False -> 100% GUARANTEED NOT in DB (No database query needed!).
            True  -> POSSIBLY in DB (Must query PostgreSQL to verify false positive).
        """
        return self._format_username_key(username) in self.bloom

    def check_email(self, email: str) -> bool:
        """
        Fast pre-check for email presence.
        
        Returns:
            False -> 100% GUARANTEED NOT in DB (No database query needed!).
            True  -> POSSIBLY in DB (Must query PostgreSQL to verify false positive).
        """
        return self._format_email_key(email) in self.bloom

    def load_from_db(self, db: Session) -> int:
        """
        Startup Synchronization:
        Fetches all existing usernames and emails from PostgreSQL into the Bloom filter.
        Ensures the Bloom filter reflects all historical database records upon server start.
        """
        # Query only the required columns (username, email) to optimize memory and network
        users = db.query(User.username, User.email).all()
        count = 0
        for user_record in users:
            self.add_user(user_record.username, user_record.email)
            count += 1
        
        logger.info(f"Bloom Filter synchronized: {count} users loaded into filter.")
        return count


# Global singleton instance of UserBloomFilter used across the application
user_bloom_filter = UserBloomFilter()
