class Background {
  constructor(tileSize) {
    this.tileSize = tileSize;
    this.spritemap = {};
    this.mapData = [];
    this.image = new Image();
    this.loaded = false;
    this.width = 0;
    this.height = 0;
    this.wires = [];
    this.bgTile = 0;
  }

  load(data, image) {
    // Set map size and mapData (numbers)
    this.height = data.mapHeight;
    this.width = data.mapWidth;
    this.mapData = [];
    const spriteMap = data.spriteMap;
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
    const cols = data.spriteSheetSize.columns;
    const rows = data.spriteSheetSize.rows;
    const total = data.spriteSheetSize.count;
    
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
    
    for (let id = 1; id <= total; id++) {
      const idx = id - 1;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      this.spritemap[id] = { 
        x: col * this.tileSize, 
        y: row * this.tileSize, 
        w: this.tileSize, 
        h: this.tileSize 
      };
      
      // Add 3D data if available
      if (sprite3DMap[id]) {
        this.spritemap[id].category = sprite3DMap[id].category;
        this.spritemap[id].height = sprite3DMap[id].height;
      }
    }

    this.loaded = true;
    this.bgTile = this.spritemap[data.bgTile];
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
  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel = 1, layer) {
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

        const worldX = col * this.tileSize;
        const worldY = row * this.tileSize;
        const screenX = Math.floor((worldX - cameraX) * zoomLevel);
        const screenY = Math.floor((worldY - cameraY) * zoomLevel);
        const nextScreenX = Math.floor(((worldX + this.tileSize) - cameraX) * zoomLevel);
        const nextScreenY = Math.floor(((worldY + this.tileSize) - cameraY) * zoomLevel);
        const screenWidth = nextScreenX - screenX;
        const screenHeight = nextScreenY - screenY;
        
        // Draw background tile
        if (layer == 0) {
          ctx.drawImage(
            this.image,
            this.bgTile.x, this.bgTile.y, this.bgTile.w, this.bgTile.h,
            screenX, screenY,
            screenWidth, screenHeight
          );
        }
        if (sprite) {
          const screen3D = Math.floor(sprite.height * zoomLevel);
          // Draw shadow/3d effect
          if (layer == 1){
            if(sprite.category == 'barrier') {
              ctx.filter = "brightness(60%)";
              ctx.drawImage(
                this.image,
                sprite.x, sprite.y, sprite.w, sprite.h,
                screenX, screenY,
                screenWidth, screenHeight
              );
              ctx.filter = "none";
            }
            if(sprite.category == 'wall') {
              // Right side
              const gradright = ctx.createLinearGradient(screenX + screenWidth - screen3D, screenY, screenX + screenWidth, screenY);
              gradright.addColorStop(0, "rgba(47, 47, 47)");
              gradright.addColorStop(1, "rgba(0,0,0)");
              ctx.fillStyle = gradright;
              ctx.beginPath();
              ctx.moveTo(screenX + screenWidth - screen3D, screenY - screen3D);
              ctx.lineTo(screenX + screenWidth, screenY);
              ctx.lineTo(screenX + screenWidth, screenY + screenHeight);
              ctx.lineTo(screenX + screenWidth - screen3D, screenY + screenHeight - screen3D);
              ctx.closePath();
              ctx.fill();
              // Bottom side
              const grad = ctx.createLinearGradient(screenX, screenY + screenHeight - screen3D, screenX, screenY + screenHeight);
              grad.addColorStop(0, "rgba(47, 47, 47)");
              grad.addColorStop(1, "rgba(0,0,0)");
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.moveTo(screenX - screen3D, screenY + screenHeight - screen3D);
              ctx.lineTo(screenX, screenY + screenHeight);
              ctx.lineTo(screenX + screenWidth, screenY + screenHeight);
              ctx.lineTo(screenX + screenWidth - screen3D, screenY + screenHeight - screen3D);
              ctx.closePath();
              ctx.fill();
            }
            
          }

          // Draw actual object
          if (layer == 2) {
            ctx.drawImage(
              this.image,
              sprite.x, sprite.y, sprite.w, sprite.h,
              screenX - screen3D, screenY - screen3D,
              screenWidth, screenHeight
            );
          }
          
        }
      }
    }

    // Draw wires that are not attached to squares
    if (this.wires && this.wires.length && layer == 3) {
      for (const w of this.wires) {
        w.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      }
    }
  }
}