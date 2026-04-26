import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, onSnapshot } from "firebase/firestore";

// ── Firebase ──
const firebaseConfig = {
  apiKey: "AIzaSyDX9K-axGOAewQFIcuHcJetbuFc4_iMvoo",
  authDomain: "my-travel-app-236e5.firebaseapp.com",
  projectId: "my-travel-app-236e5",
  storageBucket: "my-travel-app-236e5.firebasestorage.app",
  messagingSenderId: "594950528698",
  appId: "1:594950528698:web:bd2d3be86eb9dfd8876c83",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ── Theme ──
const ThemeCtx = React.createContext({ dark: true, toggle: function() {} });
function useTheme() { return React.useContext(ThemeCtx); }

function theme(dark) {
  return {
    bg:    dark ? "#060b14" : "#f0f4f8",
    bg2:   dark ? "#0d1829" : "#ffffff",
    bg3:   dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
    border:dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)",
    text:  dark ? "#f8fafc" : "#0f172a",
    text2: dark ? "#94a3b8" : "#475569",
    text3: dark ? "#3d5166" : "#94a3b8",
    nav:   dark ? "rgba(6,11,20,0.95)" : "rgba(240,244,248,0.97)",
    input: dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
    inputB:dark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.12)",
  };
}

// ── Helpers ──
const COLORS = ["#38bdf8","#a78bfa","#f472b6","#34d399","#fb923c","#facc15","#60a5fa","#f87171"];
function gc(i) { return COLORS[i % COLORS.length]; }

function genCode() {
  var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  var code = "";
  for (var i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function fmtDate(val) {
  if (!val) return "";
  return new Date(val + "T00:00:00").toLocaleDateString("es-ES", { day:"numeric", month:"short", year:"numeric" });
}

function fmtDateTime(val) {
  if (!val) return "";
  return new Date(val).toLocaleString("es-ES", { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
}

function openLink(url) {
  if (!url) return;
  var full = url.startsWith("http") ? url : "https://" + url;
  window.open(full, "_blank", "noopener,noreferrer");
}

function downloadFile(dataUrl, filename) {
  var a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename || "archivo";
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function calcDeudas(expenses, members) {
  var balance = {};
  members.forEach(function(m) { balance[m] = 0; });
  expenses.forEach(function(exp) {
    var valid = (exp.divididoEntre || []).filter(function(m) { return members.includes(m); });
    if (!valid.length) return;
    var share = exp.total / valid.length;
    if (members.includes(exp.pagadoPor)) balance[exp.pagadoPor] += exp.total;
    valid.forEach(function(m) { balance[m] -= share; });
  });
  var deudores  = members.filter(function(m) { return balance[m] < -0.01; }).map(function(m) { return { name:m, amount:balance[m] }; });
  var acreedores = members.filter(function(m) { return balance[m] >  0.01; }).map(function(m) { return { name:m, amount:balance[m] }; });
  var tx = [];
  var i = 0, j = 0;
  while (i < deudores.length && j < acreedores.length) {
    var d = Math.min(-deudores[i].amount, acreedores[j].amount);
    tx.push({ de: deudores[i].name, a: acreedores[j].name, monto: d });
    deudores[i].amount += d;
    acreedores[j].amount -= d;
    if (Math.abs(deudores[i].amount) < 0.01) i++;
    if (Math.abs(acreedores[j].amount) < 0.01) j++;
  }
  return { balance: balance, tx: tx };
}

function emptyTrip(code) {
  return {
    tripCode: code,
    tripName: "Nuevo viaje ✈️",
    dates: "Fechas por definir",
    members: [],
    currency: "$",
    destino: "",
    items: { vuelos:[], alojamiento:[], auto:[], excursiones:[], entradas:[], documentos:[] },
    expenses: [],
    alertas: [],
    checklist: [],
    createdAt: Date.now(),
  };
}

// ── Section config ──
var SECTIONS = [
  { id:"vuelos",      icon:"✈️",  label:"Vuelos",      color:"#38bdf8" },
  { id:"alojamiento", icon:"🏨",  label:"Alojamiento", color:"#a78bfa" },
  { id:"auto",        icon:"🚗",  label:"Auto",        color:"#fb923c" },
  { id:"excursiones", icon:"🎡",  label:"Excursiones", color:"#34d399" },
  { id:"entradas",    icon:"🎟️", label:"Entradas",    color:"#f472b6" },
  { id:"documentos",  icon:"📋",  label:"Documentos",  color:"#facc15" },
  { id:"gastos",      icon:"💰",  label:"Gastos",      color:"#4ade80" },
];

var SECTION_FIELDS = {
  vuelos: [
    { label:"Aerolínea *", key:"aerolinea", placeholder:"Ej: Iberia" },
    { label:"Número de vuelo", key:"nroVuelo", placeholder:"Ej: IB6821" },
    { label:"Ruta", key:"ruta", placeholder:"Ej: Madrid → Cancún" },
    { label:"Fecha y hora de salida", key:"fechaSalida", type:"datetime-local" },
    { label:"Fecha y hora de llegada", key:"fechaLlegada", type:"datetime-local" },
    { label:"Nro de reserva", key:"nroReserva", placeholder:"Ej: ABC123" },
    { label:"Precio total", key:"precio", type:"number", placeholder:"0" },
  ],
  alojamiento: [
    { label:"Nombre *", key:"nombre", placeholder:"Ej: Hotel Xcaret Arte" },
    { label:"Tipo", key:"tipo", placeholder:"Hotel / Airbnb / Hostel" },
    { label:"Dirección", key:"direccion", placeholder:"Ej: Calle 5, Playa del Carmen" },
    { label:"Check-in", key:"checkIn", type:"datetime-local" },
    { label:"Check-out", key:"checkOut", type:"datetime-local" },
    { label:"Nro de reserva", key:"nroReserva", placeholder:"Ej: HB-12345" },
    { label:"Precio total", key:"precio", type:"number", placeholder:"0" },
  ],
  auto: [
    { label:"Empresa *", key:"empresa", placeholder:"Ej: Hertz" },
    { label:"Tipo de auto", key:"tipoAuto", placeholder:"Ej: SUV 7 plazas" },
    { label:"Lugar de recogida", key:"lugarRecogida", placeholder:"Ej: Aeropuerto" },
    { label:"Fecha de recogida", key:"fechaRecogida", type:"datetime-local" },
    { label:"Fecha de devolución", key:"fechaDevolucion", type:"datetime-local" },
    { label:"Nro de reserva", key:"nroReserva", placeholder:"Ej: HR-98765" },
    { label:"Precio total", key:"precio", type:"number", placeholder:"0" },
  ],
  excursiones: [
    { label:"Nombre *", key:"nombre", placeholder:"Ej: Tour Chichén Itzá" },
    { label:"Fecha", key:"fecha", type:"date" },
    { label:"Hora de encuentro", key:"horaEncuentro", placeholder:"Ej: 08:00 AM" },
    { label:"Punto de encuentro", key:"puntoEncuentro", placeholder:"Ej: Lobby del hotel" },
    { label:"Duración", key:"duracion", placeholder:"Ej: 8 horas" },
    { label:"Incluye", key:"incluye", placeholder:"Ej: Transporte, comida, guía" },
    { label:"Precio por persona", key:"precio", type:"number", placeholder:"0" },
  ],
  entradas: [
    { label:"Lugar / Evento *", key:"lugar", placeholder:"Ej: Parque Xcaret" },
    { label:"Fecha", key:"fecha", type:"date" },
    { label:"Hora de entrada", key:"horaEntrada", placeholder:"Ej: 09:00 AM" },
    { label:"Cantidad de entradas", key:"cantidad", type:"number", placeholder:"0" },
    { label:"Precio por entrada", key:"precioPorEntrada", type:"number", placeholder:"0" },
    { label:"Precio total", key:"precio", type:"number", placeholder:"0" },
  ],
  documentos: [
    { label:"Tipo *", key:"tipoDoc", placeholder:"Ej: Pasaporte, Seguro, Visa" },
    { label:"Titular", key:"titular", placeholder:"Ej: Rodrigo Valles" },
    { label:"Número", key:"nroDoc", placeholder:"Ej: AAB123456" },
    { label:"Vencimiento", key:"vencimiento", type:"date" },
    { label:"Notas", key:"notas", placeholder:"Ej: Cobertura médica $50.000" },
  ],
};

var ESTADOS = {
  pendiente:  { bg:"rgba(250,204,21,0.1)",  color:"#facc15", label:"⏳ Pendiente" },
  confirmado: { bg:"rgba(74,222,128,0.1)",  color:"#4ade80", label:"✓ Confirmado" },
  ok:         { bg:"rgba(96,165,250,0.1)",  color:"#60a5fa", label:"✓ OK" },
};

function getTitle(section, item) {
  if (section === "vuelos")      return item.ruta || item.aerolinea || "Vuelo";
  if (section === "alojamiento") return item.nombre || "Alojamiento";
  if (section === "auto")        return item.empresa ? (item.empresa + (item.tipoAuto ? " · " + item.tipoAuto : "")) : "Auto";
  if (section === "excursiones") return item.nombre || "Excursión";
  if (section === "entradas")    return item.lugar || "Entrada";
  if (section === "documentos")  return item.tipoDoc ? (item.tipoDoc + (item.titular ? " · " + item.titular : "")) : "Documento";
  return item.titulo || "Item";
}

function getDateLine(section, item) {
  if (section === "vuelos")      return item.fechaSalida ? "Salida: " + fmtDateTime(item.fechaSalida) : "";
  if (section === "alojamiento") return item.checkIn ? fmtDateTime(item.checkIn) + (item.checkOut ? " → " + fmtDateTime(item.checkOut) : "") : "";
  if (section === "auto")        return item.fechaRecogida ? "Recogida: " + fmtDateTime(item.fechaRecogida) : "";
  if (section === "excursiones") return item.fecha ? fmtDate(item.fecha) : "";
  if (section === "entradas")    return item.fecha ? fmtDate(item.fecha) : "";
  if (section === "documentos")  return item.vencimiento ? "Vence: " + fmtDate(item.vencimiento) : "";
  return "";
}

function getSummary(section, item) {
  if (section === "vuelos")      return [item.aerolinea, item.nroVuelo].filter(Boolean).join(" · ");
  if (section === "alojamiento") return [item.tipo, item.nroReserva ? "Res: " + item.nroReserva : ""].filter(Boolean).join(" · ");
  if (section === "auto")        return item.lugarRecogida || "";
  if (section === "excursiones") return [item.horaEncuentro, item.puntoEncuentro].filter(Boolean).join(" · ");
  if (section === "entradas")    return item.cantidad ? item.cantidad + " entradas" : "";
  if (section === "documentos")  return item.nroDoc || "";
  return "";
}

// ── Shared UI ──
var inputSt = {
  display:"block", width:"100%", marginBottom:10,
  background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.10)",
  borderRadius:14, padding:"12px 16px", color:"#f1f5f9",
  fontSize:14, outline:"none", boxSizing:"border-box",
  fontFamily:"'Outfit',sans-serif", colorScheme:"dark",
};

function Lbl({ children }) {
  return React.createElement("p", { style:{ color:"#64748b", fontSize:10, margin:"0 0 6px", textTransform:"uppercase", letterSpacing:1.5, fontWeight:600 } }, children);
}

function Avt({ name, color, size }) {
  size = size || 32;
  return React.createElement("div", {
    style:{ width:size, height:size, borderRadius:"50%", background:color+"18", border:"1.5px solid "+color+"44",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontSize:size*0.38, fontWeight:800, color:color, flexShrink:0, fontFamily:"'Outfit',sans-serif" }
  }, name[0].toUpperCase());
}

function Sheet({ onClose, children }) {
  return React.createElement("div", {
    style:{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", zIndex:100, display:"flex", alignItems:"flex-end" },
    onClick: onClose
  },
    React.createElement("div", {
      style:{ background:"#0d1829", width:"100%", maxWidth:430, margin:"0 auto",
        borderRadius:"28px 28px 0 0", padding:"28px 24px 80px",
        maxHeight:"85vh", overflowY:"scroll", WebkitOverflowScrolling:"touch",
        border:"1px solid rgba(255,255,255,0.08)", borderBottom:"none" },
      onClick: function(e) { e.stopPropagation(); }
    },
      React.createElement("div", { style:{ width:40, height:4, background:"rgba(255,255,255,0.15)", borderRadius:99, margin:"0 auto 22px" } }),
      children
    )
  );
}

function STitle({ children, onClose }) {
  return React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 } },
    React.createElement("h3", { style:{ color:"#f8fafc", margin:0, fontSize:17, fontWeight:700, letterSpacing:-0.3, fontFamily:"'Outfit',sans-serif" } }, children),
    onClose && React.createElement("button", {
      onClick: onClose,
      style:{ background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:99,
        width:32, height:32, color:"#94a3b8", fontSize:18, cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }
    }, "×")
  );
}

function SaveBtn({ onClick, color, textColor, children }) {
  color = color || "#38bdf8";
  textColor = textColor || "#fff";
  return React.createElement("button", {
    onClick: onClick,
    style:{ width:"100%", padding:"14px", background:"linear-gradient(135deg,"+color+",#818cf8)",
      border:"none", borderRadius:16, color:textColor, fontWeight:700, fontSize:15,
      cursor:"pointer", marginTop:8, boxShadow:"0 6px 24px "+color+"44",
      letterSpacing:0.3, fontFamily:"'Outfit',sans-serif" }
  }, children);
}

function CancelBtn({ onClick }) {
  return React.createElement("button", {
    onClick: onClick,
    style:{ flex:1, padding:"13px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
      borderRadius:14, color:"#94a3b8", fontSize:14, cursor:"pointer", fontWeight:600 }
  }, "Cancelar");
}

function Empty({ icon, text }) {
  return React.createElement("div", { style:{ textAlign:"center", padding:"60px 20px", color:"#475569" } },
    React.createElement("div", { style:{ fontSize:44, marginBottom:14 } }, icon),
    React.createElement("p", { style:{ margin:0, fontSize:14, color:"#64748b" } }, text)
  );
}

// ── Attachment Section ──
function AttachSec({ attachments, onChange, color }) {
  var tab = useState("link");
  var tabVal = tab[0];
  var setTab = tab[1];

  function handleFoto(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function() {
      var next = Object.assign({}, attachments, { foto: r.result, fotoNombre: f.name });
      onChange(next);
    };
    r.readAsDataURL(f);
  }

  function handleArch(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function() {
      var next = Object.assign({}, attachments, { archivo: r.result, archivoNombre: f.name });
      onChange(next);
    };
    r.readAsDataURL(f);
  }

  var tabs = [{ id:"link", label:"🔗 Link" }, { id:"foto", label:"📸 Foto" }, { id:"archivo", label:"📄 Archivo" }];

  return React.createElement("div", null,
    React.createElement(Lbl, null, "Comprobante"),
    React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:12 } },
      tabs.map(function(t) {
        return React.createElement("button", {
          key: t.id,
          onClick: function() { setTab(t.id); },
          style:{ flex:1, padding:"8px 4px", borderRadius:10,
            background: tabVal===t.id ? color+"20" : "rgba(255,255,255,0.04)",
            border: tabVal===t.id ? "1px solid "+color+"55" : "1px solid rgba(255,255,255,0.08)",
            color: tabVal===t.id ? color : "#64748b", fontSize:11, fontWeight:600, cursor:"pointer" }
        }, t.label);
      })
    ),
    tabVal === "link" && React.createElement("input", {
      placeholder: "https://airbnb.com/... booking.com/...",
      value: attachments.link || "",
      onChange: function(e) { onChange(Object.assign({}, attachments, { link: e.target.value })); },
      style: inputSt,
    }),
    tabVal === "foto" && React.createElement("div", null,
      React.createElement("label", {
        style:{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          background:"rgba(255,255,255,0.04)", border:"2px dashed "+(attachments.foto ? color : "rgba(255,255,255,0.12)"),
          borderRadius:12, padding:"18px", cursor:"pointer", marginBottom:8 }
      },
        attachments.foto
          ? React.createElement("img", { src: attachments.foto, alt:"foto", style:{ width:"100%", borderRadius:8, maxHeight:120, objectFit:"cover" } })
          : React.createElement("span", { style:{ fontSize:28 } }, "📸"),
        React.createElement("input", { type:"file", accept:"image/*", onChange:handleFoto, style:{ display:"none" } })
      ),
      attachments.foto && React.createElement("button", {
        onClick: function() { downloadFile(attachments.foto, attachments.fotoNombre || "foto.jpg"); },
        style:{ width:"100%", padding:"9px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#94a3b8", fontSize:12, cursor:"pointer", marginBottom:8 }
      }, "⬇️ Descargar foto")
    ),
    tabVal === "archivo" && React.createElement("div", null,
      React.createElement("label", {
        style:{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          background:"rgba(255,255,255,0.04)", border:"2px dashed "+(attachments.archivo ? color : "rgba(255,255,255,0.12)"),
          borderRadius:12, padding:"22px", cursor:"pointer", marginBottom:8 }
      },
        React.createElement("span", { style:{ fontSize:32 } }, "📄"),
        React.createElement("p", { style:{ color: attachments.archivo ? color : "#64748b", fontSize:13, margin:"8px 0 0" } },
          attachments.archivo ? (attachments.archivoNombre || "Archivo subido") : "Subir PDF u otro archivo"
        ),
        React.createElement("input", { type:"file", accept:".pdf,.doc,.docx,image/*", onChange:handleArch, style:{ display:"none" } })
      ),
      attachments.archivo && React.createElement("button", {
        onClick: function() { downloadFile(attachments.archivo, attachments.archivoNombre || "archivo"); },
        style:{ width:"100%", padding:"9px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#94a3b8", fontSize:12, cursor:"pointer", marginBottom:8 }
      }, "⬇️ Descargar " + (attachments.archivoNombre || "archivo"))
    )
  );
}

