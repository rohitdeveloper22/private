/**
 * tasks.js  v6.0
 * NEW: recurring field (none/weekly/monthly), getRecurringTasks()
 */
const Tasks = (() => {
  const PRIORITIES = ['high','medium','low'];
  const RECURRING  = ['none','weekly','monthly'];
  function genId() { return `t_${Date.now()}_${Math.random().toString(36).slice(2,7)}`; }

  function addTask({student_id,title,deadline,priority,notes,recurring}) {
    const trimTitle=(title||'').trim();
    if (!student_id) return {ok:false,error:'student_id required.'};
    if (!trimTitle)  return {ok:false,error:'Title required.'};
    const db=Storage.getDB();
    const task={id:genId(),student_id,title:trimTitle,status:'pending',
      priority:PRIORITIES.includes(priority)?priority:'medium',
      deadline:deadline||'',notes:(notes||'').trim(),
      recurring:RECURRING.includes(recurring)?recurring:'none',
      created_at:new Date().toISOString()};
    db.tasks.push(task); Storage.saveDB(db); return {ok:true,task};
  }

  function updateTask(taskId,{title,deadline,priority,notes,recurring}) {
    const trimTitle=(title||'').trim();
    if (!trimTitle) return {ok:false,error:'Title required.'};
    const db=Storage.getDB(), idx=db.tasks.findIndex(t=>t.id===taskId);
    if (idx===-1) return {ok:false,error:'Task not found.'};
    db.tasks[idx].title=trimTitle; db.tasks[idx].deadline=deadline||'';
    if (PRIORITIES.includes(priority)) db.tasks[idx].priority=priority;
    if (RECURRING.includes(recurring)) db.tasks[idx].recurring=recurring;
    db.tasks[idx].notes=(notes||'').trim(); db.tasks[idx].updated_at=new Date().toISOString();
    Storage.saveDB(db); return {ok:true,task:db.tasks[idx]};
  }

  function updateTaskStatus(taskId,status) {
    if (!['pending','done'].includes(status)) return {ok:false};
    const db=Storage.getDB(), idx=db.tasks.findIndex(t=>t.id===taskId);
    if (idx===-1) return {ok:false};
    db.tasks[idx].status=status; db.tasks[idx].updated_at=new Date().toISOString();
    Storage.saveDB(db); return {ok:true,task:db.tasks[idx]};
  }

  function deleteTask(taskId) {
    const db=Storage.getDB(), idx=db.tasks.findIndex(t=>t.id===taskId);
    if (idx===-1) return {ok:false};
    const deleted=db.tasks.splice(idx,1)[0]; Storage.saveDB(db); return {ok:true,deleted};
  }

  /** Bulk mark multiple tasks as done/pending */
  function bulkUpdateStatus(taskIds,status) {
    if (!['pending','done'].includes(status)) return {ok:false};
    const db=Storage.getDB(); const now=new Date().toISOString();
    taskIds.forEach(id=>{ const idx=db.tasks.findIndex(t=>t.id===id); if(idx!==-1){db.tasks[idx].status=status;db.tasks[idx].updated_at=now;} });
    Storage.saveDB(db); return {ok:true};
  }

  function getTasksByStudent(studentId) {
    return Storage.getDB().tasks.filter(t=>t.student_id===studentId)
      .sort((a,b)=>{
        if (a.status!==b.status) return a.status==='pending'?-1:1;
        const po={high:0,medium:1,low:2};
        const pa=po[a.priority]??1, pb=po[b.priority]??1;
        if (pa!==pb) return pa-pb;
        return new Date(b.created_at)-new Date(a.created_at);
      });
  }

  function getAllPendingTasks() {
    const db=Storage.getDB(), now=new Date();
    return db.tasks.filter(t=>t.status==='pending').sort((a,b)=>{
      const da=a.deadline?new Date(a.deadline):null;
      const db2=b.deadline?new Date(b.deadline):null;
      const aO=da&&da<now, bO=db2&&db2<now;
      if (aO!==bO) return aO?-1:1;
      const po={high:0,medium:1,low:2};
      const pa=po[a.priority]??1, pb=po[b.priority]??1;
      if (pa!==pb) return pa-pb;
      if (da&&db2) return da-db2;
      return new Date(a.created_at)-new Date(b.created_at);
    });
  }

  function getAllTasks(filter='pending') {
    const db=Storage.getDB(), now=new Date(); let list=db.tasks.slice();
    if (filter==='pending') list=list.filter(t=>t.status==='pending');
    else if (filter==='done')    list=list.filter(t=>t.status==='done');
    else if (filter==='overdue') list=list.filter(t=>t.status==='pending'&&t.deadline&&new Date(t.deadline)<now);
    else if (filter==='recurring') list=list.filter(t=>t.recurring&&t.recurring!=='none');
    return list.sort((a,b)=>{
      if (a.status!==b.status) return a.status==='pending'?-1:1;
      const po={high:0,medium:1,low:2};
      const pa=po[a.priority]??1, pb=po[b.priority]??1;
      if (pa!==pb) return pa-pb;
      return new Date(b.created_at)-new Date(a.created_at);
    });
  }

  function getTodayTaskCount() {
    const today=new Date().toISOString().slice(0,10);
    return Storage.getDB().tasks.filter(t=>t.deadline&&t.deadline.slice(0,10)===today).length;
  }
  function getOverdueCount() {
    const now=new Date();
    return Storage.getDB().tasks.filter(t=>t.status==='pending'&&t.deadline&&new Date(t.deadline)<now).length;
  }
  function getCompletionRate() {
    const db=Storage.getDB();
    if (!db.tasks.length) return 0;
    return Math.round(db.tasks.filter(t=>t.status==='done').length/db.tasks.length*100);
  }
  function getTasksDueTomorrow() {
    const tomorrow=new Date(); tomorrow.setDate(tomorrow.getDate()+1);
    const tStr=tomorrow.toISOString().slice(0,10);
    return Storage.getDB().tasks.filter(t=>t.status==='pending'&&t.deadline&&t.deadline.slice(0,10)===tStr);
  }

  return { addTask, updateTask, updateTaskStatus, deleteTask, bulkUpdateStatus,
           getTasksByStudent, getAllPendingTasks, getAllTasks,
           getTodayTaskCount, getOverdueCount, getCompletionRate, getTasksDueTomorrow };
})();
