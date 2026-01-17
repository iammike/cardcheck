// Content script for extracting card data from eBay listings

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCardData') {
    try {
      const cardData = extractCardData();
      sendResponse({ success: true, data: cardData });
    } catch (err) {
      console.error('PriceChecking extraction error:', err);
      sendResponse({ success: false, error: err.message });
    }
  }
  return true; // Keep channel open for async response
});

function extractCardData() {
  const data = {
    name: null,
    set: null,
    year: null,
    grade: null,
    grader: null,
    number: null,
    title: null,
    // Additional fields for better matching
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

  // Get the listing title as fallback
  const titleElement = document.querySelector('h1.x-item-title__mainTitle span') ||
                       document.querySelector('[data-testid="x-item-title"] span') ||
                       document.querySelector('.x-item-title__mainTitle');

  if (titleElement) {
    data.title = titleElement.textContent.trim();
  }

  // Try to extract from Item Specifics table
  const specificsTable = document.querySelector('.x-about-this-item') ||
                         document.querySelector('[data-testid="ux-layout-section-evo"]') ||
                         document.querySelector('.ux-layout-section--features');

  if (specificsTable) {
    const rows = specificsTable.querySelectorAll('.ux-labels-values__labels-content, .x-item-specifics-table tr');

    // Also try the newer eBay layout
    const labelValuePairs = specificsTable.querySelectorAll('.ux-labels-values');

    labelValuePairs.forEach(pair => {
      const label = pair.querySelector('.ux-labels-values__labels span, .ux-labels-values__labels-content')?.textContent?.trim().toLowerCase();
      const value = pair.querySelector('.ux-labels-values__values span, .ux-labels-values__values-content')?.textContent?.trim();

      if (label && value) {
        console.log('Item Specific:', label, '=', value);
        mapSpecificToData(label, value, data);
      }
    });
  }

  // Try newer item specifics format
  const specsContainer = document.querySelector('#viTabs_0_is');
  if (specsContainer) {
    const specRows = specsContainer.querySelectorAll('.ux-layout-section-evo__row');
    specRows.forEach(row => {
      const cols = row.querySelectorAll('.ux-layout-section-evo__col');
      cols.forEach(col => {
        const label = col.querySelector('.ux-labels-values__labels')?.textContent?.trim().toLowerCase();
        const value = col.querySelector('.ux-labels-values__values')?.textContent?.trim();
        if (label && value) {
          console.log('Item Specific (alt):', label, '=', value);
          mapSpecificToData(label, value, data);
        }
      });
    });
  }

  // If no structured data found, try to parse the title
  if (!data.name && data.title) {
    const parsed = parseTitle(data.title);
    Object.assign(data, parsed);
  }

  // Even if we have a name, parse title to fill in missing year/set/number
  if (data.title && (!data.year || !data.set || !data.number)) {
    const parsed = parseTitle(data.title);
    if (!data.year && parsed.year) data.year = parsed.year;
    if (!data.set && parsed.set) data.set = parsed.set;
    if (!data.number && parsed.number) data.number = parsed.number;
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

  // Check title for error card indication (even if we have structured data)
  if (!data.error && data.title) {
    const titleLower = data.title.toLowerCase();
    if (titleLower.includes('error') && !titleLower.includes('error-free')) {
      data.error = 'Error';
    }
  }

  // Check title for grade if not found in structured data
  if (!data.grade && data.title) {
    // Match patterns like "CGC 7.0", "CGC Graded 7.0", "PSA Grade 10"
    const gradeMatch = data.title.match(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\s*(?:graded?|grade)?\s*(\d+\.?\d*)/i);
    if (gradeMatch) {
      data.grader = gradeMatch[1].toUpperCase();
      data.grade = gradeMatch[2];
    }
  }

  // Default to Ungraded if no grade found
  if (!data.grade) {
    data.grade = 'Ungraded';
  }

  console.log('Extracted card data:', data);
  return data;
}

function mapSpecificToData(label, value, data) {
  // Name priority: player/athlete > card name > character
  // Skip generic placeholders like "Multi", "Various", "N/A"
  const invalidPlayerNames = ['multi', 'various', 'n/a', 'multiple', 'see description', 'assorted'];
  if (label === 'player/athlete' || label === 'player' || label === 'athlete') {
    // Highest priority - real person's name (sports cards)
    if (!invalidPlayerNames.includes(value.toLowerCase())) {
      data.name = value;
      data._nameSource = 'player'; // Track source for priority
    }
  }
  else if (label === 'card name') {
    // Medium priority - overwrites character but not player/athlete
    if (!invalidPlayerNames.includes(value.toLowerCase())) {
      if (data._nameSource !== 'player') {
        data.name = value;
        data._nameSource = 'cardname';
      }
    }
  }
  else if (label === 'character') {
    // Lowest priority - only use if nothing better
    if (!invalidPlayerNames.includes(value.toLowerCase())) {
      if (!data._nameSource) {
        data.name = value;
        data._nameSource = 'character';
      }
    }
  }
  // Set - but not "insert set"
  else if (label === 'set' && !label.includes('insert')) {
    data.set = value;
  }
  // Product as fallback for set (only if we don't have a set yet)
  else if (label === 'product' && !data.set) {
    // Skip generic product types that aren't real set names
    const invalidProducts = ['single', 'single - insert', 'insert', 'box', 'pack', 'case'];
    if (!invalidProducts.includes(value.toLowerCase())) {
      data.set = value;
    }
  }
  // Insert Set (e.g., "Rookie Ticket")
  else if (label === 'insert set' || label.includes('insert')) {
    data.insertSet = value;
  }
  // Parallel/Variety
  else if (label.includes('parallel') || label.includes('variety')) {
    // Check if this is actually an error card mislabeled as parallel
    if (value.toLowerCase().includes('error')) {
      // Use the full value as the error type (e.g., "'Yellow Dot' Error")
      data.error = value;
      // Don't set as parallel - error cards aren't parallels
    } else {
      data.parallel = value;
    }
  }
  // Year - priority: year manufactured > season > year
  else if (label === 'year manufactured') {
    data.year = value;
    data._yearSource = 'manufactured';
  }
  else if (label === 'season') {
    if (data._yearSource !== 'manufactured') {
      data.year = value;
      data._yearSource = 'season';
    }
  }
  else if (label === 'year') {
    if (!data._yearSource) {
      data.year = value;
      data._yearSource = 'year';
    }
  }
  // Grading company (check this first before grade, but NOT certification number)
  else if ((label.includes('grader') || label === 'professional grader') && !label.includes('certification')) {
    // Extract abbreviation from full name like "Beckett Grading Services (BGS)" or "Professional Sports Authenticator (PSA)"
    const abbrevMatch = value.match(/\((PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\)/i);
    if (abbrevMatch) {
      data.grader = abbrevMatch[1].toUpperCase();
    } else {
      // Fallback: check if value starts with known abbreviation
      const startsWithMatch = value.match(/^(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\b/i);
      data.grader = startsWithMatch ? startsWithMatch[1].toUpperCase() : value;
    }
  }
  // Grade (must not be "grader" or "graded" fields)
  else if (label.includes('grade') && !label.includes('grader') && label !== 'graded') {
    // Extract just the numeric grade (1-10, with decimals like .5, .6, .8)
    // This filters out certification numbers that might get mixed in
    const gradeNum = value.match(/\b(10|[1-9](?:\.\d)?)\b/);
    if (gradeNum) {
      data.grade = gradeNum[1];
    } else {
      data.grade = value;
    }
  }
  // Condition might contain grade info
  else if (label === 'condition') {
    // Check if it looks like a grade (e.g., "PSA 10", "BGS 9.5")
    const gradeMatch = value.match(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\s*(\d+\.?\d*)/i);
    if (gradeMatch) {
      data.grader = gradeMatch[1].toUpperCase();
      data.grade = gradeMatch[2];
    }
  }
  // Card number
  else if (label === 'card number') {
    data.number = value;
  }
  // Sport
  else if (label === 'sport') {
    data.sport = value;
  }
  // Team
  else if (label === 'team') {
    data.team = value;
  }
  // Manufacturer
  else if (label === 'manufacturer') {
    data.manufacturer = value;
  }
  // Game (e.g., "Pokémon TCG", "Magic: The Gathering")
  else if (label === 'game') {
    data.game = value;
  }
  // Features (Rookie, Short Print, Autograph, Error, Variant Cover, etc.)
  else if (label === 'features') {
    data.features = value;
    // Check for error in features
    if (value.toLowerCase().includes('error')) {
      data.error = 'Error';
    }
    // Check for variant cover (comics)
    if (value.toLowerCase().includes('variant')) {
      data.variant = 'Variant Cover';
    }
  }
  // Variant Type (comics - e.g., "Newsstand Variant", "Direct Edition")
  else if (label === 'variant type') {
    data.variant = value;
  }
  // Autographed
  else if (label === 'autographed') {
    data.autographed = value;
  }
  // Type (may contain "Error")
  else if (label === 'type' || label === 'card type') {
    data.type = value;
    // Also check if it's an error card
    if (value.toLowerCase().includes('error')) {
      data.error = 'Error';
    }
  }
  // Card attributes
  else if (label === 'card attributes' || label === 'attributes') {
    // Check for error in attributes
    if (value.toLowerCase().includes('error')) {
      data.error = 'Error';
    }
  }
  // Comic book fields
  else if (label === 'publisher') {
    data.publisher = value;
  }
  else if (label === 'era') {
    data.era = value;
  }
  else if (label === 'series' || label === 'series title' || label === 'comic series') {
    data.series = value;
  }
  else if (label === 'issue number' || label === 'issue') {
    // For comics, issue number goes to the number field
    data.number = value;
  }
  // Publication year (comics use this instead of "year manufactured")
  else if (label === 'publication year') {
    if (!data._yearSource || data._yearSource !== 'manufactured') {
      data.year = value;
      data._yearSource = 'publication';
    }
  }
  // Cover artist (comics)
  else if (label === 'cover artist') {
    data.coverArtist = value;
  }
}

function parseTitle(title) {
  const result = {
    name: null,
    set: null,
    year: null,
    number: null,
    grade: null,
    grader: null,
    // Comic-specific fields
    series: null,
    publisher: null
  };

  // Remove common spam words and emojis
  let cleaned = title
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/\b(rare|invest|hot|fire|gem|mint|look|wow|must|see|read|nice|great|beautiful|gorgeous|stunning|pristine|perfect|excellent|amazing|incredible|awesome)\b/gi, '')
    .replace(/[🔥💎⭐️✨🌟💯🏆]/g, '')
    .replace(/\*+\d*\s*$/, '') // Remove trailing seller codes like **277
    .trim();

  // Try to extract PSA/BGS/CGC grade - handle "CGC 7.0", "CGC Graded 7.0", etc.
  const gradeMatch = cleaned.match(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\s*(?:graded?|grade)?\s*(\d+\.?\d*)/i);
  if (gradeMatch) {
    result.grader = gradeMatch[1].toUpperCase();
    result.grade = gradeMatch[2];
  }

  // Check for comic indicators and extract series
  const isLikelyComic = /\b(cgc|cbcs|pgx)\s*\d/i.test(cleaned) ||
                        /\b(variant|newsstand|direct edition|1st print|first print)\b/i.test(cleaned) ||
                        /\bvol\.?\s*\d+\s*#/i.test(cleaned);

  if (isLikelyComic) {
    // Try to extract comic series (text before #number or Vol)
    // Pattern: "Amazing Spider-Man #129" or "Batman Vol 2 #1"
    const seriesMatch = cleaned.match(/^([A-Za-z][A-Za-z\s\-:'.]+?)(?:\s+Vol\.?\s*\d+)?\s*#\d+/i);
    if (seriesMatch) {
      result.series = seriesMatch[1].trim();
    }

    // Extract publisher from common publisher names in title
    const publisherMatch = cleaned.match(/\b(Marvel|DC|Image|Dark Horse|IDW|Boom|Dynamite|Valiant|Archie)\b/i);
    if (publisherMatch) {
      result.publisher = publisherMatch[1];
    }
  }

  // Extract year (4 digit number starting with 19 or 20, optionally with -YY suffix like 2025-26)
  const yearMatch = cleaned.match(/\b(19\d{2}|20\d{2})(?:-\d{2})?\b/);
  if (yearMatch) {
    // Extract just the 4-digit year
    result.year = yearMatch[1];
  }

  // Extract card number (#777, #1, #TT-11, #LOB-001, #FSA-FC, No. 4, XXX/YYY format, etc.)
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

  // Try to extract quoted card name first (e.g., "JEDI A LA KUROSAWA")
  const quotedMatch = cleaned.match(/"([^"]+)"/);
  if (quotedMatch) {
    result.name = quotedMatch[1];
  }

  // Build set name from recognized components
  const setComponents = [];
  const setPatterns = [
    /\b(base set|jungle|fossil|team rocket|gym heroes|gym challenge|neo genesis|neo discovery|neo revelation|neo destiny)\b/i,
    /\b(1st edition|first edition|unlimited|shadowless)\b/i,
    /\b(topps|upper deck|fleer|donruss|panini|bowman|prizm|select|mosaic|optic)\b/i,
    /\b(star wars|pokemon|magic|yu-?gi-?oh|one piece|digimon|garbage pail)\b/i,
    /\b(galaxy|chrome|prizm|select|mosaic)\s*(\d+)?\b/i
  ];

  for (const pattern of setPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      setComponents.push(match[0]);
    }
  }
  if (setComponents.length > 0) {
    result.set = setComponents.join(' ');
  }

  // If no quoted name, try to extract name from what's left
  if (!result.name) {
    // First, try to find name after the card number (common pattern: "... #123 Player Name /99")
    // Note: [a-zA-Z']+ handles names like O'Neal, McDonald where uppercase follows apostrophe
    const afterNumberMatch = cleaned.match(/#[A-Za-z0-9-]+\s+([A-Z][a-z]+(?:\s+[A-Z][a-zA-Z']+)+)(?:\s+\/\d+)?/);
    if (afterNumberMatch) {
      result.name = afterNumberMatch[1].trim();
    } else {
      let namePart = cleaned
        .replace(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA|CBCS|PGX)\s*\d+\.?\d*/gi, '')
        .replace(/\b(19\d{2}|20\d{2})(?:-\d{2})?\b/g, '') // Remove year and year ranges
        .replace(/#[A-Za-z0-9-]+/g, '') // Remove card numbers (including alphanumeric like #TT-11)
        .replace(/\/\d+\b/g, '') // Remove print runs like /99
        .replace(/\b(topps|upper deck|fleer|donruss|panini|bowman|star wars|pokemon|magic|galaxy|chrome|refractor|prizm|select|mosaic|optic|holo|foil)\b/gi, '') // Remove set/parallel words
        .replace(/[,|"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (namePart.length > 0) {
        // Take the remaining meaningful words as the name
        const words = namePart.split(' ').filter(w => w.length > 1).slice(0, 5).join(' ');
        result.name = words.replace(/[,.]$/, '');
      }
    }
  }

  return result;
}
