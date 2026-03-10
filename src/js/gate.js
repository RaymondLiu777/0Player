class Gate extends Tile {
  /**
   * @param {number} spriteId
   * @param {HTMLImageElement} spriteSheet
   * @param {{x,y,w,h}} spriteFrame
   * @param {{x:number,y:number}} location
   * @param {number|{w,h}} tileSize   // normal 64×64 world tile
   * @param {number} height
   * @param {Wire|null} wire
   * @param {GateArm[]} gateArms
   * @param {string|null} direction  // “nw”/“ne”/“sw”/“se”
   * @param {{col:number,row:number}} startPosition
   */
  constructor(spriteId, spriteSheet, spriteFrame, location, tileSize, height,
              wire = null, gateArms = [], direction = null, startPosition = null) {
    super(spriteId, location, spriteSheet, null, spriteFrame,
          tileSize, height, 'gate', wire);

    this.gateArms = gateArms;
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
        "g" + instanceId,
        gateImage,
        spec,
        { x: col * tileSize, y: row * tileSize },
        { w: spec.w, h: spec.h },
        gatesData.height,
        null,
        [],
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
      const gatearms = [];

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
        const frame = gateSprites.vertical.up;
        // offset the thin arm so it sits between cells
        const offsetX = horizDir === -1 ? 2 : tileSize - 2;
        for ( const position of positions) {
          const originX = position.col * tileSize + offsetX;
          const originY = position.row * tileSize;
          const fullSize = { w: frame.w,
                           h: tileSize};
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
            vUp,
            gate
          );
          gatearms.push(arm);
          arms.push(arm);
          instanceId += 1;
        }
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
        const frame = gateSprites.horizontal.up;
        // offset the thin arm so it sits between cells
        const offsetY = vertDir === -1 ? 0 : tileSize - 2;

        for (const position of positions) {
          const originX = position.col * tileSize;
          const originY = position.row * tileSize + offsetY; 
          const fullSize = { w: tileSize,
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
            hUp,
            gate
          );
          gatearms.push(arm);
          arms.push(arm);
          instanceId += 1;
        }
      }

      if (gatearms.length) {
        gate.gateArms = gatearms;
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
   * @param {Gate} gateblock
   */
  constructor(spriteId, spriteSheet, upFrame, downFrame, location,
              tileSize, height, gridSize, orientation = null, length = 1,
              toggledUp = false, gateblock = null) {
    super(spriteId, spriteSheet,
          toggledUp ? upFrame : downFrame,
          location, tileSize, height);
    this.gridSize = gridSize;
    this.upFrame = upFrame;
    this.downFrame = downFrame;
    this.orientation = orientation;
    this.length = length;
    this.toggledUp = toggledUp;
    this.gateblock = gateblock;
  }

  toggle() {
    const direction = !this.toggledUp;
    for (const arm of this.gateblock.gateArms) {
      arm.toggledUp = direction;
      arm.spriteFrame = direction ? arm.upFrame : arm.downFrame;
    }
  }

  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel = 1) {
    if (!this.spriteSheet || !this.spriteSheet.complete || !this.spriteFrame) return;
    const frameW = this.upFrame.w;
    const frameH = this.upFrame.h;
    const height3D = Math.floor(this.height * zoomLevel);
    const sx = this.x;
    const sy = this.y;
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