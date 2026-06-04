import { useState, useEffect, useCallback, useRef } from "react";

// ── PALETTE ────────────────────────────────────────────────────────────────
const C = {
  bgBase:       "#080C09",
  bgSurface:    "#0B100C",
  bgElevated:   "#101610",
  bgActive:     "#0D2B14",
  bgHover:      "#152018",
  green:        "#4AFC6A",
  greenDim:     "#2A8C42",
  greenDark:    "#0D2B14",
  greenMuted:   "#1A4A22",
  amber:        "#D4A832",
  white:        "#C8DCC9",
  border:       "#1A2E1D",
  borderMed:    "#234028",
  borderBright: "#2E5534",
};

const SCAN = {
  position:"absolute", inset:0, pointerEvents:"none", zIndex:0,
  backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.18) 2px,rgba(0,0,0,0.18) 4px)"
};

const ASSET_TYPES = ["image","vector","video","audio","font","color","prompt","document","code","lut","other"];
const STATE_OPTS  = ["raw","working","approved","final"];
const STATE_COLOR = { raw:C.greenMuted, working:C.greenDim, approved:C.green, final:C.amber };
const ICON = { image:"▣",vector:"⬡",audio:"◈",video:"▶",font:"Ag",color:"●",prompt:"✦",document:"≡",code:"</>",lut:"▨",other:"○" };

const api = window.dockyard || {
  getProjects:()=>Promise.resolve([]), upsertProject:(p)=>Promise.resolve([p]),
  deleteProject:()=>Promise.resolve([]), getContainers:()=>Promise.resolve([]),
  upsertContainer:(c)=>Promise.resolve([c]), deleteContainer:()=>Promise.resolve([]),
  getAssets:()=>Promise.resolve([]), upsertAsset:()=>Promise.resolve(true),
  deleteAsset:()=>Promise.resolve(true), setAssetState:()=>Promise.resolve(true),
  importFilesDialog:()=>Promise.resolve([]), importDroppedFiles:()=>Promise.resolve([]),
  startDrag:()=>{}, openFile:()=>Promise.resolve(),
  getDataDir:()=>Promise.resolve('~/Dockyard'), toggleAlwaysOnTop:()=>Promise.resolve(false),
  exportContainer:()=>Promise.resolve(false), importDockPackage:()=>Promise.resolve(null), regenerateThumbnails:()=>Promise.resolve({count:0}),
};

const DEFAULT_CONTAINERS = [
  { name:"Raw",          notes:"Everything lands here on import.", sort_order:0 },
  { name:"Working",      notes:"Assets in progress.", sort_order:1 },
  { name:"Brand Package",notes:"Approved, final, deliverable assets.", sort_order:2 },
];

function makeId(p) { return `${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`; }

