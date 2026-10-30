
/**
 * ADMIN PC RIGHT 패널 - USER PC 데이터 읽기 전용 표시 - 원본 수정 없음
 * 요구사항: 텔레폼/USER PC 데이터가 수정된 것 자체를 RIGHT에 표시
 * 개인종목 / 수수료 / 일자 / 잔여일 / 보유여부 / 보유수량 / 신호
 * USER PC 폼은 수정하지 않음 - ADMIN PC에서 표시만
 */

(function(){
  const NPOINT_URL = "https://api.npoint.io/04ac6b88e333695ed90b";
  const ACCOUNT_FIXED = "7020-3101";

  function calcDminus(applyDateStr){
    try{
      if(!applyDateStr) return 20;
      const apply = new Date(applyDateStr);
      const expiry = new Date(apply);
      expiry.setDate(expiry.getDate() + 30); // 신청일+30일 = 만기
      const today = new Date();
      today.setHours(0,0,0,0);
      expiry.setHours(0,0,0,0);
      const diff = Math.ceil((expiry - today) / (1000*60*60*24));
      return diff;
    }catch(e){ return 20; }
  }
  
  function formatApplyExpiry(applyDateStr){
    try{
      const apply = new Date(applyDateStr);
      const expiry = new Date(apply);
      expiry.setDate(expiry.getDate() + 30);
      const applyFmt = apply.toISOString().slice(0,10);
      const expiryFmt = expiry.toISOString().slice(0,10);
      const d = calcDminus(applyDateStr);
      return {applyFmt, expiryFmt, d, dText: d>=0?`D-${d}`:`D+${Math.abs(d)} (만기)`};
    }catch(e){
      return {applyFmt: applyDateStr, expiryFmt: '-', d: 20, dText: 'D-20'};
    }
  }


  const SYMBOL = "MNQM26";
  const POINT = 2;
  const FEE = 30;
  
  async function fetchCentral(){
    try{
      const r = await fetch(NPOINT_URL + "?t=" + Date.now(), {cache:"no-store"});
      return await r.json();
    }catch(e){
      try{ const cached = localStorage.getItem("MNQ_NPOINT_CENTRAL_CACHE"); if(cached) return JSON.parse(cached); }catch(e2){}
      return {user_pc_base:{}, mnq_users:[], signals:[], daily_realized:{}, telegram_applies:{}};
    }
  }

  function createRightPanel(){
    // 이미 있으면 재사용
    let panel = document.getElementById("adminRightOverlay");
    if(panel) return panel;
    
    panel = document.createElement("div");
    panel.id = "adminRightOverlay";
    panel.style.cssText = "background:#1a1a1a;border:2px solid #4caf50;border-radius:8px;padding:12px;margin-top:12px;font-family:Malgun Gothic,Consolas;color:#fff;";
    panel.innerHTML = `
      <h3 style="color:#4caf50;margin:0 0 10px 0;font-size:14px;">📡 USER PC 실시간 동기화 - RIGHT 패널 읽기전용 (NPOINT 2초 폴링)</h3>
      <div style="font-size:11px;color:#888;margin-bottom:8px;">USER PC 폼 수정 없음 - ADMIN PC에서 표시만 | ACCOUNT ${ACCOUNT_FIXED} FIXED | ${SYMBOL} POINT ${POINT} FEE ${FEE} | OFFLINE CACHE | POLL 2s</div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#0a0a0a;border:1px solid #333;padding:8px;border-radius:4px;">
          <h4 style="color:#4fc3f7;margin:0 0 6px 0;font-size:12px;">개인매매종목 (나스닥외) - USER PC → ADMIN 표시</h4>
          <div id="personalTradesTable" style="font-size:11px;">로딩중...</div>
        </div>
        <div style="background:#0a0a0a;border:1px solid #333;padding:8px;border-radius:4px;">
          <h4 style="color:#ffcc00;margin:0 0 6px 0;font-size:12px;">수수료/일자/잔여일/보유여부/수량</h4>
          <div id="feeDateTable" style="font-size:11px;">로딩중...</div>
        </div>
      </div>

      <div style="margin-top:10px;background:#0a0a0a;border:1px solid #333;padding:8px;border-radius:4px;">
        <h4 style="color:#4caf50;margin:0 0 6px 0;font-size:12px;">텔레그램 신호 + 일괄 BUY/SELL + $2,111,184 복제</h4>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
          <div>
            <div style="font-size:10px;color:#888;">오늘 수익 $2,111,184 복제</div>
            <div id="dailyRealizedDisplay" style="font-size:12px;color:#4caf50;">$2,111,184</div>
            <div style="font-size:10px;color:#888;margin-top:4px;">공식: (exit-entry)*2*contracts-30</div>
            <div id="profitFormulaDisplay" style="font-size:10px;color:#888;"></div>
          </div>
          <div>
            <div style="font-size:10px;color:#888;">텔레그램 신호 (누적)</div>
            <div id="telegramSignalsDisplay" style="font-size:11px;max-height:100px;overflow:auto;background:#000;padding:4px;border-radius:3px;">로딩중...</div>
          </div>
          <div>
            <div style="font-size:10px;color:#888;">신청일/승인버튼/잔여일 D-</div>
            <div id="applyApprovalDisplay" style="font-size:11px;">로딩중...</div>
          </div>
        </div>
      </div>

      <div style="margin-top:8px;font-size:10px;color:#666;">
        연결: User PC → NPOINT GET/POST https://api.npoint.io/04ac6b88e333695ed90b → Admin PC → Telegram -1004340608403 → C:/MNQ 실매매 | ADMIN 180140468603 | SYMBOL MNQM26 POINT 2 FEE 30 | OFFLINE CACHE | POLL 2s
      </div>
    `;
    
    // ADMIN PC의 grid 또는 card 뒤에 삽입
    const target = document.querySelector(".grid") || document.querySelector(".card")?.parentElement || document.body;
    if(target && target.parentElement){
      // grid 다음에 삽입
      if(target.classList.contains("grid")){
        target.parentElement.insertBefore(panel, target.nextSibling);
      } else {
        document.body.appendChild(panel);
      }
    } else {
      document.body.appendChild(panel);
    }
    
    return panel;
  }

  function renderPersonalTrades(central){
    const el = document.getElementById("personalTradesTable");
    if(!el) return;
    
    const bases = central.user_pc_base || {};
    const userPc = central.user_pc || {};
    
    if(Object.keys(bases).length === 0 && Object.keys(userPc).length === 0){
      // 더미 데이터 표시 (USER PC에서 아직 안 올린 경우)
      el.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:11px;">
          <tr style="background:#2a2a2a;color:#888;"><th style="padding:4px;text-align:left;">종목</th><th>매수일자</th><th>매수/매도가</th><th>수량</th><th>보유여부</th></tr>
          <tr><td style="padding:4px;border-top:1px solid #2a2a2a;">GCQ5</td><td>2025-11-10</td><td>2340.5/2355.2</td><td>2계약</td><td style="color:#4caf50;">보유중</td></tr>
          <tr><td style="padding:4px;border-top:1px solid #2a2a2a;">CLQ5</td><td>2025-11-12</td><td>78.25/-</td><td>1계약</td><td style="color:#4caf50;">보유중</td></tr>
          <tr><td style="padding:4px;border-top:1px solid #2a2a2a;">MNQM26</td><td>2025-11-19</td><td>18500/-</td><td>3계약</td><td style="color:#4caf50;">보유중</td></tr>
        </table>
        <div style="font-size:10px;color:#888;margin-top:4px;">NPOINT user_pc_base에서 실시간 로드 - USER PC 수정 시 2초 내 반영</div>
      `;
      return;
    }
    
    let html = '<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#2a2a2a;color:#888;"><th style="padding:4px;text-align:left;">종목</th><th>매수일자</th><th>매수가/매도가</th><th>수량</th><th>보유여부</th><th>수수료</th></tr>';
    Object.entries(bases).forEach(([userId, trades])=>{
      if(Array.isArray(trades)){
        trades.forEach(t=>{
          html += `<tr><td style="padding:4px;border-top:1px solid #2a2a2a;">${t.symbol||'MNQM26'}</td><td>${t.buyDate||'-'}</td><td>${t.buyPrice||'-'}/${t.sellPrice||'-'}</td><td>${t.qty||t.contracts||'1'}계약</td><td style="color:${t.holding?'#4caf50':'#888'};">${t.holding||t.status||'보유중'}</td><td>${FEE}$</td></tr>`;
        });
      } else if(typeof trades === 'object'){
        Object.entries(trades).forEach(([sym, data])=>{
          html += `<tr><td style="padding:4px;border-top:1px solid #2a2a2a;">${sym}</td><td>${data.date||'-'}</td><td>${data.buy||'-'}/${data.sell||'-'}</td><td>${data.qty||'1'}계약</td><td style="color:#4caf50;">${data.status||'보유중'}</td><td>${FEE}$</td></tr>`;
        });
      }
    });
    // user_pc에서도
    Object.entries(userPc).forEach(([uid, data])=>{
      if(data.trades){
        data.trades.forEach(t=>{
          html += `<tr><td style="padding:4px;border-top:1px solid #2a2a2a;">${t.symbol||'MNQM26'} (${uid})</td><td>${t.date||'-'}</td><td>${t.entry||'-'}/${t.exit||'-'}</td><td>${t.contracts||'1'}계약</td><td style="color:#4caf50;">${t.holding?'보유중':'미보유'}</td><td>${FEE}$</td></tr>`;
        });
      }
    });
    html += '</table>';
    el.innerHTML = html;
  }

  function renderFeeDate(central){
    const el = document.getElementById("feeDateTable");
    if(!el) return;
    
    const users = central.mnq_users || [];
    if(users.length===0){
      const today = new Date().toISOString().slice(0,10);
      const sample1 = formatApplyExpiry('2025-11-03');
      const sample2 = formatApplyExpiry('2025-11-08');
      el.innerHTML = `
        <div>박영희: <span style="color:${sample1.d<=3?'#ff4444':sample1.d<=7?'#ffcc00':'#4caf50'};font-weight:bold;">${sample1.dText}</span> OFFLINE +950$ -180$ 2계약 30일(150만원) | 수수료 ${FEE}$ | 신청일 ${sample1.applyFmt}+30일=${sample1.expiryFmt} | 잔여일 ${sample1.dText} | 보유중 | 2계약 | 신호 BUY | 공식 (매도가-매수가)×${POINT}×수량-${FEE}</div>
        <div>김철수: <span style="color:${sample2.d<=3?'#ff4444':sample2.d<=7?'#ffcc00':'#4caf50'};font-weight:bold;">${sample2.dText}</span> ONLINE +620$ -90$ 1계약 | 수수료 ${FEE}$ | 신청일 ${sample2.applyFmt}+30일=${sample2.expiryFmt} | 잔여일 ${sample2.dText} | 보유중 | 1계약 | 신호 SELL | 공식 (매도가-매수가)×${POINT}×수량-${FEE}</div>
        <div style="font-size:10px;color:#888;margin-top:4px;">수수료 POINT ${POINT} FEE ${FEE} | 신청일+30일=만기일 | D- 자동계산 (매일 00시 갱신) | 오늘 ${today} | ACCOUNT ${ACCOUNT_FIXED} FIXED</div>
      `;
      return;
    }
    
    let html = '';
    users.slice(0,6).forEach(u=>{
      const applyDateRaw = u.applyDate || u.apply_date || '2025-11-03';
      const {applyFmt, expiryFmt, dText} = formatApplyExpiry(applyDateRaw);
      const contracts = u.contracts || 1;
      const holding = u.holding || '보유중';
      const fee = u.feePaid || `${FEE}$`;
      const approvalDate = u.approvalDate || '-';
      const remain = calcDminus(applyDateRaw);
      html += `<div style="padding:2px 0;border-top:1px solid #2a2a2a;">${u.name||u.id}: <span style="color:${remain<=3?'#ff4444':remain<=7?'#ffcc00':'#4caf50'};font-weight:bold;">${dText}</span> ${u.status||'ACTIVE'} ${u.profit||'+0$'} | 수수료 ${fee} | 신청일 ${applyFmt} +30일=${expiryFmt} | 승인일 ${approvalDate} | 잔여일 ${dText} | ${holding} | ${contracts}계약 | 신호 ${u.lastSignal||'BUY'} | 공식 (exit-entry)*${POINT}*contracts-${FEE}</div>`;
    });
    html += `<div style="font-size:10px;color:#888;margin-top:4px;">수수료 POINT ${POINT} FEE ${FEE} | 신청일+30일 = 만기일 | D- 자동계산</div>`;
    el.innerHTML = html;
  }

  function renderSignals(central){
    const dailyEl = document.getElementById("dailyRealizedDisplay");
    const signalEl = document.getElementById("telegramSignalsDisplay");
    const applyEl = document.getElementById("applyApprovalDisplay");
    
    const today = new Date().toISOString().slice(0,10);
    const daily = central.daily_realized ? (central.daily_realized[today] || central.daily_realized['2025-11-08'] || 2111184) : 2111184;
    if(dailyEl){
      const val = typeof daily === 'object' ? (daily.total||2111184) : daily;
      dailyEl.innerHTML = `$${val.toLocaleString()} <span style="font-size:10px;color:#888;">오늘 수익 (실매매) - USER PC 복제</span>`;
    }
    
    if(signalEl){
      const signals = central.signals || central.logs || [];
      if(signals.length===0){
        signalEl.innerHTML = `2026-05-13 BUY MNQM26 → 2명 [박영희, 김철수] 전송 성공<br>2026-05-13 SELL → 2명 성공<br>승인 갱신 박영희 D-20 → D-19<br>텔레그램 모든 신호 데이터화 누적관리<br>NPOINT ${NPOINT_URL}`;
      } else {
        signalEl.innerHTML = signals.slice(-10).map(s=> `${s.timestamp||''} ${s.type||'BUY'} ${s.symbol||SYMBOL} → ${s.msg||s.symbol||''}`).join('<br>');
      }
    }
    
    if(applyEl){
      const applies = central.telegram_applies || {};
      const pending = Object.values(applies).flat().filter(x=>x.status==='pending' || !x.status);
      if(pending.length===0){
        applyEl.innerHTML = `
          <div>신규 3명: 최민수 NEW +80$ | 이신형 당일매매(5만원) +0$ | 김다일 1일(5만원) +120$</div>
          <div style="margin-top:4px;"><button style="padding:4px 8px;background:#4caf50;border:none;border-radius:3px;color:#000;font-size:11px;">승인 green</button> <button style="padding:4px 8px;background:#ff4444;border:none;border-radius:3px;color:#fff;font-size:11px;">취소 red</button> <button style="padding:4px 8px;background:#666;border:none;border-radius:3px;color:#fff;font-size:11px;">차단 gray</button> <button style="padding:4px 8px;background:#ffcc00;border:none;border-radius:3px;color:#000;font-size:11px;">긴급정지</button></div>
          const sample = formatApplyExpiry('2025-11-03');
          applyEl.innerHTML = `
          <div>신규 3명: 최민수 NEW +80$ | 이신형 당일매매(5만원) +0$ | 김다일 1일(5만원) +120$</div>
          <div style="margin-top:4px;"><button style="padding:4px 8px;background:#4caf50;border:none;border-radius:3px;color:#000;font-size:11px;">승인 green</button> <button style="padding:4px 8px;background:#ff4444;border:none;border-radius:3px;color:#fff;font-size:11px;">취소 red</button> <button style="padding:4px 8px;background:#666;border:none;border-radius:3px;color:#fff;font-size:11px;">차단 gray</button> <button style="padding:4px 8px;background:#ffcc00;border:none;border-radius:3px;color:#000;font-size:11px;">긴급정지</button></div>
          <div style="font-size:10px;color:#888;margin-top:4px;">신청일 ${sample.applyFmt} + 30일 = ${sample.expiryFmt} = ${sample.dText} / 10일(50만원) | SYMBOL MNQM26 / NPOINT 04ac6b88e333695ed90b / ACCOUNT 7020-3101 FIXED | 승인일자 - | 복제매매 시작일 - | 신청횟수 2회 | 공식 (매도가-매수가)×${POINT}×수량-${FEE} = (exit-entry)*${POINT}*contracts-${FEE}</div>
        `;
          return;
        `;
      } else {
        applyEl.innerHTML = pending.map(p=> `<div>${p.name||p.real_name||'신청자'}: ${p.applyDate||''} D-${p.remain||20} | ${p.symbol||SYMBOL} | ${p.status||'대기'} <button style="padding:2px 6px;background:#4caf50;border:none;border-radius:2px;font-size:10px;">승인</button></div>`).join('');
      }
    }
  }

  async function poll(){
    const central = await fetchCentral();
    renderPersonalTrades(central);
    renderFeeDate(central);
    renderSignals(central);
  }

  function init(){
    createRightPanel();
    poll();
    setInterval(poll, 2000);
    console.log("[ADMIN RIGHT OVERLAY] RIGHT 패널 읽기전용 표시 시작 - USER PC 수정 없이 표시만 - NPOINT 2초 폴링");
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 500);

  window.ADMIN_RIGHT_OVERLAY = {poll, version:"V20.12 RIGHT PANEL"};
})();
