const fs = require('fs');
const path = require('path');

const esmDir = path.join(process.cwd(), 'dist', 'esm');
const renamePairs = [
  ['index.js', 'index.mjs'],
  ['index.js.map', 'index.mjs.map'],
];

for (const [from, to] of renamePairs) {
  const sourcePath = path.join(esmDir, from);
  const targetPath = path.join(esmDir, to);
  if (fs.existsSync(sourcePath)) {
    fs.renameSync(sourcePath, targetPath);
  }
}
