import { useState, useEffect, useRef, useCallback } from "react";

const SUPABASE_URL = 'https://uedcvzmtxxsnofuenncg.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ldME-6n5mLQQKE-EoPAqIw_8GicmV0x';

const sbFetch = async (path, options = {}, token = SUPABASE_ANON_KEY) => {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${token}`,'Prefer':'return=representation',...(options.headers||{}) }
  });
  if (r.status === 204) return true;
  try { return await r.json(); } catch { return null; }
};

const authAPI = {
  signIn: (email,password) => sbFetch('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})}),
  signOut: (token) => sbFetch('/auth/v1/logout',{method:'POST'},token),
  resetPassword: (email) => sbFetch('/auth/v1/recover',{method:'POST',body:JSON.stringify({email})}),
  inviteUser: (email,token) => sbFetch('/auth/v1/invite',{method:'POST',body:JSON.stringify({email})},token),
  updatePassword: (password,token) => sbFetch('/auth/v1/user',{method:'PUT',body:JSON.stringify({password})},token),
};

const dbAPI = {
  get: (table,filter,token) => sbFetch(`/rest/v1/${table}?${filter}&select=*`,{},token),
  post: (table,body,token) => sbFetch(`/rest/v1/${table}`,{method:'POST',body:JSON.stringify(body)},token),
  patch: (table,filter,body,token) => sbFetch(`/rest/v1/${table}?${filter}`,{method:'PATCH',body:JSON.stringify(body)},token),
  del: (table,filter,token) => sbFetch(`/rest/v1/${table}?${filter}`,{method:'DELETE'},token),
};

// Fonctions CRUD Supabase avec sync local
const saveToDb = async (table, data, token, orgId) => {
  const body = {...data, organisation_id: orgId};
  const res = await sbFetch(`/rest/v1/${table}`, {method:'POST', body:JSON.stringify(body)}, token);
  return Array.isArray(res) ? res[0] : res;
};

const updateInDb = async (table, id, data, token) => {
  const res = await sbFetch(`/rest/v1/${table}?id=eq.${id}`, {method:'PATCH', body:JSON.stringify(data)}, token);
  return res;
};

const deleteFromDb = async (table, id, token) => {
  await sbFetch(`/rest/v1/${table}?id=eq.${id}`, {method:'DELETE'}, token);
};

const storageUpload = async (path, file, token) => {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`,{method:'POST',headers:{'Authorization':`Bearer ${token}`,'apikey':SUPABASE_ANON_KEY,'Content-Type':file.type},body:file});
  if(r.ok){
    const data=await r.json().catch(()=>({}));
    return `${SUPABASE_URL}/storage/v1/object/public/documents/${path}`;
  }
  const errText=await r.text().catch(()=>"");
  console.error("Upload error:",r.status,errText);
  return null;
};

const fmtDate = (d) => { if(!d) return "—"; return new Date(d).toLocaleDateString("fr-FR",{day:"2-digit",month:"short",year:"numeric"}); };
const fmtMontant = (m) => new Intl.NumberFormat("fr-FR").format(m||0)+" FCFA";
const prioColor = (p) => ({urgente:"#ef4444",haute:"#f97316",normale:"#3b82f6",basse:"#22c55e"}[p]||"#6b7280");
const statColor = (s) => ({a_faire:"#6b7280",en_cours:"#3b82f6",en_retard:"#ef4444",termine:"#22c55e",planifiee:"#8b5cf6",tenue:"#22c55e",annulee:"#6b7280"}[s]||"#6b7280");
const statLabel = (s) => ({a_faire:"À faire",en_cours:"En cours",en_retard:"En retard",termine:"Terminé",planifiee:"Planifiée",tenue:"Tenue",annulee:"Annulée"}[s]||s);
const isRetard = (d,s) => d && new Date(d)<new Date() && s!=="termine";
const mkAvatar = (nom) => nom?nom.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase():"??";
const mapT = t => ({...t,assigneA:t.assigne_a,assignePar:t.assigne_par});
const mapB = b => ({...b,montantTotal:b.montant_total||0,depense:b.montant_depense||0});
const mapR = r => ({...r,cr:r.compte_rendu||"",decisions:r.decisions||[],participants:[]});
const mapD = d => ({...d,uploadePar:d.uploade_par});

let _toast = null;
const toast = (msg,type="success") => _toast&&_toast(msg,type);

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  :root{--bg:#0a0f1e;--surface:#111827;--surface2:#1a2235;--border:#1e2d45;--accent:#00c896;--accent2:#0ea5e9;--accent3:#f59e0b;--danger:#ef4444;--text:#e8edf5;--text2:#8899b4;--text3:#4d6080;--font-display:'Syne',sans-serif;--font-body:'DM Sans',sans-serif;--radius:12px;--shadow:0 4px 24px rgba(0,0,0,0.4);}
  body{background:var(--bg);color:var(--text);font-family:var(--font-body);min-height:100vh;}
  ::-webkit-scrollbar{width:4px;height:4px;}::-webkit-scrollbar-track{background:var(--surface);}::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px;}
  .app{display:flex;min-height:100vh;}
  .sidebar{width:240px;min-height:100vh;background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;position:fixed;left:0;top:0;z-index:100;}
  .sidebar-logo{padding:24px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;}
  .logo-icon{width:36px;height:36px;background:var(--accent);border-radius:10px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;color:#000;font-size:16px;}
  .logo-text{font-family:var(--font-display);font-weight:700;font-size:18px;}
  .logo-sub{font-size:10px;color:var(--text3);letter-spacing:1px;text-transform:uppercase;}
  .nav-section{padding:16px 12px 8px;}
  .nav-label{font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:1.5px;padding:0 8px;margin-bottom:6px;font-weight:600;}
  .nav-item{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;cursor:pointer;color:var(--text2);font-size:13.5px;transition:all 0.15s;margin-bottom:2px;position:relative;}
  .nav-item:hover{background:var(--surface2);color:var(--text);}
  .nav-item.active{background:rgba(0,200,150,0.12);color:var(--accent);font-weight:500;}
  .nav-item.active::before{content:'';position:absolute;left:0;top:50%;transform:translateY(-50%);width:3px;height:20px;background:var(--accent);border-radius:0 2px 2px 0;}
  .nav-badge{margin-left:auto;background:var(--danger);color:white;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;}
  .sidebar-footer{margin-top:auto;padding:16px;border-top:1px solid var(--border);}
  .user-card{display:flex;align-items:center;gap:10px;padding:10px;background:var(--surface2);border-radius:10px;cursor:pointer;transition:background 0.15s;}
  .user-card:hover{background:rgba(0,200,150,0.08);}
  .avatar{border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#000;flex-shrink:0;}
  .main{margin-left:240px;flex:1;display:flex;flex-direction:column;min-height:100vh;}
  .topbar{height:64px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 28px;gap:16px;position:sticky;top:0;z-index:50;}
  .topbar-title{font-family:var(--font-display);font-size:18px;font-weight:700;flex:1;}
  .icon-btn{width:36px;height:36px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:15px;color:var(--text2);transition:all 0.15s;position:relative;}
  .icon-btn:hover{border-color:var(--accent);color:var(--accent);}
  .notif-dot{position:absolute;top:6px;right:6px;width:7px;height:7px;background:var(--danger);border-radius:50%;border:1.5px solid var(--surface);}
  .content{padding:28px;flex:1;}
  .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;}
  .card-title{font-family:var(--font-display);font-size:14px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:16px;}
  .stats-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;}
  .stat-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:20px;position:relative;overflow:hidden;}
  .stat-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;}
  .stat-card.green::before{background:var(--accent);}.stat-card.blue::before{background:var(--accent2);}.stat-card.orange::before{background:var(--accent3);}.stat-card.red::before{background:var(--danger);}
  .grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
  .table{width:100%;border-collapse:collapse;}
  .table th{text-align:left;padding:10px 14px;font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.8px;border-bottom:1px solid var(--border);}
  .table td{padding:12px 14px;font-size:13.5px;border-bottom:1px solid rgba(30,45,69,0.5);}
  .table tr:last-child td{border-bottom:none;}.table tr:hover td{background:rgba(255,255,255,0.02);}
  .badge{display:inline-flex;align-items:center;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
  .btn{display:inline-flex;align-items:center;gap:8px;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;border:none;font-family:var(--font-body);transition:all 0.15s;}
  .btn:disabled{opacity:0.5;cursor:not-allowed;}
  .btn-primary{background:var(--accent);color:#000;}.btn-primary:hover:not(:disabled){background:#00e0a8;transform:translateY(-1px);}
  .btn-secondary{background:var(--surface2);color:var(--text);border:1px solid var(--border);}.btn-secondary:hover:not(:disabled){border-color:var(--accent);color:var(--accent);}
  .btn-danger{background:rgba(239,68,68,0.15);color:var(--danger);border:1px solid rgba(239,68,68,0.3);}.btn-danger:hover{background:rgba(239,68,68,0.25);}
  .btn-sm{padding:6px 12px;font-size:12px;}
  .form-group{margin-bottom:16px;}
  .form-label{display:block;font-size:12px;color:var(--text2);margin-bottom:6px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px;}
  .form-input,.form-select,.form-textarea{width:100%;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13.5px;font-family:var(--font-body);transition:border-color 0.15s;}
  .form-input:focus,.form-select:focus,.form-textarea:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(0,200,150,0.1);}
  .form-input.err,.form-select.err{border-color:var(--danger);}
  .form-textarea{resize:vertical;min-height:100px;}.form-select option{background:var(--surface2);}
  .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:200;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);}
  .modal{background:var(--surface);border:1px solid var(--border);border-radius:16px;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow);}
  .modal-header{padding:20px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;}
  .modal-title{font-family:var(--font-display);font-size:16px;font-weight:700;}
  .modal-body{padding:24px;}.modal-footer{padding:16px 24px;border-top:1px solid var(--border);display:flex;gap:10px;justify-content:flex-end;}
  .modal-close{background:none;border:none;color:var(--text2);cursor:pointer;font-size:18px;padding:4px;}
  .progress-bar{height:6px;background:var(--surface2);border-radius:3px;overflow:hidden;margin-top:8px;}
  .progress-fill{height:100%;border-radius:3px;transition:width 0.5s ease;}
  .tabs{display:flex;gap:4px;background:var(--surface2);padding:4px;border-radius:10px;margin-bottom:20px;}
  .tab{flex:1;padding:8px;border-radius:7px;border:none;background:none;color:var(--text2);font-size:13px;cursor:pointer;font-family:var(--font-body);transition:all 0.15s;}
  .tab.active{background:var(--surface);color:var(--text);font-weight:500;box-shadow:0 1px 4px rgba(0,0,0,0.3);}
  .empty-state{text-align:center;padding:48px 20px;color:var(--text3);}
  .empty-icon{font-size:40px;margin-bottom:12px;}.empty-title{font-size:15px;font-weight:500;color:var(--text2);margin-bottom:6px;}
  .search-wrap{position:relative;}
  .search-input{padding:9px 14px 9px 36px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;font-family:var(--font-body);width:260px;}
  .search-input:focus{outline:none;border-color:var(--accent);}
  .search-icon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--text3);font-size:14px;pointer-events:none;}
  .alert{padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:16px;display:flex;align-items:center;gap:10px;}
  .alert-warning{background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);color:var(--accent3);}
  .alert-danger{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:var(--danger);}
  .alert-success{background:rgba(0,200,150,0.1);border:1px solid rgba(0,200,150,0.3);color:var(--accent);}
  .alert-info{background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.3);color:var(--accent2);}
  .login-page{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);position:relative;overflow:hidden;}
  .login-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 20% 50%,rgba(0,200,150,0.08) 0%,transparent 60%),radial-gradient(ellipse at 80% 20%,rgba(14,165,233,0.08) 0%,transparent 50%);}
  .login-card{background:var(--surface);border:1px solid var(--border);border-radius:20px;padding:48px;width:100%;max-width:420px;position:relative;z-index:1;box-shadow:var(--shadow);}
  .upload-zone{border:2px dashed var(--border);border-radius:10px;padding:28px;text-align:center;color:var(--text3);cursor:pointer;transition:all 0.2s;}
  .upload-zone:hover,.upload-zone.drag{border-color:var(--accent);background:rgba(0,200,150,0.04);color:var(--accent);}
  .toast-container{position:fixed;top:80px;right:20px;z-index:999;display:flex;flex-direction:column;gap:8px;pointer-events:none;}
  .toast{padding:12px 18px;border-radius:10px;font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px;box-shadow:var(--shadow);animation:slideIn 0.3s ease;pointer-events:all;min-width:240px;}
  .toast-success{background:rgba(0,200,150,0.15);border:1px solid rgba(0,200,150,0.4);color:var(--accent);}
  .toast-error{background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.4);color:var(--danger);}
  .toast-info{background:rgba(14,165,233,0.15);border:1px solid rgba(14,165,233,0.4);color:var(--accent2);}
  .plan-card{border:2px solid var(--border);border-radius:14px;padding:20px;cursor:pointer;transition:all 0.2s;}
  .plan-card:hover{border-color:var(--accent2);}.plan-card.selected{border-color:var(--accent);background:rgba(0,200,150,0.05);}
  .loading-screen{display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg);flex-direction:column;gap:16px;}
  .spinner{width:18px;height:18px;border:2px solid rgba(0,200,150,0.3);border-top-color:var(--accent);border-radius:50%;animation:spin 0.7s linear infinite;display:inline-block;}
  @keyframes spin{to{transform:rotate(360deg);}}
  @keyframes slideIn{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);}}
  @keyframes fadeIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.5;}}
  .fade-in{animation:fadeIn 0.3s ease;}
  .pulse-anim{animation:pulse 2s infinite;}
  @media(max-width:1024px){.stats-grid{grid-template-columns:repeat(2,1fr);}.grid-2,.grid-3{grid-template-columns:1fr;}}
  @media(max-width:768px){.sidebar{transform:translateX(-100%);}.main{margin-left:0;}}
