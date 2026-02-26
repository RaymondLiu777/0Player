class Tile extends Sprite {
  /**
   * @param {number} spriteId
   * @param {{x:number,y:number}} location (in the grid, not actual x and y)
   * @param {HTMLImageElement} spriteSheet
   * @param {{x,y,w,h}} spriteFrame
   * @param {number} tileSize
   * @param {number} height
   * @param {string|null} category
   * @param {Wire|null} wire
   */
  constructor(spriteId, location, spriteSheet, spriteFrame, tileSize, height, category, wire) {
    super(spriteId, spriteSheet, spriteFrame, location, tileSize, height);
    this.category = category;
    this.wire = wire;
    // whether there is another wall immediately to the right/bottom
    this.hide3D = { right: false, bottom: false };
  }

  toggle() {
    if (this.wire) {
      this.wire.toggle();
      return true;
    }
    return false;
  }

  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;

    const screenX = Math.floor((this.x - cameraX) * zoomLevel);
    const screenY = Math.floor((this.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((this.x + this.tileSize.w) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((this.y + this.tileSize.h) - cameraY) * zoomLevel);
    const screenWidth = nextScreenX - screenX;
    const screenHeight = nextScreenY - screenY;
    const screen3D = Math.floor(this.height * zoomLevel);

    if (this.category === 'barrier') {
      ctx.filter = "brightness(60%)";
      ctx.drawImage(
        this.spriteSheet,
        this.spriteFrame.x, this.spriteFrame.y, this.spriteFrame.w, this.spriteFrame.h,
        screenX, screenY,
        screenWidth, screenHeight
      );
      ctx.filter = "none";
    } else if (this.category === 'wall') {
      // only draw a side if there isn't another wall adjacent
      if (!this.hide3D.right) {
        // Right side
        const gradright = ctx.createLinearGradient(screenX + screenWidth - screen3D, screenY, screenX + screenWidth, screenY);
        gradright.addColorStop(0, "rgba(47, 47, 47)");
        gradright.addColorStop(1, "rgba(20,20,20)");
        ctx.fillStyle = gradright;
        ctx.beginPath();
        ctx.moveTo(screenX + screenWidth - screen3D, screenY - screen3D);
        ctx.lineTo(screenX + screenWidth, screenY);
        ctx.lineTo(screenX + screenWidth, screenY + screenHeight);
        ctx.lineTo(screenX + screenWidth - screen3D, screenY + screenHeight - screen3D);
        ctx.closePath();
        ctx.fill();
      }
      if (!this.hide3D.bottom) {
        // Bottom side
        const grad = ctx.createLinearGradient(screenX, screenY + screenHeight - screen3D, screenX, screenY + screenHeight);
        grad.addColorStop(0, "rgba(47, 47, 47)");
        grad.addColorStop(1, "rgba(20,20,20)");
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

    super.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);

    if (this.wire) {
      this.wire.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }
  }
}