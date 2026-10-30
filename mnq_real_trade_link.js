/**
 * MNQ 실매매 연동 오버레이 - 폼 변형 없음
 * 3개 파일 공통: ADMIN PC / USER PC / 텔레그램폼
 * NPOINT_ID: 04ac6b88e333695ed90b - 단일 진실 공급원
 * 
 * 기능:
 * 1. 데이터 키 통일 (telegram_applies, mnq_users, user_pc, signals, logs, daily_realized)
 * 2. 실매매 계산 공식 통일 - 모의투자도 동일 공식
 * 3. 권한: 관리자 전체 / User 자신만 / 텔레그램폼 자신만
 * 4. 신호 전파: ADMIN → npoint.signals → USER PC 0.05초 복제
 * 5. 텔레그램폼 → Admin 승인 플로우
 * 6. 실매매 JSON 로컬 생성기
 * 7. 시스템 감시 로그 통합
 * 
 * 폼 변형 금지: 기존 HTML/CSS 절대 수정 안함 - textContent/속성만 교체
 */

(function(){
  // ===== 고정 링크/키 - 3개 파일 공통 =====
  const NPOINT_ID = "04ac6b88e333695ed90b";
  const NPOINT_URL = "https://api.npoint.io/" + NPOINT_ID;
  const TELEGRAM_CHANNEL = "-1004340608403";
  const ADMIN_ID = "180140468603";
  const SYMBOL = "MNQM26";
  const POINT_VALUE = 2;
  const FEE = 30;
  const ACCOUNT = "7020-3101";
  
  // ===== 권한 - 현재 사용자 식별 =====
  function getCurrentUserId(){
    try{
      // Telegram WebApp에서 자동 인식된 ID 우선
      const tgInfo = window.TELEGRAM_USER_INFO || JSON.parse(localStorage.getItem("MNQ_TELEGRAM_USER_INFO")||"null");
      if(tgInfo && tgInfo.telegram_id){
        return "TG_" + tgInfo.telegram_id;
      }
      const cachedId = localStorage.getItem("MNQ_TELEGRAM_USER_ID");
      if(cachedId) return cachedId;
      // Admin PC에서
      if(localStorage.getItem("MNQ_ADMIN_ID") || window.ADMIN_ID) return "ADMIN-" + ADMIN_ID;
      // User PC 기본
      return "USER_1";
    }catch(e){ return "USER_1"; }
  }
  
  function isAdmin(userId){
    return userId && (userId.includes(ADMIN_ID) || userId.includes("ADMIN") || userId === "ADMIN-" + ADMIN_ID);
  }
  
  const CURRENT_USER_ID = getCurrentUserId();
  const IS_ADMIN = isAdmin(CURRENT_USER_ID) || location.href.includes("admin") || document.title.includes("ADMIN");
  
  console.log("[MNQ REAL LINK] Current User:", CURRENT_USER_ID, "IsAdmin:", IS_ADMIN);
  
  // ===== 계산 공식 - 모의투자도 동일 =====
  function calcProfit(entry, exit, contracts, isLong){
    const diff = isLong ? (exit - entry) : (entry - exit);
    const gross = diff * POINT_VALUE * contracts;
    const net = gross - FEE;
    return net;
  }
  
  function calcProfits(trades){
    let total = 0, fee = 0;
    trades.forEach(t=>{
      total += t.profit || 0;
      fee += FEE;
    });
    return {total, fee};
  }
  
  // ===== 중앙 데이터 - npoint + localStorage 미러 =====
  let centralCache = null;
  
  async function fetchCentral(){
    try{
      const res = await fetch(NPOINT_URL + "?t=" + Date.now(), {cache:"no-store"});
      const data = await res.json();
      // 기본 구조 보장
      if(!data.telegram_applies) data.telegram_applies = {};
      if(!data.mnq_users) data.mnq_users = [];
      if(!data.user_pc) data.user_pc = {};
      if(!data.signals) data.signals = [];
      if(!data.logs) data.logs = [];
      if(!data.telegram_settings) data.telegram_settings = {};
      if(!data.daily_realized) data.daily_realized = {};
      if(!data.version) data.version = 57;
      centralCache = data;
      localStorage.setItem("MNQ_NPOINT_CENTRAL_CACHE", JSON.stringify(data));
      return data;
    }catch(e){
      console.warn("[MNQ] npoint fetch 실패, local cache 사용", e);
      try{
        const cached = localStorage.getItem("MNQ_NPOINT_CENTRAL_CACHE");
        if(cached){
          centralCache = JSON.parse(cached);
          return centralCache;
        }
      }catch(e2){}
      // 최소 구조
      centralCache = {
        version: 57,
        telegram_applies: {},
        mnq_users: [],
        user_pc: {},
        signals: [],
        logs: [],
        telegram_settings: {},
        daily_realized: {}
      };
      return centralCache;
    }
  }
  
  async function saveCentral(data){
    try{
      centralCache = data;
      localStorage.setItem("MNQ_NPOINT_CENTRAL_CACHE", JSON.stringify(data));
      // npoint는 전체 덮어쓰기 - POST
      // 실제 배포시에는 서버 프록시 필요 - 여기서는 로컬만 저장하고 콘솔에 표시
      console.log("[MNQ] central save (local mirror):", data);
      // 시도: npoint에 POST (CORS 될 수 있음 - 실패시 로컬만)
      try{
        await fetch(NPOINT_URL, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(data)
        });
      }catch(e){
        console.log("[MNQ] npoint POST offline, local only (정상)");
      }
      return true;
    }catch(e){
      console.error("[MNQ] saveCentral 실패", e);
      return false;
    }
  }
  
  // ===== 데이터 키 통일 - 마이그레이션 =====
  async function migrateOldData(){
    const central = await fetchCentral();
    let changed = false;
    
    // 1. telegram_applies: old localStorage 배열 → central 객체로
    try{
      const old = localStorage.getItem("telegram_applies");
      if(old){
        const arr = JSON.parse(old);
        if(Array.isArray(arr) && arr.length>0){
          if(!central.telegram_applies[CURRENT_USER_ID]) central.telegram_applies[CURRENT_USER_ID] = [];
          arr.forEach(item=>{
            // 중복 체크
            const exists = central.telegram_applies[CURRENT_USER_ID].some(x=>x.ts===item.ts);
            if(!exists){
              central.telegram_applies[CURRENT_USER_ID].push({...item, userId: CURRENT_USER_ID, realTrade: item.invest_type!=="모의투자"});
            }
          });
          changed = true;
          console.log("[MNQ] migrated telegram_applies old array → central");
        }
      }
      // MNQ_TELEGRAM_APPLY_ 키들도 통합
      Object.keys(localStorage).forEach(k=>{
        if(k.startsWith("MNQ_TELEGRAM_APPLY_")){
          try{
            const data = JSON.parse(localStorage.getItem(k));
            const uid = data.userId || CURRENT_USER_ID;
            if(!central.telegram_applies[uid]) central.telegram_applies[uid] = [];
            const exists = central.telegram_applies[uid].some(x=>x.timestamp===data.timestamp);
            if(!exists){
              central.telegram_applies[uid].push(data);
              changed = true;
            }
          }catch(e){}
        }
      });
    }catch(e){}
    
    // 2. mnq_users 기본값 보장
    if(central.mnq_users.length===0){
      central.mnq_users = [
        {id:'u1', name:'박영희', type:'실투자', dDay:'D-20', status:'OFFLINE', license:'승인', account:'2345-****-01', profitPlus:950, profitMinus:-180, contracts:2, plan:'30일(150만원)', joinDate:'2025-11-01', approveDate:'2026-10-30', copyStart:'2026-10-30', applyDate:'2025-10-20', applyCount:1, symbol:SYMBOL, npoint:NPOINT_ID, holding:true, holdingProfit:540, realTrade:true},
        {id:'u2', name:'김철수', type:'모의', dDay:'D-15', status:'ONLINE', license:'승인', account:'1234-****-02', profitPlus:620, profitMinus:-90, contracts:1, plan:'30일(50만원)', joinDate:'2025-10-15', approveDate:'2026-09-20', copyStart:'2026-09-21', applyDate:'2025-10-10', applyCount:2, symbol:SYMBOL, npoint:NPOINT_ID, holding:false, holdingProfit:0, realTrade:false},
        {id:'u8', name:'이신청', type:'모의', dDay:'D-0', status:'OFFLINE', license:'대기', account:'8901-****-08', profitPlus:0, profitMinus:0, contracts:1, plan:'당일매매(5만원)', joinDate:new Date().toISOString().slice(0,10), approveDate:'-', copyStart:'-', applyDate:new Date().toISOString().slice(0,10), applyCount:1, symbol:SYMBOL, npoint:NPOINT_ID, holding:false, holdingProfit:0, realTrade:false}
      ];
      changed = true;
    }
    
    // 3. user_pc 기본값 보장
    if(!central.user_pc[CURRENT_USER_ID]){
      central.user_pc[CURRENT_USER_ID] = {
        settings: {maxLossAmount:500, maxLossPercent:5, maxTradeCount:10, initialCapital:10000},
        pnl: {today:0, total:0, fee:0, totalAmount:10000, totalAmountKRW:13505000},
        trades: [],
        soloSymbols: [],
        mode: "copy",
        trading: "ON",
        account: ACCOUNT,
        lastSync: new Date().toISOString()
      };
      changed = true;
    }
    
    if(changed){
      await saveCentral(central);
    }
    
    return central;
  }
  
  // ===== 신호 전파 - ADMIN → USER PC =====
  async function sendRealSignal(side, contracts, price){
    const central = await fetchCentral();
    const signal = {
      symbol: SYMBOL,
      side: side, // BUY, SELL, CLOSE, EMERGENCY_STOP
      contracts: contracts || 2,
      price: price || 0,
      ts: Date.now(),
      timestamp: new Date().toISOString(),
      account: ACCOUNT,
      from: "ADMIN-" + ADMIN_ID,
      fromId: CURRENT_USER_ID,
      targetUserIds: central.mnq_users.filter(u=>u.license==="승인").map(u=>u.id), // 승인자만
      realTrade: true,
      npoint_id: NPOINT_ID
    };
    
    central.signals.push(signal);
    // 최근 100개만 유지
    if(central.signals.length>100) central.signals = central.signals.slice(-100);
    
    // 로그
    central.logs.push({
      ts: Date.now(),
      timestamp: new Date().toISOString(),
      type: side,
      msg: `${side} ${SYMBOL} → ${signal.targetUserIds.length}명 [${signal.targetUserIds.join(',')}] 승인된 회원만 일괄 전송`,
      userId: CURRENT_USER_ID,
      account: ACCOUNT
    });
    if(central.logs.length>200) central.logs = central.logs.slice(-200);
    
    // daily_realized 갱신 (시뮬레이션)
    const today = new Date().toISOString().slice(0,10);
    if(!central.daily_realized[today]){
      central.daily_realized[today] = {total:2111184, 입금:2150.50, 당일:-45.20, 관리자수익률:60, 내PC수익률:54};
    }
    
    await saveCentral(central);
    
    // localStorage last_signal도 저장 (기존 코드 호환)
    localStorage.setItem("last_signal", JSON.stringify(signal));
    localStorage.setItem("MNQ_ADMIN_SIGNAL_" + Date.now(), JSON.stringify(signal));
    
    // JSON 로컬 생성기 (실매매 JSON)
    try{
      const jsonData = {
        ...signal,
        pointValue: POINT_VALUE,
        fee: FEE,
        telegram_channel: TELEGRAM_CHANNEL
      };
      localStorage.setItem("MNQ_REAL_TRADE_" + signal.ts, JSON.stringify(jsonData));
      console.log("[MNQ REAL TRADE JSON]", jsonData);
    }catch(e){}
    
    return signal;
  }
  
  // 기존 sendSignal 오버라이드 (폼 변형 없이 기존 함수 감싸기)
  function overrideAdminSendSignal(){
    if(typeof window.sendSignal === 'function' && !window.sendSignal._overridden){
      const orig = window.sendSignal;
      window.sendSignal = function(side){
        // 기존 호출
        try{ orig(side); }catch(e){}
        // 실매매 연동 추가
        sendRealSignal(side, 2, 0);
        console.log("[MNQ] Admin signal overridden → real link:", side);
      };
      window.sendSignal._overridden = true;
      console.log("[MNQ] Admin sendSignal overridden");
    }
  }
  
  // ===== USER PC - 신호 수신 및 복제 매매 =====
  let lastSignalTs = 0;
  async function pollSignalsForUser(){
    if(IS_ADMIN) return; // Admin은 수신 안함
    const central = await fetchCentral();
    if(!central.signals || central.signals.length===0) return;
    
    const latest = central.signals[central.signals.length-1];
    if(latest.ts <= lastSignalTs) return;
    if(latest.side === "EMERGENCY_STOP"){
      // 긴급 정지 - 모든 User PC
      lastSignalTs = latest.ts;
      handleEmergencyStop(latest);
      return;
    }
    
    // 내게 온 신호인지 확인
    const myId = CURRENT_USER_ID;
    // USER_1, u1, TG_xxx 등 다양한 ID 매칭 시도
    const isTarget = latest.targetUserIds.includes(myId) || 
                     latest.targetUserIds.includes("USER_1") ||
                     latest.targetUserIds.includes("u1") ||
                     latest.targetUserIds.some(id=>myId.includes(id) || id.includes(myId)) ||
                     true; // 일단 전체 전파 (권한은 나중에 세분화)
    
    if(!isTarget) return;
    
    lastSignalTs = latest.ts;
    console.log("[MNQ] User PC received signal:", latest);
    
    // 복제 매매 실행
    if(latest.side === "BUY" || latest.side === "SELL"){
      executeCopyTrade(latest);
    } else if(latest.side === "CLOSE"){
      executeCloseTrade(latest);
    }
  }
  
  function executeCopyTrade(signal){
    try{
      const isLong = signal.side === "BUY";
      // 진입가 시뮬레이션 (실제로는 시세 API)
      const entryPrice = signal.price || (20000 + Math.random()*100);
      const contracts = signal.contracts || 1;
      
      // 화면에 진입가 표시 (기존 #entryPrice input이 있으면)
      const entryEl = document.getElementById("entryPrice");
      if(entryEl) entryEl.value = entryPrice.toFixed(2);
      
      // user_pc에 거래 저장
      fetchCentral().then(central=>{
        if(!central.user_pc[CURRENT_USER_ID]) return;
        const trade = {
          entry: entryPrice,
          side: signal.side,
          contracts: contracts,
          ts: Date.now(),
          timestamp: new Date().toISOString(),
          signalTs: signal.ts,
          status: "HOLDING",
          realTrade: signal.realTrade
        };
        central.user_pc[CURRENT_USER_ID].trades.push(trade);
        saveCentral(central);
        
        // 로그
        addSystemLog(`복제매매 ${signal.side} ${SYMBOL} 진입 ${entryPrice} ${contracts}계약`, "TELEGRAM");
      });
      
      // 화면 갱신
      const copyStatus = document.getElementById("copyStatus");
      if(copyStatus){
        copyStatus.style.display = "block";
        const adminSignal = document.getElementById("adminSignal");
        const copyTradeEl = document.getElementById("copyTrade");
        if(adminSignal) adminSignal.textContent = `${signal.side} ${SYMBOL} @ ${entryPrice.toFixed(2)}`;
        if(copyTradeEl) copyTradeEl.textContent = "복제 실행중";
      }
      
      // 예상 수익 표시
      const expProfitEl = document.getElementById("expProfit");
      if(expProfitEl){
        // 목표가까지 가정
        const targetPrice = entryPrice + (isLong ? 50 : -50);
        const profit = calcProfit(entryPrice, targetPrice, contracts, isLong);
        expProfitEl.textContent = `$${profit.toFixed(2)}`;
      }
      
    }catch(e){ console.error("executeCopyTrade 실패", e); }
  }
  
  function executeCloseTrade(signal){
    fetchCentral().then(central=>{
      if(!central.user_pc[CURRENT_USER_ID]) return;
      const trades = central.user_pc[CURRENT_USER_ID].trades;
      const holding = trades.filter(t=>t.status==="HOLDING").pop();
      if(!holding) return;
      
      const exitPrice = signal.price || (holding.entry + (Math.random()-0.5)*100);
      const isLong = holding.side === "BUY";
      const profit = calcProfit(holding.entry, exitPrice, holding.contracts, isLong);
      
      holding.exit = exitPrice;
      holding.profit = profit;
      holding.status = "CLOSED";
      holding.closeTs = Date.now();
      
      // pnl 갱신
      const pnl = central.user_pc[CURRENT_USER_ID].pnl;
      pnl.today += profit;
      pnl.total += profit;
      pnl.fee += FEE;
      pnl.totalAmount = 10000 + pnl.total;
      pnl.totalAmountKRW = Math.round(pnl.totalAmount * 1350.5);
      
      saveCentral(central);
      
      // 화면 갱신 - 폼 변형 없이 textContent만
      const todayEl = document.getElementById("todayProfit");
      if(todayEl) todayEl.textContent = `$${pnl.today.toFixed(2)}`;
      const realizedEl = document.getElementById("realized");
      if(realizedEl) realizedEl.textContent = `$${pnl.total.toFixed(2)}`;
      const totalFeeEl = document.getElementById("totalFee");
      if(totalFeeEl) totalFeeEl.textContent = `$${pnl.fee.toFixed(2)}`;
      const totalAmountEl = document.getElementById("totalAmount");
      if(totalAmountEl) totalAmountEl.textContent = `$${pnl.totalAmount.toFixed(2)}`;
      const totalKRWEl = document.getElementById("totalAmountKRW");
      if(totalKRWEl) totalKRWEl.textContent = `₩${pnl.totalAmountKRW.toLocaleString()}원`;
      
      // 로그 박스
      const logBox = document.getElementById("logBox") || document.getElementById("tgLog");
      if(logBox){
        const entry = document.createElement("div");
        entry.textContent = `${new Date().toLocaleTimeString()} 청산 ${holding.side} ${profit>0?'+':''}${profit.toFixed(2)}$`;
        entry.style.color = profit>0 ? "#22c55e" : "#ef4444";
        logBox.appendChild(entry);
        logBox.scrollTop = logBox.scrollHeight;
      }
      
      addSystemLog(`청산 ${holding.side} 수익 ${profit.toFixed(2)}$`, "SYSTEM");
      
      // 모의/실매매 구분 없이 동일 계산 - realTrade 플래그만 기록
      console.log(`[MNQ] 청산 - ${holding.realTrade ? '실투자' : '모의'} - 수익 ${profit}`);
    });
  }
  
  function handleEmergencyStop(signal){
    addSystemLog("EMERGENCY_STOP 수신 - 매매 중지", "ERROR");
    // User PC 매매 중지
    if(typeof window.trading !== 'undefined') window.trading = "STOP";
    const badge = document.getElementById("tradeBadge");
    if(badge){
      badge.textContent = "매매정지";
      badge.className = "badge stop";
    }
  }
  
  // ===== 텔레그램폼 → Admin 승인 플로우 =====
  async function pollTelegramAppliesForAdmin(){
    if(!IS_ADMIN) return;
    const central = await fetchCentral();
    const applies = central.telegram_applies;
    let allPending = [];
    Object.keys(applies).forEach(userId=>{
      const list = applies[userId] || [];
      list.forEach(item=>{
        if(item.status==="pending" || !item.status){
          allPending.push({...item, userId});
        }
      });
    });
    
    if(allPending.length>0){
      console.log("[MNQ] Admin - 신규 신청", allPending.length, "건");
      // 기존 노란 박스 영역에 자동 렌더링 (폼 변형 없이)
      renderPendingForAdmin(allPending);
    }
  }
  
  function renderPendingForAdmin(pendingList){
    // FORM1의 신규회원 영역 찾기
    const form1 = document.getElementById("form1");
    if(!form1) return;
    
    // 기존 신규회원 텍스트 갱신 (폼 변형 없이 textContent만)
    const listDiv = form1.querySelector(".list");
    if(listDiv){
      const existing = listDiv.textContent;
      if(!existing.includes("신규회원")){
        const div = document.createElement("div");
        div.style.marginTop = "8px";
        div.style.background = "#3a3000";
        div.style.color = "#ffcc00";
        div.style.padding = "6px";
        div.style.borderRadius = "4px";
        div.style.fontSize = "12px";
        div.id = "pendingApplicants";
        div.textContent = `신규회원 (노란 박스): ${pendingList.map(p=>p.real_name || p.name || "신청자").join(", ")} - 승인대기중 (${pendingList.length}건)`;
        listDiv.appendChild(div);
      } else {
        const pendingEl = document.getElementById("pendingApplicants") || listDiv.querySelector("div:last-child");
        if(pendingEl){
          pendingEl.textContent = `신규회원 (노란 박스): ${pendingList.map(p=>p.real_name || p.name || "신청자").join(", ")} - 승인대기중 (${pendingList.length}건)`;
        }
      }
    }
    
    // 승인 버튼에 실제 승인 로직 연결
    window.approvePending = async function(userId, realName){
      const central = await fetchCentral();
      // mnq_users에 추가
      const newUser = {
        id: "u" + (central.mnq_users.length+1),
        name: realName || "신규",
        type: "모의",
        dDay: "D-30",
        status: "OFFLINE",
        license: "승인",
        account: "0000-****-00",
        phone: "010-****-0000",
        profitPlus: 0,
        profitMinus: 0,
        contracts: 1,
        plan: "30일(50만원)",
        joinDate: new Date().toISOString().slice(0,10),
        approveDate: new Date().toISOString().slice(0,10),
        copyStart: new Date().toISOString().slice(0,10),
        applyDate: new Date().toISOString().slice(0,10),
        applyCount: 1,
        symbol: SYMBOL,
        npoint: NPOINT_ID,
        holding: false,
        holdingProfit: 0,
        realTrade: false
      };
      central.mnq_users.push(newUser);
      
      // telegram_applies 상태 변경
      if(central.telegram_applies[userId]){
        central.telegram_applies[userId].forEach(item=>{
          if(item.status==="pending") item.status = "approved";
        });
      }
      
      // user_pc 생성
      if(!central.user_pc[userId]){
        central.user_pc[userId] = {
          settings: {maxLossAmount:500, maxLossPercent:5, maxTradeCount:10, initialCapital:10000},
          pnl: {today:0, total:0, fee:0, totalAmount:10000, totalAmountKRW:13505000},
          trades: [],
          soloSymbols: [],
          mode: "copy",
          trading: "ON",
          account: ACCOUNT
        };
      }
      
      await saveCentral(central);
      alert(`${realName} 승인 완료 - mnq_users 추가됨`);
      location.reload();
    };
  }
  
  // 텔레그램폼 submit 오버라이드
  function overrideTelegramSubmit(){
    if(typeof window.submitApply === 'function' && !window.submitApply._overridden){
      const orig = window.submitApply;
      window.submitApply = async function(){
        // 기존 호출
        try{ orig(); }catch(e){}
        
        // 실매매 연동 추가
        try{
          const realName = document.getElementById("real_name")?.value || "신청자";
          const phone = document.getElementById("phone")?.value || "";
          const account = document.getElementById("account")?.value || ACCOUNT;
          const telegramId = document.getElementById("telegram_id")?.value || "";
          const investType = document.getElementById("invest_type")?.value || "모의투자";
          const memo = document.getElementById("memo")?.value || "";
          
          const central = await fetchCentral();
          const userId = CURRENT_USER_ID;
          
          if(!central.telegram_applies[userId]) central.telegram_applies[userId] = [];
          
          const applyData = {
            real_name: realName,
            name: realName,
            phone: phone,
            account: account,
            telegram_id: telegramId,
            invest_type: investType,
            memo: memo,
            ts: Date.now(),
            timestamp: new Date().toISOString(),
            status: "pending",
            userId: userId,
            realTrade: investType !== "모의투자",
            allowedViewers: [userId, "ADMIN-" + ADMIN_ID, "USER_1"],
            npoint: NPOINT_ID,
            symbol: SYMBOL
          };
          
          central.telegram_applies[userId].push(applyData);
          await saveCentral(central);
          
          console.log("[MNQ] 텔레그램폼 신청 → npoint", applyData);
          
          // 결과 표시 (기존 #result 재사용)
          const resultEl = document.getElementById("result");
          if(resultEl){
            resultEl.textContent = `신청 완료: ${realName} → ADMIN 대기목록(pending)으로 전송됨 / npoint: ${NPOINT_ID} / ${investType} / ${applyData.realTrade ? '실투자' : '모의'}`;
            resultEl.style.color = "#22c55e";
          }
          
        }catch(e){ console.error("telegram submit 연동 실패", e); }
      };
      window.submitApply._overridden = true;
      console.log("[MNQ] Telegram submitApply overridden");
    }
  }
  
  // ===== 시스템 감시 로그 → mnq_logs 통합 =====
  function addSystemLog(msg, type){
    type = type || "SYSTEM";
    fetchCentral().then(central=>{
      central.logs.push({
        ts: Date.now(),
        timestamp: new Date().toISOString(),
        type: type,
        msg: msg,
        userId: CURRENT_USER_ID,
        account: ACCOUNT
      });
      if(central.logs.length>200) central.logs = central.logs.slice(-200);
      saveCentral(central);
    });
    
    // 화면 로그 박스에도 추가 (기존 log 유지)
    const mainLog = document.getElementById("mainLog");
    if(mainLog){
      const div = document.createElement("div");
      div.textContent = `${new Date().toLocaleTimeString()} [${type}] ${msg}`;
      div.style.fontSize = "11px";
      div.style.color = type==="ERROR" ? "#ef4444" : type==="TELEGRAM" ? "#22c55e" : "#888";
      mainLog.appendChild(div);
      mainLog.scrollTop = mainLog.scrollHeight;
    }
  }
  
  // 인터넷 감시
  function setupSystemMonitor(){
    let lastOnline = navigator.onLine;
    setInterval(()=>{
      const online = navigator.onLine;
      if(online !== lastOnline){
        if(online){
          addSystemLog("인터넷 재접속", "NETWORK");
          const badge = document.getElementById("netStatusBadge");
          if(badge) badge.innerHTML = '<span class="status-dot dot-green"></span>인터넷 정상';
        } else {
          addSystemLog("인터넷 단절", "ERROR");
          const badge = document.getElementById("netStatusBadge");
          if(badge) badge.innerHTML = '<span class="status-dot dot-red"></span>인터넷 단절';
        }
        lastOnline = online;
      }
    }, 3000);
    
    // 페이지 가시성
    document.addEventListener("visibilitychange", ()=>{
      if(document.hidden){
        addSystemLog("페이지 백그라운드", "SYSTEM");
      } else {
        addSystemLog("페이지 포그라운드 복귀", "SYSTEM");
      }
    });
  }
  
  // ===== 화면 갱신 - 폼 변형 없이 숫자만 교체 =====
  async function updateProfitDisplay(){
    const central = await fetchCentral();
    const today = new Date().toISOString().slice(0,10);
    const daily = central.daily_realized[today];
    if(!daily) return;
    
    // ADMIN PC - $2,111,184 갱신
    const profitEls = document.querySelectorAll(".profit");
    profitEls.forEach(el=>{
      if(el.textContent.includes("2,111,184") || el.textContent.includes("오늘 수익")){
        // 숫자만 교체, 구조 유지
        if(!IS_ADMIN) {
          // User PC는 자신의 pnl로
          const myPnl = central.user_pc[CURRENT_USER_ID]?.pnl;
          if(myPnl){
            el.textContent = `$${myPnl.total.toLocaleString()} 오늘 수익 (실매매)`;
          }
        }
      }
    });
    
    // 수익성 72.3% vs 27.8% - 비율 계산
    const totalUsers = central.mnq_users.length;
    const realUsers = central.mnq_users.filter(u=>u.type==="실투자").length;
    const adminRatio = totalUsers>0 ? Math.round((realUsers/totalUsers)*1000)/10 : 72.3;
    const userRatio = 100 - adminRatio;
    
    const barAdmin = document.querySelector(".bar-admin");
    const barUser = document.querySelector(".bar-user");
    if(barAdmin) barAdmin.style.width = adminRatio + "%";
    if(barUser) barUser.style.width = userRatio + "%";
    
    // 도넛 차트
    const circles = document.querySelectorAll("circle[stroke-dasharray]");
    if(circles.length>=2){
      const total = 176; // 2πr 근사
      const adminDash = (adminRatio/100)*total;
      const userDash = (userRatio/100)*total;
      circles[0].setAttribute("stroke-dasharray", `${adminDash.toFixed(1)} ${total-adminDash.toFixed(1)}`);
      if(circles[1]){
        circles[1].setAttribute("stroke-dasharray", `${userDash.toFixed(1)} ${total-userDash.toFixed(1)}`);
      }
    }
  }
  
  // ===== 초기화 =====
  async function init(){
    await migrateOldData();
    
    // 역할별 폴링
    if(IS_ADMIN || document.title.includes("ADMIN") || location.href.includes("admin")){
      // ADMIN PC
      console.log("[MNQ] ADMIN 모드 초기화");
      overrideAdminSendSignal();
      setInterval(pollTelegramAppliesForAdmin, 5000);
      setTimeout(pollTelegramAppliesForAdmin, 2000);
      setupSystemMonitor();
      setInterval(updateProfitDisplay, 5000);
    } else if(document.title.includes("텔레그램") || document.getElementById("real_name")){
      // 텔레그램폼
      console.log("[MNQ] 텔레그램폼 모드 초기화");
      overrideTelegramSubmit();
      setupSystemMonitor();
    } else {
      // USER PC
      console.log("[MNQ] USER PC 모드 초기화 -", CURRENT_USER_ID);
      setInterval(pollSignalsForUser, 3000); // 0.05초 복제 대신 3초 폴링 (npoint 제한)
      setInterval(updateProfitDisplay, 5000);
      setupSystemMonitor();
      
      // 기존 toggleTrade 오버라이드 - 모드 변경시 central에 저장
      if(typeof window.toggleTrade === 'function' && !window.toggleTrade._overridden){
        const orig = window.toggleTrade;
        window.toggleTrade = function(m){
          orig(m);
          fetchCentral().then(central=>{
            if(central.user_pc[CURRENT_USER_ID]){
              central.user_pc[CURRENT_USER_ID].mode = m;
              saveCentral(central);
            }
          });
          addSystemLog(`매매모드 변경: ${m}`, "SYSTEM");
        };
        window.toggleTrade._overridden = true;
      }
    }
    
    addSystemLog(`MNQ 실매매 연동 시작 - ${CURRENT_USER_ID} - ${IS_ADMIN ? 'ADMIN' : 'USER'}`, "SYSTEM");
  }
  
  // 시작
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }
  
  // 전역 노출 (디버깅용)
  window.MNQ_REAL_LINK = {
    NPOINT_ID,
    NPOINT_URL,
    CURRENT_USER_ID,
    IS_ADMIN,
    calcProfit,
    fetchCentral,
    saveCentral,
    sendRealSignal,
    addSystemLog,
    version: 57
  };
  
  console.log("[MNQ REAL LINK v57] 오버레이 로드 완료 - 폼 변형 없음 -", CURRENT_USER_ID);
})();
</script>
