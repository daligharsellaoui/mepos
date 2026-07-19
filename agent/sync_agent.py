"""
mePOS STOCK — Legacy POS Synchronization Agent (Python)
======================================================
Synchronizes local sales tickets from legacy POS databases to the mePOS STOCK API.

Features:
- Exponential backoff with jitter for transient failures
- Structured logging (JSON + console)
- Circuit breaker pattern to avoid hammering a down API
- Graceful shutdown on SIGINT/SIGTERM
- Duplicate ticket detection via external_ticket_id hash
- Batch size limit to avoid oversized payloads
- Configurable via env vars or config file
"""

import sqlite3
import os
import sys
import json
import time
import random
import signal
import logging
import hashlib
import urllib.request
import urllib.error
from datetime import datetime
from typing import Optional, Any

# ======================================================
# CONFIGURATION
# ======================================================

DEFAULT_CONFIG = {
    "api_url": "http://localhost:5000/api/v1/sales/sync",
    "api_key": "",
    "department_id": 2,
    "sync_interval": 10,  # seconds
    "max_batch_size": 50,  # max tickets per sync request
    "max_retries": 5,
    "base_backoff": 1,  # seconds
    "max_backoff": 60,  # seconds
    "backoff_jitter": 0.5,  # 50% jitter
    "circuit_breaker_threshold": 3,  # consecutive failures before opening circuit
    "circuit_breaker_reset": 30,  # seconds before trying again
    "log_level": "INFO",
    "log_file": "",  # empty = stdout only
}

# Load config from env vars (override defaults)
ENV_MAP = {
    "MEPOS_API_URL": "api_url",
    "MEPOS_API_KEY": "api_key",
    "MEPOS_DEPARTMENT_ID": ("department_id", int),
    "MEPOS_SYNC_INTERVAL": ("sync_interval", int),
    "MEPOS_MAX_BATCH_SIZE": ("max_batch_size", int),
    "MEPOS_MAX_RETRIES": ("max_retries", int),
    "MEPOS_LOG_LEVEL": "log_level",
    "MEPOS_LOG_FILE": "log_file",
}

def load_config() -> dict:
    config = dict(DEFAULT_CONFIG)
    
    # Try loading from config file
    config_path = os.environ.get("MEPOS_CONFIG_FILE", 
                                 os.path.join(os.path.dirname(__file__), "sync_config.json"))
    if os.path.exists(config_path):
        try:
            with open(config_path, "r") as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            print(f"[WARN] Failed to load config file {config_path}: {e}")
    
    # Env vars override file config
    for env_key, config_key in ENV_MAP.items():
        env_val = os.environ.get(env_key)
        if env_val:
            if isinstance(config_key, tuple):
                config[config_key[0]] = config_key[1](env_val)
            else:
                config[config_key] = env_val
    
    # Validate
    if not config["api_key"]:
        config["api_key"] = os.environ.get("API_KEY", "")
    
    return config


# ======================================================
# LOGGING SETUP
# ======================================================

