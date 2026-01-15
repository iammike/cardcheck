// Content script for extracting card data from eBay listings

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getCardData') {
    try {
      const cardData = extractCardData();
      sendResponse({ success: true, data: cardData });
    } catch (err) {
      console.error('CardCheck extraction error:', err);
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
    insertSet: null,
    parallel: null,
    features: null,
    autographed: null,
    error: null,
    type: null
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

  // Check title for error card indication (even if we have structured data)
  if (!data.error && data.title) {
    const titleLower = data.title.toLowerCase();
    if (titleLower.includes('error') && !titleLower.includes('error-free')) {
      data.error = 'Error';
    }
  }

  // Check title for grade if not found in structured data
  if (!data.grade && data.title) {
    const gradeMatch = data.title.match(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA)\s*(\d+\.?\d*)/i);
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
  // Player name - prioritize player/athlete fields over card name
  // Skip generic placeholders like "Multi", "Various", "N/A"
  const invalidPlayerNames = ['multi', 'various', 'n/a', 'multiple', 'see description', 'assorted'];
  if (label === 'player/athlete' || label === 'player' || label === 'athlete') {
    if (!invalidPlayerNames.includes(value.toLowerCase())) {
      data.name = value; // Use player field if it's a real name
    }
  }
  else if (label === 'card name' || label === 'character') {
    // Only use card name if we don't already have a player name
    if (!data.name && !invalidPlayerNames.includes(value.toLowerCase())) {
      data.name = value;
    }
  }
  // Set - but not "insert set"
  else if ((label === 'set' || label === 'product') && !label.includes('insert')) {
    data.set = value;
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
  // Year
  else if (label === 'year manufactured' || label === 'season' || label === 'year') {
    data.year = value;
  }
  // Grading company (check this first before grade)
  else if (label.includes('grader') || label.includes('professional grader') || label.includes('certif')) {
    // Extract abbreviation from full name like "Beckett Grading Services (BGS)" or "Professional Sports Authenticator (PSA)"
    const abbrevMatch = value.match(/\((PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA)\)/i);
    if (abbrevMatch) {
      data.grader = abbrevMatch[1].toUpperCase();
    } else {
      // Fallback: check if value starts with known abbreviation
      const startsWithMatch = value.match(/^(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA)\b/i);
      data.grader = startsWithMatch ? startsWithMatch[1].toUpperCase() : value;
    }
  }
  // Grade (must not be "grader" or "graded" fields)
  else if (label.includes('grade') && !label.includes('grader') && label !== 'graded') {
    // Extract just the numeric grade (1-10, possibly with .5)
    // This filters out certification numbers that might get mixed in
    const gradeNum = value.match(/\b(10|[1-9](?:\.5)?)\b/);
    if (gradeNum) {
      data.grade = gradeNum[1];
    } else {
      data.grade = value;
    }
  }
  // Condition might contain grade info
  else if (label === 'condition') {
    // Check if it looks like a grade (e.g., "PSA 10", "BGS 9.5")
    const gradeMatch = value.match(/\b(PSA|BGS|CGC|SGC|TAG|CSG|HGA|AGS|GMA|KSA)\s*(\d+\.?\d*)/i);
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
  // Features (Rookie, Short Print, Autograph, Error, etc.)
  else if (label === 'features') {
    data.features = value;
    // Check for error in features
    if (value.toLowerCase().includes('error')) {
      data.error = 'Error';
    }
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
}

function parseTitle(title) {
  const result = {
    name: null,
    set: null,
    grade: null,
    grader: null
  };

  // Remove common spam words and emojis
  let cleaned = title
    .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
    .replace(/\b(rare|invest|hot|fire|gem|mint|look|wow|must|see|read|nice|great|beautiful|gorgeous|stunning|pristine|perfect|excellent|amazing|incredible|awesome)\b/gi, '')
    .replace(/[🔥💎⭐️✨🌟💯🏆]/g, '')
    .trim();

  // Try to extract PSA/BGS/CGC grade
  const gradeMatch = cleaned.match(/\b(PSA|BGS|CGC|SGC)\s*(\d+\.?\d*)/i);
  if (gradeMatch) {
    result.grader = gradeMatch[1].toUpperCase();
    result.grade = gradeMatch[2];
  }

  // Try to extract card number (e.g., "4/102", "#4", "No. 4")
  const numberMatch = cleaned.match(/(?:#|No\.?\s*)?(\d+)(?:\/\d+)?/);

  // Try to identify common set names
  const setPatterns = [
    /\b(base set|jungle|fossil|team rocket|gym heroes|gym challenge|neo genesis|neo discovery|neo revelation|neo destiny)\b/i,
    /\b(1st edition|first edition|unlimited|shadowless)\b/i,
    /\b(topps|upper deck|fleer|donruss|panini|bowman|prizm|select|mosaic|optic)\b/i,
    /\b(\d{4})\b/ // Year as possible set indicator
  ];

  for (const pattern of setPatterns) {
    const match = cleaned.match(pattern);
    if (match) {
      result.set = result.set ? result.set + ' ' + match[1] : match[1];
    }
  }

  // The remaining text after removing grade info is likely the card name
  let namePart = cleaned
    .replace(/\b(PSA|BGS|CGC|SGC)\s*\d+\.?\d*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Take the first meaningful part as the name
  if (namePart.length > 0) {
    // Try to get just the player/character name (usually at the start)
    const words = namePart.split(' ').slice(0, 4).join(' ');
    result.name = words;
  }

  return result;
}