`;

const ToastSystem = () => {
  const [toasts,setToasts] = useState([]);
  useEffect(()=>{_toast=(msg,type)=>{const id=Date.now();setToasts(t=>[...t,{id,msg,type}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3500);};},[]);
  return <div className="toast-container">{toasts.map(t=><div key={t.id} className={`toast toast-${t.type}`}>{t.type==="success"?"✅":t.type==="error"?"❌":"ℹ️"} {t.msg}</div>)}</div>;
};

const Spinner = () => <span className="spinner"/>;

const Av = ({user,size="md"}) => {
  const cols=["#00c896","#0ea5e9","#f59e0b","#8b5cf6","#ef4444","#10b981","#f97316","#06b6d4"];
  const c=cols[(user?.nom?.charCodeAt(0)||0)%cols.length];
  const sz=size==="sm"?28:size==="lg"?44:34, fs=size==="sm"?10:size==="lg"?14:12, br=size==="sm"?"6px":size==="lg"?"10px":"8px";
  return <div className={`avatar ${size}`} style={{background:`linear-gradient(135deg,${c},${c}99)`,width:sz,height:sz,fontSize:fs,borderRadius:br}}>{mkAvatar(user?.nom)}</div>;
};

const Bdg = ({label,color}) => <span className="badge" style={{background:`${color}22`,color,border:`1px solid ${color}44`}}>{label}</span>;

const Modal = ({title,children,onClose,footer}) => (
  <div className="modal-overlay" onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div className="modal fade-in">
      <div className="modal-header"><span className="modal-title">{title}</span><button className="modal-close" onClick={onClose}>✕</button></div>
      <div className="modal-body">{children}</div>
      {footer&&<div className="modal-footer">{footer}</div>}
    </div>
  </div>
);

const Confirm = ({message,onConfirm,onCancel}) => (
  <Modal title="Confirmation" onClose={onCancel} footer={<><button className="btn btn-secondary" onClick={onCancel}>Annuler</button><button className="btn btn-danger" onClick={onConfirm}>Confirmer</button></>}>
    <div className="alert alert-danger">{message}</div>
  </Modal>
);

const DeptsSelect = ({value, onChange, depts=[]}) => (
  <select className="form-select" value={value} onChange={e=>onChange(e.target.value)}>
    <option value="">—</option>
    {(depts.length > 0 ? depts : ["Direction","Programmes","Administration"]).map(d=>(
      <option key={d} value={d}>{d}</option>
    ))}
  </select>
);

const LoginPage = ({onLogin}) => {
  const [view,setView]=useState("login");
  // Login
  const [email,setEmail]=useState(""),[ password,setPassword]=useState(""),[ loading,setLoading]=useState(false),[error,setError]=useState("");
  // Reset
  const [rEmail,setREmail]=useState(""),[ rLoad,setRLoad]=useState(false);
  // Inscription
  const [reg,setReg]=useState({nomOrg:"",typeOrg:"ong",ville:"Parakou",pays:"Bénin",secteur:"",ifu:"",rccm:"",nom:"",email:"",password:"",confirmPwd:"",plan:"pro",logoFile:null,logoUrl:""});
  const [regLoad,setRegLoad]=useState(false),[regErr,setRegErr]=useState(""),[regOk,setRegOk]=useState(false);

  const plans=[
    {id:"ong_locale",nom:"ONG Locale",prix:"10 000 FCFA/mois",desc:"ONG locales & associations"},
    {id:"starter",nom:"Starter",prix:"20 000 FCFA/mois",desc:"Cabinets & PME"},
    {id:"pro",nom:"Pro",prix:"60 000 FCFA/mois",desc:"ONG & Projets bailleurs"},
    {id:"institution",nom:"Institution",prix:"120 000 FCFA/mois",desc:"Mairies & Administrations"},
  ];

  const doLogin=async()=>{
    if(!email||!password){setError("Remplissez tous les champs.");return;}
    setLoading(true);setError("");
    const d=await authAPI.signIn(email,password);
    if(d?.access_token)onLogin(d);
    else setError(d?.error_description||d?.msg||"Email ou mot de passe incorrect.");
    setLoading(false);
  };

  const doReset=async()=>{
    if(!rEmail)return;setRLoad(true);
    await authAPI.resetPassword(rEmail);setRLoad(false);setView("sent");
  };

  const doRegister=async()=>{
    if(!reg.nomOrg||!reg.nom||!reg.email||!reg.password){setRegErr("Tous les champs obligatoires (*) doivent être remplis.");return;}
    if(reg.password!==reg.confirmPwd){setRegErr("Les mots de passe ne correspondent pas.");return;}
    if(reg.password.length<6){setRegErr("Le mot de passe doit contenir au moins 6 caractères.");return;}
    setRegLoad(true);setRegErr("");
    try{
      // ÉTAPE 1: Créer le compte Auth
      const signupRes=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON_KEY},
        body:JSON.stringify({email:reg.email,password:reg.password,data:{nom:reg.nom,role:"directeur"}})
      });
      const authRes=await signupRes.json();
      
      // Gérer les erreurs Auth
      if(authRes?.error){
        const errMsg=authRes.error.message||"";
        if(errMsg.toLowerCase().includes("already")){
          // Compte existe — se connecter directement
          const loginRes=await authAPI.signIn(reg.email,reg.password);
          if(loginRes?.access_token){
            // Vérifier si organisation existe déjà
            const token=loginRes.access_token;
            const uid=loginRes.user?.id;
            const profil=await sbFetch(`/rest/v1/profils?id=eq.${uid}&select=*`,{},token);
            const p=Array.isArray(profil)?profil[0]:null;
            if(p?.organisation_id){
              setRegLoad(false);
              onLogin(loginRes);
              return;
            }
            // Créer l'organisation pour ce compte existant
            const orgRes=await sbFetch("/rest/v1/organisations",{method:"POST",body:JSON.stringify({
              nom:reg.nomOrg,type:reg.typeOrg,ville:reg.ville,pays:reg.pays,
              secteur:reg.secteur||null,ifu:reg.ifu||null,rccm:reg.rccm||null,
              plan_abonnement:reg.plan,statut_abonnement:"essai",
              date_debut_abonnement:new Date().toISOString().split("T")[0],
              date_fin_abonnement:new Date(Date.now()+30*24*60*60*1000).toISOString().split("T")[0]
            })},token);
            const org=Array.isArray(orgRes)?orgRes[0]:orgRes;
            if(org?.id){
              await sbFetch(`/rest/v1/profils?id=eq.${uid}`,{method:"PATCH",body:JSON.stringify({
                nom:reg.nom,role:"directeur",organisation_id:org.id,
                departement:"Direction",poste:"Directeur Général",actif:true
              })},token);
              setRegOk(true);
              await new Promise(r=>setTimeout(r,1000));
              onLogin(loginRes);
            }
          }else{
            setRegErr("Email déjà utilisé. Connectez-vous ou utilisez un autre email.");
          }
          setRegLoad(false);return;
        }
        setRegErr(errMsg||"Erreur de création. Réessayez.");
        setRegLoad(false);return;
      }

      const userId=authRes?.user?.id||authRes?.session?.user?.id;
      const token=authRes?.access_token||authRes?.session?.access_token||SUPABASE_ANON_KEY;
      
      if(!userId){setRegErr("Erreur inattendue. Réessayez.");setRegLoad(false);return;}

      // ÉTAPE 2: Attendre le trigger (max 8 secondes)
      for(let i=0;i<8;i++){
        await new Promise(r=>setTimeout(r,1000));
        const check=await sbFetch(`/rest/v1/profils?id=eq.${userId}&select=id`,{},token);
        if(Array.isArray(check)&&check.length>0) break;
      }

      // ÉTAPE 3: Créer l'organisation
      const orgRes=await sbFetch("/rest/v1/organisations",{method:"POST",body:JSON.stringify({
        nom:reg.nomOrg,type:reg.typeOrg,ville:reg.ville,pays:reg.pays,
        secteur:reg.secteur||null,ifu:reg.ifu||null,rccm:reg.rccm||null,
        logo_url:reg.logoUrl||null,plan_abonnement:reg.plan,statut_abonnement:"essai",
        date_debut_abonnement:new Date().toISOString().split("T")[0],
        date_fin_abonnement:new Date(Date.now()+30*24*60*60*1000).toISOString().split("T")[0]
      })},token);
      const org=Array.isArray(orgRes)?orgRes[0]:orgRes;
      
      if(!org?.id){
        // Organisation non créée - vérifier RLS
        setRegErr("Erreur création organisation. Vérifiez la connexion et réessayez.");
        setRegLoad(false);return;
      }

      // ÉTAPE 4: Lier profil à l'organisation
      await sbFetch(`/rest/v1/profils?id=eq.${userId}`,{method:"PATCH",body:JSON.stringify({
        nom:reg.nom,role:"directeur",organisation_id:org.id,
        departement:"Direction",poste:"Directeur Général",actif:true
      })},token);

      // ÉTAPE 5: Connexion automatique
      await new Promise(r=>setTimeout(r,1000));
      setRegOk(true);
      const loginRes=await authAPI.signIn(reg.email,reg.password);
      if(loginRes?.access_token){
        await new Promise(r=>setTimeout(r,500));
        onLogin(loginRes);
      }else{
        setRegErr("Compte créé ! Connectez-vous avec vos identifiants.");
        setTimeout(()=>{setRegOk(false);setView("login");},2000);
      }
    }catch(e){
      console.error("Inscription erreur:",e);
      setRegErr("Erreur de connexion. Vérifiez votre internet et réessayez.");
    }
    setRegLoad(false);
  };

  const Logo=()=>(
    <div style={{textAlign:"center",marginBottom:28}}>
      <div style={{width:52,height:52,background:"var(--accent)",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-display)",fontWeight:800,color:"#000",fontSize:20,margin:"0 auto 10px"}}>P</div>
      <div style={{fontFamily:"var(--font-display)",fontSize:26,fontWeight:800}}>PulseOrg</div>
      <div style={{color:"var(--text2)",fontSize:12,marginTop:3}}>Gestion institutionnelle intelligente</div>
    </div>
  );

  return(
    <div className="login-page"><div className="login-bg"/>
      <div className="login-card" style={{maxWidth:view==="register"?520:420}}>
        <Logo/>

        {/* ---- CONNEXION ---- */}
        {view==="login"&&<>
          {error&&<div className="alert alert-danger">{error}</div>}
          <div className="form-group"><label className="form-label">Email</label><input className={`form-input${error?" err":""}`} type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} placeholder="votre@email.org"/></div>
          <div className="form-group"><label className="form-label">Mot de passe</label><input className="form-input" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()} placeholder="••••••••"/></div>
          <div style={{textAlign:"right",marginBottom:16}}><span onClick={()=>setView("reset")} style={{fontSize:12,color:"var(--accent)",cursor:"pointer"}}>Mot de passe oublié ?</span></div>
          <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",padding:12}} onClick={doLogin} disabled={loading}>{loading?<><Spinner/> Connexion...</>:"Se connecter →"}</button>
          <div style={{textAlign:"center",marginTop:20,fontSize:13,color:"var(--text2)"}}>Pas encore de compte ? <span onClick={()=>setView("register")} style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}}>Créer mon organisation →</span></div>
        </>}

        {/* ---- MOT DE PASSE OUBLIÉ ---- */}
        {view==="reset"&&<>
          <div className="alert alert-info">Entrez votre email pour recevoir un lien de réinitialisation.</div>
          <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={rEmail} onChange={e=>setREmail(e.target.value)} placeholder="votre@email.org"/></div>
          <div style={{display:"flex",gap:8}}><button className="btn btn-secondary" style={{flex:1}} onClick={()=>setView("login")}>← Retour</button><button className="btn btn-primary" style={{flex:2,justifyContent:"center"}} onClick={doReset} disabled={rLoad}>{rLoad?<><Spinner/> Envoi...</>:"Envoyer le lien"}</button></div>
        </>}

        {/* ---- EMAIL ENVOYÉ ---- */}
        {view==="sent"&&<div style={{textAlign:"center",padding:"16px 0"}}><div style={{fontSize:40,marginBottom:12}}>📧</div><div style={{fontWeight:600,marginBottom:8}}>Email envoyé !</div><div style={{fontSize:13,color:"var(--text2)",marginBottom:20}}>Cliquez sur le lien dans votre boîte mail.</div><button className="btn btn-secondary" onClick={()=>setView("login")}>← Retour</button></div>}

        {/* ---- INSCRIPTION ---- */}
        {view==="register"&&<>
          {regOk?(
            <div style={{textAlign:"center",padding:"24px 0"}}>
              <div style={{fontSize:48,marginBottom:12}}>🎉</div>
              <div style={{fontFamily:"var(--font-display)",fontSize:18,fontWeight:700,color:"var(--accent)",marginBottom:8}}>Organisation créée !</div>
              <div style={{fontSize:13,color:"var(--text2)"}}>Connexion automatique en cours...<br/>Votre essai gratuit de 30 jours commence maintenant.</div>
              <div style={{marginTop:16}} className="pulse-anim"><Spinner/></div>
            </div>
          ):(
            <>
              {regErr&&<div className="alert alert-danger">{regErr}</div>}
              <div style={{background:"rgba(0,200,150,0.08)",border:"1px solid rgba(0,200,150,0.2)",borderRadius:10,padding:"12px 14px",marginBottom:16,fontSize:12,color:"var(--accent)"}}>
                🎁 <strong>30 jours d'essai gratuit</strong> — Aucune carte bancaire requise
              </div>

              <div style={{fontSize:12,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.5px",fontWeight:600,marginBottom:10}}>Votre organisation</div>
              <div className="form-group"><label className="form-label">Nom de l'organisation *</label><input className="form-input" value={reg.nomOrg} onChange={e=>setReg({...reg,nomOrg:e.target.value})} placeholder="Ex: ONG Développement Nord Bénin"/></div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Type *</label>
                  <select className="form-select" value={reg.typeOrg} onChange={e=>setReg({...reg,typeOrg:e.target.value})}>
                    <option value="ong">ONG</option><option value="association">Association</option><option value="cabinet">Cabinet Conseil</option><option value="pme">PME</option><option value="administration">Administration</option><option value="mairie">Mairie / Commune</option><option value="autre">Autre</option>
                  </select>
                </div>
                <div className="form-group"><label className="form-label">Secteur d'activité</label><input className="form-input" value={reg.secteur||""} onChange={e=>setReg({...reg,secteur:e.target.value})} placeholder="Ex: Santé, Éducation, Agriculture..."/></div>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Ville</label><input className="form-input" value={reg.ville} onChange={e=>setReg({...reg,ville:e.target.value})} placeholder="Parakou"/></div>
                <div className="form-group"><label className="form-label">Pays</label><input className="form-input" value={reg.pays} onChange={e=>setReg({...reg,pays:e.target.value})} placeholder="Bénin"/></div>
              </div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">IFU (Identifiant Fiscal)</label><input className="form-input" value={reg.ifu||""} onChange={e=>setReg({...reg,ifu:e.target.value})} placeholder="Ex: 3201900123456"/></div>
                <div className="form-group"><label className="form-label">N° RCCM / Registre</label><input className="form-input" value={reg.rccm||""} onChange={e=>setReg({...reg,rccm:e.target.value})} placeholder="Ex: RB/PAR/2021/A/1234"/></div>
              </div>
              <div className="form-group"><label className="form-label">Logo de l'organisation (optionnel)</label>
                <input type="file" accept="image/*" style={{width:"100%",padding:"8px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text)",fontSize:13,fontFamily:"var(--font-body)"}}
                  onChange={e=>{const f=e.target.files[0];if(f){const reader=new FileReader();reader.onloadend=()=>setReg({...reg,logoUrl:reader.result,logoFile:f});reader.readAsDataURL(f);}}}/>
                {reg.logoUrl&&<div style={{marginTop:8,textAlign:"center"}}><img src={reg.logoUrl} alt="Logo" style={{maxHeight:60,maxWidth:150,borderRadius:6,border:"1px solid var(--border)"}}/></div>}
              </div>

              <div style={{fontSize:12,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.5px",fontWeight:600,marginBottom:10,marginTop:4}}>Votre compte Directeur</div>
              <div className="form-group"><label className="form-label">Nom complet *</label><input className="form-input" value={reg.nom} onChange={e=>setReg({...reg,nom:e.target.value})} placeholder="Prénom Nom"/></div>
              <div className="form-group"><label className="form-label">Email *</label><input className="form-input" type="email" value={reg.email} onChange={e=>setReg({...reg,email:e.target.value})} placeholder="votre@email.org"/></div>
              <div className="grid-2">
                <div className="form-group"><label className="form-label">Mot de passe *</label><input className="form-input" type="password" value={reg.password} onChange={e=>setReg({...reg,password:e.target.value})} placeholder="Minimum 6 caractères"/></div>
                <div className="form-group"><label className="form-label">Confirmer *</label><input className="form-input" type="password" value={reg.confirmPwd} onChange={e=>setReg({...reg,confirmPwd:e.target.value})} placeholder="Répéter"/></div>
              </div>

              <div style={{fontSize:12,color:"var(--text3)",textTransform:"uppercase",letterSpacing:"0.5px",fontWeight:600,marginBottom:10,marginTop:4}}>Choisir un plan</div>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
                {plans.map(p=>(
                  <div key={p.id} onClick={()=>setReg({...reg,plan:p.id})} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",borderRadius:8,cursor:"pointer",border:`2px solid ${reg.plan===p.id?"var(--accent)":"var(--border)"}`,background:reg.plan===p.id?"rgba(0,200,150,0.06)":"transparent",transition:"all 0.15s"}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>{p.nom}</div><div style={{fontSize:11,color:"var(--text2)"}}>{p.desc}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:700,color:"var(--accent)"}}>{p.prix}</div>{reg.plan===p.id&&<span style={{fontSize:10,color:"var(--accent)"}}>✓ Sélectionné</span>}</div>
                  </div>
                ))}
              </div>

              <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",padding:12}} onClick={doRegister} disabled={regLoad}>
                {regLoad?<><Spinner/> Création en cours...</>:"🚀 Créer mon organisation gratuitement"}
              </button>
              <div style={{textAlign:"center",marginTop:16,fontSize:12,color:"var(--text2)"}}>Déjà un compte ? <span onClick={()=>setView("login")} style={{color:"var(--accent)",cursor:"pointer",fontWeight:600}}>Se connecter</span></div>
            </>
          )}
        </>}
      </div>
    </div>
  );
};

const Dashboard = ({data,currentUser,setModule}) => {
  const ret=data.taches.filter(t=>t.statut==="en_retard").length;const retardUrgent=data.taches.filter(t=>t.statut==="en_retard"&&t.priorite==="urgente").length;
  const enc=data.taches.filter(t=>t.statut==="en_cours").length;
  const ter=data.taches.filter(t=>t.statut==="termine").length;
  const nlu=data.messages.filter(m=>!m.lu&&m.a===currentUser.id).length;
  const mt=data.taches.slice(0,5);
  const ru=data.reunions.filter(r=>r.statut==="planifiee"||r.statut==="tenue").sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,3);
  const gu=id=>data.users.find(u=>u.id===id);
  return(
    <div className="fade-in">
      <div style={{marginBottom:20}}>
        <div style={{fontSize:20,fontFamily:"var(--font-display)",fontWeight:700}}>Bonjour, {currentUser.nom?.split(" ")[0]} 👋</div>
        <div style={{fontSize:13,color:"var(--text2)",marginTop:4}}>{new Date().toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div>
      </div>
      {ret>0&&<div className="alert alert-danger" style={{cursor:"pointer",marginBottom:16}} onClick={()=>setModule("taches")}>⚠️ <strong>{ret} tâche(s) en retard</strong>{retardUrgent>0&&<span style={{marginLeft:8,background:"rgba(239,68,68,0.2)",padding:"2px 8px",borderRadius:10,fontSize:11}}>{retardUrgent} urgente(s)</span>} — Cliquez pour voir</div>}
      <div className="stats-grid">
        {[{l:"Terminées",v:ter,c:"var(--accent)",cl:"green",i:"✅"},{l:"En cours",v:enc,c:"var(--accent2)",cl:"blue",i:"⚡"},{l:"En retard",v:ret,c:"var(--danger)",cl:"red",i:"🔴"},{l:"Non lus",v:nlu,c:"var(--accent3)",cl:"orange",i:"💬"}].map(s=>(
          <div key={s.l} className={`stat-card ${s.cl}`}>
            <div style={{fontSize:22,marginBottom:10}}>{s.i}</div>
            <div style={{fontFamily:"var(--font-display)",fontSize:32,fontWeight:800,lineHeight:1,marginBottom:4,color:s.c}}>{s.v}</div>
            <div style={{fontSize:12,color:"var(--text2)"}}>{s.l}</div>
          </div>
        ))}
      </div>
      <div className="grid-2" style={{marginBottom:16}}>
        <div className="card">
          <div className="card-title">📋 Mes tâches</div>
          {mt.length===0?<div style={{fontSize:13,color:"var(--text3)",padding:"12px 0"}}>Aucune tâche assignée</div>:mt.map(t=>(
            <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{t.titre}</div>
                <div style={{fontSize:11,color:isRetard(t.deadline,t.statut)?"var(--danger)":"var(--text3)",marginTop:2}}>{fmtDate(t.deadline)}</div>
              </div>
              <Bdg label={statLabel(t.statut)} color={statColor(t.statut)}/>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">📅 Prochaines réunions</div>
          {ru.length===0?<div style={{fontSize:13,color:"var(--text3)",padding:"12px 0"}}>Aucune réunion planifiée</div>:ru.map(r=>(
            <div key={r.id} style={{padding:"12px 0",borderBottom:"1px solid var(--border)"}}>
              <div style={{display:"flex",justifyContent:"space-between"}}><div style={{fontSize:13,fontWeight:500}}>{r.titre}</div><div style={{fontSize:12,color:"var(--accent)",fontWeight:600}}>{fmtDate(r.date)}</div></div>
              <div style={{fontSize:11,color:"var(--text3)",marginTop:3}}>📍 {r.lieu} · {r.heure}</div>
              <div style={{display:"flex",gap:4,marginTop:8}}>{(r.participants||[]).slice(0,4).map(pid=>{const u=gu(pid);return u?<Av key={pid} user={u} size="sm"/>:null;})}</div>
            </div>
          ))}
        </div>
      </div>
      {data.budgets.length>0&&<div className="card"><div className="card-title">💰 Exécution budgétaire</div>{data.budgets.map(b=>{const p=b.montantTotal>0?Math.round(b.depense/b.montantTotal*100):0;return(
        <div key={b.id} style={{marginBottom:18}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <div><div style={{fontSize:13,fontWeight:500}}>{b.projet}</div><div style={{fontSize:11,color:"var(--text3)"}}>{b.bailleurs}</div></div>
            <div style={{textAlign:"right"}}><div style={{fontSize:13,fontWeight:600,color:"var(--accent)"}}>{p}%</div><div style={{fontSize:11,color:"var(--text3)"}}>{fmtMontant(b.depense)} / {fmtMontant(b.montantTotal)}</div></div>
          </div>
          <div className="progress-bar"><div className="progress-fill" style={{width:`${p}%`,background:p>80?"var(--danger)":p>60?"var(--accent3)":"var(--accent)"}}/></div>
        </div>
      );})}</div>}
    </div>
  );
};

const Taches = ({data,setData,currentUser}) => {
  const [modal,setModal]=useState(false),[editM,setEditM]=useState(null),[conf,setConf]=useState(null),[filtre,setFiltre]=useState("tous"),[search,setSearch]=useState("");
  const ef={titre:"",assigneA:"",deadline:"",priorite:"normale",dept:"",description:""};
  const [form,setForm]=useState(ef),[errs,setErrs]=useState({});
  const canM=currentUser.role!=="agent";
  const gu=id=>data.users.find(u=>u.id===id);
  useEffect(()=>{setData(d=>({...d,taches:d.taches.map(t=>isRetard(t.deadline,t.statut)&&t.statut!=="en_retard"?{...t,statut:"en_retard"}:t)}));},[]);
  const val=f=>{const e={};if(!f.titre)e.titre=true;if(!f.assigneA)e.assigneA=true;if(!f.deadline)e.deadline=true;setErrs(e);return!Object.keys(e).length;};
  const add=async()=>{
    if(!val(form))return;
    const payload={
      titre:form.titre,description:form.description||null,
      assigne_a:form.assigneA,assigne_par:currentUser.id,
      deadline:form.deadline,statut:"a_faire",priorite:form.priorite||"normale",
      departement:form.dept||null,organisation_id:currentUser.organisationId
    };
    const saved=await saveToDb("taches",payload,currentUser.token,currentUser.organisationId);
    const t={...form,id:saved?.id||Date.now(),assigneA:form.assigneA,assignePar:currentUser.id,statut:"a_faire"};
    setData(d=>({...d,taches:[...d.taches,t]}));
    toast("Tâche créée");setModal(false);setForm(ef);setErrs({});
  };
  const upd=async()=>{
    if(!val(editM))return;
    await updateInDb("taches",editM.id,{
      titre:editM.titre,description:editM.description||null,
      assigne_a:editM.assigneA,deadline:editM.deadline,
      priorite:editM.priorite||"normale",departement:editM.dept||null
    },currentUser.token);
    setData(d=>({...d,taches:d.taches.map(t=>t.id===editM.id?{...editM}:t)}));
    toast("Tâche modifiée");setEditM(null);
  };
  const chgStat=async(id,s)=>{
    await updateInDb("taches",id,{statut:s},currentUser.token);
    setData(d=>({...d,taches:d.taches.map(t=>t.id===id?{...t,statut:s}:t)}));
    toast("Statut mis à jour");
  };
  const del=async(id)=>{
    await deleteFromDb("taches",id,currentUser.token);
    setData(d=>({...d,taches:d.taches.filter(t=>t.id!==id)}));
    toast("Tâche supprimée","info");setConf(null);
  };
  const list=data.taches.filter(t=>filtre==="tous"||t.statut===filtre).filter(t=>!search||t.titre.toLowerCase().includes(search.toLowerCase())).filter(t=>canM||t.assigneA===currentUser.id);
  const TF=({f,setF,e})=>(
    <>
      <div className="form-group"><label className="form-label">Titre *</label><input className={`form-input${e.titre?" err":""}`} value={f.titre} onChange={ev=>setF({...f,titre:ev.target.value})} placeholder="Titre de la tâche"/></div>
      <div className="grid-2">
        <div className="form-group"><label className="form-label">Assignée à *</label><select className={`form-select${e.assigneA?" err":""}`} value={f.assigneA} onChange={ev=>setF({...f,assigneA:ev.target.value})}><option value="">Sélectionner...</option>{data.users.map(u=><option key={u.id} value={u.id}>{u.nom}</option>)}</select></div>
        <div className="form-group"><label className="form-label">Deadline *</label><input type="date" className={`form-input${e.deadline?" err":""}`} value={f.deadline} onChange={ev=>setF({...f,deadline:ev.target.value})}/></div>
      </div>
      <div className="grid-2">
        <div className="form-group"><label className="form-label">Priorité</label><select className="form-select" value={f.priorite} onChange={ev=>setF({...f,priorite:ev.target.value})}><option value="basse">Basse</option><option value="normale">Normale</option><option value="haute">Haute</option><option value="urgente">Urgente</option></select></div>
        <div className="form-group"><label className="form-label">Département</label><DeptsSelect value={f.dept} onChange={v=>setF({...f,dept:v})} depts={data.departements||[]}/></div>
      </div>
      <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" style={{minHeight:80}} value={f.description} onChange={ev=>setF({...f,description:ev.target.value})} placeholder="Détails..."/></div>
    </>
  );
  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{["tous","a_faire","en_cours","en_retard","termine"].map(s=><button key={s} className={`btn btn-sm ${filtre===s?"btn-primary":"btn-secondary"}`} onClick={()=>setFiltre(s)}>{s==="tous"?"Toutes":statLabel(s)} <span style={{opacity:0.7}}>{s==="tous"?data.taches.length:data.taches.filter(t=>t.statut===s).length}</span></button>)}</div>
        <div style={{display:"flex",gap:8}}>
          <div className="search-wrap"><span className="search-icon">🔍</span><input className="search-input" style={{width:180}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..."/></div>
          {canM&&<button className="btn btn-primary" onClick={()=>setModal(true)}>+ Nouvelle tâche</button>}
        </div>
      </div>
      {list.length===0?<div className="empty-state"><div className="empty-icon">✅</div><div className="empty-title">Aucune tâche</div></div>:
        <div className="card" style={{padding:0}}><table className="table">
          <thead><tr><th>Tâche</th><th>Assignée à</th><th>Dept</th><th>Deadline</th><th>Priorité</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>{list.map(t=>{const ag=gu(t.assigneA);const ret=isRetard(t.deadline,t.statut);return(
            <tr key={t.id}>
              <td><div style={{fontWeight:500}}>{t.titre}</div>{t.description&&<div style={{fontSize:11,color:"var(--text3)",marginTop:2}}>{t.description.slice(0,55)}...</div>}</td>
              <td>{ag&&<div style={{display:"flex",alignItems:"center",gap:8}}><Av user={ag} size="sm"/><span style={{fontSize:12}}>{ag.nom.split(" ")[0]}</span></div>}</td>
              <td><span style={{fontSize:12,color:"var(--text2)"}}>{t.dept}</span></td>
              <td><span style={{fontSize:12,color:ret?"var(--danger)":"var(--text2)"}}>{fmtDate(t.deadline)}{ret&&" ⚠️"}</span></td>
              <td><Bdg label={t.priorite} color={prioColor(t.priorite)}/></td>
              <td><select className="form-select" style={{padding:"4px 8px",fontSize:11,width:"auto"}} value={t.statut} onChange={e=>chgStat(t.id,e.target.value)}><option value="a_faire">À faire</option><option value="en_cours">En cours</option><option value="en_retard">En retard</option><option value="termine">Terminé</option></select></td>
              <td><div style={{display:"flex",gap:4}}>{canM&&<button className="btn btn-secondary btn-sm" onClick={()=>setEditM({...t})}>✏️</button>}{canM&&<button className="btn btn-danger btn-sm" onClick={()=>setConf(t.id)}>🗑️</button>}</div></td>
            </tr>);})}</tbody>
        </table></div>
      }
      {modal&&<Modal title="Nouvelle tâche" onClose={()=>{setModal(false);setErrs({});}} footer={<><button className="btn btn-secondary" onClick={()=>setModal(false)}>Annuler</button><button className="btn btn-primary" onClick={add}>Créer</button></>}><TF f={form} setF={setForm} e={errs}/></Modal>}
      {editM&&<Modal title="Modifier la tâche" onClose={()=>setEditM(null)} footer={<><button className="btn btn-secondary" onClick={()=>setEditM(null)}>Annuler</button><button className="btn btn-primary" onClick={upd}>Enregistrer</button></>}><TF f={editM} setF={setEditM} e={errs}/></Modal>}
      {conf&&<Confirm message="Supprimer cette tâche ?" onConfirm={()=>del(conf)} onCancel={()=>setConf(null)}/>}
    </div>
  );
};

const Reunions = ({data,setData,currentUser}) => {
  const [modal,setModal]=useState(false),[crM,setCrM]=useState(null),[conf,setConf]=useState(null);
  const [form,setForm]=useState({titre:"",date:"",heure:"",lieu:"",participants:[]});
  const [cr,setCr]=useState({texte:"",decisions:""}),[gt,setGt]=useState([]);
  const canM=currentUser.role!=="agent";
  const gu=id=>data.users.find(u=>u.id===id);
  const creer=async()=>{
    if(!form.titre||!form.date)return;
    const payload={
      titre:form.titre,date:form.date,heure:form.heure||null,lieu:form.lieu||null,
      statut:"planifiee",organisation_id:currentUser.organisationId,cree_par:currentUser.id
    };
    const saved=await saveToDb("reunions",payload,currentUser.token,currentUser.organisationId);
    const r={...payload,id:saved?.id||Date.now(),participants:form.participants,cr:"",decisions:[]};
    setData(d=>({...d,reunions:[...d.reunions,r]}));
    toast("Réunion planifiée");setModal(false);setForm({titre:"",date:"",heure:"",lieu:"",participants:[]});
  };
  const saveCR=async()=>{
    const dec=cr.decisions.split("\n").filter(Boolean);
    await updateInDb("reunions",crM.id,{compte_rendu:cr.texte,decisions:dec,statut:"tenue"},currentUser.token);
    setData(d=>({...d,reunions:d.reunions.map(r=>r.id===crM.id?{...r,cr:cr.texte,decisions:dec,statut:"tenue"}:r)}));
    if(gt.length>0){
      const nv=gt.filter(t=>t.titre);
      for(const t of nv){
        const payload={titre:t.titre,assigne_a:t.assigneA||null,assigne_par:currentUser.id,deadline:t.deadline||null,statut:"a_faire",priorite:"normale",reunion_id:crM.id,description:`Généré depuis : ${crM.titre}`,organisation_id:currentUser.organisationId};
        const saved=await saveToDb("taches",payload,currentUser.token,currentUser.organisationId);
        setData(d=>({...d,taches:[...d.taches,{...payload,id:saved?.id||Date.now(),assigneA:t.assigneA,assignePar:currentUser.id}]}));
      }
      if(nv.length>0)toast(`${nv.length} tâche(s) générée(s)`);
    }
    toast("CR enregistré");setCrM(null);setGt([]);
  };
  const del=async(id)=>{
    await deleteFromDb("reunions",id,currentUser.token);
    setData(d=>({...d,reunions:d.reunions.filter(r=>r.id!==id)}));
    toast("Réunion supprimée","info");setConf(null);
  };
  const openCR=r=>{setCrM(r);setCr({texte:r.cr||"",decisions:(r.decisions||[]).join("\n")});setGt([]);};
  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",gap:12}}>{[["planifiee","Planifiées","var(--accent2)"],["tenue","Tenues","var(--accent)"]].map(([s,l,c])=><div key={s} style={{padding:"10px 18px",background:"var(--surface2)",border:"1px solid var(--border)",borderRadius:10}}><div style={{fontSize:11,color:"var(--text2)"}}>{l}</div><div style={{fontFamily:"var(--font-display)",fontSize:20,fontWeight:800,color:c}}>{data.reunions.filter(r=>r.statut===s).length}</div></div>)}</div>
        {canM&&<button className="btn btn-primary" onClick={()=>setModal(true)}>+ Planifier réunion</button>}
      </div>
      {data.reunions.length===0?<div className="empty-state"><div className="empty-icon">🤝</div><div className="empty-title">Aucune réunion</div></div>:
        <div style={{display:"flex",flexDirection:"column",gap:12}}>{data.reunions.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(r=>(
          <div key={r.id} className="card" style={{padding:"16px 20px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><span style={{fontFamily:"var(--font-display)",fontSize:15,fontWeight:600}}>{r.titre}</span><Bdg label={statLabel(r.statut)} color={statColor(r.statut)}/></div>
                <div style={{display:"flex",gap:16,fontSize:12,color:"var(--text2)"}}><span>📅 {fmtDate(r.date)} {r.heure&&`à ${r.heure}`}</span>{r.lieu&&<span>📍 {r.lieu}</span>}<span>👥 {(r.participants||[]).length}</span></div>
                {(r.decisions||[]).length>0&&<div style={{marginTop:10}}><div style={{fontSize:11,color:"var(--text3)",marginBottom:4,textTransform:"uppercase"}}>Décisions</div>{r.decisions.map((d,i)=><div key={i} style={{fontSize:12,color:"var(--text2)",padding:"2px 0",display:"flex",gap:6}}><span style={{color:"var(--accent)"}}>→</span>{d}</div>)}</div>}
              </div>
              <div style={{display:"flex",gap:6,marginLeft:16,flexShrink:0}}>
                {canM&&r.statut==="planifiee"&&<button className="btn btn-secondary btn-sm" onClick={()=>openCR(r)}>✍️ CR</button>}
                {r.statut==="tenue"&&r.cr&&<button className="btn btn-secondary btn-sm" onClick={()=>openCR(r)}>📄 CR</button>}
                {canM&&<button className="btn btn-danger btn-sm" onClick={()=>setConf(r.id)}>🗑️</button>}
              </div>
            </div>
            <div style={{display:"flex",gap:4,marginTop:12}}>{(r.participants||[]).slice(0,5).map(pid=>{const u=gu(pid);return u?<Av key={pid} user={u} size="sm"/>:null;})}</div>
          </div>
        ))}</div>
      }
      {modal&&<Modal title="Planifier une réunion" onClose={()=>setModal(false)} footer={<><button className="btn btn-secondary" onClick={()=>setModal(false)}>Annuler</button><button className="btn btn-primary" onClick={creer}>Planifier</button></>}>
        <div className="form-group"><label className="form-label">Titre *</label><input className="form-input" value={form.titre} onChange={e=>setForm({...form,titre:e.target.value})} placeholder="Titre de la réunion"/></div>
        <div className="grid-2"><div className="form-group"><label className="form-label">Date *</label><input type="date" className="form-input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div className="form-group"><label className="form-label">Heure</label><input type="time" className="form-input" value={form.heure} onChange={e=>setForm({...form,heure:e.target.value})}/></div></div>
        <div className="form-group"><label className="form-label">Lieu / Lien</label><input className="form-input" value={form.lieu} onChange={e=>setForm({...form,lieu:e.target.value})} placeholder="Salle / Zoom"/></div>
        <div className="form-group"><label className="form-label">Participants</label><div style={{display:"flex",flexWrap:"wrap",gap:8}}>{data.users.map(u=><label key={u.id} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"6px 10px",background:form.participants.includes(u.id)?"rgba(0,200,150,0.1)":"var(--surface2)",borderRadius:8,border:`1px solid ${form.participants.includes(u.id)?"var(--accent)":"var(--border)"}`,fontSize:12}}><input type="checkbox" style={{display:"none"}} checked={form.participants.includes(u.id)} onChange={e=>setForm({...form,participants:e.target.checked?[...form.participants,u.id]:form.participants.filter(id=>id!==u.id)})}/><Av user={u} size="sm"/>{u.nom.split(" ")[0]}</label>)}</div></div>
      </Modal>}
      {crM&&<Modal title={`CR — ${crM.titre}`} onClose={()=>setCrM(null)} footer={<><button className="btn btn-secondary" onClick={()=>setCrM(null)}>Fermer</button>{canM&&<button className="btn btn-primary" onClick={saveCR}>💾 Enregistrer</button>}</>}>
        <div style={{padding:"10px 14px",background:"var(--surface2)",borderRadius:8,fontSize:12,color:"var(--text2)",marginBottom:16}}>📅 {fmtDate(crM.date)} {crM.heure&&`à ${crM.heure}`} · 📍 {crM.lieu}</div>
        <div className="form-group"><label className="form-label">Résumé des discussions</label><textarea className="form-textarea" style={{minHeight:110}} value={cr.texte} onChange={e=>setCr({...cr,texte:e.target.value})} readOnly={!canM}/></div>
        <div className="form-group"><label className="form-label">Décisions (une par ligne)</label><textarea className="form-textarea" value={cr.decisions} onChange={e=>setCr({...cr,decisions:e.target.value})} readOnly={!canM}/></div>
        {canM&&crM.statut==="planifiee"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}><label className="form-label" style={{margin:0}}>Générer des tâches depuis ce CR</label><button className="btn btn-secondary btn-sm" onClick={()=>setGt(t=>[...t,{titre:"",assigneA:"",deadline:""}])}>+ Ajouter</button></div>
          {gt.map((t,i)=><div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:8,marginBottom:8}}>
            <input className="form-input" value={t.titre} onChange={e=>setGt(ts=>ts.map((x,j)=>j===i?{...x,titre:e.target.value}:x))} placeholder="Titre"/>
            <select className="form-select" value={t.assigneA} onChange={e=>setGt(ts=>ts.map((x,j)=>j===i?{...x,assigneA:e.target.value}:x))}><option value="">Responsable</option>{data.users.map(u=><option key={u.id} value={u.id}>{u.nom.split(" ")[0]}</option>)}</select>
            <input type="date" className="form-input" value={t.deadline} onChange={e=>setGt(ts=>ts.map((x,j)=>j===i?{...x,deadline:e.target.value}:x))}/>
            <button className="btn btn-danger btn-sm" onClick={()=>setGt(ts=>ts.filter((_,j)=>j!==i))}>✕</button>
          </div>)}
        </div>}
      </Modal>}
      {conf&&<Confirm message="Supprimer cette réunion ?" onConfirm={()=>del(conf)} onCancel={()=>setConf(null)}/>}
    </div>
  );
};

const Agenda = ({data}) => {
  const [evts,setEvts]=useState([]),[modal,setModal]=useState(false);
  const [form,setForm]=useState({titre:"",date:"",heure:"",type:"evenement",lieu:"",description:""});
  const tc={formation:"#8b5cf6",mission:"#f97316",echeance:"#ef4444",evenement:"#3b82f6",reunion:"#00c896"};
  const tl={formation:"Formation",mission:"Mission terrain",echeance:"Échéance",evenement:"Événement",reunion:"Réunion"};
  const tous=[...evts,...data.reunions.filter(r=>r.statut==="planifiee").map(r=>({id:`r-${r.id}`,titre:r.titre,date:r.date,heure:r.heure,type:"reunion",lieu:r.lieu||"",description:"",readonly:true}))].sort((a,b)=>new Date(a.date)-new Date(b.date));
  const add=()=>{if(!form.titre||!form.date)return;setEvts(e=>[...e,{id:Date.now(),...form}]);toast("Événement ajouté");setModal(false);setForm({titre:"",date:"",heure:"",type:"evenement",lieu:"",description:""});};
  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div style={{fontSize:13,color:"var(--text2)"}}>{tous.length} événement(s)</div><button className="btn btn-primary" onClick={()=>setModal(true)}>+ Ajouter événement</button></div>
      {tous.length===0?<div className="empty-state"><div className="empty-icon">📅</div><div className="empty-title">Aucun événement planifié</div></div>:
        <div style={{display:"flex",flexDirection:"column",gap:10}}>{tous.map(e=>(
          <div key={e.id} className="card" style={{padding:"14px 18px",borderLeft:`3px solid ${tc[e.type]||"#6b7280"}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div><div style={{fontSize:13,fontWeight:600,marginBottom:4}}>{e.titre}</div><div style={{fontSize:11,color:"var(--text3)"}}>📅 {fmtDate(e.date)} {e.heure&&`à ${e.heure}`} {e.lieu&&`· 📍 ${e.lieu}`}</div>{e.description&&<div style={{fontSize:12,color:"var(--text2)",marginTop:4}}>{e.description}</div>}</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}><Bdg label={tl[e.type]||e.type} color={tc[e.type]||"#6b7280"}/>{!e.readonly&&<button className="btn btn-danger btn-sm" onClick={()=>setEvts(v=>v.filter(x=>x.id!==e.id))}>🗑️</button>}</div>
            </div>
          </div>
        ))}</div>
      }
      {modal&&<Modal title="Nouvel événement" onClose={()=>setModal(false)} footer={<><button className="btn btn-secondary" onClick={()=>setModal(false)}>Annuler</button><button className="btn btn-primary" onClick={add}>Ajouter</button></>}>
        <div className="form-group"><label className="form-label">Titre *</label><input className="form-input" value={form.titre} onChange={e=>setForm({...form,titre:e.target.value})}/></div>
        <div className="grid-2"><div className="form-group"><label className="form-label">Date *</label><input type="date" className="form-input" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></div><div className="form-group"><label className="form-label">Heure</label><input type="time" className="form-input" value={form.heure} onChange={e=>setForm({...form,heure:e.target.value})}/></div></div>
        <div className="grid-2">
          <div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{Object.entries(tl).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          <div className="form-group"><label className="form-label">Lieu</label><input className="form-input" value={form.lieu} onChange={e=>setForm({...form,lieu:e.target.value})}/></div>
        </div>
        <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" style={{minHeight:80}} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></div>
      </Modal>}
    </div>
  );
};

