class Block extends Sprite {
  /**
   * @param {number} spriteId
   * @param {{x:number,y:number}} location (in the grid, not actual x and y)
   * @param {HTMLImageElement} spriteSheet
   * @param {{x,y,w,h}} spriteFrame
   * @param {number} tileSize
   * @param {number} height
   * @param {Wire|null} wire
   */
  constructor(spriteId, location, spriteSheet, spriteFrame, tileSize, height, wire) {
    super(spriteId, spriteSheet, spriteFrame, location, tileSize, height);
    this.wire = wire;
    this.highlighted = false;
  }

  toggle() {
    if (this.wire) {
      this.wire.toggle();
      return true;
    }
    return false;
  }

  setHighlighted(flag) {
    this.highlighted = flag;
  }

  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;

    const screenX = Math.floor((this.x - cameraX) * zoomLevel);
    const screenY = Math.floor((this.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((this.x + this.tileSize.w) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((this.y + this.tileSize.h) - cameraY) * zoomLevel);
    const screenW = Math.max(1, nextScreenX - screenX);
    const screenH = Math.max(1, nextScreenY - screenY);

    // 3‑D shadow
    ctx.filter = "brightness(60%)";
    ctx.drawImage(
      this.spriteSheet,
      this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
      screenX, screenY,
      screenW, screenH
    );
    ctx.filter = "none";

    // base sprite
    super.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);

    if (this.wire) {
      this.wire.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }
  }

  setWorldPosition(worldX, worldY) {
    super.setWorldPosition(worldX, worldY);
    if (this.wire) {
      this.wire.setWorldPosition(this.x, this.y);
    }
  }

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
      const block = new Block(instanceId, { x: col * tileSize, y: row * tileSize }, blocksImage, frame, tileSize, height, null);
      instanceId += 1;
      blocks.push(block);
    }
    return blocks;
  }
}