#!/usr/bin/env node

/**
 * Generate a secure TOKEN_ENCRYPTION_KEY for the application
 * This script generates a cryptographically secure 32-byte key encoded as base64
 */

import crypto from 'crypto';

function generateEncryptionKey() {
  // Generate 32 random bytes (256 bits)
  const key = crypto.randomBytes(32);
  
  // Convert to base64 for easy storage in environment variables
  const base64Key = key.toString('base64');
  
  console.log('🔐 Generated TOKEN_ENCRYPTION_KEY:');
  console.log('');
  console.log(`TOKEN_ENCRYPTION_KEY=${base64Key}`);
  console.log('');
  console.log('📋 Copy the line above and add it to your .env file');
  console.log('');
  console.log('ℹ️  This key is used to encrypt sensitive tokens in the application.');
  console.log('   Keep it secure and never commit it to version control.');
  
  return base64Key;
}

// Run the function
generateEncryptionKey();

export { generateEncryptionKey };
