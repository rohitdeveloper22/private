/**
 * ui.js  v8.0
 * Sprint 3: Web Push notifications + fee reminder WhatsApp
 * Sprint 4: Weekly schedule, today's classes on dashboard, partial payment tracking
 * Sprint 5: Skill level badge, syllabus checklist, class star rating, monthly income screen
 * Sprint 6: Revenue bar chart, attendance leaderboard, task completion rates, global search
 * Sprint 7: Growth summary card, rating sparkline, quick-log bottom sheet
 * Sprint 8: Goal/milestone system, achievement cards, shareable progress report, IndexedDB
 */
const UI = (() => {

  /* ─── Helpers ────────────────────────────────────────────── */
  function getInitials(n) { return (n||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }
  function formatDate(s) {
    if (!s) return '—';
    try { const d=new Date(s); return isNaN(d)?'—':d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); } catch { return '—'; }
  }
  function formatDateShort(s) {
    if (!s) return '—';
    try { const d=new Date(s+'T00:00:00'); return isNaN(d)?'—':d.toLocaleDateString('en-IN',{day:'numeric',month:'short'}); } catch { return '—'; }
  }
  function isOverdue(d) { if (!d) return false; try { return new Date(d)<new Date(); } catch { return false; } }
  function el(tag,cls,html) { const e=document.createElement(tag); if(cls)e.className=cls; if(html!==undefined)e.innerHTML=html; return e; }
  function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function showToast(msg,type='',undoFn=null) {
    const t=document.getElementById('toast');
    t.className=`toast ${type}`;
    if (undoFn) {
      t.innerHTML=`<span>${msg}</span><button class="toast-undo-btn" id="toast-undo">Undo</button>`;
      t.querySelector('#toast-undo').addEventListener('click',()=>{ clearTimeout(UI._toastTimer); t.classList.remove('show'); undoFn(); });
    } else {
      t.textContent=msg;
    }
    void t.offsetWidth; t.classList.add('show'); clearTimeout(UI._toastTimer);
    UI._toastTimer=setTimeout(()=>t.classList.remove('show'), undoFn?4000:2400);
  }
  function formatFee(a) { return (!a||a===0)?null:`₹${Number(a).toLocaleString('en-IN')}`; }
  function avatarStyle(color) {
    if (!color) return '';
    const r=parseInt(color.slice(1,3),16),g=parseInt(color.slice(3,5),16),b=parseInt(color.slice(5,7),16);
    return `style="background:rgba(${r},${g},${b},0.18);color:${color};"`;
  }
  const PM = { high:{label:'High',cls:'priority-high',dot:'🔴'}, medium:{label:'Medium',cls:'priority-medium',dot:'🟡'}, low:{label:'Low',cls:'priority-low',dot:'🟢'} };
  const FM = { paid:{label:'Paid',cls:'fee-paid'}, unpaid:{label:'Unpaid',cls:'fee-unpaid'}, partial:{label:'Partial',cls:'fee-partial'} };

  /* ─── Theme ──────────────────────────────────────────────── */
  function applyTheme(theme) {
    document.body.classList.toggle('light-theme',theme==='light');
    const btn=document.getElementById('btn-theme');
    if (btn) btn.textContent=theme==='light'?'🌙':'☀️';
  }

  /* ─── Offline Badge ──────────────────────────────────────── */
  function initOfflineBadge() {
    const badge=document.getElementById('offline-badge'); if (!badge) return;
    function u() { badge.style.display=navigator.onLine?'none':'flex'; }
    window.addEventListener('online',u); window.addEventListener('offline',u); u();
  }

  /* ─── Modal ──────────────────────────────────────────────── */
  function openModal(title,bodyHTML) {
    document.getElementById('modal-title').textContent=title;
    document.getElementById('modal-body').innerHTML=bodyHTML;
    document.getElementById('modal-overlay').classList.add('open');
  }
  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    document.getElementById('modal-body').innerHTML='';
  }

  function getGreeting() { const h=new Date().getHours(); return h<12?'Good morning':h<17?'Good afternoon':'Good evening'; }

  /* ─── Onboarding ─────────────────────────────────────────── */
  function renderOnboarding() {
    const screen=document.getElementById('screen-onboarding'); if (!screen) return;
    screen.innerHTML=`
      <div class="onboarding-wrap">
        <span class="logo-mark onboarding-diamond">♦</span>
        <h1 class="onboarding-title">Welcome to ChordStar</h1>
        <p class="onboarding-subtitle">Your personal music studio manager.</p>
        <ul class="onboarding-features">
          <li>🎸 Track students &amp; progress</li>
          <li>📅 Weekly class schedule</li>
          <li>💰 Fee &amp; income tracking</li>
          <li>📊 Analytics &amp; reports</li>
        </ul>
        <button class="btn btn-primary onboarding-cta" id="btn-ob-start">+ Add Your First Student</button>
        <button class="link-btn onboarding-skip" id="btn-ob-skip">Skip, I'll add later</button>
      </div>`;
    setTimeout(()=>{
      document.getElementById('btn-ob-start').addEventListener('click',()=>{
        Storage.setOnboardingDone(); App.navigate('students');
        setTimeout(()=>showAddStudentWizard(()=>App.navigate('dashboard')),100);
      });
      document.getElementById('btn-ob-skip').addEventListener('click',()=>{ Storage.setOnboardingDone(); App.navigate('dashboard'); });
    },50);
  }

  /* ─── SPRINT 3: Web Push ─────────────────────────────────── */
  const VAPID_PUBLIC_KEY = null; // Set your VAPID key here to enable real push

  async function requestPushPermission() {
    if (!('Notification' in window)) { showToast('Push not supported on this device','error'); return false; }
    const perm = await Notification.requestPermission();
    if (perm==='granted') { showToast('🔔 Notifications enabled!','success'); scheduleDailyCheck(); return true; }
    showToast('Notifications blocked','error'); return false;
  }

  function getPushEnabled() { return localStorage.getItem('cs_push')==='1' && Notification.permission==='granted'; }
  function setPushEnabled(v) { localStorage.setItem('cs_push',v?'1':'0'); }

  /** Schedule local notification for tomorrow's deadlines (runs at page open) */
  function scheduleDailyCheck() {
    if (!getPushEnabled()) return;
    const due = Tasks.getTasksDueTomorrow();
    if (due.length===0) return;
    due.forEach(task=>{
      const student = Students.getStudentById(task.student_id);
      // For deployed apps with SW: use SW postMessage to schedule
      // For now: show in-app toast as fallback
      console.log('[Push] Due tomorrow:', task.title, student?.name);
    });
    // Show summary toast
    showToast(`🔔 ${due.length} task${due.length>1?'s':''} due tomorrow!`,'warn');
  }

  /* ─── Dashboard ──────────────────────────────────────────── */
  function renderDashboard() {
    const g=document.getElementById('greeting-text'); if (g) g.textContent=getGreeting();

    const students=Students.getStudents();
    const allPending=Tasks.getAllPendingTasks();
    const doneCount=Tasks.getAllTasks('done').length;
    const overdueCount=Tasks.getOverdueCount();
    const rate=Tasks.getCompletionRate();
    const rev=Students.getMonthlyRevenueSummary();

    /* Stats grid */
    const statsGrid=document.getElementById('stats-grid');
    if (statsGrid) {
      const revC=rev.collected?`₹${Number(rev.collected).toLocaleString('en-IN')}`:'—';
      const unpaidAmt=rev.uncollected>0?`₹${Number(rev.uncollected).toLocaleString('en-IN')}`:'';
      statsGrid.innerHTML=`
        <div class="stat-card accent clickable" id="sc-students"><span class="stat-icon">🎸</span><span class="stat-value">${students.length}</span><span class="stat-label">Students</span></div>
        <div class="stat-card orange clickable" id="sc-pending"><span class="stat-icon">📋</span><span class="stat-value">${allPending.length}</span><span class="stat-label">Pending</span></div>
        <div class="stat-card ${overdueCount>0?'red clickable':'green'}" id="sc-overdue"><span class="stat-icon">${overdueCount>0?'⚠️':'✅'}</span><span class="stat-value">${overdueCount>0?overdueCount:rate+'%'}</span><span class="stat-label">${overdueCount>0?'Overdue':'Done rate'}</span></div>
        <div class="stat-card green clickable" id="sc-today"><span class="stat-icon">✅</span><span class="stat-value">${doneCount}</span><span class="stat-label">Tasks Done</span></div>
        <div class="stat-card green clickable" id="sc-collected"><span class="stat-icon">💰</span><span class="stat-value amount">${revC}</span><span class="stat-label">Collected</span></div>
        <div class="stat-card ${rev.unpaidCount>0?'red clickable':'green'}" id="sc-unpaid"><span class="stat-icon">${rev.unpaidCount>0?'⏳':'🎉'}</span><span class="stat-value">${rev.unpaidCount>0?rev.unpaidCount:'✓'}</span><span class="stat-label">${rev.unpaidCount>0?'Unpaid':'All paid!'}</span>${rev.unpaidCount>0&&unpaidAmt?`<span class="stat-sub">${unpaidAmt} pending</span>`:''}</div>
      `;
      statsGrid.querySelector('#sc-students')?.addEventListener('click',()=>App.navigate('students'));
      statsGrid.querySelector('#sc-pending')?.addEventListener('click',()=>{ App.navigate('tasks'); setTimeout(()=>_setTaskFilter('pending'),80); });
      if (overdueCount>0) statsGrid.querySelector('#sc-overdue')?.addEventListener('click',()=>{ App.navigate('tasks'); setTimeout(()=>_setTaskFilter('overdue'),80); });
      statsGrid.querySelector('#sc-today')?.addEventListener('click',()=>{ App.navigate('tasks'); setTimeout(()=>_setTaskFilter('done'),80); });
      statsGrid.querySelector('#sc-collected')?.addEventListener('click',()=>showCollectedModal());
      if (rev.unpaidCount>0) statsGrid.querySelector('#sc-unpaid')?.addEventListener('click',()=>showUnpaidStudentsModal());
    }

    /* Today's classes — Sprint 4 */
    const todayClasses=Students.getTodayClasses();
    const todaySection=document.getElementById('today-classes-section');
    if (todaySection) {
      if (todayClasses.length===0) {
        todaySection.innerHTML=`<div class="section-header"><h2 class="section-title">Today's Classes</h2></div><div class="empty-state" style="padding:16px 0"><span class="empty-icon" style="font-size:24px">📅</span><div class="empty-desc">No classes scheduled today.</div></div>`;
      } else {
        todaySection.innerHTML=`<div class="section-header"><h2 class="section-title">Today's Classes</h2><span class="section-badge">${todayClasses.length}</span></div>`;
        const list=el('div','today-class-list');
        todayClasses.forEach(c=>{
          const item=el('div','today-class-item');
          const aStyle=avatarStyle(c.studentColor);
          item.innerHTML=`
            <div class="today-class-avatar" ${aStyle}>${getInitials(c.studentName)}</div>
            <div class="today-class-info">
              <span class="today-class-name">${escHtml(c.studentName)}</span>
              <span class="today-class-time">⏰ ${c.time} · ${c.duration_min} min</span>
            </div>
            <button class="quick-log-btn" data-sid="${c.student_id}" title="Log this session">📝 Log</button>`;
          item.querySelector('.quick-log-btn')?.addEventListener('click',(e)=>{ e.stopPropagation(); showQuickLogSheet(c.student_id,()=>{renderDashboard();}); });
          item.addEventListener('click',()=>{ const s=Students.getStudents().find(x=>x.id===c.student_id); if(s) App.navigate('detail',s.id); });
          list.appendChild(item);
        });
        todaySection.appendChild(list);
      }
    }

    /* Pending tasks */
    const badge=document.getElementById('pending-badge'); if (badge) badge.textContent=allPending.length;
    const dot=document.getElementById('nav-tasks-dot'); if (dot) dot.style.display=overdueCount>0?'block':'none';

    const qa=document.getElementById('quick-actions');
    if (qa) {
      qa.innerHTML=`
        <button class="quick-btn" id="qa-add"><div class="quick-btn-icon yellow">🎓</div><div class="quick-btn-text"><span class="quick-btn-label">Add Student</span><span class="quick-btn-desc">Enroll a new student</span></div></button>
        <button class="quick-btn" id="qa-analytics"><div class="quick-btn-icon orange">📊</div><div class="quick-btn-text"><span class="quick-btn-label">Analytics</span><span class="quick-btn-desc">Revenue &amp; insights</span></div></button>
        <button class="quick-btn" id="qa-export"><div class="quick-btn-icon green">💾</div><div class="quick-btn-text"><span class="quick-btn-label">Export Data</span><span class="quick-btn-desc">Backup your studio</span></div></button>
      `;
      document.getElementById('qa-add').addEventListener('click',()=>showAddStudentWizard(()=>{renderDashboard();renderStudents();}));
      document.getElementById('qa-analytics').addEventListener('click',()=>App.navigate('analytics'));
      document.getElementById('qa-export').addEventListener('click',()=>showExportModal());
    }

    /* Sprint 8: Goals due this month widget */
    const goalsDue=Students.getGoalsDueThisMonth();
    const overdueGoals=Students.getOverdueGoals();
    const goalsSection=document.getElementById('dashboard-goals-section');
    if (goalsSection) {
      const allDash=[...overdueGoals.slice(0,2),...goalsDue.filter(g=>!overdueGoals.find(o=>o.id===g.id)).slice(0,3)];
      if (allDash.length>0) {
        goalsSection.innerHTML='<div class="section-header"><h2 class="section-title">🎯 Goals</h2><span class="section-badge">'+allDash.length+'</span></div>';
        const glist=el('div','goal-dash-list');
        allDash.forEach(g=>{
          const overdue=overdueGoals.find(o=>o.id===g.id);
          const item=el('div','goal-dash-item'+(overdue?' overdue':''));
          const aStyle=avatarStyle(g.studentColor||'#888');
          item.innerHTML='<div class="goal-dash-avatar" '+aStyle+'>'+getInitials(g.studentName)+'</div>'
            +'<div class="goal-dash-body"><span class="goal-dash-title">'+escHtml(g.title)+'</span>'
            +'<span class="goal-dash-meta">'+escHtml(g.studentName)+(g.deadline?' · '+(overdue?'⚠ Overdue: ':'Due: ')+formatDateShort(g.deadline):'')+'</span></div>';
          item.addEventListener('click',()=>App.navigate('detail',g.student_id));
          glist.appendChild(item);
        });
        goalsSection.appendChild(glist);
      } else { goalsSection.innerHTML=''; }
    }

    const dashTasks=document.getElementById('dashboard-tasks');
    if (dashTasks) {
      const display=allPending.slice(0,5);
      if (display.length===0) {
        dashTasks.innerHTML='<div class="empty-state"><span class="empty-icon">✅</span><div class="empty-title">All caught up!</div><div class="empty-desc">No pending tasks right now.</div></div>';
      } else {
        dashTasks.innerHTML='';
        display.forEach(task=>{
          const student=Students.getStudentById(task.student_id);
          dashTasks.appendChild(renderTaskCard(task,{
            showStudent:true, studentName:student?student.name:'Unknown',
            onToggle:(id,status)=>{ Tasks.updateTaskStatus(id,status); renderDashboard(); showToast(status==='done'?'Task done ✓':'Task reopened',status==='done'?'success':''); }
          }));
        });
      }
    }
  }

  /* ─── Students Screen ────────────────────────────────────── */
  let _studentFilter='all', _studentSearch='', _studentSort='name';

  function renderStudents() {
    const list=document.getElementById('student-list');
    const countLabel=document.getElementById('students-count-label');
    // Render sort select if not yet present
    const sortWrap=document.querySelector('#student-sort-wrap');
    if (!sortWrap) {
      const swrap=document.createElement('div'); swrap.id='student-sort-wrap'; swrap.className='sort-wrap';
      swrap.innerHTML=`<label class="sort-label">Sort:</label>
        <select class="sort-select" id="student-sort-sel">
          <option value="name">A–Z</option>
          <option value="fee_unpaid">Unpaid First</option>
          <option value="skill">Skill Level</option>
          <option value="newest">Newest First</option>
          <option value="pending">Most Tasks</option>
        </select>`;
      const sbw=document.querySelector('.search-bar-wrap');
      if (sbw) sbw.parentNode.insertBefore(swrap, sbw.nextSibling);
      swrap.querySelector('#student-sort-sel').addEventListener('change',e=>{ _studentSort=e.target.value; renderStudents(); });
    } else {
      const sel=document.querySelector('#student-sort-sel');
      if (sel && sel.value!==_studentSort) sel.value=_studentSort;
    }
    let students=Students.getStudents(_studentFilter);
    const q=_studentSearch.trim().toLowerCase();
    if (q) students=students.filter(s=>s.name.toLowerCase().includes(q)||(s.phone||'').includes(q));
    // Apply sort
    if (_studentSort==='name')       students.sort((a,b)=>a.name.localeCompare(b.name));
    else if (_studentSort==='newest')  students.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    else if (_studentSort==='fee_unpaid') students.sort((a,b)=>{ const o={unpaid:0,partial:1,paid:2}; return (o[a.fee_status]??0)-(o[b.fee_status]??0); });
    else if (_studentSort==='skill')  students.sort((a,b)=>{ const db=Storage.getDB(); const sa=db.skill_levels.find(x=>x.student_id===a.id); const sb2=db.skill_levels.find(x=>x.student_id===b.id); return (sb2?sb2.level:0)-(sa?sa.level:0); });
    else if (_studentSort==='pending') students.sort((a,b)=>{ const ta=Tasks.getTasksByStudent(a.id).filter(t=>t.status==='pending').length; const tb=Tasks.getTasksByStudent(b.id).filter(t=>t.status==='pending').length; return tb-ta; });
    if (countLabel) countLabel.textContent=`${Students.getStudents().length} enrolled`;
    if (!list) return; list.innerHTML='';
    if (students.length===0) {
      list.innerHTML=`<div class="empty-state"><span class="empty-icon">🎸</span><div class="empty-title">${q||_studentFilter!=='all'?'No results found':'No students yet'}</div><div class="empty-desc">${q||_studentFilter!=='all'?'Try a different search.':'Tap the <strong>+</strong> button to add your first student.'}</div></div>`;
      return;
    }
    students.forEach(student=>{
      const tasks=Tasks.getTasksByStudent(student.id);
      const pending=tasks.filter(t=>t.status==='pending').length;
      const inactive=(student.status||'active')==='inactive';
      const feeMeta=FM[student.fee_status]||FM.unpaid;
      const feeAmt=formatFee(student.fee_amount);
      const skillLevel=Students.getSkillLevel(student.id);
      const skillLabel=Students.getSkillStages()[skillLevel]||'Beginner';
      const sylComp=Students.getSyllabusCompletion(student.id);
      const streak=Students.getAttendanceStreak(student.id);

      const wrapper=el('div','swipe-wrapper');
      const delLayer=el('div','swipe-delete-layer');
      delLayer.innerHTML=`<span>🗑</span><span style="font-size:11px">Delete</span>`;
      delLayer.addEventListener('click',e=>{ e.stopPropagation(); if(confirm(`Delete ${student.name}?`)){
          const snapshot=JSON.parse(JSON.stringify(Storage.getDB()));
          Students.deleteStudent(student.id); renderStudents(); renderDashboard();
          showToast('Student deleted','',()=>{ Storage.saveDB(snapshot); renderStudents(); renderDashboard(); showToast('Restored ✓','success'); });
        }});
      const card=el('div',`student-card swipeable ${inactive?'inactive':''}`);
      const aStyle=avatarStyle(student.color);
      card.innerHTML=`
        <div class="student-avatar ${inactive?'dim':''}" ${aStyle}>${getInitials(student.name)}</div>
        <div class="student-info">
          <span class="student-name">${escHtml(student.name)}${inactive?' <span class="status-chip inactive-chip">Inactive</span>':''}</span>
          <span class="student-phone">${escHtml(student.phone||'No phone')}</span>
          <div class="student-meta-chips">
            <span class="skill-chip">${skillLabel}</span>
            ${sylComp.pct!==null?`<span class="syllabus-pct-chip ${sylComp.pct===100?'complete':sylComp.pct>=50?'half':'low'}">${sylComp.pct}%</span>`:''}
            ${streak>=3?`<span class="streak-chip">🔥${streak}</span>`:''}
            ${feeAmt?`<span class="fee-inline ${feeMeta.cls}">${feeAmt} · ${feeMeta.label}</span>`:''}
          </div>
        </div>
        <span class="student-tasks-badge ${pending===0?'none':''}">${pending===0?'✓':`${pending} tasks`}</span>
        <span class="student-arrow">›</span>`;
      card.addEventListener('click',()=>App.navigate('detail',student.id));
      wrapper.appendChild(delLayer); wrapper.appendChild(card);
      _initSwipe(card,wrapper);
      list.appendChild(wrapper);
    });
  }

  function _initSwipe(card) {
    let startX=0,startY=0,deltaX=0,swiping=false,swipeOpen=false; const TH=72;
    card.addEventListener('touchstart',e=>{ startX=e.touches[0].clientX; startY=e.touches[0].clientY; deltaX=0; swiping=false; },{passive:true});
    card.addEventListener('touchmove',e=>{ const dx=e.touches[0].clientX-startX,dy=e.touches[0].clientY-startY; if(!swiping&&Math.abs(dy)>Math.abs(dx))return; swiping=true; deltaX=dx; card.style.transform=`translateX(${Math.max(-TH-20,Math.min(0,dx+(swipeOpen?-TH:0)))}px)`; card.style.transition='none'; },{passive:true});
    card.addEventListener('touchend',()=>{ card.style.transition=''; const e=swipeOpen?deltaX-TH:deltaX; if(e<-TH/2){card.style.transform=`translateX(-${TH}px)`;swipeOpen=true;}else{card.style.transform='translateX(0)';swipeOpen=false;} });
  }

  /* ─── Tasks Screen ───────────────────────────────────────── */
  let _taskFilter='pending', _taskSearch='', _bulkMode=false, _bulkSelected=new Set();

  function _setTaskFilter(f) {
    _taskFilter=f;
    document.querySelectorAll('#tasks-filter-chips .chip').forEach(c=>c.classList.toggle('active',c.dataset.tfilter===f));
    renderAllTasks();
  }

  function renderAllTasks() {
    const list=document.getElementById('all-tasks-list');
    const countLabel=document.getElementById('tasks-count-label');
    let tasks=Tasks.getAllTasks(_taskFilter);
    const q=_taskSearch.trim().toLowerCase();
    if (q) tasks=tasks.filter(t=>{ const s=Students.getStudentById(t.student_id); return t.title.toLowerCase().includes(q)||(s&&s.name.toLowerCase().includes(q)); });
    if (countLabel) countLabel.textContent=`${Tasks.getAllPendingTasks().length} pending`;

    // Bulk action bar
    let bulkBar=document.getElementById('bulk-action-bar');
    if (!bulkBar) {
      bulkBar=document.createElement('div'); bulkBar.id='bulk-action-bar'; bulkBar.className='bulk-bar hidden';
      bulkBar.innerHTML=`<span class="bulk-count" id="bulk-count-label">0 selected</span>
        <button class="bulk-btn bulk-done" id="bulk-done-btn">✓ Mark Done</button>
        <button class="bulk-btn bulk-cancel" id="bulk-cancel-btn">Cancel</button>`;
      const screen=document.getElementById('screen-tasks');
      if (screen) screen.insertBefore(bulkBar, screen.querySelector('.screen-scroll'));
    }
    // Bulk mode toggle button
    let bulkToggle=document.getElementById('bulk-toggle-btn');
    if (!bulkToggle && tasks.filter(t=>t.status==='pending').length>0) {
      bulkToggle=document.createElement('button'); bulkToggle.id='bulk-toggle-btn'; bulkToggle.className='bulk-toggle-btn';
      bulkToggle.textContent='Select';
      document.querySelector('#screen-tasks .screen-hero')?.appendChild(bulkToggle);
    }
    if (bulkToggle) {
      bulkToggle.onclick=()=>{ _bulkMode=!_bulkMode; _bulkSelected.clear(); bulkToggle.textContent=_bulkMode?'Cancel':'Select'; if(!_bulkMode)bulkBar.classList.add('hidden'); renderAllTasks(); };
    }

    document.getElementById('bulk-done-btn')?.addEventListener('click',()=>{
      if (!_bulkSelected.size) return;
      const snap=JSON.parse(JSON.stringify(Storage.getDB()));
      Tasks.bulkUpdateStatus([..._bulkSelected],'done');
      const n=_bulkSelected.size; _bulkSelected.clear(); _bulkMode=false;
      if(bulkToggle)bulkToggle.textContent='Select';
      bulkBar.classList.add('hidden');
      renderAllTasks(); renderDashboard();
      showToast(`${n} task${n>1?'s':''} done ✓`,'success',()=>{ Storage.saveDB(snap); renderAllTasks(); renderDashboard(); showToast('Restored ✓','success'); });
    });
    document.getElementById('bulk-cancel-btn')?.addEventListener('click',()=>{ _bulkMode=false; _bulkSelected.clear(); if(bulkToggle)bulkToggle.textContent='Select'; bulkBar.classList.add('hidden'); renderAllTasks(); });

    if (!list) return; list.innerHTML='';
    if (tasks.length===0) {
      list.innerHTML=`<div class="empty-state"><span class="empty-icon">📋</span><div class="empty-title">${q?'No results':'No tasks here'}</div><div class="empty-desc">${q?'Try different search.':'Nothing in this category.'}</div></div>`;
      return;
    }
    tasks.forEach(task=>{
      const student=Students.getStudentById(task.student_id);
      if (_bulkMode && task.status==='pending') {
        const wrap=document.createElement('div'); wrap.className='bulk-task-row';
        const cb=document.createElement('input'); cb.type='checkbox'; cb.className='bulk-checkbox';
        cb.checked=_bulkSelected.has(task.id);
        cb.addEventListener('change',()=>{
          if(cb.checked) _bulkSelected.add(task.id); else _bulkSelected.delete(task.id);
          document.getElementById('bulk-count-label').textContent=`${_bulkSelected.size} selected`;
          bulkBar.classList.toggle('hidden',_bulkSelected.size===0);
        });
        wrap.appendChild(cb);
        wrap.appendChild(renderTaskCard(task,{showStudent:true,studentName:student?student.name:'Unknown'}));
        list.appendChild(wrap);
      } else {
        list.appendChild(renderTaskCard(task,{
          showStudent:true, studentName:student?student.name:'Unknown',
          onToggle:(id,status)=>{ Tasks.updateTaskStatus(id,status); renderAllTasks(); renderDashboard(); showToast(status==='done'?'Task done ✓':'Task reopened',status==='done'?'success':''); },
          onDelete:(id)=>{ const snap=JSON.parse(JSON.stringify(Storage.getDB())); Tasks.deleteTask(id); renderAllTasks(); renderDashboard(); showToast('Task deleted','',()=>{ Storage.saveDB(snap); renderAllTasks(); renderDashboard(); showToast('Restored ✓','success'); }); }
        }));
      }
    });
  }

  /* ─── Sprint 6: Analytics Screen ────────────────────────── */
  function renderAnalytics() {
    const container=document.getElementById('screen-analytics');
    if (!container) return;
    container.innerHTML='';

    const db=Storage.getDB();
    const activeStudents=db.students.filter(s=>(s.status||'active')==='active');
    const now=new Date();
    const prefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthLabel=now.toLocaleDateString('en-IN',{month:'long',year:'numeric'});

    const scroll=el('div','screen-scroll');
    scroll.innerHTML=`<div class="screen-hero"><h1 class="hero-title">Performance</h1><p class="hero-sub">Student progress & insights</p></div>`;

    /* ── 1. OVERVIEW STATS ROW */
    const totalStudents=activeStudents.length;
    const allTasks=db.tasks.filter(t=>activeStudents.some(s=>s.id===t.student_id));
    const doneTasks=allTasks.filter(t=>t.status==='done').length;
    const overallTaskRate=allTasks.length>0?Math.round(doneTasks/allTasks.length*100):0;
    const monthAtt=db.attendance.filter(a=>a.date.startsWith(prefix));
    const attRate=monthAtt.length>0?Math.round(monthAtt.filter(a=>a.type==='attended').length/monthAtt.length*100):0;
    const SKILL_STAGES=['Beginner','Elementary','Intermediate','Advanced','Expert'];

    const overviewSection=el('div','analytics-section');
    overviewSection.innerHTML=`
      <div class="section-header"><h2 class="section-title">\u{1F4CA} This Month</h2><span class="section-badge">${monthLabel}</span></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-top:4px;">
        <div style="background:var(--bg-card);border-radius:12px;padding:14px 10px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:var(--accent);">${totalStudents}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Students</div>
        </div>
        <div style="background:var(--bg-card);border-radius:12px;padding:14px 10px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:${attRate>=75?'#2ecc71':attRate>=50?'#f39c12':'#e74c3c'};">${attRate}%</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Attendance</div>
        </div>
        <div style="background:var(--bg-card);border-radius:12px;padding:14px 10px;text-align:center;">
          <div style="font-size:26px;font-weight:800;color:${overallTaskRate>=75?'#2ecc71':overallTaskRate>=50?'#f39c12':'#e74c3c'};">${overallTaskRate}%</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Tasks Done</div>
        </div>
      </div>`;

    /* ── 1b. MONTHLY TREND CHART (Canvas) */
    const chartSection=el('div','analytics-section');
    chartSection.innerHTML=`<div class="section-header"><h2 class="section-title">📈 6-Month Trend</h2></div>`;
    const canvasWrap=el('div','chart-canvas-wrap');
    const canvas=document.createElement('canvas'); canvas.id='trend-chart'; canvas.className='trend-canvas';
    canvasWrap.appendChild(canvas); chartSection.appendChild(canvasWrap);
    scroll.appendChild(overviewSection);
    scroll.appendChild(chartSection);
    // Draw chart after DOM is ready
    requestAnimationFrame(()=>_drawTrendChart(canvas, db, activeStudents));

    /* ── 2. STUDENT PERFORMANCE CARDS */
    const perfSection=el('div','analytics-section');
    perfSection.innerHTML=`<div class="section-header"><h2 class="section-title">\u{1F3AF} Student Performance</h2></div>`;

    if (activeStudents.length===0) {
      perfSection.innerHTML+=`<div class="empty-state" style="padding:16px 0"><div class="empty-desc">No students yet.</div></div>`;
    } else {
      const perfList=el('div','rate-list');
      activeStudents.sort((a,b)=>a.name.localeCompare(b.name)).forEach(s=>{
        const attRecs=db.attendance.filter(a=>a.student_id===s.id&&a.date.startsWith(prefix));
        const attAtt=attRecs.filter(a=>a.type==='attended').length;
        const attTotal=attRecs.length;
        const attPct=attTotal>0?Math.round(attAtt/attTotal*100):null;

        const sTasks=db.tasks.filter(t=>t.student_id===s.id);
        const sDone=sTasks.filter(t=>t.status==='done').length;
        const sPending=sTasks.filter(t=>t.status==='pending').length;
        const sTaskRate=sTasks.length>0?Math.round(sDone/sTasks.length*100):null;

        const skillEntry=db.skill_levels.find(x=>x.student_id===s.id);
        const skillIdx=skillEntry?skillEntry.level:0;
        const skillLabel=SKILL_STAGES[skillIdx]||'Beginner';
        const skillColor=['#95a5a6','#3498db','#2ecc71','#f39c12','#e74c3c'][skillIdx]||'#95a5a6';

        const progressCount=(db.progress_history||[]).filter(p=>p.student_id===s.id&&p.date.startsWith(prefix)).length;

        const attScore=attPct!==null?attPct:50;
        const taskScore=sTaskRate!==null?sTaskRate:50;
        const overallScore=Math.round((attScore*0.5)+(taskScore*0.5));
        const scoreColor=overallScore>=75?'#2ecc71':overallScore>=50?'#f39c12':'#e74c3c';

        const card=el('div','rate-item');
        card.style.cssText='cursor:pointer;';
        card.innerHTML=`
          <div class="rate-header" style="margin-bottom:8px;">
            <div class="lb-avatar" style="width:34px;height:34px;font-size:13px;flex-shrink:0;" ${avatarStyle(s.color)}>${getInitials(s.name)}</div>
            <span class="rate-name" style="font-size:15px;">${escHtml(s.name)}</span>
            <span style="font-size:13px;font-weight:800;color:${scoreColor};">${overallScore}%</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
            <div style="background:var(--card);border-radius:8px;padding:7px 10px;">
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">\u{1F4C5} Attendance</div>
              <div style="font-size:14px;font-weight:700;color:${attPct===null?'var(--text-muted)':attPct>=75?'#2ecc71':attPct>=50?'#f39c12':'#e74c3c'};">${attPct!==null?attPct+'%':'\u2014'}</div>
              <div style="font-size:10px;color:var(--text-muted);">${attTotal>0?attAtt+'/'+attTotal+' classes':'No data'}</div>
            </div>
            <div style="background:var(--card);border-radius:8px;padding:7px 10px;">
              <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">\u{1F4CB} Tasks</div>
              <div style="font-size:14px;font-weight:700;color:${sTaskRate===null?'var(--text-muted)':sTaskRate>=75?'#2ecc71':sTaskRate>=50?'#f39c12':'#e74c3c'};">${sTaskRate!==null?sTaskRate+'%':'\u2014'}</div>
              <div style="font-size:10px;color:var(--text-muted);">${sTasks.length>0?sDone+' done \u00b7 '+sPending+' pending':'No tasks'}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
            <span style="font-size:10px;color:var(--text-muted);">Overall Score</span>
            <span style="font-size:10px;color:var(--text-muted);">${progressCount} lesson${progressCount!==1?'s':''} this month</span>
          </div>
          <div style="background:var(--bg3);border-radius:6px;height:6px;overflow:hidden;">
            <div style="height:100%;width:${overallScore}%;background:${scoreColor};border-radius:6px;"></div>
          </div>
          <div style="margin-top:8px;display:flex;align-items:center;justify-content:space-between;">
            <span style="font-size:11px;padding:3px 9px;border-radius:6px;background:${skillColor}22;color:${skillColor};font-weight:600;border:1px solid ${skillColor}44;">${skillLabel}</span>
            <span style="font-size:11px;color:var(--text-muted);">Tap to view ›</span>
          </div>`;
        card.addEventListener('click',()=>App.navigate('detail',s.id));
        perfList.appendChild(card);
      });
      perfSection.appendChild(perfList);
    }
    scroll.appendChild(perfSection);

    /* ── 3. BEST ATTENDANCE LEADERBOARD */
    const attSection=el('div','analytics-section');
    attSection.innerHTML=`<div class="section-header"><h2 class="section-title">\u{1F3C6} Best Attendance</h2><span class="section-badge">This Month</span></div>`;
    const topAtt=Students.getTopAttendanceStudents(5);
    if (topAtt.length===0) {
      attSection.innerHTML+=`<div class="empty-state" style="padding:16px 0"><div class="empty-desc">Koi attendance data nahi abhi tak.</div></div>`;
    } else {
      const attList=el('div','leaderboard');
      topAtt.forEach((s,i)=>{
        const item=el('div','leaderboard-item');
        const medal=['\u{1F947}','\u{1F948}','\u{1F949}','4.','5.'][i]||`${i+1}.`;
        const barColor=s.rate>=75?'#2ecc71':s.rate>=50?'#f39c12':'#e74c3c';
        item.innerHTML=`
          <span class="lb-rank">${medal}</span>
          <div class="lb-avatar" ${avatarStyle(s.color)}>${getInitials(s.name)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;">${escHtml(s.name)}</div>
            <div style="background:var(--bg3);border-radius:4px;height:4px;margin-top:4px;overflow:hidden;"><div style="height:100%;width:${s.rate||0}%;background:${barColor};border-radius:4px;"></div></div>
          </div>
          <span class="lb-value" style="color:${barColor};">${s.attended}/${s.total} (${s.rate!==null?s.rate+'%':'\u2014'})</span>`;
        item.addEventListener('click',()=>App.navigate('detail',s.id));
        attList.appendChild(item);
      });
      attSection.appendChild(attList);
    }
    scroll.appendChild(attSection);

    /* ── 4. TASK CHAMPIONS */
    const taskSection=el('div','analytics-section');
    taskSection.innerHTML=`<div class="section-header"><h2 class="section-title">\u{1F4CB} Task Champions</h2></div>`;
    const rates=Students.getTaskCompletionRates();
    if (rates.length===0) {
      taskSection.innerHTML+=`<div class="empty-state" style="padding:16px 0"><div class="empty-desc">Koi task data nahi abhi tak.</div></div>`;
    } else {
      const rateList=el('div','leaderboard');
      rates.forEach((s,i)=>{
        const item=el('div','leaderboard-item');
        const medal=i===0?'\u{1F947}':i===1?'\u{1F948}':i===2?'\u{1F949}':`${i+1}.`;
        const barColor=s.rate>=75?'#2ecc71':s.rate>=50?'#f39c12':'#e74c3c';
        item.innerHTML=`
          <span class="lb-rank">${medal}</span>
          <div class="lb-avatar" ${avatarStyle(s.color)}>${getInitials(s.name)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:13px;">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);">${s.done} done \u00b7 ${s.total-s.done} pending</div>
            <div style="background:var(--bg3);border-radius:4px;height:4px;margin-top:4px;overflow:hidden;"><div style="height:100%;width:${s.rate||0}%;background:${barColor};border-radius:4px;"></div></div>
          </div>
          <span class="lb-value" style="color:${barColor};font-size:16px;font-weight:800;">${s.rate}%</span>`;
        item.addEventListener('click',()=>App.navigate('detail',s.id));
        rateList.appendChild(item);
      });
      taskSection.appendChild(rateList);
    }
    scroll.appendChild(taskSection);

    /* ── 5. NEEDS ATTENTION */
    const atRisk=activeStudents.filter(s=>{
      const attRecs=db.attendance.filter(a=>a.student_id===s.id&&a.date.startsWith(prefix));
      const attPct=attRecs.length>0?Math.round(attRecs.filter(a=>a.type==='attended').length/attRecs.length*100):null;
      const sTasks=db.tasks.filter(t=>t.student_id===s.id);
      const taskRate=sTasks.length>0?Math.round(sTasks.filter(t=>t.status==='done').length/sTasks.length*100):null;
      return (attPct!==null&&attPct<50)||(taskRate!==null&&taskRate<40);
    });
    if (atRisk.length>0) {
      const riskSection=el('div','analytics-section');
      riskSection.innerHTML=`<div class="section-header"><h2 class="section-title">\u26A0\uFE0F Needs Attention</h2><span class="section-badge" style="background:#e74c3c22;color:#e74c3c;">${atRisk.length}</span></div>`;
      const riskList=el('div','leaderboard');
      atRisk.forEach(s=>{
        const attRecs=db.attendance.filter(a=>a.student_id===s.id&&a.date.startsWith(prefix));
        const attPct=attRecs.length>0?Math.round(attRecs.filter(a=>a.type==='attended').length/attRecs.length*100):null;
        const sTasks=db.tasks.filter(t=>t.student_id===s.id);
        const taskRate=sTasks.length>0?Math.round(sTasks.filter(t=>t.status==='done').length/sTasks.length*100):null;
        const reasons=[];
        if (attPct!==null&&attPct<50) reasons.push(`Attendance ${attPct}%`);
        if (taskRate!==null&&taskRate<40) reasons.push(`Tasks ${taskRate}%`);
        const item=el('div','leaderboard-item');
        item.innerHTML=`
          <span style="font-size:18px;">\u26A0\uFE0F</span>
          <div class="lb-avatar" ${avatarStyle(s.color)}>${getInitials(s.name)}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:#e74c3c;">${reasons.join(' \u00b7 ')}</div>
          </div>
          <span style="font-size:18px;">\u203a</span>`;
        item.addEventListener('click',()=>App.navigate('detail',s.id));
        riskList.appendChild(item);
      });
      riskSection.appendChild(riskList);
      scroll.appendChild(riskSection);
    }

    container.appendChild(scroll);
  }

  function _drawTrendChart(canvas, db, activeStudents) {
    if (!canvas) return;
    const months=[]; const now=new Date();
    for (let i=5;i>=0;i--) {
      const d=new Date(now.getFullYear(), now.getMonth()-i, 1);
      months.push({ prefix:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label:d.toLocaleDateString('en-IN',{month:'short'}) });
    }
    const attData=months.map(m=>{ const recs=db.attendance.filter(a=>a.date.startsWith(m.prefix)); return recs.length?Math.round(recs.filter(a=>a.type==='attended').length/recs.length*100):null; });
    const feeData=months.map(m=>{ return db.fee_records.filter(f=>f.date.startsWith(m.prefix)).reduce((s,f)=>s+f.amount,0); });
    const maxFee=Math.max(...feeData,1);
    const W=canvas.offsetWidth||320, H=160, DPR=window.devicePixelRatio||1;
    canvas.width=W*DPR; canvas.height=H*DPR; canvas.style.width=W+'px'; canvas.style.height=H+'px';
    const ctx=canvas.getContext('2d'); ctx.scale(DPR,DPR);
    const isLight=document.body.classList.contains('light-theme');
    const textCol=isLight?'#555560':'rgba(255,255,255,0.5)';
    const gridCol=isLight?'rgba(0,0,0,0.06)':'rgba(255,255,255,0.06)';
    const pad={l:10,r:10,t:10,b:28};
    const bW=Math.floor((W-pad.l-pad.r)/months.length*0.45);
    const gW=Math.floor((W-pad.l-pad.r)/months.length);
    // Grid lines
    [0,25,50,75,100].forEach(v=>{ const y=pad.t+(1-v/100)*(H-pad.t-pad.b); ctx.strokeStyle=gridCol; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(W-pad.r,y); ctx.stroke(); });
    months.forEach((m,i)=>{
      const x=pad.l+i*gW+gW/2;
      const bH_att=attData[i]!==null?(attData[i]/100*(H-pad.t-pad.b)):0;
      const bH_fee=maxFee>0?(feeData[i]/maxFee*(H-pad.t-pad.b))*0.7:0;
      // Fee bar (background, muted)
      if (bH_fee>1) {
        ctx.fillStyle=isLight?'rgba(100,160,255,0.25)':'rgba(100,160,255,0.18)';
        ctx.beginPath(); ctx.roundRect(x-bW/2-bW*0.6,H-pad.b-bH_fee,bW,bH_fee,3); ctx.fill();
      }
      // Attendance bar
      if (attData[i]!==null && bH_att>1) {
        const color=attData[i]>=75?'#2ecc71':attData[i]>=50?'#f39c12':'#e74c3c';
        ctx.fillStyle=color;
        ctx.beginPath(); ctx.roundRect(x+bW*0.1,H-pad.b-bH_att,bW,bH_att,3); ctx.fill();
        // Value label
        ctx.fillStyle=color; ctx.font=`bold 9px sans-serif`; ctx.textAlign='center'; ctx.textBaseline='bottom';
        ctx.fillText(attData[i]+'%',x+bW*0.1+bW/2,H-pad.b-bH_att-2);
      }
      // Month label
      ctx.fillStyle=textCol; ctx.font='10px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top';
      ctx.fillText(m.label,x,H-pad.b+4);
    });
    // Legend
    ctx.fillStyle='#2ecc71'; ctx.fillRect(W-100,8,10,8); ctx.fillStyle=textCol; ctx.font='9px sans-serif'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillText('Attendance',W-86,12);
    ctx.fillStyle=isLight?'rgba(100,160,255,0.5)':'rgba(100,160,255,0.5)'; ctx.fillRect(W-100,22,10,8); ctx.fillStyle=textCol; ctx.fillText('Revenue',W-86,26);
  }

  /* ─── SPRINT 6: Global Search ────────────────────────────── */
  let _globalSearchOpen=false;

  function openGlobalSearch() {
    _globalSearchOpen=true;
    const overlay=document.getElementById('search-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    const inp=document.getElementById('global-search-input');
    if (inp) { inp.value=''; inp.focus(); _runGlobalSearch(''); }
  }

  function closeGlobalSearch() {
    _globalSearchOpen=false;
    document.getElementById('search-overlay')?.classList.remove('open');
  }

  function _runGlobalSearch(q) {
    const resultsDiv=document.getElementById('global-search-results');
    if (!resultsDiv) return;
    if (!q.trim()) { resultsDiv.innerHTML=`<div class="gs-hint">Search students, tasks…</div>`; return; }
    const ql=q.toLowerCase();
    const students=Students.getStudents().filter(s=>s.name.toLowerCase().includes(ql)||(s.phone||'').includes(ql));
    const tasks=Tasks.getAllTasks('all').filter(t=>t.title.toLowerCase().includes(ql));
    if (students.length===0&&tasks.length===0) {
      resultsDiv.innerHTML=`<div class="gs-hint">No results for "<strong>${escHtml(q)}</strong>"</div>`; return;
    }
    resultsDiv.innerHTML='';
    if (students.length>0) {
      const hdr=el('div','gs-section-label','Students');
      resultsDiv.appendChild(hdr);
      students.slice(0,5).forEach(s=>{
        const item=el('div','gs-result-item');
        item.innerHTML=`<div class="gs-avatar" ${avatarStyle(s.color)}>${getInitials(s.name)}</div><div class="gs-info"><span class="gs-name">${escHtml(s.name)}</span><span class="gs-sub">${escHtml(s.phone||'No phone')}</span></div><span class="gs-arrow">›</span>`;
        item.addEventListener('click',()=>{ closeGlobalSearch(); App.navigate('detail',s.id); });
        resultsDiv.appendChild(item);
      });
    }
    if (tasks.length>0) {
      resultsDiv.appendChild(el('div','gs-section-label','Tasks'));
      tasks.slice(0,5).forEach(t=>{
        const student=Students.getStudentById(t.student_id);
        const item=el('div','gs-result-item');
        item.innerHTML=`<div class="gs-task-icon">${t.status==='done'?'✅':'📋'}</div><div class="gs-info"><span class="gs-name">${escHtml(t.title)}</span><span class="gs-sub">${student?escHtml(student.name):'Unknown'} · ${t.status}</span></div>`;
        item.addEventListener('click',()=>{ closeGlobalSearch(); if(student) App.navigate('detail',student.id); });
        resultsDiv.appendChild(item);
      });
    }
  }

  /* ─── Student Detail with Tabs ───────────────────────────── */
  let _detailTab='overview';

  function renderStudentDetail(studentId) {
    const container=document.getElementById('detail-content'); if (!container) return;
    const student=Students.getStudentById(studentId);
    if (!student) { container.innerHTML=`<div class="empty-state"><div class="empty-title">Student not found.</div></div>`; return; }

    const tasks=Tasks.getTasksByStudent(studentId);
    const pending=tasks.filter(t=>t.status==='pending');
    const inactive=(student.status||'active')==='inactive';
    const feeMeta=FM[student.fee_status]||FM.unpaid;
    const feeAmt=formatFee(student.fee_amount);
    const aStyle=avatarStyle(student.color);
    const attRate=Students.getAttendanceRate(studentId);
    const skillLevel=Students.getSkillLevel(studentId);
    const skillStages=Students.getSkillStages();

    container.innerHTML='';

    /* Header */
    const header=el('div','detail-header');
    header.innerHTML=`
      <div class="detail-avatar ${inactive?'dim':''}" ${aStyle}>${getInitials(student.name)}</div>
      <div class="detail-info">
        <span class="detail-name">${escHtml(student.name)}</span>
        <span class="detail-phone">${escHtml(student.phone||'No phone')}</span>
        <span class="detail-since">Joined ${formatDate(student.created_at)}</span>
        <span class="skill-stage-badge">${skillStages[skillLevel]||'Beginner'}</span>
        ${attRate!==null?`<span class="detail-att-rate">${attRate>=75?'🟢':attRate>=50?'🟡':'🔴'} ${attRate}% attendance</span>`:''}
      </div>
      <div class="detail-actions">
        <button class="btn btn-sm btn-whatsapp" id="btn-wa">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:4px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.855L.057 23.57a.75.75 0 0 0 .926.926l5.737-1.474A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.954 9.954 0 0 1-5.078-1.39l-.361-.214-3.757.965.997-3.645-.235-.374A9.953 9.953 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg>Share
        </button>
        <button class="btn btn-sm btn-edit" id="btn-edit-s">✏ Edit</button>
      </div>`;
    container.appendChild(header);
    header.querySelector('#btn-wa').addEventListener('click',()=>shareWhatsApp(studentId));
    header.querySelector('#btn-edit-s').addEventListener('click',()=>showEditStudentModal(studentId,()=>renderStudentDetail(studentId)));

    /* Meta row */
    const metaRow=el('div','detail-meta-row');
    metaRow.innerHTML=`
      <button class="status-toggle-btn ${inactive?'inactive':'active'}" id="btn-toggle">${inactive?'🔴 Inactive':'🟢 Active'}</button>
      ${feeAmt?`<div class="fee-row"><span class="fee-amount">${feeAmt}/mo</span>
        <select class="fee-select ${feeMeta.cls}" id="fee-sel">
          <option value="paid" ${student.fee_status==='paid'?'selected':''}>Paid</option>
          <option value="partial" ${student.fee_status==='partial'?'selected':''}>Partial</option>
          <option value="unpaid" ${student.fee_status==='unpaid'?'selected':''}>Unpaid</option>
        </select>
        <button class="btn btn-sm" id="btn-log-pay" style="background:var(--success-dim);color:var(--success);border:1px solid var(--success);font-size:11px;padding:5px 10px;">+ Log</button>
      </div>`:`<span class="no-fee-label">No fee · <button class="link-btn" id="btn-set-fee">Add</button></span>`}`;
    container.appendChild(metaRow);
    metaRow.querySelector('#btn-toggle').addEventListener('click',()=>{ Students.toggleStatus(studentId); renderStudentDetail(studentId); showToast(inactive?'Marked active':'Marked inactive'); });
    const feeSel=metaRow.querySelector('#fee-sel');
    if (feeSel) feeSel.addEventListener('change',()=>{ Students.updateFeeStatus(studentId,feeSel.value); renderStudentDetail(studentId); showToast('Fee updated'); });
    metaRow.querySelector('#btn-log-pay')?.addEventListener('click',()=>showLogFeeModal(studentId,()=>renderStudentDetail(studentId)));
    metaRow.querySelector('#btn-set-fee')?.addEventListener('click',()=>showEditStudentModal(studentId,()=>renderStudentDetail(studentId)));

    /* Tabs */
    const goals=Students.getGoals(studentId);
    const activeGoals=goals.filter(g=>g.status==='active');
    const TABS=[
      {id:'overview',label:'Overview'},
      {id:'goals',label:'Goals'+(activeGoals.length>0?' ('+activeGoals.length+')':'')},
      {id:'schedule',label:'Schedule'},
      {id:'attendance',label:'Attendance'},
      {id:'history',label:'History'},
      {id:'tasks',label:'Tasks'+(pending.length>0?' ('+pending.length+')':'')},
      {id:'syllabus',label:'Syllabus'},
      {id:'finance',label:'Finance'}
    ];
    const tabBar=el('div','detail-tabs');
    tabBar.innerHTML=TABS.map(t=>'<button class="detail-tab '+((_detailTab===t.id)?'active':'')+'" data-tab="'+t.id+'">'+t.label+'</button>').join('');
    container.appendChild(tabBar);
    const tabContent=el('div','detail-tab-content');
    container.appendChild(tabContent);

    function renderTab(tabId) {
      _detailTab=tabId;
      tabBar.querySelectorAll('.detail-tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===tabId));
      tabContent.innerHTML='';
      if (tabId==='overview') {
        tabContent.appendChild(buildGrowthCard(studentId));
        tabContent.appendChild(buildNotesSection(studentId,student));
        tabContent.appendChild(buildSkillSection(studentId,skillLevel,skillStages));
        const danger=el('div','danger-zone');
        danger.innerHTML='<span class="danger-zone-label">⚠ Danger Zone</span>';
        const del=el('button','btn btn-danger','🗑 Delete Student');
        del.addEventListener('click',()=>{ if(confirm('Delete '+student.name+'?')){
            const snapshot=JSON.parse(JSON.stringify(Storage.getDB()));
            Students.deleteStudent(studentId); renderStudents(); renderDashboard(); App.navigate('students');
            showToast('Student deleted','',()=>{ Storage.saveDB(snapshot); renderStudents(); renderDashboard(); showToast('Restored ✓','success'); });
          }});
        danger.appendChild(del); tabContent.appendChild(danger);
      } else if (tabId==='goals') {
        tabContent.appendChild(buildGoalsSection(studentId,student));
      } else if (tabId==='schedule') {
        tabContent.appendChild(buildScheduleSection(studentId,student));
      } else if (tabId==='attendance') {
        tabContent.appendChild(buildAttendanceSection(studentId));
      } else if (tabId==='history') {
        tabContent.appendChild(buildProgressTimeline(studentId,student));
      } else if (tabId==='tasks') {
        tabContent.appendChild(buildTasksSection(studentId,student,tasks));
      } else if (tabId==='syllabus') {
        tabContent.appendChild(buildSyllabusSection(studentId,student));
      } else if (tabId==='finance') {
        tabContent.appendChild(feeAmt?buildFeeHistorySection(studentId,student):buildNoFeeSection());
      }
    }
    tabBar.querySelectorAll('.detail-tab').forEach(t=>t.addEventListener('click',()=>renderTab(t.dataset.tab)));
    renderTab(_detailTab);
  }

  /* ─── Sprint 5: Skill Level Section ─────────────────────── */
  function buildSkillSection(studentId,skillLevel,stages) {
    const section=el('div','detail-section');
    section.innerHTML=`<div class="detail-section-header"><span class="detail-section-title">Skill Level</span></div>`;
    const row=el('div','skill-level-row');
    stages.forEach((s,i)=>{
      const btn=el('button',`skill-btn ${i===skillLevel?'active':''}`,s);
      btn.addEventListener('click',()=>{ Students.setSkillLevel(studentId,i); showToast(`Level: ${s} ✓`,'success'); document.querySelectorAll('.skill-btn').forEach((b,j)=>b.classList.toggle('active',j===i)); document.querySelector('.skill-stage-badge').textContent=s; });
      row.appendChild(btn);
    });
    section.appendChild(row);
    return section;
  }

  /* ─── Sprint 4: Schedule Section ────────────────────────── */
  function buildScheduleSection(studentId, student) {
    const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const schedule=Students.getSchedule(studentId);
    const section=el('div','detail-section');
    const hdr=el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Weekly Schedule</span>`;
    const editBtn=el('button','btn-edit-progress','✏ Edit');
    editBtn.addEventListener('click',()=>showScheduleModal(studentId,student,()=>renderStudentDetail(studentId)));
    hdr.appendChild(editBtn); section.appendChild(hdr);

    if (schedule.length===0) {
      const empty=el('div','empty-state');
      empty.style.padding='20px 0';
      empty.innerHTML=`<span class="empty-icon" style="font-size:28px">📅</span><div class="empty-title">No schedule set</div><div class="empty-desc">Tap <strong>✏ Edit</strong> to add ${escHtml(student.name)}'s class days.</div>`;
      section.appendChild(empty);
    } else {
      const list=el('div','schedule-list');
      schedule.forEach(s=>{
        const item=el('div','schedule-item');
        item.innerHTML=`<span class="schedule-day">${days[s.day]}</span><span class="schedule-time">⏰ ${s.time}</span><span class="schedule-dur">${s.duration_min} min</span>`;
        list.appendChild(item);
      });
      section.appendChild(list);
    }

    /* Sprint 4: WhatsApp fee reminder */
    const waSection=el('div','wa-reminder-section');
    waSection.innerHTML=`<div class="detail-section-header" style="margin-top:16px"><span class="detail-section-title">Fee Reminder</span></div>`;
    const waBtn=el('button','btn btn-sm btn-whatsapp','📲 Send Fee Reminder via WhatsApp');
    waBtn.style.cssText='width:100%;padding:12px;font-size:13px;';
    waBtn.addEventListener('click',()=>sendFeeReminderWhatsApp(studentId));
    waSection.appendChild(waBtn); section.appendChild(waSection);
    return section;
  }

  /* ─── Sprint 5: Syllabus Checklist ──────────────────────── */
  function buildSyllabusSection(studentId, student) {
    const items=Students.getSyllabus(studentId);
    const section=el('div','detail-section');
    const hdr=el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Syllabus</span>`;
    const addBtn=el('button','btn-edit-progress','+ Item');
    addBtn.addEventListener('click',()=>showAddSyllabusModal(studentId,()=>renderStudentDetail(studentId)));
    hdr.appendChild(addBtn); section.appendChild(hdr);

    if (items.length===0) {
      const empty=el('div','empty-state'); empty.style.padding='20px 0';
      empty.innerHTML=`<span class="empty-icon" style="font-size:28px">📚</span><div class="empty-title">No syllabus yet</div><div class="empty-desc">Add songs, ragas, techniques for ${escHtml(student.name)}.</div>`;
      section.appendChild(empty); return section;
    }

    const done=items.filter(x=>x.done).length;
    const prog=el('div','syllabus-progress');
    prog.innerHTML=`<div class="syl-bar"><div class="syl-bar-fill" style="width:${items.length?Math.round(done/items.length*100):0}%"></div></div><span class="syl-pct">${done}/${items.length} done</span>`;
    section.appendChild(prog);

    // Group by category
    const cats={};
    items.forEach(item=>{ if(!cats[item.category])cats[item.category]=[]; cats[item.category].push(item); });
    Object.entries(cats).forEach(([cat,catItems])=>{
      const catDiv=el('div','syl-category');
      catDiv.innerHTML=`<span class="syl-cat-label">${escHtml(cat)}</span>`;
      catItems.forEach(item=>{
        const row=el('div',`syl-item ${item.done?'done':''}`);
        row.innerHTML=`
          <button class="syl-check ${item.done?'done':''}" data-id="${item.id}">${item.done?'✓':''}</button>
          <span class="syl-title">${escHtml(item.title)}</span>
          <button class="syl-del" data-id="${item.id}">✕</button>`;
        row.querySelector('.syl-check').addEventListener('click',()=>{ Students.toggleSyllabusItem(item.id); renderStudentDetail(studentId); });
        row.querySelector('.syl-del').addEventListener('click',()=>{ if(confirm('Remove item?')){ Students.deleteSyllabusItem(item.id); renderStudentDetail(studentId); }});
        catDiv.appendChild(row);
      });
      section.appendChild(catDiv);
    });
    return section;
  }

  /* ─── Notes, Attendance, History, Tasks, Finance Sections ── */
  function buildNotesSection(studentId, student) {
    const section=el('div','detail-section');
    const hdr=el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Teacher's Notes</span>`;
    section.appendChild(hdr);
    const wrap=el('div','notes-wrap'), ta=el('textarea','notes-textarea');
    ta.placeholder='Observations, learning pace, goals…'; ta.value=student.notes||'';
    let timer=null; const lbl=el('span','notes-save-label','');
    ta.addEventListener('input',()=>{ clearTimeout(timer); lbl.textContent='Saving…'; lbl.className='notes-save-label saving';
      timer=setTimeout(()=>{ Students.updateStudentNotes(studentId,ta.value); lbl.textContent='✓ Saved'; lbl.className='notes-save-label saved'; setTimeout(()=>{lbl.textContent='';lbl.className='notes-save-label';},1500); },600); });
    wrap.appendChild(ta); wrap.appendChild(lbl); section.appendChild(wrap); return section;
  }

  function buildAttendanceSection(studentId) {
    const section=el('div','detail-section');
    const hdr=el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Attendance</span>`;
    section.appendChild(hdr);
    const summary=Students.getAttendanceSummary(studentId);
    const history=Students.getAttendance(studentId);
    const today=new Date().toISOString().slice(0,10);
    const todayEntry=history.find(a=>a.date===today);
    const sumDiv=el('div','attendance-summary');
    sumDiv.innerHTML=`<div class="att-stat attended"><span class="att-num">${summary.attended}</span><span class="att-label">Attended</span></div><div class="att-divider"></div><div class="att-stat missed"><span class="att-num">${summary.missed}</span><span class="att-label">Missed</span></div><span class="att-month-label">This month</span>`;
    section.appendChild(sumDiv);
    const row=el('div','att-today-row'); row.innerHTML=`<span class="att-today-label">Today:</span>`;
    const attBtn=el('button',`att-btn attended ${todayEntry?.type==='attended'?'active':''}`, '✓ Attended');
    const misBtn=el('button',`att-btn missed ${todayEntry?.type==='missed'?'active':''}`, '✕ Missed');
    attBtn.addEventListener('click',()=>{ Students.addAttendance(studentId,{date:today,type:'attended'}); renderStudentDetail(studentId); showToast('Attendance marked ✓','success'); });
    misBtn.addEventListener('click',()=>{ Students.addAttendance(studentId,{date:today,type:'missed'}); renderStudentDetail(studentId); showToast('Absence marked'); });
    row.appendChild(attBtn); row.appendChild(misBtn); section.appendChild(row);
    if (history.length>0) {
      const log=el('div','att-log');
      history.slice(0,8).forEach(e=>{ const item=el('div',`att-log-item ${e.type}`); item.innerHTML=`<span class="att-log-dot">${e.type==='attended'?'✓':'✕'}</span><span class="att-log-date">${formatDateShort(e.date)}</span>`; log.appendChild(item); });
      section.appendChild(log);
    }
    return section;
  }

  function buildProgressTimeline(studentId, student) {
    const history=Students.getProgressHistory(studentId);
    const section=el('div','detail-section');
    const hdr=el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Class History</span>`;
    const addBtn=el('button','btn-edit-progress','+ Add Entry');
    addBtn.addEventListener('click',()=>showProgressEntryModal(studentId,()=>renderStudentDetail(studentId)));
    hdr.appendChild(addBtn); section.appendChild(hdr);
    if (history.length===0) {
      const e=el('div','empty-state',`<span class="empty-icon" style="font-size:28px">📚</span><div class="empty-title">No history yet</div><div class="empty-desc">Add entries after each session with ${escHtml(student?.name||'')}.</div>`);
      e.style.padding='20px 0'; section.appendChild(e); return section;
    }
    const timeline=el('div','progress-timeline');
    history.forEach((entry,i)=>{
      const item=el('div','timeline-item');
      const stars=entry.rating?'⭐'.repeat(entry.rating):'';
      item.innerHTML=`
        <div class="timeline-dot"></div>
        <div class="timeline-line ${i===history.length-1?'last':''}"></div>
        <div class="timeline-card">
          <div class="timeline-header">
            <span class="timeline-topic">${escHtml(entry.topic)}</span>
            <span class="timeline-date">${formatDateShort(entry.date)}</span>
          </div>
          ${stars?`<div class="timeline-stars">${stars}</div>`:''}
          ${entry.notes?`<p class="timeline-notes">${escHtml(entry.notes)}</p>`:''}
        </div>`;
      const delBtn=el('button','timeline-del-btn','✕');
      delBtn.addEventListener('click',()=>{ if(confirm('Delete?')){ Students.deleteProgressEntry(entry.id); renderStudentDetail(studentId); }});
      item.querySelector('.timeline-header').appendChild(delBtn);
      timeline.appendChild(item);
    });
    section.appendChild(timeline); return section;
  }

  function buildTasksSection(studentId, student, tasks) {
    const pending=tasks.filter(t=>t.status==='pending');
    const section=el('div','detail-section');
    const hdr=el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Tasks <span class="section-badge" style="margin-left:6px">${pending.length} pending</span></span>`;
    const addBtn=el('button','btn-edit-progress','+ Task');
    addBtn.addEventListener('click',()=>showAddTaskModal(studentId,()=>renderStudentDetail(studentId)));
    hdr.appendChild(addBtn); section.appendChild(hdr);
    const list=el('div','task-list');
    if (tasks.length===0) {
      list.innerHTML=`<div class="empty-state" style="padding:24px 0"><span class="empty-icon" style="font-size:28px">📋</span><div class="empty-title">No tasks yet</div><div class="empty-desc">Tap <strong>+ Task</strong> to assign ${escHtml(student.name)}'s first practice task.</div></div>`;
    } else {
      tasks.forEach(task=>{
        list.appendChild(renderTaskCard(task,{
          showStudent:false, showEdit:true,
          onEdit:(id)=>showEditTaskModal(id,studentId,()=>renderStudentDetail(studentId)),
          onToggle:(id,status)=>{ Tasks.updateTaskStatus(id,status); renderStudentDetail(studentId); showToast(status==='done'?'Task done ✓':'Task reopened',status==='done'?'success':''); },
          onDelete:(id)=>{ Tasks.deleteTask(id); renderStudentDetail(studentId); showToast('Task deleted'); }
        }));
      });
    }
    section.appendChild(list); return section;
  }

  function buildFeeHistorySection(studentId, student) {
    const records=Students.getFeeRecords(studentId);
    const section=el('div','detail-section');
    const hdr=el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Payment History</span>`;
    const logBtn=el('button','btn-edit-progress','+ Log Payment');
    logBtn.addEventListener('click',()=>showLogFeeModal(studentId,()=>renderStudentDetail(studentId)));
    hdr.appendChild(logBtn); section.appendChild(hdr);

    /* Sprint 4: Partial payment balance */
    if (student && student.fee_amount>0 && student.fee_status!=='paid') {
      const now=new Date(), prefix=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
      const paidThisMonth=(records||[]).filter(r=>r.date.startsWith(prefix)).reduce((s,r)=>s+r.amount,0);
      const balance=Math.max(0,student.fee_amount-paidThisMonth);
      const balCard=el('div',`balance-card ${balance>0?'owing':'paid'}`);
      balCard.innerHTML=`
        <div class="bal-row"><span>Fee</span><span>₹${Number(student.fee_amount).toLocaleString('en-IN')}/mo</span></div>
        <div class="bal-row"><span>Paid this month</span><span class="green">₹${Number(paidThisMonth).toLocaleString('en-IN')}</span></div>
        <div class="bal-row bold"><span>Balance due</span><span class="${balance>0?'red':'green'}">₹${Number(balance).toLocaleString('en-IN')}</span></div>`;
      section.appendChild(balCard);
    }

    if (records.length===0) {
      section.appendChild(el('div','empty-state',`<span class="empty-icon" style="font-size:28px">💳</span><div class="empty-desc">No payment records.</div>`));
      return section;
    }
    const total=records.reduce((s,r)=>s+r.amount,0);
    const tot=el('div','fee-total-row');
    tot.innerHTML=`<span class="fee-total-label">Total collected</span><span class="fee-total-value">₹${Number(total).toLocaleString('en-IN')}</span>`;
    section.appendChild(tot);
    const log=el('div','fee-log');
    records.forEach(rec=>{
      const item=el('div','fee-log-item');
      item.innerHTML=`<span class="fee-log-icon">💰</span><div class="fee-log-body"><span class="fee-log-amount">₹${Number(rec.amount).toLocaleString('en-IN')}</span>${rec.note?`<span class="fee-log-note">${escHtml(rec.note)}</span>`:''}</div><span class="fee-log-date">${formatDateShort(rec.date)}</span><button class="fee-log-del" data-id="${rec.id}">✕</button>`;
      item.querySelector('.fee-log-del').addEventListener('click',()=>{ if(confirm('Delete record?')){ Students.deleteFeeRecord(rec.id); renderStudentDetail(studentId); showToast('Deleted'); }});
      log.appendChild(item);
    });
    section.appendChild(log); return section;
  }

  function buildNoFeeSection() {
    const s=el('div','empty-state'); s.style.padding='40px 0';
    s.innerHTML=`<span class="empty-icon">💰</span><div class="empty-title">No fee set</div><div class="empty-desc">Edit student profile to add a monthly fee.</div>`;
    return s;
  }

  /* ─── WhatsApp ───────────────────────────────────────────── */
  /* ─── Premium Banner Share ───────────────────────────────── */
  function shareWhatsApp(studentId) {
    const student=Students.getStudentById(studentId); if (!student) return;
    showShareBannerModal(studentId);
  }

  function showShareBannerModal(studentId) {
    document.querySelector('.share-banner-overlay')?.remove();
    const student=Students.getStudentById(studentId); if (!student) return;
    const history=Students.getProgressHistory(studentId);
    const tasks=Tasks.getTasksByStudent(studentId);
    const summary=Students.getAttendanceSummary(studentId);
    const skillLevel=Students.getSkillLevel(studentId);
    const skillStages=Students.getSkillStages();
    const levelName=skillStages[skillLevel]||'Beginner';
    const totalClasses=(summary.attended||0)+(summary.missed||0);
    const doneTasks=tasks.filter(t=>t.status==='done');
    const pendingTasks=tasks.filter(t=>t.status==='pending');
    const taskPct=tasks.length?Math.round(doneTasks.length/tasks.length*100):0;
    const recentTopics=history.slice(0,4);
    const currentTopic=history.length?history[0].topic:'—';

    /* ── Weekly filter: last 7 days ── */
    const _now=new Date();
    const _week0=new Date(_now);_week0.setDate(_week0.getDate()-6);
    const weekRange=_week0.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+' – '+_now.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
    const weeklyTopics=history.filter(e=>{if(!e.date)return false;const d=new Date(e.date+'T00:00:00');return d>=_week0&&d<=_now;});
    const weeklyTasks=pendingTasks.filter(t=>{const c=t.created_at?new Date(t.created_at):null;const d=(t.deadline||t.due_date)?new Date((t.deadline||t.due_date)+'T00:00:00'):null;return (c&&c>=_week0)||(d&&d>=_week0)||(!c&&!d);});

    const overlay=el('div','share-banner-overlay');
    overlay.innerHTML=`
      <div class="share-banner-modal">
        <div class="sbm-header">
          <span class="sbm-title">🎴 Performance Report Card</span>
          <button class="sbm-close">✕</button>
        </div>
        <div class="sbm-canvas-wrap">
          <canvas id="progressBannerCanvas"></canvas>
        </div>
        <div class="sbm-actions">
          <button class="sbm-btn sbm-download">⬇ Download Card</button>
          <button class="sbm-btn sbm-wa">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:middle;margin-right:6px"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.855L.057 23.57a.75.75 0 0 0 .926.926l5.737-1.474A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.954 9.954 0 0 1-5.078-1.39l-.361-.214-3.757.965.997-3.645-.235-.374A9.953 9.953 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg>Share on WhatsApp
          </button>
        </div>
        <p class="sbm-hint">💡 Download karke WhatsApp pe share karo ya Web Share use karo</p>
      </div>`;
    document.body.appendChild(overlay);

    const canvas=overlay.querySelector('#progressBannerCanvas');
    // Preload logo then draw
    const logoImg=new Image();
    logoImg.onload=()=>drawProgressBanner(canvas,{student,levelName,currentTopic,summary,totalClasses,skillLevel,skillStages,doneTasks,pendingTasks,taskPct,recentTopics,logoImg,weeklyTopics,weeklyTasks,weekRange});
    logoImg.onerror=()=>drawProgressBanner(canvas,{student,levelName,currentTopic,summary,totalClasses,skillLevel,skillStages,doneTasks,pendingTasks,taskPct,recentTopics,logoImg:null,weeklyTopics,weeklyTasks,weekRange});
    logoImg.src='icons/logo.png';

    overlay.querySelector('.sbm-close').onclick=()=>overlay.remove();
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});

    overlay.querySelector('.sbm-download').onclick=()=>{
      const link=document.createElement('a');
      link.download=`${student.name.replace(/\s+/g,'_')}_report.png`;
      link.href=canvas.toDataURL('image/png',1.0);
      link.click();
      showToast('Card downloaded! 🎉','success');
    };

    overlay.querySelector('.sbm-wa').onclick=async()=>{
      if(navigator.share&&navigator.canShare){
        try{
          canvas.toBlob(async(blob)=>{
            const file=new File([blob],`${student.name}_report.png`,{type:'image/png'});
            if(navigator.canShare({files:[file]})){
              await navigator.share({files:[file],title:`${student.name} – Performance Report`,text:'ChordStar Performance Card 🎸'});
            } else { waTextFallback(student,levelName,currentTopic,taskPct,doneTasks,pendingTasks,summary,totalClasses); }
          },'image/png',1.0);
        } catch(err){ waTextFallback(student,levelName,currentTopic,taskPct,doneTasks,pendingTasks,summary,totalClasses); }
      } else { waTextFallback(student,levelName,currentTopic,taskPct,doneTasks,pendingTasks,summary,totalClasses); }
    };
  }

  function waTextFallback(student,levelName,currentTopic,taskPct,doneTasks,pendingTasks,summary,totalClasses){
    let text=`🎸 *ChordStar – Performance Report*\n━━━━━━━━━━━━━━━━\n`;
    text+=`👤 *${student.name}*  |  🏅 ${levelName}\n`;
    text+=`📖 Current Topic: *${currentTopic}*\n\n`;
    text+=`✅ *Task Completion: ${taskPct}%*\n`;
    text+=`• Done: ${doneTasks.length}  |  Pending: ${pendingTasks.length}\n`;
    if(pendingTasks.length) text+=`\n📋 *Pending Tasks:*\n`+pendingTasks.slice(0,3).map(t=>`• ${t.title}`).join('\n')+'\n';
    text+=`\n📅 This Month: ${summary.attended} attended, ${summary.missed} missed\n`;
    text+=`\n_ChordStar Performance Report_ 🎵`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');
  }

  /* ── BANNER CANVAS DRAW — Dynamic height, stacked full-width layout ── */
  function drawProgressBanner(canvas,{student,levelName,currentTopic,summary,totalClasses,skillLevel,skillStages,doneTasks,pendingTasks,taskPct,recentTopics,logoImg,weeklyTopics,weeklyTasks,weekRange}){
    const W=800, DPR=2, PAD=30, BODY_W=W-PAD*2;

    function wrapLinesB(ctx,text,maxW){
      if(!text)return['—'];
      const words=String(text).split(' ');
      const lines=[];let line='';
      for(const w of words){const test=line?line+' '+w:w;if(ctx.measureText(test).width>maxW&&line){lines.push(line);line=w;}else line=test;}
      if(line)lines.push(line);return lines.length?lines:['—'];
    }

    const mc=document.createElement('canvas');mc.width=W;mc.height=10;const mctx=mc.getContext('2d');
    const topicsToShow=weeklyTopics&&weeklyTopics.length>0?weeklyTopics:[];
    const tasksToShow=weeklyTasks&&weeklyTasks.length>0?weeklyTasks:[];

    function mTopicRow(e){mctx.font='bold 14px system-ui,sans-serif';const l=wrapLinesB(mctx,e.topic||e,BODY_W-90);return Math.max(44,14+l.length*20+12)+8;}
    function mTaskRow(t){mctx.font='13px system-ui,sans-serif';const l=wrapLinesB(mctx,t.title,BODY_W-90);const h=Math.max(40,10+l.length*20+12);return h+(t.deadline||t.due_date?18:0)+8;}

    const HEADER_H=90,STUDENT_H=114,STATS_H=130,SKILL_H=60,SEC_H=38,FOOTER_H=38;
    const topicsBlockH=topicsToShow.length>0?SEC_H+10+topicsToShow.reduce((s,e)=>s+mTopicRow(e),0)+16:SEC_H+58+16;
    const tasksBlockH=tasksToShow.length>0?SEC_H+10+tasksToShow.reduce((s,t)=>s+mTaskRow(t),0)+16:SEC_H+58+16;
    const TOTAL_H=HEADER_H+STUDENT_H+STATS_H+SKILL_H+topicsBlockH+tasksBlockH+FOOTER_H+20;

    canvas.width=W*DPR;canvas.height=TOTAL_H*DPR;
    canvas.style.width='100%';canvas.style.maxWidth='420px';canvas.style.height='auto';
    const ctx=canvas.getContext('2d');ctx.scale(DPR,DPR);

    const now=new Date();
    const dateStr=now.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});

    // Background
    const bgG=ctx.createLinearGradient(0,0,W,TOTAL_H);
    bgG.addColorStop(0,'#0d0d1a');bgG.addColorStop(0.5,'#111128');bgG.addColorStop(1,'#0a1628');
    ctx.fillStyle=bgG;ctx.fillRect(0,0,W,TOTAL_H);
    bGlow(ctx,700,80,220,'rgba(220,38,38,0.10)');
    bGlow(ctx,100,TOTAL_H-100,180,'rgba(124,58,237,0.10)');

    // Top accent
    const accentG=ctx.createLinearGradient(0,0,W,0);
    accentG.addColorStop(0,'#dc2626');accentG.addColorStop(0.4,'#9333ea');
    accentG.addColorStop(0.7,'#2563eb');accentG.addColorStop(1,'#dc2626');
    ctx.fillStyle=accentG;ctx.fillRect(0,0,W,5);

    // Header bg
    const hBg=ctx.createLinearGradient(0,5,0,HEADER_H);
    hBg.addColorStop(0,'rgba(220,38,38,0.08)');hBg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=hBg;ctx.fillRect(0,5,W,HEADER_H-5);

    if(logoImg){ctx.save();ctx.beginPath();ctx.arc(PAD+36,46,36,0,Math.PI*2);ctx.clip();ctx.drawImage(logoImg,PAD,10,72,72);ctx.restore();}
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.font='bold 20px system-ui,sans-serif';
    const g2=ctx.createLinearGradient(PAD+82,0,PAD+260,0);g2.addColorStop(0,'#fff');g2.addColorStop(1,'rgba(255,255,255,0.7)');
    ctx.fillStyle=g2;ctx.fillText('ChordStar Music',PAD+82,40);
    ctx.font='11px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.35)';ctx.fillText('Student Performance Report',PAD+82,58);
    ctx.textAlign='right';ctx.font='11px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.25)';ctx.fillText(dateStr,W-PAD,38);
    ctx.font='10px system-ui,sans-serif';ctx.fillStyle='rgba(220,38,38,0.6)';ctx.fillText('chordstarmusic.com',W-PAD,56);
    if(weekRange){
      const wBW=180,wBH=22,wBX=W-PAD-wBW,wBY=62;
      bRoundRect(ctx,wBX,wBY,wBW,wBH,6);ctx.fillStyle='rgba(144,96,224,0.22)';ctx.fill();
      bRoundRect(ctx,wBX,wBY,wBW,wBH,6);ctx.strokeStyle='rgba(144,96,224,0.55)';ctx.lineWidth=1;ctx.stroke();
      ctx.font='bold 10px system-ui,sans-serif';ctx.fillStyle='#c4b5fd';ctx.textAlign='right';ctx.textBaseline='middle';
      ctx.fillText('📅 Week: '+weekRange,W-PAD-8,wBY+11);
    }

    // Student info
    let curY=HEADER_H;
    const AX=PAD+42,AY=curY+52,AR=40;
    const aG=ctx.createRadialGradient(AX,AY,0,AX,AY,AR);
    aG.addColorStop(0,student.color||'#7c3aed');aG.addColorStop(1,bShade(student.color||'#7c3aed',-50));
    ctx.fillStyle=aG;ctx.beginPath();ctx.arc(AX,AY,AR,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,0.2)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(AX,AY,AR+3,0,Math.PI*2);ctx.stroke();
    const initials=student.name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    ctx.fillStyle='#fff';ctx.font='bold 26px system-ui,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(initials,AX,AY);
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.font='bold 28px system-ui,sans-serif';ctx.fillStyle='#f1f5f9';ctx.fillText(student.name,PAD+96,curY+38);
    const isActive=student.status==='active';
    const pilW=isActive?76:84;
    bRoundRect(ctx,PAD+96,curY+46,pilW,22,11);ctx.fillStyle=isActive?'rgba(16,185,129,0.2)':'rgba(239,68,68,0.2)';ctx.fill();
    bRoundRect(ctx,PAD+96,curY+46,pilW,22,11);ctx.strokeStyle=isActive?'#10b981':'#ef4444';ctx.lineWidth=1;ctx.stroke();
    ctx.font='bold 11px system-ui,sans-serif';ctx.fillStyle=isActive?'#10b981':'#ef4444';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(isActive?'● Active':'● Inactive',PAD+96+pilW/2,curY+57);
    const levelColors=['#94a3b8','#10b981','#3b82f6','#8b5cf6','#f59e0b'];
    ctx.textAlign='left';ctx.textBaseline='alphabetic';
    ctx.font='11px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fillText('LEVEL',PAD+96,curY+86);
    ctx.font='bold 16px system-ui,sans-serif';ctx.fillStyle=levelColors[skillLevel]||'#8b5cf6';ctx.fillText(levelName,PAD+96+50,curY+86);
    ctx.textAlign='right';ctx.font='bold 10px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.35)';ctx.fillText('THIS MONTH',W-PAD,curY+30);
    ctx.font='bold 30px system-ui,sans-serif';ctx.fillStyle='#f1f5f9';ctx.fillText(totalClasses,W-PAD,curY+66);
    ctx.font='11px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.35)';ctx.fillText('classes  (✅'+summary.attended+' / ❌'+summary.missed+')',W-PAD,curY+84);

    curY+=STUDENT_H;
    ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(PAD,curY);ctx.lineTo(W-PAD,curY);ctx.stroke();
    curY+=14;

    // Stats row
    const CX=PAD+60,CY=curY+52,CR=46;
    bGlow(ctx,CX,CY,CR+16,'rgba(99,102,241,0.10)');
    ctx.beginPath();ctx.arc(CX,CY,CR,0,Math.PI*2);ctx.strokeStyle='rgba(255,255,255,0.06)';ctx.lineWidth=11;ctx.stroke();
    const pct=taskPct/100,startA=-Math.PI/2;
    const scoreColor=taskPct>=80?'#10b981':taskPct>=50?'#3b82f6':taskPct>=25?'#f59e0b':'#ef4444';
    if(pct>0){ctx.beginPath();ctx.arc(CX,CY,CR,startA,startA+Math.PI*2*pct);ctx.strokeStyle=scoreColor;ctx.lineWidth=11;ctx.lineCap='round';ctx.stroke();}
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 26px system-ui,sans-serif';ctx.fillStyle='#fff';ctx.fillText(taskPct+'%',CX,CY-8);
    ctx.font='bold 9px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fillText('TASKS DONE',CX,CY+8);
    ctx.font='9px system-ui,sans-serif';ctx.fillStyle=scoreColor;ctx.fillText(doneTasks.length+' / '+(doneTasks.length+pendingTasks.length),CX,CY+22);
    const statData=[{label:'ATTENDED',val:summary.attended,color:'#10b981'},{label:'MISSED',val:summary.missed,color:'#ef4444'},{label:'TASKS ✓',val:doneTasks.length,color:'#3b82f6'},{label:'PENDING',val:pendingTasks.length,color:'#f59e0b'}];
    const sbW=(W-PAD*2-130-12)/4,sbH=54,sbX0=PAD+130,sbGap=4;
    statData.forEach((s,i)=>{
      const sx=sbX0+i*(sbW+sbGap);
      bRoundRect(ctx,sx,curY,sbW,sbH,8);ctx.fillStyle='rgba(255,255,255,0.04)';ctx.fill();
      bRoundRect(ctx,sx,curY,sbW,sbH,8);ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=1;ctx.stroke();
      bRoundRect(ctx,sx,curY,sbW,4,2);ctx.fillStyle=s.color;ctx.fill();
      ctx.font='bold 22px system-ui,sans-serif';ctx.fillStyle=s.color;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText(s.val,sx+sbW/2,curY+38);
      ctx.font='9px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.35)';ctx.fillText(s.label,sx+sbW/2,curY+50);
    });
    curY+=STATS_H-14;

    // Skill journey
    ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.font='bold 9px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.3)';ctx.fillText('SKILL JOURNEY',PAD,curY+12);
    const stageCount=skillStages.length,segW=(W-PAD*2-80)/(stageCount-1);
    skillStages.forEach((stage,i)=>{
      const sx=PAD+80+i*segW,sy=curY+8,isReached=i<=skillLevel,isCurrent=i===skillLevel;
      if(i<stageCount-1){ctx.strokeStyle=isReached&&i<skillLevel?'rgba(99,102,241,0.5)':'rgba(255,255,255,0.08)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+6,sy+2);ctx.lineTo(sx+segW-6,sy+2);ctx.stroke();}
      ctx.fillStyle=isCurrent?'#7c3aed':isReached?'#4f46e5':'rgba(255,255,255,0.1)';ctx.beginPath();ctx.arc(sx,sy+2,isCurrent?7:4,0,Math.PI*2);ctx.fill();
      if(isCurrent){ctx.strokeStyle='rgba(124,58,237,0.4)';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(sx,sy+2,11,0,Math.PI*2);ctx.stroke();}
      ctx.font=(isCurrent?'bold ':'')+' 10px system-ui,sans-serif';ctx.fillStyle=isCurrent?'#c4b5fd':isReached?'rgba(255,255,255,0.45)':'rgba(255,255,255,0.18)';ctx.textAlign='center';ctx.textBaseline='top';ctx.fillText(stage,sx,sy+14);
    });
    curY+=SKILL_H;

    function drawSecHeader(icon,label,color){
      bRoundRect(ctx,PAD,curY,BODY_W,SEC_H,9);ctx.fillStyle=color+'1a';ctx.fill();
      bRoundRect(ctx,PAD,curY,BODY_W,SEC_H,9);ctx.strokeStyle=color+'44';ctx.lineWidth=1.2;ctx.stroke();
      ctx.fillStyle=color;bRoundRect(ctx,PAD,curY,5,SEC_H,3);ctx.fill();
      ctx.font='bold 13px system-ui,sans-serif';ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='middle';
      ctx.fillText(icon+'  '+label,PAD+14,curY+SEC_H/2);curY+=SEC_H+10;
    }

    // TOPICS FULL WIDTH
    drawSecHeader('📖','Topics Learned This Week'+(topicsToShow.length?' ('+topicsToShow.length+')':''),'#f0c040');
    if(topicsToShow.length===0){
      ctx.font='13px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.25)';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('No topics recorded this week',W/2,curY+20);curY+=48;
    } else {
      const badgeColors=['#6366f1','#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899'];
      topicsToShow.forEach((entry,idx)=>{
        const topicText=entry.topic||(typeof entry==='string'?entry:'');
        ctx.font='bold 14px system-ui,sans-serif';
        const tLines=wrapLinesB(ctx,topicText,BODY_W-90);
        const rowH=Math.max(44,14+tLines.length*20+12);
        bRoundRect(ctx,PAD,curY,BODY_W,rowH,10);ctx.fillStyle=idx%2===0?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.025)';ctx.fill();
        bRoundRect(ctx,PAD,curY,BODY_W,rowH,10);ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;ctx.stroke();
        bRoundRect(ctx,PAD+8,curY+(rowH-22)/2,22,22,11);ctx.fillStyle=badgeColors[idx%badgeColors.length];ctx.fill();
        ctx.font='bold 11px system-ui,sans-serif';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(idx+1,PAD+19,curY+rowH/2);
        ctx.font='bold 14px system-ui,sans-serif';ctx.fillStyle=idx===0?'#e2e8f0':'rgba(255,255,255,0.65)';ctx.textAlign='left';ctx.textBaseline='top';
        let ty=curY+(rowH-tLines.length*20)/2;tLines.forEach(line=>{ctx.fillText(line,PAD+38,ty);ty+=20;});
        ctx.textAlign='right';ctx.textBaseline='middle';ctx.font='11px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.3)';
        let meta=entry.date?new Date(entry.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'}):'';
        if(entry.rating)meta+='  '+'★'.repeat(entry.rating);
        ctx.fillText(meta,W-PAD-8,curY+rowH/2);
        curY+=rowH+6;
      });curY+=10;
    }

    // TASKS FULL WIDTH
    drawSecHeader('📋','Pending Tasks'+(tasksToShow.length?' ('+tasksToShow.length+')':''),'#e07830');
    if(tasksToShow.length===0){
      ctx.fillStyle='rgba(16,185,129,0.10)';bRoundRect(ctx,PAD,curY,BODY_W,44,10);ctx.fill();
      ctx.font='bold 13px system-ui,sans-serif';ctx.fillStyle='#10b981';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('🎉  All caught up — no pending tasks this week!',W/2,curY+22);curY+=52;
    } else {
      const priorityColor={high:'#ef4444',medium:'#f59e0b',low:'#6b7280'};
      tasksToShow.forEach((task,idx)=>{
        ctx.font='13px system-ui,sans-serif';
        const tLines=wrapLinesB(ctx,task.title,BODY_W-90);
        const hasDue=!!(task.deadline||task.due_date);
        const rowH=Math.max(40,10+tLines.length*20+12)+(hasDue?18:0);
        bRoundRect(ctx,PAD,curY,BODY_W,rowH,10);ctx.fillStyle=idx%2===0?'rgba(255,255,255,0.04)':'rgba(255,255,255,0.025)';ctx.fill();
        bRoundRect(ctx,PAD,curY,BODY_W,rowH,10);ctx.strokeStyle='rgba(255,255,255,0.07)';ctx.lineWidth=1;ctx.stroke();
        const pColor=priorityColor[task.priority]||'#6b7280';
        ctx.fillStyle=pColor;ctx.beginPath();ctx.arc(PAD+14,curY+rowH/2-(hasDue?9:0),5,0,Math.PI*2);ctx.fill();
        ctx.font='13px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.80)';ctx.textAlign='left';ctx.textBaseline='top';
        let ty=curY+(rowH-tLines.length*20-(hasDue?18:0))/2;tLines.forEach(line=>{ctx.fillText(line,PAD+28,ty);ty+=20;});
        if(hasDue){ctx.font='11px system-ui,sans-serif';ctx.fillStyle='rgba(239,68,68,0.85)';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText('Due: '+(task.deadline||task.due_date),PAD+28,curY+rowH-8);}
        ctx.font='bold 10px system-ui,sans-serif';ctx.fillStyle=pColor;ctx.textAlign='right';ctx.textBaseline='middle';
        ctx.fillText((task.priority||'').toUpperCase(),W-PAD-8,curY+rowH/2-(hasDue?9:0));
        curY+=rowH+6;
      });curY+=10;
    }

    // Footer
    const botG=ctx.createLinearGradient(0,0,W,0);botG.addColorStop(0,'#7c3aed');botG.addColorStop(0.5,'#2563eb');botG.addColorStop(1,'#10b981');
    ctx.fillStyle=botG;ctx.fillRect(0,TOTAL_H-4,W,4);
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='10px system-ui,sans-serif';ctx.fillStyle='rgba(255,255,255,0.2)';
    ctx.fillText('ChordStar Music  ·  chordstarmusic.com  ·  '+dateStr,W/2,TOTAL_H-20);
  }

  // ── Canvas utility helpers ────────────────────────────────
  function bGlow(ctx,cx,cy,r,color){
    const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    g.addColorStop(0,color); g.addColorStop(1,'transparent');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
  }
  function bRoundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+r);
    ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
    ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
    ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.closePath();
  }
  function bShade(hex,p){
    const n=parseInt(hex.replace('#',''),16);
    const r=Math.max(0,Math.min(255,(n>>16)+p));
    const g=Math.max(0,Math.min(255,((n>>8)&0xff)+p));
    const b=Math.max(0,Math.min(255,(n&0xff)+p));
    return `rgb(${r},${g},${b})`;
  }
  // Keep old helpers as aliases so nothing else breaks
  function roundRect(ctx,x,y,w,h,r){bRoundRect(ctx,x,y,w,h,r);}
  function shadeColor(hex,p){return bShade(hex,p);}
  function wrapText(ctx,text,x,y,maxW,lineH){
    const words=text.split(' '); let line='';
    for(let i=0;i<words.length;i++){
      const test=line+words[i]+' ';
      if(ctx.measureText(test).width>maxW&&i>0){ctx.fillText(line,x,y);line=words[i]+' ';y+=lineH;}
      else{line=test;}
    }
    ctx.fillText(line,x,y);
  }
  function drawCircleProgress(ctx,cx,cy,r,pct,color,trackColor){
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2);
    ctx.strokeStyle=trackColor; ctx.lineWidth=12; ctx.stroke();
    const start=-Math.PI/2;
    ctx.beginPath(); ctx.arc(cx,cy,r,start,start+Math.PI*2*Math.min(pct,1));
    ctx.strokeStyle=color; ctx.lineWidth=12; ctx.lineCap='round'; ctx.stroke();
  }

    /* ─── Sprint 4: Fee Reminder WhatsApp ───────────────────── */
  function sendFeeReminderWhatsApp(studentId) {
    const student=Students.getStudentById(studentId); if (!student) return;
    const feeAmt=formatFee(student.fee_amount);
    if (!feeAmt) { showToast('No fee amount set','error'); return; }
    const now=new Date();
    const month=now.toLocaleDateString('en-IN',{month:'long',year:'numeric'});
    let text=`Namaste 🙏\n\nYeh ${month} ki music class fee reminder hai.\n\n`;
    text+=`*Student:* ${student.name}\n*Fee:* ${feeAmt}\n*Status:* ${FM[student.fee_status]?.label||'Unpaid'}\n\n`;
    text+=`Please fee jaldi submit karein.\n\nDhanyawad! 🎸\n_ChordStar_`;
    if (student.phone) { window.open(`https://wa.me/91${student.phone.replace(/\D/g,'')}?text=${encodeURIComponent(text)}`,'_blank'); }
    else { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank'); }
  }

  /* ─── Context Menu ───────────────────────────────────────── */
  function showContextMenu(x,y,actions) {
    document.querySelectorAll('.ctx-menu').forEach(m=>m.remove());
    const menu=el('div','ctx-menu');
    actions.forEach(({label,icon,cls,onClick})=>{
      const btn=el('button',`ctx-menu-item ${cls||''}`,`${icon} ${label}`);
      btn.addEventListener('click',e=>{ e.stopPropagation(); menu.remove(); onClick(); });
      menu.appendChild(btn);
    });
    document.body.appendChild(menu);
    const mW=160, mH=actions.length*44+8, vW=window.innerWidth, vH=window.innerHeight;
    menu.style.left=`${Math.min(x,vW-mW-8)}px`; menu.style.top=`${Math.min(y,vH-mH-8)}px`;
    setTimeout(()=>{ document.addEventListener('click',function d(){ menu.remove(); document.removeEventListener('click',d); },{once:true}); },0);
  }

  /* ─── Task Card ──────────────────────────────────────────── */
  function renderTaskCard(task,{showStudent,studentName,showEdit,onEdit,onToggle,onDelete}) {
    const isDone=task.status==='done', overdue=!isDone&&isOverdue(task.deadline);
    const card=el('div',`task-card ${isDone?'done':''}`);
    const checkBtn=el('button',`task-check ${isDone?'done':''}`,isDone?'✓':'');
    checkBtn.addEventListener('click',e=>{ e.stopPropagation(); if(!isDone){checkBtn.classList.add('bounce');checkBtn.addEventListener('animationend',()=>checkBtn.classList.remove('bounce'),{once:true});} onToggle&&onToggle(task.id,isDone?'pending':'done'); });
    const body=el('div','task-body'), pm=PM[task.priority]||PM.medium;
    const recurIcons={weekly:'📆',monthly:'📅'};
    const recurBadge=task.recurring&&task.recurring!=='none'?`<span class="recur-badge">${recurIcons[task.recurring]||'🔁'} ${task.recurring}</span>`:'';
    let meta=`<span class="task-badge ${task.status}">${task.status}</span><span class="priority-badge ${pm.cls}">${pm.dot} ${pm.label}</span>${recurBadge}`;
    if (showStudent&&studentName) meta+=`<span class="task-student-label">${escHtml(studentName)}</span>`;
    if (task.deadline) meta+=`<span class="task-deadline ${overdue?'overdue':''}">${overdue?'⚠ ':''}${formatDate(task.deadline)}</span>`;
    body.innerHTML=`<span class="task-title">${escHtml(task.title)}</span><div class="task-meta">${meta}</div>${task.notes?`<div class="task-reminder">💡 ${escHtml(task.notes)}</div>`:''}`;
    card.appendChild(checkBtn); card.appendChild(body);
    if (showEdit&&(onEdit||onDelete)) {
      let pressTimer=null;
      const trigCtx=(e)=>{ const x=e.changedTouches?e.changedTouches[0].clientX:e.clientX, y=e.changedTouches?e.changedTouches[0].clientY:e.clientY; const acts=[]; if(onEdit) acts.push({label:'Edit',icon:'✏',onClick:()=>onEdit(task.id)}); if(onDelete) acts.push({label:'Delete',icon:'🗑',cls:'ctx-danger',onClick:()=>{if(confirm('Delete this task?'))onDelete(task.id);}}); showContextMenu(x,y,acts); };
      card.addEventListener('touchstart',e=>{ pressTimer=setTimeout(()=>trigCtx(e),500); },{passive:true});
      card.addEventListener('touchend',()=>clearTimeout(pressTimer));
      card.addEventListener('touchmove',()=>clearTimeout(pressTimer));
      const editBtn=el('button','task-edit-btn','✏'); editBtn.title='Edit task';
      editBtn.addEventListener('click',e=>{ e.stopPropagation(); onEdit&&onEdit(task.id); });
      card.appendChild(editBtn);
    }
    if (!showEdit&&onDelete) {
      const del=el('button','task-del-btn','🗑');
      del.addEventListener('click',e=>{ e.stopPropagation(); onDelete&&onDelete(task.id); });
      card.appendChild(del);
    }
    return card;
  }

  /* ─── Modals ─────────────────────────────────────────────── */
  function showAddStudentWizard(onSuccess) {
    openModal('Add Student — Step 1 of 2',`
      <div class="wizard-steps"><div class="wizard-step active">1</div><div class="wizard-step-line"></div><div class="wizard-step">2</div></div>
      <p class="wizard-hint">Basic info</p>
      <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" id="inp-sname" type="text" placeholder="e.g. Rahul Sharma" autocomplete="off" /></div>
      <div class="form-group"><label class="form-label">Phone Number</label><input class="form-input" id="inp-sphone" type="tel" placeholder="e.g. 9876543210" /></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-wiz-next">Next →</button><button class="btn btn-secondary" id="btn-wiz-cancel">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('inp-sname').focus();
      document.getElementById('btn-wiz-next').addEventListener('click',()=>{
        const name=document.getElementById('inp-sname').value.trim(), phone=document.getElementById('inp-sphone').value.trim();
        if (!name) { showToast('Name required','error'); return; }
        openModal('Add Student — Step 2 of 2',`
          <div class="wizard-steps"><div class="wizard-step done">✓</div><div class="wizard-step-line active"></div><div class="wizard-step active">2</div></div>
          <p class="wizard-hint">Fee &amp; notes (optional)</p>
          <div class="form-group"><label class="form-label">Monthly Fee (₹)</label><input class="form-input" id="inp-sfee" type="number" placeholder="e.g. 1500" min="0" /></div>
          <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="inp-snotes" placeholder="Learning goals, preferred style…"></textarea></div>
          <div class="form-actions"><button class="btn btn-primary" id="btn-wiz-save">Add Student 🎸</button><button class="btn btn-secondary" id="btn-wiz-back">← Back</button></div>`);
        setTimeout(()=>{
          document.getElementById('inp-sfee').focus();
          document.getElementById('btn-wiz-save').addEventListener('click',()=>{
            const fee=document.getElementById('inp-sfee').value, notes=document.getElementById('inp-snotes').value;
            const r=Students.addStudent({name,phone,fee_amount:fee,notes});
            if (!r.ok) { showToast(r.error,'error'); return; }
            closeModal(); showToast(`${r.student.name} added! 🎸`,'success'); onSuccess&&onSuccess();
          });
          document.getElementById('btn-wiz-back').addEventListener('click',()=>showAddStudentWizard(onSuccess));
        },50);
      });
      document.getElementById('btn-wiz-cancel').addEventListener('click',closeModal);
    },50);
  }

  function showAddStudentModal(onSuccess) { showAddStudentWizard(onSuccess); }

  function showEditStudentModal(studentId,onSuccess) {
    const s=Students.getStudentById(studentId); if (!s) return;
    openModal('Edit Student',`
      <div class="form-group"><label class="form-label">Full Name *</label><input class="form-input" id="inp-en" type="text" value="${escHtml(s.name)}" autocomplete="off" /></div>
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="inp-ep" type="tel" value="${escHtml(s.phone||'')}" /></div>
      <div class="form-group"><label class="form-label">Monthly Fee (₹)</label><input class="form-input" id="inp-ef" type="number" value="${s.fee_amount||''}" min="0" /></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-eu">Save</button><button class="btn btn-secondary" id="btn-ec">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('btn-eu').addEventListener('click',()=>{
        const r=Students.updateStudent(studentId,{name:document.getElementById('inp-en').value,phone:document.getElementById('inp-ep').value,fee_amount:document.getElementById('inp-ef').value});
        if (!r.ok) { showToast(r.error,'error'); return; }
        closeModal(); showToast('Updated ✓','success'); onSuccess&&onSuccess();
      });
      document.getElementById('btn-ec').addEventListener('click',closeModal);
    },50);
  }

  function showAddTaskModal(studentId,onSuccess) {
    openModal('Add Task',`
      <div class="form-group"><label class="form-label">Task Title *</label><input class="form-input" id="inp-tt" type="text" placeholder="e.g. Practice C major scale" autocomplete="off" /></div>
      <div class="form-group"><label class="form-label">Reminder (optional)</label><input class="form-input" id="inp-tn" type="text" placeholder="e.g. Focus on transitions" autocomplete="off" /></div>
      <div class="form-group"><label class="form-label">Priority</label><div class="seg-control" id="priority-seg"><button class="seg-btn" data-val="high">🔴 High</button><button class="seg-btn active" data-val="medium">🟡 Medium</button><button class="seg-btn" data-val="low">🟢 Low</button></div></div>
      <div class="form-group"><label class="form-label">Deadline (optional)</label><div class="date-picker-wrap"><span class="date-cal-icon" id="cal-icon">📅</span><input class="form-input date-input" id="inp-task-deadline" type="date" /><button type="button" class="date-clear-btn" id="date-clear-btn" style="display:none">✕</button></div><div class="date-display" id="date-display"></div></div>
      <div class="form-group"><label class="form-label">Repeat</label><div class="seg-control" id="recur-seg"><button class="seg-btn active" data-val="none">🚫 Once</button><button class="seg-btn" data-val="weekly">📆 Weekly</button><button class="seg-btn" data-val="monthly">📅 Monthly</button></div></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-st">Add Task</button><button class="btn btn-secondary" id="btn-ct">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('inp-tt').focus();
      let sp='medium', sr='none';
      document.querySelectorAll('#priority-seg .seg-btn').forEach(b=>b.addEventListener('click',()=>{ document.querySelectorAll('#priority-seg .seg-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); sp=b.dataset.val; }));
      document.querySelectorAll('#recur-seg .seg-btn').forEach(b=>b.addEventListener('click',()=>{ document.querySelectorAll('#recur-seg .seg-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); sr=b.dataset.val; }));
      _initCalendarPicker();
      document.getElementById('btn-st').addEventListener('click',()=>{
        const r=Tasks.addTask({student_id:studentId,title:document.getElementById('inp-tt').value,notes:document.getElementById('inp-tn').value,deadline:document.getElementById('inp-task-deadline').value,priority:sp,recurring:sr});
        if (!r.ok) { showToast(r.error,'error'); return; }
        closeModal(); showToast('Task added ✓','success'); onSuccess&&onSuccess();
      });
      document.getElementById('btn-ct').addEventListener('click',closeModal);
    },50);
  }

  function showEditTaskModal(taskId,studentId,onSuccess) {
    const task=Storage.getDB().tasks.find(t=>t.id===taskId); if (!task) return;
    const pOpts=['high','medium','low'].map(p=>`<button class="seg-btn ${task.priority===p?'active':''}" data-val="${p}">${p==='high'?'🔴 High':p==='medium'?'🟡 Medium':'🟢 Low'}</button>`).join('');
    openModal('Edit Task',`
      <div class="form-group"><label class="form-label">Task Title *</label><input class="form-input" id="inp-ett" type="text" value="${escHtml(task.title)}" autocomplete="off" /></div>
      <div class="form-group"><label class="form-label">Reminder</label><input class="form-input" id="inp-etn" type="text" value="${escHtml(task.notes||'')}" /></div>
      <div class="form-group"><label class="form-label">Priority</label><div class="seg-control" id="ep-seg">${pOpts}</div></div>
      <div class="form-group"><label class="form-label">Deadline</label><div class="date-picker-wrap"><span class="date-cal-icon" id="cal-icon">📅</span><input class="form-input date-input" id="inp-task-deadline" type="date" value="${task.deadline||''}" /><button type="button" class="date-clear-btn" id="date-clear-btn" ${task.deadline?'':'style="display:none"'}>✕</button></div><div class="date-display" id="date-display">${task.deadline?'📅 '+new Date(task.deadline+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'}):''}</div></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-upt">Save</button><button class="btn btn-secondary" id="btn-cet">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('inp-ett').focus();
      let sp=task.priority||'medium';
      document.querySelectorAll('#ep-seg .seg-btn').forEach(b=>b.addEventListener('click',()=>{ document.querySelectorAll('#ep-seg .seg-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active'); sp=b.dataset.val; }));
      _initCalendarPicker();
      document.getElementById('btn-upt').addEventListener('click',()=>{
        const r=Tasks.updateTask(taskId,{title:document.getElementById('inp-ett').value,notes:document.getElementById('inp-etn').value,deadline:document.getElementById('inp-task-deadline').value,priority:sp});
        if (!r.ok) { showToast(r.error,'error'); return; }
        closeModal(); showToast('Updated ✓','success'); onSuccess&&onSuccess();
      });
      document.getElementById('btn-cet').addEventListener('click',closeModal);
    },50);
  }

  function showProgressEntryModal(studentId,onSuccess) {
    const today=new Date().toISOString().slice(0,10);
    openModal('Add Class Entry',`
      <div class="form-group"><label class="form-label">Topic Covered *</label><input class="form-input" id="inp-topic" type="text" placeholder="e.g. Barre chords" autocomplete="off" /></div>
      <div class="form-group"><label class="form-label">Class Date</label><input class="form-input" id="inp-cdate" type="date" value="${today}" /></div>
      <div class="form-group"><label class="form-label">Class Quality ⭐</label><div class="star-rating" id="star-rating">${[1,2,3,4,5].map(n=>`<button class="star-btn" data-v="${n}">☆</button>`).join('')}</div></div>
      <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="inp-pnotes" placeholder="Observations, tips…"></textarea></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-spe">Save Entry</button><button class="btn btn-secondary" id="btn-cpe">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('inp-topic').focus();
      let rating=0;
      document.querySelectorAll('.star-btn').forEach(b=>{
        b.addEventListener('click',()=>{ rating=Number(b.dataset.v); document.querySelectorAll('.star-btn').forEach((s,i)=>{ s.textContent=i<rating?'⭐':'☆'; }); });
      });
      document.getElementById('btn-spe').addEventListener('click',()=>{
        const r=Students.addProgressEntry(studentId,{topic:document.getElementById('inp-topic').value,date:document.getElementById('inp-cdate').value,notes:document.getElementById('inp-pnotes').value,rating});
        if (!r.ok) { showToast(r.error,'error'); return; }
        closeModal(); showToast('Entry saved ✓','success'); onSuccess&&onSuccess();
      });
      document.getElementById('btn-cpe').addEventListener('click',closeModal);
    },50);
  }

  /* ─── Collected Modal: shows which students paid this month ── */
  function showCollectedModal() {
    const db = Storage.getDB();
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const monthLabel = now.toLocaleDateString('en-IN',{month:'long',year:'numeric'});

    // Group fee_records by student for this month
    const records = (db.fee_records||[]).filter(f=>f.date.startsWith(prefix));
    const byStudent = {};
    records.forEach(f=>{
      if (!byStudent[f.student_id]) byStudent[f.student_id]={ total:0, payments:[] };
      byStudent[f.student_id].total += f.amount;
      byStudent[f.student_id].payments.push(f);
    });

    const studentIds = Object.keys(byStudent);
    let bodyHtml = `<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">${monthLabel}</div>`;

    if (studentIds.length===0) {
      bodyHtml += `<div style="text-align:center;padding:24px 0;color:var(--text-muted);">कोई payment नहीं मिली अभी तक</div>`;
    } else {
      bodyHtml += `<div style="display:flex;flex-direction:column;gap:10px;">`;
      studentIds.forEach(sid=>{
        const student = db.students.find(s=>s.id===sid);
        if (!student) return;
        const data = byStudent[sid];
        const initials = student.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        const color = student.color||'#3498db';
        const feeAmt = student.fee_amount||0;
        const isPaid = student.fee_status==='paid';
        bodyHtml += `
          <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-card);border-radius:10px;">
            <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
            <div style="flex:1;">
              <div style="font-weight:600;font-size:14px;">${escHtml(student.name)}</div>
              <div style="font-size:12px;color:var(--text-muted);">₹${data.total.toLocaleString('en-IN')} received${feeAmt>0?' / ₹'+feeAmt.toLocaleString('en-IN')+' total':''}</div>
            </div>
            <span style="font-size:11px;padding:3px 8px;border-radius:6px;background:${isPaid?'#1a472a':'#2a2a2a'};color:${isPaid?'#2ecc71':'#f39c12'};font-weight:600;">${isPaid?'✓ Paid':'Partial'}</span>
          </div>`;
      });
      bodyHtml += `</div>`;
      const grandTotal = studentIds.reduce((s,sid)=>s+byStudent[sid].total,0);
      bodyHtml += `<div style="margin-top:14px;padding:10px 14px;background:var(--bg-card);border-radius:10px;display:flex;justify-content:space-between;font-weight:700;">
        <span>Total Collected</span><span style="color:#2ecc71;">₹${grandTotal.toLocaleString('en-IN')}</span></div>`;
    }
    openModal('💰 Collected Fees', bodyHtml + `<div class="form-actions"><button class="btn btn-secondary" id="btn-cls-col">Close</button></div>`);
    setTimeout(()=>{ document.getElementById('btn-cls-col')?.addEventListener('click',closeModal); },50);
  }

  /* ─── Unpaid Students Modal ─────────────────────────────── */
  function showUnpaidStudentsModal() {
    const db = Storage.getDB();
    const unpaidStudents = db.students.filter(s=>(s.status||'active')==='active' && s.fee_status==='unpaid' && (s.fee_amount||0)>0);
    const partialStudents = db.students.filter(s=>(s.status||'active')==='active' && s.fee_status==='partial' && (s.fee_amount||0)>0);
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const allDue = [...unpaidStudents, ...partialStudents];

    const buildModal = () => {
      let bodyHtml = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Tap a student to log payment</div>`;
      if (allDue.length===0) {
        bodyHtml += `<div style="text-align:center;padding:28px 0;"><div style="font-size:36px;margin-bottom:8px;">🎉</div><div style="color:var(--text-muted);font-size:14px;">All students have paid!</div></div>`;
      } else {
        bodyHtml += `<div style="display:flex;flex-direction:column;gap:8px;">`;
        allDue.forEach(student => {
          const collected = (db.fee_records||[]).filter(f=>f.student_id===student.id&&f.date.startsWith(prefix)).reduce((s,f)=>s+f.amount,0);
          const pending = Math.max(0,(student.fee_amount||0)-collected);
          const initials = student.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
          const isPartial = student.fee_status==='partial';
          bodyHtml += `
            <div class="unpaid-row" data-sid="${student.id}" style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-card);border-radius:10px;cursor:pointer;border:1px solid transparent;transition:border-color 0.15s;">
              <div style="width:38px;height:38px;border-radius:50%;background:${student.color||'#e74c3c'};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:14px;">${escHtml(student.name)}</div>
                <div style="font-size:12px;color:#e05050;margin-top:1px;">₹${pending.toLocaleString('en-IN')} due${isPartial?' · Partial':''}</div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;">
                <span style="font-size:11px;background:#2ecc7122;color:#2ecc71;padding:3px 8px;border-radius:6px;font-weight:600;">+ Pay</span>
              </div>
            </div>`;
        });
        bodyHtml += `</div>`;
      }
      openModal('⏳ Unpaid Students', bodyHtml + `<div class="form-actions"><button class="btn btn-secondary" id="btn-cls-unp">Close</button></div>`);
      setTimeout(()=>{
        document.getElementById('btn-cls-unp')?.addEventListener('click', closeModal);
        document.querySelectorAll('.unpaid-row').forEach(row => {
          row.addEventListener('mouseenter', ()=>{ row.style.borderColor='rgba(46,204,113,0.3)'; });
          row.addEventListener('mouseleave', ()=>{ row.style.borderColor='transparent'; });
          row.addEventListener('click', () => {
            const sid = row.dataset.sid;
            closeModal();
            setTimeout(()=>{ showLogFeeModal(sid, ()=>{ renderDashboard(); showUnpaidStudentsModal(); }); }, 200);
          });
        });
      }, 50);
    };
    buildModal();
  }

  function showLogFeeModal(studentId,onSuccess) {
    const student=Students.getStudentById(studentId);
    const today=new Date().toISOString().slice(0,10);
    openModal('Log Payment',`
      <div class="form-group"><label class="form-label">Amount (₹) *</label><input class="form-input" id="inp-fa" type="number" min="1" value="${student?.fee_amount||''}" /></div>
      <div class="form-group"><label class="form-label">Payment Date</label><input class="form-input" id="inp-fd" type="date" value="${today}" /></div>
      <div class="form-group"><label class="form-label">Note (optional)</label><input class="form-input" id="inp-fn" type="text" placeholder="e.g. April fee" autocomplete="off" /></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-sp">Save</button><button class="btn btn-secondary" id="btn-cp">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('inp-fa').focus();
      document.getElementById('btn-sp').addEventListener('click',()=>{
        const amount=document.getElementById('inp-fa').value, date=document.getElementById('inp-fd').value, note=document.getElementById('inp-fn').value;
        const r=Students.addFeeRecord(studentId,{amount,date,note});
        if (!r.ok) { showToast(r.error,'error'); return; }
        // Auto-update fee_status based on total collected this month
        if (student && (student.fee_amount||0)>0) {
          const now2=new Date(), pfx=`${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}`;
          const totalPaid=(Storage.getDB().fee_records||[]).filter(f=>f.student_id===studentId&&f.date.startsWith(pfx)).reduce((s,f)=>s+f.amount,0);
          if (totalPaid>=student.fee_amount) Students.updateFeeStatus(studentId,'paid');
          else if (totalPaid>0) Students.updateFeeStatus(studentId,'partial');
          else Students.updateFeeStatus(studentId,'unpaid');
        }
        closeModal(); showToast('Payment logged ✓','success'); onSuccess&&onSuccess();
      });
      document.getElementById('btn-cp').addEventListener('click',closeModal);
    },50);
  }

  /* ─── Sprint 4: Schedule Modal ───────────────────────────── */
  function showScheduleModal(studentId, student, onSuccess) {
    const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const current=Students.getSchedule(studentId);
    const rows=days.map((day,i)=>{
      const existing=current.find(s=>s.day===i);
      return `<div class="sch-row">
        <span class="sch-day-label">${day}</span>
        <input class="form-input sch-time" type="time" data-day="${i}" value="${existing?.time||''}" placeholder="--:--" />
        <select class="form-input sch-dur" data-day="${i}" style="width:90px">
          ${[30,45,60,90,120].map(d=>`<option value="${d}" ${(existing?.duration_min||60)===d?'selected':''}>${d}m</option>`).join('')}
        </select>
      </div>`;
    }).join('');
    openModal(`Schedule – ${student.name}`,`<p style="font-size:12px;color:var(--text2);margin-bottom:12px">Leave time blank to skip that day.</p>${rows}<div class="form-actions"><button class="btn btn-primary" id="btn-ss">Save Schedule</button><button class="btn btn-secondary" id="btn-cs">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('btn-ss').addEventListener('click',()=>{
        const slots=days.map((_,i)=>({ day:i, time:document.querySelector(`.sch-time[data-day="${i}"]`).value, duration_min:document.querySelector(`.sch-dur[data-day="${i}"]`).value }));
        Students.setSchedule(studentId,slots);
        closeModal(); showToast('Schedule saved ✓','success'); onSuccess&&onSuccess();
      });
      document.getElementById('btn-cs').addEventListener('click',closeModal);
    },50);
  }

  /* ─── Sprint 5: Add Syllabus Modal ──────────────────────── */
  function showAddSyllabusModal(studentId, onSuccess) {
    openModal('Add Syllabus Item',`
      <div class="form-group"><label class="form-label">Item Title *</label><input class="form-input" id="inp-syt" type="text" placeholder="e.g. C Major Scale, Raga Yaman" autocomplete="off" /></div>
      <div class="form-group"><label class="form-label">Category</label><input class="form-input" id="inp-syc" type="text" placeholder="e.g. Scales, Songs, Techniques" value="General" autocomplete="off" /></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-sy">Add</button><button class="btn btn-secondary" id="btn-syc2">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('inp-syt').focus();
      document.getElementById('btn-sy').addEventListener('click',()=>{
        const r=Students.addSyllabusItem(studentId,{title:document.getElementById('inp-syt').value,category:document.getElementById('inp-syc').value});
        if (!r.ok) { showToast(r.error,'error'); return; }
        closeModal(); showToast('Added ✓','success'); onSuccess&&onSuccess();
      });
      document.getElementById('btn-syc2').addEventListener('click',closeModal);
    },50);
  }

  /* ─── Sprint 3: Push Notification Modal ─────────────────── */
  function showNotifSettings() {
    const enabled=getPushEnabled();
    const supported='Notification' in window;
    openModal('🔔 Notifications',`
      <div style="text-align:center;padding:8px 0 24px">
        <div style="font-size:48px;margin-bottom:8px">🔔</div>
        <p style="color:var(--text2);font-size:13px;margin-bottom:16px">${supported?'Get reminded about task deadlines and fee dues.':'Push notifications are not supported on this device/browser.'}</p>
        ${supported?`<button class="btn ${enabled?'btn-secondary':'btn-primary'}" id="btn-push-toggle" style="width:100%;padding:14px">${enabled?'✓ Notifications ON — Tap to disable':'Enable Notifications'}</button>`:''}
        <p style="font-size:11px;color:var(--text3,var(--text2));margin-top:16px">Note: For background push, deploy with a VAPID server.</p>
      </div>
      <div class="form-actions"><button class="btn btn-secondary" id="btn-cn">Close</button></div>`);
    setTimeout(()=>{
      document.getElementById('btn-cn').addEventListener('click',closeModal);
      document.getElementById('btn-push-toggle')?.addEventListener('click',async()=>{
        if (enabled) { setPushEnabled(false); closeModal(); showToast('Notifications disabled'); }
        else { const ok=await requestPushPermission(); if(ok){ setPushEnabled(true); closeModal(); } }
      });
    },50);
  }

  /* ─── Export Modal ───────────────────────────────────────── */
  function showExportModal() {
    openModal('Export Backup',`
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Download a full backup of your ChordStar data as a <strong>JSON file</strong>.<br>Keep it safe — you can restore it anytime via Import.</p>
      <div class="form-actions">
        <button class="btn btn-primary" id="btn-do-export">💾 Download Backup</button>
        <button class="btn btn-secondary" id="btn-ce">Cancel</button>
      </div>`);
    setTimeout(()=>{
      document.getElementById('btn-do-export').addEventListener('click',()=>{
        Storage.exportJSON();
        closeModal();
        showToast('Backup downloaded 💾','success');
      });
      document.getElementById('btn-ce').addEventListener('click',closeModal);
    },50);
  }

  /* ─── Import Modal ───────────────────────────────────────── */
  function showImportModal(onSuccess) {
    openModal('Import Backup',`
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">Select a <strong>chordstar_backup_*.json</strong> file.<br>⚠️ This replaces all current data.</p>
      <div class="form-group"><label class="form-label">Choose JSON file</label><input class="form-input" id="inp-if" type="file" accept=".json" /></div>
      <div class="form-actions"><button class="btn btn-primary" id="btn-di">Restore</button><button class="btn btn-secondary" id="btn-ci">Cancel</button></div>`);
    setTimeout(()=>{
      document.getElementById('btn-di').addEventListener('click',()=>{
        const f=document.getElementById('inp-if').files[0]; if (!f) { showToast('Select a file','error'); return; }
        const reader=new FileReader();
        reader.onload=e=>{ const r=Storage.importJSON(e.target.result); if (!r.ok){ showToast(r.error,'error'); return; } closeModal(); showToast('Restored! 🎉','success'); onSuccess&&onSuccess(); };
        reader.readAsText(f);
      });
      document.getElementById('btn-ci').addEventListener('click',closeModal);
    },50);
  }

  /* ─── Calendar Picker ────────────────────────────────────── */
  function _initCalendarPicker() {
    const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS=['Su','Mo','Tu','We','Th','Fr','Sa'];
    const di=document.getElementById('inp-task-deadline'), ci=document.getElementById('cal-icon'),
          cb=document.getElementById('date-clear-btn'), dd=document.getElementById('date-display');
    if (!di) return;
    let open=false, vy=new Date().getFullYear(), vm=new Date().getMonth(), sd=di.value||null;
    function upd() { if(sd){dd.textContent='📅 '+new Date(sd+'T00:00:00').toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'long',year:'numeric'});dd.className='date-display has-date';cb.style.display='flex';}else{dd.textContent='';dd.className='date-display';cb.style.display='none';} }
    function build() {
      document.getElementById('cal-popup')?.remove();
      const today=new Date().toISOString().slice(0,10), fd=new Date(vy,vm,1).getDay(), dim=new Date(vy,vm+1,0).getDate();
      const p=document.createElement('div'); p.id='cal-popup'; p.className='cal-popup';
      p.innerHTML=`<div class="cal-header"><button class="cal-nav" id="cp">‹</button><span class="cal-month-label">${MONTHS[vm]} ${vy}</span><button class="cal-nav" id="cn">›</button></div><div class="cal-grid">${DAYS.map(d=>`<span class="cal-day-name">${d}</span>`).join('')}${Array(fd).fill('<span></span>').join('')}${Array.from({length:dim},(_,i)=>{const n=i+1,ds=`${vy}-${String(vm+1).padStart(2,'0')}-${String(n).padStart(2,'0')}`;return `<button class="cal-day${ds===sd?' selected':''}${ds===today?' today':''}" data-date="${ds}">${n}</button>`;}).join('')}</div><div class="cal-footer"><button class="cal-today-btn" id="ct">Today</button></div>`;
      document.querySelector('.date-picker-wrap').parentNode.insertBefore(p,document.querySelector('.date-picker-wrap').nextSibling);
      p.querySelector('#cp').addEventListener('click',e=>{e.stopPropagation();vm--;if(vm<0){vm=11;vy--;}build();});
      p.querySelector('#cn').addEventListener('click',e=>{e.stopPropagation();vm++;if(vm>11){vm=0;vy++;}build();});
      p.querySelector('#ct').addEventListener('click',e=>{e.stopPropagation();sd=new Date().toISOString().slice(0,10);di.value=sd;close2();upd();});
      p.querySelectorAll('.cal-day').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();sd=b.dataset.date;di.value=sd;close2();upd();}));
    }
    function open2(){open=true;build();document.querySelector('.date-picker-wrap').classList.add('cal-open');}
    function close2(){open=false;document.getElementById('cal-popup')?.remove();document.querySelector('.date-picker-wrap')?.classList.remove('cal-open');}
    ci.addEventListener('click',e=>{e.stopPropagation();open?close2():open2();});
    di.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open?close2():open2();});
    cb.addEventListener('click',e=>{e.stopPropagation();sd=null;di.value='';close2();upd();});
    document.addEventListener('click',function h(e){if(!e.target.closest('#cal-popup')&&!e.target.closest('.date-picker-wrap')){close2();document.removeEventListener('click',h);}});
    upd();
  }

  /* ─── Sprint 7: Growth Summary Card ─────────────────────── */
  function buildGrowthCard(studentId) {
    const section = el('div','detail-section growth-card-section');
    const streak  = Students.getAttendanceStreak(studentId);
    const sylComp = Students.getSyllabusCompletion(studentId);
    const attRate = Students.getAttendanceRate(studentId);
    const avgRat  = Students.getAvgRating(studentId);
    const ratings = Students.getRecentRatings(studentId, 12);
    const tasks   = Tasks.getTasksByStudent(studentId);
    const doneT   = tasks.filter(t=>t.status==='done').length;
    const taskRate= tasks.length>0?Math.round(doneT/tasks.length*100):null;

    const attColor  = attRate===null?'var(--text3)':attRate>=75?'#40c080':attRate>=50?'#e09840':'#e05050';
    const ratColor  = avgRat===null?'var(--text3)':avgRat>=4?'#40c080':avgRat>=3?'#e09840':'#e05050';
    const taskColor = taskRate===null?'var(--text3)':taskRate>=75?'#40c080':taskRate>=50?'#e09840':'#e05050';

    const hdr = el('div','detail-section-header');
    hdr.innerHTML=`<span class="detail-section-title">Growth Overview</span>
      <button class="btn-edit-progress quick-log-trigger" data-sid="${studentId}">📝 Quick Log</button>`;
    section.appendChild(hdr);

    // Stats row
    const statsRow = el('div','growth-stats-row');
    statsRow.innerHTML=`
      <div class="growth-stat">
        <span class="growth-stat-val" style="color:${attColor}">${attRate!==null?attRate+'%':'—'}</span>
        <span class="growth-stat-label">Attendance</span>
      </div>
      <div class="growth-stat">
        <span class="growth-stat-val" style="color:${ratColor}">${avgRat!==null?avgRat+' ★':'—'}</span>
        <span class="growth-stat-label">Avg Rating</span>
      </div>
      <div class="growth-stat">
        <span class="growth-stat-val" style="color:${taskColor}">${taskRate!==null?taskRate+'%':'—'}</span>
        <span class="growth-stat-label">Tasks Done</span>
      </div>
      <div class="growth-stat">
        <span class="growth-stat-val" style="color:${streak>=5?'#f0c040':'var(--text)'}">${streak>0?streak:'—'}</span>
        <span class="growth-stat-label">${streak>=3?'🔥 Streak':'Streak'}</span>
      </div>`;
    section.appendChild(statsRow);

    // Sparkline — rating trend
    if (ratings.length >= 2) {
      const sparkWrap = el('div','sparkline-wrap');
      sparkWrap.innerHTML=`<span class="spark-label">Rating trend (last ${ratings.length} sessions)</span>`;
      const canvas = document.createElement('canvas');
      canvas.className='sparkline-canvas'; canvas.height=48;
      sparkWrap.appendChild(canvas); section.appendChild(sparkWrap);
      requestAnimationFrame(()=>_drawSparkline(canvas, ratings.map(r=>r.rating)));
    }

    // Syllabus progress ring
    if (sylComp.total > 0) {
      const sylRow = el('div','growth-syllabus-row');
      const pct = sylComp.pct;
      const ringColor = pct===100?'#40c080':pct>=50?'#f0c040':'#e09840';
      const circumference = 2*Math.PI*18;
      const filled = (pct/100)*circumference;
      sylRow.innerHTML=`
        <svg class="syl-ring" width="44" height="44" viewBox="0 0 44 44">
          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="4"/>
          <circle cx="22" cy="22" r="18" fill="none" stroke="${ringColor}" stroke-width="4"
            stroke-dasharray="${filled.toFixed(1)} ${circumference.toFixed(1)}"
            stroke-linecap="round" transform="rotate(-90 22 22)"/>
          <text x="22" y="26" text-anchor="middle" font-size="10" font-weight="600" fill="${ringColor}">${pct}%</text>
        </svg>
        <div class="syl-ring-info">
          <span class="syl-ring-title">Syllabus</span>
          <span class="syl-ring-sub">${sylComp.done} of ${sylComp.total} items done</span>
        </div>`;
      section.appendChild(sylRow);
    }

    // Wire Quick Log button
    hdr.querySelector('.quick-log-trigger')?.addEventListener('click',()=>showQuickLogSheet(studentId,()=>renderStudentDetail(studentId)));
    return section;
  }

  /* Draw mini sparkline on canvas */
  function _drawSparkline(canvas, values) {
    if (!canvas || values.length<2) return;
    canvas.width = canvas.parentElement?.offsetWidth || 300;
    const ctx = canvas.getContext('2d');
    const w=canvas.width, h=canvas.height;
    const min=1, max=5;
    const pad=6;
    ctx.clearRect(0,0,w,h);
    // Grid lines at 1,3,5
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=1;
    [1,3,5].forEach(v=>{
      const y=h-pad-(v-min)/(max-min)*(h-pad*2);
      ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke();
    });
    // Line
    const pts=values.map((v,i)=>({
      x:pad+i*(w-pad*2)/(values.length-1),
      y:h-pad-(v-min)/(max-min)*(h-pad*2)
    }));
    const grad=ctx.createLinearGradient(0,0,w,0);
    grad.addColorStop(0,'#f0c040'); grad.addColorStop(1,'#40c080');
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));
    ctx.strokeStyle=grad; ctx.lineWidth=2.5; ctx.lineJoin='round'; ctx.lineCap='round'; ctx.stroke();
    // Dots
    pts.forEach((p,i)=>{
      ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2);
      ctx.fillStyle=i===pts.length-1?'#40c080':'rgba(240,192,64,0.7)'; ctx.fill();
    });
  }

  /* ─── Sprint 7: Quick Log Bottom Sheet ───────────────────── */
  function showQuickLogSheet(studentId, onDone) {
    const student = Students.getStudentById(studentId);
    if (!student) return;
    const today = new Date().toISOString().slice(0,10);
    const aStyle = avatarStyle(student.color);
    let selRating = 0, selAtt = 'attended';

    // Build sheet
    const overlay = el('div','ql-overlay');
    const sheet   = el('div','ql-sheet');
    const aStr    = avatarStyle(student.color);

    sheet.innerHTML=`
      <div class="ql-handle"></div>
      <div class="ql-header">
        <div class="ql-avatar" ${aStr}>${getInitials(student.name)}</div>
        <div class="ql-header-info">
          <span class="ql-name">${escHtml(student.name)}</span>
          <span class="ql-date">Session Log · ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
        </div>
        <button class="ql-close" id="ql-close-btn">✕</button>
      </div>

      <div class="ql-section">
        <label class="ql-label">Attendance</label>
        <div class="ql-att-row">
          <button class="ql-att-btn attended active" id="ql-att-present">✓ Attended</button>
          <button class="ql-att-btn missed" id="ql-att-missed">✕ Missed</button>
        </div>
      </div>

      <div class="ql-section" id="ql-content-section">
        <label class="ql-label">Topic Covered</label>
        <input class="ql-input" id="ql-topic" type="text" placeholder="e.g. C Major Scale, Raga Bhairav…" autocomplete="off"/>

        <label class="ql-label" style="margin-top:14px">Session Rating</label>
        <div class="ql-stars" id="ql-stars">
          ${[1,2,3,4,5].map(i=>`<button class="ql-star" data-val="${i}">★</button>`).join('')}
        </div>

        <label class="ql-label" style="margin-top:14px">Assign Practice Task <span style="opacity:.5;font-weight:400">(optional)</span></label>
        <input class="ql-input" id="ql-task" type="text" placeholder="e.g. Practice 15 min daily…" autocomplete="off"/>
      </div>

      <div class="ql-actions">
        <button class="btn btn-primary ql-save" id="ql-save-btn">Save Session ✓</button>
      </div>`;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    requestAnimationFrame(()=>{ overlay.classList.add('open'); sheet.classList.add('open'); });

    // Attendance toggle
    const attPresent = sheet.querySelector('#ql-att-present');
    const attMissed  = sheet.querySelector('#ql-att-missed');
    const contentSec = sheet.querySelector('#ql-content-section');
    attPresent.addEventListener('click',()=>{
      selAtt='attended'; attPresent.classList.add('active'); attMissed.classList.remove('active');
      contentSec.style.display='';
    });
    attMissed.addEventListener('click',()=>{
      selAtt='missed'; attMissed.classList.add('active'); attPresent.classList.remove('active');
      contentSec.style.display='none';
    });

    // Stars
    const stars = sheet.querySelectorAll('.ql-star');
    function setRating(v) {
      selRating=v;
      stars.forEach(s=>{ const sv=parseInt(s.dataset.val); s.classList.toggle('active',sv<=v); });
    }
    stars.forEach(s=>s.addEventListener('click',()=>setRating(parseInt(s.dataset.val))));

    // Close
    function closeSheet() {
      sheet.classList.remove('open'); overlay.classList.remove('open');
      setTimeout(()=>overlay.remove(),320);
    }
    sheet.querySelector('#ql-close-btn').addEventListener('click',closeSheet);
    overlay.addEventListener('click',e=>{ if(e.target===overlay)closeSheet(); });

    // Save
    sheet.querySelector('#ql-save-btn').addEventListener('click',()=>{
      const topic = sheet.querySelector('#ql-topic').value.trim();
      const taskTitle = sheet.querySelector('#ql-task').value.trim();

      // Always log attendance
      Students.addAttendance(studentId,{date:today,type:selAtt});

      // Log progress if present and topic filled
      if (selAtt==='attended' && topic) {
        Students.addProgressEntry(studentId,{topic,date:today,notes:'',rating:selRating||0});
      }

      // Add task if given
      if (taskTitle) {
        Tasks.addTask({student_id:studentId,title:taskTitle,priority:'medium',recurring:'none',deadline:'',notes:''});
      }

      closeSheet();
      const summary = selAtt==='attended'
        ? `✓ ${student.name} logged${topic?' — '+topic.slice(0,30):''}${taskTitle?' + task':''}`
        : `✕ Absence marked for ${student.name}`;
      showToast(summary,'success');
      onDone&&onDone();
    });

    // Swipe to close
    let startY=0;
    sheet.addEventListener('touchstart',e=>{ startY=e.touches[0].clientY; },{passive:true});
    sheet.addEventListener('touchmove',e=>{
      const dy=e.touches[0].clientY-startY;
      if(dy>0) sheet.style.transform=`translateY(${dy}px)`;
    },{passive:true});
    sheet.addEventListener('touchend',e=>{
      const dy=e.changedTouches[0].clientY-startY;
      sheet.style.transform='';
      if(dy>100)closeSheet();
    });

    setTimeout(()=>sheet.querySelector('#ql-topic').focus(),400);
  }

  /* ─── Event Wiring ───────────────────────────────────────── */
  function bindEvents() {
    document.getElementById('modal-close').addEventListener('click',closeModal);
    document.getElementById('modal-overlay').addEventListener('click',e=>{ if(e.target===document.getElementById('modal-overlay'))closeModal(); });
    document.getElementById('fab-add-student')?.addEventListener('click',()=>showAddStudentWizard(()=>{renderStudents();renderDashboard();}));
    document.querySelectorAll('.nav-btn').forEach(btn=>btn.addEventListener('click',()=>App.navigate(btn.dataset.screen)));
    document.getElementById('student-search')?.addEventListener('input',e=>{_studentSearch=e.target.value;renderStudents();});
    document.getElementById('task-search')?.addEventListener('input',e=>{_taskSearch=e.target.value;renderAllTasks();});
    document.querySelectorAll('#student-filter-chips .chip').forEach(c=>c.addEventListener('click',()=>{document.querySelectorAll('#student-filter-chips .chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');_studentFilter=c.dataset.filter;renderStudents();}));
    document.querySelectorAll('#tasks-filter-chips .chip').forEach(c=>c.addEventListener('click',()=>{document.querySelectorAll('#tasks-filter-chips .chip').forEach(x=>x.classList.remove('active'));c.classList.add('active');_taskFilter=c.dataset.tfilter;renderAllTasks();}));
    document.getElementById('btn-export')?.addEventListener('click',()=>showExportModal());
    document.getElementById('btn-theme')?.addEventListener('click',()=>{ const n=Storage.getTheme()==='dark'?'light':'dark'; Storage.setTheme(n); applyTheme(n); });
    document.getElementById('btn-import')?.addEventListener('click',()=>showImportModal(()=>{renderDashboard();renderStudents();}));
    // Sprint 6: Global search
    document.getElementById('btn-global-search')?.addEventListener('click',openGlobalSearch);
    document.getElementById('search-overlay-close')?.addEventListener('click',closeGlobalSearch);
    document.getElementById('global-search-input')?.addEventListener('input',e=>_runGlobalSearch(e.target.value));
    document.getElementById('search-overlay')?.addEventListener('click',e=>{ if(e.target===document.getElementById('search-overlay'))closeGlobalSearch(); });
    // Sprint 3: Notifications button
    document.getElementById('btn-notif')?.addEventListener('click',showNotifSettings);
    initOfflineBadge();
    renderOnboarding();
    scheduleDailyCheck();
    // Storage warnings
    window.addEventListener('cs-storage-warn', ()=>showToast('⚠ Storage almost full! Export a backup.','warn'));
    window.addEventListener('cs-storage-full', ()=>showToast('❌ Storage full! Export & clear data.','error'));
  }


  /* ─── Sprint 8: Goals / Milestone Section ───────────────── */
  function buildGoalsSection(studentId, student) {
    const goals = Students.getGoals(studentId);
    const active = goals.filter(g => g.status === 'active');
    const achieved = goals.filter(g => g.status === 'achieved');
    const section = el('div', 'detail-section');
    const hdr = el('div', 'detail-section-header');
    hdr.innerHTML = '<span class="detail-section-title">Goals & Milestones</span>';

    const addBtn = el('button', 'btn-edit-progress', '+ Goal');
    addBtn.addEventListener('click', () => showAddGoalModal(studentId, () => renderStudentDetail(studentId)));
    hdr.appendChild(addBtn);

    // Share progress button
    const shareBtn = el('button', 'btn btn-sm btn-whatsapp', '🔗 Share Progress');
    shareBtn.style.cssText = 'font-size:11px;padding:5px 10px;margin-left:auto;';
    shareBtn.addEventListener('click', () => showShareProgressModal(studentId));
    hdr.appendChild(shareBtn);

    section.appendChild(hdr);

    if (goals.length === 0) {
      const empty = el('div', 'empty-state'); empty.style.padding = '24px 0';
      empty.innerHTML = '<span class="empty-icon" style="font-size:28px">🎯</span><div class="empty-title">No goals yet</div><div class="empty-desc">Set a milestone for '+escHtml(student.name)+'.<br>e.g. "Complete C Major scale by March"</div>';
      section.appendChild(empty);
      return section;
    }

    /* Active goals */
    if (active.length > 0) {
      const activeHdr = el('div', 'goals-group-label', 'Active');
      section.appendChild(activeHdr);
      active.forEach(g => {
        const item = el('div', 'goal-item');
        const today = new Date().toISOString().slice(0, 10);
        const overdue = g.deadline && g.deadline < today;
        item.innerHTML =
          '<button class="goal-check-btn" data-id="'+g.id+'" title="Mark achieved">○</button>'
          + '<div class="goal-body">'
          +   '<span class="goal-title">'+escHtml(g.title)+'</span>'
          +   (g.deadline ? '<span class="goal-deadline'+(overdue?' overdue':'')+'">📅 '+(overdue?'⚠ Overdue · ':'')+formatDateShort(g.deadline)+'</span>' : '')
          + '</div>'
          + '<button class="goal-edit-btn" data-id="'+g.id+'" title="Edit">✏</button>'
          + '<button class="goal-del-btn" data-id="'+g.id+'" title="Delete">✕</button>';
        item.querySelector('.goal-check-btn').addEventListener('click', () => {
          Students.achieveGoal(g.id);
          const card = Students.buildAchievementCard(studentId, g.id);
          renderStudentDetail(studentId);
          showToast('Goal achieved! 🎉', 'success');
          if (card) setTimeout(() => showAchievementCardModal(card, studentId), 400);
        });
        item.querySelector('.goal-edit-btn').addEventListener('click', () => showEditGoalModal(g, studentId));
        item.querySelector('.goal-del-btn').addEventListener('click', () => {
          if (confirm('Delete this goal?')) { Students.deleteGoal(g.id); renderStudentDetail(studentId); showToast('Goal deleted'); }
        });
        section.appendChild(item);
      });
    }

    /* Achieved goals */
    if (achieved.length > 0) {
      const achHdr = el('div', 'goals-group-label', '✓ Achieved');
      section.appendChild(achHdr);
      achieved.forEach(g => {
        const item = el('div', 'goal-item achieved');
        item.innerHTML =
          '<span class="goal-achieved-badge">✓</span>'
          + '<div class="goal-body">'
          +   '<span class="goal-title">'+escHtml(g.title)+'</span>'
          +   (g.achieved_at ? '<span class="goal-deadline">Achieved '+formatDateShort(g.achieved_at)+'</span>' : '')
          + '</div>'
          + '<button class="goal-share-btn" data-id="'+g.id+'" title="Share achievement">🏆</button>'
          + '<button class="goal-reopen-btn" data-id="'+g.id+'" title="Reopen">↩</button>';
        item.querySelector('.goal-share-btn').addEventListener('click', () => {
          const card = Students.buildAchievementCard(studentId, g.id);
          if (card) showAchievementCardModal(card, studentId);
        });
        item.querySelector('.goal-reopen-btn').addEventListener('click', () => {
          Students.reopenGoal(g.id); renderStudentDetail(studentId); showToast('Goal reopened');
        });
        section.appendChild(item);
      });
    }

    return section;
  }

  /* ─── Sprint 8: Add / Edit Goal Modals ──────────────────── */
  function showAddGoalModal(studentId, onDone) {
    openModal('Add Goal',
      '<div class="form-group"><label class="form-label">Goal / Milestone</label>'
      + '<input class="form-input" id="inp-goal-title" placeholder="e.g. C Major scale, Raag Bhairav basics…" autocomplete="off"/></div>'
      + '<div class="form-group"><label class="form-label">Deadline <span style="opacity:.5;font-weight:400">(optional)</span></label>'
      + '<input class="form-input" id="inp-goal-dl" type="date"/></div>'
      + '<button class="btn btn-primary" id="btn-save-goal" style="width:100%;margin-top:8px;">Add Goal</button>'
    );
    setTimeout(() => {
      document.getElementById('inp-goal-title').focus();
      document.getElementById('btn-save-goal').addEventListener('click', () => {
        const title = (document.getElementById('inp-goal-title').value || '').trim();
        const dl    = document.getElementById('inp-goal-dl').value || null;
        const res   = Students.addGoal(studentId, { title, deadline: dl });
        if (!res.ok) { showToast(res.error || 'Error', 'error'); return; }
        closeModal(); onDone && onDone();
        showToast('Goal added 🎯', 'success');
      });
    }, 50);
  }

  function showEditGoalModal(goal, studentId) {
    openModal('Edit Goal',
      '<div class="form-group"><label class="form-label">Goal</label>'
      + '<input class="form-input" id="inp-goal-title" value="'+escHtml(goal.title)+'" autocomplete="off"/></div>'
      + '<div class="form-group"><label class="form-label">Deadline</label>'
      + '<input class="form-input" id="inp-goal-dl" type="date" value="'+(goal.deadline||'')+'"/></div>'
      + '<button class="btn btn-primary" id="btn-upd-goal" style="width:100%;margin-top:8px;">Save</button>'
    );
    setTimeout(() => {
      document.getElementById('btn-upd-goal').addEventListener('click', () => {
        const title = (document.getElementById('inp-goal-title').value || '').trim();
        const dl    = document.getElementById('inp-goal-dl').value || null;
        const res   = Students.updateGoal(goal.id, { title, deadline: dl });
        if (!res.ok) { showToast(res.error || 'Error', 'error'); return; }
        closeModal(); renderStudentDetail(studentId);
        showToast('Goal updated', 'success');
      });
    }, 50);
  }

  /* ─── Sprint 8: Achievement Card Modal ──────────────────── */

  /* ═══════════════════════════════════════════════════════════
     SPRINT 8 v2 — Canvas-drawn PNG Cards (Achievement + Report)
     ═══════════════════════════════════════════════════════════ */

  /* ── Shared canvas helpers ─────────────────────────────────── */
  function _cvRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function _cvWrapText(ctx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '', lines = [];
    for (let w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line); line = w;
      } else { line = test; }
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
    return lines.length;
  }

  function _cvShareOrDownload(canvas, filename, toast) {
    canvas.toBlob(blob => {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: 'ChordStar' }).catch(() => _cvDownload(blob, filename));
      } else { _cvDownload(blob, filename); }
      showToast(toast || '🖼 Card saved!', 'success');
    }, 'image/png');
  }

  function _cvDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /* ── Achievement Card (1080×1080 PNG) ─────────────────────── */
  function _drawAchievementCard(card) {
    const W = 1080, H = 1080;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const acc = '#f0c040', acc2 = '#e07830', green = '#40c080';

    /* BG — dark radial gradient */
    const bg = ctx.createRadialGradient(W/2, H*0.3, 50, W/2, H/2, W*0.8);
    bg.addColorStop(0,   '#1a1a2e');
    bg.addColorStop(0.5, '#0f0f1a');
    bg.addColorStop(1,   '#0a0a12');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    /* Decorative rings */
    [300, 420, 540].forEach((r, i) => {
      ctx.beginPath();
      ctx.arc(W/2, H*0.36, r, 0, Math.PI*2);
      ctx.strokeStyle = `rgba(240,192,64,${0.06 - i*0.015})`;
      ctx.lineWidth = 1.5; ctx.stroke();
    });

    /* Gold top accent bar */
    const barGrad = ctx.createLinearGradient(0, 0, W, 0);
    barGrad.addColorStop(0,   'transparent');
    barGrad.addColorStop(0.3, acc);
    barGrad.addColorStop(0.7, acc2);
    barGrad.addColorStop(1,   'transparent');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, 0, W, 6);

    /* Trophy icon area — glowing circle */
    const cx = W/2, cy = 310;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 130);
    glow.addColorStop(0,   'rgba(240,192,64,0.25)');
    glow.addColorStop(0.6, 'rgba(240,192,64,0.06)');
    glow.addColorStop(1,   'transparent');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    /* Trophy circle */
    ctx.beginPath(); ctx.arc(cx, cy, 90, 0, Math.PI*2);
    const ringG = ctx.createLinearGradient(cx-90, cy-90, cx+90, cy+90);
    ringG.addColorStop(0, acc); ringG.addColorStop(1, acc2);
    ctx.fillStyle = ringG; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 76, 0, Math.PI*2);
    ctx.fillStyle = '#1a1520'; ctx.fill();
    /* Trophy emoji replacement — draw text */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '72px serif'; ctx.fillText('🏆', cx, cy + 2);

    /* Milestone Achieved badge */
    const badgeW = 360, badgeH = 44, badgeX = (W - badgeW)/2, badgeY = 430;
    _cvRoundRect(ctx, badgeX, badgeY, badgeW, badgeH, 22);
    const badgeG = ctx.createLinearGradient(badgeX, 0, badgeX + badgeW, 0);
    badgeG.addColorStop(0, acc); badgeG.addColorStop(1, acc2);
    ctx.fillStyle = badgeG; ctx.fill();
    ctx.font = 'bold 18px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#0a0a12'; ctx.fillText('★  MILESTONE ACHIEVED  ★', W/2, badgeY + 22);

    /* Student name */
    ctx.font = 'bold 64px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = '#f0f0f4';
    ctx.textAlign = 'center';
    const nameLines = _cvWrapText(ctx, card.studentName, W/2, 520, W - 120, 74);

    /* Goal title */
    const goalY = 520 + nameLines * 74 + 20;
    ctx.font = '32px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(240,240,244,0.65)';
    ctx.fillText('achieved the goal:', W/2, goalY);

    ctx.font = 'bold 40px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = acc;
    const goalLines = _cvWrapText(ctx, '\u201c' + card.goalTitle + '\u201d', W/2, goalY + 54, W - 140, 52);

    /* Stats row */
    const statsY = goalY + 54 + goalLines * 52 + 44;
    const statItems = [
      { label: 'DATE',       val: card.achievedOn ? card.achievedOn.slice(0,10) : '—' },
      { label: 'LEVEL',      val: card.skillLevel },
    ];
    if (card.attRate !== null) statItems.push({ label: 'ATTENDANCE', val: card.attRate + '%' });

    const statW = Math.min(280, (W - 80) / statItems.length);
    const totalW = statItems.length * statW + (statItems.length - 1) * 20;
    let sx = (W - totalW) / 2;

    statItems.forEach(s => {
      _cvRoundRect(ctx, sx, statsY, statW, 88, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      _cvRoundRect(ctx, sx, statsY, statW, 88, 14);
      ctx.strokeStyle = 'rgba(240,192,64,0.2)'; ctx.lineWidth = 1; ctx.stroke();

      ctx.font = 'bold 28px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = green; ctx.textAlign = 'center';
      ctx.fillText(s.val, sx + statW/2, statsY + 38);
      ctx.font = '16px -apple-system, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(240,240,244,0.45)';
      ctx.fillText(s.label, sx + statW/2, statsY + 68);
      sx += statW + 20;
    });

    /* Bottom brand bar */
    const brand = ctx.createLinearGradient(0, H - 80, W, H - 80);
    brand.addColorStop(0,   'transparent');
    brand.addColorStop(0.3, 'rgba(240,192,64,0.08)');
    brand.addColorStop(0.7, 'rgba(224,120,48,0.08)');
    brand.addColorStop(1,   'transparent');
    ctx.fillStyle = brand; ctx.fillRect(0, H - 80, W, 80);

    ctx.font = '22px -apple-system, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(240,192,64,0.55)';
    ctx.textAlign = 'center';
    ctx.fillText('♦  ChordStar — Music Studio Manager', W/2, H - 32);

    /* Bottom gradient fade */
    ctx.fillStyle = 'rgba(240,192,64,0.6)';
    ctx.fillRect(0, H - 6, W, 6);

    return cv;
  }

  function showAchievementCardModal(card, studentId) {
    const dateStr = card.achievedOn ? card.achievedOn.slice(0,10) : new Date().toISOString().slice(0,10);

    const body =
      '<div id="achieve-preview-wrap" style="text-align:center;margin-bottom:16px;">'
      + '<canvas id="achieve-canvas-preview" style="width:100%;max-width:340px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.5);display:block;margin:0 auto;"></canvas>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:10px;">'
      + '<button class="btn btn-primary" id="btn-share-achieve" style="width:100%;padding:14px;font-size:15px;font-weight:700;">📲 Share / Save PNG</button>'
      + '<button class="btn btn-sm btn-whatsapp" id="btn-wa-achieve" style="width:100%;padding:12px;">💬 WhatsApp Text</button>'
      + '<button class="btn" id="btn-close-achieve" style="width:100%;">Close</button>'
      + '</div>';

    openModal('Achievement Unlocked 🏆', body);

    setTimeout(() => {
      /* Draw on preview canvas */
      const fullCanvas = _drawAchievementCard(card);
      const preview = document.getElementById('achieve-canvas-preview');
      if (preview) {
        preview.width  = fullCanvas.width;
        preview.height = fullCanvas.height;
        preview.getContext('2d').drawImage(fullCanvas, 0, 0);
      }

      document.getElementById('btn-close-achieve').addEventListener('click', closeModal);

      document.getElementById('btn-share-achieve').addEventListener('click', () => {
        const fname = (card.studentName || 'student').replace(/\s+/g,'_') + '_achievement_' + dateStr + '.png';
        _cvShareOrDownload(fullCanvas, fname, '🏆 Card saved!');
      });

      document.getElementById('btn-wa-achieve').addEventListener('click', () => {
        const student = Students.getStudentById(studentId);
        const phone = (student ? student.phone : '').replace(/\D/g,'');
        const msg = '🏆 Milestone Achieved!\n\n'
          + '🎓 ' + card.studentName + '\n'
          + '🎯 Goal: ' + card.goalTitle + '\n'
          + '📅 Date: ' + dateStr + '\n'
          + '🎸 Level: ' + card.skillLevel + '\n'
          + (card.attRate !== null ? '✅ Attendance: ' + card.attRate + '%\n' : '')
          + '\nPowered by ChordStar ♦';
        window.open('https://wa.me/' + (phone ? '91'+phone : '') + '?text=' + encodeURIComponent(msg), '_blank');
      });
    }, 60);
  }

  /* ── Progress Report Card — Dynamic height, stacked layout, weekly data ── */
  function _drawProgressCard(student, data) {
    const W   = 1080;
    const PAD = 60;
    const GAP = 16;

    const acc   = '#f0c040';
    const acc2  = '#e07830';
    const green = '#40c080';
    const red   = '#e05050';
    const blue  = '#5090e0';
    const purple= '#9060e0';
    const txt   = '#f0f0f4';
    const txt2  = '#9090a0';
    const bg    = '#0f0f11';
    const bg2   = '#16161a';
    const bg3   = '#1e1e24';
    const border= 'rgba(255,255,255,0.08)';

    /* ── helpers ── */
    function wrapLines(ctx, text, maxW) {
      if (!text) return ['—'];
      const words = String(text).split(' ');
      const lines = []; let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      return lines.length ? lines : ['—'];
    }

    /* ── measure all rows first (for dynamic height) ── */
    const mc = document.createElement('canvas');
    mc.width = W; mc.height = 10;
    const mctx = mc.getContext('2d');

    const TOPIC_FONT  = '28px -apple-system,system-ui,sans-serif';
    const TASK_FONT   = '28px -apple-system,system-ui,sans-serif';
    const BODY_W      = W - PAD * 2;

    function measureTopicRow(entry) {
      mctx.font = 'bold ' + TOPIC_FONT;
      const tLines = wrapLines(mctx, entry.topic, BODY_W - 120);
      const baseH  = Math.max(72, 28 + tLines.length * 36 + 16);
      return baseH + 20; // +row gap
    }
    function measureTaskRow(task) {
      mctx.font = TASK_FONT;
      const tLines = wrapLines(mctx, task.title, BODY_W - 120);
      const baseH  = Math.max(64, 22 + tLines.length * 36 + 16);
      return baseH + 16;
    }

    const HEADER_H = 400;
    const STATS_H  = 400;  // 2-row stat grid
    const SEC_H    = 50;   // section header

    let topicsH = 0;
    if (data.weeklyTopics && data.weeklyTopics.length > 0) {
      topicsH = SEC_H + 12;
      data.weeklyTopics.forEach(e => { topicsH += measureTopicRow(e); });
      topicsH += 20;
    }
    let tasksH = 0;
    if (data.weeklyTasks && data.weeklyTasks.length > 0) {
      tasksH = SEC_H + 12;
      data.weeklyTasks.forEach(t => { tasksH += measureTaskRow(t); });
      tasksH += 20;
    }
    const noDataH = (topicsH === 0 && tasksH === 0) ? 80 : 0;
    const FOOTER_H = 100;
    const TOTAL_H  = HEADER_H + STATS_H + topicsH + tasksH + noDataH + FOOTER_H + 40;

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = TOTAL_H;
    const ctx = cv.getContext('2d');

    /* ── Background ── */
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, TOTAL_H);

    const heroG = ctx.createLinearGradient(0, 0, W, 420);
    heroG.addColorStop(0, '#1a1520'); heroG.addColorStop(1, bg);
    ctx.fillStyle = heroG; ctx.fillRect(0, 0, W, 420);

    /* Top accent line */
    const topLine = ctx.createLinearGradient(0, 0, W, 0);
    topLine.addColorStop(0, 'transparent'); topLine.addColorStop(0.3, acc);
    topLine.addColorStop(0.7, acc2); topLine.addColorStop(1, 'transparent');
    ctx.fillStyle = topLine; ctx.fillRect(0, 0, W, 6);

    /* ── HEADER ── */
    /* Logo + date row */
    ctx.font = '30px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = 'rgba(240,192,64,0.7)'; ctx.textAlign = 'left';
    ctx.fillText('♦ ChordStar  MUSIC', PAD, 56);
    ctx.font = '26px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = txt2; ctx.textAlign = 'right';
    ctx.fillText('Weekly Report  ·  ' + data.date, W - PAD, 56);

    /* Separator */
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(PAD, 70, W - PAD*2, 1);

    /* Avatar */
    const avCX = W/2, avCY = 180;
    ctx.beginPath(); ctx.arc(avCX, avCY, 74, 0, Math.PI*2);
    const avG = ctx.createLinearGradient(avCX-74, avCY-74, avCX+74, avCY+74);
    avG.addColorStop(0, data.studentColor || acc); avG.addColorStop(1, acc2);
    ctx.fillStyle = avG; ctx.fill();
    ctx.beginPath(); ctx.arc(avCX, avCY, 62, 0, Math.PI*2);
    ctx.fillStyle = '#1a1520'; ctx.fill();
    ctx.font = 'bold 44px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = data.studentColor || acc;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(getInitials(student.name), avCX, avCY);
    ctx.textBaseline = 'alphabetic';

    /* Student name */
    ctx.font = 'bold 58px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = txt; ctx.textAlign = 'center';
    _cvWrapText(ctx, student.name, W/2, 296, W - 120, 66);

    /* Level pill */
    const pilW = 280, pilH = 42;
    _cvRoundRect(ctx, (W-pilW)/2, 318, pilW, pilH, 21);
    ctx.fillStyle = 'rgba(240,192,64,0.14)'; ctx.fill();
    _cvRoundRect(ctx, (W-pilW)/2, 318, pilW, pilH, 21);
    ctx.strokeStyle = 'rgba(240,192,64,0.40)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '24px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = acc; ctx.textAlign = 'center';
    ctx.fillText('🎸  ' + data.skillLevel, W/2, 346);

    /* Weekly badge */
    const wBadgeW = 320, wBadgeH = 38, wBadgeX = (W-wBadgeW)/2, wBadgeY = 372;
    _cvRoundRect(ctx, wBadgeX, wBadgeY, wBadgeW, wBadgeH, 10);
    ctx.fillStyle = 'rgba(144,96,224,0.20)'; ctx.fill();
    _cvRoundRect(ctx, wBadgeX, wBadgeY, wBadgeW, wBadgeH, 10);
    ctx.strokeStyle = 'rgba(144,96,224,0.50)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.font = '20px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = purple; ctx.textAlign = 'center';
    ctx.fillText('📅  This Week  ·  ' + data.weekRange, W/2, 397);

    /* ── STATS GRID 2×2 ── */
    function drawStatBox(x, y, w, h, label, val, valColor, sub) {
      _cvRoundRect(ctx, x, y, w, h, 18); ctx.fillStyle = bg2; ctx.fill();
      _cvRoundRect(ctx, x, y, w, h, 18); ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = valColor || acc;
      _cvRoundRect(ctx, x+20, y, 60, 4, 2); ctx.fill();
      ctx.font = 'bold 62px -apple-system,system-ui,sans-serif';
      ctx.fillStyle = valColor || acc; ctx.textAlign = 'center';
      ctx.fillText(val, x+w/2, y+82);
      ctx.font = '22px -apple-system,system-ui,sans-serif';
      ctx.fillStyle = txt2; ctx.fillText(label, x+w/2, y+116);
      if (sub) {
        ctx.font = '19px -apple-system,system-ui,sans-serif';
        ctx.fillStyle = 'rgba(144,144,160,0.65)';
        ctx.fillText(sub, x+w/2, y+142);
      }
    }

    const gw = (W - PAD*2 - GAP) / 2, gh = 168;
    const row1y = HEADER_H, row2y = row1y + gh + GAP;
    const attColor = data.attRate===null ? acc : data.attRate>=75 ? green : data.attRate>=50 ? acc : red;
    const ratColor = data.avgRating===null ? acc : data.avgRating>=4 ? green : data.avgRating>=3 ? acc : red;
    drawStatBox(PAD,         row1y, gw, gh, 'ATTENDANCE',  data.attRate!==null ? data.attRate+'%' : '—', attColor);
    drawStatBox(PAD+gw+GAP,  row1y, gw, gh, 'AVG RATING',  data.avgRating!==null ? data.avgRating+'★' : '—', ratColor);
    drawStatBox(PAD,         row2y, gw, gh, 'CLASS STREAK', data.streak>0 ? data.streak : '—', data.streak>=5?green:blue, data.streak>=5?'🔥 on fire!':'classes');
    drawStatBox(PAD+gw+GAP,  row2y, gw, gh, 'SYLLABUS',    data.sylComp.total>0 ? data.sylComp.pct+'%':'—', green, data.sylComp.total>0?data.sylComp.done+' / '+data.sylComp.total+' done':'');

    let curY = row2y + gh + 36;

    /* ── section header helper ── */
    function drawSecHeader(emoji, label, color) {
      const barW = W - PAD*2;
      _cvRoundRect(ctx, PAD, curY, barW, 46, 10);
      ctx.fillStyle = color + '18'; ctx.fill();
      _cvRoundRect(ctx, PAD, curY, barW, 46, 10);
      ctx.strokeStyle = color + '40'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = color;
      _cvRoundRect(ctx, PAD, curY, 6, 46, 3); ctx.fill();
      ctx.font = 'bold 24px -apple-system,system-ui,sans-serif';
      ctx.fillStyle = color; ctx.textAlign = 'left';
      ctx.fillText(emoji + '  ' + label, PAD + 22, curY + 30);
      curY += 46 + 14;
    }

    /* ── TOPICS THIS WEEK (full width) ── */
    if (data.weeklyTopics && data.weeklyTopics.length > 0) {
      drawSecHeader('📖', 'Topics Learned This Week  (' + data.weeklyTopics.length + ')', acc);
      data.weeklyTopics.forEach((entry, idx) => {
        ctx.font = 'bold ' + TOPIC_FONT;
        const tLines = wrapLines(ctx, entry.topic, BODY_W - 130);
        const rowH   = Math.max(72, 28 + tLines.length * 36 + 16);

        _cvRoundRect(ctx, PAD, curY, BODY_W, rowH, 14);
        ctx.fillStyle = bg2; ctx.fill();
        _cvRoundRect(ctx, PAD, curY, BODY_W, rowH, 14);
        ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();

        /* Number badge */
        ctx.beginPath(); ctx.arc(PAD+30, curY+rowH/2, 18, 0, Math.PI*2);
        ctx.fillStyle = acc+'22'; ctx.fill();
        ctx.font = 'bold 22px -apple-system,system-ui,sans-serif';
        ctx.fillStyle = acc; ctx.textAlign = 'center'; ctx.textBaseline='middle';
        ctx.fillText(idx+1, PAD+30, curY+rowH/2);
        ctx.textBaseline='alphabetic';

        /* Topic text */
        ctx.font = 'bold 28px -apple-system,system-ui,sans-serif';
        ctx.fillStyle = txt; ctx.textAlign = 'left';
        let ty = curY + (rowH - tLines.length*36)/2 + 22;
        tLines.forEach(line => { ctx.fillText(line, PAD+58, ty); ty += 36; });

        /* Date + rating on right */
        ctx.font = '22px -apple-system,system-ui,sans-serif';
        ctx.fillStyle = txt2; ctx.textAlign = 'right';
        let metaStr = entry.date || '';
        if (entry.rating) metaStr += '  ' + '★'.repeat(entry.rating);
        ctx.fillText(metaStr, W-PAD-14, curY+rowH/2+8);

        curY += rowH + GAP;
      });
      curY += 12;
    }

    /* ── PENDING TASKS (full width) ── */
    if (data.weeklyTasks && data.weeklyTasks.length > 0) {
      drawSecHeader('📋', 'Pending Tasks  (' + data.weeklyTasks.length + ')', '#e07830');
      data.weeklyTasks.forEach(task => {
        ctx.font = TASK_FONT;
        const tLines = wrapLines(ctx, task.title, BODY_W - 130);
        const rowH   = Math.max(64, 22 + tLines.length * 36 + 16);

        _cvRoundRect(ctx, PAD, curY, BODY_W, rowH, 14);
        ctx.fillStyle = bg2; ctx.fill();
        _cvRoundRect(ctx, PAD, curY, BODY_W, rowH, 14);
        ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke();

        /* Bullet */
        ctx.beginPath(); ctx.arc(PAD+22, curY+rowH/2, 8, 0, Math.PI*2);
        const dotC = task.priority==='high' ? red : task.priority==='medium' ? acc : green;
        ctx.fillStyle = dotC; ctx.fill();

        /* Task title */
        ctx.font = '28px -apple-system,system-ui,sans-serif';
        ctx.fillStyle = txt; ctx.textAlign = 'left';
        let ty = curY + (rowH - tLines.length*36)/2 + 22;
        tLines.forEach(line => { ctx.fillText(line, PAD+46, ty); ty += 36; });

        /* Due date */
        if (task.deadline || task.due_date) {
          const due = task.deadline || task.due_date;
          ctx.font = '22px -apple-system,system-ui,sans-serif';
          ctx.fillStyle = red + 'cc'; ctx.textAlign = 'right';
          ctx.fillText('Due ' + due, W-PAD-14, curY+rowH/2+8);
        }

        curY += rowH + GAP;
      });
      curY += 12;
    }

    if (topicsH === 0 && tasksH === 0) {
      ctx.font = '28px -apple-system,system-ui,sans-serif';
      ctx.fillStyle = txt2; ctx.textAlign = 'center';
      ctx.fillText('No activity recorded this week', W/2, curY + 40);
      curY += 80;
    }

    /* ── Footer ── */
    const brandY = curY + 20;
    const brandLine = ctx.createLinearGradient(0, brandY, W, brandY);
    brandLine.addColorStop(0,'transparent'); brandLine.addColorStop(0.4,acc);
    brandLine.addColorStop(0.6,acc2); brandLine.addColorStop(1,'transparent');
    ctx.fillStyle = brandLine; ctx.fillRect(0, brandY, W, 2);
    ctx.font = '24px -apple-system,system-ui,sans-serif';
    ctx.fillStyle = 'rgba(240,192,64,0.5)'; ctx.textAlign = 'center';
    ctx.fillText('♦  ChordStar Music  ·  Generated ' + data.date, W/2, brandY + 46);
    ctx.fillStyle = 'rgba(240,192,64,0.5)'; ctx.fillRect(0, TOTAL_H-6, W, 6);

    return cv;
  }

  function showShareProgressModal(studentId) {
    const student    = Students.getStudentById(studentId);
    if (!student) return;
    const attRate    = Students.getAttendanceRate(studentId);
    const skillLvl   = Students.getSkillLevel(studentId);
    const skillStages= Students.getSkillStages();
    const sylComp    = Students.getSyllabusCompletion(studentId);
    const avgRating  = Students.getAvgRating(studentId);
    const streak     = Students.getAttendanceStreak(studentId);
    const goals      = Students.getGoals(studentId);
    const achieved   = goals.filter(g => g.status === 'achieved');
    const allProgress= Students.getProgressHistory(studentId);
    const tasks      = Tasks.getTasksByStudent(studentId);
    const pending    = tasks.filter(t => t.status === 'pending');

    /* ── Weekly filter: last 7 days ── */
    const now7   = new Date();
    const week0  = new Date(now7); week0.setDate(week0.getDate() - 6);
    const weekStr0 = week0.toLocaleDateString('en-IN', { day:'numeric', month:'short' });
    const weekStr1 = now7.toLocaleDateString('en-IN',  { day:'numeric', month:'short' });
    const weekRange = weekStr0 + ' – ' + weekStr1;

    const weeklyTopics = allProgress.filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date + 'T00:00:00');
      return d >= week0 && d <= now7;
    });

    const weeklyTasks = pending.filter(t => {
      /* show if created this week OR deadline is within this week */
      const created = t.created_at ? new Date(t.created_at) : null;
      const due     = (t.deadline || t.due_date) ? new Date((t.deadline||t.due_date)+'T00:00:00') : null;
      const createdThisWeek = created && created >= week0;
      const dueThisWeek     = due && due >= week0;
      return createdThisWeek || dueThisWeek || (!created && !due);
    });

    const now = new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' });

    const cardData = {
      date: now, weekRange, studentColor: student.color,
      skillLevel: skillStages[skillLvl] || 'Beginner',
      attRate, avgRating, streak, sylComp,
      weeklyTopics, weeklyTasks
    };

    const body =
      '<div style="text-align:center;margin-bottom:16px;">'
      + '<canvas id="report-canvas-preview" style="width:100%;max-width:280px;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.5);display:block;margin:0 auto;"></canvas>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:10px;">'
      + '<button class="btn btn-primary" id="btn-share-report" style="width:100%;padding:14px;font-size:15px;font-weight:700;">📲 Share / Save PNG</button>'
      + '<button class="btn btn-sm btn-whatsapp" id="btn-wa-report" style="width:100%;padding:12px;">💬 WhatsApp Text</button>'
      + '<button class="btn" id="btn-close-report" style="width:100%;">Close</button>'
      + '</div>';

    openModal('Progress Report Card — ' + escHtml(student.name), body);

    setTimeout(() => {
      const fullCanvas = _drawProgressCard(student, cardData);
      const preview = document.getElementById('report-canvas-preview');
      if (preview) {
        preview.width  = fullCanvas.width;
        preview.height = fullCanvas.height;
        preview.getContext('2d').drawImage(fullCanvas, 0, 0);
      }

      document.getElementById('btn-close-report').addEventListener('click', closeModal);

      document.getElementById('btn-share-report').addEventListener('click', () => {
        const fname = (student.name||'student').replace(/\s+/g,'_') + '_progress_' + new Date().toISOString().slice(0,10) + '.png';
        _cvShareOrDownload(fullCanvas, fname, '📊 Report card saved!');
      });

      document.getElementById('btn-wa-report').addEventListener('click', () => {
        const phone = (student.phone||'').replace(/\D/g,'');
        const sl    = skillStages[skillLvl];
        const msg   = '📊 Progress Report — ' + student.name + '\n\n'
          + '🎸 Level: ' + sl + '\n'
          + (attRate !== null    ? '✅ Attendance: ' + attRate + '%\n' : '')
          + (avgRating !== null  ? '⭐ Avg Rating: ' + avgRating + '/5\n' : '')
          + (streak > 0         ? '🔥 Class Streak: ' + streak + ' classes\n' : '')
          + (sylComp.total > 0  ? '📚 Syllabus: ' + sylComp.pct + '% done\n' : '')
          + (achieved.length > 0? '\n🏆 Goals achieved: ' + achieved.length + '\n' : '')
          + (weeklyTasks.length > 0 ? '📋 Pending tasks this week: ' + weeklyTasks.length + '\n' : '')
          + '\nGenerated via ChordStar ♦';
        window.open('https://wa.me/' + (phone ? '91'+phone : '') + '?text=' + encodeURIComponent(msg), '_blank');
      });
    }, 60);
  }




  /* ═══════════════════════════════════════════════════════════
     DAILY REGISTER — In-App View + Dynamic PNG Report Generator
     ═══════════════════════════════════════════════════════════ */

  let _registerDate = new Date().toISOString().slice(0, 10);

  function renderDailyRegister() {
    const container = document.getElementById('screen-register');
    if (!container) return;
    container.innerHTML = '';
    const scroll = el('div', 'screen-scroll');

    /* Hero */
    const hero = el('div', 'screen-hero');
    hero.innerHTML = '<h1 class="hero-title">Daily Register</h1><p class="hero-sub">Date-wise attendance log</p>';
    scroll.appendChild(hero);

    /* Date selector row */
    const dateRow = el('div', 'reg-date-row');
    const dates = Students.getAttendanceDates();
    // Date input
    const dateInput = el('input', 'reg-date-input');
    dateInput.type = 'date'; dateInput.value = _registerDate;
    dateInput.max = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener('change', () => { _registerDate = dateInput.value; renderRegisterBody(scroll, regBody); });
    dateRow.appendChild(dateInput);

    // Quick chips for past dates
    if (dates.length > 0) {
      const chipsWrap = el('div', 'reg-date-chips');
      dates.slice(0, 5).forEach(d => {
        const chip = el('button', 'chip reg-chip' + (d === _registerDate ? ' active' : ''), _fmtShortDate(d));
        chip.addEventListener('click', () => {
          _registerDate = d; dateInput.value = d;
          chipsWrap.querySelectorAll('.reg-chip').forEach(c => c.classList.toggle('active', c.textContent === _fmtShortDate(d)));
          renderRegisterBody(scroll, regBody);
        });
        chipsWrap.appendChild(chip);
      });
      dateRow.appendChild(chipsWrap);
    }
    scroll.appendChild(dateRow);

    const regBody = el('div', 'reg-body');
    scroll.appendChild(regBody);
    container.appendChild(scroll);
    renderRegisterBody(scroll, regBody);
  }

  function _fmtShortDate(d) {
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
    catch { return d; }
  }

  function renderRegisterBody(scroll, regBody) {
    regBody.innerHTML = '';
    const report = Students.getDailyReport(_registerDate);
    const dateLabel = new Date(_registerDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });


    /* Summary bar */
    const sumBar = el('div', 'reg-summary-bar');
    sumBar.innerHTML =
      '<div class="reg-sum-item present"><span class="reg-sum-num">' + report.present.length + '</span><span class="reg-sum-lbl">Present</span></div>'
      + '<div class="reg-sum-item absent"><span class="reg-sum-num">' + report.absent.length + '</span><span class="reg-sum-lbl">Absent</span></div>'
      + (report.notMarked.length > 0
        ? '<div class="reg-sum-item unmarked"><span class="reg-sum-num">' + report.notMarked.length + '</span><span class="reg-sum-lbl">Unmarked</span></div>'
        : '')
      + '<div class="reg-sum-item date-lbl"><span class="reg-sum-day">' + report.dayLabel + '</span><span class="reg-sum-date">' + _fmtShortDate(_registerDate) + '</span></div>';
    regBody.appendChild(sumBar);

    /* Generate Report button */
    const genBtn = el('button', 'btn btn-primary reg-gen-btn', '🖨 Generate Daily Report PNG');
    genBtn.addEventListener('click', () => _generateA4Report(report, dateLabel));
    regBody.appendChild(genBtn);
    if (report.absent.some(r => r._autoAbsent)) {
      const notice = el('div', '');
      notice.style.cssText = 'font-size:12px;color:#e07030;text-align:center;margin:6px 0;padding:6px 12px;background:rgba(224,112,48,0.1);border-radius:8px;';
      notice.textContent = '⚠ Jinki attendance nahi li gayi unhe auto-absent mark kiya gaya hai';
      regBody.appendChild(notice);
    }

    /* PRESENT STUDENTS */
    if (report.present.length > 0) {
      const hdr = el('div', 'reg-section-hdr');
      hdr.innerHTML = '<span class="reg-sec-dot present"></span><span class="reg-sec-title">Present (' + report.present.length + ')</span>';
      regBody.appendChild(hdr);

      report.present.forEach((r, idx) => {
        const card = el('div', 'reg-student-card present');
        const aStyle = avatarStyle(r.student.color);
        const topicHtml = r.progressEntries.length > 0
          ? r.progressEntries.map(p =>
              '<div class="reg-topic"><span class="reg-topic-text">📖 ' + escHtml(p.topic) + '</span>'
              + (p.rating ? '<span class="reg-rating">' + '★'.repeat(p.rating) + '</span>' : '')
              + '</div>'
            ).join('')
          : '<div class="reg-no-topic">No lesson logged</div>';

        const taskHtml = r.pendingTasks.length > 0
          ? r.pendingTasks.slice(0, 2).map(t =>
              '<div class="reg-task">📋 ' + escHtml(t.title) + (t.deadline ? ' · <span class="reg-task-due">Due ' + _fmtShortDate(t.deadline) + '</span>' : '') + '</div>'
            ).join('')
          : '';

        card.innerHTML =
          '<div class="reg-card-top">'
          + '<span class="reg-serial">' + (idx + 1) + '</span>'
          + '<div class="reg-avatar" ' + aStyle + '>' + getInitials(r.student.name) + '</div>'
          + '<div class="reg-card-info">'
          + '<span class="reg-name">' + escHtml(r.student.name) + '</span>'
          + '<span class="reg-skill">' + escHtml(r.skillLevel) + '</span>'
          + '</div>'
          + '<span class="reg-present-badge">✓ Present</span>'
          + '</div>'
          + (topicHtml ? '<div class="reg-topics">' + topicHtml + '</div>' : '')
          + (taskHtml ? '<div class="reg-tasks">' + taskHtml + '</div>' : '');

        card.addEventListener('click', () => App.navigate('detail', r.student.id));
        regBody.appendChild(card);
      });
    }

    /* ABSENT STUDENTS — with last task + last topic */
    if (report.absent.length > 0) {
      const hdr = el('div', 'reg-section-hdr');
      hdr.innerHTML = '<span class="reg-sec-dot absent"></span><span class="reg-sec-title">Absent (' + report.absent.length + ')</span>';
      regBody.appendChild(hdr);
      report.absent.forEach((r, idx) => {
        const card = el('div', 'reg-student-card absent');
        const aStyle = avatarStyle(r.student.color);
        const badge = r._autoAbsent
          ? '<span class="reg-absent-badge" style="background:rgba(180,80,80,0.18);color:#c05050;">✕ Auto-Absent</span>'
          : '<span class="reg-absent-badge">✕ Absent</span>';
        // Last assigned pending task
        const lastTask = r.pendingTasks && r.pendingTasks.length > 0 ? r.pendingTasks[0] : null;
        const taskHtmlA = lastTask
          ? '<div class="reg-tasks"><div class="reg-task">📋 ' + escHtml(lastTask.title)
            + (lastTask.deadline ? ' · <span class="reg-task-due">Due ' + _fmtShortDate(lastTask.deadline) + '</span>' : '') + '</div></div>'
          : '';
        // Last topic covered (any date)
        const lt = r.lastTopic;
        const lastTopicHtml = lt
          ? '<div class="reg-topics"><div class="reg-topic"><span class="reg-topic-text" style="color:var(--text-muted);font-size:12px;">Last: 📖 ' + escHtml(lt.topic) + '</span>'
            + (lt.rating ? '<span class="reg-rating">' + '★'.repeat(lt.rating) + '</span>' : '') + '</div></div>'
          : '';
        card.innerHTML =
          '<div class="reg-card-top">'
          + '<span class="reg-serial" style="color:#c05050;">' + (idx + 1) + '</span>'
          + '<div class="reg-avatar dim" ' + aStyle + '>' + getInitials(r.student.name) + '</div>'
          + '<div class="reg-card-info"><span class="reg-name">' + escHtml(r.student.name) + '</span><span class="reg-skill">' + escHtml(r.skillLevel) + '</span></div>'
          + badge
          + '</div>'
          + taskHtmlA
          + lastTopicHtml;
        card.addEventListener('click', () => App.navigate('detail', r.student.id));
        regBody.appendChild(card);
      });
    }

    /* NOT MARKED — now merged into absent, keep block empty */
    if (false && report.notMarked.length > 0) {
      const hdr = el('div', 'reg-section-hdr');
      hdr.innerHTML = '';
      report.notMarked.forEach(r => {
        const card = el('div', 'reg-student-card unmarked');
        const aStyle = avatarStyle(r.student.color);
        card.innerHTML =
          '<div class="reg-card-top">'
          + '<div class="reg-avatar" ' + aStyle + '>' + getInitials(r.student.name) + '</div>'
          + '<div class="reg-card-info"><span class="reg-name">' + escHtml(r.student.name) + '</span><span class="reg-skill">' + escHtml(r.skillLevel) + '</span></div>'
          + '<span class="reg-unmarked-badge">? Unmarked</span>'
          + '</div>';
        card.addEventListener('click', () => App.navigate('detail', r.student.id));
        regBody.appendChild(card);
      });
    }

    if (report.present.length === 0 && report.absent.length === 0 && report.notMarked.length === 0) {
      const empty = el('div', 'empty-state');
      empty.style.padding = '40px 0';
      empty.innerHTML = '<span class="empty-icon" style="font-size:32px">📅</span><div class="empty-title">No attendance data</div><div class="empty-desc">Is date par koi attendance mark nahi ki gayi.</div>';
      regBody.appendChild(empty);
    }
  }

  /* ── Dynamic Portrait PNG Report — ChordStar Dark Theme ── */
  /* ── Daily Register PNG — ChordStar Light Brand Theme ── */
  function _generateA4Report(report, dateLabel) {
    const W   = 3200;
    const PAD = 100;

    const crimson  = '#d41e3c';
    const crimsonL = '#f03058';
    const gold     = '#d4920a';
    const goldL    = '#f0b020';
    const purple   = '#6020a8';
    const green    = '#18a858';
    const red      = '#d42030';
    const blue     = '#2060cc';
    const orange   = '#e06010';

    const bg    = '#ffffff';
    const bg2   = '#fdf8ff';
    const bg3   = '#f7eeff';
    const bg4   = '#eeddf8';
    const txt   = '#2d1060';
    const txt2  = '#5c3a9e';
    const txt3  = '#9b7ec8';
    const txtHdr = '#f4f0ff';

    const F = {
      logoMark    : 'bold 110px -apple-system,system-ui,sans-serif',
      logoTitle   : 'bold 90px -apple-system,system-ui,sans-serif',
      logoSub     : '44px -apple-system,system-ui,sans-serif',
      logoMusic   : 'bold 38px -apple-system,system-ui,sans-serif',
      dateMain    : 'bold 62px -apple-system,system-ui,sans-serif',
      dateSub     : '40px -apple-system,system-ui,sans-serif',
      statNum     : 'bold 104px -apple-system,system-ui,sans-serif',
      statLbl     : '34px -apple-system,system-ui,sans-serif',
      secTitle    : 'bold 52px -apple-system,system-ui,sans-serif',
      tblHdr      : 'bold 30px -apple-system,system-ui,sans-serif',
      rowNum      : 'bold 32px -apple-system,system-ui,sans-serif',
      rowInitials : 'bold 30px -apple-system,system-ui,sans-serif',
      rowName     : 'bold 38px -apple-system,system-ui,sans-serif',
      rowPhone    : '28px -apple-system,system-ui,sans-serif',
      rowBadge    : 'bold 24px -apple-system,system-ui,sans-serif',
      rowLevel    : '30px -apple-system,system-ui,sans-serif',
      taskPrimary : 'bold 30px -apple-system,system-ui,sans-serif',
      taskDue     : '26px -apple-system,system-ui,sans-serif',
      taskMore    : '26px -apple-system,system-ui,sans-serif',
      topicText   : '30px -apple-system,system-ui,sans-serif',
      topicDate   : 'italic 26px -apple-system,system-ui,sans-serif',
      ratingStars : '46px serif',
      ratingNone  : '30px -apple-system,system-ui,sans-serif',
      footer      : '32px -apple-system,system-ui,sans-serif',
    };

    const COL = { no: 82, name: 680, skill: 272, tasks: 772, topic: 772, rating: 192 };
    const LINE_H = 42, ROW_PAD = 28, MIN_ROW = 120;
    const TABLE_HDR_H = 64, SEC_HDR_H = 90, HEADER_H = 330, SUM_H = 210;

    const mc = document.createElement('canvas'); mc.width = W; mc.height = 100;
    const mctx = mc.getContext('2d');

    function wrapText(ctx, text, maxW) {
      if (!text) return ['—'];
      const words = String(text).split(' ');
      const lines = []; let line = '';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      return lines.length ? lines : ['—'];
    }

    function measureRowLines(tasks, taskColW, topicText, topicColW) {
      mctx.font = F.taskPrimary;
      let taskLines = 1;
      if (tasks && tasks.length > 0) {
        taskLines = 0;
        tasks.slice(0, 5).forEach(t => {
          taskLines += wrapText(mctx, t.title, taskColW).length;
          if (t.deadline) taskLines++;
        });
      }
      mctx.font = F.topicText;
      const topicLines = topicText ? wrapText(mctx, topicText, topicColW).length : 1;
      return Math.max(taskLines, topicLines, 2);
    }

    function rowHeight(r, isPresentRow) {
      const topicText = isPresentRow
        ? (r.progressEntries.length > 0 ? r.progressEntries[0].topic : '')
        : (r.lastTopic ? r.lastTopic.topic : '');
      const lines = measureRowLines(r.pendingTasks, COL.tasks - 20, topicText, COL.topic - 20);
      return Math.max(MIN_ROW, ROW_PAD * 2 + lines * LINE_H);
    }

    let totalH = HEADER_H + SUM_H + 40;
    if (report.present.length > 0)
      totalH += SEC_HDR_H + TABLE_HDR_H + report.present.reduce((s, r) => s + rowHeight(r, true), 0) + 40;
    if (report.absent.length > 0)
      totalH += SEC_HDR_H + TABLE_HDR_H + report.absent.reduce((s, r) => s + rowHeight(r, false), 0) + 40;
    totalH += 160;

    const cv = document.createElement('canvas');
    cv.width = W; cv.height = totalH;
    const ctx = cv.getContext('2d');

    // ① App-matching warm rose-lavender gradient background
    const pageBg = ctx.createLinearGradient(W, 0, 0, totalH);
    pageBg.addColorStop(0,   '#f5e2ff');
    pageBg.addColorStop(0.3, '#fceeff');
    pageBg.addColorStop(0.7, '#fdf6ff');
    pageBg.addColorStop(1,   '#fff8ff');
    ctx.fillStyle = pageBg; ctx.fillRect(0, 0, W, totalH);

    // Very subtle purple tint wash under header
    const bodyTint = ctx.createLinearGradient(0, HEADER_H, 0, HEADER_H + 500);
    bodyTint.addColorStop(0, 'rgba(96,32,168,0.05)');
    bodyTint.addColorStop(1, 'transparent');
    ctx.fillStyle = bodyTint; ctx.fillRect(0, HEADER_H, W, 500);

    // ② Dark brand header (logo style)
    const hdrG = ctx.createLinearGradient(0, 0, W, HEADER_H);
    hdrG.addColorStop(0, '#0d0820'); hdrG.addColorStop(0.5, '#130a1e'); hdrG.addColorStop(1, '#0a0815');
    ctx.fillStyle = hdrG; ctx.fillRect(0, 0, W, HEADER_H);

    // Red glow
    const rGlow = ctx.createRadialGradient(PAD + 280, HEADER_H/2, 0, PAD + 280, HEADER_H/2, 380);
    rGlow.addColorStop(0, 'rgba(212,30,60,0.24)'); rGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = rGlow; ctx.fillRect(0, 0, W, HEADER_H);

    // Purple glow right
    const pGlow = ctx.createRadialGradient(W-500, HEADER_H/2, 0, W-500, HEADER_H/2, 480);
    pGlow.addColorStop(0, 'rgba(96,32,168,0.22)'); pGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = pGlow; ctx.fillRect(0, 0, W, HEADER_H);

    // Top stripe crimson → gold
    const topStripe = ctx.createLinearGradient(0, 0, W, 0);
    topStripe.addColorStop(0, 'transparent'); topStripe.addColorStop(0.05, crimson);
    topStripe.addColorStop(0.45, crimsonL);   topStripe.addColorStop(0.65, goldL);
    topStripe.addColorStop(0.92, gold);       topStripe.addColorStop(1, 'transparent');
    ctx.fillStyle = topStripe; ctx.fillRect(0, 0, W, 10);

    // Soundwaves left (crimson)
    ctx.strokeStyle = 'rgba(212,30,60,0.40)'; ctx.lineWidth = 3;
    [0,1,2,3].forEach(i => {
      const amp = [32,56,42,22][i];
      ctx.beginPath();
      for (let x = 0; x < 260; x += 4) {
        const y = HEADER_H/2 + Math.sin((x/260)*Math.PI*4 + i) * amp;
        x===0 ? ctx.moveTo(x+24, y) : ctx.lineTo(x+24, y);
      }
      ctx.stroke();
    });

    // Soundwaves right (gold)
    ctx.strokeStyle = 'rgba(240,176,32,0.32)'; ctx.lineWidth = 3;
    [0,1,2,3].forEach(i => {
      const amp = [26,46,34,18][i];
      ctx.beginPath();
      for (let x = 0; x < 260; x += 4) {
        const y = HEADER_H/2 + Math.sin((x/260)*Math.PI*4 + i+1) * amp;
        x===0 ? ctx.moveTo(W-285+x, y) : ctx.lineTo(W-285+x, y);
      }
      ctx.stroke();
    });

    // Header bottom border
    const hBorder = ctx.createLinearGradient(0, 0, W, 0);
    hBorder.addColorStop(0, 'transparent');   hBorder.addColorStop(0.05, crimson+'80');
    hBorder.addColorStop(0.5, gold+'60');     hBorder.addColorStop(0.95, purple+'60');
    hBorder.addColorStop(1, 'transparent');
    ctx.fillStyle = hBorder; ctx.fillRect(0, HEADER_H-3, W, 3);

    // Logo ♦
    ctx.shadowColor = crimsonL; ctx.shadowBlur = 36;
    ctx.font = F.logoMark; ctx.fillStyle = crimson;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('♦', PAD, HEADER_H/2 - 36);
    ctx.shadowBlur = 0;

    ctx.font = F.logoTitle; ctx.fillStyle = txtHdr;
    ctx.fillText('ChordStar', PAD + 122, HEADER_H/2 - 36);

    ctx.shadowColor = goldL; ctx.shadowBlur = 14;
    ctx.font = F.logoMusic; ctx.fillStyle = goldL;
    ctx.fillText('MUSIC', PAD + 132, HEADER_H/2 + 38);
    ctx.shadowBlur = 0;

    ctx.font = F.logoSub; ctx.fillStyle = 'rgba(240,176,32,0.45)';
    ctx.fillText('Daily Attendance Register',
      PAD + 132 + ctx.measureText('MUSIC').width + 28, HEADER_H/2 + 40);

    ctx.textAlign = 'right';
    ctx.font = F.dateMain; ctx.fillStyle = txtHdr;
    ctx.fillText(dateLabel, W - PAD, HEADER_H/2 - 36);
    ctx.font = F.dateSub; ctx.fillStyle = 'rgba(200,190,230,0.50)';
    ctx.fillText(report.dayLabel, W - PAD, HEADER_H/2 + 40);
    ctx.textBaseline = 'alphabetic';

    // ③ Stat boxes — white cards, brand color accents
    const sumY = HEADER_H + 36, boxGap = 30;
    const sumBoxW = (W - PAD*2 - boxGap*2) / 3, sumBoxH = SUM_H - 36;

    [
      { label: 'PRESENT', val: report.present.length, color: green,  tint: 'rgba(24,168,88,0.08)',  bdr: 'rgba(24,168,88,0.35)'  },
      { label: 'ABSENT',  val: report.absent.length,  color: red,    tint: 'rgba(212,32,48,0.08)',  bdr: 'rgba(212,32,48,0.32)'  },
      { label: 'TOTAL',   val: report.present.length + report.absent.length, color: blue, tint: 'rgba(32,96,204,0.07)', bdr: 'rgba(32,96,204,0.32)' }
    ].forEach((s, i) => {
      const sx = PAD + i*(sumBoxW + boxGap);
      ctx.shadowColor = s.color+'28'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 5;
      _cvRoundRect(ctx, sx, sumY, sumBoxW, sumBoxH, 20); ctx.fillStyle = bg; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      _cvRoundRect(ctx, sx, sumY, sumBoxW, sumBoxH, 20); ctx.fillStyle = s.tint; ctx.fill();
      _cvRoundRect(ctx, sx, sumY, sumBoxW, sumBoxH, 20); ctx.strokeStyle = s.bdr; ctx.lineWidth = 2.5; ctx.stroke();
      _cvRoundRect(ctx, sx, sumY, sumBoxW, 8, 3); ctx.fillStyle = s.color; ctx.fill();
      ctx.font = F.statNum; ctx.fillStyle = s.color; ctx.textAlign = 'center';
      ctx.fillText(s.val, sx + sumBoxW/2, sumY + 132);
      ctx.font = F.statLbl; ctx.fillStyle = txt3;
      ctx.fillText(s.label, sx + sumBoxW/2, sumY + 168);
    });

    let curY = sumY + SUM_H + 10;

    // ④ Section banner
    function drawSectionTitle(label, color, tintColor) {
      ctx.fillStyle = tintColor; ctx.fillRect(0, curY, W, SEC_HDR_H);
      ctx.fillStyle = color; ctx.fillRect(0, curY, 12, SEC_HDR_H);
      const spread = ctx.createLinearGradient(12, 0, 340, 0);
      spread.addColorStop(0, color+'22'); spread.addColorStop(1, 'transparent');
      ctx.fillStyle = spread; ctx.fillRect(12, curY, 328, SEC_HDR_H);
      const sLine = ctx.createLinearGradient(0, 0, W, 0);
      sLine.addColorStop(0, 'transparent'); sLine.addColorStop(0.05, color+'40');
      sLine.addColorStop(0.95, color+'18'); sLine.addColorStop(1, 'transparent');
      ctx.fillStyle = sLine;
      ctx.fillRect(0, curY, W, 2);
      ctx.fillRect(0, curY + SEC_HDR_H - 2, W, 2);
      ctx.font = F.secTitle; ctx.fillStyle = color; ctx.textAlign = 'left';
      ctx.fillText(label, PAD + 28, curY + SEC_HDR_H/2 + 19);
      curY += SEC_HDR_H + 2;
    }

    // ⑤ Table header
    function drawTableHeader() {
      const hBg = ctx.createLinearGradient(PAD, 0, W-PAD, 0);
      hBg.addColorStop(0, bg4); hBg.addColorStop(1, '#e0ccf5');
      ctx.fillStyle = hBg; ctx.fillRect(PAD, curY, W-PAD*2, TABLE_HDR_H);
      ctx.fillStyle = 'rgba(96,32,168,0.12)';
      ctx.fillRect(PAD, curY + TABLE_HDR_H - 2, W-PAD*2, 2);
      ctx.font = F.tblHdr; ctx.fillStyle = txt3; ctx.textAlign = 'left';
      let hx = PAD + 18;
      ['#', 'Student Name', 'Level', 'Pending Tasks', 'Topic Covered', 'Rating'].forEach((h, i) => {
        ctx.fillText(h, hx, curY + TABLE_HDR_H/2 + 10);
        hx += [COL.no, COL.name, COL.skill, COL.tasks, COL.topic, COL.rating][i];
      });
      curY += TABLE_HDR_H;
    }

    // ⑥ Student row
    function drawRow(r, idx, isPresentRow) {
      const rh = rowHeight(r, isPresentRow), topCY = curY + ROW_PAD;
      const rowClr = isPresentRow ? green : red;

      ctx.fillStyle = idx % 2 === 0 ? bg : bg2;
      ctx.fillRect(PAD, curY, W-PAD*2, rh);

      ctx.fillStyle = rowClr; ctx.fillRect(PAD, curY, 5, rh);
      const rowFade = ctx.createLinearGradient(PAD+5, 0, PAD+100, 0);
      rowFade.addColorStop(0, rowClr+'18'); rowFade.addColorStop(1, 'transparent');
      ctx.fillStyle = rowFade; ctx.fillRect(PAD+5, curY, 95, rh);

      ctx.fillStyle = 'rgba(120,80,200,0.10)';
      ctx.fillRect(PAD, curY+rh-1, W-PAD*2, 1);

      let cx = PAD + 22;
      ctx.font = F.rowNum; ctx.fillStyle = isPresentRow ? txt3 : red; ctx.textAlign = 'left';
      ctx.fillText(idx + 1, cx + 4, topCY + 30);
      cx += COL.no;

      const avR = 36, hex = r.student.color || '#8888aa';
      const rv = parseInt(hex.slice(1,3),16), gv = parseInt(hex.slice(3,5),16), bv = parseInt(hex.slice(5,7),16);

      ctx.shadowColor = hex+'40'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
      ctx.beginPath(); ctx.arc(cx+avR, topCY+avR, avR, 0, Math.PI*2);
      ctx.fillStyle = `rgba(${rv},${gv},${bv},${isPresentRow ? 0.22 : 0.10})`; ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

      ctx.beginPath(); ctx.arc(cx+avR, topCY+avR, avR+2, 0, Math.PI*2);
      ctx.strokeStyle = hex+(isPresentRow ? '60' : '28'); ctx.lineWidth = 2.5; ctx.stroke();

      ctx.font = F.rowInitials; ctx.fillStyle = isPresentRow ? hex : hex+'66'; ctx.textAlign = 'center';
      ctx.fillText(getInitials(r.student.name), cx+avR, topCY+avR+11);

      const nameX = cx+avR*2+20;
      ctx.font = F.rowName; ctx.textAlign = 'left';
      ctx.fillStyle = isPresentRow ? txt : red;
      const sName = r.student.name.length > 26 ? r.student.name.slice(0,25)+'…' : r.student.name;
      ctx.fillText(sName, nameX, topCY+28);
      if (r.student.phone) { ctx.font = F.rowPhone; ctx.fillStyle = txt3; ctx.fillText(r.student.phone, nameX, topCY+58); }

      if (!isPresentRow && r._autoAbsent) {
        ctx.font = F.rowBadge;
        const bText = 'Auto-Absent', bw = ctx.measureText(bText).width + 28, bx = W-PAD-bw-16;
        ctx.shadowColor = red+'28'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 2;
        _cvRoundRect(ctx, bx, topCY+2, bw, 36, 10); ctx.fillStyle = 'rgba(212,32,48,0.10)'; ctx.fill();
        ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        _cvRoundRect(ctx, bx, topCY+2, bw, 36, 10); ctx.strokeStyle = red+'55'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = red; ctx.textAlign = 'center'; ctx.fillText(bText, bx+bw/2, topCY+25); ctx.textAlign = 'left';
      }
      cx += COL.name;

      const lvlColors = { 'Beginner': blue, 'Intermediate': green, 'Advanced': crimson };
      ctx.font = F.rowLevel; ctx.fillStyle = lvlColors[r.skillLevel] || blue;
      ctx.fillText(r.skillLevel, cx, topCY+28);
      cx += COL.skill;

      let ty = topCY + 30;
      ctx.font = F.taskPrimary; ctx.fillStyle = txt2;
      if (r.pendingTasks && r.pendingTasks.length > 0) {
        r.pendingTasks.slice(0, 5).forEach((task, ti) => {
          const prefix = ti === 0 ? '📋 ' : '   + ';
          const tlines = wrapText(ctx, prefix + task.title, COL.tasks - 24);
          tlines.forEach(line => { if (ty < curY+rh-12) { ctx.fillText(line, cx, ty); ty += LINE_H; } });
          if (task.deadline && ty < curY+rh-12) {
            ctx.font = F.taskDue; ctx.fillStyle = orange;
            ctx.fillText('   Due ' + _fmtShortDate(task.deadline), cx, ty); ty += LINE_H;
            ctx.font = F.taskPrimary; ctx.fillStyle = txt2;
          }
        });
        if (r.pendingTasks.length > 5 && ty < curY+rh-12) {
          ctx.font = F.taskMore; ctx.fillStyle = txt3;
          ctx.fillText('   + ' + (r.pendingTasks.length - 5) + ' more…', cx, ty);
        }
      } else { ctx.font = F.ratingNone; ctx.fillStyle = txt3; ctx.fillText('None', cx, ty); }
      cx += COL.tasks;

      ty = topCY + 30;
      const topicSrc = isPresentRow ? (r.progressEntries.length > 0 ? r.progressEntries[0] : null) : r.lastTopic;
      if (topicSrc) {
        ctx.font = F.topicText; ctx.fillStyle = txt2;
        const tlines = wrapText(ctx, topicSrc.topic, COL.topic - 24);
        tlines.forEach(line => { if (ty < curY+rh-12) { ctx.fillText(line, cx, ty); ty += LINE_H; } });
        if (!isPresentRow && topicSrc.date && ty < curY+rh-12) {
          ctx.font = F.topicDate; ctx.fillStyle = txt3;
          ctx.fillText('(' + _fmtShortDate(topicSrc.date) + ')', cx, ty);
        }
      } else { ctx.font = F.ratingNone; ctx.fillStyle = txt3; ctx.fillText('—', cx, topCY+30); }
      cx += COL.topic;

      const ratingSrc = isPresentRow
        ? (r.progressEntries.length > 0 ? r.progressEntries[0].rating : null)
        : (r.lastTopic ? r.lastTopic.rating : null);
      if (ratingSrc) { ctx.font = F.ratingStars; ctx.fillStyle = goldL; ctx.fillText('★'.repeat(ratingSrc), cx, topCY+36); }
      else { ctx.font = F.ratingNone; ctx.fillStyle = txt3; ctx.fillText('—', cx, topCY+30); }

      curY += rh;
    }

    if (report.present.length > 0) {
      drawSectionTitle('✓  Present Students  —  ' + report.present.length + ' attended', green, 'rgba(24,168,88,0.07)');
      drawTableHeader();
      report.present.forEach((r, i) => drawRow(r, i, true));
      curY += 40;
    }
    if (report.absent.length > 0) {
      drawSectionTitle('✕  Absent Students  —  ' + report.absent.length + ' students', red, 'rgba(212,32,48,0.06)');
      drawTableHeader();
      report.absent.forEach((r, i) => drawRow(r, i, false));
      curY += 40;
    }

    // Footer
    ctx.fillStyle = bg3; ctx.fillRect(0, curY, W, 140);
    const footLine = ctx.createLinearGradient(0, 0, W, 0);
    footLine.addColorStop(0, 'transparent'); footLine.addColorStop(0.08, crimson);
    footLine.addColorStop(0.45, gold);       footLine.addColorStop(0.9, purple);
    footLine.addColorStop(1, 'transparent');
    ctx.fillStyle = footLine; ctx.fillRect(0, curY+1, W, 4);
    ctx.font = F.footer; ctx.fillStyle = txt3; ctx.textAlign = 'center';
    ctx.fillText('Generated by ChordStar ♦ MUSIC  —  ' +
      new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      W/2, curY+86);

    const fname = 'ChordStar_Register_' + report.date + '.png';
    showToast('✅ Report ready!', 'success');
    _showRegisterShareModal(cv, fname, report, dateLabel);
  }



  /* ── Register Share Modal (Download + WhatsApp) ─────────── */
  function _showRegisterShareModal(canvas, filename, report, dateLabel) {
    const overlay = el('div', 'reg-share-overlay');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:flex-end;justify-content:center;padding:0;';
    const sheet = el('div', 'reg-share-sheet');
    sheet.style.cssText = 'background:var(--surface,#1e1e2e);border-radius:20px 20px 0 0;padding:24px 20px 32px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;';

    // Handle bar
    const handle = el('div', '');
    handle.style.cssText = 'width:40px;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;margin:0 auto 20px;';
    sheet.appendChild(handle);

    // Preview thumbnail
    const previewWrap = el('div', '');
    previewWrap.style.cssText = 'text-align:center;margin-bottom:20px;';
    const previewImg = document.createElement('img');
    previewImg.src = canvas.toDataURL('image/png');
    previewImg.style.cssText = 'width:100%;max-width:280px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.15);';
    previewWrap.appendChild(previewImg);
    sheet.appendChild(previewWrap);

    // Title
    const title = el('div', '');
    title.innerHTML = '<div style="font-size:17px;font-weight:700;color:var(--text);margin-bottom:4px;">📄 Daily Register Ready</div>'
      + '<div style="font-size:13px;color:var(--text-muted);margin-bottom:20px;">' + dateLabel + '</div>';
    sheet.appendChild(title);

    // Download button
    const dlBtn = el('button', 'btn btn-primary');
    dlBtn.style.cssText = 'width:100%;padding:14px;font-size:15px;margin-bottom:12px;';
    dlBtn.innerHTML = '📥 Download PNG';
    dlBtn.addEventListener('click', () => {
      canvas.toBlob(blob => { _cvDownload(blob, filename); showToast('📥 Downloaded!', 'success'); }, 'image/png');
    });
    sheet.appendChild(dlBtn);

    // WhatsApp share button
    const waBtn = el('button', 'btn btn-whatsapp');
    waBtn.style.cssText = 'width:100%;padding:14px;font-size:15px;margin-bottom:12px;display:flex;align-items:center;justify-content:center;gap:8px;';
    waBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.855L.057 23.57a.75.75 0 0 0 .926.926l5.737-1.474A11.953 11.953 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22a9.954 9.954 0 0 1-5.078-1.39l-.361-.214-3.757.965.997-3.645-.235-.374A9.953 9.953 0 0 1 2 12C2 6.478 6.478 2 12 2s10 4.478 10 10-4.478 10-10 10z"/></svg> Share on WhatsApp';
    waBtn.addEventListener('click', () => {
      canvas.toBlob(blob => {
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], title: 'ChordStar Daily Register – ' + dateLabel, text: '📋 Daily Attendance Register\n🎸 ChordStar' })
            .then(() => showToast('✅ Shared!', 'success'))
            .catch(() => {
              // Fallback: download + open WhatsApp
              _cvDownload(blob, filename);
              const waText = encodeURIComponent('📋 *ChordStar Daily Register*\n' + dateLabel + '\n\n✅ Present: ' + report.present.length + '  ❌ Absent: ' + report.absent.length + '\n\n_(Image downloaded – attach manually)_');
              window.open('https://wa.me/?text=' + waText, '_blank');
            });
        } else {
          // No Web Share API — download + open WhatsApp
          _cvDownload(blob, filename);
          const waText = encodeURIComponent('📋 *ChordStar Daily Register*\n' + dateLabel + '\n\n✅ Present: ' + report.present.length + '  ❌ Absent: ' + report.absent.length + '\n\n_(Image downloaded – attach manually)_');
          window.open('https://wa.me/?text=' + waText, '_blank');
          showToast('📥 Image downloaded – attach on WhatsApp', 'success');
        }
      }, 'image/png');
    });
    sheet.appendChild(waBtn);

    // Close button
    const closeBtn = el('button', 'btn btn-ghost');
    closeBtn.style.cssText = 'width:100%;padding:12px;font-size:14px;color:var(--text-muted);';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => overlay.remove());
    sheet.appendChild(closeBtn);

    overlay.appendChild(sheet);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    // Animate in
    sheet.style.transform = 'translateY(100%)';
    sheet.style.transition = 'transform 0.3s ease';
    requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; });
  }


  return {
    renderDashboard, renderStudents, renderAllTasks, renderStudentDetail, renderAnalytics, renderOnboarding,
    bindEvents, showToast, closeModal, applyTheme,
    showNotifSettings,
    showExportModal, showAddStudentModal, showAddStudentWizard, showEditStudentModal,
    showAddTaskModal, showEditTaskModal, showProgressEntryModal, showLogFeeModal, showImportModal,
    showQuickLogSheet,
    /* Sprint 8 */
    showAchievementCardModal, showShareProgressModal,
    renderDailyRegister,
    _toastTimer: null
  };
})();
