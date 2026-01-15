// Background service worker for PriceCharting requests

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'searchPriceCharting') {
    searchPriceCharting(request.query)
      .then(results => sendResponse(results))
      .catch(err => {
        console.error('Search error:', err);
        sendResponse([]);
      });
    return true; // Keep channel open for async
  }

  if (request.action === 'getCardPrices') {
    getCardPrices(request.url)
      .then(prices => sendResponse(prices))
      .catch(err => {
        console.error('Price fetch error:', err);
        sendResponse(null);
      });
    return true;
  }
});

async function searchPriceCharting(query, isRetry = false) {
  // Use PriceCharting.com for all card types (sports, Marvel, Pokemon, etc.)
  const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(query)}&type=prices`;
  console.log('Searching URL:', searchUrl);

  const response = await fetch(searchUrl);
  const finalUrl = response.url; // Check if we were redirected
  console.log('Final URL after fetch:', finalUrl);
  const html = await response.text();

  // If redirected directly to a card page (exact match), return that as the single result
  if (finalUrl.includes('/game/') && !finalUrl.includes('search-products')) {
    // Extract card name from page title
    const titleMatch = html.match(/<title>([^|<]+)/i);
    const name = titleMatch ? titleMatch[1].trim() : 'Exact Match';
    return [{ name, url: finalUrl, category: 'Exact Match' }];
  }

  const results = parseSearchResults(html, query);

  // Return results with retry flag info
  return { results, wasRetry: isRetry, originalQuery: query };
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function parseSearchResults(html, query = '') {
  const results = [];

  // Brand/set keywords to exclude from player name matching
  const brandKeywords = [
    // Card manufacturers
    'topps', 'panini', 'upper', 'deck', 'bowman', 'fleer', 'donruss', 'score', 'leaf',
    // Set types
    'chrome', 'prizm', 'select', 'mosaic', 'optic', 'absolute', 'prestige', 'contenders',
    'national', 'treasures', 'immaculate', 'spectra', 'obsidian', 'origins', 'phoenix',
    'certified', 'limited', 'playoff', 'classics', 'legacy', 'clearly', 'stadium', 'club',
    // Parallels/variants
    'refractor', 'parallel', 'auto', 'autograph', 'rookie', 'base', 'insert', 'gold', 'silver',
    'bronze', 'red', 'blue', 'green', 'orange', 'purple', 'pink', 'black', 'white', 'aqua',
    'shimmer', 'holo', 'holographic', 'foil', 'prism',
    // Sports
    'football', 'basketball', 'baseball', 'hockey', 'soccer',
    // Non-sports categories
    'marvel', 'dc', 'pokemon', 'magic', 'yugioh', 'disney', 'star', 'wars', 'trek',
    'anime', 'manga', 'gaming', 'entertainment', 'movie', 'film', 'television', 'tv',
    'universe', 'annual', 'series'
  ];

  // Extract player name, card number, and year from query
  const queryWords = query.toLowerCase().split(/\s+/);
  const playerNameWords = [];
  const setWords = [];
  let queryCardNumber = null;
  let queryYear = null;

  for (const word of queryWords) {
    // Check for year (4 digit numbers starting with 19 or 20)
    if (/^(19|20)\d{2}$/.test(word)) {
      queryYear = word;
      continue;
    }

    // Check for card number patterns:
    // - Numeric with optional # prefix (e.g., #186, 336)
    // - Alphanumeric with hyphen (e.g., LIOA-JW, RC-25)
    if (/^#?\d+$/.test(word)) {
      queryCardNumber = word.replace(/^#/, '');
      continue;
    }
    if (/^[a-z0-9]+-[a-z0-9]+$/i.test(word)) {
      queryCardNumber = word;
      continue;
    }

    // Separate brand/set keywords from player name
    if (brandKeywords.includes(word)) {
      setWords.push(word);
    } else {
      playerNameWords.push(word);
    }
  }
  const playerName = playerNameWords.join(' ');
  const querySet = setWords.join(' ');
  console.log('Filtering for player:', playerName, 'set:', querySet, 'card #:', queryCardNumber, 'year:', queryYear);
  console.log('Query words for scoring:', queryWords);

  // Remove newlines to make matching easier
  const flatHtml = html.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Pattern to capture card link, name, and the console/set info that follows
  const cardPattern = /<td class="title">\s*<a\s+href="(https:\/\/www\.pricecharting\.com\/game\/[^"]+)"[^>]*>\s*([^<]+)<\/a>[\s\S]*?<div class="console-in-title">\s*<a[^>]*>\s*([^<]+)<\/a>/gi;

  let match;
  while ((match = cardPattern.exec(flatHtml)) !== null) {
    const url = match[1];
    const name = decodeHtmlEntities(match[2].trim());
    const setName = decodeHtmlEntities(match[3].trim());

    // Skip invalid results
    const skipWords = ['see all', 'english', 'deutsch', 'español', 'français', 'view all'];
    const nameLower = name.toLowerCase();
    const shouldSkip = skipWords.some(w => nameLower === w || nameLower.includes(w));

    if (name && name.length > 3 && !shouldSkip) {
      const nameLowerForMatch = name.toLowerCase();
      const setLower = setName.toLowerCase();
      const fullText = (name + ' ' + setName).toLowerCase();

      // Filter by card number if we have one
      if (queryCardNumber) {
        // Match numeric (#123) or alphanumeric (#LIOA-JW, [LIOA-JW])
        const resultNumMatch = name.match(/#([a-z0-9-]+)/i) || name.match(/\[([a-z0-9-]+)\]/i);
        const resultNum = resultNumMatch ? resultNumMatch[1].toLowerCase() : null;
        if (!resultNum || resultNum !== queryCardNumber.toLowerCase()) {
          continue; // Skip - wrong card number
        }
        // Card number matched - also check year if we have one
        if (queryYear && !fullText.includes(queryYear)) {
          continue; // Skip - wrong year
        }
      } else {
        // No card number - filter by player name
        if (playerName && !nameLowerForMatch.includes(playerName)) {
          continue; // Skip - doesn't match player name
        }
      }

      // Filter by set keywords if we have them (check against set/category name)
      if (querySet) {
        const setKeywordsToMatch = querySet.split(' ');
        const matchesSet = setKeywordsToMatch.some(kw => setLower.includes(kw));
        if (!matchesSet) {
          continue; // Skip - wrong set
        }
      }

      // Score by how many query words appear in name + set
      let score = 0;
      for (const word of queryWords) {
        if (fullText.includes(word)) score++;
      }

      results.push({ name, url, category: setName, score });
    }
  }

  console.log('Results before dedup:', results.length);

  // Sort by score (best matches first)
  results.sort((a, b) => b.score - a.score);

  // Deduplicate by URL
  const seen = new Set();
  const unique = results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });

  console.log('Results after dedup:', unique.length);
  return unique.slice(0, 10);
}

async function getCardPrices(url) {
  const response = await fetch(url);
  const html = await response.text();

  return parsePricePage(html, url);
}

function parsePricePage(html, url) {
  const prices = {
    grades: {},
    url: url
  };

  // Remove newlines to make regex matching easier
  const flatHtml = html.replace(/\n/g, ' ').replace(/\s+/g, ' ');

  // Look for the full-prices table which has clean grade/price rows
  // Pattern: <td>Grade Name</td> <td class="price...">$X,XXX.XX</td>
  const priceRowPattern = /<tr>\s*<td>([^<]+)<\/td>\s*<td[^>]*class="[^"]*price[^"]*"[^>]*>\$([\d,]+\.?\d*)<\/td>/gi;

  let match;
  while ((match = priceRowPattern.exec(flatHtml)) !== null) {
    const grade = match[1].trim();
    const price = parseFloat(match[2].replace(/,/g, ''));

    if (grade && !isNaN(price) && price > 0) {
      prices.grades[grade] = price;
    }
  }

  return prices;
}

function parsePrice(text) {
  if (!text) return null;
  const match = text.match(/\$?([\d,]+\.?\d*)/);
  if (match) {
    return parseFloat(match[1].replace(/,/g, ''));
  }
  return null;
}

function formatGradeName(raw) {
  return raw
    .replace(/-/g, ' ')
    .replace(/(\w)(\d)/g, '$1 $2')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .replace(/Psa/g, 'PSA')
    .replace(/Bgs/g, 'BGS')
    .replace(/Cgc/g, 'CGC');
}
