#!/bin/sh
# Drop ponder checkpoint tables to prevent "finalized block cannot move backwards" on VNet restarts
if [ -n "$DATABASE_URL" ]; then
  node -e "
    const { Client } = require('pg');
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    c.connect()
      .then(() => c.query('DROP SCHEMA IF EXISTS ponder CASCADE'))
      .then(() => c.query('DROP SCHEMA IF EXISTS ponder_sync CASCADE'))
      .then(() => { console.log('Cleared ponder schemas'); return c.end(); })
      .catch(e => { console.log('Skip schema clear:', e.message); c.end(); });
  " 2>/dev/null
  sleep 1
fi
exec npx ponder start --schema ponder
