const $=id=>document.getElementById(id), KEY="campus-lf-demo-v1";
let items=[];try{items=JSON.parse(localStorage.getItem(KEY)||"[]")}catch{}
$("date").value=new Date().toISOString().slice(0,10);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const save=()=>localStorage.setItem(KEY,JSON.stringify(items));
const dateFmt=s=>s?new Date(s+"T00:00:00").toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"}):"—";
function render(){
$("lostCount").textContent=items.filter(x=>x.type==="LOST"&&x.status!=="RETURNED").length;
$("foundCount").textContent=items.filter(x=>x.type==="FOUND"&&x.status!=="RETURNED").length;
$("returnedCount").textContent=items.filter(x=>x.status==="RETURNED").length;
let q=$("search").value.toLowerCase().trim(),t=$("filter").value;
let rows=items.filter(x=>x.status!=="RETURNED"&&(t==="ALL"||x.type===t)&&[x.name,x.description,x.location,x.category].some(v=>v.toLowerCase().includes(q)));
$("count").textContent=rows.length+" item"+(rows.length===1?"":"s");
$("records").innerHTML=rows.map(x=>`<article class="item" tabindex="0" data-id="${esc(x.id)}"><div class="photo">${x.photo?`<img src="${x.photo}" alt="">`:"⌕"}</div><div><b>${esc(x.name)}</b><span class="badge ${x.type}">${esc(x.status)}</span><div class="meta">⌖ ${esc(x.location)} · ${esc(dateFmt(x.date))}</div><div class="desc">${esc(x.description)}</div></div></article>`).join("");
$("empty").hidden=rows.length>0;
document.querySelectorAll(".item").forEach(el=>{const open=()=>details(el.dataset.id);el.onclick=open;el.onkeydown=e=>{if(e.key==="Enter")open()}});
}
function details(id){
let x=items.find(i=>i.id===id);if(!x)return;
$("detail").innerHTML=`<p class="eyebrow">ITEM REPORT</p><h2>${esc(x.name)} <span class="badge ${x.status}">${esc(x.status)}</span></h2>${x.photo?`<img src="${x.photo}" alt="Item photo">`:""}<p>${esc(x.description)}</p><p><b>Category:</b> ${esc(x.category)}<br><b>Location:</b> ${esc(x.location)}<br><b>Date:</b> ${esc(dateFmt(x.date))}</p><button class="action" id="returned">${x.status==="RETURNED"?"Reopen report":"Mark returned"}</button><button class="action" id="delete">Delete demo record</button>`;
$("dialog").showModal();
$("returned").onclick=()=>{x.status=x.status==="RETURNED"?x.type:"RETURNED";x.updatedAt=new Date().toISOString();save();$("dialog").close();render()};
$("delete").onclick=()=>{if(confirm("Delete this local demo record?")){items=items.filter(i=>i.id!==id);save();$("dialog").close();render()}};
}
$("itemForm").onsubmit=async e=>{
e.preventDefault();let f=$("photo").files[0];
if(f&&!["image/jpeg","image/png","image/webp"].includes(f.type))return $("message").textContent="Choose a JPG, PNG or WebP image.";
if(f&&f.size>1024*1024)return $("message").textContent="Choose an image smaller than 1 MB for this demo.";
let photo="";if(f)photo=await new Promise((ok,no)=>{let r=new FileReader();r.onload=()=>ok(r.result);r.onerror=no;r.readAsDataURL(f)});
let type=$("type").value;
items.unshift({id:crypto.randomUUID?crypto.randomUUID():"item-"+Date.now(),type,status:type,name:$("name").value.trim(),category:$("category").value,description:$("description").value.trim(),location:$("location").value.trim(),date:$("date").value,photo,createdAt:new Date().toISOString()});
try{save();$("message").textContent="Saved in this browser demo.";e.target.reset();$("date").value=new Date().toISOString().slice(0,10);render()}catch(err){items.shift();$("message").textContent="Browser storage full; remove records or use a smaller photo."}
};
$("search").oninput=render;$("filter").onchange=render;
$("reset").onclick=()=>{if(confirm("Clear all local demo records?")){items=[];save();render();$("message").textContent="Demo data cleared."}};
$("close").onclick=()=>$("dialog").close();$("dialog").onclick=e=>{if(e.target===$("dialog"))$("dialog").close()};
render();
