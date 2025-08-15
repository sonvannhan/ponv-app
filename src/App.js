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
  query,
  orderBy,
} from "firebase/firestore";
import * as XLSX from "xlsx";

/* =============== Firebase config =============== */
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

/* =============== Default schema (for upgrade) =============== */
const DEFAULT_FORM = {
  // patient
  name: "",
  age: "",
  gender: "",
  surgeryDate: "",
  surgeryTime: "",
  pacuOutTime: "",
  extubationTime: "",

  // tiền sử (checkbox)
  history: {
    motionSickness: false, // say tàu xe
    smoking: false,       // hút thuốc
    prevPONV: false,      // tiền sử PONV sau mổ
  },

  // intra / postop
  lastMealTime: "",
  firstDrinkTime: "",
  chestDrainCount: "",
  bloodLossMl: "",
  fluidsMl: "",

  reversalAgent: "", // Bridion | Neostigmin
  postop: {
    morphineUse: false,
    morphineDose: "",
    analgesiaMethod: "",
    analgesic1: "",
    analgesic1Conc: "",
    analgesic2: "",
    analgesic2Conc: "",
  },

  // PONV blocks (3 columns)
  ponv: {
    p0_6: { present: false, times: "", severity: "" },
    p7_24: { present: false, times: "", severity: "" },
    p_gt24: { present: false, times: "", severity: "" },
  },

  // Lâm sàng (VAS / HA / Nhiệt) — 4 timepoints
  clinical: {
    vas: { p0_6: "", p7_24: "", day2: "", day3: "" },
    bp: { p0_6: "", p7_24: "", day2: "", day3: "" },
    temp: { p0_6: "", p7_24: "", day2: "", day3: "" },
  },

  // symptoms (checkbox per timepoint)
  symptoms: {
    epigastric: { p0_6: false, p7_24: false, day2: false, day3: false },
    headache: { p0_6: false, p7_24: false, day2: false, day3: false },
    retention: { p0_6: false, p7_24: false, day2: false, day3: false },
  },

  // meds per timepoint
  meds: {
    vasopressors: { p0_6: "", p7_24: "", day2: "", day3: "" },
    antihypert: { p0_6: "", p7_24: "", day2: "", day3: "" },
  },

  symptomsNote: "",
  notes: "",
  timeSaved: "",
};

/* =============== helpers =============== */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepGet(obj, path) {
  if (!obj || !path) return undefined;
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

// Merge defaults with record (keeps existing values)
function mergeDefaults(record) {
  const out = clone(DEFAULT_FORM);
  function overlay(target, src) {
    if (!src || typeof src !== "object") return;
    Object.keys(src).forEach((k) => {
      if (src[k] && typeof src[k] === "object" && !Array.isArray(src[k])) {
        if (!target[k] || typeof target[k] !== "object") target[k] = {};
        overlay(target[k], src[k]);
      } else {
        target[k] = src[k];
      }
    });
  }
  overlay(out, record || {});
  return out;
}

/* =============== small UI components =============== */
const Card = ({ title, children }) => (
  <div style={styles.card}>
    <div style={styles.cardTitle}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
  </div>
);
const Row = ({ children }) => (
  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>{children}</div>
);
const Col = ({ children, w }) => <div style={{ minWidth: w || "auto" }}>{children}</div>;
const Label = ({ children }) => <label style={{ display: "block", fontSize: 13, color: "#334155", marginBottom: 6 }}>{children}</label>;
const Input = (props) => <input {...props} style={{ ...styles.input, ...(props.style || {}) }} />;
const Select = ({ options = [], ...props }) => (
  <select {...props} style={styles.input}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select>
);
const Check = ({ label, ...props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, border: "1px solid #cbd5e1", borderRadius: 8 }}>
    <input type="checkbox" {...props} />
    <span>{label}</span>
  </label>
);

