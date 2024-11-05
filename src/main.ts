import leaflet from "leaflet";
import luck from "./luck.ts";

import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";

const cPanel: HTMLDivElement = document.createElement("div");
cPanel.id = "controlPanel";
const sPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
sPanel.innerHTML = "No coins yet...";

document.title = "Geocoin Carrier";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Populate the map with a background tile layer
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That is you.");
playerMarker.addTo(map);

//cache cell location
interface Cell {
  i: number;
  j: number;
}

//cache holds geocoins
class Cache {
  coinCount: number;
  position: Cell;
  bounds: leaflet.LatLngBounds;

  constructor(position: Cell, bounds: leaflet.LatLngBounds) {
    this.coinCount = 0;
    this.position = position;
    this.bounds = bounds;
  }

  positionToString(): string {
    return `${this.position.i}, ${this.position.j}`;
  }

  addCoins(count: number) {
    this.coinCount += count;
  }

  removeCoins(count: number) {
    this.coinCount = Math.max(0, this.coinCount - count);
  }
}

//amount of coins in player inventory
let invCount = 0;

//generates caches to be placed on map
function spawnCache(i: number, j: number) {
  const origin = OAKES_CLASSROOM;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  const rect = leaflet.rectangle(bounds);
  rect.addTo(map);

  const cache = new Cache({ i, j }, bounds);
  cache.addCoins(Math.floor(luck([i, j, "initialValue"].toString()) * 10));

  rect.bindPopup(() => {
    const popUp = document.createElement("div");
    popUp.innerHTML = `
      <div>There is a cache here at "${i},${j}". It has <span id="value">${cache.coinCount}</span> coins.</div>
      <button id="pickup">pick up</button>
      <button id="drop">drop</button>`;

    const pickupButton = popUp.querySelector<HTMLButtonElement>("#pickup")!;
    const dropButton = popUp.querySelector<HTMLButtonElement>("#drop")!;
    const valueSpan = popUp.querySelector<HTMLSpanElement>("#value")!;

    // Disable drop button if inventory is empty
    dropButton.disabled = invCount === 0;

    pickupButton.addEventListener("click", () => {
      if (cache.coinCount > 0) {
        cache.removeCoins(1);
        invCount += 1;
        updateStatus();
        valueSpan.innerHTML = cache.coinCount.toString();
        dropButton.disabled = invCount === 0;
      }
    });

    dropButton.addEventListener("click", () => {
      if (invCount > 0) {
        cache.addCoins(1);
        invCount -= 1;
        updateStatus();
        valueSpan.innerHTML = cache.coinCount.toString();
        dropButton.disabled = invCount === 0;
      }
    });

    return popUp;
  });
}

//updating amount of coins in player inventory
function updateStatus() {
  sPanel.innerHTML = `${invCount} coins currently held`;
}

//puts caches on map
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
