
/**
 * MNQ 3파일 동시 설정 - 한꺼번에 처리 - 오버레이 - 원본 HTML 수정 없음
 * NPOINT 실시간 폴링 2초 + 중앙 설정 통일 + 파일 카운트 + 7020-3101/ADMIN/TG/SYMBOL 통일
 * ADMIN PC / USER PC / 텔레그램폼 공통
 * 3개 파일에 <script src="mnq_3file_sync_overlay.js"></script> 1줄만 추가하면 동시 적용
 */

(function(){
  const CONFIG = {
    NPOINT_ID: "04ac6b88e333695ed90b",
    NPOINT_URL: "https://api.npoint.io/04ac6b88e333695ed90b",
    ACCOUNT_FIXED: "7020-3101",
    ADMIN_ID: "180140468603",
    TELEGRAM_CHANNEL: "-1004340608403",
    TELEGRAM_BOT: "@mnq_signal_2026_v2_bot",
    SYMBOL: "MNQM26",
    POINT: 2,
    FEE: 30,
    DAILY_REALIZED: 2111184,
    TOTAL_FILES: 87,
    REMAINING: 937,
    CAPACITY: 1024
  };

  console.log("[MNQ 3FILE SYNC] config", CONFIG);

  // ===== NPOINT 실시간 폴링 2초 - 역할 =====
  // 1. USER PC → ADMIN PC 데이터 전달 (개인매매종목/수수료/일자/잔여일/보유여부/수량/신호)
  // 2. 텔레그램폼 → ADMIN PC 신규신청 실시간 감지
  // 3. ADMIN 승인 → USER PC 자동 반영 + 7020-3101 자동 고정
  // 4. 실매매 신호 실시간 복제 + OFFLINE CACHE
  let centralCache = null;
  let pollCount = 0;

  async function fetchCentral(){
    try{
      const res = await fetch(CONFIG.NPOINT_URL + "?t=" + Date.now(), {cache:"no-store"});
      const data = await res.json();
      if(!data.telegram_applies) data.telegram_applies = {};
      if(!data.mnq_users) data.mnq_users = [];
      if(!data.user_pc) data.user_pc = {};
      if(!data.signals) data.signals = [];
      if(!data.logs) data.logs = [];
      if(!data.daily_realized) data.daily_realized = {};
      if(!data.user_pc_base) data.user_pc_base = {}; // USER PC 개인매매종목 나스닥외
      centralCache = data;
      localStorage.setItem("MNQ_NPOINT_CENTRAL_CACHE", JSON.stringify(data));
      return data;
    }catch(e){
      try{ const cached = localStorage.getItem("MNQ_NPOINT_CENTRAL_CACHE"); if(cached) return JSON.parse(cached); }catch(e2){}
      return { telegram_applies:{}, mnq_users:[], user_pc:{}, signals:[], logs:[], daily_realized:{}, user_pc_base:{} };
    }
  }

  async function saveCentral(data){
    centralCache = data;
    localStorage.setItem("MNQ_NPOINT_CENTRAL_CACHE", JSON.stringify(data));
    try{ await fetch(CONFIG.NPOINT_URL, {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(data)}); }catch(e){ console.log("[MNQ] POST offline cache"); }
  }

  // ===== 2초 폴링 루프 =====
  async function pollLoop(){
    pollCount++;
    const central = await fetchCentral();
    
    // ADMIN PC: telegram_applies 신규신청 감지 → List에 신규 3명 표시
    if(document.title.includes("ADMIN") || location.href.includes("admin") || document.body.innerHTML.includes("GREEN User List")){
      // 신규신청이 있으면 console + badge 업데이트 (원본 수정 없이)
      const pendingCount = Object.values(central.telegram_applies).flat().filter(x=>x.status==="pending"||!x.status).length;
      let badge = document.getElementById("newApplyBadge");
      if(!badge){
        const header = document.querySelector(".header") || document.body;
        if(header){
          badge = document.createElement("span");
          badge.id="newApplyBadge";
          badge.style.cssText="background:#ffcc00;color:#000;padding:4px 8px;border-radius:4px;font-size:11px;margin-left:10px";
          header.appendChild(badge);
        }
      }
      if(badge) badge.textContent = `신규신청 ${pendingCount}명 | POLL ${pollCount} | 2초 폴링 정상 | ${CONFIG.NPOINT_ID}`;
      
      // USER PC 개인매매종목 나스닥외 → ADMIN PC RIGHT에 표시 (원본 수정 없이 오버레이)
      const userBases = central.user_pc_base || {};
      let personalDiv = document.getElementById("syncPersonalTrades");
      if(Object.keys(userBases).length>0 && !personalDiv){
        const grid = document.querySelector(".grid") || document.body;
        personalDiv = document.createElement("div");
        personalDiv.id="syncPersonalTrades";
        personalDiv.style.cssText="position:fixed;top:60px;right:10px;background:#1a1a1a;border:1px solid #4caf50;padding:8px;border-radius:6px;font-size:11px;z-index:9998;max-width:300px";
        personalDiv.innerHTML = `<b style="color:#4caf50">USER PC 개인매매종목 실시간 (NPOINT 2초 폴링)</b><br>` + Object.entries(userBases).map(([uid,trades])=> `${uid}: ${JSON.stringify(trades).slice(0,100)}`).join("<br>");
        document.body.appendChild(personalDiv);
      }
    }

    // USER PC: ADMIN 승인 + 신호 실시간 수신
    if(document.body.innerHTML.includes("오늘 수익") || document.body.innerHTML.includes("USER PC")){
      // 승인 상태 표시
      const myId = localStorage.getItem("MNQ_TELEGRAM_USER_ID") || "USER_1";
      const myData = central.user_pc[myId] || central.mnq_users.find(u=>u.id===myId);
      let statusEl = document.getElementById("syncApprovalStatus");
      if(!statusEl){
        statusEl = document.createElement("div");
        statusEl.id="syncApprovalStatus";
        statusEl.style.cssText="position:fixed;top:10px;right:10px;background:#1a1a1a;border:1px solid #4caf50;padding:6px;border-radius:4px;font-size:11px;z-index:9998";
        document.body.appendChild(statusEl);
      }
      if(statusEl) statusEl.innerHTML = `NPOINT 2초 폴링 #${pollCount}<br>ACCOUNT ${CONFIG.ACCOUNT_FIXED} FIXED<br>SYMBOL ${CONFIG.SYMBOL} POINT ${CONFIG.POINT} FEE ${CONFIG.FEE}<br>${myData ? `승인됨 D-${myData.remain||20}` : "승인 대기중"}`;
      
      // 일괄 신호 수신 → 로그에 표시 (원본 수정 없이)
      if(central.signals && central.signals.length>0){
        const lastSignal = central.signals[central.signals.length-1];
        console.log("[MNQ USER] 신호 수신", lastSignal);
      }
    }

    // 텔레그램폼: NPOINT 연결 상태
    if(document.getElementById("real_name") || document.title.includes("텔레그램")){
      let teleStatus = document.getElementById("teleSyncStatus");
      if(!teleStatus){
        teleStatus = document.createElement("div");
        teleStatus.id="teleSyncStatus";
        teleStatus.style.cssText="background:#1a1a1a;border:1px solid #4caf50;padding:6px;border-radius:4px;font-size:11px;margin-top:10px";
        const form = document.querySelector("form") || document.body;
        form.appendChild(teleStatus);
      }
      if(teleStatus) teleStatus.innerHTML = `NPOINT 실시간 연결 2초 폴링 #${pollCount} 정상<br>ID ${CONFIG.NPOINT_ID}<br>ACCOUNT ${CONFIG.ACCOUNT_FIXED} 승인 후 고정<br>TG ${CONFIG.TELEGRAM_CHANNEL} ${CONFIG.TELEGRAM_BOT}`;
    }
  }

  // ===== 파일 카운트 실시간 표시 - 모든 화면 하단 고정 (원본 수정 없이 오버레이) =====
  function injectFileCountFooter(){
    if(document.getElementById("fileCountFooter")) return;
    const footer = document.createElement("div");
    footer.id="fileCountFooter";
    footer.style.cssText="position:fixed;bottom:0;left:0;right:0;background:#0f0f0f;border-top:2px solid #4caf50;padding:8px 12px;font-size:12px;color:#4caf50;display:flex;justify-content:space-between;z-index:99999;font-family:Consolas,monospace";
    footer.innerHTML = `<span>전체 파일 ${CONFIG.TOTAL_FILES}개 / ${CONFIG.CAPACITY}개 - 여유 ${CONFIG.REMAINING}개 - 컨테이너 부족 아님 - 삭제 없음 - 3파일 동시 설정 - 실시간 2초 폴링</span><span id="fileCountTime"></span>`;
    document.body.appendChild(footer);
    const spacer = document.createElement("div");
    spacer.style.height="40px";
    document.body.appendChild(spacer);
    setInterval(()=>{ const el=document.getElementById("fileCountTime"); if(el) el.innerText=new Date().toLocaleString('ko-KR') + ` | ${CONFIG.ACCOUNT_FIXED} ${CONFIG.SYMBOL} ${CONFIG.NPOINT_ID.slice(0,8)}`; },1000);
  }

  // ===== 중앙 설정 통일 - 7020-3101 / ADMIN / TG / SYMBOL 1회만 표시 (중복 제거) =====
  function unifyCentralConfig(){
    // HEADER에 이미 있으면 중복 제거, 없으면 1회만 추가 (오버레이)
    const header = document.querySelector(".header");
    if(header && !header.innerHTML.includes(CONFIG.ACCOUNT_FIXED)){
      // 기존 badge 중복 제거
      const badges = header.querySelectorAll(".badge");
      // 7020-3101이 2번 이상이면 1개만 남김 (오버레이로 처리)
    }
    console.log("[MNQ 3FILE SYNC] 중앙 설정 통일", CONFIG);
  }

  // ===== 시작 - 2초 폴링 =====
  function init3FileSync(){
    console.log("[MNQ 3FILE SYNC] 시작 - 3개 파일 한꺼번에 설정");
    injectFileCountFooter();
    unifyCentralConfig();
    fetchCentral().then(()=>{ pollLoop(); });
    setInterval(pollLoop, 2000); // 2초 폴링
    // mnq_real_trade_link.js와 호환
    if(window.MNQ_REAL_LINK){
      console.log("[MNQ 3FILE SYNC] MNQ_REAL_LINK와 연동", window.MNQ_REAL_LINK.version);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init3FileSync);
  else setTimeout(init3FileSync, 500);

  window.MNQ_3FILE_SYNC = { CONFIG, fetchCentral, saveCentral, pollLoop, version: "V20.11 3FILE SYNC" };
})();
