// App.js
import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import * as XLSX from "xlsx";

// ===================== Firebase Config =====================
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

// ===================== UI Helpers =====================
const Card = ({ title, children }) => (
  <div style={styles.card}>
    <div style={styles.cardTitle}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {children}
    </div>
  </div>
);

const Row = ({ children }) => (
  <div
    style={{
      display: "grid",
      gap: 12,
      gridTemplateColumns:
        "repeat(auto-fit, minmax(220px, 1fr))",
    }}
  >
    {children}
  </div>
);

const Col = ({ children, w, center }) => (
  <div
    style={{
      minWidth: w || "auto",
      display: center ? "flex" : "block",
      alignItems: center ? "center" : "stretch",
      gap: 8,
    }}
  >
    {children}
  </div>
);

const Label = ({ children }) => (
  <label
    style={{
      display: "block",
      fontSize: 13,
      color: "#334155",
      marginBottom: 4,
    }}
  >
    {children}
  </label>
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
    {options.map((op) => (
      <option key={op} value={op}>
        {op}
      </option>
    ))}
  </select>
);

const Check = ({ label, ...props }) => (
  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: 6,
      border: "1px solid #e2e8f0",
      borderRadius: 8,
    }}
  >
    <input type="checkbox" {...props} />
    {label}
  </label>
);

