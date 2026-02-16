class Stage {
  constructor(tileSize = 64) {
    this.tileSize = tileSize;
    this.background = null;
    this.squares = [];
    this.blockById = {}; // map id -> Block
    this.groups = new BlockGroups();

    this.draggingBlock = null;
    this.draggingGroup = false;
    this.dragOffsetX = 0; // in world pixels
    this.dragOffsetY = 0;
    this.originalPositions = null; // used when dragging group
    this.groupMainOriginal = null; // original main block pos when group drag started

    // grouping state
    this.isGrouping = false;
    this.hoverGroupId = null;
    this.hoverSingleId = null;

    // snap threshold (pixels) for lenient snapping — adjustable
    this.snapThreshold = 12;
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
    const bg = new Background(this.tileSize);
    data.background.mapHeight = data.size.height;
    data.background.mapWidth = data.size.width;
    bg.load(data.background, bgImg);
    this.background = bg;

    // --- Blocks / Squares ---
    const blocksImg = await loadImage(`assets/${data.blocks.spriteSheet}`);
    // Provide mapWidth information so Block.fromData can compute proper row/col
    data.background.mapHeight = data.size.height;
    data.blocks.mapWidth = data.size.width;
    const squares = Block.fromData(data.blocks, blocksImg, this.tileSize);
    this.squares = squares;
    this.blockById = {};
    for (const b of this.squares) this.blockById[b.spriteId] = b;

    // --- Wires ---
    const wireImg = await loadImage(`assets/${data.wires.spriteSheet}`);
    // Provide mapWidth to wire loader as well
    data.background.mapHeight = data.size.height;
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

  // Grouping mode controls
  startGroupingMode() {
    if (this.isGrouping) return;
    this.isGrouping = true;
    this.groups.clearTemp();
    // cancel any active drag
    if (this.draggingBlock) this.endDrag();
    this.hoverGroupId = null;
    this.hoverSingleId = null;
    this.recomputeHighlights();
  }

  addBlockToTempAt(mapX, mapY) {
    const sq = this.findTopSquareAt(mapX, mapY);
    if (!sq) return null;
    this.groups.addTemp(sq.spriteId);
    this.recomputeHighlights();
    return sq;
  }

  finalizeGrouping() {
    if (!this.isGrouping) return null;
    const gid = this.groups.finalizeTemp();
    this.isGrouping = false;
    this.recomputeHighlights();
    return gid;
  }

  hoverAt(mapX, mapY) {
    const sq = this.findTopSquareAt(mapX, mapY);
    if (!sq) {
      this.hoverGroupId = null;
      this.hoverSingleId = null;
      this.recomputeHighlights();
      return;
    }
    const gid = this.groups.getGroupFor(sq.spriteId);
    if (gid) {
      this.hoverGroupId = gid;
      this.hoverSingleId = null;
    } else {
      this.hoverGroupId = null;
      this.hoverSingleId = sq.spriteId;
    }
    this.recomputeHighlights();
  }

  recomputeHighlights() {
    const tempSet = this.groups.tempSelection;
    for (const b of this.squares) {
      const inTemp = tempSet.has(b.spriteId);
      const inHoverGroup = this.hoverGroupId && this.groups.getGroupFor(b.spriteId) === this.hoverGroupId;
      const isHoverSingle = this.hoverSingleId && this.hoverSingleId === b.spriteId;
      b.setHighlighted(inTemp || inHoverGroup || isHoverSingle);
    }
  }

  // Begin dragging a square if one exists at map coords.
  // Returns the dragged Block or null.
  startDrag(mapX, mapY) {
    if (this.isGrouping) return null; // dragging not supported while grouping
    const sq = this.findTopSquareAt(mapX, mapY);
    if (!sq) return null;
    this.draggingBlock = sq;
    this.dragOffsetX = mapX - sq.x;
    this.dragOffsetY = mapY - sq.y;

    // Check group membership
    const gid = this.groups.getGroupFor(sq.spriteId);
    if (gid && this.groups.getBlocksInGroup(gid).length > 1) {
      // start group drag
      this.draggingGroup = true;
      // store original positions for all members
      this.originalPositions = {};
      for (const bid of this.groups.getBlocksInGroup(gid)) {
        const b = this.blockById[bid];
        if (b) this.originalPositions[bid] = { x: b.x, y: b.y };
      }
      this.groupMainOriginal = { x: sq.x, y: sq.y };
    } else {
      this.draggingGroup = false;
      this.originalPositions = null;
      this.groupMainOriginal = null;
    }

    return sq;
  }

  // Update the current drag to follow mapX,mapY (map coords are world pixels).
  // snapToGrid boolean controls grid snapping; lenient snapping uses this.snapThreshold.
  updateDrag(mapX, mapY, snapToGrid = true) {
    if (!this.draggingBlock) return;
    const tileSize = this.draggingBlock.tileSize || this.tileSize;

    const applyLenientSnap = (rawX, rawY) => {
      // nearest tile-aligned positions
      const nearestX = Math.round(rawX / tileSize) * tileSize;
      const nearestY = Math.round(rawY / tileSize) * tileSize;
      const dx = Math.abs(rawX - nearestX);
      const dy = Math.abs(rawY - nearestY);

      // Snap to nearest x or y if within threshold
      let desX = Math.round(rawX);
      let desY = Math.round(rawY);
      if (dx <= this.snapThreshold ) {
        desX = nearestX;
      }
      if (dy <= this.snapThreshold) {
        desY = nearestY
      }
      return {x: desX, y: desY};
    };

    if (this.draggingGroup && this.originalPositions && this.groupMainOriginal) {
      // compute target main block pos
      let rawTargetMainX = mapX - this.dragOffsetX;
      let rawTargetMainY = mapY - this.dragOffsetY;

      let targetMainX, targetMainY;
      if (snapToGrid) {
        ({ x: targetMainX, y: targetMainY } = applyLenientSnap(rawTargetMainX, rawTargetMainY));
      } else {
        targetMainX = Math.round(rawTargetMainX);
        targetMainY = Math.round(rawTargetMainY);
      }

      const deltaX = targetMainX - this.groupMainOriginal.x;
      const deltaY = targetMainY - this.groupMainOriginal.y;

      // apply delta to all members
      const gid = this.groups.getGroupFor(this.draggingBlock.spriteId);
      if (!gid) return;
      for (const bid of this.groups.getBlocksInGroup(gid)) {
        const b = this.blockById[bid];
        const orig = this.originalPositions[bid];
        if (!b || !orig) continue;
        b.setWorldPosition(orig.x + deltaX, orig.y + deltaY);
      }
      return;
    }

    // Single-block drag
    let rawTargetX = mapX - this.dragOffsetX;
    let rawTargetY = mapY - this.dragOffsetY;

    let targetX, targetY;
    if (snapToGrid) {
      ({ x: targetX, y: targetY } = applyLenientSnap(rawTargetX, rawTargetY));
    } else {
      targetX = Math.round(rawTargetX);
      targetY = Math.round(rawTargetY);
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
    this.draggingGroup = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.originalPositions = null;
    this.groupMainOriginal = null;
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