// UI Elements
const elements = {
  notEbay: document.getElementById('not-ebay'),
  loading: document.getElementById('loading'),
  cardInfo: document.getElementById('card-info'),
  cardName: document.getElementById('card-name'),
  cardYear: document.getElementById('card-year'),
  cardSet: document.getElementById('card-set'),
  cardInsert: document.getElementById('card-insert'),
  cardParallel: document.getElementById('card-parallel'),
  cardNumber: document.getElementById('card-number'),
  cardManufacturer: document.getElementById('card-manufacturer'),
  cardFeatures: document.getElementById('card-features'),
  cardError: document.getElementById('card-error'),
  cardGrade: document.getElementById('card-grade'),
  priceCardSummary: document.getElementById('price-card-summary'),
  resultsCardSummary: document.getElementById('results-card-summary'),
  searchBtn: document.getElementById('search-btn'),
  searchResults: document.getElementById('search-results'),
  resultsList: document.getElementById('results-list'),
  prices: document.getElementById('prices'),
  priceList: document.getElementById('price-list'),
  pricechartingLink: document.getElementById('pricecharting-link'),
  error: document.getElementById('error'),
  errorText: document.getElementById('error-text'),
  reportIssueLink: document.getElementById('report-issue-link')
};

let currentCardData = null;
let currentTabUrl = null;
let lastSearchResults = null;
let lastShowingVariants = false;
let lastExactMatchName = null;
let selectedVariant = null; // Track if user selected a variant (stores name and category/set)

// Show a specific section, hide others
function showSection(sectionId) {
  ['notEbay', 'loading', 'cardInfo', 'searchResults', 'prices', 'error'].forEach(id => {
    elements[id].classList.add('hidden');
  });
  if (sectionId && elements[sectionId]) {
    elements[sectionId].classList.remove('hidden');
  }
}

function showError(message) {
  elements.errorText.textContent = message;
  showSection('error');
}

function showNoResults() {
  const siteName = isSportsCard(currentCardData) ? 'SportsCardsPro' : 'PriceCharting';
  const itemType = isComicBook(currentCardData) ? 'comics' : 'cards';
  elements.errorText.textContent = `No matching ${itemType} found on ${siteName}. This item may not be in the database.`;
  showSection('error');
}

