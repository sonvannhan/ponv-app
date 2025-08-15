import React, { useState, useEffect, useMemo } from "react";
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
  where
} from "firebase/firestore";
import * as XLSX from "xlsx";
import "./App.css";

// ===== Firebase Config (bạn) =====
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

export default function App() {
  const [patients, setPatients] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [editId, setEditId] = useState(null);

  // Form state
  const [form, setForm] = useState({
    name: "",
    age: "",
    surgeryDate: "",
    historyCarSickness: "",
    smoking: "",
    vomitingHistory: "",
    bloodLoss: "",
    fluidIn: "",
    lastMealTime: "",
    extubationTime: "",
    firstDrinkTime: "",
    chestDrainCount: "",
    reversalAgent: "",
    morphineUse: "",
    morphineDose: "",
    analgesiaMethod: "",
    analgesiaDrug: "",
    analgesiaConc: "",
    analgesiaDrug2: "",
    analgesiaConc2: "",
    firstNauseaTime: "",
    nausea0_6h: "",
    severity0_6h: "",
    nausea7_24h: "",
    severity7_24h: "",
    nauseaAfter24h: "",
    severityAfter24h: "",
    vas_0_6h: "",
    vas_7_24h: "",
    vas_day2: "",
    vas_day3: "",
    bp_0_6h: "",
    bp_7_24h: "",
    bp_day2: "",
    bp_day3: "",
    temp_0_6h: "",
    temp_7_24h: "",
    temp_day2: "",
    temp_day3: "",
    symptoms: "",
    notes: ""
  });

  const patientsCollection = useMemo(() => collection(db, "ponv"), []);

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    const data = await getDocs(query(patientsCollection, orderBy("surgeryDate", "desc")));
    setPatients(data.docs.map((doc) => ({ ...doc.data(), id: doc.id })));
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editId) {
      const docRef = doc(db, "ponv", editId);
      await updateDoc(docRef, form);
      setEditId(null);
    } else {
      await addDoc(patientsCollection, form);
    }
    setForm({
      name: "", age: "", surgeryDate: "", historyCarSickness: "", smoking: "",
      vomitingHistory: "", bloodLoss: "", fluidIn: "", lastMealTime: "",
      extubationTime: "", firstDrinkTime: "", chestDrainCount: "", reversalAgent: "",
      morphineUse: "", morphineDose: "", analgesiaMethod: "", analgesiaDrug: "",
      analgesiaConc: "", analgesiaDrug2: "", analgesiaConc2: "", firstNauseaTime: "",
      nausea0_6h: "", severity0_6h: "", nausea7_24h: "", severity7_24h: "",
      nauseaAfter24h: "", severityAfter24h: "", vas_0_6h: "", vas_7_24h: "",
      vas_day2: "", vas_day3: "", bp_0_6h: "", bp_7_24h: "", bp_day2: "", bp_day3: "",
      temp_0_6h: "", temp_7_24h: "", temp_day2: "", temp_day3: "", symptoms: "", notes: ""
    });
    fetchPatients();
  };

  const handleEdit = (patient) => {
    setForm(patient);
    setEditId(patient.id);
  };

  const handleDelete = async (id) => {
    await deleteDoc(doc(db, "ponv", id));
    fetchPatients();
  };

  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(patients);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    XLSX.writeFile(wb, "ponv_data.xlsx");
  };

  // Filter patients
  const filteredPatients = patients.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (!dateFilter || p.surgeryDate === dateFilter)
  );

  return (
    <div className="container">
      <h1>Theo dõi nôn, buồn nôn sau mổ (PONV)</h1>

      {/* Search + Filter */}
      <div className="filter-section">
        <input
          placeholder="Tìm kiếm bệnh nhân..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
        />
        <button onClick={exportExcel}>Xuất Excel</button>
      </div>

      {/* Form nhập liệu */}
      <form onSubmit={handleSubmit}>
        <fieldset>
          <legend>Thông tin bệnh nhân</legend>
          <input name="name" placeholder="Họ tên" value={form.name} onChange={handleChange} />
          <input name="age" placeholder="Tuổi" value={form.age} onChange={handleChange} />
          <input name="surgeryDate" type="date" placeholder="Ngày phẫu thuật" value={form.surgeryDate} onChange={handleChange} />
        </fieldset>
        
        <fieldset>
          <legend>Tiền sử</legend>
          <input name="historyCarSickness" placeholder="Tiền sử say tàu xe" value={form.historyCarSickness} onChange={handleChange} />
          <input name="smoking" placeholder="Hút thuốc lá/thuốc lào" value={form.smoking} onChange={handleChange} />
          <input name="vomitingHistory" placeholder="Tiền sử nôn/buồn nôn" value={form.vomitingHistory} onChange={handleChange} />
        </fieldset>
        
        <fieldset>
          <legend>Trong mổ</legend>
          <input name="bloodLoss" placeholder="Lượng máu mất (ml)" value={form.bloodLoss} onChange={handleChange} />
          <input name="fluidIn" placeholder="Dịch truyền (ml)" value={form.fluidIn} onChange={handleChange} />
        </fieldset>

        <fieldset>
          <legend>Hồi sức sau mổ</legend>
          <input name="lastMealTime" placeholder="Giờ ăn cuối trước mổ" value={form.lastMealTime} onChange={handleChange} />
          <input name="extubationTime" placeholder="Giờ rút NKQ" value={form.extubationTime} onChange={handleChange} />
          <input name="firstDrinkTime" placeholder="Giờ uống lần đầu" value={form.firstDrinkTime} onChange={handleChange} />
          <input name="chestDrainCount" placeholder="Số DL màng phổi" value={form.chestDrainCount} onChange={handleChange} />
        </fieldset>

        <fieldset>
          <legend>Triệu chứng buồn nôn/nôn</legend>
          <input name="firstNauseaTime" placeholder="Lần đầu buồn nôn/nôn" value={form.firstNauseaTime} onChange={handleChange} />
          <input name="nausea0_6h" placeholder="Số lần 0-6h" value={form.nausea0_6h} onChange={handleChange} />
          <input name="severity0_6h" placeholder="Mức độ 0-6h" value={form.severity0_6h} onChange={handleChange} />
          <input name="nausea7_24h" placeholder="Số lần 7-24h" value={form.nausea7_24h} onChange={handleChange} />
          <input name="severity7_24h" placeholder="Mức độ 7-24h" value={form.severity7_24h} onChange={handleChange} />
        </fieldset>
        