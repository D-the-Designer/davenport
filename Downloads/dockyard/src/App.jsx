import { useState, useEffect, useCallback } from "react";

// ── PALETTE ────────────────────────────────────────────────────────────────
const P_GREEN      = "#4AFC6A";
const P_GREEN_DIM  = "#2A8C42";
const P_GREEN_DARK = "#0D2B14";
const BG_BASE      = "#080C09";
const BG_SURFACE   = "#0B100C";
const BG_ELEVATED  = "#101610";
const BG_HOVER     = "#152018";
const BG_ACTIVE    = "#0D2B14";
const BORDER       = "#1A2E1D";
const BORDER_MED   = "#234028";
const BORDER_BRIGHT= "#2E5534";
const TEXT_PRI     = "#4AFC6A";
const TEXT_SEC     = "#2A8C42";
const TEXT_MUTED   = "#1A4A22";
const TEXT_AMBER   = "#D4A832";
const TEXT_WHITE   = "#C8DCC9";

const TYPE_COLOR = {
  image:"#4AFC6A", vector:"#8AE89A", audio:"#D4A832", video:"#D4A832",
  font:"#8AE89A", color:"#4AFC6A", prompt:"#A8E8B0",
  document:"#2A8C42", code:"#8AE89A", other:"#1A4A22",
};
const ASSET_TYPES = ["image","vector","video","audio","font","color","prompt","document","code","other"];
const ICON_MAP = {
  image:"▣", vector:"⬡", audio:"◈", video:"▶",
  font:"Ag", color:"●", prompt:"✦", document:"≡", code:"</>", other:"○",
};

// ── IPC bridge — falls back gracefully in browser ──────────────────────────
const api = window.dockyard || {
  getDocks:          () => Promise.resolve([]),
  getAssets:         () => Promise.resolve([]),
  upsertDock:        (d) => Promise.resolve([d]),
  upsertAsset:       () => Promise.resolve(true),
  deleteDock:        () => Promise.resolve([]),
  deleteAsset:       () => Promise.resolve(true),
  importFiles:       () => Promise.resolve([]),
  openFile:          () => Promise.resolve(),
  getDataDir:        () => Promise.resolve('~/Dockyard'),
  toggleAlwaysOnTop: () => Promise.resolve(false),
  exportDock:        () => Promise.resolve(false),
};

// ── DEFAULT DOCKS (first run) ──────────────────────────────────────────────
const DEFAULT_DOCKS = [
  { id:"dock-images",    name:"Images",         icon:"▣",  accent:P_GREEN,     description:"Photos, renders, and visual references.", tags:["images","photos","renders"] },
  { id:"dock-audio",     name:"Audio & Music",  icon:"◈",  accent:TEXT_AMBER,  description:"Sound effects, music beds, and voice recordings.", tags:["audio","sfx","music"] },
  { id:"dock-type",      name:"Typography",     icon:"Ag", accent:P_GREEN_DIM, description:"Fonts, type specimens, and lettering assets.", tags:["fonts","type","lettering"] },
  { id:"dock-prompts",   name:"Prompt Library", icon:"✦",  accent:"#8AE89A",   description:"AI prompts, generation systems, and style notes.", tags:["ai","prompts","systems"] },
  { id:"dock-documents", name:"Documents",      icon:"≡",  accent:TEXT_SEC,    description:"PDFs, notes, specs, and written references.", tags:["pdf","notes","specs"] },
];

// ── SCANLINE STYLE ─────────────────────────────────────────────────────────
const scanStyle = {
  position:"absolute", inset:0, pointerEvents:"none", zIndex:0,
  backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.2) 2px,rgba(0,0,0,0.2) 4px)",
};

// ── WAVEFORM ───────────────────────────────────────────────────────────────
const Waveform = ({ color=TEXT_AMBER }) => {
  const bars = [5,12,7,18,10,20,8,15,7,13,17,9,15,11,7,19,13,9,17,11];
  return (
    <svg width="100%" height="26" viewBox={`0 0 ${bars.length*6} 22`} preserveAspectRatio="none">
      {bars.map((h,i) => <rect key={i} x={i*6+1} y={(22-h)/2} width="4" height={h} rx="0" fill={color} opacity="0.85"/>)}
    </svg>
  );
};

