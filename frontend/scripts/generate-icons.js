#!/usr/bin/env node

/**
 * Simple script to generate placeholder PWA icons
 * Requires: npm install canvas (optional, will create SVG if canvas not available)
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

// Create simple SVG icons as fallback
function createSVGIcon(size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#2563EB"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="${size * 0.4}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">📖</text>
</svg>`;
}

// Try to use canvas if available, otherwise use SVG
try {
  const { createCanvas } = require('canvas');
  
  function createPNGIcon(size) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#2563EB';
    ctx.fillRect(0, 0, size, size);
    
    // Text/Icon
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${size * 0.3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📖', size / 2, size / 2);
    
    return canvas.toBuffer('image/png');
  }
  
  // Generate PNG icons
  console.log('Generating PNG icons with canvas...');
  fs.writeFileSync(path.join(publicDir, 'icon-192.png'), createPNGIcon(192));
  fs.writeFileSync(path.join(publicDir, 'icon-512.png'), createPNGIcon(512));
  console.log('✅ Created icon-192.png and icon-512.png');
  
} catch (e) {
  // Fallback to SVG (browsers can use SVG in manifest too)
  console.log('Canvas not available, creating SVG icons...');
  console.log('Note: For best PWA support, install canvas: npm install canvas');
  
  fs.writeFileSync(path.join(publicDir, 'icon-192.svg'), createSVGIcon(192));
  fs.writeFileSync(path.join(publicDir, 'icon-512.svg'), createSVGIcon(512));
  
  // Update manifest to use SVG
  const manifestPath = path.join(publicDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.icons = [
    {
      src: '/icon-192.svg',
      sizes: '192x192',
      type: 'image/svg+xml',
      purpose: 'any maskable'
    },
    {
      src: '/icon-512.svg',
      sizes: '512x512',
      type: 'image/svg+xml',
      purpose: 'any maskable'
    }
  ];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  console.log('✅ Created icon-192.svg and icon-512.svg');
  console.log('⚠️  Updated manifest.json to use SVG icons');
  console.log('💡 For better PWA support, install canvas and run again: npm install canvas');
}
