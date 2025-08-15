import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import * as XLSX from "xlsx";

/** ===================== Firebase Config (bạn cung cấp) ===================== */
const firebaseConfig = {
  apiKey: "AIzaSyBBnK4v8Vm64zXN7W2HYnRx19gKRuuFTcU",
  authDomain: "ponv-tracker.firebaseapp.com",
  projectId: "ponv-tracker",
  storageBucket: "ponv-tracker.firebasestorage.app",
  messagingSenderId: "295019782369",
  appId: "1:295019782369:web:4309b3debefa6955c717a0"
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/** ===================== Form rỗng (đủ trường theo phiếu) ===================== */
const emptyForm = {
  // Thông tin BN
  patientName: "",
  age: "",
  surgeryDateTime: "",       // datetime-local

  // Tiền sử
  history: {
    motionSickness: false,
    smoking: false,
    prevPONV: false,
  },

  // Trong mổ
  intraop: {
    bloodLossMl: "",
    fluidsMl: "",
    lastMeal: "",            // datetime-local
  },

  // Hồi sức / Phục hồi
  pacuIn: "",                // datetime-local (giờ vào hồi sức)
  extubation: "",            // datetime-local (giờ rút NKQ)
  firstDrink: "",            // datetime-local (uống lần đầu)
  chestDrains: "",           // số sonde DLMP

  // Giảm đau & thuốc
  postop: {
    reversal: "Bridion",     // Bridion / Neostigmine / Other
    morphineUsed: false,
    morphineDoseMg: "",
    analgesiaMethod: "NMC",  // NMC / ESP / PCA / Other
    analgesic1Name: "",
    analgesic1Conc: "",
    analgesic2Name: "",
    analgesic2Conc: "",
  },

  // PONV theo mốc
  firstNVTime: "",           // datetime-local
  p0_6h:   { present: false, times: "", severity: "" }, // 1..4
  p7_24h:  { present: false, times: "", severity: "" },
  pgt24h:  { present: false, times: "", severity: "" },

  // Lâm sàng theo mốc
  clinical: {
    vas_0_6: "",     vas_7_24: "",     vas_day2: "",     vas_day3: "",
    bpmax_0_6: "",   bpmax_7_24: "",   bpmax_day2: "",   bpmax_day3: "",
    tempmax_0_6: "", tempmax_7_24: "", tempmax_day2: "", tempmax_day3: "",
  },

  // Triệu chứng theo mốc
  symptoms: {
    epigastric_0_6: false, epigastric_7_24: false, epigastric_day2: false, epigastric_day3: false,
    headache_0_6: false,   headache_7_24: false,   headache_day2: false,   headache_day3: false,
    retention_0_6: false,  retention_7_24: false,  retention_day2: false,  retention_day3: false,
  },

  // Thuốc theo mốc
  meds: {
    vasopressors_0_6: "", vasopressors_7_24: "", vasopressors_day2: "", vasopressors_day3: "",
    antihypert_0_6: "",   antihypert_7_24: "",   antihypert_day2: "",   antihypert_day3: "",
  },

  notes: "",
  time: ""                  // ISO timestamp khi lưu
};

/** ===================== Component chính ===================== */
export default function App() {
  const [form, setForm] = useState(emptyForm);
  const [records, setRecords] = useState([]);
  const [editId, setEditId] = useState(null);

  // Tìm kiếm + Lọc theo ngày (yyyy-mm-dd)
  const [search, setSearch] = useState("");
  const [filterDate, setFilterDate] = useState("");

  /** ---------- Helpers cập nhật field lồng nhau ---------- */
  const setFormValue = (path, value) => {
    setForm(prev => {
      const copy = structuredClone(prev);
      const parts = path.split(".");
      let cur = copy;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!(parts[i] in cur)) cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts.at(-1)] = value;
      return copy;
    });
  };

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    const val = type === "checkbox" ? checked : value;
    if (name.includes(".")) setFormValue(name, val);
    else setForm(prev => ({ ...prev, [name]: val }));
  };

  /** ---------- CRUD ---------- */
  const fetchRecords = async () => {
    const q = query(collection(db, "ponv_records"), orderBy("time", "desc"));
    const snap = await getDocs(q);
    setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => { fetchRecords(); }, []);

  const saveRecord = async () => {
    if (!form.patientName) {
      alert("Vui lòng nhập Họ tên bệnh nhân");
      return;
    }
    const payload = { ...form, time: new Date().toISOString() };
    if (editId) {
      await updateDoc(doc(db, "ponv_records", editId), payload);
      setEditId(null);
    } else {
      await addDoc(collection(db, "ponv_records"), payload);
    }
    setForm(emptyForm);
    await fetchRecords();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEdit = (r) => {
    // đảm bảo có cấu trúc lồng nhau
    const safe = structuredClone(emptyForm);
    setForm(mergeDeep(safe, r));
    setEditId(r.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteRecord = async (id) => {
    if (window.confirm("Bạn có chắc muốn xóa record này?")) {
      await deleteDoc(doc(db, "ponv_records", id));
      fetchRecords();
    }
  };

  /** ---------- Lọc hiển thị ---------- */
  const filtered = useMemo(() => {
    return records.filter(r => {
      const nameOk = r.patientName?.toLowerCase().includes(search.trim().toLowerCase());
      const dateOk = filterDate
        ? (r.surgeryDateTime ? r.surgeryDateTime.startsWith(filterDate) : false)
        : true;
      return nameOk && dateOk;
    });
  }, [records, search, filterDate]);

  /** ---------- Xuất Excel ---------- */
  const exportToExcel = () => {
    const rows = filtered.map(r => ({
      "Họ tên": r.patientName || "",
      "Tuổi": r.age || "",
      "Ngày giờ mổ": r.surgeryDateTime || "",
      "Say tàu xe": r.history?.motionSickness ? "Có" : "Không",
      "Hút thuốc": r.history?.smoking ? "Có" : "Không",
      "Tiền sử PONV": r.history?.prevPONV ? "Có" : "Không",
      "Máu mất (ml)": r.intraop?.bloodLossMl || "",
      "Dịch truyền (ml)": r.intraop?.fluidsMl || "",
      "Ăn cuối trước mổ": r.intraop?.lastMeal || "",
      "Giờ vào hồi sức": r.pacuIn || "",
      "Rút NKQ": r.extubation || "",
      "Uống đầu tiên": r.firstDrink || "",
      "Sonde DLMP": r.chestDrains || "",
      "Giải giãn cơ": r.postop?.reversal || "",
      "Morphin": r.postop?.morphineUsed ? `Có (${r.postop?.morphineDoseMg || ""} mg)` : "Không",
      "Phương pháp giảm đau": r.postop?.analgesiaMethod || "",
      "Thuốc giảm đau 1": joinNameConc(r.postop?.analgesic1Name, r.postop?.analgesic1Conc),
      "Thuốc giảm đau 2": joinNameConc(r.postop?.analgesic2Name, r.postop?.analgesic2Conc),
      "PONV lần đầu": r.firstNVTime || "",
      "PONV 0-6h": ponvStr(r.p0_6h),
      "PONV 7-24h": ponvStr(r.p7_24h),
      "PONV >24h": ponvStr(r.pgt24h),
      "VAS 0-6": r.clinical?.vas_0_6 || "",
      "VAS 7-24": r.clinical?.vas_7_24 || "",
      "VAS ngày 2": r.clinical?.vas_day2 || "",
      "VAS ngày 3": r.clinical?.vas_day3 || "",
      "HA max 0-6": r.clinical?.bpmax_0_6 || "",
      "HA max 7-24": r.clinical?.bpmax_7_24 || "",
      "HA max ngày 2": r.clinical?.bpmax_day2 || "",
      "HA max ngày 3": r.clinical?.bpmax_day3 || "",
      "Nhiệt max 0-6": r.clinical?.tempmax_0_6 || "",
      "Nhiệt max 7-24": r.clinical?.tempmax_7_24 || "",
      "Nhiệt max ngày 2": r.clinical?.tempmax_day2 || "",
      "Nhiệt max ngày 3": r.clinical?.tempmax_day3 || "",
      "Đau thượng vị 0-6": yesNo(r.symptoms?.epigastric_0_6),
      "Đau thượng vị 7-24": yesNo(r.symptoms?.epigastric_7_24),
      "Đau thượng vị ngày 2": yesNo(r.symptoms?.epigastric_day2),
      "Đau thượng vị ngày 3": yesNo(r.symptoms?.epigastric_day3),
      "Đau đầu 0-6": yesNo(r.symptoms?.headache_0_6),
      "Đau đầu 7-24": yesNo(r.symptoms?.headache_7_24),
      "Đau đầu ngày 2": yesNo(r.symptoms?.headache_day2),
      "Đau đầu ngày 3": yesNo(r.symptoms?.headache_day3),
      "Bí tiểu 0-6": yesNo(r.symptoms?.retention_0_6),
      "Bí tiểu 7-24": yesNo(r.symptoms?.retention_7_24),
      "Bí tiểu ngày 2": yesNo(r.symptoms?.retention_day2),
      "Bí tiểu ngày 3": yesNo(r.symptoms?.retention_day3),
      "Vasopressors 0-6": r.meds?.vasopressors_0_6 || "",
      "Vasopressors 7-24": r.meds?.vasopressors_7_24 || "",
      "Vasopressors ngày 2": r.meds?.vasopressors_day2 || "",
      "Vasopressors ngày 3": r.meds?.vasopressors_day3 || "",
      "Thuốc HA 0-6": r.meds?.antihypert_0_6 || "",
      "Thuốc HA 7-24": r.meds?.antihypert_7_24 || "",
      "Thuốc HA ngày 2": r.meds?.antihypert_day2 || "",
      "Thuốc HA ngày 3": r.meds?.antihypert_day3 || "",
      "Ghi chú": r.notes || "",
      "Thời gian lưu": r.time || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ponv_records_${today}.xlsx`);
  };

  /** ---------- UI ---------- */
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Theo dõi Nôn / Buồn nôn Sau mổ (PONV)</h1>

      {/* Tìm kiếm + lọc + export */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <input
            style={styles.input}
            placeholder="🔎 Tìm theo tên bệnh nhân"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <input
            style={styles.input}
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            title="Lọc theo ngày phẫu thuật"
          />
          <button style={styles.buttonSecondary} onClick={() => { setSearch(""); setFilterDate(""); }}>
            Xóa lọc
          </button>
        </div>
        <div>
          <button style={styles.button} onClick={exportToExcel}>⬇️ Xuất Excel</button>
        </div>
      </div>

      {/* FORM */}
      <div style={styles.grid}>
        {/* Thông tin BN */}
        <Card title="🧑‍⚕️ Thông tin bệnh nhân">
          <Row>
            <Col>
              <Label>Họ tên</Label>
              <Input name="patientName" value={form.patientName} onChange={onChange} placeholder="VD: Nguyễn Văn A" />
            </Col>
            <Col w="160px">
              <Label>Tuổi</Label>
              <Input name="age" type="number" value={form.age} onChange={onChange} />
            </Col>
            <Col>
              <Label>Ngày giờ phẫu thuật</Label>
              <Input name="surgeryDateTime" type="datetime-local" value={form.surgeryDateTime} onChange={onChange} />
            </Col>
          </Row>
        </Card>

        {/* Tiền sử */}
        <Card title="📜 Tiền sử">
          <Row>
            <Check name="history.motionSickness" label="Say tàu xe" checked={form.history.motionSickness} onChange={onChange} />
            <Check name="history.smoking" label="Hút thuốc" checked={form.history.smoking} onChange={onChange} />
            <Check name="history.prevPONV" label="Tiền sử PONV" checked={form.history.prevPONV} onChange={onChange} />
          </Row>
        </Card>

        {/* Trong mổ */}
        <Card title="🔪 Trong mổ">
          <Row>
            <Col>
              <Label>Máu mất (ml)</Label>
              <Input name="intraop.bloodLossMl" type="number" value={form.intraop.bloodLossMl} onChange={onChange} />
            </Col>
            <Col>
              <Label>Dịch truyền (ml)</Label>
              <Input name="intraop.fluidsMl" type="number" value={form.intraop.fluidsMl} onChange={onChange} />
            </Col>
            <Col>
              <Label>Ăn cuối trước mổ</Label>
              <Input name="intraop.lastMeal" type="datetime-local" value={form.intraop.lastMeal} onChange={onChange} />
            </Col>
          </Row>
        </Card>

        {/* Hồi sức sau mổ / giảm đau */}
        <Card title="💤 Hồi sức & Giảm đau">
          <Row>
            <Col>
              <Label>Giờ vào hồi sức</Label>
              <Input name="pacuIn" type="datetime-local" value={form.pacuIn} onChange={onChange} />
            </Col>
            <Col>
              <Label>Rút NKQ</Label>
              <Input name="extubation" type="datetime-local" value={form.extubation} onChange={onChange} />
            </Col>
            <Col>
              <Label>Uống lần đầu</Label>
              <Input name="firstDrink" type="datetime-local" value={form.firstDrink} onChange={onChange} />
            </Col>
            <Col w="160px">
              <Label>Sonde DL màng phổi</Label>
              <Input name="chestDrains" type="number" value={form.chestDrains} onChange={onChange} />
            </Col>
          </Row>

          <Row>
            <Col>
              <Label>Giải giãn cơ</Label>
              <Select name="postop.reversal" value={form.postop.reversal} onChange={onChange}
                options={["Bridion", "Neostigmine", "Other"]} />
            </Col>
            <Col w="180px" center>
              <Check name="postop.morphineUsed" label="Dùng Morphin" checked={form.postop.morphineUsed} onChange={onChange} />
            </Col>
            <Col>
              <Label>Liều Morphin (mg)</Label>
              <Input name="postop.morphineDoseMg" type="number" value={form.postop.morphineDoseMg} onChange={onChange} />
            </Col>
            <Col>
              <Label>PP giảm đau</Label>
              <Select name="postop.analgesiaMethod" value={form.postop.analgesiaMethod} onChange={onChange}
                options={["NMC", "ESP", "PCA", "Other"]} />
            </Col>
          </Row>

          <Row>
            <Col>
              <Label>Thuốc giảm đau 1 - Tên</Label>
              <Input name="postop.analgesic1Name" value={form.postop.analgesic1Name} onChange={onChange} placeholder="VD: Paracetamol" />
            </Col>
            <Col>
              <Label>Thuốc giảm đau 1 - Nồng độ/liều</Label>
              <Input name="postop.analgesic1Conc" value={form.postop.analgesic1Conc} onChange={onChange} placeholder="VD: 1g" />
            </Col>
            <Col>
              <Label>Thuốc giảm đau 2 - Tên</Label>
              <Input name="postop.analgesic2Name" value={form.postop.analgesic2Name} onChange={onChange} />
            </Col>
            <Col>
              <Label>Thuốc giảm đau 2 - Nồng độ/liều</Label>
              <Input name="postop.analgesic2Conc" value={form.postop.analgesic2Conc} onChange={onChange} />
            </Col>
          </Row>
        </Card>

        {/* PONV theo thời gian */}
        <Card title="🤢 PONV theo thời gian">
          <Row>
            <Col>
              <Label>Thời điểm nôn/buồn nôn đầu tiên</Label>
              <Input name="firstNVTime" type="datetime-local" value={form.firstNVTime} onChange={onChange} />
            </Col>
          </Row>

          <TimeBlock
            label="0–6 giờ"
            base="p0_6h"
            value={form.p0_6h}
            onChange={onChange}
          />
          <TimeBlock
            label="7–24 giờ"
            base="p7_24h"
            value={form.p7_24h}
            onChange={onChange}
          />
          <TimeBlock
            label="> 24 giờ"
            base="pgt24h"
            value={form.pgt24h}
            onChange={onChange}
          />

          <small>*Mức độ PONV: 1=BN buồn nôn nhẹ; 2=BN buồn nôn nặng; 3=BN có nôn (<2 lần); 4=BN có nôn (≥2 lần).</small>
        </Card>

        {/* Lâm sàng */}
        <Card title="📊 Lâm sàng (theo mốc)">
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}></th>
                <th style={styles.th}>0–6h</th>
                <th style={styles.th}>7–24h</th>
                <th style={styles.th}>Ngày 2</th>
                <th style={styles.th}>Ngày 3</th>
              </tr>
            </thead>
            <tbody>
              {renderClinicalRow("Điểm đau VAS", "clinical.vas_0_6", "clinical.vas_7_24", "clinical.vas_day2", "clinical.vas_day3", form, onChange)}
              {renderClinicalRow("HA cao nhất", "clinical.bpmax_0_6", "clinical.bpmax_7_24", "clinical.bpmax_day2", "clinical.bpmax_day3", form, onChange)}
              {renderClinicalRow("Nhiệt độ max / Sốt", "clinical.tempmax_0_6", "clinical.tempmax_7_24", "clinical.tempmax_day2", "clinical.tempmax_day3", form, onChange)}
            </tbody>
          </table>
        </Card>

        {/* Triệu chứng & Thuốc theo mốc */}
        <Card title="🩺 Triệu chứng & Thuốc (theo mốc)">
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}></th>
                <th style={styles.th}>0–6h</th>
                <th style={styles.th}>7–24h</th>
                <th style={styles.th}>Ngày 2</th>
                <th style={styles.th}>Ngày 3</th>
              </tr>
            </thead>
            <tbody>
              {renderSymptomsRow("Đau thượng vị", "symptoms.epigastric_0_6", "symptoms.epigastric_7_24", "symptoms.epigastric_day2", "symptoms.epigastric_day3", form, onChange)}
              {renderSymptomsRow("Đau đầu", "symptoms.headache_0_6", "symptoms.headache_7_24", "symptoms.headache_day2", "symptoms.headache_day3", form, onChange)}
              {renderSymptomsRow("Bí tiểu", "symptoms.retention_0_6", "symptoms.retention_7_24", "symptoms.retention_day2", "symptoms.retention_day3", form, onChange)}

              {renderMedsRow("Vasopressors", "meds.vasopressors_0_6", "meds.vasopressors_7_24", "meds.vasopressors_day2", "meds.vasopressors_day3", form, onChange)}
              {renderMedsRow("Thuốc hạ HA", "meds.antihypert_0_6", "meds.antihypert_7_24", "meds.antihypert_day2", "meds.antihypert_day3", form, onChange)}
            </tbody>
          </table>
        </Card>

        {/* Ghi chú */}
        <Card title="📝 Ghi chú">
          <textarea
            style={styles.textarea}
            name="notes"
            value={form.notes}
            onChange={onChange}
            placeholder="Ghi chú thêm..."
            rows={4}
          />
        </Card>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <button style={styles.button} onClick={saveRecord}>{editId ? "💾 Cập nhật" : "💾 Lưu"}</button>
        {editId && (
          <button
            style={styles.buttonSecondary}
            onClick={() => { setEditId(null); setForm(emptyForm); }}
          >
            Hủy sửa
          </button>
        )}
        <button style={styles.buttonSecondary} onClick={() => setForm(emptyForm)}>Reset form</button>
      </div>

      {/* Danh sách */}
      <h2 style={{ marginTop: 28 }}>📚 Danh sách bệnh nhân ({filtered.length})</h2>
      <div style={{ overflowX: "auto" }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>Họ tên</th>
              <th style={styles.th}>Tuổi</th>
              <th style={styles.th}>Ngày giờ mổ</th>
              <th style={styles.th}>Máu mất</th>
              <th style={styles.th}>PONV 0–6h</th>
              <th style={styles.th}>PONV 7–24h</th>
              <th style={styles.th}>PONV &gt;24h</th>
              <th style={styles.th}>Hành động</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={styles.td}>{r.patientName}</td>
                <td style={styles.td}>{r.age}</td>
                <td style={styles.td}>{r.surgeryDateTime}</td>
                <td style={styles.td}>{r.intraop?.bloodLossMl}</td>
                <td style={styles.td}>{ponvStr(r.p0_6h)}</td>
                <td style={styles.td}>{ponvStr(r.p7_24h)}</td>
                <td style={styles.td}>{ponvStr(r.pgt24h)}</td>
                <td style={styles.td}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={styles.smallBtn} onClick={() => startEdit(r)}>Sửa</button>
                    <button style={styles.smallBtnDanger} onClick={() => deleteRecord(r.id)}>Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td style={styles.td} colSpan={8}>Không có dữ liệu phù hợp</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}

/** ===================== UI Helpers ===================== */
const Card = ({ title, children }) => (
  <div style={styles.card}>
    <div style={styles.cardTitle}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
  </div>
);

const Row = ({ children }) => (
  <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
    {children}
  </div>
);

const Col = ({ children, w, center }) => (
  <div style={{ minWidth: w || "auto", display: center ? "flex" : "block", alignItems: center ? "center" : "stretch", gap: 8 }}>
    {children}
  </div>
);

const Label = ({ children }) => (
  <label style={{ display: "block", fontSize: 13, color: "#334155", marginBottom: 4 }}>{children}</label>
);

const Input = (props) => (
  <input
    {...props}
    style={{
      ...styles.input,
      ...(props.style || {}),
    }}
  />
);

const Select = ({ options, ...props }) => (
  <select {...props} style={styles.input}>
    {options.map((op) => <option key={op} value={op}>{op}</option>)}
  </select>
);

const Check = ({ label, ...props }) => (
  <label style={{ display: "flex", alignItems: "center", gap: 8, padding: 6, border: "1px solid #e2e8f0", borderRadius: 8 }}>
    <input type="checkbox" {...props} />
    {label}
  </label>
);

const TimeBlock = ({ label, base, value, onChange }) => (
  <div style={{ border: "1px dashed #cbd5e1", borderRadius: 10, padding: 12, marginTop: 8 }}>
    <div style={{ fontWeight: 600, marginBottom: 8 }}>{label}</div>
    <Row>
      <Col w="180px" center>
        <Check
          name={`${base}.present`}
          label="Có PONV"
          checked={!!value?.present}
          onChange={onChange}
        />
      </Col>
      <Col>
        <Label>Số lần</Label>
        <Input
          name={`${base}.times`}
          type="number"
          value={value?.times || ""}
          onChange={onChange}
          placeholder="0"
        />
      </Col>
      <Col>
        <Label>Mức độ</Label>
        <Select
          name={`${base}.severity`}
          value={value?.severity || ""}
          onChange={onChange}
          options={["", "1", "2", "3", "4"]}
        />
      </Col>
    </Row>
  </div>
);

function renderClinicalRow(label, k1, k2, k3, k4, form, onChange) {
  return (
    <tr>
      <td style={styles.tdLabel}>{label}</td>
      <td style={styles.td}><input style={styles.cellInput} name={k1} value={deepGet(form, k1)} onChange={onChange} /></td>
      <td style={styles.td}><input style={styles.cellInput} name={k2} value={deepGet(form, k2)} onChange={onChange} /></td>
      <td style={styles.td}><input style={styles.cellInput} name={k3} value={deepGet(form, k3)} onChange={onChange} /></td>
      <td style={styles.td}><input style={styles.cellInput} name={k4} value={deepGet(form, k4)} onChange={onChange} /></td>
    </tr>
  );
}

function renderSymptomsRow(label, k1, k2, k3, k4, form, onChange) {
  return (
    <tr>
      <td style={styles.tdLabel}>{label}</td>
      <td style={styles.tdCenter}>
        <input type="checkbox" name={k1} checked={!!deepGet(form, k1)} onChange={onChange} />
      </td>
      <td style={styles.tdCenter}>
        <input type="checkbox" name={k2} checked={!!deepGet(form, k2)} onChange={onChange} />
      </td>
      <td style={styles.tdCenter}>
        <input type="checkbox" name={k3} checked={!!deepGet(form, k3)} onChange={onChange} />
      </td>
      <td style={styles.tdCenter}>
        <input type="checkbox" name={k4} checked={!!deepGet(form, k4)} onChange={onChange} />
      </td>
    </tr>
  );
}

function renderMedsRow(label, k1, k2, k3, k4, form, onChange) {
  return (
    <tr>
      <td style={styles.tdLabel}>{label}</td>
      <td style={styles.td}><input style={styles.cellInput} name={k1} value={deepGet(form, k1)} onChange={onChange} placeholder="Tên/liều" /></td>
      <td style={styles.td}><input style={styles.cellInput} name={k2} value={deepGet(form, k2)} onChange={onChange} placeholder="Tên/liều" /></td>
      <td style={styles.td}><input style={styles.cellInput} name={k3} value={deepGet(form, k3)} onChange={onChange} placeholder="Tên/liều" /></td>
      <td style={styles.td}><input style={styles.cellInput} name={k4} value={deepGet(form, k4)} onChange={onChange} placeholder="Tên/liều" /></td>
    </tr>
  );
}

/** ===================== Utils ===================== */
function deepGet(obj, path) {
  return path.split(".").reduce((acc, k) => (acc ? acc[k] : ""), obj);
}

function mergeDeep(target, source) {
  // đơn giản hóa: merge đệ quy
  if (typeof target !== "object" || target === null) return source;
  Object.keys(source).forEach((key) => {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      mergeDeep(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  });
  return target;
}

function yesNo(v) { return v ? "Có" : "Không"; }

function joinNameConc(name, conc) {
  if (!name && !conc) return "";
  if (name && conc) return `${name} (${conc})`;
  return name || conc || "";
}

function ponvStr(p) {
  if (!p) return "";
  const has = p.present ? "Có" : "Không";
  const times = p.times ? `, SL: ${p.times}` : "";
  const sev = p.severity ? `, Mức: ${p.severity}` : "";
  return `${has}${times}${sev}`;
}

/** ===================== Styles ===================== */
const styles = {
  container: { padding: 18, maxWidth: 1180, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  title: { margin: "4px 0 14px", fontSize: 24 },
  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" },
  toolbarLeft: { display: "flex", gap: 8, flexWrap: "wrap" },
  button: { padding: "10px 14px", background: "#2563eb", color: "#fff", border: "0", borderRadius: 10, cursor: "pointer" },
  buttonSecondary: { padding: "10px 14px", background: "#e2e8f0", color: "#111827", border: "0", borderRadius: 10, cursor: "pointer" },
  smallBtn: { padding: "6px 10px", background: "#2563eb", color: "#fff", border: "0", borderRadius: 8, cursor: "pointer" },
  smallBtnDanger: { padding: "6px 10px", background: "#ef4444", color: "#fff", border: "0", borderRadius: 8, cursor: "pointer" },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 10, outline: "none" },
  textarea: { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 10, outline: "none" },
  grid: { display: "grid", gap: 12 },
  card: { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  cardTitle: { fontWeight: 700, color: "#1f2937", borderLeft: "4px solid #2563eb", paddingLeft: 8, marginBottom: 10 },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden" },
  th: { textAlign: "left", background: "#f1f5f9", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 },
  td: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9" },
  tdLabel: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9", fontWeight: 600, whiteSpace: "nowrap" },
  tdCenter: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9", textAlign: "center" },
  cellInput: { width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, outline: "none" }
}