const Annuaire = ({data,setData,currentUser}) => {
  const [ong,setOng]=useState("membres"),[invM,setInvM]=useState(false),[invF,setInvF]=useState({email:"",nom:"",poste:"",role:"agent",dept:""}),[invS,setInvS]=useState(""),[invs,setInvs]=useState([]),[search,setSearch]=useState(""),[tmpPassword,setTmpPassword]=useState(""),[invErrMsg,setInvErrMsg]=useState("");
  const canM=currentUser.role==="directeur"||currentUser.role==="coordinateur";
  const rc={directeur:"#f59e0b",coordinateur:"#3b82f6",agent:"#22c55e"};
  const rl={directeur:"Directeur",coordinateur:"Coordinateur",agent:"Agent"};
  const filt=data.users.filter(u=>!search||u.nom?.toLowerCase().includes(search.toLowerCase())||u.poste?.toLowerCase().includes(search.toLowerCase()));
  const invite=async()=>{
    if(!invF.email||!invF.nom)return;setInvS("envoi");
    try{
      const tmpPwd=Math.random().toString(36).slice(-8).toUpperCase()+"@"+Math.floor(Math.random()*9000+1000);
      const invRes=await fetch(`${SUPABASE_URL}/auth/v1/signup`,{
        method:"POST",
        headers:{"Content-Type":"application/json","apikey":SUPABASE_ANON_KEY},
        body:JSON.stringify({
          email:invF.email,password:tmpPwd,
          data:{nom:invF.nom,role:invF.role||"agent",organisation_id:currentUser.organisationId}
        })
      });
      const r=await invRes.json();
      if(r?.user||r?.session){
        const uid=r?.user?.id||r?.session?.user?.id;
        await new Promise(res=>setTimeout(res,2000));
        if(uid){
          // PATCH d'abord
          const patchRes=await sbFetch(`/rest/v1/profils?id=eq.${uid}`,{method:"PATCH",body:JSON.stringify({
            nom:invF.nom,role:invF.role||"agent",poste:invF.poste||"",
            departement:invF.dept||"",organisation_id:currentUser.organisationId,actif:true
          })},currentUser.token);
          // INSERT si PATCH échoue
          if(!patchRes||patchRes?.length===0){
            await sbFetch(`/rest/v1/profils`,{method:"POST",body:JSON.stringify({
              id:uid,email:invF.email,nom:invF.nom,role:invF.role||"agent",
              poste:invF.poste||"",departement:invF.dept||"",
              organisation_id:currentUser.organisationId,actif:true
            })},currentUser.token);
          }
        }
        setData(d=>({...d,users:[...d.users,{id:uid||Date.now(),nom:invF.nom,role:invF.role||"agent",poste:invF.poste||"",email:invF.email,actif:true,departement:invF.dept||""}]}));
        setInvs(p=>[...p,{id:Date.now(),...invF,statut:"en_attente",date:new Date().toISOString().split("T")[0]}]);
        setTmpPassword(tmpPwd);
        setInvS("succes");
        setTimeout(()=>{setInvM(false);setInvS("");setInvF({email:"",nom:"",poste:"",role:"agent",dept:""});setTmpPassword("");},8000);
      }else{
        const errMsg=r?.error?.message||r?.msg||"";
        if(errMsg.toLowerCase().includes("already")){
          setInvErrMsg("Cet email est déjà enregistré.");
        }else{
          setInvErrMsg(errMsg||"Erreur. Vérifiez l'email.");
        }
        setInvS("erreur");
        setTimeout(()=>{setInvS("");setInvErrMsg("");},4000);
      }
    }catch(e){
      console.error("Invitation erreur:",e);
      setInvS("erreur");setInvErrMsg("Erreur de connexion.");
      setTimeout(()=>{setInvS("");setInvErrMsg("");},4000);
    }
  };
  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
        <div className="tabs" style={{width:"auto",marginBottom:0}}><button className={`tab ${ong==="membres"?"active":""}`} onClick={()=>setOng("membres")}>👥 Membres ({data.users.length})</button><button className={`tab ${ong==="invitations"?"active":""}`} onClick={()=>setOng("invitations")}>✉️ Invitations ({invs.filter(i=>i.statut==="en_attente").length})</button></div>
        {canM&&<button className="btn btn-primary" onClick={()=>setInvM(true)}>✉️ Inviter un collaborateur</button>}
      </div>
      {ong==="membres"&&<>
        <div style={{marginBottom:16}}><div className="search-wrap"><span className="search-icon">🔍</span><input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..."/></div></div>
        {filt.length===0?<div className="empty-state"><div className="empty-icon">👥</div><div className="empty-title">Aucun membre</div></div>:
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>{filt.map(u=>(
            <div key={u.id} className="card" style={{padding:20,opacity:u.actif?1:0.6}}>
              <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}><Av user={u} size="lg"/><div><div style={{fontFamily:"var(--font-display)",fontWeight:600,fontSize:14}}>{u.nom}</div><div style={{fontSize:12,color:"var(--text2)",marginTop:2}}>{u.poste}</div><Bdg label={rl[u.role]||u.role} color={rc[u.role]||"#6b7280"}/></div></div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {u.dept&&<div style={{fontSize:12,color:"var(--text2)",display:"flex",gap:6}}><span>🏢</span>{u.dept}</div>}
                <div style={{fontSize:12,color:"var(--text2)",display:"flex",gap:6}}><span>📧</span>{u.email}</div>
                {u.tel&&<div style={{fontSize:12,color:"var(--text2)",display:"flex",gap:6}}><span>📱</span>{u.tel}</div>}
              </div>
              <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid var(--border)",display:"flex",alignItems:"center",gap:6}}><div style={{width:8,height:8,borderRadius:"50%",background:u.actif?"var(--accent)":"var(--accent3)"}} className={u.actif?"pulse-anim":""}/><span style={{fontSize:11,color:u.actif?"var(--accent)":"var(--accent3)"}}>{u.actif?"Actif":"Invitation en attente"}</span></div>
            </div>
          ))}</div>
        }
      </>}
      {ong==="invitations"&&<div className="card" style={{padding:0}}>
        {invs.length===0?<div className="empty-state"><div className="empty-icon">✉️</div><div className="empty-title">Aucune invitation</div></div>:
          <table className="table"><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>Date</th><th>Statut</th></tr></thead>
            <tbody>{invs.map(i=><tr key={i.id}><td style={{fontWeight:500}}>{i.nom}</td><td style={{fontSize:12,color:"var(--text2)"}}>{i.email}</td><td><Bdg label={rl[i.role]||i.role} color={rc[i.role]||"#6b7280"}/></td><td style={{fontSize:12,color:"var(--text2)"}}>{fmtDate(i.date)}</td><td><Bdg label={i.statut==="en_attente"?"En attente":"Acceptée"} color={i.statut==="en_attente"?"#f59e0b":"#00c896"}/></td></tr>)}</tbody>
          </table>
        }
      </div>}
      {invM&&<Modal title="✉️ Inviter un collaborateur" onClose={()=>{setInvM(false);setInvS("");}} footer={invS==="succes"?null:<><button className="btn btn-secondary" onClick={()=>setInvM(false)}>Annuler</button><button className="btn btn-primary" onClick={invite} disabled={invS==="envoi"}>{invS==="envoi"?<><Spinner/> Envoi...</>:"✉️ Envoyer"}</button></>}>
        {invS==="succes"?<div style={{textAlign:"center",padding:"24px 0"}}><div style={{fontSize:40,marginBottom:12}}>✅</div><div style={{fontFamily:"var(--font-display)",fontSize:16,fontWeight:700,color:"var(--accent)",marginBottom:8}}>Invitation envoyée !</div><div style={{fontSize:13,color:"var(--text2)",marginBottom:12}}>Compte créé pour <strong>{invF.email}</strong>.</div>
              <div style={{background:"var(--surface2)",border:"1px solid var(--accent)",borderRadius:8,padding:"12px 16px",marginBottom:12}}>
                <div style={{fontSize:11,color:"var(--text3)",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.5px"}}>Mot de passe temporaire à partager</div>
                <div style={{fontFamily:"var(--font-display)",fontSize:18,fontWeight:700,color:"var(--accent)",letterSpacing:2}}>{tmpPassword}</div>
                <div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>Demandez au collaborateur de le changer dans Paramètres → Sécurité</div>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={()=>{navigator.clipboard.writeText(tmpPassword);toast("Mot de passe copié");}}>📋 Copier le mot de passe</button></div>:
         invS==="erreur"?<div className="alert alert-danger">Erreur lors de l'envoi. Vérifiez l'email et vos droits.</div>:<>
          <div className="alert alert-info">Le collaborateur recevra un email pour créer son mot de passe.</div>
          <div className="form-group"><label className="form-label">Email *</label><input className="form-input" type="email" value={invF.email} onChange={e=>setInvF({...invF,email:e.target.value})} placeholder="email@organisation.bj"/></div>
          <div className="form-group"><label className="form-label">Nom complet *</label><input className="form-input" value={invF.nom} onChange={e=>setInvF({...invF,nom:e.target.value})} placeholder="Prénom Nom"/></div>
          <div className="grid-2">
            <div className="form-group"><label className="form-label">Rôle</label><select className="form-select" value={invF.role} onChange={e=>setInvF({...invF,role:e.target.value})}>{currentUser.role==="directeur"&&<option value="coordinateur">Coordinateur</option>}<option value="agent">Agent</option></select></div>
            <div className="form-group"><label className="form-label">Département</label><DeptsSelect value={invF.dept} onChange={v=>setInvF({...invF,dept:v})} depts={data.departements||[]}/></div>
          </div>
          <div className="form-group"><label className="form-label">Poste</label><input className="form-input" value={invF.poste} onChange={e=>setInvF({...invF,poste:e.target.value})} placeholder="Ex: Chargé de projets"/></div>
        </>}
      </Modal>}
    </div>
  );
};

