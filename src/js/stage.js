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

    // Attach wires to squares when co-located; remaining wires go to background tiles
    for (const w of wires) {
      const sq = this.squares.find(s => s.x === w.x && s.y === w.y);
      if (sq) {
        // Attach to block
        sq.wire = w;
        w.height = sq.height;
      } else {
        // Attach to background tile (check main tiles first, then ground tiles)
        const col = Math.floor(w.x / this.tileSize);
        const row = Math.floor(w.y / this.tileSize);
        
        let tile = null;
        // Check main tiles first
        if (row >= 0 && row < this.background.tiles.length && col >= 0 && col < this.background.tiles[row].length) {
          tile = this.background.tiles[row][col];
        }
        // Fall back to ground tiles if main tile is empty/transparent
        if (!tile || tile.spriteId === 0) {
          if (row >= 0 && row < this.background.groundTiles.length && col >= 0 && col < this.background.groundTiles[row].length) {
            tile = this.background.groundTiles[row][col];
          }
        }
        
        if (tile) {
          tile.wire = w;
          w.height = tile.height;
        }
      }
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
    // Collect all drawable objects (tiles and blocks)
    const groundLayer = [];
    const drawables = [];

    // Collect visible background tiles (height = 0 ground tiles)
    if (this.background) {
      const visibleTiles = this.background.getVisibleTiles(cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      
      // Separate ground tiles from main tiles
      for (const tile of visibleTiles) {
        if (tile.height === 0) {
          groundLayer.push({ type: 'tile', obj: tile, x: tile.x, y: tile.y });
        }
      }
      
      // Add main tiles and separate blocks for collision checking
      for (const tile of visibleTiles) {
        if (tile.height > 0) {
          drawables.push({ type: 'tile', obj: tile, x: tile.x, y: tile.y });
        }
      }
    }

    // Collect visible blocks (with culling)
    const viewWidth = canvasWidth / zoomLevel;
    const viewHeight = canvasHeight / zoomLevel;
    for (const block of this.squares) {
      if (block.x + block.tileSize < cameraX || block.x > cameraX + viewWidth ||
          block.y + block.tileSize < cameraY || block.y > cameraY + viewHeight) {
        continue; // Cull off-screen blocks
      }
      drawables.push({ type: 'block', obj: block, x: block.x, y: block.y });
    }

    // Sort by x + y (isometric-like ordering: top-left to bottom-right)
    groundLayer.sort((a, b) => (a.x + a.y) - (b.x + b.y));
    drawables.sort((a, b) => (a.x + a.y) - (b.x + b.y));

    // Draw ground layer
    for (const item of groundLayer) {
      item.obj.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }

    // Draw all objects in sorted order, handling tile-block collisions
    const drawnTiles = new Set();
    for (const item of drawables) {
      if (item.type === 'tile') {
        if (drawnTiles.has(item.obj)) {
          continue;
        }
        drawnTiles.add(item.obj);
        item.obj.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      } else if (item.type === 'block') {
        // Check if this block collides with any undrawn tiles
        const blockBounds = {
          x1: item.obj.x,
          y1: item.obj.y,
          x2: item.obj.x + item.obj.tileSize,
          y2: item.obj.y + item.obj.tileSize
        };

        // Draw any colliding tiles that haven't been drawn yet
        if (this.background) {
          const startCol = Math.floor(blockBounds.x1 / this.tileSize);
          const endCol = Math.ceil(blockBounds.x2 / this.tileSize);
          const startRow = Math.floor(blockBounds.y1 / this.tileSize);
          const endRow = Math.ceil(blockBounds.y2 / this.tileSize);

          for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
              // Check main tiles
              if (row >= 0 && row < this.background.tiles.length && col >= 0 && col < this.background.tiles[row].length) {
                const tile = this.background.tiles[row][col];
                if (tile && !drawnTiles.has(tile)) {
                  drawnTiles.add(tile);
                  tile.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
                }
              }
            }
          }
        }

        // Draw the block
        item.obj.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      }
    }
  }
}