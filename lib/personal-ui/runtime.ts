// The worker is created INSIDE the opaque-origin sandbox, so it cannot read the
// app's IndexedDB, cookies or caches. It inherits the frame's network/eval CSP.
export const WORKER_BOOT = String.raw`
const UC = (() => {
  let next = 0, handler = () => {}; const pending = new Map();
  const request = (op, args) => new Promise((resolve,reject) => {
    const id = ++next; const timer = setTimeout(() => { pending.delete(id); reject(Error('Request timed out')); }, 10000);
    pending.set(id, {resolve,reject,timer}); postMessage({kind:'request',id,op,args});
  });
  addEventListener('message', ({data:d}) => {
    if(d?.kind === 'ping') postMessage({kind:'pong'});
    if(d?.kind === 'action') Promise.resolve().then(() => handler(d.event)).catch(e => postMessage({kind:'error',text:String(e.message).slice(0,200)}));
    if(d?.kind === 'reply') { const p = pending.get(d.id); if(!p) return; clearTimeout(p.timer); pending.delete(d.id); d.error ? p.reject(Error(d.error)) : p.resolve(d.value); }
  });
  return Object.freeze({render:(html,css='') => postMessage({kind:'render',html,css}),onAction:fn=>{handler=fn;},
    get:key=>request('get',{key}),set:(key,value,revision)=>request('set',{key,value,revision}),
    open:path=>postMessage({kind:'open',path}),draft:text=>postMessage({kind:'draft',text})});
})();
addEventListener('unhandledrejection', e => postMessage({kind:'error',text:String(e.reason?.message || e.reason).slice(0,200)}));
`;

export const FRAME = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-uc-renderer'; worker-src blob:; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'; connect-src 'none'"><style id="design"></style><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;box-sizing:border-box}*,*:before,*:after{box-sizing:inherit}</style></head><body><div id="root" style="height:100%"></div><script nonce="uc-renderer">
const root=document.getElementById('root');
const tags=new Set('DIV SPAN P H1 H2 H3 H4 H5 H6 HEADER FOOTER MAIN NAV SECTION ARTICLE ASIDE BUTTON INPUT TEXTAREA SELECT OPTION LABEL UL OL LI TABLE THEAD TBODY TR TD TH STRONG B EM I SMALL BR HR PRE CODE DETAILS SUMMARY PROGRESS METER'.split(' '));
const attrs=new Set('id class style title role aria-label aria-expanded aria-hidden type name value placeholder checked selected disabled min max step rows cols data-action tabindex for'.split(' '));
function clean(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 for(const el of [...doc.body.querySelectorAll('*')]){
  if(!tags.has(el.tagName)){el.remove();continue;}
  for(const a of [...el.attributes])if(!attrs.has(a.name)||a.name==='id'&&a.value!=='uc-content')el.removeAttribute(a.name);
  if(el.tagName==='INPUT'&&!['text','number','checkbox','radio','range','date','time','color'].includes(el.type))el.setAttribute('type','text');
 }
 return doc.body.innerHTML;
}
let previous='';
function measure(){
 const slots=root.querySelectorAll('#uc-content'); const s=slots.length===1?slots[0]:null;
 const b=s?.getBoundingClientRect(), style=s&&getComputedStyle(s);
 const rect=b&&style.display!=='none'&&style.visibility!=='hidden'?{x:b.x,y:b.y,width:b.width,height:b.height}:null;
 const encoded=JSON.stringify(rect); if(encoded!==previous){previous=encoded;parent.postMessage({kind:'rect',rect},'*');}
}
let worker;
addEventListener('message',e=>{if(e.source!==parent||!e.data)return;
 if(e.data.kind==='start-worker'&&!worker){try{const url=URL.createObjectURL(new Blob([e.data.source],{type:'text/javascript'}));worker=new Worker(url);URL.revokeObjectURL(url);worker.onmessage=({data})=>parent.postMessage({kind:'worker',data},'*');worker.onerror=()=>parent.postMessage({kind:'error'},'*');}catch{parent.postMessage({kind:'error'},'*');}return;}
 if(e.data.kind==='to-worker'){worker?.postMessage(e.data.data);return;}
 if(e.data.kind==='stop-worker'){worker?.terminate();return;}
 if(e.data.kind!=='render')return;
 try{root.innerHTML=clean(String(e.data.html).slice(0,100000));document.getElementById('design').textContent=String(e.data.css).slice(0,60000);previous='';requestAnimationFrame(measure);}catch{parent.postMessage({kind:'error'},'*');}});
function action(e){const el=e.target.closest('[data-action]');if(!el)return;
 const values={};for(const i of root.querySelectorAll('input[name],textarea[name],select[name]'))values[i.name]=i.type==='checkbox'?i.checked:i.value;
 parent.postMessage({kind:'action',event:{action:el.dataset.action,value:el.value,values}},'*');}
root.addEventListener('click',e=>{if(e.target.closest('button,[role=button]'))action(e);});root.addEventListener('change',action);
new ResizeObserver(measure).observe(root);setInterval(measure,500);
parent.postMessage({kind:'ready'},'*');
</script></body></html>`;
