class Sprite {
  /**
   * @param {number} spriteId
   * @param {HTMLImageElement} spriteSheet
   * @param {{x,y,w,h}} spriteFrame
   * @param {{x:number,y:number}} location – tile coordinates (in the grid, not actual x and y)
   * @param {number|{w:number,h:number}} tileSize
   * @param {number} height
   */
  constructor(spriteId, spriteSheet, spriteFrame, location, tileSize, height) {
    this.spriteId = spriteId;
    this.spriteSheet = spriteSheet;
    this.spriteFrame = spriteFrame;
    this.x = location.x;
    this.y = location.y;
    if (typeof tileSize === 'number') {
        tileSize = {'w': tileSize, 'h': tileSize};
    }
    this.tileSize = tileSize;
    this.height = height;
  }

  // default no‑op, subclasses may override
  toggle() {}

  // basic rectangular hit‑test, accounts for 3‑D height
  isClicked(mapX, mapY) {
    return (
      mapX >= this.x - this.height &&
      mapX < this.x + this.tileSize.w - this.height &&
      mapY >= this.y - this.height &&
      mapY < this.y + this.tileSize.h - this.height
    );
  }

  // simple draw; subclasses can wrap/extend
  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;

    const screenX = Math.floor((this.x - cameraX) * zoomLevel);
    const screenY = Math.floor((this.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((this.x + this.tileSize.w) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((this.y + this.tileSize.h) - cameraY) * zoomLevel);
    const screenW = Math.max(1, nextScreenX - screenX);
    const screenH = Math.max(1, nextScreenY - screenY);
    const screen3D = Math.floor(this.height * zoomLevel);
    ctx.drawImage(
      this.spriteSheet,
      this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
      screenX - screen3D, screenY - screen3D,
      screenW, screenH
    );
  }

  // convenience for moving the object
  setWorldPosition(worldX, worldY) {
    this.x = Math.round(worldX);
    this.y = Math.round(worldY);
  }
}