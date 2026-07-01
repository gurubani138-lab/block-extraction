(() => {
'use strict';
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const canvas=$('#view'), ctx=canvas.getContext('2d',{alpha:false});
const mapCanvas=$('#mapCanvas'), mctx=mapCanvas.getContext('2d');
const W=24,H=24,FOV=Math.PI/3,MAX_DEPTH=22;
const palette={1:[52,62,55],2:[89,69,40],3:[31,80,70],4:[91,48,35],5:[58,64,71],6:[93,91,40]};
let state='menu', raf=0,last=0, keys={},mouseDown=false, audio=null;
let game;
const lootDefs=[['黑石碎片',80,'普通'],['机械零件',140,'优良'],['旧文明电池',220,'稀有'],['研究数据',310,'稀有'],['祭祀金片',480,'史诗']];
function loadProfile(){try{return JSON.parse(localStorage.getItem('blockExtraction'))||{credits:0,best:0,extracts:0}}catch{return{credits:0,best:0,extracts:0}}}
let profile=loadProfile();
function saveProfile(){localStorage.setItem('blockExtraction',JSON.stringify(profile));updateProfile()}
function updateProfile(){$('#credits').textContent=profile.credits.toLocaleString();$('#bestValue').textContent=profile.best.toLocaleString();$('#extracts').textContent=profile.extracts}
function show(id){$$('.screen').forEach(x=>x.classList.remove('active'));$(id).classList.add('active');state=id.slice(1)}
function generateMap(){
 const m=Array.from({length:H},(_,y)=>Array.from({length:W},(_,x)=>x===0||y===0||x===W-1||y===H-1?1:0));
 const walls=[[5,1,5,9,1],[5,11,5,21,1],[10,3,10,16,2],[10,18,10,22,2],[15,1,15,7,1],[15,9,15,19,1],[19,4,19,14,5],[19,16,19,22,5],[2,7,4,7,2],[6,7,9,7,2],[11,12,14,12,3],[16,12,18,12,3],[20,12,22,12,3],[2,17,9,17,1],[11,20,18,20,4],[18,16,22,16,4]];
 walls.forEach(([x1,y1,x2,y2,t])=>{for(let y=y1;y<=y2;y++)for(let x=x1;x<=x2;x++)m[y][x]=t});
 [[5,5],[5,14],[10,8],[10,19],[15,8],[19,15]].forEach(([x,y])=>m[y][x]=6);
 return m;
}
function initGame(){
 game={map:generateMap(),p:{x:2.5,y:2.5,a:.15,hp:100,armor:50,stamina:100,ammo:18,reserve:72,weapon:1,tool:'pick'},time:480,value:0,items:[],cores:0,kills:0,mined:0,shots:0,start:performance.now(),extraction:false,extractT:0,ended:false,stability:100,
 enemies:[{x:8.5,y:4.5,hp:50,t:'虫'},{x:13.5,y:6.5,hp:70,t:'傀儡'},{x:17.5,y:10.5,hp:60,t:'虫'},{x:13.5,y:15.5,hp:80,t:'傀儡'},{x:21.5,y:18.5,hp:100,t:'守卫'}],
 loot:[{x:3.5,y:5.5},{x:7.5,y:9.5},{x:12.5,y:4.5},{x:13.5,y:13.5},{x:17.5,y:14.5},{x:21.5,y:10.5},{x:17.5,y:22.0}],
 core:{x:21.5,y:21.5,taken:false},extract:{x:3.5,y:21.5},foam:[],cooldown:0,reload:0,walk:0};
 resize();show('#game');log('行动开始。升降机将在取得能源核心后启用。','good');banner('BLACKSTONE MINE // DEPTH 01');
 canvas.requestPointerLock?.();last=performance.now();cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);beep(180,.12,'sawtooth');
}
function resize(){canvas.width=Math.min(innerWidth,960);canvas.height=Math.min(innerHeight,540);ctx.imageSmoothingEnabled=false}
function solid(x,y){return !game||x<0||y<0||x>=W||y>=H||game.map[Math.floor(y)][Math.floor(x)]>0}
function cast(angle){let sin=Math.sin(angle),cos=Math.cos(angle),d=0,x,y,t=0,side=0;while(d<MAX_DEPTH){d+=.035;x=game.p.x+cos*d;y=game.p.y+sin*d;t=game.map[Math.floor(y)]?.[Math.floor(x)]||1;if(t){let fx=x-Math.floor(x),fy=y-Math.floor(y);side=(Math.min(fx,1-fx)<Math.min(fy,1-fy))?1:0;break}}return{d,x,y,t,side}}
function render(){
 const w=canvas.width,h=canvas.height;let sky=ctx.createLinearGradient(0,0,0,h/2);sky.addColorStop(0,'#07110f');sky.addColorStop(1,'#17221a');ctx.fillStyle=sky;ctx.fillRect(0,0,w,h/2);let floor=ctx.createLinearGradient(0,h/2,0,h);floor.addColorStop(0,'#182018');floor.addColorStop(1,'#050706');ctx.fillStyle=floor;ctx.fillRect(0,h/2,w,h/2);
 const strips=Math.min(400,w),sw=w/strips,z=[];for(let i=0;i<strips;i++){let a=game.p.a-FOV/2+(i/strips)*FOV,r=cast(a),d=r.d*Math.cos(a-game.p.a);z[i]=d;let wallH=Math.min(h*1.5,h/d),y=(h-wallH)/2;let c=palette[r.t]||palette[1],light=Math.max(.17,1-d/MAX_DEPTH)*(r.side?.72:1),noise=((Math.floor(r.x*7)+Math.floor(r.y*9))%3)*5;ctx.fillStyle=`rgb(${c.map(v=>Math.floor(v*light+noise)).join(',')})`;ctx.fillRect(i*sw,y,sw+1,wallH);if(r.t===6){ctx.fillStyle=`rgba(210,255,70,${Math.max(0,.6-d/20)})`;ctx.fillRect(i*sw,y,sw+1,Math.max(2,wallH*.035))}}
 renderSprites(z,strips,sw,w,h);renderWeapon(w,h);drawMap();
}
function renderSprites(z,strips,sw,w,h){
  const sprites=[];
  game.enemies.forEach(e=>e.hp>0&&sprites.push({...e,kind:'enemy'}));
  game.loot.forEach(l=>!l.taken&&sprites.push({...l,kind:'loot'}));
  if(!game.core.taken)sprites.push({...game.core,kind:'core'});
  sprites.push({...game.extract,kind:'extract'});
  sprites.sort((a,b)=>dist(b)-dist(a));
  for(const s of sprites){
    const dx=s.x-game.p.x,dy=s.y-game.p.y,d=Math.hypot(dx,dy);
    let a=Math.atan2(dy,dx)-game.p.a;
    while(a>Math.PI)a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2;
    if(Math.abs(a)>FOV*.7)continue;
    const size=Math.min(h*1.3,h/d*(s.kind==='enemy'?1.05:.55));
    const sx=w/2+(a/FOV)*w-size/2, strip=Math.floor((sx+size/2)/sw);
    if(z[strip]&&z[strip]<d)continue;
    const sy=h/2-size/2+(s.kind==='loot'?size*.3:0);
    if(s.kind==='enemy'){
      ctx.fillStyle=s.hp>85?'#be5944':s.hp>65?'#6e8877':'#779c47';
      ctx.fillRect(sx+size*.18,sy+size*.18,size*.64,size*.7);
      ctx.fillStyle='#131a15';ctx.fillRect(sx+size*.28,sy+size*.3,size*.12,size*.1);ctx.fillRect(sx+size*.6,sy+size*.3,size*.12,size*.1);
      ctx.fillStyle='#d8ff4d';ctx.fillRect(sx+size*.31,sy+size*.32,size*.05,size*.04);ctx.fillRect(sx+size*.63,sy+size*.32,size*.05,size*.04);
      ctx.fillStyle='#1a211b';ctx.fillRect(sx+size*.08,sy+size*.72,size*.84,size*.12);
    }else if(s.kind==='loot'){
      ctx.fillStyle='#d6a744';ctx.fillRect(sx,sy,size,size*.58);ctx.fillStyle='#ffe083';ctx.fillRect(sx+size*.08,sy+size*.1,size*.84,size*.08);
    }else if(s.kind==='core'){
      ctx.shadowBlur=25;ctx.shadowColor='#72f5e4';ctx.fillStyle='#5affea';ctx.fillRect(sx+size*.2,sy,size*.6,size);ctx.fillStyle='#d5fff9';ctx.fillRect(sx+size*.35,sy+size*.15,size*.3,size*.7);ctx.shadowBlur=0;
    }else{
      ctx.strokeStyle=game.cores?'#caff45':'#657069';ctx.lineWidth=Math.max(2,size*.07);ctx.strokeRect(sx,sy,size,size);ctx.fillStyle=game.cores?'rgba(202,255,69,.2)':'rgba(90,100,94,.1)';ctx.fillRect(sx,sy,size,size);
    }
  }
}
function renderWeapon(w,h){let bob=Math.sin(game.walk)*4;ctx.fillStyle='#1a2420';ctx.fillRect(w*.56,h*.78+bob,w*.28,h*.13);ctx.fillStyle=game.p.weapon===1?'#67846e':'#6f5941';ctx.fillRect(w*.62,h*.70+bob,w*.24,h*.12);ctx.fillStyle='#252f29';ctx.fillRect(w*.72,h*.67+bob,w*.05,h*.05);if(mouseDown&&game.cooldown>.1){ctx.fillStyle='rgba(255,223,123,.8)';ctx.beginPath();ctx.moveTo(w*.85,h*.72);ctx.lineTo(w*.94,h*.67);ctx.lineTo(w*.91,h*.77);ctx.fill()}}
function drawMap(){let s=180/W;mctx.clearRect(0,0,180,180);mctx.save();mctx.translate(90,90);mctx.rotate(-game.p.a-Math.PI/4);mctx.translate(-game.p.x*s,-game.p.y*s);for(let y=0;y<H;y++)for(let x=0;x<W;x++){let t=game.map[y][x];mctx.fillStyle=t?`rgba(${(palette[t]||palette[1]).join(',')},.65)`:'rgba(25,38,31,.35)';mctx.fillRect(x*s,y*s,s-1,s-1)}mctx.fillStyle='#caff45';mctx.fillRect(game.extract.x*s-2,game.extract.y*s-2,5,5);if(!game.core.taken){mctx.fillStyle='#42e8d5';mctx.fillRect(game.core.x*s-2,game.core.y*s-2,5,5)}mctx.restore();mctx.fillStyle='#fff';mctx.beginPath();mctx.moveTo(90,84);mctx.lineTo(86,94);mctx.lineTo(94,94);mctx.fill()}
function dist(o){return Math.hypot(o.x-game.p.x,o.y-game.p.y)}
function update(dt){if(game.ended)return;let p=game.p;game.time-=dt;game.cooldown=Math.max(0,game.cooldown-dt);if(game.reload>0){game.reload-=dt;if(game.reload<=0){let n=Math.min(18-p.ammo,p.reserve);p.ammo+=n;p.reserve-=n;log('换弹完成')}}if(game.time<=0)return end(false,'遗迹坍塌','未能及时撤离');
 let speed=2.5, moving=false;if(keys.ShiftLeft&&p.stamina>0){speed=3.8;p.stamina-=dt*22}else p.stamina=Math.min(100,p.stamina+dt*14);let dx=0,dy=0;if(keys.KeyW){dx+=Math.cos(p.a);dy+=Math.sin(p.a);moving=true}if(keys.KeyS){dx-=Math.cos(p.a);dy-=Math.sin(p.a);moving=true}if(keys.KeyA){dx+=Math.cos(p.a-Math.PI/2);dy+=Math.sin(p.a-Math.PI/2);moving=true}if(keys.KeyD){dx+=Math.cos(p.a+Math.PI/2);dy+=Math.sin(p.a+Math.PI/2);moving=true}let len=Math.hypot(dx,dy)||1,nx=p.x+dx/len*speed*dt,ny=p.y+dy/len*speed*dt;if(!solid(nx,p.y))p.x=nx;if(!solid(p.x,ny))p.y=ny;if(moving)game.walk+=dt*speed*5;
 if(mouseDown)shoot();updateEnemies(dt);interaction();if(game.extraction){game.extractT+=dt;if(game.extractT>=6)end(true,'成功撤离','战利品已转入地表仓库')}game.stability=Math.max(0,game.time/480*100);updateHUD();}
function updateEnemies(dt){for(const e of game.enemies){if(e.hp<=0)continue;let d=dist(e);if(d<7){let a=Math.atan2(game.p.y-e.y,game.p.x-e.x),sp=e.t==='虫'?1.25:.75,nx=e.x+Math.cos(a)*sp*dt,ny=e.y+Math.sin(a)*sp*dt;if(!solid(nx,e.y))e.x=nx;if(!solid(e.x,ny))e.y=ny;if(d<.75&&(!e.hit||performance.now()-e.hit>850)){e.hit=performance.now();damage(e.t==='守卫'?18:e.t==='傀儡'?12:8)}}}}
function shoot(){let p=game.p;if(game.cooldown||game.reload>0)return;if(p.ammo<=0){beep(90,.05);game.cooldown=.3;return}p.ammo--;game.shots++;game.cooldown=p.weapon===1?.16:.65;beep(p.weapon===1?105:65,.05,'square');let best=null,ba=.1;for(const e of game.enemies){if(e.hp<=0)continue;let a=Math.atan2(e.y-p.y,e.x-p.x)-p.a;while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;if(Math.abs(a)<ba&&dist(e)<cast(p.a).d){best=e;ba=Math.abs(a)}}if(best){best.hp-=p.weapon===1?24:48;beep(260,.035);if(best.hp<=0){game.kills++;log(`已消灭 ${best.t}`,'good')}}}
function interaction(){let near=[...game.loot.filter(x=>!x.taken).map(x=>({...x,type:'loot'})),...(!game.core.taken?[{...game.core,type:'core'}]:[]),{...game.extract,type:'extract'}].sort((a,b)=>dist(a)-dist(b))[0];let wall=cast(game.p.a);let text='';if(near&&dist(near)<1.3){if(near.type==='loot')text='<b>E</b> 搜索物资箱';if(near.type==='core')text='<b>E</b> 获取能源核心（将暴露信号）';if(near.type==='extract')text=game.cores?'<b>E</b> 启动升降机 · 坚守 6 秒':'需要能源核心才能启动'}else if(wall.d<1.25&&[2,3,6].includes(wall.t))text=game.p.tool==='pick'?'<b>Q</b> 挖掘可破坏方块':'<b>Q</b> 放置泡沫块';$('#prompt').innerHTML=text;$('#prompt').classList.toggle('show',!!text)}
function use(){if(state!=='game'||$('#pause').classList.contains('show'))return;let near=game.loot.filter(x=>!x.taken).sort((a,b)=>dist(a)-dist(b))[0];if(near&&dist(near)<1.3){if(game.items.length>=8)return log('背包已满','bad');near.taken=true;let d=lootDefs[Math.floor(Math.random()*lootDefs.length)];game.items.push({name:d[0],value:d[1],rarity:d[2]});game.value+=d[1];log(`获得 ${d[0]} · ₵${d[1]}`,'good');beep(520,.12);return}if(!game.core.taken&&dist(game.core)<1.3){game.core.taken=true;game.cores=1;game.value+=1200;game.items.push({name:'深层能源核心',value:1200,rarity:'传说'});banner('警告：核心信号已暴露');log('升降机撤离点已启用','good');return}if(dist(game.extract)<1.3&&game.cores){game.extraction=true;game.extractT=0;banner('撤离引导开始 // 坚守 6 秒');beep(400,.3,'sawtooth')}}
function tool(){let r=cast(game.p.a);if(game.p.tool==='pick'&&r.d<1.35&&[2,3,6].includes(r.t)){let x=Math.floor(r.x),y=Math.floor(r.y);game.map[y][x]=0;game.mined++;game.stability=Math.max(0,game.stability-3);log('已挖开结构 · 噪音正在传播');beep(75,.13,'square')}else if(game.p.tool==='foam'){let x=Math.floor(game.p.x+Math.cos(game.p.a)*1.2),y=Math.floor(game.p.y+Math.sin(game.p.a)*1.2);if(game.map[y]?.[x]===0){game.map[y][x]=3;game.foam.push({x,y,t:90});log('泡沫块已部署')}}}
function damage(n){let a=Math.min(game.p.armor,n*.6);game.p.armor-=a;game.p.hp-=n-a;$('#damageFlash').style.background='rgba(255,32,16,.34)';setTimeout(()=>$('#damageFlash').style.background='rgba(255,32,16,0)',100);beep(45,.13,'sawtooth');if(game.p.hp<=0)end(false,'探索者阵亡','安全口袋之外的物资已经遗失')}
function reload(){if(game.p.ammo<18&&game.p.reserve&&game.reload<=0){game.reload=1.35;log('正在换弹…')}}
function updateHUD(){let p=game.p;$('#timer').textContent=`${String(Math.max(0,Math.floor(game.time/60))).padStart(2,'0')}:${String(Math.max(0,Math.floor(game.time%60))).padStart(2,'0')}`;$('#timer').style.color=game.time<60?'var(--danger)':'';$('#hpText').textContent=Math.ceil(p.hp);$('#armorText').textContent=Math.ceil(p.armor);$('#hpBar').style.width=p.hp+'%';$('#armorBar').style.width=p.armor+'%';$('#staminaBar').style.width=p.stamina+'%';$('#ammo').textContent=p.ammo;$('#reserve').textContent=p.reserve;$('#value').textContent=game.value.toLocaleString();$('#items').textContent=game.items.length;$('#cores').textContent=game.cores;$('#weightBar').style.width=Math.min(100,game.items.length/8*100)+'%';$('#stabilityBar').style.width=game.stability+'%';let depth=game.p.x>18&&game.p.y>16?'深井核心':game.p.x>15?'黑石加工厂':game.p.y>11?'旧矿道':'地表装卸站';$('#zone').textContent=depth;$('#objective').textContent=game.extraction?`撤离引导 ${Math.ceil(6-game.extractT)} 秒`:game.cores?'前往西南升降机撤离':'取得深井能源核心'}
function log(t,type=''){let d=document.createElement('div');d.className='log-item '+type;d.textContent=t;$('#log').prepend(d);setTimeout(()=>d.remove(),5000)}
function banner(t){$('#eventBanner').textContent=t;$('#eventBanner').classList.add('show');setTimeout(()=>$('#eventBanner').classList.remove('show'),2800)}
function beep(freq,dur,type='sine'){try{audio ||= new (AudioContext||webkitAudioContext)();let o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(.055,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+dur);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+dur)}catch{}}
function end(success,title,sub){if(game.ended)return;game.ended=true;document.exitPointerLock?.();let retained=success?game.value:Math.min(220,game.value);if(success){profile.credits+=game.value;profile.best=Math.max(profile.best,game.value);profile.extracts++}else profile.credits+=retained;saveProfile();$('#resultLabel').textContent=success?'EXTRACTION CONFIRMED':'EXPEDITION FAILED';$('#resultTitle').textContent=title;$('#resultTitle').style.color=success?'var(--acid)':'var(--danger)';$('#resultSub').textContent=sub;$('#resultValue').textContent=retained.toLocaleString();$('#resultStats').innerHTML=`<div><small>深入区域</small><b>${game.p.x>18?4:game.p.x>15?3:2}</b></div><div><small>消灭威胁</small><b>${game.kills}</b></div><div><small>地形改造</small><b>${game.mined}</b></div><div><small>行动时间</small><b>${Math.floor((480-game.time)/60)}:${String(Math.floor((480-game.time)%60)).padStart(2,'0')}</b></div>`;$('#lootList').innerHTML=game.items.slice(0,8).map(x=>`<span class="loot-chip">${x.name}</span>`).join('')||'<span class="loot-chip">无带出物</span>';setTimeout(()=>show('#result'),500)}
function loop(now){if(state!=='game')return;let dt=Math.min(.035,(now-last)/1000);last=now;if(!$('#pause').classList.contains('show'))update(dt);render();raf=requestAnimationFrame(loop)}
document.addEventListener('keydown',e=>{keys[e.code]=true;if(e.code==='KeyE')use();if(e.code==='KeyQ')tool();if(e.code==='KeyR')reload();if(e.code==='Digit1'){game.p.weapon=1;$('#weaponName').textContent='废土步枪';$('#weaponIcon').textContent='⌁'}if(e.code==='Digit2'){game.p.weapon=2;$('#weaponName').textContent='矿工霰弹枪';$('#weaponIcon').textContent='⌐'}if(e.code==='KeyF'){game.p.tool=game.p.tool==='pick'?'foam':'pick';log(game.p.tool==='pick'?'工具：矿镐':'工具：泡沫建造器')}if(e.code==='Escape'&&state==='game')$('#pause').classList.toggle('show')});document.addEventListener('keyup',e=>keys[e.code]=false);document.addEventListener('mousemove',e=>{if(state==='game'&&document.pointerLockElement===canvas&&!$('#pause').classList.contains('show'))game.p.a+=e.movementX*.0025});document.addEventListener('mousedown',e=>{if(e.button===0&&state==='game'){mouseDown=true;canvas.requestPointerLock?.()}});document.addEventListener('mouseup',()=>mouseDown=false);canvas.addEventListener('click',()=>canvas.requestPointerLock?.());window.addEventListener('resize',resize);
$('#startBtn').onclick=initGame;$('#againBtn').onclick=initGame;$('#homeBtn').onclick=()=>show('#menu');$('#resumeBtn').onclick=()=>{$('#pause').classList.remove('show');canvas.requestPointerLock?.()};$('#quitBtn').onclick=()=>end(false,'主动撤离失败','本次行动已放弃');$('#resetBtn').onclick=()=>{if(confirm('确定清除全部本地行动记录？')){localStorage.removeItem('blockExtraction');profile={credits:0,best:0,extracts:0};updateProfile()}};
updateProfile();
})();
