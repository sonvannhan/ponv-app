import React, { useState } from "react";

export default function App() {
  const [form, setForm] = useState({
    patientName: "",
    age: "",
    surgeryDate: "",
    motionSickness: false,
    smoking: false,
    prevPONV: false,
    bloodLoss: "",
    fluids: "",
    notes: "",
  });

  const [records, setRecords] = useState([]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const saveRecord = () => {
    if (!form.patientName) {
      alert("Vui lòng nhập tên bệnh nhân");
      return;
    }
    const newRecord = {
      ...form,
      time: new Date().toLocaleString(),
    };
    setRecords([newRecord, ...records]);
    setForm({
      patientName: "",
      age: "",
      surgeryDate: "",
      motionSickness: false,
      smoking: false,
      prevPONV: false,
      bloodLoss: "",
      fluids: "",
      notes: "",
    });
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif", maxWidth: 800, margin: "0 auto" }}>
      <h1>Theo dõi Nôn, Buồn nôn sau mổ (PONV)</h1>
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

        <button onClick={saveRecord} style={{ padding: "10px 20px" }}>
          Lưu
        </button>
      </div>

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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
