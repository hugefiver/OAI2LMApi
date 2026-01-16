const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..', 'model-metadata');
const src = path.join(root, 'src', 'index.ts');
const dist = path.join(root, 'dist', 'index.js');

const distExists = fs.existsSync(dist);
const srcExists = fs.existsSync(src);

let needsBuild = !distExists;

if (!needsBuild && srcExists) {
  try {
    needsBuild = fs.statSync(src).mtimeMs > fs.statSync(dist).mtimeMs;
  } catch (error) {
    needsBuild = true;
  }
}

if (needsBuild) {
  execSync('pnpm --filter @oai2lmapi/model-metadata run build', { stdio: 'inherit' });
}