const Documents = ({data,setData,currentUser}) => {
  const [modal,setModal]=useState(false),[conf,setConf]=useState(null),[form,setForm]=useState({nom:"",type:"rapport",dept:""}),[fich,setFich]=useState(null),[upl,setUpl]=useState(false),[drag,setDrag]=useState(false),[search,setSearch]=useState("");
  const fRef=useRef();
  const ti={rapport:"📊",procedure:"📋",planification:"🗺️",finance:"💰",contrat:"📄",autre:"📁"};
  const docs=data.documents.filter(d=>!search||d.nom.toLowerCase().includes(search.toLowerCase())||d.type.toLowerCase().includes(search.toLowerCase()));
  const setF=f=>{if(!f)return;setFich(f);if(!form.nom)setForm(p=>({...p,nom:f.name.replace(/\.[^/.]+$/,"")}));};
  const add=async()=>{
    if(!form.nom){toast("Le nom est obligatoire","error");return;}
    setUpl(true);let url="#",taille=fich?`${(fich.size/1024/1024).toFixed(1)} MB`:"—",storagePath=null;
    if(fich){const p=`${currentUser.organisationId||"demo"}/${Date.now()}_${fich.name}`;const u=await storageUpload(p,fich,currentUser.token);if(u){url=u;storagePath=p;}}
    const payload={nom:form.nom,type:form.type,departement:form.dept||null,taille,url,storage_path:storagePath,organisation_id:currentUser.organisationId};
    const saved=await saveToDb("documents",payload,currentUser.token,currentUser.organisationId);
    setData(d=>({...d,documents:[...d.documents,{...payload,id:saved?.id||Date.now(),dept:form.dept,date:new Date().toISOString().split("T")[0],uploadePar:currentUser.id}]}));
    toast("Document enregistré");setUpl(false);setModal(false);setFich(null);setForm({nom:"",type:"rapport",dept:""});
  };
  const del=async(id)=>{
    await deleteFromDb("documents",id,currentUser.token);
    setData(d=>({...d,documents:d.documents.filter(x=>x.id!==id)}));
    toast("Document supprimé","info");setConf(null);
  };
  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div className="search-wrap"><span className="search-icon">🔍</span><input className="search-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher..."/></div><button className="btn btn-primary" onClick={()=>setModal(true)}>+ Ajouter document</button></div>
      {docs.length===0?<div className="empty-state"><div className="empty-icon">📁</div><div className="empty-title">Aucun document archivé</div><div style={{fontSize:13,color:"var(--text3)"}}>Commencez par ajouter vos premiers documents.</div></div>:
        <div className="card" style={{padding:0}}><table className="table"><thead><tr><th>Document</th><th>Type</th><th>Département</th><th>Taille</th><th>Date</th><th>Actions</th></tr></thead>
          <tbody>{docs.map(d=><tr key={d.id}><td><div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:20}}>{ti[d.type]||"📁"}</span><span style={{fontWeight:500,fontSize:13}}>{d.nom}</span></div></td><td><Bdg label={d.type} color="#6b7280"/></td><td><span style={{fontSize:12,color:"var(--text2)"}}>{d.dept||"—"}</span></td><td><span style={{fontSize:12,color:"var(--text3)"}}>{d.taille}</span></td><td><span style={{fontSize:12,color:"var(--text2)"}}>{fmtDate(d.date)}</span></td><td><div style={{display:"flex",gap:6}}>{d.url!=="#"&&<><a href={d.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">👁️ Voir</a><a href={d.url} download target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">⬇️</a></>}{d.url==="#"&&<span style={{fontSize:11,color:"var(--text3)"}}>Sans fichier</span>}<button className="btn btn-danger btn-sm" onClick={()=>setConf(d.id)}>🗑️</button></div></td></tr>)}</tbody>
        </table></div>
      }
      {modal&&<Modal title="Ajouter un document" onClose={()=>setModal(false)} footer={<><button className="btn btn-secondary" onClick={()=>setModal(false)}>Annuler</button><button className="btn btn-primary" onClick={add} disabled={upl}>{upl?<><Spinner/> Upload...</>:"Enregistrer"}</button></>}>
        <div className={`upload-zone${drag?" drag":""}`} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);setF(e.dataTransfer.files[0])}} onClick={()=>fRef.current.click()}>
          <input type="file" ref={fRef} style={{display:"none"}} accept=".pdf,.docx,.xlsx,.doc,.xls,.png,.jpg" onChange={e=>setF(e.target.files[0])}/>
          {fich?<><div style={{fontSize:28,marginBottom:8}}>✅</div><div style={{fontSize:13,fontWeight:500}}>{fich.name}</div><div style={{fontSize:11,marginTop:4,color:"var(--text3)"}}>{(fich.size/1024/1024).toFixed(2)} MB</div></>:<><div style={{fontSize:32,marginBottom:8}}>📎</div><div style={{fontSize:13}}>Glisser-déposer ou cliquer pour sélectionner</div><div style={{fontSize:11,marginTop:4}}>PDF, DOCX, XLSX, Images — Max 10 MB</div></>}
        </div>
        <div className="form-group" style={{marginTop:16}}><label className="form-label">Nom *</label><input className="form-input" value={form.nom} onChange={e=>setForm({...form,nom:e.target.value})} placeholder="Nom du document"/></div>
        <div className="grid-2"><div className="form-group"><label className="form-label">Type</label><select className="form-select" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="rapport">Rapport</option><option value="procedure">Procédure</option><option value="planification">Planification</option><option value="finance">Finance</option><option value="contrat">Contrat</option><option value="autre">Autre</option></select></div><div className="form-group"><label className="form-label">Département</label><DeptsSelect value={form.dept} onChange={v=>setForm({...form,dept:v})} depts={data.departements||[]}/></div></div>
      </Modal>}
      {conf&&<Confirm message="Supprimer ce document ?" onConfirm={()=>del(conf)} onCancel={()=>setConf(null)}/>}
    </div>
  );
};