// ── ASSET THUMB ────────────────────────────────────────────────────────────
const AssetThumb = ({ asset, size=80 }) => {
  const s = size;
  const num = parseInt(asset.id.replace(/\D/g,"").slice(-3)||"42");
  const density = 6 + (num % 4);

  if (asset.type==="color") return (
    <div style={{width:s,height:s,background:asset.color||P_GREEN_DIM,border:`1px solid ${BORDER_BRIGHT}`,position:"relative",overflow:"hidden"}}>
      <div style={scanStyle}/>
    </div>
  );
  if (asset.type==="audio") return (
    <div style={{width:s,height:s,background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,position:"relative",overflow:"hidden"}}>
      <div style={scanStyle}/>
      <span style={{fontSize:s>60?16:11,color:TEXT_AMBER,zIndex:1}}>◈</span>
      <div style={{width:"85%",zIndex:1}}><Waveform/></div>
    </div>
  );
  if (asset.type==="prompt") return (
    <div style={{width:s,height:s,background:"#060C07",border:`1px solid ${BORDER_BRIGHT}`,padding:5,overflow:"hidden",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={scanStyle}/>
      <span style={{fontSize:s>60?8:7,color:TEXT_SEC,fontFamily:"monospace",lineHeight:1.4,zIndex:1}}>
        {asset.prompt_text?.slice(0,s>60?80:30)||"✦ prompt"}
      </span>
    </div>
  );
  if (asset.type==="font") return (
    <div style={{width:s,height:s,background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
      <div style={scanStyle}/>
      <span style={{fontSize:s*0.4,color:TEXT_PRI,fontWeight:700,zIndex:1,opacity:0.85}}>Ag</span>
    </div>
  );
  if (["document","code"].includes(asset.type)) return (
    <div style={{width:s,height:s,background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,padding:6,overflow:"hidden",position:"relative"}}>
      <div style={scanStyle}/>
      {Array.from({length:Math.floor(s/10)},(_,i)=>(
        <div key={i} style={{height:2,background:BORDER_BRIGHT,marginBottom:4,width:`${55+(num*i*13)%40}%`,opacity:0.7}}/>
      ))}
    </div>
  );
  return (
    <div style={{width:s,height:s,background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",inset:0,opacity:0.1,
        backgroundImage:`repeating-linear-gradient(0deg,${P_GREEN} 0,${P_GREEN} 1px,transparent 0,transparent ${density}px),
                         repeating-linear-gradient(90deg,${P_GREEN} 0,${P_GREEN} 1px,transparent 0,transparent ${density}px)`}}/>
      <div style={scanStyle}/>
      <span style={{fontSize:s>60?20:13,color:P_GREEN_DIM,zIndex:1,opacity:0.6}}>{ICON_MAP[asset.type]||"○"}</span>
    </div>
  );
};

// ── TOP BAR ────────────────────────────────────────────────────────────────
const TopBar = ({compact,setCompact,onImport,onToggleTop,alwaysOnTop,dataDir}) => (
  <div style={{height:40,background:BG_BASE,borderBottom:`1px solid ${BORDER_MED}`,display:"flex",alignItems:"center",gap:6,padding:"0 10px",flexShrink:0,fontFamily:"monospace",WebkitAppRegion:"drag"}}>
    <span style={{color:P_GREEN,fontSize:11,fontWeight:700,letterSpacing:3,marginRight:6,WebkitAppRegion:"no-drag"}}>DOCKYARD</span>
    <span style={{color:TEXT_MUTED,fontSize:9,letterSpacing:1}}>v0.1.0</span>
    <div style={{width:1,height:16,background:BORDER_MED,margin:"0 4px"}}/>
    <TBtn label="[ IMPORT ]" onClick={onImport}/>
    <div style={{flex:1}}/>
    <span style={{fontSize:8,color:TEXT_MUTED,letterSpacing:1}}>{dataDir}</span>
    <div style={{width:1,height:16,background:BORDER_MED,margin:"0 4px"}}/>
    <TBtn label={alwaysOnTop?"[ PIN ■ ]":"[ PIN □ ]"} onClick={onToggleTop} active={alwaysOnTop}/>
    <button onClick={()=>setCompact(c=>!c)} style={{
      background:compact?P_GREEN_DARK:"transparent",
      border:`1px solid ${compact?P_GREEN:BORDER_MED}`,
      color:compact?P_GREEN:TEXT_SEC,fontSize:10,fontFamily:"monospace",
      padding:"3px 8px",cursor:"pointer",letterSpacing:1,WebkitAppRegion:"no-drag",
    }}>{compact?"■ STRIP":"□ STRIP"}</button>
  </div>
);

const TBtn = ({label,onClick,active}) => (
  <button onClick={onClick} style={{
    background:active?BG_HOVER:"transparent",
    border:`1px solid ${active?BORDER_BRIGHT:"transparent"}`,
    color:active?TEXT_PRI:TEXT_SEC,fontSize:10,fontFamily:"monospace",
    padding:"3px 6px",cursor:"pointer",letterSpacing:1,whiteSpace:"nowrap",
    WebkitAppRegion:"no-drag",
  }}
    onMouseEnter={e=>e.currentTarget.style.color=TEXT_PRI}
    onMouseLeave={e=>e.currentTarget.style.color=active?TEXT_PRI:TEXT_SEC}
  >{label}</button>
);

// ── SIDEBAR ────────────────────────────────────────────────────────────────
const Sidebar = ({docks,activeDockId,setActiveDockId,onCreate,assetCounts}) => {
  const [search,setSearch] = useState("");
  const filtered = docks.filter(d=>d.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={{width:210,background:BG_BASE,borderRight:`1px solid ${BORDER_MED}`,display:"flex",flexDirection:"column",flexShrink:0,fontFamily:"monospace"}}>
      <div style={{padding:"8px 8px 6px",borderBottom:`1px solid ${BORDER}`}}>
        <div style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2,marginBottom:4}}>// DOCK INDEX</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="FILTER_"
          style={{width:"100%",boxSizing:"border-box",background:"transparent",border:`1px solid ${BORDER_MED}`,color:TEXT_PRI,fontSize:10,padding:"4px 6px",outline:"none",fontFamily:"monospace",letterSpacing:1}}/>
      </div>
      <div style={{flex:1,overflowY:"auto"}}>
        {filtered.map((d,idx)=>{
          const count = assetCounts[d.id]||0;
          return (
            <button key={d.id} onClick={()=>setActiveDockId(d.id)} style={{
              width:"100%",background:activeDockId===d.id?BG_ACTIVE:"transparent",
              border:"none",borderLeft:`2px solid ${activeDockId===d.id?d.accent:"transparent"}`,
              borderBottom:`1px solid ${BORDER}`,
              display:"flex",alignItems:"center",gap:8,padding:"7px 8px",cursor:"pointer",textAlign:"left",
            }}>
              <span style={{fontSize:9,color:TEXT_MUTED,minWidth:14}}>{String(idx+1).padStart(2,"0")}</span>
              <span style={{fontSize:13,color:activeDockId===d.id?d.accent:TEXT_SEC,width:18,textAlign:"center"}}>{d.icon}</span>
              <div style={{flex:1,overflow:"hidden"}}>
                <div style={{fontSize:10,color:activeDockId===d.id?TEXT_PRI:TEXT_SEC,fontWeight:activeDockId===d.id?700:400,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",letterSpacing:0.5}}>{d.name.toUpperCase()}</div>
                <div style={{fontSize:9,color:TEXT_MUTED}}>{count>0?`${count} ASSETS`:"EMPTY"}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{borderTop:`1px solid ${BORDER_MED}`,padding:8}}>
        <button onClick={onCreate} style={{
          width:"100%",background:"transparent",border:`1px solid ${BORDER_MED}`,
          color:TEXT_SEC,fontSize:10,fontFamily:"monospace",padding:"6px 0",cursor:"pointer",letterSpacing:1,
        }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=P_GREEN;e.currentTarget.style.color=P_GREEN;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER_MED;e.currentTarget.style.color=TEXT_SEC;}}
        >[ + NEW DOCK ]</button>
      </div>
    </div>
  );
};

// ── ASSET GRID ─────────────────────────────────────────────────────────────
const AssetGrid = ({assets,selected,setSelected,thumbSize,listMode,onDropFiles}) => {
  const [dragOver,setDragOver] = useState(false);
  const onDragOver = e=>{e.preventDefault();setDragOver(true);};
  const onDragLeave = ()=>setDragOver(false);
  const onDrop = e=>{e.preventDefault();setDragOver(false);onDropFiles(Array.from(e.dataTransfer.files));};
  const border = dragOver?`2px dashed ${P_GREEN}`:`2px solid transparent`;

  if (listMode) return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      style={{flex:1,overflowY:"auto",padding:6,border,fontFamily:"monospace"}}>
      <div style={{display:"grid",gridTemplateColumns:"28px 1fr 80px 56px",gap:"0 10px",padding:"0 8px 4px",borderBottom:`1px solid ${BORDER}`}}>
        {["#","FILENAME","TYPE","SIZE"].map(h=><span key={h} style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2}}>{h}</span>)}
      </div>
      {assets.map((a,i)=>(
        <div key={a.id} onClick={()=>setSelected(a.id)} style={{
          display:"grid",gridTemplateColumns:"28px 1fr 80px 56px",gap:"0 10px",
          alignItems:"center",padding:"5px 8px",
          background:selected===a.id?BG_ACTIVE:"transparent",
          borderLeft:`2px solid ${selected===a.id?P_GREEN:"transparent"}`,
          cursor:"pointer",marginBottom:1,
        }}>
          <span style={{fontSize:9,color:TEXT_MUTED}}>{String(i+1).padStart(3,"0")}</span>
          <span style={{fontSize:11,color:selected===a.id?TEXT_PRI:TEXT_SEC,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</span>
          <span style={{fontSize:9,color:TYPE_COLOR[a.type],letterSpacing:1}}>{a.type.toUpperCase()}</span>
          <span style={{fontSize:9,color:TEXT_MUTED}}>{a.size}</span>
        </div>
      ))}
    </div>
  );

  return (
    <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} style={{
      flex:1,overflowY:"auto",padding:8,
      display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${thumbSize}px,1fr))`,
      gap:6,alignContent:"start",border,
    }}>
      {assets.map(a=>(
        <div key={a.id} onClick={()=>setSelected(a.id)} draggable style={{
          cursor:"pointer",
          border:`1px solid ${selected===a.id?P_GREEN:BORDER_MED}`,
          background:selected===a.id?BG_ACTIVE:BG_SURFACE,
          overflow:"hidden",fontFamily:"monospace",
        }}>
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",padding:4,background:BG_BASE}}>
            <AssetThumb asset={a} size={Math.max(thumbSize-16,40)}/>
          </div>
          <div style={{padding:"3px 5px",borderTop:`1px solid ${BORDER}`}}>
            <div style={{fontSize:9,color:selected===a.id?TEXT_PRI:TEXT_SEC,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.title}</div>
            <div style={{fontSize:8,color:TYPE_COLOR[a.type],letterSpacing:0.5,marginTop:1}}>{a.type.toUpperCase()}</div>
          </div>
        </div>
      ))}
      {dragOver&&(
        <div style={{gridColumn:"1 / -1",padding:20,textAlign:"center",color:P_GREEN,fontSize:11,border:`1px dashed ${P_GREEN}`,fontFamily:"monospace",letterSpacing:2}}>
          DROP TO IMPORT_
        </div>
      )}
      {assets.length===0&&!dragOver&&(
        <div style={{gridColumn:"1 / -1",padding:40,textAlign:"center",color:TEXT_MUTED,fontFamily:"monospace",lineHeight:2.5}}>
          <div style={{fontSize:22,opacity:0.3}}>⬡</div>
          <div style={{fontSize:10,letterSpacing:2}}>DOCK EMPTY</div>
          <div style={{fontSize:9,opacity:0.5}}>DRAG FILES HERE OR USE [ IMPORT ]</div>
        </div>
      )}
    </div>
  );
};

// ── INSPECTOR ──────────────────────────────────────────────────────────────
const Inspector = ({asset,onUpdate,onDelete,onOpen}) => {
  const [tab,setTab] = useState("meta");
  const [playing,setPlaying] = useState(false);

  useEffect(()=>{setTab("meta");setPlaying(false);},[asset?.id]);

  if (!asset) return (
    <div style={{width:248,background:BG_BASE,borderLeft:`1px solid ${BORDER_MED}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>
      <div style={{color:TEXT_MUTED,fontSize:10,letterSpacing:2,textAlign:"center",lineHeight:2.5}}>
        <div style={{fontSize:22,marginBottom:8,opacity:0.25}}>▣</div>
        NO ASSET<br/>SELECTED
      </div>
    </div>
  );

  return (
    <div style={{width:248,background:BG_BASE,borderLeft:`1px solid ${BORDER_MED}`,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"monospace"}}>
      <div style={{padding:10,borderBottom:`1px solid ${BORDER_MED}`,background:BG_SURFACE}}>
        <div style={{display:"flex",justifyContent:"center",position:"relative"}}>
          <AssetThumb asset={asset} size={186}/>
        </div>
        {asset.type==="audio"&&(
          <div style={{marginTop:8}}>
            <Waveform/>
            <div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
              <button onClick={()=>setPlaying(p=>!p)} style={{background:"transparent",border:`1px solid ${TEXT_AMBER}`,width:24,height:24,color:TEXT_AMBER,cursor:"pointer",fontSize:10,display:"flex",alignItems:"center",justifyContent:"center"}}>
                {playing?"⏸":"▶"}
              </button>
              <input type="range" style={{flex:1,accentColor:TEXT_AMBER}} defaultValue={0} min={0} max={100}/>
              <span style={{fontSize:9,color:TEXT_MUTED}}>—:——</span>
            </div>
          </div>
        )}
      </div>

      <div style={{display:"flex",borderBottom:`1px solid ${BORDER_MED}`}}>
        {["META","PROMPT","SOURCE"].map(t=>(
          <button key={t} onClick={()=>setTab(t.toLowerCase())} style={{
            flex:1,background:tab===t.toLowerCase()?BG_ELEVATED:"transparent",
            border:"none",borderBottom:`2px solid ${tab===t.toLowerCase()?P_GREEN:"transparent"}`,
            color:tab===t.toLowerCase()?TEXT_PRI:TEXT_MUTED,
            fontSize:9,padding:"5px 0",cursor:"pointer",fontFamily:"monospace",letterSpacing:1,
          }}>{t}</button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:8}}>
        {tab==="meta"&&(
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            <IField label="TITLE" value={asset.title} onChange={v=>onUpdate({...asset,title:v})}/>
            <IRow label="TYPE" value={<span style={{color:TYPE_COLOR[asset.type]}}>{asset.type.toUpperCase()}</span>}/>
            {asset.dimensions&&asset.dimensions!=="—"&&<IRow label="DIM" value={asset.dimensions}/>}
            {asset.size&&<IRow label="SIZE" value={asset.size}/>}
            <div>
              <div style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2,marginBottom:3}}>TAGS</div>
              <TagEditor tags={asset.tags||[]} onChange={tags=>onUpdate({...asset,tags})}/>
            </div>
            <div>
              <div style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2,marginBottom:3}}>NOTES</div>
              <textarea defaultValue={asset.notes} key={asset.id+"notes"}
                onBlur={e=>onUpdate({...asset,notes:e.target.value})} rows={4}
                style={{width:"100%",boxSizing:"border-box",background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,color:TEXT_PRI,fontSize:10,padding:"4px 6px",outline:"none",resize:"vertical",fontFamily:"monospace",lineHeight:1.5}}/>
            </div>
            <div style={{display:"flex",gap:6}}>
              {asset.file_path&&(
                <button onClick={()=>onOpen(asset.file_path)} style={{flex:1,background:"transparent",border:`1px solid ${BORDER_MED}`,color:TEXT_SEC,fontSize:9,fontFamily:"monospace",padding:"5px 0",cursor:"pointer",letterSpacing:1}}>[ OPEN FILE ]</button>
              )}
              <button onClick={()=>onDelete(asset.id)} style={{flex:1,background:"transparent",border:`1px solid #3A1515`,color:"#8A3030",fontSize:9,fontFamily:"monospace",padding:"5px 0",cursor:"pointer",letterSpacing:1}}>[ DELETE ]</button>
            </div>
          </div>
        )}
        {tab==="prompt"&&(
          <div>
            <div style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2,marginBottom:6}}>PROMPT BLOCK</div>
            <textarea key={asset.id+"prompt"} defaultValue={asset.prompt_text}
              onBlur={e=>onUpdate({...asset,prompt_text:e.target.value})}
              placeholder="// PASTE PROMPT, SYSTEM NOTES, OR AI INSTRUCTIONS..."
              rows={12}
              style={{width:"100%",boxSizing:"border-box",background:"#060C07",border:`1px solid ${BORDER_MED}`,color:TEXT_SEC,fontSize:10,padding:"6px 7px",outline:"none",resize:"vertical",fontFamily:"monospace",lineHeight:1.6}}/>
          </div>
        )}
        {tab==="source"&&(
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            <IField label="SOURCE" value={asset.source||""} onChange={v=>onUpdate({...asset,source:v})}/>
            <IField label="LICENSE" value={asset.license||""} onChange={v=>onUpdate({...asset,license:v})}/>
            {asset.color&&asset.type==="color"&&<IRow label="HEX" value={asset.color}/>}
            <IRow label="CREATED" value={asset.created_at?.slice(0,10)||"—"}/>
          </div>
        )}
      </div>
    </div>
  );
};

