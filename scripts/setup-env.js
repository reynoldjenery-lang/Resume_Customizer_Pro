#!/usr/bin/env node

/**
 * Setup script to add missing environment variables to .env file
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ENV_FILE = path.join(process.cwd(), '.env');

function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('base64');
}

function addTokenEncryptionKey() {
  try {
    // Check if .env file exists
    if (!fs.existsSync(ENV_FILE)) {
      console.log('❌ .env file not found. Please copy .env.example to .env first.');
      return false;
    }

    // Read current .env content
    const envContent = fs.readFileSync(ENV_FILE, 'utf8');
    
    // Check if TOKEN_ENCRYPTION_KEY already exists
    if (envContent.includes('TOKEN_ENCRYPTION_KEY=')) {
      console.log('✅ TOKEN_ENCRYPTION_KEY already exists in .env file.');
      return true;
    }

    // Generate new encryption key
    const encryptionKey = generateEncryptionKey();
    
    // Add TOKEN_ENCRYPTION_KEY to .env file
    const newContent = envContent + `\n# Token encryption key (auto-generated)\nTOKEN_ENCRYPTION_KEY=${encryptionKey}\n`;
    
    fs.writeFileSync(ENV_FILE, newContent);
    
    console.log('✅ Added TOKEN_ENCRYPTION_KEY to .env file');
    console.log(`🔐 Generated key: ${encryptionKey}`);
    
    return true;
  } catch (error) {
    console.error('❌ Error updating .env file:', error.message);
    return false;
  }
}

function fixRedisPassword() {
  try {
    if (!fs.existsSync(ENV_FILE)) {
      console.log('❌ .env file not found.');
      return false;
    }

    let envContent = fs.readFileSync(ENV_FILE, 'utf8');
    
    // Ensure REDIS_PASSWORD is empty or commented out
    if (envContent.includes('REDIS_PASSWORD=') && !envContent.includes('REDIS_PASSWORD=\n')) {
      envContent = envContent.replace(/REDIS_PASSWORD=.*/g, 'REDIS_PASSWORD=');
      fs.writeFileSync(ENV_FILE, envContent);
      console.log('✅ Fixed REDIS_PASSWORD in .env file (set to empty)');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error fixing Redis password:', error.message);
    return false;
  }
}

// Run the setup
console.log('🔧 Setting up environment variables...\n');

const tokenKeyAdded = addTokenEncryptionKey();
const redisPasswordFixed = fixRedisPassword();

if (tokenKeyAdded && redisPasswordFixed) {
  console.log('\n✅ Environment setup completed successfully!');
  console.log('🚀 You can now start the application without warnings.');
} else {
  console.log('\n❌ Environment setup failed. Please check the errors above.');
  process.exit(1);
}
