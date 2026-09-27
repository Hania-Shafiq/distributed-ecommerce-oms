"""
migrate_role.py
───────────────
Migration script to add the 'role' column to the 'users' table in PostgreSQL
without losing any existing user data.
"""

from sqlalchemy import text
from database import engine

def migrate():
    print("[*] Checking and migrating 'users' table for 'role' column...")
    migration_sql = text("""
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer';
    """)
    with engine.connect() as conn:
        conn.execute(migration_sql)
        conn.commit()
    print("[+] Migration successful: 'role' column added with default 'customer'. All existing data preserved.")

if __name__ == "__main__":
    migrate()