// ── Item Form ──
function ItemForm({ initial, section, onSave, onClose }) {
  var sec = SECTIONS.find(function(s) { return s.id === section; });
  var color = sec ? sec.color : "#38bdf8";
  var fields = SECTION_FIELDS[section] || [];

  var initVals = {};
  fields.forEach(function(f) { initVals[f.key] = initial ? (initial[f.key] || "") : ""; });

  var vals = useState(initVals);
  var values = vals[0];
  var setValues = vals[1];

  var estSt = useState(initial ? (initial.estado || "pendiente") : "pendiente");
  var estado = estSt[0];
  var setEstado = estSt[1];

  var attSt = useState(initial ? (initial.attachments || {}) : {});
  var attachments = attSt[0];
  var setAttachments = attSt[1];

  function setVal(key, val) {
    setValues(function(prev) { return Object.assign({}, prev, { [key]: val }); });
  }

  function save() {
    var firstKey = fields[0] && fields[0].key;
    if (firstKey && !values[firstKey]) return;
    var item = Object.assign({}, initial || {}, values, { estado: estado, attachments: attachments, id: (initial && initial.id) || Date.now() });
    onSave(item);
    onClose();
  }

  return React.createElement("div", null,
    fields.map(function(f) {
      return React.createElement("div", { key: f.key },
        React.createElement(Lbl, null, f.label),
        React.createElement("input", {
          type: f.type || "text",
          placeholder: f.placeholder || "",
          value: values[f.key] || "",
          onChange: function(e) { setVal(f.key, e.target.value); },
          style: Object.assign({}, inputSt, (f.type === "date" || f.type === "datetime-local") ? { colorScheme:"dark" } : {}),
        })
      );
    }),
    React.createElement(Lbl, null, "Estado"),
    React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:14 } },
      Object.keys(ESTADOS).map(function(st) {
        var e = ESTADOS[st];
        return React.createElement("button", {
          key: st,
          onClick: function() { setEstado(st); },
          style:{ flex:1, padding:"8px 4px", borderRadius:10, cursor:"pointer",
            background: estado===st ? e.color+"22" : "rgba(255,255,255,0.04)",
            border: estado===st ? "1px solid "+e.color+"66" : "1px solid rgba(255,255,255,0.08)",
            color: estado===st ? e.color : "#64748b", fontSize:11, fontWeight:600 }
        }, e.label);
      })
    ),
    React.createElement(AttachSec, { attachments: attachments, onChange: setAttachments, color: color }),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:8 } },
      React.createElement(CancelBtn, { onClick: onClose }),
      React.createElement("button", {
        onClick: save,
        style:{ flex:2, padding:"13px", background:"linear-gradient(135deg,"+color+",#818cf8)",
          border:"none", borderRadius:14, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" }
      }, "Guardar")
    )
  );
}

// ── Item Modal ──
function ItemModal({ item, section, color, onClose, onSave, onDelete }) {
  var modeSt = useState("view");
  var mode = modeSt[0];
  var setMode = modeSt[1];
  var att = item.attachments || {};
  var sec = SECTIONS.find(function(s) { return s.id === section; });
  var fields = SECTION_FIELDS[section] || [];
  var est = ESTADOS[item.estado] || ESTADOS.pendiente;

  if (mode === "edit") return React.createElement(Sheet, { onClose: onClose },
    React.createElement(STitle, { onClose: onClose }, "✏️ Editar " + (sec ? sec.label : "")),
    React.createElement(ItemForm, { initial: item, section: section, onSave: onSave, onClose: onClose })
  );

  if (mode === "delete") return React.createElement(Sheet, { onClose: onClose },
    React.createElement(STitle, { onClose: onClose }, "🗑️ Eliminar"),
    React.createElement("p", { style:{ color:"#94a3b8", fontSize:14, margin:"0 0 24px" } },
      "¿Eliminar ", React.createElement("strong", { style:{ color:"#f1f5f9" } }, getTitle(section, item)), "?"
    ),
    React.createElement("div", { style:{ display:"flex", gap:10 } },
      React.createElement(CancelBtn, { onClick: onClose }),
      React.createElement("button", {
        onClick: function() { onDelete(); onClose(); },
        style:{ flex:1, padding:"13px", background:"#f87171", border:"none", borderRadius:14, color:"#fff", fontSize:14, cursor:"pointer", fontWeight:700 }
      }, "Eliminar")
    )
  );

  return React.createElement(Sheet, { onClose: onClose },
    React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:10, marginBottom:16 } },
      React.createElement("span", { style:{ fontSize:28 } }, sec ? sec.icon : "📋"),
      React.createElement("div", null,
        React.createElement("h3", { style:{ color:"#f8fafc", margin:0, fontSize:17 } }, getTitle(section, item)),
        React.createElement("span", { style:{ background:est.bg, color:est.color, fontSize:11, fontWeight:600, padding:"2px 8px", borderRadius:99 } }, est.label)
      )
    ),
    React.createElement("div", { style:{ background:"rgba(255,255,255,0.04)", borderRadius:16, padding:"14px", marginBottom:14 } },
      fields.filter(function(f) { return item[f.key]; }).map(function(f) {
        var val = f.type === "datetime-local" ? fmtDateTime(item[f.key]) : f.type === "date" ? fmtDate(item[f.key]) : item[f.key];
        return React.createElement("div", { key:f.key, style:{ display:"flex", justifyContent:"space-between", padding:"7px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" } },
          React.createElement("span", { style:{ color:"#64748b", fontSize:12 } }, f.label.replace(" *","")),
          React.createElement("span", { style:{ color:"#f1f5f9", fontSize:12, fontWeight:600, textAlign:"right", maxWidth:"55%" } }, val)
        );
      })
    ),
    att.link && React.createElement("button", {
      onClick: function() { openLink(att.link); },
      style:{ width:"100%", display:"flex", alignItems:"center", gap:12,
        background:"rgba(56,189,248,0.06)", border:"1px solid "+color+"30",
        borderRadius:16, padding:"14px 18px", marginBottom:10, cursor:"pointer", textAlign:"left" }
    },
      React.createElement("span", { style:{ fontSize:22 } }, "🔗"),
      React.createElement("div", { style:{ flex:1 } },
        React.createElement("p", { style:{ color:"#f1f5f9", fontWeight:600, margin:0, fontSize:14 } }, "Abrir reserva"),
        React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"2px 0 0" } }, att.link.replace(/^https?:\/\//,"").split("/")[0])
      ),
      React.createElement("span", { style:{ color:color, fontWeight:700 } }, "→")
    ),
    att.foto && React.createElement("div", { style:{ marginBottom:10 } },
      React.createElement("p", { style:{ color:"#94a3b8", fontSize:12, marginBottom:6 } }, "📸 Foto del comprobante"),
      React.createElement("img", { src:att.foto, alt:"foto", style:{ width:"100%", borderRadius:12, maxHeight:200, objectFit:"cover", marginBottom:6 } }),
      React.createElement("button", {
        onClick: function() { downloadFile(att.foto, att.fotoNombre || "foto.jpg"); },
        style:{ width:"100%", padding:"9px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#94a3b8", fontSize:12, cursor:"pointer" }
      }, "⬇️ Descargar foto")
    ),
    att.archivo && React.createElement("div", { style:{ marginBottom:10 } },
      React.createElement("p", { style:{ color:"#94a3b8", fontSize:12, marginBottom:6 } }, "📄 Archivo adjunto"),
      React.createElement("div", { style:{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"14px", display:"flex", alignItems:"center", gap:12, marginBottom:6 } },
        React.createElement("span", { style:{ fontSize:28 } }, "📄"),
        React.createElement("p", { style:{ color:"#f1f5f9", fontSize:13, fontWeight:600, margin:0, flex:1 } }, att.archivoNombre || "Archivo")
      ),
      React.createElement("button", {
        onClick: function() { downloadFile(att.archivo, att.archivoNombre || "archivo"); },
        style:{ width:"100%", padding:"9px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#94a3b8", fontSize:12, cursor:"pointer" }
      }, "⬇️ Descargar " + (att.archivoNombre || "archivo"))
    ),
    !att.link && !att.foto && !att.archivo && React.createElement("div", { style:{ textAlign:"center", padding:"20px", color:"#475569", marginBottom:10 } },
      React.createElement("p", { style:{ margin:0, fontSize:13 } }, "📭 Sin comprobantes")
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:6 } },
      React.createElement("button", {
        onClick: function() { setMode("edit"); },
        style:{ flex:1, padding:"12px", background:color+"18", border:"1px solid "+color+"44", borderRadius:14, color:color, fontSize:14, cursor:"pointer", fontWeight:600 }
      }, "✏️ Editar"),
      React.createElement("button", {
        onClick: function() { setMode("delete"); },
        style:{ flex:1, padding:"12px", background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:14, color:"#f87171", fontSize:14, cursor:"pointer", fontWeight:600 }
      }, "🗑️ Eliminar")
    ),
    React.createElement("button", {
      onClick: onClose,
      style:{ width:"100%", padding:"12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, color:"#64748b", fontSize:14, cursor:"pointer", marginTop:10 }
    }, "Cerrar")
  );
}

