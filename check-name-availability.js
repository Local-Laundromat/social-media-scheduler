#!/usr/bin/env node

/**
 * Smart SaaS Name Scanner & Auto-Pivot Engine
 * Checks domain availability and trademark conflicts
 */

const dns = require('dns').promises;
const https = require('https');

// Creative SaaS name candidates for social media scheduler
const CANDIDATES = [
  // Pattern: Action + Creative
  'PostFlow',
  'SocialPulse',
  'ContentWave',
  'ScheduleKit',

  // Pattern: Metaphor-based
  'Launchpad',
  'Beacon',
  'Prism',
  'Catalyst',

  // Pattern: Made-up words
  'Schedulio',
  'Postify',
  'Socialy',
  'Queuely',

  // Pattern: Professional
  'OmniPost',
  'MultiCast',
  'SyncPost',
  'PostHub'
];

const EXTENSIONS = ['com', 'ai', 'social', 'io'];

/**
 * Check if domain is available via DNS lookup
 */
async function checkDomainAvailability(domain) {
  try {
    await dns.resolve(domain, 'A');
    return false; // Domain exists (taken)
  } catch (error) {
    if (error.code === 'ENOTFOUND' || error.code === 'ENODATA') {
      return true; // Domain doesn't exist (available)
    }
    return null; // Error checking
  }
}

/**
 * Check trademark conflicts via OpenCorporates API
 */
async function checkTrademarkConflicts(name) {
  return new Promise((resolve) => {
    const encodedName = encodeURIComponent(name);
    const url = `https://api.opencorporates.com/v0.4/companies/search?q=${encodedName}&per_page=5`;

    https.get(url, { headers: { 'User-Agent': 'SaaSBrandChecker/2.0' } }, (res) => {
      let data = '';

      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const totalResults = json.results?.total_count || 0;
          const companies = json.results?.companies || [];
          const samples = companies.slice(0, 2).map(c => c.company.name);

          resolve({
            safe: totalResults < 3, // Less than 3 is probably safe
            count: totalResults,
            samples
          });
        } catch (err) {
          resolve({ safe: true, count: 0, samples: [] });
        }
      });
    }).on('error', () => {
      resolve({ safe: true, count: 0, samples: [] });
    });
  });
}

/**
 * Generate variations of a base name
 */
function generateVariations(baseName) {
  const prefixes = ['get', 'try', 'use', 'join', 'go'];
  const suffixes = ['hq', 'labs', 'app', 'os', 'flow', 'core', 'grid', 'agent', 'stack', 'nexus'];

  const variations = [];

  // Add prefixes
  for (let i = 0; i < 3; i++) {
    variations.push(`${prefixes[i]}${baseName.toLowerCase()}`);
  }

  // Add suffixes
  for (let i = 0; i < 7; i++) {
    variations.push(`${baseName.toLowerCase()}${suffixes[i]}`);
  }

  return variations.map(v => v.charAt(0).toUpperCase() + v.slice(1));
}

/**
 * Score a name based on availability and conflicts
 */
function scoreName(results) {
  let score = 100;

  // Penalty for trademark conflicts
  if (!results.trademark.safe) {
    score -= 50;
  } else if (results.trademark.count > 0) {
    score -= 20;
  }

  // Bonus for domain availability
  const availableDomains = results.domains.filter(d => d.available).length;
  score += (availableDomains * 10);

  return score;
}

/**
 * Main scanner
 */
async function scanNames() {
  console.log('=== Smart SaaS Name Scanner & Auto-Pivot Engine ===\n');
  console.log(`Scanning ${CANDIDATES.length} creative name candidates...\n`);

  const results = [];

  for (const name of CANDIDATES) {
    console.log(`\n🔍 Scanning: "${name}"`);

    // Check trademark
    const trademark = await checkTrademarkConflicts(name);

    if (trademark.safe) {
      console.log('  ✓ Trademarks: Clear! No major conflicts.');
    } else {
      console.log(`  ⚠ Trademark Warning: ${trademark.count} similar entities found`);
      if (trademark.samples.length > 0) {
        console.log(`    Examples: ${trademark.samples.join(', ')}`);
      }
    }

    // Check domains
    console.log('  📡 Domain Availability:');
    const domains = [];

    for (const ext of EXTENSIONS) {
      const domain = `${name.toLowerCase()}.${ext}`;
      const available = await checkDomainAvailability(domain);

      const status = available ? '✓ Available' : available === false ? '✗ Taken' : '? Unknown';
      const emoji = available ? '🟢' : available === false ? '🔴' : '⚪';

      console.log(`    ${emoji} ${status.padEnd(12)} : ${domain}`);

      domains.push({ domain, available });

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    const nameResult = {
      name,
      trademark,
      domains,
      score: scoreName({ trademark, domains })
    };

    results.push(nameResult);
  }

  // Sort by score
  results.sort((a, b) => b.score - a.score);

  // Display top recommendations
  console.log('\n\n🏆 === TOP RECOMMENDATIONS === 🏆\n');

  const topPicks = results.filter(r => r.score >= 80).slice(0, 5);

  if (topPicks.length === 0) {
    console.log('⚠️  No clear winners found. Here are the best options:\n');
    results.slice(0, 5).forEach((r, i) => {
      const availableDomains = r.domains.filter(d => d.available).map(d => d.domain);
      console.log(`${i + 1}. ${r.name} (Score: ${r.score})`);
      if (availableDomains.length > 0) {
        console.log(`   Available: ${availableDomains.join(', ')}`);
      }
      console.log();
    });
  } else {
    topPicks.forEach((r, i) => {
      const availableDomains = r.domains.filter(d => d.available).map(d => d.domain);
      console.log(`${i + 1}. ⭐ ${r.name.toUpperCase()} ⭐ (Score: ${r.score}/150)`);
      console.log(`   Trademark: ${r.trademark.safe ? '✓ Clear' : '⚠ Conflicts'}`);
      if (availableDomains.length > 0) {
        console.log(`   🌐 Available domains: ${availableDomains.join(', ')}`);
      } else {
        console.log(`   ⚠ No domains available in .com/.ai/.social/.io`);
      }
      console.log();
    });
  }

  // Generate variations for top pick if needed
  const topPick = results[0];
  if (topPick.score < 100) {
    console.log(`\n🔄 Generating variations of "${topPick.name}"...\n`);
    const variations = generateVariations(topPick.name);

    for (const variant of variations.slice(0, 5)) {
      console.log(`  Checking: ${variant}`);
      const domain = `${variant.toLowerCase()}.com`;
      const available = await checkDomainAvailability(domain);
      console.log(`    ${available ? '🟢 Available' : '🔴 Taken'}: ${domain}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('\n✨ Scan complete! Choose a name with high score and available domain.\n');
}

// Run scanner
scanNames().catch(console.error);
