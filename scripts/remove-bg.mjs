import { Jimp } from "jimp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "../public/logo.jpeg");
const dst = path.join(__dirname, "../public/logo.png");

const img = await Jimp.read(src);

img.scan(0, 0, img.bitmap.width, img.bitmap.height, (x, y, idx) => {
  const r = img.bitmap.data[idx];
  const g = img.bitmap.data[idx + 1];
  const b = img.bitmap.data[idx + 2];

  // Remove white and near-white pixels
  if (r > 238 && g > 238 && b > 238) {
    img.bitmap.data[idx + 3] = 0;
  }
});

await img.write(dst);
console.log("Done → public/logo.png");
