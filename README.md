# CardChecking

A Chrome extension that helps sports card collectors check prices from SportsCardsPro while browsing eBay listings.

## Screenshots

**Detected Card & Price Lookup**
![Detected card view](screenshots/detected-card.png)

**Price Comparison by Grade**
![Price view](screenshots/price-view.png)

**Multiple Match Selection**
![Select card view](screenshots/select-card.png)

## Features

- **Automatic card detection** - Extracts player name, year, set, card number, and grade from eBay Item Specifics
- **Real-time pricing** - Fetches current market prices from SportsCardsPro (part of PriceCharting)
- **Grade matching** - Highlights the price for your card's specific grade
- **Multi-grader support** - Works with PSA, BGS, SGC, CGC, CSG, HGA, and more
- **All sports** - Baseball, football, basketball, hockey, and soccer cards

## Installation

### From Chrome Web Store
*(Coming soon)*

### Manual Installation (Developer Mode)
1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked" and select the repository folder

## Usage

1. Navigate to any eBay sports card listing
2. Click the CardChecking icon in your toolbar
3. View detected card info and click "Search PriceCharting"
4. Browse prices across all grades

## How It Works

The extension:
1. Reads eBay's Item Specifics to extract card metadata
2. Searches SportsCardsPro for matching cards
3. Displays current market prices by grade
4. Highlights the matching grade for easy comparison

## Privacy

- No personal data is collected or stored
- No accounts required
- Card data is only sent to SportsCardsPro for price lookups

## Credits

Price data provided by [SportsCardsPro.com](https://www.sportscardspro.com) / [PriceCharting.com](https://www.pricecharting.com)

## License

MIT
