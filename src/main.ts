import leaflet from "leaflet";
import luck from "./luck.ts";

import "leaflet/dist/leaflet.css";
import "./style.css";

import "./leafletWorkaround.ts";

import { Layer } from "leaflet";

class UIManager {
  private controlPanel: HTMLDivElement;
  private statusPanel: HTMLDivElement;

  constructor() {
    this.controlPanel = document.querySelector<HTMLDivElement>(
      "#controlPanel",
    )!;
    this.statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
    this.statusPanel.innerHTML = "No coins yet...";
  }

  // Public getter for controlPanel
  public getControlPanel(): HTMLDivElement {
    return this.controlPanel;
  }

  // Method to append buttons to the control panel
  addControlPanelButton(button: HTMLButtonElement): void {
    this.controlPanel.appendChild(button);
  }

  // Handle status panel updates (e.g., inventory count)
  updateStatusPanel(inventory: Coin[]): void {
    this.statusPanel.innerHTML = `${inventory.length} coins currently held`;

    const coinList = document.createElement("ul");
    coinList.id = "coinList";

    inventory.forEach((coin) => {
      const listItem = document.createElement("li");
      listItem.textContent = `🪙${coin.cell.i}:${coin.cell.j}#${coin.serial}`;
      listItem.style.cursor = "pointer";

      // Emit a custom event for any click on a coin in the list
      listItem.onclick = () => uiManager.emit("centerOnCoin", coin);
      coinList.appendChild(listItem);
    });

    this.statusPanel.appendChild(coinList);
  }

  // Create popup UI for caches and wire events for buttons
  createCachePopUpUI(cache: Cache): HTMLDivElement {
    const popUp = document.createElement("div");
    popUp.innerHTML = `
          <div>There is a cache here at "${cache.positionToString()}". It has <span id="value">${cache.coins.length}</span> coins.</div>
          <button id="pickup">pick up</button>
          <button id="drop">drop</button>`;

    const pickupButton = popUp.querySelector<HTMLButtonElement>("#pickup")!;
    const dropButton = popUp.querySelector<HTMLButtonElement>("#drop")!;
    const valueSpan = popUp.querySelector<HTMLSpanElement>("#value")!;

    dropButton.disabled = inv.length === 0;
    pickupButton.disabled = cache.coins.length === 0;

    pickupButton.addEventListener("click", () => {
      console.log("Before pickup", cache.coins);
      if (cache.coins.length >= 0) {
        const coin = cache.coins.pop()!;
        inv.push(coin);
        cMementos.set(cache.positionToString(), cache.toMemento());
        updateStatus();
        valueSpan.innerHTML = cache.coins.length.toString();
        saveGameState();
        dropButton.disabled = inv.length === 0;
        pickupButton.disabled = cache.coins.length === 0;
      }
    });

    dropButton.addEventListener("click", () => {
      if (inv.length >= 0) {
        const coin = inv.pop()!;
        cache.addCoin(coin);
        cMementos.set(cache.positionToString(), cache.toMemento());
        updateStatus();
        valueSpan.innerHTML = cache.coins.length.toString();
        saveGameState();
        dropButton.disabled = inv.length === 0;
        pickupButton.disabled = cache.coins.length === 0;
      }
    });

    return popUp;
  }

  // Emit events for listeners that will be handled by the game logic
  private emit<T>(eventName: string, ...args: T[]): void {
    const event = new CustomEvent(eventName, { detail: args });
    document.dispatchEvent(event);
  }
}

const uiManager = new UIManager();

document.title = "Geocoin Carrier";

// Location of our classroom (as identified on Google Maps)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Tunable gameplay parameters
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

let playerLoc = loadPlayerLoc() || OAKES_CLASSROOM;
let geoLocationWatchId: number | null = null;
//movement history
let moveHist: leaflet.LatLng[] = [];
//polyline for movement
let pLine: leaflet.polyline | null = null;

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
interface Memento<T> {
  toMemento(): T;
  fromMemento(memento: T): void;
}

