"""
set_admin.py
────────────
One-off administrative script to elevate a specific user's role to 'admin'.

Usage:
    python set_admin.py <username>

Example:
    python set_admin.py uniba
"""

import sys
from database import SessionLocal
import models


def set_user_role_admin(username: str):
    """
    Finds a user by username in PostgreSQL and sets their role to 'admin'.
    """
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            print(f"[-] Error: User '{username}' was not found in the database.")
            sys.exit(1)

        user.role = "admin"
        db.commit()
        db.refresh(user)
        print(f"[+] Success: User '{user.username}' (ID: {user.id}) role updated to '{user.role}'.")
    except Exception as e:
        db.rollback()
        print(f"[-] Database error while updating user role: {e}")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python set_admin.py <username>")
        username_input = input("Enter username to promote to admin: ").strip()
        if not username_input:
            print("No username provided. Aborting.")
            sys.exit(1)
        set_user_role_admin(username_input)
    else:
        set_user_role_admin(sys.argv[1].strip())
