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

//flyweight pattern: reusing cell objects (i, j)
const cellCache = new Map<string, Cell>();
function getFlyWeightCell(i: number, j: number): Cell {
  const key = `${i},${j}`;
  if (!cellCache.has(key)) {
    cellCache.set(key, { i, j });
  }
  return cellCache.get(key)!;
}

//convert lat/long to global coords anchored at Null Island
function latLngToCell(lat: number, lng: number): Cell {
  const i = Math.round(lat * 1e4);
  const j = Math.round(lng * 1e4);
  return getFlyWeightCell(i, j);
}

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

interface Coin {
  cell: Cell;
  serial: number;
  toString(): string;
}

//cache holds geocoins
class Cache {
  coins: Coin[];
  position: Cell;
  bounds: leaflet.LatLngBounds;

  constructor(position: Cell, bounds: leaflet.LatLngBounds) {
    this.coins = [];
    this.position = position;
    this.bounds = bounds;
  }

  positionToString(): string {
    return `${this.position.i}, ${this.position.j}`;
  }

  addCoin(coin: Coin) {
    this.coins.push(coin);
  }
}

//coins in player inventory
const inv: Coin[] = [];

//generates caches to be played on map
function spawnCache(i: number, j: number) {
  const origin = OAKES_CLASSROOM;
  const bounds = leaflet.latLngBounds([
    [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
    [origin.lat + (i + 1) * TILE_DEGREES, origin.lng + (j + 1) * TILE_DEGREES],
  ]);

  const cell = latLngToCell(
    origin.lat + i * TILE_DEGREES,
    origin.lng + j * TILE_DEGREES,
  );
  const cache = new Cache(cell, bounds);

  const initialCoins = Math.floor(
    luck([cell.i, cell.j, "initialValue"].toString()) * 10,
  );
  for (let serial = 0; serial < initialCoins; serial++) {
    const coin: Coin = {
      cell,
      serial,
      toString() {
        return `${this.cell.i}:${this.cell.j}#${this.serial}`;
      },
    };
    cache.addCoin(coin);
  }
  //add cache to map
  const rect = leaflet.rectangle(bounds).addTo(map);
  rect.bindPopup(() => createCachePopUps(cache));
}

//reference cache saved in flyweight pattern and open popup
function createCachePopUps(cache: Cache): HTMLDivElement {
  const popUp = document.createElement("div");
  popUp.innerHTML = `
    <div>There is a cache here at "${cache.positionToString()}". It has <span id="value">${cache.coins.length}</span> coins.</div>
    <button id="pickup">pick up</button>
    <button id="drop">drop</button>`;

  const pickupButton = popUp.querySelector<HTMLButtonElement>("#pickup")!;
  const dropButton = popUp.querySelector<HTMLButtonElement>("#drop")!;
  const valueSpan = popUp.querySelector<HTMLSpanElement>("#value")!;

  dropButton.disabled = inv.length === 0;

  pickupButton.addEventListener("click", () => {
    if (cache.coins.length > 0) {
      const coin = cache.coins.pop()!;
      inv.push(coin);
      updateStatus();
      valueSpan.innerHTML = cache.coins.length.toString();
      dropButton.disabled = inv.length === 0;
    }
  });

  dropButton.addEventListener("click", () => {
    if (inv.length > 0) {
      const coin = inv.pop()!;
      cache.addCoin(coin);
      updateStatus();
      valueSpan.innerHTML = cache.coins.length.toString();
      dropButton.disabled = inv.length === 0;
    }
  });
  return popUp;
}

//updating coins in player inventory on display
function updateStatus() {
  sPanel.innerHTML = `${inv.length} coins currently held`;

  const coinList = document.createElement("ul");
  coinList.id = "coinList";

  inv.forEach((coin) => {
    const listItem = document.createElement("li");
    listItem.textContent = `🪙${coin.cell.i}:${coin.cell.j}#${coin.serial}`;
    coinList.appendChild(listItem);
  });
  sPanel.appendChild(coinList);
}

//puts caches on map
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}
