// apps/miniapp/lib/splits.store.mjs
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAddress, isAddress } from "viem";

const DATA_DIR = process.env.DATA_DIR || "/data";
const FILE = path.join(DATA_DIR, "splits.jsonl");

export class SplitsStore {
  constructor() {
    this.map = new Map();
  }

  /**
   * Initialize store - must be called before use.
   * Loads existing splits from disk.
   */
  async init() {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(FILE), { recursive: true });
      
      // Load existing data
      const content = await fs.readFile(FILE, "utf8").catch(() => "");
      const lines = content.split("\n").filter(Boolean);
      
      for (const line of lines) {
        try {
          const rec = JSON.parse(line);
          
          // Validate record structure
          if (!rec.creator || !rec.split) {
            console.warn(`[splits.store] Skipping incomplete record:`, rec);
            continue;
          }
          
          if (!isAddress(rec.creator) || !isAddress(rec.split)) {
            console.warn(`[splits.store] Skipping invalid addresses:`, rec);
            continue;
          }
          
          const key = getAddress(rec.creator).toLowerCase();
          
          if (this.map.has(key)) {
            console.warn(`[splits.store] Duplicate entry for ${rec.creator}, using latest`);
          }
          
          this.map.set(key, rec);
        } catch (e) {
          console.warn(`[splits.store] Skipping malformed line:`, e.message);
        }
      }
      
      console.log(`[splits.store] Loaded ${this.map.size} split records from ${FILE}`);
    } catch (e) {
      console.error("[splits.store] Failed to initialize:", e);
      throw e; // Fail startup if store can't be initialized
    }
  }

  /**
   * Append a record to the JSONL file.
   */
  async _append(rec) {
    try {
      await fs.appendFile(FILE, JSON.stringify(rec) + "\n");
    } catch (e) {
      console.error("[splits.store] Failed to append record:", e);
      throw e;
    }
  }

  /**
   * Get split address for a creator.
   * @param {string} creator - Creator wallet address
   * @returns {string|null} Split contract address or null
   */
  get(creator) {
    if (!creator || !isAddress(creator)) return null;
    
    const key = getAddress(creator).toLowerCase();
    const rec = this.map.get(key);
    
    return rec?.split || null;
  }

  /**
   * Get full record for a creator.
   * @param {string} creator - Creator wallet address
   * @returns {object|null} Full record or null
   */
  getRecord(creator) {
    if (!creator || !isAddress(creator)) return null;
    
    const key = getAddress(creator).toLowerCase();
    return this.map.get(key) || null;
  }

  /**
   * Check if a creator has a split.
   * @param {string} creator - Creator wallet address
   * @returns {boolean}
   */
  has(creator) {
    if (!creator || !isAddress(creator)) return false;
    
    const key = getAddress(creator).toLowerCase();
    return this.map.has(key);
  }

  /**
   * Store or update a creator's split.
   * @param {object} data - { creator, split }
   * @returns {Promise<object>} The stored record
   */
  async upsert({ creator, split }) {
    if (!isAddress(creator) || !isAddress(split)) {
      throw new Error(`Invalid address - creator: ${creator}, split: ${split}`);
    }
    
    const normalizedCreator = getAddress(creator);
    const normalizedSplit = getAddress(split);
    
    const rec = {
      creator: normalizedCreator,
      split: normalizedSplit,
      ts: Date.now(),
    };
    
    const key = normalizedCreator.toLowerCase();
    
    // Check if this is an update to existing record
    const isUpdate = this.map.has(key);
    
    // Update in-memory map
    this.map.set(key, rec);
    
    try {
      // Persist to disk
      await this._append(rec);
      
      if (isUpdate) {
        console.log(`[splits.store] Updated split for ${normalizedCreator}: ${normalizedSplit}`);
      } else {
        console.log(`[splits.store] Created split for ${normalizedCreator}: ${normalizedSplit}`);
      }
      
      return rec;
    } catch (e) {
      // Rollback in-memory state if write fails
      if (!isUpdate) {
        this.map.delete(key);
      }
      throw e;
    }
  }

  /**
   * Get all stored splits.
   * @returns {Map<string, object>} Map of creator -> record
   */
  getAll() {
    return new Map(this.map);
  }

  /**
   * Get count of stored splits.
   * @returns {number}
   */
  size() {
    return this.map.size;
  }
}