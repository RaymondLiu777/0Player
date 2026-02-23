class Wire extends Sprite {
  /**
   * @param {number} spriteId
   * @param {{x:number,y:number}} location
   * @param {HTMLImageElement} spriteSheet
   * @param {number} tileSize
   * @param {number} height
   * @param {Array<{x,y,w,h}>} framesList
   * @param {number} currentIndex
   */
  constructor(spriteId, location, spriteSheet, tileSize, height, framesList, currentIndex) {
    const startIndex = Math.max(0, Math.min(currentIndex, framesList.length - 1));
    const initialFrame = framesList[startIndex] || null;
    super(spriteId, spriteSheet, initialFrame, location, tileSize, height);

    this.framesList = framesList;
    this.currentIndex = startIndex;
  }

  toggle() {
    if (!this.framesList.length) return;
    this.currentIndex = (this.currentIndex + 1) % this.framesList.length;
    this.spriteFrame = this.framesList[this.currentIndex];
  }

  setWorldPosition(worldX, worldY) {
    this.x = Math.round(worldX);
    this.y = Math.round(worldY);
  }

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
      const framesList = spriteImageIds.map(id => frames[id]).filter(f => f);
      const idxInSet = spriteImageIds.indexOf(imageId);
      const startIndex = idxInSet >= 0 ? idxInSet : 0;
      const wire = new Wire(instanceId, { x: col * tileSize, y: row * tileSize}, wireImage, tileSize, 0, framesList, startIndex);
      instanceId += 1;
      wires.push(wire);
    }

    return wires;
  }
}