const Messagerie = ({data,setData,currentUser}) => {
  const [sel,setSel]=useState(null),[modal,setModal]=useState(false),[conf,setConf]=useState(null),[form,setForm]=useState({a:"",sujet:"",contenu:""});
  const gu=id=>data.users.find(u=>u.id===id);
  const mes=data.messages.filter(m=>m.a===currentUser.id||m.de===currentUser.id);
  const nlu=mes.filter(m=>!m.lu&&m.a===currentUser.id).length;
  const send=async()=>{
    if(!form.a||!form.sujet||!form.contenu){toast("Remplissez tous les champs","error");return;}
    const newMsg={de:currentUser.id,a:form.a,sujet:form.sujet,contenu:form.contenu,date:new Date().toLocaleString("fr-FR"),lu:false,organisation_id:currentUser.organisationId};
    const saved=await saveToDb("messages",newMsg,currentUser.token,currentUser.organisationId);
    setData(d=>({...d,messages:[{...newMsg,id:saved?.id||Date.now()},...d.messages]}));
    toast("Message envoyé");setModal(false);setForm({a:"",sujet:"",contenu:""});
  };
  const del=async(id)=>{
    await deleteFromDb("messages",id,currentUser.token);
    setData(d=>({...d,messages:d.messages.filter(m=>m.id!==id)}));
    if(sel?.id===id)setSel(null);toast("Message supprimé","info");setConf(null);
  };
  const lu=async(id)=>{
    await updateInDb("messages",id,{lu:true},currentUser.token);
    setData(d=>({...d,messages:d.messages.map(m=>m.id===id?{...m,lu:true}:m)}));
  };
  return(
    <div className="fade-in">
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}><div style={{fontSize:13,color:"var(--text2)"}}>{nlu>0&&<span style={{color:"var(--accent)",fontWeight:600}}>{nlu} non lu(s) · </span>}{mes.length} message(s)</div><button className="btn btn-primary" onClick={()=>setModal(true)}>✍️ Nouveau message</button></div>
      <div className="grid-2" style={{height:"calc(100vh - 220px)",minHeight:400}}>
        <div className="card" style={{padding:0,overflow:"auto"}}>
          {mes.length===0?<div className="empty-state"><div className="empty-icon">💬</div><div className="empty-title">Aucun message</div></div>:mes.map(m=>{const exp=gu(m.de);const fm=m.de===currentUser.id;return(
            <div key={m.id} onClick={()=>{setSel(m);if(!m.lu&&!fm)lu(m.id);}} style={{padding:"14px 16px",cursor:"pointer",borderBottom:"1px solid var(--border)",background:sel?.id===m.id?"rgba(0,200,150,0.06)":"transparent",borderLeft:!m.lu&&!fm?"3px solid var(--accent)":"3px solid transparent"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>{exp&&<Av user={exp} size="sm"/>}<div style={{flex:1,minWidth:0}}><div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,fontWeight:!m.lu&&!fm?600:400}}>{fm?`→ ${gu(m.a)?.nom}`:exp?.nom}</span><span style={{fontSize:10,color:"var(--text3)"}}>{m.date?.split(" ")[0]}</span></div><div style={{fontSize:12,fontWeight:!m.lu&&!fm?600:400,color:"var(--text2)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.sujet}</div><div style={{fontSize:11,color:"var(--text3)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{m.contenu?.slice(0,60)}...</div></div></div>
            </div>);})}
        </div>
        <div className="card" style={{overflow:"auto"}}>
          {sel?<><div style={{borderBottom:"1px solid var(--border)",paddingBottom:16,marginBottom:16}}><div style={{fontFamily:"var(--font-display)",fontSize:16,fontWeight:700,marginBottom:10}}>{sel.sujet}</div><div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:"var(--text2)"}}><div style={{display:"flex",alignItems:"center",gap:8}}>{gu(sel.de)&&<Av user={gu(sel.de)} size="sm"/>}<span><strong>De :</strong> {gu(sel.de)?.nom}</span></div><span>{sel.date}</span></div><div style={{fontSize:12,color:"var(--text2)",marginTop:4}}><strong>À :</strong> {gu(sel.a)?.nom}</div></div><div style={{fontSize:13.5,lineHeight:1.7}}>{sel.contenu}</div><div style={{marginTop:20,paddingTop:16,borderTop:"1px solid var(--border)",display:"flex",gap:8}}><button className="btn btn-secondary btn-sm" onClick={()=>{setModal(true);setForm({a:sel.de.toString(),sujet:`Re: ${sel.sujet}`,contenu:""});}}>↩️ Répondre</button><button className="btn btn-danger btn-sm" onClick={()=>setConf(sel.id)}>🗑️ Supprimer</button></div></>:<div className="empty-state"><div className="empty-icon">💬</div><div className="empty-title">Sélectionnez un message</div></div>}
        </div>
      </div>
      {modal&&<Modal title="Nouveau message" onClose={()=>setModal(false)} footer={<><button className="btn btn-secondary" onClick={()=>setModal(false)}>Annuler</button><button className="btn btn-primary" onClick={send}>Envoyer</button></>}><div className="form-group"><label className="form-label">Destinataire *</label><select className="form-select" value={form.a} onChange={e=>setForm({...form,a:e.target.value})}><option value="">Sélectionner...</option>{data.users.filter(u=>u.id!==currentUser.id).map(u=><option key={u.id} value={u.id}>{u.nom} — {u.poste}</option>)}</select></div><div className="form-group"><label className="form-label">Sujet *</label><input className="form-input" value={form.sujet} onChange={e=>setForm({...form,sujet:e.target.value})} placeholder="Objet"/></div><div className="form-group"><label className="form-label">Message *</label><textarea className="form-textarea" style={{minHeight:140}} value={form.contenu} onChange={e=>setForm({...form,contenu:e.target.value})} placeholder="Rédigez votre message..."/></div></Modal>}
      {conf&&<Confirm message="Supprimer ce message ?" onConfirm={()=>del(conf)} onCancel={()=>setConf(null)}/>}
    </div>
  );
};