// Build card summary HTML for display on prices page
function buildCardSummaryHTML(data) {
  if (!data) return '';

  const isComic = isComicBook(data);
  const cleanNumber = data.number ? data.number.replace(/^#/, '') : null;
  const invalidSets = ['single', 'lot', 'set', 'bundle', 'collection'];
  const cleanSet = data.set && !invalidSets.includes(data.set.toLowerCase()) ? data.set : null;

  const lines = [];
  // Title: For comics use series, for cards use name
  const displayTitle = isComic && data.series ? data.series : data.name;
  if (displayTitle) lines.push(`<p class="summary-title">${escapeHtml(displayTitle)}</p>`);
  // Then the details
  // Skip year if the set already contains it
  const setContainsYear = cleanSet && data.year && cleanSet.includes(data.year);
  if (data.year && !setContainsYear) lines.push(`<p><span class="summary-label">Year:</span> ${escapeHtml(data.year)}</p>`);

  // For comics, show publisher instead of set
  if (isComic) {
    if (data.publisher) lines.push(`<p><span class="summary-label">Publisher:</span> ${escapeHtml(data.publisher)}</p>`);
  } else {
    if (cleanSet) lines.push(`<p><span class="summary-label">Set:</span> ${escapeHtml(cleanSet)}</p>`);
    else if (data.manufacturer) lines.push(`<p><span class="summary-label">Brand:</span> ${escapeHtml(data.manufacturer)}</p>`);
  }

  // Use appropriate label for number
  const numberLabel = isComic ? 'Issue #:' : 'Card #:';
  if (cleanNumber) lines.push(`<p><span class="summary-label">${numberLabel}</span> ${escapeHtml(cleanNumber)}</p>`);

  // For comics, show variant cover; for cards, show parallel/insert
  if (isComic) {
    if (data.variant && data.coverArtist) {
      lines.push(`<p><span class="summary-label">Variant:</span> ${escapeHtml(data.coverArtist)}</p>`);
    } else if (data.variant) {
      lines.push(`<p><span class="summary-label">Variant:</span> Cover Variant</p>`);
    }
  } else {
    if (data.parallel) lines.push(`<p><span class="summary-label">Parallel:</span> ${escapeHtml(data.parallel)}</p>`);
    if (data.insertSet) lines.push(`<p><span class="summary-label">Insert:</span> ${escapeHtml(data.insertSet)}</p>`);
  }
  if (data.grader && data.grade) lines.push(`<p><span class="summary-label">Grade:</span> ${escapeHtml(data.grader)} ${escapeHtml(data.grade)}</p>`);
  else if (data.grade) lines.push(`<p><span class="summary-label">Grade:</span> ${escapeHtml(data.grade)}</p>`);

  return lines.join('');
}

function showNoPriceData(card) {
  // Build card summary for prices page
  elements.priceCardSummary.innerHTML = buildCardSummaryHTML(currentCardData);

  const hasVariant = hasVariantData(currentCardData);

  elements.priceList.innerHTML = `
    <div class="no-price-message">
      <p>No price data available for this card.</p>
      <p class="no-price-hint">This is common for rare cards (1/1, low print runs) without enough sales history.</p>
      ${hasVariant ? '<button id="search-variants-btn" class="secondary-btn">Search Other Variants</button>' : ''}
    </div>
  `;

  // Add click handler for variant search button
  if (hasVariant) {
    document.getElementById('search-variants-btn').addEventListener('click', searchWithoutVariant);
  }

  elements.pricechartingLink.href = card.url;
  elements.pricechartingLink.textContent = isSportsCard(currentCardData) ? 'View on SportsCardsPro' : 'View on PriceCharting';
  showSection('prices');
}

async function searchWithoutVariant() {
  showSection('loading');

  try {
    const fallbackQuery = buildSearchQuery(currentCardData, false);
    const response = await chrome.runtime.sendMessage({
      action: 'searchPriceCharting',
      query: fallbackQuery,
      isSportsCard: isSportsCard(currentCardData)
    });

    let results;
    if (Array.isArray(response)) {
      results = response;
    } else {
      results = response.results;
    }

    if (results && results.length > 0) {
      displaySearchResults(results, true);
    } else {
      showError('No other variants found.');
    }
  } catch (err) {
    console.error('Variant search error:', err);
    showError('Failed to search for variants.');
  }
}

// Initialize popup
async function init() {
  showSection('loading');

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Check if we're on an eBay listing page
    if (!tab.url || !tab.url.includes('ebay.com/itm/')) {
      showSection('notEbay');
      return;
    }

    // Store the tab URL for issue reporting
    currentTabUrl = tab.url;

    // Request card data from content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getCardData' });

    if (response && response.success) {
      currentCardData = response.data;
      displayCardInfo(currentCardData);
      updateReportIssueLink();
    } else {
      showError(response?.error || 'Could not extract card details from this listing.');
    }
  } catch (err) {
    console.error('Init error:', err);
    showError('Could not connect to eBay page. Try refreshing the page.');
  }
}

function getItemTypeName(data) {
  if (isComicBook(data)) return 'Comic';
  return 'Card';
}

