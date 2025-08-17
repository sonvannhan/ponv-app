// src/App.js
// PONV Tracker - Full App.js
// Dependencies: firebase, xlsx
// npm install firebase xlsx

import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";

/* ================= Firebase config ================= */
const firebaseConfig = {
  apiKey: "AIzaSyBBnK4v8Vm64zXN7W2HYnRx19gKRuuFTcU",
  authDomain: "ponv-tracker.firebaseapp.com",
  projectId: "ponv-tracker",
  storageBucket: "ponv-tracker.firebasestorage.app",
  messagingSenderId: "295019782369",
  appId: "1:295019782369:web:4309b3debefa6955c717a0",
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ================= DEFAULT SCHEMA / DEFAULT_FORM =================
   Dùng để đảm bảo nâng cấp dữ liệu cũ (mergeDefaults)
*/
const DEFAULT_FORM = {
  // Thông tin bệnh nhân
  name: "",
  age: "",
  gender: "", // "Nam" | "Nữ"
  surgeryDate: "", // YYYY-MM-DD
  surgeryTime: "", // HH:MM (24h)
  pacuOutTime: "", // HH:MM
  extubationTime: "", // HH:MM

  // Tiền sử (checkbox)
  history: {
    motionSickness: false, // say tàu xe
    smoking: false, // hút thuốc
    prevPONV: false, // tiền sử PONV sau mổ
  },

  // Trong mổ / hồi sức
  bloodLossMl: "",
  fluidsMl: "",
  lastMealTime: "",
  firstDrinkTime: "",
  chestDrainCount: "",

  // Giải giãn cơ & giảm đau
  reversalAgent: "", // Bridion | Neostigmin
  postop: {
    morphineUse: false,
    morphineDoseMg: "",
    analgesiaMethod: "", // "Tê NMC"|"ESP"|"PCA"|"Khác"
    analgesic1: "",
    analgesic1Conc: "",
    analgesic2: "",
    analgesic2Conc: "",
  },

  // PONV theo 3 mốc
  ponv: {
    p0_6: { present: false, times: "", severity: "" },
    p7_24: { present: false, times: "", severity: "" },
    p_gt24: { present: false, times: "", severity: "" },
  },

  // Lâm sàng (VAS / HA / Nhiệt) - 4 mốc
  clinical: {
    vas: { p0_6: "", p7_24: "", day2: "", day3: "" },
    bp: { p0_6: "", p7_24: "", day2: "", day3: "" },
    temp: { p0_6: "", p7_24: "", day2: "", day3: "" },
  },

  // Triệu chứng theo 4 mốc (checkbox)
  symptoms: {
    epigastric: { p0_6: false, p7_24: false, day2: false, day3: false },
    headache: { p0_6: false, p7_24: false, day2: false, day3: false },
    retention: { p0_6: false, p7_24: false, day2: false, day3: false },
  },

  // Thuốc theo mốc (liều vasopressor & liều hạ áp)
  meds: {
    vasopressors: { p0_6: "", p7_24: "", day2: "", day3: "" },
    antihypert: { p0_6: "", p7_24: "", day2: "", day3: "" },
  },

  // Ghi chú
  symptomsNote: "",
  notes: "",

  // metadata
  timeSaved: "",
};

/* ================= Utility functions ================= */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepGet(obj, path) {
  if (!obj || !path) return undefined;
  return path.split(".").reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

function deepSet(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

// Merge defaults into record: keep record values but add missing keys from DEFAULT_FORM
function mergeDefaults(record) {
  const out = clone(DEFAULT_FORM);
  function overlay(target, src) {
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach((key) => {
      if (src[key] && typeof src[key] === "object" && !Array.isArray(src[key])) {
        if (!target[key] || typeof target[key] !== "object") target[key] = {};
        overlay(target[key], src[key]);
      } else {
        target[key] = src[key];
      }
    });
  }
  overlay(out, record || {});
  return out;
}

// Normalize time string on blur: accept short inputs like "9" => "09:00", "9:5" => "09:05", "09" => "09:00"
function normalizeTimeInput(val) {
  if (!val && val !== "") return "";
  // If already in HH:MM, ensure two-digit parts
  if (typeof val !== "string") return "";
  val = val.trim();
  if (val === "") return "";
  // If input contains ":" treat as HH:MM (or H:MM)
  if (val.includes(":")) {
    const parts = val.split(":").map((p) => p.trim());
    let hh = parts[0].padStart(2, "0").slice(-2);
    let mm = (parts[1] || "00").padStart(2, "0").slice(0,2);
    // clamp
    const hnum = Math.max(0, Math.min(23, parseInt(hh || "0", 10)));
    const mnum = Math.max(0, Math.min(59, parseInt(mm || "0", 10)));
    return `${String(hnum).padStart(2,"0")}:${String(mnum).padStart(2,"0")}`;
  }
  // If 4 digits like "0900"
  if (/^\d{4}$/.test(val)) {
    const hh = val.slice(0,2);
    const mm = val.slice(2,4);
    return normalizeTimeInput(`${hh}:${mm}`);
  }
  // If 1-2 digits => hour only
  if (/^\d{1,2}$/.test(val)) {
    const hh = String(parseInt(val,10)).padStart(2, "0");
    return `${hh}:00`;
  }
  // If 3 digits, e.g., '930' -> '09:30'
  if (/^\d{3}$/.test(val)) {
    const hh = val.slice(0,1).padStart(2,"0");
    const mm = val.slice(1,3);
    return normalizeTimeInput(`${hh}:${mm}`);
  }
  // fallback: try parse with Date
  return "";
}

// Format time value to "HH:MM" for export (handles strings, Dates, ISO datetimes, short forms)
function formatTimeForExport(val) {
  if (val === null || val === undefined || val === "") return "";
  // Date object
  if (val instanceof Date) {
    const h = String(val.getHours()).padStart(2, "0");
    const m = String(val.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  }
  // If already a string
  if (typeof val === "string") {
    const s = val.trim();
    if (s === "") return "";
    // already HH:MM
    if (/^\d{1,2}:\d{1,2}$/.test(s)) {
      const parts = s.split(":");
      const hh = String(Math.max(0, Math.min(23, parseInt(parts[0] || "0", 10)))).padStart(2, "0");
      const mm = String(Math.max(0, Math.min(59, parseInt(parts[1] || "0", 10)))).padStart(2, "0");
      return `${hh}:${mm}`;
    }
    // 4 digits like "0900"
    if (/^\d{4}$/.test(s)) {
      return formatTimeForExport(`${s.slice(0,2)}:${s.slice(2)}`);
    }
    // 3 digits like "930"
    if (/^\d{3}$/.test(s)) {
      return formatTimeForExport(`${s.slice(0,1).padStart(2,"0")}:${s.slice(1)}`);
    }
    // 1-2 digits => hour only
    if (/^\d{1,2}$/.test(s)) {
      return `${String(parseInt(s,10)).padStart(2,"0")}:00`;
    }
    // ISO datetime or other date string -> try Date parse
    if (s.includes("T") || s.includes("-")) {
      const d = new Date(s);
      if (!isNaN(d)) {
        return formatTimeForExport(d);
      }
    }
    // fallback: try normalizeTimeInput
    const tried = normalizeTimeInput(s);
    return tried || s;
  }
  return "";
}

/* ================= UI small components ================= */
const Card = ({ title, children }) => (
  <div style={styles.card}>
    <div style={styles.cardTitle}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
  </div>
);

const Row = ({ children, cols = "repeat(auto-fit, minmax(220px, 1fr))" }) => (
  <div style={{ display: "grid", gap: 10, gridTemplateColumns: cols }}>{children}</div>
);

const Col = ({ children, style }) => <div style={style}>{children}</div>;

const Label = ({ children }) => <label style={{ display: "block", marginBottom: 6, color: "#1f2937" }}>{children}</label>;

const Input = (props) => <input {...props} style={{ ...styles.input, ...(props.style || {}) }} />;

const Select = ({ options = [], ...props }) => (
  <select {...props} style={{ ...styles.input }}>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

const Check = ({ label, ...props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, borderRadius: 8 }}>
    <input type="checkbox" {...props} />
    <span>{label}</span>
  </label>
);

/* ================= Main App ================= */
export default function App() {
  const colRef = useMemo(() => collection(db, "ponv_records"), []);

  const [form, setForm] = useState(clone(DEFAULT_FORM));
  const [records, setRecords] = useState([]);
  const [editId, setEditId] = useState(null);

  // filters
  const [searchName, setSearchName] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    loadRecords();
    // eslint-disable-next-line
  }, []);

  async function loadRecords() {
    try {
      const q = query(colRef, orderBy("surgeryDate", "desc"));
      const snap = await getDocs(q);
      const arr = snap.docs.map(d => mergeDefaults({ id: d.id, ...d.data() }));
      setRecords(arr);
    } catch (err) {
      console.error("loadRecords:", err);
      alert("Lỗi khi tải dữ liệu, xem console");
    }
  }

  // generic change handler (supports nested names with dot)
  function handleChange(e) {
    const { name, type } = e.target;
    const value = type === "checkbox" ? e.target.checked : e.target.value;
    setForm(prev => {
      const next = clone(prev);
      if (name.includes(".")) deepSet(next, name, value);
      else next[name] = value;
      return next;
    });
  }

  // onBlur for time inputs: normalize
  function handleTimeBlur(e) {
    const { name, value } = e.target;
    const norm = normalizeTimeInput(value);
    if (norm !== value) {
      setForm(prev => {
        const next = clone(prev);
        if (name.includes(".")) deepSet(next, name, norm);
        else next[name] = norm;
        return next;
      });
    }
  }

  async function handleSave(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!form.name) { alert("Vui lòng nhập Họ tên"); return; }

  // clone form then normalize time-like fields to HH:MM
  const payload = clone(form);

  // Normalize commonly used time fields so Firestore stores consistent "HH:MM" strings
  payload.surgeryTime = formatTimeForExport(payload.surgeryTime);
  payload.pacuOutTime = formatTimeForExport(payload.pacuOutTime);
  payload.extubationTime = formatTimeForExport(payload.extubationTime);
  //payload.lastMealTime = formatTimeForExport(payload.lastMealTime);
  payload.firstDrinkTime = formatTimeForExport(payload.firstDrinkTime);

  // also ensure PONV times (if user put strange values)
  if (payload.ponv) {
    if (payload.ponv.p0_6) payload.ponv.p0_6.times = payload.ponv.p0_6.times || "";
    if (payload.ponv.p7_24) payload.ponv.p7_24.times = payload.ponv.p7_24.times || "";
    if (payload.ponv.p_gt24) payload.ponv.p_gt24.times = payload.ponv.p_gt24.times || "";
  }

  payload.timeSaved = new Date().toISOString();

  try {
    if (editId) {
      // merge so old fields not lost
      await setDoc(doc(db, "ponv_records", editId), payload, { merge: true });
      setEditId(null);
    } else {
      await addDoc(colRef, payload);
    }
    setForm(clone(DEFAULT_FORM));
    await loadRecords();
    alert("Đã lưu");
  } catch (err) {
    console.error("save error:", err);
    alert("Lỗi khi lưu (xem console)");
  }
}


  function startEdit(rec) {
    setForm(mergeDefaults(rec));
    setEditId(rec.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
  const password = prompt("Nhập mật khẩu để xác nhận xóa:");
  if (password !== "123456") {  // ← Bạn có thể đổi mật khẩu tại đây
    alert("Không thể xóa. Cần nhập đúng mật khẩu.");
    return;
  }

  try {
    await deleteDoc(doc(db, "ponv_records", id));
    await loadRecords();
    alert("Đã xóa thành công.");
  } catch (err) {
    console.error("delete error:", err);
    alert("Lỗi khi xóa");
  }
}


  function clearFilters() {
    setSearchName("");
    setDateFrom("");
    setDateTo("");
  }

  // filtering list
  const filtered = records.filter(r => {
    const nameOk = !searchName || (r.name || "").toLowerCase().includes(searchName.toLowerCase());
    let fromOk = true, toOk = true;
    if (dateFrom) fromOk = !!r.surgeryDate && r.surgeryDate >= dateFrom;
    if (dateTo) toOk = !!r.surgeryDate && r.surgeryDate <= dateTo;
    return nameOk && fromOk && toOk;
  });

  // export to excel, flatten rows
function exportExcel() {
  try {
    const headers = [
      "STT",
      "Tên bệnh nhân",
      "Tuổi",
      "Giới tính",
      "Ngày mổ",
      "Giờ phẫu thuật",
      "Giờ ra HS (PACU)",
      "Giờ rút NKQ",
      "Lần ăn cuối",
      "Uống lần đầu",
		"Tổng Liều Fentanyl (mcg)",
		"Tổng Liều Fresofol (mg)",
		"Tổng Liều Rocuronium (mg)",
		"Tổng Liều Sevorane",
      "Máu mất trong mổ (ml)",
      "Dịch truyền trong mổ (ml)",
      "Số DL màng phổi",
      "Phương pháp giải giãn cơ",
      "Phương thức giảm đau",
      "Thuốc giảm đau 1",
      "Liều/Nồng độ 1",
      "Thuốc giảm đau 2",
      "Liều/Nồng độ 2",
      "Dùng Morphin",
      "Liều Morphin (mg)",
      "Tiền sử say tàu xe",
      "Hút thuốc",
      "Tiền sử PONV",

      // PONV
      "PONV 0-6h (Có nôn)",
      "PONV 0-6h (Số lần)",
      "PONV 0-6h (Mức độ)",
      "PONV 7-24h (Có nôn)",
      "PONV 7-24h (Số lần)",
      "PONV 7-24h (Mức độ)",
      "PONV >24h (Có nôn)",
      "PONV >24h (Số lần)",
      "PONV >24h (Mức độ)",

      // Symptoms per timepoint (epigastric, headache, retention)
      "Đau thượng vị 0-6h",
      "Đau thượng vị 7-24h",
      "Đau thượng vị Ngày2",
      "Đau thượng vị Ngày3",

      "Đau đầu 0-6h",
      "Đau đầu 7-24h",
      "Đau đầu Ngày2",
      "Đau đầu Ngày3",

      "Bí tiểu 0-6h",
      "Bí tiểu 7-24h",
      "Bí tiểu Ngày2",
      "Bí tiểu Ngày3",

      // Meds per timepoint (vasopressors + antihypert)
      "Vasopressors 0-6h",
      "Vasopressors 7-24h",
      "Vasopressors Ngày2",
      "Vasopressors Ngày3",

      "Antihypert 0-6h",
      "Antihypert 7-24h",
      "Antihypert Ngày2",
      "Antihypert Ngày3",

      // Clinical full (VAS, HA, Temp) already had VAS columns earlier; ensure HA/Temp for all mốc
      "VAS 0-6h",
      "VAS 7-24h",
      "VAS Ngày2",
      "VAS Ngày3",

      "HA 0-6h",
      "HA 7-24h",
      "HA Ngày2",
      "HA Ngày3",

      "Nhiệt 0-6h",
      "Nhiệt 7-24h",
      "Nhiệt Ngày2",
      "Nhiệt Ngày3",

      "Ghi chú triệu chứng",
      "Ghi chú",
      "Thời gian lưu (ISO)"
    ];

    const rows = filtered.map((r, idx) => ({
      "STT": idx + 1,
      "Tên bệnh nhân": r.name || "",
      "Tuổi": r.age || "",
      "Giới tính": r.gender || "",
      "Ngày mổ": r.surgeryDate || "",
      "Giờ phẫu thuật": formatTimeForExport(r.surgeryTime),
      "Giờ ra HS (PACU)": formatTimeForExport(r.pacuOutTime),
      "Giờ rút NKQ": formatTimeForExport(r.extubationTime),
      "Lần ăn cuối": r.lastMealTime || "",
	  "Ghi chú nhịn ăn (nếu có)": r.MealTimenotes || "",
      "Uống lần đầu": formatTimeForExport(r.firstDrinkTime),
		"Tổng Liều Fentanyl (mcg)": r.op?.FentanylDoseMcg || "",
		"Tổng Liều Fresofol (mg)": r.op?.FresofolDoseMg || "",
		"Tổng Liều Rocuronium (mg)": r.op?.RocuroniumDoseMg || "",
		"Tổng Liều Sevorane": r.op?.SevoraneDose || "",
      "Máu mất trong mổ (ml)": r.bloodLossMl || "",
      "Dịch truyền trong mổ (ml)": r.fluidsMl || "",
      "Số DL màng phổi": r.chestDrainCount || "",
      "Phương pháp giải giãn cơ": r.reversalAgent || "",
      "Phương thức giảm đau": r.postop?.analgesiaMethod || "",
      "Thuốc giảm đau 1": r.postop?.analgesic1 || "",
      "Liều/Nồng độ 1": r.postop?.analgesic1Conc || "",
      "Thuốc giảm đau 2": r.postop?.analgesic2 || "",
      "Liều/Nồng độ 2": r.postop?.analgesic2Conc || "",
      "Dùng Morphin": r.postop?.morphineUse ? "Có" : "Không",
      "Liều Morphin (mg)": r.postop?.morphineDoseMg || "",
      "Tiền sử say tàu xe": r.history?.motionSickness ? "Có" : "Không",
      "Hút thuốc": r.history?.smoking ? "Có" : "Không",
      "Tiền sử PONV": r.history?.prevPONV ? "Có" : "Không",

      "PONV 0-6h (Có nôn)": r.ponv?.p0_6?.present ? "Có" : "Không",
      "PONV 0-6h (Số lần)": r.ponv?.p0_6?.times || "",
      "PONV 0-6h (Mức độ)": r.ponv?.p0_6?.severity || "",
      "PONV 7-24h (Có nôn)": r.ponv?.p7_24?.present ? "Có" : "Không",
      "PONV 7-24h (Số lần)": r.ponv?.p7_24?.times || "",
      "PONV 7-24h (Mức độ)": r.ponv?.p7_24?.severity || "",
      "PONV >24h (Có nôn)": r.ponv?.p_gt24?.present ? "Có" : "Không",
      "PONV >24h (Số lần)": r.ponv?.p_gt24?.times || "",
      "PONV >24h (Mức độ)": r.ponv?.p_gt24?.severity || "",

      // Symptoms
      "Đau thượng vị 0-6h": r.symptoms?.epigastric?.p0_6 ? "Có" : "Không",
      "Đau thượng vị 7-24h": r.symptoms?.epigastric?.p7_24 ? "Có" : "Không",
      "Đau thượng vị Ngày2": r.symptoms?.epigastric?.day2 ? "Có" : "Không",
      "Đau thượng vị Ngày3": r.symptoms?.epigastric?.day3 ? "Có" : "Không",

      "Đau đầu 0-6h": r.symptoms?.headache?.p0_6 ? "Có" : "Không",
      "Đau đầu 7-24h": r.symptoms?.headache?.p7_24 ? "Có" : "Không",
      "Đau đầu Ngày2": r.symptoms?.headache?.day2 ? "Có" : "Không",
      "Đau đầu Ngày3": r.symptoms?.headache?.day3 ? "Có" : "Không",

      "Bí tiểu 0-6h": r.symptoms?.retention?.p0_6 ? "Có" : "Không",
      "Bí tiểu 7-24h": r.symptoms?.retention?.p7_24 ? "Có" : "Không",
      "Bí tiểu Ngày2": r.symptoms?.retention?.day2 ? "Có" : "Không",
      "Bí tiểu Ngày3": r.symptoms?.retention?.day3 ? "Có" : "Không",

      // meds
      "Vasopressors 0-6h": r.meds?.vasopressors?.p0_6 || "",
      "Vasopressors 7-24h": r.meds?.vasopressors?.p7_24 || "",
      "Vasopressors Ngày2": r.meds?.vasopressors?.day2 || "",
      "Vasopressors Ngày3": r.meds?.vasopressors?.day3 || "",

      "Antihypert 0-6h": r.meds?.antihypert?.p0_6 || "",
      "Antihypert 7-24h": r.meds?.antihypert?.p7_24 || "",
      "Antihypert Ngày2": r.meds?.antihypert?.day2 || "",
      "Antihypert Ngày3": r.meds?.antihypert?.day3 || "",

      // Clinical full
      "VAS 0-6h": r.clinical?.vas?.p0_6 || "",
      "VAS 7-24h": r.clinical?.vas?.p7_24 || "",
      "VAS Ngày2": r.clinical?.vas?.day2 || "",
      "VAS Ngày3": r.clinical?.vas?.day3 || "",

      "HA 0-6h": r.clinical?.bp?.p0_6 || "",
      "HA 7-24h": r.clinical?.bp?.p7_24 || "",
      "HA Ngày2": r.clinical?.bp?.day2 || "",
      "HA Ngày3": r.clinical?.bp?.day3 || "",

      "Nhiệt 0-6h": r.clinical?.temp?.p0_6 || "",
      "Nhiệt 7-24h": r.clinical?.temp?.p7_24 || "",
      "Nhiệt Ngày2": r.clinical?.temp?.day2 || "",
      "Nhiệt Ngày3": r.clinical?.temp?.day3 || "",

      "Ghi chú triệu chứng": r.symptomsNote || "",
      "Ghi chú": r.notes || "",
      "Thời gian lưu (ISO)": r.timeSaved || ""
    }));

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ponv_records_${today}.xlsx`);
  } catch (err) {
    console.error("exportExcel error:", err);
    alert("Lỗi khi xuất Excel, xem console");
  }
}


  /* ================= Render JSX ================= */
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Theo dõi Nôn/Buồn nôn sau mổ (PONV)</h1>
	<h2><i>ĐV HSSM - Khoa GMHS</i></h2>

      {/* Toolbar: search, date range, actions */}
      <div style={styles.toolbar}>
        <input
          placeholder="Tìm bệnh nhân..."
          value={searchName}
          onChange={(e) => setSearchName(e.target.value)}
          style={styles.input}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={styles.smallLabel}>Từ</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={styles.input} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={styles.smallLabel}>Đến</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={styles.input} />
        </div>

        <button style={styles.buttonSecondary} onClick={clearFilters}>Xóa lọc</button>
        <button style={styles.button} onClick={exportExcel}>Xuất Excel</button>
        <button style={styles.buttonSecondary} onClick={() => { setForm(clone(DEFAULT_FORM)); setEditId(null); }}>Tạo mới</button>
      </div>

      {/* FORM */}
      <form onSubmit={(e) => { e.preventDefault(); handleSave(e); }} style={styles.form}>
        {/* Patient info */}
        {/* Patient info */}
		<Card title="Thông tin bệnh nhân">
		  <Row>
		    <Col>
		      <Label>Họ tên</Label>
		      <Input name="name" value={form.name || ""} onChange={handleChange} />
		    </Col>
		    <Col>
		      <Label>Tuổi</Label>
		      <Input name="age" value={form.age || ""} onChange={handleChange} type="number" />
		    </Col>
		    <Col>
		      <Label>Giới tính</Label>
		      <Select name="gender" value={form.gender || ""} onChange={handleChange} options={["", "Nam", "Nữ"]} />
		    </Col>
		    <Col>
		      <Label>Ngày phẫu thuật</Label>
		      <Input name="surgeryDate" type="date" value={form.surgeryDate || ""} onChange={handleChange} />
		    </Col>
		    <Col>
		      <Label>Giờ phẫu thuật (24h)</Label>
		      <Input
		        name="surgeryTime"
		        type="text"
		        placeholder="HH:MM"
		        value={form.surgeryTime || ""}
		        onChange={handleChange}
		        onBlur={handleTimeBlur}
		      />
		    </Col>
		    <Col>
		      <Label>Giờ ra hồi sức (24h)</Label>
		      <Input
		        name="pacuOutTime"
		        type="text"
		        placeholder="HH:MM"
		        value={form.pacuOutTime || ""}
		        onChange={handleChange}
		        onBlur={handleTimeBlur}
		      />
		    </Col>
		    <Col>
		      <Label>Giờ rút NKQ (24h)</Label>
		      <Input
		        name="extubationTime"
		        type="text"
		        placeholder="HH:MM"
		        value={form.extubationTime || ""}
		        onChange={handleChange}
		        onBlur={handleTimeBlur}
		      />
		    </Col>
		  </Row>
		</Card>


        {/* History */}
        <Card title="Tiền sử">
          <Row cols="repeat(auto-fit,minmax(180px,1fr))">
            <Col>
              <Check name="history.motionSickness" checked={!!deepGet(form, "history.motionSickness")} onChange={handleChange} label="Tiền sử say tàu xe" />
            </Col>
            <Col>
              <Check name="history.smoking" checked={!!deepGet(form, "history.smoking")} onChange={handleChange} label="Hút thuốc lá/thuốc lào" />
            </Col>
            <Col>
              <Check name="history.prevPONV" checked={!!deepGet(form, "history.prevPONV")} onChange={handleChange} label="Tiền sử nôn/PNV sau mổ" />
            </Col>
          </Row>
        </Card>

        {/* Intra / Postop */}
        <Card title="Trong mổ-Sau mổ & Giảm đau">
        <Row>
		<Col><Label>Tổng Liều Fentanyl (mcg)</Label><Input name="op.FentanylDoseMcg" type="number" value={deepGet(form, "op.FentanylDoseMcg") || ""} onChange={handleChange} /></Col>
		<Col><Label>Tổng Liều Fresofol (mg)</Label><Input name="op.FresofolDoseMg" type="number" value={deepGet(form, "op.FresofolDoseMg") || ""} onChange={handleChange} /></Col>
		<Col><Label>Tổng Liều Rocuronium (mg)</Label><Input name="op.RocuroniumDoseMg" type="number" value={deepGet(form, "op.RocuroniumDoseMg") || ""} onChange={handleChange} /></Col>
		<Col><Label>Tổng Liều Sevorane </Label><Input name="op.SevoraneDose" type="number" value={deepGet(form, "op.SevoraneDose") || ""} onChange={handleChange} /></Col>
		
			</Row>
			<Row>
            <Col>
              <Label>Máu mất trong mổ (ml)</Label>
              <Input name="bloodLossMl" type="number" value={form.bloodLossMl || ""} onChange={handleChange} />
            </Col>
            <Col>
              <Label>Dịch truyền trong mổ (ml)</Label>
              <Input name="fluidsMl" type="number" value={form.fluidsMl || ""} onChange={handleChange} />
            </Col>
			</Row>
			<Row>
            <Col>
  <Label>Nhịn ăn trước PT (thời gian)</Label>
<Select name="lastMealTime" value={deepGet(form, "lastMealTime") || ""} onChange={handleChange} options={["", "Nhịn từ sáng sớm", "Nhịn từ tối ngày trước", "Khác"]} />
</Col>
	<Col>
        <Label>Ghi chú nhịn ăn (nếu có)</Label>
        <textarea name="MealTimenotes" value={form.MealTimenotes || ""} onChange={handleChange} style={{ ...styles.textarea, minHeight: 36, height: "auto" }} />
    </Col>
<Col>
  <Label>Uống lần đầu (thời gian)</Label>
  <Input
    name="firstDrinkTime"
    type="text"
    placeholder="HH:MM"
    value={form.firstDrinkTime || ""}
    onChange={handleChange}
    onBlur={handleTimeBlur}
  />
</Col>

            <Col>
              <Label>Số DL màng phổi</Label>
              <Input name="chestDrainCount" type="number" value={form.chestDrainCount || ""} onChange={handleChange} />
            </Col>
          </Row>

          <Row>
            <Col>
              <Label>Phương pháp giải giãn cơ</Label>
              <Select name="reversalAgent" value={form.reversalAgent || ""} onChange={handleChange} options={["", "Bridion", "Neostigmin"]} />
            </Col>
            <Col>
              <Label>Phương thức giảm đau</Label>
              <Select name="postop.analgesiaMethod" value={deepGet(form, "postop.analgesiaMethod") || ""} onChange={handleChange} options={["", "Tê NMC", "ESP", "PCA", "Khác"]} />
            </Col>
            <Col>
              <Label>Thuốc 1</Label>
              <Select name="postop.analgesic1" value={deepGet(form, "postop.analgesic1") || ""} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} />
            </Col>
            <Col>
              <Label>Liều / Nồng độ 1</Label>
              <Input name="postop.analgesic1Conc" value={deepGet(form, "postop.analgesic1Conc") || ""} onChange={handleChange} />
            </Col>
            <Col>
              <Label>Thuốc 2</Label>
              <Select name="postop.analgesic2" value={deepGet(form, "postop.analgesic2") || ""} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} />
            </Col>
            <Col>
              <Label>Liều / Nồng độ 2</Label>
              <Input name="postop.analgesic2Conc" value={deepGet(form, "postop.analgesic2Conc") || ""} onChange={handleChange} />
            </Col>
            <Col>
              <Label>Dùng Morphin</Label>
              <Check name="postop.morphineUse" checked={!!deepGet(form, "postop.morphineUse")} onChange={handleChange} label="Morphin" />
            </Col>
            <Col>
              <Label>Liều Morphin (mg)</Label>
              <Input name="postop.morphineDoseMg" value={deepGet(form, "postop.morphineDoseMg") || ""} onChange={handleChange} />
            </Col>
          </Row>
        </Card>

        {/* PONV: set as 3 columns, each column: checkbox + times + severity */}
        <Card title="PONV (0-6h | 7-24h | >24h)">
          <table style={styles.tableCompact}>
            <thead>
              <tr>
                <th style={styles.thCompact}></th>
                <th style={styles.thCompact}>0 - 6h</th>
                <th style={styles.thCompact}>7 - 24h</th>
                <th style={styles.thCompact}>&gt; 24h</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.tdLabel}>Có nôn</td>
                <td style={styles.tdCenter}><input type="checkbox" name="ponv.p0_6.present" checked={!!deepGet(form, "ponv.p0_6.present")} onChange={handleChange} /></td>
                <td style={styles.tdCenter}><input type="checkbox" name="ponv.p7_24.present" checked={!!deepGet(form, "ponv.p7_24.present")} onChange={handleChange} /></td>
                <td style={styles.tdCenter}><input type="checkbox" name="ponv.p_gt24.present" checked={!!deepGet(form, "ponv.p_gt24.present")} onChange={handleChange} /></td>
              </tr>
              <tr>
                <td style={styles.tdLabel}>Số lần</td>
                <td style={styles.td}><Input type="number" name="ponv.p0_6.times" value={deepGet(form, "ponv.p0_6.times") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="ponv.p7_24.times" value={deepGet(form, "ponv.p7_24.times") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="ponv.p_gt24.times" value={deepGet(form, "ponv.p_gt24.times") || ""} onChange={handleChange} /></td>
              </tr>
              <tr>
                <td style={styles.tdLabel}>Mức độ</td>
                <td style={styles.td}><Select name="ponv.p0_6.severity" value={deepGet(form, "ponv.p0_6.severity") || ""} onChange={handleChange} options={["", "1", "2", "3", "4"]} /></td>
                <td style={styles.td}><Select name="ponv.p7_24.severity" value={deepGet(form, "ponv.p7_24.severity") || ""} onChange={handleChange} options={["", "1", "2", "3", "4"]} /></td>
                <td style={styles.td}><Select name="ponv.p_gt24.severity" value={deepGet(form, "ponv.p_gt24.severity") || ""} onChange={handleChange} options={["", "1", "2", "3", "4"]} /></td>
              </tr>
			</tbody>
          </table>
			<p style={{ fontSize: 13, color: "#4b5563", marginTop: 8, lineHeight: 1.6 }}>
  <strong>Mức độ buồn nôn – nôn (1–4):</strong><br />
  1. Buồn nôn nhẹ (cảm giác lợm giọng) &nbsp; | &nbsp;
  2. Buồn nôn nặng (muốn nôn nhưng không nôn được) &nbsp; | &nbsp;
  3. Nôn khan hoặc nôn thực sự &lt; 2 lần/giai đoạn &nbsp; | &nbsp;
  4. Nôn thực sự ≥ 2 lần/giai đoạn
</p>
        </Card>

        {/* Clinical - smaller cells like PONV (4 columns with header) */}
        <Card title="Lâm sàng (0-6h | 7-24h | Ngày 2 | Ngày 3)">
          <table style={styles.tableCompact}>
            <thead>
              <tr>
                <th style={styles.thCompact}>Chỉ số</th>
                <th style={styles.thCompact}>0 - 6h</th>
                <th style={styles.thCompact}>7 - 24h</th>
                <th style={styles.thCompact}>Ngày 2</th>
                <th style={styles.thCompact}>Ngày 3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.tdLabel}>VAS</td>
                <td style={styles.td}><Input type="number" name="clinical.vas.p0_6" value={deepGet(form, "clinical.vas.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.vas.p7_24" value={deepGet(form, "clinical.vas.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.vas.day2" value={deepGet(form, "clinical.vas.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.vas.day3" value={deepGet(form, "clinical.vas.day3") || ""} onChange={handleChange} /></td>
              </tr>
              <tr>
                <td style={styles.tdLabel}>HA (max)</td>
                <td style={styles.td}><Input type="number" name="clinical.bp.p0_6" value={deepGet(form, "clinical.bp.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.bp.p7_24" value={deepGet(form, "clinical.bp.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.bp.day2" value={deepGet(form, "clinical.bp.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.bp.day3" value={deepGet(form, "clinical.bp.day3") || ""} onChange={handleChange} /></td>
              </tr>
              <tr>
                <td style={styles.tdLabel}>Nhiệt (max)</td>
                <td style={styles.td}><Input type="number" name="clinical.temp.p0_6" value={deepGet(form, "clinical.temp.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.temp.p7_24" value={deepGet(form, "clinical.temp.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.temp.day2" value={deepGet(form, "clinical.temp.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input type="number" name="clinical.temp.day3" value={deepGet(form, "clinical.temp.day3") || ""} onChange={handleChange} /></td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Symptoms & Meds per timepoint - compact like PONV */}
        <Card title="Triệu chứng khác & Liều thuốc theo mốc">
          <table style={styles.tableCompact}>
            <thead>
              <tr>
                <th style={styles.thCompact}>Triệu chứng / Thuốc</th>
                <th style={styles.thCompact}>0 - 6h</th>
                <th style={styles.thCompact}>7 - 24h</th>
                <th style={styles.thCompact}>Ngày 2</th>
                <th style={styles.thCompact}>Ngày 3</th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: "epigastric", label: "Đau thượng vị" },
                { key: "headache", label: "Đau đầu / Chóng mặt" },
                { key: "retention", label: "Bí tiểu / Sonde tiểu" },
              ].map(s => (
                <tr key={s.key}>
                  <td style={styles.tdLabel}>{s.label}</td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.p0_6`} checked={!!deepGet(form, `symptoms.${s.key}.p0_6`)} onChange={handleChange} /></td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.p7_24`} checked={!!deepGet(form, `symptoms.${s.key}.p7_24`)} onChange={handleChange} /></td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.day2`} checked={!!deepGet(form, `symptoms.${s.key}.day2`)} onChange={handleChange} /></td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.day3`} checked={!!deepGet(form, `symptoms.${s.key}.day3`)} onChange={handleChange} /></td>
                </tr>
              ))}

              <tr>
                <td style={styles.tdLabel}>Liều Vận mạch</td>
                <td style={styles.td}><Input name="meds.vasopressors.p0_6" value={deepGet(form, "meds.vasopressors.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="meds.vasopressors.p7_24" value={deepGet(form, "meds.vasopressors.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="meds.vasopressors.day2" value={deepGet(form, "meds.vasopressors.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="meds.vasopressors.day3" value={deepGet(form, "meds.vasopressors.day3") || ""} onChange={handleChange} /></td>
              </tr>

              <tr>
                <td style={styles.tdLabel}>Liều hạ áp</td>
                <td style={styles.td}><Input name="meds.antihypert.p0_6" value={deepGet(form, "meds.antihypert.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="meds.antihypert.p7_24" value={deepGet(form, "meds.antihypert.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="meds.antihypert.day2" value={deepGet(form, "meds.antihypert.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="meds.antihypert.day3" value={deepGet(form, "meds.antihypert.day3") || ""} onChange={handleChange} /></td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Notes */}
        <Card title="Ghi chú">
          <Row>
            <Col>
              <Label>Ghi chú triệu chứng</Label>
              <textarea name="symptomsNote" value={form.symptomsNote || ""} onChange={handleChange} style={styles.textarea} />
            </Col>
            <Col>
              <Label>Ghi chú khác</Label>
              <textarea name="notes" value={form.notes || ""} onChange={handleChange} style={styles.textarea} />
            </Col>
          </Row>
        </Card>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" style={styles.button} onClick={handleSave}>{editId ? "Cập nhật" : "Lưu"}</button>
          <button type="button" style={styles.buttonSecondary} onClick={() => { setForm(clone(DEFAULT_FORM)); setEditId(null); }}>Reset</button>
        </div>
      </form>

      {/* Records table */}
      <Card title={`Danh sách bệnh nhân (${filtered.length})`}>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.tableCompact}>
            <thead>
              <tr>
                <th style={styles.thCompact}>Họ tên</th>
                <th style={styles.thCompact}>Ngày mổ</th>
                <th style={styles.thCompact}>Giờ mổ</th>
                <th style={styles.thCompact}>Giờ ra HS</th>
                <th style={styles.thCompact}>0-6h PONV</th>
                <th style={styles.thCompact}>7-24h PONV</th>
                <th style={styles.thCompact}>&gt;24h</th>
                <th style={styles.thCompact}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.name}</td>
                  <td style={styles.td}>{r.surgeryDate}</td>
                  <td style={styles.td}>{r.surgeryTime}</td>
                  <td style={styles.td}>{r.pacuOutTime}</td>
                  <td style={styles.tdCenter}>{deepGet(r, "ponv.p0_6.present") ? "Có" : "Không"}</td>
                  <td style={styles.tdCenter}>{deepGet(r, "ponv.p7_24.present") ? "Có" : "Không"}</td>
                  <td style={styles.tdCenter}>{deepGet(r, "ponv.p_gt24.present") ? "Có" : "Không"}</td>
                  <td style={styles.td}>
                    <button style={styles.smallBtn} onClick={() => startEdit(r)}>Sửa</button>
                    <button style={styles.smallBtnDanger} onClick={() => handleDelete(r.id)}>Xóa</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td style={styles.td} colSpan={8}>Không có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ================= Styles ================= */
const styles = {
  container: { padding: 16, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial" },
  title: { fontSize: 22, marginBottom: 12 },
  toolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 },
  button: { padding: "8px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" },
  buttonSecondary: { padding: "8px 12px", background: "#e2e8f0", color: "#111827", border: "none", borderRadius: 8, cursor: "pointer" },
  smallBtn: { padding: "6px 10px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", marginRight: 6 },
  smallBtnDanger: { padding: "6px 10px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" },

  input: { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db" },
  textarea: { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db", minHeight: 80 },

  card: { background: "#fff", border: "1px solid #e6eef6", borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontWeight: 700, marginBottom: 8, paddingLeft: 8, borderLeft: "4px solid #2563eb" },

  // compact table (bold borders like PONV)
  tableCompact: { width: "100%", borderCollapse: "collapse", border: "2px solid #cbd5e1", marginTop: 8 },
  thCompact: { textAlign: "left", padding: "8px 10px", background: "#f8fafc", borderRight: "2px solid #cbd5e1", borderBottom: "2px solid #cbd5e1", fontWeight: 700 },
  td: { padding: "8px 10px", borderRight: "1px solid #e6eef6", borderBottom: "1px solid #e6eef6" },
  tdLabel: { padding: "8px 10px", borderRight: "1px solid #e6eef6", borderBottom: "1px solid #e6eef6", fontWeight: 600 },
  tdCenter: { padding: "8px 10px", borderRight: "1px solid #e6eef6", borderBottom: "1px solid #e6eef6", textAlign: "center" },

  form: { display: "grid", gap: 12 },
  smallLabel: { fontSize: 12, color: "#334155", display: "block", marginBottom: 4 },
};

