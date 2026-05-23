import React, { useState, useContext, useEffect } from "react";
import { Web3Context } from "../contexts/Web3Context";

const Professor = () => {
  const { contract, account } = useContext(Web3Context);
  
  // Role & Global State
  const [isProfessor, setIsProfessor] = useState(false);
  const [allStudentsData, setAllStudentsData] = useState([]);
  const [authorizedSubjects, setAuthorizedSubjects] = useState([]);
  const [activeSubjectTab, setActiveSubjectTab] = useState("");
  const [status, setStatus] = useState("");

  // UI Mode Toggle
  const [inputMode, setInputMode] = useState("single"); // "single" or "batch"

  // Single Manual Input State
  const [studentId, setStudentId] = useState("");
  const [selectedSubject, setSelectedSubject] = useState("");
  const [dropdownSubjects, setDropdownSubjects] = useState([]);
  const [marks, setMarks] = useState("");
  const [gradedRecordInfo, setGradedRecordInfo] = useState(null);

  // Batch CSV Input State
  const [batchSubject, setBatchSubject] = useState("");
  const [csvFile, setCsvFile] = useState(null);

  const zeroAddress = "0x0000000000000000000000000000000000000000";

  // 1. Check Role & Auto-Fetch
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
          fetchStudentData();
        }
      } catch (err) {
        console.error("Role check failed:", err);
        setIsProfessor(false);
      }
    };
    checkRole();
  }, [contract, account]);

  // 2. Fetch All Data & Calculate Permissions
  const fetchStudentData = async () => {
    if (!contract || !account) return;

    try {
      const length = await contract.methods.studentListLength().call();
      const allStudents = [];
      const uniqueSubjects = new Set();

      // Fetch every student's dynamic results array
      for (let i = 0; i < length; i++) {
        const sId = await contract.methods.studentList(i).call();
        try {
          const m = await contract.methods.viewMarksheet(sId).call({ from: account });
          if (m.studentWallet !== zeroAddress) {
            allStudents.push(m);
            m.results.forEach(r => uniqueSubjects.add(r.subjectId));
          }
        } catch (innerErr) {
          console.warn(`Skipping student ${sId}`);
        }
      }

      // Check which of those subjects the professor is actually assigned to
      const authSubjects = [];
      for (let sub of uniqueSubjects) {
        const hasPerm = await contract.methods.professorPermissions(account, sub).call();
        if (hasPerm) authSubjects.push(sub);
      }

      setAuthorizedSubjects(authSubjects);
      setAllStudentsData(allStudents);

      // Default to the first authorized subject for the lists
      if (!activeSubjectTab && authSubjects.length > 0) {
        setActiveSubjectTab(authSubjects[0]);
        setBatchSubject(authSubjects[0]);
      }
    } catch (err) {
      console.error("Error fetching student data:", err.message);
    }
  };

  // 3. Smart Dropdown Logic (For Single Upload)
  useEffect(() => {
    if (!studentId) {
      setDropdownSubjects([]);
      setGradedRecordInfo(null);
      return;
    }

    const student = allStudentsData.find(s => s.studentId.toString() === studentId.toString());
    
    if (student) {
      // Find intersection: Subjects student takes AND Professor is allowed to grade
      const overlap = student.results
        .filter(r => authorizedSubjects.includes(r.subjectId))
        .map(r => r.subjectId);
      
      setDropdownSubjects(overlap);
      
      // Auto-select the first valid subject if not already selected
      if (!overlap.includes(selectedSubject) && overlap.length > 0) {
        setSelectedSubject(overlap[0]);
      } else if (overlap.length === 0) {
        setSelectedSubject("");
      }

      // If a subject is selected, check if it's already graded
      if (selectedSubject && overlap.includes(selectedSubject)) {
        const res = student.results.find(r => r.subjectId === selectedSubject);
        if (res && Number(res.marks) > 0) {
          // It's graded! Subtract 1 for display
          setGradedRecordInfo({
            marks: Number(res.marks) - 1,
            isValidated: student.isValidated,
            isUploaded: student.isUploaded
          });
        } else {
          setGradedRecordInfo(null);
        }
      } else {
        setGradedRecordInfo(null);
      }

    } else {
      setDropdownSubjects([]);
      setGradedRecordInfo(null);
    }
  }, [studentId, selectedSubject, allStudentsData, authorizedSubjects]);

  // 4A. Single Upload Logic
  const handleUpload = async () => {
    if (!isProfessor) return setStatus("❌ Unauthorized.");
    if (!studentId || !selectedSubject || marks === "") return alert("Please fill all fields");

    const numericMarks = Number(marks);
    if (numericMarks < 0 || numericMarks > 100) return alert("Marks must be between 0 and 100");

    try {
      setStatus("Processing transaction...");
      await contract.methods.upload(studentId, selectedSubject, numericMarks).send({ from: account });
      
      setStatus(`✅ Marksheet uploaded successfully for ${selectedSubject}!`);
      setStudentId("");
      setMarks("");
      fetchStudentData(); // Refresh everything instantly
    } catch (err) {
      console.error(err.message);
      setStatus("❌ Error uploading marksheet. Ensure you have permissions.");
    }
  };

  // 4B. Batch CSV Upload Logic
  const handleBatchUpload = async () => {
    if (!isProfessor) return setStatus("❌ Unauthorized.");
    if (!csvFile) return alert("Please select a CSV file.");
    if (!batchSubject) return alert("Please select a subject.");

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(row => row.trim()).filter(row => row !== "");
      
      let parsedIds = [];
      let parsedMarks = [];
      let errors = [];

      // Check if row 1 is a header
      let startIndex = isNaN(rows[0].split(',')[0]) ? 1 : 0;

      for (let i = startIndex; i < rows.length; i++) {
        const cols = rows[i].split(',');
        if (cols.length < 2) continue;

        const sId = parseInt(cols[0].trim());
        const m = parseInt(cols[1].trim());

        if (isNaN(sId) || isNaN(m) || m < 0 || m > 100) {
          errors.push(`Row ${i + 1} contains invalid numbers or out-of-range marks.`);
        } else {
          // --- SMART PRE-FILTERING ---
          const student = allStudentsData.find(s => s.studentId.toString() === sId.toString());
          if (student) {
            const res = student.results.find(r => r.subjectId === batchSubject);
            // Only add them if they are enrolled AND currently have 0 marks
            if (res && Number(res.marks) === 0) {
              parsedIds.push(sId);
              parsedMarks.push(m);
            }
          }
        }
      }

      if (errors.length > 0) {
        alert("Found errors in CSV:\n" + errors.join('\n'));
        return;
      }

      if (parsedIds.length === 0) {
        setStatus("⚠️ No valid/pending students found in CSV for this subject.");
        return;
      }

      try {
        setStatus(`Batch processing ${parsedIds.length} students... Please confirm transaction.`);
        await contract.methods.batchUpload(parsedIds, batchSubject, parsedMarks).send({ from: account });
        setStatus(`✅ Successfully uploaded ${parsedIds.length} grades for ${batchSubject}!`);
        setCsvFile(null);
        fetchStudentData();
      } catch (err) {
        console.error(err);
        setStatus("❌ Batch upload failed. Check contract constraints.");
      }
    };
    reader.readAsText(csvFile);
  };

  // Render Helpers
  const isMarksInvalid = marks !== "" && (Number(marks) < 0 || Number(marks) > 100);
  const isUploadDisabled = !isProfessor || isMarksInvalid || !studentId || !selectedSubject || marks === "" || gradedRecordInfo !== null;

  const getSubjectLists = (sub) => {
    const studentsInSub = allStudentsData.filter(s => s.results.some(r => r.subjectId === sub));
    const pending = studentsInSub.filter(s => s.results.some(r => r.subjectId === sub && Number(r.marks) === 0));
    const graded = studentsInSub.filter(s => s.results.some(r => r.subjectId === sub && Number(r.marks) > 0));
    return { pending, graded, total: studentsInSub.length };
  };

  const activeLists = activeSubjectTab ? getSubjectLists(activeSubjectTab) : { pending: [], graded: [], total: 0 };

  return (
    <div className="form-box">
      <h3>Professor Panel</h3>
      
      {/* MANUAL & BATCH INPUT HUD */}
      <div className="upload-form" style={{ padding: "20px" }}>
        <p>Connected as: {account || "Not connected"}</p>
        
        {/* Toggle Mode */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          <button 
            onClick={() => setInputMode("single")}
            style={{ flex: 1, backgroundColor: inputMode === "single" ? "#007bff" : "#6c757d", color: "white", padding: "10px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
          >
            ✏️ Manual Entry
          </button>
          <button 
            onClick={() => setInputMode("batch")}
            style={{ flex: 1, backgroundColor: inputMode === "batch" ? "#28a745" : "#6c757d", color: "white", padding: "10px", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
          >
            📁 Batch CSV Upload
          </button>
        </div>

        {/* SINGLE MODE */}
        {inputMode === "single" && (
          <div>
            <h4>Grade Individual Student</h4>
            <input type="number" placeholder="Enter Student ID" value={studentId} onChange={(e) => setStudentId(e.target.value)} />

            {studentId && dropdownSubjects.length > 0 && (
              <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} style={{ width: "100%", padding: "10px", marginBottom: "10px" }}>
                {dropdownSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            )}

            {studentId && allStudentsData.some(s => s.studentId.toString() === studentId) && dropdownSubjects.length === 0 && (
              <p style={{ color: "#d9534f", fontWeight: "bold" }}>⚠️ Student is not enrolled in any of your authorized subjects.</p>
            )}

            {gradedRecordInfo ? (
              <div style={{ backgroundColor: "#e8f5e9", padding: "10px", borderRadius: "5px", marginBottom: "10px", border: "1px solid #c8e6c9" }}>
                <p style={{ color: "#2e7d32", margin: "0 0 5px 0" }}><strong>✅ Already Graded for {selectedSubject}</strong></p>
                <p style={{ margin: "0" }}><strong>Marks:</strong> {gradedRecordInfo.marks}</p>
              </div>
            ) : (
              dropdownSubjects.length > 0 && (
                <>
                  <input type="number" placeholder="Marks (0 - 100)" value={marks} onChange={(e) => setMarks(e.target.value)} style={{ borderColor: isMarksInvalid ? "red" : "" }} />
                  {isMarksInvalid && <p style={{ color: "red", fontSize: "0.85em", marginTop: "-5px" }}>⚠️ Marks must be between 0 and 100.</p>}
                </>
              )
            )}

            <button onClick={handleUpload} disabled={isUploadDisabled} style={{ backgroundColor: isUploadDisabled ? "#ccc" : "#007bff", cursor: isUploadDisabled ? "not-allowed" : "pointer", marginTop: "10px" }}>
              {gradedRecordInfo ? "Record Locked" : "Upload Marksheet"}
            </button>
          </div>
        )}

        {/* BATCH MODE */}
        {inputMode === "batch" && (
          <div style={{ backgroundColor: "#f8f9fa", padding: "15px", border: "1px dashed #ccc", borderRadius: "5px" }}>
            <h4 style={{ marginTop: 0 }}>Upload Class Roster Grades</h4>
            
            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", fontSize: "0.9em" }}>1. Select Subject</label>
            <select value={batchSubject} onChange={(e) => setBatchSubject(e.target.value)} style={{ width: "100%", padding: "10px", marginBottom: "15px" }}>
              {authorizedSubjects.length === 0 ? <option value="">No subjects assigned</option> : authorizedSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
            </select>

            <label style={{ display: "block", marginBottom: "5px", fontWeight: "bold", fontSize: "0.9em" }}>2. Select CSV File (Format: ID, Marks)</label>
            <input type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files[0])} style={{ marginBottom: "15px" }} />

            <button onClick={handleBatchUpload} disabled={!batchSubject || !csvFile || !isProfessor} style={{ backgroundColor: (!batchSubject || !csvFile) ? "#ccc" : "#28a745", cursor: (!batchSubject || !csvFile) ? "not-allowed" : "pointer" }}>
              Run Batch Upload
            </button>
            <p style={{ fontSize: "0.85em", color: "#666", marginTop: "10px" }}>
              <em>Note: The system will automatically skip students who are already graded or not enrolled.</em>
            </p>
          </div>
        )}

        {!isProfessor && <p style={{ color: "red", marginTop: "10px" }}>Only a professor can upload marksheets.</p>}
        <p className="status-message" style={{ marginTop: "10px", fontWeight: "bold" }}>{status}</p>
      </div>

      <hr />

      {/* SUBJECT ACTION TABS */}
      {authorizedSubjects.length > 0 ? (
        <div className="list-box">
          <h4>Your Teaching Load</h4>
          
          {/* Tab Buttons */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px" }}>
            {authorizedSubjects.map(sub => {
              const { graded, total } = getSubjectLists(sub);
              const isComplete = graded.length === total && total > 0;
              return (
                <button
                  key={sub}
                  onClick={() => {
                    setActiveSubjectTab(sub);
                    setBatchSubject(sub); // Sync batch subject with clicked tab
                  }}
                  style={{
                    backgroundColor: activeSubjectTab === sub ? "#007bff" : "#f1f1f1",
                    color: activeSubjectTab === sub ? "white" : "#333",
                    border: activeSubjectTab === sub ? "none" : "1px solid #ccc",
                    padding: "10px 15px",
                    borderRadius: "5px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center"
                  }}
                >
                  <strong style={{ fontSize: "1.1em" }}>{sub}</strong>
                  <span style={{ fontSize: "0.85em", color: activeSubjectTab === sub ? "white" : (isComplete ? "#28a745" : "#dc3545"), fontWeight: "bold" }}>
                    {graded.length}/{total} Graded
                  </span>
                </button>
              );
            })}
          </div>

          {/* ACTIVE SUBJECT LISTS */}
          {activeSubjectTab && (
            <div style={{ border: "2px solid #007bff", padding: "15px", borderRadius: "8px" }}>
              <h4 style={{ color: "#007bff", marginTop: 0 }}>Class Roster: {activeSubjectTab}</h4>
              
              {/* Pending Table */}
              <h5 style={{ color: "#dc3545" }}>⏳ Pending Grading ({activeLists.pending.length})</h5>
              <table className="uploaded-students-table" style={{ marginBottom: "20px" }}>
                <thead><tr><th>Student ID</th><th>Action</th></tr></thead>
                <tbody>
                  {activeLists.pending.length > 0 ? (
                    activeLists.pending.map((s, index) => (
                      <tr key={index}>
                        <td>{s.studentId.toString()}</td>
                        <td>
                          <button 
                            onClick={() => {
                              setInputMode("single");
                              setStudentId(s.studentId.toString());
                              setSelectedSubject(activeSubjectTab);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            style={{ padding: "5px 10px", backgroundColor: "#ffc107", color: "#333", border: "none" }}
                          >
                            Grade Manually
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="2">All students graded for {activeSubjectTab}</td></tr>
                  )}
                </tbody>
              </table>

              {/* Graded Table */}
              <h5 style={{ color: "#28a745" }}>✅ Successfully Graded ({activeLists.graded.length})</h5>
              <table className="uploaded-students-table">
                <thead><tr><th>Student ID</th><th>Marks</th></tr></thead>
                <tbody>
                  {activeLists.graded.length > 0 ? (
                    activeLists.graded.map((s, index) => {
                      const result = s.results.find(r => r.subjectId === activeSubjectTab);
                      return (
                        <tr key={index}>
                          <td>{s.studentId.toString()}</td>
                          {/* Blockchain returns marks+1, so we subtract 1 for the UI */}
                          <td>{Number(result.marks) - 1}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr><td colSpan="2">No grades uploaded yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="list-box">
          <p>You are not currently assigned to grade any subjects. Please contact the Dean.</p>
        </div>
      )}
    </div>
  );
};

export default Professor;