// Main JavaScript file for the 0player game
// This manages events and the cameraX, cameraY and zoomLevel of the stage

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Set canvas size
canvas.width = 800;
canvas.height = 600;

// Camera position
let cameraX = 0;
let cameraY = 0;
let zoomLevel = .5; // 1 = 100%, 2 = 200%, etc.
const minZoom = 0.3;
const maxZoom = 1;
const zoomSpeed = 0.1;

// Movement settings
const moveSpeed = 600; // pixels per second
const zoomSpeedPerSec = 1.0; // zoom units per second when holding Q/E

// Mouse tracking for panning
let isMouseDown = false;
let lastMouseX = 0;
let lastMouseY = 0;
let hasMousePos = false;
let mouseButton = null; // Track which button is pressed

// Stage instance (contains background and wires)
let stage = null;

// Track keyboard state
const keys = {
  w: false,
  a: false,
  s: false,
  d: false,
  q: false,
  e: false,
  g: false
};

// Helper: convert mouse event to map coordinates (handles canvas position/scale and zoom)
function getMapCoordsFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = e.clientX - rect.left;
  const canvasY = e.clientY - rect.top;
  
  // Account for zoom level
  const mapX = cameraX + canvasX / zoomLevel;
  const mapY = cameraY + canvasY / zoomLevel;
  
  return {
    x: mapX,
    y: mapY
  };
}

// Helper: convert clientX/clientY to map coords (used when updating drag while keyboard moves camera)
function getMapCoordsFromClient(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const canvasX = clientX - rect.left;
  const canvasY = clientY - rect.top;
  return {
    x: cameraX + canvasX / zoomLevel,
    y: cameraY + canvasY / zoomLevel
  };
}

// Prevent default context menu so right-click can be used
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Hook checkbox to update snapToGrid
document.addEventListener('DOMContentLoaded', () => {
  const snapCheckbox = document.getElementById('snap-checkbox');
  if (snapCheckbox) {
    snapToGrid = !!snapCheckbox.checked;
    snapCheckbox.addEventListener('change', (e) => {
      if(stage) {
        stage.snapToGrid = !!e.target.checked;
      }
    });
  }
});

// Mouse events for interactions
canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  hasMousePos = true;
  mouseButton = e.button; // 0 = left, 1 = middle, 2 = right
  
  handleMouseDown(e);
});

canvas.addEventListener('mousemove', (e) => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  hasMousePos = true;

  const pos = getMapCoordsFromEvent(e);

  // Hover highlighting (always)
  if (stage) stage.hoverAt(pos.x, pos.y);

  // Dragging with left mouse button — delegate to Stage
  if (isMouseDown && mouseButton === 0 && stage && stage.draggingBlock) {
    stage.updateDrag(pos.x, pos.y);
    render();
  }
});

canvas.addEventListener('mouseup', (e) => {
  // End drag on left mouse up
  if (stage && stage.draggingBlock && e.button === 0) {
    stage.endDrag();
  }
  isMouseDown = false;
  mouseButton = null;
});

canvas.addEventListener('mouseleave', () => {
  if (stage) stage.endDrag();
  isMouseDown = false;
  mouseButton = null;
  hasMousePos = false;
});

// Keyboard handlers for WASD + Q/E + G
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (k in keys) {
    const was = keys[k];
    keys[k] = true;
    e.preventDefault();
    // start grouping mode when g is pressed
    if (k === 'g' && !was && stage) {
      stage.startGroupingMode();
    }
  }
});

window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (k in keys) {
    const was = keys[k];
    keys[k] = false;
    e.preventDefault();
    // finalize grouping when g released only if it was pressed
    if (k === 'g' && was && stage) {
      stage.finalizeGrouping();
    }
  }
});

// Handle different mouse button clicks
function handleMouseDown(e) {
  const button = e.button;
  const pos = getMapCoordsFromEvent(e);

  if (button === 0) {
    // Left click – either add to the temporary group (if G is held) or start a drag.
    if (keys.g) {
      if (stage) {
        const added = stage.addBlockToTempAt(pos.x, pos.y);
        if (added) render();
      }
      return;
    }

    // normal left‑click behaviour: try to begin dragging a block
    if (stage) {
      const started = stage.startDrag(pos.x, pos.y);
      if (started) return;
    }
    return;
  }

  if (button === 2) {
    // Right click – toggle wire only
    if (stage) {
      const toggled = stage.isClicked(pos.x, pos.y);
      if (toggled) {
        render();
        return;
      }
    }
    return;
  }

  switch(button) {
    case 1: // Middle click
      // reserved
      break;
  }
}