//cache memento
class Cache implements Memento<string> {
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
    cMementos.set(this.positionToString(), this.toMemento());
    saveGameState();
  }

  toMemento(): string {
    const mementoInfo = {
      coins: this.coins.map((coin) => ({
        cell: { i: coin.cell.i, j: coin.cell.j },
        serial: coin.serial,
      })),
      position: this.position,
    };
    return JSON.stringify(mementoInfo);
  }

  fromMemento(memento: string): void {
    const mementoInfo = JSON.parse(memento);
    this.position = mementoInfo.position;
    this.coins = mementoInfo.coins.map((coinInfo: Coin) => ({
      cell: { i: coinInfo.cell.i, j: coinInfo.cell.j },
      serial: coinInfo.serial,
      toString() {
        return `${this.cell.i}:${this.cell.j}#${this.serial}`;
      },
    }));
  }
}
const cMementos: Map<string, string> = new Map(loadCaches());

//coins in player inventory
const inv: Coin[] = loadInv();
updateStatus();

//generates caches to be played on map
function spawnCache(i: number, j: number) {
  const latStart = i * TILE_DEGREES;
  const lngStart = j * TILE_DEGREES;
  const bounds = leaflet.latLngBounds(
    [latStart, lngStart], // South-West corner
    [latStart + TILE_DEGREES, lngStart + TILE_DEGREES], // North-East corner
  );

  const cell = CellFlyWeight.getFlyWeightCell(i, j);
  const cache = new Cache(cell, bounds);

  const memento = cMementos.get(cache.positionToString());
  if (memento) {
    //restore the cache state from the memento
    cache.fromMemento(memento);
  } else {
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

    cMementos.set(cache.positionToString(), cache.toMemento());
  }

  //add cache to map
  const rect = leaflet.rectangle(bounds, {
    color: "blue",
    weight: 1,
    fillOpacity: 0.2,
  }).addTo(map);
  rect.cache = cache;
  rect.bindPopup(() => createCachePopUps(cache));
}

//reference cache saved in flyweight pattern and open popup
function createCachePopUps(cache: Cache): HTMLDivElement {
  return uiManager.createCachePopUpUI(cache);
}

//updating coins in player inventory on display
function updateStatus() {
  uiManager.updateStatusPanel(inv);
}

document.addEventListener("centerOnCoin", (event: Event) => {
  const coin = (event as CustomEvent).detail[0];
  centerMapOnCoin(coin);
});

function centerMapOnCoin(coin: Coin) {
  const coinLat = coin.cell.i * TILE_DEGREES;
  const coinLng = coin.cell.j * TILE_DEGREES;
  const coinLoc = leaflet.latLng(coinLat, coinLng);

  map.setView(coinLoc, GAMEPLAY_ZOOM_LEVEL);

  //temporary marker at the cache location
  const tempMarker = leaflet.marker(coinLoc, {
    icon: leaflet.divIcon({
      className: "temp-marker",
      html: "📍",
      iconSize: [60, 60],
      iconAnchor: [12, 36],
    }),
  }).addTo(map);

  //remove the temporary marker after 3 seconds
  setTimeout(() => map.removeLayer(tempMarker), 3000);
}

//save gamestate to localstorage
function saveGameState() {
  localStorage.setItem("playerLocation", JSON.stringify(playerLoc));
  localStorage.setItem("inventory", JSON.stringify(inv));
  localStorage.setItem(
    "cMementos",
    JSON.stringify(Array.from(cMementos.entries())),
  );
}

//load caches from localstorage
function loadCaches(): Map<string, string> {
  const savedCaches = localStorage.getItem("cMementos");
  return savedCaches ? new Map(JSON.parse(savedCaches)) : new Map();
}

//load inv from localstorage
function loadInv(): Coin[] {
  const savedInv = localStorage.getItem("inventory");
  return savedInv ? JSON.parse(savedInv) : [];
}

