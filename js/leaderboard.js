/**
 * Global Visitor Top-5 Leaderboard Manager (Google Sheets + LocalStorage Cache)
 * - Separated by Question Bank Unit:
 *   1. 'pos_neg'     -> 題庫一：正負數加減法
 *   2. 'square_root' -> 題庫二：平方與開根號
 * - Excludes AI runners (isAI === true) and unfinished runs (!finished)
 * - Deduplicates by visitor name per unit, keeping ONLY the fastest finishTime
 */

// ============================================================================
// 📌 請將您部署好的 Google 試算表「網頁應用程式網址 (Web App URL)」貼在下方引號內：
// 範例：const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
// ============================================================================
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxemBQBFwMMEB12Ych0u5nyxsjFqA2YYcQB-N0O87GpCtWsQQ0A3vf_63pVIYYXB0cgWg/exec';

class LeaderboardManager {
    constructor() {
        this.storageKey = 'math_track_3d_leaderboard_v1';
        this.customUrlKey = 'math_track_3d_gas_url_v1';
        this.maxRankCount = 5;
        this.isLoading = false;

        // Local cache structure: { pos_neg: [{ name, time, date }], square_root: [{ name, time, date }] }
        this.cache = this.loadLocalCache();
    }

    getScriptUrl() {
        if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL.trim().startsWith('https://script.google.com/')) {
            return GOOGLE_SCRIPT_URL.trim();
        }
        try {
            const saved = localStorage.getItem(this.customUrlKey);
            if (saved && saved.trim().startsWith('https://script.google.com/')) {
                return saved.trim();
            }
        } catch (e) {}
        return '';
    }

    setCustomScriptUrl(url) {
        const clean = (url || '').trim();
        try {
            if (clean) {
                localStorage.setItem(this.customUrlKey, clean);
            } else {
                localStorage.removeItem(this.customUrlKey);
            }
        } catch (e) {}
    }

    loadLocalCache() {
        const empty = { pos_neg: [], square_root: [] };
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) return empty;
            const parsed = JSON.parse(raw);
            return {
                pos_neg: this.normalizeAndRankList(parsed.pos_neg || []),
                square_root: this.normalizeAndRankList(parsed.square_root || [])
            };
        } catch (e) {
            return empty;
        }
    }

    saveLocalCache() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.cache));
        } catch (e) {}
    }

    // Deduplicate by visitor name (keeping fastest time) and sort ascending by time
    normalizeAndRankList(list) {
        if (!Array.isArray(list)) return [];
        const bestByName = new Map();

        list.forEach((item) => {
            if (!item || typeof item.name !== 'string') return;
            const cleanName = item.name.trim();
            const numTime = Number(item.time);
            if (!cleanName || !Number.isFinite(numTime) || numTime <= 0) return;

            const existing = bestByName.get(cleanName);
            if (!existing || numTime < existing.time) {
                bestByName.set(cleanName, {
                    name: cleanName,
                    time: Number(numTime.toFixed(1)),
                    date: item.date || new Date().toISOString()
                });
            }
        });

        return Array.from(bestByName.values())
            .sort((a, b) => a.time - b.time)
            .slice(0, this.maxRankCount);
    }

    /**
     * Record a finished human player's score.
     * Unfinished players or AI players are ignored.
     */
    async recordFinishedScore({ bankMode, name, time, correctCount, isAI, finished }) {
        if (isAI || !finished) return null;

        const unit = bankMode === 'square_root' ? 'square_root' : 'pos_neg';
        const cleanName = (name || '神秘跑者').trim();
        const numTime = Number(Number(time).toFixed(1));
        if (!cleanName || !Number.isFinite(numTime) || numTime <= 0) return null;

        // 1. Update local cache immediately (deduplicated by name, keeping best time)
        const currentList = this.cache[unit] || [];
        currentList.push({
            name: cleanName,
            time: numTime,
            date: new Date().toISOString()
        });
        this.cache[unit] = this.normalizeAndRankList(currentList);
        this.saveLocalCache();

        // 2. If Google Sheets Web App URL is configured, submit to cloud database
        const scriptUrl = this.getScriptUrl();
        if (!scriptUrl) {
            return this.cache;
        }

        try {
            // Use text/plain to avoid CORS preflight OPTIONS block on Google Apps Script
            const response = await fetch(scriptUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain;charset=utf-8'
                },
                body: JSON.stringify({
                    action: 'submit',
                    bankMode: unit,
                    name: cleanName,
                    time: numTime,
                    correctCount: correctCount || 10
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data && data.leaderboards) {
                    this.cache = {
                        pos_neg: this.normalizeAndRankList(data.leaderboards.pos_neg || []),
                        square_root: this.normalizeAndRankList(data.leaderboards.square_root || [])
                    };
                    this.saveLocalCache();
                }
            }
        } catch (err) {
            console.warn('[Leaderboard] Google Sheets 雲端寫入失敗，已保存於本機暫存:', err);
        }

        return this.cache;
    }

    /**
     * Fetch latest Top-5 leaderboards for both question banks from Google Sheets
     */
    async fetchLeaderboards() {
        const scriptUrl = this.getScriptUrl();
        if (!scriptUrl) {
            return {
                source: 'local',
                data: this.cache
            };
        }

        this.isLoading = true;
        try {
            const urlWithTs = `${scriptUrl}${scriptUrl.includes('?') ? '&' : '?'}action=get&t=${Date.now()}`;
            const response = await fetch(urlWithTs, {
                method: 'GET'
            });

            if (response.ok) {
                const result = await response.json();
                if (result && result.leaderboards) {
                    this.cache = {
                        pos_neg: this.normalizeAndRankList(result.leaderboards.pos_neg || []),
                        square_root: this.normalizeAndRankList(result.leaderboards.square_root || [])
                    };
                    this.saveLocalCache();
                    this.isLoading = false;
                    return {
                        source: 'cloud',
                        data: this.cache
                    };
                }
            }
        } catch (err) {
            console.warn('[Leaderboard] 無法連線至 Google 試算表，改顯示本機快取排行:', err);
        }

        this.isLoading = false;
        return {
            source: 'local_fallback',
            data: this.cache
        };
    }
}

window.leaderboardManager = new LeaderboardManager();
