#!/usr/bin/env node

/**
 * Test API Connection Script
 * 
 * Verifies that the mobile app can connect to the backend API
 * and the version endpoints are working correctly.
 */

const https = require('https');
const http = require('http');

// Read API URL from app.json
const appJson = require('../app.json');
const domain = appJson.expo.extra?.domain || 'spotify-api-drab.vercel.app';
const apiUrl = domain.startsWith('http') ? domain : `https://${domain}`;

console.log('\n🔍 Testing API Connection...\n');
console.log(`📡 API URL: ${apiUrl}\n`);

// Test 1: Check version endpoint
function testVersionCheck() {
  return new Promise((resolve, reject) => {
    const url = `${apiUrl}/api/version/check`;
    console.log(`1️⃣  Testing: GET ${url}`);
    
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          if (res.statusCode === 200 && json.success) {
            console.log('   ✅ Version check endpoint working');
            console.log(`   📦 Latest version: ${json.data.latestVersion}`);
            console.log(`   🔒 Minimum version: ${json.data.minimumSupportedVersion}`);
            console.log(`   ⚠️  Force update: ${json.data.forceUpdate}`);
            resolve(json.data);
          } else {
            console.log(`   ❌ Failed: ${res.statusCode}`);
            console.log(`   Response: ${data}`);
            reject(new Error(`Status ${res.statusCode}`));
          }
        } catch (error) {
          console.log(`   ❌ Invalid JSON response`);
          console.log(`   Response: ${data}`);
          reject(error);
        }
      });
    }).on('error', (error) => {
      console.log(`   ❌ Connection failed: ${error.message}`);
      reject(error);
    });
  });
}

// Test 2: Compare version endpoint
function testVersionCompare(currentVersion = '1.0.0') {
  return new Promise((resolve, reject) => {
    const url = `${apiUrl}/api/version/compare`;
    console.log(`\n2️⃣  Testing: POST ${url}`);
    console.log(`   Current version: ${currentVersion}`);
    
    const urlObj = new URL(url);
    const client = url.startsWith('https') ? https : http;
    
    const postData = JSON.stringify({ currentVersion });
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          
          if (res.statusCode === 200 && json.success) {
            console.log('   ✅ Version compare endpoint working');
            console.log(`   📊 Update available: ${json.data.updateAvailable}`);
            console.log(`   🚀 Latest: ${json.data.latestVersion}`);
            console.log(`   📱 Current: ${json.data.currentVersion}`);
            
            if (json.data.updateAvailable) {
              console.log(`   💬 Message: ${json.data.message}`);
              console.log(`   📝 Changelog items: ${json.data.changelog?.length || 0}`);
            }
            
            resolve(json.data);
          } else {
            console.log(`   ❌ Failed: ${res.statusCode}`);
            console.log(`   Response: ${data}`);
            reject(new Error(`Status ${res.statusCode}`));
          }
        } catch (error) {
          console.log(`   ❌ Invalid JSON response`);
          console.log(`   Response: ${data}`);
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log(`   ❌ Connection failed: ${error.message}`);
      reject(error);
    });
    
    req.write(postData);
    req.end();
  });
}

// Test 3: Check if backend is reachable
function testBackendHealth() {
  return new Promise((resolve, reject) => {
    const url = `${apiUrl}/`;
    console.log(`\n3️⃣  Testing: GET ${url}`);
    
    const client = url.startsWith('https') ? https : http;
    
    client.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('   ✅ Backend is reachable');
          try {
            const json = JSON.parse(data);
            if (json.message) {
              console.log(`   💬 ${json.message}`);
            }
          } catch (e) {
            // Not JSON, that's okay
          }
          resolve();
        } else {
          console.log(`   ⚠️  Backend returned: ${res.statusCode}`);
          resolve(); // Don't fail on this
        }
      });
    }).on('error', (error) => {
      console.log(`   ❌ Backend unreachable: ${error.message}`);
      reject(error);
    });
  });
}

// Run all tests
async function runTests() {
  try {
    await testBackendHealth();
    await testVersionCheck();
    await testVersionCompare('1.0.0');
    
    console.log('\n✅ All tests passed!\n');
    console.log('📱 Your mobile app will connect to:', apiUrl);
    console.log('🎉 Update system is ready to use!\n');
    
    process.exit(0);
  } catch (error) {
    console.log('\n❌ Tests failed!\n');
    console.log('🔧 Troubleshooting:');
    console.log('   1. Check if backend is deployed');
    console.log('   2. Verify API URL in app.json');
    console.log('   3. Ensure version routes are added to backend');
    console.log('   4. Check backend logs for errors\n');
    
    process.exit(1);
  }
}

runTests();
