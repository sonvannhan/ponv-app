import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore";
import * as XLSX from "xlsx";
import "./App.css";

/* ===================== Firebase Config (bạn) ===================== */
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

/* ===================== DEFAULT SHAPE (dùng để upgrade dữ liệu cũ) ===================== */
const DEFAULT_FORM = {
  // Thông tin cơ bản
  name: "",
  age: "",
  gender: "", // tùy chọn
  surgeryDate: "",

  // Tiền sử (Yes/No → checkbox)
  historyCarSickness: false, // Tiền sử say tàu xe
  smoking: false, // Hút thuốc lá/thuốc lào
  vomitingHistoryPostOp: false, // Tiền sử nôn/buồn nôn sau mổ
  // Trong mổ / hồi sức
  bloodLoss: "",
  fluidIn: "",
  lastMealTime: "",
  extubationTime: "",
  firstDrinkTime: "",
  chestDrainCount: "",

  // Thuốc giảm đau / gây tê
  reversalAgent: "",
  morphineUse: false, // Dùng Morphin sau mổ (checkbox)
  morphineDose: "",
  analgesiaMethod: "",
  analgesiaDrug: "",
  analgesiaConc: "",
  analgesiaDrug2: "",
  analgesiaConc2: "",

  // Khối PONV theo thời gian
  ponv_0_6: { present: false, times: "", severity: "" },
  ponv_7_24: { present: false, times: "", severity: "" },
  ponv_after24: { present: false, times: "", severity: "" },

  // Điểm đau VAS
  vas_0_6h: "",
  vas_7_24h: "",
  vas_day2: "",
  vas_day3: "",

  // Huyết áp
  bp_0_6h: "",
  bp_7_24h: "",
  bp_day2: "",
  bp_day3: "",

  // Nhiệt độ
  temp_0_6h: "",
  temp_7_24h: "",
  temp_day2: "",
  temp_day3: "",

  // Triệu chứng khác (checkbox Yes/No)
  symptom_epigastricPain: false, // Đau thượng vị
  symptom_headacheDizziness: false, // Đau đầu/Chóng mặt
  symptom_urinaryRetentionCatheter: false, // Bí tiểu/Sonde tiểu

  // Ghi chú chung
  symptomsNote: "",
  notes: "",
};

/* ===================== Utils cho upgrade dữ liệu cũ ===================== */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepGet(obj, path) {
  return path.split(".").reduce((acc, k) => (acc ? acc[k] : ""), obj);
}

function deepSet(obj, path, value) {
  const keys = path.split(".");
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  return obj;
}

function mergeDeep(target, source) {
  if (typeof target !== "object" || target === null) return clone(source);
  const out = Array.isArray(target) ? [...target] : { ...target };
  Object.keys(source).forEach((key) => {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      out[key] = mergeDeep(out[key] ?? {}, source[key]);
    } else {
      if (out[key] === undefined) out[key] = source[key];
    }
  });
  return out;
}

function applyDefaults(record) {
  // Không làm mất giá trị cũ; chỉ bổ sung trường mới nếu thiếu
  const defaults = clone(DEFAULT_FORM);
  // Giữ id nếu có
  const id = record?.id;
  const merged = mergeDeep(record || {}, defaults);
  if (id) merged.id = id;
  return merged;
}

