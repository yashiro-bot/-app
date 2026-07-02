#!/usr/bin/env python3
"""
Sync customer data from Excel into the backend database.

Reads 雪茄市场监测样本户名单(629).xlsx and replaces ALL existing customer
records with the 29 customers from the spreadsheet. Also creates Manager
users for the 客户经理 column if they don't already exist, and sets up
CustomerAssignment links.

Usage:
    cd /home/wewe/cigar-collection/backend
    python3 prisma/sync_customers.py

This script uses SQLite directly (not Prisma client) so it can run without
tsx/node dependencies.
"""

import sqlite3
import hashlib
import os
import sys
import subprocess

# ─── Config ──────────────────────────────────────────────────────────────────
EXCEL_PATH = r"/mnt/c/Users/HONOR/Desktop/看板/雪茄信息采集app/雪茄市场监测样本户名单(629).xlsx"
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prisma/dev.db")

# ─── Read Excel ──────────────────────────────────────────────────────────────
try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

wb = openpyxl.load_workbook(EXCEL_PATH)
ws = wb["客户列表"]

# Collect rows (skip header, skip empty trailing rows)
rows = []
for row in ws.iter_rows(min_row=2, values_only=True):
    code, name, phone, contact, grade, manager_name, lng, lat, terminal_type = row
    if not code or not name:
        continue  # skip empty rows
    rows.append({
        "code": str(code).strip(),
        "name": str(name).strip(),
        "phone": str(phone).strip() if phone else "",
        "contact": str(contact).strip() if contact else "",
        "grade": str(grade).strip() if grade else "",
        "manager_name": str(manager_name).strip() if manager_name else "",
        "lng": float(lng) if lng else None,
        "lat": float(lat) if lat else None,
        "terminal_type": str(terminal_type).strip() if terminal_type else "",
    })

print(f"📋 Read {len(rows)} customers from Excel")

# ─── Collect unique managers ─────────────────────────────────────────────────
manager_names = sorted(set(r["manager_name"] for r in rows if r["manager_name"]))
print(f"👤 Found {len(manager_names)} unique managers: {', '.join(manager_names)}")

# ─── Connect DB ──────────────────────────────────────────────────────────────
conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA foreign_keys = OFF")  # allow deletion with FK refs
cur = conn.cursor()

try:
    # ─── 1. Clear existing dependent data ────────────────────────────────────
    print("🧹 Clearing existing data...")
    cur.execute("DELETE FROM collection_detail")
    cur.execute("DELETE FROM collection")
    cur.execute("DELETE FROM customer_assignment")
    cur.execute("DELETE FROM customer")
    # Reset auto-increment so new customers start at ID 1
    cur.execute("DELETE FROM sqlite_sequence WHERE name='customer'")
    print("   Done.")

    # ─── 2. Create/ensure Manager users ──────────────────────────────────────
    # Bcrypt hash for "123456" (generated once, matches bcryptjs on the backend)
    default_pw_hash = "$2b$10$JmLVFJzHiuo3yvTdSJPMteMRXeWiV1SKTcx/U8up48RgLh5kqZj0."

    manager_user_ids = {}
    for name in manager_names:
        # Check if a user with this name already exists
        cur.execute(
            "SELECT id FROM \"user\" WHERE name = ? AND role = 'MANAGER'",
            (name,),
        )
        existing = cur.fetchone()
        if existing:
            manager_user_ids[name] = existing[0]
            print(f"   ✅ Manager '{name}' already exists (id={existing[0]})")
        else:
            # Create a new MANAGER user
            username = f"mgr-{name}"
            cur.execute(
                "INSERT INTO \"user\" (username, password_hash, name, role, status, created_at, updated_at) VALUES (?, ?, ?, 'MANAGER', 'ACTIVE', datetime('now'), datetime('now'))",
                (username, default_pw_hash, name),
            )
            new_id = cur.lastrowid
            manager_user_ids[name] = new_id
            print(f"   ✅ Created manager '{name}' (id={new_id}, username={username}, pw=123456)")

    # ─── 3. Import customers ─────────────────────────────────────────────────
    print("📦 Importing customers...")
    for i, r in enumerate(rows, start=1):
        address = r["name"]  # use company name as address too
        cur.execute(
            """INSERT INTO customer
               (code, name, address, contact, phone, lat, lng, grade, terminal_type, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', datetime('now'), datetime('now'))""",
            (
                r["code"],
                r["name"],
                address,
                r["contact"],
                r["phone"],
                r["lat"],
                r["lng"],
                r["grade"],
                r["terminal_type"],
            ),
        )
        customer_id = cur.lastrowid

        # Create CustomerAssignment if manager exists
        mgr_name = r["manager_name"]
        if mgr_name and mgr_name in manager_user_ids:
            mgr_id = manager_user_ids[mgr_name]
            cur.execute(
                "INSERT INTO customer_assignment (manager_id, customer_id) VALUES (?, ?)",
                (mgr_id, customer_id),
            )

    print(f"   ✅ Imported {len(rows)} customers with assignments")

    # ─── Commit ──────────────────────────────────────────────────────────────
    conn.commit()
    print(f"\n🎉 Sync complete!")
    print(f"   Customers: {len(rows)}")
    print(f"   Managers: {len(manager_names)}")

except Exception as e:
    conn.rollback()
    print(f"\n❌ ERROR: {e}")
    sys.exit(1)
finally:
    conn.execute("PRAGMA foreign_keys = ON")
    conn.close()
