from sqlalchemy import Column, Integer, String
from database import Base

class User(Base):
    """
    SQLAlchemy User Model.
    
    Represents the 'users' table in PostgreSQL.
    Stores account credentials and identity information.
    """
    __tablename__ = "users"

    # Primary key identifier
    id = Column(Integer, primary_key=True, index=True)

    # ---------------------------------------------------------------------------
    # Database Uniqueness Constraints as the Final Guarantee:
    # ---------------------------------------------------------------------------
    # Even though we use an in-memory Bloom filter to quickly reject duplicates
    # before touching the database, PostgreSQL's `unique=True` constraint is the
    # ultimate source of truth.
    #
    # Reasons:
    # 1. ACID Guarantees: Relational databases guarantee atomicity and isolation.
    #    If two requests try to insert the exact same username concurrently,
    #    PostgreSQL guarantees that only one transaction succeeds, preventing race conditions.
    # 2. False Positives: Bloom filters have a small probability of false positives
    #    (saying an item exists when it actually does not). Only the database can
    #    authoritatively verify actual record existence.
    # 3. Persistence: If the application restarts or Bloom filter state is reset,
    #    the database preserves complete data integrity.
    # ---------------------------------------------------------------------------
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)

    # Stores bcrypt-hashed password - never store plain text passwords!
    password_hash = Column(String(255), nullable=False)

    # ---------------------------------------------------------------------------
    # Role-Based Access Control (RBAC):
    # ---------------------------------------------------------------------------
    # Defines user permissions (e.g. 'customer', 'admin').
    # Defaults to 'customer' so existing user data and normal workflows remain unaffected.
    # 'server_default' ensures database-level default for raw SQL / migrations.
    role = Column(String(20), nullable=False, default="customer", server_default="customer")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}', role='{self.role}')>"

