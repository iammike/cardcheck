// Background service worker for PriceCharting requests

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'searchPriceCharting') {
    searchPriceCharting(request.query, false, request.isSportsCard)
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

async function searchPriceCharting(query, isRetry = false, isSportsCard = true) {
  // Route to appropriate site:
  // - SportsCardsPro for sports cards (baseball, football, basketball, hockey, soccer)
  // - PriceCharting for non-sports (Marvel, Pokemon, Magic, etc.)
  const baseUrl = isSportsCard
    ? 'https://www.sportscardspro.com'
    : 'https://www.pricecharting.com';
  const searchUrl = `${baseUrl}/search-products?q=${encodeURIComponent(query)}&type=prices`;
  console.log('Searching URL:', searchUrl, '(isSportsCard:', isSportsCard, ')');

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
    // Parallels/variants (avoid single colors - they're often part of card names like "Black Lotus")
    'refractor', 'parallel', 'auto', 'autograph', 'autographs', 'signature', 'signatures',
    'rookie', 'base', 'insert', 'gold', 'silver', 'bronze', 'platinum', 'diamond',
    'shimmer', 'holo', 'holographic', 'foil', 'prism', 'prizm', 'mojo', 'speckle',
    'wave', 'camo', 'tie-dye', 'snakeskin', 'scope', 'hyper', 'neon', 'laser',
    'portrait', 'luminance',
    // Sports
    'football', 'basketball', 'baseball', 'hockey', 'soccer',
    // Soccer/International leagues and terms
    'uefa', 'fifa', 'champions', 'league', 'premier', 'bundesliga', 'serie', 'liga',
    'competitions', 'club', 'match', 'attax', 'finest', 'merlin', 'stadium',
    // Non-sports categories (from PriceCharting)
    'pokemon', 'amiibo', 'digimon', 'dragon', 'ball', 'garbage', 'pail', 'lorcana',
    'marvel', 'magic', 'one', 'piece', 'star', 'wars', 'yugioh',
    // Pokemon sets
    'fossil', 'jungle', 'rocket', 'gym', 'heroes', 'challenge', 'neo', 'genesis',
    'discovery', 'revelation', 'destiny', 'legendary', 'expedition', 'aquapolis', 'skyridge',
    // Magic: The Gathering specific
    'gathering', 'unlimited', 'alpha', 'beta', 'revised', 'legends', 'antiquities',
    'arabian', 'nights', 'homelands', 'alliances', 'mirage', 'visions', 'weatherlight',
    // Disney Lorcana sets
    'first', 'chapter', 'rise', 'floodborn', 'into', 'inklands', 'ursula', 'return',
    'shimmering', 'skies', 'azurite', 'sea',
    // Common set name words and editions
    'the', 'edition', 'set', 'tcg', 'ccg', 'vol', 'volume', 'part', 'book',
    '1st', '2nd', '3rd',
    // Additional non-sports
    'dc', 'disney', 'trek', 'anime', 'manga', 'gaming', 'entertainment',
    'movie', 'film', 'television', 'tv', 'universe', 'annual', 'series', 'cards'
  ];

  // Extract player name, card number, and year from query
  const queryWords = query.toLowerCase().split(/\s+/);
  const playerNameWords = [];
  const setWords = [];
  let queryCardNumber = null;
  let queryYear = null;

  for (const word of queryWords) {
    // Skip standalone punctuation (e.g., "-" from "Genie - On The Job")
    if (/^[^\w]+$/.test(word)) {
      continue;
    }

    // Check for year (4 digit numbers starting with 19 or 20)
    if (/^(19|20)\d{2}$/.test(word)) {
      queryYear = word;
      continue;
    }

    // Check for year range (e.g., 2024-25, 2023-24) - skip these, they're part of set names
    if (/^(19|20)\d{2}-\d{2}$/.test(word)) {
      continue;
    }

    // Check for card number patterns:
    // - Numeric with optional # prefix (e.g., #186, 336)
    // - Numeric with slash (e.g., 10/62, 4/102) - common in Pokemon/TCG
    // - Alphanumeric with hyphen (e.g., LIOA-JW, RC-25, LOB-001)
    // - Alphanumeric without hyphen (e.g., EN004, BT01) - letters followed by numbers
    if (/^#?\d+$/.test(word)) {
      queryCardNumber = word.replace(/^#/, '');
      continue;
    }
    if (/^\d+\/\d+$/.test(word)) {
      // Extract just the card number before the slash (10/62 -> 10)
      queryCardNumber = word.split('/')[0];
      continue;
    }
    if (/^(?=.*\d)[a-z0-9]+-[a-z0-9]+$/i.test(word)) {
      // Hyphenated with at least one digit (LOB-001, RC-25) - not pure letters like BLUE-EYES
      queryCardNumber = word;
      continue;
    }
    if (/^[a-z]{1,4}\d{2,4}$/i.test(word)) {
      // Letters followed by numbers (EN004, BT01, OP01)
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
  // Matches both sportscardspro.com and pricecharting.com URLs
  const cardPattern = /<td class="title">\s*<a\s+href="(https:\/\/www\.(?:sportscardspro|pricecharting)\.com\/game\/[^"]+)"[^>]*>\s*([^<]+)<\/a>[\s\S]*?<div class="console-in-title">\s*<a[^>]*>\s*([^<]+)<\/a>/gi;

  let match;
  while ((match = cardPattern.exec(flatHtml)) !== null) {
    const url = decodeHtmlEntities(match[1]); // Decode &amp; in URLs like "Past-&-Present"
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
        // Match various card number formats in result names
        const resultNumMatch = name.match(/#([a-z0-9-]+)/i) ||           // #LOB-001, #123
                               name.match(/\[([a-z0-9-]+)\]/i) ||        // [LOB-001]
                               name.match(/\b(\d+)\/\d+\b/) ||           // 10/62
                               name.match(/\b([a-z]{1,4}\d{2,4})\b/i) || // EN004, BT01
                               name.match(/\b([a-z]{2,4}-\d{2,4})\b/i);  // LOB-001, SDK-001
        const resultNum = resultNumMatch ? resultNumMatch[1].toLowerCase() : null;
        // Only skip if result has a DIFFERENT card number (not if it has none)
        if (resultNum && resultNum !== queryCardNumber.toLowerCase()) {
          continue; // Skip - result has different card number
        }
        // Card number matched - also check year if we have one
        if (queryYear && !fullText.includes(queryYear)) {
          continue; // Skip - wrong year
        }
      } else {
        // No card number - filter by player name (check first word is present)
        if (playerName) {
          const playerWords = playerName.split(' ').filter(w => w.length > 1);
          // Only require the first word to match (main name like "Genie", "Lapras", etc.)
          const firstWord = playerWords[0];
          if (firstWord && !nameLowerForMatch.includes(firstWord)) {
            continue; // Skip - doesn't match player name
          }
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
  return unique.slice(0, 50);
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
