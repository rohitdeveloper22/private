/**
 * app.js  v5.1
 * Navigation: dashboard, students, tasks, detail, analytics, onboarding
 * Android back support, global search, notifications button
 */
const App = (() => {
  let _currentScreen='dashboard', _currentStudent=null, _inDetail=false;

  function navigate(screen, studentId) {
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    const nav=document.getElementById('bottom-nav');
    const header=document.getElementById('header-actions');
    document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.screen===screen));

    if (screen==='detail'&&studentId) {
      _currentStudent=studentId; _currentScreen='detail'; _inDetail=true;
      document.getElementById('screen-detail').classList.add('active');
      nav.classList.add('hidden');
      history.pushState({screen:'detail',studentId},'','');
      header.innerHTML='';
      const back=document.createElement('button'); back.className='btn-back'; back.innerHTML='‹ Back';
      back.addEventListener('click',()=>navigate('students')); header.appendChild(back);
      UI.renderStudentDetail(studentId);

    } else if (screen==='onboarding') {
      _currentScreen='onboarding'; _inDetail=false;
      document.getElementById('screen-onboarding').classList.add('active');
      nav.classList.add('hidden'); _rebuildHeader(header);

    } else if (screen==='analytics') {
      _currentScreen='analytics'; _inDetail=false;
      document.getElementById('screen-analytics').classList.add('active');
      nav.classList.remove('hidden'); _rebuildHeader(header);
      UI.renderAnalytics();

    } else {
      _currentStudent=null; _currentScreen=screen; _inDetail=false;
      document.getElementById(`screen-${screen}`).classList.add('active');
      nav.classList.remove('hidden'); _rebuildHeader(header);
      if (screen==='dashboard')      UI.renderDashboard();
      else if (screen==='students')  UI.renderStudents();
      else if (screen==='tasks')     UI.renderAllTasks();
      else if (screen==='register')  UI.renderDailyRegister();
    }
  }

  function _rebuildHeader(header) {
    if (header.querySelector('#btn-export')) return;
    header.innerHTML='';

    // Sprint 6: Global search button
    const searchBtn=document.createElement('button');
    searchBtn.className='icon-btn'; searchBtn.id='btn-global-search'; searchBtn.title='Search'; searchBtn.textContent='🔍';
    searchBtn.addEventListener('click',()=>{ document.getElementById('search-overlay')?.classList.add('open'); document.getElementById('global-search-input')?.focus(); });
    header.appendChild(searchBtn);

    // Sprint 3: Notifications button
    const notifBtn=document.createElement('button');
    notifBtn.className='icon-btn'; notifBtn.id='btn-notif'; notifBtn.title='Notifications'; notifBtn.textContent='🔔';
    notifBtn.addEventListener('click',()=>UI.showNotifSettings?.());
    header.appendChild(notifBtn);

    const themeBtn=document.createElement('button');
    themeBtn.className='icon-btn'; themeBtn.id='btn-theme'; themeBtn.title='Toggle theme';
    themeBtn.textContent=Storage.getTheme()==='light'?'🌙':'☀️';
    themeBtn.addEventListener('click',()=>{ const n=Storage.getTheme()==='dark'?'light':'dark'; Storage.setTheme(n); UI.applyTheme(n); themeBtn.textContent=n==='light'?'🌙':'☀️'; });
    header.appendChild(themeBtn);

    const impBtn=document.createElement('button');
    impBtn.className='icon-btn'; impBtn.id='btn-import'; impBtn.title='Import'; impBtn.textContent='⬆';
    impBtn.addEventListener('click',()=>UI.showImportModal(()=>{UI.renderDashboard();UI.renderStudents();}));
    header.appendChild(impBtn);

    const expBtn=document.createElement('button');
    expBtn.className='icon-btn'; expBtn.id='btn-export'; expBtn.title='Export'; expBtn.textContent='⬇';
    expBtn.addEventListener('click',()=>{Storage.exportJSON();UI.showToast('Backup downloaded 💾','success');});
    header.appendChild(expBtn);
  }

  function initBackNavigation() {
    history.replaceState({screen:'root'},'','');
    window.addEventListener('popstate',()=>{
      if (_inDetail) { _inDetail=false; navigate('students'); }
      else if (_currentScreen!=='dashboard') navigate('dashboard');
    });
  }

  function checkOnboarding() {
    if (Students.getStudents().length===0&&!Storage.getOnboardingDone()) { navigate('onboarding'); return true; }
    return false;
  }

  function checkTodayAlert() {
    const c=Tasks.getTodayTaskCount();
    if (c>0) setTimeout(()=>UI.showToast(`📅 ${c} class${c>1?'es':''} due today!`,'warn'),1000);
  }

  function registerSW() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }

  async function init() {
    UI.applyTheme(Storage.getTheme());
    // Sprint 8: await IndexedDB init (loads data into memory cache)
    await Storage.initStorage();
    UI.bindEvents();
    initBackNavigation();
    if (!checkOnboarding()) { navigate('dashboard'); checkTodayAlert(); }
    registerSW();
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
  return { navigate };
})();