// ── Expense Form ──
function ExpenseForm({ initial, members, currency, onSave, onClose }) {
  var descSt = useState(initial ? (initial.descripcion || "") : "");
  var desc = descSt[0]; var setDesc = descSt[1];
  var totSt = useState(initial ? String(initial.total || "") : "");
  var tot = totSt[0]; var setTot = totSt[1];
  var fechSt = useState(initial ? (initial._fecha || "") : "");
  var fech = fechSt[0]; var setFech = fechSt[1];
  var pagSt = useState(initial ? (initial.pagadoPor || (members[0] || "")) : (members[0] || ""));
  var pag = pagSt[0]; var setPag = pagSt[1];
  var entrSt = useState(initial ? (initial.divididoEntre || members.slice()) : members.slice());
  var entr = entrSt[0]; var setEntr = entrSt[1];

  function toggle(m) {
    setEntr(function(prev) {
      return prev.includes(m) ? prev.filter(function(x) { return x !== m; }) : prev.concat([m]);
    });
  }

  function save() {
    if (!desc || !tot || !entr.length) return;
    onSave({
      id: (initial && initial.id) || Date.now(),
      descripcion: desc, total: parseFloat(tot),
      fecha: fmtDate(fech), _fecha: fech,
      pagadoPor: pag, divididoEntre: entr,
    });
    onClose();
  }

  return React.createElement("div", null,
    React.createElement(Lbl, null, "Descripción *"),
    React.createElement("input", { placeholder:"Ej: Cena en restaurante", value:desc, onChange:function(e){setDesc(e.target.value);}, style:inputSt }),
    React.createElement(Lbl, null, "Total (" + currency + ") *"),
    React.createElement("input", { type:"number", placeholder:"0", value:tot, onChange:function(e){setTot(e.target.value);}, style:inputSt }),
    React.createElement(Lbl, null, "Fecha"),
    React.createElement("input", { type:"date", value:fech, onChange:function(e){setFech(e.target.value);}, style:Object.assign({},inputSt,{colorScheme:"dark"}) }),
    React.createElement(Lbl, null, "¿Quién pagó?"),
    React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" } },
      members.map(function(m, i) {
        return React.createElement("button", {
          key:m, onClick:function(){setPag(m);},
          style:{ padding:"7px 14px", borderRadius:99, fontSize:13, fontWeight:600, cursor:"pointer",
            background: pag===m ? gc(i)+"22" : "rgba(255,255,255,0.05)",
            border: pag===m ? "1px solid "+gc(i)+"66" : "1px solid rgba(255,255,255,0.08)",
            color: pag===m ? gc(i) : "#64748b" }
        }, m);
      })
    ),
    React.createElement(Lbl, null, "¿Dividido entre?"),
    React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" } },
      members.map(function(m, i) {
        var sel = entr.includes(m);
        return React.createElement("button", {
          key:m, onClick:function(){toggle(m);},
          style:{ padding:"7px 14px", borderRadius:99, fontSize:13, fontWeight:600, cursor:"pointer",
            background: sel ? gc(i)+"22" : "rgba(255,255,255,0.05)",
            border: sel ? "1px solid "+gc(i)+"66" : "1px solid rgba(255,255,255,0.08)",
            color: sel ? gc(i) : "#64748b" }
        }, m);
      })
    ),
    tot && entr.length > 0 && React.createElement("p", { style:{ color:"#64748b", fontSize:13, marginBottom:12, textAlign:"center" } },
      currency + (parseFloat(tot) / entr.length).toFixed(2) + " por persona"
    ),
    React.createElement("div", { style:{ display:"flex", gap:10, marginTop:8 } },
      React.createElement(CancelBtn, { onClick: onClose }),
      React.createElement("button", {
        onClick: save,
        style:{ flex:2, padding:"13px", background:"linear-gradient(135deg,#4ade80,#38bdf8)", border:"none", borderRadius:14, color:"#0f172a", fontWeight:700, fontSize:15, cursor:"pointer" }
      }, "Guardar gasto")
    )
  );
}

// ── Expense Modal ──
function ExpenseModal({ exp, members, currency, onClose, onSave, onDelete }) {
  var modeSt = useState("view");
  var mode = modeSt[0]; var setMode = modeSt[1];

  if (mode === "edit") return React.createElement(Sheet, { onClose:onClose },
    React.createElement(STitle, { onClose:onClose }, "✏️ Editar gasto"),
    React.createElement(ExpenseForm, { initial:exp, members:members, currency:currency, onSave:onSave, onClose:onClose })
  );
  if (mode === "delete") return React.createElement(Sheet, { onClose:onClose },
    React.createElement(STitle, { onClose:onClose }, "🗑️ Eliminar gasto"),
    React.createElement("p", { style:{ color:"#94a3b8", fontSize:14, margin:"0 0 24px" } }, "¿Eliminar ", React.createElement("strong", { style:{ color:"#f1f5f9" } }, exp.descripcion), "?"),
    React.createElement("div", { style:{ display:"flex", gap:10 } },
      React.createElement(CancelBtn, { onClick:onClose }),
      React.createElement("button", { onClick:function(){ onDelete(); onClose(); }, style:{ flex:1, padding:"13px", background:"#f87171", border:"none", borderRadius:14, color:"#fff", fontSize:14, cursor:"pointer", fontWeight:700 } }, "Eliminar")
    )
  );

  return React.createElement(Sheet, { onClose:onClose },
    React.createElement("h3", { style:{ color:"#f8fafc", margin:"0 0 4px", fontSize:17 } }, exp.descripcion),
    React.createElement("p", { style:{ color:"#64748b", fontSize:13, margin:"0 0 16px" } },
      exp.fecha ? exp.fecha + " · " : "", "Pagó ", React.createElement("span", { style:{ color:gc(members.indexOf(exp.pagadoPor)), fontWeight:600 } }, exp.pagadoPor)
    ),
    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"14px 16px", marginBottom:16 } },
      React.createElement("div", null,
        React.createElement("p", { style:{ color:"#64748b", fontSize:11, margin:0 } }, "Total"),
        React.createElement("p", { style:{ color:"#4ade80", fontWeight:800, fontSize:22, margin:"4px 0 0" } }, currency + exp.total)
      ),
      React.createElement("div", { style:{ textAlign:"right" } },
        React.createElement("p", { style:{ color:"#64748b", fontSize:11, margin:0 } }, "Por persona"),
        React.createElement("p", { style:{ color:"#f1f5f9", fontWeight:700, fontSize:22, margin:"4px 0 0" } }, currency + (exp.total / (exp.divididoEntre || [1]).length).toFixed(2))
      )
    ),
    React.createElement("div", { style:{ display:"flex", gap:10 } },
      React.createElement("button", { onClick:function(){setMode("edit");}, style:{ flex:1, padding:"12px", background:"#4ade8018", border:"1px solid #4ade8044", borderRadius:14, color:"#4ade80", fontSize:14, cursor:"pointer", fontWeight:600 } }, "✏️ Editar"),
      React.createElement("button", { onClick:function(){setMode("delete");}, style:{ flex:1, padding:"12px", background:"rgba(248,113,113,0.12)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:14, color:"#f87171", fontSize:14, cursor:"pointer", fontWeight:600 } }, "🗑️ Eliminar")
    ),
    React.createElement("button", { onClick:onClose, style:{ width:"100%", padding:"12px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, color:"#64748b", fontSize:14, cursor:"pointer", marginTop:10 } }, "Cerrar")
  );
}

// ── Gastos View ──
function GastosView({ expenses, onUpdate, members, currency }) {
  var showSt = useState(false); var showAdd = showSt[0]; var setShowAdd = showSt[1];
  var selSt = useState(null); var selected = selSt[0]; var setSelected = selSt[1];
  var res = calcDeudas(expenses, members);
  var balance = res.balance; var tx = res.tx;
  var total = expenses.reduce(function(s,e){ return s+e.total; }, 0);

  function saveExp(exp) {
    var ex = expenses.find(function(e){ return e.id===exp.id; });
    onUpdate("expenses", ex ? expenses.map(function(e){ return e.id===exp.id ? exp : e; }) : expenses.concat([exp]));
  }
  function delExp(id) { onUpdate("expenses", expenses.filter(function(e){ return e.id!==id; })); }

  return React.createElement("div", { style:{ padding:"0 24px 130px" } },
    // Summary cards
    React.createElement("div", { style:{ display:"flex", gap:12, marginBottom:20 } },
      [{ label:"Total grupo", val:currency+total.toLocaleString(), color:"#f1f5f9" }, { label:"Por persona", val:currency+(members.length ? (total/members.length).toFixed(0) : 0), color:"#4ade80" }].map(function(c) {
        return React.createElement("div", { key:c.label, style:{ flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:18, padding:"16px" } },
          React.createElement("p", { style:{ color:"#64748b", fontSize:11, margin:0, textTransform:"uppercase", letterSpacing:1 } }, c.label),
          React.createElement("p", { style:{ color:c.color, fontSize:22, fontWeight:800, margin:"4px 0 0" } }, c.val)
        );
      })
    ),
    // Balance
    React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 10px" } }, "Balance individual"),
    React.createElement("div", { style:{ display:"flex", gap:10, marginBottom:22, overflowX:"auto", paddingBottom:4 } },
      members.map(function(m, i) {
        var b = balance[m] || 0;
        return React.createElement("div", { key:m, style:{ flex:"0 0 auto", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"12px 14px", minWidth:84, textAlign:"center" } },
          React.createElement(Avt, { name:m, color:gc(i), size:34 }),
          React.createElement("p", { style:{ color:"#f1f5f9", fontSize:11, fontWeight:600, margin:"6px 0 3px" } }, m),
          React.createElement("p", { style:{ color:b>=0?"#4ade80":"#f87171", fontWeight:700, fontSize:14, margin:0 } }, (b>=0?"+":"") + currency + Math.abs(b).toFixed(0))
        );
      })
    ),
    // Deudas
    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 } },
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:0 } }, "Deudas simplificadas"),
      React.createElement("span", { style:{ background:tx.length?"#f87171":"#4ade80", color:"#fff", fontSize:10, fontWeight:700, borderRadius:99, padding:"2px 8px" } }, tx.length===0?"✓ Al día":tx.length)
    ),
    tx.length===0 && React.createElement("div", { style:{ textAlign:"center", padding:"16px 0 20px", color:"#475569" } },
      React.createElement("p", { style:{ fontSize:26, margin:0 } }, "🎉"),
      React.createElement("p", { style:{ margin:"6px 0 0", fontSize:13 } }, "¡Todos al día!")
    ),
    tx.map(function(t, i) {
      return React.createElement("div", { key:i, style:{ background:"rgba(248,113,113,0.07)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:16, padding:"14px 16px", marginBottom:10, display:"flex", alignItems:"center", gap:10 } },
        React.createElement(Avt, { name:t.de, color:gc(members.indexOf(t.de)) }),
        React.createElement("div", { style:{ flex:1 } },
          React.createElement("p", { style:{ color:"#f1f5f9", fontSize:13, fontWeight:600, margin:0 } }, t.de + " → " + t.a),
          React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"2px 0 0" } }, "debe pagar")
        ),
        React.createElement(Avt, { name:t.a, color:gc(members.indexOf(t.a)) }),
        React.createElement("p", { style:{ color:"#f87171", fontWeight:800, fontSize:17, margin:0, minWidth:60, textAlign:"right" } }, currency + t.monto.toFixed(2))
      );
    }),
    // Expenses list
    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", margin:"20px 0 12px" } },
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:0 } }, "Todos los gastos"),
      React.createElement("button", { onClick:function(){setShowAdd(true);}, style:{ background:"#4ade8018", border:"1px solid #4ade8044", borderRadius:10, padding:"5px 12px", color:"#4ade80", fontSize:12, fontWeight:600, cursor:"pointer" } }, "+ Agregar")
    ),
    expenses.length===0 && React.createElement(Empty, { icon:"💰", text:"Sin gastos. Tocá + para agregar." }),
    expenses.map(function(exp) {
      return React.createElement("div", { key:exp.id, onClick:function(){setSelected(exp);}, style:{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"13px 16px", marginBottom:10, cursor:"pointer" } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" } },
          React.createElement("div", null,
            React.createElement("p", { style:{ color:"#f1f5f9", fontWeight:600, fontSize:14, margin:0 } }, exp.descripcion),
            React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"3px 0 0" } }, (exp.fecha ? exp.fecha + " · " : "") + "Pagó ", React.createElement("span", { style:{ color:gc(members.indexOf(exp.pagadoPor)), fontWeight:600 } }, exp.pagadoPor))
          ),
          React.createElement("p", { style:{ color:"#4ade80", fontWeight:700, fontSize:16, margin:0 } }, currency + exp.total)
        ),
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 } },
          React.createElement("div", { style:{ display:"flex", gap:6 } },
            (exp.divididoEntre || []).filter(function(m){ return members.includes(m); }).map(function(m){ return React.createElement(Avt, { key:m, name:m, color:gc(members.indexOf(m)), size:22 }); })
          ),
          React.createElement("span", { style:{ color:"#475569", fontSize:11 } }, "Toca para editar →")
        )
      );
    }),
    showAdd && React.createElement(Sheet, { onClose:function(){setShowAdd(false);} },
      React.createElement(STitle, { onClose:function(){setShowAdd(false);} }, "💰 Agregar gasto"),
      React.createElement(ExpenseForm, { members:members, currency:currency, onSave:function(exp){ onUpdate("expenses",expenses.concat([exp])); }, onClose:function(){setShowAdd(false);} })
    ),
    selected && React.createElement(ExpenseModal, { exp:selected, members:members, currency:currency, onClose:function(){setSelected(null);}, onSave:saveExp, onDelete:function(){delExp(selected.id);} })
  );
}

