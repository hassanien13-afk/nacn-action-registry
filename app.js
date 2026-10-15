/* DrasChem NaCN Production Facility Action Registry — standalone portal (GitHub Pages + Google Sheets API) */
(function(){
  const API_URL = window.REGISTRY_API_URL || "";
  const REGS = [
    { key:"tri", label:"DrasChem – EPC-E – COSMOS-E", short:"Tri-party", prefix:"T", parties:["DrasChem","EPC-E","COSMOS-E"] },
    { key:"duo", label:"DrasChem – COSMOS-E", short:"Client-Designer", prefix:"C", parties:["DrasChem","COSMOS-E"] }
  ];
  const STATUSES = ["Not Started","In Progress","On Hold","Complete"];
  const ST_CLASS = {"Not Started":"st-notstarted","In Progress":"st-progress","On Hold":"st-hold","Complete":"st-complete"};
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const POLL_MS = 30000;

  const ls = {
    get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } },
    set(k,v){ try { v==null ? localStorage.removeItem(k) : localStorage.setItem(k,v); } catch(e){} }
  };

  const state = {
    tab: "tri", rows: { tri: [], duo: [] }, loaded: false, error: null,
    q: "", status: "open", party: "all", sort: { key:"no", dir:"asc" },
    editing: null, passcode: ls.get("nacn.pass"), name: ls.get("nacn.name") || "", busy: false, lastSync: null
  };
  const t = ls.get("nacn.tab"); if (t && REGS.some(r=>r.key===t)) state.tab = t;
  if (location.hash === "#duo" || location.hash === "#tri") state.tab = location.hash.slice(1);

  const $ = id => document.getElementById(id);
  const reg = () => REGS.find(r => r.key === state.tab);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const canEdit = () => !!state.passcode;

  function todayISO(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
  function fmtDate(iso){ if(!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso||""; const [y,m,d]=iso.split("-"); return d+" "+MON[+m-1]+" "+y; }
  function daysBetween(a,b){ return Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000); }
  function isOverdue(r){ return r.status!=="Complete" && r.due && r.due < todayISO(); }
  function partyChip(p){ return p ? `<span class="party pc-${esc(p)}">${esc(p)}</span>` : `<span style="color:var(--ink-3)">—</span>`; }
  function statusPill(r){
    if (isOverdue(r)) return `<span class="status st-overdue" title="${esc(r.status)} · past due">Overdue</span>`;
    return `<span class="status ${ST_CLASS[r.status]||"st-notstarted"}">${esc(r.status||"Not Started")}</span>`;
  }
  function dueCell(r){
    if (!r.due) return `<span class="date" style="color:var(--ink-3)">Not set</span>`;
    let note="";
    if (r.status==="Complete") note=`<span class="due-note muted">closed</span>`;
    else { const n=daysBetween(todayISO(),r.due);
      if (n<0) note=`<span class="due-note bad">${-n} d late</span>`;
      else if (n===0) note=`<span class="due-note warn">due today</span>`;
      else if (n<=7) note=`<span class="due-note warn">in ${n} d</span>`;
      else note=`<span class="due-note muted">in ${n} d</span>`; }
    return `<span class="date">${fmtDate(r.due)}</span>${note}`;
  }
  const codeFor = (R,r) => R.prefix+"-"+String(r.no||0).padStart(3,"0");
  const code = r => codeFor(reg(), r);

  /* ---------- API ---------- */
  async function apiGet(){
    const res = await fetch(API_URL, { cache:"no-store" });
    const j = await res.json();
    if (!j.ok) throw new Error(j.error||"load_failed");
    return j.data;
  }
  async function apiPost(payload){
    const res = await fetch(API_URL, { method:"POST", body: JSON.stringify(payload) }); // text/plain: no CORS preflight
    return res.json();
  }
  function applyData(d){
    state.rows.tri = d.tri||[]; state.rows.duo = d.duo||[];
    state.loaded = true; state.error = null; state.lastSync = new Date();
  }
  async function refresh(){
    if (!API_URL || state.busy) return;
    try { applyData(await apiGet()); }
    catch(e){ state.error = "Couldn't reach the registry. Retrying shortly."; }
    if ($("drawer").hidden) render(); else { renderTabs(); renderKpis(); renderRows(); }
    renderLive();
  }

  /* ---------- filtering ---------- */
  function filtered(){
    const q = state.q.trim().toLowerCase();
    let rows = state.rows[state.tab].filter(r=>{
      if (state.status==="open" && r.status==="Complete") return false;
      if (state.status==="overdue" && !isOverdue(r)) return false;
      if (state.status==="week"){ if(r.status==="Complete"||!r.due) return false; const n=daysBetween(todayISO(),r.due); if(n<0||n>7) return false; }
      if (state.status==="complete" && r.status!=="Complete") return false;
      if (state.party!=="all"){ const p=state.party; if (r.from!==p && r.to!==p && !(r.responsible||"").toLowerCase().includes(p.toLowerCase().replace("-e",""))) return false; }
      if (q){ const hay=[code(r),r.action,r.remarks,r.responsible,r.from,r.to,r.status].join(" ").toLowerCase(); if(!hay.includes(q)) return false; }
      return true;
    });
    const {key,dir}=state.sort, m=dir==="asc"?1:-1;
    const sv = r => key==="status" ? (isOverdue(r)? -1 : STATUSES.indexOf(r.status)) : key==="no" ? (r.no||0) : (r[key]||"9999");
    rows.sort((a,b)=>{ const A=sv(a),B=sv(b); return (A<B?-1:A>B?1:0)*m || ((a.no||0)-(b.no||0)); });
    return rows;
  }

  /* ---------- render ---------- */
  function renderTabs(){
    $("tabs").innerHTML = REGS.map(r=>{
      const open = state.rows[r.key].filter(x=>x.status!=="Complete").length;
      const sw = r.parties.map(p=>`<i style="background:var(--p-${p==="DrasChem"?"dras":p==="EPC-E"?"epc":"cos"})"></i>`).join("");
      return `<button class="tab" role="tab" type="button" data-tab="${r.key}" aria-selected="${r.key===state.tab}"><span class="parties">${sw}</span><span>${esc(r.label)}<span class="tab-sfx"> Action Registry</span></span><span class="count" title="Open actions">${state.loaded?open+" open":"…"}</span></button>`;
    }).join("");
  }
  function renderKpis(){
    const rows = state.rows[state.tab];
    const total=rows.length, done=rows.filter(r=>r.status==="Complete").length, open=total-done;
    const od=rows.filter(isOverdue).length;
    const wk=rows.filter(r=>{ if(r.status==="Complete"||!r.due) return false; const n=daysBetween(todayISO(),r.due); return n>=0&&n<=7; }).length;
    const cnt=s=>rows.filter(r=>r.status===s && !isOverdue(r)).length;
    const segs=[["Complete",done,"var(--ok)"],["In Progress",cnt("In Progress"),"var(--warn)"],["On Hold",cnt("On Hold"),"var(--accent)"],["Not Started",cnt("Not Started"),"var(--idle)"],["Overdue",od,"var(--bad)"]];
    const k=(id,label,v,cls)=>`<button type="button" class="kpi ${cls||""}" data-st="${id}" aria-pressed="${state.status===id}"><div class="k">${label}</div><div class="v">${state.loaded?v:"–"}</div></button>`;
    $("kpis").innerHTML = k("all","Total",total)+k("open","Open",open)+k("overdue","Overdue",od,od?"bad":"")+k("week","Due ≤ 7 days",wk,wk?"warn":"")+k("complete","Complete",done,"ok")+
      `<div class="mix"><div class="bar" role="img" aria-label="Status mix">${total?segs.filter(s=>s[1]).map(s=>`<span style="width:${s[1]/total*100}%;background:${s[2]}" title="${s[0]}: ${s[1]}"></span>`).join(""):""}</div>
       <div class="legend">${segs.map(s=>`<span><i class="dot" style="background:${s[2]};margin-right:5px;vertical-align:0"></i>${s[0]} <b>${s[1]}</b></span>`).join("")}</div></div>`;
  }
  function renderToolbar(){
    const opts=[["open","Open"],["all","All"],["overdue","Overdue"],["complete","Complete"]];
    $("statusSeg").innerHTML = opts.map(([v,l])=>`<button type="button" data-st="${v}" aria-pressed="${state.status===v}">${l}</button>`).join("");
    const ps = reg().parties; if (state.party!=="all" && !ps.includes(state.party)) state.party="all";
    $("partyFilter").innerHTML = `<option value="all">All parties</option>`+ps.map(p=>`<option value="${p}" ${state.party===p?"selected":""}>Involves ${p}</option>`).join("");
    $("addBtn").hidden = !canEdit() || !API_URL;
    $("lockBtn").hidden = !API_URL;
    $("lockBtn").innerHTML = canEdit()
      ? `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015-.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Editing as ${esc(state.name||"team member")}`
      : `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7V5a2.5 2.5 0 015 0v2" stroke="currentColor" stroke-width="1.5"/></svg>Unlock editing`;
  }
  const COLS=[["no","No.",1],["action","Request / Action",0],["issued","Issued",1],["route","From → To",0],["responsible","Responsible",1],["due","Due",1],["status","Status",1],["remarks","Remarks",0]];
  function renderHead(){
    $("thead").innerHTML = COLS.map(([k,l,s])=>{
      const on=state.sort.key===k;
      return s?`<th class="sortable" data-sort="${k}" ${on?`aria-sort="${state.sort.dir==="asc"?"ascending":"descending"}"`:""}>${l}<span class="arr">${on?(state.sort.dir==="asc"?"↑":"↓"):"↕"}</span></th>`:`<th>${l}</th>`;
    }).join("");
  }
  function showEmpty(html){ $("empty").hidden=false; $("empty").innerHTML=html; $("tbody").innerHTML=""; $("cards").innerHTML=""; }
  function renderRows(){
    const rows=filtered(), all=state.rows[state.tab];
    if (!API_URL) return showEmpty(`<h3>Registry not connected yet</h3><p>The Google Sheet backend hasn't been linked to this page.</p>`);
    if (!state.loaded) return showEmpty(state.error?`<h3>Can't reach the registry</h3><p>${esc(state.error)}</p>`:`<h3>Loading the register…</h3><p>Fetching the latest actions.</p>`);
    if (!all.length) return showEmpty(`<h3>No actions logged yet</h3><p>Unlock editing, then use <b>New action</b> to record the first request.</p>`);
    if (!rows.length) return showEmpty(`<h3>No actions match</h3><p>Try clearing the search or switching the filter to <b>All</b>.</p>`);
    $("empty").hidden=true;
    $("tbody").innerHTML = rows.map(r=>{
      const cls=[isOverdue(r)?"is-overdue":"", r.status==="Complete"?"is-done":""].join(" ");
      return `<tr class="${cls}" data-id="${esc(r.id)}" tabindex="0">
        <td class="no">${code(r)}</td>
        <td class="act">${esc(r.action)}</td>
        <td class="date">${fmtDate(r.issued)||"—"}</td>
        <td><div class="route">${partyChip(r.from)}<span class="arrow">→</span>${partyChip(r.to)}</div></td>
        <td class="resp">${esc(r.responsible||"—")}</td>
        <td>${dueCell(r)}</td>
        <td>${statusPill(r)}</td>
        <td><div class="remarks clamp">${esc(r.remarks||"")}</div></td></tr>`;
    }).join("");
    $("cards").innerHTML = rows.map(r=>`<div class="card ${isOverdue(r)?"is-overdue":""}" data-id="${esc(r.id)}" tabindex="0">
        <div class="card-top"><span class="no">${code(r)}</span>${statusPill(r)}</div>
        <div class="act" style="min-width:0;max-width:none">${esc(r.action)}</div>
        <div class="route">${partyChip(r.from)}<span class="arrow">→</span>${partyChip(r.to)}</div>
        <div class="card-row"><span>Resp: <b style="color:var(--ink)">${esc(r.responsible||"—")}</b></span><span>Issued ${fmtDate(r.issued)||"—"}</span><span>Due ${r.due?fmtDate(r.due):"not set"}</span></div>
        ${r.remarks?`<div class="remarks clamp" style="max-width:none">${esc(r.remarks)}</div>`:""}
      </div>`).join("");
  }
  function renderLive(){
    const el=$("liveState");
    if (!API_URL){ el.textContent="Not connected to the Google Sheet yet."; return; }
    if (state.error && state.loaded){ el.innerHTML=`<i class="dot" style="background:var(--warn);margin-right:6px"></i>${esc(state.error)}`; return; }
    if (state.lastSync) el.innerHTML=`<i class="dot" style="background:var(--ok);margin-right:6px"></i>Synced ${state.lastSync.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · refreshes every 30 s`;
  }
  function render(){ renderTabs(); renderKpis(); renderToolbar(); renderHead(); renderRows(); renderLive(); }

  /* ---------- unlock dialog ---------- */
  function openUnlock(){
    if (canEdit()){ // show sign-out choice
      $("uTitle").textContent="Editing unlocked";
      $("uForm").hidden=true; $("uSigned").hidden=false;
      $("uSignedText").textContent=`You're editing as ${state.name||"team member"} on this device.`;
    } else {
      $("uTitle").textContent="Unlock editing";
      $("uForm").hidden=false; $("uSigned").hidden=true;
      $("u_name").value=state.name; $("u_pass").value=""; $("uErr").hidden=true;
    }
    $("uScrim").hidden=false; $("unlock").hidden=false;
    setTimeout(()=>{ (canEdit()?$("uClose2"):(state.name?$("u_pass"):$("u_name"))).focus(); },30);
  }
  function closeUnlock(){ $("uScrim").hidden=true; $("unlock").hidden=true; }
  async function doUnlock(e){
    e.preventDefault();
    const name=$("u_name").value.trim(), pass=$("u_pass").value.trim();
    if (!name){ $("uErr").textContent="Enter your name so changes show who made them."; $("uErr").hidden=false; return; }
    $("uGo").disabled=true;
    try{
      const j=await apiPost({op:"verify",passcode:pass});
      if (!j.ok){ $("uErr").textContent="That passcode isn't right. Check with the document controller."; $("uErr").hidden=false; return; }
      state.passcode=pass; state.name=name; ls.set("nacn.pass",pass); ls.set("nacn.name",name);
      closeUnlock(); render(); toast("Editing unlocked");
    }catch(err){ $("uErr").textContent="Couldn't reach the registry. Check your connection and try again."; $("uErr").hidden=false; }
    finally{ $("uGo").disabled=false; }
  }
  function lockAgain(){ state.passcode=null; ls.set("nacn.pass",null); closeUnlock(); render(); toast("Editing locked on this device"); }

  /* ---------- drawer ---------- */
  function fillSelect(el, items, val){ el.innerHTML=items.map(i=>`<option ${i===val?"selected":""}>${esc(i)}</option>`).join(""); }
  function openDrawer(row){
    const R=reg();
    state.editing = row ? row.id : null;
    $("dEyebrow").textContent = R.label+" Action Registry";
    $("dTitle").textContent = row ? code(row) : "New action";
    $("f_action").value = row?.action||"";
    fillSelect($("f_from"),R.parties,row?.from||"COSMOS-E");
    fillSelect($("f_to"),R.parties,row?.to||"DrasChem");
    $("f_resp").value=row?.responsible||"";
    const resp=[...new Set(state.rows[state.tab].map(r=>r.responsible).filter(Boolean).concat(R.parties))];
    $("respList").innerHTML=resp.map(x=>`<option value="${esc(x)}">`).join("");
    $("f_issued").value=row?.issued||todayISO();
    $("f_due").value=row?.due||"";
    fillSelect($("f_status"),STATUSES,row?.status||"Not Started");
    $("f_remarks").value=row?.remarks||"";
    const ro=!canEdit();
    $("delBtn").hidden=!row || ro; $("delConfirm").hidden=true; $("formErr").hidden=true;
    ["f_action","f_from","f_to","f_resp","f_issued","f_due","f_status","f_remarks"].forEach(i=>$(i).disabled=ro);
    $("saveBtn").hidden=ro;
    $("roNote").hidden=!ro;
    const a=$("audit");
    if (row && row.updatedAt){
      a.hidden=false;
      const when=new Date(row.updatedAt); const w=isNaN(when)?row.updatedAt:when.toLocaleString([], {dateStyle:"medium",timeStyle:"short"});
      a.textContent=`Last updated ${row.updatedBy?"by "+row.updatedBy+" · ":""}${w}`;
    } else a.hidden=true;
    $("scrim").hidden=false; $("drawer").hidden=false;
    setTimeout(()=>(ro?$("closeBtn"):$("f_action")).focus(),30);
  }
  function closeDrawer(){ $("scrim").hidden=true; $("drawer").hidden=true; state.editing=null; render(); }
  function toast(msg){ const t=$("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,2600); }
  function handleWriteError(j){
    if (j && j.error==="bad_passcode"){ state.passcode=null; ls.set("nacn.pass",null); render();
      return "The team passcode has changed. Unlock editing again with the new passcode."; }
    if (j && j.error==="action_required") return "Describe the request or action before saving.";
    if (j && j.error==="bad_date") return "Dates must be complete (day, month and year).";
    return "Couldn't save right now. Check your connection and try again.";
  }

  async function save(e){
    e.preventDefault();
    const action=$("f_action").value.trim();
    if (!action){ $("formErr").textContent="Describe the request or action before saving."; $("formErr").hidden=false; return; }
    const row={ id:state.editing||"", action, from:$("f_from").value, to:$("f_to").value, responsible:$("f_resp").value.trim(),
      issued:$("f_issued").value, due:$("f_due").value, status:$("f_status").value, remarks:$("f_remarks").value.trim() };
    $("saveBtn").disabled=true; $("saveBtn").textContent="Saving…"; state.busy=true;
    try{
      const j=await apiPost({op:"save",reg:state.tab,row,passcode:state.passcode,by:state.name});
      if (!j.ok){ $("formErr").textContent=handleWriteError(j); $("formErr").hidden=false; return; }
      applyData(j.data); toast(state.editing?"Action updated":"Action added"); state.busy=false; closeDrawer();
    }catch(err){ $("formErr").textContent="Couldn't save right now. Check your connection and try again."; $("formErr").hidden=false; }
    finally{ state.busy=false; $("saveBtn").disabled=false; $("saveBtn").textContent="Save action"; }
  }
  async function del(){
    state.busy=true; $("delYes").disabled=true;
    try{
      const j=await apiPost({op:"delete",reg:state.tab,id:state.editing,passcode:state.passcode,by:state.name});
      if (!j.ok){ $("formErr").textContent=handleWriteError(j); $("formErr").hidden=false; return; }
      applyData(j.data); state.busy=false; closeDrawer(); toast("Action deleted");
    }catch(err){ $("formErr").textContent="Couldn't delete this action. Try again."; $("formErr").hidden=false; }
    finally{ state.busy=false; $("delYes").disabled=false; }
  }

  /* ---------- CSV export ---------- */
  function exportCsv(){
    const R=reg(), rows=filtered(); const q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const lines=[["No.","Request / Action","Date Issued","From","To","Responsible","Due Date","Status","Overdue","Remarks","Last Updated","Updated By"].map(q).join(",")]
      .concat(rows.map(r=>[codeFor(R,r),r.action,r.issued,r.from,r.to,r.responsible,r.due,r.status,isOverdue(r)?"Yes":"",r.remarks,r.updatedAt,r.updatedBy].map(q).join(",")));
    const blob=new Blob(["﻿"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"});
    const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
    a.download=`DrasChem_NaCN_Production_Facility_${R.short}_Action_Registry_${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
    toast(`Downloaded ${rows.length} action${rows.length===1?"":"s"}`);
  }

  /* ---------- events ---------- */
  $("tabs").addEventListener("click",e=>{ const b=e.target.closest("[data-tab]"); if(!b) return; state.tab=b.dataset.tab; ls.set("nacn.tab",state.tab); history.replaceState(null,"","#"+state.tab); render(); });
  $("kpis").addEventListener("click",e=>{ const b=e.target.closest("[data-st]"); if(!b) return; state.status=b.dataset.st; render(); });
  $("statusSeg").addEventListener("click",e=>{ const b=e.target.closest("[data-st]"); if(!b) return; state.status=b.dataset.st; render(); });
  $("partyFilter").addEventListener("change",e=>{ state.party=e.target.value; renderRows(); });
  $("q").addEventListener("input",e=>{ state.q=e.target.value; renderRows(); });
  $("thead").addEventListener("click",e=>{ const th=e.target.closest("[data-sort]"); if(!th) return; const k=th.dataset.sort; state.sort = state.sort.key===k?{key:k,dir:state.sort.dir==="asc"?"desc":"asc"}:{key:k,dir:"asc"}; renderHead(); renderRows(); });
  function rowOpen(e){ const el=e.target.closest("[data-id]"); if(!el) return; const r=state.rows[state.tab].find(x=>x.id===el.dataset.id); if(r) openDrawer(r); }
  $("tbody").addEventListener("click",rowOpen); $("cards").addEventListener("click",rowOpen);
  [$("tbody"),$("cards")].forEach(el=>el.addEventListener("keydown",e=>{ if(e.key==="Enter") rowOpen(e); }));
  $("addBtn").addEventListener("click",()=>openDrawer(null));
  $("exportBtn").addEventListener("click",exportCsv);
  $("lockBtn").addEventListener("click",openUnlock);
  $("uForm").addEventListener("submit",doUnlock);
  $("uClose").addEventListener("click",closeUnlock); $("uClose2").addEventListener("click",closeUnlock); $("uScrim").addEventListener("click",closeUnlock);
  $("uLock").addEventListener("click",lockAgain);
  $("closeBtn").addEventListener("click",closeDrawer); $("cancelBtn").addEventListener("click",closeDrawer); $("scrim").addEventListener("click",closeDrawer);
  document.addEventListener("keydown",e=>{ if(e.key!=="Escape") return; if(!$("drawer").hidden) closeDrawer(); else if(!$("unlock").hidden) closeUnlock(); });
  $("form").addEventListener("submit",save);
  $("delBtn").addEventListener("click",()=>{ $("delBtn").hidden=true; $("delConfirm").hidden=false; });
  $("delNo").addEventListener("click",()=>{ $("delBtn").hidden=false; $("delConfirm").hidden=true; });
  $("delYes").addEventListener("click",del);

  render();
  refresh();
  setInterval(()=>{ if (document.visibilityState==="visible" && $("drawer").hidden) refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange",()=>{ if (document.visibilityState==="visible") refresh(); });
})();
