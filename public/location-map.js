// Location on a map, for sellers, partners and buyers.
// The browser finds where the person is, and a pin on the map shows it. They can drag the pin
// (or tap the map) to correct it. The map is Leaflet with free OpenStreetMap tiles, so it needs
// no key or billing. Leaflet is kept in vendor/leaflet and loaded the first time a map is shown.

const BASE = new URL("./vendor/leaflet/", import.meta.url);
const INDIA = { lat: 22.5, lng: 79, zoom: 4 };
const CLOSE = 16; // zoom for a detected or saved location
const round = (n) => Math.round(n * 1e6) / 1e6;

let loading = null;
function leaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ||= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = new URL("leaflet.css", BASE);
    const js = document.createElement("script");
    js.src = new URL("leaflet.js", BASE);
    js.onload = () => resolve(window.L);
    js.onerror = () => { loading = null; reject(new Error("Couldn't load the map. Check your connection.")); };
    document.head.append(css, js);
  });
  return loading;
}

// The browser's location, as { lat, lng }. Rejects with a message to show the person.
export function detectLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This browser can't share location. Drag the pin to your place instead."));
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: round(pos.coords.latitude), lng: round(pos.coords.longitude) }),
      () => reject(new Error("Location access was blocked. Allow location for this site, or drag the pin to your place.")),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
}

// The place at a location, as { city, state, pin, label } (label like "Pune, Maharashtra 412207"),
// from OpenStreetMap's free Nominatim lookup. null when it can't be named. Answers are cached.
const places = new Map();
export function placeName(loc) {
  if (!loc || loc.lat == null) return Promise.resolve(null);
  const key = `${loc.lat.toFixed(3)},${loc.lng.toFixed(3)}`;
  if (!places.has(key)) places.set(key, fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=en&lat=${loc.lat}&lon=${loc.lng}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      const a = j?.address;
      if (!a) return null;
      // The city, or else the district, which matches the city India Post gives a pin code (Pune for 412207).
      const city = a.city || a.state_district?.replace(/ District$/i, "") || a.town || a.county || a.village || "";
      const code = (a.postcode || "").replace(/\s/g, "");
      const pin = /^[1-9]\d{5}$/.test(code) ? code : "";
      const state = (a.state || "").replace(/ and /g, " & ");
      return { city, state, pin, label: [city, state].filter(Boolean).join(", ") + (pin ? ` ${pin}` : "") };
    })
    .catch(() => null)
    .then((p) => { if (!p) places.delete(key); return p; }));
  return places.get(key);
}

// Fills a form's empty pin code, state and city boxes from a named place.
// The pin box gets a change event, so its own state and city lookup runs too.
export function fillPlace(place, { pin, state, city } = {}) {
  if (!place) return;
  if (pin && !pin.value.trim() && place.pin) { pin.value = place.pin; pin.dispatchEvent(new Event("change")); }
  if (state && !state.value && place.state && [...(state.options || [])].some((o) => o.value === place.state)) state.value = place.state;
  if (city && !city.value.trim() && place.city) city.value = place.city;
}

