const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..', 'model-metadata');
const src = path.join(root, 'src', 'index.ts');
const dist = path.join(root, 'dist', 'index.js');
const distEsm = path.join(root, 'dist', 'esm', 'index.js');

const distExists = fs.existsSync(dist);
const distEsmExists = fs.existsSync(distEsm);
const srcExists = fs.existsSync(src);

let needsBuild = !distExists || !distEsmExists;

if (!needsBuild && srcExists) {
  try {
    const srcMtime = fs.statSync(src).mtimeMs;
    const distMtime = fs.statSync(dist).mtimeMs;
    const distEsmMtime = fs.statSync(distEsm).mtimeMs;
    needsBuild = srcMtime > Math.min(distMtime, distEsmMtime);
  } catch (error) {
    needsBuild = true;
  }
}

if (needsBuild) {
  execSync('pnpm --filter @oai2lmapi/model-metadata run build', { stdio: 'inherit' });
}
