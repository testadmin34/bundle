# XML Bundle Recommender System

This system parses a product XML feed and suggests product bundles using AI or rule-based recommendations.

## Features
- **XML Parsing**: Reads standard Google Merchant Center formatted XML.
- **AI-Powered Recommendations** (Optional): Uses Google Gemini AI for intelligent product suggestions.
- **Smart Fallback**: Falls back to TF-IDF and rule-based recommendations if AI is unavailable.
- **Complementary Products**: Suggests items that complement the main product (e.g., Vacuum Cleaner → Mop).
- **Similar Products**: Finds products with similar names and descriptions.
- **Web Interface**: Clean, professional UI with product images.
- **CLI Interface**: Interactive command-line tool.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. (Optional) Configure Gemini AI:
   ```bash
   cp .env.example .env
   # Edit .env and add your GEMINI_API_KEY
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Usage

### Web Interface (Recommended)

1. Start the server:
   ```bash
   npm run server
   ```

2. Open your browser and go to:
   ```
   http://localhost:3000
   ```

3. Choose recommendation type:
   - **Benzer Ürünler (Similar Products)**: Finds products with similar names and descriptions
   - **Tamamlayıcı Ürünler (Complementary Products)**: Suggests items that complement the main product

4. Enter a SKU and click "Önerileri Getir"

### CLI Interface

```bash
npm start
```

Follow the interactive prompts to enter SKUs and get recommendations.

## Configuration
- The script expects `insider.xml` in the project root.
- You can modify `src/index.ts` to change the recommendation logic or file path.

## How It Works

### With Gemini AI (Recommended)
1. **AI Analysis**: Gemini AI analyzes the product name and description
2. **Smart Matching**: AI understands product relationships and suggests truly complementary items
3. **Fallback**: If AI fails or returns insufficient results, falls back to rule-based system

### Without AI (Fallback)
1. **Complementary Rules**: Checks if the product matches specific categories and suggests complementary items
2. **Text Similarity (TF-IDF)**: Builds a TF-IDF index and finds products with highest similarity score

The final bundle consists of up to 3 products, prioritizing AI recommendations when available.

## Example SKUs to Test
- **SIEM539** - Ütü Masası (Ironing Board)
- **RBL032** - Rebul Parfüm Seti (Perfume Set)
- **ZVG042** - Zwilling Bıçak Seti (Knife Set)
- **MYA218** - Dikey Süpürge (Vacuum Cleaner)