/* ===================== Component chính ===================== */
export default function App() {
  const [patients, setPatients] = useState([]);
  const [form, setForm] = useState(clone(DEFAULT_FORM));
  const [editId, setEditId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const patientsCol = useMemo(() => collection(db, "ponv"), []);

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchPatients() {
    const snap = await getDocs(query(patientsCol, orderBy("surgeryDate", "desc")));
    const list = snap.docs.map((d) => {
      const raw = { id: d.id, ...d.data() };
      // Áp default để bảo toàn record cũ (upgrade mềm)
      return applyDefaults(raw);
    });
    setPatients(list);
  }

  // Handler chung cho input + checkbox + name dạng "a.b.c"
  function handleChange(e) {
    const { name, type } = e.target;
    const value = type === "checkbox" ? e.target.checked : e.target.value;
    setForm((prev) => {
      const next = clone(prev);
      deepSet(next, name, value);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const payload = applyDefaults(form); // đảm bảo đủ trường
    try {
      if (editId) {
        // Merge để không mất các trường cũ trong record
        const ref = doc(db, "ponv", editId);
        await setDoc(ref, payload, { merge: true });
      } else {
        await addDoc(patientsCol, payload);
      }
      setForm(clone(DEFAULT_FORM));
      setEditId(null);
      await fetchPatients();
      alert("Đã lưu!");
    } catch (err) {
      console.error(err);
      alert("Lỗi lưu dữ liệu!");
    }
  }

  function handleEdit(p) {
    const { id, ...rest } = p;
    setForm(applyDefaults(rest));
    setEditId(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!window.confirm("Xóa record này?")) return;
    await deleteDoc(doc(db, "ponv", id));
    await fetchPatients();
  }

  function exportExcel() {
    // xuất theo danh sách đang lọc
    const rows = filteredPatients.map((p) => {
      // dàn phẳng một số trường tổ hợp cho Excel
      return {
        Họ_tên: p.name,
        Tuổi: p.age,
        Ngày_mổ: p.surgeryDate,
        Say_tàu_xe: p.historyCarSickness ? "Có" : "Không",
        Hút_thuốc: p.smoking ? "Có" : "Không",
        Tiền_sử_PONV: p.vomitingHistoryPostOp ? "Có" : "Không",
        Morphin_sau_mổ: p.morphineUse ? "Có" : "Không",
        Liều_Morphin: p.morphineDose,
        Máu_mất_ml: p.bloodLoss,
        Dịch_truyền_ml: p.fluidIn,
        Lần_ăn_cuối: p.lastMealTime,
        Giờ_rút_NKQ: p.extubationTime,
        Uống_lần_đầu: p.firstDrinkTime,
        Số_DL_màng_phổi: p.chestDrainCount,

        PONV_0_6_present: p.ponv_0_6?.present ? "Có" : "Không",
        PONV_0_6_times: p.ponv_0_6?.times || "",
        PONV_0_6_severity: p.ponv_0_6?.severity || "",

        PONV_7_24_present: p.ponv_7_24?.present ? "Có" : "Không",
        PONV_7_24_times: p.ponv_7_24?.times || "",
        PONV_7_24_severity: p.ponv_7_24?.severity || "",

        PONV_after24_present: p.ponv_after24?.present ? "Có" : "Không",
        PONV_after24_times: p.ponv_after24?.times || "",
        PONV_after24_severity: p.ponv_after24?.severity || "",

        VAS_0_6h: p.vas_0_6h,
        VAS_7_24h: p.vas_7_24h,
        VAS_day2: p.vas_day2,
        VAS_day3: p.vas_day3,

        HA_0_6h: p.bp_0_6h,
        HA_7_24h: p.bp_7_24h,
        HA_day2: p.bp_day2,
        HA_day3: p.bp_day3,

        Sot_0_6h: p.temp_0_6h,
        Sot_7_24h: p.temp_7_24h,
        Sot_day2: p.temp_day2,
        Sot_day3: p.temp_day3,

        Đau_thượng_vị: p.symptom_epigastricPain ? "Có" : "Không",
        Đau_đầu_Chóng_mặt: p.symptom_headacheDizziness ? "Có" : "Không",
        Bí_tiểu_Sonde_tiểu: p.symptom_urinaryRetentionCatheter ? "Có" : "Không",

        Ghi_chú_triệu_chứng: p.symptomsNote,
        Ghi_chú_khác: p.notes,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    XLSX.writeFile(wb, "ponv_data.xlsx");
  }

  const filteredPatients = patients.filter((p) => {
    const okName = p.name?.toLowerCase().includes(searchTerm.toLowerCase());
    const okDate = !dateFilter || p.surgeryDate === dateFilter;
    return okName && okDate;
  });

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Theo dõi nôn, buồn nôn sau mổ (PONV)</h1>

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <input
            style={styles.input}
            placeholder="Tìm bệnh nhân..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <input
            style={styles.input}
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
          />
        </div>
        <div style={styles.toolbarLeft}>
          <button style={styles.button} onClick={exportExcel}>Xuất Excel</button>
          <button
            style={styles.buttonSecondary}
            onClick={() => {
              setForm(clone(DEFAULT_FORM));
              setEditId(null);
            }}
          >
            Tạo mới
          </button>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="grid" style={styles.grid}>
        <Card title="Thông tin bệnh nhân">
          <Row>
            <Col>
              <Label>Họ tên</Label>
              <Input name="name" value={form.name} onChange={handleChange} placeholder="Nguyễn Văn A" />
            </Col>
            <Col>
              <Label>Tuổi</Label>
              <Input name="age" value={form.age} onChange={handleChange} placeholder="65" type="number" />
            </Col>
            <Col>
              <Label>Giới tính</Label>
              <Input name="gender" value={form.gender} onChange={handleChange} placeholder="Nam/Nữ" />
            </Col>
            <Col>
              <Label>Ngày phẫu thuật</Label>
              <Input name="surgeryDate" value={form.surgeryDate} onChange={handleChange} type="date" />
            </Col>
          </Row>
        </Card>

        <Card title="Tiền sử & yếu tố nguy cơ">
          <Row>
            <Col w="220px" center>
              <Check
                name="historyCarSickness"
                checked={!!form.historyCarSickness}
                onChange={handleChange}
                label="Tiền sử say tàu xe"
              />
            </Col>
            <Col w="220px" center>
              <Check
                name="smoking"
                checked={!!form.smoking}
                onChange={handleChange}
                label="Hút thuốc lá/thuốc lào"
              />
            </Col>
            <Col w="280px" center>
              <Check
                name="vomitingHistoryPostOp"
                checked={!!form.vomitingHistoryPostOp}
                onChange={handleChange}
                label="Tiền sử nôn/buồn nôn sau mổ"
              />
            </Col>
          </Row>
        </Card>

        <Card title="Trong mổ / Hồi sức">
          <Row>
            <Col>
              <Label>Lượng máu mất (ml)</Label>
              <Input name="bloodLoss" value={form.bloodLoss} onChange={handleChange} type="number" placeholder="0" />
            </Col>
            <Col>
              <Label>Dịch truyền (ml)</Label>
              <Input name="fluidIn" value={form.fluidIn} onChange={handleChange} type="number" placeholder="0" />
            </Col>
            <Col>
              <Label>Lần ăn cuối trước mổ</Label>
              <Input name="lastMealTime" value={form.lastMealTime} onChange={handleChange} placeholder="HH:mm" />
            </Col>
            <Col>
              <Label>Giờ rút NKQ</Label>
              <Input name="extubationTime" value={form.extubationTime} onChange={handleChange} placeholder="HH:mm" />
            </Col>
            <Col>
              <Label>Uống lần đầu</Label>
              <Input name="firstDrinkTime" value={form.firstDrinkTime} onChange={handleChange} placeholder="HH:mm" />
            </Col>
            <Col>
              <Label>Số DL màng phổi</Label>
              <Input name="chestDrainCount" value={form.chestDrainCount} onChange={handleChange} type="number" placeholder="0" />
            </Col>
          </Row>
        </Card>

        <Card title="Giảm đau & thuốc">
          <Row>
            <Col>
              <Label>Thuốc đối kháng (nếu có)</Label>
              <Input name="reversalAgent" value={form.reversalAgent} onChange={handleChange} placeholder="Tên/liều" />
            </Col>
            <Col w="240px" center>
              <Check
                name="morphineUse"
                checked={!!form.morphineUse}
                onChange={handleChange}
                label="Dùng Morphin sau mổ"
              />
            </Col>
            <Col>
              <Label>Liều Morphin</Label>
              <Input name="morphineDose" value={form.morphineDose} onChange={handleChange} placeholder="mg / 24h" />
            </Col>
          </Row>
          <Row>
            <Col>
              <Label>Phương pháp giảm đau</Label>
              <Input name="analgesiaMethod" value={form.analgesiaMethod} onChange={handleChange} placeholder="VD: PCA, giảm đau ngoài màng cứng..." />
            </Col>
            <Col>
              <Label>Thuốc 1</Label>
              <Input name="analgesiaDrug" value={form.analgesiaDrug} onChange={handleChange} placeholder="Tên thuốc" />
            </Col>
            <Col>
              <Label>Nồng độ 1</Label>
              <Input name="analgesiaConc" value={form.analgesiaConc} onChange={handleChange} placeholder="Nồng độ" />
            </Col>
            <Col>
              <Label>Thuốc 2</Label>
              <Input name="analgesiaDrug2" value={form.analgesiaDrug2} onChange={handleChange} placeholder="Tên thuốc" />
            </Col>
            <Col>
              <Label>Nồng độ 2</Label>
              <Input name="analgesiaConc2" value={form.analgesiaConc2} onChange={handleChange} placeholder="Nồng độ" />
            </Col>
          </Row>
        </Card>

        <Card title="PONV theo thời gian">
          <TimeBlock
            label="0 - 6 giờ"
            base="ponv_0_6"
            value={form.ponv_0_6}
            onChange={handleChange}
          />
          <TimeBlock
            label="7 - 24 giờ"
            base="ponv_7_24"
            value={form.ponv_7_24}
            onChange={handleChange}
          />
          <TimeBlock
            label="> 24 giờ"
            base="ponv_after24"
            value={form.ponv_after24}
            onChange={handleChange}
          />
        </Card>

        <Card title="Điểm VAS / HA / Nhiệt độ">
          <Row>
            <Col>
              <Label>VAS 0-6h</Label>
              <Input name="vas_0_6h" value={form.vas_0_6h} onChange={handleChange} />
            </Col>
            <Col>
              <Label>VAS 7-24h</Label>
              <Input name="vas_7_24h" value={form.vas_7_24h} onChange={handleChange} />
            </Col>
            <Col>
              <Label>VAS Ngày 2</Label>
              <Input name="vas_day2" value={form.vas_day2} onChange={handleChange} />
            </Col>
            <Col>
              <Label>VAS Ngày 3</Label>
              <Input name="vas_day3" value={form.vas_day3} onChange={handleChange} />
            </Col>
          </Row>
          <Row>
            <Col>
              <Label>HA 0-6h</Label>
              <Input name="bp_0_6h" value={form.bp_0_6h} onChange={handleChange} />
            </Col>
            <Col>
              <Label>HA 7-24h</Label>
              <Input name="bp_7_24h" value={form.bp_7_24h} onChange={handleChange} />
            </Col>
            <Col>
              <Label>HA Ngày 2</Label>
              <Input name="bp_day2" value={form.bp_day2} onChange={handleChange} />
            </Col>
            <Col>
              <Label>HA Ngày 3</Label>
              <Input name="bp_day3" value={form.bp_day3} onChange={handleChange} />
            </Col>
          </Row>
          <Row>
            <Col>
              <Label>Sốt/Max 0-6h</Label>
              <Input name="temp_0_6h" value={form.temp_0_6h} onChange={handleChange} />
            </Col>
            <Col>
              <Label>Sốt/Max 7-24h</Label>
              <Input name="temp_7_24h" value={form.temp_7_24h} onChange={handleChange} />
            </Col>
            <Col>
              <Label>Sốt/Max Ngày 2</Label>
              <Input name="temp_day2" value={form.temp_day2} onChange={handleChange} />
            </Col>
            <Col>
              <Label>Sốt/Max Ngày 3</Label>
              <Input name="temp_day3" value={form.temp_day3} onChange={handleChange} />
            </Col>
          </Row>
        </Card>

        <Card title="Triệu chứng khác & Ghi chú">
          <Row>
            <Col w="220px" center>
              <Check
                name="symptom_epigastricPain"
                checked={!!form.symptom_epigastricPain}
                onChange={handleChange}
                label="Đau thượng vị"
              />
            </Col>
            <Col w="240px" center>
              <Check
                name="symptom_headacheDizziness"
                checked={!!form.symptom_headacheDizziness}
                onChange={handleChange}
                label="Đau đầu/Chóng mặt"
              />
            </Col>
            <Col w="260px" center>
              <Check
                name="symptom_urinaryRetentionCatheter"
                checked={!!form.symptom_urinaryRetentionCatheter}
                onChange={handleChange}
                label="Bí tiểu/Sonde tiểu"
              />
            </Col>
          </Row>
          <Row>
            <Col>
              <Label>Ghi chú triệu chứng</Label>
              <textarea
                name="symptomsNote"
                style={styles.textarea}
                value={form.symptomsNote}
                onChange={handleChange}
                placeholder="Mô tả thêm triệu chứng..."
              />
            </Col>
            <Col>
              <Label>Ghi chú khác</Label>
              <textarea
                name="notes"
                style={styles.textarea}
                value={form.notes}
                onChange={handleChange}
                placeholder="Ghi chú thêm..."
              />
            </Col>
          </Row>
        </Card>

        <div style={{ display: "flex", gap: 10 }}>
          <button type="submit" style={styles.button}>
            {editId ? "Cập nhật" : "Thêm mới"}
          </button>
          {editId && (
            <button
              type="button"
              style={styles.buttonSecondary}
              onClick={() => {
                setForm(clone(DEFAULT_FORM));
                setEditId(null);
              }}
            >
              Hủy sửa
            </button>
          )}
        </div>
      </form>

      {/* Bảng dữ liệu */}
      <Card title="Danh sách bệnh nhân">
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Họ tên</th>
                <th style={styles.th}>Tuổi</th>
                <th style={styles.th}>Ngày mổ</th>
                <th style={styles.th}>Say xe</th>
                <th style={styles.th}>Hút thuốc</th>
                <th style={styles.th}>Tiền sử PONV</th>
                <th style={styles.th}>Morphin</th>
                <th style={styles.th}>Máu mất (ml)</th>
                <th style={styles.th}>Dịch (ml)</th>
                <th style={styles.th}>0-6h</th>
                <th style={styles.th}>7-24h</th>
                <th style={styles.th}>&gt;24h</th>
                <th style={styles.th}>Hành động</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((p) => (
                <tr key={p.id}>
                  <td style={styles.td}>{p.name}</td>
                  <td style={styles.td}>{p.age}</td>
                  <td style={styles.td}>{p.surgeryDate}</td>
                  <td style={styles.td}>{p.historyCarSickness ? "Có" : "Không"}</td>
                  <td style={styles.td}>{p.smoking ? "Có" : "Không"}</td>
                  <td style={styles.td}>{p.vomitingHistoryPostOp ? "Có" : "Không"}</td>
                  <td style={styles.td}>
                    {p.morphineUse ? `Có (${p.morphineDose || "-"})` : "Không"}
                  </td>
                  <td style={styles.td}>{p.bloodLoss}</td>
                  <td style={styles.td}>{p.fluidIn}</td>
                  <td style={styles.td}>{ponvStr(p.ponv_0_6)}</td>
                  <td style={styles.td}>{ponvStr(p.ponv_7_24)}</td>
                  <td style={styles.td}>{ponvStr(p.ponv_after24)}</td>
                  <td style={styles.td}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={styles.smallBtn} onClick={() => handleEdit(p)}>Sửa</button>
                      <button
                        style={styles.smallBtnDanger}
                        onClick={() => handleDelete(p.id)}
                      >
                        Xóa
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredPatients.length === 0 && (
                <tr>
                  <td style={styles.td} colSpan={13}>Không có dữ liệu phù hợp.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ===================== UI Helpers ===================== */
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
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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
    style={{ display: "block", fontSize: 13, color: "#334155", marginBottom: 4 }}
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
      userSelect: "none",
    }}
  >
    <input type="checkbox" {...props} />
    {label}
  </label>
);

const TimeBlock = ({ label, base, value, onChange }) => (
  <div
    style={{
      border: "1px dashed #cbd5e1",
      borderRadius: 10,
      padding: 12,
      marginTop: 8,
    }}
  >
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

/* ===================== Helpers khác ===================== */
function ponvStr(p) {
  if (!p) return "";
  const has = p.present ? "Có" : "Không";
  const times = p.times ? `, SL: ${p.times}` : "";
  const sev = p.severity ? `, Mức: ${p.severity}` : "";
  return `${has}${times}${sev}`;
}

/* ===================== Styles ===================== */
const styles = {
  container: {
    padding: 18,
    maxWidth: 1180,
    margin: "0 auto",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },
  title: { margin: "4px 0 14px", fontSize: 24 },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
    flexWrap: "wrap",
  },
  toolbarLeft: { display: "flex", gap: 8, flexWrap: "wrap" },
  button: {
    padding: "10px 14px",
    background: "#2563eb",
    color: "#fff",
    border: "0",
    borderRadius: 10,
    cursor: "pointer",
  },
  buttonSecondary: {
    padding: "10px 14px",
    background: "#e2e8f0",
    color: "#111827",
    border: "0",
    borderRadius: 10,
    cursor: "pointer",
  },
  smallBtn: {
    padding: "6px 10px",
    background: "#2563eb",
    color: "#fff",
    border: "0",
    borderRadius: 8,
    cursor: "pointer",
  },
  smallBtnDanger: {
    padding: "6px 10px",
    background: "#ef4444",
    color: "#fff",
    border: "0",
    borderRadius: 8,
    cursor: "pointer",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    outline: "none",
  },
  textarea: {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    outline: "none",
    minHeight: 90,
  },
  grid: { display: "grid", gap: 12 },
  card: {
    background: "#ffffff",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 14,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    marginBottom: 12,
  },
  cardTitle: {
    fontWeight: 700,
    color: "#1f2937",
    borderLeft: "4px solid #2563eb",
    paddingLeft: 8,
    marginBottom: 10,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    background: "#fff",
    borderRadius: 10,
    overflow: "hidden",
  },
  th: {
    textAlign: "left",
    background: "#f1f5f9",
    padding: "10px 8px",
    borderBottom: "1px solid #e2e8f0",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  td: { padding: "8px 8px", borderBottom: "1px solid #f1f5f9" },
};