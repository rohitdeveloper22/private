/**
 * students.js  v7.0
 * NEW: schedule CRUD, syllabus CRUD, skill level, class ratings
 */
const Students = (() => {
  const AVATAR_COLORS = [
    '#e74c3c','#e67e22','#f39c12','#2ecc71','#1abc9c',
    '#3498db','#9b59b6','#e91e63','#00bcd4','#8bc34a',
    '#ff5722','#009688','#673ab7','#c0392b','#16a085'
  ];
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const SKILL_STAGES = ['Beginner','Elementary','Intermediate','Advanced','Expert'];

  function pickColor() { return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]; }
  function genId(p)    { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

  /* ── Student CRUD ─────────────────────────────────────────── */
  function addStudent({ name, phone, fee_amount, notes }) {
    const trimName = (name||'').trim();
    if (!trimName) return { ok:false, error:'Name is required.' };
    const db = Storage.getDB();
    if (db.students.some(s => s.name.toLowerCase()===trimName.toLowerCase()))
      return { ok:false, error:'Student already exists.' };
    const student = {
      id: genId('s'), name: trimName, phone: (phone||'').trim(),
      status:'active', fee_amount: parseFloat(fee_amount)||0,
      fee_status:'unpaid', color: pickColor(),
      notes:(notes||'').trim(), created_at: new Date().toISOString()
    };
    db.students.push(student); Storage.saveDB(db);
    return { ok:true, student };
  }

  function updateStudent(id, { name, phone, fee_amount }) {
    const trimName = (name||'').trim();
    if (!trimName) return { ok:false, error:'Name is required.' };
    const db = Storage.getDB(), idx = db.students.findIndex(s=>s.id===id);
    if (idx===-1) return { ok:false, error:'Student not found.' };
    if (db.students.some(s=>s.id!==id && s.name.toLowerCase()===trimName.toLowerCase()))
      return { ok:false, error:'Another student with this name exists.' };
    db.students[idx].name  = trimName;
    db.students[idx].phone = (phone||'').trim();
    const fee = parseFloat(fee_amount);
    if (!isNaN(fee)) db.students[idx].fee_amount = fee;
    Storage.saveDB(db);
    return { ok:true, student:db.students[idx] };
  }

  function updateStudentNotes(id, notes) {
    const db=Storage.getDB(), idx=db.students.findIndex(s=>s.id===id);
    if (idx===-1) return { ok:false };
    db.students[idx].notes=(notes||'').trim(); Storage.saveDB(db);
    return { ok:true };
  }

  function toggleStatus(id) {
    const db=Storage.getDB(), idx=db.students.findIndex(s=>s.id===id);
    if (idx===-1) return { ok:false };
    db.students[idx].status = db.students[idx].status==='active'?'inactive':'active';
    Storage.saveDB(db); return { ok:true, student:db.students[idx] };
  }

  function updateFeeStatus(id, feeStatus) {
    if (!['paid','unpaid','partial'].includes(feeStatus)) return { ok:false };
    const db=Storage.getDB(), idx=db.students.findIndex(s=>s.id===id);
    if (idx===-1) return { ok:false };
    db.students[idx].fee_status=feeStatus; Storage.saveDB(db);
    return { ok:true, student:db.students[idx] };
  }

  function getStudents(filter='all') {
    const db=Storage.getDB(); let list=db.students.slice();
    if (filter==='active')   list=list.filter(s=>s.status==='active');
    if (filter==='inactive') list=list.filter(s=>(s.status||'active')==='inactive');
    return list.sort((a,b)=>a.name.localeCompare(b.name));
  }

  function getStudentById(id) { return Storage.getDB().students.find(s=>s.id===id)||null; }

  function deleteStudent(id) {
    const db=Storage.getDB(), idx=db.students.findIndex(s=>s.id===id);
    if (idx===-1) return { ok:false };
    db.students.splice(idx,1);
    ['tasks','progress','progress_history','attendance','fee_records','schedules','syllabus','class_ratings','skill_levels']
      .forEach(k => { if (Array.isArray(db[k])) db[k]=db[k].filter(x=>x.student_id!==id); });
    Storage.saveDB(db); return { ok:true };
  }

  /* ── Progress ─────────────────────────────────────────────── */
  function updateProgress(studentId,{current_topic,last_class_date,notes}) {
    const db=Storage.getDB(), idx=db.progress.findIndex(p=>p.student_id===studentId);
    const entry={id:idx>=0?db.progress[idx].id:genId('p'),student_id:studentId,
      current_topic:(current_topic||'').trim(),last_class_date:last_class_date||'',
      notes:(notes||'').trim(),updated_at:new Date().toISOString()};
    if (idx>=0) db.progress[idx]=entry; else db.progress.push(entry);
    Storage.saveDB(db); return { ok:true, entry };
  }
  function getProgress(studentId) { return Storage.getDB().progress.find(p=>p.student_id===studentId)||null; }

  function addProgressEntry(studentId,{topic,date,notes,rating}) {
    const trimTopic=(topic||'').trim();
    if (!trimTopic) return { ok:false, error:'Topic is required.' };
    const db=Storage.getDB();
    const entry={id:genId('ph'),student_id:studentId,topic:trimTopic,
      date:date||new Date().toISOString().slice(0,10),
      notes:(notes||'').trim(),rating:rating||0,
      created_at:new Date().toISOString()};
    db.progress_history.push(entry); Storage.saveDB(db);
    return { ok:true, entry };
  }
  function getProgressHistory(studentId) {
    return Storage.getDB().progress_history
      .filter(p=>p.student_id===studentId)
      .sort((a,b)=>{
        const dateDiff=new Date(b.date)-new Date(a.date);
        if (dateDiff!==0) return dateDiff;
        return new Date(b.created_at)-new Date(a.created_at);
      });
  }
  function deleteProgressEntry(id) {
    const db=Storage.getDB(), idx=db.progress_history.findIndex(p=>p.id===id);
    if (idx===-1) return { ok:false };
    db.progress_history.splice(idx,1); Storage.saveDB(db); return { ok:true };
  }

  /* ── Attendance ───────────────────────────────────────────── */
  function addAttendance(studentId,{date,type,notes}) {
    if (!['attended','missed'].includes(type)) return { ok:false };
    const db=Storage.getDB(), isoDate=date||new Date().toISOString().slice(0,10);
    db.attendance=db.attendance.filter(a=>!(a.student_id===studentId&&a.date===isoDate));
    const entry={id:genId('att'),student_id:studentId,date:isoDate,type,
      notes:(notes||'').trim(),created_at:new Date().toISOString()};
    db.attendance.push(entry); Storage.saveDB(db); return { ok:true, entry };
  }
  function getAttendance(studentId) {
    return Storage.getDB().attendance.filter(a=>a.student_id===studentId)
      .sort((a,b)=>new Date(b.date)-new Date(a.date));
  }
  function getAttendanceSummary(studentId) {
    const now=new Date(), prefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const records=Storage.getDB().attendance.filter(a=>a.student_id===studentId&&a.date.startsWith(prefix));
    return { attended:records.filter(a=>a.type==='attended').length, missed:records.filter(a=>a.type==='missed').length };
  }
  function getAttendanceRate(studentId) {
    const records=Storage.getDB().attendance.filter(a=>a.student_id===studentId);
    if (!records.length) return null;
    return Math.round(records.filter(a=>a.type==='attended').length/records.length*100);
  }

  /* ── Fee Records ──────────────────────────────────────────── */
  function addFeeRecord(studentId,{amount,date,note}) {
    const amt=parseFloat(amount);
    if (isNaN(amt)||amt<=0) return { ok:false, error:'Valid amount required.' };
    const db=Storage.getDB();
    if (!Array.isArray(db.fee_records)) db.fee_records=[];
    const entry={id:genId('fr'),student_id:studentId,amount:amt,
      date:date||new Date().toISOString().slice(0,10),note:(note||'').trim(),
      created_at:new Date().toISOString()};
    db.fee_records.push(entry); Storage.saveDB(db); return { ok:true, entry };
  }
  function getFeeRecords(studentId) {
    return (Storage.getDB().fee_records||[]).filter(f=>f.student_id===studentId)
      .sort((a,b)=>new Date(b.date)-new Date(a.date));
  }
  function deleteFeeRecord(id) {
    const db=Storage.getDB();
    if (!Array.isArray(db.fee_records)) return { ok:false };
    const idx=db.fee_records.findIndex(f=>f.id===id);
    if (idx===-1) return { ok:false };
    db.fee_records.splice(idx,1); Storage.saveDB(db); return { ok:true };
  }
  function getMonthlyRevenueSummary() {
    const db=Storage.getDB();
    const active=db.students.filter(s=>(s.status||'active')==='active'&&(s.fee_amount||0)>0);
    const expected=active.reduce((s,x)=>s+(x.fee_amount||0),0);
    const now=new Date(), prefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const collected=(db.fee_records||[]).filter(f=>f.date.startsWith(prefix)).reduce((s,f)=>s+f.amount,0);
    return {
      expected, collected, uncollected:Math.max(0,expected-collected),
      paidCount:active.filter(s=>s.fee_status==='paid').length,
      unpaidCount:active.filter(s=>s.fee_status==='unpaid').length,
      partialCount:active.filter(s=>s.fee_status==='partial').length
    };
  }

  /* ── Sprint 4: Weekly Schedule ────────────────────────────── */
  /**
   * Schedule entry: { day: 0-6, time: "HH:MM", duration_min: 60 }
   * One entry per day per student.
   */
  function setSchedule(studentId, daySlots) {
    // daySlots: array of { day, time, duration_min }
    const db = Storage.getDB();
    db.schedules = db.schedules.filter(s => s.student_id !== studentId);
    daySlots.forEach(slot => {
      if (slot.time) {
        db.schedules.push({
          id: genId('sch'), student_id: studentId,
          day: Number(slot.day), time: slot.time,
          duration_min: Number(slot.duration_min) || 60
        });
      }
    });
    Storage.saveDB(db); return { ok:true };
  }

  function getSchedule(studentId) {
    return Storage.getDB().schedules
      .filter(s => s.student_id === studentId)
      .sort((a,b) => a.day - b.day);
  }

  /** Returns today's classes sorted by time */
  function getTodayClasses() {
    const db = Storage.getDB();
    const todayDay = new Date().getDay(); // 0=Sun
    return db.schedules
      .filter(s => s.day === todayDay)
      .map(s => {
        const student = db.students.find(x => x.id === s.student_id);
        return { ...s, studentName: student ? student.name : 'Unknown', studentColor: student?.color };
      })
      .sort((a,b) => a.time.localeCompare(b.time));
  }

  /** Returns upcoming classes for next 7 days */
  function getUpcomingClasses(days=7) {
    const db = Storage.getDB();
    const today = new Date(); today.setHours(0,0,0,0);
    const results = [];
    for (let i=0; i<days; i++) {
      const d = new Date(today); d.setDate(d.getDate()+i);
      const day = d.getDay();
      db.schedules.filter(s=>s.day===day).forEach(s => {
        const student = db.students.find(x=>x.id===s.student_id);
        results.push({ ...s, date: d.toISOString().slice(0,10),
          studentName: student?student.name:'Unknown',
          studentColor: student?.color, isToday: i===0 });
      });
    }
    return results.sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
  }

  /* ── Sprint 5: Skill Level ────────────────────────────────── */
  function getSkillLevel(studentId) {
    const entry = Storage.getDB().skill_levels.find(x=>x.student_id===studentId);
    return entry ? entry.level : 0; // 0=Beginner
  }
  function setSkillLevel(studentId, level) {
    const db = Storage.getDB();
    const idx = db.skill_levels.findIndex(x=>x.student_id===studentId);
    const entry = { id:genId('sl'), student_id:studentId, level:Number(level), updated_at:new Date().toISOString() };
    if (idx>=0) db.skill_levels[idx]=entry; else db.skill_levels.push(entry);
    Storage.saveDB(db); return { ok:true };
  }
  function getSkillStages() { return SKILL_STAGES; }

  /* ── Sprint 5: Syllabus Checklist ────────────────────────── */
  function addSyllabusItem(studentId, { title, category }) {
    const trimTitle=(title||'').trim();
    if (!trimTitle) return { ok:false, error:'Title required.' };
    const db=Storage.getDB();
    const item={id:genId('sy'),student_id:studentId,title:trimTitle,
      category:(category||'General').trim(),done:false,
      created_at:new Date().toISOString()};
    db.syllabus.push(item); Storage.saveDB(db); return { ok:true, item };
  }
  function toggleSyllabusItem(itemId) {
    const db=Storage.getDB(), idx=db.syllabus.findIndex(x=>x.id===itemId);
    if (idx===-1) return { ok:false };
    db.syllabus[idx].done=!db.syllabus[idx].done;
    db.syllabus[idx].done_at=db.syllabus[idx].done?new Date().toISOString():null;
    Storage.saveDB(db); return { ok:true, item:db.syllabus[idx] };
  }
  function deleteSyllabusItem(itemId) {
    const db=Storage.getDB(), idx=db.syllabus.findIndex(x=>x.id===itemId);
    if (idx===-1) return { ok:false };
    db.syllabus.splice(idx,1); Storage.saveDB(db); return { ok:true };
  }
  function getSyllabus(studentId) {
    const db=Storage.getDB();
    return db.syllabus.filter(x=>x.student_id===studentId)
      .sort((a,b)=>{
        if (a.done!==b.done) return a.done?1:-1;
        return a.category.localeCompare(b.category)||a.title.localeCompare(b.title);
      });
  }

  /* ── Sprint 7: Growth Helpers ───────────────────────────── */

  /** Returns count of consecutive 'attended' classes (most recent streak) */
  function getAttendanceStreak(studentId) {
    const records = Storage.getDB().attendance
      .filter(a => a.student_id === studentId)
      .sort((a,b) => new Date(b.date) - new Date(a.date));
    let streak = 0;
    for (const r of records) {
      if (r.type === 'attended') streak++;
      else break;
    }
    return streak;
  }

  /** Returns last N class ratings (1-5) from progress_history, oldest first */
  function getRecentRatings(studentId, n=10) {
    return Storage.getDB().progress_history
      .filter(p => p.student_id === studentId && p.rating > 0)
      .sort((a,b) => new Date(a.date) - new Date(b.date))
      .slice(-n)
      .map(p => ({ rating: p.rating, date: p.date, topic: p.topic }));
  }

  /** Returns {done, total, pct} for syllabus completion */
  function getSyllabusCompletion(studentId) {
    const items = Storage.getDB().syllabus.filter(x => x.student_id === studentId);
    const done = items.filter(x => x.done).length;
    const total = items.length;
    return { done, total, pct: total > 0 ? Math.round(done / total * 100) : null };
  }

  /** Average rating over all recorded sessions */
  function getAvgRating(studentId) {
    const ratings = Storage.getDB().progress_history
      .filter(p => p.student_id === studentId && p.rating > 0)
      .map(p => p.rating);
    if (!ratings.length) return null;
    return Math.round((ratings.reduce((s,r) => s+r, 0) / ratings.length) * 10) / 10;
  }

  /* ── Sprint 6: Analytics ─────────────────────────────────── */
  /** Returns last N months revenue { month:'Jan 25', expected, collected } */
  function getMonthlyRevenueHistory(months=6) {
    const db=Storage.getDB();
    const active=db.students.filter(s=>(s.status||'active')==='active'&&(s.fee_amount||0)>0);
    const expected=active.reduce((s,x)=>s+(x.fee_amount||0),0);
    const now=new Date(); const result=[];
    for (let i=months-1; i>=0; i--) {
      const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
      const prefix=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label=d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'});
      const collected=(db.fee_records||[]).filter(f=>f.date.startsWith(prefix))
        .reduce((s,f)=>s+f.amount,0);
      result.push({ month:label, expected, collected });
    }
    return result;
  }

  /** Top students by attendance rate this month */
  function getTopAttendanceStudents(n=3) {
    const db=Storage.getDB();
    const now=new Date(), prefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    return db.students
      .filter(s=>(s.status||'active')==='active')
      .map(s => {
        const records=db.attendance.filter(a=>a.student_id===s.id&&a.date.startsWith(prefix));
        const attended=records.filter(a=>a.type==='attended').length;
        const total=records.length;
        return { ...s, attended, total, rate: total>0?Math.round(attended/total*100):null };
      })
      .filter(s=>s.total>0)
      .sort((a,b)=>b.attended-a.attended)
      .slice(0,n);
  }

  /** Task completion rate per student */
  function getTaskCompletionRates() {
    const db=Storage.getDB();
    return db.students
      .filter(s=>(s.status||'active')==='active')
      .map(s => {
        const tasks=db.tasks.filter(t=>t.student_id===s.id);
        const done=tasks.filter(t=>t.status==='done').length;
        return { ...s, total:tasks.length, done, rate:tasks.length>0?Math.round(done/tasks.length*100):null };
      })
      .filter(s=>s.total>0)
      .sort((a,b)=>b.rate-a.rate);
  }

  /* ── Sprint 8: Goals / Milestone System ──────────────────── */
  /**
   * Goal schema:
   *   { id, student_id, title, deadline, status:'active'|'achieved',
   *     created_at, achieved_at }
   */
  function addGoal(studentId, { title, deadline }) {
    const trimTitle = (title || '').trim();
    if (!trimTitle) return { ok: false, error: 'Goal title is required.' };
    const db = Storage.getDB();
    if (!Array.isArray(db.goals)) db.goals = [];
    const goal = {
      id: genId('gl'), student_id: studentId,
      title: trimTitle, deadline: deadline || null,
      status: 'active', created_at: new Date().toISOString(), achieved_at: null
    };
    db.goals.push(goal); Storage.saveDB(db);
    return { ok: true, goal };
  }

  function updateGoal(id, { title, deadline }) {
    const trimTitle = (title || '').trim();
    if (!trimTitle) return { ok: false, error: 'Title required.' };
    const db = Storage.getDB();
    if (!Array.isArray(db.goals)) return { ok: false };
    const idx = db.goals.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false };
    db.goals[idx].title    = trimTitle;
    db.goals[idx].deadline = deadline || null;
    Storage.saveDB(db);
    return { ok: true, goal: db.goals[idx] };
  }

  function deleteGoal(id) {
    const db = Storage.getDB();
    if (!Array.isArray(db.goals)) return { ok: false };
    const idx = db.goals.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false };
    db.goals.splice(idx, 1); Storage.saveDB(db);
    return { ok: true };
  }

  function achieveGoal(id) {
    const db = Storage.getDB();
    if (!Array.isArray(db.goals)) return { ok: false };
    const idx = db.goals.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false };
    db.goals[idx].status      = 'achieved';
    db.goals[idx].achieved_at = new Date().toISOString();
    Storage.saveDB(db);
    return { ok: true, goal: db.goals[idx] };
  }

  function reopenGoal(id) {
    const db = Storage.getDB();
    if (!Array.isArray(db.goals)) return { ok: false };
    const idx = db.goals.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false };
    db.goals[idx].status      = 'active';
    db.goals[idx].achieved_at = null;
    Storage.saveDB(db);
    return { ok: true, goal: db.goals[idx] };
  }

  function getGoals(studentId) {
    const db = Storage.getDB();
    if (!Array.isArray(db.goals)) return [];
    return db.goals
      .filter(g => g.student_id === studentId)
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
        if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
        if (a.deadline) return -1;
        if (b.deadline) return 1;
        return new Date(b.created_at) - new Date(a.created_at);
      });
  }

  /** Goals due this month across all active students */
  function getGoalsDueThisMonth() {
    const db     = Storage.getDB();
    if (!Array.isArray(db.goals)) return [];
    const now    = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return db.goals
      .filter(g => g.status === 'active' && g.deadline && g.deadline.startsWith(prefix))
      .map(g => {
        const student = db.students.find(s => s.id === g.student_id);
        return { ...g, studentName: student ? student.name : 'Unknown', studentColor: student?.color };
      })
      .sort((a, b) => a.deadline.localeCompare(b.deadline));
  }

  /** Overdue active goals (deadline passed, not yet achieved) */
  function getOverdueGoals() {
    const db    = Storage.getDB();
    const today = new Date().toISOString().slice(0, 10);
    if (!Array.isArray(db.goals)) return [];
    return db.goals.filter(g => g.status === 'active' && g.deadline && g.deadline < today)
      .map(g => {
        const student = db.students.find(s => s.id === g.student_id);
        return { ...g, studentName: student ? student.name : 'Unknown', studentColor: student?.color };
      });
  }

  /** WhatsApp-shareable achievement card data */
  function buildAchievementCard(studentId, goalId) {
    const db      = Storage.getDB();
    const student = db.students.find(s => s.id === studentId);
    const goal    = (db.goals || []).find(g => g.id === goalId);
    if (!student || !goal) return null;
    const attRate  = (() => {
      const recs = db.attendance.filter(a => a.student_id === studentId);
      return recs.length ? Math.round(recs.filter(a => a.type === 'attended').length / recs.length * 100) : null;
    })();
    const sl   = db.skill_levels.find(x => x.student_id === studentId);
    const SKILL= ['Beginner','Elementary','Intermediate','Advanced','Expert'];
    return {
      studentName : student.name,
      studentColor: student.color,
      goalTitle   : goal.title,
      achievedOn  : goal.achieved_at ? goal.achieved_at.slice(0,10) : new Date().toISOString().slice(0,10),
      skillLevel  : SKILL[sl ? sl.level : 0] || 'Beginner',
      attRate
    };
  }

  return {
    addStudent, updateStudent, updateStudentNotes, toggleStatus, updateFeeStatus,
    getStudents, getStudentById, deleteStudent,
    updateProgress, getProgress,
    addProgressEntry, getProgressHistory, deleteProgressEntry,
    addAttendance, getAttendance, getAttendanceSummary, getAttendanceRate,
    addFeeRecord, getFeeRecords, deleteFeeRecord, getMonthlyRevenueSummary,
    setSchedule, getSchedule, getTodayClasses, getUpcomingClasses,
    getSkillLevel, setSkillLevel, getSkillStages,
    addSyllabusItem, toggleSyllabusItem, deleteSyllabusItem, getSyllabus,
    getMonthlyRevenueHistory, getTopAttendanceStudents, getTaskCompletionRates,
    /* Sprint 7 */
    getAttendanceStreak, getRecentRatings, getSyllabusCompletion, getAvgRating,
    /* Sprint 8 */
    addGoal, updateGoal, deleteGoal, achieveGoal, reopenGoal, getGoals,
    getGoalsDueThisMonth, getOverdueGoals, buildAchievementCard,
    /* Daily Register */
    getDailyReport, getAttendanceDates
  };
})();

  /* ── Daily Register ──────────────────────────────────────── */
  /**
   * Returns data for a given date:
   *   present  : [{ student, attendance, progressEntries, tasks }]
   *   absent   : [{ student, attendance }]
   *   notMarked: [{ student }]  — scheduled that day but no record
   */
  function getDailyReport(dateStr) {
    const db = Storage.getDB();
    const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dayOfWeek = new Date(dateStr + 'T00:00:00').getDay();
    const activeStudents = db.students.filter(s => (s.status || 'active') === 'active');

    // Students scheduled on this day
    const scheduledIds = new Set(
      db.schedules.filter(sc => sc.day === dayOfWeek).map(sc => sc.student_id)
    );

    const attForDate = db.attendance.filter(a => a.date === dateStr);
    const markedIds  = new Set(attForDate.map(a => a.student_id));

    const present = [], absent = [], notMarked = [];

    activeStudents.forEach(s => {
      const att = attForDate.find(a => a.student_id === s.id);
      const progressEntries = (db.progress_history || [])
        .filter(p => p.student_id === s.id && p.date === dateStr)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const pendingTasks = db.tasks
        .filter(t => t.student_id === s.id && t.status === 'pending')
        .sort((a, b) => (a.deadline || 'z').localeCompare(b.deadline || 'z'));
      const sl = db.skill_levels.find(x => x.student_id === s.id);
      const SKILL = ['Beginner','Elementary','Intermediate','Advanced','Expert'];

      // Last topic covered (any date) for absent students display
      const allProgress = (db.progress_history || [])
        .filter(p => p.student_id === s.id)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastTopic = allProgress.length > 0 ? allProgress[0] : null;

      const studentData = { student: s, skillLevel: SKILL[sl ? sl.level : 0] || 'Beginner', progressEntries, pendingTasks, lastTopic };

      if (att) {
        if (att.type === 'attended') present.push({ ...studentData, attendance: att });
        else absent.push({ ...studentData, attendance: att });
      } else if (attForDate.length > 0) {
        // Auto-absent logic:
        // - Student has a schedule: only mark absent if TODAY is their scheduled day
        // - Student has NO schedule: always show as absent (teacher manually marks who attends)
        const studentSchedules = db.schedules.filter(sc => sc.student_id === s.id);
        const hasAnySchedule = studentSchedules.length > 0;
        const isScheduledToday = studentSchedules.some(sc => sc.day === dayOfWeek);

        if (!hasAnySchedule || isScheduledToday) {
          absent.push({ ...studentData, attendance: null, _autoAbsent: true });
        }
        // else: student has a schedule but not for today → skip (not expected today)
      }
    });

    // Sort present by time if schedule exists, else alphabetically
    present.sort((a, b) => {
      const sa = db.schedules.find(sc => sc.student_id === a.student.id && sc.day === dayOfWeek);
      const sb = db.schedules.find(sc => sc.student_id === b.student.id && sc.day === dayOfWeek);
      if (sa && sb) return sa.time.localeCompare(sb.time);
      return a.student.name.localeCompare(b.student.name);
    });
    absent.sort((a, b) => a.student.name.localeCompare(b.student.name));
    notMarked.sort((a, b) => a.student.name.localeCompare(b.student.name));

    return { present, absent, notMarked, date: dateStr, dayLabel: DAYS[dayOfWeek] };
  }

  /** All unique dates that have any attendance record */
  function getAttendanceDates() {
    const db = Storage.getDB();
    const dates = [...new Set(db.attendance.map(a => a.date))];
    return dates.sort((a, b) => b.localeCompare(a)); // newest first
  }

