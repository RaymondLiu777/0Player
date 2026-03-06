class BlockGroups {
  constructor() {
    this.blockToGroup = {}; // blockId -> groupId
    this.groupToBlocks = {}; // groupId -> [blockId]
    this.nextGroupId = 1;
    this.tempSelection = new Set(); // temporary selection while G held
  }

  addTemp(blockId) {
    if(!this.tempSelection.has(blockId)) {
      this.tempSelection.add(blockId);
    }
  }

  removeTemp(blockId) {
    if(this.tempSelection.has(blockId)) {
      this.tempSelection.delete(blockId);
      return true;
    }
    return false;
  } 

  clearTemp() {
    this.tempSelection.clear();
  }

  isTempSelected(blockId) {
    return this.tempSelection.has(blockId);
  }

  // Disband group entirely
  disbandGroup(groupId) {
    const members = this.groupToBlocks[groupId];
    if (!members) return;
    for (const bid of members) {
      delete this.blockToGroup[bid];
    }
    delete this.groupToBlocks[groupId];
  }

  // Finalize the temp selection into a permanent group.
  // Disbands any existing groups that any of the temp blocks belong to
  finalizeTemp() {
    if (!this.tempSelection.size) return null;

    // Disband any groups that contain any selected block
    const groupsToDisband = new Set();
    for (const bid of this.tempSelection) {
      const gid = this.blockToGroup[bid];
      if (gid) groupsToDisband.add(gid);
    }
    for (const gid of groupsToDisband) {
      this.disbandGroup(gid);
    }

    
    if(this.tempSelection.size > 1) {
      // Create new group
      const gid = this.nextGroupId++;
      const members = Array.from(this.tempSelection);
      this.groupToBlocks[gid] = members;
      for (const bid of members) {
        this.blockToGroup[bid] = gid;
      }
    }

    this.clearTemp();
  }

  getGroupFor(blockId) {
    return this.blockToGroup[blockId] || null;
  }

  getBlocksInGroup(groupId) {
    return this.groupToBlocks[groupId] ? Array.from(this.groupToBlocks[groupId]) : [];
  }
}