// src/App.js
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
} from "firebase/firestore";
import * as XLSX from "xlsx";

/* ====== Firebase config ====== */
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

/* ====== Default form / schema (dùng để upgrade record cũ) ====== */
const DEFAULT_FORM = {
  // thông tin cơ bản
  name: "",
  age: "",
  gender: "",
  surgeryDate: "",   // "YYYY-MM-DD"
  surgeryTime: "",   // "HH:MM"
  pacuOutTime: "",   // giờ ra hồi sức
  extubationTime: "",

  // tiền sử (checkbox)
  history: {
    motionSickness: false,
    smoking: false,
    prevPONV: false,
  },

  // trong mổ / hồi sức
  lastMealTime: "",
  firstDrinkTime: "",
  chestDrainCount: "",
  bloodLossMl: "",
  fluidsMl: "",

  // giải giãn cơ + giảm đau
  reversalAgent: "", // Bridion | Neostigmin
  postop: {
    morphineUse: false,
    morphineDoseMg: "",
    analgesiaMethod: "", // Tê NMC / ESP / PCA / Khác
    analgesic1: "", // Bupivacain etc
    analgesic1Conc: "",
    analgesic2: "",
    analgesic2Conc: "",
  },

  // PONV: 3 cột: p0_6, p7_24, p_gt24
  ponv: {
    p0_6: { present: false, times: "", severity: "" },
    p7_24: { present: false, times: "", severity: "" },
    p_gt24: { present: false, times: "", severity: "" },
  },

  // Lâm sàng: VAS / HA / Temp (4 mốc)
  clinical: {
    vas: { p0_6: "", p7_24: "", p_day2: "", p_day3: "" },
    bp: { p0_6: "", p7_24: "", p_day2: "", p_day3: "" },
    temp: { p0_6: "", p7_24: "", p_day2: "", p_day3: "" },
  },

  // Triệu chứng (checkbox) theo 4 mốc
  symptoms: {
    epigastric: { p0_6: false, p7_24: false, p_day2: false, p_day3: false },
    headache: { p0_6: false, p7_24: false, p_day2: false, p_day3: false },
    retention: { p0_6: false, p7_24: false, p_day2: false, p_day3: false },
  },

  // Thuốc theo mốc (liều vasopressor & liều thuốc HA)
  meds: {
    vasopressors: { p0_6: "", p7_24: "", p_day2: "", p_day3: "" },
    antihypert: { p0_6: "", p7_24: "", p_day2: "", p_day3: "" },
  },

  // ghi chú
  symptomsNote: "",
  notes: "",
  timeSaved: "", // ISO string
};

