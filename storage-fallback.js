/* localStorage fallback.

   Some embedding contexts (sandboxed iframes, opaque origins, Safari private
   mode) throw on any localStorage access. app.js reads it at load time, so
   without this the whole app dies on the first line. Swap in a memory-backed
   shim when the real thing isn't usable — the app then works for the session,
   it just doesn't persist between reloads.
*/
(function(){
  function usable(store){
    try{ var k='__gas_probe__'; store.setItem(k,'1'); store.removeItem(k); return true; }
    catch(e){ return false; }
  }
  function memoryStore(){
    var mem = Object.create(null);
    return {
      getItem: function(k){ k=String(k); return k in mem ? mem[k] : null; },
      setItem: function(k,v){ mem[String(k)]=String(v); },
      removeItem: function(k){ delete mem[String(k)]; },
      clear: function(){ mem=Object.create(null); },
      key: function(i){ var ks=Object.keys(mem); return i<ks.length?ks[i]:null; },
      get length(){ return Object.keys(mem).length; }
    };
  }
  ['localStorage','sessionStorage'].forEach(function(name){
    var real=null; try{ real=window[name]; }catch(e){}
    if(real && usable(real)) return;
    try{ Object.defineProperty(window, name, { value: memoryStore(), configurable:true, writable:true }); }
    catch(e){ try{ window[name]=memoryStore(); }catch(e2){} }
  });
})();
