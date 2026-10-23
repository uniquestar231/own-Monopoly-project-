import http from 'node:http';
import {readFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
import {WebSocketServer,WebSocket} from 'ws';
const html=readFileSync(new URL('./engine.html',import.meta.url),'utf8');
const source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const startup="try{let raw=localStorage.getItem('monopoly-friends-v1');if(raw)s=JSON.parse(raw)}catch(e){}if(s)render();else newGame();";
const actions=new Set(['roll','endTurn','bail','useCard','buy','auctionStart','auctionBid','auctionPass','details','build','sellBuilding','mortgage','tradeDialog','tradeFields','propose','acceptTrade','closeModal','bankrupt']);
const rooms=new Map();
function makeEngine(players){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'http://localhost'});
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true};
 dom.window.HTMLDialogElement.prototype.close=function(){this.open=false};
 let notices=[];dom.window.alert=t=>notices.push(String(t));dom.window.confirm=()=>true;
 const bridge=`
 render=()=>{};save=()=>{};
 newGame();$('count').value='${players.length}';nameFields();
 ${players.map((x,i)=>`$('name${i}').value=${JSON.stringify(x.name)};`).join('\n')}
 start();
 window.bridge={snapshot:()=>JSON.parse(JSON.stringify({s,pending,tradeProposal,modal:$('modal').open?$('modalBody').innerHTML:''})),act:(name,args,inputs)=>{for(const [id,v] of Object.entries(inputs)){let el=$(id);if(el&&$('modal').contains(el)){el.value=String(v.value??'');if(el.multiple)for(const o of el.options)o.selected=(v.selected||[]).includes(o.value)}}const funcs={${[...actions].join(',')}};funcs[name](...args)}};
 `;
 new vm.Script(source.replace(startup,'')+bridge).runInContext(dom.getInternalVMContext(),{timeout:3000});
 return {bridge:dom.window.bridge,notices,dom};
}
function actor(r){let x=r.engine.bridge.snapshot();if(x.pending?.type==='auction')return x.pending.active[x.pending.who % x.pending.active.length];if(x.modal.includes('acceptTrade()')&&x.tradeProposal)return x.tradeProposal.to;return x.s.turn}
function send(ws,obj){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj))}
function broadcast(r){r.players.forEach((p,i)=>{if(r.engine)send(p.ws,{type:'state',...r.engine.bridge.snapshot(),actor:actor(r),revision:r.rev,me:i});else send(p.ws,{type:'lobby',players:r.players.map(x=>({name:x.name,online:x.ws?.readyState===1})),me:i})})}
const server=http.createServer((req,res)=>{if(req.url?.split('?')[0]==='/health'){res.writeHead(200);res.end('ok');return}if(req.url?.split('?')[0]!=='/'){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(readFileSync(new URL('./index.html',import.meta.url)))});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:65536});
wss.on('connection',(ws,req)=>{let r=null,me=-1,last=0;
 ws.on('message',raw=>{try{let d=JSON.parse(raw);if(d.type==='join'){
  if(r)return;const token=String(d.token||'');if(!/^[a-zA-Z0-9-]{20,100}$/.test(token))throw Error('Invalid session.');let code=String(d.room||'').toUpperCase();
  if(code){r=rooms.get(code);if(!r)throw Error('Room not found. Ask the host for a new link.')}else{if(rooms.size>=100)throw Error('Server is full.');code=randomBytes(6).toString('hex').toUpperCase();r={code,players:[],engine:null,rev:0,touched:Date.now()};rooms.set(code,r)}
  me=r.players.findIndex(p=>p.token===token);if(me===-1){if(r.engine||r.players.length>=6){r=null;throw Error('This room has started or is full.')}me=r.players.length;r.players.push({token,name:String(d.name||'Player').slice(0,24),ws})}else{let old=r.players[me].ws;if(old&&old!==ws)old.close();r.players[me].ws=ws}
  r.touched=Date.now();send(ws,{type:'joined',room:r.code,me});broadcast(r);return;
 }
 if(!r||r.players[me]?.ws!==ws)return;
 r.touched=Date.now();
 if(d.type==='start'){if(me!==0||r.engine||r.players.length<2)return;r.engine=makeEngine(r.players);r.rev++;broadcast(r);return}
 if(d.type==='action'){
  if(Date.now()-last<80)return;last=Date.now();if(!r.engine||d.revision!==r.rev){broadcast(r);return}if(me!==actor(r))throw Error('Wait for your action.');if(!actions.has(d.name))throw Error('Unknown action.');
  const snap=r.engine.bridge.snapshot();if(snap.s.winner!==null&&!['details','closeModal'].includes(d.name))return;
  if(snap.pending?.type==='auction'&&!['auctionBid','auctionPass'].includes(d.name))throw Error('Finish the auction first.'); if(me!==snap.s.turn&&!['acceptTrade','closeModal'].includes(d.name)&&snap.pending?.type!=='auction')throw Error('Accept or reject the trade.');
  const args=Array.isArray(d.args)?d.args:[];if(args.length>1||args.some(x=>!Number.isInteger(x)||x<0||x>39))throw Error('Invalid arguments.');
  // Restrict dialog controls to controls currently displayed by the authoritative engine.
  if(!['roll','endTurn','bail','useCard','bankrupt','details','tradeDialog'].includes(d.name)&&!snap.modal.includes(d.name+'('))throw Error('That control is unavailable.');
  if(snap.pending&&['roll','endTurn','bail','useCard','bankrupt','details','tradeDialog','closeModal'].includes(d.name))throw Error('Finish the property purchase or auction first.');
  if(d.name==='acceptTrade'&&!snap.modal.includes('acceptTrade()'))return;
  if(d.name==='tradeDialog'&&snap.modal.includes('acceptTrade()'))return;
  if(args.length&& !['details'].includes(d.name)&&!snap.modal.includes(d.name+'('+args[0]+')'))throw Error('That target is unavailable.');
  const inputs=d.inputs&&typeof d.inputs==='object'?d.inputs:{};
  r.engine.bridge.act(d.name,args,inputs);r.rev++;for(let notice of r.engine.notices.splice(0))send(ws,{type:'error',message:notice});broadcast(r);
 }
 }catch(e){send(ws,{type:'error',message:e.message||'Action failed.'})}});
 ws.on('close',()=>{if(r&&r.players[me]?.ws===ws){r.players[me].ws=null;broadcast(r)}});
});
setInterval(()=>{for(const [code,r] of rooms)if(Date.now()-r.touched>24*60*60*1000&&!r.players.some(x=>x.ws?.readyState===1)){r.engine?.dom.window.close();rooms.delete(code)}},60000).unref();
server.listen(Number(process.env.PORT||3000),'0.0.0.0',()=>console.log('Monopoly server ready'));