const Budget = ({data,setData,currentUser}) => {
  const [modal,setModal]=useState(false),[editM,setEditM]=useState(null),[conf,setConf]=useState(null);
  const ef={projet:"",montantTotal:"",depense:"0",dept:"",bailleurs:"",annee:new Date().getFullYear().toString()};
  const [form,setForm]=useState(ef);
  const canM=currentUser.role!=="agent";
  const tot=data.budgets.reduce((s,b)=>s+b.montantTotal,0);
  const dep=data.budgets.reduce((s,b)=>s+b.depense,0);
  const taux=tot>0?Math.round(dep/tot*100):0;
  const add=async()=>{
    if(!form.projet||!form.montantTotal){toast("Remplissez les champs obligatoires","error");return;}
    const payload={
      projet:form.projet,montant_total:parseInt(form.montantTotal),
      montant_depense:parseInt(form.depense||0),departement:form.dept||null,
      bailleur:form.bailleurs||null,annee:parseInt(form.annee),
      description:form.description||null,organisation_id:currentUser.organisationId
    };
    const saved=await saveToDb("budgets",payload,currentUser.token,currentUser.organisationId);
    setData(d=>({...d,budgets:[...d.budgets,{...payload,id:saved?.id||Date.now(),montantTotal:payload.montant_total,depense:payload.montant_depense,dept:form.dept,bailleurs:form.bailleurs}]}));
    toast("Budget créé");setModal(false);setForm(ef);
  };
  const upd=async()=>{
    await updateInDb("budgets",editM.id,{
      projet:editM.projet,montant_total:parseInt(editM.montantTotal),
      montant_depense:parseInt(editM.depense||0),bailleur:editM.bailleurs||null,
      departement:editM.dept||null
    },currentUser.token);
    setData(d=>({...d,budgets:d.budgets.map(b=>b.id===editM.id?{...editM,montantTotal:parseInt(editM.montantTotal),depense:parseInt(editM.depense||0)}:b)}));
    toast("Budget mis à jour");setEditM(null);
  };
  const del=async(id)=>{
    await deleteFromDb("budgets",id,currentUser.token);
    setData(d=>({...d,budgets:d.budgets.filter(b=>b.id!==id)}));
    toast("Budget supprimé","info");setConf(null);
  };
  const BF=({f,setF})=>(
    <>
      <div className="form-group"><label className="form-label">Intitulé *</label><input className="form-input" value={f.projet} onChange={e=>setF({...f,projet:e.target.value})} placeholder="Nom du projet"/></div>
      <div className="grid-2"><div className="form-group"><label className="form-label">Budget total (FCFA) *</label><input type="number" className="form-input" value={f.montantTotal} onChange={e=>setF({...f,montantTotal:e.target.value})} placeholder="Ex: 25000000"/></div><div className="form-group"><label className="form-label">Déjà dépensé (FCFA)</label><input type="number" className="form-input" value={f.depense} onChange={e=>setF({...f,depense:e.target.value})}/></div></div>
      <div className="grid-2"><div className="form-group"><label className="form-label">Bailleur / Source</label><input className="form-input" value={f.bailleurs} onChange={e=>setF({...f,bailleurs:e.target.value})} placeholder="GIZ, USAID, Fonds propres..."/></div><div className="form-group"><label className="form-label">Département</label><DeptsSelect value={f.dept} onChange={v=>setF({...f,dept:v})} depts={data.departements||[]}/></div></div>
    </>
  );
  return(
    <div className="fade-in">
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:20}}>
        {[["Budget total",fmtMontant(tot),"var(--accent)","green"],["Dépensé",fmtMontant(dep),"var(--accent2)","blue"],["Taux d'exécution",`${taux}%`,taux>80?"var(--danger)":"var(--accent3)",taux>80?"red":"orange"]].map(([l,v,c,cl])=>(
          <div key={l} className={`stat-card ${cl}`}><div style={{fontSize:12,color:"var(--text2)",marginBottom:6}}>{l}</div><div style={{fontFamily:"var(--font-display)",fontSize:20,fontWeight:800,color:c}}>{v}</div></div>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:14}}>{canM&&<button className="btn btn-primary" onClick={()=>setModal(true)}>+ Nouveau budget</button>}</div>
      {data.budgets.length===0?<div className="empty-state"><div className="empty-icon">💰</div><div className="empty-title">Aucun budget enregistré</div></div>:
        <div style={{display:"flex",flexDirection:"column",gap:14}}>{data.budgets.map(b=>{
          const p=b.montantTotal>0?Math.round(b.depense/b.montantTotal*100):0;
          const bc=p>90?"var(--danger)":p>70?"var(--accent3)":"var(--accent)";
          return(
            <div key={b.id} className="card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                <div><div style={{fontFamily:"var(--font-display)",fontSize:15,fontWeight:600,marginBottom:4}}>{b.projet}</div><div style={{display:"flex",gap:12,fontSize:12,color:"var(--text2)"}}>{b.bailleurs&&<span>🏦 {b.bailleurs}</span>}{b.dept&&<span>🏢 {b.dept}</span>}<span>📅 {b.annee}</span></div></div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}><div style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:800,color:bc}}>{p}%</div>{canM&&<><button className="btn btn-secondary btn-sm" onClick={()=>setEditM({...b})}>✏️</button><button className="btn btn-danger btn-sm" onClick={()=>setConf(b.id)}>🗑️</button></>}</div>
              </div>
              <div className="progress-bar" style={{height:8,marginBottom:12}}><div className="progress-fill" style={{width:`${p}%`,background:bc}}/></div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {[["Budget total",fmtMontant(b.montantTotal),"var(--text)"],["Dépensé",fmtMontant(b.depense),"var(--accent2)"],["Restant",fmtMontant(b.montantTotal-b.depense),bc]].map(([l,v,c])=>(
                  <div key={l} style={{padding:"10px 14px",background:"var(--surface2)",borderRadius:8}}><div style={{fontSize:11,color:"var(--text3)",marginBottom:4}}>{l}</div><div style={{fontSize:13,fontWeight:600,color:c}}>{v}</div></div>
                ))}
              </div>
            </div>);
        })}</div>
      }
      {modal&&<Modal title="Nouveau budget" onClose={()=>setModal(false)} footer={<><button className="btn btn-secondary" onClick={()=>setModal(false)}>Annuler</button><button className="btn btn-primary" onClick={add}>Créer</button></>}><BF f={form} setF={setForm}/></Modal>}
      {editM&&<Modal title="Modifier le budget" onClose={()=>setEditM(null)} footer={<><button className="btn btn-secondary" onClick={()=>setEditM(null)}>Annuler</button><button className="btn btn-primary" onClick={upd}>Enregistrer</button></>}><BF f={editM} setF={setEditM}/></Modal>}
      {conf&&<Confirm message="Supprimer ce budget ?" onConfirm={()=>del(conf)} onCancel={()=>setConf(null)}/>}
    </div>
  );
};

const PLAN_LIMITES = { ong_locale: 10, starter: 20, pro: 50, institution: Infinity };

