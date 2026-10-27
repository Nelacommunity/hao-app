import type { MapPageOptions } from '@/components/map/leaflet-html';

/**
 * The official AMap (高德) JS API 2.0 map: vector rendering, current AMap styles, 3D buildings and
 * smooth zoom/rotate. Same contract as the Leaflet page (window.haoState / window.haoView, posted
 * events), so the native WebView and the web iframe drive either one.
 * Docs: https://lbs.amap.com/api/javascript-api-v2/summary
 */
export function amapMapHtml(options: MapPageOptions & { key: string; serviceHost: string; languageCode: string }) {
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
html,body,#map{margin:0;height:100%;background:#F5F3EF;-webkit-tap-highlight-color:transparent}
.pin{position:relative;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;
 box-shadow:0 2px 6px rgba(0,0,0,.3);box-sizing:border-box;display:flex;align-items:center;justify-content:center;transition:transform .15s}
.pin span{transform:rotate(45deg);font-size:14px;line-height:1}
.pin.sel{width:42px;height:42px;border-width:3px}
.pin.sel span{font-size:20px}
.lbl{position:absolute;left:50%;bottom:52px;transform:translateX(-50%);white-space:nowrap;background:#fff;color:#1B1A1F;
 font:700 13px -apple-system,Roboto,sans-serif;padding:5px 10px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
.me{position:relative;width:18px;height:18px;border-radius:50%;background:#2576FF;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3);box-sizing:border-box}
.me:after{content:'';position:absolute;inset:-12px;border-radius:50%;background:rgba(37,118,255,.25);animation:pulse 2s ease-out infinite}
@keyframes pulse{from{transform:scale(.4);opacity:1}to{transform:scale(1.3);opacity:0}}
${options.dark ? 'html,body,#map{background:#1B1B1D}\n.lbl{background:#1E1E20;color:#E9E9EB}\n.err{color:#A3A3A8}\n' : ''}.err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;
 font:14px -apple-system,Roboto,sans-serif;color:#6B6870}
</style>
<script>window._AMapSecurityConfig={serviceHost:${JSON.stringify(options.serviceHost)}};</script>
</head><body><div id="map"></div>
<script>
(function(){
  var post=function(m){var s=JSON.stringify(m);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(s);else if(window.parent!==window)window.parent.postMessage({hao:s},'*');};
  var map, markers=[], route=null, me=null, pending={};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  var ll=function(p){return [p[1],p[0]];};

  function setState(s){
    map.remove(markers);
    markers=s.places.map(function(p){
      var size=p.selected?42:30;
      var html='<div class="pin'+(p.selected?' sel':'')+'" style="background:'+p.color+'"><span>'+esc(p.emoji)+'</span></div>'+(p.selected?'<div class="lbl">'+esc(p.name)+'</div>':'');
      // The pin's tip (its bottom-left corner, rotated) sits on the place.
      var m=new AMap.Marker({position:[p.lng,p.lat],content:html,offset:new AMap.Pixel(-size/2,-size*1.2),zIndex:p.selected?200:100});
      m.on('click',function(){post({type:'select',id:p.id});});
      return m;
    });
    map.add(markers);
    if(route){map.remove(route);route=null;}
    if(s.route&&s.route.coords.length>1){
      route=new AMap.Polyline({path:s.route.coords.map(ll),strokeColor:'${options.accent}',strokeWeight:7,strokeOpacity:.95,
        isOutline:true,outlineColor:'#fff',borderWeight:2,lineJoin:'round',lineCap:'round',showDir:!s.route.approximate,
        strokeStyle:s.route.approximate?'dashed':'solid',strokeDasharray:[10,10],zIndex:50});
      map.add(route);
    }
    if(me){map.remove(me);me=null;}
    if(s.user){me=new AMap.Marker({position:[s.user.lng,s.user.lat],content:'<div class="me"></div>',offset:new AMap.Pixel(-9,-9),zIndex:300,bubble:true});map.add(me);}
  }
  function setView(v){
    if(v.kind!=='follow'&&map.getRotation())map.setRotation(0,false,300);
    if(v.kind==='fit'){
      var lats=v.coords.map(function(c){return c[0];}), lngs=v.coords.map(function(c){return c[1];});
      var b=new AMap.Bounds([Math.min.apply(0,lngs),Math.min.apply(0,lats)],[Math.max.apply(0,lngs),Math.max.apply(0,lats)]);
      map.setBounds(b,false,[140,48,v.bottom+48,48]);
    } else if(v.kind==='follow'){
      map.setZoomAndCenter(v.zoom,[v.lng,v.lat],false,500);
      if(v.bearing!=null)map.setRotation((360-v.bearing)%360,false,500);
    } else map.setZoomAndCenter(v.zoom,[v.lng,v.lat],false,450);
  }
  // Calls that arrive before the API has loaded keep only the latest of each.
  window.haoState=function(s){if(map)setState(s);else pending.state=s;};
  window.haoView=function(v){if(map)setView(v);else pending.view=v;};

  window.haoInit=function(){
    map=new AMap.Map('map',{center:[${options.lng},${options.lat}],zoom:${options.zoom},viewMode:'3D',pitch:0,
      mapStyle:'amap://styles/${options.dark ? 'dark' : 'normal'}',languageCode:${JSON.stringify(options.languageCode)},
      logoLanguage:'${options.languageCode === 'zh' ? 'zh' : 'en'}',showBuildingBlock:true,rotateEnable:true,pitchEnable:true,resizeEnable:true});
    map.on('complete',function(){
      if(pending.state)setState(pending.state);
      if(pending.view)setView(pending.view);
      post({type:'ready'});
    });
  };
  var script=document.createElement('script');
  script.src='https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(options.key)}&callback=haoInit';
  script.onerror=function(){document.body.innerHTML='<div class="err">The map could not load. Check your connection.</div>';};
  document.head.appendChild(script);
})();
</script></body></html>`;
}
