/**
 * Generates Android mipmap PNGs from scripts/icon.svg using @resvg/resvg-js
 */
const {Resvg} = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'icon.svg');
const svg = fs.readFileSync(svgPath, 'utf8');

const SIZES = {
  'mipmap-mdpi':    48,
  'mipmap-hdpi':    72,
  'mipmap-xhdpi':   96,
  'mipmap-xxhdpi':  144,
  'mipmap-xxxhdpi': 192,
};

const resDir = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');

for (const [folder, size] of Object.entries(SIZES)) {
  const resvg = new Resvg(svg, {
    fitTo: {mode: 'width', value: size},
  });
  const pngData = resvg.render().asPng();
  const outDir = path.join(resDir, folder);
  fs.writeFileSync(path.join(outDir, 'ic_launcher.png'), pngData);
  fs.writeFileSync(path.join(outDir, 'ic_launcher_round.png'), pngData);
  console.log(`✓ ${folder}  ${size}×${size}`);
}

console.log('\nDone. Rebuild the app to pick up the new icons.');