// ===================== App =====================
export default function App() {
  const initialForm = {
    name: "",
    surgeryDate: "",
    surgeryTime: "",
    icuTime: "",
    extubationTime: "",
    reversalMethod: "",
    painMethod: "",
    drug1: "",
    drug2: "",
    ponv: {
      "0-6h": { present: false, times: "", severity: "" },
      "7-24h": { present: false, times: "", severity: "" },
      ">24h": { present: false, times: "", severity: "" },
    },
    vas: { "0-6h": "", "7-24h": "", "ngay2": "", "ngay3": "" },
    bp: { "0-6h": "", "7-24h": "", "ngay2": "", "ngay3": "" },
    temp: { "0-6h": "", "7-24h": "", "ngay2": "", "ngay3": "" },
    otherSymptoms: {
      "0-6h": { notes: "", vasopressor: "", antihypertensive: "" },
      "7-24h": { notes: "", vasopressor: "", antihypertensive: "" },
      "ngay2": { notes: "", vasopressor: "", antihypertensive: "" },
      "ngay3": { notes: "", vasopressor: "", antihypertensive: "" },
    },
  };

  const [form, setForm] = useState(initialForm);
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [filterName, setFilterName] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const querySnapshot = await getDocs(collection(db, "ponv_records"));
    const list = [];
    querySnapshot.forEach((doc) =>
      list.push({ id: doc.id, ...doc.data() })
    );
    setRecords(list);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => {
      const keys = name.split(".");
      const newForm = { ...prev };
      let obj = newForm;
      for (let i = 0; i < keys.length - 1; i++) {
        obj = obj[keys[i]];
      }
      obj[keys[keys.length - 1]] =
        type === "checkbox" ? checked : value;
      return { ...newForm };
    });
  };

  const saveData = async () => {
    if (editingId) {
      await updateDoc(doc(db, "ponv_records", editingId), {
        ...form,
        updated: serverTimestamp(),
      });
      setEditingId(null);
    } else {
      await addDoc(collection(db, "ponv_records"), {
        ...form,
        created: serverTimestamp(),
      });
    }
    setForm(initialForm);
    loadData();
  };

  const editRecord = (rec) => {
    setForm(rec);
    setEditingId(rec.id);
  };

  const deleteRecord = async (id) => {
    if (window.confirm("Xóa bản ghi này?")) {
      await deleteDoc(doc(db, "ponv_records", id));
      loadData();
    }
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(records);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    XLSX.writeFile(wb, "ponv_records.xlsx");
  };

  const filteredRecords = records.filter((rec) => {
    const matchName =
      !filterName ||
      rec.name?.toLowerCase().includes(filterName.toLowerCase());
    const matchFrom = !filterFrom || rec.surgeryDate >= filterFrom;
    const matchTo = !filterTo || rec.surgeryDate <= filterTo;
    return matchName && matchFrom && matchTo;
  });

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Theo dõi PONV</h1>

      {/* Filters */}
      <div style={styles.toolbar}>
        <input
          placeholder="Tìm theo tên..."
          value={filterName}
          onChange={(e) => setFilterName(e.target.value)}
          style={styles.input}
        />
        <input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          style={styles.input}
        />
        <input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          style={styles.input}
        />
        <button
          onClick={() => {
            setFilterName("");
            setFilterFrom("");
            setFilterTo("");
          }}
          style={styles.buttonSecondary}
        >
          Xóa lọc
        </button>
        <button onClick={exportExcel} style={styles.button}>
          Xuất Excel
        </button>
      </div>

      {/* Form */}
      <Card title="Thông tin bệnh nhân">
        <Row>
          <Col>
            <Label>Họ tên</Label>
            <Input name="name" value={form.name} onChange={handleChange} />
          </Col>
          <Col>
            <Label>Ngày phẫu thuật</Label>
            <Input type="date" name="surgeryDate" value={form.surgeryDate} onChange={handleChange} />
          </Col>
          <Col>
            <Label>Giờ phẫu thuật</Label>
            <Input type="time" name="surgeryTime" value={form.surgeryTime} onChange={handleChange} />
          </Col>
          <Col>
            <Label>Giờ ra Hồi sức</Label>
            <Input type="time" name="icuTime" value={form.icuTime} onChange={handleChange} />
          </Col>
          <Col>
            <Label>Giờ rút NKQ</Label>
            <Input type="time" name="extubationTime" value={form.extubationTime} onChange={handleChange} />
          </Col>
        </Row>
      </Card>

      <Card title="Thông tin phẫu thuật">
        <Row>
          <Col>
            <Label>Phương pháp giải giãn cơ</Label>
            <Select name="reversalMethod" value={form.reversalMethod} onChange={handleChange} options={["", "Bridion", "Neostigmin"]} />
          </Col>
          <Col>
            <Label>Phương thức giảm đau</Label>
            <Select name="painMethod" value={form.painMethod} onChange={handleChange} options={["", "Tê NMC", "ESP", "PCA", "Khác"]} />
          </Col>
          <Col>
            <Label>Thuốc 1</Label>
            <Select name="drug1" value={form.drug1} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} />
          </Col>
          <Col>
            <Label>Thuốc 2</Label>
            <Select name="drug2" value={form.drug2} onChange={handleChange} options={["", "Bupivacain", "Fentanyl", "Morphin", "Ketamin", "Khác"]} />
          </Col>
        </Row>
      </Card>

      <Card title="PONV">
        <table style={styles.table}>
          <thead>
            <tr>
              <th></th>
              <th>0 - 6h</th>
              <th>7 - 24h</th>
              <th>> 24h</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Có nôn</td>
              {["0-6h", "7-24h", ">24h"].map((k) => (
                <td key={k}>
                  <input type="checkbox" name={`ponv.${k}.present`} checked={form.ponv[k].present} onChange={handleChange} />
                </td>
              ))}
            </tr>
            <tr>
              <td>Số lần</td>
              {["0-6h", "7-24h", ">24h"].map((k) => (
                <td key={k}>
                  <Input type="number" name={`ponv.${k}.times`} value={form.ponv[k].times} onChange={handleChange} />
                </td>
              ))}
            </tr>
            <tr>
              <td>Mức độ</td>
              {["0-6h", "7-24h", ">24h"].map((k) => (
                <td key={k}>
                  <Select name={`ponv.${k}.severity`} value={form.ponv[k].severity} onChange={handleChange} options={["", "1", "2", "3", "4"]} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="Điểm VAS / HA / Nhiệt độ">
        {["VAS", "HA", "Nhiệt độ"].map((label, idx) => {
          const key = idx === 0 ? "vas" : idx === 1 ? "bp" : "temp";
          return (
            <Row key={key}>
              <Col><Label>{label} 0-6h</Label><Input name={`${key}.0-6h`} value={form[key]["0-6h"]} onChange={handleChange} style={{width:"30%"}} /></Col>
              <Col><Label>{label} 7-24h</Label><Input name={`${key}.7-24h`} value={form[key]["7-24h"]} onChange={handleChange} style={{width:"30%"}} /></Col>
              <Col><Label>{label} Ngày 2</Label><Input name={`${key}.ngay2`} value={form[key]["ngay2"]} onChange={handleChange} style={{width:"30%"}} /></Col>
              <Col><Label>{label} Ngày 3</Label><Input name={`${key}.ngay3`} value={form[key]["ngay3"]} onChange={handleChange} style={{width:"30%"}} /></Col>
            </Row>
          );
        })}
      </Card>

      <Card title="Triệu chứng khác & Ghi chú">
        {["0-6h", "7-24h", "ngay2", "ngay3"].map((k) => (
          <Row key={k}>
            <Col><Label>{k} - Triệu chứng</Label><Input name={`otherSymptoms.${k}.notes`} value={form.otherSymptoms[k].notes} onChange={handleChange} /></Col>
            <Col><Label>Liều vận mạch</Label><Input name={`otherSymptoms.${k}.vasopressor`} value={form.otherSymptoms[k].vasopressor} onChange={handleChange} /></Col>
            <Col><Label>Liều hạ áp</Label><Input name={`otherSymptoms.${k}.antihypertensive`} value={form.otherSymptoms[k].antihypertensive} onChange={handleChange} /></Col>
          </Row>
        ))}
      </Card>

      <button onClick={saveData} style={styles.button}>
        {editingId ? "Cập nhật" : "Lưu"}
      </button>

      {/* Records Table */}
      <h2 style={{ marginTop: 30 }}>Danh sách</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Họ tên</th>
            <th>Ngày mổ</th>
            <th>Giờ mổ</th>
            <th>Giờ ra HS</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filteredRecords.map((rec) => (
            <tr key={rec.id}>
              <td>{rec.name}</td>
              <td>{rec.surgeryDate}</td>
              <td>{rec.surgeryTime}</td>
              <td>{rec.icuTime}</td>
              <td>
                <button onClick={() => editRecord(rec)} style={styles.smallBtn}>Sửa</button>
                <button onClick={() => deleteRecord(rec.id)} style={styles.smallBtnDanger}>Xóa</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===================== Styles =====================
const styles = {
  container: { padding: 18, maxWidth: 1180, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  title: { margin: "4px 0 14px", fontSize: 24 },
  toolbar: { display: "flex", justifyContent: "flex-start", alignItems: "center", marginBottom: 12, gap: 12, flexWrap: "wrap" },
  button: { padding: "10px 14px", background: "#2563eb", color: "#fff", border: "0", borderRadius: 10, cursor: "pointer" },
  buttonSecondary: { padding: "10px 14px", background: "#e2e8f0", color: "#111827", border: "0", borderRadius: 10, cursor: "pointer" },
  smallBtn: { padding: "6px 10px", background: "#2563eb", color: "#fff", border: "0", borderRadius: 8, cursor: "pointer", marginRight: 4 },
  smallBtnDanger: { padding: "6px 10px", background: "#ef4444", color: "#fff", border: "0", borderRadius: 8, cursor: "pointer" },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 10, outline: "none" },
  card: { background: "#ffffff", border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  cardTitle: { fontWeight: 700, color: "#1f2937", borderLeft: "4px solid #2563eb", paddingLeft: 8, marginBottom: 10 },
  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 10, overflow: "hidden" },
  th: { textAlign: "left", background: "#f1f5f9", padding: "10px 8px", borderBottom: "1px solid #e2e8f0", fontWeight: 600 },
  td: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9" },
};
