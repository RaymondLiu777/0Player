class Wire extends Sprite {
  /**
   * @param {number} spriteId
   * @param {{x:number,y:number}} location
   * @param {HTMLImageElement} spriteSheet
   * @param {number} tileSize
   * @param {number} height
   * @param {Array<{x,y,w,h}>} framesList
   * @param {number} currentIndex
   * @param {string} name 
   * @param {HTMLImageElement|null} sprite3DSheet
   * @param {Object} frames3D
   */
  constructor(spriteId, location, spriteSheet, tileSize, height,
              framesList, currentIndex, name,
              sprite3DSheet, frames3D, directions3D = {right: true, down: true}) {
    const startIndex = Math.max(0, Math.min(currentIndex, framesList.length - 1));
    const initialFrame = framesList[startIndex] || null;
    super(spriteId, spriteSheet, initialFrame, location, tileSize, height);

    this.framesList = framesList;
    this.currentIndex = startIndex;

    this.name = name;
    this.sprite3DSheet = sprite3DSheet; 
    this.frames3D = frames3D; // { height: { direction: [offFrame, onFrame] } }

    // Calculate directions 3D
    const isCircleAll = this.name === 'circle-all';
    let right = isCircleAll || this.name.includes('right') || this.name.includes('horizontal');
    let down = isCircleAll || this.name.includes('down') || this.name.includes('vertical');
    if(this.name == "cross-over") {
      right = true;
      down = true;
    }
    // Override right/down if directions3D is false
    if(directions3D.right === false) {
      right = false
    }
    if(directions3D.down === false) {
      down = false
    }
    this.directions3D = {
      "right": right,
      "down": down
    }
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

  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;

    const screenX = Math.floor((this.x - cameraX) * zoomLevel);
    const screenY = Math.floor((this.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((this.x + this.tileSize.w + this.height) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((this.y + this.tileSize.h + this.height) - cameraY) * zoomLevel);
    const screenW = Math.max(1, nextScreenX - screenX);
    const screenH = Math.max(1, nextScreenY - screenY);
    const screen3D = Math.floor(this.height * zoomLevel);

    // -------------- 3‑D shadow rendering --------------
    if (this.height > 0 && this.sprite3DSheet && this.frames3D) {
      const hmap = this.frames3D[this.height];
      if (hmap) {
        // Check name for directions
        let rightOn = this.currentIndex;
        let downOn = this.currentIndex;
        if(this.name == "cross-over") {
          rightOn = Math.floor(rightOn / 2);
          downOn = downOn % 2;
        }
        if (this.directions3D.right) {
          const dirFrames = hmap['right'];
          const f = dirFrames[rightOn];
          ctx.drawImage(
            this.sprite3DSheet,
            f.x, f.y, f.w, f.h,
            screenX - screen3D, screenY - screen3D,
            screenW, screenH
          );
        }

        if (this.directions3D.down) {
          const dirFrames = hmap['down'];
          const f = dirFrames[downOn];
          ctx.drawImage(
            this.sprite3DSheet,
            f.x, f.y, f.w, f.h,
            screenX - screen3D, screenY - screen3D,
            screenW, screenH
          );
        }
      }
    }

    super.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
  }

  static fromData(wiresData, wireImage, wire3dImage, tileSize = 64) {
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

    // --- build 3D frame lookup ---
    // result: { [height]: { [direction]: [offFrame, onFrame] } }
    const frames3D = {};
    for (const entry of wiresData['3dframes'] || []) {
      const { height, direction, status, frame } = entry;
      const hmap = frames3D[height] || (frames3D[height] = {});
      const dmap = hmap[direction] || (hmap[direction] = []);
      if (status === 'off') {
        dmap[0] = frame;
      } else if (status === 'on') {
        dmap[1] = frame;
      }
    }
    // ------------------------------------------------

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
      const wire = new Wire(
        instanceId,
        { x: col * tileSize, y: row * tileSize},
        wireImage,
        tileSize,
        0,
        framesList,
        startIndex,
        spriteName,        // new data member
        wire3dImage,       // 3d sprite sheet
        frames3D           // lookup built above
      );
      instanceId += 1;
      wires.push(wire);
    }

    return wires;
  }
}