import leaflet from "leaflet";
import luck from "./luck.ts";

import "leaflet/dist/leaflet.css";
import "./style.css";

import "./leafletWorkaround.ts";

import { Layer } from "leaflet";

const cPanel = document.querySelector<HTMLDivElement>("#controlPanel")!;
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

let playerLoc = OAKES_CLASSROOM;

//flyweight pattern to reuse cells
class CellFlyWeight {
  private static cellCache: Map<string, Cell> = new Map();

  //convert lat and long
  static getLatLngCell(lat: number, lng: number): Cell {
    const i = Math.floor((lat - 0) / TILE_DEGREES);
    const j = Math.floor((lng - 0) / TILE_DEGREES);
    return this.getFlyWeightCell(i, j);
  }
  static getFlyWeightCell(i: number, j: number): Cell {
    const key = `${i},${j}`;
    if (!this.cellCache.has(key)) {
      this.cellCache.set(key, { i, j });
    }
    return this.cellCache.get(key)!;
  }
}

// Create the map (element with id "map" is defined in index.html)
const map = leaflet.map(document.getElementById("map")!, {
  center: playerLoc,
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

const playerMarker = leaflet.marker(playerLoc);
playerMarker.bindTooltip("That is you.");
playerMarker.addTo(map);

//cache memento
class CacheMemento {
  private cState: Map<string, Coin[]> = new Map();

  saveState(cache: Cache) {
    this.cState.set(cache.positionToString(), [...cache.coins]);
  }

  restoreState(cache: Cache) {
    const savedCoins = this.cState.get(cache.positionToString());
    if (savedCoins) {
      cache.coins = savedCoins;
    }
  }
}

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
  memento: CacheMemento;

  constructor(position: Cell, bounds: leaflet.LatLngBounds) {
    this.coins = [];
    this.position = position;
    this.bounds = bounds;
    this.memento = new CacheMemento();
  }

  positionToString(): string {
    return `${this.position.i}, ${this.position.j}`;
  }

  addCoin(coin: Coin) {
    this.coins.push(coin);
  }

  saveState() {
    this.memento.saveState(this);
  }

  restoreState() {
    this.memento.restoreState(this);
  }
}

//coins in player inventory
const inv: Coin[] = [];

// Type guard to check if a layer is a Rectangle with a cache property
function isCacheRect(
  layer: Layer,
): layer is leaflet.Rectangle & { cache: Cache } {
  return layer instanceof leaflet.Rectangle && "cache" in layer;
}

//generates caches to be played on map
function spawnCache(i: number, j: number) {
  const latStart = playerLoc.lat + i * TILE_DEGREES;
  const lngStart = playerLoc.lng + j * TILE_DEGREES;
  const latEnd = latStart + TILE_DEGREES;
  const lngEnd = lngStart + TILE_DEGREES;

  const bounds = leaflet.latLngBounds(
    [latStart, lngStart], // South-West corner
    [latEnd, lngEnd], // North-East corner
  );

  const cell = CellFlyWeight.getFlyWeightCell(i, j);
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

  cache.saveState();

  //add cache to map
  const rect = leaflet.rectangle(bounds, {
    color: "blue",
    weight: 1,
    fillOpacity: 0.2,
  }).addTo(map);
  rect.cache = cache;
  rect.bindPopup(() => createCachePopUps(cache));
  rect.addTo(map);
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

//player movement buttons
const directions = [
  { name: "⬆️", lat: TILE_DEGREES, lng: 0 },
  { name: "⬇️", lat: -TILE_DEGREES, lng: 0 },
  { name: "⬅️", lat: 0, lng: -TILE_DEGREES },
  { name: "➡️", lat: 0, lng: TILE_DEGREES },
];

directions.forEach(({ name, lat, lng }) => {
  const button = document.createElement("button");
  button.textContent = name;
  button.onclick = () => movePlayer(lat, lng);
  cPanel.appendChild(button);
});
document.body.appendChild(cPanel);

//move player and update the map view
function movePlayer(latChange: number, lngChange: number) {
  playerLoc = leaflet.latLng(
    playerLoc.lat + latChange,
    playerLoc.lng + lngChange,
  );
  playerMarker.setLatLng(playerLoc);

  //recenter the map view on the player
  map.setView(playerLoc);

  //clear cache
  clearCaches();
  //regenerate caches around player location
  generateCaches();
}

//populate caches around new player location
function generateCaches() {
  for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
      const dist = Math.abs(i) + Math.abs(j);

      if (
        dist <= NEIGHBORHOOD_SIZE &&
        luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY
      ) {
        spawnCache(i, j);
      }
    }
  }
}

function clearCaches() {
  map.eachLayer((layer: Layer) => {
    if (isCacheRect(layer)) {
      layer.cache.saveState(); // Save the cache state to mementos
      map.removeLayer(layer);
    }
  });
}

//populate caches around player
generateCaches();