// ── Alertas View ──
function AlertasView({ alertas, onUpdate }) {
  var showSt = useState(false); var showAdd = showSt[0]; var setShowAdd = showSt[1];
  var editSt = useState(null); var editItem = editSt[0]; var setEditItem = editSt[1];
  var titSt = useState(""); var tit = titSt[0]; var setTit = titSt[1];
  var fecSt = useState(""); var fec = fecSt[0]; var setFec = fecSt[1];
  var tipSt = useState("📅"); var tip = tipSt[0]; var setTip = tipSt[1];
  var tipos = ["📅","✈️","🏨","🚗","🎡","🎟️","💊","📋"];
  var hoy = new Date();

  function add() {
    if (!tit) return;
    onUpdate("alertas", alertas.concat([{ id:Date.now(), titulo:tit, fecha:fec, tipo:tip, activa:true }]));
    setTit(""); setFec(""); setTip("📅"); setShowAdd(false);
  }
  function remove(id) { onUpdate("alertas", alertas.filter(function(a){ return a.id!==id; })); }
  function saveEdit(upd) { onUpdate("alertas", alertas.map(function(a){ return a.id===upd.id ? upd : a; })); }

  var proximas = alertas.filter(function(a){ return a.activa && a.fecha && new Date(a.fecha) >= hoy; }).sort(function(a,b){ return new Date(a.fecha)-new Date(b.fecha); });
  var pasadas  = alertas.filter(function(a){ return !a.activa || (a.fecha && new Date(a.fecha) < hoy); });

  return React.createElement("div", { style:{ padding:"0 24px 130px" } },
    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 } },
      React.createElement("h2", { style:{ color:"#f8fafc", fontSize:18, fontWeight:800, margin:0 } }, "🔔 Alertas"),
      React.createElement("button", { onClick:function(){setShowAdd(true);}, style:{ background:"#f472b618", border:"1px solid #f472b644", borderRadius:10, padding:"6px 14px", color:"#f472b6", fontSize:12, fontWeight:600, cursor:"pointer" } }, "+ Nueva")
    ),
    alertas.length===0 && React.createElement(Empty, { icon:"🔔", text:"Agregá recordatorios de fechas importantes." }),
    proximas.length > 0 && React.createElement("div", null,
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 10px" } }, "Próximas"),
      proximas.map(function(a) {
        var dias = Math.ceil((new Date(a.fecha)-hoy)/(1000*60*60*24));
        return React.createElement("div", { key:a.id, style:{ background:"rgba(244,114,182,0.07)", border:"1px solid rgba(244,114,182,0.2)", borderRadius:18, padding:"14px 18px", marginBottom:10, display:"flex", alignItems:"center", gap:12 } },
          React.createElement("span", { style:{ fontSize:24, flexShrink:0 } }, a.tipo),
          React.createElement("div", { style:{ flex:1 } },
            React.createElement("p", { style:{ color:"#f1f5f9", fontWeight:600, fontSize:14, margin:0 } }, a.titulo),
            a.fecha && React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"3px 0 0" } },
              new Date(a.fecha).toLocaleDateString("es-ES",{day:"numeric",month:"long"}), " · ",
              React.createElement("span", { style:{ color:dias<=3?"#f87171":"#facc15" } }, "en " + dias + " día" + (dias!==1?"s":""))
            )
          ),
          React.createElement("button", { onClick:function(){setEditItem(a);}, style:{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:16, padding:"4px" } }, "✏️"),
          React.createElement("button", { onClick:function(){remove(a.id);}, style:{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:18, padding:"4px" } }, "×")
        );
      })
    ),
    pasadas.length > 0 && React.createElement("div", null,
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"16px 0 10px" } }, "Pasadas"),
      pasadas.map(function(a) {
        return React.createElement("div", { key:a.id, style:{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:16, padding:"13px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12, opacity:0.6 } },
          React.createElement("span", { style:{ fontSize:22 } }, a.tipo),
          React.createElement("div", { style:{ flex:1 } }, React.createElement("p", { style:{ color:"#94a3b8", fontSize:13, margin:0, textDecoration:"line-through" } }, a.titulo)),
          React.createElement("button", { onClick:function(){remove(a.id);}, style:{ background:"none", border:"none", color:"#475569", cursor:"pointer", fontSize:18 } }, "×")
        );
      })
    ),
    showAdd && React.createElement(Sheet, { onClose:function(){setShowAdd(false);} },
      React.createElement(STitle, { onClose:function(){setShowAdd(false);} }, "🔔 Nueva alerta"),
      React.createElement(Lbl, null, "Ícono"),
      React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" } },
        tipos.map(function(t){ return React.createElement("button", { key:t, onClick:function(){setTip(t);}, style:{ width:40, height:40, borderRadius:10, background:tip===t?"#f472b622":"rgba(255,255,255,0.05)", border:tip===t?"1px solid #f472b655":"1px solid rgba(255,255,255,0.08)", fontSize:20, cursor:"pointer" } }, t); })
      ),
      React.createElement(Lbl, null, "Descripción *"),
      React.createElement("input", { placeholder:"Ej: Check-in hotel", value:tit, onChange:function(e){setTit(e.target.value);}, style:inputSt }),
      React.createElement(Lbl, null, "Fecha"),
      React.createElement("input", { type:"date", value:fec, onChange:function(e){setFec(e.target.value);}, style:Object.assign({},inputSt,{colorScheme:"dark"}) }),
      React.createElement("div", { style:{ display:"flex", gap:10, marginTop:8 } },
        React.createElement(CancelBtn, { onClick:function(){setShowAdd(false);} }),
        React.createElement("button", { onClick:add, style:{ flex:2, padding:"13px", background:"linear-gradient(135deg,#f472b6,#818cf8)", border:"none", borderRadius:14, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" } }, "Guardar alerta")
      )
    ),
    editItem && React.createElement(Sheet, { onClose:function(){setEditItem(null);} },
      React.createElement(STitle, { onClose:function(){setEditItem(null);} }, "✏️ Editar alerta"),
      React.createElement(Lbl, null, "Ícono"),
      React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" } },
        tipos.map(function(t){ return React.createElement("button", { key:t, onClick:function(){setEditItem(Object.assign({},editItem,{tipo:t}));}, style:{ width:40, height:40, borderRadius:10, background:editItem.tipo===t?"#f472b622":"rgba(255,255,255,0.05)", border:editItem.tipo===t?"1px solid #f472b655":"1px solid rgba(255,255,255,0.08)", fontSize:20, cursor:"pointer" } }, t); })
      ),
      React.createElement(Lbl, null, "Descripción"),
      React.createElement("input", { value:editItem.titulo, onChange:function(e){setEditItem(Object.assign({},editItem,{titulo:e.target.value}));}, style:inputSt }),
      React.createElement(Lbl, null, "Fecha"),
      React.createElement("input", { type:"date", value:editItem.fecha, onChange:function(e){setEditItem(Object.assign({},editItem,{fecha:e.target.value}));}, style:Object.assign({},inputSt,{colorScheme:"dark"}) }),
      React.createElement("div", { style:{ display:"flex", gap:10, marginTop:8 } },
        React.createElement(CancelBtn, { onClick:function(){setEditItem(null);} }),
        React.createElement("button", { onClick:function(){saveEdit(editItem);setEditItem(null);}, style:{ flex:2, padding:"13px", background:"linear-gradient(135deg,#f472b6,#818cf8)", border:"none", borderRadius:14, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" } }, "Guardar cambios")
      )
    )
  );
}

// ── Checklist View ──
function ChecklistView({ checklist, members, onUpdate }) {
  var showSt = useState(false); var showAdd = showSt[0]; var setShowAdd = showSt[1];
  var texSt = useState(""); var tex = texSt[0]; var setTex = texSt[1];
  var asiSt = useState("Todos"); var asi = asiSt[0]; var setAsi = asiSt[1];
  var catSt = useState("🎒"); var cat = catSt[0]; var setCat = catSt[1];
  var cats = ["🎒","👔","💊","📄","🔌","🎿","🏖️","💻"];
  var pendientes  = checklist.filter(function(i){ return !i.completado; });
  var completados = checklist.filter(function(i){ return i.completado; });
  var prog = checklist.length ? Math.round(completados.length/checklist.length*100) : 0;

  function add() {
    if (!tex.trim()) return;
    onUpdate("checklist", checklist.concat([{ id:Date.now(), texto:tex.trim(), asignado:asi, categoria:cat, completado:false }]));
    setTex(""); setShowAdd(false);
  }
  function toggle(id) { onUpdate("checklist", checklist.map(function(i){ return i.id===id ? Object.assign({},i,{completado:!i.completado}) : i; })); }
  function remove(id) { onUpdate("checklist", checklist.filter(function(i){ return i.id!==id; })); }

  function renderItem(item, done) {
    return React.createElement("div", { key:item.id, style:{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"14px 16px", marginBottom:8, display:"flex", alignItems:"center", gap:12 } },
      React.createElement("button", {
        onClick:function(){toggle(item.id);},
        style:{ width:26, height:26, borderRadius:"50%", border:"2px solid #34d399",
          background:done?"#34d399":"transparent", cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:14, color:"#fff" }
      }, done ? "✓" : ""),
      React.createElement("span", { style:{ fontSize:20, flexShrink:0 } }, item.categoria),
      React.createElement("div", { style:{ flex:1, opacity:done?0.5:1 } },
        React.createElement("p", { style:{ color:"#f1f5f9", fontSize:14, fontWeight:600, margin:0, textDecoration:done?"line-through":"none" } }, item.texto),
        React.createElement("p", { style:{ color:"#64748b", fontSize:11, margin:"2px 0 0" } }, item.asignado)
      ),
      React.createElement("button", { onClick:function(){remove(item.id);}, style:{ background:"none", border:"none", color:"#3d5166", cursor:"pointer", fontSize:18, padding:"4px" } }, "×")
    );
  }

  return React.createElement("div", { style:{ padding:"0 24px 130px" } },
    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 } },
      React.createElement("h2", { style:{ color:"#f8fafc", fontSize:18, fontWeight:800, margin:0 } }, "✅ Checklist"),
      React.createElement("button", { onClick:function(){setShowAdd(true);}, style:{ background:"rgba(52,211,153,0.12)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:12, padding:"6px 14px", color:"#34d399", fontSize:12, fontWeight:700, cursor:"pointer" } }, "+ Agregar")
    ),
    checklist.length > 0 && React.createElement("div", { style:{ marginBottom:20 } },
      React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", marginBottom:8 } },
        React.createElement("span", { style:{ color:"#64748b", fontSize:12 } }, completados.length + " de " + checklist.length + " listo"),
        React.createElement("span", { style:{ color:"#34d399", fontWeight:700, fontSize:12 } }, prog + "%")
      ),
      React.createElement("div", { style:{ background:"rgba(255,255,255,0.08)", borderRadius:99, height:6, overflow:"hidden" } },
        React.createElement("div", { style:{ width:prog+"%", height:"100%", background:"linear-gradient(90deg,#34d399,#38bdf8)", borderRadius:99 } })
      )
    ),
    checklist.length===0 && React.createElement(Empty, { icon:"✅", text:"Sin items. Agregá cosas para no olvidar." }),
    pendientes.length > 0 && React.createElement("div", null,
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 10px" } }, "Pendiente (" + pendientes.length + ")"),
      pendientes.map(function(i){ return renderItem(i, false); })
    ),
    completados.length > 0 && React.createElement("div", null,
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"16px 0 10px" } }, "Listo (" + completados.length + ")"),
      completados.map(function(i){ return renderItem(i, true); })
    ),
    showAdd && React.createElement(Sheet, { onClose:function(){setShowAdd(false);} },
      React.createElement(STitle, { onClose:function(){setShowAdd(false);} }, "✅ Nuevo item"),
      React.createElement(Lbl, null, "Categoría"),
      React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" } },
        cats.map(function(c){ return React.createElement("button", { key:c, onClick:function(){setCat(c);}, style:{ width:44, height:44, borderRadius:12, background:cat===c?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.05)", border:cat===c?"1px solid rgba(52,211,153,0.5)":"1px solid rgba(255,255,255,0.08)", fontSize:22, cursor:"pointer" } }, c); })
      ),
      React.createElement(Lbl, null, "¿Qué llevar? *"),
      React.createElement("input", { placeholder:"Ej: Pasaporte, cargador...", value:tex, onChange:function(e){setTex(e.target.value);}, style:inputSt }),
      React.createElement(Lbl, null, "Asignado a"),
      React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" } },
        ["Todos"].concat(members).map(function(m, i){ return React.createElement("button", { key:m, onClick:function(){setAsi(m);}, style:{ padding:"7px 14px", borderRadius:99, fontSize:13, fontWeight:600, cursor:"pointer", background:asi===m?"rgba(52,211,153,0.2)":"rgba(255,255,255,0.05)", border:asi===m?"1px solid rgba(52,211,153,0.4)":"1px solid rgba(255,255,255,0.08)", color:asi===m?"#34d399":"#64748b" } }, m); })
      ),
      React.createElement("div", { style:{ display:"flex", gap:10 } },
        React.createElement(CancelBtn, { onClick:function(){setShowAdd(false);} }),
        React.createElement("button", { onClick:add, style:{ flex:2, padding:"13px", background:"linear-gradient(135deg,#34d399,#38bdf8)", border:"none", borderRadius:14, color:"#fff", fontWeight:700, fontSize:15, cursor:"pointer" } }, "Agregar")
      )
    )
  );
}

// ── Clima View ──
function ClimaView() {
  var ciudadSt = useState(""); var ciudad = ciudadSt[0]; var setCiudad = ciudadSt[1];
  var climaSt = useState(null); var clima = climaSt[0]; var setClima = climaSt[1];
  var loadSt = useState(false); var loading = loadSt[0]; var setLoading = loadSt[1];
  var errSt = useState(""); var err = errSt[0]; var setErr = errSt[1];
  var sugSt = useState([]); var sugerencias = sugSt[0]; var setSugerencias = sugSt[1];
  var showSugSt = useState(false); var showSug = showSugSt[0]; var setShowSug = showSugSt[1];

  // Ciudades predefinidas para autocompletado
  var ciudadesPop = [
    "Buenos Aires","Montevideo","Santiago","Lima","Bogotá","Ciudad de México",
    "San José","Guatemala City","Ciudad de Panamá","Madrid","Barcelona",
    "Miami","Nueva York","Los Ángeles","Cancún","Punta Cana","París",
    "Roma","Londres","Tokio","Sídney","Dubai","Lisboa","Ámsterdam",
    "Río de Janeiro","São Paulo","Asunción","La Paz","Quito","Caracas",
    "San Salvador","Tegucigalpa","Managua","Santo Domingo","La Habana",
    "Punta del Este","Bariloche","Medellín","Cartagena","Cusco",
  ];

  function filtrarSug(texto) {
    if (!texto || texto.length < 2) { setSugerencias([]); setShowSug(false); return; }
    var filtradas = ciudadesPop.filter(function(c) {
      return c.toLowerCase().includes(texto.toLowerCase());
    }).slice(0, 6);
    setSugerencias(filtradas);
    setShowSug(filtradas.length > 0);
  }

  function handleInput(val) {
    setCiudad(val);
    filtrarSug(val);
  }

  function seleccionarCiudad(c) {
    setCiudad(c);
    setSugerencias([]);
    setShowSug(false);
    buscar(c);
  }

  var wIcons = {
    "113":"☀️","116":"⛅","119":"☁️","122":"☁️","143":"🌫️",
    "176":"🌦️","179":"🌨️","200":"⛈️","227":"🌨️","230":"❄️",
    "248":"🌫️","263":"🌦️","266":"🌦️","293":"🌧️","296":"🌧️",
    "299":"🌧️","302":"🌧️","305":"🌧️","308":"🌧️","356":"🌧️","386":"⛈️",
  };
  function wIcon(code) { return wIcons[String(code)] || "🌡️"; }

  function buscar(ciudadParam) {
    var q = ciudadParam || ciudad;
    if (!q.trim()) return;
    setLoading(true); setErr(""); setClima(null); setShowSug(false);
    fetch("https://wttr.in/" + encodeURIComponent(q.trim()) + "?format=j1")
      .then(function(r){ if(!r.ok) throw new Error("no encontrada"); return r.json(); })
      .then(function(d){
        if (d.current_condition && d.current_condition.length > 0) {
          setClima(d);
        } else {
          setErr("No se encontró el clima. Probá con otra ciudad.");
        }
        setLoading(false);
      })
      .catch(function(){ setErr("Ciudad no encontrada. Probá con otra."); setLoading(false); });
  }

  return React.createElement("div", { style:{ padding:"0 24px 130px" } },
    React.createElement("h2", { style:{ color:"#f8fafc", fontSize:18, fontWeight:800, margin:"0 0 20px" } }, "🌤️ Clima del destino"),

    // Search box with autocomplete
    React.createElement("div", { style:{ position:"relative", marginBottom:20 } },
      React.createElement("div", { style:{ display:"flex", gap:8 } },
        React.createElement("input", {
          placeholder:"Ej: Cancún, Buenos Aires, Madrid...",
          value:ciudad,
          onChange:function(e){ handleInput(e.target.value); },
          onKeyDown:function(e){ if(e.key==="Enter"){ buscar(); setShowSug(false); } if(e.key==="Escape") setShowSug(false); },
          style:Object.assign({},inputSt,{ marginBottom:0, flex:1 })
        }),
        React.createElement("button", {
          onClick:function(){ buscar(); setShowSug(false); },
          style:{ background:"linear-gradient(135deg,#38bdf8,#818cf8)", border:"none", borderRadius:14, padding:"0 18px", color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer", flexShrink:0 }
        }, loading ? "..." : "Buscar")
      ),

      // Dropdown sugerencias
      showSug && sugerencias.length > 0 && React.createElement("div", {
        style:{ position:"absolute", top:"100%", left:0, right:0, background:"#0d1829", border:"1px solid rgba(56,189,248,0.3)", borderRadius:14, marginTop:4, zIndex:50, overflow:"hidden", boxShadow:"0 8px 32px rgba(0,0,0,0.4)" }
      },
        sugerencias.map(function(c) {
          return React.createElement("button", {
            key:c,
            onClick:function(){ seleccionarCiudad(c); },
            style:{ width:"100%", padding:"12px 16px", background:"transparent", border:"none", borderBottom:"1px solid rgba(255,255,255,0.06)", color:"#f1f5f9", fontSize:14, cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", gap:10, fontFamily:"'Outfit',sans-serif" }
          },
            React.createElement("span", null, "📍"),
            c
          );
        })
      )
    ),

    err && React.createElement("p", { style:{ color:"#f87171", fontSize:13, textAlign:"center", margin:"0 0 16px" } }, err),

    !clima && !loading && !err && React.createElement("div", null,
      React.createElement("div", { style:{ textAlign:"center", padding:"30px 20px 20px" } },
        React.createElement("div", { style:{ fontSize:48, marginBottom:14 } }, "🌍"),
        React.createElement("p", { style:{ color:"#64748b", fontSize:14, margin:0 } }, "Escribí la ciudad y buscá el clima")
      ),
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 10px" } }, "Destinos populares"),
      React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:8 } },
        ["Cancún","Miami","Madrid","Buenos Aires","Montevideo","San José","Ciudad de Panamá","Punta del Este","Medellín","Lisboa"].map(function(c) {
          return React.createElement("button", {
            key:c,
            onClick:function(){ seleccionarCiudad(c); },
            style:{ padding:"8px 14px", background:"rgba(56,189,248,0.08)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:99, color:"#38bdf8", fontSize:12, fontWeight:600, cursor:"pointer" }
          }, c);
        })
      )
    ),

    loading && React.createElement("div", { style:{ textAlign:"center", padding:"40px 20px" } },
      React.createElement("p", { style:{ color:"#64748b", fontSize:14 } }, "🔍 Buscando clima...")
    ),

    clima && React.createElement("div", null,
      // Current weather card
      React.createElement("div", { style:{ background:"linear-gradient(135deg,rgba(56,189,248,0.12),rgba(129,140,248,0.12))", border:"1px solid rgba(56,189,248,0.2)", borderRadius:20, padding:"20px", marginBottom:16 } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" } },
          React.createElement("div", null,
            React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"0 0 4px", textTransform:"capitalize" } }, ciudad),
            React.createElement("p", { style:{ color:"#f8fafc", fontSize:52, fontWeight:900, margin:"0 0 4px", lineHeight:1 } },
              clima.current_condition[0].temp_C + "°"
            ),
            React.createElement("p", { style:{ color:"#94a3b8", fontSize:14, margin:0 } },
              clima.current_condition[0].weatherDesc[0].value
            )
          ),
          React.createElement("span", { style:{ fontSize:60 } },
            wIcon(clima.current_condition[0].weatherCode)
          )
        ),
        React.createElement("div", { style:{ display:"flex", gap:10, marginTop:16 } },
          [
            {label:"Sensación", val:clima.current_condition[0].FeelsLikeC + "°"},
            {label:"Humedad",   val:clima.current_condition[0].humidity + "%"},
            {label:"Viento",    val:clima.current_condition[0].windspeedKmph + " km/h"},
          ].map(function(d) {
            return React.createElement("div", { key:d.label, style:{ flex:1, background:"rgba(255,255,255,0.06)", borderRadius:12, padding:"10px", textAlign:"center" } },
              React.createElement("p", { style:{ color:"#64748b", fontSize:10, margin:"0 0 3px", textTransform:"uppercase", letterSpacing:1 } }, d.label),
              React.createElement("p", { style:{ color:"#f1f5f9", fontSize:14, fontWeight:700, margin:0 } }, d.val)
            );
          })
        )
      ),

      // 3 day forecast
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 10px" } }, "Próximos días"),
      (clima.weather || []).slice(0,3).map(function(day, i) {
        var fecha = new Date(day.date + "T12:00:00");
        var nombre = fecha.toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"short"});
        var code = day.hourly && day.hourly[4] ? day.hourly[4].weatherCode : "113";
        var desc = day.hourly && day.hourly[4] ? day.hourly[4].weatherDesc[0].value : "";
        return React.createElement("div", { key:i, style:{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:16, padding:"14px 18px", display:"flex", alignItems:"center", gap:12, marginBottom:8 } },
          React.createElement("span", { style:{ fontSize:28, flexShrink:0 } }, wIcon(code)),
          React.createElement("div", { style:{ flex:1 } },
            React.createElement("p", { style:{ color:"#f1f5f9", fontWeight:600, fontSize:13, margin:0, textTransform:"capitalize" } }, nombre),
            React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"2px 0 0" } }, desc)
          ),
          React.createElement("div", { style:{ textAlign:"right" } },
            React.createElement("p", { style:{ color:"#f1f5f9", fontWeight:800, fontSize:16, margin:0 } }, day.maxtempC + "°"),
            React.createElement("p", { style:{ color:"#64748b", fontSize:13, margin:"2px 0 0" } }, day.mintempC + "°")
          )
        );
      })
    )
  );
}

