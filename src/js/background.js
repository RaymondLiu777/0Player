class Background {
  constructor(tileSize) {
    this.tileSize = tileSize;
    this.tiles = []; // 2D array of Tile objects (main layer)
    this.groundTiles = []; // 2D array of ground Tile objects (base layer)
    this.instructions = null;
    this.width = 0;
    this.height = 0;

    // off‑screen cache
    this.cacheCanvas = null;
    this.cacheCtx = null;
  }

  load(data, image, instructionImg) {
    this.height = data.mapHeight;
    this.width = data.mapWidth;
    this.tiles = [];
    this.groundTiles = [];
    const spriteMap = data.spriteMap;
    const bgMap = data.backgroundMap;

    // Set up instructions image
    const instructionX = data.instructions.location.x;
    const instructionY = data.instructions.location.y;
    const instuctionFrame = data.instructions.frame;
    this.instructions = new Sprite(
      1, 
      instructionImg, 
      instuctionFrame,
      {
        "x": instructionX * this.tileSize,
        "y": instructionY * this.tileSize,
      }, 
      {
        "w": instuctionFrame.w,
        "h": instuctionFrame.h
      },
      0
    );

    // Build 3D category mapping
    const sprite3DMap = {};
    if (data["3d"]) {
      for (const [category, categoryData] of Object.entries(data["3d"])) {
        const sprites = categoryData.sprites;
        const height = categoryData.height;
        for (const spriteId of sprites) {
          sprite3DMap[spriteId] = {
            category: category,
            height: height
          };
        }
      }
    }

    // Build sprite frames lookup
    const cols = data.spriteSheetSize.columns;
    const total = data.spriteSheetSize.count;
    const frames = {};
    for (let id = 1; id <= total; id++) {
      const idx = id - 1;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      frames[id] = { x: col * this.tileSize, y: row * this.tileSize, w: this.tileSize, h: this.tileSize };
    }

    // Create 2D array of main Tile objects
    for (let row = 0; row < this.height; row++) {
      const rowTileData = [];
      const rowGroundData = [];
      for (let col = 0; col < this.width; col++) {
        let spriteId = spriteMap[row * this.width + col];
        const spriteFrame = frames[spriteId];
        const sprite3D = sprite3DMap[spriteId];
        const category = sprite3D ? sprite3D.category : null;
        const height = sprite3D ? sprite3D.height : 0;

        const tile = spriteId == 0 || category == 'ignore' ? null : new Tile(
          spriteId,
          { x: col * this.tileSize, y: row * this.tileSize},
          image,
          spriteFrame,
          this.tileSize,
          height,
          category,
          null // wire (can be added later if needed)
        );

        // Ground tile is set if the tile is not a wall
        let groundTile = null;
        
        if( category != "wall") {
          let groundSpriteId = bgMap[row * this.width + col];
          const bgFrame = frames[groundSpriteId];
          const bgSprite3D = sprite3DMap[groundSpriteId];
          const bgCategory = bgSprite3D ? bgSprite3D.category : null;
          const bgHeight = bgSprite3D ? bgSprite3D.height : 0;
          groundTile = new Tile(
            groundSpriteId,
            { x: col * this.tileSize, y: row * this.tileSize },
            image,
            bgFrame,
            this.tileSize,
            bgHeight,
            bgCategory,
            null
          );
        }
        rowTileData.push(tile);
        rowGroundData.push(groundTile);
      }
      this.tiles.push(rowTileData);
      this.groundTiles.push(rowGroundData);
    }

    // --- initialise hide3D for any wall tiles ---
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const tile = this.tiles[row][col];
        if (tile && tile.category === 'wall') {
          // if there's a wall immediately to the right, hide the right face
          if (col + 1 < this.width) {
            const right = this.tiles[row][col + 1];
            if (right && right.category === 'wall') {
              tile.hide3D.right = true;
            }
          }
          // if there's a wall immediately below, hide the bottom face
          if (row + 1 < this.height) {
            const down = this.tiles[row + 1][col];
            if (down && down.category === 'wall') {
              tile.hide3D.bottom = true;
            }
          }
        }
        if (tile && tile.category === 'barrier') {
          const right = (col + 1 < this.width) ? this.tiles[row][col + 1] : null;
          const down = (row + 1 < this.height) ? this.tiles[row + 1][col] : null;
          const downright = (col + 1 < this.width && row + 1 < this.height) ? this.tiles[row + 1][col + 1] : null;
          if( right && down && downright && right.height >= tile.height && 
              down.height >= tile.height && downright.height >= tile.height) {
            tile.hide3D.all = true;
          }
        }
      }
    }

    // build the off‑screen cache while everything is still in place
    this.renderCache();

    return this;
  }

  // draw entire background (ground + main + any wires + instructions)
  renderCache() {
    const pxW = this.width * this.tileSize;
    const pxH = this.height * this.tileSize;

    if (!this.cacheCanvas) {
      this.cacheCanvas = document.createElement('canvas');
      this.cacheCtx = this.cacheCanvas.getContext('2d');
    }
    this.cacheCanvas.width = pxW;
    this.cacheCanvas.height = pxH;

    const ctx = this.cacheCtx;
    ctx.clearRect(0, 0, pxW, pxH);

    // ground layer first
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const gt = this.groundTiles[row][col];
        if (gt) {
          gt.draw(ctx, 0, 0, pxW, pxH, 1);
        }
      }
    }
    // main layer
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const t = this.tiles[row][col];
        if (t) {
          t.draw(ctx, 0, 0, pxW, pxH, 1);
        }
      }
    }
    if (this.instructions) this.instructions.draw(ctx, 0, 0, pxW, pxH, 1);
  }

  /**
   * Re‑draw wire when the wire state changes to cache.
   */
  updateCache(wire) {
    const col = Math.floor(wire.x / this.tileSize);
    const row = Math.floor(wire.y / this.tileSize);
    if (row < 0 || row >= this.height || col < 0 || col >= this.width) return;

    const main = this.tiles[row][col] || this.groundTiles[row][col];
    if (main && main.wire && main.wire.spriteId == wire.spriteId) {
      wire.draw(this.cacheCtx, 0, 0, this.cacheCanvas.width, this.cacheCanvas.height, 1);

      // collect any other tiles that should be re‑rendered
      const dirty = this.getOccludedDirtyTiles(wire);
      for (const t of dirty) {
        t.draw(this.cacheCtx, 0, 0, this.cacheCanvas.width, this.cacheCanvas.height, 1);
      }
    }
  }

  /**
   * Determine which tiles are “occluded”/need rerendering when a
   * wire or block is updated.
   *
   * The algorithm begins with the tile under the item and then performs
   * a breadth‑first search of neighbouring tiles that might cast a
   * shadow (right, bottom and bottom‑right).  The BFS rules are based
   * on 3‑D flags (`hide3D`, `directions3D`) and tile category.
   *
   * @param {Object} item  wire or block object with coords
   * @returns {Tile[]} list of tile objects that should be redrawn
   */
  getOccludedDirtyTiles(item) {
    const dirty = [];
    const queue = [];
    const visited = new Set();

    const enqueue = (r, c) => {
      const key = `${r},${c}`;
      if (visited.has(key)) return;
      visited.add(key);
      queue.push({ row: r, col: c });
    };

    const checkNeighborsHeight = (height, row, col) => {
      const currentHeight = height;
      if (col + 1 < this.width) {
        const right = this.tiles[row][col + 1] || this.groundTiles[row][col + 1];
        if (right && right.height > currentHeight) {
          enqueue(row, col + 1);
        }
      }
      if (row + 1 < this.height) {
        const down = this.tiles[row + 1][col] || this.groundTiles[row + 1][col];
        if (down && down.height > currentHeight) {
          enqueue(row + 1, col);
        }
      }
    }

    const startCol = Math.floor(item.x / this.tileSize);
    const startRow = Math.floor(item.y / this.tileSize);

    // start with the tile under the object
    

    // if it's a wire, include immediate neighbours that
    // might be affected by its 3‑D shadow directions
    if (item instanceof Wire) {
      enqueue(startRow, startCol);
      checkNeighborsHeight(item.height, startRow, startCol);
      if (item.directions3D.right) {
        enqueue(startRow, startCol + 1);
        enqueue(startRow + 1, startCol + 1);
      }
      if (item.directions3D.down) {
        enqueue(startRow + 1, startCol);
        enqueue(startRow + 1, startCol + 1);
      }
    }

    if (item instanceof Block) {
      visited.add(`${startRow},${startCol}`);
      enqueue(startRow, startCol + 1);
      enqueue(startRow + 1, startCol);
      enqueue(startRow + 1, startCol + 1);
    }

    // BFS – walk neighbours looking for further occluders
    while (queue.length) {
      const { row, col } = queue.shift();
      if (row < 0 || row >= this.height || col < 0 || col >= this.width) {
        continue;
      }

      const tile = this.tiles[row][col];
      if (!tile || tile.height === 0) continue;

      dirty.push(tile);

      // Check neighbor heights
      checkNeighborsHeight(tile.height, row, col);

      // barrier/gate rules drive further propagation
      if(tile.category === 'wall') {
        if (!tile.hide3D.right) {
          enqueue(row, col + 1);
          enqueue(row + 1, col + 1);
        }
        if (!tile.hide3D.down) {
          enqueue(row + 1, col);
          enqueue(row + 1, col + 1);
        }
      }
      else if (tile.category === 'barrier') {
        if (!tile.hide3D.all) {
          enqueue(row, col + 1);
          enqueue(row + 1, col);
          enqueue(row + 1, col + 1);
        }
      } else if (tile.category === 'gate') {
        enqueue(row, col + 1);
        enqueue(row + 1, col);
        enqueue(row + 1, col + 1);
      }
    }

    dirty.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    return dirty;
  }

  addGates(gates) {
    for (const gate of gates) {
      const col = Math.floor(gate.x / this.tileSize);
      const row = Math.floor(gate.y / this.tileSize);
      if (row >= 0 && row < this.tiles.length &&
          col >= 0 && col < this.tiles[row].length) {
        this.tiles[row][col] = gate;
      }
    }
  }f

  attachWires(wires) {
    for (const w of wires) {
      // Attach to background tile (check main tiles first, then ground tiles)
      const col = Math.floor(w.x / this.tileSize);
      const row = Math.floor(w.y / this.tileSize);

      let tile = null;
      // Check main tiles first
      if (row >= 0 && row < this.tiles.length && col >= 0 &&
          col < this.tiles[row].length) {
        tile = this.tiles[row][col];
      }
      // Fall back to ground tiles if main tile is empty/transparent
      if (!tile || tile.spriteId === 0) {
        if (row >= 0 && row < this.groundTiles.length &&
            col >= 0 && col < this.groundTiles[row].length) {
          tile = this.groundTiles[row][col];
        }
      }

      if (tile) {
        tile.wire = w;
        w.height = tile.height;

        // disable 3D shadows in directions where an adjacent tile
        // is at least as tall as this one
        // look right
        if (col + 1 < this.tiles[row].length) {
          const neigh = this.tiles[row][col + 1];
          if (neigh && neigh.height >= tile.height) {
            w.directions3D.right = false;
          }
        }
        // look down
        if (row + 1 < this.tiles.length) {
          const neigh = this.tiles[row + 1][col];
          if (neigh && neigh.height >= tile.height) {
            w.directions3D.down = false;
          }
        }
      }
    }
  }

  // Check and toggle any tiles at map coords (checks main tiles first, then ground tiles for wires)
  isClicked(mapX, mapY) {
    const col = Math.floor(mapX / this.tileSize);
    const row = Math.floor(mapY / this.tileSize);
    if (row >= 0 && row < this.tiles.length && col >= 0 && col < this.tiles[row].length) {
      const tile = this.tiles[row][col];
      if (tile && tile.isClicked(mapX, mapY)) {
        if (tile.wire != null) return tile.wire;
      }
    }
    // Check ground tiles for wires
    if (row >= 0 && row < this.groundTiles.length && col >= 0 && col < this.groundTiles[row].length) {
      const groundTile = this.groundTiles[row][col];
      if (groundTile && groundTile.isClicked(mapX, mapY)) {
        if (groundTile.wire != null) return groundTile.wire;
      }
    }

    return null;
  }

  // Collect all visible tiles for drawing
  getVisibleTiles(cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    const viewWidth = canvasWidth / zoomLevel;
    const viewHeight = canvasHeight / zoomLevel;

    const startCol = Math.floor(cameraX / this.tileSize);
    const endCol = Math.ceil((cameraX + viewWidth) / this.tileSize);
    const startRow = Math.floor(cameraY / this.tileSize);
    const endRow = Math.ceil((cameraY + viewHeight) / this.tileSize);

    const tiles = [];

    // Collect ground tiles
    for (let row = startRow; row <= endRow; row++) {
      if (row < 0 || row >= this.groundTiles.length) continue;
      const rowData = this.groundTiles[row];

      for (let col = startCol; col <= endCol; col++) {
        if (col < 0 || col >= rowData.length) continue;
        const tile = rowData[col];
        if (tile) {
          tiles.push(tile);
        }
      }
    }

    // Collect main layer tiles
    for (let row = startRow; row <= endRow; row++) {
      if (row < 0 || row >= this.tiles.length) continue;
      const rowData = this.tiles[row];

      for (let col = startCol; col <= endCol; col++) {
        if (col < 0 || col >= rowData.length) continue;
        const tile = rowData[col];
        if (tile) {
          tiles.push(tile);
        }
      }
    }

    return tiles;
  }
}