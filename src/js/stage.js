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

    // gate state
    this.gates = [];
    this.gateArms = [];

    // snap threshold for snapping horizontals/veritically
    this.snapThreshold = 0;
    this.snapToGrid = true;
  }

  async load(dataPath) {
    const dataResp = await fetch(dataPath);
    const data = await dataResp.json();

    // helper: if section.spriteMap is a string, fetch & JSON‑parse it
    const resolveSpriteMap = async (section) => {
      if (!section) return;
      if( typeof section.spriteMap === 'string') {
        const resp = await fetch(section.spriteMap);
        section.spriteMap = await resp.json();
      }
      if (typeof section.backgroundMap === 'string') {
        const resp = await fetch(section.backgroundMap);
        section.backgroundMap = await resp.json();
      }
    };

    // make sure each subsystem has its map array before we hand it off
    await resolveSpriteMap(data.background);
    await resolveSpriteMap(data.blocks);
    await resolveSpriteMap(data.gates);
    await resolveSpriteMap(data.wires);

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
    const darkBlocksImg = await loadImage(`assets/${data.blocks.darkblock.spriteSheet}`);
    data.background.mapHeight = data.size.height;
    data.blocks.mapWidth = data.size.width;
    const squares = Block.fromData(data.blocks, blocksImg, darkBlocksImg, this.tileSize);
    this.squares = squares;
    this.blockById = {};
    for (const b of this.squares) this.blockById[b.spriteId] = b;

    // --- Gates ---
    const gatesImg = await loadImage(`assets/${data.gates.spriteSheet}`);
    data.gates.mapWidth = data.size.width;
    data.gates.mapHeight = data.size.height;
    const { gates, arms } = Gate.fromData(data.gates, gatesImg, this.tileSize);
    this.gates = gates;
    this.gateArms = arms;

    // --- Wires ---
    const wireImg = await loadImage(`assets/${data.wires.spriteSheet}`);
    const wire3dImage = await loadImage(`assets/${data.wires['3dSpriteSheet']}`);
    data.background.mapHeight = data.size.height;
    data.wires.mapWidth = data.size.width;
    const wires = Wire.fromData(data.wires, wireImg, wire3dImage, this.tileSize);

    // Attach wires to squares when co-located; remaining wires go to background tiles
    for (const w of wires) {
      // attach any wires that landed on gates
      const g = this.gates.find(g => g.x === w.x && g.y === w.y);
      if (g) {
        g.wire = w;
        w.height = g.height;
        continue;
      }
      // attach wires that landed on square
      const sq = this.squares.find(s => s.x === w.x && s.y === w.y);
      if (sq) {
        // Attach to block
        sq.wire = w;
        w.height = sq.height;
        continue;
      } 
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

    return this;
  }

  // Check gates first, then gates, then background for toggles
  isClicked(mapX, mapY) {
    // gate‑arms take top priority
    for (const arm of this.gateArms) {
      if (arm.isClicked(mapX, mapY)) {
        arm.toggle();
        return arm;
      }
    }

    // then gate blocks
    for (const g of this.gates) {
      if (g.isClicked(mapX, mapY)) {
        if (g.toggle()) return g.wire;
        return g;
      }
    }

    // previous logic for squares and background
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
  updateDrag(mapX, mapY) {
    if (!this.draggingBlock) return;

    const applyLenientSnap = (rawX, rawY) => {
      // nearest tile-aligned positions
      const nearestX = Math.round(rawX / this.tileSize) * this.tileSize;
      const nearestY = Math.round(rawY / this.tileSize) * this.tileSize;
      const dx = Math.abs(rawX - nearestX);
      const dy = Math.abs(rawY - nearestY);

      // Snap to nearest x or y if within threshold
      let desX = Math.round(rawX);
      let desY = Math.round(rawY);
      if (dx <= this.snapThreshold) {
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
      if (this.snapToGrid) {
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
    if (this.snapToGrid) {
      ({ x: targetX, y: targetY } = applyLenientSnap(rawTargetX, rawTargetY));
    } else {
      targetX = Math.round(rawTargetX);
      targetY = Math.round(rawTargetY);
    }

    this.draggingBlock.setWorldPosition(targetX, targetY);
  }

  // End any active drag (snape to nearest square if enabled)
  endDrag() {
    const b = this.draggingBlock;

    if (b && this.snapToGrid) {
      const snapBlock = (blk) => {
        const x = Math.round(blk.x / this.tileSize) * this.tileSize;
        const y = Math.round(blk.y / this.tileSize) * this.tileSize;
        blk.setWorldPosition(x, y);
      };

      if (this.draggingGroup) {
        const gid = this.groups.getGroupFor(b.spriteId);
        if (gid) {
          for (const bid of this.groups.getBlocksInGroup(gid)) {
            const blk = this.blockById[bid];
            if (blk) snapBlock(blk);
          }
        }
      } else {
        snapBlock(b);
      }
    }

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
    const highlightedBlocks = [];

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
      if (block.x + block.tileSize.w < cameraX || block.x > cameraX + viewWidth ||
          block.y + block.tileSize.h < cameraY || block.y > cameraY + viewHeight) {
        continue; // Cull off-screen blocks
      }
      drawables.push({ type: 'block', obj: block, x: block.x, y: block.y });
      if (block.highlighted) {
        highlightedBlocks.push(block);
      }
    }

    // gates behave like blocks for z‑ordering
    for (const gate of this.gates) {
      if (gate.x + gate.tileSize.w < cameraX || gate.x > cameraX + viewWidth ||
          gate.y + gate.tileSize.h < cameraY || gate.y > cameraY + viewHeight) {
        continue;
      }
      drawables.push({ type: 'gate', obj: gate, x: gate.x, y: gate.y });
    }

    // arms can be drawn anywhere; we don’t bother to cull them here
    for (const arm of this.gateArms) {
      drawables.push({ type: 'arm', obj: arm, x: arm.x, y: arm.y});
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
      if (item.type === 'tile' || item.type === 'gate' ) {
        if (drawnTiles.has(item.obj)) {
          continue;
        }
        drawnTiles.add(item.obj);
        item.obj.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      } else if (item.type === 'block' || item.type === 'arm') {
        const obj = item.obj;
        const blockBounds = {
          x1: obj.x,
          y1: obj.y,
          x2: obj.x + obj.tileSize.w,
          y2: obj.y + obj.tileSize.h
        };

        if( item.type === 'block') {
          blockBounds.x2 = obj.x + this.tileSize;
          blockBounds.y2 = obj.y + this.tileSize;
        }

        // Draw any colliding tiles that haven't been drawn yet
        if (this.background) {
          const startCol = Math.floor(blockBounds.x1 / this.tileSize);
          let endCol   = Math.ceil(blockBounds.x2 / this.tileSize);
          const startRow = Math.floor(blockBounds.y1 / this.tileSize);
          let endRow   = Math.ceil(blockBounds.y2 / this.tileSize);

          // If a block is perfectly on a tile + that tile is a non-zero height stage tile, draw tiles to bottom and right
          if( blockBounds.x1 % this.tileSize == 0 && blockBounds.y1 % this.tileSize == 0 && this.background.tiles?.[startRow]?.[startCol]?.height != null) {
            endCol += 1;
            endRow += 1;
          }

          for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
              if (row >= 0 && row < this.background.tiles.length &&
                  col >= 0 && col < this.background.tiles[row].length) {
                const tile = this.background.tiles[row][col];
                if (tile && !drawnTiles.has(tile)) {
                  drawnTiles.add(tile);
                  tile.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
                }
              }
            }
          }
        }
        obj.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      } else if (item.type === 'arm') {
        item.obj.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      }
    }

    // Draw highlight overlays for highlighted blocks
    for (const block of highlightedBlocks) {
      this.drawBlockHighlight(ctx, block, cameraX, cameraY, zoomLevel);
    }
  }

  // Draw a mask-based highlight for a block that respects sprite edges
  drawBlockHighlight(ctx, block, cameraX, cameraY, zoomLevel) {
    if (!block.spriteSheet || !block.spriteSheet.complete || !block.spriteFrame) return;

    const screenX = Math.floor((block.x - cameraX) * zoomLevel);
    const screenY = Math.floor((block.y - cameraY) * zoomLevel);
    const nextScreenX = Math.floor(((block.x + block.tileSize.w) - cameraX) * zoomLevel);
    const nextScreenY = Math.floor(((block.y + block.tileSize.h) - cameraY) * zoomLevel);
    const screenW = Math.max(1, nextScreenX - screenX);
    const screenH = Math.max(1, nextScreenY - screenY);
    const screen3D = Math.floor(block.height * zoomLevel);

    // Create an off-screen canvas to use as a mask
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = screenW + screen3D;
    maskCanvas.height = screenH + screen3D;
    const maskCtx = maskCanvas.getContext('2d');

    // Draw the sprite onto the mask canvas
    maskCtx.drawImage(
      block.spriteSheet,
      block.spriteFrame.x, block.spriteFrame.y, block.spriteFrame.w, block.spriteFrame.h,
      0, 0,
      screenW, screenH
    );

    // Use the mask canvas to draw a white highlight overlay
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    
    // Draw highlight color through the mask
    ctx.fillStyle = 'rgba(255, 255, 255, 1)';
    ctx.drawImage(maskCanvas, screenX - screen3D, screenY - screen3D);
    
    // Restore context state
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }
}