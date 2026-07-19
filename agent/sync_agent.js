const fs = require('fs');
const path = require('path');
const http = require('http');

const DB_PATH = path.join(__dirname, 'local_sales_db.json');
const METADATA_PATH = path.join(__dirname, 'sync_metadata.json');

// Configuration
const API_URL = process.env.MEPOS_API_URL || 'http://localhost:5000/api/v1/sales/sync';
const API_KEY = process.env.MEPOS_API_KEY || 'mepos_sec_key_prod_abc123';
const DEPARTMENT_ID = parseInt(process.env.MEPOS_DEPARTMENT_ID || '2', 10); // Cuisine
const SYNC_INTERVAL = parseInt(process.env.MEPOS_SYNC_INTERVAL || '10', 10) * 1000; // ms

function getOffset() {
  if (fs.existsSync(METADATA_PATH)) {
    try {
      const data = JSON.parse(fs.readFileSync(METADATA_PATH, 'utf-8'));
      return data.last_synced_id || 0;
    } catch (err) {
      return 0;
    }
  }
  return 0;
}

function updateOffset(lastId) {
  fs.writeFileSync(METADATA_PATH, JSON.stringify({ last_synced_id: lastId }, null, 2));
}

function syncTickets() {
  if (!fs.existsSync(DB_PATH)) {
    console.error(`Local POS database log not found at: ${DB_PATH}`);
    return;
  }

  let tickets = [];
  try {
    tickets = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (err) {
    console.error('Failed to parse local sales database log:', err.message);
    return;
  }

  const lastSyncedId = getOffset();
  const unsyncedTickets = tickets.filter(t => t.id > lastSyncedId).sort((a, b) => a.id - b.id);

  if (unsyncedTickets.length === 0) {
    // console.log('Local POS is up to date. Nothing to sync.');
    return;
  }

  console.log(`Found ${unsyncedTickets.length} new unsynced ticket(s) locally. Syncing to mePOS STOCK...`);

  const payloadTickets = unsyncedTickets.map(t => ({
    external_ticket_id: t.ticket_number,
    ticket_date: t.sold_at + 'Z',
    total_amount: t.total_amount,
    items: t.items.map(item => ({
      recipe_id: item.recipe_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      quantity_served: item.quantity_served
    }))
  }));

  const payload = {
    department_id: DEPARTMENT_ID,
    tickets: payloadTickets
  };

  const payloadStr = JSON.stringify(payload);
  const url = new URL(API_URL);

  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': API_KEY,
      'Content-Length': Buffer.byteLength(payloadStr)
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.setEncoding('utf-8');
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const resJson = JSON.parse(body);
        if (resJson.status === 'success') {
          const maxId = Math.max(...unsyncedTickets.map(t => t.id));
          updateOffset(maxId);
          console.log(`Successfully synced ${resJson.synced_tickets_count} ticket(s) to mePOS Cloud API.`);
          if (resJson.warnings && resJson.warnings.length > 0) {
            console.warn('\nAPI WARNINGS during stock deductions:\n', resJson.warnings.join('\n'));
          }
        } else {
          console.error('Cloud API sync failed:', body);
        }
      } catch (err) {
        console.error('Failed to parse API response:', body);
      }
    });
  });

  req.on('error', (err) => {
    console.error(`Failed to reach mePOS Cloud API: ${err.message}. Retrying at next interval.`);
  });

  req.write(payloadStr);
  req.end();
}

console.log('=== mePOS STOCK Legacy Sync Agent (Node.js) ===');
console.log(`Sync target: ${API_URL}`);
console.log(`Department ID: ${DEPARTMENT_ID}`);
console.log(`Sync Interval: ${SYNC_INTERVAL / 1000} seconds`);
console.log('--------------------------------------------------');

// Perform initial sync immediately
syncTickets();

// Schedule periodic syncs
setInterval(syncTickets, SYNC_INTERVAL);
