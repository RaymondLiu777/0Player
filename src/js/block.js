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
  constructor(spriteId, spriteName, location, spriteSheet, spriteFrame, tileSize = 64, wire = null, height = 0) {
    this.spriteId = spriteId;
    this.spriteName = spriteName;
    this.x = location.x * tileSize; // world pixels
    this.y = location.y * tileSize;
    this.tileSize = tileSize;
    this.spriteSheet = spriteSheet;
    this.spriteFrame = spriteFrame;
    this.wire = wire;
    this.highlighted = false;
    this.height = height;
  }

  // Returns true if the given map pixel coordinates (mapX, mapY) fall inside this block's tile
  isClicked(mapX, mapY) {
    return (
      mapX >= this.x - this.height &&
      mapX < this.x + this.tileSize - this.height &&
      mapY >= this.y - this.height &&
      mapY < this.y + this.tileSize - this.height
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

  // Draw the block and its attached wire (if any)
  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;

    const screenX = Math.floor((this.x - cameraX) * zoomLevel);
    const screenY = Math.floor((this.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((this.x + this.tileSize) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((this.y + this.tileSize) - cameraY) * zoomLevel);
    const screenW = Math.max(1, nextScreenX - screenX);
    const screenH = Math.max(1, nextScreenY - screenY);
    const screen3D = Math.floor(this.height * zoomLevel);

    // Draw 3D shadow effect
    ctx.filter = "brightness(60%)";
    ctx.drawImage(
      this.spriteSheet,
      this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
      screenX, screenY,
      screenW, screenH
    );
    ctx.filter = "none";

    // Draw block sprite offset by 3D effect
    ctx.drawImage(
      this.spriteSheet,
      this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
      screenX - screen3D, screenY - screen3D,
      screenW, screenH
    );

    // Draw the attached wire on top (if present)
    if (this.wire) {
      this.wire.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }

    // Highlight overlay (semi-transparent)
    if (this.highlighted) {
      ctx.fillStyle = 'rgba(255,255,255,0.20)';
      ctx.fillRect(screenX - screen3D, screenY - screen3D, screenW, screenH);
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
    const height = blocksData.height;
    let instanceId = 1;
    for (let i = 0; i < map.length; i++) {
      let spriteId = map[i];
      if (!spriteId) continue;
      spriteId -= offset;
      const row = Math.floor(i / width);
      const col = i % width;
      const frame = frames[spriteId];
      const block = new Block(instanceId, name, { x: col, y: row }, blocksImage, frame, tileSize, null, height);
      instanceId += 1;
      blocks.push(block);
    }
    return blocks;
  }
}