// ── Conversor View ──
function ConversorView({ currency }) {
  var montSt = useState(""); var mont = montSt[0]; var setMont = montSt[1];
  var desdeSt = useState("USD"); var desde = desdeSt[0]; var setDesde = desdeSt[1];
  var hastaSt = useState("EUR"); var hasta = hastaSt[0]; var setHasta = hastaSt[1];
  var ratesSt = useState({}); var rates = ratesSt[0]; var setRates = ratesSt[1];
  var loadSt = useState(false); var loading = loadSt[0]; var setLoading = loadSt[1];
  var errSt = useState(""); var err = errSt[0]; var setErr = errSt[1];
  var updSt = useState(""); var upd = updSt[0]; var setUpd = updSt[1];

  // Monedas ordenadas: Centroamérica primero, luego las más comunes
  var monedas = [
    {code:"CRC", flag:"🇨🇷", name:"Colón CR"},
    {code:"GTQ", flag:"🇬🇹", name:"Quetzal"},
    {code:"PAB", flag:"🇵🇦", name:"Balboa"},
    {code:"USD", flag:"🇺🇸", name:"Dólar"},
    {code:"EUR", flag:"🇪🇺", name:"Euro"},
    {code:"UYU", flag:"🇺🇾", name:"Peso UY"},
    {code:"ARS", flag:"🇦🇷", name:"Peso AR"},
    {code:"MXN", flag:"🇲🇽", name:"Peso MX"},
    {code:"BRL", flag:"🇧🇷", name:"Real"},
    {code:"GBP", flag:"🇬🇧", name:"Libra"},
    {code:"CLP", flag:"🇨🇱", name:"Peso CL"},
    {code:"COP", flag:"🇨🇴", name:"Peso CO"},
    {code:"JPY", flag:"🇯🇵", name:"Yen"},
    {code:"CAD", flag:"🇨🇦", name:"Dólar CA"},
    {code:"CHF", flag:"🇨🇭", name:"Franco"},
  ];

  function getMon(code) {
    return monedas.find(function(m){ return m.code === code; }) || {code:code, flag:"💱", name:code};
  }

  function fetchRates(base) {
    setLoading(true); setErr("");
    // Use exchangerate-api which supports CORS
    fetch("https://open.er-api.com/v6/latest/" + base)
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.rates) {
          setRates(d.rates);
          setUpd(new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}));
        } else {
          // fallback to frankfurter
          return fetch("https://api.frankfurter.app/latest?from=" + base)
            .then(function(r){ return r.json(); })
            .then(function(d2){
              if (d2.rates) {
                var r = Object.assign({}, d2.rates);
                r[base] = 1;
                setRates(r);
                setUpd(new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}));
              }
            });
        }
        setLoading(false);
      })
      .catch(function(){
        // try backup API
        fetch("https://api.exchangerate-api.com/v4/latest/" + base)
          .then(function(r){ return r.json(); })
          .then(function(d){
            if (d.rates) {
              setRates(d.rates);
              setUpd(new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}));
            }
            setLoading(false);
          })
          .catch(function(){ setErr("Error de conexión"); setLoading(false); });
      });
  }

  useEffect(function() { fetchRates(desde); }, [desde]);

  function swap() {
    var tmp = desde;
    setDesde(hasta);
    setHasta(tmp);
  }

  var resultado = mont && rates[hasta] ? (parseFloat(mont) * rates[hasta]).toFixed(2) : "";
  var tasa = rates[hasta] ? rates[hasta].toFixed(4) : "";

  var selStyle = {
    background:"rgba(255,255,255,0.08)",
    border:"1px solid rgba(255,255,255,0.15)",
    borderRadius:14, padding:"12px 10px",
    color:"#f1f5f9", fontSize:13, fontWeight:700,
    outline:"none", cursor:"pointer",
    fontFamily:"'Outfit',sans-serif",
    colorScheme:"dark", minWidth:120,
  };

  var desdeM = getMon(desde);
  var hastaM = getMon(hasta);

  return React.createElement("div", { style:{ padding:"0 24px 130px" } },
    React.createElement("h2", { style:{ color:"#f8fafc", fontSize:18, fontWeight:800, margin:"0 0 20px" } }, "💱 Conversor de moneda"),

    React.createElement("div", { style:{ background:"linear-gradient(135deg,rgba(56,189,248,0.08),rgba(129,140,248,0.08))", border:"1px solid rgba(56,189,248,0.15)", borderRadius:20, padding:"20px", marginBottom:16 } },
      
      // DE
      React.createElement("p", { style:{ color:"#64748b", fontSize:10, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 8px" } }, "De"),
      React.createElement("input", {
        type:"number", placeholder:"0", value:mont,
        onChange:function(e){ setMont(e.target.value); },
        style:{ display:"block", width:"100%", background:"rgba(255,255,255,0.08)", border:"1px solid rgba(255,255,255,0.15)", borderRadius:14, padding:"14px 16px", color:"#f8fafc", fontSize:24, fontWeight:800, outline:"none", fontFamily:"'Outfit',sans-serif", boxSizing:"border-box", marginBottom:8 }
      }),
      React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:10, marginBottom:4 } },
        React.createElement("span", { style:{ fontSize:22 } }, desdeM.flag),
        React.createElement("select", {
          value:desde,
          onChange:function(e){ setDesde(e.target.value); },
          style:Object.assign({},selStyle,{flex:1})
        },
          monedas.map(function(m){
            return React.createElement("option", { key:m.code, value:m.code, style:{ background:"#0d1829" } },
              m.flag + " " + m.code + " - " + m.name
            );
          })
        )
      ),

      // SWAP
      React.createElement("div", { style:{ textAlign:"center", margin:"12px 0" } },
        React.createElement("button", {
          onClick:swap,
          style:{ background:"rgba(56,189,248,0.15)", border:"1px solid rgba(56,189,248,0.3)", borderRadius:99, width:40, height:40, cursor:"pointer", fontSize:18, color:"#38bdf8", display:"inline-flex", alignItems:"center", justifyContent:"center" }
        }, "⇅")
      ),

      // A
      React.createElement("p", { style:{ color:"#64748b", fontSize:10, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 8px" } }, "A"),
      React.createElement("div", { style:{ background:"rgba(52,211,153,0.08)", border:"1px solid rgba(52,211,153,0.25)", borderRadius:14, padding:"14px 16px", marginBottom:8, display:"flex", alignItems:"center" } },
        React.createElement("p", { style:{ color:"#34d399", fontSize:24, fontWeight:800, margin:0 } }, resultado || "0.00")
      ),
      React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:10 } },
        React.createElement("span", { style:{ fontSize:22 } }, hastaM.flag),
        React.createElement("select", {
          value:hasta,
          onChange:function(e){ setHasta(e.target.value); },
          style:Object.assign({},selStyle,{flex:1})
        },
          monedas.map(function(m){
            return React.createElement("option", { key:m.code, value:m.code, style:{ background:"#0d1829" } },
              m.flag + " " + m.code + " - " + m.name
            );
          })
        )
      ),

      // Tasa
      tasa && React.createElement("div", { style:{ marginTop:14, padding:"10px 14px", background:"rgba(255,255,255,0.04)", borderRadius:12, display:"flex", justifyContent:"space-between", alignItems:"center" } },
        React.createElement("span", { style:{ color:"#64748b", fontSize:12 } },
          "1 " + desde + " = " + tasa + " " + hasta
        ),
        React.createElement("span", { style:{ color:"#3d5166", fontSize:11 } },
          loading ? "⟳ Actualizando..." : (upd ? "Act. " + upd : "")
        )
      ),

      err && React.createElement("p", { style:{ color:"#f87171", fontSize:12, margin:"10px 0 0", textAlign:"center" } }, err)
    ),

    // Conversiones rápidas
    mont && resultado && React.createElement("div", null,
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1.5, margin:"0 0 10px" } }, "Conversiones rápidas"),
      [1,5,10,20,50,100,500].map(function(v) {
        return React.createElement("div", { key:v, style:{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 } },
          React.createElement("span", { style:{ color:"#f1f5f9", fontWeight:600, fontSize:14 } }, v + " " + desde),
          React.createElement("span", { style:{ color:"#38bdf8", fontWeight:700, fontSize:14 } },
            (v * (rates[hasta]||0)).toFixed(2) + " " + hasta
          )
        );
      })
    ),

    !mont && React.createElement("div", { style:{ textAlign:"center", padding:"40px 20px" } },
      React.createElement("div", { style:{ fontSize:48, marginBottom:14 } }, "💱"),
      React.createElement("p", { style:{ color:"#64748b", fontSize:14, margin:0 } }, "Ingresá un monto para convertir")
    )
  );
}

