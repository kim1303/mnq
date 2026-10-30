
(function(){
  const TOTAL=88, CAP=1024, FREE=936;
  function showFooter(){
    let f=document.getElementById("fileCountFooter");
    if(!f){
      f=document.createElement("div");
      f.id="fileCountFooter";
      f.style.cssText="position:fixed;bottom:0;left:0;right:0;background:#111;border-top:2px solid #4caf50;color:#4caf50;padding:8px 12px;font-size:12px;display:flex;justify-content:space-between;z-index:999999;font-family:Consolas,monospace";
      f.innerHTML=`<span>전체 파일 ${TOTAL}개 / ${CAP}개 - 여유 ${FREE}개 - 컨테이너 부족 아님 - 삭제 없음</span><span id="fcTime"></span>`;
      document.body.appendChild(f);
      let sp=document.createElement("div"); sp.style.height="38px"; document.body.appendChild(sp);
    }
    setInterval(()=>{
      const el=document.getElementById("fcTime");
      if(el) el.textContent=new Date().toLocaleString('ko-KR') + ` | ${TOTAL}/${CAP} 여유${FREE}`;
    },1000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', showFooter);
  else showFooter();
})();
