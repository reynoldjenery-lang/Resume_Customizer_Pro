import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from "@shared/schema";
import { config } from 'dotenv';

// Ensure environment variables are loaded before accessing them
config();

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Use HTTP adapter for better stability (no WebSocket issues)
console.log('Connecting to Neon database via HTTP...');
export const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
