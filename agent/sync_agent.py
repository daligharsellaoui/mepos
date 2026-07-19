import sqlite3
import os
import json
import time
import urllib.request
import urllib.error

DB_PATH = os.path.join(os.path.dirname(__file__), "local_sales.db")

# Configuration defaults
API_URL = os.environ.get("MEPOS_API_URL", "http://localhost:5000/api/v1/sales/sync")
API_KEY = os.environ.get("MEPOS_API_KEY", "mepos_sec_key_prod_abc123")
DEPARTMENT_ID = int(os.environ.get("MEPOS_DEPARTMENT_ID", "2")) # Default to Cuisine
SYNC_INTERVAL = int(os.environ.get("MEPOS_SYNC_INTERVAL", "10")) # seconds

def get_last_synced_id(conn):
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sync_metadata (
        key TEXT PRIMARY KEY,
        value TEXT
    )
    """)
    conn.commit()
    
    cursor.execute("SELECT value FROM sync_metadata WHERE key = 'last_synced_id'")
    row = cursor.fetchone()
    if row:
        return int(row[0])
    return 0

def update_last_synced_id(conn, last_id):
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('last_synced_id', ?)",
        (str(last_id),)
    )
    conn.commit()

def sync_tickets():
    if not os.path.exists(DB_PATH):
        print(f"Local sales DB not found at: {DB_PATH}. Please run setup_local_db.py first.")
        return

    conn = sqlite3.connect(DB_PATH)
    last_synced_id = get_last_synced_id(conn)
    
    cursor = conn.cursor()
    # Fetch any unsynced tickets
    cursor.execute(
        "SELECT id, ticket_number, sold_at, total_amount FROM legacy_sales_tickets WHERE id > ? ORDER BY id ASC",
        (last_synced_id,)
    )
    tickets = cursor.fetchall()

    if not tickets:
        # Nothing to sync
        conn.close()
        return

    print(f"Found {len(tickets)} unsynced ticket(s). Preparing sync payload...")

    payload_tickets = []
    max_id_processed = last_synced_id

    for db_id, ticket_num, sold_at, total_amount in tickets:
        # Fetch ticket items
        cursor.execute(
            "SELECT recipe_id, quantity, unit_price FROM legacy_sales_items WHERE ticket_id = ?",
            (db_id,)
        )
        items = cursor.fetchall()
        
        payload_items = []
        for recipe_id, quantity, unit_price in items:
            payload_items.append({
                "recipe_id": recipe_id,
                "quantity": quantity,
                "unit_price": unit_price
            })
            
        payload_tickets.append({
            "external_ticket_id": ticket_num,
            "ticket_date": sold_at + "Z", # Formatting as simple ISO-like string
            "total_amount": total_amount,
            "items": payload_items
        })
        
        max_id_processed = max(max_id_processed, db_id)

    payload = {
        "department_id": DEPARTMENT_ID,
        "tickets": payload_tickets
    }

    # Send payload to Cloud API
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(
        API_URL, 
        data=data, 
        headers={
            'Content-Type': 'application/json',
            'X-API-KEY': API_KEY
        },
        method='POST'
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode('utf-8')
            res_json = json.loads(res_body)
            if res_json.get("status") == "success":
                print(f"Successfully synchronized {res_json.get('synced_tickets_count')} ticket(s) to mePOS STOCK backend.")
                # Update offset to avoid double syncing
                update_last_synced_id(conn, max_id_processed)
            else:
                print(f"API returned success=false error: {res_body}")
    except urllib.error.HTTPError as e:
        print(f"HTTP Error during sync: {e.code} - {e.reason}")
        try:
            print("Response error body:", e.read().decode('utf-8'))
        except Exception:
            pass
    except urllib.error.URLError as e:
        print(f"Failed to reach mePOS STOCK backend API: {e.reason}. Will retry next interval.")
    except Exception as e:
        print(f"Unexpected error during sync execution: {e}")

    conn.close()

if __name__ == "__main__":
    print(f"=== mePOS STOCK Legacy Sync Agent started ===")
    print(f"Sync target: {API_URL}")
    print(f"Department ID: {DEPARTMENT_ID}")
    print(f"Sync Interval: {SYNC_INTERVAL} seconds")
    print("---------------------------------------------")
    
    # Run setup automatically if DB is missing
    if not os.path.exists(DB_PATH):
        from setup_local_db import init_db
        init_db()

    while True:
        try:
            sync_tickets()
        except KeyboardInterrupt:
            print("\nSync agent stopped by user.")
            break
        except Exception as e:
            print(f"Uncaught loop exception: {e}")
        time.sleep(SYNC_INTERVAL)
