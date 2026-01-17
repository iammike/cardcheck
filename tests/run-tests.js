#!/usr/bin/env node
/**
 * Test runner for PriceChecking extension
 * Runs end-to-end tests against PriceCharting/SportsCardsPro
 */

const fs = require('fs');
const path = require('path');

// Load test cases
const testCases = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-cases.json'), 'utf8'));

// Simulate extraction from item specifics (mirrors content.js logic)
function extractCardData(testCase) {
  const data = {
    name: null,
    set: null,
    year: null,
    grade: null,
    grader: null,
    number: null,
    title: testCase.title || null,
    sport: null,
    team: null,
    manufacturer: null,
    game: null,
    insertSet: null,
    parallel: null,
    features: null,
    autographed: null,
    error: null,
    type: null,
    // Comic book fields
    publisher: null,
    era: null,
    series: null,
    coverArtist: null,
    variant: null
  };

  const specs = testCase.itemSpecifics;

  for (const [label, value] of Object.entries(specs)) {
    const labelLower = label.toLowerCase();

    // Name priority: player/athlete > card name > character
    const invalidNames = ['multi', 'various', 'n/a', 'multiple'];
    if (labelLower === 'player/athlete' || labelLower === 'player' || labelLower === 'athlete') {
      // Highest priority - real person's name (sports cards)
      if (!invalidNames.includes(value.toLowerCase())) {
        data.name = value;
        data._nameSource = 'player';
      }
    }
    else if (labelLower === 'card name') {
      // Medium priority - overwrites character but not player/athlete
      if (!invalidNames.includes(value.toLowerCase())) {
        if (data._nameSource !== 'player') {
          data.name = value;
          data._nameSource = 'cardname';
        }
      }
    }
    else if (labelLower === 'character') {
      // Lowest priority - only use if nothing better
      if (!invalidNames.includes(value.toLowerCase())) {
        if (!data._nameSource) {
          data.name = value;
          data._nameSource = 'character';
        }
      }
    }
    // Set - but not "insert set"
    else if (labelLower === 'set' && !labelLower.includes('insert')) {
      data.set = value;
    }
    // Product as fallback for set (only if we don't have a set yet)
    else if (labelLower === 'product' && !data.set) {
      const invalidProducts = ['single', 'single - insert', 'insert', 'box', 'pack', 'case'];
      if (!invalidProducts.includes(value.toLowerCase())) {
        data.set = value;
      }
    }
    // Insert Set
    else if (labelLower === 'insert set' || labelLower.includes('insert')) {
      data.insertSet = value;
    }
    // Parallel
    else if (labelLower.includes('parallel') || labelLower.includes('variety')) {
      if (value.toLowerCase().includes('error')) {
        data.error = value;
      } else {
        data.parallel = value;
      }
    }
    // Year - priority: year manufactured > season > year
    else if (labelLower === 'year manufactured') {
      data.year = value;
      data._yearSource = 'manufactured';
    }
    else if (labelLower === 'season') {
      if (data._yearSource !== 'manufactured') {
        data.year = value;
        data._yearSource = 'season';
      }
    }
    else if (labelLower === 'year') {
      if (!data._yearSource) {
        data.year = value;
        data._yearSource = 'year';
      }
    }
    // Grader
    else if ((labelLower.includes('grader') || labelLower === 'professional grader') && !labelLower.includes('certification')) {
      const abbrevMatch = value.match(/\((PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\)/i);
      if (abbrevMatch) {
        data.grader = abbrevMatch[1].toUpperCase();
      } else {
        const startsWithMatch = value.match(/^(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\b/i);
        data.grader = startsWithMatch ? startsWithMatch[1].toUpperCase() : value;
      }
    }
    // Grade
    else if (labelLower.includes('grade') && !labelLower.includes('grader') && labelLower !== 'graded') {
      const gradeNum = value.match(/\b(10|[1-9](?:\.\d)?)\b/);
      data.grade = gradeNum ? gradeNum[1] : value;
    }
    // Condition might contain grade info (e.g., "Graded - CGC 10: Professionally graded")
    else if (labelLower === 'condition') {
      const gradeMatch = value.match(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\s*(?:graded?|grade)?\s*(\d+\.?\d*)/i);
      if (gradeMatch) {
        data.grader = gradeMatch[1].toUpperCase();
        data.grade = gradeMatch[2];
      }
    }
    // Card number
    else if (labelLower === 'card number') {
      data.number = value;
    }
    // Sport
    else if (labelLower === 'sport') {
      data.sport = value;
    }
    // Team
    else if (labelLower === 'team') {
      data.team = value;
    }
    // Manufacturer
    else if (labelLower === 'manufacturer') {
      data.manufacturer = value;
    }
    // Game
    else if (labelLower === 'game') {
      data.game = value;
    }
    // Features
    else if (labelLower === 'features') {
      data.features = value;
      // Check for variant cover
      if (value.toLowerCase().includes('variant')) {
        data.variant = 'Variant Cover';
      }
    }
    // Variant Type (comics - e.g., "Newsstand Variant")
    else if (labelLower === 'variant type') {
      data.variant = value;
    }
    // Autographed
    else if (labelLower === 'autographed') {
      data.autographed = value;
    }
    // Type
    else if (labelLower === 'type') {
      data.type = value;
    }
    // Comic book fields
    else if (labelLower === 'publisher') {
      data.publisher = value;
    }
    else if (labelLower === 'era') {
      data.era = value;
    }
    else if (labelLower === 'series' || labelLower === 'series title' || labelLower === 'comic series') {
      data.series = value;
    }
    else if (labelLower === 'issue number' || labelLower === 'issue') {
      data.number = value;
    }
    else if (labelLower === 'publication year') {
      if (!data._yearSource || data._yearSource !== 'manufactured') {
        data.year = value;
        data._yearSource = 'publication';
      }
    }
    // Cover artist (comics)
    else if (labelLower === 'cover artist') {
      data.coverArtist = value;
    }
  }

  // Parse title for missing fields
  if (data.title && (!data.name || !data.year || !data.set || !data.number || !data.grade)) {
    const parsed = parseTitle(data.title);
    if (!data.name && parsed.name) data.name = parsed.name;
    if (!data.year && parsed.year) data.year = parsed.year;
    if (!data.set && parsed.set) data.set = parsed.set;
    if (!data.number && parsed.number) data.number = parsed.number;
    // Extract grade from title if not in item specifics
    if (!data.grade && parsed.grade) {
      data.grade = parsed.grade;
      data.grader = parsed.grader;
    }
  }

  // If title has a quoted name and current name came from character field, prefer the quoted name
  // (e.g., character="R2-D2" but title has "Artoo Detoo on the Rebel Starship")
  if (data.title && data._nameSource === 'character' && data.title.includes('"')) {
    const parsed = parseTitle(data.title);
    if (parsed.name) {
      data.name = parsed.name;
      data._nameSource = 'title';
    }
  }

  // Default grade
  if (!data.grade) {
    data.grade = 'Ungraded';
  }

  return data;
}

// Simplified title parsing (mirrors content.js)
function parseTitle(title) {
  const result = { name: null, set: null, year: null, number: null, grade: null, grader: null };

  let cleaned = title
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
    .replace(/\b(rare|invest|hot|fire|gem|mint|look|wow|must|see|read|nice|great|beautiful|gorgeous|stunning|pristine|perfect|excellent|amazing|incredible|awesome)\b/gi, '')
    .replace(/\*+\d*\s*$/, '')
    .trim();

  // Grade from title - handle "CGC 7.0", "CGC Graded 7.0", "PSA Grade 10"
  const gradeMatch = cleaned.match(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\s*(?:graded?|grade)?\s*(\d+\.?\d*)/i);
  if (gradeMatch) {
    result.grader = gradeMatch[1].toUpperCase();
    result.grade = gradeMatch[2];
  }

  // Year (handle year ranges like 2025-26)
  const yearMatch = cleaned.match(/\b(19\d{2}|20\d{2})(?:-\d{2})?\b/);
  if (yearMatch) result.year = yearMatch[1];

  // Card number (#777, #1, #TT-11, #LOB-001, #FSA-FC, No. 4, XXX/YYY format, etc.)
  const numberMatch = cleaned.match(/(?:#|No\.?\s*)([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(?:\/\d+)?/);
  if (numberMatch) {
    result.number = numberMatch[1];
  } else {
    // Try standalone XXX/YYY format (e.g., "081/199" print run format)
    const slashMatch = cleaned.match(/\b(\d{2,4})\/\d+\b/);
    if (slashMatch) {
      result.number = slashMatch[1];
    }
  }

  // Set from keywords
  const setPatterns = [
    /\b(topps|upper deck|fleer|donruss|panini|bowman|prizm|select|mosaic|optic)\b/i,
    /\b(star wars|pokemon|magic|yu-?gi-?oh|one piece|digimon|garbage pail)\b/i,
  ];
  for (const pattern of setPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      result.set = result.set ? result.set + ' ' + match[0] : match[0];
    }
  }

  // Try to extract quoted card name (common for non-sport cards like Star Wars)
  // e.g., "Artoo Detoo on the Rebel Starship" in title
  const quotedMatch = cleaned.match(/"([^"]+)"/);
  if (quotedMatch) {
    result.name = quotedMatch[1].trim();
  }
  // Try to find name after the card number (common pattern: "... #123 Player Name /99")
  // Note: [a-zA-Z']+ handles names like O'Neal, McDonald where uppercase follows apostrophe
  const afterNumberMatch = cleaned.match(/#[A-Za-z0-9-]+\s+([A-Z][a-z]+(?:\s+[A-Z][a-zA-Z']+)+)(?:\s+\/\d+)?/);
  if (!result.name && afterNumberMatch) {
    result.name = afterNumberMatch[1].trim();
  } else if (!result.name) {
    // Fallback: extract name from what's left
    let namePart = cleaned
      .replace(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\s*\d+\.?\d*/gi, '')
      .replace(/\b(19\d{2}|20\d{2})(?:-\d{2})?\b/g, '')
      .replace(/#[A-Za-z0-9-]+/g, '')
      .replace(/\/\d+\b/g, '')
      .replace(/\b(topps|upper deck|fleer|donruss|panini|bowman|star wars|pokemon|magic|galaxy|chrome|refractor|prizm|select|mosaic|optic|holo|foil)\b/gi, '')
      .replace(/[,|"]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (namePart.length > 0) {
      const words = namePart.split(' ').filter(w => w.length > 1).slice(0, 5).join(' ');
      result.name = words.replace(/[,.]$/, '');
    }
  }

  return result;
}

// Check if sports card (mirrors popup.js)
function isSportsCard(data) {
  if (data.sport) {
    const sportLower = data.sport.toLowerCase();
    // Skip garbage values like "Raw", "N/A", etc.
    const invalidSports = ['raw', 'n/a', 'na', 'none', 'other', 'unspecified'];
    if (!invalidSports.includes(sportLower)) {
      const sports = ['baseball', 'football', 'basketball', 'hockey', 'soccer', 'golf', 'tennis', 'boxing', 'wrestling', 'racing', 'mma', 'ufc'];
      if (sports.some(s => sportLower.includes(s))) return true;
    }
    // If sport field exists but doesn't match, continue checking other fields
  }
  if (data.team) return true;
  if (data.game) {
    const gameLower = data.game.toLowerCase();
    const tcgGames = ['pokemon', 'pokémon', 'magic', 'yugioh', 'yu-gi-oh', 'digimon', 'lorcana', 'one piece', 'flesh and blood', 'metazoo', 'weiss schwarz'];
    if (tcgGames.some(g => gameLower.includes(g))) return false;
  }
  // Check for comic book indicators
  if (data.era || data.series || (data.type && data.type.toLowerCase().includes('comic'))) {
    return false;
  }
  if (data.publisher) {
    const comicPublishers = ['marvel', 'dc comics', 'dc', 'image', 'dark horse', 'idw', 'boom', 'dynamite', 'valiant', 'archie', 'oni press', 'aftershock', 'scout', 'zenescope', 'ablaze', 'titan'];
    const publisherLower = data.publisher.toLowerCase();
    if (comicPublishers.some(p => publisherLower.includes(p))) return false;
  }
  const nonSportsKeywords = ['marvel', 'pokemon', 'pokémon', 'magic', 'yugioh', 'digimon', 'dragon ball', 'garbage pail', 'lorcana', 'one piece', 'star wars', 'disney', 'dc comics', 'wizards of the coast', 'wizards', 'konami', 'bandai', 'ravensburger'];
  const setLower = (data.set || '').toLowerCase();
  const mfgLower = (data.manufacturer || '').toLowerCase();
  const titleLower = (data.title || '').toLowerCase();
  if (nonSportsKeywords.some(kw => setLower.includes(kw) || mfgLower.includes(kw) || titleLower.includes(kw))) {
    return false;
  }
  return true;
}

// Check if this is a comic book (mirrors popup.js)
function isComicBook(data) {
  if (data.era) return true;
  if (data.type && data.type.toLowerCase().includes('comic')) return true;
  // Check series but ignore known card brands (some eBay listings misuse this field)
  if (data.series) {
    const cardBrands = ['topps', 'panini', 'upper deck', 'bowman', 'donruss', 'fleer', 'score', 'leaf', 'maxx', 'press pass'];
    const seriesLower = data.series.toLowerCase();
    if (!cardBrands.some(brand => seriesLower.includes(brand))) return true;
  }
  if (data.grader) {
    const comicOnlyGraders = ['CBCS', 'PGX'];
    if (comicOnlyGraders.includes(data.grader.toUpperCase())) return true;
  }
  if (data.publisher) {
    const comicPublishers = ['marvel', 'dc comics', 'dc', 'image', 'dark horse', 'idw', 'boom', 'dynamite', 'valiant', 'archie', 'oni press', 'aftershock', 'scout', 'zenescope', 'ablaze', 'titan'];
    const publisherLower = data.publisher.toLowerCase();
    if (comicPublishers.some(p => publisherLower.includes(p))) return true;
  }
  return false;
}

// Build comic search query (mirrors popup.js)
function buildComicSearchQuery(data) {
  const parts = [];
  if (data.series) {
    parts.push(data.series);
  } else if (data.name) {
    parts.push(data.name);
  }
  if (data.year) parts.push(data.year);
  if (data.number) {
    let num = data.number.replace(/^#/, '');
    parts.push('#' + num);
  }
  // Include variant/cover artist info for better matching
  if (data.variant && data.coverArtist) {
    const artistName = data.coverArtist.split(',')[0].trim();
    const lastName = artistName.split(' ').pop();
    parts.push(lastName);
  }
  return parts.join(' ').trim();
}

// Build search query (mirrors popup.js)
function buildSearchQuery(data) {
  // Check if this is a comic book - they need different query format
  if (isComicBook(data)) {
    return buildComicSearchQuery(data);
  }

  const invalidSets = ['single', 'lot', 'set', 'bundle', 'collection'];
  const cleanSet = data.set && !invalidSets.includes(data.set.toLowerCase()) ? data.set : null;

  const parts = [];
  if (data.name) parts.push(data.name);
  if (data.year && !(cleanSet && cleanSet.includes(data.year))) {
    parts.push(data.year);
  }
  if (cleanSet) {
    parts.push(cleanSet);
  } else if (data.manufacturer) {
    // Use manufacturer as fallback when no set
    parts.push(data.manufacturer);
  }
  if (data.number) {
    let num = data.number.replace(/^#/, '');
    if (num.includes('/')) num = num.split('/')[0];
    parts.push('#' + num);
  }
  if (data.parallel) parts.push(data.parallel);
  if (data.insertSet) parts.push(data.insertSet);
  if (data.features) {
    const featuresLower = data.features.toLowerCase();
    const skipFeatures = ['normal', 'standard', 'regular', 'common'];
    if (!skipFeatures.some(skip => featuresLower === skip)) {
      parts.push(data.features);
    }
  }
  return parts.join(' ').trim();
}

// Parse search results HTML to extract card names and URLs
function parseSearchResults(html) {
  const results = [];
  const flatHtml = html.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Pattern to capture card link, name, and category
  const cardPattern = /<td class="title">\s*<a\s+href="(https:\/\/www\.(?:sportscardspro|pricecharting)\.com\/game\/[^"]+)"[^>]*>\s*([^<]+)<\/a>[\s\S]*?<div class="console-in-title">\s*<a[^>]*>\s*([^<]+)<\/a>/gi;

  let match;
  while ((match = cardPattern.exec(flatHtml)) !== null) {
    const url = match[1];
    const name = match[2].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const category = match[3].trim().replace(/&amp;/g, '&');
    results.push({ name, url, category });
  }

  return results;
}

// Search PriceCharting/SportsCardsPro
async function searchCards(query, isSports) {
  const baseUrl = isSports
    ? 'https://www.sportscardspro.com'
    : 'https://www.pricecharting.com';
  const searchUrl = `${baseUrl}/search-products?q=${encodeURIComponent(query)}&type=prices`;

  try {
    const response = await fetch(searchUrl);
    const html = await response.text();
    const finalUrl = response.url;

    // Check for exact match redirect
    if (finalUrl.includes('/game/') && !finalUrl.includes('search-products')) {
      // Extract card name from page title
      const titleMatch = html.match(/<title>([^|<]+)/i);
      const name = titleMatch ? titleMatch[1].trim() : 'Exact Match';
      return { exactMatch: true, url: finalUrl, results: [{ name, url: finalUrl, category: 'Exact Match' }] };
    }

    // Parse actual results
    const results = parseSearchResults(html);
    return { exactMatch: false, resultCount: results.length, results, url: searchUrl };
  } catch (err) {
    return { error: err.message };
  }
}

// Check if expected result is in the actual results
function findExpectedResult(results, expectedName, expectedCategory) {
  if (!expectedName) return { found: true, skip: true }; // No expected result defined

  const expectedLower = expectedName.toLowerCase();
  const expectedCatLower = expectedCategory ? expectedCategory.toLowerCase() : null;
  const expectedCatWords = expectedCatLower ? expectedCatLower.split(/\s+/) : [];

  for (const result of results) {
    const nameLower = result.name.toLowerCase();
    const catLower = result.category.toLowerCase();

    // Check if the expected name appears in the result name
    if (nameLower.includes(expectedLower) || expectedLower.includes(nameLower)) {
      // If category is specified, check that too (word-based matching for flexibility)
      if (expectedCatLower) {
        // Check for substring match first
        if (catLower.includes(expectedCatLower) || expectedCatLower.includes(catLower)) {
          return { found: true, match: result };
        }
        // Check if most expected words appear in the category (handles word order differences)
        const matchedWords = expectedCatWords.filter(w => w.length > 2 && catLower.includes(w));
        if (matchedWords.length >= Math.ceil(expectedCatWords.length * 0.6)) {
          return { found: true, match: result };
        }
        // Handle "Exact Match" category (redirect case)
        if (catLower === 'exact match') {
          return { found: true, match: result };
        }
      } else {
        return { found: true, match: result };
      }
    }
  }

  return { found: false, topResults: results.slice(0, 3) };
}

// Run a single test case
async function runSingleTest(testCase) {
  const result = {
    name: testCase.name,
    status: null,
    message: null,
    failure: null
  };

  // Extract card data
  const cardData = extractCardData(testCase);

  // Check routing
  const isSports = isSportsCard(cardData);
  const expectedSite = testCase.expectedSite;
  const actualSite = isSports ? 'sportscardspro' : 'pricecharting';

  if (actualSite !== expectedSite) {
    result.status = 'fail';
    result.message = 'wrong routing';
    result.failure = {
      name: testCase.name,
      reason: `Expected ${expectedSite}, got ${actualSite}`,
      cardData
    };
    return result;
  }

  // Build query and search
  const query = buildSearchQuery(cardData);
  const searchResult = await searchCards(query, isSports);

  if (searchResult.error) {
    result.status = 'fail';
    result.message = searchResult.error;
    result.failure = { name: testCase.name, reason: searchResult.error };
    return result;
  }

  if (searchResult.results.length === 0) {
    result.status = 'fail';
    result.message = 'no results';
    result.failure = {
      name: testCase.name,
      reason: 'No results found',
      query,
      cardData
    };
    return result;
  }

  // Validate expected result is in the results
  const expectedName = testCase.expectedResultName;
  const expectedCategory = testCase.expectedResultCategory;
  const validation = findExpectedResult(searchResult.results, expectedName, expectedCategory);

  if (validation.skip) {
    result.status = 'pass';
    result.message = `${searchResult.exactMatch ? 'exact match' : searchResult.resultCount + ' results'} [no validation]`;
    result.skipped = true;
  } else if (validation.found) {
    result.status = 'pass';
    result.message = `found "${validation.match.name}" in ${validation.match.category}`;
  } else {
    result.status = 'fail';
    result.message = `expected "${expectedName}" not found`;
    result.failure = {
      name: testCase.name,
      reason: `Expected "${expectedName}" not in results`,
      query,
      topResults: validation.topResults
    };
  }

  return result;
}

// Run tests in parallel batches
async function runTests() {
  const BATCH_SIZE = 5; // Concurrent requests per batch
  const BATCH_DELAY = 500; // ms delay between batches

  console.log('PriceChecking Test Runner');
  console.log('=====================\n');
  console.log(`Running ${testCases.cases.length} test cases (${BATCH_SIZE} concurrent)...\n`);

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];
  const results = [];

  // Process in batches
  for (let i = 0; i < testCases.cases.length; i += BATCH_SIZE) {
    const batch = testCases.cases.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(tc => runSingleTest(tc)));
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < testCases.cases.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY));
    }
  }

  // Print results in order
  for (const result of results) {
    if (result.status === 'pass') {
      console.log(`Testing: ${result.name}... PASS - ${result.message}`);
      passed++;
      if (result.skipped) skipped++;
    } else {
      console.log(`Testing: ${result.name}... FAIL (${result.message})`);
      failed++;
      if (result.failure) failures.push(result.failure);
    }
  }

  console.log('\n=====================');
  console.log(`Results: ${passed} passed, ${failed} failed${skipped > 0 ? ` (${skipped} without validation)` : ''}`);

  if (failures.length > 0) {
    console.log('\nFailures:');
    for (const f of failures) {
      console.log(`\n- ${f.name}`);
      console.log(`  Reason: ${f.reason}`);
      if (f.query) console.log(`  Query: ${f.query}`);
      if (f.topResults) {
        console.log('  Top results:');
        for (const r of f.topResults) {
          console.log(`    - "${r.name}" (${r.category})`);
        }
      }
    }
  }

  process.exit(failed > 0 ? 1 : 0);
}


runTests();
