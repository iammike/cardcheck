# PriceChecking

A Chrome extension that helps collectors check prices while browsing eBay listings. Supports sports cards, trading card games (TCGs), comic books, and other collectibles.

## Screenshots

**Detected Item & Price Lookup**
![Detected item view](screenshots/detected-card.png)

**Price Comparison by Grade**
![Price view](screenshots/price-view.png)

**Multiple Match Selection**
![Select item view](screenshots/select-card.png)

## Features

- **Automatic detection** - Extracts name, year, set/series, number, and grade from eBay Item Specifics
- **Real-time pricing** - Fetches current market prices from SportsCardsPro and PriceCharting
- **Smart routing** - Sports cards go to SportsCardsPro; TCGs, comics, and non-sport items go to PriceCharting
- **Grade matching** - Highlights the price for your item's specific grade
- **Multi-grader support** - Works with PSA, BGS, SGC, CGC, CBCS, PGX, and more

### What's Supported

**Sports Cards**
- Baseball, football, basketball, hockey, soccer, golf, tennis, boxing, wrestling, racing, MMA

**Trading Card Games (TCGs)**
- Pokémon, Magic: The Gathering, Yu-Gi-Oh!, Digimon, One Piece TCG, Disney Lorcana, Weiss Schwarz

**Comic Books**
- CGC, CBCS, and PGX graded comics
- All major publishers (Marvel, DC, Image, Dark Horse, IDW, and more)
- Silver Age through Modern Age

**Non-Sport Collectibles**
- Star Wars, Marvel, Garbage Pail Kids, and more

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)
1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the repository folder

## Usage

1. Navigate to any eBay listing (cards, comics, or collectibles)
2. Click the PriceChecking icon in your toolbar
3. View detected item info and click the search button
4. Browse prices across all grades

## How It Works

The extension:
1. Reads eBay's Item Specifics to extract metadata (with title parsing as fallback)
2. Determines the item type (sports card, TCG, comic, or non-sport)
3. Routes to the appropriate pricing database:
   - Sports cards → SportsCardsPro
   - TCGs, comics, and non-sport items → PriceCharting
4. Displays current market prices by grade
5. Highlights the matching grade for easy comparison

Item not detected correctly? Use the "Report it" link to submit an issue with pre-filled debug info.

## Privacy

- No personal data is collected or stored
- No accounts required
- Item data is only sent to SportsCardsPro or PriceCharting for price lookups

## Development

Run the test suite:
```bash
node tests/run-tests.js
```

## Credits

Price data provided by [SportsCardsPro.com](https://www.sportscardspro.com) / [PriceCharting.com](https://www.pricecharting.com)

## License

MIT