def setup_logging(config: dict) -> logging.Logger:
    logger = logging.getLogger("mepos-sync-agent")
    level = getattr(logging, config["log_level"].upper(), logging.INFO)
    logger.setLevel(level)
    
    formatter = logging.Formatter(
        '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(formatter)
    logger.addHandler(console)
    
    # File handler (optional)
    if config["log_file"]:
        log_dir = os.path.dirname(config["log_file"])
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        file_handler = logging.FileHandler(config["log_file"])
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    return logger


# ======================================================
# CIRCUIT BREAKER
# ======================================================

class CircuitBreaker:
    """Simple circuit breaker to avoid hammering a down API."""
    
    def __init__(self, threshold: int = 3, reset_timeout: int = 30):
        self.threshold = threshold
        self.reset_timeout = reset_timeout
        self.failure_count = 0
        self.last_failure_time = 0.0
        self.state = "closed"  # closed, open, half-open
    
    def record_success(self):
        self.failure_count = 0
        self.state = "closed"
    
    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.threshold:
            self.state = "open"
    
    def allow_request(self) -> bool:
        if self.state == "closed":
            return True
        if self.state == "open":
            if time.time() - self.last_failure_time >= self.reset_timeout:
                self.state = "half-open"
                return True
            return False
        # half-open: allow one request to test
        return True


# ======================================================
# SYNC AGENT
# ======================================================

class SyncAgent:
    def __init__(self, config: dict):
        self.config = config
        self.logger = setup_logging(config)
        self.circuit_breaker = CircuitBreaker(
            threshold=config["circuit_breaker_threshold"],
            reset_timeout=config["circuit_breaker_reset"]
        )
        self.running = True
        self.db_path = os.path.join(os.path.dirname(__file__), "local_sales.db")
        
        # Auto-setup DB if missing
        if not os.path.exists(self.db_path):
            self.logger.info("Local sales DB not found. Running setup...")
            try:
                from setup_local_db import init_db
                init_db()
                self.logger.info("Local sales DB created successfully.")
            except ImportError:
                self.logger.warning("setup_local_db.py not found. Run it manually to create the DB.")
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)
        
        self.logger.info("Sync Agent initialized")
        self.logger.info(f"  API URL: {config['api_url']}")
        self.logger.info(f"  Department ID: {config['department_id']}")
        self.logger.info(f"  Sync Interval: {config['sync_interval']}s")
        self.logger.info(f"  Max Batch: {config['max_batch_size']}")
        self.logger.info(f"  Max Retries: {config['max_retries']}")
    
    def _handle_signal(self, signum: int, frame: Any):
        sig_name = signal.Signals(signum).name
        self.logger.info(f"Received {sig_name}, shutting down gracefully...")
        self.running = False
    
    def _get_last_synced_id(self, conn) -> int:
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
    
    def _update_last_synced_id(self, conn, last_id: int):
        cursor = conn.cursor()
        cursor.execute(
            "INSERT OR REPLACE INTO sync_metadata (key, value) VALUES ('last_synced_id', ?)",
            (str(last_id),)
        )
        conn.commit()
    
    def _compute_ticket_hash(self, ticket: dict) -> str:
        """Create a unique hash for a ticket based on its external ID and date."""
        raw = f"{ticket.get('external_ticket_id', '')}|{ticket.get('ticket_date', '')}|{ticket.get('total_amount', '')}"
        return hashlib.sha256(raw.encode()).hexdigest()
    
    def _classify_error(self, error: Exception) -> str:
        """Classify errors as 'transient' or 'permanent'."""
        if isinstance(error, urllib.error.HTTPError):
            if error.code >= 500:
                return "transient"
            elif error.code in (401, 403):
                return "permanent_auth"
            elif error.code == 429:
                return "transient"  # rate limit
            elif error.code == 400:
                return "permanent"
            return "transient"
        elif isinstance(error, urllib.error.URLError):
            return "transient"
        return "unknown"
    
    def _calculate_backoff(self, attempt: int) -> float:
        """Exponential backoff with jitter."""
        base = self.config["base_backoff"]
        max_backoff = self.config["max_backoff"]
        jitter = self.config["backoff_jitter"]
        
        delay = min(base * (2 ** attempt), max_backoff)
        delay = delay * (1 + random.uniform(-jitter, jitter))
        return max(0.1, delay)
    
    def _send_sync_request(self, payload: dict) -> Optional[dict]:
        """Send sync request with retry logic."""
        url = self.config["api_url"]
        api_key = self.config["api_key"]
        max_retries = self.config["max_retries"]
        
        data = json.dumps(payload).encode('utf-8')
        
        last_error = None
        
        for attempt in range(max_retries + 1):
            if not self.running:
                return None
            
            try:
                req = urllib.request.Request(
                    url,
                    data=data,
                    headers={
                        'Content-Type': 'application/json',
                        'X-API-KEY': api_key
                    },
                    method='POST'
                )
                
                with urllib.request.urlopen(req, timeout=30) as response:
                    res_body = response.read().decode('utf-8')
                    res_json = json.loads(res_body)
                    
                    self.circuit_breaker.record_success()
                    return res_json
                    
            except urllib.error.HTTPError as e:
                last_error = e
                error_type = self._classify_error(e)
                
                if error_type == "permanent":
                    self.logger.error(f"Permanent error {e.code} from API: {e.reason}. Skipping batch.")
                    try:
                        body = e.read().decode('utf-8')
                        self.logger.error(f"Response body: {body[:500]}")
                    except Exception:
                        pass
                    return {"status": "error", "message": f"HTTP {e.code}: {e.reason}"}
                
                elif error_type == "permanent_auth":
                    self.logger.critical(f"Authentication error {e.code}. Check API key configuration.")
                    return {"status": "error", "message": f"Auth error: {e.reason}"}
                
                # Transient error — retry
                if attempt < max_retries:
                    delay = self._calculate_backoff(attempt)
                    self.logger.warning(
                        f"HTTP {e.code} (attempt {attempt + 1}/{max_retries + 1}), "
                        f"retrying in {delay:.1f}s..."
                    )
                    time.sleep(delay)
                else:
                    self.logger.error(f"Max retries reached for HTTP {e.code}")
                    
            except urllib.error.URLError as e:
                last_error = e
                if attempt < max_retries:
                    delay = self._calculate_backoff(attempt)
                    self.logger.warning(
                        f"Connection error: {e.reason} (attempt {attempt + 1}/{max_retries + 1}), "
                        f"retrying in {delay:.1f}s..."
                    )
                    time.sleep(delay)
                else:
                    self.logger.error(f"Max retries reached for network error: {e.reason}")
                    
            except Exception as e:
                last_error = e
                if attempt < max_retries:
                    delay = self._calculate_backoff(attempt)
                    self.logger.warning(f"Unexpected error (attempt {attempt + 1}): {e}, retrying in {delay:.1f}s...")
                    time.sleep(delay)
                else:
                    self.logger.error(f"Max retries reached for unexpected error: {e}")
        
        # All retries exhausted
        self.circuit_breaker.record_failure()
        if last_error:
            return {"status": "error", "message": f"Sync failed after {max_retries + 1} attempts: {last_error}"}
        return {"status": "error", "message": "Sync failed after max retries"}
    
    def _load_seen_hashes(self, conn) -> set:
        """Load persisted ticket hashes from SQLite for duplicate detection."""
        hashes: set = set()
        try:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS synced_ticket_hashes (
                    ticket_hash TEXT PRIMARY KEY,
                    synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()
            # Keep only the last 10,000 hashes to bound memory
            cursor.execute("SELECT ticket_hash FROM synced_ticket_hashes ORDER BY synced_at DESC LIMIT 10000")
            for row in cursor.fetchall():
                hashes.add(row[0])
        except Exception as e:
            self.logger.warning(f"Failed to load persisted hashes: {e}")
        return hashes

    def _persist_ticket_hash(self, conn, ticket_hash: str):
        """Persist a ticket hash to SQLite for future duplicate detection."""
        try:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR IGNORE INTO synced_ticket_hashes (ticket_hash) VALUES (?)",
                (ticket_hash,)
            )
            conn.commit()
        except Exception as e:
            self.logger.warning(f"Failed to persist ticket hash: {e}")

    def sync_tickets(self):
        """Main sync logic: fetch unsynced tickets, send to API."""
        if not os.path.exists(self.db_path):
            self.logger.debug("No local sales DB found, skipping sync.")
            return
        
        try:
            conn = sqlite3.connect(self.db_path, timeout=10)
        except Exception as e:
            self.logger.error(f"Failed to connect to local DB: {e}")
            return
        
        try:
            last_synced_id = self._get_last_synced_id(conn)
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT id, ticket_number, sold_at, total_amount FROM legacy_sales_tickets "
                "WHERE id > ? ORDER BY id ASC LIMIT ?",
                (last_synced_id, self.config["max_batch_size"])
            )
            tickets = cursor.fetchall()
            
            if not tickets:
                return
            
            self.logger.info(f"Found {len(tickets)} unsynced ticket(s). Preparing payload...")
            
            payload_tickets = []
            max_id_processed = last_synced_id
            
            # Load persisted hashes for duplicate detection
            seen_hashes = self._load_seen_hashes(conn)
            
            for db_id, ticket_num, sold_at, total_amount in tickets:
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
                        "unit_price": unit_price,
                    })
                
                ticket = {
                    "external_ticket_id": ticket_num,
                    "ticket_date": sold_at + "Z",
                    "total_amount": total_amount,
                    "items": payload_items,
                }
                
                # Check for duplicate ticket
                ticket_hash = self._compute_ticket_hash(ticket)
                if ticket_hash in seen_hashes:
                    self.logger.warning(f"Duplicate ticket detected (hash collision): {ticket_num}")
                    max_id_processed = max(max_id_processed, db_id)
                    continue
                
                seen_hashes.add(ticket_hash)
                self._persist_ticket_hash(conn, ticket_hash)
                payload_tickets.append(ticket)
                max_id_processed = max(max_id_processed, db_id)
            
            if not payload_tickets:
                self.logger.info("All tickets in batch were duplicates. Updating offset.")
                self._update_last_synced_id(conn, max_id_processed)
                return
            
            # Check circuit breaker before sending
            if not self.circuit_breaker.allow_request():
                self.logger.warning(
                    f"Circuit breaker is OPEN. Skipping sync. Will retry in "
                    f"{self.config['circuit_breaker_reset']}s."
                )
                return
            
            payload = {
                "department_id": self.config["department_id"],
                "tickets": payload_tickets,
            }
            
            self.logger.info(f"Sending {len(payload_tickets)} ticket(s) to API...")
            result = self._send_sync_request(payload)
            
            if result and result.get("status") == "success":
                synced_count = result.get("synced_tickets_count", 0)
                warnings = result.get("warnings", [])
                self.logger.info(f"Successfully synced {synced_count} ticket(s)")
                
                if warnings:
                    for w in warnings:
                        self.logger.warning(f"API warning: {w}")
                
                self._update_last_synced_id(conn, max_id_processed)
            else:
                error_msg = result.get("message", "Unknown error") if result else "No response"
                self.logger.error(f"Sync failed: {error_msg}")
        
        except sqlite3.Error as e:
            self.logger.error(f"Database error during sync: {e}")
        except Exception as e:
            self.logger.error(f"Unexpected sync error: {e}", exc_info=True)
        finally:
            conn.close()
    
    def run(self):
        """Main loop with configurable interval."""
        interval = self.config["sync_interval"]
        
        self.logger.info("=== Sync Agent started ===")
        
        while self.running:
            try:
                self.sync_tickets()
            except Exception as e:
                self.logger.error(f"Uncaught loop exception: {e}", exc_info=True)
            
            if self.running:
                time.sleep(interval)
        
        self.logger.info("Sync Agent stopped.")


# ======================================================
# ENTRY POINT
# ======================================================

if __name__ == "__main__":
    config = load_config()
    agent = SyncAgent(config)
    agent.run()
