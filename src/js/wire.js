class Wire {
  /**
   * @param {number} spriteId - unique id for this wire instance (or id you want)
   * @param {string} spriteName - name/key of the wire sprite set
   * @param {{x:number,y:number}} location - tile coords (col,row)
   * @param {HTMLImageElement} spriteSheet - spritesheet image
   * @param {Array<number>} spriteImageIds - array of frame ids used by this wire name
   * @param {number} currentImageIndex - index into spriteImageIds
   * @param {Object} spriteFrames - mapping id->{x,y,w,h}
   * @param {number} tileSize - tile size in pixels
   */
  constructor(spriteId, spriteName, location, spriteSheet, spriteImageIds = [], currentImageIndex = 0, spriteFrames = {}, tileSize = 64) {
    this.spriteId = spriteId;
    this.spriteName = spriteName;
    this.spriteSheet = spriteSheet;
    this.spriteImageIds = spriteImageIds;
    this.currentImageIndex = Math.max(0, Math.min(currentImageIndex, this.spriteImageIds.length - 1));
    this.spriteFrames = spriteFrames;
    this.tileSize = tileSize;
    this.x = location.x * this.tileSize;
    this.y = location.y * this.tileSize;
  }

  // Cycle to the next image in spriteImageIds
  toggle() {
    if (!this.spriteImageIds.length) return;
    this.currentImageIndex = (this.currentImageIndex + 1) % this.spriteImageIds.length;
  }

  // Set wire world position (in pixels)
  setWorldPosition(worldX, worldY) {
    this.x = Math.round(worldX);
    this.y = Math.round(worldY);
  }

  // Returns true if the given map pixel coordinates (mapX, mapY) fall inside this wire's tile hitbox
  isClicked(mapX, mapY) {
    const worldX = this.x;
    const worldY = this.y;
    return (
      mapX >= worldX &&
      mapX < worldX + this.tileSize &&
      mapY >= worldY &&
      mapY < worldY + this.tileSize
    );
  }

  /**
   * Draw the wire to the screen.
   * ctx: CanvasRenderingContext2D
   * cameraX/cameraY: world pixel camera position
   * canvasWidth/canvasHeight: size of canvas in pixels
   * zoomLevel: scale factor (1 = 1:1)
   */
  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel = 1) {
    if (!this.spriteSheet || !this.spriteSheet.complete) return;
    if (!this.spriteImageIds.length) return;

    const frameId = this.spriteImageIds[this.currentImageIndex];
    const frame = this.spriteFrames[frameId];
    if (!frame) return;

    const worldX = this.x;
    const worldY = this.y;

    // Cull if outside view (use world coords + view size adjusted by zoom)
    const viewWidth = canvasWidth / zoomLevel;
    const viewHeight = canvasHeight / zoomLevel;
    if (worldX + this.tileSize < cameraX || worldX > cameraX + viewWidth ||
        worldY + this.tileSize < cameraY || worldY > cameraY + viewHeight) {
      return;
    }

    const screenX = Math.floor((worldX - cameraX) * zoomLevel);
    const screenY = Math.floor((worldY - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((worldX + this.tileSize) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((worldY + this.tileSize) - cameraY) * zoomLevel);
    const screenW = Math.max(1, nextScreenX - screenX);
    const screenH = Math.max(1, nextScreenY - screenY);

    ctx.drawImage(
      this.spriteSheet,
      frame.x, frame.y, frame.w, frame.h,
      screenX, screenY,
      screenW, screenH
    );
  }

  // Static helper: create Wire instances from wires section of data.json
  static fromData(wiresData, wireImage, tileSize = 64) {
    const cols = wiresData.spriteSheetSize.columns;
    const rows = wiresData.spriteSheetSize.rows;
    const total = wiresData.spriteSheetSize.count;
    const frames = {};
    for (let id = 1; id <= total; id++) {
      const idx = id - 1;
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      frames[id] = { x: col * tileSize, y: row * tileSize, w: tileSize, h: tileSize };
    }

    // build id -> name mapping (ids listed inside arrays)
    const idToName = {};
    for (const [name, ids] of Object.entries(wiresData.spriteIds || {})) {
      (ids || []).forEach(id => idToName[id] = name);
    }

    const map = wiresData.spriteMap || [];
    const mapWidth = wiresData.mapWidth;
    const wires = [];
    const offset = wiresData.spriteOffset;
    let instanceId = 1;
    for (let i = 0; i < map.length; i++) {
      let imageId = map[i];
      if (!imageId) continue;
      imageId -= offset;
      const row = Math.floor(i / mapWidth);
      const col = i % mapWidth;
      const spriteName = idToName[imageId];
      if (!spriteName) continue;
      const spriteImageIds = wiresData.spriteIds[spriteName] || [];
      const idxInSet = spriteImageIds.indexOf(imageId);
      const startIndex = idxInSet >= 0 ? idxInSet : 0;
      const wire = new Wire(instanceId, spriteName, { x: col, y: row }, wireImage, spriteImageIds, startIndex, frames, tileSize);
      instanceId += 1;
      wires.push(wire);
    }

    return wires;
  }
}