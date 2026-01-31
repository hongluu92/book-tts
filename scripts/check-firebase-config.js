#!/usr/bin/env node

/**
 * Script to check if Firebase environment variables are configured
 * Usage: node scripts/check-firebase-config.js
 */

// Load .env.local if it exists
require('dotenv').config({ path: '.env.local' })

const requiredVars = [
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
  'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'NEXT_PUBLIC_FIREBASE_APP_ID',
]

console.log('🔍 Checking Firebase configuration...\n')

let allConfigured = true
const missing = []
const configured = []

requiredVars.forEach((varName) => {
  const value = process.env[varName]
  if (!value || value.trim() === '') {
    missing.push(varName)
    allConfigured = false
  } else {
    configured.push(varName)
  }
})

if (allConfigured) {
  console.log('✅ All Firebase environment variables are configured!\n')
  console.log('Configured variables:')
  configured.forEach((varName) => {
    const value = process.env[varName]
    // Mask sensitive values
    const displayValue = varName.includes('API_KEY') 
      ? value.substring(0, 10) + '...' 
      : value
    console.log(`  ✓ ${varName} = ${displayValue}`)
  })
  console.log('\n✨ Firebase is ready to use!')
  process.exit(0)
} else {
  console.log('❌ Missing Firebase environment variables:\n')
  missing.forEach((varName) => {
    console.log(`  ✗ ${varName}`)
  })
  console.log('\n📝 To fix this:')
  console.log('1. Create a .env.local file in the project root')
  console.log('2. Add the missing variables (see docs/FIREBASE_SETUP.md)')
  console.log('3. For GitHub Actions, add them as repository secrets')
  console.log('\n📖 See docs/FIREBASE_SETUP.md for detailed instructions')
  process.exit(1)
}
