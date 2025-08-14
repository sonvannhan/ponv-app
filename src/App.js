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
} from "firebase/firestore";
import * as XLSX from "xlsx";

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

  // Trạng thái Tìm kiếm + Lọc theo ngày
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    // Lấy theo thời gian lưu gần đây nhất (nếu có field 'time')
    // Nếu muốn chắc chắn sắp xếp theo ngày mổ, có thể đổi sang orderBy("surgeryDate", "desc")
    const q = query(collection(db, "ponv_records"), orderBy("time", "desc"));
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setRecords(data);
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
    const payload = {
      ...form,
      // Lưu time theo ISO để có thể orderBy ổn định
      time: new Date().toISOString(),
    };

    if (editId) {
      await updateDoc(doc(db, "ponv_records", editId), payload);
      setEditId(null);
    } else {
      await addDoc(collection(db, "ponv_records"), payload);
    }
    setForm(emptyForm);
    fetchRecords();
  };

  const handleEdit = (record) => {
    setForm({
      patientName: record.patientName || "",
      age: record.age || "",
      surgeryDate: record.surgeryDate || "",
      motionSickness: !!record.motionSickness,
      smoking: !!record.smoking,
      prevPONV: !!record.prevPONV,
      bloodLoss: record.bloodLoss || "",
      fluids: record.fluids || "",
      notes: record.notes || "",
    });
    setEditId(record.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (window.confirm("Bạn có chắc muốn xóa bệnh nhân này?")) {
      await deleteDoc(doc(db, "ponv_records", id));
      fetchRecords();
    }
  };

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
  };

  // Lọc theo tên và theo khoảng ngày mổ
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // Tìm kiếm theo tên (không phân biệt hoa/thường)
      const matchSearch = r.patientName
        ? r.patientName.toLowerCase().includes(search.trim().toLowerCase())
        : false;

      // Lọc theo ngày (nếu người dùng chọn)
      const hasFrom = !!dateFrom;
      const hasTo = !!dateTo;
      // r.surgeryDate dạng "YYYY-MM-DD" -> so sánh string đủ dùng,
      // hoặc chuyển Date cho chắc:
      const d = r.surgeryDate ? new Date(r.surgeryDate) : null;
      const from = hasFrom ? new Date(dateFrom) : null;
      const to = hasTo ? new Date(dateTo) : null;

      let inRange = true;
      if (from && d) inRange = inRange && d >= from;
      if (to && d) {
        // bao gồm cả ngày 'to' (đến 23:59:59)
        const toEnd = new Date(to);
        toEnd.setHours(23, 59, 59, 999);
        inRange = inRange && d <= toEnd;
      }

      // Nếu người dùng không nhập tên, vẫn cho qua nhưng phải qua bộ lọc ngày
      // Nếu người dùng có nhập tên, phải matchSearch và inRange
      return (search.trim() ? matchSearch : true) && inRange;
    });
  }, [records, search, dateFrom, dateTo]);

  const exportToExcel = () => {
    const data = filteredRecords.map((r) => ({
      "Họ tên": r.patientName || "",
      "Tuổi": r.age || "",
      "Ngày mổ": r.surgeryDate || "",
      "Say tàu xe": r.motionSickness ? "Có" : "Không",
      "Hút thuốc": r.smoking ? "Có" : "Không",
      "Tiền sử PONV": r.prevPONV ? "Có" : "Không",
      "Máu mất (ml)": r.bloodLoss || "",
      "Dịch truyền (ml)": r.fluids || "",
      "Ghi chú": r.notes || "",
      "Thời gian lưu (ISO)": r.time || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PONV");
    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `ponv_records_${today}.xlsx`);
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 10 }}>Theo dõi Nôn, Buồn nôn sau mổ (PONV)</h1>

      {/* Bộ lọc & Tìm kiếm */}
      <div style={{
        background: "#eef6ff",
        padding: 12,
        borderRadius: 8,
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr auto auto",
        gap: 10,
        alignItems: "end",
        marginBottom: 16
      }}>
        <div>
          <label>Tìm theo tên</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Nhập tên bệnh nhân..."
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div>
          <label>Từ ngày mổ</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <div>
          <label>Đến ngày mổ</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>
        <button onClick={clearFilters} style={{ padding: "10px 14px" }}>
          Xóa lọc
        </button>
        <button onClick={exportToExcel} style={{ padding: "10px 14px" }}>
          Xuất Excel
        </button>
      </div>

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
        {editId && (
          <button
            onClick={() => { setEditId(null); setForm(emptyForm); }}
            style={{
              padding: "10px 20px",
              marginLeft: 10,
              background: "#9e9e9e",
              color: "#fff",
              border: "none",
              cursor: "pointer",
            }}
          >
            Hủy sửa
          </button>
        )}
      </div>

      {/* Danh sách */}
      <h2>Danh sách bệnh nhân ({filteredRecords.length})</h2>
      <div style={{ overflowX: "auto" }}>
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
            {filteredRecords.map((r) => (
              <tr key={r.id}>
                <td>{r.patientName}</td>
                <td>{r.age}</td>
                <td>{r.surgeryDate}</td>
                <td>{r.motionSickness ? "Có" : "Không"}</td>
                <td>{r.smoking ? "Có" : "Không"}</td>
                <td>{r.prevPONV ? "Có" : "Không"}</td>
                <td>{r.bloodLoss}</td>
                <td>{r.fluids}</td>
                <td>{r.notes}</td>
                <td>
                  {r.time
                    ? new Date(r.time).toLocaleString()
                    : ""}
                </td>
                <td>
                  <button
                    onClick={() => handleEdit(r)}
                    style={{
                      padding: "5px 10px",
                      background: "#2196f3",
                      color: "#fff",
                      border: "none",
                      marginRight: 6,
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
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={11} style={{ textAlign: "center", padding: 20 }}>
                  Không có dữ liệu phù hợp
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
