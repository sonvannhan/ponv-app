import React, { useState, useEffect } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc
} from "firebase/firestore";

// ===== Firebase Config của bạn =====
const firebaseConfig = {
  apiKey: "AIzaSyBBnK4v8Vm64zXN7W2HYnRx19gKRuuFTcU",
  authDomain: "ponv-tracker.firebaseapp.com",
  projectId: "ponv-tracker",
  storageBucket: "ponv-tracker.firebasestorage.app",
  messagingSenderId: "295019782369",
  appId: "1:295019782369:web:4309b3debefa6955c717a0"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export default function App() {
  const emptyForm = {
    patientName: "",
    age: "",
    surgeryDate: "",
    motionSickness: false,
    smoking: false,
    prevPONV: false,
    bloodLoss: "",
    fluids: "",
    notes: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [records, setRecords] = useState([]);
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    const querySnapshot = await getDocs(collection(db, "ponv_records"));
    let data = [];
    querySnapshot.forEach((docSnap) => {
      data.push({ id: docSnap.id, ...docSnap.data() });
    });
    setRecords(data.reverse());
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const saveRecord = async () => {
    if (!form.patientName) {
      alert("Vui lòng nhập tên bệnh nhân");
      return;
    }
    if (editId) {
      const docRef = doc(db, "ponv_records", editId);
      await updateDoc(docRef, { ...form, time: new Date().toLocaleString() });
      setEditId(null);
    } else {
      await addDoc(collection(db, "ponv_records"), {
        ...form,
        time: new Date().toLocaleString(),
      });
    }
    setForm(emptyForm);
    fetchRecords();
  };

  const handleEdit = (record) => {
    setForm({
      patientName: record.patientName,
      age: record.age,
      surgeryDate: record.surgeryDate,
      motionSickness: record.motionSickness,
      smoking: record.smoking,
      prevPONV: record.prevPONV,
      bloodLoss: record.bloodLoss,
      fluids: record.fluids,
      notes: record.notes,
    });
    setEditId(record.id);
  };

  const handleDelete = async (id) => {
    if (window.confirm("Bạn có chắc muốn xóa bệnh nhân này?")) {
      await deleteDoc(doc(db, "ponv_records", id));
      fetchRecords();
    }
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 900, margin: "0 auto" }}>
      <h1>Theo dõi Nôn, Buồn nôn sau mổ (PONV)</h1>

      {/* Form nhập */}
      <div style={{ marginBottom: 20, background: "#f9f9f9", padding: 15, borderRadius: 8 }}>
        <label>Họ tên bệnh nhân:</label>
        <input
          name="patientName"
          value={form.patientName}
          onChange={handleChange}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <label>Tuổi:</label>
        <input
          name="age"
          type="number"
          value={form.age}
          onChange={handleChange}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <label>Ngày phẫu thuật:</label>
        <input
          name="surgeryDate"
          type="date"
          value={form.surgeryDate}
          onChange={handleChange}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <label>
          <input
            type="checkbox"
            name="motionSickness"
            checked={form.motionSickness}
            onChange={handleChange}
          />{" "}
          Say tàu xe
        </label>
        <br />

        <label>
          <input
            type="checkbox"
            name="smoking"
            checked={form.smoking}
            onChange={handleChange}
          />{" "}
          Hút thuốc
        </label>
        <br />

        <label>
          <input
            type="checkbox"
            name="prevPONV"
            checked={form.prevPONV}
            onChange={handleChange}
          />{" "}
          Tiền sử PONV
        </label>
        <br />

        <label>Lượng máu mất (ml):</label>
        <input
          name="bloodLoss"
          type="number"
          value={form.bloodLoss}
          onChange={handleChange}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <label>Dịch truyền (ml):</label>
        <input
          name="fluids"
          type="number"
          value={form.fluids}
          onChange={handleChange}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <label>Ghi chú:</label>
        <textarea
          name="notes"
          value={form.notes}
          onChange={handleChange}
          style={{ width: "100%", padding: 8, marginBottom: 10 }}
        />

        <button
          onClick={saveRecord}
          style={{
            padding: "10px 20px",
            background: editId ? "#ff9800" : "#4caf50",
            color: "#fff",
            border: "none",
            cursor: "pointer",
          }}
        >
          {editId ? "Cập nhật" : "Lưu"}
        </button>
      </div>

      {/* Danh sách */}
      <h2>Danh sách bệnh nhân</h2>
      <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Họ tên</th>
            <th>Tuổi</th>
            <th>Ngày mổ</th>
            <th>Say tàu xe</th>
            <th>Hút thuốc</th>
            <th>Tiền sử PONV</th>
            <th>Máu mất (ml)</th>
            <th>Dịch truyền (ml)</th>
            <th>Ghi chú</th>
            <th>Thời gian lưu</th>
            <th>Hành động</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr key={i}>
              <td>{r.patientName}</td>
              <td>{r.age}</td>
              <td>{r.surgeryDate}</td>
              <td>{r.motionSickness ? "Có" : "Không"}</td>
              <td>{r.smoking ? "Có" : "Không"}</td>
              <td>{r.prevPONV ? "Có" : "Không"}</td>
              <td>{r.bloodLoss}</td>
              <td>{r.fluids}</td>
              <td>{r.notes}</td>
              <td>{r.time}</td>
              <td>
                <button
                  onClick={() => handleEdit(r)}
                  style={{
                    padding: "5px 10px",
                    background: "#2196f3",
                    color: "#fff",
                    border: "none",
                    marginRight: 5,
                    cursor: "pointer",
                  }}
                >
                  Sửa
                </button>
                <button
                  onClick={() => handleDelete(r.id)}
                  style={{
                    padding: "5px 10px",
                    background: "#f44336",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
