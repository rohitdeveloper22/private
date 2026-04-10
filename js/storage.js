/**
 * storage.js  v8.0
 * Sprint 8: IndexedDB migration — 50 MB storage, same sync API via memory cache.
 *           Falls back to localStorage on unsupported browsers.
 *           Auto-migrates existing localStorage data on first run.
 */
const Storage = (() => {
  const LS_KEY             = 'chordstar_personal_db';
  const THEME_KEY          = 'chordstar_theme';
  const ONBOARDING_KEY     = 'chordstar_onboarding_done';
  const IDB_NAME           = 'ChordStarPersonalDB';
  const IDB_VERSION        = 1;
  const IDB_STORE          = 'main';
  const STORAGE_WARN_BYTES = 40_000_000;

  const DEFAULT_DB = {
    students: [], tasks: [], progress: [], progress_history: [],
    attendance: [], fee_records: [],
    schedules: [], syllabus: [], class_ratings: [], skill_levels: [],
    goals: []
  };

  let _mem    = null;
  let _idb    = null;
  let _useIDB = false;

  /* ── IndexedDB Helpers ────────────────────────────────────── */
  function _openIDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  function _idbGet(db) {
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get('db');
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  function _idbPut(db, data) {
    return new Promise((res, rej) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const req = tx.objectStore(IDB_STORE).put(data, 'db');
      req.onsuccess = () => res(true);
      req.onerror   = e => rej(e.target.error);
    });
  }

  /* ── Ensure all required arrays exist ────────────────────── */
  function _normalise(p) {
    if (!p || typeof p !== 'object') return structuredClone(DEFAULT_DB);
    const d = structuredClone(DEFAULT_DB);
    Object.keys(d).forEach(k => { if (Array.isArray(p[k])) d[k] = p[k]; });
    return d;
  }

  /* ── Public: Async init — call once at app startup ─────────── */
  async function initStorage() {
    try {
      _idb    = await _openIDB();
      _useIDB = true;

      const stored = await _idbGet(_idb);

      if (stored) {
        // IDB has data — use it
        _mem = _normalise(stored);
        // Clean up old localStorage to free browser storage
        try { localStorage.removeItem(LS_KEY); } catch {}
      } else {
        // First run with IDB — try migrating from localStorage
        const raw = localStorage.getItem(LS_KEY);
        if (raw) {
          try {
            _mem = _normalise(JSON.parse(raw));
            await _idbPut(_idb, _mem);
            localStorage.removeItem(LS_KEY);
          } catch {
            _mem = structuredClone(DEFAULT_DB);
          }
        } else {
          _mem = structuredClone(DEFAULT_DB);
        }
      }
    } catch (e) {
      // IndexedDB unavailable — fall back to localStorage
      console.warn('ChordStar: IndexedDB unavailable, using localStorage.', e);
      _useIDB = false;
      try {
        const raw = localStorage.getItem(LS_KEY);
        _mem = raw ? _normalise(JSON.parse(raw)) : structuredClone(DEFAULT_DB);
      } catch {
        _mem = structuredClone(DEFAULT_DB);
      }
    }
    return _mem;
  }

  /* ── Sync getDB / saveDB (memory-first) ─────────────────── */
  function getDB() {
    if (!_mem) _mem = structuredClone(DEFAULT_DB); // safety net before init
    return _mem;
  }

  function saveDB(db) {
    _mem = db;
    if (_useIDB && _idb) {
      _idbPut(_idb, db).catch(e => {
        console.error('ChordStar: IDB write failed.', e);
        window.dispatchEvent(new CustomEvent('cs-storage-full'));
      });
      // Warn if large
      try {
        const approx = JSON.stringify(db).length;
        if (approx > STORAGE_WARN_BYTES) {
          window.dispatchEvent(new CustomEvent('cs-storage-warn', { detail: { bytes: approx } }));
        }
      } catch {}
    } else {
      // localStorage fallback
      try {
        const str = JSON.stringify(db);
        if (str.length > 4_200_000) {
          window.dispatchEvent(new CustomEvent('cs-storage-warn', { detail: { bytes: str.length } }));
        }
        localStorage.setItem(LS_KEY, str);
      } catch (e) {
        console.error('ChordStar: localStorage save failed.', e);
        window.dispatchEvent(new CustomEvent('cs-storage-full'));
        return false;
      }
    }
    return true;
  }

  /* ── Storage size info ───────────────────────────────────── */
  function getStorageSize() {
    try {
      const str   = JSON.stringify(_mem || {});
      const used  = new Blob([str]).size;
      const limit = _useIDB ? 50_000_000 : 5_000_000;
      return { usedBytes: used, usedKB: Math.round(used / 1024), limitBytes: limit,
               percent: Math.min(100, Math.round(used / limit * 100)), isIDB: _useIDB };
    } catch { return { usedBytes:0, usedKB:0, limitBytes:50_000_000, percent:0, isIDB:_useIDB }; }
  }

  /* ── Export / Import ─────────────────────────────────────── */
  function exportJSON() {
    const db  = getDB();
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `chordstar_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const db = getDB();
    const SKILL = ['Beginner','Elementary','Intermediate','Advanced','Expert'];
    const rows = [['Name','Phone','Status','Fee Amount','Fee Status','Skill Level','Attended','Missed','Attendance %','Tasks Done','Tasks Pending','Goals Active','Goals Achieved','Enrolled Since']];
    db.students.forEach(s => {
      const att   = db.attendance.filter(a => a.student_id === s.id);
      const attd  = att.filter(a => a.type === 'attended').length;
      const misd  = att.filter(a => a.type === 'missed').length;
      const tasks = db.tasks.filter(t => t.student_id === s.id);
      const sl    = db.skill_levels.find(x => x.student_id === s.id);
      const goals = (db.goals || []).filter(g => g.student_id === s.id);
      rows.push([
        s.name, s.phone || '', s.status || 'active', s.fee_amount || 0,
        s.fee_status || 'unpaid', SKILL[sl ? sl.level : 0] || 'Beginner',
        attd, misd, att.length ? Math.round(attd / att.length * 100) + '%' : '—',
        tasks.filter(t => t.status === 'done').length,
        tasks.filter(t => t.status === 'pending').length,
        goals.filter(g => g.status === 'active').length,
        goals.filter(g => g.status === 'achieved').length,
        s.created_at ? s.created_at.slice(0, 10) : ''
      ]);
    });
    const csv  = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `chordstar_students_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  function importJSON(jsonStr) {
    try {
      const p = JSON.parse(jsonStr);
      if (!Array.isArray(p.students)) return { ok: false, error: 'Invalid file: missing students.' };
      if (!Array.isArray(p.tasks))    return { ok: false, error: 'Invalid file: missing tasks.' };
      if (p.students.length > 0 && !p.students.every(s => s.id && s.name))
        return { ok: false, error: 'File has corrupted student records.' };
      const db = _normalise(p);
      saveDB(db);
      return { ok: true, count: { students: db.students.length, tasks: db.tasks.length } };
    } catch { return { ok: false, error: 'Could not parse file. Make sure it is a valid ChordStar backup.' }; }
  }

  /* ── Theme / Onboarding (always localStorage — tiny values) ─ */
  function getTheme()          { return localStorage.getItem(THEME_KEY) || 'dark'; }
  function setTheme(t)         { localStorage.setItem(THEME_KEY, t); }
  function getOnboardingDone() { return localStorage.getItem(ONBOARDING_KEY) === '1'; }
  function setOnboardingDone() { localStorage.setItem(ONBOARDING_KEY, '1'); }

  return {
    initStorage,
    getDB, saveDB,
    exportJSON, exportCSV, importJSON,
    getTheme, setTheme,
    getOnboardingDone, setOnboardingDone,
    getStorageSize
  };
})();
