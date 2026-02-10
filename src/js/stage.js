class Stage {
  constructor(tileSize = 64) {
    this.tileSize = tileSize;
    this.background = null;
    this.squares = [];
    this.draggingBlock = null;
    this.dragOffsetX = 0; // in world pixels
    this.dragOffsetY = 0;
  }

  async load(dataPath) {
    const dataResp = await fetch(dataPath);
    const data = await dataResp.json();

    // Helper to load an image
    const loadImage = (src) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });

    // --- Background ---
    const bgImg = await loadImage(`assets/${data.background.spriteSheet}`);
    const bg = new Background(dataPath, this.tileSize);
    bg.load(data, bgImg);
    this.background = bg;

    // --- Blocks / Squares ---
    const blocksImg = await loadImage(`assets/${data.blocks.spriteSheet}`);
    // Provide mapWidth information so Block.fromData can compute proper row/col
    data.blocks.mapWidth = data.size.width;
    const squares = Block.fromData(data.blocks, blocksImg, this.tileSize);
    this.squares = squares;

    // --- Wires ---
    const wireImg = await loadImage(`assets/${data.wires.spriteSheet}`);
    // Provide mapWidth to wire loader as well
    data.wires.mapWidth = data.size.width;
    const wires = Wire.fromData(data.wires, wireImg, this.tileSize);

    // Attach wires to squares when co-located; remaining wires go to background
    const remainingWires = [];
    for (const w of wires) {
      const sq = this.squares.find(s => s.x === w.x && s.y === w.y);
      if (sq) {
        sq.wire = w;
      } else {
        remainingWires.push(w);
      }
    }

    // Give remaining wires to background for drawing
    if (this.background) {
      this.background.setWires(remainingWires);
    }
    console.log(this.squares);
    console.log(remainingWires);
    return this;
  }

  // Check squares first (top-most last), toggle wire if present; otherwise check un-attached wires
  isClicked(mapX, mapY) {
    for (let i = this.squares.length - 1; i >= 0; i--) {
      const s = this.squares[i];
      if (s.isClicked(mapX, mapY)) {
        if (s.toggle()) return s.wire;
        return s;
      }
    }

    // Delegate background wire clicks to Background.isClicked
    if (this.background) {
      const w = this.background.isClicked(mapX, mapY);
      if (w) return w;
    }

    return null;
  }

  // Return top-most square at world map coords (mapX,mapY) or null
  findTopSquareAt(mapX, mapY) {
    for (let i = this.squares.length - 1; i >= 0; i--) {
      const s = this.squares[i];
      if (s.isClicked(mapX, mapY)) return s;
    }
    return null;
  }

  // Begin dragging a square if one exists at map coords.
  // Returns the dragged Block or null.
  startDrag(mapX, mapY) {
    const sq = this.findTopSquareAt(mapX, mapY);
    if (!sq) return null;
    this.draggingBlock = sq;
    this.dragOffsetX = mapX - sq.x;
    this.dragOffsetY = mapY - sq.y;
    return sq;
  }

  // Update the current drag to follow mapX,mapY (map coords are world pixels).
  // snapToGrid boolean controls grid snapping; if true snaps to tileSize multiples.
  updateDrag(mapX, mapY, snapToGrid = true) {
    if (!this.draggingBlock) return;
    const tileSize = this.draggingBlock.tileSize || this.tileSize;
    let targetX = mapX - this.dragOffsetX;
    let targetY = mapY - this.dragOffsetY;

    if (snapToGrid) {
      targetX = Math.round(targetX / tileSize) * tileSize;
      targetY = Math.round(targetY / tileSize) * tileSize;
    } else {
      targetX = Math.round(targetX);
      targetY = Math.round(targetY);
    }

    // Optionally clamp to stage bounds if available
    if (this.background) {
      const mapWidth = this.background.width * tileSize;
      const mapHeight = this.background.height * tileSize;
      targetX = Math.max(0, Math.min(targetX, Math.max(0, mapWidth - tileSize)));
      targetY = Math.max(0, Math.min(targetY, Math.max(0, mapHeight - tileSize)));
    }

    this.draggingBlock.setWorldPosition(targetX, targetY);
  }

  // End any active drag
  endDrag() {
    const b = this.draggingBlock;
    this.draggingBlock = null;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    return b;
  }

  draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel = 1) {
    if (this.background) {
      this.background.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }

    // Draw squares (their draw will also draw their attached wire)
    for (const s of this.squares) {
      s.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }
  }
}