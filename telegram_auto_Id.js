/**
 * 텔레그램 ID 자동 인식 오버레이 - 폼 변형 없음
 * 원본 Index.html / Telegram-Form.html 에 <script src="telegram_auto_id.js"> 한 줄만 추가
 * 기능: Telegram.WebApp.initDataUnsafe.user 자동 인식 → telegram_id + real_name 자동 채움
 */

(function(){
  console.log('[텔레그램 자동 ID] 오버레이 로드');

  function getTelegramUser(){
    try{
      const tg = window.Telegram?.WebApp;
      if(tg){
        try{ tg.ready(); tg.expand(); }catch(e){}
        const u = tg.initDataUnsafe?.user;
        if(u && u.id){
          return {
            id: u.id,
            telegram_id: u.id,
            first_name: u.first_name || '',
            last_name: u.last_name || '',
            username: u.username || '',
            username_at: u.username ? '@'+u.username : '',
            real_name: ((u.first_name||'') + (u.last_name ? ' '+u.last_name : '')).trim() || (u.username ? '@'+u.username : 'User'),
            displayName: ((u.first_name||'') + (u.last_name ? ' '+u.last_name : '')).trim() || (u.username ? '@'+u.username : 'User')
          };
        }
      }
      // 캐시 fallback
      const cached = localStorage.getItem('MNQ_TELEGRAM_USER_INFO');
      if(cached){
        const c = JSON.parse(cached);
        if(c.telegram_id || c.id){
          return {
            id: c.telegram_id || c.id,
            telegram_id: c.telegram_id || c.id,
            first_name: c.first_name || '',
            last_name: c.last_name || '',
            username: c.username || '',
            username_at: c.username ? '@'+c.username : '',
            real_name: c.real_name || c.displayName || 'User',
            displayName: c.displayName || c.real_name || 'User'
          };
        }
      }
    }catch(e){ console.warn('[텔레그램 자동 ID] 인식 실패', e); }
    return null;
  }

  function applyAutoFill(){
    const info = getTelegramUser();
    if(!info){
      // 자동 인식 실패 - 안내만
      const badge = document.getElementById('tgIdBadge');
      if(badge){
        badge.textContent = '수동 입력 - @userinfobot에서 ID 확인 가능';
        badge.style.background = '#3a3d4a';
        badge.style.color = '#fff';
      }
      return;
    }

    console.log('[텔레그램 자동 ID] 인식 성공', info);

    // 1. 실명 자동 채움 (기존 값이 없을 때만 - 원형 보존)
    const realNameEl = document.getElementById('real_name');
    if(realNameEl && !realNameEl.value && info.real_name && info.real_name!=='User'){
      realNameEl.value = info.real_name;
      realNameEl.style.borderColor = '#22c55e';
      realNameEl.style.background = '#1a2a1a';
      realNameEl.title = '텔레그램에서 자동 인식됨';
    }

    // 2. 텔레그램 ID 자동 채움 - 핵심 (기존 값이 없을 때만)
    const tgIdEl = document.getElementById('telegram_id');
    if(tgIdEl && !tgIdEl.value){
      if(info.username){
        tgIdEl.value = info.username_at; // @username 우선
      } else {
        tgIdEl.value = String(info.telegram_id); // 숫자 ID
      }
      tgIdEl.style.borderColor = '#22c55e';
      tgIdEl.style.background = '#1a2a1a';
      tgIdEl.title = `숫자 ID: ${info.telegram_id} / Username: ${info.username||'없음'} - 자동 인식됨`;
    }

    // 3. 배지 표시 (있으면)
    const tgBadge = document.getElementById('tgIdBadge');
    if(tgBadge){
      tgBadge.textContent = '✓ 자동 인식됨 (ID: '+info.telegram_id+')';
      tgBadge.style.background = '#22c55e';
      tgBadge.style.color = '#000';
    }
    const nameBadge = document.getElementById('realNameBadge');
    if(nameBadge && info.real_name){
      nameBadge.textContent = '✓ 자동';
      nameBadge.style.background = '#22c55e';
      nameBadge.style.color = '#000';
      nameBadge.style.padding = '2px 6px';
      nameBadge.style.borderRadius = '10px';
      nameBadge.style.fontSize = '10px';
    }

    // 4. localStorage 저장 (실매매 연동용)
    try{
      localStorage.setItem('MNQ_TELEGRAM_USER_INFO', JSON.stringify(info));
      localStorage.setItem('MNQ_TELEGRAM_USER_ID', 'TG_'+info.telegram_id);
      localStorage.setItem('MNQ_TELEGRAM_AUTO_DETECTED', 'true');
      window.TELEGRAM_USER_INFO = info;
      window.REAL_USER_ID = 'TG_'+info.telegram_id;
    }catch(e){}

    // 5. 상단 정보 박스가 있으면 표시
    const autoInfoBox = document.getElementById('telegramAutoInfo');
    if(autoInfoBox){
      autoInfoBox.style.display = 'block';
      const nameEl = document.getElementById('tgDisplayName');
      const userEl = document.getElementById('tgUsername');
      if(nameEl) nameEl.textContent = info.displayName || info.real_name;
      if(userEl) userEl.textContent = (info.username_at||'') + ' (ID: '+info.telegram_id+')';
    }

    const detectInfo = document.getElementById('autoDetectInfo');
    if(detectInfo){
      detectInfo.style.display = 'block';
      detectInfo.textContent = `✅ 자동 인식 완료: ${info.real_name} / ID: ${info.telegram_id} ${info.username_at||''}`;
      detectInfo.style.color = '#22c55e';
      detectInfo.style.background = '#1a2a1f';
      detectInfo.style.border = '1px solid #22c55e';
      detectInfo.style.padding = '8px';
      detectInfo.style.borderRadius = '6px';
      detectInfo.style.marginTop = '8px';
      detectInfo.style.fontSize = '11px';
    }
  }

  // 초기화 - DOM 로드 후 실행 (원형 폼 건드리지 않음)
  function init(){
    // Telegram WebApp 스크립트가 없으면 동적으로 로드
    if(!window.Telegram){
      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-web-app.js';
      script.onload = function(){
        setTimeout(applyAutoFill, 500);
      };
      document.head.appendChild(script);
    } else {
      setTimeout(applyAutoFill, 300);
    }
    // 늦게 로드될 경우 재시도
    setTimeout(applyAutoFill, 1500);
    setTimeout(applyAutoFill, 3000);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 전역 노출 (디버깅용)
  window.TELEGRAM_AUTO_ID = {
    getUser: getTelegramUser,
    apply: applyAutoFill,
    version: '1.0 - 원형 유지 오버레이'
  };

  console.log('[텔레그램 자동 ID] 오버레이 초기화 완료 - 원형 유지');
})();
</script>
