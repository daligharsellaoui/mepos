import sqlite3
import os
import random
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "local_sales.db")

def init_db():
    print(f"Creating mock legacy POS SQLite database at: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Create tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS legacy_sales_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT UNIQUE,
        sold_at TIMESTAMP,
        total_amount REAL
    )
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS legacy_sales_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER,
        recipe_id INTEGER,
        quantity REAL,
        unit_price REAL,
        FOREIGN KEY(ticket_id) REFERENCES legacy_sales_tickets(id)
    )
    """)

    # Check if empty
    cursor.execute("SELECT count(*) FROM legacy_sales_tickets")
    count = cursor.fetchone()[0]

    if count == 0:
        print("Inserting mock historical local sales tickets...")
        # Insert 3 tickets
        tickets = [
            ("TK-LOCAL-1001", "2026-06-06 18:30:00", 30.00, [(1, 2.0, 15.00)]), # 2 Cheeseburgers simples
            ("TK-LOCAL-1002", "2026-06-06 19:15:00", 25.00, [(3, 2.0, 2.50), (2, 1.0, 22.50)]), # 2 Colas, 1 Burger Double
            ("TK-LOCAL-1003", "2026-06-06 20:00:00", 15.00, [(1, 1.0, 15.00)]) # 1 Cheeseburger simple
        ]

        for ticket_num, sold_at, total, items in tickets:
            cursor.execute(
                "INSERT INTO legacy_sales_tickets (ticket_number, sold_at, total_amount) VALUES (?, ?, ?)",
                (ticket_num, sold_at, total)
            )
            ticket_db_id = cursor.lastrowid
            for recipe_id, qty, price in items:
                cursor.execute(
                    "INSERT INTO legacy_sales_items (ticket_id, recipe_id, quantity, unit_price) VALUES (?, ?, ?, ?)",
                    (ticket_db_id, recipe_id, qty, price)
                )
        conn.commit()
        print("Mock legacy POS database populated successfully.")
    else:
        print("Mock legacy POS database already populated.")

    conn.close()

if __name__ == "__main__":
    init_db()
