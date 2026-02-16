class Block {
  /**
   * @param {number} spriteId - numeric id of the block texture (from data)
   * @param {string|null} spriteName - name/key of the texture
   * @param {{x:number,y:number}} location - tile coords (col,row)
   * @param {HTMLImageElement} spriteSheet - image containing block textures
   * @param {{x,y,w,h}} spriteFrame - single frame on the spritesheet for this block
   * @param {number} tileSize - size of a tile in pixels
   * @param {Wire|null} wire - optional Wire instance attached to this block
   */
  constructor(spriteId, spriteName, location, spriteSheet, spriteFrame, tileSize = 64, wire = null) {
    this.spriteId = spriteId;
    this.spriteName = spriteName;
    this.x = location.x * tileSize; // world pixels
    this.y = location.y * tileSize;
    this.tileSize = tileSize;
    this.spriteSheet = spriteSheet;
    this.spriteFrame = spriteFrame;
    this.wire = wire;
    this.highlighted = false;
  }

  // Returns true if the given map pixel coordinates (mapX, mapY) fall inside this block's tile
  isClicked(mapX, mapY) {
    return (
      mapX >= this.x &&
      mapX < this.x + this.tileSize &&
      mapY >= this.y &&
      mapY < this.y + this.tileSize
    );
  }

  // If there's a wire attached, toggle it
  toggle() {
    if (this.wire) {
      this.wire.toggle();
      return true;
    }
    return false;
  }

  // Set highlight state
  setHighlighted(flag) {
    this.highlighted = flag;
  }

  // Set world position (in pixels). Updates attached wire world position too.
  setWorldPosition(worldX, worldY) {
    this.x = Math.round(worldX);
    this.y = Math.round(worldY);
    if (this.wire && typeof this.wire.setWorldPosition === 'function') {
      this.wire.setWorldPosition(this.x, this.y);
    } else if (this.wire) {
      // fallback: directly update wire coords
      this.wire.x = this.x;
      this.wire.y = this.y;
    }
  }

  // Draw the block and its attached wire (if any). Cull tiles outside the view.
  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel = 1) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;

    const viewWidth = canvasWidth / zoomLevel;
    const viewHeight = canvasHeight / zoomLevel;

    // Cull in world coordinates
    if (this.x + this.tileSize < cameraX || this.x > cameraX + viewWidth ||
        this.y + this.tileSize < cameraY || this.y > cameraY + viewHeight) {
      return;
    }

    const screenX = Math.floor((this.x - cameraX) * zoomLevel);
    const screenY = Math.floor((this.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((this.x + this.tileSize) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((this.y + this.tileSize) - cameraY) * zoomLevel);
    const screenW = Math.max(1, nextScreenX - screenX);
    const screenH = Math.max(1, nextScreenY - screenY);

    ctx.drawImage(
      this.spriteSheet,
      this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
      screenX, screenY,
      screenW, screenH
    );

    // Highlight overlay (semi-transparent)
    if (this.highlighted) {
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(screenX, screenY, screenW, screenH);
      // ctx.strokeStyle = 'rgba(0,100,200,0.6)';
      // ctx.lineWidth = Math.max(1, Math.round(2 * zoomLevel));
      // ctx.strokeRect(screenX + 0.5, screenY + 0.5, screenW - 1, screenH - 1);
    }

    // Draw the attached wire on top (if present)
    if (this.wire) {
      this.wire.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }
  }

  // Static helper: create Block instances from blocks section of data.json
  // blocksData: data.blocks object
  // blocksImage: preloaded Image
  // tileSize: tile size in pixels
  static fromData(blocksData, blocksImage, tileSize = 64) {
    const cols = blocksData.spriteSheetSize.columns;
    const rows = blocksData.spriteSheetSize.rows;
    const total = blocksData.spriteSheetSize.count;
    const frames = {};
    for (let id = 1; id <= total; id++) {
      const idx = id - 1;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      frames[id] = { x: col * tileSize, y: row * tileSize, w: tileSize, h: tileSize };
    }

    const map = blocksData.spriteMap || [];
    const blocks = [];
    const width = blocksData.mapWidth;
    const offset = blocksData.spriteOffset;
    let instanceId = 1;
    for (let i = 0; i < map.length; i++) {
      let spriteId = map[i];
      if (!spriteId) continue;
      spriteId -= offset;
      const row = Math.floor(i / width);
      const col = i % width;
      const frame = frames[spriteId];
      const block = new Block(instanceId, name, { x: col, y: row }, blocksImage, frame, tileSize, null);
      instanceId += 1;
      blocks.push(block);
    }
    return blocks;
  }
}