const TagEditor = ({tags,onChange}) => {
  const [input,setInput] = useState("");
  const add = () => {
    const t = input.trim().toLowerCase().replace(/\s+/g,"-");
    if (t&&!tags.includes(t)) onChange([...tags,t]);
    setInput("");
  };
  return (
    <div>
      <div style={{display:"flex",flexWrap:"wrap",gap:3,marginBottom:4}}>
        {tags.map(t=>(
          <span key={t} onClick={()=>onChange(tags.filter(x=>x!==t))}
            style={{fontSize:8,border:`1px solid ${BORDER_BRIGHT}`,padding:"1px 5px",color:TEXT_SEC,letterSpacing:0.5,cursor:"pointer"}}>#{t} ×</span>
        ))}
      </div>
      <div style={{display:"flex",gap:4}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")add();}}
          placeholder="add tag…"
          style={{flex:1,background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,color:TEXT_PRI,fontSize:9,padding:"2px 5px",outline:"none",fontFamily:"monospace"}}/>
        <button onClick={add} style={{background:"transparent",border:`1px solid ${BORDER_MED}`,color:TEXT_SEC,fontSize:9,padding:"2px 6px",cursor:"pointer",fontFamily:"monospace"}}>+</button>
      </div>
    </div>
  );
};

const IField = ({label,value,onChange}) => (
  <div>
    <div style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2,marginBottom:2}}>{label}</div>
    <input defaultValue={value} key={value} onBlur={e=>onChange?.(e.target.value)}
      style={{width:"100%",boxSizing:"border-box",background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,color:TEXT_PRI,fontSize:11,padding:"3px 6px",outline:"none",fontFamily:"monospace"}}/>
  </div>
);
const IRow = ({label,value}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:6}}>
    <span style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2,flexShrink:0}}>{label}</span>
    <span style={{fontSize:10,color:TEXT_WHITE,textAlign:"right",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{value}</span>
  </div>
);

// ── GRID TOOLBAR ───────────────────────────────────────────────────────────
const GridToolbar = ({dock,assets,search,setSearch,thumbSize,setThumbSize,listMode,setListMode,typeFilter,setTypeFilter,onExport}) => (
  <div style={{height:36,borderBottom:`1px solid ${BORDER_MED}`,background:BG_SURFACE,display:"flex",alignItems:"center",gap:6,padding:"0 8px",flexShrink:0,fontFamily:"monospace"}}>
    <span style={{fontSize:10,color:TEXT_PRI,fontWeight:700,letterSpacing:1}}>{dock?.name?.toUpperCase()}</span>
    <span style={{fontSize:8,color:TEXT_MUTED}}>[{assets.length}]</span>
    <div style={{flex:1}}/>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SEARCH_"
      style={{background:"transparent",border:`1px solid ${BORDER_MED}`,color:TEXT_PRI,fontSize:10,padding:"2px 6px",width:130,outline:"none",fontFamily:"monospace",letterSpacing:1}}/>
    <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} style={{background:BG_ELEVATED,border:`1px solid ${BORDER_MED}`,color:TEXT_SEC,fontSize:9,padding:"2px 4px",outline:"none",fontFamily:"monospace"}}>
      <option value="">ALL</option>
      {ASSET_TYPES.map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
    </select>
    <button onClick={()=>setListMode(false)} style={{background:!listMode?BG_HOVER:"transparent",border:`1px solid ${!listMode?BORDER_BRIGHT:"transparent"}`,color:TEXT_SEC,fontSize:12,padding:"1px 5px",cursor:"pointer"}}>⊞</button>
    <button onClick={()=>setListMode(true)} style={{background:listMode?BG_HOVER:"transparent",border:`1px solid ${listMode?BORDER_BRIGHT:"transparent"}`,color:TEXT_SEC,fontSize:12,padding:"1px 5px",cursor:"pointer"}}>☰</button>
    <input type="range" min={60} max={160} value={thumbSize} onChange={e=>setThumbSize(+e.target.value)} style={{width:54,accentColor:P_GREEN}}/>
    <TBtn label="[ EXPORT ]" onClick={onExport}/>
  </div>
);

// ── STATUS BAR ─────────────────────────────────────────────────────────────
const StatusBar = ({count,total,dockName}) => {
  const [time,setTime] = useState("");
  useEffect(()=>{
    const tick=()=>{const n=new Date();setTime(`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`);};
    tick(); const id=setInterval(tick,1000); return ()=>clearInterval(id);
  },[]);
  return (
    <div style={{height:22,background:BG_BASE,borderTop:`1px solid ${BORDER_MED}`,display:"flex",alignItems:"center",padding:"0 10px",gap:12,flexShrink:0,fontFamily:"monospace"}}>
      <span style={{fontSize:9,color:TEXT_MUTED,letterSpacing:1}}>DOCK: {dockName?.toUpperCase()||"—"}</span>
      <span style={{fontSize:9,color:TEXT_MUTED}}>|</span>
      <span style={{fontSize:9,color:TEXT_MUTED,letterSpacing:1}}>ASSETS: {count}/{total}</span>
      <span style={{fontSize:9,color:TEXT_MUTED}}>|</span>
      <span style={{fontSize:9,color:TEXT_MUTED,letterSpacing:1}}>LOCAL · OFFLINE READY</span>
      <div style={{flex:1}}/>
      <span style={{fontSize:9,color:P_GREEN_DIM,letterSpacing:2}}>{time} ●</span>
    </div>
  );
};

// ── CREATE DOCK MODAL ──────────────────────────────────────────────────────
const ACCENT_OPTS = [P_GREEN,TEXT_AMBER,"#8AE89A","#4AAFFC","#FC4A6D",TEXT_SEC,"#C8A0E8","#FFFFFF"];
const CreateDockModal = ({onClose,onCreate}) => {
  const [name,setName] = useState("");
  const [desc,setDesc] = useState("");
  const [accent,setAccent] = useState(P_GREEN);
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{background:BG_SURFACE,border:`1px solid ${BORDER_MED}`,padding:20,width:300,fontFamily:"monospace"}}>
        <div style={{fontSize:11,color:P_GREEN,letterSpacing:2,marginBottom:14}}>// CREATE NEW DOCK</div>
        <MLabel>DOCK NAME</MLabel>
        <input value={name} onChange={e=>setName(e.target.value)} placeholder="MY ASSET DOCK_" autoFocus
          style={{width:"100%",boxSizing:"border-box",background:"transparent",border:`1px solid ${BORDER_MED}`,color:TEXT_PRI,fontSize:11,padding:"5px 7px",outline:"none",fontFamily:"monospace",letterSpacing:1,marginBottom:10}}/>
        <MLabel>DESCRIPTION (OPTIONAL)</MLabel>
        <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2}
          style={{width:"100%",boxSizing:"border-box",background:"transparent",border:`1px solid ${BORDER_MED}`,color:TEXT_PRI,fontSize:10,padding:"4px 7px",outline:"none",resize:"none",fontFamily:"monospace",marginBottom:10}}/>
        <MLabel>ACCENT COLOR</MLabel>
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {ACCENT_OPTS.map(c=>(
            <div key={c} onClick={()=>setAccent(c)} style={{width:22,height:22,background:c,cursor:"pointer",border:`2px solid ${accent===c?TEXT_WHITE:"transparent"}`}}/>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onClose} style={{flex:1,background:"transparent",border:`1px solid ${BORDER_MED}`,color:TEXT_SEC,fontSize:10,fontFamily:"monospace",padding:"6px 0",cursor:"pointer",letterSpacing:1}}>[ CANCEL ]</button>
          <button onClick={()=>{if(name.trim())onCreate({name:name.trim(),description:desc,accent,icon:"⬡"});}} style={{flex:1,background:P_GREEN_DARK,border:`1px solid ${P_GREEN}`,color:P_GREEN,fontSize:10,fontFamily:"monospace",padding:"6px 0",cursor:"pointer",letterSpacing:1,fontWeight:700}}>[ CREATE ]</button>
        </div>
      </div>
    </div>
  );
};
const MLabel = ({children})=><div style={{fontSize:8,color:TEXT_MUTED,letterSpacing:2,marginBottom:3}}>{children}</div>;

