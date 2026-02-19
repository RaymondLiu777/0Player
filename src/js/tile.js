class Tile {
  /**
   * @param {number} spriteId - numeric id of the tile texture (from data)
   * @param {{x:number,y:number}} location - tile coords (col,row)
   * @param {HTMLImageElement} spriteSheet - image containing tile textures
   * @param {{x,y,w,h}} spriteFrame - single frame on the spritesheet for this tile
   * @param {number} tileSize - size of a tile in pixels
   * @param {string|null} category - 3D category (wall/barrier/ground) or null
   * @param {number} height - 3D height value
   * @param {Wire|null} wire - optional Wire instance attached to this tile
   */
  constructor(spriteId, location, spriteSheet, spriteFrame, tileSize = 64, category = null, height = 0, wire = null) {
    this.spriteId = spriteId;
    this.x = location.x * tileSize; // world pixels
    this.y = location.y * tileSize;
    this.tileSize = tileSize;
    this.spriteSheet = spriteSheet;
    this.spriteFrame = spriteFrame;
    this.category = category;
    this.height = height;
    this.wire = wire;
  }

  // Check if map coordinates fall inside this tile
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

  // Draw the entire tile (base layer + shadow/3D + sprite + wire)
  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;

    const screenX = Math.floor((this.x - cameraX) * zoomLevel);
    const screenY = Math.floor((this.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((this.x + this.tileSize) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((this.y + this.tileSize) - cameraY) * zoomLevel);
    const screenWidth = nextScreenX - screenX;
    const screenHeight = nextScreenY - screenY;
    const screen3D = Math.floor(this.height * zoomLevel);

    // Draw shadow/3D effect
    if (this.category == 'barrier') {
      ctx.filter = "brightness(60%)";
      ctx.drawImage(
        this.spriteSheet,
        this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
        screenX, screenY,
        screenWidth, screenHeight
      );
      ctx.filter = "none";
    } else if (this.category == 'wall') {
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

    // Draw actual tile sprite offset by 3D effect
    ctx.drawImage(
      this.spriteSheet,
      this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
      screenX - screen3D, screenY - screen3D,
      screenWidth, screenHeight
    );

    // Draw attached wire
    if (this.wire) {
      this.wire.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }
  }
}