/* ====== Helpers: clone, deepGet, deepSet, mergeDefaults ====== */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
function deepGet(obj, path) {
  if (!obj) return undefined;
  if (!path) return undefined;
  const parts = path.split(".");
  let cur = obj;
  for (let p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}
function deepSet(obj, path, value) {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i];
    if (cur[k] == null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}
// Merge defaults with record: keep record values, add missing keys from DEFAULT_FORM
function mergeDefaults(record) {
  const out = clone(DEFAULT_FORM);
  function overlay(target, src) {
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach((k) => {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) {
        if (target[k] == null || typeof target[k] !== "object") target[k] = {};
        overlay(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    });
  }
  overlay(out, record || {});
  return out;
}

/* ====== UI small components (inline styles) ====== */
const Card = ({ title, children }) => (
  <div style={styles.card}>
    <div style={styles.cardTitle}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
  </div>
);
const Row = ({ children }) => (
  <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
    {children}
  </div>
);
const Col = ({ children, w }) => <div style={{ minWidth: w || "auto" }}>{children}</div>;
const Label = ({ children }) => <label style={{ display: "block", fontSize: 13, color: "#334155", marginBottom: 6 }}>{children}</label>;
const Input = (props) => <input {...props} style={{ ...styles.input, ...(props.style || {}) }} />;
const Select = ({ options = [], ...props }) => (
  <select {...props} style={styles.input}>
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);
const Check = ({ label, ...props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, border: "1px solid #e2e8f0", borderRadius: 8 }}>
    <input type="checkbox" {...props} />
    <span>{label}</span>
  </label>
);

/* ====== Main App component ====== */
export default function App() {
  const [form, setForm] = useState(clone(DEFAULT_FORM));
  const [records, setRecords] = useState([]);
  const [editId, setEditId] = useState(null);

  const [filterName, setFilterName] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const colRef = useMemo(() => collection(db, "ponv_records"), []);

  // load records and upgrade old ones
  useEffect(() => {
    (async () => {
      await loadRecords();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadRecords() {
    try {
      const snap = await getDocs(colRef);
      const arr = snap.docs.map(d => mergeDefaults({ id: d.id, ...d.data() }));
      // optional sort: newest saved first
      arr.sort((a, b) => {
        const ta = a.timeSaved || "";
        const tb = b.timeSaved || "";
        if (ta < tb) return 1;
        if (ta > tb) return -1;
        return 0;
      });
      setRecords(arr);
    } catch (err) {
      console.error("loadRecords error:", err);
    }
  }

  // generic change: name can be nested "ponv.p0_6.times" or top-level "name"
  function handleChange(e) {
    const { name, type } = e.target;
    const value = type === "checkbox" ? e.target.checked : e.target.value;
    setForm(prev => {
      const next = clone(prev);
      if (name.includes(".")) {
        deepSet(next, name, value);
      } else {
        next[name] = value;
      }
      return next;
    });
  }

  // save: add or update (use setDoc merge:true for update)
  async function handleSave(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!form.name) { alert("Vui lòng nhập họ tên bệnh nhân."); return; }
    const payload = clone(form);
    payload.timeSaved = new Date().toISOString();
    try {
      if (editId) {
        await setDoc(doc(db, "ponv_records", editId), payload, { merge: true });
        setEditId(null);
      } else {
        await addDoc(colRef, payload);
      }
      setForm(clone(DEFAULT_FORM));
      await loadRecords();
      alert("Đã lưu.");
    } catch (err) {
      console.error("save error:", err);
      alert("Lỗi khi lưu — xem console.");
    }
  }

  function startEdit(rec) {
    setForm(mergeDefaults(rec));
    setEditId(rec.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!window.confirm("Xóa bản ghi?")) return;
    try {
      await deleteDoc(doc(db, "ponv_records", id));
      await loadRecords();
    } catch (err) {
      console.error("delete error:", err);
      alert("Lỗi khi xóa.");
    }
  }

  function clearFilters() {
    setFilterName("");
    setFilterFrom("");
    setFilterTo("");
  }

  // filtering by name + date range (inclusive)
  const filtered = records.filter(r => {
    const matchName = !filterName || (r.name || "").toLowerCase().includes(filterName.toLowerCase());
    let matchFrom = true, matchTo = true;
    if (filterFrom) matchFrom = !!r.surgeryDate && r.surgeryDate >= filterFrom;
    if (filterTo) matchTo = !!r.surgeryDate && r.surgeryDate <= filterTo;
    return matchName && matchFrom && matchTo;
  });

  // export to Excel (flatten)
  function exportExcel() {
    const rows = filtered.map(r => {
      const flat = {
        id: r.id,
        name: r.name,
        age: r.age,
        gender: r.gender,
        surgeryDate: r.surgeryDate,
        surgeryTime: r.surgeryTime,
        pacuOutTime: r.pacuOutTime,
        extubationTime: r.extubationTime,
        reversalAgent: r.reversalAgent,
        morphineUse: r.postop?.morphineUse ? "Có" : "Không",
        morphineDoseMg: r.postop?.morphineDoseMg || "",
        analgesiaMethod: r.postop?.analgesiaMethod || "",
        analgesic1: r.postop?.analgesic1 || "",
        analgesic1Conc: r.postop?.analgesic1Conc || "",
        analgesic2: r.postop?.analgesic2 || "",
        analgesic2Conc: r.postop?.analgesic2Conc || "",
        bloodLossMl: r.bloodLossMl || "",
        fluidsMl: r.fluidsMl || "",
        lastMealTime: r.lastMealTime || "",
        firstDrinkTime: r.firstDrinkTime || "",
        chestDrainCount: r.chestDrainCount || "",
        ponv_p0_6_present: r.ponv?.p0_6?.present ? "Có" : "Không",
        ponv_p0_6_times: r.ponv?.p0_6?.times || "",
        ponv_p0_6_severity: r.ponv?.p0_6?.severity || "",
        ponv_p7_24_present: r.ponv?.p7_24?.present ? "Có" : "Không",
        ponv_p7_24_times: r.ponv?.p7_24?.times || "",
        ponv_p7_24_severity: r.ponv?.p7_24?.severity || "",
        ponv_pgt24_present: r.ponv?.p_gt24?.present ? "Có" : "Không",
        ponv_pgt24_times: r.ponv?.p_gt24?.times || "",
        ponv_pgt24_severity: r.ponv?.p_gt24?.severity || "",
        ... (r.clinical?.vas ? { vas_p0_6: r.clinical.vas.p0_6, vas_p7_24: r.clinical.vas.p7_24, vas_day2: r.clinical.vas.p_day2, vas_day3: r.clinical.vas.p_day3 } : {}),
        ... (r.meds?.vasopressors ? { vasopressors_p0_6: r.meds.vasopressors.p0_6, vasopressors_p7_24: r.meds.vasopressors.p7_24, vasopressors_day2: r.meds.vasopressors.p_day2, vasopressors_day3: r.meds.vasopressors.p_day3 } : {}),
        symptomsNote: r.symptomsNote || "",
        notes: r.notes || "",
        timeSaved: r.timeSaved || "",
      };
      return flat;
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ponv_records_${today}.xlsx`);
  }

  /* ====== JSX render ====== */
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Theo dõi Nôn / Buồn nôn sau mổ (PONV)</h1>

      {/* filters */}
      <div style={styles.toolbar}>
        <input style={styles.input} placeholder="Tìm theo tên..." value={filterName} onChange={(e) => setFilterName(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={styles.smallLabel}>Từ</label>
          <input style={styles.input} type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={styles.smallLabel}>Đến</label>
          <input style={styles.input} type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        </div>
        <button style={styles.buttonSecondary} onClick={clearFilters}>Xóa lọc</button>
        <button style={styles.button} onClick={exportExcel}>Xuất Excel</button>
      </div>

      {/* FORM */}
      <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} style={styles.form}>
        <Card title="Thông tin bệnh nhân">
          <Row>
            <Col><Label>Họ tên</Label><Input name="name" value={form.name} onChange={handleChange} /></Col>
            <Col><Label>Tuổi</Label><Input name="age" value={form.age || ""} onChange={handleChange} type="number" /></Col>
            <Col><Label>Giới tính</Label><Input name="gender" value={form.gender} onChange={handleChange} /></Col>
            <Col><Label>Ngày phẫu thuật</Label><Input name="surgeryDate" type="date" value={form.surgeryDate} onChange={handleChange} /></Col>
            <Col><Label>Giờ phẫu thuật</Label><Input name="surgeryTime" type="time" value={form.surgeryTime} onChange={handleChange} /></Col>
            <Col><Label>Giờ ra Hồi sức</Label><Input name="pacuOutTime" type="time" value={form.pacuOutTime} onChange={handleChange} /></Col>
            <Col><Label>Giờ rút NKQ</Label><Input name="extubationTime" type="time" value={form.extubationTime} onChange={handleChange} /></Col>
          </Row>
        </Card>

        <Card title="Trong mổ & Giảm đau">
          <Row>
            <Col><Label>Máu mất (ml)</Label><Input name="bloodLossMl" type="number" value={form.bloodLossMl} onChange={handleChange} /></Col>
            <Col><Label>Dịch (ml)</Label><Input name="fluidsMl" type="number" value={form.fluidsMl} onChange={handleChange} /></Col>
            <Col><Label>Ăn cuối (giờ)</Label><Input name="lastMealTime" type="time" value={form.lastMealTime} onChange={handleChange} /></Col>
            <Col><Label>Uống lần đầu</Label><Input name="firstDrinkTime" type="time" value={form.firstDrinkTime} onChange={handleChange} /></Col>
            <Col><Label>Số DL màng phổi</Label><Input name="chestDrainCount" type="number" value={form.chestDrainCount} onChange={handleChange} /></Col>
          </Row>

          <Row>
            <Col><Label>Phương pháp giải giãn cơ</Label>
              <Select name="reversalAgent" value={form.reversalAgent} onChange={handleChange} options={["", "Bridion", "Neostigmin"]} />
            </Col>
            <Col><Label>Dùng Morphin</Label><Check name="postop.morphineUse" checked={!!deepGet(form, "postop.morphineUse")} onChange={handleChange} label="Morphin" /></Col>
            <Col><Label>Liều Morphin (mg)</Label><Input name="postop.morphineDoseMg" value={deepGet(form, "postop.morphineDoseMg") || ""} onChange={handleChange} /></Col>
            <Col><Label>PP giảm đau</Label>
              <Select name="postop.analgesiaMethod" value={deepGet(form, "postop.analgesiaMethod")} onChange={handleChange} options={["", "Tê NMC", "ESP", "PCA", "Khác"]} />
            </Col>
          </Row>

          <Row>
            <Col><Label>Thuốc 1</Label><Select name="postop.analgesic1" value={deepGet(form, "postop.analgesic1")} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} /></Col>
            <Col><Label>Nồng độ / Liều 1</Label><Input name="postop.analgesic1Conc" value={deepGet(form, "postop.analgesic1Conc") || ""} onChange={handleChange} /></Col>
            <Col><Label>Thuốc 2</Label><Select name="postop.analgesic2" value={deepGet(form, "postop.analgesic2")} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} /></Col>
            <Col><Label>Nồng độ / Liều 2</Label><Input name="postop.analgesic2Conc" value={deepGet(form, "postop.analgesic2Conc") || ""} onChange={handleChange} /></Col>
          </Row>
        </Card>

        <Card title="PONV (0-6h | 7-24h | >24h)">
          <table style={styles.table}>
            <thead>
              <tr><th></th><th>0-6h</th><th>7-24h</th><th>&gt;24h</th></tr>
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
                <td><Input type="number" name="ponv.p0_6.times" value={deepGet(form, "ponv.p0_6.times") || ""} onChange={handleChange} /></td>
                <td><Input type="number" name="ponv.p7_24.times" value={deepGet(form, "ponv.p7_24.times") || ""} onChange={handleChange} /></td>
                <td><Input type="number" name="ponv.p_gt24.times" value={deepGet(form, "ponv.p_gt24.times") || ""} onChange={handleChange} /></td>
              </tr>
              <tr>
                <td style={styles.tdLabel}>Mức độ</td>
                <td><Select name="ponv.p0_6.severity" value={deepGet(form, "ponv.p0_6.severity") || ""} onChange={handleChange} options={["", "1", "2", "3", "4"]} /></td>
                <td><Select name="ponv.p7_24.severity" value={deepGet(form, "ponv.p7_24.severity") || ""} onChange={handleChange} options={["", "1", "2", "3", "4"]} /></td>
                <td><Select name="ponv.p_gt24.severity" value={deepGet(form, "ponv.p_gt24.severity") || ""} onChange={handleChange} options={["", "1", "2", "3", "4"]} /></td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="Điểm VAS / HA / Nhiệt độ (0-6h | 7-24h | Ngày 2 | Ngày 3)">
          {/* smaller grid: each row is a metric with 4 inputs */}
          <div style={{ display: "grid", gap: 8 }}>
            {["vas", "bp", "temp"].map((metric) => (
              <div key={metric} style={{ display: "grid", gridTemplateColumns: "160px repeat(4, 1fr)", gap: 8, alignItems: "center" }}>
                <div style={{ fontWeight: 600, paddingRight: 6 }}>{metric === "vas" ? "VAS" : metric === "bp" ? "HA" : "Nhiệt"}</div>
                <Input name={`clinical.${metric}.p0_6`} value={deepGet(form, `clinical.${metric}.p0_6`) || ""} onChange={handleChange} style={{ width: "100%" }} />
                <Input name={`clinical.${metric}.p7_24`} value={deepGet(form, `clinical.${metric}.p7_24`) || ""} onChange={handleChange} style={{ width: "100%" }} />
                <Input name={`clinical.${metric}.p_day2`} value={deepGet(form, `clinical.${metric}.p_day2`) || ""} onChange={handleChange} style={{ width: "100%" }} />
                <Input name={`clinical.${metric}.p_day3`} value={deepGet(form, `clinical.${metric}.p_day3`) || ""} onChange={handleChange} style={{ width: "100%" }} />
              </div>
            ))}
          </div>
        </Card>

        <Card title="Triệu chứng khác & Liều thuốc theo mốc">
          <table style={styles.table}>
            <thead>
              <tr><th>Item</th><th>0-6h</th><th>7-24h</th><th>Ngày 2</th><th>Ngày 3</th></tr>
            </thead>
            <tbody>
              {/* symptoms (checkbox per timepoint) */}
              {[
                { key: "epigastric", label: "Đau thượng vị" },
                { key: "headache", label: "Đau đầu/Chóng mặt" },
                { key: "retention", label: "Bí tiểu / Sonde tiểu" },
              ].map(s => (
                <tr key={s.key}>
                  <td style={styles.tdLabel}>{s.label}</td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.p0_6`} checked={!!deepGet(form, `symptoms.${s.key}.p0_6`)} onChange={handleChange} /></td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.p7_24`} checked={!!deepGet(form, `symptoms.${s.key}.p7_24`)} onChange={handleChange} /></td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.p_day2`} checked={!!deepGet(form, `symptoms.${s.key}.p_day2`)} onChange={handleChange} /></td>
                  <td style={styles.tdCenter}><input type="checkbox" name={`symptoms.${s.key}.p_day3`} checked={!!deepGet(form, `symptoms.${s.key}.p_day3`)} onChange={handleChange} /></td>
                </tr>
              ))}

              {/* meds dosage rows */}
              <tr>
                <td style={styles.tdLabel}>Liều vasopressors</td>
                <td><Input name="meds.vasopressors.p0_6" value={deepGet(form, "meds.vasopressors.p0_6") || ""} onChange={handleChange} /></td>
                <td><Input name="meds.vasopressors.p7_24" value={deepGet(form, "meds.vasopressors.p7_24") || ""} onChange={handleChange} /></td>
                <td><Input name="meds.vasopressors.p_day2" value={deepGet(form, "meds.vasopressors.p_day2") || ""} onChange={handleChange} /></td>
                <td><Input name="meds.vasopressors.p_day3" value={deepGet(form, "meds.vasopressors.p_day3") || ""} onChange={handleChange} /></td>
              </tr>
              <tr>
                <td style={styles.tdLabel}>Liều hạ áp</td>
                <td><Input name="meds.antihypert.p0_6" value={deepGet(form, "meds.antihypert.p0_6") || ""} onChange={handleChange} /></td>
                <td><Input name="meds.antihypert.p7_24" value={deepGet(form, "meds.antihypert.p7_24") || ""} onChange={handleChange} /></td>
                <td><Input name="meds.antihypert.p_day2" value={deepGet(form, "meds.antihypert.p_day2") || ""} onChange={handleChange} /></td>
                <td><Input name="meds.antihypert.p_day3" value={deepGet(form, "meds.antihypert.p_day3") || ""} onChange={handleChange} /></td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="Ghi chú">
          <Row>
            <Col>
              <Label>Mô tả triệu chứng</Label>
              <textarea name="symptomsNote" value={form.symptomsNote} onChange={handleChange} style={styles.textarea} />
            </Col>
            <Col>
              <Label>Ghi chú khác</Label>
              <textarea name="notes" value={form.notes} onChange={handleChange} style={styles.textarea} />
            </Col>
          </Row>
        </Card>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={handleSave} style={styles.button}>{editId ? "Cập nhật" : "Lưu"}</button>
          <button type="button" onClick={() => { setForm(clone(DEFAULT_FORM)); setEditId(null); }} style={styles.buttonSecondary}>Reset</button>
        </div>
      </form>

      {/* Records table */}
      <Card title={`Danh sách bệnh nhân (${filtered.length})`}>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Họ tên</th>
                <th style={styles.th}>Ngày</th>
                <th style={styles.th}>Giờ</th>
                <th style={styles.th}>HS ra</th>
                <th style={styles.th}>PONV 0-6h</th>
                <th style={styles.th}>PONV 7-24h</th>
                <th style={styles.th}>&gt;24h</th>
                <th style={styles.th}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.name}</td>
                  <td style={styles.td}>{r.surgeryDate}</td>
                  <td style={styles.td}>{r.surgeryTime}</td>
                  <td style={styles.td}>{r.pacuOutTime}</td>
                  <td style={styles.td}>{deepGet(r, "ponv.p0_6.present") ? "Có" : "Không"}</td>
                  <td style={styles.td}>{deepGet(r, "ponv.p7_24.present") ? "Có" : "Không"}</td>
                  <td style={styles.td}>{deepGet(r, "ponv.p_gt24.present") ? "Có" : "Không"}</td>
                  <td style={styles.td}>
                    <button style={styles.smallBtn} onClick={() => startEdit(r)}>Sửa</button>
                    <button style={styles.smallBtnDanger} onClick={() => handleDelete(r.id)}>Xóa</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td style={styles.td} colSpan={8}>Không có dữ liệu</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ====== Styles (JS object) ====== */
const styles = {
  container: { padding: 16, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial" },
  title: { fontSize: 22, marginBottom: 12 },
  toolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 },
  button: { background: "#2563eb", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 8, cursor: "pointer" },
  buttonSecondary: { background: "#e2e8f0", color: "#111827", border: "none", padding: "8px 12px", borderRadius: 8, cursor: "pointer" },
  smallBtn: { background: "#2563eb", color: "#fff", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer", marginRight: 6 },
  smallBtnDanger: { background: "#ef4444", color: "#fff", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer" },
  input: { padding: "8px 10px", borderRadius: 8, border: "1px solid #e2e8f0", minWidth: 120 },
  textarea: { padding: 8, borderRadius: 8, border: "1px solid #e2e8f0", minHeight: 80, width: "100%" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontWeight: 700, marginBottom: 8, paddingLeft: 8, borderLeft: "4px solid #2563eb" },
  form: { display: "grid", gap: 12 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 8 },
  th: { textAlign: "left", padding: "8px 10px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" },
  td: { padding: "8px 10px", borderBottom: "1px solid #f1f5f9" },
  tdLabel: { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 },
  tdCenter: { padding: "8px 10px", borderBottom: "1px solid #f1f5f9", textAlign: "center" },
  smallLabel: { fontSize: 12, color: "#334155", display: "block", marginBottom: 4 }
};
