(function(){
  var d=document.documentElement,t=null,l=null;
  try{t=localStorage.getItem('ui_theme');l=localStorage.getItem('ui_lang')}catch(e){}
  if(t==='dark'||t==='light')d.setAttribute('data-theme',t);
  if(l==='en'){
    d.lang='en';d.dir='ltr';
    var p=(location.pathname.split('/').pop()||'index').replace(/\.html$/,'')||'index';
    var m={'index':['entry'],'pre-call':['pre-call'],'post-call':['post-call','post-call-tools'],'privacy':['privacy'],'accessibility':['accessibility']}[p];
    if(m)document.write(['common'].concat(m).map(function(x){return '<script src="assets/en-'+x+'.js"><\/script>'}).join(''));
  }
  var dk=t==='dark'||(t!=='light'&&typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches);
  var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',dk?'#14171a':'#e2e5e9');

  /* FIELD action contract: labels describe the user's next outcome. */
  function a(s){return Array.prototype.slice.call(document.querySelectorAll(s))}
  function b(k,v){a('[data-act="'+k+'"]').forEach(function(x){x.textContent=v})}
  function r(f,t){
    var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),n;
    while((n=w.nextNode()))if((n.nodeValue||'').trim()===f)n.nodeValue=n.nodeValue.replace(f,t)
  }
  function c(){
    if((d.lang||'he').indexOf('he')!==0||!document.body)return;
    b('trlocal','מצא מה חשוב להצעה');b('trprompt','מצא עוד פרטים עם AI');
    a('[data-act="parse"]').forEach(function(x){if(/חלץ|שדות|הדבקה/.test(x.textContent||''))x.textContent='מלא את הפרופיל מהטקסט'});
    a('[data-act="go2"]').forEach(function(x){if((x.textContent||'').trim()==='המשך לצד השני')x.textContent='המשך להכנת השיחה'});
    r('שלב 2 · הצד השני','שלב 2 · מי מולכם');r('מסלול מעמיק · פרומפט ל-Deep Research','מחקר מעמיק על הלקוח');
    r('3 · עבור על מה שנמצא ואשר','בדוק מה ייכנס להצעה');b('trapply','השתמש בפרטים שאישרתי');r('מאיפה הגיעו המספרים:','על מה המחיר נשען:');
    var q=document.querySelector('#buyContact'),s=q?(q.textContent||'').trim():'',ch=/^\+?\d[\d\s-]+$/.test(s)?'WhatsApp':/@/.test(s)?'אימייל':'';
    if(ch){var z=ch==='WhatsApp'?'פתח WhatsApp לבקשת מפתח':'פתח '+ch+' לבקשת מפתח',pay=document.querySelector('#payBtn'),early=document.querySelector('[data-act="askkey"]');if(pay&&/מפתח|הודעה/.test(pay.textContent||''))pay.textContent=z;if(early)early.textContent=z}
  }
  var busy=false;function s(){if(busy)return;busy=true;Promise.resolve().then(function(){busy=false;c()})}
  function mount(){c();if(document.body&&typeof MutationObserver!=='undefined')new MutationObserver(s).observe(document.body,{subtree:true,childList:true,characterData:true})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
