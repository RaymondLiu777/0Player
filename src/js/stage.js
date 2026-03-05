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
    this.gateArms = [];

    // snap threshold for snapping horizontals/veritically
    this.snapThreshold = 0;
    this.snapToGrid = true;

    // for right‑button dragging: remember which objects have been
    // toggled so we only flip each one once per press
    this.rightDragToggled = new Set();
  }

  async load(dataPath) {
    const dataResp = await fetch(dataPath);
    const data = await dataResp.json();

    // helper: if section.spriteMap is a string, fetch & JSON‑parse it
    const resolveSpriteMap = async (section) => {
      if (!section) return;
      if (typeof section.spriteMap === 'string') {
        const resp = await fetch(section.spriteMap);
        section.spriteMap = await resp.json();
      }
      if (typeof section.backgroundMap === 'string') {
        const resp = await fetch(section.backgroundMap);
        section.backgroundMap = await resp.json();
      }
    };

    // resolve all of them in parallel rather than one-by-one
    await Promise.all([
      resolveSpriteMap(data.background),
      resolveSpriteMap(data.blocks),
      resolveSpriteMap(data.gates),
      resolveSpriteMap(data.wires)
    ]);

    const loadImage = (src) => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = src;
    });

    // kick off every image load immediately
    const [
      bgImg,
      instructionImg,
      blocksImg,
      darkBlocksImg,
      gatesImg,
      wireImg,
      wire3dImage
    ] = await Promise.all([
      loadImage(`assets/${data.background.spriteSheet}`),
      loadImage(`assets/${data.background.instructions.sprite}`),
      loadImage(`assets/${data.blocks.spriteSheet}`),
      loadImage(`assets/${data.blocks.darkblock.spriteSheet}`),
      loadImage(`assets/${data.gates.spriteSheet}`),
      loadImage(`assets/${data.wires.spriteSheet}`),
      loadImage(`assets/${data.wires['3dSpriteSheet']}`)
    ]);

    // --- Background ---
    const bg = new Background(this.tileSize);
    data.background.mapHeight = data.size.height;
    data.background.mapWidth = data.size.width;
    bg.load(data.background, bgImg, instructionImg);
    this.background = bg;

    // --- Blocks / Squares ---
    data.background.mapHeight = data.size.height;
    data.blocks.mapWidth = data.size.width;
    const squares = Block.fromData(data.blocks, blocksImg, darkBlocksImg, this.tileSize);
    this.squares = squares;
    this.blockById = {};
    for (const b of this.squares) this.blockById[b.spriteId] = b;

    // --- Gates ---
    data.gates.mapWidth = data.size.width;
    data.gates.mapHeight = data.size.height;
    const { gates, arms } = Gate.fromData(data.gates, gatesImg, this.tileSize);
    // insert gate tiles into the background grid
    this.background.addGates(gates);
    this.gateArms = arms;

    // --- Wires ---
    data.background.mapHeight = data.size.height;
    data.wires.mapWidth = data.size.width;
    const wires = Wire.fromData(data.wires, wireImg, wire3dImage, this.tileSize);
    const bgWires = [];

    // Attach wires to squares
    for (const w of wires) {
      const sq = this.squares.find(s => s.x === w.x && s.y === w.y);
      if (sq) {
        sq.wire = w;
        w.height = sq.height;
        continue;
      }
      bgWires.push(w);
    }
    // Attach wires to background
    this.background.attachWires(bgWires);

    // now that gates and wires are all in place, build the cached image
    this.background.renderCache();

    return this;
  }

  // Check gates first, then gates, then background for toggles
  isClicked(mapX, mapY) {
    // gate‑arms take top priority
    for (const arm of this.gateArms) {
      if (arm.isClicked(mapX, mapY)) {
        return arm;
      }
    }

    // squares/blocks
    for (let i = this.squares.length - 1; i >= 0; i--) {
      const s = this.squares[i];
      if (s.isClicked(mapX, mapY) && s.wire != null) {
        return s.wire;
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
    if (this.draggingBlock) this.endBlockDrag();
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
  startBlockDrag(mapX, mapY) {
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
  updateBlockDrag(mapX, mapY) {
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
  endBlockDrag() {
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
    // blit part of the pre‑rendered background cache
    if (this.background && this.background.cacheCanvas) {
      const srcX = cameraX;
      const srcY = cameraY;
      const srcW = canvasWidth / zoomLevel;
      const srcH = canvasHeight / zoomLevel;
      ctx.drawImage(
        this.background.cacheCanvas,
        srcX, srcY, srcW, srcH,
        0, 0, canvasWidth, canvasHeight
      );
    }

    const viewWidth = canvasWidth / zoomLevel;
    const viewHeight = canvasHeight / zoomLevel;
    const highlightedBlocks = [];

    // draw blocks and handle their 2.5‑D overlap
    for (const block of this.squares) {
      if (block.x + block.tileSize.w < cameraX || block.x > cameraX + viewWidth ||
          block.y + block.tileSize.h < cameraY || block.y > cameraY + viewHeight) {
        continue; // Cull off-screen blocks
      }

      block.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
      if (block.highlighted) highlightedBlocks.push(block);
    }

    // gate arms continue to be rendered on top of blocks
    for (const arm of this.gateArms) {
      arm.draw(ctx, cameraX, cameraY, canvasWidth, canvasHeight, zoomLevel);
    }

    // highlights
    for (const b of highlightedBlocks) {
      this.drawBlockHighlight(ctx, b, cameraX, cameraY, zoomLevel);
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

  startRightDrag() {
    this.rightDragToggled.clear();
  }

  handleRightDragAt(mapX, mapY) {
    const obj = this.isClicked(mapX, mapY);
    if (!obj) return null;

    if (!this.rightDragToggled.has(obj)) {
      obj.toggle();
      this.rightDragToggled.add(obj);

      // if the toggle affected a background wire, update the cache
      if (obj instanceof Wire && this.background) {
        this.background.updateCache(obj);
      }
      return obj;
    }
    return null;
  }

  endRightDrag() {
    this.rightDragToggled.clear();
  }
}