//load player location from localstorage
function loadPlayerLoc(): leaflet.LatLng | null {
  const savedLoc = localStorage.getItem("playerLocation");
  return savedLoc ? leaflet.latLng(JSON.parse(savedLoc)) : null;
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
  button.innerHTML = name;
  button.onclick = () => movePlayer(lat, lng);
  uiManager.addControlPanelButton(button);
});

const geoLocateButton = document.createElement("button");
geoLocateButton.innerHTML = "🌐";
geoLocateButton.onclick = toggleGeoLocation;
uiManager.addControlPanelButton(geoLocateButton);

const resetButton = document.createElement("button");
resetButton.innerHTML = "🚮";
resetButton.onclick = resetGameState;
uiManager.addControlPanelButton(resetButton);
document.body.appendChild(uiManager.getControlPanel());

//move player and update the map view
function movePlayer(latChange: number, lngChange: number) {
  playerLoc = leaflet.latLng(
    playerLoc.lat + latChange,
    playerLoc.lng + lngChange,
  );
  playerMarker.setLatLng(playerLoc);

  //recenter the map view on the player
  map.setView(playerLoc);

  moveHist.push(playerLoc);
  if (pLine) {
    map.removeLayer(pLine);
  }
  pLine = leaflet.polyline(moveHist, {
    color: "red", // Color of the polyline
    weight: 3, // Width of the polyline
    opacity: 0.7, // Opacity of the polyline
  }).addTo(map);

  //clear cache
  clearCaches();
  //regenerate caches around player location
  generateCaches();
}

function toggleGeoLocation() {
  if (geoLocationWatchId === null) {
    geoLocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        playerLoc = leaflet.latLng(
          position.coords.latitude,
          position.coords.longitude,
        );
        playerMarker.setLatLng(playerLoc);
        saveGameState();
        map.setView(playerLoc);
        clearCaches();
        generateCaches();
      },
      (error) => console.error("Geolocation error:", error),
      { enableHighAccuracy: true },
    );
    geoLocateButton.innerHTML = "🌐 (On)";
  } else {
    navigator.geolocation.clearWatch(geoLocationWatchId);
    geoLocationWatchId = null;
    geoLocateButton.innerHTML = "🌐 (Off)";
  }
}

function resetGameState() {
  const confirmation = prompt(
    "Are you sure you want to reset the game? Type 'yes' to confirm.",
  );
  if (confirmation && confirmation.toLowerCase() === "yes") {
    //clear location and inventory history
    localStorage.removeItem("playerLocation");
    localStorage.removeItem("inventory");
    localStorage.removeItem("cMementos");

    //reset player location to initial value
    playerLoc = OAKES_CLASSROOM;
    playerMarker.setLatLng(playerLoc);
    map.setView(playerLoc);

    //clear caches from the map
    clearCaches();

    //reset inventory and mementos
    inv.length = 0;
    cMementos.clear();
    updateStatus();

    // Clear movement history and polyline
    moveHist = [];
    if (pLine) {
      map.removeLayer(pLine);
      pLine = null;
    }

    console.log("Game has been reset.");
  }
}

//populate caches around new player location
function generateCaches() {
  const playerCell = CellFlyWeight.getLatLngCell(playerLoc.lat, playerLoc.lng);
  for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
      const dist = Math.abs(i) + Math.abs(j);
      const cellKey = [playerCell.i + i, playerCell.j + j].toString();
      if (
        dist <= NEIGHBORHOOD_SIZE && luck(cellKey) < CACHE_SPAWN_PROBABILITY
      ) {
        spawnCache(playerCell.i + i, playerCell.j + j);
      }
    }
  }
}

function clearCaches() {
  map.eachLayer((layer: Layer) => {
    if (layer instanceof leaflet.Rectangle && layer.cache) {
      const cache = layer.cache as Cache;
      cMementos.set(cache.positionToString(), cache.toMemento());
      map.removeLayer(layer);
    }
  });
}

//populate caches around player
generateCaches();
