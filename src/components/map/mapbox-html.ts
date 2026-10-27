import type { MapPageOptions } from '@/components/map/leaflet-html';

const MAPBOX_GL = 'https://api.mapbox.com/mapbox-gl-js/v3.9.0';

/**
 * Mapbox GL JS with the Standard style, labelled in the traveller's language. Same contract as the
 * Leaflet and AMap pages (window.haoState / window.haoView, posted events). Mapbox tiles are WGS-84, so
 * the app converts its GCJ-02 points before sending them in.
 * Docs: https://docs.mapbox.com/mapbox-gl-js/api/
 */
export function mapboxMapHtml(options: MapPageOptions & { token: string; language: string }) {
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link href="${MAPBOX_GL}/mapbox-gl.css" rel="stylesheet">
<style>
html,body,#map{margin:0;height:100%;background:${options.dark ? '#1B1B1D' : '#F2EFE9'};-webkit-tap-highlight-color:transparent}
.pin{position:relative;width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2.5px solid #fff;
 box-shadow:0 2px 6px rgba(0,0,0,.3);box-sizing:border-box;display:flex;align-items:center;justify-content:center;cursor:pointer}
.pin span{transform:rotate(45deg);font-size:14px;line-height:1}
.pin.sel{width:42px;height:42px;border-width:3px}
.pin.sel span{font-size:20px}
.lbl{position:absolute;left:50%;bottom:calc(100% + 10px);transform:translateX(-50%);white-space:nowrap;background:${options.dark ? '#1E1E20' : '#fff'};
 color:${options.dark ? '#E9E9EB' : '#1B1A1F'};font:700 13px -apple-system,Roboto,sans-serif;padding:5px 10px;border-radius:10px;box-shadow:0 2px 8px rgba(0,0,0,.2)}
.me{width:18px;height:18px;border-radius:50%;background:#2576FF;border:3px solid #fff;box-shadow:0 0 0 7px rgba(37,118,255,.22);box-sizing:border-box}
.err{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;text-align:center;
 font:14px -apple-system,Roboto,sans-serif;color:${options.dark ? '#A3A3A8' : '#6B6870'}}
</style></head><body><div id="map"></div>
<script>
(function(){
  var post=function(m){var s=JSON.stringify(m);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(s);else if(window.parent!==window)window.parent.postMessage({hao:s},'*');};
  var map, loaded=false, markers=[], me=null, pending={};
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  var ll=function(p){return [p[1],p[0]];};

  function setState(s){
    markers.forEach(function(m){m.remove();});
    markers=s.places.map(function(p){
      var el=document.createElement('div');
      el.innerHTML='<div class="pin'+(p.selected?' sel':'')+'" style="background:'+p.color+'"><span>'+esc(p.emoji)+'</span></div>'+(p.selected?'<div class="lbl">'+esc(p.name)+'</div>':'');
      el.style.zIndex=p.selected?2:1;
      el.addEventListener('click',function(e){e.stopPropagation();post({type:'select',id:p.id});});
      // The pin's tip (its bottom-left corner, rotated) sits on the place.
      return new mapboxgl.Marker({element:el,anchor:'bottom'}).setLngLat([p.lng,p.lat]).addTo(map);
    });
    var data={type:'FeatureCollection',features:s.route&&s.route.coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:s.route.coords.map(ll)}}]:[]};
    map.getSource('route').setData(data);
    map.setPaintProperty('route','line-dasharray',s.route&&s.route.approximate?[1.5,2]:[1,0]);
    if(me){me.remove();me=null;}
    if(s.user){var d=document.createElement('div');d.className='me';me=new mapboxgl.Marker({element:d}).setLngLat([s.user.lng,s.user.lat]).addTo(map);}
  }
  function setView(v){
    if(v.kind==='fit'){
      var b=new mapboxgl.LngLatBounds();
      v.coords.forEach(function(c){b.extend([c[1],c[0]]);});
      map.fitBounds(b,{padding:{top:140,left:48,right:48,bottom:v.bottom+48},duration:450});
    } else if(v.kind==='follow'){
      map.easeTo({center:[v.lng,v.lat],zoom:v.zoom,pitch:50,bearing:v.bearing==null?map.getBearing():v.bearing,duration:900,
        padding:{top:160,bottom:220,left:0,right:0}});
    } else map.flyTo({center:[v.lng,v.lat],zoom:v.zoom,pitch:0,bearing:0,padding:{top:0,bottom:0,left:0,right:0},duration:450});
  }
  // Calls that arrive before the style has loaded keep only the latest of each.
  window.haoState=function(s){if(loaded)setState(s);else pending.state=s;};
  window.haoView=function(v){if(loaded)setView(v);else pending.view=v;};

  function fail(){document.body.innerHTML='<div class="err">The map could not load. Check your connection.</div>';}
  var script=document.createElement('script');
  script.src='${MAPBOX_GL}/mapbox-gl.js';
  script.onerror=fail;
  script.onload=function(){
    mapboxgl.accessToken=${JSON.stringify(options.token)};
    map=new mapboxgl.Map({container:'map',style:'mapbox://styles/mapbox/standard',center:[${options.lng},${options.lat}],zoom:${options.zoom},
      language:${JSON.stringify(options.language)},config:{basemap:{lightPreset:'${options.dark ? 'night' : 'day'}',showPointOfInterestLabels:true}},
      attributionControl:true,logoPosition:'bottom-left',pitchWithRotate:true});
    map.on('load',function(){
      map.addSource('route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
      map.addLayer({id:'route-casing',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#fff','line-width':10}});
      map.addLayer({id:'route',type:'line',source:'route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'${options.accent}','line-width':6}});
      loaded=true;
      if(pending.state)setState(pending.state);
      if(pending.view)setView(pending.view);
      post({type:'ready'});
    });
    map.on('error',function(e){if(!loaded&&e&&e.error&&/401|403|token/i.test(String(e.error.message||e.error.status)))fail();});
  };
  document.head.appendChild(script);
})();
</script></body></html>`;
}
