import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Professor = () => {
  const { contract, account } = useContext(Web3Context);
  const [studentId, setStudentId] = useState("");
  const [marks, setMarks] = useState("");
  const [status, setStatus] = useState("");
  const [isProfessor, setIsProfessor] = useState(false);
  
  // Lists State
  const [uploadedStudents, setUploadedStudents] = useState([]);
  const [pendingStudents, setPendingStudents] = useState([]);
  
  // UI Toggles
  const [showUploaded, setShowUploaded] = useState(false);
  const [showPending, setShowPending] = useState(true); // Default to true so they see action required immediately

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  useEffect(() => {
    const checkRole = async () => {
      if (!contract || !account) {
        setIsProfessor(false);
        return;
      }
      try {
        const result = await contract.methods.isProfessor(account).call();
        setIsProfessor(result);
        if (result) {
          fetchStudentData(); // Auto-fetch when we confirm they are a professor
        }
      } catch (err) {
        console.error("Role check failed:", err);
        setIsProfessor(false);
      }
    };
    checkRole();
  }, [contract, account]);

  const handleUpload = async () => {
    if (!isProfessor) {
      setStatus("❌ Only a professor is authorized to upload marksheets.");
      return;
    }

    if (!studentId || !marks) {
      alert("Please fill all fields");
      return;
    }

    try {
      setStatus("Processing transaction...");
      await contract.methods.upload(studentId, marks).send({ from: account });
      
      setStatus("✅ Marksheet uploaded successfully!");
      setStudentId("");
      setMarks("");

      // Refresh both lists immediately after upload so the student moves from Pending -> Uploaded
      fetchStudentData();
    } catch (err) {
      console.error(err.message);
      setStatus("❌ Error uploading marksheet.");
    }
  };

  const fetchStudentData = async () => {
    if (!contract || !account) return;

    try {
      const length = await contract.methods.studentListLength().call();
      const uploaded = [];
      const pending = [];
      const seen = new Set();

      for (let i = 0; i < length; i++) {
        const sId = await contract.methods.studentList(i).call();

        if (seen.has(sId)) continue;
        seen.add(sId);

        const m = await contract.methods.viewMarksheet(sId).call();

        if (m.professorAddress === zeroAddress) {
          // If no professor has claimed this yet, it's pending
          pending.push(m.studentId);
        } else if (m.professorAddress.toLowerCase() === account.toLowerCase()) {
          // If this professor graded it, it goes to their historical tracking
          uploaded.push({
            studentId: m.studentId,
            marks: m.marks,
            isValidated: m.isValidated,
            isUploaded: m.isUploaded,
          });
        }
      }

      setPendingStudents(pending);
      setUploadedStudents(uploaded);
    } catch (err) {
      console.error("Error fetching student data:", err.message);
    }
  };

  return (
    <div className="form-box">
      <h3>Professor Panel</h3>
      
      <div className="upload-form">
        <p>Connected as: {account || "Not connected"}</p>
        <input
          type="number"
          placeholder="Student ID"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        />
        <input
          type="number"
          placeholder="Marks"
          value={marks}
          onChange={(e) => setMarks(e.target.value)}
        />
        <button onClick={handleUpload} disabled={!isProfessor}>
          Upload Marksheet
        </button>
        {!isProfessor && <p style={{ color: "red" }}>Only a professor can upload marksheets.</p>}
        <p className="status-message">{status}</p>
      </div>

      <hr />

      {/* Pending Students */}
      <div className="list-box" style={{ marginBottom: "20px" }}>
        <button
          className="collapsible-button"
          onClick={() => {
            setShowPending(!showPending);
            if (!showPending) fetchStudentData();
          }}
          disabled={!isProfessor}
        >
          📋 Pending Students {showPending ? "▲" : "▼"}
        </button>

        {showPending && (
          <table className="uploaded-students-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingStudents.length > 0 ? (
                pendingStudents.map((id, index) => (
                  <tr key={index}>
                    <td>{id}</td>
                    <td>
                      <button 
                        onClick={() => {
                          setStudentId(id);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Grade Student
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2">No pending students available. All caught up!</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Uploaded Students */}
      <div className="list-box">
        <button
          className="collapsible-button"
          onClick={() => {
            setShowUploaded(!showUploaded);
            if (!showUploaded) fetchStudentData();
          }}
          disabled={!isProfessor}
        >
          ✅ My Uploaded Students {showUploaded ? "▲" : "▼"}
        </button>

        {showUploaded && (
          <table className="uploaded-students-table">
            <thead>
              <tr>
                <th>Student ID</th>
                <th>Marks</th>
                <th>Validated</th>
                <th>Dean Finalized</th>
              </tr>
            </thead>
            <tbody>
              {uploadedStudents.length > 0 ? (
                uploadedStudents.map((s, index) => (
                  <tr key={index}>
                    <td>{s.studentId}</td>
                    <td>{s.marks}</td>
                    <td>{s.isValidated ? "✅" : "❌"}</td>
                    <td>{s.isUploaded ? "✅" : "❌"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4">No marksheets uploaded by you yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Professor;