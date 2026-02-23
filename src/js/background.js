class Background {
  constructor(tileSize) {
    this.tileSize = tileSize;
    this.tiles = []; // 2D array of Tile objects (main layer)
    this.groundTiles = []; // 2D array of ground Tile objects (base layer)
    this.width = 0;
    this.height = 0;
  }

  load(data, image) {
    this.height = data.mapHeight;
    this.width = data.mapWidth;
    this.tiles = [];
    this.groundTiles = [];
    const spriteMap = data.spriteMap;
    const bgTileId = data.bgTile;

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

    // Get ground tile sprite frame
    const bgFrame = frames[bgTileId];
    const bgSprite3D = sprite3DMap[bgTileId];
    const bgCategory = bgSprite3D ? bgSprite3D.category : null;
    const bgHeight = bgSprite3D ? bgSprite3D.height : 0;

    // Create 2D array of ground tiles (base layer under everything)
    for (let row = 0; row < this.height; row++) {
      const rowData = [];
      for (let col = 0; col < this.width; col++) {
        const groundTile = new Tile(
          bgTileId,
          { x: col, y: row },
          image,
          bgFrame,
          this.tileSize,
          bgHeight,
          bgCategory,
          null
        );
        rowData.push(groundTile);
      }
      this.groundTiles.push(rowData);
    }

    // Create 2D array of main Tile objects
    for (let row = 0; row < this.height; row++) {
      const rowData = [];
      for (let col = 0; col < this.width; col++) {
        let spriteId = spriteMap[row * this.width + col];
        const spriteFrame = frames[spriteId];
        const sprite3D = sprite3DMap[spriteId];
        const category = sprite3D ? sprite3D.category : null;
        const height = sprite3D ? sprite3D.height : 0;

        const tile = new Tile(
          spriteId,
          { x: col, y: row },
          image,
          spriteFrame,
          this.tileSize,
          height,
          category,
          null // wire (can be added later if needed)
        );
        rowData.push(tile);
      }
      this.tiles.push(rowData);
    }

    return this;
  }

  // Check and toggle any tiles at map coords (checks main tiles first, then ground tiles for wires)
  isClicked(mapX, mapY) {
    const col = Math.floor(mapX / this.tileSize);
    const row = Math.floor(mapY / this.tileSize);
    if (row >= 0 && row < this.tiles.length && col >= 0 && col < this.tiles[row].length) {
      const tile = this.tiles[row][col];
      if (tile.isClicked(mapX, mapY)) {
        if (tile.toggle()) return tile.wire;
      }
    }
    // Check ground tiles for wires
    if (row >= 0 && row < this.groundTiles.length && col >= 0 && col < this.groundTiles[row].length) {
      const groundTile = this.groundTiles[row][col];
      if (groundTile.isClicked(mapX, mapY)) {
        if (groundTile.toggle()) return groundTile.wire;
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