/* =============== Main component =============== */
export default function App() {
  const colRef = useMemo(() => collection(db, "ponv_records"), []);
  const [form, setForm] = useState(clone(DEFAULT_FORM));
  const [records, setRecords] = useState([]);
  const [editId, setEditId] = useState(null);

  const [filterName, setFilterName] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

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
      console.error(err);
      alert("Lỗi tải dữ liệu. Xem console.");
    }
  }

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

  async function handleSave(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!form.name) { alert("Vui lòng nhập họ tên"); return; }
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
      alert("Đã lưu");
    } catch (err) {
      console.error(err);
      alert("Lỗi lưu, xem console");
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
      console.error(err);
      alert("Lỗi xóa");
    }
  }

  function clearFilters() {
    setFilterName("");
    setFilterFrom("");
    setFilterTo("");
  }

  const filtered = records.filter(r => {
    const nameOk = !filterName || (r.name || "").toLowerCase().includes(filterName.toLowerCase());
    const fromOk = !filterFrom || (r.surgeryDate && r.surgeryDate >= filterFrom);
    const toOk = !filterTo || (r.surgeryDate && r.surgeryDate <= filterTo);
    return nameOk && fromOk && toOk;
  });

  function exportExcel() {
    const rows = filtered.map(r => ({
      id: r.id,
      name: r.name,
      surgeryDate: r.surgeryDate,
      surgeryTime: r.surgeryTime,
      pacuOutTime: r.pacuOutTime,
      extubationTime: r.extubationTime,
      motionSickness: r.history.motionSickness ? "Có" : "Không",
      smoking: r.history.smoking ? "Có" : "Không",
      prevPONV: r.history.prevPONV ? "Có" : "Không",
      reversalAgent: r.reversalAgent,
      morphineUse: r.postop?.morphineUse ? "Có" : "Không",
      morphineDose: r.postop?.morphineDose || "",
      // PONV flatten
      ponv_p0_6_present: r.ponv?.p0_6?.present ? "Có" : "Không",
      ponv_p0_6_times: r.ponv?.p0_6?.times || "",
      ponv_p0_6_sev: r.ponv?.p0_6?.severity || "",
      // clinical flatten minimal...
      vas_p0_6: r.clinical?.vas?.p0_6 || "",
      timeSaved: r.timeSaved || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    XLSX.writeFile(wb, `ponv_records_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  /* =============== Render =============== */
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Theo dõi nôn / buồn nôn sau mổ (PONV)</h1>

      {/* Filters */}
      <div style={styles.toolbar}>
        <input style={styles.input} placeholder="Tìm theo tên..." value={filterName} onChange={e => setFilterName(e.target.value)} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={styles.smallLabel}>Từ</label>
          <input type="date" style={styles.input} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={styles.smallLabel}>Đến</label>
          <input type="date" style={styles.input} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
        <button style={styles.buttonSecondary} onClick={clearFilters}>Xóa lọc</button>
        <button style={styles.button} onClick={exportExcel}>Xuất Excel</button>
      </div>

      {/* FORM */}
      <form onSubmit={handleSave} style={styles.form}>
        <Card title="Thông tin bệnh nhân">
          <Row>
            <Col><Label>Họ tên</Label><Input name="name" value={form.name} onChange={handleChange} /></Col>
            <Col><Label>Tuổi</Label><Input name="age" type="number" value={form.age || ""} onChange={handleChange} /></Col>
            <Col><Label>Giới tính</Label><Input name="gender" value={form.gender} onChange={handleChange} /></Col>
            <Col><Label>Ngày phẫu thuật</Label><Input name="surgeryDate" type="date" value={form.surgeryDate} onChange={handleChange} /></Col>
            <Col><Label>Giờ phẫu thuật</Label><Input name="surgeryTime" type="time" value={form.surgeryTime} onChange={handleChange} /></Col>
            <Col><Label>Giờ ra Hồi sức</Label><Input name="pacuOutTime" type="time" value={form.pacuOutTime} onChange={handleChange} /></Col>
            <Col><Label>Giờ rút NKQ</Label><Input name="extubationTime" type="time" value={form.extubationTime} onChange={handleChange} /></Col>
          </Row>
        </Card>

        <Card title="Tiền sử">
          <Row>
            <Col w="260px">
              <Check name="history.motionSickness" checked={!!deepGet(form, "history.motionSickness")} onChange={handleChange} label="Tiền sử say tàu xe" />
            </Col>
            <Col w="220px">
              <Check name="history.smoking" checked={!!deepGet(form, "history.smoking")} onChange={handleChange} label="Hút thuốc lá/thuốc lào" />
            </Col>
            <Col w="260px">
              <Check name="history.prevPONV" checked={!!deepGet(form, "history.prevPONV")} onChange={handleChange} label="Tiền sử nôn/buồn nôn sau mổ" />
            </Col>
          </Row>
        </Card>

        <Card title="Giải giãn cơ & Giảm đau">
          <Row>
            <Col><Label>Phương pháp giải giãn cơ</Label><Select name="reversalAgent" value={form.reversalAgent} onChange={handleChange} options={["", "Bridion", "Neostigmin"]} /></Col>
            <Col><Label>Phương thức giảm đau</Label><Select name="postop.analgesiaMethod" value={deepGet(form, "postop.analgesiaMethod")} onChange={handleChange} options={["", "Tê NMC", "ESP", "PCA", "Khác"]} /></Col>
            <Col><Label>Thuốc 1</Label><Select name="postop.analgesic1" value={deepGet(form, "postop.analgesic1")} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} /></Col>
            <Col><Label>Thuốc 2</Label><Select name="postop.analgesic2" value={deepGet(form, "postop.analgesic2")} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} /></Col>
            <Col><Label>Dùng Morphin</Label><Check name="postop.morphineUse" checked={!!deepGet(form, "postop.morphineUse")} onChange={handleChange} label="Morphin sau mổ" /></Col>
            <Col><Label>Liều Morphin (mg)</Label><Input name="postop.morphineDose" value={deepGet(form, "postop.morphineDose") || ""} onChange={handleChange} /></Col>
          </Row>
        </Card>

        <Card title="PONV (0-6h | 7-24h | >24h)">
          <table style={styles.tableBold}>
            <thead>
              <tr>
                <th style={styles.thBold}></th>
                <th style={styles.thBold}>0 - 6h</th>
                <th style={styles.thBold}>7 - 24h</th>
                <th style={styles.thBold}>&gt; 24h</th>
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
        </Card>

        <Card title="Lâm sàng (0-6h | 7-24h | Ngày 2 | Ngày 3)">
          <table style={styles.tableBold}>
            <thead>
              <tr>
                <th style={styles.thBold}>Chỉ số</th>
                <th style={styles.thBold}>0 - 6h</th>
                <th style={styles.thBold}>7 - 24h</th>
                <th style={styles.thBold}>Ngày 2</th>
                <th style={styles.thBold}>Ngày 3</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={styles.tdLabel}>VAS</td>
                <td style={styles.td}><Input name="clinical.vas.p0_6" value={deepGet(form, "clinical.vas.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.vas.p7_24" value={deepGet(form, "clinical.vas.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.vas.day2" value={deepGet(form, "clinical.vas.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.vas.day3" value={deepGet(form, "clinical.vas.day3") || ""} onChange={handleChange} /></td>
              </tr>

              <tr>
                <td style={styles.tdLabel}>HA (max)</td>
                <td style={styles.td}><Input name="clinical.bp.p0_6" value={deepGet(form, "clinical.bp.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.bp.p7_24" value={deepGet(form, "clinical.bp.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.bp.day2" value={deepGet(form, "clinical.bp.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.bp.day3" value={deepGet(form, "clinical.bp.day3") || ""} onChange={handleChange} /></td>
              </tr>

              <tr>
                <td style={styles.tdLabel}>Nhiệt (max)</td>
                <td style={styles.td}><Input name="clinical.temp.p0_6" value={deepGet(form, "clinical.temp.p0_6") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.temp.p7_24" value={deepGet(form, "clinical.temp.p7_24") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.temp.day2" value={deepGet(form, "clinical.temp.day2") || ""} onChange={handleChange} /></td>
                <td style={styles.td}><Input name="clinical.temp.day3" value={deepGet(form, "clinical.temp.day3") || ""} onChange={handleChange} /></td>
              </tr>
            </tbody>
          </table>
        </Card>

        <Card title="Triệu chứng & Liều thuốc theo mốc">
          <table style={styles.tableBold}>
            <thead>
              <tr>
                <th style={styles.thBold}>Item</th>
                <th style={styles.thBold}>0 - 6h</th>
                <th style={styles.thBold}>7 - 24h</th>
                <th style={styles.thBold}>Ngày 2</th>
                <th style={styles.thBold}>Ngày 3</th>
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
                <td style={styles.tdLabel}>Liều vasopressors</td>
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

        <Card title="Ghi chú">
          <Row>
            <Col><Label>Mô tả triệu chứng</Label><textarea name="symptomsNote" value={form.symptomsNote} onChange={handleChange} style={styles.textarea} /></Col>
            <Col><Label>Ghi chú khác</Label><textarea name="notes" value={form.notes} onChange={handleChange} style={styles.textarea} /></Col>
          </Row>
        </Card>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" style={styles.button}>{editId ? "Cập nhật" : "Lưu"}</button>
          <button type="button" style={styles.buttonSecondary} onClick={() => { setForm(clone(DEFAULT_FORM)); setEditId(null); }}>Reset</button>
        </div>
      </form>

      {/* records table */}
      <Card title={`Danh sách (${filtered.length})`}>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.tableBold}>
            <thead>
              <tr>
                <th style={styles.thBold}>Họ tên</th>
                <th style={styles.thBold}>Ngày</th>
                <th style={styles.thBold}>Giờ</th>
                <th style={styles.thBold}>HS ra</th>
                <th style={styles.thBold}>0-6h PONV</th>
                <th style={styles.thBold}>7-24h PONV</th>
                <th style={styles.thBold}>&gt;24h</th>
                <th style={styles.thBold}>Hành động</th>
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

/* =============== Styles =============== */
const styles = {
  container: { padding: 16, maxWidth: 1200, margin: "0 auto", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial" },
  title: { fontSize: 22, marginBottom: 12 },
  toolbar: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 },
  button: { background: "#2563eb", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 8, cursor: "pointer" },
  buttonSecondary: { background: "#e2e8f0", color: "#111827", border: "none", padding: "8px 12px", borderRadius: 8, cursor: "pointer" },
  smallBtn: { background: "#2563eb", color: "#fff", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer", marginRight: 6 },
  smallBtnDanger: { background: "#ef4444", color: "#fff", border: "none", padding: "6px 10px", borderRadius: 6, cursor: "pointer" },
  input: { padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", minWidth: 120 },
  textarea: { padding: 8, borderRadius: 8, border: "1px solid #cbd5e1", minHeight: 80, width: "100%" },

  // bold table with clear borders for readability
  tableBold: { width: "100%", borderCollapse: "collapse", marginTop: 8, border: "2px solid #cbd5e1" },
  thBold: { textAlign: "left", padding: "10px 8px", borderRight: "2px solid #cbd5e1", borderBottom: "2px solid #cbd5e1", background: "#f8fafc", fontWeight: 700 },
  td: { padding: "8px 10px", borderRight: "1px solid #e6eef6", borderBottom: "1px solid #e6eef6" },
  tdLabel: { padding: "8px 10px", borderRight: "1px solid #e6eef6", borderBottom: "1px solid #e6eef6", fontWeight: 600 },
  tdCenter: { padding: "8px 10px", borderRight: "1px solid #e6eef6", borderBottom: "1px solid #e6eef6", textAlign: "center" },

  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12 },
  cardTitle: { fontWeight: 700, marginBottom: 8, paddingLeft: 8, borderLeft: "4px solid #2563eb" },

  smallLabel: { fontSize: 12, color: "#334155", display: "block", marginBottom: 4 }
};