// Function to render the game
function render() {
  // Clear canvas
  ctx.fillStyle = '#F0F0F0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw stage (background + wires)
  if (stage) {
    stage.draw(ctx, cameraX, cameraY, canvas.width, canvas.height, zoomLevel);
  }
}

// Game loop (uses delta time for smooth keyboard movement)
let lastTime = performance.now();
function gameLoop(timestamp = performance.now()) {
  const now = timestamp;
  const dt = Math.min(0.033, (now - lastTime) / 1000); // clamp dt to avoid huge jumps
  lastTime = now;

  // Camera movement (WASD)
  let movedX = 0;
  let movedY = 0;
  if (keys.w) { movedY -= moveSpeed * (1/zoomLevel) * dt; }
  if (keys.s) { movedY += moveSpeed * (1/zoomLevel) * dt; }
  if (keys.a) { movedX -= moveSpeed * (1/zoomLevel) * dt; }
  if (keys.d) { movedX += moveSpeed * (1/zoomLevel) * dt; }
  if (movedX !== 0 || movedY !== 0) {
    cameraX += movedX;
    cameraY += movedY;
  }

  // Zoom via Q (out) / E (in)
  if (keys.q || keys.e) {
    const oldZoom = zoomLevel;
    const dir = keys.e ? -1 : (keys.q ? 1 : 0); // e = zoom in (decrease negative), q = zoom out
    zoomLevel -= dir * zoomSpeedPerSec * dt;
    zoomLevel = Math.max(minZoom, Math.min(zoomLevel, maxZoom));

    // Keep view centered on same point when zoom changes (use screen center)
    if (oldZoom !== zoomLevel) {
      const centerCanvasX = canvas.width / 2;
      const centerCanvasY = canvas.height / 2;
      const centerMapX = cameraX + centerCanvasX / oldZoom;
      const centerMapY = cameraY + centerCanvasY / oldZoom;
      cameraX = centerMapX - (centerCanvasX / zoomLevel);
      cameraY = centerMapY - (centerCanvasY / zoomLevel);
    }
  }

  clampCamera();

  // If user is dragging a block and holding WASD (camera moved), keep the dragged block under the cursor
  if (stage && stage.draggingBlock && hasMousePos) {
    const pos = getMapCoordsFromClient(lastMouseX, lastMouseY);
    stage.updateDrag(pos.x, pos.y);
  }
  
  const startRender = performance.now();
  render();
  const endRender = performance.now();
  
  requestAnimationFrame(gameLoop);

  const done = performance.now();
  const frameTime = (done - now);
  // console.log("Total time: ", frameTime, "Render time: ", endRender - startRender);
}

// Clamp camera into stage bounds
function clampCamera() {
  if (!stage || !stage.background) return;
  const mapWidth = stage.background.width * stage.background.tileSize - 16;
  const mapHeight = stage.background.height * stage.background.tileSize - 16;
  const viewWidth = canvas.width / zoomLevel;
  const viewHeight = canvas.height / zoomLevel;
  cameraX = Math.max(0, Math.min(cameraX, Math.max(0, mapWidth - viewWidth)));
  cameraY = Math.max(0, Math.min(cameraY, Math.max(0, mapHeight - viewHeight)));
}


// Load data and initialize stage
async function initializeGame() {
  try {
    stage = new Stage(64);
    await stage.load('data/data.json');

    // start the view in the lower‑left corner of the map
    cameraX = 0;
    if (stage && stage.background) {
      const mapPxH = stage.background.height * stage.background.tileSize;
      cameraY = mapPxH - (canvas.height / zoomLevel);
      clampCamera();
    }

    lastTime = performance.now();
    gameLoop();
  } catch (error) {
    console.log(error)
    console.error('Failed to initialize game:', error);
  }
}

// Initial render
initializeGame();