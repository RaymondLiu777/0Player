class Gate extends Sprite {
  /**
   * @param {number} spriteId
   * @param {HTMLImageElement} spriteSheet
   * @param {{x,y,w,h}} spriteFrame
   * @param {{x:number,y:number}} location
   * @param {number|{w,h}} tileSize   // normal 64×64 world tile
   * @param {number} height
   * @param {Wire|null} wire
   * @param {GateArm|null} gateArm
   * @param {string|null} direction  // “nw”/“ne”/“sw”/“se”
   * @param {{col:number,row:number}} startPosition
   */
  constructor(spriteId, spriteSheet, spriteFrame, location, tileSize, height,
              wire = null, gateArm = null, direction = null, startPosition = null) {
    super(spriteId, spriteSheet, spriteFrame, location, tileSize, height);
    this.wire = wire;
    this.gateArm = gateArm;
    this.direction = direction;
    this.startPosition = startPosition;
  }

  toggle() {
    if (this.wire) {
      this.wire.toggle();
      return true;
    }
    return false;
  }

  // click test ignores the 3‑D portion which is baked into the sprite
  isClicked(mapX, mapY) {
    return (
      mapX >= this.x - this.height &&
      mapX < this.x + this.tileSize.w - 2 * this.height &&
      mapY >= this.y - this.height &&
      mapY < this.y + this.tileSize.h - 2 * this.height
    );
  }

  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel) {
    super.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    if (this.wire) {
      this.wire.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }
  }

  static fromData(gatesData, gateImage, tileSize) {
    const blockSpecs = Object.values(gatesData.blocksprites || {});
    const blockCount = blockSpecs.length;

    const map = gatesData.spriteMap || [];
    const width = gatesData.mapWidth;
    const height = gatesData.mapHeight;
    const offset = gatesData.spriteOffset;

    const gates = [];
    const arms = [];
    const visited = new Set();
    let instanceId = 1;

    // --- gate blocks ---
    for (let i = 0; i < map.length; i++) {
      let id = map[i];
      if (!id) continue;
      id -= offset;
      if (id <= 0 || id > blockCount) continue;

      const row = Math.floor(i / width);
      const col = i % width;
      const spec = blockSpecs[id - 1];

      const gate = new Gate(
        instanceId,
        gateImage,
        spec,
        { x: col * tileSize, y: row * tileSize },
        { w: spec.w, h: spec.h },
        gatesData.height,
        null,
        null,
        spec.direction,
        { col, row }
      );
      gates.push(gate);
      instanceId += 1;
    }

    const gateSprites = gatesData.gatesprites || {};

    // --- arms: scan outward from each block along its two directions ---
    for (const gate of gates) {
      const { col, row } = gate.startPosition;
      const vertDir = gate.direction.includes('n') ? -1 : 1;
      const horizDir = gate.direction.includes('w') ? 1 : -1;

      // vertical arm
      let positions = [];
      let r = row + vertDir;
      let vUp = false;
      while (r >= 0 && r < height) {
        const idx = r * width + col;
        if (visited.has(idx)) break;
        let id = map[idx];
        if (!id) break;
        id -= offset;
        if (id <= blockCount) break;
        if ((id - blockCount) % 2 === 1) {
          vUp = true;
        }
        visited.add(idx);
        positions.push({ col, row: r });
        r += vertDir;
      }
      if (positions.length) {
        const frame = (gateSprites.vertical || {}).up;
        // offset the thin arm so it sits between cells
        const offsetX = horizDir === -1 ? 0 : tileSize - 2;
        // use the smallest row value
        const minRow = Math.min(...positions.map(p => p.row));
        const originX = positions[0].col * tileSize + offsetX;
        const originY = minRow * tileSize;

        const fullSize = { w: frame.w,
                           h: tileSize * positions.length};
        const arm = new GateArm(
          instanceId,
          gateImage,
          gateSprites.vertical.up,
          gateSprites.vertical.down,
          { x: originX, y: originY },
          fullSize,
          gatesData.height,
          tileSize,
          'vertical',
          positions.length,
          vUp
        );
        arms.push(arm);
        instanceId += 1;
      }

      // horizontal arm
      positions = [];
      let c = col + horizDir;
      let hUp = false;
      while (c >= 0 && c < width) {
        const idx = row * width + c;
        if (visited.has(idx)) break;
        let id = map[idx];
        if (!id) break;
        id -= offset;
        if (id <= blockCount) break;
        if ((id - blockCount) % 2 === 1) {
          hUp = true;
        }
        visited.add(idx);
        positions.push({ col: c, row });
        c += horizDir;
      }
      if (positions.length) {
        const frame = (gateSprites.horizontal || {}).up;
        // offset the thin arm so it sits between cells
        const offsetY = vertDir === -1 ? 0 : tileSize - 2;
        // take the smallest column value
        const minCol = Math.min(...positions.map(p => p.col));
        const originX = minCol * tileSize;
        const originY = positions[0].row * tileSize + offsetY; 

        const fullSize = { w: tileSize * positions.length,
                           h: frame.h };
        const arm = new GateArm(
          instanceId,
          gateImage,
          gateSprites.horizontal.up,
          gateSprites.horizontal.down,
          { x: originX, y: originY },
          fullSize,
          gatesData.height,
          tileSize,
          'horizontal',
          positions.length,
          hUp
        );
        arms.push(arm);
        instanceId += 1;
      }
    }

    return { gates, arms };
  }
}

class GateArm extends Sprite {
  /**
   * @param {number} spriteId
   * @param {HTMLImageElement} spriteSheet
   * @param {{x,y,w,h}} upFrame
   * @param {{x,y,w,h}} downFrame
   * @param {{x:number,y:number}} location   // top‑left of the entire arm
   * @param {{w:number,h:number}} tileSize   // full width/height (length‑scaled)
   * @param {number} height
   * @param {number} gridSize   // square size of grid
   * @param {string|null} orientation  'horizontal'|'vertical'
   * @param {number} length           // number of segments
   * @param {boolean} toggledUp
   */
  constructor(spriteId, spriteSheet, upFrame, downFrame, location,
              tileSize, height, gridSize, orientation = null, length = 1,
              toggledUp = false) {
    super(spriteId, spriteSheet,
          toggledUp ? upFrame : downFrame,
          location, tileSize, height);
    this.gridSize = gridSize;
    this.upFrame = upFrame;
    this.downFrame = downFrame;
    this.orientation = orientation;
    this.length = length;
    this.toggledUp = toggledUp;
  }

  toggle() {
    this.toggledUp = !this.toggledUp;
    this.spriteFrame = this.toggledUp ? this.upFrame : this.downFrame;
    console.log(this);
  }

  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel = 1) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;
    const frameW = this.upFrame.w;
    const frameH = this.upFrame.h;
    const height3D = Math.floor(this.height * zoomLevel);

    for (let i = 0; i < this.length; i++) {
      let sx = this.x;
      let sy = this.y;
      if (this.orientation === 'vertical') {
        sy += i * this.gridSize;
      } else if (this.orientation === 'horizontal') {
        sx += i * this.gridSize;
      }
      const screenX = Math.floor((sx - cameraX) * zoomLevel);
      const screenY = Math.floor((sy - cameraY) * zoomLevel);
      ctx.drawImage(
        this.spriteSheet,
        this.spriteFrame.x, this.spriteFrame.y,
        this.spriteFrame.w, this.spriteFrame.h,
        screenX - height3D, screenY - height3D,
        Math.floor(frameW * zoomLevel),
        Math.floor(frameH * zoomLevel)
      );
    }
  }
}