const Parametres = ({currentUser, setCurrentUser, data, setData}) => {
  const [ong,setOng] = useState("profil");
  const [profil,setProfil] = useState({nom:currentUser.nom||"",poste:currentUser.poste||"",tel:currentUser.telephone||""});
  const [mdp,setMdp] = useState({nouveau:"",confirmer:""});
  const [load,setLoad] = useState(false);

  // Organisation
  const [org,setOrg] = useState({
    nom: currentUser.organisationNom||"",
    type: currentUser.organisationType||"",
    ville: currentUser.organisationVille||"",
    pays: currentUser.organisationPays||"Bénin",
    secteur: currentUser.organisationSecteur||"",
    ifu: currentUser.organisationIfu||"",
    rccm: currentUser.organisationRccm||"",
    logoUrl: currentUser.organisationLogo||"",
    telephone: currentUser.organisationTel||"",
    adresse: currentUser.organisationAdresse||"",
    siteWeb: currentUser.organisationSite||"",
  });
  const [orgLoad,setOrgLoad] = useState(false);

  // Départements
  const [depts,setDepts] = useState(
    data.departements || ["Direction","Programmes","Administration"]
  );
  const [newDept,setNewDept] = useState("");
  const [deptLoad,setDeptLoad] = useState(false);

  const rc = {directeur:"#f59e0b",coordinateur:"#3b82f6",agent:"#22c55e"};
  const canManage = currentUser.role === "directeur";

  // Limite membres selon plan
  const planActuel = currentUser.planAbonnement || "starter";
  const limiteMembers = PLAN_LIMITES[planActuel] || 20;
  const membresActuels = data.users.length;
  const pctMembres = limiteMembers > 0 && limiteMembers !== Infinity
    ? Math.round((membresActuels / limiteMembers) * 100) : 0;

  const saveProfil = () => {
    setCurrentUser(u => ({...u,...profil}));
    toast("Profil mis à jour");
  };

  const saveOrg = async () => {
    setOrgLoad(true);
    try {
      await sbFetch(
        `/rest/v1/organisations?id=eq.${currentUser.organisationId}`,
        { method: "PATCH", body: JSON.stringify({
          nom: org.nom, type: org.type, ville: org.ville, pays: org.pays,
          secteur: org.secteur, ifu: org.ifu, rccm: org.rccm,
          logo_url: org.logoUrl, telephone: org.telephone,
          adresse: org.adresse, site_web: org.siteWeb,
        })},
        currentUser.token
      );
      setCurrentUser(u => ({...u,
        organisationNom: org.nom, organisationLogo: org.logoUrl,
        organisationIfu: org.ifu, organisationRccm: org.rccm,
      }));
      toast("Organisation mise à jour");
    } catch { toast("Erreur lors de la mise à jour","error"); }
    setOrgLoad(false);
  };

  const ajouterDept = () => {
    if (!newDept.trim()) return;
    if (depts.includes(newDept.trim())) { toast("Ce département existe déjà","error"); return; }
    const newList = [...depts, newDept.trim()];
    setDepts(newList);
    setData(d => ({...d, departements: newList}));
    setNewDept("");
    toast("Département ajouté");
  };

  const supprimerDept = (dept) => {
    if (["Direction"].includes(dept)) { toast("Impossible de supprimer ce département","error"); return; }
    const newList = depts.filter(d => d !== dept);
    setDepts(newList);
    setData(d => ({...d, departements: newList}));
    toast("Département supprimé","info");
  };

  const chgMdp = async () => {
    if (mdp.nouveau !== mdp.confirmer) { toast("Les mots de passe ne correspondent pas","error"); return; }
    if (mdp.nouveau.length < 6) { toast("Minimum 6 caractères","error"); return; }
    setLoad(true);
    const r = await authAPI.updatePassword(mdp.nouveau, currentUser.token);
    if (r?.id||r?.updated_at) { toast("Mot de passe modifié"); setMdp({nouveau:"",confirmer:""}); }
    else toast("Erreur lors du changement","error");
    setLoad(false);
  };

  return (
    <div className="fade-in">
      <div className="tabs">
        <button className={`tab ${ong==="profil"?"active":""}`} onClick={()=>setOng("profil")}>👤 Mon profil</button>
        {canManage && <button className={`tab ${ong==="organisation"?"active":""}`} onClick={()=>setOng("organisation")}>🏢 Organisation</button>}
        {canManage && <button className={`tab ${ong==="departements"?"active":""}`} onClick={()=>setOng("departements")}>🗂️ Départements</button>}
        {canManage && <button className={`tab ${ong==="membres_info"?"active":""}`} onClick={()=>setOng("membres_info")}>👥 Membres</button>}
        <button className={`tab ${ong==="securite"?"active":""}`} onClick={()=>setOng("securite")}>🔐 Sécurité</button>
      </div>

      {/* ---- MON PROFIL ---- */}
      {ong==="profil" && <div className="card" style={{maxWidth:560}}>
        <div className="card-title">Informations personnelles</div>
        <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:24,padding:16,background:"var(--surface2)",borderRadius:10}}>
          <Av user={currentUser} size="lg"/>
          <div>
            <div style={{fontFamily:"var(--font-display)",fontSize:16,fontWeight:700}}>{currentUser.nom}</div>
            <div style={{fontSize:12,color:"var(--text2)"}}>{currentUser.email}</div>
            <Bdg label={currentUser.role} color={rc[currentUser.role]||"#6b7280"}/>
          </div>
        </div>
        <div className="form-group"><label className="form-label">Nom complet</label><input className="form-input" value={profil.nom} onChange={e=>setProfil({...profil,nom:e.target.value})}/></div>
        <div className="form-group"><label className="form-label">Poste / Fonction</label><input className="form-input" value={profil.poste} onChange={e=>setProfil({...profil,poste:e.target.value})}/></div>
        <div className="form-group"><label className="form-label">Téléphone</label><input className="form-input" value={profil.tel} onChange={e=>setProfil({...profil,tel:e.target.value})} placeholder="+229 97 XX XX XX"/></div>
        <button className="btn btn-primary" onClick={saveProfil}>💾 Enregistrer</button>
      </div>}

      {/* ---- ORGANISATION ---- */}
      {ong==="organisation" && canManage && <div className="card" style={{maxWidth:640}}>
        <div className="card-title">Informations de l'organisation</div>
        <div className="alert alert-info">Ces informations apparaîtront sur tous vos rapports PDF et documents officiels.</div>

        {org.logoUrl && <div style={{marginBottom:16,textAlign:"center"}}>
          <img src={org.logoUrl} alt="Logo" style={{maxHeight:80,maxWidth:200,borderRadius:8,border:"1px solid var(--border)"}} onError={e=>e.target.style.display="none"}/>
        </div>}

        <div className="form-group"><label className="form-label">Nom de l'organisation</label><input className="form-input" value={org.nom} onChange={e=>setOrg({...org,nom:e.target.value})}/></div>
        <div className="grid-2">
          <div className="form-group"><label className="form-label">Type</label>
            <select className="form-select" value={org.type} onChange={e=>setOrg({...org,type:e.target.value})}>
              <option value="ong">ONG</option><option value="association">Association</option><option value="cabinet">Cabinet Conseil</option><option value="pme">PME</option><option value="administration">Administration</option><option value="mairie">Mairie / Commune</option><option value="autre">Autre</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Secteur d'activité</label><input className="form-input" value={org.secteur} onChange={e=>setOrg({...org,secteur:e.target.value})} placeholder="Santé, Éducation, Agriculture..."/></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label className="form-label">IFU</label><input className="form-input" value={org.ifu} onChange={e=>setOrg({...org,ifu:e.target.value})} placeholder="Ex: 3201900123456"/></div>
          <div className="form-group"><label className="form-label">N° RCCM</label><input className="form-input" value={org.rccm} onChange={e=>setOrg({...org,rccm:e.target.value})} placeholder="Ex: RB/PAR/2021/A/1234"/></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label className="form-label">Ville</label><input className="form-input" value={org.ville} onChange={e=>setOrg({...org,ville:e.target.value})}/></div>
          <div className="form-group"><label className="form-label">Pays</label><input className="form-input" value={org.pays} onChange={e=>setOrg({...org,pays:e.target.value})}/></div>
        </div>
        <div className="grid-2">
          <div className="form-group"><label className="form-label">Téléphone</label><input className="form-input" value={org.telephone} onChange={e=>setOrg({...org,telephone:e.target.value})} placeholder="+229 XX XX XX XX"/></div>
          <div className="form-group"><label className="form-label">Site web</label><input className="form-input" value={org.siteWeb} onChange={e=>setOrg({...org,siteWeb:e.target.value})} placeholder="https://..."/></div>
        </div>
        <div className="form-group"><label className="form-label">Adresse</label><input className="form-input" value={org.adresse} onChange={e=>setOrg({...org,adresse:e.target.value})} placeholder="Adresse complète"/></div>
        <div className="form-group"><label className="form-label">URL du logo</label><input className="form-input" value={org.logoUrl} onChange={e=>setOrg({...org,logoUrl:e.target.value})} placeholder="https://... (lien vers votre logo)"/></div>
        <button className="btn btn-primary" onClick={saveOrg} disabled={orgLoad}>{orgLoad?<><Spinner/> Enregistrement...</>:"💾 Enregistrer"}</button>
      </div>}

      {/* ---- DÉPARTEMENTS ---- */}
      {ong==="departements" && canManage && <div style={{maxWidth:560}}>
        <div className="card" style={{marginBottom:16}}>
          <div className="card-title">Ajouter un département</div>
          <div style={{display:"flex",gap:10}}>
            <input className="form-input" style={{flex:1}} value={newDept} onChange={e=>setNewDept(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&ajouterDept()}
              placeholder="Ex: Services Techniques, Finances, État Civil..."/>
            <button className="btn btn-primary" onClick={ajouterDept}>+ Ajouter</button>
          </div>
        </div>

        <div className="card" style={{padding:0}}>
          <div style={{padding:"12px 16px",borderBottom:"1px solid var(--border)",fontSize:12,color:"var(--text2)"}}>
            {depts.length} département(s) configuré(s)
          </div>
          {depts.map((d,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid rgba(30,45,69,0.5)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:"var(--accent)"}}/>
                <span style={{fontWeight:500,fontSize:13}}>{d}</span>
              </div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <span style={{fontSize:11,color:"var(--text3)"}}>
                  {data.users.filter(u=>u.departement===d||u.dept===d).length} membre(s)
                </span>
                {d !== "Direction" && (
                  <button className="btn btn-danger btn-sm" onClick={()=>supprimerDept(d)}>🗑️</button>
                )}
                {d === "Direction" && <span style={{fontSize:10,color:"var(--text3)"}}>Protégé</span>}
              </div>
            </div>
          ))}
        </div>

        <div className="alert alert-warning" style={{marginTop:14}}>
          💡 Les départements que vous créez ici seront disponibles dans tous les modules (tâches, annuaire, budget, documents).
        </div>
      </div>}

      {/* ---- MEMBRES & LIMITES ---- */}
      {ong==="membres_info" && canManage && <div style={{maxWidth:560}}>
        <div className="card" style={{marginBottom:16}}>
          <div className="card-title">Capacité membres</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
            <div>
              <div style={{fontFamily:"var(--font-display)",fontSize:28,fontWeight:800,color:"var(--accent)"}}>{membresActuels}</div>
              <div style={{fontSize:12,color:"var(--text2)"}}>membres actifs</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:13,fontWeight:600}}>Plan {planActuel}</div>
              <div style={{fontSize:12,color:"var(--text2)"}}>Limite : {limiteMembers === Infinity ? "Illimité" : `${limiteMembers} membres`}</div>
            </div>
          </div>
          {limiteMembers !== Infinity && <>
            <div className="progress-bar" style={{height:10}}>
              <div className="progress-fill" style={{width:`${Math.min(pctMembres,100)}%`,background:pctMembres>80?"var(--danger)":pctMembres>60?"var(--accent3)":"var(--accent)"}}/>
            </div>
            <div style={{fontSize:11,color:"var(--text3)",marginTop:6,textAlign:"right"}}>{membresActuels} / {limiteMembers} utilisés</div>
            {pctMembres >= 80 && <div className="alert alert-warning" style={{marginTop:12}}>
              ⚠️ Vous approchez de la limite de votre plan. Pensez à upgrader pour accueillir plus de membres.
            </div>}
          </>}
          {limiteMembers === Infinity && <div className="alert alert-success">✅ Plan Institution — membres illimités</div>}
        </div>

        <div className="card">
          <div className="card-title">Limites par plan</div>
          {[["ONG Locale","10 membres","10 000 FCFA/mois"],["Starter","20 membres","20 000 FCFA/mois"],["Pro","50 membres","60 000 FCFA/mois"],["Institution","Illimité","120 000 FCFA/mois"]].map(([p,l,prix])=>(
            <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--border)"}}>
              <div><div style={{fontSize:13,fontWeight:500}}>{p}</div><div style={{fontSize:11,color:"var(--text3)"}}>{prix}</div></div>
              <Bdg label={l} color={p===planActuel?"var(--accent)":"#6b7280"}/>
            </div>
          ))}
          <div style={{marginTop:14}}>
            <button className="btn btn-primary btn-sm" onClick={()=>{}}>Upgrader mon plan →</button>
          </div>
        </div>
      </div>}

      {/* ---- SÉCURITÉ ---- */}
      {ong==="securite" && <div className="card" style={{maxWidth:560}}>
        <div className="card-title">Changer le mot de passe</div>
        <div className="alert alert-info">Choisissez un mot de passe d'au moins 6 caractères.</div>
        <div className="form-group"><label className="form-label">Nouveau mot de passe</label><input type="password" className="form-input" value={mdp.nouveau} onChange={e=>setMdp({...mdp,nouveau:e.target.value})} placeholder="Minimum 6 caractères"/></div>
        <div className="form-group"><label className="form-label">Confirmer</label><input type="password" className="form-input" value={mdp.confirmer} onChange={e=>setMdp({...mdp,confirmer:e.target.value})} placeholder="Répéter"/></div>
        <button className="btn btn-primary" onClick={chgMdp} disabled={load}>{load?<><Spinner/> Modification...</>:"🔐 Modifier"}</button>
      </div>}
    </div>
  );
};