// ── COMPACT STRIP ──────────────────────────────────────────────────────────
const CompactStrip = ({assets,onExpand}) => (
  <div style={{position:"fixed",bottom:20,left:"50%",transform:"translateX(-50%)",background:"rgba(8,12,9,0.97)",border:`1px solid ${BORDER_MED}`,padding:"5px 8px",display:"flex",alignItems:"center",gap:6,zIndex:200,fontFamily:"monospace",maxWidth:"90vw"}}>
    <span style={{fontSize:9,color:P_GREEN,letterSpacing:2,marginRight:4}}>⬡ DOCK</span>
    <div style={{width:1,height:20,background:BORDER_MED}}/>
    <div style={{display:"flex",gap:3,overflowX:"auto"}}>
      {assets.slice(0,12).map(a=>(
        <div key={a.id} draggable style={{width:36,height:36,border:`1px solid ${BORDER_MED}`,overflow:"hidden",flexShrink:0,cursor:"grab",display:"flex",alignItems:"center",justifyContent:"center",background:BG_ELEVATED}}>
          <AssetThumb asset={a} size={34}/>
        </div>
      ))}
    </div>
    <div style={{width:1,height:20,background:BORDER_MED}}/>
    <button onClick={onExpand} style={{background:"transparent",border:`1px solid ${BORDER_BRIGHT}`,color:TEXT_SEC,fontSize:9,fontFamily:"monospace",padding:"2px 7px",cursor:"pointer",letterSpacing:1}}>[ EXPAND ]</button>
  </div>
);

