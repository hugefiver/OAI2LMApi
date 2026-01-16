const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getLatestMtime(fileOrDirPath) {
  const stats = fs.statSync(fileOrDirPath);

  if (!stats.isDirectory()) {
    return stats.mtimeMs;
  }

  let latestMtime = stats.mtimeMs;
  const entries = fs.readdirSync(fileOrDirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(fileOrDirPath, entry.name);
    const entryMtime = entry.isDirectory()
      ? getLatestMtime(fullPath)
      : fs.statSync(fullPath).mtimeMs;
    if (entryMtime > latestMtime) {
      latestMtime = entryMtime;
    }
  }

  return latestMtime;
}

const root = path.resolve(__dirname, '..', '..', 'model-metadata');
const srcDir = path.join(root, 'src');
const dist = path.join(root, 'dist', 'index.js');
const distEsmFile = 'index.mjs';
const distEsm = path.join(root, 'dist', 'esm', distEsmFile);

const distExists = fs.existsSync(dist);
const distEsmExists = fs.existsSync(distEsm);
const srcExists = fs.existsSync(srcDir);

if (!srcExists) {
  throw new Error(`Model metadata source directory not found: ${srcDir}`);
}

let needsBuild = !distExists || !distEsmExists;

if (!needsBuild) {
  try {
    const srcMtime = getLatestMtime(srcDir);
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
