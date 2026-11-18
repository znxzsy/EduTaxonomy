const records = JSON.parse(document.getElementById("data").textContent);
const $ = id => document.getElementById(id);
const canvas = $("surface"), ctx = canvas.getContext("2d");
const worldWidth = 1420, fields = {D1: "学段／学科／课程", D2: "大题型／知识模块", D3: "细分题型／主题", D4: "原子知识点", D6: "题面与作答特征"};
const font = 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
const nums = value => value.toLocaleString("zh-CN");
const nodes = new Map(Object.entries(records).map(([id,r])=>[id,{id,r,level:r[0],name:r[1]}]));
const distinct = values => [...new Set(values.filter(Boolean))];
function group(items, key){
  const map = new Map();
  for (const item of items){
    const value = key(item);
    if (!map.has(value)) map.set(value,[]);
    map.get(value).push(item);
  }
  return map;
}
const byLevel=group(nodes.values(),n=>n.level);
const entrances=byLevel.get("D1").filter(n=>n.r[2]!=="学段");
const stages=byLevel.get("D1").filter(n=>n.r[2]==="学段");
const byEntrance = Object.fromEntries(["D2","D3","D4"].map(level=>[level,group(byLevel.get(level),n=>n.r[2])]));
const d3Primary = group(byLevel.get("D3"),n=>n.r[4][0]);
const facets = group(byLevel.get("D6"),n=>n.r[2]);
const D3byParent=group(byLevel.get("D3").flatMap(n=>n.r[4].map(id=>[id,n])),r=>r[0]);
const D4byTopic=group(byLevel.get("D4").flatMap(n=>n.r[5].map(id=>[id,n])),r=>r[0]);
const successor=group(byLevel.get("D4").flatMap(n=>n.r[7].map(id=>[id,n])),r=>r[0]);
const d6Children = group(byLevel.get("D6"),n=>n.r[3]);
const stageChildren=group(entrances.flatMap(n=>n.r[3].map(id=>[id,n])),r=>r[0]);

