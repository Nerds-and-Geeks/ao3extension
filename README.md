# ⚡ AO3 Companion - Filter preset manager - Always find the fics that match your taste

An intelligent Chrome Extension for **Archive of Our Own (AO3)** that lets you save search presets, overwrite active presets, rate fanfictions by exact tag match precision, and prefetch & rank multi-page search results cleanly.

> [!TIP]
> **Pro-Tip for Best Results**: AO3 Companion works best when you have a **main fandom selected** (e.g. via a fandom tag page or search filter). Selecting a main fandom allows you to utilize AO3's native sidebar filters alongside AO3 Companion's preset management and precision match sorting!

---

## ✨ Key Features

### 1. 💾 Preset Manager (Save & Overwrite)
- **Save Searches as Presets**: Save any active AO3 search or tag filter page as a named preset for quick access.
- **Edit & Overwrite Active Presets**: Modify an active preset by saving your updated search parameters directly on top of it.
- **Unified Top Control Box**: All controls (preset saving, overwriting, preset loading, precision sorting, and custom pagination) are housed in a single clean box directly above search results, keeping AO3's native sidebar filters and original pagination untouched.

### 2. 🎯 Precision Match Scoring Algorithm
Calculates an exact match score for every fanfiction on the page. The score is evaluated **strictly on Fandoms and Relationships** (`/` romance and `&` friendship tags). Additional freeform tags and character tags are excluded:

- **Fandom Scoring**: Exact fandom match = **100%**. Parent/child/extra fandom tags deduct **2%** per extra tag.
- **Relationship Scoring**:
  - Romantic pairings (`/`): Each unrequested extra romantic pairing deducts **5%** (default).
  - Friendship pairings (`&`): Each unrequested extra friendship pairing deducts **2%** (default, e.g. 2 extra friendship tags deduct 4%, scoring 98%).
  - **Same-Character Pair Exception**: Having the corresponding friendship tag between the *same two characters* (e.g. `Character A & Character B`) on a work tagged with `Character A/Character B` **does NOT ding the score**.
  - **Order-Agnostic Matching**: Character name order in relationship tags is completely ignored (`Character B/Character A` and `Character B & Character A` match `Character A/Character B` 100%).
- **Overall Score Calculation (Category Averaging)**:
  The overall match score is calculated by **averaging the Fandom and Relationship category scores**:
  $$\text{Overall Match Score} = \frac{\text{Fandom Score} + \text{Relationship Score}}{2}$$
  *Example*: If a work has a 100% Fandom score and a 98% Relationship score (due to 1 extra friendship tag with a 2% penalty), the overall match score is $\frac{100\% + 98\%}{2} = \mathbf{99\%}$.
- **Exact Match Capping**: Non-perfect matches with penalties are capped at a maximum **99%**, reserving `🎯 100% Exact Match` strictly for true exact matches with zero unrequested tags.
- **⚙️ Customizable Penalty Config (Popup Menu)**: Click the extension icon in your browser toolbar to tweak penalty rates via real-time sliders.

### 3. 🚀 Throttled Multi-Page Prefetching & Embedded Pagination
- **Depth Selector Dropdown**: Choose your fetch depth: `Current Page (20 Stories)`, `5 Pages (100 Stories)`, `10 Pages (200 Stories)`, `15 Pages (300 Stories)`, `20 Pages (400 Stories)`, `25 Pages (500 Stories)`, `30 Pages (600 Stories)`, or `Max Available`.
- **AO3 Rate-Limit Throttling (HTTP 429 Protection)**: Requests are fetched sequentially with rate-limit throttling and automatic 3-second retry backoff to prevent AO3 "Retry later" blocks.
- **📄 Embedded Sorted Pagination**: When sorting multi-page results, custom sorted pagination controls render directly inside the top AO3 Companion box while preserving native AO3 pagination intact.

---

## 📥 How to Install

### Method 1: Download Release Package (Quickest & Recommended)

1. **Download & Extract the Release**:
   - Go to the [Releases](https://github.com/Nerds-and-Geeks/ao3extension/releases) page on GitHub.
   - Download `ao3-companion-extension-v2.0.0.zip` from the latest release assets.
   - **Double-click to unzip/extract** the file into a folder on your computer.

> [!IMPORTANT]
> **Chrome cannot load `.zip` files directly.** The "Load unpacked" button in Chrome requires you to select the **extracted folder**, NOT the `.zip` file!

2. **Open Chrome Extensions**:
   - Open Google Chrome (or Chromium-based browsers like Brave, Edge, or Opera).
   - Navigate to `chrome://extensions/` in your address bar (or click the **🧩 Extensions** icon → **Manage Extensions**).

3. **Enable Developer Mode**:
   - Toggle **ON** the **Developer mode** switch in the top-right corner.

4. **Load Unpacked Extension**:
   - Click the **Load unpacked** button in the top-left corner.
   - Select the extracted extension folder.
   - AO3 Companion is now installed and active!

---

### Method 2: Git Clone

If you prefer using git in your terminal:

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Nerds-and-Geeks/ao3extension.git
   ```

2. **Load in Browser**:
   - Open `chrome://extensions/` with **Developer mode** enabled.
   - Click **Load unpacked** and select the cloned `ao3extension` directory.

---

## 🧪 Running Automated Tests

The extension includes a complete automated test suite using `Node.js` and `JSDOM`:

```bash
cd ao3extension
npm test
```

### What Tests Cover:
- **Storage & URL Parsing**: Parameter extraction, `tag_id` parameter support, preset creation, overwriting, deletion.
- **Precision Match Scorer**: Fandom 2% deductions, romance 5% deductions, friendship 2% deductions, 99% score capping protection.
- **DOM Integration**: Top control box injection, work badge creation, single work reader page protection, and embedded top-box pagination.

---

## 📁 Project Structure

```text
ao3extension/
├── manifest.json            # Chrome Extension Manifest V3
├── background.js             # Service Worker
├── content.js                # Content Script (Injected Top Box & Badges)
├── content.css               # Top Box & Badge Stylesheet
├── lib/
│   ├── storage.js            # Preset Persistence & URL Parser
│   └── precision-scorer.js   # Precision Match Scoring Engine
├── popup/
│   ├── popup.html            # Extension Popup Menu HTML
│   ├── popup.js              # Popup Script & Slider Logic
│   └── popup.css             # Popup Stylesheet
├── tests/
│   ├── runner.js             # Master Test Runner
│   ├── test_storage.test.js  # Storage Tests
│   ├── test_precision_scorer.test.js # Scorer Unit Tests
│   └── test_content_dom.test.js # JSDOM Integration Tests
└── package.json              # Test Dependencies & NPM Scripts
```