// ── ROOT APP ───────────────────────────────────────────────────────────────
export default function App() {
  const [docks, setDocks]             = useState([]);
  const [activeDockId, setActiveDockId] = useState(null);
  const [assetMap, setAssetMap]       = useState({});   // dockId -> asset[]
  const [selectedId, setSelectedId]   = useState(null);
  const [compact, setCompact]         = useState(false);
  const [showCreate, setShowCreate]   = useState(false);
  const [thumbSize, setThumbSize]     = useState(90);
  const [listMode, setListMode]       = useState(false);
  const [search, setSearch]           = useState("");
  const [typeFilter, setTypeFilter]   = useState("");
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [dataDir, setDataDir]         = useState("");
  const [notification, setNotification] = useState(null);

  const notify = msg => { setNotification(msg); setTimeout(()=>setNotification(null),3000); };

  // ── Bootstrap ─────────────────────────────────────────────────────────
  useEffect(()=>{
    (async()=>{
      const dir = await api.getDataDir();
      setDataDir(dir);
      let savedDocks = await api.getDocks();
      if (savedDocks.length === 0) {
        // First run — seed default docks
        for (const d of DEFAULT_DOCKS) await api.upsertDock(d);
        savedDocks = await api.getDocks();
      }
      setDocks(savedDocks);
      const firstId = savedDocks[0]?.id||null;
      setActiveDockId(firstId);
      if (firstId) {
        const assets = await api.getAssets(firstId);
        setAssetMap({[firstId]: assets});
      }
    })();
  },[]);

  // ── Load assets when switching dock ───────────────────────────────────
  useEffect(()=>{
    if (!activeDockId) return;
    if (assetMap[activeDockId]) return;
    api.getAssets(activeDockId).then(assets=>setAssetMap(m=>({...m,[activeDockId]:assets})));
  },[activeDockId]);

  const activeAssets = assetMap[activeDockId]||[];
  const filteredAssets = activeAssets.filter(a=>{
    const q = search.toLowerCase();
    return (!q || a.title.toLowerCase().includes(q) || (a.tags||[]).join(" ").includes(q) || (a.prompt_text||"").toLowerCase().includes(q))
        && (!typeFilter || a.type===typeFilter);
  });
  const selectedAsset = activeAssets.find(a=>a.id===selectedId)||null;
  const assetCounts = Object.fromEntries(docks.map(d=>[d.id,(assetMap[d.id]||[]).length]));

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleDropFiles = useCallback(async files => {
    if (!activeDockId||!files.length) return;
    const toImport = files.map(f=>{
      const ext = f.name.split(".").pop().toLowerCase();
      let type="other";
      if (["png","jpg","jpeg","webp","gif"].includes(ext)) type="image";
      else if (ext==="svg") type="vector";
      else if (["mp3","wav","aiff","ogg","m4a"].includes(ext)) type="audio";
      else if (["mp4","mov"].includes(ext)) type="video";
      else if (["txt","md","pdf"].includes(ext)) type="document";
      return {
        id:`asset-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        dockId:activeDockId, type, title:f.name,
        file_path:"", size:`${(f.size/1024/1024).toFixed(1)} MB`,
        tags:[], notes:"", source:"Imported", license:"",
        prompt_text:"", color:"", dimensions:"—",
      };
    });
    for (const a of toImport) await api.upsertAsset(a);
    setAssetMap(m=>({...m,[activeDockId]:[...(m[activeDockId]||[]),...toImport]}));
    notify(`IMPORTED ${toImport.length} ASSET${toImport.length>1?"S":""}`);
  },[activeDockId]);

  const handleImportDialog = async () => {
    const imported = await api.importFiles();
    if (!imported.length) return;
    const withDock = imported.map(a=>({...a,dockId:activeDockId}));
    for (const a of withDock) await api.upsertAsset(a);
    setAssetMap(m=>({...m,[activeDockId]:[...(m[activeDockId]||[]),...withDock]}));
    notify(`IMPORTED ${withDock.length} ASSET${withDock.length>1?"S":""}`);
  };

  const handleUpdateAsset = async updated => {
    await api.upsertAsset(updated);
    setAssetMap(m=>({...m,[activeDockId]:m[activeDockId].map(a=>a.id===updated.id?updated:a)}));
  };

  const handleDeleteAsset = async id => {
    await api.deleteAsset(id);
    setAssetMap(m=>({...m,[activeDockId]:m[activeDockId].filter(a=>a.id!==id)}));
    setSelectedId(null);
    notify("ASSET REMOVED");
  };

  const handleCreateDock = async ({name,description,accent,icon}) => {
    const newDock = {
      id:`dock-${Date.now()}`,
      name, description, accent, icon:"⬡", tags:[],
    };
    const updated = await api.upsertDock(newDock);
    setDocks(updated.length?updated:[...docks,newDock]);
    setActiveDockId(newDock.id);
    setAssetMap(m=>({...m,[newDock.id]:[]}));
    setShowCreate(false);
    notify(`DOCK CREATED: ${name.toUpperCase()}`);
  };

  const handleToggleTop = async () => {
    const next = await api.toggleAlwaysOnTop();
    setAlwaysOnTop(next);
    notify(next?"PINNED — ALWAYS ON TOP":"UNPINNED");
  };

  const handleExport = async () => {
    const dock = docks.find(d=>d.id===activeDockId);
    if (!dock) return;
    const ok = await api.exportDock({dock, assets:activeAssets});
    if (ok) notify("DOCK MANIFEST EXPORTED");
  };

  const activeDock = docks.find(d=>d.id===activeDockId)||null;

  if (compact) return (
    <div style={{background:BG_BASE,height:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>
      <div style={{textAlign:"center",color:TEXT_MUTED,lineHeight:2.5}}>
        <div style={{fontSize:18,color:P_GREEN_DIM,marginBottom:8}}>⬡</div>
        <div style={{fontSize:10,letterSpacing:2}}>STRIP MODE ACTIVE</div>
        <div style={{fontSize:9,opacity:0.5}}>FLOATING DOCK TRAY VISIBLE</div>
      </div>
      <CompactStrip assets={filteredAssets} onExpand={()=>setCompact(false)}/>
    </div>
  );

  return (
    <div style={{fontFamily:"monospace",background:BG_BASE,color:TEXT_PRI,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
      <TopBar compact={compact} setCompact={setCompact}
        onImport={handleImportDialog} onToggleTop={handleToggleTop}
        alwaysOnTop={alwaysOnTop} dataDir={dataDir}/>

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        <Sidebar docks={docks} activeDockId={activeDockId}
          setActiveDockId={id=>{setActiveDockId(id);setSelectedId(null);setSearch("");}}
          onCreate={()=>setShowCreate(true)} assetCounts={assetCounts}/>

        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <GridToolbar dock={activeDock} assets={filteredAssets}
            search={search} setSearch={setSearch}
            thumbSize={thumbSize} setThumbSize={setThumbSize}
            listMode={listMode} setListMode={setListMode}
            typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            onExport={handleExport}/>
          <AssetGrid assets={filteredAssets} selected={selectedId}
            setSelected={setSelectedId} thumbSize={thumbSize}
            listMode={listMode} onDropFiles={handleDropFiles}/>
        </div>

        <Inspector asset={selectedAsset}
          onUpdate={handleUpdateAsset}
          onDelete={handleDeleteAsset}
          onOpen={path=>api.openFile(path)}/>
      </div>

      <StatusBar count={filteredAssets.length} total={activeAssets.length} dockName={activeDock?.name}/>

      {showCreate&&<CreateDockModal onClose={()=>setShowCreate(false)} onCreate={handleCreateDock}/>}

      {notification&&(
        <div style={{position:"fixed",top:48,right:12,background:BG_SURFACE,border:`1px solid ${P_GREEN}`,padding:"7px 12px",fontSize:10,color:P_GREEN,fontFamily:"monospace",letterSpacing:1,zIndex:300}}>
          {notification}
        </div>
      )}
    </div>
  );
}
