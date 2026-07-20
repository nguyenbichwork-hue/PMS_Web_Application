// Wipes the embedded database so the demo data is re-seeded on next start.
// Stop the dev server first, then: npm run db:reset
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), ".pglite");
if (fs.existsSync(dir)) {
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("✓ Removed .pglite — demo data will be re-seeded on next `npm run dev`.");
} else {
  console.log("Nothing to remove (.pglite not found).");
}
