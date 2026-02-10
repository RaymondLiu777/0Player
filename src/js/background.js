class Background {
  constructor(dataPath, tileSize) {
    this.dataPath = dataPath;
    this.tileSize = tileSize;
    this.spritemap = {};
    this.mapData = [];
    this.spriteIds = {};
    this.image = new Image();
    this.loaded = false;
    this.width = 0;
    this.height = 0;
    this.wires = [];
  }

  load(data, image) {
    // Store sprite IDs mapping
    this.spriteIds = data.background.spriteIds;

    // Set map size and mapData (numbers)
    this.height = data.size.height;
    this.width = data.size.width;
    this.mapData = [];
    const spriteMap = data.background.spriteMap;
    for (let row = 0; row < this.height; row++) {
      const rowData = [];
      for (let col = 0; col < this.width; col++) {
        const spriteId = spriteMap[row * this.width + col];
        rowData.push(spriteId);
      }
      this.mapData.push(rowData);
    }

    this.image = image;
    // Build spritemap keyed by numeric sprite id (ids are 1-based)
    this.spritemap = {};
    for (const [name, id] of Object.entries(this.spriteIds)) {
      const idx = id - 1;
      const col = 0;
      const row = idx;
      this.spritemap[id] = {
        name: name,
        x: col * this.tileSize,
        y: row * this.tileSize,
        w: this.tileSize,
        h: this.tileSize
      };
    }
    this.loaded = true;
    return this;
  }

  setWires(wiresArray) {
    this.wires = wiresArray || [];
  }

  // check and toggle any background wires at map coords
  isClicked(mapX, mapY) {
    if (!this.wires || !this.wires.length) return null;
    for (let i = this.wires.length - 1; i >= 0; i--) {
      const w = this.wires[i];
      if (w.isClicked(mapX, mapY)) {
        w.toggle();
        return w;
      }
    }
    return null;
  }

  // Draw only visible tiles for the current camera view
  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel = 1) {
    if (!this.loaded) return;
    
    // Account for zoom level when calculating visible area
    const viewWidth = canvasWidth / zoomLevel;
    const viewHeight = canvasHeight / zoomLevel;
    
    const startCol = Math.floor(cameraX / this.tileSize);
    const endCol = Math.ceil((cameraX + viewWidth) / this.tileSize);
    const startRow = Math.floor(cameraY / this.tileSize);
    const endRow = Math.ceil((cameraY + viewHeight) / this.tileSize);
    
    for (let row = startRow; row <= endRow; row++) {
      if (row < 0 || row >= this.mapData.length) continue;
      const rowData = this.mapData[row];

      for (let col = startCol; col <= endCol; col++) {
        if (col < 0 || col >= rowData.length) continue;
        const spriteId = rowData[col];

        const sprite = this.spritemap[spriteId];
        if (!sprite) continue;

        const worldX = col * this.tileSize;
        const worldY = row * this.tileSize;
        const screenX = Math.floor((worldX - cameraX) * zoomLevel);
        const screenY = Math.floor((worldY - cameraY) * zoomLevel);
        const nextScreenX = Math.floor(((worldX + this.tileSize) - cameraX) * zoomLevel);
        const nextScreenY = Math.floor(((worldY + this.tileSize) - cameraY) * zoomLevel);
        const screenWidth = nextScreenX - screenX;
        const screenHeight = nextScreenY - screenY;

        ctx.drawImage(
          this.image,
          sprite.x, sprite.y, sprite.w, sprite.h,
          screenX, screenY,
          screenWidth, screenHeight
        );
      }
    }

    // Draw wires that are not attached to squares
    if (this.wires && this.wires.length) {
      for (const w of this.wires) {
        w.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      }
    }
  }
}