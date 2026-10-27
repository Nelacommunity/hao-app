import { LEAFLET_CSS, LEAFLET_JS } from '@/components/map/leaflet-assets.generated';

/** What the app sends into the map page (coordinates already in the tiles' GCJ-02 system). */
export type MapState = {
  places: { id: string; lat: number; lng: number; color: string; emoji: string; name: string; selected: boolean }[];
  user: { lat: number; lng: number } | null;
  route: { coords: [number, number][]; approximate: boolean } | null;
};
export type MapView =
  | { kind: 'center'; lat: number; lng: number; zoom: number }
  | { kind: 'fit'; coords: [number, number][]; bottom: number }
  /** Navigation: keep the user in view, heading up where the map can rotate. */
  | { kind: 'follow'; lat: number; lng: number; zoom: number; bearing: number | null };
export type MapEvent = { type: 'ready' } | { type: 'select'; id: string };
/** dark: the app's dark theme, so the map matches it. */
export type MapPageOptions = { lat: number; lng: number; zoom: number; labels: 'en' | 'zh_cn'; accent: string; dark: boolean };

// Amap (高德) tiles: reachable in mainland China without a key; `lang` picks label language.
const tileUrl = (lang: 'en' | 'zh_cn') =>
  `https://webrd0{s}.is.autonavi.com/appmaptile?lang=${lang}&size=1&scale=1&style=8&x={x}&y={y}&z={z}`;

/**
 * A self-contained Leaflet page; the app drives it with window.haoState / window.haoView. Events go to
 * the React Native WebView, or to the parent window when the page runs in an iframe on web.
 */
export function leafletMapHtml(options: MapPageOptions) {
  return `<!doctype html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>${LEAFLET_CSS}
html,body,#map{margin:0;height:100%;background:#F2EFE9}
.pin{width:18px;height:18px;border-radius:50%;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box}
.pin.sel{width:26px;height:26px;border-width:4px}
.lbl{position:absolute;left:50%;bottom:30px;transform:translateX(-50%);white-space:nowrap;background:#fff;color:#1B1A1F;
 font:700 12px -apple-system,Roboto,sans-serif;padding:4px 8px;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.me{width:16px;height:16px;border-radius:50%;background:#2576FF;border:3px solid #fff;box-shadow:0 0 0 6px rgba(37,118,255,.2);box-sizing:border-box}
.leaflet-control-attribution{font-size:9px}
${
  options.dark
    ? // AMap has no dark raster tiles: invert them and turn the colours back, which reads like a night map.
      `html,body,#map{background:#1B1B1D}
.leaflet-tile-pane{filter:invert(1) hue-rotate(180deg) brightness(.92) contrast(.88) saturate(.8)}
.lbl{background:#1E1E20;color:#E9E9EB}
.leaflet-control-attribution{background:rgba(30,30,32,.8)!important;color:#A3A3A8}
.leaflet-control-attribution a{color:#A3A3A8}`
    : ''
}
</style></head><body><div id="map"></div>
<script>${LEAFLET_JS}</script>
<script>
(function(){
  var post=function(m){var s=JSON.stringify(m);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(s);else if(window.parent!==window)window.parent.postMessage({hao:s},'*');};
  var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([${options.lat},${options.lng}],${options.zoom});
  L.tileLayer(${JSON.stringify(tileUrl(options.labels))},{subdomains:'1234',maxZoom:18,attribution:'© 高德地图 AutoNavi'}).addTo(map);
  var markers=L.layerGroup().addTo(map), route=null, me=null;
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  window.haoState=function(s){
    markers.clearLayers();
    s.places.forEach(function(p){
      var size=p.selected?26:18;
      var html='<div class="pin'+(p.selected?' sel':'')+'" style="background:'+p.color+'"></div>'+(p.selected?'<div class="lbl">'+esc(p.name)+'</div>':'');
      var m=L.marker([p.lat,p.lng],{icon:L.divIcon({className:'',html:html,iconSize:[size,size],iconAnchor:[size/2,size/2]}),zIndexOffset:p.selected?1000:0});
      m.on('click',function(){post({type:'select',id:p.id});});
      markers.addLayer(m);
    });
    if(route){map.removeLayer(route);route=null;}
    if(s.route&&s.route.coords.length>1){
      route=L.polyline(s.route.coords,{color:'${options.accent}',weight:6,lineCap:'round',lineJoin:'round',dashArray:s.route.approximate?'8 10':null}).addTo(map);
    }
    if(me){map.removeLayer(me);me=null;}
    if(s.user){me=L.marker([s.user.lat,s.user.lng],{icon:L.divIcon({className:'',html:'<div class="me"></div>',iconSize:[16,16],iconAnchor:[8,8]}),interactive:false}).addTo(map);}
  };
  window.haoView=function(v){
    if(v.kind==='fit'){map.flyToBounds(L.latLngBounds(v.coords),{paddingTopLeft:[48,140],paddingBottomRight:[48,v.bottom+48],duration:0.45});}
    else if(v.kind==='follow'){map.setView([v.lat,v.lng],v.zoom,{animate:true,duration:0.5});}
    else{map.flyTo([v.lat,v.lng],v.zoom,{duration:0.45});}
  };
  post({type:'ready'});
})();
</script></body></html>`;
}
