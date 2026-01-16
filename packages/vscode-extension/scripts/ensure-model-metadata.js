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

if (!srcExists) {
  throw new Error(`Model metadata source not found: ${src}`);
}

let needsBuild = !distExists || !distEsmExists;

if (!needsBuild) {
  try {
    const srcMtime = fs.statSync(src).mtimeMs;
    const distMtime = fs.statSync(dist).mtimeMs;
    const distEsmMtime = fs.statSync(distEsm).mtimeMs;
    needsBuild = srcMtime > distMtime || srcMtime > distEsmMtime;
  } catch (error) {
    needsBuild = true;
  }
}

if (needsBuild) {
  try {
    execSync('pnpm --filter @oai2lmapi/model-metadata run build', { stdio: 'inherit' });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to build model-metadata. Ensure pnpm is installed and dependencies are available. ${message}`
    );
  }
}