// ── Grupo View ──
function GrupoView({ members, expenses, currency }) {
  var res = calcDeudas(expenses, members);
  var balance = res.balance;
  var totalGastado = expenses.reduce(function(s,e){ return s+e.total; }, 0);

  return React.createElement("div", { style:{ padding:"0 24px 130px" } },
    React.createElement("h2", { style:{ color:"#f8fafc", fontSize:18, fontWeight:800, margin:"0 0 20px" } }, "👥 Integrantes"),
    members.length===0 && React.createElement(Empty, { icon:"👥", text:"Sin integrantes. Agregá desde Configuración." }),
    members.map(function(m, i) {
      var b = balance[m] || 0;
      var gm = expenses.filter(function(e){ return e.pagadoPor===m; });
      var tm = gm.reduce(function(s,e){ return s+e.total; }, 0);
      return React.createElement("div", { key:m, style:{ background:"rgba(255,255,255,0.04)", border:"1px solid "+gc(i)+"25", borderRadius:20, padding:"18px", marginBottom:12 } },
        React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:14, marginBottom:14 } },
          React.createElement(Avt, { name:m, color:gc(i), size:48 }),
          React.createElement("div", { style:{ flex:1 } },
            React.createElement("p", { style:{ color:"#f8fafc", fontWeight:700, fontSize:16, margin:0 } }, m),
            React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"3px 0 0" } }, "Integrante del grupo")
          ),
          React.createElement("div", { style:{ background:b>=0?"#4ade8022":"#f8717122", border:b>=0?"1px solid #4ade8044":"1px solid #f8717144", borderRadius:12, padding:"6px 12px", textAlign:"center" } },
            React.createElement("p", { style:{ color:b>=0?"#4ade80":"#f87171", fontWeight:800, fontSize:16, margin:0 } }, (b>=0?"+":"") + currency + Math.abs(b).toFixed(0)),
            React.createElement("p", { style:{ color:"#64748b", fontSize:10, margin:"2px 0 0" } }, b>=0?"le deben":"debe")
          )
        ),
        React.createElement("div", { style:{ display:"flex", gap:10 } },
          [{ label:"Pagó", val:currency+tm.toFixed(0) }, { label:"Gastos", val:String(gm.length) }, { label:"% total", val:(totalGastado?Math.round(tm/totalGastado*100):0)+"%" }].map(function(c) {
            return React.createElement("div", { key:c.label, style:{ flex:1, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:14, padding:"10px 12px", textAlign:"center" } },
              React.createElement("p", { style:{ color:"#64748b", fontSize:11, margin:0 } }, c.label),
              React.createElement("p", { style:{ color:"#f1f5f9", fontWeight:700, fontSize:15, margin:"3px 0 0" } }, c.val)
            );
          })
        )
      );
    })
  );
}

