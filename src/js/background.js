class Background {
  constructor(tileSize) {
    this.tileSize = tileSize;
    this.tiles = []; // 2D array of Tile objects (main layer)
    this.groundTiles = []; // 2D array of ground Tile objects (base layer)
    this.instructions = null;
    this.width = 0;
    this.height = 0;
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
      }
    }

    return this;
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
  }

  attachWires(wires) {
    for (const w of wires) {
      // Attach to background tile (check main tiles first, then ground tiles)
      const col = Math.floor(w.x / this.tileSize);
      const row = Math.floor(w.y / this.tileSize);

      let tile = null;
      // Check main tiles first
      if (row >= 0 && row < this.tiles.length && col >= 0 && col < this.tiles[row].length) {
        tile = this.tiles[row][col];
      }
      // Fall back to ground tiles if main tile is empty/transparent
      if (!tile || tile.spriteId === 0) {
        if (row >= 0 && row < this.groundTiles.length && col >= 0 && col < this.groundTiles[row].length) {
          tile = this.groundTiles[row][col];
        }
      }

      if (tile) {
        tile.wire = w;
        w.height = tile.height;
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