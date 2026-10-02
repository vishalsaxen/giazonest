// Shrinks a photo in the browser so it can be stored in Firestore, which
// keeps GiaZoNest on Firebase's free plan (photo uploads to Storage need Blaze).

const load = (file) => new Promise((ok, fail) => {
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(img.src); ok(img); };
  img.onerror = () => fail(new Error(`${file.name} isn't a photo this browser can read.`));
  img.src = URL.createObjectURL(file);
});

function draw(img, maxSide, quality) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

// A JPEG data URL of at most maxChars characters (about 3/4 of that in bytes).
export async function shrink(file, maxSide = 1200, maxChars = 280000) {
  const img = await load(file);
  for (const side of [maxSide, 1000, 800, 640]) {
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const url = draw(img, side, q);
      if (url.length <= maxChars) return url;
    }
  }
  return draw(img, 480, 0.5);
}

// A small square-ish thumbnail for lists, from a data URL.
export async function thumb(dataUrl, side = 240) {
  const img = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = dataUrl; });
  return draw(img, side, 0.7);
}