function displayCardInfo(data) {
  const isComic = isComicBook(data);
  const itemType = getItemTypeName(data);

  // Clean up data for display
  const cleanNumber = data.number ? data.number.replace(/^#/, '') : null;
  const invalidSets = ['single', 'lot', 'set', 'bundle', 'collection'];
  const cleanSet = data.set && !invalidSets.includes(data.set.toLowerCase()) ? data.set : null;
  const setContainsYear = cleanSet && data.year && cleanSet.includes(data.year);

  // Update header based on item type
  const detectedHeader = document.querySelector('#card-info .detected h2');
  if (detectedHeader) {
    detectedHeader.textContent = `Detected ${itemType}`;
  }

  // For comics, use series as the primary name if available
  if (isComic && data.series) {
    elements.cardName.textContent = data.series;
  } else {
    elements.cardName.textContent = data.name || `Unknown ${itemType}`;
  }

  elements.cardYear.textContent = (data.year && !setContainsYear) ? `Year: ${data.year}` : '';

  // For comics, show publisher instead of set
  if (isComic) {
    elements.cardSet.textContent = data.publisher ? `Publisher: ${data.publisher}` : '';
    elements.cardNumber.textContent = cleanNumber ? `Issue #: ${cleanNumber}` : '';
    // Show variant cover info
    if (data.variant && data.coverArtist) {
      elements.cardParallel.textContent = `Variant: ${data.coverArtist}`;
    } else if (data.variant) {
      elements.cardParallel.textContent = 'Variant Cover';
    } else {
      elements.cardParallel.textContent = '';
    }
    elements.cardInsert.textContent = '';
  } else {
    elements.cardSet.textContent = cleanSet ? `Set: ${cleanSet}` : '';
    elements.cardNumber.textContent = cleanNumber ? `Card #: ${cleanNumber}` : '';
    elements.cardInsert.textContent = data.insertSet ? `Insert: ${data.insertSet}` : '';
    elements.cardParallel.textContent = data.parallel ? `Parallel: ${data.parallel}` : '';
  }
  elements.cardManufacturer.textContent = data.manufacturer ? `Brand: ${data.manufacturer}` : '';
  elements.cardFeatures.textContent = data.features ? `Features: ${data.features}` : '';
  elements.cardError.textContent = data.error ? (data.error === 'Error' ? 'Note: Error Card' : `Error: ${data.error}`) : '';
  elements.cardGrade.textContent = data.grader && data.grade ? `Grade: ${data.grader} ${data.grade}` : (data.grade ? `Grade: ${data.grade}` : '');

  // Update button text based on card type
  elements.searchBtn.textContent = isSportsCard(data) ? 'Search SportsCardsPro' : 'Search PriceCharting';

  showSection('cardInfo');
}

// Search PriceCharting
elements.searchBtn.addEventListener('click', async () => {
  if (!currentCardData) return;

  elements.searchBtn.disabled = true;
  elements.searchBtn.textContent = 'Searching...';

  const sportsCard = isSportsCard(currentCardData);

  try {
    const query = buildSearchQuery(currentCardData);
    console.log('Card data:', currentCardData);
    console.log('Search query:', query, 'isSportsCard:', sportsCard);
    let response = await chrome.runtime.sendMessage({
      action: 'searchPriceCharting',
      query: query,
      isSportsCard: sportsCard
    });
    console.log('Search response:', response);

    // Handle exact match (array returned directly)
    if (Array.isArray(response)) {
      if (response.length === 1 && response[0].category === 'Exact Match') {
        // Check if exact match has prices before showing
        const exactMatchResult = await tryExactMatchWithPrices(response[0]);
        if (exactMatchResult.handled) return;
      } else {
        displaySearchResults(response);
        return;
      }
    }

    let results = response?.results || [];
    let showingVariants = false;

    // If no results and we have variant data, retry without variant
    if (results.length === 0 && hasVariantData(currentCardData)) {
      const fallbackQuery = buildSearchQuery(currentCardData, false);
      response = await chrome.runtime.sendMessage({
        action: 'searchPriceCharting',
        query: fallbackQuery,
        isSportsCard: sportsCard
      });

      if (Array.isArray(response)) {
        results = response;
      } else {
        results = response?.results || [];
      }
      showingVariants = true;
    }

    // If still no results and we have a card number, retry without card number
    if (results.length === 0 && currentCardData.number) {
      const fallbackQuery = buildSearchQuery(currentCardData, false, false);
      console.log('Fallback query (no number):', fallbackQuery);
      response = await chrome.runtime.sendMessage({
        action: 'searchPriceCharting',
        query: fallbackQuery,
        isSportsCard: sportsCard
      });
      console.log('Fallback response:', response);

      if (Array.isArray(response)) {
        results = response;
      } else {
        results = response?.results || [];
      }
      showingVariants = true;
    }

    // If still no results and we have a card number, try name + number only (no year, no set)
    if (results.length === 0 && currentCardData.number) {
      const fallbackQuery = buildSearchQuery(currentCardData, false, true, false, false);
      console.log('Fallback query (name + number):', fallbackQuery);
      response = await chrome.runtime.sendMessage({
        action: 'searchPriceCharting',
        query: fallbackQuery,
        isSportsCard: sportsCard
      });
      console.log('Fallback response (name + number):', response);

      if (Array.isArray(response)) {
        results = response;
      } else {
        results = response?.results || [];
      }
      showingVariants = true;
    }

    // If still no results, retry with just the card name (no set, no number, no variant)
    if (results.length === 0 && currentCardData.name) {
      const fallbackQuery = buildSearchQuery(currentCardData, false, false, true, false);
      console.log('Fallback query (name only):', fallbackQuery);
      response = await chrome.runtime.sendMessage({
        action: 'searchPriceCharting',
        query: fallbackQuery,
        isSportsCard: sportsCard
      });
      console.log('Fallback response (name only):', response);

      if (Array.isArray(response)) {
        results = response;
      } else {
        results = response?.results || [];
      }
      showingVariants = true;
    }

    // If still no results and we have a year, retry without year (handles year mismatches)
    if (results.length === 0 && currentCardData.year) {
      const fallbackQuery = buildSearchQuery(currentCardData, false, false, false, false);
      console.log('Fallback query (no year):', fallbackQuery);
      response = await chrome.runtime.sendMessage({
        action: 'searchPriceCharting',
        query: fallbackQuery,
        isSportsCard: sportsCard
      });
      console.log('Fallback response (no year):', response);

      if (Array.isArray(response)) {
        results = response;
      } else {
        results = response?.results || [];
      }
      showingVariants = true;
    }

    if (results.length > 0) {
      displaySearchResults(results, showingVariants);
    } else {
      showNoResults();
    }
  } catch (err) {
    console.error('Search error:', err);
    showError('Failed to search PriceCharting.');
  } finally {
    elements.searchBtn.disabled = false;
    elements.searchBtn.textContent = sportsCard ? 'Search SportsCardsPro' : 'Search PriceCharting';
  }
});

// Try exact match, check for prices, fall back to variants if none
async function tryExactMatchWithPrices(card) {
  selectedVariant = null; // Clear - this is an exact match

  const prices = await chrome.runtime.sendMessage({
    action: 'getCardPrices',
    url: card.url
  });

  // If prices found, show them
  if (prices && Object.keys(prices.grades).length > 0) {
    displayPrices(prices, card);
    return { handled: true };
  }

  // No prices - if we have variant data, search for other variants
  if (hasVariantData(currentCardData)) {
    const fallbackQuery = buildSearchQuery(currentCardData, false);
    const response = await chrome.runtime.sendMessage({
      action: 'searchPriceCharting',
      query: fallbackQuery,
      isSportsCard: isSportsCard(currentCardData)
    });

    let results;
    if (Array.isArray(response)) {
      results = response;
    } else {
      results = response?.results || [];
    }

    if (results.length > 0) {
      displaySearchResults(results, true, card.name);
      return { handled: true };
    }
  }

  // No variants found either, show the no-price message
  showNoPriceData(card);
  return { handled: true };
}

function buildSearchQuery(data, includeVariant = true, includeNumber = true, includeYear = true, includeSet = true) {
  // Check if this is a comic book - they need different query format
  if (isComicBook(data)) {
    return buildComicSearchQuery(data, includeNumber, includeYear);
  }

  // Player name, set, card number, and parallel/variant are key identifiers
  // Note: "error" is intentionally not included - too generic and pollutes search results
  const invalidSets = ['single', 'lot', 'set', 'bundle', 'collection'];
  const cleanSet = data.set && !invalidSets.includes(data.set.toLowerCase()) ? data.set : null;

  const parts = [];
  if (data.name) parts.push(data.name);
  // Include year only if set doesn't already contain it
  if (includeYear && data.year && !(cleanSet && cleanSet.includes(data.year))) {
    parts.push(data.year);
  }
  if (includeSet && cleanSet) {
    parts.push(cleanSet);
  } else if (includeSet && data.manufacturer) {
    // Use manufacturer as fallback when no set
    parts.push(data.manufacturer);
  }
  if (includeNumber && data.number) {
    // Format card number for PriceCharting search
    let num = data.number.replace(/^#/, ''); // Remove existing # if present
    // For slash format (10/62), extract just the first number
    if (num.includes('/')) {
      num = num.split('/')[0];
    }
    // Add # prefix for cleaner search matching
    parts.push('#' + num);
  }
  if (includeVariant) {
    if (data.parallel) parts.push(data.parallel);
    if (data.insertSet) parts.push(data.insertSet);
    // Include features (1st Edition, Full Art, Unlimited, etc.) - skip generic terms
    if (data.features) {
      const featuresLower = data.features.toLowerCase();
      const skipFeatures = ['normal', 'standard', 'regular', 'common'];
      if (!skipFeatures.some(skip => featuresLower === skip)) {
        parts.push(data.features);
      }
    }
  }
  return parts.join(' ').trim();
}

function buildComicSearchQuery(data, includeNumber = true, includeYear = true, includeVariant = true) {
  // Comics use series + issue number format
  // e.g., "Amazing Spider-Man #129" or "Batman 2016 #1"
  // Variants: "Spider-Man #1 Stegman" or "Spider-Man #1 Variant"
  const parts = [];

  // Use series if available, otherwise fall back to name
  if (data.series) {
    parts.push(data.series);
  } else if (data.name) {
    parts.push(data.name);
  }

  // Year helps disambiguate long-running series with multiple volumes
  if (includeYear && data.year) {
    parts.push(data.year);
  }

  // Issue number
  if (includeNumber && data.number) {
    let num = data.number.replace(/^#/, '');
    parts.push('#' + num);
  }

  // Include variant/cover artist info for better matching
  if (includeVariant && data.variant && data.coverArtist) {
    // Use cover artist name for variant (e.g., "Stegman")
    // Take just the last name if it's a full name
    const artistName = data.coverArtist.split(',')[0].trim(); // First artist if multiple
    const lastName = artistName.split(' ').pop(); // Last name
    parts.push(lastName);
  }

  return parts.join(' ').trim();
}

function hasVariantData(data) {
  if (data.parallel || data.insertSet) return true;
  // Check for non-generic features
  if (data.features) {
    const featuresLower = data.features.toLowerCase();
    const skipFeatures = ['normal', 'standard', 'regular', 'common'];
    if (!skipFeatures.some(skip => featuresLower === skip)) {
      return true;
    }
  }
  return false;
}

function isSportsCard(data) {
  // Comics are not sports cards - check first
  if (isComicBook(data)) {
    return false;
  }

  // Check if "sport" field exists and has a common sports value
  if (data.sport) {
    const sportLower = data.sport.toLowerCase();
    // Skip garbage values like "Raw", "N/A", etc.
    const invalidSports = ['raw', 'n/a', 'na', 'none', 'other', 'unspecified'];
    if (!invalidSports.includes(sportLower)) {
      const sports = ['baseball', 'football', 'basketball', 'hockey', 'soccer', 'golf', 'tennis', 'boxing', 'wrestling', 'racing', 'mma', 'ufc'];
      if (sports.some(s => sportLower.includes(s))) {
        return true;
      }
    }
    // If sport field exists but doesn't match, continue checking other fields
  }
  // If team field exists, it's likely a sports card
  if (data.team) {
    return true;
  }
  // Check if "game" field indicates a TCG (non-sports)
  if (data.game) {
    const gameLower = data.game.toLowerCase();
    const tcgGames = ['pokemon', 'pokémon', 'magic', 'yugioh', 'yu-gi-oh', 'digimon', 'lorcana', 'one piece', 'flesh and blood', 'metazoo', 'weiss schwarz'];
    if (tcgGames.some(g => gameLower.includes(g))) {
      return false;
    }
  }
  // Check if set/manufacturer suggests non-sports
  const nonSportsKeywords = ['marvel', 'pokemon', 'pokémon', 'magic', 'yugioh', 'digimon', 'dragon ball', 'garbage pail', 'lorcana', 'one piece', 'star wars', 'disney', 'dc comics', 'wizards of the coast', 'wizards', 'konami', 'bandai', 'ravensburger'];
  const setLower = (data.set || '').toLowerCase();
  const mfgLower = (data.manufacturer || '').toLowerCase();
  const titleLower = (data.title || '').toLowerCase();
  if (nonSportsKeywords.some(kw => setLower.includes(kw) || mfgLower.includes(kw) || titleLower.includes(kw))) {
    return false;
  }
  // Default to sports card (more common on eBay)
  return true;
}

function isComicBook(data) {
  // Check for era field - unique to comics
  if (data.era) {
    return true;
  }

  // Check for type field indicating comic book
  if (data.type) {
    const typeLower = data.type.toLowerCase();
    if (typeLower.includes('comic')) {
      return true;
    }
  }

  // Check for series field (comics have series, cards have sets)
  // But ignore if it's a known card brand (some eBay listings misuse this field)
  if (data.series) {
    const cardBrands = ['topps', 'panini', 'upper deck', 'bowman', 'donruss', 'fleer', 'score', 'leaf', 'maxx', 'press pass'];
    const seriesLower = data.series.toLowerCase();
    if (!cardBrands.some(brand => seriesLower.includes(brand))) {
      return true;
    }
  }

  // Check for comic-only graders (CBCS and PGX only do comics)
  if (data.grader) {
    const comicOnlyGraders = ['CBCS', 'PGX'];
    if (comicOnlyGraders.includes(data.grader.toUpperCase())) {
      return true;
    }
  }

  // Check for known comic publishers
  if (data.publisher) {
    const comicPublishers = ['marvel', 'dc comics', 'dc', 'image', 'dark horse', 'idw', 'boom', 'dynamite', 'valiant', 'archie', 'oni press', 'aftershock', 'scout', 'zenescope', 'ablaze', 'titan'];
    const publisherLower = data.publisher.toLowerCase();
    if (comicPublishers.some(p => publisherLower.includes(p))) {
      return true;
    }
  }

  // Check title for comic indicators
  if (data.title) {
    const titleLower = data.title.toLowerCase();
    // Check for comic graders in title
    if (/\b(cbcs|pgx)\s*\d/i.test(data.title)) {
      return true;
    }
    // Check for common comic keywords
    const comicKeywords = ['comic', 'graphic novel', 'variant cover', 'newsstand', 'direct edition', 'first print', '1st print', 'cgc signature'];
    if (comicKeywords.some(kw => titleLower.includes(kw))) {
      return true;
    }
  }

  return false;
}

function displaySearchResults(results, showingVariants = false, exactMatchName = null) {
  // Store for back button
  lastSearchResults = results;
  lastShowingVariants = showingVariants;
  lastExactMatchName = exactMatchName;

  // Update header based on item type
  const selectHeader = document.querySelector('#search-results h2');
  if (selectHeader) {
    const itemType = isComicBook(currentCardData) ? 'Comic' : 'Card';
    selectHeader.textContent = `Select ${itemType}`;
  }

  // Show card summary at the top for reference
  elements.resultsCardSummary.innerHTML = buildCardSummaryHTML(currentCardData);

  elements.resultsList.innerHTML = '';

  // Show note if displaying fallback results
  if (showingVariants) {
    const note = document.createElement('div');
    note.className = 'variant-note';
    if (exactMatchName) {
      note.textContent = `No price data for "${exactMatchName}". Showing near matches:`;
    } else {
      note.textContent = 'Multiple potential matches found:';
    }
    elements.resultsList.appendChild(note);
  }

  // Always show a note that exact item may not be listed
  const disclaimer = document.createElement('div');
  disclaimer.className = 'results-disclaimer';
  const disclaimerType = isComicBook(currentCardData) ? 'comic' : 'card';
  disclaimer.textContent = `Your exact ${disclaimerType} may not be listed.`;
  elements.resultsList.appendChild(disclaimer);

  results.forEach(result => {
    const item = document.createElement('div');
    item.className = 'result-item';
    item.innerHTML = `
      <div class="name">${escapeHtml(result.name)}</div>
      <div class="category">${escapeHtml(result.category || '')}</div>
    `;
    item.addEventListener('click', () => selectCard(result));
    elements.resultsList.appendChild(item);
  });

  showSection('searchResults');
}

async function selectCard(card) {
  showSection('loading');
  selectedVariant = { name: card.name, set: card.category }; // Track the variant being viewed

  try {
    const prices = await chrome.runtime.sendMessage({
      action: 'getCardPrices',
      url: card.url
    });

    if (prices && Object.keys(prices.grades).length > 0) {
      displayPrices(prices, card);
    } else {
      // Card found but no price data (common for rare 1/1 cards)
      showNoPriceData(card);
    }
  } catch (err) {
    console.error('Price fetch error:', err);
    showError('Failed to load card prices.');
  }
}

function displayPrices(prices, card) {
  // Build card summary for prices page
  elements.priceCardSummary.innerHTML = buildCardSummaryHTML(currentCardData);

  // Show variant warning if viewing a variant (not exact match)
  if (selectedVariant) {
    const variantNote = document.createElement('div');
    variantNote.className = 'variant-warning';
    let variantLines = '<div class="variant-warning-label">Viewing prices for:</div>';
    variantLines += `<div class="variant-warning-title">${escapeHtml(selectedVariant.name)}</div>`;
    if (selectedVariant.set) {
      variantLines += `<div class="variant-warning-detail"><span class="summary-label">Set:</span> ${escapeHtml(selectedVariant.set)}</div>`;
    }
    variantLines += '<div class="variant-warning-hint">This may not be your exact card.</div>';
    variantNote.innerHTML = variantLines;
    elements.priceCardSummary.appendChild(variantNote);
  }

  elements.priceList.innerHTML = '';

  // Check if we have a grade to highlight
  const cardGrade = currentCardData?.grade;
  const cardGrader = currentCardData?.grader;
  const cardGradeNum = cardGrade ? parseGradeNumber(cardGrade) : null;

  // Check for exact match first
  const hasExactMatch = cardGrade && Object.keys(prices.grades).some(g => isGradeMatch(g, cardGrade, cardGrader));

  // Find surrounding grades if no exact match
  let surroundingGrades = { below: null, above: null };
  if (cardGradeNum && !hasExactMatch) {
    surroundingGrades = findSurroundingGrades(prices.grades, cardGradeNum);
  }

  // Sort: Matching grade first, then surrounding grades, then Ungraded, then highest to lowest
  const sortedGrades = Object.entries(prices.grades).sort((a, b) => {
    const [gradeA, priceA] = a;
    const [gradeB, priceB] = b;

    // Exact matching grade always first
    const matchA = cardGrade && isGradeMatch(gradeA, cardGrade, cardGrader);
    const matchB = cardGrade && isGradeMatch(gradeB, cardGrade, cardGrader);
    if (matchA && !matchB) return -1;
    if (matchB && !matchA) return 1;

    // Surrounding grades next (when no exact match)
    if (!hasExactMatch && cardGradeNum) {
      const isSurroundingA = gradeA === surroundingGrades.above || gradeA === surroundingGrades.below;
      const isSurroundingB = gradeB === surroundingGrades.above || gradeB === surroundingGrades.below;
      if (isSurroundingA && !isSurroundingB) return -1;
      if (isSurroundingB && !isSurroundingA) return 1;
      // If both surrounding, put higher grade first (consistent with rest of list)
      if (isSurroundingA && isSurroundingB) {
        const numA = parseGradeNumber(gradeA);
        const numB = parseGradeNumber(gradeB);
        return numB - numA; // Higher grade first among surrounding
      }
    }

    // Ungraded next (if not the matching grade)
    if (gradeA.toLowerCase() === 'ungraded') return -1;
    if (gradeB.toLowerCase() === 'ungraded') return 1;

    // Extract numeric grade value
    const numA = parseGradeNumber(gradeA);
    const numB = parseGradeNumber(gradeB);

    // Sort by grade descending (highest first)
    if (numA !== numB) {
      return numB - numA;
    }

    // Same grade number - sort by price descending (most valuable first)
    return priceB - priceA;
  });

  sortedGrades.forEach(([grade, price]) => {
    const row = document.createElement('div');
    row.className = 'price-row';

    // Check if this row matches the card's grade exactly
    if (cardGrade && isGradeMatch(grade, cardGrade, cardGrader)) {
      row.classList.add('price-row-highlight');
    }
    // Or if it's a surrounding grade (when no exact match)
    else if (!hasExactMatch && cardGradeNum && (grade === surroundingGrades.above || grade === surroundingGrades.below)) {
      row.classList.add('price-row-surrounding');
    }

    row.innerHTML = `
      <span class="grade">${escapeHtml(grade)}</span>
      <span class="price">${formatPrice(price)}</span>
    `;
    elements.priceList.appendChild(row);
  });

  // Add back button if we have search results to go back to
  if (lastSearchResults && lastSearchResults.length > 1) {
    const backBtn = document.createElement('button');
    backBtn.className = 'secondary-btn back-btn';
    backBtn.textContent = '← Back to variants';
    backBtn.addEventListener('click', () => {
      displaySearchResults(lastSearchResults, lastShowingVariants, lastExactMatchName);
    });
    elements.priceList.appendChild(backBtn);
  }

  elements.pricechartingLink.href = card.url;
  elements.pricechartingLink.textContent = isSportsCard(currentCardData) ? 'View on SportsCardsPro' : 'View on PriceCharting';
  showSection('prices');
}

function parseGradeNumber(grade) {
  // Extract numeric grade from strings like "Grade 9", "PSA 10", "BGS 9.5", "TAG 10"
  const match = grade.match(/([\d.]+)/);
  return match ? parseFloat(match[1]) : 0;
}

function findSurroundingGrades(grades, targetGradeNum) {
  // Find the grades immediately above and below the target grade
  // Returns { below: gradeName, above: gradeName }
  let below = null;
  let above = null;
  let belowNum = -Infinity;
  let aboveNum = Infinity;

  for (const gradeName of Object.keys(grades)) {
    if (gradeName.toLowerCase() === 'ungraded') continue;

    const num = parseGradeNumber(gradeName);
    if (num === 0) continue;

    // Find closest grade below target
    if (num < targetGradeNum && num > belowNum) {
      belowNum = num;
      below = gradeName;
    }
    // Find closest grade above target
    if (num > targetGradeNum && num < aboveNum) {
      aboveNum = num;
      above = gradeName;
    }
  }

  return { below, above };
}

function isGradeMatch(priceListGrade, cardGrade, cardGrader) {
  const priceLower = priceListGrade.toLowerCase();
  const cardLower = cardGrade.toLowerCase();

  // Handle ungraded matching
  if (cardLower === 'ungraded') {
    return priceLower === 'ungraded';
  }

  const priceNum = parseGradeNumber(priceListGrade);
  const cardNum = parseGradeNumber(cardGrade);

  if (priceNum !== cardNum || priceNum === 0) return false;

  // For grade 10, also match the grader
  if (priceNum === 10 && cardGrader) {
    return priceLower.includes(cardGrader.toLowerCase());
  }

  return true;
}

function formatPrice(price) {
  if (typeof price === 'number') {
    return '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return price || 'N/A';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function updateReportIssueLink() {
  const baseUrl = 'https://github.com/iammike/cardcheck/issues/new';

  // Clean up eBay URL - keep only the base item URL
  let cleanUrl = currentTabUrl || 'Not available';
  if (cleanUrl.includes('?')) {
    cleanUrl = cleanUrl.split('?')[0];
  }

  // Determine item type for dynamic text
  const isComic = currentCardData ? isComicBook(currentCardData) : false;
  const itemType = isComic ? 'Comic' : 'Card';
  const itemTypeLower = itemType.toLowerCase();
  const numberLabel = isComic ? 'Issue #' : 'Card #';

  // Build issue body with debugging info
  const lines = [];

  // User input section at the top
  lines.push('## What went wrong?');
  lines.push(`<!-- Describe the issue here - e.g., "${itemType} not found", "Wrong price shown", "Name extracted incorrectly" -->`);
  lines.push('');
  lines.push('');
  lines.push('');
  lines.push('---');
  lines.push('*The following is auto-populated debug info - no need to edit below this line.*');
  lines.push('');
  lines.push('<details>');
  lines.push('<summary>Debug Info</summary>');
  lines.push('');
  lines.push('**eBay Listing:** ' + cleanUrl);
  lines.push('');
  if (currentCardData) {
    const query = buildSearchQuery(currentCardData);
    lines.push('**Search Query:** `' + query + '`');
    lines.push('');
    const detectedType = isSportsCard(currentCardData) ? 'Sports Card (SportsCardsPro)' :
                       isComic ? 'Comic Book (PriceCharting)' : 'Non-Sports (PriceCharting)';
    lines.push(`**Item Type:** ${detectedType}`);
    lines.push('');
    lines.push(`**Detected ${itemType} Data:**`);
    if (currentCardData.name) lines.push(`- Name: ${currentCardData.name}`);
    if (currentCardData.series) lines.push(`- Series: ${currentCardData.series}`);
    if (currentCardData.year) lines.push(`- Year: ${currentCardData.year}`);
    if (currentCardData.set) lines.push(`- Set: ${currentCardData.set}`);
    if (currentCardData.number) lines.push(`- ${numberLabel}: ${currentCardData.number}`);
    if (currentCardData.parallel) lines.push(`- Parallel: ${currentCardData.parallel}`);
    if (currentCardData.insertSet) lines.push(`- Insert: ${currentCardData.insertSet}`);
    if (currentCardData.manufacturer) lines.push(`- Manufacturer: ${currentCardData.manufacturer}`);
    if (currentCardData.publisher) lines.push(`- Publisher: ${currentCardData.publisher}`);
    if (currentCardData.era) lines.push(`- Era: ${currentCardData.era}`);
    if (currentCardData.grader) lines.push(`- Grader: ${currentCardData.grader}`);
    if (currentCardData.grade) lines.push(`- Grade: ${currentCardData.grade}`);
    if (currentCardData.sport) lines.push(`- Sport: ${currentCardData.sport}`);
    if (currentCardData.team) lines.push(`- Team: ${currentCardData.team}`);
    if (currentCardData.features) lines.push(`- Features: ${currentCardData.features}`);
    if (currentCardData.error) lines.push(`- Error: ${currentCardData.error}`);
  } else {
    lines.push('No data extracted');
  }
  lines.push('');
  lines.push('</details>');

  const body = lines.join('\n');
  const displayName = currentCardData?.series || currentCardData?.name;
  const title = displayName
    ? `${itemType} not detected correctly: ${displayName}`
    : `${itemType} not detected correctly`;

  const url = `${baseUrl}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=bug`;
  elements.reportIssueLink.href = url;

  // Update link text based on item type
  elements.reportIssueLink.textContent = `${itemType} not working? Report it`;
}

// Start
init();
