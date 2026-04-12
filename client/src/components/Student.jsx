import React, { useState, useContext } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Student = () => {
  const { contract } = useContext(Web3Context);
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState(null);

  const fetchStudentDetails = async () => {
    if (!studentId) {
      setStatus("❌ Please enter a Student ID.");
      setData(null);
      return;
    }

    try {
      const marksheet = await contract.methods.viewMarksheet(studentId).call();

      if (
        marksheet.professorAddress === "0x0000000000000000000000000000000000000000"
      ) {
        setData(null);
        setStatus("❌ Marksheet for this Student ID does not exist.");
        return;
      }

      if (!marksheet.isValidated) {
        setData(null);
        setStatus("❌ Marksheet has not been validated by Associate Dean.");
        return;
      }

      if (!marksheet.isUploaded) {
        setData(null);
        setStatus("❌ Marksheet has not been uploaded/finalized by Dean.");
        return;
      }

      setData(marksheet);
      setStatus("✅ Marksheet successfully retrieved.");
    } catch (err) {
      console.error("Error fetching student data:", err);
      setStatus("❌ Error fetching student data.");
      setData(null);
    }
  };

  return (
    <div className="form-box">
      <h3>Student Panel</h3>
      <div className="upload-form">
        <input
          type="number"
          placeholder="Enter your Student ID"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        />
        <button onClick={fetchStudentDetails}>View Marksheet</button>

        {status && <p className="status-message">{status}</p>}

        {data && (
          <div className="marksheet-details">
            <p><strong>Marksheet Details:</strong></p>
            <p><strong>Student ID:</strong> {data.studentId}</p>
            <p><strong>Marks:</strong> {data.marks}</p>
            <p><strong>Professor Address:</strong> {data.professorAddress}</p>
            <p><strong>Validated:</strong> {data.isValidated ? "Yes" : "No"}</p>
            <p><strong>Validated By:</strong> {data.validatedBy}</p>
            <p><strong>Validation Timestamp:</strong> {data.timestamp}</p>
            <p><strong>Uploaded by Dean:</strong> {data.isUploaded ? "Yes" : "No"}</p>
            <p><strong>Uploaded By (Dean):</strong> {data.uploadedBy}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Student;
