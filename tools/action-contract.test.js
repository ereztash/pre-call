const fs=require('fs'),path=require('path'),assert=require('assert');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const strip=s=>s.replace(/<!--[\s\S]*?-->/g,' ').replace(/\/\*[\s\S]*?\*\//g,' ');
const text=s=>s.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const post=read('post-call.html'),pre=read('pre-call.html'),gate=read('assets/pc-gate.js'),boot=read('assets/pc-boot.js');
let pass=0,fail=0;function test(n,f){try{f();pass++;console.log('  ok   '+n)}catch(e){fail++;console.log('  FAIL '+n+'\n       '+e.message)}}
function label(h,a){const m=h.match(new RegExp('<button[^>]*data-act=["\\\']'+a+'["\\\'][^>]*>([\\s\\S]*?)<\\/button>','i'));assert.ok(m,'missing '+a);return text(m[1])}

console.log('\naction labels describe expected outcomes');
test('proposal actions still say copy, PDF and send',()=>{assert.match(label(post,'copy'),/העתק.*הצעה/);assert.match(label(post,'print'),/PDF/);assert.match(label(post,'send'),/שלח.*לקוח/)});
test('POST-CALL transcript action is proposal-task language',()=>{assert.match(boot,/מצא מה חשוב להצעה/);assert.match(boot,/השתמש בפרטים שאישרתי/);assert.match(boot,/על מה המחיר נשען/)});
test('PRE-CALL labels say what the user gets',()=>{assert.match(boot,/מלא את הפרופיל מהטקסט/);assert.match(boot,/המשך להכנת השיחה/);assert.match(boot,/שלב 2 · מי מולכם/)});
test('no evidence-candidate jargon is a visible button contract',()=>{const buttons=[post,pre].flatMap(s=>s.match(/<button[\s\S]*?<\/button>/g)||[]).map(text).join('\n');assert.doesNotMatch(buttons,/מועמד(?:י|ים)?\s+ראי(?:ה|ות)|ראיות?\s+מועמד/);assert.doesNotMatch(strip(boot),/מועמד(?:י|ים)?\s+ראי(?:ה|ות)|ראיות?\s+מועמד/)});

console.log('\nlocked exports keep their contract');
test('export first opens the in-product wall',()=>{const m=gate.match(/function requireKey\(fn\)\{([\s\S]*?)\n\}/);assert.ok(m);assert.match(m[1],/pendingExport\s*=\s*fn/);assert.match(m[1],/show\(['\"]wall['\"],\s*true\)/);assert.doesNotMatch(m[1],/openContact|window\.open|location\./)});
test('WhatsApp is named before the key request leaves the app',()=>{assert.match(boot,/פתח WhatsApp לבקשת מפתח/);assert.match(boot,/buyContact/)});
test('unlock resumes the original export',()=>assert.match(gate,/if \(pendingExport\) \{ const f = pendingExport; pendingExport = null; f\(\); \}/));
test('dynamic UI is rechecked after it renders',()=>{assert.match(boot,/new MutationObserver\(s\)/);assert.match(boot,/characterData:true/)});

console.log('\n'+pass+' passed, '+fail+' failed\n');process.exit(fail?1:0);