// ── WAVEFORM ───────────────────────────────────────────────────────────────
const Waveform = ({ color=C.amber, h=20 }) => {
  const bars = [5,12,7,18,10,20,8,15,7,13,17,9,15,11,7,19,13,9,17,11];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${bars.length*6} ${h}`} preserveAspectRatio="none">
      {bars.map((b,i)=><rect key={i} x={i*6+1} y={(h-b)/2} width="4" height={b} rx="0" fill={color} opacity="0.85"/>)}
    </svg>
  );
};

// ── ASSET THUMBNAIL ────────────────────────────────────────────────────────
const AssetThumb = ({ asset, size=80 }) => {
  const s = size;
  const num = parseInt(asset.id?.replace(/\D/g,"").slice(-3)||"42");
  if (asset.thumb_path && ['image','vector'].includes(asset.type)) {
    return (
      <div style={{width:s,height:s,position:"relative",overflow:"hidden",background:C.bgElevated,border:`1px solid ${C.borderMed}`}}>
        <div style={SCAN}/>
        <img src={`file://${asset.thumb_path}`} alt=""
          style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}}
          onError={e=>{e.target.style.display='none';}}/>
      </div>
    );
  }
  if (asset.type==="color") return <div style={{width:s,height:s,background:asset.color||C.greenDim,border:`1px solid ${C.borderBright}`,position:"relative",overflow:"hidden"}}><div style={SCAN}/></div>;
  if (asset.type==="audio") return (
    <div style={{width:s,height:s,background:C.bgElevated,border:`1px solid ${C.borderMed}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,position:"relative",overflow:"hidden"}}>
      <div style={SCAN}/>
      <span style={{fontSize:Math.max(s*0.2,10),color:C.amber,zIndex:1}}>◈</span>
      <div style={{width:"85%",zIndex:1}}><Waveform h={Math.min(s/3,18)}/></div>
    </div>
  );
  if (asset.type==="prompt") return (
    <div style={{width:s,height:s,background:"#060C07",border:`1px solid ${C.borderBright}`,padding:4,overflow:"hidden",position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={SCAN}/>
      <span style={{fontSize:Math.max(s*0.09,7),color:C.greenDim,fontFamily:"monospace",lineHeight:1.3,zIndex:1}}>{asset.prompt_text?.slice(0,60)||"✦ prompt"}</span>
    </div>
  );
  if (asset.type==="font") return (
    <div style={{width:s,height:s,background:C.bgElevated,border:`1px solid ${C.borderMed}`,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",position:"relative"}}>
      <div style={SCAN}/>
      <span style={{fontSize:s*0.38,color:C.green,fontWeight:700,zIndex:1,opacity:0.85}}>Ag</span>
    </div>
  );
  if (["document","code","lut"].includes(asset.type)) return (
    <div style={{width:s,height:s,background:C.bgElevated,border:`1px solid ${C.borderMed}`,padding:5,overflow:"hidden",position:"relative"}}>
      <div style={SCAN}/>
      {Array.from({length:Math.floor(s/10)},(_,i)=><div key={i} style={{height:2,background:C.borderBright,marginBottom:3,width:`${55+(num*i*13)%40}%`,opacity:0.7}}/>)}
    </div>
  );
  const d = 6+(num%4);
  return (
    <div style={{width:s,height:s,background:C.bgElevated,border:`1px solid ${C.borderMed}`,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{position:"absolute",inset:0,opacity:0.08,backgroundImage:`repeating-linear-gradient(0deg,${C.green} 0,${C.green} 1px,transparent 0,transparent ${d}px),repeating-linear-gradient(90deg,${C.green} 0,${C.green} 1px,transparent 0,transparent ${d}px)`}}/>
      <div style={SCAN}/>
      <span style={{fontSize:s>60?20:12,color:C.greenDim,zIndex:1,opacity:0.7}}>{ICON[asset.type]||"○"}</span>
    </div>
  );
};

// ── MENU BAR ────────────────────────────────────────────────────────────────
const MenuBar = ({onImport,onImportPkg,onToggleTop,alwaysOnTop,narrow,setNarrow}) => {
  const [activeMenu,setActiveMenu] = useState(null);
  const menus = {
    FILES: [
      {label:"New Project", action:"new-project"},
      {label:"Add Folder", action:"add-folder"},
      {sep:true},
      {label:"Import Files...", action:"import"},
      {label:"Open Package...", action:"open-pkg"},
      {sep:true},
      {label:"Export Container...", action:"export"},
    ],
    VIEW: [
      {label:"Grid", action:"view-grid"},
      {label:"List", action:"view-list"},
      {label:"Manifest", action:"view-manifest"},
    ],
  };
  return (
    <div style={{flexShrink:0,fontFamily:"monospace",WebkitAppRegion:"drag",position:"relative",zIndex:50}}>
      {/* Top strip — window controls */}
      <div style={{height:36,background:"#040904",borderBottom:`1px solid ${C.borderMed}`,display:"flex",alignItems:"center",padding:"0 8px 0 80px",gap:6}}>
        <span style={{color:C.green,fontSize:11,fontWeight:700,letterSpacing:3,marginRight:8,WebkitAppRegion:"no-drag"}}>DOCKYARD</span>
        <div style={{width:1,height:14,background:C.borderMed}}/>
        {/* Pin button — prominent */}
        <button onClick={onToggleTop}
          title={alwaysOnTop?"Unpin — allow other windows on top":"Pin — keep Dockyard above all windows"}
          style={{background:alwaysOnTop?C.bgActive:"transparent",border:`1px solid ${alwaysOnTop?C.green:C.borderMed}`,color:alwaysOnTop?C.green:C.greenDim,fontSize:10,fontFamily:"monospace",padding:"3px 10px",cursor:"pointer",letterSpacing:1,WebkitAppRegion:"no-drag",display:"flex",alignItems:"center",gap:5}}>
          <span>{alwaysOnTop?"📌":"⬜"}</span>
          <span>{alwaysOnTop?"PINNED":"PIN"}</span>
        </button>
        {/* Narrow/Full toggle — prominent */}
        <button onClick={()=>setNarrow(n=>!n)}
          title={narrow?"Switch to full mode":"Switch to narrow strip mode"}
          style={{background:narrow?C.bgActive:"transparent",border:`1px solid ${narrow?C.green:C.borderMed}`,color:narrow?C.green:C.greenDim,fontSize:10,fontFamily:"monospace",padding:"3px 10px",cursor:"pointer",letterSpacing:1,WebkitAppRegion:"no-drag",display:"flex",alignItems:"center",gap:5}}>
          <span>{narrow?"◀▶":"▶◀"}</span>
          <span>{narrow?"FULL":"NARROW"}</span>
        </button>
        <div style={{flex:1}}/>
        <span style={{fontSize:8,color:C.greenMuted,letterSpacing:1,WebkitAppRegion:"no-drag"}}>LOCAL ONLY</span>
      </div>
      {/* Menu strip */}
      <div style={{height:22,background:"#050905",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 8px 0 80px",gap:0}}>
        {Object.keys(menus).map(m=>(
          <div key={m} style={{position:"relative",WebkitAppRegion:"no-drag"}}>
            <button onClick={()=>setActiveMenu(activeMenu===m?null:m)}
              style={{background:activeMenu===m?C.bgActive:"transparent",border:"none",color:activeMenu===m?C.green:C.greenDim,fontSize:9,fontFamily:"monospace",padding:"2px 8px",cursor:"pointer",letterSpacing:1}}>
              {m}
            </button>
            {activeMenu===m&&(
              <div style={{position:"absolute",top:"100%",left:0,background:C.bgSurface,border:`1px solid ${C.borderMed}`,minWidth:180,zIndex:200}}>
                {menus[m].map((item,i)=>item.sep
                  ? <div key={i} style={{height:1,background:C.border,margin:"2px 0"}}/>
                  : <button key={i} onClick={()=>{
                      setActiveMenu(null);
                      if(item.action==="import") onImport();
                      else if(item.action==="open-pkg") onImportPkg();
                    }}
                    style={{display:"block",width:"100%",background:"transparent",border:"none",color:C.greenDim,fontSize:9,fontFamily:"monospace",padding:"6px 12px",cursor:"pointer",textAlign:"left",letterSpacing:1}}
                    onMouseEnter={e=>{e.currentTarget.style.background=C.bgHover;e.currentTarget.style.color=C.green;}}
                    onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.greenDim;}}
                  >{item.label}</button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// ── TOOLBAR ────────────────────────────────────────────────────────────────
const Toolbar = ({path,onBack,onAddFolder,onManifest,onNotes,onRegenThumbs,count,viewMode,setViewMode,thumbSize,setThumbSize,search,setSearch,onImport}) => (
  <div style={{height:36,background:C.bgSurface,borderBottom:`1px solid ${C.borderMed}`,display:"flex",alignItems:"center",gap:8,padding:"0 10px",flexShrink:0,fontFamily:"monospace"}}>
    <button onClick={onBack} style={tbtn()} title="Back">←</button>
    <div style={{width:1,height:16,background:C.border}}/>
    <span style={{fontSize:9,color:C.greenDim,letterSpacing:1,flex:"0 0 auto"}}>{path}</span>
    <div style={{flex:1}}/>
    <button onClick={onAddFolder} style={tbtnGreen()} title="Add Folder">+ ADD FOLDER</button>
    <div style={{width:1,height:16,background:C.border}}/>
    <button onClick={onManifest} style={tbtn()} title="Manifest view">MANIFEST</button>
    <button onClick={onNotes} style={tbtn()} title="Notes">NOTES</button>
    <button onClick={onRegenThumbs} style={tbtn()} title="Regenerate thumbnails">⟳ THUMBS</button>
    <div style={{width:1,height:16,background:C.border}}/>
    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="SEARCH_"
      style={{background:"transparent",border:`1px solid ${C.borderMed}`,color:C.green,fontSize:9,padding:"2px 6px",width:100,outline:"none",fontFamily:"monospace",letterSpacing:1}}/>
    <div style={{width:1,height:16,background:C.border}}/>
    {["⊞","☰","≋"].map((icon,i)=>{
      const modes=["grid","list","manifest"];
      return <button key={i} onClick={()=>setViewMode(modes[i])} style={viewMode===modes[i]?tbtnActive():tbtn()} title={modes[i]}>{icon}</button>;
    })}
    <input type="range" min={60} max={140} value={thumbSize} onChange={e=>setThumbSize(+e.target.value)} style={{width:44,accentColor:C.green}}/>
    <span style={{fontSize:8,color:C.greenMuted,letterSpacing:1,minWidth:50,textAlign:"right"}}>{count} ITEMS</span>
  </div>
);

const tbtn = () => ({background:"transparent",border:"none",color:C.greenDim,fontSize:9,fontFamily:"monospace",padding:"3px 6px",cursor:"pointer",letterSpacing:1});
const tbtnActive = () => ({background:C.bgActive,border:`1px solid ${C.borderBright}`,color:C.green,fontSize:9,fontFamily:"monospace",padding:"3px 6px",cursor:"pointer",letterSpacing:1});
const tbtnGreen = () => ({background:"transparent",border:`1px solid ${C.borderMed}`,color:C.green,fontSize:9,fontFamily:"monospace",padding:"3px 8px",cursor:"pointer",letterSpacing:1});

// ── SIDEBAR ────────────────────────────────────────────────────────────────
const FolderRow = ({container,depth,active,containers,activeContainerId,containerAssetCounts,setActiveProjectId,setActiveContainerId,onAddFolder,onDeleteContainer,projectId,ctxMenu,setCtxMenu}) => {
  const [hovered,setHovered] = useState(null);
  const children = containers.filter(c=>c.parent_id===container.id);
  const isActive = activeContainerId===container.id;
  const indent = 8 + depth * 14;

  return (
    <div>
      <div
        onMouseEnter={()=>setHovered(container.id)}
        onMouseLeave={()=>setHovered(null)}
        onContextMenu={e=>{e.preventDefault();setCtxMenu({x:e.clientX,y:e.clientY,c:container,projectId});}}
        style={{display:"flex",alignItems:"center",background:isActive?C.bgActive:"transparent",borderLeft:`2px solid ${isActive?C.greenDim:"transparent"}`}}
      >
        <button onClick={()=>{setActiveProjectId(projectId);setActiveContainerId(container.id);}}
          style={{flex:1,background:"transparent",border:"none",display:"flex",alignItems:"center",gap:4,padding:`4px 8px 4px ${indent}px`,cursor:"pointer",textAlign:"left",fontFamily:"monospace"}}>
          <span style={{color:C.greenMuted,fontSize:8}}>{children.length>0?"▶":"—"}</span>
          <span style={{color:isActive?C.green:C.greenDim,fontSize:9,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{container.name}</span>
          <span style={{fontSize:8,color:C.greenMuted,minWidth:14,textAlign:"right"}}>{containerAssetCounts[container.id]||0}</span>
        </button>
        {(hovered===container.id||isActive)&&(
          <button
            onClick={e=>{e.stopPropagation();onAddFolder(projectId,container.id);}}
            title={`Add folder inside ${container.name}`}
            style={{background:"transparent",border:"none",color:C.green,fontSize:13,padding:"0 8px",cursor:"pointer",flexShrink:0,lineHeight:1,fontWeight:700}}
          >+</button>
        )}
      </div>
      {children.map(child=>(
        <FolderRow key={child.id}
          container={child} depth={depth+1}
          active={activeContainerId===child.id}
          containers={containers}
          activeContainerId={activeContainerId}
          containerAssetCounts={containerAssetCounts}
          setActiveProjectId={setActiveProjectId}
          setActiveContainerId={setActiveContainerId}
          onAddFolder={onAddFolder}
          onDeleteContainer={onDeleteContainer}
          projectId={projectId}
          ctxMenu={ctxMenu}
          setCtxMenu={setCtxMenu}
        />
      ))}
    </div>
  );
};

const Sidebar = ({projects,activeProjectId,setActiveProjectId,containers,activeContainerId,setActiveContainerId,containerAssetCounts,onAddFolder,onDeleteContainer}) => {
  const [expanded,setExpanded] = useState({});
  const [ctxMenu,setCtxMenu] = useState(null);

  useEffect(()=>{ const h=()=>setCtxMenu(null); window.addEventListener("click",h); return()=>window.removeEventListener("click",h); },[]);

  const rootContainers = (projectId) => containers.filter(c=>c.project_id===projectId&&!c.parent_id);

  return (
    <div style={{width:180,background:C.bgBase,borderRight:`1px solid ${C.borderMed}`,display:"flex",flexDirection:"column",flexShrink:0,fontFamily:"monospace",fontSize:9,overflowY:"auto"}}>
      <div style={{padding:"6px 8px",borderBottom:`1px solid ${C.border}`,color:C.greenMuted,letterSpacing:2,fontSize:8}}>FILES</div>

      {projects.map(p=>(
        <div key={p.id}>
          <button onClick={()=>{setActiveProjectId(p.id);setExpanded(e=>({...e,[p.id]:!e[p.id]}));}}
            style={{width:"100%",background:activeProjectId===p.id?C.bgActive:"transparent",border:"none",borderLeft:`2px solid ${activeProjectId===p.id?C.green:"transparent"}`,display:"flex",alignItems:"center",gap:4,padding:"5px 8px",cursor:"pointer",textAlign:"left",fontFamily:"monospace"}}>
            <span style={{color:C.greenDim,fontSize:10}}>{(expanded[p.id]||activeProjectId===p.id)?"▼":"▶"}</span>
            <span style={{color:activeProjectId===p.id?C.green:C.white,fontSize:9,letterSpacing:0.5,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.name}</span>
          </button>

          {(expanded[p.id]||activeProjectId===p.id) && rootContainers(p.id).map(c=>(
            <FolderRow key={c.id}
              container={c} depth={1}
              active={activeContainerId===c.id}
              containers={containers}
              activeContainerId={activeContainerId}
              containerAssetCounts={containerAssetCounts}
              setActiveProjectId={setActiveProjectId}
              setActiveContainerId={setActiveContainerId}
              onAddFolder={onAddFolder}
              onDeleteContainer={onDeleteContainer}
              projectId={p.id}
              ctxMenu={ctxMenu}
              setCtxMenu={setCtxMenu}
            />
          ))}
        </div>
      ))}

      <div style={{marginTop:"auto",padding:8,borderTop:`1px solid ${C.border}`}}>
        <button onClick={()=>onAddFolder(activeProjectId,activeContainerId)}
          style={{width:"100%",background:"transparent",border:`1px solid ${C.borderMed}`,color:C.green,fontSize:9,fontFamily:"monospace",padding:"5px 0",cursor:"pointer",letterSpacing:1}}
          title={activeContainerId?"Add folder inside current":"Add folder to project"}
          onMouseEnter={e=>e.currentTarget.style.borderColor=C.green}
          onMouseLeave={e=>e.currentTarget.style.borderColor=C.borderMed}>
          + ADD FOLDER {activeContainerId?"INSIDE":""}
        </button>
      </div>

      {ctxMenu&&(
        <div style={{position:"fixed",left:ctxMenu.x,top:ctxMenu.y,background:C.bgSurface,border:`1px solid ${C.borderMed}`,zIndex:500,fontFamily:"monospace"}} onClick={e=>e.stopPropagation()}>
          <CtxItem label={`Add folder inside "${ctxMenu.c.name}"`} onClick={()=>{onAddFolder(ctxMenu.projectId,ctxMenu.c.id);setCtxMenu(null);}}/>
          <CtxItem label="Add folder at same level" onClick={()=>{onAddFolder(ctxMenu.projectId,ctxMenu.c.parent_id||null);setCtxMenu(null);}}/>
          <CtxItem label="Delete folder" onClick={()=>{onDeleteContainer({id:ctxMenu.c.id,projectId:ctxMenu.projectId});setCtxMenu(null);}} danger/>
        </div>
      )}
    </div>
  );
};

const CtxItem = ({label,onClick,danger}) => (
  <button onClick={onClick} style={{display:"block",width:"100%",background:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,color:danger?"#8A3030":C.greenDim,fontSize:9,fontFamily:"monospace",padding:"7px 12px",cursor:"pointer",textAlign:"left",letterSpacing:1}}
    onMouseEnter={e=>e.currentTarget.style.background=C.bgHover}
    onMouseLeave={e=>e.currentTarget.style.background="transparent"}
  >{label}</button>
);

// ── ASSET GRID ─────────────────────────────────────────────────────────────
const AssetGrid = ({assets,selected,setSelected,multiSelected,setMultiSelected,thumbSize,viewMode,onDropFiles,onStartDrag,onStateChange,makeDragHandlers}) => {
  const [dragOver,setDragOver] = useState(false);
  const [rubber,setRubber] = useState(null); // {x0,y0,x1,y1}
  const [rubberActive,setRubberActive] = useState(false);
  const gridRef = useRef(null);
  const onDO = e=>{e.preventDefault();setDragOver(true);};
  const onDL = ()=>setDragOver(false);
  const onDrop = e=>{e.preventDefault();setDragOver(false);const fps=Array.from(e.dataTransfer.files).map(f=>f.path).filter(Boolean);if(fps.length)onDropFiles(fps);};
  const bdr = dragOver?`2px dashed ${C.green}`:`2px solid transparent`;

  const handleAssetClick = (e, asset) => {
    if (e.shiftKey && selected) {
      // Range select
      const idx1 = assets.findIndex(a=>a.id===selected);
      const idx2 = assets.findIndex(a=>a.id===asset.id);
      const [lo,hi] = [Math.min(idx1,idx2),Math.max(idx1,idx2)];
      const range = assets.slice(lo,hi+1).map(a=>a.id);
      setMultiSelected(new Set(range));
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle individual
      const next = new Set(multiSelected);
      if (next.has(asset.id)) next.delete(asset.id);
      else next.add(asset.id);
      setMultiSelected(next);
      setSelected(asset.id);
    } else {
      setMultiSelected(new Set([asset.id]));
      setSelected(asset.id);
    }
  };

  // Rubber band select
  const onGridMouseDown = (e) => {
    if (e.target !== gridRef.current) return; // Only on empty grid bg
    const rect = gridRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top + gridRef.current.scrollTop;
    setRubber({x0:x,y0:y,x1:x,y1:y});
    setRubberActive(true);
  };
  const onGridMouseMove = (e) => {
    if (!rubberActive||!rubber) return;
    const rect = gridRef.current.getBoundingClientRect();
    setRubber(r=>({...r,x1:e.clientX-rect.left,y1:e.clientY-rect.top+gridRef.current.scrollTop}));
  };
  const onGridMouseUp = () => {
    setRubberActive(false);
    setRubber(null);
  };

  const handleMultiDragStart = (e, asset) => {
    const selectedIds = multiSelected.size > 1 ? multiSelected : new Set([asset.id]);
    const selectedAssets = assets.filter(a=>selectedIds.has(a.id)&&a.file_path);
    if (selectedAssets.length === 0) return;
    if (selectedAssets.length === 1) {
      onStartDrag(selectedAssets[0]);
    } else {
      // Multi-file drag — start with first file, others follow
      onStartDrag(selectedAssets[0], selectedAssets.map(a=>a.file_path));
    }
  };

  // LIST
  if (viewMode==="list") return (
    <div onDragOver={onDO} onDragLeave={onDL} onDrop={onDrop} style={{flex:1,overflowY:"auto",border:bdr,fontFamily:"monospace"}}>
      <div style={{display:"grid",gridTemplateColumns:"36px 1fr 70px 80px 60px",gap:"0 8px",padding:"4px 12px",borderBottom:`1px solid ${C.border}`,background:C.bgSurface}}>
        {["#","NAME","TYPE","STATE","SIZE"].map(h=><span key={h} style={{fontSize:8,color:C.greenMuted,letterSpacing:2}}>{h}</span>)}
      </div>
      {assets.map((a,i)=>(
        <div key={a.id} onClick={()=>setSelected(a.id)} draggable={!!a.file_path} onDragStart={(e)=>{if(a.file_path){e.dataTransfer.setData('text/plain',a.file_path);e.dataTransfer.effectAllowed='copy';onStartDrag(a);}}}
          style={{display:"grid",gridTemplateColumns:"36px 1fr 70px 80px 60px",gap:"0 8px",alignItems:"center",padding:"5px 12px",background:selected===a.id?C.bgActive:"transparent",borderLeft:`2px solid ${selected===a.id?C.green:"transparent"}`,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:9,color:C.greenMuted}}>{String(i+1).padStart(3,"0")}</span>
          <span style={{fontSize:10,color:selected===a.id?C.green:C.white,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</span>
          <span style={{fontSize:9,color:C.greenDim}}>{a.type.toUpperCase()}</span>
          <span style={{fontSize:9,color:STATE_COLOR[a.state]||C.greenMuted,fontWeight:700}}>{(a.state||"raw").toUpperCase()}</span>
          <span style={{fontSize:9,color:C.greenMuted}}>{a.size}</span>
        </div>
      ))}
      {dragOver&&<div style={{padding:20,textAlign:"center",color:C.green,fontSize:11,border:`1px dashed ${C.green}`,margin:8,fontFamily:"monospace",letterSpacing:2}}>DROP TO IMPORT_</div>}
    </div>
  );

  // MANIFEST
  if (viewMode==="manifest") return (
    <div onDragOver={onDO} onDragLeave={onDL} onDrop={onDrop} style={{flex:1,overflowY:"auto",border:bdr,fontFamily:"monospace"}}>
      <div style={{padding:"6px 12px",background:C.bgSurface,borderBottom:`1px solid ${C.borderMed}`,display:"flex",gap:12,alignItems:"center"}}>
        <span style={{fontSize:9,color:C.green,letterSpacing:2}}>MANIFEST</span>
        <span style={{fontSize:8,color:C.greenMuted}}>{assets.length} TOTAL · {assets.filter(a=>['approved','final'].includes(a.state)).length} APPROVED/FINAL</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"36px 1fr 70px 90px 60px",gap:"0 8px",padding:"4px 12px",borderBottom:`1px solid ${C.border}`,background:C.bgSurface}}>
        {["SEQ","NAME","TYPE","STATE","SIZE"].map(h=><span key={h} style={{fontSize:8,color:C.greenMuted,letterSpacing:2}}>{h}</span>)}
      </div>
      {assets.map((a,i)=>(
        <div key={a.id} onClick={()=>setSelected(a.id)}
          style={{display:"grid",gridTemplateColumns:"36px 1fr 70px 90px 60px",gap:"0 8px",alignItems:"center",padding:"6px 12px",background:selected===a.id?C.bgActive:"transparent",borderLeft:`3px solid ${STATE_COLOR[a.state]||C.borderMed}`,cursor:"pointer",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:9,color:C.greenMuted}}>{String(i+1).padStart(3,"0")}</span>
          <span style={{fontSize:10,color:selected===a.id?C.green:C.white,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</span>
          <span style={{fontSize:9,color:C.greenDim}}>{a.type.toUpperCase()}</span>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:9,color:STATE_COLOR[a.state]||C.greenMuted,fontWeight:700}}>{(a.state||"raw").toUpperCase()}</span>
            {['approved','final'].includes(a.state)&&<span style={{color:C.green,fontSize:10}}>✓</span>}
          </div>
          <span style={{fontSize:9,color:C.greenMuted}}>{a.size}</span>
        </div>
      ))}
    </div>
  );

  // GRID
  const isMulti = multiSelected && multiSelected.size > 1;
  return (
    <div ref={gridRef} onDragOver={onDO} onDragLeave={onDL} onDrop={onDrop}
      onMouseDown={onGridMouseDown} onMouseMove={onGridMouseMove} onMouseUp={onGridMouseUp}
      style={{flex:1,overflowY:"auto",padding:10,display:"grid",gridTemplateColumns:`repeat(auto-fill,minmax(${thumbSize}px,1fr))`,gap:8,alignContent:"start",border:bdr,position:"relative",userSelect:"none"}}>
      {assets.map((a,i)=>{
        const isSelected = multiSelected ? multiSelected.has(a.id) : selected===a.id;
        return (
        <div key={a.id}
          onClick={(e)=>handleAssetClick(e,a)}
          draggable={!!a.file_path}
          onDragStart={(e)=>{e.dataTransfer.setData('text/plain',a.file_path||'');e.dataTransfer.effectAllowed='copy';handleMultiDragStart(e,a);}}
          style={{cursor:a.file_path?"grab":"default",border:`2px solid ${isSelected?C.green:C.borderMed}`,background:isSelected?C.bgActive:C.bgSurface,overflow:"hidden",fontFamily:"monospace",userSelect:"none",outline:isSelected?`1px solid ${C.greenDim}`:"none"}}>
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",padding:4,background:C.bgBase,position:"relative"}}>
            <AssetThumb asset={a} size={Math.max(thumbSize-16,44)}/>
            <span style={{position:"absolute",top:4,left:6,fontSize:8,color:C.greenMuted}}>{String(i+1).padStart(3,"0")}</span>
            {isSelected&&isMulti&&<span style={{position:"absolute",top:4,right:6,fontSize:10,color:C.green}}>✓</span>}
          </div>
          <div style={{padding:"3px 5px",borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:9,color:isSelected?C.green:C.white,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.title}</div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:1}}>
              <span style={{fontSize:8,color:C.greenDim}}>{a.type.toUpperCase()}</span>
              <span style={{fontSize:8,color:STATE_COLOR[a.state]||C.greenMuted,fontWeight:700}}>{(a.state||"raw").toUpperCase()}</span>
            </div>
          </div>
        </div>
        );
      })}
      {isMulti&&(
        <div style={{position:"sticky",bottom:0,gridColumn:"1 / -1",background:C.bgSurface,border:`1px solid ${C.borderMed}`,padding:"6px 12px",display:"flex",alignItems:"center",gap:10,fontFamily:"monospace",fontSize:9}}>
          <span style={{color:C.green}}>{multiSelected.size} SELECTED</span>
          <span style={{color:C.greenMuted}}>·</span>
          {STATE_OPTS.map(s=><button key={s} onClick={()=>onStateChange(null,s,true)} style={{background:"transparent",border:`1px solid ${C.borderMed}`,color:STATE_COLOR[s],fontSize:8,fontFamily:"monospace",padding:"2px 6px",cursor:"pointer"}}>→ {s.toUpperCase()}</button>)}
          <span style={{flex:1}}/>
          <button onClick={()=>setMultiSelected(new Set())} style={{background:"transparent",border:"none",color:C.greenMuted,fontSize:8,fontFamily:"monospace",cursor:"pointer"}}>CLEAR</button>
        </div>
      )}
      {dragOver&&<div style={{gridColumn:"1 / -1",padding:20,textAlign:"center",color:C.green,fontSize:11,border:`1px dashed ${C.green}`,fontFamily:"monospace",letterSpacing:2}}>DROP TO IMPORT_</div>}
      {assets.length===0&&!dragOver&&(
        <div style={{gridColumn:"1 / -1",padding:48,textAlign:"center",color:C.greenMuted,fontFamily:"monospace",lineHeight:3}}>
          <div style={{fontSize:24,opacity:0.25}}>📂</div>
          <div style={{fontSize:10,letterSpacing:2}}>FOLDER EMPTY</div>
          <div style={{fontSize:9,opacity:0.5}}>DRAG FILES HERE OR CLICK IMPORT</div>
        </div>
      )}
    </div>
  );
};

// ── INSPECTOR ──────────────────────────────────────────────────────────────
const Inspector = ({asset,onUpdate,onDelete,onOpen,onStartDrag}) => {
  const [tab,setTab] = useState("meta");
  useEffect(()=>setTab("meta"),[asset?.id]);
  if (!asset) return (
    <div style={{width:220,background:C.bgBase,borderLeft:`1px solid ${C.borderMed}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"monospace"}}>
      <div style={{color:C.greenMuted,fontSize:9,letterSpacing:2,textAlign:"center",lineHeight:3}}>
        <div style={{fontSize:20,marginBottom:8,opacity:0.2}}>▣</div>INSPECTOR<br/><span style={{fontSize:8,opacity:0.5}}>SELECT A FILE</span>
      </div>
    </div>
  );
  return (
    <div style={{width:220,background:C.bgBase,borderLeft:`1px solid ${C.borderMed}`,display:"flex",flexDirection:"column",overflow:"hidden",fontFamily:"monospace"}}>
      <div style={{padding:"6px 8px",background:C.bgSurface,borderBottom:`1px solid ${C.borderMed}`}}>
        <div style={{fontSize:9,color:C.green,fontWeight:700,letterSpacing:1,marginBottom:2}}>INSPECTOR</div>
        <div style={{display:"flex",justifyContent:"center",marginBottom:6}}>
          <AssetThumb asset={asset} size={160}/>
        </div>
        {asset.type==="audio"&&<div style={{marginBottom:4}}><Waveform h={20}/></div>}
      </div>

      <div style={{display:"flex",borderBottom:`1px solid ${C.borderMed}`}}>
        {["META","PROMPT","SOURCE"].map(t=>(
          <button key={t} onClick={()=>setTab(t.toLowerCase())} style={{flex:1,background:tab===t.toLowerCase()?C.bgElevated:"transparent",border:"none",borderBottom:`2px solid ${tab===t.toLowerCase()?C.green:"transparent"}`,color:tab===t.toLowerCase()?C.green:C.greenMuted,fontSize:8,padding:"4px 0",cursor:"pointer",fontFamily:"monospace",letterSpacing:1}}>{t}</button>
        ))}
      </div>

      <div style={{flex:1,overflowY:"auto",padding:8}}>
        {tab==="meta"&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <InfoRow label="NAME" value={asset.title}/>
            <InfoRow label="TYPE" value={asset.type.toUpperCase()}/>
            {asset.size&&<InfoRow label="SIZE" value={asset.size}/>}
            {asset.dimensions&&asset.dimensions!=="—"&&<InfoRow label="DIMENSIONS" value={asset.dimensions}/>}
            {asset.created_at&&<InfoRow label="ADDED" value={asset.created_at.slice(0,16).replace("T"," ")}/>}
            <div style={{height:1,background:C.border,margin:"2px 0"}}/>
            <div>
              <div style={{fontSize:8,color:C.greenMuted,letterSpacing:2,marginBottom:3}}>NOTES</div>
              <textarea key={asset.id+"n"} defaultValue={asset.notes} onBlur={e=>onUpdate({...asset,notes:e.target.value})} rows={4}
                style={{width:"100%",boxSizing:"border-box",background:C.bgElevated,border:`1px solid ${C.borderMed}`,color:C.green,fontSize:9,padding:"4px 5px",outline:"none",resize:"vertical",fontFamily:"monospace",lineHeight:1.5}}/>
            </div>
            {asset.original_name&&(
              <div>
                <div style={{fontSize:8,color:C.greenMuted,letterSpacing:2,marginBottom:2}}>ORIGINAL NAME STORED</div>
                <div style={{fontSize:8,color:C.greenDim,wordBreak:"break-all"}}>{asset.original_name}</div>
              </div>
            )}
            <div style={{height:1,background:C.border,margin:"2px 0"}}/>
            <div>
              <div style={{fontSize:8,color:C.greenMuted,letterSpacing:2,marginBottom:4}}>STATE</div>
              <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                {STATE_OPTS.map(s=>(
                  <button key={s} onClick={()=>onUpdate({...asset,state:s})}
                    style={{flex:1,minWidth:40,background:asset.state===s?C.bgActive:"transparent",border:`1px solid ${asset.state===s?STATE_COLOR[s]:C.borderMed}`,color:STATE_COLOR[s],fontSize:7,fontFamily:"monospace",padding:"3px 2px",cursor:"pointer",letterSpacing:0}}>
                    {s==="approved"?"✓ APPRVD":s==="final"?"★ FINAL":s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",gap:4,marginTop:4}}>
              {asset.file_path&&<button draggable onDragStart={(e)=>{e.dataTransfer.setData('text/plain',asset.file_path);e.dataTransfer.effectAllowed='copy';onStartDrag(asset);}} onClick={()=>onStartDrag(asset)} style={inspBtn(C.green)} title="Drag this file into Finder, Gmail, or any app">[ DRAG OUT ]</button>}
              {asset.file_path&&<button onClick={()=>onOpen(asset.file_path)} style={inspBtn(C.greenDim)}>[ OPEN ]</button>}
            </div>
            <button onClick={()=>onDelete(asset.id)} style={{background:"transparent",border:`1px solid #3A1515`,color:"#8A3030",fontSize:8,fontFamily:"monospace",padding:"4px 0",cursor:"pointer",letterSpacing:1}}>[ DELETE ]</button>
          </div>
        )}
        {tab==="prompt"&&(
          <div>
            <div style={{fontSize:8,color:C.greenMuted,letterSpacing:2,marginBottom:6}}>PROMPT BLOCK</div>
            <textarea key={asset.id+"p"} defaultValue={asset.prompt_text}
              onBlur={e=>onUpdate({...asset,prompt_text:e.target.value})}
              placeholder="// PASTE PROMPT OR AI INSTRUCTIONS..."
              rows={10}
              style={{width:"100%",boxSizing:"border-box",background:"#060C07",border:`1px solid ${C.borderMed}`,color:C.greenDim,fontSize:9,padding:"5px 6px",outline:"none",resize:"vertical",fontFamily:"monospace",lineHeight:1.6}}/>
            {asset.prompt_text&&<button onClick={()=>navigator.clipboard?.writeText(asset.prompt_text)} style={inspBtn(C.greenDim)}>[ COPY PROMPT ]</button>}
          </div>
        )}
        {tab==="source"&&(
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <IField label="SOURCE" value={asset.source||""} onChange={v=>onUpdate({...asset,source:v})}/>
            <IField label="LICENSE" value={asset.license||""} onChange={v=>onUpdate({...asset,license:v})}/>
            {asset.original_name&&<InfoRow label="ORIGINAL FILE" value={asset.original_name}/>}
          </div>
        )}
      </div>
    </div>
  );
};

const inspBtn = (color) => ({flex:1,background:"transparent",border:`1px solid ${color}`,color,fontSize:8,fontFamily:"monospace",padding:"4px 0",cursor:"pointer",letterSpacing:1});
const InfoRow = ({label,value}) => (
  <div style={{display:"flex",flexDirection:"column",gap:1}}>
    <span style={{fontSize:7,color:C.greenMuted,letterSpacing:2}}>{label}:</span>
    <span style={{fontSize:9,color:C.white,wordBreak:"break-word"}}>{value}</span>
  </div>
);
const IField = ({label,value,onChange}) => (
  <div>
    <div style={{fontSize:7,color:C.greenMuted,letterSpacing:2,marginBottom:2}}>{label}:</div>
    <input defaultValue={value} key={value} onBlur={e=>onChange?.(e.target.value)}
      style={{width:"100%",boxSizing:"border-box",background:C.bgElevated,border:`1px solid ${C.borderMed}`,color:C.green,fontSize:9,padding:"3px 5px",outline:"none",fontFamily:"monospace"}}/>
  </div>
);

// ── NARROW / DOCKED STRIP ─────────────────────────────────────────────────
const NarrowStrip = ({assets,containerName,onExpand,onStartDrag,onDropFiles,onStateChange}) => {
  const [dragOver,setDragOver]=useState(false);
  const onDO=e=>{e.preventDefault();setDragOver(true);};
  const onDL=()=>setDragOver(false);
  const onDrop=e=>{e.preventDefault();setDragOver(false);const fps=Array.from(e.dataTransfer.files).map(f=>f.path).filter(Boolean);if(fps.length)onDropFiles(fps);};

  return (
    <div onDragOver={onDO} onDragLeave={onDL} onDrop={onDrop}
      style={{width:"100%",height:"100%",background:C.bgBase,border:`1px solid ${C.borderMed}`,display:"flex",flexDirection:"column",fontFamily:"monospace",overflow:"hidden",flex:1}}>

      {/* Header */}
      <div style={{padding:"6px 8px",borderBottom:`1px solid ${C.borderMed}`,display:"flex",alignItems:"center",gap:4,background:"#040904"}}>
        <span style={{fontSize:8,color:C.green,letterSpacing:1,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{containerName?.toUpperCase()||"DOCKYARD"}</span>
      </div>
      <button onClick={onExpand}
        style={{width:"100%",background:C.bgActive,border:"none",borderBottom:`1px solid ${C.borderMed}`,color:C.green,fontSize:9,fontFamily:"monospace",padding:"5px 0",cursor:"pointer",letterSpacing:2,textAlign:"center"}}>
        ◀▶ FULL MODE
      </button>

      {/* Connector badge */}
      <div style={{margin:"4px 8px",padding:"4px 6px",background:C.bgActive,border:`1px solid ${C.borderBright}`,fontSize:8,color:C.green,letterSpacing:1,textAlign:"center"}}>
        DOCKED TO:<br/>WORK APP
      </div>

      {/* Asset cards */}
      <div style={{flex:1,overflowY:"auto",padding:"4px 0"}}>
        {assets.map((a,i)=>(
          <div key={a.id} style={{borderBottom:`1px solid ${C.border}`,padding:"4px 6px",display:"flex",alignItems:"center",gap:6}}>
            <div draggable={!!a.file_path} onDragStart={(e)=>{if(a.file_path){e.dataTransfer.setData('text/plain',a.file_path);e.dataTransfer.effectAllowed='copy';onStartDrag(a);}}} style={{cursor:a.file_path?'grab':'default',flexShrink:0}}>
              <AssetThumb asset={a} size={40}/>
            </div>
            <div style={{flex:1,overflow:"hidden"}}>
              <div style={{fontSize:8,color:C.greenMuted,marginBottom:1}}>{String(i+1).padStart(3,"0")}</div>
              <div style={{fontSize:7,color:C.greenDim,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.type.toUpperCase()}</div>
              <div style={{display:"flex",alignItems:"center",gap:3,marginTop:2}}>
                <input type="checkbox"
                  checked={['approved','final'].includes(a.state)}
                  onChange={e=>onStateChange(a.id, e.target.checked?'approved':'raw')}
                  style={{accentColor:C.green,width:10,height:10,cursor:"pointer"}}/>
                <span style={{fontSize:7,color:STATE_COLOR[a.state]||C.greenMuted}}>{(a.state||"raw").toUpperCase()}</span>
              </div>
            </div>
          </div>
        ))}
        {dragOver&&<div style={{padding:12,textAlign:"center",color:C.green,fontSize:8,border:`1px dashed ${C.green}`,margin:6,letterSpacing:1}}>DROP</div>}
        {assets.length===0&&!dragOver&&(
          <div style={{padding:16,textAlign:"center",color:C.greenMuted,fontSize:8,letterSpacing:1,lineHeight:2}}>
            EMPTY<br/><span style={{opacity:0.5}}>DROP FILES</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{padding:"4px 8px",borderTop:`1px solid ${C.border}`,textAlign:"center"}}>
        <span style={{fontSize:8,color:C.greenMuted,letterSpacing:1}}>F9 HIDE</span>
      </div>
    </div>
  );
};

// ── EMPTY / WELCOME ────────────────────────────────────────────────────────
const Welcome = ({onCreate}) => (
  <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"monospace",padding:48}}>
    <div style={{fontSize:32,color:C.greenMuted,opacity:0.2}}>📂</div>
    <div style={{fontSize:12,color:C.greenDim,letterSpacing:2}}>WELCOME TO DOCKYARD</div>
    <div style={{fontSize:9,color:C.greenMuted,letterSpacing:1,textAlign:"center",maxWidth:320,lineHeight:2.2}}>
      YOUR LOCAL ASSET MANAGER.<br/>
      WORKS LIKE FINDER — STICKS TO ANY WINDOW.<br/>
      DRAG FILES IN. DRAG FILES OUT. ANYWHERE.
    </div>
    <button onClick={onCreate}
      style={{background:C.bgActive,border:`1px solid ${C.green}`,color:C.green,fontSize:11,fontFamily:"monospace",padding:"12px 28px",cursor:"pointer",letterSpacing:2,marginTop:8}}>
      + CREATE YOUR FIRST PROJECT
    </button>
    <div style={{fontSize:8,color:C.greenMuted,letterSpacing:1,opacity:0.6,textAlign:"center",lineHeight:2}}>
      OR DRAG FILES ANYWHERE TO START
    </div>
  </div>
);

// ── STATUS BAR ─────────────────────────────────────────────────────────────
const StatusBar = ({count,total,path}) => {
  const [time,setTime]=useState("");
  useEffect(()=>{const t=()=>{const n=new Date();setTime(`${String(n.getHours()).padStart(2,"0")}:${String(n.getMinutes()).padStart(2,"0")}:${String(n.getSeconds()).padStart(2,"0")}`);};t();const id=setInterval(t,1000);return()=>clearInterval(id);},[]);
  return (
    <div style={{height:20,background:"#050905",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",padding:"0 10px",gap:8,flexShrink:0,fontFamily:"monospace"}}>
      <span style={{fontSize:8,color:C.greenMuted,letterSpacing:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{path||"—"}</span>
      <span style={{fontSize:8,color:C.greenMuted,letterSpacing:1,flexShrink:0}}>{count}/{total} ITEMS</span>
      <span style={{fontSize:8,color:C.greenDim,letterSpacing:2,flexShrink:0}}>{time} ●</span>
    </div>
  );
};

const KeyBar = () => (
  <div style={{height:18,background:"#040804",borderTop:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:16,fontFamily:"monospace",flexShrink:0}}>
    {["F1 FOLDERS","F2 RAW","F3 SEARCH","F9 HIDE"].map(k=>(
      <span key={k} style={{fontSize:7,color:C.greenMuted,letterSpacing:1}}>{k}</span>
    ))}
  </div>
);

// ── MODALS ─────────────────────────────────────────────────────────────────
const Modal = ({title,children,onClose}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:C.bgSurface,border:`1px solid ${C.borderMed}`,padding:20,width:300,fontFamily:"monospace"}}>
      <div style={{fontSize:10,color:C.green,letterSpacing:2,marginBottom:14}}>{title}</div>
      {children}
    </div>
  </div>
);
const ML=({c})=><div style={{fontSize:8,color:C.greenMuted,letterSpacing:2,marginBottom:3}}>{c}</div>;
const MI=({value,onChange,placeholder,autoFocus})=>(
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
    style={{width:"100%",boxSizing:"border-box",background:"transparent",border:`1px solid ${C.borderMed}`,color:C.green,fontSize:10,padding:"5px 7px",outline:"none",fontFamily:"monospace",marginBottom:10}}/>
);
const MTA=({value,onChange,placeholder})=>(
  <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={2}
    style={{width:"100%",boxSizing:"border-box",background:"transparent",border:`1px solid ${C.borderMed}`,color:C.green,fontSize:9,padding:"4px 7px",outline:"none",resize:"none",fontFamily:"monospace",marginBottom:10}}/>
);
const MBtns=({onCancel,onOk,okLabel="[ CREATE ]"})=>(
  <div style={{display:"flex",gap:8}}>
    <button onClick={onCancel} style={{flex:1,background:"transparent",border:`1px solid ${C.borderMed}`,color:C.greenDim,fontSize:9,fontFamily:"monospace",padding:"6px 0",cursor:"pointer",letterSpacing:1}}>[ CANCEL ]</button>
    <button onClick={onOk} style={{flex:1,background:C.bgActive,border:`1px solid ${C.green}`,color:C.green,fontSize:9,fontFamily:"monospace",padding:"6px 0",cursor:"pointer",letterSpacing:1,fontWeight:700}}>{okLabel}</button>
  </div>
);

const NewProjectModal=({onClose,onCreate})=>{
  const [name,setName]=useState(""); const [client,setClient]=useState("");
  return <Modal title="// NEW PROJECT" onClose={onClose}>
    <ML c="PROJECT NAME"/><MI value={name} onChange={setName} placeholder="My Project" autoFocus/>
    <ML c="CLIENT (OPTIONAL)"/><MI value={client} onChange={setClient} placeholder="Client name"/>
    <MBtns onCancel={onClose} onOk={()=>{if(name.trim())onCreate({name:name.trim(),client});}}/>
  </Modal>;
};

const NewFolderModal=({onClose,onCreate,parentName})=>{
  const [name,setName]=useState("");
  return <Modal title={parentName?`// ADD FOLDER INSIDE "${parentName.toUpperCase()}"` :"// NEW FOLDER"} onClose={onClose}>
    <ML c="FOLDER NAME"/><MI value={name} onChange={setName} placeholder="Folder name" autoFocus/>
    <MBtns onCancel={onClose} onOk={()=>{if(name.trim())onCreate({name:name.trim()});}}/>
  </Modal>;
};

const NotesModal=({container,onClose,onSave})=>{
  const [notes,setNotes]=useState(container?.notes||"");
  return <Modal title={`// NOTES — ${container?.name?.toUpperCase()||""}`} onClose={onClose}>
    <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={10} placeholder="Type or paste notes here..."
      style={{width:"100%",boxSizing:"border-box",background:C.bgElevated,border:`1px solid ${C.borderMed}`,color:C.green,fontSize:10,padding:"6px 8px",outline:"none",resize:"vertical",fontFamily:"monospace",marginBottom:10,lineHeight:1.6}}/>
    <MBtns onCancel={onClose} onOk={()=>onSave(notes)} okLabel="[ SAVE NOTES ]"/>
  </Modal>;
};

const Notif=({msg})=>msg?<div style={{position:"fixed",top:44,right:12,background:C.bgSurface,border:`1px solid ${C.green}`,padding:"6px 12px",fontSize:9,color:C.green,fontFamily:"monospace",letterSpacing:1,zIndex:300}}>{msg}</div>:null;

// ── ROOT ───────────────────────────────────────────────────────────────────
export default function App() {
  const [projects,setProjects]       = useState([]);
  const [containers,setContainers]   = useState([]);
  const [assetMap,setAssetMap]       = useState({});
  const [activeProjectId,setActiveProjectId] = useState(null);
  const [activeContainerId,setActiveContainerId] = useState(null);
  const [selectedAssetId,setSelectedAssetId] = useState(null);
  const [multiSelected,setMultiSelected] = useState(new Set());
  const [narrow,setNarrow]           = useState(false);
  const [alwaysOnTop,setAlwaysOnTop] = useState(false);
  const [dataDir,setDataDir]         = useState("");
  const [thumbSize,setThumbSize]     = useState(90);
  const [viewMode,setViewMode]       = useState("grid");
  const [search,setSearch]           = useState("");
  const [notification,setNotification] = useState(null);
  const [modal,setModal]             = useState(null); // 'new-project'|'new-folder'|'notes'
  const [newFolderMeta,setNewFolderMeta] = useState({projectId:null,parentId:null,parentName:null});

  const notify=(msg,ms=3000)=>{setNotification(msg);setTimeout(()=>setNotification(null),ms);};

  const handleSetNarrow = async (val) => {
    if (val) {
      // Save current size and shrink to narrow strip
      if (window.dockyard?.getDataDir) {
        // Use Electron to resize window
        try {
          const w = window.outerWidth;
          const h = window.outerHeight;
          prevSize.current = {width:w,height:h};
        } catch(e) {}
      }
      setNarrow(true);
    } else {
      setNarrow(false);
    }
  };

  // Bootstrap
  useEffect(()=>{
    (async()=>{
      const dir = await api.getDataDir();
      setDataDir(dir);
      const ps = await api.getProjects();
      setProjects(ps);
      if (ps.length>0) {
        const pid=ps[0].id;
        setActiveProjectId(pid);
        const cs=await api.getContainers(pid);
        setContainers(cs);
        if (cs.length>0) {
          setActiveContainerId(cs[0].id);
          const a=await api.getAssets(cs[0].id);
          setAssetMap({[cs[0].id]:a});
        }
      }
    })();
  },[]);

  useEffect(()=>{
    if (!activeProjectId) return;
    api.getContainers(activeProjectId).then(cs=>setContainers(prev=>[...prev.filter(c=>c.project_id!==activeProjectId),...cs]));
  },[activeProjectId]);

  useEffect(()=>{
    if (!activeContainerId||assetMap[activeContainerId]) return;
    api.getAssets(activeContainerId).then(async a=>{
      setAssetMap(m=>({...m,[activeContainerId]:a}));
      // Auto-regenerate thumbnails for assets missing them
      const needsThumbs = a.filter(x=>['image','vector'].includes(x.type)&&!x.thumb_path);
      if (needsThumbs.length > 0) {
        console.log(`[THUMB] ${needsThumbs.length} assets need thumbnails, regenerating...`);
        const count = await api.regenThumbnails({containerId:activeContainerId});
        if (count > 0) {
          // Reload assets to get updated thumb paths
          const updated = await api.getAssets(activeContainerId);
          setAssetMap(m=>({...m,[activeContainerId]:updated}));
        }
      }
    });
  },[activeContainerId]);

  const activeProject   = projects.find(p=>p.id===activeProjectId)||null;
  const activeContainer = containers.find(c=>c.id===activeContainerId)||null;
  const rawAssets       = assetMap[activeContainerId]||[];
  const filteredAssets  = rawAssets.filter(a=>{
    const q=search.toLowerCase();
    return !q||a.title.toLowerCase().includes(q)||(a.tags||[]).join(" ").includes(q)||(a.notes||"").toLowerCase().includes(q);
  });
  const selectedAsset   = rawAssets.find(a=>a.id===selectedAssetId)||null;
  const containerAssetCounts = Object.fromEntries(containers.map(c=>[c.id,(assetMap[c.id]||[]).length]));

  const currentPath = activeProject&&activeContainer ? `${activeProject.name} / ${activeContainer.name}` : activeProject?.name||"";

  // Import
  const handleImport = async () => {
    if (!activeContainerId||!activeContainer) return notify("SELECT A FOLDER FIRST");
    const imported = await api.importFilesDialog({containerId:activeContainerId,projectId:activeProjectId,containerName:activeContainer.name});
    if (!imported.length) return;
    setAssetMap(m=>({...m,[activeContainerId]:[...(m[activeContainerId]||[]),...imported]}));
    notify(`IMPORTED ${imported.length} FILE${imported.length>1?"S":""}`);
  };

  const handleDroppedFiles = useCallback(async(filePaths)=>{
    if (!activeContainerId||!activeContainer) return notify("SELECT A FOLDER FIRST");
    const imported = await api.importDroppedFiles({filePaths,containerId:activeContainerId,projectId:activeProjectId,containerName:activeContainer.name});
    if (!imported.length) return;
    setAssetMap(m=>({...m,[activeContainerId]:[...(m[activeContainerId]||[]),...imported]}));
    notify(`IMPORTED ${imported.length} FILE${imported.length>1?"S":""}`);
  },[activeContainerId,activeContainer,activeProjectId]);

  const handleStartDrag = useCallback((asset, extraPaths=[])=>{
    if (asset.file_path) api.startDrag({filePath:asset.file_path,thumbPath:asset.thumb_path||''});
  },[]);

  const makeDragHandlers = (asset) => ({
    draggable: !!asset.file_path,
    onDragStart: (e) => {
      if (!asset.file_path) return;
      // Set drag data for in-app drops
      e.dataTransfer.setData('text/plain', asset.file_path);
      e.dataTransfer.effectAllowed = 'copy';
      // Trigger Electron native drag-out
      api.startDrag({filePath: asset.file_path, thumbPath: asset.thumb_path||''});
    },
  });

  const handleUpdateAsset = async(updated)=>{
    await api.upsertAsset(updated);
    setAssetMap(m=>({...m,[activeContainerId]:m[activeContainerId].map(a=>a.id===updated.id?updated:a)}));
  };

  const handleStateChange = async(id,state,batch=false)=>{
    if (batch && multiSelected.size > 0) {
      for (const mid of multiSelected) {
        await api.setAssetState({id:mid,state});
      }
      setAssetMap(m=>({...m,[activeContainerId]:m[activeContainerId].map(a=>multiSelected.has(a.id)?{...a,state}:a)}));
    } else {
      await api.setAssetState({id,state});
      setAssetMap(m=>({...m,[activeContainerId]:m[activeContainerId].map(a=>a.id===id?{...a,state}:a)}));
    }
  };

  const handleDeleteAsset = async(id)=>{
    await api.deleteAsset(id);
    setAssetMap(m=>({...m,[activeContainerId]:m[activeContainerId].filter(a=>a.id!==id)}));
    setSelectedAssetId(null);
    notify("FILE DELETED");
  };

  const handleCreateProject = async({name,client})=>{
    const p={id:makeId("proj"),name,client,description:"",scope:"",deliverables:"",deadline:"",status:"active",notes:""};
    const updated=await api.upsertProject(p);
    const newPs=updated.length?updated:[...projects,p];
    setProjects(newPs);
    const newCs=[];
    for (const dc of DEFAULT_CONTAINERS) {
      const c={id:makeId("cont"),project_id:p.id,parent_id:null,name:dc.name,notes:dc.notes,sort_order:dc.sort_order};
      await api.upsertContainer(c); newCs.push(c);
    }
    setContainers(prev=>[...prev,...newCs]);
    setAssetMap(m=>{const n={...m};newCs.forEach(c=>{n[c.id]=[];});return n;});
    setActiveProjectId(p.id);
    setActiveContainerId(newCs[0].id);
    setModal(null);
    notify(`PROJECT CREATED: ${name.toUpperCase()}`);
  };

  const openAddFolder=(projectId,parentId)=>{
    const parent=containers.find(c=>c.id===parentId);
    setNewFolderMeta({projectId,parentId:parentId||null,parentName:parent?.name||null});
    setModal("new-folder");
  };

  const handleCreateFolder=async({name})=>{
    const {projectId,parentId}=newFolderMeta;
    if (!projectId) return;
    const c={id:makeId("cont"),project_id:projectId,parent_id:parentId||null,name,notes:"",sort_order:containers.filter(x=>x.project_id===projectId).length};
    const updated=await api.upsertContainer(c);
    setContainers(prev=>[...prev.filter(x=>x.project_id!==projectId),...updated]);
    setAssetMap(m=>({...m,[c.id]:[]}));
    setActiveProjectId(projectId);
    setActiveContainerId(c.id);
    setModal(null);
    notify(`FOLDER CREATED: ${name.toUpperCase()}`);
  };

  const handleSaveNotes=async(notes)=>{
    if (!activeContainer) return;
    const updated={...activeContainer,notes};
    await api.upsertContainer(updated);
    setContainers(prev=>prev.map(c=>c.id===activeContainer.id?updated:c));
    setModal(null);
    notify("NOTES SAVED");
  };

  const handleToggleTop=async()=>{
    const next=await api.toggleAlwaysOnTop();
    setAlwaysOnTop(next);
    notify(next?"PINNED — ALWAYS ON TOP":"UNPINNED");
  };

  const handleImportPkg=async()=>{
    if (!activeProjectId) return notify("SELECT A PROJECT FIRST");
    const cs=await api.importDockPackage({projectId:activeProjectId});
    if (cs){setContainers(prev=>[...prev.filter(c=>c.project_id!==activeProjectId),...cs]);notify("PACKAGE IMPORTED");}
  };

  const handleRegenThumbs = async () => {
    notify("REGENERATING THUMBNAILS...");
    const result = await api.regenerateThumbnails({ containerId: activeContainerId });
    // Reload assets to get updated thumb paths
    if (activeContainerId) {
      const assets = await api.getAssets(activeContainerId);
      setAssetMap(m=>({...m,[activeContainerId]:assets}));
    }
    notify(`REGENERATED ${result?.count||0} THUMBNAILS`);
  };

  const handleExport=async()=>{
    if (!activeContainer) return;
    const ok=await api.exportContainer({container:activeContainer,assets:rawAssets,project:activeProject});
    if (ok) notify("EXPORTED AS .DOCKYARD.ZIP");
  };

  useEffect(()=>{
    const h=(e)=>{
      if (e.key==="F9") setNarrow(n=>!n);
      if (e.key==="F2") {
        const raw=containers.find(c=>c.project_id===activeProjectId&&c.name.toLowerCase()==="raw");
        if (raw) setActiveContainerId(raw.id);
      }
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[containers,activeProjectId]);

  // ── NARROW MODE ────────────────────────────────────────────────────────
  if (narrow) return (
    <div style={{fontFamily:"monospace",background:C.bgBase,color:C.green,height:"100vh",width:"100vw",overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <NarrowStrip
        assets={filteredAssets}
        containerName={activeContainer?.name}
        onExpand={()=>setNarrow(false)}
        onStartDrag={handleStartDrag}
        onDropFiles={handleDroppedFiles}
        onStateChange={handleStateChange}
      />
      <Notif msg={notification}/>
    </div>
  );

  // ── FULL MODE ──────────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"monospace",background:C.bgBase,color:C.green,display:"flex",flexDirection:"column",height:"100vh",overflow:"hidden"}}>
      <MenuBar
        onImport={handleImport} onImportPkg={handleImportPkg}
        onToggleTop={handleToggleTop} alwaysOnTop={alwaysOnTop}
        narrow={narrow} setNarrow={handleSetNarrow}
      />

      <div style={{flex:1,display:"flex",overflow:"hidden"}}>
        {/* Sidebar */}
        <Sidebar
          projects={projects} activeProjectId={activeProjectId}
          setActiveProjectId={id=>{setActiveProjectId(id);setSelectedAssetId(null);setSearch("");}}
          containers={containers} activeContainerId={activeContainerId}
          setActiveContainerId={id=>{setActiveContainerId(id);setSelectedAssetId(null);setSearch("");setMultiSelected(new Set());}}
          containerAssetCounts={containerAssetCounts}
          onAddFolder={openAddFolder}
          onDeleteContainer={async({id,projectId})=>{
            const updated=await api.deleteContainer({id,projectId});
            setContainers(prev=>[...prev.filter(c=>c.project_id!==projectId),...updated]);
            if (activeContainerId===id) setActiveContainerId(null);
          }}
        />

        {/* Main content */}
        <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          {projects.length===0 ? (
            <Welcome onCreate={()=>setModal("new-project")}/>
          ) : (
            <>
              <Toolbar
                path={currentPath}
                onBack={()=>setActiveContainerId(null)}
                onAddFolder={()=>openAddFolder(activeProjectId,activeContainerId)}
                onManifest={()=>setViewMode(v=>v==="manifest"?"grid":"manifest")}
                onNotes={()=>setModal("notes")}
                onRegenThumbs={handleRegenThumbs}
                count={filteredAssets.length}
                viewMode={viewMode} setViewMode={setViewMode}
                thumbSize={thumbSize} setThumbSize={setThumbSize}
                search={search} setSearch={setSearch}
                onImport={handleImport}
              />
              {!activeContainer ? (
                <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,color:C.greenMuted,fontFamily:"monospace"}}>
                  <div style={{fontSize:20,opacity:0.2}}>📂</div>
                  <div style={{fontSize:10,letterSpacing:2}}>SELECT A FOLDER</div>
                  <button onClick={()=>openAddFolder(activeProjectId,null)} style={{background:C.bgActive,border:`1px solid ${C.green}`,color:C.green,fontSize:9,fontFamily:"monospace",padding:"8px 20px",cursor:"pointer",letterSpacing:2}}>+ ADD FOLDER</button>
                </div>
              ) : (
                <AssetGrid
                  assets={filteredAssets} selected={selectedAssetId}
                  setSelected={setSelectedAssetId} thumbSize={thumbSize}
                  viewMode={viewMode} onDropFiles={handleDroppedFiles}
                  onStartDrag={handleStartDrag} onStateChange={handleStateChange}
                />
              )}
            </>
          )}
        </div>

        {/* Inspector */}
        {activeContainer && (
          <Inspector asset={selectedAsset} onUpdate={handleUpdateAsset}
            onDelete={handleDeleteAsset} onOpen={fp=>api.openFile(fp)}
            onStartDrag={handleStartDrag}/>
        )}
      </div>

      <StatusBar count={filteredAssets.length} total={rawAssets.length} path={currentPath}/>
      <KeyBar/>

      {modal==="new-project"&&<NewProjectModal onClose={()=>setModal(null)} onCreate={handleCreateProject}/>}
      {modal==="new-folder"&&<NewFolderModal onClose={()=>setModal(null)} onCreate={handleCreateFolder} parentName={newFolderMeta.parentName}/>}
      {modal==="notes"&&<NotesModal container={activeContainer} onClose={()=>setModal(null)} onSave={handleSaveNotes}/>}
      <Notif msg={notification}/>
    </div>
  );
}