const box = (node,x,y,w,h) => Object.assign(node,{x:x+w/2,y:y+h/2,w,h});
const bands = [];
const levelCols = {left:23, taxonomy:221, knowledge:939, right:1396};
const dotsPer = width => Math.max(1,Math.floor((width-17)/10.5));
function putDots(items, x, y, width){
  const per = dotsPer(width);
  items.forEach((node,i)=>Object.assign(node,{x:x+12+i%per*10.5,y:y+Math.floor(i/per)*11,w:0,h:0}));
}
function pack(inputs,x,y,width,columns){
  const gap=9, colWidth=(width-gap*(columns-1))/columns, laneY=Array(columns).fill(y);
  const tiles=[];
  for (const tile of inputs){
    const i=laneY.indexOf(Math.min(...laneY)), h=32+Math.ceil(tile.dots.length/dotsPer(colWidth))*11;
    const tx=x+(colWidth+gap)*i, ty=laneY[i];
    if(tile.node) box(tile.node,tx,ty,colWidth,24);
    putDots(tile.dots,tx,ty+30,colWidth);
    tiles.push({...tile,x:tx,y:ty,w:colWidth,h});
    laneY[i]=ty+h+gap;
  }
  return {tiles,end:Math.max(...laneY)};
}
stages.forEach((stage,i)=>box(stage,221+i*293,14,278,48));
let height=112;
for(const entry of entrances){
  const [m,t,k]=["D2","D3","D4"].map(level=>byEntrance[level].get(entry.id)||[]);
  const taxonomy=pack(m.map(node=>({node,title:node.name,dots:d3Primary.get(node.id)||[],kind:"taxonomy"})),221,height+18,687,3);
  const domains=group(k,node=>node.r[4][0]||"未标注知识域");
  const knowledge=pack([...domains].sort((a,b)=>b[1].length-a[1].length).map(([title,dots])=>({title,dots,kind:"knowledge"})),939,height+18,457,2);
  const h=Math.max(110,taxonomy.end-height+11,knowledge.end-height+11);
  box(entry,23,height+20,167,65);
  bands.push({entry,y:height,h,tiles:[...taxonomy.tiles,...knowledge.tiles],m:m.length,t:t.length,k:k.length});
  height+=h;
}
const d6Top=height+19;
const featureLayout=pack([...facets].map(([title,dots])=>({title,dots,kind:"features"})),221,d6Top+25,1175,4);
bands.push({entry:null,y:d6Top,h:featureLayout.end-d6Top+15,tiles:featureLayout.tiles});
height=bands.at(-1).y+bands.at(-1).h+18;
if([...nodes.values()].some(n=>!Number.isFinite(n.x)||!Number.isFinite(n.y))){
  throw new Error("字典中存在未绘制的节点");
}
function folder(id,name,level,owner,children){
  return {id,name,level,owner,children,isFolder:true};
}
const facetFolders=[...facets].map(([name,items],i)=>folder("VIEW-D6-"+i,name,"D6","VIEW-D6",items));
const d6Folder=folder("VIEW-D6","D6 题面与作答特征","D6","",facetFolders);
const domainsBySubject=new Map(entrances.map(entry=>[
  entry.id,[...group(byEntrance.D4.get(entry.id)||[],n=>n.r[4][0]||"未标注知识域")]
    .sort((a,b)=>b[1].length-a[1].length)
    .map(([name,items],i)=>folder(entry.id+"-DOMAIN-"+i,name,"D4",entry.id,items)),
]));
const allByID=new Map([...nodes,...[d6Folder,...facetFolders,...[...domainsBySubject.values()].flat()].map(node=>[node.id,node])]);
for(const band of bands){
  const folders=band.entry?domainsBySubject.get(band.entry.id):facetFolders;
  for(const tile of band.tiles)if(!tile.node)tile.folder=folders.find(folder=>folder.name===tile.title);
}
const expandRows = rows => (rows||[]).map(([,n])=>n.id);
function relations(node){
  const {level,r,id}=node;
  if(node.isFolder){
    const childLabel=node===d6Folder?"D6 八个维度":level==="D4"?"D4 知识点":"D6 作答标签";
    return [[childLabel,node.children.map(peer=>peer.id)],["所属分组",node.owner?[node.owner]:[]]];
  }
  if(level==="D1")return r[2]==="学段"
    ? [["适用学科或课程",expandRows(stageChildren.get(id))]]
    : [["适用学段",r[3]],["D2 模块", (byEntrance.D2.get(id)||[]).map(n=>n.id)],["D4 知识点", (byEntrance.D4.get(id)||[]).map(n=>n.id)]];
  if(level==="D2")return [["所属学科或课程",[r[2]]],["D3 题型或主题",expandRows(D3byParent.get(id))]];
  if(level==="D3")return [["允许的 D2 父级",r[4]],["关联的 D4 知识点",expandRows(D4byTopic.get(id))]];
  if(level==="D4")return [["所属学科或课程",[r[2]]],["关联的 D3",r[5]],["前置知识点",r[7]],["后续知识点",expandRows(successor.get(id))],["关联知识点",r[8]]];
  return [["父级标签",r[3]?[r[3]]:[]],["细分标签",(d6Children.get(id)||[]).map(n=>n.id)]];
}
function describe(node){
  const {level,r}=node;
  if(node.isFolder)return [level==="D4"?"D4 知识域":"D6 作答分类"];
  if(level==="D1")return [r[4],r[5]];
  if(level==="D2")return [r[3].join(" · "),r[4],r[5],r[6]];
  if(level==="D3")return [r[3].join(" · "),r[6]];
  if(level==="D4")return [r[3].join(" · "),r[4].join(" · "),r[6]];
  return [r[2],r[4],r[5],r[6],r[7]];
}
let width=0, viewHeight=0, scale=1, ox=0, oy=0, frame=0, active=null, hovered=null, fit=1;
let branch=null, stageScope="", trail=[];
const steps=[];
const pixel=()=>Math.min(window.devicePixelRatio||1,2);
const minScale=()=>branch?Math.min(1,width/branch.w)*.75:Math.min(fit,width/worldWidth)*.74;
function clamp(){
  const sw=(branch?.w||worldWidth)*scale, sh=(branch?.h||height)*scale;
  ox=sw>width?Math.max(width-sw-20,Math.min(20,ox)):(width-sw)/2;
  oy=sh>viewHeight?Math.max(viewHeight-sh-15,Math.min(15,oy)):branch?0:Math.max(0,(viewHeight-sh)/2);
}
function schedule(){if(!frame)frame=requestAnimationFrame(draw);}
function reset(){
  scale=fit;ox=0;oy=0;clamp();schedule();
}
function resize(){
  const oldHeight=viewHeight, oldWidth=width, oldFit=fit, dpr=pixel();
  width=canvas.clientWidth;viewHeight=canvas.clientHeight;
  canvas.width=Math.round(width*dpr);canvas.height=Math.round(viewHeight*dpr);
  fit=Math.max(.61,width/worldWidth);
  if(branch){showBranch(active);return;}
  if(!oldHeight)reset();
  else {
    const cx=(oldWidth/2-ox)/scale,cy=(oldHeight/2-oy)/scale;
    if(Math.abs(scale-oldFit)<.015)scale=fit;
    ox=width/2-cx*scale;oy=viewHeight/2-cy*scale;clamp();schedule();
  }
}
function zoom(factor,x=width/2,y=viewHeight/2){
  const next=Math.min(4.5,Math.max(minScale(),scale*factor));
  ox=x-(x-ox)*next/scale;oy=y-(y-oy)*next/scale;scale=next;clamp();schedule();
}
const colors={
  ink:"#294459", muted:"#557084", line:"#dce7ee", edge:"#a3b9ce",
  taxonomy:["#edf4fb","#f4f8fc","#4d77ad"], knowledge:["#fbf1e2","#fdf8ef","#b67e41"], features:["#eaf2f4","#f3f8f9","#588492"]
};
const levelColor={D1:"#335e8a",D2:"#426e9c",D3:"#4d77ad",D4:"#b67e41",D6:"#588492"};
function rect(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
function line(x,y,x2,y2,color,width=1){
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke();
}
function txt(value,x,y,size,color=colors.ink,weight=500,maxWidth,align="left"){
  ctx.textAlign=align;ctx.textBaseline="alphabetic";ctx.fillStyle=color;ctx.font=`${weight} ${size}px ${font}`;
  if(maxWidth && ctx.measureText(value).width>maxWidth){
    while(value.length>1 && ctx.measureText(value+"…").width>maxWidth)value=value.slice(0,-1);
    value+="…";
  }
  ctx.fillText(value,x,y);
}
const left=n=>n.x-n.w/2, nodeTop=n=>n.y-n.h/2;
function renderStage(n){
  const x=left(n),y=nodeTop(n);
  rect(x,y,n.w,n.h,"#eaf2fa");rect(x,y,3,n.h,"#759ac4");
  txt(n.name,x+12,y+21,15,colors.ink,720,n.w-24);
  txt(n.r[4],x+12,y+36,11,colors.muted,500,n.w-24);
}
function renderEntrance(band){
  const {entry,m,t,k}=band;
  const x=left(entry),y=nodeTop(entry), w=entry.w;
  rect(x,y,w,entry.h,"#edf3f9");rect(x,y,3,entry.h,"#7e9fbe");
  if(scale>.45){
    txt(entry.name,x+11,y+23,15,colors.ink,730,w-18);
    const scope=entry.r[3].map(id=>allByID.get(id).name.replace("普通","")).join("  ·  ");
    txt(scope,x+11,y+41,11,colors.muted,550,w-18);
    txt(m+t+k?`${m} / ${nums(t)} / ${nums(k)}`:"映射入口",x+11,y+56,10,colors.muted,550,w-18);
  }
  if(!m&&!k&&scale>.44)txt(entry.r[5]||"按学科映射",221,y+30,13,colors.muted,550,960);
}
function renderTile(tile, minY, maxY, minX, maxX){
  if(tile.y+tile.h<minY||tile.y>maxY||tile.x+tile.w<minX||tile.x>maxX)return;
  const [header,body,dotColor]=colors[tile.kind];
  rect(tile.x,tile.y,tile.w,tile.h,body);
  rect(tile.x,tile.y,tile.w,23,header);
  if(hovered&&(hovered===tile.node||hovered===tile.folder)){
    ctx.strokeStyle=dotColor;ctx.lineWidth=1.1;
    ctx.strokeRect(tile.x+.5,tile.y+.5,tile.w-1,tile.h-1);
  }
  if(scale>.43){
    const count=String(tile.dots.length);
    txt(tile.title,tile.x+9,tile.y+16,12,tile.kind==="knowledge"?"#79501f":colors.ink,660,tile.w-42);
    txt(count,tile.x+tile.w-8,tile.y+16,10,colors.muted,590,25,"right");
  }
  ctx.beginPath();ctx.fillStyle=dotColor;
  const radius=Math.max(2.55,.69/scale);
  for(const dot of tile.dots){
    if(dot.y<minY||dot.y>maxY||dot.x<minX||dot.x>maxX)continue;
    ctx.moveTo(dot.x+radius,dot.y);ctx.arc(dot.x,dot.y,radius,0,Math.PI*2);
  }
  ctx.fill();
}
function halo(node,color){
  ctx.strokeStyle=color;ctx.lineWidth=Math.max(1.2,1.7/scale);
  if(node.w){ctx.strokeRect(left(node)+.5,nodeTop(node)+.5,node.w-1,node.h-1);return;}
  ctx.beginPath();ctx.arc(node.x,node.y,Math.max(4.5,5.5/scale),0,Math.PI*2);ctx.stroke();
}
function drawRelations(){
  if(!active)return;
  halo(active,"#244966");
  if(!active.w&&scale>.65){
    ctx.font=`650 11px ${font}`;
    const w=Math.min(200,ctx.measureText(active.name).width+15);
    const x=Math.max(2,Math.min(active.x+8,worldWidth-w-3)), y=Math.max(2,active.y-25);
    rect(x,y,w,19,"#244966");
    txt(active.name,x+7,y+13,11,"#fff",650,w-12);
  }
}
function compactDot(point,radius=1.65){
  ctx.fillStyle=levelColor[point.node.level];
  ctx.beginPath();ctx.arc(point.x,point.y,radius,0,Math.PI*2);ctx.fill();
}
function draw(){
  frame=0;const dpr=pixel();
  ctx.setTransform(dpr,0,0,dpr,0,0);
  rect(0,0,width,viewHeight,"#f7fafc");
  ctx.translate(ox,oy);ctx.scale(scale,scale);
  $("scale").textContent=Math.round(scale*100)+"%";
  drawMini();
  const minX=-ox/scale-6,maxX=(width-ox)/scale+6,minY=-oy/scale-6,maxY=(viewHeight-oy)/scale+6;
  if(branch){drawBranch(minX,maxX,minY,maxY);return;}
  rect(0,0,worldWidth,height,"#fff");
  if(minY<112){
    rect(0,0,worldWidth,76,"#f3f7fb");
    if(scale>.38)txt("D1 学段",23,43,14,colors.ink,720);
    for(const stage of stages)renderStage(stage);
    rect(0,76,worldWidth,36,"#edf3f8");
    if(scale>.38){
      txt("D1 学科／课程",23,99,13,colors.ink,720);
      txt("D2 模块",221,99,13,colors.ink,720);
      txt("每个蓝点是一个 D3 题型或主题",311,99,11,colors.muted);
      txt("D4 知识点",939,99,13,"#79501f",720);
      txt("每个金点是一个知识点",1033,99,11,colors.muted);
    }
  }
  for(const [index,band] of bands.entries()){
    if(band.y+band.h<minY||band.y>maxY)continue;
    if(index%2)rect(0,band.y,worldWidth,band.h,"#f8fafc");
    line(0,band.y,worldWidth,band.y,colors.line);
    if(band.entry){
      line(923,band.y+10,923,band.y+band.h-10,colors.line);
      renderEntrance(band);
    }else{
      rect(23,band.y+25,167,74,"#edf3f5");
      if(scale>.40){
        txt("D6 题面与作答",34,band.y+50,15,"#3d6472",730);
        txt("8 个维度 · 191 个标签",34,band.y+70,11,colors.muted,580);
      }
    }
    for(const tile of band.tiles)renderTile(tile,minY,maxY,minX,maxX);
  }
  drawRelations();
  if(hovered && hovered!==active && !hovered.isFolder)halo(hovered,levelColor[hovered.level]);
}
function hit(x,y){
  const wx=(x-ox)/scale,wy=(y-oy)/scale;
  if(branch){
    const contains=p=>wx>=p.x&&wx<p.x+p.w&&wy>=p.y&&wy<p.y+p.h;
    const group=branch.groups.find(contains);
    const tile=group?.tiles.find(contains);
    if(tile){
      const point=tile.dots.find(p=>(p.x-wx)**2+(p.y-wy)**2<27);
      return point?.node||tile.node;
    }
    return group?.points.find(contains)?.node||null;
  }
  if(scale<.17)return null;
  const band=bands.find(row=>wy>=row.y&&wy<row.y+row.h);
  const isBox = n => n && Math.abs(wx-n.x)<=n.w/2 && Math.abs(wy-n.y)<=n.h/2;
  if(wy<76)return stages.find(isBox)||null;
  if(!band)return null;
  if(isBox(band.entry))return band.entry;
  if(!band.entry&&wx>=23&&wx<=190&&wy>=band.y+25&&wy<=band.y+99)return d6Folder;
  const tile=band.tiles.find(t=>wx>=t.x-3 && wx<t.x+t.w+3 && wy>=t.y && wy<t.y+t.h);
  if(!tile)return null;
  if(isBox(tile.node))return tile.node;
  if(wy<tile.y+23&&tile.folder)return tile.folder;
  const radius=Math.min(7,Math.max(4.7,3.7/scale));
  let nearest=null,best=radius**2;
  for(const n of tile.dots){
    const d=(n.x-wx)**2+(n.y-wy)**2;
    if(d<best){nearest=n;best=d;}
  }
  return nearest;
}
function label(tag,text,className=""){
  const element=document.createElement(tag);
  element.textContent=text;
  if(className)element.className=className;
  return element;
}
const branchQuery=$("branch-query"), mini=$("mini"), miniCtx=mini.getContext("2d");
function drawMini(){
  $("minimap").hidden=Boolean(branch)||scale<=fit*1.14;
  if($("minimap").hidden)return;
  const w=mini.clientWidth,h=mini.clientHeight,dpr=pixel();
  if(!w||!h)return;
  if(mini.width!==Math.round(w*dpr)||mini.height!==Math.round(h*dpr)){
    mini.width=Math.round(w*dpr);mini.height=Math.round(h*dpr);
  }
  miniCtx.setTransform(dpr,0,0,dpr,0,0);miniCtx.fillStyle="#f5f9fc";miniCtx.fillRect(0,0,w,h);
  const sx=(w-12)/worldWidth,sy=(h-12)/height;
  for(const band of bands){
    const y=6+band.y*sy,bh=Math.max(1.2,band.h*sy-1);
    if(band.entry){
      miniCtx.fillStyle="#b8cee1";miniCtx.fillRect(7,y,11,bh);
      if(band.t)miniCtx.fillRect(23,y,(w-30)*.55,bh);
      miniCtx.fillStyle="#ddbd94";
      if(band.k)miniCtx.fillRect(25+(w-30)*.55,y,(w-30)*.43,bh);
    }else{
      miniCtx.fillStyle="#85a6b3";miniCtx.fillRect(7,y,w-14,bh);
    }
  }
  const x=6+Math.max(0,-ox/scale)*sx,y=6+Math.max(0,-oy/scale)*sy;
  const vw=Math.max(3,Math.min(worldWidth,(width-Math.max(0,ox))/scale)*sx);
  const vh=Math.max(3,Math.min(height,(viewHeight-Math.max(0,oy))/scale)*sy);
  miniCtx.strokeStyle="#2d5b82";miniCtx.lineWidth=1.5;miniCtx.strokeRect(x,y,vw,vh);
}
let draggingMini=false;
function jumpMini(event){
  const rect=mini.getBoundingClientRect();
  ox=width/2-scale*worldWidth*Math.max(0,Math.min(1,(event.clientX-rect.left-6)/(rect.width-12)));
  oy=viewHeight/2-scale*height*Math.max(0,Math.min(1,(event.clientY-rect.top-6)/(rect.height-12)));
  clamp();schedule();
}
mini.addEventListener("pointerdown",e=>{draggingMini=true;mini.setPointerCapture(e.pointerId);jumpMini(e);});
mini.addEventListener("pointermove",e=>{if(draggingMini)jumpMini(e);});
mini.addEventListener("pointerup",()=>{draggingMini=false;});
mini.addEventListener("pointercancel",()=>{draggingMini=false;});
mini.addEventListener("keydown",e=>{
  if(e.key==="ArrowUp"||e.key==="ArrowDown"){e.preventDefault();oy+=(e.key==="ArrowUp"?1:-1)*viewHeight*.8;clamp();schedule();}
});
function snapshot(){return {active,branch,stageScope,trail:[...trail],scale,ox,oy,filter:branchQuery.value};}
function pushStep(){
  steps.push(snapshot());
  if(steps.length>100)steps.shift();
  $("back").disabled=false;
}
function restoreStep(index=steps.length-1){
  if(index<0)return;
  const state=steps[index];
  steps.splice(index);
  ({active,branch,stageScope,trail,scale,ox,oy}=state);
  $("back").disabled=!steps.length;
  branchQuery.value=state.filter;
  if(branch&&Math.abs(Math.min(worldWidth,Math.max(355,width))-branch.w)>25){showBranch(active);return;}
  $("branch-bar").hidden=!branch;
  if(branch){renderTrail(active);branchQuery.hidden=!branch.filterable;}
  hovered=null;$("tooltip").hidden=true;hideInspector();
  clamp();schedule();
}
$("back").addEventListener("click",()=>restoreStep());
function applies(node){
  return !stageScope||node.isFolder||!["D2","D3","D4"].includes(node.level)||node.r[3].includes(stageScope);
}
function branchRelations(node){
  return relations(node).map(([title,ids])=>[
    title,distinct(ids).filter(id=>!["D2 模块","D3 题型或主题","D4 知识点"].includes(title)||applies(allByID.get(id)))
  ]);
}
function renderTrail(node){
  const nav=$("trail");nav.replaceChildren();
  const home=label("button","全图");home.type="button";home.addEventListener("click",()=>{closeDetail();reset();});
  nav.append(home);
  for(const point of trail.slice(-6)){
    nav.append(label("span","›"));
    const historyIndex=steps.findLastIndex(s=>s.active?.id===point);
    const peer=allByID.get(point);
    if(point===node.id)nav.append(label("strong",peer.name));
    else{
      const link=label("button",peer.name);link.type="button";
      link.addEventListener("click",()=>historyIndex>=0?restoreStep(historyIndex):selectNode(peer,{keepScope:true}));
      nav.append(link);
    }
  }
}
function canonicalTrail(node){
  if(node.isFolder)return node.owner?[node.owner]:[];
  if(node.level==="D2")return [node.r[2]];
  if(node.level==="D3")return [node.r[2],node.r[4][0]].filter(Boolean);
  if(node.level==="D4")return [node.r[2]];
  return [];
}
function previewItems(node){
  if(node.isFolder)return node.children.filter(applies);
  if(node.level==="D1")return (byEntrance.D2.get(node.id)||[]).filter(applies);
  if(node.level==="D2")return expandRows(D3byParent.get(node.id)).map(id=>allByID.get(id)).filter(applies);
  return [];
}
function makeRegion(title,items,x,y,w,boxed,level,columnCount){
  const inset=7,gap=10,inner=w-inset*2;
  const columns=columnCount||Math.max(1,Math.floor((inner+gap)/(boxed?210:166)));
  const cell=(inner-gap*(columns-1))/columns;
  const points=[],tiles=[];
  let bottom=y+46;
  if(boxed){
    const rowStarts=Array(columns).fill(y+40);
    for(const node of items){
      const i=rowStarts.indexOf(Math.min(...rowStarts)), tx=x+inset+i*(cell+gap),ty=rowStarts[i];
      const children=previewItems(node), step=11.4, per=Math.max(1,Math.floor((cell-23)/step));
      const dots=children.map((peer,index)=>({node:peer,x:tx+14+index%per*step,y:ty+34+Math.floor(index/per)*step}));
      const h=Math.max(43,34+Math.ceil(dots.length/per)*step+4);
      tiles.push({node,x:tx,y:ty,w:cell,h,dots});
      rowStarts[i]=ty+h+gap;bottom=Math.max(bottom,ty+h);
    }
  }else{
    const rowHeight=59;
    items.forEach((node,i)=>points.push({
      node,x:x+inset+i%columns*(cell+gap),y:y+44+Math.floor(i/columns)*rowHeight,w:cell,h:48
    }));
    bottom=y+44+Math.ceil(points.length/columns)*rowHeight;
  }
  return {title,count:items.length,x,y,w,h:bottom-y+12,tiles,points,level};
}
function buildBranch(node){
  const w=Math.min(worldWidth,Math.max(355,width));
  const rail=w>=940;
  const xPad=rail?23:15, inset=rail?Math.round(w*.1556):xPad;
  const contentWidth=w-inset-xPad;
  const term=normalized(branchQuery.value);
  const matchesNode=peer=>!term||normalized(peer.name).includes(term)||(!peer.isFolder&&normalized(peer.id).includes(term));
  const matchesCard=peer=>matchesNode(peer)||previewItems(peer).some(matchesNode);
  const links=branchRelations(node).filter(([,ids])=>ids.length);
  const groups=[];
  let y=rail?18:91;
  if(node.level==="D1"&&node.r[2]!=="学段"){
    const modules=(byEntrance.D2.get(node.id)||[]).filter(applies).filter(matchesCard);
    const domains=(domainsBySubject.get(node.id)||[]).filter(domain=>previewItems(domain).length).filter(matchesCard);
    if(modules.length&&domains.length&&rail){
      const modulesWidth=Math.round((contentWidth-16)*.60);
      groups.push(makeRegion("D2 大题型／知识模块",modules,inset,y,modulesWidth,true,"D2",w>=1130?3:2));
      groups.push(makeRegion("D4 知识域",domains,inset+modulesWidth+16,y,contentWidth-modulesWidth-16,true,"D4",w>=1130?2:1));
      y=Math.max(...groups.map(g=>g.y+g.h))+16;
    }else{
      for(const [title,items,level] of [["D2 大题型／知识模块",modules,"D2"],["D4 知识域",domains,"D4"]]){
        if(!items.length)continue;
        const region=makeRegion(title,items,inset,y,contentWidth,true,level);
        groups.push(region);y+=region.h+14;
      }
    }
  }else{
    const incoming=/所属|适用学段|允许的|父级标签/;
    const ordered=[...links.filter(([title])=>!incoming.test(title)),...links.filter(([title])=>incoming.test(title))];
    for(const [title,ids] of ordered){
      const boxed=(node.level==="D1"&&node.r[2]==="学段")||node===d6Folder;
      const children=ids.map(id=>allByID.get(id)).filter(boxed?matchesCard:matchesNode);
      if(!children.length)continue;
      const name=title==="D3 题型或主题"?"D3 下一级题型与主题":title;
      const primary=boxed?node.level:children[0].level;
      const region=makeRegion(name,children,inset,y,contentWidth,boxed&&!incoming.test(title),primary);
      groups.push(region);y+=region.h+14;
    }
  }
  const science=node.id==="D1-SCI"&&!term;
  return {w,h:Math.max(265,y),node,groups,xPad,inset,rail,science,filterable:links.some(([title])=>title!=="适用学段")};
}
const toneFor=level=>level==="D4"?colors.knowledge:level==="D6"?colors.features:colors.taxonomy;
function railNotes(node){
  if(node.level==="D1"&&node.r[2]!=="学段"){
    const scope=stageScope||node.r[3].map(id=>allByID.get(id).name.replace("普通","")).join("  ·  ");
    const counts=["D2","D3","D4"].map(level=>(byEntrance[level].get(node.id)||[]).filter(applies).length);
    return [scope, counts.some(Boolean)?counts.map(nums).join(" / "):"映射入口"];
  }
  return [
    node.isFolder?describe(node)[0]:node.level+" "+fields[node.level],
    [node.isFolder?"":node.id,stageScope].filter(Boolean).join("  ·  "),
  ];
}
function drawBranch(minX,maxX,minY,maxY){
  const {w,h,node,groups,xPad,inset,rail,science}=branch;
  const tone=toneFor(node.level);
  rect(0,0,w,Math.max(h,viewHeight/scale),"#f8fafc");
  const railWidth=rail?inset-xPad-26:w-xPad*2;
  rect(xPad,18,railWidth,61,tone[0]);rect(xPad,18,3,61,tone[2]);
  txt(node.name,xPad+11,40,16,colors.ink,735,railWidth-21);
  const [upper,lower]=railNotes(node);
  if(upper)txt(upper,xPad+11,57,11,colors.muted,650,railWidth-19);
  if(lower)txt(lower,xPad+11,71,10,colors.muted,570,railWidth-19);
  const messageY=rail?41:116;
  if(science)txt("小学科学按考点映射至对应学科。",inset,messageY,14,colors.muted,550,w-inset-xPad);
  if(!groups.length&&!science){
    txt(branchQuery.value?"没有匹配的点":"此节点没有已录入的下级或关联节点。",inset,messageY,14,colors.muted,580,w-inset-xPad);
    return;
  }
  const visible=p=>p.y+p.h>=minY&&p.y<=maxY&&p.x+p.w>=minX&&p.x<=maxX;
  for(const g of groups){
    if(!visible(g))continue;
    const theme=toneFor(g.level);
    rect(g.x,g.y,g.w,g.h,"#fff");
    ctx.strokeStyle="#dbe6ee";ctx.lineWidth=1;ctx.strokeRect(g.x+.5,g.y+.5,g.w-1,g.h-1);
    rect(g.x+1,g.y+1,g.w-2,31,theme[0]);
    txt(g.title,g.x+11,g.y+21,14,colors.ink,695,g.w-75);
    txt(nums(g.count)+(g.tiles.length?" 组":" 个点"),g.x+g.w-12,g.y+21,12,colors.muted,640,65,"right");
    for(const tile of g.tiles){
      if(!visible(tile))continue;
      const theme=toneFor(tile.node.level), hover=hovered===tile.node;
      rect(tile.x,tile.y,tile.w,tile.h,hover?theme[0]:theme[1]);
      rect(tile.x,tile.y,tile.w,25,theme[0]);
      if(hover){ctx.strokeStyle=theme[2];ctx.lineWidth=1.3;ctx.strokeRect(tile.x+.5,tile.y+.5,tile.w-1,tile.h-1);}
      const count=tile.dots.length;
      txt(tile.node.name,tile.x+11,tile.y+17,13.5,tile.node.level==="D4"?"#79501f":colors.ink,700,tile.w-48);
      if(count)txt(nums(count),tile.x+tile.w-10,tile.y+17,11,colors.muted,650,35,"right");
      for(const p of tile.dots){
        if(p.y<minY||p.y>maxY)continue;
        compactDot(p,3.05);
        if(hovered===p.node){
          ctx.beginPath();ctx.strokeStyle=levelColor[p.node.level];ctx.lineWidth=1.3;ctx.arc(p.x,p.y,5.7,0,Math.PI*2);ctx.stroke();
        }
      }
    }
    for(const p of g.points){
      if(!visible(p))continue;
      const hover=hovered===p.node, fill=levelColor[p.node.level];
      if(hover)rect(p.x,p.y,p.w,p.h,theme[0]);
      ctx.beginPath();ctx.fillStyle=fill;ctx.arc(p.x+14,p.y+17,6.8,0,Math.PI*2);ctx.fill();
      if(hover){ctx.beginPath();ctx.strokeStyle=fill;ctx.lineWidth=1.4;ctx.arc(p.x+14,p.y+17,10.2,0,Math.PI*2);ctx.stroke();}
      txt(p.node.name,p.x+27,p.y+21,13,colors.ink,650,p.w-33);
      if(!p.node.isFolder)txt(p.node.id,p.x+27,p.y+39,10.5,colors.muted,480,p.w-33);
    }
  }
}
function showBranch(node){
  branch=buildBranch(node);
  scale=Math.min(1,width/branch.w);ox=0;oy=0;
  renderTrail(node);$("branch-bar").hidden=false;branchQuery.hidden=!branch.filterable;
  $("detail").hidden=true;$("node-info").setAttribute("aria-expanded","false");
  clamp();schedule();
}
branchQuery.addEventListener("input",()=>{
  if(!active)return;
  hovered=null;$("tooltip").hidden=true;showBranch(active);
});
branchQuery.addEventListener("keydown",event=>{
  if(event.key!=="Enter"||!branchQuery.value.trim())return;
  const first=branch?.groups[0];
  const match=first?.points[0]?.node||first?.tiles[0]?.node;
  if(match){event.preventDefault();selectNode(match,{keepScope:true});canvas.focus({preventScroll:true});}
});
function renderInspector(node){
  const detail=$("detail"), area=$("node-data");
  detail.hidden=false;detail.dataset.level=node.level;detail.scrollTop=0;
  $("node-name").textContent=node.name;
  area.replaceChildren(label("p",node.isFolder?describe(node)[0]:`${node.level} ${fields[node.level]}  /  ${node.id}`,"detail-id"));
  for(const value of distinct(describe(node)))area.append(label("p",value,"detail-copy"));
  for(const [title,ids] of branchRelations(node)){
    if(!ids.length)continue;
    const section=label("section","","relations"),links=label("div","","relation-links");
    section.append(label("h3",`${title}（${nums(ids.length)}）`),links);
    const cap=node.level==="D1"&&node.r[2]==="学段"?20:7;
    for(const id of ids.slice(0,cap)){
      const peer=allByID.get(id), button=label("button",peer.name);
      button.type="button";button.title=peer.isFolder?peer.name:peer.id;
      button.addEventListener("click",()=>selectNode(peer,{keepScope:true}));links.append(button);
    }
    if(ids.length>cap)section.append(label("p",`共 ${nums(ids.length)} 项，可在点阵中查看。`,"relation-more"));
    area.append(section);
  }
}
function selectNode(node,{keepScope=false}={}){
  if(node!==active||!branch)pushStep();
  if(node.level==="D1"&&node.r[2]==="学段")stageScope=node.name;
  else if(!keepScope)stageScope="";
  trail=keepScope && trail.length
    ? [...trail.slice(0,trail.includes(node.id)?trail.indexOf(node.id):trail.length),node.id]
    : [...canonicalTrail(node),node.id];
  active=node;hovered=null;$("tooltip").hidden=true;
  branchQuery.value="";showBranch(node);
  schedule();
}
function hideInspector(){
  $("detail").hidden=true;$("node-info").setAttribute("aria-expanded","false");
}
function closeDetail(){
  active=null;branch=null;stageScope="";trail=[];
  $("branch-bar").hidden=true;hideInspector();schedule();
}
$("node-info").addEventListener("click",()=>{
  if(!$("detail").hidden){hideInspector();return;}
  if(active){renderInspector(active);$("node-info").setAttribute("aria-expanded","true");}
});
$("close").addEventListener("click",hideInspector);
$("minus").addEventListener("click",()=>zoom(.79));
$("plus").addEventListener("click",()=>zoom(1.27));
$("overview").addEventListener("click",()=>{closeDetail();reset();});
$("start").addEventListener("click",()=>{closeDetail();reset();});
const jump=$("jump");
const optGroup = (name, options) => {
  const block=document.createElement("optgroup");block.label=name;
  for(const [id,name] of options){const option=label("option",name);option.value=id;block.append(option);}
  jump.append(block);
};
optGroup("学段",stages.map(n=>[n.id,n.name]));
optGroup("学科与课程",entrances.map(n=>[n.id,n.name]));
optGroup("题面与作答特征",[["D6","D6 八个维度"]]);
jump.addEventListener("change",()=>{
  const id=jump.value;
  if(id==="D6")selectNode(d6Folder);
  else if(id)selectNode(allByID.get(id));
  jump.value="";
});
const query=$("query"), matches=$("matches");
const normalized = s => s.normalize("NFKC").toLowerCase().replace(/\s+/g,"");
const searchable=[...nodes.values()].map(n=>({n,name:normalized(n.name),id:normalized(n.id)}));
let currentMatches=[],matchIndex=-1;
function closeMatches(){matches.hidden=true;query.setAttribute("aria-expanded","false");query.removeAttribute("aria-activedescendant");}
function markMatch(index){
  matchIndex=index;
  const options=matches.querySelectorAll('[role="option"]');
  options.forEach((option,i)=>option.setAttribute("aria-selected",String(i===index)));
  if(options[index]){
    query.setAttribute("aria-activedescendant",options[index].id);
    options[index].scrollIntoView({block:"nearest"});
  }
}
function showMatches(){
  const term=normalized(query.value);
  currentMatches=[];matchIndex=-1;matches.replaceChildren();query.removeAttribute("aria-activedescendant");
  if(!term){closeMatches();return;}
  currentMatches=searchable.flatMap(({n,name,id})=>{
    const score=id===term?0:name===term?1:name.startsWith(term)?2:id.startsWith(term)?3:name.includes(term)?4:id.includes(term)?5:-1;
    return score===-1?[]:[{n,score}];
  }).sort((a,b)=>a.score-b.score||a.n.name.length-b.n.name.length).slice(0,12);
  for(const [i,{n}] of currentMatches.entries()){
    const button=label("button",n.name);button.type="button";
    button.id=`match-${i}`;button.setAttribute("role","option");button.setAttribute("aria-selected","false");button.tabIndex=-1;
    button.append(label("small",`${n.id} · ${n.level==="D6"?n.r[2]:allByID.get(n.r[2])?.name||n.r[2]}`));
    button.addEventListener("click",()=>{selectNode(n);closeMatches();});matches.append(button);
  }
  if(!currentMatches.length)matches.append(label("p","没有找到匹配的名称或 ID"));
  matches.hidden=false;query.setAttribute("aria-expanded","true");
}
query.addEventListener("input",showMatches);
query.addEventListener("focus",showMatches);
query.addEventListener("keydown",e=>{
  if(e.key==="Enter"&&currentMatches.length&&!matches.hidden){e.preventDefault();selectNode(currentMatches[Math.max(0,matchIndex)].n);closeMatches();}
  if((e.key==="ArrowDown"||e.key==="ArrowUp")&&currentMatches.length){
    e.preventDefault();
    if(matches.hidden)showMatches();
    const shift=e.key==="ArrowDown"?1:-1;
    markMatch((Math.max(-1,matchIndex)+shift+currentMatches.length)%currentMatches.length);
  }
  if(e.key==="Escape")closeMatches();
});
document.addEventListener("keydown",e=>{
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="k"){e.preventDefault();query.focus();query.select();}
  else if(e.key==="Escape"&&active&&!e.target.closest(".search")&&!$("detail").hidden)hideInspector();
});
document.addEventListener("pointerdown",e=>{if(!e.target.closest(".search"))closeMatches();});
let drag=null;
const locationOf=e=>{const rect=canvas.getBoundingClientRect();return [e.clientX-rect.left,e.clientY-rect.top];};
canvas.addEventListener("pointerdown",e=>{
  if(e.button!==0)return;
  const [x,y]=locationOf(e);
  drag={x,y,ox,oy,moved:false,id:e.pointerId};canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove",e=>{
  const [x,y]=locationOf(e);
  if(drag){
    if(Math.hypot(x-drag.x,y-drag.y)>4)drag.moved=true;
    if(drag.moved){ox=drag.ox+x-drag.x;oy=drag.oy+y-drag.y;clamp();schedule();}
    $("tooltip").hidden=true;return;
  }
  const node=hit(x,y);
  if(node!==hovered){hovered=node;schedule();}
  const tool=$("tooltip");tool.hidden=!node;
  canvas.classList.toggle("can-select",Boolean(node));
  if(node){tool.textContent=`${node.name} · ${node.id}`;tool.style.left=`${Math.max(7,Math.min(x+12,width-225))}px`;tool.style.top=`${Math.min(y+13,viewHeight-38)}px`;}
});
canvas.addEventListener("pointerup",e=>{
  if(!drag)return;
  if(!drag.moved){
    const node=hit(...locationOf(e));
    if(node)selectNode(node,{keepScope:applies(node)});else hideInspector();
  }
  drag=null;
});
canvas.addEventListener("pointercancel",()=>{drag=null;});
canvas.addEventListener("pointerleave",()=>{hovered=null;$("tooltip").hidden=true;schedule();});
canvas.addEventListener("wheel",e=>{
  if(e.ctrlKey||e.metaKey){e.preventDefault();zoom(Math.exp(-e.deltaY*.003),...locationOf(e));return;}
  const oldX=ox,oldY=oy, amount=e.deltaMode===1?16:1;
  ox-=e.deltaX*amount;oy-=e.deltaY*amount;clamp();
  if(oldX!==ox||oldY!==oy){e.preventDefault();schedule();}
},{passive:false});
canvas.addEventListener("keydown",e=>{
  const movements={ArrowLeft:[70,0],ArrowRight:[-70,0],ArrowUp:[0,70],ArrowDown:[0,-70],PageUp:[0,viewHeight*.8],PageDown:[0,-viewHeight*.8]};
  if(e.key in movements){
    e.preventDefault();ox+=movements[e.key][0];oy+=movements[e.key][1];clamp();schedule();
  }else if(e.key==="+"||e.key==="=")zoom(1.26);
  else if(e.key==="-")zoom(.79);
  else if(e.key==="Home"){e.preventDefault();reset();}
  else if(e.key==="Escape")closeDetail();
});
new ResizeObserver(resize).observe(canvas);
resize();

// Start with the mathematics application-task example.
selectNode(nodes.get("M02"));
