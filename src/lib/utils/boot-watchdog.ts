/**
 * Boot watchdog (#446): reports a page whose app never starts.
 *
 * A launch can sit on a white screen with nothing in the server log (2026-11-20: three reopens of
 * the iPhone PWA before one loaded, #443). Logging that runs inside the app can't report it: the
 * app is what didn't start. So this small script runs inline in the page's <head>, ahead of the
 * app's scripts. It names the page (`window.__aidjPage.id`, which the flight
 * recorder then uses as its page id), notes resources that fail to load and early errors, and if
 * the app hasn't marked itself started after BOOT_STALL_MS, it sends one "app did not start"
 * event with what it can see to the flight recorder's endpoint, where it lands in the server log
 * as `🎛️ [LAB <id>] … ❌ app did not start {…}`.
 *
 * If the app does start later, its "page load" event carries the same id, `bootMs` and
 * `stallReported: true`.
 *
 * Two things it can't see. It runs only once the stylesheet has loaded: TanStack gives the
 * stylesheet link precedence "default", so React hoists it to the top of <head>, and an inline
 * script waits for a stylesheet above it. A page stuck on its stylesheet is not reported; its
 * `[PAGE]` server line still shows that the HTML went out (src/lib/services/page-request-log.ts).
 * And the endpoint takes only the admin's reports, like the Lab, so a signed-out page's is dropped.
 *
 * Plain ES5 with no imports: it runs before any bundle.
 */

export const BOOT_STALL_MS = 10_000;
export const BOOT_LOG_ENDPOINT = '/api/dj/lab-log';

export const BOOT_SCRIPT = `(function(){try{
var w=window;if(w.__aidjPage)return;
var p=w.__aidjPage={id:Math.random().toString(36).slice(2,8),t0:Date.now(),errors:[]};
function note(m){if(p.errors.length<5)p.errors.push(String(m).slice(0,160))}
w.addEventListener('error',function(e){var t=e.target;note(t&&t!==w&&(t.src||t.href)?'failed to load '+(t.src||t.href):e.message)},true);
w.addEventListener('unhandledrejection',function(e){var r=e.reason;note('unhandled rejection: '+(r&&r.message||r))});
setTimeout(function(){
if(p.started)return;
p.stalled=Date.now();
var perf=w.performance,get=perf&&perf.getEntriesByType?function(t){return perf.getEntriesByType(t)}:function(){return[]};
var nav=get('navigation')[0],res=get('resource'),js=0,css=0;
for(var i=0;i<res.length;i++){var k=res[i].initiatorType;if(k==='script')js++;else if(k==='link'||k==='css')css++}
var sw=navigator.serviceWorker;
var data={waitedSec:Math.round((p.stalled-p.t0)/1000),path:location.pathname,nav:nav&&nav.type,
ttfbMs:nav&&nav.responseStart>0?Math.round(nav.responseStart):void 0,visibility:document.visibilityState,
readyState:document.readyState,scripts:js,styles:css,sw:sw?(sw.controller?'controlled':'none'):'unsupported',
online:navigator.onLine,errors:p.errors.length?p.errors:void 0};
var body=JSON.stringify({entries:[{seq:0,t:p.stalled,sid:p.id,ev:'app did not start',level:'error',data:data}],ua:navigator.userAgent});
if(navigator.sendBeacon)navigator.sendBeacon(${JSON.stringify(BOOT_LOG_ENDPOINT)},new Blob([body],{type:'application/json'}));
},${BOOT_STALL_MS});
}catch(e){}})()`;