// ── Config View ──
function ConfigView({ data, onUpdate, onReset, onLeave }) {
  var th = useTheme();
  var dark = th.dark;
  var toggleTheme = th.toggle;
  var lnSt = useState(data.tripName); var ln = lnSt[0]; var setLn = lnSt[1];
  var ldSt = useState(data.dates); var ld = ldSt[0]; var setLd = ldSt[1];
  var lmSt = useState(data.members.slice()); var lm = lmSt[0]; var setLm = lmSt[1];
  var lcSt = useState(data.currency); var lc = lcSt[0]; var setLc = lcSt[1];
  var nmSt = useState(""); var nm = nmSt[0]; var setNm = nmSt[1];
  var confSt = useState(false); var conf = confSt[0]; var setConf = confSt[1];
  var copSt = useState(false); var cop = copSt[0]; var setCop = copSt[1];

  function addM() {
    var n = nm.trim();
    if (n && !lm.includes(n)) { setLm(lm.concat([n])); setNm(""); }
  }
  function save() {
    if (!ln.trim()) return;
    onUpdate({ tripName:ln.trim(), dates:ld.trim(), members:lm, currency:lc });
  }
  function copyCode() {
    try { navigator.clipboard.writeText(data.tripCode); } catch(e) {}
    setCop(true); setTimeout(function(){ setCop(false); }, 2000);
  }
  function share() {
    var msg = "Unite a mi viaje en Vamo!\nCódigo: " + data.tripCode;
    try { if(navigator.share) navigator.share({ title:"Vamo", text:msg }); else navigator.clipboard.writeText(msg); } catch(e) {}
  }

  var totalItems = Object.values(data.items).reduce(function(s,arr){ return s+arr.length; }, 0);
  var currencies = ["$","€","£","¥","ARS","BRL"];

  return React.createElement("div", { style:{ padding:"0 24px 130px" } },
    React.createElement("h2", { style:{ color:"#f8fafc", fontSize:18, fontWeight:800, margin:"0 0 20px" } }, "⚙️ Configuración"),

    // Code card
    React.createElement("div", { style:{ background:"linear-gradient(135deg,rgba(56,189,248,0.08),rgba(129,140,248,0.08))", border:"1px solid rgba(56,189,248,0.2)", borderRadius:20, padding:"20px", marginBottom:16 } },
      React.createElement("p", { style:{ color:"#38bdf8", fontWeight:700, fontSize:14, margin:"0 0 4px" } }, "🔑 Código del viaje"),
      React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"0 0 14px" } }, "Compartilo con tu grupo para que se unan"),
      React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:12 } },
        React.createElement("div", { style:{ flex:1, background:"rgba(0,0,0,0.3)", borderRadius:12, padding:"12px 16px", textAlign:"center" } },
          React.createElement("p", { style:{ color:"#f8fafc", fontWeight:900, fontSize:28, letterSpacing:8, margin:0, fontFamily:"monospace" } }, data.tripCode)
        ),
        React.createElement("button", { onClick:copyCode, style:{ background:"linear-gradient(135deg,#38bdf8,#818cf8)", border:"none", borderRadius:14, padding:"12px 18px", color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer", flexShrink:0, boxShadow:"0 4px 16px rgba(56,189,248,0.35)" } }, cop ? "✓ Copiado" : "Copiar")
      ),
      React.createElement("button", { onClick:share, style:{ width:"100%", marginTop:12, padding:"12px", background:"rgba(56,189,248,0.08)", border:"1px solid rgba(56,189,248,0.2)", borderRadius:14, color:"#38bdf8", fontSize:13, fontWeight:600, cursor:"pointer" } }, "📤 Compartir invitación")
    ),

    // Dark mode toggle
    React.createElement("div", { style:{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:20, padding:"18px", marginBottom:12 } },
      React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center" } },
        React.createElement("div", null,
          React.createElement("p", { style:{ color:"#f8fafc", fontWeight:600, fontSize:14, margin:"0 0 2px" } }, dark ? "🌙 Modo oscuro" : "☀️ Modo claro"),
          React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:0 } }, "Cambiá el tema de la app")
        ),
        React.createElement("button", {
          onClick: toggleTheme,
          style:{ width:52, height:28, borderRadius:99, background:dark?"linear-gradient(135deg,#38bdf8,#818cf8)":"rgba(255,255,255,0.2)", border:"none", cursor:"pointer", position:"relative", transition:"all 0.3s", flexShrink:0 }
        },
          React.createElement("div", { style:{ position:"absolute", top:3, left:dark?26:3, width:22, height:22, borderRadius:"50%", background:"#fff", transition:"left 0.3s", boxShadow:"0 2px 8px rgba(0,0,0,0.3)" } })
        )
      )
    ),

    // Resumen
    React.createElement("div", { style:{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:20, padding:"18px", marginBottom:16 } },
      React.createElement("p", { style:{ color:"#64748b", fontSize:11, textTransform:"uppercase", letterSpacing:1, margin:"0 0 12px" } }, "Resumen"),
      [{ label:"Nombre", val:data.tripName }, { label:"Fechas", val:data.dates }, { label:"Moneda", val:data.currency }, { label:"Integrantes", val:String(data.members.length) }, { label:"Reservas", val:String(totalItems) }, { label:"Gastos", val:String(data.expenses.length) }].map(function(row) {
        return React.createElement("div", { key:row.label, style:{ display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid rgba(255,255,255,0.05)" } },
          React.createElement("span", { style:{ color:"#64748b", fontSize:13 } }, row.label),
          React.createElement("span", { style:{ color:"#f1f5f9", fontSize:13, fontWeight:600 } }, row.val)
        );
      })
    ),

    // Edit
    React.createElement("div", { style:{ background:"rgba(56,189,248,0.05)", border:"1px solid rgba(56,189,248,0.15)", borderRadius:20, padding:"18px", marginBottom:16 } },
      React.createElement("p", { style:{ color:"#38bdf8", fontWeight:600, fontSize:14, margin:"0 0 14px" } }, "✏️ Editar viaje"),
      React.createElement(Lbl, null, "Nombre"),
      React.createElement("input", { value:ln, onChange:function(e){setLn(e.target.value);}, placeholder:"Nombre del viaje", style:inputSt }),
      React.createElement(Lbl, null, "Fechas"),
      React.createElement("input", { value:ld, onChange:function(e){setLd(e.target.value);}, placeholder:"Ej: 12–22 Junio", style:inputSt }),
      React.createElement(Lbl, null, "Moneda"),
      React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:10, flexWrap:"wrap" } },
        currencies.map(function(c) {
          return React.createElement("button", { key:c, onClick:function(){setLc(c);}, style:{ padding:"8px 14px", borderRadius:10, background:lc===c?"#38bdf822":"rgba(255,255,255,0.05)", border:lc===c?"1px solid #38bdf855":"1px solid rgba(255,255,255,0.08)", color:lc===c?"#38bdf8":"#64748b", fontWeight:700, fontSize:14, cursor:"pointer" } }, c);
        })
      ),
      React.createElement(Lbl, null, "Integrantes"),
      React.createElement("div", { style:{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:10 } },
        lm.map(function(m, i) {
          return React.createElement("div", { key:m, style:{ display:"flex", alignItems:"center", gap:5, background:gc(i)+"18", border:"1px solid "+gc(i)+"44", borderRadius:99, padding:"4px 10px" } },
            React.createElement("span", { style:{ color:gc(i), fontSize:12, fontWeight:700 } }, m),
            lm.length > 1 && React.createElement("button", { onClick:function(){ setLm(lm.filter(function(x){ return x!==m; })); }, style:{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:14, padding:0 } }, "×")
          );
        })
      ),
      React.createElement("div", { style:{ display:"flex", gap:8, marginBottom:12 } },
        React.createElement("input", { value:nm, onChange:function(e){setNm(e.target.value);}, onKeyDown:function(e){if(e.key==="Enter")addM();}, placeholder:"Agregar integrante...", style:Object.assign({},inputSt,{marginBottom:0,flex:1}) }),
        React.createElement("button", { onClick:addM, style:{ background:"#38bdf822", border:"1px solid #38bdf844", borderRadius:12, padding:"0 14px", color:"#38bdf8", fontWeight:700, fontSize:18, cursor:"pointer" } }, "+")
      ),
      React.createElement("button", { onClick:save, style:{ width:"100%", padding:"12px", background:"linear-gradient(135deg,#38bdf8,#818cf8)", border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" } }, "Guardar cambios")
    ),

    // Leave
    React.createElement("div", { style:{ background:"rgba(251,146,60,0.05)", border:"1px solid rgba(251,146,60,0.15)", borderRadius:20, padding:"18px", marginBottom:12 } },
      React.createElement("p", { style:{ color:"#fb923c", fontWeight:600, fontSize:14, margin:"0 0 4px" } }, "🚪 Salir del viaje"),
      React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"0 0 12px" } }, "Volvés al inicio. El viaje sigue existiendo."),
      React.createElement("button", { onClick:onLeave, style:{ width:"100%", padding:"12px", background:"rgba(251,146,60,0.15)", border:"1px solid rgba(251,146,60,0.3)", borderRadius:12, color:"#fb923c", fontWeight:600, fontSize:14, cursor:"pointer" } }, "Salir del viaje")
    ),

    // Danger
    React.createElement("div", { style:{ background:"rgba(248,113,113,0.05)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:20, padding:"18px" } },
      React.createElement("p", { style:{ color:"#f87171", fontWeight:600, fontSize:14, margin:"0 0 4px" } }, "⚠️ Zona peligrosa"),
      React.createElement("p", { style:{ color:"#64748b", fontSize:12, margin:"0 0 12px" } }, "Borra todas las reservas, gastos y alertas."),
      !conf
        ? React.createElement("button", { onClick:function(){setConf(true);}, style:{ width:"100%", padding:"12px", background:"rgba(248,113,113,0.15)", border:"1px solid rgba(248,113,113,0.3)", borderRadius:12, color:"#f87171", fontWeight:600, fontSize:14, cursor:"pointer" } }, "Borrar todos los datos")
        : React.createElement("div", { style:{ display:"flex", gap:8 } },
            React.createElement("button", { onClick:function(){setConf(false);}, style:{ flex:1, padding:"12px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:12, color:"#94a3b8", fontWeight:600, fontSize:13, cursor:"pointer" } }, "Cancelar"),
            React.createElement("button", { onClick:function(){ onReset(); setConf(false); }, style:{ flex:1, padding:"12px", background:"#f87171", border:"none", borderRadius:12, color:"#fff", fontWeight:700, fontSize:13, cursor:"pointer" } }, "Sí, borrar")
          )
    )
  );
}

// ── Home Screen ──
function HomeScreen({ onEnter, onCreate }) {
  var th = useTheme();
  var dark = th.dark;
  var codeSt = useState(""); var code = codeSt[0]; var setCode = codeSt[1];
  var errSt = useState(""); var err = errSt[0]; var setErr = errSt[1];
  var savedSt = useState([]); var saved = savedSt[0]; var setSaved = savedSt[1];

  useEffect(function() {
    try { var r = localStorage.getItem("my_trips"); if(r) setSaved(JSON.parse(r)); } catch(e) {}
  }, []);

  function handleEnter() {
    var c = code.trim().toUpperCase();
    if (c.length < 4) { setErr("Ingresá un código válido"); return; }
    setErr(""); onEnter(c);
  }

  var bg = dark ? "#060b14" : "#f0f4f8";
  var textColor = dark ? "#f8fafc" : "#0f172a";
  var cardBg = dark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  var cardBorder = dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.10)";

  return React.createElement("div", { style:{ fontFamily:"'Outfit','DM Sans',sans-serif", background:bg, minHeight:"100vh", maxWidth:430, margin:"0 auto", padding:"0", position:"relative", overflow:"hidden" } },
    // Ambient blobs
    React.createElement("div", { style:{ position:"fixed", top:"-20%", left:"-10%", width:"70%", height:"70%", borderRadius:"50%", background:"radial-gradient(ellipse,rgba(56,189,248,0.12) 0%,transparent 65%)", pointerEvents:"none" } }),
    React.createElement("div", { style:{ position:"fixed", top:"10%", right:"-15%", width:"60%", height:"60%", borderRadius:"50%", background:"radial-gradient(ellipse,rgba(129,140,248,0.10) 0%,transparent 65%)", pointerEvents:"none" } }),

    React.createElement("div", { style:{ position:"relative", zIndex:1, padding:"72px 28px 48px" } },
      // Logo
      React.createElement("div", { style:{ textAlign:"center", marginBottom:52 } },
        React.createElement("div", { style:{ display:"inline-flex", alignItems:"center", justifyContent:"center", width:80, height:80, borderRadius:24, background:"linear-gradient(135deg,rgba(56,189,248,0.15),rgba(129,140,248,0.15))", border:"1px solid rgba(56,189,248,0.2)", marginBottom:20 } },
          React.createElement("span", { style:{ fontSize:38 } }, "🌍")
        ),
        React.createElement("h1", { style:{ color:textColor, fontSize:36, fontWeight:900, margin:"0 0 8px", letterSpacing:-1.5 } }, "Vamo"),
        React.createElement("p", { style:{ color:"#475569", fontSize:15, margin:0 } }, "Organizá tu viaje con tu grupo")
      ),

      // Create button
      React.createElement("button", { onClick:onCreate, style:{ width:"100%", padding:"18px 24px", background:"linear-gradient(135deg,#38bdf8 0%,#818cf8 100%)", border:"none", borderRadius:20, color:"#fff", fontWeight:700, fontSize:17, cursor:"pointer", marginBottom:14, display:"flex", alignItems:"center", justifyContent:"center", gap:12, boxShadow:"0 8px 32px rgba(56,189,248,0.35)" } },
        React.createElement("span", { style:{ fontSize:22 } }, "✈️"),
        "Crear nuevo viaje"
      ),

      // Join card
      React.createElement("div", { style:{ background:cardBg, border:"1px solid "+cardBorder, borderRadius:20, padding:"22px", marginBottom:24 } },
        React.createElement("p", { style:{ color:"#64748b", fontWeight:600, fontSize:11, margin:"0 0 14px", textTransform:"uppercase", letterSpacing:1.5 } }, "🔑 Unirse con código"),
        React.createElement("div", { style:{ display:"flex", gap:10 } },
          React.createElement("input", { placeholder:"ABC123", value:code, onChange:function(e){ setCode(e.target.value.toUpperCase()); setErr(""); }, onKeyDown:function(e){ if(e.key==="Enter") handleEnter(); },
            style:Object.assign({},inputSt,{ marginBottom:0, flex:1, textTransform:"uppercase", letterSpacing:4, fontWeight:800, fontSize:18, textAlign:"center", fontFamily:"monospace" })
          }),
          React.createElement("button", { onClick:handleEnter, style:{ background:"linear-gradient(135deg,rgba(56,189,248,0.12),rgba(129,140,248,0.12))", border:"1px solid rgba(56,189,248,0.25)", borderRadius:14, padding:"0 20px", color:"#38bdf8", fontWeight:700, fontSize:14, cursor:"pointer", flexShrink:0 } }, "Entrar")
        ),
        err && React.createElement("p", { style:{ color:"#f87171", fontSize:12, margin:"10px 0 0", textAlign:"center" } }, err)
      ),

      // Saved trips
      saved.length > 0 && React.createElement("div", null,
        React.createElement("p", { style:{ color:"#334155", fontSize:11, textTransform:"uppercase", letterSpacing:2, margin:"0 0 12px", textAlign:"center" } }, "Recientes"),
        saved.map(function(c) {
          return React.createElement("button", { key:c, onClick:function(){ onEnter(c); }, style:{ width:"100%", background:cardBg, border:"1px solid "+cardBorder, borderRadius:16, padding:"14px 18px", cursor:"pointer", display:"flex", alignItems:"center", gap:14, marginBottom:10 } },
            React.createElement("div", { style:{ width:40, height:40, borderRadius:12, background:"linear-gradient(135deg,rgba(56,189,248,0.15),rgba(129,140,248,0.15))", border:"1px solid rgba(56,189,248,0.15)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 } }, "🗺️"),
            React.createElement("div", { style:{ flex:1, textAlign:"left" } },
              React.createElement("p", { style:{ color:textColor, fontWeight:600, fontSize:14, margin:0 } }, "Viaje guardado"),
              React.createElement("p", { style:{ color:"#475569", fontSize:12, margin:"2px 0 0", fontFamily:"monospace", letterSpacing:2 } }, c)
            ),
            React.createElement("div", { style:{ width:32, height:32, borderRadius:10, background:"rgba(56,189,248,0.1)", display:"flex", alignItems:"center", justifyContent:"center", color:"#38bdf8", fontSize:14 } }, "→")
          );
        })
      ),

      React.createElement("p", { style:{ color:"#1e293b", fontSize:11, textAlign:"center", marginTop:32 } }, "Cada viaje tiene un código único · Compartilo con tu grupo")
    )
  );
}

// ── NAV config ──
var NAV = [
  { id:"viaje",     icon:"🗺️",  label:"Viaje" },
  { id:"checklist", icon:"✅",  label:"Lista" },
  { id:"clima",     icon:"🌤️", label:"Clima" },
  { id:"conversor", icon:"💱",  label:"Cambio" },
  { id:"alertas",   icon:"🔔",  label:"Alertas" },
  { id:"config",    icon:"⚙️",  label:"Config" },
];

// ── Main App ──
export default function App() {
  var darkSt = useState(function(){ try{ return localStorage.getItem("vamo_theme")!=="light"; }catch(e){ return true; } });
  var dark = darkSt[0]; var setDark = darkSt[1];

  function toggleTheme() {
    setDark(function(d) {
      var nd = !d;
      try { localStorage.setItem("vamo_theme", nd?"dark":"light"); } catch(e) {}
      return nd;
    });
  }

  var screenSt = useState("home"); var screen = screenSt[0]; var setScreen = screenSt[1];
  var codeSt = useState(""); var tripCode = codeSt[0]; var setTripCode = codeSt[1];
  var dataSt = useState(null); var data = dataSt[0]; var setData = dataSt[1];
  var navSt = useState("viaje"); var nav = navSt[0]; var setNav = navSt[1];
  var secSt = useState("alojamiento"); var activeSection = secSt[0]; var setActiveSection = secSt[1];
  var selSt = useState(null); var selectedItem = selSt[0]; var setSelectedItem = selSt[1];
  var addSt = useState(false); var showAdd = addSt[0]; var setShowAdd = addSt[1];
  var syncSt = useState("conectando"); var syncStatus = syncSt[0]; var setSyncStatus = syncSt[1];
  var nfSt = useState(false); var notFound = nfSt[0]; var setNotFound = nfSt[1];

  function saveToLocal(code) {
    try {
      var r = localStorage.getItem("my_trips");
      var l = r ? JSON.parse(r) : [];
      if (!l.includes(code)) { l.unshift(code); localStorage.setItem("my_trips", JSON.stringify(l.slice(0,10))); }
    } catch(e) {}
  }

  useEffect(function() {
    if (!tripCode) return;
    var ref = doc(db, "viajes", tripCode);
    var unsub = onSnapshot(ref,
      function(snap) {
        if (snap.exists()) { setData(snap.data()); setSyncStatus("sincronizado"); setNotFound(false); }
        else { setSyncStatus("sincronizado"); setNotFound(true); }
      },
      function() { setSyncStatus("error"); }
    );
    return function() { unsub(); };
  }, [tripCode]);

  function saveFB(nd) {
    setDoc(doc(db,"viajes",nd.tripCode), nd).catch(function(e){ console.error(e); });
  }

  function updateField(field, value) {
    if (!data) return;
    var nd = Object.assign({}, data, { [field]: value });
    setData(nd); saveFB(nd);
  }

  function updateMultiple(fields) {
    if (!data) return;
    var nd = Object.assign({}, data, fields);
    setData(nd); saveFB(nd);
  }

  function updateItems(section, newItems) {
    if (!data) return;
    var newItemsObj = Object.assign({}, data.items, { [section]: newItems });
    var nd = Object.assign({}, data, { items: newItemsObj });
    setData(nd); saveFB(nd);
  }

  function handleReset() {
    if (!data) return;
    var nd = Object.assign({}, data, {
      items:{ vuelos:[], alojamiento:[], auto:[], excursiones:[], entradas:[], documentos:[] },
      expenses:[], alertas:[], checklist:[],
    });
    setData(nd); saveFB(nd);
  }

  function handleCreate() {
    var code = genCode();
    var trip = emptyTrip(code);
    setTripCode(code); setData(trip);
    saveFB(trip); saveToLocal(code);
    setScreen("trip"); setNav("config");
  }

  function handleEnter(code) {
    setTripCode(code); setNotFound(false); setSyncStatus("conectando");
    saveToLocal(code); setScreen("trip");
  }

  function handleLeave() {
    setScreen("home"); setTripCode(""); setData(null); setNav("viaje");
  }

  var currentSection = SECTIONS.find(function(s){ return s.id===activeSection; });
  var currentItems = data ? (data.items[activeSection] || []) : [];
  var totalGrupo = data ? data.expenses.reduce(function(s,e){ return s+e.total; }, 0) : 0;
  var pendingAlertas = data ? (data.alertas||[]).filter(function(a){ return a.activa&&a.fecha&&new Date(a.fecha)>=new Date(); }).length : 0;

  function saveItem(item) {
    var ex = currentItems.find(function(i){ return i.id===item.id; });
    updateItems(activeSection, ex ? currentItems.map(function(i){ return i.id===item.id?item:i; }) : currentItems.concat([item]));
  }
  function deleteItem(id) { updateItems(activeSection, currentItems.filter(function(i){ return i.id!==id; })); }

  var T = theme(dark);

  // ── Render ──
  if (screen === "home") return React.createElement(ThemeCtx.Provider, { value:{ dark:dark, toggle:toggleTheme } },
    React.createElement(HomeScreen, { onEnter:handleEnter, onCreate:handleCreate })
  );

  if (!data) return React.createElement(ThemeCtx.Provider, { value:{ dark:dark, toggle:toggleTheme } },
    React.createElement("div", { style:{ fontFamily:"'Outfit',sans-serif", background:T.bg, minHeight:"100vh", maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"40px 24px" } },
      notFound
        ? React.createElement("div", { style:{ textAlign:"center" } },
            React.createElement("div", { style:{ fontSize:48, marginBottom:16 } }, "🔍"),
            React.createElement("h2", { style:{ color:T.text, margin:"0 0 8px", fontWeight:800 } }, "Viaje no encontrado"),
            React.createElement("p", { style:{ color:T.text2, textAlign:"center", margin:"0 0 24px" } }, "No existe el código ", React.createElement("strong", { style:{ color:"#38bdf8" } }, tripCode)),
            React.createElement("button", { onClick:handleLeave, style:{ padding:"14px 32px", background:"linear-gradient(135deg,#38bdf8,#818cf8)", border:"none", borderRadius:16, color:"#fff", fontWeight:700, fontSize:14, cursor:"pointer" } }, "Volver al inicio")
          )
        : React.createElement("div", { style:{ textAlign:"center" } },
            React.createElement("div", { style:{ fontSize:48, marginBottom:16 } }, "⏳"),
            React.createElement("p", { style:{ color:T.text2, fontSize:14 } }, "Conectando con el viaje..."),
            React.createElement("p", { style:{ color:T.text3, fontSize:13, letterSpacing:3, marginTop:8, fontFamily:"monospace" } }, tripCode)
          )
    )
  );

  var secColor = currentSection ? currentSection.color : "#38bdf8";

  return React.createElement(ThemeCtx.Provider, { value:{ dark:dark, toggle:toggleTheme } },
    React.createElement("div", { style:{ fontFamily:"'Outfit','DM Sans',sans-serif", background:T.bg, minHeight:"100vh", maxWidth:430, margin:"0 auto", position:"relative", overflow:"hidden" } },
      // Blobs
      React.createElement("div", { style:{ position:"fixed", top:-120, right:-120, width:360, height:360, borderRadius:"50%", background:"radial-gradient(ellipse,rgba(56,189,248,0.10) 0%,transparent 65%)", pointerEvents:"none", zIndex:0 } }),
      React.createElement("div", { style:{ position:"fixed", bottom:40, left:-100, width:300, height:300, borderRadius:"50%", background:"radial-gradient(ellipse,rgba(167,139,250,0.09) 0%,transparent 65%)", pointerEvents:"none", zIndex:0 } }),

      // Header
      React.createElement("div", { style:{ padding:"52px 24px 16px", position:"relative", zIndex:1 } },
        React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" } },
          React.createElement("div", { style:{ flex:1 } },
            React.createElement("div", { style:{ display:"flex", alignItems:"center", gap:8, marginBottom:2 } },
              React.createElement("button", { onClick:handleLeave, style:{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#94a3b8", cursor:"pointer", fontSize:14, padding:"6px 10px", marginRight:4 } }, "←"),
              React.createElement("p", { style:{ color:T.text2, fontSize:11, letterSpacing:2, textTransform:"uppercase", margin:0 } }, data.tripCode),
              React.createElement("span", { style:{ fontSize:9, fontWeight:700, padding:"3px 8px", borderRadius:99, letterSpacing:0.3,
                background:syncStatus==="sincronizado"?"#4ade8022":syncStatus==="error"?"#f8717122":"#facc1522",
                color:syncStatus==="sincronizado"?"#4ade80":syncStatus==="error"?"#f87171":"#facc15",
                border:"1px solid "+(syncStatus==="sincronizado"?"#4ade8044":syncStatus==="error"?"#f8717144":"#facc1544"),
              } }, syncStatus==="sincronizado"?"● En vivo":syncStatus==="error"?"● Sin conexión":"● Conectando...")
            ),
            React.createElement("h1", { style:{ color:T.text, fontSize:26, fontWeight:900, margin:"4px 0 0", letterSpacing:-1 } }, data.tripName),
            React.createElement("p", { style:{ color:T.text2, fontSize:13, margin:"4px 0 0" } }, data.dates + " · " + data.members.length + " " + (data.members.length===1?"viajero":"viajeros"))
          ),
          totalGrupo > 0 && React.createElement("div", { style:{ background:"linear-gradient(135deg,#38bdf8,#818cf8)", borderRadius:16, padding:"10px 16px", textAlign:"center", flexShrink:0, boxShadow:"0 4px 20px rgba(56,189,248,0.3)" } },
            React.createElement("p", { style:{ color:"#fff", fontSize:10, margin:0, opacity:0.8 } }, "Total"),
            React.createElement("p", { style:{ color:"#fff", fontSize:16, fontWeight:700, margin:"1px 0 0" } }, data.currency + totalGrupo.toLocaleString())
          )
        ),
        React.createElement("div", { style:{ display:"flex", gap:8, marginTop:14, alignItems:"center" } },
          data.members.slice(0,6).map(function(m, i){ return React.createElement(Avt, { key:m, name:m, color:gc(i), size:30 }); }),
          data.members.length > 6 && React.createElement("span", { style:{ color:T.text2, fontSize:12 } }, "+" + (data.members.length-6))
        )
      ),

      // Content
      React.createElement("div", { style:{ position:"relative", zIndex:1 } },
        nav === "viaje" && React.createElement("div", null,
          // Section tabs
          React.createElement("div", { style:{ display:"flex", gap:8, padding:"0 24px 18px", overflowX:"auto", scrollbarWidth:"none" } },
            SECTIONS.map(function(sec) {
              var active = activeSection===sec.id;
              return React.createElement("button", { key:sec.id, onClick:function(){ setActiveSection(sec.id); },
                style:{ flex:"0 0 auto", background:active?(sec.color+"20"):"rgba(255,255,255,0.04)",
                  border:active?("1.5px solid "+sec.color+"55"):"1.5px solid rgba(255,255,255,0.06)",
                  borderRadius:14, padding:"8px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:7,
                  boxShadow:active?("0 4px 16px rgba(0,0,0,0.4)"):"none", transition:"all 0.2s" }
              },
                React.createElement("span", { style:{ fontSize:15 } }, sec.icon),
                React.createElement("span", { style:{ fontSize:12, fontWeight:700, color:active?sec.color:T.text3, whiteSpace:"nowrap" } }, sec.label)
              );
            })
          ),
          // Section content
          activeSection === "gastos"
            ? React.createElement(GastosView, { expenses:data.expenses, onUpdate:updateField, members:data.members, currency:data.currency })
            : React.createElement("div", { style:{ padding:"0 24px 130px" } },
                React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 } },
                  React.createElement("h2", { style:{ color:T.text, fontSize:18, fontWeight:800, margin:0, letterSpacing:-0.3 } }, currentSection ? currentSection.icon + " " + currentSection.label : ""),
                  React.createElement("button", { onClick:function(){setShowAdd(true);}, style:{ background:secColor+"15", border:"1px solid "+secColor+"35", borderRadius:12, width:36, height:36, color:secColor, fontSize:20, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px "+secColor+"25" } }, "+")
                ),
                currentItems.length===0 && React.createElement(Empty, { icon:currentSection?currentSection.icon:"📋", text:"Sin reservas. Toca el + para agregar." }),
                currentItems.map(function(item) {
                  var est = ESTADOS[item.estado] || ESTADOS.pendiente;
                  var att = item.attachments || {};
                  var hasAtt = att.link || att.foto || att.archivo;
                  return React.createElement("div", { key:item.id, onClick:function(){setSelectedItem(item);},
                    style:{ background:T.bg3, border:"1px solid "+(hasAtt?(secColor+"33"):T.border), borderRadius:18, padding:"16px 18px", cursor:"pointer", marginBottom:12, boxShadow:T.cardShadow||"none" }
                  },
                    React.createElement("div", { style:{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:6 } },
                      React.createElement("div", { style:{ flex:1, marginRight:10 } },
                        React.createElement("p", { style:{ color:T.text, fontWeight:700, fontSize:15, margin:0, letterSpacing:-0.2 } }, getTitle(activeSection, item)),
                        getDateLine(activeSection, item) && React.createElement("p", { style:{ color:T.text2, fontSize:12, margin:"4px 0 0" } }, getDateLine(activeSection, item)),
                        getSummary(activeSection, item) && React.createElement("p", { style:{ color:T.text3, fontSize:11, margin:"2px 0 0" } }, getSummary(activeSection, item))
                      ),
                      React.createElement("div", { style:{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 } },
                        React.createElement("span", { style:{ background:est.bg, color:est.color, fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:99, letterSpacing:0.3 } }, est.label),
                        item.precio && React.createElement("p", { style:{ color:secColor, fontWeight:800, fontSize:15, margin:0 } }, data.currency + item.precio)
                      )
                    ),
                    hasAtt && React.createElement("div", { style:{ display:"flex", gap:6, marginTop:10, flexWrap:"wrap" } },
                      att.link && React.createElement("span", { style:{ background:secColor+"12", color:secColor, fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:99 } }, "🔗 Link"),
                      att.foto && React.createElement("span", { style:{ background:"rgba(250,204,21,0.10)", color:"#facc15", fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:99 } }, "📸 Foto"),
                      att.archivo && React.createElement("span", { style:{ background:"rgba(167,139,250,0.10)", color:"#a78bfa", fontSize:10, fontWeight:700, padding:"4px 10px", borderRadius:99 } }, "📄 " + (att.archivoNombre || "Archivo"))
                    ),
                    React.createElement("p", { style:{ color:T.text3, fontSize:10, margin:"8px 0 0", textAlign:"right", letterSpacing:0.3 } }, "Toca para ver / editar →")
                  );
                })
              )
        ),
        nav === "grupo"     && React.createElement(GrupoView,     { members:data.members, expenses:data.expenses, currency:data.currency }),
        nav === "alertas"   && React.createElement(AlertasView,   { alertas:data.alertas||[], onUpdate:updateField }),
        nav === "checklist" && React.createElement(ChecklistView, { checklist:data.checklist||[], members:data.members, onUpdate:updateField }),
        nav === "clima"     && React.createElement(ClimaView,     {}),
        nav === "conversor" && React.createElement(ConversorView, { currency:data.currency }),
        nav === "config"    && React.createElement(ConfigView,    { data:data, onUpdate:updateMultiple, onReset:handleReset, onLeave:handleLeave }),
      ),

      // Bottom nav
      React.createElement("div", { style:{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:T.nav, backdropFilter:"blur(24px) saturate(180%)", borderTop:"1px solid "+T.navBorder, padding:"10px 12px 28px", display:"flex", justifyContent:"space-around", zIndex:10 } },
        NAV.map(function(n) {
          var active = nav===n.id;
          return React.createElement("button", { key:n.id, onClick:function(){ setNav(n.id); },
            style:{ background:"none", border:"none", display:"flex", flexDirection:"column", alignItems:"center", gap:4, cursor:"pointer", position:"relative" }
          },
            React.createElement("span", { style:{ fontSize:20 } }, n.icon),
            React.createElement("span", { style:{ color:active?"#38bdf8":T.text3, fontSize:9, fontWeight:700, letterSpacing:0.2 } }, n.label),
            n.id==="alertas" && pendingAlertas>0 && React.createElement("span", { style:{ position:"absolute", top:-4, right:-6, background:"linear-gradient(135deg,#f87171,#fb923c)", color:"#fff", fontSize:8, fontWeight:800, borderRadius:99, padding:"2px 5px", boxShadow:"0 2px 8px rgba(248,113,113,0.5)" } }, pendingAlertas),
            active && React.createElement("div", { style:{ position:"absolute", bottom:-12, width:20, height:3, background:"linear-gradient(90deg,#38bdf8,#818cf8)", borderRadius:99, boxShadow:"0 0 8px rgba(56,189,248,0.6)" } })
          );
        })
      ),

      // Modals
      selectedItem && React.createElement(ItemModal, {
        item:selectedItem, section:activeSection, color:secColor,
        onClose:function(){ setSelectedItem(null); },
        onSave:function(item){ saveItem(item); setSelectedItem(null); },
        onDelete:function(){ deleteItem(selectedItem.id); setSelectedItem(null); },
      }),
      showAdd && activeSection !== "gastos" && React.createElement(Sheet, { onClose:function(){ setShowAdd(false); } },
        React.createElement(STitle, { onClose:function(){ setShowAdd(false); } }, "Agregar " + (currentSection?currentSection.icon+" "+currentSection.label:"")),
        React.createElement(ItemForm, { section:activeSection, onSave:function(item){ saveItem(item); setShowAdd(false); }, onClose:function(){ setShowAdd(false); } })
      )
    )
  );
}
