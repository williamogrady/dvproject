// mark_flipped.js
// Run: node mark_flipped.js

import fs from "fs";

// Load both files
const lines = JSON.parse(fs.readFileSync("full_lines.json", "utf8"));
const debug = JSON.parse(fs.readFileSync("debug-grid-results.json", "utf8"));

// All line IDs that should be flipped (the ones marked "correct")
const flippedIds = new Set(debug.correct);

let changed = 0;
for (const line of lines) {
  if (flippedIds.has(line.id)) {
    line.flipped = true;
    changed++;
  } else {
    delete line.flipped; // optional: ensure others don't have the flag
  }
}

fs.writeFileSync("full_lines.json", JSON.stringify(lines, null, 2));
console.log(`✅ Updated ${changed} lines with flipped:true`);