// Puts a map with a draggable pin into box. get() is the chosen { lat, lng, source } or null.
// source is "gps" (detected), "map" (the person moved the pin), "pin" (a pin code's centre) or "saved".
// onPlace(place) runs with the named place each time the pin is detected or moved by hand.
export function mapPicker(box, { hint = "Drag the pin, or tap the map, to correct it.", onPlace } = {}) {
  box.classList.add("map-picker");
  box.innerHTML = `<div class="map-canvas" role="application" aria-label="Map. Drag the pin to your location."></div>
    <div class="map-bar">
      <button type="button" class="btn ghost small" data-detect>📍 Detect my location</button>
      <span class="hint" data-msg aria-live="polite">${hint}</span>
    </div>
    <div class="place-box" data-place aria-live="polite" hidden></div>`;
  const canvas = box.querySelector(".map-canvas"), msg = box.querySelector("[data-msg]"), placeBox = box.querySelector("[data-place]");
  // Names the place under the map, like "📍 Pune, Maharashtra 412207".
  let naming = 0;
  async function name(loc, tell) {
    const n = ++naming;
    placeBox.hidden = false; placeBox.textContent = "📍 Finding the place name…";
    const place = await placeName(loc);
    if (n !== naming) return;
    placeBox.textContent = place ? `📍 ${place.label}` : "📍 Location set (place name unavailable)";
    if (place && tell) onPlace?.(place);
  }
  let map = null, marker = null, value = null, detecting = null;
  const say = (t) => (msg.textContent = t);

  const ready = leaflet().then((L) => {
    map = L.map(canvas, { scrollWheelZoom: false }).setView([INDIA.lat, INDIA.lng], INDIA.zoom);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    }).addTo(map);
    marker = L.marker([INDIA.lat, INDIA.lng], { draggable: true, autoPan: true, keyboard: true, title: "Your location" });
    const moved = (ll) => { value = { lat: round(ll.lat), lng: round(ll.lng), source: "map" }; say("Pin moved. Save to keep this location."); name(value, true); };
    marker.on("dragend", () => moved(marker.getLatLng()));
    map.on("click", (e) => { marker.setLatLng(e.latlng).addTo(map); moved(e.latlng); });
    // The map may start in a hidden form or dialog; redraw it once it has a size.
    new ResizeObserver(() => map.invalidateSize()).observe(canvas);
    if (value) show(value, value.zoom);
  }).catch((err) => { canvas.hidden = true; say(err.message); });

  function show(loc, zoom) {
    if (!map) return;
    marker.setLatLng([loc.lat, loc.lng]).addTo(map);
    map.setView([loc.lat, loc.lng], zoom ?? CLOSE);
  }
  const api = {
    ready,
    get: () => value && { lat: value.lat, lng: value.lng, source: value.source },
    // Shows a location without asking the browser. zoom defaults to street level.
    set(loc, source = "saved", zoom) {
      if (!loc || loc.lat == null || loc.lng == null) return;
      value = { lat: round(loc.lat), lng: round(loc.lng), source, zoom };
      show(value, zoom);
      // A pin code's centre is already named by the form; saved and detected places get named.
      if (source === "pin") { naming++; placeBox.hidden = true; } else name(value, source === "gps");
    },
    clear() { value = null; naming++; placeBox.hidden = true; marker?.remove(); map?.setView([INDIA.lat, INDIA.lng], INDIA.zoom); },
    // Asks the browser where the person is and moves the pin there.
    detect() {
      if (detecting) return detecting;
      say("Finding your location…");
      detecting = detectLocation().then((loc) => {
        api.set(loc, "gps");
        say("Your location is found. Drag the pin if it's not quite right, then save.");
        return loc;
      }, (err) => { say(err.message); return null; }).finally(() => (detecting = null));
      return detecting;
    },
    say
  };
  box.querySelector("[data-detect]").onclick = () => api.detect();
  return api;
}

// A dialog with a map to change a saved location. save(loc) stores it; the dialog closes when it resolves.
export function locationDialog({ title = "Your location", note = "", start = null, save }) {
  const wrap = document.createElement("div");
  wrap.className = "overlay";
  wrap.innerHTML = `<div class="dialog wide" role="dialog" aria-modal="true" aria-labelledby="loc-dlg-title">
      <h2 id="loc-dlg-title" style="font-size:1.25rem"></h2>
      ${note ? `<p class="sub" data-note></p>` : ""}
      <div data-map></div>
      <div class="msg" data-err hidden></div>
      <div class="row" style="justify-content:flex-end;gap:8px">
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
        <button type="button" class="btn" data-save>Save location</button>
      </div>
    </div>`;
  wrap.querySelector("#loc-dlg-title").textContent = title;
  if (note) wrap.querySelector("[data-note]").textContent = note;
  document.body.append(wrap);
  const picker = mapPicker(wrap.querySelector("[data-map]"));
  if (start && start.lat != null) picker.set(start, "saved"); else picker.detect();
  const close = () => wrap.remove();
  const err = wrap.querySelector("[data-err]"), btn = wrap.querySelector("[data-save]");
  wrap.querySelector("[data-cancel]").onclick = close;
  wrap.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  btn.onclick = async () => {
    const loc = picker.get();
    if (!loc) { err.textContent = "Detect your location or tap the map to place the pin."; err.className = "msg bad"; err.hidden = false; return; }
    btn.disabled = true;
    try { await save(loc); close(); }
    catch (e) { err.textContent = `Couldn't save: ${e.message}`; err.className = "msg bad"; err.hidden = false; btn.disabled = false; }
  };
  return picker;
}