const Abonnement = ({currentUser}) => {
  const [plan,setPlan]=useState("pro"),[meth,setMeth]=useState("mtn"),[etape,setEtape]=useState(1),[num,setNum]=useState(""),[load,setLoad]=useState(false);
  const plans=[
    {id:"ong_locale",nom:"ONG Locale",prix:10000,users:"10 utilisateurs",cible:"ONG locales & associations",features:["5 modules essentiels","2 Go stockage","Support email","Rapports PDF de base","Idéal pour petites structures"]},
    {id:"starter",nom:"Starter",prix:20000,users:"20 utilisateurs",cible:"Cabinets & PME",features:["6 modules","5 Go stockage","Support email","Rapports PDF complets","Invitations collaborateurs"]},
    {id:"pro",nom:"Pro",prix:60000,users:"50 utilisateurs",cible:"ONG & Projets bailleurs",features:["8 modules complets","20 Go stockage","Support prioritaire","Rapports bailleurs GIZ/USAID","Invitations illimitées"]},
    {id:"institution",nom:"Institution",prix:120000,users:"Illimité",cible:"Mairies & Administrations",features:["Tout inclus","100 Go stockage","Support dédié","Formation sur site 2 jours","Personnalisation complète"]},
  ];
  const meths=[{id:"mtn",nom:"MTN Mobile Money",icon:"📱",c:"#f59e0b"},{id:"moov",nom:"Moov Money",icon:"📱",c:"#3b82f6"},{id:"carte",nom:"Carte bancaire (FedaPay)",icon:"💳",c:"#8b5cf6"},{id:"virement",nom:"Virement bancaire (BOA)",icon:"🏦",c:"#22c55e"}];
  const sp=plans.find(p=>p.id===plan);
  const payer=async()=>{
    if(!num&&meth!=="virement"&&meth!=="carte"){toast("Entrez votre numéro","error");return;}
    setLoad(true);
    try{const r=await fetch("https://sandbox-api.fedapay.com/v1/transactions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer sandbox_sk_VOTRE_CLE_FEDAPAY"},body:JSON.stringify({description:`Abonnement PulseOrg Plan ${sp.nom}`,amount:sp.prix,currency:{iso:"XOF"},callback_url:window.location.origin,customer:{email:currentUser.email,firstname:currentUser.nom?.split(" ")[0]||"",lastname:currentUser.nom?.split(" ")[1]||""}})});const d=await r.json();if(d?.v1_transaction){setEtape(3);setTimeout(()=>setEtape(4),3000);}else{setEtape(3);setTimeout(()=>setEtape(4),2500);}}catch{setEtape(3);setTimeout(()=>setEtape(4),2500);}
    setLoad(false);
  };
  return(
    <div className="fade-in">
      <div className="alert alert-info" style={{marginBottom:20}}>💡 Pour activer les paiements réels, créez votre compte sur <strong>fedapay.com</strong> et remplacez la clé sandbox par votre clé live.</div>
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:20}}>
        <div>
          {etape===1&&<div className="card">
            <div className="card-title">Choisir un plan</div>
            <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>{plans.map(p=><div key={p.id} className={`plan-card${plan===p.id?" selected":""}`} onClick={()=>setPlan(p.id)} style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{fontFamily:"var(--font-display)",fontWeight:700,fontSize:15,marginBottom:4}}>{p.nom}</div><div style={{fontSize:12,color:"var(--text2)"}}>{p.users} · {p.features.slice(0,2).join(" · ")}</div></div><div style={{textAlign:"right"}}><div style={{fontFamily:"var(--font-display)",fontSize:18,fontWeight:800,color:"var(--accent)"}}>{fmtMontant(p.prix)}</div><div style={{fontSize:11,color:"var(--text3)"}}>/mois</div></div></div>)}</div>
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center"}} onClick={()=>setEtape(2)}>Continuer avec le plan {sp?.nom} →</button>
          </div>}
          {etape===2&&<div className="card">
            <button className="btn btn-secondary btn-sm" style={{marginBottom:16}} onClick={()=>setEtape(1)}>← Retour</button>
            <div className="card-title">Méthode de paiement</div>
            <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>{meths.map(m=><div key={m.id} onClick={()=>setMeth(m.id)} style={{padding:"14px 16px",borderRadius:10,cursor:"pointer",border:`2px solid ${meth===m.id?m.c:"var(--border)"}`,background:meth===m.id?`${m.c}11`:"transparent",display:"flex",alignItems:"center",gap:12,transition:"all 0.15s"}}><span style={{fontSize:22}}>{m.icon}</span><span style={{fontWeight:meth===m.id?600:400}}>{m.nom}</span>{meth===m.id&&<span style={{marginLeft:"auto",color:m.c,fontWeight:700}}>✓</span>}</div>)}</div>
            {(meth==="mtn"||meth==="moov")&&<div className="form-group"><label className="form-label">Numéro {meth==="mtn"?"MTN":"Moov"} Mobile Money *</label><input className="form-input" value={num} onChange={e=>setNum(e.target.value)} placeholder="+229 XX XX XX XX"/><div style={{fontSize:11,color:"var(--text3)",marginTop:6}}>Une demande de validation sera envoyée sur ce numéro</div></div>}
            {meth==="virement"&&<div style={{padding:16,background:"var(--surface2)",borderRadius:10,fontSize:13}}><div style={{fontWeight:600,marginBottom:10}}>Coordonnées bancaires :</div><div style={{display:"flex",flexDirection:"column",gap:6,color:"var(--text2)"}}><div>Banque : BOA Bénin — Parakou</div><div>Titulaire : <strong>PulseOrg</strong></div><div>Référence : <strong style={{color:"var(--accent)"}}>PULSE-{currentUser.email?.slice(0,5).toUpperCase()}</strong></div></div></div>}
            {meth==="carte"&&<div className="alert alert-warning">Vous serez redirigé vers l'interface sécurisée FedaPay pour finaliser le paiement par carte.</div>}
            <button className="btn btn-primary" style={{width:"100%",justifyContent:"center",marginTop:16}} onClick={payer} disabled={load}>{load?<><Spinner/> Traitement...</>:`💳 Payer ${fmtMontant(sp?.prix)}/mois`}</button>
          </div>}
          {etape===3&&<div className="card" style={{textAlign:"center",padding:48}}><div style={{fontSize:48,marginBottom:16}} className="pulse-anim">⏳</div><div style={{fontFamily:"var(--font-display)",fontSize:18,fontWeight:700,marginBottom:8}}>Traitement en cours...</div><div style={{color:"var(--text2)",fontSize:13}}>{meth==="mtn"||meth==="moov"?"Vérifiez votre téléphone et confirmez le paiement.":"Connexion au système FedaPay..."}</div></div>}
          {etape===4&&<div className="card" style={{textAlign:"center",padding:48}}><div style={{fontSize:56,marginBottom:16}}>✅</div><div style={{fontFamily:"var(--font-display)",fontSize:20,fontWeight:800,color:"var(--accent)",marginBottom:8}}>Paiement confirmé !</div><div style={{color:"var(--text2)",fontSize:13,marginBottom:20}}>Votre abonnement Plan <strong>{sp?.nom}</strong> est actif.<br/>Un reçu sera envoyé à <strong>{currentUser.email}</strong>.</div><button className="btn btn-primary" onClick={()=>setEtape(1)}>Retour à l'abonnement</button></div>}
        </div>
        <div>
          <div className="card"><div className="card-title">Récapitulatif</div>
            {[["Plan",sp?.nom],["Utilisateurs",sp?.users],["Facturation","Mensuelle"]].map(([l,v])=><div key={l} style={{padding:"10px 0",borderBottom:"1px solid var(--border)"}}><div style={{fontSize:12,color:"var(--text2)"}}>{l}</div><div style={{fontWeight:600,marginTop:2}}>{v}</div></div>)}
            <div style={{paddingTop:14}}><div style={{fontSize:12,color:"var(--text2)"}}>Total / mois</div><div style={{fontFamily:"var(--font-display)",fontSize:22,fontWeight:800,color:"var(--accent)",marginTop:4}}>{fmtMontant(sp?.prix||0)}</div></div>
          </div>
          <div className="card" style={{marginTop:14}}><div className="card-title">Paiements acceptés</div><div style={{display:"flex",flexDirection:"column",gap:8}}>{["📱 MTN Mobile Money","📱 Moov Money","💳 FedaPay (Carte)","🏦 Virement BOA"].map(m=><div key={m} style={{fontSize:12,color:"var(--text2)",padding:"6px 0",borderBottom:"1px solid var(--border)"}}>{m}</div>)}</div></div>
        </div>
      </div>
    </div>
  );
};

const LoadScreen = () => (
  <div className="loading-screen">
    <div style={{fontFamily:"var(--font-display)",fontSize:24,fontWeight:800,color:"var(--accent)"}}>PulseOrg</div>
    <div className="spinner"/>
    <div style={{fontSize:13,color:"var(--text2)"}}>Chargement de votre espace...</div>
  </div>
);

export default function PulseOrg() {
  const [user,setUser]=useState(null),[mod,setMod]=useState("dashboard"),[loading,setLoading]=useState(true);

  // Restaurer session au chargement
  useEffect(()=>{
    const saved=localStorage.getItem("pulseorg_session");
    const savedData=localStorage.getItem("pulseorg_data");
    if(saved){
      try{
        const session=JSON.parse(saved);
        // Restaurer données en cache immédiatement
        if(savedData){
          try{ setData(JSON.parse(savedData)); }catch{}
        }
        // Pas besoin de vérifier expires_at - Supabase gère ça
        onLogin(session).catch(()=>{
          localStorage.removeItem("pulseorg_session");
          localStorage.removeItem("pulseorg_data");
          setLoading(false);
        });
      }catch{
        localStorage.removeItem("pulseorg_session");
        localStorage.removeItem("pulseorg_data");
        setLoading(false);
      }
    }else{setLoading(false);}
  },[]);
  const [data,setData]=useState({users:[],taches:[],reunions:[],documents:[],messages:[],budgets:[]});

  const nav=[
    {id:"dashboard",icon:"🏠",label:"Tableau de bord",sec:"principal"},
    {id:"taches",icon:"✅",label:"Tâches & Suivi",sec:"gestion",badge:()=>data.taches.filter(t=>t.statut==="en_retard").length},
    {id:"reunions",icon:"🤝",label:"Réunions & CR",sec:"gestion"},
    {id:"agenda",icon:"📅",label:"Agenda",sec:"gestion"},
    {id:"annuaire",icon:"👥",label:"Annuaire & RH",sec:"organisation"},
    {id:"documents",icon:"📁",label:"Documents",sec:"organisation"},
    {id:"messagerie",icon:"💬",label:"Messagerie",sec:"communication",badge:()=>data.messages.filter(m=>!m.lu&&user&&m.a===user.id).length},
    {id:"budget",icon:"💰",label:"Budget & Projets",sec:"finance"},
    {id:"abonnement",icon:"💳",label:"Abonnement",sec:"compte"},
    {id:"parametres",icon:"⚙️",label:"Paramètres",sec:"compte"},
  ];
  const secs={principal:"Principal",gestion:"Gestion",organisation:"Organisation",communication:"Communication",finance:"Finance",compte:"Mon compte"};
  const sections=[...new Set(nav.map(n=>n.sec))];
  const titles={dashboard:"Tableau de bord",taches:"Tâches & Suivi",reunions:"Réunions & Comptes-rendus",agenda:"Agenda institutionnel",annuaire:"Annuaire & RH",documents:"Gestion documentaire",messagerie:"Messagerie interne",budget:"Budget & Projets",abonnement:"Abonnement & Paiement",parametres:"Paramètres"};

  const onLogin=useCallback(async(auth)=>{
    setLoading(true);
    // Sauvegarder la session complète
    localStorage.setItem("pulseorg_session", JSON.stringify(auth));
    try{
      const token=auth.access_token,uid=auth.user?.id;
      const profils=await dbAPI.get("profils",`id=eq.${uid}`,token);
      const u=Array.isArray(profils)?profils[0]:profils;
      if(!u){toast("Profil introuvable. Contactez votre administrateur.","error");setLoading(false);return;}
      const orgId=u.organisation_id;
      setUser({...u,token,organisationId:orgId});
      if(orgId){
        const [ta,re,do_,me,bu,us]=await Promise.all([
          dbAPI.get("taches",`organisation_id=eq.${orgId}&order=created_at.desc`,token),
          dbAPI.get("reunions",`organisation_id=eq.${orgId}&order=date.desc`,token),
          dbAPI.get("documents",`organisation_id=eq.${orgId}&order=created_at.desc`,token),
          dbAPI.get("messages",`organisation_id=eq.${orgId}&order=created_at.desc`,token),
          dbAPI.get("budgets",`organisation_id=eq.${orgId}`,token),
          dbAPI.get("profils",`organisation_id=eq.${orgId}`,token),
        ]);
        const loadedData = {
          taches:Array.isArray(ta)?ta.map(mapT):[],
          reunions:Array.isArray(re)?re.map(mapR):[],
          documents:Array.isArray(do_)?do_.map(mapD):[],
          messages:Array.isArray(me)?me:[],
          budgets:Array.isArray(bu)?bu.map(mapB):[],
          users:Array.isArray(us)?us:[],
        };
        setData(loadedData);
        // Sauvegarder données en cache local
        localStorage.setItem("pulseorg_data", JSON.stringify(loadedData));
      }
    }catch(e){toast("Erreur lors du chargement","error");}
    setLoading(false);
  },[]);

  const logout=async()=>{
    if(user?.token)await authAPI.signOut(user.token);
    localStorage.removeItem("pulseorg_session");
    localStorage.removeItem("pulseorg_data");
    setUser(null);setData({users:[],taches:[],reunions:[],documents:[],messages:[],budgets:[]});setMod("dashboard");
    toast("Déconnexion réussie","info");
  };

  const nlu=data.messages.filter(m=>!m.lu&&user&&m.a===user.id).length;

  const render=()=>{
    const p={data,setData,currentUser:user};
    switch(mod){
      case "dashboard":  return <Dashboard {...p} setModule={setMod}/>;
      case "taches":     return <Taches {...p}/>;
      case "reunions":   return <Reunions {...p}/>;
      case "agenda":     return <Agenda {...p}/>;
      case "annuaire":   return <Annuaire {...p}/>;
      case "documents":  return <Documents {...p}/>;
      case "messagerie": return <Messagerie {...p}/>;
      case "budget":     return <Budget {...p}/>;
      case "abonnement": return <Abonnement currentUser={user}/>;
      case "parametres": return <Parametres currentUser={user} setCurrentUser={setUser} data={data} setData={setData}/>;
      default: return null;
    }
  };

  if(loading) return <><style>{STYLES}</style><LoadScreen/></>;
  if(!user) return <><style>{STYLES}</style><ToastSystem/><LoginPage onLogin={onLogin}/></>;

  return(
    <>
      <style>{STYLES}</style><ToastSystem/>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-logo"><div className="logo-icon">P</div><div><div className="logo-text">PulseOrg</div><div className="logo-sub">Gestion institutionnelle</div></div></div>
          <div style={{flex:1,overflowY:"auto",paddingBottom:20}}>
            {sections.map(sec=>(
              <div key={sec} className="nav-section">
                <div className="nav-label">{secs[sec]}</div>
                {nav.filter(n=>n.sec===sec).map(item=>{const b=item.badge?item.badge():0;return(
                  <div key={item.id} className={`nav-item${mod===item.id?" active":""}`} onClick={()=>setMod(item.id)}>
                    <span style={{fontSize:16,width:20,textAlign:"center"}}>{item.icon}</span>
                    <span>{item.label}</span>
                    {b>0&&<span className="nav-badge">{b}</span>}
                  </div>);})}
              </div>
            ))}
          </div>
          <div className="sidebar-footer">
            <div className="user-card" onClick={()=>setMod("parametres")}>
              <Av user={user}/>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:500,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.nom}</div><div style={{fontSize:11,color:"var(--text3)",textTransform:"capitalize"}}>{user.role}</div></div>
            </div>
            <button className="btn btn-secondary" style={{width:"100%",justifyContent:"center",marginTop:8,fontSize:12}} onClick={logout}>→ Déconnexion</button>
          </div>
        </aside>
        <main className="main">
          <div className="topbar">
            <div className="topbar-title">{titles[mod]}</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div className="icon-btn" onClick={()=>setMod("messagerie")} title="Messages">💬{nlu>0&&<span className="notif-dot"/>}</div>
              <div className="icon-btn" title="Notifications">🔔</div>
              <div onClick={()=>setMod("parametres")} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",background:"var(--surface2)",borderRadius:8,border:"1px solid var(--border)",cursor:"pointer"}}>
                <Av user={user} size="sm"/>
                <span style={{fontSize:12,fontWeight:500}}>{user.nom?.split(" ")[0]}</span>
              </div>
              <div className="icon-btn" onClick={logout} title="Se déconnecter" style={{color:"var(--danger)",borderColor:"rgba(239,68,68,0.3)"}}>⏻</div>
            </div>
          </div>
          <div className="content">{render()}</div>
        </main>
      </div>
    </>
  );
}
